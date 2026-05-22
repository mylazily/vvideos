<script lang="ts">
  import { onMount } from 'svelte';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import {
    generateHomeSEO,
    generateOrganizationSchema,
    generateWebSiteSchema,
    generateFAQSchema,
    generateHomeFAQ,
    SITE_NAME,
    SITE_URL
  } from '$lib/seo';
  import { getLocaleFromPath, t, DEFAULT_LOCALE, LOCALE_FLAGS, LOCALE_NAMES, SUPPORTED_LOCALES, localeToUrl, type Locale } from '$lib/i18n';
  import { page } from '$app/stores';

  let videos = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let searchKeyword = $state('');
  let showLangMenu = $state(false);

  let locale = $state<Locale>(DEFAULT_LOCALE);
  $effect(() => { locale = getLocaleFromPath($page.url.pathname); });

  let seo = $derived(generateHomeSEO());
  const orgSchema = generateOrganizationSchema();
  const webSiteSchema = generateWebSiteSchema();
  const homeFAQSchema = generateFAQSchema(generateHomeFAQ());

  onMount(() => {
    loadVideos();
  });

  async function loadVideos() {
    loading = true;
    error = '';
    try {
      // 使用完整URL，避免Service Worker拦截问题
      const apiUrl = window.location.origin + '/api/home';
      console.log('[首页] 请求API:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      console.log('[首页] API响应状态:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const res = await response.json();
      console.log('[首页] API响应数据:', res);
      
      if (res.success) {
        videos = (res.data.videos || []).slice(0, 24);
        console.log('[首页] 加载视频数量:', videos.length);
      } else {
        throw new Error(res.message || '加载失败');
      }
    } catch (e: any) {
      console.error('[首页] 加载视频失败:', e);
      error = e.message || '加载失败';
    } finally {
      loading = false;
    }
  }

  function handleSearch() {
    if (searchKeyword.trim()) {
      window.location.href = '/search/' + encodeURIComponent(searchKeyword.trim()) + '/1';
    }
  }

  function switchLanguage(newLocale: Locale) {
    const pathname = window.location.pathname;
    const pathWithoutLocale = pathname.replace(/^\/(en|ko|ja|vi|th)/, '') || '/';
    const newPath = localeToUrl(newLocale, pathWithoutLocale);
    window.location.href = newPath;
  }
</script>

<svelte:window onclick={() => showLangMenu = false} />

<svelte:head>
  <title>{seo.title}</title>
  <meta name="description" content={seo.description} />
  <meta name="keywords" content={seo.keywords} />
  <link rel="canonical" href={SITE_URL} />
  <meta property="og:title" content={seo.title} />
  <meta property="og:description" content={seo.description} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={SITE_URL} />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={seo.title} />
  <meta name="twitter:description" content={seo.description} />
  {@html `<script type="application/ld+json">${JSON.stringify(webSiteSchema)}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(orgSchema)}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(homeFAQSchema)}</script>`}
  <meta property="og:image" content="https://evideos.pages.dev/icon.svg" />
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- 搜索框 + 语言切换 -->
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <div class="flex items-center gap-2">
      <!-- 语言切换器 - 放最左边 -->
      <div class="relative">
        <button
          onclick={(e) => { e.stopPropagation(); showLangMenu = !showLangMenu; }}
          class="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-600 hover:text-pink-500"
        >
          <span>{LOCALE_FLAGS[locale]}</span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {#if showLangMenu}
          <div class="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 min-w-[140px] z-50">
            {#each SUPPORTED_LOCALES as loc}
              <button
                onclick={() => switchLanguage(loc)}
                class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 {locale === loc ? 'text-pink-500 font-medium' : 'text-gray-700'}"
              >
                <span>{LOCALE_FLAGS[loc]}</span>
                <span>{LOCALE_NAMES[loc]}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- 搜索框 -->
      <div class="flex-1 flex items-center h-9 px-3 bg-gray-100 rounded-lg">
        <svg class="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          bind:value={searchKeyword}
          onkeydown={(e) => e.key === 'Enter' && handleSearch()}
          type="text"
          placeholder={t(locale, 'search_placeholder')}
          class="flex-1 bg-transparent text-sm outline-none"
        />
        <button onclick={handleSearch} class="text-pink-500 text-sm">{t(locale, 'search')}</button>
      </div>
    </div>
  </header>

  <!-- 24个视频 -->
  <main class="pb-16">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if error}
      <div class="text-center py-20">
        <p class="text-red-500 mb-4">{error}</p>
        <button onclick={loadVideos} class="px-4 py-2 bg-pink-500 text-white rounded-lg">重试</button>
      </div>
    {:else if videos.length > 0}
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-2">
        {#each videos as video, i (video.vod_id)}
          <VideoCard {video} loading={i < 4 ? 'eager' : 'lazy'} />
        {/each}
      </div>
    {:else}
      <div class="text-center py-20 text-gray-400">{t(locale, 'no_data')}</div>
    {/if}
  </main>

  <!-- 底部导航栏 -->
  <NavBar />
</div>
