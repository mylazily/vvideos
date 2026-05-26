// 本地存储工具 - 收藏和历史记录

const HISTORY_KEY = 'vvideos_history';

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
    const data = localStorage.getItem('vvideos_favorites');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function removeFavorite(vodId: string): void {
  if (typeof window === 'undefined') return;
  const favorites = getFavorites().filter(f => f.vod_id !== vodId);
  localStorage.setItem('vvideos_favorites', JSON.stringify(favorites));
}

export function clearFavorites(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('vvideos_favorites');
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

export function removeFromHistory(vodId: string): void {
  if (typeof window === 'undefined') return;
  const history = getHistory().filter(h => h.vod_id !== vodId);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(HISTORY_KEY);
}

// ===== 通用功能 =====

export function clearAllData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('vvideos_favorites');
  localStorage.removeItem(HISTORY_KEY);
}

export function getStorageSize(): { favorites: number; history: number } {
  return {
    favorites: getFavorites().length,
    history: getHistory().length
  };
}
