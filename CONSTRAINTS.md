# 必爱必爱 开发约束底线

> **以下规则为不可违反的底线，任何代码修改都必须遵守。违反即回滚。**

---

## 一、开发流程约束

### 1.1 每次更新必须推送 GitHub
- ✅ **任何代码修改后必须 `git add && git commit && git push`**
- ✅ commit message 必须清晰说明修改内容
- ❌ 禁止本地堆积未推送的修改

### 1.2 约束优先原则
- **所有修改必须在约束框架下进行**
- 修改前先阅读本文档，确认不违反任何约束
- 如修改与约束冲突，**约束优先，修改作废**
- 新增约束需先更新本文档，再进行相关开发

---

## 二、性能约束（极速底线）

### 2.1 首页性能指标
| 指标 | 目标值 | 测量方式 |
|------|--------|----------|
| **FCP (首次内容绘制)** | < 0.3s | Lighthouse |
| **LCP (最大内容绘制)** | < 0.5s | Lighthouse |
| **TTI (可交互时间)** | < 0.5s | Lighthouse |
| **CLS (累积布局偏移)** | < 0.05 | Lighthouse |
| **JS 下载量** | 0 KB | 网络面板 |
| **HTML 大小** | < 10 KB | gzip 后 |

### 2.2 全站性能指标
| 指标 | 目标值 |
|------|--------|
| **页面切换** | < 100ms |
| **API 响应** | < 200ms (P95) |
| **视频起播** | < 1s |
| **首屏渲染** | < 300ms |

### 2.3 首页技术实现
- **必须是纯静态 HTML**（`prerender = true`, `csr = false`）
- **零外部 JS 下载**（唯一允许的 JS 是 `app.html` 中 ~1.5KB 内联脚本）
- **不允许加载 HLS.js**（只在视频详情页按需加载）
- **不允许加载 SvelteKit 框架 JS**
- **CSS 必须内联或通过 link 预加载**

### 2.4 缓存策略
| 资源类型 | 边缘缓存 | SW 缓存 | 说明 |
|----------|----------|---------|------|
| 首页 HTML | 2 小时 | 1 小时 | 静态预渲染 |
| API 响应 | 2 小时 | 10 分钟 | Stale-While-Revalidate |
| 视频封面 | 无 | LRU 300 | 走外链 CDN |
| JS/CSS | 1 年 | 永久 | 带 hash |

### 2.5 视频播放优化
- HLS.js 只在视频详情页动态 `import('hls.js/light')`
- 播放器缓冲区：`maxBufferLength = 30`（30秒），`maxMaxBufferLength = 300`（5分钟）
- 不允许 `preload="auto"`，使用 `preload="metadata"`

---

## 三、UI 锁定约束（永不修改）

### 3.1 首页视频卡片布局
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

### 3.2 视频卡片内容
每个卡片包含：
- 封面图（`aspect-video`，16:9）
- 时长标记（右下角，黑色半透明背景）
- 标题（`text-sm`，两行截断）
- 副标题（`text-xs`，灰色，显示"分类 · 集数"）

**❌ 禁止修改**：卡片内容、字体大小、间距永不改变。

### 3.3 首页结构
```
搜索框（sticky top）
↓
视频网格（24个）
↓
底部导航（fixed bottom）
```

**❌ 禁止添加**：轮播图、广告、推荐区、分类入口、公告等任何额外元素。

---

## 四、数据约束

### 4.1 系统不内置任何分类/标签数据
- ❌ **禁止在代码中硬编码分类列表**
- ❌ **禁止在代码中硬编码标签列表**
- ❌ **禁止在代码中硬编码关键字列表**
- ❌ **禁止在代码中硬编码热搜词列表**

### 4.2 分类/标签数据来源
所有分类、标签、热搜词数据必须：
1. **从数据库动态读取**，或
2. **从用户输入生成**，或
3. **从视频元数据聚合统计**

### 4.3 自定义热搜词/标签机制
```
热搜词来源：
├── 用户搜索词统计（按频次排序）
├── 视频标签聚合（按关联数排序）
└── 管理员配置（可选，存数据库）

标签来源：
├── 视频自带标签（vod_tags 字段）
├── 用户添加标签（UGC）
└── AI 自动生成（可选）

分类来源：
├── 视频自带分类（type_name 字段）
└── 用户自定义分类（存数据库）
```

---

## 五、SEO 约束

### 5.1 全站 SEO 必备项
每个页面必须包含：
- ✅ `<title>` 标签（唯一、描述性）
- ✅ `<meta name="description">`（120-160 字符）
- ✅ `<link rel="canonical">`（规范 URL）
- ✅ Open Graph 标签（og:title, og:description, og:type, og:url）
- ✅ Twitter Card 标签（twitter:card, twitter:title, twitter:description）

### 5.2 结构化数据
| 页面类型 | 必需 JSON-LD |
|----------|--------------|
| 首页 | WebSite + SearchAction |
| 视频详情 | VideoObject + BreadcrumbList |
| 分类页 | BreadcrumbList + ItemList |
| 搜索结果 | SearchResultsPage |

### 5.3 技术SEO
- ✅ 所有页面必须有语义化 HTML（`<main>`, `<nav>`, `<article>`, `<header>`）
- ✅ 图片必须有 `alt` 属性
- ✅ 链接必须有描述性文本
- ✅ 表单必须有 `label` 关联
- ✅ 页面必须有 `<h1>` 且唯一

### 5.4 禁止的 SEO 行为
- ❌ 隐藏文本/链接
- ❌ 重复内容（canonical 除外）
- ❌ 关键词堆砌
- ❌ 伪装内容（cloaking）

---

## 六、成本约束（10万DAU全免费）

### 6.1 目标指标
| 指标 | 目标值 | 成本影响 |
|------|--------|----------|
| 日活跃用户 (DAU) | 100,000 | - |
| 每用户观看视频数 | 15 | - |
| 总日播放量 | 1,500,000 | - |
| Cloudflare 费用 | **$0** | 免费额度内 |

### 6.2 Cloudflare 免费额度
| 资源 | 免费额度 | 预估日用量 | 余量 |
|------|----------|------------|------|
| Pages 请求 | 100,000/月 | ~3,000,000 | ⚠️ 需优化 |
| Workers 请求 | 100,000/日 | ~1,500,000 | ⚠️ 需优化 |
| D1 读 | 5,000,000/日 | ~1,500,000 | ✅ |
| D1 写 | 100,000/日 | ~10,000 | ✅ |

### 6.3 成本优化策略
1. **首页纯静态**：不走 Workers，直接 Pages 静态响应
2. **边缘缓存**：API 响应缓存 2 小时，减少 D1 读取
3. **SW 缓存**：客户端缓存 10 分钟，减少重复请求
4. **图片走外链**：封面图来自 `xinlangtupian.com`，不占 CF 流量

### 6.4 禁止增加成本的行为
- ❌ 封面图上传到 CF R2（用外链）
- ❌ 视频文件存储到 CF（用第三方源）
- ❌ 使用 CF Workers 付费功能
- ❌ 使用 CF D1 付费额度

---

## 七、资源约束

### 7.1 图片
- **全站不允许任何 SVG 文件**
- **全站不允许除视频封面外的任何图片**（无 logo、无 banner、无占位图、无 icon 图片）
- Favicon 只允许 `favicon.png`
- OG/Twitter meta 不引用图片

### 7.2 字体与图标
- 使用系统字体栈：`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- 不允许加载任何自定义字体文件
- 图标使用纯文本/emoji，不允许 icon font 或 SVG icon

---

## 八、代码规范

### 8.1 不允许做的事情
- ❌ 在 layout 中 `import('hls.js')`（会导致首页预加载 334KB）
- ❌ 在首页 Svelte 模板中使用 `{@html <script>}`（会被 Svelte SSR 注释掉）
- ❌ 修改首页的 `csr`/`prerender` 配置
- ❌ 添加任何非封面图片或 SVG
- ❌ 在首页添加搜索框、视频卡片、底部导航以外的任何 UI 元素
- ❌ **修改视频卡片布局**（`grid-cols-2 sm:grid-cols-3 ...` 永不修改）
- ❌ 修改分片算法（写入端和读取端必须一致使用 FNV-1a）
- ❌ **在代码中硬编码分类/标签/热搜词数据**

### 8.2 必须做的事情
- ✅ 首页内联脚本放在 `app.html` 的 `</body>` 前（不是 Svelte 模板中）
- ✅ 视频详情页的 HLS.js 使用 `preloadHls()` 在 `onMount` 中预加载
- ✅ 所有 API 路由使用边缘缓存
- ✅ SW 版本号每次修改时递增
- ✅ **每次修改后 `git push` 到 GitHub**
- ✅ **每个页面必须有完整的 SEO meta 标签**
- ✅ **每个页面必须有对应的 JSON-LD 结构化数据**

---

## 九、部署检查清单

每次部署前必须验证：

1. [ ] 首页网络请求中没有 JS 文件（只有 CSS + API + 图片）
2. [ ] 首页视频卡片布局是 `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`
3. [ ] 首页只有搜索框 + 视频 + 底部导航
4. [ ] 视频详情页播放器正常加载
5. [ ] 全站没有 SVG 文件引用
6. [ ] 没有非封面图片
7. [ ] **`git push` 到 GitHub**
8. [ ] **没有硬编码的分类/标签/热搜词数据**
9. [ ] **所有页面有完整的 SEO meta 和 JSON-LD**
10. [ ] **Lighthouse 性能分数 > 90**

---

## 十、架构概览

```
首页 (/)
├── prerender = true, csr = false
├── 纯静态 HTML，零 JS
├── app.html 内联脚本动态刷新数据
└── API: /api/home → 每2小时轮换分片，取24条

视频详情 (/v/[id])
├── SPA 路由（走 Functions → 200.html）
├── HLS.js 按需加载
├── VideoObject JSON-LD
└── API: /api/video/[id] → FNV-1a 定向分片

分类页 (/category/[name]/[page])
├── SPA 路由
├── 分类名从 URL 参数获取（不硬编码）
├── BreadcrumbList + ItemList JSON-LD
└── API: /api/category → 数据库查询

搜索页 (/search/[q]/[page])
├── SPA 路由
├── 搜索词从 URL 参数获取
├── SearchResultsPage JSON-LD
└── API: /api/search → 数据库全文搜索

标签/热搜词
├── 数据库存储：user_tags, hot_searches 表
├── API: /api/tags → 聚合统计
└── API: /api/hot-searches → 频次排序
```

---

## 十一、版本锁定

| 组件 | 锁定版本 | 参考URL |
|------|----------|---------|
| 首页 UI | `e2fd53b` | https://915b8d19.evideos.pages.dev/ |
| 视频卡片布局 | `e2fd53b` | 同上 |

**任何 UI 修改必须先确认与锁定版本一致。**
