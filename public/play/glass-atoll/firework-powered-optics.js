// Short causal exposures only. These partitions retain the represented force
// clock; they do not integrate camera history or time-varying transmission.
export const POWERED_OPTICAL_MAX_SHUTTER_SECONDS=1/60;
export const POWERED_OPTICAL_MAX_ROWS=18000;
export function validatePoweredOpticalShutter(shutter,enabled){
  if(!Number.isFinite(shutter)||shutter<0||shutter>1)throw new RangeError('Effect shutter seconds requires0..1');
  if(enabled&&shutter>POWERED_OPTICAL_MAX_SHUTTER_SECONDS)throw new RangeError('Powered effects currently require shutterSeconds <=1/60; long curved-path exposure is not admitted');
  return shutter;
}
export function partitionPoweredOpticalIntervals({body,lagSeconds=0,intervals}){
  if(!body?.thrustProfile)return intervals;
  if(!Number.isFinite(body.birth)||!Number.isFinite(lagSeconds)||lagSeconds<0||!Array.isArray(intervals))throw new RangeError('Powered optical partition requires finite source/lag and intervals');
  const cuts=[body.birth+lagSeconds,...body.thrustProfile.cells.map(cell=>body.birth+cell.toAge+lagSeconds)];
  // Do not create optical rows per wind update: those would depend on host
  // update frequency. Actual anchors retain committed wind; within-piece wind
  // motion and its derivative jumps keep the existing midpoint approximation.
  const result=[];
  for(const interval of intervals){
    if(!Number.isFinite(interval.from)||!Number.isFinite(interval.to)||!(interval.to>interval.from))throw new RangeError('Positive represented optical intervals required');
    const inner=[...new Set(cuts.filter(t=>t>interval.from&&t<interval.to))].sort((a,b)=>a-b),points=[interval.from,...inner,interval.to];
    for(let i=1;i<points.length;i++){
      const from=points[i-1],to=points[i],mid=from+(to-from)*.5;
      if(!(mid>from&&mid<to))throw new RangeError('Powered optical interval is below represented midpoint resolution');
      result.push({...interval,from,to});
    }
  }
  if(result.length>64)throw new RangeError('Powered optical partition exceeds64 intervals; no source truncated');
  return result;
}
