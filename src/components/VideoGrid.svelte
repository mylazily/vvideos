<script lang="ts">
  import VideoCard from './VideoCard.svelte';
  import type { Video } from '$lib/types';
  
  interface Props {
    videos: Video[];
  }
  
  let { videos }: Props = $props();
</script>

<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
  {#each videos as video (video.vod_id)}
    <VideoCard {video} />
  {/each}
</div>
