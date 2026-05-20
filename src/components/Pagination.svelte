<script lang="ts">
  interface Props {
    currentPage: number;
    totalPages: number;
    loading?: boolean;
    onPageChange: (page: number) => void;
  }

  let { currentPage, totalPages, loading = false, onPageChange }: Props = $props();

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages && !loading && page !== currentPage) {
      onPageChange(page);
    }
  }

  function getPageNumbers(): (number | string)[] {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 始终显示第一页
      pages.push(1);
      
      // 计算中间页码
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);
      
      // 调整边界
      if (currentPage <= 3) {
        end = Math.min(totalPages - 1, 4);
      } else if (currentPage >= totalPages - 2) {
        start = Math.max(2, totalPages - 3);
      }
      
      // 添加省略号
      if (start > 2) {
        pages.push('...');
      }
      
      // 添加中间页
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      // 添加省略号
      if (end < totalPages - 1) {
        pages.push('...');
      }
      
      // 始终显示最后一页
      pages.push(totalPages);
    }
    
    return pages;
  }
</script>

<div class="flex items-center justify-center gap-2 mt-6 flex-wrap">
  <!-- 上一页 -->
  <button
    onclick={() => goToPage(currentPage - 1)}
    disabled={currentPage <= 1 || loading}
    class="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
  >
    上一页
  </button>

  <!-- 页码 -->
  {#each getPageNumbers() as page}
    {#if page === '...'}
      <span class="px-2 text-gray-400">...</span>
    {:else}
      <button
        onclick={() => goToPage(page as number)}
        disabled={loading}
        class="px-3 py-2 text-sm rounded-lg transition-colors {currentPage === page
          ? 'bg-pink-500 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
      >
        {page}
      </button>
    {/if}
  {/each}

  <!-- 下一页 -->
  <button
    onclick={() => goToPage(currentPage + 1)}
    disabled={currentPage >= totalPages || loading}
    class="px-3 py-2 bg-pink-500 text-white text-sm rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-pink-600 transition-colors"
  >
    {loading ? '加载中...' : '下一页'}
  </button>

  <!-- 页码信息 -->
  <span class="text-sm text-gray-500 ml-2">
    共 {totalPages} 页
  </span>
</div>
