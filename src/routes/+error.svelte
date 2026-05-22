<script lang="ts">
  import { page } from '$app/stores';
  import NavBar from '$components/NavBar.svelte';
  import { getLocaleFromPath, t, DEFAULT_LOCALE, type Locale } from '$lib/i18n';

  let locale = $state<Locale>(DEFAULT_LOCALE);
  $effect(() => { locale = getLocaleFromPath($page.url.pathname); });
</script>

<svelte:head>
  <title>{t(locale, 'not_found')} - 必爱必爱</title>
  <meta name="robots" content="noindex, follow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 flex flex-col">
  <NavBar />
  <main class="flex-1 flex flex-col items-center justify-center px-4">
    <div class="text-center">
      <div class="text-8xl font-bold text-pink-200 mb-4">404</div>
      <h1 class="text-xl font-medium text-gray-700 mb-2">
        {#if $page.status === 404}
          {t(locale, 'not_found')}
        {:else}
          {t(locale, 'load_error')}
        {/if}
      </h1>
      <p class="text-sm text-gray-400 mb-8">
        {#if $page.status === 404}
          {t(locale, 'not_found_desc')}
        {:else}
          {t(locale, 'load_error_desc')} ({$page.status})
        {/if}
      </p>
      <a
        href="/"
        class="inline-flex items-center gap-2 px-6 py-2.5 bg-pink-500 text-white text-sm rounded-full hover:bg-pink-600 active:bg-pink-700 transition-colors"
      >
        <span>&larr;</span>
        {t(locale, 'back_home')}
      </a>
    </div>
  </main>
</div>
