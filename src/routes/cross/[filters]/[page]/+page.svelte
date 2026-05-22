<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import Pagination from '$components/Pagination.svelte';
  import type { Video } from '$lib/types';
  import {
    canonicalUrl,
    generateBreadcrumbSchema,
    generateItemListSchema,
    generateCollectionPageSchema,
    generateCrossSEO,
    generateCrossFAQ,
    generateFAQSchema,
    SITE_URL
  } from '$lib/seo';

  let videos = $state<Video[]>([]);
  let loading = $state(true);
  let currentPage = $state(1);
  let totalPages = $state(1);
  let totalCount = $state(0);
  let initialized = $state(false);

  // 动态分类和地区数据（从资源站获取）
  let dynamicCategories = $state<string[]>([]);
  let dynamicAreas = $state<string[]>([]);

  // 解析 filters: "电影_美国_2024" 等
  let filtersRaw = $derived(decodeURIComponent($page.params.filters || ''));
  let pageParam = $derived(parseInt($page.params.page || '1'));

  // 解析为结构化筛选条件
  let filters = $derived(() => {
    const parts = filtersRaw.split('_').filter(Boolean);
    const result: { area?: string; year?: string; category?: string; actor?: string } = {};
    for (const p of parts) {
      if (/^\d{4}$/.test(p)) result.year = p;
      else if (dynamicAreas.includes(p)) result.area = p;
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

  // 使用统一的 SEO 函数
  let seo = $derived(generateCrossSEO(filters(), pageParam, totalCount));
  let faqs = $derived(generateCrossFAQ(filters(), totalCount));

  // 监听 URL 参数变化
  $effect(() => {
    const pg = parseInt($page.params.page || '1') || 1;
    if (initialized) loadCross(pg);
  });

  onMount(() => {
    // 先加载动态分类和地区
    loadDynamicFilters().then(() => {
      loadCross(pageParam || 1);
      initialized = true;
    });
  });

  async function loadDynamicFilters() {
    try {
      const res = await fetch('/api/filters', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        dynamicCategories = data.data?.categories || [];
        dynamicAreas = data.data?.areas || [];
      }
    } catch (e) {
      console.error('加载筛选条件失败:', e);
    }
  }

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
      const res = await fetch('/api/cross?' + params.toString(), { signal: AbortSignal.timeout(8000) });
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

  // 内链织网：生成大量相关交叉链接（蜘蛛迷宫）- 使用动态数据
  let relatedLinks = $derived(() => {
    const f = filters();
    const links: { label: string; url: string }[] = [];
    
    // 使用从资源站获取的动态数据
    const areas = dynamicAreas.length > 0 ? dynamicAreas : [];
    const years = ['2026', '2025', '2024', '2023', '2022'];
    const cats = dynamicCategories.length > 0 ? dynamicCategories : [];

    // 地区×分类 交叉
    for (const a of areas) {
      if (a !== f.area) {
        const parts = [f.category, a, f.year].filter(Boolean);
        if (parts.length > 0) {
          links.push({ label: a + (f.category || ''), url: '/cross/' + parts.join('_') + '/1' });
        }
      }
    }
    // 年份×分类 交叉
    for (const y of years) {
      if (y !== f.year) {
        const parts = [f.category, f.area, y].filter(Boolean);
        if (parts.length > 0) {
          links.push({ label: y + '年' + (f.category || ''), url: '/cross/' + parts.join('_') + '/1' });
        }
      }
    }
    // 分类×地区 交叉
    for (const c of cats) {
      if (c !== f.category) {
        const parts = [c, f.area, f.year].filter(Boolean);
        if (parts.length > 0) {
          links.push({ label: c + (f.area ? f.area : ''), url: '/cross/' + parts.join('_') + '/1' });
        }
      }
    }
    return links.slice(0, 30);
  });

  // 生成面包屑
  let breadcrumbs = $derived([
    { name: '首页', url: SITE_URL },
    { name: pageTitle(), url: SITE_URL + '/cross/' + encodeURIComponent(filtersRaw) + '/1' }
  ]);
</script>

<svelte:head>
  <title>{seo.title}</title>
  <meta name="description" content={seo.description} />
  <meta name="keywords" content={seo.keywords} />
  <link rel="canonical" href={canonicalUrl('/cross/' + encodeURIComponent(filtersRaw))} />

  <!-- Open Graph -->
  <meta property="og:title" content={seo.title} />
  <meta property="og:description" content={seo.description} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonicalUrl('/cross/' + encodeURIComponent(filtersRaw))} />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={seo.title} />
  <meta name="twitter:description" content={seo.description} />

  <!-- 结构化数据 -->
  {@html `<script type="application/ld+json">${JSON.stringify(generateBreadcrumbSchema(breadcrumbs))}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(generateCollectionPageSchema(pageTitle() + '大全', seo.description, '/cross/' + encodeURIComponent(filtersRaw) + '/1'))}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(generateItemListSchema(videos.slice(0, 10).map(v => ({ name: v.title, url: '/v/' + v.vod_id, image: v.cover })), pageTitle() + '在线观看'))}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(generateFAQSchema(faqs))}</script>`}

  {#if pageParam > 1}
    <link rel="prev" href="https://evideos.pages.dev/cross/{encodeURIComponent(filtersRaw)}/{pageParam - 1}" />
  {/if}
  <link rel="next" href="https://evideos.pages.dev/cross/{encodeURIComponent(filtersRaw)}/{pageParam + 1}" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-3 py-2 z-50">
    <div class="flex items-center gap-2">
      <a href="/" class="text-gray-600 text-lg" aria-label="返回首页">←</a>
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
      <!-- 顶部SEO文本块 -->
      <section class="bg-white p-3 mb-2 rounded-lg">
        <h2 class="text-base font-bold text-gray-800 mb-1">{pageTitle()}在线观看</h2>
        <p class="text-sm text-gray-600 leading-relaxed">
          必爱必爱为您提供最新的{pageTitle()}在线观看服务，高清完整版免费播放。
          {#if filters().area}精选{filters().area}地区{/if}
          {#if filters().year}{filters().year}年出品{/if}
          {#if filters().category}优质{filters().category}{/if}，
          每日更新，支持手机在线观看。以下是为您推荐的{totalCount}部{pageTitle()}。
        </p>
      </section>

      <div class="mb-3 text-sm text-gray-500">
        共找到 <strong>{totalCount}</strong> 部{pageTitle()}
      </div>

      <!-- 视频列表（前4张eager加载优化LCP） -->
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {#each videos as video, i (video.vod_id)}
          <VideoCard {video} loading={i < 4 ? 'eager' : 'lazy'} />
        {/each}
      </div>

      {#if totalPages > 1}
        <Pagination {currentPage} {totalPages} {loading} onPageChange={handlePageChange} />
      {/if}

      <!-- FAQ 区块（SEO 富文本摘要） -->
      {#if faqs.length > 0}
        <section class="mt-4 bg-white p-3 rounded-lg">
          <h3 class="text-sm font-medium text-gray-800 mb-2">常见问题</h3>
          <div class="space-y-3">
            {#each faqs as faq}
              <details class="group">
                <summary class="text-sm font-medium cursor-pointer text-gray-700 list-none flex items-center justify-between">
                  {faq.question}
                  <svg class="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </summary>
                <p class="mt-1 text-sm text-gray-500">{faq.answer}</p>
              </details>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 内链织网区块（蜘蛛迷宫 - 30个交叉链接） -->
      {#if relatedLinks().length > 0}
        <section class="mt-4 bg-white p-3 rounded-lg">
          <h3 class="text-sm font-medium text-gray-800 mb-2">探索更多分类</h3>
          <div class="flex flex-wrap gap-2">
            {#each relatedLinks() as link}
              <a href={link.url} class="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors">{link.label}</a>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 底部SEO文本块（长尾词覆盖） -->
      <section class="mt-4 bg-white p-3 rounded-lg">
        <p class="text-xs text-gray-500 leading-relaxed">
          {pageTitle()}相关搜索：{pageTitle()}免费观看、{pageTitle()}高清在线、{pageTitle()}完整版、
          {pageTitle()}手机观看、最新{pageTitle()}推荐、{pageTitle()}排行榜、
          {pageTitle()}剧情介绍、{pageTitle()}演员表、{pageTitle()}大结局、
          {pageTitle()}什么时候上映、{pageTitle()}好看吗、{pageTitle()}评分。
          必爱必爱是一个专业的在线视频播放平台，提供{pageTitle()}等丰富内容，
          所有视频均支持高清播放，无需下载，打开即看。
        </p>
      </section>
    {/if}
  </main>

  <NavBar />
</div>
