<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
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

  // 核心状态
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
  let pageUrl = $state('');

  // 派生状态
  let vodId = $derived($page.params.id);
  let currentEpisode = $derived(playLines[currentLineIndex]?.episodes[currentEpisodeIndex]);
  
  // SEO 相关派生
  let seoTitle = $derived(video ? generatePageTitle({
    title: video.title,
    category: video.category,
    vod_year: video.vod_year,
    vod_area: video.vod_area
  }) : '视频详情 - ' + SITE_NAME);
  
  let seoDescription = $derived(video ? generateSEODescription({
    title: video.title,
    category: video.category,
    vod_year: video.vod_year,
    vod_area: video.vod_area,
    vod_actor: video.vod_actor,
    vod_director: video.vod_director
  }) : '');
  
  let seoKeywords = $derived(video ? generateSEOKeywords({
    title: video.title,
    category: video.category,
    vod_year: video.vod_year,
    vod_area: video.vod_area,
    vod_actor: video.vod_actor,
    vod_director: video.vod_director,
    vod_lang: video.vod_lang
  }) : []);

  // 监听路由变化，重新加载
  $effect(() => {
    const currentVodId = $page.params.id;
    if (currentVodId && currentVodId !== video?.vod_id) {
      console.log('Route changed, reloading video:', currentVodId);
      resetState();
      loadVideo(currentVodId);
    }
  });

  onMount(() => {
    pageUrl = window.location.href;
    if (vodId) {
      resetState();
      loadVideo(vodId);
    }
  });

  onDestroy(() => {
    destroyHls();
  });

  function resetState() {
    console.log('Resetting state for new video');
    video = null;
    playLines = [];
    currentLineIndex = 0;
    currentEpisodeIndex = 0;
    showPlayButton = false;
    isPlaying = false;
    errorMsg = '';
    destroyHls();
  }

  async function loadVideo(id: string) {
    loading = true;
    console.log('Loading video:', id);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch('/api/video/' + id, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        errorMsg = '请求失败 (' + res.status + ')';
        loading = false;
        return;
      }
      
      const data = await res.json();

      if (data.success && data.data) {
        video = data.data;
        playLines = parsePlayUrl(video.play_url);
        console.log('Video loaded, playLines:', playLines.length);
        
        // 延迟播放，确保 DOM 已更新
        setTimeout(() => {
          console.log('Attempting to play, videoEl:', !!videoEl, 'playLines:', playLines.length);
          if (videoEl && playLines.length > 0) {
            playEpisode(0, 0);
          } else if (playLines.length > 0) {
            // videoEl 还没绑定，再等等
            setTimeout(() => {
              if (videoEl) playEpisode(0, 0);
            }, 200);
          }
        }, 100);
        
        // 异步添加到历史记录
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
      console.error('Load video error:', e);
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
    if (!episode || !videoEl) {
      console.log('Cannot play: missing episode or video element', { episode: !!episode, videoEl: !!videoEl });
      return;
    }

    console.log('Playing:', episode.name);
    destroyHls();

    const url = episode.url;
    
    if (url.includes('.m3u8')) {
      if (Hls.isSupported()) {
        try {
          hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            maxBufferLength: 10,
            maxMaxBufferLength: 30,
            startLevel: -1,
            abrEwmaDefaultEstimate: 500000,
            fragLoadingMaxRetry: 2,
            manifestLoadingMaxRetry: 2,
            levelLoadingMaxRetry: 2
          });
          
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('HLS ready, starting playback');
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
    if (vodId) loadVideo(vodId);
  }

  // 生成相关标签
  function generateTags(video: Video): string[] {
    const tags: string[] = [];
    if (video.title) tags.push(video.title);
    if (video.category) {
      tags.push(video.category);
      tags.push('热门' + video.category);
      tags.push(video.category + '推荐');
    }
    if (video.vod_year) {
      tags.push(String(video.vod_year));
      tags.push(String(video.vod_year) + '年');
    }
    if (video.vod_area) {
      tags.push(video.vod_area);
      const areaMap: Record<string, string> = {
        '中国大陆': '国产',
        '香港': '港剧',
        '台湾': '台剧',
        '韩国': '韩剧',
        '日本': '日剧',
        '美国': '美剧',
        '英国': '英剧'
      };
      if (areaMap[video.vod_area]) tags.push(areaMap[video.vod_area]);
    }
    if (video.vod_actor) {
      const actors = video.vod_actor.split(/[,，]/).map(a => a.trim()).filter(Boolean);
      tags.push(...actors.slice(0, 3));
    }
    if (video.vod_director) {
      const directors = video.vod_director.split(/[,，]/).map(d => d.trim()).filter(Boolean);
      tags.push(...directors.slice(0, 2));
    }
    if (video.vod_lang) tags.push(video.vod_lang);
    
    return [...new Set(tags)].slice(0, 12);
  }

  // 生成相关搜索
  function generateRelatedSearches(video: Video): string[] {
    const searches: string[] = [];
    if (video.title) {
      searches.push(video.title + '剧情介绍');
      searches.push(video.title + '演员表');
      searches.push(video.title + '结局');
      searches.push(video.title + '在线观看');
      searches.push(video.title + '免费观看');
    }
    if (video.vod_actor) {
      const actors = video.vod_actor.split(/[,，]/).map(a => a.trim()).filter(Boolean);
      actors.slice(0, 2).forEach(actor => {
        searches.push(actor + '演过的电影');
        searches.push(actor + '最新作品');
      });
    }
    if (video.category) {
      searches.push('最新' + video.category + '推荐');
      searches.push(video.category + '排行榜');
    }
    if (video.vod_year && video.category) {
      searches.push(String(video.vod_year) + '年热门' + video.category);
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
    <title>{seoTitle}</title>
    <meta name="description" content={seoDescription} />
    <meta name="keywords" content={seoKeywords.join(',')} />
    <link rel="canonical" href={canonicalUrl(`/v/${video.vod_id}`)} />
    
    <!-- Open Graph -->
    <meta property="og:title" content={video.title} />
    <meta property="og:description" content={seoDescription} />
    <meta property="og:image" content={video.cover} />
    <meta property="og:image:width" content="800" />
    <meta property="og:image:height" content="450" />
    <meta property="og:type" content="video.movie" />
    <meta property="og:url" content={canonicalUrl(`/v/${video.vod_id}`)} />
    <meta property="og:site_name" content={SITE_NAME} />
    <meta property="og:locale" content="zh_CN" />
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={video.title} />
    <meta name="twitter:description" content={seoDescription} />
    <meta name="twitter:image" content={video.cover} />
    
    <!-- 结构化数据 -->
    {@html `<script type="application/ld+json">${JSON.stringify(generateVideoSchema({
      title: video.title, category: video.category, vod_year: video.vod_year,
      vod_area: video.vod_area, vod_actor: video.vod_actor, vod_director: video.vod_director,
      vod_lang: video.vod_lang, cover: video.cover, play_url: video.play_url, vod_id: video.vod_id
    }))}</script>`}
    
    {@html `<script type="application/ld+json">${JSON.stringify(generateBreadcrumbSchema(generateBreadcrumbs(video)))}</script>`}
    
    {@html `<script type="application/ld+json">${JSON.stringify(generateOrganizationSchema())}</script>`}
    
    {@html `<script type="application/ld+json">${JSON.stringify(generateWebPageSchema({
      title: seoTitle, description: seoDescription, url: canonicalUrl(`/v/${video.vod_id}`)
    }))}</script>`}
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
        <svg class="w-16 h-16 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <p class="text-red-500 text-sm mb-4">{errorMsg}</p>
        <button onclick={retryLoad} class="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg hover:bg-pink-600 transition-colors">
          重新加载
        </button>
      </div>
    {:else if video}
      <!-- 面包屑导航 -->
      <nav class="bg-white px-3 py-2 text-sm" aria-label="面包屑导航">
        <ol class="flex items-center flex-wrap gap-1">
          {#each generateBreadcrumbs(video) as crumb, i}
            <li class="flex items-center">
              {#if i > 0}
                <span class="text-gray-400 mx-1">/</span>
              {/if}
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
        <div class="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
          {#if video.category}
            <span>{video.category}</span>
          {/if}
          {#if video.vod_year}
            <span>{video.vod_year}</span>
          {/if}
          {#if video.vod_area}
            <span>{video.vod_area}</span>
          {/if}
          {#if video.vod_lang}
            <span>{video.vod_lang}</span>
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

      <!-- 相关标签 -->
      {@const tags = generateTags(video)}
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

      <!-- 相关搜索 -->
      {@const relatedSearches = generateRelatedSearches(video)}
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

      <!-- 视频简介 -->
      {#if video.vod_content}
        <div class="mt-2 bg-white p-3">
          <h3 class="font-medium text-gray-800 mb-2">剧情简介</h3>
          <p class="text-sm text-gray-600 leading-relaxed">{video.vod_content}</p>
        </div>
      {/if}
    {/if}
  </main>

  <NavBar />
</div>
