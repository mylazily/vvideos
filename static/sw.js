// Service Worker v12 - 视频缓存 + PWA永不失联 + 首页极速
const STATIC_CACHE = 'evideos-static-v12';
const IMAGE_CACHE = 'evideos-images-v12';
const API_CACHE = 'evideos-api-v12';
const VIDEO_CACHE = 'evideos-video-v12';
const CACHE_VERSION = 'v12';

// 缓存TTL（毫秒）
const API_TTL = 10 * 60 * 1000;        // API缓存10分钟
const HTML_TTL = 2 * 60 * 60 * 1000;   // HTML缓存2小时（与边缘缓存一致）
const M3U8_TTL = 5 * 60 * 1000;        // m3u8播放列表缓存5分钟
const TS_TTL = 10 * 60 * 1000;         // ts视频片段缓存10分钟
const IMAGE_MAX = 300;                  // 图片缓存上限300张
const TS_MAX = 200;                     // ts片段缓存上限200个

// 核心资源（安装时预缓存）
const CORE_ASSETS = [
  '/',
  '/manifest.json'
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

// LRU淘汰：删除最旧的条目直到数量低于上限
async function lruEvict(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map(key => cache.delete(key)));
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
      await lruEvict(IMAGE_CACHE, IMAGE_MAX);
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

// 4. m3u8播放列表：网络优先，缓存兜底（5分钟TTL）
async function m3u8Strategy(request) {
  const cached = await cacheGet(VIDEO_CACHE, request, M3U8_TTL);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cacheSet(VIDEO_CACHE, request, response, M3U8_TTL);
      return response;
    }
    // 网络失败，返回缓存（即使过期也返回，保证不卡）
    return cached || response;
  } catch {
    return cached || new Response('', { status: 503 });
  }
}

// 5. ts视频片段：缓存优先（10分钟TTL，LRU 200上限）
async function tsStrategy(request) {
  const cached = await cacheGet(VIDEO_CACHE, request, TS_TTL);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      await lruEvict(VIDEO_CACHE, TS_MAX);
      cacheSet(VIDEO_CACHE, request, response, TS_TTL);
    }
    return response;
  } catch {
    return cached || new Response('', { status: 503 });
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

  // m3u8播放列表 - 网络优先，缓存兜底
  if (/\.m3u8(\?|$)/i.test(url.pathname)) {
    event.respondWith(m3u8Strategy(request));
    return;
  }

  // ts视频片段 - 缓存优先
  if (/\.ts(\?|$)/i.test(url.pathname) || url.pathname.includes('.ts?')) {
    event.respondWith(tsStrategy(request));
    return;
  }

  // 图片
  if (/\.(png|jpg|jpeg|webp|gif|ico)$/i.test(url.pathname)) {
    event.respondWith(imageStrategy(request));
    return;
  }

  // 静态资源（JS/CSS/字体）
  if (/\.(js|css|woff2?)$/.test(url.pathname)) {
    event.respondWith(staticStrategy(request));
    return;
  }

  // HTML：网络优先，缓存兜底（2小时TTL，离线返回预缓存）
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
        // 离线：尝试缓存（忽略TTL，离线时返回任何缓存版本）
        const cache = await caches.open(STATIC_CACHE);
        const anyCached = await cache.match(request);
        if (anyCached) return anyCached;
        // 返回预缓存的首页或SPA shell
        return caches.match('/') || caches.match('/200.html') || new Response(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>必爱必爱</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb;color:#6b7280}</style></head><body><p>网络连接中...</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })()
  );
});
