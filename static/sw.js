// Service Worker v9 - 极速缓存版本
const STATIC_CACHE = 'evideos-static-v9';
const IMAGE_CACHE = 'evideos-images-v9';
const API_CACHE = 'evideos-api-v9';
const CACHE_VERSION = 'v9';

// 缓存TTL（毫秒）
const API_TTL = 5 * 60 * 1000;       // API缓存5分钟
const HTML_TTL = 30 * 60 * 1000;     // HTML缓存30分钟
const IMAGE_MAX = 500;                // 图片缓存上限500张

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
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ======== 带TTL的缓存读写 ========
async function cacheGet(cacheName, request, ttl) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (!cached) return null;
  if (!ttl) return cached;
  const dateHeader = cached.headers.get('sw-cache-time');
  if (dateHeader && (Date.now() - parseInt(dateHeader)) > ttl) return null;
  return cached;
}

async function cacheSet(cacheName, request, response, ttl) {
  const cache = await caches.open(cacheName);
  if (ttl) {
    const headers = new Headers(response.headers);
    headers.set('sw-cache-time', String(Date.now()));
    const body = await response.blob();
    const newResponse = new Response(body, { status: response.status, statusText: response.statusText, headers });
    cache.put(request, newResponse);
  } else {
    cache.put(request, response.clone());
  }
}

// ======== 缓存策略 ========

// 1. 静态资源：缓存优先（文件名带hash，永不过期）
async function staticStrategy(request) {
  const cached = await cacheGet(STATIC_CACHE, request, 0);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cacheSet(STATIC_CACHE, request, response, 0);
    return response;
  } catch {
    return cached || new Response('', { status: 404 });
  }
}

// 2. 图片：缓存优先（LRU，上限500张）
async function imageStrategy(request) {
  const cached = await cacheGet(IMAGE_CACHE, request, 0);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(IMAGE_CACHE);
      const keys = await cache.keys();
      if (keys.length >= IMAGE_MAX) {
        await cache.delete(keys[0]);
      }
      cacheSet(IMAGE_CACHE, request, response, 0);
    }
    return response;
  } catch {
    return cached || new Response('', { status: 404 });
  }
}

// 3. API：网络优先，缓存兜底（5分钟TTL）
async function apiStrategy(request) {
  const cached = await cacheGet(API_CACHE, request, API_TTL);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cacheSet(API_CACHE, request, response, API_TTL);
      return response;
    }
    return cached || response;
  } catch {
    return cached || new Response(JSON.stringify({ error: 'Network error' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ======== 请求拦截 ========
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;

  // API
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(apiStrategy(request));
    return;
  }

  // 图片
  if (/\.(png|jpg|jpeg|webp|gif|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(imageStrategy(request));
    return;
  }

  // 静态资源（JS/CSS/字体）
  if (/\.(js|css|woff2?)$/.test(url.pathname)) {
    event.respondWith(staticStrategy(request));
    return;
  }

  // HTML：网络优先，缓存兜底（30分钟TTL）
  event.respondWith(
    (async () => {
      const cached = await cacheGet(STATIC_CACHE, request, HTML_TTL);
      try {
        const response = await fetch(request);
        if (response.ok) {
          cacheSet(STATIC_CACHE, request, response, HTML_TTL);
          return response;
        }
        return cached || response;
      } catch {
        return cached || caches.match('/');
      }
    })()
  );
});
