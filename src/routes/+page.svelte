<script lang="ts">
  import type { PageData } from './$types';
  import { generateOrganizationSchema, generateWebSiteSchema, SITE_URL, SITE_NAME } from '$lib/seo';

  let { data }: { data: PageData } = $props();

  // 首页FAQ结构化数据
  const homeFAQ = [
    { question: '必爱必爱是什么网站？', answer: '必爱必爱是一个免费在线观看最新电影、电视剧、综艺、动漫的视频网站，高清流畅，支持手机观看。' },
    { question: '必爱必爱收费吗？', answer: '必爱必爱完全免费，无需注册即可观看所有视频内容。' },
    { question: '手机可以观看吗？', answer: '可以，必爱必爱支持手机、平板、电脑等多种设备在线观看。' }
  ];
</script>

<svelte:head>
  <title>必爱必爱 - 免费在线观看最新电影、电视剧、综艺、动漫</title>
  <meta name="description" content="必爱必爱提供最新电影、电视剧、综艺、动漫免费在线观看，高清流畅，支持手机观看，无需注册。" />
  <meta name="keywords" content="电影,电视剧,综艺,动漫,免费观看,在线观看,高清电影,最新电视剧,必爱必爱" />
  <link rel="canonical" href="https://evideos.pages.dev/" />
  
  <!-- Open Graph -->
  <meta property="og:title" content="必爱必爱 - 免费在线观看最新电影、电视剧、综艺、动漫" />
  <meta property="og:description" content="必爱必爱提供最新电影、电视剧、综艺、动漫免费在线观看，高清流畅，支持手机观看。" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://evideos.pages.dev/" />
  <meta property="og:image" content="https://evideos.pages.dev/icon-512.png" />
  <meta property="og:site_name" content="必爱必爱" />
  <meta property="og:locale" content="zh_CN" />
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="必爱必爱 - 免费在线观看最新电影、电视剧、综艺、动漫" />
  <meta name="twitter:description" content="必爱必爱提供最新电影、电视剧、综艺、动漫免费在线观看，高清流畅。" />
  <meta name="twitter:image" content="https://evideos.pages.dev/icon-512.png" />
  
  <!-- JSON-LD 结构化数据 -->
  {@html `<script type="application/ld+json">${JSON.stringify(generateOrganizationSchema())}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(generateWebSiteSchema())}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": homeFAQ.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  })}</script>`}
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- 搜索框 - 纯HTML form，零JS -->
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
