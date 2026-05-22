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
	let showGuide = $state(false);

	// 异步检测浏览器，不阻塞首屏
	onMount(() => {
		// 使用 requestIdleCallback 在空闲时执行检测
		const checkBrowser = () => {
			applySubdomainSEO();

			if (!browser) return;

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

		// 延迟执行，不阻塞首屏渲染
		if ('requestIdleCallback' in window) {
			requestIdleCallback(checkBrowser, { timeout: 100 });
		} else {
			setTimeout(checkBrowser, 50);
		}
	});
</script>

{#if displayMode === 2}
	<!-- 动态加载UserGuide，减少初始包体积 -->
	{#await import('$components/UserGuide.svelte') then { default: UserGuide }}
		<UserGuide blocked={true} />
	{/await}
{:else}
	{#if $navigating}
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
