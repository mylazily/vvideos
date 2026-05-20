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

function json(data: any, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
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
		// ---- 视频列表 ----
		if (path === '/api/videos') {
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
			const category = url.searchParams.get('category');

			const cacheKey = 'videos:p' + page + ':l' + limit + ':' + (category || '');
			const cached = await env.CACHE.get(cacheKey);
			if (cached) return json({ success: true, data: JSON.parse(cached) }, 200, { 'Cache-Control': 'public, max-age=60' });

			const where = category ? 'WHERE status = 1 AND category = ?' : 'WHERE status = 1';
			const params = category ? [category] : [];

			const shards = getShards(env);
			const queryShards = page <= 1 ? shards.slice(0, 2) : shards.slice(0, 3);

			const [videoResults, countResults] = await Promise.all([
				Promise.all(queryShards.map(db => db.prepare('SELECT ' + VIDEO_COLS + ' FROM videos ' + where + ' ORDER BY created_at DESC').bind(...params).all<VideoRow>())),
				Promise.all(shards.map(db => db.prepare('SELECT COUNT(*) as total FROM videos ' + where).bind(...params).first<{ total: number }>()))
			]);

			const allVideos: VideoRow[] = [];
			for (const r of videoResults) if (r.results) allVideos.push(...r.results);
			allVideos.sort((a, b) => b.created_at - a.created_at);

			const total = countResults.reduce((s, r) => s + (r?.total || 0), 0);
			const offset = (page - 1) * limit;
			const paged = allVideos.slice(offset, offset + limit);

			const responseData = { videos: paged, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
			await env.CACHE.put(cacheKey, JSON.stringify(responseData), { expirationTtl: 300 });
			return json({ success: true, data: responseData });
		}

		// ---- 视频详情 ----
		if (path.startsWith('/api/video/')) {
			const vodId = path.replace('/api/video/', '');
			const shards = getShards(env);
			const results = await Promise.all(shards.map(db => db.prepare('SELECT * FROM videos WHERE vod_id = ? AND status = 1').bind(vodId).first<VideoRow>()));
			const video = results.find(r => r !== null);

			if (!video) return json({ success: false, message: '视频不存在' }, 404);

			const shardIdx = results.indexOf(video);
			if (shardIdx >= 0) {
				context.waitUntil(shards[shardIdx].prepare('UPDATE videos SET views = views + 1 WHERE vod_id = ?').bind(vodId).run());
			}

			return json({ success: true, data: video });
		}

		// ---- 分类 ----
		if (path === '/api/categories') {
			const cached = await env.CACHE.get('categories');
			if (cached) return json({ success: true, data: JSON.parse(cached) }, 200, { 'Cache-Control': 'public, max-age=300' });

			const shards = getShards(env);
			const results = await Promise.all(shards.map(db => db.prepare('SELECT category, COUNT(*) as count FROM videos WHERE status = 1 GROUP BY category').all<{ category: string; count: number }>()));

			const map = new Map<string, number>();
			for (const r of results) if (r.results) for (const row of r.results) if (row.category) map.set(row.category, (map.get(row.category) || 0) + row.count);

			const categories = Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
			await env.CACHE.put('categories', JSON.stringify(categories), { expirationTtl: 600 });
			return json({ success: true, data: categories });
		}

		// ---- 搜索 ----
		if (path === '/api/search') {
			const q = url.searchParams.get('q') || '';
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

			if (!q.trim()) return json({ success: true, data: { videos: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } } });

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
			return json({ success: true, data: { videos: allVideos.slice(offset, offset + limit), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } });
		}

		// ---- 排行 ----
		if (path === '/api/rank') {
			const cached = await env.CACHE.get('rank');
			if (cached) return json({ success: true, data: JSON.parse(cached) }, 200, { 'Cache-Control': 'public, max-age=60' });

			const shards = getShards(env);
			const results = await Promise.all(shards.map(db => db.prepare('SELECT ' + VIDEO_COLS + ' FROM videos WHERE status = 1 ORDER BY views DESC LIMIT 50').all<VideoRow>()));

			const allVideos: VideoRow[] = [];
			for (const r of results) if (r.results) allVideos.push(...r.results);
			allVideos.sort((a, b) => b.views - a.views);

			const top50 = allVideos.slice(0, 50);
			await env.CACHE.put('rank', JSON.stringify(top50), { expirationTtl: 300 });
			return json({ success: true, data: top50 });
		}

		// ---- 标签（tags表只在DB_0） ----
		if (path === '/api/tags') {
			const type = url.searchParams.get('type') || '';
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

			const cacheKey = 'tags:' + type + ':l' + limit;
			const cached = await env.CACHE.get(cacheKey);
			if (cached) return json({ success: true, data: JSON.parse(cached) }, 200, { 'Cache-Control': 'public, max-age=300' });

			let sql = 'SELECT id, name, slug, type, video_count FROM tags';
			if (type) sql += ' WHERE type = ?';
			sql += ' ORDER BY video_count DESC LIMIT ?';
			const params = type ? [type, limit] : [limit];

			const results = await env.DB_0.prepare(sql).bind(...params).all<{ id: number; name: string; slug: string; type: string; video_count: number }>();

			await env.CACHE.put(cacheKey, JSON.stringify(results.results || []), { expirationTtl: 600 });
			return json({ success: true, data: results.results || [] });
		}

		// ---- 标签视频（通过video_tags关联） ----
		if (path === '/api/tag/videos') {
			const tagId = parseInt(url.searchParams.get('tag_id') || '0');
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

			if (!tagId) return json({ success: false, message: '缺少tag_id' }, 400);

			// 从DB_0的video_tags获取vod_id列表
			const offset = (page - 1) * limit;
			const vodIdResult = await env.DB_0.prepare(
				'SELECT video_vod_id FROM video_tags WHERE tag_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
			).bind(tagId, limit, offset).all<{ video_vod_id: string }>();

			const vodIds = (vodIdResult.results || []).map(r => r.video_vod_id);
			if (vodIds.length === 0) return json({ success: true, data: { videos: [], pagination: { page, limit, total: 0, totalPages: 0 } } });

			// 从所有分片查视频详情
			const shards = getShards(env);
			const placeholders = vodIds.map(() => '?').join(',');
			const videoResults = await Promise.all(
				shards.map(db => db.prepare('SELECT ' + VIDEO_COLS + ' FROM videos WHERE vod_id IN (' + placeholders + ') AND status = 1').bind(...vodIds).all<VideoRow>())
			);

			const videoMap = new Map<string, VideoRow>();
			for (const r of videoResults) if (r.results) for (const v of r.results) videoMap.set(v.vod_id, v);

			// 按vodIds顺序返回
			const videos = vodIds.map(id => videoMap.get(id)).filter(Boolean) as VideoRow[];

			// 总数
			const countResult = await env.DB_0.prepare('SELECT COUNT(*) as total FROM video_tags WHERE tag_id = ?').bind(tagId).first<{ total: number }>();
			const total = countResult?.total || 0;

			return json({ success: true, data: { videos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } });
		}

		return json({ success: false, message: 'API not found' }, 404);
	} catch (err: any) {
		return json({ success: false, message: err.message || '服务器错误' }, 500);
	}
};
