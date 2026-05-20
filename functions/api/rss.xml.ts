// RSS Feed API
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

const SITE_URL = 'https://evideos.pages.dev';

function getAllShards(env: Env): D1Database[] {
  return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context;
  
  try {
    // 从所有分片获取最新视频
    const allVideos: any[] = [];
    const shards = getAllShards(env);
    
    for (const db of shards) {
      const result = await db.prepare(
        'SELECT vod_id, title, category, vod_year, cover, updated_at FROM videos WHERE status = 1 ORDER BY updated_at DESC LIMIT 100'
      ).all();
      if (result.results) allVideos.push(...result.results);
    }
    
    // 按更新时间排序，取前50
    const videos = allVideos
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, 50);
    
    const items = videos.map(v => `
    <item>
      <title><![CDATA[${v.title}]]></title>
      <link>${SITE_URL}/v/${v.vod_id}</link>
      <description><![CDATA[${v.category || '视频'}${v.vod_year ? ' · ' + v.vod_year + '年' : ''} - 在线观看]]></description>
      <pubDate>${new Date(v.updated_at * 1000).toUTCString()}</pubDate>
      <guid isPermaLink="true">${SITE_URL}/v/${v.vod_id}</guid>
    </item>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>必爱必爱 - 最新更新</title>
    <link>${SITE_URL}</link>
    <description>最新高清电影、电视剧、综艺、动漫在线观看</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;
    
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      }
    });
    
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
};
