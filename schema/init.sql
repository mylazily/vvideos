-- ============================================
-- evideos 数据库 Schema (统一版本)
-- 适用于所有 D1 分片数据库
-- ============================================

-- ===== 仅 DB_0 创建的表 =====

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 采集源表
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  alias TEXT DEFAULT '',
  api_url TEXT NOT NULL,
  status INTEGER DEFAULT 1,
  last_collect_at INTEGER DEFAULT 0,
  total_videos INTEGER DEFAULT 0,
  auto_collect_enabled INTEGER DEFAULT 0,
  auto_collect_cron TEXT DEFAULT '',
  auto_collect_mode TEXT DEFAULT 'today',
  domain_replacements TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 采集日志表
CREATE TABLE IF NOT EXISTS collect_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  action TEXT DEFAULT '',
  details TEXT DEFAULT '',
  new_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  error_msg TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- ===== 每个分片（DB_0 ~ DB_9）都要创建的表 =====

-- 视频表
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vod_id TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT DEFAULT '',
  cover TEXT DEFAULT '',
  play_url TEXT DEFAULT '',
  vod_year TEXT DEFAULT '',
  vod_area TEXT DEFAULT '',
  vod_actor TEXT DEFAULT '',
  vod_director TEXT DEFAULT '',
  vod_remarks TEXT DEFAULT '',
  duration INTEGER DEFAULT 0,
  vod_lang TEXT DEFAULT '',
  status INTEGER DEFAULT 1,
  views INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(vod_id, source_id)
);

-- ===== 索引 =====
CREATE INDEX IF NOT EXISTS idx_videos_category_status ON videos(category, status, created_at);
CREATE INDEX IF NOT EXISTS idx_videos_views ON videos(views, status);
CREATE INDEX IF NOT EXISTS idx_videos_status_created ON videos(status, created_at);
CREATE INDEX IF NOT EXISTS idx_videos_title ON videos(title);
CREATE INDEX IF NOT EXISTS idx_videos_vod_id ON videos(vod_id);
CREATE INDEX IF NOT EXISTS idx_videos_source_id ON videos(source_id);
