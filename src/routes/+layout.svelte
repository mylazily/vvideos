<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { navigating, page } from '$app/stores';

	import { browser } from '$app/environment';
	import { applySubdomainSEO } from '$lib/subdomain';

	import { detectBrowser } from '$lib/browser-detect';
	import UserGuide from '$components/UserGuide.svelte';
	import { getLocaleFromPath, getTranslations, generateHreflangTags, DEFAULT_LOCALE, HTML_LANG, type Locale } from '$lib/i18n';

	let { children }: { children: Snippet } = $props();

	// 0: 检测中, 1: 正常显示, 2: 显示引导
	let displayMode = $state(0);

	let locale = $state<Locale>(DEFAULT_LOCALE);
	let hreflangTags = $derived(generateHreflangTags($page.url.pathname.replace(/^\/(en|ko|ja|vi|th)\//, '/')));

	$effect(() => {
		locale = getLocaleFromPath($page.url.pathname);
		document.documentElement.lang = HTML_LANG[locale];
	});

	onMount(() => {
		applySubdomainSEO();
		// 禁用域名跳转，用户应留在当前域名
		// initDomainGuard() 已移除
		locale = getLocaleFromPath($page.url.pathname);

		if (!browser) {
			displayMode = 1;
			return;
		}

		const browserInfo = detectBrowser();

		if (browserInfo.isBlocked) {
			// 硬屏蔽APP（微信/QQ/抖音等）：每次都强制显示引导，不缓存
			const hardBlockedApps = ['wechat', 'qq', 'weibo', 'douyin', 'toutiao', 'alipay', 'baidu_app'];
			if (hardBlockedApps.includes(browserInfo.type)) {
				displayMode = 2; // 每次都显示全屏引导
			} else {
				// 体验受限浏览器（UC/百度等）：1小时内不再显示
				const d = localStorage.getItem('guide_dismissed');
				if (d) {
					const dismissedTime = parseInt(d);
					if (Date.now() - dismissedTime < 60 * 60 * 1000) {
						displayMode = 1;
						return;
					}
				}
				displayMode = 2;
			}
		} else {
			displayMode = 1; // 正常显示
		}
	});
</script>

<svelte:head>
	{@html hreflangTags}
</svelte:head>

{#if displayMode === 0}
	<!-- 检测中：显示加载状态，避免白屏 -->
	<div class="fixed inset-0 bg-gradient-to-b from-pink-500 to-rose-600 z-[9999] flex flex-col items-center justify-center text-white">
		<div class="text-6xl mb-4">📲</div>
		<div class="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
		<p class="text-white/70 text-sm mt-4">加载中...</p>
	</div>
{:else if displayMode === 1}
	<!-- 页面导航加载条 -->
	{#if $navigating}
		<div class="fixed top-0 left-0 right-0 z-[100]">
			<div class="h-0.5 bg-pink-100 overflow-hidden">
				<div class="h-full bg-pink-500 animate-loading-bar"></div>
			</div>
		</div>
	{/if}
	{@render children()}
	<UserGuide blocked={false} />
{:else}
	<UserGuide blocked={true} />
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
