<script lang="ts">
  import { page } from '$app/stores';

  let currentPath = $derived($page.url.pathname);
</script>

<nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50" aria-label="主导航">
  <div class="flex items-center justify-around h-12">
    <a
      href="/"
      class="flex-1 h-full flex items-center justify-center text-sm {currentPath === '/' ? 'text-pink-500 font-medium' : 'text-gray-600'}"
      aria-current={currentPath === '/' ? 'page' : undefined}
    >
      首页
    </a>
    <a
      href="/category"
      class="flex-1 h-full flex items-center justify-center text-sm {currentPath.includes('/category') ? 'text-pink-500 font-medium' : 'text-gray-600'}"
      aria-current={currentPath.includes('/category') ? 'page' : undefined}
    >
      分类
    </a>
    <a
      href="/discover"
      class="flex-1 h-full flex items-center justify-center text-sm {currentPath === '/discover' ? 'text-pink-500 font-medium' : 'text-gray-600'}"
      aria-current={currentPath === '/discover' ? 'page' : undefined}
    >
      发现
    </a>
  </div>
</nav>
