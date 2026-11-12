/* Original real-time atmosphere and world-space volume cloud layer.
 * Single scattering + a bounded diffuse cloud-light approximation, not full
 * spectral/multiple-scattering transport or a fluid weather simulation.
 * https://ebruneton.github.io/precomputed_atmospheric_scattering/
 * https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn
 * https://sebh.github.io/publications/
 * https://www.noaa.gov/jetstream/clouds/how-clouds-form
 */

import { createWeatherController } from './weather.js';
import { createNightSky,nightSkyGLSL,recommendedNightExposure,moonIlluminationFraction,NIGHT_STAR_SCALE,NIGHT_ASSET_ELEVATION_DEGREES } from './night-sky.js';

const EARTH=6360000,TOP=6460000,HR=8000,HM=1200;
const BR=[5.802e-6,13.558e-6,33.1e-6],BM=3.996e-6,BO=[0.650e-6,1.881e-6,0.085e-6];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const mod=(x,n)=>((x%n)+n)%n;
const luminance=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
export function solarTransmittance(elevationRadians,height=2,mieScale=1){
  const mu=Math.sin(elevationRadians),h=Math.max(0,height),horizon=-Math.sqrt(2*h/EARTH),visible=smooth(horizon-.00465,horizon+.00465,mu);
  if(visible<=0)return [0,0,0];
  const r=exponentialAtmosphereColumn(h,mu,HR),m=exponentialAtmosphereColumn(h,mu,HM);
  const ozone=h<10000?15000:h<25000?15000-(h-10000)*(h-10000)/30000:Math.pow(Math.max(0,40000-h),2)/30000;
  const mass=exponentialAtmosphereColumn(h,mu,25000)/Math.max(1e-12,25000*Math.exp(-h/25000));
  return BR.map((b,i)=>Math.exp(-(b*r+BM*m*Math.max(0,mieScale)+BO[i]*ozone*mass))*visible);
}

// Spherical parabolic Chapman column: finite at the horizon, unlike a
// daytime-only plane-parallel airmass extrapolation below the horizon.
export function exponentialAtmosphereColumn(height,mu,scaleHeight){
  const h=Math.max(0,height),x=Math.sqrt((EARTH+h)/(2*scaleHeight))*mu,a=Math.abs(x);
  let erfcx;
  if(a>4){const q=1/(a*a);erfcx=(1-.5*q+.75*q*q-1.875*q*q*q+6.5625*q**4)/(Math.sqrt(Math.PI)*a);}
  else{const t=1/(1+.3275911*a);erfcx=t*(.254829592+t*(-.284496736+t*(1.421413741+t*(-1.453152027+t*1.061405429))));}
  const factor=Math.sqrt(Math.PI*(EARTH+h)*scaleHeight/2),vertical=Math.exp(-h/scaleHeight);
  return factor*(x>=0?vertical*erfcx:Math.max(0,2*Math.exp(Math.min(60,-h/scaleHeight+x*x))-vertical*erfcx));
}
function clearRadianceCPU(rd,sun,mieScale=1){
  const origin=[0,EARTH+2,0],b=origin[1]*rd[1],r=EARTH+2,rayLength=-b+Math.sqrt(b*b-(r-TOP)*(r+TOP)),mu=rd.reduce((s,v,i)=>s+v*sun[i],0);
  const hg=(c,g)=>(1-g*g)/(4*Math.PI*Math.max(.0001,1+g*g-2*g*c)**1.5),phaseR=3/(16*Math.PI)*(1+mu*mu),phaseM=hg(mu,.76),optical=[0,0,0],radiance=[0,0,0];
  for(let i=0;i<8;i++){
    const a=i/8,z=(i+1)/8,d=.5*(a*a+z*z)*rayLength,ds=(z*z-a*a)*rayLength,p=[rd[0]*d,origin[1]+rd[1]*d,rd[2]*d],length=Math.hypot(...p),h=Math.max(0,length-EARTH),density=[Math.exp(-h/HR),Math.exp(-h/HM),Math.max(0,1-Math.abs(h-25000)/15000)];
    const st=solarTransmittance(Math.asin(clamp(p.reduce((s,v,j)=>s+v*sun[j],0)/length,-1,1)),h,mieScale);
    for(let c=0;c<3;c++){const view=Math.exp(-(BR[c]*(optical[0]+density[0]*ds*.5)+BM*mieScale*(optical[1]+density[1]*ds*.5)+BO[c]*(optical[2]+density[2]*ds*.5)));radiance[c]+=view*st[c]*(BR[c]*density[0]*phaseR+BM*mieScale*.9*density[1]*phaseM)*ds;}
    density.forEach((v,j)=>optical[j]+=v*ds);
  }
  return radiance.map((v,c)=>v*22+(1-Math.exp(-(BR[c]*optical[0]+BM*mieScale*optical[1]+BO[c]*optical[2])))*[.006,.010,.017][c]*Math.max(0,sun[1]+.12));
}
// Uniform upper-hemisphere closure: E=pi*L for its irradiance, while
// normalized isotropic scattering sees J=(2*pi*L)/(4*pi)=E/(2*pi).
// This is one diffuse transport iteration, not a full angular/LUT solve.
export function diffuseAirRadianceFromIrradiance(irradianceRGB,strength=1){
  if(!Array.isArray(irradianceRGB)||irradianceRGB.length!==3||!irradianceRGB.every(v=>Number.isFinite(v)&&v>=0)||!Number.isFinite(strength)||strength<0||strength>1)throw new RangeError('Diffuse air requires nonnegative finite RGB irradiance and strength0..1');
  return irradianceRGB.map(v=>v*strength/(2*Math.PI));
}
export function clearSkyIrradiance(sun,mieScale=1){
  const result=[0,0,0],n=16;
  for(let i=0;i<n;i++){const u=(i+.5)/n,phi=i*2.399963229728653,r=Math.sqrt(u),rd=[r*Math.sin(phi),Math.sqrt(1-u),r*Math.cos(phi)],L=clearRadianceCPU(rd,sun,mieScale);L.forEach((v,c)=>result[c]+=v*Math.PI/n);}
  return result;
}

// This exact density function is also exported for terrain/foliage direct
// sunlight. The background, cube faces and local shadows share its uniforms.
export const cloudShadowGLSL=/* glsl */`
  uniform highp sampler3D uCloudNoise;
  uniform highp sampler2D uCloudWeather;
  uniform vec2 uCloudOffset,uCloudWeatherOrigin,uCloudShearOffset;
  uniform float uCloudTime,uCloudBase,uCloudTop,uCloudCoverage,uCloudExtinction,uCloudMoisture,uCloudShapeBlend,uCloudBaseContinuity;
  uniform vec3 sunPosition,uCloudLightDirection;
  const float cloudEarthRadius=6360000.0;
  float cloudAltitude(vec3 p){
    // Rationalize sqrt(R² + q) - R. Subtracting two 6.36-million-metre
    // floats quantized low cloud altitude into ~0.5 m shelves on the GPU.
    // This is the same spherical altitude, with sub-millimetre local precision.
    float q=p.x*p.x+p.z*p.z+p.y*(2.0*cloudEarthRadius+p.y);
    return q/(sqrt(cloudEarthRadius*cloudEarthRadius+q)+cloudEarthRadius);
  }
  float atmosphereCloudDensity(vec3 p,float time,float lod){
    float altitude=cloudAltitude(p);
    if(altitude<=uCloudBase||altitude>=uCloudTop||uCloudCoverage<=0.0)return 0.0;
    float layerHeight=uCloudTop-uCloudBase;
    float h=(altitude-uCloudBase)/layerHeight;
    // Height-dependent integrated advection is a kinematic wind profile.
    // The weather footprint, shape and erosion all use the same sheared frame.
    vec2 parcelXZ=p.xz-uCloudOffset-uCloudShearOffset*(altitude-uCloudBase)/1000.0;
    vec2 weatherUV=parcelXZ/64000.0+uCloudWeatherOrigin;
    // Explicit LOD is mandatory here: cloud marches may exit per fragment.
    // Implicit derivatives inside that varying loop are undefined on ANGLE.
    // The weather texture has only level zero, matching CPU bilinear sampling.
    vec4 weather=textureLod(uCloudWeather,weatherUV,0.0);
    // A regional map controls where ascent is available, not the silhouette
    // of an ellipsoid. More coverage activates weak thermals and fills gaps.
    float availability=weather.r-(0.54-0.40*uCloudCoverage);
    if(availability<-0.10)return 0.0;
    float region=smoothstep(-0.10,0.38,availability);
    vec2 noiseXZ=mat2(.81915204,.57357644,-.57357644,.81915204)*parcelXZ;
    vec3 uvw=vec3(noiseXZ.x/5200.0,(altitude-uCloudBase)/2400.0,noiseXZ.y/5200.0)
      +vec3(0.31,-time*0.00022,0.62);
    vec4 shape=textureLod(uCloudNoise,uvw,lod);
    // Turbulent entrainment has a separate shorter scale. Its slow vertical
    // phase expresses cloud formation/evaporation, not a rigid texture card.
    // The detail coordinates run 3.17x faster, requiring log2(3.17) more
    // filtering for the same integration footprint. Preserve exact raw LOD0
    // for CPU/shadow parity and blend continuously into the view prefilter.
    float detailLod=mix(max(0.0,lod-0.4),lod+log2(3.17),smoothstep(0.0,0.5,lod));
    vec4 detail=textureLod(uCloudNoise,uvw*3.17+vec3(0.19,-time*0.00012,0.43),detailLod);
    float localHeight=h/(0.60+0.40*weather.g);
    // Rising condensation starts above a shared LCL. Increasing the height
    // penalty lets only high-moisture 3-D lobes survive aloft: individual
    // turrets rather than one weather-cell-sized rounded cap.
    float heightCost=0.04+0.56*localHeight*localHeight;
    float field=(shape.r-0.43)*0.92+(region-0.5)*0.72+0.20-heightCost;
    float edgeErosion=(1.0-detail.g)*0.17+(1.0-detail.b)*0.055;
    float body=smoothstep(0.0,0.19,field-edgeErosion);
    float base=smoothstep(0.0,0.052,h+(shape.g-0.5)*0.018);
    float inversion=1.0-smoothstep(0.80,1.0,localHeight);
    float legacyBody=body*inversion;
    // Regional ascent used to be clamped into a vertically extruded plateau,
    // then cut by one shared inversion cap. Recover its unsaturated carrier
    // and give each thermal a rounded vertical liquid-water profile. The
    // product of horizontalGaussian ascent and this verticalGaussian has
    // curved3-D level sets, rather than a constant-height column or box.
    float ascent=-log(max(0.0001,1.0-weather.r));
    float centerHeight=.18+.20*weather.g+.045*(shape.g-.5);
    float verticalSigma=.15+.03*weather.g;
    float q=(h-centerHeight)/verticalSigma;
    float thermalMass=ascent*exp(-.5*q*q)*(.55+.90*shape.r);
    float thermalBody=smoothstep(.08,.34,thermalMass-edgeErosion*.45);
    // Candidate2: true3-D F1 puffs carry the bulk shape, not a weak modulation
    // of an extruded/ellipsoidal carrier. Alpha stores independent Worley8,
    // leaving RGB and therefore legacy0/1 exactly intact for the A/B.
    vec3 puffUV=uvw*2.6+vec3(.27,.41,.73)+(shape.gbb-.5)*.12;
    float puff=textureLod(uCloudNoise,puffUV,min(lod*1.35,1.2)).a;
    float billows=.78*puff+.22*shape.a;
    float heightPenalty=.75*h*h+.65*h*h*h*h;
    float mass=(billows-.45)*1.4+(shape.r-.5)*.28+(region-.5)*.46+.15-heightPenalty;
    float entrainment=(1.-detail.g)*.14+(1.-detail.b)*.11;
    // Continuous liquid-water amount; opacity arises through Beer integration,
    // rather than smoothstep prematurely flattening every interior to1.
    float billowBody=1.-exp(-1.7*max(0.,mass-entrainment));
    float selected=uCloudShapeBlend<=1.?mix(legacyBody,thermalBody,clamp(uCloudShapeBlend,0.,1.)):mix(thermalBody,billowBody,clamp(uCloudShapeBlend-1.,0.,1.));
    // A positive noise offset gave a nonzero right limit at the hard LCL.
    // Keep the original expression exactly for A/legacy0/1 and everywhere
    // unaffected. Only C2's contribution receives the continuous base.
    if(uCloudBaseContinuity>.5&&uCloudShapeBlend>1.&&shape.g>.5&&h<.052){
      float baseContinuous=smoothstep(0.,.052,h+min((shape.g-.5)*.018,0.));
      float applied=mix(thermalBody*base,billowBody*baseContinuous,clamp(uCloudShapeBlend-1.,0.,1.));
      return applied*region*uCloudMoisture*smoothstep(0.0,0.07,uCloudCoverage);
    }
    return selected*base*region*uCloudMoisture*smoothstep(0.0,0.07,uCloudCoverage);
  }
  float cloudSphereExit(vec3 origin,vec3 direction,float radius){
    float r=length(origin),b=dot(origin,direction),c=(r-radius)*(r+radius);
    return -b+sqrt(max(0.0,b*b-c));
  }
  float getCloudShadow(vec3 worldPoint,float time){
    if(uCloudLightDirection.y<=0.015||uCloudCoverage<=0.0)return 1.0;
    vec3 direction=normalize(uCloudLightDirection);
    vec3 planet=vec3(worldPoint.x,cloudEarthRadius+max(worldPoint.y,1.0),worldPoint.z);
    float start=max(0.0,cloudSphereExit(planet,direction,cloudEarthRadius+uCloudBase));
    float end=cloudSphereExit(planet,direction,cloudEarthRadius+uCloudTop);
    float ds=max(0.0,end-start)/3.0,opticalDepth=0.0;
    for(int i=0;i<3;i++)opticalDepth+=atmosphereCloudDensity(worldPoint+direction*(start+(float(i)+0.5)*ds),time,0.0)*ds;
    return exp(-uCloudExtinction*opticalDepth);
  }
  float getCloudShadow(vec2 worldXZ,float time){return getCloudShadow(vec3(worldXZ.x,1.0,worldXZ.y),time);}
`;

const atmosphereGLSL=/* glsl */`
  const float atmosphereEarth=6360000.0;
  const float atmosphereTop=6460000.0;
  const vec3 betaRayleigh=vec3(5.802e-6,13.558e-6,33.1e-6);
  const vec3 betaOzone=vec3(0.650e-6,1.881e-6,0.085e-6);
  uniform float uAirMieScale,uAirDiffuseStrength;
  uniform vec3 uAirDiffuseRadiance;
  #define betaMie (3.996e-6*uAirMieScale)
  const float pi=3.141592653589793;
  float atmosphereMass(float mu){
    float zenith=min(95.0,degrees(acos(clamp(mu,-1.0,1.0))));
    return 1.0/(max(0.0,mu)+0.50572*pow(96.07995-zenith,-1.6364));
  }
  float ozoneColumn(float h){
    if(h<10000.0)return 15000.0;
    if(h<25000.0)return 15000.0-(h-10000.0)*(h-10000.0)/30000.0;
    float r=max(0.0,40000.0-h);return r*r/30000.0;
  }
  float atmosphereColumn(float h,float mu,float H){
    h=max(h,0.0);float x=sqrt((atmosphereEarth+h)/(2.0*H))*mu,a=abs(x),erfcx;
    if(a>4.0){float q=1.0/(a*a);erfcx=(1.0-.5*q+.75*q*q-1.875*q*q*q+6.5625*q*q*q*q)/(sqrt(pi)*a);}
    else{float t=1.0/(1.0+.3275911*a);erfcx=t*(.254829592+t*(-.284496736+t*(1.421413741+t*(-1.453152027+t*1.061405429))));}
    float factor=sqrt(pi*(atmosphereEarth+h)*H/2.0),vertical=exp(-h/H);
    return factor*(x>=0.0?vertical*erfcx:max(0.0,2.0*exp(min(60.0,-h/H+x*x))-vertical*erfcx));
  }
  vec3 atmosphereSunTransmission(float h,float mu){
    float horizon=-sqrt(max(0.0,2.0*max(h,0.0)/atmosphereEarth));
    float visible=smoothstep(horizon-0.00465,horizon+0.00465,mu);
    if(visible<=0.0)return vec3(0.0);
    float mass=atmosphereColumn(h,mu,25000.0)/max(1e-12,25000.0*exp(-max(h,0.0)/25000.0));
    vec3 tau=betaRayleigh*atmosphereColumn(h,mu,8000.0)+vec3(betaMie*atmosphereColumn(h,mu,1200.0))+betaOzone*ozoneColumn(h)*mass;
    return exp(-tau)*visible;
  }
  float atmospherePhaseHG(float mu,float g){return (1.0-g*g)/(4.0*pi*pow(max(0.0001,1.0+g*g-2.0*g*mu),1.5));}
  vec3 atmosphereRadiance(vec3 origin,vec3 direction,vec3 sun,out vec3 extinction,out vec3 diffuseIntegral){
    float rayLength=cloudSphereExit(origin,direction,atmosphereTop);
    float b=dot(origin,direction),r=length(origin),c=(r-atmosphereEarth)*(r+atmosphereEarth);
    float groundDiscriminant=b*b-c;
    bool hitsGround=groundDiscriminant>0.0&&b<0.0;
    if(hitsGround)rayLength=min(rayLength,max(0.0,-b-sqrt(groundDiscriminant)));
    float mu=dot(direction,sun),phaseR=3.0/(16.0*pi)*(1.0+mu*mu),phaseM=atmospherePhaseHG(mu,0.76);
    vec3 optical=vec3(0.0),radiance=vec3(0.0);diffuseIntegral=vec3(0.0);
    for(int i=0;i<ATMOSPHERE_STEPS;i++){
      float a=float(i)/float(ATMOSPHERE_STEPS),z=float(i+1)/float(ATMOSPHERE_STEPS);
      float distance=0.5*(a*a+z*z)*rayLength,ds=(z*z-a*a)*rayLength;
      vec3 p=origin+direction*distance;float h=max(0.0,length(p)-atmosphereEarth);
      vec3 density=vec3(exp(-h/8000.0),exp(-h/1200.0),max(0.0,1.0-abs(h-25000.0)/15000.0));
      vec3 halfOptical=optical+density*ds*0.5;
      vec3 viewTransmission=exp(-(betaRayleigh*halfOptical.x+vec3(betaMie*halfOptical.y)+betaOzone*halfOptical.z));
      vec3 sunTransmission=atmosphereSunTransmission(h,dot(normalize(p),sun));
      vec3 scattering=betaRayleigh*density.x*phaseR+vec3(betaMie*0.90*density.y*phaseM);
      radiance+=viewTransmission*sunTransmission*scattering*ds;
      // One shared hemispherical skylight source, accumulated in this same
      // march. The integrated scattering probability is bounded by1;
      // absorption/ozone attenuate it and no sun phase or22 gain is repeated.
      diffuseIntegral+=viewTransmission*(betaRayleigh*density.x+vec3(betaMie*0.90*density.y))*ds;
      optical+=density*ds;
    }
    extinction=exp(-(betaRayleigh*optical.x+vec3(betaMie*optical.y)+betaOzone*optical.z));
    // A small bounded diffuse term approximates missing high-order air
    // scattering. It is not the Bruneton/Hillaire multiple-scattering LUT.
    vec3 diffuse=(1.0-extinction)*vec3(0.006,0.010,0.017)*max(0.0,sun.y+0.12)*(1.0-uAirDiffuseStrength);
    radiance=radiance*22.0+diffuse;
    if(hitsGround)radiance+=extinction*vec3(0.018,0.026,0.027)*max(0.0,sun.y+0.12);
    return radiance;
  }
`;

// Optional finite lighting only. These raw source uniforms have no scene P,
// solar22 gain, source-to-cloud smoke visibility, or long-lived cube ownership.
export const TRANSIENT_CLOUD_PHASE_MAX=.82*(1+.62)/(4*Math.PI*(1-.62)**2)+.18*(1+.25)/(4*Math.PI*(1-.25)**2);
export const transientCloudGLSL=/* glsl */`
  uniform int uTransientCount;
  uniform vec4 uTransientPositionRadius[2],uTransientIntensity[2];
  uniform float uTransientReflection,uTransientPlaneY;
  const float transientCloudSSA=.999;
  // Local-world polynomial avoids subtracting two Earth-sized float radii.
  // Stable quadratic roots return an inverted interval on a miss.
  vec2 transientSphereRoots(vec3 p,vec3 d,float height){
    float b=dot(p,d)+cloudEarthRadius*d.y;
    float c=dot(p.xz,p.xz)+(p.y-height)*(2.*cloudEarthRadius+p.y+height);
    float determinant=b*b-c;
    if(determinant<0.)return vec2(1.e30,-1.e30);
    float root=sqrt(max(0.,determinant));
    float q=-b-(b>=0.?root:-root);
    if(abs(q)<1.e-12)return vec2(-b);
    float other=c/q;return vec2(min(q,other),max(q,other));
  }
  // Intersect a finite source segment with the spherical cloud shell; a ray
  // crossing the inner sphere may contain two disjoint cloud-layer segments.
  vec4 transientCloudIntervals(vec3 p,vec3 d,float distance){
    vec2 outer=transientSphereRoots(p,d,uCloudTop);
    float a=max(0.,outer.x),b=min(distance,outer.y);
    if(b<=a)return vec4(0.);
    vec2 inner=transientSphereRoots(p,d,uCloudBase);
    if(inner.y<inner.x)return vec4(a,b,0.,0.);
    return vec4(a,min(b,max(a,inner.x)),max(a,min(b,inner.y)),b);
  }
  vec3 transientCleanTransmission(vec3 a,vec3 b){
    vec3 ray=b-a;float distance=length(ray);if(distance<1.e-6)return vec3(1.);
    vec3 optical=vec3(0.);
    for(int k=0;k<4;k++){
      vec3 p=mix(a,b,(float(k)+.5)/4.);float h=max(0.,cloudAltitude(p));
      optical+=vec3(exp(-h/8000.),exp(-h/1200.),max(0.,1.-abs(h-25000.)/15000.))*(distance/4.);
    }
    return exp(-(betaRayleigh*optical.x+vec3(betaMie*optical.y)+betaOzone*optical.z));
  }
  float transientSourceCloudTransmission(vec3 p,vec3 direction,float distance,float lod){
    if(distance<1.e-6)return 1.;
    vec4 ranges=transientCloudIntervals(p,direction,distance);
    float first=max(0.,ranges.y-ranges.x),second=max(0.,ranges.w-ranges.z),lengthInCloud=first+second;
    if(lengthInCloud<=0.)return 1.;
    float optical=0.;
    for(int k=0;k<4;k++){
      float q=(float(k)+.5)*lengthInCloud/4.;
      float travel=q<first?ranges.x+q:ranges.z+q-first;
      optical+=atmosphereCloudDensity(p+direction*travel,uCloudTime,min(lod+.3,1.5))*(lengthInCloud/4.);
    }
    return exp(-uCloudExtinction*optical);
  }
  vec3 transientCloudIncidentRaw(vec3 p,vec3 rd,float lod){
    vec3 outLight=vec3(0.);
    for(int k=0;k<2;k++){
      if(k>=uTransientCount)break;
      vec3 source=uTransientPositionRadius[k].xyz,delta=source-p;float distance=length(delta);
      vec3 L=delta/max(distance,1.e-6);
      // Coincident proxy centre uses finite mu0; this is not resolved near-
      // emitter angular integration. The positive phase envelope still holds.
      float mu=clamp(dot(rd,L),-1.,1.);
      float phase=.82*atmospherePhaseHG(mu,.62)+.18*atmospherePhaseHG(mu,-.25);
      float radius=uTransientPositionRadius[k].w;
      vec3 E=uTransientIntensity[k].rgb/max(distance*distance,radius*radius);
      vec3 clean=transientCleanTransmission(source,p);
      float cloud=transientSourceCloudTransmission(p,L,distance,lod);
      outLight+=E*clean*(cloud*phase*transientCloudSSA);
    }
    return outLight;
  }
  bool transientWaterObserver(vec3 eye,vec3 rd,out vec3 observer){
    observer=eye;if(abs(rd.y)<=1.e-7)return false;
    float t=(uTransientPlaneY-eye.y)/rd.y;
    if(t<0.||t>1.e8)return false;
    observer=eye+rd*t;
    // Numeric bound rather than a fabricated/clamped plane intersection.
    return all(lessThan(abs(observer),vec3(1.e9)));
  }
`;

export function createAtmosphere(THREE,{sunDirection,seed=7183,cloudSteps=64,cloudCoverage=0.35,cloudBase,cloudTop,cloudExtinction=0.0036,windMultiplier=1.6,weather={},night={},onNightLoad}={}){
  const start=performance.now();let rng=seed>>>0;
  const weatherController=createWeatherController({coverage:cloudCoverage,
    ...(Number.isFinite(cloudBase)?{cloudBase,thickness:Number.isFinite(cloudTop)?cloudTop-cloudBase:950}:{}),...weather});
  const initialWeather=weatherController.update(0);
  const random=()=>{rng+=0x6d2b79f5;let n=Math.imul(rng^(rng>>>15),1|rng);n^=n+Math.imul(n^(n>>>7),61|n);return((n^(n>>>14))>>>0)/4294967296;};
  const grid=n=>({n,data:Float32Array.from({length:n*n*n},random)}),g4=grid(4),g8=grid(8),g16=grid(16);
  function noise(g,x,y,z){
    const n=g.n,px=x*n,py=y*n,pz=z*n,ix=Math.floor(px),iy=Math.floor(py),iz=Math.floor(pz);
    const fx=smooth(0,1,px-ix),fy=smooth(0,1,py-iy),fz=smooth(0,1,pz-iz);
    const at=(a,b,c)=>g.data[(mod(c,n)*n+mod(b,n))*n+mod(a,n)];
    const mix=(a,b,t)=>a+(b-a)*t;
    return mix(mix(mix(at(ix,iy,iz),at(ix+1,iy,iz),fx),mix(at(ix,iy+1,iz),at(ix+1,iy+1,iz),fx),fy),mix(mix(at(ix,iy,iz+1),at(ix+1,iy,iz+1),fx),mix(at(ix,iy+1,iz+1),at(ix+1,iy+1,iz+1),fx),fy),fz);
  }
  function featureGrid(n){return {n,data:Float32Array.from({length:n*n*n*3},random)};}
  const f8=featureGrid(8),f16=featureGrid(16);
  function worley(g,x,y,z){
    const n=g.n,px=x*n,py=y*n,pz=z*n,ix=Math.floor(px),iy=Math.floor(py),iz=Math.floor(pz);let closest=3;
    for(let z=-1;z<=1;z++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
      const k=((mod(iz+z,n)*n+mod(iy+y,n))*n+mod(ix+x,n))*3;
      const dx=ix+x+g.data[k]-px,dy=iy+y+g.data[k+1]-py,dz=iz+z+g.data[k+2]-pz;
      closest=Math.min(closest,dx*dx+dy*dy+dz*dz);
    }
    return 1-clamp(Math.sqrt(closest)/1.15,0,1);
  }
  const size=64,volume=new Uint8Array(size*size*size*4);
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size,v=(y+.5)/size,w=(z+.5)/size;
    const a=noise(g4,u,v,w),b=noise(g8,u,v,w),c=noise(g16,u,v,w),cell=worley(f8,u,v,w),detail=worley(f16,u,v,w),k=((z*size+y)*size+x)*4;
    volume[k]=Math.round(clamp(((a*.6+b*.3+c*.1)*.72+cell*.28-.25)/.55,0,1)*255);
    volume[k+1]=Math.round(clamp(b*.25+c*.30+detail*.45,0,1)*255);volume[k+2]=Math.round(detail*255);volume[k+3]=Math.round(cell*255);
  }
  const noiseTexture=new THREE.Data3DTexture(volume,size,size,size);noiseTexture.format=THREE.RGBAFormat;noiseTexture.type=THREE.UnsignedByteType;
  noiseTexture.wrapS=noiseTexture.wrapT=noiseTexture.wrapR=THREE.RepeatWrapping;
  noiseTexture.minFilter=THREE.LinearMipmapLinearFilter;noiseTexture.magFilter=THREE.LinearFilter;noiseTexture.generateMipmaps=true;noiseTexture.unpackAlignment=1;noiseTexture.needsUpdate=true;
  // Each 8 km cell contains a small, irregular group of thermals at different
  // stages. A Gaussian is only an ascent weight; none is inverted into one
  // smooth cloud primitive. Their nonuniform overlap + the independent 3-D
  // density produce asymmetric towers, bays and isolated evaporating shreds.
  const cells=8,cloudCells=[];
  for(let j=0;j<cells;j++)for(let i=0;i<cells;i++){
    const cx=.15+random()*.70,cz=.15+random()*.70,active=random()>.14;
    const count=3+Math.floor(random()*6),angle=random()*Math.PI*2,spread=.07+random()*.12,plumes=[];
    for(let k=0;k<count;k++){
      const a=angle+k*2.399963+random()*.7,r=k===0?0:spread*Math.sqrt(random());
      plumes.push({x:cx+Math.cos(a)*r,z:cz+Math.sin(a)*r,
        sx:.035+random()*.060,sz:.030+random()*.055,strength:.60+random()*.60,height:.40+random()*.60});
    }
    cloudCells.push({active,plumes});
  }
  const ws=512,weatherData=new Uint8Array(ws*ws*4);
  for(let y=0;y<ws;y++)for(let x=0;x<ws;x++){
    const px=(x+.5)/ws*cells,py=(y+.5)/ws*cells,ix=Math.floor(px),iy=Math.floor(py),k=(y*ws+x)*4;
    let ascent=0,heightSum=0,weightSum=0;
    for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
      const cell=cloudCells[mod(iy+j,cells)*cells+mod(ix+i,cells)];
      if(!cell.active)continue;
      for(const plume of cell.plumes){
        const dx=(ix+i+plume.x-px)/plume.sx,dz=(iy+j+plume.z-py)/plume.sz;
        if(dx*dx+dz*dz>18)continue;
        const weight=Math.exp(-.5*(dx*dx+dz*dz))*plume.strength;
        ascent+=weight;heightSum+=weight*plume.height;weightSum+=weight;
      }
    }
    weatherData[k]=Math.round((1-Math.exp(-ascent*.9))*255);
    weatherData[k+1]=Math.round((weightSum>1e-8?heightSum/weightSum:.5)*255);
    weatherData[k+2]=Math.round(clamp(ascent*.35,0,1)*255);weatherData[k+3]=255;
  }
  const weatherTexture=new THREE.DataTexture(weatherData,ws,ws,THREE.RGBAFormat,THREE.UnsignedByteType);
  weatherTexture.wrapS=weatherTexture.wrapT=THREE.RepeatWrapping;weatherTexture.minFilter=weatherTexture.magFilter=THREE.LinearFilter;weatherTexture.needsUpdate=true;
  // A maximum pyramid, not averaged colour mips. Each level also stores the
  // maximum of its 3x3 neighbours. One nearest lookup therefore bounds a ray
  // segment whose projected width is <= that level's cell width, including
  // base-map bilinear support. It may retain empty space; it cannot reject a
  // positive weather texel within the bounded segment footprint.
  const supportMips=[];
  let supportWidth=ws,rawSupport=Uint8Array.from({length:ws*ws},(_,i)=>weatherData[i*4]);
  while(supportWidth>=1){
    const n=supportWidth,data=new Uint8Array(n*n*4);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      let maximum=0;
      for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)maximum=Math.max(maximum,rawSupport[mod(y+j,n)*n+mod(x+i,n)]);
      const k=(y*n+x)*4;data[k]=data[k+1]=data[k+2]=maximum;data[k+3]=255;
    }
    supportMips.push({data,width:n,height:n});if(n===1)break;
    const half=n/2,next=new Uint8Array(half*half);
    for(let y=0;y<half;y++)for(let x=0;x<half;x++)next[y*half+x]=Math.max(rawSupport[(2*y)*n+2*x],rawSupport[(2*y)*n+2*x+1],rawSupport[(2*y+1)*n+2*x],rawSupport[(2*y+1)*n+2*x+1]);
    rawSupport=next;supportWidth=half;
  }
  const supportTexture=new THREE.DataTexture(supportMips[0].data,ws,ws,THREE.RGBAFormat,THREE.UnsignedByteType);
  supportTexture.mipmaps=supportMips;supportTexture.generateMipmaps=false;
  supportTexture.minFilter=THREE.NearestMipmapNearestFilter;supportTexture.magFilter=THREE.NearestFilter;
  supportTexture.wrapS=supportTexture.wrapT=THREE.RepeatWrapping;supportTexture.needsUpdate=true;
  // Choose a clear initial patch from the generated weather field. This is an
  // initial condition, not an island-centred exclusion mask: the whole field
  // still advects and evolves, and clouds can later cross the sunlight path.
  const weatherOrigin=new THREE.Vector2(.37,.51);let originCost=Infinity;
  for(let j=0;j<ws;j++)for(let i=0;i<ws;i++){
    const r=weatherData[(j*ws+i)*4]/255;
    if(r<.01||r>.10)continue;
    let clear=true;
    const clearRadius=Math.ceil(ws/64);
    for(const [dx,dz]of [[-clearRadius,0],[clearRadius,0],[0,-clearRadius],[0,clearRadius]])if(weatherData[(mod(j+dz,ws)*ws+mod(i+dx,ws))*4]/255>.25)clear=false;
    const u=(i+.5)/ws,v=(j+.5)/ws,cost=(u-.37)*(u-.37)+(v-.51)*(v-.51);
    if(clear&&cost<originCost){originCost=cost;weatherOrigin.set(u,v);}
  }
  const direction=(sunDirection?.value?.isVector3?sunDirection.value:sunDirection?.isVector3?sunDirection:new THREE.Vector3(.65,.74,-.18)).clone();
  if(direction.lengthSq()<1e-12)direction.set(.65,.74,-.18);
  direction.normalize();
  const sunUniform={value:direction},intensityUniform={value:1},timeUniform={value:0};
  const nightSky=createNightSky(THREE,night,{onLoad:onNightLoad});
  const uniforms={...nightSky.uniforms,sunPosition:sunUniform,uSkyIntensity:intensityUniform,uSolarDistanceGain:{value:1},uSkyPreExposure:{value:1},uSolarDisk:{value:1},uSunAngularRadius:{value:.00465},uCelestialDiscDebug:{value:0},uCloudTime:timeUniform,uAirMieScale:{value:1},uAirDiffuseStrength:{value:1},uAirDiffuseRadiance:{value:new THREE.Vector3()},
    uMoonSourceRatio:{value:nightSky.physical.moonSourceRatio},uMoonSourceColor:{value:new THREE.Vector3(1,.96,.90)},
    uCloudLightDirection:{value:direction.clone()},uCloudLightColor:{value:new THREE.Vector3(1,1,1)},uCloudLightStrength:{value:1},uCloudAmbientColor:{value:new THREE.Vector3(.24,.325,.42)},uCloudSupportEnabled:{value:1},uCloudShapeBlend:{value:2},uCloudBaseContinuity:{value:0},
    uCloudNoise:{value:noiseTexture},uCloudWeather:{value:weatherTexture},uCloudSupport:{value:supportTexture},uCloudOffset:{value:new THREE.Vector2()},uCloudWeatherOrigin:{value:weatherOrigin},
    uCloudShearOffset:{value:new THREE.Vector2()},uCloudMoisture:{value:initialWeather.moisture},
    uCloudBase:{value:initialWeather.cloudBase},uCloudTop:{value:initialWeather.cloudTop},uCloudCoverage:{value:initialWeather.coverage},uCloudExtinction:{value:cloudExtinction},
    uTransientCount:{value:0},uTransientPositionRadius:{value:[new THREE.Vector4(0,0,0,1),new THREE.Vector4(0,0,0,1)]},uTransientIntensity:{value:[new THREE.Vector4(0,0,0,0),new THREE.Vector4(0,0,0,0)]},uTransientReflection:{value:0},uTransientPlaneY:{value:0}};
  const material=new THREE.ShaderMaterial({name:'Physical atmosphere and evolving cumulus',side:THREE.BackSide,depthWrite:false,depthTest:true,
    uniforms,defines:{CLOUD_STEPS:clamp(Math.round(cloudSteps),8,128),ATMOSPHERE_STEPS:8},
    vertexShader:`varying vec3 vSkyWorld;void main(){vec4 world=modelMatrix*vec4(position,1.0);vSkyWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;gl_Position.z=gl_Position.w;}`,
    fragmentShader:/* glsl */`
      precision highp float;
      uniform float uSkyIntensity,uSolarDistanceGain,uSkyPreExposure,uSolarDisk,uSunAngularRadius,uCelestialDiscDebug,uMoonSourceRatio,uCloudLightStrength,uCloudSupportEnabled;
      uniform vec3 uMoonSourceColor,uCloudLightColor,uCloudAmbientColor;
      uniform highp sampler2D uCloudSupport;
      varying vec3 vSkyWorld;
      ${cloudShadowGLSL}
      ${atmosphereGLSL}
      ${nightSkyGLSL}
      ${transientCloudGLSL}
      void main(){
        vec3 rd=normalize(vSkyWorld-cameraPosition),sun=normalize(sunPosition);
        #ifdef TRANSIENT_CLOUD_ONLY
          if(uTransientCount<=0){gl_FragColor=vec4(0.);return;}
          vec3 worldObserver=cameraPosition;
          if(uTransientReflection>.5&&!transientWaterObserver(cameraPosition,rd,worldObserver)){gl_FragColor=vec4(0.);return;}
        #else
        vec3 worldObserver=vec3(cameraPosition.x,max(2.0,cameraPosition.y),cameraPosition.z);
        #endif
        vec3 observer=worldObserver+vec3(0.0,atmosphereEarth,0.0);
        #ifdef TRANSIENT_CLOUD_ONLY
          vec3 clearSky=vec3(0.);
        #else
        vec3 extinction,diffuseIntegral;vec3 clearSky=atmosphereRadiance(observer,rd,sun,extinction,diffuseIntegral)*uSkyIntensity*uSolarDistanceGain;
        // J already combines physical sun/moon/stellar sky irradiance. Add
        // once, outside source-specific gain; storageP is applied at output.
        clearSky+=uAirDiffuseRadiance*diffuseIntegral;
        if(sun.y<0.03&&uMoonDirection.y>-.03&&uMoonSourceRatio>0.0){vec3 moonExtinction,unusedDiffuse;clearSky+=atmosphereRadiance(observer,rd,uMoonDirection,moonExtinction,unusedDiffuse)*uMoonSourceRatio*uMoonSourceColor;}
        float disk=celestialDiscCoverage(rd,sun,uSunAngularRadius);
        if(uCelestialDiscDebug>.5){
          float mask=uCelestialDiscDebug<1.5?disk:celestialDiscCoverage(rd,uMoonDirection,uMoonRadius);
          gl_FragColor=vec4(vec3(mask),1.0);return;
        }
        vec3 solar=atmosphereSunTransmission(max(cameraPosition.y,2.0),sun.y);
        clearSky+=solar*32000.0*disk*uSolarDisk*uSkyIntensity;
        float horizon=-sqrt(2.0*max(worldObserver.y,0.0)/atmosphereEarth);
        float skyVisible=smoothstep(horizon-.0002,horizon+.0002,rd.y);
        clearSky+=celestialRadiance(rd,extinction,uSolarDisk,skyVisible);
        #endif
        vec3 colour=clearSky;
        if(rd.y>-0.015&&uCloudCoverage>0.0){
          float entry=max(0.0,cloudSphereExit(observer,rd,atmosphereEarth+uCloudBase));
          float exit=cloudSphereExit(observer,rd,atmosphereEarth+uCloudTop);
          exit=min(exit,60000.0);
          if(exit>entry){
            // Tighten the full 1-km-thick layer interval before the expensive
            // volume march. Low-angle rays otherwise spent most of 64 steps
            // in clear air, then hit the same coarse altitude slices.
            float probeDs=(exit-entry)/32.0,supportLo=exit,supportHi=entry;
            float footprint=probeDs*max(abs(rd.x)+abs(uCloudShearOffset.x)*0.001,abs(rd.z)+abs(uCloudShearOffset.y)*0.001);
            float supportLod=clamp(ceil(log2(max(1.0,footprint/125.0))),0.0,9.0);
            float supportThreshold=0.44-0.40*uCloudCoverage;
            for(int probe=0;probe<32;probe++){
              float probeDistance=entry+(float(probe)+0.5)*probeDs;
              vec3 point=worldObserver+rd*probeDistance;
              float aboveBase=cloudAltitude(point)-uCloudBase;
              vec2 parcelXZ=point.xz-uCloudOffset-uCloudShearOffset*aboveBase/1000.0;
              float possible=textureLod(uCloudSupport,parcelXZ/64000.0+uCloudWeatherOrigin,supportLod).r;
              if(possible>=supportThreshold){supportLo=min(supportLo,entry+float(probe)*probeDs);supportHi=max(supportHi,entry+float(probe+1)*probeDs);}
            }
            if(uCloudSupportEnabled>.5){entry=max(entry,supportLo-probeDs);exit=min(exit,supportHi+probeDs);}
            if(exit>entry){
            float ds=(exit-entry)/float(CLOUD_STEPS),transmission=1.0;
            vec3 lightDirection=normalize(uCloudLightDirection);
            float lightCos=dot(rd,lightDirection);
            vec3 cloudLight=vec3(0.0),transientLight=vec3(0.0);float viewPhase=0.82*atmospherePhaseHG(lightCos,0.62)+0.18*atmospherePhaseHG(lightCos,-0.25);
            // Coarse LOD3 leaves only8³ noise voxels: thresholding that field
            // produced flat Cartesian cloud faces. Keep at least~27³ support
            // in the silhouette while filtering the shorter erosion scale.
            float lod=clamp(log2(max(ds,65.0)/130.0),0.0,1.25);
            // Stable interleaved-gradient quadrature phase: no frame counter
            // and no animated random seed. Residual undersampling becomes a
            // fine fixed spatial error instead of coherent horizontal bands.
            float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));
            for(int i=0;i<CLOUD_STEPS;i++){
              if(transmission<0.015)break;
              float travel=entry+(float(i)+jitter)*ds;
              vec3 p=worldObserver+rd*travel;
              float density=atmosphereCloudDensity(p,uCloudTime,lod);
              if(density>0.0008){
                #ifndef TRANSIENT_CLOUD_ONLY
                float lightDepth=0.0;
                // Three expanding samples capture self-shadow without an
                // atmosphere march nested inside every cloud-light sample.
                for(int j=0;j<3;j++){
                  float d=(float(j)+0.5)*230.0;
                  lightDepth+=atmosphereCloudDensity(p+lightDirection*d,uCloudTime,min(lod+0.3,1.5))*230.0;
                }
                float lightTransmission=exp(-uCloudExtinction*lightDepth);
                float h=cloudAltitude(p),heightFraction=clamp((h-uCloudBase)/(uCloudTop-uCloudBase),0.0,1.0);
                vec3 sunlight=atmosphereSunTransmission(h,dot(normalize(p+vec3(0.,atmosphereEarth,0.)),lightDirection));
                vec3 ambient=uCloudAmbientColor*(.7+.6*heightFraction);
                // Bounded diffuse bounce supplies the bright cloud interior;
                // it is a multiple-scattering approximation, not a solver.
                vec3 incident=sunlight*uCloudLightColor*uCloudLightStrength*(22.0*viewPhase*lightTransmission+0.34*(1.0-lightTransmission))+ambient;
                #endif
                float segmentTransmission=exp(-uCloudExtinction*density*ds);
                float weight=transmission*(1.0-segmentTransmission);
                if(uTransientCount>0)transientLight+=transientCloudIncidentRaw(p,rd,lod)*transientCleanTransmission(worldObserver,p)*weight;
                #ifndef TRANSIENT_CLOUD_ONLY
                // Atmospheric perspective makes remote cloud banks meet the
                // same physical horizon haze instead of a pasted white band.
                vec3 aerialTransmission=exp(-(betaRayleigh*0.65+vec3(betaMie*0.45))*travel);
                vec3 source=incident*aerialTransmission+clearSky*(1.0-aerialTransmission);
                cloudLight+=source*weight;
                #endif
                transmission*=segmentTransmission;
              }
            }
            colour=cloudLight+clearSky*transmission;
            if(uTransientCount>0)colour+=transientLight;
            }
          }
        }
        #ifdef TRANSIENT_CLOUD_ONLY
          gl_FragColor=vec4(colour*uSkyPreExposure,0.0);
        #else
          gl_FragColor=vec4(colour*uSkyPreExposure,1.0);
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `});
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(20000,32,16),material);mesh.name='Dynamic atmosphere and volume cumulus';mesh.frustumCulled=false;mesh.renderOrder=10000;
  const transientMaterial=material.clone();transientMaterial.name='Current finite cloud-light delta only';transientMaterial.uniforms=uniforms;transientMaterial.defines={...material.defines,TRANSIENT_CLOUD_ONLY:1};transientMaterial.transparent=true;transientMaterial.depthFunc=THREE.LessEqualDepth;transientMaterial.blending=THREE.CustomBlending;transientMaterial.blendEquation=THREE.AddEquation;transientMaterial.blendSrc=THREE.OneFactor;transientMaterial.blendDst=THREE.OneMinusSrcAlphaFactor;transientMaterial.blendEquationAlpha=THREE.AddEquation;transientMaterial.blendSrcAlpha=THREE.OneFactor;transientMaterial.blendDstAlpha=THREE.OneMinusSrcAlphaFactor;transientMaterial.toneMapped=false;
  const transientScene=new THREE.Scene(),transientMesh=new THREE.Mesh(mesh.geometry,transientMaterial);transientMesh.name='Isolated cloud delta, alpha0, no environment capture';transientMesh.frustumCulled=false;transientScene.add(transientMesh);
  let lastTime=0,lastWind=new THREE.Vector2(.936,.352).multiplyScalar(1.8*windMultiplier),lastCamera=null,disposed=false,storageExposureOverride=null,snapshotScope=0;
  const highWindDirection=new THREE.Vector2(.936,.352).normalize();
  function applyWeather(current){
    uniforms.uCloudBase.value=current.cloudBase;uniforms.uCloudTop.value=current.cloudTop;
    uniforms.uCloudCoverage.value=current.coverage;uniforms.uCloudMoisture.value=current.moisture;
  }
  function setWeather(patch={},options={}){
    const state=weatherController.setWeather(patch,options);
    if(options.immediate)applyWeather(weatherController.update(0));
    return state;
  }
  function update({time=lastTime,wind=1.8,camera}={}){
    if(snapshotScope)throw new Error('Atmosphere.update cannot mutate a frozen capture snapshot');
    const nextWind=new THREE.Vector2();
    if(typeof wind==='number')nextWind.set(.936,.352).multiplyScalar(wind*windMultiplier);
    else if(wind?.isVector2)nextWind.copy(wind).multiplyScalar(windMultiplier);
    else if(wind?.isVector3)nextWind.set(wind.x,wind.z).multiplyScalar(windMultiplier);
    else nextWind.copy(lastWind);
    if(Number.isFinite(time)){
      const dt=time-lastTime;
      const current=weatherController.update(Math.max(0,dt));applyWeather(current);
      if(current.windDirection!==null){
        const azimuth=current.windDirection*Math.PI/180,speed=nextWind.length();
        highWindDirection.set(Math.sin(azimuth),Math.cos(azimuth));
        nextWind.copy(highWindDirection).multiplyScalar(speed);
      }else if(nextWind.lengthSq()>1e-10)highWindDirection.copy(nextWind).normalize();
      uniforms.uCloudOffset.value.addScaledVector(lastWind,dt*.5).addScaledVector(nextWind,dt*.5);
      uniforms.uCloudShearOffset.value.addScaledVector(highWindDirection,current.shear*dt);
      timeUniform.value=time;lastTime=time;
      nightSky.update(time);lighting();
    }
    lastWind.copy(nextWind);if(camera?.position)lastCamera=camera.position.toArray();
  }
  function setSun(value={}){
    const d=value?.isVector3?value:value.direction||value.sunDirection;
    if(d?.isVector3||Number.isFinite(value.elevation)){uniforms.uSolarDistanceGain.value=1;uniforms.uSunAngularRadius.value=.00465;}
    if(d?.isVector3){direction.copy(d);if(direction.lengthSq()<1e-12)direction.set(.65,.74,-.18);direction.normalize();}
    else if(Number.isFinite(value.elevation))direction.setFromSphericalCoords(1,THREE.MathUtils.degToRad(90-value.elevation),THREE.MathUtils.degToRad(value.azimuth??100));
    if(Number.isFinite(value.intensity))intensityUniform.value=Math.max(0,value.intensity);
    return lighting();
  }
  function setCelestial(snapshot){
    if(!snapshot?.sunDirection||!snapshot?.moonDirection)throw new TypeError('setCelestial requires a controller FrameSnapshot');
    nightSky.setCelestial(snapshot);
    if(snapshot.mode==='astronomical')direction.fromArray(snapshot.sunDirection).normalize();
    uniforms.uSunAngularRadius.value=snapshot.mode==='astronomical'?(snapshot.angularRadii?.sun??snapshot.sun.angularRadius):.00465;
    uniforms.uSolarDistanceGain.value=snapshot.mode==='astronomical'?1/(snapshot.sun.distanceAU*snapshot.sun.distanceAU):1;
    return lighting();
  }
  function setStorageExposureEV(value){
    if(value===null||value===undefined)storageExposureOverride=null;
    else if(Number.isFinite(value))storageExposureOverride=clamp(value,-48,32);
    else throw new TypeError('Storage exposure must be a finite EV, or null for legacy auto');
    return lighting();
  }
  const cloneUniform=value=>value?.isTexture?value:value?.clone?value.clone():Array.isArray(value)?value.map(cloneUniform):value;
  function captureSnapshot({includeTransient=false}={}){
    const captured=Object.fromEntries(Object.entries(uniforms).map(([key,u])=>[key,cloneUniform(u.value)]));
    if(!includeTransient){captured.uTransientCount=0;captured.uTransientPositionRadius=[new THREE.Vector4(0,0,0,0),new THREE.Vector4(0,0,0,0)];captured.uTransientIntensity=[new THREE.Vector4(0,0,0,0),new THREE.Vector4(0,0,0,0)];captured.uTransientReflection=0;}
    return {uniforms:captured,night:nightSky.captureSnapshot(),transientExcluded:!includeTransient,
      time:lastTime,storageEV:lighting().preExposureEV,storageExposureOverride,physicalSkyRevision:nightSky.physical.physicalSkyRevision,
      utcMs:nightSky.physical.utcMs,weather:structuredClone(weatherController.state()),cloudDensityKey:`shape${uniforms.uCloudShapeBlend.value}:base${uniforms.uCloudBaseContinuity.value}`,
      texturePolicy:'shared immutable noise/weather/catalog textures; all mutable coordinates and times copied'};
  }
  function withSnapshot(snapshot,fn){
    if(!snapshot?.uniforms||typeof fn!=='function')throw new TypeError('withSnapshot(snapshot, synchronous callback)');
    // Public capture intentionally strips flashes. A live-state save MUST opt
    // in so finally restores the currently active lights after frozen capture.
    const saved=captureSnapshot({includeTransient:true}),savedKey=skyLightingKey?.slice()??null,savedIrradiance=cachedSkyIrradiance.slice();
    const apply=s=>{for(const [key,value]of Object.entries(s.uniforms)){const u=uniforms[key];if(!u)continue;if(u.value?.copy&&value?.clone&&!value.isTexture)u.value.copy(value);else u.value=value;}storageExposureOverride=s.storageExposureOverride;};
    snapshotScope++;
    try{apply(snapshot);return nightSky.withSnapshot(snapshot.night,()=>{const result=fn();if(result?.then)throw new TypeError('Atmosphere.withSnapshot callback must be synchronous');return result;});}
    finally{apply(saved);skyLightingKey=savedKey;cachedSkyIrradiance=savedIrradiance;snapshotScope--;}
  }
  function prepareStarView(renderer,camera,{width,height,storageEV,frame,optics}={}){
    // Direction-space lookup has no extra render pass and does not mutate GL
    // state. Catalogue uniforms will use the actual view's ray derivatives.
    const view=nightSky.prepareStarView(camera,{width,height,frame,optics});
    return {mode:'direction-space',...view,storageEV:storageEV??lighting().preExposureEV,
      utcMs:nightSky.physical.utcMs,exposureSeconds:optics?.shutterSeconds??1/120,cameraId:camera?.id??null,drawCalls:0};
  }
  function getRadianceBound(){
    // P-independent source envelope. Never use the already pre-exposed
    // lighting().sunStrength or skyTint here. Discs have coverage <= 1.
    const altitude=Math.asin(clamp(direction.y,-1,1)),solarT=solarTransmittance(altitude,2,uniforms.uAirMieScale.value);
    const solar=solarT.map(v=>v*32000*intensityUniform.value*uniforms.uSolarDisk.value);
    const moon=uniforms.uMoonDirection.value,moonT=solarTransmittance(Math.asin(clamp(moon.y,-1,1)),2,uniforms.uAirMieScale.value);
    const lunar=moonT.map(v=>v*2.4*uniforms.uMoonRadiance.value*uniforms.uSolarDisk.value);
    // The current single-scattering source uses 22 * a normalized phase;
    // HG(g=.76) peaks below 2.44/sr. Extinction integrates to <=1. 128 is
    // deliberately loose for added bounded diffuse/cloud ambient terms.
    // Below -24deg no sunlight reaches the supported <=5km observer's
    // visible 100km atmosphere; high-altitude cameras need a wider bound.
    const observerHeight=Math.max(2,lastCamera?.[1]??2),sunSupported=altitude*180/Math.PI>=-24||observerHeight>5000;
    const diffuse=128*((sunSupported?intensityUniform.value*uniforms.uSolarDistanceGain.value:0)+nightSky.physical.moonSourceRatio);
    const stellar=nightSky.getRadianceBound?.()??{maxRGB:NIGHT_STAR_SCALE*nightSky.settings.starIntensity,limits:['legacy atlas bound until catalogue ready']};
    const transient=transientRadianceBound();
    return {maxRGB:Math.max(...solar)+Math.max(...lunar)+diffuse+stellar.maxRGB+transient,
      components:{solarDiskRGB:solar,lunarDiskRGB:lunar,atmosphereAndCloudUpper:diffuse,stars:stellar.maxRGB,transientCloudUpper:transient},
      units:'physical relative linear RGB before storage 2^P; max-channel additive source envelope',
      limits:['Atmosphere/cloud source envelope is intentionally loose; not a measured maximum','Standard solar/lunar atmospheric transmission approximation','Camera above5km retains the daytime upper envelope','Catalogue PSF envelope uses actual prepared-view footprint when ready',...(stellar.limits??[])]};
  }
  const referenceTransmission=solarTransmittance(48*Math.PI/180);
  const referenceSun=new THREE.Vector3().setFromSphericalCoords(1,42*Math.PI/180,100*Math.PI/180);
  const referenceSkyIrradiance=clearSkyIrradiance(referenceSun.toArray(),1);
  let skyLightingKey=null,cachedSkyIrradiance=[0,0,0];
  function lighting(){
    const t=solarTransmittance(Math.asin(clamp(direction.y,-1,1)),2,uniforms.uAirMieScale.value),relative=t.map((v,i)=>v/Math.max(1e-6,referenceTransmission[i]));
    const warm=[1,.977,.940],rgb=relative.map((v,i)=>v*warm[i]),peak=Math.max(...rgb,0),denominator=Math.max(peak,1e-6);
    const sunColor=new THREE.Color().setRGB(rgb[0]/denominator,rgb[1]/denominator,rgb[2]/denominator);
    // Reconstruct the relative RGB irradiance exactly. Multiplying this
    // peak-normalized colour by a luminance ratio attenuated low sun twice.
    const physicalSunStrength=peak*intensityUniform.value*uniforms.uSolarDistanceGain.value,n=nightSky.physical,moonDirection=nightSky.uniforms.uMoonDirection.value;
    const mt=solarTransmittance(Math.asin(clamp(moonDirection.y,-1,1)),2,uniforms.uAirMieScale.value),moonRGB=mt.map((v,i)=>v/Math.max(1e-6,referenceTransmission[i])*[1,.96,.90][i]),moonPeak=Math.max(...moonRGB,0),moonColor=new THREE.Color().setRGB(...moonRGB.map(v=>v/Math.max(moonPeak,1e-6)));
    const physicalMoonStrength=moonPeak*n.moonSourceRatio,elevation=Math.asin(clamp(direction.y,-1,1))*180/Math.PI;
    // Toward dusk, fetch the atlas/catalogue before stars can be visible. Idempotent.
    if(elevation<NIGHT_ASSET_ELEVATION_DEGREES)nightSky.load();
    const recommendedExposureEV=recommendedNightExposure(elevation,n.moonSourceRatio,n.moonAltitudeDegrees,nightSky.settings.automaticExposure),preExposureEV=storageExposureOverride??recommendedExposureEV,preExposureScale=2**preExposureEV;
    const keyIsMoon=physicalMoonStrength>physicalSunStrength,keyDirection=keyIsMoon?moonDirection:direction,keyColor=keyIsMoon?moonColor:sunColor,physicalKeyStrength=keyIsMoon?physicalMoonStrength:physicalSunStrength;
    // The finite camera-air integral must share the sky single-scatter source
    // reference(22), rather than the separately calibrated native PBR sun(3.6).
    const physicalAirSourceIrradianceRGB=keyIsMoon?mt.map((v,i)=>22*v*n.moonSourceRatio*[1,.96,.90][i]):t.map(v=>22*v*intensityUniform.value*uniforms.uSolarDistanceGain.value);
    uniforms.uSkyPreExposure.value=preExposureScale;uniforms.uMoonSourceRatio.value=n.moonSourceRatio;
    uniforms.uCloudLightDirection.value.copy(keyDirection);uniforms.uCloudLightColor.value.set(...(keyIsMoon?[1,.96,.90]:[1,1,1]));uniforms.uCloudLightStrength.value=keyIsMoon?n.moonSourceRatio:intensityUniform.value*uniforms.uSolarDistanceGain.value;
    const stellarMean=nightSky.getStellarMeanRGB()??[.01722678,.01552462,.01419769].map(v=>v*NIGHT_STAR_SCALE*nightSky.settings.starIntensity);
    // Cache only the exact physical inputs of the two clear-sky integrals
    // and their RGB combination. Store numeric values, never mutable vector
    // references or rounded keys. Storage exposure and cloud shape/base do
    // not enter this irradiance estimate; their uniforms still update above.
    const cacheKey=[...direction.toArray(),intensityUniform.value,uniforms.uSolarDistanceGain.value,uniforms.uAirMieScale.value,...moonDirection.toArray(),n.moonSourceRatio,...stellarMean];
    if(!skyLightingKey||cacheKey.some((value,i)=>!Object.is(value,skyLightingKey[i]))){
      const solarE=clearSkyIrradiance(direction.toArray(),uniforms.uAirMieScale.value),moonE=clearSkyIrradiance(moonDirection.toArray(),uniforms.uAirMieScale.value);
      cachedSkyIrradiance=solarE.map((v,i)=>v*intensityUniform.value*uniforms.uSolarDistanceGain.value+moonE[i]*n.moonSourceRatio*[1,.96,.90][i]+stellarMean[i]*Math.PI);
      skyLightingKey=cacheKey;
    }
    const physicalAirDiffuseRadianceRGB=diffuseAirRadianceFromIrradiance(cachedSkyIrradiance,uniforms.uAirDiffuseStrength.value);
    uniforms.uAirDiffuseRadiance.value.fromArray(physicalAirDiffuseRadianceRGB);
    const skyTintPhysical=new THREE.Color().setRGB(...cachedSkyIrradiance.map((v,i)=>v/Math.max(referenceSkyIrradiance[i],1e-9)*[.37,.50,.65][i])),skyTint=skyTintPhysical.clone().multiplyScalar(preExposureScale);
    uniforms.uCloudAmbientColor.value.set(skyTintPhysical.r*.65,skyTintPhysical.g*.65,skyTintPhysical.b*.65);
    return {sunColor,sunStrength:physicalSunStrength*preExposureScale,sunDirection:direction.clone(),moonDirection:moonDirection.clone(),moonColor,moonStrength:physicalMoonStrength*preExposureScale,
      physicalSunStrength,physicalMoonStrength,physicalAirSourceIrradianceRGB,physicalAirDiffuseRadianceRGB,keyDirection:keyDirection.clone(),keyColor:keyColor.clone(),keyStrength:physicalKeyStrength*preExposureScale,physicalKeyStrength,keyIsMoon,
      skyTint,skyTintPhysical,skyIrradiance:cachedSkyIrradiance.map(v=>v*preExposureScale),physicalSkyIrradiance:cachedSkyIrradiance.slice(),moonPhase:n.moonPhase,moonAltitudeDegrees:n.moonAltitudeDegrees,moonIllumination:moonIlluminationFraction(n.moonSourceRatio,n.moonAltitudeDegrees),
      nightBlend:1-smooth(-18,-2,elevation),recommendedExposureEV,preExposureEV,preExposureScale,hemisphereStrength:0,
      referenceElevationDegrees:48,units:'pre-exposed relative RGB linear lighting; physical* fields exclude2^preExposureEV; not absolute lux',solarTransmission:t,
      note:'Sun/moon strengths exclude cloud shadow. Apply cloud transmission once. Output exposure=userEV+recommendedExposureEV-preExposureEV. Sky tint is a16-ray clear-sky irradiance estimate; clouds/stellar directionality are approximated.'};
  }
  function setNight(patch={}){const state=nightSky.setNight(patch);lighting();return state;}
  function setSampling({cloudSteps:requestedCloud,atmosphereSteps:requestedAtmosphere}={}){
    const clouds=Number.isFinite(requestedCloud)?clamp(Math.round(requestedCloud),8,128):material.defines.CLOUD_STEPS;
    const atmosphere=Number.isFinite(requestedAtmosphere)?clamp(Math.round(requestedAtmosphere),4,16):material.defines.ATMOSPHERE_STEPS;
    if(material.defines.CLOUD_STEPS!==clouds||material.defines.ATMOSPHERE_STEPS!==atmosphere){material.defines.CLOUD_STEPS=clouds;material.defines.ATMOSPHERE_STEPS=atmosphere;material.needsUpdate=true;}
    if(transientMaterial.defines.CLOUD_STEPS!==clouds||transientMaterial.defines.ATMOSPHERE_STEPS!==atmosphere){transientMaterial.defines.CLOUD_STEPS=clouds;transientMaterial.defines.ATMOSPHERE_STEPS=atmosphere;transientMaterial.needsUpdate=true;}
    return {cloudSteps:clouds,atmosphereSteps:atmosphere};
  }
  function setQuality(value){
    const steps=value==='low'?20:value==='balanced'?32:64;
    return setSampling({cloudSteps:steps,atmosphereSteps:steps<=24?6:8});
  }
  function sampleTexture(bytes,n,x,y,z=0,volume=false){
    const ax=x*n-.5,ay=y*n-.5,az=z*n-.5,ix=Math.floor(ax),iy=Math.floor(ay),iz=Math.floor(az),fx=ax-ix,fy=ay-iy,fz=az-iz;
    const channels=[0,0,0,0];
    for(let k=0;k<(volume?2:1);k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++){
      const weight=(i?fx:1-fx)*(j?fy:1-fy)*(volume?(k?fz:1-fz):1);
      const index=(volume?((mod(iz+k,n)*n+mod(iy+j,n))*n+mod(ix+i,n)):(mod(iy+j,n)*n+mod(ix+i,n)))*4;
      for(let c=0;c<4;c++)channels[c]+=bytes[index+c]/255*weight;
    }
    return channels;
  }
  function cloudDensityAt(p,time=timeUniform.value){
    const h=Math.hypot(p[0],EARTH+p[1],p[2])-EARTH;
    if(h<=uniforms.uCloudBase.value||h>=uniforms.uCloudTop.value||uniforms.uCloudCoverage.value<=0)return 0;
    const offset=uniforms.uCloudOffset.value,origin=uniforms.uCloudWeatherOrigin.value,shear=uniforms.uCloudShearOffset.value;
    const aboveBase=h-uniforms.uCloudBase.value,height=aboveBase/(uniforms.uCloudTop.value-uniforms.uCloudBase.value);
    const px=p[0]-offset.x-shear.x*aboveBase/1000,pz=p[2]-offset.y-shear.y*aboveBase/1000;
    const w=sampleTexture(weatherData,ws,px/64000+origin.x,pz/64000+origin.y);
    const availability=w[0]-(.54-.40*uniforms.uCloudCoverage.value);
    if(availability<-.10)return 0;
    const region=smooth(-.10,.38,availability);
    const nx=.81915204*px-.57357644*pz,nz=.57357644*px+.81915204*pz;
    const uv=[nx/5200+.31,aboveBase/2400-time*.00022,nz/5200+.62];
    const shape=sampleTexture(volume,size,...uv,true);
    const detail=sampleTexture(volume,size,uv[0]*3.17+.19,uv[1]*3.17-time*.00012,uv[2]*3.17+.43,true);
    const localHeight=height/(.60+.40*w[1]),heightCost=.04+.56*localHeight*localHeight;
    const field=(shape[0]-.43)*.92+(region-.5)*.72+.20-heightCost;
    const edgeErosion=(1-detail[1])*.17+(1-detail[2])*.055;
    const body=smooth(0,.19,field-edgeErosion),base=smooth(0,.052,height+(shape[1]-.5)*.018);
    const inversion=1-smooth(.80,1,localHeight);
    const legacyBody=body*inversion,ascent=-Math.log(Math.max(.0001,1-w[0])),centerHeight=.18+.20*w[1]+.045*(shape[1]-.5),verticalSigma=.15+.03*w[1],q=(height-centerHeight)/verticalSigma;
    const thermalMass=ascent*Math.exp(-.5*q*q)*(.55+.90*shape[0]),thermalBody=smooth(.08,.34,thermalMass-edgeErosion*.45),blend=clamp(uniforms.uCloudShapeBlend.value,0,2);
    const puffUV=uv.map((v,i)=>v*2.6+[.27,.41,.73][i]+(shape[i===0?1:2]-.5)*.12),puff=sampleTexture(volume,size,...puffUV,true)[3];
    const billows=.78*puff+.22*shape[3],heightPenalty=.75*height*height+.65*height**4,mass=(billows-.45)*1.4+(shape[0]-.5)*.28+(region-.5)*.46+.15-heightPenalty;
    const entrainment=(1-detail[1])*.14+(1-detail[2])*.11,billowBody=1-Math.exp(-1.7*Math.max(0,mass-entrainment));
    const selected=blend<=1?legacyBody*(1-blend)+thermalBody*blend:thermalBody*(2-blend)+billowBody*(blend-1);
    if(uniforms.uCloudBaseContinuity.value>.5&&blend>1&&shape[1]>.5&&height<.052){
      const continuousBase=smooth(0,.052,height+Math.min((shape[1]-.5)*.018,0));
      const applied=thermalBody*base*(2-blend)+billowBody*continuousBase*(blend-1);
      return applied*region*uniforms.uCloudMoisture.value*smooth(0,.07,uniforms.uCloudCoverage.value);
    }
    return selected*base*region*uniforms.uCloudMoisture.value*smooth(0,.07,uniforms.uCloudCoverage.value);
  }
  function cloudShadowAt(worldPoint=[0,1,0],time=timeUniform.value){
    const light=uniforms.uCloudLightDirection.value;
    if(light.y<=.015)return 1;
    const p=worldPoint.isVector3?worldPoint.toArray():worldPoint.length===2?[worldPoint[0],1,worldPoint[1]]:worldPoint;
    const planet=[p[0],EARTH+Math.max(1,p[1]),p[2]],r=Math.hypot(...planet),b=planet[0]*light.x+planet[1]*light.y+planet[2]*light.z;
    const exit=radius=>-b+Math.sqrt(Math.max(0,b*b-(r-radius)*(r+radius)));
    const a=Math.max(0,exit(EARTH+uniforms.uCloudBase.value)),e=exit(EARTH+uniforms.uCloudTop.value),ds=(e-a)/3;let optical=0;
    for(let i=0;i<3;i++){const d=a+(i+.5)*ds;optical+=cloudDensityAt([p[0]+light.x*d,p[1]+light.y*d,p[2]+light.z*d],time)*ds;}
    return Math.exp(-uniforms.uCloudExtinction.value*optical);
  }
  const initializationMs=performance.now()-start;
  const diagnostics=()=>({model:'spherical single-scattering Rayleigh/Mie/ozone atmosphere; bounded hemispherical diffuse-air closure; multi-thermal, entrained volume cumulus',diffuseAir:{enabled:uniforms.uAirDiffuseStrength.value===1,rawRadianceRGB:uniforms.uAirDiffuseRadiance.value.toArray(),model:'Esky/(2*pi) uniform upper hemisphere, one diffuse transport iteration; shared sky/finite air, no extra march',limits:['Not a multiple-scattering LUT or angle-resolved sky radiance field','Clear-sky irradiance proxy; local sky occlusion and cloud angular redistribution are not solved']},
    cloudSteps:material.defines.CLOUD_STEPS,atmosphereSteps:material.defines.ATMOSPHERE_STEPS,cloudSupportProbeCount:32,cloudQuadrature:'conservative max-mip weather bounds plus one-segment margin, fixed per-pixel interleaved-gradient offset',cloudShapeBlend:uniforms.uCloudShapeBlend.value,cloudBaseContinuity:uniforms.uCloudBaseContinuity.value,cloudDensityKey:`shape${uniforms.uCloudShapeBlend.value}:base${uniforms.uCloudBaseContinuity.value}`,cloudSupportEnabled:uniforms.uCloudSupportEnabled.value,maximumViewNoiseLod:1.25,cloudShapeModel:'legacy capped column0; Gaussian thermal1; primary3D Worley puffs and continuous liquid-water density2',noiseDimensions:[size,size,size],weatherDimensions:[ws,ws],supportMipCount:supportMips.length,supportBytes:supportMips.reduce((s,m)=>s+m.data.byteLength,0),
    cloudBaseMetres:uniforms.uCloudBase.value,cloudTopMetres:uniforms.uCloudTop.value,coverage:uniforms.uCloudCoverage.value,cloudExtinctionPerMetre:uniforms.uCloudExtinction.value,
    weather:weatherController.state(),time:timeUniform.value,offsetMetres:uniforms.uCloudOffset.value.toArray(),shearOffsetMetresPerKilometre:uniforms.uCloudShearOffset.value.toArray(),weatherOrigin:weatherOrigin.toArray(),altitudeWindMetresPerSecond:lastWind.toArray(),sun:direction.toArray(),
    groundCloudTransmission:cloudShadowAt(),lighting:{sunStrength:lighting().sunStrength,solarTransmission:lighting().solarTransmission,referenceElevationDegrees:48},
     camera:lastCamera,night:nightSky.state,preExposureEV:lighting().preExposureEV,initializationMs,recommendedCubeFaceRate:12,recommendedPMREMHz:.5,
     transientClouds:{optIn:true,count:uniforms.uTransientCount.value,rawRadianceBound:transientRadianceBound(),phaseMaximumBound:TRANSIENT_CLOUD_PHASE_MAX,ssa:.999,sourceCloudSamples:4,sourceAndViewCleanAirSamples:4,extraSamplers:0,environmentCapture:'excluded by default; live restore includes transient state',reflection:'isolated alpha0 delta; water-hit observer, hardware far depth; no attached-depth sampler',limits:['two finite-radius diffuse clusters, not resolved burning-star angular integration','finite cloud self-shadow four-sample quadrature','source-to-cloud smoke attenuation not implemented; downstream compositor owns view smoke','legacy sky cloud view support rd.y>-.015 retained','relative RGB scene units; no absolute cloud or pyrotechnic calibration','P must be selected from combined raw source envelopes before rendering']},
    limits:['8/6-point single-scattering quadrature, not a full multiple-scattering LUT','three-sample cloud self-shadow and ground shadow','bounded diffuse cloud bounce approximation','surface-parcel LCL estimate, not a measured sounding or cloud forecast','prescribed ascent and kinematic advection/entrainment; no Navier–Stokes solve','CPU density is the exact base-LOD density formula; view rays use filtered noise LOD','GPU budget must be measured on the actual renderer']});
  mesh.userData={model:'dynamic-volume-sky-v6-celestial-preexposure',diagnostics};
  function dispose(){if(disposed)return;disposed=true;mesh.geometry.dispose();material.dispose();transientMaterial.dispose();transientScene.remove(transientMesh);noiseTexture.dispose();weatherTexture.dispose();supportTexture.dispose();nightSky.dispose();}
  function transientRadianceBound(){let total=0;for(let i=0;i<uniforms.uTransientCount.value;i++){const p=uniforms.uTransientPositionRadius.value[i],j=uniforms.uTransientIntensity.value[i];total+=Math.max(j.x,j.y,j.z)/(p.w*p.w);}return total*TRANSIENT_CLOUD_PHASE_MAX*.999;}
  function setTransientLights(clusters=[],{rawPerCandela=3.6e-5,enabled=true}={}){
    if(snapshotScope)throw new Error('Cannot mutate transient lights during a frozen sky capture');
    if(typeof enabled!=='boolean')throw new TypeError('enabled must be boolean');
    if(!Array.isArray(clusters)||clusters.length>2)throw new RangeError('Transient clouds accept at most2 raw light clusters');
    if(!Number.isFinite(rawPerCandela)||rawPerCandela<0||rawPerCandela>1)throw new RangeError('rawPerCandela must be finite0..1');
    const array=v=>v?.toArray?v.toArray():v;
    const parsed=enabled?clusters.map(c=>{
      const p=array(c.position),colour=array(c.linearColor??c.color??c.colour),I=c.referenceCandela??c.candela??c.intensity??0,r=c.radius??c.falloffRadius??c.sourceRadius??2;
      if(!p||p.length!==3||!p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1.e8)||!colour||colour.length!==3||!colour.every(v=>Number.isFinite(v)&&v>=0)||!Number.isFinite(I)||I<0||I>1.e20||!Number.isFinite(r)||r<1.e-4||r>1.e6)throw new RangeError('Transient cluster requires finite position, nonnegative raw intensity/RGB and positive finite proxy radius within GPU numeric domain');
      const rgb=colour.map(v=>v*I*rawPerCandela);if(rgb.some(v=>!Number.isFinite(v)||v>1.e20))throw new RangeError('Transient raw intensity outside GPU numeric domain');return{p,rgb,I,r};
    }).filter(c=>Math.max(...c.rgb)>0):[];
    for(let i=0;i<2;i++){const c=parsed[i];uniforms.uTransientPositionRadius.value[i].set(...(c?.p??[0,0,0]),c?.r??1);uniforms.uTransientIntensity.value[i].set(...(c?.rgb??[0,0,0]),c?.I??0);}
    uniforms.uTransientCount.value=parsed.length;return{count:parsed.length,rawRadianceBound:transientRadianceBound(),defaultOptIn:true,units:'raw reference intensity RGB; storage P applied only at output'};
  }
  function renderTransientClouds({renderer,target,camera,reflection=true,planeY=0,frame={}}={}){
    if(disposed)throw new Error('Atmosphere is disposed');
    if(uniforms.uTransientCount.value===0)return{drawn:false,count:0};
    if(!renderer||!target||!camera?.isPerspectiveCamera)throw new TypeError('Transient cloud pass requires renderer, target and perspective camera');
    const P=frame.storageEV??Math.log2(uniforms.uSkyPreExposure.value);if(!Number.isFinite(P)||P< -48||P>32||!Number.isFinite(planeY))throw new RangeError('Invalid transient cloud storageEV/planeY');
    const gl=renderer.getContext(),previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),saved={viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),physicalViewport:new THREE.Vector4().fromArray(gl.getParameter(gl.VIEWPORT)),physicalScissor:new THREE.Vector4().fromArray(gl.getParameter(gl.SCISSOR_BOX)),physicalScissorTest:gl.isEnabled(gl.SCISSOR_TEST),auto:renderer.autoClear,xr:renderer.xr.enabled,shadowAuto:renderer.shadowMap.autoUpdate,shadowDirty:renderer.shadowMap.needsUpdate,preExposure:uniforms.uSkyPreExposure.value,reflection:uniforms.uTransientReflection.value,planeY:uniforms.uTransientPlaneY.value};
    const targetMetadata=previous?{viewport:previous.viewport.clone(),scissor:previous.scissor.clone(),scissorTest:previous.scissorTest}:null;
    try{
      renderer.autoClear=false;renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.setScissorTest(false);
      uniforms.uSkyPreExposure.value=2**P;uniforms.uTransientReflection.value=reflection?1:0;uniforms.uTransientPlaneY.value=planeY;
      transientMesh.position.copy(camera.position);transientMesh.layers.mask=camera.layers.mask;transientMesh.updateMatrixWorld(true);renderer.setRenderTarget(target);renderer.render(transientScene,camera);
      return{drawn:true,count:uniforms.uTransientCount.value,reflection,storageEV:P,densityTime:timeUniform.value,sourceSelfShadowSamples:4,cleanTransmissionSamples:4,alpha:0,rawRadianceBound:transientRadianceBound()};
    }finally{
      uniforms.uSkyPreExposure.value=saved.preExposure;uniforms.uTransientReflection.value=saved.reflection;uniforms.uTransientPlaneY.value=saved.planeY;renderer.autoClear=saved.auto;renderer.xr.enabled=saved.xr;renderer.shadowMap.autoUpdate=saved.shadowAuto;renderer.shadowMap.needsUpdate=saved.shadowDirty;
      renderer.setViewport(saved.viewport);renderer.setScissor(saved.scissor);renderer.setScissorTest(saved.scissorTest);
      if(previous){previous.viewport.copy(saved.physicalViewport);previous.scissor.copy(saved.physicalScissor);previous.scissorTest=saved.physicalScissorTest;}
      try{renderer.setRenderTarget(previous,face,mip);}finally{if(previous){previous.viewport.copy(targetMetadata.viewport);previous.scissor.copy(targetMetadata.scissor);previous.scissorTest=targetMetadata.scissorTest;}}
      renderer.state.viewport(saved.physicalViewport);renderer.state.scissor(saved.physicalScissor);renderer.state.setScissorTest(saved.physicalScissorTest);
    }
  }
  function setDiffuseAirEnabled(enabled=true){
    if(snapshotScope)throw new Error('Diffuse air cannot mutate a frozen capture snapshot');
    if(typeof enabled!=='boolean')throw new TypeError('Diffuse air enabled must be boolean');
    uniforms.uAirDiffuseStrength.value=enabled?1:0;lighting();return enabled;
  }
  function setAirMieScale(value=1){uniforms.uAirMieScale.value=clamp(Number(value)||0,0,200);}
  function setCloudShape(value=2){if(Number.isFinite(value))uniforms.uCloudShapeBlend.value=clamp(value,0,2);return uniforms.uCloudShapeBlend.value;}
  function setCloudBaseContinuity(value=0){
    if(snapshotScope)throw new Error('Cloud-base continuity cannot mutate a frozen capture snapshot');
    if(value!==0&&value!==1)throw new RangeError('Cloud-base continuity requires0 or1');
    if(uniforms.uCloudBaseContinuity.value!==value)uniforms.uCloudBaseContinuity.value=value;
    return value;
  }
  lighting();
  // ready starts the night asset load on access and resolves once it is bound.
  return {mesh,uniforms,get ready(){return nightSky.ready;},dayReady:nightSky.dayReady,loadNight:nightSky.load,update,setSun,setCelestial,setStorageExposureEV,captureSnapshot,withSnapshot,prepareStarView,getRadianceBound,lighting,setNight,getNightState:()=>nightSky.state,setDiffuseAirEnabled,setCloudShape,setCloudBaseContinuity,setAirMieScale,setQuality,setSampling,setWeather,getWeatherState:weatherController.state,cloudShadowAt,cloudDensityAt,cloudShadowGLSL,transientCloudGLSL,setTransientLights,renderTransientClouds,diagnostics,dispose};
}
