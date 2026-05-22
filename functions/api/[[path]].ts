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
	ADMIN_PASSWORD: string;
}

interface VideoRow {
	id: number;
	vod_id: string;
	fingerprint_id: number;
	title: string;
	title_normalized: string;
	cover: string;
	category: string;
	views: number;
	created_at: number;
	updated_at: number;
	vod_year: string;
	vod_area: string;
	vod_director: string;
	vod_actor: string;
	vod_remarks: string;
	vod_lang: string;
	// 多源播放
	play_url_1: string;
	play_url_2: string;
	play_url_3: string;
	play_url_4: string;
	play_url_5: string;
	duration_1: number;
	duration_2: number;
	duration_3: number;
	duration_4: number;
	duration_5: number;
	ad_segments: string;
}

const CACHE_VERSION = 'v3';

function json(data: any, status = 200, extraHeaders: Record<string, string> = {}) {
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

function strongCacheHeaders(maxAge: number) {
	return { 
		'Cache-Control': `public, max-age=${maxAge}`,
		'CDN-Cache-Control': `public, max-age=${maxAge}`
	};
}

function getShards(env: Env): D1Database[] {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

// 视频列表列（不包含播放URL）
const VIDEO_COLS = 'id, vod_id, title, cover, category, views, created_at, vod_year, vod_area, vod_actor';
// 视频详情列（包含多源播放URL）
const VIDEO_DETAIL_COLS = 'id, vod_id, fingerprint_id, title, title_normalized, cover, category, views, created_at, updated_at, vod_year, vod_area, vod_director, vod_actor, vod_remarks, vod_lang, play_url_1, play_url_2, play_url_3, play_url_4, play_url_5, duration_1, duration_2, duration_3, duration_4, duration_5, ad_segments';

// 双层缓存系统
async function getCache(request: Request, env: Env, key: string): Promise<any | null> {
	try {
		const cache = await caches.open('api-cache-v1');
		const cached = await cache.match(request);
		if (cached) {
			const data = await cached.json();
			return data;
		}
	} catch { }
	
	try {
		const val = await env.CACHE.get(key);
		if (val) {
			const data = JSON.parse(val);
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
	
	if (persistToKV && cacheSeconds > 3600) {
		try { 
			await env.CACHE.put(key, jsonStr, { expirationTtl: cacheSeconds }); 
		} catch { }
	}
}

// 格式化视频数据（提取播放源列表）
function formatVideoDetail(row: VideoRow) {
	const playSources = [];
	if (row.play_url_1) playSources.push({ url: row.play_url_1, duration: row.duration_1 });
	if (row.play_url_2) playSources.push({ url: row.play_url_2, duration: row.duration_2 });
	if (row.play_url_3) playSources.push({ url: row.play_url_3, duration: row.duration_3 });
	if (row.play_url_4) playSources.push({ url: row.play_url_4, duration: row.duration_4 });
	if (row.play_url_5) playSources.push({ url: row.play_url_5, duration: row.duration_5 });
	
	// 解析广告段
	let adSegments = [];
	try {
		if (row.ad_segments) adSegments = JSON.parse(row.ad_segments);
	} catch { }
	
	return {
		id: row.id,
		vod_id: row.vod_id,
		title: row.title,
		cover: row.cover,
		category: row.category,
		views: row.views,
		created_at: row.created_at,
		updated_at: row.updated_at,
		vod_year: row.vod_year,
		vod_area: row.vod_area,
		vod_director: row.vod_director,
		vod_actor: row.vod_actor,
		vod_remarks: row.vod_remarks,
		vod_lang: row.vod_lang,
		play_sources: playSources,
		ad_segments: adSegments
	};
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

			await setCache(request, env, cacheKey, unique, 1800, false);
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
			const row = results.find(r => r !== null);
			if (!row) return json({ success: false, message: '视频不存在' }, 404);

			const video = formatVideoDetail(row);

			// 异步更新浏览量
			const shardIdx = results.indexOf(row);
			if (shardIdx >= 0) {
				context.waitUntil(shards[shardIdx].prepare('UPDATE videos SET views = views + 1 WHERE vod_id = ?').bind(vodId).run());
			}

			await setCache(request, env, cacheKey, video, 3600, true);
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

		// ======== 热门搜索关键字 ========
		if (path === '/api/keywords') {
			if (request.method === 'GET') {
				const cacheKey = `hot_keywords:${CACHE_VERSION}`;
				const cached = await getCache(request, env, cacheKey);
				if (cached) return json({ success: true, data: cached }, 200, strongCacheHeaders(300));

				const results = await env.DB_0.prepare('SELECT id, keyword, sort_order FROM hot_keywords ORDER BY sort_order ASC, id DESC').all<{ id: number; keyword: string; sort_order: number }>();
				const keywords = (results.results || []).map(r => r.keyword);
				await setCache(env, cacheKey, keywords, 300);
				return json({ success: true, data: keywords }, 200, strongCacheHeaders(300));
			}
			if (request.method === 'POST') {
				const { keyword, sort_order } = await request.json<{ keyword: string; sort_order?: number }>();
				if (!keyword || !keyword.trim()) return json({ success: false, message: '关键字不能为空' }, 400);
				try {
					await env.DB_0.prepare('INSERT INTO hot_keywords (keyword, sort_order) VALUES (?, ?)').bind(keyword.trim(), sort_order || 0).run();
					return json({ success: true, message: '添加成功' });
				} catch (e: any) {
					if (e.message?.includes('UNIQUE')) return json({ success: false, message: '关键字已存在' }, 409);
					throw e;
				}
			}
			if (request.method === 'DELETE') {
				const { id } = await request.json<{ id: number }>();
				if (!id) return json({ success: false, message: '缺少id' }, 400);
				await env.DB_0.prepare('DELETE FROM hot_keywords WHERE id = ?').bind(id).run();
				return json({ success: true, message: '删除成功' });
			}
		}

		// ======== 分类列表（用于排行页等，只返回分类名称数组） ========
		if (path === '/api/categories') {
			const cacheKey = `catlist:${CACHE_VERSION}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, strongCacheHeaders(86400));

			const shards = getShards(env);
			const results = await Promise.all(shards.map(db =>
				db.prepare('SELECT DISTINCT category FROM videos WHERE status = 1 AND category IS NOT NULL AND category != ""').all<{ category: string }>()
			));
			const categorySet = new Set<string>();
			for (const r of results) {
				if (r.results) {
					for (const row of r.results) {
						if (row.category) categorySet.add(row.category);
					}
				}
			}
			const categories = Array.from(categorySet).sort();

			await setCache(request, env, cacheKey, categories, 86400, true);
			return json({ success: true, data: categories }, 200, strongCacheHeaders(86400));
		}

		// ======== 动态筛选条件（分类+地区，用于交叉聚合页） ========
		if (path === '/api/filters') {
			const cacheKey = `filters:${CACHE_VERSION}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, strongCacheHeaders(86400));

			const shards = getShards(env);
			const [categoryResults, areaResults] = await Promise.all([
				Promise.all(shards.map(db =>
					db.prepare('SELECT DISTINCT category FROM videos WHERE status = 1 AND category IS NOT NULL AND category != ""').all<{ category: string }>()
				)),
				Promise.all(shards.map(db =>
					db.prepare('SELECT DISTINCT vod_area FROM videos WHERE status = 1 AND vod_area IS NOT NULL AND vod_area != ""').all<{ vod_area: string }>()
				))
			]);

			const categorySet = new Set<string>();
			for (const r of categoryResults) {
				if (r.results) {
					for (const row of r.results) {
						if (row.category) categorySet.add(row.category);
					}
				}
			}

			const areaSet = new Set<string>();
			for (const r of areaResults) {
				if (r.results) {
					for (const row of r.results) {
						if (row.vod_area) areaSet.add(row.vod_area);
					}
				}
			}

			const filters = {
				categories: Array.from(categorySet).sort(),
				areas: Array.from(areaSet).sort()
			};

			await setCache(request, env, cacheKey, filters, 86400, true);
			return json({ success: true, data: filters }, 200, strongCacheHeaders(86400));
		}

		// ======== 搜索（短缓存，高频） ========
		if (path === '/api/search') {
			const q = url.searchParams.get('q') || '';
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '20') || 20), 100);
			if (!q.trim()) return json({ success: true, data: { videos: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } } });

			const cacheKey = `srch:${CACHE_VERSION}:${q}:p${page}:l${limit}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json({ success: true, data: cached }, 200, strongCacheHeaders(600));

			const escaped = q.replace(/[%_\\]/g, '\\$&');
			const pattern = `%${escaped}%`;
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

		// ======== 管理后台认证 ========
		if (path === '/api/aadmin/auth' && request.method === 'POST') {
			const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
			const rateLimitKey = `admin_login_rate:${clientIP}`;
			const rateLimitData = await env.CACHE.get(rateLimitKey);
			if (rateLimitData) {
				const attempts = parseInt(rateLimitData);
				if (attempts >= 5) {
					return json({ success: false, message: '尝试次数过多，请稍后再试' }, 429);
				}
			}
			const { password } = await request.json<{ password?: string }>();
			if (!password) return json({ success: false, message: '缺少密码' }, 400);
			if (password !== env.ADMIN_PASSWORD) {
				const current = rateLimitData ? parseInt(rateLimitData) : 0;
				await env.CACHE.put(rateLimitKey, String(current + 1), { expirationTtl: 60 });
				return json({ success: false, message: '密码错误' }, 401);
			}
			await env.CACHE.delete(rateLimitKey);
			const bytes = new Uint8Array(32);
			crypto.getRandomValues(bytes);
			const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
			await env.CACHE.put(`admin_token:${token}`, String(Math.floor(Date.now() / 1000)), { expirationTtl: 86400 });
			// 同步生成定时任务专用 cron token（永不过期）
			const cronBytes = new Uint8Array(32);
			crypto.getRandomValues(cronBytes);
			const cronToken = Array.from(cronBytes, b => b.toString(16).padStart(2, '0')).join('');
			await env.CACHE.put('cron_admin_token', cronToken);
			return json({ success: true, token, cron_token: cronToken });
		}

		// ======== 管理后台（低频，不缓存） ========
		if (path.startsWith('/api/aadmin/') && path !== '/api/aadmin/auth') {
			const authHeader = request.headers.get('Authorization') || '';
			const token = authHeader.replace('Bearer ', '');
			if (!token) return json({ success: false, message: '未登录' }, 401);
			const tokenData = await env.CACHE.get(`admin_token:${token}`);
			if (!tokenData) return json({ success: false, message: '无效凭证或已过期' }, 401);
		}

		if (path === '/api/aadmin/sources' && request.method === 'GET') {
			const results = await env.DB_0.prepare('SELECT id, name, api_url, status, last_collect_at, total_videos, created_at FROM sources ORDER BY id').all();
			return json({ success: true, data: results.results || [] });
		}

		if (path === '/api/aadmin/sources' && request.method === 'POST') {
			const body = await request.json<{ name?: string; api_url?: string }>();
			if (!body.name || !body.api_url) return json({ success: false, message: '缺少名称或接口地址' }, 400);
			await env.DB_0.prepare('INSERT INTO sources (name, api_url, status, total_videos, created_at) VALUES (?, ?, 1, 0, ?)').bind(body.name, body.api_url, Math.floor(Date.now() / 1000)).run();
			return json({ success: true, message: '添加成功' });
		}

		if (path === '/api/aadmin/sources' && request.method === 'DELETE') {
			const id = parseInt(url.searchParams.get('id') || '0');
			if (!id) return json({ success: false, message: '缺少id' }, 400);
			await env.DB_0.prepare('DELETE FROM sources WHERE id = ?').bind(id).run();
			return json({ success: true, message: '删除成功' });
		}

		// 管理后台：热门搜索关键字管理
		if (path === '/api/aadmin/keywords') {
			if (request.method === 'GET') {
				const results = await env.DB_0.prepare('SELECT id, keyword, sort_order FROM hot_keywords ORDER BY sort_order ASC, id DESC').all<{ id: number; keyword: string; sort_order: number }>();
				return json({ success: true, data: results.results || [] });
			}
			if (request.method === 'DELETE') {
				const { id, keyword } = await request.json<{ id?: number; keyword?: string }>();
				if (id) {
					await env.DB_0.prepare('DELETE FROM hot_keywords WHERE id = ?').bind(id).run();
				} else if (keyword) {
					await env.DB_0.prepare('DELETE FROM hot_keywords WHERE keyword = ?').bind(keyword).run();
				} else {
					return json({ success: false, message: '缺少id或keyword' }, 400);
				}
				return json({ success: true, message: '删除成功' });
			}
		}

		if (path === '/api/aadmin/logs') {
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
			const results = await env.DB_0.prepare(
				'SELECT l.*, s.name as source_name FROM collect_logs l LEFT JOIN sources s ON l.source_id = s.id ORDER BY l.created_at DESC LIMIT ?'
			).bind(limit).all();
			return json({ success: true, data: results.results || [] });
		}

		if (path === '/api/aadmin/collect' && request.method === 'POST') {
			const { source_id, mode, pages, categories } = await request.json<{ source_id?: number; mode?: 'full' | 'single'; pages?: number; categories?: string[] }>();
			if (!source_id) return json({ success: false, message: '缺少source_id' }, 400);
			const source = await env.DB_0.prepare('SELECT * FROM sources WHERE id = ?').bind(source_id).first<{ id: number; name: string; api_url: string }>();
			if (!source) return json({ success: false, message: '采集源不存在' }, 404);
			const collectUrl = new URL('/api/collect', url.origin);
			const collectPages = mode === 'full' ? 999 : (pages || 5);
			const collectRes = await fetch(collectUrl.toString(), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': request.headers.get('Authorization') || '' },
				body: JSON.stringify({ source_url: source.api_url, pages: collectPages, source_id: source_id, mode: mode || 'single', categories }),
				signal: AbortSignal.timeout(mode === 'full' ? 3600000 : 300000)
			});
			const collectData = await collectRes.json();
			const newCount = collectData.data?.new || 0;
			await env.DB_0.prepare('INSERT INTO collect_logs (source_id, action, details, new_count, created_at) VALUES (?, ?, ?, ?, ?)').bind(source_id, 'collect_complete', '采集完成: ' + source.name + '，新增 ' + newCount + ' 条', newCount, Math.floor(Date.now() / 1000)).run();
			await env.DB_0.prepare('UPDATE sources SET last_collect_at = ?, total_videos = total_videos + ? WHERE id = ?').bind(Math.floor(Date.now() / 1000), newCount, source_id).run();
			return json({ success: true, message: '采集完成', data: { new: newCount } });
		}

		if (path === '/api/aadmin/stats') {
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
