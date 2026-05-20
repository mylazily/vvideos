<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    goto('/discover', { replaceState: true });
  });
</script>

<svelte:head>
  <title>标签 - 必爱必爱</title>
</svelte:head>

<div class="flex items-center justify-center py-20">
  <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
</div>
