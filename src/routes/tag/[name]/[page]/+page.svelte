<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import Pagination from '$components/Pagination.svelte';
  import type { Video } from '$lib/types';
  import { generateTagSEO, generateItemListSchema, generateBreadcrumbSchema, SITE_URL } from '$lib/seo';

  let videos = $state<Video[]>([]);
  let loading = $state(true);
  let currentPage = $state(1);
  let totalPages = $state(1);
  let totalCount = $state(0);
  let initialized = $state(false);

  let tagName = $derived(decodeURIComponent($page.params.name || ''));
  let pageParam = $derived(parseInt($page.params.page || '1'));

  let seo = $derived(generateTagSEO(tagName, currentPage, totalCount));

  // 面包屑结构化数据
  let breadcrumbSchema = $derived(generateBreadcrumbSchema([
    { name: '首页', url: SITE_URL },
    { name: '发现', url: `${SITE_URL}/discover` },
    { name: tagName, url: `${SITE_URL}/tag/${encodeURIComponent(tagName)}` }
  ]));

  // ItemList 结构化数据
  let itemListSchema = $derived(videos.length > 0 ? generateItemListSchema(
    videos.map((v, i) => ({
      name: v.title,
      url: `/v/${v.vod_id}`,
      position: (currentPage - 1) * 24 + i + 1,
      image: v.cover
    })),
    `${tagName}相关视频`
  ) : null);

  // 监听 URL 参数变化
  $effect(() => {
    const name = decodeURIComponent($page.params.name || '');
    const pg = parseInt($page.params.page || '1') || 1;

    if (initialized && name) {
      loadTagVideos(pg);
    }
  });

  onMount(() => {
    if (tagName) {
      loadTagVideos(pageParam || 1);
    }
    initialized = true;
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
  <title>{seo.title}</title>
  <meta name="description" content={seo.description} />
  <meta name="keywords" content={seo.keywords} />
  <link rel="canonical" href="https://evideos.pages.dev/tag/{encodeURIComponent(tagName)}" />
  <meta property="og:title" content={seo.title} />
  <meta property="og:description" content={seo.description} />
  <meta property="og:type" content="website" />
  {#if currentPage > 1}
    <link rel="prev" href="https://evideos.pages.dev/tag/{encodeURIComponent(tagName)}/{currentPage - 1}" />
  {/if}
  {#if currentPage < totalPages}
    <link rel="next" href="https://evideos.pages.dev/tag/{encodeURIComponent(tagName)}/{currentPage + 1}" />
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
      <a href="/discover" class="text-gray-600 text-lg">←</a>
      <h1 class="text-lg font-bold text-pink-500 truncate flex-1">
        {tagName}
        {#if totalCount > 0}
          <span class="text-sm font-normal text-gray-400 ml-1">{totalCount}部</span>
        {/if}
      </h1>
    </div>
  </header>

  <!-- 面包屑导航 -->
  <nav class="bg-white px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
    <ol class="flex items-center gap-1 flex-wrap">
      <li><a href="/" class="hover:text-pink-500">首页</a></li>
      <li class="text-gray-300">/</li>
      <li><a href="/discover" class="hover:text-pink-500">发现</a></li>
      <li class="text-gray-300">/</li>
      <li class="text-gray-700">{tagName}</li>
    </ol>
  </nav>

  <main class="p-2 pb-20">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if videos.length === 0}
      <div class="text-center py-20 text-gray-400">
        <p>暂无 "{tagName}" 相关视频</p>
        <a href="/discover" class="text-pink-500 mt-4 inline-block">返回发现</a>
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
