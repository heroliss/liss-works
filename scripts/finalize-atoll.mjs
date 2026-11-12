// Validate the frozen export and add the current host's canonical metadata.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root='public/play/glass-atoll';
const provenance=JSON.parse(await readFile('glass-atoll-provenance.json','utf8'));
const base=process.env.SITE_BASE||'/', site=process.env.SITE_URL;
// Visitor analytics served by the community; production builds only (LISS_ANALYTICS_SRC overrides for local tests).
const analyticsSrc=process.env.LISS_ANALYTICS_SRC??(site?'https://liss.pythonanywhere.com/static/liss-analytics.js':'');
const analyticsTag=analyticsSrc?`<script async src="${analyticsSrc.replaceAll('"','&quot;')}" data-site="atoll"></script>`:'';
if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))throw Error('Invalid SITE_BASE');
for(const file of provenance.files){
  if(file.path.includes('..')||path.isAbsolute(file.path))throw Error('Invalid runtime path');
  const bytes=await readFile(path.join(root,file.path));
  if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Atoll snapshot changed: '+file.path);
  if(file.path.endsWith('.js')&&(file.adapted||file.path==='ui.js'))execFileSync(process.execPath,['--check',path.join(root,file.path)],{stdio:'pipe'});
  if(file.path.endsWith('.html')&&(site||analyticsTag)){
    const destination=path.join('dist/play/glass-atoll',file.path);
    const canonical=site?new URL(base+'play/glass-atoll/'+file.path.replace(/index\.html$/,''),site).href:'';
    const meta=canonical?`<link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website">`:'';
    const html=await readFile(destination,'utf8');
    await writeFile(destination,html.replace('</head>',`${meta}${file.path==='index.html'?analyticsTag:''}</head>`));
  }
}
console.log(`Atoll runtime integrity verified (${provenance.files.length} files).`);
