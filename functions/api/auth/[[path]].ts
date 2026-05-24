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

// 安全修复：使用 PBKDF2 替代简单 SHA-256 哈希
const PBKDF2_ITERATIONS = 100000;
const HASH_PREFIX = 'pbkdf2:';

async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    // 生成随机盐值（每个用户独立）
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const saltBuffer = encoder.encode(salt);
    const keyMaterial = encoder.encode(password);
    const cryptoKey = await crypto.subtle.importKey('raw', keyMaterial, 'PBKDF2', false, ['deriveBits']);
    const derivedBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        cryptoKey,
        256
    );
    const hashArray = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${HASH_PREFIX}${salt}:${hashArray}`;
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
    // 兼容旧版固定盐值哈希（平滑迁移）
    if (hash.startsWith(HASH_PREFIX) && !hash.includes(':')) {
        // 旧版 pbkdf2 格式（无独立盐值）
        const encoder = new TextEncoder();
        const salt = encoder.encode('vvideos_salt_2024_secure');
        const keyMaterial = encoder.encode(password);
        const cryptoKey = await crypto.subtle.importKey('raw', keyMaterial, 'PBKDF2', false, ['deriveBits']);
        const derivedBits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
            cryptoKey,
            256
        );
        const hashArray = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
        return HASH_PREFIX + hashArray === hash;
    }
    if (!hash.startsWith(HASH_PREFIX)) {
        // 更旧的 SHA-256 格式
        const encoder = new TextEncoder();
        const data = encoder.encode(password + '_vvideos_salt_2024');
        const oldHash = await crypto.subtle.digest('SHA-256', data);
        const oldHashStr = Array.from(new Uint8Array(oldHash)).map(b => b.toString(16).padStart(2, '0')).join('');
        return oldHashStr === hash;
    }
    // 新版格式：pbkdf2:salt:hash
    const parts = hash.slice(HASH_PREFIX.length).split(':');
    if (parts.length !== 2) return false;
    const [salt, expectedHash] = parts;
    const encoder = new TextEncoder();
    const saltBuffer = encoder.encode(salt);
    const keyMaterial = encoder.encode(password);
    const cryptoKey = await crypto.subtle.importKey('raw', keyMaterial, 'PBKDF2', false, ['deriveBits']);
    const derivedBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        cryptoKey,
        256
    );
    const hashArray = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hashArray === expectedHash;
}

function generateToken(): string {
	const arr = new Uint8Array(32);
	crypto.getRandomValues(arr);
	return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
		await ensureTables(env.DB_0);

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