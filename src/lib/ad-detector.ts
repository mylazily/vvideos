// 广告检测算法
// 通过对比多源视频时长差异识别广告段

export interface VideoSource {
  url: string;
  duration: number; // 秒
  sourceName: string;
}

export interface AdSegment {
  start: number; // 广告开始时间（秒）
  end: number;   // 广告结束时间（秒）
  type: 'pre' | 'mid' | 'post'; // 前贴、中插、后贴
}

/**
 * 分析多源视频，检测广告时间段
 * 原理：相同内容的视频，无广告源的时长应该最短（或接近）
 * 有广告的源会在某些位置多出广告时长
 */
export function detectAdSegments(sources: VideoSource[]): AdSegment[] {
  if (sources.length < 2) return [];
  
  // 过滤掉无效时长
  const validSources = sources.filter(s => s.duration > 0);
  if (validSources.length < 2) return [];
  
  // 按时长排序
  const sorted = [...validSources].sort((a, b) => a.duration - b.duration);
  const minDuration = sorted[0].duration;
  const maxDuration = sorted[sorted.length - 1].duration;
  
  // 如果时长差异很小（<5秒），认为没有广告
  if (maxDuration - minDuration < 5) return [];
  
  const adSegments: AdSegment[] = [];
  
  // 计算各源的"额外时长"
  const extraDurations = sorted.map(s => s.duration - minDuration);
  
  // 检测前贴广告（开头）
  // 如果最短时长源占多数，且其他源明显更长，可能有前贴广告
  const shortSources = sorted.filter(s => s.duration - minDuration < 5);
  const longSources = sorted.filter(s => s.duration - minDuration >= 5);
  
  if (shortSources.length >= longSources.length && longSources.length > 0) {
    // 前贴广告时长（取平均）
    const preRollDuration = Math.round(
      longSources.reduce((sum, s) => sum + (s.duration - minDuration), 0) / longSources.length
    );
    
    if (preRollDuration >= 5) {
      adSegments.push({
        start: 0,
        end: preRollDuration,
        type: 'pre'
      });
    }
  }
  
  // 检测后贴广告（结尾）
  // 分析：如果视频主要内容结束后还有额外内容
  // 这里简化处理：如果时长差异较大且不是前贴，可能是后贴
  const avgExtra = extraDurations.reduce((a, b) => a + b, 0) / extraDurations.length;
  if (avgExtra > 10 && adSegments.length === 0) {
    // 可能是后贴广告
    adSegments.push({
      start: minDuration,
      end: maxDuration,
      type: 'post'
    });
  }
  
  return adSegments;
}

/**
 * 计算播放时的跳过点
 * 返回需要跳过的所有时间段
 */
export function calculateSkipPoints(sources: VideoSource[]): { skip: [number, number][]; totalAdTime: number } {
  const adSegments = detectAdSegments(sources);
  
  const skip: [number, number][] = adSegments.map(seg => [seg.start, seg.end]);
  const totalAdTime = adSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
  
  return { skip, totalAdTime };
}

/**
 * 将广告时间段转换为HLS.js配置
 * 用于在播放器中跳过广告
 */
export function generateHLSSkipConfig(sources: VideoSource[]): {
  abrController?: any;
  timelineController?: any;
} {
  const { skip } = calculateSkipPoints(sources);
  
  if (skip.length === 0) return {};
  
  // HLS.js 配置 - 通过自定义加载器跳过广告段
  return {
    timelineController: {
      // 标记广告段，让播放器自动跳过
      skipSegments: skip.map(([start, end]) => ({
        start,
        end,
        type: 'ad'
      }))
    }
  };
}

/**
 * 实时播放时的广告跳过逻辑
 * 返回当前应该跳转到的目标时间
 */
export function getSkipTargetTime(
  currentTime: number,
  adSegments: AdSegment[]
): { shouldSkip: boolean; targetTime: number } {
  for (const seg of adSegments) {
    if (currentTime >= seg.start && currentTime < seg.end) {
      return {
        shouldSkip: true,
        targetTime: seg.end
      };
    }
  }
  
  return {
    shouldSkip: false,
    targetTime: currentTime
  };
}

/**
 * 更新视频的广告段信息
 * 当采集到新源时，重新计算广告段
 */
export function updateAdSegments(
  existingSegments: string, // JSON字符串
  newSource: VideoSource,
  allSources: VideoSource[]
): string {
  const segments = detectAdSegments(allSources);
  return JSON.stringify(segments);
}

/**
 * 格式化时长显示
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '未知';
  
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 检测单个URL是否可能是广告
 * 基于URL特征分析
 */
export function isAdUrl(url: string): boolean {
  const adPatterns = [
    /\/ad\//i,
    /\/ads\//i,
    /\/advertisement\//i,
    /\/commercial\//i,
    /\?.*ad=1/i,
    /\?.*advert/i,
    /_ad\./i,
    /\.ad\./i,
  ];
  
  return adPatterns.some(pattern => pattern.test(url));
}
