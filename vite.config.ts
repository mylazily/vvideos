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
					// hls.js 必须单独分包
					if (id.includes('hls.js')) {
						return 'hls';
					}

					// 只分包 node_modules
					if (!id.includes('node_modules')) return;

					// 核心框架
					if (id.includes('svelte')) return 'svelte';

					// 其他第三方库
					return 'vendor';
				}
			}
		},
		// 使用 esbuild 压缩
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
		chunkSizeWarningLimit: 500,
		// 动态导入优化
		dynamicImportVarsOptions: {
			warnOnError: true,
			exclude: []
		}
	},
	// 优化依赖预构建 - 排除hls.js让它完全延迟加载
	optimizeDeps: {
		exclude: ['hls.js']
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
