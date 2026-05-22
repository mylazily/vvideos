/**
 * 懒加载播放器管理器
 * 只有在真正需要播放时才加载hls.js
 */

import type { PlaySource, AdSegment, SourceHealth } from './player-types';
import { CONFIG } from './player-types';

// 懒加载的模块接口
interface LazyPlayerManager {
  analyzeAdsFromSources: (sources: PlaySource[]) => Promise<AdSegment[]>;
  parseM3U8ForAds: (m3u8Url: string) => Promise<AdSegment[]>;
  getOptimizedHLSConfig: () => any;
  recordHourlySpeed: (sourceId: string, speed: number) => void;
  getCurrentHourWeight: () => number;
  adjustSourcesByHour: (sources: PlaySource[]) => PlaySource[];
  testAllSources: (sources: PlaySource[]) => Promise<SourceHealth[]>;
  testSourceHealth: (source: PlaySource) => Promise<SourceHealth>;
  selectBestSource: (sources: PlaySource[], healthResults: SourceHealth[]) => { source: PlaySource; health: SourceHealth } | null;
  createPlaybackMonitor: (videoElement: HTMLVideoElement, onBufferLow?: () => void, onError?: (error: string) => void) => any;
  createAutoSwitchManager: (sources: PlaySource[], onSwitch: (sourceIndex: number) => void) => any;
  preloadNextVideo: (sources: PlaySource[], currentIndex: number) => Promise<void>;
  resolveWithDoH: (hostname: string) => Promise<string[]>;
  checkUrlAccessible: (url: string) => Promise<boolean>;
}

// 缓存加载的模块
let cachedModule: LazyPlayerManager | null = null;

/**
 * 懒加载player-manager - 只在需要时加载
 */
export async function loadPlayerManager(): Promise<LazyPlayerManager> {
  if (cachedModule) return cachedModule;
  
  // 动态导入player-manager
  const module = await import('./player-manager');
  
  cachedModule = {
    analyzeAdsFromSources: module.analyzeAdsFromSources,
    parseM3U8ForAds: module.parseM3U8ForAds,
    getOptimizedHLSConfig: module.getOptimizedHLSConfig,
    recordHourlySpeed: module.recordHourlySpeed,
    getCurrentHourWeight: module.getCurrentHourWeight,
    adjustSourcesByHour: module.adjustSourcesByHour,
    testAllSources: module.testAllSources,
    testSourceHealth: module.testSourceHealth,
    selectBestSource: module.selectBestSource,
    createPlaybackMonitor: module.createPlaybackMonitor,
    createAutoSwitchManager: module.createAutoSwitchManager,
    preloadNextVideo: module.preloadNextVideo,
    resolveWithDoH: module.resolveWithDoH,
    checkUrlAccessible: module.checkUrlAccessible,
  };
  
  return cachedModule;
}

// 重新导出类型（不需要加载模块）
export type { PlaySource, AdSegment, SourceHealth } from './player-types';

// 导出配置常量
export { CONFIG };
