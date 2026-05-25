// 采集API - V2架构：资源站独立，无跨源去重
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

interface VideoData {
	vod_id?: string;
	vod_name: string;
	type_name: string;
	vod_pic: string;
	vod_year?: string;
	vod_area?: string;
	vod_actor?: string;
	vod_director?: string;
	vod_play_url: string;
	vod_remarks?: string;
	vod_lang?: string;
	vod_time?: number;
	duration?: number;
}

interface CollectOptions {
	sourceUrl: string;
	sourceId: number;
	env: Env;
	mode: 'full' | 'single' | 'today' | 'week' | 'month';
	pages?: number;
	signal?: AbortSignal;
	categories?: string[];
	hours?: number;
}

interface CollectResult {
	total: number;
	new: number;
	updated: number;
	fail: number;
	pagesCollected: number;
	totalPages: number;
	categories: Record<string, number>;
}

// ============ 工具函数 ============

function getShard(vodId: string, env: Env): D1Database {
	const num = parseInt(vodId, 10);
	const idx = isNaN(num) ? 0 : (num % 10);
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9][idx];
}

async function generateVodId(env: Env): Promise<string> {
	const counterKey = 'vod_id_counter';
	let counter = parseInt(await env.CACHE.get(counterKey) || '0');
	counter++;
	await env.CACHE.put(counterKey, counter.toString());
	return counter.toString();
}

function normalizeCategory(cat: string): string {
	if (!cat) return '其他';
	const map: Record<string, string> = {
		'电影': '电影', '剧情片': '电影', '动作片': '电影', '喜剧片': '电影', '爱情片': '电影',
		'科幻片': '电影', '恐怖片': '电影', '战争片': '电影', '纪录片': '纪录片',
		'电视剧': '电视剧', '国产剧': '电视剧', '港台剧': '电视剧', '日韩剧': '电视剧', '欧美剧': '电视剧',
		'综艺': '综艺', '动漫': '动漫', '动画片': '动漫'
	};
	return map[cat.trim()] || cat.trim();
}

function extractDuration(url: string): number {
	if (!url) return 0;
	try {
		const match = url.match(/\$(\d+):(\d+):(\d+)#/);
		if (match) {
			return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
		}
		const match2 = url.match(/\$(\d+):(\d+)#/);
		if (match2) {
			return parseInt(match2[1]) * 60 + parseInt(match2[2]);
		}
	} catch {}
	return 0;
}

// ============ 数据解析 ============

function parseXmlVideos(xmlText: string, sourceId: number): VideoData[] {
	const videos: VideoData[] = [];
	const videoMatches = xmlText.match(/<video>[\s\S]*?<\/video>/g);
	if (!videoMatches) return videos;

	for (const videoXml of videoMatches) {
		const getTag = (tag: string) => {
			const match = videoXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
			return match ? match[1].trim() : '';
		};

		const vodId = getTag('id') || getTag('vod_id');
		if (!vodId) continue;

		videos.push({
			vod_id: vodId,
			vod_name: getTag('name') || getTag('vod_name'),
			type_name: getTag('type') || getTag('type_name'),
			vod_pic: getTag('pic') || getTag('vod_pic'),
			vod_year: getTag('year') || getTag('vod_year'),
			vod_area: getTag('area') || getTag('vod_area'),
			vod_actor: getTag('actor') || getTag('vod_actor'),
			vod_director: getTag('director') || getTag('vod_director'),
			vod_play_url: getTag('dl') || getTag('vod_play_url'),
			vod_remarks: getTag('note') || getTag('vod_remarks'),
			vod_lang: getTag('lang') || getTag('vod_lang'),
			vod_time: parseInt(getTag('time') || getTag('vod_time') || '0') || undefined,
			duration: extractDuration(getTag('dl') || getTag('vod_play_url'))
		});
	}
	return videos;
}

function parseJsonVideos(data: any, sourceId: number): VideoData[] {
	const list = data.list || data.data || data.videos || data || [];
	const videos: VideoData[] = [];

	for (const v of list) {
		if (!v) continue;
		const playUrl = v.vod_play_url || v.play_url || v.url || v.vod_url || v.dl || '';
		videos.push({
			vod_id: v.vod_id || v.id || '',
			vod_name: v.vod_name || v.name || v.title || '',
			type_name: v.type_name || v.type || v.category || '',
			vod_pic: v.vod_pic || v.pic || v.cover || v.thumb || '',
			vod_year: v.vod_year || v.year || '',
			vod_area: v.vod_area || v.area || '',
			vod_actor: v.vod_actor || v.actor || '',
			vod_director: v.vod_director || v.director || '',
			vod_play_url: playUrl,
			vod_remarks: v.vod_remarks || v.remarks || v.note || '',
			vod_lang: v.vod_lang || v.lang || '',
			vod_time: v.vod_time || v.time || 0,
			duration: extractDuration(playUrl)
		});
	}
	return videos;
}

// ============ 数据入库 ============

async function saveVideo(video: VideoData, sourceId: number, env: Env): Promise<{ success: boolean; isNew: boolean }> {
	try {
		// 生成新的vod_id（纯数字）
		const vodId = await generateVodId(env);
		const shard = getShard(vodId, env);
		const now = Math.floor(Date.now() / 1000);
		const normalizedCat = normalizeCategory(video.type_name);

		await shard.prepare(
			`INSERT INTO videos (vod_id, source_id, title, category, cover, play_url, duration, vod_year, vod_area, vod_actor, vod_director, vod_remarks, vod_lang, status, views, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`
		).bind(
			vodId, sourceId, video.vod_name, normalizedCat, video.vod_pic,
			video.vod_play_url, video.duration || 0, video.vod_year || '',
			video.vod_area || '', video.vod_actor || '', video.vod_director || '',
			video.vod_remarks || '', video.vod_lang || '', now, now
		).run();

		return { success: true, isNew: true };
	} catch (e) {
		console.error('入库失败:', e);
		return { success: false, isNew: false };
	}
}

// ============ 核心采集函数 ============

async function collectAll(options: CollectOptions): Promise<CollectResult> {
	const { sourceUrl, sourceId, env, mode, pages, signal, categories, hours } = options;
	const result: CollectResult = { total: 0, new: 0, updated: 0, fail: 0, pagesCollected: 0, totalPages: 0, categories: {} };

	// 采集锁
	const lockKey = `collect_lock:${sourceId}`;
	const existingLock = await env.CACHE.get(lockKey);
	if (existingLock) {
		const lockAge = Math.floor(Date.now() / 1000) - parseInt(existingLock);
		if (lockAge < 3600) {
			throw new Error(`采集源 #${sourceId} 正在采集中，请稍后再试`);
		}
	}
	await env.CACHE.put(lockKey, Math.floor(Date.now() / 1000).toString(), { expirationTtl: 3600 });

	try {
		// 获取总页数
		const ac = typeof sourceUrl === 'string' && sourceUrl.includes('ac=videolist') ? '' : 'ac=videolist&';
		const testUrl = `${sourceUrl}?${ac}pg=1`;
		const testRes = await fetch(testUrl, { signal });
		const testText = await testRes.text();

		// 解析总页数
		let totalPages = 1;
		const pageMatch = testText.match(/<pagecount>(\d+)<\/pagecount>/i) ||
			testText.match(/<page>(\d+)<\/page>/i) ||
			testText.match(/"pagecount":\s*(\d+)/i) ||
			testText.match(/"total_page":\s*(\d+)/i);
		if (pageMatch) totalPages = parseInt(pageMatch[1]) || 1;

		// 确定采集页数
		let pagesToCollect: number[] = [];
		if (mode === 'single' && pages) {
			pagesToCollect = Array.from({ length: Math.min(pages, totalPages) }, (_, i) => i + 1);
		} else if (mode === 'full') {
			pagesToCollect = Array.from({ length: totalPages }, (_, i) => i + 1);
		} else if (mode === 'today') {
			pagesToCollect = [1, 2, 3];
		} else if (mode === 'week') {
			pagesToCollect = Array.from({ length: Math.min(10, totalPages) }, (_, i) => i + 1);
		} else if (mode === 'month') {
			pagesToCollect = Array.from({ length: Math.min(30, totalPages) }, (_, i) => i + 1);
		}

		result.totalPages = totalPages;

		// 倒序采集（老数据在下）
		pagesToCollect.reverse();

		// 采集每一页
		for (const page of pagesToCollect) {
			if (signal?.aborted) break;

			try {
				const pageUrl = `${sourceUrl}?${ac}pg=${page}`;
				const res = await fetch(pageUrl, { signal });
				const text = await res.text();

				let videos: VideoData[] = [];
				if (text.trim().startsWith('<')) {
					videos = parseXmlVideos(text, sourceId);
				} else {
					try {
						videos = parseJsonVideos(JSON.parse(text), sourceId);
					} catch {}
				}

				// 过滤分类
				if (categories && categories.length > 0) {
					videos = videos.filter(v => categories.some(c => v.type_name?.includes(c)));
				}

				// 过滤时间
				if (hours) {
					const threshold = Math.floor(Date.now() / 1000) - (hours * 3600);
					videos = videos.filter(v => (v.vod_time || 0) >= threshold);
				}

				// 入库
				for (const video of videos) {
					if (signal?.aborted) break;
					const r = await saveVideo(video, sourceId, env);
					if (r.success) {
						result.total++;
						if (r.isNew) result.new++;
						else result.updated++;

						const cat = normalizeCategory(video.type_name);
						result.categories[cat] = (result.categories[cat] || 0) + 1;
					} else {
						result.fail++;
					}
				}

				result.pagesCollected++;
			} catch (e) {
				console.error(`第${page}页采集失败:`, e);
			}
		}

		// 更新资源站统计
		await env.DB_0.prepare(
			'UPDATE sources SET last_collect_at = ?, total_videos = total_videos + ? WHERE id = ?'
		).bind(Math.floor(Date.now() / 1000), result.new, sourceId).run();

	} finally {
		await env.CACHE.delete(lockKey);
	}

	return result;
}

// ============ API入口 ============

export const onRequest: PagesFunction<Env> = async (context) => {
	const { request, env } = context;

	if (request.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const body = await request.json<{ sourceUrl?: string; sourceId?: number; mode?: string; pages?: number; categories?: string[]; hours?: number }>();

		if (!body.sourceUrl || !body.sourceId) {
			return new Response(JSON.stringify({ error: 'Missing sourceUrl or sourceId' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const result = await collectAll({
			sourceUrl: body.sourceUrl,
			sourceId: body.sourceId,
			env,
			mode: (body.mode as any) || 'single',
			pages: body.pages || 5,
			categories: body.categories,
			hours: body.hours
		});

		return new Response(JSON.stringify({ success: true, data: result }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (e: any) {
		return new Response(JSON.stringify({ error: e.message || '采集失败' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
