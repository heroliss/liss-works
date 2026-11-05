import type { APIRoute } from 'astro';
import { projects } from '../data/projects';
import { sitePath } from '../lib/site-path';

/** Content pages for search consoles; standalone exports under play/ and tools/ stay out. */
const sitemapPaths = ['/', '/projects/', '/lab/', '/about/', ...projects.map(project => `/projects/${project.slug}/`)];

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL('http://127.0.0.1:4321');
  const entries = sitemapPaths.map(path => `  <url><loc>${new URL(sitePath(path), origin).href}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
