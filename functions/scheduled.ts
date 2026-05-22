// 定时检测m3u8域名健康状态
// Cloudflare Cron Trigger - 每小时执行一次

interface DomainHealth {
  domain: string;
  status: 'healthy' | 'unhealthy' | 'unknown' | 'recovering';
  lastCheck: number;
  failCount: number;
  successCount: number;
  blockedAt: number | null;
  lastFailAt: number | null;
  recoveryMode: 'auto' | 'manual' | 'permanent';
  checkHistory: Array<{
    time: number;
    alive: boolean;
    latency: number;
  }>;
}

const CONFIG = {
  BLOCK_THRESHOLD: 3,
  RECOVERY_THRESHOLD: 2,
  MAX_HISTORY: 10,
  AUTO_RECOVER: {
    FIRST_CHECK: 24 * 60 * 60 * 1000,
    SECOND_CHECK: 72 * 60 * 60 * 1000,
    FINAL_CHECK: 7 * 24 * 60 * 60 * 1000,
  },
  PERMANENT_FAIL: {
    DAYS: 14,
    MIN_CHECKS: 5,
  }
};

async function getDomainHealth(env: any): Promise<Map<string, DomainHealth>> {
  try {
    const data = await env.VIDEOS_KV.get('domain_health_v2', 'json');
    return new Map(Object.entries(data || {}));
  } catch {
    return new Map();
  }
}

async function saveDomainHealth(env: any, healthMap: Map<string, DomainHealth>) {
  const obj = Object.fromEntries(healthMap.entries());
  await env.VIDEOS_KV.put('domain_health_v2', JSON.stringify(obj), {
    expirationTtl: 86400 * 90
  });
}

async function extractM3u8Domains(env: any): Promise<string[]> {
  const domains = new Set<string>();
  
  try {
    const list = await env.VIDEOS_KV.list({ prefix: 'video:' });
    
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
  } catch {}

  return Array.from(domains);
}

async function checkDomain(domain: string): Promise<{ alive: boolean; latency: number }> {
  const start = Date.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const tests = [
      async () => {
        const res = await fetch(`https://${domain}/`, {
          method: 'HEAD',
          signal: controller.signal,
          redirect: 'follow',
        });
        return res.ok || res.status === 403 || res.status === 404;
      },
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
    return { alive: false, latency: Date.now() - start };
  } catch {
    return { alive: false, latency: Date.now() - start };
  }
}

function shouldCheck(health: DomainHealth): boolean {
  if (!health.blockedAt) return true;
  
  const now = Date.now();
  const blockedDuration = now - health.blockedAt;
  
  switch (health.recoveryMode) {
    case 'manual':
    case 'permanent':
      return false;
      
    case 'auto':
    default:
      const lastCheck = health.lastCheck || 0;
      const timeSinceLastCheck = now - lastCheck;
      
      if (blockedDuration > CONFIG.AUTO_RECOVER.FIRST_CHECK && 
          blockedDuration < CONFIG.AUTO_RECOVER.SECOND_CHECK &&
          timeSinceLastCheck > 12 * 60 * 60 * 1000) {
        return true;
      }
      
      if (blockedDuration > CONFIG.AUTO_RECOVER.SECOND_CHECK && 
          blockedDuration < CONFIG.AUTO_RECOVER.FINAL_CHECK &&
          timeSinceLastCheck > 24 * 60 * 60 * 1000) {
        return true;
      }
      
      if (blockedDuration > CONFIG.AUTO_RECOVER.FINAL_CHECK &&
          timeSinceLastCheck > 48 * 60 * 60 * 1000) {
        return true;
      }
      
      return false;
  }
}

function updateHealth(health: DomainHealth, checkResult: { alive: boolean; latency: number }): DomainHealth {
  const now = Date.now();
  
  health.checkHistory.unshift({
    time: now,
    alive: checkResult.alive,
    latency: checkResult.latency,
  });
  health.checkHistory = health.checkHistory.slice(0, CONFIG.MAX_HISTORY);
  
  health.lastCheck = now;
  
  if (checkResult.alive) {
    health.successCount++;
    health.failCount = 0;
    
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
    health.failCount++;
    health.successCount = 0;
    health.lastFailAt = now;
    
    if (health.failCount >= CONFIG.BLOCK_THRESHOLD && !health.blockedAt) {
      health.status = 'unhealthy';
      health.blockedAt = now;
      health.recoveryMode = 'auto';
      console.log(`[域名屏蔽] ${health.domain} 已屏蔽`);
    } else if (!health.blockedAt) {
      health.status = 'unknown';
    }
    
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

export const scheduled: ExportedHandlerScheduled<Env> = async (event, env, ctx) => {
  const healthMap = await getDomainHealth(env);
  const domains = await extractM3u8Domains(env);
  
  console.log(`[定时检测] 开始检测 ${domains.length} 个域名`);
  
  const batchSize = 5;
  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    
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
        
        const needCheck = !existing.blockedAt || shouldCheck(existing);
        if (!needCheck) return;
        
        const result = await checkDomain(domain);
        const updated = updateHealth(existing, result);
        healthMap.set(domain, updated);
      })
    );
  }

  await saveDomainHealth(env, healthMap);

  const blockedCount = Array.from(healthMap.values()).filter(h => h.blockedAt && h.status !== 'healthy').length;
  const recoveringCount = Array.from(healthMap.values()).filter(h => h.status === 'recovering').length;
  
  console.log(`[定时检测] 完成。总域名: ${domains.length}, 屏蔽: ${blockedCount}, 恢复中: ${recoveringCount}`);
};
