<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import NavBar from '$components/NavBar.svelte';
  import { generateDiscoverSEO, generateBreadcrumbSchema } from '$lib/seo';

  interface SourceCategory {
    id: number;
    name: string;
    alias: string;
    display_name: string;
    categories: string[];
  }

  let sources = $state<SourceCategory[]>([]);
  let categories = $state<string[]>([]);
  let keywords = $state<string[]>([]);
  let tagsLoading = $state(true);
  let searchQuery = $state('');

  let seo = $derived(generateDiscoverSEO());

  onMount(async () => {
    try {
      const [keywordsRes, categoriesRes] = await Promise.all([
        fetch('/api/keywords'),
        fetch('/api/categories')
      ]);
      const [keywordsData, categoriesData] = await Promise.all([
        keywordsRes.json(),
        categoriesRes.json()
      ]);
      sources = categoriesData.sources || [];
      categories = categoriesData.data || [];
      keywords = keywordsData.data || [];
    } catch (e) {
      console.error(e);
    } finally {
      tagsLoading = false;
    }
  });

  function handleSearch() {
    if (searchQuery.trim()) {
      goto('/search/' + encodeURIComponent(searchQuery.trim()) + '/1');
    }
  }
</script>

<svelte:head>
  <title>{seo.title}</title>
  <meta name="description" content={seo.description} />
  <meta name="keywords" content={seo.keywords} />
  <link rel="canonical" href="https://evideos.pages.dev/discover" />
  <meta property="og:title" content={seo.title} />
  <meta property="og:description" content={seo.description} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://evideos.pages.dev/discover" />
  <meta property="og:image" content="https://evideos.pages.dev/icon-512.png" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={seo.title} />
  <meta name="twitter:description" content={seo.description} />
  {@html `<script type="application/ld+json">${JSON.stringify(generateBreadcrumbSchema([{name: '首页', url: 'https://evideos.pages.dev/'}, {name: '发现', url: 'https://evideos.pages.dev/discover'}]))}</script>`}
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <div class="flex items-center gap-2">
      <div class="flex-1 relative">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="搜索电影、电视剧、动漫..."
          class="w-full h-9 pl-4 pr-10 text-sm bg-gray-100 border-0 rounded-full focus:outline-none focus:ring-2 focus:ring-pink-500"
          onkeydown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button
          onclick={handleSearch}
          class="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center bg-pink-500 text-white rounded-full hover:bg-pink-600 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </button>
      </div>
    </div>
  </header>

  <main class="pb-16">
    {#if tagsLoading}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
      </div>
    {:else}
      <!-- 热门搜索 -->
      {#if keywords.length > 0}
        <section class="bg-white mt-2">
          <div class="px-3 py-2 border-b border-gray-100">
            <h2 class="text-sm font-medium text-gray-800">热门搜索</h2>
          </div>
          <div class="flex flex-wrap gap-2 p-3">
            {#each keywords as kw}
              <a
                href="/search/{encodeURIComponent(kw)}/1"
                class="px-3 py-1.5 text-sm bg-pink-50 text-pink-600 rounded-full hover:bg-pink-100 hover:text-pink-700 transition-colors"
              >
                {kw}
              </a>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 资源站分类 -->
      {#if sources.length > 0}
        {#each sources as source}
          <section class="bg-white mt-2">
            <div class="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
              <h2 class="text-sm font-medium text-gray-800">{source.alias || source.name}</h2>
              <a href="/category/{encodeURIComponent(source.categories[0])}/1?source={source.id}" class="text-xs text-pink-500">查看全部</a>
            </div>
            <div class="flex flex-wrap gap-2 p-3">
              {#each source.categories.slice(0, 12) as tag}
                <a
                  href="/category/{encodeURIComponent(tag)}/1?source={source.id}"
                  class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
                >
                  {tag}
                </a>
              {/each}
              {#if source.categories.length > 12}
                <span class="px-3 py-1.5 text-sm text-gray-400">+{source.categories.length - 12}更多</span>
              {/if}
            </div>
          </section>
        {/each}
      {:else if categories.length > 0}
        <!-- 兼容：没有资源站数据时显示普通分类 -->
        <section class="bg-white mt-2">
          <div class="px-3 py-2 border-b border-gray-100">
            <h2 class="text-sm font-medium text-gray-800">分类</h2>
          </div>
          <div class="flex flex-wrap gap-2 p-3">
            {#each categories as tag}
              <a
                href="/category/{encodeURIComponent(tag)}/1"
                class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
              >
                {tag}
              </a>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 热门标签 -->
      {#if keywords.length > 0}
        <section class="bg-white mt-2">
          <div class="px-3 py-2 border-b border-gray-100">
            <h2 class="text-sm font-medium text-gray-800">热门标签</h2>
          </div>
          <div class="flex flex-wrap gap-2 p-3">
            {#each keywords as tag}
              <a
                href="/tag/{encodeURIComponent(tag)}/1"
                class="px-3 py-1.5 text-sm bg-pink-50 text-pink-600 rounded-full hover:bg-pink-100 hover:text-pink-700 transition-colors"
              >
                {tag}
              </a>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </main>

  <NavBar />
</div>
