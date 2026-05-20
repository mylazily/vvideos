<script lang="ts">
  import NavBar from '$components/NavBar.svelte';
</script>

<svelte:head>
  <title>观看历史 - 必爱必爱</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50 flex items-center gap-2">
    <a href="/profile" class="text-gray-600">←</a>
    <h1 class="text-lg font-bold text-pink-500">观看历史</h1>
  </header>

  <main class="p-4 pb-16">
    <div class="text-center py-20 text-gray-400">
      <p>暂无观看记录</p>
      <p class="text-sm mt-2">登录后可同步观看历史</p>
    </div>
  </main>

  <NavBar />
</div>
