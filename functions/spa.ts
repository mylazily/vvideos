// SPA fallback - 动态从 200.html 获取内容，避免硬编码文件哈希

interface Env {
	ASSETS: Fetcher;
}

export async function spaResponse(context: { env: Env }): Promise<Response> {
	try {
		const response = await context.env.ASSETS.fetch(
			new Request(new URL('/200.html', 'https://spa.pages.dev'))
		);
		if (response.ok) {
			const html = await response.text();
			return new Response(html, {
				status: 200,
				headers: {
					'content-type': 'text/html; charset=utf-8',
					'cache-control': 'no-store'
				}
			});
		}
	} catch {
		// fallback: 返回最小 SPA shell
	}

	// 极端兜底：返回最小可用的 HTML
	return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>加载中...</title><style>body{margin:0;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:#666}</style></head><body><p>加载中...</p><script>fetch('/200.html').then(r=>r.text()).then(h=>{document.open();document.write(h);document.close()}).catch(()=>location.reload())</script></body></html>`, {
		status: 200,
		headers: {
			'content-type': 'text/html; charset=utf-8'
		}
	});
}
