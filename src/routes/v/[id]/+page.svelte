<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import NavBar from '$components/NavBar.svelte';
  import type { Video } from '$lib/types';
  import Hls from 'hls.js';
  import {
    generateSEODescription,
    generateSEOKeywords,
    generatePageTitle,
    generateVideoSchema,
    generateBreadcrumbSchema,
    canonicalUrl
  } from '$lib/seo';
  import { addToHistory } from '$lib/storage';

  // 动态导入非关键组件
  const Breadcrumb = $derived(import('$components/Breadcrumb.svelte'));
  const Comments = $derived(import('$components/Comments.svelte'));

  interface PlayLine {
    name: string;
    episodes: { name: string; url: string }[];
  }

  let video = $state<Video | null>(null);
  let loading = $state(true);
  let errorMsg = $state('');
  let playLines = $state<PlayLine[]>([]);
  let currentLineIndex = $state(0);
  let currentEpisodeIndex = $state(0);
  let hlsInstance: Hls | null = null;
  let videoEl = $state<HTMLVideoElement | null>(null);
  let showPlayButton = $state(false);
  let isPlaying = $state(false);
  let hasAttemptedPlay = $state(false);

  let vodId = $derived($page.params.id);
  let currentEpisode = $derived(playLines[currentLineIndex]?.episodes[currentEpisodeIndex]);

  onMount(async () => {
    if (!vodId) return;
    // 并行加载视频数据和预加载HLS
    await Promise.all([
      loadVideo(),
      preloadHls()
    ]);
  });

  onDestroy(() => {
    destroyHls();
  });

  // 预加载HLS配置
  async function preloadHls() {
    // HLS.js 已经通过import加载，这里可以添加额外的预加载逻辑
  }

  // 监听 videoEl 和 playLines 变化，自动播放
  $effect(() => {
    const el = videoEl;
    const lines = playLines;
    
    if (el && lines.length > 0 && !hasAttemptedPlay) {
      hasAttemptedPlay = true;
      // 使用 requestAnimationFrame 确保 DOM 更新完成
      requestAnimationFrame(() => playEpisode(0, 0));
    }
  });

  async function loadVideo() {
    loading = true;
    errorMsg = '';
    hasAttemptedPlay = false;
    
    try {
      // 使用 AbortController 控制超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const res = await fetch('/api/video/' + vodId, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        errorMsg = '请求失败 (' + res.status + ')';
        return;
      }
      
      const data = await res.json();

      if (data.success && data.data) {
        video = data.data;
        playLines = parsePlayUrl(video.play_url);
        
        // 异步添加到历史记录，不阻塞播放
        setTimeout(() => {
          addToHistory({
            vod_id: video!.vod_id,
            title: video!.title,
            cover: video!.cover,
            category: video!.category,
            vod_year: video!.vod_year,
            vod_area: video!.vod_area
          });
        }, 0);
      } else {
        errorMsg = data.message || '视频不存在';
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        errorMsg = '请求超时，请重试';
      } else {
        errorMsg = '网络错误，请稍后重试';
      }
    } finally {
      loading = false;
    }
  }

  function parsePlayUrl(playUrl: string | undefined): PlayLine[] {
    if (!playUrl) return [];
    const lines: PlayLine[] = [];
    const lineGroups = playUrl.split('$$$');
    
    lineGroups.forEach((group, idx) => {
      const episodes: { name: string; url: string }[] = [];
      const items = group.split('#');
      
      items.forEach((item, itemIdx) => {
        const trimmed = item.trim();
        if (!trimmed) return;
        
        const dollarIdx = trimmed.indexOf('$');
        if (dollarIdx > 0) {
          episodes.push({
            name: trimmed.substring(0, dollarIdx),
            url: trimmed.substring(dollarIdx + 1)
          });
        } else if (trimmed.startsWith('http')) {
          episodes.push({ 
            name: '第' + (itemIdx + 1) + '集', 
            url: trimmed 
          });
        }
      });
      
      if (episodes.length > 0) {
        lines.push({
          name: lineGroups.length > 1 ? '线路' + (idx + 1) : '默认线路',
          episodes
        });
      }
    });
    
    return lines;
  }

  function destroyHls() {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
  }

  function playEpisode(lineIdx: number, episodeIdx: number) {
    currentLineIndex = lineIdx;
    currentEpisodeIndex = episodeIdx;
    
    const episode = playLines[lineIdx]?.episodes[episodeIdx];
    if (!episode || !videoEl) return;

    destroyHls();

    const url = episode.url;
    
    if (url.includes('.m3u8')) {
      if (Hls.isSupported()) {
        try {
          // 优化HLS配置，加快起播速度
          hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            maxBufferLength: 10,        // 减少初始缓冲时间
            maxMaxBufferLength: 30,
            startLevel: -1,             // 自动选择开始级别
            abrEwmaDefaultEstimate: 500000,  // 默认带宽估计
            fragLoadingMaxRetry: 2,
            manifestLoadingMaxRetry: 2,
            levelLoadingMaxRetry: 2
          });
          
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            if (videoEl) {
              videoEl.muted = true;
              videoEl.play().then(() => {
                isPlaying = true;
                showPlayButton = false;
                // 延迟取消静音
                setTimeout(() => {
                  if (videoEl) videoEl.muted = false;
                }, 2000);
              }).catch(() => {
                showPlayButton = true;
              });
            }
          });
          
          hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hlsInstance?.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hlsInstance?.recoverMediaError();
                  break;
                default:
                  if (lineIdx < playLines.length - 1) {
                    playEpisode(lineIdx + 1, 0);
                  } else {
                    errorMsg = '视频加载失败';
                  }
                  break;
              }
            }
          });
          
          hlsInstance.attachMedia(videoEl);
          hlsInstance.loadSource(url);
          
        } catch (e) {
          console.error('HLS init error:', e);
          errorMsg = '播放器初始化失败';
        }
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url;
        videoEl.play().catch(() => showPlayButton = true);
      } else {
        errorMsg = '浏览器不支持 HLS 播放';
      }
    } else {
      videoEl.src = url;
      videoEl.play().catch(() => showPlayButton = true);
    }
  }

  function onVideoEnded() {
    const currentLine = playLines[currentLineIndex];
    if (currentLine && currentEpisodeIndex < currentLine.episodes.length - 1) {
      playEpisode(currentLineIndex, currentEpisodeIndex + 1);
    }
  }

  function retryLoad() {
    loadVideo();
  }

  // 生成标签（简化版）
  function generateSimpleTags(video: Video): string[] {
    const tags: string[] = [];
    if (video.title) tags.push(video.title);
    if (video.category) tags.push(video.category);
    if (video.vod_year) tags.push(String(video.vod_year));
    if (video.vod_area) tags.push(video.vod_area);
    return tags.slice(0, 5);
  }
</script>

<svelte:head>
  {#if video}
    <title>{generatePageTitle({
      title: video.title,
      category: video.category,
      vod_year: video.vod_year,
      vod_area: video.vod_area
    })}</title>
    <meta name="description" content={generateSEODescription({
      title: video.title, category: video.category, vod_year: video.vod_year,
      vod_area: video.vod_area
    })} />
    <meta name="keywords" content={generateSEOKeywords({
      title: video.title, category: video.category
    }).join(',')} />
    <link rel="canonical" href={canonicalUrl(`/v/${video.vod_id}`)} />
    <meta property="og:title" content={video.title} />
    <meta property="og:description" content={generateSEODescription({
      title: video.title, category: video.category
    })} />
    <meta property="og:image" content={video.cover} />
    <meta property="og:type" content="video.movie" />
    <meta property="og:url" content={canonicalUrl(`/v/${video.vod_id}`)} />
    {@html `<script type="application/ld+json">${JSON.stringify(generateVideoSchema({
      title: video.title, category: video.category, vod_year: video.vod_year,
      vod_area: video.vod_area, cover: video.cover, play_url: video.play_url, vod_id: video.vod_id
    }))}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(generateBreadcrumbSchema([
      { name: '首页', url: 'https://evideos.pages.dev/' },
      { name: video.category || '视频', url: 'https://evideos.pages.dev/category/全部/1' },
      { name: video.title, url: `https://evideos.pages.dev/v/${video.vod_id}` }
    ]))}</script>`}
  {:else}
    <title>视频详情 - 必爱必爱</title>
  {/if}
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50 flex items-center gap-2">
    <a href="/" class="text-gray-600">←</a>
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
        <svg class="w-16 h-16 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p class="text-red-500 text-sm mb-4">{errorMsg}</p>
        <button onclick={retryLoad} class="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg hover:bg-pink-600 transition-colors">
          重新加载
        </button>
      </div>
    {:else if video}
      <!-- 播放器 -->
      <div class="aspect-video bg-black relative">
        <video
          bind:this={videoEl}
          controls
          playsinline
          preload="auto"
          class="w-full h-full"
          poster={video.cover}
          onended={onVideoEnded}
        >
          您的浏览器不支持视频播放
        </video>
        
        {#if showPlayButton && !isPlaying}
          <div class="absolute inset-0 flex items-center justify-center bg-black/50 cursor-pointer" 
               role="button" 
               tabindex="0"
               onclick={() => {
                 if (videoEl) {
                   videoEl.muted = false;
                   videoEl.play().then(() => {
                     isPlaying = true;
                     showPlayButton = false;
                   }).catch(() => {});
                 }
               }}
               onkeydown={(e) => e.key === 'Enter' && e.currentTarget.click()}>
            <div class="w-20 h-20 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
              <svg class="w-10 h-10 text-pink-500 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        {/if}
      </div>

      {#if currentEpisode}
        <div class="px-3 py-2 bg-white border-b border-gray-100">
          <div class="text-sm text-gray-500">
            正在播放: {playLines[currentLineIndex]?.name} - {currentEpisode.name}
          </div>
        </div>
      {/if}

      <!-- 视频信息 -->
      <div class="p-3 bg-white">
        <h2 class="text-lg font-bold text-gray-800 mb-2">{video.title}</h2>
        <div class="flex items-center gap-4 text-sm text-gray-500">
          {#if video.category}
            <span>{video.category}</span>
          {/if}
          {#if video.vod_year}
            <span>{video.vod_year}</span>
          {/if}
        </div>
      </div>

      <!-- 选集 -->
      {#if playLines.length > 0}
        <div class="mt-2 bg-white p-3">
          <h3 class="font-medium text-gray-800 mb-2">选集</h3>
          <div class="flex gap-2 overflow-x-auto pb-2">
            {#each playLines[currentLineIndex]?.episodes || [] as ep, idx}
              <button
                onclick={() => playEpisode(currentLineIndex, idx)}
                class="flex-shrink-0 px-3 py-1.5 text-sm rounded {currentEpisodeIndex === idx ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-700'}">
                {ep.name}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 线路选择 -->
      {#if playLines.length > 1}
        <div class="mt-2 bg-white p-3">
          <h3 class="font-medium text-gray-800 mb-2">播放线路</h3>
          <div class="flex gap-2 flex-wrap">
            {#each playLines as line, idx}
              <button
                onclick={() => playEpisode(idx, 0)}
                class="px-3 py-1.5 text-sm rounded {currentLineIndex === idx ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-700'}">
                {line.name}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 相关信息 -->
      {#if video.vod_director || video.vod_actor}
        <div class="mt-2 bg-white p-3 text-sm">
          {#if video.vod_director}
            <div class="mb-1"><span class="text-gray-500">导演：</span>{video.vod_director}</div>
          {/if}
          {#if video.vod_actor}
            <div><span class="text-gray-500">演员：</span>{video.vod_actor}</div>
          {/if}
        </div>
      {/if}
    {/if}
  </main>

  <NavBar />
</div>
