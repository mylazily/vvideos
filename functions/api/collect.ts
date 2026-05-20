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

interface VideoData {
  vod_id?: string;
  vod_name: string;
  type_name: string;
  vod_pic: string;
  vod_year?: string;
  vod_area?: string;
  vod_actor?: string;
  vod_director?: string;
  vod_content?: string;
  vod_play_url: string;
  vod_remarks?: string;
}

function getShard(vodId: string, env: Env): D1Database {
  const hash = vodId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const shards = [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
  return shards[hash % 10];
}

function generateVodId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
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

// 从第三方资源站采集
async function collectFromSource(sourceUrl: string, page = 1, env: Env): Promise<{ success: number; fail: number; videos: VideoData[] }> {
  const result = { success: 0, fail: 0, videos: [] as VideoData[] };
  
  try {
    // 获取列表
    const listUrl = sourceUrl + (sourceUrl.includes('?') ? '&' : '?') + 'ac=list&pg=' + page;
    const listRes = await fetch(listUrl, { signal: AbortSignal.timeout(30000) });
    if (!listRes.ok) throw new Error('获取列表失败');
    
    const listData = await listRes.json();
    if (!listData.list || listData.list.length === 0) return result;
    
    // 获取详情
    const ids = listData.list.map((v: any) => v.vod_id).join(',');
    const detailUrl = sourceUrl + (sourceUrl.includes('?') ? '&' : '?') + 'ac=detail&ids=' + ids;
    const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(60000) });
    if (!detailRes.ok) throw new Error('获取详情失败');
    
    const detailData = await detailRes.json();
    if (!detailData.list) return result;
    
    for (const v of detailData.list) {
      if (!v.vod_play_url) continue;
      
      const video: VideoData = {
        vod_id: v.vod_id?.toString(),
        vod_name: v.vod_name || v.title || '',
        type_name: v.type_name || v.category || '其他',
        vod_pic: v.vod_pic || v.cover || '',
        vod_year: v.vod_year || '',
        vod_area: v.vod_area || '',
        vod_actor: v.vod_actor || '',
        vod_director: v.vod_director || '',
        vod_content: v.vod_content || v.description || '',
        vod_play_url: v.vod_play_url,
        vod_remarks: v.vod_remarks || ''
      };
      
      result.videos.push(video);
    }
    
    return result;
  } catch (e: any) {
    console.error('采集失败:', e.message);
    return result;
  }
}

// 入库
async function saveVideo(video: VideoData, env: Env): Promise<boolean> {
  try {
    const vodId = video.vod_id || generateVodId();
    const shard = getShard(vodId, env);
    
    // 检查是否已存在
    const existing = await shard.prepare('SELECT id FROM videos WHERE vod_id = ?').bind(vodId).first<{ id: number }>();
    if (existing) {
      // 更新
      await shard.prepare(
        'UPDATE videos SET title = ?, category = ?, cover = ?, play_url = ?, vod_year = ?, vod_area = ?, vod_actor = ?, vod_director = ?, description = ?, vod_remarks = ?, updated_at = ? WHERE vod_id = ?'
      ).bind(
        video.vod_name, video.type_name, video.vod_pic, video.vod_play_url,
        video.vod_year, video.vod_area, video.vod_actor, video.vod_director,
        video.vod_content, video.vod_remarks, Math.floor(Date.now() / 1000), vodId
      ).run();
    } else {
      // 插入
      await shard.prepare(
        'INSERT INTO videos (vod_id, title, category, cover, play_url, vod_year, vod_area, vod_actor, vod_director, description, vod_remarks, status, views, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)'
      ).bind(
        vodId, video.vod_name, video.type_name, video.vod_pic, video.vod_play_url,
        video.vod_year, video.vod_area, video.vod_actor, video.vod_director,
        video.vod_content, video.vod_remarks,
        Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)
      ).run();
    }
    
    return true;
  } catch (e) {
    console.error('入库失败:', e);
    return false;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  
  if (request.method !== 'POST') {
    return jsonResponse({ code: 0, msg: '只支持POST请求' }, 405);
  }
  
  try {
    const body = await request.json<{ source_url?: string; pages?: number }>();
    const sourceUrl = body.source_url;
    const pages = body.pages || 1;
    
    if (!sourceUrl) {
      return jsonResponse({ code: 0, msg: '缺少source_url' }, 400);
    }
    
    const result = { total: 0, success: 0, fail: 0 };
    
    for (let page = 1; page <= pages; page++) {
      const collectResult = await collectFromSource(sourceUrl, page, env);
      result.total += collectResult.videos.length;
      
      for (const video of collectResult.videos) {
        const saved = await saveVideo(video, env);
        if (saved) {
          result.success++;
        } else {
          result.fail++;
        }
      }
      
      // 避免请求过快
      if (page < pages) await new Promise(r => setTimeout(r, 1000));
    }
    
    return jsonResponse({
      code: 1,
      msg: '采集完成',
      data: result
    });
    
  } catch (err: any) {
    return jsonResponse({ code: 0, msg: err.message || '采集失败' }, 500);
  }
};
