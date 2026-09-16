import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { FilmStripPath, filmControl } from './filmCurve';

/**
 * 连续胶片条带：铺在卡片下方的实体胶片网格。
 * 从卷轴出口（path.pos[0]）一路连到拉出的尾端，随链式仿真每帧变形——
 * 让胶片读起来是「一条真实的胶片」，而不是一串散开的卡片轨迹。
 */
const STRIP_W = 1.75; // 条带宽（略宽于卡片 1.55）
const TILE_ARC = 2.42; // 一个纹理贴块对应的弧长（= 一帧距）

function makeStripTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d')!;
  // 胶片基底
  x.fillStyle = '#0b0806';
  x.fillRect(0, 0, 256, 128);
  // 中央略亮的片窗区（卡片坐落处）
  x.fillStyle = '#0e0a07';
  x.fillRect(0, 26, 256, 76);
  // 上下两列齿孔（安全灯下隐约可辨的圆角孔）
  x.fillStyle = '#1d1308';
  for (const y of [8, 96]) {
    for (let i = 0; i < 4; i++) {
      const rx = 14 + i * 64;
      if (typeof x.roundRect === 'function') {
        x.beginPath();
        x.roundRect(rx, y, 42, 24, 6);
        x.fill();
      } else {
        x.fillRect(rx, y, 42, 24);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function FilmStripMesh({ path }: { path: FilmStripPath }) {
  const geo = useMemo(() => {
    const m = path.sampleCount;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(m * 2 * 3);
    const nor = new Float32Array(m * 2 * 3);
    const uv = new Float32Array(m * 2 * 2);
    const idx = new Uint32Array((m - 1) * 6);
    for (let i = 0; i < m - 1; i++) {
      const a = i * 2;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
    for (let i = 0; i < m; i++) {
      nor.set([0, 1, 0], i * 6);
      nor.set([0, 1, 0], i * 6 + 3);
      const u = (i * path.ds) / TILE_ARC;
      uv.set([u, 0], i * 4);
      uv.set([u, 1], i * 4 + 2);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    return g;
  }, [path]);

  const tex = useMemo(makeStripTexture, []);
  const _t = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const k = Math.max(0, Math.min(path.sampleCount - 1, Math.floor(filmControl.outLength / path.ds)));
    (window as unknown as { __stripInfo?: unknown }).__stripInfo = {
      k,
      out: filmControl.outLength,
      draw: geo.getIndex()?.count ?? 0,
      y0: posAttr.getY(0),
      yMid: posAttr.getY(Math.floor(k / 2) * 2),
      x0: posAttr.getX(0),
      z0: posAttr.getZ(0),
      visible: geo.drawRange.count,
    };
    if (k < 2) {
      geo.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i <= k; i++) {
      const p = path.pos[i];
      path.tangentAt(i, _t);
      // 水平 ⊥ 切线的侧向，左右各半个条带宽
      const px = -_t.z;
      const pz = _t.x;
      const hw = STRIP_W / 2;
      posAttr.setXYZ(i * 2, p.x + px * hw, p.y - 0.012, p.z + pz * hw);
      posAttr.setXYZ(i * 2 + 1, p.x - px * hw, p.y - 0.012, p.z - pz * hw);
    }
    posAttr.needsUpdate = true;
    geo.setDrawRange(0, k * 6);
  });

  return (
    <mesh geometry={geo} frustumCulled={false} receiveShadow>
      <meshStandardMaterial map={tex} roughness={0.55} metalness={0.12} side={THREE.DoubleSide} />
    </mesh>
  );
}
