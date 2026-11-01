import {LOCAL_LIGHT_COUNT} from './local-lights.js';
/* Finite diffuse interreflection, not another ambient light.
 * Disk radiosity: https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-14-dynamic-ambient-occlusion-and
 * Lambertian units: https://www.pbr-book.org/4ed/Reflection_Models/Diffuse_Reflection
 * B is diffuse exitance (rho * incident irradiance), never radiance.
 * Static transport is visibility-filtered, reciprocal and substochastic.
 */
const PI=Math.PI,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const length=a=>Math.hypot(...a);
const normalize=a=>{const l=length(a);return l>1e-12?a.map(v=>v/l):[0,1,0];};
const vec=a=>Array.isArray(a)||ArrayBuffer.isView(a)?Array.from(a):a?.toArray?.()||[0,1,0];
const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
const srgb=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
export const INDIRECT_PROBE_COUNT=18;
export const INDIRECT_UNIFORM_VECTORS=61;

// A symmetric exchange area C makes A_i F_ij = A_j F_ji. Scale pairs,
// not rows independently: that retains reciprocity and bounds every row.
export function buildDiffuseTransfer(surfels,visibility=()=>1){
  const n=surfels.length,exchange=new Float64Array(n*n),rows=new Float64Array(n);
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    const a=surfels[i],b=surfels[j],d=sub(b.position,a.position),d2=dot(d,d);
    if(d2<.04)continue;
    const w=d.map(v=>v/Math.sqrt(d2)),ca=Math.max(0,dot(a.normal,w)),cb=Math.max(0,-dot(b.normal,w));
    if(ca*cb===0)continue;
    const v=clamp(visibility(a.position,b.position));
    const c=a.area*b.area*ca*cb*v/(PI*d2+Math.max(a.area,b.area));
    exchange[i*n+j]=exchange[j*n+i]=c;rows[i]+=c/a.area;rows[j]+=c/b.area;
  }
  const matrix=new Float64Array(n*n),boundedRows=new Float64Array(n);let reciprocityError=0;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    const c=exchange[i*n+j]/Math.max(1,rows[i],rows[j]);
    matrix[i*n+j]=c/surfels[i].area;matrix[j*n+i]=c/surfels[j].area;
    boundedRows[i]+=matrix[i*n+j];boundedRows[j]+=matrix[j*n+i];
    reciprocityError=Math.max(reciprocityError,Math.abs(surfels[i].area*matrix[i*n+j]-surfels[j].area*matrix[j*n+i]));
  }
  return {matrix,rows:boundedRows,maximumRow:Math.max(0,...boundedRows),reciprocityError};
}

export function solveDiffuseBounces(surfels,transfer,incident,bounces=1){
  const n=surfels.length,direct=new Float64Array(n*3),second=new Float64Array(n*3),total=new Float64Array(n*3);
  for(let i=0;i<n;i++)for(let c=0;c<3;c++)direct[i*3+c]=clamp(surfels[i].albedo[c],0,.95)*Math.max(0,incident[i*3+c]);
  if(bounces>=2)for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const f=transfer[i*n+j];if(f===0)continue;
    for(let c=0;c<3;c++)second[i*3+c]+=clamp(surfels[i].albedo[c],0,.95)*f*direct[j*3+c];
  }
  for(let k=0;k<total.length;k++)total[k]=direct[k]+second[k];
  const power=a=>[0,1,2].map(c=>surfels.reduce((sum,s,i)=>sum+s.area*a[i*3+c],0));
  return {direct,second,total,directPower:power(direct),secondPower:power(second)};
}

// Irradiance SH1: [constant, nx, ny, nz], RGB stored separately. The clipped
// first-order cosine kernel overintegrates by 9/8, so 8/9 restores an upper
// bound on its spherical integral. It is low-frequency, not a sharp area light.
export function projectDiffuseProbe(point,surfels,exitance,visibility=()=>1){
  const result=new Float64Array(12),correction=8/9;
  for(let j=0;j<surfels.length;j++){
    const s=surfels[j],d=sub(s.position,point),d2=dot(d,d);if(d2<.01)continue;
    const w=d.map(v=>v/Math.sqrt(d2)),ce=Math.max(0,-dot(s.normal,w));if(ce<=0)continue;
    const weight=s.area*ce*clamp(visibility(point,s.position))/(PI*d2+s.area);
    const basis=[.25,.5*w[0],.5*w[1],.5*w[2]];
    for(let c=0;c<3;c++)for(let k=0;k<4;k++)result[c*4+k]+=exitance[j*3+c]*weight*basis[k]*correction;
  }
  return result;
}

// Raw local-source adapter; never reads the stored/P-scaled light uniforms.
function transientSource(record,index){
  const finite=(x,label)=>{if(!Number.isFinite(x))throw new RangeError('Transient GI '+label+' must be finite');return x;},array=(value,label)=>{if(value==null)throw new TypeError('Transient GI '+label+' required');const a=vec(value);if(a.length!==3)throw new TypeError('Transient GI '+label+' needs3 components');return a.map(v=>finite(v,label));};
  if(!record)throw new TypeError('Transient GI needs a raw local source record');
  const position=array(record.position,'position'),rawRGB=array(record.rawRGB,'rawRGB'),radius=finite(record.radius,'radius'),range=finite(record.range,'range'),spot=!!record.light?.isSpotLight;
  if(rawRGB.some(v=>v<0)||!(radius>0)||!(range>0))throw new RangeError('Transient GI requires nonnegative raw RGB and positive radius/range');
  let direction=[0,0,0],cosOuter=-1,cosInner=1;
  if(spot){direction=array(record.direction,'spot direction');const norm=length(direction),angle=finite(record.light.angle,'spot angle'),penumbra=finite(record.light.penumbra,'spot penumbra');if(!(norm>0)||angle<=0||angle>=PI/2||penumbra<=0||penumbra>1)throw new RangeError('Transient GI spot needs a nonzero axis and valid continuous cone');direction=direction.map(v=>v/norm);cosOuter=Math.cos(angle);cosInner=Math.cos(angle*(1-penumbra));}
  return {position,rawRGB,radius,range,spot,direction,cosOuter,cosInner,ground:index<3,key:[...position,radius,range,spot?1:0,...direction,cosOuter,cosInner,index<3?1:0].join(',')};
}

/** Unit raw RGB source -> one diffuse exitance -> existing probe weights.
 * Optional output/scratch buffers make moving-source recomputations bounded.
 * ground surfacePosition is the physical terrain surface, while position is
 * retained unchanged as the original visibility/transport proxy anchor.
 */
export function transientDiffuseResponse(surfels,probeWeights,source,visibility=()=>1,{out=new Float64Array(probeWeights.length*12),scratch=new Float64Array(surfels.length*3)}={}){
  if(out.length!==probeWeights.length*12||scratch.length!==surfels.length*3)throw new RangeError('Transient GI scratch/response dimensions do not match transport');
  out.fill(0);scratch.fill(0);let visibilityQueries=0,incidentPower=0,minimumReceiverDistance=Infinity,maxUnscaledPatchIncident=0;const reflectedPower=[0,0,0];
  for(let j=0;j<surfels.length;j++){
    const s=surfels[j],p=s.surfacePosition||s.position,dx=source.position[0]-p[0],dy=source.position[1]-p[1],dz=source.position[2]-p[2],d2=dx*dx+dy*dy+dz*dz,distance=Math.sqrt(Math.max(d2,1e-10)),cos=Math.max(0,(s.normal[0]*dx+s.normal[1]*dy+s.normal[2]*dz)/distance);minimumReceiverDistance=Math.min(minimumReceiverDistance,distance);if(cos===0)continue;
    let denominator=Math.max(d2,source.radius*source.radius);if(source.ground)denominator=Math.max(denominator,.01);
    const cutDistance=source.ground?Math.sqrt(d2):Math.sqrt(denominator),cut=Math.max(0,1-(cutDistance/Math.max(source.range,.01))**4);if(cut===0)continue;
    let cone=1;if(source.spot){const mu=-(dx*source.direction[0]+dy*source.direction[1]+dz*source.direction[2])/distance,t=clamp((mu-source.cosOuter)/(source.cosInner-source.cosOuter));cone=t*t*(3-2*t);}if(cone===0)continue;
    const anchor=s.position.map((v,c)=>v+s.normal[c]*.04),v=clamp(visibility(anchor,source.position));visibilityQueries++;if(!Number.isFinite(v))throw new RangeError('Transient GI visibility must be finite');
    const E=cos*cut*cut*cone*v/denominator;incidentPower+=s.area*E;maxUnscaledPatchIncident=Math.max(maxUnscaledPatchIncident,s.area*E);
    for(let c=0;c<3;c++){const B=clamp(s.albedo[c],0,.95)*E;scratch[j*3+c]=B;reflectedPower[c]+=s.area*B;}
  }
  // Coarse representative patches can sample more flux than a point source
  // emits when close to one patch. Cap UNIT capture, never source intensity.
  // Integral of the shared smoothstep spot cone is analytic in cos(theta).
  const unscaledIncidentPower=incidentPower,sourceSolidAngle=source.spot?2*PI*(1-(source.cosOuter+source.cosInner)*.5):4*PI;
  if(!Number.isFinite(incidentPower)||!reflectedPower.every(Number.isFinite))throw new RangeError('Transient GI unit capture exceeds numeric domain');
  const safetyScale=incidentPower>sourceSolidAngle?sourceSolidAngle/incidentPower:1;
  if(safetyScale<1){for(let i=0;i<scratch.length;i++)scratch[i]*=safetyScale;incidentPower*=safetyScale;for(let c=0;c<3;c++)reflectedPower[c]*=safetyScale;}
  for(let p=0;p<probeWeights.length;p++){const weights=probeWeights[p];for(let j=0;j<surfels.length;j++){const r=scratch[j*3],g=scratch[j*3+1],b=scratch[j*3+2];for(let k=0;k<4;k++){const w=weights[j*4+k];out[p*12+k]+=r*w;out[p*12+4+k]+=g*w;out[p*12+8+k]+=b*w;}}}
  // Per-source/channel nonnegative SH cone; preserve a0 (normal-sphere Y00).
  for(let i=0;i<out.length;i+=4){const norm=Math.hypot(out[i+1],out[i+2],out[i+3]),scale=norm>out[i]?out[i]/norm:1;out[i+1]*=scale;out[i+2]*=scale;out[i+3]*=scale;}
  return {coefficients:out,incidentPower,reflectedPower,visibilityQueries,unscaledIncidentPower,sourceSolidAngle,safetyScale,minimumReceiverDistance,maxUnscaledPatchIncident};
}

export const indirectLightingGLSL=/* glsl */`
  uniform vec4 uGIProbeR[18],uGIProbeG[18],uGIProbeB[18];
  uniform vec4 uGIBounds;
  uniform vec3 uGIBase0,uGIBase1,uGIBase2;
  uniform float uGITop,uGIEnabled,uGIReady,uGIExposureScale;
  float giBaseHeight(int id){
    if(id==0)return uGIBase0.x;
    if(id==1)return uGIBase0.y;
    if(id==2)return uGIBase0.z;
    if(id==3)return uGIBase1.x;
    if(id==4)return uGIBase1.y;
    if(id==5)return uGIBase1.z;
    if(id==6)return uGIBase2.x;
    if(id==7)return uGIBase2.y;
    if(id==8)return uGIBase2.z;
    return 0.;
  }
  vec3 giAtProbe(int id,vec3 n){
    vec4 b=vec4(1.,n);
    return vec3(dot(uGIProbeR[id],b),dot(uGIProbeG[id],b),dot(uGIProbeB[id],b));
  }
  vec3 getIndirectIrradiance(vec3 p,vec3 worldNormal){
    if(uGIEnabled*uGIReady<.5)return vec3(0.);
    vec2 uv=(p.xz-uGIBounds.xy)/uGIBounds.zw;
    vec2 outside=max(-uv,uv-1.);
    float edge=1.-smoothstep(0.,.18,max(outside.x,outside.y));
    if(edge<=0.)return vec3(0.);
    vec2 q=clamp(uv,vec2(0.),vec2(.999999))*2.;
    ivec2 cell=ivec2(floor(q));vec2 f=fract(q);
    vec3 n=worldNormal*inversesqrt(max(dot(worldNormal,worldNormal),1.e-10));
    vec3 e=vec3(0.);
    for(int corner=0;corner<4;corner++){
      int x=corner-2*(corner/2),z=corner/2;
      int id=(cell.y+z)*3+cell.x+x;
      float weight=(x==0?1.-f.x:f.x)*(z==0?1.-f.y:f.y);
      float y=clamp((p.y-giBaseHeight(id))/max(.1,uGITop-giBaseHeight(id)),0.,1.);
      e+=weight*mix(giAtProbe(id,n),giAtProbe(id+9,n),y);
    }
    return max(e,vec3(0.))*edge*uGIExposureScale;
  }
`;

function sampledTextureMean(texture){
  const data=texture?.image?.data;if(!data)return [1,1,1];
  const total=Math.floor(data.length/4),stride=Math.max(1,Math.floor(total/4096)),sum=[0,0,0];let count=0;
  for(let i=0;i<total;i+=stride){for(let c=0;c<3;c++){const v=data[i*4+c]/255;sum[c]+=texture.colorSpace==='srgb'?srgb(v):v;}count++;}
  return sum.map(v=>v/count);
}

// One-time area integration of real rest triangles. Bins preserve summed area,
// average albedo and face orientation. No generated leaf geometry is changed.
async function sampleGrove(grove,maxPatches=64,cancelled=()=>false){
  const bins=new Map(),volumes=new Map();let triangles=0,stamp=performance.now();
  grove?.updateMatrixWorld?.(true);
  for(const mesh of grove?.children||[]){
    if(!mesh.isMesh||!mesh.geometry?.index)continue;
    const g=mesh.geometry,p=g.attributes.position,c=g.attributes.color,root=g.attributes.aTreeRoot,index=g.index.array;
    const leaf=/pinnae|coastal leaves/i.test(mesh.name),mean=sampledTextureMean(mesh.material.map),base=mesh.material.color?.toArray?.()||[1,1,1];
    const optics=grove?.userData?.leafOptics,maps=grove?.userData?.proceduralTextures?.[/pinnae/i.test(mesh.name)?'palm':'coastalLeaf'];
    const thin=leaf?sampledTextureMean(maps?.thickness)[0]:0,baseThickness=(/pinnae/i.test(mesh.name)?optics?.palmThicknessMetres:optics?.coastalThicknessMetres)?.value||.00024;
    const tissue=baseThickness*(2.2+( .65-2.2)*thin),absorption=vec(optics?.absorptionPerMetre?.value||[6500,2500,10000]),budget=optics?.transmissionBudget?.value??.24;
    const reserve=[0,1,2].map(c=>leaf?1-clamp(budget,0,.45)*Math.exp(-Math.max(0,absorption[c])*tissue):1);
    const m=mesh.matrixWorld?.elements||[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
    const point=i=>{const x=p.getX(i),y=p.getY(i),z=p.getZ(i);return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];};
    for(let k=0;k<index.length;k+=3){
      const ia=index[k],ib=index[k+1],ic=index[k+2],a=point(ia),b=point(ib),d=point(ic),u=sub(b,a),v=sub(d,a);
      const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=length(cross),area=len*.5;
      if(area<=1e-10)continue;
      const n=cross.map(t=>t/len),center=a.map((t,j)=>(t+b[j]+d[j])/3),colour=mean.map((t,j)=>clamp(t*base[j]*(c?(c.array[ia*3+j]+c.array[ib*3+j]+c.array[ic*3+j])/3:1)*.96*reserve[j],0,.95));
      const axis=Math.abs(n[0])>Math.abs(n[1])?(Math.abs(n[0])>Math.abs(n[2])?0:2):(Math.abs(n[1])>Math.abs(n[2])?1:2);
      const key=[leaf?1:0,Math.floor(center[0]/5),Math.floor(center[1]/3),Math.floor(center[2]/5),axis,n[axis]>=0?1:0].join(',');
      let bin=bins.get(key);if(!bin){bin={position:[0,0,0],normal:[0,0,0],albedo:[0,0,0],area:0,twoSided:leaf};bins.set(key,bin);}
      for(let j=0;j<3;j++){bin.position[j]+=center[j]*area;bin.normal[j]+=n[j]*area;bin.albedo[j]+=colour[j]*area;}bin.area+=area;
      if(leaf&&root){
        const id=[root.getX(ia),root.getY(ia),root.getZ(ia)].join(',');let vol=volumes.get(id);
        if(!vol){vol={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],area:0};volumes.set(id,vol);}
        for(let j=0;j<3;j++){vol.min[j]=Math.min(vol.min[j],a[j],b[j],d[j]);vol.max[j]=Math.max(vol.max[j],a[j],b[j],d[j]);}vol.area+=area;
      }
      triangles++;
      if(k%3000===0&&performance.now()-stamp>5){await yieldFrame();if(cancelled())return {patches:[],volumes:[],triangles};stamp=performance.now();}
    }
  }
  let patches=Array.from(bins.values()).map(b=>({position:b.position.map(v=>v/b.area),normal:normalize(b.normal),albedo:b.albedo.map(v=>v/b.area),area:b.area,twoSided:b.twoSided})).sort((a,b)=>b.area-a.area);
  const keep=patches.slice(0,maxPatches);
  for(const tail of patches.slice(maxPatches)){
    let best=keep[0],score=Infinity;
    for(const target of keep){const d=sub(target.position,tail.position),s=dot(d,d)+36*(1-dot(target.normal,tail.normal));if(s<score){score=s;best=target;}}
    if(!best)continue;const total=best.area+tail.area;
    for(let c=0;c<3;c++){best.position[c]=(best.position[c]*best.area+tail.position[c]*tail.area)/total;best.normal[c]=best.normal[c]*best.area+tail.normal[c]*tail.area;best.albedo[c]=(best.albedo[c]*best.area+tail.albedo[c]*tail.area)/total;}
    best.normal=normalize(best.normal);best.area=total;
  }
  patches=[];
  for(const p of keep){patches.push(p);if(p.twoSided)patches.push({...p,normal:p.normal.map(x=>-x),position:p.position.slice(),albedo:p.albedo.slice()});}
  const occluders=Array.from(volumes.values()).map(v=>{
    const center=v.min.map((x,i)=>(x+v.max[i])*.5),radius=v.min.map((x,i)=>Math.max(.25,(v.max[i]-x)*.5));
    const volume=4/3*PI*radius[0]*radius[1]*radius[2];
    return {center,radius,leafArea:v.area,extinction:.5*v.area/volume};
  });
  return {patches,volumes:occluders,triangles};
}

function createVisibility(terrainHeight,volumes,bounds){
  const size=97,margin=8,minX=bounds[0]-margin,minZ=bounds[1]-margin,width=bounds[2]+margin*2,depth=bounds[3]+margin*2,height=new Float32Array(size*size);
  for(let z=0;z<size;z++)for(let x=0;x<size;x++)height[z*size+x]=terrainHeight(minX+x/(size-1)*width,minZ+z/(size-1)*depth);
  // Bilinear interpolation is bounded by its four stored grid samples. The
  // out-of-grid fallback is -100; include it and a roundoff guard in the bound.
  // A rising ray above this ceiling can no longer hit the sampled terrain.
  let maximumHeight=-100,maximumMagnitude=100;
  for(const value of height){maximumHeight=Math.max(maximumHeight,value);maximumMagnitude=Math.max(maximumMagnitude,Math.abs(value));}
  const terrainCeiling=maximumHeight+.025+64*Number.EPSILON*Math.max(1,maximumMagnitude,Math.abs(maximumHeight+.025));
  function h(x,z){
    const u=(x-minX)/width*(size-1),v=(z-minZ)/depth*(size-1);if(u<0||v<0||u>size-1||v>size-1)return -100;
    const i=Math.min(size-2,Math.floor(u)),j=Math.min(size-2,Math.floor(v)),a=u-i,b=v-j;
    return (height[j*size+i]*(1-a)+height[j*size+i+1]*a)*(1-b)+(height[(j+1)*size+i]*(1-a)+height[(j+1)*size+i+1]*a)*b;
  }
  function visibility(a,b){
    const d=sub(b,a),distance=length(d);if(distance<.04)return 1;
    const steps=Math.max(4,Math.min(48,Math.ceil(distance/1.6)));
    for(let j=1;j<steps;j++){
      // Reverse only the original integer sample order on descending rays;
      // coordinates and coverage remain identical to the incumbent stencil.
      const k=d[1]<0?steps-j:j,t=k/steps,x=a[0]+d[0]*t,y=a[1]+d[1]*t,z=a[2]+d[2]*t;
      if(y>terrainCeiling)break;
      if(y<h(x,z)+.025)return 0;
    }
    let opticalDepth=0;
    for(const v of volumes){
      const q=a.map((x,i)=>(x-v.center[i])/v.radius[i]),r=d.map((x,i)=>x/v.radius[i]);
      const aa=dot(r,r),bb=dot(q,r),cc=dot(q,q)-1,disc=bb*bb-aa*cc;if(disc<=0||aa<1e-12)continue;
      const root=Math.sqrt(disc),entry=clamp((-bb-root)/aa),exit=clamp((-bb+root)/aa);
      if(exit>entry)opticalDepth+=(exit-entry)*distance*v.extinction;
    }
    return Math.exp(-Math.min(20,opticalDepth));
  }
  return {visibility,height:h,size};
}

/** Zero new textures/RTs; 18 RGB SH1 probes = 54 vec4, plus 7 vectors.
 * Sky/PMREM remains DIRECT sky. This cache contains only sun->surface paths.
 * Remove the old hand-authored solar ground hemisphere when enabling it.
 */
export function createIndirectLighting(THREE,{terrainHeight=()=>0,grove=null,sunLight=null,atmosphere=null,quality='low',bounds=[-34,-24,68,48],cloudVisibility=null}={}){
  const start=performance.now(),red=new Float32Array(72),green=new Float32Array(72),blue=new Float32Array(72),target=new Float64Array(216),base=new Float32Array(9);
  const uniforms={uGIExposureScale:{value:1},uGIProbeR:{value:red},uGIProbeG:{value:green},uGIProbeB:{value:blue},uGIBounds:{value:new THREE.Vector4(...bounds)},uGIBase0:{value:new THREE.Vector3()},uGIBase1:{value:new THREE.Vector3()},uGIBase2:{value:new THREE.Vector3()},uGITop:{value:18},uGIEnabled:{value:quality==='off'?0:1},uGIReady:{value:0}};
  let mode=['off','low','high'].includes(quality)?quality:'low',disposed=false,ready=false,lastTime=-Infinity,lastSun='',dirty=true,updates=0,lastUpdateMs=0,maxUpdateMs=0,buildMs=0;
  let surfels=[],transfer=null,visibility=()=>1,probeWeights=[],probes=[],lastSolution=null;
  const composed=[new Float32Array(72),new Float32Array(72),new Float32Array(72)],transientSH=new Float64Array(216),pendingSH=new Float64Array(216),unitCache=Array.from({length:LOCAL_LIGHT_COUNT},()=>({key:'',epoch:-1,response:new Float64Array(216),incidentPower:0,reflectedPower:[0,0,0],safetyScale:1,capCount:0,unscaledIncidentPower:0,sourceSolidAngle:4*PI,minimumReceiverDistance:null,maxUnscaledPatchIncident:0}));
  let transientScratch=new Float64Array(0),transientEnabled=false,transientRequest=null,transientEpoch=0,transientUpdates=0,transientSolves=0,transientCacheHits=0,transientTime=0,transientLastMs=0,transientMaxMs=0,transientVisibilityQueries=0,transientIncidentPower=[0,0,0],transientReflectedPower=[0,0,0];
  const settings={low:{bounces:1,maxHz:2},high:{bounces:2,maxHz:4}};
  function publish(){
    if(!transientEnabled||mode==='off'){uniforms.uGIProbeR.value=red;uniforms.uGIProbeG.value=green;uniforms.uGIProbeB.value=blue;return;}
    const baseArrays=[red,green,blue];for(let p=0;p<18;p++)for(let c=0;c<3;c++)for(let k=0;k<4;k++)composed[c][p*4+k]=baseArrays[c][p*4+k]+transientSH[p*12+c*4+k];
    uniforms.uGIProbeR.value=composed[0];uniforms.uGIProbeG.value=composed[1];uniforms.uGIProbeB.value=composed[2];
  }
  function prepareTransient({sources=[],enabled=false,physicalTime=0}={}){
    if(disposed)throw new Error('Indirect lighting is disposed');if(!Number.isFinite(physicalTime))throw new RangeError('Transient GI physicalTime must be finite');
    const parsed=enabled?(()=>{if(!Array.isArray(sources)||sources.length!==LOCAL_LIGHT_COUNT)throw new TypeError('Transient GI needs '+LOCAL_LIGHT_COUNT+' raw local source records');return sources.map(transientSource);})():[];
    const stamp=performance.now();transientRequest={sources:parsed,enabled:!!enabled,physicalTime};transientTime=physicalTime;
    if(!ready||!enabled||mode==='off'){transientEnabled=false;transientSH.fill(0);transientIncidentPower=[0,0,0];transientReflectedPower=[0,0,0];publish();return{ready,enabled:false,pending:!ready&&!!enabled,spatialSolves:0};}
    pendingSH.fill(0);const nextIncident=[0,0,0],nextReflected=[0,0,0];let solves=0,hits=0,queries=0;
    for(let l=0;l<LOCAL_LIGHT_COUNT;l++){
      const s=parsed[l];if(!s.rawRGB.some(v=>v>0))continue;const cache=unitCache[l];
      if(cache.key!==s.key||cache.epoch!==transientEpoch){const result=transientDiffuseResponse(surfels,probeWeights,s,visibility,{out:cache.response,scratch:transientScratch});cache.incidentPower=result.incidentPower;cache.reflectedPower=result.reflectedPower;cache.safetyScale=result.safetyScale;if(result.safetyScale<1)cache.capCount++;cache.unscaledIncidentPower=result.unscaledIncidentPower;cache.sourceSolidAngle=result.sourceSolidAngle;cache.minimumReceiverDistance=Number.isFinite(result.minimumReceiverDistance)?result.minimumReceiverDistance:null;cache.maxUnscaledPatchIncident=result.maxUnscaledPatchIncident;cache.key=s.key;cache.epoch=transientEpoch;queries+=result.visibilityQueries;solves++;}else hits++;
      for(let p=0;p<18;p++)for(let c=0;c<3;c++)for(let k=0;k<4;k++)pendingSH[p*12+c*4+k]+=cache.response[p*12+c*4+k]*s.rawRGB[c];
      for(let c=0;c<3;c++){nextIncident[c]+=cache.incidentPower*s.rawRGB[c];nextReflected[c]+=cache.reflectedPower[c]*s.rawRGB[c];}
    }
    if(!pendingSH.every(v=>Number.isFinite(v)&&Number.isFinite(Math.fround(v))))throw new RangeError('Transient GI coefficients exceed finite raw Float32 storage');
    transientSH.set(pendingSH);transientIncidentPower=nextIncident;transientReflectedPower=nextReflected;transientEnabled=true;transientUpdates++;transientSolves+=solves;transientCacheHits+=hits;transientVisibilityQueries+=queries;publish();transientLastMs=performance.now()-stamp;transientMaxMs=Math.max(transientMaxMs,transientLastMs);
    return {ready,enabled:true,spatialSolves:solves,cacheHits:hits,visibilityQueries:queries,updateMs:transientLastMs,transportEpoch:transientEpoch};
  }
  function directInput(direction,color,intensity,time){
    const input=new Float64Array(surfels.length*3),distance=160;
    for(let i=0;i<surfels.length;i++){
      const s=surfels[i],cos=Math.max(0,dot(s.normal,direction));if(cos<=0)continue;
      const a=s.position.map((v,c)=>v+s.normal[c]*.055),b=a.map((v,c)=>v+direction[c]*distance);
      const cloud=cloudVisibility?cloudVisibility(a,time):atmosphere?.cloudShadowAt?atmosphere.cloudShadowAt(a):1;
      const attenuation=visibility(a,b)*clamp(Number.isFinite(cloud)?cloud:1);
      for(let c=0;c<3;c++)input[i*3+c]=Math.max(0,intensity)*Math.max(0,color[c])*cos*attenuation;
    }
    return input;
  }
  const readyPromise=(async()=>{
    const geometry=await sampleGrove(grove,48,()=>disposed);if(disposed)return;
    const lookup=createVisibility(terrainHeight,geometry.volumes,bounds);visibility=lookup.visibility;
    const nx=11,nz=7,dx=bounds[2]/nx,dz=bounds[3]/nz;
    for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
      const px=bounds[0]+(x+.5)*dx,pz=bounds[1]+(z+.5)*dz,h=terrainHeight(px,pz);if(h<=.025)continue;
      const e=.25,hx=(terrainHeight(px+e,pz)-terrainHeight(px-e,pz))/(2*e),hz=(terrainHeight(px,pz+e)-terrainHeight(px,pz-e))/(2*e),n=normalize([-hx,1,-hz]);
      // Mean of the actual sand shader's wet/dry base reflectance; sunlight
      // sources are dry land only. No diffuse source is invented on water.
      const wet=clamp((.1935-h)/.1855),albedo=[.665,.642,.589].map((v,c)=>v*.91*(1-wet*(1-[.665,.707,.743][c]))*.96);
      surfels.push({position:[px,h+.065,pz],surfacePosition:[px,h,pz],normal:n,area:dx*dz/Math.max(.2,n[1]),albedo,twoSided:false});
    }
    surfels.push(...geometry.patches);
    // Build reciprocal transport in small batches: only visibility evaluation
    // is costly. The matrix builder itself stays pure for numerical QA.
    const count=surfels.length,vis=new Float32Array(count*count);let stamp=performance.now();
    for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
      const a=surfels[i],b=surfels[j],d=sub(b.position,a.position);if(dot(a.normal,d)<=0||dot(b.normal,d)>=0)continue;
      const pa=a.position.map((v,c)=>v+a.normal[c]*.04),pb=b.position.map((v,c)=>v+b.normal[c]*.04);
      vis[i*count+j]=vis[j*count+i]=visibility(pa,pb);
      if(performance.now()-stamp>4){await yieldFrame();if(disposed)return;stamp=performance.now();}
    }
    const indices=new Map(surfels.map((s,i)=>[s.position,i]));
    transfer=buildDiffuseTransfer(surfels,(a,b)=>vis[indices.get(a)*count+indices.get(b)]);
    for(let y=0;y<2;y++)for(let z=0;z<3;z++)for(let x=0;x<3;x++){
      const px=bounds[0]+x*bounds[2]/2,pz=bounds[1]+z*bounds[3]/2,id=z*3+x;
      base[id]=Math.max(.12,terrainHeight(px,pz)+.22);probes.push([px,y?18:base[id],pz]);
    }
    for(let i=0;i<3;i++)uniforms['uGIBase'+i].value.fromArray(base,i*3);
    for(const p of probes){
      const weights=new Float64Array(count*4);
      for(let j=0;j<count;j++){
        const s=surfels[j],d=sub(s.position,p),d2=dot(d,d);if(d2<.01)continue;
        const w=normalize(d),ce=Math.max(0,-dot(s.normal,w));if(ce<=0)continue;
        const endpoint=s.position.map((v,c)=>v+s.normal[c]*.04),weight=s.area*ce*visibility(p,endpoint)/(PI*d2+s.area)*(8/9);
        weights[j*4]=weight*.25;for(let k=0;k<3;k++)weights[j*4+k+1]=weight*.5*w[k];
      }
      probeWeights.push(weights);await yieldFrame();if(disposed)return;
    }
    transientScratch=new Float64Array(count*3);transientEpoch++;ready=true;uniforms.uGIReady.value=1;buildMs=performance.now()-start;api.geometry={trianglesIntegrated:geometry.triangles,foliageVolumes:geometry.volumes.length,terrainGrid:lookup.size};
    api.update({time:0,force:true});
    if(transientRequest?.enabled){const request=transientRequest;transientRequest=null;prepareTransientParsed(request);}
  })();
  function prepareTransientParsed(request){
    // A pre-ready request was already validated. Recreate only its input shape;
    // no stored/P light is read and no clock is replayed.
    return prepareTransient({enabled:request.enabled,physicalTime:request.physicalTime,sources:request.sources.map(s=>({position:s.position,rawRGB:s.rawRGB,radius:s.radius,range:s.range,direction:s.direction,light:s.spot?{isSpotLight:true,angle:Math.acos(s.cosOuter),penumbra:1-Math.acos(s.cosInner)/Math.acos(s.cosOuter)}:null}))});
  }
  function update({time=0,delta=1/60,sunDirection=null,sunColor=null,sunIntensity=null,force=false}={}){
    if(disposed||!ready||mode==='off')return false;
    const direction=normalize(vec(sunDirection||grove?.userData?.sunDirection?.value||sunLight?.position||[.4,.8,.4]));
    const color=vec(sunColor||sunLight?.color||[1,1,1]),intensity=sunIntensity??sunLight?.intensity??3.6;
    const signature=[...direction,...color,intensity].map(v=>Number(v).toFixed(5)).join(',');
    const config=settings[mode];
    // RH/aerosol transitions change solar RGB by tiny amounts every frame.
    // Coalesce them in the same bounded lighting slot as moving cloud input;
    // explicit controls can force a solve, and setQuality marks it dirty.
    if(force||dirty||time-lastTime>=1/config.maxHz){
      const stamp=performance.now(),input=directInput(direction,color,intensity,time);
      lastSolution=solveDiffuseBounces(surfels,transfer.matrix,input,config.bounces);target.fill(0);
      for(let p=0;p<18;p++)for(let j=0;j<surfels.length;j++)for(let c=0;c<3;c++)for(let k=0;k<4;k++)target[p*12+c*4+k]+=lastSolution.total[j*3+c]*probeWeights[p][j*4+k];
      lastTime=time;lastSun=signature;dirty=false;updates++;lastUpdateMs=performance.now()-stamp;maxUpdateMs=Math.max(maxUpdateMs,lastUpdateMs);
    }
    // A short irradiance-cache blend avoids 2/4 Hz stair steps. It is not
    // a transport-time simulation. A paused forced control change snaps once.
    const blend=force||updates===1||delta<=0?1:1-Math.exp(-Math.max(0,delta)/.18),arrays=[red,green,blue];
    for(let p=0;p<18;p++)for(let c=0;c<3;c++)for(let k=0;k<4;k++){const i=p*4+k;arrays[c][i]+=(target[p*12+c*4+k]-arrays[c][i])*blend;}
    publish();
    return true;
  }
  function sampleIrradiance(point,normal=[0,1,0],{physical=false}={}){
    if(!ready||mode==='off')return [0,0,0];
    const p=vec(point),n=normalize(vec(normal)),u=(p[0]-bounds[0])/bounds[2],v=(p[2]-bounds[1])/bounds[3],outside=Math.max(-u,u-1,-v,v-1);
    if(outside>=.18)return [0,0,0];const t=clamp(outside/.18),edge=1-t*t*(3-2*t),qx=clamp(u,0,.999999)*2,qz=clamp(v,0,.999999)*2,x=Math.floor(qx),z=Math.floor(qz),fx=qx-x,fz=qz-z,out=[0,0,0],arrays=[uniforms.uGIProbeR.value,uniforms.uGIProbeG.value,uniforms.uGIProbeB.value];
    for(let dz=0;dz<2;dz++)for(let dx=0;dx<2;dx++){
      const id=(z+dz)*3+x+dx,weight=(dx?fx:1-fx)*(dz?fz:1-fz),y=clamp((p[1]-base[id])/(18-base[id]));
      for(let c=0;c<3;c++)for(let k=0;k<4;k++){const basis=k===0?1:n[k-1],a=arrays[c][id*4+k],b=arrays[c][(id+9)*4+k];out[c]+=weight*((1-y)*a+y*b)*basis;}
    }
    return out.map(c=>Math.max(0,c)*edge*(physical?1:uniforms.uGIExposureScale.value));
  }
  function apply(material){
    if(!material?.isMeshStandardMaterial||material.userData.atollIndirectLighting)return false;
    material.userData.atollIndirectLighting=true;
    const previous=material.onBeforeCompile.bind(material),key=material.customProgramCacheKey.bind(material);
    material.onBeforeCompile=(shader,renderer)=>{
      previous(shader,renderer);Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGIWorld;').replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 giWorld=vec4(transformed,1.);
        #ifdef USE_BATCHING
          giWorld=batchingMatrix*giWorld;
        #endif
        #ifdef USE_INSTANCING
          giWorld=instanceMatrix*giWorld;
        #endif
        vGIWorld=(modelMatrix*giWorld).xyz;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vGIWorld;\n${indirectLightingGLSL}`).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
        vec3 giWorldNormal=inverseTransformDirection(nonPerturbedNormal,viewMatrix);
        reflectedLight.indirectDiffuse+=getIndirectIrradiance(vGIWorld,giWorldNormal)*BRDF_Lambert(material.diffuseColor);`);
    };
    material.customProgramCacheKey=()=>key()+'-finite-surface-radiosity-sh1-v1';material.needsUpdate=true;return true;
  }
  const api={uniforms,glsl:indirectLightingGLSL,ready:readyPromise,update,apply,sampleIrradiance,prepareTransient,geometry:null,
    invalidateTransientSourceCache(){transientEpoch++;for(const entry of unitCache)entry.key='';return transientEpoch;},
    getRadianceBound({component='combined',maximumDiffuseAlbedo=1}={}){
      if(!['combined','base','transient'].includes(component)||!Number.isFinite(maximumDiffuseAlbedo)||maximumDiffuseAlbedo<0||maximumDiffuseAlbedo>1)throw new RangeError('GI bound needs valid component and0..1 receiver diffuse albedo');
      const RGB=[0,0,0];if(ready&&mode!=='off')for(let p=0;p<18;p++)for(let c=0;c<3;c++){const a=component==='base'?[red,green,blue][c]:[uniforms.uGIProbeR.value,uniforms.uGIProbeG.value,uniforms.uGIProbeB.value][c],i=p*4,j=p*12+c*4;let v;if(component==='transient')v=transientEnabled?Math.max(0,transientSH[j]+Math.hypot(transientSH[j+1],transientSH[j+2],transientSH[j+3])):0;else v=Math.max(0,a[i]+Math.hypot(a[i+1],a[i+2],a[i+3]));if(!Number.isFinite(v))throw new RangeError('GI raw bound is non-finite');RGB[c]=Math.max(RGB[c],v);}
      const max=Math.max(...RGB)*maximumDiffuseAlbedo/PI;return{maxRGB:max>0?max*1.000005:0,maximumRawIrradianceRGB:RGB,component,rawBeforeStorageExposure:true,maximumDiffuseAlbedo,numericalSafety:1.000005,method:'maximum over18 SH1 a0+norm(a1) irradiance envelopes; convex spatial interpolation/fade; diffuse albedo/pi once',limits:['combined includes base and local one-hop once; do not also budget its components','raw reference RGB, not absolute spectral/photometric calibration','SH/proxy geometry and water-interface transport remain approximations']};
    },
    setSceneExposure(P){uniforms.uGIExposureScale.value=2**P;},
    setQuality(value){if(!['off','low','high'].includes(value))throw new Error('Indirect quality must be off, low or high.');mode=value;uniforms.uGIEnabled.value=mode==='off'?0:1;dirty=true;if(mode==='off'){transientEnabled=false;transientIncidentPower=[0,0,0];transientReflectedPower=[0,0,0];}else if(ready&&transientRequest?.enabled)prepareTransientParsed(transientRequest);publish();},
    diagnostics(){return {ready,quality:mode,bounces:settings[mode]?.bounces||0,maxHz:settings[mode]?.maxHz||0,updates,lastTime,lastUpdateMs,maxUpdateMs,buildMs,surfels:surfels.length,probes:18,uniformVectors:INDIRECT_UNIFORM_VECTORS,extraSamplers:0,extraScenePasses:0,maximumTransferRow:transfer?.maximumRow??null,reciprocityError:transfer?.reciprocityError??null,directReflectedPower:lastSolution?.directPower||[0,0,0],secondBounceReflectedPower:lastSolution?.secondPower||[0,0,0],geometry:api.geometry,source:'directional solar irradiance times cloud/terrain/porous-foliage visibility; no duplicate direct sky',transient:{enabled:transientEnabled,requestedEnabled:!!transientRequest?.enabled,physicalTime:transientTime,updates:transientUpdates,spatialSolves:transientSolves,sourceCacheHits:transientCacheHits,transportEpoch:transientEpoch,lastUpdateMs:transientLastMs,maxUpdateMs:transientMaxMs,visibilityQueries:transientVisibilityQueries,incidentPowerRGB:[...transientIncidentPower],reflectedPowerRGB:[...transientReflectedPower],sourceCount:LOCAL_LIGHT_COUNT,sourceCapture:unitCache.map((c,slot)=>({slot,safetyScale:c.safetyScale,capCount:c.capCount,unscaledUnitCapture:c.unscaledIncidentPower,sourceSolidAngle:c.sourceSolidAngle,minimumReceiverDistance:c.minimumReceiverDistance,maxUnscaledPatchIncident:c.maxUnscaledPatchIncident})),unitCacheBytes:LOCAL_LIGHT_COUNT*216*8,coefficientBytes:216*16+3*72*4,surfaceSampling:'local-only physical terrain surfacePosition; legacy raised position remains visibility/transport proxy',sourceCaptureLimit:'per-source unit capture capped by4pi or analytic smoothstep spot solid angle; not exact area integration or probe-field energy',cacheInvalidation:'source-cache invalidation alone does not rebuild terrain/rest geometry; recreate GI for physical geometry changes'},limits:['rest-geometry disk patches and porous ellipsoid foliage visibility','SH1 probes are low-frequency and can leak across small occluders',`optional ${LOCAL_LIGHT_COUNT}-source raw one-hop uses per-source/channel unit-cone SH; angular response softened, a0 retained after capture cap`,'local source-to-patch visibility is finite terrain/porous proxy; no per-leaf torch shadow-map readback','unit capture cap prevents over-collecting source flux but may spread a close spot across coarse representative patches','new transient does not enter base solar filtering/PMREM; no spectral/absolute source calibration','no wind-resolved transfer, specular GI, water-interface transport, path tracing or infinite bounce solve']};},
    dispose(){disposed=true;uniforms.uGIEnabled.value=0;uniforms.uGIReady.value=0;red.fill(0);green.fill(0);blue.fill(0);transientSH.fill(0);for(const a of composed)a.fill(0);transientEnabled=false;}
  };
  return api;
}
