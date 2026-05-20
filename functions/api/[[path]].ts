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

function getShards(env: Env): D1Database[] {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

const VIDEO_COLS = 'id, vod_id, title, cover, category, duration, views, created_at';

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
		// ======== 首页视频列表 ========
		// page=1 只查 DB_0，KV 缓存 1 小时，保证首页最快
		// page>1 查全部分片，KV 缓存 10 分钟
		if (path === '/api/videos') {
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
			const category = url.searchParams.get('category');

			const cacheKey = 'videos:p' + page + ':l' + limit + ':' + (category || '');
			const cached = await env.CACHE.get(cacheKey);
			if (cached) {
				const ttl = page === 1 ? 3600 : 600;
				return json({ success: true, data: JSON.parse(cached) }, 200, {
					'Cache-Control': 'public, max-age=' + ttl + ', s-maxage=' + ttl
				});
			}

			const where = category ? 'WHERE status = 1 AND category = ?' : 'WHERE status = 1';
			const params = category ? [category] : [];
			let allVideos: VideoRow[] = [];
			let total = 0;

			if (page === 1 && !category) {
				// 首页：只查 DB_0，最快
				const [videoResult, countResult] = await Promise.all([
					env.DB_0.prepare('SELECT ' + VIDEO_COLS + ' FROM videos WHERE status = 1 ORDER BY created_at DESC LIMIT ?').bind(limit).all<VideoRow>(),
					env.DB_0.prepare('SELECT COUNT(*) as total FROM videos WHERE status = 1').first<{ total: number }>()
				]);
				allVideos = videoResult.results || [];
				total = countResult?.total || 0;
			} else {
				// 非首页：查全部10个分片
				const shards = getShards(env);
				const [videoResults, countResults] = await Promise.all([
					Promise.all(shards.map(db => db.prepare('SELECT ' + VIDEO_COLS + ' FROM videos ' + where + ' ORDER BY created_at DESC').bind(...params).all<VideoRow>())),
					Promise.all(shards.map(db => db.prepare('SELECT COUNT(*) as total FROM videos ' + where).bind(...params).first<{ total: number }>()))
				]);
				for (const r of videoResults) if (r.results) allVideos.push(...r.results);
				allVideos.sort((a, b) => b.created_at - a.created_at);
				total = countResults.reduce((s, r) => s + (r?.total || 0), 0);
				const offset = (page - 1) * limit;
				allVideos = allVideos.slice(offset, offset + limit);
			}

			const responseData = { videos: allVideos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
			const ttl = page === 1 && !category ? 3600 : 600;
			await env.CACHE.put(cacheKey, JSON.stringify(responseData), { expirationTtl: ttl });
			return json({ success: true, data: responseData }, 200, {
				'Cache-Control': 'public, max-age=' + ttl + ', s-maxage=' + ttl
			});
		}

		// ======== 视频详情（KV 缓存 10 分钟） ========
		if (path.startsWith('/api/video/')) {
			const vodId = path.replace('/api/video/', '');
			const cacheKey = 'video:' + vodId;
			const cached = await env.CACHE.get(cacheKey);
			if (cached) return json({ success: true, data: JSON.parse(cached) }, 200, { 'Cache-Control': 'public, max-age=600' });

			const shards = getShards(env);
			const results = await Promise.all(shards.map(db => db.prepare('SELECT * FROM videos WHERE vod_id = ? AND status = 1').bind(vodId).first<VideoRow>()));
			const video = results.find(r => r !== null);

			if (!video) return json({ success: false, message: '视频不存在' }, 404);

			// 异步更新浏览量，不阻塞响应
			const shardIdx = results.indexOf(video);
			if (shardIdx >= 0) {
				context.waitUntil(shards[shardIdx].prepare('UPDATE videos SET views = views + 1 WHERE vod_id = ?').bind(vodId).run());
			}

			// 不缓存 play_url（太大），只缓存基本信息
			const { play_url, ...cacheData } = video;
			await env.CACHE.put(cacheKey, JSON.stringify(video), { expirationTtl: 600 });
			return json({ success: true, data: video });
		}

		// ======== 分类（KV 缓存 1 小时） ========
		if (path === '/api/categories') {
			const cached = await env.CACHE.get('categories');
			if (cached) return json({ success: true, data: JSON.parse(cached) }, 200, { 'Cache-Control': 'public, max-age=3600' });

			const shards = getShards(env);
			const results = await Promise.all(shards.map(db => db.prepare('SELECT category, COUNT(*) as count FROM videos WHERE status = 1 GROUP BY category').all<{ category: string; count: number }>()));

			const map = new Map<string, number>();
			for (const r of results) if (r.results) for (const row of r.results) if (row.category) map.set(row.category, (map.get(row.category) || 0) + row.count);

			const categories = Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
			await env.CACHE.put('categories', JSON.stringify(categories), { expirationTtl: 3600 });
			return json({ success: true, data: categories }, 200, { 'Cache-Control': 'public, max-age=3600' });
		}

		// ======== 搜索（KV 缓存 5 分钟） ========
		if (path === '/api/search') {
			const q = url.searchParams.get('q') || '';
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

			if (!q.trim()) return json({ success: true, data: { videos: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } } });

			const cacheKey = 'search:' + q + ':p' + page + ':l' + limit;
			const cached = await env.CACHE.get(cacheKey);
			if (cached) return json({ success: true, data: JSON.parse(cached) }, 200, { 'Cache-Control': 'public, max-age=300' });

			const pattern = '%' + q + '%';
			const shards = getShards(env);
			const queryShards = page <= 1 ? shards.slice(0, 3) : shards;

			const [videoResults, countResults] = await Promise.all([
				Promise.all(queryShards.map(db => db.prepare('SELECT ' + VIDEO_COLS + ' FROM videos WHERE status = 1 AND title LIKE ? ORDER BY created_at DESC').bind(pattern).all<VideoRow>())),
				Promise.all(shards.map(db => db.prepare('SELECT COUNT(*) as total FROM videos WHERE status = 1 AND title LIKE ?').bind(pattern).first<{ total: number }>()))
			]);

			const allVideos: VideoRow[] = [];
			for (const r of videoResults) if (r.results) allVideos.push(...r.results);
			allVideos.sort((a, b) => b.created_at - a.created_at);

			const total = countResults.reduce((s, r) => s + (r?.total || 0), 0);
			const offset = (page - 1) * limit;
			const responseData = { videos: allVideos.slice(offset, offset + limit), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
			await env.CACHE.put(cacheKey, JSON.stringify(responseData), { expirationTtl: 300 });
			return json({ success: true, data: responseData });
		}

		// ======== 排行（KV 缓存 1 小时） ========
		if (path === '/api/rank') {
			const cached = await env.CACHE.get('rank');
			if (cached) return json({ success: true, data: JSON.parse(cached) }, 200, { 'Cache-Control': 'public, max-age=3600' });

			const shards = getShards(env);
			const results = await Promise.all(shards.map(db => db.prepare('SELECT ' + VIDEO_COLS + ' FROM videos WHERE status = 1 ORDER BY views DESC LIMIT 50').all<VideoRow>()));

			const allVideos: VideoRow[] = [];
			for (const r of results) if (r.results) allVideos.push(...r.results);
			allVideos.sort((a, b) => b.views - a.views);

			const top50 = allVideos.slice(0, 50);
			await env.CACHE.put('rank', JSON.stringify(top50), { expirationTtl: 3600 });
			return json({ success: true, data: top50 }, 200, { 'Cache-Control': 'public, max-age=3600' });
		}

		// ======== 标签（tags表只在DB_0，KV 缓存 1 小时） ========
		if (path === '/api/tags') {
			const type = url.searchParams.get('type') || '';
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

			const cacheKey = 'tags:' + type + ':l' + limit;
			const cached = await env.CACHE.get(cacheKey);
			if (cached) return json({ success: true, data: JSON.parse(cached) }, 200, { 'Cache-Control': 'public, max-age=3600' });

			let sql = 'SELECT id, name, slug, type, video_count FROM tags';
			if (type) sql += ' WHERE type = ?';
			sql += ' ORDER BY video_count DESC LIMIT ?';
			const params = type ? [type, limit] : [limit];

			const results = await env.DB_0.prepare(sql).bind(...params).all<{ id: number; name: string; slug: string; type: string; video_count: number }>();

			await env.CACHE.put(cacheKey, JSON.stringify(results.results || []), { expirationTtl: 3600 });
			return json({ success: true, data: results.results || [] }, 200, { 'Cache-Control': 'public, max-age=3600' });
		}

		// ======== 标签视频（KV 缓存 10 分钟） ========
		if (path === '/api/tag/videos') {
			const tagId = parseInt(url.searchParams.get('tag_id') || '0');
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

			if (!tagId) return json({ success: false, message: '缺少tag_id' }, 400);

			const cacheKey = 'tag_videos:' + tagId + ':p' + page;
			const cached = await env.CACHE.get(cacheKey);
			if (cached) return json({ success: true, data: JSON.parse(cached) }, 200, { 'Cache-Control': 'public, max-age=600' });

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
			await env.CACHE.put(cacheKey, JSON.stringify(responseData), { expirationTtl: 600 });
			return json({ success: true, data: responseData });
		}

		// ======== 管理后台（低频，不缓存） ========
		if (path === '/api/admin/sources') {
			const results = await env.DB_0.prepare('SELECT id, name, api_url, status, last_collect_at, total_videos, created_at FROM sources ORDER BY id').all<{
				id: number; name: string; api_url: string; status: number; last_collect_at: number; total_videos: number; created_at: number;
			}>();
			return json({ success: true, data: results.results || [] });
		}

		if (path === '/api/admin/logs') {
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
			const results = await env.DB_0.prepare(
				'SELECT l.*, s.name as source_name FROM collect_logs l LEFT JOIN sources s ON l.source_id = s.id ORDER BY l.created_at DESC LIMIT ?'
			).bind(limit).all<{
				id: number; source_id: number; source_name: string; action: string; details: string; new_count: number; error_msg: string; created_at: number;
			}>();
			return json({ success: true, data: results.results || [] });
		}

		if (path === '/api/admin/collect' && request.method === 'POST') {
			const { source_id } = await request.json<{ source_id?: number }>();
			if (!source_id) return json({ success: false, message: '缺少source_id' }, 400);

			const source = await env.DB_0.prepare('SELECT * FROM sources WHERE id = ?').bind(source_id).first<{ id: number; name: string; api_url: string }>();
			if (!source) return json({ success: false, message: '采集源不存在' }, 404);

			await env.DB_0.prepare(
				'INSERT INTO collect_logs (source_id, action, details, new_count, created_at) VALUES (?, ?, ?, ?, ?)'
			).bind(source_id, 'collect_start', '开始采集: ' + source.name, 0, Math.floor(Date.now() / 1000)).run();

			return json({ success: true, message: '采集任务已启动' });
		}

		if (path === '/api/admin/stats') {
			const shards = getShards(env);
			const videoCounts = await Promise.all(shards.map(db => db.prepare('SELECT COUNT(*) as cnt FROM videos WHERE status = 1').first<{ cnt: number }>()));
			const totalVideos = videoCounts.reduce((s, r) => s + (r?.cnt || 0), 0);

			const sourceCount = await env.DB_0.prepare('SELECT COUNT(*) as cnt FROM sources').first<{ cnt: number }>();
			const todayLogs = await env.DB_0.prepare(
				'SELECT COUNT(*) as cnt, SUM(new_count) as total_new FROM collect_logs WHERE created_at > ?'
			).bind(Math.floor(Date.now() / 1000) - 86400).first<{ cnt: number; total_new: number }>();

			return json({
				success: true,
				data: {
					totalVideos,
					sourceCount: sourceCount?.cnt || 0,
					todayCollectCount: todayLogs?.cnt || 0,
					todayNewVideos: todayLogs?.total_new || 0
				}
			});
		}

		return json({ success: false, message: 'API not found' }, 404);
	} catch (err: any) {
		return json({ success: false, message: err.message || '服务器错误' }, 500);
	}
};
