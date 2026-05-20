<script lang="ts">
  import NavBar from '$components/NavBar.svelte';
</script>

<svelte:head>
  <title>我的 - 必爱必爱</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <h1 class="text-lg font-bold text-pink-500">我的</h1>
  </header>

  <main class="p-4 pb-16">
    <div class="bg-white rounded-lg p-4 mb-4">
      <div class="flex items-center gap-3">
        <div
          class="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center text-pink-500 text-xl font-bold"
        >
          用户
        </div>
        <div>
          <h2 class="font-medium text-gray-800">未登录</h2>
          <p class="text-sm text-gray-500">点击登录享受更多功能</p>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-lg overflow-hidden">
      <a
        href="/history"
        class="flex items-center justify-between px-4 py-3 border-b border-gray-100"
      >
        <span class="text-gray-700">观看历史</span>
        <span class="text-gray-400">></span>
      </a>
      <a
        href="/favorite"
        class="flex items-center justify-between px-4 py-3 border-b border-gray-100"
      >
        <span class="text-gray-700">我的收藏</span>
        <span class="text-gray-400">></span>
      </a>
      <a
        href="/settings"
        class="flex items-center justify-between px-4 py-3"
      >
        <span class="text-gray-700">设置</span>
        <span class="text-gray-400">></span>
      </a>
    </div>
  </main>

  <NavBar />
</div>
