-- ============================================
-- V2 数据库结构：资源站独立，支持域名替换和自动采集
-- ============================================

-- 删除旧表
DROP TABLE IF EXISTS videos;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS collect_logs;
DROP TABLE IF EXISTS users;

-- 资源站表（增强版）
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- 资源站名称
  api_url TEXT NOT NULL,                 -- 采集接口地址
  status INTEGER DEFAULT 1,              -- 状态：1启用 0禁用
  
  -- 自动采集设置
  auto_collect_enabled INTEGER DEFAULT 0, -- 是否启用自动采集
  auto_collect_cron TEXT DEFAULT '',      -- cron表达式（如：0 */6 * * * 每6小时）
  auto_collect_mode TEXT DEFAULT 'today', -- 自动采集模式：today/week/month/full
  
  -- M3U8域名替换（JSON格式：{"old_domain": "new_domain"}）
  domain_replacements TEXT DEFAULT '',
  
  last_collect_at INTEGER DEFAULT 0,
  total_videos INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 分类表（支持显示名称映射）
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,            -- 所属资源站
  name TEXT NOT NULL,                    -- 原始分类名（来自资源站）
  display_name TEXT DEFAULT '',          -- 显示名称（可自定义）
  normalized_name TEXT DEFAULT '',       -- 标准化名称（用于聚合）
  video_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(source_id, name)
);

-- 视频表
CREATE TABLE videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vod_id TEXT NOT NULL,                  -- 纯数字ID（资源站内唯一）
  source_id INTEGER NOT NULL,            -- 所属资源站
  category_id INTEGER,                   -- 所属分类
  
  title TEXT NOT NULL,
  cover TEXT DEFAULT '',
  play_url TEXT DEFAULT '',              -- 播放链接
  duration INTEGER DEFAULT 0,
  
  vod_year TEXT DEFAULT '',
  vod_area TEXT DEFAULT '',
  vod_actor TEXT DEFAULT '',
  vod_director TEXT DEFAULT '',
  vod_remarks TEXT DEFAULT '',
  vod_lang TEXT DEFAULT '',
  
  status INTEGER DEFAULT 1,
  views INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  
  UNIQUE(source_id, vod_id)
);

-- 采集日志表
CREATE TABLE collect_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  action TEXT DEFAULT '',
  details TEXT DEFAULT '',
  new_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  error_msg TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 用户表
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 创建索引
CREATE INDEX idx_videos_source_id ON videos(source_id);
CREATE INDEX idx_videos_category_id ON videos(category_id);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_videos_created_at ON videos(created_at);
CREATE INDEX idx_videos_views ON videos(views);
CREATE INDEX idx_categories_source_id ON categories(source_id);
CREATE INDEX idx_sources_status ON sources(status);
CREATE INDEX idx_sources_auto_collect ON sources(auto_collect_enabled);
CREATE INDEX idx_logs_source_id ON collect_logs(source_id);
CREATE INDEX idx_logs_created_at ON collect_logs(created_at);
