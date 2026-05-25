// 后台管理 API - V2版（适配V2数据库结构）
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

async function verifyAdminToken(request: Request, env: Env): Promise<boolean> {
	const authHeader = request.headers.get('Authorization') || '';
	const token = authHeader.replace('Bearer ', '');
	if (!token) return false;
	const tokenData = await env.CACHE.get(`admin_token:${token}`);
	return !!tokenData;
}

function getShardIndex(vodId: string): number {
	const num = parseInt(vodId, 10);
	return isNaN(num) ? 0 : (num % 10);
}

function getShard(env: Env, index: number): D1Database {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9][index];
}

function getAllShards(env: Env): D1Database[] {
	return [env.DB_0, env.DB_1, env.DB_2, env.DB_3, env.DB_4, env.DB_5, env.DB_6, env.DB_7, env.DB_8, env.DB_9];
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
		if (!body.password) return json({ success: false, message: '请输入密码' }, 400);
		if (!env.ADMIN_PASSWORD) return json({ success: false, message: '管理员密码未配置' }, 500);
		if (body.password !== env.ADMIN_PASSWORD) return json({ success: false, message: '密码错误' }, 401);

		const token = generateToken();
		await env.CACHE.put(`admin_token:${token}`, JSON.stringify({ created_at: Date.now() }), { expirationTtl: 86400 });
		return json({ success: true, token });
	}

	// 以下接口都需要验证
	const isAdmin = await verifyAdminToken(request, env);
	if (!isAdmin) return json({ success: false, message: '未授权访问' }, 401);

	// 2. 统计数据
	if (path === '/api/aadmin/stats' && request.method === 'GET') {
		const shards = getAllShards(env);
		const videoCounts = await Promise.all(
			shards.map(db => db.prepare('SELECT COUNT(*) as count FROM videos WHERE status = 1').first<{ count: number }>().then(r => r?.count || 0))
		);
		const totalVideos = videoCounts.reduce((a, b) => a + b, 0);
		const sourceCount = await env.DB_0.prepare('SELECT COUNT(*) as count FROM sources').first<{ count: number }>().then(r => r?.count || 0);
		const today = Math.floor(Date.now() / 1000) - 86400;
		const todayLogs = await env.DB_0.prepare('SELECT SUM(new_count) as total FROM collect_logs WHERE created_at > ?').bind(today).first<{ total: number }>();
		const todayNewVideos = todayLogs?.total || 0;
		const todayCollectCount = await env.DB_0.prepare('SELECT COUNT(*) as count FROM collect_logs WHERE created_at > ?').bind(today).first<{ count: number }>().then(r => r?.count || 0);

		return json({ success: true, data: { totalVideos, sourceCount, todayCollectCount, todayNewVideos } });
	}

	// 3. 采集源管理
	if (path === '/api/aadmin/sources') {
		if (request.method === 'GET') {
			const sources = await env.DB_0.prepare('SELECT * FROM sources ORDER BY created_at DESC').all<{ results: any[] }>().then(r => r.results);
			return json({ success: true, data: sources });
		}

		if (request.method === 'POST') {
			const body = await request.json<{ name?: string; alias?: string; api_url?: string }>();
			if (!body.name || !body.api_url) return json({ success: false, message: '请填写名称和接口地址' }, 400);

			const now = Math.floor(Date.now() / 1000);
			const alias = body.alias || body.name; // 如果没有别名，默认使用名称
			try {
				await env.DB_0.prepare(
					'INSERT INTO sources (name, alias, api_url, status, last_collect_at, total_videos, created_at) VALUES (?, ?, ?, 1, 0, 0, ?)'
				).bind(body.name, alias, body.api_url, now).run();
				return json({ success: true, message: '添加成功' });
			} catch (e: any) {
				return json({ success: false, message: '添加失败: ' + (e.message || '未知错误') }, 500);
			}
		}

		if (request.method === 'PUT') {
			// 更新资源站信息（包括别名）
			const body = await request.json<{ id?: number; name?: string; alias?: string; api_url?: string }>();
			if (!body.id) return json({ success: false, message: '缺少ID' }, 400);

			const updates: string[] = [];
			const values: any[] = [];

			if (body.name !== undefined) {
				updates.push('name = ?');
				values.push(body.name);
			}
			if (body.alias !== undefined) {
				updates.push('alias = ?');
				values.push(body.alias);
			}
			if (body.api_url !== undefined) {
				updates.push('api_url = ?');
				values.push(body.api_url);
			}

			if (updates.length === 0) return json({ success: false, message: '没有要更新的字段' }, 400);

			values.push(body.id);
			try {
				await env.DB_0.prepare(`UPDATE sources SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
				return json({ success: true, message: '更新成功' });
			} catch (e: any) {
				return json({ success: false, message: '更新失败: ' + (e.message || '未知错误') }, 500);
			}
		}

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
			`SELECT l.*, s.name as source_name FROM collect_logs l LEFT JOIN sources s ON l.source_id = s.id ORDER BY l.created_at DESC LIMIT ?`
		).bind(limit).all<{ results: any[] }>().then(r => r.results);
		return json({ success: true, data: logs });
	}

	// 5. 触发采集（同步）
	if (path === '/api/aadmin/collect' && request.method === 'POST') {
		const body = await request.json<{ source_id?: number; mode?: string; pages?: number; categories?: string[] }>();
		if (!body.source_id) return json({ success: false, message: '缺少采集源ID' }, 400);

		const source = await env.DB_0.prepare('SELECT * FROM sources WHERE id = ?').bind(body.source_id).first<any>();
		if (!source) return json({ success: false, message: '采集源不存在' }, 404);

		const collectRes = await fetch(`${url.origin}/api/collect`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Authorization': request.headers.get('Authorization') || '' },
			body: JSON.stringify({
				source_url: source.api_url,
				source_id: body.source_id,
				mode: body.mode || 'single',
				pages: body.pages || 5,
				categories: body.categories
			})
		});
		return json(await collectRes.json());
	}

	// 5.1 后台静默采集（异步）
	if (path === '/api/aadmin/collect-async' && request.method === 'POST') {
		const body = await request.json<{ source_id?: number; mode?: string; pages?: number; categories?: string[] }>();
		if (!body.source_id) return json({ success: false, message: '缺少采集源ID' }, 400);

		const source = await env.DB_0.prepare('SELECT * FROM sources WHERE id = ?').bind(body.source_id).first<any>();
		if (!source) return json({ success: false, message: '采集源不存在' }, 404);

		context.waitUntil(
			fetch(`${url.origin}/api/collect`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					source_url: source.api_url,
					source_id: body.source_id,
					mode: body.mode || 'single',
					pages: body.pages || 5,
					categories: body.categories
				})
			}).catch(() => {})
		);

		return json({ success: true, message: '后台采集已启动', source_id: body.source_id, mode: body.mode });
	}

	// 6. 一键替换域名（m3u8 + 图片）
	if (path === '/api/aadmin/replace-domain' && request.method === 'POST') {
		const body = await request.json<{
			source_id?: number;
			old_m3u8_domain?: string;
			new_m3u8_domain?: string;
			old_image_domain?: string;
			new_image_domain?: string;
		}>();

		if (!body.source_id) return json({ success: false, message: '缺少采集源ID' }, 400);
		if (!body.old_m3u8_domain && !body.old_image_domain) {
			return json({ success: false, message: '请至少填写一个替换规则' }, 400);
		}

		// 保存域名替换规则到sources表
		const source = await env.DB_0.prepare('SELECT domain_replacements FROM sources WHERE id = ?').bind(body.source_id).first<{ domain_replacements: string }>();
		let replacements: Record<string, string> = {};
		if (source?.domain_replacements) {
			try { replacements = JSON.parse(source.domain_replacements); } catch {}
		}

		if (body.old_m3u8_domain && body.new_m3u8_domain) {
			replacements[body.old_m3u8_domain] = body.new_m3u8_domain;
		}
		if (body.old_image_domain && body.new_image_domain) {
			replacements[body.old_image_domain] = body.new_image_domain;
		}

		// 保存替换规则
		await env.DB_0.prepare(
			'UPDATE sources SET domain_replacements = ? WHERE id = ?'
		).bind(JSON.stringify(replacements), body.source_id).run();

		// 立即对已有视频执行替换
		let updatedCount = 0;
		const shards = getAllShards(env);

		if (body.old_m3u8_domain && body.new_m3u8_domain) {
			// 替换play_url中的m3u8域名
			for (const db of shards) {
				const videos = await db.prepare(
					"SELECT id, play_url FROM videos WHERE source_id = ? AND play_url LIKE ?"
				).bind(body.source_id, `%${body.old_m3u8_domain}%`).all<{ results: { id: number; play_url: string }[] }>().then(r => r.results);

				for (const v of videos) {
					const newUrl = v.play_url.replaceAll(body.old_m3u8_domain!, body.new_m3u8_domain!);
					if (newUrl !== v.play_url) {
						await db.prepare('UPDATE videos SET play_url = ?, updated_at = ? WHERE id = ?').bind(newUrl, Math.floor(Date.now() / 1000), v.id).run();
						updatedCount++;
					}
				}
			}
		}

		if (body.old_image_domain && body.new_image_domain) {
			// 替换cover中的图片域名
			for (const db of shards) {
				const videos = await db.prepare(
					"SELECT id, cover FROM videos WHERE source_id = ? AND cover LIKE ?"
				).bind(body.source_id, `%${body.old_image_domain}%`).all<{ results: { id: number; cover: string }[] }>().then(r => r.results);

				for (const v of videos) {
					const newCover = v.cover.replaceAll(body.old_image_domain!, body.new_image_domain!);
					if (newCover !== v.cover) {
						await db.prepare('UPDATE videos SET cover = ?, updated_at = ? WHERE id = ?').bind(newCover, Math.floor(Date.now() / 1000), v.id).run();
						updatedCount++;
					}
				}
			}
		}

		return json({
			success: true,
			message: `替换完成，更新了 ${updatedCount} 条视频`,
			updated: updatedCount,
			replacements
		});
	}

	// 7. 获取域名替换规则
	if (path === '/api/aadmin/domain-rules' && request.method === 'GET') {
		const sourceId = url.searchParams.get('source_id');
		if (!sourceId) return json({ success: false, message: '缺少source_id' }, 400);

		const source = await env.DB_0.prepare('SELECT domain_replacements FROM sources WHERE id = ?').bind(sourceId).first<{ domain_replacements: string }>();
		let rules: Record<string, string> = {};
		if (source?.domain_replacements) {
			try { rules = JSON.parse(source.domain_replacements); } catch {}
		}
		return json({ success: true, data: rules });
	}

	// 8. 热搜词设置
	if (path === '/api/aadmin/hot-keywords') {
		if (request.method === 'GET') {
			const hotKeywordsStr = await env.CACHE.get('hot_keywords') || '';
			return json({ success: true, data: hotKeywordsStr });
		}
		if (request.method === 'POST') {
			const body = await request.json<{ keywords?: string }>();
			if (body.keywords === undefined) return json({ success: false, message: '请提供关键词' }, 400);
			await env.CACHE.put('hot_keywords', body.keywords);
			return json({ success: true, message: '设置成功' });
		}
		if (request.method === 'DELETE') {
			await env.CACHE.delete('hot_keywords');
			return json({ success: true, message: '已清空' });
		}
	}

	// 9. 关键词管理
	if (path === '/api/aadmin/keywords' && request.method === 'DELETE') {
		const body = await request.json<{ keyword?: string }>();
		if (!body.keyword) return json({ success: false, message: '缺少关键词' }, 400);
		await env.CACHE.delete(`keyword:${body.keyword}`);
		return json({ success: true, message: '删除成功' });
	}

	// 10. 定时采集设置
	if (path === '/api/aadmin/source-schedule' && request.method === 'POST') {
		const body = await request.json<{
			source_id?: number;
			enabled?: boolean;
			mode?: string;
			cron?: string;
		}>();

		if (!body.source_id) return json({ success: false, message: '缺少采集源ID' }, 400);

		const enabled = body.enabled ? 1 : 0;
		const mode = body.mode || 'today';
		const cron = body.cron || '0 */6 * * *';

		try {
			await env.DB_0.prepare(
				'UPDATE sources SET auto_collect_enabled = ?, auto_collect_mode = ?, auto_collect_cron = ? WHERE id = ?'
			).bind(enabled, mode, cron, body.source_id).run();

			// 如果启用定时采集，将任务信息存入KV供调度器使用
			if (enabled) {
				await env.CACHE.put(`schedule:${body.source_id}`, JSON.stringify({
					source_id: body.source_id,
					mode: mode,
					cron: cron,
					enabled: true,
					updated_at: Date.now()
				}));
			} else {
				// 禁用定时采集时删除调度信息
				await env.CACHE.delete(`schedule:${body.source_id}`);
			}

			return json({ success: true, message: '定时采集设置已保存' });
		} catch (e: any) {
			return json({ success: false, message: '保存失败: ' + (e.message || '未知错误') }, 500);
		}
	}

	// 11. 获取定时采集设置
	if (path === '/api/aadmin/source-schedule' && request.method === 'GET') {
		const sourceId = url.searchParams.get('source_id');
		if (!sourceId) return json({ success: false, message: '缺少source_id' }, 400);

		const source = await env.DB_0.prepare(
			'SELECT auto_collect_enabled, auto_collect_mode, auto_collect_cron FROM sources WHERE id = ?'
		).bind(sourceId).first<any>();

		if (!source) return json({ success: false, message: '采集源不存在' }, 404);

		return json({
			success: true,
			data: {
				enabled: source.auto_collect_enabled === 1,
				mode: source.auto_collect_mode || 'today',
				cron: source.auto_collect_cron || '0 */6 * * *'
			}
		});
	}

	return json({ success: false, message: 'API not found' }, 404);
};
