import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {gzipSync} from 'node:zlib';

// Execute the actual published loader, including asynchronous decompression,
// without starting WebGL or reimplementing its fallback policy in the test.
const module=await readFile(new URL('../public/play/glass-atoll/star-field.js',import.meta.url),'utf8');
const start=module.indexOf('const fetchBin=async name=>{');
const end=module.indexOf('\n    const [records,diffuse,...lookups]',start);
assert.ok(start>=0&&end>start,'published binary loader exists');
const source=module.slice(start,end)+';fetchBin';
const original=Buffer.from(new Float32Array([0,1,.25,-.5,1234]).buffer);
const compressed=gzipSync(original);
let cases=0;
async function scenario(mode,expectedRequests,{codec=DecompressionStream,rawStatus=200}={}){
  const requests=[];
  const fetch=async address=>{
    const name=new URL(address).pathname.split('/').at(-1);requests.push(name);
    if(name.endsWith('.pack')){
      if(mode==='network')throw new TypeError('fixture transfer failure');
      if(mode==='missing')return new Response(null,{status:404});
      return new Response(mode==='corrupt'?Buffer.from('not gzip'):compressed);
    }
    return new Response(rawStatus===200?original:null,{status:rawStatus});
  };
  const load=runInNewContext(source,{fetch,Response,URL,DecompressionStream:codec,base:new URL('https://example.invalid/catalog/')});
  if(rawStatus!==200)await assert.rejects(load('stars.bin'),/stars.bin HTTP 503/);
  else assert.deepEqual(Buffer.from(await load('stars.bin')),original);
  assert.deepEqual(requests,expectedRequests);
  cases++;
}
await scenario('ok',['stars.bin.pack']);
await scenario('missing',['stars.bin.pack','stars.bin']);
await scenario('network',['stars.bin.pack','stars.bin']);
await scenario('corrupt',['stars.bin.pack','stars.bin']);
await scenario('ok',['stars.bin.pack','stars.bin'],{codec:class{constructor(){throw new TypeError('codec unavailable');}}});
await scenario('ok',['stars.bin'],{codec:null});
await scenario('missing',['stars.bin.pack','stars.bin'],{rawStatus:503});
console.log(`Atoll transfer checks passed: ${cases} cases, actual loader, byte-identical gzip output and original fallback; no GPU benchmark.`);
