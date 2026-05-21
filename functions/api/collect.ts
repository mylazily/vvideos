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
  duration?: number;
}

interface CollectOptions {
  sourceUrl: string;
  sourceId: number;
  env: Env;
  mode: 'full' | 'single';
  pages?: number;
  signal?: AbortSignal;
}

interface CollectResult {
  total: number;
  new: number;
  merged: number;
  fail: number;
  pagesCollected: number;
  totalPages: number;
}

function fnv1aHash(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

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

function generateFingerprint(title: string, year: string, category: string): string {
  return fnv1aHash(`${normalizeTitle(title)}|${year || ''}|${category || ''}`);
}

function extractDuration(url: string): number {
  const match = url.match(/[?&]duration=(\d+)/i);
  if (match) return parseInt(match[1]);
  const fileMatch = url.match(/_(\d+)[s秒]/i);
  if (fileMatch) return parseInt(fileMatch[1]);
  return 0;
}

function getShard(vodId: string, env: Env): D1Database {
  const hashNum = parseInt(fnv1aHash(vodId).slice(0, 8), 16);
  const shards = [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
  return shards[hashNum % 10];
}

function generateVodId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function isPrivateUrl(urlStr: string): boolean {
  try {
    const urlObj = new URL(urlStr);
    const hostname = urlObj.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(urlObj.protocol)) return true;
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
      const parts = hostname.split('.').map(Number);
      if (parts[0] === 127) return true;
      if (parts[0] === 10) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
      if (parts[0] === 169 && parts[1] === 254) return true;
      if (parts[0] === 0) return true;
    }
    if (hostname === 'localhost' || hostname === 'localhost.localdomain') return true;
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;
    if (hostname === '::1' || hostname === '[::1]') return true;
    if (hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) return true;
    return false;
  } catch { return true; }
}

async function verifyAdminToken(request: Request, env: Env): Promise<boolean> {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  if (!token) return false;
  return !!(await env.CACHE.get(`admin_token:${token}`));
}

async function collectPageList(sourceUrl: string, page: number, signal?: AbortSignal): Promise<{ totalPages: number; videoIds: string[] }> {
  const listUrl = sourceUrl + (sourceUrl.includes('?') ? '&' : '?') + `ac=list&pg=${page}`;
  if (isPrivateUrl(listUrl)) throw new Error('不允许访问内网地址');
  const listRes = await fetch(listUrl, { signal: signal || AbortSignal.timeout(30000) });
  if (!listRes.ok) throw new Error(`获取列表失败(${listRes.status})`);
  const listData = await listRes.json();
  if (!listData.list || listData.list.length === 0) return { totalPages: 1, videoIds: [] };

  let totalPages = 1;
  if (listData.pagecount) {
    totalPages = parseInt(listData.pagecount) || 1;
  } else if (listData.total && listData.limit) {
    totalPages = Math.ceil(listData.total / listData.limit);
  } else if (listData.page) {
    totalPages = parseInt(listData.page) || 1;
  }

  const videoIds = listData.list.map((v: any) => v.vod_id).filter(Boolean);
  return { totalPages, videoIds };
}

async function collectPageDetails(sourceUrl: string, ids: string[], signal?: AbortSignal): Promise<VideoData[]> {
  if (ids.length === 0) return [];
  const detailUrl = sourceUrl + (sourceUrl.includes('?') ? '&' : '?') + `ac=detail&ids=${ids.slice(0, 100).join(',')}`;
  if (isPrivateUrl(detailUrl)) throw new Error('不允许访问内网地址');
  const detailRes = await fetch(detailUrl, { signal: signal || AbortSignal.timeout(60000) });
  if (!detailRes.ok) throw new Error(`获取详情失败(${detailRes.status})`);
  const detailData = await detailRes.json();
  if (!detailData.list) return [];

  return detailData.list
    .filter((v: any) => v.vod_play_url)
    .map((v: any) => ({
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
    }));
}

async function findOrCreateFingerprint(video: VideoData, env: Env): Promise<{ fingerprintId: number; mainVodId: string; isNew: boolean }> {
  const fingerprint = generateFingerprint(video.vod_name, video.vod_year || '', video.type_name);
  const titleNormalized = normalizeTitle(video.vod_name);
  const existing = await env.DB_0.prepare('SELECT id, main_vod_id FROM video_fingerprints WHERE fingerprint = ?').bind(fingerprint).first<{ id: number; main_vod_id: string }>();
  if (existing) return { fingerprintId: existing.id, mainVodId: existing.main_vod_id, isNew: false };
  const vodId = generateVodId();
  const result = await env.DB_0.prepare('INSERT INTO video_fingerprints (fingerprint, title_normalized, vod_year, category, main_vod_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(fingerprint, titleNormalized, video.vod_year || '', video.type_name, vodId, Math.floor(Date.now() / 1000)).run();
  return { fingerprintId: result.meta.last_row_id, mainVodId: vodId, isNew: true };
}

function detectAdSegments(durations: number[]): string {
  const valid = durations.filter(d => d > 0);
  if (valid.length < 2) return '';
  const minDuration = Math.min(...valid);
  const maxDuration = Math.max(...valid);
  if (maxDuration - minDuration < 5) return '';
  const avgExtra = (maxDuration - minDuration) / 2;
  if (avgExtra > 5) return JSON.stringify([{ start: 0, end: Math.floor(avgExtra), type: 'pre' }]);
  return '';
}

async function saveVideo(video: VideoData, sourceId: number, env: Env): Promise<{ success: boolean; isNew: boolean }> {
  try {
    const { fingerprintId, mainVodId, isNew: isNewFingerprint } = await findOrCreateFingerprint(video, env);
    const shard = getShard(mainVodId, env);
    const existing = await shard.prepare('SELECT * FROM videos WHERE vod_id = ?').bind(mainVodId).first<any>();
    const now = Math.floor(Date.now() / 1000);

    if (existing) {
      const urls = [existing.play_url_1, existing.play_url_2, existing.play_url_3, existing.play_url_4, existing.play_url_5];
      const durations = [existing.duration_1, existing.duration_2, existing.duration_3, existing.duration_4, existing.duration_5];
      let slotIndex = urls.findIndex(u => !u || u === video.vod_play_url);
      if (slotIndex === -1) slotIndex = 0;
      durations[slotIndex] = video.duration || 0;
      const adSegments = detectAdSegments(durations);
      await shard.prepare(`UPDATE videos SET play_url_${slotIndex + 1} = ?, duration_${slotIndex + 1} = ?, ad_segments = ?, updated_at = ? WHERE vod_id = ?`).bind(video.vod_play_url, video.duration || 0, adSegments, now, mainVodId).run();
      return { success: true, isNew: false };
    } else {
      const adSegments = detectAdSegments([video.duration || 0]);
      await shard.prepare('INSERT INTO videos (vod_id, fingerprint_id, title, title_normalized, category, cover, play_url_1, duration_1, ad_segments, vod_year, vod_area, vod_actor, vod_director, vod_remarks, vod_lang, status, views, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)').bind(mainVodId, fingerprintId, video.vod_name, normalizeTitle(video.vod_name), video.type_name, video.vod_pic, video.vod_play_url, video.duration || 0, adSegments, video.vod_year || '', video.vod_area || '', video.vod_actor || '', video.vod_director || '', video.vod_remarks || '', video.vod_lang || '', now, now).run();
      return { success: true, isNew: true };
    }
  } catch (e) {
    console.error('入库失败:', e);
    return { success: false, isNew: false };
  }
}

async function collectAll(options: CollectOptions): Promise<CollectResult> {
  const { sourceUrl, sourceId, env, mode, pages, signal } = options;
  const result: CollectResult = { total: 0, new: 0, merged: 0, fail: 0, pagesCollected: 0, totalPages: 0 };

  // 1. 自动发现总页数
  const { totalPages } = await collectPageList(sourceUrl, 1, signal);
  result.totalPages = totalPages;
  const maxPages = mode === 'full' ? totalPages : Math.min(pages || totalPages, totalPages);

  // 2. 逐页采集直到最后一页
  for (let page = 1; page <= maxPages; page++) {
    try {
      const { videoIds } = await collectPageList(sourceUrl, page, signal);
      if (videoIds.length === 0) break;

      const batchSize = 100;
      for (let i = 0; i < videoIds.length; i += batchSize) {
        const batch = videoIds.slice(i, i + batchSize);
        const videos = await collectPageDetails(sourceUrl, batch, signal);
        result.total += videos.length;
        for (const video of videos) {
          const saved = await saveVideo(video, sourceId, env);
          if (saved.success) {
            if (saved.isNew) result.new++;
            else result.merged++;
          } else {
            result.fail++;
          }
        }
      }

      result.pagesCollected = page;

      // 翻页间隔，避免对源站压力过大
      if (page < maxPages) await new Promise(r => setTimeout(r, 1500));
    } catch (e: any) {
      console.error(`第${page}页采集失败:`, e.message);
      result.fail++;
    }
  }

  return result;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (request.method !== 'POST') return jsonResponse({ code: 0, msg: '只支持POST请求' }, 405);
  if (!await verifyAdminToken(request, env)) return jsonResponse({ code: 0, msg: '未授权访问' }, 401);

  try {
    const body = await request.json<{ source_url?: string; source_id?: number; mode?: 'full' | 'single'; pages?: number }>();
    const sourceUrl = body.source_url;
    const sourceId = body.source_id || 0;
    const mode = body.mode || 'single';
    const pages = body.pages || 1;

    if (!sourceUrl) return jsonResponse({ code: 0, msg: '缺少source_url' }, 400);
    if (isPrivateUrl(sourceUrl)) return jsonResponse({ code: 0, msg: '不允许访问内网地址' }, 400);

    const result = await collectAll({
      sourceUrl, sourceId, env, mode, pages,
      signal: AbortSignal.timeout(mode === 'full' ? 3600000 : 300000)
    });

    return jsonResponse({
      code: 1,
      msg: `采集完成，共 ${result.pagesCollected}/${result.totalPages} 页，新增 ${result.new} 条，更新 ${result.merged} 条`,
      data: result
    });
  } catch (err: any) {
    return jsonResponse({ code: 0, msg: err.message || '采集失败' }, 500);
  }
};
