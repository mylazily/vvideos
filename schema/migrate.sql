-- 数据库迁移脚本：删除旧表，创建新表
-- 警告：此操作会删除所有数据！

-- 在DB_0上执行：删除旧表
DROP TABLE IF EXISTS collect_logs;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS video_fingerprints;

-- 在DB_0上执行：创建新表
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
  api_url TEXT NOT NULL,
  status INTEGER DEFAULT 1,
  last_collect_at INTEGER DEFAULT 0,
  total_videos INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 采集日志表
CREATE TABLE IF NOT EXISTS collect_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  action TEXT DEFAULT '',
  details TEXT DEFAULT '',
  new_count INTEGER DEFAULT 0,
  error_msg TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 视频指纹表 - 用于全局去重
CREATE TABLE IF NOT EXISTS video_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT UNIQUE NOT NULL,
  title_normalized TEXT NOT NULL,
  vod_year TEXT DEFAULT '',
  category TEXT DEFAULT '',
  main_vod_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_fingerprints_hash ON video_fingerprints(fingerprint);

-- 在每个分片(DB_0到DB_9)上执行：删除旧视频表，创建新视频表
-- 注意：以下SQL需要在每个分片分别执行

-- DROP TABLE IF EXISTS videos;

-- CREATE TABLE IF NOT EXISTS videos (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   vod_id TEXT UNIQUE NOT NULL,
--   fingerprint_id INTEGER DEFAULT 0,
--   title TEXT NOT NULL,
--   title_normalized TEXT DEFAULT '',
--   category TEXT DEFAULT '其他',
--   cover TEXT DEFAULT '',
--   play_url_1 TEXT DEFAULT '',
--   play_url_2 TEXT DEFAULT '',
--   play_url_3 TEXT DEFAULT '',
--   play_url_4 TEXT DEFAULT '',
--   play_url_5 TEXT DEFAULT '',
--   duration_1 INTEGER DEFAULT 0,
--   duration_2 INTEGER DEFAULT 0,
--   duration_3 INTEGER DEFAULT 0,
--   duration_4 INTEGER DEFAULT 0,
--   duration_5 INTEGER DEFAULT 0,
--   ad_segments TEXT DEFAULT '',
--   vod_year TEXT DEFAULT '',
--   vod_area TEXT DEFAULT '',
--   vod_actor TEXT DEFAULT '',
--   vod_director TEXT DEFAULT '',
--   vod_remarks TEXT DEFAULT '',
--   vod_lang TEXT DEFAULT '',
--   status INTEGER DEFAULT 1,
--   views INTEGER DEFAULT 0,
--   created_at INTEGER NOT NULL,
--   updated_at INTEGER NOT NULL
-- );

-- CREATE INDEX IF NOT EXISTS idx_videos_fingerprint ON videos(fingerprint_id);
-- CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category) WHERE status = 1;
-- CREATE INDEX IF NOT EXISTS idx_videos_year ON videos(vod_year) WHERE status = 1;
-- CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
-- CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at) WHERE status = 1;
