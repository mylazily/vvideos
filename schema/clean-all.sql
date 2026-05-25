-- ============================================
-- 清理所有数据脚本
-- 删除所有视频、指纹、日志数据，保留表结构
-- ============================================

-- 清理视频表
DELETE FROM videos;

-- 清理视频指纹表
DELETE FROM video_fingerprints;

-- 清理采集日志表
DELETE FROM collect_logs;

-- 清理用户表（保留管理员账号）
-- DELETE FROM users WHERE username != 'admin';

-- 清理采集源表（可选，保留配置）
-- DELETE FROM sources;

-- 重置自增ID（SQLite语法）
DELETE FROM sqlite_sequence WHERE name IN ('videos', 'video_fingerprints', 'collect_logs');
