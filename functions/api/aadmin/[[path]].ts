// 后台管理 API
export interface Env {
	DB_0: D1Database; DB_1: D1Database; DB_2: D1Database; DB_3: D1Database; DB_4: D1Database;
	DB_5: D1Database; DB_6: D1Database; DB_7: D1Database; DB_8: D1Database; DB_9: D1Database;
	CACHE: KVNamespace;
	ADMIN_PASSWORD: string;
}

function json(data: any, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization'
		}
	});
}

function generateToken(): string {
	const arr = new Uint8Array(32);
	crypto.getRandomValues(arr);
	return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 验证管理员token
async function verifyAdminToken(request: Request, env: Env): Promise<boolean> {
	const authHeader = request.headers.get('Authorization') || '';
	const token = authHeader.replace('Bearer ', '');
	if (!token) return false;
	const tokenData = await env.CACHE.get(`admin_token:${token}`);
	return !!tokenData;
}

// 获取分片索引（按ID尾号数字）
function getShardIndex(vodId: string): number {
	const match = vodId.match(/(\d)$/);
	if (match) return parseInt(match[1], 10);
	// 回退到哈希
	let hash = 2166136261;
	for (let i = 0; i < vodId.length; i++) {
		hash ^= vodId.charCodeAt(i);
		hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
	}
	return parseInt((hash >>> 0).toString(16).padStart(8, '0').slice(0, 8), 16) % 10;
}

function getShard(env: Env, index: number): D1Database {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9][index];
}

function getAllShards(env: Env): D1Database[] {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
}

// 确保表存在
async function ensureTables(db: D1Database): Promise<void> {
	await db.prepare(`
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
		)
	`).run();

	await db.prepare(`
		CREATE TABLE IF NOT EXISTS video_fingerprints (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			fingerprint TEXT UNIQUE NOT NULL,
			title_normalized TEXT DEFAULT '',
			vod_year TEXT DEFAULT '',
			category TEXT DEFAULT '',
			vod_director TEXT DEFAULT '',
			main_vod_id TEXT NOT NULL,
			created_at INTEGER NOT NULL
		)
	`).run();

	await db.prepare(`
		CREATE TABLE IF NOT EXISTS sources (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			api_url TEXT NOT NULL,
			status INTEGER DEFAULT 1,
			last_collect_at INTEGER DEFAULT 0,
			total_videos INTEGER DEFAULT 0,
			created_at INTEGER NOT NULL
		)
	`).run();

	await db.prepare(`
		CREATE TABLE IF NOT EXISTS collect_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			source_id INTEGER NOT NULL,
			action TEXT DEFAULT '',
			details TEXT DEFAULT '',
			new_count INTEGER DEFAULT 0,
			error_msg TEXT DEFAULT '',
			created_at INTEGER NOT NULL
		)
	`).run();
}

export const onRequest: PagesFunction<Env> = async (context) => {
	const { request, env } = context;
	const url = new URL(request.url);
	const path = url.pathname;

	if (request.method === 'OPTIONS') {
		return new Response(null, {
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization'
			}
		});
	}

	// 1. 管理员登录
	if (path === '/api/aadmin/auth' && request.method === 'POST') {
		const body = await request.json<{ password?: string }>();
		if (!body.password) {
			return json({ success: false, message: '请输入密码' }, 400);
		}

		// 验证密码
		const adminPassword = env.ADMIN_PASSWORD;
		if (!adminPassword) {
			return json({ success: false, message: '管理员密码未配置' }, 500);
		}

		if (body.password !== adminPassword) {
			return json({ success: false, message: '密码错误' }, 401);
		}

		// 生成token
		const token = generateToken();
		await env.CACHE.put(`admin_token:${token}`, JSON.stringify({ created_at: Date.now() }), { expirationTtl: 86400 });

		return json({ success: true, token });
	}

	// 以下接口都需要验证
	const isAdmin = await verifyAdminToken(request, env);
	if (!isAdmin) {
		return json({ success: false, message: '未授权访问' }, 401);
	}

	// 确保表存在
	await ensureTables(env.DB_0);

	// 2. 获取统计数据
	if (path === '/api/aadmin/stats' && request.method === 'GET') {
		// 并行查询所有分片的视频数量
		const shards = getAllShards(env);
		const videoCounts = await Promise.all(
			shards.map(db =>
				db.prepare('SELECT COUNT(*) as count FROM videos WHERE status = 1').first<{ count: number }>().then(r => r?.count || 0)
			)
		);
		const totalVideos = videoCounts.reduce((a, b) => a + b, 0);

		// 采集源数量
		const sourceCount = await env.DB_0.prepare('SELECT COUNT(*) as count FROM sources').first<{ count: number }>().then(r => r?.count || 0);

		// 今日采集数量（从日志统计）
		const today = Math.floor(Date.now() / 1000) - 86400;
		const todayLogs = await env.DB_0.prepare('SELECT SUM(new_count) as total FROM collect_logs WHERE created_at > ?').bind(today).first<{ total: number }>();
		const todayNewVideos = todayLogs?.total || 0;

		// 今日采集次数
		const todayCollectCount = await env.DB_0.prepare('SELECT COUNT(*) as count FROM collect_logs WHERE created_at > ?').bind(today).first<{ count: number }>().then(r => r?.count || 0);

		return json({
			success: true,
			data: {
				totalVideos,
				sourceCount,
				todayCollectCount,
				todayNewVideos
			}
		});
	}

	// 3. 采集源管理
	if (path === '/api/aadmin/sources') {
		// GET: 获取列表
		if (request.method === 'GET') {
			const sources = await env.DB_0.prepare('SELECT * FROM sources ORDER BY created_at DESC').all<{ results: any[] }>().then(r => r.results);
			return json({ success: true, data: sources });
		}

		// POST: 添加
		if (request.method === 'POST') {
			const body = await request.json<{ name?: string; api_url?: string }>();
			if (!body.name || !body.api_url) {
				return json({ success: false, message: '请填写名称和接口地址' }, 400);
			}

			const now = Math.floor(Date.now() / 1000);
			await env.DB_0.prepare(
				'INSERT INTO sources (name, api_url, status, created_at) VALUES (?, ?, 1, ?)'
			).bind(body.name, body.api_url, now).run();

			return json({ success: true, message: '添加成功' });
		}

		// DELETE: 删除
		if (request.method === 'DELETE') {
			const id = url.searchParams.get('id');
			if (!id) return json({ success: false, message: '缺少ID' }, 400);

			await env.DB_0.prepare('DELETE FROM sources WHERE id = ?').bind(id).run();
			return json({ success: true, message: '删除成功' });
		}
	}

	// 4. 采集日志
	if (path === '/api/aadmin/logs' && request.method === 'GET') {
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const logs = await env.DB_0.prepare(
			`SELECT l.*, s.name as source_name 
			 FROM collect_logs l 
			 LEFT JOIN sources s ON l.source_id = s.id 
			 ORDER BY l.created_at DESC 
			 LIMIT ?`
		).bind(limit).all<{ results: any[] }>().then(r => r.results);

		return json({ success: true, data: logs });
	}

	// 5. 触发采集（调用 collect.ts）
	if (path === '/api/aadmin/collect' && request.method === 'POST') {
		const body = await request.json<{ source_id?: number; mode?: 'single' | 'full'; pages?: number; categories?: string[] }>();

		if (!body.source_id) {
			return json({ success: false, message: '缺少采集源ID' }, 400);
		}

		// 获取采集源信息
		const source = await env.DB_0.prepare('SELECT * FROM sources WHERE id = ?').bind(body.source_id).first<{ id: number; name: string; api_url: string }>();
		if (!source) {
			return json({ success: false, message: '采集源不存在' }, 404);
		}

		// 调用采集API
		const collectRes = await fetch(`${url.origin}/api/collect`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': request.headers.get('Authorization') || ''
			},
			body: JSON.stringify({
				source_url: source.api_url,
				source_id: body.source_id,
				mode: body.mode || 'single',
				pages: body.pages || 5,
				categories: body.categories
			})
		});

		const collectData = await collectRes.json();
		return json(collectData);
	}

	// 6. 关键词管理
	if (path === '/api/aadmin/keywords' && request.method === 'DELETE') {
		const body = await request.json<{ keyword?: string }>();
		if (!body.keyword) return json({ success: false, message: '缺少关键词' }, 400);

		// 从KV删除
		await env.CACHE.delete(`keyword:${body.keyword}`);
		return json({ success: true, message: '删除成功' });
	}

	return json({ success: false, message: 'API not found' }, 404);
};
