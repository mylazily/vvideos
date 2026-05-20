export interface Env {
  DB_0: D1Database;
  CACHE: KVNamespace;
}

interface Source {
  id: number;
  name: string;
  api_url: string;
  status: number;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const name = url.searchParams.get('name') || '';
  const enforce = url.searchParams.get('enforce') === '1';

  // 检查是否允许执行（每小时执行一次）
  const lastRunKey = 'timming:last_run';
  const lastRun = await env.CACHE.get(lastRunKey);
  const now = Math.floor(Date.now() / 1000);
  
  if (!enforce && lastRun && (now - parseInt(lastRun)) < 3600) {
    return jsonResponse({ code: 0, msg: '距离上次执行不足1小时' });
  }

  try {
    // 获取所有启用的采集源
    const sources = await env.DB_0.prepare(
      'SELECT id, name, api_url, status FROM sources WHERE status = 1'
    ).all<Source>();

    if (!sources.results || sources.results.length === 0) {
      return jsonResponse({ code: 0, msg: '没有可用的采集源' });
    }

    const results: { name: string; status: string; msg: string }[] = [];

    for (const source of sources.results) {
      if (name && source.name !== name) continue;

      try {
        // 调用采集接口
        const collectUrl = new URL('/api/collect', url.origin);
        const res = await fetch(collectUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_url: source.api_url, pages: 1 }),
          signal: AbortSignal.timeout(120000)
        });

        const data = await res.json();
        
        // 记录日志
        await env.DB_0.prepare(
          'INSERT INTO collect_logs (source_id, action, details, new_count, created_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(
          source.id,
          'auto_collect',
          data.msg || '自动采集',
          data.data?.success || 0,
          now
        ).run();

        // 更新最后采集时间
        await env.DB_0.prepare(
          'UPDATE sources SET last_collect_at = ?, total_videos = total_videos + ? WHERE id = ?'
        ).bind(now, data.data?.success || 0, source.id).run();

        results.push({
          name: source.name,
          status: 'success',
          msg: `采集${data.data?.success || 0}条`
        });

      } catch (e: any) {
        results.push({
          name: source.name,
          status: 'error',
          msg: e.message
        });
      }

      // 间隔3秒再采集下一个源
      await new Promise(r => setTimeout(r, 3000));
    }

    // 更新最后执行时间
    await env.CACHE.put(lastRunKey, now.toString(), { expirationTtl: 7200 });

    return jsonResponse({
      code: 1,
      msg: '定时任务执行完成',
      data: results
    });

  } catch (err: any) {
    return jsonResponse({ code: 0, msg: err.message || '执行失败' }, 500);
  }
};
