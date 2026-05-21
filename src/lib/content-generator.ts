// 动态内容生成 - 用于SEO文本密度提升
// 基于视频元数据自动生成剧情看点、推荐理由等自然语言文本

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

// 影视类型特征词库
const CATEGORY_KEYWORDS: Record<string, { features: string[]; moods: string[]; recommendations: string[] }> = {
  '电影': {
    features: ['剧情紧凑', '画面精美', '演技在线', '配乐出色', '节奏明快'],
    moods: ['震撼人心', '引人深思', '轻松幽默', '紧张刺激', '温馨感人'],
    recommendations: ['适合周末观看', '值得二刷', '强烈推荐', '口碑佳作']
  },
  '电视剧': {
    features: ['剧情丰富', '人物饱满', '制作精良', '故事完整', '演技精湛'],
    moods: ['跌宕起伏', '扣人心弦', '温情脉脉', '悬念迭起', '高潮迭起'],
    recommendations: ['追剧必备', '值得熬夜看', '口碑爆棚', '豆瓣高分']
  },
  '综艺': {
    features: ['笑点密集', '嘉宾阵容强大', '互动有趣', '环节精彩', '创意十足'],
    moods: ['欢乐无限', '轻松解压', '爆笑不断', '惊喜连连', '温馨治愈'],
    recommendations: ['下饭神器', '周末必看', '全家适合', '笑到肚子疼']
  },
  '动漫': {
    features: ['画风精美', '剧情热血', '人设出色', '配乐动人', '制作精良'],
    moods: ['热血沸腾', '感动落泪', '脑洞大开', '治愈温馨', '燃爆全场'],
    recommendations: ['二次元必看', '神作预定', '漫迷推荐', '经典之作']
  },
  '短剧': {
    features: ['节奏快', '反转多', '剧情紧凑', '爽点密集', '更新快'],
    moods: ['欲罢不能', '反转不断', '爽感十足', '意外惊喜', '停不下来'],
    recommendations: ['碎片时间必看', '一口气看完', '上头神剧', '追更推荐']
  }
};

// 地区特色词库
const AREA_FEATURES: Record<string, string[]> = {
  '中国大陆': ['国产佳作', '本土特色', '接地气', '贴近生活'],
  '中国香港': ['港风浓郁', '动作精彩', '经典港味', '警匪题材'],
  '中国台湾': ['台式清新', '偶像剧风', '温情治愈', '青春气息'],
  '美国': ['好莱坞大片', '特效震撼', '制作精良', '视效一流'],
  '韩国': ['韩式浪漫', '情感细腻', '剧情紧凑', '演员颜值高'],
  '日本': ['日式风格', '细节考究', '情感真挚', '治愈系'],
  '泰国': ['泰式幽默', '脑洞大开', '情感真挚', '反转惊喜'],
  '印度': ['歌舞精彩', '情感浓烈', '社会议题', '宝莱坞风格'],
  '英国': ['英式幽默', '古典优雅', '制作考究', '剧情深刻']
};

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
  
  // 地区特色
  if (meta.vod_area && AREA_FEATURES[meta.vod_area]) {
    const features = AREA_FEATURES[meta.vod_area];
    highlights.push(features[Math.floor(Math.random() * features.length)]);
  }
  
  // 类型特征
  const category = meta.category || '电影';
  const catData = CATEGORY_KEYWORDS[category] || CATEGORY_KEYWORDS['电影'];
  if (catData.features.length > 0) {
    highlights.push(catData.features[Math.floor(Math.random() * catData.features.length)]);
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
  
  // 基本信息
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
  
  // 类型特色
  const category = meta.category || '电影';
  const catData = CATEGORY_KEYWORDS[category] || CATEGORY_KEYWORDS['电影'];
  if (catData.moods.length > 0) {
    parts.push(`，剧情${catData.moods[Math.floor(Math.random() * catData.moods.length)]}`);
  }
  
  // 推荐语
  if (catData.recommendations.length > 0) {
    parts.push(`，${catData.recommendations[Math.floor(Math.random() * catData.recommendations.length)]}`);
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
  
  // 类型建议
  const category = meta.category || '电影';
  if (category === '电影') {
    tips.push('建议在WiFi环境下观看，体验更佳');
  } else if (category === '电视剧' || category === '短剧') {
    tips.push('剧情精彩，建议预留充足时间观看');
  } else if (category === '综艺') {
    tips.push('适合放松心情时观看');
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
    searches.push(`${actor}${meta.category || '电影'}`);
  }
  
  // 地区+类型+年份
  if (meta.vod_area && meta.vod_year) {
    searches.push(`${meta.vod_area}${meta.vod_year}${meta.category || '电影'}`);
  }
  
  return [...new Set(searches)].slice(0, 6);
}
