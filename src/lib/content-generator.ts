// 动态内容生成 - 用于SEO文本密度提升
// 基于视频元数据自动生成剧情看点、推荐理由等自然语言文本
// 注意：所有分类数据来源于资源站，无内置分类

export interface VideoMeta {
  title: string;
  category?: string;
  vod_year?: string;
  vod_area?: string;
  vod_actor?: string;
  vod_director?: string;
  vod_remarks?: string;
  vod_lang?: string;
}

// 年代特征
function getYearFeature(year?: string): string {
  if (!year) return '';
  const y = parseInt(year);
  if (y >= 2024) return '最新上映';
  if (y >= 2020) return '近年佳作';
  if (y >= 2010) return '经典之作';
  if (y >= 2000) return '千禧经典';
  return '怀旧经典';
}

/**
 * 生成剧情看点（基于视频元数据）
 */
export function generateHighlights(meta: VideoMeta): string[] {
  const highlights: string[] = [];
  
  // 年代特征
  const yearFeature = getYearFeature(meta.vod_year);
  if (yearFeature) highlights.push(yearFeature);
  
  // 地区特色（直接使用资源站数据）
  if (meta.vod_area) {
    highlights.push(`${meta.vod_area}出品`);
  }
  
  // 类型（直接使用资源站数据）
  if (meta.category) {
    highlights.push(meta.category);
  }
  
  // 演员亮点
  if (meta.vod_actor) {
    const actors = meta.vod_actor.split(/[,，]/).slice(0, 2);
    if (actors.length > 0) {
      highlights.push(`${actors[0]}主演`);
    }
  }
  
  // 导演亮点
  if (meta.vod_director) {
    highlights.push(`${meta.vod_director}执导`);
  }
  
  // 状态标签
  if (meta.vod_remarks) {
    if (meta.vod_remarks.includes('完结')) {
      highlights.push('已完结');
    } else if (meta.vod_remarks.includes('更新')) {
      highlights.push('热播中');
    }
  }
  
  return [...new Set(highlights)].slice(0, 5);
}

/**
 * 生成推荐理由（自然语言段落）
 */
export function generateRecommendation(meta: VideoMeta): string {
  const parts: string[] = [];
  
  // 开头
  parts.push(`《${meta.title}》`);
  
  // 基本信息（直接使用资源站数据）
  const infoParts: string[] = [];
  if (meta.vod_year) infoParts.push(meta.vod_year + '年');
  if (meta.vod_area) infoParts.push(meta.vod_area);
  if (meta.category) infoParts.push(meta.category);
  if (infoParts.length > 0) {
    parts.push(`是一部${infoParts.join('')}作品`);
  }
  
  // 主创
  if (meta.vod_director) {
    parts.push(`由${meta.vod_director}执导`);
  }
  if (meta.vod_actor) {
    const actors = meta.vod_actor.split(/[,，]/).slice(0, 3).join('、');
    parts.push(`，${actors}主演`);
  }
  
  parts.push('。');
  
  return parts.join('');
}

/**
 * 生成观看建议
 */
export function generateViewingTips(meta: VideoMeta): string[] {
  const tips: string[] = [];
  
  // 语言提示
  if (meta.vod_lang) {
    tips.push(`本片为${meta.vod_lang}版本`);
  }
  
  // 类型建议（直接使用资源站分类）
  if (meta.category) {
    tips.push(`精彩内容，建议预留充足时间观看`);
  }
  
  // 更新提示
  if (meta.vod_remarks && !meta.vod_remarks.includes('完结')) {
    tips.push('持续更新中，收藏本页不错过更新');
  }
  
  return tips;
}

/**
 * 生成SEO友好的长描述
 */
export function generateLongDescription(meta: VideoMeta): string {
  const paragraphs: string[] = [];
  
  // 第一段：基本信息
  paragraphs.push(generateRecommendation(meta));
  
  // 第二段：看点分析
  const highlights = generateHighlights(meta);
  if (highlights.length > 0) {
    paragraphs.push(`本片看点：${highlights.join('、')}。无论是剧情设计还是演员表现都值得期待，是近期不可错过的佳作。`);
  }
  
  // 第三段：观看建议
  const tips = generateViewingTips(meta);
  if (tips.length > 0) {
    paragraphs.push(tips.join('。') + '。');
  }
  
  return paragraphs.join('\n\n');
}

/**
 * 生成相关搜索词
 */
export function generateRelatedSearches(meta: VideoMeta): string[] {
  const searches: string[] = [];
  
  // 标题相关
  searches.push(`${meta.title}在线观看`);
  searches.push(`${meta.title}免费观看`);
  searches.push(`${meta.title}完整版`);
  
  // 演员+类型
  if (meta.vod_actor) {
    const actor = meta.vod_actor.split(/[,，]/)[0];
    searches.push(`${actor}${meta.category || ''}`);
  }
  
  // 地区+类型+年份
  if (meta.vod_area && meta.vod_year) {
    searches.push(`${meta.vod_area}${meta.vod_year}${meta.category || ''}`);
  }
  
  return [...new Set(searches)].slice(0, 6);
}
