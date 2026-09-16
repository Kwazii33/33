import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { buildCardTexture } from './cardTexture';
import { filmControl } from './filmCurve';
import type { ArchiveEntry } from '@/data/archive';

const CARD_W = 1.55;
const CARD_H = 2.32;

interface FilmCardProps {
  entry: ArchiveEntry;
  index: number;
  arcPos: number;
  totalLength: number;
  selected: boolean;
  dimmed: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onReady: () => void;
  registerRef: (index: number, obj: THREE.Object3D | null) => void;
}

export function FilmCard({
  entry, index, arcPos, selected, dimmed, onHover, onSelect, onReady, registerRef,
}: FilmCardProps) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const developRef = useRef<THREE.MeshBasicMaterial>(null);
  const revealTime = useRef<number | null>(null);
  const lastClickAt = useRef(0); // 上一次点击时间（判定双击）
  const selectedAt = useRef(0); // 本次被选中的时刻（避免“选中它的那次连点”误关闭）

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
    // 拉出可见：胶片从卷轴里拉出多少，帧就出现多少（收卷时依次卷回）
    const shown = arcPos <= filmControl.outLength + 0.01;
    g.visible = shown;
    if (!shown) {
      revealTime.current = null;
      if (developRef.current) developRef.current.opacity = 1;
      return;
    }
    // 显影动画：刚展开的底片从潜影逐渐显现
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
      // 单击未选中的底片：选中并弹出档案卡
      selectedAt.current = now;
      onSelect(entry.id);
      return;
    }
    // 已选中：刚被这次连点选中的，稍等片刻再允许关闭（双击未选中卡片=仅打开）
    if (now - selectedAt.current < 400) return;
    // 双击（两次点击间隔 < 400ms）：关闭档案卡；单击已选中：保持打开
    if (gap < 400) tryClose();
  };
  const handleDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    if (dimmed) return;
    e.stopPropagation();
    // 原生双击兜底：任何情况下双击已选中的底片都关闭档案卡
    tryClose();
  };

  return (
    <group
      ref={(g) => {
        groupRef.current = g;
        registerRef(index, g);
      }}
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
      {/* 显影遮罩：未显影时覆盖潜影，选中时保留轻微琥珀色 */}
      <mesh geometry={geometry} position={[0, 0, 0.006]}>
        <meshBasicMaterial
          ref={developRef}
          color={selected ? '#7a3a10' : '#060504'}
          transparent
          opacity={1}
          depthWrite={false}
        />
      </mesh>
      {/* 选中描边（放大灯箱聚焦） */}
      {selected && (
        <mesh geometry={geometry} position={[0, 0, 0.012]} scale={1.06}>
          <meshBasicMaterial color="#ff5a2a" wireframe transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}
