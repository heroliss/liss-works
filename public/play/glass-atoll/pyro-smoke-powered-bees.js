import {buildLogicalBurnProfile,logicalBurnCell} from './pyro-smoke-logical-burn.js';
import {PYRO_SMOKE_LIMITS as LIMIT} from './pyro-smoke-state.js';

// Candidate-only material routing. No renderer, optical gain, RNG or position reads.
export const POWERED_BEES_SMOKE_PROFILE='powered-bees-v1';
const finite=(v,label)=>{if(!Number.isFinite(v))throw new RangeError(label+' must be finite');return v;};
const compare=(a,b)=>a<b?-1:a>b?1:0;
const sum=values=>{let s=0,c=0;for(const v of values){const y=v-c,t=s+y;c=(t-s)-y;s=t;}return s;};

export function parsePoweredSmokeMotionProfile(value,life){
  if(!value||value.schema!=='glass-atoll.finite-thrust-profile.v1'||typeof value.id!=='string'||!value.id.length||value.id.length>128||!Array.isArray(value.forceKnotAges)||value.forceKnotAges.length<2||value.forceKnotAges.length>13)throw new RangeError('Powered smoke requires bounded immutable motor knot metadata');
  const motorEndAge=finite(value.motorEndAge,'motorEndAge');
  if(!(motorEndAge>0)||motorEndAge>1.0600000001||motorEndAge>life)throw new RangeError('Motor knots must end within the actual material life and admitted motor clock');
  let previous=-Infinity;
  const forceKnotAges=value.forceKnotAges.map(age=>{finite(age,'force knot age');if(age<=previous||age<0||age>motorEndAge)throw new RangeError('Motor knot ages must increase within the actual motor clock');previous=age;return age;});
  if(forceKnotAges[0]!==0||forceKnotAges.at(-1)!==motorEndAge)throw new RangeError('Motor knots must include zero and the exact motor end');
  return Object.freeze({schema:value.schema,id:value.id,motorEndAge,forceKnotAges:Object.freeze(forceKnotAges)});
}

export function makePoweredBeesSmokeEntry(d,serial,areas,centralFraction,graph,maxPlans=16384){
  if(d.effectProfile!==POWERED_BEES_SMOKE_PROFILE||d.type!=='chrysanthemum'||d.ground||d.roots.length!==192||d.roots.filter(r=>r.motionProfile).length!==32)throw new RangeError('Powered bees smoke requires all 192 native roots and exactly 32 motors');
  if(areas.burstArea!==20||areas.launchArea!==.35)throw new RangeError('Powered bees smoke preserves the original 20+.35 reference material budget');
  if(!graph||graph.id!==d.id||graph.type!==d.type||graph.ground!==d.ground||graph.launchTime!==d.time||graph.burstTime!==d.burstTime||graph.endTime!==d.endTime)throw new RangeError('Powered smoke graph must match its actual event descriptor');
  const profile=buildLogicalBurnProfile(graph,{centralFraction}),roots=new Map(d.roots.map(r=>[r.id,r])),bodies=profile.streams.filter(s=>s.mode==='burn');
  if(profile.bodyCount!==192||profile.familyCount!==192||bodies.length!==192)throw new RangeError('Powered smoke must reserve every actual root family exactly once');
  for(const s of bodies){const r=roots.get(s.bodyId);if(!r||s.role!=='aerial-root'||s.birth!==r.birth||s.life!==r.life)throw new RangeError('Powered material body clock/identity differs from the actual root');}
  for(const s of profile.streams)if(s.mode==='trigger'&&!d.sourceEvents.some(e=>e.kind===s.eventKind&&e.time===s.birth&&e.seed===s.eventSeed))throw new RangeError('Powered material trigger differs from the original source event');
  if(!Number.isSafeInteger(maxPlans)||maxPlans<1||maxPlans>16384||profile.cellCount>maxPlans)throw new RangeError('Powered complete-event plan reservation exceeds capacity; no body/cell was truncated');
  const plans=[];
  for(let streamIndex=0;streamIndex<profile.streams.length;streamIndex++){
    const stream=profile.streams[streamIndex];
    for(let index=0;index<stream.count;index++){
      const c=logicalBurnCell(profile,streamIndex,index),sourceId='ts-'+serial+'-logical-'+streamIndex;
      if(c.mode==='burn'){
        const motor=roots.get(c.bodyId).motionProfile;
        // Knot splitting changes integration accuracy, never material timing/count.
        const integrationBreaks=motor?motor.forceKnotAges.map(age=>c.bodyBirth+age).filter(time=>time>c.start&&time<c.end):[];
        plans.push(Object.freeze({key:c.key,eventId:d.id,time:c.time,component:'logical-burn',index:c.bodyId,mass:c.mass,sourceId,bodyId:c.bodyId,cellIndex:index,rootLife:c.bodyLife,segmentStart:c.start,segmentEnd:c.end,integrationBreaks:Object.freeze(integrationBreaks),motor:!!motor}));
      }else{
        const source=d.sourceEvents.find(e=>e.kind===c.eventKind&&e.time===c.sourceTime&&e.seed===c.eventSeed);
        plans.push(Object.freeze({key:c.key,eventId:d.id,time:c.time,component:c.role==='lift'?'launch':'central',index,mass:c.mass,sourceId,source,packetIndex:index,area:c.triggerArea}));
      }
    }
  }
  plans.sort((a,b)=>a.time-b.time||compare(a.key,b.key));
  return{descriptor:d,plans:Object.freeze(plans),next:0,serial,lastBirth:plans.at(-1)?.time??d.time,allocated:sum(plans.map(p=>p.mass)),poweredSmoke:true,logicalBodyCount:192,motorBodyIds:Object.freeze(d.roots.filter(r=>r.motionProfile).map(r=>r.id))};
}

// Mirror the published physical input domain before ANY packet is queued. The
// scheduler retains its existing unexpected-queue-failure prefix/fault protocol.
export function validatePoweredSmokeEmission(e){
  if(!(e.mass>0)||e.mass>LIMIT.referenceMass||!Number.isFinite(e.mass)||typeof e.sourceId!=='string'||!e.sourceId.length||e.sourceId.length>128)throw new RangeError('Invalid powered smoke material/source identity');
  if(!Array.isArray(e.mean)||e.mean.length!==3||e.mean.some(v=>!Number.isFinite(v)||Math.abs(v)>LIMIT.worldCoordinate)||!Number.isFinite(e.temperatureExcessK)||Math.abs(e.temperatureExcessK)>LIMIT.thermalExcessK||!Number.isFinite(e.buoyantVelocity)||Math.abs(e.buoyantVelocity)>LIMIT.velocity)throw new RangeError('Powered smoke mean/thermal input exceeds physical domain');
  const c=e.covariance;
  if(!Array.isArray(c)||c.length!==9||c.some(v=>!Number.isFinite(v)||Math.abs(v)>LIMIT.covarianceElement))throw new RangeError('Powered source covariance exceeds physical domain');
  const scale=Math.max(c[0],c[4],c[8]),L=Array(9).fill(0);
  if(!(scale>0))throw new RangeError('Powered source covariance is not SPD');
  for(const [a,b]of [[1,3],[2,6],[5,7]])if(Math.abs(c[a]-c[b])>64*Number.EPSILON*scale)throw new RangeError('Powered source covariance is not symmetric');
  for(let i=0;i<3;i++)for(let j=0;j<=i;j++){
    let v=i===j?c[i*3+j]:(c[i*3+j]+c[j*3+i])*.5;
    for(let k=0;k<j;k++)v-=L[i*3+k]*L[j*3+k];
    if(i===j){if(!(v>=LIMIT.minimumCholeskyVariance))throw new RangeError('Powered source covariance exceeds Cholesky domain');L[i*3+j]=Math.sqrt(v);}else L[i*3+j]=v/L[j*3+j];
  }
  const root=L[0]*L[4]*L[8],normalization=e.mass/((2*Math.PI)**1.5*root);
  if(!(root>0)||!Number.isFinite(root)||!(normalization>0)||!Number.isFinite(normalization))throw new RangeError('Powered source Gaussian normalization exceeds physical domain');
}
