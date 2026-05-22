<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import type { Video } from '$lib/types';
  import {
    generateSEODescription,
    generateSEOKeywords,
    generatePageTitle,
    generateVideoSchema,
    generateBreadcrumbSchema,
    generateOrganizationSchema,
    generateWebPageSchema,
    generateFAQSchema,
    generateImageAlt,
    canonicalUrl,
    SITE_URL,
    SITE_NAME
  } from '$lib/seo';
  import { addToHistory, updateHistoryProgress, flushProgress, addFavorite, removeFavorite, isFavorite } from '$lib/storage';
  import { generateHighlights, generateRecommendation, generateViewingTips, generateRelatedSearches } from '$lib/content-generator';

  // ============ 类型定义 ============
  interface PlaySource {
    id: string;
    name: string;
    url: string;
    duration: number;
  }

  interface VideoDetail extends Video {
    play_sources: Array<{ url: string; duration: number }>;
  }

  // ============ 状态管理 ============
  let video = $state<VideoDetail | null>(null);
  let loading = $state(true);
  let errorMsg = $state('');
  let playSources = $state<PlaySource[]>([]);
  let currentSourceIndex = $state(0);
  let hlsPlayer: any = null;
  let showPlayButton = $state(false);
  let isPlaying = $state(false);
  let isLoadingVideo = false;
  let relatedVideos = $state<Video[]>([]);
  let favorited = $state(false);

  // ============ 派生状态 ============
  let videoId = $derived($page.params.id);
  let currentSource = $derived(playSources[currentSourceIndex]);

  // ============ SEO 数据 ============
  let autoDescription = $derived(video ? generateAutoDescription(video) : '');
  let seoTitle = $derived(video ? generatePageTitle({
    title: video.title,
    category: video.category,
    vod_year: video.vod_year,
    vod_area: video.vod_area
  }) : '');
  let seoDesc = $derived(video ? generateSEODescription({
    title: video.title,
    category: video.category,
    vod_year: video.vod_year,
    vod_area: video.vod_area,
    vod_actor: video.vod_actor,
    vod_director: video.vod_director
  }) : '');
  let breadcrumbs = $derived(video ? [
    { name: '首页', url: SITE_URL },
    { name: video.category || '视频', url: `${SITE_URL}/category/${encodeURIComponent(video.category || '全部')}/1` },
    { name: video.title, url: `${SITE_URL}/v/${video.vod_id}` }
  ] : []);
  let faqs = $derived(video ? [
    { question: `${video.title}在哪里可以免费观看？`, answer: `${SITE_NAME}提供《${video.title}》${video.category || ''}在线免费观看，高清完整版，支持手机播放。` },
    { question: `${video.title}是谁演的？`, answer: video.vod_actor ? `《${video.title}》由${video.vod_actor}主演。` : `《${video.title}》演员信息请查看页面详情。` },
    { question: `${video.title}是什么时候上映的？`, answer: video.vod_year ? `《${video.title}》${video.vod_year}年上映。` : `《${video.title}》上映时间请查看页面详情。` }
  ] : []);

  // ============ 生命周期 ============
  onMount(() => {
    loadVideo();
    return () => destroyPlayer();
  });

  // ============ 核心函数 ============
  function generateAutoDescription(v: VideoDetail): string {
    const parts: string[] = [];
    parts.push(`《${v.title}》`);
    if (v.category) parts.push(`是一部${v.category}作品`);
    if (v.vod_year) parts.push(`，${v.vod_year}年${v.vod_area || ''}出品`);
    if (v.vod_director) parts.push(`，由${v.vod_director}执导`);
    if (v.vod_actor) {
      const actors = v.vod_actor.split(/[,，]/).slice(0, 4).join('、');
      parts.push(`，${actors}主演`);
    }
    parts.push(`。在${SITE_NAME}即可在线免费观看${v.title}完整版，高清流畅，支持手机播放。`);
    return parts.join('');
  }

  async function loadVideo() {
    if (isLoadingVideo || (video && video.vod_id === videoId)) return;

    isLoadingVideo = true;
    loading = true;
    errorMsg = '';
    playSources = [];
    currentSourceIndex = 0;
    isPlaying = false;
    showPlayButton = false;
    destroyPlayer();

    try {
      const [videoRes, relatedRes] = await Promise.all([
        fetch(`/api/video/${videoId}`, { signal: AbortSignal.timeout(10000) }),
        fetch(`/api/video/${videoId}/related`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
      ]);

      if (!videoRes.ok) { errorMsg = `请求失败 (${videoRes.status})`; return; }

      const data = await videoRes.json();
      if (!data.success || !data.data) { errorMsg = data.message || '视频不存在'; return; }

      video = data.data;

      // 解析播放源 - 处理格式: "第1集$url1#第2集$url2"
      playSources = [];
      (video.play_sources || []).forEach((s, i) => {
        const url = s.url;
        if (url.includes('$') && url.includes('#')) {
          const episodes = url.split('#');
          episodes.forEach((ep, epIdx) => {
            const match = ep.match(/(.+?)\$(.+)/);
            if (match) {
              playSources.push({
                id: `ep${epIdx}`,
                name: episodes.length > 1 ? match[1] : `线路${i + 1}`,
                url: match[2],
                duration: s.duration || 0,
              });
            }
          });
        } else {
          playSources.push({
            id: `source-${i}`,
            name: `线路${i + 1}`,
            url: url,
            duration: s.duration || 0,
          });
        }
      });

      addToHistory({
        vod_id: video.vod_id, title: video.title, cover: video.cover,
        category: video.category, vod_year: video.vod_year, vod_area: video.vod_area
      });
      favorited = isFavorite(video.vod_id);

      if (relatedRes && relatedRes.ok) {
        try { relatedVideos = (await relatedRes.json()).data || []; } catch {}
      }

      // 直接播放第一个源
      if (playSources.length > 0) playSource(0);
    } catch (e: any) {
      errorMsg = e.name === 'TimeoutError' ? '请求超时，请重试' : '网络错误，请稍后重试';
    } finally {
      loading = false;
      isLoadingVideo = false;
    }
  }

  async function playSource(index: number) {
    currentSourceIndex = index;
    const source = playSources[index];
    if (!source) return;

    const videoEl = document.querySelector('video') as HTMLVideoElement | null;
    if (!videoEl) { requestAnimationFrame(() => playSource(index)); return; }

    destroyPlayer();

    if (source.url.includes('.m3u8')) {
      await playHls(videoEl, source.url);
    } else {
      videoEl.src = source.url;
      videoEl.play().catch(() => { showPlayButton = true; });
    }
  }

  async function playHls(videoEl: HTMLVideoElement, url: string) {
    try {
      const { default: Hls } = await import('hls.js');

      if (Hls.isSupported()) {
        hlsPlayer = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 300,
          maxMaxBufferLength: 600,
          maxBufferSize: 200 * 1000 * 1000,
          startLevel: -1,
        });

        hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
          videoEl.muted = true;
          videoEl.play()
            .then(() => { isPlaying = true; showPlayButton = false; setTimeout(() => { videoEl.muted = false; }, 300); })
            .catch(() => { showPlayButton = true; });

          videoEl.addEventListener('timeupdate', () => {
            if (videoEl.duration > 0 && videoEl.currentTime > 0 && video) {
              updateHistoryProgress(video.vod_id, videoEl.currentTime, videoEl.duration, playSources[currentSourceIndex]?.name || '');
            }
          });
        });

        hlsPlayer.on(Hls.Events.ERROR, (_event: any, data: any) => {
          if (!data.fatal) return;
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hlsPlayer?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hlsPlayer?.recoverMediaError();
              break;
            default:
              // 尝试下一个线路
              const nextIdx = currentSourceIndex + 1;
              if (nextIdx < playSources.length) playSource(nextIdx);
              else errorMsg = '所有线路均不可用，请稍后重试';
              break;
          }
        });

        hlsPlayer.attachMedia(videoEl);
        hlsPlayer.loadSource(url);
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url;
        videoEl.play().catch(() => { showPlayButton = true; });
      } else {
        errorMsg = '浏览器不支持HLS播放';
      }
    } catch {
      errorMsg = '播放器加载失败';
    }
  }

  function destroyPlayer() {
    flushProgress();
    if (hlsPlayer) { hlsPlayer.destroy(); hlsPlayer = null; }
  }

  function retryLoad() { isLoadingVideo = false; loadVideo(); }

  function formatDuration(seconds: number): string {
    if (seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
</script>

<svelte:head>
  {#if video}
    <title>{seoTitle}</title>
    <meta name="description" content={seoDesc} />
    <meta name="keywords" content={generateSEOKeywords({
      title: video.title, category: video.category, vod_year: video.vod_year,
      vod_area: video.vod_area, vod_actor: video.vod_actor, vod_director: video.vod_director, vod_lang: video.vod_lang
    }).join(',')} />
    <link rel="canonical" href={canonicalUrl(`/v/${video.vod_id}`)} />
    <link rel="preload" href={video.cover} as="image" fetchpriority="high" />
    <meta property="og:title" content={video.title} />
    <meta property="og:description" content={seoDesc} />
    <meta property="og:image" content={video.cover} />
    <meta property="og:image:alt" content={generateImageAlt({ title: video.title, category: video.category, vod_year: video.vod_year })} />
    <meta property="og:type" content="video.movie" />
    <meta property="og:url" content={canonicalUrl(`/v/${video.vod_id}`)} />
    {#if video.vod_year}
      <meta property="og:video:release_date" content={`${video.vod_year}-01-01`} />
    {/if}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={video.title} />
    <meta name="twitter:description" content={seoDesc} />
    <meta name="twitter:image" content={video.cover} />
    {@html `<script type="application/ld+json">${JSON.stringify(generateVideoSchema({
      title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area,
      vod_actor: video.vod_actor, vod_director: video.vod_director, vod_lang: video.vod_lang,
      cover: video.cover, play_url: playSources[0]?.url || '', vod_id: video.vod_id
    }))}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(generateBreadcrumbSchema(breadcrumbs))}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(generateOrganizationSchema())}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(generateWebPageSchema({ title: seoTitle, description: seoDesc, url: canonicalUrl(`/v/${video.vod_id}`) }))}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(generateFAQSchema(faqs))}</script>`}
  {:else}
    <title>视频详情 - {SITE_NAME}</title>
    <meta name="robots" content="noindex, follow" />
  {/if}
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <header class="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-3 py-2 z-50 flex items-center gap-2">
    <a href="/" class="text-gray-600 text-xl leading-none" aria-label="返回首页">←</a>
    <h1 class="text-lg font-bold text-pink-500 truncate flex-1">{video?.title || '视频详情'}</h1>
  </header>

  <main class="pb-16">
    {#if loading}
      <div class="flex flex-col items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
        <p class="mt-3 text-sm text-gray-400">加载中...</p>
      </div>
    {:else if errorMsg}
      <div class="flex flex-col items-center justify-center py-20">
        <p class="text-red-500 text-sm mb-4">{errorMsg}</p>
        <button onclick={retryLoad} class="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg active:bg-pink-600">重新加载</button>
      </div>
    {:else if video}
      <!-- 面包屑 -->
      <nav aria-label="面包屑" class="bg-white px-3 py-2 text-sm border-b">
        <ol class="flex items-center gap-1" itemscope itemtype="https://schema.org/BreadcrumbList">
          {#each breadcrumbs as crumb, i}
            <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem" class="flex items-center">
              {#if i > 0}<span class="text-gray-400 mx-1">/</span>{/if}
              {#if i < breadcrumbs.length - 1}
                <a href={crumb.url} class="text-pink-500 hover:underline" itemprop="item">
                  <span itemprop="name">{crumb.name}</span>
                </a>
                <meta itemprop="position" content={String(i + 1)} />
              {:else}
                <span class="text-gray-600" itemprop="name">{crumb.name}</span>
                <meta itemprop="position" content={String(i + 1)} />
              {/if}
            </li>
          {/each}
        </ol>
      </nav>

      <!-- 播放器 -->
      <div class="aspect-video bg-black relative">
        <video controls playsinline preload="metadata" class="w-full h-full" poster={video.cover}>
          您的浏览器不支持视频播放
        </video>
        {#if showPlayButton && !isPlaying}
          <div
            class="absolute inset-0 flex items-center justify-center bg-black/50 cursor-pointer"
            role="button" tabindex="0" aria-label="点击播放"
            onclick={() => {
              const el = document.querySelector('video') as HTMLVideoElement;
              if (el) el.play().then(() => { isPlaying = true; showPlayButton = false; }).catch(() => {});
            }}
          >
            <div class="w-20 h-20 bg-white/90 rounded-full flex items-center justify-center">
              <svg class="w-10 h-10 text-pink-500 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        {/if}
      </div>

      <!-- 视频信息 -->
      <article class="p-3 bg-white" itemscope itemtype="https://schema.org/Movie">
        <h1 class="text-lg font-bold mb-2" itemprop="name">{video.title}</h1>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mb-2">
          {#if video.category}<span itemprop="genre">{video.category}</span>{/if}
          {#if video.vod_year}<span itemprop="datePublished">{video.vod_year}</span>{/if}
          {#if video.vod_area}<span>{video.vod_area}</span>{/if}
          {#if video.vod_remarks}<span class="text-pink-500">{video.vod_remarks}</span>{/if}
        </div>
        {#if video.vod_director}
          <div class="text-sm mb-1"><span class="text-gray-500">导演：</span><span itemprop="director">{video.vod_director}</span></div>
        {/if}
        {#if video.vod_actor}
          <div class="text-sm"><span class="text-gray-500">演员：</span><span itemprop="actor">{video.vod_actor}</span></div>
        {/if}
      </article>

      <!-- 收藏按钮 -->
      <div class="px-3 py-2 bg-white border-t flex items-center gap-3">
        <button
          onclick={() => {
            if (favorited) { removeFavorite(video.vod_id); favorited = false; }
            else { addFavorite({ vod_id: video.vod_id, title: video.title, cover: video.cover, category: video.category, vod_year: video.vod_year }); favorited = true; }
          }}
          class="flex items-center gap-1 px-4 py-2 text-sm rounded-full transition-colors {favorited ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-600'}"
        >
          <svg class="w-4 h-4" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          {favorited ? '已收藏' : '收藏'}
        </button>
      </div>

      <!-- 线路选择 -->
      {#if playSources.length > 1}
        <section class="mt-2 bg-white p-3">
          <h3 class="font-medium mb-2">播放线路</h3>
          <div class="flex gap-2 flex-wrap">
            {#each playSources as source, idx}
              <button
                onclick={() => playSource(idx)}
                class="px-3 py-1.5 text-sm rounded transition-colors {currentSourceIndex === idx ? 'bg-pink-500 text-white' : 'bg-gray-100 active:bg-gray-200'}"
              >
                {source.name}
                {#if source.duration > 0}
                  <span class="text-xs opacity-70">{formatDuration(source.duration)}</span>
                {/if}
              </button>
            {/each}
          </div>
        </section>
      {:else if playSources.length === 1}
        <section class="mt-2 bg-white p-3">
          <span class="text-sm text-gray-500">{playSources[0].name}</span>
        </section>
      {/if}

      <!-- 简介 -->
      <section class="mt-2 bg-white p-3">
        <h3 class="font-medium mb-2">简介</h3>
        <p class="text-sm text-gray-600 leading-relaxed" itemprop="description">{autoDescription}</p>
        {#if video}
          {@const highlights = generateHighlights(video)}
          {#if highlights.length > 0}
            <div class="flex flex-wrap gap-2 mt-3">
              {#each highlights as h}
                <span class="px-2 py-1 bg-pink-50 text-pink-600 text-xs rounded-full">{h}</span>
              {/each}
            </div>
          {/if}
        {/if}
      </section>

      <!-- 推荐理由 -->
      {#if video}
        {@const recommendation = generateRecommendation(video)}
        {#if recommendation}
          <section class="mt-2 bg-white p-3">
            <h3 class="font-medium mb-2">推荐理由</h3>
            <p class="text-sm text-gray-600 leading-relaxed">{recommendation}</p>
          </section>
        {/if}
      {/if}

      <!-- 相关搜索 -->
      {#if video}
        {@const relatedSearches = generateRelatedSearches(video)}
        {#if relatedSearches.length > 0}
          <section class="mt-2 bg-white p-3">
            <h3 class="font-medium mb-2">相关搜索</h3>
            <div class="flex flex-wrap gap-2">
              {#each relatedSearches as term}
                <a href="/search/{encodeURIComponent(term)}/1" class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-pink-50 hover:text-pink-600 transition-colors">{term}</a>
              {/each}
            </div>
          </section>
        {/if}
      {/if}

      <!-- 相关视频 -->
      {#if relatedVideos.length > 0}
        <section class="mt-2 bg-white p-3">
          <h3 class="font-medium mb-2">猜你喜欢</h3>
          <div class="grid grid-cols-3 gap-2">
            {#each relatedVideos as rv, i (rv.vod_id)}
              <VideoCard video={rv} loading={i < 3 ? 'eager' : 'lazy'} />
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </main>

  <NavBar />
</div>
