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
    canonicalUrl,
    SITE_URL,
    SITE_NAME
  } from '$lib/seo';
  import { addToHistory, updateHistoryProgress, flushProgress, addFavorite, removeFavorite, isFavorite } from '$lib/storage';

  // HLS.js 类型声明（CDN加载为全局变量）
  declare const Hls: any;

  // ============ 类型定义 ============
  interface PlaySource {
    id: string;
    name: string;
    url: string;
    duration: number;
  }

  interface SourceInfo {
    id: number;
    name: string;
    alias: string;
    display_name: string;
  }

  interface VideoDetail extends Video {
    play_sources: Array<{ url: string; duration: number }>;
    source?: SourceInfo;
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
  let playerLoading = $state(false);
  let videoEl: HTMLVideoElement | null = $state(null);

  // ============ 派生状态 ============
  let videoId = $derived($page.params.id);

  // ============ 生命周期 ============
  onMount(() => {
    loadVideo();
    return () => destroyPlayer();
  });

  // 预连接 m3u8 域名（节省 DNS + TCP + TLS 时间）
  function prefetchStreamDomain(url: string) {
    try {
      const host = new URL(url).host;
      if (host && host !== location.host) {
        // 同时添加 preconnect 和 dns-prefetch
        const rels = ['preconnect', 'dns-prefetch'];
        for (const rel of rels) {
          if (!document.querySelector(`link[rel="${rel}"][href="https://${host}"]`)) {
            const link = document.createElement('link');
            link.rel = rel;
            link.href = `https://${host}`;
            if (rel === 'preconnect') link.crossOrigin = '';
            document.head.appendChild(link);
          }
        }
      }
    } catch {}
  }

  // ============ SEO 数据（延迟计算） ============
  let autoDescription = $derived(video ? generateAutoDescription(video) : '');
  let seoTitle = $derived(video ? generatePageTitle({
    title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area
  }) : '');
  let seoDesc = $derived(video ? generateSEODescription({
    title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area,
    vod_actor: video.vod_actor, vod_director: video.vod_director
  }) : '');
  let breadcrumbs = $derived(video ? [
    { name: '首页', url: SITE_URL },
    { name: video.category || '视频', url: `${SITE_URL}/category/${encodeURIComponent(video.category || '全部')}/1` },
    { name: video.title, url: `${SITE_URL}/v/${video.vod_id}` }
  ] : []);

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

  // @ts-ignore 全局预取数据
  declare const _VPD: any;

  async function loadVideo() {
    loading = true;
    errorMsg = '';
    playSources = [];
    currentSourceIndex = 0;
    destroyPlayer();

    try {
      // 优先使用 app.html 预取的数据（零延迟）
      // 但必须先验证预取数据的视频ID与当前页面ID是否匹配
      // @ts-ignore
      const preloadedVideo = typeof _VPD !== 'undefined' && _VPD.video && _VPD.video.vod_id === videoId ? _VPD.video : null;
      // @ts-ignore
      const preloadedRelated = typeof _VPD !== 'undefined' && _VPD.related ? _VPD.related : null;

      let videoData = preloadedVideo;
      let relatedData = preloadedRelated;

      // 如果预取数据不可用或ID不匹配，走 API 请求
      if (!videoData) {
        const [videoRes, relatedRes] = await Promise.all([
          fetch(`/api/video/${videoId}`, { signal: AbortSignal.timeout(10000) }),
          fetch(`/api/video/${videoId}/related`, { signal: AbortSignal.timeout(5000) }).catch(() => null)
        ]);

        if (!videoRes.ok) { errorMsg = `请求失败 (${videoRes.status})`; return; }
        const data = await videoRes.json();
        if (!data.success || !data.data) { errorMsg = data.message || '视频不存在'; return; }
        videoData = data.data;

        if (relatedRes && relatedRes.ok) {
          try { relatedData = (await relatedRes.json()).data || []; } catch {}
        }
      }

      video = videoData;

      // 解析播放源
      playSources = parsePlaySources(video.play_sources || []);

      addToHistory({
        vod_id: video.vod_id, title: video.title, cover: video.cover,
        category: video.category, vod_year: video.vod_year, vod_area: video.vod_area
      });
      favorited = isFavorite(video.vod_id);

      if (relatedData) {
        relatedVideos = relatedData;
      }

      // 检查播放源
      if (playSources.length === 0) {
        errorMsg = '暂无可用播放源';
        loading = false;
        return;
      }

      // 立即播放
      const url = playSources[0].url;
      prefetchStreamDomain(url);
      startPlayback(url);
    } catch (e: any) {
      errorMsg = e.name === 'TimeoutError' ? '请求超时，请重试' : '网络错误，请稍后重试';
    } finally {
      loading = false;
    }
  }

  // 解析播放源（支持多种格式）
  function parsePlaySources(sources: Array<{ url: string; duration: number }>): PlaySource[] {
    const result: PlaySource[] = [];
    
    sources.forEach((s, i) => {
      const url = s.url?.trim();
      if (!url) return;

      // 格式1: 多集格式 name$url#name$url#
      if (url.includes('$') && url.includes('#')) {
        const episodes = url.split('#');
        episodes.forEach((ep, epIdx) => {
          const match = ep.match(/(.+?)\$(.+)/);
          if (match && match[2]) {
            result.push({
              id: `ep${epIdx}`,
              name: match[1] || `第${epIdx + 1}集`,
              url: match[2].trim(),
              duration: s.duration || 0,
            });
          }
        });
      }
      // 格式2: 单集格式 name$url
      else if (url.includes('$')) {
        const match = url.match(/(.+?)\$(.+)/);
        if (match && match[2]) {
          result.push({
            id: `source-${i}`,
            name: match[1] || `线路${i + 1}`,
            url: match[2].trim(),
            duration: s.duration || 0,
          });
        }
      }
      // 格式3: 纯URL
      else {
        result.push({
          id: `source-${i}`,
          name: `线路${i + 1}`,
          url: url,
          duration: s.duration || 0,
        });
      }
    });

    return result;
  }

  // 直接启动播放（带错误处理）
  function startPlayback(url: string) {
    if (!videoEl) return;
    destroyPlayer();
    playerLoading = true;

    // 绑定错误处理（只绑定一次）
    bindVideoErrorHandler();

    // 绑定播放进度保存
    bindProgressTracker();

    if (url.includes('.m3u8')) {
      playHls(videoEl, url);
    } else {
      playNative(videoEl, url);
    }
  }

  // 绑定播放进度追踪
  function bindProgressTracker() {
    if (!videoEl) return;
    const onTimeUpdate = () => {
      if (!videoEl || !video) return;
      const currentTime = videoEl.currentTime;
      const duration = videoEl.duration || 0;
      if (duration > 0 && currentTime > 0) {
        updateHistoryProgress(video.vod_id, currentTime, duration);
      }
    };
    videoEl.addEventListener('timeupdate', onTimeUpdate);
    // 存储清理函数
    videoEl._progressCleanup = () => videoEl.removeEventListener('timeupdate', onTimeUpdate);
  }

  // 原生视频播放（非m3u8）
  function playNative(videoEl: HTMLVideoElement, url: string) {
    videoEl.src = url;
    
    // 监听加载成功
    const onCanPlay = () => {
      playerLoading = false;
      videoEl.play().catch(() => {});
      cleanup();
    };

    // 监听错误
    const onError = () => {
      playerLoading = false;
      const nextIdx = currentSourceIndex + 1;
      if (nextIdx < playSources.length) {
        // 自动切换下一条线路
        playSource(nextIdx);
      } else {
        errorMsg = '当前线路无法播放，请稍后重试';
      }
      cleanup();
    };

    const cleanup = () => {
      videoEl.removeEventListener('canplay', onCanPlay);
      videoEl.removeEventListener('error', onError);
    };

    videoEl.addEventListener('canplay', onCanPlay, { once: true });
    videoEl.addEventListener('error', onError, { once: true });
    videoEl.load();
  }

  // 绑定视频错误处理器（全局）
  function bindVideoErrorHandler() {
    if (!videoEl) return;
    // 清除之前的错误处理器，避免重复
    videoEl.onerror = null;
  }

  async function playSource(index: number) {
    currentSourceIndex = index;
    const source = playSources[index];
    if (!source) return;

    if (!videoEl) return;

    destroyPlayer();
    playerLoading = true;
    errorMsg = ''; // 清除之前的错误

    if (source.url.includes('.m3u8')) {
      await playHls(videoEl, source.url);
    } else {
      playNative(videoEl, source.url);
    }
  }

  async function playHls(videoEl: HTMLVideoElement, url: string) {
    try {
      const canNative = videoEl.canPlayType('application/vnd.apple.mpegurl');
      if (canNative) {
        // Safari原生HLS
        playNative(videoEl, url);
        return;
      }

      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        hlsPlayer = new Hls({
          // ===== 核心性能配置（参考官方demo最佳实践） =====
          enableWorker: true,              // Web Worker 解析（不阻塞主线程）
          lowLatencyMode: false,           // 禁用低延迟模式，允许更长的预缓存
          
          // ===== 首帧极速配置 =====
          maxBufferLength: 1.5,            // 首帧只需1.5秒即可播放（从3秒降低）
          maxMaxBufferLength: 600,         // 最大预缓存600秒（10分钟，保证不卡）
          maxBufferSize: 200 * 1000 * 1000,// 最大缓冲200MB
          maxBufferHole: 0.5,
          backBufferLength: 90,            // 保留90秒回放缓冲（seek不重新加载）
          
          // ===== ABR自动画质（参考官方demo） =====
          startLevel: -1,                  // 自动选择起始画质
          abrEwmaDefaultEstimate: 1000000, // 初始带宽估算1Mbps（从500kbps提高，更快选择高质量）
          abrBandWidthFactor: 0.95,        // 带宽安全系数
          abrMaxWithRealBitrate: true,     // 使用真实码率估算
          startFragPrefetch: true,         // 预取第一个片段
          progressive: true,               // 渐进式加载
          
          // ===== 自动恢复（参考官方demo） =====
          autoRecoverError: true,
          stopOnStall: false,
          
          // ===== 超时配置（更激进，快速失败重试） =====
          fragLoadingTimeOut: 15000,       // 片段加载超时15秒
          manifestLoadingTimeOut: 5000,    // 清单加载超时5秒（从10秒降低）
          levelLoadingTimeOut: 5000,       // 画质列表加载超时5秒
          
          // ===== 重试配置 =====
          fragLoadingMaxRetry: 3,
          manifestLoadingMaxRetry: 2,
          levelLoadingMaxRetry: 2,
          fragLoadingRetryDelay: 300,
          manifestLoadingRetryDelay: 300,
          levelLoadingRetryDelay: 300,
          
          // ===== 禁用非核心功能（减少开销） =====
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
          playerLoading = false;
          videoEl.play().catch(() => {});
        });

        hlsPlayer.on(Hls.Events.ERROR, (_event: any, data: any) => {
          if (!data.fatal) return;
          playerLoading = false;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hlsPlayer?.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hlsPlayer?.recoverMediaError();
          } else {
            const nextIdx = currentSourceIndex + 1;
            if (nextIdx < playSources.length) playSource(nextIdx);
            else errorMsg = '所有线路均无法播放，请稍后重试';
          }
        });

        hlsPlayer.attachMedia(videoEl);
        hlsPlayer.loadSource(url);
      } else {
        playerLoading = false;
        errorMsg = '浏览器不支持播放，请尝试其他浏览器';
      }
    } catch {
      playerLoading = false;
      errorMsg = '播放器加载失败';
    }
  }

  function destroyPlayer() {
    flushProgress();
    if (hlsPlayer) { hlsPlayer.destroy(); hlsPlayer = null; }
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    }
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
    {/if}

    <!-- 播放器：始终在DOM中，不被loading状态隐藏 -->
    <div class="aspect-video bg-black relative">
      <video bind:this={videoEl} controls playsinline preload="metadata" class="w-full h-full" poster={video?.cover}>
        您的浏览器不支持视频播放
      </video>
      {#if playerLoading}
        <div class="absolute inset-0 flex items-center justify-center bg-black/50">
          <div class="flex flex-col items-center gap-2">
            <div class="w-10 h-10 border-3 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
            <span class="text-white text-sm">加载播放器...</span>
          </div>
        </div>
      {/if}
    </div>

    {#if video}
      <!-- 视频信息 -->
      <article class="p-3 bg-white">
        <h1 class="text-lg font-bold mb-2">{video.title}</h1>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mb-2">
          {#if video.category}<span>{video.category}</span>{/if}
          {#if video.vod_year}<span>{video.vod_year}</span>{/if}
          {#if video.vod_area}<span>{video.vod_area}</span>{/if}
          {#if video.vod_lang}<span>{video.vod_lang}</span>{/if}
        </div>
        {#if video.vod_actor}
          <div class="text-sm text-gray-600 mb-2">
            <span class="text-gray-400">演员：</span>{video.vod_actor}
          </div>
        {/if}
        {#if video.vod_director}
          <div class="text-sm text-gray-600 mb-2">
            <span class="text-gray-400">导演：</span>{video.vod_director}
          </div>
        {/if}
        {#if video.vod_remarks}
          <div class="text-sm text-pink-500 mb-2">{video.vod_remarks}</div>
        {/if}
      </article>

      <!-- 播放源选择 -->
      {#if playSources.length > 0}
        <section class="p-3 bg-white mt-2">
          <h2 class="text-sm font-medium text-gray-700 mb-2">播放线路</h2>
          <div class="flex flex-wrap gap-2">
            {#each playSources as source, i}
              <button
                onclick={() => playSource(i)}
                class="px-3 py-1.5 text-sm rounded-lg border transition-colors {i === currentSourceIndex ? 'bg-pink-500 text-white border-pink-500' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-pink-300'}"
              >
                {source.name}
                {#if source.duration > 0}
                  <span class="text-xs opacity-70 ml-1">{formatDuration(source.duration)}</span>
                {/if}
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 操作按钮 -->
      <section class="p-3 bg-white mt-2 flex gap-3">
        <button
          onclick={() => {
            if (favorited) {
              removeFavorite(video.vod_id);
              favorited = false;
            } else {
              addFavorite({ vod_id: video.vod_id, title: video.title, cover: video.cover, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area });
              favorited = true;
            }
          }}
          class="flex-1 py-2 text-sm rounded-lg border {favorited ? 'bg-pink-50 text-pink-500 border-pink-200' : 'bg-gray-50 text-gray-600 border-gray-200'}"
        >
          {favorited ? '♡ 已收藏' : '♡ 收藏'}
        </button>
        <a href="/history" class="flex-1 py-2 text-sm text-center rounded-lg border bg-gray-50 text-gray-600 border-gray-200">
          🕐 历史
        </a>
      </section>

      <!-- 相关推荐 -->
      {#if relatedVideos.length > 0}
        <section class="p-3 bg-white mt-2">
          <h2 class="text-sm font-medium text-gray-700 mb-2">相关推荐</h2>
          <div class="grid grid-cols-3 gap-2">
            {#each relatedVideos.slice(0, 6) as rv}
              <VideoCard {rv} />
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </main>

  <NavBar />
</div>
