// 数据库初始化脚本 - 删除所有旧表并重新创建
// 使用方法：访问 /api/init-db 触发

export interface Env {
	DB_0: D1Database; DB_1: D1Database; DB_2: D1Database; DB_3: D1Database; DB_4: D1Database;
	DB_5: D1Database; DB_6: D1Database; DB_7: D1Database; DB_8: D1Database; DB_9: D1Database;
	CACHE: KVNamespace;
}

function getAllShards(env: Env): D1Database[] {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

// ============ 表结构定义 ============

// 视频表结构（每个分片都有）
const VIDEOS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS videos (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	vod_id TEXT NOT NULL,
	fingerprint_id INTEGER DEFAULT 0,
	source_id INTEGER NOT NULL,
	title TEXT NOT NULL,
	title_normalized TEXT,
	category TEXT NOT NULL,
	cover TEXT NOT NULL,
	play_url TEXT NOT NULL,
	duration INTEGER DEFAULT 0,
	vod_year TEXT,
	vod_area TEXT,
	vod_actor TEXT,
	vod_director TEXT,
	vod_remarks TEXT,
	vod_lang TEXT,
	ad_segments TEXT,
	status INTEGER DEFAULT 1,
	views INTEGER DEFAULT 0,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_videos_vod_id ON videos(vod_id);
CREATE INDEX IF NOT EXISTS idx_videos_source_id ON videos(source_id);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at);
CREATE INDEX IF NOT EXISTS idx_videos_views ON videos(views);
`;

// 资源站表（只在 DB_0）
const SOURCES_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	alias TEXT,
	api_url TEXT NOT NULL,
	status INTEGER DEFAULT 1,
	last_collect_at INTEGER DEFAULT 0,
	total_videos INTEGER DEFAULT 0,
	auto_collect_enabled INTEGER DEFAULT 0,
	auto_collect_mode TEXT DEFAULT 'today',
	auto_collect_cron TEXT DEFAULT '0 */6 * * *',
	domain_replacements TEXT,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
`;

// 采集日志表（只在 DB_0）
const COLLECT_LOGS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS collect_logs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	source_id INTEGER NOT NULL,
	mode TEXT NOT NULL,
	total INTEGER DEFAULT 0,
	new_count INTEGER DEFAULT 0,
	updated INTEGER DEFAULT 0,
	failed INTEGER DEFAULT 0,
	pages_collected INTEGER DEFAULT 0,
	total_pages INTEGER DEFAULT 0,
	message TEXT,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collect_logs_source_id ON collect_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_collect_logs_created_at ON collect_logs(created_at);
`;

// 用户表（只在 DB_0）- 用于账号系统
const USERS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT UNIQUE NOT NULL,
	password_hash TEXT NOT NULL,
	email TEXT,
	role TEXT DEFAULT 'user',
	status INTEGER DEFAULT 1,
	last_login_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
`;

// 用户收藏表（只在 DB_0）
const USER_FAVORITES_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS user_favorites (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	vod_id TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE(user_id, vod_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_vod_id ON user_favorites(vod_id);
`;

// 观看历史表（只在 DB_0）
const USER_HISTORY_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS user_history (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	vod_id TEXT NOT NULL,
	progress INTEGER DEFAULT 0,
	duration INTEGER DEFAULT 0,
	watched_at INTEGER NOT NULL,
	UNIQUE(user_id, vod_id)
);

CREATE INDEX IF NOT EXISTS idx_user_history_user_id ON user_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_history_watched_at ON user_history(watched_at);
`;

export const onRequest: PagesFunction<Env> = async (context) => {
	const { env } = context;
	const results: string[] = [];
	
	try {
		// 1. 删除所有分片中的视频表并重新创建
		const shards = getAllShards(env);
		for (let i = 0; i < shards.length; i++) {
			try {
				// 删除旧表
				await shards[i].prepare('DROP TABLE IF EXISTS videos').run();
				// 创建新表
				await shards[i].prepare(VIDEOS_TABLE_SCHEMA).run();
				results.push(`✅ 分片 DB_${i} 视频表已重建`);
			} catch (e: any) {
				results.push(`❌ 分片 DB_${i} 失败: ${e.message}`);
			}
		}
		
		// 2. 删除并重建资源站表
		try {
			await env.DB_0.prepare('DROP TABLE IF EXISTS sources').run();
			await env.DB_0.prepare(SOURCES_TABLE_SCHEMA).run();
			results.push(`✅ 资源站表已重建`);
		} catch (e: any) {
			results.push(`❌ 资源站表失败: ${e.message}`);
		}
		
		// 3. 删除并重建采集日志表
		try {
			await env.DB_0.prepare('DROP TABLE IF EXISTS collect_logs').run();
			await env.DB_0.prepare(COLLECT_LOGS_TABLE_SCHEMA).run();
			results.push(`✅ 采集日志表已重建`);
		} catch (e: any) {
			results.push(`❌ 采集日志表失败: ${e.message}`);
		}
		
		// 4. 删除并重建用户表
		try {
			await env.DB_0.prepare('DROP TABLE IF EXISTS users').run();
			await env.DB_0.prepare(USERS_TABLE_SCHEMA).run();
			results.push(`✅ 用户表已重建`);
		} catch (e: any) {
			results.push(`❌ 用户表失败: ${e.message}`);
		}
		
		// 5. 删除并重建用户收藏表
		try {
			await env.DB_0.prepare('DROP TABLE IF EXISTS user_favorites').run();
			await env.DB_0.prepare(USER_FAVORITES_TABLE_SCHEMA).run();
			results.push(`✅ 用户收藏表已重建`);
		} catch (e: any) {
			results.push(`❌ 用户收藏表失败: ${e.message}`);
		}
		
		// 6. 删除并重建观看历史表
		try {
			await env.DB_0.prepare('DROP TABLE IF EXISTS user_history').run();
			await env.DB_0.prepare(USER_HISTORY_TABLE_SCHEMA).run();
			results.push(`✅ 观看历史表已重建`);
		} catch (e: any) {
			results.push(`❌ 观看历史表失败: ${e.message}`);
		}
		
		// 7. 添加默认资源站（光速）
		const now = Math.floor(Date.now() / 1000);
		await env.DB_0.prepare(`
			INSERT INTO sources (name, alias, api_url, status, last_collect_at, total_videos, created_at)
			VALUES (?, ?, ?, 1, 0, 0, ?)
		`).bind('①线', '光速', 'https://api.guangsuapi.com/api.php/provide/vod/from/gsm3u8/', now).run();
		results.push(`✅ 已添加默认资源站：①线（光速）`);
		
		// 8. 清除所有 KV 缓存
		try {
			const list = await env.CACHE.list();
			for (const key of list.keys) {
				await env.CACHE.delete(key.name);
			}
			results.push(`✅ 已清除所有 KV 缓存`);
		} catch (e) {
			results.push(`⚠️ 清除 KV 缓存时出错`);
		}
		
		return new Response(JSON.stringify({
			success: true,
			message: '数据库初始化完成',
			results: results,
			timestamp: new Date().toISOString()
		}, null, 2), {
			headers: { 'Content-Type': 'application/json' }
		});
		
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : '未知错误';
		return new Response(JSON.stringify({
			success: false,
			message: '初始化失败',
			error: errorMessage,
			results: results
		}, null, 2), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
