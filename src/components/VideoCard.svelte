<script lang="ts">
  import type { Video } from '$lib/types';
  import { getLocaleFromPath, localeToUrl, DEFAULT_LOCALE, type Locale } from '$lib/i18n';

  interface Props {
    video: Video;
    loading?: 'eager' | 'lazy';
  }

  let { video, loading = 'lazy' }: Props = $props();

  // 获取当前语言
  let locale = $state<Locale>(DEFAULT_LOCALE);
  $effect(() => {
    locale = getLocaleFromPath(window.location.pathname);
  });

  // 生成带语言前缀的链接
  let videoHref = $derived(localeToUrl(locale, '/v/' + video.vod_id));

  let imageLoaded = $state(false);
  let imageError = $state(false);

  function handleImageLoad() {
    imageLoaded = true;
  }

  function handleImageError() {
    imageError = true;
    imageLoaded = true;
  }

  const placeholderSvg = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxNDUlJyB2aWV3Qm94PSIwIDAgMTY0IDE3NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTY0IiBoZWlnaHQ9IjE3NiIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOWE5YTlhIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCI+6I235a2mPC90ZXh0Pjwvc3ZnPg==';
</script>

<a href={videoHref} class="group block">
  <div class="relative aspect-video bg-gray-200 rounded-lg overflow-hidden">
    {#if !imageLoaded}
      <img src={placeholderSvg} alt="" class="absolute inset-0 w-full h-full object-cover" aria-hidden="true" />
    {/if}
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
        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    {/if}
    <div class="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
      <div class="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
        <svg class="w-6 h-6 text-pink-500 ml-1" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
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
