<script lang="ts">
  import { goto } from '$app/navigation';

  // 搜索首页 - 重定向到搜索结果或显示搜索框
  let q = $state('');

  function handleSearch() {
    if (q.trim()) {
      goto('/search/' + encodeURIComponent(q.trim()) + '/1');
    }
  }
</script>

<svelte:head>
  <title>搜索 - 必爱必爱</title>
  <meta name="robots" content="noindex, follow" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <div class="flex items-center gap-2">
      <a href="/" class="text-gray-600 text-lg">←</a>
      <div class="flex-1 flex items-center h-9 px-3 bg-gray-100 rounded-lg">
        <input
          bind:value={q}
          onkeydown={(e) => e.key === 'Enter' && handleSearch()}
          type="text"
          placeholder="搜索影片"
          class="flex-1 bg-transparent text-sm outline-none"
          autofocus
        />
        <button onclick={handleSearch} class="text-pink-500 text-sm">搜索</button>
      </div>
    </div>
  </header>

  <main class="p-2 pb-20">
    <div class="text-center py-20 text-gray-400">输入关键词搜索影片</div>
  </main>
</div>
