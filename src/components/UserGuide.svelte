<script lang="ts">
  import { onMount } from 'svelte';
  import { detectBrowser, getBrowserGuideText, type BrowserInfo } from '$lib/browser-detect';
  import { getPWAInstallInfo, triggerPWAInstall, getPWAInstallGuide, dismissPWAInstall, shouldShowPWAInstall } from '$lib/pwa-install';
  import { getBackupLinks } from '$lib/domain-guard';

  let visible = $state(false);
  let tab = $state<'browser' | 'pwa' | 'bookmark'>('browser');
  let browserInfo = $state<BrowserInfo | null>(null);
  let pwaInfo = $state<{ isInstallable: boolean; isInstalled: boolean; platform: string } | null>(null);
  let backupLinks = $state<{ domain: string; name: string; url: string }[]>([]);
  let installGuide = $state<{ title: string; steps: string[] } | null>(null);

  onMount(() => {
    browserInfo = detectBrowser();
    pwaInfo = getPWAInstallInfo();
    backupLinks = getBackupLinks();
    installGuide = getPWAInstallGuide();

    // 检查是否需要显示引导
    const dismissed = localStorage.getItem('guide_dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      if (Date.now() - dismissedTime < 3 * 24 * 60 * 60 * 1000) {
        return; // 3天内不再显示
      }
    }

    // 被屏蔽的浏览器或需要安装 PWA 时显示
    if (browserInfo.isBlocked || shouldShowPWAInstall()) {
      setTimeout(() => {
        visible = true;
      }, 2000);
    }
  });

  function close() {
    visible = false;
    localStorage.setItem('guide_dismissed', Date.now().toString());
  }

  async function handleInstall() {
    const success = await triggerPWAInstall();
    if (success) {
      visible = false;
    }
  }

  function addBookmark() {
    const title = document.title;
    const url = window.location.href;
    
    try {
      // @ts-ignore
      if (window.external && window.external.AddFavorite) {
        // @ts-ignore
        window.external.AddFavorite(url, title);
      } else if (window.sidebar && window.sidebar.addPanel) {
        // @ts-ignore
        window.sidebar.addPanel(title, url, '');
      } else {
        alert('请按 Ctrl+D (Windows) 或 Cmd+D (Mac) 添加书签');
      }
    } catch {
      alert('请按 Ctrl+D (Windows) 或 Cmd+D (Mac) 添加书签');
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(window.location.href);
    alert('链接已复制，请粘贴分享给朋友');
  }
</script>

{#if visible}
  <!-- 遮罩 -->
  <div class="fixed inset-0 bg-black/60 z-[200]" onclick={close}></div>

  <!-- 弹窗 -->
  <div class="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl z-[201] max-w-md mx-auto overflow-hidden shadow-2xl">
    <!-- Tab 切换 -->
    <div class="flex border-b border-gray-100">
      <button
        onclick={() => tab = 'browser'}
        class="flex-1 py-3 text-sm font-medium transition-colors {tab === 'browser' ? 'text-pink-500 border-b-2 border-pink-500' : 'text-gray-500'}"
      >
        浏览器
      </button>
      <button
        onclick={() => tab = 'pwa'}
        class="flex-1 py-3 text-sm font-medium transition-colors {tab === 'pwa' ? 'text-pink-500 border-b-2 border-pink-500' : 'text-gray-500'}"
      >
        安装APP
      </button>
      <button
        onclick={() => tab = 'bookmark'}
        class="flex-1 py-3 text-sm font-medium transition-colors {tab === 'bookmark' ? 'text-pink-500 border-b-2 border-pink-500' : 'text-gray-500'}"
      >
        收藏
      </button>
    </div>

    <!-- 内容区 -->
    <div class="p-5">
      {#if tab === 'browser'}
        <div class="text-center mb-4">
          <div class="w-16 h-16 mx-auto mb-3 bg-pink-100 rounded-full flex items-center justify-center">
            {#if browserInfo?.isBlocked}
              <svg class="w-8 h-8 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-1.964-1.333-2.732 0L4.082 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            {:else}
              <svg class="w-8 h-8 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            {/if}
          </div>
          <h3 class="text-lg font-bold text-gray-800 mb-1">
            {#if browserInfo?.isBlocked}
              当前浏览器可能无法正常访问
            {:else}
              建议使用更好的浏览器
            {/if}
          </h3>
          <p class="text-sm text-gray-500">
            {#if browserInfo?.isBlocked}
              {browserInfo.name} 内置屏蔽机制，建议更换浏览器
            {:else}
              Chrome / Edge 访问更快，支持离线使用
            {/if}
          </p>
        </div>

        <div class="space-y-2 mb-4">
          <a
            href="https://www.google.com/chrome/"
            target="_blank"
            class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div class="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">C</div>
            <div class="flex-1">
              <div class="font-medium text-gray-800">Chrome 浏览器</div>
              <div class="text-xs text-gray-500">推荐 · 速度快 · 支持 PWA</div>
            </div>
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </a>
          <a
            href="https://www.microsoft.com/edge"
            target="_blank"
            class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div class="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center text-white font-bold">E</div>
            <div class="flex-1">
              <div class="font-medium text-gray-800">Edge 浏览器</div>
              <div class="text-xs text-gray-500">推荐 · 微软出品 · 国内下载快</div>
            </div>
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>

        {#if browserInfo?.isBlocked && browserInfo.isMobile}
          <div class="text-center text-xs text-gray-400 p-3 bg-yellow-50 rounded-lg">
            请点击右上角 ⋮ → 选择"在浏览器中打开"
          </div>
        {/if}
      {:else if tab === 'pwa'}
        <div class="text-center mb-4">
          <div class="w-16 h-16 mx-auto mb-3 bg-pink-100 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 class="text-lg font-bold text-gray-800 mb-1">{installGuide?.title || '安装到设备'}</h3>
          <p class="text-sm text-gray-500">像 APP 一样使用，离线也能看</p>
        </div>

        {#if pwaInfo?.platform === 'ios'}
          <div class="space-y-2 mb-4">
            {#each installGuide?.steps || [] as step}
              <div class="flex items-start gap-2 text-sm text-gray-600">
                <span class="text-pink-500">•</span>
                <span>{step}</span>
              </div>
            {/each}
          </div>
        {:else if pwaInfo?.isInstallable}
          <button
            onclick={handleInstall}
            class="w-full py-3 bg-pink-500 text-white rounded-lg font-medium hover:bg-pink-600 transition-colors"
          >
            立即安装
          </button>
        {:else}
          <div class="space-y-2 mb-4">
            {#each installGuide?.steps || [] as step}
              <div class="flex items-start gap-2 text-sm text-gray-600">
                <span class="text-pink-500">•</span>
                <span>{step}</span>
              </div>
            {/each}
          </div>
        {/if}

        <div class="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-600">
          💡 安装后可离线使用，即使域名变更也能正常访问
        </div>
      {:else if tab === 'bookmark'}
        <div class="text-center mb-4">
          <div class="w-16 h-16 mx-auto mb-3 bg-pink-100 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <h3 class="text-lg font-bold text-gray-800 mb-1">收藏本站，永不失联</h3>
          <p class="text-sm text-gray-500">域名可能变更，收藏后随时找到我们</p>
        </div>

        <div class="space-y-2 mb-4">
          <button
            onclick={addBookmark}
            class="w-full py-3 bg-pink-500 text-white rounded-lg font-medium hover:bg-pink-600 transition-colors"
          >
            添加到书签
          </button>
          <button
            onclick={copyUrl}
            class="w-full py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            复制链接分享
          </button>
        </div>

        {#if backupLinks.length > 0}
          <div class="mt-4">
            <p class="text-xs text-gray-500 mb-2">备用域名（收藏其中一个即可）：</p>
            <div class="flex flex-wrap gap-2">
              {#each backupLinks as link}
                <a
                  href={link.url}
                  class="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
                >
                  {link.name}
                </a>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <!-- 关闭按钮 -->
    <button
      onclick={close}
      class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
{/if}
