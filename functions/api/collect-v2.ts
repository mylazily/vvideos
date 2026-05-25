// V2 采集系统：资源站独立，支持域名替换和自动采集
export interface Env {
	DB_0: D1Database; DB_1: D1Database; DB_2: D1Database; DB_3: D1Database; DB_4: D1Database;
	DB_5: D1Database; DB_6: D1Database; DB_7: D1Database; DB_8: D1Database; DB_9: D1Database;
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

interface CollectResult {
	total: number;
	new: number;
	updated: number;
	fail: number;
	pagesCollected: number;
	totalPages: number;
}

interface SourceConfig {
	id: number;
	name: string;
	api_url: string;
	domain_replacements?: string;
}

// 纯数字ID生成器（使用KV原子操作）
async function generateVodId(sourceId: number, env: Env): Promise<string> {
	const key = `vod_id_counter:${sourceId}`;
	// 使用KV的乐观锁机制避免并发冲突
	const maxRetries = 3;
	for (let i = 0; i < maxRetries; i++) {
		const current = await env.CACHE.get(key) || '0';
		const next = (parseInt(current) + 1) % 10000000;
		// 尝试原子更新（如果值被修改，会失败重试）
		try {
			await env.CACHE.put(key, String(next));
			return String(next);
		} catch {
			// 重试
			await new Promise(r => setTimeout(r, 10 * (i + 1)));
		}
	}
	// 如果重试都失败，使用时间戳+随机数
	return String(Date.now() % 10000000);
}

// 分片：纯数字ID取模10
function getShard(vodId: string, env: Env): D1Database {
	const num = parseInt(vodId, 10);
	const shardIndex = isNaN(num) ? 0 : (num % 10);
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9][shardIndex];
}

// 应用域名替换
function applyDomainReplacements(playUrl: string, replacementsJson: string): string {
	if (!replacementsJson) return playUrl;
	try {
		const replacements = JSON.parse(replacementsJson);
		let result = playUrl;
		for (const [oldDomain, newDomain] of Object.entries(replacements)) {
			result = result.replace(new RegExp(oldDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newDomain as string);
		}
		return result;
	} catch {
		return playUrl;
	}
}

// 标准化分类名
function normalizeCategory(category: string): string {
	if (!category) return '其他';
	const cat = category.trim();
	
	// 电影类
	if (/动作/.test(cat)) return '动作片';
	if (/喜剧/.test(cat)) return '喜剧片';
	if (/爱情|言情|情感|浪漫/.test(cat)) return '爱情片';
	if (/科幻|Sci-Fi|SF/.test(cat)) return '科幻片';
	if (/恐怖|惊悚|悬疑/.test(cat)) return '恐怖片';
	if (/战争|军事/.test(cat)) return '战争片';
	if (/剧情/.test(cat)) return '剧情片';
	if (/纪录|记录|纪实/.test(cat)) return '纪录片';
	if (/动画|动漫/.test(cat)) return '动漫';
	
	// 电视剧类
	if (/国产|大陆/.test(cat)) return '国产剧';
	if (/香港|港/.test(cat)) return '港剧';
	if (/台湾|台/.test(cat)) return '台剧';
	if (/韩国|韩剧|韩/.test(cat)) return '韩剧';
	if (/日本|日剧|日/.test(cat)) return '日剧';
	if (/美国|美剧|美/.test(cat)) return '美剧';
	if (/英国|英剧/.test(cat)) return '英剧';
	if (/泰国|泰剧/.test(cat)) return '泰剧';
	if (/综艺|真人秀/.test(cat)) return '综艺';
	
	// 其他
	if (/电影/.test(cat)) return '电影';
	if (/电视剧|剧集/.test(cat)) return '电视剧';
	
	return cat;
}

// 提取时长（秒）
function extractDuration(url: string): number {
	if (!url) return 0;
	const match = url.match(/\$(\d+):(\d+):(\d+)#/);
	if (match) {
		return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
	}
	const match2 = url.match(/\$(\d+):(\d+)#/);
	if (match2) {
		return parseInt(match2[1]) * 60 + parseInt(match2[2]);
	}
	return 0;
}

// 保存视频（同资源站内去重，支持域名替换）
async function saveVideo(
	video: VideoData,
	sourceId: number,
	env: Env,
	domainReplacements?: string
): Promise<{ success: boolean; isNew: boolean }> {
	try {
		const normalizedCat = normalizeCategory(video.type_name);
		const now = Math.floor(Date.now() / 1000);
		
		// 应用域名替换
		const finalPlayUrl = applyDomainReplacements(video.vod_play_url, domainReplacements || '');
		
		// 检查同资源站内是否已存在（用资源站原始ID检查）
		const existingResult = await env.DB_0.prepare(
			'SELECT vod_id, play_url FROM videos WHERE source_id = ? AND vod_id = ?'
		).bind(sourceId, video.vod_id).first();
		const existingCheck = existingResult as { vod_id: string; play_url: string } | null;
		
		if (existingCheck) {
			// 更新现有视频（如果播放链接变化了）
			const vodId = existingCheck.vod_id;
			const shard = getShard(vodId, env);
			
			// 检查播放链接是否需要更新
			const needsUpdate = existingCheck.play_url !== finalPlayUrl;
			
			if (needsUpdate) {
				await shard.prepare(
					`UPDATE videos SET 
						play_url = ?, cover = ?, vod_remarks = ?, vod_actor = ?, 
						vod_director = ?, vod_year = ?, vod_area = ?, updated_at = ?
					 WHERE source_id = ? AND vod_id = ?`
				).bind(
					finalPlayUrl, video.vod_pic, video.vod_remarks || '', video.vod_actor || '',
					video.vod_director || '', video.vod_year || '', video.vod_area || '', now,
					sourceId, vodId
				).run();
			}
			return { success: true, isNew: false };
		}
		
		// 生成新ID
		const newVodId = await generateVodId(sourceId, env);
		const shard = getShard(newVodId, env);
		
		// 插入新视频
		await shard.prepare(
			`INSERT INTO videos (
				vod_id, source_id, title, category, cover, play_url, duration,
				vod_year, vod_area, vod_actor, vod_director, vod_remarks, vod_lang,
				status, views, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`
		).bind(
			newVodId, sourceId, video.vod_name, normalizedCat, video.vod_pic, finalPlayUrl,
			video.duration || 0, video.vod_year || '', video.vod_area || '', video.vod_actor || '',
			video.vod_director || '', video.vod_remarks || '', video.vod_lang || '', now, now
		).run();
		
		return { success: true, isNew: true };
	} catch (e) {
		console.error('保存视频失败:', e);
		return { success: false, isNew: false };
	}
}

// 采集单页列表
async function collectPageList(
	sourceUrl: string,
	page: number,
	signal?: AbortSignal
): Promise<{ totalPages: number; videoIds: string[] }> {
	const listUrl = sourceUrl + (sourceUrl.includes('?') ? '&' : '?') + `ac=list&pg=${page}`;
	const listRes = await fetch(listUrl, { signal: signal || AbortSignal.timeout(30000) });
	if (!listRes.ok) throw new Error(`获取列表失败(${listRes.status})`);
	const listData = await listRes.json();
	if (!listData.list || listData.list.length === 0) return { totalPages: 1, videoIds: [] };
	
	let totalPages = 1;
	if (listData.pagecount) {
		totalPages = parseInt(listData.pagecount) || 1;
	} else if (listData.total && listData.limit) {
		totalPages = Math.ceil(listData.total / listData.limit);
	}
	
	const videoIds = listData.list.map((v: any) => v.vod_id).filter(Boolean);
	return { totalPages, videoIds };
}

// 采集详情
async function collectPageDetails(
	sourceUrl: string,
	ids: string[],
	signal?: AbortSignal
): Promise<VideoData[]> {
	const idsStr = ids.join(',');
	const detailUrl = sourceUrl + (sourceUrl.includes('?') ? '&' : '?') + `ac=detail&ids=${idsStr}`;
	const detailRes = await fetch(detailUrl, { signal: signal || AbortSignal.timeout(30000) });
	if (!detailRes.ok) throw new Error(`获取详情失败(${detailRes.status})`);
	const detailData = await detailRes.json();
	
	if (!detailData.list || detailData.list.length === 0) return [];
	
	return detailData.list.map((v: any) => ({
		vod_id: v.vod_id,
		vod_name: v.vod_name,
		type_name: v.type_name,
		vod_pic: v.vod_pic,
		vod_year: v.vod_year,
		vod_area: v.vod_area,
		vod_actor: v.vod_actor,
		vod_director: v.vod_director,
		vod_play_url: v.vod_play_url,
		vod_remarks: v.vod_remarks,
		vod_lang: v.vod_lang,
		vod_time: v.vod_time ? parseInt(v.vod_time) : undefined,
		duration: extractDuration(v.vod_play_url)
	}));
}

// 核心采集逻辑
async function collectSource(
	source: SourceConfig,
	mode: 'full' | 'today' | 'week' | 'month',
	env: Env,
	signal?: AbortSignal
): Promise<CollectResult> {
	const result: CollectResult = {
		total: 0,
		new: 0,
		updated: 0,
		fail: 0,
		pagesCollected: 0,
		totalPages: 0
	};
	
	// 采集锁
	const lockKey = `collect_lock:${source.id}`;
	const existingLock = await env.CACHE.get(lockKey);
	if (existingLock) {
		const lockAge = Math.floor(Date.now() / 1000) - parseInt(existingLock);
		if (lockAge < 3600) {
			throw new Error(`采集源 #${source.id} 正在采集中，请稍后再试`);
		}
	}
	await env.CACHE.put(lockKey, Math.floor(Date.now() / 1000).toString(), { expirationTtl: 3600 });
	
	try {
		// 获取第一页列表，确定总页数
		const firstPage = await collectPageList(source.api_url, 1, signal);
		result.totalPages = firstPage.totalPages;
		
		// 确定采集页数
		let pagesToCollect: number[] = [];
		if (mode === 'full') {
			// 全量采集 - 倒序采集（老数据在下）
			pagesToCollect = Array.from({ length: firstPage.totalPages }, (_, i) => firstPage.totalPages - i);
		} else if (mode === 'today') {
			pagesToCollect = [1, 2, 3];
		} else if (mode === 'week') {
			pagesToCollect = Array.from({ length: Math.min(10, firstPage.totalPages) }, (_, i) => i + 1);
		} else if (mode === 'month') {
			pagesToCollect = Array.from({ length: Math.min(30, firstPage.totalPages) }, (_, i) => i + 1);
		}
		
		// 采集每一页
		for (const page of pagesToCollect) {
			if (signal?.aborted) break;
			
			try {
				// 获取列表
				const { videoIds } = await collectPageList(source.api_url, page, signal);
				if (videoIds.length === 0) continue;
				
				// 批量获取详情（每批20个）
				const batchSize = 20;
				for (let i = 0; i < videoIds.length; i += batchSize) {
					if (signal?.aborted) break;
					
					const batch = videoIds.slice(i, i + batchSize);
					const videos = await collectPageDetails(source.api_url, batch, signal);
					
					// 保存视频
					for (const video of videos) {
						if (signal?.aborted) break;
						const r = await saveVideo(video, source.id, env, source.domain_replacements);
						if (r.success) {
							result.total++;
							if (r.isNew) result.new++;
							else result.updated++;
						} else {
							result.fail++;
						}
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
		).bind(Math.floor(Date.now() / 1000), result.new, source.id).run();
		
	} finally {
		await env.CACHE.delete(lockKey);
	}
	
	return result;
}

// API入口
export const onRequest: PagesFunction<Env> = async (context) => {
	const { request, env } = context;
	
	if (request.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	
	try {
		const body = await request.json<{ sourceId?: number; mode?: string }>();
		
		if (!body.sourceId) {
			return new Response(JSON.stringify({ error: 'Missing sourceId' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		
		// 获取资源站配置
		const sourceResult = await env.DB_0.prepare(
			'SELECT id, name, api_url, domain_replacements FROM sources WHERE id = ? AND status = 1'
		).bind(body.sourceId).first();
		
		const source = sourceResult as SourceConfig | null;
		
		if (!source) {
			return new Response(JSON.stringify({ error: 'Source not found or disabled' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		
		const result = await collectSource(
			source,
			(body.mode as any) || 'today',
			env
		);
		
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
