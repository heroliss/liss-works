// Continuous UTC controller over the locally pinned MIT Astronomy Engine.
// Physical seconds and astronomical UTC are deliberately independent clocks.
import * as Astronomy from './assets/night/astronomy.js';

const RAD=Math.PI/180,AU_KM=149597870.7,DAY_MS=86400000;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),mod=(x,n)=>(x%n+n)%n;
const norm=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
const lerp=(a,b,t)=>a+(b-a)*t;
const vectorLerp=(a,b,t)=>norm(a.map((v,i)=>lerp(v,b[i],t)));
const angleLerp=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const copy=value=>JSON.parse(JSON.stringify(value));
const yaw=(v,degrees)=>{const a=-degrees*RAD,c=Math.cos(a),s=Math.sin(a);return[c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]];};
export const legacyAzimuthToGeographic=degrees=>mod(180-degrees,360);
export const geographicAzimuthToLegacy=legacyAzimuthToGeographic;
export function horizontalWorldDirection(altitude,azimuth,northYaw=0){
  const e=altitude*RAD,a=azimuth*RAD;
  return yaw([Math.cos(e)*Math.sin(a),Math.sin(e),-Math.cos(e)*Math.cos(a)],northYaw);
}
export function celestialRotationColumns(utcMs,observer){
  const date=new Date(utcMs),o=new Astronomy.Observer(observer.latitudeDeg,observer.longitudeDeg,observer.heightM);
  const rotation=Astronomy.Rotation_HOR_EQJ(date,o);
  const basis=[[0,-1,0],[0,0,1],[-1,0,0]].map(v=>{const q=Astronomy.RotateVector(rotation,new Astronomy.Vector(...v,date));return[q.x,q.y,q.z];});
  // Inverse of the geographic heading rotation for world -> EQJ rays.
  const a=-observer.northYawDeg*RAD,c=Math.cos(a),s=Math.sin(a);
  return [basis[0].map((v,i)=>c*v+s*basis[2][i]),basis[1],basis[0].map((v,i)=>-s*v+c*basis[2][i])];
}
export function exactCelestialEphemeris(utcMs,observer,refraction='standard'){
  const date=new Date(utcMs),o=new Astronomy.Observer(observer.latitudeDeg,observer.longitudeDeg,observer.heightM);
  const body=(name,radius)=>{
    const q=Astronomy.Equator(name,date,o,true,true),g=Astronomy.Horizon(date,o,q.ra,q.dec,null);
    const apparent=Astronomy.Horizon(date,o,q.ra,q.dec,refraction==='standard'?'normal':null);
    return {geometricDirection:horizontalWorldDirection(g.altitude,g.azimuth,observer.northYawDeg),
      direction:horizontalWorldDirection(apparent.altitude,apparent.azimuth,observer.northYawDeg),
      altitudeDeg:apparent.altitude,geometricAltitudeDeg:g.altitude,azimuthDeg:mod(apparent.azimuth+observer.northYawDeg,360),
      distanceAU:q.dist,angularRadius:Math.asin(radius/(q.dist*AU_KM))};
  };
  const sun=body(Astronomy.Body.Sun,695700),moon=body(Astronomy.Body.Moon,1737.4);
  const illumination=Astronomy.Illumination(Astronomy.Body.Moon,date),rotation=Astronomy.Rotation_EQJ_HOR(date,o);
  const toWorld=v=>{const h=Astronomy.RotateVector(rotation,v);return yaw(norm([-h.y,h.z,-h.x]),observer.northYawDeg);};
  const pole=Astronomy.RotationAxis(Astronomy.Body.Moon,date).north;
  const sv=Astronomy.GeoVector(Astronomy.Body.Sun,date,true),mv=Astronomy.GeoVector(Astronomy.Body.Moon,date,true);
  const moonToSun=new Astronomy.Vector(sv.x-mv.x,sv.y-mv.y,sv.z-mv.z,date),libration=Astronomy.Libration(date);
  return {utcMs,sun,moon,moonNorth:toWorld(pole),moonSunDirection:toWorld(moonToSun),
    moonPhase:illumination.phase_fraction,moonPhaseAngleRadians:illumination.phase_angle*RAD,moonMagnitude:illumination.mag,
    moonSourceRatio:2.2e-6*Math.pow(10,-.4*(illumination.mag+12.74)),
    moonLibrationRadians:[libration.elon*RAD,libration.elat*RAD]};
}

export function createCelestialController(initial={}){
  let settings={utcMs:Date.parse('2026-10-26T14:00:00Z'),latitude:4.5,longitude:118.6,height:2,
    northYawDeg:0,timeZoneOffsetMinutes:480,rate:1,running:true,mode:'astronomical',refraction:'standard'};
  let revision=0,lastTime=null,cache=null,current=null,ephemerisCalls=0,updates=0;
  function configure(patch={}){
    const before=JSON.stringify([settings.utcMs,settings.latitude,settings.longitude,settings.height,settings.northYawDeg,settings.mode,settings.refraction]);
    const aliases={latitudeDeg:'latitude',longitudeDeg:'longitude',heightM:'height',rotationDegrees:'northYawDeg'};
    patch={...patch};for(const [a,b]of Object.entries(aliases))if(patch[a]!==undefined&&patch[b]===undefined)patch[b]=patch[a];
    for(const [key,a,b]of [['latitude',-89.8,89.8],['longitude',-180,180],['height',0,5000],['rate',-6000,6000],['timeZoneOffsetMinutes',-840,840]])if(Number.isFinite(patch[key]))settings[key]=clamp(patch[key],a,b);
    if(Number.isFinite(patch.northYawDeg))settings.northYawDeg=mod(patch.northYawDeg+180,360)-180;
    const time=patch.utcMs??patch.utcISO??patch.date;
    if(time!==undefined){const parsed=typeof time==='number'?time:Date.parse(time);if(Number.isFinite(parsed))settings.utcMs=clamp(parsed,Date.UTC(1800,0,1),Date.UTC(2200,0,1));}
    if(typeof patch.running==='boolean')settings.running=patch.running;
    if(['astronomical','artistic'].includes(patch.mode))settings.mode=patch.mode;
    if(['standard','none'].includes(patch.refraction))settings.refraction=patch.refraction;
    const after=JSON.stringify([settings.utcMs,settings.latitude,settings.longitude,settings.height,settings.northYawDeg,settings.mode,settings.refraction]);
    if(before!==after){revision++;cache=null;}
    current=evaluate();return copy(current);
  }
  function evaluate(){
    const observer={latitudeDeg:settings.latitude,longitudeDeg:settings.longitude,heightM:settings.height,northYawDeg:settings.northYawDeg};
    const span=30000,start=Math.floor(settings.utcMs/span)*span;
    if(!cache||cache.start!==start){cache={start,a:exactCelestialEphemeris(start,observer,settings.refraction),b:exactCelestialEphemeris(start+span,observer,settings.refraction)};ephemerisCalls+=2;}
    const t=(settings.utcMs-start)/span,a=cache.a,b=cache.b;
    const body=name=>{
      const x=a[name],y=b[name],d=vectorLerp(x.direction,y.direction,t),g=vectorLerp(x.geometricDirection,y.geometricDirection,t);
      return {direction:d,geometricDirection:g,altitudeDeg:Math.asin(clamp(d[1],-1,1))/RAD,
        geometricAltitudeDeg:Math.asin(clamp(g[1],-1,1))/RAD,azimuthDeg:mod(Math.atan2(d[0],-d[2])/RAD,360),
        distanceAU:lerp(x.distanceAU,y.distanceAU,t),angularRadius:lerp(x.angularRadius,y.angularRadius,t)};
    };
    const sun=body('sun'),moon=body('moon');
    return {utcMs:settings.utcMs,date:new Date(settings.utcMs).toISOString(),observer,mode:settings.mode,refraction:settings.refraction,
      rate:settings.rate,running:settings.running,timeZoneOffsetMinutes:settings.timeZoneOffsetMinutes,
      sun,moon,sunDirection:sun.direction,moonDirection:moon.direction,sunGeometricDirection:sun.geometricDirection,moonGeometricDirection:moon.geometricDirection,
      angularRadii:{sun:sun.angularRadius,moon:moon.angularRadius},worldToEquatorialColumns:celestialRotationColumns(settings.utcMs,observer),
      moonNorth:vectorLerp(a.moonNorth,b.moonNorth,t),moonSunDirection:vectorLerp(a.moonSunDirection,b.moonSunDirection,t),
      moonPhase:lerp(a.moonPhase,b.moonPhase,t),moonPhaseAngleRadians:lerp(a.moonPhaseAngleRadians,b.moonPhaseAngleRadians,t),
      moonMagnitude:lerp(a.moonMagnitude,b.moonMagnitude,t),moonSourceRatio:lerp(a.moonSourceRatio,b.moonSourceRatio,t),
      moonLibrationRadians:a.moonLibrationRadians.map((v,i)=>angleLerp(v,b.moonLibrationRadians[i],t)),
      physicalSkyRevision:revision,epochJulianYear:2000+(settings.utcMs-Date.UTC(2000,0,1,12))/(365.25*DAY_MS),
      coordinates:'+X east,+Y up,-Z north; geographic azimuth north clockwise; worldToEQJ applies inverse heading; standard refraction is Astronomy Engine normal',
      interpolation:{utcSpanSeconds:30,continuous:true,moonAndSun:'normalized vector interpolation between exact topocentric endpoints',rotation:'exact current-UTC Astronomy Engine transform'},
      diagnostics:{updates,ephemerisCalls},limits:['Astronomy Engine nominal arcminute-class; not a measurement-grade ephemeris','standard refraction uses a prescribed atmosphere, not current humidity sounding','historical UTC/UT1 and proper motion are approximations']};
  }
  function update({time,dt,paused=false}={}){
    const step=Number.isFinite(dt)?Math.max(0,dt):Number.isFinite(time)&&lastTime!==null?Math.max(0,time-lastTime):0;
    if(!paused&&settings.running)settings.utcMs+=step*1000*settings.rate;
    if(Number.isFinite(time))lastTime=time;
    updates++;current=evaluate();return copy(current);
  }
  configure(initial);
  return {configure,update,get state(){return copy(current);}};
}
