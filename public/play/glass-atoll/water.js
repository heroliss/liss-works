import * as THREE from 'three';
import { waveGLSL,waveStatistics } from './waves.js';
import { sandAlbedoGLSL } from './sand.js';
import { cloudShadowLookupGLSL } from './cloud-lighting.js';
import { createSunShadowBinding,sunShadowGLSL } from './sun-shadows.js';
import { deriveWaterOptics,resolveWaterOptics } from './water-optics.js';
import {waterReflectionDirectionGLSL} from './water-reflection.js';
import {ENVIRONMENT_LIGHT_COUNT} from './environment-local-lights.js';
import {oceanGridCoordinate,oceanDatumGLSL,OCEAN_EARTH_RADIUS,OCEAN_NEAR_EXTENT,OCEAN_FAR_EXTENT,OCEAN_REQUIRED_CAMERA_FAR} from './ocean-geometry.js';

export const MAX_SUBMERGED_OBJECTS=36;
// One surface light per burning firework. The two merged environment proxies
// jump whenever a shell is added, expires or is re-paired, which made the
// glitter and water glow teleport; per-event lights only move with their own stars.
export const FIRE_SURFACE_LIGHTS=8;
export function normaliseSubmergedObjects(objects=[]){
  if(!Array.isArray(objects)||objects.length>MAX_SUBMERGED_OBJECTS)throw new RangeError('Submerged object snapshots must contain at most36 bounds.');
  return Object.freeze(objects.map((object,index)=>{
    const position=object?.position,radius=object?.radiusMetres??(object?.diameterMetres===undefined?NaN:object.diameterMetres/2);
    if(!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite)||!Number.isFinite(radius)||!(radius>0))throw new TypeError(`Submerged bound${index} requires a finite metric position and positive actual radius.`);
    return Object.freeze({id:object.id??index,position:Object.freeze([...position]),radiusMetres:radius});
  }));
}

// The surface combines actual scene refraction and planar reflection in linear light.
// Wavelengths and heights are measured in metres. Eight circular impulses are shared
// by vertex displacement and the fragment normal, so interaction deforms the water.
export function createWater(renderer, scene, camera, sun, {terrainHeight,skyCube,sandTexture,atmosphere,waveSpectrum,sunLight=null,indirectLighting,localLights=null}) {
  let opticsState=deriveWaterOptics(),opticsRevision=0,farFieldMode='curved',reflectionDirectionMode='geometric';
  const treeShadow=createSunShadowBinding(THREE,sunLight);
  const refraction = new THREE.WebGLRenderTarget(1024, 768, {type:THREE.HalfFloatType, depthTexture:new THREE.DepthTexture(1024,768)});
  const reflection = new THREE.WebGLRenderTarget(768, 512, {type:THREE.HalfFloatType,depthTexture:new THREE.DepthTexture(768,512)});
  const gl=renderer.getContext(),reflectionSamples=Math.min(2,renderer.capabilities.maxSamples??gl.getParameter(gl.MAX_SAMPLES));
  reflection.samples=reflectionSamples;
  reflection.texture.generateMipmaps=true;reflection.texture.minFilter=THREE.LinearMipmapLinearFilter;
  reflection.depthTexture.generateMipmaps=false;
  const mirrorCamera = camera.clone();
  const textureMatrix = new THREE.Matrix4();
  const impulses = Array.from({length:8},()=>new THREE.Vector4(0,0,-100,0));
  const heights=new Float32Array(1024*1024);
  for(let z=0;z<1024;z++)for(let x=0;x<1024;x++)heights[z*1024+x]=terrainHeight((x/1023-.5)*480,(z/1023-.5)*480);
  const heightTexture=new THREE.DataTexture(heights,1024,1024,THREE.RedFormat,THREE.FloatType);
  heightTexture.minFilter=heightTexture.magFilter=THREE.LinearFilter;heightTexture.needsUpdate=true;
  const white=new THREE.DataTexture(new Float32Array([1,1,1,1]),1,1,THREE.RGBAFormat,THREE.FloatType);white.needsUpdate=true;
  const zero=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1);zero.needsUpdate=true;
  const uniforms = {
    uReflectionDirectionMode:{value:1},uOceanCurvature:{value:1},uTime:{value:0}, uSun:{value:sun}, uIntensity:{value:1}, uRefract:{value:refraction.texture},
    uSunColor:{value:new THREE.Color(1,.97,.90)},uSkyColor:{value:new THREE.Color(.87,.94,1)},
    uDepth:{value:refraction.depthTexture}, uReflect:{value:reflection.texture},uReflectionDepth:{value:reflection.depthTexture},
    uTextureMatrix:{value:textureMatrix}, uResolution:{value:new THREE.Vector2(1024,768)},
    uInverseProjection:{value:camera.projectionMatrixInverse}, uCameraWorld:{value:camera.matrixWorld},
    uRipples:{value:impulses}, uWind:{value:1},uHeightMap:{value:heightTexture},uSkyCube:{value:skyCube},
    uViewProjection:{value:new THREE.Matrix4()},uSandTexture:{value:sandTexture},uSandColor:{value:sandTexture},uSandMacroColor:{value:sandTexture},uSandFineTile:{value:2},uSandMacroTile:{value:30},uSandAlbedoGain:{value:1},uCaustic:{value:white},uSunIrradiance:{value:3.6},uCausticExtent:{value:64},
    uMeanCurrent:{value:new THREE.Vector2()},uCurrentOffset:{value:new THREE.Vector2()},uRippleOffsets:{value:Array.from({length:8},()=>new THREE.Vector2())},uHydroState:{value:zero},uHydroExtent:{value:72},uHydroResolution:{value:384},uHydroEnabled:{value:0},uDebugMode:{value:0},
    uSkyCubeScale:{value:1},uGlintAA:{value:1},uFireSurface:{value:1},uFireLightScale:{value:1},uFireLightPosition:{value:Array.from({length:FIRE_SURFACE_LIGHTS},()=>new THREE.Vector4())},uFireLightColour:{value:Array.from({length:FIRE_SURFACE_LIGHTS},()=>new THREE.Vector3())},uFireDisplayGain:{value:1},uGlintTemporalVariance:{value:waveStatistics.temporalSlopeVariance||0},
    uWaterAbsorption:{value:new THREE.Vector3(...opticsState.absorption)},uWaterScattering:{value:new THREE.Vector3(...opticsState.scattering)},
    uSubmergedCount:{value:0},uSubmergedBounds:{value:Array.from({length:MAX_SUBMERGED_OBJECTS},()=>new THREE.Vector4())}
  };
  const waveCode = waveGLSL;
  Object.assign(uniforms,atmosphere.uniforms);
  Object.assign(uniforms,waveSpectrum.uniforms);
  Object.assign(uniforms,treeShadow.uniforms,indirectLighting.uniforms);
  if(localLights)Object.assign(uniforms,localLights.uniforms);
  const localCode=localLights?.glsl||'vec3 localIrradiance(vec3 p,vec3 n){return vec3(0.);} float localReceiverReactive(vec3 p){return 0.;} float localReflectionReactive(vec3 p,vec3 r){return 0.;}';
  const material = new THREE.ShaderMaterial({
    uniforms,defines:{BAKED_WAVE_TEXTURES:1},
    vertexShader:/* glsl */`
      #define GEOMETRY_PASS
      ${waveCode}
      ${oceanDatumGLSL}
      uniform mat4 uTextureMatrix;
      varying vec3 vWorld;
      varying vec4 vReflection;
      void main(){
        vec3 p=position;
        vec4 world=modelMatrix*vec4(p,1.);
        world.y=surface(world.xz)+oceanDatum(world.xz);
        vWorld=world.xyz;
        vReflection=uTextureMatrix*world;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader:/* glsl */`
      #include <common>
      #include <packing>
      #define OPTICAL_PASS
      ${waveCode}
      ${oceanDatumGLSL}
      ${waterReflectionDirectionGLSL}
      ${sandAlbedoGLSL}
      ${cloudShadowLookupGLSL}
      ${sunShadowGLSL}
      ${indirectLighting.glsl}
      ${localCode}
      uniform vec3 uSun;
      uniform vec3 uSunColor,uSkyColor;
      uniform vec3 uWaterAbsorption,uWaterScattering;
      uniform float uIntensity;
      uniform sampler2D uRefract;
      uniform highp sampler2D uDepth;
      uniform sampler2D uReflect;
      uniform highp sampler2D uHeightMap;
      uniform sampler2D uSandTexture;
      uniform sampler2D uCaustic;
      uniform samplerCube uSkyCube;
      uniform mat4 uViewProjection;
      uniform float uSunIrradiance;
      uniform float uCausticExtent;
      uniform float uDebugMode;
      uniform float uGlintAA,uGlintTemporalVariance;
      uniform float uSkyCubeScale;
      uniform float uFireSurface,uFireDisplayGain,uFireLightScale;
      uniform vec4 uFireLightPosition[${FIRE_SURFACE_LIGHTS}];
      uniform vec3 uFireLightColour[${FIRE_SURFACE_LIGHTS}];
      uniform vec2 uResolution;
      uniform mat4 uInverseProjection;
      uniform mat4 uCameraWorld;
      uniform int uSubmergedCount;
      uniform vec4 uSubmergedBounds[${MAX_SUBMERGED_OBJECTS}];
      varying vec3 vWorld;
      varying vec4 vReflection;
      vec3 reconstruct(vec2 uv,float depth) {
        vec4 v=uInverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);
        return (uCameraWorld*vec4(v.xyz/v.w,1.)).xyz;
      }
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      float bottomHeight(vec2 p){float datum=oceanDatum(p);if(max(abs(p.x),abs(p.y))>239.)return -33.+datum;return texture2D(uHeightMap,p/480.+.5).r+datum;}
      float fresnelDielectric(float cosI){
        cosI=clamp(cosI,0.,1.);float eta=1.333;
        float cosT=sqrt(max(0.,1.-(1.-cosI*cosI)/(eta*eta)));
        float rs=(cosI-eta*cosT)/(cosI+eta*cosT);
        float rp=(eta*cosI-cosT)/(eta*cosI+cosT);
        return .5*(rs*rs+rp*rp);
      }
      // A bound only chooses where to search. It never supplies colour or an
      // invented hit: the real auxiliary depth must verify the same wet prop.
      bool propProbe(vec3 entry,vec3 ray,vec3 waterNormal,vec4 sphere,float s,out vec3 q,out vec2 uv,out float error,out float footprint){
        vec3 probe=entry+ray*s;vec4 h=uViewProjection*vec4(probe,1.);
        if(h.w<=0.)return false;uv=h.xy/h.w*.5+.5;
        if(any(lessThanEqual(uv,vec2(0.)))||any(greaterThanEqual(uv,vec2(1.))))return false;
        float depth=texture2D(uDepth,uv).r;if(depth>=.9999999)return false;
        q=reconstruct(uv,depth);
        vec3 qx=reconstruct(uv+vec2(1./uResolution.x,0.),depth),qy=reconstruct(uv+vec2(0.,1./uResolution.y),depth);
        footprint=max(length(qx-q),length(qy-q));float tolerance=max(.00005,footprint*.9);
        if(length(q-sphere.xyz)>sphere.w+tolerance||dot(q-entry,waterNormal)>=0.)return false;
        error=dot(probe-q,normalize(probe-cameraPosition));return true;
      }
      bool traceSubmergedProps(vec3 entry,vec3 ray,vec3 waterNormal,float bedDistance,out float hitDistance,out vec3 hitColour){
        hitDistance=bedDistance;hitColour=vec3(0.);if(uSubmergedCount==0)return false;bool found=false;
        for(int objectIndex=0;objectIndex<${MAX_SUBMERGED_OBJECTS};objectIndex++){
          if(objectIndex>=uSubmergedCount)break;vec4 sphere=uSubmergedBounds[objectIndex];
          vec3 centre=sphere.xyz-entry;float closest=dot(centre,ray);vec3 perpendicular=centre-ray*closest;
          float disc=sphere.w*sphere.w-dot(perpendicular,perpendicular);if(disc<=0.)continue;
          float reach=sqrt(disc),lo=max(.00001,closest-reach),hi=min(hitDistance,closest+reach);if(hi<=lo)continue;
          float previous=lo;bool bracket=false;vec3 q,highQ;vec2 uv,highUV;float error,footprint,highFootprint;
          // Four probes are used only inside a positive finite sphere interval.
          for(int j=0;j<4;j++){
            float s=mix(lo,hi,float(j)/3.);
            if(propProbe(entry,ray,waterNormal,sphere,s,q,uv,error,footprint)&&error>=0.){lo=previous;hi=s;highQ=q;highUV=uv;highFootprint=footprint;bracket=true;break;}
            previous=s;
          }
          if(!bracket)continue;
          for(int j=0;j<6;j++){
            float s=(lo+hi)*.5;
            if(propProbe(entry,ray,waterNormal,sphere,s,q,uv,error,footprint)&&error>=0.){hi=s;highQ=q;highUV=uv;highFootprint=footprint;}else lo=s;
          }
          q=highQ;uv=highUV;footprint=highFootprint;
          vec3 delta=q-entry;float actual=dot(delta,ray),tolerance=max(.00005,footprint*.9)+(hi-lo);
          if(actual<=.00001||actual>=hitDistance||length(delta-ray*actual)>tolerance)continue;
          hitDistance=actual;hitColour=texture2D(uRefract,uv).rgb;found=true;
        }
        return found;
      }
      void main(){
        vec2 p=vWorld.xz;
        opticalFootprint=max(length(dFdx(p)),length(dFdy(p)));
        vec3 waveNormal=surfaceNormal(p),macroNormal=oceanMacroNormal(p);
        vec3 n=normalize(vec3(waveNormal.x/max(.001,waveNormal.y)+macroNormal.x/max(.001,macroNormal.y),1.,waveNormal.z/max(.001,waveNormal.y)+macroNormal.z/max(.001,macroNormal.y)));
        vec3 V=normalize(cameraPosition-vWorld);
        float unmaskedFacing=max(dot(n,V),0.);
        if(dot(n,V)<.001)n=normalize(n+V*(.002-dot(n,V)));
        vec2 uv=gl_FragCoord.xy/uResolution;
        // Snell's law, followed by five height-field intersection refinements.
        // This path remains well defined at grazing and oblique viewpoints.
        vec3 T=refract(-V,n,1./1.333);
        float pathLength=max(.001,(bottomHeight(p)-vWorld.y)/min(T.y,-.12));
        for(int j=0;j<5;j++)pathLength=max(.001,(bottomHeight(p+T.xz*pathLength)-vWorld.y)/min(T.y,-.12));
        pathLength=min(pathLength,120.);
        vec3 bottom=vWorld+T*pathLength;
        float objectDistance;vec3 objectColour;
        bool objectHit=traceSubmergedProps(vWorld,T,n,pathLength,objectDistance,objectColour);
        vec3 receiver=bottom;if(objectHit){pathLength=objectDistance;receiver=vWorld+T*pathLength;}
        float vertical=max(.0,vWorld.y-bottomHeight(p));
        float viewDistance=length(cameraPosition-vWorld);
        vec3 absorption=uWaterAbsorption;
        vec3 scattering=uWaterScattering;
        vec3 extinction=absorption+scattering;
        vec3 transmission=exp(-extinction*pathLength);
        vec3 lightRay=refract(-uSun,macroNormal,1./1.333);
        float sunlightPath=max(.0,oceanDatum(receiver.xz)-receiver.y)/max(.15,-dot(lightRay,macroNormal));
        vec3 solarTransmission=exp(-extinction*sunlightPath)*(1.-fresnelDielectric(dot(uSun,macroNormal)));
        // Air-side occlusion must be queried at the solar ENTRY point, not
        // projected straight onto the sea surface or directly onto the bed.
        vec3 solarEntry=receiver-lightRay*sunlightPath;
        float bedTreeVisibility=treeSunVisibility(solarEntry);
        float surfaceTreeVisibility=treeSunVisibility(vWorld);
        vec3 volumePoint=vWorld+T*(pathLength*.5);
        float volumeSolarPath=max(0.,oceanDatum(volumePoint.xz)-volumePoint.y)/max(.15,-dot(lightRay,macroNormal));
        float volumeTreeVisibility=treeSunVisibility(volumePoint-lightRay*volumeSolarPath);
        float slopeX=(bottomHeight(bottom.xz+vec2(.2,0))-bottomHeight(bottom.xz-vec2(.2,0)))/.4;
        float slopeZ=(bottomHeight(bottom.xz+vec2(0,.2))-bottomHeight(bottom.xz-vec2(0,.2)))/.4;
        vec3 bn=normalize(vec3(-slopeX,1.,-slopeZ));
        vec3 albedo=sampleSandAlbedo(bottom.xz,bottom.y);
        float solarCloud=getCloudShadow(vWorld,uCloudTime);
        float concentration=texture2D(uCaustic,bottom.xz/(2.*uCausticExtent)+.5).r;
        float coverage=1.-smoothstep(uCausticExtent*.9,uCausticExtent*.99,max(abs(bottom.x),abs(bottom.z)));
        concentration=mix(1.,max(.05,concentration),coverage*smoothstep(.08,.4,oceanDatum(bottom.xz)-bottom.y)*(1.-smoothstep(1.5,5.,oceanDatum(bottom.xz)-bottom.y)));
        vec3 bedDirect=albedo*uSunColor*uSunIrradiance*max(uSun.y,0.)*max(bn.y,0.)*concentration*solarCloud*bedTreeVisibility/3.14159265;
        vec3 bedAmbient=albedo*(.70*uSkyColor*uIntensity)/3.14159265;
        vec3 diffuseTransmission=exp(-extinction*(max(0.,oceanDatum(bottom.xz)-bottom.y)*1.3))*(1.-fresnelDielectric(1.));
        vec3 bedBounce=albedo*getIndirectIrradiance(bottom,bn)/3.14159265;
        vec3 bedLocal=vec3(0.);
        ${localLights?`for(int i=0;i<4;i++){
          if(max(max(uLocalColour[i].r,uLocalColour[i].g),uLocalColour[i].b)<1e-12)continue;
          vec3 source=uLocalPosition[i].xyz;float depth=max(.001,oceanDatum(bottom.xz)-bottom.y),height=max(.02,source.y-oceanDatum(source.xz));vec2 horizontal=source.xz-bottom.xz;float span=length(horizontal);vec2 axis=horizontal/max(span,1e-6);
          // Planar Snell connection, three safeguarded Newton steps.
          float sw=clamp(span/sqrt(span*span+pow(1.333*height+depth,2.)),0.,.749);
          for(int k=0;k<3;k++){float a=max(1e-6,1.-1.776889*sw*sw),b=max(1e-6,1.-sw*sw);float f=height*1.333*sw/sqrt(a)+depth*sw/sqrt(b)-span;float df=height*1.333/pow(a,1.5)+depth/pow(b,1.5);sw=clamp(sw-f/max(df,1e-6),0.,.7499);}
          float waterLength=depth/sqrt(max(1e-5,1.-sw*sw));vec2 entryXZ=bottom.xz+axis*(waterLength*sw);vec3 entry=vec3(entryXZ.x,oceanDatum(entryXZ),entryXZ.y);
          vec3 L;vec3 E=localIncident(entry,i,L);float airLength=max(.02,length(source-entry));vec3 toward=normalize(entry-bottom);float F=1.-fresnelDielectric(max(0.,L.y));
          float spreading=1.776889*airLength*airLength/pow(1.333*airLength+waterLength,2.);
          bedLocal+=albedo*E*max(0.,dot(bn,toward))*(F*spreading)*exp(-extinction*waterLength)/3.14159265;
        }
        // Fireworks light the seabed through one stable light per burning shell (see
        // FIRE_SURFACE_LIGHTS), with the same planar Snell connection as the lamps.
        for(int i=0;i<${FIRE_SURFACE_LIGHTS};i++){
          if(uFireSurface<=0.||max(max(uFireLightColour[i].r,uFireLightColour[i].g),uFireLightColour[i].b)<1e-12)continue;
          vec3 source=uFireLightPosition[i].xyz;float depth=max(.001,oceanDatum(bottom.xz)-bottom.y),height=max(.02,source.y-oceanDatum(source.xz));vec2 horizontal=source.xz-bottom.xz;float span=length(horizontal);vec2 axis=horizontal/max(span,1e-6);
          // Planar Snell connection, three safeguarded Newton steps.
          float sw=clamp(span/sqrt(span*span+pow(1.333*height+depth,2.)),0.,.749);
          for(int k=0;k<3;k++){float a=max(1e-6,1.-1.776889*sw*sw),b=max(1e-6,1.-sw*sw);float f=height*1.333*sw/sqrt(a)+depth*sw/sqrt(b)-span;float df=height*1.333/pow(a,1.5)+depth/pow(b,1.5);sw=clamp(sw-f/max(df,1e-6),0.,.7499);}
          float waterLength=depth/sqrt(max(1e-5,1.-sw*sw));vec2 entryXZ=bottom.xz+axis*(waterLength*sw);vec3 entry=vec3(entryXZ.x,oceanDatum(entryXZ),entryXZ.y);
          vec3 fireBedTo=source-entry;float fireBedD2=dot(fireBedTo,fireBedTo);vec3 L=fireBedTo*inversesqrt(max(fireBedD2,1e-10)),E=uFireLightColour[i]*(uFireLightScale/max(fireBedD2,uFireLightPosition[i].w*uFireLightPosition[i].w));float airLength=max(.02,length(source-entry));vec3 toward=normalize(entry-bottom);float F=1.-fresnelDielectric(max(0.,L.y));
          float spreading=1.776889*airLength*airLength/pow(1.333*airLength+waterLength,2.);
          bedLocal+=albedo*E*max(0.,dot(bn,toward))*(F*spreading)*exp(-extinction*waterLength)/3.14159265;
        }`:''}
        vec3 refracted=bedDirect*solarTransmission+bedAmbient*diffuseTransmission+bedBounce*diffuseTransmission+bedLocal;
        // Real native prop RGB is used only after the depth/ray verification.
        // Its incoming attenuation uses its receiver depth; outgoing Beer and
        // the volume segment end at that same hit, never at the deeper seabed.
        if(objectHit)refracted=objectColour*solarTransmission;
        // Beer-Lambert along both the incoming solar and outgoing view paths.
        // Isotropic single-scattering approximation for clear ocean water.
        vec3 volumeSolarTransmission=exp(-extinction*volumeSolarPath)*(1.-fresnelDielectric(dot(uSun,macroNormal)));
        vec3 volumeAmbientTransmission=exp(-extinction*(max(0.,oceanDatum(volumePoint.xz)-volumePoint.y)*1.3));
        vec3 volumeRadiance=scattering/extinction*(uSunColor*uSunIrradiance*solarCloud*volumeTreeVisibility*volumeSolarTransmission*.079577+.11*uSkyColor*uIntensity*volumeAmbientTransmission);
        vec3 waterColour=refracted*transmission+volumeRadiance*(1.-transmission);
        vec2 reflectUV=vReflection.xy/vReflection.w;
        reflectUV+=n.xz*.065/(1.+viewDistance*.01);
        vec2 safeReflect=clamp(reflectUV,vec2(.002),vec2(.998));
        vec4 reflectionSample=texture2D(uReflect,safeReflect);
        // For the sky use the actual reflected 3D ray, rather than distorting
        // a flat horizon image. Nearby objects retain their planar reflection.
        vec3 R=reflect(-V,n);float geometricNoL=dot(R,macroNormal);
        if(uReflectionDirectionMode==0)R.y=max(R.y,.006);
        else if(geometricNoL<=0.)R=waterGeometricMacroRay(reflect(-V,macroNormal),macroNormal);
        float reflectionLod=max(0.,log2(max(1.,sqrt(unresolvedSlopeVariance)*128.)));
        vec3 skyReflection=textureLod(uSkyCube,R,reflectionLod).rgb*uSkyCubeScale;
        vec3 reflected=reflectionSample.rgb+(1.-clamp(reflectionSample.a,0.,1.))*skyReflection;
        // Smith masking approximates unresolved wave self-occlusion at the
        // horizon. A flat normal-mapped mirror otherwise reflects bright haze
        // from back-facing facets that would be hidden by neighbouring waves.
        float macroNoV=max(dot(macroNormal,V),.0001);
        float windGain=uWind*uWindSea;
        float slopeAlpha=max(.002,sqrt(${(waveStatistics.swellRmsSlope**2).toFixed(12)}*uSwell*uSwell+${(waveStatistics.windRmsSlope**2).toFixed(12)}*windGain*windGain));
        float visibility=2.*macroNoV/(macroNoV+sqrt(slopeAlpha*slopeAlpha+(1.-slopeAlpha*slopeAlpha)*macroNoV*macroNoV));
        if(uReflectionDirectionMode==0)visibility*=2.*unmaskedFacing/max(.0001,unmaskedFacing+sqrt(slopeAlpha*slopeAlpha+(1.-slopeAlpha*slopeAlpha)*unmaskedFacing*unmaskedFacing));
        else visibility*=2.*unmaskedFacing/max(.0001,unmaskedFacing+sqrt(slopeAlpha*slopeAlpha+(1.-slopeAlpha*slopeAlpha)*unmaskedFacing*unmaskedFacing))*waterIncomingSmith(geometricNoL,slopeAlpha);
        // Masked microfacets still exchange light with other water facets and
        // the sky. Using deep-water volume radiance for that missing energy
        // makes the grazing horizon spuriously black. A low-frequency sky
        // lookup is a bounded missing-energy approximation here, rather than
        // a microfacet-distribution integral or a multiple-bounce solver.
        vec3 macroReflection=reflect(-V,macroNormal);
        if(uReflectionDirectionMode==0)macroReflection.y=max(.012,macroReflection.y);
        else macroReflection=waterGeometricMacroRay(macroReflection,macroNormal);
        vec3 unresolvedSky=textureLod(uSkyCube,normalize(macroReflection),3.5).rgb*uSkyCubeScale;
        reflected=mix(unresolvedSky,reflected,visibility);
        float facing=clamp(dot(n,V),0.,1.);
        float fresnel=fresnelDielectric(facing);
        vec3 colour=mix(waterColour,reflected,fresnel);
        // Filtered fine slopes are a distribution, not a perfectly flat mirror.
        // A Gaussian-slope (Beckmann) lobe carries their mip moment variance.
        vec3 H=normalize(V+uSun);
        float NoH=max(dot(n,H),0.),NoL=max(dot(n,uSun),0.),NoV=max(facing,.001);
        vec3 normalDx=dFdx(n),normalDy=dFdy(n);
        float pixelNormalVariance=.083333*(dot(normalDx,normalDx)+dot(normalDy,normalDy));
        float temporalNormalVariance=${waveStatistics.swellTemporalSlopeVariance.toFixed(14)}*uSwell*uSwell+${waveStatistics.windTemporalSlopeVariance.toFixed(14)}*windGain*windGain;
        float aa=.0001+unresolvedSlopeVariance+.00001081125+uGlintAA*(pixelNormalVariance+temporalNormalVariance);
        float nh2=max(.0001,NoH*NoH);
        float D=exp((nh2-1.)/(aa*nh2))/(3.14159265*aa*nh2*nh2);
        float av=NoV/max(.0001,sqrt(aa*(1.-NoV*NoV)));
        float al=NoL/max(.0001,sqrt(aa*(1.-NoL*NoL)));
        float Gv=av>=1.6?1.:(3.535*av+2.181*av*av)/(1.+2.276*av+2.577*av*av);
        float Gl=al>=1.6?1.:(3.535*al+2.181*al*al)/(1.+2.276*al+2.577*al*al);
        float Fsun=fresnelDielectric(max(dot(V,H),0.));
        vec3 solarGlint=uSunColor*uSunIrradiance*solarCloud*surfaceTreeVisibility*D*Gv*Gl*Fsun/(4.*NoV);
        colour+=solarGlint;
        // Broken, fine swash on the waterline rather than a painted white ring.
        float swash=sin(vertical*18.-uTime*1.3+noise(p*.65)*5.);
        float foam=(1.-smoothstep(.018,.16,vertical))*smoothstep(.4,.88,swash)*smoothstep(.35,.72,noise(p*3.+uTime*.1));
        vec3 foamLight=vec3(.94,.96,.9)*(uSunColor*uSunIrradiance*solarCloud*surfaceTreeVisibility*.25+uSkyColor*.20*uIntensity+localIrradiance(vWorld,vec3(0,1,0))*.25);
        ${localLights?`vec3 flashL;vec3 flashE=localIncident(vWorld,3,flashL);vec3 flashH=normalize(V+flashL);float flashA=max(.003,unresolvedSlopeVariance+.001),flashNH=max(0.,dot(n,flashH));float flashD=flashA/(3.14159265*pow(flashNH*flashNH*(flashA-1.)+1.,2.));float flashF=.02037+.97963*pow(1.-max(0.,dot(V,flashH)),5.);colour+=flashE*flashD*flashF*max(0.,dot(n,flashL))*.25/max(.05,facing);`:''}
        ${localLights?`if(uFireSurface>0.){
          // Firework light on open water. A smooth sea has no diffuse lobe, so
          // what the eye reads as "lit water" is (1) glitter: wave facets that
          // mirror the burst toward the camera, spread by the same slope
          // statistics as the solar glint plus the burst's angular size, and
          // (2) light that enters the water and is scattered back by the volume.
          // The planar reflection keeps the sharp mirror image; this lobe adds
          // the wave-stretched sheen it cannot represent (approximate overlap).
          vec3 fireGlitter=vec3(0.),fireDown=vec3(0.);
          for(int i=0;i<${FIRE_SURFACE_LIGHTS};i++){
            if(max(max(uFireLightColour[i].r,uFireLightColour[i].g),uFireLightColour[i].b)<1e-12)continue;
            vec3 fireTo=uFireLightPosition[i].xyz-vWorld;float fireD2=dot(fireTo,fireTo),fireR=uFireLightPosition[i].w;
            vec3 fireL=fireTo*inversesqrt(max(fireD2,1e-10)),fireE=uFireLightColour[i]*(uFireLightScale/max(fireD2,fireR*fireR));
            float fireUp=max(dot(fireL,macroNormal),0.);
            fireDown+=fireE*fireUp*(1.-fresnelDielectric(fireUp));
            float fireNoL=dot(n,fireL);if(fireNoL<=0.)continue;
            vec3 fireH=normalize(V+fireL);float fireNoH=max(dot(n,fireH),0.),fireNH2=max(.0001,fireNoH*fireNoH);
            float fireAngle=fireR/max(1.,sqrt(fireD2));
            float fireA=aa+.125*fireAngle*fireAngle;
            float fireD=exp((fireNH2-1.)/(fireA*fireNH2))/(3.14159265*fireA*fireNH2*fireNH2);
            float fireAl=fireNoL/max(.0001,sqrt(fireA*(1.-fireNoL*fireNoL)));
            float fireGl=fireAl>=1.6?1.:(3.535*fireAl+2.181*fireAl*fireAl)/(1.+2.276*fireAl+2.577*fireAl*fireAl);
            fireGlitter+=fireE*(fireD*Gv*fireGl*fresnelDielectric(max(dot(V,fireH),0.))/(4.*NoV));
          }
          // Same display-referred shoulder as the firework sources themselves,
          // so the sheen keeps its colour instead of clipping to white.
          fireGlitter*=.4;float firePeak=max(max(fireGlitter.r,fireGlitter.g),fireGlitter.b)*uFireDisplayGain;
          if(firePeak>1.2)fireGlitter*=inversesqrt(firePeak/1.2);
          colour+=uFireSurface*(fireGlitter+(1.-fresnel)*(scattering/extinction)*fireDown*.079577*(1.-transmission));
        }`:''}
        colour=mix(colour,foamLight,foam*.45);
        // Atmospheric perspective matches the pale, humid tropical horizon.
        // The shared HDR aerial pass handles the camera-to-water air segment.
        if(uDebugMode>.5&&uDebugMode<1.5)colour=waterColour;
        if(uDebugMode>1.5&&uDebugMode<2.5)colour=reflected;
        if(uDebugMode>2.5&&uDebugMode<3.5)colour=vec3(fresnel);
        if(uDebugMode>3.5&&uDebugMode<4.5)colour=volumeRadiance;
        if(uDebugMode>4.5&&uDebugMode<5.5)colour=vec3(unresolvedSlopeVariance*40.);
        if(uDebugMode>5.5&&uDebugMode<6.5)colour=n*.5+.5;
        if(uDebugMode>7.5&&uDebugMode<8.5)colour=vec3(bedTreeVisibility);
        if(uDebugMode>8.5&&uDebugMode<9.5)colour=vec3(surfaceTreeVisibility);
        if(uDebugMode>9.5&&uDebugMode<10.5)colour=vec3(volumeTreeVisibility);
        if(uDebugMode>10.5&&uDebugMode<11.5)colour=solarGlint;
        if(uDebugMode>11.5&&uDebugMode<12.5)colour=vec3(concentration);
        if(uDebugMode>12.5&&uDebugMode<13.5)colour=vec3(1.-clamp(reflectionSample.a,0.,1.));
        if(uDebugMode>13.5&&uDebugMode<14.5)colour=reflected;
        if(uDebugMode>14.5&&uDebugMode<15.5)colour=vec3(aa,unresolvedSlopeVariance,temporalNormalVariance)*20.;
        if(uDebugMode>15.5&&uDebugMode<16.5)colour=vec3(objectHit?1.:0.);
        if(uDebugMode>16.5&&uDebugMode<17.5)colour=objectHit?vec3(pathLength):vec3(0.);
        if(uDebugMode>6.5&&(any(isnan(colour))||any(isinf(colour))))colour=vec3(10.,0.,10.);
        gl_FragColor=vec4(colour,uGlintAA>.5?.70:1.);
        #ifdef SCENE_REACTIVE_OUTPUT
          sceneReactiveMask=max(localReceiverReactive(vWorld),localReflectionReactive(vWorld,R));
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side:THREE.FrontSide
  });
  const geometry=new THREE.PlaneGeometry(220,220,640,640).rotateX(-Math.PI/2);
  const positions=geometry.attributes.position;
  // Reuse the same640x640 grid; two tiny1-D source axes support bounded QA
  // mode changes without retaining another full vertex buffer.
  const axisX=Float32Array.from({length:641},(_,i)=>positions.getX(i));
  const axisZ=Float32Array.from({length:641},(_,i)=>positions.getZ(i*641));
  function configureFarField(mode='curved'){
    if(mode!=='legacy'&&mode!=='curved')throw new RangeError('Ocean far-field mode must be legacy or curved');
    farFieldMode=mode;uniforms.uOceanCurvature.value=mode==='curved'?1:0;
    for(let i=0;i<positions.count;i++){positions.setX(i,oceanGridCoordinate(axisX[i%641],mode));positions.setZ(i,oceanGridCoordinate(axisZ[Math.floor(i/641)],mode));}
    positions.needsUpdate=true;return {mode,requiredCameraFarMetres:mode==='curved'?OCEAN_REQUIRED_CAMERA_FAR:24000};
  }
  configureFarField(farFieldMode);
  function configureReflectionDirections(mode='geometric'){
    if(!['legacy','geometric'].includes(mode))throw new RangeError('Water reflection direction mode must be legacy or geometric');
    reflectionDirectionMode=mode;uniforms.uReflectionDirectionMode.value=mode==='geometric'?1:0;
    return {mode,legacyFloorsRadians:[.006,.012],additionalSamplers:0,additionalScenePasses:0,
      source:'actual reflected world ray and curved macro normal; continuous incoming Smith self-occlusion',
      limits:['Environment remains a cubemap at fixed2m; no spatial reflected-sky transport solve','Unresolved sky remains a low-frequency missing-energy approximation, not a microfacet angular integral']};
  }
  const mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;
  mesh.name='Refracting lagoon';
  mesh.renderOrder=2;
  // Called after Three's shadow pass, including the first frame in which the
  // map becomes available. The public update method is also safe before draw.
  mesh.onBeforeRender=()=>treeShadow.update();
  scene.add(mesh);
  let nextImpulse=0;
  const normal = new THREE.Vector3(0,1,0), reflectorWorldPosition=new THREE.Vector3(), cameraWorldPosition=new THREE.Vector3(), rotationMatrix=new THREE.Matrix4(), lookAtPosition=new THREE.Vector3(0,0,-1), view=new THREE.Vector3(), target=new THREE.Vector3(), clipPlane=new THREE.Plane(), clipVector=new THREE.Vector4(), q=new THREE.Vector4();
  let effectsRenderer=null,requestedReflectionScale=null,requestedReflectionSamples=null,submergedObjects=Object.freeze([]),submergedRevision=0;
  function configureOptics(patch={}){
    const next=resolveWaterOptics(patch,opticsState),changed=next.clarity!==opticsState.clarity;
    if(changed){uniforms.uWaterAbsorption.value.fromArray(next.absorption);uniforms.uWaterScattering.value.fromArray(next.scattering);opticsState=next;opticsRevision++;}
    return Object.freeze({...opticsState,revision:opticsRevision,changed});
  }
  function getOpticsState(){return Object.freeze({...opticsState,revision:opticsRevision});}
  function setSubmergedObjects(objects=[]){
    const snapshot=normaliseSubmergedObjects(objects);
    const unchanged=snapshot.length===submergedObjects.length&&snapshot.every((bound,i)=>bound.id===submergedObjects[i].id&&bound.radiusMetres===submergedObjects[i].radiusMetres&&bound.position.every((v,c)=>v===submergedObjects[i].position[c]));
    if(unchanged)return{submitted:snapshot.length,maximum:MAX_SUBMERGED_OBJECTS,revision:submergedRevision,changed:false};
    for(let i=0;i<MAX_SUBMERGED_OBJECTS;i++){const bound=snapshot[i];uniforms.uSubmergedBounds.value[i].set(...(bound?[...bound.position,bound.radiusMetres]:[0,0,0,0]));}
    submergedObjects=snapshot;uniforms.uSubmergedCount.value=snapshot.length;submergedRevision++;return{submitted:snapshot.length,maximum:MAX_SUBMERGED_OBJECTS,revision:submergedRevision,changed:true};
  }
  function prepareReflectionCamera(){
      // Mirror-camera oblique near plane clips everything beneath the surface.
      reflectorWorldPosition.set(0,0,0);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
      view.subVectors(reflectorWorldPosition,cameraWorldPosition).reflect(normal).negate().add(reflectorWorldPosition);
      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition.set(0,0,-1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
      target.subVectors(reflectorWorldPosition,lookAtPosition).reflect(normal).negate().add(reflectorWorldPosition);
      mirrorCamera.position.copy(view);
      mirrorCamera.up.set(0,1,0).applyMatrix4(rotationMatrix).reflect(normal);
      mirrorCamera.lookAt(target);
      mirrorCamera.far=camera.far;
      mirrorCamera.updateMatrixWorld();
      mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
      textureMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse);
      clipPlane.setFromNormalAndCoplanarPoint(normal,reflectorWorldPosition).applyMatrix4(mirrorCamera.matrixWorldInverse);
      clipVector.set(clipPlane.normal.x,clipPlane.normal.y,clipPlane.normal.z,clipPlane.constant);
      const projection=mirrorCamera.projectionMatrix.elements;
      q.x=(Math.sign(clipVector.x)+projection[8])/projection[0];
      q.y=(Math.sign(clipVector.y)+projection[9])/projection[5];
      q.z=-1.; q.w=(1.+projection[10])/projection[14];
      clipVector.multiplyScalar(2./clipVector.dot(q));
      projection[2]=clipVector.x; projection[6]=clipVector.y; projection[10]=clipVector.z+1.-.002; projection[14]=clipVector.w;

    return mirrorCamera;
  }
  return {
    mesh, uniforms, refraction, reflection,prepareReflectionCamera,setSubmergedObjects,configureOptics,getOpticsState,
    setEffectsRenderer(value){effectsRenderer=typeof value==='function'?value:null;},
    setSampling({reflectionScale=null,reflectionSamples=null}={}){requestedReflectionScale=reflectionScale;requestedReflectionSamples=reflectionSamples;},
    updateTreeShadow:light=>treeShadow.update(light),treeShadow,
    configureFarField,configureReflectionDirections,
    diagnostics(){return {farField:{mode:farFieldMode,earthRadiusMetres:OCEAN_EARTH_RADIUS,nearGridHalfExtentMetres:OCEAN_NEAR_EXTENT,farHalfExtentMetres:farFieldMode==='curved'?OCEAN_FAR_EXTENT:10000,requiredCameraFarMetres:farFieldMode==='curved'?OCEAN_REQUIRED_CAMERA_FAR:24000,vertices:positions.count,additionalScenePasses:0,additionalSamplers:0,axisBytes:axisX.byteLength+axisZ.byteLength,model:'shared spherical-Earth datum with logarithmic outer grid; analytic bed preserves local water depth'},optics:getOpticsState(),submergedProps:{count:submergedObjects.length,maximum:MAX_SUBMERGED_OBJECTS,revision:submergedRevision,bounds:submergedObjects,probesPerIntersectedBound:4,bisectionSteps:6,additionalSamplers:0,additionalTargets:0,model:'finite real sphere bounds choose search intervals; real auxiliary RGB/depth verifies nearest wet ray hit; one-pixel finite-resolution tolerance',limits:['Screen-visible auxiliary surfaces only; offscreen/occluded surfaces retain analytic bed without clamped sampling','Captured native RGB has no sun/ambient/local decomposition; incoming water attenuation uses one receiver-depth solar-path approximation','Thin/grazing/subpixel geometry may be missed by the bounded search; sphere bounds alone never create a coloured surface']} ,lighting:{ambientIntensity:uniforms.uIntensity.value,skyColourStored:uniforms.uSkyColor.value.toArray(),sunIrradianceStored:uniforms.uSunIrradiance.value,source:'shared skyTintPhysical and scene storage exposure; solar intensity included once'},treeShadow:treeShadow.diagnostics(),reflection:{directionMode:reflectionDirectionMode,legacyFloorsRadians:[.006,.012],geometricSource:'curved macro-frame reflection; incoming Smith visibility; fixed2m environment approximation retained',size:[reflection.width,reflection.height],samples:reflection.samples,colourMipmaps:reflection.texture.generateMipmaps,depthMipmaps:reflection.depthTexture.generateMipmaps,filter:'linear mipmapped colour; independent non-mipmapped depth'},glintAA:{enabled:uniforms.uGlintAA.value,temporalSlopeVarianceAtReferenceWind:uniforms.uGlintTemporalVariance.value,model:'pixel normal variance plus statistical 1/120 s temporal slope variance; only direct-sun NDF'}};},
    impulse(x,z,time,strength=1){const i=nextImpulse++%8;impulses[i].set(x,z,time,strength);uniforms.uRippleOffsets.value[i].copy(uniforms.uCurrentOffset.value);},
    resize(w,h,quality='high'){
      refraction.setSize(w,h);
      const samples=requestedReflectionSamples??(quality==='high'?reflectionSamples:0);
      if(reflection.samples!==samples){reflection.samples=samples;reflection.dispose();}
      const scale=requestedReflectionScale??(quality==='high'?1:.65);
      reflection.setSize(Math.max(160,Math.round(w*scale)),Math.max(120,Math.round(h*scale)));
      uniforms.uResolution.value.set(w,h);
    },
    render(time){
      const previousTarget=renderer.getRenderTarget(),previousFace=renderer.getActiveCubeFace(),previousMip=renderer.getActiveMipmapLevel(),previousVisibility=mesh.visible,previousLayers=camera.layers.mask,previousShadowDirty=renderer.shadowMap.needsUpdate;
      let succeeded=false;
      try{
      uniforms.uTime.value=time;
      uniforms.uViewProjection.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      mesh.visible=false;
      // Refraction retains a depth texture, allowing true water-path absorption.
      renderer.setRenderTarget(refraction);
      const cameraLayerMask=camera.layers.mask;
      const updateShadows=renderer.shadowMap.needsUpdate;
      renderer.shadowMap.needsUpdate=false;
      // Only small submerged props need screen reprojection. The seabed is
      // already intersected/shaded in world space, so don't redraw the entire
      // expensive sand/forest into this auxiliary object buffer.
      camera.layers.set(1);
      renderer.render(scene,camera);
      camera.layers.mask=cameraLayerMask;
      renderer.shadowMap.needsUpdate=updateShadows;
      prepareReflectionCamera();
      renderer.setRenderTarget(reflection);
      // Keep uncovered reflection pixels transparent. The water shader adds
      // the sky exactly once behind premultiplied reflected objects/emission.
      const skyWasVisible=atmosphere.mesh.visible,previousBackground=scene.background,previousClear=renderer.getClearColor(new THREE.Color()).clone(),previousAlpha=renderer.getClearAlpha();
      try{
        atmosphere.mesh.visible=false;scene.background=null;renderer.setClearColor(0x000000,0);
        renderer.render(scene,mirrorCamera);
        if(effectsRenderer)effectsRenderer({renderer,target:reflection,camera:mirrorCamera,opaqueDepth:null,reflection:true,planeY:0,width:reflection.width,height:reflection.height});
      }finally{atmosphere.mesh.visible=skyWasVisible;scene.background=previousBackground;renderer.setClearColor(previousClear,previousAlpha);}
      succeeded=true;
      }finally{mesh.visible=previousVisibility;camera.layers.mask=previousLayers;if(!succeeded)renderer.shadowMap.needsUpdate=previousShadowDirty;renderer.setRenderTarget(previousTarget,previousFace,previousMip);}
    }
  };
}
