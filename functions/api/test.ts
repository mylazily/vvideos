// 最小测试API
export const onRequest = async () => {
	return new Response(JSON.stringify({ ok: true, time: Date.now() }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
