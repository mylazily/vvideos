<script lang="ts">
  import { onMount } from 'svelte';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import Pagination from '$components/Pagination.svelte';
  import type { Video } from '$lib/types';
  import { generateCategorySEO, canonicalUrl, paginationLinks } from '$lib/seo';

  let categories: { name: string; count: number }[] = [];
  let activeCategory = '全部';
  let videos: Video[] = [];
  let loading = true;
  let categoriesLoading = true;
  let currentPage = 1;
  let totalPages = 1;

  onMount(async () => {
    await loadCategories();
  });

  async function loadCategories() {
    categoriesLoading = true;
    try {
      const res = await fetch('/api/categories', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        categories = data.data || [];
        loadVideos('全部', 1);
      }
    } catch {
      categories = [];
    } finally {
      categoriesLoading = false;
    }
  }

  async function loadVideos(category: string, page: number) {
    loading = true;
    videos = [];
    activeCategory = category;
    currentPage = page;

    try {
      const url =
        category === '全部'
          ? '/api/videos?page=' + page + '&limit=24'
          : '/api/videos?category=' + encodeURIComponent(category) + '&page=' + page + '&limit=24';
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        videos = data.data?.videos || [];
        totalPages = data.data?.pagination?.totalPages || 1;
      }
    } catch {
      // ignore
    } finally {
      loading = false;
    }
  }

  function switchCategory(cat: string) {
    loadVideos(cat, 1);
  }

  function handlePageChange(page: number) {
    loadVideos(activeCategory, page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $: seo = generateCategorySEO(activeCategory, currentPage);
  $: pl = paginationLinks('/category', currentPage, totalPages);

</script>

<svelte:head>
  <title>{seo.title}</title>
  <meta name="description" content={seo.description} />
  <meta name="keywords" content={seo.keywords} />
  <link rel="canonical" href={canonicalUrl('/category')} />
  <meta property="og:title" content={seo.title} />
  <meta property="og:description" content={seo.description} />
  <meta property="og:type" content="website" />
  {#if pl.prev}
    <link rel="prev" href={pl.prev} />
  {/if}
  {#if pl.next}
    <link rel="next" href={pl.next} />
  {/if}
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <h1 class="text-lg font-bold text-pink-500">分类</h1>
  </header>

  <div class="sticky top-11 z-40 bg-white border-b border-gray-100">
    <div class="flex items-center gap-2 px-3 h-11 overflow-x-auto no-scrollbar">
      {#if categoriesLoading}
        {#each Array(5) as _}
          <div class="flex-shrink-0 px-4 py-1.5 h-7 bg-gray-200 rounded-full animate-pulse"></div>
        {/each}
      {:else}
        <button
          onclick={() => switchCategory('全部')}
          class="flex-shrink-0 px-4 py-1.5 text-sm rounded-full transition-all {activeCategory === '全部'
            ? 'bg-pink-500 text-white'
            : 'text-gray-600 bg-gray-100'}"
        >
          全部
        </button>
        {#each categories as cat}
          <button
            onclick={() => switchCategory(cat.name)}
            class="flex-shrink-0 px-4 py-1.5 text-sm rounded-full transition-all {activeCategory === cat.name
              ? 'bg-pink-500 text-white'
              : 'text-gray-600 bg-gray-100'}"
          >
            {cat.name}
          </button>
        {/each}
      {/if}
    </div>
  </div>

  <main class="p-2 pb-20">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if videos.length === 0}
      <div class="text-center py-20 text-gray-400">暂无内容</div>
    {:else}
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
    {/if}
  </main>

  <NavBar />
</div>
