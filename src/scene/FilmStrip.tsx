import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { FilmStripPath, CARD_PITCH, START_ARC, filmControl, filmGlow } from './filmCurve';
import type { ArchiveEntry } from '@/data/archive';

/**
 * 连续胶片（唯一主体）：
 * 一条 BufferGeometry 三角带，画格（Frame）是胶片表面的 UV 区域——
 * 弯曲时胶片整体弯曲，画格跟随变形，不存在「图片漂浮在轨迹线上」。
 * 纹理为图集：胶片基底 + 边缘 + 齿孔 + 每格画窗（图片等比留黑框）。
 */
export const STRIP_W = 1.75; // 胶片宽（卷轴筒身长度与其一致：胶片沿轴向绕卷）
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

  // 乳剂层微观凹凸（bump）：细噪声，安全灯下轻微不均匀反光
  const bumpTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const x = c.getContext('2d')!;
    x.fillStyle = '#808080';
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 12000; i++) {
      const v = 110 + ((Math.random() * 36) | 0);
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.fillRect((Math.random() * 256) | 0, (Math.random() * 256) | 0, 2, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);

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
    // 胶片基底：深黑棕透明感 + 边缘条带，暗房中可辨认为「胶片」而非黑洞
    x.fillStyle = '#1a0f07';
    x.fillRect(0, 0, W, TEX_H);
    x.fillStyle = '#2a1c10';
    x.fillRect(0, 0, W, 10);
    x.fillRect(0, TEX_H - 10, W, 10);
    // 边缘受光面：安全灯下胶片上下缘的微弱红光反射
    x.fillStyle = 'rgba(255,84,42,0.07)';
    x.fillRect(0, 0, W, 3);
    x.fillRect(0, TEX_H - 3, W, 3);
    // 齿孔（沿整条胶片等距；外缘孔壁 + 内凹阴影 + 上缘红反光，模拟真实孔壁厚度）
    const holeW = 46, holeH = 28;
    for (let hx = 14; hx + holeW < W; hx += 0.62 * u) {
      for (const hy of [16, TEX_H - 44]) {
        x.fillStyle = '#54331a';
        x.beginPath();
        if (typeof x.roundRect === 'function') x.roundRect(hx, hy, holeW, holeH, 7);
        else x.rect(hx, hy, holeW, holeH);
        x.fill();
        x.fillStyle = '#0b0603';
        x.beginPath();
        if (typeof x.roundRect === 'function') x.roundRect(hx + 4, hy + 4, holeW - 8, holeH - 8, 5);
        else x.rect(hx + 4, hy + 4, holeW - 8, holeH - 8);
        x.fill();
        x.fillStyle = 'rgba(255,110,58,0.38)';
        x.fillRect(hx + 7, hy + 4, holeW - 14, 3);
        x.fillStyle = 'rgba(0,0,0,0.55)';
        x.fillRect(hx + 7, hy + holeH - 7, holeW - 14, 3);
      }
    }
    // 画窗（暖黑框底 + 等比图片·提亮如透光底片），位置 = 弧长坐标
    const wy0 = TEX_H * WIN_V0;
    const wy1 = TEX_H * WIN_V1;
    for (let i = 0; i < n; i++) {
      const wx0 = (START_ARC + i * CARD_PITCH + FRAME_INSET) * u;
      const wx1 = (START_ARC + i * CARD_PITCH + CARD_PITCH - 0.2 - FRAME_INSET) * u;
      x.fillStyle = '#140806';
      x.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
      const img = imagesRef.current[i];
      if (img && img.complete && img.naturalWidth > 0) {
        const ir = img.naturalWidth / img.naturalHeight;
        const wr = (wx1 - wx0) / (wy1 - wy0);
        let dw = wx1 - wx0;
        let dh = wy1 - wy0;
        if (ir > wr) dh = dw / ir;
        else dw = dh * ir;
        // 底片影像层：低对比灰度负片感 + 扩散光晕（影像像渗入乳剂层，而非贴于表面）
        const prevFilter = x.filter;
        const ix = wx0 + (wx1 - wx0 - dw) / 2;
        const iy = wy0 + (wy1 - wy0 - dh) / 2;
        x.globalAlpha = 0.26;
        x.filter = 'blur(3px) brightness(1.6) saturate(0.5)';
        x.drawImage(img, ix, iy, dw, dh);
        x.globalAlpha = 1;
        x.filter = 'brightness(1.9) contrast(0.98) saturate(0.55) sepia(0.18)';
        x.drawImage(img, ix, iy, dw, dh);
        x.filter = prevFilter;
        // 显影层半透明覆盖：极薄琥珀乳剂罩
        x.fillStyle = 'rgba(64,22,10,0.10)';
        x.fillRect(ix, iy, dw, dh);
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
    // 乳剂层纵向微纹理 + 胶片颗粒（细微不均匀，非噪点/故障效果）
    for (let gx = 0; gx < W; gx += 3) {
      x.fillStyle = `rgba(255,205,160,${0.012 + Math.random() * 0.018})`;
      x.fillRect(gx, 0, 1, TEX_H);
    }
    const grainN = Math.floor(W * 1.1);
    for (let i = 0; i < grainN; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(255,214,170,0.045)' : 'rgba(0,0,0,0.055)';
      x.fillRect(Math.random() * W, Math.random() * TEX_H, 1, 1);
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

  // ———— 边缘轮廓光（hover 时沿胶片两侧边缘的微弱红线，additive 不照亮环境） ————
  // 顶点色驱动：只有靠近光标的边缘段被点亮（局部观察灯），不整卷一起亮
  const SCAN_R = 1.8; // 观察灯半径（世界单位，高斯衰减）
  const edgeGeo = useMemo(() => {
    const m = path.sampleCount;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array((m - 1) * 4 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array((m - 1) * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    return g;
  }, [path]);
  const edgeMatRef = useRef<THREE.LineBasicMaterial>(null);
  const _t = useMemo(() => new THREE.Vector3(), []);
  const _lx = useMemo(() => new Float32Array(path.sampleCount), [path]);
  const _lz = useMemo(() => new Float32Array(path.sampleCount), [path]);
  const _rx = useMemo(() => new Float32Array(path.sampleCount), [path]);
  const _rz = useMemo(() => new Float32Array(path.sampleCount), [path]);
  // 观察灯局部显影：注入 physical shader——emissive 与 transmission 随光标距离高斯衰减
  const onBeforeCompile = useMemo(() => (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uScanPos = { value: new THREE.Vector2(999, 999) };
    shader.uniforms.uScan = { value: 0 };
    shader.uniforms.uScanR = { value: SCAN_R };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec2 uScanPos;
uniform float uScan;
uniform float uScanR;
float scanFall = 0.0;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// 观察灯扫过底片：中心明显显影，向外快速衰减，无硬边
float scanD = distance(vWorldPosition.xz, uScanPos);
scanFall = uScan * exp(-scanD * scanD / (uScanR * uScanR));
totalEmissiveRadiance *= (0.85 + scanFall * 1.8);`);
    // transmission：改 chunk 首行赋值（chunk 内联后即采样，事后改无效）
    const transChunk = THREE.ShaderChunk.transmission_fragment.replace(
      'material.transmission = transmission;',
      'material.transmission = transmission * (1.0 + scanFall * 2.2); // 观察灯下局部透光增强',
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_fragment>', transChunk);
    if (matRef.current) matRef.current.userData.shader = shader;
  }, []);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);
  useFrame(() => {
    // 观察灯 uniforms：光标世界坐标 + 邻近度（DarkroomScene 供给）
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.55; // 基值恒定；显影增强由 shader 局部项承担
      const sh = matRef.current.userData.shader as
        | { uniforms: Record<string, { value: unknown }> }
        | undefined;
      if (sh) {
        (sh.uniforms.uScanPos.value as THREE.Vector2).set(filmGlow.x, filmGlow.z);
        sh.uniforms.uScan.value = filmGlow.value;
      }
    }
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const k = Math.max(0, Math.min(path.sampleCount - 1, Math.floor(filmControl.outLength / path.ds)));
    const rewinding = filmControl.mode === 'rewinding';
    // 倒卷：画格向卷轴流动 = 图集 UV 整体滚动（filmCurve 供给滚动量）
    atlas.tex.offset.x = rewinding ? filmControl.rewindU : 0;
    (window as unknown as { __stripInfo?: unknown }).__stripInfo = {
      k,
      out: filmControl.outLength,
      mode: filmControl.mode,
      glow: filmGlow.value,
      visible: geo.drawRange.count,
    };
    if (k < 2) {
      geo.setDrawRange(0, 0);
      edgeGeo.setDrawRange(0, 0);
      return;
    }
    const m = path.sampleCount;
    let kk = k; // 实际渲染到的样本索引（倒卷时含分数片尾 k+1）
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
      // 两侧边缘点（外扩一点，供轮廓光使用）
      _lx[i] = p.x + px * (hw + 0.015);
      _lz[i] = p.z + pz * (hw + 0.015);
      _rx[i] = p.x - px * (hw + 0.015);
      _rz[i] = p.z - pz * (hw + 0.015);
    }
    // 倒卷分数片尾：末端顶点对插值在 pos[k]↔pos[k+1] 之间（此时 pos 为冻结快照，安全），
    // 片尾沿原路径连续后退，不再以 ds 为步长跳跃
    if (rewinding && k + 1 < m) {
      const tipFloat = filmControl.outLength / path.ds;
      const frac = Math.max(0, Math.min(1, tipFloat - k));
      const a = path.pos[Math.max(0, k - 1)];
      const b = path.pos[Math.min(m - 1, k + 1)];
      _t.set(b.x - a.x, 0, b.z - a.z);
      if (_t.lengthSq() < 1e-10) _t.set(path.tan0.x, 0, path.tan0.z);
      _t.normalize();
      const px = -_t.z;
      const pz = _t.x;
      const hw = STRIP_W / 2;
      const pk = path.pos[k];
      const pk1 = path.pos[k + 1];
      const mx = pk.x + (pk1.x - pk.x) * frac;
      const mz = pk.z + (pk1.z - pk.z) * frac;
      posAttr.setXYZ((k + 1) * 2, mx + px * hw, pk.y - 0.012, mz + pz * hw);
      posAttr.setXYZ((k + 1) * 2 + 1, mx - px * hw, pk.y - 0.012, mz - pz * hw);
      _lx[k + 1] = mx + px * (hw + 0.015);
      _lz[k + 1] = mz + pz * (hw + 0.015);
      _rx[k + 1] = mx - px * (hw + 0.015);
      _rz[k + 1] = mz - pz * (hw + 0.015);
      kk = k + 1;
    }
    posAttr.needsUpdate = true;
    geo.computeBoundingSphere(); // 动态顶点：raycast 包围球必须每帧重算，否则点击命中失效
    geo.setDrawRange(0, kk * 6);
    // 边缘轮廓光顶点：左缘段 + 右缘段，各 kk 段；顶点色 = 观察灯局部点亮强度
    const eAttr = edgeGeo.getAttribute('position') as THREE.BufferAttribute;
    const eCol = edgeGeo.getAttribute('color') as THREE.BufferAttribute;
    const ey = path.pos[0].y - 0.006;
    const invR2 = 1 / (SCAN_R * SCAN_R);
    const scanAt = (px: number, pz: number): number => {
      const d2 = (px - filmGlow.x) * (px - filmGlow.x) + (pz - filmGlow.z) * (pz - filmGlow.z);
      return filmGlow.value * Math.exp(-d2 * invR2);
    };
    for (let i = 0; i < kk; i++) {
      const j = Math.min(kk, i + 1);
      eAttr.setXYZ(i * 2, _lx[i], ey, _lz[i]);
      eAttr.setXYZ(i * 2 + 1, _lx[j], ey, _lz[j]);
      const o = (m - 1) * 2;
      eAttr.setXYZ(o + i * 2, _rx[i], ey, _rz[i]);
      eAttr.setXYZ(o + i * 2 + 1, _rx[j], ey, _rz[j]);
      // 顶点色：靠近光标 → 红，远离 → 黑（additive 下自然消隐）
      const cl0 = scanAt(_lx[i], _lz[i]);
      const cl1 = scanAt(_lx[j], _lz[j]);
      const cr0 = scanAt(_rx[i], _rz[i]);
      const cr1 = scanAt(_rx[j], _rz[j]);
      eCol.setXYZ(i * 2, cl0, cl0 * 0.31, cl0 * 0.19);
      eCol.setXYZ(i * 2 + 1, cl1, cl1 * 0.31, cl1 * 0.19);
      eCol.setXYZ(o + i * 2, cr0, cr0 * 0.31, cr0 * 0.19);
      eCol.setXYZ(o + i * 2 + 1, cr1, cr1 * 0.31, cr1 * 0.19);
    }
    eAttr.needsUpdate = true;
    eCol.needsUpdate = true;
    edgeGeo.setDrawRange(0, kk * 4);
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
    // 双击画格 = 关闭检视（不判断选中状态——双击对的第一击已把条目设为选中，
    // 此处若读组件闭包的 selected 可能滞后，导致判断失灵卡片关不掉）
    onSelect(null);
  };

  return (
    <>
    <mesh
      geometry={geo}
      frustumCulled={false}
      receiveShadow
      onPointerMove={handleMove}
      onPointerOut={handleOut}
      onClick={handleClick}
      onDoubleClick={handleDbl}
    >
      <meshPhysicalMaterial
        ref={matRef}
        map={atlas.tex}
        emissive="#ff2d18"
        emissiveMap={atlas.tex}
        emissiveIntensity={0.55}
        roughness={0.42}
        metalness={0.08}
        transmission={0.16}
        thickness={0.05}
        attenuationColor="#ff4520"
        attenuationDistance={2.2}
        ior={1.44}
        bumpMap={bumpTex}
        bumpScale={0.02}
        side={THREE.DoubleSide}
        onBeforeCompile={onBeforeCompile}
      />
    </mesh>
    <lineSegments geometry={edgeGeo} frustumCulled={false}>
      <lineBasicMaterial
        ref={edgeMatRef}
        color="#ffffff"
        vertexColors
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
    </>
  );
}
