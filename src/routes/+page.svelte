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
  import { nativeFetch, requestPool } from '$lib/native-utils';

  let videos = $state<any[]>([]);
  let loading = $state(true);
  let searchKeyword = $state('');

  let seo = $derived(generateHomeSEO());
  const orgSchema = generateOrganizationSchema();
  const webSiteSchema = generateWebSiteSchema();
  const homeFaqs = generateHomeFAQ();

  onMount(() => {
    loadVideos();
  });

  async function loadVideos() {
    loading = true;
    try {
      const res = await requestPool.add(() => 
        nativeFetch('/api/home', { cache: true, cacheTTL: 300000 })
      );
      if (res.success) {
        videos = (res.data.videos || []).slice(0, 24);
      }
    } catch (e) {
      console.error('Failed to load videos:', e);
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
  {@html `<script type="application/ld+json">${JSON.stringify(generateFAQSchema(homeFaqs))}</script>`}
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- 搜索框 -->
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

  <!-- 24个视频 -->
  <main class="pb-16">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if videos.length > 0}
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-2">
        {#each videos as video, i (video.vod_id)}
          <VideoCard {video} loading={i < 4 ? 'eager' : 'lazy'} />
        {/each}
      </div>
    {:else}
      <div class="text-center py-20 text-gray-400">暂无内容</div>
    {/if}
  </main>

  <!-- 常见问题（SEO + 用户体验） -->
  {#if !loading && videos.length > 0}
    <section class="px-4 py-6 bg-white mt-4">
      <h2 class="text-base font-bold text-gray-800 mb-4">常见问题</h2>
      <div class="space-y-3">
        {#each homeFaqs as faq}
          <details class="group">
            <summary class="text-sm font-medium cursor-pointer text-gray-700 list-none flex items-center justify-between">
              {faq.question}
              <svg class="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </summary>
            <p class="mt-2 text-sm text-gray-500">{faq.answer}</p>
          </details>
        {/each}
      </div>
    </section>

    <!-- 底部SEO文本 -->
    <section class="px-4 py-4 bg-gray-50">
      <p class="text-xs text-gray-400 leading-relaxed text-center">
        {SITE_NAME} - 免费在线视频播放平台，提供最新电影、电视剧、综艺、动漫、短剧等高清内容。
        支持手机电脑观看，无需注册，打开即看。
      </p>
    </section>
  {/if}

  <!-- 底部导航栏 -->
  <NavBar />
</div>
