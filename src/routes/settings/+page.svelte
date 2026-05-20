<script lang="ts">
  import NavBar from '$components/NavBar.svelte';
</script>

<svelte:head>
  <title>设置 - 必爱必爱</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50 flex items-center gap-2">
    <a href="/profile" class="text-gray-600">←</a>
    <h1 class="text-lg font-bold text-pink-500">设置</h1>
  </header>

  <main class="p-4 pb-16">
    <div class="bg-white rounded-lg overflow-hidden mb-4">
      <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span class="text-gray-700">清除缓存</span>
        <button class="text-sm text-pink-500">清除</button>
      </div>
      <div class="px-4 py-3 flex items-center justify-between">
        <span class="text-gray-700">关于我们</span>
        <span class="text-gray-400 text-sm">必爱必爱 v1.0</span>
      </div>
    </div>

    <div class="text-center text-xs text-gray-400 mt-8">
      <p>© 2026 必爱必爱 版权所有</p>
    </div>
  </main>

  <NavBar />
</div>
