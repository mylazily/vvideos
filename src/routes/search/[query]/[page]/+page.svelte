<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import Pagination from '$components/Pagination.svelte';
  import type { Video } from '$lib/types';
  import { generateSearchSEO, generateBreadcrumbSchema, generateItemListSchema, SITE_URL } from '$lib/seo';

  let videos = $state<Video[]>([]);
  let loading = $state(false);
  let hasSearched = $state(false);
  let currentPage = $state(1);
  let totalPages = $state(1);
  let totalCount = $state(0);
  let initialized = $state(false);

  let searchQuery = $derived(decodeURIComponent($page.params.query || ''));
  let pageParam = $derived(parseInt($page.params.page || '1'));

  let seo = $derived(generateSearchSEO(searchQuery, currentPage, totalCount));

  // 面包屑结构化数据
  let breadcrumbSchema = $derived(generateBreadcrumbSchema([
    { name: '首页', url: SITE_URL },
    { name: '搜索', url: `${SITE_URL}/search` },
    { name: searchQuery, url: `${SITE_URL}/search/${encodeURIComponent(searchQuery)}` }
  ]));

  // ItemList 结构化数据
  let itemListSchema = $derived(videos.length > 0 ? generateItemListSchema(
    videos.map((v, i) => ({
      name: v.title,
      url: `/v/${v.vod_id}`,
      position: (currentPage - 1) * 24 + i + 1,
      image: v.cover
    })),
    `${searchQuery}相关视频`
  ) : null);

  // 监听 URL 参数变化
  $effect(() => {
    const query = decodeURIComponent($page.params.query || '');
    const pg = parseInt($page.params.page || '1') || 1;

    if (initialized && query) {
      doSearch(query, pg);
    }
  });

  onMount(() => {
    if (searchQuery) {
      doSearch(searchQuery, pageParam || 1);
    }
    initialized = true;
  });

  async function doSearch(query: string, pg: number) {
    if (!query.trim()) return;

    loading = true;
    videos = [];
    hasSearched = true;
    currentPage = pg;

    try {
      const res = await fetch(
        '/api/search?q=' + encodeURIComponent(query.trim()) + '&page=' + pg + '&limit=24',
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

  function handleSearch() {
    if (searchQuery.trim()) {
      goto('/search/' + encodeURIComponent(searchQuery.trim()) + '/1');
    }
  }

  // 搜索防抖（300ms）
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function debouncedSearch(value: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (value.trim()) {
        goto('/search/' + encodeURIComponent(value.trim()) + '/1', { replaceState: true });
      }
    }, 300);
  }

  function handlePageChange(pg: number) {
    goto('/search/' + encodeURIComponent(searchQuery.trim()) + '/' + pg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
</script>

<svelte:head>
  <title>{seo.title}</title>
  <meta name="description" content={seo.description} />
  <meta name="keywords" content={seo.keywords} />
  <meta name="robots" content="noindex, follow" />
  <link rel="canonical" href="{SITE_URL}/search/{encodeURIComponent(searchQuery)}" />
  <meta property="og:title" content={seo.title} />
  <meta property="og:description" content={seo.description} />
  <meta property="og:type" content="website" />
  {#if currentPage > 1}
    <link rel="prev" href="{SITE_URL}/search/{encodeURIComponent(searchQuery)}/{currentPage - 1}" />
  {/if}
  {#if currentPage < totalPages}
    <link rel="next" href="{SITE_URL}/search/{encodeURIComponent(searchQuery)}/{currentPage + 1}" />
  {/if}
  <!-- 结构化数据 -->
  {@html `<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`}
  {#if itemListSchema}
    {@html `<script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>`}
  {/if}
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <div class="flex items-center gap-2">
      <a href="/" class="text-gray-600 text-lg">←</a>
      <div class="flex-1 flex items-center h-9 px-3 bg-gray-100 rounded-lg">
        <input
          value={searchQuery}
          onkeydown={(e) => e.key === 'Enter' && handleSearch()}
          oninput={(e) => debouncedSearch(e.currentTarget.value)}
          type="text"
          placeholder="搜索影片"
          class="flex-1 bg-transparent text-sm outline-none"
        />
        {#if searchQuery}
          <button onclick={() => goto('/search/ /1')} class="text-gray-400 mr-2">×</button>
        {/if}
        <button onclick={handleSearch} class="text-pink-500 text-sm">搜索</button>
      </div>
    </div>
  </header>

  <!-- 面包屑导航 -->
  {#if searchQuery}
    <nav class="bg-white px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
      <ol class="flex items-center gap-1 flex-wrap">
        <li><a href="/" class="hover:text-pink-500">首页</a></li>
        <li class="text-gray-300">/</li>
        <li><a href="/search" class="hover:text-pink-500">搜索</a></li>
        <li class="text-gray-300">/</li>
        <li class="text-gray-700">{searchQuery}</li>
      </ol>
    </nav>
  {/if}

  <main class="p-2 pb-20">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if hasSearched && videos.length === 0}
      <div class="text-center py-20 text-gray-400">
        <p>未找到 "{searchQuery}" 相关结果</p>
        <a href="/" class="text-pink-500 mt-4 inline-block">返回首页</a>
      </div>
    {:else if videos.length > 0}
      <div class="mb-3 text-sm text-gray-500">
        找到 {totalCount} 个 "{searchQuery}" 相关结果
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {#each videos as video (video.vod_id)}
          <VideoCard {video} />
        {/each}
      </div>

      {#if totalPages > 1}
        <Pagination {currentPage} {totalPages} {loading} onPageChange={handlePageChange} />
      {/if}
    {:else}
      <div class="text-center py-20 text-gray-400">输入关键词搜索影片</div>
    {/if}
  </main>

  <NavBar />
</div>
