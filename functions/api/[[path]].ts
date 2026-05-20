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
		// ======== 首页专用 API ========
		// 每2小时轮换一个库，固定24个视频，KV 缓存 1 小时
		// 10万日活下，每小时只消耗 1 次 Worker 请求
		if (path === '/api/home') {
			// 基于时间计算当前应该查哪个库（每2小时切换）
			const hour = Math.floor(Date.now() / 3600000);
			const shardIndex = Math.floor(hour / 2) % 10; // 每2小时切换一个库
			const cacheKey = 'home:videos:h' + hour;
			
			const cached = await env.CACHE.get(cacheKey);
			if (cached) {
				return json({ success: true, data: { videos: JSON.parse(cached), shard: shardIndex } }, 200, {
					'Cache-Control': 'public, max-age=3600, s-maxage=3600'
				});
			}

			// 从当前轮换的库取24个视频
			const shards = getShards(env);
			const result = await shards[shardIndex].prepare(
				'SELECT ' + VIDEO_COLS + ' FROM videos WHERE status = 1 ORDER BY created_at DESC LIMIT 24'
			).all<VideoRow>();

			const videos = result.results || [];
			await env.CACHE.put(cacheKey, JSON.stringify(videos), { expirationTtl: 3600 });
			return json({ success: true, data: { videos, shard: shardIndex } }, 200, {
				'Cache-Control': 'public, max-age=3600, s-maxage=3600'
			});
		}

		// ======== 通用视频列表（分类/翻页用） ========
		if (path === '/api/videos') {
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
			const category = url.searchParams.get('category');

			const cacheKey = 'videos:p' + page + ':l' + limit + ':' + (category || '');
			const cached = await env.CACHE.get(cacheKey);
			if (cached) {
				return json({ success: true, data: JSON.parse(cached) }, 200, {
					'Cache-Control': 'public, max-age=600, s-maxage=600'
				});
			}

			const where = category ? 'WHERE status = 1 AND category = ?' : 'WHERE status = 1';
			const params = category ? [category] : [];
			const shards = getShards(env);
			
			const [videoResults, countResults] = await Promise.all([
				Promise.all(shards.map(db => db.prepare('SELECT ' + VIDEO_COLS + ' FROM videos ' + where + ' ORDER BY created_at DESC').bind(...params).all<VideoRow>())),
				Promise.all(shards.map(db => db.prepare('SELECT COUNT(*) as total FROM videos ' + where).bind(...params).first<{ total: number }>()))
			]);
			
			const allVideos: VideoRow[] = [];
			for (const r of videoResults) if (r.results) allVideos.push(...r.results);
			allVideos.sort((a, b) => b.created_at - a.created_at);
			const total = countResults.reduce((s, r) => s + (r?.total || 0), 0);
			const offset = (page - 1) * limit;
			const pagedVideos = allVideos.slice(offset, offset + limit);

			const responseData = { videos: pagedVideos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
			await env.CACHE.put(cacheKey, JSON.stringify(responseData), { expirationTtl: 600 });
			return json({ success: true, data: responseData }, 200, {
				'Cache-Control': 'public, max-age=600, s-maxage=600'
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
			const category = url.searchParams.get('category') || '';
			const cacheKey = 'rank:' + category;
			const cached = await env.CACHE.get(cacheKey);
			if (cached) return json({ success: true, data: JSON.parse(cached) }, 200, { 'Cache-Control': 'public, max-age=3600' });

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
			await env.CACHE.put(cacheKey, JSON.stringify(top50), { expirationTtl: 3600 });
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
		// 获取采集源列表
		if (path === '/api/admin/sources' && request.method === 'GET') {
			const results = await env.DB_0.prepare('SELECT id, name, api_url, status, last_collect_at, total_videos, created_at FROM sources ORDER BY id').all<{
				id: number; name: string; api_url: string; status: number; last_collect_at: number; total_videos: number; created_at: number;
			}>();
			return json({ success: true, data: results.results || [] });
		}

		// 添加采集源
		if (path === '/api/admin/sources' && request.method === 'POST') {
			const body = await request.json<{ name?: string; api_url?: string }>();
			if (!body.name || !body.api_url) {
				return json({ success: false, message: '缺少名称或接口地址' }, 400);
			}
			await env.DB_0.prepare(
				'INSERT INTO sources (name, api_url, status, total_videos, created_at) VALUES (?, ?, 1, 0, ?)'
			).bind(body.name, body.api_url, Math.floor(Date.now() / 1000)).run();
			return json({ success: true, message: '添加成功' });
		}

		// 删除采集源
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
