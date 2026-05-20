<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import NavBar from '$components/NavBar.svelte';
  import type { Video } from '$lib/types';
  import Hls from 'hls.js';

  interface PlayLine {
    name: string;
    episodes: { name: string; url: string }[];
  }

  let video: Video | null = null;
  let loading = true;
  let errorMsg = '';
  let playLines: PlayLine[] = [];
  let currentLineIndex = 0;
  let currentEpisodeIndex = 0;
  let hlsInstance: Hls | null = null;
  let videoEl: HTMLVideoElement;

  $: vodId = $page.params.id;
  $: currentEpisode = playLines[currentLineIndex]?.episodes[currentEpisodeIndex];

  onMount(async () => {
    if (!vodId) return;
    await loadVideo();
  });

  onDestroy(() => {
    destroyHls();
  });

  async function loadVideo() {
    try {
      const res = await fetch('/api/video/' + vodId, {
        signal: AbortSignal.timeout(10000)
      });
      const data = await res.json();

      if (data.success && data.data) {
        video = data.data;
        playLines = parsePlayUrl(video.play_url);
        // 自动播放第一集
        if (playLines.length > 0 && playLines[0].episodes.length > 0) {
          setTimeout(() => playEpisode(0, 0), 100);
        }
      } else {
        errorMsg = data.message || '视频不存在';
      }
    } catch (e: any) {
      errorMsg = '加载失败';
    } finally {
      loading = false;
    }
  }

  function parsePlayUrl(playUrl: string | undefined): PlayLine[] {
    if (!playUrl) return [];
    const lines: PlayLine[] = [];
    // 支持 $$$ 分隔的多线路
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
    } else {
      videoEl.src = url;
      videoEl.play().catch(() => {});
    }
  }

  function onVideoEnded() {
    // 自动播放下一集
    const currentLine = playLines[currentLineIndex];
    if (currentLine && currentEpisodeIndex < currentLine.episodes.length - 1) {
      playEpisode(currentLineIndex, currentEpisodeIndex + 1);
    }
  }
</script>

<svelte:head>
  <title>{video?.title || '视频详情'} - 必爱必爱</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50 flex items-center gap-2">
    <a href="/" class="text-gray-600">←</a>
    <h1 class="text-lg font-bold text-pink-500 truncate flex-1">{video?.title || '视频详情'}</h1>
  </header>

  <main class="pb-16">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if errorMsg}
      <div class="text-center py-20 text-red-500">{errorMsg}</div>
    {:else if video}
      <!-- 播放器 -->
      <div class="aspect-video bg-black relative">
        <video
          bind:this={videoEl}
          controls
          autoplay
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
        <h2 class="text-lg font-bold text-gray-800 mb-2">{video.title}</h2>
        <div class="flex items-center gap-4 text-sm text-gray-500 mb-3">
          {#if video.category}
            <span>{video.category}</span>
          {/if}
          {#if video.views}
            <span>{video.views}次观看</span>
          {/if}
        </div>
        {#if video.description}
          <p class="text-sm text-gray-600 line-clamp-3">{video.description}</p>
        {/if}
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
            选集 ({playLines[currentLineIndex]?.episodes.length}集)
          </h3>
          <div class="flex gap-2 overflow-x-auto pb-2">
            {#each playLines[currentLineIndex]?.episodes || [] as ep, idx}
              <button
                onclick={() => playEpisode(currentLineIndex, idx)}
                class="flex-shrink-0 px-3 py-1.5 text-sm rounded {currentEpisodeIndex === idx && currentLineIndex === currentLineIndex
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
    {/if}
  </main>

  <NavBar />
</div>
