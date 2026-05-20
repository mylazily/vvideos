<script lang="ts">
  import { generateComments } from '$lib/comments';

  interface Props {
    videoId: string;
    title?: string;
  }

  let { videoId, title = '' }: Props = $props();
  let comments = $derived(generateComments(videoId, 6));
</script>

<div class="mt-2 bg-white p-3">
  <h3 class="font-medium text-gray-800 mb-2">用户评论</h3>
  <div class="space-y-3">
    {#each comments as comment}
      <div class="flex gap-2">
        <div class="w-8 h-8 bg-pink-100 rounded-full flex-shrink-0 flex items-center justify-center text-pink-500 text-xs font-bold">
          {comment.user.charAt(0)}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="text-sm font-medium text-gray-700">{comment.user}</span>
            <span class="text-xs text-gray-400">{comment.time}</span>
          </div>
          <p class="text-sm text-gray-600">{comment.text}</p>
        </div>
      </div>
    {/each}
  </div>
</div>
