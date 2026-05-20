// Video Sitemap - Google 视频搜索专用格式
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

const SITE_URL = 'https://vvideos.pages.dev';

function getAllShards(env: Env): D1Database[] {
  return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context;
  
  try {
    const shards = getAllShards(env);
    const allVideos: any[] = [];
    
    for (const db of shards) {
      const result = await db.prepare(
        `SELECT vod_id, title, category, cover, play_url, vod_year, vod_area, vod_actor, vod_director, updated_at 
         FROM videos WHERE status = 1 ORDER BY updated_at DESC LIMIT 2000`
      ).all();
      if (result.results) allVideos.push(...result.results);
    }
    
    // 按更新时间排序
    const videos = allVideos.sort((a, b) => b.updated_at - a.updated_at);
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
    xml += '        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n';
    
    for (const v of videos) {
      const pageUrl = `${SITE_URL}/v/${v.vod_id}`;
      const lastmod = new Date(v.updated_at * 1000).toISOString().split('T')[0];
      
      // 从 play_url 提取第一个视频地址作为缩略图/预览
      const firstPlayUrl = v.play_url ? v.play_url.split('#')[0].split('$').pop() : '';
      
      xml += '  <url>\n';
      xml += `    <loc>${pageUrl}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <video:video>\n`;
      xml += `      <video:title>${escapeXml(v.title)}</video:title>\n`;
      xml += `      <video:description>${escapeXml(`${v.category || ''}${v.vod_year ? ' · ' + v.vod_year + '年' : ''}${v.vod_area ? ' · ' + v.vod_area : ''}在线观看`)}</video:description>\n`;
      if (v.cover) {
        xml += `      <video:thumbnail_loc>${escapeXml(v.cover)}</video:thumbnail_loc>\n`;
      }
      if (firstPlayUrl) {
        xml += `      <video:content_loc>${escapeXml(firstPlayUrl)}</video:content_loc>\n`;
      }
      xml += `      <video:player_loc>${pageUrl}</video:player_loc>\n`;
      if (v.vod_year) {
        xml += `      <video:publication_date>${v.vod_year}-01-01</video:publication_date>\n`;
      }
      if (v.category) {
        xml += `      <video:tag>${escapeXml(v.category)}</video:tag>\n`;
      }
      xml += `      <video:family_friendly>yes</video:family_friendly>\n`;
      xml += `    </video:video>\n`;
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
