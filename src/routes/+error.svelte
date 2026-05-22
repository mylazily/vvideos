<script lang="ts">
  import { page } from '$app/stores';
  import NavBar from '$components/NavBar.svelte';
</script>

<svelte:head>
  <title>页面未找到 - 必爱必爱</title>
  <meta name="robots" content="noindex, follow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 flex flex-col">
  <NavBar />
  <main class="flex-1 flex flex-col items-center justify-center px-4">
    <div class="text-center">
      <div class="text-8xl font-bold text-pink-200 mb-4">404</div>
      <h1 class="text-xl font-medium text-gray-700 mb-2">
        {#if $page.status === 404}
          页面未找到
        {:else}
          加载出错
        {/if}
      </h1>
      <p class="text-sm text-gray-400 mb-8">
        {#if $page.status === 404}
          您访问的页面不存在或已被移除
        {:else}
          页面加载时发生了错误 ({$page.status})
        {/if}
      </p>
      <a
        href="/"
        class="inline-flex items-center gap-2 px-6 py-2.5 bg-pink-500 text-white text-sm rounded-full hover:bg-pink-600 active:bg-pink-700 transition-colors"
      >
        <span>←</span>
        返回首页
      </a>
    </div>
  </main>
</div>
