// 定时采集调度器 - 由Cloudflare Cron触发
export interface Env {
	DB_0: D1Database; DB_1: D1Database; DB_2: D1Database; DB_3: D1Database; DB_4: D1Database;
	DB_5: D1Database; DB_6: D1Database; DB_7: D1Database; DB_8: D1Database; DB_9: D1Database;
	CACHE: KVNamespace;
}

// 检查cron表达式是否匹配当前时间
function matchCron(cronExpr: string, now: Date): boolean {
	const parts = cronExpr.split(' ');
	if (parts.length < 5) return false;
	const [minute, hour, day, month, weekday] = parts;
	
	const check = (expr: string, value: number): boolean => {
		if (expr === '*') return true;
		if (expr.includes('/')) {
			const [, step] = expr.split('/');
			return value % parseInt(step) === 0;
		}
		if (expr.includes(',')) {
			return expr.split(',').map(Number).includes(value);
		}
		return parseInt(expr) === value;
	};
	
	return check(minute, now.getMinutes()) &&
		   check(hour, now.getHours()) &&
		   check(day, now.getDate()) &&
		   check(month, now.getMonth() + 1) &&
		   check(weekday, now.getDay());
}

// 主调度函数
export async function scheduledHandler(event: ScheduledEvent, env: Env) {
	const now = new Date();
	console.log(`[定时采集] 检查时间: ${now.toISOString()}`);
	
	// 获取所有启用了自动采集的资源站
	const sourcesResult = await env.DB_0.prepare(
		'SELECT id, name, api_url, auto_collect_cron, auto_collect_mode, domain_replacements FROM sources WHERE auto_collect_enabled = 1'
	).all();
	const sources = ((sourcesResult.results as any[]) || []).map((r: any) => ({
		id: r.id,
		name: r.name,
		api_url: r.api_url,
		auto_collect_cron: r.auto_collect_cron,
		auto_collect_mode: r.auto_collect_mode,
		domain_replacements: r.domain_replacements
	}));
	
	console.log(`[定时采集] 找到 ${sources.length} 个启用了自动采集的资源站`);
	
	for (const source of sources) {
		// 检查cron是否匹配
		if (!source.auto_collect_cron || !matchCron(source.auto_collect_cron, now)) {
			continue;
		}
		
		console.log(`[定时采集] 触发资源站 #${source.id} (${source.name})`);
		
		// 通过内部fetch调用collect-v2 API
		event.waitUntil(
			fetch('https://evideos.pages.dev/api/collect-v2', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sourceId: source.id,
					mode: source.auto_collect_mode || 'today'
				})
			}).then(res => res.json()).then(result => {
				console.log(`[定时采集] 资源站 #${source.id} 完成:`, JSON.stringify(result));
			}).catch(err => {
				console.error(`[定时采集] 资源站 #${source.id} 失败:`, err);
			})
		);
	}
}

// Cloudflare Pages Functions 的 scheduled 处理器
export const onScheduled: PagesFunction<Env> = async (context) => {
	await scheduledHandler(context.event as any, context.env);
	return new Response('OK');
};
