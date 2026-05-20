<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import Pagination from '$components/Pagination.svelte';
  import type { Video } from '$lib/types';
  import { canonicalUrl, generateBreadcrumbSchema, generateItemListSchema, generateCollectionPageSchema } from '$lib/seo';

  let videos = $state<Video[]>([]);
  let loading = $state(true);
  let currentPage = $state(1);
  let totalPages = $state(1);
  let totalCount = $state(0);

  // 解析 filters: "电影_美国_2024" 或 "动作片_2024" 等
  let filtersRaw = $derived(decodeURIComponent($page.params.filters || ''));
  let pageParam = $derived(parseInt($page.params.page || '1'));

  // 解析为结构化筛选条件
  let filters = $derived(() => {
    const parts = filtersRaw.split('_').filter(Boolean);
    const result: { area?: string; year?: string; category?: string; actor?: string } = {};
    for (const p of parts) {
      if (/^\d{4}$/.test(p)) result.year = p;
      else if (['中国大陆', '中国香港', '中国台湾', '美国', '韩国', '日本', '泰国', '印度', '英国', '法国', '德国', '加拿大', '澳大利亚', '其他'].includes(p)) result.area = p;
      else result.category = p;
    }
    return result;
  });

  let pageTitle = $derived(() => {
    const f = filters();
    const parts: string[] = [];
    if (f.year) parts.push(f.year + '年');
    if (f.area) parts.push(f.area);
    if (f.category) parts.push(f.category);
    return parts.join('') || '影视';
  });

  let seoTitle = $derived(() => {
    const t = pageTitle();
    const pg = pageParam > 1 ? ` 第${pageParam}页` : '';
    return `${t}大全_最新${t}在线观看${pg} - 必爱必爱`;
  });

  let seoDesc = $derived(() => {
    const t = pageTitle();
    return `最新${t}在线观看，高清完整版免费播放。${t}推荐、排行榜、热门${t}，每日更新，支持手机在线观看。`;
  });

  onMount(() => {
    loadCross(pageParam || 1);
  });

  async function loadCross(pg: number) {
    loading = true;
    videos = [];
    currentPage = pg;

    const f = filters();
    const params = new URLSearchParams();
    if (f.area) params.set('area', f.area);
    if (f.year) params.set('year', f.year);
    if (f.category) params.set('category', f.category);
    if (f.actor) params.set('actor', f.actor);
    params.set('page', String(pg));
    params.set('limit', '24');

    try {
      const res = await fetch('/api/cross?' + params.toString(), {
        signal: AbortSignal.timeout(10000)
      });
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
    goto('/cross/' + encodeURIComponent(filtersRaw) + '/' + pg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 生成相关交叉链接（内链织网）
  let relatedLinks = $derived(() => {
    const f = filters();
    const links: { label: string; url: string }[] = [];
    const areas = ['中国大陆', '美国', '韩国', '日本', '中国香港'];
    const years = ['2026', '2025', '2024', '2023'];
    const cats = ['电影', '电视剧', '综艺', '动漫'];

    // 生成相关交叉链接
    for (const a of areas) {
      if (a !== f.area) {
        const parts = [f.category, a, f.year].filter(Boolean);
        links.push({ label: a + (f.category ? f.category : ''), url: '/cross/' + parts.join('_') + '/1' });
      }
    }
    for (const y of years) {
      if (y !== f.year) {
        const parts = [f.category, f.area, y].filter(Boolean);
        links.push({ label: y + '年' + (f.category || ''), url: '/cross/' + parts.join('_') + '/1' });
      }
    }
    for (const c of cats) {
      if (c !== f.category) {
        const parts = [c, f.area, f.year].filter(Boolean);
        links.push({ label: c + (f.area ? f.area : ''), url: '/cross/' + parts.join('_') + '/1' });
      }
    }
    return links.slice(0, 20);
  });
</script>

<svelte:head>
  <title>{seoTitle()}</title>
  <meta name="description" content={seoDesc()} />
  <meta name="keywords" content="{pageTitle()},{pageTitle()}在线观看,最新{pageTitle()},{pageTitle()}推荐,免费{pageTitle()},高清{pageTitle()}" />
  <link rel="canonical" href={canonicalUrl('/cross/' + encodeURIComponent(filtersRaw))} />
  <meta property="og:title" content={seoTitle()} />
  <meta property="og:description" content={seoDesc()} />
  <meta property="og:type" content="website" />

  <!-- 结构化数据：面包屑 -->
  {@html `<script type="application/ld+json">${JSON.stringify(generateBreadcrumbSchema([
    { name: '首页', url: 'https://evideos.pages.dev/' },
    { name: pageTitle(), url: 'https://evideos.pages.dev/cross/' + encodeURIComponent(filtersRaw) + '/1' }
  ]))}</script>`}

  <!-- 结构化数据：CollectionPage -->
  {@html `<script type="application/ld+json">${JSON.stringify(generateCollectionPageSchema(
    pageTitle() + '大全',
    seoDesc(),
    '/cross/' + encodeURIComponent(filtersRaw) + '/1'
  ))}</script>`}

  <!-- 结构化数据：ItemList（内链织网） -->
  {@html `<script type="application/ld+json">${JSON.stringify(generateItemListSchema(
    videos.slice(0, 10).map(v => ({ name: v.title, url: '/v/' + v.vod_id, image: v.cover })),
    pageTitle() + '在线观看'
  ))}</script>`}
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <div class="flex items-center gap-2">
      <a href="/" class="text-gray-600 text-lg">←</a>
      <h1 class="text-lg font-bold text-pink-500 truncate flex-1">{pageTitle()}大全</h1>
    </div>
  </header>

  <main class="p-2 pb-16">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if videos.length === 0}
      <div class="text-center py-20 text-gray-400">
        <p>暂无相关视频</p>
        <a href="/" class="text-pink-500 mt-4 inline-block">返回首页</a>
      </div>
    {:else}
      <!-- 顶部SEO文本块（蜘蛛吞噬区） -->
      <div class="bg-white p-3 mb-2 rounded-lg">
        <h2 class="text-base font-bold text-gray-800 mb-1">{pageTitle()}在线观看</h2>
        <p class="text-sm text-gray-600 leading-relaxed">
          必爱必爱为您提供最新的{pageTitle()}在线观看服务，高清完整版免费播放。
          {#if filters().area}精选{filters().area}地区{/if}
          {#if filters().year}{filters().year}年出品{/if}
          {#if filters().category}优质{filters().category}{/if}，
          每日更新，支持手机在线观看。以下是为您推荐的{totalCount}部{pageTitle()}。
        </p>
      </div>

      <div class="mb-3 text-sm text-gray-500">
        共找到 {totalCount} 部{pageTitle()}
      </div>

      <!-- 视频列表 -->
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {#each videos as video (video.vod_id)}
          <VideoCard {video} />
        {/each}
      </div>

      {#if totalPages > 1}
        <Pagination currentPage={currentPage} totalPages={totalPages} loading={loading} onPageChange={handlePageChange} />
      {/if}

      <!-- 内链织网区块（蜘蛛迷宫） -->
      {#if relatedLinks().length > 0}
        <div class="mt-6 bg-white p-3 rounded-lg">
          <h3 class="text-sm font-medium text-gray-800 mb-2">相关分类</h3>
          <div class="flex flex-wrap gap-2">
            {#each relatedLinks() as link}
              <a href={link.url} class="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors">
                {link.label}
              </a>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 底部SEO文本块 -->
      <div class="mt-4 bg-white p-3 rounded-lg">
        <p class="text-xs text-gray-500 leading-relaxed">
          {pageTitle()}相关搜索：{pageTitle()}免费观看、{pageTitle()}高清在线、{pageTitle()}完整版、
          {pageTitle()}手机观看、最新{pageTitle()}推荐、{pageTitle()}排行榜、
          {pageTitle()}剧情介绍、{pageTitle()}演员表、{pageTitle()}大结局。
          必爱必爱是一个专业的在线视频播放平台，提供{pageTitle()}等丰富内容，
          所有视频均支持高清播放，无需下载，打开即看。
        </p>
      </div>
    {/if}
  </main>

  <NavBar />
</div>
