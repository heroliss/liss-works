// An explicit relative photometric reference, not an absolute sensor calibration.
export const RAW_PER_CANDELA=3.6/100000;
export const HALF_FLOAT_MAX=65504;
export const SAFE_HDR_MAX=16376; // fourfold accumulation/roundoff headroom
const finite=(v,f=0)=>Number.isFinite(v)?v:f,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function storageExposureForBound(recommendedEV,maxRawRGB,safeMaximum=SAFE_HDR_MAX){
  const wanted=clamp(finite(recommendedEV),-24,24),bound=Math.max(0,finite(maxRawRGB));
  if(bound===0)return wanted;
  return Math.min(wanted,clamp(Math.floor(4*Math.log2(safeMaximum/bound))/4,-32,24));
}
export function exposureRatio(currentEV,captureEV){return 2**clamp(finite(currentEV)-finite(captureEV),-64,64);}
export function finiteSourceRadiance(candela,radius){return Math.max(0,finite(candela))/(Math.PI*Math.max(1e-6,finite(radius,.02))**2);}
export function inverseSquareIlluminance(candela,distance,radius=.02){return Math.max(0,finite(candela))/Math.max(radius*radius,distance*distance);}
export function createSceneRadiometry({safeMaximum=SAFE_HDR_MAX}={}){
  let storageEV=0,cameraEV=0,bound=0,targetEV=0,epochs=0,lastDelta=0,initialized=false;
  const components={};
  return {
    update({recommendedEV=0,cameraExposureEV=recommendedEV,bounds={},dt=1/60,force=false}={}){
      bound=0;for(const key of Object.keys(components))delete components[key];
      for(const [name,value]of Object.entries(bounds)){const b=typeof value==='number'?value:value?.maxRGB;components[name]=Math.max(0,finite(b));bound+=components[name];}
      targetEV=storageExposureForBound(recommendedEV,bound,safeMaximum);
      const old=storageEV;
      // Lower before drawing a newly bright source. Raise gradually unless a
      // discrete clock/configuration change requests immediate reinitialization.
      storageEV=!initialized||force||targetEV<storageEV?targetEV:Math.min(targetEV,storageEV+Math.max(0,dt)*4);
      cameraEV=clamp(finite(cameraExposureEV),-24,24);lastDelta=storageEV-old;if(Math.abs(lastDelta)>1e-7)epochs++;initialized=true;
      return this.state;
    },
    get state(){return {storageEV,cameraEV,sceneScale:2**storageEV,outputExposureScale:.76*2**(cameraEV-storageEV),rawPerCandela:RAW_PER_CANDELA,maxRawRGB:bound,storedBound:bound*2**storageEV,safeMaximum,targetEV,storageEpoch:epochs,lastStorageDeltaEV:lastDelta,components:{...components},reference:'3.6 relative directional irradiance per100000 reference lux; effective, not measured',limits:['Source bounds must cover all participating RGB channels and worst relevant overlap.','Finite FP16 storage and final display dynamic range are different constraints.','A changed storage exposure does not change photographic exposure.']};}
  };
}
