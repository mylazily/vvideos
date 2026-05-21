-- 用户表（DB_0）
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 采集源表（DB_0）
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  status INTEGER DEFAULT 1,
  last_collect_at INTEGER DEFAULT 0,
  total_videos INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 采集日志表（DB_0）
CREATE TABLE IF NOT EXISTS collect_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  action TEXT DEFAULT '',
  details TEXT DEFAULT '',
  new_count INTEGER DEFAULT 0,
  error_msg TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 视频表（每个分片都要创建）
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vod_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT DEFAULT '其他',
  cover TEXT DEFAULT '',
  play_url TEXT DEFAULT '',
  vod_year TEXT DEFAULT '',
  vod_area TEXT DEFAULT '',
  vod_actor TEXT DEFAULT '',
  vod_director TEXT DEFAULT '',
  vod_remarks TEXT DEFAULT '',
  duration TEXT DEFAULT '',
  vod_lang TEXT DEFAULT '',
  description TEXT DEFAULT '',
  status INTEGER DEFAULT 1,
  views INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
