<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import type { Video } from '$lib/types';

  let videos: Video[] = [];
  let loading = true;
  let errorMsg = '';
  let searchKeyword = '';

  onMount(async () => {
    try {
      const res = await fetch('/api/home', {
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json();
        videos = data.data?.videos || [];
      } else {
        errorMsg = '加载失败';
      }
    } catch (e: any) {
      errorMsg = '网络错误';
    } finally {
      loading = false;
    }
  });

  function handleSearch() {
    if (searchKeyword.trim()) {
      goto('/search?q=' + encodeURIComponent(searchKeyword.trim()));
    }
  }
</script>

<svelte:head>
  <title>必爱必爱</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <div class="flex items-center gap-2">
      <h1 class="text-lg font-bold text-pink-500 flex-shrink-0">必爱必爱</h1>
      <div class="flex-1 flex items-center h-9 px-3 bg-gray-100 rounded-lg">
        <input
          bind:value={searchKeyword}
          onkeydown={(e) => e.key === 'Enter' && handleSearch()}
          type="text"
          placeholder="搜索影片"
          class="flex-1 bg-transparent text-sm outline-none"
        />
        <button onclick={handleSearch} class="text-pink-500 text-sm ml-2">搜索</button>
      </div>
    </div>
  </header>

  <main class="p-2 pb-16">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if errorMsg}
      <div class="text-center py-20 text-red-500">{errorMsg}</div>
    {:else if videos.length === 0}
      <div class="text-center py-20 text-gray-400">暂无内容</div>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {#each videos as video (video.vod_id)}
          <VideoCard {video} />
        {/each}
      </div>
    {/if}
  </main>

  <NavBar />
</div>
