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

### 2.4 首页数据源
- **只显示 24 个视频**
- **每 2 小时从 10 个分片中轮换选 1 个获取数据**
- 边缘缓存 TTL = 2 小时

### 2.5 缓存策略
| 资源类型 | 边缘缓存 | SW 缓存 | 说明 |
|----------|----------|---------|------|
| 首页 HTML | 2 小时 | 1 小时 | 静态预渲染 |
| API 响应 | 2 小时 | 10 分钟 | Stale-While-Revalidate |
| 视频封面 | 无 | LRU 300 | 走外链 CDN |
| JS/CSS | 1 年 | 永久 | 带 hash |
| 视频流（m3u8） | 无 | 5 分钟 | Stale-While-Revalidate |
| 视频片段（ts） | 无 | 10 分钟 | Cache-First, LRU 200 |

### 2.6 视频播放优化
- **HLS.js 使用最小 lite 版本**（`import('hls.js/light')`）
- 播放器缓冲区：`maxBufferLength = 30`（30秒），`maxMaxBufferLength = 300`（5分钟）
- 不允许 `preload="auto"`，使用 `preload="metadata"`
- **保证用户打开网站快，看视频不卡**

---

## 三、UI 约束（全站统一原生）

### 3.1 视频卡片（全站统一）
**内容**：只显示 **封面图片 + 标题**，无其他元素
- ❌ 禁止时长标记
- ❌ 禁止分类副标题
- ❌ 禁止集数标记
- ❌ 禁止播放图标

**布局**：
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

**❌ 禁止修改**：视频卡片布局和内容永不改变。

### 3.2 底部导航栏（全站统一）
**固定内容**：首页、分类、发现、我
```
<nav>
  <a href="/">首页</a>
  <a href="/category/全部/1">分类</a>
  <a href="/discover">发现</a>
  <a href="/profile">我</a>
</nav>
```
**❌ 禁止修改**：导航项名称和顺序永不改变。

### 3.3 翻页组件（全站统一）
- 使用原生 HTML `<a>` 标签
- 样式统一：`上一页 | 1 2 3 ... N | 下一页`
- ❌ 禁止使用 JS 动态翻页

### 3.4 首页结构（锁定）
```
搜索框（sticky top）
↓
视频网格（24个）
↓
底部导航（fixed bottom）
```
**❌ 禁止添加**：轮播图、广告、推荐区、分类入口、公告等任何额外元素。

### 3.5 发现页结构
- 头部：搜索框（与首页相同）
- 内容：视频网格
- 底部：导航栏（与首页相同）

---

## 四、数据约束

### 4.1 所有数据来自采集站
- ✅ **分类数据**：来自采集站的 `type_name` 字段
- ✅ **标签数据**：来自采集站的 `vod_tags` 字段
- ✅ **热搜词数据**：来自采集站统计或用户搜索聚合
- ✅ **关键字数据**：来自采集站的 `vod_name`、`vod_blurb` 字段

### 4.2 禁止硬编码
- ❌ **禁止在代码中硬编码分类列表**
- ❌ **禁止在代码中硬编码标签列表**
- ❌ **禁止在代码中硬编码关键字列表**
- ❌ **禁止在代码中硬编码热搜词列表**

### 4.3 数据来源
```
分类 → 采集站 type_name 字段聚合
标签 → 采集站 vod_tags 字段解析
热搜词 → 用户搜索词频次统计（可选）
关键字 → 视频标题、简介分词（可选）
```

### 4.4 数据库分片约束（强制）
- **所有视频按纯数字 vod_id 分片到 10 个数据库（DB_0 - DB_9）**
- 分片规则：ID 直接取模10
  - 例：`12345` → 12345 % 10 = 5 → **DB_5**
  - 例：`999999` → 999999 % 10 = 9 → **DB_9**
- ID 范围：0 - 9999999（纯数字编号）
- ❌ **禁止修改分片规则**

### 4.5 数据库表结构约束（强制）
**videos 表禁止包含 description 列**：
```sql
-- 正确的表结构（无 description 列）
CREATE TABLE videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vod_id TEXT UNIQUE NOT NULL,
  fingerprint_id INTEGER DEFAULT 0,
  title TEXT NOT NULL,
  title_normalized TEXT DEFAULT '',
  category TEXT DEFAULT '其他',
  cover TEXT DEFAULT '',
  play_url_1 TEXT DEFAULT '',
  play_url_2 TEXT DEFAULT '',
  play_url_3 TEXT DEFAULT '',
  play_url_4 TEXT DEFAULT '',
  play_url_5 TEXT DEFAULT '',
  duration_1 INTEGER DEFAULT 0,
  duration_2 INTEGER DEFAULT 0,
  duration_3 INTEGER DEFAULT 0,
  duration_4 INTEGER DEFAULT 0,
  duration_5 INTEGER DEFAULT 0,
  ad_segments TEXT DEFAULT '',
  vod_year TEXT DEFAULT '',
  vod_area TEXT DEFAULT '',
  vod_actor TEXT DEFAULT '',
  vod_director TEXT DEFAULT '',
  vod_remarks TEXT DEFAULT '',
  vod_lang TEXT DEFAULT '',
  status INTEGER DEFAULT 1,
  views INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
  -- ❌ 禁止添加 description 列
);
```

### 4.6 发现页数据来源约束（强制）
**发现页内容必须从以下数据源聚合**：
- ✅ **演员名字** (`vod_actor`) → 演员标签云
- ✅ **年份** (`vod_year`) → 年份筛选
- ✅ **地区** (`vod_area`) → 地区筛选
- ✅ **分类** (`category`) → 分类标签
- ✅ **关键词** → 从标题分词生成
- ✅ **标签** (`vod_tags` 如果采集站提供)

**禁止**：发现页数据不得硬编码，必须来自数据库聚合统计。

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

---

## 六、视频缓存约束

### 6.1 视频流缓存策略
- **m3u8 播放列表**：SW 缓存 5 分钟（TTL），Stale-While-Revalidate
- **ts 视频片段**：SW 缓存 10 分钟（TTL），Cache-First
- **缓存上限**：ts 片段最多缓存 200 个（LRU 淘汰）
- **目的**：保证用户观看视频不卡，已播放的片段可回看

### 6.2 缓存优先级
1. 已缓存的 ts 片段 → 直接返回（0ms）
2. 正在播放的 m3u8 → 网络优先，缓存兜底
3. 未缓存的 ts 片段 → 网络请求，成功后缓存

## 七、域名屏蔽检测约束

### 7.1 检测范围
- **国内 APP 内置浏览器**：微信、QQ、微博、抖音、今日头条、支付宝、百度APP → 直接跳转引导页
- **国内手机浏览器**：小米、华为、vivo、OPPO、UC、百度、360、搜狗、猎豹 → 直接跳转引导页
- **推荐浏览器**：Chrome、Edge、Safari、Firefox、Opera

### 7.2 引导页逻辑
- 检测到屏蔽浏览器 → 全屏引导页（UserGuide blocked=true）
- 引导页优先推荐安装 PWA（永不失联）
- 备选推荐使用 Chrome/Edge/Safari 浏览器
- 提供"复制链接"功能，方便用户在外部浏览器打开

### 7.3 检测方式
- **UA 检测**：快速判断浏览器类型（2秒延迟执行，不阻塞首屏）
- **连接检测**：尝试 fetch 当前域名，失败则触发域名防护（备用域名跳转）

## 八、PWA 永不失联约束

### 8.1 核心原则
- **PWA 安装后，即使域名被拉黑、GFW、DNS 污染，仍可正常使用**
- 通过 SW 缓存所有已访问页面和资源，实现离线可用

### 8.2 缓存策略
| 资源类型 | SW 缓存 | 说明 |
|----------|---------|------|
| 已访问 HTML 页面 | 永久（版本更新清理） | 离线可访问所有浏览过的页面 |
| API 响应 | 10 分钟 | Stale-While-Revalidate |
| 视频流（m3u8） | 5 分钟 | 正在播放的流 |
| 视频片段（ts） | 10 分钟 | 已播放的片段可回看 |
| 静态资源（JS/CSS） | 永久 | 带 hash 文件名 |
| 图片（封面） | LRU 300 | 控制内存 |

### 8.3 离线体验
- 离线时返回缓存的页面（而非错误页）
- API 请求失败返回缓存数据（503 → 缓存兜底）
- SW 安装时预缓存核心资源：首页、manifest、图标

### 8.4 PWA 原生体验
- `display: standalone` 全屏模式
- `display_override: [standalone, minimal-ui, browser]`
- 主题色 `#ec4899`，背景色 `#f9fafb`
- 支持快捷方式：搜索、排行榜、收藏
- 支持 share_target（分享到搜索）
- 支持 handle_links（链接跳转到已安装 PWA）

## 九、首页极速缓存约束

### 9.1 首页缓存策略
- **SW 预缓存**：安装时缓存首页 `/`
- **HTML 缓存 TTL**：2 小时（与边缘缓存一致）
- **API 数据缓存**：10 分钟 SW + 2 小时边缘
- **离线兜底**：网络失败返回 SW 缓存的首页

### 9.2 首页加载流程
1. SW 拦截请求 → 命中缓存直接返回（< 50ms）
2. 缓存未命中 → 网络请求 → 成功后缓存
3. 网络失败 → 返回预缓存的首页（离线可用）
4. 首页内联脚本 fetch /api/home → SW 返回缓存数据

### 9.3 性能目标
- **二次打开**：< 100ms（SW 缓存命中）
- **离线打开**：< 200ms（预缓存兜底）
- **API 数据刷新**：后台静默更新，用户无感知

## 十、成本约束（10万DAU全免费）

### 10.1 目标指标
| 指标 | 目标值 |
|------|--------|
| 日活跃用户 (DAU) | 100,000 |
| 每用户观看视频数 | 15 |
| 总日播放量 | 1,500,000 |
| Cloudflare 费用 | **$0** |

### 10.2 成本优化策略
1. **首页纯静态**：不走 Workers
2. **边缘缓存**：API 响应缓存 2 小时
3. **SW 缓存**：客户端缓存 10 分钟
4. **图片走外链**：封面图来自采集站 CDN

---

## 十一、资源约束

### 11.1 图片
- **全站不允许任何 SVG 文件**
- **全站不允许除视频封面外的任何图片**
- Favicon 只允许 `favicon.png`

### 11.2 字体与图标
- 使用系统字体栈：`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- 不允许加载任何自定义字体文件
- 图标使用纯文本/emoji

---

## 十二、代码规范

### 12.1 不允许做的事情
- ❌ 在 layout 中 `import('hls.js')`
- ❌ 在首页 Svelte 模板中使用 `{@html <script>}`
- ❌ 修改首页的 `csr`/`prerender` 配置
- ❌ 添加任何非封面图片或 SVG
- ❌ **修改视频卡片布局或内容**
- ❌ **修改底部导航栏内容**
- ❌ **在视频卡片中添加时长、分类、集数等元素**
- ❌ **在代码中硬编码分类/标签/热搜词数据**

### 12.2 必须做的事情
- ✅ 首页内联脚本放在 `app.html` 的 `</body>` 前
- ✅ 视频详情页的 HLS.js 使用 `import('hls.js/light')`
- ✅ 所有 API 路由使用边缘缓存
- ✅ SW 版本号每次修改时递增
- ✅ **每次修改后 `git push` 到 GitHub**
- ✅ **每个页面必须有完整的 SEO meta 和 JSON-LD**

---

## 十三、部署检查清单

每次部署前必须验证：

1. [ ] 首页网络请求中没有 JS 文件
2. [ ] 首页视频卡片布局正确
3. [ ] 首页只有搜索框 + 24视频 + 底部导航
4. [ ] 视频卡片只有封面 + 标题
5. [ ] 底部导航是：首页、分类、发现、我
6. [ ] 视频详情页播放器正常
7. [ ] 全站没有 SVG 和非封面图片
8. [ ] **`git push` 到 GitHub**
9. [ ] **没有硬编码的分类/标签数据**
10. [ ] **Lighthouse 性能分数 > 90**
11. [ ] SW 缓存视频流 m3u8/ts 片段
12. [ ] 域名屏蔽检测正常（国产APP/浏览器→引导页）
13. [ ] PWA 安装后离线可用
14. [ ] 首页 SW 缓存命中（二次打开 < 100ms）

---

## 十四、架构概览

```
首页 (/)
├── prerender = true, csr = false
├── 纯静态 HTML，零 JS
├── 搜索框 + 24视频 + 底部导航
└── API: /api/home → 每2小时轮换分片

发现页 (/discover)
├── SPA 路由
├── 搜索框 + 视频网格 + 底部导航
└── 与首页结构一致

分类页 (/category/[name]/[page])
├── SPA 路由
├── 分类名从 URL 参数获取
└── 视频网格 + 翻页 + 底部导航

视频详情 (/v/[id])
├── SPA 路由
├── HLS.js light 版本按需加载
└── 底部导航

底部导航（全站统一）
├── 首页 → /
├── 分类 → /category/全部/1
├── 发现 → /discover
└── 我 → /profile
```
