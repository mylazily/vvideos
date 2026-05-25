// Service Worker v19 - 首帧极速 + 预缓存10分钟
const STATIC_CACHE = 'evideos-static-v19';
const IMAGE_CACHE = 'evideos-images-v19';
const API_CACHE = 'evideos-api-v19';
const VIDEO_CACHE = 'evideos-video-v19';
const CACHE_VERSION = 'v19';

// 缓存TTL（毫秒）- 恢复原来的配置
const API_TTL = 5 * 60 * 1000;         // API缓存5分钟
const M3U8_TTL = 5 * 60 * 1000;        // m3u8播放列表缓存5分钟
const TS_TTL = 10 * 60 * 1000;         // ts视频片段缓存10分钟（用户说的10分钟）
const IMAGE_MAX = 300;
const TS_MAX = 200;

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

// LRU淘汰
async function lruEvict(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map(key => cache.delete(key)));
  }
}

// ======== 缓存策略 ========

// 1. JS/CSS：网络优先（确保总是加载最新版本）
async function staticStrategy(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      cacheSet(STATIC_CACHE, request, response, 0);
      return response;
    }
    const cached = await cacheGet(STATIC_CACHE, request, 0);
    return cached || response;
  } catch {
    const cached = await cacheGet(STATIC_CACHE, request, 0);
    return cached || new Response('', { status: 404 });
  }
}

// 2. 图片：缓存优先（LRU 300张）
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

// 3. API：Stale-While-Revalidate（5分钟）
async function apiStrategy(request) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    const dateHeader = cached.headers.get('sw-cache-time');
    if (dateHeader && (Date.now() - parseInt(dateHeader)) < API_TTL) {
      fetch(request).then(response => {
        if (response.ok) cacheSet(API_CACHE, request, response, API_TTL);
      }).catch(() => {});
      return cached;
    }
  }

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

// 4. m3u8：网络优先，缓存兜底（5分钟）
async function m3u8Strategy(request) {
  const cached = await cacheGet(VIDEO_CACHE, request, M3U8_TTL);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cacheSet(VIDEO_CACHE, request, response, M3U8_TTL);
      return response;
    }
    return cached || response;
  } catch {
    return cached || new Response('', { status: 503 });
  }
}

// 5. ts片段：缓存优先（10分钟，LRU 200）- 用户要求的10分钟缓冲
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
    return cached || new Response('', { status: 504 });
  }
}

// ======== 请求拦截 ========
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;

  // 不拦截第三方请求
  if (url.hostname !== location.host) return;

  // API
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(apiStrategy(request));
    return;
  }

  // m3u8
  if (/\.m3u8(\?|$)/i.test(url.pathname)) {
    event.respondWith(m3u8Strategy(request));
    return;
  }

  // ts片段
  if (/\.ts(\?|$)/i.test(url.pathname) || url.pathname.includes('.ts?')) {
    event.respondWith(tsStrategy(request));
    return;
  }

  // 图片
  if (/\.(png|jpg|jpeg|webp|gif|ico)$/i.test(url.pathname)) {
    event.respondWith(imageStrategy(request));
    return;
  }

  // JS/CSS/字体：网络优先
  if (/\.(js|css|woff2?)$/.test(url.pathname)) {
    event.respondWith(staticStrategy(request));
    return;
  }

  // HTML：不缓存，始终走网络
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        return caches.match('/') || caches.match('/200.html') || new Response(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>必爱必爱</title></head><body><p>网络连接中...</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })()
  );
});
