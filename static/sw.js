// Service Worker v4 - 极速 PWA
const STATIC_CACHE = 'evideos-static-v4';
const API_CACHE = 'evideos-api-v4';
const IMAGE_CACHE = 'evideos-images-v4';
const CACHE_VERSION = 'v4';

// 核心资源（安装时预缓存）
const CORE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// ======== 安装：预缓存核心资源 ========
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ======== 激活：清理旧缓存 ========
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('evideos-') && !key.includes(CACHE_VERSION))
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ======== 快速响应策略 ========

// 1. 静态资源：缓存优先，极速响应
async function staticStrategy(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    // 后台更新
    fetch(request).then((response) => {
      if (response.ok) cache.put(request, response);
    }).catch(() => {});
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// 2. API：网络优先，带TTL的缓存回退
const API_CACHE_TTL = 5 * 60 * 1000; // 5分钟

async function apiStrategy(request) {
  const cache = await caches.open(API_CACHE);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // 缓存时添加时间戳
      const headers = new Headers(networkResponse.headers);
      headers.set('X-Cache-Time', String(Date.now()));
      const timestampedResponse = new Response(networkResponse.body, {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers
      });
      cache.put(request, timestampedResponse);
    }
    return networkResponse;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      // 检查缓存是否过期
      const cacheTime = cached.headers.get('X-Cache-Time');
      if (cacheTime && (Date.now() - Number(cacheTime)) > API_CACHE_TTL) {
        // 缓存过期，尝试后台更新，先返回过期数据（stale-while-revalidate）
        fetch(request).then((response) => {
          if (response.ok) {
            const headers = new Headers(response.headers);
            headers.set('X-Cache-Time', String(Date.now()));
            const timestampedResponse = new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers
            });
            cache.put(request, timestampedResponse);
          }
        }).catch(() => {});
      }
      return cached;
    }

    return new Response(
      JSON.stringify({ success: false, message: '离线模式' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// 3. 图片：缓存优先，LRU 清理
async function imageStrategy(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      // LRU：限制 100 张图片，超限时批量删除最旧的20张
      const keys = await cache.keys();
      if (keys.length >= 100) {
        const deleteCount = Math.min(20, keys.length - 80);
        await Promise.all(keys.slice(0, deleteCount).map(k => cache.delete(k)));
      }
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 404 });
  }
}

// ======== 请求拦截 ========
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // API 请求
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(apiStrategy(request));
    return;
  }

  // 图片
  if (/\.(png|jpg|jpeg|webp|gif|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(imageStrategy(request));
    return;
  }

  // 静态资源
  if (/\.(js|css|woff2?)$/.test(url.pathname)) {
    event.respondWith(staticStrategy(request));
    return;
  }

  // HTML 页面
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((c) => c || caches.match('/')))
  );
});

// ======== 后台同步 ========
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncData('favorites'));
  } else if (event.tag === 'sync-history') {
    event.waitUntil(syncData('history'));
  }
});

async function syncData(type) {
  // 从 IndexedDB 读取离线数据并同步
  console.log(`[SW] Syncing ${type}...`);
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
      { action: 'close', title: '关闭' }
    ],
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '必爱必爱', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  if (event.action !== 'close') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
    );
  }
});

// ======== 消息通信 ========
self.addEventListener('message', (event) => {
  const { type } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'GET_CACHE_STATUS':
      getCacheStatus().then((status) => {
        event.ports[0]?.postMessage(status);
      });
      break;
  }
});

async function getCacheStatus() {
  const [staticCache, apiCache, imageCache] = await Promise.all([
    caches.open(STATIC_CACHE).then((c) => c.keys()),
    caches.open(API_CACHE).then((c) => c.keys()),
    caches.open(IMAGE_CACHE).then((c) => c.keys())
  ]);

  return {
    static: staticCache.length,
    api: apiCache.length,
    images: imageCache.length
  };
}

console.log('[SW] Service Worker v4 active');
