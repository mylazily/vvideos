import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		dev: false,
		accessors: false,
		customElement: false,
		// Svelte 5 Runes Mode - 启用响应式原语
		runes: true
	},
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			// SPA路由使用index.html作为fallback
			fallback: 'index.html',
			precompress: true,
			strict: false
		}),
		prerender: {
			// 只有首页预渲染为纯静态HTML
			entries: ['/'],
			handleUnseenRoutes: 'ignore',
			handleHttpError: 'warn'
		},
		alias: {
			$components: 'src/components',
			$lib: 'src/lib'
		},
		csrf: {
			checkOrigin: false
		},
		paths: {
			// 使用绝对路径，确保SPA路由正确加载资源
			base: '',
			relative: false
		}
	}
};

export default config;
