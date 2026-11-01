/**
 * Optional OpenColorIO2.6 ACES2 display output, explicit non-official accurate-atan variant.
 * No production caller/default is enabled here. Original OCIO licence and source inverse:
 * vendor/aces2/. Output of the complete function is linear709, numeric1=100nit.
 * Caller owns C/P policy: this pass multiplies exposure once, units once, OETF at most once.
 * Raw GL is borrowed synchronously and restored exactly; Three's state cache is not reset.
 */
import {ACES2_VENDOR_PIN} from './vendor/aces2/manifest.js';

export const ACES2_OUTPUT_VARIANT='aces2-ocio26-accurate-atan-v1';
export const ACES2_OUTPUT_TARGETS=Object.freeze([100,700,1270]);
export const ACES2_OUTPUT_PEAK_RANGE=Object.freeze({min:100,max:10000,integerOnly:true});
const GENERATED_CACHE_LIMIT=12,GENERATED_MAX_FILE=8*1024*1024,GENERATED_MAX_PACKAGE=16*1024*1024;
const GENERATED_PINS=Object.freeze({exporter:'4f4d6331e0bd280558259bbdce15d27bc3c9bbf3f5f97dd96d86cca5c9de75ea',core:'f0fcdd7629964d612b4805604bbbd9559b0fcf04129a104040ffccb7cf230a2c',input:'fa82b382df34da9b22805bb823c446dd56f6f9e4cd06d02b77d6286ad3184474',atan:'565860bc7bbb5a1f9b4cce3e53609a311fe260e14dd2968ef28533dfbfa30d19',prefix:'49dd358bfdf956aa14aa14dcff89775c4e662e4024bcbe7e71bb5df178c40552',fixtureInput:'9aa238a027e45d80d6e9d6f246bc24c07fa0780a871a90da904876e7a0e7d158',license:'8850b0c83cd41d26ad0e080861d47ee00afb685386a459a1cbe8c347555621a7'});
const inPeakRange=peak=>peak>=ACES2_OUTPUT_PEAK_RANGE.min&&peak<=ACES2_OUTPUT_PEAK_RANGE.max;
const SCHEMA='glass-atoll.aces2-output-vendor.v1',GATE=Object.freeze({absolute:2e-5,relative:2e-4}),F32MAX=3.4028234663852886e38;
const VERTEX=`#version 300 es
precision highp float;
const vec2 positions[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
out vec2 vUv;
void main(){vec2 p=positions[gl_VertexID];vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
const decoder=new TextDecoder('utf-8',{fatal:true}),errorText=e=>String(e?.message||e),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function requireThat(value,message){if(!value)throw Error('ACES2 output: '+message);}
function peakValue(value){if(typeof value!=='number'||!Number.isFinite(value)||!Number.isInteger(value))throw new TypeError('ACES2 peakNits must be a finite integer');return value;}
function assetEntry(entry){requireThat(entry&&typeof entry.file==='string'&&/^[a-zA-Z0-9._/-]+$/.test(entry.file)&&!entry.file.split('/').includes('..')&&validHash(entry.sha256)&&Number.isInteger(entry.bytes)&&entry.bytes>0,'invalid asset record');}
export function validateACES2OutputManifest(m){
  requireThat(m?.schema===SCHEMA&&m.variant===ACES2_OUTPUT_VARIANT&&m.OCIOVersion==='2.6.0'&&m.nonOfficialNumericalVariant===true,'manifest schema/variant mismatch');
  requireThat(same(m.supportedPeaks,ACES2_OUTPUT_TARGETS)&&same(m.tolerance,GATE)&&Array.isArray(m.targets)&&m.targets.length===3,'unsupported target/tolerance manifest');
  assetEntry(m.atanHelper);assetEntry(m.license);const seen=new Set();
  for(const e of m.targets){requireThat(ACES2_OUTPUT_TARGETS.includes(e.peakNits)&&!seen.has(e.peakNits),'duplicate or unsupported target');seen.add(e.peakNits);requireThat(e.function===`aces2Display${e.peakNits}`,'function name mismatch');assetEntry(e.functionFile);assetEntry(e.originalFile);assetEntry(e.anchors);requireThat(Array.isArray(e.tables)&&e.tables.length===2,'two hue tables required');
    for(let i=0;i<2;i++){const t=e.tables[i];assetEntry(t);requireThat(t.index===i&&t.samplerName===`aces2_${e.peakNits}_${i===0?'reach_m':'gamut_cusp'}_table_0Sampler`&&t.width===363&&t.height===1&&t.components===4&&t.bytes===5808&&t.internalFormat==='RGBA32F'&&t.format==='RGBA'&&t.type==='FLOAT'&&t.filter==='NEAREST'&&t.wrap==='CLAMP_TO_EDGE'&&t.mipmaps===false&&t.flipY===false&&t.colorSpace==='NoColorSpace','hue-table format/filter mismatch');}
    requireThat(e.inverse?.prefixFile===m.atanHelper.file&&e.inverse.from==='atan(Aab.b, Aab.g)'&&e.inverse.to==='qaAccurateAtan2(Aab.b, Aab.g)'&&e.inverse.replacements===1&&e.inverse.wholeOriginalSHA256===e.originalFile.sha256,'source inverse contract mismatch');
  }return m;
}
export function buildACES2OutputFragment(source,functionName){
  const match=typeof functionName==='string'?/^aces2Display([1-9][0-9]*)$/.exec(functionName):null;
  requireThat(typeof source==='string'&&match&&inPeakRange(Number(match[1])),'invalid colour source/function');
  return `#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform highp sampler2D tInput;uniform float uExposure;uniform float uNitsToLinear;uniform int uEncodeSRGB;
in vec2 vUv;out vec4 colour;
${source}
vec3 encodeSignedSRGB(vec3 x){vec3 a=abs(x);return sign(x)*mix(1.055*pow(a,vec3(1./2.4))-.055,12.92*a,lessThanEqual(a,vec3(.0031308)));}
void main(){vec3 exposed=texture(tInput,vUv).rgb*uExposure;vec3 mapped=${functionName}(vec4(exposed,1.)).rgb*uNitsToLinear;colour=vec4(uEncodeSRGB==0?mapped:encodeSignedSRGB(mapped),1.);}`;
}
function floatData(bytes){requireThat(bytes.byteLength%4===0,'unaligned Float32 resource');const view=new DataView(bytes),out=new Float32Array(bytes.byteLength/4);for(let i=0;i<out.length;i++)out[i]=view.getFloat32(i*4,true);return out;}
async function digest(bytes){requireThat(globalThis.crypto?.subtle,'WebCrypto SHA256 is required');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
function captureGL(g,uploads=false){
  const active=g.getParameter(g.ACTIVE_TEXTURE),slots=[];for(let i=0;i<3;i++){g.activeTexture(g.TEXTURE0+i);slots.push([g.getParameter(g.TEXTURE_BINDING_2D),g.getParameter(g.SAMPLER_BINDING)]);}g.activeTexture(active);
  const capNames=['BLEND','DEPTH_TEST','STENCIL_TEST','CULL_FACE','SCISSOR_TEST','RASTERIZER_DISCARD','SAMPLE_ALPHA_TO_COVERAGE','SAMPLE_COVERAGE','DITHER'];
  const s={active,slots,program:g.getParameter(g.CURRENT_PROGRAM),vao:g.getParameter(g.VERTEX_ARRAY_BINDING),draw:g.getParameter(g.DRAW_FRAMEBUFFER_BINDING),read:g.getParameter(g.READ_FRAMEBUFFER_BINDING),viewport:Array.from(g.getParameter(g.VIEWPORT)),mask:Array.from(g.getParameter(g.COLOR_WRITEMASK)),caps:capNames.map(k=>[g[k],g.isEnabled(g[k])])};
  if(uploads){s.pixel=Object.fromEntries(['PACK_ALIGNMENT','PACK_ROW_LENGTH','PACK_SKIP_PIXELS','PACK_SKIP_ROWS','UNPACK_ALIGNMENT','UNPACK_ROW_LENGTH','UNPACK_IMAGE_HEIGHT','UNPACK_SKIP_PIXELS','UNPACK_SKIP_ROWS','UNPACK_SKIP_IMAGES','UNPACK_FLIP_Y_WEBGL','UNPACK_PREMULTIPLY_ALPHA_WEBGL','UNPACK_COLORSPACE_CONVERSION_WEBGL'].map(k=>[k,g.getParameter(g[k])]));s.pack=g.getParameter(g.PIXEL_PACK_BUFFER_BINDING);s.unpack=g.getParameter(g.PIXEL_UNPACK_BUFFER_BINDING);}
  return s;
}
function restoreGL(g,s){
  g.bindFramebuffer(g.DRAW_FRAMEBUFFER,s.draw);g.bindFramebuffer(g.READ_FRAMEBUFFER,s.read);g.viewport(...s.viewport);g.colorMask(...s.mask);for(const [cap,enabled]of s.caps)(enabled?g.enable:g.disable).call(g,cap);g.useProgram(s.program);g.bindVertexArray(s.vao);
  for(let i=0;i<3;i++){g.activeTexture(g.TEXTURE0+i);g.bindTexture(g.TEXTURE_2D,s.slots[i][0]);g.bindSampler(i,s.slots[i][1]);}g.activeTexture(s.active);
  if(s.pixel){for(const [key,value]of Object.entries(s.pixel))g.pixelStorei(g[key],value);g.bindBuffer(g.PIXEL_PACK_BUFFER,s.pack);g.bindBuffer(g.PIXEL_UNPACK_BUFFER,s.unpack);}
}
function beginDraw(g,resource,input,framebuffer,viewport,exposure,nitsToLinear,encode){
  g.bindFramebuffer(g.DRAW_FRAMEBUFFER,framebuffer);g.viewport(...viewport);for(const cap of [g.BLEND,g.DEPTH_TEST,g.STENCIL_TEST,g.CULL_FACE,g.SCISSOR_TEST,g.RASTERIZER_DISCARD,g.SAMPLE_ALPHA_TO_COVERAGE,g.SAMPLE_COVERAGE,g.DITHER])g.disable(cap);g.colorMask(true,true,true,true);g.bindVertexArray(resource.vao);g.useProgram(resource.program);
  for(let i=0;i<3;i++){g.activeTexture(g.TEXTURE0+i);g.bindTexture(g.TEXTURE_2D,i===0?input:resource.tables[i-1]);g.bindSampler(i,null);}
  g.uniform1i(resource.uniforms.tInput,0);g.uniform1i(resource.uniforms.tables[0],1);g.uniform1i(resource.uniforms.tables[1],2);g.uniform1f(resource.uniforms.exposure,exposure);g.uniform1f(resource.uniforms.units,nitsToLinear);g.uniform1i(resource.uniforms.encode,encode?1:0);
}
function uploadTexture(g,slot,width,height,data){const texture=g.createTexture();requireThat(texture,'texture allocation failed');try{g.activeTexture(g.TEXTURE0+slot);g.bindTexture(g.TEXTURE_2D,texture);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_BASE_LEVEL,0);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAX_LEVEL,0);g.texImage2D(g.TEXTURE_2D,0,g.RGBA32F,width,height,0,g.RGBA,g.FLOAT,data);return texture;}catch(error){g.deleteTexture(texture);throw error;}}
function destroy(g,r){if(!r)return;if(r.program)g.deleteProgram(r.program);if(r.vao)g.deleteVertexArray(r.vao);for(const t of r.tables||[])g.deleteTexture(t);}
function errorList(g){const out=[];for(let i=0;i<16;i++){const e=g.getError();if(e===g.NO_ERROR)break;out.push(e);}return out;}
// Dynamic packages remain trusted-local exports, not cryptographically signed assets.
// All URLs are derived from the requested integer, never followed from arbitrary metadata.
function flatMember(name){requireThat(typeof name==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)&&name!=='.'&&name!=='..','generated member must be a flat basename');return name;}
export function validateACES2GeneratedPackage(info,peak){
  requireThat(Number.isInteger(peak)&&inPeakRange(peak),'generated peak out of range');
  const root=`/vendor/aces2-generated/${peak}/`,d=info?.descriptor,c=d?.candidate;
  requireThat(info?.status==='cpu-ready'&&info.schema==='glass-atoll.aces2-generated-target-ready.v1'&&info.peakNits===peak&&info.assetBaseURL===root&&info.descriptorURL===root+'candidate-export-report.json'&&info.actualGPU===false&&info.gpuAdmission==='required'&&info.productionIntegrated===false,'generated service-ready contract mismatch');
  requireThat(info.exporterSHA256===GENERATED_PINS.exporter&&info.cacheKey==='ocio2.6.0-numpy2.3.4-rec709-atan17-'+GENERATED_PINS.exporter&&[info.candidateDescriptorSHA256,info.artifactManifestSHA256,info.readyMarkerSHA256].every(validHash),'generated ready hash/provenance mismatch');
  requireThat(d?.schema==='glass-atoll.official-aces2-export.v1'&&d.passed===true&&d.actualGPU===false&&d.productionIntegrated===false&&d.OCIOVersion==='2.6.0'&&d.NumPyVersion==='2.3.4'&&d.scriptSHA256===GENERATED_PINS.exporter&&d.sourceInputSHA256===GENERATED_PINS.input&&d.provenance?.coreSHA256===GENERATED_PINS.core&&d.counts?.passed===d.counts?.total&&d.counts.total>=14&&Array.isArray(d.checks)&&d.checks.length===d.counts.total&&d.checks.every(v=>v.passed===true)&&Array.isArray(d.targets)&&d.targets.length===1,'generated descriptor pinned CPU/core contract mismatch');
  requireThat(c?.version==='range-reduced-taylor17-v1'&&c.nonOfficial===true&&c.productionIntegrated===false&&c.mathSHA256===GENERATED_PINS.atan&&c.prefixSHA256===GENERATED_PINS.prefix&&c.inverseExact===true&&same(c.replacement,{from:'atan(Aab.b, Aab.g)',to:'qaAccurateAtan2(Aab.b, Aab.g)',count:1})&&same(c.colourGateUnchanged,GATE),'generated atan/source inverse contract mismatch');
  const t=d.targets[0],p=t.gpuPattern;
  requireThat(t.peakNits===peak&&t.style==='FIXED_FUNCTION_ACES_OUTPUT_TRANSFORM_20'&&same(t.params,[peak,.64,.33,.3,.6,.15,.06,.3127,.329])&&t.function===`aces2Display${peak}`&&t.functionFile===`aces2-${peak}-accurate-atan.glsl`&&t.probeFragmentFile===`aces2-${peak}-accurate-atan-probe.frag`&&c.officialFunctionFile===`aces2-${peak}-official.glsl`&&t.cpuOracleFile===`aces2-${peak}-cpu.json`&&t.language==='GLSL ES3.0'&&t.textures3D===0&&t.officialDynamicUniforms===0&&[t.functionSHA256,t.probeFragmentSHA256,c.officialFunctionSHA256].every(validHash),'generated exact target/function mismatch');
  requireThat(Array.isArray(t.textures2D)&&t.textures2D.length===2,'generated target requires exactly two tables');
  for(let i=0;i<2;i++){
    const table=t.textures2D[i],u=table.upload,kind=i===0?'reach_m':'gamut_cusp';
    requireThat(table.index===i&&table.bindingIndex===i+1&&table.width===363&&table.height===1&&table.originalChannels===(i===0?1:3)&&table.textureName===`aces2_${peak}_${kind}_table_0`&&table.samplerName===`aces2_${peak}_${kind}_table_0Sampler`&&table.dimensions==='TextureDimensions.TEXTURE_2D'&&table.interpolation==='Interpolation.INTERP_NEAREST'&&table.dataType==='IEEE754 float32 little-endian'&&table.rawFile===`aces2-${peak}-table-${i}-raw.f32`&&table.rgbaUploadFile===`aces2-${peak}-table-${i}-rgba.f32`&&table.rawBytes===363*(i===0?1:3)*4&&table.rgbaBytes===5808&&[table.rawSHA256,table.rgbaSHA256].every(validHash),'generated hue table metadata mismatch');
    requireThat(u?.internalFormat==='RGBA32F'&&u.format==='RGBA'&&u.type==='FLOAT'&&u.minFilter==='NEAREST'&&u.magFilter==='NEAREST'&&u.wrapS==='CLAMP_TO_EDGE'&&u.wrapT==='CLAMP_TO_EDGE'&&u.generateMipmaps===false&&u.flipY===false&&u.unpackAlignment===1&&u.colorSpace==='NoColorSpace','generated table filtering/units mismatch');
  }
  requireThat(p?.width===64&&p.height===16&&p.samples===963&&p.paddedPixels===61&&p.stride===4&&p.dtype==='float32 little-endian RGBA'&&p.inputFile===`aces2-${peak}-gpu-input.f32`&&p.expectedFile===`aces2-${peak}-cpu-expected.f32`&&p.inputSHA256===GENERATED_PINS.fixtureInput&&validHash(p.expectedSHA256),'generated 963 fixture geometry mismatch');
  const f=info.fixtures;
  requireThat(f?.sampleCount===963&&f.width===64&&f.height===16&&f.paddedPixels===61&&f.stride===4&&f.dtype===p.dtype&&f.inputRounding===p.inputRounding&&f.layout===p.layout,'service fixture metadata mismatch');
  for(const [key,file,sha]of [['input',p.inputFile,p.inputSHA256],['expected',p.expectedFile,p.expectedSHA256],['oracle',t.cpuOracleFile,null]])requireThat(f[key]?.url===root+file&&validHash(f[key].sha256)&&Number.isInteger(f[key].bytes)&&f[key].bytes>0&&f[key].bytes<=GENERATED_MAX_FILE&&(sha===null||f[key].sha256===sha),'service fixture URL/hash mismatch');
  requireThat(f.input.bytes===16384&&f.expected.bytes===16384&&same(info.cpuChecks,d.counts),'service CPU checks/fixture sizes mismatch');
  return{root,descriptor:d,target:t};
}
export function validateACES2GeneratedFixtures(cpu,input,expected,peak,target){
  requireThat(cpu?.schema==='glass-atoll.official-aces2-cpu-oracle.v1'&&cpu.peakNits===peak&&cpu.library?.version==='2.6.0'&&cpu.sampleCount===963&&Array.isArray(cpu.samples)&&cpu.samples.length===963&&same(cpu.gpuPattern,target.gpuPattern)&&same(cpu.params,target.params),'generated CPU oracle schema mismatch');
  requireThat(input instanceof Float32Array&&expected instanceof Float32Array&&input.length===4096&&expected.length===4096,'generated fixture Float32 size mismatch');
  const ids=new Set(),rows=[];let black=0,blue=0;
  for(let i=0;i<1024;i++){
    const row=i<963?cpu.samples[i]:{id:`padding-${i-963}`,family:'opaque-black-padding',inputFloat32:[0,0,0],outputNormalized100Nit:[0,0,0]};
    requireThat(typeof row.id==='string'&&!ids.has(row.id)&&typeof row.family==='string'&&Array.isArray(row.inputFloat32)&&row.inputFloat32.length===3&&row.inputFloat32.every(v=>Number.isFinite(v)&&Math.fround(v)===v)&&Array.isArray(row.outputNormalized100Nit)&&row.outputNormalized100Nit.length===3&&row.outputNormalized100Nit.every(v=>Number.isFinite(v)&&v>=0&&v<=peak/100+1e-6&&Math.fround(v)===v),'invalid generated CPU row');ids.add(row.id);
    for(let c=0;c<4;c++){requireThat(input[i*4+c]===(c===3?1:row.inputFloat32[c])&&expected[i*4+c]===(c===3?1:row.outputNormalized100Nit[c]),'CPU JSON/Float32 fixture mismatch at row'+i+' channel'+c);}
    const exactBlack=row.id==='neutral-0',positiveBlue=row.id==='hue-blue-1.71661376953125e-07';if(exactBlack){black++;requireThat(row.outputNormalized100Nit.every(v=>v===0),'invalid exact-black fixture');}if(positiveBlue){blue++;requireThat(row.outputNormalized100Nit[2]>0,'invalid very-low-blue fixture');}
    rows.push({id:row.id,family:row.family,inputFloat32:row.inputFloat32,expected:row.outputNormalized100Nit,exactBlack,positiveBlue,padding:i>=963});
  }
  requireThat(black===1&&blue===1,'full oracle lacks required black/low-blue sentinel');
  return{generated:true,width:64,height:16,sampleCount:963,paddedPixels:61,rows};
}
export function validateACES2GeneratedReadback(output,anchor,peak){
  requireThat(output instanceof Float32Array&&output.length===4096&&anchor?.generated===true&&anchor.rows.length===1024,'invalid generated GPU readback');
  let maximumAbsoluteError=0,maximumBudgetRatio=0,strictAbsoluteFailures=0,failedChannels=0,nonFinite=0,negative=0,rangeFailures=0,alphaFailures=0,blackFailures=0,lowBlueFailures=0,paddingFailures=0,worst=null;const byFamily=Object.create(null);
  for(let i=0;i<1024;i++){
    const row=anchor.rows[i],family=byFamily[row.family]??={samples:0,maximumAbsoluteError:0,maximumBudgetRatio:0,failedChannels:0,strictAbsoluteFailures:0};family.samples++;
    if(output[i*4+3]!==1)alphaFailures++;
    for(let c=0;c<3;c++){
      const actual=output[i*4+c],expected=row.expected[c],error=Math.abs(actual-expected),limit=GATE.absolute+GATE.relative*Math.abs(expected),ratio=Number.isFinite(error)?error/limit:Infinity;
      if(!Number.isFinite(actual))nonFinite++;if(actual<0)negative++;if(actual>peak/100+GATE.absolute)rangeFailures++;
      if(!(error<=limit)){failedChannels++;family.failedChannels++;}if(error>GATE.absolute){strictAbsoluteFailures++;family.strictAbsoluteFailures++;}
      if(row.exactBlack&&actual!==0)blackFailures++;if(row.padding&&actual!==0)paddingFailures++;
      family.maximumAbsoluteError=Math.max(family.maximumAbsoluteError,error);family.maximumBudgetRatio=Math.max(family.maximumBudgetRatio,ratio);
      maximumAbsoluteError=Math.max(maximumAbsoluteError,error);
      if(ratio>maximumBudgetRatio){maximumBudgetRatio=ratio;worst={id:row.id,family:row.family,channel:c,inputFloat32:[...row.inputFloat32],actual,expected,absoluteError:error,allowedError:limit,budgetRatio:ratio};}
    }
    if(row.positiveBlue&&!(output[i*4+2]>0&&output[i*4+2]>output[i*4]&&output[i*4+2]>output[i*4+1]))lowBlueFailures++;
  }
  const passed=failedChannels+nonFinite+negative+rangeFailures+alphaFailures+blackFailures+lowBlueFailures+paddingFailures===0;
  const validation={passed,admission:'full-963-exact-peak',exactPeakNits:peak,sampleCount:963,paddedPixels:61,width:64,height:16,maximumAbsoluteError,maximumBudgetRatio,strictAbsoluteFailures,failedChannels,nonFinite,negative,rangeFailures,alphaFailures,blackFailures,lowBlueFailures,paddingFailures,tolerance:{...GATE},strictAbsoluteGateDiagnosticOnly:true,byFamily,worst};
  if(!passed){const error=Error('ACES2 output: exact-peak963 GPU admission failed: '+JSON.stringify({failedChannels,nonFinite,negative,rangeFailures,alphaFailures,blackFailures,lowBlueFailures,paddingFailures,worst}));error.validation=validation;throw error;}
  return validation;
}

function compileAndValidate(g,entry,source,tables,anchor){
  const saved=captureGL(g,true),r={tables:[],program:null,vao:null,uniforms:null},temporary=[],shaders=[],logs=[];let completed=false;
  try{
    const entryErrors=errorList(g);requireThat(entryErrors.length===0,'prepare requires clean caller GL error state: '+entryErrors.join(','));requireThat(g.getExtension('EXT_color_buffer_float'),'RGBA32F anchor validation requires EXT_color_buffer_float');
    g.bindBuffer(g.PIXEL_PACK_BUFFER,null);g.bindBuffer(g.PIXEL_UNPACK_BUFFER,null);for(const k of Object.keys(saved.pixel))g.pixelStorei(g[k],k==='PACK_ALIGNMENT'||k==='UNPACK_ALIGNMENT'?1:k==='UNPACK_COLORSPACE_CONVERSION_WEBGL'?g.NONE:0);
    const shader=(type,text)=>{const s=g.createShader(type);requireThat(s,'shader allocation failed');shaders.push(s);g.shaderSource(s,text);g.compileShader(s);const log=g.getShaderInfoLog(s);if(log)logs.push({stage:type===g.VERTEX_SHADER?'vertex':'fragment',log});requireThat(g.getShaderParameter(s,g.COMPILE_STATUS),'shader compilation failed: '+log);return s;};
    const vertex=shader(g.VERTEX_SHADER,VERTEX),fragment=shader(g.FRAGMENT_SHADER,buildACES2OutputFragment(source,entry.function));r.program=g.createProgram();requireThat(r.program,'program allocation failed');g.attachShader(r.program,vertex);g.attachShader(r.program,fragment);g.linkProgram(r.program);const programLog=g.getProgramInfoLog(r.program);if(programLog)logs.push({stage:'link',log:programLog});requireThat(g.getProgramParameter(r.program,g.LINK_STATUS),'program link failed: '+programLog);
    r.vao=g.createVertexArray();requireThat(r.vao,'VAO allocation failed');for(let i=0;i<tables.length;i++)r.tables.push(uploadTexture(g,i+1,363,1,tables[i]));
    const location=name=>{const p=g.getUniformLocation(r.program,name);requireThat(p!==null,'required active uniform absent: '+name);return p;};r.uniforms={tInput:location('tInput'),tables:entry.tables.map(t=>location(t.samplerName)),exposure:location('uExposure'),units:location('uNitsToLinear'),encode:location('uEncodeSRGB')};
    const validationWidth=anchor.width??anchor.rows.length,validationHeight=anchor.height??1;
    const input=new Float32Array(anchor.rows.length*4);anchor.rows.forEach((row,i)=>input.set([...row.inputFloat32,1],i*4));const inputTexture=uploadTexture(g,0,validationWidth,validationHeight,input);temporary.push(['texture',inputTexture]);const colour=uploadTexture(g,0,validationWidth,validationHeight,null);temporary.push(['texture',colour]);const framebuffer=g.createFramebuffer();requireThat(framebuffer,'anchor FBO allocation failed');temporary.push(['framebuffer',framebuffer]);g.bindFramebuffer(g.FRAMEBUFFER,framebuffer);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,colour,0);g.drawBuffers([g.COLOR_ATTACHMENT0]);g.readBuffer(g.COLOR_ATTACHMENT0);requireThat(g.checkFramebufferStatus(g.FRAMEBUFFER)===g.FRAMEBUFFER_COMPLETE,'anchor RGBA32F framebuffer incomplete');
    beginDraw(g,r,inputTexture,framebuffer,[0,0,validationWidth,validationHeight],1,1,false);g.drawArrays(g.TRIANGLES,0,3);const output=new Float32Array(input.length);g.readPixels(0,0,validationWidth,validationHeight,g.RGBA,g.FLOAT,output);
    if(anchor.generated){r.validation=Object.freeze({...validateACES2GeneratedReadback(output,anchor,entry.peakNits),actualGPU:true,logs:Object.freeze(logs.map(l=>Object.freeze({...l})))});const errors=errorList(g);requireThat(errors.length===0,'prepare produced GL errors: '+errors.join(','));completed=true;return r;}
    let maxError=0,maxBudgetRatio=0;for(let i=0;i<anchor.rows.length;i++){const row=anchor.rows[i];requireThat(output[i*4+3]===1,'anchor alpha is not exact1');for(let c=0;c<3;c++){const value=output[i*4+c],expected=row.expected[c],error=Math.abs(value-expected),limit=GATE.absolute+GATE.relative*Math.abs(expected);requireThat(Number.isFinite(value)&&value>=0&&value<=entry.peakNits/100+GATE.absolute,'anchor output not finite/in-range');requireThat(error<=limit,'anchor mismatch '+row.id+' channel'+c+': '+error+' > '+limit);if(row.exactBlack)requireThat(value===0,'black anchor is not exact0');maxError=Math.max(maxError,error);maxBudgetRatio=Math.max(maxBudgetRatio,error/limit);}if(row.positiveBlue)requireThat(output[i*4+2]>0&&output[i*4+2]>output[i*4]&&output[i*4+2]>output[i*4+1],'very-low blue anchor lost');}
    const errors=errorList(g);requireThat(errors.length===0,'prepare produced GL errors: '+errors.join(','));r.validation=Object.freeze({passed:true,anchorCount:anchor.rows.length,maximumAbsoluteError:maxError,maximumBudgetRatio:maxBudgetRatio,tolerance:Object.freeze({...GATE}),logs:Object.freeze(logs.map(l=>Object.freeze({...l})))});completed=true;return r;
  }finally{
    for(const s of shaders)g.deleteShader(s);for(const [kind,o]of temporary)kind==='texture'?g.deleteTexture(o):g.deleteFramebuffer(o);if(!completed)destroy(g,r);try{restoreGL(g,saved);requireThat(errorList(g).length===0,'prepare GL-state restoration failed');}catch(error){if(completed)destroy(g,r);throw error;}
  }
}
function validateAnchors(a,peak){requireThat(a?.schema==='glass-atoll.aces2-output-anchors.v1'&&a.peakNits===peak&&same(a.tolerance,GATE)&&Array.isArray(a.rows)&&a.rows.length>=8&&a.rows.length<=32,'anchor schema/count mismatch');let black=0,blue=0;for(const r of a.rows){requireThat(typeof r.id==='string'&&Array.isArray(r.inputFloat32)&&r.inputFloat32.length===3&&r.inputFloat32.every(v=>Number.isFinite(v)&&Math.fround(v)===v)&&Array.isArray(r.expected)&&r.expected.length===3&&r.expected.every(v=>Number.isFinite(v)&&v>=0&&Math.fround(v)===v),'invalid Float32 CPU anchor');if(r.exactBlack){black++;requireThat(r.expected.every(v=>v===0),'invalid exact black oracle');}if(r.positiveBlue){blue++;requireThat(r.expected[2]>0,'invalid low-blue oracle');}}requireThat(black===1&&blue===1,'exact black and low blue sentinels required');return a;}

/**
 * All runtime resources are lazy. Input textures and optional single-colour2D,
 * samples0 targets must already be resident in THIS renderer. The caller can use
 * renderer.initTexture/initRenderTarget before entering this borrowed pass.
 * prepareTarget fetches asynchronously, then performs a short synchronous GL
 * compile+anchor transaction. Latest epoch alone can publish; stale/disposed jobs
 * cannot replace a newer request. Unsupported peaks are reported without fetch.
 */
export function createACES2Output(THREE,renderer,{resourceBase=new URL('./vendor/aces2/',import.meta.url),fetcher=globalThis.fetch}={}){
  requireThat(renderer&&typeof renderer.getContext==='function'&&renderer.properties&&typeof renderer.properties.get==='function','WebGL renderer required');requireThat(typeof fetcher==='function','fetch implementation required');
  const base=new URL(resourceBase,import.meta.url),cache=new Map(),checkedTargets=new WeakMap();let manifestPromise=null,epoch=0,pending=null,disposed=false,lastRender=null;
  let status={requestedPeakNits:null,effectivePeakNits:null,pending:false,supported:null,reason:'not-requested',generation:0,lastError:null},errors=[];
  const context=()=>{const g=renderer.getContext();requireThat(g&&typeof g.createVertexArray==='function'&&!g.isContextLost(),'live WebGL2 context required');return g;};
  const safeDestroy=resource=>{const g=renderer.getContext();if(g&&!g.isContextLost())destroy(g,resource);};
  const recordError=(error,request)=>{const item={epoch:request,message:errorText(error)};errors.push(item);errors=errors.slice(-8);return item.message;};
  async function bytes(entry){assetEntry(entry);const response=await fetcher(new URL(entry.file,base),{cache:'no-store'});requireThat(response.ok,'asset HTTP'+response.status+': '+entry.file);const b=await response.arrayBuffer();requireThat(b.byteLength===entry.bytes&&await digest(b)===entry.sha256,'asset SHA256/length mismatch: '+entry.file);return b;}
  async function manifest(){if(!manifestPromise)manifestPromise=(async()=>{const response=await fetcher(new URL('manifest.json',base),{cache:'no-store'});requireThat(response.ok,'manifest HTTP'+response.status);const b=await response.arrayBuffer();requireThat(await digest(b)===ACES2_VENDOR_PIN.manifestSHA256,'pinned vendor manifest SHA256 mismatch');return validateACES2OutputManifest(JSON.parse(decoder.decode(b)));})().catch(error=>{manifestPromise=null;throw error;});return manifestPromise;}
  async function boundedResponse(response,maximum){
    const declared=response.headers?.get?.('content-length');if(declared!==null&&declared!==undefined){requireThat(/^\d+$/.test(declared)&&Number(declared)<=maximum,'generated response exceeds byte limit');}
    if(!response.body?.getReader){const b=await response.arrayBuffer();requireThat(b.byteLength<=maximum,'generated response exceeds byte limit');return b;}
    const reader=response.body.getReader(),chunks=[];let total=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;requireThat(total<=maximum,'generated response exceeds byte limit');chunks.push(value);}const bytes=new Uint8Array(total);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}return bytes.buffer;}
    catch(error){try{await reader.cancel();}catch{}throw error;}finally{reader.releaseLock();}
  }
  async function generatedFetch(url,options={},maximum=GENERATED_MAX_FILE){
    const response=await fetcher(url,{cache:'no-store',redirect:'error',credentials:'same-origin',mode:'same-origin',...options});
    requireThat(response.redirected!==true&&(!response.url||new URL(response.url).href===url.href),'generated fetch redirect is forbidden');
    const b=await boundedResponse(response,maximum);
    if(!response.ok){let code='HTTP_'+response.status;try{const body=JSON.parse(decoder.decode(b));if(typeof body.error?.code==='string'&&/^[A-Z_]{1,40}$/.test(body.error.code))code=body.error.code;}catch{}const error=Error('ACES2 output: target service '+code);error.aces2Reason='service-'+code.toLowerCase().replaceAll('_','-');throw error;}
    return b;
  }
  async function loadGenerated(peak,request){
    requireThat(base.origin===new URL(import.meta.url).origin,'generated service must share the module origin');
    const serviceURL=new URL('/api/aces2-target',base),raw=await generatedFetch(serviceURL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({peakNits:peak})},512*1024),info=JSON.parse(decoder.decode(raw)),validated=validateACES2GeneratedPackage(info,peak);
    if(disposed||request!==epoch)return null;
    const root=new URL(validated.root,base);requireThat(root.origin===base.origin,'generated package must remain same-origin');
    const fetchAsset=async(name,expectedHash,expectedBytes,maximum=GENERATED_MAX_FILE)=>{flatMember(name);const b=await generatedFetch(new URL(name,root),{},maximum);requireThat((expectedBytes===undefined||b.byteLength===expectedBytes)&&await digest(b)===expectedHash,'generated asset SHA256/length mismatch: '+name);return b;};
    const sealBytes=await fetchAsset('ARTIFACTS.json',info.artifactManifestSHA256,undefined,64*1024),seal=JSON.parse(decoder.decode(sealBytes));
    requireThat(seal?.schema==='glass-atoll.single-peak-aces2-seal.v1'&&seal.peakNits===peak&&seal.actualGPU===false&&Array.isArray(seal.files)&&seal.files.length>=12&&seal.files.length<=32,'generated package inventory mismatch');
    const inventory=new Map();let packageBytes=sealBytes.byteLength;
    for(const row of seal.files){flatMember(row?.file);requireThat(!inventory.has(row.file)&&row.file!=='ARTIFACTS.json'&&row.file!=='ready.json'&&validHash(row.sha256)&&Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=GENERATED_MAX_FILE,'invalid generated inventory member');packageBytes+=row.bytes;requireThat(packageBytes<=GENERATED_MAX_PACKAGE,'generated package exceeds total byte limit');inventory.set(row.file,row);}
    const contents=new Map(await Promise.all(seal.files.map(async row=>[row.file,await fetchAsset(row.file,row.sha256,row.bytes)])));
    const member=(name,hash=null,bytes=null)=>{flatMember(name);const row=inventory.get(name);requireThat(row&&contents.has(name)&&(hash===null||row.sha256===hash)&&(bytes===null||row.bytes===bytes),'generated descriptor/inventory mismatch: '+name);return contents.get(name);};
    const descriptorBytes=member('candidate-export-report.json',info.candidateDescriptorSHA256);requireThat(same(JSON.parse(decoder.decode(descriptorBytes)),info.descriptor),'service/served descriptor mismatch');
    member('source-inputs.json',GENERATED_PINS.input);member('OCIO-LICENSE.txt',GENERATED_PINS.license);
    const markerBytes=await fetchAsset('ready.json',info.readyMarkerSHA256,undefined,64*1024),marker=JSON.parse(decoder.decode(markerBytes));
    for(const key of ['schema','cacheKey','peakNits','artifactManifestSHA256','candidateDescriptorSHA256','exporterSHA256','assetBaseURL','descriptorURL','fixtures','cpuChecks','actualGPU','gpuAdmission','productionIntegrated'])requireThat(same(marker[key],info[key]),'service ready marker mismatch: '+key);
    const t=validated.target,c=validated.descriptor.candidate,p=t.gpuPattern,m=await manifest();requireThat(m.atanHelper.sha256===GENERATED_PINS.prefix,'pinned atan prefix mismatch');const prefixBytes=await bytes(m.atanHelper),prefix=decoder.decode(prefixBytes),source=decoder.decode(member(t.functionFile,t.functionSHA256)),original=decoder.decode(member(c.officialFunctionFile,c.officialFunctionSHA256));
    member(t.probeFragmentFile,t.probeFragmentSHA256);requireThat(source.startsWith(prefix)&&source.split(c.replacement.to).length-1===1&&source.split(c.replacement.from).length-1===0&&source.slice(prefix.length).replace(c.replacement.to,c.replacement.from)===original,'generated candidate does not exactly restore official source');
    const tables=t.textures2D.map(table=>{const rgba=floatData(member(table.rgbaUploadFile,table.rgbaSHA256,5808)),rawTable=floatData(member(table.rawFile,table.rawSHA256,table.rawBytes));requireThat(rgba.every(Number.isFinite)&&rawTable.every(Number.isFinite),'generated table has nonfinite data');for(let i=0;i<363;i++)for(let ch=0;ch<4;ch++){const expected=ch<(table.index===0?1:3)?rawTable[i*(table.index===0?1:3)+ch]:ch===3?1:0;requireThat(rgba[i*4+ch]===expected,'raw/RGBA hue-table upload mismatch');}return rgba;});
    const cpu=JSON.parse(decoder.decode(member(t.cpuOracleFile,info.fixtures.oracle.sha256,info.fixtures.oracle.bytes))),input=floatData(member(p.inputFile,p.inputSHA256,16384)),expected=floatData(member(p.expectedFile,p.expectedSHA256,16384)),anchors=validateACES2GeneratedFixtures(cpu,input,expected,peak,t);
    return{source,tables,anchors,entry:{peakNits:peak,function:t.function,tables:t.textures2D},assetHashes:{descriptor:info.candidateDescriptorSHA256,artifacts:info.artifactManifestSHA256,ready:info.readyMarkerSHA256,function:t.functionSHA256,official:c.officialFunctionSHA256,tables:t.textures2D.map(table=>table.rgbaSHA256),input:p.inputSHA256,expected:p.expectedSHA256,oracle:info.fixtures.oracle.sha256,core:GENERATED_PINS.core,atan:GENERATED_PINS.atan,prefix:GENERATED_PINS.prefix,exporter:GENERATED_PINS.exporter,packageBytes}};
  }

  function prepareTarget({peakNits}={}){
    if(disposed)throw Error('ACES2 output is disposed');const peak=peakValue(peakNits);if(globalThis.ATOLL_STATIC_HOST&&!ACES2_OUTPUT_TARGETS.includes(peak))return Promise.resolve({ready:false,supported:false,reason:'static-host-pinned-targets-only',peakNits:peak});if(pending&&status.pending&&status.requestedPeakNits===peak)return pending.promise;
    const request=++epoch,supported=inPeakRange(peak);status={requestedPeakNits:peak,effectivePeakNits:null,pending:false,supported,reason:supported?'loading':'unsupported-target',generation:request,lastError:null};
    if(!supported)return Promise.resolve({ready:false,supported:false,reason:'unsupported-target',peakNits:peak,generation:request});
    if(cache.has(peak)){status.effectivePeakNits=peak;status.reason='ready';return Promise.resolve({ready:true,supported:true,reason:'ready',peakNits:peak,generation:request,cached:true,validation:cache.get(peak).validation});}
    if(!ACES2_OUTPUT_TARGETS.includes(peak)&&Array.from(cache.values()).filter(r=>r.generated).length>=GENERATED_CACHE_LIMIT){status.reason='cache-full';return Promise.resolve({ready:false,supported:true,reason:'cache-full',peakNits:peak,generation:request});}
    status.pending=true;
    const promise=(async()=>{
      let resource=null;try{
        if(!ACES2_OUTPUT_TARGETS.includes(peak)){
          const loaded=await loadGenerated(peak,request);
          if(disposed||request!==epoch)return{ready:false,supported:true,stale:true,reason:disposed?'disposed':'stale-request',peakNits:peak,generation:request};
          status={...status,reason:'gpu-admission'};
          resource=compileAndValidate(context(),loaded.entry,loaded.source,loaded.tables,loaded.anchors);resource.peakNits=peak;resource.preparedEpoch=request;resource.generated=true;resource.assetHashes=loaded.assetHashes;
          if(disposed||request!==epoch){safeDestroy(resource);resource=null;return{ready:false,supported:true,stale:true,reason:disposed?'disposed':'stale-request',peakNits:peak,generation:request};}
          cache.set(peak,resource);status={...status,pending:false,effectivePeakNits:peak,reason:'ready',lastError:null};return{ready:true,supported:true,reason:'ready',peakNits:peak,generation:request,cached:false,generated:true,validation:resource.validation,assetHashes:{...resource.assetHashes}};
        }
        const m=await manifest(),entry=m.targets.find(e=>e.peakNits===peak);const data=await Promise.all([bytes(entry.functionFile),bytes(entry.originalFile),bytes(m.atanHelper),bytes(entry.anchors),...entry.tables.map(bytes)]);
        if(disposed||request!==epoch)return{ready:false,supported:true,stale:true,reason:disposed?'disposed':'stale-request',peakNits:peak,generation:request};
        const source=decoder.decode(data[0]),original=decoder.decode(data[1]),prefix=decoder.decode(data[2]),inverse=entry.inverse;
        requireThat(source.startsWith(prefix)&&source.split(inverse.to).length-1===1&&source.split(inverse.from).length-1===0,'candidate inverse scope mismatch');requireThat(source.slice(prefix.length).replace(inverse.to,inverse.from)===original,'candidate does not exactly restore official source');
        const a=validateAnchors(JSON.parse(decoder.decode(data[3])),peak),tables=data.slice(4).map(floatData);for(const t of tables)requireThat(t.length===363*4&&t.every(Number.isFinite),'invalid hue-table Float32 payload');
        resource=compileAndValidate(context(),entry,source,tables,a);resource.peakNits=peak;resource.preparedEpoch=request;resource.assetHashes={manifest:ACES2_VENDOR_PIN.manifestSHA256,function:entry.functionFile.sha256,official:entry.originalFile.sha256,tables:entry.tables.map(t=>t.sha256),anchors:entry.anchors.sha256};
        if(disposed||request!==epoch){safeDestroy(resource);resource=null;return{ready:false,supported:true,stale:true,reason:disposed?'disposed':'stale-request',peakNits:peak,generation:request};}
        cache.set(peak,resource);status={...status,pending:false,effectivePeakNits:peak,reason:'ready',lastError:null};return{ready:true,supported:true,reason:'ready',peakNits:peak,generation:request,cached:false,validation:resource.validation};
      }catch(error){if(resource)safeDestroy(resource);if(disposed||request!==epoch)return{ready:false,supported:true,stale:true,reason:disposed?'disposed':'stale-request',peakNits:peak,generation:request};const message=recordError(error,request),reason=error.aces2Reason||'validation-failed';status={...status,pending:false,effectivePeakNits:null,reason,lastError:message};return{ready:false,supported:true,reason,peakNits:peak,generation:request,error:message,...(error.validation?{validation:error.validation}:{})};}
      finally{if(pending?.epoch===request)pending=null;}
    })();pending={epoch:request,promise};return promise;
  }
  function render({input,exposure=1,peakNits,nitsToLinear=1,encodeSRGB=true,target=null,viewport=null}={}){
    if(disposed)throw Error('ACES2 output is disposed');const peak=peakValue(peakNits),resource=cache.get(peak);requireThat(inPeakRange(peak)&&resource,'requested output target is not ready');requireThat(typeof exposure==='number'&&Number.isFinite(exposure)&&exposure>=0&&exposure<=F32MAX,'finite nonnegative Float32 exposure required');requireThat(typeof nitsToLinear==='number'&&Number.isFinite(nitsToLinear)&&Math.fround(nitsToLinear)>0&&nitsToLinear<=F32MAX,'positive Float32 nitsToLinear required');requireThat(typeof encodeSRGB==='boolean','encodeSRGB must be boolean');
    requireThat(input?.isTexture&&!input.isCubeTexture&&!input.isData3DTexture&&!input.isDataArrayTexture&&!input.isDepthTexture,'resident colour2D input texture required');requireThat([THREE.FloatType,THREE.HalfFloatType,THREE.UnsignedByteType].includes(input.type)&&[THREE.RGBAFormat,THREE.RGBFormat].includes(input.format)&&[THREE.NoColorSpace,THREE.LinearSRGBColorSpace].includes(input.colorSpace),'input must be float/normalized scene-linear RGB(A), not encoded/integer data');const inputHandle=renderer.properties.get(input).__webglTexture;requireThat(inputHandle,'input texture must be initialized by this renderer before render');
    let framebuffer=null,width,height,rect;
    if(target!==null){requireThat(target?.isWebGLRenderTarget&&!target.isWebGLCubeRenderTarget&&(target.samples||0)===0&&(target.textures?.length??1)===1&&!target.texture?.isDataArrayTexture&&!target.texture?.isData3DTexture,'only resident single-colour samples0 2D output targets are supported');requireThat([THREE.FloatType,THREE.HalfFloatType,THREE.UnsignedByteType].includes(target.texture.type)&&[THREE.RGBAFormat,THREE.RGBFormat].includes(target.texture.format)&&[THREE.NoColorSpace,THREE.LinearSRGBColorSpace].includes(target.texture.colorSpace)&&target.texture.internalFormat!=='SRGB8_ALPHA8','output target must not add hardware sRGB encoding or integer output conversion');const p=renderer.properties.get(target);framebuffer=Array.isArray(p.__webglFramebuffer)?p.__webglFramebuffer[0]:p.__webglFramebuffer;requireThat(framebuffer&&p.__useDefaultFramebuffer===undefined&&!p.__hasExternalTextures,'target must be initialized and owned by this renderer');for(const t of target.textures||[target.texture])requireThat(renderer.properties.get(t).__webglTexture!==inputHandle,'input/output feedback is forbidden');width=target.width;height=target.height;rect=viewport??target.viewport;
    }else{const g=context();width=g.drawingBufferWidth;height=g.drawingBufferHeight;rect=viewport??[0,0,width,height];}
    const v=Array.isArray(rect)?rect.slice():[rect.x,rect.y,rect.z,rect.w];requireThat(v.length===4&&v.every(Number.isInteger)&&v[0]>=0&&v[1]>=0&&v[2]>0&&v[3]>0&&v[0]+v[2]<=width&&v[1]+v[3]<=height,'viewport must be a bounded physical-pixel rectangle');
    const g=context(),maximumLinear=Math.fround(Math.fround(peak/100)*Math.fround(nitsToLinear));requireThat(Number.isFinite(maximumLinear),'unit conversion can overflow Float32 output');if(target===null){requireThat(g.drawingBufferColorSpace===undefined||g.drawingBufferColorSpace==='srgb','canvas must declare sRGB, not a different output gamut');requireThat(maximumLinear<=1||g.drawingBufferFormat===g.RGBA16F||g.drawingBufferFormat===g.RGBA32F,'extended output needs a verified floating drawing buffer');}else if(target.texture.type===THREE.UnsignedByteType)requireThat(maximumLinear<=1,'extended output cannot be stored in an8bit target');const maximumOutput=encodeSRGB?(maximumLinear<=.0031308?12.92*maximumLinear:1.055*Math.pow(maximumLinear,1/2.4)-.055):maximumLinear;if(target?.texture.type===THREE.HalfFloatType||target===null&&g.drawingBufferFormat===g.RGBA16F)requireThat(maximumOutput<=65504,'unit conversion can overflow Float16 output');
    const saved=captureGL(g),drawBuffers=[];let bound=false;
    try{
      g.bindFramebuffer(g.DRAW_FRAMEBUFFER,framebuffer);bound=true;const count=framebuffer===null?1:g.getParameter(g.MAX_DRAW_BUFFERS);for(let i=0;i<count;i++)drawBuffers.push(g.getParameter(g.DRAW_BUFFER0+i));while(drawBuffers.length>1&&drawBuffers.at(-1)===g.NONE)drawBuffers.pop();g.drawBuffers([framebuffer===null?g.BACK:g.COLOR_ATTACHMENT0]);if(target!==null&&checkedTargets.get(target)!==framebuffer){requireThat(g.checkFramebufferStatus(g.DRAW_FRAMEBUFFER)===g.FRAMEBUFFER_COMPLETE,'output framebuffer incomplete');checkedTargets.set(target,framebuffer);}
      beginDraw(g,resource,inputHandle,framebuffer,v,exposure,nitsToLinear,encodeSRGB);g.drawArrays(g.TRIANGLES,0,3);lastRender={peakNits:peak,preparedEpoch:resource.preparedEpoch,exposure:Math.fround(exposure),nitsToLinear:Math.fround(nitsToLinear),encodeSRGB,viewport:v,framebuffer:target===null?'canvas':'resident2D',variant:ACES2_OUTPUT_VARIANT};return{rendered:true,...lastRender,viewport:[...v]};
    }finally{if(bound)g.drawBuffers(drawBuffers);restoreGL(g,saved);}
  }
  function dispose(){if(disposed)return;disposed=true;++epoch;pending=null;for(const r of cache.values())safeDestroy(r);cache.clear();status={...status,pending:false,effectivePeakNits:null,reason:'disposed',generation:epoch};}
  const diagnostics=()=>({variant:ACES2_OUTPUT_VARIANT,nonOfficialNumericalVariant:true,OCIOVersion:'2.6.0',supportedTargets:[...ACES2_OUTPUT_TARGETS],supportedPeakRange:{...ACES2_OUTPUT_PEAK_RANGE},generatedCacheLimit:GENERATED_CACHE_LIMIT,generatedReadyTargets:Array.from(cache.values()).filter(r=>r.generated).map(r=>r.peakNits),...status,disposed,readyTargets:Array.from(cache.keys()),resources:Array.from(cache.values(),r=>({peakNits:r.peakNits,preparedEpoch:r.preparedEpoch,assetHashes:{...r.assetHashes,tables:[...r.assetHashes.tables]},validation:{...r.validation,logs:r.validation.logs.map(l=>({...l}))}})),lastRender:lastRender?{...lastRender,viewport:[...lastRender.viewport]}:null,errors:errors.map(e=>({...e})),scope:'Output-only optional candidate; exposure/P/C/source policy belongs to caller; no default activation or HDR surface certification.'});
  return{prepareTarget,render,dispose,isReady:peak=>!disposed&&cache.has(peak),diagnostics,get state(){return diagnostics();}};
}
