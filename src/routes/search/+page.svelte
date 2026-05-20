<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import Pagination from '$components/Pagination.svelte';
  import type { Video } from '$lib/types';

  let videos: Video[] = [];
  let loading = false;
  let keyword = '';
  let hasSearched = false;
  let currentPage = 1;
  let totalPages = 1;

  $: searchQuery = $page.url.searchParams.get('q') || '';

  onMount(() => {
    if (searchQuery) {
      keyword = searchQuery;
      doSearch(1);
    }
  });

  async function doSearch(page: number) {
    if (!keyword.trim()) return;

    loading = true;
    videos = [];
    hasSearched = true;
    currentPage = page;

    try {
      const res = await fetch(
        '/api/search?q=' + encodeURIComponent(keyword.trim()) + '&page=' + page + '&limit=24',
        { signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const data = await res.json();
        videos = data.data?.videos || [];
        totalPages = data.data?.pagination?.totalPages || 1;
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  function handleSearch() {
    if (keyword.trim()) {
      goto('/search?q=' + encodeURIComponent(keyword.trim()), { replaceState: true });
      doSearch(1);
    }
  }

  function handlePageChange(page: number) {
    doSearch(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }


</script>

<svelte:head>
  <title>{keyword ? `${keyword}的搜索结果 - 必爱必爱` : '搜索 - 必爱必爱'}</title>
  <meta name="description" content={keyword ? `搜索"${keyword}"的相关视频结果` : '搜索影片'} />
  <meta name="robots" content="noindex, follow" />
  <link rel="canonical" href="https://vvideos.pages.dev/search" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <div class="flex items-center gap-2">
      <a href="/" class="text-gray-600 text-lg">←</a>
      <div class="flex-1 flex items-center h-9 px-3 bg-gray-100 rounded-lg">
        <input
          bind:value={keyword}
          onkeydown={(e) => e.key === 'Enter' && handleSearch()}
          type="text"
          placeholder="搜索影片"
          class="flex-1 bg-transparent text-sm outline-none"
        />
        {#if keyword}
          <button onclick={() => { keyword = ''; }} class="text-gray-400 mr-2">×</button>
        {/if}
        <button onclick={handleSearch} class="text-pink-500 text-sm">搜索</button>
      </div>
    </div>
  </header>

  <main class="p-2 pb-20">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if hasSearched && videos.length === 0}
      <div class="text-center py-20 text-gray-400">未找到相关结果</div>
    {:else if videos.length > 0}
      <div class="mb-3 text-sm text-gray-500">搜索结果</div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {#each videos as video (video.vod_id)}
          <VideoCard {video} />
        {/each}
      </div>

      {#if totalPages > 1}
        <Pagination
          {currentPage}
          {totalPages}
          {loading}
          onPageChange={handlePageChange}
        />
      {/if}
    {:else}
      <div class="text-center py-20 text-gray-400">输入关键词搜索影片</div>
    {/if}
  </main>

  <NavBar />
</div>
