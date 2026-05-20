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

interface VideoRow {
  id: number;
  vod_id: string;
  title: string;
  name: string | null;
  cover: string;
  category: string;
  duration: string;
  description: string | null;
  play_url: string | null;
  status: number;
  views: number;
  created_at: number;
  updated_at: number;
  vod_year: string;
  vod_area: string;
  vod_director: string;
  vod_actor: string;
  vod_remarks: string;
}

const VIDEO_COLS = 'id, vod_id, title, name, cover, category, duration, description, play_url, status, views, created_at, updated_at, vod_year, vod_area, vod_director, vod_actor, vod_remarks';

function getShard(vodId: string, env: Env): D1Database {
  const hash = vodId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const shards = [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
  return shards[hash % 10];
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function xmlResponse(xml: string, status = 200) {
  return new Response(xml, {
    status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const ac = url.searchParams.get('ac') || 'list';
  const at = url.searchParams.get('at') || 'json';
  const t = url.searchParams.get('t') || '';
  const pg = parseInt(url.searchParams.get('pg') || '1');
  const limit = 20;
  const offset = (pg - 1) * limit;

  try {
    // ======== 视频列表接口 ========
    if (path === '/api.php/provide/vod/' && ac === 'list') {
      const where = t ? 'WHERE status = 1 AND category = ?' : 'WHERE status = 1';
      const params = t ? [t] : [];
      
      const [videoResult, countResult] = await Promise.all([
        env.DB_0.prepare(`SELECT id, vod_id, title, cover, category, duration, views, created_at FROM videos ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all<VideoRow>(),
        env.DB_0.prepare(`SELECT COUNT(*) as total FROM videos ${where}`).bind(...params).first<{ total: number }>()
      ]);

      const videos = videoResult.results || [];
      const total = countResult?.total || 0;
      const pagecount = Math.ceil(total / limit);

      // 获取分类列表
      const catResult = await env.DB_0.prepare('SELECT DISTINCT category as type_name FROM videos WHERE status = 1 LIMIT 50').all<{ type_name: string }>();
      const classList = (catResult.results || []).map((c, i) => ({ type_id: i + 1, type_name: c.type_name }));

      if (at === 'xml') {
        let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
        xml += `<rss version="5.1"><list page="${pg}" pagecount="${pagecount}" pagesize="${limit}" recordcount="${total}">\n`;
        for (const v of videos) {
          xml += `  <video>\n`;
          xml += `    <id>${v.id}</id>\n`;
          xml += `    <tid>1</tid>\n`;
          xml += `    <name><![CDATA[${v.title}]]></name>\n`;
          xml += `    <type>${v.category}</type>\n`;
          xml += `    <pic>${v.cover}</pic>\n`;
          xml += `    <note>${v.duration}</note>\n`;
          xml += `    <last>${new Date(v.created_at * 1000).toISOString()}</last>\n`;
          xml += `  </video>\n`;
        }
        xml += '</list>\n<class>\n';
        for (const c of classList) {
          xml += `  <ty id="${c.type_id}">${c.type_name}</ty>\n`;
        }
        xml += '</class>\n</rss>';
        return xmlResponse(xml);
      }

      // JSON 格式
      return jsonResponse({
        code: 1,
        msg: '数据列表',
        page: pg,
        pagecount: pagecount,
        limit: limit,
        total: total,
        list: videos.map(v => ({
          vod_id: v.id,
          vod_name: v.title,
          type_id: 1,
          type_name: v.category,
          vod_pic: v.cover,
          vod_remarks: v.duration,
          vod_time: new Date(v.created_at * 1000).toISOString()
        })),
        class: classList
      });
    }

    // ======== 视频详情接口 ========
    if (path === '/api.php/provide/vod/' && (ac === 'detail' || ac === 'videolist')) {
      const ids = url.searchParams.get('ids') || '';
      if (!ids) {
        return jsonResponse({ code: 0, msg: '缺少ids参数' }, 400);
      }

      const idList = ids.split(',').slice(0, 100);
      const videos: VideoRow[] = [];

      for (const id of idList) {
        const shard = getShard(id, env);
        const v = await shard.prepare('SELECT * FROM videos WHERE vod_id = ? AND status = 1').bind(id).first<VideoRow>();
        if (v) videos.push(v);
      }

      if (at === 'xml') {
        let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
        xml += '<rss version="5.1"><list page="1" pagecount="1" pagesize="20" recordcount="' + videos.length + '">\n';
        for (const v of videos) {
          xml += `  <video>\n`;
          xml += `    <id>${v.id}</id>\n`;
          xml += `    <tid>1</tid>\n`;
          xml += `    <name><![CDATA[${v.title}]]></name>\n`;
          xml += `    <type>${v.category}</type>\n`;
          xml += `    <pic>${v.cover}</pic>\n`;
          xml += `    <year>${v.vod_year}</year>\n`;
          xml += `    <area>${v.vod_area}</area>\n`;
          xml += `    <actor><![CDATA[${v.vod_actor}]]></actor>\n`;
          xml += `    <director><![CDATA[${v.vod_director}]]></director>\n`;
          xml += `    <des><![CDATA[${v.description || ''}]]></des>\n`;
          xml += `    <dl><dd flag="m3u8"><![CDATA[${v.play_url || ''}]]></dd></dl>\n`;
          xml += `  </video>\n`;
        }
        xml += '</list></rss>';
        return xmlResponse(xml);
      }

      return jsonResponse({
        code: 1,
        msg: '数据列表',
        page: 1,
        pagecount: 1,
        limit: 20,
        total: videos.length,
        list: videos.map(v => ({
          vod_id: v.vod_id,
          vod_name: v.title,
          type_id: 1,
          type_name: v.category,
          vod_pic: v.cover,
          vod_year: v.vod_year,
          vod_area: v.vod_area,
          vod_actor: v.vod_actor,
          vod_director: v.vod_director,
          vod_content: v.description,
          vod_play_from: 'm3u8',
          vod_play_url: v.play_url,
          dl: { m3u8: v.play_url }
        }))
      });
    }

    return jsonResponse({ code: 0, msg: '接口不存在' }, 404);
  } catch (err: any) {
    return jsonResponse({ code: 0, msg: err.message || '服务器错误' }, 500);
  }
};
