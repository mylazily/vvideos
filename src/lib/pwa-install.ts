// PWA 安装引导

export interface PWAInstallInfo {
  isInstallable: boolean;
  isInstalled: boolean;
  platform: 'android' | 'ios' | 'desktop' | 'unknown';
}

let deferredPrompt: any = null;

// 监听 beforeinstallprompt 事件
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e;
  });
}

// 检测 PWA 安装状态
export function getPWAInstallInfo(): PWAInstallInfo {
  if (typeof window === 'undefined') {
    return { isInstallable: false, isInstalled: false, platform: 'unknown' };
  }

  const ua = navigator.userAgent.toLowerCase();
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  
  // 检测是否已安装（standalone 模式）
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true
    || document.referrer.includes('android-app://');

  // 检测是否可安装
  const isInstallable = !!deferredPrompt || isIOS;

  let platform: 'android' | 'ios' | 'desktop' | 'unknown' = 'unknown';
  if (isAndroid) platform = 'android';
  else if (isIOS) platform = 'ios';
  else if (!/mobile/i.test(ua)) platform = 'desktop';

  return {
    isInstallable,
    isInstalled,
    platform
  };
}

// 触发安装
export async function triggerPWAInstall(): Promise<boolean> {
  if (!deferredPrompt) {
    // iOS 需要手动引导
    const info = getPWAInstallInfo();
    if (info.platform === 'ios') {
      alert('请点击浏览器底部的"分享"按钮 → 选择"添加到主屏幕"');
      return false;
    }
    return false;
  }

  try {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
  } catch {
    return false;
  }
}

// 获取安装引导文案
export function getPWAInstallGuide(): { title: string; steps: string[] } {
  const info = getPWAInstallInfo();
  
  if (info.platform === 'ios') {
    return {
      title: '安装到 iPhone 主屏幕',
      steps: [
        '1. 点击浏览器底部的"分享"按钮',
        '2. 向下滑动，找到"添加到主屏幕"',
        '3. 点击"添加"，即可在桌面找到应用'
      ]
    };
  }
  
  if (info.platform === 'android') {
    return {
      title: '安装到手机桌面',
      steps: [
        '1. 点击浏览器菜单（右上角 ⋮）',
        '2. 选择"添加到主屏幕"或"安装应用"',
        '3. 确认安装，即可在桌面找到应用'
      ]
    };
  }
  
  return {
    title: '安装到电脑桌面',
    steps: [
      '1. 点击浏览器地址栏右侧的安装图标',
      '2. 或点击浏览器菜单 → "安装此站点"',
      '3. 确认安装，即可像 APP 一样使用'
    ]
  };
}

// 检测是否应该显示安装引导
export function shouldShowPWAInstall(): boolean {
  const info = getPWAInstallInfo();
  if (info.isInstalled) return false;
  
  // 检查是否已经关闭过引导
  const dismissed = localStorage.getItem('pwa_install_dismissed');
  if (dismissed) {
    const dismissedTime = parseInt(dismissed);
    // 7 天后再次显示
    if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
      return false;
    }
  }
  
  return info.isInstallable;
}

// 记录用户关闭安装引导
export function dismissPWAInstall(): void {
  localStorage.setItem('pwa_install_dismissed', Date.now().toString());
}
