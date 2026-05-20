<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import NavBar from '$components/NavBar.svelte';
  import type { Video } from '$lib/types';
  import Hls from 'hls.js';
  import {
    generateSEODescription,
    generateSEOKeywords,
    generateTags,
    generateRelatedSearches,
    generatePageTitle,
    generateVideoSchema,
    generateBreadcrumbSchema,
    canonicalUrl
  } from '$lib/seo';
  import Breadcrumb from '$components/Breadcrumb.svelte';
  import Comments from '$components/Comments.svelte';
  import { isFavorite, addFavorite, removeFavorite, addToHistory } from '$lib/storage';

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
  let isFav = $state(false);
  let hlsInstance: Hls | null = null;
  let videoEl: HTMLVideoElement;

  let vodId = $derived($page.params.id);
  let currentEpisode = $derived(playLines[currentLineIndex]?.episodes[currentEpisodeIndex]);

  onMount(async () => {
    if (!vodId) return;
    await loadVideo();
  });

  onDestroy(() => {
    destroyHls();
  });

  async function loadVideo() {
    loading = true;
    errorMsg = '';
    try {
      const res = await fetch('/api/video/' + vodId, {
        signal: AbortSignal.timeout(10000)
      });
      
      if (!res.ok) {
        errorMsg = '请求失败 (' + res.status + ')';
        return;
      }
      
      const data = await res.json();

      if (data.success && data.data) {
        video = data.data;
        playLines = parsePlayUrl(video.play_url);
        isFav = isFavorite(video.vod_id);
        
        // 添加到历史记录
        addToHistory({
          vod_id: video.vod_id,
          title: video.title,
          cover: video.cover,
          category: video.category,
          vod_year: video.vod_year,
          vod_area: video.vod_area
        });
        
        // 自动播放第一集
        if (playLines.length > 0 && playLines[0].episodes.length > 0) {
          setTimeout(() => playEpisode(0, 0), 100);
        }
      } else {
        errorMsg = data.message || '视频不存在';
      }
    } catch (e: any) {
      errorMsg = '网络错误，请稍后重试';
      console.error('loadVideo error:', e);
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
      items.forEach((item) => {
        const dollarIdx = item.indexOf('$');
        if (dollarIdx > 0) {
          episodes.push({
            name: item.substring(0, dollarIdx),
            url: item.substring(dollarIdx + 1)
          });
        } else if (item.includes('http')) {
          episodes.push({ name: '第' + (episodes.length + 1) + '集', url: item });
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
    if (url.includes('.m3u8') && Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true
      });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoEl);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        videoEl.play().catch(() => {});
      });
      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('HLS fatal error:', data);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('网络错误，尝试恢复...');
              hlsInstance?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('媒体错误，尝试恢复...');
              hlsInstance?.recoverMediaError();
              break;
            default:
              destroyHls();
              break;
          }
        }
      });
    } else if (url.includes('.m3u8') && videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari 原生 HLS
      videoEl.src = url;
      videoEl.play().catch(() => {});
    } else {
      videoEl.src = url;
      videoEl.play().catch(() => {});
    }
  }

  function onVideoEnded() {
    const currentLine = playLines[currentLineIndex];
    if (currentLine && currentEpisodeIndex < currentLine.episodes.length - 1) {
      playEpisode(currentLineIndex, currentEpisodeIndex + 1);
    }
  }

  function toggleFavorite() {
    if (!video) return;
    if (isFav) {
      removeFavorite(video.vod_id);
    } else {
      addFavorite({
        vod_id: video.vod_id,
        title: video.title,
        cover: video.cover,
        category: video.category,
        vod_year: video.vod_year,
        vod_area: video.vod_area
      });
    }
    isFav = !isFav;
  }

  function retryLoad() {
    loadVideo();
  }
</script>

<svelte:head>
  {#if video}
    <title>{generatePageTitle({
      title: video.title,
      category: video.category,
      vod_year: video.vod_year,
      vod_area: video.vod_area,
      vod_actor: video.vod_actor,
      vod_director: video.vod_director,
      vod_lang: video.vod_lang
    })}</title>
    <meta name="description" content={generateSEODescription({
      title: video.title,
      category: video.category,
      vod_year: video.vod_year,
      vod_area: video.vod_area,
      vod_actor: video.vod_actor,
      vod_director: video.vod_director,
      vod_lang: video.vod_lang
    })} />
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
    <meta property="og:description" content={generateSEODescription({
      title: video.title, category: video.category, vod_year: video.vod_year,
      vod_area: video.vod_area, vod_actor: video.vod_actor, vod_director: video.vod_director, vod_lang: video.vod_lang
    })} />
    <meta property="og:image" content={video.cover} />
    <meta property="og:type" content="video.movie" />
    <meta property="og:url" content={canonicalUrl(`/v/${video.vod_id}`)} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={video.title} />
    <meta name="twitter:image" content={video.cover} />
    {@html `<script type="application/ld+json">${JSON.stringify(generateVideoSchema({
      title: video.title, category: video.category, vod_year: video.vod_year,
      vod_area: video.vod_area, vod_actor: video.vod_actor, vod_director: video.vod_director,
      vod_lang: video.vod_lang, cover: video.cover, play_url: video.play_url, vod_id: video.vod_id
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
      <Breadcrumb items={[
        { name: '首页', url: '/' },
        { name: video.category || '分类', url: '/category' },
        { name: video.title }
      ]} />

      <!-- 播放器 -->
      <div class="aspect-video bg-black relative">
        <video
          bind:this={videoEl}
          controls
          autoplay
          playsinline
          class="w-full h-full"
          poster={video.cover}
          onended={onVideoEnded}
        >
          您的浏览器不支持视频播放
        </video>
      </div>

      <!-- 当前播放信息 -->
      {#if currentEpisode}
        <div class="px-3 py-2 bg-white border-b border-gray-100">
          <div class="text-sm text-gray-500">
            正在播放: {playLines[currentLineIndex]?.name} - {currentEpisode.name}
          </div>
        </div>
      {/if}

      <!-- 视频信息 -->
      <div class="p-3 bg-white">
        <div class="flex items-start justify-between gap-2 mb-2">
          <h2 class="text-lg font-bold text-gray-800 flex-1">{video.title}</h2>
          <button 
            onclick={toggleFavorite}
            class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full {isFav ? 'bg-pink-100 text-pink-500' : 'bg-gray-100 text-gray-400'} transition-colors"
            title={isFav ? '取消收藏' : '收藏'}
          >
            <svg class="w-5 h-5" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>
        </div>
        <div class="flex items-center gap-4 text-sm text-gray-500 mb-3">
          {#if video.category}
            <span>{video.category}</span>
          {/if}
          {#if video.views}
            <span>{video.views}次观看</span>
          {/if}
        </div>
      </div>

      <!-- 线路选择 -->
      {#if playLines.length > 1}
        <div class="mt-2 bg-white p-3">
          <h3 class="font-medium text-gray-800 mb-2">播放线路</h3>
          <div class="flex gap-2 flex-wrap">
            {#each playLines as line, idx}
              <button
                onclick={() => playEpisode(idx, 0)}
                class="px-3 py-1.5 text-sm rounded {currentLineIndex === idx
                  ? 'bg-pink-500 text-white'
                  : 'bg-gray-100 text-gray-700'}"
              >
                {line.name}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 选集 -->
      {#if playLines.length > 0}
        <div class="mt-2 bg-white p-3">
          <h3 class="font-medium text-gray-800 mb-2">
            选集 ({playLines[currentLineIndex]?.episodes.length || 0}集)
          </h3>
          <div class="flex gap-2 overflow-x-auto pb-2">
            {#each playLines[currentLineIndex]?.episodes || [] as ep, idx}
              <button
                onclick={() => playEpisode(currentLineIndex, idx)}
                class="flex-shrink-0 px-3 py-1.5 text-sm rounded {currentEpisodeIndex === idx
                  ? 'bg-pink-500 text-white'
                  : 'bg-gray-100 text-gray-700'}"
              >
                {ep.name}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 相关信息 -->
      {#if video.vod_year || video.vod_area || video.vod_director}
        <div class="mt-2 bg-white p-3 text-sm">
          {#if video.vod_year}
            <div class="mb-1"><span class="text-gray-500">年份：</span>{video.vod_year}</div>
          {/if}
          {#if video.vod_area}
            <div class="mb-1"><span class="text-gray-500">地区：</span>{video.vod_area}</div>
          {/if}
          {#if video.vod_director}
            <div class="mb-1"><span class="text-gray-500">导演：</span>{video.vod_director}</div>
          {/if}
          {#if video.vod_actor}
            <div><span class="text-gray-500">演员：</span>{video.vod_actor}</div>
          {/if}
        </div>
      {/if}

      <!-- TAG标签 -->
      {#if video}
        {@const tags = generateTags({
          title: video.title, category: video.category, vod_year: video.vod_year,
          vod_area: video.vod_area, vod_actor: video.vod_actor, vod_director: video.vod_director, vod_lang: video.vod_lang
        })}
        {#if tags.length > 0}
          <div class="mt-2 bg-white p-3">
            <h3 class="font-medium text-gray-800 mb-2">相关标签</h3>
            <div class="flex flex-wrap gap-2">
              {#each tags as tag}
                <a href="/tag/{encodeURIComponent(tag)}" class="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-pink-100 hover:text-pink-600 transition-colors">
                  {tag}
                </a>
              {/each}
            </div>
          </div>
        {/if}
      {/if}

      <!-- 相关搜索 -->
      {#if video}
        {@const relatedSearches = generateRelatedSearches({
          title: video.title, category: video.category, vod_year: video.vod_year,
          vod_area: video.vod_area, vod_actor: video.vod_actor, vod_director: video.vod_director, vod_lang: video.vod_lang
        })}
        {#if relatedSearches.length > 0}
          <div class="mt-2 bg-white p-3">
            <h3 class="font-medium text-gray-800 mb-2">相关搜索</h3>
            <div class="flex flex-wrap gap-2">
              {#each relatedSearches as keyword}
                <a href="/search/{encodeURIComponent(keyword)}/1" class="px-3 py-1 text-xs bg-pink-50 text-pink-600 rounded-full hover:bg-pink-100 transition-colors">
                  {keyword}
                </a>
              {/each}
            </div>
          </div>
        {/if}
      {/if}

      <!-- 用户评论（静态注入，提升文本密度） -->
      {#if video}
        <Comments videoId={video.vod_id} title={video.title} />
      {/if}
    {/if}
  </main>

  <NavBar />
</div>
