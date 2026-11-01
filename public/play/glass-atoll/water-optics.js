// All RGB coefficients below are authored scene references in m^-1, not
// measured spectral seawater data, NTU, Secchi depth, or a calibrated survey.
export const DEFAULT_WATER_CLARITY=.90;
export const WATER_ABSORPTION_REFERENCE=Object.freeze([.160,.035,.018]);
export const WATER_SCATTERING_REFERENCE=Object.freeze([.004,.009,.014]);
export const WATER_MOLECULAR_SCATTERING_FLOOR=Object.freeze([.0005,.001,.002]);
export const WATER_PARTICLE_SCATTERING_REFERENCE=Object.freeze([.0035,.008,.012]);

export function validateWaterClarity(clarity){
  if(!Number.isFinite(clarity)||clarity<0||clarity>1)throw new RangeError('Water clarity must be a finite number from0 to1.');
  return clarity;
}

export function deriveWaterOptics(clarity=DEFAULT_WATER_CLARITY){
  validateWaterClarity(clarity);
  const particleMultiplier=clarity===DEFAULT_WATER_CLARITY?1:((1-clarity)/.1)**2;
  // Preserve the original authored coefficients exactly at the default, without
  // decimal subtraction/rounding drift or any new shader reference-case branch.
  const absorption=Object.freeze([...WATER_ABSORPTION_REFERENCE]);
  const scattering=Object.freeze(clarity===DEFAULT_WATER_CLARITY?[...WATER_SCATTERING_REFERENCE]:WATER_MOLECULAR_SCATTERING_FLOOR.map((floor,c)=>floor+WATER_PARTICLE_SCATTERING_REFERENCE[c]*particleMultiplier));
  const extinction=Object.freeze(absorption.map((a,c)=>a+scattering[c]));
  return Object.freeze({clarity,absorption,scattering,extinction,particleMultiplier,coefficientUnit:'m^-1',beamEfoldDistanceMetres:Object.freeze(extinction.map(c=>1/c)),reference:'authored linear-RGB effective coefficients; clarity changes only suspended-particle scattering; not measured full-spectrum/NTU/Secchi data'});
}

export function resolveWaterOptics(patch={},current=deriveWaterOptics()){
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>key!=='clarity'))throw new TypeError('Water optics accepts only an object with optional clarity.');
  return deriveWaterOptics(Object.hasOwn(patch,'clarity')?validateWaterClarity(patch.clarity):current.clarity);
}

function finiteNonnegative(value,label){if(!Number.isFinite(value)||value<0)throw new RangeError(label+' must be finite and nonnegative.');return value;}
function rgb(values,label){if(!Array.isArray(values)||values.length!==3)throw new TypeError(label+' requires three linear RGB channels.');return values.map((v,c)=>finiteNonnegative(v,label+'['+c+']'));}

// Collimated beam survival: extinction is absorption plus all out-scattering.
export function waterBeamTransmission(optics,distanceMetres){
  finiteNonnegative(distanceMetres,'Water path length');
  return rgb(optics.extinction,'Extinction').map(c=>Math.exp(-c*distanceMetres));
}

// Homogeneous single scattering for a constant incident source radiance.
// Angular phase/irradiance conversion must already be included by the caller.
export function homogeneousWaterSegment(optics,distanceMetres,sourceRadiance=[0,0,0]){
  const transmission=waterBeamTransmission(optics,distanceMetres),source=rgb(sourceRadiance,'Source radiance'),scattering=rgb(optics.scattering,'Scattering');
  const radiance=transmission.map((T,c)=>optics.extinction[c]>0?source[c]*scattering[c]/optics.extinction[c]*(-Math.expm1(-optics.extinction[c]*distanceMetres)):0);
  return{transmission,radiance};
}

// Front-to-back radiance transport, not surface alpha blending.
export function composeWaterSegments(front,back){
  const aT=rgb(front.transmission,'Front transmission'),bT=rgb(back.transmission,'Back transmission'),aS=rgb(front.radiance,'Front radiance'),bS=rgb(back.radiance,'Back radiance');
  return{transmission:aT.map((T,c)=>T*bT[c]),radiance:aS.map((S,c)=>S+aT[c]*bS[c])};
}
