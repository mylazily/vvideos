<script lang="ts">
  import { page } from '$app/stores';
  import { getLocaleFromPath, localeToUrl, t, DEFAULT_LOCALE, type Locale } from '$lib/i18n';

  let currentLocale = $state<Locale>(DEFAULT_LOCALE);
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
</script>

<nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50" aria-label="主导航">
  <div class="flex items-center justify-around h-12">
    <a
      href={getLocalizedPath('/')}
      class="flex-1 h-full flex items-center justify-center text-sm {currentPath === '/' || currentPath === `/${currentLocale}` || currentPath === `/${currentLocale}/` ? 'text-pink-500 font-medium' : 'text-gray-600'}"
      aria-current={currentPath === '/' || currentPath === `/${currentLocale}` || currentPath === `/${currentLocale}/` ? 'page' : undefined}
    >
      {t(currentLocale, 'home')}
    </a>
    <a
      href={getLocalizedPath('/discover')}
      class="flex-1 h-full flex items-center justify-center text-sm {currentPath === '/discover' || currentPath === `/${currentLocale}/discover` ? 'text-pink-500 font-medium' : 'text-gray-600'}"
      aria-current={currentPath === '/discover' || currentPath === `/${currentLocale}/discover` ? 'page' : undefined}
    >
      {t(currentLocale, 'discover')}
    </a>
    <a
      href={getLocalizedPath('/category/全部/1')}
      class="flex-1 h-full flex items-center justify-center text-sm {currentPath.includes('/category') ? 'text-pink-500 font-medium' : 'text-gray-600'}"
      aria-current={currentPath.includes('/category') ? 'page' : undefined}
    >
      {t(currentLocale, 'category')}
    </a>
    <a
      href={getLocalizedPath('/profile')}
      class="flex-1 h-full flex items-center justify-center text-sm {currentPath === '/profile' || currentPath === `/${currentLocale}/profile` ? 'text-pink-500 font-medium' : 'text-gray-600'}"
      aria-current={currentPath === '/profile' || currentPath === `/${currentLocale}/profile` ? 'page' : undefined}
    >
      {t(currentLocale, 'profile')}
    </a>
  </div>
</nav>
