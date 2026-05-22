<script lang="ts">
  import { onMount } from 'svelte';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';

  let videos = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let searchKeyword = $state('');

  onMount(() => {
    loadVideos();
  });

  async function loadVideos() {
    loading = true;
    error = '';
    try {
      const response = await fetch('/api/home', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const res = await response.json();
      if (res.success) {
        videos = (res.data.videos || []).slice(0, 24);
      } else {
        throw new Error(res.message || '加载失败');
      }
    } catch (e: any) {
      error = e.message || '加载失败';
    } finally {
      loading = false;
    }
  }

  function handleSearch() {
    if (searchKeyword.trim()) {
      window.location.href = '/search/' + encodeURIComponent(searchKeyword.trim()) + '/1';
    }
  }
</script>

<svelte:head>
  <title>必爱必爱 - 免费在线观看最新电影、电视剧、综艺、动漫</title>
  <meta name="description" content="必爱必爱提供最新电影、电视剧、综艺、动漫免费在线观看，高清流畅，手机观看。" />
  <meta name="keywords" content="电影,电视剧,综艺,动漫,免费观看,在线观看" />
  <link rel="canonical" href="https://evideos.pages.dev/" />
  <meta property="og:title" content="必爱必爱 - 免费在线观看" />
  <meta property="og:description" content="最新电影、电视剧、综艺、动漫免费在线观看" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://evideos.pages.dev/" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- 搜索框 -->
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <div class="flex items-center h-9 px-3 bg-gray-100 rounded-lg">
      <svg class="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        bind:value={searchKeyword}
        onkeydown={(e) => e.key === 'Enter' && handleSearch()}
        type="text"
        placeholder="搜索电影、电视剧、动漫..."
        class="flex-1 bg-transparent text-sm outline-none"
      />
      <button onclick={handleSearch} class="text-pink-500 text-sm">搜索</button>
    </div>
  </header>

  <!-- 视频列表 -->
  <main class="pb-16">
    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else if error}
      <div class="text-center py-20">
        <p class="text-red-500 mb-4">{error}</p>
        <button onclick={loadVideos} class="px-4 py-2 bg-pink-500 text-white rounded-lg">重试</button>
      </div>
    {:else if videos.length > 0}
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-2">
        {#each videos as video, i (video.vod_id)}
          <VideoCard {video} loading={i < 4 ? 'eager' : 'lazy'} />
        {/each}
      </div>
    {:else}
      <div class="text-center py-20 text-gray-400">暂无数据</div>
    {/if}
  </main>

  <NavBar />
</div>
