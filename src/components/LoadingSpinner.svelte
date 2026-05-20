<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    text?: string;
  }
  
  let { size = 'md', text }: Props = $props();
  
  const sizeClasses = {
    sm: 'w-6 h-6 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-4'
  };
</script>

<div class="flex flex-col items-center justify-center py-20">
  <div class="{sizeClasses[size]} border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
  {#if text}
    <p class="mt-3 text-sm text-gray-400">{text}</p>
  {/if}
</div>
