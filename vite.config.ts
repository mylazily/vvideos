import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		// 代码分割优化
		rollupOptions: {
			output: {
				// 手动分包策略
				manualChunks: (id) => {
					if (!id.includes('node_modules')) return;
					// 第三方库单独打包，减少主包大小
					if (id.includes('@sveltejs')) return 'svelte';
					if (id.includes('hls.js')) return 'hls';
					return 'vendor';
				}
			}
		},
		// 压缩配置（移除 terser，使用 esbuild 更快的压缩）
		minify: 'esbuild',
		// CSS 代码分割
		cssCodeSplit: true,
		// 分包大小警告阈值（KB）
		chunkSizeWarningLimit: 500
	},
	// 开发服务器优化
	server: {
		headers: {
			'Cache-Control': 'no-cache'
		}
	},
	// 生产优化
	optimizeDeps: {
		include: ['hls.js']
	}
});
