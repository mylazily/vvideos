<script lang="ts">
  interface BreadcrumbItem {
    name: string;
    url?: string;
  }

  let { items }: { items: BreadcrumbItem[] } = $props();
</script>

<nav aria-label="面包屑导航" class="px-3 py-2 text-xs text-gray-500">
  <ol class="flex items-center gap-1 flex-wrap">
    {#each items as item, i}
      <li class="flex items-center gap-1">
        {#if i > 0}
          <span class="text-gray-300">/</span>
        {/if}
        {#if item.url && i < items.length - 1}
          <a href={item.url} class="hover:text-pink-500 transition-colors">{item.name}</a>
        {:else}
          <span class="text-gray-700">{item.name}</span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
