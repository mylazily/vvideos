// TAG标签搜索API
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

function getAllShards(env: Env): D1Database[] {
  return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
    });
  }
  
  const tagName = url.searchParams.get('name') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1);
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '24') || 24), 48);
  
  if (!tagName) {
    return jsonResponse({ success: false, message: '缺少标签名称' }, 400);
  }
  
  const cacheKey = `tag:${tagName}:p${page}:l${limit}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) return jsonResponse(JSON.parse(cached));
  
  const shards = getAllShards(env);
  const offset = (page - 1) * limit;
  
  try {
    // 构建搜索条件 - 在多个字段中搜索
    const searchPattern = `%${tagName}%`;
    
    // 从所有分片并行获取数据
    const results = await Promise.all(shards.map(db =>
      db.prepare(
        `SELECT vod_id, title, cover, category, vod_year, vod_area, vod_actor, vod_director, vod_lang, views, created_at 
         FROM videos 
         WHERE status = 1 AND (
           title LIKE ? OR 
           category LIKE ? OR 
           vod_area LIKE ? OR 
           vod_actor LIKE ? OR 
           vod_director LIKE ? OR
           vod_lang LIKE ?
         )
         ORDER BY created_at DESC`
      ).bind(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern).all<any>()
    ));
    
    const allVideos: any[] = [];
    for (const result of results) {
      if (result.results) {
        allVideos.push(...result.results);
      }
    }
    
    // 去重
    const uniqueVideos = Array.from(new Map(allVideos.map(v => [v.vod_id, v])).values());
    
    // 分页
    const total = uniqueVideos.length;
    const totalPages = Math.ceil(total / limit);
    const pagedVideos = uniqueVideos.slice(offset, offset + limit);
    
    const responseData = { success: true, data: { videos: pagedVideos, pagination: { page, limit, total, totalPages } } };
    await env.CACHE.put(cacheKey, JSON.stringify(responseData), { expirationTtl: 1800 });
    return jsonResponse(responseData);
    
  } catch (err: any) {
    return jsonResponse({ success: false, message: err.message }, 500);
  }
};
