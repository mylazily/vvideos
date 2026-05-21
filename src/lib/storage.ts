// 本地存储工具 - 收藏和历史记录

const FAVORITES_KEY = 'vvideos_favorites';
const HISTORY_KEY = 'vvideos_history';
const MAX_HISTORY = 100;

export interface LocalVideo {
  vod_id: string;
  title: string;
  cover: string;
  category?: string;
  vod_year?: string;
  vod_area?: string;
  vod_actor?: string;
  updated_at?: number;
}

// ===== 收藏功能 =====

export function getFavorites(): LocalVideo[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(FAVORITES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addFavorite(video: LocalVideo): void {
  if (typeof window === 'undefined') return;
  const favorites = getFavorites();
  // 检查是否已存在
  if (!favorites.find(f => f.vod_id === video.vod_id)) {
    favorites.unshift({ ...video, updated_at: Date.now() });
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }
}

export function removeFavorite(vodId: string): void {
  if (typeof window === 'undefined') return;
  const favorites = getFavorites().filter(f => f.vod_id !== vodId);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

export function isFavorite(vodId: string): boolean {
  return getFavorites().some(f => f.vod_id === vodId);
}

export function clearFavorites(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(FAVORITES_KEY);
}

// ===== 历史记录功能 =====

export interface HistoryItem extends LocalVideo {
  progress?: number; // 观看进度（秒）
  duration?: number; // 视频总时长
  last_play?: string; // 最后播放的集数
  watched_at: number; // 观看时间
}

export function getHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToHistory(video: LocalVideo & { progress?: number; duration?: number; last_play?: string }): void {
  if (typeof window === 'undefined') return;
  let history = getHistory();

  // 移除旧记录
  history = history.filter(h => h.vod_id !== video.vod_id);

  // 添加到开头
  history.unshift({
    ...video,
    watched_at: Date.now()
  });

  // 限制数量
  if (history.length > MAX_HISTORY) {
    history = history.slice(0, MAX_HISTORY);
  }

  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function removeFromHistory(vodId: string): void {
  if (typeof window === 'undefined') return;
  const history = getHistory().filter(h => h.vod_id !== vodId);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(HISTORY_KEY);
}

// 观看进度防抖定时器
let progressDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingProgress: { vodId: string; progress: number; duration?: number; lastPlay?: string } | null = null;

export function updateHistoryProgress(vodId: string, progress: number, duration?: number, lastPlay?: string): void {
  if (typeof window === 'undefined') return;

  // 保存待写入数据
  pendingProgress = { vodId, progress, duration, lastPlay };

  // 清除之前的定时器
  if (progressDebounceTimer) {
    clearTimeout(progressDebounceTimer);
  }

  // 5秒防抖，减少 localStorage 写入频率
  progressDebounceTimer = setTimeout(flushProgress, 5000);
}

export function flushProgress(): void {
  if (!pendingProgress || typeof window === 'undefined') return;

  const { vodId, progress, duration, lastPlay } = pendingProgress;
  pendingProgress = null;
  progressDebounceTimer = null;

  const history = getHistory();
  const item = history.find(h => h.vod_id === vodId);
  if (item) {
    item.progress = progress;
    if (duration) item.duration = duration;
    if (lastPlay) item.last_play = lastPlay;
    item.watched_at = Date.now();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }
}

// ===== 通用功能 =====

export function clearAllData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(FAVORITES_KEY);
  localStorage.removeItem(HISTORY_KEY);
}

export function getStorageSize(): { favorites: number; history: number } {
  return {
    favorites: getFavorites().length,
    history: getHistory().length
  };
}
