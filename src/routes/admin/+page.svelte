<script lang="ts">
  import { onMount } from 'svelte';

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

  let stats: Stats | null = null;
  let sources: Source[] = [];
  let logs: Log[] = [];
  let loading = true;
  let collecting = false;
  let message = '';

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      const [statsRes, sourcesRes, logsRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/sources'),
        fetch('/api/admin/logs?limit=20')
      ]);

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
      const res = await fetch('/api/admin/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId })
      });
      const data = await res.json();
      message = data.message || data.error || '操作完成';
      if (data.success) {
        setTimeout(loadData, 1000);
      }
    } catch (e) {
      message = '请求失败';
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
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <header class="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 z-50">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-pink-500">管理后台</h1>
      <a href="/" class="text-gray-600">返回首页</a>
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

      <!-- 采集源 -->
      <div class="bg-white rounded-lg mb-6">
        <div class="px-4 py-3 border-b border-gray-100">
          <h2 class="font-medium text-gray-800">采集源</h2>
        </div>
        <div class="divide-y divide-gray-100">
          {#each sources as source}
            <div class="px-4 py-3 flex items-center justify-between">
              <div>
                <div class="font-medium text-gray-800">{source.name}</div>
                <div class="text-xs text-gray-400">{source.api_url}</div>
                <div class="text-xs text-gray-400 mt-1">
                  状态: {source.status === 1 ? '启用' : '禁用'} |
                  视频: {source.total_videos} |
                  最后采集: {formatTime(source.last_collect_at)}
                </div>
              </div>
              <button
                onclick={() => startCollect(source.id)}
                disabled={collecting || source.status !== 1}
                class="px-4 py-2 bg-pink-500 text-white text-sm rounded-lg disabled:bg-gray-300"
              >
                {collecting ? '采集中...' : '开始采集'}
              </button>
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
