// 共享工具函数 - 所有 API 文件统一使用
import type { Env } from './types';

const SHARD_COUNT = 10;

/** 获取所有分片数据库 */
export function getAllShards(env: Env): D1Database[] {
	return [
		env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4,
		env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9
	];
}

/** 根据 vodId 获取分片索引 */
export function getShardIndex(vodId: string): number {
	const num = parseInt(vodId, 10);
	return isNaN(num) ? 0 : (num % SHARD_COUNT);
}

/** 根据 vodId 获取对应分片数据库 */
export function getShard(env: Env, vodId: string): D1Database {
	const idx = getShardIndex(vodId);
	return getAllShards(env)[idx];
}

/** JSON 响应 */
export function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-cache'
		}
	});
}

/** 生成随机 Token */
export function generateToken(): string {
	const arr = new Uint8Array(32);
	crypto.getRandomValues(arr);
	return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/** 验证管理员 Token */
export async function verifyAdminToken(request: Request, env: Env): Promise<boolean> {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader?.startsWith('Bearer ')) return false;
	const token = authHeader.slice(7);
	const stored = await env.CACHE.get(`admin_token:${token}`);
	return !!stored;
}

/** 标准化分类名 */
export function normalizeCategory(category: string): string {
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

/** 从播放URL提取时长（秒） */
export function extractDuration(url: string): number {
	if (!url) return 0;
	const match = url.match(/\$(\d+):(\d+):(\d+)#/);
	if (match) return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
	const match2 = url.match(/\$(\d+):(\d+)#/);
	if (match2) return parseInt(match2[1]) * 60 + parseInt(match2[2]);
	return 0;
}

/** 应用域名替换 */
export function applyDomainReplacements(playUrl: string, replacementsJson: string): string {
	if (!replacementsJson) return playUrl;
	try {
		const replacements = JSON.parse(replacementsJson);
		let result = playUrl;
		for (const [oldDomain, newDomain] of Object.entries(replacements)) {
			result = result.replace(
				new RegExp(oldDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
				newDomain as string
			);
		}
		return result;
	} catch {
		return playUrl;
	}
}

/** Edge Cache 获取 */
export async function getEdgeCache(request: Request): Promise<Response | undefined> {
	const cache = caches.default;
	const cached = await cache.match(request);
	if (cached) return cached;
	return undefined;
}

/** Edge Cache 设置 */
export async function setEdgeCache(request: Request, response: Response, ttl = 300): Promise<void> {
	const cache = caches.default;
	const newResponse = new Response(response.body, response);
	newResponse.headers.set('Cache-Control', `public, max-age=${ttl}`);
	// @ts-expect-error cf cache metadata
	newResponse.headers.set('cf-cache-status', 'DYNAMIC');
	const url = new URL(request.url);
	url.search = ''; // 忽略查询参数缓存
	await cache.put(url.toString(), newResponse);
}

/** 站点 URL */
export function getSiteUrl(request?: Request): string {
	if (request) {
		const url = new URL(request.url);
		return `${url.protocol}//${url.host}`;
	}
	return 'https://evideos.pages.dev';
}
