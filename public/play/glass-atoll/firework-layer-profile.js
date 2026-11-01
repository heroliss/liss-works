// Pure opt-in compiler/samplers. Profiles are authored display references,
// not measured candela, fuel/particle mass or chemical/spectral calibration.
import {createBurnProfile,instantiateBurnProfile,sampleBurnProfile,EXAMPLE_BURN_PROFILES} from './firework-burn-profile.js';
import {THREE_HEART_TRAIL_RECIPE_ID,THREE_HEART_TRAIL_PROFILES,POWERED_BEE_TRAIL_RECIPE_ID,POWERED_BEE_TRAIL_PROFILE} from './firework-trail-profile.js';
import {compileSeededBeeThrust} from './firework-thrust-profile.js';
import {compileThreeHeartRadialScale,THREE_HEART_SCALE_LIMITS} from './firework-scale-calibration.js';
import {applyRadiantThreeHeartProfile,RADIANT_THREE_HEART_PROFILE_ID,RADIANT_THREE_HEART_LIMITS} from './firework-radiant-profile.js';

export const FIREWORK_EFFECT_PROFILES=Object.freeze(['legacy','three-heart-v1','two-colour-v1','powered-bees-v1','three-heart-scale120-v1',RADIANT_THREE_HEART_PROFILE_ID]);
const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){for(const v of Object.values(o))freeze(v);Object.freeze(o);}return o;};
export const FIREWORK_LAYER_PROFILE_LIMITS=freeze({
  'three-heart-v1':{maximumBodySeconds:4.876,intrinsicSpeed:19,maximumIgnitionDelaySeconds:0,tailDurationSeconds:.35,propulsionKind:'none',bodyCount:192,layerCount:3,lifeVariationFraction:.06,intensityVariationFraction:0},
  'two-colour-v1':{maximumBodySeconds:3.392,intrinsicSpeed:19,maximumIgnitionDelaySeconds:0,tailDurationSeconds:.35,propulsionKind:'none',bodyCount:192,layerCount:1,lifeVariationFraction:.06,intensityVariationFraction:0},
  'three-heart-scale120-v1':THREE_HEART_SCALE_LIMITS,
  [RADIANT_THREE_HEART_PROFILE_ID]:RADIANT_THREE_HEART_LIMITS
});
// A separate versioned contract: none of the non-propelled limits above is
// silently extended.19 is the native impulse, never the powered speed bound.
export const FIREWORK_POWERED_PROFILE_LIMITS=freeze({
  'powered-bees-v1':{maximumBodySeconds:4.773,maximumRadialBodySeconds:4.773,maximumMotorBodySeconds:1.908,intrinsicSpeed:19,motorIntrinsicSpeed:8.55,maximumCombinedIntrinsicSpeedMetresPerSecond:31.72,maximumIntegratedAccelerationMetresPerSecond:12.72,maximumMotorEndSeconds:1.06,maximumMotorAccelerationMetresPerSecondSquared:12,maximumIgnitionDelaySeconds:0,tailDurationSeconds:.35,motorTailDurationSeconds:.18,propulsionKind:'finite-held-author-acceleration-v1',bodyCount:192,motorBodyCount:32,radialBodyCount:160,vectorBodyCount:32,legacyBodyCount:160,layerCount:2,lifeVariationFraction:.06,intensityVariationFraction:0,maximumOpticalShutterSeconds:1/60,requiredStarDragModel:'bounded-descent',requiredBodyDragPerSecond:9.81/16}
});
export function getFireworkEffectProfileLimits(effectProfile){if(typeof effectProfile!=='string')return null;return Object.hasOwn(FIREWORK_LAYER_PROFILE_LIMITS,effectProfile)?FIREWORK_LAYER_PROFILE_LIMITS[effectProfile]:Object.hasOwn(FIREWORK_POWERED_PROFILE_LIMITS,effectProfile)?FIREWORK_POWERED_PROFILE_LIMITS[effectProfile]:null;}
const Y=rgb=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
const finite=(x,name)=>{if(typeof x!=='number'||!Number.isFinite(x))throw new RangeError(name+' must be finite');return x;};
const finiteVector=v=>Array.isArray(v)&&v.length===3&&[0,1,2].every(c=>Number.isFinite(v[c]));
const verifiedWindowProfiles=new WeakSet();
export function validateFireworkEffectProfile(type,effectProfile='legacy'){
  if(!FIREWORK_EFFECT_PROFILES.includes(effectProfile))throw new RangeError('Unknown effectProfile');
  if(effectProfile!=='legacy'&&type!=='chrysanthemum')throw new RangeError('Nonlegacy effectProfile requires chrysanthemum');return effectProfile;
}
function layerFor(id,effectProfile){
  if(effectProfile==='two-colour-v1')return{id:'single',multiplier:1,template:EXAMPLE_BURN_PROFILES.twoColour};
  return[{id:'outer',multiplier:1,template:EXAMPLE_BURN_PROFILES.outerBlue},{id:'middle',multiplier:.7,template:EXAMPLE_BURN_PROFILES.middleGreen},{id:'inner',multiplier:.4,template:EXAMPLE_BURN_PROFILES.innerRed}][id%3];
}
export function compileFireworkLayerProfile({type,effectProfile='legacy',heads,burstVelocity,eventSeed,burstFrame}={}){
  validateFireworkEffectProfile(type,effectProfile);if(effectProfile==='legacy')return null;
  if(!Array.isArray(heads)||heads.length!==192||!finiteVector(burstVelocity))throw new RangeError('Layer profile requires192 native roots and finite burst velocity');
  if(!Number.isSafeInteger(eventSeed)||eventSeed<0||eventSeed>4294967295)throw new RangeError('Layer seed requires uint32');
  if(effectProfile===RADIANT_THREE_HEART_PROFILE_ID)return applyRadiantThreeHeartProfile(compileFireworkLayerProfile({type,effectProfile:'three-heart-scale120-v1',heads,burstVelocity,eventSeed,burstFrame}));
  if(effectProfile==='powered-bees-v1')return compilePoweredBees({heads,burstVelocity,eventSeed,burstFrame});
  const scaled=effectProfile==='three-heart-scale120-v1',threeHeart=effectProfile==='three-heart-v1'||scaled,referenceBurnProfiles=scaled?[]:null;
  const ids=new Set(),patches=[],layerCounts={},limits=FIREWORK_LAYER_PROFILE_LIMITS[effectProfile];let sumI0=0,maximumLife=0;
  for(const body of heads){
    if(!Number.isSafeInteger(body.id)||body.id<0||body.id>=192||ids.has(body.id)||body.parentBody)throw new RangeError('Layer profile requires each original root ID0..191 exactly once');ids.add(body.id);
    if(!finiteVector(body.baseVelocity)||!(body.intensity>=0)||!Number.isFinite(body.intensity))throw new RangeError('Layer body requires finite native base velocity/I0');
    const layer=layerFor(body.id,effectProfile),relative=body.baseVelocity.map((v,c)=>v-burstVelocity[c]);
    if(Math.hypot(...relative)>19+1e-8)throw new RangeError('Native intrinsic speed exceeds the layer hard contract');
    const velocity=relative.map((v,c)=>burstVelocity[c]+v*layer.multiplier),instance=instantiateBurnProfile(layer.template,{eventSeed,bodyId:body.id,layerId:layer.id,lifeVariationFraction:.06,intensityVariationFraction:0,opticalScale:1});
    const peak=Math.max(...instance.emission.knots.map(k=>Y(k.rgb))),scale=body.intensity/peak;
    const burnProfile=createBurnProfile({id:instance.id,emissionKnots:instance.emission.knots.map(k=>({age:k.age,rgb:k.rgb.map(v=>v*scale)})),materialRateKnots:instance.material.knots.map(k=>({age:k.age,rate:k.rate})),
      metadata:{...instance.metadata,effectProfile,layerId:layer.id,normalization:{policy:'native I0 peak budget; current intensityScale already included; no second gain',nativeReferenceI0:body.intensity,templatePeakY:peak},physicalCalibration:'authored reference; no measured kg/fuel/photometry'}});
    const life=burnProfile.lifetimeSeconds;if(life>limits.maximumBodySeconds+1e-12)throw new RangeError('Derived life exceeds fixed layer contract');
    patches.push({id:body.id,effectProfile,layerId:layer.id,ignitionDelay:0,burnProfile,life,velocity,baseVelocity:[...velocity],emissionReferenceI0:body.intensity,...(threeHeart?{trailProfile:THREE_HEART_TRAIL_PROFILES[layer.id]}:{})});
    if(scaled)referenceBurnProfiles.push({id:body.id,profile:instance});
    layerCounts[layer.id]=(layerCounts[layer.id]??0)+1;sumI0+=body.intensity;maximumLife=Math.max(maximumLife,life);
  }
  const radial=scaled?compileThreeHeartRadialScale({nativeHeads:heads,layerPatches:patches,burstVelocity,referenceBurnProfiles}):null;
  if(radial){const scaledByID=new Map(radial.velocityPatches.map(p=>[p.id,p]));for(const patch of patches)Object.assign(patch,scaledByID.get(patch.id));}
  return freeze({schema:'glass-atoll.compiled-layer-profile.v1',effectProfile,patches,layerCounts,referencePeakBudget:sumI0,maximumLife,limits,...(threeHeart?{trailRecipeId:THREE_HEART_TRAIL_RECIPE_ID}:{}),...(radial?{radialScale:radial.radialScale}:{}),
    photometry:'peakY normalized to each existing body I0; no claim of unchanged time integral',material:'No CDF scheduler or material allocation changed; downstream original model remains',propulsionKind:'none'});
}
// This keyed namespace has no dependency on the generator's sequential RNG.
// One choice per six-ID sphere stratum retains coverage without extra roots.
function selectionHash(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return(h^(h>>>16))>>>0;}
function compilePoweredBees({heads,burstVelocity,eventSeed,burstFrame}){
  const effectProfile='powered-bees-v1',limits=FIREWORK_POWERED_PROFILE_LIMITS[effectProfile],seedNamespace='glass-atoll.bee-selection-v1';
  if(burstFrame===undefined)throw new RangeError('Powered layer compiler requires its actual burst frame');
  const motorBodyIds=Array.from({length:32},(_,stratum)=>stratum*6+selectionHash(`${seedNamespace}/${eventSeed}/${stratum}`)%6),selected=new Set(motorBodyIds),ids=new Set(),patches=[];
  let sumI0=0,maximumLife=0,maximumMotorEndSeconds=0,maximumActualIntegratedAccelerationMetresPerSecond=0,maximumMotorBodySeconds=0;
  for(const body of heads){
    if(!Number.isSafeInteger(body.id)||body.id<0||body.id>=192||ids.has(body.id)||body.parentBody)throw new RangeError('Powered profile requires each original root ID0..191 exactly once');ids.add(body.id);
    if(!finiteVector(body.baseVelocity)||!(body.intensity>=0)||!Number.isFinite(body.intensity)||!Number.isFinite(body.life)||body.life<=0||body.life>limits.maximumRadialBodySeconds+1e-12||body.drag!==limits.requiredBodyDragPerSecond)throw new RangeError('Powered roots require native bounded-descent velocity, I0, lifetime and drag');
    const relative=body.baseVelocity.map((v,c)=>v-burstVelocity[c]);if(Math.hypot(...relative)>limits.intrinsicSpeed+1e-8)throw new RangeError('Native intrinsic speed exceeds powered profile contract');
    sumI0+=body.intensity;
    if(!selected.has(body.id)){maximumLife=Math.max(maximumLife,body.life);continue;}
    const layerId='motor',instance=instantiateBurnProfile(EXAMPLE_BURN_PROFILES.bee,{eventSeed,bodyId:body.id,layerId,lifeVariationFraction:.06,intensityVariationFraction:0,opticalScale:1}),timeScale=instance.metadata.instance.timeScale;
    const thrustProfile=compileSeededBeeThrust({eventSeed,bodyId:body.id,timeScale,frame:burstFrame});
    const peak=Math.max(...instance.emission.knots.map(k=>Y(k.rgb))),scale=body.intensity/peak,motor=instance.propulsion;
    const burnProfile=createBurnProfile({id:instance.id,emissionKnots:instance.emission.knots.map(k=>({age:k.age,rgb:k.rgb.map(v=>v*scale)})),materialRateKnots:instance.material.knots.map(k=>({age:k.age,rate:k.rate})),
      propulsion:{kind:motor.kind,accelerationKnots:motor.accelerationKnots.map(k=>({age:k.age,rate:k.rate})),maximumTurnDegreesPerSecond:motor.maximumTurnDegreesPerSecond,directionKnotSeconds:motor.directionKnotSeconds,deltaVLimitMetresPerSecond:motor.deltaVLimitMetresPerSecond},
      metadata:{...instance.metadata,effectProfile,layerId,normalization:{policy:'native I0 peak budget; current intensityScale already included; no second gain',nativeReferenceI0:body.intensity,templatePeakY:peak},motion:{thrustProfileId:thrustProfile.id,model:'finite piecewise-held world acceleration',timeScale,descriptorEnvelope:'authored continuous magnitude reference; actual force is the immutable held-cell schedule'},physicalCalibration:'authored reference; no measured kg/fuel/photometry'}});
    const life=burnProfile.lifetimeSeconds,velocity=relative.map((v,c)=>burstVelocity[c]+v*.45);
    if(life>limits.maximumMotorBodySeconds+1e-12||thrustProfile.motorEndAge>limits.maximumMotorEndSeconds+1e-12||thrustProfile.integratedAccelerationMagnitudeMetresPerSecond>limits.maximumIntegratedAccelerationMetresPerSecond+1e-12)throw new RangeError('Instantiated motor exceeds the powered profile contract');
    patches.push({id:body.id,effectProfile,layerId,ignitionDelay:0,burnProfile,life,velocity,baseVelocity:[...velocity],emissionReferenceI0:body.intensity,thrustProfile,trailProfile:POWERED_BEE_TRAIL_PROFILE});
    maximumLife=Math.max(maximumLife,life);maximumMotorBodySeconds=Math.max(maximumMotorBodySeconds,life);maximumMotorEndSeconds=Math.max(maximumMotorEndSeconds,thrustProfile.motorEndAge);maximumActualIntegratedAccelerationMetresPerSecond=Math.max(maximumActualIntegratedAccelerationMetresPerSecond,thrustProfile.integratedAccelerationMagnitudeMetresPerSecond);
  }
  patches.sort((a,b)=>a.id-b.id);
  return freeze({schema:'glass-atoll.compiled-layer-profile.v1',effectProfile,patches,layerCounts:{radial:160,motor:32},motorBodyIds,referencePeakBudget:sumI0,maximumLife,limits,trailRecipeId:POWERED_BEE_TRAIL_RECIPE_ID,
    motionProfile:{schema:'glass-atoll.powered-bees-motion.v1',motorBodyCount:32,radialBodyCount:160,vectorBodyCount:32,legacyBodyCount:160,seedNamespace,thrustSeedNamespace:'glass-atoll.thrust-v1',maximumMotorEndSeconds,maximumActualIntegratedAccelerationMetresPerSecond,maximumMotorBodySeconds,maximumOpticalShutterSeconds:limits.maximumOpticalShutterSeconds,bodyClock:'relative to unchanged body.birth',model:'finite piecewise-held world acceleration'},
    photometry:'32 motor peakY values normalized to existing I0 once;160 radial scalar appearances remain native; no measured photometry',material:'Native per-family material allocation is unchanged; burn descriptor CDF is not the production smoke scheduler',propulsionKind:limits.propulsionKind});
}
export function sampleProfileBodyEmission(body,age){
  if(!body.burnProfile)throw new RangeError('Profile emission requires a compiled body');finite(age,'Body relative age');
  const value=sampleBurnProfile(body.burnProfile,age-(body.ignitionDelay??0)),I0=body.emissionReferenceI0??body.intensity;
  return{...value,allPhaseMaximumRGB:body.burnProfile.emission.sourceMaximumRGB,envelope:I0>0?value.intensityCdReference/I0:0,effectProfile:body.effectProfile,layerId:body.layerId};
}
// Eight positive time bins. Each tap is a local reference-RGB integral divided
// by the common width/8, so the shader's uniform1/8 weights retain total flux.
export function sampleProfileBodyEmissionWindow(body,{fromAge,toAge,bins=8,outRGB}={}){
  if(!body.burnProfile)throw new RangeError('Vector profile window is opt-in only');finite(fromAge,'Window start');finite(toAge,'Window end');
  if(!verifiedWindowProfiles.has(body.burnProfile)){sampleBurnProfile(body.burnProfile,0);verifiedWindowProfiles.add(body.burnProfile);}
  if(toAge<fromAge||!Number.isFinite(toAge-fromAge)||bins!==8)throw new RangeError('Profile window requires ordered finite ages and8 bins');
  if(outRGB!==undefined&&(!(outRGB instanceof Float64Array||outRGB instanceof Float32Array)||outRGB.length<24))throw new TypeError('outRGB requires24 Float64/Float32 entries');
  const rgbTaps=outRGB??new Float64Array(24),delay=body.ignitionDelay??0,start=fromAge-delay,end=toAge-delay,width=end-start,knots=body.burnProfile.emission.knots;
  let totalR=0,totalG=0,totalB=0;
  if(width===0){const v=sampleBurnProfile(body.burnProfile,start).emissionRGBReference;for(let i=0;i<8;i++)for(let c=0;c<3;c++)rgbTaps[i*3+c]=v[c];totalR=v[0];totalG=v[1];totalB=v[2];}
  else for(let bin=0;bin<8;bin++){
    const lo=start+width*bin/8,hi=bin===7?end:start+width*(bin+1)/8;if(!(hi>lo))throw new RangeError('Positive profile bins are not representable at this age');
    // RGB shares the same overlap and interpolation fractions. Keep each
    // channel's original summation order and compensation independently.
    let r=0,g=0,bv=0,cr=0,cg=0,cb=0;
    for(let k=0;k<knots.length-1;k++){
      const a=knots[k],b=knots[k+1],left=Math.max(lo,a.age),right=Math.min(hi,b.age);if(!(right>left))continue;
      const u=(left-a.age)/(b.age-a.age),v=(right-a.age)/(b.age-a.age),span=right-left;
      let va=a.rgb[0]+(b.rgb[0]-a.rgb[0])*u,vb=a.rgb[0]+(b.rgb[0]-a.rgb[0])*v,x=(va+vb)*.5*span-cr,next=r+x;cr=(next-r)-x;r=next;
      va=a.rgb[1]+(b.rgb[1]-a.rgb[1])*u;vb=a.rgb[1]+(b.rgb[1]-a.rgb[1])*v;x=(va+vb)*.5*span-cg;next=g+x;cg=(next-g)-x;g=next;
      va=a.rgb[2]+(b.rgb[2]-a.rgb[2])*u;vb=a.rgb[2]+(b.rgb[2]-a.rgb[2])*v;x=(va+vb)*.5*span-cb;next=bv+x;cb=(next-bv)-x;bv=next;
    }
    rgbTaps[bin*3]=r/(width/8);rgbTaps[bin*3+1]=g/(width/8);rgbTaps[bin*3+2]=bv/(width/8);totalR+=r/width;totalG+=g/width;totalB+=bv/width;
  }
  const averageRGBReference=[totalR,totalG,totalB];return{fromAge,toAge,bins:8,rgbTaps,averageRGBReference,integralRGBReferenceSeconds:averageRGBReference.map(v=>v*width),allPhaseMaximumRGB:body.burnProfile.emission.sourceMaximumRGB,
    bufferLifetime:outRGB?'Borrowed caller buffer, first24 entries overwritten; consume before caller reuses it':'Owned new24-entry Float64 buffer',scope:'Source vector time-bin averages only; no geometry kernel, head/tail allocation, P/C or transmission integration'};
}
