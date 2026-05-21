<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { applySubdomainSEO } from '$lib/subdomain';
	import { initDomainGuard } from '$lib/domain-guard';
	import { detectBrowser } from '$lib/browser-detect';
	import UserGuide from '$components/UserGuide.svelte';
	import { pwaManager } from '$lib/pwa-manager';

	let { children }: { children: Snippet } = $props();

	// 0: 检测中, 1: 正常显示, 2: 显示引导
	let displayMode = $state(0);
	let showUpdateToast = $state(false);

	onMount(() => {
		applySubdomainSEO();
		initDomainGuard();

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

		// 监听 PWA 更新
		window.addEventListener('pwa-update-available', () => {
			showUpdateToast = true;
		});
	});

	async function handleUpdate() {
		await pwaManager.update();
	}
</script>

{#if displayMode === 0}
	<!-- 检测中：显示加载状态，避免白屏 -->
	<div class="fixed inset-0 bg-gradient-to-b from-pink-500 to-rose-600 z-[9999] flex flex-col items-center justify-center text-white">
		<div class="text-6xl mb-4">📲</div>
		<div class="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
		<p class="text-white/70 text-sm mt-4">加载中...</p>
	</div>
{:else if displayMode === 1}
	{@render children()}
	<UserGuide blocked={false} />

	<!-- 更新提示 -->
	{#if showUpdateToast}
		<div class="fixed top-16 left-4 right-4 bg-blue-500 text-white px-4 py-3 rounded-xl shadow-lg z-[100] flex items-center justify-between">
			<div class="flex items-center gap-2">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
				</svg>
				<span class="text-sm">新版本可用</span>
			</div>
			<button onclick={handleUpdate} class="text-sm font-medium underline">立即更新</button>
		</div>
	{/if}
{:else}
	<UserGuide blocked={true} />
{/if}
