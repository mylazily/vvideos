<script lang="ts">
  import { onMount } from 'svelte';
  import NavBar from '$components/NavBar.svelte';
  import { generateDiscoverSEO } from '$lib/seo';

  interface Tag {
    id: number;
    name: string;
    slug: string;
    type: string;
    video_count: number;
  }

  let categories = $state<Tag[]>([]);
  let areas = $state<Tag[]>([]);
  let years = $state<Tag[]>([]);
  let actors = $state<Tag[]>([]);
  let directors = $state<Tag[]>([]);
  let tagsLoading = $state(true);

  let seo = $derived(generateDiscoverSEO());

  onMount(async () => {
    try {
      const [catRes, areaRes, yearRes, actorRes, directorRes] = await Promise.all([
        fetch('/api/tags?type=category&limit=30'),
        fetch('/api/tags?type=area&limit=20'),
        fetch('/api/tags?type=year&limit=10'),
        fetch('/api/tags?type=actor&limit=30'),
        fetch('/api/tags?type=director&limit=20')
      ]);

      const [catData, areaData, yearData, actorData, directorData] = await Promise.all([
        catRes.json(), areaRes.json(), yearRes.json(), actorRes.json(), directorRes.json()
      ]);

      categories = catData.data || [];
      areas = areaData.data || [];
      years = yearData.data || [];
      actors = actorData.data || [];
      directors = directorData.data || [];
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
  <meta property="og:image" content="https://evideos.pages.dev/icon.svg" />
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
      <!-- 分类 -->
      {#if categories.length > 0}
        <section class="bg-white mt-2">
          <div class="px-3 py-2 border-b border-gray-100">
            <h2 class="text-sm font-medium text-gray-800">分类</h2>
          </div>
          <div class="flex flex-wrap gap-2 p-3">
            {#each categories as tag}
              <a
                href="/tag/{encodeURIComponent(tag.name)}/1"
                class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
              >
                {tag.name}
                <span class="text-xs text-gray-400 ml-1">{tag.video_count}</span>
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
                href="/tag/{encodeURIComponent(tag.name)}/1"
                class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
              >
                {tag.name}
                <span class="text-xs text-gray-400 ml-1">{tag.video_count}</span>
              </a>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 年份 -->
      {#if years.length > 0}
        <section class="bg-white mt-2">
          <div class="px-3 py-2 border-b border-gray-100">
            <h2 class="text-sm font-medium text-gray-800">年份</h2>
          </div>
          <div class="flex flex-wrap gap-2 p-3">
            {#each years as tag}
              <a
                href="/tag/{encodeURIComponent(tag.name)}/1"
                class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
              >
                {tag.name}
                <span class="text-xs text-gray-400 ml-1">{tag.video_count}</span>
              </a>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 热门演员 -->
      {#if actors.length > 0}
        <section class="bg-white mt-2">
          <div class="px-3 py-2 border-b border-gray-100">
            <h2 class="text-sm font-medium text-gray-800">热门演员</h2>
          </div>
          <div class="flex flex-wrap gap-2 p-3">
            {#each actors as tag}
              <a
                href="/tag/{encodeURIComponent(tag.name)}/1"
                class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
              >
                {tag.name}
                <span class="text-xs text-gray-400 ml-1">{tag.video_count}</span>
              </a>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 导演 -->
      {#if directors.length > 0}
        <section class="bg-white mt-2">
          <div class="px-3 py-2 border-b border-gray-100">
            <h2 class="text-sm font-medium text-gray-800">导演</h2>
          </div>
          <div class="flex flex-wrap gap-2 p-3">
            {#each directors as tag}
              <a
                href="/tag/{encodeURIComponent(tag.name)}/1"
                class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
              >
                {tag.name}
                <span class="text-xs text-gray-400 ml-1">{tag.video_count}</span>
              </a>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </main>

  <NavBar />
</div>
