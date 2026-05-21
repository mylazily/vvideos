<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { applySubdomainSEO } from '$lib/subdomain';
	import { initDomainGuard } from '$lib/domain-guard';
	import { detectBrowser } from '$lib/browser-detect';
	import UserGuide from '$components/UserGuide.svelte';

	// 0: 检测中, 1: 正常显示, 2: 显示引导
	let displayMode = $state(0);

	onMount(() => {
		applySubdomainSEO();
		initDomainGuard();

		if (!browser) {
			displayMode = 1;
			return;
		}

		const browserInfo = detectBrowser();

		if (browserInfo.isBlocked) {
			// 检查是否已忽略过引导（国产APP 1天内不再显示）
			const d = localStorage.getItem('guide_dismissed');
			if (d) {
				const dismissedTime = parseInt(d);
				if (Date.now() - dismissedTime < 24 * 60 * 60 * 1000) {
					displayMode = 1;
					return;
				}
			}
			displayMode = 2; // 显示引导
		} else {
			displayMode = 1; // 正常显示
		}
	});
</script>

{#if displayMode === 0}
	<!-- 检测中：显示加载状态，避免白屏 -->
	<div class="fixed inset-0 bg-gradient-to-b from-pink-500 to-rose-600 z-[9999] flex flex-col items-center justify-center text-white">
		<div class="text-6xl mb-4">📲</div>
		<div class="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
		<p class="text-white/70 text-sm mt-4">加载中...</p>
	</div>
{:else if displayMode === 1}
	<slot />
	<UserGuide blocked={false} />
{:else}
	<UserGuide blocked={true} />
{/if}
