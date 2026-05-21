-- 新数据库结构 - 去掉description，添加视频指纹和广告检测字段

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

-- 视频指纹表（DB_0）- 用于全局去重
CREATE TABLE IF NOT EXISTS video_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT UNIQUE NOT NULL,  -- 视频指纹：标题标准化+年份+类型的哈希
  title_normalized TEXT NOT NULL,    -- 标准化后的标题
  vod_year TEXT DEFAULT '',
  category TEXT DEFAULT '',
  main_vod_id TEXT NOT NULL,         -- 主视频ID（第一次采集的）
  created_at INTEGER NOT NULL
);

-- 视频表（每个分片都要创建）- 去掉description，添加多源支持
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vod_id TEXT UNIQUE NOT NULL,
  fingerprint_id INTEGER DEFAULT 0,  -- 关联video_fingerprints
  title TEXT NOT NULL,               -- 原始标题（保留各资源站的原始名称）
  title_normalized TEXT DEFAULT '',  -- 标准化标题（用于去重）
  category TEXT DEFAULT '其他',
  cover TEXT DEFAULT '',
  
  -- 多源播放URL（最多5个源）
  play_url_1 TEXT DEFAULT '',        -- 源1播放地址
  play_url_2 TEXT DEFAULT '',        -- 源2播放地址
  play_url_3 TEXT DEFAULT '',        -- 源3播放地址
  play_url_4 TEXT DEFAULT '',        -- 源4播放地址
  play_url_5 TEXT DEFAULT '',        -- 源5播放地址
  
  -- 各源时长（用于广告检测）
  duration_1 INTEGER DEFAULT 0,      -- 源1时长（秒）
  duration_2 INTEGER DEFAULT 0,
  duration_3 INTEGER DEFAULT 0,
  duration_4 INTEGER DEFAULT 0,
  duration_5 INTEGER DEFAULT 0,
  
  -- 广告时间段（JSON数组：[{start, end}, ...]）
  ad_segments TEXT DEFAULT '',       -- 广告时间段，空表示无广告
  
  -- 元数据
  vod_year TEXT DEFAULT '',
  vod_area TEXT DEFAULT '',
  vod_actor TEXT DEFAULT '',
  vod_director TEXT DEFAULT '',
  vod_remarks TEXT DEFAULT '',
  vod_lang TEXT DEFAULT '',
  
  -- 状态
  status INTEGER DEFAULT 1,
  views INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 创建索引（性能优化）
CREATE INDEX IF NOT EXISTS idx_videos_fingerprint ON videos(fingerprint_id);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_videos_year ON videos(vod_year) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_fingerprints_hash ON video_fingerprints(fingerprint);
