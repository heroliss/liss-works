import {FIREWORK_TYPES,EMISSION_PROFILES,createFireworksSimulation,sampleFireworkEvent,sampleBody,bodyEmissionEnvelope,sampleBodyEmission,sampleBodyEmissionWindow,clamp} from './fireworks-physics.js';
import {resolveFireworkExposure,sampleCausalOpticalAnchor} from './firework-exposure-window.js';
import {sampleTrailColour} from './firework-trail-profile.js';
import {withWindResponseMemo} from './wind-response.js';
import {createTailReleaseFieldNode,sampleTailReleaseFieldNode} from './firework-tail-field.js';
import {createFireworkContactSupport} from './firework-contact-support.js';
import {buildContactOpticalRecords} from './firework-contact-optics.js';
import {validatePoweredOpticalShutter,partitionPoweredOpticalIntervals} from './firework-powered-optics.js';
import {getFireworkShowEnvelope,getScaledFireworkLiveEnvelope} from './firework-show-envelope.js';
import {sampleComplexStyle,sampleComplexTailStyle} from './complex-fireworks-style.js';
import {isComplexFirework} from './complex-fireworks.js';
import {createReceiverLightClusterBuilder} from './firework-receiver-lighting.js';
// A charge flash primarily illuminates its surroundings. Its tiny visible
// core is a separate authored camera representation; the light ledger is full.
export const OPTICAL_FLASH_CORE_VISIBILITY=.0025;
// Closely packed display heads and their young tails can form a white disk
// before their trajectories separate. Keep their full physical light and
// reveal only the camera image smoothly as the burst expands; continuous
// sweeps and waterfall threads do not use this view-only gate.
const BURST_HEAD_VIEW_PARTS=new Set(['outer-sphere','inner-sphere','ring','heart','flower','ring-plane','heart-plane','flower-plane','helix-canopy','double-helix-stars','radial-sphere','rotating-motor','outer-pearls','subshell-carrier','subshell-star','brocade-crown']);
function burstHeadViewVisibility(age){
  const u=Math.max(0,Math.min(1,(age-.08)/.22)),smooth=u*u*(3-2*u);
  return .0001+.9999*smooth*smooth*smooth;
}
const RADIANT_PROFILE_ID='three-heart-radiant120-v1';
export const FIREWORK_RENDER_CAPACITY_LIMITS=Object.freeze({initialRows:14000,opticalRows:262144,ledgerRows:131072});
function nextFireworkRowCapacity(current,required,maximum,label){
  if(!Number.isSafeInteger(required)||required<0||required>maximum)throw new RangeError(label+' capacity exceeded; no luminous source truncated');
  let next=current;while(next<required)next=Math.min(maximum,next*2);return next;
}
const motionDescriptor=body=>body.thrustProfile?Object.freeze({schema:body.thrustProfile.schema,id:body.thrustProfile.id,motorEndAge:body.thrustProfile.motorEndAge,forceKnotAges:Object.freeze([0,...body.thrustProfile.cells.map(cell=>cell.toAge)])}):null;

// Explicit greybody photometry candidate, separate from the renderer's Gaussian
// source radius. The effective emitting area is authored, not measured fuel/flame.
export const THERMAL_GREYBODY_PROFILE=Object.freeze({schema:'glass-atoll.thermal-greybody-photometry.v1',temperatureKelvin:2850,emissivity:1,referenceAreaCandela:4,wavelengthStepNm:1,wavelengthRangeNm:Object.freeze([360,830]),effectiveEmittingRadiusMmRange:Object.freeze([1,3]),defaultEffectiveEmittingRadiusMm:2,model:'Lambertian spherical greybody projected area pi*r^2; Planck SI radiance weighted by the existing analytic CIE1931 Y fit',limits:'Authored effective emitting area and colour-temperature proxy; not measured firework candela, gas emissivity, fuel, heat transfer or radiated-energy calibration.'});
let thermalGreybodyLuminance;
export function thermalGreybodyCandela(effectiveEmittingRadiusMm=2){
  if(typeof effectiveEmittingRadiusMm!=='number'||!Number.isFinite(effectiveEmittingRadiusMm)||effectiveEmittingRadiusMm<1||effectiveEmittingRadiusMm>3)throw new RangeError('Thermal effective emitting radius requires finite1..3mm');
  if(thermalGreybodyLuminance===undefined){
    const h=6.62607015e-34,c=299792458,k=1.380649e-23,T=THERMAL_GREYBODY_PROFILE.temperatureKelvin;let integral=0;
    for(let w=360;w<=830;w++){const l=w*1e-9,B=2*h*c*c/(l**5*Math.expm1(h*c/(l*k*T))),G=(mean,left,right)=>Math.exp(-.5*((w-mean)*(w<mean?left:right))**2),Y=.821*G(568.8,.0213,.0247)+.286*G(530.9,.0613,.0322);integral+=683*B*Y*1e-9;}
    thermalGreybodyLuminance=integral;
  }
  return thermalGreybodyLuminance*Math.PI*(effectiveEmittingRadiusMm*1e-3)**2;
}

// Authored detached-ember chromaticity experiment at fixed photopic Y. This is
// not a fuel/radiant-power/heat-transfer solve; head colour and intensity law stay.
export const THERMAL_TAIL_COLOUR_PROFILE=Object.freeze({schema:'glass-atoll.thermal-tail-colour.v1',hotKelvin:2850,coldKelvin:1900,samples:129,wavelengthStepNm:5,age:'detached ember lag / existing tail duration',luminance:'linear sRGB photopic Y=1; reference candela unchanged',limits:'authored colour curve, not measured particle temperatures, spectral emissivity or combustion/heat transfer'});
let thermalTailColourTable;
function thermalColourAtKelvin(temperature){
  const xyz=[0,0,0],e=(w,a,b,c)=>Math.exp(-.5*((w-a)*(w<a?b:c))**2);
  for(let w=380;w<=780;w+=5){const l=w*1e-9,s=1/(l**5*Math.expm1(.01438776877/(l*temperature)))*1e-29;
    const cmf=[.362*e(w,442,.0624,.0374)+1.056*e(w,599.8,.0264,.0323)-.065*e(w,501.1,.049,.0382),.821*e(w,568.8,.0213,.0247)+.286*e(w,530.9,.0613,.0322),1.217*e(w,437,.0845,.0278)+.681*e(w,459,.0385,.0725)];
    for(let c=0;c<3;c++)xyz[c]+=s*cmf[c]*5;
  }
  let rgb=[3.24096994*xyz[0]-1.53738318*xyz[1]-.49861076*xyz[2],-.96924364*xyz[0]+1.8759675*xyz[1]+.04155506*xyz[2],.05563008*xyz[0]-.20397696*xyz[1]+1.05697151*xyz[2]];
  const neutral=Math.max(0,-Math.min(...rgb));rgb=rgb.map(v=>v+neutral);const Y=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  return Object.freeze(rgb.map(v=>v/Y));
}
export function thermalTailColour(lag,duration){
  if(!Number.isFinite(lag)||!Number.isFinite(duration)||duration<=0||lag<0||lag>duration)throw new RangeError('Detached thermal tail requires finite lag in [0,duration] and positive duration');
  if(lag===0)return EMISSION_PROFILES.thermal;
  if(!thermalTailColourTable)thermalTailColourTable=Object.freeze(Array.from({length:THERMAL_TAIL_COLOUR_PROFILE.samples},(_,i)=>i===0?EMISSION_PROFILES.thermal:thermalColourAtKelvin(2850-950*i/(THERMAL_TAIL_COLOUR_PROFILE.samples-1))));
  const x=lag/duration*(thermalTailColourTable.length-1),i=Math.min(thermalTailColourTable.length-2,Math.floor(x)),f=x-i,a=thermalTailColourTable[i],b=thermalTailColourTable[i+1];
  return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f];
}

// Optional logical metadata builder; only describeCombustion invokes it.
export function describeFireworkCombustion(event){
  const frozen=Object.freeze;
  const finite=(value,name)=>{if(!Number.isFinite(value))throw new RangeError('Combustion metadata requires finite '+name);return value;};
  const unknownMatter=category=>frozen({matterWeightCategory:category,relativeWeight:null,weightStatus:'unknown',fuel:'unknown',smokeYield:'unknown',absoluteMassKg:null});
  if(!event||typeof event.id!=='string'||!event.id||!Array.isArray(event.heads)||!Array.isArray(event.events))throw new TypeError('An active physical firework event is required');
  const id=event.id,ground=!!event.definition?.ground,prefix=id+'/combustion',nodes=[],edges=[],bySource=new Map(),byBody=new Map();
  const launchTime=finite(event.time,'launch time'),burstTime=finite(event.burstTime,'burst time'),endTime=finite(event.endTime,'event end');
  function append({sourceID,parentSourceID=null,edgeKind=null,...data}){
    if(bySource.has(sourceID))throw new RangeError('Combustion source IDs must be unique');
    const parent=parentSourceID===null?null:bySource.get(parentSourceID);
    if(parentSourceID!==null&&!parent)throw new RangeError('Combustion ancestry must be topologically ordered');
    const birth=finite(data.birth,'birth'),life=finite(data.life,'life');if(life<0||!Number.isFinite(birth+life))throw new RangeError('Combustion lifetime is invalid');
    if(parent&&birth<parent.birth)throw new RangeError('Combustion child predates its parent');
    const node=frozen({sourceID,eventId:id,parentSourceID,ancestry:frozen(parent?[...parent.ancestry,parent.sourceID]:[]),...data,birth,life,endTime:birth+life});
    nodes.push(node);bySource.set(sourceID,node);if(parent)edges.push(frozen({from:parent.sourceID,to:sourceID,kind:edgeKind}));return node;
  }
  const lifts=event.events.filter(e=>e.kind==='launch').map((e,i)=>append({sourceID:prefix+'/lift/'+i,role:'lift',birth:e.time,life:0,lifetimeMeaning:'instant-trigger-only; physical charge burn duration unknown',bodyId:null,parentBodyId:null,familyID:prefix+'/lift/'+i,sourceEventKind:'launch',sourceEventSeed:e.seed,combustion:'charge-trigger; yield unknown',matter:unknownMatter('lift-charge-yield-unknown')}));
  if(!lifts.length)throw new RangeError('Combustion event has no launch trigger');
  let ignition;
  if(!ground){
    if(!event.rocket)throw new RangeError('Aerial combustion metadata requires its mortar carrier');
    const carrier=append({sourceID:prefix+'/carrier',parentSourceID:lifts[0].sourceID,edgeKind:'launches-carrier',role:'mortar-carrier',birth:event.rocket.birth,life:event.rocket.life,lifetimeMeaning:'kinematic-flight-only; not engine burn duration',bodyId:null,parentBodyId:null,familyID:prefix+'/carrier',combustion:'not-established; no engine/fuel material metadata; authored through-burst-v1 attached ascent-light proxy; ballistic carrier has no sustained propulsion',matter:unknownMatter('carrier-not-an-engine-source')});
    const bursts=event.events.filter(e=>e.kind==='burst');if(bursts.length!==1)throw new RangeError('Aerial combustion metadata requires one burst trigger');
    ignition=append({sourceID:prefix+'/burst',parentSourceID:carrier.sourceID,edgeKind:'reaches-burst-trigger',role:'burst',birth:bursts[0].time,life:0,lifetimeMeaning:'instant-trigger-only; physical charge burn duration unknown',bodyId:null,parentBodyId:null,familyID:prefix+'/burst',sourceEventKind:'burst',sourceEventSeed:bursts[0].seed,combustion:'charge-trigger; yield unknown',matter:unknownMatter('burst-charge-yield-unknown')});
  }
  for(const body of event.heads){
    if(!Number.isSafeInteger(body.id)||body.id<0||byBody.has(body.id))throw new RangeError('Combustion body IDs must be unique nonnegative integers');
    const parent=body.parentBody?byBody.get(body.parentBody.id):null;
    if(body.parentBody&&(!parent||body.parent!==body.parentBody.id))throw new RangeError('Combustion split parent is missing or inconsistent');
    const trigger=parent||ignition||((event.type==='fan'||event.type==='display-vfan')?lifts.find(n=>n.birth===body.birth):lifts[0]);
    if(!trigger)throw new RangeError('Ground combustion body has no matching launch trigger');
    const sourceID=prefix+'/body/'+body.id,role=ground?'ground-comet':parent?'aerial-child':'aerial-root';
    const node=append({sourceID,parentSourceID:trigger.sourceID,edgeKind:parent?'split-child':'ignites-body',role,bodyId:body.id,parentBodyId:body.parentBody?.id??null,...(body.patternPart==='waterfall-ember'?{parentVelocityFraction:body.parentVelocityFraction}:{}),birth:body.birth,life:body.life,lifetimeMeaning:'authored physical body burn life; independent of image/strobe/trail samples',familyID:parent?parent.familyID:prefix+'/family/'+body.id,patternPart:body.patternPart??null,...(body.thrustProfile?{motionProfile:motionDescriptor(body)}:{}),...(body.burnProfile?{effectProfile:body.effectProfile,layerId:body.layerId,ignitionDelay:body.ignitionDelay,burnProfileId:body.burnProfile.id,...(body.trailProfile?{trailRecipeId:body.trailProfile.recipeId,trailDurationSeconds:body.trailProfile.durationSeconds,headIntensityFraction:body.trailProfile.headIntensityFraction,tailIntensityFraction:body.trailProfile.referenceIntensityFraction}:{}),materialTimeProfile:body.thrustProfile?'uniform-per-life material; force-knot quadrature at common cell end':'descriptor available; existing smoke source scheduler unchanged'}:{}),...(body.effectProfile===RADIANT_PROFILE_ID?{radianceProfile:body.radianceProfile,nativeReferenceI0:body.intensity,derivedReferenceI0:body.emissionReferenceI0,referenceIntensityBasis:'derived emissionReferenceI0; authored gain applied once in immutable burn profile'}:{}),combustion:'declared-burning-body',matter:unknownMatter(parent?'inherited-family-share-unknown':body.split?'split-parent-family-share-unknown':ground?'ground-comet-share-unknown':'aerial-root-share-unknown')});
    byBody.set(body.id,node);
  }
  const roles=frozen(Object.fromEntries(['lift','mortar-carrier','burst','aerial-root','aerial-child','ground-comet'].map(role=>[role,nodes.filter(n=>n.role===role).length])));
  return frozen({schema:'glass-atoll.combustion-metadata.v1',id,type:event.type,seed:event.seed,...(event.effectProfile===RADIANT_PROFILE_ID?{effectProfile:event.effectProfile,radianceProfile:event.layerProfile.radianceProfile,nativeReferencePeakBudget:event.layerProfile.nativeReferencePeakBudget,referencePeakBudget:event.layerProfile.referencePeakBudget}:{}),ground,launchTime,burstTime,endTime,nodes:frozen(nodes),edges:frozen(edges),counts:frozen({nodes:nodes.length,edges:edges.length,bodies:byBody.size,roles}),sourcePolicy:'Physical logical bodies and charge triggers only; tails/shutter/mirror are not additional matter sources',positionPolicy:'Metadata may name future births; no world position, velocity, or future wind is provided. Existing causal provider.sample remains unchanged.',matterPolicy:'All fuel/yield/weights unknown; no absolute kg or smoke budget assigned; split family labels do not allocate parent/child material'});
}

const rgbArray=v=>Array.isArray(v)?v:v?.toArray?v.toArray():[0,0,0];

// The renderer has two inexpensive diffuse proxies for many complete shows.
// Merge nearest proxies instead of dropping the additional shows.
// Full resolved source rows remain separate in getEmissionLedger().
export function reduceFireworkLightClusters(input,maximum=2){
  if(!Number.isInteger(maximum)||maximum<1||maximum>4)throw new RangeError('Cluster limit requires1..4');
  if(input.length<=maximum)return input;
  const out=input.slice();
  while(out.length>maximum){
    let ai=0,bi=1,best=Infinity;
    for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){const d=out[i].position.reduce((s,v,c)=>s+(v-out[j].position[c])**2,0);if(d<best){best=d;ai=i;bi=j;}}
    const a=out[ai],b=out[bi],I=a.referenceCandela+b.referenceCandela,position=a.position.map((v,c)=>(v*a.referenceCandela+b.position[c]*b.referenceCandela)/I),colour=a.color.map((v,c)=>(v*a.referenceCandela+b.color[c]*b.referenceCandela)/I),distance=l=>Math.hypot(...l.position.map((v,c)=>v-position[c])),radius=Math.max(2,distance(a)+(a.maxExtent??a.radius),distance(b)+(b.maxExtent??b.radius)),ids=[...(a.mergedEventIds??[a.eventId]),...(b.mergedEventIds??[b.eventId])];
    const merged={...a,position,color:colour,colour,referenceCandela:I,intensity:I,radius,maxExtent:radius,eventId:'merged:'+JSON.stringify(ids),mergedEventIds:ids,illuminationModel:'conservative extent proxy; complete I/RGB sum, not resolved multi-emitter illumination'};
    out.splice(bi,1);out[ai]=merged;
  }
  return out;
}

// CPU budget for the actual camera-facing, pixel-integrated Gaussian shader.
// A spherical I/(pi*r*r) reference is NOT its off-axis radiance ceiling: the
// shader's sigma uses view depth while its pixel solid angle uses ray angle.
// This helper is also exercised against the real GPU shader by owned fixtures.
const boundZero=[0,0,0];
const FIRELIGHT_AA_MARGIN_PIXELS=.25;
function resolveFirelightSigma(value=.28){if(!Number.isFinite(value)||value<.28||value>.6)throw new RangeError('firelightSigmaPixels requires.28...6');return Math.fround(value);}
function firelightHeadAA(p,c){const s=p.stretch;return c.firelightSigmaPixels>Math.fround(.28)&&p.kind!=='smoke'&&!p.vectorEmission&&Math.fround(p.radius)!==Math.fround(.0018)&&(!s||Math.fround(s[0])===0&&Math.fround(s[1])===0&&Math.fround(s[2])===0);}
const maximumRGB=rgb=>rgb.length===3?Math.max(rgb[0],rgb[1],rgb[2]):Math.max(...rgb);
// The actual quad expands only clip.xy, so its four vertices share centre z/w.
// Budget rejection uses the same Float32 centre and combined P*V upload. A
// gamma7 dot-product interval retains the old bound at uncertain clip edges.
const fireworkClipGamma7=(7*2**-24)/(1-7*2**-24),fireworkClipFTZ=8*2**-126,fireworkClipMax=3.4028234663852886e38/8;
function prepareFireworkDepthClip(c){
  const M=c.gpuClipVP||(c.gpuClipVP=new Float32Array(16)),P=c.P,V=c.V;let finite=true;
  for(let col=0;col<4;col++)for(let row=0;row<4;row++){const i=col*4;M[i+row]=P[row]*V[i]+P[row+4]*V[i+1]+P[row+8]*V[i+2]+P[row+12]*V[i+3];finite&&=Number.isFinite(M[i+row]);}
  c.gpuClipFinite=finite;
}
function fireworkCentreDepthClipped(position,c){
  if(!c.gpuClipFinite)return false;const M=c.gpuClipVP,x=Math.fround(position[0]),y=Math.fround(position[1]),z=Math.fround(position[2]);
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))return false;
  const za=M[2]*x,zb=M[6]*y,zc=M[10]*z,zd=M[14],wa=M[3]*x,wb=M[7]*y,wc=M[11]*z,wd=M[15],Z=za+zb+zc+zd,W=wa+wb+wc+wd,az=Math.abs(za)+Math.abs(zb)+Math.abs(zc)+Math.abs(zd),aw=Math.abs(wa)+Math.abs(wb)+Math.abs(wc)+Math.abs(wd);
  // Extreme public/world inputs could overflow an actual Float32 multiply;
  // retain the original budget instead of reasoning from finite binary64.
  if(az>fireworkClipMax||aw>fireworkClipMax)return false;
  const ez=fireworkClipGamma7*az+fireworkClipFTZ,ew=fireworkClipGamma7*aw+fireworkClipFTZ;
  return W+ew<=Math.fround(.01)||Z-ez>W+ew||(Z+ez)+(W+ew)<0;
}
// Conservative source-upload rejection, before the expensive smoke ray query.
// Use actual Float32 attribute/uniform inputs and outward highp arithmetic
// intervals. Uncertain/overflowing calculations retain the source. This only
// rejects complete camera-facing quads; logical records/emission remain intact.
const fireworkIntervalUnit=8*2**-24/(1-8*2**-24),fireworkIntervalTiny=8*2**-126;
function createFireworkClipIntervals(c){
  const data=new Float64Array(2048);let top=0;
  const store=(lo,hi,round=true)=>{const i=top;top+=2;if(top>data.length)throw new Error('Firework interval scratch exhausted');const error=round?Math.max(Math.abs(lo),Math.abs(hi))*fireworkIntervalUnit+fireworkIntervalTiny:0;data[i]=lo-error;data[i+1]=hi+error;return i;};
  const constant=v=>{const x=Math.fround(v);return store(x,x,false);};
  const add=(a,b)=>store(data[a]+data[b],data[a+1]+data[b+1]);
  const sub=(a,b)=>store(data[a]-data[b+1],data[a+1]-data[b]);
  const mul=(a,b)=>{const p=data[a]*data[b],q=data[a]*data[b+1],r=data[a+1]*data[b],s=data[a+1]*data[b+1];return store(Math.min(p,q,r,s),Math.max(p,q,r,s));};
  const div=(a,b)=>{if(data[b]<=0&&data[b+1]>=0)return store(-Infinity,Infinity,false);const p=data[a]/data[b],q=data[a]/data[b+1],r=data[a+1]/data[b],s=data[a+1]/data[b+1];return store(Math.min(p,q,r,s),Math.max(p,q,r,s));};
  const abs=a=>store(data[a]<=0&&data[a+1]>=0?0:Math.min(Math.abs(data[a]),Math.abs(data[a+1])),Math.max(Math.abs(data[a]),Math.abs(data[a+1])),false);
  const max=(a,b)=>store(Math.max(data[a],data[b]),Math.max(data[a+1],data[b+1]),false);
  const sqrt=a=>store(Math.sqrt(Math.max(0,data[a])),Math.sqrt(Math.max(0,data[a+1])));
  const dot=(x,y,z,row)=>{
    const M=c.gpuClipVP,a=M[row]*data[x],b=M[row]*data[x+1],d=M[4+row]*data[y],e=M[4+row]*data[y+1],f=M[8+row]*data[z],g=M[8+row]*data[z+1],h=M[12+row];
    const lo=Math.min(a,b)+Math.min(d,e)+Math.min(f,g)+h,hi=Math.max(a,b)+Math.max(d,e)+Math.max(f,g)+h,absolute=Math.max(Math.abs(a),Math.abs(b))+Math.max(Math.abs(d),Math.abs(e))+Math.max(Math.abs(f),Math.abs(g))+Math.abs(h);
    if(absolute>fireworkClipMax)return store(-Infinity,Infinity,false);
    const error=absolute*fireworkClipGamma7+fireworkClipFTZ;return store(lo-error,hi+error,false);
  };
  return{data,reset(){top=0;},mark(){return top;},rewind(mark){top=mark;},constant,add,sub,mul,div,abs,max,sqrt,dot,store};
}
function fireworkSourceClipReason(p,c){
  if(fireworkCentreDepthClipped(p.position,c))return 1;
  if(!c.gpuClipFinite)return 3;
  const M=c.gpuClipVP,x=Math.fround(p.position[0]),y=Math.fround(p.position[1]),z=Math.fround(p.position[2]);
  if(!Number.isFinite(x+y+z))return 3;
  const centre=c.clipCentre||(c.clipCentre=new Float64Array(6));
  for(let k=0;k<3;k++){
    const row=k===2?3:k,a=M[row]*x,b=M[4+row]*y,d=M[8+row]*z,e=M[12+row],value=a+b+d+e,absolute=Math.abs(a)+Math.abs(b)+Math.abs(d)+Math.abs(e);
    if(absolute>fireworkClipMax)return 3;const error=absolute*fireworkClipGamma7+fireworkClipFTZ;centre[k*2]=value-error;centre[k*2+1]=value+error;
  }
  // A centre inside both side planes cannot be rejected by a positive extent.
  const wLow=centre[4],wHigh=centre[5];if(wLow<=.01)return 3;
  if(centre[0]>=-wLow&&centre[1]<=wLow&&centre[2]>=-wLow&&centre[3]<=wLow)return 0;
  const I=c.clipIntervals||(c.clipIntervals=createFireworkClipIntervals(c)),D=I.data;
  I.reset();const C=I.constant,A=I.add,S=I.sub,B=I.mul,Q=I.div,F=I.abs,H=I.max,R=I.sqrt;
  const X=C(x),Y=C(y),Z=C(z),W=I.store(wLow,wHigh,false),depth=H(W,C(.001));
  const half=C(.5),two=C(2),width=C(c.w),height=C(c.h),one=C(1),thousand=C(1000);
  const focal=C(c.focal),focus=H(A(focal,one),B(C(c.focusMetres),thousand));
  const pixelScale=Q(B(B(F(C(c.P[5])),height),half),depth),worldSigma=B(B(C(p.radius),pixelScale),C(.70710678));
  let coc=C(0);
  if(c.dof){
    const s=B(depth,thousand),numerator=B(B(focal,focal),S(s,focus)),denominator=B(B(C(c.aperture),H(s,A(focal,one))),S(focus,focal));
    coc=B(B(Q(F(Q(numerator,denominator)),C(c.sensor)),height),half);
  }
  let sigma2=A(A(C(.0784),B(worldSigma,worldSigma)),B(B(coc,coc),C(.25)));
  let firelightMargin=C(0);if(firelightHeadAA(p,c)){const floor=B(C(c.firelightSigmaPixels),C(c.firelightSigmaPixels));if(D[sigma2]<D[floor+1])firelightMargin=C(FIRELIGHT_AA_MARGIN_PIXELS);sigma2=H(sigma2,floor);}
  const velocity=p.rasterVelocity??p.velocity??boundZero,stretch=p.stretch||boundZero,shutterHalf=B(C(p.vectorEmission?p.rasterExposureSeconds??p.viewExposure?.durationSeconds??c.shutter:c.legacyShutter??c.shutter),half);
  function project(px,py,pz){const denominator=H(I.dot(px,py,pz,3),C(1e-5));return[ B(B(Q(I.dot(px,py,pz,0),denominator),width),half),B(B(Q(I.dot(px,py,pz,1),denominator),height),half) ];}
  function segment(vector,scale){
    const dx=B(C(vector[0]),scale),dy=B(C(vector[1]),scale),dz=B(C(vector[2]),scale);
    const a=project(A(X,dx),A(Y,dy),A(Z,dz)),b=project(S(X,dx),S(Y,dy),S(Z,dz));return[S(a[0],b[0]),S(a[1],b[1])];
  }
  const shutter=segment(velocity,shutterHalf),trail=stretch.some(v=>v!==0),motion=trail?segment(stretch,half):shutter;
  // Include BOTH branches at the1px shutter threshold. This deliberately
  // overestimates wide trails rather than predicting the GPU branch/rounding.
  if(trail)sigma2=A(sigma2,Q(A(B(shutter[0],shutter[0]),B(shutter[1],shutter[1])),C(24)));
  const spread=B(C(3.65),R(sigma2));
  const extent=(axis)=>{const old=A(A(A(spread,B(H(F(motion[axis]),F(shutter[axis])),half)),B(F(shutter[axis]),half)),C(1.65));return D[firelightMargin]>0?A(old,firelightMargin):old;};
  const ex=Q(B(B(extent(0),two),F(W)),width),ey=Q(B(B(extent(1),two),F(W)),height);
  for(let axis=0;axis<2;axis++){
    const delta=D[(axis===0?ex:ey)+1],lo=centre[axis*2],hi=centre[axis*2+1];
    const error=(Math.max(Math.abs(lo),Math.abs(hi))+delta)*fireworkIntervalUnit+fireworkIntervalTiny;
    if(Number.isFinite(delta+error)&&(lo-delta-error>wHigh||hi+delta+error<-wHigh))return 2;
  }
  return 3;
}
function classifyFireworkSourceVisibility(p,camera,optics={}){
  camera.updateMatrixWorld();const c=prepareSourceProjection(camera,optics,3.6e-5);prepareFireworkDepthClip(c);const reason=fireworkSourceClipReason(p,c);
  return{clipped:reason===1||reason===2,reason:['centre-inside','homogeneous-depth','complete-quad-outside','conservative-retain'][reason]};
}
// Near-plane endpoint fallback can enclose the screen although every actual
// legacy quadrature tap is far outside it. Keep outward Float32 intervals for
// those taps; beyond 16 sigma the shader's erf approximation has saturated.
// This tightens only the storage budget, never the submitted source records.
function fireworkKernelOutsideViewport(p,c,adaptive=false){
  const exposure=p.vectorEmission?p.rasterExposureSeconds??p.viewExposure?.durationSeconds??c.shutter:c.legacyShutter??c.shutter;
  if(!c.gpuClipFinite||![...p.position,...(p.rasterVelocity??p.velocity??boundZero),...(p.stretch??boundZero),p.radius,exposure,c.w,c.h,c.focal,c.focusMetres,c.aperture,c.sensor,c.firelightSigmaPixels].every(Number.isFinite))return false;
  if(p.radius<0||c.w<=0||c.h<=0||c.aperture<=0||c.sensor<=0)return false;
  const I=c.kernelIntervals||(c.kernelIntervals=createFireworkClipIntervals(c)),D=I.data;
  I.reset();const C=I.constant,A=I.add,S=I.sub,B=I.mul,Q=I.div,F=I.abs,H=I.max,R=I.sqrt;
  const X=C(p.position[0]),Y=C(p.position[1]),Z=C(p.position[2]),half=C(.5),one=C(1),width=C(c.w),height=C(c.h);
  function project(x,y,z){const w=H(I.dot(x,y,z,3),C(1e-5));return[B(B(Q(I.dot(x,y,z,0),w),width),half),B(B(Q(I.dot(x,y,z,1),w),height),half)];}
  const centre=project(X,Y,Z),depth=H(I.dot(X,Y,Z,3),C(.001));
  const pixelScale=Q(B(B(F(C(c.P[5])),height),half),depth),worldSigma=B(B(C(p.radius),pixelScale),C(.70710678));
  let sigma2=A(C(.0784),B(worldSigma,worldSigma));
  if(c.dof){const focal=C(c.focal),focus=H(A(focal,one),B(C(c.focusMetres),C(1000))),s=B(depth,C(1000));
    const coc=B(B(Q(F(Q(B(B(focal,focal),S(s,focus)),B(B(C(c.aperture),H(s,A(focal,one))),S(focus,focal)))),C(c.sensor)),height),half);sigma2=A(sigma2,B(B(coc,coc),C(.25)));}
  if(firelightHeadAA(p,c))sigma2=H(sigma2,C(c.firelightSigmaPixels*c.firelightSigmaPixels));
  function segment(v,scale){const dx=B(C(v[0]),scale),dy=B(C(v[1]),scale),dz=B(C(v[2]),scale),a=project(A(X,dx),A(Y,dy),A(Z,dz)),b=project(S(X,dx),S(Y,dy),S(Z,dz));return[S(a[0],b[0]),S(a[1],b[1])];}
  const shutter=segment(p.rasterVelocity??p.velocity??boundZero,B(C(exposure),half)),stretch=p.stretch??boundZero;
  const sx=C(stretch[0]),sy=C(stretch[1]),sz=C(stretch[2]),stretch2=A(A(B(sx,sx),B(sy,sy)),B(sz,sz));
  const threshold=C(1e-12);
  if(D[stretch2]<=D[threshold]&&D[stretch2+1]>D[threshold])return false;
  const trail=D[stretch2]>D[threshold];
  const motion=trail?segment(stretch,half):shutter,shutter2=A(B(shutter[0],shutter[0]),B(shutter[1],shutter[1]));
  if(trail&&!p.vectorEmission&&D[shutter2]<=1){const upper=Math.min(1,Math.max(0,D[shutter2+1]));sigma2=A(sigma2,C(upper/24));}
  if(adaptive){
    // Very long projected trails exceed the shader's adaptive index limit and
    // use its legacy eight taps. Prove that fallback with interval lower/upper
    // bounds; ordinary adaptive trails and all uncertain cases keep the budget.
    if(!trail)return false;
    const length=R(A(B(motion[0],motion[0]),B(motion[1],motion[1]))),sigma=R(sigma2);
    const index=Q(length,B(half,H(one,sigma)));
    if(!(D[index]>65536))return false;
  }
  const support=A(B(C(16),R(sigma2)),C(2));
  // Legacy vOffset interpolation and quad raster snapping need an additional
  // allowance. Keep 0.01% of the complete projected coordinate magnitude, well
  // beyond Float32 rounding, as well as the explicit two-pixel margin.
  const magnitude=Math.max(...[...centre,...motion,...shutter].flatMap(v=>[Math.abs(D[v]),Math.abs(D[v+1])]));
  const maxSupport=D[support+1]+magnitude*.0001;if(!Number.isFinite(maxSupport))return false;
  const temporal=trail?(p.vectorEmission?Array.from({length:8},(_,i)=>(i+.5)/8-.5):[0,-.38729833462,.38729833462]):[0];
  // Accumulate taps in short-lived scratch blocks to bound the interval stack.
  const fixedTop=I.mark();
  for(let j=0;j<8;j++)for(const t of temporal){
    I.rewind(fixedTop);
    const u=(j+.5)/8-.5;
    const tap=[A(A(centre[0],B(motion[0],C(u))),B(shutter[0],C(t))),A(A(centre[1],B(motion[1],C(u))),B(shutter[1],C(t)))];
    if(!tap.every(v=>Number.isFinite(D[v])&&Number.isFinite(D[v+1])))return false;
    if(!(D[tap[0]+1]+maxSupport<-c.w*.5||D[tap[0]]-maxSupport>c.w*.5||D[tap[1]+1]+maxSupport<-c.h*.5||D[tap[1]]-maxSupport>c.h*.5))return false;
  }
  return true;
}
export function classifyFireworkKernelViewport(p,camera,optics={}){
  camera.updateMatrixWorld();const c=prepareSourceProjection(camera,optics,3.6e-5);prepareFireworkDepthClip(c);
  return {outside:fireworkKernelOutsideViewport(p,c,optics.trailIntegration==='adaptive'),scope:'legacy8 or proven adaptive-index fallback saturated Gaussian taps; storage-budget diagnostic'};
}
// A perspective endpoint difference re-centred on project(centre) can cross
// the image even when the complete physical source sweep is far outside it.
// Reject that source domain before uploading the misleading screen streak.
// The convex swept box includes the whole spatial segment and shutter; a
// common homogeneous side plane plus a Gaussian/DOF margin proves exclusion.
function fireworkSweepOutsideViewport(p,c){
  const exposure=p.vectorEmission?p.rasterExposureSeconds??p.viewExposure?.durationSeconds??c.shutter:c.legacyShutter??c.shutter;
  if(p.kind==='smoke'||!c.gpuClipFinite||![...p.position,...(p.rasterVelocity??p.velocity??boundZero),...(p.stretch??boundZero),p.radius,exposure,c.w,c.h,c.focal,c.focusMetres,c.aperture,c.sensor,c.firelightSigmaPixels].every(Number.isFinite))return false;
  if(p.radius<0||c.w<=0||c.h<=0||c.aperture<=0||c.sensor<=0)return false;
  const I=c.sweepIntervals||(c.sweepIntervals=createFireworkClipIntervals(c)),D=I.data;I.reset();
  const C=I.constant,A=I.add,S=I.sub,B=I.mul,Q=I.div,F=I.abs,H=I.max,R=I.sqrt;
  const zero=C(0),half=C(.5),one=C(1),X=p.position.map(C),V=(p.rasterVelocity??p.velocity??boundZero).map(C),T=(p.stretch??boundZero).map(C);
  const t2=A(A(B(T[0],T[0]),B(T[1],T[1])),B(T[2],T[2])),threshold=C(1e-12);
  if(D[t2]<=D[threshold]&&D[t2+1]>D[threshold])return false;
  const trail=D[t2]>D[threshold],shutterHalf=B(C(exposure),half),mins=[Infinity,Infinity,Infinity,Infinity];
  let wMin=Infinity,wMax=-Infinity,maxAbsW=0;const fixed=I.mark();
  for(const spatial of [-1,1])for(const temporal of [-1,1]){
    I.rewind(fixed);
    const point=X.map((x,j)=>A(A(x,trail?B(T[j],C(spatial*.5)):zero),B(V[j],B(shutterHalf,C(temporal)))));
    const x=I.dot(...point,0),y=I.dot(...point,1),w=I.dot(...point,3);
    const planes=[S(x,w),S(zero,A(x,w)),S(y,w),S(zero,A(y,w))];
    if(!planes.every(v=>Number.isFinite(D[v])&&Number.isFinite(D[v+1]))||!Number.isFinite(D[w]+D[w+1]))return false;
    planes.forEach((v,j)=>{mins[j]=Math.min(mins[j],D[v]);});wMin=Math.min(wMin,D[w]);wMax=Math.max(wMax,D[w+1]);maxAbsW=Math.max(maxAbsW,Math.abs(D[w]),Math.abs(D[w+1]));
  }
  I.rewind(fixed);const depth=H(I.store(wMin,wMax,false),C(.001)),height=C(c.h),width=C(c.w),focal=C(c.focal),focus=H(A(focal,one),B(C(c.focusMetres),C(1000)));
  const pixelScale=Q(B(B(F(C(c.P[5])),height),half),depth),worldSigma=B(B(C(p.radius),pixelScale),C(.70710678));
  let sigma2=A(C(.0784+1/24),B(worldSigma,worldSigma));
  if(c.dof){const s=B(depth,C(1000)),coc=B(B(Q(F(Q(B(B(focal,focal),S(s,focus)),B(B(C(c.aperture),H(s,A(focal,one))),S(focus,focal)))),C(c.sensor)),height),half);sigma2=A(sigma2,B(B(coc,coc),C(.25)));}
  sigma2=H(sigma2,C(c.firelightSigmaPixels*c.firelightSigmaPixels));
  const support=A(B(C(16),R(sigma2)),C(2)),padX=Q(B(B(support,C(2)),C(maxAbsW)),width),padY=Q(B(B(support,C(2)),C(maxAbsW)),height);
  const px=D[padX+1],py=D[padY+1];if(!Number.isFinite(px+py))return false;
  return mins[0]>px||mins[1]>px||mins[2]>py||mins[3]>py;
}
export function classifyFireworkSweepViewport(p,camera,optics={}){
  camera.updateMatrixWorld();const c=prepareSourceProjection(camera,optics,3.6e-5);prepareFireworkDepthClip(c);
  return{outside:fireworkSweepOutsideViewport(p,c),scope:'physical spatial/shutter sweep convex box with outward Float32 side-plane and Gaussian/DOF support'};
}
function prepareSourceProjection(camera,optics,rawPerCandela,c={scratch:new Float64Array(3)}){
  c.w=optics.width||1200;c.h=optics.height||900;c.V=camera.matrixWorldInverse.elements;c.P=camera.projectionMatrix.elements;c.E=camera.matrixWorld.elements;
  c.near=camera.near;c.raw=rawPerCandela;c.absP5=Math.abs(c.P[5]);c.omegaBase=4/(c.w*c.h*Math.abs(c.P[0]*c.P[5]));
  c.focal=optics.focalMm??28;c.focusMetres=optics.focusMetres??60;c.focus=Math.max(c.focal+1,c.focusMetres*1000);c.aperture=optics.aperture??8;c.sensor=optics.sensorHeightMm??24;
  c.dof=optics.dof;c.shutter=optics.shutterSeconds??1/120;c.legacyShutter=optics.legacyShutterSeconds??c.shutter;c.firelightSigmaPixels=resolveFirelightSigma(optics.firelightSigmaPixels);return c;
}
export {classifyFireworkSourceVisibility};
function projectSourcePoint(x,y,z,c){
  const V=c.V,P=c.P,vx=V[0]*x+V[4]*y+V[8]*z+V[12],vy=V[1]*x+V[5]*y+V[9]*z+V[13],vz=V[2]*x+V[6]*y+V[10]*z+V[14];
  const cw=P[3]*vx+P[7]*vy+P[11]*vz+P[15],denominator=Math.max(cw,1e-5),out=c.scratch;
  // Preserve the old dot-product/order rather than reassociate P*V or use a
  // speed/depth approximation for projected shutter/stretch endpoints.
  out[0]=(P[0]*vx+P[4]*vy+P[8]*vz+P[12])/denominator*c.w*.5;
  out[1]=(P[1]*vx+P[5]*vy+P[9]*vz+P[13])/denominator*c.h*.5;out[2]=cw;
}
function sourceBoundOutput(){return{peak:0,visible:false,rect:[0,0,0,0],nearPlaneFallback:false,baseSigma2:0,omega:0,distance:0,depth:0,shutterPixels:[0,0],stretchPixels:[0,0]};}
function writeSourceBound(p,c,out,maximumColour=maximumRGB(p.colour)){
  const position=p.position,x=position[0],y=position[1],z=position[2],q=c.scratch;
  projectSourcePoint(x,y,z,c);const centreX=q[0],centreY=q[1],depth=q[2],rect=out.rect;
  if(depth<=.01){out.peak=0;out.visible=false;out.nearPlaneFallback=false;rect.fill(0);return false;}
  const P=c.P,E=c.E,w=c.w,h=c.h,radius=p.radius,d=Math.max(radius,Math.hypot(x-E[12],y-E[13],z-E[14])),ndcX=centreX*2/w,ndcY=centreY*2/h;
  const omega=c.omegaBase/(1+(ndcX/P[0])**2+(ndcY/P[5])**2)**1.5;
  const angular=radius*c.absP5*h/(2*Math.max(depth,.001)),f=c.focal,focus=c.focus;
  const coc=c.dof?Math.abs(f*f*(depth*1000-focus)/(c.aperture*Math.max(depth*1000,f+1)*(focus-f)))/c.sensor*h*.5:0;
  let baseSigma2=.0784+angular*angular*.5+coc*coc*.25,firelightMargin=0;
  if(firelightHeadAA(p,c)&&baseSigma2<c.firelightSigmaPixels*c.firelightSigmaPixels){baseSigma2=c.firelightSigmaPixels*c.firelightSigmaPixels;firelightMargin=FIRELIGHT_AA_MARGIN_PIXELS;}
  const I=p.maximumReferenceRGB?maximumRGB(p.maximumReferenceRGB):(p.unmodulatedIntensity??p.intensity??0)*maximumColour;
  out.peak=I*c.raw/(d*d*omega)*Math.min(1,1/(2*Math.PI*baseSigma2));
  const velocity=p.rasterVelocity??p.velocity??boundZero,stretch=p.stretch||boundZero,shutter=p.vectorEmission?p.rasterExposureSeconds??p.viewExposure?.durationSeconds??c.shutter:c.legacyShutter??c.shutter;
  // Array.map on Float32Array used to round endpoints to Float32. Preserve
  // this public-input case while production world positions remain Float64.
  const float32=position instanceof Float32Array;
  let ax=x+velocity[0]*shutter*.5,ay=y+velocity[1]*shutter*.5,az=z+velocity[2]*shutter*.5;
  if(float32){ax=Math.fround(ax);ay=Math.fround(ay);az=Math.fround(az);}projectSourcePoint(ax,ay,az,c);
  const aX=q[0],aY=q[1],aDepth=q[2];
  let bx=x-velocity[0]*shutter*.5,by=y-velocity[1]*shutter*.5,bz=z-velocity[2]*shutter*.5;
  if(float32){bx=Math.fround(bx);by=Math.fround(by);bz=Math.fround(bz);}projectSourcePoint(bx,by,bz,c);
  const mx=aX-q[0],my=aY-q[1];let motionX=mx,motionY=my,sigma2=baseSigma2,explicit=0,nearPlaneFallback=Math.min(aDepth,q[2],depth)<=c.near;
  let stretch2=0;for(let i=0;i<stretch.length;i++)stretch2+=stretch[i]*stretch[i];const trail=stretch2>1e-12;
  if(trail){
    ax=x+stretch[0]*.5;ay=y+stretch[1]*.5;az=z+stretch[2]*.5;
    if(float32){ax=Math.fround(ax);ay=Math.fround(ay);az=Math.fround(az);}projectSourcePoint(ax,ay,az,c);
    const saX=q[0],saY=q[1],saDepth=q[2];
    bx=x-stretch[0]*.5;by=y-stretch[1]*.5;bz=z-stretch[2]*.5;
    if(float32){bx=Math.fround(bx);by=Math.fround(by);bz=Math.fround(bz);}projectSourcePoint(bx,by,bz,c);
    motionX=saX-q[0];motionY=saY-q[1];nearPlaneFallback ||= Math.min(saDepth,q[2])<=c.near;
    if(Math.hypot(mx,my)<=1)sigma2+=(mx*mx+my*my)/24;else explicit=1;
  }
  const spread=3.65*Math.sqrt(sigma2),extentX=spread+Math.abs(motionX)*.5+Math.abs(mx)*.5*explicit+.65+1+firelightMargin,extentY=spread+Math.abs(motionY)*.5+Math.abs(my)*.5*explicit+.65+1+firelightMargin;
  const cx=centreX+w*.5,cy=centreY+h*.5;
  if(nearPlaneFallback){rect[0]=0;rect[1]=0;rect[2]=w;rect[3]=h;}
  else{rect[0]=cx-extentX;rect[1]=cy-extentY;rect[2]=cx+extentX;rect[3]=cy+extentY;}
  out.visible=rect[2]>=0&&rect[0]<=w&&rect[3]>=0&&rect[1]<=h;out.nearPlaneFallback=nearPlaneFallback;out.baseSigma2=baseSigma2;out.omega=omega;out.distance=d;out.depth=depth;
  out.shutterPixels[0]=mx;out.shutterPixels[1]=my;out.stretchPixels[0]=trail?motionX:0;out.stretchPixels[1]=trail?motionY:0;return true;
}
export function getFireworkSourceBound(p,camera,optics={},rawPerCandela=3.6e-5){
  const out=sourceBoundOutput();if(!writeSourceBound(p,prepareSourceProjection(camera,optics,rawPerCandela),out))return{peak:0,visible:false,nearPlaneFallback:false,rect:out.rect};
  return out;
}

// Independent finite effects layer. Never insert effectsScene into main scene:
// main lens invokes render() after its opaque air/DOF, before shared bloom.
export function createFireworks(THREE,{terrainHeight=()=>0,origin=[29,0,7],seed=14271,clusterModel='legacy',trailIntegration='legacy8',tailColourMode='constant',photometryMode='reference',thermalEmittingRadiusMm=2,sourceVisibility='conservative',sweptSourceVisibility=false,simulationOptions={},airSurface=null}={}){
  const validateSourceVisibility=value=>{if(!['none','depth','conservative'].includes(value))throw new RangeError("sourceVisibility must be 'none', 'depth' or 'conservative'");return value;};
  sourceVisibility=validateSourceVisibility(sourceVisibility);
  const validateClusterModel=value=>{if(value!=='legacy'&&value!=='moments')throw new RangeError("clusterModel must be 'legacy' or 'moments'");return value;};
  const validateTrailIntegration=value=>{if(value!=='legacy8'&&value!=='adaptive')throw new RangeError("trailIntegration must be 'legacy8' or 'adaptive'");return value;};
  trailIntegration=validateTrailIntegration(trailIntegration);
  const validateTailColourMode=value=>{if(value!=='constant'&&value!=='cooling')throw new RangeError("tailColourMode must be 'constant' or 'cooling'");return value;};
  tailColourMode=validateTailColourMode(tailColourMode);let tailColourModeRequested=tailColourMode!=='constant';
  const validatePhotometryMode=value=>{if(value!=='reference'&&value!=='thermal-greybody')throw new RangeError("photometryMode must be 'reference' or 'thermal-greybody'");return value;};
  const validateThermalRadius=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<1||value>3)throw new RangeError('Thermal effective emitting radius requires finite1..3mm');return value;};
  photometryMode=validatePhotometryMode(photometryMode);thermalEmittingRadiusMm=validateThermalRadius(thermalEmittingRadiusMm);let photometryRequested=photometryMode!=='reference'||thermalEmittingRadiusMm!==2,thermalBodyScale=photometryMode==='thermal-greybody'?thermalGreybodyCandela(thermalEmittingRadiusMm)/THERMAL_GREYBODY_PROFILE.referenceAreaCandela:1;
  const bodyPhotometricScale=body=>!body.burnProfile&&photometryMode==='thermal-greybody'&&body.colour===EMISSION_PROFILES.thermal?thermalBodyScale:1;
  clusterModel=validateClusterModel(clusterModel);
  const contactSupport=airSurface?createFireworkContactSupport(airSurface):null;
  const base=[...origin];base[1]=Math.max(base[1],terrainHeight(base[0],base[2]))+.04;
  const launchOrigin=[base[0],base[1]+.83,base[2]],simulation=createFireworksSimulation({...simulationOptions,origin:launchOrigin,directionOrigin:base,seed,muzzleOffsetMetres:.66});
  const rig=new THREE.Group();rig.name='Physical display launcher, metres';rig.position.fromArray(base);
  const steel=new THREE.MeshStandardMaterial({color:0x323c3d,metalness:.72,roughness:.48}),rubber=new THREE.MeshStandardMaterial({color:0x171d1d,roughness:.92});
  const plate=new THREE.Mesh(new THREE.BoxGeometry(.86,.09,.64),steel);plate.position.y=.045;plate.castShadow=plate.receiveShadow=true;rig.add(plate);
  for(const x of [-.3,.3])for(const z of [-.22,.22]){const foot=new THREE.Mesh(new THREE.CylinderGeometry(.07,.085,.10,12),rubber);foot.position.set(x,.02,z);foot.castShadow=true;rig.add(foot);}
  const aim=new THREE.Group();aim.position.y=.17;rig.add(aim);
  for(const x of [-.22,0,.22]){const tube=new THREE.Mesh(new THREE.CylinderGeometry(.064,.064,.68,16,1,true),steel);tube.position.set(x,.32,0);tube.castShadow=tube.receiveShadow=true;aim.add(tube);}
  const effectsScene=new THREE.Scene();effectsScene.name='Finite fireworks and smoke, no sky/environment capture';
  const dummy=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);dummy.needsUpdate=true;
  const capacity=FIREWORK_RENDER_CAPACITY_LIMITS.initialRows,geometry=new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));geometry.setIndex([0,1,2,0,2,3]);
  const attributes={centre:3,velocity:3,stretch:3,colour:3,shape:4,smokeLight:3,temporal0:4,temporal1:4,temporal2:4,temporal3:4,temporal4:4,temporal5:4},arrays={};
  for(const [name,size]of Object.entries(attributes)){arrays[name]=new Float32Array(capacity*size);geometry.setAttribute('a'+name[0].toUpperCase()+name.slice(1),new THREE.InstancedBufferAttribute(arrays[name],size).setUsage(THREE.DynamicDrawUsage));}
  let opticalCapacity=capacity;
  function ensureOpticalCapacity(required){
    const nextCapacity=nextFireworkRowCapacity(opticalCapacity,required,FIREWORK_RENDER_CAPACITY_LIMITS.opticalRows,'Finite optical row');
    if(nextCapacity===opticalCapacity)return;
    const next={};for(const [name,size]of Object.entries(attributes)){next[name]=new Float32Array(nextCapacity*size);next[name].set(arrays[name]);}
    // Dispose the old VAO/buffer bindings before replacing attributes; Three
    // reinitializes the same geometry object on its next render.
    geometry.dispose();for(const [name,size]of Object.entries(attributes)){arrays[name]=next[name];geometry.setAttribute('a'+name[0].toUpperCase()+name.slice(1),new THREE.InstancedBufferAttribute(arrays[name],size).setUsage(THREE.DynamicDrawUsage));}
    opticalCapacity=nextCapacity;
  }
  geometry.instanceCount=0;
  const uniforms={uViewProjection:{value:new THREE.Matrix4()},uProjection:{value:new THREE.Matrix4()},uEye:{value:new THREE.Vector3()},uSize:{value:new THREE.Vector2(1,1)},uDepth:{value:dummy},
    uSourceTransmission:{value:dummy},uSourceTransmissionSize:{value:new THREE.Vector2(1,1)},uSourceTransmissionEnabled:{value:0},
    uTrailAdaptive:{value:trailIntegration==='adaptive'?1:0},uFirelightSigmaPixels:{value:.28},uStorageScale:{value:1},uRawPerCandela:{value:3.6e-5},uPlaneY:{value:0},uNear:{value:.1},uFar:{value:30000},
    uFocalMm:{value:28},uAperture:{value:8},uFocus:{value:60},uSensorHeightMm:{value:24},uDof:{value:0},uShutter:{value:1/120},uLegacyShutter:{value:1/120},uVignette:{value:0},
    uAirEnabled:{value:0},uBetaR:{value:new THREE.Vector3()},uBetaME:{value:new THREE.Vector3()},uBetaMS:{value:new THREE.Vector3()},uHeights:{value:new THREE.Vector2(8000,1200)},uG:{value:.76},uSunDirection:{value:new THREE.Vector3(0,1,0)},uRawSunRGB:{value:new THREE.Vector3()},
  };
  const vertex=/* glsl */`precision highp float;
    in vec3 position,aCentre,aVelocity,aStretch,aColour,aSmokeLight;in vec4 aShape,aTemporal0,aTemporal1,aTemporal2,aTemporal3,aTemporal4,aTemporal5;
    uniform mat4 uViewProjection,uProjection;uniform vec3 uEye;uniform vec2 uSize;
    uniform highp sampler2D uSourceTransmission;uniform vec2 uSourceTransmissionSize;uniform float uSourceTransmissionEnabled;
    uniform float uFocalMm,uAperture,uFocus,uSensorHeightMm,uDof,uShutter,uLegacyShutter,uTrailAdaptive,uFirelightSigmaPixels;
    flat out vec4 vTrailSampling;flat out vec2 vTrailCentre;out vec2 vOffset,vMotion;out vec3 vWorld,vColour,vSmokeLight,vTrailShutter;out vec4 vShape,vTemporal0,vTemporal1,vTemporal2,vTemporal3,vTemporal4,vTemporal5;out float vSigma,vOriginalSigma,vOmega,vDistance;
    vec2 projectPixels(vec3 p){vec4 c=uViewProjection*vec4(p,1.);return c.xy/max(c.w,1e-5)*uSize*.5;}
    void main(){
      vec4 clip=uViewProjection*vec4(aCentre,1.);float depth=max(clip.w,.001);vec2 ndc=clip.xy/depth;
      float pixelScale=abs(uProjection[1][1])*uSize.y*.5/depth,worldSigma=aShape.y*pixelScale*.70710678;
      float f=uFocalMm,s=depth*1000.,focus=max(f+1.,uFocus*1000.);
      float coc=abs(f*f*(s-focus)/(uAperture*max(s,f+1.)*(focus-f)))/uSensorHeightMm*uSize.y*.5*uDof;
      if(aShape.x>.5)worldSigma=aShape.y*pixelScale*.5;
      float sigma=sqrt(.0784+worldSigma*worldSigma+coc*coc*.25);
      // Native scalar tail samples use radius.0018, including zero-length
      // birth/end nodes. Do not broaden those, vector profiles or resolved heads.
      float firelightMargin=0.;
      if(uFirelightSigmaPixels>.28&&aShape.x<.5&&aShape.w>=0.&&aShape.y!=.0018&&all(equal(aStretch,vec3(0.)))&&sigma<uFirelightSigmaPixels){sigma=uFirelightSigmaPixels;firelightMargin=.25;}
      bool vectorEmission=aShape.w<0.;float exposureSeconds=vectorEmission?uShutter:uLegacyShutter;
      vec2 shutter=projectPixels(aCentre+aVelocity*exposureSeconds*.5)-projectPixels(aCentre-aVelocity*exposureSeconds*.5);
      bool trail=dot(aStretch,aStretch)>1e-12;vec2 motion=shutter;float explicitShutter=0.;
      if(trail){
        motion=projectPixels(aCentre+aStretch*.5)-projectPixels(aCentre-aStretch*.5);
        // A uniform shutter segment has covariance m*mT/12. When its length
        // is at most1pixel use an isotropic trace-preserving approximation
        // (half its trace per axis), never subtract a spatial tail tangent.
        // Wider near-view shutter footprints use explicit3-point quadrature.
        if(vectorEmission){if(exposureSeconds>0.)explicitShutter=1.;}
        else if(length(shutter)<=1.)sigma=sqrt(sigma*sigma+dot(shutter,shutter)/24.);
        else explicitShutter=1.;
      }
      // Each complete source selects ONE path. No per-pixel legacy/adaptive mix.
      // Continuous N/N+1 blend keeps both midpoint spacings strictly below.5px.
      vTrailSampling=vec4(8.,8.,0.,0.);
      if(trail&&uTrailAdaptive>.5){
        float L=length(motion);
        if(L>1e-4){
          vec2 axis=motion/L;float targetStep=.5*max(1.,sigma);float x=max(7.,L/targetStep),n0=floor(x)+1.,n1=n0+1.,f=fract(x),blend=clamp(f*f*f*(f*(f*6.-15.)+10.),0.,1.);
          float support=.5*(abs(axis.x)+abs(axis.y))+6.*sigma+.02;
          if(explicitShutter>.5)support+=.38729833462*abs(dot(shutter,axis));
          float maxLocal=min(n1,ceil(2.*support*n1/L)+4.);
          // Global index range is bounded for highp float precision. Local
          // work is bounded independently of the complete segment length.
          if(n1<=65536.&&maxLocal<=128.)vTrailSampling=vec4(n0,n1,blend,1.);
        }
      }
      // Near scalar heads retain the eight authored emission-bin means, but
      // integrate each complete bin over its shutter segment instead of
      // displaying eight separated points. Distant/resolved-safe heads keep
      // the original loop exactly. Both positive levels contain 8*m samples.
      if(!trail&&!vectorEmission&&aShape.x<.5&&aShape.y!=.0018&&uTrailAdaptive>.5){
        float L=length(motion),x=L/(4.*max(1.,sigma));
        if(x>1.){
          float n0=8.*floor(x),n1=n0+8.,f=fract(x),blend=clamp(f*f*f*(f*(f*6.-15.)+10.),0.,1.);
          vec2 axis=motion/L;float support=.5*(abs(axis.x)+abs(axis.y))+6.*sigma+.02;
          float maxLocal=min(n1,ceil(2.*support*n1/L)+4.);
          if(n1<=65536.&&maxLocal<=128.)vTrailSampling=vec4(n0,n1,blend,2.);
        }
      }
      // Adaptive integration uses the physical projected centre, independent
      // of the expanded quad's implementation-dependent raster snapping.
      vTrailCentre=(ndc*.5+.5)*uSize;
      vec2 extent=3.65*vec2(sigma)+abs(motion)*.5+abs(shutter)*.5*explicitShutter+vec2(.65+firelightMargin);
      clip.xy+=position.xy*extent*2./uSize*clip.w;gl_Position=clip;
      if(clip.w<=.01)gl_Position=vec4(3.,3.,3.,1.);
      vOffset=position.xy*extent;vMotion=motion;vTrailShutter=vec3(shutter,trail?(explicitShutter>.5?2.:1.):0.);vWorld=aCentre;vShape=aShape;vColour=aColour;vSmokeLight=aSmokeLight;vTemporal0=aTemporal0;vTemporal1=aTemporal1;vTemporal2=aTemporal2;vTemporal3=aTemporal3;vTemporal4=aTemporal4;vTemporal5=aTemporal5;vSigma=sigma;vOriginalSigma=max(.28,worldSigma);
      if(uSourceTransmissionEnabled>.5&&aShape.x<.5){
        int sourceWidth=max(1,int(uSourceTransmissionSize.x));
        vColour*=texelFetch(uSourceTransmission,ivec2(gl_InstanceID%sourceWidth,gl_InstanceID/sourceWidth),0).rgb;
      }
      vec2 slope=ndc/vec2(uProjection[0][0],uProjection[1][1]);
      vOmega=4./(uSize.x*uSize.y*abs(uProjection[0][0]*uProjection[1][1]))/pow(1.+dot(slope,slope),1.5);
      vDistance=max(length(aCentre-uEye),aShape.y);
    }`;
  const fragment=/* glsl */`precision highp float;precision highp int;
    uniform vec3 uEye,uBetaR,uBetaME,uBetaMS,uSunDirection,uRawSunRGB;uniform vec2 uSize,uHeights;
    uniform float uStorageScale,uRawPerCandela,uPlaneY,uAirEnabled,uG,uVignette,uFocalMm,uSensorHeightMm;
    #ifndef REFLECTION_PASS
      uniform highp sampler2D uDepth;
    #endif
    flat in vec4 vTrailSampling;flat in vec2 vTrailCentre;in vec2 vOffset,vMotion;in vec3 vWorld,vColour,vSmokeLight,vTrailShutter;in vec4 vShape,vTemporal0,vTemporal1,vTemporal2,vTemporal3,vTemporal4,vTemporal5;in float vSigma,vOriginalSigma,vOmega,vDistance;
    out vec4 outColour;
    float erfApprox(float x){float s=sign(x);x=abs(x);float t=1./(1.+.3275911*x);return s*(1.-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*exp(-x*x));}
    float integratedGaussian(vec2 p,float sigma){vec2 a=(p-vec2(.5))/(sigma*1.41421356237),b=(p+vec2(.5))/(sigma*1.41421356237);return max(0.,.25*(erfApprox(b.x)-erfApprox(a.x))*(erfApprox(b.y)-erfApprox(a.y)));}
    vec3 referenceRGBTap(int i){
      if(i==0)return vTemporal0.xyz;if(i==1)return vec3(vTemporal0.w,vTemporal1.xy);
      if(i==2)return vec3(vTemporal1.zw,vTemporal2.x);if(i==3)return vTemporal2.yzw;
      if(i==4)return vTemporal3.xyz;if(i==5)return vec3(vTemporal3.w,vTemporal4.xy);
      if(i==6)return vec3(vTemporal4.zw,vTemporal5.x);return vTemporal5.yzw;
    }
    float scalarHeadKernel(float n){
      vec2 pixelOffset=gl_FragCoord.xy-vTrailCentre;
      float L=length(vMotion);vec2 axis=vMotion/L;
      float support=.5*(abs(axis.x)+abs(axis.y))+6.*vSigma+.02,along=dot(pixelOffset,axis);
      int lo=int(clamp(ceil(n*(.5+(along-support)/L)-.5),0.,n));
      int hi=int(clamp(floor(n*(.5+(along+support)/L)-.5),-1.,n-1.)),perBin=int(n)/8;
      float kernel=0.;
      for(int k=0;k<128;k++){
        int i=lo+k;if(i>hi)break;int bin=i/perBin;
        float weight=bin<4?vTemporal0[bin]:vTemporal1[bin-4];
        kernel+=integratedGaussian(pixelOffset-vMotion*((float(i)+.5)/n-.5),vSigma)*weight;
      }
      // No pixel-local renormalization: every original bin contributes its
      // complete mean/8 budget globally, even when this pixel visits no tap.
      return kernel/n;
    }
    float vectorSpatialKernel(float n,vec2 temporalShift){
      vec2 pixelOffset=gl_FragCoord.xy-vTrailCentre-temporalShift;
      float L=length(vMotion);if(L<=1e-4)return integratedGaussian(pixelOffset,vSigma);
      vec2 axis=vMotion/L;float support=.5*(abs(axis.x)+abs(axis.y))+6.*vSigma+.02;
      float along=dot(pixelOffset,axis);
      int lo=int(clamp(ceil(n*(.5+(along-support)/L)-.5),0.,n));
      int hi=int(clamp(floor(n*(.5+(along+support)/L)-.5),-1.,n-1.));float kernel=0.;
      for(int k=0;k<128;k++){int i=lo+k;if(i>hi)break;kernel+=integratedGaussian(pixelOffset-vMotion*((float(i)+.5)/n-.5),vSigma);}
      return kernel/n;
    }
    float vectorKernel(vec2 temporalShift){
      // Fragment coordinates remain exact after fixed-subpixel quad raster snapping.
      vec2 pixelOffset=gl_FragCoord.xy-vTrailCentre;
      if(vTrailShutter.z<.5)return integratedGaussian(pixelOffset-temporalShift,vSigma);
      if(vTrailSampling.w>.5){float k=vectorSpatialKernel(vTrailSampling.x,temporalShift);return vTrailSampling.z==0.?k:mix(k,vectorSpatialKernel(vTrailSampling.y,temporalShift),vTrailSampling.z);}
      float k=0.;for(int j=0;j<8;j++)k+=integratedGaussian(pixelOffset-vMotion*((float(j)+.5)/8.-.5)-temporalShift,vSigma)*.125;return k;
    }
    float adaptiveSpatialKernel(float n){
      vec2 pixelOffset=gl_FragCoord.xy-vTrailCentre;
      float L=length(vMotion);vec2 axis=vMotion/L;
      float support=.5*(abs(axis.x)+abs(axis.y))+6.*vSigma+.02;
      if(vTrailShutter.z>1.5)support+=.38729833462*abs(dot(vTrailShutter.xy,axis));
      float along=dot(pixelOffset,axis);
      int lo=int(clamp(ceil(n*(.5+(along-support)/L)-.5),0.,n));
      int hi=int(clamp(floor(n*(.5+(along+support)/L)-.5),-1.,n-1.));
      float kernel=0.;
      for(int k=0;k<128;k++){
        int i=lo+k;if(i>hi)break;
        vec2 q=pixelOffset-vMotion*((float(i)+.5)/n-.5);
        if(vTrailShutter.z<1.5)kernel+=integratedGaussian(q,vSigma);
        else{
          float b=integratedGaussian(q,vSigma)*(4./9.);
          b+=(integratedGaussian(q-vTrailShutter.xy*.38729833462,vSigma)+integratedGaussian(q+vTrailShutter.xy*.38729833462,vSigma))*(5./18.);
          kernel+=b;
        }
      }
      // Keep the COMPLETE global quadrature weight. Never renormalize the
      // pixel-local subset; omitted6sigma tails have an explicit error bound.
      return kernel/n;
    }
    void finiteAir(vec3 start,vec3 endpoint,out vec3 T,out vec3 S){
      T=vec3(1.);S=vec3(0.);if(uAirEnabled<.5)return;
      vec3 ray=endpoint-start;float distance=length(ray);if(distance<1e-5)return;vec3 direction=ray/distance;
      float mu=clamp(dot(direction,uSunDirection),-1.,1.),phaseR=3./(16.*3.14159265359)*(1.+mu*mu),phaseM=(1.-uG*uG)/(12.56637061436*pow(max(1e-4,1.+uG*uG-2.*uG*mu),1.5));
      for(int i=0;i<4;i++){float a=float(i)/4.,b=float(i+1)/4.,ds=(b*b-a*a)*distance;vec3 p=start+direction*((a*a+b*b)*.5*distance);float h=max(0.,p.y);vec3 r=uBetaR*exp(-h/uHeights.x),m=uBetaMS*exp(-h/uHeights.y),extinction=r+uBetaME*exp(-h/uHeights.y);vec3 integral=(vec3(1.)-exp(-extinction*ds))/max(extinction,vec3(1e-12));integral=mix(integral,vec3(ds),lessThan(extinction*ds,vec3(1e-5)));S+=T*uRawSunRGB*(r*phaseR+m*phaseM)*integral;T*=exp(-extinction*ds);}
    }
    void main(){
      #ifndef REFLECTION_PASS
        float obstacle=textureLod(uDepth,gl_FragCoord.xy/uSize,0.).r;
        if(gl_FragCoord.z>obstacle+1e-6)discard;
      #endif
      vec3 origin=uEye;
      #ifdef REFLECTION_PASS
        float denominator=vWorld.y-uEye.y;
        if(abs(denominator)<1e-6)discard;
        float t=(uPlaneY-uEye.y)/denominator;if(t<0.||t>1.)discard;
        origin=mix(uEye,vWorld,t);
      #endif
      vec3 T,S;finiteAir(origin,vWorld,T,S);
      vec3 rgb;float alpha=0.;
      if(vShape.x<.5){
        if(vShape.w<0.){
          vec3 integral=vec3(0.);vec2 shutterMotion=vTrailShutter.z<.5?vMotion:vTrailShutter.xy;
          if(dot(shutterMotion,shutterMotion)<1e-20){vec3 mean=vec3(0.);for(int i=0;i<8;i++)mean+=referenceRGBTap(i)*.125;integral=mean*vectorKernel(vec2(0.));}
          else for(int i=0;i<8;i++){float t=(float(i)+.5)/8.-.5;integral+=referenceRGBTap(i)*vectorKernel(shutterMotion*t)*.125;}
          rgb=T*vColour*(uRawPerCandela/max(vDistance*vDistance*vOmega,1e-12))*integral;
        }else{
        float kernel=0.,meanEmission=(dot(vTemporal0,vec4(1.))+dot(vTemporal1,vec4(1.)))*.125;
        if(vTrailSampling.w>1.5){
          if(vTrailSampling.z==0.)kernel=scalarHeadKernel(vTrailSampling.x);
          else kernel=mix(scalarHeadKernel(vTrailSampling.x),scalarHeadKernel(vTrailSampling.y),vTrailSampling.z);
        }
        else if(vTrailSampling.w>.5){
          if(vTrailSampling.z==0.)kernel=meanEmission*adaptiveSpatialKernel(vTrailSampling.x);
          else kernel=meanEmission*mix(adaptiveSpatialKernel(vTrailSampling.x),adaptiveSpatialKernel(vTrailSampling.y),vTrailSampling.z);
        }
        else for(int i=0;i<8;i++){
          float t=(float(i)+.5)/8.-.5,weight=i<4?vTemporal0[i]:vTemporal1[i-4];vec2 q=vOffset-vMotion*t;
          if(vTrailShutter.z<.5)kernel+=integratedGaussian(q,vSigma)*weight*.125;
          else if(vTrailShutter.z<1.5)kernel+=integratedGaussian(q,vSigma)*meanEmission*.125;
          else{
            // Three-point Gauss-Legendre average of the independent shutter.
            // Spatial tail integration remains the same8samples/total flux.
            float b=integratedGaussian(q,vSigma)*(4./9.);
            b+=(integratedGaussian(q-vTrailShutter.xy*.38729833462,vSigma)+integratedGaussian(q+vTrailShutter.xy*.38729833462,vSigma))*(5./18.);
            kernel+=b*meanEmission*.125;
          }
        }
        rgb=T*vColour*(vShape.z*uRawPerCandela/max(vDistance*vDistance*vOmega,1e-12))*kernel;
        }
      }else{float r2=dot(vOffset,vOffset)/(vSigma*vSigma);if(r2>13.4)discard;float tau=vShape.w*exp(-.5*r2)*vOriginalSigma*vOriginalSigma/(vSigma*vSigma);alpha=1.-exp(-tau);rgb=T*(vSmokeLight*alpha)+S*alpha;}
      // ONE / ONE_MINUS_SRC_ALPHA: source RGB already premultiplied; a pure
      // emitter alpha=0 must retain its energy and the sky behind it.
      vec2 sensor=(gl_FragCoord.xy/uSize-.5)*vec2(uSensorHeightMm*uSize.x/uSize.y,uSensorHeightMm);
      float cos4=pow(inversesqrt(1.+dot(sensor,sensor)/(uFocalMm*uFocalMm)),4.);
      float vignette=mix(1.,mix(1.,cos4,.30),uVignette);
      outColour=vec4(rgb*uStorageScale*vignette,alpha);
    }`;
  function material(reflection){return new THREE.RawShaderMaterial({name:reflection?'Finite reflected effects, water-hit air':'Finite direct effects, manual opaque depth',glslVersion:THREE.GLSL3,defines:reflection?{REFLECTION_PASS:1}:{},uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,depthTest:reflection,depthWrite:false,toneMapped:false,blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendEquationAlpha:THREE.AddEquation,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor});}
  const mainMaterial=material(false),reflectionMaterial=material(true),mesh=new THREE.Mesh(geometry,mainMaterial);mesh.name='Depth-sorted finite particles, sparks, grey smoke';mesh.frustumCulled=false;effectsScene.add(mesh);
  const receiverClusterBuilder=createReceiverLightClusterBuilder();
  let records=[],recordsGeneration=0,quality={trailSegments:10},disposed=false,lastRender={instances:0},lastTrailSampling=null,trailIntegrationRequested=trailIntegration!=='legacy8',warnings=[],boundCache=null,boundsCache=null,boundsKey='',clusterCache=null,receiverClusterCache=null;
  const lastRenderByView={main:null,reflection:null};
  function recordViewRender(info){lastRender=info;lastRenderByView[info.reflection?'reflection':'main']=info;}
  const sourceProjectionCache=new WeakMap(),uploadProjectionCache=new WeakMap(),sourceBoundScratch=sourceBoundOutput(),radianceBins=new Float64Array(32*32);
  const boundsPastSamples=new WeakMap(),boundsThrustIdentities=new WeakMap(),complexEnvelopeCache=new WeakMap();let boundsSampleGeneration=0,boundsNextThrustIdentity=0;
  const viewPosition=new THREE.Vector3(),projected=new THREE.Vector3();
  const opticalViewCache=new WeakMap(),opticalAnchorCache=new WeakMap(),tailFieldNodes=new WeakMap();
  const opticalShutterCacheLimit=4;
  function tailFieldNode(body,lag){let nodes=tailFieldNodes.get(body);if(!nodes){nodes=new Map();tailFieldNodes.set(body,nodes);}if(!nodes.has(lag)||nodes.get(lag).sourceBirth!==body.birth){if(nodes.size>=64)nodes.clear();nodes.set(lag,createTailReleaseFieldNode(body,lag));}return nodes.get(lag);}
  let maximumEmberColour=null;
  const Y=rgb=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  const referenceRGB=(p,c)=>p.emissionRGBReference?p.emissionRGBReference[c]:p.intensity*p.colour[c];
  function vectorRecord(rgb,maximum){const I=Y(rgb);return{vectorEmission:true,emissionRGBReference:rgb,intensity:I,colour:I>0?rgb.map(v=>v/I):[0,0,0],maximumReferenceRGB:maximum};}
  function emberColourMaximum(){
    if(!maximumEmberColour){maximumEmberColour=[...EMISSION_PROFILES.thermal];for(let i=1;i<129;i++){const c=thermalTailColour(i/128,1);for(let k=0;k<3;k++)maximumEmberColour[k]=Math.max(maximumEmberColour[k],c[k]);}}
    return tailColourMode==='cooling'?maximumEmberColour:EMISSION_PROFILES.thermal;
  }
  function opticalAnchor(body,shutter){
    let cache=opticalAnchorCache.get(body);if(!cache||cache.generation!==recordsGeneration){cache={generation:recordsGeneration,values:new Map()};opticalAnchorCache.set(body,cache);}
    if(!cache.values.has(shutter)){if(cache.values.size>=opticalShutterCacheLimit)cache.values.clear();cache.values.set(shutter,sampleCausalOpticalAnchor({birth:body.birth,physicalNow:simulation.time,shutterSeconds:shutter,sampleAt:t=>body.schema==='glass-atoll.tail-release-field-node.v1'?sampleTailReleaseFieldNode(body,t,simulation.windTimeline):sampleBody(body,t,simulation.windTimeline)}));}
    return cache.values.get(shutter);
  }
  function opticalViewRecord(p,shutter){
    if(!p.vectorEmission){
      const visibility=p.sourceRole==='optical-flash'?OPTICAL_FLASH_CORE_VISIBILITY:(p.sourceRole==='complex-head'||p.sourceRole==='complex-tail')&&BURST_HEAD_VIEW_PARTS.has(p.sourceBody?.patternPart)?burstHeadViewVisibility(p.sourceAge):1;
      if(visibility===1)return p;
      let view=opticalViewCache.get(p);
      if(!view){view={...p,intensity:p.intensity*visibility,unmodulatedIntensity:p.unmodulatedIntensity*visibility,maximumReferenceRGB:p.maximumReferenceRGB.map(v=>v*visibility)};opticalViewCache.set(p,view);}
      return view;
    }
    let cache=opticalViewCache.get(p);if(!cache){cache=new Map();opticalViewCache.set(p,cache);}if(cache.has(shutter))return cache.get(shutter);if(cache.size>=opticalShutterCacheLimit)cache.clear();
    const exposure=resolveFireworkExposure({physicalNow:simulation.time,shutterSeconds:shutter}),actualShutter=exposure.durationSeconds,anchor=opticalAnchor(p.tailFieldNode??p.emberBody??p.sourceBody,actualShutter);
    if(!anchor){cache.set(shutter,null);return null;}
    const rgbTaps=new Float64Array(24);
    let maximumReferenceRGB=p.maximumReferenceRGB;
    if(p.emberBody){
      // Integrate the unchanged instantaneous N-lag tail field. Each optical
      // node is replenished at t-lag; it is not a stable material-particle ID.
      sampleBodyEmissionWindow(p.sourceBody,{fromAge:exposure.from-p.sourceBody.birth-p.emberLagSeconds,toAge:exposure.to-p.sourceBody.birth-p.emberLagSeconds,outRGB:rgbTaps});
      for(let i=0;i<8;i++){
        const o=i*3,intensity=(rgbTaps[o]*.2126+rgbTaps[o+1]*.7152+rgbTaps[o+2]*.0722)*p.emberFraction/p.emberNormalization*p.emberDecay;
        for(let c=0;c<3;c++)rgbTaps[i*3+c]=intensity*p.emberColour[c];
      }
      maximumReferenceRGB=p.emberColourMaximum.map(v=>v*p.sourceBody.emissionReferenceI0*p.emberFraction/p.emberNormalization*p.emberDecay);
    }
    else{sampleBodyEmissionWindow(p.sourceBody,{fromAge:exposure.from-p.sourceBody.birth,toAge:exposure.to-p.sourceBody.birth,outRGB:rgbTaps});for(let i=0;i<24;i++)rgbTaps[i]*=p.emissionFraction;}
    if(!rgbTaps.some(v=>v>0)){cache.set(shutter,null);return null;}
    let stretch=p.stretch;const stretchNodes=p.stretchFieldNodes??p.stretchBodies;if(stretchNodes){const a=opticalAnchor(stretchNodes[0],actualShutter),b=opticalAnchor(stretchNodes[1],actualShutter);stretch=b.position.map((v,c)=>(v-a.position[c])*p.stretchWeight);}
    const result={...p,position:anchor.position,velocity:anchor.velocity,stretch,rgbTaps,maximumReferenceRGB,viewExposure:anchor.exposure,virtualBirthAnchor:anchor.virtualBirthAnchor,...(p.emberBody?{viewTemporalModel:'Eulerian fixed-lag release-field bins; independent instantaneous detached-age spectrum'}:{})};cache.set(shutter,result);return result;
  }
  const contactViewCache=new WeakMap();
  function opticalViewRecords(p,shutter){
    const powered=!!p.sourceBody?.thrustProfile;validatePoweredOpticalShutter(shutter,powered);
    if((!contactSupport&&!powered)||!p.vectorEmission){const value=opticalViewRecord(p,shutter);return value?[value]:[];}
    let cache=contactViewCache.get(p);if(!cache){cache=new Map();contactViewCache.set(p,cache);}if(cache.has(shutter))return cache.get(shutter);if(cache.size>=opticalShutterCacheLimit)cache.clear();
    const exposure=resolveFireworkExposure({physicalNow:simulation.time,shutterSeconds:shutter}),support=contactSupport?contactSupport.resolve(p,exposure):null;
    const full=support===null||support.intervals.length===1&&support.intervals[0].from===exposure.from&&support.intervals[0].to===exposure.to;
    let intervals=support===null?[{from:Math.max(exposure.from,(p.tailFieldNode??p.emberBody??p.sourceBody).birth),to:exposure.to}]:support.intervals;
    intervals=intervals.filter(i=>i.to>i.from);if(powered)intervals=partitionPoweredOpticalIntervals({body:p.sourceBody,lagSeconds:p.emberLagSeconds??0,intervals,windTimeline:simulation.windTimeline});
    let rows;
    if((!powered&&full)||exposure.durationSeconds===0&&full){const value=opticalViewRecord(p,shutter);rows=value?[value]:[];}
    else if(!intervals.length||exposure.durationSeconds===0)rows=[];
    else{
      const node=p.tailFieldNode??p.emberBody??p.sourceBody;
      const samplePose=(n,t)=>contactSupport?contactSupport.sampleAt(n,t):n.schema==='glass-atoll.tail-release-field-node.v1'?sampleTailReleaseFieldNode(n,t,simulation.windTimeline):sampleBody(n,t,simulation.windTimeline);
      const sampleAnchorAt=t=>{const state=samplePose(node,t);if(!state||(contactSupport?!contactSupport.isAboveSurface(state.position):state.position[1]<=.03))throw new RangeError('Contact optical anchor must remain above the shared surface');return state;};
      const stretchNodes=p.stretchFieldNodes??p.stretchBodies;
      const stretchAt=stretchNodes?t=>{if(stretchNodes.some(n=>n.birth>t))return[0,0,0];const a=samplePose(stretchNodes[0],t),b=samplePose(stretchNodes[1],t);return b.position.map((v,c)=>(v-a.position[c])*p.stretchWeight);}:undefined;
      rows=buildContactOpticalRecords({p,physicalNow:simulation.time,globalExposure:exposure,intervals,sampleAnchorAt,stretchAt});
      for(const row of rows)row.contactSupport=Object.freeze({...row.contactSupport,rootTimeUncertaintySeconds:support?.totalUnresolvedSeconds??0,surfaceModel:contactSupport?'static terrain/mean sea; centre visibility only; not material extinction':'explicit flat-source centre cutoff',...(powered?{forceKnotPartitions:true,shortShutterLimitSeconds:1/60,representedKnotPolicy:'absolute source/lag clock; float epoch rounding retained; strict interior pose tested'}:{})});
    }
    cache.set(shutter,rows);return rows;
  }
  function* opticalRows(shutter,includeSmoke=true){validatePoweredOpticalShutter(shutter,simulation.active.some(e=>e.effectProfile==='powered-bees-v1'));for(const p of records){if(p.kind==='smoke'){if(includeSmoke)yield p;continue;}yield* opticalViewRecords(p,shutter);}}
  function updateRecords(){invalidatePreparedSourceViews('physical-record-update');contactSupport?.begin({physicalNow:simulation.time,windTimeline:simulation.windTimeline});return withWindResponseMemo(simulation.windTimeline,updateRecordsUncached);}
  const hiddenLegacySmokeEvents=new Set();
  function updateRecordsUncached(){
    const now=simulation.time,timeline=simulation.windTimeline;
    for(const id of hiddenLegacySmokeEvents)if(!simulation.active.some(event=>event.id===id))hiddenLegacySmokeEvents.delete(id);
    records=simulation.active.filter(event=>!hiddenLegacySmokeEvents.has(event.id)).flatMap(event=>sampleFireworkEvent(event,now,{windTimeline:timeline,stars:false})).filter(p=>p.kind==='smoke');
    for(const event of simulation.active)for(const body of [...(event.rocket?[event.rocket]:[]),...event.heads,...(event.opticalFlashes??[])]){
      const age=now-body.birth,life=body.life;if(age<0)continue;
      const rocket=body.kind==='rocket',trailProfile=body.burnProfile?body.trailProfile:null,fraction=body.sourceStyle?(body.trail?body.sourceStyle.tailFraction:0):trailProfile?trailProfile.referenceIntensityFraction:(body.trail||rocket) ? .34 : 0;
      const photometricScale=body.sourceStyle?1:bodyPhotometricScale(body);
      if(body.sourceStyle){
        if(age<life+.02){const state=sampleBody(body,now,timeline),emission=sampleComplexStyle(body,age),share=1-fraction,airborne=contactSupport?contactSupport.isAboveSurface(state.position):state.position[1]>.03;if(airborne)records.push({...state,eventId:event.id,kind:'star',radius:body.radius,intensity:body.intensity*emission.envelope*share,unmodulatedIntensity:body.intensity*share,colour:emission.colour,maximumReferenceRGB:emission.allPhaseMaximumRGB.map(v=>v*share),sourceBody:body,sourceAge:age,sourceRole:body.matter===false?'optical-flash':'complex-head',stretch:[0,0,0]});}
      }else if(body.burnProfile){
        // Current records remain the instantaneous illumination ledger. View
        // records are separate causal shutter histories, including a dark now.
        if(age<=life+1){const state=sampleBody(body,now,timeline),emission=sampleBodyEmission(body,age),share=1-fraction;const airborne=contactSupport?contactSupport.isAboveSurface(state.position):state.position[1]>.03;if(airborne||contactSupport)records.push({...state,eventId:event.id,kind:'star',radius:body.radius,...vectorRecord(emission.emissionRGBReference.map(v=>airborne?v*share:0),emission.allPhaseMaximumRGB.map(v=>v*share)),unmodulatedIntensity:(body.effectProfile===RADIANT_PROFILE_ID?body.emissionReferenceI0:body.intensity)*share,sourceBody:body,sourceAge:age,emissionFraction:share,stretch:[0,0,0],...(!airborne?{airSupportCurrent:false}:{})});}
      }else if(age<life+.02){const state=sampleBody(body,now,timeline),emission=bodyEmissionEnvelope(body,age);if(contactSupport?contactSupport.isAboveSurface(state.position):state.position[1]>.03)records.push({...state,eventId:event.id,kind:'star',radius:body.radius,intensity:photometricScale===1?body.intensity*emission*(1-fraction):body.intensity*photometricScale*emission*(1-fraction),unmodulatedIntensity:photometricScale===1?body.intensity*(1-fraction):body.intensity*photometricScale*(1-fraction),sourceBody:body,sourceAge:age,colour:body.colour,stretch:[0,0,0]});}
      if(!fraction)continue;
      const duration=body.sourceStyle?body.sourceStyle.tailSeconds:trailProfile?trailProfile.durationSeconds:event.type==='willow' ? .88 : event.type==='palm' ? .62 : rocket ? .50 : .35,segments=quality.trailSegments;
      let sum=0;for(let j=0;j<segments;j++)sum+=Math.exp(-((j+.5)/segments)*3.5);
      const tail=[];for(let j=0;j<segments;j++){
        const lag=(j+.5)/segments*duration,born=now-lag,a=born-body.birth;if(a<0||a>life+(body.burnProfile?1:0))continue;
        const source=sampleBody(body,born,timeline),ember={birth:born,position:source.position,velocity:source.velocity.map(v=>v*.25),drag:1.35,gravity:9.81},state=sampleBody(ember,now,timeline);
        const airborne=contactSupport?contactSupport.isAboveSurface(state.position):state.position[1]>=.03;if(!airborne&&!(body.burnProfile&&contactSupport))continue;
        const envelope=body.sourceStyle?null:bodyEmissionEnvelope(body,a),weight=Math.exp(-lag/duration*3.5)/sum;
        if(body.sourceStyle){const emission=sampleComplexTailStyle(body,a,lag),factor=fraction*weight;tail.push({...state,eventId:event.id,kind:'star',radius:.0018,intensity:body.intensity*factor*emission.envelope,unmodulatedIntensity:body.intensity*factor,colour:emission.colour,maximumReferenceRGB:emission.allPhaseMaximumRGB.map(v=>v*factor),sourceBody:body,sourceAge:a,sourceRole:'complex-tail',stretch:[0,0,0]});}
        else if(body.burnProfile){
          const released=sampleBodyEmission(body,a),sourceIntensity=released.intensityCdReference*fraction/sum,colour=trailProfile?sampleTrailColour(trailProfile,lag):tailColourMode==='cooling'?thermalTailColour(lag,duration):EMISSION_PROFILES.thermal,I=sourceIntensity*Math.exp(-lag/duration*3.5),colourMaximum=trailProfile?.allPhaseColourMaximumRGB??emberColourMaximum();
          tail.push({...state,eventId:event.id,kind:'star',radius:.0018,...vectorRecord(colour.map(v=>airborne?v*I:0),colourMaximum.map(v=>v*sourceIntensity)),...(!airborne?{airSupportCurrent:false}:{}),unmodulatedIntensity:(body.effectProfile===RADIANT_PROFILE_ID?body.emissionReferenceI0:body.intensity)*fraction/sum,sourceBody:body,sourceAge:a,emberBody:ember,emberDuration:duration,emberSourceIntensity:sourceIntensity,emberLagSeconds:lag,emberFraction:fraction,emberNormalization:sum,emberDecay:Math.exp(-lag/duration*3.5),emberColour:colour,emberColourMaximum:colourMaximum,tailFieldNode:tailFieldNode(body,lag),...(trailProfile?{emberTrailProfile:trailProfile}:{}),stretch:[0,0,0]});
        }else tail.push({...state,eventId:event.id,kind:'star',radius:.0018,intensity:photometricScale===1?body.intensity*fraction*weight*envelope:body.intensity*photometricScale*fraction*weight*envelope,unmodulatedIntensity:photometricScale===1?body.intensity*fraction*weight:body.intensity*photometricScale*fraction*weight,sourceBody:body,sourceAge:a,colour:tailColourMode==='cooling'?thermalTailColour(lag,duration):EMISSION_PROFILES.thermal,stretch:[0,0,0]});
      }
      const currentTailStart=body.burnProfile?tail.findIndex(p=>p.sourceAge<=life):0;
      const currentAirTail=contactSupport&&body.burnProfile?tail.filter(p=>p.sourceAge<=life&&p.airSupportCurrent!==false):null;
      for(let j=0;j<tail.length;j++){const first=body.burnProfile&&tail[j].sourceAge<=life?Math.max(0,currentTailStart):0,airIndex=currentAirTail?.indexOf(tail[j])??-1,before=airIndex>=0?currentAirTail[Math.max(0,airIndex-1)]:tail[Math.max(first,j-1)],after=airIndex>=0?currentAirTail[Math.min(currentAirTail.length-1,airIndex+1)]:tail[Math.min(tail.length-1,j+1)],one=before.position,two=after.position,weight=airIndex>=0?(airIndex===0||airIndex===currentAirTail.length-1?1:.5):(j===first||j===tail.length-1?1:.5);tail[j].stretch=two.map((v,i)=>(v-one[i])*weight);if(body.burnProfile){tail[j].stretchBodies=[before.emberBody,after.emberBody];tail[j].stretchFieldNodes=[before.tailFieldNode,after.tailFieldNode];tail[j].stretchWeight=weight;}records.push(tail[j]);}
    }
    if(recordsGeneration>=Number.MAX_SAFE_INTEGER)throw new RangeError('Firework record generation exhausted');recordsGeneration++;
    boundCache=null;clusterCache=null;receiverClusterCache=null;
  }
  function getLightClusters(){if(clusterCache)return clusterCache;const headsByEvent=new Map();for(const p of records)if(p.kind==='star'){let heads=headsByEvent.get(p.eventId);if(!heads){heads=[];headsByEvent.set(p.eventId,heads);}heads.push(p);}return clusterCache=reduceFireworkLightClusters(simulation.active.map(event=>{
    const heads=headsByEvent.get(event.id)||[];
    let I=0,centre=[0,0,0],rgb=[0,0,0];for(const p of heads){I+=p.intensity;for(let c=0;c<3;c++){centre[c]+=p.position[c]*p.intensity;rgb[c]+=referenceRGB(p,c);}}
    if(I>1e-8){centre=centre.map(x=>x/I);rgb=rgb.map(x=>x/I);}else{centre=[...event.burstPosition];rgb=[1,1,1];}
    const cluster={position:centre,color:rgb,colour:rgb,referenceCandela:I,intensity:I,radius:Math.max(2,Math.min(28,(simulation.time-event.burstTime)*8)),kind:'fireworks diffuse cluster',eventId:event.id,pathFlags:{diffuse:true,smoke:true,specular:false}};
    if(clusterModel==='moments'){
      // A finite-radius point proxy from the same luminous head/tail ledger.
      // Spatial moments retain total I; they are not resolved area emission.
      let weightedRadiusSquared=0,maxExtent=0;
      for(const p of heads){if(!(p.intensity>0))continue;const dx=p.position[0]-centre[0],dy=p.position[1]-centre[1],dz=p.position[2]-centre[2],r2=dx*dx+dy*dy+dz*dz;weightedRadiusSquared+=p.intensity*r2;maxExtent=Math.max(maxExtent,Math.sqrt(r2));}
      const rmsRadius=I>0?Math.sqrt(Math.max(0,weightedRadiusSquared/I)):0;
      Object.assign(cluster,{radius:Math.max(2,rmsRadius),rmsRadius,maxExtent,illuminationModel:'intensity-weighted spatial-moment finite-radius point proxy; not exact area emission'});
    }
    return cluster;
  }).filter(l=>l.referenceCandela>1e-6));}
  function getReceiverLightClusters({eventIds}={}){if(eventIds!==undefined)return receiverClusterBuilder.build(records,simulation.active,{eventIds});return receiverClusterCache??(receiverClusterCache=receiverClusterBuilder.build(records,simulation.active));}
  // Optional actual-source ledger. No allocation/traversal until requested.
  // data is borrowed until the next ledger call after records/raw-scale change;
  // upload synchronously or copy if retaining it across a physical update.
  let emissionLedgerCache=null,emissionLedgerRecords=null,emissionLedgerData=null,emissionLedgerVersion=0,emissionRecordGeneration=0,ledgerCapacity=capacity;
  function getEmissionLedger({rawPerCandela=3.6e-5}={}){
    if(disposed)throw new Error('Cannot query a disposed firework source ledger');
    if(typeof rawPerCandela!=='number'||!Number.isFinite(rawPerCandela)||rawPerCandela<0)throw new RangeError('Emission ledger rawPerCandela requires finite nonnegative reference scale');
    if(emissionLedgerCache&&emissionLedgerRecords===records&&emissionLedgerCache.rawPerCandela===rawPerCandela)return emissionLedgerCache;
    const groups=[],indices=new Map();let count=0;
    // Full preflight precedes any mutation of the published reusable buffer.
    for(const p of records){if(p.kind==='smoke')continue;const I=p.intensity,position=p.position,colour=p.colour;
      if(typeof I!=='number'||!Number.isFinite(I)||I<0||!position||position.length!==3||!colour||colour.length!==3||!Number.isFinite(p.radius)||p.radius<0)throw new RangeError('Emission ledger requires finite nonnegative luminous records');
      for(let c=0;c<3;c++)if(!Number.isFinite(position[c])||!Number.isFinite(Math.fround(position[c]))||!Number.isFinite(colour[c])||colour[c]<0)throw new RangeError('Emission ledger position/colour is outside its finite Float32 domain');
      if(!(I>0&&maximumRGB(colour)>0))continue;
      if(!((typeof p.eventId==='string'&&p.eventId.length>0)||(typeof p.eventId==='number'&&Number.isFinite(p.eventId))))throw new RangeError('Emission ledger source requires a stable event ID');
      const variance=p.radius*p.radius/5;if(!Number.isFinite(Math.fround(variance)))throw new RangeError('Emission ledger emitter variance overflows Float32');
      for(let c=0;c<3;c++){const raw=referenceRGB(p,c)*rawPerCandela,value=Math.fround(raw);if(!Number.isFinite(value)||(raw>0&&value===0))throw new RangeError('Emission ledger raw RGB is not representable in Float32');}
      if(++count>FIREWORK_RENDER_CAPACITY_LIMITS.ledgerRows)throw new RangeError('Emission ledger capacity exceeded; no luminous entries were truncated');
      if(!indices.has(p.eventId)){
        if(groups.length<2){indices.set(p.eventId,groups.length);groups.push({index:groups.length,eventId:p.eventId,count:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],sumRawRGB:[0,0,0]});}
        else{const group=groups[1];group.memberEventIds??=[group.eventId];group.memberEventIds.push(p.eventId);group.eventId='aggregate:'+JSON.stringify(group.memberEventIds);indices.set(p.eventId,1);}
      }
    }
    if(emissionLedgerVersion>=Number.MAX_SAFE_INTEGER||emissionRecordGeneration>=Number.MAX_SAFE_INTEGER)throw new RangeError('Emission ledger revision exhausted');
    if(!emissionLedgerData||count>ledgerCapacity){const nextCapacity=nextFireworkRowCapacity(ledgerCapacity,count,FIREWORK_RENDER_CAPACITY_LIMITS.ledgerRows,'Emission ledger'),next=new Float32Array(nextCapacity*8);emissionLedgerData=next;ledgerCapacity=nextCapacity;}let row=0;
    for(const p of records){if(p.kind==='smoke'||!(p.intensity>0&&maximumRGB(p.colour)>0))continue;const group=groups[indices.get(p.eventId)],o=row++*8;emissionLedgerData[o]=p.position[0];emissionLedgerData[o+1]=p.position[1];emissionLedgerData[o+2]=p.position[2];emissionLedgerData[o+3]=p.radius*p.radius/5;for(let c=0;c<3;c++){emissionLedgerData[o+4+c]=referenceRGB(p,c)*rawPerCandela;const value=emissionLedgerData[o+4+c];group.min[c]=Math.min(group.min[c],emissionLedgerData[o+c]);group.max[c]=Math.max(group.max[c],emissionLedgerData[o+c]);group.sumRawRGB[c]+=value;}emissionLedgerData[o+7]=group.index;group.count++;}
    if(emissionLedgerRecords!==records)emissionRecordGeneration++;emissionLedgerRecords=records;
    const frozenGroups=Object.freeze(groups.map(group=>Object.freeze({...group,min:Object.freeze(group.min),max:Object.freeze(group.max),sumRawRGB:Object.freeze(group.sumRawRGB),...(group.memberEventIds?{memberEventIds:Object.freeze(group.memberEventIds)}:{})})));
    // A grown backing buffer must not keep a later small source set outside
    // the existing 14000-row SH input domain. This view allocates no row data.
    const publishedCapacity=count<=capacity?capacity:ledgerCapacity,publishedData=publishedCapacity===ledgerCapacity?emissionLedgerData:emissionLedgerData.subarray(0,publishedCapacity*8);
    return emissionLedgerCache=Object.freeze({schema:'glass-atoll.emission-ledger.v1',version:++emissionLedgerVersion,recordGeneration:emissionRecordGeneration,time:simulation.time,count,stride:8,capacity:publishedCapacity,data:publishedData,groups:frozenGroups,rawPerCandela,units:'metres, isotropic emitter variance m2, current modulated raw RGB reference before camera/P/transmission',bufferLifetime:'Borrowed reusable Float32 buffer; valid until next getEmissionLedger call after physical record generation or rawPerCandela changes. Upload synchronously or copy.'});
  }
  function smokeLighting(p,eye,air,rawPerCandela,clusters){
    const ambient=rgbArray(air?.ambientIrradianceRGB),sun=rgbArray(air?.rawSunRGB);
    const out=ambient.map((v,c)=>(v+sun[c]*.22)*p.colour[c]/(4*Math.PI));
    const view=p.position.map((v,i)=>eye[i]-v),viewLength=Math.hypot(...view);
    for(const l of clusters){const delta=l.position.map((v,i)=>v-p.position[i]),d2=Math.max(l.radius*l.radius,...[delta.reduce((s,v)=>s+v*v,0)]),length=Math.sqrt(d2),mu=-delta.reduce((s,v,i)=>s+v*view[i],0)/Math.max(length*viewLength,1e-9),g=.32,phase=(1-g*g)/(4*Math.PI*(1+g*g-2*g*mu)**1.5);for(let c=0;c<3;c++)out[c]+=l.color[c]*l.referenceCandela*rawPerCandela/d2*phase*p.colour[c]*.72;}
    return out;
  }
  function estimateTrailSampling(camera,optics,width,height,shutter){
    const c=prepareSourceProjection(camera,{...optics,width,height,shutterSeconds:shutter},3.6e-5),b=sourceBoundOutput(),stats={scope:'CPU projected estimates; GPU branch validated by independent fixtures, not runtime readback',tails:0,clipped:0,adaptive:0,legacyFallback:0,reasons:{degenerate:0,globalBudget:0,localBudget:0},maximumN:0,maximumLocalBound:0,minimumStepPixels:.5,maximumStepSigma:.5,supportSigma:6,maxLocalSamplesPerLevel:128,maxGlobalSamples:65536};
    let vectorTails=0;
    for(const p of opticalRows(shutter,false)){if(!(p.stretch?.some(v=>v!==0)))continue;stats.tails++;if(p.vectorEmission)vectorTails++;if(!writeSourceBound(p,c,b)){stats.clipped++;continue;}const L=Math.hypot(...b.stretchPixels),S=Math.hypot(...b.shutterPixels),sigma=Math.sqrt(b.baseSigma2+(!p.vectorEmission&&S<=1?S*S/24:0));
      if(!(L>1e-4)){stats.legacyFallback++;stats.reasons.degenerate++;continue;}
      const ax=b.stretchPixels[0]/L,ay=b.stretchPixels[1]/L,n0=Math.floor(Math.max(7,L/(.5*Math.max(1,sigma))))+1,n1=n0+1,support=.5*(Math.abs(ax)+Math.abs(ay))+6*sigma+.02+((p.vectorEmission&&shutter>0)||S>1?.38729833462*Math.abs(b.shutterPixels[0]*ax+b.shutterPixels[1]*ay):0),local=Math.min(n1,Math.ceil(2*support*n1/L)+4);
      stats.maximumN=Math.max(stats.maximumN,n1);stats.maximumLocalBound=Math.max(stats.maximumLocalBound,local);
      if(n1>65536){stats.legacyFallback++;stats.reasons.globalBudget++;}else if(local>128){stats.legacyFallback++;stats.reasons.localBudget++;}else stats.adaptive++;
    }
    if(vectorTails)Object.assign(stats,{vectorTails,vectorTemporalBins:8,vectorJointKernel:'8 time-bin colour means, each with its shifted positive spatial kernel; not a separable mean-colour approximation'});return stats;
  }
  const sourceTransmissionScratch=new Float64Array(3);
  let lastSourceVisibility=null,lastSourceTransmission={backend:'none',reason:'awaiting-render'},sourceTransmissionRequest=0,sourceRayBuffers=null;
  // A prepared view owns only its CPU row/ray handoff. It never prepares GPU T.
  const preparedSourceViews=new WeakMap(),livePreparedSourceViews=new Set();let nextPreparedSourceView=0;
  function releasePreparedSourceView(state,reason){state.invalid=reason;for(const key of ['ordered','rays','snapshot','args','key','densityKey','clusters','eye','stats'])state[key]=null;livePreparedSourceViews.delete(state);}
  function invalidatePreparedSourceViews(reason){for(const state of livePreparedSourceViews)releasePreparedSourceView(state,reason);}
  function sourceViewArguments({camera,target=null,reflection=false,planeY=0,frame={},optics={},medium=null,legacySmoke=true}={}){
    if(!camera)throw new TypeError('Prepared source view requires a camera');
    const width=target?.width||optics.width||1,height=target?.height||optics.height||1,shutter=optics.shutterSeconds??1/120;
    return{camera,reflection,planeY,medium,legacySmoke,frameTime:frame.time??simulation.time,rawPerCandela:frame.rawPerCandela??3.6e-5,shutter,width,height,viewOptics:{...optics,width,height,dof:!reflection&&optics.dof,legacyShutterSeconds:reflection?0:shutter}};
  }
  function sourceViewKey(a){
    const c=a.camera,o=a.viewOptics;c.updateMatrixWorld();
    return[recordsGeneration,simulation.time,sourceVisibility,clusterModel,trailIntegration,quality.trailSegments,c,a.medium,a.legacySmoke,a.reflection,a.planeY,a.frameTime,a.rawPerCandela,a.shutter,a.width,a.height,o.focalMm??28,o.aperture??8,o.focusMetres??60,o.sensorHeightMm??24,o.dof,o.legacyShutterSeconds,resolveFirelightSigma(o.firelightSigmaPixels),c.near,c.position.x,c.position.y,c.position.z,...c.matrixWorld.elements,...c.matrixWorldInverse.elements,...c.projectionMatrix.elements];
  }
  function densityViewKey(snapshot){
    if(!snapshot||!Array.isArray(snapshot.packets)||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<0)throw new TypeError('Prepared view requires a revisioned committed medium snapshot');
    return[snapshot.schema,snapshot.revision,snapshot.time,snapshot.requestedTime,snapshot.tick,snapshot.pendingEmissions,snapshot.pendingWindEvents,...(snapshot.currentWind||[]),snapshot.profiles?.length,...(snapshot.profiles||[]).flatMap(p=>[p.id,...p.extinctionPerMassRGB,...p.singleScatteringAlbedoRGB]),snapshot.packets.length,...snapshot.packets.flatMap(p=>[p.id,p.profileId])];
  }
  const sameSourceViewKey=(a,b)=>a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
  function requirePreparedSourceView(handle,args){
    const state=preparedSourceViews.get(handle);
    if(!state||state.invalid||state.used||disposed)throw new RangeError('Unknown, stale, consumed or disposed prepared source view');
    if(!sameSourceViewKey(state.key,sourceViewKey(args)))throw new RangeError('Prepared source view camera/optics/source generation changed');
    if(args.medium){if(typeof args.medium.snapshot!=='function')throw new TypeError('Prepared source view medium requires snapshot');if(!sameSourceViewKey(state.densityKey,densityViewKey(args.medium.snapshot())))throw new RangeError('Prepared source view committed density changed');}
    return state;
  }
  function prepareSourceView(options){
    if(disposed)throw new Error('Cannot prepare disposed fireworks');if(livePreparedSourceViews.size>=4)throw new RangeError('At most four current unconsumed source views');
    const args=sourceViewArguments(options),key=sourceViewKey(args),batchRequested=!!args.medium;
    validatePoweredOpticalShutter(args.shutter,simulation.active.some(e=>e.effectProfile==='powered-bees-v1'));
    const rows=prepareSourceRows(args.camera,args.rawPerCandela,args.shutter,args.legacySmoke,args.reflection,args.planeY,args.viewOptics,batchRequested,true),snapshot=batchRequested?args.medium.snapshot():null,densityKey=batchRequested?densityViewKey(snapshot):null;
    const id=++nextPreparedSourceView,info=Object.freeze({schema:'glass-atoll.prepared-source-view.v1',id,count:rows.ordered.length,activeRayCount:rows.activeRayCount,recordsGeneration,time:simulation.time,frameTime:args.frameTime,densityRevision:snapshot?.revision??null,densityTime:snapshot?.time??null,densityRequestedTime:snapshot?.requestedTime??null,packetCount:snapshot?.packets.length??0,cameraKey:rows.eye.map(v=>Object.is(v,-0)?'-0':String(v)).join(','),reflection:args.reflection,planeY:args.planeY,width:args.width,height:args.height,rawPerCandela:args.rawPerCandela,shutterSeconds:args.shutter,legacyShutterSeconds:args.viewOptics.legacyShutterSeconds,sourceVisibility,legacySmoke:args.legacySmoke,transmissionRequested:batchRequested,sourceVersion:null,requestVersionAllocated:false,bufferPolicy:'Private original-double rays and original ordered optical rows; one real render consumes this view exactly once; no GPU prepare'});
    const handle=Object.freeze(Object.create(null)),state={...rows,id,args,key,snapshot,densityKey,info,invalid:null,used:false};preparedSourceViews.set(handle,state);livePreparedSourceViews.add(state);return handle;
  }
  function getPreparedSourceViewInfo(handle){const state=preparedSourceViews.get(handle);if(!state)throw new RangeError('Unknown prepared source view');return requirePreparedSourceView(handle,state.args).info;}
  function discardPreparedSourceView(handle){const state=preparedSourceViews.get(handle);if(!state)throw new RangeError('Unknown prepared source view');if(state.invalid||state.used)return false;releasePreparedSourceView(state,'discarded');return true;}

  function prepareSourceRows(camera,rawPerCandela,shutter,legacySmoke,reflection,planeY,optics,batchRequested,privateBuffers=false){
    camera.updateMatrixWorld();const eye=camera.position.toArray(),eligible=Array.from(opticalRows(shutter,legacySmoke)),clusters=getLightClusters();
    ensureOpticalCapacity(eligible.length);
    const stats={mode:sourceVisibility,inputRecords:eligible.length,luminousSources:0,depthCulled:0,quadCulled:0,conservativeRetained:0,mediumQueries:0,renderedRecords:0};
    let projection=null;
    if(sourceVisibility!=='none'){
      projection=prepareSourceProjection(camera,{...optics,shutterSeconds:shutter},rawPerCandela,uploadProjectionCache.get(camera));
      prepareFireworkDepthClip(projection);uploadProjectionCache.set(camera,projection);
    }
    const ordered=[];let vectorSources=0;
    for(const p of eligible){
      if(p.kind!=='smoke'){
        stats.luminousSources++;
        const reason=sourceVisibility==='none'?0:sourceVisibility==='depth'?(fireworkCentreDepthClipped(p.position,projection)?1:0):fireworkSourceClipReason(p,projection);
        if(reason===1){stats.depthCulled++;continue;}if(reason===2){stats.quadCulled++;continue;}if(reason===3&&sweptSourceVisibility&&fireworkSweepOutsideViewport(p,projection)){stats.worldSweepCulled=(stats.worldSweepCulled??0)+1;continue;}if(reason===3)stats.conservativeRetained++;
      }
      ordered.push({p,z:viewPosition.fromArray(p.position).applyMatrix4(camera.matrixWorldInverse).z});
      if(p.vectorEmission)vectorSources++;
    }
    ordered.sort((a,b)=>a.z-b.z);
    // CPU remains the default. Opt-in batch inputs preserve original world
    // doubles; raster attributes have their separate existing Float32 rounding.
    // A fresh per-fill request version disallows stale main/mirror reuse.
    let activeRayCount=0,rays=null;
    if(batchRequested){
      if(privateBuffers)rays={endpoints64:new Float64Array(ordered.length*3),origins64:new Float64Array(ordered.length*3),active:new Uint8Array(ordered.length)};
      else{if(!sourceRayBuffers||sourceRayBuffers.active.length<ordered.length){const rayCapacity=nextFireworkRowCapacity(sourceRayBuffers?.active.length??capacity,ordered.length,FIREWORK_RENDER_CAPACITY_LIMITS.opticalRows,'Source-ray');sourceRayBuffers={endpoints64:new Float64Array(rayCapacity*3),origins64:new Float64Array(rayCapacity*3),active:new Uint8Array(rayCapacity)};}rays=sourceRayBuffers;}
      for(let i=0;i<ordered.length;i++){
        const p=ordered[i].p,o=i*3;rays.endpoints64.set(p.position,o);let active=p.kind!=='smoke';
        if(reflection&&active){
          const dy=p.position[1]-eye[1],t=(planeY-eye[1])/dy;
          if(!Number.isFinite(t)||t<0||t>1){active=false;rays.origins64.set(eye,o);}
          else for(let c=0;c<3;c++)rays.origins64[o+c]=eye[c]+(p.position[c]-eye[c])*t;
        }else rays.origins64.set(eye,o);
        rays.active[i]=active?1:0;if(active)activeRayCount++;
      }
    }
    return{ordered,stats,eye,clusters,vectorSources,activeRayCount,rays};
  }
  function fillRecords(camera,air,rawPerCandela,shutter,medium=null,legacySmoke=true,reflection=false,planeY=0,optics={},transmissionBatch=null,target=null,prepared=null){
    const batchRequested=!!transmissionBatch&&!!medium;
    const {ordered,stats,eye,clusters,vectorSources,activeRayCount,rays}=prepared??prepareSourceRows(camera,rawPerCandela,shutter,legacySmoke,reflection,planeY,optics,batchRequested);
    uniforms.uSourceTransmissionEnabled.value=0;uniforms.uSourceTransmission.value=dummy;uniforms.uSourceTransmissionSize.value.set(1,1);
    for(let i=0;i<ordered.length;i++){
      const p=ordered[i].p,smoke=p.kind==='smoke',light=smoke?smokeLighting(p,eye,air,rawPerCandela,clusters):[0,0,0];
      arrays.centre.set(p.position,i*3);arrays.velocity.set(p.rasterVelocity??p.velocity??[0,0,0],i*3);arrays.stretch.set(p.stretch||[0,0,0],i*3);arrays.colour.set(p.vectorEmission?[1,1,1]:p.colour,i*3);arrays.smokeLight.set(light,i*3);arrays.shape.set([smoke?1:0,p.radius,p.unmodulatedIntensity??p.intensity??0,p.vectorEmission?-1:p.opticalDepth||0],i*4);
      if(medium&&!smoke&&!batchRequested){stats.mediumQueries++;const T=typeof medium.writeTransmission==='function'?medium.writeTransmission(eye,p.position,sourceTransmissionScratch,{reflection,planeY}):medium.transmission(eye,p.position,{reflection,planeY});for(let c=0;c<3;c++)arrays.colour[i*3+c]*=T[c];}
      if(p.vectorEmission){for(let k=0;k<24;k++)arrays['temporal'+Math.floor(k/4)][i*4+k%4]=p.rgbTaps[k];}
      else{const legacyShutter=optics.legacyShutterSeconds??shutter;
        // A zero-duration exposure samples one physical instant in every bin.
        // Reflections use it for scalar sources; retain all eight shader inputs.
        if(legacyShutter===0){const weight=!p.sourceBody?1:bodyEmissionEnvelope(p.sourceBody,p.sourceAge);arrays.temporal0.fill(weight,i*4,i*4+4);arrays.temporal1.fill(weight,i*4,i*4+4);}
        else for(let k=0;k<8;k++){const age=p.sourceAge+((k+.5)/8-.5)*legacyShutter,body=p.sourceBody;const weight=!body?1:bodyEmissionEnvelope(body,age);arrays[k<4?'temporal0':'temporal1'][i*4+(k%4)]=weight;}
        for(let k=2;k<6;k++)arrays['temporal'+k].fill(0,i*4,i*4+4);}
    }
    let batchResult=null,batchFailure=null,snapshot=null,requestVersion=null;
    const cameraKey=eye.map(v=>Object.is(v,-0)?'-0':String(v)).join(',');
    if(batchRequested&&activeRayCount>0){
      try{
        if(typeof transmissionBatch.prepare!=='function')throw new TypeError('Source transmission batch requires synchronous prepare');
        if(typeof medium.snapshot!=='function')throw new TypeError('Source transmission batch requires the committed medium snapshot');
        snapshot=prepared?prepared.snapshot:medium.snapshot();
        if(!snapshot||!Array.isArray(snapshot.packets)||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<0)throw new TypeError('Source transmission requires a revisioned committed density snapshot');
        if(sourceTransmissionRequest>=Number.MAX_SAFE_INTEGER)throw new RangeError('Source transmission request version exhausted');
        requestVersion=++sourceTransmissionRequest;
        batchResult=transmissionBatch.prepare({snapshot,count:ordered.length,...rays,eye,sourceVersion:requestVersion});
        if(typeof batchResult?.then==='function'){batchResult.catch?.(()=>{});throw new TypeError('Source transmission prepare must be synchronous');}
        if(batchResult?.effective){
          const valid=batchResult.texture?.isTexture===true&&Number.isSafeInteger(batchResult.width)&&batchResult.width>0&&batchResult.width<=2147483647&&Number.isSafeInteger(batchResult.height)&&batchResult.height>0&&batchResult.height<=2147483647&&Number.isSafeInteger(batchResult.width*batchResult.height)&&batchResult.width*batchResult.height>=ordered.length&&batchResult.count===ordered.length&&batchResult.sourceVersion===requestVersion&&batchResult.densityRevision===snapshot.revision&&batchResult.cameraKey===cameraKey;
          if(!valid)batchFailure='stale-or-invalid-batch-output';
          else{
            const T=batchResult.texture;if(target?.texture===T||target?.depthTexture===T||target?.textures?.includes(T))throw new Error('Source transmission texture may not be attached to its draw target');
            transmissionBatch.assertReadableFrom?.(target);uniforms.uSourceTransmission.value=T;uniforms.uSourceTransmissionSize.value.set(batchResult.width,batchResult.height);uniforms.uSourceTransmissionEnabled.value=1;
          }
        }
      }catch(error){batchFailure=String(error?.message||error).slice(0,256);}
    }
    const gpuEffective=uniforms.uSourceTransmissionEnabled.value===1;
    if(prepared&&batchRequested&&activeRayCount>0&&!gpuEffective)throw new Error('Prepared source view requires complete matching GPU transmission: '+(batchFailure||batchResult?.reason||'unavailable'));
    if(batchRequested&&!gpuEffective&&!prepared){
      // Exact original CPU query order, original double endpoint and original
      // reflected-water start policy. Never retain a previous batch texture.
      for(let i=0;i<ordered.length;i++){
        const p=ordered[i].p;if(p.kind==='smoke')continue;
        stats.mediumQueries++;const T=typeof medium.writeTransmission==='function'?medium.writeTransmission(eye,p.position,sourceTransmissionScratch,{reflection,planeY}):medium.transmission(eye,p.position,{reflection,planeY});for(let c=0;c<3;c++)arrays.colour[i*3+c]*=T[c];
      }
    }
    lastSourceTransmission={backend:gpuEffective?'gpu':prepared&&batchRequested&&activeRayCount===0?'none':medium?'cpu':'none',requested:batchRequested,effective:gpuEffective,reason:gpuEffective?(batchResult.reason||'ready'):batchFailure||batchResult?.reason||(batchRequested?(activeRayCount>0?'batch-unavailable':'no-active-source-rays'):medium?'batch-disabled':'no-medium'),mediumQueries:stats.mediumQueries,instances:ordered.length,activeRayCount,sourceVersion:requestVersion,recordsGeneration,densityRevision:snapshot?.revision??null,cameraKey,reflection,...(vectorSources?{vectorSources,transmissionTimePolicy:'one T per source optical midpoint anchor; T(t) is not shutter-integrated'}:{})};
    stats.renderedRecords=ordered.length;lastSourceVisibility=stats;
    geometry.instanceCount=ordered.length;for(const [name,size]of Object.entries(attributes)){const attribute=geometry.getAttribute('a'+name[0].toUpperCase()+name.slice(1));attribute.clearUpdateRanges();attribute.addUpdateRange(0,ordered.length*size);attribute.needsUpdate=true;}
    return ordered.length;
  }
  // Read-only kinematic view for an optional bounded smoke source adapter.
  // This never samples a future point, advances simulation/RNG, or reads light I.
  const smokeDescriptorCache=new WeakMap();let smokeDescribeCalls=0,smokeSampleCalls=0,smokeReleases=0;
  let smokeCombustionCache;
  let smokeBodyIndexCache;
  const smokeVector=value=>Object.freeze(Array.from(value));
  function smokeActiveEvent(id){const event=simulation.active.find(e=>e.id===id);if(!event)throw new RangeError('Smoke source descriptor is no longer active: '+id);const first=simulation.windTimeline[0];if(first&&first.time>event.time+1e-10)throw new RangeError('Smoke source wind history was pruned before its causal launch');return event;}
  const smokeSourceProvider=Object.freeze({
    get time(){return simulation.time;},
    describeCombustion(eventId){
      if(disposed)throw new Error('Cannot query disposed combustion metadata');
      const event=smokeActiveEvent(eventId);let descriptor=smokeCombustionCache?.get(event);if(descriptor)return descriptor;
      descriptor=describeFireworkCombustion(event);(smokeCombustionCache??=new WeakMap()).set(event,descriptor);return descriptor;
    },
    describe(eventId){
      const event=smokeActiveEvent(eventId);smokeDescribeCalls++;let descriptor=smokeDescriptorCache.get(event);if(descriptor)return descriptor;
      const roots=event.heads.filter(b=>!b.parentBody).map(b=>Object.freeze({id:b.id,birth:b.birth,life:b.life,baseVelocity:smokeVector(b.baseVelocity),patternPart:b.patternPart??null,...(b.effectProfile===RADIANT_PROFILE_ID?{radianceProfile:b.radianceProfile,nativeReferenceI0:b.intensity,derivedReferenceI0:b.emissionReferenceI0,trailRecipeId:b.trailProfile.recipeId,trailDurationSeconds:b.trailProfile.durationSeconds}:{}),...(b.thrustProfile?{motionProfile:motionDescriptor(b)}:{})}));
      const frame=event.patternFrame?Object.freeze({kind:event.patternFrame.kind,right:smokeVector(event.patternFrame.right),up:smokeVector(event.patternFrame.up),normal:smokeVector(event.patternFrame.normal)}):null;
      descriptor=Object.freeze({schema:'glass-atoll.smoke-kinematic-descriptor.v1',id:event.id,type:event.type,seed:event.seed,...(event.effectProfile==='powered-bees-v1'?{effectProfile:event.effectProfile}:{}),...(event.effectProfile==='three-heart-scale120-v1'?{effectProfile:event.effectProfile,radialScale:event.layerProfile.radialScale}:{}),...(event.effectProfile===RADIANT_PROFILE_ID?{effectProfile:event.effectProfile,radialScale:event.layerProfile.radialScale,radianceProfile:event.layerProfile.radianceProfile,nativeReferencePeakBudget:event.layerProfile.nativeReferencePeakBudget,referencePeakBudget:event.layerProfile.referencePeakBudget}:{}),ground:!!event.definition.ground,time:event.time,burstTime:event.burstTime,endTime:event.endTime,baselineVelocity:smokeVector(event.baselineBurst.velocity),shapeFrame:frame,roots:Object.freeze(roots),sourceEvents:Object.freeze(event.events.map(e=>Object.freeze({kind:e.kind,time:e.time,seed:e.seed}))) });
      smokeDescriptorCache.set(event,descriptor);return descriptor;
    },
    sample(eventId,{kind,time,bodyId,eventKind,seed}={}){
      if(!Number.isFinite(time)||time>simulation.time)throw new RangeError('Smoke source sample must be finite and already born at the current simulation time');
      const event=smokeActiveEvent(eventId);if(time<event.time)throw new RangeError('Smoke source sample predates its causal launch');let position;
      if(kind==='root'){const body=event.heads.find(b=>!b.parentBody&&b.id===bodyId);if(!body||time<body.birth||time>=body.birth+body.life)throw new RangeError('Smoke source requires an existing burning root at the requested birth time');position=sampleBody(body,time,simulation.windTimeline).position;}
      else if(kind==='event'){const source=event.events.find(e=>e.kind===eventKind&&e.time===time&&(seed===undefined||seed===e.seed));if(!source)throw new RangeError('Smoke source event clock/seed does not match its active descriptor');position=source.position;}
      else throw new RangeError('Smoke source sample kind must be root or event');
      if(!position.every(Number.isFinite))throw new RangeError('Smoke source point is not finite');smokeSampleCalls++;return Object.freeze({eventId,time,position:smokeVector(position)});
    },
    sampleBody(eventId,{bodyId,time}={}){
      if(disposed)throw new Error('Cannot sample disposed combustion bodies');
      if(!Number.isSafeInteger(bodyId)||bodyId<0||!Number.isFinite(time)||time>simulation.time)throw new RangeError('Combustion body sampling requires a nonnegative native body ID and finite past/current time');
      const event=smokeActiveEvent(eventId);let index=smokeBodyIndexCache?.get(event);
      if(!index){index=new Map(event.heads.map(body=>[body.id,body]));(smokeBodyIndexCache??=new WeakMap()).set(event,index);}
      const body=index.get(bodyId);if(!body||time<body.birth||time>=body.birth+body.life)throw new RangeError('Combustion source requires an existing burning native body at the requested time');
      const position=sampleBody(body,time,simulation.windTimeline).position;if(!position.every(Number.isFinite))throw new RangeError('Combustion source point is not finite');
      return Object.freeze({eventId,bodyId,time,position:smokeVector(position)});
    },
    release(eventId){const event=simulation.active.find(e=>e.id===eventId);if(event)smokeDescriptorCache.delete(event);smokeReleases++;},
    diagnostics(){return{describeCalls:smokeDescribeCalls,sampleCalls:smokeSampleCalls,releases:smokeReleases,strongEventArchives:0,positionPolicy:'past/current exact physical time only; active event plus unpruned causal wind required'};}
  });
  let lastVisualLaunch=null;
  function updateLauncherAim(){const pose=simulation.lastLaunch;if(!pose||pose.id===lastVisualLaunch)return;lastVisualLaunch=pose.id;const az=pose.azimuth*Math.PI/180,el=pose.elevation*Math.PI/180,axis=new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el));aim.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);}
  const api={rig,effectsScene,types:FIREWORK_TYPES,smokeSourceProvider,
    clearLegacySmoke(){for(const event of simulation.active)hiddenLegacySmokeEvents.add(event.id);updateRecords();},
    prepareSourceView,getPreparedSourceViewInfo,discardPreparedSourceView,
    get sourceVisibility(){return sourceVisibility;},
    setSourceVisibility(value){const next=validateSourceVisibility(value);if(next!==sourceVisibility)invalidatePreparedSourceViews('source-visibility-change');sourceVisibility=next;return sourceVisibility;},
    get tailColourMode(){return tailColourMode;},
    get photometryMode(){return photometryMode;},
    get thermalEmittingRadiusMm(){return thermalEmittingRadiusMm;},
    configure(patch={}){if(patch.automaticDirection!==undefined)patch={...patch,autoDirection:patch.automaticDirection};const nextClusterModel=patch.clusterModel===undefined?clusterModel:validateClusterModel(patch.clusterModel),nextTrailIntegration=patch.trailIntegration===undefined?trailIntegration:validateTrailIntegration(patch.trailIntegration),nextTailColourMode=patch.tailColourMode===undefined?tailColourMode:validateTailColourMode(patch.tailColourMode),nextPhotometryMode=patch.photometryMode===undefined?photometryMode:validatePhotometryMode(patch.photometryMode),nextThermalRadius=patch.thermalEmittingRadiusMm===undefined?thermalEmittingRadiusMm:validateThermalRadius(patch.thermalEmittingRadiusMm),{clusterModel:ignoredClusterModel,trailIntegration:ignoredTrailIntegration,tailColourMode:ignoredTailColourMode,photometryMode:ignoredPhotometryMode,thermalEmittingRadiusMm:ignoredThermalRadius,...physicsPatch}=patch;if(nextPhotometryMode!=='reference'&&((physicsPatch.effectProfile??simulation.settings.effectProfile??'legacy')!=='legacy'||simulation.active.some(e=>e.effectProfile)))throw new RangeError('Layer profiles require reference photometry; greybody is a separate experiment');const state=simulation.configure(physicsPatch);invalidatePreparedSourceViews('configure');if(patch.tailColourMode!==undefined)tailColourModeRequested=true;if(patch.photometryMode!==undefined||patch.thermalEmittingRadiusMm!==undefined)photometryRequested=true;const colourChanged=nextTailColourMode!==tailColourMode,photometryChanged=nextPhotometryMode!==photometryMode||nextThermalRadius!==thermalEmittingRadiusMm;tailColourMode=nextTailColourMode;photometryMode=nextPhotometryMode;thermalEmittingRadiusMm=nextThermalRadius;if(photometryChanged)thermalBodyScale=photometryMode==='thermal-greybody'?thermalGreybodyCandela(thermalEmittingRadiusMm)/THERMAL_GREYBODY_PROFILE.referenceAreaCandela:1;if(colourChanged||photometryChanged)updateRecords();if(nextTrailIntegration!==trailIntegration)lastTrailSampling=null;if(patch.trailIntegration!==undefined)trailIntegrationRequested=true;trailIntegration=nextTrailIntegration;uniforms.uTrailAdaptive.value=trailIntegration==='adaptive'?1:0;if(nextClusterModel!==clusterModel){clusterModel=nextClusterModel;clusterCache=null;boundCache=null;}const az=state.autoDirection?Math.atan2(base[0],-base[2]):state.azimuth*Math.PI/180,axis=new THREE.Vector3(Math.sin(az)*Math.cos(state.elevation*Math.PI/180),Math.sin(state.elevation*Math.PI/180),-Math.cos(az)*Math.cos(state.elevation*Math.PI/180));aim.rotation.set(0,0,0);aim.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);launchOrigin[0]=base[0]+axis.x*.66;launchOrigin[1]=base[1]+.17+axis.y*.66;launchOrigin[2]=base[2]+axis.z*.66;return{...state,clusterModel,...(trailIntegration==='adaptive'?{trailIntegration}: {}),...(tailColourMode==='cooling'?{tailColourMode}: {}),...(photometryMode==='thermal-greybody'?{photometryMode,thermalEmittingRadiusMm}: {})};},
    launch(options={}){if(photometryMode!=='reference'&&(options.effectProfile??simulation.settings.effectProfile??'legacy')!=='legacy')throw new RangeError('Layer profiles require reference photometry');const result=simulation.launch(options);updateLauncherAim();updateRecords();return result;},
    launchRandom(options){const result=simulation.launchRandom(options);updateLauncherAim();updateRecords();return result;},stop(){simulation.stop();},
    update({time,dt,windVector}={}){simulation.update({time,windVector});updateLauncherAim();updateRecords();},
    drainEvents:()=>simulation.drainEvents(),
    getBounds(options={}){
      if(!simulation.active.length)return{centre:[...base],center:[...base],radius:2,min:base.map(x=>x-1),max:base.map(x=>x+1),active:false};
      const wind=simulation.windTimeline.at(-1).wind,poweredEvents=simulation.active.filter(e=>e.effectProfile==='powered-bees-v1');
      let key=Math.floor(simulation.time*2)+'|'+simulation.active.map(e=>e.id).join(',')+'|'+wind.join(','),poweredWind=null;
      if(poweredEvents.length){
        const minimum=[0,0,0],maximum=[0,0,0],identities=[];
        for(const knot of simulation.windTimeline)for(let c=0;c<3;c++){minimum[c]=Math.min(minimum[c],knot.wind[c]);maximum[c]=Math.max(maximum[c],knot.wind[c]);}
        for(const event of poweredEvents)for(const body of event.heads)if(body.thrustProfile){if(!boundsThrustIdentities.has(body.thrustProfile))boundsThrustIdentities.set(body.thrustProfile,++boundsNextThrustIdentity);identities.push(boundsThrustIdentities.get(body.thrustProfile));}
        poweredWind={min:minimum,max:maximum};key+='|powered:'+identities.join(',')+'|windRange:'+minimum.join(',')+'/'+maximum.join(',');
      }
      const scaledEvents=simulation.active.filter(e=>e.effectProfile==='three-heart-scale120-v1'||e.effectProfile===RADIANT_PROFILE_ID);let scaledWind=null,scaledShutter=null;
      if(scaledEvents.length){
        scaledShutter=options.shutterSeconds??1;if(!Number.isFinite(scaledShutter)||scaledShutter<0||scaledShutter>1)throw new RangeError('Scaled bounds shutter requires0..1 seconds');
        const minimum=[0,0,0],maximum=[0,0,0];for(const knot of simulation.windTimeline)for(let c=0;c<3;c++){minimum[c]=Math.min(minimum[c],knot.wind[c]);maximum[c]=Math.max(maximum[c],knot.wind[c]);}
        scaledWind={min:minimum,max:maximum};key+='|scaled:'+scaledEvents.map(e=>e.effectProfile===RADIANT_PROFILE_ID?RADIANT_PROFILE_ID+':'+e.layerProfile.radialScale.alpha:e.layerProfile.radialScale.alpha).join(',')+'|shutter:'+scaledShutter+'|scaledWindRange:'+minimum.join(',')+'/'+maximum.join(',');
      }
      const complexEvents=simulation.active.filter(e=>isComplexFirework(e.type));let complexWind=null,complexShutter=null;
      if(complexEvents.length){complexShutter=options.shutterSeconds??1;if(!Number.isFinite(complexShutter)||complexShutter<0||complexShutter>1)throw new RangeError('Display bounds shutter requires0..1 seconds');const minimum=[0,0,0],maximum=[0,0,0];for(const knot of simulation.windTimeline)for(let c=0;c<3;c++){minimum[c]=Math.min(minimum[c],knot.wind[c]);maximum[c]=Math.max(maximum[c],knot.wind[c]);}complexWind={min:minimum,max:maximum};key+='|display:'+complexShutter+'|windRange:'+minimum.join(',')+'/'+maximum.join(',');}
      if(key===boundsKey)return boundsCache;
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],include=(p,pad=8)=>{for(let c=0;c<3;c++){min[c]=Math.min(min[c],p[c]-pad);max[c]=Math.max(max[c],p[c]+pad);}};
      const generation=++boundsSampleGeneration,sameVector=(a,b)=>a===undefined?b===undefined:b!==undefined&&a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2];
      function pastSamples(b){
        let cache=boundsPastSamples.get(b);if(cache?.generation===generation)return cache;
        const parent=b.parentBody?pastSamples(b.parentBody):null,parentVersion=parent?.version||0;
        // resolveBurst can replace a future birth pose on each wind update.
        // Compare its values (and inherited parent version), never array identity.
        if(!cache||cache.birth!==b.birth||cache.life!==b.life||cache.drag!==b.drag||cache.gravity!==b.gravity||cache.thrustProfile!==b.thrustProfile||cache.parent!==b.parentBody||cache.parentVersion!==parentVersion||!sameVector(cache.position,b.position)||!sameVector(cache.velocity,b.velocity)||!sameVector(cache.velocityDelta,b.velocityDelta)){
          cache={birth:b.birth,life:b.life,drag:b.drag,gravity:b.gravity,thrustProfile:b.thrustProfile,parent:b.parentBody,parentVersion,position:b.position.slice(),velocity:b.velocity.slice(),velocityDelta:b.velocityDelta?.slice(),version:(cache?.version||0)+1,positions:new Array(17)};boundsPastSamples.set(b,cache);
        }
        cache.generation=generation;return cache;
      }
      for(const e of simulation.active){include(e.origin,2);for(const b of [...(e.rocket?[e.rocket]:[]),...e.heads,...(e.opticalFlashes??[])]){const cache=simulation.time>=b.birth?pastSamples(b):null;for(let j=0;j<=16;j++){
          const t=b.birth+b.life*j/16,p=t>=b.birth&&t<=simulation.time?(cache.positions[j]??=sampleBody(b,t,simulation.windTimeline).position):sampleBody(b,t,simulation.windTimeline).position;if(p[1]>0)include(p);
        }}
        include(e.burstPosition,18);include(e.burstPosition.map((v,c)=>v+wind[c]*9.8+(c===1?5:0)),18);
      }
      const poweredAnalytic=[];
      for(const event of poweredEvents){
        if(event.heightInfo.inputMode!=='definition-rise')throw new RangeError('Powered live analytic forecast requires definition-rise apex flight');
        // The launch is already jittered: use its actual muzzle/axis, no second
        // cone jitter, and every committed wind component rather than only now.
        const envelope=getFireworkShowEnvelope({type:event.type,effectProfile:event.effectProfile,starDragModel:'bounded-descent',origin:event.origin,muzzleOffsetMetres:0,azimuth:event.azimuth,elevation:event.elevation,launchSpreadDegrees:0,burstTiltDegrees:0,burstRollDegrees:0,wind:poweredWind,shutterSeconds:1/60});
        for(let c=0;c<3;c++){min[c]=Math.min(min[c],envelope.min[c]);max[c]=Math.max(max[c],envelope.max[c]);}
        poweredAnalytic.push({eventId:event.id,effectProfile:event.effectProfile,min:envelope.min,max:envelope.max,windRanges:envelope.limits.windRanges,maximumShutterSeconds:1/60});
      }
      const scaledAnalytic=[];
      for(const event of scaledEvents){
        const envelope=getScaledFireworkLiveEnvelope(event,{windRanges:scaledWind,shutterSeconds:scaledShutter});
        for(let c=0;c<3;c++){min[c]=Math.min(min[c],envelope.min[c]);max[c]=Math.max(max[c],envelope.max[c]);}
        scaledAnalytic.push({eventId:event.id,effectProfile:event.effectProfile,min:envelope.min,max:envelope.max,limits:envelope.limits,coverage:envelope.coverage,limitations:envelope.limitations});
      }
      const complexAnalytic=[];
      if(complexEvents.length){const signature=[complexShutter,...complexWind.min,...complexWind.max];for(const event of complexEvents){const mode=event.heightInfo.inputMode,admitted=mode==='definition-rise'||event.definition.ground&&mode==='fixed-ground-kinematics';if(!admitted){complexAnalytic.push({eventId:event.id,type:event.type,covered:false,reason:'explicit-height/timed display flight retains sampled forecast only'});continue;}let cached=complexEnvelopeCache.get(event);if(!cached||!sameSourceViewKey(cached.signature,signature)){const envelope=getFireworkShowEnvelope({type:event.type,origin:event.origin,muzzleOffsetMetres:0,azimuth:event.azimuth,elevation:event.elevation,launchSpreadDegrees:0,burstTiltDegrees:0,burstRollDegrees:0,starDragModel:'bounded-descent',wind:complexWind,shutterSeconds:complexShutter});cached={signature,envelope};complexEnvelopeCache.set(event,cached);}const envelope=cached.envelope;for(let c=0;c<3;c++){min[c]=Math.min(min[c],envelope.min[c]);max[c]=Math.max(max[c],envelope.max[c]);}complexAnalytic.push({eventId:event.id,type:event.type,covered:true,min:envelope.min,max:envelope.max,limits:envelope.limits});}}
      min[1]=Math.max(0,min[1]);boundsKey=key;const centre=min.map((v,c)=>(v+max[c])*.5);return boundsCache={min,max,centre,center:centre,radius:Math.hypot(...max.map((v,c)=>(v-min[c])*.5)),active:true,predicted:true,model:complexAnalytic.some(e=>e.covered)?'Native sampled/smoke forecast union authored complex-family source, motor, tail and shutter enclosure; full committed wind ranges':scaledEvents.length?'Native sampled/smoke forecast union continuous scaled actual-launch/fuse/source/tail/stretch/shutter enclosure; full committed wind ranges and compiled19*alpha relation':poweredEvents.length?'Native sampled/smoke forecast union admitted powered analytic source/tail/stretch/shutter enclosure; full committed wind ranges; maximum1/60s shutter':'16-point analytic trajectory forecast at current wind +8m margin; 2Hz cache; smoke envelope',...(poweredEvents.length?{poweredAnalytic}: {}),...(scaledEvents.length?{scaledAnalytic}: {}),...(complexEvents.length?{complexAnalytic}: {})};
    },
    getLightClusters,getReceiverLightClusters,getEmissionLedger,
    getFramingSources({shutterSeconds=1/120}={}){if(disposed)throw new Error('Cannot query disposed framing sources');const result=[];for(const p of opticalRows(shutterSeconds,false)){let intensity=p.intensity,colour=p.colour;if(p.vectorEmission){const rgb=[0,0,0];for(let k=0;k<8;k++)for(let c=0;c<3;c++)rgb[c]+=p.rgbTaps[k*3+c]/8;intensity=Y(rgb);colour=intensity>0?rgb.map(v=>v/intensity):[0,0,0];}if(!(intensity>0&&maximumRGB(colour)>0))continue;result.push(Object.freeze({eventId:p.eventId,position:Object.freeze([...p.position]),intensity,colour:Object.freeze([...colour]),radius:p.radius,stretch:Object.freeze([...(p.stretch||[0,0,0])]),...(p.vectorEmission?{viewExposure:p.viewExposure,...(p.rasterVelocity?{velocity:Object.freeze([...p.velocity]),rasterVelocity:Object.freeze([...p.rasterVelocity]),rasterExposureSeconds:p.rasterExposureSeconds,contactSupport:p.contactSupport}:{})}: {})}));}return Object.freeze(result);},
    getRadianceBound({camera,optics={},rawPerCandela=3.6e-5,onSourceBound=null}={}){return withWindResponseMemo(simulation.windTimeline,()=>{
      if(onSourceBound!==null&&typeof onSourceBound!=='function')throw new TypeError('onSourceBound must be a function or null');
      if(!camera)return{maximumRawRadiance:records.reduce((s,p)=>s+(p.maximumReferenceRGB?maximumRGB(p.maximumReferenceRGB):(p.unmodulatedIntensity??p.intensity??0)*Math.max(...p.colour))/Math.max(Math.PI*p.radius*p.radius,1e-8)*rawPerCandela*1.02,0),method:'authored spherical surface reference only; projected Gaussian budget requires camera',conservative:false,requiresCamera:true};
      camera.updateMatrixWorld();const w=optics.width||1200,h=optics.height||900,bins=radianceBins;bins.fill(0);let global=0,maxChannel=0,visible=0,nearFallback=0,kernelOutside=0,quadOutside=0,sweepOutside=0,traceOrdinal=0;
      const projection=prepareSourceProjection(camera,optics,rawPerCandela,sourceProjectionCache.get(camera));prepareFireworkDepthClip(projection);sourceProjectionCache.set(camera,projection);const bound=sourceBoundScratch;
      for(const p of opticalRows(optics.shutterSeconds??1/120,false)){const colourMaximum=maximumRGB(p.colour),maximumReference=p.maximumReferenceRGB?maximumRGB(p.maximumReferenceRGB):(p.unmodulatedIntensity??p.intensity)*colourMaximum;global+=maximumReference/(Math.PI*p.radius*p.radius)*1.02*rawPerCandela;maxChannel=Math.max(maxChannel,p.maximumReferenceRGB?(p.unmodulatedIntensity>0?maximumReference/p.unmodulatedIntensity:0):colourMaximum);const projected=writeSourceBound(p,projection,bound,colourMaximum);if(onSourceBound){const vector=v=>Object.freeze(Array.from(v||boundZero)),source=Object.freeze({index:traceOrdinal++,kind:p.kind,eventId:p.eventId??null,bodyId:p.sourceBody?.id??null,patternPart:p.sourceBody?.patternPart??null,position:vector(p.position),positionInputFloat32:p.position instanceof Float32Array,velocity:vector(p.velocity),stretch:vector(p.stretch),colour:vector(p.colour),radius:p.radius,intensity:p.intensity,unmodulatedIntensity:p.unmodulatedIntensity??p.intensity,sourceAge:p.sourceAge??null,...(p.vectorEmission?{vectorEmission:true,maximumReferenceRGB:vector(p.maximumReferenceRGB),viewExposure:p.viewExposure,layerId:p.sourceBody.layerId,...(p.rasterVelocity?{rasterVelocity:vector(p.rasterVelocity),rasterExposureSeconds:p.rasterExposureSeconds,contactSupport:p.contactSupport}:{})}: {})}),output=Object.freeze(projected?{...bound,rect:vector(bound.rect),shutterPixels:vector(bound.shutterPixels),stretchPixels:vector(bound.stretchPixels)}:{peak:0,visible:false,nearPlaneFallback:false,rect:vector(bound.rect)});onSourceBound(Object.freeze({source,bound:output,projected:!!projected}));}if(!projected||!bound.visible||fireworkCentreDepthClipped(p.position,projection))continue;if(optics.kernelBudgetFloat32===true&&p.kind!=='smoke'&&(bound.nearPlaneFallback||Math.max(Math.abs(bound.stretchPixels[0]),Math.abs(bound.stretchPixels[1]),Math.abs(bound.shutterPixels[0]),Math.abs(bound.shutterPixels[1]))>4*Math.max(w,h))){
          // Match the existing upload's complete-quad rejection first. A huge
          // quad can still reach the viewport between sparse legacy taps;
          // only those remaining cases need the kernel-support interval test.
          if(fireworkSourceClipReason(p,projection)===2){quadOutside++;continue;}
          if(sweptSourceVisibility&&fireworkSweepOutsideViewport(p,projection)){sweepOutside++;continue;}
          if(fireworkKernelOutsideViewport(p,projection,trailIntegration==='adaptive')){kernelOutside++;continue;}
        }visible++;nearFallback+=Number(bound.nearPlaneFallback);
        const r=bound.rect,x0=Math.max(0,Math.floor(r[0]/w*32)),x1=Math.min(31,Math.floor(r[2]/w*32)),y0=Math.max(0,Math.floor(r[1]/h*32)),y1=Math.min(31,Math.floor(r[3]/h*32));
        for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++)bins[yy*32+xx]+=bound.peak;
      }
      // Smoke and rapidly illuminated receivers are separately budgeted by
      // root from the same physical clusters. This bound describes sources.
      const clusters=getLightClusters();let smokeSum=0,smokeDepth=0,binPeak=0;
      for(const l of clusters)smokeSum+=maximumRGB(l.color)*l.referenceCandela*rawPerCandela/(l.radius*l.radius)*.24;
      for(const p of records)if(p.kind==='smoke')smokeDepth+=p.opticalDepth;
      for(let i=0;i<bins.length;i++)binPeak=Math.max(binPeak,bins[i]);
      const smokeBound=smokeSum*Math.min(1,smokeDepth),peak=binPeak*1.2+smokeBound;return boundCache={maximumRawRadiance:peak,maxRawRadiance:peak,globalFiniteSurfaceCeiling:global,globalReferenceOnly:true,ownSmokeRawBound:smokeBound,maximumEmissionRGBChannel:maxChannel,visibleSources:visible,nearPlaneFallbackSources:nearFallback,...(optics.kernelBudgetFloat32===true?{kernelOutsideBudgetSources:kernelOutside,quadOutsideBudgetSources:quadOutside,...(sweptSourceVisibility?{worldSweepOutsideBudgetSources:sweepOutside}:{}),kernelBudgetPolicy:'Float32 legacy8 or proven adaptive-index fallback; saturated taps outside only'}:{}),method:'32x32 conservative source overlap bins; actual pixel-integrated Gaussian peak and projected shutter/stretch extent; near crossings cover viewport; legacy globalFiniteSurfaceCeiling is a spherical reference only; root separately budgets ambient/air/receivers',conservative:true};
    });},
    render({renderer,target,camera,opaqueDepth=null,reflection=false,planeY=0,frame={},optics={},air={},medium=null,legacySmoke=true,transmissionBatch=null,preparedView=null}={}){
      const firelightSigmaPixels=resolveFirelightSigma(optics.firelightSigmaPixels);
      let prepared=null;
      if(preparedView!==null){const args=sourceViewArguments({camera,target,reflection,planeY,frame,optics,medium,legacySmoke});prepared=requirePreparedSourceView(preparedView,args);if(!!transmissionBatch!==!!medium)throw new RangeError('Prepared medium view requires its actual transmission batch');prepared.used=true;livePreparedSourceViews.delete(prepared);}
      try{
      if(disposed||!records.length){
        const reason=disposed?'disposed':'no-source-records';
        recordViewRender({instances:0,reflection,time:simulation.time,rendered:false,skipped:true,storageEV:frame.storageEV??Math.log2(frame.sceneScale??1),rawPerCandela:frame.rawPerCandela??3.6e-5,width:target?.width||optics.width||1,height:target?.height||optics.height||1,mediumQueries:0,sourceTransmission:{backend:'none',requested:!!transmissionBatch&&!!medium,effective:false,reason,mediumQueries:0,instances:0,activeRayCount:0,sourceVersion:null,recordsGeneration,densityRevision:null,cameraKey:null,reflection},sourceVisibility:{mode:sourceVisibility,inputRecords:0,luminousSources:0,depthCulled:0,quadCulled:0,conservativeRetained:0,mediumQueries:0,renderedRecords:0}});
        return;
      }
      validatePoweredOpticalShutter(optics.shutterSeconds??1/120,simulation.active.some(e=>e.effectProfile==='powered-bees-v1'));
      const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),autoClear=renderer.autoClear,shadowAuto=renderer.shadowMap.autoUpdate,shadowDirty=renderer.shadowMap.needsUpdate;
      const width=target?.width||optics.width||1,height=target?.height||optics.height||1;
      const scale=frame.sceneScale??2**(frame.storageEV||0),rawPerCandela=frame.rawPerCandela??3.6e-5;
      camera.updateMatrixWorld();uniforms.uViewProjection.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);uniforms.uProjection.value.copy(camera.projectionMatrix);uniforms.uEye.value.setFromMatrixPosition(camera.matrixWorld);uniforms.uSize.value.set(width,height);
      uniforms.uDepth.value=reflection?dummy:opaqueDepth||dummy;uniforms.uPlaneY.value=planeY;uniforms.uStorageScale.value=scale;uniforms.uRawPerCandela.value=rawPerCandela;
      const requestedShutter=optics.shutterSeconds??1/120,vectorExposure=resolveFireworkExposure({physicalNow:simulation.time,shutterSeconds:requestedShutter}),legacyShutter=reflection?0:requestedShutter;
      uniforms.uFocalMm.value=optics.focalMm??28;uniforms.uAperture.value=optics.aperture??8;uniforms.uFocus.value=optics.focusMetres??60;uniforms.uSensorHeightMm.value=optics.sensorHeightMm??24;uniforms.uDof.value=!reflection&&optics.dof?1:0;uniforms.uShutter.value=vectorExposure.durationSeconds;uniforms.uLegacyShutter.value=legacyShutter;uniforms.uVignette.value=!reflection&&optics.vignette?1:0;uniforms.uFirelightSigmaPixels.value=firelightSigmaPixels;
      uniforms.uAirEnabled.value=air.enabled?1:0;for(const [name,field]of [['uBetaR','betaRayleighRGB'],['uBetaME','betaMieExtinctionRGB'],['uBetaMS','betaMieScatteringRGB'],['uSunDirection','sunDirection'],['uRawSunRGB','rawSunRGB']])uniforms[name].value.fromArray(rgbArray(air[field]));
      uniforms.uHeights.value.set(air.rayleighHeight||8000,air.aerosolHeight||1200);uniforms.uG.value=air.asymmetry??.76;
      const viewOptics={...optics,width,height,dof:!reflection&&optics.dof,legacyShutterSeconds:legacyShutter};
      lastTrailSampling=trailIntegration==='adaptive'?estimateTrailSampling(camera,viewOptics,width,height,requestedShutter):null;
      const count=fillRecords(camera,air,rawPerCandela,requestedShutter,medium,legacySmoke,reflection,planeY,viewOptics,transmissionBatch,target,prepared);mesh.material=reflection?reflectionMaterial:mainMaterial;
      const renderInfo={instances:count,reflection,time:simulation.time,rendered:false,skipped:false,storageEV:frame.storageEV??Math.log2(scale),rawPerCandela,width,height,...(optics.firelightSigmaPixels!==undefined?{firelightSigmaPixels}:{}),mediumQueries:lastSourceVisibility.mediumQueries,sourceTransmission:lastSourceTransmission,sourceVisibility:lastSourceVisibility,...(lastSourceTransmission.vectorSources?{vectorExposure,legacyShutterSeconds:legacyShutter,temporalModel:'8 referenceRGB bin means with joint motion kernel; Eulerian replenished tail field; midpoint T approximation'}:{})};recordViewRender(renderInfo);
      try{renderer.autoClear=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.setRenderTarget(target);renderer.render(effectsScene,camera);renderInfo.rendered=true;}
      finally{renderer.autoClear=autoClear;renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowDirty;renderer.setRenderTarget(previous,face,mip);}
      }finally{if(prepared)releasePreparedSourceView(prepared,'consumed');}
    },
    setQuality(patch={}){quality.trailSegments=clamp(Math.round(patch.trailSegments??quality.trailSegments),6,16);updateRecords();return{...quality};},
    diagnostics(){return{...simulation.state,...(photometryRequested?{photometry:{mode:photometryMode,thermalEmittingRadiusMm,thermalBodyScale,profile:THERMAL_GREYBODY_PROFILE,scope:'Scale complete native-thermal body head/tail allocation once; coloured bodies retain reference I. No measured fireworks or heat/energy calibration.'}}:{}),...(tailColourModeRequested?{tailColour:{mode:tailColourMode,profile:THERMAL_TAIL_COLOUR_PROFILE}}:{}),clusterModel,clusterIlluminationModel:clusterModel==='moments'?'spatial-moment finite-radius point proxy; not exact area emission':'legacy age-times8 radius capped at28m',records:records.length,...(contactSupport?{contactSupport:contactSupport.diagnostics()}:{}),lastRender,lastRenderByView:{main:lastRenderByView.main,reflection:lastRenderByView.reflection},quality:{...quality},opticalCapacity,physicalLedgerCapacity:ledgerCapacity,capacityLimits:FIREWORK_RENDER_CAPACITY_LIMITS,sourceRayCapacity:sourceRayBuffers?.active.length??0,...(sweptSourceVisibility?{sweptSourceVisibility:true}:{}),radianceBound:boundCache,warnings:[...warnings],units:'reference cd + approximate emission RGB, linear scene reference once *2^storageEV; not measured pyrotechnic photometry',renderer:'independent instanced premult effects, four-segment finite air; water-hit reflection origin; sorted short segments',tailIntegration:{spatialSamples:8,...(trailIntegrationRequested?{requested:trailIntegration,effective:trailIntegration==='legacy8'?'legacy8':lastTrailSampling?'adaptive-with-legacy8-budget-fallback':'awaiting-render'}:{}),...(trailIntegration==='adaptive'?{mode:trailIntegration,spatialSamples:'positive adaptive N/N+1',estimates:lastTrailSampling}:{}),shutter:'<=1px: trace-preserving isotropic variance; >1px:3-point independent quadrature',kernelEvaluations:simulation.active.some(e=>e.effectProfile)?(trailIntegration==='adaptive'?'candidate: up to8 temporal bins times2 spatial levels times128 local samples =2048 Gaussian evaluations; zero motion shortcuts once':'candidate:8 temporal by8 spatial =64 Gaussian evaluations; zero motion shortcuts once'):(trailIntegration==='adaptive'?'upper limits256 local spatial evaluations /768 with large shutter; projected counters are CPU estimates, not actual GPU execution counts':'8 normal /24 large-shutter tail; scalar heads8 normally, bounded128 samples per level for near adaptive shutter'),extraPasses:0},...(simulation.active.some(e=>e.effectProfile)?{profileOptics:{model:'causal8-bin referenceRGB shutter, actual past midpoint, fixed-lag optical tail field with detached-age spectrum',properties:'source colour/I shared by current ledger, local/cloud/smoke/GI proxies; candidate reflection uses same shutter as main',attributes:13,estimatedVaryingComponents:54,limits:['finite8-bin joint spatial-time quadrature; first-order midpoint motion proxy','one optical-anchor smoke T, not T(t)','N-lag tail-field quadrature; bin-integrated instantaneous field, not continuous material-particle history','receiver lighting instantaneous; depth/occlusion and camera history not integrated',contactSupport?'candidate air-centre support clips causal history at bounded static terrain/mean sea; legacy scalar shutter, spatial kernel crossing, wave contact and chemical extinction remain approximations':'ground cutoff uses currentY without an admitted bounded surface contract']}}:{}),limits:['linear drag/burn model; no chemical or shock/fluid solve','grey smoke thin sprites; centre-depth sorting and shared near-air visibility approximation','resolved opaque depth/defocus occlusion approximation; root owns one shared bloom/vignette','subpixel tail shutter variance is a bounded angular approximation, not exact time-space convolution','star/cross-spectrum RGB is approximate CIE fit + authored bands and gamut compression']};},
    dispose(){invalidatePreparedSourceViews('disposed');disposed=true;geometry.dispose();mainMaterial.dispose();reflectionMaterial.dispose();dummy.dispose();rig.traverse(o=>o.geometry?.dispose());steel.dispose();rubber.dispose();},
  };
  api.configure({});return api;
}


