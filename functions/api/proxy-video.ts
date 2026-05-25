// 视频流代理 - 解决 CORS 跨域问题
// 将外部 m3u8/ts 流通过 Cloudflare Workers 代理，添加正确 CORS 头
// 重写 m3u8 内的相对路径为代理路径

import type { PagesFunction } from '@cloudflare/workers-types';

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // 验证 URL 格式（只允许 http/https）
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return new Response('Invalid URL scheme', { status: 400 });
  }

  // 允许的域名白名单（视频流域名）
  const allowedHosts = [
    'guangsuapi.com',  // 光速资源站
    'gsuus.com',       // 光速视频域名
    'gszyi.com',       // 光速 CDN 域名
    'jisuzyv.com',
    'jisuts.com',
    'jisuimage.com',
    'bfzyapi.com',
    'lzyapi.com',
    'xinlangtupian.com',
  ];
  
  let targetOrigin: string;
  try {
    const targetUrlObj = new URL(targetUrl);
    targetOrigin = targetUrlObj.origin;
    const targetHost = targetUrlObj.hostname;
    const isAllowed = allowedHosts.some(host => targetHost.includes(host));
    if (!isAllowed) {
      return new Response('Domain not allowed', { status: 403 });
    }
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  try {
    // 转发请求到目标 URL
    const response = await fetch(targetUrl, {
      method: context.request.method,
      headers: {
        'Accept': context.request.headers.get('Accept') || '*/*',
        'Accept-Language': context.request.headers.get('Accept-Language') || 'zh-CN,zh;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://v.gsuus.com/',
        'Origin': 'https://v.gsuus.com',
      },
      redirect: 'follow',
    });

    // 构建响应头，添加 CORS
    const corsHeaders = new Headers(response.headers);
    corsHeaders.set('Access-Control-Allow-Origin', '*');
    corsHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    corsHeaders.set('Access-Control-Allow-Headers', '*');
    corsHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
    
    // 缓存控制：m3u8 不缓存，ts 片段缓存
    if (targetUrl.includes('.m3u8')) {
      corsHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (targetUrl.includes('.ts') || targetUrl.includes('.key')) {
      corsHeaders.set('Cache-Control', 'public, max-age=600'); // 10分钟缓存
    }

    // 确保正确的 Content-Type
    if (targetUrl.includes('.m3u8') && !corsHeaders.has('Content-Type')) {
      corsHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (targetUrl.includes('.ts') && !corsHeaders.has('Content-Type')) {
      corsHeaders.set('Content-Type', 'video/mp2t');
    } else if (targetUrl.includes('.key') && !corsHeaders.has('Content-Type')) {
      corsHeaders.set('Content-Type', 'application/octet-stream');
    }

    // 对于 m3u8 文件，重写相对路径为代理路径
    if (targetUrl.includes('.m3u8')) {
      const text = await response.text();
      // 重写相对路径：将 /xxx 或 ./xxx 转换为代理路径
      const rewritten = rewriteM3u8Paths(text, targetUrl, targetOrigin);
      return new Response(rewritten, {
        status: response.status,
        statusText: response.statusText,
        headers: corsHeaders,
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: corsHeaders,
    });
  } catch (error) {
    return new Response('Proxy error: ' + (error as Error).message, { status: 502 });
  }
};

// 重写 m3u8 文件中的相对路径
function rewriteM3u8Paths(content: string, originalUrl: string, origin: string): string {
  const lines = content.split('\n');
  const baseUrl = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);
  
  return lines.map(line => {
    // 跳过注释行和空行
    if (line.startsWith('#') || line.trim() === '') {
      return line;
    }
    
    // 处理相对路径
    let url = line.trim();
    
    // 绝对路径（以 http 开头）- 转换为代理路径
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return `/api/proxy-video?url=${encodeURIComponent(url)}`;
    }
    
    // 相对路径（以 / 开头）- 转换为绝对路径再代理
    if (url.startsWith('/')) {
      const absoluteUrl = origin + url;
      return `/api/proxy-video?url=${encodeURIComponent(absoluteUrl)}`;
    }
    
    // 相对路径（以 ./ 开头或无前缀）- 相对于当前 m3u8 文件位置
    if (url.startsWith('./')) {
      url = url.substring(2);
    }
    const absoluteUrl = baseUrl + url;
    return `/api/proxy-video?url=${encodeURIComponent(absoluteUrl)}`;
  }).join('\n');
}

// 处理 OPTIONS 预检请求
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
};
