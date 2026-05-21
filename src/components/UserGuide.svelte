<script lang="ts">
  import { onMount } from 'svelte';
  import { detectBrowser, type BrowserInfo } from '$lib/browser-detect';
  import { getPWAInstallInfo, triggerPWAInstall, getPWAInstallGuide, shouldShowPWAInstall } from '$lib/pwa-install';
  import { getBackupLinks } from '$lib/domain-guard';

  let visible = $state(false);
  let forceShow = $state(false); // 强制显示（APP内浏览器）
  let browserInfo = $state<BrowserInfo | null>(null);
  let pwaInfo = $state<{ isInstallable: boolean; isInstalled: boolean; platform: string } | null>(null);
  let backupLinks = $state<{ domain: string; name: string; url: string }[]>([]);
  let installGuide = $state<{ title: string; steps: string[] } | null>(null);
  let copied = $state(false);

  onMount(() => {
    browserInfo = detectBrowser();
    pwaInfo = getPWAInstallInfo();
    backupLinks = getBackupLinks();
    installGuide = getPWAInstallGuide();

    // 检查是否需要显示引导
    const dismissed = localStorage.getItem('guide_dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      // APP内浏览器：1天内不再显示
      // 普通浏览器：3天内不再显示
      const days = browserInfo?.isBlocked ? 1 : 3;
      if (Date.now() - dismissedTime < days * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // APP内浏览器被屏蔽时强制显示
    if (browserInfo?.isBlocked) {
      forceShow = true;
      visible = true;
    } else if (shouldShowPWAInstall()) {
      setTimeout(() => {
        visible = true;
      }, 2000);
    }
  });

  function close() {
    visible = false;
    localStorage.setItem('guide_dismissed', Date.now().toString());
  }

  function skipForNow() {
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

  // 获取APP特定的引导文案
  function getAppGuide(): { icon: string; title: string; tip: string } {
    if (!browserInfo) return { icon: '🌐', title: '建议使用更好的浏览器', tip: '' };
    
    switch (browserInfo.type) {
      case 'wechat':
        return {
          icon: '💬',
          title: '微信内访问受限',
          tip: '点击右上角 ⋮ → 选择「在浏览器中打开」'
        };
      case 'qq':
        return {
          icon: '🐧',
          title: 'QQ内访问受限',
          tip: '点击右上角 → 选择「在浏览器中打开」'
        };
      case 'weibo':
        return {
          icon: '📱',
          title: '微博内访问受限',
          tip: '点击右上角 → 选择「在浏览器中打开」'
        };
      case 'uc':
        return {
          icon: '🔵',
          title: 'UC浏览器可能屏蔽内容',
          tip: '建议使用 Chrome 或 Edge 浏览器'
        };
      case 'baidu':
        return {
          icon: '🔍',
          title: '百度浏览器可能屏蔽内容',
          tip: '建议使用 Chrome 或 Edge 浏览器'
        };
      case '360':
        return {
          icon: '🛡️',
          title: '360浏览器可能屏蔽内容',
          tip: '建议使用 Chrome 或 Edge 浏览器'
        };
      case 'miui':
      case 'huawei':
      case 'vivo':
      case 'oppo':
        return {
          icon: '📱',
          title: `${browserInfo.name}可能屏蔽内容`,
          tip: '建议使用 Chrome 或 Edge 浏览器'
        };
      default:
        return {
          icon: '🌐',
          title: '建议使用更好的浏览器',
          tip: 'Chrome / Edge 访问更快，支持离线使用'
        };
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
      <div class="text-4xl mb-2">{appGuide.icon}</div>
      <h2 class="text-xl font-bold mb-1">{appGuide.title}</h2>
      {#if appGuide.tip}
        <p class="text-sm text-white/80">{appGuide.tip}</p>
      {/if}
    </div>

    <!-- 内容区 -->
    <div class="p-5">
      <!-- 推荐浏览器 -->
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
            class="flex flex-col items-center p-3 bg-gray-50 rounded-xl hover:bg-blue-50 transition-colors"
          >
            <div class="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center text-white text-xl mb-2">🧭</div>
            <span class="text-xs text-gray-700">Safari</span>
          </a>
        </div>
      </div>

      <!-- PWA 安装 -->
      {#if !pwaInfo?.isInstalled}
        <div class="mb-4 p-4 bg-pink-50 rounded-xl">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 bg-pink-500 rounded-lg flex items-center justify-center text-white">
              📲
            </div>
            <div>
              <h4 class="font-medium text-gray-800">安装到手机桌面</h4>
              <p class="text-xs text-gray-500">离线可用，永不失联</p>
            </div>
          </div>
          
          {#if pwaInfo?.platform === 'ios'}
            <div class="text-xs text-gray-600 space-y-1 mb-3">
              {#each installGuide?.steps || [] as step}
                <p>{step}</p>
              {/each}
            </div>
          {:else if pwaInfo?.isInstallable}
            <button
              onclick={handleInstall}
              class="w-full py-2.5 bg-pink-500 text-white rounded-lg font-medium hover:bg-pink-600 transition-colors"
            >
              立即安装
            </button>
          {:else}
            <div class="text-xs text-gray-600 space-y-1">
              {#each installGuide?.steps || [] as step}
                <p>{step}</p>
              {/each}
            </div>
          {/if}
        </div>
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
          <button
            onclick={skipForNow}
            class="flex-1 py-2.5 text-gray-500 text-sm"
          >
            暂不
          </button>
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
