<script lang="ts">
  import { onMount } from 'svelte';
  import NavBar from '$components/NavBar.svelte';
  import VideoCard from '$components/VideoCard.svelte';
  import Pagination from '$components/Pagination.svelte';
  import type { Video } from '$lib/types';

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

  let selectedTag = $state<Tag | null>(null);
  let tagVideos = $state<Video[]>([]);
  let tagLoading = $state(false);
  let tagsLoading = $state(true);
  let currentPage = $state(1);
  let totalPages = $state(1);

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

  async function selectTag(tag: Tag, page = 1) {
    selectedTag = tag;
    tagLoading = true;
    tagVideos = [];
    currentPage = page;

    try {
      const res = await fetch('/api/tag/videos?tag_id=' + tag.id + '&page=' + page + '&limit=24', {
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json();
        tagVideos = data.data?.videos || [];
        totalPages = data.data?.pagination?.totalPages || 1;
      }
    } catch (e) {
      console.error(e);
    } finally {
      tagLoading = false;
    }
  }

  function handlePageChange(page: number) {
    if (selectedTag) {
      selectTag(selectedTag, page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function closeTag() {
    selectedTag = null;
    tagVideos = [];
    currentPage = 1;
    totalPages = 1;
  }
</script>

<svelte:head>
  <title>发现 - 必爱必爱</title>
  <meta name="description" content="发现最新热门电影、电视剧、综艺、动漫，按分类、地区、年份、演员、导演浏览" />
  <meta name="keywords" content="发现,热门视频,最新电影,电视剧,综艺,动漫" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    {#if selectedTag}
      <div class="flex items-center gap-2">
        <button onclick={closeTag} class="text-gray-600">←</button>
        <h1 class="text-lg font-bold text-pink-500 truncate flex-1">
          {selectedTag.name}
          <span class="text-sm font-normal text-gray-400 ml-1">{selectedTag.video_count}部</span>
        </h1>
      </div>
    {:else}
      <h1 class="text-lg font-bold text-pink-500">发现</h1>
    {/if}
  </header>

  <main class="pb-16">
    {#if selectedTag}
      <!-- 标签视频列表 -->
      {#if tagLoading}
        <div class="flex items-center justify-center py-20">
          <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
        </div>
      {:else if tagVideos.length === 0}
        <div class="text-center py-20 text-gray-400">暂无相关视频</div>
      {:else}
        <div class="p-2">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {#each tagVideos as video (video.vod_id)}
              <VideoCard {video} />
            {/each}
          </div>

          {#if totalPages > 1}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              loading={tagLoading}
              onPageChange={handlePageChange}
            />
          {/if}
        </div>
      {/if}
    {:else}
      <!-- 标签浏览 -->
      {#if tagsLoading}
        <div class="flex items-center justify-center py-20">
          <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
        </div>
      {:else}
        {#if categories.length > 0}
          <div class="bg-white mt-2">
            <div class="px-3 py-2 border-b border-gray-100">
              <h2 class="text-sm font-medium text-gray-800">分类</h2>
            </div>
            <div class="flex flex-wrap gap-2 p-3">
              {#each categories as tag}
                <button
                  onclick={() => selectTag(tag)}
                  class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
                >
                  {tag.name}
                  <span class="text-xs text-gray-400 ml-1">{tag.video_count}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if areas.length > 0}
          <div class="bg-white mt-2">
            <div class="px-3 py-2 border-b border-gray-100">
              <h2 class="text-sm font-medium text-gray-800">地区</h2>
            </div>
            <div class="flex flex-wrap gap-2 p-3">
              {#each areas as tag}
                <button
                  onclick={() => selectTag(tag)}
                  class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
                >
                  {tag.name}
                  <span class="text-xs text-gray-400 ml-1">{tag.video_count}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if years.length > 0}
          <div class="bg-white mt-2">
            <div class="px-3 py-2 border-b border-gray-100">
              <h2 class="text-sm font-medium text-gray-800">年份</h2>
            </div>
            <div class="flex flex-wrap gap-2 p-3">
              {#each years as tag}
                <button
                  onclick={() => selectTag(tag)}
                  class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
                >
                  {tag.name}
                  <span class="text-xs text-gray-400 ml-1">{tag.video_count}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if actors.length > 0}
          <div class="bg-white mt-2">
            <div class="px-3 py-2 border-b border-gray-100">
              <h2 class="text-sm font-medium text-gray-800">热门演员</h2>
            </div>
            <div class="flex flex-wrap gap-2 p-3">
              {#each actors as tag}
                <button
                  onclick={() => selectTag(tag)}
                  class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
                >
                  {tag.name}
                  <span class="text-xs text-gray-400 ml-1">{tag.video_count}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if directors.length > 0}
          <div class="bg-white mt-2">
            <div class="px-3 py-2 border-b border-gray-100">
              <h2 class="text-sm font-medium text-gray-800">导演</h2>
            </div>
            <div class="flex flex-wrap gap-2 p-3">
              {#each directors as tag}
                <button
                  onclick={() => selectTag(tag)}
                  class="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
                >
                  {tag.name}
                  <span class="text-xs text-gray-400 ml-1">{tag.video_count}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    {/if}
  </main>

  <NavBar />
</div>
