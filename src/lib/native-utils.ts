// 原生 JS 工具库 - 零依赖高性能

// ======== 防抖（原生实现）========
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ======== 节流（原生实现）========
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// ======== 本地存储（带过期时间）========
export const storage = {
  get<T>(key: string, defaultValue?: T): T | undefined {
    try {
      const item = localStorage.getItem(key);
      if (!item) return defaultValue;
      
      const parsed = JSON.parse(item);
      if (parsed.expiry && Date.now() > parsed.expiry) {
        localStorage.removeItem(key);
        return defaultValue;
      }
      return parsed.value;
    } catch {
      return defaultValue;
    }
  },
  
  set<T>(key: string, value: T, ttl?: number): void {
    try {
      const data: { value: T; expiry?: number } = { value };
      if (ttl) data.expiry = Date.now() + ttl;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn('Storage set failed:', e);
    }
  },
  
  remove(key: string): void {
    localStorage.removeItem(key);
  },
  
  clear(): void {
    localStorage.clear();
  }
};

// ======== 内存缓存（LRU）========
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  
  constructor(private maxSize: number) {}
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 移动到末尾（最新）
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 删除最旧的
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
  
  clear(): void {
    this.cache.clear();
  }
}

export const apiCache = new LRUCache<string, any>(100);

// ======== 请求池（限制并发）========
class RequestPool {
  private queue: (() => Promise<void>)[] = [];
  private running = 0;
  
  constructor(private maxConcurrent: number) {}
  
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        this.running++;
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        } finally {
          this.running--;
          this.processQueue();
        }
      };
      
      if (this.running < this.maxConcurrent) {
        task();
      } else {
        this.queue.push(task);
      }
    });
  }
  
  private processQueue() {
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const task = this.queue.shift();
      task?.();
    }
  }
}

export const requestPool = new RequestPool(6); // 最大6个并发

// ======== 轻量级事件总线 ========
class EventBus {
  private events = new Map<string, Set<(data?: any) => void>>();
  
  on(event: string, callback: (data?: any) => void): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback);
    
    return () => this.off(event, callback);
  }
  
  off(event: string, callback: (data?: any) => void): void {
    this.events.get(event)?.delete(callback);
  }
  
  emit(event: string, data?: any): void {
    this.events.get(event)?.forEach(cb => {
      try { cb(data); } catch (e) { console.error(e); }
    });
  }
  
  once(event: string, callback: (data?: any) => void): void {
    const wrapper = (data?: any) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
  }
}

export const eventBus = new EventBus();

// ======== 轻量级 Fetch 封装（带缓存）========
interface FetchOptions extends RequestInit {
  cache?: boolean;
  cacheTTL?: number;
  retry?: number;
}

export async function nativeFetch<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { cache = false, cacheTTL = 60000, retry = 1, ...fetchOptions } = options;
  
  // 检查缓存
  if (cache) {
    const cached = apiCache.get(url);
    if (cached) return cached;
  }
  
  let lastError: Error;
  
  for (let i = 0; i <= retry; i++) {
    try {
      const response = await fetch(url, fetchOptions);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      
      if (cache) {
        apiCache.set(url, data);
      }
      
      return data;
    } catch (e) {
      lastError = e as Error;
      if (i < retry) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  
  throw lastError!;
}

// ======== 图片懒加载（原生 IntersectionObserver）========
export function lazyLoadImages(selector = 'img[data-src]'): void {
  if (!('IntersectionObserver' in window)) {
    // 回退：直接加载
    document.querySelectorAll(selector).forEach((img) => {
      const src = img.getAttribute('data-src');
      if (src) (img as HTMLImageElement).src = src;
    });
    return;
  }
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement;
        const src = img.getAttribute('data-src');
        if (src) {
          img.src = src;
          img.removeAttribute('data-src');
        }
        observer.unobserve(img);
      }
    });
  }, {
    rootMargin: '50px 0px',
    threshold: 0.01
  });
  
  document.querySelectorAll(selector).forEach((img) => {
    observer.observe(img);
  });
}

// ======== 页面可见性管理 ========
export function onPageVisible(callback: () => void): () => void {
  const handler = () => {
    if (!document.hidden) callback();
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

// ======== 网络状态监听 ========
export function onNetworkChange(callback: (online: boolean) => void): () => void {
  const onlineHandler = () => callback(true);
  const offlineHandler = () => callback(false);
  
  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);
  
  return () => {
    window.removeEventListener('online', onlineHandler);
    window.removeEventListener('offline', offlineHandler);
  };
}

// ======== 性能监控 ========
export function measurePerformance(name: string, fn: () => void): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  const duration = end - start;
  console.log(`[Perf] ${name}: ${duration.toFixed(2)}ms`);
  return duration;
}

// ======== 批量 DOM 操作（减少重排）========
export function batchDOMUpdates(updates: (() => void)[]): void {
  requestAnimationFrame(() => {
    // 强制读取，触发一次重排
    document.body.offsetHeight;
    
    // 批量写入
    updates.forEach(fn => fn());
  });
}
