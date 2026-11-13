// Direction-space catalogue lookup. Data notice is separate from original code:
// assets/night/catalog/LICENSE-SOURCES.txt (authorized personal non-commercial).
export const STAR_ZERO_LUX=2.54e-6,DEFAULT_RAW_PER_LUX=3.6/100000,STELLAR_BACKGROUND_SCALE=2e-7;
export const starFieldGLSL=/* glsl */`
  uniform highp sampler2D uStarLookup,uStarCatalogue,uStarDiffuse;
  uniform float uStarCatalogueReady,uStarPhysicalTime,uStarExposureSeconds,uStarYears,uStarF0,uStarDiffuseScale,uStarTwinkle,uStarViewSupport;
  uniform int uStarTileResolution;
  uniform int uStarDebugIndex;
  vec4 starRecord(highp sampler2D source,int i){ivec2 size=textureSize(source,0);return texelFetch(source,ivec2(i%size.x,i/size.x),0);}
  int stellarCubeCell(vec3 ray){
    vec3 a=abs(ray);vec2 uv=vec2(0.);int face=0;
    if(a.x>=a.y&&a.x>=a.z){if(ray.x>=0.){face=0;uv=vec2(-ray.z,ray.y)/a.x;}else{face=1;uv=vec2(ray.z,ray.y)/a.x;}}
    else if(a.y>=a.z){if(ray.y>=0.){face=2;uv=vec2(ray.x,-ray.z)/a.y;}else{face=3;uv=vec2(ray.x,ray.z)/a.y;}}
    else{if(ray.z>=0.){face=4;uv=vec2(ray.x,ray.y)/a.z;}else{face=5;uv=vec2(-ray.x,ray.y)/a.z;}}
    ivec2 q=clamp(ivec2(floor((uv*.5+.5)*float(uStarTileResolution))),ivec2(0),ivec2(uStarTileResolution-1));
    return (face*uStarTileResolution+q.y)*uStarTileResolution+q.x;
  }
  float stellarErf(float x){float a=abs(x),t=1.0/(1.0+.3275911*a);float p=((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592;return sign(x)*(1.0-p*t*exp(-a*a));}
  float stellarPixelIntegral(float x){const float k=2.0203050891044216;return .5*(stellarErf((x+.5)*k)-stellarErf((x-.5)*k));}
  float stellarSinc(float x){return abs(x)<.0001?1.-x*x/6.:sin(x)/x;}
  float stellarScintillation(float phase,float altitude){
    float a=1.+(1.-smoothstep(.05,.9,altitude)),T=uStarExposureSeconds;
    float value=.025*stellarSinc(3.14159265*.625*T)*sin(6.28318530718*.625*uStarPhysicalTime+phase)
      +.027*stellarSinc(3.14159265*1.875*T)*sin(6.28318530718*1.875*uStarPhysicalTime+phase*2.713)
      +.022*stellarSinc(3.14159265*5.25*T)*sin(6.28318530718*5.25*uStarPhysicalTime+phase*4.137);
    return 1.+value*a*uStarTwinkle;
  }
  vec3 catalogueStellarRadiancePrepared(vec3 eq,vec2 uv,vec2 uvDx,vec2 uvDy,vec3 eqDx,vec3 eqDy,float altitude,float skyVisible){
    // The caller prepares screen derivatives before any varying visibility
    // branch. This kernel has only explicit-gradient or integer texture reads.
    vec3 dx=eqDx,dy=eqDy;float aa=dot(dx,dx),bb=dot(dx,dy),cc=dot(dy,dy),det=max(aa*cc-bb*bb,1e-24);
    float major=.5*(aa+cc+sqrt((aa-cc)*(aa-cc)+4.*bb*bb));
    float omega=max(length(cross(dx,dy)),1e-12),support=2.5*sqrt(major);
    vec3 result=textureGrad(uStarDiffuse,vec2(uv.x,1.-uv.y),vec2(uvDx.x,-uvDx.y),vec2(uvDy.x,-uvDy.y)).rgb*uStarDiffuseScale;
    vec4 header=starRecord(uStarLookup,stellarCubeCell(eq));int start=int(header.x+.5),count=skyVisible>0.0?int(header.y+.5):0;
    for(int i=0;i<256;i++){
      if(i>=count)break;
      int index=int(starRecord(uStarLookup,start+i).x+.5);if(uStarDebugIndex>=0&&index!=uStarDebugIndex)continue;
      vec4 base=starRecord(uStarCatalogue,index*3);
      float expanded=support+base.w*abs(uStarYears);
      vec3 baseDelta=base.xyz-eq;if(dot(baseDelta,baseDelta)>expanded*expanded*1.001)continue;
      vec4 motion=starRecord(uStarCatalogue,index*3+1);vec3 direction=normalize(base.xyz+motion.xyz*uStarYears);
      vec3 delta=direction-eq;if(dot(delta,delta)>support*support*1.001)continue;
      float x=dot(delta,dx),y=dot(delta,dy);
      vec2 pixel=vec2(cc*x-bb*y,aa*y-bb*x)/det;
      // Sigma=.35pixel, with a conservative2.5pixel angular support. The width is
      // independent of magnitude. Wide scene PSF/DOF is applied later once.
      float coverage=stellarPixelIntegral(pixel.x)*stellarPixelIntegral(pixel.y);
      vec4 colour=starRecord(uStarCatalogue,index*3+2);
      result+=colour.rgb*(uStarF0*exp2(-1.328771237954945*motion.w))*coverage/omega*stellarScintillation(colour.w,altitude);
    }
    return result*uStarCatalogueReady;
  }
  // Compatibility entry point for existing standalone PSF/GPU fixtures.
  vec3 catalogueStellarRadiance(vec3 eq,vec2 uv,vec2 uvDx,vec2 uvDy,float altitude){
    vec3 dx=dFdx(eq),dy=dFdy(eq);
    return catalogueStellarRadiancePrepared(eq,uv,uvDx,uvDy,dx,dy,altitude,1.);
  }
`;

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function createStarField(THREE,{enabled=true}={}){
  const zero=new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType);zero.needsUpdate=true;
  const uniforms={uStarDebugIndex:{value:-1},uStarLookup:{value:zero},uStarCatalogue:{value:zero},uStarDiffuse:{value:zero},uStarCatalogueReady:{value:0},uStarPhysicalTime:{value:0},uStarExposureSeconds:{value:1/120},uStarYears:{value:26.82},uStarF0:{value:STAR_ZERO_LUX*DEFAULT_RAW_PER_LUX},uStarDiffuseScale:{value:STELLAR_BACKGROUND_SCALE},uStarTwinkle:{value:1},uStarViewSupport:{value:.18*Math.PI/180},uStarTileResolution:{value:128}};
  let manifest=null,disposed=false,error=null,currentView={width:1440,height:900,minimumPixelOmega:1e-8,table:'native'},textures=[],currentRawPerLux=DEFAULT_RAW_PER_LUX,currentGain=1;
  const base=new URL('./assets/night/catalog/',import.meta.url);
  function floatTexture(buffer,width,height){const values=new Float32Array(width*height*4);values.set(new Float32Array(buffer));const t=new THREE.DataTexture(values,width,height,THREE.RGBAFormat,THREE.FloatType);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;textures.push(t);return t;}
  const tables=new Map(),browser=enabled&&typeof document!=='undefined';
  // The small manifest carries the photometry used by exposure bounds and the
  // sky irradiance mean, so it loads at once. The binary catalogue (points,
  // lookup tables, diffuse aggregate) loads only when load() or ready asks.
  const manifestReady=!browser?Promise.resolve(null):fetch(new URL('manifest.json',base)).then(r=>{if(!r.ok)throw new Error('Star manifest HTTP '+r.status);return r.json();}).then(m=>{
    manifest=m;if(m.tables.some(t=>t.maximumCandidates>256))throw new Error('Catalogue tile exceeds validated256 candidate loop; cannot drop stars');
    return m;
  }).catch(e=>{error=String(e);throw e;});manifestReady.catch(()=>{});
  let ready=null;
  function load(){
    if(ready)return ready;
    ready=!browser?Promise.resolve({loaded:false,reason:'CPU-only or disabled'}):disposed?Promise.resolve({loaded:false,disposed:true}):manifestReady.then(loadCatalogue).catch(e=>{error=String(e);throw e;});
    ready.catch(()=>{});return ready;
  }
  async function loadCatalogue(m){
    if(disposed)return {loaded:false,disposed:true};
    const fetchBin=async name=>{
      // Lossless transfer packs (.pk2): gzip of byte planes, plus dropping the RGBA16F diffuse
      // alpha that is always 1.0. Decoding restores the identical catalogue bytes.
      if(typeof DecompressionStream==='function'){
        try{
          const r=await fetch(new URL(name+'.pk2',base));
          if(r.ok){
            const packed=new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
            const view=new DataView(packed.buffer),width=view.getUint8(0),alphaOne=view.getUint8(1)===1,original=view.getUint32(2,true);
            const body=packed.subarray(6),count=body.length/width;
            if(!Number.isInteger(count)||(alphaOne?count*width/6*8:count*width)!==original)throw new Error('pack size');
            const values=new Uint8Array(body.length);
            for(let plane=0;plane<width;plane++){const src=body.subarray(plane*count,(plane+1)*count);for(let i=0,o=plane;i<count;i++,o+=width)values[o]=src[i];}
            if(!alphaOne)return values.buffer;
            const out=new Uint8Array(original);
            for(let r=0,v=0,o=0;o<original;r++,v+=6,o+=8){out[o]=values[v];out[o+1]=values[v+1];out[o+2]=values[v+2];out[o+3]=values[v+3];out[o+4]=values[v+4];out[o+5]=values[v+5];out[o+7]=0x3c;}
            return out.buffer;
          }
        }catch{
          // A failed transfer, unsupported codec or corrupt optional pack must
          // not prevent the intact original catalogue from loading.
        }
      }
      const r=await fetch(new URL(name,base));if(!r.ok)throw new Error(name+' HTTP '+r.status);return r.arrayBuffer();
    };
    const [records,diffuse,...lookups]=await Promise.all([fetchBin('stars-float32.bin'),fetchBin('diffuse-rgba16f.bin'),...m.tables.map(t=>fetchBin(`lookup-${t.name}-float32.bin`))]);
    if(disposed)return {loaded:false,disposed:true};
    uniforms.uStarCatalogue.value=floatTexture(records,m.pointTextureWidth,m.pointTextureHeight);
    m.tables.forEach((t,i)=>tables.set(t.name,{...t,texture:floatTexture(lookups[i],t.width,t.height)}));
    const levels=m.diffuseLevels.map(l=>({width:l.width,height:l.height,data:new Uint16Array(diffuse,l.offsetBytes,l.bytes/2)}));
    const texture=new THREE.DataTexture(levels[0].data,levels[0].width,levels[0].height,THREE.RGBAFormat,THREE.HalfFloatType);
    texture.mipmaps=levels;texture.generateMipmaps=false;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;texture.flipY=false;texture.needsUpdate=true;textures.push(texture);
    uniforms.uStarDiffuse.value=texture;uniforms.uStarLookup.value=tables.get('native').texture;uniforms.uStarCatalogueReady.value=1;
    return diagnostics();
  }
  function update({time=0,epochJulianYear=2026.82,starIntensity=currentGain,rawPerLux=currentRawPerLux,exposureSeconds=uniforms.uStarExposureSeconds.value,twinkle=1}={}){
    currentRawPerLux=rawPerLux;currentGain=starIntensity;
    uniforms.uStarPhysicalTime.value=((time%4096)+4096)%4096;uniforms.uStarYears.value=clamp(epochJulianYear,1800,2200)-2000;
    uniforms.uStarF0.value=STAR_ZERO_LUX*Math.max(0,rawPerLux)*starIntensity;uniforms.uStarDiffuseScale.value=STELLAR_BACKGROUND_SCALE*(rawPerLux/DEFAULT_RAW_PER_LUX)*starIntensity;
    uniforms.uStarExposureSeconds.value=clamp(exposureSeconds,1/10000,30);uniforms.uStarTwinkle.value=clamp(twinkle,0,1);
  }
  function prepareView(camera,{width=1440,height=900,frame={},optics={}}={}){
    const p=camera?.projectionMatrix?.elements,px=p?2/Math.abs(p[0])/width:36/(optics.focalMm??35)/width,py=p?2/Math.abs(p[5])/height:px;
    const required=2.5*Math.max(px,py)*1.25*180/Math.PI;
    const table=manifest?.tables.find(t=>t.supportDegrees>=required)??manifest?.tables.at(-1);
    if(table&&required>table.supportDegrees+1e-6)throw new Error(`Star footprint ${required.toFixed(3)}deg exceeds conservative${table.supportDegrees}deg table`);
    if(table&&tables.has(table.name)){uniforms.uStarLookup.value=tables.get(table.name).texture;uniforms.uStarViewSupport.value=table.supportDegrees*Math.PI/180;}
    const cornerFactor=p?Math.pow(1+1/(p[0]*p[0])+1/(p[5]*p[5]),1.5):2;
    currentView={width,height,requiredSupportDegrees:required,table:table?.name??'native',minimumPixelOmega:px*py/cornerFactor*.4};
    if(Number.isFinite(frame.starIntensity))currentGain=frame.starIntensity;
    if(Number.isFinite(frame.rawPerCandela)){currentRawPerLux=frame.rawPerCandela;uniforms.uStarF0.value=STAR_ZERO_LUX*currentRawPerLux*currentGain;uniforms.uStarDiffuseScale.value=STELLAR_BACKGROUND_SCALE*(currentRawPerLux/DEFAULT_RAW_PER_LUX)*currentGain;}
    if(Number.isFinite(optics.shutterSeconds))uniforms.uStarExposureSeconds.value=clamp(optics.shutterSeconds,1/10000,30);
    return {...currentView,drawCalls:0};
  }
  function getRadianceBound(){const t=manifest?.tables.find(t=>t.name===currentView.table),point=(t?.maximumBucketFluxChannelUnitF0??6)*uniforms.uStarF0.value/Math.max(1e-12,currentView.minimumPixelOmega)*1.15,diffuse=65504*uniforms.uStarDiffuseScale.value;return {maxRGB:point+diffuse,components:{point,diffuse},limits:['Conservative sum of candidate flux channels divided by minimum prepared pixel solid angle','FP16 diffuse uses finite representable bound; actual texture maximum is usually much lower','View footprint must stay within the selected conservative tile support']};}
  function meanPhysicalRGB(){if(!manifest)return null;return manifest.masterRGBFluxUnitF0.map(v=>v*uniforms.uStarF0.value/(4*Math.PI));}
  function diagnostics(){return {model:'HIP/Tycho magnitude8.5 direction-cube candidates plus area-conserving diffuse, weak shutter-averaged scintillation',loaded:uniforms.uStarCatalogueReady.value===1,error,pointCount:manifest?.pointCount??0,pointLimit:manifest?.pointLimitMagnitude,tables:manifest?.tables.map(({texture,...t})=>t),view:{...currentView},epochYears:uniforms.uStarYears.value,exposureSeconds:uniforms.uStarExposureSeconds.value,physicalF0:uniforms.uStarF0.value,license:manifest?.license,limits:manifest?.limits??[]};}
  return {uniforms,manifestReady,load,get ready(){return load();},update,prepareView,getRadianceBound,meanPhysicalRGB,diagnostics,captureSnapshot:()=>({view:{...currentView},rawPerLux:currentRawPerLux,gain:currentGain}),withSnapshot(snapshot,fn){const saved={view:currentView,raw:currentRawPerLux,gain:currentGain};try{if(snapshot){currentView={...snapshot.view};currentRawPerLux=snapshot.rawPerLux;currentGain=snapshot.gain;}return fn();}finally{currentView=saved.view;currentRawPerLux=saved.raw;currentGain=saved.gain;}},get manifest(){return manifest;},dispose(){disposed=true;zero.dispose();textures.forEach(t=>t.dispose());}};
}
