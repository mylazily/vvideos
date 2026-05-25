<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  const AUTH_KEY = 'admin_token';

  interface Source {
    id: number;
    name: string;
    alias: string;
    api_url: string;
    status: number;
    auto_collect_enabled: number;
    auto_collect_cron: string;
    auto_collect_mode: string;
    domain_replacements: string;
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

  interface CollectTask {
    sourceId: number;
    mode: string;
    startTime: number;
    status: 'running' | 'completed' | 'failed';
    progress?: string;
  }

  // 认证状态
  let isAuthenticated = $state(false);
  let passwordInput = $state('');
  let authError = $state('');
  let loginLoading = $state(false);

  // 数据
  let stats = $state<Stats | null>(null);
  let sources = $state<Source[]>([]);
  let logs = $state<Log[]>([]);
  let loading = $state(false);
  let message = $state('');
  let messageType = $state<'success' | 'error' | 'info'>('info');

  // 添加资源源
  let newSourceName = $state('');
  let newSourceAlias = $state('');
  let newSourceUrl = $state('');
  let addingSource = $state(false);
  let editingSource = $state<Source | null>(null);

  // 采集任务状态
  let activeTasks = $state<CollectTask[]>([]);
  let taskCheckInterval: ReturnType<typeof setInterval> | null = null;

  // 每个资源站的采集设置（展开面板用）
  let expandedSource = $state<number | null>(null);
  let sourceSettings = $state<Record<number, {
    pages: number;
    categories: string;
    autoEnabled: boolean;
    autoMode: string;
    autoCron: string;
  }>>({});

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

  // 定时采集预设选项
  const cronPresets = [
    { label: '每15分钟', value: '*/15 * * * *' },
    { label: '每30分钟', value: '*/30 * * * *' },
    { label: '每小时', value: '0 * * * *' },
    { label: '每2小时', value: '0 */2 * * *' },
    { label: '每6小时', value: '0 */6 * * *' },
    { label: '每12小时', value: '0 */12 * * *' },
    { label: '每天0点', value: '0 0 * * *' },
    { label: '每天8点', value: '0 8 * * *' },
    { label: '每天12点', value: '0 12 * * *' },
    { label: '每天20点', value: '0 20 * * *' },
    { label: '自定义', value: 'custom' }
  ];

  const collectModes = [
    { key: 'today', label: '今日更新', color: 'bg-green-500', desc: '采集今日更新的视频' },
    { key: 'week', label: '本周更新', color: 'bg-teal-500', desc: '采集本周更新的视频' },
    { key: 'month', label: '本月更新', color: 'bg-cyan-500', desc: '采集本月更新的视频' },
    { key: 'single', label: '单页采集', color: 'bg-pink-500', desc: '采集指定页数' },
    { key: 'full', label: '全量采集', color: 'bg-purple-500', desc: '采集全部视频（倒序）' }
  ];

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

  function showMessage(msg: string, type: 'success' | 'error' | 'info' = 'info') {
    message = msg;
    messageType = type;
    setTimeout(() => { message = ''; }, 5000);
  }

  onMount(() => {
    const token = sessionStorage.getItem(AUTH_KEY);
    if (token) {
      isAuthenticated = true;
      loadData();
      startTaskChecker();
    }
  });

  onDestroy(() => {
    if (taskCheckInterval) clearInterval(taskCheckInterval);
  });

  function startTaskChecker() {
    taskCheckInterval = setInterval(() => {
      if (activeTasks.length > 0) {
        loadLogs();
        // 检查任务是否完成（通过日志判断）
        activeTasks = activeTasks.filter(task => {
          const recentLog = logs.find(l =>
            l.source_id === task.sourceId &&
            l.created_at > task.startTime
          );
          if (recentLog) {
            task.status = recentLog.error_msg ? 'failed' : 'completed';
            showMessage(
              `${getSourceName(task.sourceId)} ${getModeLabel(task.mode)} ${recentLog.error_msg ? '失败' : '完成'}`,
              recentLog.error_msg ? 'error' : 'success'
            );
            return false;
          }
          return true;
        });
      }
    }, 3000);
  }

  function getSourceName(id: number): string {
    return sources.find(s => s.id === id)?.name || '未知源';
  }

  function getModeLabel(mode: string): string {
    return collectModes.find(m => m.key === mode)?.label || mode;
  }

  async function handleLogin() {
    if (!passwordInput) return;
    loginLoading = true;
    authError = '';
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem(AUTH_KEY, data.token);
        isAuthenticated = true;
        loadData();
        startTaskChecker();
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
    if (taskCheckInterval) clearInterval(taskCheckInterval);
  }

  async function loadData() {
    loading = true;
    try {
      const [statsRes, sourcesRes, logsRes, keywordsRes] = await Promise.all([
        authFetch('/api/admin/stats'),
        authFetch('/api/admin/sources'),
        authFetch('/api/admin/logs?limit=30'),
        authFetch('/api/keywords')
      ]);
      if (statsRes.status === 401 || sourcesRes.status === 401) { handleLogout(); return; }
      const [statsData, sourcesData, logsData, keywordsData] = await Promise.all([
        statsRes.json(), sourcesRes.json(), logsRes.json(), keywordsRes.json()
      ]);
      if (statsData.success) stats = statsData.data;
      if (sourcesData.success) {
        sources = sourcesData.data;
        // 初始化每个源的设置
        sources.forEach(s => {
          if (!sourceSettings[s.id]) {
            sourceSettings[s.id] = {
              pages: 5,
              categories: '',
              autoEnabled: s.auto_collect_enabled === 1,
              autoMode: s.auto_collect_mode || 'today',
              autoCron: s.auto_collect_cron || '0 */6 * * *'
            };
          }
        });
      }
      if (logsData.success) logs = logsData.data;
      if (keywordsData.success) keywords = keywordsData.data;
    } catch (e) { console.error(e); }
    finally { loading = false; }
  }

  async function loadLogs() {
    try {
      const res = await authFetch('/api/admin/logs?limit=30');
      const data = await res.json();
      if (data.success) logs = data.data;
    } catch {}
  }

  async function addSource() {
    if (!newSourceName.trim() || !newSourceUrl.trim()) {
      showMessage('请填写名称和接口地址', 'error');
      return;
    }
    addingSource = true;
    try {
      const res = await authFetch('/api/admin/sources', {
        method: 'POST',
        body: JSON.stringify({
          name: newSourceName,
          alias: newSourceAlias || newSourceName,
          api_url: newSourceUrl
        })
      });
      const data = await res.json();
      if (data.success) {
        newSourceName = ''; newSourceAlias = ''; newSourceUrl = '';
        await loadData();
        showMessage('添加成功', 'success');
      } else {
        showMessage(data.message || '添加失败', 'error');
      }
    } catch { showMessage('请求失败', 'error'); }
    finally { addingSource = false; }
  }

  async function updateSource() {
    if (!editingSource) return;
    try {
      const res = await authFetch('/api/admin/sources', {
        method: 'PUT',
        body: JSON.stringify({
          id: editingSource.id,
          name: editingSource.name,
          alias: editingSource.alias,
          api_url: editingSource.api_url
        })
      });
      const data = await res.json();
      if (data.success) {
        editingSource = null;
        await loadData();
        showMessage('更新成功', 'success');
      } else {
        showMessage(data.message || '更新失败', 'error');
      }
    } catch { showMessage('请求失败', 'error'); }
  }

  async function deleteSource(id: number) {
    if (!confirm('确定删除这个采集源吗？\n\n⚠️ 该资源站的所有视频也会被删除！')) return;
    try {
      const res = await authFetch('/api/admin/sources?id=' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await loadData();
        showMessage('删除成功', 'success');
      }
    } catch { showMessage('删除失败', 'error'); }
  }

  async function startCollect(sourceId: number, mode: string) {
    const settings = sourceSettings[sourceId];
    const categories = settings?.categories?.trim()
      ? settings.categories.split(/[,，]/).map(c => c.trim()).filter(Boolean)
      : undefined;

    // 添加到活动任务
    activeTasks = [...activeTasks, {
      sourceId,
      mode,
      startTime: Math.floor(Date.now() / 1000),
      status: 'running'
    }];

    showMessage(`${getSourceName(sourceId)} ${getModeLabel(mode)} 已启动...`, 'info');

    try {
      const res = await authFetch('/api/admin/collect-async', {
        method: 'POST',
        body: JSON.stringify({
          source_id: sourceId,
          mode,
          pages: mode === 'single' ? (settings?.pages || 5) : undefined,
          categories
        })
      });
      const data = await res.json();
      if (!data.success) {
        showMessage(data.message || '启动失败', 'error');
        activeTasks = activeTasks.filter(t => !(t.sourceId === sourceId && t.mode === mode));
      }
    } catch {
      showMessage('请求失败', 'error');
      activeTasks = activeTasks.filter(t => !(t.sourceId === sourceId && t.mode === mode));
    }
  }

  async function saveAutoCollect(sourceId: number) {
    const settings = sourceSettings[sourceId];
    try {
      const res = await authFetch('/api/admin/source-schedule', {
        method: 'POST',
        body: JSON.stringify({
          source_id: sourceId,
          enabled: settings.autoEnabled,
          mode: settings.autoMode,
          cron: settings.autoCron
        })
      });
      const data = await res.json();
      if (data.success) {
        showMessage('定时采集设置已保存', 'success');
        await loadData();
      } else {
        showMessage(data.message || '保存失败', 'error');
      }
    } catch { showMessage('请求失败', 'error'); }
  }

  async function replaceDomain() {
    if (!replaceSourceId) {
      showMessage('请选择采集源', 'error');
      return;
    }
    if (!oldM3u8Domain && !oldImageDomain) {
      showMessage('请至少填写一个替换规则', 'error');
      return;
    }
    replacing = true;
    showMessage('正在替换域名...', 'info');
    try {
      const res = await authFetch('/api/admin/replace-domain', {
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
      if (data.success) {
        showMessage(data.message, 'success');
        oldM3u8Domain = ''; newM3u8Domain = ''; oldImageDomain = ''; newImageDomain = '';
      } else {
        showMessage(data.message || '替换失败', 'error');
      }
    } catch { showMessage('请求失败', 'error'); }
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
      if (data.success) {
        newKeyword = '';
        await loadKeywords();
        showMessage('添加成功', 'success');
      }
    } catch { showMessage('添加失败', 'error'); }
  }

  async function deleteKeyword(keyword: string) {
    try {
      await authFetch('/api/keywords', {
        method: 'DELETE',
        body: JSON.stringify({ keyword })
      });
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
    if (!ts) return '从未';
    const date = new Date(ts * 1000);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
    return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function isTaskRunning(sourceId: number, mode: string): boolean {
    return activeTasks.some(t => t.sourceId === sourceId && t.mode === mode);
  }
</script>

<svelte:head>
  <title>管理后台 - 视频采集系统</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if !isAuthenticated}
  <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
    <div class="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-white/20">
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl shadow-lg">🔐</div>
        <h1 class="text-xl font-bold text-white">管理后台</h1>
        <p class="text-sm text-gray-400 mt-1">请输入密码访问</p>
      </div>
      <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
        <input
          bind:value={passwordInput}
          type="password"
          placeholder="请输入密码"
          class="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
          autocomplete="off"
        />
        {#if authError}<p class="text-red-400 text-sm mt-2">{authError}</p>{/if}
        <button
          type="submit"
          disabled={loginLoading}
          class="w-full mt-4 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-xl font-medium hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
        >
          {loginLoading ? '验证中...' : '进入后台'}
        </button>
      </form>
      <a href="/" class="block text-center text-sm text-gray-400 mt-4 hover:text-pink-400 transition-colors">← 返回首页</a>
    </div>
  </div>
{:else}
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-50 shadow-sm">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">A</div>
          <h1 class="text-lg font-bold text-gray-800">管理后台</h1>
        </div>
        <div class="flex items-center gap-3">
          <button onclick={loadData} class="p-2 text-gray-500 hover:text-pink-500 hover:bg-pink-50 rounded-lg transition-colors" title="刷新数据">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </button>
          <a href="/" class="px-3 py-1.5 text-sm text-gray-600 hover:text-pink-500 hover:bg-pink-50 rounded-lg transition-colors">返回首页</a>
          <button onclick={handleLogout} class="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors">退出</button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto p-4 pb-20">
      {#if loading}
        <div class="flex items-center justify-center py-20">
          <div class="w-10 h-10 border-3 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
        </div>
      {:else}
        <!-- Message Toast -->
        {#if message}
          <div class="fixed top-20 right-4 z-50 max-w-sm animate-fade-in">
            <div class="px-4 py-3 rounded-lg shadow-lg text-sm font-medium {messageType === 'success' ? 'bg-green-500 text-white' : messageType === 'error' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}">
              {message}
            </div>
          </div>
        {/if}

        <!-- 编辑资源站弹窗 -->
        {#if editingSource}
          <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-xl shadow-xl w-full max-w-lg">
              <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 class="font-semibold text-gray-800">编辑资源站</h3>
                <button onclick={() => editingSource = null} class="text-gray-400 hover:text-gray-600">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div class="p-4 space-y-4">
                <div>
                  <label class="block text-xs text-gray-500 mb-1">资源站名称（后台管理用）</label>
                  <input
                    bind:value={editingSource.name}
                    type="text"
                    class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label class="block text-xs text-gray-500 mb-1">别名（前端显示用）</label>
                  <input
                    bind:value={editingSource.alias}
                    type="text"
                    placeholder="留空则使用名称"
                    class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label class="block text-xs text-gray-500 mb-1">API接口地址</label>
                  <input
                    bind:value={editingSource.api_url}
                    type="text"
                    class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div class="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  onclick={() => editingSource = null}
                  class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onclick={updateSource}
                  class="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        {/if}

        <!-- 统计卡片 -->
        {#if stats}
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center text-pink-500">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <div>
                  <div class="text-xs text-gray-500">总视频数</div>
                  <div class="text-xl font-bold text-gray-800">{stats.totalVideos.toLocaleString()}</div>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-500">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                </div>
                <div>
                  <div class="text-xs text-gray-500">采集源</div>
                  <div class="text-xl font-bold text-gray-800">{stats.sourceCount}</div>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-500">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <div>
                  <div class="text-xs text-gray-500">今日采集</div>
                  <div class="text-xl font-bold text-gray-800">{stats.todayCollectCount}</div>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-500">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                </div>
                <div>
                  <div class="text-xs text-gray-500">今日新增</div>
                  <div class="text-xl font-bold text-gray-800">{stats.todayNewVideos}</div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- 资源站管理 -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <h2 class="font-semibold text-gray-800 flex items-center gap-2">
              <span class="w-5 h-5 bg-blue-500 rounded flex items-center justify-center text-white text-xs">📡</span>
              采集源管理
            </h2>
            <span class="text-xs text-gray-500">{sources.length} 个资源站</span>
          </div>

          <!-- 添加资源源 -->
          <div class="p-4 border-b border-gray-100 bg-gray-50/30">
            <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
              <input
                bind:value={newSourceName}
                type="text"
                placeholder="资源站名称（后台管理用）"
                class="md:col-span-3 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              />
              <input
                bind:value={newSourceAlias}
                type="text"
                placeholder="别名（前端显示用，留空则使用名称）"
                class="md:col-span-3 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              />
              <input
                bind:value={newSourceUrl}
                type="text"
                placeholder="API接口地址，如：https://api.example.com/provide/vod"
                class="md:col-span-4 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              />
              <button
                onclick={addSource}
                disabled={addingSource}
                class="md:col-span-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1"
              >
                {#if addingSource}
                  <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                {:else}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                {/if}
                添加
              </button>
            </div>
          </div>

          <!-- 资源站列表 -->
          <div class="divide-y divide-gray-100">
            {#each sources as source}
              <div class="p-4 hover:bg-gray-50/50 transition-colors">
                <!-- 资源站头部信息 -->
                <div class="flex items-start justify-between mb-3">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <h3 class="font-semibold text-gray-800">{source.name}</h3>
                      {#if source.alias && source.alias !== source.name}
                        <span class="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-xs rounded" title="前端显示名称">别名:{source.alias}</span>
                      {/if}
                      {#if source.auto_collect_enabled}
                        <span class="px-1.5 py-0.5 bg-green-100 text-green-600 text-xs rounded">自动</span>
                      {/if}
                    </div>
                    <p class="text-xs text-gray-400 truncate">{source.api_url}</p>
                    <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span class="flex items-center gap-1">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        {source.total_videos} 视频
                      </span>
                      <span class="flex items-center gap-1">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        更新: {formatTime(source.last_collect_at)}
                      </span>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 ml-4">
                    <button
                      onclick={() => editingSource = { ...source }}
                      class="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                      title="编辑"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button
                      onclick={() => expandedSource = expandedSource === source.id ? null : source.id}
                      class="p-2 text-gray-400 hover:text-pink-500 hover:bg-pink-50 rounded-lg transition-colors"
                      title="设置"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    </button>
                    <button
                      onclick={() => deleteSource(source.id)}
                      class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </div>

                <!-- 快速采集按钮 -->
                <div class="flex flex-wrap gap-2 mb-3">
                  {#each collectModes as mode}
                    {@const isRunning = isTaskRunning(source.id, mode.key)}
                    <button
                      onclick={() => startCollect(source.id, mode.key)}
                      disabled={isRunning || activeTasks.some(t => t.sourceId === source.id)}
                      class="px-3 py-1.5 {mode.color} text-white text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                      title={mode.desc}
                    >
                      {#if isRunning}
                        <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                      {:else}
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>
                      {/if}
                      {mode.label}
                      {#if mode.key === 'single'}
                        <span class="opacity-75">({sourceSettings[source.id]?.pages || 5}页)</span>
                      {/if}
                    </button>
                  {/each}
                </div>

                <!-- 展开的设置面板 -->
                {#if expandedSource === source.id}
                  <div class="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <!-- 采集参数设置 -->
                      <div>
                        <h4 class="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                          采集参数
                        </h4>
                        <div class="space-y-3">
                          <div>
                            <label class="block text-xs text-gray-500 mb-1">单页采集页数</label>
                            <input
                              bind:value={sourceSettings[source.id].pages}
                              type="number"
                              min="1"
                              max="100"
                              class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <label class="block text-xs text-gray-500 mb-1">分类过滤（可选，逗号分隔）</label>
                            <input
                              bind:value={sourceSettings[source.id].categories}
                              type="text"
                              placeholder="从资源站获取的分类，如：电影,电视剧,综艺"
                              class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      <!-- 定时采集设置 -->
                      <div>
                        <h4 class="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          定时采集
                        </h4>
                        <div class="space-y-3">
                          <label class="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              bind:checked={sourceSettings[source.id].autoEnabled}
                              class="w-4 h-4 text-pink-500 rounded border-gray-300 focus:ring-pink-500"
                            />
                            <span class="text-sm text-gray-700">启用定时采集</span>
                          </label>
                          {#if sourceSettings[source.id].autoEnabled}
                            <div>
                              <label class="block text-xs text-gray-500 mb-1">采集模式</label>
                              <select
                                bind:value={sourceSettings[source.id].autoMode}
                                class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                              >
                                {#each collectModes.filter(m => m.key !== 'single' && m.key !== 'full') as mode}
                                  <option value={mode.key}>{mode.label} - {mode.desc}</option>
                                {/each}
                              </select>
                            </div>
                            <div>
                              <label class="block text-xs text-gray-500 mb-1">执行频率</label>
                              <select
                                bind:value={sourceSettings[source.id].autoCron}
                                class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                              >
                                {#each cronPresets as preset}
                                  <option value={preset.value}>{preset.label}</option>
                                {/each}
                              </select>
                              {#if sourceSettings[source.id].autoCron === 'custom'}
                                <input
                                  bind:value={sourceSettings[source.id].autoCron}
                                  type="text"
                                  placeholder="如：0 */6 * * *"
                                  class="w-full mt-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono"
                                />
                              {/if}
                            </div>
                          {/if}
                        </div>
                      </div>
                    </div>
                    <div class="mt-4 flex justify-end">
                      <button
                        onclick={() => saveAutoCollect(source.id)}
                        class="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-medium rounded-lg hover:from-green-600 hover:to-green-700 transition-all flex items-center gap-1"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                        保存设置
                      </button>
                    </div>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="px-4 py-12 text-center">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-3xl">📡</div>
                <p class="text-gray-500 text-sm">暂无采集源，请添加一个资源站</p>
              </div>
            {/each}
          </div>
        </div>

        <!-- 域名替换 -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <h2 class="font-semibold text-gray-800 flex items-center gap-2">
              <span class="w-5 h-5 bg-orange-500 rounded flex items-center justify-center text-white text-xs">🔧</span>
              一键替换域名
            </h2>
          </div>
          <div class="p-4">
            <p class="text-xs text-gray-500 mb-4">当资源站的 M3U8 播放域名或图片域名更换时，可以一键替换所有视频的地址。替换规则会自动保存，后续采集也会自动应用。</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs text-gray-500 mb-1">选择资源站</label>
                <select bind:value={replaceSourceId} class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm">
                  <option value={0}>-- 请选择 --</option>
                  {#each sources as s}
                    <option value={s.id}>{s.name}</option>
                  {/each}
                </select>
              </div>
              <div class="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2">
                  <label class="block text-xs font-medium text-gray-700">M3U8 域名替换</label>
                  <input bind:value={oldM3u8Domain} type="text" placeholder="旧域名，如：old-cdn.com" class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" />
                  <input bind:value={newM3u8Domain} type="text" placeholder="新域名，如：new-cdn.com" class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" />
                </div>
                <div class="space-y-2">
                  <label class="block text-xs font-medium text-gray-700">图片域名替换</label>
                  <input bind:value={oldImageDomain} type="text" placeholder="旧域名，如：old-pic.com" class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" />
                  <input bind:value={newImageDomain} type="text" placeholder="新域名，如：new-pic.com" class="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
            </div>
            <div class="mt-4">
              <button
                onclick={replaceDomain}
                disabled={replacing || !replaceSourceId}
                class="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white text-sm font-medium rounded-lg hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1"
              >
                {#if replacing}
                  <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                  替换中...
                {:else}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                  立即替换
                {/if}
              </button>
            </div>
          </div>
        </div>

        <!-- 热门搜索关键字 -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <h2 class="font-semibold text-gray-800 flex items-center gap-2">
              <span class="w-5 h-5 bg-pink-500 rounded flex items-center justify-center text-white text-xs">🔥</span>
              热门搜索关键字
            </h2>
          </div>
          <div class="p-4">
            <div class="flex gap-2 mb-3">
              <input
                bind:value={newKeyword}
                type="text"
                class="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                placeholder="输入关键字"
                onkeydown={(e) => e.key === 'Enter' && addKeyword()}
              />
              <button onclick={addKeyword} class="px-4 py-2 bg-gradient-to-r from-pink-500 to-pink-600 text-white text-sm font-medium rounded-lg hover:from-pink-600 hover:to-pink-700 transition-all">
                添加
              </button>
            </div>
            {#if keywords.length > 0}
              <div class="flex flex-wrap gap-2">
                {#each keywords as kw}
                  <span class="inline-flex items-center gap-1 px-3 py-1.5 bg-pink-50 text-pink-600 text-sm rounded-full border border-pink-100">
                    {kw}
                    <button onclick={() => deleteKeyword(kw)} class="text-pink-400 hover:text-pink-700 ml-1 w-4 h-4 flex items-center justify-center rounded-full hover:bg-pink-200 transition-colors">×</button>
                  </span>
                {/each}
              </div>
            {:else}
              <p class="text-sm text-gray-400">暂无关键字，添加后将在发现页显示</p>
            {/if}
          </div>
        </div>

        <!-- 采集日志 -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h2 class="font-semibold text-gray-800 flex items-center gap-2">
              <span class="w-5 h-5 bg-gray-500 rounded flex items-center justify-center text-white text-xs">📋</span>
              采集日志
            </h2>
            <button onclick={loadLogs} class="text-xs text-gray-500 hover:text-pink-500 flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              刷新
            </button>
          </div>
          <div class="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {#each logs as log}
              <div class="px-4 py-3 hover:bg-gray-50/50">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-medium text-gray-800 text-sm">{log.source_name || '未知源'}</span>
                  <span class="text-xs text-gray-400">{formatTime(log.created_at)}</span>
                </div>
                <div class="text-xs text-gray-600">{log.details}</div>
                <div class="flex items-center gap-3 mt-1">
                  {#if log.new_count > 0}
                    <span class="text-xs text-green-600 flex items-center gap-0.5">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                      新增 {log.new_count}
                    </span>
                  {/if}
                  {#if log.updated_count > 0}
                    <span class="text-xs text-blue-600 flex items-center gap-0.5">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                      更新 {log.updated_count}
                    </span>
                  {/if}
                  {#if log.error_msg}
                    <span class="text-xs text-red-600 flex items-center gap-0.5">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      {log.error_msg}
                    </span>
                  {/if}
                </div>
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

<style>
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in {
    animation: fade-in 0.3s ease-out;
  }
</style>
