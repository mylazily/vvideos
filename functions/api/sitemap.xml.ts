// 生成站点地图
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
}

const BASE_URL = 'https://vvideos.pages.dev';

function getAllShards(env: Env): D1Database[] {
  return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

async function getAllVideoUrls(env: Env): Promise<{ loc: string; lastmod: string; priority: string }[]> {
  const urls: { loc: string; lastmod: string; priority: string }[] = [];
  const shards = getAllShards(env);
  
  for (const db of shards) {
    try {
      const result = await db.prepare(
        'SELECT vod_id, updated_at FROM videos WHERE status = 1 ORDER BY updated_at DESC LIMIT 5000'
      ).all<{ vod_id: string; updated_at: number }>();
      
      if (result.results) {
        for (const row of result.results) {
          urls.push({
            loc: `${BASE_URL}/v/${row.vod_id}`,
            lastmod: new Date(row.updated_at * 1000).toISOString().split('T')[0],
            priority: '0.8'
          });
        }
      }
    } catch (e) {
      console.error('Shard query error:', e);
    }
  }
  
  return urls;
}

async function getCategoryUrls(env: Env): Promise<{ loc: string; lastmod: string; priority: string }[]> {
  const urls: { loc: string; lastmod: string; priority: string }[] = [];
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const result = await env.DB_0.prepare(
      'SELECT DISTINCT category FROM videos WHERE status = 1'
    ).all<{ category: string }>();
    
    if (result.results) {
      for (const row of result.results) {
        urls.push({
          loc: `${BASE_URL}/category?cat=${encodeURIComponent(row.category)}`,
          lastmod: today,
          priority: '0.6'
        });
      }
    }
  } catch (e) {
    console.error('Category query error:', e);
  }
  
  return urls;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context;
  
  try {
    // 获取所有URL
    const videoUrls = await getAllVideoUrls(env);
    const categoryUrls = await getCategoryUrls(env);
    const today = new Date().toISOString().split('T')[0];
    
    // 静态页面
    const staticUrls = [
      { loc: BASE_URL, lastmod: today, priority: '1.0' },
      { loc: `${BASE_URL}/category`, lastmod: today, priority: '0.9' },
      { loc: `${BASE_URL}/search`, lastmod: today, priority: '0.7' },
      { loc: `${BASE_URL}/rank`, lastmod: today, priority: '0.6' },
      { loc: `${BASE_URL}/discover`, lastmod: today, priority: '0.6' }
    ];
    
    const allUrls = [...staticUrls, ...categoryUrls, ...videoUrls];
    
    // 生成XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    for (const url of allUrls) {
      xml += '  <url>\n';
      xml += `    <loc>${url.loc}</loc>\n`;
      xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
      xml += `    <priority>${url.priority}</priority>\n`;
      xml += '  </url>\n';
    }
    
    xml += '</urlset>';
    
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600'
      }
    });
    
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
};
