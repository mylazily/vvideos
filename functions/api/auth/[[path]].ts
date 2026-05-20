// 用户认证 API - 注册/登录/个人信息
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
}

function json(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
			...extraHeaders
		}
	});
}

// 简单的密码哈希
async function hashPassword(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(password + '_vvideos_salt_2024');
	const hash = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
	const passwordHash = await hashPassword(password);
	return passwordHash === hash;
}

function generateToken(): string {
	const arr = new Uint8Array(32);
	crypto.getRandomValues(arr);
	return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 自动建表
async function ensureTables(db: D1Database): Promise<void> {
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id TEXT UNIQUE NOT NULL,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			nickname TEXT DEFAULT '',
			avatar TEXT DEFAULT '',
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
			headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
		});
	}

	try {
		// 确保表存在
		await ensureTables(env.DB_0);

		// ======== 注册 ========
		if (path === '/api/auth/register' && request.method === 'POST') {
			const body = await request.json<{ username?: string; password?: string; nickname?: string }>();
			
			if (!body.username || !body.password) {
				return json({ success: false, message: '请输入用户名和密码' }, 400);
			}
			
			if (body.username.length < 3 || body.username.length > 20) {
				return json({ success: false, message: '用户名长度3-20个字符' }, 400);
			}
			
			if (body.password.length < 6) {
				return json({ success: false, message: '密码至少6个字符' }, 400);
			}
			
			const existing = await env.DB_0.prepare('SELECT id FROM users WHERE username = ?').bind(body.username).first();
			if (existing) {
				return json({ success: false, message: '用户名已存在' }, 400);
			}
			
			const passwordHash = await hashPassword(body.password);
			const userId = crypto.randomUUID().slice(0, 8) + Date.now().toString(36);
			const now = Math.floor(Date.now() / 1000);
			
			await env.DB_0.prepare(
				'INSERT INTO users (user_id, username, password_hash, nickname, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			).bind(userId, body.username, passwordHash, body.nickname || body.username, '', now).run();
			
			const token = generateToken();
			await env.CACHE.put('token:' + token, JSON.stringify({ user_id: userId, username: body.username }), { expirationTtl: 86400 * 30 });
			
			return json({
				success: true,
				data: {
					token,
					user: { user_id: userId, username: body.username, nickname: body.nickname || body.username, avatar: '' }
				}
			});
		}

		// ======== 登录 ========
		if (path === '/api/auth/login' && request.method === 'POST') {
			const body = await request.json<{ username?: string; password?: string }>();
			
			if (!body.username || !body.password) {
				return json({ success: false, message: '请输入用户名和密码' }, 400);
			}
			
			const user = await env.DB_0.prepare(
				'SELECT user_id, username, password_hash, nickname, avatar FROM users WHERE username = ?'
			).bind(body.username).first<{
				user_id: string; username: string; password_hash: string; nickname: string; avatar: string;
			}>();
			
			if (!user) {
				return json({ success: false, message: '用户名或密码错误' }, 401);
			}
			
			const valid = await verifyPassword(body.password, user.password_hash);
			if (!valid) {
				return json({ success: false, message: '用户名或密码错误' }, 401);
			}
			
			const token = generateToken();
			await env.CACHE.put('token:' + token, JSON.stringify({ user_id: user.user_id, username: user.username }), { expirationTtl: 86400 * 30 });
			
			return json({
				success: true,
				data: {
					token,
					user: { user_id: user.user_id, username: user.username, nickname: user.nickname, avatar: user.avatar }
				}
			});
		}

		// ======== 获取当前用户信息 ========
		if (path === '/api/auth/me' && request.method === 'GET') {
			const authHeader = request.headers.get('Authorization');
			if (!authHeader?.startsWith('Bearer ')) {
				return json({ success: false, message: '未登录' }, 401);
			}
			
			const token = authHeader.replace('Bearer ', '');
			const tokenData = await env.CACHE.get('token:' + token);
			if (!tokenData) {
				return json({ success: false, message: '登录已过期，请重新登录' }, 401);
			}
			
			const { user_id } = JSON.parse(tokenData);
			const user = await env.DB_0.prepare(
				'SELECT user_id, username, nickname, avatar, created_at FROM users WHERE user_id = ?'
			).bind(user_id).first<{
				user_id: string; username: string; nickname: string; avatar: string; created_at: number;
			}>();
			
			if (!user) {
				return json({ success: false, message: '用户不存在' }, 404);
			}
			
			return json({ success: true, data: user });
		}

		// ======== 退出登录 ========
		if (path === '/api/auth/logout' && request.method === 'POST') {
			const authHeader = request.headers.get('Authorization');
			if (authHeader?.startsWith('Bearer ')) {
				const token = authHeader.replace('Bearer ', '');
				await env.CACHE.delete('token:' + token);
			}
			return json({ success: true, message: '已退出登录' });
		}

		return json({ success: false, message: 'API not found' }, 404);
	} catch (err: any) {
		return json({ success: false, message: err.message || '服务器错误' }, 500);
	}
};
