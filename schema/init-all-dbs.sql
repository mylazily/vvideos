-- ============================================
-- evideos D1 数据库初始化脚本
-- 10个分片数据库，按视频ID尾号分片 (0-9)
-- 最后更新: 2026-05-25
-- ============================================

-- 视频表（核心表）
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vod_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT DEFAULT '其他',
  cover TEXT DEFAULT '',
  play_url TEXT DEFAULT '',
  play_url_1 TEXT DEFAULT '',
  duration INTEGER DEFAULT 0,
  duration_1 INTEGER DEFAULT 0,
  vod_year TEXT DEFAULT '',
  vod_area TEXT DEFAULT '',
  vod_actor TEXT DEFAULT '',
  vod_director TEXT DEFAULT '',
  vod_remarks TEXT DEFAULT '',
  vod_lang TEXT DEFAULT '',
  source_id INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  views INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_videos_vod_id ON videos(vod_id);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at);
CREATE INDEX IF NOT EXISTS idx_videos_views ON videos(views);
