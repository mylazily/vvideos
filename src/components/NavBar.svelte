<script lang="ts">
  import { page } from '$app/stores';
  import { getLocaleFromPath, localeToUrl, LOCALE_FLAGS, LOCALE_NAMES, SUPPORTED_LOCALES, t, DEFAULT_LOCALE, type Locale } from '$lib/i18n';

  let currentLocale = $state<Locale>(DEFAULT_LOCALE);
  let showLangMenu = $state(false);

  let currentPath = $derived($page.url.pathname);

  $effect(() => {
    currentLocale = getLocaleFromPath(window.location.pathname);
  });

  function getPathWithoutLocale() {
    const pathname = window.location.pathname;
    return pathname.replace(/^\/(en|ko|ja|vi|th)/, '') || '/';
  }

  function getLocalizedPath(path: string): string {
    if (currentLocale === DEFAULT_LOCALE) return path;
    return `/${currentLocale}${path}`;
  }

  function switchLanguage(newLocale: Locale) {
    const pathWithoutLocale = getPathWithoutLocale();
    const newPath = localeToUrl(newLocale, pathWithoutLocale);
    window.location.href = newPath;
  }
</script>

<svelte:window onclick={() => showLangMenu = false} />

<nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50" aria-label="主导航">
  <div class="flex items-center justify-around h-12">
    <a
      href={getLocalizedPath('/')}
      class="flex items-center justify-center flex-1 h-full text-sm {currentPath === '/' || currentPath === `/${currentLocale}` || currentPath === `/${currentLocale}/` ? 'text-pink-500 font-medium' : 'text-gray-600'}"
      aria-current={currentPath === '/' || currentPath === `/${currentLocale}` || currentPath === `/${currentLocale}/` ? 'page' : undefined}
    >
      {t(currentLocale, 'home')}
    </a>
    <a
      href={getLocalizedPath('/discover')}
      class="flex items-center justify-center flex-1 h-full text-sm {currentPath === '/discover' || currentPath === `/${currentLocale}/discover` ? 'text-pink-500 font-medium' : 'text-gray-600'}"
      aria-current={currentPath === '/discover' || currentPath === `/${currentLocale}/discover` ? 'page' : undefined}
    >
      {t(currentLocale, 'discover')}
    </a>
    <a
      href={getLocalizedPath('/category/全部/1')}
      class="flex items-center justify-center flex-1 h-full text-sm {currentPath.includes('/category') ? 'text-pink-500 font-medium' : 'text-gray-600'}"
      aria-current={currentPath.includes('/category') ? 'page' : undefined}
    >
      {t(currentLocale, 'category')}
    </a>
    <a
      href={getLocalizedPath('/profile')}
      class="flex items-center justify-center flex-1 h-full text-sm {currentPath === '/profile' || currentPath === `/${currentLocale}/profile` ? 'text-pink-500 font-medium' : 'text-gray-600'}"
      aria-current={currentPath === '/profile' || currentPath === `/${currentLocale}/profile` ? 'page' : undefined}
    >
      {t(currentLocale, 'profile')}
    </a>
    <!-- 语言切换 -->
    <div class="relative flex items-center justify-center flex-1 h-full">
      <button
        onclick={(e) => { e.stopPropagation(); showLangMenu = !showLangMenu; }}
        class="flex flex-col items-center gap-0.5 text-gray-500"
      >
        <span class="text-lg">{LOCALE_FLAGS[currentLocale]}</span>
        <span class="text-[10px]">{currentLocale.toUpperCase()}</span>
      </button>
      {#if showLangMenu}
        <div class="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-lg border border-gray-100 py-1 min-w-[120px] z-50">
          {#each SUPPORTED_LOCALES as loc}
            <button
              onclick={() => switchLanguage(loc)}
              class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 {currentLocale === loc ? 'text-pink-500 font-medium' : 'text-gray-700'}"
            >
              <span>{LOCALE_FLAGS[loc]}</span>
              <span>{LOCALE_NAMES[loc]}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</nav>
