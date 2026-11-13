import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {gunzipSync, gzipSync} from 'node:zlib';

// Execute the actual published loader, including asynchronous decompression and
// byte-plane decoding, without starting WebGL or reimplementing its fallback policy.
const root=new URL('../public/play/glass-atoll/',import.meta.url);
const module=await readFile(new URL('star-field.js',root),'utf8');
const start=module.indexOf('const fetchBin=async name=>{');
const end=module.indexOf('\n    const [records,diffuse,...lookups]',start);
assert.ok(start>=0&&end>start,'published binary loader exists');
const source=module.slice(start,end)+';fetchBin';

// Same format as scripts/vendor-glass-atoll.py: gzip(width, alphaOne, length LE u32, byte planes).
function pack(data,{width=4,alphaOne=false}={}){
  let values=data;
  if(alphaOne){
    values=Buffer.alloc(data.length/8*6);
    for(let r=0;r<data.length/8;r++)data.copy(values,r*6,r*8,r*8+6);
  }
  const count=values.length/width,planes=Buffer.alloc(values.length);
  for(let plane=0;plane<width;plane++)for(let i=0;i<count;i++)planes[plane*count+i]=values[i*width+plane];
  const header=Buffer.alloc(6);header[0]=width;header[1]=alphaOne?1:0;header.writeUInt32LE(data.length,2);
  return gzipSync(Buffer.concat([header,planes]));
}
const original=Buffer.from(new Float32Array([0,1,.25,-.5,1234,7e-9]).buffer);
const packed=pack(original);
let cases=0;
async function scenario(mode,expectedRequests,{codec=DecompressionStream,rawStatus=200,body=packed,raw=original}={}){
  const requests=[];
  const fetch=async address=>{
    const name=new URL(address).pathname.split('/').at(-1);requests.push(name);
    if(name.endsWith('.pk2')){
      if(mode==='network')throw new TypeError('fixture transfer failure');
      if(mode==='missing')return new Response(null,{status:404});
      return new Response(mode==='corrupt'?Buffer.from('not gzip'):body);
    }
    return new Response(rawStatus===200?raw:null,{status:rawStatus});
  };
  const load=runInNewContext(source,{fetch,Response,URL,DecompressionStream:codec,base:new URL('https://example.invalid/catalog/')});
  if(rawStatus!==200)await assert.rejects(load('stars.bin'),/stars.bin HTTP 503/);
  else assert.deepEqual(Buffer.from(await load('stars.bin')),raw);
  assert.deepEqual(requests,expectedRequests);
  cases++;
}
await scenario('ok',['stars.bin.pk2']);
await scenario('missing',['stars.bin.pk2','stars.bin']);
await scenario('network',['stars.bin.pk2','stars.bin']);
await scenario('corrupt',['stars.bin.pk2','stars.bin']);
await scenario('ok',['stars.bin.pk2','stars.bin'],{codec:class{constructor(){throw new TypeError('codec unavailable');}}});
await scenario('ok',['stars.bin'],{codec:null});
await scenario('missing',['stars.bin.pk2','stars.bin'],{rawStatus:503});
// A pack whose declared length does not match its planes is rejected in favour of the original.
const broken=gunzipSync(packed);broken.writeUInt32LE(original.length+4,2);
await scenario('ok',['stars.bin.pk2','stars.bin'],{body:gzipSync(broken)});
// RGBA16F with constant alpha 1.0 (0x3C00): alpha is dropped in the pack and restored exactly.
const halves=Buffer.alloc(4*8);for(let r=0;r<4;r++){halves.writeUInt16LE(0x1234+r,r*8);halves.writeUInt16LE(0x3800,r*8+2);halves.writeUInt16LE(r,r*8+4);halves.writeUInt16LE(0x3c00,r*8+6);}
await scenario('ok',['stars.bin.pk2'],{body:pack(halves,{width:2,alphaOne:true}),raw:halves});

// The published packs decode to the exact catalogue files they replace.
const fetchFile=async address=>{
  const name=new URL(address).pathname.split('/').at(-1);
  return new Response(await readFile(new URL(`assets/night/catalog/${name}`,root)));
};
const load=runInNewContext(source,{fetch:fetchFile,Response,URL,DecompressionStream,base:new URL('https://example.invalid/catalog/')});
let published=0;
for(const name of ['stars-float32.bin','diffuse-rgba16f.bin','lookup-native-float32.bin','lookup-wide-float32.bin']){
  assert.ok(Buffer.from(await load(name)).equals(await readFile(new URL(`assets/night/catalog/${name}`,root))),`${name}.pk2 decodes to the original`);
  published++;
}
console.log(`Atoll transfer checks passed: ${cases} cases plus ${published} published packs, actual loader, byte-identical decoding and original fallback; no GPU benchmark.`);
