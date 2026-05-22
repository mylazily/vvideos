import type { PageLoad } from './$types';

// 首页纯静态预渲染 - 构建时从线上API获取数据
export const prerender = true;
// 禁用客户端 hydration - 零JS
export const csr = false;

export const load: PageLoad = async ({ fetch }) => {
	try {
		// 构建时从线上API获取首页数据
		const res = await fetch('https://evideos.pages.dev/api/home');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const json = await res.json();
		if (json.success && json.data?.videos) {
			return { videos: json.data.videos.slice(0, 24) };
		}
	} catch (e) {
		console.warn('首页预渲染数据获取失败，使用空数据:', e);
	}
	return { videos: [] };
};
