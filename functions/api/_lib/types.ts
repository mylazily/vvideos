// 共享类型定义 - 所有 API 文件统一使用
export interface Env {
	DB_0: D1Database;
	DB_1: D1Database;
	DB_2: D1Database;
	DB_3: D1Database;
	DB_4: D1Database;
	DB_5: D1Database;
	DB_6: D1Database;
	DB_7: D1Database;
	DB_8: D1Database;
	DB_9: D1Database;
	CACHE: KVNamespace;
	ADMIN_PASSWORD?: string;
}

export interface VideoRecord {
	id?: number;
	vod_id: string;
	source_id: number;
	title: string;
	category: string;
	cover: string;
	play_url: string;
	duration: number;
	vod_year: string;
	vod_area: string;
	vod_actor: string;
	vod_director: string;
	vod_remarks: string;
	vod_lang: string;
	status: number;
	views: number;
	created_at: number;
	updated_at: number;
}

export interface SourceRecord {
	id: number;
	name: string;
	alias: string;
	api_url: string;
	status: number;
	last_collect_at: number;
	total_videos: number;
	auto_collect_enabled: number;
	auto_collect_cron: string;
	auto_collect_mode: string;
	domain_replacements: string;
	created_at: number;
}

export interface CollectResult {
	total: number;
	'new': number;
	updated: number;
	fail: number;
	pagesCollected: number;
	totalPages: number;
}
