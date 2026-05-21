/**
 * 播放器管理模块 - 增强版
 * 解决：速率低/卡顿、DNS污染、TS广告、多源切换
 * 新增：智能广告检测、动态缓冲策略、时间段优化
 */

// ============ 类型定义 ============
export interface PlaySource {
  id: string;
  url: string;
  name: string;
  duration: number;
  priority: number;
  latency?: number;
  bandwidth?: number;
  errorCount?: number;
  lastError?: string;
  // 时间段速率记录
  hourlySpeed?: Record<number, number>;
}

export interface AdSegment {
  start: number;
  end: number;
  type: 'pre' | 'mid' | 'post';
  url?: string;
  confidence: number; // 置信度 0-1
}

export interface SourceHealth {
  id: string;
  available: boolean;
  latency: number;
  bandwidth: number;
  errorRate: number;
  lastCheck: number;
  // 时间段评分
  hourScore?: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  bufferedAhead: number;
  currentBitrate: number;
  droppedFrames: number;
}

// ============ 常量配置 ============
const CONFIG = {
  // 测速配置
  SPEED_TEST_TIMEOUT: 5000,        // 测速超时5秒（高峰期可能慢）
  SPEED_TEST_CHUNKS: 5,            // 测速片段数
  MIN_BANDWIDTH: 300000,           // 最低带宽300kbps（降低要求）
  
  // 切换阈值
  LATENCY_THRESHOLD: 3000,         // 延迟阈值3秒
  BUFFER_THRESHOLD: 10,            // 缓冲阈值10秒（增大）
  ERROR_COUNT_THRESHOLD: 2,        // 连续错误阈值（降低）
  
  // HLS缓冲配置
  HLS_BUFFER: {
    MAX_BUFFER_LENGTH: 180,        // 最大缓冲180秒（3分钟）
    MAX_MAX_BUFFER_LENGTH: 300,    // 最大缓冲上限300秒（5分钟）
    MAX_BUFFER_SIZE: 100 * 1000 * 1000, // 100MB
    LIVE_SYNC_DURATION: 3,         // 直播同步时长
    LIVE_MAX_LATENCY_DURATION: 10, // 直播最大延迟
  },
  
  // 广告检测 - 增强版
  AD_DETECTION: {
    MIN_DURATION: 5,               // 广告最短5秒
    MAX_DURATION: 180,             // 广告最长3分钟
    CONFIDENCE_THRESHOLD: 0.6,     // 置信度阈值
    // 广告URL特征
    URL_PATTERNS: [
      /ad[_\-]/i, /ads[_\-]/i, /commercial/i, /preroll/i, /midroll/i, /postroll/i,
      /[_\-]ad\./i, /\/ad\//i, /advert/i, /promo/i, /sponsor/i,
      /\/(ad|ads|adv|advertisement|commercial|promo|sponsor)\//i,
      /(pre|mid|post)[_\-]?roll/i,
    ],
    // 广告域名特征
    DOMAIN_PATTERNS: [
      /\.ad\./i, /\.ads\./i, /advert/i, /doubleclick/i, /googlesyndication/i,
    ],
  },
  
  // 时间段权重（24小时制，0-23）
  // 基于常见资源站高峰期经验
  HOURLY_WEIGHTS: {
    // 凌晨低峰期，速度快
    0: 1.2, 1: 1.2, 2: 1.2, 3: 1.2, 4: 1.2, 5: 1.2, 6: 1.1,
    // 上午平稳
    7: 1.0, 8: 1.0, 9: 1.0, 10: 1.0, 11: 1.0,
    // 中午小高峰
    12: 0.9, 13: 0.9,
    // 下午平稳
    14: 1.0, 15: 1.0, 16: 1.0, 17: 1.0,
    // 晚上高峰期，速度慢
    18: 0.8, 19: 0.7, 20: 0.6, 21: 0.6, 22: 0.7, 23: 0.9,
  },
  
  // DoH服务器
  DOH_SERVERS: [
    'https://dns.alidns.com/dns-query',    // 阿里DNS
    'https://doh.pub/dns-query',           // 腾讯DNSPod
    'https://dns.google/dns-query',        // Google DNS
    'https://cloudflare-dns.com/dns-query', // Cloudflare DNS
  ],
};

// ============ 智能广告检测（基于多源对比） ============

/**
 * 分析多源视频，精准检测广告段
 * 原理：
 * 1. 对比多源时长差异
 * 2. 分析TS片段URL特征
 * 3. 检测不连续点（DISCONTINUITY）
 * 4. 计算置信度
 */
export async function analyzeAdsFromSources(
  sources: PlaySource[]
): Promise<AdSegment[]> {
  if (sources.length < 2) return [];
  
  const validSources = sources.filter(s => s.duration > 0);
  if (validSources.length < 2) return [];
  
  // 按时长排序
  const sorted = [...validSources].sort((a, b) => a.duration - b.duration);
  const minDuration = sorted[0].duration;
  const maxDuration = sorted[sorted.length - 1].duration;
  
  // 时长差异
  const durationDiff = maxDuration - minDuration;
  if (durationDiff < 5) return []; // 差异太小，无广告
  
  const adSegments: AdSegment[] = [];
  
  // 分析各源的额外时长分布
  const extraDurations = sorted.map(s => s.duration - minDuration);
  
  // 检测前贴广告（多个源都有额外时长，且集中在开头）
  const sourcesWithExtra = extraDurations.filter(e => e > 5).length;
  const majorityHasExtra = sourcesWithExtra >= Math.ceil(validSources.length / 2);
  
  if (majorityHasExtra) {
    // 计算平均前贴广告时长
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
  
  // 检测中插广告（某些源中间有不连续点）
  // 需要解析m3u8详细分析
  for (const source of sources) {
    try {
      const m3u8Ads = await parseM3U8Detailed(source.url);
      // 合并检测结果，提高置信度
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
  
  // 按置信度过滤
  return adSegments
    .filter(ad => ad.confidence >= CONFIG.AD_DETECTION.CONFIDENCE_THRESHOLD)
    .sort((a, b) => a.start - b.start);
}

/**
 * 解析M3U8内容，检测广告段（简化版，用于单源检测）
 */
export async function parseM3U8ForAds(m3u8Url: string): Promise<AdSegment[]> {
  try {
    const response = await fetch(m3u8Url);
    const content = await response.text();
    const lines = content.split('\n');
    
    const segments: Array<{ duration: number; url: string; time: number }> = [];
    const adSegments: AdSegment[] = [];
    
    let currentTime = 0;
    let currentDuration = 0;
    let inAdBlock = false;
    let adStartTime = 0;
    let adScore = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 解析时长
      if (line.startsWith('#EXTINF:')) {
        const match = line.match(/#EXTINF:([\d.]+)/);
        if (match) {
          currentDuration = parseFloat(match[1]);
        }
      }
      
      // 解析TS片段
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
        segments.push({ duration: currentDuration, url: line, time: currentTime });
      }
    }
    
    // 处理结尾的广告
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
    console.error('M3U8解析失败:', error);
    return [];
  }
}

/**
 * 详细解析M3U8，检测广告段（多源对比用）
 */
async function parseM3U8Detailed(m3u8Url: string): Promise<AdSegment[]> {
  try {
    const response = await fetch(m3u8Url);
    const content = await response.text();
    const lines = content.split('\n');
    
    const segments: Array<{
      duration: number;
      url: string;
      time: number;
      isAd: boolean;
      adScore: number;
    }> = [];
    
    let currentTime = 0;
    let currentDuration = 0;
    let currentUrl = '';
    let inDiscontinuity = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 解析时长
      if (line.startsWith('#EXTINF:')) {
        const match = line.match(/#EXTINF:([\d.]+)/);
        currentDuration = match ? parseFloat(match[1]) : 0;
      }
      
      // 检测不连续点
      if (line.includes('#EXT-X-DISCONTINUITY')) {
        inDiscontinuity = true;
      }
      
      // 解析TS片段
      if (line.endsWith('.ts') && !line.startsWith('#')) {
        currentUrl = line;
        
        // 计算广告分数
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
    
    // 分析连续的广告段
    const adSegments: AdSegment[] = [];
    let currentAdStart = -1;
    let currentAdScore = 0;
    let adSegmentCount = 0;
    
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      
      if (seg.isAd || seg.adScore > 0.3) {
        if (currentAdStart < 0) {
          currentAdStart = seg.time;
          currentAdScore = seg.adScore;
          adSegmentCount = 1;
        } else {
          currentAdScore += seg.adScore;
          adSegmentCount++;
        }
      } else {
        if (currentAdStart >= 0) {
          const adDuration = seg.time - currentAdStart;
          if (adDuration >= CONFIG.AD_DETECTION.MIN_DURATION && 
              adDuration <= CONFIG.AD_DETECTION.MAX_DURATION) {
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
    }
    
    // 处理结尾的广告
    if (currentAdStart >= 0) {
      const lastSeg = segments[segments.length - 1];
      const adDuration = lastSeg.time + lastSeg.duration - currentAdStart;
      if (adDuration >= CONFIG.AD_DETECTION.MIN_DURATION && 
          adDuration <= CONFIG.AD_DETECTION.MAX_DURATION) {
        adSegments.push({
          start: currentAdStart,
          end: lastSeg.time + lastSeg.duration,
          type: currentAdStart === 0 ? 'pre' : 'post',
          confidence: Math.min(1, currentAdScore / adSegmentCount),
        });
      }
    }
    
    return adSegments;
  } catch (error) {
    console.error('M3U8详细解析失败:', error);
    return [];
  }
}

/**
 * 计算TS片段的广告分数
 */
function calculateAdScore(tsUrl: string, inDiscontinuity: boolean, prevLine: string): number {
  let score = 0;
  
  // URL特征检测
  for (const pattern of CONFIG.AD_DETECTION.URL_PATTERNS) {
    if (pattern.test(tsUrl)) {
      score += 0.4;
      break;
    }
  }
  
  // 域名特征检测
  for (const pattern of CONFIG.AD_DETECTION.DOMAIN_PATTERNS) {
    if (pattern.test(tsUrl)) {
      score += 0.3;
      break;
    }
  }
  
  // 不连续点标记
  if (inDiscontinuity) {
    score += 0.2;
  }
  
  // SCTE35广告标记
  if (prevLine.includes('SCTE35') || prevLine.includes('CUE-OUT')) {
    score += 0.3;
  }
  
  // 文件名特征
  if (/\d{3,4}x\d{3,4}/.test(tsUrl)) {
    // 分辨率标记，可能是广告
    score += 0.1;
  }
  
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
    // 如果有历史数据，使用该时间段的速度
    if (source.hourlySpeed && source.hourlySpeed[currentHour] !== undefined) {
      const hourSpeed = source.hourlySpeed[currentHour];
      const weight = CONFIG.HOURLY_WEIGHTS[currentHour as keyof typeof CONFIG.HOURLY_WEIGHTS] || 1.0;
      
      return {
        ...source,
        // 调整优先级：速度 × 时间段权重
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
      // 移动平均
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

// ============ 增强HLS配置 ============

/**
 * 获取优化的HLS配置
 */
export function getOptimizedHLSConfig(isPeakHour: boolean = false): any {
  const hourWeight = getCurrentHourWeight();
  const isLowPerformance = hourWeight < 0.8; // 高峰期
  
  return {
    enableWorker: true,
    lowLatencyMode: false,
    
    // 缓冲配置 - 高峰期更大
    maxBufferLength: isLowPerformance ? 180 : 120,
    maxMaxBufferLength: isLowPerformance ? 300 : 180,
    maxBufferSize: isLowPerformance ? 150 * 1000 * 1000 : 100 * 1000 * 1000,
    maxBufferHole: 0.5,
    
    // 直播配置
    liveSyncDuration: CONFIG.HLS_BUFFER.LIVE_SYNC_DURATION,
    liveMaxLatencyDuration: CONFIG.HLS_BUFFER.LIVE_MAX_LATENCY_DURATION,
    
    // ABR配置 - 高峰期更保守
    startLevel: -1, // 自动选择
    abrEwmaDefaultEstimate: isLowPerformance ? 500000 : 1000000,
    abrBandWidthFactor: isLowPerformance ? 0.6 : 0.7,
    abrBandWidthUpFactor: isLowPerformance ? 0.4 : 0.5,
    abrMaxWithRealBitrate: true,
    
    // 超时配置 - 高峰期更长
    fragLoadingTimeOut: isLowPerformance ? 45000 : 30000,
    manifestLoadingTimeOut: isLowPerformance ? 20000 : 15000,
    levelLoadingTimeOut: isLowPerformance ? 20000 : 15000,
    
    // 重试配置 - 高峰期更多
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

// ============ 线路测速（增强版） ============

export async function testAllSources(sources: PlaySource[]): Promise<SourceHealth[]> {
  // 根据时间段调整源优先级
  const adjustedSources = adjustSourcesByHour(sources);
  
  const results = await Promise.all(
    adjustedSources.map(source => testSourceHealth(source))
  );
  
  // 计算时间段评分
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
    
    const response = await fetch(source.url, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'no-cors',
      cache: 'no-store',
    });
    
    clearTimeout(timeout);
    
    const latency = performance.now() - startTime;
    
    // 估算带宽
    let bandwidth = 0;
    const contentLength = response.headers.get('Content-Length');
    if (contentLength) {
      bandwidth = (parseInt(contentLength) * 8) / (latency / 1000);
    }
    
    return {
      id: source.id,
      available: true,
      latency,
      bandwidth,
      errorRate: 0,
      lastCheck: Date.now(),
    };
  } catch (error) {
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
  
  // 排序：时间段评分 > 延迟 > 带宽
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
  let lastCheckTime = 0;
  let stallCount = 0;
  let lastCurrentTime = 0;
  let stallStartTime = 0;
  let lastBitrate = 0;
  
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
    
    // 检测卡顿
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
    lastCheckTime = now;
    
    return {
      currentTime,
      bufferedAhead,
      isStalled: stallStartTime > 0,
    };
  };
  
  const intervalId = setInterval(check, 300); // 更频繁的检查
  
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
  
  const reportError = (index: number, error: string) => {
    errorCounts[index]++;
    
    // 记录错误历史
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
    if (Date.now() - lastSwitchTime < 3000) return; // 3秒内不重复切换
    
    // 优先选择近期没有失败过的线路
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
    
    // 所有线路都失败过，选择错误最少的
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
