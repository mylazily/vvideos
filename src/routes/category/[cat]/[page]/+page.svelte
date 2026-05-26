<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import Pagination from '$components/Pagination.svelte';
  import type { Video } from '$lib/types';
  import { generateCategorySEO, canonicalUrl, generateBreadcrumbSchema } from '$lib/seo';

  interface SourceCategory {
    id: number;
    name: string;
    alias: string;
    display_name: string;
    categories: string[];
  }

  let sources = $state<SourceCategory[]>([]);
  let categories = $state<string[]>([]);
  let activeCategory = $state('全部');
  let activeSource = $state<number | null>(null);
  let videos = $state<Video[]>([]);
  let loading = $state(true);
  let categoriesLoading = $state(true);
  let currentPage = $state(1);
  let totalPages = $state(1);
  let initialized = $state(false);

  let seo = $derived(generateCategorySEO(activeCategory, currentPage));

  // 监听 URL 参数变化
  $effect(() => {
    const cat = decodeURIComponent($page.params.cat || '全部');
    const pg = parseInt($page.params.page || '1') || 1;

    if (initialized) {
      // URL 变化时重新加载
      loadVideos(cat, pg);
    }
  });

  onMount(async () => {
    await loadCategories();
    initialized = true;
  });

  async function loadCategories() {
    categoriesLoading = true;
    try {
      const res = await fetch('/api/categories', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        categories = data.data || [];
        sources = data.sources || [];
        // 首次加载
        const cat = decodeURIComponent($page.params.cat || '全部');
        const pg = parseInt($page.params.page || '1') || 1;
        await loadVideos(cat, pg);
      }
    } catch {
      categories = [];
      sources = [];
    } finally {
      categoriesLoading = false;
    }
  }

  async function loadVideos(category: string, pg: number) {
    loading = true;
    videos = [];
    activeCategory = category;
    currentPage = pg;

    try {
      let url = '/api/videos?page=' + pg + '&limit=24';
      if (category !== '全部') {
        url += '&category=' + encodeURIComponent(category);
      }
      if (activeSource) {
        url += '&source_id=' + activeSource;
      }
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
    goto('/category/' + encodeURIComponent(cat) + '/1');
  }

  function switchSource(sourceId: number | null) {
    activeSource = sourceId;
    // 切换资源站时重新加载当前分类的视频
    loadVideos(activeCategory, 1);
    // 更新URL
    goto('/category/' + encodeURIComponent(activeCategory) + '/1');
  }
</script>

<svelte:head>
  <title>{seo.title}</title>
  <meta name="description" content={seo.description} />
  <meta name="keywords" content={seo.keywords} />
  <link rel="canonical" href={canonicalUrl('/category/' + encodeURIComponent(activeCategory))} />
  <meta property="og:title" content={seo.title} />
  <meta property="og:description" content={seo.description} />
  <meta property="og:type" content="website" />
  {#if currentPage > 1}
    <link rel="prev" href="https://evideos.pages.dev/category/{encodeURIComponent(activeCategory)}/{currentPage - 1}" />
  {/if}
  {#if currentPage < totalPages}
    <link rel="next" href="https://evideos.pages.dev/category/{encodeURIComponent(activeCategory)}/{currentPage + 1}" />
  {/if}
  {@html `<script type="application/ld+json">${JSON.stringify(generateBreadcrumbSchema([{name: '首页', url: 'https://evideos.pages.dev/'}, {name: '分类', url: 'https://evideos.pages.dev/category'}, {name: activeCategory, url: `https://evideos.pages.dev/category/${encodeURIComponent(activeCategory)}/1`}]))}</script>`}
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <h1 class="text-lg font-bold text-pink-500">{activeCategory} - 在线观看</h1>
  </header>

  <!-- 资源站选择器 -->
  {#if sources.length > 0}
    <div class="sticky top-11 z-40 bg-white border-b border-gray-100">
      <div class="flex items-center gap-2 px-3 h-11 overflow-x-auto no-scrollbar">
        <button
          onclick={() => switchSource(null)}
          class="flex-shrink-0 px-4 py-1.5 text-sm rounded-full transition-all {activeSource === null
            ? 'bg-blue-500 text-white'
            : 'text-gray-600 bg-gray-100'}"
        >
          全部资源
        </button>
        {#each sources as source}
          <button
            onclick={() => switchSource(source.id)}
            class="flex-shrink-0 px-4 py-1.5 text-sm rounded-full transition-all {activeSource === source.id
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 bg-gray-100'}"
            title={source.name}
          >
            {source.alias || source.name}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- 分类选择器 -->
  <div class="sticky {sources.length > 0 ? 'top-22' : 'top-11'} z-40 bg-white border-b border-gray-100">
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
        {#if activeSource}
          <!-- 显示当前选中资源站的分类 -->
          {#each sources.find(s => s.id === activeSource)?.categories || [] as cat}
            <button
              onclick={() => switchCategory(cat)}
              class="flex-shrink-0 px-4 py-1.5 text-sm rounded-full transition-all {activeCategory === cat
                ? 'bg-pink-500 text-white'
                : 'text-gray-600 bg-gray-100'}"
            >
              {cat}
            </button>
          {/each}
        {:else}
          <!-- 显示所有分类 -->
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
        {/if}
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
        <Pagination {currentPage} {totalPages} />
      {/if}
    {/if}
  </main>

  <NavBar />
</div>
