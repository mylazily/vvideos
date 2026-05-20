<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import Pagination from '$components/Pagination.svelte';
  import type { Video } from '$lib/types';

  let videos = $state<Video[]>([]);
  let loading = $state(true);
  let currentPage = $state(1);
  let totalPages = $state(1);
  let totalCount = $state(0);

  let tagName = $derived(decodeURIComponent($page.params.name || ''));
  let pageParam = $derived(parseInt($page.params.page || '1'));

  onMount(() => {
    if (tagName) {
      loadTagVideos(pageParam || 1);
    }
  });

  async function loadTagVideos(pg: number) {
    loading = true;
    videos = [];
    currentPage = pg;

    try {
      const res = await fetch(
        `/api/tag?name=${encodeURIComponent(tagName)}&page=${pg}&limit=24`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const data = await res.json();
        videos = data.data?.videos || [];
        totalPages = data.data?.pagination?.totalPages || 1;
        totalCount = data.data?.pagination?.total || 0;
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  function handlePageChange(pg: number) {
    goto('/tag/' + encodeURIComponent(tagName) + '/' + pg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
</script>

<svelte:head>
  <title>{tagName} - 相关视频 - 必爱必爱</title>
  <meta name="description" content="{tagName}相关视频在线观看，高清完整版免费播放。" />
  <meta name="keywords" content="{tagName},{tagName}视频,{tagName}在线观看" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <div class="flex items-center gap-2">
      <a href="/" class="text-gray-600 text-lg">←</a>
      <h1 class="text-lg font-bold text-pink-500">TAG: {tagName}</h1>
    </div>
  </header>

  <main class="p-2 pb-20">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if videos.length === 0}
      <div class="text-center py-20 text-gray-400">
        <p>暂无 "{tagName}" 相关视频</p>
        <a href="/" class="text-pink-500 mt-4 inline-block">返回首页</a>
      </div>
    {:else}
      <div class="mb-3 text-sm text-gray-500">
        找到 {totalCount} 个 "{tagName}" 相关视频
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {#each videos as video (video.vod_id)}
          <VideoCard {video} />
        {/each}
      </div>

      {#if totalPages > 1}
        <Pagination {currentPage} {totalPages} {loading} onPageChange={handlePageChange} />
      {/if}
    {/if}
  </main>

  <NavBar />
</div>
