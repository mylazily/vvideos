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
  let hlsInstance: any = null;
  let showPlayButton = $state(false);
  let isPlaying = $state(false);
  let isLoadingVideo = false;
  let relatedVideos = $state<Video[]>([]);

  let vodId = $derived($page.params.id);
  let currentEpisode = $derived(playLines[currentLineIndex]?.episodes[currentEpisodeIndex]);

  // 自动生成简介（数据库无简介字段时根据元数据拼）
  let autoDescription = $derived(video ? (() => {
    const parts: string[] = [];
    parts.push(`《${video.title}》`);
    if (video.category) parts.push(`是一部${video.category}作品`);
    if (video.vod_year) parts.push(`，${video.vod_year}年${video.vod_area ? video.vod_area : ''}出品`);
    if (video.vod_director) parts.push(`，由${video.vod_director}执导`);
    if (video.vod_actor) {
      const actors = video.vod_actor.split(/[,，]/).slice(0, 4).join('、');
      parts.push(`，${actors}主演`);
    }
    parts.push(`。在${SITE_NAME}即可在线免费观看${video.title}完整版，高清流畅，支持手机播放。`);
    return parts.join('');
  })() : '');

  // 预计算 SEO 数据
  let seoTitle = $derived(video ? generatePageTitle({ title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area }) : '');
  let seoDesc = $derived(video ? generateSEODescription({ title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area, vod_actor: video.vod_actor, vod_director: video.vod_director }) : '');
  let seoKeywords = $derived(video ? generateSEOKeywords({ title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area, vod_actor: video.vod_actor, vod_director: video.vod_director, vod_lang: video.vod_lang }) : []);
  let breadcrumbs = $derived(video ? [
    { name: '首页', url: SITE_URL },
    { name: video.category || '视频', url: SITE_URL + '/category/' + encodeURIComponent(video.category || '全部') + '/1' },
    { name: video.title, url: SITE_URL + '/v/' + video.vod_id }
  ] : []);
  let tags = $derived(video ? (() => {
    const t: string[] = [];
    if (video.title) t.push(video.title);
    if (video.category) { t.push(video.category); t.push('热门' + video.category); }
    if (video.vod_year) t.push(String(video.vod_year));
    if (video.vod_area) t.push(video.vod_area);
    if (video.vod_actor) video.vod_actor.split(/[,，]/).slice(0, 3).forEach(a => { const v = a.trim(); if (v) t.push(v); });
    return [...new Set(t)].slice(0, 12);
  })() : []);
  let relatedSearches = $derived(video ? (() => {
    const s: string[] = [];
    if (video.title) { s.push(video.title + '剧情介绍'); s.push(video.title + '在线观看'); }
    if (video.vod_actor) video.vod_actor.split(/[,，]/).slice(0, 2).forEach(a => { const v = a.trim(); if (v) s.push(v + '最新作品'); });
    if (video.category) s.push('最新' + video.category + '推荐');
    return [...new Set(s)].slice(0, 10);
  })() : []);
  let faqs = $derived(video ? [
    { question: `${video.title}在哪里可以免费观看？`, answer: `${SITE_NAME}提供《${video.title}》${video.category || ''}在线免费观看，高清完整版，支持手机播放。` },
    { question: `${video.title}是谁演的？`, answer: video.vod_actor ? `《${video.title}》由${video.vod_actor}主演。` : `《${video.title}》演员信息请查看页面详情。` },
    { question: `${video.title}是什么时候上映的？`, answer: video.vod_year ? `《${video.title}》${video.vod_year}年上映。` : `《${video.title}》上映时间请查看页面详情。` }
  ] : []);

  onMount(() => {
    loadVideo();
  });

  async function loadVideo() {
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

    try {
      const res = await fetch('/api/video/' + vodId, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) { errorMsg = '请求失败 (' + res.status + ')'; loading = false; isLoadingVideo = false; return; }

      const data = await res.json();
      if (data.success && data.data) {
        video = data.data;
        playLines = parsePlayUrl(video.play_url);

        addToHistory({
          vod_id: video.vod_id, title: video.title, cover: video.cover,
          category: video.category, vod_year: video.vod_year, vod_area: video.vod_area
        });

        // 后台加载相关视频（不阻塞播放）
        loadRelatedVideos(vodId);

        // 延迟初始化播放器（HLS.js 动态导入）
        if (playLines.length > 0) requestAnimationFrame(() => playEpisode(0, 0));
      } else {
        errorMsg = data.message || '视频不存在';
      }
    } catch (e: any) {
      errorMsg = e.name === 'TimeoutError' ? '请求超时，请重试' : '网络错误，请稍后重试';
    } finally {
      loading = false;
      isLoadingVideo = false;
    }
  }

  function parsePlayUrl(playUrl: string | undefined): PlayLine[] {
    if (!playUrl) return [];
    const lines: PlayLine[] = [];
    const lineGroups = playUrl.split('$$$');
    for (let i = 0; i < lineGroups.length; i++) {
      const episodes: { name: string; url: string }[] = [];
      const items = lineGroups[i].split('#');
      for (let j = 0; j < items.length; j++) {
        const item = items[j].trim();
        if (!item) continue;
        const dollarIdx = item.indexOf('$');
        if (dollarIdx > 0) episodes.push({ name: item.substring(0, dollarIdx), url: item.substring(dollarIdx + 1) });
        else if (item.startsWith('http')) episodes.push({ name: '第' + (j + 1) + '集', url: item });
      }
      if (episodes.length > 0) lines.push({ name: lineGroups.length > 1 ? '线路' + (i + 1) : '默认线路', episodes });
    }
    return lines;
  }

  function destroyHls() { if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; } }

  async function playEpisode(lineIdx: number, episodeIdx: number) {
    currentLineIndex = lineIdx;
    currentEpisodeIndex = episodeIdx;
    const episode = playLines[lineIdx]?.episodes[episodeIdx];
    if (!episode) return;

    const el = document.querySelector('video') as HTMLVideoElement | null;
    if (!el) { requestAnimationFrame(() => playEpisode(lineIdx, episodeIdx)); return; }

    destroyHls();
    const url = episode.url;

    if (url.includes('.m3u8')) {
      const { default: Hls } = await import('hls.js');
      if (Hls.isSupported()) {
        hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 15, maxMaxBufferLength: 30, startLevel: -1 });
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          el.muted = true;
          el.play().then(() => { isPlaying = true; showPlayButton = false; setTimeout(() => { el.muted = false; }, 300); }).catch(() => { showPlayButton = true; });
        });
        hlsInstance.on(Hls.Events.ERROR, (_event: any, data: any) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hlsInstance?.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hlsInstance?.recoverMediaError();
            else if (lineIdx < playLines.length - 1) playEpisode(lineIdx + 1, 0);
            else errorMsg = '视频加载失败';
          }
        });
        hlsInstance.attachMedia(el);
        hlsInstance.loadSource(url);
      } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
        el.src = url;
        el.play().catch(() => { showPlayButton = true; });
      } else {
        errorMsg = '浏览器不支持HLS';
      }
    } else {
      el.src = url;
      el.play().catch(() => { showPlayButton = true; });
    }
  }

  function onVideoEnded() {
    const line = playLines[currentLineIndex];
    if (line && currentEpisodeIndex < line.episodes.length - 1) playEpisode(currentLineIndex, currentEpisodeIndex + 1);
  }

  function retryLoad() { isLoadingVideo = false; loadVideo(); }

  async function loadRelatedVideos(id: string) {
    try {
      const res = await fetch('/api/video/' + id + '/related', { signal: AbortSignal.timeout(5000) });
      if (res.ok) { const data = await res.json(); relatedVideos = data.data || []; }
    } catch (_) {}
  }
</script>

<svelte:head>
  {#if video}
    <title>{seoTitle}</title>
    <meta name="description" content={seoDesc} />
    <meta name="keywords" content={seoKeywords.join(',')} />
    <link rel="canonical" href={canonicalUrl(`/v/${video.vod_id}`)} />

    <!-- Open Graph（不暴露 play_url） -->
    <meta property="og:title" content={video.title} />
    <meta property="og:description" content={seoDesc} />
    <meta property="og:image" content={video.cover} />
    <meta property="og:image:alt" content={generateImageAlt({ title: video.title, category: video.category, vod_year: video.vod_year })} />
    <meta property="og:type" content="video.movie" />
    <meta property="og:url" content={canonicalUrl(`/v/${video.vod_id}`)} />
    {#if video.vod_year}
      <meta property="og:video:release_date" content={video.vod_year + '-01-01'} />
    {/if}

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={video.title} />
    <meta name="twitter:description" content={seoDesc} />
    <meta name="twitter:image" content={video.cover} />
    <meta name="twitter:image:alt" content={generateImageAlt({ title: video.title, category: video.category, vod_year: video.vod_year })} />

    <!-- 结构化数据（面包屑只在 head 中，不对用户可见） -->
    {@html `<script type="application/ld+json">${JSON.stringify(generateVideoSchema({ title: video.title, category: video.category, vod_year: video.vod_year, vod_area: video.vod_area, vod_actor: video.vod_actor, vod_director: video.vod_director, vod_lang: video.vod_lang, cover: video.cover, play_url: video.play_url, vod_id: video.vod_id }))}</script>`}
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
      <!-- 面包屑导航（SEO + 用户体验） -->
      <nav aria-label="面包屑" class="bg-white px-3 py-2 text-sm border-b">
        <ol class="flex items-center gap-1" itemscope itemtype="https://schema.org/BreadcrumbList">
          {#each breadcrumbs as crumb, i}
            <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem" class="flex items-center">
              {#if i > 0}<span class="text-gray-400 mx-1" aria-hidden="true">/</span>{/if}
              {#if i < breadcrumbs.length - 1}
                <a href={crumb.url} class="text-pink-500 hover:underline" itemprop="item"><span itemprop="name">{crumb.name}</span></a>
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
        <video controls playsinline preload="metadata" class="w-full h-full" poster={video.cover} onended={onVideoEnded}>
          您的浏览器不支持视频播放
        </video>
        {#if showPlayButton && !isPlaying}
          <div class="absolute inset-0 flex items-center justify-center bg-black/50 cursor-pointer"
               role="button" tabindex="0" aria-label="点击播放"
               onclick={() => {
                 const el = document.querySelector('video') as HTMLVideoElement;
                 if (el) el.play().then(() => { isPlaying = true; showPlayButton = false; }).catch(() => {});
               }}
               onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') (e.target as HTMLElement).click(); }}>
            <div class="w-20 h-20 bg-white/90 rounded-full flex items-center justify-center">
              <svg class="w-10 h-10 text-pink-500 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        {/if}
      </div>

      <!-- 当前播放信息 -->
      {#if currentEpisode}
        <div class="px-3 py-2 bg-white border-b">
          <span class="text-sm text-gray-500">{playLines[currentLineIndex]?.name} - {currentEpisode.name}</span>
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
          <div class="text-sm mb-1"><span class="text-gray-500">导演：</span><span itemprop="director">{video.vod_director}</span></div>
        {/if}
        {#if video.vod_actor}
          <div class="text-sm"><span class="text-gray-500">演员：</span><span itemprop="actor">{video.vod_actor}</span></div>
        {/if}
      </article>

      <!-- 选集 -->
      {#if playLines.length > 0}
        <section class="mt-2 bg-white p-3">
          <h3 class="font-medium mb-2">选集 ({playLines[currentLineIndex]?.episodes.length || 0})</h3>
          <div class="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {#each playLines[currentLineIndex]?.episodes || [] as ep, idx}
              <button onclick={() => playEpisode(currentLineIndex, idx)}
                class="flex-shrink-0 px-3 py-1.5 text-sm rounded transition-colors {currentEpisodeIndex === idx ? 'bg-pink-500 text-white' : 'bg-gray-100 active:bg-gray-200'}">
                {ep.name}
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 线路 -->
      {#if playLines.length > 1}
        <section class="mt-2 bg-white p-3">
          <h3 class="font-medium mb-2">播放线路</h3>
          <div class="flex gap-2 flex-wrap">
            {#each playLines as line, idx}
              <button onclick={() => playEpisode(idx, 0)}
                class="px-3 py-1.5 text-sm rounded transition-colors {currentLineIndex === idx ? 'bg-pink-500 text-white' : 'bg-gray-100 active:bg-gray-200'}">
                {line.name}
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 简介（自动生成，无数据库字段） -->
      <section class="mt-2 bg-white p-3">
        <h3 class="font-medium mb-2">简介</h3>
        <p class="text-sm text-gray-600 leading-relaxed" itemprop="description">{autoDescription}</p>
      </section>

      <!-- 相关标签 -->
      {#if tags.length > 0}
        <section class="mt-2 bg-white p-3">
          <h3 class="font-medium mb-2">相关标签</h3>
          <div class="flex flex-wrap gap-2">
            {#each tags as tag}
              <a href="/tag/{encodeURIComponent(tag)}" class="px-3 py-1 text-xs bg-gray-100 rounded-full hover:bg-pink-100 transition-colors">{tag}</a>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 相关搜索 -->
      {#if relatedSearches.length > 0}
        <section class="mt-2 bg-white p-3">
          <h3 class="font-medium mb-2">相关搜索</h3>
          <div class="flex flex-wrap gap-2">
            {#each relatedSearches as keyword}
              <a href="/search/{encodeURIComponent(keyword)}/1" class="px-3 py-1 text-xs bg-pink-50 text-pink-600 rounded-full hover:bg-pink-100 transition-colors">{keyword}</a>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 相关视频推荐 -->
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
