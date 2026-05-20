<script lang="ts">
  interface Props {
    message?: string;
    actionText?: string;
    actionUrl?: string;
  }
  
  let { message = '暂无内容', actionText, actionUrl }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center py-20 text-gray-400">
  <svg class="w-16 h-16 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
  <p class="text-sm">{message}</p>
  {#if actionText && actionUrl}
    <a href={actionUrl} class="mt-4 text-pink-500 text-sm hover:underline">{actionText}</a>
  {/if}
</div>
