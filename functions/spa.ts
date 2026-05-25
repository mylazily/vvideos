// SPA fallback - 所有非 /api/ 请求返回 200.html
// Cloudflare Pages Functions 的 onBeforeRequest 钩子
// 当请求的路径没有对应的静态文件时，返回 200.html 让 SvelteKit 客户端路由处理

export const onRequest: PagesFunction = async (context) => {
	const url = new URL(context.request.url);

	// API 请求不处理，由 api/ 目录的函数处理
	if (url.pathname.startsWith('/api/')) {
		return context.next();
	}

	// 静态资源不处理
	const staticExts = ['.js', '.css', '.png', '.jpg', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.xml', '.json', '.html', '.br', '.gz'];
	if (staticExts.some(ext => url.pathname.endsWith(ext))) {
		return context.next();
	}

	// 已知的静态文件路径不处理
	const staticPaths = ['/_app', '/static', '/favicon.png', '/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.json', '/robots.txt', '/sw.js', '/blocked.html'];
	if (staticPaths.some(p => url.pathname.startsWith(p))) {
		return context.next();
	}

	// 其他所有请求返回 200.html（SPA fallback）
	const response = await context.env.ASSETS.fetch(new Request('https://placeholder/200.html', context.request));
	return new Response(response.body, {
		status: 200,
		headers: {
			'Content-Type': 'text/html;charset=UTF-8',
			'Cache-Control': 'no-cache'
		}
	});
};
