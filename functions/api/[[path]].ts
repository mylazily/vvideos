// 主 API 路由 - 视频浏览、搜索、排行、分类等
import type { Env, VideoRow } from './_lib/types';
import { getAllShards, getShard, getShardIndex, json, getEdgeCache, setEdgeCache } from './_lib/utils';
import { getBlockedDomains } from './domain-health';

// ============ 配置 ============
const CACHE_VERSION = 'v6';
const SHARD_COUNT = 10;

const CACHE_TTL = {
	home: 7200,
	video: 7200,
	related: 7200,
	list: 7200,
	search: 3600,
	rank: 7200,
	categories: 7200,
	filters: 7200,
	keywords: 3600,
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

// ============ 视频格式化 ============
const videoFormatCache = new Map<string, unknown>();
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
		vod_year: row.vod_year || '',
		vod_area: row.vod_area || '',
		vod_director: row.vod_director || '',
		vod_actor: row.vod_actor || '',
		vod_remarks: row.vod_remarks || '',
		vod_lang: row.vod_lang || '',
	};

	if (!needSources) {
		if (videoFormatCache.size < VIDEO_FORMAT_CACHE_SIZE) {
			videoFormatCache.set(cacheKey, base);
		}
		return base;
	}

	const sources: Array<{ url: string; duration: number }> = [];
	if (row.play_url) sources.push({ url: row.play_url, duration: row.duration || 0 });

	// 过滤屏蔽域名
	const blocked = await getBlockedDomainsCached(env);
	const filtered = sources.filter(s => {
		try {
			const host = new URL(s.url).hostname;
			return !blocked.includes(host);
		} catch { return true; }
	});

	const result = { ...base, play_sources: filtered.length > 0 ? filtered : sources };

	if (videoFormatCache.size < VIDEO_FORMAT_CACHE_SIZE) {
		videoFormatCache.set(cacheKey, result);
	}
	return result;
}

// ============ 批量浏览量更新 ============
const pendingViews = new Map<string, number>();
let viewsFlushTimer: ReturnType<typeof setTimeout> | null = null;

async function incrementView(env: Env, vodId: string) {
	const current = pendingViews.get(vodId) || 0;
	pendingViews.set(vodId, current + 1);

	if (!viewsFlushTimer) {
		viewsFlushTimer = setTimeout(() => {
			viewsFlushTimer = null;
			flushViews(env).catch(e => console.error('[incrementView] 定时刷新失败:', e));
		}, 30000);
	}

	if (pendingViews.size >= 50) {
		if (viewsFlushTimer) {
			clearTimeout(viewsFlushTimer);
			viewsFlushTimer = null;
		}
		flushViews(env).catch(e => console.error('[incrementView] 立即刷新失败:', e));
	}
}

async function flushViews(env: Env) {
	if (pendingViews.size === 0) return;

	const updates = Array.from(pendingViews.entries());

	const byShard = new Map<number, Array<[string, number]>>();
	for (const [vodId, count] of updates) {
		const shard = getShardIndex(vodId);
		if (!byShard.has(shard)) byShard.set(shard, []);
		byShard.get(shard)!.push([vodId, count]);
	}

	try {
		await Promise.all(
			Array.from(byShard.entries()).map(async ([shardIdx, items]) => {
				const db = getShard(env, String(shardIdx));
				for (const [vodId, count] of items) {
					try {
						await db.prepare('UPDATE videos SET views = views + ? WHERE vod_id = ?')
							.bind(count, vodId).run();
					} catch (e) {
						console.error(`[flushViews] 更新失败: ${vodId}`, e);
					}
				}
			})
		);
		for (const [vodId] of updates) {
			pendingViews.delete(vodId);
		}
	} catch (e) {
		console.error('[flushViews] 批量写入失败:', e);
	}
}

// ============ 请求去重 ============
const inflightRequests = new Map<string, Promise<unknown>>();

function dedupeRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
	if (inflightRequests.has(key)) {
		return inflightRequests.get(key) as Promise<T>;
	}
	const promise = fn().finally(() => {
		inflightRequests.delete(key);
	});
	inflightRequests.set(key, promise);
	return promise;
}

// ============ 边缘缓存 ============
async function getApiCache(request: Request): Promise<unknown | null> {
	try {
		const cache = await caches.open(`api-${CACHE_VERSION}`);
		const cached = await cache.match(request);
		if (cached) return await cached.json();
	} catch {}
	return null;
}

async function setApiCache(request: Request, data: unknown, ttl: number): Promise<void> {
	try {
		const cache = await caches.open(`api-${CACHE_VERSION}`);
		const response = new Response(JSON.stringify(data), {
			headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` }
		});
		await cache.put(request, response);
	} catch {}
}

// ============ 主路由 ============
export const onRequest: PagesFunction<Env> = async (context) => {
	const { request, env } = context;
	const url = new URL(request.url);
	const path = url.pathname;

	if (request.method === 'OPTIONS') {
		return new Response(null, {
			headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
		});
	}

	// ===== 1. 首页数据 =====
	if (path === '/api/home') {
		const cacheKey = `home-${Math.floor(Date.now() / 7200000)}`;
		return dedupeRequest(cacheKey, async () => {
			const cached = await getApiCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.home);

			const shards = getAllShards(env);
			const shardResults = await Promise.all(
				shards.map(db =>
					db.prepare(
						'SELECT id, vod_id, title, cover, category, views, vod_year, vod_remarks FROM videos WHERE status = 1 ORDER BY created_at DESC LIMIT 10'
					).all().then(r => (r.results as VideoRow[]) || [])
				)
			);

			const seen = new Set<string>();
			const allVideos = shardResults.flat().filter(v => {
				if (seen.has(v.vod_id)) return false;
				seen.add(v.vod_id);
				return true;
			});

			const latest = allVideos.sort((a, b) => b.created_at - a.created_at).slice(0, 24);
			const hot = allVideos.sort((a, b) => b.views - a.views).slice(0, 12);

			const data = { success: true, data: { latest, hot } };
			await setApiCache(request, data, CACHE_TTL.home);
			return json(data, 200, CACHE_TTL.home);
		});
	}

	// ===== 2. 视频详情 =====
	const videoMatch = path.match(/^\/api\/video\/([^\/]+)$/);
	if (videoMatch) {
		const vodId = videoMatch[1];
		const cacheKey = `video-${vodId}`;

		return dedupeRequest(cacheKey, async () => {
			const cached = await getApiCache(request);
			if (cached) {
				context.waitUntil(incrementView(env, vodId));
				return json(cached, 200, CACHE_TTL.video);
			}

			const db = getShard(env, vodId);
			const rowResult = await db.prepare(
				'SELECT id, vod_id, source_id, title, cover, category, views, created_at, vod_year, vod_area, vod_director, vod_actor, vod_remarks, vod_lang, play_url, duration FROM videos WHERE vod_id = ? AND status = 1'
			).bind(vodId).first();
			const row = rowResult as VideoRow | null;

			if (!row) return json({ success: false, message: '视频不存在' }, 404);

			let sourceInfo = null;
			if (row.source_id) {
				const sourceResult = await env.DB_0.prepare(
					'SELECT id, name, alias, COALESCE(alias, name) as display_name FROM sources WHERE id = ?'
				).bind(row.source_id).first();
				sourceInfo = sourceResult as { id: number; name: string; alias: string; display_name: string } | null;
			}

			const video = await formatVideo(row, env, true);
			const data = { success: true, data: { ...video, source: sourceInfo } };
			await setApiCache(request, data, CACHE_TTL.video);

			context.waitUntil(incrementView(env, vodId));
			return json(data, 200, CACHE_TTL.video);
		});
	}

	// ===== 3. 相关视频 - 从所有分片查找 =====
	const relatedMatch = path.match(/^\/api\/video\/([^\/]+)\/related$/);
	if (relatedMatch) {
		const vodId = relatedMatch[1];
		const cacheKey = `related-${vodId}`;

		return dedupeRequest(cacheKey, async () => {
			const cached = await getApiCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.related);

			// 先查目标视频获取分类
			const db = getShard(env, vodId);
			const videoResult = await db.prepare('SELECT category, vod_area FROM videos WHERE vod_id = ?')
				.bind(vodId).first();
			const video = videoResult as { category: string; vod_area: string } | null;

			if (!video) return json({ success: true, data: [] }, 200, CACHE_TTL.related);

			// 从所有分片查找同分类视频
			const shards = getAllShards(env);
			const results = await Promise.all(
				shards.map(shardDb =>
					shardDb.prepare(
						'SELECT id, vod_id, title, cover, category, views, vod_year FROM videos WHERE category = ? AND vod_id != ? AND status = 1 ORDER BY RANDOM() LIMIT 3'
					).bind(video.category, vodId).all().then(r => (r.results as VideoRow[]) || [])
				)
			);

			// 合并去重
			const seen = new Set<string>();
			const related = results.flat().filter(v => {
				if (seen.has(v.vod_id)) return false;
				seen.add(v.vod_id);
				return true;
			}).slice(0, 12);

			const data = { success: true, data: related };
			await setApiCache(request, data, CACHE_TTL.related);
			return json(data, 200, CACHE_TTL.related);
		});
	}

	// ===== 4. 视频列表 =====
	if (path === '/api/videos') {
		const category = url.searchParams.get('category') || '';
		const sourceId = url.searchParams.get('source_id') || '';
		const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
		const cacheKey = `videos-${category}-${sourceId}-${page}`;

		return dedupeRequest(cacheKey, async () => {
			const cached = await getApiCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.list);

			const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '24')), 50);
			const offset = (page - 1) * limit;
			const shards = getAllShards(env);

			const shardResults = await Promise.all(
				shards.map(db => {
					let where = 'WHERE status = 1';
					const queryParams: unknown[] = [];
					if (category && category !== '全部') {
						where += ' AND category = ?';
						queryParams.push(category);
					}
					if (sourceId) {
						where += ' AND source_id = ?';
						queryParams.push(parseInt(sourceId));
					}

					const listQuery = `SELECT id, vod_id, title, cover, category, views, vod_year, vod_remarks, created_at FROM videos ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
					const countQuery = `SELECT COUNT(*) as count FROM videos ${where}`;

					return Promise.all([
						db.prepare(listQuery).bind(...queryParams, limit + offset, 0).all().then(r => (r.results as VideoRow[]) || []),
						db.prepare(countQuery).bind(...queryParams).first().then(r => (r as { count: number } | null)?.count || 0)
					]);
				})
			);

			const allVideos = shardResults.flatMap(r => r[0]);
			const totalCount = shardResults.reduce((sum, r) => sum + r[1], 0);

			const seen = new Set<string>();
			const uniqueVideos = allVideos
				.filter(v => {
					if (seen.has(v.vod_id)) return false;
					seen.add(v.vod_id);
					return true;
				})
				.sort((a, b) => b.created_at - a.created_at);

			const listResult = uniqueVideos.slice(offset, offset + limit);
			const total = uniqueVideos.length; // 去重后的实际总数

			const data = {
				success: true,
				data: {
					videos: listResult,
					total,
					page,
					limit,
					totalPages: Math.ceil(total / limit)
				}
			};
			await setApiCache(request, data, CACHE_TTL.list);
			return json(data, 200, CACHE_TTL.list);
		});
	}

	// ===== 5. 搜索 - 从所有10个分片搜索 =====
	if (path === '/api/search') {
		const q = url.searchParams.get('q') || '';
		if (!q) return json({ success: true, data: { videos: [], total: 0 } }, 200, 60);

		const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
		const cacheKey = `search-${q}-${page}`;

		return dedupeRequest(cacheKey, async () => {
			const cached = await getApiCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.search);

			const limit = 20;
			const shards = getAllShards(env);
			const pattern = `%${q}%`;

			// 从所有10个分片搜索
			const results = await Promise.all(
				shards.map(db =>
					db.prepare('SELECT id, vod_id, title, cover, category, views, vod_year FROM videos WHERE title LIKE ? AND status = 1 LIMIT 30')
						.bind(pattern).all().then(r => (r.results as VideoRow[]) || [])
				)
			);

			// 合并去重
			const seen = new Set<string>();
			const all = results.flat().filter(v => {
				if (seen.has(v.vod_id)) return false;
				seen.add(v.vod_id);
				return true;
			});

			const total = all.length;
			const videos = all.slice((page - 1) * limit, page * limit);

			const data = { success: true, data: { videos, total, page, limit, totalPages: Math.ceil(total / limit) } };
			await setApiCache(request, data, CACHE_TTL.search);
			return json(data, 200, CACHE_TTL.search);
		});
	}

	// ===== 6. 排行榜 - 从所有10个分片聚合 =====
	if (path === '/api/rank') {
		const category = url.searchParams.get('category') || '';
		const cacheKey = `rank-${category}`;

		return dedupeRequest(cacheKey, async () => {
			const cached = await getApiCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.rank);

			const shards = getAllShards(env);

			const results = await Promise.all(
				shards.map(db => {
					if (category && category !== '全部') {
						return db.prepare(
							'SELECT id, vod_id, title, cover, category, views, vod_year FROM videos WHERE status = 1 AND category = ? ORDER BY views DESC LIMIT 20'
						).bind(category).all().then(r => (r.results as VideoRow[]) || []);
					}
					return db.prepare(
						'SELECT id, vod_id, title, cover, category, views, vod_year FROM videos WHERE status = 1 ORDER BY views DESC LIMIT 20'
					).all().then(r => (r.results as VideoRow[]) || []);
				})
			);

			// 合并去重并按播放量排序
			const seen = new Set<string>();
			const allVideos = results.flat().filter(v => {
				if (seen.has(v.vod_id)) return false;
				seen.add(v.vod_id);
				return true;
			}).sort((a, b) => b.views - a.views).slice(0, 50);

			const data = { success: true, data: { videos: allVideos } };
			await setApiCache(request, data, CACHE_TTL.rank);
			return json(data, 200, CACHE_TTL.rank);
		});
	}

	// ===== 7. 分类 =====
	if (path === '/api/categories') {
		return dedupeRequest('categories', async () => {
			const cached = await getApiCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.categories);

			const sourcesResult = await env.DB_0.prepare(
				'SELECT id, name, alias, COALESCE(alias, name) as display_name FROM sources WHERE status = 1 ORDER BY name'
			).all();
			const sources = (sourcesResult.results as { id: number; name: string; alias: string; display_name: string }[]) || [];

			const sourceCategories = await Promise.all(
				sources.map(async (source) => {
					const shards = getAllShards(env);
					const categoryResults = await Promise.all(
						shards.map(db =>
							db.prepare('SELECT DISTINCT category FROM videos WHERE source_id = ? AND status = 1 AND category != ""')
								.bind(source.id).all()
								.then(r => ((r.results as { category: string }[]) || []).map(row => row.category))
						)
					);
					const categories = [...new Set(categoryResults.flat())].sort();
					return { ...source, categories };
				})
			);

			const allCategories = [...new Set(sourceCategories.flatMap(s => s.categories))].sort();

			const data = {
				success: true,
				data: allCategories,
				sources: sourceCategories.filter(s => s.categories.length > 0)
			};
			await setApiCache(request, data, CACHE_TTL.categories);
			return json(data, 200, CACHE_TTL.categories);
		});
	}

	// ===== 8. 筛选条件 =====
	if (path === '/api/filters') {
		return dedupeRequest('filters', async () => {
			const cached = await getApiCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.filters);

			const shards = getAllShards(env);

			// 从所有分片获取年份
			const yearResults = await Promise.all(
				shards.map(db =>
					db.prepare('SELECT DISTINCT vod_year FROM videos WHERE status = 1 AND vod_year != "" ORDER BY vod_year DESC LIMIT 10')
						.all().then(r => ((r.results as { vod_year: string }[]) || []).map(row => row.vod_year))
				)
			);
			const years = [...new Set(yearResults.flat())].sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 30);

			// 从所有分片获取地区
			const areaResults = await Promise.all(
				shards.map(db =>
					db.prepare('SELECT DISTINCT vod_area FROM videos WHERE status = 1 AND vod_area != "" ORDER BY vod_area LIMIT 10')
						.all().then(r => ((r.results as { vod_area: string }[]) || []).map(row => row.vod_area))
				)
			);
			const areas = [...new Set(areaResults.flat())].slice(0, 50);

			// 从所有分片获取演员
			const actorResults = await Promise.all(
				shards.map(db =>
					db.prepare('SELECT vod_actor FROM videos WHERE status = 1 AND vod_actor != "" LIMIT 100')
						.all().then(r => ((r.results as { vod_actor: string }[]) || []).map(row => row.vod_actor))
				)
			);
			const actorCount = new Map<string, number>();
			actorResults.flat().forEach(actorStr => {
				if (!actorStr) return;
				const actors = actorStr.split(/[,，、/\s]+/).filter(a => a && a.length >= 2 && a.length <= 8);
				actors.forEach(actor => {
					actorCount.set(actor, (actorCount.get(actor) || 0) + 1);
				});
			});
			const actors = [...actorCount.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 30)
				.map(([name]) => name);

			// 从所有分片获取分类（禁止硬编码）
			const categoryResults = await Promise.all(
				shards.map(db =>
					db.prepare('SELECT DISTINCT category FROM videos WHERE status = 1 AND category != "" ORDER BY category LIMIT 20')
						.all().then(r => ((r.results as { category: string }[]) || []).map(row => row.category))
				)
			);
			const categories = [...new Set(categoryResults.flat())].slice(0, 50);

			const data = { success: true, data: { years, areas, actors, categories } };
			await setApiCache(request, data, CACHE_TTL.filters);
			return json(data, 200, CACHE_TTL.filters);
		});
	}

	// ===== 9. 热门关键词 =====
	if (path === '/api/keywords') {
		return dedupeRequest('keywords', async () => {
			const cached = await getApiCache(request);
			if (cached) return json(cached, 200, CACHE_TTL.keywords);

			const hotKeywordsStr = await env.CACHE.get('hot_keywords');
			if (hotKeywordsStr) {
				const keywords = hotKeywordsStr.split(/[,，]/).map(k => k.trim()).filter(k => k);
				if (keywords.length > 0) {
					const data = { success: true, data: keywords.slice(0, 20) };
					await setApiCache(request, data, CACHE_TTL.keywords);
					return json(data, 200, CACHE_TTL.keywords);
				}
			}

			const keywordsResult = await env.DB_0.prepare('SELECT DISTINCT title FROM videos WHERE status = 1 AND views > 1000 ORDER BY RANDOM() LIMIT 20').all();
			const keywords = ((keywordsResult.results as { title: string }[]) || []).map(r => r.title.slice(0, 6));

			const data = { success: true, data: keywords };
			await setApiCache(request, data, CACHE_TTL.keywords);
			return json(data, 200, CACHE_TTL.keywords);
		});
	}

	// ===== 10. 健康检查 =====
	if (path === '/api/health') {
		return json({ success: true, version: CACHE_VERSION, timestamp: Date.now() });
	}

	return json({ success: false, message: 'Not Found' }, 404);
};
