// PWA 管理器 - 自动更新、安装提示、状态管理

interface PWAState {
  isInstalled: boolean;
  isInstallable: boolean;
  updateAvailable: boolean;
  offlineReady: boolean;
}

class PWAManager {
  private state: PWAState = {
    isInstalled: false,
    isInstallable: false,
    updateAvailable: false,
    offlineReady: false
  };

  private listeners: Set<(state: PWAState) => void> = new Set();
  private deferredPrompt: any = null;
  private registration: ServiceWorkerRegistration | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    this.init();
  }

  private async init() {
    // 检测安装状态
    this.checkInstallStatus();
    
    // 监听 beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.updateState({ isInstallable: true });
    });

    // 监听 appinstalled
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.updateState({ isInstalled: true, isInstallable: false });
      this.trackInstall('installed');
    });

    // 监听 display-mode 变化
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      this.updateState({ isInstalled: e.matches });
    });

    // 注册 Service Worker
    await this.registerServiceWorker();
  }

  private checkInstallStatus() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true
      || document.referrer.includes('android-app://');
    
    this.updateState({ isInstalled: isStandalone });
  }

  private async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
      this.registration = await navigator.serviceWorker.register('/sw.js');
      
      // 检查更新
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration?.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // 有新版本可用
            this.updateState({ updateAvailable: true });
            this.showUpdateNotification();
          }
        });
      });

      // 监听消息
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'OFFLINE_READY') {
          this.updateState({ offlineReady: true });
        }
      });

      // 检查 Service Worker 是否已激活
      if (this.registration.active) {
        this.checkOfflineReady();
      }
    } catch (e) {
      console.error('SW registration failed:', e);
    }
  }

  private async checkOfflineReady() {
    if (!this.registration?.active) return;
    
    // 发送消息检查缓存状态
    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      if (event.data?.static > 0) {
        this.updateState({ offlineReady: true });
      }
    };

    this.registration.active.postMessage(
      { type: 'GET_CACHE_STATUS' },
      [messageChannel.port2]
    );
  }

  private updateState(updates: Partial<PWAState>) {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach(listener => listener(this.state));
  }

  private showUpdateNotification() {
    // 显示更新提示（可以通过自定义事件通知 UI）
    window.dispatchEvent(new CustomEvent('pwa-update-available'));
  }

  private trackInstall(action: string) {
    // 埋点统计安装数据
    if (typeof gtag !== 'undefined') {
      gtag('event', 'pwa_install', { action });
    }
  }

  // 公共 API
  getState(): PWAState {
    return { ...this.state };
  }

  subscribe(listener: (state: PWAState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async install(): Promise<boolean> {
    if (!this.deferredPrompt) return false;

    try {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      
      if (outcome === 'accepted') {
        this.trackInstall('accepted');
        return true;
      } else {
        this.trackInstall('dismissed');
        return false;
      }
    } catch (e) {
      console.error('Install error:', e);
      return false;
    }
  }

  async update(): Promise<boolean> {
    if (!this.registration?.waiting) return false;

    // 通知 Service Worker 跳过等待
    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    
    // 刷新页面以使用新版本
    window.location.reload();
    return true;
  }

  async checkForUpdate(): Promise<boolean> {
    if (!this.registration) return false;

    try {
      await this.registration.update();
      return this.state.updateAvailable;
    } catch (e) {
      return false;
    }
  }
}

// 单例导出
export const pwaManager = new PWAManager();

// 辅助函数：检查是否需要显示安装提示
export function shouldShowInstallPrompt(): boolean {
  const state = pwaManager.getState();
  if (state.isInstalled) return false;
  
  // 检查用户是否之前关闭过提示
  const lastDismissed = localStorage.getItem('pwa_prompt_dismissed');
  if (lastDismissed) {
    const daysSince = (Date.now() - parseInt(lastDismissed)) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) return false; // 7天内不再显示
  }
  
  // 检查访问次数
  const visitCount = parseInt(localStorage.getItem('pwa_visit_count') || '0');
  localStorage.setItem('pwa_visit_count', (visitCount + 1).toString());
  
  // 第2次访问或之后显示
  return visitCount >= 1;
}

// 记录用户关闭安装提示
export function dismissInstallPrompt() {
  localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
}

// 检查是否支持 PWA
export function isPWASupported(): boolean {
  return 'serviceWorker' in navigator && 
         'manifest' in document;
}

// 获取 PWA 统计信息
export function getPWAStats() {
  return {
    isStandalone: window.matchMedia('(display-mode: standalone)').matches,
    isFullscreen: window.matchMedia('(display-mode: fullscreen)').matches,
    isMinimalUi: window.matchMedia('(display-mode: minimal-ui)').matches,
    isBrowser: window.matchMedia('(display-mode: browser)').matches,
    protocol: window.location.protocol,
    serviceWorker: 'serviceWorker' in navigator,
    push: 'PushManager' in window,
    sync: 'SyncManager' in window
  };
}

declare const gtag: any;
