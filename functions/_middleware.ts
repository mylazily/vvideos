// SPA fallback middleware - 所有请求首先经过这里
import type { PagesFunction } from '@cloudflare/workers-types';

export const onRequest: PagesFunction = async (context) => {
	const url = new URL(context.request.url);
	const path = url.pathname;

	// API请求 - 交给 api/ 目录的Functions处理
	if (path.startsWith('/api/')) {
		return context.next();
	}

	// 静态资源 - 直接让Assets处理
	if (path.startsWith('/_app/') ||
		path.startsWith('/static/') ||
		path.endsWith('.js') ||
		path.endsWith('.css') ||
		path.endsWith('.png') ||
		path.endsWith('.jpg') ||
		path.endsWith('.svg') ||
		path.endsWith('.ico') ||
		path.endsWith('.webp') ||
		path.endsWith('.woff') ||
		path.endsWith('.woff2') ||
		path.endsWith('.ttf') ||
		path.endsWith('.xml') ||
		path.endsWith('.json') ||
		path === '/favicon.png' ||
		path === '/icon.svg' ||
		path === '/icon-192.png' ||
		path === '/icon-512.png' ||
		path === '/manifest.json' ||
		path === '/robots.txt' ||
		path === '/sw.js' ||
		path === '/blocked.html') {
		return context.next();
	}

	// 已知页面文件 - 让Assets处理
	if (path === '/' || path === '/index.html') {
		return context.next();
	}

	// 尝试获取请求的文件（让Assets处理）
	try {
		const response = await context.next();
		// 如果文件存在，直接返回
		if (response.status === 200) {
			return response;
		}
	} catch {
		// context.next() 抛出异常，继续fallback
	}

	// SPA fallback - 返回index.html让SvelteKit客户端路由处理
	// index.html包含完整的SvelteKit客户端启动代码（csr=true）
	// 客户端路由会根据当前URL自动渲染对应的页面组件
	const response = new Response(
		await (
			await context.env.ASSETS.fetch(
				new Request(url.origin + '/index.html', { method: 'GET' })
			)
		).text(),
		{
			status: 200,
			headers: {
				'Content-Type': 'text/html;charset=UTF-8',
				'Cache-Control': 'no-cache'
			}
		}
	);

	return response;
};
