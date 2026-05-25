// SPA fallback - 非 API 请求返回 200.html
// Cloudflare Pages Functions 的 onBeforeRequest 钩子

export const onRequest: PagesFunction = async (context) => {
	const url = new URL(context.request.url);

	// API 请求交给 api/ 目录处理
	if (url.pathname.startsWith('/api/')) {
		return context.next();
	}

	// 静态资源交给 Assets 处理
	const staticExts = ['.js', '.css', '.png', '.jpg', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.xml', '.json', '.html', '.br', '.gz'];
	if (staticExts.some(ext => url.pathname.endsWith(ext))) {
		return context.next();
	}

	const staticPaths = ['/_app', '/static', '/favicon.png', '/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.json', '/robots.txt', '/sw.js', '/blocked.html'];
	if (staticPaths.some(p => url.pathname.startsWith(p))) {
		return context.next();
	}

	// 其他请求：SPA fallback，返回 200.html
	try {
		const response = await context.next();
		// 如果 Assets 找到了文件（200），直接返回
		if (response.status === 200) {
			return response;
		}
	} catch {}

	// Assets 没找到文件，返回 200.html
	const indexPath = '/200.html';
	const fallbackUrl = new URL(indexPath, url);
	const fallbackRequest = new Request(fallbackUrl.toString(), {
		headers: context.request.headers
	});

	try {
		const fallbackResponse = await context.env.ASSETS.fetch(fallbackRequest);
		if (fallbackResponse.status === 200) {
			return new Response(fallbackResponse.body, {
				status: 200,
				headers: {
					'Content-Type': 'text/html;charset=UTF-8'
				}
			});
		}
	} catch {}

	// 最终兜底
	return new Response('Not Found', { status: 404 });
};
