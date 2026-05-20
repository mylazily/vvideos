import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const baseUrl = 'https://evideos.pages.dev';
  
  // 静态页面
  const staticPages = [
    '',
    '/discover',
    '/category',
    '/rank',
    '/search',
    '/profile',
    '/history',
    '/favorite',
    '/settings',
    '/admin'
  ];

  const now = new Date().toISOString();

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // 添加静态页面
  for (const page of staticPages) {
    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}${page}</loc>\n`;
    xml += `    <lastmod>${now}</lastmod>\n`;
    xml += `    <changefreq>${page === '' ? 'daily' : 'weekly'}</changefreq>\n`;
    xml += `    <priority>${page === '' ? '1.0' : '0.8'}</priority>\n`;
    xml += '  </url>\n';
  }

  xml += '</urlset>';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600'
    }
  });
};
