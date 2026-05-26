import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit()
	],
	build: {
		sourcemap: true,
		rollupOptions: {
			output: {
				manualChunks: {
					'video-player': ['hls.js']
				}
			}
		}
	},
	optimizeDeps: {
		include: ['hls.js']
	}
});
