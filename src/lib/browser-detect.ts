// 浏览器/APP 检测 + 引导系统

export type BrowserType = 
  | 'chrome' 
  | 'edge' 
  | 'firefox' 
  | 'safari' 
  | 'opera'
  | 'wechat'      // 微信内置浏览器
  | 'weibo'       // 微博内置浏览器
  | 'qq'          // QQ内置浏览器
  | 'douyin'      // 抖音内置浏览器
  | 'toutiao'     // 今日头条内置浏览器
  | 'alipay'      // 支付宝内置浏览器
  | 'baidu_app'   // 百度APP内置浏览器
  | 'xiaomi_browser' // 小米浏览器
  | 'huawei_browser' // 华为浏览器
  | 'vivo_browser'   // vivo浏览器
  | 'oppo_browser'   // OPPO浏览器
  | 'uc'          // UC浏览器
  | 'baidu'       // 百度浏览器
  | '360'         // 360浏览器
  | 'sogou'       // 搜狗浏览器
  | 'liebao'      // 猎豹浏览器
  | 'unknown';

export interface BrowserInfo {
  type: BrowserType;
  name: string;
  isBlocked: boolean;     // 是否被屏蔽
  isRecommended: boolean; // 是否推荐浏览器
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  downloadUrl: string;
  appGuide: {
    icon: string;
    title: string;
    tip: string;
    action: string;
  };
}

// 各大APP引导信息
const APP_GUIDES: Record<BrowserType, BrowserInfo['appGuide']> = {
  wechat: { icon: '💬', title: '微信内访问受限', tip: '微信内置浏览器无法正常播放视频', action: '点击右上角 → 选择「在浏览器中打开」' },
  qq: { icon: '🐧', title: 'QQ内访问受限', tip: 'QQ内置浏览器无法正常播放视频', action: '点击右上角 → 选择「在浏览器中打开」' },
  weibo: { icon: '📱', title: '微博内访问受限', tip: '微博内置浏览器无法正常播放视频', action: '点击右上角 → 选择「在浏览器中打开」' },
  douyin: { icon: '🎵', title: '抖音内访问受限', tip: '抖音内置浏览器无法正常播放视频', action: '点击右上角 → 选择「在浏览器中打开」' },
  toutiao: { icon: '📰', title: '头条内访问受限', tip: '今日头条内置浏览器无法正常播放视频', action: '点击右上角 → 选择「在浏览器中打开」' },
  alipay: { icon: '💰', title: '支付宝内访问受限', tip: '支付宝内置浏览器无法正常播放视频', action: '点击右上角 → 选择「在浏览器中打开」' },
  baidu_app: { icon: '🔍', title: '百度APP内访问受限', tip: '百度APP内置浏览器无法正常播放视频', action: '点击右上角 → 选择「在浏览器中打开」' },
  xiaomi_browser: { icon: '📱', title: '小米浏览器体验受限', tip: '小米浏览器可能屏蔽部分视频内容', action: '建议使用Chrome或Edge浏览器' },
  huawei_browser: { icon: '📱', title: '华为浏览器体验受限', tip: '华为浏览器可能屏蔽部分视频内容', action: '建议使用Chrome或Edge浏览器' },
  vivo_browser: { icon: '📱', title: 'vivo浏览器体验受限', tip: 'vivo浏览器可能屏蔽部分视频内容', action: '建议使用Chrome或Edge浏览器' },
  oppo_browser: { icon: '📱', title: 'OPPO浏览器体验受限', tip: 'OPPO浏览器可能屏蔽部分视频内容', action: '建议使用Chrome或Edge浏览器' },
  uc: { icon: '📱', title: 'UC浏览器体验受限', tip: 'UC浏览器可能屏蔽部分视频内容', action: '建议使用Chrome或Edge浏览器' },
  baidu: { icon: '📱', title: '百度浏览器体验受限', tip: '百度浏览器可能屏蔽部分视频内容', action: '建议使用Chrome或Edge浏览器' },
  '360': { icon: '📱', title: '360浏览器体验受限', tip: '360浏览器可能屏蔽部分视频内容', action: '建议使用Chrome或Edge浏览器' },
  sogou: { icon: '📱', title: '搜狗浏览器体验受限', tip: '搜狗浏览器可能屏蔽部分视频内容', action: '建议使用Chrome或Edge浏览器' },
  liebao: { icon: '📱', title: '猎豹浏览器体验受限', tip: '猎豹浏览器可能屏蔽部分视频内容', action: '建议使用Chrome或Edge浏览器' },
  chrome: { icon: '🌐', title: 'Chrome浏览器', tip: '全球最受欢迎的浏览器，体验最佳', action: '推荐使用' },
  edge: { icon: '🌐', title: 'Edge浏览器', tip: '微软出品，速度快，支持PWA', action: '推荐使用' },
  safari: { icon: '🌐', title: 'Safari浏览器', tip: 'iOS原生浏览器，流畅省电', action: '推荐使用' },
  firefox: { icon: '🌐', title: 'Firefox浏览器', tip: '开源浏览器，隐私保护好', action: '推荐使用' },
  opera: { icon: '🌐', title: 'Opera浏览器', tip: '内置VPN和广告拦截', action: '推荐使用' },
  unknown: { icon: '📱', title: '未知浏览器', tip: '建议使用Chrome或Edge浏览器', action: '推荐使用Chrome或Edge' }
};

export function detectBrowser(): BrowserInfo {
  if (typeof window === 'undefined') {
    return { type: 'unknown', name: '未知', isBlocked: false, isRecommended: false, isMobile: false, isIOS: false, isAndroid: false, downloadUrl: '', appGuide: APP_GUIDES.unknown };
  }

  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  let type: BrowserType = 'unknown';
  
  if (ua.includes('micromessenger')) type = 'wechat';
  else if (ua.includes('weibo')) type = 'weibo';
  else if (ua.includes('qq/') || ua.includes('mqqbrowser')) type = 'qq';
  else if (ua.includes('aweme') || ua.includes('douyin')) type = 'douyin';
  else if (ua.includes('newsarticle') || ua.includes('bytedance')) type = 'toutiao';
  else if (ua.includes('alipay')) type = 'alipay';
  else if (ua.includes('baiduboxapp') || (ua.includes('baidu') && isMobile)) type = 'baidu_app';
  else if (ua.includes('miui') || (ua.includes('xiaomi') && isMobile)) type = 'xiaomi_browser';
  else if (ua.includes('huawei') || ua.includes('harmony')) type = 'huawei_browser';
  else if (ua.includes('vivo') && isMobile) type = 'vivo_browser';
  else if (ua.includes('oppo') && isMobile) type = 'oppo_browser';
  else if (ua.includes('ucbrowser') || ua.includes('ucweb')) type = 'uc';
  else if (ua.includes('baidu') || ua.includes('bidu')) type = 'baidu';
  else if (ua.includes('360se') || ua.includes('360ee')) type = '360';
  else if (ua.includes('sogou') && isMobile) type = 'sogou';
  else if (ua.includes('liebao') || ua.includes('lbbrowser')) type = 'liebao';
  else if (ua.includes('edg/') || ua.includes('edge')) type = 'edge';
  else if (ua.includes('chrome') && !ua.includes('chromium') && !ua.includes('edg')) type = 'chrome';
  else if (ua.includes('firefox')) type = 'firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) type = 'safari';
  else if (ua.includes('opr/') || ua.includes('opera')) type = 'opera';

  const blockedApps = ['wechat', 'qq', 'weibo', 'douyin', 'toutiao', 'alipay', 'baidu_app'];
  const limitedApps = ['xiaomi_browser', 'huawei_browser', 'vivo_browser', 'oppo_browser', 'uc', 'baidu', '360', 'sogou', 'liebao'];
  const recommendedTypes = ['chrome', 'edge', 'safari', 'firefox', 'opera'];
  const isBlocked = blockedApps.includes(type);
  const isLimited = limitedApps.includes(type);
  const isRecommended = recommendedTypes.includes(type);

  let downloadUrl = '';
  if (isAndroid) {
    downloadUrl = type === 'chrome' ? 'https://play.google.com/store/apps/details?id=com.android.chrome'
      : type === 'edge' ? 'https://play.google.com/store/apps/details?id=com.microsoft.emmx'
      : 'https://www.google.com/chrome/';
  } else if (isIOS) {
    downloadUrl = type === 'chrome' ? 'https://apps.apple.com/app/google-chrome/id535886823'
      : type === 'edge' ? 'https://apps.apple.com/app/microsoft-edge/id1288723196'
      : 'https://apps.apple.com/app/google-chrome/id535886823';
  } else {
    downloadUrl = 'https://www.google.com/chrome/';
  }

  return {
    type,
    name: APP_GUIDES[type]?.title || '未知浏览器',
    isBlocked: isBlocked || isLimited,
    isRecommended,
    isMobile,
    isIOS,
    isAndroid,
    downloadUrl,
    appGuide: APP_GUIDES[type] || APP_GUIDES.unknown
  };
}

export function shouldShowBrowserGuide(): boolean {
  const browser = detectBrowser();
  return browser.isBlocked || !browser.isRecommended;
}

export function getBrowserGuideText(): { title: string; desc: string } {
  const browser = detectBrowser();
  if (browser.isBlocked || !browser.isRecommended) {
    return {
      title: `${browser.name}无法正常播放视频`,
      desc: '请使用Chrome、Edge或Safari浏览器访问，体验更佳。'
    };
  }
  return { title: '', desc: '' };
}

export function openInExternalBrowser(): void {
  const ua = navigator.userAgent.toLowerCase();
  const url = window.location.href;
  
  if (ua.includes('micromessenger')) {
    alert('请点击右上角 ⋮ → 选择"在浏览器中打开"');
  } else if (ua.includes('qq/') || ua.includes('aweme') || ua.includes('alipay')) {
    alert('请点击右上角 → 选择"在浏览器中打开"');
  } else {
    window.open(url, '_blank');
  }
}
