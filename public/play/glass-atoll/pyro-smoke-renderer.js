import {createPyroSmokeLightField} from './pyro-smoke-light-field.js';
import {createSmokeProjector} from './pyro-smoke-projection.js';
// Isolated StageA renderer. No app/event wiring or light-to-smoke extinction.
// Optional clear-air front correction is a thin-layer approximation, not joint
// media integration. Neutral extinction only; scattering is a disclosed
// conditional-mean/centre-order approximation, not a joint volume solver.
import {localLightGLSL,LOCAL_LIGHT_COUNT} from './local-lights.js';
export const smokeGaussianColumnGLSL=/* glsl */`
  vec3 smokeWhiten(vec3 q,vec4 c0,vec2 c1){
    float x=q.x/c0.x,y=(q.y-c0.y*x)/c0.z;
    return vec3(x,y,(q.z-c0.w*x-c1.x*y)/c1.y);
  }
  float smokeErfc(float x){float t=1./(1.+.3275911*x);return (((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*exp(-x*x);}
  float smokeErfDifference(float a,float b){
    if(a==b)return 0.;float width=b-a;
    if(width<1e-3/(1.+max(abs(a),abs(b)))){float h=width*.5,m=a+h,q=h*.5773502691896258;return 1.1283791670955126*h*(exp(-(m-q)*(m-q))+exp(-(m+q)*(m+q)));}
    if(a>=0.)return smokeErfc(a)-smokeErfc(b);
    if(b<=0.)return smokeErfc(-b)-smokeErfc(-a);
    return (1.-smokeErfc(-a))+(1.-smokeErfc(b));
  }
  // Mean is a physical ray distance after clipping, never a virtual kernel mean.
  vec3 smokeColumn(vec3 mean,vec4 c0,vec2 c1,float normalization,
                   vec3 direction,float start,float end){
    if(end<=start)return vec3(0.,start,0.);
    vec3 q=smokeWhiten(direction*start-mean,c0,c1),v=smokeWhiten(direction,c0,c1);
    float A=dot(v,v),b=dot(q,v)/A,extent=end-start,root=sqrt(A*.5);
    vec3 perpendicular=q-v*b;
    float e0=exp(-.5*A*b*b),e1=exp(-.5*A*(extent+b)*(extent+b));
    float integral=sqrt(1.5707963267948966/A)*smokeErfDifference(root*b,root*(extent+b));
    float tau=normalization*exp(-.5*dot(perpendicular,perpendicular))*integral;
    float conditional=clamp(-b,0.,extent),fallback=1.;
    if(integral>1e-10){float candidate=-b+(e0-e1)/(A*integral);if(candidate>=-1e-3&&candidate<=extent+1e-3){conditional=clamp(candidate,0.,extent);fallback=0.;}}
    return vec3(tau,start+conditional,fallback);
  }
`;

const PI=Math.PI,GAUSS3=(2*PI)**1.5;
const finite=(v,name)=>{if(!Number.isFinite(v))throw new RangeError(name+' must be finite');return v;};
const vector=(v,name)=>{const a=v?.toArray?v.toArray():v;if(!a||a.length!==3)throw new TypeError(name+' requires3 components');return Array.from(a,(x,i)=>finite(x,name+'['+i+']'));};
const nonnegative=(v,name)=>{const a=vector(v,name);if(a.some(x=>x<0))throw new RangeError(name+' must be nonnegative');return a;};
const f32=(v,name)=>{if(!Number.isFinite(Math.fround(v)))throw new RangeError(name+' exceeds finiteFloat32 range');return v;};
function cholesky(value){
  if(!value||value.length!==9)throw new TypeError('Packet covariance requires row-major3x3');const c=Array.from(value,(v,i)=>finite(v,'covariance['+i+']')),s=Math.max(c[0],c[4],c[8]);
  for(const [a,b]of [[1,3],[2,6],[5,7]])if(Math.abs(c[a]-c[b])>64*Number.EPSILON*s)throw new RangeError('Packet covariance must be symmetric');
  const L=Array(9).fill(0);for(let i=0;i<3;i++)for(let j=0;j<=i;j++){let x=c[i*3+j];for(let k=0;k<j;k++)x-=L[i*3+k]*L[j*3+k];if(i===j){if(!(x>0))throw new RangeError('Packet covariance must be SPD');L[i*3+j]=Math.sqrt(x);}else L[i*3+j]=x/L[j*3+j];}
  const det=L[0]*L[4]*L[8],inverse=[];
  for(let column=0;column<3;column++){const b=[0,0,0];b[column]=1;const y=[b[0]/L[0],0,0];y[1]=(b[1]-L[3]*y[0])/L[4];y[2]=(b[2]-L[6]*y[0]-L[7]*y[1])/L[8];const x=[0,0,y[2]/L[8]];x[1]=(y[1]-L[7]*x[2])/L[4];x[0]=(y[0]-L[3]*x[1]-L[6]*x[2])/L[0];for(let row=0;row<3;row++)inverse[row*3+column]=x[row];}
  return {L,det,covariance:c,trace:c[0]+c[4]+c[8],inverseFrobenius:Math.hypot(...inverse)};
}

function parseAir(air={}){
  if(!air?.enabled)return {enabled:false};
  const betaR=nonnegative(air.betaRayleighRGB??[0,0,0],'air.betaRayleighRGB'),betaME=nonnegative(air.betaMieExtinctionRGB??[0,0,0],'air.betaMieExtinctionRGB'),betaMS=nonnegative(air.betaMieScatteringRGB??[0,0,0],'air.betaMieScatteringRGB'),sun=nonnegative(air.rawSunRGB??[0,0,0],'air.rawSunRGB'),direction=vector(air.sunDirection??[0,1,0],'air.sunDirection'),length=Math.hypot(...direction),g=finite(air.asymmetry??.76,'air.asymmetry'),heights=[finite(air.rayleighHeight??8000,'air.rayleighHeight'),finite(air.aerosolHeight??1200,'air.aerosolHeight')];
  if(!(length>0)||!Number.isFinite(length)||Math.abs(g)>.9||heights.some(v=>!(Math.fround(v)>0)))throw new RangeError('Air needs finite nonzero sun direction, positive Float32 heights and |g|<=.9');
  if(betaMS.some((v,i)=>v>betaME[i]))throw new RangeError('Air scattering cannot exceed extinction');
  for(const x of [...betaR,...betaME,...betaMS,...sun,...heights,...betaR.map((v,i)=>v+betaME[i])])f32(x,'Air GPU field');
  return {enabled:true,betaR,betaME,betaMS,sun,direction:direction.map(v=>v/length),g,heights};
}
const phaseMaximum=g=>(1+Math.abs(g))/(4*PI*(1-Math.abs(g))**2);

const localUniformNames=['uLocalPosition','uLocalColour','uLocalDirection','uLocalCone','uLocalBurstBounds','uLocalShadowMap','uLocalShadowMatrix','uLocalShadowSize','uLocalShadowEnabled','uLocalShadowBias'];
function parseLocalLighting(local,sceneScale=null){
  if(local==null)return null;
  if(local.glsl!==undefined&&local.glsl!==localLightGLSL)throw new Error('Smoke localLighting must use the shared localLightGLSL');
  if(!Array.isArray(local.records)||local.records.length!==LOCAL_LIGHT_COUNT)throw new TypeError('localLighting needs '+LOCAL_LIGHT_COUNT+' raw source records');
  for(const name of localUniformNames)if(!local.uniforms?.[name]||!('value'in local.uniforms[name]))throw new TypeError('Missing borrowed local lighting uniform '+name);
  for(const name of ['uLocalPosition','uLocalColour','uLocalDirection','uLocalCone']){
    const values=local.uniforms[name].value;if(!Array.isArray(values)||values.length!==LOCAL_LIGHT_COUNT)throw new TypeError(name+' requires '+LOCAL_LIGHT_COUNT+' vec4 values');
    for(const v of values)if(!v?.isVector4||!v.toArray().every(Number.isFinite))throw new RangeError(name+' needs finite vec4 values');
  }
  const raw=local.records.map((record,i)=>{const RGB=nonnegative(record.rawRGB,'local record.rawRGB'),radius=finite(record.radius,'local record.radius');if(!(Math.fround(radius)>0))throw new RangeError('Local source radius must be positive Float32');
    if(sceneScale!==null){const color=local.uniforms.uLocalColour.value[i],position=local.uniforms.uLocalPosition.value[i];for(let c=0;c<3;c++){const expected=f32(RGB[c]*sceneScale,'borrowed stored localRGB'),actual=color.getComponent(c);if(Math.abs(actual-expected)>1e-12+2e-7*Math.abs(expected))throw new Error('Borrowed local lighting exposure differs from frame.sceneScale; call setSceneExposure before smoke draw');}if(RGB.some(v=>v>0)&&position.w<radius*(1-1e-7))throw new Error('Borrowed local source radius is smaller than its raw-bound record');}
    return {RGB,radius};});
  const shadow=local.uniforms.uLocalShadowMap.value,size=local.uniforms.uLocalShadowSize.value,matrix=local.uniforms.uLocalShadowMatrix.value;
  if(!shadow?.isTexture||!size?.isVector2||!(size.x>0&&size.y>0)||!size.toArray().every(Number.isFinite)||!matrix?.isMatrix4||!matrix.elements.every(Number.isFinite))throw new TypeError('Borrowed torch shadow defaults must be valid texture, size and matrix');
  finite(local.uniforms.uLocalShadowEnabled.value,'local shadow enabled');finite(local.uniforms.uLocalShadowBias.value,'local shadow bias');
  return {uniforms:local.uniforms,raw};
}

/** Caller owns renderer, target, immutable snapshot and detached depth texture.
 * Lighting is RAW, pre-storage exposure: ambientRGB/4pi + HG*incidentRGB.
 * A single sceneScale is applied to lighting uniforms; no camera C is read.
 */
export function createPyroSmokeRenderer(THREE,renderer,{maxPackets=4096,supportSigma=4,anisotropy=.32,projectionMode='legacy-sphere',lightFieldBakeMode='serial-reference',lightFieldMaxRequestPairs=null,lightFieldMaxMapPairs=1000000,lightFieldMaxMapDraws=64}={}){
  const validBake=value=>{if(value!=='serial-reference'&&value!=='tiled64')throw new RangeError('Smoke lighting bake mode requires serial-reference or tiled64');return value;};validBake(lightFieldBakeMode);
  const validProjection=value=>{if(value!=='legacy-sphere'&&value!=='ellipsoid')throw new RangeError('Smoke projectionMode requires legacy-sphere or ellipsoid');return value;};
  validProjection(projectionMode);
  if(!Number.isInteger(maxPackets)||maxPackets<1||maxPackets>65536)throw new RangeError('maxPackets requires1..65536');
  if(!Number.isFinite(supportSigma)||supportSigma<4||supportSigma>5)throw new RangeError('supportSigma requires4..5');
  if(!Number.isFinite(anisotropy)||Math.abs(anisotropy)>.9)throw new RangeError('anisotropy requires-.9...9');
  const geometry=new THREE.InstancedBufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));geometry.setIndex([0,1,2,0,2,3]);
  const arrays={rect:new Float32Array(maxPackets*4),mean:new Float32Array(maxPackets*3),chol0:new Float32Array(maxPackets*4),chol1:new Float32Array(maxPackets*2),optics:new Float32Array(maxPackets*4)};
  for(const [name,size]of [['rect',4],['mean',3],['chol0',4],['chol1',2],['optics',4]])geometry.setAttribute('a'+name[0].toUpperCase()+name.slice(1),new THREE.InstancedBufferAttribute(arrays[name],size).setUsage(THREE.DynamicDrawUsage));geometry.instanceCount=0;
  const dummy=new THREE.DataTexture(new Float32Array([1]),1,1,THREE.RedFormat,THREE.FloatType);dummy.needsUpdate=true;dummy.minFilter=dummy.magFilter=THREE.NearestFilter;dummy.generateMipmaps=false;
  const uniforms={uOpaqueDepth:{value:dummy},uInverseProjection:{value:new THREE.Matrix4()},uCameraWorld:{value:new THREE.Matrix4()},uEye:{value:new THREE.Vector3()},uSize:{value:new THREE.Vector2(1,1)},uNearFar:{value:new THREE.Vector2(.1,30000)},uReflection:{value:0},uPlaneY:{value:0},uDebugMode:{value:0},uG:{value:anisotropy},uAmbient:{value:new THREE.Vector3()},uDirectionalRGB:{value:new THREE.Vector3()},uDirectionalDirection:{value:new THREE.Vector3(0,1,0)},uClusterPosition:{value:[new THREE.Vector3(),new THREE.Vector3()]},uClusterRGB:{value:[new THREE.Vector3(),new THREE.Vector3()]},uClusterRadius:{value:new Float32Array([1,1])},uVignette:{value:0},uSensorHeight:{value:24},uFocal:{value:28}};
  Object.assign(uniforms,{uAirEnabled:{value:0},uAirBetaR:{value:new THREE.Vector3()},uAirBetaME:{value:new THREE.Vector3()},uAirBetaMS:{value:new THREE.Vector3()},uAirSun:{value:new THREE.Vector3()},uAirDirection:{value:new THREE.Vector3(0,1,0)},uAirHeights:{value:new THREE.Vector2(8000,1200)},uAirG:{value:.76}});
  const localWhite=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);localWhite.needsUpdate=true;localWhite.minFilter=localWhite.magFilter=THREE.NearestFilter;localWhite.generateMipmaps=false;
  const localDefaults={uLocalPosition:{value:Array.from({length:LOCAL_LIGHT_COUNT},()=>new THREE.Vector4(0,0,0,1))},uLocalColour:{value:Array.from({length:LOCAL_LIGHT_COUNT},()=>new THREE.Vector4())},uLocalDirection:{value:Array.from({length:LOCAL_LIGHT_COUNT},()=>new THREE.Vector4())},uLocalCone:{value:Array.from({length:LOCAL_LIGHT_COUNT},()=>new THREE.Vector4(-1,1,1,0))},uLocalBurstBounds:{value:[new THREE.Vector4(),new THREE.Vector4()]},uLocalShadowMap:{value:localWhite},uLocalShadowMatrix:{value:new THREE.Matrix4()},uLocalShadowSize:{value:new THREE.Vector2(1,1)},uLocalShadowEnabled:{value:0},uLocalShadowBias:{value:0}};
  Object.assign(uniforms,localDefaults,{uUseLocalLighting:{value:0},uFiniteClusterPhase:{value:0}});
  const vertex=/* glsl */`precision highp float;in vec3 position,aMean;in vec4 aRect,aChol0,aOptics;in vec2 aChol1;
    flat out vec3 vMean;flat out vec4 vChol0,vOptics;flat out vec2 vChol1;
    void main(){vec2 uv=position.xy*.5+.5;gl_Position=vec4(mix(aRect.xy,aRect.zw,uv),0.,1.);vMean=aMean;vChol0=aChol0;vChol1=aChol1;vOptics=aOptics;}`;
  const fragment=/* glsl */`precision highp float;precision highp int;
    uniform highp sampler2D uOpaqueDepth;uniform mat4 uInverseProjection,uCameraWorld;uniform vec3 uEye,uAmbient,uDirectionalRGB,uDirectionalDirection,uClusterPosition[2],uClusterRGB[2];uniform vec2 uSize,uNearFar;uniform float uReflection,uPlaneY,uDebugMode,uG,uClusterRadius[2],uVignette,uSensorHeight,uFocal;
    uniform float uAirEnabled,uAirG;uniform vec2 uAirHeights;uniform vec3 uAirBetaR,uAirBetaME,uAirBetaMS,uAirSun,uAirDirection;
    uniform float uUseLocalLighting,uFiniteClusterPhase;
    ${localLightGLSL}
    flat in vec3 vMean;flat in vec4 vChol0,vOptics;flat in vec2 vChol1;out vec4 outColour;
    ${smokeGaussianColumnGLSL}
    float phaseHG(float mu){float g=uG,den=1.+g*g-2.*g*mu;return(1.-g*g)/(12.566370614359172*den*sqrt(den));}
    // Same four quadratic-distance cells as finite effects. Each cell uses its
    // midpoint coefficients; this is not exact vertically varying air transport.
    void smokeFrontAir(vec3 direction,float start,float end,out vec3 T,out vec3 S){
      T=vec3(1.);S=vec3(0.);float distance=end-start;if(distance<1e-5)return;
      float mu=clamp(dot(direction,uAirDirection),-1.,1.),phaseR=3./(16.*3.14159265359)*(1.+mu*mu),phaseM=(1.-uAirG*uAirG)/(12.56637061436*pow(max(1e-4,1.+uAirG*uAirG-2.*uAirG*mu),1.5));
      for(int i=0;i<4;i++){float a=float(i)/4.,b=float(i+1)/4.,ds=(b*b-a*a)*distance,h=max(0.,uEye.y+direction.y*(start+(a*a+b*b)*.5*distance));vec3 r=uAirBetaR*exp(-h/uAirHeights.x),m=uAirBetaMS*exp(-h/uAirHeights.y),extinction=r+uAirBetaME*exp(-h/uAirHeights.y);vec3 integral=(vec3(1.)-exp(-extinction*ds))/max(extinction,vec3(1e-12));integral=mix(integral,vec3(ds),lessThan(extinction*ds,vec3(1e-5)));S+=T*uAirSun*(r*phaseR+m*phaseM)*integral;T*=exp(-extinction*ds);}
    }
    void main(){
      vec2 uv=gl_FragCoord.xy/uSize,ndc=uv*2.-1.;vec4 h=uInverseProjection*vec4(ndc,1.,1.);
      vec3 viewDirection=normalize(h.xyz);if(viewDirection.z>0.)viewDirection=-viewDirection;
      vec3 direction=normalize(mat3(uCameraWorld)*viewDirection);
      float start=0.,end=uNearFar.y/max(-viewDirection.z,1e-6),depth=textureLod(uOpaqueDepth,uv,0.).r;
      if(depth<.9999999){vec4 p=uInverseProjection*vec4(ndc,depth*2.-1.,1.);vec3 endpoint=mat3(uCameraWorld)*(p.xyz/p.w);end=min(end,dot(endpoint,direction));}
      if(uReflection>.5){if(direction.y<=0.)discard;start=max(0.,(uPlaneY-uEye.y)/direction.y);}
      if(end<=start)discard;
      vec3 column=smokeColumn(vMean,vChol0,vChol1,vOptics.x,direction,start,end);float tau=column.x;
      if(uDebugMode>.5){outColour=vec4(tau,column.y,column.z,1.);return;}
      if(tau<=0.)discard;
      float opacity=tau<1e-3?tau*(1.-tau*.5+tau*tau/6.):1.-exp(-tau);
      vec3 point=direction*column.y,source=uAmbient/12.566370614359172+uDirectionalRGB*phaseHG(clamp(dot(direction,uDirectionalDirection),-1.,1.));
      if(uUseLocalLighting>.5){vec3 worldPoint=uEye+point;for(int i=0;i<${LOCAL_LIGHT_COUNT};i++){vec3 L;vec3 incident=localIncident(worldPoint,i,L);if(uFiniteClusterPhase>.5&&i>=4){float distance=length(uLocalPosition[i].xyz-worldPoint),weight=smoothstep(1.,2.,distance/uLocalPosition[i].w),phase=mix(0.07957747154594767,phaseHG(clamp(dot(direction,L),-1.,1.)),weight);source+=incident*phase;}else{source+=incident*phaseHG(clamp(dot(direction,L),-1.,1.));}}}
      else{for(int i=0;i<2;i++){vec3 delta=uClusterPosition[i]-point;float distance2=dot(delta,delta),phase=distance2>1e-12?phaseHG(clamp(dot(direction,delta*inversesqrt(distance2)),-1.,1.)):0.07957747154594767;if(uFiniteClusterPhase>.5){float weight=smoothstep(1.,2.,sqrt(distance2)/uClusterRadius[i]);phase=mix(0.07957747154594767,phase,weight);}source+=uClusterRGB[i]*phase/max(distance2,uClusterRadius[i]*uClusterRadius[i]);}}
      vec3 rgb=vOptics.yzw*source*opacity;
      if(uAirEnabled>.5){vec3 Tair,Sair;smokeFrontAir(direction,start,column.y,Tair,Sair);rgb=opacity*(Tair*vOptics.yzw*source+Sair);}
      vec2 sensor=(uv-.5)*vec2(uSensorHeight*uSize.x/uSize.y,uSensorHeight);float cos4=pow(inversesqrt(1.+dot(sensor,sensor)/(uFocal*uFocal)),4.);rgb*=mix(1.,mix(1.,cos4,.30),uVignette);
      outColour=vec4(rgb,opacity);
    }`;
  const material=new THREE.RawShaderMaterial({name:'StageA finite Gaussian smoke / neutral premult',glslVersion:THREE.GLSL3,uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendEquationAlpha:THREE.AddEquation,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;const scene=new THREE.Scene();scene.add(mesh);
  let records=[],lastRender=null,disposed=false,stateRevision=null;
  let fieldSnapshot=null,ownedLightField=null,activeLightField=null,resolvedMaterial=null,fieldIndexArray=null,fieldWasRequested=false,lightingStatus={requestedEnabled:false,enabled:false,effective:false,supported:true,reason:'disabled',requiredPairs:0,maxBakePairs:1048576};
  function currentResolvedField(){if(!activeLightField?.enabled)return null;if(activeLightField.snapshot!==fieldSnapshot||activeLightField.snapshotRevision!==fieldSnapshot.revision)throw new Error('Resolved smoke field is stale; prepare lighting after density update');return activeLightField;}
  function ensureResolvedMaterial(){if(resolvedMaterial)return;fieldIndexArray=new Float32Array(maxPackets);geometry.setAttribute('aLightIndex',new THREE.InstancedBufferAttribute(fieldIndexArray,1).setUsage(THREE.DynamicDrawUsage));Object.assign(uniforms,{uResolvedR:{value:dummy},uResolvedG:{value:dummy},uResolvedB:{value:dummy},uResolvedSize:{value:new THREE.Vector2(1,1)},uResolvedScale:{value:1}});
    const vertexDeclarations='in float aLightIndex;uniform highp sampler2D uResolvedR,uResolvedG,uResolvedB;uniform vec2 uResolvedSize;flat out vec4 vResolvedR,vResolvedG,vResolvedB;\n';
    const fetch='vOptics=aOptics;int fieldIndex=int(aLightIndex+.5);ivec2 fieldTexel=ivec2(fieldIndex%int(uResolvedSize.x),fieldIndex/int(uResolvedSize.x));vResolvedR=texelFetch(uResolvedR,fieldTexel,0);vResolvedG=texelFetch(uResolvedG,fieldTexel,0);vResolvedB=texelFetch(uResolvedB,fieldTexel,0);}';
    const v=vertex.replace('flat out vec3 vMean;',vertexDeclarations+'flat out vec3 vMean;').replace('vOptics=aOptics;}',fetch);
    const f=fragment.replace('uniform highp sampler2D uOpaqueDepth;','flat in vec4 vResolvedR,vResolvedG,vResolvedB;uniform float uResolvedScale;\nuniform highp sampler2D uOpaqueDepth;').replace(`for(int i=0;i<${LOCAL_LIGHT_COUNT};i++){vec3 L;`,'for(int i=0;i<4;i++){vec3 L;').replace('else{for(int i=0;i<2;i++){vec3 delta=','else{for(int i=0;i<0;i++){vec3 delta=').replace('vec3 rgb=vOptics.yzw*source*opacity;','source+=vec3(vResolvedR.x+dot(vResolvedR.yzw,direction),vResolvedG.x+dot(vResolvedG.yzw,direction),vResolvedB.x+dot(vResolvedB.yzw,direction))*uResolvedScale;vec3 rgb=vOptics.yzw*source*opacity;');
    if(v===vertex||f===fragment)throw new Error('Resolved smoke shader injection contract drift');resolvedMaterial=material.clone();resolvedMaterial.name='StageA smoke / actual-source isotropic SH1';resolvedMaterial.uniforms=uniforms;resolvedMaterial.vertexShader=v;resolvedMaterial.fragmentShader=f;resolvedMaterial.needsUpdate=true;
  }
  const pView=new THREE.Vector3(),pClip=new THREE.Vector4(),eye=new THREE.Vector3(),minRect=new THREE.Vector2(),maxRect=new THREE.Vector2();
  function parseLighting(lighting={}){
    const ambient=nonnegative(lighting.ambientRGB??[0,0,0],'raw ambientRGB'),directional=nonnegative(lighting.rawDirectionalRGB??[0,0,0],'rawDirectionalRGB'),direction=vector(lighting.directionalDirection??[0,1,0],'directionalDirection'),size=Math.hypot(...direction),rawPerCandela=finite(lighting.rawPerCandela??3.6e-5,'rawPerCandela');if(!(size>0)||rawPerCandela<0)throw new RangeError('Unit light direction and nonnegative source scale required');
    const clusters=(lighting.clusters??[]).map(l=>{const position=vector(l.position,'cluster.position'),color=nonnegative(l.color??l.colour,'cluster raw color'),I=finite(l.referenceCandela,'referenceCandela'),radius=finite(l.radius,'cluster.radius');if(I<0||!(radius>0))throw new RangeError('Cluster requires nonnegative sourceI and positive radius');return{position,color,intensity:I*rawPerCandela,radius};});if(clusters.length>2)throw new RangeError('StageA accepts at most2 raw clusters');return{ambient,directional,direction:direction.map(v=>v/size),clusters};
  }
  // r180 allocates the complete VBO on first use. Later versions upload only
  // the rewritten active prefix; unused capacity is never drawn. A zero draw
  // leaves pending ranges/version intact (including a prior interrupted draw).
  function dirtyActivePrefix(attribute,count){
    if(count===0)return;
    attribute.clearUpdateRanges();attribute.addUpdateRange(0,count*attribute.itemSize);attribute.needsUpdate=true;
  }
  const api={
    // The proxy omits only faint Gaussian outskirts. Physical state, source
    // transmission and lighting fields keep the complete packet distribution.
    setSupportSigma(value){if(disposed)throw new Error('Smoke renderer is disposed');if(!Number.isFinite(value)||value<4||value>5)throw new RangeError('supportSigma requires4..5');supportSigma=value;for(const p of records)p.radius=value*Math.sqrt(p.shape.trace);return supportSigma;},
    setProjectionMode(value){projectionMode=validProjection(value);return projectionMode;},
    setLightingBakeMode(value){lightFieldBakeMode=validBake(value);ownedLightField?.setBakeMode(lightFieldBakeMode);activeLightField=null;return lightFieldBakeMode;},
    setState(snapshot){if(disposed)throw new Error('Smoke renderer is disposed');if(!snapshot||!Array.isArray(snapshot.packets)||snapshot.packets.length>maxPackets)throw new RangeError('snapshot packet capacity invalid');const profiles=new Map((snapshot.profiles??[]).map(p=>[p.id,p]));
      const parsed=snapshot.packets.map((p,fieldIndex)=>{const profile=profiles.get(p.profileId);if(!profile)throw new RangeError('Missing packet optical profile');const k=nonnegative(profile.extinctionPerMassRGB,'extinction profile'),scale=Math.max(...k);if(Math.max(...k)-Math.min(...k)>1e-10*scale)throw new RangeError('StageA requires neutral extinction; RGB transmission cannot use one premult alpha');const ssa=nonnegative(profile.singleScatteringAlbedoRGB??[.9,.9,.9],'SSA');if(ssa.some(v=>v>1))throw new RangeError('SSA must be<=1');const mass=finite(p.mass,'relative mass');if(!(mass>0))throw new RangeError('Relative mass must be positive');const mean=vector(p.mean,'packet.mean'),shape=cholesky(p.covariance),normalization=mass*k[0]/(GAUSS3*shape.det),columnBound=mass*k[0]*shape.inverseFrobenius/(2*PI);for(const x of [...shape.L,normalization])f32(x,'GPU Gaussian field');if(k[0]>0&&(!(Math.fround(normalization)>0)||columnBound>1e30))throw new RangeError('Reference optical fields exceed StageA GPU numeric domain');return{id:p.id,fieldIndex,mean,shape,ssa,normalization,columnBound,radius:supportSigma*Math.sqrt(shape.trace)};});
      records=parsed;fieldSnapshot=snapshot;stateRevision=snapshot.revision??null;return{packets:records.length,stateRevision};},
    prepareLighting({ledger,enabled=false}={}){if(disposed)throw new Error('Smoke renderer is disposed');if(!enabled){activeLightField=null;lightingStatus=ownedLightField?ownedLightField.prepare({enabled:false}):{requestedEnabled:false,enabled:false,effective:false,supported:true,reason:'disabled',requiredPairs:0,maxBakePairs:1048576};return lightingStatus;}fieldWasRequested=true;if(!fieldSnapshot)throw new Error('Smoke state required before lighting preparation');if(!ownedLightField)ownedLightField=createPyroSmokeLightField(THREE,renderer,{maxPackets:Math.min(maxPackets,4096),anisotropy,bakeMode:lightFieldBakeMode,maxRequestPairs:lightFieldMaxRequestPairs,maxMapPairs:lightFieldMaxMapPairs,maxMapDraws:lightFieldMaxMapDraws});lightingStatus=ownedLightField.prepare({snapshot:fieldSnapshot,ledger,enabled:true});activeLightField=lightingStatus.effective?ownedLightField:null;return lightingStatus;},
    setResolvedLightingField(field){if(field==null){activeLightField=null;lightingStatus={requestedEnabled:false,enabled:false,effective:false,supported:true,reason:'disabled',requiredPairs:0,maxBakePairs:1048576};return lightingStatus;}if(typeof field.getRadianceBound!=='function'||typeof field.diagnostics!=='function'||field.snapshot!==fieldSnapshot||field.snapshotRevision!==fieldSnapshot.revision||field.packedPackets?.count!==records.length)throw new Error('External resolved field must match this exact smoke snapshot/layout');if(field.diagnostics().anisotropy!==anisotropy)throw new Error('Resolved phase anisotropy mismatch');fieldWasRequested=true;activeLightField=field;return lightingStatus=field.diagnostics();},
    getRadianceBound(lighting={}, {air={},localLighting=null}={}){const light=parseLighting(lighting),atmosphere=parseAir(air),local=parseLocalLighting(localLighting),resolved=currentResolvedField(),phaseMax=phaseMaximum(anisotropy);let ssaMax=0;for(const p of records)ssaMax=Math.max(ssaMax,...p.ssa);let maximum=Math.max(...light.ambient)/(4*PI)+Math.max(...light.directional)*phaseMax;if(local){for(const l of (resolved?local.raw.slice(0,4):local.raw))maximum+=Math.max(...l.RGB)/(l.radius*l.radius)*phaseMax;}else if(!resolved){for(const l of light.clusters)maximum+=Math.max(...l.color)*l.intensity/(l.radius*l.radius)*phaseMax;}if(resolved)maximum+=resolved.getRadianceBound().maxRGB;const smokeSource=maximum*ssaMax,airFront=atmosphere.enabled&&records.length?Math.max(...atmosphere.sun)*Math.max(3/(8*PI),phaseMaximum(atmosphere.g))*1.00002:0;return{maxRGB:smokeSource+airFront,components:{smokeSource,airFront},airNumericalSafety:1.00002,rawBeforeStorageExposure:true,...(resolved?{resolvedPyroField:true,resolvedFieldBound:resolved.getRadianceBound()}:{}),localLightingEnabled:!!local,method:'non-emissive convex-over layer upper bound; passive front-air source plus current raw smoke sources; local records replace legacy clusters when enabled; no factor per historical packet',limits:`authored raw incident reference, neutral extinction, up to${LOCAL_LIGHT_COUNT} shared local lights OR2 legacy clusters; optional four-cell front-air/conditional-mean approximation, small-tau/Float32 safety on air term, not a bound for future joint-media/light transport`};},
    render({target,camera,opaqueDepth=null,allowUnoccluded=false,reflection=false,planeY=0,frame={},lighting={},air={},localLighting=null,finiteClusterPhase=false,optics={},debugMode=0}={}){
      if(disposed)throw new Error('Smoke renderer is disposed');if(!target||!camera?.isPerspectiveCamera)throw new TypeError('Target and perspective camera required');if(opaqueDepth&&(opaqueDepth===target.depthTexture||opaqueDepth===target.texture||target.textures?.includes(opaqueDepth)))throw new Error('Opaque depth must be detached from the drawing target; attached feedback is forbidden');if(!opaqueDepth&&!allowUnoccluded)throw new Error('Resolved independent opaqueDepth required (allowUnoccluded is isolated QA only)');
      const P=finite(frame.storageEV??0,'storageEV'),scale=finite(frame.sceneScale??2**P,'sceneScale');if(!(scale>0)||('storageEV'in frame&&'sceneScale'in frame&&Math.abs(scale/2**P-1)>1e-8))throw new RangeError('sceneScale must equal2^storageEV');const light=parseLighting(lighting),atmosphere=parseAir(air),local=parseLocalLighting(localLighting,scale),resolved=currentResolvedField(),w=target.width,h=target.height;if(!(w>0&&h>0))throw new RangeError('Positive target size required');finite(planeY,'planeY');
      if(local&&(local.uniforms.uLocalShadowMap.value===target.depthTexture||local.uniforms.uLocalShadowMap.value===target.texture||target.textures?.includes(local.uniforms.uLocalShadowMap.value)))throw new Error('Borrowed torch shadow cannot be attached to smoke draw target');
      camera.updateMatrixWorld();if(resolved)ensureResolvedMaterial();eye.setFromMatrixPosition(camera.matrixWorld);const E=eye.toArray(),ordered=records.filter(p=>p.normalization>0).map(p=>({p,z:pView.fromArray(p.mean).applyMatrix4(camera.matrixWorldInverse).z})).sort((a,b)=>a.z-b.z||(a.p.id??0)-(b.p.id??0));let count=0,fullScreen=0,culled=0,bound=0,proxyRasterPixelUpperBound=0;
      const projector=projectionMode==='ellipsoid'?createSmokeProjector({viewMatrix:camera.matrixWorldInverse,projectionMatrix:camera.projectionMatrix,width:w,height:h,supportSigma}):null;
      for(const {p}of ordered){bound+=p.columnBound*Math.exp(-.5*supportSigma*supportSigma);
        if(projector){const projected=projector.project(p.mean,p.shape.covariance);if(projected.culled){culled++;continue;}if(projected.fullScreenFallback)fullScreen++;minRect.set(projected.rect[0],projected.rect[1]);maxRect.set(projected.rect[2],projected.rect[3]);}
        else{pView.fromArray(p.mean).applyMatrix4(camera.matrixWorldInverse);if(-pView.z+p.radius<=0){culled++;continue;}let full=-pView.z<=p.radius;minRect.set(Infinity,Infinity);maxRect.set(-Infinity,-Infinity);
          if(!full){for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){pClip.set(pView.x+x*p.radius,pView.y+y*p.radius,pView.z+z*p.radius,1).applyMatrix4(camera.projectionMatrix);if(pClip.w<=1e-8){full=true;continue;}minRect.x=Math.min(minRect.x,pClip.x/pClip.w);minRect.y=Math.min(minRect.y,pClip.y/pClip.w);maxRect.x=Math.max(maxRect.x,pClip.x/pClip.w);maxRect.y=Math.max(maxRect.y,pClip.y/pClip.w);}}
          if(full){minRect.set(-1,-1);maxRect.set(1,1);fullScreen++;}else if(minRect.x>1||minRect.y>1||maxRect.x< -1||maxRect.y< -1){culled++;continue;}
        }
        proxyRasterPixelUpperBound+=Math.min(w,Math.ceil((Math.min(1,maxRect.x)-Math.max(-1,minRect.x))*w*.5)+1)*Math.min(h,Math.ceil((Math.min(1,maxRect.y)-Math.max(-1,minRect.y))*h*.5)+1);
        if(resolved)fieldIndexArray[count]=p.fieldIndex;arrays.rect.set([Math.max(-1,minRect.x),Math.max(-1,minRect.y),Math.min(1,maxRect.x),Math.min(1,maxRect.y)],count*4);arrays.mean.set(p.mean.map((v,i)=>f32(v-E[i],'camera-relative centre')),count*3);const L=p.shape.L;arrays.chol0.set([L[0],L[3],L[4],L[6]],count*4);arrays.chol1.set([L[7],L[8]],count*2);arrays.optics.set([p.normalization,...p.ssa],count*4);count++;
      }
      geometry.instanceCount=count;for(const name of Object.keys(arrays))dirtyActivePrefix(geometry.getAttribute('a'+name[0].toUpperCase()+name.slice(1)),count);
      if(resolved){const textures=resolved.textures,size=resolved.size;if(textures.length!==3||size.count!==records.length)throw new Error('Resolved field texture/layout mismatch');uniforms.uResolvedR.value=textures[0];uniforms.uResolvedG.value=textures[1];uniforms.uResolvedB.value=textures[2];uniforms.uResolvedSize.value.set(size.width,size.height);uniforms.uResolvedScale.value=f32(scale,'resolved field sceneScale');dirtyActivePrefix(geometry.getAttribute('aLightIndex'),count);}mesh.material=resolved?resolvedMaterial:material;
      uniforms.uOpaqueDepth.value=opaqueDepth??dummy;uniforms.uInverseProjection.value.copy(camera.projectionMatrix).invert();uniforms.uCameraWorld.value.copy(camera.matrixWorld);uniforms.uEye.value.copy(eye);uniforms.uSize.value.set(w,h);uniforms.uNearFar.value.set(camera.near,camera.far);uniforms.uReflection.value=reflection?1:0;uniforms.uPlaneY.value=planeY;uniforms.uDebugMode.value=debugMode;uniforms.uAmbient.value.fromArray(light.ambient.map(v=>f32(v*scale,'stored ambient')));uniforms.uDirectionalRGB.value.fromArray(light.directional.map(v=>f32(v*scale,'stored directional')));uniforms.uDirectionalDirection.value.fromArray(light.direction);
      for(let i=0;i<2;i++){const l=light.clusters[i];uniforms.uClusterPosition.value[i].fromArray(l?l.position.map((v,c)=>f32(v-E[c],'relative cluster position')):[0,0,0]);uniforms.uClusterRGB.value[i].fromArray(l?l.color.map(v=>f32(v*l.intensity*scale,'stored cluster')):[0,0,0]);uniforms.uClusterRadius.value[i]=l?l.radius:1;}
      uniforms.uAirEnabled.value=atmosphere.enabled?1:0;if(atmosphere.enabled){uniforms.uAirBetaR.value.fromArray(atmosphere.betaR);uniforms.uAirBetaME.value.fromArray(atmosphere.betaME);uniforms.uAirBetaMS.value.fromArray(atmosphere.betaMS);uniforms.uAirSun.value.fromArray(atmosphere.sun.map(v=>f32(v*scale,'stored air sun')));uniforms.uAirDirection.value.fromArray(atmosphere.direction);uniforms.uAirHeights.value.fromArray(atmosphere.heights);uniforms.uAirG.value=atmosphere.g;}
      uniforms.uUseLocalLighting.value=local?1:0;for(const name of localUniformNames)uniforms[name]=local?local.uniforms[name]:localDefaults[name];
      uniforms.uFiniteClusterPhase.value=finiteClusterPhase?1:0;
      uniforms.uVignette.value=!reflection&&optics.vignette?1:0;uniforms.uSensorHeight.value=optics.sensorHeightMm??24;uniforms.uFocal.value=optics.focalMm??28;material.blending=debugMode?THREE.NoBlending:THREE.CustomBlending;if(resolved)resolvedMaterial.blending=material.blending;
      const gl=renderer.getContext?.(),previous={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()).clone(),scissor:renderer.getScissor(new THREE.Vector4()).clone(),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear,shadowAuto:renderer.shadowMap.autoUpdate,shadowDirty:renderer.shadowMap.needsUpdate,
        actualViewport:renderer.getCurrentViewport?.(new THREE.Vector4()),actualScissor:gl?Array.from(gl.getParameter(gl.SCISSOR_BOX)):null,actualScissorTest:gl?gl.isEnabled(gl.SCISSOR_TEST):null,readFramebuffer:gl?gl.getParameter(gl.READ_FRAMEBUFFER_BINDING):null,drawFramebuffer:gl?gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING):null};
      const targetMetadata={viewport:target.viewport?.clone(),scissor:target.scissor?.clone(),scissorTest:target.scissorTest};
      try{
        // RT rectangles are physical pixels. Public setViewport multiplies by
        // canvas DPR even while an RT is bound, so it must not be used here.
        target.viewport?.set(0,0,w,h);target.scissor?.set(0,0,w,h);if(target.scissor)target.scissorTest=false;
        renderer.autoClear=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.render(scene,camera);
      }finally{
        if(targetMetadata.viewport)target.viewport.copy(targetMetadata.viewport);if(targetMetadata.scissor){target.scissor.copy(targetMetadata.scissor);target.scissorTest=targetMetadata.scissorTest;}
        renderer.autoClear=previous.autoClear;renderer.shadowMap.autoUpdate=previous.shadowAuto;renderer.shadowMap.needsUpdate=previous.shadowDirty;
        // Restore the public logical state first, then the entry physical RT
        // rectangles. Its stored metadata can legitimately differ from both.
        renderer.setViewport(previous.viewport);renderer.setScissor(previous.scissor);renderer.setScissorTest(previous.scissorTest);
        const t=previous.target,v=t?.viewport?.clone(),s=t?.scissor?.clone(),test=t?.scissorTest;
        try{if(t?.viewport&&previous.actualViewport)t.viewport.copy(previous.actualViewport);if(t?.scissor&&previous.actualScissor){t.scissor.fromArray(previous.actualScissor);t.scissorTest=previous.actualScissorTest;}renderer.setRenderTarget(t,previous.face,previous.mip);}
        finally{if(v)t.viewport.copy(v);if(s){t.scissor.copy(s);t.scissorTest=test;}}
        if(gl){renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER,previous.drawFramebuffer);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,previous.drawFramebuffer);renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER,previous.readFramebuffer);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,previous.readFramebuffer);}
      }
      lastRender={packets:records.length,instances:count,culled,fullScreenFallbacks:fullScreen,projectionMode,proxyRasterPixelUpperBound,proxyRasterViewportLayers:proxyRasterPixelUpperBound/(w*h),reflection,width:w,height:h,storageEV:Math.log2(scale),supportSigma,offProxyOpticalDepthUpperBound:bound,debugMode,stateRevision,extraOffscreenTargets:0,frontAirEnabled:atmosphere.enabled,frontAirCells:atmosphere.enabled?4:0,localLightingEnabled:!!local,localLightingSources:local?(resolved?4:LOCAL_LIGHT_COUNT):0,legacyClusterSources:local||resolved?0:light.clusters.length,samplerCount:2,finiteClusterPhase:!!finiteClusterPhase,...(resolved?{resolvedPyroField:true,resolvedFieldVersion:resolved.diagnostics().version,vertexSamplers:3}: {})};return{...lastRender};
    },
    diagnostics(){return{version:'pyro-smoke-renderer-stageA-v3-local',lastRender:lastRender?{...lastRender}:null,projectionMode,lightFieldBakeMode,maxPackets,packets:records.length,supportSigma,anisotropy,...(fieldWasRequested?{resolvedLighting:{...lightingStatus,effective:!!currentResolvedField(),field:activeLightField?.diagnostics()??ownedLightField?.diagnostics()??null}}:{}),neutralExtinctionOnly:true,frontAirOptIn:true,localLightingOptIn:true,samplerCount:2,limits:['no app/event/source integration','true finite Gaussian columns withFloat32/erf and finite proxy-tail error; no unbiased-renderer claim','back-to-front latent-centre order; S at optical conditional mean, overlapping/source-varying scattering is approximate','optional four-cell front-air T/S restores front in-scatter at a conditional-mean thin layer; overlapping volumes are not a joint RTE integration',`optional shared${LOCAL_LIGHT_COUNT} localIncident sources replace legacy2 clusters; borrowed stored RGB is not multiplied by P again`,'no smoke self-shadow, smoke source-path attenuation or multiple scattering; shared torch scene-shadow PCF is reused when active','air is sun/key-only, exponential height, flat local worldY clamped at0; no smoke/local-light sourced air illumination added by this module','opaque depth must be independently resolved; no centre-depth discard','whole-space Gaussian matches state; no ground-fold/deposition model implicitly applied','no density/P/C coupling; P applied once to own raw lighting including air, borrowed local uniforms must already match this frame P','proxy culling affects rendering only; physical state mass is never deleted','far/subpixel footprint filtering and volumeDOF are not solved; per-source PSF remains caller-owned']};},
    dispose(){if(disposed)return;disposed=true;ownedLightField?.dispose();resolvedMaterial?.dispose();activeLightField=null;geometry.dispose();material.dispose();dummy.dispose();localWhite.dispose();records=[];}
  };return api;
}
