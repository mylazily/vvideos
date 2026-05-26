<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import NavBar from '$components/NavBar.svelte';
  import type { Video } from '$lib/types';
  import {
    generateSEODescription,
    generateSEOKeywords,
    generatePageTitle,
    generateVideoSchema,
    generateBreadcrumbSchema,
    canonicalUrl,
    SITE_URL,
    SITE_NAME
  } from '$lib/seo';

  // ============ 类型定义 ============
  interface PlaySource {
    id: string;
    name: string;
    url: string;
    duration: number;
    priority: number;
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
  let isBuffering = $state(false);

  // ============ 派生状态 ============
  let videoId = $derived($page.params.id);
  let currentSource = $derived(playSources[currentSourceIndex]);

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
      }));

      // 直接播放第一个源
      if (playSources.length > 0) {
        playSource(0);
      }
    } catch (e: any) {
      errorMsg = e.name === 'TimeoutError' ? '请求超时，请重试' : '网络错误，请稍后重试';
    } finally {
      loading = false;
      isLoadingVideo = false;
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

  // ============ HLS 播放（精简版：快速启动）============
  async function playHls(videoEl: HTMLVideoElement, url: string) {
    try {
      const { default: Hls } = await import('hls.js');
      if (Hls.isSupported()) {
        hlsPlayer = new Hls({
          debug: false,
          enableWorker: true,
          lowLatencyMode: false,
          // 快速启动缓冲配置
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 30 * 1000 * 1000,
          maxBufferHole: 0.5,
          backBufferLength: 30,
          // 超时配置
          fragLoadingTimeOut: 20000,
          manifestLoadingTimeOut: 10000,
          levelLoadingTimeOut: 10000,
          // 重试配置
          fragLoadingMaxRetry: 4,
          manifestLoadingMaxRetry: 3,
          levelLoadingMaxRetry: 3,
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

        // 简化缓冲状态跟踪
        videoEl.addEventListener('waiting', () => { isBuffering = true; });
        videoEl.addEventListener('playing', () => { isBuffering = false; });

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
                // 致命错误：切换到下一条线路
                const nextIdx = (currentSourceIndex + 1) % playSources.length;
                if (nextIdx !== currentSourceIndex) {
                  playSource(nextIdx);
                }
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
          preload="none"
          poster={video?.cover}
          x-webkit-airplay="allow"
        ></video>
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
  {/if}

  <NavBar />
</div>

<style>
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
