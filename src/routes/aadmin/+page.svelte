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
    domain_replacements: string;
    created_at: number;
  }

  interface Log {
    id: number;
    source_id: number;
    source_name: string;
    action: string;
    details: string;
    new_count: number;
    updated_count: number;
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

  // 采集参数
  let collectPages = $state(5);
  let collectCategories = $state('');

  // 域名替换
  let replaceSourceId = $state<number>(0);
  let oldM3u8Domain = $state('');
  let newM3u8Domain = $state('');
  let oldImageDomain = $state('');
  let newImageDomain = $state('');
  let replacing = $state(false);

  // 热门搜索关键字
  let keywords = $state<string[]>([]);
  let newKeyword = $state('');

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
    if (token) { isAuthenticated = true; loadData(); }
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
    } catch { authError = '网络错误'; }
    finally { loginLoading = false; }
  }

  function handleLogout() {
    sessionStorage.removeItem(AUTH_KEY);
    isAuthenticated = false;
    passwordInput = '';
    stats = null; sources = []; logs = [];
  }

  async function loadData() {
    loading = true;
    try {
      const [statsRes, sourcesRes, logsRes, keywordsRes] = await Promise.all([
        authFetch('/api/aadmin/stats'),
        authFetch('/api/aadmin/sources'),
        authFetch('/api/aadmin/logs?limit=20'),
        authFetch('/api/keywords')
      ]);
      if (statsRes.status === 401 || sourcesRes.status === 401) { handleLogout(); return; }
      const [statsData, sourcesData, logsData, keywordsData] = await Promise.all([
        statsRes.json(), sourcesRes.json(), logsRes.json(), keywordsRes.json()
      ]);
      if (statsData.success) stats = statsData.data;
      if (sourcesData.success) sources = sourcesData.data;
      if (logsData.success) logs = logsData.data;
      if (keywordsData.success) keywords = keywordsData.data;
    } catch (e) { console.error(e); }
    finally { loading = false; }
  }

  async function addSource() {
    if (!newSourceName.trim() || !newSourceUrl.trim()) { message = '请填写名称和接口地址'; return; }
    try {
      const res = await authFetch('/api/aadmin/sources', {
        method: 'POST',
        body: JSON.stringify({ name: newSourceName, api_url: newSourceUrl })
      });
      const data = await res.json();
      if (data.success) { newSourceName = ''; newSourceUrl = ''; await loadData(); message = '✅ 添加成功'; }
      else { message = '❌ ' + (data.message || '添加失败'); }
    } catch { message = '❌ 请求失败'; }
  }

  async function deleteSource(id: number) {
    if (!confirm('确定删除这个采集源吗？')) return;
    try {
      const res = await authFetch('/api/aadmin/sources?id=' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { await loadData(); message = '✅ 删除成功'; }
    } catch { message = '❌ 删除失败'; }
  }

  async function startCollect(sourceId: number, mode: string = 'single') {
    collecting = true;
    const modeLabel = { single: '单页采集', full: '全量采集', today: '今日更新', week: '本周更新', month: '本月更新' }[mode] || mode;
    message = `🔄 正在${modeLabel}...`;

    const categories = collectCategories.trim() ? collectCategories.split(/[,，]/).map(c => c.trim()).filter(Boolean) : undefined;

    try {
      const res = await authFetch('/api/aadmin/collect-async', {
        method: 'POST',
        body: JSON.stringify({ source_id: sourceId, mode, pages: mode === 'single' ? collectPages : undefined, categories })
      });
      const data = await res.json();
      if (data.success) { message = `✅ ${modeLabel}已启动，后台执行中...`; }
      else { message = '❌ ' + (data.message || '操作失败'); }
    } catch { message = '❌ 请求失败'; }
    finally { collecting = false; setTimeout(loadData, 5000); }
  }

  async function replaceDomain() {
    if (!replaceSourceId) { message = '请选择采集源'; return; }
    if (!oldM3u8Domain && !oldImageDomain) { message = '请至少填写一个替换规则'; return; }
    replacing = true;
    message = '🔄 正在替换域名...';
    try {
      const res = await authFetch('/api/aadmin/replace-domain', {
        method: 'POST',
        body: JSON.stringify({
          source_id: replaceSourceId,
          old_m3u8_domain: oldM3u8Domain || undefined,
          new_m3u8_domain: newM3u8Domain || undefined,
          old_image_domain: oldImageDomain || undefined,
          new_image_domain: newImageDomain || undefined
        })
      });
      const data = await res.json();
      if (data.success) { message = `✅ ${data.message}`; oldM3u8Domain = ''; newM3u8Domain = ''; oldImageDomain = ''; newImageDomain = ''; }
      else { message = '❌ ' + (data.message || '替换失败'); }
    } catch { message = '❌ 请求失败'; }
    finally { replacing = false; }
  }

  async function addKeyword() {
    if (!newKeyword.trim()) return;
    try {
      const res = await authFetch('/api/keywords', {
        method: 'POST',
        body: JSON.stringify({ keyword: newKeyword.trim() })
      });
      const data = await res.json();
      message = data.message;
      if (data.success) { newKeyword = ''; await loadKeywords(); }
    } catch { message = '❌ 添加失败'; }
  }

  async function deleteKeyword(keyword: string) {
    try {
      await authFetch('/api/aadmin/keywords', { method: 'DELETE', body: JSON.stringify({ keyword }) });
      await loadKeywords();
    } catch {}
  }

  async function loadKeywords() {
    try {
      const res = await authFetch('/api/keywords');
      const data = await res.json();
      if (data.success) keywords = data.data;
    } catch {}
  }

  function formatTime(ts: number): string {
    if (!ts) return '-';
    return new Date(ts * 1000).toLocaleString('zh-CN');
  }
</script>

<svelte:head>
  <title>管理后台 - 必爱必爱</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if !isAuthenticated}
  <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🔒</div>
        <h1 class="text-xl font-bold text-gray-800">管理后台</h1>
        <p class="text-sm text-gray-500 mt-1">请输入密码访问</p>
      </div>
      <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
        <input bind:value={passwordInput} type="password" placeholder="请输入密码" class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500" autocomplete="off" />
        {#if authError}<p class="text-red-500 text-sm mt-2">{authError}</p>{/if}
        <button type="submit" disabled={loginLoading} class="w-full mt-4 py-3 bg-pink-500 text-white rounded-xl font-medium hover:bg-pink-600 disabled:bg-pink-300">
          {loginLoading ? '验证中...' : '进入后台'}
        </button>
      </form>
      <a href="/" class="block text-center text-sm text-gray-500 mt-4 hover:text-pink-500">← 返回首页</a>
    </div>
  </div>
{:else}
  <div class="min-h-screen bg-gray-50">
    <header class="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 z-50">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-pink-500">管理后台</h1>
        <div class="flex items-center gap-4">
          <button onclick={handleLogout} class="text-sm text-gray-500 hover:text-red-500">退出登录</button>
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

        {#if message}
          <div class="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg mb-4 text-sm">{message}</div>
        {/if}

        <!-- 一键替换域名 -->
        <div class="bg-white rounded-lg p-4 mb-6">
          <h2 class="font-medium text-gray-800 mb-3">🔧 一键替换域名</h2>
          <p class="text-xs text-gray-400 mb-3">替换该资源站所有视频的m3u8播放域名和图片域名，规则会自动保存，后续采集也会自动替换</p>
          <div class="space-y-3">
            <div>
              <label class="block text-xs text-gray-500 mb-1">选择资源站</label>
              <select bind:value={replaceSourceId} class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                <option value={0}>-- 请选择 --</option>
                {#each sources as s}
                  <option value={s.id}>{s.name}</option>
                {/each}
              </select>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">M3U8旧域名</label>
                <input bind:value={oldM3u8Domain} type="text" placeholder="如：old-cdn.com" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">M3U8新域名</label>
                <input bind:value={newM3u8Domain} type="text" placeholder="如：new-cdn.com" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">图片旧域名</label>
                <input bind:value={oldImageDomain} type="text" placeholder="如：old-pic.com" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">图片新域名</label>
                <input bind:value={newImageDomain} type="text" placeholder="如：new-pic.com" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
            <button onclick={replaceDomain} disabled={replacing} class="px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 disabled:bg-gray-300">
              {replacing ? '替换中...' : '立即替换'}
            </button>
          </div>
        </div>

        <!-- 采集参数 -->
        <div class="bg-white rounded-lg p-4 mb-6">
          <h2 class="font-medium text-gray-800 mb-3">⚙️ 采集参数</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-500 mb-1">单页采集页数</label>
              <input bind:value={collectPages} type="number" min="1" max="999" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="默认5页" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">分类过滤（可选，逗号分隔）</label>
              <input bind:value={collectCategories} type="text" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="如：动作片,喜剧片" />
            </div>
          </div>
        </div>

        <!-- 热门搜索关键字 -->
        <div class="bg-white rounded-lg p-4 mb-6">
          <h2 class="font-medium text-gray-800 mb-3">🔥 热门搜索关键字（发现页显示）</h2>
          <div class="flex gap-2 mb-3">
            <input bind:value={newKeyword} type="text" class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="输入关键字" onkeydown={(e) => e.key === 'Enter' && addKeyword()} />
            <button onclick={addKeyword} class="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg hover:bg-pink-600">添加</button>
          </div>
          {#if keywords.length > 0}
            <div class="flex flex-wrap gap-2">
              {#each keywords as kw}
                <span class="inline-flex items-center gap-1 px-3 py-1.5 bg-pink-50 text-pink-600 text-sm rounded-full">
                  {kw}
                  <button onclick={() => deleteKeyword(kw)} class="text-pink-400 hover:text-pink-700 ml-1">×</button>
                </span>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-gray-400">暂无关键字</p>
          {/if}
        </div>

        <!-- 添加采集源 -->
        <div class="bg-white rounded-lg p-4 mb-6">
          <h2 class="font-medium text-gray-800 mb-3">➕ 添加采集源</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input bind:value={newSourceName} type="text" placeholder="采集源名称" class="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <input bind:value={newSourceUrl} type="text" placeholder="接口地址" class="px-3 py-2 border border-gray-200 rounded-lg text-sm md:col-span-2" />
          </div>
          <button onclick={addSource} class="mt-3 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600">添加</button>
        </div>

        <!-- 采集源列表 -->
        <div class="bg-white rounded-lg mb-6">
          <div class="px-4 py-3 border-b border-gray-100">
            <h2 class="font-medium text-gray-800">📡 采集源</h2>
          </div>
          <div class="divide-y divide-gray-100">
            {#each sources as source}
              <div class="px-4 py-3">
                <div class="flex items-center justify-between mb-2">
                  <div class="font-medium text-gray-800">{source.name}</div>
                  <button onclick={() => deleteSource(source.id)} class="px-2 py-1 bg-red-500 text-white text-xs rounded">删除</button>
                </div>
                <div class="text-xs text-gray-400 break-all mb-2">{source.api_url}</div>
                <div class="text-xs text-gray-400 mb-2">
                  视频: {source.total_videos} | 最后采集: {formatTime(source.last_collect_at)}
                </div>
                <!-- 采集按钮组 -->
                <div class="flex flex-wrap gap-2">
                  <button onclick={() => startCollect(source.id, 'today')} disabled={collecting} class="px-3 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600 disabled:bg-gray-300">今日</button>
                  <button onclick={() => startCollect(source.id, 'week')} disabled={collecting} class="px-3 py-1.5 bg-teal-500 text-white text-xs rounded hover:bg-teal-600 disabled:bg-gray-300">本周</button>
                  <button onclick={() => startCollect(source.id, 'month')} disabled={collecting} class="px-3 py-1.5 bg-indigo-500 text-white text-xs rounded hover:bg-indigo-600 disabled:bg-gray-300">本月</button>
                  <button onclick={() => startCollect(source.id, 'single')} disabled={collecting} class="px-3 py-1.5 bg-pink-500 text-white text-xs rounded hover:bg-pink-600 disabled:bg-gray-300">单页({collectPages}页)</button>
                  <button onclick={() => startCollect(source.id, 'full')} disabled={collecting} class="px-3 py-1.5 bg-purple-500 text-white text-xs rounded hover:bg-purple-600 disabled:bg-gray-300">全量</button>
                </div>
              </div>
            {:else}
              <div class="px-4 py-8 text-center text-gray-400 text-sm">暂无采集源，请先添加</div>
            {/each}
          </div>
        </div>

        <!-- 采集日志 -->
        <div class="bg-white rounded-lg">
          <div class="px-4 py-3 border-b border-gray-100">
            <h2 class="font-medium text-gray-800">📋 采集日志</h2>
          </div>
          <div class="divide-y divide-gray-100">
            {#each logs as log}
              <div class="px-4 py-3">
                <div class="flex items-center justify-between">
                  <span class="font-medium text-gray-800 text-sm">{log.source_name || '未知源'}</span>
                  <span class="text-xs text-gray-400">{formatTime(log.created_at)}</span>
                </div>
                <div class="text-xs text-gray-600 mt-1">{log.details}</div>
                {#if log.new_count > 0}
                  <div class="text-xs text-green-600 mt-1">新增: {log.new_count}条</div>
                {/if}
                {#if log.error_msg}
                  <div class="text-xs text-red-600 mt-1">错误: {log.error_msg}</div>
                {/if}
              </div>
            {:else}
              <div class="px-4 py-8 text-center text-gray-400 text-sm">暂无日志</div>
            {/each}
          </div>
        </div>
      {/if}
    </main>
  </div>
{/if}
