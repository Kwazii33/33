import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { buildCardTexture } from '../scene/cardTexture';
import { progressStore } from '@/lib/progress';
import type { ArchiveEntry } from '@/data/archive';
import type { CardLayout } from './filmCurveSpiral';

const CARD_W = 1.55;
const CARD_H = 2.32;

interface FilmCardProps {
  entry: ArchiveEntry;
  index: number;
  layout: CardLayout;
  totalLength: number;
  selected: boolean;
  dimmed: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onReady: () => void;
}

/** 【旧版 ?v=spiral】螺线布局底片卡片（单击选中 / 双击关闭） */
export function FilmCardSpiral({
  entry, index, layout, totalLength, selected, dimmed, onHover, onSelect, onReady,
}: FilmCardProps) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const developRef = useRef<THREE.MeshBasicMaterial>(null);
  const revealTime = useRef<number | null>(null);
  const lastClickAt = useRef(0);
  const selectedAt = useRef(0);

  useEffect(() => {
    let alive = true;
    buildCardTexture(entry, index).then((tex) => {
      if (alive) {
        setTexture(tex);
        onReady();
      } else {
        tex.dispose();
      }
    });
    return () => {
      alive = false;
    };
  }, [entry, index, onReady]);

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    const shown = layout.arcPos <= progressStore.current * totalLength + 0.01;
    g.visible = shown;
    if (!shown) {
      revealTime.current = null;
      if (developRef.current) developRef.current.opacity = 1;
      return;
    }
    if (revealTime.current === null) revealTime.current = clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - revealTime.current) / 1.8);
    const eased = 1 - Math.pow(1 - t, 2.2);
    if (developRef.current) {
      developRef.current.opacity = selected ? Math.max(0.12, 1 - eased) : 1 - eased;
    }
  });

  const geometry = useMemo(() => new THREE.PlaneGeometry(CARD_W, CARD_H), []);

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    if (dimmed) return;
    e.stopPropagation();
    onHover(entry.id);
    document.body.style.cursor = 'pointer';
  };
  const handleOut = () => {
    if (dimmed) return;
    onHover(null);
    document.body.style.cursor = 'auto';
  };
  const tryClose = () => {
    if (selected) onSelect(null);
  };
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (dimmed) return;
    e.stopPropagation();
    const now = performance.now();
    const gap = now - lastClickAt.current;
    lastClickAt.current = now;
    if (!selected) {
      selectedAt.current = now;
      onSelect(entry.id);
      return;
    }
    if (now - selectedAt.current < 400) return;
    if (gap < 400) tryClose();
  };
  const handleDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    if (dimmed) return;
    e.stopPropagation();
    tryClose();
  };

  return (
    <group
      ref={groupRef}
      position={layout.position}
      quaternion={layout.quaternion}
      visible={false}
    >
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {texture ? (
          <meshStandardMaterial
            key={dimmed ? 'tex-dim' : 'tex'}
            map={texture}
            color={dimmed ? '#1b1b1b' : '#ffffff'}
            roughness={0.62}
            metalness={0.05}
            side={THREE.FrontSide}
          />
        ) : (
          <meshStandardMaterial key="plain" color="#141210" roughness={0.8} />
        )}
      </mesh>
      {/* 显影遮罩 */}
      <mesh geometry={geometry} position={[0, 0, 0.006]}>
        <meshBasicMaterial
          ref={developRef}
          color={selected ? '#7a3a10' : '#060504'}
          transparent
          opacity={1}
          depthWrite={false}
        />
      </mesh>
      {/* 选中描边 */}
      {selected && (
        <mesh geometry={geometry} position={[0, 0, 0.012]} scale={1.06}>
          <meshBasicMaterial color="#ff5a2a" wireframe transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}
