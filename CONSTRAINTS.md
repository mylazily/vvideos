# 必爱必爱 开发约束底线

> 以下规则为不可违反的底线，任何代码修改都必须遵守。

---

## 一、性能底线

### 1.1 首页加载
- **首页必须是纯静态 HTML**（`prerender = true`, `csr = false`）
- **首页零外部 JS 下载**（唯一允许的 JS 是 `app.html` 中 ~1.5KB 内联脚本）
- **首页不允许加载 HLS.js**（只在视频详情页按需加载）
- **首页不允许加载 SvelteKit 框架 JS**

### 1.2 首页内容
- **只允许三个元素**：搜索框 + 24个视频卡片 + 底部导航
- **不允许**：轮播图、广告位、推荐区域、分类入口、公告等任何额外元素
- **视频卡片布局**：手机端一行两个（`grid-cols-2`），不允许响应式多列

### 1.3 首页数据源
- 每 2 小时从 10 个分片中轮换选 1 个，取 24 条最新视频
- 边缘缓存 TTL = 2 小时（`CACHE_TTL.home = 7200`）
- Service Worker API 缓存 TTL = 10 分钟

### 1.4 视频播放
- HLS.js 只在视频详情页动态 `import('hls.js/light')`
- 播放器缓冲区：`maxBufferLength = 30`（30秒），`maxMaxBufferLength = 300`（5分钟）
- 缓存策略：5-10 分钟（SW `API_TTL`）
- 不允许 `preload="auto"`，使用 `preload="metadata"`

---

## 二、资源约束

### 2.1 图片
- **全站不允许任何 SVG 文件**
- **全站不允许除视频封面外的任何图片**（无 logo、无 banner、无占位图、无 icon 图片）
- Favicon 只允许 `favicon.png`（不允许 `icon.svg`、`icon-192.png`、`icon-512.png`）
- OG/Twitter meta 不引用图片

### 2.2 字体与图标
- 使用系统字体栈：`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- 不允许加载任何自定义字体文件
- 图标使用纯文本/emoji，不允许 icon font 或 SVG icon

### 2.3 CSS
- 使用 Tailwind CSS，不允许引入额外 CSS 框架
- 首页 CSS 由 SvelteKit 内联到 HTML 中（构建时处理）

---

## 三、代码规范

### 3.1 不允许做的事情
- ❌ 在 layout 中 `import('hls.js')`（会导致首页预加载 334KB）
- ❌ 在首页 Svelte 模板中使用 `{@html <script>}`（会被 Svelte SSR 注释掉）
- ❌ 修改首页的 `csr`/`prerender` 配置
- ❌ 添加任何非封面图片或 SVG
- ❌ 在首页添加搜索框、视频卡片、底部导航以外的任何 UI 元素
- ❌ 使用 `setTimeout` 延迟播放（用 `tick().then()` 或 `requestAnimationFrame`）
- ❌ 修改分片算法（写入端和读取端必须一致使用 FNV-1a）

### 3.2 必须做的事情
- ✅ 首页内联脚本放在 `app.html` 的 `</body>` 前（不是 Svelte 模板中）
- ✅ 视频详情页的 HLS.js 使用 `preloadHls()` 在 `onMount` 中预加载
- ✅ 所有 API 路由使用边缘缓存
- ✅ SW 版本号每次修改时递增

---

## 四、部署检查清单

每次部署前必须验证：

1. [ ] 首页网络请求中没有 JS 文件（只有 CSS + API + 图片）
2. [ ] 首页视频卡片是一行两个
3. [ ] 首页只有搜索框 + 视频 + 底部导航
4. [ ] 视频详情页播放器正常加载
5. [ ] 全站没有 SVG 文件引用
6. [ ] 没有非封面图片
7. [ ] `git push` 到 GitHub

---

## 五、架构概览

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
