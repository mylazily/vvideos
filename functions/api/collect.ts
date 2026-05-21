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
  vod_play_url: string;
  vod_remarks?: string;
  vod_lang?: string;
  duration?: number; // 从URL提取的时长（秒）
}

// 简单的字符串哈希（FNV-1a变体）
function fnv1aHash(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// 标准化标题（用于生成指纹）
function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/\s+/g, '')
    .replace(/(\d{3,4}[Pp]|HD|BD|UHD|4K|1080|720|蓝光|高清|超清|标清|DVD|TS|TC|CAM|枪版)/gi, '')
    .replace(/(国语|粤语|英语|日语|韩语|中字|中英双字|双语|版)/g, '')
    .replace(/(全\d+集|共\d+集|\d+集全)/g, '')
    .replace(/[\[\(（【]\d{4}[\]\)）】]/g, '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .toLowerCase()
    .replace(/^\d+/, '');
}

// 生成视频指纹
function generateFingerprint(title: string, year: string, category: string): string {
  const normalized = normalizeTitle(title);
  const content = `${normalized}|${year || ''}|${category || ''}`;
  return fnv1aHash(content);
}

// 从播放URL提取时长
function extractDuration(url: string): number {
  const match = url.match(/[?&]duration=(\d+)/i);
  if (match) return parseInt(match[1]);
  const fileMatch = url.match(/_(\d+)[s秒]/i);
  if (fileMatch) return parseInt(fileMatch[1]);
  return 0;
}

function getShard(vodId: string, env: Env): D1Database {
  const hash = fnv1aHash(vodId);
  const hashNum = parseInt(hash.slice(0, 8), 16);
  const shards = [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
  return shards[hashNum % 10];
}

function generateVodId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `${timestamp}${random}`;
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
    // URL安全检查
    const urlObj = new URL(sourceUrl);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('不支持的协议');
    }
    
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
        vod_play_url: v.vod_play_url,
        vod_remarks: v.vod_remarks || '',
        vod_lang: v.vod_lang || '',
        duration: extractDuration(v.vod_play_url)
      };
      
      result.videos.push(video);
    }
    
    return result;
  } catch (e: any) {
    console.error('采集失败:', e.message);
    return result;
  }
}

// 查找或创建指纹记录
async function findOrCreateFingerprint(
  video: VideoData, 
  env: Env
): Promise<{ fingerprintId: number; mainVodId: string; isNew: boolean }> {
  const fingerprint = generateFingerprint(video.vod_name, video.vod_year || '', video.type_name);
  const titleNormalized = normalizeTitle(video.vod_name);
  
  // 检查是否已存在
  const existing = await env.DB_0.prepare(
    'SELECT id, main_vod_id FROM video_fingerprints WHERE fingerprint = ?'
  ).bind(fingerprint).first<{ id: number; main_vod_id: string }>();
  
  if (existing) {
    return { fingerprintId: existing.id, mainVodId: existing.main_vod_id, isNew: false };
  }
  
  // 创建新指纹
  const vodId = generateVodId();
  const result = await env.DB_0.prepare(
    'INSERT INTO video_fingerprints (fingerprint, title_normalized, vod_year, category, main_vod_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    fingerprint, titleNormalized, video.vod_year || '', video.type_name, vodId, Math.floor(Date.now() / 1000)
  ).run();
  
  return { fingerprintId: result.meta.last_row_id, mainVodId: vodId, isNew: true };
}

// 检测广告段（基于多源时长对比）
function detectAdSegments(durations: number[]): string {
  const validDurations = durations.filter(d => d > 0);
  if (validDurations.length < 2) return '';
  
  const minDuration = Math.min(...validDurations);
  const maxDuration = Math.max(...validDurations);
  
  // 时长差异小于5秒，认为无广告
  if (maxDuration - minDuration < 5) return '';
  
  const adSegments: Array<{start: number, end: number, type: string}> = [];
  
  // 简单策略：最短时长为基准，其他源的额外时长视为广告
  // 这里假设广告在开头或结尾
  const avgExtra = (maxDuration - minDuration) / 2;
  
  if (avgExtra > 5) {
    // 假设有前贴广告
    adSegments.push({ start: 0, end: Math.floor(avgExtra), type: 'pre' });
  }
  
  return JSON.stringify(adSegments);
}

// 入库（支持多源合并）
async function saveVideo(video: VideoData, sourceId: number, env: Env): Promise<{ success: boolean; isNew: boolean }> {
  try {
    // 1. 查找或创建指纹
    const { fingerprintId, mainVodId, isNew: isNewFingerprint } = await findOrCreateFingerprint(video, env);
    
    // 2. 获取主视频信息
    const shard = getShard(mainVodId, env);
    const existing = await shard.prepare(
      'SELECT id, play_url_1, play_url_2, play_url_3, play_url_4, play_url_5, duration_1, duration_2, duration_3, duration_4, duration_5 FROM videos WHERE vod_id = ?'
    ).bind(mainVodId).first<{
      id: number;
      play_url_1: string; play_url_2: string; play_url_3: string; play_url_4: string; play_url_5: string;
      duration_1: number; duration_2: number; duration_3: number; duration_4: number; duration_5: number;
    }>();
    
    const now = Math.floor(Date.now() / 1000);
    
    if (existing) {
      // 更新：添加新源或更新现有源
      const urls = [existing.play_url_1, existing.play_url_2, existing.play_url_3, existing.play_url_4, existing.play_url_5];
      const durations = [existing.duration_1, existing.duration_2, existing.duration_3, existing.duration_4, existing.duration_5];
      
      // 查找空位或相同源的URL
      let slotIndex = urls.findIndex(u => !u || u === video.vod_play_url);
      if (slotIndex === -1) slotIndex = 0; // 如果没有空位，覆盖第一个
      
      // 更新对应槽位
      const urlCol = `play_url_${slotIndex + 1}`;
      const durationCol = `duration_${slotIndex + 1}`;
      durations[slotIndex] = video.duration || 0;
      
      // 重新计算广告段
      const adSegments = detectAdSegments(durations);
      
      await shard.prepare(
        `UPDATE videos SET ${urlCol} = ?, ${durationCol} = ?, ad_segments = ?, updated_at = ? WHERE vod_id = ?`
      ).bind(video.vod_play_url, video.duration || 0, adSegments, now, mainVodId).run();
      
      return { success: true, isNew: false };
    } else {
      // 插入新视频
      const adSegments = detectAdSegments([video.duration || 0]);
      
      await shard.prepare(
        'INSERT INTO videos (vod_id, fingerprint_id, title, title_normalized, category, cover, play_url_1, duration_1, ad_segments, vod_year, vod_area, vod_actor, vod_director, vod_remarks, vod_lang, status, views, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)'
      ).bind(
        mainVodId, fingerprintId, video.vod_name, normalizeTitle(video.vod_name), video.type_name, video.vod_pic,
        video.vod_play_url, video.duration || 0, adSegments,
        video.vod_year || '', video.vod_area || '', video.vod_actor || '', video.vod_director || '',
        video.vod_remarks || '', video.vod_lang || '', now, now
      ).run();
      
      return { success: true, isNew: true };
    }
  } catch (e) {
    console.error('入库失败:', e);
    return { success: false, isNew: false };
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  if (request.method !== 'POST') {
    return jsonResponse({ code: 0, msg: '只支持POST请求' }, 405);
  }
  
  try {
    const body = await request.json<{ source_url?: string; pages?: number; source_id?: number }>();
    const sourceUrl = body.source_url;
    const pages = body.pages || 1;
    const sourceId = body.source_id || 0;
    
    if (!sourceUrl) {
      return jsonResponse({ code: 0, msg: '缺少source_url' }, 400);
    }
    
    const result = { total: 0, new: 0, merged: 0, fail: 0 };
    
    for (let page = 1; page <= pages; page++) {
      const collectResult = await collectFromSource(sourceUrl, page, env);
      result.total += collectResult.videos.length;
      
      for (const video of collectResult.videos) {
        const saved = await saveVideo(video, sourceId, env);
        if (saved.success) {
          if (saved.isNew) {
            result.new++;
          } else {
            result.merged++;
          }
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
