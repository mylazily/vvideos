// 视频指纹生成与去重算法
// 基于标题标准化 + 年份 + 类型 + 演员

export interface VideoMeta {
  title: string;
  vod_year?: string;
  category?: string;
  vod_actor?: string;
  duration?: number; // 秒
}

/**
 * 标准化标题（用于生成指纹）
 * - 去除空格、特殊符号
 * - 统一中英文标点
 * - 去除常见后缀（如"HD", "1080P", "国语版"等）
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';
  
  return title
    // 统一空格
    .replace(/\s+/g, '')
    // 去除常见质量标识
    .replace(/(\d{3,4}[Pp]|HD|BD|UHD|4K|1080|720|蓝光|高清|超清|标清|DVD|TS|TC|CAM|枪版)/gi, '')
    // 去除语言版本标识
    .replace(/(国语|粤语|英语|日语|韩语|中字|中英双字|双语|版)/g, '')
    // 去除集数标识（保留第X集）
    .replace(/(全\d+集|共\d+集|\d+集全)/g, '')
    // 去除年份括号
    .replace(/[\[\(（【]\d{4}[\]\)）】]/g, '')
    // 去除特殊符号
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    // 统一小写
    .toLowerCase()
    // 去除纯数字前缀（如"01."）
    .replace(/^\d+/, '');
}

/**
 * 提取标题中的核心关键词
 * 用于模糊匹配
 */
export function extractKeywords(title: string): string[] {
  const normalized = normalizeTitle(title);
  // 中文按字符，英文按单词
  const keywords: string[] = [];
  
  // 提取中文字符
  const chinese = normalized.match(/[\u4e00-\u9fa5]{2,}/g);
  if (chinese) keywords.push(...chinese);
  
  // 提取英文单词
  const english = normalized.match(/[a-zA-Z]+/g);
  if (english) keywords.push(...english);
  
  // 提取数字（可能是年份或季数）
  const numbers = normalized.match(/\d{4}/g);
  if (numbers) keywords.push(...numbers);
  
  return [...new Set(keywords)];
}

/**
 * 生成视频指纹
 * 格式: hash(标准化标题+年份+类型)
 */
export function generateFingerprint(meta: VideoMeta): string {
  const normalized = normalizeTitle(meta.title);
  const year = meta.vod_year || '';
  const category = meta.category || '';
  
  // 组合关键信息
  const content = `${normalized}|${year}|${category}`;
  
  // 简单的字符串哈希（FNV-1a变体）
  let hash = 2166136261;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 计算两个标题的相似度（0-1）
 * 使用Jaccard相似系数
 */
export function calculateSimilarity(title1: string, title2: string): number {
  const keywords1 = new Set(extractKeywords(title1));
  const keywords2 = new Set(extractKeywords(title2));
  
  if (keywords1.size === 0 || keywords2.size === 0) return 0;
  
  const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
  const union = new Set([...keywords1, ...keywords2]);
  
  return intersection.size / union.size;
}

/**
 * 判断是否同一视频（用于去重）
 * 规则：
 * 1. 指纹完全相同 → 同一视频
 * 2. 标题相似度>0.8 且 年份相同 且 (演员有交集 或 类型相同) → 同一视频
 */
export function isSameVideo(meta1: VideoMeta, meta2: VideoMeta): boolean {
  // 快速路径：指纹相同
  const fp1 = generateFingerprint(meta1);
  const fp2 = generateFingerprint(meta2);
  if (fp1 === fp2) return true;
  
  // 检查年份
  if (meta1.vod_year && meta2.vod_year && meta1.vod_year !== meta2.vod_year) {
    return false;
  }
  
  // 标题相似度
  const similarity = calculateSimilarity(meta1.title, meta2.title);
  if (similarity < 0.8) return false;
  
  // 检查演员交集
  if (meta1.vod_actor && meta2.vod_actor) {
    const actors1 = meta1.vod_actor.split(/[,，/]/).map(a => a.trim());
    const actors2 = meta2.vod_actor.split(/[,，/]/).map(a => a.trim());
    const hasCommonActor = actors1.some(a => actors2.includes(a));
    if (hasCommonActor) return true;
  }
  
  // 检查类型
  if (meta1.category && meta2.category && meta1.category === meta2.category) {
    return true;
  }
  
  return false;
}

/**
 * 解析播放URL中的时长信息
 * 从m3u8或普通URL中提取可能的时长提示
 */
export function extractDurationFromUrl(url: string): number {
  // 尝试从URL参数中提取时长（某些资源站会提供）
  const match = url.match(/[?&]duration=(\d+)/i);
  if (match) return parseInt(match[1]);
  
  // 尝试从文件名提取（如 "movie_3600s.mp4"）
  const fileMatch = url.match(/_(\d+)[s秒]/i);
  if (fileMatch) return parseInt(fileMatch[1]);
  
  return 0;
}
