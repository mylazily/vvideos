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
  import {
    testAllSources,
    selectBestSource as selectBest,
    parseM3U8ForAds,
    createPlaybackMonitor,
    createAutoSwitchManager,
    preloadNextVideo,
    getOptimizedHLSConfig,
    analyzeAdsFromSources,
    recordHourlySpeed,
    getCurrentHourWeight,
    type PlaySource,
    type AdSegment,
    type SourceHealth
  } from '$lib/player-manager';

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
  let sourceHealths = $state<SourceHealth[]>([]);
  let isCheckingLines = $state(false);
  let bufferHealth = $state(100);
  let skippedAds = $state<AdSegment[]>([]);
  let isSkippingAd = $state(false);
  let detectedAdSegments = $state<AdSegment[]>([]);
  let autoSwitchManager: ReturnType<typeof createAutoSwitchManager> | null = null;
  let playbackMonitor: ReturnType<typeof createPlaybackMonitor> | null = null;
  let bandwidth = $state(0);
  let isBuffering = $state(false);
  let favorited = $state(false);
  let adSkipListener: (() => void) | null = null;

  // ============ 派生状态 ============
  let videoId = $derived($page.params.id);
  let currentSource = $derived(playSources[currentSourceIndex]);
  let adSegments = $derived([...(video?.ad_segments || []), ...detectedAdSegments]);

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
    return () => {
      destroyPlayer();
      playbackMonitor?.destroy();
    };
  });

  // ============ 核心函数 ============
  function generateAutoDescription(video: VideoDetail): string {
    const parts: string[] = [];
    parts.push(`《${video.title}》`);
    if (video.category) parts.push(`是一部${video.category}作品`);
    if (video.vod_year) parts.push(`，${video.vod_year}年${video.vod_area || ''}出品`);
    if (video.vod_director) parts.push(`，由${video.vod_director}执导`);
    if (video.vod_actor) {
      const actors = video.vod_actor.split(/[,，]/).slice(0, 4).join('、');
      parts.push(`，${actors}主演`);
    }
    parts.push(`。在${SITE_NAME}即可在线免费观看${video.title}完整版，高清流畅，支持手机播放。`);
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
    skippedAds = [];
    detectedAdSegments = [];
    destroyPlayer();

    try {
      // 并行加载视频数据和相关视频
      const [videoRes, relatedRes] = await Promise.all([
        fetch(`/api/video/${videoId}`, {
          signal: AbortSignal.timeout(10000)
        }),
        fetch(`/api/video/${videoId}/related`, {
          signal: AbortSignal.timeout(5000)
        }).catch(() => null)
      ]);

      if (!videoRes.ok) {
        errorMsg = `请求失败 (${videoRes.status})`;
        return;
      }

      const data = await videoRes.json();
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
        priority: 5 - i
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

      favorited = isFavorite(video.vod_id);

      // 处理并行加载的相关视频数据
      if (relatedRes && relatedRes.ok) {
        try {
          const relatedData = await relatedRes.json();
          relatedVideos = relatedData.data || [];
        } catch {
          // 静默失败
        }
      }

      // 初始化自动切换管理器
      autoSwitchManager = createAutoSwitchManager(playSources, (idx) => {
        playSource(idx);
      });

      // 智能选择最佳线路
      if (playSources.length > 0) {
        await selectBestSource();
      }
    } catch (e: any) {
      errorMsg = e.name === 'TimeoutError' ? '请求超时，请重试' : '网络错误，请稍后重试';
    } finally {
      loading = false;
      isLoadingVideo = false;
    }
  }

  // 智能选择最佳线路（使用新的测速模块）
  async function selectBestSource() {
    if (playSources.length === 1) {
      playSource(0);
      return;
    }

    isCheckingLines = true;
    
    // 使用新的并行测速
    sourceHealths = await testAllSources(playSources);
    isCheckingLines = false;

    // 选择最佳线路
    const best = selectBest(playSources, sourceHealths);
    
    if (best) {
      currentSourceIndex = playSources.findIndex(s => s.id === best.source.id);
      playSource(currentSourceIndex);
    } else {
      playSource(0);
    }
  }

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
    playbackMonitor?.destroy();

    // 设置广告跳过监听
    setupAdSkipper(videoEl);

    // 创建播放监控
    playbackMonitor = createPlaybackMonitor(
      videoEl,
      () => {
        // 缓冲不足，尝试切换线路
        if (autoSwitchManager) {
          autoSwitchManager.switchToNext();
        }
      },
      (error) => {
        // 播放错误
        if (autoSwitchManager) {
          autoSwitchManager.reportError(index, error);
        }
      }
    );

    if (source.url.includes('.m3u8')) {
      await playHls(videoEl, source.url);
      
      // 后台检测M3U8中的广告
      detectAdsInM3U8(source.url);
    } else {
      playMp4(videoEl, source.url);
    }

    // 预加载下一个线路
    if (playSources.length > 1) {
      preloadNextVideo(playSources, index);
    }
  }

  // 检测M3U8中的广告段（增强版：多源对比）
  async function detectAdsInM3U8(url: string) {
    try {
      // 单源解析
      const singleAds = await parseM3U8ForAds(url);
      
      // 多源对比分析
      if (playSources.length >= 2) {
        const multiAds = await analyzeAdsFromSources(playSources);
        // 合并结果，多源检测优先级更高
        detectedAdSegments = [...multiAds, ...singleAds.filter(s => 
          !multiAds.some(m => Math.abs(m.start - s.start) < 5)
        )];
      } else {
        detectedAdSegments = singleAds;
      }
    } catch {
      // 静默失败
    }
  }

  // 广告跳过逻辑
  function setupAdSkipper(videoEl: HTMLVideoElement) {
    // 清理旧的监听器
    if (adSkipListener) {
      videoEl.removeEventListener('timeupdate', adSkipListener);
    }
    const checkAndSkip = () => {
      if (isSkippingAd) return;

      const currentTime = videoEl.currentTime;
      for (const seg of adSegments) {
        if (currentTime >= seg.start && currentTime < seg.end) {
          isSkippingAd = true;
          videoEl.currentTime = seg.end;
          skippedAds = [...skippedAds, seg];
          setTimeout(() => { isSkippingAd = false; }, 500);
          break;
        }
      }
    };

    videoEl.addEventListener('timeupdate', checkAndSkip);
    adSkipListener = checkAndSkip;
  }

  async function playHls(videoEl: HTMLVideoElement, url: string) {
    try {
      const { default: Hls } = await import('hls.js');

      if (Hls.isSupported()) {
        // 使用优化的HLS配置（根据时间段自动调整）
        const hlsConfig = getOptimizedHLSConfig();
        hlsPlayer = new Hls(hlsConfig);

        hlsPlayer.on(Hls.Events.FRAG_LOADED, (_: any, data: any) => {
          // 更新带宽估算
          if (data.frag && data.stats) {
            const duration = data.stats.tload - data.stats.trequest;
            if (duration > 0 && data.frag._byteRange) {
              bandwidth = Math.round((data.frag._byteRange / duration) * 8 / 1000);
              // 记录当前时间段的速度
              if (currentSource) {
                recordHourlySpeed(currentSource.id, bandwidth * 1000);
              }
            }
          }
        });

        hlsPlayer.on(Hls.Events.BUFFER_APPENDED, () => {
          updateBufferHealth(videoEl);
        });

        hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
          videoEl.muted = true;
          videoEl.play()
            .then(() => {
              isPlaying = true;
              showPlayButton = false;
              setTimeout(() => { videoEl.muted = false; }, 300);
              autoSwitchManager?.reportSuccess(currentSourceIndex);
            })
            .catch(() => { showPlayButton = true; });

          videoEl.addEventListener('timeupdate', () => {
            if (videoEl.duration > 0 && videoEl.currentTime > 0) {
              updateHistoryProgress(
                video!.vod_id,
                videoEl.currentTime,
                videoEl.duration,
                playSources[currentSourceIndex]?.name || ''
              );
            }
          });
        });

        hlsPlayer.on(Hls.Events.ERROR, (_event: any, data: any) => {
          handleHlsError(data);
        });

        hlsPlayer.on(Hls.Events.FRAG_LOAD_EMERGENCY_ABORTED, () => {
          // 紧急中止加载，可能是缓冲区满了
          isBuffering = true;
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

  function playMp4(videoEl: HTMLVideoElement, url: string) {
    videoEl.src = url;
    videoEl.play().catch(() => { showPlayButton = true; });
  }

  function handleHlsError(data: any) {
    if (!data.fatal) return;

    autoSwitchManager?.reportError(currentSourceIndex, data.type);

    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        // 网络错误，尝试重新加载
        hlsPlayer?.startLoad();
        break;
      case Hls.ErrorTypes.MEDIA_ERROR:
        // 媒体错误，尝试恢复
        hlsPlayer?.recoverMediaError();
        break;
      default:
        // 其他致命错误，切换线路
        switchToNextSource();
        break;
    }
  }

  function switchToNextSource() {
    if (autoSwitchManager) {
      autoSwitchManager.switchToNext();
    } else {
      const nextIdx = currentSourceIndex + 1;
      if (nextIdx < playSources.length) {
        playSource(nextIdx);
      } else {
        errorMsg = '所有线路均不可用，请稍后重试';
      }
    }
  }

  function updateBufferHealth(videoEl: HTMLVideoElement) {
    if (!videoEl.buffered.length) return;

    const bufferedEnd = videoEl.buffered.end(videoEl.buffered.length - 1);
    const currentTime = videoEl.currentTime;
    const bufferedAhead = bufferedEnd - currentTime;

    bufferHealth = Math.min(100, (bufferedAhead / 30) * 100);
    isBuffering = bufferedAhead < 3;
  }

  function destroyPlayer() {
    flushProgress();
    const videoEl = document.querySelector('video') as HTMLVideoElement;
    if (videoEl && adSkipListener) {
      videoEl.removeEventListener('timeupdate', adSkipListener);
      adSkipListener = null;
    }
    if (hlsPlayer) {
      hlsPlayer.destroy();
      hlsPlayer = null;
    }
  }

  function retryLoad() {
    isLoadingVideo = false;
    loadVideo();
  }

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
      title: video.title,
      category: video.category,
      vod_year: video.vod_year,
      vod_area: video.vod_area,
      vod_actor: video.vod_actor,
      vod_director: video.vod_director,
      vod_lang: video.vod_lang
    }).join(',')} />
    <link rel="canonical" href={canonicalUrl(`/v/${video.vod_id}`)} />
    <link rel="preload" href={video.cover} as="image" fetchpriority="high" />

    <!-- Open Graph -->
    <meta property="og:title" content={video.title} />
    <meta property="og:description" content={seoDesc} />
    <meta property="og:image" content={video.cover} />
    <meta property="og:image:alt" content={generateImageAlt({
      title: video.title,
      category: video.category,
      vod_year: video.vod_year
    })} />
    <meta property="og:type" content="video.movie" />
    <meta property="og:url" content={canonicalUrl(`/v/${video.vod_id}`)} />
    {#if video.vod_year}
      <meta property="og:video:release_date" content={`${video.vod_year}-01-01`} />
    {/if}

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={video.title} />
    <meta name="twitter:description" content={seoDesc} />
    <meta name="twitter:image" content={video.cover} />

    <!-- 结构化数据 -->
    {@html `<script type="application/ld+json">${JSON.stringify(generateVideoSchema({
      title: video.title,
      category: video.category,
      vod_year: video.vod_year,
      vod_area: video.vod_area,
      vod_actor: video.vod_actor,
      vod_director: video.vod_director,
      vod_lang: video.vod_lang,
      cover: video.cover,
      play_url: playSources[0]?.url || '',
      vod_id: video.vod_id
    }))}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(generateBreadcrumbSchema(breadcrumbs))}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(generateOrganizationSchema())}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(generateWebPageSchema({
      title: seoTitle,
      description: seoDesc,
      url: canonicalUrl(`/v/${video.vod_id}`)
    }))}</script>`}
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
        <button onclick={retryLoad} class="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg active:bg-pink-600">
          重新加载
        </button>
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
        <video
          controls
          playsinline
          preload="metadata"
          class="w-full h-full"
          poster={video.cover}
        >
          您的浏览器不支持视频播放
        </video>

        {#if showPlayButton && !isPlaying}
          <div
            class="absolute inset-0 flex items-center justify-center bg-black/50 cursor-pointer"
            role="button"
            tabindex="0"
            aria-label="点击播放"
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

        <!-- 广告跳过提示 -->
        {#if skippedAds.length > 0 && !isSkippingAd}
          <div class="absolute top-4 right-4 bg-green-500/90 text-white text-xs px-3 py-1 rounded-full">
            已跳过 {skippedAds.length} 段广告
          </div>
        {/if}

        <!-- 缓冲状态指示器 -->
        {#if bufferHealth < 30 && isPlaying}
          <div class="absolute bottom-16 left-4 right-4 bg-black/70 text-white text-xs px-3 py-1 rounded">
            缓冲中... {Math.round(bufferHealth)}%
          </div>
        {/if}
      </div>

      <!-- 播放信息 -->
      {#if currentSource}
        <div class="px-3 py-2 bg-white border-b flex items-center justify-between">
          <span class="text-sm text-gray-500">
            {currentSource.name}
            {#if currentSource.duration > 0}
              <span class="text-xs text-gray-400 ml-1">({formatDuration(currentSource.duration)})</span>
            {/if}
          </span>
          {#if isCheckingLines}
            <span class="text-xs text-pink-500">检测线路中...</span>
          {/if}
        </div>
      {/if}

      <!-- 视频信息 -->
      <article class="p-3 bg-white" itemscope itemtype="https://schema.org/Movie">
        <h2 class="text-lg font-bold mb-2" itemprop="name">{video.title}</h2>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mb-2">
          {#if video.category}<span itemprop="genre">{video.category}</span>{/if}
          {#if video.vod_year}<span itemprop="datePublished">{video.vod_year}</span>{/if}
          {#if video.vod_area}<span>{video.vod_area}</span>{/if}
          {#if video.vod_remarks}<span class="text-pink-500">{video.vod_remarks}</span>{/if}
        </div>
        {#if video.vod_director}
          <div class="text-sm mb-1">
            <span class="text-gray-500">导演：</span>
            <span itemprop="director">{video.vod_director}</span>
          </div>
        {/if}
        {#if video.vod_actor}
          <div class="text-sm">
            <span class="text-gray-500">演员：</span>
            <span itemprop="actor">{video.vod_actor}</span>
          </div>
        {/if}
      </article>

      <!-- 收藏按钮 -->
      <div class="px-3 py-2 bg-white border-t flex items-center gap-3">
        <button
          onclick={() => {
            if (favorited) {
              removeFavorite(video.vod_id);
              favorited = false;
            } else {
              addFavorite({ vod_id: video.vod_id, title: video.title, cover: video.cover, category: video.category, vod_year: video.vod_year });
              favorited = true;
            }
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
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-medium">播放线路</h3>
            <div class="flex items-center gap-2 text-xs text-gray-500">
              {#if bandwidth > 0}
                <span>{bandwidth} kbps</span>
              {/if}
              {#if isCheckingLines}
                <span class="text-pink-500">检测中...</span>
              {/if}
            </div>
          </div>
          <div class="flex gap-2 flex-wrap">
            {#each playSources as source, idx}
              {@const health = sourceHealths.find(h => h.id === source.id)}
              <button
                onclick={() => playSource(idx)}
                class="px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-1 {currentSourceIndex === idx ? 'bg-pink-500 text-white' : 'bg-gray-100 active:bg-gray-200'}"
              >
                {source.name}
                {#if source.duration > 0}
                  <span class="text-xs opacity-70">{formatDuration(source.duration)}</span>
                {/if}
                {#if health}
                  <span 
                    class="w-2 h-2 rounded-full {health.available ? (health.latency < 1000 ? 'bg-green-400' : 'bg-yellow-400') : 'bg-red-400'}"
                    title={health.available ? `${Math.round(health.latency)}ms` : '不可用'}
                  ></span>
                {/if}
              </button>
            {/each}
          </div>
          {#if adSegments.length > 0}
            <p class="text-xs text-gray-500 mt-2">
              检测到 {adSegments.length} 段广告，将自动跳过
            </p>
          {/if}
          {#if isBuffering}
            <p class="text-xs text-yellow-600 mt-2">
              缓冲中，请稍候...
            </p>
          {/if}
        </section>
      {:else if playSources.length === 1}
        <section class="mt-2 bg-white p-3">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">{playSources[0].name}</span>
            {#if bandwidth > 0}
              <span class="text-xs text-gray-400">{bandwidth} kbps</span>
            {/if}
          </div>
        </section>
      {/if}

      <!-- 简介 -->
      <section class="mt-2 bg-white p-3">
        <h3 class="font-medium mb-2">简介</h3>
        <p class="text-sm text-gray-600 leading-relaxed" itemprop="description">{autoDescription}</p>
        
        <!-- 动态看点 -->
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

      <!-- 观看建议 -->
      {#if video}
        {@const tips = generateViewingTips(video)}
        {#if tips.length > 0}
          <section class="mt-2 bg-white p-3">
            <h3 class="font-medium mb-2">观看提示</h3>
            <ul class="text-sm text-gray-600 space-y-1">
              {#each tips as tip}
                <li class="flex items-start gap-2">
                  <span class="text-pink-500">•</span>
                  <span>{tip}</span>
                </li>
              {/each}
            </ul>
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
                <a 
                  href="/search/{encodeURIComponent(term)}/1" 
                  class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-pink-50 hover:text-pink-600 transition-colors"
                >
                  {term}
                </a>
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

  <NavBar />\n</div>
