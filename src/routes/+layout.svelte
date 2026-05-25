<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { navigating } from '$app/stores';

	import { browser } from '$app/environment';

	let { children }: { children: Snippet } = $props();

	let displayMode = $state(1); // 1=正常, 2=全屏引导

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

		// 浏览器检测 + 域名连接检测
		const checkBrowser = async () => {
			// 合并导入，减少一个chunk请求
			const [{ applySubdomainSEO }, { detectBrowser }] = await Promise.all([
				import('$lib/subdomain'),
				import('$lib/browser-detect')
			]);
			applySubdomainSEO();
			const browserInfo = detectBrowser();

			// 国产APP/浏览器 → 直接全屏引导（UA检测即可，无需网络检测）
			if (browserInfo.isBlocked) {
				displayMode = 2;
				return;
			}

			// 非屏蔽浏览器：检测域名是否可访问（GFW/污染检测）
			// 仅在非PWA standalone模式下检测
			const isStandalone = window.matchMedia('(display-mode: standalone)').matches
				|| (window.navigator as any).standalone === true;
			if (isStandalone) return; // PWA已安装，跳过域名检测

			// 检查域名健康缓存（5分钟TTL）
			try {
				const HEALTH_CACHE_KEY = 'domain_health_cache';
				const HEALTH_CACHE_TTL = 5 * 60 * 1000;
				const cached = sessionStorage.getItem(HEALTH_CACHE_KEY);
				if (cached) {
					const { timestamp, healthy } = JSON.parse(cached);
					if (Date.now() - timestamp < HEALTH_CACHE_TTL && healthy) return;
				}
			} catch { /* 忽略 */ }

			// 快速域名连通性检测（3秒超时）
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 3000);
				const res = await fetch('/api/health', {
					method: 'HEAD',
					signal: controller.signal
				});
				clearTimeout(timeoutId);
				// 域名可访问，缓存结果
				sessionStorage.setItem('domain_health_cache', JSON.stringify({
					timestamp: Date.now(),
					healthy: true
				}));
			} catch {
				// 域名不可访问 → 显示引导页（推荐PWA或备用域名）
				sessionStorage.setItem('domain_health_cache', JSON.stringify({
					timestamp: Date.now(),
					healthy: false
				}));
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
