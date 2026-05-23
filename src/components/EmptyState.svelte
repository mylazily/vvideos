<script lang="ts">
  interface Props {
    message?: string;
    actionText?: string;
    actionUrl?: string;
  }
  
  let { message = '暂无内容', actionText, actionUrl }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center py-20 text-gray-400">
  <span class="text-4xl mb-4 text-gray-200">📹</span>
  <p class="text-sm">{message}</p>
  {#if actionText && actionUrl}
    <a href={actionUrl} class="mt-4 text-pink-500 text-sm hover:underline">{actionText}</a>
  {/if}
</div>
