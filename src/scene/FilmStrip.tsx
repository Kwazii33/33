import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { FilmStripPath, CARD_PITCH, START_ARC, filmControl } from './filmCurve';
import type { ArchiveEntry } from '@/data/archive';

/**
 * 连续胶片（唯一主体）：
 * 一条 BufferGeometry 三角带，画格（Frame）是胶片表面的 UV 区域——
 * 弯曲时胶片整体弯曲，画格跟随变形，不存在「图片漂浮在轨迹线上」。
 * 纹理为图集：胶片基底 + 边缘 + 齿孔 + 每格画窗（图片等比留黑框）。
 */
const STRIP_W = 1.75; // 胶片宽
const TEX_H = 256;
const WIN_V0 = 0.22; // 画窗 v 向上下留白（齿孔区）
const WIN_V1 = 0.78;
const FRAME_INSET = 0.1; // 画窗左右留白（弧长）

interface FilmStripProps {
  path: FilmStripPath;
  entries: ArchiveEntry[]; // 画格内容（测试期 5 张）
  totalCount: number; // 档案总数（装卷计数用，测试期仍为 40）
  dimmed: (entry: ArchiveEntry) => boolean;
  selected: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onReady: () => void;
}

/** 弧长 → 纹理 u */
function arcToU(path: FilmStripPath, s: number): number {
  return s / path.maxOut;
}

export function FilmStrip({ path, entries, totalCount, dimmed, selected, onHover, onSelect, onReady }: FilmStripProps) {
  const n = entries.length;

  // ———— 图集纹理（首帧即存在，之后按需重绘） ————
  // 画布横向直接映射弧长（px = 弧长 × pxPerU），画窗位置 = 真实弧长坐标，
  // 与交互命中区 frameAt（START_ARC + i·CARD_PITCH）严格一致。
  const atlas = useMemo(() => {
    const pxPerU = Math.max(48, Math.min(128, Math.floor(16000 / path.maxOut)));
    const cvs = document.createElement('canvas');
    cvs.width = Math.ceil(path.maxOut * pxPerU);
    cvs.height = TEX_H;
    const t = new THREE.CanvasTexture(cvs);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    return { cvs, tex: t, pxPerU };
  }, [path]);

  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // 画格图片加载（装卷期）；每格加载完成计入装卷计数
  useEffect(() => {
    let alive = true;
    imagesRef.current = entries.map((e) => {
      if (!e.image) {
        setTimeout(() => {
          if (!alive) return;
          setLoadedCount((c) => c + 1);
          onReadyRef.current();
        }, 0);
        return null;
      }
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        setLoadedCount((c) => c + 1);
        onReadyRef.current();
      };
      img.onerror = () => {
        if (!alive) return;
        setLoadedCount((c) => c + 1);
        onReadyRef.current();
      };
      img.src = e.image!;
      return img;
    });
    return () => {
      alive = false;
    };
  }, [entries]);

  // 非胶片上的档案条目：立即计入装卷（它们没有 3D 画格）
  useEffect(() => {
    for (let i = n; i < totalCount; i++) onReadyRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, totalCount]);

  const dimmedArr = useMemo(() => entries.map(dimmed), [entries, dimmed]);
  const dimKey = dimmedArr.map((d) => (d ? '1' : '0')).join('') + '|' + (selected ?? '');

  // 图集绘制（图片加载 / 筛选变化 / 选中变化时重绘）
  useEffect(() => {
    const x = atlas.cvs.getContext('2d')!;
    const W = atlas.cvs.width;
    const u = atlas.pxPerU;
    // 胶片基底 + 边缘（微亮于台面，暗房中可辨认为「胶片」而非黑洞）
    x.fillStyle = '#181009';
    x.fillRect(0, 0, W, TEX_H);
    x.fillStyle = '#2a1c10';
    x.fillRect(0, 0, W, 10);
    x.fillRect(0, TEX_H - 10, W, 10);
    // 齿孔（沿整条胶片等距，圆角方孔）
    x.fillStyle = '#4a2e16';
    const holeW = 46, holeH = 28;
    for (let hx = 14; hx + holeW < W; hx += 0.62 * u) {
      for (const hy of [16, TEX_H - 44]) {
        x.beginPath();
        if (typeof x.roundRect === 'function') {
          x.roundRect(hx, hy, holeW, holeH, 7);
          x.fill();
        } else {
          x.fillRect(hx, hy, holeW, holeH);
        }
      }
    }
    // 画窗（黑框底 + 等比图片），位置 = 弧长坐标
    const wy0 = TEX_H * WIN_V0;
    const wy1 = TEX_H * WIN_V1;
    for (let i = 0; i < n; i++) {
      const wx0 = (START_ARC + i * CARD_PITCH + FRAME_INSET) * u;
      const wx1 = (START_ARC + i * CARD_PITCH + CARD_PITCH - 0.2 - FRAME_INSET) * u;
      x.fillStyle = '#000000';
      x.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
      const img = imagesRef.current[i];
      if (img && img.complete && img.naturalWidth > 0) {
        const ir = img.naturalWidth / img.naturalHeight;
        const wr = (wx1 - wx0) / (wy1 - wy0);
        let dw = wx1 - wx0;
        let dh = wy1 - wy0;
        if (ir > wr) dh = dw / ir;
        else dw = dh * ir;
        x.drawImage(img, wx0 + (wx1 - wx0 - dw) / 2, wy0 + (wy1 - wy0 - dh) / 2, dw, dh);
      }
      // 筛选淡化
      if (dimmedArr[i]) {
        x.fillStyle = 'rgba(5,4,3,0.82)';
        x.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
      }
      // 选中描边
      if (selected === entries[i].id) {
        x.strokeStyle = '#ff5a2a';
        x.lineWidth = 5;
        x.strokeRect(wx0 + 3, wy0 + 3, wx1 - wx0 - 6, wy1 - wy0 - 6);
      }
      // 画窗压板亮线
      x.fillStyle = 'rgba(64,42,24,0.95)';
      x.fillRect(wx0 - 4, wy0 - 4, wx1 - wx0 + 8, 3);
      x.fillRect(wx0 - 4, wy1 + 1, wx1 - wx0 + 8, 3);
    }
    atlas.tex.needsUpdate = true;
  }, [atlas, n, loadedCount, dimKey, entries, dimmedArr, selected]);

  // ———— 几何（预分配，每帧按拉出长度填充） ————
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
      const u = arcToU(path, i * path.ds);
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

  const _t = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const k = Math.max(0, Math.min(path.sampleCount - 1, Math.floor(filmControl.outLength / path.ds)));
    (window as unknown as { __stripInfo?: unknown }).__stripInfo = {
      k,
      out: filmControl.outLength,
      mode: filmControl.mode,
      visible: geo.drawRange.count,
    };
    if (k < 2) {
      geo.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i <= k; i++) {
      const p = path.pos[i];
      // 侧向只用已激活段（0..k）估切线——tangentAt 会读到 pos[k+1]（未激活的收纳位），
      // 把末端四边形拉成多余三角形
      const a = path.pos[Math.max(0, i - 1)];
      const b = path.pos[Math.min(k, i + 1)];
      _t.set(b.x - a.x, 0, b.z - a.z);
      if (_t.lengthSq() < 1e-10) _t.set(path.tan0.x, 0, path.tan0.z);
      _t.normalize();
      const px = -_t.z;
      const pz = _t.x;
      const hw = STRIP_W / 2;
      posAttr.setXYZ(i * 2, p.x + px * hw, p.y - 0.012, p.z + pz * hw);
      posAttr.setXYZ(i * 2 + 1, p.x - px * hw, p.y - 0.012, p.z - pz * hw);
    }
    posAttr.needsUpdate = true;
    geo.setDrawRange(0, k * 6);
  });

  // ———— 交互：画格 = 胶片表面 UV 区域 ————
  const lastClickAt = useRef(0);
  const selectedAt = useRef(0);
  const frameAt = (u: number): number => {
    const s = u * path.maxOut;
    if (s < START_ARC || s > START_ARC + n * CARD_PITCH) return -1;
    const i = Math.floor((s - START_ARC) / CARD_PITCH);
    return i >= 0 && i < n ? i : -1;
  };
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    if (filmControl.mode !== 'locked' || !e.uv) return;
    const i = frameAt(e.uv.x);
    if (i < 0 || dimmedArr[i]) {
      onHover(null);
      return;
    }
    e.stopPropagation();
    onHover(entries[i].id);
    document.body.style.cursor = 'pointer';
  };
  const handleOut = () => {
    onHover(null);
    document.body.style.cursor = 'auto';
  };
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!e.uv) return;
    if (filmControl.mode === 'drawing') {
      // 拉出中：左键 = 确认位置（不触发检视）
      e.stopPropagation();
      return;
    }
    if (filmControl.mode !== 'locked') return;
    const i = frameAt(e.uv.x);
    if (i < 0 || dimmedArr[i]) return;
    e.stopPropagation();
    const now = performance.now();
    const gap = now - lastClickAt.current;
    lastClickAt.current = now;
    if (selected !== entries[i].id) {
      selectedAt.current = now;
      onSelect(entries[i].id);
      return;
    }
    if (now - selectedAt.current < 400) return;
    if (gap < 400) onSelect(null);
  };
  const handleDbl = (e: ThreeEvent<MouseEvent>) => {
    if (filmControl.mode !== 'locked') return;
    if (!e.uv) return;
    const i = frameAt(e.uv.x);
    if (i < 0 || dimmedArr[i]) return;
    e.stopPropagation();
    if (selected === entries[i].id) onSelect(null);
  };

  return (
    <mesh
      geometry={geo}
      frustumCulled={false}
      receiveShadow
      onPointerMove={handleMove}
      onPointerOut={handleOut}
      onClick={handleClick}
      onDoubleClick={handleDbl}
    >
      <meshStandardMaterial map={atlas.tex} roughness={0.55} metalness={0.12} side={THREE.DoubleSide} />
    </mesh>
  );
}
