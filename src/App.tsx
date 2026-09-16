import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DarkroomScene } from '@/scene/DarkroomScene';
import { DarkroomSceneSpiral } from '@/scene-legacy/DarkroomSceneSpiral';
import { Hud } from '@/hud/Hud';
import { archive } from '@/data/archive';
import {
  CATEGORIES, TAGS, TAG_META, TOTAL_IN_DB,
  categoryOf, type ArchiveFilter,
} from '@/data/taxonomy';
import { advanceProgress, developAll } from '@/lib/progress';

/** 旧版螺线场景（?v=spiral）保留滚轮过片，用于对照浏览 */
const IS_LEGACY_SPIRAL = new URLSearchParams(location.search).get('v') === 'spiral';

function SceneSetup() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.background = new THREE.Color('#050403');
    scene.fog = new THREE.Fog('#050403', 26, 78);
    return () => {
      scene.background = null;
      scene.fog = null;
    };
  }, [scene]);
  return null;
}

export default function App() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [developed, setDeveloped] = useState(0);
  const [ready, setReady] = useState(false);
  const [minTimeUp, setMinTimeUp] = useState(false);
  const [entered, setEntered] = useState(false);
  const [filter, setFilter] = useState<ArchiveFilter>(null);
  const enteredRef = useRef(false);

  // 主页（封面）停留期间滚轮不驱动过片
  useEffect(() => {
    enteredRef.current = entered;
  }, [entered]);

  // Hero 至少展示一段时间，避免一闪而过
  useEffect(() => {
    const t = setTimeout(() => setMinTimeUp(true), 2800);
    return () => clearTimeout(t);
  }, []);

  // 新版场景：主输入是鼠标移动（pointermove 牵引胶卷），滚轮完全移除；
  // 仅旧版螺线场景（?v=spiral）保留滚轮过片，便于对照浏览
  useEffect(() => {
    if (!IS_LEGACY_SPIRAL) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!enteredRef.current) return;
      advanceProgress(e.deltaY * 0.00038);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  const handleCardReady = useCallback(() => {
    setDeveloped((d) => d + 1);
  }, []);

  useEffect(() => {
    if (developed >= archive.length && minTimeUp) {
      const t = setTimeout(() => setReady(true), 600);
      return () => clearTimeout(t);
    }
  }, [developed, minTimeUp]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#050403]">
      <Canvas
        shadows
        gl={{ antialias: true }}
        camera={{ fov: 42, near: 0.1, far: 220 }}
        onPointerMissed={() => setSelected(null)}
      >
        <SceneSetup />
        {new URLSearchParams(location.search).get('v') === 'spiral' ? (
          <DarkroomSceneSpiral
            hovered={hovered}
            selected={selected}
            filter={filter}
            onHover={setHovered}
            onSelect={setSelected}
            onCardReady={handleCardReady}
          />
        ) : (
          <DarkroomScene
            hovered={hovered}
            selected={selected}
            filter={filter}
            onHover={setHovered}
            onSelect={setSelected}
            onCardReady={handleCardReady}
          />
        )}
      </Canvas>

      {entered && (
        <Hud
          hovered={hovered}
          selected={selected}
          developed={developed}
          filter={filter}
          onSetFilter={setFilter}
          onSelectEntry={setSelected}
          onCloseSelect={() => setSelected(null)}
        />
      )}

      {/* 封面主页：装卷完成后停留，点击/滚轮进入三维暗房 */}
      {!entered && (
        <div
          className="fixed inset-0 z-20 flex select-none flex-col bg-black font-sans"
          onClick={() => {
            if (!ready) return;
            setEntered(true);
            if (!IS_LEGACY_SPIRAL) developAll(); // 新版：入场即全部渐显（滚轮已移除）
          }}
        >
          {/* 顶栏 */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-6">
            <span className="font-display text-lg font-bold tracking-tight text-white">DA.</span>
            <nav className="hidden gap-8 font-display text-[11px] tracking-[0.3em] text-white/45 md:flex">
              <span>胶卷展卷</span>
              <span>滚轮显影</span>
              <span>点击检视</span>
            </nav>
            <span className="font-display text-[11px] tracking-[0.25em] text-white/60">01—{String(archive.length).padStart(2, '0')}</span>
          </header>

          {/* 绿色点缀标签 */}
          <div className="flex shrink-0 items-start justify-between px-6 pt-6">
            <span className="font-display text-[11px] font-medium tracking-[0.2em] text-[#a9d94f]">档案 + 显影</span>
            <span className="flex items-center gap-1.5 font-display text-[10px] tracking-[0.2em] text-[#a9d94f]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#a9d94f]" />
              {ready ? '底片就绪 · READY' : '装卷中 · LOADING NEGATIVES'}
            </span>
          </div>

          {/* 主体：左目录 + 右标签体系 + 超大叠印标题 */}
          <div className="relative flex-1">
            {/* —— 信息层级：一级分类 + 标签维度（可点击，点击即带筛选进入） —— */}
            <div className="absolute left-6 top-[12%] max-w-[46%]">
              <p className="mb-2 font-display text-[10px] tracking-[0.35em] text-white/35">
                目录 / INDEX
              </p>
              <ul>
                {CATEGORIES.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setFilter({ kind: 'category', value: c.id })}
                      className="group flex flex-wrap items-baseline gap-x-2.5 py-1 text-left"
                    >
                      <span className="font-display text-[10px] tracking-widest text-white/30 transition-colors group-hover:text-[#a9d94f]">
                        0{i + 1}
                      </span>
                      <span className="text-base font-bold leading-tight tracking-wide text-white/85 transition-colors group-hover:text-[#a9d94f] md:text-lg">
                        {c.name}
                      </span>
                      <span className="hidden font-display text-[9px] tracking-[0.25em] text-white/25 lg:inline">
                        {c.en}
                      </span>
                      <span className="font-display text-[10px] text-white/35 tabular-nums">
                        {archive.filter((e) => categoryOf(e) === c.id).length} 条
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-display text-[9px] tracking-[0.2em] text-white/25">
                本页装载 {archive.length} 条 · 全库 {TOTAL_IN_DB} 条
              </p>

              <p className="mb-2 mt-7 font-display text-[10px] tracking-[0.35em] text-white/35">
                DARKROOM AS {'<?>'}
              </p>
              <ul>
                {TAGS.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      onClick={() => setFilter({ kind: 'tag', value: t })}
                      className="group py-1 text-left"
                    >
                      <span className="font-display text-sm font-bold tracking-wide text-white/85 transition-colors group-hover:text-[#a9d94f]">
                        {t}
                      </span>
                      <span className="ml-2 text-sm font-bold text-white/85 transition-colors group-hover:text-[#a9d94f]">
                        | {TAG_META[t].cn}
                      </span>
                      <span className="block text-[10px] leading-snug text-white/35">
                        {TAG_META[t].def}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <h1 className="absolute bottom-[6%] right-4 select-none leading-[0.82] md:right-10">
              <span className="block text-right font-display text-[26vw] font-bold tracking-tighter text-white md:text-[19vw]">
                暗房
              </span>
              <span className="display-outline absolute -top-[0.62em] right-[0.9em] -z-10 text-right font-display text-[15vw] font-bold tracking-tighter md:text-[11vw]">
                DARK
              </span>
              <span className="block text-right font-display text-[11vw] font-bold tracking-tighter text-white/90 md:text-[8vw]">
                ARCHIVE<span className="text-[#a9d94f]">.</span>
              </span>
            </h1>
          </div>

          {/* 左下：说明 + 装卷进度 / 进入提示 */}
          <div className="absolute bottom-8 left-6 max-w-64">
            <p className="text-[11px] leading-relaxed text-white/55">
              以暗房为方法：四十份档案沿胶卷铺展，滚轮过片，逐张显影。左侧按四大类归档，右侧按五种暗房属性标记，点击任意一项即带筛选进入。
            </p>
            {ready ? (
              <p className="mt-3 animate-pulse font-display text-[11px] tracking-[0.25em] text-[#a9d94f]">
                进入暗房 · CLICK TO ENTER ↘
              </p>
            ) : (
              <>
                <p className="mt-3 font-display text-[10px] tracking-[0.25em] text-[#a9d94f]">
                  装卷中 {developed}/{archive.length} ↓
                </p>
                <div className="mt-2 h-px w-40 bg-white/15">
                  <div
                    className="h-full bg-[#a9d94f] transition-all duration-500"
                    style={{ width: `${(developed / archive.length) * 100}%` }}
                  />
                </div>
              </>
            )}
          </div>
          <p className="absolute bottom-8 right-6 font-display text-[10px] tracking-[0.25em] text-white/35">
            {ready ? (
              <>点击进入 <span className="text-[#a9d94f]">↘</span></>
            ) : (
              <>滚动显影 <span className="text-[#a9d94f]">↘</span></>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
