<script lang="ts">
  import { onMount } from 'svelte';
  import PageLayout from '$components/PageLayout.svelte';
  import LoadingSpinner from '$components/LoadingSpinner.svelte';
  import EmptyState from '$components/EmptyState.svelte';
  import { getHistory, removeFromHistory, clearHistory, type HistoryItem } from '$lib/storage';

  let videos: HistoryItem[] = [];
  let loading = true;

  onMount(() => {
    videos = getHistory();
    loading = false;
  });

  function handleRemove(vodId: string) {
    removeFromHistory(vodId);
    videos = getHistory();
  }

  function handleClearAll() {
    if (confirm('确定要清空所有观看历史吗？')) {
      clearHistory();
      videos = [];
    }
  }

  function formatTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
    
    return new Date(timestamp).toLocaleDateString('zh-CN');
  }

  function formatProgress(progress?: number, duration?: number): string {
    if (!progress) return '';
    if (duration) {
      const percent = Math.round((progress / duration) * 100);
      return `已看 ${percent}%`;
    }
    const min = Math.floor(progress / 60);
    const sec = progress % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }
</script>

<svelte:head>
  <title>观看历史 - 必爱必爱</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout title="观看历史">
  {#if loading}
    <LoadingSpinner />
  {:else if videos.length === 0}
    <EmptyState message="还没有观看记录" actionText="去看看" actionUrl="/" />
  {:else}
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm text-gray-500">共 {videos.length} 条记录</span>
      <button 
        onclick={handleClearAll}
        class="text-sm text-gray-400 hover:text-red-500 transition-colors"
      >
        清空历史
      </button>
    </div>
    
    <div class="space-y-2">
      {#each videos as video (video.vod_id)}
        <a 
          href="/v/{video.vod_id}" 
          class="flex gap-3 bg-white rounded-lg p-2 shadow-sm hover:shadow-md transition-shadow"
        >
          <div class="relative w-32 flex-shrink-0 aspect-video bg-gray-100 rounded overflow-hidden">
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
            {#if video.progress && video.duration}
              <div class="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
                <div 
                  class="h-full bg-pink-500" 
                  style="width: {(video.progress / video.duration) * 100}%"
                ></div>
              </div>
            {/if}
          </div>
          <div class="flex-1 min-w-0 py-1">
            <h3 class="text-sm font-medium text-gray-800 line-clamp-2 mb-1">{video.title}</h3>
            <div class="text-xs text-gray-400 space-y-0.5">
              {#if video.category}
                <div>{video.category}{#if video.vod_year} · {video.vod_year}{/if}</div>
              {/if}
              {#if video.last_play}
                <div>上次看到：{video.last_play}</div>
              {/if}
              <div class="flex items-center justify-between">
                <span>{formatTime(video.watched_at)}</span>
                {#if video.progress}
                  <span class="text-pink-500">{formatProgress(video.progress, video.duration)}</span>
                {/if}
              </div>
            </div>
          </div>
          <button
            onclick={(e) => { e.stopPropagation(); handleRemove(video.vod_id); }}
            class="self-center text-gray-300 hover:text-red-500 transition-colors px-2"
            title="删除"
          >
            ×
          </button>
        </a>
      {/each}
    </div>
  {/if}
</PageLayout>
