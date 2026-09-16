import * as THREE from 'three';

/**
 * 胶卷带仿真：鼠标「拉出」胶卷（pointermove 驱动，无滚轮）。
 *
 * 三状态：
 * 1. 收纳：全部胶片卷在卷轴里（outLength=0，无卡片可见）；
 * 2. 拉出/展开：光标移动 = 手捏胶片末端向外拉——胶片只出不进，
 *    前端（自由端）追随光标轨迹，后端经链式弹簧延迟跟随，
 *    形成连续、柔软、有惯性的胶片曲线；
 * 3. 停留展示：光标停 → 仿真阻尼耗散 → 胶片固定保持当前形态。
 *
 * 收卷（requestRewind）：沿原展开路径反向回收，尾端匀速滑回卷轴，
 * 帧依次卷入（先快后慢，保留惯性），outLength 归零后完全收纳。
 *
 * 稳定性：每段是独立阻尼弹簧，目标为「前一采样旧位置 + 定长方向」
 * （帧级快照、前馈耦合），加邻速阻尼抑制链上共振放大，
 * 固定 1/240s 子步积分 + 失稳自动复位——任何帧率下不会发散。
 */
export const CARD_PITCH = 2.42; // 帧距（卡高 2.32 + 0.1 窄缝）
export const START_ARC = 1.35; // 胶片卷出口到第一帧的弧长
const ROW_GAP = 2.6;
const X_MAX = 8.2;
const CHAIN_K = 80;
const DAMP = 4;
const COUPLE_DAMP = 32; // 邻速阻尼（低于 ~32 链上共振会放大发散）
const SUBSTEP = 1 / 240;
const REWIND_RATE = 2.0; // 收卷衰减系数（先快后慢）
const REWIND_MIN = 3.0; // 收卷保底速度（单位/秒）

/** 全局胶片控制状态（HUD 读数 / 收卷请求桥接） */
export const filmControl = {
  outLength: 0, // 已拉出长度（弧长）
  total: 0, // 胶片总长
  rewinding: false,
  rewindRequested: false,
};

/** 一键收回胶卷（HUD 倒卷按钮调用） */
export function requestRewind() {
  filmControl.rewindRequested = true;
}

/** 已拉出可见的帧数 */
export function framesOut(out: number, cardCount: number): number {
  return Math.max(0, Math.min(cardCount, Math.floor((out - START_ARC) / CARD_PITCH) + 1));
}

const _tgt = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _bt2 = new THREE.Vector3();

export class FilmStripPath {
  readonly ds: number;
  readonly total: number;
  readonly sampleCount: number;
  /** 卷轴出口方向（胶片吐出方向，兜底方向用） */
  readonly tan0: THREE.Vector3;

  private base: THREE.Vector3[] = [];
  private phase: number[] = [];
  private vel: THREE.Vector3[] = [];
  private snap: THREE.Vector3[] = [];
  private vsnap: THREE.Vector3[] = [];
  /** 实时位置（直接读取） */
  readonly pos: THREE.Vector3[] = [];
  /** 弹簧追随后的光标（带惯性） */
  private cur = new THREE.Vector3();
  private out = 0;
  private rewinding = false;
  private lastX = 0;
  private lastZ = 0;
  private lastK = 0;

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
        const wob = Math.sin(s * 1.6 + z * 0.55) * 0.5 + (Math.random() - 0.5) * 0.8;
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

    // —— 2. 等弧长重采样 ——
    this.ds = pitch / 4;
    const m = Math.ceil(totalLen / this.ds) + 1;
    for (let i = 0; i < m; i++) {
      const u = Math.min(1, (i * this.ds) / totalLen);
      const p = curve.getPointAt(u);
      this.base.push(p);
      this.phase.push(Math.random() * Math.PI * 2);
      this.pos.push(p.clone());
      this.vel.push(new THREE.Vector3());
      this.snap.push(p.clone());
      this.vsnap.push(new THREE.Vector3());
    }
    // 居中
    const box = new THREE.Box3().setFromPoints(this.base);
    const c = box.getCenter(new THREE.Vector3());
    for (let i = 0; i < m; i++) {
      this.base[i].x -= c.x;
      this.base[i].z -= c.z;
    }
    this.total = totalLen;
    this.sampleCount = m;
    filmControl.total = totalLen;

    // 出口方向
    const a = this.base[0];
    const b = this.base[Math.min(m - 1, 4)];
    this.tan0 = b.clone().sub(a).setY(0).normalize();

    // 初始：全部收纳（ parked 在卷轴出口的小线圈上，不可见）
    this.lastX = 0;
    this.lastZ = 0;
    this.parkAll();
    this.cur.copy(this.base[0]);
  }

  /** 全部样本 parked 到卷轴出口线圈（收纳形态） */
  private parkAll() {
    const c = this.base[0];
    for (let i = 1; i < this.sampleCount; i++) {
      const th = i * 0.6;
      this.pos[i].set(c.x + this.tan0.x * 0.28 + Math.cos(th) * 0.1, 0.08 + (i % 5) * 0.012, c.z + this.tan0.z * 0.28 + Math.sin(th) * 0.1);
      this.vel[i].set(0, 0, 0);
    }
    this.lastK = 0;
  }

  /** 第 i 帧对应的采样下标 */
  cardIndex(i: number): number {
    return Math.min(this.sampleCount - 2, Math.round((START_ARC + i * CARD_PITCH) / this.ds));
  }

  /**
   * 每帧仿真。
   * @param t      时钟（秒）
   * @param cursor 光标在工作台面上的世界坐标
   * @param engage 光标活跃度 0..1
   * @param dt     帧间隔（秒，调用方截断到 ≤0.05）
   */
  update(t: number, cursor: THREE.Vector3, engage: number, dt: number) {
    const n = this.sampleCount;

    // —— 状态机：收卷请求 / 收卷中 / 拉出 ——
    if (filmControl.rewindRequested) {
      filmControl.rewindRequested = false;
      this.rewinding = true;
    }
    // 光标弹簧（惯性 + 延迟）
    const ck = Math.min(1, dt * 9);
    this.cur.x += (cursor.x - this.cur.x) * ck;
    this.cur.z += (cursor.z - this.cur.z) * ck;

    // 收卷：长度先快后慢衰减（保留惯性），归零即完全收纳
    if (this.rewinding) {
      const rate = Math.max(this.out * REWIND_RATE, REWIND_MIN);
      this.out = Math.max(0, this.out - rate * dt);
      if (this.out <= 0) {
        this.rewinding = false;
        this.parkAll();
      }
    } else {
      // 拉出：按「胶片末端实际走过的路径」喂片（不是光标路径——光标会抄近道）
      const travel = Math.hypot(this.cur.x - this.lastX, this.cur.z - this.lastZ);
      if (engage > 0.02 && travel > 1e-4) {
        this.out = Math.min(this.total, this.out + travel);
      }
    }
    this.lastX = this.cur.x;
    this.lastZ = this.cur.z;
    filmControl.outLength = this.out;
    filmControl.rewinding = this.rewinding;

    // 活动 tip：浮点索引（tipFloat = out / ds）
    const tipFloat = this.out / this.ds;
    const k = Math.max(0, Math.min(n - 1, Math.floor(tipFloat)));
    const frac = Math.max(0, Math.min(1, tipFloat - k));

    // 帧级快照（前馈耦合——稳定性关键）
    for (let i = 0; i < n; i++) {
      this.snap[i].copy(this.pos[i]);
      this.vsnap[i].copy(this.vel[i]);
    }

    // tip 目标（先算好，供“冒头”初始化使用）
    const lift = (0.55 + 0.22 * Math.sin(t * 1.7)) * engage + 0.05;
    if (this.rewinding || this.out <= 0) {
      // 收卷/收纳：沿冻结曲线按 out 插值，尾端滑回原路
      const ka = Math.min(n - 2, k);
      _tip.copy(this.snap[ka]).lerp(this.snap[ka + 1], frac);
    } else {
      _tip.set(this.cur.x, lift, this.cur.z);
    }

    // 新激活的样本（拉出越界）：从卷轴口“冒”到链上目标位
    if (k > this.lastK) {
      for (let i = this.lastK + 1; i <= k && i < n; i++) {
        this.ftlTarget(i, k);
        this.pos[i].copy(_tgt);
        this.vel[i].set(0, 0, 0);
      }
    }
    this.lastK = k;

    const steps = Math.max(1, Math.min(16, Math.ceil(dt / SUBSTEP)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) this.step(k, h);

    // 失稳保险
    const probe = this.pos[Math.min(n - 1, k + 1)];
    if (!Number.isFinite(probe.x + probe.y + probe.z) || Math.abs(probe.x) + Math.abs(probe.z) > 500) {
      this.out = 0;
      this.rewinding = false;
      this.parkAll();
      this.cur.copy(this.base[0]);
    }
  }

  /** 定长跟随目标：snap[i+1] + ds·dir（dir = 当前局部方向，形状记忆） */
  private ftlTarget(i: number, k: number) {
    if (i >= k) {
      // tip 本身
      _tgt.copy(_tip);
      return;
    }
    _dir.copy(this.snap[i]).sub(this.snap[i + 1]);
    const len = _dir.length();
    if (len < 1e-4) {
      _dir.copy(this.tan0);
    } else {
      _dir.multiplyScalar(1 / len);
    }
    _tgt.copy(this.snap[i + 1]).addScaledVector(_dir, this.ds);
    // 贴台微高（除 tip 外不主动抬升）
    if (_tgt.y < 0.04) _tgt.y = 0.04 + Math.sin(this.phase[i] + i * 0.7) * 0.012;
  }

  private step(k: number, dt: number) {
    const n = this.sampleCount;
    // 只活动到 tip（k）；k+1.. 冻结——收卷时它们保存原曲线位置供尾端沿原路滑回
    for (let i = Math.min(n - 1, k); i >= 1; i--) {
      const p = this.pos[i];
      const v = this.vel[i];
      this.ftlTarget(i, k);
      const vnx = i < n - 1 ? this.vsnap[i + 1].x : v.x;
      const vny = i < n - 1 ? this.vsnap[i + 1].y : v.y;
      const vnz = i < n - 1 ? this.vsnap[i + 1].z : v.z;
      v.x += ((_tgt.x - p.x) * CHAIN_K - v.x * DAMP - (v.x - vnx) * COUPLE_DAMP) * dt;
      v.y += ((_tgt.y - p.y) * CHAIN_K - v.y * DAMP - (v.y - vny) * COUPLE_DAMP) * dt;
      v.z += ((_tgt.z - p.z) * CHAIN_K - v.z * DAMP - (v.z - vnz) * COUPLE_DAMP) * dt;
      p.x += v.x * dt;
      p.y += v.y * dt;
      p.z += v.z * dt;
    }
    // 第 0 段锚定在卷轴出口
    this.pos[0].copy(this.base[0]);
    this.vel[0].set(0, 0, 0);
  }

  /** 采样点 i 处的实时切线（写入 out） */
  tangentAt(i: number, out: THREE.Vector3): THREE.Vector3 {
    const n = this.sampleCount;
    const a = this.pos[Math.max(0, i - 1)];
    const b = this.pos[Math.min(n - 1, i + 1)];
    return out.copy(b).sub(a).setY(0).normalize();
  }
}

/** 由切线 + 侧倾角计算平躺卡片的姿态（长轴贴切线，法线朝上） */
const _flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const _yaw = new THREE.Quaternion();
const _roll = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);

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
