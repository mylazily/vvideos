// m3u8域名健康检测 API - 智能恢复策略
// GET /api/domain-health - 查看所有域名健康状态
// POST /api/domain-health/check - 手动触发检测
// POST /api/domain-health/{domain}/recover - 手动恢复域名

interface DomainHealth {
  domain: string;
  status: 'healthy' | 'unhealthy' | 'unknown' | 'recovering';
  lastCheck: number;
  failCount: number;
  successCount: number;        // 连续成功次数
  blockedAt: number | null;    // 首次屏蔽时间
  lastFailAt: number | null;   // 最后一次失败时间
  recoveryMode: 'auto' | 'manual' | 'permanent'; // 恢复模式
  checkHistory: Array<{        // 最近检测记录
    time: number;
    alive: boolean;
    latency: number;
  }>;
}

const CONFIG = {
  BLOCK_THRESHOLD: 3,           // 连续失败3次屏蔽
  RECOVERY_THRESHOLD: 2,        // 连续成功2次恢复
  MAX_HISTORY: 10,              // 保留最近10次检测记录
  
  // 自动恢复策略
  AUTO_RECOVER: {
    FIRST_CHECK: 24 * 60 * 60 * 1000,      // 24小时后首次检查
    SECOND_CHECK: 72 * 60 * 60 * 1000,     // 72小时后第二次检查
    FINAL_CHECK: 7 * 24 * 60 * 60 * 1000,  // 7天后最终检查
  },
  
  // 永久失效判定
  PERMANENT_FAIL: {
    DAYS: 14,                     // 14天都失败则判定永久失效
    MIN_CHECKS: 5,                // 至少检测5次
  }
};

// 从KV获取域名健康数据
async function getDomainHealth(env: any): Promise<Map<string, DomainHealth>> {
  try {
    const data = await env.VIDEOS_KV.get('domain_health_v2', 'json');
    return new Map(Object.entries(data || {}));
  } catch {
    return new Map();
  }
}

// 保存域名健康数据
async function saveDomainHealth(env: any, healthMap: Map<string, DomainHealth>) {
  const obj = Object.fromEntries(healthMap.entries());
  await env.VIDEOS_KV.put('domain_health_v2', JSON.stringify(obj), {
    expirationTtl: 86400 * 90 // 90天过期
  });
}

// 从视频数据中提取所有m3u8域名
async function extractM3u8Domains(env: any): Promise<string[]> {
  const domains = new Set<string>();
  
  try {
    // 从KV中扫描视频数据
    const list = await env.VIDEOS_KV.list({ prefix: 'video:' });
    
    // 采样检测 - 只检查前100个视频
    for (const key of list.keys.slice(0, 100)) {
      try {
        const data = await env.VIDEOS_KV.get(key, 'json');
        if (data?.play_sources) {
          for (const source of data.play_sources) {
            if (source.url) {
              try {
                const urlObj = new URL(source.url);
                if (urlObj.hostname) domains.add(urlObj.hostname);
              } catch {}
            }
          }
        }
      } catch {}
    }
  } catch (e) {
    console.error('提取域名失败:', e);
  }

  return Array.from(domains);
}

// 检测单个域名是否可用
async function checkDomain(domain: string): Promise<{ alive: boolean; latency: number; error?: string }> {
  const start = Date.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // 尝试多种检测方式
    const tests = [
      // 方式1: HEAD请求根路径
      async () => {
        const res = await fetch(`https://${domain}/`, {
          method: 'HEAD',
          signal: controller.signal,
          redirect: 'follow',
        });
        return res.ok || res.status === 403 || res.status === 404; // 403/404也算在线
      },
      // 方式2: 尝试访问常见路径
      async () => {
        const res = await fetch(`https://${domain}/index.html`, {
          method: 'HEAD',
          signal: controller.signal,
        });
        return res.ok || res.status < 500;
      },
    ];

    for (const test of tests) {
      try {
        const result = await test();
        if (result) {
          clearTimeout(timeout);
          return { alive: true, latency: Date.now() - start };
        }
      } catch {}
    }

    clearTimeout(timeout);
    return { alive: false, latency: Date.now() - start, error: '所有检测方式失败' };
  } catch (e: any) {
    return { alive: false, latency: Date.now() - start, error: e.message };
  }
}

// 判断是否应该检测（基于恢复策略）
function shouldCheck(health: DomainHealth): boolean {
  if (!health.blockedAt) return true; // 未屏蔽，正常检测
  
  const now = Date.now();
  const blockedDuration = now - health.blockedAt;
  
  // 根据恢复模式决定
  switch (health.recoveryMode) {
    case 'manual':
      // 手动模式：不自动检测，等待手动恢复
      return false;
      
    case 'permanent':
      // 永久失效：不再检测
      return false;
      
    case 'auto':
    default:
      // 自动恢复模式：按时间间隔检测
      const lastCheck = health.lastCheck || 0;
      const timeSinceLastCheck = now - lastCheck;
      
      // 24小时后首次检查
      if (blockedDuration > CONFIG.AUTO_RECOVER.FIRST_CHECK && 
          blockedDuration < CONFIG.AUTO_RECOVER.SECOND_CHECK &&
          timeSinceLastCheck > 12 * 60 * 60 * 1000) { // 每12小时检查一次
        return true;
      }
      
      // 72小时后第二次检查
      if (blockedDuration > CONFIG.AUTO_RECOVER.SECOND_CHECK && 
          blockedDuration < CONFIG.AUTO_RECOVER.FINAL_CHECK &&
          timeSinceLastCheck > 24 * 60 * 60 * 1000) { // 每24小时检查一次
        return true;
      }
      
      // 7天后最终检查
      if (blockedDuration > CONFIG.AUTO_RECOVER.FINAL_CHECK &&
          timeSinceLastCheck > 48 * 60 * 60 * 1000) { // 每48小时检查一次
        return true;
      }
      
      return false;
  }
}

// 更新域名健康状态
function updateHealth(health: DomainHealth, checkResult: { alive: boolean; latency: number }): DomainHealth {
  const now = Date.now();
  
  // 更新检测历史
  health.checkHistory.unshift({
    time: now,
    alive: checkResult.alive,
    latency: checkResult.latency,
  });
  health.checkHistory = health.checkHistory.slice(0, CONFIG.MAX_HISTORY);
  
  health.lastCheck = now;
  
  if (checkResult.alive) {
    // 检测成功
    health.successCount++;
    health.failCount = 0;
    
    // 连续成功达到阈值，恢复域名
    if (health.successCount >= CONFIG.RECOVERY_THRESHOLD && health.blockedAt) {
      health.status = 'healthy';
      health.blockedAt = null;
      health.lastFailAt = null;
      health.recoveryMode = 'auto';
      console.log(`[域名恢复] ${health.domain} 已恢复`);
    } else if (health.blockedAt) {
      health.status = 'recovering';
    } else {
      health.status = 'healthy';
    }
  } else {
    // 检测失败
    health.failCount++;
    health.successCount = 0;
    health.lastFailAt = now;
    
    // 连续失败达到阈值，屏蔽域名
    if (health.failCount >= CONFIG.BLOCK_THRESHOLD && !health.blockedAt) {
      health.status = 'unhealthy';
      health.blockedAt = now;
      health.recoveryMode = 'auto'; // 默认自动恢复模式
      console.log(`[域名屏蔽] ${health.domain} 已屏蔽`);
    } else if (!health.blockedAt) {
      health.status = 'unknown';
    }
    
    // 检查是否永久失效
    if (health.blockedAt) {
      const blockedDays = (now - health.blockedAt) / (24 * 60 * 60 * 1000);
      const failChecks = health.checkHistory.filter(h => !h.alive).length;
      
      if (blockedDays >= CONFIG.PERMANENT_FAIL.DAYS && 
          failChecks >= CONFIG.PERMANENT_FAIL.MIN_CHECKS) {
        health.recoveryMode = 'permanent';
        health.status = 'unhealthy';
        console.log(`[域名永久失效] ${health.domain} 判定为永久失效`);
      }
    }
  }
  
  return health;
}

// 获取被屏蔽的域名列表
export async function getBlockedDomains(env: any): Promise<string[]> {
  const healthMap = await getDomainHealth(env);
  const blocked: string[] = [];
  
  for (const [domain, health] of healthMap.entries()) {
    // 只有明确被屏蔽且未恢复的才算
    if (health.blockedAt && health.status !== 'healthy' && health.status !== 'recovering') {
      blocked.push(domain);
    }
  }
  
  return blocked;
}

// 手动恢复域名
async function manualRecoverDomain(env: any, domain: string): Promise<boolean> {
  const healthMap = await getDomainHealth(env);
  const health = healthMap.get(domain);
  
  if (!health) return false;
  
  // 立即检测一次
  const result = await checkDomain(domain);
  
  if (result.alive) {
    // 检测成功，恢复域名
    health.status = 'healthy';
    health.blockedAt = null;
    health.lastFailAt = null;
    health.failCount = 0;
    health.successCount = 1;
    health.recoveryMode = 'manual';
    health.lastCheck = Date.now();
    
    healthMap.set(domain, health);
    await saveDomainHealth(env, healthMap);
    
    return true;
  }
  
  return false;
}

// 设置域名恢复模式
async function setRecoveryMode(env: any, domain: string, mode: 'auto' | 'manual' | 'permanent'): Promise<boolean> {
  const healthMap = await getDomainHealth(env);
  const health = healthMap.get(domain);
  
  if (!health) return false;
  
  health.recoveryMode = mode;
  healthMap.set(domain, health);
  await saveDomainHealth(env, healthMap);
  
  return true;
}

export const onRequest: PagesFunction = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;

  // CORS
  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  try {
    // GET /api/domain-health - 查看所有域名健康状态
    if (method === 'GET' && path === '/api/domain-health') {
      const healthMap = await getDomainHealth(env);
      const allDomains: Array<{
        domain: string;
        status: string;
        failCount: number;
        successCount: number;
        blocked: boolean;
        blockedAt: string | null;
        recoveryMode: string;
        lastCheck: string | null;
        checkCount: number;
      }> = [];
      
      for (const [domain, health] of healthMap.entries()) {
        allDomains.push({
          domain,
          status: health.status,
          failCount: health.failCount,
          successCount: health.successCount,
          blocked: !!health.blockedAt && health.status !== 'healthy',
          blockedAt: health.blockedAt ? new Date(health.blockedAt).toISOString() : null,
          recoveryMode: health.recoveryMode,
          lastCheck: health.lastCheck ? new Date(health.lastCheck).toISOString() : null,
          checkCount: health.checkHistory.length,
        });
      }

      // 按状态排序： unhealthy > recovering > unknown > healthy
      const statusOrder = { unhealthy: 0, recovering: 1, unknown: 2, healthy: 3 };
      allDomains.sort((a, b) => (statusOrder[a.status as keyof typeof statusOrder] || 4) - (statusOrder[b.status as keyof typeof statusOrder] || 4));

      return new Response(JSON.stringify({
        success: true,
        data: {
          domains: allDomains,
          blockedCount: allDomains.filter(d => d.blocked).length,
          recoveringCount: allDomains.filter(d => d.status === 'recovering').length,
          totalDomains: allDomains.length,
          config: {
            blockThreshold: CONFIG.BLOCK_THRESHOLD,
            recoveryThreshold: CONFIG.RECOVERY_THRESHOLD,
            autoRecover: {
              firstCheck: '24小时',
              secondCheck: '72小时',
              finalCheck: '7天',
            },
            permanentFail: {
              days: CONFIG.PERMANENT_FAIL.DAYS,
              minChecks: CONFIG.PERMANENT_FAIL.MIN_CHECKS,
            }
          }
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // POST /api/domain-health/check - 手动触发检测
    if (method === 'POST' && path === '/api/domain-health/check') {
      const healthMap = await getDomainHealth(env);
      const allDomains = await extractM3u8Domains(env);
      
      const results: Array<{
        domain: string;
        checked: boolean;
        alive?: boolean;
        latency?: number;
        error?: string;
        previousStatus?: string;
        newStatus?: string;
      }> = [];
      
      // 分批检测
      const batchSize = 5;
      for (let i = 0; i < allDomains.length; i += batchSize) {
        const batch = allDomains.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (domain) => {
            const existing = healthMap.get(domain) || {
              domain,
              status: 'unknown' as const,
              lastCheck: 0,
              failCount: 0,
              successCount: 0,
              blockedAt: null,
              lastFailAt: null,
              recoveryMode: 'auto' as const,
              checkHistory: [],
            };
            
            // 判断是否需要进行检测
            const needCheck = !existing.blockedAt || shouldCheck(existing);
            
            if (!needCheck) {
              results.push({
                domain,
                checked: false,
                previousStatus: existing.status,
                newStatus: existing.status,
              });
              return;
            }
            
            const checkResult = await checkDomain(domain);
            const previousStatus = existing.status;
            
            // 更新健康状态
            const updated = updateHealth(existing, checkResult);
            healthMap.set(domain, updated);
            
            results.push({
              domain,
              checked: true,
              alive: checkResult.alive,
              latency: checkResult.latency,
              error: checkResult.error,
              previousStatus,
              newStatus: updated.status,
            });
          })
        );
      }

      await saveDomainHealth(env, healthMap);

      return new Response(JSON.stringify({
        success: true,
        data: {
          checked: results.filter(r => r.checked).length,
          skipped: results.filter(r => !r.checked).length,
          results: results,
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // POST /api/domain-health/{domain}/recover - 手动恢复域名
    if (method === 'POST' && path.includes('/recover')) {
      const match = path.match(/\/domain-health\/([^\/]+)\/recover/);
      if (!match) {
        return new Response(JSON.stringify({ success: false, message: '无效的域名' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      
      const domain = decodeURIComponent(match[1]);
      const recovered = await manualRecoverDomain(env, domain);
      
      if (recovered) {
        return new Response(JSON.stringify({
          success: true,
          message: `域名 ${domain} 已恢复`,
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          message: `域名 ${domain} 检测失败，无法恢复`,
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // POST /api/domain-health/{domain}/mode - 设置恢复模式
    if (method === 'POST' && path.includes('/mode')) {
      const match = path.match(/\/domain-health\/([^\/]+)\/mode/);
      if (!match) {
        return new Response(JSON.stringify({ success: false, message: '无效的域名' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      
      const domain = decodeURIComponent(match[1]);
      const body = await request.json().catch(() => ({}));
      const mode = body.mode as 'auto' | 'manual' | 'permanent';
      
      if (!['auto', 'manual', 'permanent'].includes(mode)) {
        return new Response(JSON.stringify({ success: false, message: '无效的恢复模式' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      
      const success = await setRecoveryMode(env, domain, mode);
      
      if (success) {
        return new Response(JSON.stringify({
          success: true,
          message: `域名 ${domain} 恢复模式已设置为 ${mode}`,
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          message: `域名 ${domain} 不存在`,
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    return new Response(JSON.stringify({ success: false, message: '未知操作' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e: any) {
    console.error('[域名健康API] 错误:', e);
    return new Response(JSON.stringify({
      success: false,
      message: e.message || '操作失败'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
