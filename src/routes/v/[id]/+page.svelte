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
  import { addToHistory } from '$lib/storage';
  import type { PlaySource, AdSegment } from '$lib/player-manager';

  // ============ 类型定义 ============
  interface VideoDetail extends Video {
    play_sources: Array<{ url: string; duration: number }>;
    ad_segments: AdSegment[];
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
  let isBuffering = $state(false);
  let bufferHealth = $state(0);
  let skippedAds = $state<AdSegment[]>([]);
  let isCheckingLines = $state(false);

  // ============ 派生状态 ============
  let videoId = $derived($page.params.id);
  let currentSource = $derived(playSources[currentSourceIndex]);
  let adSegments = $derived([...(video?.ad_segments || [])]);

  // ============ SEO 数据 ============
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

  // ============ 生命周期 ============
  onMount(() => {
    loadVideo();
    return () => {
      destroyPlayer();
    };
  });

  // ============ 核心函数 ============
  async function loadVideo() {
    if (isLoadingVideo || (video && video.vod_id === videoId)) return;
    isLoadingVideo = true;
    loading = true;
    errorMsg = '';
    playSources = [];
    currentSourceIndex = 0;
    destroyPlayer();

    try {
      const res = await fetch(`/api/video/${videoId}`, {
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) {
        errorMsg = `请求失败 (${res.status})`;
        return;
      }
      const data = await res.json();
      if (!data.success || !data.data) {
        errorMsg = data.message || '视频不存在';
        return;
      }
      video = data.data;

      // 转换播放源
      playSources = (video.play_sources || []).map((s, i) => ({
        id: `source-${i}`,
        name: `线路${i + 1}`,
        url: s.url,
        duration: s.duration || 0,
        priority: 5 - i,
        latency: 0,
        bandwidth: 0,
        errorCount: 0,
      }));

      // 添加到历史记录
      addToHistory({
        vod_id: video.vod_id,
        title: video.title,
        cover: video.cover,
        category: video.category,
        vod_year: video.vod_year,
        vod_area: video.vod_area
      });

      // 后台加载相关视频（不阻塞）
      loadRelatedVideos(videoId);

      // 直接播放第一个源（不再等待测速）
      if (playSources.length > 0) {
        playSource(0);
        // 后台测速其他源（异步，不阻塞播放）
        if (playSources.length > 1) {
          backgroundSpeedTest();
        }
      }
    } catch (e: any) {
      errorMsg = e.name === 'TimeoutError' ? '请求超时，请重试' : '网络错误，请稍后重试';
    } finally {
      loading = false;
      isLoadingVideo = false;
    }
  }

  // ============ 后台测速（不阻塞播放）============
  async function backgroundSpeedTest() {
    isCheckingLines = true;
    try {
      await Promise.allSettled(
        playSources.slice(1).map(async (source) => {
          const start = performance.now();
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            await fetch(source.url, { method: 'HEAD', signal: controller.signal, mode: 'no-cors' });
            clearTimeout(timeout);
            source.latency = performance.now() - start;
            source.bandwidth = Math.round((512 * 1024) / (source.latency / 1000));
          } catch {
            source.errorCount = (source.errorCount || 0) + 1;
          }
        })
      );
    } finally {
      isCheckingLines = false;
    }
  }

  // ============ 播放源切换 ============
  async function playSource(index: number) {
    currentSourceIndex = index;
    const source = playSources[index];
    if (!source) return;

    const videoEl = document.querySelector('video') as HTMLVideoElement | null;
    if (!videoEl) {
      requestAnimationFrame(() => playSource(index));
      return;
    }

    destroyPlayer();
    isPlaying = false;
    isBuffering = true;

    if (source.url.includes('.m3u8')) {
      await playHls(videoEl, source.url);
    } else {
      videoEl.src = source.url;
      videoEl.play().catch(() => { showPlayButton = true; });
    }
  }

  // ============ 快速切换线路 ============
  function switchToNext() {
    const nextIdx = (currentSourceIndex + 1) % playSources.length;
    if (nextIdx !== currentSourceIndex) {
      playSource(nextIdx);
    }
  }

  // ============ HLS 播放（优化版：快速启动）============
  async function playHls(videoEl: HTMLVideoElement, url: string) {
    try {
      const { default: Hls } = await import('hls.js');
      if (Hls.isSupported()) {
        // 优化HLS配置：快速启动，小缓冲
        hlsPlayer = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          // 快速启动缓冲配置（小缓冲=快启动）
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 30 * 1000 * 1000,
          maxBufferHole: 0.5,
          backBufferLength: 30,
          // ABR配置
          startLevel: -1,
          abrEwmaDefaultEstimate: 1500000,
          abrBandWidthFactor: 0.8,
          abrBandWidthUpFactor: 0.5,
          // 超时配置
          fragLoadingTimeOut: 20000,
          manifestLoadingTimeOut: 10000,
          levelLoadingTimeOut: 10000,
          // 重试配置
          fragLoadingMaxRetry: 4,
          manifestLoadingMaxRetry: 3,
          levelLoadingMaxRetry: 3,
          // 禁用不必要的功能
          enableCEA708Captions: false,
          enableWebVTT: false,
        });

        hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
          isBuffering = false;
          videoEl.muted = true;
          videoEl.play()
            .then(() => {
              isPlaying = true;
              showPlayButton = false;
              setTimeout(() => { videoEl.muted = false; }, 500);
            })
            .catch(() => { showPlayButton = true; });
        });

        hlsPlayer.on(Hls.Events.BUFFER_APPENDED, () => {
          updateBufferHealth(videoEl);
        });

        hlsPlayer.on(Hls.Events.ERROR, (_event: any, data: any) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hlsPlayer?.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hlsPlayer?.recoverMediaError();
                break;
              default:
                switchToNext();
                break;
            }
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
    } catch (e) {
      errorMsg = '播放器加载失败';
    }
  }

  function updateBufferHealth(videoEl: HTMLVideoElement) {
    if (!videoEl.buffered.length) return;
    const bufferedEnd = videoEl.buffered.end(videoEl.buffered.length - 1);
    const currentTime = videoEl.currentTime;
    const bufferedAhead = bufferedEnd - currentTime;
    bufferHealth = Math.min(100, (bufferedAhead / 30) * 100);
    isBuffering = bufferedAhead < 2;
  }

  function destroyPlayer() {
    if (hlsPlayer) {
      hlsPlayer.destroy();
      hlsPlayer = null;
    }
  }

  function retryLoad() {
    isLoadingVideo = false;
    loadVideo();
  }

  async function loadRelatedVideos(id: string) {
    try {
      const res = await fetch(`/api/video/${id}/related`, {
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        relatedVideos = data.data || [];
      }
    } catch { /* 静默失败 */ }
  }
</script>

<svelte:head>
  {#if video}
    <title>{seoTitle}</title>
    <meta name="description" content={seoDesc} />
    <meta name="keywords" content={generateSEOKeywords({
      title: video.title,
      category: video.category,
      vod_year: video.vod_year,
      vod_area: video.vod_area,
      vod_actor: video.vod_actor,
      vod_director: video.vod_director,
      vod_lang: video.vod_lang
    }).join(',')} />
    <link rel="canonical" href={canonicalUrl(`/v/${video.vod_id}`)} />
    <meta property="og:title" content={video.title} />
    <meta property="og:description" content={seoDesc} />
    <meta property="og:image" content={video.cover} />
    <meta property="og:type" content="video.movie" />
    <meta property="og:url" content={canonicalUrl(`/v/${video.vod_id}`)} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={video.title} />
    <meta name="twitter:description" content={seoDesc} />
    <meta name="twitter:image" content={video.cover} />
  {:else}
    <title>视频详情 - {SITE_NAME}</title>
    <meta name="robots" content="noindex, follow" />
  {/if}
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <header class="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-3 py-2 z-50 flex items-center gap-2">
    <a href="/" class="text-gray-600 text-lg flex-shrink-0">←</a>
    <h1 class="text-sm font-medium text-gray-800 truncate flex-1">{video?.title || '加载中...'}</h1>
    {#if playSources.length > 1}
      <button
        onclick={switchToNext}
        class="text-xs px-2 py-1 bg-pink-100 text-pink-600 rounded-full"
      >
        换线路
      </button>
    {/if}
  </header>

  <!-- 视频播放器区域 -->
  <div class="relative bg-black">
    {#if loading}
      <div class="aspect-video flex items-center justify-center bg-gray-900">
        <div class="text-center">
          <div class="w-12 h-12 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin mx-auto mb-3"></div>
          <p class="text-white/60 text-sm">加载中...</p>
        </div>
      </div>
    {:else if errorMsg}
      <div class="aspect-video flex items-center justify-center bg-gray-900">
        <div class="text-center px-4">
          <p class="text-red-400 text-sm mb-3">{errorMsg}</p>
          <button onclick={retryLoad} class="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg">重试</button>
        </div>
      </div>
    {:else if showPlayButton}
      <div class="aspect-video flex items-center justify-center bg-gray-900 relative">
        <button
          onclick={() => {
            const v = document.querySelector('video');
            v?.play().catch(() => {});
          }}
          class="w-16 h-16 bg-pink-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-pink-600 transition-colors"
        >
          <svg class="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      </div>
    {:else}
      <div class="relative aspect-video">
        <video
          class="w-full h-full"
          controls
          playsinline
          preload="auto"
          poster={video?.cover}
          x-webkit-airplay="allow"
        ></video>
        {#if isBuffering || !isPlaying}
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- 线路切换器 -->
    {#if playSources.length > 1 && !loading && !errorMsg}
      <div class="bg-gray-900 px-3 py-2 flex items-center gap-2 overflow-x-auto">
        {#each playSources as source, i}
          <button
            onclick={() => playSource(i)}
            class="flex-shrink-0 px-3 py-1 text-xs rounded-full transition-colors {i === currentSourceIndex ? 'bg-pink-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
          >
            {source.name}
          </button>
        {/each}
        {#if isCheckingLines}
          <span class="text-xs text-gray-500 flex-shrink-0">测速中...</span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- 视频信息 -->
  {#if video}
    <div class="bg-white px-3 py-3">
      <h1 class="text-base font-medium text-gray-800 mb-1">{video.title}</h1>
      <div class="flex items-center gap-2 text-xs text-gray-400 mb-2">
        {#if video.category}<span>{video.category}</span>{/if}
        {#if video.vod_year}<span>{video.vod_year}</span>{/if}
        {#if video.vod_area}<span>{video.vod_area}</span>{/if}
        {#if video.vod_actor}<span>{video.vod_actor}</span>{/if}
      </div>
      {#if video.vod_remarks}
        <p class="text-xs text-pink-500 bg-pink-50 inline-block px-2 py-1 rounded">{video.vod_remarks}</p>
      {/if}
    </div>

    <!-- 相关推荐 -->
    {#if relatedVideos.length > 0}
      <div class="mt-2">
        <h2 class="text-sm font-medium text-gray-700 px-3 py-2">相关推荐</h2>
        <div class="grid grid-cols-3 gap-2 px-2 pb-4">
          {#each relatedVideos.slice(0, 6) as v}
            <a href="/v/{v.vod_id}" class="block">
              <div class="relative aspect-video bg-gray-200 rounded-lg overflow-hidden">
                <img src={v.cover} alt={v.title} loading="lazy" class="w-full h-full object-cover" />
              </div>
              <p class="text-xs text-gray-600 mt-1 line-clamp-2">{v.title}</p>
            </a>
          {/each}
        </div>
      </div>
    {/if}
  {/if}

  <NavBar />
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
