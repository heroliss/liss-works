import {createFrondTransport,sectionRotation,rotatePinnaEdges,fallbackDegeneratePinnae,completePalmGeometryFrame} from './palm-frame.js';

/* Original, seeded coconut grove and coastal Scaevola-like scrub.
 * Motion is a restrained phenomenological hierarchy, not an elastic FEM solve.
 * Primary references:
 * https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-6-gpu-generated-procedural-wind-animations-trees
 * https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis
 * https://www.nparks.gov.sg/florafaunaweb/flora/5/6/5618
 * https://www.nparks.gov.sg/florafaunaweb/flora/2/4/2431
 */

export const vegetationWindGLSL = /* glsl */`
  uniform float uGroveTime;
  uniform float uGroveWindStrength;
  uniform float uGroveWindDebug;
  uniform vec2 uGroveWindDirection;
  attribute vec4 aTreeRoot;
  attribute vec4 aBranchRoot;
  attribute vec4 aLeafRoot;
  attribute vec3 aBranchAxis;
  attribute vec3 aLeafAxis;
  attribute vec4 aGroveMotion;
  attribute vec4 aGrovePhase;
  mat3 groveRotation(vec3 axis,float angle){
    axis=normalize(axis);float c=cos(angle),s=sin(angle),k=1.0-c;
    float x=axis.x,y=axis.y,z=axis.z;
    return mat3(c+x*x*k,y*x*k+z*s,z*x*k-y*s,
      x*y*k-z*s,c+y*y*k,z*y*k+x*s,
      x*z*k+y*s,y*z*k-x*s,c+z*z*k);
  }
  vec3 groveDeformAt(vec3 p,out mat3 rotation,float sampleTime,float sampleWindStrength,vec2 sampleWindDirection){
    float speed=clamp(sampleWindStrength*uGroveWindDebug,0.0,5.0);
    float force=speed*speed/25.0,flutterPower=speed/5.0;
    vec2 direction=normalize(sampleWindDirection+vec2(0.00001));
    vec3 wind=vec3(direction.x,0.0,direction.y);
    vec3 bendAxis=normalize(vec3(direction.y,0.0,-direction.x));
    // The same gust travels across the island. Plant and branch phases supply
    // response variation rather than nine unrelated metronomes.
    float gustTime=sampleTime-dot(aTreeRoot.xz,direction)*0.13;
    float gust=0.76+0.19*sin(gustTime*0.52)+0.11*sin(gustTime*1.17+0.8);
    float response=0.65*sin(gustTime*0.69+aGrovePhase.x)+0.35*sin(gustTime*1.11+aGrovePhase.x*0.73);
    // Angular weight grows linearly with height, giving approximately
    // quadratic lateral deflection (height times angle) and a fixed foot.
    float mainAngle=force*(0.027*gust+0.019*response)*aGroveMotion.x;
    float bt=gustTime-aBranchRoot.w*0.09-aGroveMotion.y*0.24;
    float branchNoise=0.65*sin(bt*1.41+aGrovePhase.y)+0.35*sin(bt*2.37+aGrovePhase.y*0.63);
    float exposure=0.84+0.24*dot(normalize(aBranchAxis+vec3(0.0001)),wind);
    float branchAngle=force*(0.040*gust+0.084*branchNoise)*aGroveMotion.y*aGroveMotion.y*exposure/max(0.45,aGrovePhase.w);
    float ft=gustTime+dot(aLeafRoot.xz,direction)*0.055;
    float flutter=0.70*sin(ft*5.8+aGrovePhase.z)+0.30*sin(ft*9.7+aGrovePhase.z*1.37);
    // Edge flutter vanishes exactly at the shared root and pointed tip. Using
    // a constant edge multiplier separated coincident rest-tip vertices and
    // unfolded zero-rest-area faces whose rest normals were zero.
    float edgeEnvelope=4.0*aGroveMotion.z*(1.0-aGroveMotion.z);
    float leafAngle=flutterPower*0.21*flutter*aGroveMotion.z*aGroveMotion.z*(0.72+0.28*aGroveMotion.w*edgeEnvelope);
    leafAngle*=step(0.0001,aLeafRoot.w)/max(0.65,aGrovePhase.w);
    vec3 leafForward=normalize(aLeafAxis+vec3(0.0001));
    vec3 flapAxis=normalize(cross(leafForward,vec3(0.0,1.0,0.0))+leafForward*0.28+vec3(0.0001));
    mat3 leafRotation=groveRotation(flapAxis,leafAngle);
    mat3 branchRotation=groveRotation(bendAxis,branchAngle);
    mat3 trunkRotation=groveRotation(bendAxis,mainAngle);
    p=aLeafRoot.xyz+leafRotation*(p-aLeafRoot.xyz);
    p=aBranchRoot.xyz+branchRotation*(p-aBranchRoot.xyz);
    p=aTreeRoot.xyz+trunkRotation*(p-aTreeRoot.xyz);
    rotation=trunkRotation*branchRotation*leafRotation;
    return p;
  }
  vec3 groveDeform(vec3 p,out mat3 rotation){
    return groveDeformAt(p,rotation,uGroveTime,uGroveWindStrength,uGroveWindDirection);
  }
`;

export function createVegetation(THREE, { terrainHeight = () => 1.2, seed = 40219 } = {}) {
  const started=performance.now(),group=new THREE.Group();
  group.name='Coconut grove and coastal scrub';
  let state=seed>>>0;
  const random=()=>{state+=0x6d2b79f5;let n=Math.imul(state^(state>>>15),1|state);n^=n+Math.imul(n^(n>>>7),61|n);return((n^(n>>>14))>>>0)/4294967296;};
  const range=(a,b)=>a+random()*(b-a),V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const safeHeight=(x,z)=>{const h=terrainHeight(x,z);return Number.isFinite(h)?h:1.2;};
  const data=()=>({p:[],uv:[],c:[],i:[],tree:[],branch:[],leaf:[],branchAxis:[],leafAxis:[],motion:[],phase:[]});
  const trunks=data(),rachises=data(),sheaths=data(),pinnae=data(),twigs=data(),scrub=data();
  pinnae.sections=[];
  const palmVariants={},ownedGeometries=[];
  let palmFrameMode='legacy',palmFrameMesh=null;
  const palmFrameStats={mode:'legacy',transportedLeaves:0,projectionFallbackLeaves:0,degenerateFallbackLeaves:0,maximumRotationOrthogonalityError:0,maximumDeterminantError:0,framePreparationMs:0,geometryBuildMs:0,extraRetainedBytes:0,extraDrawCalls:0,extraVertexAttributes:0};
  const counts={palms:0,fronds:0,deadFronds:0,pinnae:0,shrubLeaves:0,shrubs:0};
  const treeRecords=[];
  const palmColors=['#557d2b','#638734','#466b26','#79973f','#3f6526'].map(c=>new THREE.Color(c));
  const shrubColors=['#517838','#729449','#416a2e','#65883f'].map(c=>new THREE.Color(c));
  function vertex(d,p,u,v,color,ctx,treeWeight,branchS,leafS,edgeWeight,leafRoot,leafLength,leafAxis){
    const i=d.p.length/3;
    d.p.push(p.x,p.y,p.z);d.uv.push(u,v);d.c.push(color.r,color.g,color.b);
    d.tree.push(ctx.treeRoot.x,ctx.treeRoot.y,ctx.treeRoot.z,ctx.height);
    d.branch.push(ctx.branchRoot.x,ctx.branchRoot.y,ctx.branchRoot.z,ctx.branchLength);
    d.leaf.push(leafRoot.x,leafRoot.y,leafRoot.z,leafLength);
    d.branchAxis.push(ctx.branchAxis.x,ctx.branchAxis.y,ctx.branchAxis.z);
    d.leafAxis.push(leafAxis.x,leafAxis.y,leafAxis.z);
    d.motion.push(clamp(treeWeight,0,1),clamp(branchS,0,1),leafS,edgeWeight);
    d.phase.push(ctx.treePhase,ctx.branchPhase,ctx.leafPhase,ctx.stiffness);
    return i;
  }
  function tube(d,points,radii,sides,color,ctx,uvScale=1){
    const start=d.p.length/3;let previous=V(1,0,0);
    for(let j=0;j<points.length;j++){
      const t=j/(points.length-1),tangent=points[Math.min(j+1,points.length-1)].clone().sub(points[Math.max(0,j-1)]).normalize();
      const normal=previous.clone().addScaledVector(tangent,-previous.dot(tangent)).normalize();
      const bitangent=new THREE.Vector3().crossVectors(tangent,normal).normalize();previous=normal;
      for(let k=0;k<=sides;k++){
        const a=k/sides*Math.PI*2,asym=1+0.035*Math.sin(a*3+j*0.17)+0.014*Math.sin(a*7-j*0.31);
        const p=points[j].clone().addScaledVector(normal,Math.cos(a)*radii[j]*asym).addScaledVector(bitangent,Math.sin(a)*radii[j]*asym);
        const treeWeight=ctx.kind==='palmBranch'?1:t;
        const branchS=ctx.kind==='trunk'?0:t;
        vertex(d,p,k/sides,t*uvScale,color,ctx,treeWeight,branchS,0,0,ctx.branchRoot,0,tangent);
      }
    }
    for(let j=0;j<points.length-1;j++)for(let k=0;k<sides;k++){
      const a=start+j*(sides+1)+k,b=a+sides+1;d.i.push(a,b,a+1,a+1,b,b+1);
    }
  }
  function blade(d,root,forward,side,length,halfWidth,droop,curl,color,ctx,{broad=false,flutter=true,age=0,transportNormal=undefined,sectionRoll=0}={}){
    const steps=broad?5:length>1.1?5:4,start=d.p.length/3,up=new THREE.Vector3().crossVectors(side,forward).normalize();
    if(up.y<0)up.negate();
    if(d.sections&&transportNormal!==undefined){
      const result=sectionRotation(THREE,transportNormal,forward,sectionRoll,side,up);
      if(result.valid){
        d.sections.push(start,(steps+1)*3,...result.rotation);palmFrameStats.transportedLeaves++;
        palmFrameStats.maximumRotationOrthogonalityError=Math.max(palmFrameStats.maximumRotationOrthogonalityError,result.error);
        palmFrameStats.maximumDeterminantError=Math.max(palmFrameStats.maximumDeterminantError,Math.abs(result.determinant-1));
      }else palmFrameStats.projectionFallbackLeaves++;
    }
    const uvScale=range(0.84,1),uvOffset=range(0,1-uvScale),edgePhase=range(0,6.28);
    for(let j=0;j<=steps;j++){
      const t=j/steps;
      // Set both tips exactly to zero. sin(pi) is a tiny positive floating
      // value; raising it to .45 used to leave near-zero-area sliver faces.
      const profile=0.98+Math.sin(edgePhase)*0.12;
      const shape=j===0||j===steps?0:broad?Math.pow(Math.sin(Math.PI*Math.pow(t,1.42)),0.63):Math.pow(Math.sin(Math.PI*Math.pow(t,profile)),0.62)*(1-t*0.065);
      const center=root.clone().addScaledVector(forward,length*t).addScaledVector(side,Math.sin(Math.PI*t)*curl);
      center.y-=droop*t*t;
      for(let k=-1;k<=1;k++){
        const irregular=1+Math.sin(t*13+edgePhase+k)*0.025;
        const p=center.clone().addScaledVector(side,k*halfWidth*shape*irregular);
        // A raised geometric midrib and folded blade. Normal maps carry the
        // much smaller veins; they do not substitute for this 3-D ridge.
        const ridge=broad?0.0018:0.0028;
        p.addScaledVector(up,(k===0?ridge:-ridge*0.68)*shape);
        p.addScaledVector(up,Math.sin(t*5+edgePhase)*halfWidth*0.15*k*shape);
        const tint=color.clone().multiplyScalar(0.96+0.06*t+(k===0?0.018:0));
        if(t>0.65&&age>0.1)tint.lerp(new THREE.Color('#9c8749'),age*Math.pow((t-0.65)/0.35,1.5)*0.65);
        vertex(d,p,uvOffset+t*uvScale,(k+1)*0.5,tint,ctx,ctx.treeWeight,ctx.branchS,t,Math.abs(k),root,flutter?length:0,forward);
      }
    }
    for(let j=0;j<steps;j++)for(let k=0;k<2;k++){const a=start+j*3+k;d.i.push(a,a+3,a+1,a+1,a+3,a+4);}
  }

  function makeTexture(bytes,width,height,color=false){
    const tex=new THREE.DataTexture(bytes,width,height,THREE.RGBAFormat,THREE.UnsignedByteType);
    if(color)tex.colorSpace=THREE.SRGBColorSpace;
    tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;
    tex.anisotropy=8;tex.needsUpdate=true;return tex;
  }
  const hash=(x,y,s=0)=>{const n=Math.sin(x*127.1+y*311.7+s*13.17)*43758.5453123;return n-Math.floor(n);};
  function leafMaps(broad){
    const width=broad?512:1024,height=256,size=width*height;
    const albedo=new Uint8Array(size*4),roughness=new Uint8Array(size*4),thickness=new Uint8Array(size*4),normal=new Uint8Array(size*4),heights=new Float32Array(size);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const u=x/(width-1),v=y/(height-1),c=(v-0.5)*2,edge=Math.abs(c),noise=hash(x,y,seed);
      const midrib=Math.exp(-Math.pow(c/(broad?0.035:0.050),2));
      let veins,fine;
      if(broad){
        const coordinate=u*9.4-Math.abs(v-0.5)*3.3+Math.sin(v*17)*0.022;
        const dist=Math.abs(coordinate-Math.round(coordinate));
        veins=Math.exp(-dist*dist/0.0022)*(0.25+0.75*Math.sin(Math.PI*u));
        fine=Math.sin((u*32+v*13)*Math.PI*2)*Math.sin((u*19-v*23)*Math.PI*2)*0.12;
      }else{
        // Coconut pinnae are monocots: secondary veins run almost parallel to
        // the midrib, rather than the conspicuous fishbone pattern of dicots.
        const coordinate=v*24+Math.sin(u*4.8)*0.10;
        const dist=Math.abs(coordinate-Math.round(coordinate));
        veins=Math.exp(-dist*dist/0.012);
        fine=Math.sin(v*157+u*2.1)*0.12;
      }
      const mottling=Math.sin(u*31+Math.sin(v*8))*Math.sin(v*39-u*11)*0.018;
      // Centimetre-scale pigment variation is visible at a normal viewing
      // distance; the much finer vein relief stays at botanical scale.
      const pigment=Math.sin(u*137+Math.sin(v*11))*Math.sin(v*19-u*23);
      const cellU=u*45,cellV=v*8,fu=cellU-Math.floor(cellU)-0.5,fv=cellV-Math.floor(cellV)-0.5;
      const lesion=hash(Math.floor(cellU),Math.floor(cellV),seed+31)>0.94?Math.exp(-(fu*fu/0.030+fv*fv/0.055))*(1-midrib):0;
      const aging=Math.pow(edge,12)*(0.16+0.14*Math.sin(u*27+1.4))+Math.pow(u,15)*0.09;
      const brightness=0.90+noise*0.045+mottling+midrib*0.018+veins*0.012;
      const k=(y*width+x)*4;
      albedo[k]=clamp(Math.round(229*brightness+aging*24+pigment*5+lesion*9),0,255);
      albedo[k+1]=clamp(Math.round(242*brightness-aging*34-pigment*8-lesion*31),0,255);
      albedo[k+2]=clamp(Math.round((broad?205:190)*brightness-aging*53-pigment*12-lesion*44),0,255);albedo[k+3]=255;
      heights[y*width+x]=midrib*0.18+veins*(broad?0.032:0.022)+fine*0.007+(noise-0.5)*0.004;
      const r=Math.round(clamp((broad?0.67:0.76)+noise*0.06+aging*0.18-veins*0.025+pigment*0.055+lesion*0.12,0,1)*255);
      roughness[k]=roughness[k+1]=roughness[k+2]=r;roughness[k+3]=255;
      const thin=Math.round(clamp(0.87-midrib*0.52-veins*0.12-aging*0.25,0,1)*255);
      thickness[k]=thickness[k+1]=thickness[k+2]=thin;thickness[k+3]=255;
    }
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const left=heights[y*width+Math.max(0,x-1)],right=heights[y*width+Math.min(width-1,x+1)];
      const down=heights[Math.max(0,y-1)*width+x],up=heights[Math.min(height-1,y+1)*width+x];
      const nx=(left-right)*5.5,ny=(down-up)*(broad?5.8:6.8),nz=1,inv=1/Math.hypot(nx,ny,nz),k=(y*width+x)*4;
      normal[k]=Math.round((nx*inv*0.5+0.5)*255);normal[k+1]=Math.round((ny*inv*0.5+0.5)*255);normal[k+2]=Math.round((inv*0.5+0.5)*255);normal[k+3]=255;
    }
    return {albedo:makeTexture(albedo,width,height,true),normal:makeTexture(normal,width,height),roughness:makeTexture(roughness,width,height),thickness:makeTexture(thickness,width,height),width,height,
      description:broad?'Obovate coastal leaf: geometric midrib, angled secondary and fine net veins':'Coconut pinna: geometric folded midrib and fine longitudinal parallel veins'};
  }
  function trunkMaps(){
    const width=512,height=1024,size=width*height,albedo=new Uint8Array(size*4),roughness=new Uint8Array(size*4),bump=new Uint8Array(size*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const u=x/width,v=y/height,n=hash(x,y,seed+7);
      const scarPhase=v*17+Math.sin(u*6.283*3+v*19)*0.025;
      const scarDist=Math.abs(scarPhase-Math.round(scarPhase));
      const scar=Math.exp(-scarDist*scarDist/0.00075),lip=Math.exp(-Math.pow((scarDist-0.045)/0.022,2));
      const fibre=Math.sin(u*6.283*93+Math.sin(v*71))*0.025;
      const mottle=Math.sin(u*18+v*31)*Math.sin(u*39-v*14)*0.025;
      const shade=0.85+n*0.15-scar*0.27+lip*0.09+fibre+mottle,k=(y*width+x)*4;
      albedo[k]=Math.round(clamp(185*shade,0,255));albedo[k+1]=Math.round(clamp(181*shade,0,255));albedo[k+2]=Math.round(clamp(164*shade,0,255));albedo[k+3]=255;
      const h=Math.round(clamp(0.5-scar*0.30+lip*0.18+fibre+(n-0.5)*0.09,0,1)*255);
      bump[k]=bump[k+1]=bump[k+2]=h;bump[k+3]=255;
      const r=Math.round(clamp(0.84+n*0.12-scar*0.04,0,1)*255);roughness[k]=roughness[k+1]=roughness[k+2]=r;roughness[k+3]=255;
    }
    const maps={albedo:makeTexture(albedo,width,height,true),bump:makeTexture(bump,width,height),roughness:makeTexture(roughness,width,height),width,height};
    for(const t of [maps.albedo,maps.bump,maps.roughness])t.wrapS=t.wrapT=THREE.RepeatWrapping;
    return maps;
  }
  const palmMaps=leafMaps(false),broadMaps=leafMaps(true),bark=trunkMaps();
  const trunkMaterial=new THREE.MeshStandardMaterial({map:bark.albedo,bumpMap:bark.bump,bumpScale:0.018,roughnessMap:bark.roughness,roughness:1,vertexColors:true});
  const rachisMaterial=new THREE.MeshStandardMaterial({color:'#77853e',roughness:0.83,vertexColors:true});
  const sheathMaterial=new THREE.MeshStandardMaterial({map:bark.albedo,bumpMap:bark.bump,bumpScale:0.007,roughness:0.9,side:THREE.DoubleSide,vertexColors:true});
  const palmMaterial=new THREE.MeshStandardMaterial({map:palmMaps.albedo,normalMap:palmMaps.normal,normalScale:new THREE.Vector2(0.52,0.68),roughnessMap:palmMaps.roughness,roughness:0.9,side:THREE.DoubleSide,vertexColors:true});
  const shrubMaterial=new THREE.MeshStandardMaterial({map:broadMaps.albedo,normalMap:broadMaps.normal,normalScale:new THREE.Vector2(0.54,0.54),roughnessMap:broadMaps.roughness,roughness:0.94,side:THREE.DoubleSide,vertexColors:true});
  const twigMaterial=new THREE.MeshStandardMaterial({color:'#a29873',roughness:0.92,vertexColors:true});
  const windTime={value:0},windStrength={value:1.8},windDirection={value:new THREE.Vector2(0.936,0.352).normalize()};
  const sunDirection={value:V(0.4,0.8,0.4).normalize()},sunColor={value:new THREE.Color(1,1,1)},sunIrradiance={value:3.6},translucencyIntensity={value:1};
  const leafDebug={colour:1,normal:1,roughness:1,specular:1,transmission:1,shadows:1,wind:1,specularAA:1,unlit:0};
  let centroidColour=true;
  const leafDebugUniform={value:new THREE.Vector4(1,1,1,1)},opticsDebugUniform={value:new THREE.Vector3(1,1,0)},windDebug={value:1};
  // Effective optical calibration, not measured specimens. The texture is a
  // relative thinness mask; convert it to metres before Beer absorption.
  const leafAbsorption={value:V(6500,2500,10000)},transmissionBudget={value:0.24};
  const palmThickness={value:0.00024},coastalThickness={value:0.00045};
  // Temporary raster sampling metadata. The lens enables these only while
  // drawing its main HDR target, then restores zero for reflection/shadows.
  // Clip-space jitter changes sample locations, never botanical dimensions.
  const temporalJitter={value:new THREE.Vector2()},temporalTag={value:0};
  const motionCapture={value:0},previousTime={value:0},previousWind={value:1.8},previousDirection={value:new THREE.Vector2(.936,.352).normalize()},previousVP={value:new THREE.Matrix4()};
  const commonUniforms={uGroveTime:windTime,uGroveWindStrength:windStrength,uGroveWindDebug:windDebug,uGroveWindDirection:windDirection,uGroveJitter:temporalJitter,uGroveTemporalTag:temporalTag};
  function windShader(shader,depth=false,maps=null){
    Object.assign(shader.uniforms,commonUniforms);
    shader.vertexShader=vegetationWindGLSL+(depth?'':'\nvarying vec3 vGroveNormal;\nvarying vec2 vGroveUv;\n')+shader.vertexShader;
    if(depth){
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`mat3 groveMotionRotation;vec3 transformed=groveDeform(position,groveMotionRotation);`);
    }else{
      Object.assign(shader.uniforms,{uGroveMotionCapture:motionCapture,uGrovePreviousTime:previousTime,uGrovePreviousWind:previousWind,uGrovePreviousDirection:previousDirection,uGrovePreviousVP:previousVP});
      shader.vertexShader=`uniform vec2 uGroveJitter,uGrovePreviousDirection;
        uniform float uGroveMotionCapture,uGrovePreviousTime,uGrovePreviousWind;
        uniform mat4 uGrovePreviousVP;
        varying vec4 vGroveCurrentClip,vGrovePreviousClip;\n`+shader.vertexShader;
      shader.fragmentShader=`#define GROVE_MOTION_OUTPUT
        uniform float uGroveTemporalTag,uGroveMotionCapture;
        varying vec4 vGroveCurrentClip,vGrovePreviousClip;
        layout(location=1) out vec4 groveMotionOutput;
        layout(location=2) out float groveCurrentDepth;\n`+shader.fragmentShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        // Physical velocity excludes both frames' artificial raster jitter.
        // Static geometry must have zero motion even while sample phase changes.
        vGroveCurrentClip=gl_Position;vGrovePreviousClip=gl_Position;
        if(uGroveMotionCapture>.5){
          mat3 previousRotation;
          vec3 previousPosition=groveDeformAt(position,previousRotation,uGrovePreviousTime,uGrovePreviousWind,uGrovePreviousDirection);
          vGrovePreviousClip=uGrovePreviousVP*modelMatrix*vec4(previousPosition,1.);
        }
        gl_Position.xy+=uGroveJitter*gl_Position.w;`);
      // Opaque RGB remains unblended. In a multisample target this alpha tag
      // resolves to a fractional vegetation coverage signal, not transparency.
      // Keep the override after OPAQUE has written alpha=1 in the stock chunk.
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
        gl_FragColor.a=mix(gl_FragColor.a,0.25,uGroveTemporalTag);
        groveMotionOutput=vec4(0.);groveCurrentDepth=0.;
        if(uGroveMotionCapture>.5&&vGrovePreviousClip.w>.0001&&vGroveCurrentClip.w>.0001){
          vec2 physicalVelocity=(vGroveCurrentClip.xy/vGroveCurrentClip.w-vGrovePreviousClip.xy/vGrovePreviousClip.w)*.5;
          // MSAA resolve averages all four channels. Alpha is motion coverage;
          // divide RGB by alpha in the resolve to recover velocity/previous depth.
          groveMotionOutput=vec4(physicalVelocity,vGrovePreviousClip.w,1.);
          groveCurrentDepth=vGroveCurrentClip.w;
        }`);
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        mat3 groveMotionRotation;vec3 grovePosition=groveDeform(position,groveMotionRotation);
        objectNormal=groveMotionRotation*objectNormal;
        #ifdef USE_TANGENT
          objectTangent=groveMotionRotation*objectTangent;
        #endif
        `);
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`vec3 transformed=grovePosition;
        vGroveNormal=normalize(mat3(modelMatrix)*objectNormal);vGroveUv=uv;`);
      if(maps){
        // MSAA can shade a covered sample with a pixel-centre varying outside
        // a subpixel pinna. Keep positive vertex pigment a convex interpolation
        // of the covered triangle. UV/normal remain smooth for their derivatives.
        if(centroidColour){
          shader.vertexShader=shader.vertexShader.replace('#include <color_pars_vertex>',
            THREE.ShaderChunk.color_pars_vertex.replace(/varying (vec[34]) vColor;/g,'centroid varying $1 vColor;'));
          shader.fragmentShader=shader.fragmentShader.replace('#include <color_pars_fragment>',
            THREE.ShaderChunk.color_pars_fragment.replace(/varying (vec[34]) vColor;/g,'centroid varying $1 vColor;'));
        }
        Object.assign(shader.uniforms,{uGroveSun:sunDirection,uGroveSunColor:sunColor,uGroveSunIrradiance:sunIrradiance,uGroveTranslucency:translucencyIntensity,uGroveThickness:{value:maps.thickness},
          uGroveLeafDebug:leafDebugUniform,uGroveOpticsDebug:opticsDebugUniform,uGroveAbsorption:leafAbsorption,uGroveTransmissionBudget:transmissionBudget,
          uGroveThicknessMetres:maps===palmMaps?palmThickness:coastalThickness});
        shader.fragmentShader=`uniform vec3 uGroveSun,uGroveSunColor,uGroveAbsorption;
          uniform float uGroveTranslucency,uGroveSunIrradiance,uGroveTransmissionBudget,uGroveThicknessMetres;
          uniform highp sampler2D uGroveThickness;
          uniform vec4 uGroveLeafDebug;uniform vec3 uGroveOpticsDebug;
          varying vec3 vGroveNormal;varying vec2 vGroveUv;\n`+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          diffuseColor.rgb=mix(vec3(0.12,0.20,0.05),diffuseColor.rgb,uGroveLeafDebug.x);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <normalmap_pars_fragment>',THREE.ShaderChunk.normalmap_pars_fragment.replace('uniform sampler2D normalMap;','uniform highp sampler2D normalMap;'));
        const mappedNormal=THREE.ShaderChunk.normal_fragment_maps
          .replace('mapN.xy *= normalScale;',`float groveMeanNormalLength2=clamp(dot(mapN,mapN),0.01,1.0);
            // A linear normal mip stores E(n), not a unit normal. Its lost
            // length estimates unresolved angular variance before renormalizing.
            groveMipVariance=(1.0-groveMeanNormalLength2)/max(0.15,groveMeanNormalLength2)
              *0.5*dot(normalScale,normalScale)*uGroveLeafDebug.y*uGroveLeafDebug.y;
            mapN.xy *= normalScale*uGroveLeafDebug.y;`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`float groveMipVariance=0.0;
          ${mappedNormal}
          vec3 groveNormalDetail=normal-nonPerturbedNormal;
          vec3 groveNormalDx=dFdx(groveNormalDetail),groveNormalDy=dFdy(groveNormalDetail);
          float grovePixelVariance=(dot(groveNormalDx,groveNormalDx)+dot(groveNormalDy,groveNormalDy))/12.0;`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          roughnessFactor=mix(roughness,roughnessFactor,uGroveLeafDebug.z);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
          float groveThinness=texture2D(uGroveThickness,vGroveUv).r;
          float groveThickness=uGroveThicknessMetres*mix(2.2,0.65,clamp(groveThinness,0.0,1.0));
          vec3 groveAbsorption=max(uGroveAbsorption,vec3(0.0));
          float groveBudget=clamp(uGroveTransmissionBudget,0.0,0.45);
          vec3 groveNormalTransmission=groveBudget*exp(-groveAbsorption*groveThickness);
          // Conservative channel-wise slab budget: front diffuse reflection
          // reserves the maximum transmission share, rather than adding glow.
          material.diffuseColor*=0.96*(vec3(1.0)-groveNormalTransmission);
          float groveVariance=clamp((groveMipVariance+grovePixelVariance)*uGroveOpticsDebug.y,0.0,0.5);
          float groveAlpha2=pow(material.roughness,4.0);
          material.roughness=min(1.0,pow(groveAlpha2+groveVariance,0.25));`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>','#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>');
        shader.fragmentShader=shader.fragmentShader.replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',`vec3 outgoingLight = totalDiffuse + totalSpecular*uGroveLeafDebug.w + totalEmissiveRadiance;
          float groveNormalLength2=dot(vGroveNormal,vGroveNormal);
          vec3 groveSafeNormal=groveNormalLength2>1e-12?vGroveNormal*inversesqrt(groveNormalLength2):vec3(0.0,1.0,0.0);
          vec3 groveL=normalize(uGroveSun),groveV=inverseTransformDirection(normalize(vViewPosition),viewMatrix);
          float groveNoL=dot(groveSafeNormal,groveL),groveNoV=dot(groveSafeNormal,groveV);
          // Both half-paths cross the slab. Oblique paths absorb more, while
          // clamped cosines bound the approximation at silhouette angles.
          float groveOpticalPath=groveThickness*0.5*(1.0/max(0.20,abs(groveNoL))+1.0/max(0.20,abs(groveNoV)));
          vec3 groveTransmission=groveBudget*exp(-groveAbsorption*groveOpticalPath);
          float groveOpposite=1.0-smoothstep(-0.015,0.015,groveNoL*groveNoV);
          float groveForward=0.30+0.70*pow(max(0.0,dot(groveV,-groveL)),5.0);
          // Keep this exact factor for applyCloudLighting's shared cloud hook.
          float groveSunVisibility=uGroveTranslucency*getShadowMask();
          // Irradiance is explicitly shared with the scene directional light;
          // uGroveTranslucency is now a unit material gain, not another sun scale.
          vec3 groveTransmitted=uGroveSunColor*max(0.0,uGroveSunIrradiance)*groveSunVisibility*0.96*groveTransmission
            *abs(groveNoL)*groveOpposite*groveForward/3.14159265;
          outgoingLight+=groveTransmitted*uGroveOpticsDebug.x;
          outgoingLight=mix(outgoingLight,vec3(0.12,0.20,0.05),uGroveOpticsDebug.z);`);
      }
    }
  }
  for(const material of [trunkMaterial,rachisMaterial,sheathMaterial,palmMaterial,twigMaterial,shrubMaterial]){
    const maps=material===palmMaterial?palmMaps:material===shrubMaterial?broadMaps:null;
    material.onBeforeCompile=shader=>windShader(shader,false,maps);
    material.customProgramCacheKey=()=>`atoll-hierarchical-wind-v7-physical-motion-${maps?maps.width:'wood'}-${maps&&centroidColour?'centroid-colour':'smooth-colour'}`;
  }

  const palmLayout=[
    [-13.5,-6.5,13.8,-0.8,2.1],[-9.0,-8.6,9.2,-0.35,1.1],[-5.0,-6.3,14.6,0.35,1.4],
    [0.7,-7.3,7.8,0.9,2.0],[-16.6,0.2,8.7,-1.7,6.0],[-10.6,-0.8,10.8,-0.55,2.5],
    [-4.5,1.6,6.4,0.3,2.3],[4.1,-3.2,12.1,1.15,3.9],[-1.0,-11.6,10.6,2.7,2.2],
  ];
  for(let index=0;index<palmLayout.length;index++){
    const [x,z,height,leanDir,leanDistance]=palmLayout[index],baseY=safeHeight(x,z)-0.025;
    const treeRoot=V(x,baseY,z),treePhase=range(0,6.28),lean=V(Math.sin(leanDir),0,Math.cos(leanDir)).multiplyScalar(leanDistance);
    const ctx={treeRoot,height,treePhase,branchRoot:treeRoot,branchLength:0,branchAxis:V(1,0,0),branchPhase:0,leafPhase:0,stiffness:1.8,kind:'trunk'};
    const points=[],radii=[],segments=80;
    for(let j=0;j<=segments;j++){
      const t=j/segments,bend=Math.pow(t,1.65);
      points.push(V(x+lean.x*bend+Math.sin(t*4.5+index)*0.13*t,baseY+height*t,z+lean.z*bend+Math.sin(t*Math.PI)*0.16));
      const ring=1+0.015*Math.sin(t*height*35);
      radii.push((0.104+0.052*(1-t)+0.063*Math.exp(-t*15))*ring*(0.94+height/180));
    }
    tube(trunks,points,radii,14,new THREE.Color('#e7e3d2'),ctx,height/3);
    const crown=points[points.length-1],crownPhase=range(0,6.28),frondCount=21+(index%3),deadCount=index%2===0?2:1;
    counts.palms++;treeRecords.push({root:treeRoot.toArray(),height,crown:crown.toArray(),phase:treePhase});
    for(let f=0;f<frondCount;f++){
      const young=f===0,mature=f/(frondCount-1),dead=f>=frondCount-deadCount;
      const az=f*2.39996323+crownPhase+range(-0.18,0.18),forward=V(Math.cos(az),0,Math.sin(az)),lateral=V(-Math.sin(az),0,Math.cos(az));
      // Botanical frond length includes its arch; using all of it as a
      // horizontal radius makes an implausibly sparse, oversized crown.
      const length=range(3.2,4.0)*(0.9+height/100)*(young?0.58:1);
      const rise=young?range(1.8,2.7):range(1.05,2.3)*(1-mature*0.35);
      const drop=young?range(-0.1,0.5):0.75+mature*3.9+range(0,0.4);
      const root=crown.clone().addScaledVector(forward,0.11).add(V(0,0.25-mature*0.5+range(-0.07,0.07),0));
      const twist=range(-0.28,0.28),branchPhase=range(0,6.28);
      const curve=t=>root.clone().addScaledVector(forward,length*t).addScaledVector(lateral,Math.sin(t*Math.PI)*twist)
        .add(V(0,rise*Math.sin(t*Math.PI*0.86)-drop*t*t,0));
      const branchCtx={...ctx,branchRoot:root,branchLength:length,branchAxis:forward,branchPhase,stiffness:young?1.3:dead?0.95:range(0.78,1.03),kind:'palmBranch',treeWeight:1,branchS:0};
      const pts=[],rs=[];
      for(let j=0;j<=23;j++){const t=j/23;pts.push(curve(t));rs.push(0.065*Math.pow(1-t,1.3)+0.0032);}
      tube(rachises,pts,rs,5,new THREE.Color(dead?'#9e8753':'#c3cf86'),branchCtx);
      const sheathRoot=crown.clone().add(V(0,-0.48-mature*0.25,0)),sheathCtx={...branchCtx,branchS:0,leafPhase:branchPhase};
      blade(sheaths,sheathRoot,forward.clone().multiplyScalar(0.64).add(V(0,0.77,0)).normalize(),lateral,range(0.75,1.1),range(0.10,0.17),0.13,0,
        new THREE.Color(mature>0.72?'#a18c59':'#98ac58'),sheathCtx,{broad:true,flutter:false});
      const pairs=80+Math.floor(random()*6),roll=range(-0.55,0.55);
      const frameStamp=performance.now(),transport=createFrondTransport(THREE,curve,lateral);
      palmFrameStats.framePreparationMs+=performance.now()-frameStamp;
      counts.fronds++;if(dead)counts.deadFronds++;
      for(let j=0;j<pairs;j++){
        const t=0.10+j/(pairs-1)*0.89,spread=Math.pow(Math.sin(t*Math.PI),0.67);
        for(let sign=-1;sign<=1;sign+=2){
          if(random()<(dead?0.31:0.025))continue;
          const st=clamp(t+sign*0.003+range(-0.0025,0.0025),0.08,0.998),leafRoot=curve(st);
          const tangent=curve(Math.min(1,st+0.006)).sub(curve(Math.max(0,st-0.006))).normalize();
          const localLateral=lateral.clone().applyAxisAngle(tangent,roll+Math.sin(t*3.1+f)*0.13),localUp=new THREE.Vector3().crossVectors(localLateral,tangent).normalize();
          const direction=localLateral.multiplyScalar(sign*range(0.85,1.06)).addScaledVector(tangent,0.45+t*0.40).addScaledVector(localUp,range(-0.08,0.09)).normalize();
          // Most torsion belongs to the whole frond. Independent ±47-degree
          // rolls made adjacent pinnae read as a woven plastic lattice.
          const sectionRoll=roll*0.42+Math.sin(t*4.3+f*0.31)*0.14+range(-0.15,0.15);
          const cross=new THREE.Vector3().crossVectors(direction,V(0,1,0)).normalize().applyAxisAngle(direction,sectionRoll);
          const leafLength=(0.35+spread*range(0.80,1.22))*(1-t*0.15)*(young?0.72:dead?0.85:1);
          const width=range(0.017,0.025)*(0.77+0.23*spread);
          const color=dead?new THREE.Color('#927b43'):palmColors[Math.floor(random()*palmColors.length)].clone().multiplyScalar(range(0.91,1.12));
          const leafCtx={...branchCtx,branchS:st,leafPhase:range(0,6.28)};
          // The direction already inherits the hanging rachis tangent. A large
          // second downward offset stretched short pinnae into willow-like
          // strands; keep only their smaller local gravitational curvature.
          const transportNormal=transport.normalAt(st,tangent,roll+Math.sin(t*3.1+f)*0.13);
          blade(pinnae,leafRoot,direction,cross,leafLength,width,range(0.10,0.18)+mature*0.08,sign*range(-0.02,0.02),color,leafCtx,{age:dead?0.9:Math.max(0,mature-0.55)*0.65,transportNormal,sectionRoll});
          counts.pinnae++;
        }
      }
    }
    const az=range(0,6.28),spearCtx={...ctx,kind:'palmBranch',branchRoot:crown,branchLength:1.4,branchAxis:V(Math.cos(az),0,Math.sin(az)),branchPhase:range(0,6.28),leafPhase:range(0,6.28),treeWeight:1,branchS:0.5,stiffness:2.3};
    blade(pinnae,crown,V(Math.cos(az)*0.24,1,Math.sin(az)*0.24).normalize(),V(-Math.sin(az),0,Math.cos(az)),range(0.9,1.5),0.022,0.06,0,new THREE.Color('#9daf54'),spearCtx);
  }

  // Correctly scaled, alternate, obovate, terminally crowded coastal foliage.
  // Smaller leaves and a compact branching mass replace the previous broad
  // repeated sheets; no spheres or image billboards stand in for a bush.
  for(let b=0;b<56;b++){
    const a=range(0,Math.PI*2),radius=Math.sqrt(random()),x=-6+Math.cos(a)*radius*8.5,z=-5.7+Math.sin(a)*radius*3.6,y=safeHeight(x,z);
    if(y<0.38)continue;
    const height=range(0.8,2.0)*(0.83+(1-radius)*0.4),treeRoot=V(x,y-0.025,z),treePhase=range(0,6.28);
    counts.shrubs++;
    for(let s=0;s<8;s++){
      const az=range(0,Math.PI*2),reach=range(0.24,0.66),stemRoot=treeRoot.clone().add(V(range(-0.13,0.13),0,range(-0.13,0.13))),axis=V(Math.cos(az),0,Math.sin(az));
      const ctx={treeRoot,height,treePhase,branchRoot:stemRoot,branchLength:height,branchAxis:axis,branchPhase:range(0,6.28),leafPhase:0,stiffness:range(0.78,1.18),kind:'shrubStem'};
      const pts=[],radii=[];for(let j=0;j<=8;j++){const t=j/8;pts.push(stemRoot.clone().addScaledVector(axis,reach*t*t).add(V(0,height*t,0)));radii.push(0.013*Math.pow(1-t,0.9)+0.002);}
      tube(twigs,pts,radii,4,new THREE.Color('#b0a889'),ctx);
      const emitLeaf=(t,leafAz,tip=false)=>{
        const root=stemRoot.clone().addScaledVector(axis,reach*t*t).add(V(0,height*t,0));
        const forward=V(Math.cos(leafAz),range(0.03,0.65),Math.sin(leafAz)).normalize();
        const side=V(-Math.sin(leafAz),0,Math.cos(leafAz)).applyAxisAngle(forward,range(-0.55,0.55));
        const leafCtx={...ctx,treeWeight:t,branchS:t,leafPhase:range(0,6.28)};
        const color=shrubColors[Math.floor(random()*shrubColors.length)].clone().multiplyScalar(range(0.92,1.14));
        blade(scrub,root,forward,side,range(0.21,0.26)*(tip?0.87:1),range(0.040,0.050),range(0.005,0.022),range(-0.007,0.007),color,leafCtx,{broad:true,age:random()<0.08?0.7:0});counts.shrubLeaves++;
      };
      for(let j=0;j<12;j++){const t=clamp(0.18+j*0.063+range(-0.018,0.018),0.1,0.95);emitLeaf(t,az+j*2.399963+range(-0.25,0.25));}
      for(let j=0;j<8;j++)emitLeaf(range(0.84,1),az+j*2.399963+range(-0.2,0.2),true);
    }
  }

  function meshFrom(d,material,name){
    const geometry=new THREE.BufferGeometry();
    const attributes={position:[d.p,3],uv:[d.uv,2],color:[d.c,3],aTreeRoot:[d.tree,4],aBranchRoot:[d.branch,4],aLeafRoot:[d.leaf,4],aBranchAxis:[d.branchAxis,3],aLeafAxis:[d.leafAxis,3],aGroveMotion:[d.motion,4],aGrovePhase:[d.phase,4]};
    for(const [name,[values,size]]of Object.entries(attributes))geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
    // Test the uploaded Float32 positions, not the unquantized JS doubles.
    // Collapsed blade ends previously kept triangles whose normal was zero;
    // rare reflected subpixel fragments then reached an undefined TBN frame.
    const positions=geometry.attributes.position.array,indices=[];
    let removedDegenerateTriangles=0;
    for(let j=0;j<d.i.length;j+=3){
      const ia=d.i[j]*3,ib=d.i[j+1]*3,ic=d.i[j+2]*3;
      const ax=positions[ib]-positions[ia],ay=positions[ib+1]-positions[ia+1],az=positions[ib+2]-positions[ia+2];
      const bx=positions[ic]-positions[ia],by=positions[ic+1]-positions[ia+1],bz=positions[ic+2]-positions[ia+2];
      const cx=ay*bz-az*by,cy=az*bx-ax*bz,cz=ax*by-ay*bx;
      const cross2=cx*cx+cy*cy+cz*cz,edgeProduct=(ax*ax+ay*ay+az*az)*(bx*bx+by*by+bz*bz);
      if(cross2<=Math.max(1e-18,edgeProduct*1e-12)){removedDegenerateTriangles++;continue;}
      indices.push(d.i[j],d.i[j+1],d.i[j+2]);
    }
    geometry.setIndex(indices);geometry.computeVertexNormals();
    const normals=geometry.attributes.normal.array;
    let repairedUnusedNormals=0;
    for(let j=0;j<normals.length;j+=3){
      const l2=normals[j]*normals[j]+normals[j+1]*normals[j+1]+normals[j+2]*normals[j+2];
      if(!(l2>1e-12)){normals[j]=0;normals[j+1]=1;normals[j+2]=0;repairedUnusedNormals++;}
    }
    // Offline UV tangents replace dFdx/dFdy tangent-frame reconstruction on
    // tiny, nearly edge-on reflected leaflets. Three preserves tangent.w.
    geometry.computeTangents();
    const tangent=geometry.attributes.tangent.array,leafAxes=geometry.attributes.aLeafAxis.array;
    let repairedUnusedTangents=0;
    for(let j=0,k=0;j<tangent.length;j+=4,k+=3){
      const nx=normals[k],ny=normals[k+1],nz=normals[k+2];
      let tx=tangent[j],ty=tangent[j+1],tz=tangent[j+2],dot=tx*nx+ty*ny+tz*nz;
      tx-=dot*nx;ty-=dot*ny;tz-=dot*nz;
      let l2=tx*tx+ty*ty+tz*tz;
      if(!(l2>1e-12)||!Number.isFinite(l2)){
        tx=leafAxes[k];ty=leafAxes[k+1];tz=leafAxes[k+2];dot=tx*nx+ty*ny+tz*nz;
        tx-=dot*nx;ty-=dot*ny;tz-=dot*nz;l2=tx*tx+ty*ty+tz*tz;
        if(!(l2>1e-12)){if(Math.abs(ny)<0.9){tx=-nz;ty=0;tz=nx;}else{tx=0;ty=nz;tz=-ny;}l2=tx*tx+ty*ty+tz*tz;}
        repairedUnusedTangents++;
      }
      const inv=1/Math.sqrt(l2);tangent[j]=tx*inv;tangent[j+1]=ty*inv;tangent[j+2]=tz*inv;
      tangent[j+3]=tangent[j+3]<0?-1:1;
    }
    geometry.attributes.normal.needsUpdate=true;geometry.attributes.tangent.needsUpdate=true;geometry.computeBoundingSphere();
    geometry.userData.frameValidation={removedDegenerateTriangles,repairedUnusedNormals,repairedUnusedTangents};
    // Include the maximum bounded wind displacement in CPU culling bounds.
    geometry.boundingSphere.radius+=2.2;
    ownedGeometries.push(geometry);
    if(d.sections){
      const buildStamp=performance.now(),candidatePositions=rotatePinnaEdges(positions,d.sections);
      Object.assign(palmFrameStats,fallbackDegeneratePinnae(candidatePositions,positions,geometry.index.array,d.sections));
      const candidate=new THREE.BufferGeometry();
      for(const [key,attribute]of Object.entries(geometry.attributes))if(!['position','normal','tangent'].includes(key))candidate.setAttribute(key,attribute);
      candidate.setAttribute('position',new THREE.BufferAttribute(candidatePositions,3));candidate.setIndex(geometry.index);
      completePalmGeometryFrame(candidate,removedDegenerateTriangles);geometry.computeBoundingBox();
      candidate.userData.palmFrameMode='transport';geometry.userData.palmFrameMode='legacy';
      palmVariants.legacy=geometry;palmVariants.transport=candidate;ownedGeometries.push(candidate);
      palmFrameStats.extraRetainedBytes=candidate.attributes.position.array.byteLength+candidate.attributes.normal.array.byteLength+candidate.attributes.tangent.array.byteLength;
      palmFrameStats.transientSectionRecordsBytes=d.sections.length*8;
      palmFrameStats.geometryBuildMs=performance.now()-buildStamp;d.sections=null;
    }
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;
    const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
    depth.onBeforeCompile=shader=>windShader(shader,true);depth.customProgramCacheKey=()=>`atoll-hierarchical-wind-depth-v5-shared-debug`;
    mesh.customDepthMaterial=depth;group.add(mesh);return mesh;
  }
  meshFrom(trunks,trunkMaterial,'Aged curved coconut trunks');meshFrom(rachises,rachisMaterial,'Arched palm rachises');
  meshFrom(sheaths,sheathMaterial,'Overlapping fibrous crown sheaths');palmFrameMesh=meshFrom(pinnae,palmMaterial,'Folded coconut pinnae');
  meshFrom(twigs,twigMaterial,'Coastal scrub branches');meshFrom(scrub,shrubMaterial,'Veined alternate coastal leaves');
  const textures=[palmMaps.albedo,palmMaps.normal,palmMaps.roughness,palmMaps.thickness,broadMaps.albedo,broadMaps.normal,broadMaps.roughness,broadMaps.thickness,bark.albedo,bark.bump,bark.roughness];
  const triangleCount=group.children.reduce((sum,m)=>sum+m.geometry.index.count/3,0);
  const geometryBytes=group.children.reduce((sum,m)=>sum+Object.values(m.geometry.attributes).reduce((s,a)=>s+a.array.byteLength,0)+m.geometry.index.array.byteLength,0);
  const initializationMs=performance.now()-started;
  function setLeafDebug(patch={}){
    for(const key of Object.keys(leafDebug))if(key in patch&&Number.isFinite(Number(patch[key])))leafDebug[key]=clamp(Number(patch[key]),0,1);
    leafDebugUniform.value.set(leafDebug.colour,leafDebug.normal,leafDebug.roughness,leafDebug.specular);
    opticsDebugUniform.value.set(leafDebug.transmission,leafDebug.specularAA,leafDebug.unlit);windDebug.value=leafDebug.wind;
    for(const mesh of group.children)if(mesh.material===palmMaterial||mesh.material===shrubMaterial)mesh.receiveShadow=leafDebug.shadows>=0.5;
    return {...leafDebug};
  }
  function inspectLeafMips(renderer){
    const gl=renderer.getContext(),binding=gl.getParameter(gl.TEXTURE_BINDING_2D),active=gl.getParameter(gl.ACTIVE_TEXTURE),rows=[];
    const aniso=gl.getExtension('EXT_texture_filter_anisotropic');
    try{
      for(const [species,maps]of [['palm',palmMaps],['coastal',broadMaps]])for(const name of ['albedo','normal','roughness','thickness']){
        const texture=maps[name],native=renderer.properties.get(texture).__webglTexture,expected=Math.floor(Math.log2(Math.max(maps.width,maps.height)))+1;
        const row={species,map:name,uploaded:!!native,requestedMipmaps:texture.generateMipmaps,expectedLevels:expected,width:maps.width,height:maps.height,colourSpace:texture.colorSpace};
        if(native){
          gl.bindTexture(gl.TEXTURE_2D,native);
          row.allocatedLevels=gl.TEXTURE_IMMUTABLE_LEVELS!==undefined?gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_IMMUTABLE_LEVELS):null;
          row.minFilter=gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER);row.magFilter=gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER);
          row.trilinear=row.minFilter===gl.LINEAR_MIPMAP_LINEAR;
          row.anisotropy=aniso?gl.getTexParameter(gl.TEXTURE_2D,aniso.TEXTURE_MAX_ANISOTROPY_EXT):null;
          row.fullImmutableChain=row.allocatedLevels===expected;
        }
        rows.push(row);
      }
    }finally{gl.bindTexture(gl.TEXTURE_2D,binding);gl.activeTexture(active);}
    return {maps:rows,allUploaded:rows.every(r=>r.uploaded),allTrilinear:rows.every(r=>r.trilinear),allFullImmutableChains:rows.every(r=>r.fullImmutableChain),note:'Read actual existing GL allocation/filter state; does not upload textures or change rendering. Texture mips cannot resolve a moving subpixel mesh silhouette.'};
  }
  group.userData={
    version:'vegetation-v6-thin-leaf-optics',palmCount:counts.palms,triangleCount,geometryBytes,counts,sunDirection,sunColor,sunIrradiance,translucencyIntensity,windStrength,windDirection,
    temporalAA:{jitter:temporalJitter,active:temporalTag,time:windTime,wind:windStrength,debugWind:windDebug,
      motion:{capture:motionCapture,previousTime,previousWind,previousDirection,previousVP,direction:windDirection},
      description:'Selective raster jitter plus optional exact previous analytic wind pose; motion excludes sample jitter; geometry and shadow topology unchanged'},
    update:time=>{if(Number.isFinite(time))windTime.value=time;},
    setWind:speed=>{if(Number.isFinite(speed))windStrength.value=clamp(speed,0,5);},
    setLeafDebug,inspectLeafMips,
    setPalmFrameMode(mode){
      if(!['legacy','transport'].includes(mode))throw new RangeError('Palm frame mode must be legacy or transport');
      const changed=mode!==palmFrameMode;palmFrameMode=mode;palmFrameStats.mode=mode;palmFrameMesh.geometry=palmVariants[mode];
      return {mode,changed,resetRequired:changed?['temporal history','directional shadow/bounds','GI geometry source before a full lighting comparison']:[]};
    },
    get palmFrameMode(){return palmFrameMode;},
    palmFrameDiagnostics:()=>({...palmFrameStats,scope:'B0 cross-section only, fixed uploaded midrib and all wind attributes; no additional distal roll'}),
    // QA-only switch: compare both interpolation rules at an identical paused
    // physical time/camera/environment; no geometry or other varying changes.
    setCentroidColour(enabled){const next=Boolean(enabled);if(next!==centroidColour){centroidColour=next;palmMaterial.needsUpdate=true;shrubMaterial.needsUpdate=true;}return centroidColour;},
    get centroidColour(){return centroidColour;},
    leafOptics:{absorptionPerMetre:leafAbsorption,transmissionBudget,palmThicknessMetres:palmThickness,coastalThicknessMetres:coastalThickness,
      calibration:'authored effective optical thickness/absorption, not measured specimens; conservative two-sided slab approximation'},
    proceduralTextures:{palm:palmMaps,coastalLeaf:broadMaps,trunk:bark},treeRecords,
    diagnostics:()=>({version:'vegetation-v6-thin-leaf-optics',counts,meshes:group.children.length,triangleCount,geometryBytes,palmFrames:{...palmFrameStats},geometryBytesIncludingPalmVariants:geometryBytes+palmFrameStats.extraRetainedBytes,
      maximumVertexAttributes:Math.max(...group.children.map(m=>Object.keys(m.geometry.attributes).length)),
      windMetresPerSecond:windStrength.value,windDirection:windDirection.value.toArray(),timeSeconds:windTime.value,
      motion:'anchored quadratic trunk flex, coherent travelling gust, delayed frond bending, independent tip flutter; same GLSL and uniforms in normals and depth',
      botanicalScale:{palmPinnaWidthMetres:[0.026,0.050],palmPinnaPairsPerFrond:[80,85],coastalLeafLengthMetres:[0.183,0.26],coastalLeafWidthMetres:[0.080,0.100]},
      maps:{palm:[palmMaps.width,palmMaps.height],coastalLeaf:[broadMaps.width,broadMaps.height],trunk:[bark.width,bark.height]},
      leafOptics:{centroidColour,sunIrradiance:sunIrradiance.value,transmissionGain:translucencyIntensity.value,baseThicknessMetres:{palm:palmThickness.value,coastal:coastalThickness.value},absorptionPerMetre:leafAbsorption.value.toArray(),transmissionBudget:transmissionBudget.value,forwardPower:5,debug:{...leafDebug},normalVariance:'filtered normal mean-length loss plus pixel perturbation variance; GGX alpha-squared domain'},
      frames:group.children.map(mesh=>({mesh:mesh.name,...mesh.geometry.userData.frameValidation})),
      initializationMs,limits:['Phenomenological wind response, not a mechanical elasticity solve','Generated botanical textures, not a scan','Vertex-normal rotations approximate the deformation gradient']
    }),
    dispose:()=>{for(const geometry of ownedGeometries)geometry.dispose();for(const mesh of group.children){mesh.material.dispose();mesh.customDepthMaterial.dispose();}for(const t of textures)t.dispose();}
  };
  return group;
}
