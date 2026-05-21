<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { applySubdomainSEO } from '$lib/subdomain';
	import { initDomainGuard } from '$lib/domain-guard';
	import { detectBrowser } from '$lib/browser-detect';
	import UserGuide from '$components/UserGuide.svelte';

	let blocked = $state(false);

	onMount(() => {
		applySubdomainSEO();
		initDomainGuard();

		if (typeof window === 'undefined') return;

		const browser = detectBrowser();

		if (browser.isBlocked) {
			// 检查是否已忽略过引导（国产APP 1天内不再显示）
			const d = localStorage.getItem('guide_dismissed');
			if (d) {
				const dismissedTime = parseInt(d);
				if (Date.now() - dismissedTime < 24 * 60 * 60 * 1000) {
					return;
				}
			}
			blocked = true;
		}
	});
</script>

{#if !blocked}
	<slot />
{/if}

<UserGuide {blocked} />
