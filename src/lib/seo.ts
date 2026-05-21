// SEO 工具函数 - 生成动态描述、关键词、TAG等

export const SITE_URL = 'https://evideos.pages.dev';
export const SITE_NAME = '必爱必爱';

export interface VideoSEOData {
  title: string;
  category: string;
  vod_year?: string;
  vod_area?: string;
  vod_actor?: string;
  vod_director?: string;
  vod_lang?: string;
}

// 视频类型关键词库
const categoryKeywords: Record<string, string[]> = {
  '电影': ['高清电影', '最新电影', '热门电影', '院线电影', '经典电影', '动作片', '爱情片', '科幻片'],
  '电视剧': ['热播电视剧', '国产剧', '韩剧', '美剧', '日剧', '泰剧', '网剧'],
  '综艺': ['热门综艺', '真人秀', '脱口秀', '选秀节目', '综艺节目'],
  '动漫': ['日本动漫', '国产动漫', '新番', '热门动漫', '经典动漫'],
  '纪录片': ['纪录片', '自然纪录片', '历史纪录片', '人文纪录片'],
  '短剧': ['热门短剧', '微短剧', '网络短剧', '竖屏短剧']
};

// 地区长尾词
const areaKeywords: Record<string, string[]> = {
  '中国大陆': ['国产', '内地', '华语'],
  '中国香港': ['港片', '香港电影', '粤语'],
  '中国台湾': ['台剧', '台湾电影'],
  '美国': ['好莱坞', '欧美电影', '美剧'],
  '韩国': ['韩剧', '韩片', '韩国电影'],
  '日本': ['日剧', '日漫', '日本电影'],
  '泰国': ['泰剧', '泰国电影'],
  '印度': ['宝莱坞', '印度电影'],
  '英国': ['英剧', '英国电影']
};

// 生成SEO描述
export function generateSEODescription(video: VideoSEOData): string {
  const parts: string[] = [];
  
  // 基础描述
  parts.push(`《${video.title}》`);
  
  // 添加类型
  if (video.category) {
    parts.push(`${video.category}在线观看`);
  }
  
  // 添加年份
  if (video.vod_year) {
    parts.push(`${video.vod_year}年`);
  }
  
  // 添加地区
  if (video.vod_area) {
    parts.push(`${video.vod_area}出品`);
  }
  
  // 添加演员
  if (video.vod_actor) {
    const actors = video.vod_actor.split(/[,，]/).slice(0, 3).join('、');
    parts.push(`由${actors}主演`);
  }
  
  // 添加导演
  if (video.vod_director) {
    parts.push(`${video.vod_director}执导`);
  }
  
  // 结尾
  parts.push('高清完整版免费播放，支持手机在线观看。');
  
  return parts.join('，');
}

// 生成SEO关键词
export function generateSEOKeywords(video: VideoSEOData): string[] {
  const keywords: string[] = [];
  
  // 核心关键词
  keywords.push(video.title);
  keywords.push(`${video.title}在线观看`);
  keywords.push(`${video.title}免费观看`);
  
  // 类型关键词
  if (video.category && categoryKeywords[video.category]) {
    keywords.push(...categoryKeywords[video.category].slice(0, 3));
  }
  keywords.push(`${video.category}大全`);
  
  // 地区关键词
  if (video.vod_area && areaKeywords[video.vod_area]) {
    keywords.push(...areaKeywords[video.vod_area]);
  }
  
  // 年份关键词
  if (video.vod_year) {
    keywords.push(`${video.vod_year}年${video.category}`);
    keywords.push(`${video.vod_year}最新${video.category}`);
  }
  
  // 演员关键词
  if (video.vod_actor) {
    const actors = video.vod_actor.split(/[,，]/).slice(0, 2);
    actors.forEach(actor => {
      keywords.push(`${actor}电影`);
      keywords.push(`${actor}主演`);
    });
  }
  
  // 语言关键词
  if (video.vod_lang) {
    keywords.push(`${video.vod_lang}版`);
    keywords.push(`${video.vod_lang}配音`);
  }
  
  // 通用长尾词
  keywords.push('高清在线观看');
  keywords.push('免费完整版');
  keywords.push('手机在线播放');
  
  return [...new Set(keywords)].slice(0, 15); // 去重，最多15个
}

// 生成TAG标签
export function generateTags(video: VideoSEOData): string[] {
  const tags: string[] = [];
  
  // 标题相关
  tags.push(video.title);
  
  // 类型标签
  if (video.category) {
    tags.push(video.category);
    // 子类型
    if (categoryKeywords[video.category]) {
      tags.push(...categoryKeywords[video.category].slice(0, 2));
    }
  }
  
  // 年份标签
  if (video.vod_year) {
    tags.push(video.vod_year);
    tags.push(`${video.vod_year}年`);
  }
  
  // 地区标签
  if (video.vod_area) {
    tags.push(video.vod_area);
    if (areaKeywords[video.vod_area]) {
      tags.push(...areaKeywords[video.vod_area].slice(0, 2));
    }
  }
  
  // 演员标签
  if (video.vod_actor) {
    const actors = video.vod_actor.split(/[,，]/).slice(0, 3);
    tags.push(...actors.map(a => a.trim()).filter(Boolean));
  }
  
  // 导演标签
  if (video.vod_director) {
    tags.push(video.vod_director);
  }
  
  // 语言标签
  if (video.vod_lang) {
    tags.push(video.vod_lang);
  }
  
  return [...new Set(tags)].filter(tag => tag.length > 0);
}

// 生成相关搜索词
export function generateRelatedSearches(video: VideoSEOData): string[] {
  const related: string[] = [];
  
  related.push(`${video.title}剧情介绍`);
  related.push(`${video.title}演员表`);
  related.push(`${video.title}结局`);
  related.push(`${video.title}主题曲`);
  
  if (video.vod_actor) {
    const actors = video.vod_actor.split(/[,，]/).slice(0, 2);
    actors.forEach(actor => {
      related.push(`${actor.trim()}演过的电影`);
      related.push(`${actor.trim()}最新作品`);
    });
  }
  
  if (video.category) {
    related.push(`最新${video.category}推荐`);
    related.push(`${video.category}排行榜`);
  }
  
  if (video.vod_year) {
    related.push(`${video.vod_year}年热门${video.category || '电影'}`);
  }
  
  return related;
}

// 生成页面标题
export function generatePageTitle(video: VideoSEOData): string {
  const parts: string[] = [video.title];
  
  if (video.category) {
    parts.push(video.category);
  }
  
  parts.push('在线观看');
  parts.push('必爱必爱');
  
  return parts.join(' - ');
}

// 生成结构化数据 (JSON-LD)
export function generateVideoSchema(video: VideoSEOData & { cover?: string; play_url?: string; vod_id?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.title,
    description: generateSEODescription(video),
    thumbnailUrl: video.cover,
    uploadDate: video.vod_year ? `${video.vod_year}-01-01` : new Date().toISOString(),
    contentUrl: video.play_url,
    embedUrl: video.play_url,
    actor: video.vod_actor ? video.vod_actor.split(/[,，]/).map(name => ({
      '@type': 'Person',
      name: name.trim()
    })) : undefined,
    director: video.vod_director ? {
      '@type': 'Person',
      name: video.vod_director
    } : undefined,
    genre: video.category
  };
}

// 生成面包屑结构化数据
export function generateBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}

// ===== 新增 SEO 方案 =====

// 生成 Canonical URL
export function canonicalUrl(path: string): string {
  return SITE_URL + path;
}

// 生成分页 rel prev/next
export function paginationLinks(baseUrl: string, currentPage: number, totalPages: number): { prev?: string; next?: string } {
  const links: { prev?: string; next?: string } = {};
  if (currentPage > 1) {
    links.prev = `${baseUrl}?page=${currentPage - 1}`;
  }
  if (currentPage < totalPages) {
    links.next = `${baseUrl}?page=${currentPage + 1}`;
  }
  return links;
}

// SearchAction Schema（Google 搜索框直达）
export function generateSearchActionSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search/{search_term_string}/1`
      },
      'query-input': 'required name=search_term_string'
    }
  };
}

// Image alt 文本优化
export function generateImageAlt(video: VideoSEOData): string {
  const parts: string[] = [];
  parts.push(video.title);
  if (video.category) parts.push(video.category);
  if (video.vod_year) parts.push(video.vod_year + '年');
  parts.push('封面');
  return parts.join(' - ');
}

// 分类页 SEO
export function generateCategorySEO(categoryName: string, page: number = 1): { title: string; description: string; keywords: string } {
  const suffix = page > 1 ? ` 第${page}页` : '';
  return {
    title: `${categoryName}在线观看${suffix} - ${SITE_NAME}`,
    description: `最新${categoryName}在线观看，高清完整版免费播放。${categoryName}推荐、排行榜，每日更新，支持手机在线观看。`,
    keywords: `${categoryName},${categoryName}在线观看,最新${categoryName},${categoryName}推荐,免费${categoryName},高清${categoryName}`
  };
}

// RSS Feed 生成
export function generateRSSFeed(videos: { title: string; vod_id: string; category?: string; vod_year?: string; cover?: string; updated_at?: number }[]): string {
  const items = videos.map(v => `
    <item>
      <title><![CDATA[${v.title}]]></title>
      <link>${SITE_URL}/v/${v.vod_id}</link>
      <description><![CDATA[${v.category || '视频'}${v.vod_year ? ' · ' + v.vod_year + '年' : ''} - ${SITE_NAME}]]></description>
      <pubDate>${v.updated_at ? new Date(v.updated_at * 1000).toUTCString() : new Date().toUTCString()}</pubDate>
      <guid isPermaLink="true">${SITE_URL}/v/${v.vod_id}</guid>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME} - 最新更新</title>
    <link>${SITE_URL}</link>
    <description>最新高清电影、电视剧、综艺、动漫在线观看</description>
    <language>zh-CN</language>
    <atom:link href="${SITE_URL}/api/rss.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;
}

// ===== 高级 SEO =====

// ItemList Schema（列表页 - 分类/搜索/TAG）
export function generateItemListSchema(
  items: { name: string; url: string; position?: number; image?: string }[],
  listName: string
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: item.position || (i + 1),
      name: item.name,
      url: item.url.startsWith('http') ? item.url : SITE_URL + item.url,
      ...(item.image ? { image: item.image } : {})
    }))
  };
}

// CollectionPage Schema（分类聚合页）
export function generateCollectionPageSchema(
  categoryName: string,
  description: string,
  pageUrl: string
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: categoryName,
    description: description,
    url: pageUrl.startsWith('http') ? pageUrl : SITE_URL + pageUrl,
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL
    }
  };
}

// FAQPage Schema（常见问题 - 提升搜索展示）
export function generateFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer
      }
    }))
  };
}

// Organization Schema
export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    sameAs: []
  };
}

// WebPage Schema
export function generateWebPageSchema(page: { title: string; description: string; url: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.title,
    description: page.description,
    url: page.url,
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL
    }
  };
}

// 首页 SEO
export function generateHomeSEO(): { title: string; description: string; keywords: string } {
  return {
    title: `${SITE_NAME} - 免费在线观看最新电影、电视剧、综艺、动漫`,
    description: `${SITE_NAME}提供最新最全的电影、电视剧、综艺、动漫在线观看，高清流畅速度快，支持手机免会员观看。`,
    keywords: `${SITE_NAME},免费电影,在线观看,电视剧,综艺,动漫,高清视频,手机看电影`
  };
}

// 发现页 SEO
export function generateDiscoverSEO(): { title: string; description: string; keywords: string } {
  return {
    title: `发现 - 探索精彩内容 - ${SITE_NAME}`,
    description: `发现最新热门电影、电视剧、综艺、动漫。按分类、地区、年份、演员、导演浏览，找到你喜爱的内容。`,
    keywords: `发现,热门视频,最新电影,电视剧,综艺,动漫,演员,导演,分类,地区,年份`
  };
}

// TAG 页 SEO
export function generateTagSEO(tagName: string, page: number = 1, totalCount: number = 0): { title: string; description: string; keywords: string } {
  const suffix = page > 1 ? ` 第${page}页` : '';
  const countText = totalCount > 0 ? `共${totalCount}部` : '';
  return {
    title: `${tagName}相关视频${suffix} - ${SITE_NAME}`,
    description: `${tagName}相关视频在线观看${countText}，高清完整版免费播放。探索更多${tagName}内容，支持手机在线观看。`,
    keywords: `${tagName},${tagName}视频,${tagName}在线观看,${tagName}相关,${tagName}推荐`
  };
}

// 搜索页 SEO
export function generateSearchSEO(keyword: string, page: number = 1, totalCount: number = 0): { title: string; description: string; keywords: string } {
  const suffix = page > 1 ? ` 第${page}页` : '';
  const countText = totalCount > 0 ? `共${totalCount}部` : '';
  return {
    title: `${keyword}相关视频${suffix} - ${SITE_NAME}`,
    description: `"${keyword}"相关视频在线观看${countText}，高清完整版免费播放。支持手机在线观看。`,
    keywords: `${keyword},${keyword}视频,${keyword}在线观看,${keyword}相关,${keyword}推荐`
  };
}

// 交叉聚合页 SEO（地区×年份×分类 二维裂变）
export function generateCrossSEO(filters: { area?: string; year?: string; category?: string; actor?: string }, page: number = 1, totalCount: number = 0): { title: string; description: string; keywords: string } {
  const parts: string[] = [];
  if (filters.year) parts.push(filters.year + '年');
  if (filters.area) parts.push(filters.area);
  if (filters.category) parts.push(filters.category);
  if (filters.actor) parts.push(filters.actor);
  const label = parts.join('') || '影视';
  const suffix = page > 1 ? ` 第${page}页` : '';
  const countText = totalCount > 0 ? `共${totalCount}部` : '';

  // TDK 标题锁死长尾词
  const title = `${label}大全_最新${label}在线观看${suffix} - ${SITE_NAME}`;

  // 描述包含所有维度信息
  const descParts: string[] = [];
  descParts.push(`最新${label}在线观看，高清完整版免费播放。`);
  if (filters.area) descParts.push(`精选${filters.area}地区${filters.category || '影视'}。`);
  if (filters.year) descParts.push(`${filters.year}年${filters.category || '影视'}推荐。`);
  if (totalCount > 0) descParts.push(`共${totalCount}部${label}。`);
  descParts.push('每日更新，支持手机在线观看。');

  // 关键词覆盖所有组合
  const kwParts: string[] = [label];
  if (filters.category) { kwParts.push(filters.category + '大全'); kwParts.push('最新' + filters.category); }
  if (filters.area) { kwParts.push(filters.area + filters.category || ''); kwParts.push(filters.area + '影视'); }
  if (filters.year) { kwParts.push(filters.year + '年' + (filters.category || '电影')); }
  kwParts.push(label + '在线观看', label + '免费观看', label + '高清', label + '排行榜', label + '推荐');

  return {
    title,
    description: descParts.join(''),
    keywords: [...new Set(kwParts)].join(',')
  };
}

// 交叉聚合页 FAQ（提升搜索富文本展示）
export function generateCrossFAQ(filters: { area?: string; year?: string; category?: string }, totalCount: number = 0): { question: string; answer: string }[] {
  const parts: string[] = [];
  if (filters.year) parts.push(filters.year + '年');
  if (filters.area) parts.push(filters.area);
  if (filters.category) parts.push(filters.category);
  const label = parts.join('') || '影视';

  return [
    { question: `哪里可以免费看${label}？`, answer: `${SITE_NAME}提供最新${label}在线免费观看，高清完整版，支持手机和电脑播放，无需下载。${totalCount > 0 ? '目前收录' + totalCount + '部' + label + '。' : ''}` },
    { question: `${filters.year || ''}${filters.category || '影视'}有什么好看的推荐？`, answer: `${SITE_NAME}每日更新${label}，涵盖${filters.area || '全球各地'}优质内容。支持按地区、年份、分类筛选，轻松找到你喜欢的${filters.category || '影视'}。` },
    { question: `${label}支持手机观看吗？`, answer: `支持。${SITE_NAME}全站视频均支持手机在线观看，打开浏览器即可播放，无需安装任何APP。同时支持PWA离线缓存功能。` }
  ];
}
