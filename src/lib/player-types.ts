/**
 * 播放器类型定义 - 轻量级，无依赖
 * 这些类型可以在首页等地方使用，不会引入hls.js
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
export const CONFIG = {
  // 测速配置
  SPEED_TEST_TIMEOUT: 5000,        // 测速超时5秒
  SPEED_TEST_CHUNKS: 5,          // 测速片段数
  MIN_BANDWIDTH: 300000,         // 最低带宽300kbps
  
  // 切换阈值
  LATENCY_THRESHOLD: 3000,        // 延迟阈值3秒
  BUFFER_THRESHOLD: 10,          // 缓冲阈值10秒
  ERROR_COUNT_THRESHOLD: 2,       // 连续错误阈值
  
  // HLS缓冲配置 - 超大缓冲
  HLS_BUFFER: {
    MAX_BUFFER_LENGTH: 300,       // 最大缓冲300秒（5分钟）
    MAX_MAX_BUFFER_LENGTH: 600,  // 最大缓冲上限600秒（10分钟）
    MAX_BUFFER_SIZE: 200 * 1000 * 1000, // 200MB
    LIVE_SYNC_DURATION: 3,
    LIVE_MAX_LATENCY_DURATION: 10,
  },
  
  // 广告检测 - 增强版
  AD_DETECTION: {
    MIN_DURATION: 5,
    MAX_DURATION: 180,
    CONFIDENCE_THRESHOLD: 0.6,
    URL_PATTERNS: [
      /ad[_\-]/i, /ads[_\-]/i, /commercial/i, /preroll/i, /midroll/i, /postroll/i,
      /[_\-]ad\./i, /\/ad\//i, /advert/i, /promo/i, /sponsor/i,
      /\/(ad|ads|adv|advertisement|commercial|promo|sponsor)\//i,
      /(pre|mid|post)[_\-]?roll/i,
    ],
    DOMAIN_PATTERNS: [
      /\.ad\./i, /\.ads\./i, /advert/i, /doubleclick/i, /googlesyndication/i,
    ],
  },
  
  // 时间段权重（24小时制）
  HOURLY_WEIGHTS: {
    0: 1.2, 1: 1.2, 2: 1.2, 3: 1.2, 4: 1.2, 5: 1.2, 6: 1.1,
    7: 1.0, 8: 1.0, 9: 1.0, 10: 1.0, 11: 1.0,
    12: 0.9, 13: 0.9,
    14: 1.0, 15: 1.0, 16: 1.0, 17: 1.0,
    18: 0.8, 19: 0.7, 20: 0.6, 21: 0.6, 22: 0.7, 23: 0.9,
  },
  
  // DoH服务器
  DOH_SERVERS: [
    'https://dns.alidns.com/dns-query',
    'https://doh.pub/dns-query',
    'https://dns.google/dns-query',
    'https://cloudflare-dns.com/dns-query',
  ],
};
