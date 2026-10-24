import { defineConfig } from 'astro/config';
const base = process.env.SITE_BASE || '/';
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('SITE_BASE must be an absolute path with a trailing slash, such as /works/.');
export default defineConfig({ base, output: 'static', trailingSlash: 'always', devToolbar: { enabled: false }, redirects: { '/projects/lihou-web/': `${base}projects/liss-web/` } });

