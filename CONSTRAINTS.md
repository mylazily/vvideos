# 必爱必爱 开发约束底线

> **以下规则为不可违反的底线，任何代码修改都必须遵守。违反即回滚。**

---

## 一、UI 锁定约束（永不修改）

### 1.1 首页视频卡片布局
**锁定版本**：`https://915b8d19.evideos.pages.dev/`

```
grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-2
```

| 屏幕宽度 | 列数 |
|----------|------|
| < 640px (手机) | 2 列 |
| ≥ 640px (sm) | 3 列 |
| ≥ 768px (md) | 4 列 |
| ≥ 1024px (lg) | 5 列 |
| ≥ 1280px (xl) | 6 列 |

**❌ 禁止修改**：无论任何理由，视频卡片布局永不改为固定列数。

### 1.2 视频卡片内容
每个卡片包含：
- 封面图（`aspect-video`，16:9）
- 时长标记（右下角，黑色半透明背景）
- 标题（`text-sm`，两行截断）
- 副标题（`text-xs`，灰色，显示"分类 · 集数"）

**❌ 禁止修改**：卡片内容、字体大小、间距永不改变。

### 1.3 首页结构
```
搜索框（sticky top）
↓
视频网格（24个）
↓
底部导航（fixed bottom）
```

**❌ 禁止添加**：轮播图、广告、推荐区、分类入口、公告等任何额外元素。

---

## 二、性能底线

### 2.1 首页加载
- **首页必须是纯静态 HTML**（`prerender = true`, `csr = false`）
- **首页零外部 JS 下载**（唯一允许的 JS 是 `app.html` 中 ~1.5KB 内联脚本）
- **首页不允许加载 HLS.js**（只在视频详情页按需加载）
- **首页不允许加载 SvelteKit 框架 JS**

### 2.2 首页数据源
- 每 2 小时从 10 个分片中轮换选 1 个，取 24 条最新视频
- 边缘缓存 TTL = 2 小时（`CACHE_TTL.home = 7200`）
- Service Worker API 缓存 TTL = 10 分钟

### 2.3 视频播放
- HLS.js 只在视频详情页动态 `import('hls.js/light')`
- 播放器缓冲区：`maxBufferLength = 30`（30秒），`maxMaxBufferLength = 300`（5分钟）
- 缓存策略：5-10 分钟（SW `API_TTL`）
- 不允许 `preload="auto"`，使用 `preload="metadata"`

---

## 三、成本约束（10万DAU全免费）

### 3.1 目标指标
| 指标 | 目标值 | 成本影响 |
|------|--------|----------|
| 日活跃用户 (DAU) | 100,000 | - |
| 每用户观看视频数 | 15 | - |
| 总日播放量 | 1,500,000 | - |
| Cloudflare 费用 | **$0** | 免费额度内 |

### 3.2 Cloudflare 免费额度
| 资源 | 免费额度 | 预估日用量 | 余量 |
|------|----------|------------|------|
| Pages 请求 | 100,000/月 | ~3,000,000 | ⚠️ 需优化 |
| Workers 请求 | 100,000/日 | ~1,500,000 | ⚠️ 需优化 |
| D1 读 | 5,000,000/日 | ~1,500,000 | ✅ |
| D1 写 | 100,000/日 | ~10,000 | ✅ |

### 3.3 成本优化策略
1. **首页纯静态**：不走 Workers，直接 Pages 静态响应
2. **边缘缓存**：API 响应缓存 2 小时，减少 D1 读取
3. **SW 缓存**：客户端缓存 10 分钟，减少重复请求
4. **图片走外链**：封面图来自 `xinlangtupian.com`，不占 CF 流量

### 3.4 禁止增加成本的行为
- ❌ 封面图上传到 CF R2（用外链）
- ❌ 视频文件存储到 CF（用第三方源）
- ❌ 使用 CF Workers 付费功能
- ❌ 使用 CF D1 付费额度

---

## 四、资源约束

### 4.1 图片
- **全站不允许任何 SVG 文件**
- **全站不允许除视频封面外的任何图片**（无 logo、无 banner、无占位图、无 icon 图片）
- Favicon 只允许 `favicon.png`
- OG/Twitter meta 不引用图片

### 4.2 字体与图标
- 使用系统字体栈：`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- 不允许加载任何自定义字体文件
- 图标使用纯文本/emoji，不允许 icon font 或 SVG icon

---

## 五、代码规范

### 5.1 不允许做的事情
- ❌ 在 layout 中 `import('hls.js')`（会导致首页预加载 334KB）
- ❌ 在首页 Svelte 模板中使用 `{@html <script>}`（会被 Svelte SSR 注释掉）
- ❌ 修改首页的 `csr`/`prerender` 配置
- ❌ 添加任何非封面图片或 SVG
- ❌ 在首页添加搜索框、视频卡片、底部导航以外的任何 UI 元素
- ❌ **修改视频卡片布局**（`grid-cols-2 sm:grid-cols-3 ...` 永不修改）
- ❌ 修改分片算法（写入端和读取端必须一致使用 FNV-1a）

### 5.2 必须做的事情
- ✅ 首页内联脚本放在 `app.html` 的 `</body>` 前（不是 Svelte 模板中）
- ✅ 视频详情页的 HLS.js 使用 `preloadHls()` 在 `onMount` 中预加载
- ✅ 所有 API 路由使用边缘缓存
- ✅ SW 版本号每次修改时递增
- ✅ 每次修改后 `git push` 到 GitHub

---

## 六、部署检查清单

每次部署前必须验证：

1. [ ] 首页网络请求中没有 JS 文件（只有 CSS + API + 图片）
2. [ ] 首页视频卡片布局是 `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`
3. [ ] 首页只有搜索框 + 视频 + 底部导航
4. [ ] 视频详情页播放器正常加载
5. [ ] 全站没有 SVG 文件引用
6. [ ] 没有非封面图片
7. [ ] `git push` 到 GitHub

---

## 七、架构概览

```
首页 (/)
├── prerender = true, csr = false
├── 纯静态 HTML，零 JS
├── app.html 内联脚本动态刷新数据
└── API: /api/home → 每2小时轮换分片，取24条

视频详情 (/v/[id])
├── SPA 路由（走 Functions → 200.html）
├── HLS.js 按需加载
└── API: /api/video/[id] → FNV-1a 定向分片

其他页面（发现/分类/搜索/排行/个人）
├── SPA 路由
└── 正常 SvelteKit 渲染
```

---

## 八、版本锁定

| 组件 | 锁定版本 | 参考URL |
|------|----------|---------|
| 首页 UI | `e2fd53b` | https://915b8d19.evideos.pages.dev/ |
| 视频卡片布局 | `e2fd53b` | 同上 |

**任何 UI 修改必须先确认与锁定版本一致。**
