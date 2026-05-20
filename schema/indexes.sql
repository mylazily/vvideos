-- 数据库索引优化
-- 在每个分片数据库上执行此脚本

-- 分类查询优化
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category, status, created_at DESC);

-- 搜索优化
CREATE INDEX IF NOT EXISTS idx_videos_title ON videos(title);
CREATE INDEX IF NOT EXISTS idx_videos_actor ON videos(vod_actor);
CREATE INDEX IF NOT EXISTS idx_videos_director ON videos(vod_director);

-- 排行榜优化
CREATE INDEX IF NOT EXISTS idx_videos_views ON videos(views DESC, status);

-- 状态过滤
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status, created_at DESC);

-- 地区查询
CREATE INDEX IF NOT EXISTS idx_videos_area ON videos(vod_area);

-- 年份查询
CREATE INDEX IF NOT EXISTS idx_videos_year ON videos(vod_year);

-- vod_id 查询（用于详情页）
CREATE INDEX IF NOT EXISTS idx_videos_vod_id ON videos(vod_id);
