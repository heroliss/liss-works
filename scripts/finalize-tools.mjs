/** Add host metadata to the two vendored tools; keep upstream exports unchanged. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const base = process.env.SITE_BASE || '/';
const site = process.env.SITE_URL;
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('Invalid SITE_BASE');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const provenance = JSON.parse(await readFile('tools-provenance.json', 'utf8'));
for (const source of provenance.sources) for (const file of source.files) {
  if (!file.path.startsWith('public/tools/')) throw new Error('Tool source outside public/tools');
  const hash = createHash('sha256').update(await readFile(file.path)).digest('hex');
  if (hash !== file.sha256) throw new Error(`Tool export changed: ${file.path}`);
}
const tools = [
  { route: 'mkfun', slug: 'mkfun', title: 'mkfun · 结构映射实验台', fallback: false },
  { route: 'utilities', slug: 'utility-lab', title: 'Liss Utilities · 字符与文件名工具', fallback: true },
];
for (const tool of tools) {
  const destination = path.join('dist', 'tools', tool.route, 'index.html');
  let html = await readFile(destination, 'utf8');
  const metadata = site ? (() => {
    const canonical = escape(new URL(`${base}tools/${tool.route}/`, site).href);
    return `<link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}"><meta property="og:title" content="${escape(tool.title)}"><meta property="og:type" content="website">`;
  })() : '';
  html = html.replace('</head>', `${metadata}</head>`);
  if (tool.fallback) html = html.replace('<div id="app">', '<noscript><h1>Liss Utilities</h1><p>请启用 JavaScript，以在本机检索字符或处理文件名。</p></noscript><div id="app">');
  await writeFile(destination, html);
}
console.log('Two static tools prepared with host metadata and a no-JavaScript fallback.');
