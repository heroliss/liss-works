// Celestial directions come from the locally vendored MIT Astronomy Engine.
// The stellar atlas is NASA SVS4851, linear catalog data, not a landscape photo.
import * as Astronomy from './assets/night/astronomy.js';
import {createCelestialController} from './celestial-controller.js';
import {createStarField,starFieldGLSL} from './star-field.js';

const RAD=Math.PI/180,TAU=2*Math.PI,AU_KM=149597870.7;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export const FULL_MOON_SOLAR_RATIO=2.2e-6;
export const NIGHT_STAR_SCALE=2e-7;
// The atlas and binary star catalogue are fetched once the Sun falls below this
// elevation (before the 10deg night-exposure ramp), or earlier on request.
export const NIGHT_ASSET_ELEVATION_DEGREES=12;
export const nightDefaults=Object.freeze({latitude:4.5,longitude:118.6,height:2,date:'2026-10-26T14:00:00.000Z',rotationDegrees:0,automaticExposure:true,moonIntensity:1,starIntensity:1});
export function sanitizeNight(patch={},previous=nightDefaults){
  const n={...previous};
  for(const [key,a,b]of [['latitude',-89.8,89.8],['longitude',-180,180],['height',0,5000],['moonIntensity',0,2],['starIntensity',0,4]])if(Number.isFinite(patch[key]))n[key]=clamp(patch[key],a,b);
  if(Number.isFinite(patch.rotationDegrees))n.rotationDegrees=((patch.rotationDegrees+180)%360+360)%360-180;
  if(typeof patch.automaticExposure==='boolean')n.automaticExposure=patch.automaticExposure;
  if(patch.date!==undefined){const d=new Date(patch.date);if(Number.isFinite(d.getTime()))n.date=d.toISOString();}
  return n;
}
const yaw=(v,degrees)=>{const a=-degrees*RAD,c=Math.cos(a),s=Math.sin(a);return [c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]];};
// East/up/SOUTH is a right-handed local frame. East/up/north would mirror the
// catalog when seen through a conventional Three.js camera.
const horizontalDirection=(altitude,azimuth)=>{const e=altitude*RAD,a=azimuth*RAD;return[Math.cos(e)*Math.sin(a),Math.sin(e),-Math.cos(e)*Math.cos(a)];};
export function nightEphemeris(settings=nightDefaults,elapsedSeconds=0){
  const n=sanitizeNight(settings),date=new Date(new Date(n.date).getTime()+elapsedSeconds*1000),observer=new Astronomy.Observer(n.latitude,n.longitude,n.height);
  const moon=Astronomy.Equator(Astronomy.Body.Moon,date,observer,true,true),moonH=Astronomy.Horizon(date,observer,moon.ra,moon.dec,'normal'),illumination=Astronomy.Illumination(Astronomy.Body.Moon,date);
  const sun=Astronomy.Equator(Astronomy.Body.Sun,date,observer,true,true),sunH=Astronomy.Horizon(date,observer,sun.ra,sun.dec,'normal');
  const rotation=Astronomy.Rotation_HOR_EQJ(date,observer),basis=[[0,-1,0],[0,0,1],[-1,0,0]].map(v=>Astronomy.RotateVector(rotation,new Astronomy.Vector(...v,date)));
  const pole=Astronomy.RotationAxis(Astronomy.Body.Moon,date).north;
  const poleH=Astronomy.RotateVector(Astronomy.Rotation_EQJ_HOR(date,observer),pole),moonPole=yaw([-poleH.y,poleH.z,-poleH.x],n.rotationDegrees);
  const libration=Astronomy.Libration(date);
  return {date:date.toISOString(),settings:n,worldToEquatorialColumns:basis.map(v=>[v.x,v.y,v.z]),moonDirection:yaw(horizontalDirection(moonH.altitude,moonH.azimuth),n.rotationDegrees),moonNorth:moonPole,
    astronomicalSunDirection:yaw(horizontalDirection(sunH.altitude,sunH.azimuth),n.rotationDegrees),moonAltitudeDegrees:moonH.altitude,moonAzimuthDegrees:(moonH.azimuth+n.rotationDegrees+360)%360,moonPhase:illumination.phase_fraction,moonPhaseAngleRadians:illumination.phase_angle*RAD,moonMagnitude:illumination.mag,
    moonSourceRatio:FULL_MOON_SOLAR_RATIO*Math.pow(10,-.4*(illumination.mag+12.74))*n.moonIntensity,
    moonAngularRadius:Math.asin(1737.4/(moon.dist*AU_KM)),moonLibrationRadians:[libration.elon*RAD,libration.elat*RAD],siderealHours:Astronomy.SiderealTime(date),
    coordinates:'Right-handed world+X=east,+Y=up,-Z=north before rotationDegrees; atlasICRF/J2000. Positive rotationDegrees increases geographic azimuth. Ephemeris includes topocentric lunar parallax and normal refraction; atlas rays have no per-star atmospheric refraction.',
    limits:['Sun slider is an independent artistic direction, not this timestamp ephemeris Sun.','NASA atlas colors and plotted sizes are visualization data, not absolute photometric radiance.','Lunar texture uses approximate libration and Lambert shading, not resolved terrain/Hapke transport.']};
}

// Stops relative to this application's daytime calibration. The renderer must
// apply preExposure before FP16 storage; OutputPass subtracts preExposureEV.
// Fraction of a high full Moon's ground illuminance (phase x altitude), 0..1.
export function moonIlluminationFraction(moonSourceRatio=0,moonAltitudeDegrees=-90){
  return clamp(moonSourceRatio/FULL_MOON_SOLAR_RATIO*Math.max(0,Math.sin(moonAltitudeDegrees*RAD)),0,1);
}
export function recommendedNightExposure(solarElevationDegrees,moonSourceRatio=0,moonAltitudeDegrees=-90,automatic=true){
  if(!automatic)return 0;
  const moonIllumination=moonIlluminationFraction(moonSourceRatio,moonAltitudeDegrees);
  const darkEV=21-3.8*Math.sqrt(moonIllumination),e=solarElevationDegrees;
  if(e>=10)return 0;
  if(e>=0)return 2*(1-smooth(0,10,e));
  if(e>=-6)return 2+6*smooth(0,6,-e);
  if(e>=-12)return 8+6*smooth(6,12,-e);
  return 14+(darkEV-14)*smooth(12,18,-e);
}

export const celestialDiscGLSL=/* glsl */`
  float celestialDiscCoverage(vec3 ray,vec3 direction,float radius){
    // Angular SDF avoids subtracting cos(radius) from nearly-one values.
    // L2 screen gradient has no fwidth L1 diamond-axis brightness preference.
    float angle=atan(length(cross(ray,direction)),dot(ray,direction));
    float width=max(length(vec2(dFdx(angle),dFdy(angle))),1e-7);
    return 1.0-smoothstep(radius-.5*width,radius+.5*width,angle);
  }
`;
export const nightSkyGLSL=/* glsl */`
  uniform highp sampler2D uNightStarMap,uMoonMap;
  uniform mat3 uEquatorialRotation;
  uniform vec3 uMoonDirection,uMoonRight,uMoonNorth,uMoonSunDirection;
  uniform vec2 uMoonLibration;
  uniform float uNightStarScale,uMoonRadius,uMoonRadiance,uCelestialRefraction;
  ${celestialDiscGLSL}
  ${starFieldGLSL}
  float stellarRefractionDegrees(float altitude){
    float h=max(-1.0,altitude);
    float refr=1.02/tan(radians(h+10.3/(h+5.11)))/60.0;
    return altitude< -1.0?refr*(altitude+90.0)/89.0:refr;
  }
  vec3 unrefractStellarRay(vec3 ray){
    if(uCelestialRefraction<.5)return ray;
    float apparent=degrees(asin(clamp(ray.y,-1.0,1.0))),geometric=apparent;
    for(int i=0;i<6;i++)geometric=apparent-stellarRefractionDegrees(geometric);
    float horizontal=max(length(ray.xz),1e-7),c=cos(radians(geometric));
    return vec3(ray.x*c/horizontal,sin(radians(geometric)),ray.z*c/horizontal);
  }
  vec3 celestialRadiance(vec3 rd,vec3 viewTransmission,float diskEnabled,float skyVisible){
    vec3 eq=normalize(uEquatorialRotation*unrefractStellarRay(rd));
    // NASA: atlas centerRA0, RA increases left. Both HDR and albedo textures
    // are explicitly flipY=true, so north is textureV1.
    vec2 uv=vec2(.5-atan(eq.y,eq.x)/6.28318530718,.5+asin(clamp(eq.z,-1.,1.))/3.14159265359);
    vec2 dx=dFdx(uv),dy=dFdy(uv);
    dx.x-=round(dx.x);dy.x-=round(dy.x);
    vec3 eqDx=dFdx(eq),eqDy=dFdy(eq);
    float disc=celestialDiscCoverage(rd,uMoonDirection,uMoonRadius);
    // Keep every lane alive through the final weighted return. In particular,
    // unconditional background textureGrad consumes the full-quad footprint;
    // no visibility early-return can remove a helper lane on the horizon edge.
    // Only the expensive derivative-free candidate loop and Moon sample skip.
    vec3 stars=textureGrad(uNightStarMap,uv,dx,dy).rgb*uNightStarScale
      +catalogueStellarRadiancePrepared(eq,uv,dx,dy,eqDx,eqDy,rd.y,skyVisible);
    vec3 lunar=vec3(0.);
    if(disc>0.0&&diskEnabled>0.0&&skyVisible>0.0){
      vec2 p=vec2(dot(rd,uMoonRight),dot(rd,uMoonNorth))/sin(uMoonRadius);
      float z=sqrt(max(0.,1.-min(.999999,dot(p,p))));
      vec3 normal=normalize(uMoonRight*p.x+uMoonNorth*p.y-uMoonDirection*z);
      vec3 surface=vec3(p.x,p.y*cos(uMoonLibration.y)+z*sin(uMoonLibration.y),z*cos(uMoonLibration.y)-p.y*sin(uMoonLibration.y));
      vec2 moonUV=vec2(.5+(atan(surface.x,surface.z)+uMoonLibration.x)/6.28318530718,.5+asin(clamp(surface.y,-1.,1.))/3.14159265359);
      vec3 albedo=textureLod(uMoonMap,moonUV,0.).rgb;
      lunar=albedo*2.4*max(dot(normal,uMoonSunDirection),0.)*uMoonRadiance*disc*diskEnabled;
    }
    return ((stars*(1.-disc*diskEnabled)+lunar)*viewTransmission)*skyVisible;
  }
  // Original unweighted API remains available to compatibility GPU helpers.
  vec3 celestialRadiance(vec3 rd,vec3 viewTransmission,float diskEnabled){
    return celestialRadiance(rd,viewTransmission,diskEnabled,1.);
  }
`;

export function createNightSky(THREE,initial={},{onLoad}={}){
  let settings=sanitizeNight(initial),lastTime=0,disposed=false,loadError=null,loaded=false,external=false,loading=null;
  const controller=createCelestialController({utcMs:Date.parse(settings.date),latitude:settings.latitude,longitude:settings.longitude,height:settings.height,northYawDeg:settings.rotationDegrees,mode:'artistic'});
  const starField=createStarField(THREE);
  const black=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat);black.needsUpdate=true;
  const uniforms={...starField.uniforms,uNightStarMap:{value:black},uMoonMap:{value:black},uEquatorialRotation:{value:new THREE.Matrix3()},uMoonDirection:{value:new THREE.Vector3()},uMoonRight:{value:new THREE.Vector3()},uMoonNorth:{value:new THREE.Vector3()},uMoonSunDirection:{value:new THREE.Vector3()},uMoonLibration:{value:new THREE.Vector2()},uNightStarScale:{value:NIGHT_STAR_SCALE},uMoonRadius:{value:.0047},uMoonRadiance:{value:0},uCelestialRefraction:{value:1}};
  let current;
  function applyCelestial(snapshot){
    const sourceRatio=snapshot.baseMoonSourceRatio??snapshot.moonSourceRatio;
    current={...snapshot,settings:{...settings},moonDirection:snapshot.moonDirection.slice(),moonNorth:snapshot.moonNorth.slice(),
      astronomicalSunDirection:snapshot.sunDirection.slice(),moonAltitudeDegrees:snapshot.moon.altitudeDeg,moonAzimuthDegrees:snapshot.moon.azimuthDeg,
      moonAngularRadius:snapshot.moon.angularRadius,baseMoonSourceRatio:sourceRatio,moonSourceRatio:sourceRatio*settings.moonIntensity};
    uniforms.uMoonDirection.value.fromArray(current.moonDirection);
    const north=new THREE.Vector3().fromArray(current.moonNorth),moon=uniforms.uMoonDirection.value;
    north.addScaledVector(moon,-north.dot(moon)).normalize();
    uniforms.uMoonNorth.value.copy(north);uniforms.uMoonRight.value.crossVectors(moon,north).normalize();
    uniforms.uMoonSunDirection.value.fromArray(current.moonSunDirection);uniforms.uMoonLibration.value.fromArray(current.moonLibrationRadians);uniforms.uMoonRadius.value=current.moonAngularRadius;
    const a=current.moonPhaseAngleRadians,lambert=Math.max(.0001,(Math.sin(a)+(Math.PI-a)*Math.cos(a))/Math.PI);
    // Only correct the non-Lambert phase-brightness relation, not local shape.
    // Source ratio is an integrated irradiance ratio and already includes
    // distance. Compensate apparent area once when converting it to radiance.
    const areaRatio=Math.sin(.00465)**2/Math.sin(current.moonAngularRadius)**2;
    uniforms.uMoonRadiance.value=32000*current.moonSourceRatio/lambert*areaRatio;
    const [x,y,z]=snapshot.worldToEquatorialColumns;
    uniforms.uEquatorialRotation.value.set(x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]);
    uniforms.uCelestialRefraction.value=snapshot.refraction==='standard'?1:0;
    uniforms.uNightStarScale.value=NIGHT_STAR_SCALE*settings.starIntensity;
  }
  function update(time=lastTime,force=false){
    if(!Number.isFinite(time))return;
    if(!external||force)applyCelestial(controller.update({time,dt:Math.max(0,time-lastTime)}));
    starField.update({time,epochJulianYear:current.epochJulianYear,starIntensity:settings.starIntensity});
    lastTime=time;
  }
  function setNight(patch={}){
    settings=sanitizeNight(patch,settings);
    const p={};for(const key of ['latitude','longitude','height'])if(patch[key]!==undefined)p[key]=settings[key];
    if(patch.date!==undefined)p.utcMs=Date.parse(settings.date);
    if(patch.rotationDegrees!==undefined)p.northYawDeg=settings.rotationDegrees;
    if(Object.keys(p).length){const base=external?{utcMs:current.utcMs,latitude:current.observer.latitudeDeg,longitude:current.observer.longitudeDeg,height:current.observer.heightM,northYawDeg:current.observer.northYawDeg}:{};external=false;applyCelestial(controller.configure({...base,...p}));}
    else if(current)applyCelestial(current);
    starField.update({time:lastTime,epochJulianYear:current.epochJulianYear,starIntensity:settings.starIntensity});
    return state();
  }
  function setCelestial(snapshot){
    external=true;
    settings={...settings,date:snapshot.date,latitude:snapshot.observer.latitudeDeg,longitude:snapshot.observer.longitudeDeg,height:snapshot.observer.heightM,rotationDegrees:snapshot.observer.northYawDeg};
    applyCelestial(snapshot);starField.update({time:lastTime,epochJulianYear:current.epochJulianYear,starIntensity:settings.starIntensity});return state();
  }
  const state=()=>({...current,settings:{...settings},currentDate:current.date,loaded,loadError,loadRequested:!!loading,externalClock:external,starMap:'NASA SVS4851 no-HIP/Tycho background + HIP/Tycho8.5 point kernels + diffuse complementary aggregate',starField:starField.diagnostics(),lunarMap:'NASA SVS4720,LRO1024x512,local',starScale:NIGHT_STAR_SCALE*settings.starIntensity,ephemerisRefreshSeconds:30,ephemerisInterpolation:'continuous endpoints; exact current EQJ rotation'});
  update(0,true);
  const browser=typeof document!=='undefined';
  let starTexture=null,moonTexture=null;
  // Daytime set: the small lunar albedo (the Moon can stand in a daytime sky)
  // and the star manifest photometry. dayReady settles with them.
  const moonReady=browser?new THREE.TextureLoader().loadAsync(new URL('./assets/night/lroc_color_poles_1k.jpg',import.meta.url).href).then(moon=>{
    if(disposed){moon.dispose();return null;}
    moonTexture=moon;
    moon.colorSpace=THREE.SRGBColorSpace;moon.flipY=true;moon.generateMipmaps=true;moon.minFilter=THREE.LinearMipmapLinearFilter;moon.magFilter=THREE.LinearFilter;moon.wrapS=THREE.RepeatWrapping;moon.wrapT=THREE.ClampToEdgeWrapping;moon.needsUpdate=true;
    moon.name='NASA LRO lunar albedo';uniforms.uMoonMap.value=moon;return moon;
  }):Promise.resolve(null);
  const dayReady=browser?Promise.all([moonReady,starField.manifestReady]).then(()=>state()).catch(error=>{loadError=String(error);throw error;}):Promise.resolve({loaded:false,reason:'Node CPU-only context'});
  dayReady.catch(()=>{});
  // Night set: the 4K Milky Way atlas and the binary star catalogue. Fetched
  // once, on first load() or ready access. Until then their samplers keep the
  // valid placeholders above, which contribute zero radiance.
  function load(){
    if(loading)return loading;
    loading=!browser?Promise.resolve({loaded:false,reason:'Node CPU-only context'}):disposed?Promise.resolve({loaded:false,disposed:true}):Promise.all([
      import('./vendor/addons/loaders/HDRLoader.js').then(({HDRLoader})=>new HDRLoader().setDataType(THREE.HalfFloatType).loadAsync(new URL('./assets/night/catalog/milkyway-4k.hdr',import.meta.url).href)),
      moonReady,
      starField.load()
    ]).then(([stars])=>{
      if(disposed){stars.dispose();return{loaded:false,disposed:true};}
      starTexture=stars;
      stars.colorSpace=THREE.LinearSRGBColorSpace;stars.flipY=true;stars.generateMipmaps=true;stars.minFilter=THREE.LinearMipmapLinearFilter;stars.magFilter=THREE.LinearFilter;stars.wrapS=THREE.RepeatWrapping;stars.wrapT=THREE.ClampToEdgeWrapping;stars.anisotropy=4;stars.needsUpdate=true;
      stars.name='NASA catalog stellar radiance + Milky Way / ICRF J2000';uniforms.uNightStarMap.value=stars;loaded=true;
      const result=state();
      try{onLoad?.(result);}catch(error){console.warn('Night sky onLoad:',error);}
      return result;
    }).catch(error=>{loadError=String(error);throw error;});
    // Retain rejection on ready for callers while avoiding an unhandled global
    // promise if a client intentionally does not await asset loading.
    loading.catch(()=>{});
    return loading;
  }
  return{uniforms,dayReady,load,get ready(){return load();},update,setNight,setCelestial,prepareStarView(camera,options){starField.update({time:uniforms.uStarPhysicalTime.value,epochJulianYear:current.epochJulianYear,starIntensity:settings.starIntensity});return starField.prepareView(camera,{...options,frame:{...options?.frame,starIntensity:settings.starIntensity}});},getRadianceBound:()=>{const b=starField.getRadianceBound();return {...b,maxRGB:b.maxRGB+NIGHT_STAR_SCALE*settings.starIntensity};},getStellarMeanRGB:()=>{const mean=starField.meanPhysicalRGB(),m=starField.manifest;return mean&&m?mean.map((v,i)=>v+m.photometry.NASAbackgroundRGBIntegral[i]/(4*Math.PI)*NIGHT_STAR_SCALE*settings.starIntensity):null;},captureSnapshot:()=>({current:structuredClone(current),settings:{...settings},external,stars:starField.captureSnapshot()}),withSnapshot(snapshot,fn){const saved={current,settings,external};try{settings={...snapshot.settings};external=snapshot.external;applyCelestial(snapshot.current);return starField.withSnapshot(snapshot.stars,fn);}finally{settings=saved.settings;external=saved.external;applyCelestial(saved.current);}},get state(){return state();},get physical(){return current;},get settings(){return {...settings};},dispose(){if(disposed)return;disposed=true;starTexture?.dispose();moonTexture?.dispose();black.dispose();starField.dispose();}};
}
