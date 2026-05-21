<script lang="ts">
  import { onMount } from 'svelte';
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
    generateOrganizationSchema,
    generateWebPageSchema,
    canonicalUrl,
    SITE_URL,
    SITE_NAME
  } from '$lib/seo';
  import { addToHistory } from '$lib/storage';

  interface PlayLine {
    name: string;
    episodes: { name: string; url: string }[];
  }

  // 状态
  let video = $state<Video | null>(null);
  let loading = $state(true);
  let errorMsg = $state('');
  let playLines = $state<PlayLine[]>([]);
  let currentLineIndex = $state(0);
  let currentEpisodeIndex = $state(0);
  let hlsInstance: Hls | null = null;
  let videoEl: HTMLVideoElement | null = null;
  let showPlayButton = $state(false);
  let isPlaying = $state(false);
  let isLoadingVideo = false;

  let vodId = $derived($page.params.id);

  // 派生状态
  let currentEpisode = $derived(playLines[currentLineIndex]?.episodes[currentEpisodeIndex]);

  onMount(() => {
    // 等待 DOM 准备好
    setTimeout(() => {
      loadVideo();
    }, 50);
  });

  // 页面可见性变化时重新加载
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && !loading && !video) {
      loadVideo();
    }
  }

  async function loadVideo() {
    // 防止重复加载
    if (isLoadingVideo) return;
    if (video && video.vod_id === vodId) return;
    
    isLoadingVideo = true;
    loading = true;
    errorMsg = '';
    playLines = [];
    currentLineIndex = 0;
    currentEpisodeIndex = 0;
    isPlaying = false;
    showPlayButton = false;
    destroyHls();
    
    console.log('Loading video:', vodId);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch('/api/video/' + vodId, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        errorMsg = '请求失败 (' + res.status + ')';
        loading = false;
        isLoadingVideo = false;
        return;
      }
      
      const data = await res.json();

      if (data.success && data.data) {
        video = data.data;
        playLines = parsePlayUrl(video.play_url);
        console.log('Video loaded, playLines:', playLines.length);
        
        // 添加到历史记录
        addToHistory({
          vod_id: video.vod_id,
          title: video.title,
          cover: video.cover,
          category: video.category,
          vod_year: video.vod_year,
          vod_area: video.vod_area
        });
        
        // 延迟播放
        setTimeout(() => {
          startPlayback();
        }, 100);
      } else {
        errorMsg = data.message || '视频不存在';
      }
    } catch (e: any) {
      console.error('Load error:', e);
      if (e.name === 'AbortError') {
        errorMsg = '请求超时，请重试';
      } else {
        errorMsg = '网络错误，请稍后重试';
      }
    } finally {
      loading = false;
      isLoadingVideo = false;
    }
  }

  function startPlayback() {
    // 确保 videoEl 已绑定
    const el = document.querySelector('video');
    if (!el) {
      console.log('Video element not found, retrying...');
      setTimeout(startPlayback, 100);
      return;
    }
    videoEl = el;
    
    if (playLines.length > 0) {
      playEpisode(0, 0);
    }
  }

  function parsePlayUrl(playUrl: string | undefined): PlayLine[] {
    if (!playUrl) {
      console.log('No play_url provided');
      return [];
    }
    
    const lines: PlayLine[] = [];
    const lineGroups = playUrl.split('$$$');
    console.log('Parsing play_url, groups:', lineGroups.length);
    
    for (let i = 0; i < lineGroups.length; i++) {
      const group = lineGroups[i];
      const episodes: { name: string; url: string }[] = [];
      const items = group.split('#');
      
      for (let j = 0; j < items.length; j++) {
        const item = items[j].trim();
        if (!item) continue;
        
        // 支持 名称$URL 或直接URL
        const dollarIdx = item.indexOf('$');
        if (dollarIdx > 0) {
          episodes.push({
            name: item.substring(0, dollarIdx),
            url: item.substring(dollarIdx + 1)
          });
        } else if (item.startsWith('http')) {
          episodes.push({
            name: '第' + (j + 1) + '集',
            url: item
          });
        }
      }
      
      if (episodes.length > 0) {
        lines.push({
          name: lineGroups.length > 1 ? '线路' + (i + 1) : '默认线路',
          episodes
        });
      }
    }
    
    console.log('Parsed playLines:', lines.length, 'lines');
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
    if (!episode) {
      console.log('No episode found');
      return;
    }
    
    // 确保 videoEl 存在
    const el = videoEl || document.querySelector('video');
    if (!el) {
      console.log('Video element not ready');
      setTimeout(() => playEpisode(lineIdx, episodeIdx), 100);
      return;
    }
    videoEl = el;

    console.log('Playing:', episode.name, episode.url.substring(0, 50));
    destroyHls();

    const url = episode.url;
    
    if (url.includes('.m3u8')) {
      if (Hls.isSupported()) {
        try {
          hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            maxBufferLength: 10,
            maxMaxBufferLength: 30
          });
          
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            if (videoEl) {
              videoEl.muted = true;
              videoEl.play().then(() => {
                isPlaying = true;
                showPlayButton = false;
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
          console.error('HLS error:', e);
          errorMsg = '播放器初始化失败';
        }
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = url;
        videoEl.play().catch(() => showPlayButton = true);
      } else {
        errorMsg = '浏览器不支持HLS';
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

  // 生成相关标签
  function generateTags(video: Video): string[] {
    const tags: string[] = [];
    if (video.title) tags.push(video.title);
    if (video.category) {
      tags.push(video.category);
      tags.push('热门' + video.category);
    }
    if (video.vod_year) tags.push(String(video.vod_year));
    if (video.vod_area) tags.push(video.vod_area);
    if (video.vod_actor) {
      video.vod_actor.split(/[,，]/).slice(0, 3).forEach(a => tags.push(a.trim()));
    }
    return [...new Set(tags)].slice(0, 12);
  }

  // 生成相关搜索
  function generateRelatedSearches(video: Video): string[] {
    const searches: string[] = [];
    if (video.title) {
      searches.push(video.title + '剧情介绍');
      searches.push(video.title + '在线观看');
    }
    if (video.vod_actor) {
      video.vod_actor.split(/[,，]/).slice(0, 2).forEach(a => {
        searches.push(a.trim() + '最新作品');
      });
    }
    if (video.category) {
      searches.push('最新' + video.category + '推荐');
    }
    return [...new Set(searches)].slice(0, 10);
  }

  // 生成面包屑
  function generateBreadcrumbs(video: Video) {
    return [
      { name: '首页', url: SITE_URL },
      { name: video.category || '视频', url: SITE_URL + '/category/' + encodeURIComponent(video.category || '全部') + '/1' },
      { name: video.title, url: SITE_URL + '/v/' + video.vod_id }
    ];
  }
</script>

<svelte:head>
  {#if video}
    <title>{generatePageTitle({ title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area })}</title>
    <meta name="description" content={generateSEODescription({ title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area, vod_actor: video.vod_actor, vod_director: video.vod_director })} />
    <meta name="keywords" content={generateSEOKeywords({ title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area, vod_actor: video.vod_actor, vod_director: video.vod_director, vod_lang: video.vod_lang }).join(',')} />
    <link rel="canonical" href={canonicalUrl(`/v/${video.vod_id}`)} />
    <meta property="og:title" content={video.title} />
    <meta property="og:description" content={generateSEODescription({ title: video.title, category: video.category })} />
    <meta property="og:image" content={video.cover} />
    <meta property="og:type" content="video.movie" />
    <meta property="og:url" content={canonicalUrl(`/v/${video.vod_id}`)} />
    {@html `<script type="application/ld+json">${JSON.stringify(generateVideoSchema({ title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area, vod_actor: video.vod_actor, vod_director: video.vod_director, vod_lang: video.vod_lang, cover: video.cover, play_url: video.play_url, vod_id: video.vod_id }))}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(generateBreadcrumbSchema(generateBreadcrumbs(video)))}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(generateOrganizationSchema())}</script>`}
    {@html `<script type="application/ld+json">${JSON.stringify(generateWebPageSchema({ title: generatePageTitle({ title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area }), description: generateSEODescription({ title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area }), url: canonicalUrl(`/v/${video.vod_id}`) }))}</script>`}
  {:else}
    <title>视频详情 - {SITE_NAME}</title>
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
        <p class="text-red-500 text-sm mb-4">{errorMsg}</p>
        <button onclick={retryLoad} class="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg">重新加载</button>
      </div>
    {:else if video}
      <!-- 面包屑 -->
      <nav class="bg-white px-3 py-2 text-sm">
        <ol class="flex items-center gap-1">
          {#each generateBreadcrumbs(video) as crumb, i}
            <li class="flex items-center">
              {#if i > 0}<span class="text-gray-400 mx-1">/</span>{/if}
              {#if i < generateBreadcrumbs(video).length - 1}
                <a href={crumb.url} class="text-pink-500 hover:underline">{crumb.name}</a>
              {:else}
                <span class="text-gray-600">{crumb.name}</span>
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
                 const el = document.querySelector('video');
                 if (el) {
                   el.muted = false;
                   el.play().then(() => {
                     isPlaying = true;
                     showPlayButton = false;
                   }).catch(() => {});
                 }
               }}>
            <div class="w-20 h-20 bg-white/90 rounded-full flex items-center justify-center">
              <svg class="w-10 h-10 text-pink-500 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        {/if}
      </div>

      {#if currentEpisode}
        <div class="px-3 py-2 bg-white border-b">
          <span class="text-sm text-gray-500">
            {playLines[currentLineIndex]?.name} - {currentEpisode.name}
          </span>
        </div>
      {/if}

      <!-- 信息 -->
      <div class="p-3 bg-white">
        <h2 class="text-lg font-bold mb-2">{video.title}</h2>
        <div class="flex gap-4 text-sm text-gray-500">
          {#if video.category}<span>{video.category}</span>{/if}
          {#if video.vod_year}<span>{video.vod_year}</span>{/if}
          {#if video.vod_area}<span>{video.vod_area}</span>{/if}
        </div>
      </div>

      <!-- 选集 -->
      {#if playLines.length > 0}
        <div class="mt-2 bg-white p-3">
          <h3 class="font-medium mb-2">选集 ({playLines[currentLineIndex]?.episodes.length || 0})</h3>
          <div class="flex gap-2 overflow-x-auto pb-2">
            {#each playLines[currentLineIndex]?.episodes || [] as ep, idx}
              <button
                onclick={() => playEpisode(currentLineIndex, idx)}
                class="flex-shrink-0 px-3 py-1.5 text-sm rounded {currentEpisodeIndex === idx ? 'bg-pink-500 text-white' : 'bg-gray-100'}">
                {ep.name}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 线路 -->
      {#if playLines.length > 1}
        <div class="mt-2 bg-white p-3">
          <h3 class="font-medium mb-2">播放线路</h3>
          <div class="flex gap-2 flex-wrap">
            {#each playLines as line, idx}
              <button
                onclick={() => playEpisode(idx, 0)}
                class="px-3 py-1.5 text-sm rounded {currentLineIndex === idx ? 'bg-pink-500 text-white' : 'bg-gray-100'}">
                {line.name}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 导演演员 -->
      {#if video.vod_director || video.vod_actor}
        <div class="mt-2 bg-white p-3 text-sm">
          {#if video.vod_director}<div class="mb-1"><span class="text-gray-500">导演：</span>{video.vod_director}</div>{/if}
          {#if video.vod_actor}<div><span class="text-gray-500">演员：</span>{video.vod_actor}</div>{/if}
        </div>
      {/if}

      <!-- 相关标签 -->
      {@const tags = generateTags(video)}
      {#if tags.length > 0}
        <div class="mt-2 bg-white p-3">
          <h3 class="font-medium mb-2">相关标签</h3>
          <div class="flex flex-wrap gap-2">
            {#each tags as tag}
              <a href="/tag/{encodeURIComponent(tag)}" class="px-3 py-1 text-xs bg-gray-100 rounded-full hover:bg-pink-100">
                {tag}
              </a>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 相关搜索 -->
      {@const searches = generateRelatedSearches(video)}
      {#if searches.length > 0}
        <div class="mt-2 bg-white p-3">
          <h3 class="font-medium mb-2">相关搜索</h3>
          <div class="flex flex-wrap gap-2">
            {#each searches as keyword}
              <a href="/search/{encodeURIComponent(keyword)}/1" class="px-3 py-1 text-xs bg-pink-50 text-pink-600 rounded-full">
                {keyword}
              </a>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 简介 -->
      {#if video.vod_content}
        <div class="mt-2 bg-white p-3">
          <h3 class="font-medium mb-2">剧情简介</h3>
          <p class="text-sm text-gray-600">{video.vod_content}</p>
        </div>
      {/if}
    {/if}
  </main>

  <NavBar />
</div>
