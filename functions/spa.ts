// SPA fallback HTML - 直接嵌入 200.html 内容
export const SPA_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

    <!-- Favicon -->
    <link rel="icon" href="/favicon.png" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />

    <!-- SEO -->
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
    <meta name="googlebot" content="index, follow" />
    <meta name="baiduspider" content="index, follow" />
    <meta name="format-detection" content="telephone=no" />
    <link rel="canonical" href="https://evideos.pages.dev/" />

    <!-- Open Graph -->
    <meta property="og:site_name" content="必爱必爱" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="/icon.svg" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />

    <!-- 预连接图片CDN -->
    <link rel="preconnect" href="https://xinlangtupian.com" crossorigin />

    <!-- 关键CSS内联 -->
    <style>
      html { background-color: #f9fafb; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    </style>

    <link href="/_app/immutable/entry/start.CIHTV5UN.js" rel="modulepreload">
		<link href="/_app/immutable/chunks/xg2w2FZ8.js" rel="modulepreload">
		<link href="/_app/immutable/chunks/BQ-_32WO.js" rel="modulepreload">
		<link href="/_app/immutable/entry/app.Bim-IFNA.js" rel="modulepreload">
		<link href="/_app/immutable/nodes/0.Bnh02AKq.js" rel="modulepreload">

		<link href="/_app/immutable/assets/0.Dvb9GNyW.css" rel="stylesheet">
  </head>
  <body>
    <div style="display: contents">
			<script>
				{
					__sveltekit_mqyqrh = {
						base: ""
					};

					const element = document.currentScript.parentElement;

					Promise.all([
						import("/_app/immutable/entry/start.CIHTV5UN.js"),
						import("/_app/immutable/entry/app.Bim-IFNA.js")
					]).then(([kit, app]) => {
						kit.start(app, element);
					});
				}
			</script>
		</div>
  </body>
</html>`;

export function spaResponse(): Response {
	return new Response(SPA_HTML, {
		status: 200,
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
}
