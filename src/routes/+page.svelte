<script lang="ts">
  import { onMount } from 'svelte';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import type { PageData } from './$types';
  import { generateHomeSEO, generateOrganizationSchema, SITE_NAME, SITE_URL } from '$lib/seo';
  import { nativeFetch, lazyLoadImages, requestPool } from '$lib/native-utils';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // 视频数据
  let videos = $state<any[]>([]);
  let categories = $state<any[]>([]);
  let loading = $state(true);
  let searchKeyword = $state('');

  let seo = $derived(generateHomeSEO());

  // SEO 结构化数据
  const orgSchema = generateOrganizationSchema();

  // 客户端加载数据 - 使用原生工具
  onMount(() => {
    loadHomeData();
  });

  async function loadHomeData() {
    loading = true;
    try {
      // 使用原生 fetch 封装，带缓存和请求池控制
      const [homeRes, categoriesRes] = await Promise.all([
        requestPool.add(() => nativeFetch('/api/home', { cache: true, cacheTTL: 300000 })),
        requestPool.add(() => nativeFetch('/api/categories', { cache: true, cacheTTL: 600000 }))
      ]);

      if (homeRes.success) {
        videos = homeRes.data.videos || [];
      }
      if (categoriesRes.success) {
        categories = categoriesRes.data.slice(0, 10);
      }
      
      // 延迟执行图片懒加载
      setTimeout(() => lazyLoadImages(), 100);
    } catch (e) {
      console.error('Failed to load home data:', e);
    } finally {
      loading = false;
    }
  }

  function handleSearch() {
    if (searchKeyword.trim()) {
      window.location.href = '/search/' + encodeURIComponent(searchKeyword.trim()) + '/1';
    }
  }
</script>

<svelte:head>
  <title>{seo.title}</title>
  <meta name="description" content={seo.description} />
  <meta name="keywords" content={seo.keywords} />
  <link rel="canonical" href={SITE_URL} />
  <meta property="og:title" content={seo.title} />
  <meta property="og:description" content={seo.description} />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="{SITE_URL}/icon-512.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <!-- 结构化数据 -->
  {@html `<script type="application/ld+json">${JSON.stringify(orgSchema)}</script>`}
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <div class="flex items-center gap-2">
      <h1 class="text-lg font-bold text-pink-500">{SITE_NAME}</h1>
      <div class="flex-1 flex items-center h-9 px-3 bg-gray-100 rounded-lg ml-2">
        <svg class="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          bind:value={searchKeyword}
          onkeydown={(e) => e.key === 'Enter' && handleSearch()}
          type="text"
          placeholder="搜索影片"
          class="flex-1 bg-transparent text-sm outline-none"
        />
        <button onclick={handleSearch} class="text-pink-500 text-sm">搜索</button>
      </div>
    </div>
  </header>

  <main class="pb-16">
    <!-- 分类快捷入口 -->
    {#if categories.length > 0}
      <section class="bg-white mt-2">
        <div class="flex gap-2 px-3 py-3 overflow-x-auto scrollbar-hide">
          {#each categories as cat}
            <a
              href="/category/{encodeURIComponent(cat.name)}/1"
              class="flex-shrink-0 px-4 py-2 bg-gray-100 text-sm text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
            >
              {cat.name}
              <span class="text-xs text-gray-400 ml-1">{cat.count}</span>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    <!-- 热门推荐 -->
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if videos.length > 0}
      <section class="mt-2">
        <div class="bg-white px-3 py-2 border-b border-gray-100">
          <h2 class="text-sm font-medium text-gray-800">最新更新</h2>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-2">
          {#each videos as video, i (video.vod_id)}
            <!-- 首屏前4个图片 eager loading，之后 lazy -->
            <VideoCard {video} loading={i < 4 ? 'eager' : 'lazy'} />
          {/each}
        </div>
      </section>
    {:else}
      <div class="text-center py-20 text-gray-400">暂无内容</div>
    {/if}

    <!-- 快捷入口 -->
    <section class="mt-2 bg-white">
      <div class="grid grid-cols-4 gap-4 p-4">
        <a href="/rank" class="flex flex-col items-center gap-1">
          <div class="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 text-xl">🔥</div>
          <span class="text-xs text-gray-600">排行榜</span>
        </a>
        <a href="/discover" class="flex flex-col items-center gap-1">
          <div class="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 text-xl">🔍</div>
          <span class="text-xs text-gray-600">发现</span>
        </a>
        <a href="/favorite" class="flex flex-col items-center gap-1">
          <div class="w-12 h-12 bg-yellow-50 rounded-full flex items-center justify-center text-yellow-500 text-xl">❤️</div>
          <span class="text-xs text-gray-600">收藏</span>
        </a>
        <a href="/history" class="flex flex-col items-center gap-1">
          <div class="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center text-green-500 text-xl">📜</div>
          <span class="text-xs text-gray-600">历史</span>
        </a>
      </div>
    </section>
  </main>

  <NavBar />
</div>
