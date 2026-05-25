export interface Env {
	DB_0: D1Database; DB_1: D1Database; DB_2: D1Database; DB_3: D1Database; DB_4: D1Database;
	DB_5: D1Database; DB_6: D1Database; DB_7: D1Database; DB_8: D1Database; DB_9: D1Database;
	CACHE: KVNamespace;
	ADMIN_PASSWORD: string;
	VIDEOS_KV: KVNamespace;
	ASSETS: Fetcher;
}

import { getBlockedDomains } from './domain-health';

// ============ 高性能优化配置 ============
const CACHE_VERSION = 'v5';
const SHARD_COUNT = 10;

// 缓存时间配置（秒）- 统一10分钟，保证数据新鲜度
const CACHE_TTL = {
	home: 600,
	video: 600,
	related: 600,
	list: 600,
	search: 600,
	rank: 600,
	categories: 600,
	filters: 600,
	keywords: 600,
};

// 屏蔽域名缓存
let blockedDomainsCache: string[] = [];
let blockedDomainsCacheTime = 0;
const BLOCKED_DOMAINS_TTL = 5 * 60 * 1000;

async function getBlockedDomainsCached(env: Env): Promise<string[]> {
	const now = Date.now();
	if (now - blockedDomainsCacheTime < BLOCKED_DOMAINS_TTL && blockedDomainsCache.length > 0) {
		return blockedDomainsCache;
	}
	try {
		blockedDomainsCache = await getBlockedDomains(env);
		blockedDomainsCacheTime = now;
	} catch {
		// 保持旧缓存
	}
	return blockedDomainsCache;
}

// ============ 定向分片算法（与 collect.ts 保持一致的 FNV-1a） ============
function getShardIndex(vodId: string): number {
	let hash = 2166136261;
	for (let i = 0; i < vodId.length; i++) {
		hash ^= vodId.charCodeAt(i);
		hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
	}
	const hashNum = parseInt((hash >>> 0).toString(16).padStart(8, '0').slice(0, 8), 16);
	return hashNum % SHARD_COUNT;
}

function getShard(env: Env, index: number): D1Database {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9][index];
}

function getAllShards(env: Env): D1Database[] {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

// ============ 数据结构 ============
interface VideoRow {
	id: number;
	vod_id: string;
	title: string;
	cover: string;
	category: string;
	views: number;
	created_at: number;
	vod_year: string;
	vod_area: string;
	vod_director: string;
	vod_actor: string;
	vod_remarks: string;
	vod_lang: string;
	play_url_1: string; play_url_2: string; play_url_3: string; play_url_4: string; play_url_5: string;
	duration_1: number; duration_2: number; duration_3: number; duration_4: number; duration_5: number;
	ad_segments: string;
}

// ============ 响应工具 ============
function json(data: any, status = 200, cacheSeconds = 0) {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*',
	};
	if (cacheSeconds > 0) {
		headers['Cache-Control'] = `public, max-age=${cacheSeconds}`;
		headers['CDN-Cache-Control'] = `public, max-age=${cacheSeconds}`;
		headers['Cloudflare-CDN-Cache-Control'] = `public, max-age=${cacheSeconds}`;
	}
	return new Response(JSON.stringify(data), { status, headers });
}

function redirect(url: string, status = 302) {
	return new Response(null, { status, headers: { Location: url } });
}

// ============ 边缘缓存系统（零KV读取） ============
async function getEdgeCache(request: Request): Promise<any | null> {
	try {
		const cache = await caches.open(`api-${CACHE_VERSION}`);
		const cached = await cache.match(request);
		if (cached) return await cached.json();
	} catch {}
	return null;
}

async function setEdgeCache(request: Request, data: any, ttl: number): Promise<void> {
	try {
		const cache = await caches.open(`api-${CACHE_VERSION}`);
		const response = new Response(JSON.stringify(data), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': `public, max-age=${ttl}`,
			}
		});
		await cache.put(request, response);
	} catch {}
}

// ============ 视频格式化（带缓存） ============
const videoFormatCache = new Map<string, any>();
const VIDEO_FORMAT_CACHE_SIZE = 1000;

async function formatVideo(row: VideoRow, env: Env, needSources = false) {
	const cacheKey = `${row.vod_id}-${needSources}`;
	const cached = videoFormatCache.get(cacheKey);
	if (cached) return cached;

	const base = {
		id: row.id,
		vod_id: row.vod_id,
		title: row.title,
		cover: row.cover,
		category: row.category,
		views: row.views,
		created_at: row.created_at,
		vod_year: row.vod_year,
		vod_area: row.vod_area,
		vod_director: row.vod_director,
		vod_actor: row.vod_actor,
		vod_remarks: row.vod_remarks,
		vod_lang: row.vod_lang,
	};

	if (!needSources) {
		if (videoFormatCache.size < VIDEO_FORMAT_CACHE_SIZE) {
			videoFormatCache.set(cacheKey, base);
		}
		return base;
	}

	const sources = [];
	if (row.play_url_1) sources.push({ url: row.play_url_1, duration: row.duration_1 });
	if (row.play_url_2) sources.push({ url: row.play_url_2, duration: row.duration_2 });
	if (row.play_url_3) sources.push({ url: row.play_url_3, duration: row.duration_3 });
	if (row.play_url_4) sources.push({ url: row.play_url_4, duration: row.duration_4 });
	if (row.play_url_5) sources.push({ url: row.play_url_5, duration: row.duration_5 });

	// 过滤屏蔽域名
	const blocked = await getBlockedDomainsCached(env);
	const filtered = sources.filter(s => {
		try {
			const host = new URL(s.url).hostname;
			return !blocked.includes(host);
		} catch { return true; }
	});

	let adSegments = [];
	try { if (row.ad_segments) adSegments = JSON.parse(row.ad_segments); } catch {}

	const result = { ...base, play_sources: filtered.length > 0 ? filtered : sources, ad_segments: adSegments };
	
	if (videoFormatCache.size < VIDEO_FORMAT_CACHE_SIZE) {
		videoFormatCache.set(cacheKey, result);
	}
	return result;
}

// ============ 批量浏览量更新（异步，不阻塞响应） ============
const pendingViews: Map<string, number> = new Map();
let viewsFlushTimer: ReturnType<typeof setTimeout> | null = null;

async function incrementView(env: Env, vodId: string) {
	const current = pendingViews.get(vodId) || 0;
	pendingViews.set(vodId, current + 1);
	
	// 设置批量写入定时器
	if (!viewsFlushTimer) {
		viewsFlushTimer = setTimeout(() => {
			viewsFlushTimer = null;
			flushViews(env);
		}, 30000); // 30秒批量写入
	}
	
	// 达到50个立即写入
	if (pendingViews.size >= 50) {
		if (viewsFlushTimer) {
			clearTimeout(viewsFlushTimer);
			viewsFlushTimer = null;
		}
		flushViews(env);
	}
}

async function flushViews(env: Env) {
	if (pendingViews.size === 0) return;
	
	const updates = Array.from(pendingViews.entries());
	pendingViews.clear();
	
	// 按分片分组
	const byShard: Map<number, Array<[string, number]>> = new Map();
	for (const [vodId, count] of updates) {
		const shard = getShardIndex(vodId);
		if (!byShard.has(shard)) byShard.set(shard, []);
		byShard.get(shard)!.push([vodId, count]);
	}
	
	// 并行写入各分片
	await Promise.all(
		Array.from(byShard.entries()).map(async ([shardIdx, items]) => {
			const db = getShard(env, shardIdx);
			// 批量更新，减少查询次数
			for (const [vodId, count] of items) {
				try {
					await db.prepare('UPDATE videos SET views = views + ? WHERE vod_id = ?')
						.bind(count, vodId)
						.run();
				} catch {}
			}
		})
	);
}

// ============ 请求去重系统 ============
const inflightRequests = new Map<string, Promise<any>>();

async function dedupeRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
	if (inflightRequests.has(key)) {
		return inflightRequests.get(key) as Promise<T>;
	}
	
	const promise = fn().finally(() => {
		inflightRequests.delete(key);
	});
	
	inflightRequests.set(key, promise);
	return promise;
}

// ============ 主处理函数 ============
export const onRequest: PagesFunction<Env> = async (context) => {
	const { request, env, next } = context;
	const url = new URL(request.url);
	const path = url.pathname;

	if (request.method === 'OPTIONS') {
		return new Response(null, {
			headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
		});
	}

	// ===== API路由处理 =====
	
	// 1. 首页数据 - 每10分钟轮换分片，边缘缓存10分钟
	if (path === '/api/home') {
		const cacheKey = `home-${Math.floor(Date.now() / 600000)}`; // 每10分钟一个key
		return dedupeRequest(cacheKey, async () => {
			const cached = await getEdgeCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.home);
			
			const shards = getAllShards(env);
			// 每10分钟从10个分片中轮换选1个，取24条最新视频
			const shardIndex = Math.floor(Date.now() / 600000) % shards.length;
			const db = shards[shardIndex];
			
			const results = await db.prepare(
				'SELECT id, vod_id, title, cover, category, views, vod_year, vod_remarks FROM videos WHERE status = 1 ORDER BY created_at DESC LIMIT 24'
			).all<{ results: any[] }>().then(r => r.results);
			
			const latest = results.slice(0, 24);
			const hot = results.sort((a, b) => b.views - a.views).slice(0, 12);
			
			const data = { success: true, data: { latest, hot } };
			await setEdgeCache(request, data, CACHE_TTL.home);
			return json(data, 200, CACHE_TTL.home);
		});
	}

	// 2. 视频详情 - 定向分片查询（只查1个分片）
	const videoMatch = path.match(/^\/api\/video\/([^\/]+)$/);
	if (videoMatch) {
		const vodId = videoMatch[1];
		const cacheKey = `video-${vodId}`;
		
		return dedupeRequest(cacheKey, async () => {
			const cached = await getEdgeCache(request);
			if (cached) {
				// 异步增加浏览量，不阻塞响应
				context.waitUntil(incrementView(env, vodId));
				return json(cached, 200, CACHE_TTL.video);
			}
			
			// 定向查询：只查1个分片
			const shardIdx = getShardIndex(vodId);
			const db = getShard(env, shardIdx);
			const row = await db.prepare(
				'SELECT id, vod_id, title, cover, category, views, created_at, vod_year, vod_area, vod_director, vod_actor, vod_remarks, vod_lang, play_url_1, play_url_2, play_url_3, play_url_4, play_url_5, duration_1, duration_2, duration_3, duration_4, duration_5, ad_segments FROM videos WHERE vod_id = ? AND status = 1'
			).bind(vodId).first<VideoRow>();
			
			if (!row) return json({ success: false, message: '视频不存在' }, 404);
			
			const video = await formatVideo(row, env, true);
			const data = { success: true, data: video };
			await setEdgeCache(request, data, CACHE_TTL.video);
			
			// 异步增加浏览量
			context.waitUntil(incrementView(env, vodId));
			return json(data, 200, CACHE_TTL.video);
		});
	}

	// 3. 相关视频 - 定向分片查询
	const relatedMatch = path.match(/^\/api\/video\/([^\/]+)\/related$/);
	if (relatedMatch) {
		const vodId = relatedMatch[1];
		const cacheKey = `related-${vodId}`;
		
		return dedupeRequest(cacheKey, async () => {
			const cached = await getEdgeCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.related);
			
			// 先查目标视频获取分类
			const shardIdx = getShardIndex(vodId);
			const db = getShard(env, shardIdx);
			const video = await db.prepare('SELECT category, vod_area FROM videos WHERE vod_id = ?')
				.bind(vodId).first<{ category: string; vod_area: string }>();
			
			if (!video) return json({ success: true, data: [] }, 200, CACHE_TTL.related);
			
			// 同分类随机视频（只查1个分片）
			const results = await db.prepare(
				'SELECT id, vod_id, title, cover, category, views, vod_year FROM videos WHERE category = ? AND vod_id != ? AND status = 1 ORDER BY RANDOM() LIMIT 6'
			).bind(video.category, vodId).all<{ results: any[] }>().then(r => r.results);
			
			const data = { success: true, data: results };
			await setEdgeCache(request, data, CACHE_TTL.related);
			return json(data, 200, CACHE_TTL.related);
		});
	}

	// 4. 视频列表 - 边缘缓存
	if (path === '/api/videos') {
		const category = url.searchParams.get('category') || '';
		const page = parseInt(url.searchParams.get('page') || '1');
		const cacheKey = `videos-${category}-${page}`;

		return dedupeRequest(cacheKey, async () => {
			const cached = await getEdgeCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.list);

			const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
			const offset = (page - 1) * limit;

			// 只查1个分片获取数据（减少负载）
			const db = env.DB_0;

			let where = 'WHERE status = 1';
			let queryParams: any[] = [];
			if (category && category !== '全部') {
				where += ' AND category = ?';
				queryParams.push(category);
			}

			const listQuery = `SELECT id, vod_id, title, cover, category, views, vod_year, vod_remarks FROM videos ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
			const countQuery = `SELECT COUNT(*) as count FROM videos ${where}`;

			const [listResult, countResult] = await Promise.all([
				db.prepare(listQuery).bind(...queryParams).all<{ results: any[] }>().then(r => r.results),
				db.prepare(countQuery).bind(...queryParams).first<{ count: number }>().then(r => r?.count || 0)
			]);

			const total = countResult * SHARD_COUNT; // 估算总数

			const data = { success: true, data: { videos: listResult, total, page, limit, totalPages: Math.ceil(total / limit) } };
			await setEdgeCache(request, data, CACHE_TTL.list);

			return json(data, 200, CACHE_TTL.list);
		});
	}

	// 5. 搜索 - 短缓存
	if (path === '/api/search') {
		const q = url.searchParams.get('q') || '';
		if (!q) return json({ success: true, data: { videos: [], total: 0 } }, 200, 60);
		
		const page = parseInt(url.searchParams.get('page') || '1');
		const cacheKey = `search-${q}-${page}`;
		
		return dedupeRequest(cacheKey, async () => {
			const cached = await getEdgeCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.search);
			
			const limit = 20;
			
			// 只查2个分片
			const shards = getAllShards(env);
			const searchShards = [shards[0], shards[5]];
			const pattern = `%${q}%`;
			
			const results = await Promise.all(
				searchShards.map(db => 
					db.prepare('SELECT id, vod_id, title, cover, category, views, vod_year FROM videos WHERE title LIKE ? AND status = 1 LIMIT 60')
						.bind(pattern).all<{ results: any[] }>().then(r => r.results)
				)
			);
			
			const all = results.flat();
			const total = all.length;
			const videos = all.slice((page - 1) * limit, page * limit);
			
			const data = { success: true, data: { videos, total, page, limit, totalPages: Math.ceil(total / limit) } };
			await setEdgeCache(request, data, CACHE_TTL.search);
			return json(data, 200, CACHE_TTL.search);
		});
	}

	// 6. 排行 - 长缓存
	if (path === '/api/rank') {
		return dedupeRequest('rank', async () => {
			const cached = await getEdgeCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.rank);
			
			// 只查1个分片
			const db = env.DB_0;
			
			const results = await db.prepare(
				'SELECT id, vod_id, title, cover, category, views, vod_year FROM videos WHERE status = 1 ORDER BY views DESC LIMIT 50'
			).all<{ results: any[] }>().then(r => r.results);
			
			const data = { success: true, data: { videos: results } };
			await setEdgeCache(request, data, CACHE_TTL.rank);
			return json(data, 200, CACHE_TTL.rank);
		});
	}

	// 7. 分类 - 超长缓存
	if (path === '/api/categories') {
		return dedupeRequest('categories', async () => {
			const cached = await getEdgeCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.categories);
			
			// 只查1个分片
			const categories = await env.DB_0.prepare('SELECT DISTINCT category FROM videos WHERE status = 1 AND category != "" ORDER BY category')
				.all<{ results: { category: string }[] }>().then(r => r.results.map(r => r.category));
			
			const data = { success: true, data: categories };
			await setEdgeCache(request, data, CACHE_TTL.categories);
			return json(data, 200, CACHE_TTL.categories);
		});
	}

	// 8. 筛选条件 - 超长缓存
	if (path === '/api/filters') {
		return dedupeRequest('filters', async () => {
			const cached = await getEdgeCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.filters);
			
			// 只查1个分片
			const [years, areas] = await Promise.all([
				env.DB_0.prepare('SELECT DISTINCT vod_year FROM videos WHERE status = 1 AND vod_year != "" ORDER BY vod_year DESC LIMIT 30')
					.all<{ results: { vod_year: string }[] }>().then(r => r.results.map(r => r.vod_year)),
				env.DB_0.prepare('SELECT DISTINCT vod_area FROM videos WHERE status = 1 AND vod_area != "" ORDER BY vod_area LIMIT 50')
					.all<{ results: { vod_area: string }[] }>().then(r => r.results.map(r => r.vod_area))
			]);
			
			const data = { success: true, data: { years, areas } };
			await setEdgeCache(request, data, CACHE_TTL.filters);
			return json(data, 200, CACHE_TTL.filters);
		});
	}

	// 9. 热门关键词 - 短缓存
	if (path === '/api/keywords') {
		return dedupeRequest('keywords', async () => {
			const cached = await getEdgeCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.keywords);
			
			// 只查1个分片，随机采样
			const keywords = await env.DB_0.prepare('SELECT DISTINCT title FROM videos WHERE status = 1 AND views > 1000 ORDER BY RANDOM() LIMIT 20')
				.all<{ results: { title: string }[] }>().then(r => r.results.map(r => r.title.slice(0, 6)));
			
			const data = { success: true, data: keywords };
			await setEdgeCache(request, data, CACHE_TTL.keywords);
			return json(data, 200, CACHE_TTL.keywords);
		});
	}

	// 10. 健康检查
	if (path === '/api/health') {
		return json({ success: true, version: CACHE_VERSION, timestamp: Date.now() });
	}

	// 默认404
	return json({ success: false, message: 'Not Found' }, 404);
};
