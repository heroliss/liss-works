// Shared by geometry, optical normals, and refracted sunlight. Metres/seconds.
// Gravity-capillary dispersion: omega²=(g*k+sigma/rho*k³)*tanh(k*h).
// h=3 m is the fine-wave reference depth. Resolved long waves use bathymetry.
// A narrow directional swell and a broader peaked wind sea are separate wave
// systems. Fixed seeded phases interfere into moving groups: no frame-random
// noise or arbitrary envelope is multiplied onto the shared height field.
// Four periodic GPU fields keep the same sample/pass budget; mipmapped slope
// moments retain the unresolved energy for the water BRDF.
export const seaStateDefaults=Object.freeze({swellHeight:.16,windSea:1});
export const SWELL_PEAK_PERIOD=7.5;
export const WAVE_REFERENCE_DEPTH=3;
export function waveOmega(k,depth=WAVE_REFERENCE_DEPTH){return Math.sqrt((9.81*k+.000070244*k**3)*Math.tanh(Math.min(k*depth,4)));}
export function waveNumber(omega,depth=WAVE_REFERENCE_DEPTH){
  let lo=0,hi=Math.max(1,omega*omega/9.81+omega/Math.sqrt(9.81*depth));
  while(waveOmega(hi,depth)<omega)hi*=2;
  for(let i=0;i<52;i++){const mid=(lo+hi)*.5;if(waveOmega(mid,depth)<omega)lo=mid;else hi=mid;}
  return(lo+hi)*.5;
}
export function sanitizeSeaState(next={},previous=seaStateDefaults){
  const result={...previous};
  if(Number.isFinite(next.swellHeight))result.swellHeight=Math.max(0,Math.min(.32,next.swellHeight));
  if(Number.isFinite(next.windSea))result.windSea=Math.max(0,Math.min(1.5,next.windSea));
  return result;
}
export function waveComponentGain(component,windFactor=1,seaState=seaStateDefaults){
  return component.kind==='swell'?seaState.swellHeight/seaStateDefaults.swellHeight:Math.max(0,windFactor)*seaState.windSea;
}
export const waveCascades=[
  {domain:1021,lo:.075,hi:.65,count:64,kind:'swell',significantHeight:seaStateDefaults.swellHeight,peakPeriod:SWELL_PEAK_PERIOD,direction:-.68,directionSpread:.14},
  {domain:137,lo:.65,hi:3,count:64,kind:'wind sea',slopeRMS:.025,peakPeriod:2.2,direction:.36,directionSpread:.52},
  {domain:29,lo:3,hi:14,count:64,kind:'short wind waves',slopeRMS:.055,direction:.36,directionSpread:.62},
  {domain:5.3,lo:14,hi:100,count:64,kind:'gravity-capillary tail',slopeRMS:.090,direction:.36,directionSpread:.75},
];
export const waveComponents=[];
for(let cascade=0;cascade<waveCascades.length;cascade++){
  const band=waveCascades[cascade],modes=[],seen=new Set();
  // Independent per-cascade seeds make changes to swell sampling unable to
  // silently reshuffle the short-wave phases.
  let seed=(40319+cascade*104729)|0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
  const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-9,random())))*Math.cos(2*Math.PI*random());
  for(let i=0;i<band.count;i++){
    let modeX,modeZ,k,angle,key;
    do{
      // Sample swell power from a Gaussian frequency distribution, with a
      // 16% standard deviation around its 7.5 s peak. Wind modes cover log-k.
      const targetK=cascade===0?waveNumber(2*Math.PI/band.peakPeriod*(1+.16*gaussian())):band.lo*Math.pow(band.hi/band.lo,random());
      angle=band.direction+gaussian()*band.directionSpread;
      modeX=Math.round(Math.cos(angle)*targetK*band.domain/(2*Math.PI));
      modeZ=Math.round(Math.sin(angle)*targetK*band.domain/(2*Math.PI));
      k=2*Math.PI*Math.hypot(modeX,modeZ)/band.domain;key=`${modeX},${modeZ}`;
    }while(k<band.lo||k>band.hi||seen.has(key));
    seen.add(key);angle=Math.atan2(modeZ,modeX);
    let amplitude=Math.sqrt(-2*Math.log(Math.max(1e-9,random())))/(cascade===0?1:k);
    if(cascade===1){
      // JONSWAP-shaped frequency weighting, not a wind-growth/fetch solve.
      // Log-k importance weights need S(omega)*domega/dlog(k), rather than
      // treating equal log-k bins as equal frequency bins.
      const omega=waveOmega(k),peak=2*Math.PI/band.peakPeriod,sigma=omega<peak?.07:.09;
      const enhancement=Math.exp(-.5*((omega/peak-1)/sigma)**2);
      const spectrum=omega**-5*Math.exp(-1.25*(peak/omega)**4)*3.3**enhancement;
      const kh=k*3,t=Math.tanh(Math.min(kh,4));
      const derivative=((9.81+3*.000070244*k*k)*t+(kh<4?(9.81*k+.000070244*k**3)*3*(1-t*t):0))/(2*omega);
      amplitude=Math.sqrt(-2*Math.log(Math.max(1e-9,random())))*Math.sqrt(spectrum*derivative*k);
    }
    modes.push({k,amplitude,angle,phase:random()*2*Math.PI,modeX,modeZ,cascade,domain:band.domain,kind:cascade===0?'swell':'wind'});
  }
  const measured=Math.sqrt(modes.reduce((sum,w)=>sum+(w.amplitude*(cascade===0?1:w.k))**2/2,0));
  const target=cascade===0?band.significantHeight/4:band.slopeRMS;
  for(const mode of modes){mode.amplitude*=target/measured;waveComponents.push(mode);}
  if(cascade===0)band.slopeRMS=Math.sqrt(modes.reduce((sum,w)=>sum+(w.amplitude*w.k)**2/2,0));
}
export const waveStatistics={components:waveComponents.length,rmsSlope:Math.sqrt(waveComponents.reduce((s,w)=>s+(w.amplitude*w.k)**2/2,0)),rmsHeight:Math.sqrt(waveComponents.reduce((s,w)=>s+w.amplitude*w.amplitude/2,0))};
waveStatistics.significantHeight=4*waveStatistics.rmsHeight;
waveStatistics.swellSignificantHeight=seaStateDefaults.swellHeight;
waveStatistics.swellPeakPeriod=SWELL_PEAK_PERIOD;
waveStatistics.referenceDepthMetres=WAVE_REFERENCE_DEPTH;
waveStatistics.specularExposureSeconds=1/120;
waveStatistics.temporalSlopeVariance=waveComponents.reduce((sum,w)=>sum+.5*(w.amplitude*w.k*waveOmega(w.k))**2,0)*waveStatistics.specularExposureSeconds**2/12;
for(const kind of ['swell','wind']){
  const modes=waveComponents.filter(w=>w.kind===kind);
  waveStatistics[`${kind}RmsSlope`]=Math.sqrt(modes.reduce((s,w)=>s+(w.amplitude*w.k)**2/2,0));
  waveStatistics[`${kind}TemporalSlopeVariance`]=modes.reduce((s,w)=>s+.5*(w.amplitude*w.k*waveOmega(w.k))**2,0)*waveStatistics.specularExposureSeconds**2/12;
}
// Cox–Munk's measured total slope variance grows approximately linearly with
// wind speed. Wave amplitude therefore grows with sqrt(variance), not speed.
// Below a very light breeze we fade this authored wind sea away; swell remains.
export function waveWindFactor(speed){const u=Math.max(0,Number(speed)||0),t=Math.min(1,u/.35);return Math.sqrt((.003+.00512*u)/(.003+.00512*1.8))*t*t*(3-2*t);}
// CPU probes/audio/float transport can use the same component gains. This is
// the analytic spectrum only; the separately solved SWE texture is not read.
export function evaluateWaveSpectrum(x,z,time,{windFactor=1,currentOffset=[0,0],seaState=seaStateDefaults}={}){
  const f=[0,0,0];
  for(const w of waveComponents){const dx=Math.cos(w.angle),dz=Math.sin(w.angle),a=((x-currentOffset[0])*dx+(z-currentOffset[1])*dz)*w.k-waveOmega(w.k)*time+w.phase,gain=waveComponentGain(w,windFactor,seaState),derivative=w.amplitude*w.k*Math.cos(a)*gain;f[0]+=w.amplitude*Math.sin(a)*gain;f[1]+=dx*derivative;f[2]+=dz*derivative;}
  return f;
}
const gl=x=>Number(x).toFixed(8);
const spectralSum=waveComponents.map(w=>`f+=spectralWave(p,vec2(${gl(Math.cos(w.angle))},${gl(Math.sin(w.angle))}),${gl(w.k)},${gl(w.amplitude)},${gl(w.phase)})*${w.kind==='swell'?'uSwell':'(uWind*uWindSea)'};`).join('\n');
export const waveGLSL=/* glsl */`
  uniform float uTime;
  uniform vec4 uRipples[8];
  uniform float uWind;
  uniform float uSwell;
  uniform float uWindSea;
  uniform vec2 uMeanCurrent;
  uniform vec2 uCurrentOffset;
  uniform vec2 uRippleOffsets[8];
  uniform highp sampler2D uHydroState;
  uniform float uHydroExtent;
  uniform float uHydroResolution;
  uniform float uHydroEnabled;
  uniform highp sampler2D uWave0,uWave1,uWave2,uWave3;
  uniform vec4 uWaveDomains;
  uniform float uWaveResolution;
  float unresolvedSlopeVariance=0.;
  #ifdef OPTICAL_PASS
    float opticalFootprint=0.;
  #endif
  vec3 spectralWave(vec2 p,vec2 direction,float k,float amplitude,float phase){
    #ifdef OPTICAL_PASS
      amplitude*=1.-smoothstep(1.,3.14159,k*opticalFootprint);
    #endif
    #ifdef CAUSTICS_PASS
      #ifdef CAUSTIC_LOW_QUALITY
        amplitude*=1.-smoothstep(6.,10.,k);
      #else
        amplitude*=1.-smoothstep(12.,19.,k);
      #endif
    #endif
    #ifdef GEOMETRY_PASS
      amplitude*=1.-smoothstep(5.,9.,k);
    #endif
    float omega=sqrt((9.81*k+0.000070244*k*k*k)*tanh(min(k*3.,4.)));
    float a=dot(p-uCurrentOffset,direction)*k-omega*uTime+phase;
    float derivative=amplitude*k*cos(a);
    return vec3(amplitude*sin(a),direction*derivative);
  }
  float resolvedHeight(vec2 p){
    if(uHydroEnabled<.5)return 0.;
    if(max(abs(p.x),abs(p.y))>=uHydroExtent*.98)return 0.;
    float mask=1.-smoothstep(uHydroExtent*.84,uHydroExtent*.98,max(abs(p.x),abs(p.y)));
    return textureLod(uHydroState,p/(2.*uHydroExtent)+.5,0.0).r*mask;
  }
  vec4 spectrumSample(highp sampler2D field,vec2 p,float domain,float footprint){
    float lod=max(0.,log2(max(1.,footprint*uWaveResolution/domain)));
    return textureLod(field,(p-uCurrentOffset)/domain,lod);
  }
  vec3 sampledSpectrum(vec2 p){
    float footprint=.028;
    #ifdef OPTICAL_PASS
      footprint=max(.003,opticalFootprint*1.05);
    #endif
    #ifdef GEOMETRY_PASS
      footprint=.40;
    #endif
    #ifdef CAUSTICS_PASS
      #ifdef CAUSTIC_LOW_QUALITY
        footprint=.32;
      #else
        footprint=.12;
      #endif
    #endif
    vec4 a=spectrumSample(uWave0,p,uWaveDomains.x,footprint);
    vec4 b=spectrumSample(uWave1,p,uWaveDomains.y,footprint);
    vec4 c=spectrumSample(uWave2,p,uWaveDomains.z,footprint);
    vec4 d=spectrumSample(uWave3,p,uWaveDomains.w,footprint);
    // E(|s|²) - |E(s)|²: missing fine slopes broaden reflection instead of
    // vanishing into a mirror. Each independent cascade contributes variance.
    float windGain=uWind*uWindSea;
    unresolvedSlopeVariance=max(0.,a.w-dot(a.yz,a.yz))*uSwell*uSwell+(max(0.,b.w-dot(b.yz,b.yz))+max(0.,c.w-dot(c.yz,c.yz))+max(0.,d.w-dot(d.yz,d.yz)))*windGain*windGain;
    return a.xyz*uSwell+(b.xyz+c.xyz+d.xyz)*windGain;
  }
  vec3 waterField(vec2 p){
    vec3 f=vec3(0.);
    #ifdef BAKED_WAVE_TEXTURES
    f=sampledSpectrum(p);
    #else
    ${spectralSum}
    #endif
    for(int i=0;i<8;i++){
      float age=uTime-uRipples[i].z;
      if(age>0. && age<8.){
        vec2 delta=p-uRipples[i].xy-uCurrentOffset+uRippleOffsets[i];
        float d=max(length(delta),.001);
        // A gravity-capillary packet has distinct phase and group velocities.
        // k=11 rad/m in the same 3 m reference layer: cp≈.945, cg≈.473 m/s.
        float ring=d-age*.47320299;
        float phase=11.*d-10.39247299*age;
        float envelope=exp(-ring*ring*4.0)*exp(-age*.38)/sqrt(1.+d);
        float a=.065*uRipples[i].w;
        float h=sin(phase)*envelope*a;
        float derivative=(11.*cos(phase)-8.*ring*sin(phase)-.5*sin(phase)/(1.+d))*envelope*a;
        f+=vec3(h,delta/d*derivative);
      }
    }
    if(uHydroEnabled>.5){
      float stepSize=2.*uHydroExtent/uHydroResolution;
      float hx=(resolvedHeight(p+vec2(stepSize,0))-resolvedHeight(p-vec2(stepSize,0)))/(2.*stepSize);
      float hz=(resolvedHeight(p+vec2(0,stepSize))-resolvedHeight(p-vec2(0,stepSize)))/(2.*stepSize);
      f+=vec3(resolvedHeight(p),hx,hz);
    }
    return f;
  }
  float surface(vec2 p){return waterField(p).x;}
  vec3 surfaceNormal(vec2 p){vec3 f=waterField(p);return normalize(vec3(-f.y,1.,-f.z));}
`;
