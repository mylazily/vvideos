// 视频指纹生成与去重算法 - 增强版
// 基于标题标准化 + 年份 + 类型 + 演员 + 时长相似度

export interface VideoMeta {
  title: string;
  vod_year?: string;
  category?: string;
  vod_actor?: string;
  vod_director?: string;
  duration?: number; // 秒
}

// 常见标题变体映射表
const TITLE_VARIANTS: Record<string, string[]> = {
  '复仇者联盟': ['复仇者联盟', '复联', 'Avengers'],
  '速度与激情': ['速度与激情', '速激', 'Fast and Furious', '玩命关头'],
  '变形金刚': ['变形金刚', 'Transformers'],
  '碟中谍': ['碟中谍', 'Mission Impossible', '不可能的任务'],
  '007': ['007', 'James Bond', '詹姆斯邦德'],
  '漫威': ['漫威', 'Marvel'],
  'DC': ['DC', 'DC漫画'],
  '星球大战': ['星球大战', '星战', 'Star Wars'],
  '哈利波特': ['哈利波特', 'Harry Potter'],
  '指环王': ['指环王', '魔戒', 'Lord of the Rings'],
  '侏罗纪': ['侏罗纪', 'Jurassic'],
  '蜘蛛侠': ['蜘蛛侠', 'Spider Man', '蜘蛛人'],
  '蝙蝠侠': ['蝙蝠侠', 'Batman'],
  '钢铁侠': ['钢铁侠', 'Iron Man'],
  '美国队长': ['美国队长', 'Captain America'],
  '雷神': ['雷神', 'Thor'],
  '绿巨人': ['绿巨人', '浩克', 'Hulk'],
  '黑寡妇': ['黑寡妇', 'Black Widow'],
  '鹰眼': ['鹰眼', 'Hawkeye'],
  '蚁人': ['蚁人', 'Ant Man'],
  '奇异博士': ['奇异博士', 'Doctor Strange'],
  '黑豹': ['黑豹', 'Black Panther'],
  '惊奇队长': ['惊奇队长', 'Captain Marvel'],
  '死侍': ['死侍', 'Deadpool'],
  '金刚狼': ['金刚狼', 'Wolverine'],
  'X战警': ['X战警', 'X-Men'],
  '神奇四侠': ['神奇四侠', 'Fantastic Four'],
  '超人': ['超人', 'Superman'],
  '神奇女侠': ['神奇女侠', 'Wonder Woman'],
  '海王': ['海王', 'Aquaman'],
  '闪电侠': ['闪电侠', 'Flash'],
};

/**
 * 标准化标题（用于生成指纹）
 * - 去除空格、特殊符号
 * - 统一中英文标点
 * - 去除常见后缀（如"HD", "1080P", "国语版"等）
 * - 识别系列名称变体
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';
  
  let normalized = title
    // 统一空格
    .replace(/\s+/g, '')
    // 去除常见质量标识
    .replace(/(\d{3,4}[Pp]|HD|BD|UHD|4K|1080|720|蓝光|高清|超清|标清|DVD|TS|TC|CAM|枪版)/gi, '')
    // 去除语言版本标识
    .replace(/(国语|粤语|英语|日语|韩语|中字|中英双字|双语|版)/g, '')
    // 去除集数标识
    .replace(/(全\d+集|共\d+集|\d+集全)/g, '')
    // 去除年份括号
    .replace(/[\[\(（【]\d{4}[\]\)）】]/g, '')
    // 去除特殊符号
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    // 统一小写
    .toLowerCase()
    // 去除纯数字前缀
    .replace(/^\d+/, '');
  
  // 识别系列名称变体并统一
  for (const [standard, variants] of Object.entries(TITLE_VARIANTS)) {
    for (const variant of variants) {
      const variantNorm = variant.toLowerCase().replace(/\s+/g, '');
      if (normalized.includes(variantNorm)) {
        normalized = normalized.replace(variantNorm, standard.toLowerCase());
      }
    }
  }
  
  return normalized;
}

/**
 * 提取标题中的核心关键词
 * 用于模糊匹配
 */
export function extractKeywords(title: string): string[] {
  const normalized = normalizeTitle(title);
  const keywords: string[] = [];
  
  // 提取中文字符（2字以上）
  const chinese = normalized.match(/[\u4e00-\u9fa5]{2,}/g);
  if (chinese) keywords.push(...chinese);
  
  // 提取英文单词
  const english = normalized.match(/[a-zA-Z]+/g);
  if (english) keywords.push(...english);
  
  // 提取数字（可能是年份、季数、集数）
  const numbers = normalized.match(/\d{2,4}/g);
  if (numbers) keywords.push(...numbers);
  
  return [...new Set(keywords)];
}

/**
 * 提取系列标识（如"复仇者联盟4"→"复仇者联盟"+"4"）
 */
export function extractSeriesInfo(title: string): { series: string; number: string } {
  const normalized = normalizeTitle(title);
  
  // 匹配系列名+数字（如复联4、速激9）
  const match = normalized.match(/^([\u4e00-\u9fa5]+|[a-z]+)(\d+)$/i);
  if (match) {
    return { series: match[1], number: match[2] };
  }
  
  // 匹配"第X部/X部"等
  const partMatch = normalized.match(/(.+?)(第?([一二三四五六七八九十\d]+)[部季集])/);
  if (partMatch) {
    return { series: partMatch[1], number: partMatch[3] };
  }
  
  return { series: normalized, number: '' };
}

/**
 * 计算两个标题的相似度（0-1）
 * 使用改进的Jaccard相似系数 + 编辑距离
 */
export function calculateSimilarity(title1: string, title2: string): number {
  const keywords1 = new Set(extractKeywords(title1));
  const keywords2 = new Set(extractKeywords(title2));
  
  if (keywords1.size === 0 || keywords2.size === 0) return 0;
  
  // Jaccard相似度
  const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
  const union = new Set([...keywords1, ...keywords2]);
  const jaccard = intersection.size / union.size;
  
  // 系列信息匹配
  const series1 = extractSeriesInfo(title1);
  const series2 = extractSeriesInfo(title2);
  let seriesBonus = 0;
  
  if (series1.series === series2.series && series1.series.length > 2) {
    // 系列名相同，加分
    seriesBonus = 0.2;
    
    // 序号也相同，再加分
    if (series1.number && series1.number === series2.number) {
      seriesBonus += 0.3;
    }
  }
  
  return Math.min(1, jaccard + seriesBonus);
}

/**
 * 计算时长相似度
 * 考虑广告导致的时长差异
 */
export function calculateDurationSimilarity(d1: number, d2: number): number {
  if (d1 <= 0 || d2 <= 0) return 0.5; // 未知时长，中性
  
  const diff = Math.abs(d1 - d2);
  const avg = (d1 + d2) / 2;
  const ratio = diff / avg;
  
  // 差异小于5%，高度相似
  if (ratio < 0.05) return 1;
  // 差异5-10%，比较相似（可能是小广告）
  if (ratio < 0.1) return 0.8;
  // 差异10-20%，可能相似（可能是广告）
  if (ratio < 0.2) return 0.6;
  // 差异20-30%，不太相似
  if (ratio < 0.3) return 0.3;
  // 差异大于30%，不相似
  return 0;
}

/**
 * 计算演员相似度
 */
export function calculateActorSimilarity(actors1?: string, actors2?: string): number {
  if (!actors1 || !actors2) return 0;
  
  const list1 = actors1.split(/[,，/]/).map(a => a.trim()).filter(Boolean);
  const list2 = actors2.split(/[,，/]/).map(a => a.trim()).filter(Boolean);
  
  if (list1.length === 0 || list2.length === 0) return 0;
  
  // 计算交集
  const intersection = list1.filter(a => list2.includes(a));
  
  // 有共同主演，高度相似
  if (intersection.length >= 2) return 1;
  if (intersection.length === 1) return 0.7;
  
  // 无共同演员，但都有演员信息，中等相似
  return 0.3;
}

/**
 * 生成视频指纹
 */
export function generateFingerprint(meta: VideoMeta): string {
  const normalized = normalizeTitle(meta.title);
  const year = meta.vod_year || '';
  const category = meta.category || '';
  const duration = meta.duration || 0;
  
  // 时长取整到100秒（减少微小差异）
  const durationBucket = duration > 0 ? Math.floor(duration / 100) * 100 : 0;
  
  const content = `${normalized}|${year}|${category}|${durationBucket}`;
  
  // FNV-1a哈希
  let hash = 2166136261;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 综合相似度评分
 */
export interface SimilarityScore {
  total: number;      // 总相似度 0-1
  title: number;      // 标题相似度
  duration: number;   // 时长相似度
  actor: number;      // 演员相似度
  year: boolean;      // 年份是否匹配
  category: boolean;  // 类型是否匹配
}

export function calculateTotalSimilarity(meta1: VideoMeta, meta2: VideoMeta): SimilarityScore {
  const titleSim = calculateSimilarity(meta1.title, meta2.title);
  const durationSim = calculateDurationSimilarity(meta1.duration || 0, meta2.duration || 0);
  const actorSim = calculateActorSimilarity(meta1.vod_actor, meta2.vod_actor);
  const yearMatch = !meta1.vod_year || !meta2.vod_year || meta1.vod_year === meta2.vod_year;
  const categoryMatch = !meta1.category || !meta2.category || meta1.category === meta2.category;
  
  // 权重：标题50% + 时长20% + 演员20% + 年份5% + 类型5%
  let total = titleSim * 0.5 + durationSim * 0.2 + actorSim * 0.2;
  if (yearMatch) total += 0.05;
  if (categoryMatch) total += 0.05;
  
  return {
    total: Math.min(1, total),
    title: titleSim,
    duration: durationSim,
    actor: actorSim,
    year: yearMatch,
    category: categoryMatch,
  };
}

/**
 * 判断是否同一视频（增强版）
 * 阈值：总相似度 >= 0.75
 */
export function isSameVideo(meta1: VideoMeta, meta2: VideoMeta): boolean {
  // 快速路径：指纹相同
  const fp1 = generateFingerprint(meta1);
  const fp2 = generateFingerprint(meta2);
  if (fp1 === fp2) return true;
  
  // 综合相似度判断
  const score = calculateTotalSimilarity(meta1, meta2);
  
  // 高相似度阈值
  if (score.total >= 0.75) return true;
  
  // 特殊情况：标题非常相似 + 演员相同
  if (score.title >= 0.9 && score.actor >= 0.7) return true;
  
  // 特殊情况：时长几乎相同 + 年份相同 + 类型相同
  if (score.duration >= 0.8 && score.year && score.category) return true;
  
  return false;
}

/**
 * 从播放URL中提取时长
 */
export function extractDurationFromUrl(url: string): number {
  // URL参数
  const match = url.match(/[?&]duration=(\d+)/i);
  if (match) return parseInt(match[1]);
  
  // 文件名
  const fileMatch = url.match(/_(\d+)[s秒]/i);
  if (fileMatch) return parseInt(fileMatch[1]);
  
  // m3u8时长估算（从#EXTINF标签）
  // 这个需要在实际解析时获取
  
  return 0;
}

/**
 * 解析m3u8获取总时长
 */
export async function getDurationFromM3U8(m3u8Url: string): Promise<number> {
  try {
    const response = await fetch(m3u8Url);
    const content = await response.text();
    
    let totalDuration = 0;
    const lines = content.split('\n');
    
    for (const line of lines) {
      const match = line.match(/#EXTINF:([\d.]+)/);
      if (match) {
        totalDuration += parseFloat(match[1]);
      }
    }
    
    return Math.round(totalDuration);
  } catch {
    return 0;
  }
}
