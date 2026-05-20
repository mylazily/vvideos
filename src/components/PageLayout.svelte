<script lang="ts">
  import NavBar from './NavBar.svelte';
  
  interface Props {
    title?: string;
    backUrl?: string;
    showSearch?: boolean;
    searchPlaceholder?: string;
    searchValue?: string;
    onSearch?: (value: string) => void;
  }
  
  let { 
    title = '必爱必爱', 
    backUrl,
    showSearch = false,
    searchPlaceholder = '搜索影片',
    searchValue = '',
    onSearch
  }: Props = $props();
  
  let keyword = $state(searchValue);
  
  function handleSearch() {
    if (onSearch && keyword.trim()) {
      onSearch(keyword.trim());
    }
  }
</script>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50 flex items-center gap-2">
    {#if backUrl}
      <a href={backUrl} class="text-gray-600 text-lg flex-shrink-0">←</a>
    {/if}
    
    {#if showSearch}
      <div class="flex-1 flex items-center h-9 px-3 bg-gray-100 rounded-lg">
        <input
          bind:value={keyword}
          onkeydown={(e) => e.key === 'Enter' && handleSearch()}
          type="text"
          placeholder={searchPlaceholder}
          class="flex-1 bg-transparent text-sm outline-none"
        />
        {#if keyword}
          <button onclick={() => { keyword = ''; }} class="text-gray-400 mr-2">×</button>
        {/if}
        <button onclick={handleSearch} class="text-pink-500 text-sm">搜索</button>
      </div>
    {:else}
      <h1 class="text-lg font-bold text-pink-500 truncate flex-1">{title}</h1>
    {/if}
  </header>
  
  <main class="p-2 pb-16">
    <slot />
  </main>
  
  <NavBar />
</div>
