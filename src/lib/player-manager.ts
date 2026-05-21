/**
 * 播放器管理模块
 * 解决：速率低/卡顿、DNS污染、TS广告、多源切换
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
}

export interface AdSegment {
  start: number;
  end: number;
  type: 'pre' | 'mid' | 'post';
  url?: string; // 广告TS的URL特征
}

export interface SourceHealth {
  id: string;
  available: boolean;
  latency: number;
  bandwidth: number;
  errorRate: number;
  lastCheck: number;
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
  SPEED_TEST_TIMEOUT: 3000,        // 测速超时3秒
  SPEED_TEST_CHUNKS: 3,            // 测速片段数
  MIN_BANDWIDTH: 500000,           // 最低带宽500kbps
  
  // 切换阈值
  LATENCY_THRESHOLD: 2000,         // 延迟阈值2秒
  BUFFER_THRESHOLD: 5,             // 缓冲阈值5秒
  ERROR_COUNT_THRESHOLD: 3,        // 连续错误阈值
  
  // 广告检测
  AD_DURATION_MIN: 10,             // 广告最短时长10秒
  AD_DURATION_MAX: 120,            // 广告最长时长120秒
  AD_URL_PATTERNS: [
    /ad[_\-]/i,
    /ads[_\-]/i,
    /commercial/i,
    /preroll/i,
    /midroll/i,
    /postroll/i,
    /[_\-]ad\./i,
    /\/ad\//i,
  ],
  
  // DoH服务器
  DOH_SERVERS: [
    'https://dns.alidns.com/dns-query',
    'https://doh.pub/dns-query',
    'https://dns.google/dns-query',
  ],
};

// ============ 线路测速 ============

/**
 * 并行测速所有线路
 */
export async function testAllSources(sources: PlaySource[]): Promise<SourceHealth[]> {
  const results = await Promise.all(
    sources.map(source => testSourceHealth(source))
  );
  return results;
}

/**
 * 测试单个线路健康度
 */
export async function testSourceHealth(source: PlaySource): Promise<SourceHealth> {
  const startTime = performance.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.SPEED_TEST_TIMEOUT);
    
    // 尝试请求m3u8或第一个TS片段
    const testUrl = source.url.includes('.m3u8') 
      ? source.url 
      : source.url;
    
    const response = await fetch(testUrl, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'no-cors',
      cache: 'no-store',
    });
    
    clearTimeout(timeout);
    
    const latency = performance.now() - startTime;
    
    // 尝试估算带宽（如果可以获取Content-Length）
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

/**
 * 选择最佳线路
 */
export function selectBestSource(
  sources: PlaySource[],
  healthResults: SourceHealth[]
): { source: PlaySource; health: SourceHealth } | null {
  // 过滤可用线路
  const available = sources
    .map((source, index) => ({
      source,
      health: healthResults[index],
    }))
    .filter(item => item.health.available);
  
  if (available.length === 0) return null;
  
  // 按优先级排序：延迟 < 2秒优先，然后按带宽排序
  available.sort((a, b) => {
    // 延迟优先
    if (a.health.latency < CONFIG.LATENCY_THRESHOLD && b.health.latency >= CONFIG.LATENCY_THRESHOLD) {
      return -1;
    }
    if (a.health.latency >= CONFIG.LATENCY_THRESHOLD && b.health.latency < CONFIG.LATENCY_THRESHOLD) {
      return 1;
    }
    // 带宽优先
    return b.health.bandwidth - a.health.bandwidth;
  });
  
  return available[0];
}

// ============ DNS污染解决 ============

/**
 * 使用DoH解析域名
 */
export async function resolveWithDoH(hostname: string): Promise<string[]> {
  const results: string[] = [];
  
  for (const dohServer of CONFIG.DOH_SERVERS) {
    try {
      const response = await fetch(`${dohServer}?name=${hostname}&type=A`, {
        headers: {
          'Accept': 'application/dns-json',
        },
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
      // 继续尝试下一个DoH服务器
    }
  }
  
  return results;
}

/**
 * 检查URL是否可访问
 */
export async function checkUrlAccessible(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    
    // 先尝试直接访问
    const directTest = await testDirectAccess(url);
    if (directTest) return true;
    
    // 如果失败，尝试DoH解析
    const ips = await resolveWithDoH(urlObj.hostname);
    if (ips.length === 0) return false;
    
    // 尝试用解析的IP访问
    for (const ip of ips) {
      const ipUrl = url.replace(urlObj.hostname, ip);
      const ipTest = await testDirectAccess(ipUrl);
      if (ipTest) return true;
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

// ============ M3U8广告检测 ============

/**
 * 解析M3U8内容，检测广告段
 */
export async function parseM3U8ForAds(m3u8Url: string): Promise<AdSegment[]> {
  try {
    const response = await fetch(m3u8Url);
    const content = await response.text();
    
    const lines = content.split('\n');
    const segments: Array<{ duration: number; url: string }> = [];
    const adSegments: AdSegment[] = [];
    
    let currentTime = 0;
    let currentDuration = 0;
    let inAdBlock = false;
    let adStartTime = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 解析EXTINF标签获取时长
      if (line.startsWith('#EXTINF:')) {
        const match = line.match(/#EXTINF:([\d.]+)/);
        if (match) {
          currentDuration = parseFloat(match[1]);
        }
      }
      
      // 解析TS片段URL
      if (line.endsWith('.ts') && !line.startsWith('#')) {
        const isAd = isAdSegment(line, lines[i - 1] || '');
        
        if (isAd && !inAdBlock) {
          // 广告开始
          inAdBlock = true;
          adStartTime = currentTime;
        } else if (!isAd && inAdBlock) {
          // 广告结束
          inAdBlock = false;
          const adDuration = currentTime - adStartTime;
          
          // 验证广告时长合理性
          if (adDuration >= CONFIG.AD_DURATION_MIN && adDuration <= CONFIG.AD_DURATION_MAX) {
            adSegments.push({
              start: adStartTime,
              end: currentTime,
              type: adStartTime === 0 ? 'pre' : 'mid',
            });
          }
        }
        
        currentTime += currentDuration;
        segments.push({ duration: currentDuration, url: line });
      }
      
      // 检测DISCONTINUITY标记（可能表示广告边界）
      if (line.includes('#EXT-X-DISCONTINUITY')) {
        // 不连续点可能是广告边界
      }
    }
    
    // 处理结尾的广告
    if (inAdBlock) {
      const adDuration = currentTime - adStartTime;
      if (adDuration >= CONFIG.AD_DURATION_MIN && adDuration <= CONFIG.AD_DURATION_MAX) {
        adSegments.push({
          start: adStartTime,
          end: currentTime,
          type: adStartTime === 0 ? 'pre' : 'post',
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
 * 判断是否为广告片段
 */
function isAdSegment(tsUrl: string, prevLine: string): boolean {
  // 检查URL特征
  for (const pattern of CONFIG.AD_URL_PATTERNS) {
    if (pattern.test(tsUrl)) {
      return true;
    }
  }
  
  // 检查前一行标签
  if (prevLine.includes('CUE-OUT') || prevLine.includes('SCTE35')) {
    return true;
  }
  
  return false;
}

/**
 * 从多源对比检测广告
 */
export function detectAdsFromMultiSource(
  sources: Array<{ url: string; duration: number }>
): AdSegment[] {
  if (sources.length < 2) return [];
  
  // 过滤有效时长
  const validDurations = sources.filter(s => s.duration > 0);
  if (validDurations.length < 2) return [];
  
  // 找出最短时长（假设为无广告版本）
  const sorted = [...validDurations].sort((a, b) => a.duration - b.duration);
  const minDuration = sorted[0].duration;
  const maxDuration = sorted[sorted.length - 1].duration;
  
  // 时长差异小于10秒，认为无广告
  if (maxDuration - minDuration < 10) return [];
  
  const adSegments: AdSegment[] = [];
  const avgExtra = (maxDuration - minDuration) / 2;
  
  // 假设前贴广告
  if (avgExtra >= CONFIG.AD_DURATION_MIN) {
    adSegments.push({
      start: 0,
      end: Math.floor(avgExtra),
      type: 'pre',
    });
  }
  
  return adSegments;
}

// ============ 播放器监控 ============

/**
 * 创建播放监控器
 */
export function createPlaybackMonitor(
  videoElement: HTMLVideoElement,
  onBufferLow?: () => void,
  onError?: (error: string) => void
) {
  let lastCheckTime = 0;
  let stallCount = 0;
  let lastCurrentTime = 0;
  let stallStartTime = 0;
  
  const check = () => {
    const now = performance.now();
    const currentTime = videoElement.currentTime;
    const buffered = videoElement.buffered;
    
    // 计算缓冲 ahead
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
      if (stallCount >= 3 && stallStartTime === 0) {
        stallStartTime = now;
      }
      
      // 卡顿超过2秒
      if (stallStartTime > 0 && now - stallStartTime > 2000) {
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
  
  // 每500ms检查一次
  const intervalId = setInterval(check, 500);
  
  // 错误监听
  videoElement.addEventListener('error', () => {
    const error = videoElement.error;
    if (error) {
      onError?.(error.message || '播放错误');
    }
  });
  
  return {
    check,
    destroy: () => {
      clearInterval(intervalId);
    },
  };
}

// ============ 自动切换策略 ============

/**
 * 创建自动切换管理器
 */
export function createAutoSwitchManager(
  sources: PlaySource[],
  onSwitch: (sourceIndex: number) => void
) {
  let currentIndex = 0;
  let errorCounts: number[] = new Array(sources.length).fill(0);
  let lastSwitchTime = 0;
  
  const reportError = (index: number, error: string) => {
    errorCounts[index]++;
    
    // 连续错误超过阈值，切换线路
    if (errorCounts[index] >= CONFIG.ERROR_COUNT_THRESHOLD) {
      switchToNext();
    }
  };
  
  const reportSuccess = (index: number) => {
    errorCounts[index] = 0;
  };
  
  const switchToNext = () => {
    // 防止频繁切换（至少间隔5秒）
    if (Date.now() - lastSwitchTime < 5000) return;
    
    // 找下一个可用线路
    for (let i = 1; i < sources.length; i++) {
      const nextIndex = (currentIndex + i) % sources.length;
      if (errorCounts[nextIndex] < CONFIG.ERROR_COUNT_THRESHOLD) {
        currentIndex = nextIndex;
        lastSwitchTime = Date.now();
        onSwitch(currentIndex);
        return;
      }
    }
    
    // 所有线路都失败，重置错误计数重试
    errorCounts = new Array(sources.length).fill(0);
    currentIndex = (currentIndex + 1) % sources.length;
    onSwitch(currentIndex);
  };
  
  return {
    currentIndex: () => currentIndex,
    reportError,
    reportSuccess,
    switchToNext,
  };
}

// ============ 预加载优化 ============

/**
 * 预加载下一个视频
 */
export async function preloadNextVideo(
  sources: PlaySource[],
  currentIndex: number
): Promise<void> {
  const nextIndex = (currentIndex + 1) % sources.length;
  const nextSource = sources[nextIndex];
  
  if (!nextSource || !nextSource.url) return;
  
  try {
    // 预加载m3u8
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
