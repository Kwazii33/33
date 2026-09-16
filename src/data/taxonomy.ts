import type { ArchiveEntry } from './archive';

/** 四大类（一级分类） */
export type CategoryId = 'A' | 'B' | 'C' | 'D';

export interface Category {
  id: CategoryId;
  name: string;
  en: string;
}

export const CATEGORIES: Category[] = [
  { id: 'A', name: '经典艺术档案', en: 'CLASSIC ARCHIVE' },
  { id: 'B', name: '文学意象', en: 'LITERARY IMAGE' },
  { id: 'C', name: '社会素材', en: 'SOCIAL MATERIAL' },
  { id: 'D', name: '形式灵感', en: 'FORMAL INSPIRATION' },
];

/** 五个标签维度：DARKROOM AS ___ */
export type Tag = 'IMAGE' | 'ISOLATION' | 'STORAGE' | 'HIDDEN' | 'PROCESS';

export const TAG_META: Record<Tag, { cn: string; def: string }> = {
  IMAGE: { cn: '成像', def: '从不可见到可见。' },
  ISOLATION: { cn: '隔离', def: '通过遮光与密闭建立与外界隔离的环境。' },
  STORAGE: { cn: '保存', def: '把影像、记忆、信息固定并留下。' },
  HIDDEN: { cn: '隐藏', def: '让内容处于不可见、私密或未公开状态。' },
  PROCESS: { cn: '处理', def: '通过一系列隐藏的步骤改变原始材料，最终形成结果。' },
};

export const TAGS = Object.keys(TAG_META) as Tag[];

/** 全库总条数（当前页面只装载一部分） */
export const TOTAL_IN_DB = 200;

/** 当前筛选条件 */
export type ArchiveFilter = { kind: 'category' | 'tag'; value: string } | null;

export function categoryOf(entry: ArchiveEntry): CategoryId {
  return entry.id[0] as CategoryId;
}

/** 从关键词推导标签（关键词中已内嵌标签名） */
export function tagsOf(entry: ArchiveEntry): Tag[] {
  const hit = new Set<Tag>();
  for (const k of entry.keywords) {
    if (/IMAGE|成像/.test(k)) hit.add('IMAGE');
    if (/ISOLATION|隔绝|隔离/.test(k)) hit.add('ISOLATION');
    if (/STORAGE|保存/.test(k)) hit.add('STORAGE');
    if (/HIDDEN|隐藏/.test(k)) hit.add('HIDDEN');
    if (/PROCESS|加工|处理/.test(k)) hit.add('PROCESS');
  }
  return TAGS.filter((t) => hit.has(t));
}

export function matchesFilter(entry: ArchiveEntry, filter: ArchiveFilter): boolean {
  if (!filter) return true;
  if (filter.kind === 'category') return categoryOf(entry) === filter.value;
  return tagsOf(entry).includes(filter.value as Tag);
}

/** 筛选条件的显示名 */
export function filterLabel(filter: ArchiveFilter): string {
  if (!filter) return '';
  if (filter.kind === 'category') {
    return CATEGORIES.find((c) => c.id === filter.value)?.name ?? filter.value;
  }
  const t = filter.value as Tag;
  return `${t} ${TAG_META[t]?.cn ?? ''}`;
}
