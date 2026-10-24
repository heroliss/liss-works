import { readdir,readFile,stat } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const base=process.env.SITE_BASE||'/';
const site=process.env.SITE_URL;
if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))throw new Error('Invalid SITE_BASE');
async function walk(dir){const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())result.push(...await walk(p));else result.push(p);}return result;}
const files=await walk(root), pages=files.filter(p=>p.endsWith('.html')), failures=[];
const has=async p=>{try{return(await stat(p)).isFile()}catch{return false}};
let urls=0,images=0,anchors=0,redirects=0,canonicalPages=0,notFoundPages=0;
const cache=new Map();
async function htmlFor(p){if(!cache.has(p))cache.set(p,await readFile(p,'utf8'));return cache.get(p);}
const redirectTarget=html=>html.match(/<meta\s+http-equiv="refresh"\s+content="0;url=([^"]+)"/i)?.[1];
for(const file of pages){
 const html=await htmlFor(file), ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 if(new Set(ids).size!==ids.length)failures.push(`${file}: duplicate IDs`);
 const refresh=redirectTarget(html);
 if(refresh){
  redirects++;
  const canonical=site?new URL(refresh,site).href:refresh;
  if(!refresh.startsWith(base)||refresh.startsWith('//')||!html.includes(`rel="canonical" href="${canonical}"`))failures.push(`${file}: invalid redirect target`);
 }else if((html.match(/<h1(?:\s|>)/g)??[]).length!==1)failures.push(`${file}: expected one h1`);
 const relative=path.relative(root,file).replaceAll(path.sep,'/');
 if(relative==='404.html'){
  notFoundPages++;
  if(!html.includes('<meta name="robots" content="noindex"'))failures.push(`${file}: missing 404 noindex`);
 }else if(site&&!refresh){
  const canonical=new URL(base+relative.replace(/index\.html$/,''),site).href;
  if(!html.includes(`rel="canonical" href="${canonical}"`)||!html.includes(`property="og:url" content="${canonical}"`))failures.push(`${file}: invalid canonical or Open Graph URL`);else canonicalPages++;
 }
 for(const tag of html.matchAll(/<img\b[^>]*>/g)){images++;if(!/\balt(?:=|\s|>)/.test(tag[0])||(/\bsrc=/.test(tag[0])&&(!/\bwidth=/.test(tag[0])||!/\bheight=/.test(tag[0]))))failures.push(`${file}: image missing alt or dimensions`);}
 const refs=[...html.matchAll(/\b(?:src|href|poster)="([^"]+)"/g)].map(m=>m[1]);
 for(const set of html.matchAll(/\bsrcset="([^"]+)"/g))refs.push(...set[1].split(',').map(v=>v.trim().split(/\s+/)[0]));
 for(const raw of refs){if(/^(https?:|mailto:|data:|tel:|javascript:)/i.test(raw))continue;urls++;
  const u=new URL(raw,'http://local'+base+path.relative(root,file).replaceAll(path.sep,'/'));
  const fullPath=decodeURIComponent(u.pathname);
  if(!fullPath.startsWith(base)){failures.push(`${path.relative(root,file)}: escapes site base ${raw}`);continue;}
  const decoded='/'+fullPath.slice(base.length);let dest=path.resolve(root,'.'+decoded);
  if(!dest.startsWith(root+path.sep)&&dest!==root){failures.push(`Out of bounds: ${raw}`);continue;}
  if(decoded.endsWith('/'))dest=path.join(dest,'index.html');
  if(!(await has(dest))){failures.push(`${path.relative(root,file)}: missing ${raw}`);continue;}
  if(u.hash&&dest.endsWith('.html')){anchors++;const target=await htmlFor(dest);const id=decodeURIComponent(u.hash.slice(1));if(!target.includes('id="'+id+'"'))failures.push(`${path.relative(root,file)}: missing anchor ${raw}`);}
 }
}
let cssAssets=0,projectTalkLinks=0;
for(const file of files.filter(p=>p.endsWith('.css'))){
 const css=await readFile(file,'utf8');
 for(const match of css.matchAll(/url\(\s*["']?([^\s)"']+)["']?\s*\)/g)){
  const raw=match[1];if(!raw.startsWith('/')||raw.startsWith('//'))continue;cssAssets++;
  if(!raw.startsWith(base)||!(await has(path.resolve(root,'.'+'/'+raw.slice(base.length)))))failures.push(`${path.relative(root,file)}: invalid CSS asset ${raw}`);
 }
}
for(const file of pages.filter(p=>path.relative(root,p).replaceAll(path.sep,'/').match(/^projects\/[^/]+\/index\.html$/))){
 const html=await htmlFor(file),slug=path.basename(path.dirname(file));
 if(redirectTarget(html))continue;
 const talkUrl=`https://liss.pythonanywhere.com/projects/${slug}/talk/`;
 if(!html.includes(`href="${talkUrl}"`))failures.push(`${path.relative(root,file)}: missing project discussion link`);else projectTalkLinks++;
}
if(notFoundPages!==1)failures.push('Expected one 404.html page');
const summary={base,pages:pages.length,contentPages:pages.length-redirects,redirectPages:redirects,canonicalPages,notFoundPages,localReferences:urls,images,fragmentLinks:anchors,cssAssets,projectTalkLinks,failures};
console.log(JSON.stringify(summary,null,2));if(failures.length)process.exitCode=1;

