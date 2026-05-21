<script lang="ts">
  import { onMount } from 'svelte';

  const AUTH_KEY = 'admin_token';

  interface Source {
    id: number;
    name: string;
    api_url: string;
    status: number;
    last_collect_at: number;
    total_videos: number;
    created_at: number;
  }

  interface Log {
    id: number;
    source_id: number;
    source_name: string;
    action: string;
    details: string;
    new_count: number;
    error_msg: string;
    created_at: number;
  }

  interface Stats {
    totalVideos: number;
    sourceCount: number;
    todayCollectCount: number;
    todayNewVideos: number;
  }

  let isAuthenticated = $state(false);
  let passwordInput = $state('');
  let authError = $state('');
  let loginLoading = $state(false);
  let stats = $state<Stats | null>(null);
  let sources = $state<Source[]>([]);
  let logs = $state<Log[]>([]);
  let loading = $state(false);
  let collecting = $state(false);
  let message = $state('');
  let newSourceName = $state('');
  let newSourceUrl = $state('');

  // 带认证的 fetch 封装
  function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = sessionStorage.getItem(AUTH_KEY);
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': 'Bearer ' + (token || ''),
        'Content-Type': options.headers?.['Content-Type'] || 'application/json'
      }
    });
  }

  onMount(() => {
    const token = sessionStorage.getItem(AUTH_KEY);
    if (token) {
      isAuthenticated = true;
      loadData();
    }
  });

  async function handleLogin() {
    if (!passwordInput) return;
    loginLoading = true;
    authError = '';
    try {
      const res = await fetch('/api/aadmin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem(AUTH_KEY, data.token);
        isAuthenticated = true;
        loadData();
      } else {
        authError = data.message || '密码错误';
        passwordInput = '';
      }
    } catch {
      authError = '网络错误';
    } finally {
      loginLoading = false;
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(AUTH_KEY);
    isAuthenticated = false;
    passwordInput = '';
    stats = null;
    sources = [];
    logs = [];
  }

  async function loadData() {
    loading = true;
    try {
      const [statsRes, sourcesRes, logsRes] = await Promise.all([
        authFetch('/api/aadmin/stats'),
        authFetch('/api/aadmin/sources'),
        authFetch('/api/aadmin/logs?limit=20')
      ]);

      // 检查是否认证失败
      if (statsRes.status === 401 || sourcesRes.status === 401) {
        handleLogout();
        return;
      }

      const [statsData, sourcesData, logsData] = await Promise.all([
        statsRes.json(),
        sourcesRes.json(),
        logsRes.json()
      ]);

      if (statsData.success) stats = statsData.data;
      if (sourcesData.success) sources = sourcesData.data;
      if (logsData.success) logs = logsData.data;
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function startCollect(sourceId: number) {
    collecting = true;
    message = '';
    try {
      const res = await authFetch('/api/aadmin/collect', {
        method: 'POST',
        body: JSON.stringify({ source_id: sourceId })
      });
      const data = await res.json();
      message = data.message || '操作完成';
      if (data.success) {
        setTimeout(loadData, 1000);
      }
    } catch {
      message = '请求失败';
    } finally {
      collecting = false;
    }
  }

  async function addSource() {
    if (!newSourceName.trim() || !newSourceUrl.trim()) {
      message = '请填写名称和接口地址';
      return;
    }
    try {
      const res = await authFetch('/api/aadmin/sources', {
        method: 'POST',
        body: JSON.stringify({ name: newSourceName, api_url: newSourceUrl })
      });
      const data = await res.json();
      if (data.success) {
        newSourceName = '';
        newSourceUrl = '';
        await loadData();
        message = '添加成功';
      } else {
        message = data.message || '添加失败';
      }
    } catch {
      message = '请求失败';
    }
  }

  async function deleteSource(id: number) {
    if (!confirm('确定删除这个采集源吗？')) return;
    try {
      const res = await authFetch('/api/aadmin/sources?id=' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await loadData();
        message = '删除成功';
      }
    } catch {
      message = '删除失败';
    }
  }

  async function runTimming() {
    collecting = true;
    message = '正在执行定时采集...';
    try {
      const res = await authFetch('/api/timming?enforce=1');
      const data = await res.json();
      message = data.msg;
      if (data.success) {
        setTimeout(loadData, 2000);
      }
    } catch {
      message = '执行失败';
    } finally {
      collecting = false;
    }
  }

  function formatTime(ts: number): string {
    if (!ts) return '-';
    const d = new Date(ts * 1000);
    return d.toLocaleString('zh-CN');
  }
</script>

<svelte:head>
  <title>管理后台 - 必爱必爱</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if !isAuthenticated}
  <!-- 密码登录界面 -->
  <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 class="text-xl font-bold text-gray-800">管理后台</h1>
        <p class="text-sm text-gray-500 mt-1">请输入密码访问</p>
      </div>

      <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
        <input
          bind:value={passwordInput}
          type="password"
          placeholder="请输入密码"
          class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
          autocomplete="off"
        />
        {#if authError}
          <p class="text-red-500 text-sm mt-2">{authError}</p>
        {/if}
        <button
          type="submit"
          disabled={loginLoading}
          class="w-full mt-4 py-3 bg-pink-500 text-white rounded-xl font-medium hover:bg-pink-600 transition-colors disabled:bg-pink-300"
        >
          {loginLoading ? '验证中...' : '进入后台'}
        </button>
      </form>

      <a href="/" class="block text-center text-sm text-gray-500 mt-4 hover:text-pink-500">
        ← 返回首页
      </a>
    </div>
  </div>
{:else}
  <!-- 后台管理界面 -->
  <div class="min-h-screen bg-gray-50">
    <header class="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 z-50">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-pink-500">管理后台</h1>
        <div class="flex items-center gap-4">
          <button onclick={handleLogout} class="text-sm text-gray-500 hover:text-red-500">
            退出登录
          </button>
          <a href="/" class="text-gray-600">返回首页</a>
        </div>
      </div>
    </header>

    <main class="p-4 pb-20">
      {#if loading}
        <div class="flex items-center justify-center py-20">
          <div class="w-8 h-8 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
        </div>
      {:else}
        <!-- 统计卡片 -->
        {#if stats}
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-white rounded-lg p-4">
              <div class="text-sm text-gray-500">总视频数</div>
              <div class="text-2xl font-bold text-pink-500">{stats.totalVideos}</div>
            </div>
            <div class="bg-white rounded-lg p-4">
              <div class="text-sm text-gray-500">采集源</div>
              <div class="text-2xl font-bold text-blue-500">{stats.sourceCount}</div>
            </div>
            <div class="bg-white rounded-lg p-4">
              <div class="text-sm text-gray-500">今日采集</div>
              <div class="text-2xl font-bold text-green-500">{stats.todayCollectCount}</div>
            </div>
            <div class="bg-white rounded-lg p-4">
              <div class="text-sm text-gray-500">今日新增</div>
              <div class="text-2xl font-bold text-orange-500">{stats.todayNewVideos}</div>
            </div>
          </div>
        {/if}

        <!-- 消息提示 -->
        {#if message}
          <div class="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg mb-4">{message}</div>
        {/if}

        <!-- 定时采集按钮 -->
        <div class="bg-white rounded-lg p-4 mb-6">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="font-medium text-gray-800">定时采集</h2>
              <p class="text-sm text-gray-500">每小时自动执行一次</p>
            </div>
            <button
              onclick={runTimming}
              disabled={collecting}
              class="px-4 py-2 bg-green-500 text-white text-sm rounded-lg disabled:bg-gray-300"
            >
              {collecting ? '执行中...' : '立即执行'}
            </button>
          </div>
        </div>

        <!-- 添加采集源 -->
        <div class="bg-white rounded-lg p-4 mb-6">
          <h2 class="font-medium text-gray-800 mb-3">添加采集源</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              bind:value={newSourceName}
              type="text"
              placeholder="采集源名称"
              class="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <input
              bind:value={newSourceUrl}
              type="text"
              placeholder="接口地址，如：https://api.example.com/api.php/provide/vod/"
              class="px-3 py-2 border border-gray-200 rounded-lg text-sm md:col-span-2"
            />
          </div>
          <button
            onclick={addSource}
            class="mt-3 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg"
          >
            添加
          </button>
        </div>

        <!-- 采集源 -->
        <div class="bg-white rounded-lg mb-6">
          <div class="px-4 py-3 border-b border-gray-100">
            <h2 class="font-medium text-gray-800">采集源</h2>
          </div>
          <div class="divide-y divide-gray-100">
            {#each sources as source}
              <div class="px-4 py-3 flex items-center justify-between">
                <div class="flex-1">
                  <div class="font-medium text-gray-800">{source.name}</div>
                  <div class="text-xs text-gray-400 break-all">{source.api_url}</div>
                  <div class="text-xs text-gray-400 mt-1">
                    状态: {source.status === 1 ? '启用' : '禁用'} |
                    视频: {source.total_videos} |
                    最后采集: {formatTime(source.last_collect_at)}
                  </div>
                </div>
                <div class="flex gap-2">
                  <button
                    onclick={() => startCollect(source.id)}
                    disabled={collecting || source.status !== 1}
                    class="px-3 py-1.5 bg-pink-500 text-white text-sm rounded disabled:bg-gray-300"
                  >
                    {collecting ? '采集中...' : '采集'}
                  </button>
                  <button
                    onclick={() => deleteSource(source.id)}
                    class="px-3 py-1.5 bg-red-500 text-white text-sm rounded"
                  >
                    删除
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- 采集日志 -->
        <div class="bg-white rounded-lg">
          <div class="px-4 py-3 border-b border-gray-100">
            <h2 class="font-medium text-gray-800">采集日志</h2>
          </div>
          <div class="divide-y divide-gray-100">
            {#each logs as log}
              <div class="px-4 py-3">
                <div class="flex items-center justify-between">
                  <span class="font-medium text-gray-800">{log.source_name || '未知源'}</span>
                  <span class="text-xs text-gray-400">{formatTime(log.created_at)}</span>
                </div>
                <div class="text-sm text-gray-600 mt-1">{log.details}</div>
                {#if log.new_count > 0}
                  <div class="text-xs text-green-600 mt-1">新增: {log.new_count}条</div>
                {/if}
                {#if log.error_msg}
                  <div class="text-xs text-red-600 mt-1">错误: {log.error_msg}</div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </main>
  </div>
{/if}
