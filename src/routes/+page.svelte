<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
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
  <!-- 搜索框 - 纯HTML form，零JS -->
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <form action="/search" method="get" class="flex items-center h-9 px-3 bg-gray-100 rounded-lg">
      <svg class="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        name="q"
        type="text"
        placeholder="搜索电影、电视剧、动漫..."
        class="flex-1 bg-transparent text-sm outline-none"
        autocomplete="off"
      />
      <button type="submit" class="text-pink-500 text-sm">搜索</button>
    </form>
  </header>

  <!-- 视频列表 - 纯静态HTML -->
  <main class="pb-16">
    {#if data.videos && data.videos.length > 0}
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-2">
        {#each data.videos as video, i (video.vod_id)}
          <a href="/v/{video.vod_id}" class="group block">
            <div class="relative aspect-video bg-gray-200 rounded-lg overflow-hidden">
              <img
                src={video.cover}
                alt={video.title}
                loading={i < 4 ? 'eager' : 'lazy'}
                decoding={i < 4 ? 'sync' : 'async'}
                fetchpriority={i < 4 ? 'high' : 'auto'}
                class="absolute inset-0 w-full h-full object-cover"
              />
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
        {/each}
      </div>
    {:else}
      <div class="text-center py-20 text-gray-400">暂无数据</div>
    {/if}
  </main>

  <!-- 底部导航 - 纯HTML -->
  <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50" aria-label="主导航">
    <div class="flex items-center justify-around h-12">
      <a href="/" class="flex-1 h-full flex items-center justify-center text-sm text-pink-500 font-medium" aria-current="page">首页</a>
      <a href="/discover" class="flex-1 h-full flex items-center justify-center text-sm text-gray-600">发现</a>
      <a href="/category/全部/1" class="flex-1 h-full flex items-center justify-center text-sm text-gray-600">分类</a>
      <a href="/profile" class="flex-1 h-full flex items-center justify-center text-sm text-gray-600">我的</a>
    </div>
  </nav>
</div>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
