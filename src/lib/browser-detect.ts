// 浏览器检测 + 引导系统

export type BrowserType = 
  | 'chrome' 
  | 'edge' 
  | 'firefox' 
  | 'safari' 
  | 'opera'
  | 'wechat'      // 微信内置浏览器
  | 'weibo'       // 微博内置浏览器
  | 'qq'          // QQ内置浏览器
  | 'uc'          // UC浏览器
  | 'baidu'       // 百度浏览器
  | '360'         // 360浏览器
  | 'sogou'       // 搜狗浏览器
  | 'liebao'      // 猎豹浏览器
  | 'miui'        // 小米浏览器
  | 'huawei'      // 华为浏览器
  | 'vivo'        // vivo浏览器
  | 'oppo'        // OPPO浏览器
  | 'unknown';

export interface BrowserInfo {
  type: BrowserType;
  name: string;
  isBlocked: boolean;     // 是否被屏蔽（国产浏览器通常屏蔽影视站）
  isRecommended: boolean; // 是否推荐浏览器
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  downloadUrl: string;
}

// 获取浏览器信息
export function detectBrowser(): BrowserInfo {
  if (typeof window === 'undefined') {
    return {
      type: 'unknown',
      name: '未知',
      isBlocked: false,
      isRecommended: false,
      isMobile: false,
      isIOS: false,
      isAndroid: false,
      downloadUrl: ''
    };
  }

  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  // 检测浏览器类型
  let type: BrowserType = 'unknown';
  let name = '未知浏览器';
  let isBlocked = false;
  let isRecommended = false;

  if (ua.includes('micromessenger')) {
    type = 'wechat';
    name = '微信';
    isBlocked = true;
  } else if (ua.includes('weibo')) {
    type = 'weibo';
    name = '微博';
    isBlocked = true;
  } else if (ua.includes('qq/') && !ua.includes('qqbrowser')) {
    type = 'qq';
    name = 'QQ';
    isBlocked = true;
  } else if (ua.includes('ucbrowser') || ua.includes('ucweb')) {
    type = 'uc';
    name = 'UC浏览器';
    isBlocked = true;
  } else if (ua.includes('baidu') || ua.includes('baiduboxapp')) {
    type = 'baidu';
    name = '百度浏览器';
    isBlocked = true;
  } else if (ua.includes('360') || ua.includes('360se') || ua.includes('360ee')) {
    type = '360';
    name = '360浏览器';
    isBlocked = true;
  } else if (ua.includes('sogou')) {
    type = 'sogou';
    name = '搜狗浏览器';
    isBlocked = true;
  } else if (ua.includes('liebao')) {
    type = 'liebao';
    name = '猎豹浏览器';
    isBlocked = true;
  } else if (ua.includes('miui') || ua.includes('xiaomi')) {
    type = 'miui';
    name = '小米浏览器';
    isBlocked = true;
  } else if (ua.includes('huawei') || ua.includes('harmony')) {
    type = 'huawei';
    name = '华为浏览器';
    isBlocked = true;
  } else if (ua.includes('vivo')) {
    type = 'vivo';
    name = 'vivo浏览器';
    isBlocked = true;
  } else if (ua.includes('oppo')) {
    type = 'oppo';
    name = 'OPPO浏览器';
    isBlocked = true;
  } else if (ua.includes('edg/') || ua.includes('edge')) {
    type = 'edge';
    name = 'Edge';
    isRecommended = true;
  } else if (ua.includes('chrome') && !ua.includes('chromium')) {
    type = 'chrome';
    name = 'Chrome';
    isRecommended = true;
  } else if (ua.includes('firefox')) {
    type = 'firefox';
    name = 'Firefox';
    isRecommended = true;
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    type = 'safari';
    name = 'Safari';
    isRecommended = false; // Safari 在国内访问可能有兼容问题
  } else if (ua.includes('opera') || ua.includes('opr/')) {
    type = 'opera';
    name = 'Opera';
    isRecommended = true;
  }

  // 下载链接
  let downloadUrl = '';
  if (isAndroid) {
    downloadUrl = type === 'chrome' 
      ? 'https://play.google.com/store/apps/details?id=com.android.chrome'
      : type === 'edge'
      ? 'https://play.google.com/store/apps/details?id=com.microsoft.emmx'
      : 'https://www.google.com/chrome/';
  } else if (isIOS) {
    downloadUrl = type === 'chrome'
      ? 'https://apps.apple.com/app/google-chrome/id535886823'
      : type === 'edge'
      ? 'https://apps.apple.com/app/microsoft-edge/id1288723196'
      : 'https://apps.apple.com/app/google-chrome/id535886823';
  } else {
    downloadUrl = 'https://www.google.com/chrome/';
  }

  return {
    type,
    name,
    isBlocked,
    isRecommended,
    isMobile,
    isIOS,
    isAndroid,
    downloadUrl
  };
}

// 判断是否需要显示浏览器引导
export function shouldShowBrowserGuide(): boolean {
  const browser = detectBrowser();
  return browser.isBlocked || !browser.isRecommended;
}

// 获取引导文案
export function getBrowserGuideText(): { title: string; desc: string } {
  const browser = detectBrowser();
  
  if (browser.isBlocked) {
    return {
      title: `${browser.name}可能无法正常访问`,
      desc: `${browser.name}内置屏蔽机制，建议使用 Chrome 或 Edge 浏览器访问，体验更佳。`
    };
  }
  
  if (!browser.isRecommended) {
    return {
      title: '建议使用更流畅的浏览器',
      desc: 'Chrome 或 Edge 浏览器访问速度更快，支持 PWA 离线使用。'
    };
  }
  
  return {
    title: '',
    desc: ''
  };
}

// 在微信/QQ中打开外部浏览器
export function openInExternalBrowser(): void {
  const ua = navigator.userAgent.toLowerCase();
  const url = window.location.href;
  
  // 微信
  if (ua.includes('micromessenger')) {
    // 微信无法直接唤起外部浏览器，只能引导用户手动操作
    alert('请点击右上角 ⋮ → 选择"在浏览器中打开"');
  }
  // QQ
  else if (ua.includes('qq/') && !ua.includes('qqbrowser')) {
    alert('请点击右上角 → 选择"在浏览器中打开"');
  }
  // 其他
  else {
    window.open(url, '_blank');
  }
}
