<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { navigating } from '$app/stores';

	import { browser } from '$app/environment';
	import { applySubdomainSEO } from '$lib/subdomain';
	import { detectBrowser } from '$lib/browser-detect';

	let { children }: { children: Snippet } = $props();

	// 直接显示内容，不阻塞渲染
	let displayMode = $state(1);

	// 异步检测浏览器 + 注册SW（仅在客户端SPA页面执行）
	onMount(() => {
		if (!browser) return;

		// 注册 Service Worker（延迟执行）
		const registerSW = () => {
			if ('serviceWorker' in navigator) {
				navigator.serviceWorker.register('/sw.js').catch(() => {});
			}
		};

		// 浏览器检测
		const checkBrowser = () => {
			applySubdomainSEO();

			const browserInfo = detectBrowser();

			if (browserInfo.isBlocked) {
				const hardBlockedApps = ['wechat', 'qq', 'weibo', 'douyin', 'toutiao', 'alipay', 'baidu_app'];
				if (hardBlockedApps.includes(browserInfo.type)) {
					displayMode = 2;
				} else {
					const d = localStorage.getItem('guide_dismissed');
					if (d) {
						const dismissedTime = parseInt(d);
						if (Date.now() - dismissedTime < 60 * 60 * 1000) {
							return;
						}
					}
					displayMode = 2;
				}
			}
		};

		if ('requestIdleCallback' in window) {
			requestIdleCallback(() => {
				registerSW();
				checkBrowser();
			}, { timeout: 100 });
		} else {
			setTimeout(() => {
				registerSW();
				checkBrowser();
			}, 50);
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
	{#if browser}
		{#await import('$components/UserGuide.svelte') then { default: UserGuide }}
			<UserGuide blocked={false} />
		{/await}
	{/if}
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
