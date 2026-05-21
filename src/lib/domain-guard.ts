// 域名防护系统 - 多域名备份 + 自动跳转

// 备用域名列表（按优先级排序）
export const BACKUP_DOMAINS = [
  { domain: 'evideos.pages.dev', name: '主站', priority: 1 },
  { domain: 'vvideos.pages.dev', name: '备用1', priority: 2 },
  // 添加更多备用域名
  // { domain: 'xxx.pages.dev', name: '备用2', priority: 3 },
  // { domain: 'xxx.xyz', name: '备用3', priority: 4 },
];

// 获取当前域名
export function getCurrentDomain(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname;
}

// 检测域名是否可访问
export async function checkDomainAccessible(domain: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const res = await fetch(`https://${domain}/api/health`, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'cors'
    });
    
    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

// 获取下一个可用域名
export async function getNextAvailableDomain(): Promise<string | null> {
  const currentDomain = getCurrentDomain();
  
  for (const backup of BACKUP_DOMAINS) {
    if (backup.domain === currentDomain) continue;
    
    const accessible = await checkDomainAccessible(backup.domain);
    if (accessible) {
      return backup.domain;
    }
  }
  
  return null;
}

// 保存当前路径，跳转时携带
export function saveCurrentPath(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('redirect_path', window.location.pathname + window.location.search);
}

// 获取保存的路径
export function getSavedPath(): string {
  if (typeof window === 'undefined') return '/';
  return sessionStorage.getItem('redirect_path') || '/';
}

// 跳转到备用域名
export function redirectToBackup(domain: string): void {
  if (typeof window === 'undefined') return;
  const path = getSavedPath();
  window.location.href = `https://${domain}${path}`;
}

// 域名健康检查 API
export async function fetchDomainHealth(): Promise<{ status: string; domain: string } | null> {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // 域名不可访问
  }
  return null;
}

// 初始化域名防护
export async function initDomainGuard(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  // 保存当前路径
  saveCurrentPath();
  
  // 检查是否有跳转标记
  const fromBackup = sessionStorage.getItem('from_backup');
  if (fromBackup) {
    sessionStorage.removeItem('from_backup');
    return; // 已经是从备用域名跳转过来的，不再检查
  }
  
  // 检查当前域名是否可访问
  const health = await fetchDomainHealth();
  if (!health) {
    // 当前域名不可访问，尝试跳转到备用域名
    const nextDomain = await getNextAvailableDomain();
    if (nextDomain) {
      sessionStorage.setItem('from_backup', 'true');
      redirectToBackup(nextDomain);
    }
  }
}

// 获取所有备用域名链接（用于用户手动选择）
export function getBackupLinks(): { domain: string; name: string; url: string }[] {
  const currentDomain = getCurrentDomain();
  const path = getSavedPath();
  
  return BACKUP_DOMAINS
    .filter(b => b.domain !== currentDomain)
    .map(b => ({
      domain: b.domain,
      name: b.name,
      url: `https://${b.domain}${path}`
    }));
}
