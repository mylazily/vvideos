<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import NavBar from '$components/NavBar.svelte';
  import type { Video } from '$lib/types';

  let video: Video | null = null;
  let loading = true;
  let errorMsg = '';
  let currentEpisode = 0;

  $: vodId = $page.params.id;

  onMount(async () => {
    if (!vodId) return;

    try {
      const res = await fetch('/api/video/' + vodId, {
        signal: AbortSignal.timeout(10000)
      });
      const data = await res.json();

      if (data.success && data.data) {
        video = data.data;
      } else {
        errorMsg = data.message || '视频不存在';
      }
    } catch (e: any) {
      errorMsg = '加载失败';
    } finally {
      loading = false;
    }
  });

  function parseEpisodes(playUrl: string): { name: string; url: string }[] {
    if (!playUrl) return [];
    return playUrl
      .split('#')
      .map((ep) => {
        const idx = ep.indexOf('$');
        if (idx === -1) return { name: '播放', url: ep };
        return { name: ep.substring(0, idx), url: ep.substring(idx + 1) };
      })
      .filter((ep) => ep.url);
  }

  $: episodes = video?.play_url ? parseEpisodes(video.play_url) : [];
</script>

<svelte:head>
  <title>{video?.title || '视频详情'} - 必爱必爱</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header
    class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50 flex items-center gap-2"
  >
    <a href="/" class="text-gray-600">←</a>
    <h1 class="text-lg font-bold text-pink-500 truncate flex-1">
      {video?.title || '视频详情'}
    </h1>
  </header>

  <main class="pb-16">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div
          class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"
        ></div>
      </div>
    {:else if errorMsg}
      <div class="text-center py-20 text-red-500">{errorMsg}</div>
    {:else if video}
      <!-- 播放器 -->
      <div class="aspect-video bg-black">
        {#if episodes.length > 0 && episodes[currentEpisode]}
          <video
            src={episodes[currentEpisode].url}
            controls
            autoplay
            class="w-full h-full"
            poster={video.cover}
          >
            您的浏览器不支持视频播放
          </video>
        {:else}
          <div class="w-full h-full flex items-center justify-center text-white">暂无播放地址</div>
        {/if}
      </div>

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

      <!-- 选集 -->
      {#if episodes.length > 0}
        <div class="mt-2 bg-white p-3">
          <h3 class="font-medium text-gray-800 mb-2">选集</h3>
          <div class="flex gap-2 overflow-x-auto pb-2">
            {#each episodes as ep, i}
              <button
                onclick={() => (currentEpisode = i)}
                class="flex-shrink-0 px-3 py-1.5 text-sm rounded {currentEpisode === i
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
            <div class="mb-1">
              <span class="text-gray-500">年份：</span>{video.vod_year}
            </div>
          {/if}
          {#if video.vod_area}
            <div class="mb-1">
              <span class="text-gray-500">地区：</span>{video.vod_area}
            </div>
          {/if}
          {#if video.vod_director}
            <div class="mb-1">
              <span class="text-gray-500">导演：</span>{video.vod_director}
            </div>
          {/if}
          {#if video.vod_actor}
            <div>
              <span class="text-gray-500">演员：</span>{video.vod_actor}
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </main>

  <NavBar />
</div>
