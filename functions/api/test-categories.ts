// 测试分类API - 简化版
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
		// 获取所有启用的资源站
		const sourcesResult = await env.DB_0.prepare(
			'SELECT id, name, alias FROM sources WHERE status = 1 ORDER BY name'
		).all();
		const sources = (sourcesResult.results as any[]) || [];
		
		if (sources.length === 0) {
			return new Response(JSON.stringify({ success: true, data: [], sources: [] }), {
				headers: { 'Content-Type': 'application/json' }
			});
		}
		
		// 为每个资源站获取其分类
		const sourceCategories = await Promise.all(
			sources.map(async (source) => {
				const shards = getAllShards(env);
				const categoryResults = await Promise.all(
					shards.map(db =>
						db.prepare('SELECT DISTINCT category FROM videos WHERE source_id = ? AND status = 1 AND category != ""')
							.bind(source.id)
							.all()
							.then(r => ((r.results as any[]) || []).map(row => row.category))
					)
				);
				const categories = [...new Set(categoryResults.flat())].sort();
				return {
					id: source.id,
					name: source.name,
					alias: source.alias,
					categories
				};
			})
		);
		
		const allCategories = [...new Set(sourceCategories.flatMap(s => s.categories))].sort();
		
		return new Response(JSON.stringify({
			success: true,
			data: allCategories,
			sources: sourceCategories.filter(s => s.categories.length > 0)
		}), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (e: any) {
		return new Response(JSON.stringify({ success: false, error: e.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
