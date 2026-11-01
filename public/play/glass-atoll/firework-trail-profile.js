// Immutable optical allocation and detached-ember chromaticity only. This
// module imports no renderer/physics and does not allocate smoke, kg or fuel.
export const TRAIL_PROFILE_SCHEMA='glass-atoll.layer-trail-profile.v1';
export const THREE_HEART_TRAIL_RECIPE_ID='layered-gold-v1';
export const TRAIL_PROFILE_LIMITS=Object.freeze({maximumDurationSeconds:.35,minimumColourKnots:2,maximumColourKnots:65,unitYTolerance:1e-12});
export const RADIANT_TRAIL_PROFILE_SCHEMA='glass-atoll.radiant-layer-trail-profile.v1';
export const RADIANT_THREE_HEART_TRAIL_RECIPE_ID='radiant-layered-gold-v1';
export const RADIANT_TRAIL_PROFILE_LIMITS=Object.freeze({...TRAIL_PROFILE_LIMITS,maximumDurationSeconds:.88});
const Y=rgb=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
const verified=new WeakSet();
const finite=(v,name)=>{if(typeof v!=='number'||!Number.isFinite(v))throw new RangeError(name+' must be finite');return v;};
const identity=(v,name)=>{if(typeof v!=='string'||v.length<1||v.length>256)throw new TypeError(name+' requires a bounded nonempty string');return v;};
function array(value,min,max,name){
  if(!Array.isArray(value)||value.length<min||value.length>max)throw new TypeError(name+' requires a bounded dense array');
  for(let i=0;i<value.length;i++)if(!Object.hasOwn(value,i)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,i),'value'))throw new TypeError(name+' requires own dense data entries');return value;
}
function colour(value,name){
  array(value,3,3,name);const result=[0,1,2].map(c=>finite(value[c],name+'['+c+']'));
  if(result.some(v=>v<0)||!Number.isFinite(Y(result))||Math.abs(Y(result)-1)>TRAIL_PROFILE_LIMITS.unitYTolerance)throw new RangeError(name+' requires nonnegative unit-Y linear RGB');return result;
}
function domain(fraction,duration){
  finite(fraction,'Trail reference-intensity fraction');finite(duration,'Trail duration');
  if(fraction<0||fraction>1||duration<=0||duration>TRAIL_PROFILE_LIMITS.maximumDurationSeconds)throw new RangeError('Trail fraction requires0..1 and duration requires(0,.35] seconds');
}
function radiantDomain(fraction,duration){finite(fraction,'Radiant trail reference-intensity fraction');finite(duration,'Radiant trail duration');if(fraction<0||fraction>1||duration<=0||duration>RADIANT_TRAIL_PROFILE_LIMITS.maximumDurationSeconds)throw new RangeError('Radiant trail fraction requires0..1 and duration requires(0,.88] seconds');}
function maximum(knots){return[0,1,2].map(c=>Math.max(...knots.map(rgb=>rgb[c])));}
function representableColourAges(duration,segments){
  let previous=0;for(let i=1;i<=segments;i++){const age=duration*(i/segments);if(!(age>previous))throw new RangeError('Trail uniform colour-age nodes must be representable and strictly increasing');previous=age;}
}
export function createTrailProfile(options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Reflect.ownKeys(options).some(k=>typeof k!=='string'||!['recipeId','layerId','referenceIntensityFraction','durationSeconds','colourKnotsRGB'].includes(k))||Object.values(Object.getOwnPropertyDescriptors(options)).some(d=>!Object.hasOwn(d,'value')))throw new TypeError('Unsupported trail-profile descriptor');
  const {recipeId,layerId,referenceIntensityFraction,durationSeconds,colourKnotsRGB}=options;identity(recipeId,'Trail recipe ID');identity(layerId,'Trail layer ID');domain(referenceIntensityFraction,durationSeconds);
  const source=array(colourKnotsRGB,TRAIL_PROFILE_LIMITS.minimumColourKnots,TRAIL_PROFILE_LIMITS.maximumColourKnots,'Trail colour knots');representableColourAges(durationSeconds,source.length-1);const knots=source.map((rgb,i)=>Object.freeze(colour(rgb,'Trail colour knot'+i)));
  const profile=Object.freeze({schema:TRAIL_PROFILE_SCHEMA,recipeId,layerId,referenceIntensityFraction,headIntensityFraction:1-referenceIntensityFraction,durationSeconds,colourSegments:knots.length-1,colourKnotsRGB:Object.freeze(knots),allPhaseColourMaximumRGB:Object.freeze(maximum(knots)),
    colourModel:'piecewise-linear-unit-Y-gold-cooling-v1',ageParameter:'detached ember age / fixed duration; uniform normalized-age knots',calibration:'authored reference optical allocation/chromaticity; no measured candela, kg, fuel, chemical or thermal-energy calibration'});
  verified.add(profile);return profile;
}
export function validateTrailProfile(profile){
  if(!profile||typeof profile!=='object'||Array.isArray(profile))throw new TypeError('Trail profile requires an immutable object');if(verified.has(profile))return profile;
  if(Object.values(Object.getOwnPropertyDescriptors(profile)).some(d=>!Object.hasOwn(d,'value'))||!['schema','recipeId','layerId','referenceIntensityFraction','headIntensityFraction','durationSeconds','colourSegments','colourKnotsRGB','allPhaseColourMaximumRGB'].every(k=>Object.hasOwn(profile,k)))throw new TypeError('Trail profile requires own immutable data fields');
  if(![TRAIL_PROFILE_SCHEMA,RADIANT_TRAIL_PROFILE_SCHEMA].includes(profile.schema)||!Object.isFrozen(profile))throw new TypeError('Trail profile requires a supported immutable schema');
  identity(profile.recipeId,'Trail recipe ID');identity(profile.layerId,'Trail layer ID');if(profile.schema===RADIANT_TRAIL_PROFILE_SCHEMA){if(profile.recipeId!==RADIANT_THREE_HEART_TRAIL_RECIPE_ID)throw new RangeError('Radiant trail requires its versioned recipe');radiantDomain(profile.referenceIntensityFraction,profile.durationSeconds);}else domain(profile.referenceIntensityFraction,profile.durationSeconds);
  const knots=array(profile.colourKnotsRGB,TRAIL_PROFILE_LIMITS.minimumColourKnots,TRAIL_PROFILE_LIMITS.maximumColourKnots,'Trail colour knots');
  representableColourAges(profile.durationSeconds,knots.length-1);
  if(!Object.isFrozen(knots)||knots.some(rgb=>!Object.isFrozen(rgb)))throw new TypeError('Trail colour knots must be immutable');
  knots.forEach((rgb,i)=>colour(rgb,'Trail colour knot'+i));
  if(profile.colourSegments!==knots.length-1||profile.headIntensityFraction!==1-profile.referenceIntensityFraction)throw new RangeError('Trail derived allocation/segments mismatch');
  const bound=array(profile.allPhaseColourMaximumRGB,3,3,'Trail all-phase maximum'),expected=maximum(knots);if(!Object.isFrozen(bound)||bound.some((v,c)=>!Number.isFinite(v)||v!==expected[c]))throw new RangeError('Trail all-phase maximum must match every piecewise-linear endpoint');
  verified.add(profile);return profile;
}
export function sampleTrailColour(profile,age){
  validateTrailProfile(profile);finite(age,'Detached ember age');
  // Endpoint extension defines chromaticity only. The caller owns the finite
  // luminous interval/intensity and must still retire an ember outside[0,D].
  const x=Math.max(0,Math.min(1,age/profile.durationSeconds))*profile.colourSegments,index=Math.min(profile.colourSegments-1,Math.floor(x)),f=x-index,a=profile.colourKnotsRGB[index],b=profile.colourKnotsRGB[index+1];
  return[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f];
}

// Match the existing 5nm Planck/CIE analytic colour construction exactly at
//2850K (including neutral gamut compression). Only nine initialization-time
// nodes are evaluated; no Planck integration runs in per-frame sampling.
function thermalColourAtKelvin(temperature){
  const xyz=[0,0,0],e=(w,a,b,c)=>Math.exp(-.5*((w-a)*(w<a?b:c))**2);
  for(let w=380;w<=780;w+=5){const l=w*1e-9,s=1/(l**5*Math.expm1(.01438776877/(l*temperature)))*1e-29;
    const cmf=[.362*e(w,442,.0624,.0374)+1.056*e(w,599.8,.0264,.0323)-.065*e(w,501.1,.049,.0382),.821*e(w,568.8,.0213,.0247)+.286*e(w,530.9,.0613,.0322),1.217*e(w,437,.0845,.0278)+.681*e(w,459,.0385,.0725)];
    for(let c=0;c<3;c++)xyz[c]+=s*cmf[c]*5;
  }
  let rgb=[3.24096994*xyz[0]-1.53738318*xyz[1]-.49861076*xyz[2],-.96924364*xyz[0]+1.8759675*xyz[1]+.04155506*xyz[2],.05563008*xyz[0]-.20397696*xyz[1]+1.05697151*xyz[2]];
  const neutral=Math.max(0,-Math.min(...rgb));rgb=rgb.map(v=>v+neutral);const luminance=Y(rgb);return rgb.map(v=>v/luminance);
}
const goldCoolingKnots=Array.from({length:9},(_,i)=>thermalColourAtKelvin(2850-950*i/8));
// A separate constructor/schema leaves the original .35s admission unchanged.
export function createRadiantTrailProfile(options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Reflect.ownKeys(options).some(k=>typeof k!=='string'||!['recipeId','layerId','referenceIntensityFraction','durationSeconds','colourKnotsRGB'].includes(k))||Object.values(Object.getOwnPropertyDescriptors(options)).some(d=>!Object.hasOwn(d,'value')))throw new TypeError('Unsupported radiant trail-profile descriptor');
  const {recipeId,layerId,referenceIntensityFraction,durationSeconds,colourKnotsRGB}=options;if(recipeId!==RADIANT_THREE_HEART_TRAIL_RECIPE_ID)throw new RangeError('Radiant trail requires its versioned recipe');identity(layerId,'Trail layer ID');radiantDomain(referenceIntensityFraction,durationSeconds);
  const source=array(colourKnotsRGB,TRAIL_PROFILE_LIMITS.minimumColourKnots,TRAIL_PROFILE_LIMITS.maximumColourKnots,'Trail colour knots');representableColourAges(durationSeconds,source.length-1);const knots=source.map((rgb,i)=>Object.freeze(colour(rgb,'Trail colour knot'+i)));
  const profile=Object.freeze({schema:RADIANT_TRAIL_PROFILE_SCHEMA,recipeId,layerId,referenceIntensityFraction,headIntensityFraction:1-referenceIntensityFraction,durationSeconds,colourSegments:knots.length-1,colourKnotsRGB:Object.freeze(knots),allPhaseColourMaximumRGB:Object.freeze(maximum(knots)),colourModel:'piecewise-linear-unit-Y-gold-cooling-v1',ageParameter:'detached ember age / fixed duration; uniform normalized-age knots',calibration:'authored reference optical allocation/chromaticity; no measured candela, kg, fuel, chemical or thermal-energy calibration'});verified.add(profile);return profile;
}
export const RADIANT_THREE_HEART_TRAIL_PROFILES=Object.freeze(Object.fromEntries([
  ['outer',.72,.88],['middle',.56,.66],['inner',.38,.40]
].map(([layerId,referenceIntensityFraction,durationSeconds])=>[layerId,createRadiantTrailProfile({recipeId:RADIANT_THREE_HEART_TRAIL_RECIPE_ID,layerId,referenceIntensityFraction,durationSeconds,colourKnotsRGB:goldCoolingKnots})])));
export const THREE_HEART_TRAIL_PROFILES=Object.freeze(Object.fromEntries([
  ['outer',.06,.10],['middle',.14,.20],['inner',.24,.32]
].map(([layerId,referenceIntensityFraction,durationSeconds])=>[layerId,createTrailProfile({recipeId:THREE_HEART_TRAIL_RECIPE_ID,layerId,referenceIntensityFraction,durationSeconds,colourKnotsRGB:goldCoolingKnots})])));

// Only the32 powered roots use this shorter, lower-allocation optical recipe.
// The160 native roots retain their original scalar optics and.35s tail.
export const POWERED_BEE_TRAIL_RECIPE_ID='powered-bee-gold-v1';
export const POWERED_BEE_TRAIL_PROFILE=createTrailProfile({recipeId:POWERED_BEE_TRAIL_RECIPE_ID,layerId:'motor',referenceIntensityFraction:.10,durationSeconds:.18,colourKnotsRGB:goldCoolingKnots});
