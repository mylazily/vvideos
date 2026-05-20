<script lang="ts">
  import { onMount } from 'svelte';
  import NavBar from '$components/NavBar.svelte';
  import { isLoggedIn, getUser, logout, serverLogout, fetchCurrentUser, type UserInfo } from '$lib/auth';

  let loggedIn = $state(false);
  let user = $state<UserInfo | null>(null);
  let showLoginModal = $state(false);
  let isRegister = $state(false);
  let username = $state('');
  let password = $state('');
  let nickname = $state('');
  let authLoading = $state(false);
  let authError = $state('');

  onMount(async () => {
    loggedIn = isLoggedIn();
    if (loggedIn) {
      user = getUser();
      // 验证 token 是否有效
      const freshUser = await fetchCurrentUser();
      if (freshUser) {
        user = freshUser;
      } else {
        loggedIn = false;
        user = null;
      }
    }
  });

  function openLogin() {
    showLoginModal = true;
    isRegister = false;
    authError = '';
    username = '';
    password = '';
    nickname = '';
  }

  function switchMode() {
    isRegister = !isRegister;
    authError = '';
  }

  async function handleSubmit() {
    if (!username.trim() || !password.trim()) {
      authError = '请填写完整信息';
      return;
    }

    authLoading = true;
    authError = '';

    const { login, register } = await import('$lib/auth');

    if (isRegister) {
      const result = await register(username.trim(), password, nickname.trim() || undefined);
      if (result.success && result.user) {
        loggedIn = true;
        user = result.user;
        showLoginModal = false;
      } else {
        authError = result.message;
      }
    } else {
      const result = await login(username.trim(), password);
      if (result.success && result.user) {
        loggedIn = true;
        user = result.user;
        showLoginModal = false;
      } else {
        authError = result.message;
      }
    }

    authLoading = false;
  }

  async function handleLogout() {
    await serverLogout();
    loggedIn = false;
    user = null;
  }
</script>

<svelte:head>
  <title>我的 - 必爱必爱</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-50">
    <h1 class="text-lg font-bold text-pink-500">我的</h1>
  </header>

  <main class="p-4 pb-16">
    <!-- 用户信息 -->
    <div class="bg-white rounded-lg p-4 mb-4">
      {#if loggedIn && user}
        <div class="flex items-center gap-3">
          <div class="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center text-pink-500 text-xl font-bold">
            {user.nickname?.charAt(0) || user.username.charAt(0)}
          </div>
          <div class="flex-1">
            <h2 class="font-medium text-gray-800">{user.nickname || user.username}</h2>
            <p class="text-sm text-gray-500">@{user.username}</p>
          </div>
          <button
            onclick={handleLogout}
            class="text-sm text-gray-400 hover:text-red-500 transition-colors"
          >
            退出
          </button>
        </div>
      {:else}
        <div class="flex items-center gap-3">
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 text-xl">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div class="flex-1">
            <h2 class="font-medium text-gray-800">未登录</h2>
            <p class="text-sm text-gray-500">登录享受更多功能</p>
          </div>
          <button
            onclick={openLogin}
            class="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg hover:bg-pink-600 transition-colors"
          >
            登录
          </button>
        </div>
      {/if}
    </div>

    <!-- 功能菜单 -->
    <div class="bg-white rounded-lg overflow-hidden">
      <a href="/history" class="flex items-center justify-between px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-gray-700">观看历史</span>
        </div>
        <span class="text-gray-400">></span>
      </a>
      <a href="/favorite" class="flex items-center justify-between px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span class="text-gray-700">我的收藏</span>
        </div>
        <span class="text-gray-400">></span>
      </a>
      <a href="/settings" class="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span class="text-gray-700">设置</span>
        </div>
        <span class="text-gray-400">></span>
      </a>
    </div>
  </main>

  <!-- 登录/注册弹窗 -->
  {#if showLoginModal}
    <!-- 遮罩 -->
    <div class="fixed inset-0 bg-black/50 z-[100]" onclick={() => showLoginModal = false}></div>
    
    <!-- 弹窗 -->
    <div class="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white rounded-xl p-6 z-[101] max-w-sm mx-auto">
      <h2 class="text-lg font-bold text-gray-800 mb-4">{isRegister ? '注册' : '登录'}</h2>
      
      {#if authError}
        <div class="mb-3 px-3 py-2 bg-red-50 text-red-500 text-sm rounded-lg">{authError}</div>
      {/if}
      
      <div class="space-y-3">
        <input
          bind:value={username}
          type="text"
          placeholder="用户名"
          class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-pink-500 transition-colors"
        />
        
        {#if isRegister}
          <input
            bind:value={nickname}
            type="text"
            placeholder="昵称（可选）"
            class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-pink-500 transition-colors"
          />
        {/if}
        
        <input
          bind:value={password}
          type="password"
          placeholder="密码"
          class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-pink-500 transition-colors"
          onkeydown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        
        <button
          onclick={handleSubmit}
          disabled={authLoading}
          class="w-full py-2.5 bg-pink-500 text-white text-sm rounded-lg disabled:bg-pink-300 hover:bg-pink-600 transition-colors"
        >
          {authLoading ? '请稍候...' : (isRegister ? '注册' : '登录')}
        </button>
        
        <div class="text-center text-sm text-gray-500">
          {#if isRegister}
            已有账号？<button onclick={switchMode} class="text-pink-500">去登录</button>
          {:else}
            没有账号？<button onclick={switchMode} class="text-pink-500">去注册</button>
          {/if}
        </div>
      </div>
      
      <button
        onclick={() => showLoginModal = false}
        class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600"
      >
        ×
      </button>
    </div>
  {/if}

  <NavBar />
</div>
