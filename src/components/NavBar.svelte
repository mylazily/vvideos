<script lang="ts">
  import { page } from '$app/stores';

  let currentPath = $derived($page.url.pathname);
</script>

<nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50">
  <div class="flex items-center justify-around h-12">
    <a
      href="/"
      class="flex items-center justify-center flex-1 h-full text-sm {currentPath === '/' ? 'text-pink-500 font-medium' : 'text-gray-600'}"
    >
      首页
    </a>
    <a
      href="/discover"
      class="flex items-center justify-center flex-1 h-full text-sm {currentPath === '/discover' ? 'text-pink-500 font-medium' : 'text-gray-600'}"
    >
      发现
    </a>
    <a
      href="/category/全部/1"
      class="flex items-center justify-center flex-1 h-full text-sm {currentPath.startsWith('/category') ? 'text-pink-500 font-medium' : 'text-gray-600'}"
    >
      分类
    </a>
    <a
      href="/profile"
      class="flex items-center justify-center flex-1 h-full text-sm {currentPath === '/profile' ? 'text-pink-500 font-medium' : 'text-gray-600'}"
    >
      我的
    </a>
  </div>
</nav>
