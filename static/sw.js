// Service Worker v11 - 播放器极速优化
const STATIC_CACHE = 'evideos-static-v11';
const IMAGE_CACHE = 'evideos-images-v11';
const API_CACHE = 'evideos-api-v11';
const CACHE_VERSION = 'v11';

// 缓存TTL（毫秒）- 延长缓存时间减少请求
const API_TTL = 10 * 60 * 1000;      // API缓存10分钟
const HTML_TTL = 60 * 60 * 1000;     // HTML缓存1小时
const IMAGE_MAX = 300;                // 图片缓存上限300张（控制内存）

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

// 2. 图片：缓存优先（LRU，上限300张）
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

// 3. API：缓存优先，后台更新（Stale-While-Revalidate）
async function apiStrategy(request) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);
  
  // 如果有缓存且未过期，直接返回
  if (cached) {
    const dateHeader = cached.headers.get('sw-cache-time');
    if (dateHeader && (Date.now() - parseInt(dateHeader)) < API_TTL) {
      // 后台更新缓存
      fetch(request).then(response => {
        if (response.ok) cacheSet(API_CACHE, request, response, API_TTL);
      }).catch(() => {});
      return cached;
    }
  }
  
  // 无缓存或过期，请求网络
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

  // API - 使用Stale-While-Revalidate策略
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

  // HTML：网络优先，缓存兜底（1小时TTL）
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          cacheSet(STATIC_CACHE, request, response, HTML_TTL);
          return response;
        }
        // 非OK响应：尝试缓存或返回200.html SPA shell
        const cached = await cacheGet(STATIC_CACHE, request, HTML_TTL);
        if (cached) return cached;
        return caches.match('/200.html') || response;
      } catch {
        // 离线：尝试缓存或返回200.html SPA shell
        const cached = await cacheGet(STATIC_CACHE, request, HTML_TTL);
        if (cached) return cached;
        return caches.match('/200.html') || caches.match('/');
      }
    })()
  );
});
