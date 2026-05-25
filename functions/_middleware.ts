// SPA fallback middleware - 非API请求返回200.html
import type { PagesFunction } from '@cloudflare/workers-types';

export const onRequest: PagesFunction = async (context) => {
	const url = new URL(context.request.url);
	const path = url.pathname;

	// API请求 - 交给其他Functions处理
	if (path.startsWith('/api/')) {
		return context.next();
	}

	// 静态资源 - 使用 context.next() 让 Assets 处理
	const staticExts = ['.js', '.css', '.png', '.jpg', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.xml', '.json', '.br', '.gz'];
	if (staticExts.some(ext => path.endsWith(ext))) {
		return context.next();
	}

	const staticPaths = ['/_app', '/static', '/favicon.png', '/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.json', '/robots.txt', '/sw.js', '/blocked.html'];
	if (staticPaths.some(p => path.startsWith(p))) {
		return context.next();
	}

	// 已知页面文件 (SvelteKit预渲染的) - 直接服务
	const knownPages = ['/index.html', '/200.html'];
	if (knownPages.some(p => path === p || path.endsWith('.html'))) {
		return context.next();
	}

	// 尝试获取请求的文件
	try {
		const response = await context.next();
		// 如果文件存在(200)，直接返回
		if (response.status === 200) {
			return response;
		}
	} catch {
		// context.next() 失败，继续fallback
	}

	// SPA fallback - 直接返回200.html的内容
	// 不改变URL，让浏览器保持在当前路径
	const fallbackRequest = new Request(url.origin + '/200.html', {
		method: 'GET',
		headers: {
			'Accept': 'text/html'
		}
	});

	try {
		const fallbackResponse = await context.env.ASSETS.fetch(fallbackRequest);
		if (fallbackResponse.status === 200) {
			// 返回200.html，但使用当前请求的URL
			// 这样SvelteKit客户端路由会根据当前URL渲染对应页面
			const response = new Response(fallbackResponse.body, {
				status: 200,
				headers: {
					'Content-Type': 'text/html;charset=UTF-8',
					'Cache-Control': 'no-cache, no-store, must-revalidate'
				}
			});
			return response;
		}
	} catch {
		// fallback失败
	}

	// 最终兜底
	return new Response('Not Found', { status: 404 });
};
