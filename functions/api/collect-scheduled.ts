// 定时采集调度器 - 由Cloudflare Cron触发
import { collectV2 } from './collect-v2';

export interface Env {
	DB_0: D1Database; DB_1: D1Database; DB_2: D1Database; DB_3: D1Database; DB_4: D1Database;
	DB_5: D1Database; DB_6: D1Database; DB_7: D1Database; DB_8: D1Database; DB_9: D1Database;
	CACHE: KVNamespace;
}

// 检查cron表达式是否匹配当前时间
function matchCron(cronExpr: string, now: Date): boolean {
	const [minute, hour, day, month, weekday] = cronExpr.split(' ');
	
	const check = (expr: string, value: number, max: number): boolean => {
		if (expr === '*') return true;
		if (expr.includes('/')) {
			const [, step] = expr.split('/');
			return value % parseInt(step) === 0;
		}
		if (expr.includes(',')) {
			return expr.split(',').map(Number).includes(value);
		}
		if (expr === '*') return true;
		return parseInt(expr) === value;
	};
	
	return check(minute, now.getMinutes(), 60) &&
		   check(hour, now.getHours(), 24) &&
		   check(day, now.getDate(), 31) &&
		   check(month, now.getMonth() + 1, 12) &&
		   check(weekday, now.getDay(), 7);
}

// 主调度函数
export async function scheduledHandler(event: ScheduledEvent, env: Env) {
	const now = new Date();
	console.log(`[定时采集] 检查时间: ${now.toISOString()}`);
	
	// 获取所有启用了自动采集的资源站
	const sources = await env.DB_0.prepare(
		'SELECT id, name, api_url, auto_collect_cron, auto_collect_mode, domain_replacements FROM sources WHERE auto_collect_enabled = 1'
	).all<{
		results: {
			id: number;
			name: string;
			api_url: string;
			auto_collect_cron: string;
			auto_collect_mode: string;
			domain_replacements: string;
		}[]
	}>().then(r => r.results || []);
	
	console.log(`[定时采集] 找到 ${sources.length} 个启用了自动采集的资源站`);
	
	for (const source of sources) {
		// 检查cron是否匹配
		if (!source.auto_collect_cron || !matchCron(source.auto_collect_cron, now)) {
			continue;
		}
		
		console.log(`[定时采集] 触发资源站 #${source.id} (${source.name})`);
		
		// 异步执行采集（不等待完成）
		event.waitUntil(
			collectV2(
				{
					id: source.id,
					name: source.name,
					api_url: source.api_url,
					domain_replacements: source.domain_replacements
				},
				(source.auto_collect_mode as any) || 'today',
				env,
				5 // 默认采集5页
			).then(result => {
				console.log(`[定时采集] 资源站 #${source.id} 完成: 新增${result.new}, 更新${result.updated}`);
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
