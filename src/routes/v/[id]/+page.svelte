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
  let relatedVideos = $state<Video[]>([]);
  let favorited = $state(false);

  // ============ 派生状态 ============
  let videoId = $derived($page.params.id);

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
    loading = true;
    errorMsg = '';
    playSources = [];
    currentSourceIndex = 0;
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

      // 解析播放源
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
      if (playSources.length > 0) {
        setTimeout(() => playSource(0), 100);
      }
    } catch (e: any) {
      errorMsg = e.name === 'TimeoutError' ? '请求超时，请重试' : '网络错误，请稍后重试';
    } finally {
      loading = false;
    }
  }

  async function playSource(index: number) {
    currentSourceIndex = index;
    const source = playSources[index];
    if (!source) return;

    const videoEl = document.querySelector('video') as HTMLVideoElement | null;
    if (!videoEl) { setTimeout(() => playSource(index), 50); return; }

    destroyPlayer();

    if (source.url.includes('.m3u8')) {
      await playHls(videoEl, source.url);
    } else {
      videoEl.src = source.url;
      videoEl.play().catch(() => {});
    }
  }

  async function playHls(videoEl: HTMLVideoElement, url: string) {
    try {
      const { default: Hls } = await import('hls.js/light');

      if (Hls.isSupported()) {
        // 精简优化配置 - 5-10分钟缓冲区，极速加载
        hlsPlayer = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          
          // 缓冲区配置：5-10分钟
          maxBufferLength: 300,
          maxMaxBufferLength: 600,
          maxBufferSize: 0,
          
          // 快速启动配置
          startLevel: -1,
          startFragPrefetch: true,
          
          // 加载超时
          fragLoadingTimeOut: 20000,
          manifestLoadingTimeOut: 10000,
          levelLoadingTimeOut: 10000,
          
          // 重试配置
          fragLoadingMaxRetry: 3,
          manifestLoadingMaxRetry: 2,
          levelLoadingMaxRetry: 2,
          fragLoadingRetryDelay: 500,
          
          // 禁用所有非核心功能
          enableCEA708Captions: false,
          enableWebVTT: false,
          enableIMSC1: false,
          enableID3Metadata: false,
          enableAES128KeyLoad: false,
          enableSoftwareAES: false,
          enableMP2TSDTS: false,
          enableEPG: false,
          enableMSE: true,
        });

        hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
          videoEl.play().catch(() => {});
        });

        hlsPlayer.on(Hls.Events.ERROR, (_event: any, data: any) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hlsPlayer?.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hlsPlayer?.recoverMediaError();
          } else {
            const nextIdx = currentSourceIndex + 1;
            if (nextIdx < playSources.length) playSource(nextIdx);
            else errorMsg = '播放失败，请重试';
          }
        });

        hlsPlayer.attachMedia(videoEl);
        hlsPlayer.loadSource(url);
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url;
        videoEl.play().catch(() => {});
      } else {
        errorMsg = '浏览器不支持播放';
      }
    } catch {
      errorMsg = '播放器加载失败';
    }
  }

  function destroyPlayer() {
    flushProgress();
    if (hlsPlayer) { hlsPlayer.destroy(); hlsPlayer = null; }
  }

  function retryLoad() { loadVideo(); }

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
    <meta property="og:type" content="video.movie" />
    <meta property="og:url" content={canonicalUrl(`/v/${video.vod_id}`)} />
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
    <a href="/" class="text-gray-600 text-xl leading-none">←</a>
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
        <button onclick={retryLoad} class="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg">重新加载</button>
      </div>
    {:else if video}
      <!-- 面包屑 -->
      <nav aria-label="面包屑" class="bg-white px-3 py-2 text-sm border-b">
        <ol class="flex items-center gap-1">
          {#each breadcrumbs as crumb, i}
            <li class="flex items-center">
              {#if i > 0}<span class="text-gray-400 mx-1">/</span>{/if}
              {#if i < breadcrumbs.length - 1}
                <a href={crumb.url} class="text-pink-500">{crumb.name}</a>
              {:else}
                <span class="text-gray-600">{crumb.name}</span>
              {/if}
            </li>
          {/each}
        </ol>
      </nav>

      <!-- 播放器 -->
      <div class="aspect-video bg-black relative">
        <video controls playsinline preload="auto" class="w-full h-full" poster={video.cover}>
          您的浏览器不支持视频播放
        </video>
      </div>

      <!-- 视频信息 -->
      <article class="p-3 bg-white">
        <h1 class="text-lg font-bold mb-2">{video.title}</h1>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mb-2">
          {#if video.category}<span>{video.category}</span>{/if}
          {#if video.vod_year}<span>{video.vod_year}</span>{/if}
          {#if video.vod_area}<span>{video.vod_area}</span>{/if}
          {#if video.vod_remarks}<span class="text-pink-500">{video.vod_remarks}</span>{/if}
        </div>
        {#if video.vod_director}
          <div class="text-sm mb-1"><span class="text-gray-500">导演：</span><span>{video.vod_director}</span></div>
        {/if}
        {#if video.vod_actor}
          <div class="text-sm"><span class="text-gray-500">演员：</span><span>{video.vod_actor}</span></div>
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
          {favorited ? '♥' : '♡'} {favorited ? '已收藏' : '收藏'}
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
                class="px-3 py-1.5 text-sm rounded transition-colors {currentSourceIndex === idx ? 'bg-pink-500 text-white' : 'bg-gray-100'}"
              >
                {source.name}
                {#if source.duration > 0}
                  <span class="text-xs opacity-70">{formatDuration(source.duration)}</span>
                {/if}
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 简介 -->
      <section class="mt-2 bg-white p-3">
        <h3 class="font-medium mb-2">简介</h3>
        <p class="text-sm text-gray-600 leading-relaxed">{autoDescription}</p>
      </section>

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
