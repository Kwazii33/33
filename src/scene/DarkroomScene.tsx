import { useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing';
import { FilmStripPath, CARD_PITCH, START_ARC, cardQuaternion, bankAngle, filmControl } from './filmCurve';
import { FilmCard } from './FilmCard';
import { FilmStripMesh } from './FilmStripMesh';
import { archive } from '@/data/archive';
import { matchesFilter, type ArchiveFilter } from '@/data/taxonomy';
import { CARD_COUNT } from '@/lib/progress';

const ROLL_RADIUS = 0.85;

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
  const path = useMemo(() => new FilmStripPath(CARD_COUNT, CARD_PITCH), []);
  const wDbg = window as unknown as { __filmPath?: FilmStripPath; __filmControl?: typeof filmControl };
  wDbg.__filmPath = path;
  wDbg.__filmControl = filmControl;
  const labelTex = useMemo(() => makeRollLabel(), []);
  const rollRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 每张卡片的 Object3D 槽位（FilmCard 注册，这里每帧写位姿）
  const cardObjs = useRef<(THREE.Object3D | null)[]>(archive.map(() => null));
  // HoverRing 读取的实时槽位
  const slots = useMemo(
    () => archive.map(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion() })),
    [],
  );
  const registerCard = useCallback((i: number, o: THREE.Object3D | null) => {
    cardObjs.current[i] = o;
  }, []);

  // 光标世界坐标 / 活跃度（engage：0=胶片归位，1=满牵引）
  const cursorWorld = useRef(new THREE.Vector3(999, 0, 999));
  const lastCursor = useRef(new THREE.Vector3(999, 0, 999));
  const engage = useRef(0);
  const cursorLightRef = useRef<THREE.PointLight>(null);
  const _v = useMemo(() => new THREE.Vector3(), []);
  const _dir = useMemo(() => new THREE.Vector3(), []);
  const _tan = useMemo(() => new THREE.Vector3(), []);
  const _q = useMemo(() => new THREE.Quaternion(), []);
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
    const w = window as unknown as { __sceneTick?: number; __pointer?: number[]; __film?: unknown };
    w.__sceneTick = (w.__sceneTick ?? 0) + 1;
    w.__pointer = [pointer.x, pointer.y];
    w.__film = { out: filmControl.outLength, engage: engage.current, cw: [cursorWorld.current.x.toFixed(2), cursorWorld.current.z.toFixed(2)] };
    // 卷轴绕自身横轴旋转 = 已拉出片长 / 半径（鼠标拉出 ↔ 退卷，收卷 ↔ 卷回）
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

    // —— 链式弹簧仿真：鼠标轨迹驱动胶卷带 ——
    path.update(clock.elapsedTime, cursorWorld.current, engage.current, dt);
    for (let i = 0; i < archive.length; i++) {
      const obj = cardObjs.current[i];
      if (!obj) continue;
      const k = path.cardIndex(i);
      obj.position.copy(path.pos[k]);
      path.tangentAt(k, _tan);
      cardQuaternion(_tan, bankAngle(path, k, _tan), _q);
      obj.quaternion.copy(_q);
      slots[i].pos.copy(obj.position);
      slots[i].quat.copy(_q);
    }

    // —— 红色安全灯光跟随光标（照到哪里亮到哪里） ——
    if (cursorLightRef.current) {
      cursorLightRef.current.position.lerp(
        _v.set(cursorWorld.current.x, 2.2, cursorWorld.current.z),
        Math.min(1, dt * 6),
      );
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[90, 64]} />
        <meshStandardMaterial color="#110d0a" roughness={0.92} metalness={0.08} />
      </mesh>

      {/* ———— 胶卷卷轴（侧立：轴水平，立于台面，胶片从底部切向吐出） ———— */}
      <group position={[rollPos.x, ROLL_RADIUS, rollPos.z]}>
        <group ref={rollRef} quaternion={qAlign}>
          {/* 筒身 */}
          <mesh castShadow>
            <cylinderGeometry args={[ROLL_RADIUS, ROLL_RADIUS, 0.95, 48]} />
            <meshStandardMaterial color="#100d0a" roughness={0.35} metalness={0.55} />
          </mesh>
          {/* 标签带（微弱自发光，安全灯下可辨认） */}
          <mesh>
            <cylinderGeometry args={[ROLL_RADIUS + 0.02, ROLL_RADIUS + 0.02, 0.5, 48]} />
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
          <mesh castShadow position={[0, 0.515, 0]}>
            <cylinderGeometry args={[ROLL_RADIUS + 0.04, ROLL_RADIUS + 0.04, 0.08, 48]} />
            <meshStandardMaterial color="#1a1510" roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh castShadow position={[0, -0.515, 0]}>
            <cylinderGeometry args={[ROLL_RADIUS + 0.04, ROLL_RADIUS + 0.04, 0.08, 48]} />
            <meshStandardMaterial color="#1a1510" roughness={0.4} metalness={0.6} />
          </mesh>
          {/* 轴芯凸台 */}
          <mesh position={[0, 0.575, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.1, 24]} />
            <meshStandardMaterial color="#0a0806" roughness={0.6} metalness={0.3} />
          </mesh>
        </group>
      </group>
      {/* 吐出的片头：贴台，指向带身起点方向（切向离开卷轴底部） */}
      <mesh
        position={[rollPos.x + tan0.x * (ROLL_RADIUS + 0.75), 0.05, rollPos.z + tan0.z * (ROLL_RADIUS + 0.75)]}
        rotation={[-Math.PI / 2, Math.atan2(tan0.x, tan0.z), 0]}
        rotation-order="YXZ"
      >
        <planeGeometry args={[1.6, 0.62]} />
        <meshStandardMaterial color="#14100c" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* ———— 连续胶片条带（铺在卡片下方的实体胶片，从卷轴连到尾端） ———— */}
      <FilmStripMesh path={path} />

      {/* ———— 底片帧链（胶卷带） ———— */}
      {archive.map((entry, i) => (
        <FilmCard
          key={entry.id}
          entry={entry}
          index={i}
          arcPos={START_ARC + i * CARD_PITCH}
          totalLength={path.total}
          selected={selected === entry.id}
          dimmed={!matchesFilter(entry, filter)}
          onHover={onHover}
          onSelect={onSelect}
          onReady={onCardReady}
          registerRef={registerCard}
        />
      ))}

      {/* 悬停提示光圈（被筛选淡化的卡片不显示） */}
      {hovered &&
        matchesFilter(archive.find((e) => e.id === hovered) ?? archive[0], filter) &&
        (() => {
          const idx = archive.findIndex((e) => e.id === hovered);
          return idx >= 0 ? <HoverRing slot={slots[idx]} /> : null;
        })()}

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

function PerspectiveRig() {
  const { camera } = useThree();
  useMemo(() => {
    camera.position.set(0, 23, 15);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return null;
}

interface Slot {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

function HoverRing({ slot }: { slot: Slot }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.copy(slot.pos);
      ref.current.position.y += 0.01;
      ref.current.quaternion.copy(slot.quat);
      const s = 1.08 + Math.sin(clock.elapsedTime * 4) * 0.02;
      ref.current.scale.set(s, s, s);
    }
  });
  return (
    <mesh ref={ref}>
      <planeGeometry args={[1.75, 2.55]} />
      <meshBasicMaterial color="#ff4a2a" wireframe transparent opacity={0.35} depthWrite={false} />
    </mesh>
  );
}
