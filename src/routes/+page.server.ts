import type { PageServerLoad } from './$types';

// 使用静态数据，避免服务端 fetch 问题
export const load: PageServerLoad = async () => {
	// 返回空数据，让客户端加载
	// 这样可以避免静态生成时 fetch 失败的问题
	return {
		homeVideos: [],
		categories: [],
		generatedAt: Date.now()
	};
};

// 禁用 SSR，纯客户端渲染
export const ssr = false;
export const prerender = true;
