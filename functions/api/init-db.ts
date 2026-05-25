// 数据库初始化脚本 - 清除旧数据，添加光速资源站
// 使用方法：在 Cloudflare Dashboard -> Workers & Pages -> 你的项目 -> 触发器 -> Cron Triggers 中设置一次执行
// 或通过 Wrangler: wrangler d1 execute vvideos --file=./functions/api/init-db.sql

export interface Env {
	DB_0: D1Database; DB_1: D1Database; DB_2: D1Database; DB_3: D1Database; DB_4: D1Database;
	DB_5: D1Database; DB_6: D1Database; DB_7: D1Database; DB_8: D1Database; DB_9: D1Database;
	CACHE: KVNamespace;
}

function getAllShards(env: Env): D1Database[] {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

export const onRequest: PagesFunction<Env> = async (context) => {
	const { env } = context;
	
	const results: string[] = [];
	
	try {
		// 1. 清除所有视频数据（从所有分片）
		const shards = getAllShards(env);
		let totalDeleted = 0;
		
		for (const db of shards) {
			const result = await db.prepare('DELETE FROM videos').run();
			totalDeleted += result.meta.changes || 0;
		}
		results.push(`✅ 已清除所有视频数据，共删除 ${totalDeleted} 条`);
		
		// 2. 清除所有资源站
		const sourcesDeleted = await env.DB_0.prepare('DELETE FROM sources').run();
		results.push(`✅ 已清除所有资源站，共删除 ${sourcesDeleted.meta.changes || 0} 条`);
		
		// 3. 清除采集日志
		const logsDeleted = await env.DB_0.prepare('DELETE FROM collect_logs').run();
		results.push(`✅ 已清除采集日志，共删除 ${logsDeleted.meta.changes || 0} 条`);
		
		// 4. 清除 KV 缓存中的视频数据
		try {
			const list = await env.CACHE.list({ prefix: 'video:' });
			for (const key of list.keys) {
				await env.CACHE.delete(key.name);
			}
			results.push(`✅ 已清除 KV 缓存中的视频数据`);
		} catch (e) {
			results.push(`⚠️ 清除 KV 缓存时出错（可能没有缓存数据）`);
		}
		
		// 5. 添加光速资源站
		const now = Math.floor(Date.now() / 1000);
		await env.DB_0.prepare(`
			INSERT INTO sources (name, alias, api_url, status, last_collect_at, total_videos, created_at)
			VALUES (?, ?, ?, 1, 0, 0, ?)
		`).bind('①线', '光速', 'https://api.guangsuapi.com/api.php/provide/vod/from/gsm3u8/', now).run();
		
		results.push(`✅ 已添加光速资源站`);
		results.push(`   - 名称：①线`);
		results.push(`   - 别名：光速`);
		results.push(`   - API地址：https://api.guangsuapi.com/api.php/provide/vod/from/gsm3u8/`);
		
		// 6. 清除 API 缓存（强制重新获取最新数据）
		try {
			const cacheList = await caches.keys();
			for (const cacheName of cacheList) {
				if (cacheName.includes('api-') || cacheName.includes('api-cache')) {
					const cache = await caches.open(cacheName);
					// 清除与视频相关的缓存
					const keys = await cache.keys();
					for (const key of keys) {
						if (key.url.includes('/api/')) {
							await cache.delete(key);
						}
					}
				}
			}
			results.push(`✅ 已清除 API 缓存`);
		} catch (e) {
			results.push(`⚠️ 清除 API 缓存时出错`);
		}
		
		return new Response(JSON.stringify({
			success: true,
			message: '数据库初始化完成',
			results: results
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
