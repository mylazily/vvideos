<script lang="ts">
  import { page } from '$app/stores';
  import NavBar from '$components/NavBar.svelte';

  // Svelte 5: 使用 $derived 获取响应式 page 状态
  let pageStatus = $derived($page.status);
  let isNotFound = $derived(pageStatus === 404);
</script>
<svelte:head>
  <title>页面未找到 - 必爱必爱</title>
  <meta name="robots" content="noindex, follow" />
  <meta name="description" content="您访问的页面不存在或已被移除，请返回必爱必爱首页继续浏览高清视频。" />
  <link rel="canonical" href="https://evideos.pages.dev/" />
  <meta property="og:title" content="页面未找到 - 必爱必爱" />
  <meta property="og:description" content="您访问的页面不存在或已被移除，请返回必爱必爱首页继续浏览高清视频。" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://evideos.pages.dev/" />
  <meta property="og:image" content="https://evideos.pages.dev/icon-512.png" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="页面未找到 - 必爱必爱" />
  <meta name="twitter:description" content="您访问的页面不存在或已被移除，请返回必爱必爱首页继续浏览高清视频。" />
</svelte:head>
<div class="min-h-screen bg-gray-50 flex flex-col">
  <NavBar />
  <main class="flex-1 flex flex-col items-center justify-center px-4">
    <div class="text-center">
      <div class="text-8xl font-bold text-pink-200 mb-4">404</div>
      <h1 class="text-xl font-medium text-gray-700 mb-2">
        {#if isNotFound}
          页面未找到
        {:else}
          加载错误
        {/if}
      </h1>
      <p class="text-sm text-gray-400 mb-8">
        {#if isNotFound}
          您访问的页面不存在或已被移除
        {:else}
          页面加载失败，请稍后重试 ({pageStatus})
        {/if}
      </p>
      <a
        href="/"
        class="inline-flex items-center gap-2 px-6 py-2.5 bg-pink-500 text-white text-sm rounded-full hover:bg-pink-600 active:bg-pink-700 transition-colors"
      >
        <span>&larr;</span>
        返回首页
      </a>
    </div>
  </main>
</div>
