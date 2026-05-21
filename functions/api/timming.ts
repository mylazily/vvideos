export interface Env {
	DB_0: D1Database;
	DB_1: D1Database;
	DB_2: D1Database;
	DB_3: D1Database;
	DB_4: D1Database;
	DB_5: D1Database;
	DB_6: D1Database;
	DB_7: D1Database;
	DB_8: D1Database;
	DB_9: D1Database;
	CACHE: KVNamespace;
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

async function getCronToken(env: Env): Promise<string | null> {
	return await env.CACHE.get('cron_admin_token');
}

export async function generateCronToken(env: Env): Promise<string> {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
	await env.CACHE.put('cron_admin_token', token);
	return token;
}

async function collectSource(
	sourceUrl: string,
	sourceId: number,
	mode: 'full' | 'single',
	authToken: string,
	origin: string,
	env: Env,
	signal?: AbortSignal
): Promise<{ new: number; merged: number; fail: number; totalPages: number; pagesCollected: number }> {
	// 采集前写入进度
	await env.CACHE.put(`collect_progress:${sourceId}`, JSON.stringify({
		status: 'running',
		page: 0,
		totalPages: 0,
		new: 0,
		merged: 0,
		fail: 0,
		startedAt: Math.floor(Date.now() / 1000)
	}), { expirationTtl: 3600 });

	const collectUrl = new URL('/api/collect', origin);
	const res = await fetch(collectUrl.toString(), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${authToken}`
		},
		body: JSON.stringify({ source_url: sourceUrl, source_id: sourceId, mode, pages: mode === 'full' ? 999 : 1 }),
		signal: signal || AbortSignal.timeout(mode === 'full' ? 3600000 : 300000)
	});
	const data = await res.json();
	if (!res.ok || data.code !== 1) {
		// 采集失败也更新进度
		await env.CACHE.put(`collect_progress:${sourceId}`, JSON.stringify({
			status: 'error',
			page: 0,
			totalPages: 0,
			new: 0,
			merged: 0,
			fail: 0,
			startedAt: Math.floor(Date.now() / 1000),
			message: data.msg || '采集失败'
		}), { expirationTtl: 3600 });
		throw new Error(data.msg || '采集失败');
	}

	// 采集完成后更新进度
	const resultData = data.data || {};
	await env.CACHE.put(`collect_progress:${sourceId}`, JSON.stringify({
		status: 'completed',
		page: resultData.pagesCollected || 0,
		totalPages: resultData.totalPages || 0,
		new: resultData.new || 0,
		merged: resultData.merged || 0,
		fail: resultData.fail || 0,
		startedAt: Math.floor(Date.now() / 1000)
	}), { expirationTtl: 3600 });

	return resultData;
}

export const onRequest: PagesFunction<Env> = async (context) => {
	const { request, env } = context;
	const url = new URL(request.url);

	const isAdmin = await verifyAdminToken(request, env);
	const isCronTrigger = request.headers.get('Cf-Cron-Variables') !== null ||
		url.searchParams.get('_cron') === '1';

	if (!isAdmin && !isCronTrigger) {
		return jsonResponse({ success: false, message: '未授权访问' }, 401);
	}

	let authToken = '';
	if (isAdmin) {
		authToken = (request.headers.get('Authorization') || '').replace('Bearer ', '');
	} else {
		authToken = await getCronToken(env) || '';
	}

	// 改进1: URL参数 force=1 时强制全量模式
	const forceFull = url.searchParams.get('force') === '1';

	// 改进2: URL参数 source_id=N 时只采集指定源
	const targetSourceId = url.searchParams.get('source_id');
	const filterSourceId = targetSourceId ? parseInt(targetSourceId) : null;

	const timingKey = 'timing:last_run';
	if (isAdmin) {
		const lastRun = await env.CACHE.get(timingKey);
		if (lastRun) {
			const elapsed = Math.floor(Date.now() / 1000) - parseInt(lastRun);
			if (elapsed < 3600) {
				return jsonResponse({
					success: false,
					message: `定时任务执行过于频繁，请在 ${Math.ceil((3600 - elapsed) / 60)} 分钟后重试`,
					remaining: 3600 - elapsed
				}, 429);
			}
		}
	}

	let sources;
	if (filterSourceId && !isNaN(filterSourceId)) {
		// 单源采集：只查询指定源
		sources = await env.DB_0.prepare('SELECT * FROM sources WHERE status = 1 AND id = ?').bind(filterSourceId).all<{
			id: number;
			name: string;
			api_url: string;
			last_collect_at: number;
			total_videos: number;
		}>();
	} else {
		sources = await env.DB_0.prepare('SELECT * FROM sources WHERE status = 1').all<{
			id: number;
			name: string;
			api_url: string;
			last_collect_at: number;
			total_videos: number;
		}>();
	}

	if (!sources.results || sources.results.length === 0) {
		return jsonResponse({ success: true, message: '没有启用的采集源' });
	}

	const results: any[] = [];
	let totalNew = 0, totalMerged = 0, totalFail = 0;

	for (let i = 0; i < sources.results.length; i++) {
		const source = sources.results[i];
		try {
			const hoursSinceLast = source.last_collect_at
				? Math.floor((Date.now() / 1000 - source.last_collect_at) / 3600)
				: 999;

			// 改进1: force=1 时强制全量，忽略24小时判断
			let mode: 'full' | 'single';
			if (forceFull) {
				mode = 'full';
			} else {
				mode = hoursSinceLast >= 24 ? 'full' : 'single';
			}

			const r = await collectSource(source.api_url, source.id, mode, authToken, url.origin, env);

			totalNew += r.new || 0;
			totalMerged += r.merged || 0;
			totalFail += r.fail || 0;

			await env.DB_0.prepare(
				'UPDATE sources SET last_collect_at = ?, total_videos = total_videos + ? WHERE id = ?'
			).bind(Math.floor(Date.now() / 1000), r.new || 0, source.id).run();

			await env.DB_0.prepare(
				'INSERT INTO collect_logs (source_id, action, details, new_count, created_at) VALUES (?, ?, ?, ?, ?)'
			).bind(source.id, mode === 'full' ? 'timing_full' : 'timing_incremental',
				`定时采集完成：${source.name}，模式=${mode}${forceFull ? '(强制)' : ''}，共 ${r.pagesCollected}/${r.totalPages} 页`,
				r.new || 0, Math.floor(Date.now() / 1000)).run();

			results.push({
				source: source.name,
				mode,
				new: r.new,
				merged: r.merged,
				fail: r.fail,
				pages: `${r.pagesCollected}/${r.totalPages}`
			});
		} catch (e: any) {
			results.push({ source: source.name, error: e.message });
			await env.DB_0.prepare(
				'INSERT INTO collect_logs (source_id, action, details, new_count, error_msg, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			).bind(source.id, 'timing_error', `定时采集失败：${source.name} - ${e.message}`, 0, e.message, Math.floor(Date.now() / 1000)).run();
		}

		if (i < sources.results.length - 1) {
			await new Promise(r => setTimeout(r, 5000));
		}
	}

	await env.CACHE.put(timingKey, String(Math.floor(Date.now() / 1000)), { expirationTtl: 86400 });

	return jsonResponse({
		success: true,
		message: `定时采集完成，共新增 ${totalNew} 条，更新 ${totalMerged} 条`,
		data: { totalNew, totalMerged, totalFail, sources: results }
	});
};
