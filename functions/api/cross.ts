// 交叉聚合页 API - 地区×年份×分类 两两交叉生成聚合页
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

const VIDEO_COLS = 'vod_id, title, cover, category, vod_year, vod_area, vod_actor, vod_director, vod_lang, views, created_at';

function getShards(env: Env): D1Database[] {
  return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

function json(data: any, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...headers }
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // ======== 获取所有可交叉的维度 ========
  if (path === '/api/cross/dimensions') {
    const cacheKey = 'cross:dimensions';
    const cached = await env.CACHE.get(cacheKey);
    if (cached) return json(JSON.parse(cached));

    const shards = getShards(env);
    const results = await Promise.all(shards.map(db => db.prepare(
      `SELECT category, vod_area, vod_year, vod_actor FROM videos WHERE status = 1`
    ).all<{ category: string; vod_area: string; vod_year: string; vod_actor: string }>()));

    const categories = new Set<string>();
    const areas = new Set<string>();
    const years = new Set<string>();
    const actors = new Set<string>();

    for (const r of results) {
      if (r.results) {
        for (const row of r.results) {
          if (row.category) categories.add(row.category);
          if (row.vod_area) areas.add(row.vod_area);
          if (row.vod_year && /^\d{4}$/.test(row.vod_year)) years.add(row.vod_year);
          if (row.vod_actor) {
            row.vod_actor.split(/[,，]/).forEach(a => {
              const t = a.trim();
              if (t.length >= 2 && t.length <= 10) actors.add(t);
            });
          }
        }
      }
    }

    const data = {
      categories: [...categories].sort(),
      areas: [...areas].sort(),
      years: [...years].sort().reverse(),
      actors: [...actors].slice(0, 50).sort()
    };

    await env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: 3600 });
    return json(data);
  }

  // ======== 交叉聚合查询 ========
  // /api/cross?area=美国&year=2024&category=电影&actor=成龙&page=1&limit=24
  if (path === '/api/cross') {
    const area = url.searchParams.get('area') || '';
    const year = url.searchParams.get('year') || '';
    const category = url.searchParams.get('category') || '';
    const actor = url.searchParams.get('actor') || '';
    const director = url.searchParams.get('director') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '24'), 48);

    if (!area && !year && !category && !actor && !director) {
      return json({ success: false, message: '至少选择一个筛选条件' }, 400);
    }

    const cacheKey = `cross:${area}:${year}:${category}:${actor}:${director}:p${page}`;
    const cached = await env.CACHE.get(cacheKey);
    if (cached) return json(JSON.parse(cached));

    const shards = getShards(env);
    const conditions: string[] = ['status = 1'];
    const bindings: any[] = [];

    if (area) { conditions.push('vod_area = ?'); bindings.push(area); }
    if (year) { conditions.push('vod_year = ?'); bindings.push(year); }
    if (category) { conditions.push('category = ?'); bindings.push(category); }
    if (actor) { conditions.push('vod_actor LIKE ?'); bindings.push(`%${actor}%`); }
    if (director) { conditions.push('vod_director LIKE ?'); bindings.push(`%${director}%`); }

    const where = conditions.join(' AND ');
    const sql = `SELECT ${VIDEO_COLS} FROM videos WHERE ${where} ORDER BY created_at DESC LIMIT 500`;

    const results = await Promise.all(shards.map(db => db.prepare(sql).bind(...bindings).all<any>()));
    const allVideos: any[] = [];
    for (const r of results) if (r.results) allVideos.push(...r.results);

    // 去重
    const unique = Array.from(new Map(allVideos.map(v => [v.vod_id, v])).values());
    const total = unique.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paged = unique.slice(offset, offset + limit);

    const data = {
      success: true,
      data: {
        videos: paged,
        filters: { area, year, category, actor, director },
        pagination: { page, limit, total, totalPages }
      }
    };

    await env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: 1800 });
    return json(data);
  }

  // ======== 获取所有交叉组合（用于生成站点地图） ========
  if (path === '/api/cross/sitemap') {
    const cacheKey = 'cross:sitemap';
    const cached = await env.CACHE.get(cacheKey);
    if (cached) return json(JSON.parse(cached));

    const shards = getShards(env);
    const results = await Promise.all(shards.map(db => db.prepare(
      'SELECT category, vod_area, vod_year FROM videos WHERE status = 1'
    ).all<{ category: string; vod_area: string; vod_year: string }>()));

    const catArea = new Set<string>();
    const catYear = new Set<string>();
    const areaYear = new Set<string>();

    for (const r of results) {
      if (r.results) {
        for (const row of r.results) {
          if (row.category && row.vod_area) catArea.add(`${row.category}_${row.vod_area}`);
          if (row.category && row.vod_year) catYear.add(`${row.category}_${row.vod_year}`);
          if (row.vod_area && row.vod_year) areaYear.add(`${row.vod_area}_${row.vod_year}`);
        }
      }
    }

    const data = {
      category_x_area: [...catArea],
      category_x_year: [...catYear],
      area_x_year: [...areaYear]
    };

    await env.CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: 3600 });
    return json(data);
  }

  return json({ success: false, message: 'Not found' }, 404);
};
