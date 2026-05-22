import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		// 运行时优化
		dev: false,
		// 使用更高效的响应式实现
		accessors: false,
		// 减少运行时检查
		customElement: false
	},
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: true,
			strict: false
		}),
		// SPA模式：未爬取的路由忽略（使用fallback）
		prerender: {
			handleUnseenRoutes: 'ignore'
		},
		alias: {
			$components: 'src/components',
			$lib: 'src/lib'
		},
		// 禁用不必要的功能
		csrf: {
			checkOrigin: false
		}
	}
};

export default config;
