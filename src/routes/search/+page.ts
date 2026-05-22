import { redirect } from '@sveltejs/kit';

// 处理首页form提交的 /search?q=xxx 参数，重定向到 /search/xxx/1
export async function load({ url }) {
	const q = url.searchParams.get('q');
	if (q && q.trim()) {
		redirect(302, '/search/' + encodeURIComponent(q.trim()) + '/1');
	}
	return {};
}
