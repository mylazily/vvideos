<script lang="ts">
  import { onMount } from 'svelte';
  import NavBar from '$components/NavBar.svelte';
  import { generateDiscoverSEO, generateBreadcrumbSchema } from '$lib/seo';

  let categories = $state<string[]>([]);
  let areas = $state<string[]>([]);
  let keywords = $state<string[]>([]);
  let tagsLoading = $state(true);

  let seo = $derived(generateDiscoverSEO());

  onMount(async () => {
    try {
      const [filtersRes, keywordsRes] = await Promise.all([
        fetch('/api/filters'),
        fetch('/api/keywords')
      ]);
      const [filtersData, keywordsData] = await Promise.all([
        filtersRes.json(),
        keywordsRes.json()
      ]);
      categories = filtersData.data?.categories || [];
      areas = filtersData.data?.areas || [];
      keywords = keywordsData.data || [];
    } catch (e) {
      console.error(e);
    } finally {
      tagsLoading = false;
    }
  });
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
    <h1 class="text-lg font-bold text-pink-500">发现</h1>
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

      <!-- 分类 -->
      {#if categories.length > 0}
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

      <!-- 地区 -->
      {#if areas.length > 0}
        <section class="bg-white mt-2">
          <div class="px-3 py-2 border-b border-gray-100">
            <h2 class="text-sm font-medium text-gray-800">地区</h2>
          </div>
          <div class="flex flex-wrap gap-2 p-3">
            {#each areas as tag}
              <a
                href="/tag/{encodeURIComponent(tag)}/1"
                class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
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
