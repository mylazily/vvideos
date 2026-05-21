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
	ADMIN_PASSWORD: string; // CF 环境变量设置
}

interface VideoRow {
	id: number;
	vod_id: string;
	title: string;
	cover: string;
	category: string;
	duration: string;
	description: string | null;
	play_url: string | null;
	status: number;
	views: number;
	created_at: number;
	updated_at: number;
	vod_year: string;
	vod_area: string;
	vod_director: string;
	vod_actor: string;
	vod_remarks: string;
}

// ======== 缓存策略：Cache API 为主（边缘缓存，不计入 KV 额度），KV 为辅 ========
// Cache API 限制：每个请求只能访问自己的缓存，但 10万日活下完全够用
// KV 限制：1000 写入/天，仅用于持久化缓存和跨请求共享

const CACHE_VERSION = 'v2';

function json(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			...extraHeaders
		}
	});
}

// 强缓存头 - 让 CF CDN 边缘节点缓存，减少 Workers 请求
function strongCacheHeaders(maxAge: number) {
	return { 
		'Cache-Control': `public, max-age=${maxAge}`,
		'CDN-Cache-Control': `public, max-age=${maxAge}`,
		'Vercel-CDN-Cache-Control': `public, max-age=${maxAge}`
	};
}

// SWR 缓存头 - 过期后后台刷新
function swrHeaders(maxAge: number, staleAge: number = maxAge * 2) {
	return { 
		'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${staleAge}`
	};
}

function getShards(env: Env): D1Database[] {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

const VIDEO_COLS = 'id, vod_id, title, cover, category, duration, views, created_at';
const VIDEO_DETAIL_COLS = 'id, vod_id, title, cover, category, duration, description, play_url, status, views, created_at, updated_at, vod_year, vod_area, vod_director, vod_actor, vod_remarks';

// ======== 双层缓存系统 ========
// L1: Cache API (边缘缓存，快，不计入 KV 额度)
// L2: KV (持久化，慢，计入额度)

async function getCache(request: Request, env: Env, key: string): Promise<any | null> {
	// 1. 先查 Cache API (L1)
	try {
		const cache = await caches.open('api-cache-v1');
		const cached = await cache.match(request);
		if (cached) {
			const data = await cached.json();
			return data;
		}
	} catch { /* Cache API 失败继续查 KV */ }
	
	// 2. 再查 KV (L2) - 仅用于持久化
	try {
		const val = await env.CACHE.get(key);
		if (val) {
			const data = JSON.parse(val);
			// 回填到 Cache API
			try {
				const cache = await caches.open('api-cache-v1');
				const response = new Response(val, { 
					headers: { 'Content-Type': 'application/json' }
				});
				await cache.put(request, response);
			} catch { }
			return data;
		}
	} catch { }
	return null;
}

async function setCache(request: Request, env: Env, key: string, data: any, cacheSeconds: number, persistToKV: boolean = false): Promise<void> {
	const jsonStr = JSON.stringify(data);
	
	// 1. 写入 Cache API (L1) - 主要缓存层
	try {
		const cache = await caches.open('api-cache-v1');
		const response = new Response(jsonStr, { 
			headers: { 
				'Content-Type': 'application/json',
				'Cache-Control': `max-age=${cacheSeconds}`
			}
		});
		await cache.put(request, response);
	} catch { }
	
	// 2. 选择性写入 KV (L2) - 仅重要数据且低频写入
	if (persistToKV && cacheSeconds > 3600) {
		try { 
			await env.CACHE.put(key, jsonStr, { expirationTtl: cacheSeconds }); 
		} catch { }
	}
}

export const onRequest: PagesFunction<Env> = async (context) => {
	const { request, env } = context;
	const url = new URL(request.url);
	const path = url.pathname;

	if (request.method === 'OPTIONS') {
		return new Response(null, {
			headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
		});
	}

	try {
		// ======== 相关视频推荐 ========
		if (path.startsWith('/api/video/') && path.endsWith('/related')) {
			const vodId = path.replace('/api/video/', '').replace('/related', '');
			const cacheKey = `rel:${CACHE_VERSION}:${vodId}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, strongCacheHeaders(1800));

			const shards = getShards(env);
			const videoResult = await Promise.all(shards.map(db =>
				db.prepare('SELECT category, vod_area FROM videos WHERE vod_id = ? AND status = 1').bind(vodId).first<{ category: string; vod_area: string }>()
			));
			const videoInfo = videoResult.find(r => r !== null);
			if (!videoInfo) return json({ success: true, data: [] });

			const conditions: string[] = ['status = 1', 'vod_id != ?'];
			const bindings: any[] = [vodId];
			if (videoInfo.category) { conditions.push('category = ?'); bindings.push(videoInfo.category); }
			if (videoInfo.vod_area) { conditions.push('vod_area = ?'); bindings.push(videoInfo.vod_area); }

			const sql = 'SELECT ' + VIDEO_COLS + ' FROM videos WHERE ' + conditions.join(' AND ') + ' ORDER BY views DESC LIMIT 50';
			const results = await Promise.all(shards.map(db => db.prepare(sql).bind(...bindings).all<any>()));
			let related: any[] = [];
			for (const r of results) if (r.results) related.push(...r.results);
			const unique = Array.from(new Map(related.map(v => [v.vod_id, v])).values()).slice(0, 12);

			await setCache(request, env, cacheKey, unique, 1800, false); // 只走 Cache API，不入 KV
			return json({ success: true, data: unique }, 200, strongCacheHeaders(1800));
		}

		// ======== 视频详情 ========
		if (path.startsWith('/api/video/')) {
			const vodId = path.replace('/api/video/', '');
			const cacheKey = `vid:${CACHE_VERSION}:${vodId}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, strongCacheHeaders(3600));

			const shards = getShards(env);
			const results = await Promise.all(shards.map(db =>
				db.prepare('SELECT ' + VIDEO_DETAIL_COLS + ' FROM videos WHERE vod_id = ? AND status = 1').bind(vodId).first<VideoRow>()
			));
			const video = results.find(r => r !== null);
			if (!video) return json({ success: false, message: '视频不存在' }, 404);

			// 异步更新浏览量
			const shardIdx = results.indexOf(video);
			if (shardIdx >= 0) {
				context.waitUntil(shards[shardIdx].prepare('UPDATE videos SET views = views + 1 WHERE vod_id = ?').bind(vodId).run());
			}

			await setCache(request, env, cacheKey, video, 3600, true); // 入 KV 持久化
			return json({ success: true, data: video }, 200, strongCacheHeaders(3600));
		}

		// ======== 首页 ========
		if (path === '/api/home') {
			const hour = Math.floor(Date.now() / 3600000);
			const shardIndex = Math.floor(hour / 2) % 10;
			const cacheKey = `home:${CACHE_VERSION}:h${hour}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json({ success: true, data: { videos: cached, shard: shardIndex } }, 200, strongCacheHeaders(3600));

			const shards = getShards(env);
			const result = await shards[shardIndex].prepare(
				'SELECT ' + VIDEO_COLS + ' FROM videos WHERE status = 1 ORDER BY created_at DESC LIMIT 24'
			).all<VideoRow>();
			const videos = result.results || [];

			await setCache(request, env, cacheKey, videos, 7200, true);
			return json({ success: true, data: { videos, shard: shardIndex } }, 200, strongCacheHeaders(3600));
		}

		// ======== 通用视频列表 ========
		if (path === '/api/videos') {
			const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1);
			const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '20') || 20), 100);
			const category = url.searchParams.get('category');
			const cacheKey = `list:${CACHE_VERSION}:p${page}:l${limit}:${category || 'all'}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, strongCacheHeaders(1800));

			const where = category ? 'WHERE status = 1 AND category = ?' : 'WHERE status = 1';
			const params = category ? [category] : [];
			const shards = getShards(env);

			const [videoResults, countResults] = await Promise.all([
				Promise.all(shards.map(db => db.prepare('SELECT ' + VIDEO_COLS + ' FROM videos ' + where + ' ORDER BY created_at DESC LIMIT 200').bind(...params).all<VideoRow>())),
				Promise.all(shards.map(db => db.prepare('SELECT COUNT(*) as total FROM videos ' + where).bind(...params).first<{ total: number }>()))
			]);

			const allVideos: VideoRow[] = [];
			for (const r of videoResults) if (r.results) allVideos.push(...r.results);
			allVideos.sort((a, b) => b.created_at - a.created_at);
			const total = countResults.reduce((s, r) => s + (r?.total || 0), 0);
			const offset = (page - 1) * limit;

			const responseData = { videos: allVideos.slice(offset, offset + limit), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
			await setCache(request, env, cacheKey, responseData, 1800, false);
			return json({ success: true, data: responseData }, 200, strongCacheHeaders(1800));
		}

		// ======== 分类（低频，长缓存） ========
		if (path === '/api/categories') {
			const cacheKey = `cats:${CACHE_VERSION}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, strongCacheHeaders(86400));

			const shards = getShards(env);
			const results = await Promise.all(shards.map(db =>
				db.prepare('SELECT category, COUNT(*) as count FROM videos WHERE status = 1 GROUP BY category').all<{ category: string; count: number }>()
			));
			const map = new Map<string, number>();
			for (const r of results) if (r.results) for (const row of r.results) if (row.category) map.set(row.category, (map.get(row.category) || 0) + row.count);
			const categories = Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

			await setCache(request, env, cacheKey, categories, 86400, true);
			return json({ success: true, data: categories }, 200, strongCacheHeaders(86400));
		}

		// ======== 搜索（短缓存，高频） ========
		if (path === '/api/search') {
			const q = url.searchParams.get('q') || '';
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
			if (!q.trim()) return json({ success: true, data: { videos: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } } });

			const cacheKey = `srch:${CACHE_VERSION}:${q}:p${page}:l${limit}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, strongCacheHeaders(600));

			const pattern = '%' + q + '%';
			const shards = getShards(env);

			const [videoResults, countResults] = await Promise.all([
				Promise.all(shards.map(db => db.prepare('SELECT ' + VIDEO_COLS + ' FROM videos WHERE status = 1 AND title LIKE ? ORDER BY created_at DESC LIMIT 200').bind(pattern).all<VideoRow>())),
				Promise.all(shards.map(db => db.prepare('SELECT COUNT(*) as total FROM videos WHERE status = 1 AND title LIKE ?').bind(pattern).first<{ total: number }>()))
			]);

			const allVideos: VideoRow[] = [];
			for (const r of videoResults) if (r.results) allVideos.push(...r.results);
			allVideos.sort((a, b) => b.created_at - a.created_at);
			const total = countResults.reduce((s, r) => s + (r?.total || 0), 0);
			const offset = (page - 1) * limit;

			const responseData = { videos: allVideos.slice(offset, offset + limit), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
			await setCache(request, env, cacheKey, responseData, 600, false);
			return json({ success: true, data: responseData }, 200, strongCacheHeaders(600));
		}

		// ======== 排行 ========
		if (path === '/api/rank') {
			const category = url.searchParams.get('category') || '';
			const cacheKey = `rank:${CACHE_VERSION}:${category || 'all'}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, strongCacheHeaders(21600));

			const shards = getShards(env);
			const sql = category
				? 'SELECT ' + VIDEO_COLS + ' FROM videos WHERE status = 1 AND category = ? ORDER BY views DESC LIMIT 50'
				: 'SELECT ' + VIDEO_COLS + ' FROM videos WHERE status = 1 ORDER BY views DESC LIMIT 50';

			const results = category
				? await Promise.all(shards.map(db => db.prepare(sql).bind(category).all<VideoRow>()))
				: await Promise.all(shards.map(db => db.prepare(sql).all<VideoRow>()));

			const allVideos: VideoRow[] = [];
			for (const r of results) if (r.results) allVideos.push(...r.results);
			allVideos.sort((a, b) => b.views - a.views);
			const top50 = allVideos.slice(0, 50);

			await setCache(request, env, cacheKey, top50, 21600, true);
			return json({ success: true, data: top50 }, 200, strongCacheHeaders(21600));
		}

		// ======== 标签 ========
		if (path === '/api/tags') {
			const type = url.searchParams.get('type') || '';
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
			const cacheKey = `tags:${CACHE_VERSION}:${type || 'all'}:l${limit}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, strongCacheHeaders(86400));

			let sql = 'SELECT id, name, slug, type, video_count FROM tags';
			if (type) sql += ' WHERE type = ?';
			sql += ' ORDER BY video_count DESC LIMIT ?';
			const params = type ? [type, limit] : [limit];
			const results = await env.DB_0.prepare(sql).bind(...params).all();

			await setCache(request, env, cacheKey, results.results || [], 86400, true);
			return json({ success: true, data: results.results || [] }, 200, strongCacheHeaders(86400));
		}

		// ======== 标签视频 ========
		if (path === '/api/tag/videos') {
			const tagId = parseInt(url.searchParams.get('tag_id') || '0');
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
			if (!tagId) return json({ success: false, message: '缺少tag_id' }, 400);

			const cacheKey = `tagv:${CACHE_VERSION}:${tagId}:p${page}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, strongCacheHeaders(3600));

			const offset = (page - 1) * limit;
			const vodIdResult = await env.DB_0.prepare(
				'SELECT video_vod_id FROM video_tags WHERE tag_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
			).bind(tagId, limit, offset).all<{ video_vod_id: string }>();

			const vodIds = (vodIdResult.results || []).map(r => r.video_vod_id);
			if (vodIds.length === 0) return json({ success: true, data: { videos: [], pagination: { page, limit, total: 0, totalPages: 0 } } });

			const shards = getShards(env);
			const placeholders = vodIds.map(() => '?').join(',');
			const videoResults = await Promise.all(
				shards.map(db => db.prepare('SELECT ' + VIDEO_COLS + ' FROM videos WHERE vod_id IN (' + placeholders + ') AND status = 1').bind(...vodIds).all<VideoRow>())
			);

			const videoMap = new Map<string, VideoRow>();
			for (const r of videoResults) if (r.results) for (const v of r.results) videoMap.set(v.vod_id, v);
			const videos = vodIds.map(id => videoMap.get(id)).filter(Boolean) as VideoRow[];
			const countResult = await env.DB_0.prepare('SELECT COUNT(*) as total FROM video_tags WHERE tag_id = ?').bind(tagId).first<{ total: number }>();
			const total = countResult?.total || 0;

			const responseData = { videos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
			await setCache(request, env, cacheKey, responseData, 3600, false);
			return json({ success: true, data: responseData }, 200, strongCacheHeaders(3600));
		}

		// ======== 管理后台认证 ========
		if (path === '/api/admin/auth' && request.method === 'POST') {
			const { password } = await request.json<{ password?: string }>();
			if (!password) return json({ success: false, message: '缺少密码' }, 400);
			if (password !== env.ADMIN_PASSWORD) return json({ success: false, message: '密码错误' }, 401);
			// 生成简单 token（24小时有效）
			const token = btoa(JSON.stringify({ t: Date.now(), r: Math.random().toString(36).slice(2) }));
			return json({ success: true, token });
		}

		// ======== 管理后台（低频，不缓存） ========
		// 所有 /api/admin/* 请求需要验证 token
		if (path.startsWith('/api/admin/') && path !== '/api/admin/auth') {
			const authHeader = request.headers.get('Authorization') || '';
			const token = authHeader.replace('Bearer ', '');
			if (!token) return json({ success: false, message: '未登录' }, 401);
			try {
				const payload = JSON.parse(atob(token));
				if (Date.now() - payload.t > 24 * 60 * 60 * 1000) return json({ success: false, message: '登录已过期' }, 401);
			} catch {
				return json({ success: false, message: '无效凭证' }, 401);
			}
		}

		if (path === '/api/admin/sources' && request.method === 'GET') {
			const results = await env.DB_0.prepare('SELECT id, name, api_url, status, last_collect_at, total_videos, created_at FROM sources ORDER BY id').all();
			return json({ success: true, data: results.results || [] });
		}

		if (path === '/api/admin/sources' && request.method === 'POST') {
			const body = await request.json<{ name?: string; api_url?: string }>();
			if (!body.name || !body.api_url) return json({ success: false, message: '缺少名称或接口地址' }, 400);
			await env.DB_0.prepare('INSERT INTO sources (name, api_url, status, total_videos, created_at) VALUES (?, ?, 1, 0, ?)').bind(body.name, body.api_url, Math.floor(Date.now() / 1000)).run();
			return json({ success: true, message: '添加成功' });
		}

		if (path === '/api/admin/sources' && request.method === 'DELETE') {
			const id = parseInt(url.searchParams.get('id') || '0');
			if (!id) return json({ success: false, message: '缺少id' }, 400);
			await env.DB_0.prepare('DELETE FROM sources WHERE id = ?').bind(id).run();
			return json({ success: true, message: '删除成功' });
		}

		if (path === '/api/admin/logs') {
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
			const results = await env.DB_0.prepare(
				'SELECT l.*, s.name as source_name FROM collect_logs l LEFT JOIN sources s ON l.source_id = s.id ORDER BY l.created_at DESC LIMIT ?'
			).bind(limit).all();
			return json({ success: true, data: results.results || [] });
		}

		if (path === '/api/admin/collect' && request.method === 'POST') {
			const { source_id } = await request.json<{ source_id?: number }>();
			if (!source_id) return json({ success: false, message: '缺少source_id' }, 400);
			const source = await env.DB_0.prepare('SELECT * FROM sources WHERE id = ?').bind(source_id).first<{ id: number; name: string; api_url: string }>();
			if (!source) return json({ success: false, message: '采集源不存在' }, 404);
			await env.DB_0.prepare('INSERT INTO collect_logs (source_id, action, details, new_count, created_at) VALUES (?, ?, ?, ?, ?)').bind(source_id, 'collect_start', '开始采集: ' + source.name, 0, Math.floor(Date.now() / 1000)).run();
			return json({ success: true, message: '采集任务已启动' });
		}

		if (path === '/api/admin/stats') {
			const shards = getShards(env);
			const videoCounts = await Promise.all(shards.map(db => db.prepare('SELECT COUNT(*) as cnt FROM videos WHERE status = 1').first<{ cnt: number }>()));
			const totalVideos = videoCounts.reduce((s, r) => s + (r?.cnt || 0), 0);
			const sourceCount = await env.DB_0.prepare('SELECT COUNT(*) as cnt FROM sources').first<{ cnt: number }>();
			const todayLogs = await env.DB_0.prepare('SELECT COUNT(*) as cnt, SUM(new_count) as total_new FROM collect_logs WHERE created_at > ?').bind(Math.floor(Date.now() / 1000) - 86400).first<{ cnt: number; total_new: number }>();
			return json({ success: true, data: { totalVideos, sourceCount: sourceCount?.cnt || 0, todayCollectCount: todayLogs?.cnt || 0, todayNewVideos: todayLogs?.total_new || 0 } });
		}

		return json({ success: false, message: 'API not found' }, 404);
	} catch (err: any) {
		return json({ success: false, message: err.message || '服务器错误' }, 500);
	}
};
