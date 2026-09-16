import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing';
import { buildFilmCurve, layoutCards } from './filmCurveSpiral';
import { FilmCardSpiral } from './FilmCardSpiral';
import { archive } from '@/data/archive';
import { matchesFilter, type ArchiveFilter } from '@/data/taxonomy';
import { progressStore, CARD_COUNT } from '@/lib/progress';

const PITCH = 2.55;
const ROLL_RADIUS = 1.35;

interface DarkroomSceneProps {
  hovered: string | null;
  selected: string | null;
  filter: ArchiveFilter;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onCardReady: () => void;
}

/** 【旧版 ?v=spiral】螺线展卷场景（琥珀灯光 + 圆环卷轴），保留作对比 */
export function DarkroomSceneSpiral({ hovered, selected, filter, onHover, onSelect, onCardReady }: DarkroomSceneProps) {
  const curve = useMemo(() => buildFilmCurve(CARD_COUNT, PITCH), []);
  const layouts = useMemo(() => layoutCards(curve, CARD_COUNT, PITCH), [curve]);
  const totalLength = useMemo(() => curve.getLength(), [curve]);
  const rollRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFrame(() => {
    progressStore.current += (progressStore.target - progressStore.current) * 0.07;
    if (rollRef.current) {
      rollRef.current.rotation.y = -(progressStore.current * totalLength) / ROLL_RADIUS * 0.55;
    }
  });

  const wake = () => {
    if (controlsRef.current) controlsRef.current.autoRotate = false;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (controlsRef.current) controlsRef.current.autoRotate = true;
    }, 8000);
  };

  const startPoint = useMemo(() => curve.getPointAt(0), [curve]);

  return (
    <>
      {/* ———— 暗房光照：琥珀安全灯 + 中性补光 ———— */}
      <ambientLight intensity={1.6} color="#8a8078" />
      <spotLight
        position={[-8, 16, 6]}
        angle={0.62}
        penumbra={0.85}
        intensity={2000}
        distance={90}
        color="#ff8f45"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[6, 18, 8]} intensity={0.9} color="#cfd6e0" />
      <pointLight position={[10, 4, -8]} intensity={60} distance={40} color="#2b3a55" />

      {/* ———— 暗房工作台面 ———— */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[90, 64]} />
        <meshStandardMaterial color="#171310" roughness={0.92} metalness={0.08} />
      </mesh>

      {/* ———— 圆环卷轴（旧版模型） ———— */}
      <group ref={rollRef} position={[startPoint.x, 0.5, startPoint.z]}>
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[ROLL_RADIUS, 0.52, 24, 64]} />
          <meshStandardMaterial color="#1c1915" roughness={0.5} metalness={0.15} />
        </mesh>
        <mesh castShadow position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.62, 0.62, 0.95, 32]} />
          <meshStandardMaterial color="#0a0806" roughness={0.7} />
        </mesh>
        <mesh position={[ROLL_RADIUS + 0.6, -0.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.4, 0.95]} />
          <meshStandardMaterial color="#14110d" roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* ———— 底片卡片链（螺线） ———— */}
      {archive.map((entry, i) => (
        <FilmCardSpiral
          key={entry.id}
          entry={entry}
          index={i}
          layout={layouts[i]}
          totalLength={totalLength}
          selected={selected === entry.id}
          dimmed={!matchesFilter(entry, filter)}
          onHover={onHover}
          onSelect={onSelect}
          onReady={onCardReady}
        />
      ))}

      {hovered &&
        matchesFilter(archive.find((e) => e.id === hovered) ?? archive[0], filter) &&
        layouts[archive.findIndex((e) => e.id === hovered)] && (
          <HoverRing layout={layouts[archive.findIndex((e) => e.id === hovered)]} />
        )}

      <Sparkles count={130} scale={[34, 9, 34]} position={[0, 4, 0]} size={1.6} speed={0.18} opacity={0.35} color="#ff9a55" />

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

function HoverRing({ layout }: { layout: { position: THREE.Vector3; quaternion: THREE.Quaternion } }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const s = 1.08 + Math.sin(clock.elapsedTime * 4) * 0.02;
      ref.current.scale.set(s, s, s);
    }
  });
  return (
    <mesh ref={ref} position={layout.position} quaternion={layout.quaternion} position-y={0.01}>
      <planeGeometry args={[1.75, 2.55]} />
      <meshBasicMaterial color="#ff8c3a" wireframe transparent opacity={0.35} depthWrite={false} />
    </mesh>
  );
}
