<script lang="ts">
  import { onMount } from 'svelte';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import type { Video } from '$lib/types';

  let videos: Video[] = [];
  let loading = true;

  onMount(async () => {
    try {
      const res = await fetch('/api/rank', {
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json();
        videos = data.data || [];
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>排行榜 - 必爱必爱</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <h1 class="text-lg font-bold text-pink-500">排行榜</h1>
  </header>

  <main class="p-2 pb-16">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if videos.length === 0}
      <div class="text-center py-20 text-gray-400">暂无数据</div>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {#each videos as video, i (video.vod_id)}
          <div class="relative">
            {#if i < 3}
              <div
                class="absolute -top-1 -left-1 z-10 w-6 h-6 bg-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center"
              >
                {i + 1}
              </div>
            {:else}
              <div
                class="absolute -top-1 -left-1 z-10 w-6 h-6 bg-gray-400 text-white text-xs font-bold rounded-full flex items-center justify-center"
              >
                {i + 1}
              </div>
            {/if}
            <VideoCard {video} />
          </div>
        {/each}
      </div>
    {/if}
  </main>

  <NavBar />
</div>
