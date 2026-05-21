<script lang="ts">
  import { onMount } from 'svelte';
  import { detectBrowser, type BrowserInfo } from '$lib/browser-detect';
  import { getPWAInstallInfo, triggerPWAInstall, getPWAInstallGuide, shouldShowPWAInstall } from '$lib/pwa-install';
  import { getBackupLinks } from '$lib/domain-guard';

  let visible = $state(false);
  let forceShow = $state(false);
  let browserInfo = $state<BrowserInfo | null>(null);
  let pwaInfo = $state<{ isInstallable: boolean; isInstalled: boolean; platform: string } | null>(null);
  let backupLinks = $state<{ domain: string; name: string; url: string }[]>([]);
  let installGuide = $state<{ title: string; steps: string[] } | null>(null);
  let copied = $state(false);

  // 是否优先显示 PWA 安装
  let showPWAFirst = $state(false);

  onMount(() => {
    browserInfo = detectBrowser();
    pwaInfo = getPWAInstallInfo();
    backupLinks = getBackupLinks();
    installGuide = getPWAInstallGuide();

    // 检查是否需要显示引导
    const dismissed = localStorage.getItem('guide_dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const days = browserInfo?.isBlocked ? 1 : 3;
      if (Date.now() - dismissedTime < days * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // 决定显示优先级
    // 1. 如果可以安装 PWA，优先显示 PWA
    // 2. 如果是国产浏览器，显示浏览器推荐
    if (pwaInfo && !pwaInfo.isInstalled && (pwaInfo.isInstallable || pwaInfo.platform === 'ios')) {
      showPWAFirst = true;
      visible = true;
    } else if (browserInfo?.isBlocked) {
      showPWAFirst = false;
      forceShow = true;
      visible = true;
    } else if (shouldShowPWAInstall()) {
      showPWAFirst = true;
      setTimeout(() => {
        visible = true;
      }, 1500);
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

  function copyUrl() {
    navigator.clipboard.writeText(window.location.href);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }

  function getAppGuide(): { icon: string; title: string; tip: string } {
    if (!browserInfo) return { icon: '📲', title: '安装应用', tip: '' };
    
    switch (browserInfo.type) {
      case 'wechat':
        return { icon: '💬', title: '微信内访问受限', tip: '点击右上角 ⋮ → 选择「在浏览器中打开」' };
      case 'qq':
        return { icon: '🐧', title: 'QQ内访问受限', tip: '点击右上角 → 选择「在浏览器中打开」' };
      case 'weibo':
        return { icon: '📱', title: '微博内访问受限', tip: '点击右上角 → 选择「在浏览器中打开」' };
      default:
        return { icon: '📱', title: `${browserInfo.name}可能屏蔽内容`, tip: '建议使用 Chrome 或 Edge 浏览器' };
    }
  }

  const appGuide = $derived(getAppGuide());
</script>

{#if visible}
  <!-- 遮罩 -->
  <div class="fixed inset-0 bg-black/70 z-[200]" onclick={forceShow ? undefined : close}></div>

  <!-- 弹窗 -->
  <div class="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl z-[201] max-w-md mx-auto overflow-hidden shadow-2xl">
    <!-- 头部 -->
    <div class="bg-gradient-to-r from-pink-500 to-rose-500 p-6 text-center text-white">
      <div class="text-4xl mb-2">{showPWAFirst ? '📲' : appGuide.icon}</div>
      <h2 class="text-xl font-bold mb-1">{showPWAFirst ? '安装到手机桌面' : appGuide.title}</h2>
      {#if showPWAFirst}
        <p class="text-sm text-white/80">离线可用，永不失联</p>
      {:else if appGuide.tip}
        <p class="text-sm text-white/80">{appGuide.tip}</p>
      {/if}
    </div>

    <!-- 内容区 -->
    <div class="p-5">
      {#if showPWAFirst && pwaInfo && !pwaInfo.isInstalled}
        <!-- PWA 安装（优先显示） -->
        <div class="mb-4">
          {#if pwaInfo.platform === 'ios'}
            <div class="p-4 bg-blue-50 rounded-xl mb-3">
              <p class="text-sm text-gray-700 font-medium mb-2">iOS 安装步骤：</p>
              <div class="text-xs text-gray-600 space-y-1">
                {#each installGuide?.steps || [] as step}
                  <p>{step}</p>
                {/each}
              </div>
            </div>
          {:else if pwaInfo.isInstallable}
            <button
              onclick={handleInstall}
              class="w-full py-3 bg-pink-500 text-white rounded-xl font-medium hover:bg-pink-600 transition-colors flex items-center justify-center gap-2"
            >
              <span>📲</span>
              <span>立即安装</span>
            </button>
          {:else}
            <div class="p-4 bg-blue-50 rounded-xl">
              <div class="text-xs text-gray-600 space-y-1">
                {#each installGuide?.steps || [] as step}
                  <p>{step}</p>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- 切换到浏览器推荐 -->
        {#if browserInfo?.isBlocked}
          <button
            onclick={() => showPWAFirst = false}
            class="w-full text-center text-sm text-gray-500 py-2"
          >
            当前浏览器可能受限，查看推荐浏览器 →
          </button>
        {/if}
      {:else}
        <!-- 浏览器推荐 -->
        <div class="mb-4">
          <h3 class="text-sm font-medium text-gray-500 mb-3">推荐浏览器</h3>
          <div class="grid grid-cols-3 gap-3">
            <a
              href="https://www.google.com/chrome/"
              target="_blank"
              class="flex flex-col items-center p-3 bg-gray-50 rounded-xl hover:bg-blue-50 transition-colors"
            >
              <div class="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-white text-xl font-bold mb-2">C</div>
              <span class="text-xs text-gray-700">Chrome</span>
            </a>
            <a
              href="https://www.microsoft.com/edge"
              target="_blank"
              class="flex flex-col items-center p-3 bg-gray-50 rounded-xl hover:bg-green-50 transition-colors"
            >
              <div class="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center text-white text-xl font-bold mb-2">E</div>
              <span class="text-xs text-gray-700">Edge</span>
            </a>
            <a
              href="https://www.apple.com/safari/"
              target="_blank"
              class="flex flex-col items-center p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <div class="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center text-white text-xl mb-2">🧭</div>
              <span class="text-xs text-gray-700">Safari</span>
            </a>
          </div>
        </div>

        <!-- 切换到 PWA 安装 -->
        {#if pwaInfo && !pwaInfo.isInstalled}
          <button
            onclick={() => showPWAFirst = true}
            class="w-full p-3 bg-pink-50 rounded-xl text-pink-600 text-sm font-medium hover:bg-pink-100 transition-colors mb-4"
          >
            📲 安装到桌面，离线可用
          </button>
        {/if}
      {/if}

      <!-- 复制链接 -->
      <div class="mb-4">
        <button
          onclick={copyUrl}
          class="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
        >
          {#if copied}
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            已复制
          {:else}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            复制链接，在浏览器打开
          {/if}
        </button>
      </div>

      <!-- 备用域名 -->
      {#if backupLinks.length > 0}
        <div class="mb-4">
          <p class="text-xs text-gray-500 mb-2">备用域名（收藏防丢失）：</p>
          <div class="flex flex-wrap gap-2">
            {#each backupLinks as link}
              <a
                href={link.url}
                class="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-pink-50 hover:text-pink-500 transition-colors"
              >
                {link.domain}
              </a>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 底部按钮 -->
      <div class="flex gap-3">
        {#if !forceShow}
          <button onclick={close} class="flex-1 py-2.5 text-gray-500 text-sm">暂不</button>
        {/if}
        <button
          onclick={close}
          class="flex-1 py-2.5 bg-pink-500 text-white rounded-lg font-medium hover:bg-pink-600 transition-colors"
        >
          知道了
        </button>
      </div>
    </div>
  </div>
{/if}
