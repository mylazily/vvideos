<script lang="ts">
  import type { Video } from '$lib/types';

  interface Props {
    video: Video;
    loading?: 'eager' | 'lazy';
  }

  let { video, loading = 'lazy' }: Props = $props();

  let imageLoaded = $state(false);
  let imageError = $state(false);

  function handleImageLoad() { imageLoaded = true; }
  function handleImageError() { imageError = true; imageLoaded = true; }

  // hover/touch预取视频API数据（秒开优化）
  let prefetched = false;
  function handleHover() {
    if (prefetched) return;
    prefetched = true;
    fetch(`/api/video/${video.vod_id}`, { signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
</script>

<a href="/v/{video.vod_id}" class="group block" onmouseenter={handleHover} ontouchstart={handleHover}>
  <div class="relative aspect-video bg-gray-200 rounded-lg overflow-hidden">
    {#if !imageError}
      <img
        src={video.cover}
        alt={video.title}
        loading={loading}
        decoding={loading === 'eager' ? 'sync' : 'async'}
        fetchpriority={loading === 'eager' ? 'high' : 'auto'}
        onload={handleImageLoad}
        onerror={handleImageError}
        class="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 {imageLoaded ? 'opacity-100' : 'opacity-0'}"
      />
    {:else}
      <div class="absolute inset-0 flex items-center justify-center bg-gray-200">
        <span class="text-xs text-gray-400">加载失败</span>
      </div>
    {/if}
    {#if video.duration}
      <div class="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
        {video.duration}
      </div>
    {/if}
  </div>
  <h3 class="mt-1.5 text-sm text-gray-800 line-clamp-2 group-hover:text-pink-500 transition-colors">
    {video.title}
  </h3>
  {#if video.category || video.vod_remarks}
    <p class="mt-0.5 text-xs text-gray-400 truncate">
      {video.category || ''}{video.vod_remarks ? ' · ' + video.vod_remarks : ''}
    </p>
  {/if}
</a>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
