<script lang="ts">
  import { onMount } from 'svelte';
  import PageLayout from '$components/PageLayout.svelte';
  import { getStorageSize, clearAllData } from '$lib/storage';

  let storageSize = $state({ favorites: 0, history: 0 });

  onMount(() => {
    storageSize = getStorageSize();
  });

  function handleClearFavorites() {
    if (confirm('确定要清空所有收藏吗？')) {
      localStorage.removeItem('vvideos_favorites');
      storageSize = getStorageSize();
    }
  }

  function handleClearHistory() {
    if (confirm('确定要清空所有观看历史吗？')) {
      localStorage.removeItem('vvideos_history');
      storageSize = getStorageSize();
    }
  }

  function handleClearAll() {
    if (confirm('确定要清除所有本地数据吗？这将删除收藏和观看历史。')) {
      clearAllData();
      storageSize = getStorageSize();
    }
  }

  function handleClearCache() {
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
    alert('缓存已清除');
  }
</script>

<svelte:head>
  <title>设置 - 必爱必爱</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout title="设置">
  <div class="space-y-3">
    <!-- 数据管理 -->
    <div class="bg-white rounded-lg p-4">
      <h3 class="font-medium text-gray-800 mb-3">数据管理</h3>
      
      <div class="space-y-3">
        <div class="flex items-center justify-between py-2 border-b border-gray-100">
          <div>
            <div class="text-sm text-gray-700">我的收藏</div>
            <div class="text-xs text-gray-400">{storageSize.favorites} 个视频</div>
          </div>
          <button 
            onclick={handleClearFavorites}
            disabled={storageSize.favorites === 0}
            class="text-sm text-gray-400 hover:text-red-500 disabled:text-gray-200 transition-colors"
          >
            清空
          </button>
        </div>
        
        <div class="flex items-center justify-between py-2 border-b border-gray-100">
          <div>
            <div class="text-sm text-gray-700">观看历史</div>
            <div class="text-xs text-gray-400">{storageSize.history} 条记录</div>
          </div>
          <button 
            onclick={handleClearHistory}
            disabled={storageSize.history === 0}
            class="text-sm text-gray-400 hover:text-red-500 disabled:text-gray-200 transition-colors"
          >
            清空
          </button>
        </div>
        
        <div class="flex items-center justify-between py-2">
          <div>
            <div class="text-sm text-gray-700">清除缓存</div>
            <div class="text-xs text-gray-400">清理临时文件，释放空间</div>
          </div>
          <button 
            onclick={handleClearCache}
            class="text-sm text-gray-400 hover:text-red-500 transition-colors"
          >
            清除
          </button>
        </div>
      </div>
    </div>
    
    <!-- 危险操作 -->
    <div class="bg-white rounded-lg p-4">
      <h3 class="font-medium text-gray-800 mb-3">危险操作</h3>
      <button 
        onclick={handleClearAll}
        class="w-full py-2 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
      >
        清除所有本地数据
      </button>
    </div>
    
    <!-- 关于 -->
    <div class="bg-white rounded-lg p-4">
      <h3 class="font-medium text-gray-800 mb-3">关于</h3>
      <div class="text-sm text-gray-500 space-y-1">
        <div>必爱必爱 v1.0.0</div>
        <div>高清视频在线观看平台</div>
      </div>
    </div>
  </div>
</PageLayout>
