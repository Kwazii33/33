// 全局显影进度模型：滚轮累加目标值，每帧阻尼插值逼近
export const progressStore = {
  target: 0,
  current: 0,
};

export const CARD_COUNT = 40;

export function advanceProgress(delta: number) {
  progressStore.target = Math.min(1, Math.max(0, progressStore.target + delta));
}

export function rewindProgress() {
  progressStore.target = 0;
}

/** 进入场景时全部显影（滚轮已移除，改为一入场即全部渐显） */
export function developAll() {
  progressStore.target = 1;
}
