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
      class="flex flex-col items-center justify-center flex-1 h-full text-xs {currentPath === '/' || currentPath === `/${currentLocale}` || currentPath === `/${currentLocale}/` ? 'text-pink-500' : 'text-gray-600'}"
      aria-current={currentPath === '/' || currentPath === `/${currentLocale}` || currentPath === `/${currentLocale}/` ? 'page' : undefined}
    >
      <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
      <span>{t(currentLocale, 'home')}</span>
    </a>
    <a
      href={getLocalizedPath('/discover')}
      class="flex flex-col items-center justify-center flex-1 h-full text-xs {currentPath === '/discover' || currentPath === `/${currentLocale}/discover` ? 'text-pink-500' : 'text-gray-600'}"
      aria-current={currentPath === '/discover' || currentPath === `/${currentLocale}/discover` ? 'page' : undefined}
    >
      <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <span>{t(currentLocale, 'discover')}</span>
    </a>
    <a
      href={getLocalizedPath('/category/全部/1')}
      class="flex flex-col items-center justify-center flex-1 h-full text-xs {currentPath.includes('/category') ? 'text-pink-500' : 'text-gray-600'}"
      aria-current={currentPath.includes('/category') ? 'page' : undefined}
    >
      <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
      <span>{t(currentLocale, 'category')}</span>
    </a>
    <a
      href={getLocalizedPath('/profile')}
      class="flex flex-col items-center justify-center flex-1 h-full text-xs {currentPath === '/profile' || currentPath === `/${currentLocale}/profile` ? 'text-pink-500' : 'text-gray-600'}"
      aria-current={currentPath === '/profile' || currentPath === `/${currentLocale}/profile` ? 'page' : undefined}
    >
      <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      <span>{t(currentLocale, 'profile')}</span>
    </a>
  </div>
</nav>
