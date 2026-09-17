import { useEffect, useRef, useState } from 'react';
import { archive } from '@/data/archive';
import {
  CATEGORIES, TAGS, TAG_META, categoryOf, filterLabel, matchesFilter, type ArchiveFilter,
} from '@/data/taxonomy';
import { progressStore, rewindProgress, CARD_COUNT } from '@/lib/progress';
import { filmControl, framesOut, requestRewind } from '@/scene/filmCurve';

/** 旧版螺线场景（?v=spiral）保留原滚轮/显影进度体系 */
const IS_LEGACY = new URLSearchParams(location.search).get('v') === 'spiral';

interface HudProps {
  hovered: string | null;
  selected: string | null;
  inspect?: boolean; // 胶片单击的放大检视（显影详情卡，不受密度滑杆限制）
  developed: number;
  filter: ArchiveFilter;
  onSetFilter: (f: ArchiveFilter) => void;
  onSelectEntry: (id: string) => void;
  onCloseSelect: () => void;
}

function useDevClock() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return sec;
}

const CATEGORY_LABEL: Record<string, string> = {
  A: '经典艺术档案',
  B: '文学意象',
  C: '社会素材',
  D: '形式灵感',
};

const ACC = '#a9d94f'; // 档案绿（参考站点缀色）

export function Hud({ hovered, selected, inspect, developed, filter, onSetFilter, onSelectEntry, onCloseSelect }: HudProps) {
  const [browserOpen, setBrowserOpen] = useState(false);
  const [densityV, setDensityV] = useState(45); // 0..100 连续密度
  const sliderRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // 当前筛选下的条目
  const filtered = archive.filter((e) => matchesFilter(e, filter));

  // 密度 → 卡片尺寸 / 列数（连续可拖）；≥85 进入单张详情模式（参考 V2 的 100% 显影）
  const cardW = 96 + densityV * 1.7; // 96 .. 266
  const cardH = Math.round(cardW * 0.72);
  const gridCols = Math.max(1, Math.min(6, Math.floor(552 / cardW)));
  const detailMode = densityV >= 85 || !!inspect;
  const detailIndex = Math.max(0, filtered.findIndex((e) => e.id === selected));
  const detailEntry = filtered[detailIndex] ?? filtered[0] ?? null;

  // 滑杆拖拽
  const updateFromPointer = (clientX: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const v = Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100);
    setDensityV(v);
  };
  const handleSliderDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX);
  };
  const handleSliderMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) updateFromPointer(e.clientX);
  };
  const handleSliderUp = () => {
    dragging.current = false;
  };
  // 切换/取消筛选
  const pickCategory = (id: string) =>
    onSetFilter(filter?.kind === 'category' && filter.value === id ? null : { kind: 'category', value: id });
  const pickTag = (t: string) =>
    onSetFilter(filter?.kind === 'tag' && filter.value === t ? null : { kind: 'tag', value: t });
  const sec = useDevClock();
  const barRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const [temp, setTemp] = useState(20.0);

  // 进度条逐帧跟随：新版 = 胶卷拉出长度；旧版螺线 = 显影进度
  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (IS_LEGACY) {
        if (barRef.current) barRef.current.style.width = `${progressStore.current * 100}%`;
        if (countRef.current) countRef.current.textContent = `${Math.round(progressStore.current * CARD_COUNT)}`;
      } else {
        const ratio = filmControl.total > 0 ? filmControl.outLength / filmControl.total : 0;
        if (barRef.current) barRef.current.style.width = `${ratio * 100}%`;
        if (countRef.current) countRef.current.textContent = `${framesOut(filmControl.outLength, CARD_COUNT)}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTemp(20 + Math.sin(Date.now() / 4000) * 0.3), 1500);
    return () => clearInterval(t);
  }, []);

  const activeId = selected ?? hovered;
  const active = archive.find((e) => e.id === activeId) ?? null;
  const cat = active ? (CATEGORY_LABEL[active.id[0]] ?? '档案') : '';

  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  const developedAll = developed >= CARD_COUNT;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none font-sans">
      {/* ———— 顶部栏：标识 / 导航 / 计数 ———— */}
      <header className="absolute inset-x-0 top-0 flex h-14 items-center justify-between border-b border-white/10 bg-black/55 px-6 backdrop-blur-sm">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-lg font-bold tracking-tight text-white">DA.</span>
          <span className="hidden text-sm font-bold tracking-[0.2em] text-white sm:inline">暗房艺术档案</span>
          <span className="hidden font-display text-[10px] tracking-[0.28em] text-white/35 md:inline">
            DARKROOM ARCHIVE · EST.1826
          </span>
        </div>
        {/* 顶栏右侧：一级分类导航（右对齐，替换原 01—40 计数） */}
        <nav className="ml-auto hidden items-center gap-5 lg:flex">
          <button
            type="button"
            onClick={() => onSetFilter(null)}
            className={`pointer-events-auto relative pb-0.5 font-display text-[11px] tracking-[0.2em] transition-colors ${
              !filter ? 'text-[#a9d94f]' : 'text-white/45 hover:text-white'
            }`}
          >
            全部
            {!filter && <span className="absolute inset-x-0 -bottom-0.5 h-px bg-[#a9d94f]" />}
          </button>
          {CATEGORIES.map((c) => {
            const active = filter?.kind === 'category' && filter.value === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCategory(c.id)}
                className={`pointer-events-auto relative pb-0.5 font-display text-[11px] tracking-[0.2em] transition-colors ${
                  active ? 'text-[#a9d94f]' : 'text-white/45 hover:text-white'
                }`}
              >
                <span className="mr-1 text-[9px] text-white/25">{c.id}</span>
                {c.name}
                <span className="ml-1 text-[9px] text-white/25 tabular-nums">
                  {archive.filter((e) => categoryOf(e) === c.id).length}
                </span>
                {active && <span className="absolute inset-x-0 -bottom-0.5 h-px bg-[#a9d94f]" />}
              </button>
            );
          })}
        </nav>
      </header>

      {/* ———— 第二行左侧：安全灯（与右侧状态簇同高对齐） ———— */}
      <div className="absolute left-6 top-[70px] flex items-center gap-1.5 font-display text-[10px] tracking-[0.2em] text-white/40">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        安全灯运行中
      </div>

      {/* ———— 第二行：右侧状态簇（档案+显影 / 就绪计数，右对齐） ———— */}
      <div className="absolute right-6 top-[70px] flex items-center gap-3">
        <span className="font-display text-[11px] font-medium tracking-[0.2em] text-[#a9d94f]">
          档案 + 显影
        </span>
        <span className="h-3 w-px bg-white/15" />
        <span className="flex items-center gap-1.5 font-display text-[10px] tracking-[0.2em] text-[#a9d94f]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#a9d94f]" />
          {developedAll ? `${CARD_COUNT} 张底片就绪` : `装卷中 ${developed}/${CARD_COUNT}`}
        </span>
        {filter?.kind === 'tag' && (
          <span className="flex items-center gap-1.5 border border-[#a9d94f]/50 px-2 py-0.5 font-display text-[10px] tracking-[0.15em] text-[#a9d94f]">
            {filterLabel(filter)}
            <button type="button" onClick={() => onSetFilter(null)} className="pointer-events-auto hover:text-white">
              ✕
            </button>
          </span>
        )}
      </div>

      {/* ———— 左侧：DARKROOM AS ___ 标签维度（第二层级，点击切换筛选，顶部与右侧仪表对齐） ———— */}
      <aside className="absolute left-5 top-24 hidden sm:block">
        <p className="mb-2.5 font-display text-[9px] tracking-[0.35em] text-white/35">
          DARKROOM AS {'<?>'}
        </p>
        <ul>
          {TAGS.map((t) => {
            const active = filter?.kind === 'tag' && filter.value === t;
            return (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => pickTag(t)}
                  className="group pointer-events-auto py-1.5 text-left"
                >
                  <span
                    className={`font-display text-[12px] font-bold tracking-wide transition-colors ${
                      active ? 'text-[#a9d94f]' : 'text-white/70 group-hover:text-white'
                    }`}
                  >
                    {t}
                  </span>
                  <span
                    className={`ml-1.5 text-[12px] font-bold transition-colors ${
                      active ? 'text-[#a9d94f]' : 'text-white/70 group-hover:text-white'
                    }`}
                  >
                    | {TAG_META[t].cn}
                  </span>
                  {active && <span className="ml-1.5 inline-block h-1 w-1 rounded-full bg-[#a9d94f]" />}
                  <span className="block max-w-[176px] text-[9px] leading-snug text-white/30">
                    {TAG_META[t].def}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => setBrowserOpen((o) => !o)}
          className="pointer-events-auto mt-5 border border-white/20 px-3 py-1.5 font-display text-[10px] tracking-[0.3em] text-white/70 transition-colors hover:border-[#a9d94f] hover:text-[#a9d94f]"
        >
          {browserOpen ? '收起浏览 ✕' : '浏览档案 BROWSE ↗'}
        </button>
      </aside>

      {/* ———— 右上：暗房仪表（极简单行） ———— */}
      <aside className="absolute right-6 top-24 w-52 border-t border-white/15 pt-3">
        <dl className="space-y-1.5 font-display text-[11px]">
          {[
            ['显影计时 DEV', `${mm}:${ss}`],
            ['药液温度 TEMP', `${temp.toFixed(1)} °C`],
            ['已显影 DEV’D', `${developed} / ${CARD_COUNT}`],
            ['过片计数 FRAME', <span key="f" ref={countRef} className="tabular-nums">0</span>],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex items-baseline justify-between gap-2">
              <dt className="shrink-0 text-white/35">{label}</dt>
              <dd className="h-px flex-1 bg-white/10" />
              <dd className="text-white/85 tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <button
          onClick={() => (IS_LEGACY ? rewindProgress() : requestRewind())}
          className="pointer-events-auto mt-4 w-full border border-white/20 py-2 font-display text-[10px] tracking-[0.35em] text-white/70 transition-colors hover:border-white hover:bg-white hover:text-black"
        >
          ↺ 倒卷 REWIND
        </button>
      </aside>

      {/* ———— 右下：放大灯箱（编辑式排版） ———— */}
      {active && (
        <aside className="pointer-events-auto absolute bottom-20 right-6 w-[min(400px,86vw)] border-t-2 bg-black/65 pt-4 backdrop-blur-md" style={{ borderTopColor: ACC }}>
          <div className="flex items-baseline justify-between">
            <span className="font-display text-[10px] tracking-[0.3em] text-white/40">
              ENLARGER · {active.id} · {cat}
            </span>
            {selected && (
              <button onClick={onCloseSelect} className="font-display text-xs text-white/50 transition-colors hover:text-white">
                关闭 ✕
              </button>
            )}
          </div>
          <div className="mt-3">
            {active.image && (
              <div className="mb-4 h-40 w-full overflow-hidden">
                <img src={active.image} alt={active.title} className="h-full w-full object-cover sepia-[0.2]" />
              </div>
            )}
            <h2 className="text-xl font-black leading-tight text-white">{active.title}</h2>
            <div className="mt-3 space-y-1 border-t border-white/10 pt-3 font-display text-[11px]">
              <div className="flex justify-between gap-4">
                <span className="text-white/35">作者 ARTIST</span>
                <span className="text-right text-white/80">{active.artist}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-white/35">年份 YEAR</span>
                <span className="text-white/80">{active.year}</span>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/65">{active.description}</p>
            <p className="mt-2 font-display text-[10px] leading-relaxed tracking-wide" style={{ color: ACC }}>
              {active.darkroomRelation}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {active.keywords.map((k) => (
                <span key={k} className="border border-white/15 px-1.5 py-0.5 font-display text-[9px] tracking-wider text-white/45">
                  {k}
                </span>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* ———— 底部：显影进度（齿孔条，单色） ———— */}
      <footer className="absolute bottom-6 left-1/2 w-[min(560px,70vw)] -translate-x-1/2">
        <div className="sprocket h-3 w-full border border-white/15 bg-black/50" />
        <div className="relative mt-[3px] h-[3px] w-full bg-white/10">
          <div
            ref={barRef}
            className="h-full bg-gradient-to-r from-white/50 to-[#a9d94f]"
            style={{ width: '0%' }}
          />
        </div>
        <p className="mt-2 text-center font-display text-[9px] tracking-[0.45em] text-white/35">
          显影进度 · SCROLL TO DEVELOP
        </p>
      </footer>

      {/* ———— 左下：说明 + 操作提示 ———— */}
      <div className="absolute bottom-6 left-6 max-w-56">
        <p className="text-[11px] leading-relaxed text-white/55">
          以暗房为方法：四十份档案沿胶卷铺展，滚轮过片，逐张显影。
        </p>
        <p className="mt-2 font-display text-[10px] tracking-[0.2em]" style={{ color: ACC }}>
          移动揭露 ↓
        </p>
        <div className="mt-3 space-y-1 font-display text-[10px] leading-relaxed tracking-[0.15em] text-white/35">
          <p>拖拽 — 环绕暗房走动</p>
          <p>滚轮 — 过片显影</p>
          <p>点击底片 — 放大检视</p>
        </div>
      </div>

      {/* ———— 右下角 ———— */}
      <p className="absolute bottom-6 right-6 font-display text-[10px] tracking-[0.25em] text-white/35">
        滚动显影 <span style={{ color: ACC }}>↘</span>
      </p>

      {/* ———— 档案浏览面板：可展开/折叠，三档密度 ———— */}
      {browserOpen && (
        <section className="pointer-events-auto absolute bottom-0 right-0 top-14 z-20 flex w-[min(600px,94vw)] flex-col border-l border-white/10 bg-black/80 backdrop-blur-md">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <span className="font-display text-[10px] tracking-[0.3em] text-white/60">
              档案浏览 ARCHIVE · {filtered.length} / {CARD_COUNT}
            </span>
            <div className="flex items-center gap-3">
              {/* 显影滑杆：拖拽自由调节，越向右越"显影" */}
              <span className="font-display text-[9px] tracking-[0.25em] text-white/30">显影</span>
              <div
                ref={sliderRef}
                className="relative h-5 w-28 cursor-ew-resize touch-none"
                onPointerDown={handleSliderDown}
                onPointerMove={handleSliderMove}
                onPointerUp={handleSliderUp}
              >
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/20" />
                <div
                  className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-[#a9d94f]/70"
                  style={{ width: `${densityV}%` }}
                />
                <div
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#a9d94f] bg-black transition-transform hover:scale-125"
                  style={{ left: `${densityV}%` }}
                />
              </div>
              <button
                type="button"
                onClick={() => setBrowserOpen(false)}
                className="font-display text-xs text-white/50 transition-colors hover:text-white"
              >
                ✕
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-4 py-10 text-center font-display text-[11px] tracking-[0.3em] text-white/30">
                当前筛选无匹配底片
              </p>
            )}

            {/* —— 单张详情模式：显影拉满（≥85）时，一屏一张完整档案 —— */}
            {detailMode && detailEntry && (
              <div className="flex h-full flex-col">
                <div className="relative m-4 mb-0 flex min-h-0 flex-1 items-center justify-center overflow-hidden border border-white/10 bg-black p-6">
                  {detailEntry.image ? (
                    <img src={detailEntry.image} alt={detailEntry.title} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <span className="font-display text-4xl font-bold text-white/10">{detailEntry.id}</span>
                      <span className="px-6 text-center text-xs text-white/40">{detailEntry.title}</span>
                      <span className="font-display text-[9px] tracking-[0.3em] text-white/25">无底片 · TEXT ONLY</span>
                    </div>
                  )}
                  {/* 上一张 / 下一张 */}
                  {detailIndex > 0 && (
                    <button
                      type="button"
                      onClick={() => onSelectEntry(filtered[detailIndex - 1].id)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 border border-white/20 bg-black/60 px-2 py-3 text-white/60 transition-colors hover:border-[#a9d94f] hover:text-[#a9d94f]"
                    >
                      ‹
                    </button>
                  )}
                  {detailIndex < filtered.length - 1 && (
                    <button
                      type="button"
                      onClick={() => onSelectEntry(filtered[detailIndex + 1].id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 border border-white/20 bg-black/60 px-2 py-3 text-white/60 transition-colors hover:border-[#a9d94f] hover:text-[#a9d94f]"
                    >
                      ›
                    </button>
                  )}
                  <span className="absolute right-2 top-2 bg-black/60 px-1.5 py-0.5 font-display text-[9px] tracking-[0.2em] text-white/50 tabular-nums">
                    {detailIndex + 1} / {filtered.length}
                  </span>
                </div>

                <div className="shrink-0 p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-[10px] tracking-[0.3em] text-white/40">
                      ENLARGER · {detailEntry.id} · {CATEGORY_LABEL[detailEntry.id[0]]}
                    </span>
                    <span className="font-display text-[10px] tracking-[0.2em] text-[#a9d94f] tabular-nums">
                      {detailIndex + 1} — {filtered.length}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-black leading-tight text-white">{detailEntry.title}</h3>
                  <div className="mt-2 space-y-1 border-t border-white/10 pt-2 font-display text-[11px]">
                    <div className="flex justify-between gap-4">
                      <span className="text-white/35">作者 ARTIST</span>
                      <span className="text-right text-white/80">{detailEntry.artist}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-white/35">年份 YEAR</span>
                      <span className="text-white/80">{detailEntry.year}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/65">{detailEntry.description}</p>
                  <p className="mt-1.5 font-display text-[10px] leading-relaxed tracking-wide text-[#a9d94f]">
                    {detailEntry.darkroomRelation}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {detailEntry.keywords.map((k) => (
                      <span key={k} className="border border-white/15 px-1.5 py-0.5 font-display text-[9px] tracking-wider text-white/45">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 自适应网格：滑杆连续控制卡片尺寸与列数 */}
            {!detailMode && filtered.length > 0 && (
              <div className="grid gap-2.5 p-4" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
                {filtered.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onSelectEntry(e.id)}
                    className={`group relative overflow-hidden border text-left transition-colors ${
                      selected === e.id ? 'border-[#a9d94f]' : 'border-white/10 hover:border-[#a9d94f]/60'
                    }`}
                    style={{ height: cardH }}
                  >
                    {e.image ? (
                      <img src={e.image} alt={e.title} className="h-full w-full object-cover opacity-85 transition-opacity group-hover:opacity-100" />
                    ) : (
                      <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#141210] px-1">
                        <span className="font-display text-lg font-bold text-white/15">{e.id}</span>
                        {cardW > 150 && (
                          <span className="text-center text-[9px] leading-tight text-white/35">
                            {e.title.replace(/《|》/g, '')}
                          </span>
                        )}
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 flex items-baseline justify-between bg-black/65 px-1.5 py-0.5">
                      <span className="font-display text-[9px] tracking-wider text-white/80">{e.id}</span>
                      <span className="font-display text-[8px] tracking-[0.15em] text-white/45">{e.year}</span>
                    </span>
                    {selected === e.id && (
                      <span className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#a9d94f]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
