/**
 * 播放器管理模块 - 增强版
 * 包含：广告检测、线路测速、DNS污染解决、预加载优化
 * hls.js在此模块内部动态加载，不会在首页加载
 */

import type { PlaySource, AdSegment, SourceHealth } from './player-types';
import { CONFIG } from './player-types';

// ============ 智能广告检测（基于多源对比） ============

/**
 * 分析多源视频，精准检测广告段
 */
export async function analyzeAdsFromSources(
  sources: PlaySource[]
): Promise<AdSegment[]> {
  if (sources.length < 2) return [];
  
  const validSources = sources.filter(s => s.duration > 0);
  if (validSources.length < 2) return [];
  
  const sorted = [...validSources].sort((a, b) => a.duration - b.duration);
  const minDuration = sorted[0].duration;
  const maxDuration = sorted[sorted.length - 1].duration;
  
  const durationDiff = maxDuration - minDuration;
  if (durationDiff < 5) return [];
  
  const adSegments: AdSegment[] = [];
  
  const extraDurations = sorted.map(s => s.duration - minDuration);
  const sourcesWithExtra = extraDurations.filter(e => e > 5).length;
  const majorityHasExtra = sourcesWithExtra >= Math.ceil(validSources.length / 2);
  
  if (majorityHasExtra) {
    const avgPreRoll = extraDurations
      .filter(e => e > 5 && e < 120)
      .reduce((a, b) => a + b, 0) / sourcesWithExtra;
    
    if (avgPreRoll >= CONFIG.AD_DETECTION.MIN_DURATION) {
      adSegments.push({
        start: 0,
        end: Math.floor(avgPreRoll),
        type: 'pre',
        confidence: Math.min(0.95, sourcesWithExtra / validSources.length),
      });
    }
  }
  
  for (const source of sources) {
    try {
      const m3u8Ads = await parseM3U8Detailed(source.url);
      for (const ad of m3u8Ads) {
        const existing = adSegments.find(
          s => Math.abs(s.start - ad.start) < 5 && Math.abs(s.end - ad.end) < 5
        );
        if (existing) {
          existing.confidence = Math.min(1, existing.confidence + 0.2);
        } else {
          adSegments.push(ad);
        }
      }
    } catch {
      // 忽略解析失败
    }
  }
  
  return adSegments
    .filter(ad => ad.confidence >= CONFIG.AD_DETECTION.CONFIDENCE_THRESHOLD)
    .sort((a, b) => a.start - b.start);
}

/**
 * 解析M3U8内容，检测广告段（简化版）
 */
export async function parseM3U8ForAds(m3u8Url: string): Promise<AdSegment[]> {
  try {
    const response = await fetch(m3u8Url);
    const content = await response.text();
    const lines = content.split('\n');
    
    const adSegments: AdSegment[] = [];
    let currentTime = 0;
    let currentDuration = 0;
    let inAdBlock = false;
    let adStartTime = 0;
    let adScore = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        const match = line.match(/#EXTINF:([\d.]+)/);
        if (match) {
          currentDuration = parseFloat(match[1]);
        }
      }
      
      if (line.endsWith('.ts') && !line.startsWith('#')) {
        const score = calculateAdScore(line, false, lines[i - 1] || '');
        
        if (score > 0.5 && !inAdBlock) {
          inAdBlock = true;
          adStartTime = currentTime;
          adScore = score;
        } else if (score <= 0.3 && inAdBlock) {
          inAdBlock = false;
          const adDuration = currentTime - adStartTime;
          if (adDuration >= 5 && adDuration <= 180) {
            adSegments.push({
              start: adStartTime,
              end: currentTime,
              type: adStartTime === 0 ? 'pre' : 'mid',
              confidence: Math.min(1, adScore),
            });
          }
        }
        
        currentTime += currentDuration;
      }
    }
    
    if (inAdBlock) {
      const adDuration = currentTime - adStartTime;
      if (adDuration >= 5 && adDuration <= 180) {
        adSegments.push({
          start: adStartTime,
          end: currentTime,
          type: adStartTime === 0 ? 'pre' : 'post',
          confidence: Math.min(1, adScore),
        });
      }
    }
    
    return adSegments;
  } catch (error) {
    return [];
  }
}

/**
 * 详细解析M3U8，检测广告段
 */
async function parseM3U8Detailed(m3u8Url: string): Promise<AdSegment[]> {
  try {
    const response = await fetch(m3u8Url);
    const content = await response.text();
    const lines = content.split('\n');
    
    const segments: Array<{ duration: number; url: string; time: number; isAd: boolean; adScore: number }> = [];
    
    let currentTime = 0;
    let currentDuration = 0;
    let inDiscontinuity = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        const match = line.match(/#EXTINF:([\d.]+)/);
        currentDuration = match ? parseFloat(match[1]) : 0;
      }
      
      if (line.includes('#EXT-X-DISCONTINUITY')) {
        inDiscontinuity = true;
      }
      
      if (line.endsWith('.ts') && !line.startsWith('#')) {
        const adScore = calculateAdScore(line, inDiscontinuity, lines[i - 1] || '');
        
        segments.push({
          duration: currentDuration,
          url: line,
          time: currentTime,
          isAd: adScore > 0.5,
          adScore,
        });
        
        currentTime += currentDuration;
        inDiscontinuity = false;
      }
    }
    
    const adSegments: AdSegment[] = [];
    let currentAdStart = -1;
    let currentAdScore = 0;
    let adSegmentCount = 0;
    
    for (const seg of segments) {
      if (seg.isAd || seg.adScore > 0.3) {
        if (currentAdStart < 0) {
          currentAdStart = seg.time;
          currentAdScore = seg.adScore;
          adSegmentCount = 1;
        } else {
          currentAdScore += seg.adScore;
          adSegmentCount++;
        }
      } else if (currentAdStart >= 0) {
        const adDuration = seg.time - currentAdStart;
        if (adDuration >= 5 && adDuration <= 180) {
          adSegments.push({
            start: currentAdStart,
            end: seg.time,
            type: currentAdStart === 0 ? 'pre' : 'mid',
            confidence: Math.min(1, currentAdScore / adSegmentCount),
          });
        }
        currentAdStart = -1;
        currentAdScore = 0;
        adSegmentCount = 0;
      }
    }
    
    if (currentAdStart >= 0) {
      const lastSeg = segments[segments.length - 1];
      const adDuration = lastSeg.time + lastSeg.duration - currentAdStart;
      if (adDuration >= 5 && adDuration <= 180) {
        adSegments.push({
          start: currentAdStart,
          end: lastSeg.time + lastSeg.duration,
          type: currentAdStart === 0 ? 'pre' : 'post',
          confidence: Math.min(1, currentAdScore / adSegmentCount),
        });
      }
    }
    
    return adSegments;
  } catch {
    return [];
  }
}

/**
 * 计算TS片段的广告分数
 */
function calculateAdScore(tsUrl: string, inDiscontinuity: boolean, prevLine: string): number {
  let score = 0;
  
  for (const pattern of CONFIG.AD_DETECTION.URL_PATTERNS) {
    if (pattern.test(tsUrl)) {
      score += 0.4;
      break;
    }
  }
  
  for (const pattern of CONFIG.AD_DETECTION.DOMAIN_PATTERNS) {
    if (pattern.test(tsUrl)) {
      score += 0.3;
      break;
    }
  }
  
  if (inDiscontinuity) score += 0.2;
  if (prevLine.includes('SCTE35') || prevLine.includes('CUE-OUT')) score += 0.3;
  if (/\d{3,4}x\d{3,4}/.test(tsUrl)) score += 0.1;
  
  return Math.min(1, score);
}

// ============ 时间段优化 ============

/**
 * 获取当前时间段权重
 */
export function getCurrentHourWeight(): number {
  const hour = new Date().getHours();
  return CONFIG.HOURLY_WEIGHTS[hour as keyof typeof CONFIG.HOURLY_WEIGHTS] || 1.0;
}

/**
 * 根据时间段调整源优先级
 */
export function adjustSourcesByHour(sources: PlaySource[]): PlaySource[] {
  const currentHour = new Date().getHours();
  
  return sources.map(source => {
    if (source.hourlySpeed && source.hourlySpeed[currentHour] !== undefined) {
      const hourSpeed = source.hourlySpeed[currentHour];
      const weight = CONFIG.HOURLY_WEIGHTS[currentHour as keyof typeof CONFIG.HOURLY_WEIGHTS] || 1.0;
      
      return {
        ...source,
        priority: source.priority * (hourSpeed / 1000) * weight,
      };
    }
    return source;
  });
}

/**
 * 记录当前时间段的速度
 */
export function recordHourlySpeed(sourceId: string, speed: number): void {
  const hour = new Date().getHours();
  const key = `speed_${sourceId}_${hour}`;
  
  try {
    const existing = localStorage.getItem(key);
    if (existing) {
      const data = JSON.parse(existing);
      data.speed = (data.speed * data.count + speed) / (data.count + 1);
      data.count++;
      localStorage.setItem(key, JSON.stringify(data));
    } else {
      localStorage.setItem(key, JSON.stringify({ speed, count: 1, hour }));
    }
  } catch {
    // 忽略localStorage错误
  }
}

// ============ 线路测速 ============

export async function testAllSources(sources: PlaySource[]): Promise<SourceHealth[]> {
  const adjustedSources = adjustSourcesByHour(sources);
  
  const results = await Promise.all(
    adjustedSources.map(source => testSourceHealth(source))
  );
  
  const hourWeight = getCurrentHourWeight();
  return results.map(health => ({
    ...health,
    hourScore: health.bandwidth * hourWeight / 1000000,
  }));
}

export async function testSourceHealth(source: PlaySource): Promise<SourceHealth> {
  const startTime = performance.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.SPEED_TEST_TIMEOUT);
    
    await fetch(source.url, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'no-cors',
      cache: 'no-store',
    });
    
    clearTimeout(timeout);
    const latency = performance.now() - startTime;
    
    return {
      id: source.id,
      available: true,
      latency,
      bandwidth: 0,
      errorRate: 0,
      lastCheck: Date.now(),
    };
  } catch {
    return {
      id: source.id,
      available: false,
      latency: Infinity,
      bandwidth: 0,
      errorRate: 1,
      lastCheck: Date.now(),
    };
  }
}

export function selectBestSource(
  sources: PlaySource[],
  healthResults: SourceHealth[]
): { source: PlaySource; health: SourceHealth } | null {
  const available = sources
    .map((source, index) => ({
      source,
      health: healthResults[index],
    }))
    .filter(item => item.health.available);
  
  if (available.length === 0) return null;
  
  available.sort((a, b) => {
    const scoreA = (a.health.hourScore || 0) * 0.4 + 
                   (a.health.bandwidth / 1000000) * 0.4 + 
                   (10000 - Math.min(a.health.latency, 10000)) / 10000 * 0.2;
    const scoreB = (b.health.hourScore || 0) * 0.4 + 
                   (b.health.bandwidth / 1000000) * 0.4 + 
                   (10000 - Math.min(b.health.latency, 10000)) / 10000 * 0.2;
    return scoreB - scoreA;
  });
  
  return available[0];
}

// ============ DNS污染解决 ============

export async function resolveWithDoH(hostname: string): Promise<string[]> {
  const results: string[] = [];
  
  for (const dohServer of CONFIG.DOH_SERVERS) {
    try {
      const response = await fetch(`${dohServer}?name=${hostname}&type=A`, {
        headers: { 'Accept': 'application/dns-json' },
      });
      
      const data = await response.json();
      
      if (data.Answer) {
        for (const answer of data.Answer) {
          if (answer.type === 1 && answer.data) {
            results.push(answer.data);
          }
        }
      }
      
      if (results.length > 0) break;
    } catch {
      // 继续尝试下一个
    }
  }
  
  return results;
}

export async function checkUrlAccessible(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    
    const directTest = await testDirectAccess(url);
    if (directTest) return true;
    
    const ips = await resolveWithDoH(urlObj.hostname);
    if (ips.length === 0) return false;
    
    for (const ip of ips) {
      const ipUrl = url.replace(urlObj.hostname, ip);
      if (await testDirectAccess(ipUrl)) return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

async function testDirectAccess(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'no-cors',
    });
    
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

// ============ 播放器监控 ============

export function createPlaybackMonitor(
  videoElement: HTMLVideoElement,
  onBufferLow?: () => void,
  onError?: (error: string) => void
) {
  let stallCount = 0;
  let stallStartTime = 0;
  let lastCurrentTime = 0;
  
  const check = () => {
    const now = performance.now();
    const currentTime = videoElement.currentTime;
    const buffered = videoElement.buffered;
    
    let bufferedAhead = 0;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= currentTime && buffered.end(i) > currentTime) {
        bufferedAhead = buffered.end(i) - currentTime;
        break;
      }
    }
    
    if (!videoElement.paused && currentTime === lastCurrentTime) {
      stallCount++;
      if (stallCount >= 2 && stallStartTime === 0) {
        stallStartTime = now;
      }
      
      if (stallStartTime > 0 && now - stallStartTime > 1500) {
        if (bufferedAhead < CONFIG.BUFFER_THRESHOLD) {
          onBufferLow?.();
        }
      }
    } else {
      stallCount = 0;
      stallStartTime = 0;
    }
    
    lastCurrentTime = currentTime;
  };
  
  const intervalId = setInterval(check, 1000);
  
  videoElement.addEventListener('error', () => {
    const error = videoElement.error;
    if (error) {
      onError?.(error.message || '播放错误');
    }
  });
  
  return {
    check,
    destroy: () => clearInterval(intervalId),
  };
}

// ============ 自动切换策略 ============

export function createAutoSwitchManager(
  sources: PlaySource[],
  onSwitch: (sourceIndex: number) => void
) {
  let currentIndex = 0;
  let errorCounts: number[] = new Array(sources.length).fill(0);
  let lastSwitchTime = 0;
  let switchHistory: number[] = [];
  
  const reportError = (index: number) => {
    errorCounts[index]++;
    switchHistory.push(index);
    if (switchHistory.length > 10) switchHistory.shift();
    
    if (errorCounts[index] >= CONFIG.ERROR_COUNT_THRESHOLD) {
      switchToNext();
    }
  };
  
  const reportSuccess = (index: number) => {
    errorCounts[index] = Math.max(0, errorCounts[index] - 1);
  };
  
  const switchToNext = () => {
    if (Date.now() - lastSwitchTime < 3000) return;
    
    const recentFails = new Set(switchHistory.slice(-5));
    
    for (let i = 1; i < sources.length; i++) {
      const nextIndex = (currentIndex + i) % sources.length;
      if (!recentFails.has(nextIndex) && errorCounts[nextIndex] < CONFIG.ERROR_COUNT_THRESHOLD) {
        currentIndex = nextIndex;
        lastSwitchTime = Date.now();
        onSwitch(currentIndex);
        return;
      }
    }
    
    let minErrors = Infinity;
    let bestIndex = currentIndex;
    for (let i = 0; i < sources.length; i++) {
      if (errorCounts[i] < minErrors) {
        minErrors = errorCounts[i];
        bestIndex = i;
      }
    }
    
    if (bestIndex !== currentIndex) {
      currentIndex = bestIndex;
      lastSwitchTime = Date.now();
      onSwitch(currentIndex);
    }
  };
  
  return {
    currentIndex: () => currentIndex,
    reportError,
    reportSuccess,
    switchToNext,
  };
}

// ============ 预加载优化 ============

export async function preloadNextVideo(
  sources: PlaySource[],
  currentIndex: number
): Promise<void> {
  const nextIndex = (currentIndex + 1) % sources.length;
  const nextSource = sources[nextIndex];
  
  if (!nextSource?.url) return;
  
  try {
    if (nextSource.url.includes('.m3u8')) {
      await fetch(nextSource.url, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'force-cache',
      });
    }
  } catch {
    // 静默失败
  }
}

// ============ HLS配置（不含Hls类）============

/**
 * 获取优化的HLS配置
 */
export function getOptimizedHLSConfig(): any {
  const hourWeight = getCurrentHourWeight();
  const isLowPerformance = hourWeight < 0.8;
  
  return {
    enableWorker: true,
    lowLatencyMode: false,
    
    // 缓冲配置 - 超大缓冲
    maxBufferLength: isLowPerformance ? 300 : 180,
    maxMaxBufferLength: isLowPerformance ? 600 : 300,
    maxBufferSize: isLowPerformance ? 200 * 1000 * 1000 : 150 * 1000 * 1000,
    maxBufferHole: 0.5,
    backBufferLength: 120,
    
    // 直播配置
    liveSyncDuration: CONFIG.HLS_BUFFER.LIVE_SYNC_DURATION,
    liveMaxLatencyDuration: CONFIG.HLS_BUFFER.LIVE_MAX_LATENCY_DURATION,
    
    // ABR配置
    startLevel: -1,
    abrEwmaDefaultEstimate: isLowPerformance ? 500000 : 1000000,
    abrBandWidthFactor: isLowPerformance ? 0.6 : 0.7,
    abrBandWidthUpFactor: isLowPerformance ? 0.4 : 0.5,
    abrMaxWithRealBitrate: true,
    
    // 超时配置
    fragLoadingTimeOut: isLowPerformance ? 45000 : 30000,
    manifestLoadingTimeOut: isLowPerformance ? 20000 : 15000,
    levelLoadingTimeOut: isLowPerformance ? 20000 : 15000,
    
    // 重试配置
    fragLoadingMaxRetry: isLowPerformance ? 8 : 6,
    manifestLoadingMaxRetry: isLowPerformance ? 5 : 3,
    levelLoadingMaxRetry: isLowPerformance ? 5 : 3,
    fragLoadingRetryDelay: isLowPerformance ? 2000 : 1000,
    
    // 其他优化
    backBufferLength: 90,
    enableCEA708Captions: false,
    enableWebVTT: false,
    enableIMSC1: false,
    enableID3Metadata: false,
  };
}

// Re-export types
export type { PlaySource, AdSegment, SourceHealth, PlaybackState } from './player-types';
