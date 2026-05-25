import type { PageLoad } from './$types';

// 首页：预渲染 + 启用客户端路由（csr必须为true，否则SPA导航失效）
export const prerender = true;
export const csr = true;

export const load: PageLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/api/home');
		if (!res.ok) return { videos: [] };
		const json = await res.json();
		if (json.success && json.data) {
			const latest = json.data.latest || [];
			const hot = json.data.hot || [];
			const seen = new Set<string>();
			const videos = [];
			for (const v of [...latest, ...hot]) {
				if (!seen.has(v.vod_id)) {
					seen.add(v.vod_id);
					videos.push(v);
				}
			}
			return { videos: videos.slice(0, 24) };
		}
	} catch {
		// 构建时 API 不可用，返回空数据（客户端会动态加载）
	}
	return { videos: [] };
};
