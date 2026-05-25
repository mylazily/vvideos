<script lang="ts">
  interface Props {
    currentPage: number;
    totalPages: number;
    loading?: boolean;
    baseUrl: string;
  }

  let { currentPage, totalPages, loading = false, baseUrl }: Props = $props();

  function getPageNumbers(): (number | string)[] {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= 0) return pages;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) {
        end = Math.min(totalPages - 1, 4);
      } else if (currentPage >= totalPages - 2) {
        start = Math.max(2, totalPages - 3);
      }

      if (start > 2) {
        pages.push('...');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push('...');
      }

      pages.push(totalPages);
    }

    return pages;
  }

  function pageUrl(page: number): string {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}page=${page}`;
  }
</script>

<div class="flex items-center justify-center gap-2 mt-6 flex-wrap">
  <!-- 上一页 -->
  {#if currentPage > 1}
    <a
      href={pageUrl(currentPage - 1)}
      class="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
    >
      上一页
    </a>
  {:else}
    <span class="px-3 py-2 bg-gray-200 text-gray-400 text-sm rounded-lg cursor-not-allowed">上一页</span>
  {/if}

  <!-- 页码 -->
  {#each getPageNumbers() as pg}
    {#if pg === '...'}
      <span class="px-2 text-gray-400">...</span>
    {:else}
      {#if pg === currentPage}
        <span class="px-3 py-2 text-sm rounded-lg bg-pink-500 text-white">{pg}</span>
      {:else}
        <a
          href={pageUrl(pg as number)}
          class="px-3 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          {pg}
        </a>
      {/if}
    {/if}
  {/each}

  <!-- 下一页 -->
  {#if currentPage < totalPages}
    <a
      href={pageUrl(currentPage + 1)}
      class="px-3 py-2 bg-pink-500 text-white text-sm rounded-lg hover:bg-pink-600 transition-colors"
    >
      下一页
    </a>
  {:else}
    <span class="px-3 py-2 bg-gray-300 text-gray-400 text-sm rounded-lg cursor-not-allowed">下一页</span>
  {/if}

  <!-- 页码信息 -->
  {#if totalPages > 0}
    <span class="text-sm text-gray-500 ml-2">
      共 {totalPages} 页
    </span>
  {/if}
</div>
