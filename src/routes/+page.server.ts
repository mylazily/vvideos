import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, platform }) => {
	// 首页关键数据在服务端预加载，启用流式 SSR
	try {
		// 并行请求所有关键数据
		const [homeRes, categoriesRes] = await Promise.all([
			fetch('/api/home').then(r => r.json()).catch(() => ({ success: false, data: { videos: [] } })),
			fetch('/api/categories').then(r => r.json()).catch(() => ({ success: false, data: [] }))
		]);

		return {
			// 首页视频列表（最新24个）
			homeVideos: homeRes.success ? homeRes.data.videos.slice(0, 12) : [], // 只预加载前12个
			// 分类列表
			categories: categoriesRes.success ? categoriesRes.data.slice(0, 10) : [],
			// 加载时间戳用于缓存失效
			generatedAt: Date.now()
		};
	} catch {
		return {
			homeVideos: [],
			categories: [],
			generatedAt: Date.now()
		};
	}
};

// 禁用 SSR 的路径（可选高性能优化）
export const ssr = true; // 启用 SSR 提升首屏速度
