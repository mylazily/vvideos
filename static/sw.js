// Service Worker v8 - 强制刷新版本
const STATIC_CACHE = 'evideos-static-v8';
const IMAGE_CACHE = 'evideos-images-v8';
const API_CACHE = 'evideos-api-v8';
const CACHE_VERSION = 'v8';

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

// ======== 激活：清理所有旧缓存 ========
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('evideos-') && !key.includes(CACHE_VERSION))
          .map((key) => {
            console.log('[SW] 删除旧缓存:', key);
            return caches.delete(key);
          })
      );
    }).then(() => {
      console.log('[SW] v8 激活，旧缓存已清理');
      return self.clients.claim();
    })
  );
});

// ======== 缓存策略 ========

// 1. 静态资源：缓存优先，后台更新
async function staticStrategy(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const fetchAndUpdate = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);

  // 如果有缓存立即返回，同时后台更新
  if (cached) {
    fetchAndUpdate.catch(() => {});
    return cached;
  }

  return fetchAndUpdate;
}

// 2. 图片：缓存优先
async function imageStrategy(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      // 限制缓存数量
      const keys = await cache.keys();
      if (keys.length >= 200) {
        await cache.delete(keys[0]);
      }
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 404 });
  }
}

// 3. API：网络优先，缓存兜底（5分钟）
async function apiStrategy(request) {
  const cache = await caches.open(API_CACHE);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (e) {
    // 网络失败，尝试缓存
    const cached = await cache.match(request);
    if (cached) return cached;
  }
  
  return new Response(JSON.stringify({ error: 'Network error' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ======== 请求拦截 ========
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理GET请求
  if (request.method !== 'GET') return;

  // API请求：网络优先
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

  // HTML页面：网络优先，缓存兜底
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

console.log('[SW] Service Worker v8 active - 全站缓存策略');
