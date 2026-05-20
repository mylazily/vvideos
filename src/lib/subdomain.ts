// 子域名动态标题劫持
// 检测当前访问的子域名，动态修改页面标题和描述
// 例如: kuangbiao.evideos.pages.dev → 标题变为《狂飙》相关

export interface SubdomainConfig {
  title: string;
  description: string;
  keywords: string;
}

// 子域名映射表（可扩展）
const SUBDOMAIN_MAP: Record<string, SubdomainConfig> = {
  // 示例：当用泛解析绑定子域名时生效
  // 'kuangbiao': { title: '狂飙全集在线观看', description: '狂飙电视剧全集在线观看，高清完整版免费播放。', keywords: '狂飙,狂飙在线观看,狂飙全集,狂飙电视剧' },
};

// 从 hostname 提取子域名
export function getSubdomain(): string | null {
  if (typeof window === 'undefined') return null;
  const hostname = window.location.hostname;
  
  // evideos.pages.dev 的子域名
  const parts = hostname.split('.');
  if (parts.length >= 3 && parts[parts.length - 2] === 'pages' && parts[parts.length - 1] === 'dev') {
    return parts[0];
  }
  
  // 自定义域名的子域名
  if (parts.length >= 3) {
    return parts[0];
  }
  
  return null;
}

// 获取子域名配置
export function getSubdomainConfig(): SubdomainConfig | null {
  const subdomain = getSubdomain();
  if (!subdomain) return null;
  return SUBDOMAIN_MAP[subdomain] || null;
}

// 动态修改页面标题
export function applySubdomainSEO(): void {
  const config = getSubdomainConfig();
  if (!config) return;
  
  document.title = config.title + ' - 必爱必爱';
  
  // 更新 meta description
  let metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute('content', config.description);
  } else {
    metaDesc = document.createElement('meta');
    metaDesc.name = 'description';
    metaDesc.content = config.description;
    document.head.appendChild(metaDesc);
  }
  
  // 更新 meta keywords
  let metaKeywords = document.querySelector('meta[name="keywords"]');
  if (metaKeywords) {
    metaKeywords.setAttribute('content', config.keywords);
  } else {
    metaKeywords = document.createElement('meta');
    metaKeywords.name = 'keywords';
    metaKeywords.content = config.keywords;
    document.head.appendChild(metaKeywords);
  }
  
  // 更新 canonical
  let canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    canonical.setAttribute('href', window.location.origin);
  }
}
