import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const videoId = params.id;
  
  try {
    // 服务器端获取视频数据（零客户端延迟）
    const [videoRes, relatedRes] = await Promise.all([
      fetch(`/api/video/${videoId}`),
      fetch(`/api/video/${videoId}/related`).catch(() => null)
    ]);
    
    const videoData = videoRes.ok ? await videoRes.json() : null;
    const relatedData = relatedRes?.ok ? await relatedRes.json() : null;
    
    return {
      video: videoData?.data || null,
      related: relatedData?.data || [],
      videoId
    };
  } catch {
    return {
      video: null,
      related: [],
      videoId
    };
  }
};
