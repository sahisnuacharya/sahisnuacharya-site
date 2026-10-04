import type { APIRoute } from 'astro';
import { listProjects } from '../lib/content';

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://sahisnuacharya.com.np');
  const pages = ['/', '/work', '/services', '/about', '/contact', '/privacy'];
  const projects = await listProjects();
  const urls = [...pages, ...projects.map((p) => `/work/${p.slug}`)]
    .map((path) => `  <url><loc>${escapeXml(new URL(path, base).toString())}</loc></url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
