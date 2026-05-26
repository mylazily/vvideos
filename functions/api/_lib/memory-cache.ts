// 内存缓存系统 - D1 + 内存混合存储
// 视频数据缓存在内存中，定期同步到 D1

import type { Env } from './types';

// ============ 内存缓存结构 ============
interface CachedVideo {
	id: number;
	vod_id: string;
	fingerprint_id: number;
	source_id: number;
	title: string;
	title_normalized: string;
	category: string;
	cover: string;
	play_url: string;
	duration: number;
	vod_year: string;
	vod_area: string;
	vod_actor: string;
	vod_director: string;
	vod_remarks: string;
	vod_lang: string;
	ad_segments: string | null;
	status: number;
	views: number;
	created_at: number;
	updated_at: number;
	// 缓存元数据
	_cache_at: number;
	_dirty: boolean;
}

interface CacheStats {
	hits: number;
	misses: number;
	size: number;
	lastSync: number;
}

// ============ 全局内存缓存 ============
class VideoMemoryCache {
	private cache: Map<string, CachedVideo> = new Map();
	private stats: CacheStats = { hits: 0, misses: 0, size: 0, lastSync: 0 };
	private maxSize: number = 50000; // 最大缓存5万条视频
	private ttl: number = 300000; // 5分钟TTL
	
	// 获取视频
	get(vodId: string): CachedVideo | undefined {
		const video = this.cache.get(vodId);
		if (!video) {
			this.stats.misses++;
			return undefined;
		}
		
		// 检查TTL
		if (Date.now() - video._cache_at > this.ttl) {
			this.cache.delete(vodId);
			this.stats.misses++;
			return undefined;
		}
		
		this.stats.hits++;
		return video;
	}
	
	// 设置视频
	set(vodId: string, video: CachedVideo): void {
		// 如果缓存满了，删除最旧的
		if (this.cache.size >= this.maxSize) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey) {
				this.cache.delete(oldestKey);
			}
		}
		
		video._cache_at = Date.now();
		video._dirty = false;
		this.cache.set(vodId, video);
		this.stats.size = this.cache.size;
	}
	
	// 批量设置
	setBatch(videos: CachedVideo[]): void {
		for (const video of videos) {
			this.set(video.vod_id, video);
		}
	}
	
	// 标记脏数据（需要同步到D1）
	markDirty(vodId: string): void {
		const video = this.cache.get(vodId);
		if (video) {
			video._dirty = true;
		}
	}
	
	// 获取所有脏数据
	getDirtyVideos(): CachedVideo[] {
		return Array.from(this.cache.values()).filter(v => v._dirty);
	}
	
	// 清除脏标记
	clearDirty(vodId: string): void {
		const video = this.cache.get(vodId);
		if (video) {
			video._dirty = false;
		}
	}
	
	// 获取统计
	getStats(): CacheStats {
		return { ...this.stats, size: this.cache.size };
	}
	
	// 清空缓存
	clear(): void {
		this.cache.clear();
		this.stats = { hits: 0, misses: 0, size: 0, lastSync: 0 };
	}
	
	// 获取缓存大小
	get size(): number {
		return this.cache.size;
	}
	
	// 获取所有缓存的vod_id
	getKeys(): string[] {
		return Array.from(this.cache.keys());
	}
}

// 全局单例
export const videoCache = new VideoMemoryCache();

// ============ 资源站内存缓存 ============
class SourceMemoryCache {
	private cache: Map<number, any> = new Map();
	private loaded: boolean = false;
	
	// 从D1加载所有资源站到内存
	async loadFromDB(env: Env): Promise<void> {
		if (this.loaded) return;
		
		try {
			const result = await env.DB_0.prepare(
				'SELECT * FROM sources WHERE status = 1'
			).all();
			
			const sources = (result.results as any[]) || [];
			this.cache.clear();
			
			for (const source of sources) {
				this.cache.set(source.id, source);
			}
			
			this.loaded = true;
			console.log(`[SourceCache] 已加载 ${sources.length} 个资源站到内存`);
		} catch (e) {
			console.error('[SourceCache] 加载失败:', e);
		}
	}
	
	// 获取资源站
	get(id: number): any | undefined {
		return this.cache.get(id);
	}
	
	// 获取所有资源站
	getAll(): any[] {
		return Array.from(this.cache.values());
	}
	
	// 添加/更新资源站
	set(source: any): void {
		this.cache.set(source.id, source);
	}
	
	// 删除资源站
	delete(id: number): void {
		this.cache.delete(id);
	}
	
	// 重新加载
	async reload(env: Env): Promise<void> {
		this.loaded = false;
		await this.loadFromDB(env);
	}
	
	// 是否已加载
	isLoaded(): boolean {
		return this.loaded;
	}
}

// 全局单例
export const sourceCache = new SourceMemoryCache();

// ============ 用户数据内存缓存 ============
class UserMemoryCache {
	private users: Map<string, any> = new Map(); // username -> user
	private sessions: Map<string, any> = new Map(); // token -> session
	
	// 获取用户
	getUser(username: string): any | undefined {
		return this.users.get(username);
	}
	
	// 设置用户
	setUser(username: string, user: any): void {
		this.users.set(username, user);
	}
	
	// 获取会话
	getSession(token: string): any | undefined {
		return this.sessions.get(token);
	}
	
	// 设置会话
	setSession(token: string, session: any, ttl: number = 86400): void {
		this.sessions.set(token, session);
		// TTL过期后自动删除
		setTimeout(() => {
			this.sessions.delete(token);
		}, ttl * 1000);
	}
	
	// 删除会话
	deleteSession(token: string): void {
		this.sessions.delete(token);
	}
}

// 全局单例
export const userCache = new UserMemoryCache();

// ============ 同步管理器 ============
export class SyncManager {
	private syncInterval: number = 60000; // 1分钟同步一次
	private timer: ReturnType<typeof setInterval> | null = null;
	
	// 启动自动同步
	start(env: Env): void {
		if (this.timer) return;
		
		this.timer = setInterval(async () => {
			await this.syncToD1(env);
		}, this.syncInterval);
		
		console.log('[SyncManager] 自动同步已启动');
	}
	
	// 停止自动同步
	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
	
	// 同步脏数据到D1
	async syncToD1(env: Env): Promise<void> {
		const dirtyVideos = videoCache.getDirtyVideos();
		if (dirtyVideos.length === 0) return;
		
		console.log(`[SyncManager] 同步 ${dirtyVideos.length} 条视频到D1`);
		
		for (const video of dirtyVideos) {
			try {
				const shardIndex = parseInt(video.vod_id) % 10;
				const db = [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9][shardIndex];
				
				await db.prepare(`
					UPDATE videos SET 
						views = ?, play_url = ?, cover = ?, updated_at = ?
					WHERE vod_id = ? AND source_id = ?
				`).bind(
					video.views,
					video.play_url,
					video.cover,
					Math.floor(Date.now() / 1000),
					video.vod_id,
					video.source_id
				).run();
				
				videoCache.clearDirty(video.vod_id);
			} catch (e) {
				console.error(`[SyncManager] 同步视频 ${video.vod_id} 失败:`, e);
			}
		}
	}
}

// 全局同步管理器
export const syncManager = new SyncManager();

// ============ 缓存工具函数 ============

// 从D1加载视频到内存缓存
export async function loadVideoToCache(vodId: string, env: Env): Promise<CachedVideo | null> {
	// 先查内存
	const cached = videoCache.get(vodId);
	if (cached) return cached;
	
	// 再查D1
	const shardIndex = parseInt(vodId) % 10;
	const db = [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9][shardIndex];
	
	const result = await db.prepare(
		'SELECT * FROM videos WHERE vod_id = ? AND status = 1'
	).bind(vodId).first();
	
	if (!result) return null;
	
	const video = result as CachedVideo;
	videoCache.set(vodId, video);
	return video;
}

// 批量加载视频到缓存
export async function loadVideosToCache(vodIds: string[], env: Env): Promise<CachedVideo[]> {
	const videos: CachedVideo[] = [];
	const missingIds: string[] = [];
	
	// 先查内存
	for (const vodId of vodIds) {
		const cached = videoCache.get(vodId);
		if (cached) {
			videos.push(cached);
		} else {
			missingIds.push(vodId);
		}
	}
	
	// 批量查D1
	if (missingIds.length > 0) {
		// 按分片分组
		const byShard: Map<number, string[]> = new Map();
		for (const vodId of missingIds) {
			const shardIndex = parseInt(vodId) % 10;
			if (!byShard.has(shardIndex)) {
				byShard.set(shardIndex, []);
			}
			byShard.get(shardIndex)!.push(vodId);
		}
		
		// 并行查询各分片
		const shardPromises = Array.from(byShard.entries()).map(async ([shardIndex, ids]) => {
			const db = [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9][shardIndex];
			const placeholders = ids.map(() => '?').join(',');
			
			const result = await db.prepare(
				`SELECT * FROM videos WHERE vod_id IN (${placeholders}) AND status = 1`
			).bind(...ids).all();
			
			return (result.results as CachedVideo[]) || [];
		});
		
		const results = await Promise.all(shardPromises);
		for (const shardVideos of results) {
			for (const video of shardVideos) {
				videoCache.set(video.vod_id, video);
				videos.push(video);
			}
		}
	}
	
	return videos;
}

// 增加视频浏览量（内存中增加，异步同步到D1）
export function incrementVideoViews(vodId: string): void {
	const video = videoCache.get(vodId);
	if (video) {
		video.views++;
		videoCache.markDirty(vodId);
	}
}
