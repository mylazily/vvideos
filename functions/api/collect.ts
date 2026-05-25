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
	duration?: number;
}

interface CollectOptions {
	sourceUrl: string;
	sourceId: number;
	env: Env;
	mode: 'full' | 'single';
	pages?: number;
	signal?: AbortSignal;
	categories?: string[];
}

interface CollectResult {
	total: number;
	new: number;
	merged: number;
	fail: number;
	pagesCollected: number;
	totalPages: number;
	categories: Record<string, number>;
}

interface CollectProgress {
	status: 'running' | 'completed' | 'error';
	page: number;
	totalPages: number;
	new: number;
	merged: number;
	fail: number;
	startedAt: number;
	message?: string;
}

// ============ 工具函数 ============

function fnv1aHash(str: string): string {
	let hash = 2166136261;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeTitle(title: string): string {
	if (!title) return '';
	return title
		.trim()
		// 统一全角/半角
		.replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
		// 罗马数字转阿拉伯数字：Ⅱ→2, Ⅲ→3, Ⅳ→4, Ⅴ→5, Ⅵ→6, Ⅶ→7, Ⅷ→8, Ⅸ→9, Ⅹ→10
		.replace(/Ⅹ/g, '10').replace(/Ⅸ/g, '9').replace(/Ⅷ/g, '8')
		.replace(/Ⅶ/g, '7').replace(/Ⅵ/g, '6').replace(/Ⅴ/g, '5')
		.replace(/Ⅳ/g, '4').replace(/Ⅲ/g, '3').replace(/Ⅱ/g, '2').replace(/Ⅰ/g, '1')
		// 去掉空格
		.replace(/\s+/g, '')
		// 去掉画质标签
		.replace(/(\d{3,4}[Pp]|HD|BD|UHD|4K|1080|720|蓝光|高清|超清|标清|DVD|TS|TC|CAM|枪版)/gi, '')
		// 去掉语言/字幕标签
		.replace(/(国语|粤语|英语|日语|韩语|中字|中英双字|双语|版|未删减|加长版|导演版|完整版)/g, '')
		// 去掉集数标签
		.replace(/(全\d+集|共\d+集|\d+集全|第[一二三四五六七八九十百\d]+季|第[一二三四五六七八九十百\d]+期)/g, '')
		// 去掉年份括号 (2024) 【2024】
		.replace(/[\[\(（【]\d{4}[\]\)）】]/g, '')
		// 去掉尾部年份
		.replace(/(19|20)\d{2}$/, '')
		// 去掉 "电影"/"电视剧"/"动漫" 等类型后缀
		.replace(/(电影|电视剧|动漫|综艺|纪录片|微电影|网剧|院线|热映|在线观看|免费观看|高清在线)$/g, '')
		// 只保留中文、字母、数字
		.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
		.toLowerCase()
		// 去掉开头的数字（如 "2024流浪地球" → "流浪地球"）
		.replace(/^(19|20)\d{2}/, '')
		// 去掉开头的纯数字序号
		.replace(/^\d+/, '');
}

/**
 * normalizeCategory - 分类标准化函数
 * 将不同资源站的各种分类名映射到统一的标准分类，解决分类不一致问题。
 */
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
	if (/伦理|情色/.test(cat)) return '伦理片';

	// 剧集类
	if (/大陆|国产|内地/.test(cat) && /剧/.test(cat)) return '大陆剧';
	if (/港|澳|HK|HongKong/.test(cat) && /剧/.test(cat)) return '港澳剧';
	if (/台|Taiwan/.test(cat) && /剧/.test(cat)) return '台湾剧';
	if (/韩|Korea|韩国/.test(cat) && /剧/.test(cat)) return '韩剧';
	if (/日|Japan|日本/.test(cat) && /剧/.test(cat)) return '日剧';
	if (/美|USA|美国|欧美/.test(cat) && /剧/.test(cat)) return '美剧';
	if (/泰|Thai|泰国/.test(cat) && /剧/.test(cat)) return '泰剧';
	if (/英|British|英国/.test(cat) && /剧/.test(cat)) return '英剧';
	if (/短剧|微剧/.test(cat)) return '短剧';

	// 综艺
	if (/综艺|真人秀|Variety|脱口秀/.test(cat)) return '综艺';

	// 动漫细分（优先匹配细分，再匹配大类）
	if (/日本动漫|日漫/.test(cat)) return '日本动漫';
	if (/中国动漫|国漫/.test(cat)) return '中国动漫';
	if (/美国动漫|美漫/.test(cat)) return '美国动漫';
	if (/动画|动漫|Anime/.test(cat)) return '动漫';

	return cat;
}

function generateFingerprint(title: string): string {
	const normalized = normalizeTitle(title);
	return fnv1aHash(normalized);
}

function extractDuration(url: string): number {
	const match = url.match(/[?&]duration=(\d+)/i);
	if (match) return parseInt(match[1]);
	const fileMatch = url.match(/_(\d+)[s秒]/i);
	if (fileMatch) return parseInt(fileMatch[1]);
	return 0;
}

function getShard(vodId: string, env: Env): D1Database {
	// 按视频ID尾号数字分片 0-9
	// 例如: "mpg9fqw7zqoz5" -> 末尾是 "5" -> 放入 DB_5
	const match = vodId.match(/(\d)$/);
	const shardIndex = match ? parseInt(match[1], 10) : (parseInt(fnv1aHash(vodId).slice(0, 8), 16) % 10);
	const shards = [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
	return shards[shardIndex];
}

function generateVodId(): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 7);
	return `${timestamp}${random}`;
}

function jsonResponse(data: any, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
	});
}

function isPrivateUrl(urlStr: string): boolean {
	try {
		const urlObj = new URL(urlStr);
		const hostname = urlObj.hostname.toLowerCase();
		if (!['http:', 'https:'].includes(urlObj.protocol)) return true;
		if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
			const parts = hostname.split('.').map(Number);
			if (parts[0] === 127) return true;
			if (parts[0] === 10) return true;
			if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
			if (parts[0] === 192 && parts[1] === 168) return true;
			if (parts[0] === 169 && parts[1] === 254) return true;
			if (parts[0] === 0) return true;
		}
		if (hostname === 'localhost' || hostname === 'localhost.localdomain') return true;
		if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;
		if (hostname === '::1' || hostname === '[::1]') return true;
		if (hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) return true;
		return false;
	} catch {
		return true;
	}
}

async function verifyAdminToken(request: Request, env: Env): Promise<boolean> {
	const authHeader = request.headers.get('Authorization') || '';
	const token = authHeader.replace('Bearer ', '');
	if (!token) return false;
	const tokenData = await env.CACHE.get(`admin_token:${token}`);
	return !!tokenData;
}

// ============ 进度上报 ============

async function writeProgress(env: Env, sourceId: number, progress: CollectProgress): Promise<void> {
	const key = `collect_progress:${sourceId}`;
	await env.CACHE.put(key, JSON.stringify(progress), { expirationTtl: 3600 });
}

async function readProgress(env: Env, sourceId: number): Promise<CollectProgress | null> {
	const key = `collect_progress:${sourceId}`;
	const data = await env.CACHE.get(key);
	if (!data) return null;
	try {
		return JSON.parse(data) as CollectProgress;
	} catch {
		return null;
	}
}

// ============ 采集单页列表 + 详情 ============

async function collectPageList(sourceUrl: string, page: number, signal?: AbortSignal): Promise<{ totalPages: number; videoIds: string[] }> {
	const listUrl = sourceUrl + (sourceUrl.includes('?') ? '&' : '?') + `ac=list&pg=${page}`;
	if (isPrivateUrl(listUrl)) throw new Error('不允许访问内网地址');
	const listRes = await fetch(listUrl, { signal: signal || AbortSignal.timeout(30000) });
	if (!listRes.ok) throw new Error(`获取列表失败(${listRes.status})`);
	const listData = await listRes.json();
	if (!listData.list || listData.list.length === 0) return { totalPages: 1, videoIds: [] };

	let totalPages = 1;
	if (listData.pagecount) {
		totalPages = parseInt(listData.pagecount) || 1;
	} else if (listData.total && listData.limit) {
		totalPages = Math.ceil(listData.total / listData.limit);
	} else if (listData.page) {
		totalPages = parseInt(listData.page) || 1;
	}

	const videoIds = listData.list.map((v: any) => v.vod_id).filter(Boolean);
	return { totalPages, videoIds };
}

async function collectPageDetails(sourceUrl: string, ids: string[], signal?: AbortSignal): Promise<VideoData[]> {
	if (ids.length === 0) return [];
	const idsStr = ids.slice(0, 100).join(',');
	const detailUrl = sourceUrl + (sourceUrl.includes('?') ? '&' : '?') + `ac=detail&ids=${idsStr}`;
	if (isPrivateUrl(detailUrl)) throw new Error('不允许访问内网地址');
	const detailRes = await fetch(detailUrl, { signal: signal || AbortSignal.timeout(60000) });
	if (!detailRes.ok) throw new Error(`获取详情失败(${detailRes.status})`);
	const detailData = await detailRes.json();
	if (!detailData.list) return [];

	const videos: VideoData[] = [];
	for (const v of detailData.list) {
		if (!v.vod_play_url) continue;
		videos.push({
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
		});
	}
	return videos;
}

// ============ 数据入库 ============

/**
 * 二级匹配：当标题指纹匹配不到时，用 年份+导演+分类 组合查找
 * 解决不同资源站标题写法不同的问题
 */
async function findExistingByMeta(video: VideoData, env: Env): Promise<{ fingerprintId: number; mainVodId: string } | null> {
	const year = video.vod_year || '';
	const director = (video.vod_director || '').trim();
	const normalizedCat = normalizeCategory(video.type_name);

	// 至少需要有年份或导演才能做二级匹配
	if (!year && !director) return null;

	// 构建查询条件
	const conditions: string[] = [];
	const bindings: any[] = [];

	if (year) {
		conditions.push('vod_year = ?');
		bindings.push(year);
	}
	if (director) {
		// 模糊匹配导演（处理 "导演A,导演B" vs "导演A" 的情况）
		conditions.push('(vod_director LIKE ? OR vod_director LIKE ? OR ? LIKE \'%\' || vod_director || \'%\')');
		const dirPattern = `%${director}%`;
		bindings.push(dirPattern, dirPattern, director);
	}
	if (normalizedCat && normalizedCat !== '其他') {
		conditions.push('category = ?');
		bindings.push(normalizedCat);
	}

	if (conditions.length < 2) return null; // 至少需要2个条件匹配

	const sql = `SELECT id, main_vod_id, title_normalized, vod_year, vod_director FROM video_fingerprints WHERE ${conditions.join(' AND ')}`;
	const candidates = await env.DB_0.prepare(sql).bind(...bindings).all<{ id: number; main_vod_id: string; title_normalized: string; vod_year: string; vod_director: string }>();

	if (!candidates.results || candidates.results.length === 0) return null;

	// 如果只有一条匹配，直接返回
	if (candidates.results.length === 1) {
		const c = candidates.results[0];
		console.log(`[二级匹配] 标题不同但元数据匹配: "${video.vod_name}" → 已有"${c.title_normalized}" (年=${c.vod_year}, 导演=${c.vod_director})`);
		return { fingerprintId: c.id, mainVodId: c.main_vod_id };
	}

	// 多条匹配时，优先选择标题相似度最高的
	const inputTitle = normalizeTitle(video.vod_name);
	let bestMatch = candidates.results[0];
	let bestScore = 0;

	for (const c of candidates.results) {
		const existingTitle = c.title_normalized || '';
		// 计算标题相似度（最长公共子串比例）
		const score = titleSimilarity(inputTitle, existingTitle);
		if (score > bestScore) {
			bestScore = score;
			bestMatch = c;
		}
	}

	// 相似度太低（<20%）则不认为是同一视频
	if (bestScore < 0.2) return null;

	console.log(`[二级匹配] 多候选选择: "${video.vod_name}" → "${bestMatch.title_normalized}" (相似度=${Math.round(bestScore * 100)}%)`);
	return { fingerprintId: bestMatch.id, mainVodId: bestMatch.main_vod_id };
}

/**
 * 简单标题相似度计算（最长公共子串比例）
 */
function titleSimilarity(a: string, b: string): number {
	if (!a || !b) return 0;
	if (a === b) return 1;
	const shorter = a.length < b.length ? a : b;
	const longer = a.length < b.length ? b : a;
	if (shorter.length === 0) return 0;

	// 计算最长公共子串
	let maxLen = 0;
	for (let i = 0; i < shorter.length; i++) {
		for (let j = i + 1; j <= shorter.length; j++) {
			const substr = shorter.substring(i, j);
			if (longer.includes(substr) && substr.length > maxLen) {
				maxLen = substr.length;
			}
		}
	}

	// 同时检查字符交集比例
	const setA = new Set(shorter);
	const setB = new Set(longer);
	let intersection = 0;
	for (const ch of setA) {
		if (setB.has(ch)) intersection++;
	}
	const charSim = intersection / Math.max(setA.size, setB.size);

	// 综合得分：子串相似度 * 0.6 + 字符交集 * 0.4
	return (maxLen / shorter.length) * 0.6 + charSim * 0.4;
}

async function findOrCreateFingerprint(video: VideoData, env: Env): Promise<{ fingerprintId: number; mainVodId: string; isNew: boolean }> {
	const fingerprint = generateFingerprint(video.vod_name);
	const titleNormalized = normalizeTitle(video.vod_name);
	const normalizedCat = normalizeCategory(video.type_name);
	const director = (video.vod_director || '').trim();

	// 一级匹配：标题指纹
	const existing = await env.DB_0.prepare('SELECT id, main_vod_id FROM video_fingerprints WHERE fingerprint = ?').bind(fingerprint).first<{ id: number; main_vod_id: string }>();
	if (existing) return { fingerprintId: existing.id, mainVodId: existing.main_vod_id, isNew: false };

	// 二级匹配：元数据（年份+导演+分类）
	const metaMatch = await findExistingByMeta(video, env);
	if (metaMatch) {
		// 将新标题作为别名添加（更新指纹表，让后续标题匹配也能命中）
		// 同时更新 title_normalized 为更短的标题（优先保留中文标题）
		const existingTitle = await env.DB_0.prepare('SELECT title_normalized FROM video_fingerprints WHERE id = ?').bind(metaMatch.fingerprintId).first<{ title_normalized: string }>();
		const existingNorm = existingTitle?.title_normalized || '';
		// 保留更短的标题（通常更干净）
		const betterTitle = titleNormalized.length < existingNorm.length ? titleNormalized : existingNorm;
		if (betterTitle !== existingNorm) {
			await env.DB_0.prepare('UPDATE video_fingerprints SET title_normalized = ? WHERE id = ?').bind(betterTitle, metaMatch.fingerprintId).run();
		}
		// 同时更新导演信息（如果已有记录的导演为空）
		if (director) {
			await env.DB_0.prepare('UPDATE video_fingerprints SET vod_director = ? WHERE id = ? AND (vod_director IS NULL OR vod_director = "")').bind(director, metaMatch.fingerprintId).run();
		}
		return { fingerprintId: metaMatch.fingerprintId, mainVodId: metaMatch.mainVodId, isNew: false };
	}

	// 都没匹配到，创建新记录
	const vodId = generateVodId();
	const result = await env.DB_0.prepare('INSERT INTO video_fingerprints (fingerprint, title_normalized, vod_year, category, vod_director, main_vod_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(fingerprint, titleNormalized, video.vod_year || '', normalizedCat, director, vodId, Math.floor(Date.now() / 1000)).run();
	return { fingerprintId: result.meta.last_row_id, mainVodId: vodId, isNew: true };
}

function detectAdSegments(durations: number[]): string {
	const validDurations = durations.filter(d => d > 0);
	if (validDurations.length < 2) return '';
	const minDuration = Math.min(...validDurations);
	const maxDuration = Math.max(...validDurations);
	if (maxDuration - minDuration < 5) return '';
	const adSegments: Array<{ start: number; end: number; type: string }> = [];
	const avgExtra = (maxDuration - minDuration) / 2;
	if (avgExtra > 5) adSegments.push({ start: 0, end: Math.floor(avgExtra), type: 'pre' });
	return JSON.stringify(adSegments);
}

async function saveVideo(video: VideoData, sourceId: number, env: Env): Promise<{ success: boolean; isNew: boolean }> {
	try {
		const { fingerprintId, mainVodId } = await findOrCreateFingerprint(video, env);
		const shard = getShard(mainVodId, env);
		const existing = await shard.prepare('SELECT id, play_url_1, play_url_2, play_url_3, play_url_4, play_url_5, duration_1, duration_2, duration_3, duration_4, duration_5 FROM videos WHERE vod_id = ?').bind(mainVodId).first<any>();
		const now = Math.floor(Date.now() / 1000);
		if (existing) {
			const urls = [existing.play_url_1, existing.play_url_2, existing.play_url_3, existing.play_url_4, existing.play_url_5];
			const durations = [existing.duration_1, existing.duration_2, existing.duration_3, existing.duration_4, existing.duration_5];
			let slotIndex = urls.findIndex(u => !u || u === video.vod_play_url);
			if (slotIndex === -1) slotIndex = 0;
			const urlCol = `play_url_${slotIndex + 1}`;
			const durCol = `duration_${slotIndex + 1}`;
			durations[slotIndex] = video.duration || 0;
			const adSegments = detectAdSegments(durations);
			await shard.prepare(`UPDATE videos SET ${urlCol} = ?, ${durCol} = ?, ad_segments = ?, updated_at = ? WHERE vod_id = ?`).bind(video.vod_play_url, video.duration || 0, adSegments, now, mainVodId).run();
			return { success: true, isNew: false };
		} else {
			const adSegments = detectAdSegments([video.duration || 0]);
			const normalizedCat = normalizeCategory(video.type_name);
			await shard.prepare('INSERT INTO videos (vod_id, fingerprint_id, title, title_normalized, category, cover, play_url_1, duration_1, ad_segments, vod_year, vod_area, vod_actor, vod_director, vod_remarks, vod_lang, status, views, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)').bind(mainVodId, fingerprintId, video.vod_name, normalizeTitle(video.vod_name), normalizedCat, video.vod_pic, video.vod_play_url, video.duration || 0, adSegments, video.vod_year || '', video.vod_area || '', video.vod_actor || '', video.vod_director || '', video.vod_remarks || '', video.vod_lang || '', now, now).run();
			return { success: true, isNew: true };
		}
	} catch (e) {
		console.error('入库失败:', e);
		return { success: false, isNew: false };
	}
}

// ============ 核心采集函数：支持全量和单页模式 ============

async function collectAll(options: CollectOptions): Promise<CollectResult> {
	const { sourceUrl, sourceId, env, mode, pages, signal, categories } = options;
	const result: CollectResult = { total: 0, new: 0, merged: 0, fail: 0, pagesCollected: 0, totalPages: 0, categories: {} };
	const startedAt = Math.floor(Date.now() / 1000);

	// 采集锁：防止同一源被同时采集（KV锁，60分钟自动过期）
	const lockKey = `collect_lock:${sourceId}`;
	const existingLock = await env.CACHE.get(lockKey);
	if (existingLock) {
		const lockAge = Math.floor(Date.now() / 1000) - parseInt(existingLock);
		if (lockAge < 3600) {
			throw new Error(`采集源 #${sourceId} 正在采集中（已运行 ${Math.floor(lockAge / 60)} 分钟），请稍后再试`);
		}
		await env.CACHE.delete(lockKey);
	}
	await env.CACHE.put(lockKey, String(Math.floor(Date.now() / 1000)), { expirationTtl: 3600 });

	// 采集开始：写入进度 status=running
	await writeProgress(env, sourceId, {
		status: 'running',
		page: 0,
		totalPages: 0,
		new: 0,
		merged: 0,
		fail: 0,
		startedAt
	});

	try {
		const { totalPages } = await collectPageList(sourceUrl, 1, signal);
		result.totalPages = totalPages;
		const maxPages = mode === 'full' ? totalPages : Math.min(pages || totalPages, totalPages);

		// 更新进度中的 totalPages
		await writeProgress(env, sourceId, {
			status: 'running',
			page: 0,
			totalPages: maxPages,
			new: 0,
			merged: 0,
			fail: 0,
			startedAt
		});

		console.log(`[采集] 源#${sourceId} 模式=${mode} 总页数=${totalPages} 本次采集=${maxPages}页`);

		// 空页连续检测计数器
		let emptyPageCount = 0;

		for (let page = 1; page <= maxPages; page++) {
			try {
				const { videoIds } = await collectPageList(sourceUrl, page, signal);

				// 空页连续检测：连续3页为空则提前终止
				if (videoIds.length === 0) {
					emptyPageCount++;
					if (emptyPageCount >= 3) {
						console.log(`[采集] 源#${sourceId} 连续3页为空，提前终止采集`);
						break;
					}
					// 即使空页也上报进度
					await writeProgress(env, sourceId, {
						status: 'running',
						page,
						totalPages: maxPages,
						new: result.new,
						merged: result.merged,
						fail: result.fail,
						startedAt
					});
					continue;
				} else {
					emptyPageCount = 0;
				}

				const batchSize = 100;
				for (let i = 0; i < videoIds.length; i += batchSize) {
					const batch = videoIds.slice(i, i + batchSize);
					let videos = await collectPageDetails(sourceUrl, batch, signal);

					// 分类过滤
					if (categories && categories.length > 0) {
						videos = videos.filter(v => categories.includes(v.type_name));
					}

					result.total += videos.length;
					for (const video of videos) {
						const saved = await saveVideo(video, sourceId, env);
						if (saved.success) {
							if (saved.isNew) {
								result.new++;
								// 统计分类
								const cat = normalizeCategory(video.type_name) || '其他';
								result.categories[cat] = (result.categories[cat] || 0) + 1;
							} else {
								result.merged++;
							}
						} else {
							result.fail++;
						}
					}
				}

				result.pagesCollected = page;

				// 每页采集完成后上报进度到KV
				await writeProgress(env, sourceId, {
					status: 'running',
					page,
					totalPages: maxPages,
					new: result.new,
					merged: result.merged,
					fail: result.fail,
					startedAt
				});

				if (page % 10 === 0 || page === maxPages) {
					console.log(`[采集] 源#${sourceId} 进度: ${page}/${maxPages}页, 新增=${result.new}, 更新=${result.merged}`);
				}

				if (page < maxPages) await new Promise(r => setTimeout(r, 1500));
			} catch (e: any) {
				if (signal?.aborted) throw e;
				console.error(`第${page}页采集失败:`, e.message);
				result.fail++;
			}
		}

		// 采集完成：写入 status=completed
		await writeProgress(env, sourceId, {
			status: 'completed',
			page: result.pagesCollected,
			totalPages: result.totalPages,
			new: result.new,
			merged: result.merged,
			fail: result.fail,
			startedAt,
			message: `采集完成，共 ${result.pagesCollected}/${result.totalPages} 页，新增 ${result.new} 条，更新 ${result.merged} 条`
		});
	} catch (e: any) {
		// 采集出错：写入 status=error
		await writeProgress(env, sourceId, {
			status: 'error',
			page: result.pagesCollected,
			totalPages: result.totalPages,
			new: result.new,
			merged: result.merged,
			fail: result.fail,
			startedAt,
			message: e.message || '采集出错'
		});
		throw e;
	} finally {
		await env.CACHE.delete(lockKey);
	}

	return result;
}

// ============ HTTP Handler ============

export const onRequest: PagesFunction<Env> = async (context) => {
	const { request, env } = context;

	// CORS preflight
	if (request.method === 'OPTIONS') {
		return new Response(null, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization'
			}
		});
	}

	// GET: 查询采集进度
	if (request.method === 'GET') {
		const isAdmin = await verifyAdminToken(request, env);
		if (!isAdmin) return jsonResponse({ code: 0, msg: '未授权访问' }, 401);

		const url = new URL(request.url);
		const sourceIdParam = url.searchParams.get('source_id');

		if (sourceIdParam === 'all') {
			// 返回所有正在运行的采集进度
			const allProgress: Record<string, CollectProgress> = {};
			// 检查常见的 sourceId 范围 1-20
			for (let i = 1; i <= 20; i++) {
				const progress = await readProgress(env, i);
				if (progress && progress.status === 'running') {
					allProgress[String(i)] = progress;
				}
			}
			return jsonResponse({ code: 1, data: allProgress });
		}

		if (!sourceIdParam) {
			return jsonResponse({ code: 0, msg: '缺少 source_id 参数' }, 400);
		}

		const sourceId = parseInt(sourceIdParam);
		if (isNaN(sourceId)) {
			return jsonResponse({ code: 0, msg: 'source_id 必须是数字' }, 400);
		}

		const progress = await readProgress(env, sourceId);
		if (!progress) {
			return jsonResponse({ code: 0, msg: '没有找到该源的采集进度' }, 404);
		}

		return jsonResponse({ code: 1, data: progress });
	}

	// DELETE: 取消采集
	if (request.method === 'DELETE') {
		const isAdmin = await verifyAdminToken(request, env);
		if (!isAdmin) return jsonResponse({ code: 0, msg: '未授权访问' }, 401);

		const url = new URL(request.url);
		const sourceIdParam = url.searchParams.get('source_id');

		if (!sourceIdParam) {
			return jsonResponse({ code: 0, msg: '缺少 source_id 参数' }, 400);
		}

		const sourceId = parseInt(sourceIdParam);
		if (isNaN(sourceId)) {
			return jsonResponse({ code: 0, msg: 'source_id 必须是数字' }, 400);
		}

		const lockKey = `collect_lock:${sourceId}`;
		const progressKey = `collect_progress:${sourceId}`;

		await env.CACHE.delete(lockKey);
		await env.CACHE.delete(progressKey);

		return jsonResponse({ code: 1, msg: `已取消源 #${sourceId} 的采集任务` });
	}

	// POST: 执行采集
	if (request.method !== 'POST') return jsonResponse({ code: 0, msg: '不支持的请求方法' }, 405);

	const isAdmin = await verifyAdminToken(request, env);
	if (!isAdmin) return jsonResponse({ code: 0, msg: '未授权访问' }, 401);

	try {
		const body = await request.json<{
			source_url?: string;
			source_id?: number;
			mode?: 'full' | 'single';
			pages?: number;
			categories?: string[];
		}>();

		const sourceUrl = body.source_url;
		const sourceId = body.source_id || 0;
		const mode = body.mode || 'single';
		const pages = body.pages || 1;
		const categories = body.categories;

		if (!sourceUrl) return jsonResponse({ code: 0, msg: '缺少source_url' }, 400);
		if (isPrivateUrl(sourceUrl)) return jsonResponse({ code: 0, msg: '不允许访问内网地址' }, 400);

		const result = await collectAll({
			sourceUrl,
			sourceId,
			env,
			mode,
			pages,
			categories,
			signal: AbortSignal.timeout(mode === 'full' ? 3600000 : 300000)
		});

		return jsonResponse({
			code: 1,
			msg: `采集完成，共 ${result.pagesCollected}/${result.totalPages} 页，新增 ${result.new} 条，更新 ${result.merged} 条`,
			data: result
		});
	} catch (err: any) {
		return jsonResponse({ code: 0, msg: err.message || '采集失败' }, 500);
	}
};
