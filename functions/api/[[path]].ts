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
			'Cache-Tag': 'api,video,home',
			...extraHeaders
		}
	});
}

function swrHeaders(maxAge: number) {
	return { 'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge * 2}, stale-while-revalidate=${maxAge}` };
}

function getShards(env: Env): D1Database[] {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

const VIDEO_COLS = 'id, vod_id, title, cover, category, duration, views, created_at';
const VIDEO_DETAIL_COLS = 'id, vod_id, title, cover, category, duration, description, play_url, status, views, created_at, updated_at, vod_year, vod_area, vod_director, vod_actor, vod_remarks';

// KV 缓存辅助：只在缓存未命中时写入，减少写入量
async function cacheGet(cache: KVNamespace, key: string): Promise<any | null> {
	try {
		const val = await cache.get(key);
		return val ? JSON.parse(val) : null;
	} catch { return null; }
}

async function cacheSet(cache: KVNamespace, key: string, data: any, ttl: number): Promise<void> {
	try { await cache.put(key, JSON.stringify(data), { expirationTtl: ttl }); } catch { /* KV 写入失败不影响响应 */ }
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
		// ======== 相关视频推荐（必须在 /api/video/:id 之前匹配） ========
		if (path.startsWith('/api/video/') && path.endsWith('/related')) {
			const vodId = path.replace('/api/video/', '').replace('/related', '');
			const cached = await cacheGet(env.CACHE, 'related:' + vodId);
			if (cached) return json({ success: true, data: cached }, 200, swrHeaders(1800));

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

			const sql = 'SELECT ' + VIDEO_COLS + ' FROM videos WHERE ' + conditions.join(' AND ') + ' ORDER BY views DESC LIMIT 100';
			const results = await Promise.all(shards.map(db => db.prepare(sql).bind(...bindings).all<any>()));
			let related: any[] = [];
			for (const r of results) if (r.results) related.push(...r.results);
			const unique = Array.from(new Map(related.map(v => [v.vod_id, v])).values()).slice(0, 12);

			// TTL 30分钟，减少 KV 写入
			cacheSet(env.CACHE, 'related:' + vodId, unique, 1800);
			return json({ success: true, data: unique });
		}

		// ======== 视频详情 ========
		if (path.startsWith('/api/video/')) {
			const vodId = path.replace('/api/video/', '');
			const cached = await cacheGet(env.CACHE, 'video:' + vodId);
			if (cached) return json({ success: true, data: cached }, 200, swrHeaders(1800));

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

			// TTL 30分钟，减少 KV 写入
			cacheSet(env.CACHE, 'video:' + vodId, video, 1800);
			return json({ success: true, data: video });
		}

		// ======== 首页 ========
		if (path === '/api/home') {
			const hour = Math.floor(Date.now() / 3600000);
			const shardIndex = Math.floor(hour / 2) % 10;
			const cacheKey = 'home:videos:h' + hour;

			const cached = await cacheGet(env.CACHE, cacheKey);
			if (cached) return json({ success: true, data: { videos: cached, shard: shardIndex } }, 200, swrHeaders(3600));

			const shards = getShards(env);
			const result = await shards[shardIndex].prepare(
				'SELECT ' + VIDEO_COLS + ' FROM videos WHERE status = 1 ORDER BY created_at DESC LIMIT 24'
			).all<VideoRow>();

			const videos = result.results || [];
			cacheSet(env.CACHE, cacheKey, videos, 7200);
			return json({ success: true, data: { videos, shard: shardIndex } }, 200, swrHeaders(3600));
		}

		// ======== 通用视频列表 ========
		if (path === '/api/videos') {
			const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1);
			const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '20') || 20), 100);
			const category = url.searchParams.get('category');

			const cacheKey = 'videos:p' + page + ':l' + limit + ':' + (category || '');
			const cached = await cacheGet(env.CACHE, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, swrHeaders(1800));

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

			const responseData = { videos: allVideos.slice(offset, offset + limit), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
			cacheSet(env.CACHE, cacheKey, responseData, 1800);
			return json({ success: true, data: responseData }, 200, swrHeaders(1800));
		}

		// ======== 分类 ========
		if (path === '/api/categories') {
			const cached = await cacheGet(env.CACHE, 'categories');
			if (cached) return json({ success: true, data: cached }, 200, { 'Cache-Control': 'public, max-age=3600' });

			const shards = getShards(env);
			const results = await Promise.all(shards.map(db =>
				db.prepare('SELECT category, COUNT(*) as count FROM videos WHERE status = 1 GROUP BY category').all<{ category: string; count: number }>()
			));
			const map = new Map<string, number>();
			for (const r of results) if (r.results) for (const row of r.results) if (row.category) map.set(row.category, (map.get(row.category) || 0) + row.count);
			const categories = Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

			cacheSet(env.CACHE, 'categories', categories, 86400); // 24小时
			return json({ success: true, data: categories }, 200, { 'Cache-Control': 'public, max-age=3600' });
		}

		// ======== 搜索 ========
		if (path === '/api/search') {
			const q = url.searchParams.get('q') || '';
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

			if (!q.trim()) return json({ success: true, data: { videos: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } } });

			const cacheKey = 'search:' + q + ':p' + page + ':l' + limit;
			const cached = await cacheGet(env.CACHE, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, swrHeaders(1800));

			const pattern = '%' + q + '%';
			const shards = getShards(env);

			// 修复：搜索全部用10个分片，保持数据一致性
			const [videoResults, countResults] = await Promise.all([
				Promise.all(shards.map(db => db.prepare('SELECT ' + VIDEO_COLS + ' FROM videos WHERE status = 1 AND title LIKE ? ORDER BY created_at DESC').bind(pattern).all<VideoRow>())),
				Promise.all(shards.map(db => db.prepare('SELECT COUNT(*) as total FROM videos WHERE status = 1 AND title LIKE ?').bind(pattern).first<{ total: number }>()))
			]);

			const allVideos: VideoRow[] = [];
			for (const r of videoResults) if (r.results) allVideos.push(...r.results);
			allVideos.sort((a, b) => b.created_at - a.created_at);
			const total = countResults.reduce((s, r) => s + (r?.total || 0), 0);
			const offset = (page - 1) * limit;

			const responseData = { videos: allVideos.slice(offset, offset + limit), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
			cacheSet(env.CACHE, cacheKey, responseData, 1800);
			return json({ success: true, data: responseData });
		}

		// ======== 排行 ========
		if (path === '/api/rank') {
			const category = url.searchParams.get('category') || '';
			const cacheKey = 'rank:' + category;
			const cached = await cacheGet(env.CACHE, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, { 'Cache-Control': 'public, max-age=3600' });

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

			cacheSet(env.CACHE, cacheKey, top50, 86400); // 24小时
			return json({ success: true, data: top50 }, 200, { 'Cache-Control': 'public, max-age=3600' });
		}

		// ======== 标签 ========
		if (path === '/api/tags') {
			const type = url.searchParams.get('type') || '';
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

			const cacheKey = 'tags:' + type + ':l' + limit;
			const cached = await cacheGet(env.CACHE, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, { 'Cache-Control': 'public, max-age=3600' });

			let sql = 'SELECT id, name, slug, type, video_count FROM tags';
			if (type) sql += ' WHERE type = ?';
			sql += ' ORDER BY video_count DESC LIMIT ?';
			const params = type ? [type, limit] : [limit];
			const results = await env.DB_0.prepare(sql).bind(...params).all();

			cacheSet(env.CACHE, cacheKey, results.results || [], 86400); // 24小时
			return json({ success: true, data: results.results || [] }, 200, { 'Cache-Control': 'public, max-age=3600' });
		}

		// ======== 标签视频 ========
		if (path === '/api/tag/videos') {
			const tagId = parseInt(url.searchParams.get('tag_id') || '0');
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

			if (!tagId) return json({ success: false, message: '缺少tag_id' }, 400);

			const cacheKey = 'tag_videos:' + tagId + ':p' + page;
			const cached = await cacheGet(env.CACHE, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, swrHeaders(1800));

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
			cacheSet(env.CACHE, cacheKey, responseData, 1800);
			return json({ success: true, data: responseData }, 200, swrHeaders(1800));
		}

		// ======== 管理后台（低频，不缓存） ========
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
