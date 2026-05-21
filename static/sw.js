// Service Worker v3 - 原生级 PWA 体验
const STATIC_CACHE = 'evideos-static-v3';
const API_CACHE = 'evideos-api-v3';
const IMAGE_CACHE = 'evideos-images-v3';
const VIDEO_CACHE = 'evideos-video-v3';
const OFFLINE_URL = '/';

// 核心页面和资源（安装时预缓存）
const CORE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// ======== 安装阶段 ========
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ======== 激活阶段 ========
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => !key.startsWith('evideos-'))
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ======== 智能缓存策略 ========

// 1. 静态资源 - 缓存优先，后台更新
async function cacheFirstWithRefresh(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  
  // 后台更新缓存
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);
  
  // 立即返回缓存（如果有）
  return cached || fetchPromise;
}

// 2. API 请求 - 网络优先，失败回退缓存
async function networkFirstWithCache(request, cacheName, maxAge = 3600000) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // 缓存响应
      const clone = networkResponse.clone();
      const metadata = { timestamp: Date.now() };
      const headers = new Headers(clone.headers);
      headers.set('X-SW-Cached-At', metadata.timestamp.toString());
      
      const responseToCache = new Response(clone.body, {
        status: clone.status,
        statusText: clone.statusText,
        headers
      });
      cache.put(request, responseToCache);
    }
    return networkResponse;
  } catch (error) {
    // 网络失败，尝试缓存
    const cached = await cache.match(request);
    if (cached) {
      const cachedAt = parseInt(cached.headers.get('X-SW-Cached-At') || '0');
      const age = Date.now() - cachedAt;
      
      // 缓存未过期，直接返回
      if (age < maxAge) {
        return cached;
      }
      // 缓存过期但返回（Stale-While-Revalidate）
      return cached;
    }
    
    // 完全离线
    return new Response(
      JSON.stringify({ success: false, message: '网络不可用，请检查连接' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// 3. 图片资源 - 缓存优先，限制数量
async function imageCacheStrategy(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  
  if (cached) return cached;
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      // 限制缓存数量（LRU）
      const keys = await cache.keys();
      if (keys.length > 200) {
        await cache.delete(keys[0]);
      }
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 返回占位图
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150"><rect fill="#f5f5f5" width="100" height="150"/><text x="50" y="75" text-anchor="middle" fill="#999" font-size="12">离线</text></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
}

// ======== 请求拦截 ========
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  if (request.method !== 'GET') return;
  
  // API 请求
  if (url.pathname.startsWith('/api/')) {
    // 视频详情 API 缓存 10 分钟
    if (url.pathname.startsWith('/api/video/')) {
      event.respondWith(networkFirstWithCache(request, API_CACHE, 600000));
      return;
    }
    // 首页 API 缓存 1 小时
    if (url.pathname === '/api/home') {
      event.respondWith(networkFirstWithCache(request, API_CACHE, 3600000));
      return;
    }
    // 其他 API 缓存 5 分钟
    event.respondWith(networkFirstWithCache(request, API_CACHE, 300000));
    return;
  }
  
  // 图片资源
  if (url.pathname.match(/\.(png|jpg|jpeg|webp|gif|svg|ico)$/i)) {
    event.respondWith(imageCacheStrategy(request));
    return;
  }
  
  // 静态资源（JS/CSS/字体）
  if (url.pathname.match(/\.(js|css|woff2?)$/)) {
    event.respondWith(cacheFirstWithRefresh(request, STATIC_CACHE));
    return;
  }
  
  // HTML 页面 - 网络优先，离线回退
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          return cached || caches.match(OFFLINE_URL);
        });
      })
  );
});

// ======== 后台同步 ========
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
  if (event.tag === 'sync-history') {
    event.waitUntil(syncHistory());
  }
});

async function syncFavorites() {
  // 从 IndexedDB 读取离线收藏并同步到服务器
  // 简化实现，实际项目中需要完整的 IndexedDB 操作
  console.log('[SW] Syncing favorites...');
}

async function syncHistory() {
  console.log('[SW] Syncing history...');
}

// ======== 推送通知 ========
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || '新视频更新',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'new-video',
    requireInteraction: false,
    actions: [
      { action: 'open', title: '立即观看' },
      { action: 'close', title: '稍后' }
    ],
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || '必爱必爱', options)
  );
});

// ======== 通知点击 ========
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const { action, data } = event.notification;
  const url = data?.url || '/';
  
  if (action === 'close') return;
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // 查找已打开的窗口
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // 打开新窗口
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ======== 周期性后台同步（更新缓存） ========
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-cache') {
    event.waitUntil(updateCache());
  }
});

async function updateCache() {
  // 后台更新首页缓存
  try {
    const cache = await caches.open(API_CACHE);
    const response = await fetch('/api/home');
    if (response.ok) {
      await cache.put('/api/home', response.clone());
    }
  } catch (e) {
    console.log('[SW] Background cache update failed:', e);
  }
}

// ======== 消息通信（与主线程通信） ========
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'CACHE_VIDEO':
      // 预缓存视频（离线观看）
      cacheVideoForOffline(payload.url);
      break;
    case 'GET_CACHE_STATUS':
      getCacheStatus().then((status) => {
        event.ports[0].postMessage(status);
      });
      break;
  }
});

async function cacheVideoForOffline(videoUrl) {
  const cache = await caches.open(VIDEO_CACHE);
  try {
    const response = await fetch(videoUrl);
    if (response.ok) {
      await cache.put(videoUrl, response);
      console.log('[SW] Video cached for offline:', videoUrl);
    }
  } catch (e) {
    console.error('[SW] Failed to cache video:', e);
  }
}

async function getCacheStatus() {
  const [staticCache, apiCache, imageCache] = await Promise.all([
    caches.open(STATIC_CACHE).then(c => c.keys()),
    caches.open(API_CACHE).then(c => c.keys()),
    caches.open(IMAGE_CACHE).then(c => c.keys())
  ]);
  
  return {
    static: staticCache.length,
    api: apiCache.length,
    images: imageCache.length
  };
}

console.log('[SW] Service Worker v3 loaded');
