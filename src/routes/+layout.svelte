<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { navigating } from '$app/stores';
	import { browser } from '$app/environment';

	let { children }: { children: Snippet } = $props();

	// Svelte 5: 使用 $derived 创建响应式导航状态
	let isNavigating = $derived($navigating !== null);

	onMount(() => {
		if (!browser) return;

		// 注册 Service Worker
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js').catch(() => {});
		}
	});
</script>

{#if browser && isNavigating}
	<div class="fixed top-0 left-0 right-0 z-[100]">
		<div class="h-0.5 bg-pink-100 overflow-hidden">
			<div class="h-full bg-pink-500 animate-loading-bar"></div>
		</div>
	</div>
{/if}

{@render children()}

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
