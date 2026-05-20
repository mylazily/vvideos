// 健康检查 API - 用于域名可用性检测
export const onRequest: PagesFunction = async () => {
  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    domain: 'evideos.pages.dev'
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    }
  });
};
