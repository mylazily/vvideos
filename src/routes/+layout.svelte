<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { navigating } from '$app/stores';

	import { browser } from '$app/environment';

	let { children }: { children: Snippet } = $props();

	let displayMode = $state(1);

	// 仅客户端SPA页面执行：PWA注入 + SW注册 + 浏览器检测
	onMount(() => {
		if (!browser) return;

		// 动态注入PWA manifest（首页prerender不包含这些）
		const injectPWA = () => {
			const head = document.head;
			const links = [
				{ rel: 'manifest', href: '/manifest.json' },
				{ rel: 'apple-touch-icon', href: '/icon-192.png' }
			];
			for (const l of links) {
				if (!head.querySelector(`link[href="${l.href}"]`)) {
					const el = document.createElement('link');
					el.rel = l.rel;
					el.href = l.href;
					head.appendChild(el);
				}
			}
			const metas = [
				{ name: 'theme-color', content: '#ec4899' },
				{ name: 'msapplication-TileColor', content: '#ec4899' },
				{ name: 'apple-mobile-web-app-capable', content: 'yes' },
				{ name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
				{ name: 'apple-mobile-web-app-title', content: '必爱必爱' }
			];
			for (const m of metas) {
				if (!head.querySelector(`meta[name="${m.name}"]`)) {
					const el = document.createElement('meta');
					el.name = m.name;
					el.content = m.content;
					head.appendChild(el);
				}
			}
		};

		// 注册 Service Worker
		const registerSW = () => {
			if ('serviceWorker' in navigator) {
				navigator.serviceWorker.register('/sw.js').catch(() => {});
			}
		};

		// 浏览器检测 - 延迟到空闲时执行
		const checkBrowser = async () => {
			const { applySubdomainSEO } = await import('$lib/subdomain');
			const { detectBrowser } = await import('$lib/browser-detect');
			applySubdomainSEO();
			const browserInfo = detectBrowser();
			if (browserInfo.isBlocked) {
				displayMode = 2;
			}
		};

		const init = () => {
			injectPWA();
			registerSW();
			// 延迟浏览器检测，不阻塞首屏
			setTimeout(checkBrowser, 2000);
		};

		if ('requestIdleCallback' in window) {
			requestIdleCallback(init, { timeout: 100 });
		} else {
			setTimeout(init, 50);
		}
	});
</script>

{#if displayMode === 2}
	{#await import('$components/UserGuide.svelte') then { default: UserGuide }}
		<UserGuide blocked={true} />
	{/await}
{:else}
	{#if browser && $navigating}
		<div class="fixed top-0 left-0 right-0 z-[100]">
			<div class="h-0.5 bg-pink-100 overflow-hidden">
				<div class="h-full bg-pink-500 animate-loading-bar"></div>
			</div>
		</div>
	{/if}
	{@render children()}
{/if}

<style>
	@keyframes loading-bar {
		0% { width: 0%; margin-left: 0; }
		50% { width: 60%; margin-left: 20%; }
		100% { width: 0%; margin-left: 100%; }
	}
	.animate-loading-bar {
		animation: loading-bar 1.5s ease-in-out infinite;
	}
</style>
