<script lang="ts">
  import { onMount } from 'svelte';
  import PageLayout from '$components/PageLayout.svelte';
  import VideoGrid from '$components/VideoGrid.svelte';
  import LoadingSpinner from '$components/LoadingSpinner.svelte';
  import EmptyState from '$components/EmptyState.svelte';
  import { getFavorites, removeFavorite, clearFavorites, type LocalVideo } from '$lib/storage';

  let videos: LocalVideo[] = [];
  let loading = true;

  onMount(() => {
    videos = getFavorites();
    loading = false;
  });

  function handleRemove(vodId: string) {
    removeFavorite(vodId);
    videos = getFavorites();
  }

  function handleClearAll() {
    if (confirm('确定要清空所有收藏吗？')) {
      clearFavorites();
      videos = [];
    }
  }
</script>

<svelte:head>
  <title>我的收藏 - 必爱必爱</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout title="我的收藏">
  {#if loading}
    <LoadingSpinner />
  {:else if videos.length === 0}
    <EmptyState message="还没有收藏任何视频" actionText="去发现好片" actionUrl="/discover" />
  {:else}
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm text-gray-500">共 {videos.length} 个收藏</span>
      <button 
        onclick={handleClearAll}
        class="text-sm text-gray-400 hover:text-red-500 transition-colors"
      >
        清空全部
      </button>
    </div>
    
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
      {#each videos as video (video.vod_id)}
        <div class="relative group">
          <a href="/v/{video.vod_id}" class="block bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div class="relative aspect-video bg-gray-100">
              {#if video.cover}
                <img
                  src={video.cover}
                  alt={video.title}
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  class="w-full h-full object-cover"
                />
              {/if}
            </div>
            <div class="p-2">
              <h3 class="text-[13px] text-gray-800 line-clamp-2 leading-tight">{video.title}</h3>
              {#if video.category}
                <span class="text-[11px] text-gray-400">{video.category}</span>
              {/if}
            </div>
          </a>
          <button
            onclick={() => handleRemove(video.vod_id)}
            class="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs"
            title="取消收藏"
          >
            ×
          </button>
        </div>
      {/each}
    </div>
  {/if}
</PageLayout>
