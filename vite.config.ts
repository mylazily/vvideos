import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		// 极致代码分割
		rollupOptions: {
			output: {
				// 手动分包策略
				manualChunks: (id) => {
					// 只分包 node_modules
					if (!id.includes('node_modules')) return;
					
					// 核心框架
					if (id.includes('svelte')) return 'svelte';
					
					// 视频播放
					if (id.includes('hls.js')) return 'video';
					
					// 其他第三方库
					return 'vendor';
				}
			}
		},
		// 使用 esbuild 压缩（比 terser 快 10-20 倍）
		minify: 'esbuild',
		esbuildOptions: {
			target: 'es2020',
			drop: ['console', 'debugger']
		},
		// CSS 代码分割
		cssCodeSplit: true,
		// 资源内联阈值
		assetsInlineLimit: 4096,
		// 分块大小警告
		chunkSizeWarningLimit: 500
	},
	// 优化依赖预构建
	optimizeDeps: {
		include: ['hls.js'],
		exclude: ['svelte']
	},
	// 开发服务器
	server: {
		fs: {
			strict: false
		}
	},
	// 预览服务器
	preview: {
		headers: {
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	}
});
