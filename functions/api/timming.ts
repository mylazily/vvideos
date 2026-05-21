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
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

async function verifyAdminToken(request: Request, env: Env): Promise<boolean> {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return false;
  const tokenData = await env.CACHE.get(`admin_token:${token}`);
  return !!tokenData;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const name = url.searchParams.get('name') || '';
  const enforce = url.searchParams.get('enforce') === '1';

  const isAdmin = await verifyAdminToken(request, env);
  if (!isAdmin) return jsonResponse({ code: 0, msg: '未授权访问' }, 401);

  const lastRunKey = 'timming:last_run';
  const lastRun = await env.CACHE.get(lastRunKey);
  const now = Math.floor(Date.now() / 1000);
  if (!enforce && lastRun && (now - parseInt(lastRun)) < 3600) {
    return jsonResponse({ code: 0, msg: '距离上次执行不足1小时' });
  }

  try {
    const sources = await env.DB_0.prepare('SELECT id, name, api_url, status FROM sources WHERE status = 1').all<Source>();
    if (!sources.results || sources.results.length === 0) return jsonResponse({ code: 0, msg: '没有可用的采集源' });
    const results: { name: string; status: string; msg: string }[] = [];
    for (const source of sources.results) {
      if (name && source.name !== name) continue;
      try {
        const collectUrl = new URL('/api/collect', url.origin);
        const res = await fetch(collectUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': request.headers.get('Authorization') || '' },
          body: JSON.stringify({ source_url: source.api_url, pages: 1 }),
          signal: AbortSignal.timeout(120000)
        });
        const data = await res.json();
        const newCount = data.data?.new || 0;
        await env.DB_0.prepare('INSERT INTO collect_logs (source_id, action, details, new_count, created_at) VALUES (?, ?, ?, ?, ?)').bind(source.id, 'auto_collect', data.msg || '自动采集', newCount, now).run();
        await env.DB_0.prepare('UPDATE sources SET last_collect_at = ?, total_videos = total_videos + ? WHERE id = ?').bind(now, newCount, source.id).run();
        results.push({ name: source.name, status: 'success', msg: `新增${newCount}条` });
      } catch (e: any) {
        results.push({ name: source.name, status: 'error', msg: e.message });
      }
      await new Promise(r => setTimeout(r, 3000));
    }
    await env.CACHE.put(lastRunKey, now.toString(), { expirationTtl: 7200 });
    return jsonResponse({ code: 1, success: true, msg: '定时任务执行完成', data: results });
  } catch (err: any) {
    return jsonResponse({ code: 0, msg: err.message || '执行失败' }, 500);
  }
};
