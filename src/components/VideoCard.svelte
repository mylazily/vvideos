<script lang="ts">
  import type { Video } from '$lib/types';

  let { video } = $props<{ video: Video }>();

  let loaded = $state(false);
  let errored = $state(false);

  function formatDuration(input: number | string | undefined | null): string {
    if (input === undefined || input === null || input === '') return '';
    if (typeof input === 'string') return input;
    if (input <= 0) return '';
    const h = Math.floor(input / 3600);
    const m = Math.floor((input % 3600) / 60);
    const s = Math.floor(input % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
</script>

<a
  href="/v/{video.vod_id}"
  class="block bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
>
  <div class="relative aspect-video bg-gray-100">
    {#if !loaded && !errored}
      <div class="absolute inset-0 bg-gray-200 animate-pulse"></div>
    {/if}

    {#if video.cover}
      <img
        src={video.cover}
        alt={video.title}
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        onload={() => (loaded = true)}
        onerror={() => (errored = true)}
        class="w-full h-full object-cover"
        style:opacity={loaded ? '1' : '0'}
        style:transition="opacity 0.3s"
      />
    {/if}

    {#if errored}
      <div class="absolute inset-0 flex items-center justify-center bg-gray-100">
        <span class="text-gray-400 text-xs">暂无封面</span>
      </div>
    {/if}

    {#if video.duration}
      <div class="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded">
        {formatDuration(video.duration)}
      </div>
    {/if}
  </div>

  <div class="p-2">
    <h3 class="text-[13px] text-gray-800 line-clamp-2 leading-tight mb-1">{video.title}</h3>
    {#if video.category}
      <span class="text-[11px] text-gray-400">{video.category}</span>
    {/if}
  </div>
</a>
