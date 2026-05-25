-- ============================================
-- 10个D1数据库初始化脚本
-- 按视频ID尾号数字分片：0-9
-- ============================================

-- 每个数据库都需要创建的表
-- DB_0 到 DB_9 都执行相同的表结构

-- 视频表（核心表）
CREATE TABLE IF NOT EXISTS videos (
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
);

-- 视频指纹表（用于去重）- 只在 DB_0
CREATE TABLE IF NOT EXISTS video_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT UNIQUE NOT NULL,
  title_normalized TEXT DEFAULT '',
  vod_year TEXT DEFAULT '',
  category TEXT DEFAULT '',
  vod_director TEXT DEFAULT '',
  main_vod_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 用户表 - 只在 DB_0
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 采集源表 - 只在 DB_0
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  status INTEGER DEFAULT 1,
  last_collect_at INTEGER DEFAULT 0,
  total_videos INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 采集日志表 - 只在 DB_0
CREATE TABLE IF NOT EXISTS collect_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  action TEXT DEFAULT '',
  details TEXT DEFAULT '',
  new_count INTEGER DEFAULT 0,
  error_msg TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 创建索引（优化查询性能）
CREATE INDEX IF NOT EXISTS idx_videos_vod_id ON videos(vod_id);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at);
CREATE INDEX IF NOT EXISTS idx_videos_views ON videos(views);
CREATE INDEX IF NOT EXISTS idx_videos_year ON videos(vod_year);
CREATE INDEX IF NOT EXISTS idx_videos_area ON videos(vod_area);
CREATE INDEX IF NOT EXISTS idx_fingerprints_fingerprint ON video_fingerprints(fingerprint);
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
CREATE INDEX IF NOT EXISTS idx_logs_source_id ON collect_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON collect_logs(created_at);
