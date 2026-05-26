<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>必爱必爱 - 免费在线观看最新电影、电视剧、综艺、动漫</title>
  <meta name="description" content="必爱必爱提供最新电影、电视剧、综艺、动漫免费在线观看，高清流畅，支持手机观看，无需注册。" />
  <meta name="keywords" content="电影,电视剧,综艺,动漫,免费观看,在线观看,高清电影,最新电视剧,必爱必爱" />
  <link rel="canonical" href="https://evideos.pages.dev/" />
  <meta property="og:title" content="必爱必爱 - 免费在线观看最新电影、电视剧、综艺、动漫" />
  <meta property="og:description" content="必爱必爱提供最新电影、电视剧、综艺、动漫免费在线观看，高清流畅，支持手机观看。" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://evideos.pages.dev/" />
  <meta property="og:site_name" content="必爱必爱" />
  <meta property="og:locale" content="zh_CN" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="必爱必爱 - 免费在线观看最新电影、电视剧、综艺、动漫" />
  <meta name="twitter:description" content="必爱必爱提供最新电影、电视剧、综艺、动漫免费在线观看，高清流畅。" />

  <!-- JSON-LD 结构化数据 -->
  {@html `<script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"WebSite","name":"必爱必爱","url":"https://evideos.pages.dev","potentialAction":{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https://evideos.pages.dev/search/{search_term_string}/1"},"query-input":"required name=search_term_string"}})}</script>`}
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- 搜索框 -->
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <form action="/search" method="get" class="flex items-center h-9 px-3 bg-gray-100 rounded-lg">
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

  <!-- 视频列表：响应式多列（锁定，永不修改） -->
  <main class="pb-16">
    {#if data.videos && data.videos.length > 0}
      <div id="vg" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-2">
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
            </div>
            <h3 class="mt-1.5 text-sm text-gray-800 line-clamp-2 group-hover:text-pink-500 transition-colors">
              {video.title}
            </h3>
          </a>
        {/each}
      </div>
    {:else}
      <div id="vg" class="text-center py-20 text-gray-400 text-sm">加载中...</div>
    {/if}
  </main>

  <!-- 底部导航：首页、分类、发现、我 -->
  <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50" aria-label="主导航">
    <div class="flex items-center justify-around h-12">
      <a href="/" class="flex-1 h-full flex items-center justify-center text-sm text-pink-500 font-medium" aria-current="page">首页</a>
      <a href="/category/全部/1" class="flex-1 h-full flex items-center justify-center text-sm text-gray-600">分类</a>
      <a href="/discover" class="flex-1 h-full flex items-center justify-center text-sm text-gray-600">发现</a>
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
