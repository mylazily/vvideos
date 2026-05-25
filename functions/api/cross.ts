// 交叉聚合页 API - 地区×年份×分类 两两交叉生成聚合页
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

const VIDEO_COLS = 'vod_id, title, cover, category, vod_year, vod_area, vod_actor, vod_director, vod_lang, views, created_at';
const CACHE_VERSION = 'v2';

function getShards(env: Env): D1Database[] {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

function json(data: any, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 
			'Content-Type': 'application/json', 
			'Cache-Control': 'public, max-age=3600', 
			'Access-Control-Allow-Origin': '*',
			...headers 
		}
	});
}

function strongCacheHeaders(maxAge: number) {
	return { 
		'Cache-Control': `public, max-age=${maxAge}`,
		'CDN-Cache-Control': `public, max-age=${maxAge}`
	};
}

async function getCache(request: Request, env: Env, key: string): Promise<any | null> {
	try {
		const cache = await caches.open('cross-cache-v1');
		const cached = await cache.match(request);
		if (cached) return await cached.json();
	} catch { }
	
	try {
		const val = await env.CACHE.get(key);
		if (val) {
			const data = JSON.parse(val);
			try {
				const cache = await caches.open('cross-cache-v1');
				await cache.put(request, new Response(val, { headers: { 'Content-Type': 'application/json' } }));
			} catch { }
			return data;
		}
	} catch { }
	return null;
}

async function setCache(request: Request, env: Env, key: string, data: any, cacheSeconds: number, persistToKV: boolean = false): Promise<void> {
	const jsonStr = JSON.stringify(data);
	try {
		const cache = await caches.open('cross-cache-v1');
		await cache.put(request, new Response(jsonStr, { 
			headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${cacheSeconds}` }
		}));
	} catch { }
	
	if (persistToKV && cacheSeconds > 3600) {
		try { await env.CACHE.put(key, jsonStr, { expirationTtl: cacheSeconds }); } catch { }
	}
}

function safeCacheKey(parts: (string | number)[], prefix: string): string {
	return prefix + ':' + parts.map(p => p || '_').join(':');
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
		if (path === '/api/cross/dimensions') {
			const cacheKey = `cross:dim:${CACHE_VERSION}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json(cached, 200, strongCacheHeaders(3600));

			const shards = getShards(env);
			const results = await Promise.all(shards.map(db => db.prepare(
				`SELECT category, vod_area, vod_year, vod_actor FROM videos WHERE status = 1 LIMIT 1000`
			).all()));

			const categories = new Set<string>();
			const areas = new Set<string>();
			const years = new Set<string>();
			const actors = new Set<string>();

			for (const r of results) {
				if (r.results) {
					for (const row of r.results) {
						if (row.category) categories.add(row.category);
						if (row.vod_area) areas.add(row.vod_area);
						if (row.vod_year && /^\d{4}$/.test(row.vod_year)) years.add(row.vod_year);
						if (row.vod_actor) {
							row.vod_actor.split(/[,，]/).forEach(a => {
								const t = a.trim();
								if (t.length >= 2 && t.length <= 30) actors.add(t);
							});
						}
					}
				}
			}

			const data = {
				categories: [...categories].sort(),
				areas: [...areas].sort(),
				years: [...years].sort().reverse(),
				actors: [...actors].slice(0, 100).sort()
			};

			await setCache(request, env, cacheKey, data, 3600, true);
			return json(data, 200, strongCacheHeaders(3600));
		}

		if (path === '/api/cross') {
			const area = url.searchParams.get('area') || '';
			const year = url.searchParams.get('year') || '';
			const category = url.searchParams.get('category') || '';
			const actor = url.searchParams.get('actor') || '';
			const director = url.searchParams.get('director') || '';
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = Math.min(parseInt(url.searchParams.get('limit') || '24'), 48);

			if (!area && !year && !category && !actor && !director) {
				return json({ success: false, message: '至少选择一个筛选条件' }, 400);
			}

			const cacheKey = safeCacheKey([area, year, category, actor, director, page], `cross:${CACHE_VERSION}`);
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json(cached, 200, strongCacheHeaders(1800));

			const shards = getShards(env);
			const conditions: string[] = ['status = 1'];
			const bindings: any[] = [];

			if (area) { conditions.push('vod_area = ?'); bindings.push(area); }
			if (year) { conditions.push('vod_year = ?'); bindings.push(year); }
			if (category) { conditions.push('category = ?'); bindings.push(category); }
			// 安全修复：转义 LIKE 通配符，防止 SQL 注入
			if (actor) { const ea = actor.replace(/[%_\\]/g, '\\$&'); conditions.push('vod_actor LIKE ?'); bindings.push(`%${ea}%`); }
			if (director) { const ed = director.replace(/[%_\\]/g, '\\$&'); conditions.push('vod_director LIKE ?'); bindings.push(`%${ed}%`); }

			const where = conditions.join(' AND ');
			const sql = `SELECT ${VIDEO_COLS} FROM videos WHERE ${where} ORDER BY created_at DESC LIMIT 200`;

			const results = await Promise.all(shards.map(db => db.prepare(sql).bind(...bindings).all()));
			const allVideos: any[] = [];
			for (const r of results) if (r.results) allVideos.push(...r.results);

			const unique = Array.from(new Map(allVideos.map(v => [v.vod_id, v])).values());
			const total = unique.length;
			const totalPages = Math.ceil(total / limit);
			const offset = (page - 1) * limit;
			const paged = unique.slice(offset, offset + limit);

			const data = {
				success: true,
				data: {
					videos: paged,
					filters: { area, year, category, actor, director },
					pagination: { page, limit, total, totalPages }
				}
			};

			await setCache(request, env, cacheKey, data, 1800, false);
			return json(data, 200, strongCacheHeaders(1800));
		}

		if (path === '/api/cross/sitemap') {
			const cacheKey = `cross:sm:${CACHE_VERSION}`;
			const cached = await getCache(request, env, cacheKey);
			if (cached) return json(cached, 200, strongCacheHeaders(3600));

			const shards = getShards(env);
			const results = await Promise.all(shards.map(db => db.prepare(
				'SELECT category, vod_area, vod_year FROM videos WHERE status = 1 LIMIT 1000'
			).all()));

			const catArea = new Set<string>();
			const catYear = new Set<string>();
			const areaYear = new Set<string>();

			for (const r of results) {
				if (r.results) {
					for (const row of r.results) {
						if (row.category && row.vod_area) catArea.add(`${row.category}_${row.vod_area}`);
						if (row.category && row.vod_year) catYear.add(`${row.category}_${row.vod_year}`);
						if (row.vod_area && row.vod_year) areaYear.add(`${row.vod_area}_${row.vod_year}`);
					}
				}
			}

			const data = {
				category_x_area: [...catArea],
				category_x_year: [...catYear],
				area_x_year: [...areaYear]
			};

			await setCache(request, env, cacheKey, data, 3600, true);
			return json(data, 200, strongCacheHeaders(3600));
		}

		return json({ success: false, message: 'Not found' }, 404);
	} catch (err: any) {
		return json({ success: false, message: err.message || '服务器错误' }, 500);
	}
};