<script lang="ts">
  import NavBar from '$components/NavBar.svelte';
</script>

<div class="min-h-screen bg-gray-50">
  <NavBar />
  <div class="fixed top-0 left-0 right-0 z-[100]">
    <div class="h-0.5 bg-pink-100 overflow-hidden">
      <div class="h-full bg-pink-500 animate-loading-bar"></div>
    </div>
  </div>
</div>

<style>
  @keyframes loading-bar {
    0% { width: 0%; margin-left: 0; }
    50% { width: 60%; margin-left: 20%; }
    100% { width: 0%; margin-left: 100%; }
  }
  .animate-loading-bar {
    animation: loading-bar 1.5s ease-in-out infinite;
  }
</style>
