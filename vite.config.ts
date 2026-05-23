import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		// 极致代码分割 - Vite 8优化
		rollupOptions: {
			output: {
				// 手动分包策略
				manualChunks: (id) => {
					// hls.js light版本单独分包，只在播放页加载
					if (id.includes('hls.js/dist/hls.light')) {
						return 'hls';
					}
					// 只分包 node_modules
					if (!id.includes('node_modules')) return;
					// 核心框架
					if (id.includes('svelte')) return 'svelte';
					// 其他第三方库
					return 'vendor';
				},
				// 入口文件优化
				entryFileNames: '_app/immutable/entry/[name]-[hash].js',
				chunkFileNames: '_app/immutable/chunks/[name]-[hash].js',
				assetFileNames: (info) => {
					const infoName = info.name || '';
					if (infoName.endsWith('.css')) {
						return '_app/immutable/assets/[name]-[hash][extname]';
					}
					return '_app/immutable/assets/[name]-[hash][extname]';
				}
			}
		},
		// 使用 esbuild 压缩 - Vite 8更快
		minify: 'esbuild',
		esbuildOptions: {
			target: 'es2020',
			drop: ['console', 'debugger'],
			// 树摇优化
			treeShaking: true,
			// 压缩优化
			minifyWhitespace: true,
			minifyIdentifiers: true,
			minifySyntax: true
		},
		// CSS 代码分割
		cssCodeSplit: true,
		// 资源内联阈值 - 小资源直接内联减少请求
		assetsInlineLimit: 8192,
		// 分块大小警告
		chunkSizeWarningLimit: 500,
		// 动态导入优化
		dynamicImportVarsOptions: {
			warnOnError: true,
			exclude: []
		},
		// 源码映射 - 生产环境关闭
		sourcemap: false,
		// 报告压缩后大小
		reportCompressedSize: false
	},
	// 优化依赖预构建 - Vite 8
	optimizeDeps: {
		// 排除hls.js让它完全延迟加载
		exclude: ['hls.js'],
		// 强制预构建
		force: true
	},
	// 开发服务器优化
	server: {
		fs: {
			strict: false
		},
		// 预热常用文件
		preTransformRequests: true
	},
	// 预览服务器
	preview: {
		headers: {
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	},
	// 实验性功能 - Vite 8
	experimental: {
		// 优化构建性能 - 使用绝对路径确保SPA路由正确加载
		renderBuiltUrl: (filename, { hostType }) => {
			return '/' + filename;
		}
	}
});
