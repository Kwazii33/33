import * as THREE from 'three';

/**
 * 胶卷带路径：追加式永久路径（append-only persistent path）。
 *
 * 核心设计（对应交互规范）：
 *  - 胶片展开 = 记录历史：每次鼠标移动只在路径末端「追加」新节点（间隔 ds），
 *    已生成的节点永久固定，永不重算——不存在整条路径每帧重算、被鼠标牵引、
 *    随时间变直的问题。
 *  - 无弹簧/无 PBD/无子步积分：仿真每帧只做 O(新增节点) 的追加，零卡顿来源。
 *  - 路径节点等距（ds），弧长 = (rec-1)·ds；画格位置由弧长公式决定，严格一致。
 *
 * 状态机（filmControl.mode）：
 *  - idle：      收纳。只有卷轴与片头。
 *  - drawing：   展开。点击胶卷头进入；片头以 CHASE 轻微惯性追随光标，
 *               移动超过 ds 即追加节点；已有节点不受影响。
 *  - locked：    冻结。松开/点击确认；片头与整条路径固定，鼠标不再影响任何已有节点。
 *  - rewinding： 倒卷。固定 2.2s ease-in-out，沿已记录路径反向回收（缩短渲染弧长），
 *               归零回 idle。
 *
 * 空间约束：路径节点全部 y=0.05，严格二维平面（X/Y 自由、无 Z 起伏）。
 * 胶片起点唯一：前 ANCHOR_SAMPLES 个节点永久钉在卷轴切向出口线上。
 */
export const CARD_PITCH = 2.42; // 帧距（画格长 2.22 + 0.2 间隔）
export const START_ARC = 1.35; // 胶片卷出口到第一帧的弧长
const ROW_GAP = 2.6;
const X_MAX = 8.2;
const ANCHOR_SAMPLES = 3; // 出口锚定段数（固定在卷轴切向出口线上）
const CHASE_RATE = 14; // 片头追随速率（1/s）——时间常数 ≈70ms，轻微惯性几乎无感
const REWIND_DURATION = 2.2; // 倒卷固定时长（秒）——ease-in-out 整体回收

export type FilmMode = 'idle' | 'drawing' | 'locked' | 'rewinding';

/** 全局胶片控制状态（HUD 读数 / 交互桥接） */
export const filmControl = {
  outLength: 0, // 已拉出长度（弧长）
  total: 0, // 胶片总长
  rewinding: false,
  rewindRequested: false,
  rewindU: 0, // 倒卷纹理滚动（0..~1），画格向卷轴流动
  mode: 'idle' as FilmMode,
};

/** 一键收回胶卷（HUD 倒卷按钮调用） */
export function requestRewind() {
  if (filmControl.mode === 'idle' || filmControl.mode === 'rewinding') return;
  filmControl.rewindRequested = true;
}

/** 已拉出可见的帧数 */
export function framesOut(out: number, cardCount: number): number {
  return Math.max(0, Math.min(cardCount, Math.floor((out - START_ARC) / CARD_PITCH) + 1));
}

/**
 * 统一 hover 显影状态：value = 邻近度 0..1（DarkroomScene 写），
 * x/z = 光标世界坐标（局部显影中心）。统一逻辑覆盖胶卷头、胶片主体、所有画格。
 */
export const filmGlow = { value: 0, x: 999, z: 999 };

/** 确定性伪随机（同一 i 每次加载结果一致，避免卷轴出口方向随机漂移） */
function hash01(i: number, salt: number): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class FilmStripPath {
  readonly ds: number;
  readonly total: number;
  readonly sampleCount: number;
  /** 胶片终点（可拉出的最大弧长 = 最后一帧末端） */
  readonly maxOut: number;
  /** 卷轴出口方向（胶片吐出方向，兜底方向用） */
  readonly tan0: THREE.Vector3;

  /**
   * 路径节点（追加式，永久固定）：
   * pos[0..rec-1] 为已记录的有效节点；pos[rec..] 为预分配占位（不读）。
   */
  readonly pos: THREE.Vector3[] = [];
  /** 已记录节点数 */
  private rec = 0;
  /** 片头实时位置（drawing 时追随光标，带轻微惯性） */
  private cur = new THREE.Vector3();
  /** 锁定时的片头位置（locked 冻结） */
  private lockedTip = new THREE.Vector3();
  /** 已拉出弧长 = max(0, rec-1)·ds */
  private out = 0;
  /** 倒卷进度 0..1（固定时长 ease-in-out） */
  private rewindT = 0;
  /** 倒卷起始弧长 */
  private revFrom = 0;
  /** 路径节点数上限（由 maxOut / ds 决定） */
  private readonly maxRec: number;

  constructor(cardCount: number, pitch: number) {
    // —— 1. 蛇形参考线（仅用于等弧长采样与出口定位，不再是静止形态） ——
    const pts: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0)];
    let z = 0;
    let dir = 1;
    const need = START_ARC + cardCount * pitch + 10;
    let len = 0;
    let guard = 0;
    while (len < need * 1.15 && guard++ < 12) {
      const segs = 5;
      const x0 = dir > 0 ? 0 : X_MAX;
      for (let s = 1; s <= segs; s++) {
        const x = x0 + dir * (X_MAX / segs) * s;
        const wob = Math.sin(s * 1.6 + z * 0.55) * 0.5 + (hash01(s * 7 + z * 13, 1) - 0.5) * 0.8;
        pts.push(new THREE.Vector3(x, 0, z + wob));
      }
      const r = ROW_GAP / 2;
      const cz = z + ROW_GAP / 2;
      for (const th of [-Math.PI / 6, Math.PI / 6]) {
        pts.push(new THREE.Vector3(X_MAX + Math.cos(th) * r * 0.9, 0, cz + Math.sin(th) * r));
      }
      z += ROW_GAP;
      dir *= -1;
      len += X_MAX + Math.PI * r;
    }
    const tailDir = new THREE.Vector3(dir, 0, 0.18).normalize();
    const last = pts[pts.length - 1];
    for (let i = 1; i <= 6; i++) pts.push(last.clone().addScaledVector(tailDir, i * 1.7));

    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
    const totalLen = curve.getLength();

    // —— 2. 等弧长重采样（预分配节点数组；节点内容运行时追加写入） ——
    this.ds = pitch / 4;
    const m = Math.ceil(totalLen / this.ds) + 1;
    for (let i = 0; i < m; i++) {
      const u = Math.min(1, (i * this.ds) / totalLen);
      const p = curve.getPointAt(u);
      this.pos.push(new THREE.Vector3(p.x, 0.05, p.z));
    }
    // 居中
    const box = new THREE.Box3().setFromPoints(this.pos);
    const c = box.getCenter(new THREE.Vector3());
    for (let i = 0; i < m; i++) {
      this.pos[i].x -= c.x;
      this.pos[i].z -= c.z;
    }
    this.total = totalLen;
    this.sampleCount = m;
    // 胶片终点 = 最后一帧末端（+半帧余量）：拉到头即终点，不再无限生成
    this.maxOut = START_ARC + cardCount * pitch + 0.4;
    this.maxRec = Math.min(m, Math.floor(this.maxOut / this.ds) + 1);
    filmControl.total = this.maxOut;

    // 出口方向
    const a = this.pos[0];
    const b = this.pos[Math.min(m - 1, 4)];
    this.tan0 = b.clone().sub(a).setY(0).normalize();

    this.cur.copy(this.pos[0]);
  }

  // ———— 状态切换（由场景中的点击调用） ————

  /** 出口锚定段：pos[0..a] 钉在卷轴切向出口线（胶片只从单一方向吐出） */
  private pinAnchor() {
    for (let i = 0; i <= ANCHOR_SAMPLES && i < this.sampleCount; i++) {
      this.pos[i].set(
        this.pos[0].x + this.tan0.x * i * this.ds,
        0.05,
        this.pos[0].z + this.tan0.z * i * this.ds,
      );
    }
  }

  /** 点击胶卷头：idle→drawing（重置路径，从卷轴口开始记录），locked→drawing（续拉，保留已有路径） */
  startDrawing(): boolean {
    if (filmControl.mode === 'idle' || filmControl.mode === 'locked') {
      if (filmControl.mode === 'idle') {
        // 从卷轴出发：清空历史，钉好出口锚定段，片头置于锚定段末端
        this.pinAnchor();
        this.rec = ANCHOR_SAMPLES + 1;
        this.cur.copy(this.pos[ANCHOR_SAMPLES]);
        this.out = (this.rec - 1) * this.ds;
      } else {
        // 续拉：已有路径永久保留，片头从锁定位置继续
        this.cur.copy(this.lockedTip);
      }
      filmControl.mode = 'drawing';
      return true;
    }
    return false;
  }

  /** 点击确认位置：drawing→locked（片头与整条路径冻结） */
  lock(): boolean {
    if (filmControl.mode !== 'drawing') return false;
    filmControl.mode = 'locked';
    this.lockedTip.copy(this.cur).setY(0.05);
    return true;
  }

  /**
   * 追加路径节点：片头移动超过 ds 即在末端追加一个等距节点。
   * 已有节点永不修改——这是「轨迹固化」的核心。
   */
  private appendPoints() {
    while (this.rec < this.maxRec) {
      const last = this.pos[this.rec - 1];
      const dx = this.cur.x - last.x;
      const dz = this.cur.z - last.z;
      const d = Math.hypot(dx, dz);
      if (d < this.ds) break;
      const p = this.pos[this.rec];
      p.set(last.x + (dx / d) * this.ds, 0.05, last.z + (dz / d) * this.ds);
      this.rec++;
    }
  }

  /**
   * 每帧仿真。
   * @param _t     时钟（秒，保留作未来时变驱动）
   * @param cursor 光标在工作台面上的世界坐标
   * @param engage 光标活跃度 0..1
   * @param dt     帧间隔（秒，调用方截断到 ≤0.05）
   */
  update(_t: number, cursor: THREE.Vector3, engage: number, dt: number) {
    const mode = filmControl.mode;

    // —— 收卷请求（任意非 idle 状态可发起） ——
    if (filmControl.rewindRequested) {
      filmControl.rewindRequested = false;
      filmControl.mode = 'rewinding';
      this.rewindT = 0;
      this.revFrom = this.out;
    }
    const rewinding = filmControl.mode === 'rewinding';

    if (mode === 'drawing') {
      // 片头追随光标（CHASE 轻微惯性 ≈70ms）；已有路径节点不受影响
      if (Number.isFinite(cursor.x + cursor.z)) {
        const k = Math.min(1, dt * CHASE_RATE);
        this.cur.x += (cursor.x - this.cur.x) * k;
        this.cur.z += (cursor.z - this.cur.z) * k;
        this.cur.y = 0.05;
      }
      // 展开：只追加新节点（增量），不触碰历史
      if (engage > 0.02) this.appendPoints();
      this.out = Math.max(0, this.rec - 1) * this.ds;
    } else if (rewinding) {
      // —— 倒卷：固定 2.2s ease-in-out 整体回缩 ——
      // 路径历史保持不动，仅缩短渲染弧长；片尾沿已记录路径连续后退，
      // 画格向卷轴流动由纹理偏移表达（FilmStrip 消费 rewindU）。
      this.rewindT = Math.min(1, this.rewindT + dt / REWIND_DURATION);
      const t = this.rewindT;
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.out = this.revFrom * (1 - eased);
      if (t >= 1) {
        // 收净：回到 idle，清空历史
        this.out = 0;
        this.rec = 0;
        filmControl.mode = 'idle';
      }
    }
    // locked / idle：什么都不做——路径与片头保持冻结（鼠标无影响）

    filmControl.outLength = this.out;
    filmControl.rewinding = rewinding;
    // 倒卷纹理偏移：画格向卷轴流动的滚动量（FilmStrip 写入贴图 offset）
    filmControl.rewindU = rewinding && this.revFrom > 0 ? Math.max(0, this.revFrom - this.out) / this.maxOut : 0;
  }

  /** 已记录节点数（渲染层可读，用于边界钳制） */
  get recorded(): number {
    return this.rec;
  }

  /** 第 i 帧对应的采样下标 */
  cardIndex(i: number): number {
    return Math.min(this.sampleCount - 2, Math.round((START_ARC + i * CARD_PITCH) / this.ds));
  }

  /** 第 i 帧中心弧长 */
  cardArc(i: number): number {
    return START_ARC + i * CARD_PITCH + CARD_PITCH / 2;
  }

  /** 采样点 i 处的实时切线（写入 out）；钳制在已记录范围内 */
  tangentAt(i: number, out: THREE.Vector3): THREE.Vector3 {
    const hi = Math.max(0, this.rec - 1);
    const a = this.pos[Math.max(0, Math.min(i - 1, hi))];
    const b = this.pos[Math.min(hi, i + 1)];
    return out.copy(b).sub(a).setY(0).normalize();
  }
}

/** 由切线 + 侧倾角计算平躺胶片的姿态（长轴贴切线，法线朝上） */
const _flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const _yaw = new THREE.Quaternion();
const _roll = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);
const _bt2 = new THREE.Vector3();

export function cardQuaternion(tan: THREE.Vector3, bank: number, out: THREE.Quaternion): THREE.Quaternion {
  _yaw.setFromAxisAngle(_Y, Math.atan2(tan.x, tan.z));
  _roll.setFromAxisAngle(_Z, bank);
  return out.copy(_yaw).multiply(_flat).multiply(_roll);
}

/** 侧倾：当前切线相对「曲线前方更早切线」的偏转角（沿当前曲线） */
export function bankAngle(path: FilmStripPath, i: number, tan: THREE.Vector3): number {
  path.tangentAt(Math.max(0, i - 3), _bt2);
  const cross = _bt2.x * tan.z - _bt2.z * tan.x;
  const dot = _bt2.x * tan.x + _bt2.z * tan.z;
  return Math.max(-0.7, Math.min(0.7, Math.atan2(cross, dot) * 1.1));
}
