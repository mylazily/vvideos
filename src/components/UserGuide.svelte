<script lang="ts">
  import { onMount } from 'svelte';
  import { detectBrowser, type BrowserInfo } from '$lib/browser-detect';
  import { getPWAInstallInfo, triggerPWAInstall, getPWAInstallGuide, shouldShowPWAInstall } from '$lib/pwa-install';
  import { getBackupLinks } from '$lib/domain-guard';

  interface Props {
    blocked?: boolean;
  }

  let { blocked = false }: Props = $props();

  // 当 blocked=true 时，直接显示引导（不等待onMount）
  let visible = $state(blocked);
  let browserInfo = $state<BrowserInfo | null>(null);
  let pwaInfo = $state<{ isInstallable: boolean; isInstalled: boolean; platform: string } | null>(null);
  let backupLinks = $state<{ domain: string; name: string; url: string }[]>([]);
  let installGuide = $state<{ title: string; steps: string[] } | null>(null);
  let copied = $state(false);

  // 引导步骤: 'pwa' | 'browser'
  let guideStep = $state<'pwa' | 'browser'>('pwa');

  onMount(() => {
    browserInfo = detectBrowser();
    pwaInfo = getPWAInstallInfo();
    backupLinks = getBackupLinks();
    installGuide = getPWAInstallGuide();

    // 国产APP内打开 → 全屏引导（layout已隐藏页面内容）
    if (blocked) {
      // 优先显示 PWA 安装引导
      guideStep = (pwaInfo && !pwaInfo.isInstalled) ? 'pwa' : 'browser';
      return;
    }

    // 普通浏览器 → 弹窗引导（检查 dismissed）
    const dismissed = localStorage.getItem('guide_dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      if (Date.now() - dismissedTime < 3 * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    if (pwaInfo && !pwaInfo.isInstalled && (pwaInfo.isInstallable || pwaInfo.platform === 'ios')) {
      guideStep = 'pwa';
      visible = true;
    } else if (shouldShowPWAInstall()) {
      guideStep = 'pwa';
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
  {#if blocked}
    <!-- ========== 全屏引导模式（国产APP内打开） ========== -->
    <div class="fixed inset-0 bg-gradient-to-b from-pink-500 to-rose-600 z-[9999] flex flex-col">
      <!-- 顶部区域 -->
      <div class="flex-1 flex flex-col items-center justify-center px-6 text-center text-white">
        {#if guideStep === 'pwa'}
          <!-- PWA 安装引导 -->
          <div class="text-6xl mb-4">📲</div>
          <h2 class="text-2xl font-bold mb-2">安装到手机桌面</h2>
          <p class="text-white/80 text-sm mb-6">离线可用，永不失联，体验更佳</p>

          {#if !pwaInfo}
            <!-- 加载中 -->
            <div class="w-full max-w-sm py-8">
              <div class="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
              <p class="text-white/70 text-sm mt-4">检测浏览器环境...</p>
            </div>
          {:else if pwaInfo.platform === 'ios'}
            <div class="w-full max-w-sm bg-white/15 backdrop-blur-sm rounded-2xl p-5 mb-6">
              <p class="text-sm font-medium mb-3">iOS 安装步骤：</p>
              <div class="text-sm space-y-2 text-white/90 text-left">
                {#each installGuide?.steps || ['点击底部分享按钮', '选择"添加到主屏幕"', '点击"添加"完成安装'] as step, i}
                  <div class="flex gap-2">
                    <span class="flex-shrink-0 w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-xs">{i + 1}</span>
                    <span>{step}</span>
                  </div>
                {/each}
              </div>
            </div>
          {:else if pwaInfo.isInstallable}
            <button
              onclick={handleInstall}
              class="w-full max-w-sm py-4 bg-white text-pink-600 rounded-2xl font-bold text-lg hover:bg-white/90 transition-colors flex items-center justify-center gap-2 shadow-lg"
            >
              <span>📲</span>
              <span>立即安装到桌面</span>
            </button>
          {:else}
            <div class="w-full max-w-sm bg-white/15 backdrop-blur-sm rounded-2xl p-5 mb-6">
              <p class="text-sm font-medium mb-3">安装步骤：</p>
              <div class="text-sm space-y-2 text-white/90 text-left">
                {#each installGuide?.steps || ['点击右上角菜单', '选择"安装应用"或"添加到主屏幕"', '完成安装'] as step, i}
                  <div class="flex gap-2">
                    <span class="flex-shrink-0 w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-xs">{i + 1}</span>
                    <span>{step}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- 切换到浏览器推荐 -->
          <button
            onclick={() => guideStep = 'browser'}
            class="text-white/70 text-sm underline underline-offset-2 mt-4"
          >
            无法安装？查看推荐浏览器 →
          </button>
        {:else}
          <!-- 浏览器推荐引导 -->
          <div class="text-6xl mb-4">{appGuide.icon}</div>
          <h2 class="text-2xl font-bold mb-2">{appGuide.title}</h2>
          <p class="text-white/80 text-sm mb-6">{appGuide.tip}</p>

          <!-- 推荐浏览器 -->
          <div class="w-full max-w-sm grid grid-cols-3 gap-3 mb-6">
            <a
              href="https://www.google.com/chrome/"
              target="_blank"
              class="flex flex-col items-center p-4 bg-white/15 backdrop-blur-sm rounded-2xl hover:bg-white/25 transition-colors"
            >
              <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-500 text-xl font-bold mb-2">C</div>
              <span class="text-xs text-white">Chrome</span>
            </a>
            <a
              href="https://www.microsoft.com/edge"
              target="_blank"
              class="flex flex-col items-center p-4 bg-white/15 backdrop-blur-sm rounded-2xl hover:bg-white/25 transition-colors"
            >
              <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-green-500 text-xl font-bold mb-2">E</div>
              <span class="text-xs text-white">Edge</span>
            </a>
            <a
              href="https://www.apple.com/safari/"
              target="_blank"
              class="flex flex-col items-center p-4 bg-white/15 backdrop-blur-sm rounded-2xl hover:bg-white/25 transition-colors"
            >
              <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-gray-800 text-xl mb-2">🧭</div>
              <span class="text-xs text-white">Safari</span>
            </a>
          </div>

          <!-- 切换到 PWA 安装 -->
          <button
            onclick={() => guideStep = 'pwa'}
            class="text-white/70 text-sm underline underline-offset-2"
          >
            ← 返回安装到桌面
          </button>
        {/if}
      </div>

      <!-- 底部操作区 -->
      <div class="px-6 pb-8 space-y-3">
        <!-- 复制链接 -->
        <button
          onclick={copyUrl}
          class="w-full py-3.5 bg-white/15 backdrop-blur-sm text-white rounded-xl font-medium hover:bg-white/25 transition-colors flex items-center justify-center gap-2"
        >
          {#if copied}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            已复制链接
          {:else}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            复制链接，在浏览器打开
          {/if}
        </button>

        <!-- 备用域名 -->
        {#if backupLinks.length > 0}
          <div class="text-center">
            <p class="text-xs text-white/50 mb-2">备用域名（收藏防丢失）</p>
            <div class="flex justify-center flex-wrap gap-2">
              {#each backupLinks as link}
                <a
                  href={link.url}
                  class="px-3 py-1 text-xs bg-white/10 text-white/70 rounded-full hover:bg-white/20 transition-colors"
                >
                  {link.domain}
                </a>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <!-- ========== 弹窗引导模式（普通浏览器） ========== -->
    <div class="fixed inset-0 bg-black/70 z-[200]" role="presentation" onclick={close}></div>

    <div class="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-2xl z-[201] max-w-md mx-auto overflow-hidden shadow-2xl">
      <!-- 头部 -->
      <div class="bg-gradient-to-r from-pink-500 to-rose-500 p-6 text-center text-white">
        <div class="text-4xl mb-2">📲</div>
        <h2 class="text-xl font-bold mb-1">安装到手机桌面</h2>
        <p class="text-sm text-white/80">离线可用，永不失联</p>
      </div>

      <!-- 内容区 -->
      <div class="p-5">
        {#if pwaInfo && !pwaInfo.isInstalled}
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
          <button onclick={close} class="flex-1 py-2.5 text-gray-500 text-sm">暂不</button>
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
{/if}
