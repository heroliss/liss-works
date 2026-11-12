import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createSpatialUpscaler } from './upscaler.js';
import { createVegetationMotionCapture,upgradeVegetationTemporalGLSL } from './vegetation-motion.js';
import { createOpticalBloom } from './optical-bloom.js';
import {validateDisplayTransformAdapter,renderDisplayTransformAdapter,displayTransformDiagnostic} from './hdr-output.js';

// Full-frame focal geometry. Exposure compensation is relative to the scene's
// calibrated exposure, not a claim of absolute photographic lux/ISO calibration.
export function circleOfConfusion({focalMm,aperture,focusMetres,distanceMetres,sensorHeightMm,pixels}) {
  const focus=Math.max(focalMm+1,focusMetres*1000),distance=Math.max(focalMm+1,distanceMetres*1000);
  const diameter=Math.abs(focalMm*focalMm*(distance-focus)/(aperture*distance*(focus-focalMm)));
  return diameter/sensorHeightMm*pixels;
}

// An eight-position pixel footprint, applied only to vegetation clip positions.
// The camera projection/FOV and all water/reflection cameras remain unchanged.
export function temporalJitterSample(index) {
  const radical=(n,base)=>{let value=0,fraction=1/base;while(n>0){value+=(n%base)*fraction;n=Math.floor(n/base);fraction/=base;}return value;};
  const n=((index%8)+8)%8+1;
  // Centre the finite cycle itself, rather than the infinite Halton sequence.
  // This prevents a small permanent silhouette offset after accumulation.
  return [radical(n,2)-.4453125,radical(n,3)-.5];
}

// Original, selective temporal reconstruction. Primary algorithm references:
// https://github.com/playdeadgames/temporal (history validation / clipping)
// https://research.nvidia.com/labs/rtr/publication/yang2020survey/
// This is camera-depth reprojection, not object-motion-vector TAA or TAAU.
export const selectiveTemporalGLSL=upgradeVegetationTemporalGLSL(/* glsl */`
  uniform sampler2D tCurrent,tCurrentDepth,tHistory,tHistoryMetadata;
  uniform vec2 uSize;
  uniform mat4 uInverseCurrentVP,uPreviousVP,uPreviousView;
  uniform float uNear,uFar,uHistoryValid,uHistoryWeight,uWind,uMotionDelta,uProjectionScale,uVegetationEnabled,uWaterEnabled;
  uniform sampler2D tReactive;
  uniform float uReactiveEnabled,uHistoryExposureRatio;
  varying vec2 vUv;
  // A separate normalized R8 attachment: 0 invalid, 1 fresh, 2/3 one/two
  // missing samples. Depth remains a full half-float channel, without packing.
  layout(location=1) out vec4 temporalMetadata;
  bool waterTag(vec4 colour){return abs(colour.a-.70)<.012;}
  float coverage(vec4 colour){return waterTag(colour)?0.:clamp((1.-colour.a)/.75,0.,1.);}
  float linearDepth(float depth){return uNear*uFar/(uFar-(uFar-uNear)*depth);}
  void outputTemporal(vec3 colour,float depth,float age){gl_FragColor=vec4(colour,depth);temporalMetadata=vec4(age/255.,0.,0.,1.);}
  vec2 texelCentre(vec2 uv){return(clamp(floor(uv*uSize),vec2(0),uSize-1.)+.5)/uSize;}
  bool previousSample(vec2 uv,float expected,out vec4 colour,out float age){
    // RGB reconstruction is bilinear. Validity/depth must not interpolate a
    // valid foreground depth with the invalid zero-depth outside its support.
    colour=textureLod(tHistory,uv,0.);colour.rgb*=uHistoryExposureRatio>0.?uHistoryExposureRatio:1.;age=0.;float best=1e20;
    vec2 base=floor(uv*uSize-.5);
    for(int y=0;y<2;y++)for(int x=0;x<2;x++){
      vec2 q=(clamp(base+vec2(float(x),float(y)),vec2(0),uSize-1.)+.5)/uSize;
      float a=floor(textureLod(tHistoryMetadata,q,0.).r*255.+.5);
      float d=textureLod(tHistory,q,0.).a,error=abs(d-expected);
      if(a>=1.&&a<=3.&&d>0.&&error<max(.10,expected*.015)&&error<best){best=error;age=a;}
    }
    return age>0.;
  }
  vec3 toYCoCg(vec3 c){return vec3(dot(c,vec3(.25,.5,.25)),(c.r-c.b)*.5,(-c.r+2.*c.g-c.b)*.25);}
  vec3 fromYCoCg(vec3 c){return vec3(c.x+c.y-c.z,c.x+c.z,c.x-c.y-c.z);}
  void main(){
    vec2 pixel=1./uSize;
    vec4 current=textureLod(tCurrent,vUv,0.);
    if(uReactiveEnabled>.5&&textureLod(tReactive,vUv,0.).r>.001){outputTemporal(current.rgb,0.,0.);return;}
    // Water has its own exact HDR alpha tag (opaque surface, not blending).
    // Its short history filters radiance from glints, reflected detail and
    // caustics. Wave geometry/time are never averaged or slowed down.
    if(waterTag(current)){
      if(uWaterEnabled<.5){outputTemporal(current.rgb,0.,0.);return;}
      float rawDepth=textureLod(tCurrentDepth,vUv,0.).r,depth=linearDepth(rawDepth);
      if(uHistoryValid<.5){outputTemporal(current.rgb,depth,16.);return;}
      vec4 world=uInverseCurrentVP*vec4(vUv*2.-1.,rawDepth*2.-1.,1.);world/=max(world.w,1e-8);
      vec4 clip=uPreviousVP*world;vec2 previousUV=clip.xy/max(clip.w,1e-8)*.5+.5;
      if(clip.w<=0.||any(lessThan(previousUV,pixel*.5))||any(greaterThan(previousUV,1.-pixel*.5))){outputTemporal(current.rgb,depth,16.);return;}
      // Validate each bilinear tap independently. A single valid nearest tap
      // must not authorize colour from a neighbouring palm or dry shoreline.
      vec2 samplePosition=previousUV*uSize-.5,base=floor(samplePosition),fraction=fract(samplePosition);
      vec3 oldColour=vec3(0.);float oldWeight=0.,expected=-(uPreviousView*world).z;
      for(int y=0;y<2;y++)for(int x=0;x<2;x++){
        vec2 q=(clamp(base+vec2(float(x),float(y)),vec2(0),uSize-1.)+.5)/uSize;
        float age=floor(textureLod(tHistoryMetadata,q,0.).r*255.+.5);
        vec4 sampleColour=textureLod(tHistory,q,0.);
        sampleColour.rgb*=uHistoryExposureRatio>0.?uHistoryExposureRatio:1.;
        float w=(x==0?1.-fraction.x:fraction.x)*(y==0?1.-fraction.y:fraction.y);
        if(age==16.&&abs(sampleColour.a-expected)<=max(.15,expected*.012)){oldColour+=sampleColour.rgb*w;oldWeight+=w;}
      }
      if(oldWeight<.5){outputTemporal(current.rgb,depth,16.);return;}
      oldColour/=oldWeight;
      // Do not clip old water radiance to the current spatial neighbourhood:
      // an isolated solar glint legitimately vanishes between frames. Such a
      // clip discards its temporal tail and systematically darkens the mean.
      vec3 history=oldColour;
      float cameraMotion=length((previousUV-vUv)*uSize);
      float weight=min(.78,exp(-max(uMotionDelta,1./144.)/.025))*exp(-cameraMotion*.16);
      outputTemporal(mix(current.rgb,history,weight),depth,16.);return;
    }
    if(uVegetationEnabled<.5){outputTemporal(current.rgb,0.,0.);return;}
    float mask=coverage(current);
    mask=max(mask,coverage(textureLod(tCurrent,vUv+vec2(pixel.x,0),0.)));
    mask=max(mask,coverage(textureLod(tCurrent,vUv-vec2(pixel.x,0),0.)));
    mask=max(mask,coverage(textureLod(tCurrent,vUv+vec2(0,pixel.y),0.)));
    mask=max(mask,coverage(textureLod(tCurrent,vUv-vec2(0,pixel.y),0.)));
    if(mask<.012){
      // A genuinely untagged region still bypasses history. Only support from
      // the same previous pixel may seed a two-frame missing-coverage bridge.
      if(uHistoryValid<.5){outputTemporal(current.rgb,0.,0.);return;}
      vec2 seedUV=texelCentre(vUv);
      float seedAge=floor(textureLod(tHistoryMetadata,seedUV,0.).r*255.+.5);
      if(seedAge<1.||seedAge>=3.){outputTemporal(current.rgb,0.,0.);return;}
      float seedDepth=textureLod(tHistory,seedUV,0.).a;
      if(seedDepth<=0.){outputTemporal(current.rgb,0.,0.);return;}
      float guessedDepth=(uFar-uNear*uFar/seedDepth)/(uFar-uNear);
      vec4 world=uInverseCurrentVP*vec4(vUv*2.-1.,guessedDepth*2.-1.,1.);world/=max(1e-8,world.w);
      vec4 clip=uPreviousVP*world;
      vec2 previousUV=clip.xy/max(clip.w,1e-8)*.5+.5;
      float cameraMotion=length((previousUV-vUv)*uSize);
      float currentDepth=linearDepth(textureLod(tCurrentDepth,vUv,0.).r);
      if(clip.w<=0.||cameraMotion>1.25||currentDepth+max(.10,seedDepth*.015)<seedDepth||any(lessThan(previousUV,pixel*.5))||any(greaterThan(previousUV,1.-pixel*.5))){outputTemporal(current.rgb,0.,0.);return;}
      vec4 previous;float age;
      if(!previousSample(previousUV,-(uPreviousView*world).z,previous,age)||age>=3.){outputTemporal(current.rgb,0.,0.);return;}
      float speed=.10+.20*uWind+.03*uWind*uWind;
      float windPixels=speed*uMotionDelta*uProjectionScale/max(seedDepth,.3);
      float bridge=min(.72,uHistoryWeight)/age*exp(-cameraMotion*1.8)*exp(-windPixels*windPixels*4.);
      outputTemporal(mix(current.rgb,previous.rgb,bridge),seedDepth,age+1.);return;
    }
    vec3 lo=vec3(1e20),hi=vec3(-1e20),mean=vec3(0),moment=vec3(0);
    float taggedDepth=1.;
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
      vec2 uv=clamp(vUv+vec2(float(x),float(y))*pixel,pixel*.5,1.-pixel*.5);
      vec4 sampleColour=textureLod(tCurrent,uv,0.);
      vec3 c=toYCoCg(sampleColour.rgb);
      lo=min(lo,c);hi=max(hi,c);mean+=c;moment+=c*c;
      if(coverage(sampleColour)>.012)taggedDepth=min(taggedDepth,textureLod(tCurrentDepth,uv,0.).r);
    }
    float depth=linearDepth(taggedDepth);
    if(uHistoryValid<.5){outputTemporal(current.rgb,depth,1.);return;}
    // Depth dilation uses only tagged vegetation samples. MSAA depth resolve
    // may select a background sample on a thin silhouette; the neighbouring
    // foreground depth supplies a conservative camera reprojection anchor.
    vec4 world=uInverseCurrentVP*vec4(vUv*2.-1.,taggedDepth*2.-1.,1.);
    world/=max(1e-8,world.w);
    vec4 previousClip=uPreviousVP*world;
    vec2 previousUV=previousClip.xy/max(previousClip.w,1e-8)*.5+.5;
    if(previousClip.w<=0.||any(lessThan(previousUV,pixel*.5))||any(greaterThan(previousUV,1.-pixel*.5))){outputTemporal(current.rgb,depth,1.);return;}
    vec4 history;float historyAge;
    float expectedDepth=-(uPreviousView*world).z;
    if(!previousSample(previousUV,expectedDepth,history,historyAge)){outputTemporal(current.rgb,depth,1.);return;}
    mean/=9.;moment/=9.;
    vec3 sigma=sqrt(max(moment-mean*mean,vec3(0)));
    lo=max(lo,mean-sigma*1.35);hi=min(hi,mean+sigma*1.35);
    vec3 historyY=toYCoCg(history.rgb);
    vec3 boxCenter=(lo+hi)*.5,boxExtent=max((hi-lo)*.5,vec3(1e-5));
    vec3 offset=historyY-boxCenter;
    vec3 ratios=abs(offset)/boxExtent;
    vec3 clipped=boxCenter+offset/max(1.,max(ratios.x,max(ratios.y,ratios.z)));
    float rectification=length(historyY-clipped)/(length(historyY)+length(clipped)+.05);
    float cameraMotion=length((previousUV-vUv)*uSize);
    float worldSpeed=.10+.20*uWind+.03*uWind*uWind;
    float windPixels=worldSpeed*uMotionDelta*uProjectionScale/max(depth,.3);
    float weight=uHistoryWeight*exp(-rectification*8.)*exp(-cameraMotion*.055)*exp(-windPixels*windPixels*4.);
    weight*=1.-smoothstep(18.,42.,cameraMotion);
    vec3 result=mix(current.rgb,fromYCoCg(clipped),clamp(weight,0.,.9));
    outputTemporal(result,depth,1.);
  }
`);

export function createLens(renderer,camera) {
  const gl=renderer.getContext();gl.getExtension('EXT_color_buffer_float');
  const sampleSupport=[gl.RGBA16F,gl.R16F,gl.R8,gl.DEPTH_COMPONENT24].map(format=>Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,format,gl.SAMPLES)||[]));
  const commonSamples=sampleSupport[0].filter(n=>sampleSupport.every(list=>list.includes(n)));
  const maxSamples=Math.max(0,...commonSamples);
  const sceneTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:Math.min(8,maxSamples),depthBuffer:true,count:4});
  sceneTarget.texture.name='Linear HDR scene, physical depth and MSAA';
  const motionTexture=sceneTarget.textures[1];motionTexture.name='Analytic foliage motion and coverage';motionTexture.minFilter=motionTexture.magFilter=THREE.NearestFilter;motionTexture.generateMipmaps=false;
  const vegetationDepth=sceneTarget.textures[2];vegetationDepth.name='Covered current foliage depth';vegetationDepth.type=THREE.HalfFloatType;vegetationDepth.format=THREE.RedFormat;vegetationDepth.internalFormat='R16F';vegetationDepth.minFilter=vegetationDepth.magFilter=THREE.NearestFilter;vegetationDepth.generateMipmaps=false;
  const reactiveTexture=sceneTarget.textures[3];reactiveTexture.name='Fast local lighting and reflection response';reactiveTexture.type=THREE.UnsignedByteType;reactiveTexture.format=THREE.RedFormat;reactiveTexture.internalFormat='R8';reactiveTexture.minFilter=reactiveTexture.magFilter=THREE.NearestFilter;reactiveTexture.generateMipmaps=false;
  const motionCapture=createVegetationMotionCapture(THREE);let requestedMotion=true;
  sceneTarget.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const lensTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  const antialiasTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  const encodedTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.UnsignedByteType,depthBuffer:false,colorSpace:THREE.NoColorSpace});
  const upscaler=createSpatialUpscaler(THREE,renderer,{sharpnessStops:1});
  const bloom=createOpticalBloom(THREE,renderer,{quality:'gaussian'});
  let hdrOutput=null;
  let displayTransform=null,displayTransformStatus={kind:'sdr',requested:false,effective:'legacy',reason:'disabled',error:null};
  let upscalerReady=false;
  const ready=upscaler.ready.then(value=>{upscalerReady=value;return value;});
  const smaa=new SMAAPass(),output=new OutputPass();output.renderToScreen=true;
  // SDR output is quantized to 8 bits; large smooth sky gradients then show
  // one-code-value bands. A static triangular-PDF dither of +-1 LSB, applied
  // after tone mapping and sRGB encoding, removes the banding without a mean
  // shift. Exact black stays black. The HDR float output does not use this pass.
  {
    const end=output.material.fragmentShader.lastIndexOf('}');
    output.material.fragmentShader=output.material.fragmentShader.slice(0,end)+`
      // Hash without sin() or a lattice (static IGN shows diagonal structure);
      // one shared amplitude keeps hue, and it fades out below one code value
      // so near-black is neither lifted nor tinted by clipped negative noise.
      vec3 ditherP=fract(vec3(floor(gl_FragCoord.xyx))*vec3(.1031,.1030,.0973));
      ditherP+=dot(ditherP,ditherP.yzx+33.33);
      float ditherA=fract((ditherP.x+ditherP.y)*ditherP.z),ditherB=fract((ditherP.x+ditherP.z)*ditherP.y);
      float ditherPeak=max(max(gl_FragColor.r,gl_FragColor.g),gl_FragColor.b);
      gl_FragColor.rgb+=clamp(ditherPeak*255.,0.,1.)*(ditherA+ditherB-1.)/255.;
    }`;
  }
  const temporalTargets=[0,1].map(i=>{
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false,count:2});
    target.texture.name='Selective vegetation HDR history '+i;
    const metadata=target.textures[1];metadata.name='Vegetation bounded missing-coverage age '+i;
    metadata.type=THREE.UnsignedByteType;metadata.format=THREE.RedFormat;metadata.internalFormat='R8';metadata.minFilter=metadata.magFilter=THREE.NearestFilter;
    return target;
  });
  const temporalUniforms={tReactive:{value:reactiveTexture},uReactiveEnabled:{value:1},uHistoryExposureRatio:{value:1},tVegetationDepth:{value:vegetationDepth},tVegetationMotion:{value:motionTexture},uVegetationMotionEnabled:{value:1},tCurrent:{value:sceneTarget.texture},tCurrentDepth:{value:sceneTarget.depthTexture},tHistory:{value:temporalTargets[1].texture},tHistoryMetadata:{value:temporalTargets[1].textures[1]},
    uSize:{value:new THREE.Vector2(1,1)},uInverseCurrentVP:{value:new THREE.Matrix4()},uPreviousVP:{value:new THREE.Matrix4()},uPreviousView:{value:new THREE.Matrix4()},
    uNear:{value:camera.near},uFar:{value:camera.far},uHistoryValid:{value:0},uHistoryWeight:{value:.84},uWind:{value:0},uMotionDelta:{value:0},uProjectionScale:{value:1},uVegetationEnabled:{value:1},uWaterEnabled:{value:1}};
  const temporalMaterial=new THREE.ShaderMaterial({name:'Selective vegetation camera reprojection and variance clipping',uniforms:temporalUniforms,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:selectiveTemporalGLSL});
  const temporalQuad=new FullScreenQuad(temporalMaterial),currentVP=new THREE.Matrix4(),lastPosition=new THREE.Vector3(),lastQuaternion=new THREE.Quaternion();
  let aerialPerspective=null;
  let useJitter=false,useTemporal=true,useWaterTemporal=true,historyValid=false,historyFrames=0,historyIndex=0,jitterIndex=0,lastAnimationTime=null,lastResetReason='initial',lastSettings=null,temporalScene=null,temporalGroups=[];
  let lastJitter=[0,0];
  let stillFrames=0,storageEV=0,historyEV=0,dynamicLighting=false,effectsRenderer=null,requestedSamples=null,effectsShutterSeconds=1/120;
  function resetTemporalHistory(reason='explicit'){motionCapture.reset();historyValid=false;historyFrames=0;historyIndex=0;jitterIndex=0;lastAnimationTime=null;lastResetReason=reason;stillFrames=0;}
  function findTemporalGroups(scene){
    if(temporalScene!==scene||temporalGroups.length===0){temporalGroups=[];scene.traverse(object=>{if(object.userData?.temporalAA?.jitter)temporalGroups.push(object.userData.temporalAA);});temporalScene=scene;}
    return temporalGroups;
  }
  const uniforms={
    tScene:{value:sceneTarget.texture},tDepth:{value:sceneTarget.depthTexture},
    uResolution:{value:new THREE.Vector2(1,1)},uNear:{value:camera.near},uFar:{value:camera.far},
    uFocal:{value:28},uAperture:{value:8},uFocus:{value:80},uSensorHeight:{value:24},
    uDof:{value:0},uVignette:{value:1}
  };
  const material=new THREE.ShaderMaterial({name:'Thin lens and restrained optical falloff',uniforms,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:/* glsl */`
      uniform sampler2D tScene,tDepth;
      uniform vec2 uResolution;
      uniform float uNear,uFar,uFocal,uAperture,uFocus,uSensorHeight,uDof,uVignette;
      varying vec2 vUv;
      float viewDistance(vec2 uv){float z=texture2D(tDepth,uv).x;return uNear*uFar/(uFar-(uFar-uNear)*z);}
      float cocPixels(float distance){
        float f=uFocal,focus=max(f+1.,uFocus*1000.),s=max(f+1.,distance*1000.);
        return abs(f*f*(s-focus)/(uAperture*s*(focus-f)))/uSensorHeight*uResolution.y;
      }
      void main(){
        float depth=viewDistance(vUv);
        vec3 colour=texture2D(tScene,vUv).rgb;
        float radius=min(24.,cocPixels(depth)*.5)*uDof;
        if(radius>.42){
          vec3 sum=colour;float weight=1.;
          for(int i=0;i<24;i++){
            float fi=float(i)+.5,angle=fi*2.39996323;
            vec2 offset=vec2(cos(angle),sin(angle))*sqrt(fi/24.)*radius/uResolution;
            vec2 q=clamp(vUv+offset,vec2(.00001),vec2(.99999));
            float otherDepth=viewDistance(q),otherCoc=cocPixels(otherDepth)*.5;
            // Foreground/background rejection reduces bright silhouette bleeding.
            float valid=1.-smoothstep(max(.12,depth*.015),max(.4,depth*.07),abs(otherDepth-depth));
            valid=max(valid,step(length(offset*uResolution),otherCoc)*.14);
            sum+=texture2D(tScene,q).rgb*valid;weight+=valid;
          }
          colour=sum/weight;
        }
        vec2 sensor=(vUv-.5)*vec2(uSensorHeight*uResolution.x/uResolution.y,uSensorHeight);
        float cos4=pow(inversesqrt(1.+dot(sensor,sensor)/(uFocal*uFocal)),4.);
        // Real corrected lenses have less falloff than an uncorrected cos^4 lens.
        colour*=mix(1.,mix(1.,cos4,.30),uVignette);
        gl_FragColor=vec4(colour,1.);
      }`
  });
  const quad=new FullScreenQuad(material);
  const focusTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.FloatType,depthBuffer:false});
  const focusMaterial=new THREE.ShaderMaterial({uniforms:{tDepth:{value:sceneTarget.depthTexture},uUV:{value:new THREE.Vector2(.5,.5)}},depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform sampler2D tDepth;uniform vec2 uUV;void main(){gl_FragColor=vec4(texture2D(tDepth,uUV).xxx,1.);}'});
  const focusQuad=new FullScreenQuad(focusMaterial),focusPixel=new Float32Array(4);
  let focusMode='target',manualFocus=60;
  let useSmaa=true,quality='high',width=1,height=1,outputWidth=1,outputHeight=1,sceneStats={triangles:0,calls:0};
  function setSamples(){const request=requestedSamples??(quality==='high'?8:4),wanted=Math.max(0,...commonSamples.filter(n=>n<=request));if(sceneTarget.samples!==wanted){sceneTarget.samples=wanted;sceneTarget.dispose();}}
  return {
    ready,
    setAerialPerspective(value){aerialPerspective=value;resetTemporalHistory('air transport');},
    setMotionEnabled(value){requestedMotion=!!value;temporalUniforms.uVegetationMotionEnabled.value=requestedMotion?1:0;resetTemporalHistory('motion diagnostic');},
    setHDROutput(value){hdrOutput=value;},
    setDisplayTransform(value=null){validateDisplayTransformAdapter(value);if(value===displayTransform)return;displayTransform=value;displayTransformStatus={kind:'sdr',requested:!!value,effective:'legacy',reason:value?'awaiting-render':'disabled',error:null};},
    setEffectsRenderer(value){effectsRenderer=typeof value==='function'?value:null;},
    setFrameExposure(P,{dynamic=false}={}){storageEV=P;dynamicLighting=dynamic;},
    async inspectRadiance(){const {readRadianceRange}=await import('./verification/radiance-range-gpu-check.js');const result={storageEV,historyEV};for(const [name,target]of Object.entries({opaque:sceneTarget,composed:lensTarget}))result[name]=await readRadianceRange(THREE,renderer,target.texture,target.width,target.height);return result;},
    getDiagnosticTargets(){return {opaque:sceneTarget,composed:lensTarget};},
    pickFocus(u,v){const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();try{focusMaterial.uniforms.uUV.value.set(THREE.MathUtils.clamp(u,0,1),THREE.MathUtils.clamp(v,0,1));renderer.setRenderTarget(focusTarget);focusQuad.render(renderer);renderer.readRenderTargetPixels(focusTarget,0,0,1,1,focusPixel);const z=focusPixel[0];return {depth:z,metres:camera.near*camera.far/(camera.far-(camera.far-camera.near)*z),sky:z>.99999};}finally{renderer.setRenderTarget(previous,face,mip);}},
    setSize(w,h,outW=w,outH=h){width=Math.max(1,Math.round(w));height=Math.max(1,Math.round(h));outputWidth=Math.round(outW);outputHeight=Math.round(outH);for(const target of [sceneTarget,lensTarget,antialiasTarget,encodedTarget,...temporalTargets])target.setSize(width,height);smaa.setSize(width,height);uniforms.uResolution.value.set(width,height);temporalUniforms.uSize.value.set(width,height);upscaler.setSize(width,height,outputWidth,outputHeight);bloom.setSize(width,height);hdrOutput?.setSize(outputWidth,outputHeight);resetTemporalHistory('resize');},
    configure({focal=28,aperture=8,exposure=0,dof=false,vignette=true,antialias='smaa',quality:requestedQuality='high',temporal=true,glintAA=true,temporalWeight=.84,opticalBloom=true,opticalBloomStrength=.75,opticalFlare=false,focusMode:requestedFocusMode='target',focusDistance=60,temporalJitter=false,msaaSamples=null,shutterSeconds=1/120}={}){
      if(!Number.isFinite(shutterSeconds)||shutterSeconds<0||shutterSeconds>1)throw new RangeError('Effect shutter seconds requires0..1');effectsShutterSeconds=shutterSeconds;
      useJitter=!!temporalJitter;focusMode=requestedFocusMode;manualFocus=THREE.MathUtils.clamp(focusDistance,.3,24000);
      bloom.configure({bloom:opticalBloom,bloomStrength:opticalBloomStrength,flare:opticalFlare});uniforms.uFocal.value=focal;uniforms.uAperture.value=aperture;uniforms.uDof.value=dof?1:0;uniforms.uVignette.value=vignette?1:0;
      useSmaa=antialias==='smaa';quality=requestedQuality;requestedSamples=msaaSamples;setSamples();useTemporal=Boolean(temporal);
      useWaterTemporal=Boolean(glintAA);temporalUniforms.uVegetationEnabled.value=useTemporal?1:0;temporalUniforms.uWaterEnabled.value=useWaterTemporal?1:0;
      temporalUniforms.uHistoryWeight.value=THREE.MathUtils.clamp(temporalWeight,0,.9);
      const settings=JSON.stringify([focal,aperture,exposure,dof,vignette,antialias,requestedQuality,useTemporal,useWaterTemporal,temporalUniforms.uHistoryWeight.value,effectsShutterSeconds]);
      if(settings!==lastSettings){resetTemporalHistory('settings');lastSettings=settings;}
    },
    resetTemporalHistory,
    render(scene,focusDistance,{sdr=false}={}){
      uniforms.uNear.value=camera.near;uniforms.uFar.value=camera.far;
      uniforms.uFocus.value=focusMode==='manual'?manualFocus:Math.max(.3,focusDistance);uniforms.uSensorHeight.value=camera.getFilmHeight();
      const groups=findTemporalGroups(scene),vegetationActive=useTemporal&&groups.length>0,active=vegetationActive||useWaterTemporal;
      const animationTime=groups.length?Math.max(...groups.map(g=>g.time.value)):0;
      const motionDelta=lastAnimationTime===null?0:animationTime-lastAnimationTime;
      if(historyValid&&(camera.position.distanceTo(lastPosition)>Math.max(2,focusDistance*.12)||camera.quaternion.angleTo(lastQuaternion)>.20||motionDelta<-.0001||motionDelta>.12))resetTemporalHistory('camera or animation cut');
      // A frozen scene must not animate its own sampling pattern. Advance only
      // for actual vegetation/camera motion; paused orbiting still gets AA.
      const cameraMoving=historyValid&&(camera.position.distanceToSquared(lastPosition)>1e-12||camera.quaternion.angleTo(lastQuaternion)>1e-7);
      const vegetationMoving=Math.abs(motionDelta)>1e-7&&groups.some(g=>g.wind.value*(g.debugWind?.value??1)>.01);
      stillFrames=Math.abs(motionDelta)<1e-7&&!cameraMoving?stillFrames+1:0;
      if(vegetationActive&&useJitter){if(vegetationMoving||cameraMoving)jitterIndex++;lastJitter=temporalJitterSample(jitterIndex);}
      else lastJitter=[0,0];
      // Only vegetation projection samples change. The main camera matrices,
      // physical vertex positions, water, shadow and reflection views do not.
      motionCapture.setEnabled(requestedMotion&&useTemporal);
      motionCapture.prepare(scene,camera,groups,{historyValid});
      try{
        for(const g of groups){g.jitter.value.set(2*lastJitter[0]/width,2*lastJitter[1]/height);g.active.value=vegetationActive?1:0;}
        renderer.setRenderTarget(sceneTarget);renderer.render(scene,camera);
      }finally{motionCapture.finish();for(const g of groups){g.jitter.value.set(0,0);g.active.value=0;}}
      sceneStats={triangles:renderer.info.render.triangles,calls:renderer.info.render.calls};
      uniforms.tScene.value=sceneTarget.texture;
      if(active&&historyValid&&stillFrames>24&&!dynamicLighting&&Math.abs(storageEV-historyEV)<1e-8){
        // Reusing a settled image is exact for a frozen view. Repeated
        // half-float reprojection/filter feedback otherwise keeps modifying
        // subpixel coverage even after sample jitter has stopped.
        uniforms.tScene.value=temporalTargets[1-historyIndex].texture;
      }else if(active){
        currentVP.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
        temporalUniforms.uInverseCurrentVP.value.copy(currentVP).invert();
        temporalUniforms.uNear.value=camera.near;temporalUniforms.uFar.value=camera.far;
        temporalUniforms.uHistoryValid.value=historyValid?1:0;
        temporalUniforms.uHistoryExposureRatio.value=2**Math.max(-32,Math.min(32,storageEV-historyEV));
        temporalUniforms.uWind.value=Math.max(0,...groups.map(g=>g.wind.value*(g.debugWind?.value??1)));
        temporalUniforms.uMotionDelta.value=THREE.MathUtils.clamp(motionDelta,0,.06);
        temporalUniforms.uProjectionScale.value=Math.abs(camera.projectionMatrix.elements[5])*height*.5;
        temporalUniforms.tHistory.value=temporalTargets[1-historyIndex].texture;
        temporalUniforms.tHistoryMetadata.value=temporalTargets[1-historyIndex].textures[1];
        renderer.setRenderTarget(temporalTargets[historyIndex]);temporalQuad.render(renderer);
        uniforms.tScene.value=temporalTargets[historyIndex].texture;historyIndex=1-historyIndex;
        temporalUniforms.uPreviousVP.value.copy(currentVP);temporalUniforms.uPreviousView.value.copy(camera.matrixWorldInverse);
        historyValid=true;historyFrames++;historyEV=storageEV;
      }else if(historyValid)resetTemporalHistory('temporal disabled');
      lastAnimationTime=animationTime;lastPosition.copy(camera.position);lastQuaternion.copy(camera.quaternion);
      if(aerialPerspective)uniforms.tScene.value=aerialPerspective.render({colour:uniforms.tScene.value,depth:sceneTarget.depthTexture,width,height});
      renderer.setRenderTarget(lensTarget);quad.render(renderer);
      if(effectsRenderer)effectsRenderer({renderer,target:lensTarget,camera,opaqueDepth:sceneTarget.depthTexture,width,height,optics:{width,height,focalMm:uniforms.uFocal.value,aperture:uniforms.uAperture.value,focusMetres:uniforms.uFocus.value,sensorHeightMm:uniforms.uSensorHeight.value,dof:uniforms.uDof.value>0,vignette:uniforms.uVignette.value>0,shutterSeconds:effectsShutterSeconds}});
      bloom.render(lensTarget.texture);
      let result=bloom.resultTarget||lensTarget;
      // r180 SMAA explicitly operates in linear-sRGB, before tone mapping.
      if(useSmaa){smaa.render(renderer,antialiasTarget,result);result=antialiasTarget;}
      if(!sdr&&hdrOutput?.state.enabled&&hdrOutput.present(result,performance.now())){
        if(displayTransform){const active=hdrOutput.state.displayTransform;displayTransformStatus={kind:'hdr',requested:true,effective:active?.effective??'legacy',reason:active?.reason??'legacy-hdr',error:active?.error??null};}
        return;
      }
      const enlarge=width<outputWidth||height<outputHeight;
      let transformed=false;
      if(displayTransform){
        try{
          const candidateTarget=enlarge&&upscalerReady?encodedTarget:null;
          if(candidateTarget){candidateTarget.texture.colorSpace=THREE.NoColorSpace;candidateTarget.samples=0;renderer.initRenderTarget(candidateTarget);}
          displayTransformStatus=renderDisplayTransformAdapter(displayTransform,{kind:'sdr',input:result.texture,exposure:renderer.toneMappingExposure,target:candidateTarget,peakNits:100});
          transformed=displayTransformStatus.effective==='candidate';
        }catch(error){displayTransformStatus=renderDisplayTransformAdapter(displayTransform,{kind:'sdr'},{fallbackReason:'sdr-target-initialization-failed'});displayTransformStatus.error=String(error?.message||error);}
      }
      if(enlarge&&upscalerReady){if(!transformed){output.renderToScreen=false;output.render(renderer,encodedTarget,result);}upscaler.render(encodedTarget);}
      else if(!transformed){output.renderToScreen=true;output.render(renderer,null,result);}
    },
    get state(){return {displayTransform:displayTransformDiagnostic(displayTransform,displayTransformStatus),storageEV,historyEV,dynamicLighting,sceneAttachments:["RGBA16F radiance","RGBA16F motion/coverage","R16F foliage depth","R8 local reactive"],motion:motionCapture.state,bloom:bloom.state,hdr:hdrOutput?.state||null,width,height,outputWidth,outputHeight,upscaler:width<outputWidth?upscaler.state.mode:'native resolution',samples:sceneTarget.samples,maxSamples,sampleSupport,antialias:['MSAA',useTemporal?'leaf temporal':null,useWaterTemporal?'water temporal':null,useSmaa?'SMAA':null].filter(Boolean).join(' + '),temporal:{enabled:useTemporal,active:useTemporal&&temporalGroups.length>0,waterEnabled:useWaterTemporal,stillFrames,frozen:historyValid&&stillFrames>24,historyFrames,historyWeight:temporalUniforms.uHistoryWeight.value,artificialJitter:useJitter,jitterPixels:[...lastJitter],lastResetReason,scope:'analytic wind/camera foliage motion, MSAA coverage, independent short water radiance history',maximumMissingCoverageFrames:2,metadata:'R8 age; nearest valid depth, bilinear RGB',historyBytes:width*height*18},shutterSeconds:effectsShutterSeconds,focalMm:uniforms.uFocal.value,cameraFocalMm:camera.getFocalLength(),verticalFovDegrees:camera.fov,exposureScale:renderer.toneMappingExposure,aperture:uniforms.uAperture.value,focusMode,focusMetres:uniforms.uFocus.value,sensorHeightMm:uniforms.uSensorHeight.value,depthOfField:uniforms.uDof.value===1,vignette:uniforms.uVignette.value===1,sceneStats};},
    dispose(){for(const target of [sceneTarget,lensTarget,antialiasTarget,encodedTarget,...temporalTargets])target.dispose();smaa.dispose();output.dispose();material.dispose();quad.dispose();temporalMaterial.dispose();temporalQuad.dispose();upscaler.dispose();bloom.dispose();focusTarget.dispose();focusMaterial.dispose();focusQuad.dispose();motionCapture.dispose();}
  };
}
