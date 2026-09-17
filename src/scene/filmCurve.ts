import * as THREE from 'three';

/**
 * 胶卷带仿真：状态机 + 链式弹簧。
 *
 * 状态（filmControl.mode）：
 *  - idle：      收纳。只有卷轴和片头，鼠标移动不影响胶片。
 *  - drawing：   拉出。点击胶卷头进入；光标移动 = 手捏片头向外拉，
 *               前端追随光标轨迹，后端链式弹簧延迟跟随，形成柔软惯性曲线。
 *               同时把片头轨迹记录进 trail（供倒卷原路返回）。
 *  - locked：    定型。左键点击确认；片头冻结在当前位置，鼠标不再影响胶片。
 *  - rewinding： 倒卷。整条胶片保持锁定形状，固定 2.2s ease-in-out 沿原路径
 *               整体滑回卷轴（片尾沿 trail 反向后退、画格向卷轴流动由纹理偏移表达），
 *               归零后回到 idle。
 *
 * 稳定性：每段独立阻尼弹簧 + 帧级快照前馈耦合 + 邻速阻尼，
 * 固定 1/240s 子步积分 + 失稳自动复位——任何帧率下不会发散。
 */
export const CARD_PITCH = 2.42; // 帧距（画格长 2.22 + 0.2 间隔）
export const START_ARC = 1.35; // 胶片卷出口到第一帧的弧长
const ROW_GAP = 2.6;
const X_MAX = 8.2;
const CHAIN_K = 80;
const DAMP = 4;
const COUPLE_DAMP = 32; // 邻速阻尼（低于 ~32 链上共振会放大发散）
const SUBSTEP = 1 / 240;
const ANCHOR_SAMPLES = 3; // 出口锚定段数（固定在卷轴切向出口线上）
const ANCHOR_BLEND_END = ANCHOR_SAMPLES + 6; // 冻结态「朝卷轴侧」约束的覆盖末端
const TRAIL_MIN_DIST = 0.07; // 轨迹记录最小间距
const REWIND_DURATION = 2.2; // 倒卷固定时长（秒）——ease-in-out 整体回缩，均匀无卡顿无逐帧跳动
const CHASE_RATE = 14; // 胶卷头追随速率（1/s）——时间常数 ≈70ms，轻微惯性几乎无感，光标一动立即响应

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
 * 胶片 hover 发光 0..1：DarkroomScene 每帧按「光标到卷轴/胶片主体最近距离」驱动，
 * FilmStrip 消费（emissiveIntensity 基值 + glow·增益）。统一逻辑覆盖胶卷头、
 * 胶片主体、所有画格。
 */
/** 统一 hover 显影状态：value = 邻近度 0..1（DarkroomScene 写），x/z = 光标世界坐标（局部显影中心） */
export const filmGlow = { value: 0, x: 999, z: 999 };

const _tgt = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _bt2 = new THREE.Vector3();
const _pin = new THREE.Vector3();

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

  private base: THREE.Vector3[] = [];
  private vel: THREE.Vector3[] = [];
  private snap: THREE.Vector3[] = [];
  private vsnap: THREE.Vector3[] = [];
  /** 实时位置（直接读取） */
  readonly pos: THREE.Vector3[] = [];
  /** 胶卷头残余速度（锁定/倒卷时衰减，仅失稳探针记录用；跟随已由 CHASE 直接追踪替代） */
  private hv = new THREE.Vector3();
  /** 弹簧追随后的光标（带惯性） */
  private cur = new THREE.Vector3();
  private out = 0;
  private lastX = 0;
  private lastZ = 0;
  private lastK = 0;
  /** 片头轨迹（drawing 时记录，rewinding 时反向播放） */
  private trail: THREE.Vector3[] = [];
  /** 倒卷播放游标（trail 反向走过的长度，保留作 tip 目标的兜底路径） */
  private rewindWalked = 0;
  /** 倒卷进度 0..1（固定时长 ease-in-out） */
  private rewindT = 0;
  /** 倒卷起始时的整条冻结形状快照（刚性原路滑回用） */
  private revSnap: THREE.Vector3[] = [];
  /** 倒卷起始 out（滑回位移 = revFrom - out） */
  private revFrom = 0;
  /** 锁定时的片头位置（locked 态冻结） */
  private lockedTip = new THREE.Vector3();
  /** 冻结态 PBD 强度斜坡（0..1，锁定后 0.6s 内逐步生效，避免硬跳） */
  private freezeBlend = 0;
  /** PBD 弛豫前的原始位置存档（alpha 斜坡插值用） */
  private _pbdOrig: THREE.Vector3[] = [];

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

    // —— 2. 等弧长重采样 ——
    this.ds = pitch / 4;
    const m = Math.ceil(totalLen / this.ds) + 1;
    for (let i = 0; i < m; i++) {
      const u = Math.min(1, (i * this.ds) / totalLen);
      const p = curve.getPointAt(u);
      this.base.push(p);
      this.pos.push(p.clone());
      this.vel.push(new THREE.Vector3());
      this.snap.push(p.clone());
      this.vsnap.push(new THREE.Vector3());
      this._pbdOrig.push(new THREE.Vector3());
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
    // 胶片终点 = 最后一帧末端（+半帧余量）：拉到头即终点，不再无限生成
    this.maxOut = START_ARC + cardCount * pitch + 0.4;
    filmControl.total = this.maxOut;

    // 出口方向
    const a = this.base[0];
    const b = this.base[Math.min(m - 1, 4)];
    this.tan0 = b.clone().sub(a).setY(0).normalize();

    // 初始：收纳（idle）
    this.lastX = 0;
    this.lastZ = 0;
    this.parkAll();
    this.cur.copy(this.base[0]);
  }

  // ———— 状态切换（由场景中的点击调用） ————

  /** 点击胶卷头：idle→drawing，locked→drawing（继续拉） */
  startDrawing(): boolean {
    if (filmControl.mode === 'idle' || filmControl.mode === 'locked') {
      if (filmControl.mode === 'idle' && this.out <= 0) {
        // 从卷轴出发：片头从卷轴口开始记录
        this.trail.length = 0;
        this.trail.push(this.base[0].clone().setY(0.05));
        this.cur.copy(this.base[0]);
        this.lastX = this.cur.x;
        this.lastZ = this.cur.z;
      }
      filmControl.mode = 'drawing';
      return true;
    }
    return false;
  }

  /** 点击确认位置：drawing→locked（片头冻结） */
  lock(): boolean {
    if (filmControl.mode !== 'drawing') return false;
    filmControl.mode = 'locked';
    this.lockedTip.copy(this.cur).setY(0.05);
    return true;
  }

  /** 全部样本 parked 到卷轴出口线圈（收纳形态） */
  private parkAll() {
    const c = this.base[0];
    for (let i = 1; i < this.sampleCount; i++) {
      const th = i * 0.6;
      this.pos[i].set(c.x + this.tan0.x * 0.28 + Math.cos(th) * 0.1, 0.05, c.z + this.tan0.z * 0.28 + Math.sin(th) * 0.1);
      this.vel[i].set(0, 0, 0);
    }
    this.lastK = 0;
  }

  /** 第 i 帧对应的采样下标 */
  cardIndex(i: number): number {
    return Math.min(this.sampleCount - 2, Math.round((START_ARC + i * CARD_PITCH) / this.ds));
  }

  /** 第 i 帧中心弧长 */
  cardArc(i: number): number {
    return START_ARC + i * CARD_PITCH + CARD_PITCH / 2;
  }

  /**
   * 每帧仿真。
   * @param _t     时钟（秒，保留作未来时变驱动）
   * @param cursor 光标在工作台面上的世界坐标
   * @param engage 光标活跃度 0..1
   * @param dt     帧间隔（秒，调用方截断到 ≤0.05）
   */
  update(_t: number, cursor: THREE.Vector3, engage: number, dt: number) {
    const n = this.sampleCount;
    const mode = filmControl.mode;

    // —— 收卷请求（任意非 idle 状态可发起） ——
    if (filmControl.rewindRequested) {
      filmControl.rewindRequested = false;
      filmControl.mode = 'rewinding';
      this.rewindWalked = 0;
      this.rewindT = 0;
      // 快照锁定形状：倒卷 = 整条胶片沿自身原路径刚性滑回（逐样本精确反演，无弹簧跳变）
      const kSnap = Math.max(0, Math.min(this.sampleCount - 1, Math.floor(this.out / this.ds)));
      this.revSnap = [];
      for (let i = 0; i <= kSnap; i++) this.revSnap.push(this.pos[i].clone());
      this.revFrom = this.out;
      // 轨迹兜底：若几乎没有轨迹（刚激活就收回），从当前片头补一段
      if (this.trail.length < 2) {
        this.trail.length = 0;
        this.trail.push(this.base[0].clone().setY(0.05));
        this.trail.push(this.cur.clone().setY(0.05));
      }
    }
    const rewinding = filmControl.mode === 'rewinding';

    // 胶卷头（drawing）：实时鼠标跟随——直接追踪光标，不预测、不规划整条曲线。
    // 用户向哪移胶片头就向哪走（CHASE 轻微惯性 ≈ 70ms 滞后，几乎无感）；
    // 后端链式弹簧的延迟跟随形成自然弯曲，曲率钳制只防折叠、不改方向。
    // locked/idle/rewinding 时不追随（重入 drawing 不跳变）。
    if (mode === 'drawing') {
      const k = Math.min(1, dt * CHASE_RATE);
      this.cur.x += (cursor.x - this.cur.x) * k;
      this.cur.z += (cursor.z - this.cur.z) * k;
    } else {
      this.hv.multiplyScalar(Math.max(0, 1 - dt * 10));
    }

    if (rewinding) {
      // —— 倒卷：固定时长 ease-in-out 整体回缩（2.2s）——
      // 整条胶片保持锁定形状，片尾沿原路径滑回卷轴；卷轴转速 = 片长变化/半径，
      // 中途自然加速。无逐帧收回、无停顿、无跳变。
      this.rewindT = Math.min(1, this.rewindT + dt / REWIND_DURATION);
      const t = this.rewindT;
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.out = this.revFrom * (1 - eased);
      if (t >= 1) {
        // 收净：回到 idle
        this.out = 0;
        filmControl.mode = 'idle';
        this.trail.length = 0;
        this.parkAll();
      }
    } else if (mode === 'drawing') {
      // 拉出：按「胶片末端实际走过的路径」喂片（不是光标路径——光标会抄近道）
      const travel = Math.hypot(this.cur.x - this.lastX, this.cur.z - this.lastZ);
      if (engage > 0.02 && travel > 1e-4) {
        this.out = Math.min(this.maxOut, this.out + travel);
      }
    }
    this.lastX = this.cur.x;
    this.lastZ = this.cur.z;
    filmControl.outLength = this.out;
    filmControl.rewinding = rewinding;
    // 倒卷纹理偏移：画格向卷轴流动的滚动量（FilmStrip 写入贴图 offset）
    filmControl.rewindU = rewinding && this.revFrom > 0 ? Math.max(0, this.revFrom - this.out) / this.maxOut : 0;

    // 活动 tip：浮点索引（tipFloat = out / ds）
    const tipFloat = this.out / this.ds;
    const k = Math.max(0, Math.min(n - 1, Math.floor(tipFloat)));

    // 帧级快照（前馈耦合——稳定性关键）
    for (let i = 0; i < n; i++) {
      this.snap[i].copy(this.pos[i]);
      this.vsnap[i].copy(this.vel[i]);
    }

    // tip 目标——胶片是严格平面的纸带：所有状态片头高度恒定 0.05，
    // 无升沉、无波浪、无 cloth 式起伏（2D 平面运动，只有路径方向变化）
    const lift = 0.05;
    if (rewinding) {
      // 沿 trail 反向插值（贴台面滑回）
      this.trailPointAt(this.rewindWalked, _tip);
      _tip.y = 0.05;
    } else if (mode === 'drawing' && this.out > 0 && this.out < this.maxOut - 1e-6) {
      // 拉出中：片头追随光标（带升沉），但不可超出弧长预算——
      // 欧氏距离 ≤ 弧长，拉远时胶片整体绷紧（如真实胶片），拉伸不会囤积在出口锚定段
      _tip.set(this.cur.x, lift, this.cur.z);
      const dx = _tip.x - this.base[0].x;
      const dz = _tip.z - this.base[0].z;
      const d = Math.hypot(dx, dz);
      const reach = Math.max(0.5, this.out * 0.995);
      if (d > reach) {
        const f = reach / d;
        _tip.x = this.base[0].x + dx * f;
        _tip.z = this.base[0].z + dz * f;
      }
    } else if (this.out > 0) {
      // 冻结（locked / 拉满 / 兜底）：片尾零阶保持——钉在上一帧片尾位置。
      // 注意不可用外推（snap[k-1] + dir·ds）：外推沿运动方向每帧增量平移，
      // 刚性链会被片尾拖着整体跑掉。零阶保持是不动点：tip 钉在自己上一帧位置。
      _tip.copy(this.snap[k]);
    } else {
      _tip.copy(this.snap[0]);
    }

    // drawing：记录片头轨迹（供倒卷原路返回）
    if (mode === 'drawing' && this.out > 0.05) {
      const lastT = this.trail[this.trail.length - 1];
      if (!lastT || Math.hypot(_tip.x - lastT.x, _tip.z - lastT.z) > TRAIL_MIN_DIST) {
        this.trail.push(new THREE.Vector3(_tip.x, 0.05, _tip.z));
      }
    }

    // 冻结态前段「朝卷轴侧」约束实验回退：与后段约束在交界处打架，恒 false
    const frontBlend = false;

    // 新激活的样本（拉出越界）：从卷轴口“冒”到链上目标位
    if (k > this.lastK) {
      for (let i = this.lastK + 1; i <= k && i < n; i++) {
        this.ftlTarget(i, k, false);
        this.pos[i].copy(_tgt);
        this.vel[i].set(0, 0, 0);
      }
    }
    this.lastK = k;

    if (!rewinding) {
      const steps = Math.max(1, Math.min(16, Math.ceil(dt / SUBSTEP)));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) this.step(k, h, frontBlend);
    }

    // drawing（未拉满）：软物理约束——曲率钳制（限最小转弯半径）+ 软等长（不可拉伸）。
    // 与冻结 PBD 互斥（拉满/锁定走 frozenNow 分支）。
    if (!rewinding && mode === 'drawing' && this.out > 0 && this.out < this.maxOut - 1e-6) {
      this.curvatureClamp(k);
      this.softConstraints(k, dt);
    }

    // 冻结态（locked / 拉满兜底）：PBD 位置约束——整条链收成 ds 等长、不可拉伸。
    // 卷轴侧优先（前向从锚定线收），片尾钉在 tip；带强度斜坡（0.6s），
    // 避免锁定瞬间硬跳变。拉伸不再囤积在出口锚定段。
    const frozenNow = !rewinding && this.out > 0 && (mode === 'locked' || mode === 'idle' || this.out >= this.maxOut - 1e-6);
    if (frozenNow) {
      this.curvatureClamp(k);
      this.freezeBlend = Math.min(1, this.freezeBlend + dt / 0.6);
      this.pbdRelax(k, this.freezeBlend);
    } else {
      this.freezeBlend = 0;
    }

    // 倒卷：整条胶片保持锁定形状不动（零振荡），回收感由两端表达——
    // 片尾位置随 out 沿原路径平滑后退（FilmStrip  fractional tip 插值），
    // 画格向卷轴流动由纹理偏移表达（FilmStrip 消费 filmControl.rewindU）。
    if (rewinding && filmControl.mode === 'rewinding') {
      const mS = this.revSnap.length;
      for (let i = 0; i < mS; i++) this.pos[i].copy(this.revSnap[i]);
      for (let i = 0; i < n; i++) this.vel[i].set(0, 0, 0);
    }

    // 硬可达域：不可拉伸胶片锚在卷轴口——任意样本距锚点不可能超过其弧长上限。
    // 弹簧在极端拖拽下即使失稳也不可能飞出这个域（钳位时泄速，能量有出口）。
    for (let i = 1; i <= k && i < n; i++) {
      const p = this.pos[i];
      const dx = p.x - this.base[0].x;
      const dz = p.z - this.base[0].z;
      const maxR = (i + 1) * this.ds;
      const d = Math.hypot(dx, dz);
      if (d > maxR) {
        const f = maxR / d;
        p.x = this.base[0].x + dx * f;
        p.z = this.base[0].z + dz * f;
        this.vel[i].multiplyScalar(0.5);
      }
    }

    // 失稳保险（探针覆盖 tip 本身与其后一样本——tip 跑飞时 k+1 已冻结探不到）
    const probe = this.pos[Math.min(n - 1, k + 1)];
    const probeTip = this.pos[k];
    if (!Number.isFinite(probe.x + probe.y + probe.z) || !Number.isFinite(probeTip.x + probeTip.y + probeTip.z) ||
        Math.abs(probe.x) + Math.abs(probe.z) > 500 || Math.abs(probeTip.x) + Math.abs(probeTip.z) > 500) {
      (window as unknown as { __guardHit?: unknown }).__guardHit = {
        probe: { x: probe.x, y: probe.y, z: probe.z },
        tip: { x: probeTip.x, y: probeTip.y, z: probeTip.z },
        out: this.out, k, mode: filmControl.mode,
        cur: { x: this.cur.x, z: this.cur.z },
        hv: { x: this.hv.x, z: this.hv.z },
      };
      this.out = 0;
      filmControl.mode = 'idle';
      this.trail.length = 0;
      this.parkAll();
      this.cur.copy(this.base[0]);
    }
  }

  /** trail 反向：从末端往回走 dist 处的插值点（写入 out） */
  private trailPointAt(dist: number, outV: THREE.Vector3): THREE.Vector3 {
    const m = this.trail.length;
    if (m === 0) return outV.copy(this.base[0]);
    if (m === 1) return outV.copy(this.trail[0]);
    let d = dist;
    for (let i = m - 1; i > 0; i--) {
      const a = this.trail[i];
      const b = this.trail[i - 1];
      const seg = a.distanceTo(b);
      if (d <= seg) return outV.copy(a).lerp(b, seg > 1e-6 ? d / seg : 0);
      d -= seg;
    }
    return outV.copy(this.trail[0]);
  }

  /** 定长跟随目标：snap[i+1] + ds·dir（dir = 当前局部方向，形状记忆）
   *  frozen 时靠近卷轴的前段改用「朝卷轴侧」约束（snap[i-1] + ds·dir），
   *  松弛从卷轴侧开始收——避免尾端先收、卷轴侧长期薄撑。 */
  private ftlTarget(i: number, k: number, frontBlend: boolean) {
    if (i >= k) {
      // tip 本身
      _tgt.copy(_tip);
      return;
    }
    if (frontBlend && i > ANCHOR_SAMPLES && i <= ANCHOR_BLEND_END) {
      _dir.copy(this.snap[i]).sub(this.snap[i - 1]);
      const len = _dir.length();
      if (len < 1e-4) {
        _dir.copy(this.tan0);
      } else {
        _dir.multiplyScalar(1 / len);
      }
      _tgt.copy(this.snap[i - 1]).addScaledVector(_dir, this.ds);
      if (_tgt.y !== 0.05) _tgt.y = 0.05;
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
    if (_tgt.y !== 0.05) _tgt.y = 0.05;
  }

  private step(k: number, dt: number, frontBlend: boolean) {
    const n = this.sampleCount;
    // 只活动到 tip（k）；k+1.. 冻结——收卷时它们保存原曲线位置供尾端沿原路滑回
    for (let i = Math.min(n - 1, k); i >= 1; i--) {
      const p = this.pos[i];
      const v = this.vel[i];
      this.ftlTarget(i, k, frontBlend);
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
    // 出口锚定段：胶片只沿卷轴单一固定切向（tan0）吐出——pos[0..a] 永久钉在射线上，
    // 不存在从胶卷头两侧开始的形态；转向由曲率钳制在射线之后逐段渐进承担。
    const a = ANCHOR_SAMPLES;
    for (let i = 0; i <= a && i < n; i++) {
      this.pos[i].set(
        this.base[0].x + this.tan0.x * i * this.ds,
        0.05,
        this.base[0].z + this.tan0.z * i * this.ds,
      );
      this.vel[i].set(0, 0, 0);
    }
  }

  /**
   * 曲率钳制（前向扫描，单遍）：相邻段夹角超过 MAX_TURN 时，将下游段绕顶点旋回限值。
   * 限制最小转弯半径、消除急弯/折叠/回头——只做单调角度缩减，不与任何投影反复打架。
   * ds=0.605、MAX_TURN=0.5rad → 最小转弯半径 ≈ 1.2u。
   */
  private curvatureClamp(k: number) {
    const n = this.sampleCount;
    const end = Math.min(k, n - 1);
    const MAXA = 0.5; // rad/段 ≈ 28.6°
    for (let i = ANCHOR_SAMPLES; i < end; i++) {
      const p0 = this.pos[i - 1];
      const p1 = this.pos[i];
      const p2 = this.pos[i + 1];
      const ax = p1.x - p0.x;
      const az = p1.z - p0.z;
      const bx = p2.x - p1.x;
      const bz = p2.z - p1.z;
      const la = Math.hypot(ax, az);
      const lb = Math.hypot(bx, bz);
      // i=锚定末端：入射方向 = 卷轴固定切向 tan0（虚拟段），钳制射线后第一折
      const aAng = i === ANCHOR_SAMPLES ? Math.atan2(this.tan0.z, this.tan0.x) : Math.atan2(az, ax);
      if ((i > ANCHOR_SAMPLES && la < 1e-6) || lb < 1e-6) continue;
      let d = Math.atan2(bz, bx) - aAng;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > MAXA) {
        const na = aAng + Math.sign(d) * MAXA;
        p2.x = p1.x + Math.cos(na) * lb;
        p2.z = p1.z + Math.sin(na) * lb;
      }
    }
  }

  /**
   * drawing 态软物理约束（保留弹簧惯性手感，不钉速度）：
   * 软等长投影——每段向 ds 靠拢 35%，胶片不可无限拉伸。
   * 锚定侧与片头端不强制：两端形状由卷轴/胶卷头决定。
   */
  private softConstraints(k: number, _dt: number) {
    const n = this.sampleCount;
    const end = Math.min(k, n - 1);
    if (end < ANCHOR_SAMPLES + 3) return;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = ANCHOR_SAMPLES + 1; i <= end; i++) {
        const p = this.pos[i];
        const q = this.pos[i - 1];
        _dir.copy(p).sub(q);
        const len = _dir.length();
        if (len < 1e-6) continue;
        const diff = ((len - this.ds) / len) * 0.35;
        p.addScaledVector(_dir, -diff * 0.5);
        if (i - 1 > ANCHOR_SAMPLES) q.addScaledVector(_dir, diff * 0.5); // 锚定侧钉死不动
      }
    }
  }

  /**
   * 冻结态（locked / 拉满 / 兜底）PBD 位置约束：整条链收成 ds 等长、不可拉伸。
   * 片尾钉在当前 tip；前向从锚定线收（卷轴侧优先），后向从片尾收；
   * 每轮重新钉片尾；y 下限贴台 0.03；4 轮迭代。
   * alpha = freezeBlend（0.6s 斜坡），全刚性前按原始位置 lerp，避免锁定瞬间硬跳。
   */
  private pbdRelax(k: number, alpha: number) {
    const n = this.sampleCount;
    const end = Math.min(k, n - 1);
    if (end <= ANCHOR_SAMPLES + 1) return;
    _pin.copy(_tip);
    // 出口锚定线端点钳制：pos[a] 距卷轴口 ≤ a·ds（锚定段全长上限，防锚定Gap超标）
    {
      const p3 = this.pos[ANCHOR_SAMPLES];
      _dir.copy(p3).sub(this.base[0]);
      const d3 = _dir.length();
      const maxD = ANCHOR_SAMPLES * this.ds;
      if (d3 > maxD) {
        p3.copy(this.base[0]).addScaledVector(_dir.multiplyScalar(1 / d3), maxD);
        if (p3.y < 0.03) p3.y = 0.03;
      }
    }
    for (let i = 0; i <= end; i++) this._pbdOrig[i].copy(this.pos[i]);
    this.pos[end].copy(_pin);
    for (let iter = 0; iter < 4; iter++) {
      // 前向 pass：距前邻 = ds
      for (let i = ANCHOR_SAMPLES + 1; i < end; i++) {
        const p = this.pos[i];
        const q = this.pos[i - 1];
        _dir.copy(p).sub(q);
        let len = _dir.length();
        if (len < 1e-6) {
          _dir.copy(this.tan0);
          len = 1;
        }
        p.copy(q).addScaledVector(_dir, this.ds / len);
        if (p.y < 0.03) p.y = 0.03;
      }
      // 后向 pass：距后邻 = ds
      for (let i = end - 1; i > ANCHOR_SAMPLES; i--) {
        const p = this.pos[i];
        const q = this.pos[i + 1];
        _dir.copy(p).sub(q);
        let len = _dir.length();
        if (len < 1e-6) {
          _dir.copy(this.tan0);
          len = 1;
        }
        p.copy(q).addScaledVector(_dir, this.ds / len);
        if (p.y < 0.03) p.y = 0.03;
      }
      this.pos[end].copy(_pin);
    }
    if (alpha < 1) {
      for (let i = 0; i <= end; i++) this.pos[i].lerpVectors(this._pbdOrig[i], this.pos[i], alpha);
    }
    for (let i = 0; i <= end; i++) this.vel[i].set(0, 0, 0);
  }

  /** 采样点 i 处的实时切线（写入 out） */
  tangentAt(i: number, out: THREE.Vector3): THREE.Vector3 {
    const n = this.sampleCount;
    const a = this.pos[Math.max(0, i - 1)];
    const b = this.pos[Math.min(n - 1, i + 1)];
    return out.copy(b).sub(a).setY(0).normalize();
  }
}

/** 由切线 + 侧倾角计算平躺胶片的姿态（长轴贴切线，法线朝上） */
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
