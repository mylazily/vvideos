import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		dev: false,
		accessors: false,
		customElement: false
	},
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			// SPA路由使用200.html作为fallback（首页prerender为index.html）
			fallback: '200.html',
			precompress: true,
			strict: false
		}),
		prerender: {
			// 只有首页预渲染为纯静态HTML
			entries: ['/'],
			handleUnseenRoutes: 'ignore'
		},
		alias: {
			$components: 'src/components',
			$lib: 'src/lib'
		},
		csrf: {
			checkOrigin: false
		}
	}
};

export default config;
