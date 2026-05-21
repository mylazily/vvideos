// PWA 原生功能 - 分享、后台播放、离线观看

// ======== Web Share API ========
export async function shareVideo(video: {
  title: string;
  url: string;
  cover?: string;
}): Promise<boolean> {
  if (!navigator.share) {
    // 不支持 Web Share，复制链接
    await navigator.clipboard.writeText(video.url);
    return false;
  }

  try {
    await navigator.share({
      title: video.title,
      text: `在${SITE_NAME}观看《${video.title}》`,
      url: video.url
    });
    return true;
  } catch (e) {
    // 用户取消
    return false;
  }
}

// ======== 后台播放（Media Session API）=======
export function setupMediaSession(video: {
  title: string;
  cover: string;
  category?: string;
}) {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: video.title,
    artist: video.category || SITE_NAME,
    album: SITE_NAME,
    artwork: [
      { src: video.cover, sizes: '512x512', type: 'image/jpeg' }
    ]
  });

  // 处理媒体控制
  navigator.mediaSession.setActionHandler('play', () => {
    const videoEl = document.querySelector('video');
    if (videoEl) videoEl.play();
  });

  navigator.mediaSession.setActionHandler('pause', () => {
    const videoEl = document.querySelector('video');
    if (videoEl) videoEl.pause();
  });

  navigator.mediaSession.setActionHandler('previoustrack', () => {
    // 上一集
    window.dispatchEvent(new CustomEvent('media-previous'));
  });

  navigator.mediaSession.setActionHandler('nexttrack', () => {
    // 下一集
    window.dispatchEvent(new CustomEvent('media-next'));
  });
}

// ======== 画中画（Picture-in-Picture）=======
export async function togglePictureInPicture(): Promise<boolean> {
  const videoEl = document.querySelector('video');
  if (!videoEl || !document.pictureInPictureEnabled) return false;

  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return false;
    } else {
      await videoEl.requestPictureInPicture();
      return true;
    }
  } catch (e) {
    console.error('PiP error:', e);
    return false;
  }
}

// ======== 离线观看（预缓存视频）=======
export async function cacheVideoForOffline(videoUrl: string): Promise<boolean> {
  if (!navigator.serviceWorker?.controller) return false;

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data?.success || false);
    };

    navigator.serviceWorker.controller.postMessage(
      { type: 'CACHE_VIDEO', payload: { url: videoUrl } },
      [messageChannel.port2]
    );

    // 超时处理
    setTimeout(() => resolve(false), 10000);
  });
}

// ======== 获取缓存状态 ========
export async function getCacheStatus(): Promise<{
  static: number;
  api: number;
  images: number;
}> {
  if (!navigator.serviceWorker?.controller) {
    return { static: 0, api: 0, images: 0 };
  }

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data || { static: 0, api: 0, images: 0 });
    };

    navigator.serviceWorker.controller.postMessage(
      { type: 'GET_CACHE_STATUS' },
      [messageChannel.port2]
    );

    setTimeout(() => resolve({ static: 0, api: 0, images: 0 }), 5000);
  });
}

// ======== 请求后台同步 ========
export async function requestBackgroundSync(type: 'favorites' | 'history'): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register(`sync-${type}`);
    return true;
  } catch (e) {
    console.error('Background sync error:', e);
    return false;
  }
}

// ======== 请求推送通知权限 ========
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

// ======== 订阅推送 ========
export async function subscribePush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        'BEl62iSMfVjKfAGg1ArJx-6XrJ8E_v7R5KzX9v8mJ8' // 替换为实际的 VAPID key
      )
    });

    // 发送到服务器保存
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });

    return true;
  } catch (e) {
    console.error('Push subscription error:', e);
    return false;
  }
}

// 辅助函数：Base64 URL 转 Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ======== 检查 PWA 功能支持 ========
export function getPWACapabilities() {
  return {
    share: !!navigator.share,
    mediaSession: 'mediaSession' in navigator,
    pictureInPicture: !!document.pictureInPictureEnabled,
    backgroundSync: 'SyncManager' in window,
    periodicSync: 'periodicSync' in (navigator.serviceWorker || {}),
    notifications: 'Notification' in window,
    push: 'PushManager' in window,
    standalone: window.matchMedia('(display-mode: standalone)').matches
  };
}

const SITE_NAME = '必爱必爱';
