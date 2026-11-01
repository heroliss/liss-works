// Validate the frozen export and add the current host's canonical metadata.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root='public/play/glass-atoll';
const provenance=JSON.parse(await readFile('glass-atoll-provenance.json','utf8'));
const base=process.env.SITE_BASE||'/', site=process.env.SITE_URL;
if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))throw Error('Invalid SITE_BASE');
for(const file of provenance.files){
  if(file.path.includes('..')||path.isAbsolute(file.path))throw Error('Invalid runtime path');
  const bytes=await readFile(path.join(root,file.path));
  if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Atoll snapshot changed: '+file.path);
  if(file.path.endsWith('.js')&&(file.adapted||file.path==='ui.js'))execFileSync(process.execPath,['--check',path.join(root,file.path)],{stdio:'pipe'});
  if(file.path.endsWith('.html')&&site){
    const destination=path.join('dist/play/glass-atoll',file.path);
    const canonical=new URL(base+'play/glass-atoll/'+file.path.replace(/index\.html$/,''),site).href;
    const html=await readFile(destination,'utf8');
    await writeFile(destination,html.replace('</head>',`<link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website"></head>`));
  }
}
console.log(`Atoll runtime integrity verified (${provenance.files.length} files).`);
