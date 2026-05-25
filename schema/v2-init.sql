-- ============================================
-- V2 数据库结构：资源库-分类-视频层级
-- 每个资源站独立，不同资源站视频不合并
-- ============================================

-- 删除旧表
DROP TABLE IF EXISTS videos;
DROP TABLE IF EXISTS video_fingerprints;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS collect_logs;

-- 资源站表
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  status INTEGER DEFAULT 1,
  last_collect_at INTEGER DEFAULT 0,
  total_videos INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 分类表（每个资源站有自己的分类）
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT DEFAULT '',
  video_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(source_id, name)
);

-- 视频表（每个资源站独立，不跨站去重）
CREATE TABLE videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vod_id TEXT NOT NULL,           -- 纯数字ID
  source_id INTEGER NOT NULL,     -- 所属资源站
  category_id INTEGER,            -- 所属分类
  title TEXT NOT NULL,
  cover TEXT DEFAULT '',
  play_url TEXT DEFAULT '',       -- 播放链接（只存一个，不合并多个源）
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
  UNIQUE(source_id, vod_id)       -- 同资源站内ID唯一
);

-- 采集日志表
CREATE TABLE collect_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  action TEXT DEFAULT '',
  details TEXT DEFAULT '',
  new_count INTEGER DEFAULT 0,
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
CREATE INDEX idx_logs_source_id ON collect_logs(source_id);
CREATE INDEX idx_logs_created_at ON collect_logs(created_at);
