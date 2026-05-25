// 测试首页API - 不使用caches
export interface Env {
	DB_0: D1Database; DB_1: D1Database; DB_2: D1Database; DB_3: D1Database; DB_4: D1Database;
	DB_5: D1Database; DB_6: D1Database; DB_7: D1Database; DB_8: D1Database; DB_9: D1Database;
}

function getAllShards(env: Env): D1Database[] {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

export const onRequest = async (context: { request: Request; env: Env }) => {
	const { env } = context;
	
	try {
		const shards = getAllShards(env);
		const shardResults = await Promise.all(
			shards.map(db =>
				db.prepare(
					'SELECT id, vod_id, title, cover, category, views, vod_year, vod_remarks FROM videos WHERE status = 1 ORDER BY created_at DESC LIMIT 10'
				).all().then(r => (r.results as any[]) || [])
			)
		);
		
		const seen = new Set<string>();
		const allVideos = shardResults.flat().filter(v => {
			if (seen.has(v.vod_id)) return false;
			seen.add(v.vod_id);
			return true;
		});
		
		const latest = allVideos
			.sort((a, b) => b.created_at - a.created_at)
			.slice(0, 24);
		
		const hot = allVideos
			.sort((a, b) => b.views - a.views)
			.slice(0, 12);
		
		return new Response(JSON.stringify({ success: true, data: { latest, hot } }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (e: any) {
		return new Response(JSON.stringify({ success: false, error: e.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
