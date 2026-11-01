// The far sea and sky use the same spherical-Earth datum. Values are metres.
// Local geometry remains dense; only the previously stretched outer grid rows
// are redistributed. This module creates no renderer or extra mesh/pass.
export const OCEAN_EARTH_RADIUS=6360000;
export const OCEAN_NEAR_EXTENT=96;
export const OCEAN_GRID_EXTENT=110;
export const OCEAN_FAR_EXTENT=65536;
export const OCEAN_REQUIRED_CAMERA_FAR=120000;
export function oceanGridCoordinate(value,mode='curved'){
  if(!Number.isFinite(value))throw new TypeError('Ocean grid coordinate must be finite');
  if(mode!=='legacy'&&mode!=='curved')throw new RangeError('Ocean far-field mode must be legacy or curved');
  const a=Math.abs(value);
  if(mode==='legacy')return a>109.9?Math.sign(value)*10000:value;
  if(a<=OCEAN_NEAR_EXTENT)return value;
  const t=Math.max(0,Math.min(1,(a-OCEAN_NEAR_EXTENT)/(OCEAN_GRID_EXTENT-OCEAN_NEAR_EXTENT)));
  return Math.sign(value)*(OCEAN_NEAR_EXTENT+Math.expm1(t*Math.log1p(OCEAN_FAR_EXTENT-OCEAN_NEAR_EXTENT)));
}
export function oceanDatum(x,z,{curved=true,radius=OCEAN_EARTH_RADIUS}={}){
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||radius<=0)throw new TypeError('Finite ocean coordinates and positive radius required');
  if(!curved)return 0;
  const r2=x*x+z*z;if(r2>=radius*radius)throw new RangeError('Ocean tangent coordinates exceed spherical datum support');
  // Stable at submillimetre near-field drops; do not subtract two ~6Mm values.
  return-r2/(radius+Math.sqrt(radius*radius-r2));
}
export function oceanHorizon(height,radius=OCEAN_EARTH_RADIUS){
  if(!Number.isFinite(height)||height<0||!Number.isFinite(radius)||radius<=0)throw new TypeError('Nonnegative height and positive radius required');
  return{distanceMetres:Math.sqrt(height*(2*radius+height)),dipRadians:Math.acos(radius/(radius+height))};
}
export const oceanDatumGLSL=/* glsl */`
  uniform float uOceanCurvature;
  float oceanDatum(vec2 p){float r2=dot(p,p);return-uOceanCurvature*r2/(6360000.0+sqrt(max(1.0,40449600000000.0-r2)));}
  vec3 oceanMacroNormal(vec2 p){float y=sqrt(max(1.0,40449600000000.0-dot(p,p)));return normalize(vec3(uOceanCurvature*p.x/y,1.0,uOceanCurvature*p.y/y));}
`;
