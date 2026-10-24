import { defineConfig } from 'astro/config';
const base = process.env.SITE_BASE || '/';
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('SITE_BASE must be an absolute path with a trailing slash, such as /works/.');
const site = process.env.SITE_URL;
export default defineConfig({ ...(site ? { site } : {}), base, output: 'static', trailingSlash: 'always', devToolbar: { enabled: false }, redirects: { '/projects/lihou-web/': `${base}projects/liss-web/`, '/projects/aoe4-autovillager-tool/': `${base}projects/aoe4-flow/` } });

