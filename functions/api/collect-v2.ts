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

// 纯数字ID生成器（每个资源站独立计数）
async function generateVodId(sourceId: number, env: Env): Promise<string> {
	const key = `vod_id_counter:${sourceId}`;
	let counter = parseInt(await env.CACHE.get(key) || '0');
	counter = (counter + 1) % 10000000;
	await env.CACHE.put(key, String(counter));
	return String(counter);
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
	if (/恐怖|惊悚|悬疑|Thriller|Horror/.test(cat)) return '恐怖片';
	if (/剧情|文艺|传记/.test(cat)) return '剧情片';
	if (/战争|War/.test(cat)) return '战争片';
	if (/犯罪|警匪/.test(cat)) return '犯罪片';
	if (/奇幻|魔幻|玄幻|Fantasy/.test(cat)) return '奇幻片';
	if (/纪录片|纪录|Documentary/.test(cat)) return '纪录片';
	if (/武侠|古装|历史/.test(cat)) return '古装片';
	
	// 剧集类
	if (/大陆|国产|内地/.test(cat) && /剧/.test(cat)) return '大陆剧';
	if (/港|澳|HK|HongKong/.test(cat) && /剧/.test(cat)) return '港澳剧';
	if (/台|台湾/.test(cat) && /剧/.test(cat)) return '台湾剧';
	if (/日|日本/.test(cat) && /剧|动漫|动画/.test(cat)) return '日本剧';
	if (/韩|韩国/.test(cat) && /剧/.test(cat)) return '韩国剧';
	if (/美|美国|欧美|西部/.test(cat) && /剧/.test(cat)) return '美剧';
	if (/泰|泰国/.test(cat) && /剧/.test(cat)) return '泰剧';
	if (/英|英国/.test(cat) && /剧/.test(cat)) return '英剧';
	
	// 综艺动漫
	if (/综艺|真人秀|脱口秀/.test(cat)) return '综艺';
	if (/动漫|动画|Anime|Animation/.test(cat)) return '动漫';
	
	return cat;
}

// 提取视频时长
function extractDuration(playUrl: string): number {
	if (!playUrl) return 0;
	const matches = playUrl.match(/\$([\d:]+)/g);
	if (!matches) return 0;
	let totalSeconds = 0;
	for (const match of matches) {
		const timeStr = match.replace('$', '');
		const parts = timeStr.split(':');
		if (parts.length === 2) {
			totalSeconds += parseInt(parts[0]) * 60 + parseInt(parts[1]);
		} else if (parts.length === 3) {
			totalSeconds += parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
		}
	}
	return totalSeconds;
}

// 获取或创建分类
async function getOrCreateCategory(
	sourceId: number,
	categoryName: string,
	env: Env,
	displayName?: string
): Promise<number> {
	const normalizedName = normalizeCategory(categoryName);
	const db = env.DB_0;
	
	// 查找现有分类
	const existing = await db.prepare(
		'SELECT id, display_name FROM categories WHERE source_id = ? AND name = ?'
	).bind(sourceId, categoryName).first<{ id: number; display_name: string }>();
	
	if (existing) {
		// 如果提供了显示名称且当前为空，则更新
		if (displayName && !existing.display_name) {
			await db.prepare(
				'UPDATE categories SET display_name = ? WHERE id = ?'
			).bind(displayName, existing.id).run();
		}
		return existing.id;
	}
	
	// 创建新分类
	const now = Math.floor(Date.now() / 1000);
	const result = await db.prepare(
		'INSERT INTO categories (source_id, name, display_name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?)'
	).bind(sourceId, categoryName, displayName || '', normalizedName, now).run();
	
	return result.meta.last_row_id;
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
		
		// 获取或创建分类
		const categoryId = await getOrCreateCategory(sourceId, video.type_name, env);
		
		// 应用域名替换
		const finalPlayUrl = applyDomainReplacements(video.vod_play_url, domainReplacements || '');
		
		// 检查同资源站内是否已存在（用资源站原始ID检查）
		const existingCheck = await env.DB_0.prepare(
			'SELECT vod_id, play_url FROM videos WHERE source_id = ? AND vod_id = ?'
		).bind(sourceId, video.vod_id).first<{ vod_id: string; play_url: string }>();
		
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
				vod_id, source_id, category_id, title, cover, play_url, duration,
				vod_year, vod_area, vod_actor, vod_director, vod_remarks, vod_lang,
				status, views, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`
		).bind(
			newVodId, sourceId, categoryId, video.vod_name, video.vod_pic, finalPlayUrl,
			video.duration || 0, video.vod_year || '', video.vod_area || '', video.vod_actor || '',
			video.vod_director || '', video.vod_remarks || '', video.vod_lang || '', now, now
		).run();
		
		// 更新分类视频计数
		await env.DB_0.prepare(
			'UPDATE categories SET video_count = video_count + 1 WHERE id = ?'
		).bind(categoryId).run();
		
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
	if (ids.length === 0) return [];
	const idsStr = ids.slice(0, 100).join(',');
	const detailUrl = sourceUrl + (sourceUrl.includes('?') ? '&' : '?') + `ac=detail&ids=${idsStr}`;
	const detailRes = await fetch(detailUrl, { signal: signal || AbortSignal.timeout(60000) });
	if (!detailRes.ok) throw new Error(`获取详情失败(${detailRes.status})`);
	const detailData = await detailRes.json();
	if (!detailData.list) return [];
	
	return detailData.list.map((v: any) => ({
		vod_id: v.vod_id?.toString(),
		vod_name: v.vod_name || v.title || '',
		type_name: v.type_name || v.category || '其他',
		vod_pic: v.vod_pic || v.cover || '',
		vod_year: v.vod_year || '',
		vod_area: v.vod_area || '',
		vod_actor: v.vod_actor || '',
		vod_director: v.vod_director || '',
		vod_play_url: v.vod_play_url,
		vod_remarks: v.vod_remarks || '',
		vod_lang: v.vod_lang || '',
		duration: extractDuration(v.vod_play_url)
	})).filter((v: VideoData) => v.vod_play_url);
}

// 主采集函数
export async function collectV2(
	sourceConfig: SourceConfig,
	mode: 'full' | 'single' | 'today' | 'week' | 'month',
	env: Env,
	pages?: number,
	signal?: AbortSignal,
	reverseOrder: boolean = true  // 倒序采集：最新在最上
): Promise<CollectResult> {
	const { id: sourceId, api_url: sourceUrl, domain_replacements } = sourceConfig;
	const result: CollectResult = { total: 0, new: 0, updated: 0, fail: 0, pagesCollected: 0, totalPages: 0 };
	
	const { totalPages } = await collectPageList(sourceUrl, 1, signal);
	result.totalPages = totalPages;
	
	// 全量采集默认采集所有页面
	const defaultPages = mode === 'full' ? totalPages : (pages || 5);
	const maxPages = mode === 'full' ? totalPages : Math.min(defaultPages, totalPages);
	
	// 生成采集顺序（倒序：最后一页 -> 第一页）
	let pageOrder: number[] = [];
	if (reverseOrder) {
		// 倒序：从maxPages到1
		for (let p = maxPages; p >= 1; p--) {
			pageOrder.push(p);
		}
	} else {
		// 正序：从1到maxPages
		for (let p = 1; p <= maxPages; p++) {
			pageOrder.push(p);
		}
	}
	
	console.log(`[采集] 资源站#${sourceId} 模式=${mode} 总页数=${totalPages} 采集=${maxPages}页 顺序=${reverseOrder ? '倒序' : '正序'}`);
	
	for (const page of pageOrder) {
		try {
			const { videoIds } = await collectPageList(sourceUrl, page, signal);
			if (videoIds.length === 0) continue;
			
			const batchSize = 100;
			for (let i = 0; i < videoIds.length; i += batchSize) {
				const batch = videoIds.slice(i, i + batchSize);
				const videos = await collectPageDetails(sourceUrl, batch, signal);
				
				result.total += videos.length;
				for (const video of videos) {
					const saved = await saveVideo(video, sourceId, env, domain_replacements);
					if (saved.success) {
						if (saved.isNew) result.new++;
						else result.updated++;
					} else {
						result.fail++;
					}
				}
			}
			
			result.pagesCollected++;
			console.log(`[采集] 资源站#${sourceId} 进度: ${page}/${maxPages}页, 新增=${result.new}, 更新=${result.updated}`);
			if (result.pagesCollected < pageOrder.length) await new Promise(r => setTimeout(r, 1500));
		} catch (e) {
			console.error(`第${page}页采集失败:`, e);
			result.fail++;
		}
	}
	
	// 更新资源站统计
	await env.DB_0.prepare(
		'UPDATE sources SET total_videos = total_videos + ?, last_collect_at = ? WHERE id = ?'
	).bind(result.new, Math.floor(Date.now() / 1000), sourceId).run();
	
	// 记录采集日志
	await env.DB_0.prepare(
		'INSERT INTO collect_logs (source_id, action, details, new_count, updated_count, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	).bind(
		sourceId,
		`collect_${mode}`,
		`${reverseOrder ? '倒序' : '正序'}采集完成: ${result.pagesCollected}/${result.totalPages}页`,
		result.new,
		result.updated,
		Math.floor(Date.now() / 1000)
	).run();
	
	return result;
}
