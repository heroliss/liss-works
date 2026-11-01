// Pure source-only reparameterization of caller-certified airborne intervals.
// No simulation, surface query, renderer, current ledger or light cluster is
// mutated. The caller retains the exact old full/zero-window fast paths.
import {sampleBodyEmissionWindow} from './fireworks-physics.js';
export const CONTACT_OPTICS_SCHEMA='glass-atoll.contact-optical-subrecords.v1';
export const CONTACT_OPTICS_MAX_INTERVALS=64;
const finite=(x,name)=>{if(typeof x!=='number'||!Number.isFinite(x))throw new RangeError(name+' must be finite');return x;};
function vector(value,name,{nonnegative=false}={}){
  if(!Array.isArray(value)||value.length!==3||[0,1,2].some(c=>!Object.hasOwn(value,c)))throw new TypeError(name+' requires3 own finite components');
  return value.map(v=>{finite(v,name+' component');if(nonnegative&&v<0)throw new RangeError(name+' must be nonnegative');return v;});
}
function sync(fn,name,optional=false){if(optional&&fn===undefined)return;if(typeof fn!=='function'||fn.constructor?.name==='AsyncFunction')throw new TypeError(name+' must be a synchronous callback');}
function fraction(value,name){finite(value,name);if(value<0||value>1)throw new RangeError(name+' requires0..1');return value;}
function noPromise(value,name){if(value instanceof Promise){Promise.prototype.then.call(value,()=>{},()=>{});throw new TypeError(name+' must not return a Promise/thenable');}if(value&&typeof value.then==='function')throw new TypeError(name+' must not return a Promise/thenable');return value;}
export function buildContactOpticalRecords({p,physicalNow,globalExposure,intervals,sampleAnchorAt,stretchAt}={}){
  finite(physicalNow,'Physical now');if(!p||p.vectorEmission!==true||!p.sourceBody?.burnProfile)throw new TypeError('Contact optics requires a vector-profile source row');
  sync(sampleAnchorAt,'sampleAnchorAt');sync(stretchAt,'stretchAt',true);
  const from=finite(globalExposure?.from,'Global exposure start'),to=finite(globalExposure?.to,'Global exposure end'),S=finite(globalExposure?.durationSeconds,'Global exposure width');
  if(!(to>from&&S>0)||S!==to-from||S>1||to>physicalNow)throw new RangeError('Contact optics requires a represented positive causal global window <=1s');
  if(globalExposure.physicalNow!==undefined&&globalExposure.physicalNow!==physicalNow)throw new RangeError('Global exposure physical clock mismatch');
  if(!Array.isArray(intervals)||intervals.length>CONTACT_OPTICS_MAX_INTERVALS||Object.keys(intervals).length!==intervals.length)throw new RangeError('Contact optics requires a dense bounded interval list');
  const sourceBirth=finite(p.sourceBody.birth,'Source birth'),tail=!!p.emberBody,lag=tail?finite(p.emberLagSeconds,'Tail lag'):0,kinematicBirth=sourceBirth+lag;
  if(lag<0||!Number.isFinite(kinematicBirth))throw new RangeError('Tail lag/birth must be finite and causal');
  const share=tail?fraction(p.emberFraction,'Tail reference fraction'):fraction(p.emissionFraction,'Head reference fraction');
  let tailFactor=0,tailColour=null,baseMaximum;
  if(tail){
    const Z=finite(p.emberNormalization,'Tail normalization'),decay=fraction(p.emberDecay,'Tail decay'),I0=finite(p.sourceBody.emissionReferenceI0,'Source reference peak');if(!(Z>0)||I0<0)throw new RangeError('Tail normalization/peak must be positive/nonnegative');
    if(p.sourceBody.burnProfile.emission.knots.some(k=>k.rgb[0]*.2126+k.rgb[1]*.7152+k.rgb[2]*.0722>I0*(1+1e-12)))throw new RangeError('Tail source peak does not enclose its burn profile');
    tailColour=vector(p.emberColour,'Detached-age tail colour',{nonnegative:true});const Cmax=vector(p.emberColourMaximum,'All-phase tail colour maximum',{nonnegative:true});
    if(tailColour.some((v,c)=>v>Cmax[c]*(1+1e-12)))throw new RangeError('Tail colour exceeds its declared phase maximum');tailFactor=share/Z*decay;baseMaximum=Cmax.map(v=>v*I0*tailFactor);
  }else baseMaximum=vector(p.sourceBody.burnProfile.emission.sourceMaximumRGB,'All-phase source RGB maximum',{nonnegative:true}).map(v=>v*share);
  if(!baseMaximum.every(Number.isFinite)||!Number.isFinite(tailFactor))throw new RangeError('Contact source factors overflow finite RGB');
  let previousEnd=from;
  // Complete temporal/shape preflight before any callback or output publication.
  const plan=intervals.map((interval,index)=>{
    const a=finite(interval?.from,'Support start'),b=finite(interval?.to,'Support end'),d=b-a,mid=a+d*.5;
    if(a<from||b>to||a<previousEnd||a<kinematicBirth||!(b>a&&d>0&&mid>a&&mid<b)||mid>physicalNow)throw new RangeError('Support intervals must be ordered disjoint positive causal intervals after kinematic birth');
    if(interval.anchorClearance!==undefined&&!(finite(interval.anchorClearance,'Certified anchor clearance')>0))throw new RangeError('Support midpoint must be caller-certified airborne');
    if(interval.anchorClearanceLowerBound!==undefined&&!(finite(interval.anchorClearanceLowerBound,'Certified anchor clearance lower bound')>0))throw new RangeError('Support midpoint requires a positive certified clearance lower bound');
    const relativeFrom=a-sourceBirth-lag,relativeTo=b-sourceBirth-lag,weight=d/S;
    if(!Number.isFinite(relativeFrom)||!Number.isFinite(relativeTo)||!(relativeTo>relativeFrom)||!(weight>0&&weight<=1))throw new RangeError('Local source window/weight must remain representable');previousEnd=b;return{index,a,b,d,mid,relativeFrom,relativeTo,weight};
  });
  const output=[];
  for(const part of plan){
    const rgbTaps=new Float64Array(24);sampleBodyEmissionWindow(p.sourceBody,{fromAge:part.relativeFrom,toAge:part.relativeTo,outRGB:rgbTaps});
    if(tail)for(let i=0;i<8;i++){const j=i*3,I=(rgbTaps[j]*.2126+rgbTaps[j+1]*.7152+rgbTaps[j+2]*.0722)*tailFactor;for(let c=0;c<3;c++)rgbTaps[j+c]=I*tailColour[c]*part.weight;}
    else for(let i=0;i<24;i++)rgbTaps[i]*=share*part.weight;
    if(!rgbTaps.every(v=>Number.isFinite(v)&&v>=0))throw new RangeError('Local contact RGB must remain finite and nonnegative');if(!rgbTaps.some(v=>v>0))continue;
    const sampled=noPromise(sampleAnchorAt(part.mid),'sampleAnchorAt'),position=vector(sampled?.position,'Local anchor position'),velocity=vector(sampled?.velocity,'Local anchor velocity');
    const stretch=stretchAt?vector(noPromise(stretchAt(part.mid),'stretchAt'),'Local spatial support'):[0,0,0],rasterVelocity=velocity.map(v=>v*part.weight),maximumReferenceRGB=baseMaximum.map(v=>v*part.weight);
    if(!rasterVelocity.every(Number.isFinite)||!maximumReferenceRGB.every(Number.isFinite))throw new RangeError('Contact raster support exceeds finite domain');
    const viewExposure=Object.freeze({physicalNow,from:part.a,to:part.b,anchor:part.mid,durationSeconds:part.d,shutterSeconds:part.d,requestedShutterSeconds:globalExposure.shutterSeconds??S,mode:'causal-positive-support-subinterval',units:'physical seconds; local support width; raster global duration is separate'});
    output.push({...p,position,velocity,stretch,rgbTaps,maximumReferenceRGB,viewExposure,rasterVelocity,rasterExposureSeconds:S,virtualBirthAnchor:false,sampledTime:part.mid,
      contactSupport:Object.freeze({schema:CONTACT_OPTICS_SCHEMA,intervalIndex:part.index,inputIntervals:plan.length,globalFrom:from,globalTo:to,globalDurationSeconds:S,kinematicBirth,temporalWeight:part.weight,anchorPolicy:'strict midpoint inside caller-certified positive airborne interval',stretchPolicy:stretchAt?'caller sampled at the same local midpoint; existing current-N spatial-kernel approximation retained':'explicit zero-stretch fallback; no current/future neighbour reuse',spatialClipping:false}),
      viewTemporalModel:'local airborne reference-RGB bins times local/global duration; first-order local motion reparameterized onto unchanged global shader shutter; no T(t)/camera/receiver integration'});
  }
  return output;
}
