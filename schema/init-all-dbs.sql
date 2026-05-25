-- ============================================
-- evideos D1 数据库 Schema
-- 10 个分片数据库，按视频 ID 尾号分片 (0-9)
-- 最后更新: 2026-05-25
-- ============================================

-- 视频表（核心表）
-- 约束：禁止 description 列
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vod_id TEXT NOT NULL,
  source_id INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  play_url TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 0,
  vod_year TEXT NOT NULL DEFAULT '',
  vod_area TEXT NOT NULL DEFAULT '',
  vod_actor TEXT NOT NULL DEFAULT '',
  vod_director TEXT NOT NULL DEFAULT '',
  vod_remarks TEXT NOT NULL DEFAULT '',
  vod_lang TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 1,
  views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(vod_id, source_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_videos_vod_id ON videos(vod_id);
CREATE INDEX IF NOT EXISTS idx_videos_source_id ON videos(source_id);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at);
CREATE INDEX IF NOT EXISTS idx_videos_views ON videos(views);

-- 采集源表（仅 DB_0）
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  alias TEXT NOT NULL DEFAULT '',
  api_url TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 1,
  last_collect_at INTEGER NOT NULL DEFAULT 0,
  total_videos INTEGER NOT NULL DEFAULT 0,
  auto_collect_enabled INTEGER NOT NULL DEFAULT 0,
  auto_collect_cron TEXT NOT NULL DEFAULT '',
  auto_collect_mode TEXT NOT NULL DEFAULT '',
  domain_replacements TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 采集日志表（仅 DB_0）
CREATE TABLE IF NOT EXISTS collect_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  new_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  error_msg TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 用户表（仅 DB_0）
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
