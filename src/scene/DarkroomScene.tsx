import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing';
import { FilmStripPath, CARD_PITCH, filmControl, filmGlow } from './filmCurve';
import { FilmStrip, STRIP_W } from './FilmStrip';
import { archive } from '@/data/archive';
import { matchesFilter, type ArchiveFilter } from '@/data/taxonomy';

const ROLL_RADIUS = 0.85;
/** 档案画格数（?frames=N 可调，默认 40 全档案） */
const FILM_N = Math.min(
  40,
  Math.max(1, parseInt(new URLSearchParams(location.search).get('frames') || '40', 10) || 40),
);

interface DarkroomSceneProps {
  hovered: string | null;
  selected: string | null;
  filter: ArchiveFilter;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onCardReady: () => void;
}

/** 胶卷壳标签贴图 */
function makeRollLabel(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 176;
  const x = c.getContext('2d')!;
  x.fillStyle = '#16100c';
  x.fillRect(0, 0, 1024, 176);
  x.fillStyle = '#a91f0e';
  x.fillRect(0, 0, 1024, 12);
  x.fillRect(0, 164, 1024, 12);
  x.textAlign = 'center';
  x.font = "700 62px 'Courier New', monospace";
  x.fillStyle = 'rgba(238,228,210,0.92)';
  x.fillText('DARKROOM ARCHIVE', 512, 84);
  x.font = "400 32px 'Courier New', monospace";
  x.fillStyle = 'rgba(255,96,54,0.88)';
  x.fillText('DA · 200 · RED SAFE-LIGHT', 512, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function DarkroomScene({ hovered, selected, filter, onHover, onSelect, onCardReady }: DarkroomSceneProps) {
  const path = useMemo(() => new FilmStripPath(FILM_N, CARD_PITCH), []);
  const wDbg = window as unknown as { __filmPath?: FilmStripPath; __filmControl?: typeof filmControl };
  wDbg.__filmPath = path;
  wDbg.__filmControl = filmControl;
  const filmEntries = useMemo(() => archive.slice(0, FILM_N), []);
  const labelTex = useMemo(() => makeRollLabel(), []);
  const rollRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 拖放手势：按下胶卷头开始拉，拖出距离后释放 = 定型
  const grabRef = useRef<{ x: number; y: number; on: boolean }>({ x: 0, y: 0, on: false });
  const lastLockAt = useRef(0);

  // 光标世界坐标 / 活跃度（engage：0=胶片归位，1=满牵引）
  const cursorWorld = useRef(new THREE.Vector3(999, 0, 999));
  const lastCursor = useRef(new THREE.Vector3(999, 0, 999));
  const engage = useRef(0);
  const cursorLightRef = useRef<THREE.PointLight>(null);
  const _v = useMemo(() => new THREE.Vector3(), []);
  const _v2 = useMemo(() => new THREE.Vector3(), []);
  const _dir = useMemo(() => new THREE.Vector3(), []);
  const _qSpin = useMemo(() => new THREE.Quaternion(), []);
  const _YUP = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  // 卷轴姿态：轴水平 ⊥ 胶片吐出方向（侧立）；旋转 = 已拉出片长 / 半径
  const tan0 = path.tan0;
  const qAlign = useMemo(() => {
    const axis = new THREE.Vector3(tan0.z, 0, -tan0.x).normalize();
    return new THREE.Quaternion().setFromUnitVectors(_YUP, axis);
  }, [tan0, _YUP]);

  useFrame(({ clock, camera, pointer }, delta) => {
    const dt = Math.min(delta, 0.05);
    const w = window as unknown as { __sceneTick?: number; __pointer?: number[]; __film?: unknown; __reelPx?: number[] };
    w.__sceneTick = (w.__sceneTick ?? 0) + 1;
    w.__pointer = [pointer.x, pointer.y];
    w.__film = { out: filmControl.outLength, engage: engage.current, mode: filmControl.mode };
    // 卷轴头屏幕坐标（测试脚本点击用）
    _v2.set(rollPos.x, ROLL_RADIUS, rollPos.z).project(camera);
    w.__reelPx = [
      Math.round((_v2.x * 0.5 + 0.5) * window.innerWidth),
      Math.round((-_v2.y * 0.5 + 0.5) * window.innerHeight),
    ];

    // 卷轴绕自身横轴旋转 = 已拉出片长 / 半径（退卷 ↔ 卷回）
    if (rollRef.current) {
      _qSpin.setFromAxisAngle(_YUP, -(filmControl.outLength / ROLL_RADIUS));
      rollRef.current.quaternion.copy(qAlign).multiply(_qSpin);
    }

    // —— 光标 → 工作台面的世界坐标（限幅在台面范围内） ——
    _v.set(pointer.x, pointer.y, 0.5).unproject(camera);
    _dir.copy(_v).sub(camera.position).normalize();
    const tt = _dir.y < -1e-4 ? -camera.position.y / _dir.y : 0;
    cursorWorld.current.copy(camera.position).addScaledVector(_dir, Math.max(0, tt));
    const rr = Math.hypot(cursorWorld.current.x, cursorWorld.current.z);
    if (rr > 18) {
      cursorWorld.current.x *= 18 / rr;
      cursorWorld.current.z *= 18 / rr;
    }
    const speed = dt > 0 ? cursorWorld.current.distanceTo(lastCursor.current) / dt : 0;
    lastCursor.current.copy(cursorWorld.current);
    // 活跃度：动则快速升起，停则缓慢消退（约 1s 内归位）
    const engTarget = Math.min(1, speed * 0.35);
    engage.current += (engTarget - engage.current) * Math.min(1, dt * (engTarget > engage.current ? 6 : 1.6));

    // —— 链式弹簧仿真：状态机（idle/drawing/locked/rewinding） ——
    path.update(clock.elapsedTime, cursorWorld.current, engage.current, dt);

    // —— 红色安全灯光跟随光标（照到哪里亮到哪里） ——
    if (cursorLightRef.current) {
      cursorLightRef.current.position.lerp(
        _v.set(cursorWorld.current.x, 2.2, cursorWorld.current.z),
        Math.min(1, dt * 6),
      );
    }
    // —— 统一 hover 检测：光标到卷轴表面 / 胶片主体各采样点的最近距离 → 0..1 邻近度 ——
    // 驱动胶片 emissive 渐变（FilmStrip 消费）：近亮远暗、平滑过渡、无光圈
    {
      const kActive = Math.max(0, Math.min(path.sampleCount - 1, Math.floor(filmControl.outLength / path.ds)));
      let best = Math.hypot(cursorWorld.current.x - rollPos.x, cursorWorld.current.z - rollPos.z) - ROLL_RADIUS;
      for (let i = 0; i <= kActive; i++) {
        const p = path.pos[i];
        const d = Math.hypot(cursorWorld.current.x - p.x, cursorWorld.current.z - p.z);
        if (d < best) best = d;
      }
      const HOVER_R = 3.2;
      const prox = Math.max(0, Math.min(1, 1 - best / HOVER_R));
      const g = prox * prox * (3 - 2 * prox); // smoothstep 缓入缓出
      filmGlow.value += (g - filmGlow.value) * Math.min(1, dt * 5);
      // 局部显影中心 = 光标台面容座（FilmStrip shader 高斯衰减用）
      filmGlow.x = cursorWorld.current.x;
      filmGlow.z = cursorWorld.current.z;
    }
  });

  const wake = () => {
    if (controlsRef.current) controlsRef.current.autoRotate = false;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (controlsRef.current) controlsRef.current.autoRotate = true;
    }, 8000);
  };

  const rollPos = useMemo(() => path.pos[0] ?? new THREE.Vector3(), [path]);

  // 按下胶卷头：idle→drawing / locked→drawing（继续拉）
  const handleHeadDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    path.startDrawing();
    grabRef.current = { x: e.clientX, y: e.clientY, on: true };
  };
  // 释放：拖出距离 → 定型（drawing→locked）；原地松开 → 保持 drawing（点击语义）
  const handleHeadUp = (e: ThreeEvent<PointerEvent>) => {
    if (!grabRef.current.on) return;
    grabRef.current.on = false;
    const moved = Math.hypot(e.clientX - grabRef.current.x, e.clientY - grabRef.current.y);
    if (moved >= 8 && filmControl.mode === 'drawing') {
      if (path.lock()) lastLockAt.current = performance.now();
    }
  };
  const handleHeadOver = () => {
    document.body.style.cursor = 'pointer';
  };
  const handleHeadOut = () => {
    document.body.style.cursor = 'auto';
  };
  // 点击台面：drawing→locked（确认位置）
  const handleTableClick = () => {
    if (path.lock()) lastLockAt.current = performance.now();
  };
  // 点击胶卷头：开始/继续拉片（拖放释放刚定型过的 200ms 内不触发，避免同一次手势反复）
  const handleHeadClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (performance.now() - lastLockAt.current < 200) return;
    path.startDrawing();
  };

  const hoveredIdx = hovered ? filmEntries.findIndex((e) => e.id === hovered) : -1;

  return (
    <>
      {/* ———— 暗房光照：红色安全灯，整体压暗 ———— */}
      <ambientLight intensity={0.55} color="#4a1a12" />
      <spotLight
        position={[-8, 16, 6]}
        angle={0.55}
        penumbra={0.9}
        intensity={1600}
        distance={90}
        color="#ff2413"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[6, 18, 8]} intensity={0.15} color="#2e3547" />
      <pointLight position={[10, 4, -8]} intensity={25} distance={40} color="#400c08" />
      {/* 胶卷壳上方的一盏暗红池光，突出主角 */}
      <pointLight position={[rollPos.x, 2.4, rollPos.z]} intensity={22} distance={11} color="#ff2a15" />
      {/* 跟随光标的红色安全灯：照到哪里，哪里显影 */}
      <pointLight ref={cursorLightRef} position={[0, 2.2, 0]} intensity={26} distance={9} color="#ff3517" />
      {/* 注：安全灯只保留光源，不渲染灯泡实体 */}

      {/* ———— 暗房工作台面 ———— */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
        onClick={handleTableClick}
        onPointerUp={handleHeadUp}
        onPointerDown={() => { grabRef.current.on = false; }}
      >
        <circleGeometry args={[90, 64]} />
        <meshStandardMaterial color="#110d0a" roughness={0.92} metalness={0.08} />
      </mesh>

      {/* ———— 胶卷卷轴（侧立：轴水平，立于台面，胶片从底部切向吐出） ———— */}
      <group
        position={[rollPos.x, ROLL_RADIUS, rollPos.z]}
        onPointerDown={handleHeadDown}
        onPointerUp={handleHeadUp}
        onClick={handleHeadClick}
        onPointerOver={handleHeadOver}
        onPointerOut={handleHeadOut}
      >
        <group ref={rollRef} quaternion={qAlign}>
          {/* 筒身：轴向长度 = 胶片宽（胶片沿轴向绕卷，宽度一致） */}
          <mesh castShadow>
            <cylinderGeometry args={[ROLL_RADIUS, ROLL_RADIUS, STRIP_W, 48]} />
            <meshStandardMaterial color="#100d0a" roughness={0.35} metalness={0.55} />
          </mesh>
          {/* 标签带（微弱自发光，安全灯下可辨认） */}
          <mesh>
            <cylinderGeometry args={[ROLL_RADIUS + 0.02, ROLL_RADIUS + 0.02, STRIP_W * 0.62, 48]} />
            <meshStandardMaterial
              map={labelTex}
              roughness={0.5}
              metalness={0.15}
              emissive="#ff3a1e"
              emissiveMap={labelTex}
              emissiveIntensity={0.38}
            />
          </mesh>
          {/* 两侧盖 */}
          <mesh castShadow position={[0, STRIP_W / 2 + 0.04, 0]}>
            <cylinderGeometry args={[ROLL_RADIUS + 0.04, ROLL_RADIUS + 0.04, 0.08, 48]} />
            <meshStandardMaterial color="#1a1510" roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh castShadow position={[0, -STRIP_W / 2 - 0.04, 0]}>
            <cylinderGeometry args={[ROLL_RADIUS + 0.04, ROLL_RADIUS + 0.04, 0.08, 48]} />
            <meshStandardMaterial color="#1a1510" roughness={0.4} metalness={0.6} />
          </mesh>
          {/* 轴芯凸台 */}
          <mesh position={[0, STRIP_W / 2 + 0.1, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.1, 24]} />
            <meshStandardMaterial color="#0a0806" roughness={0.6} metalness={0.3} />
          </mesh>
        </group>
      </group>
      {/* 吐出的片头已移除：胶片直接从卷轴口连续抽出（见红圈反馈） */}

      {/* ———— 连续胶片（唯一主体：胶片边缘/宽度/连续表面/齿孔 + 画格一体成型） ———— */}
      <FilmStrip
        path={path}
        entries={filmEntries}
        totalCount={archive.length}
        dimmed={(e) => !matchesFilter(e, filter)}
        selected={selected}
        onHover={onHover}
        onSelect={onSelect}
        onReady={onCardReady}
      />

      {/* 悬停提示光圈（被筛选淡化的画格不显示） */}
      {hoveredIdx >= 0 && !dimmedEntry(filmEntries[hoveredIdx], filter) && (
        <HoverRing path={path} index={hoveredIdx} />
      )}

      {/* 暗房浮尘 */}
      <Sparkles count={130} scale={[34, 9, 34]} position={[0, 4, 0]} size={1.6} speed={0.18} opacity={0.22} color="#ff4526" />

      {/* ———— 摄像机 ———— */}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 0, 0]}
        enableZoom={false}
        enablePan
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.4}
        maxPolarAngle={1.32}
        minPolarAngle={0.15}
        onStart={wake}
      />
      <PerspectiveRig />

      {/* ———— 后期：颗粒 + 暗角 + 微辉光（?nopost=1 可关闭排查） ———— */}
      {new URLSearchParams(location.search).get('nopost') !== '1' && (
        <EffectComposer>
          <Bloom intensity={0.35} luminanceThreshold={0.3} luminanceSmoothing={0.7} mipmapBlur />
          <Noise opacity={0.07} />
          <Vignette eskil={false} offset={0.18} darkness={0.78} />
        </EffectComposer>
      )}
    </>
  );
}

function dimmedEntry(entry: (typeof archive)[number], filter: ArchiveFilter): boolean {
  return !matchesFilter(entry, filter);
}

function PerspectiveRig() {
  const { camera } = useThree();
  useMemo(() => {
    camera.position.set(0, 23, 15);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return null;
}

/** 悬停光圈：贴在胶片画格上方的呼吸线框 */
function HoverRing({ path, index }: { path: FilmStripPath; index: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const _tan = useMemo(() => new THREE.Vector3(), []);
  const _Y = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const _flat = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), []);
  const _yaw = useMemo(() => new THREE.Quaternion(), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const k = path.cardIndex(index);
    ref.current.position.copy(path.pos[k]);
    ref.current.position.y += 0.01;
    path.tangentAt(k, _tan);
    _yaw.setFromAxisAngle(_Y, Math.atan2(_tan.x, _tan.z));
    ref.current.quaternion.copy(_yaw).multiply(_flat);
    const s = 1.08 + Math.sin(clock.elapsedTime * 4) * 0.02;
    ref.current.scale.set(s, s, s);
  });
  return (
    <mesh ref={ref}>
      <planeGeometry args={[2.2, 1.3]} />
      <meshBasicMaterial color="#ff4a2a" wireframe transparent opacity={0.35} depthWrite={false} />
    </mesh>
  );
}
