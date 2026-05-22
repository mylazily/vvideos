<script lang="ts">
  import { onMount } from 'svelte';
  import PageLayout from '$components/PageLayout.svelte';
  import LoadingSpinner from '$components/LoadingSpinner.svelte';
  import EmptyState from '$components/EmptyState.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import type { Video } from '$lib/types';
  import { generateBreadcrumbSchema } from '$lib/seo';

  // 不再内置分类，从资源站动态获取
  let categories = $state<string[]>(['全部']);
  let activeCategory = $state('全部');
  let videos = $state<Video[]>([]);
  let loading = $state(true);

  onMount(async () => {
    // 先加载分类，再加载排行
    await loadCategories();
    await loadRank();
  });

  async function loadCategories() {
    try {
      const res = await fetch('/api/categories', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data.data && data.data.length > 0) {
          categories = ['全部', ...data.data];
        }
      }
    } catch (e) {
      console.error('加载分类失败:', e);
      // 失败时使用默认分类（从资源站采集的数据）
    }
  }

  async function loadRank() {
    loading = true;
    try {
      const url = activeCategory === '全部' 
        ? '/api/rank' 
        : `/api/rank?category=${encodeURIComponent(activeCategory)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json();
        videos = data.data || [];
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  function switchCategory(cat: string) {
    activeCategory = cat;
    loadRank();
  }
</script>

<svelte:head>
  <title>排行榜 - 必爱必爱</title>
  <meta name="description" content="必爱必爱视频排行榜，最热门的内容排行" />
  <meta name="keywords" content="排行榜,热门视频,热播排行" />
  <link rel="canonical" href="https://evideos.pages.dev/rank" />
  <meta property="og:title" content="排行榜 - 必爱必爱" />
  <meta property="og:description" content="必爱必爱视频排行榜，最热门的内容排行" />
  <meta property="og:url" content="https://evideos.pages.dev/rank" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="https://evideos.pages.dev/icon.svg" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="排行榜 - 必爱必爱" />
  <meta name="twitter:description" content="必爱必爱视频排行榜，热门电影、电视剧、动漫、综艺排行" />
  {@html `<script type="application/ld+json">${JSON.stringify(generateBreadcrumbSchema([{name: '首页', url: 'https://evideos.pages.dev/'}, {name: '排行榜', url: 'https://evideos.pages.dev/rank'}]))}</script>`}
</svelte:head>

<PageLayout title="排行榜">
  <!-- 分类切换 -->
  <div class="flex gap-2 px-1 mb-3 overflow-x-auto no-scrollbar">
    {#each categories as cat}
      <button
        onclick={() => switchCategory(cat)}
        class="flex-shrink-0 px-4 py-1.5 text-sm rounded-full transition-all {activeCategory === cat
          ? 'bg-pink-500 text-white'
          : 'text-gray-600 bg-gray-100'}"
      >
        {cat}
      </button>
    {/each}
  </div>

  {#if loading}
    <LoadingSpinner />
  {:else if videos.length === 0}
    <EmptyState message="暂无排行数据" />
  {:else}
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
      {#each videos as video, i (video.vod_id)}
        <div class="relative">
          {#if i < 3}
            <div
              class="absolute -top-1 -left-1 z-10 w-6 h-6 bg-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow"
            >
              {i + 1}
            </div>
          {:else}
            <div
              class="absolute -top-1 -left-1 z-10 w-6 h-6 bg-gray-400 text-white text-xs font-bold rounded-full flex items-center justify-center"
            >
              {i + 1}
            </div>
          {/if}
          <VideoCard {video} />
        </div>
      {/each}
    </div>
  {/if}
</PageLayout>
