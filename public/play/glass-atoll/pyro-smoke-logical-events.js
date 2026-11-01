import {COMPLEX_FIREWORK_TYPES} from './complex-fireworks.js';
// Opt-in all-logical-body adapter. Original audio events are observed, never
// mutated/re-enqueued. No renderer, P/C, light-dependent matter or source cohort.
import {buildLogicalBurnProfile,createLogicalBurnCursor,LOGICAL_BURN_PROFILE} from './pyro-smoke-logical-burn.js';
import {createPyroSmokeEventPackets} from './pyro-smoke-events.js';
import {createSourceWindHistory,appendSourceWindHistory,pastSegmentSourceMoments,pastPiecewiseSegmentSourceMoments,SMOKE_SOURCE_TRANSPORT} from './pyro-smoke-source-moments.js';
import {POWERED_BEES_SMOKE_PROFILE,parsePoweredSmokeMotionProfile} from './pyro-smoke-powered-bees.js';
import {PYRO_SMOKE_LIMITS as LIMIT} from './pyro-smoke-state.js';
const TYPES=new Set(['peony','chrysanthemum','willow','palm','ring','heart','crossette','strobe','fan','bouquet',...COMPLEX_FIREWORK_TYPES.map(t=>t.id)]);
const compare=(a,b)=>a<b?-1:a>b?1:0;
const finite=(v,name,max=Infinity)=>{if(!Number.isFinite(v)||Math.abs(v)>max)throw new RangeError(name+' outside finite numeric domain');return v;};
const text=(v,name,max=128)=>{if(typeof v!=='string'||!v.length||v.length>max)throw new TypeError(name+' requires a bounded string');return v;};
const integer=(v,name,max)=>{if(!Number.isSafeInteger(v)||v<1||v>max)throw new RangeError(name+' requires a bounded positive integer');return v;};
const vec=(v,name)=>{if(!v||v.length!==3)throw new TypeError(name+' needs3 components');return Array.from(v,(x,i)=>finite(x,name+i,LIMIT.worldCoordinate));};
const sum=values=>{let n=0,c=0;for(const v of values){const y=v-c,t=n+y;c=(t-n)-y;n=t;}return n;};
function info(state){if(!state||typeof state.queueEmission!=='function'||typeof state.snapshot!=='function'||typeof state.diagnostics!=='function')throw new TypeError('Physical smoke state API required');return state.diagnostics();}
function rawEvent(e){
 if(!e||!TYPES.has(e.type)||(e.kind!=='launch'&&e.kind!=='burst')||!Number.isSafeInteger(e.seed)||e.seed<0||e.seed>4294967295)throw new RangeError('Original logical launch/burst identity required');
 const eventId=text(e.eventId,'eventId'),time=finite(e.time,'event.time'),position=vec(e.position,'event.position'),key=JSON.stringify([eventId,e.kind,time]);
 return{eventId,type:e.type,kind:e.kind,seed:e.seed,time,position,key,fingerprint:JSON.stringify([e.type,e.seed,position])};
}
function descriptor(provider,e,options){
 const d=provider.describe(e.eventId),g=provider.describeCombustion(e.eventId);
 if(!d||d.id!==e.eventId||d.type!==e.type||!Array.isArray(d.sourceEvents)||!Array.isArray(d.roots)||d.sourceEvents.length>(d.type==='display-vfan'?128:16)||d.roots.length>4096||g?.id!==d.id||g.type!==d.type||g.seed!==d.seed||g.ground!==d.ground||g.launchTime!==d.time||g.burstTime!==d.burstTime||g.endTime!==d.endTime)throw new RangeError('Kinematic and logical descriptors disagree');
 const profile=buildLogicalBurnProfile(g,options),clocks=d.sourceEvents.map(s=>{
  if((s.kind!=='launch'&&s.kind!=='burst')||!Number.isSafeInteger(s.seed)||s.seed<0||s.seed>4294967295)throw new RangeError('Invalid original source clock');
  finite(s.time,'source clock');return Object.freeze({kind:s.kind,time:s.time,seed:s.seed});
 }).sort((a,b)=>a.time-b.time||compare(a.kind,b.kind));
 const logical=g.nodes.filter(n=>n.role==='lift'||n.role==='burst');
 if(clocks.length!==logical.length||new Set(clocks.map(s=>JSON.stringify([s.kind,s.time]))).size!==clocks.length||clocks.some(s=>!logical.some(n=>n.sourceEventKind===s.kind&&n.birth===s.time&&n.sourceEventSeed===s.seed)))throw new RangeError('Logical triggers do not match original source clocks');
 const roots=g.nodes.filter(n=>n.role==='aerial-root'||n.role==='ground-comet');
 if(roots.length!==d.roots.length||new Set(d.roots.map(b=>b.id)).size!==roots.length||d.roots.some(b=>!roots.some(n=>n.bodyId===b.id&&n.birth===b.birth&&n.life===b.life)))throw new RangeError('Root metadata coverage differs from actual kinematics');
 if(e.kind!=='launch'||e.time!==d.time||clocks[0]?.kind!=='launch'||clocks[0]?.time!==e.time||clocks[0]?.seed!==e.seed)throw new RangeError('Reserve logical source at its causal first launch only');
 const lastBirth=Math.max(...profile.streams.map(s=>s.mode==='burn'?s.endTime:s.birth+(s.count-1)*s.interval));
 let poweredMotionKnots;
 if(d.effectProfile===POWERED_BEES_SMOKE_PROFILE){if(d.type!=='chrysanthemum'||profile.bodyCount!==192||profile.familyCount!==192||d.roots.filter(r=>r.motionProfile).length!==32)throw new RangeError('Powered logical smoke requires all 192 native families and exactly 32 motors');poweredMotionKnots=Object.freeze(d.roots.filter(r=>r.motionProfile).map(r=>Object.freeze({bodyId:r.id,knots:Object.freeze(parsePoweredSmokeMotionProfile(r.motionProfile,r.life).forceKnotAges.map(age=>r.birth+age))})));}
 return{profile,descriptor:Object.freeze({id:d.id,type:d.type,time:d.time,endTime:d.endTime,sourceEvents:Object.freeze(clocks)}),lastBirth,...(poweredMotionKnots?{poweredMotionKnots}:{})};
}
// Mirror all predictable published physical-input limits before any queue write.
// This validates input, not future capacity-merge success or arbitrary callbacks.
function validateEmission(e,stateInfo){
 if(e.time<stateInfo.time-1e-10)throw new RangeError('Logical birth predates committed physical state');
 if(!(e.mass>0)||e.mass>LIMIT.referenceMass||!Number.isFinite(e.mass))throw new RangeError('Invalid logical reference matter');
 vec(e.mean,'aged source mean');finite(e.temperatureExcessK,'source temperature',LIMIT.thermalExcessK);finite(e.buoyantVelocity,'source buoyancy',LIMIT.velocity);text(e.sourceId,'sourceId');
 const c=e.covariance;if(!c||c.length!==9)throw new TypeError('Source covariance requires9 components');
 for(const v of c)finite(v,'source covariance',LIMIT.covarianceElement);
 const scale=Math.max(c[0],c[4],c[8]),L=Array(9).fill(0);if(!(scale>0))throw new RangeError('Source covariance is not SPD');
 for(const [a,b]of [[1,3],[2,6],[5,7]])if(Math.abs(c[a]-c[b])>64*Number.EPSILON*scale)throw new RangeError('Source covariance is not symmetric');
 for(let i=0;i<3;i++)for(let j=0;j<=i;j++){let v=i===j?c[i*3+j]:(c[i*3+j]+c[j*3+i])*.5;for(let k=0;k<j;k++)v-=L[i*3+k]*L[j*3+k];if(i===j){if(!(v>=LIMIT.minimumCholeskyVariance))throw new RangeError('Source covariance exceeds Cholesky domain');L[i*3+j]=Math.sqrt(v);}else L[i*3+j]=v/L[j*3+j];}
 const root=L[0]*L[4]*L[8],normalization=e.mass/((2*Math.PI)**1.5*root);if(!(root>0)||!Number.isFinite(root)||!(normalization>0)||!Number.isFinite(normalization))throw new RangeError('Source Gaussian normalization exceeds numeric domain');
}

export function createPyroSmokeLogicalEvents({state,sourceProvider,profileId='reference',centralFraction=.20,groundChargeFraction=.10,kernelModel='past-segment-v2',dispersionModel='brownian',transport=SMOKE_SOURCE_TRANSPORT,queueCapacity=8192,maxPendingEvents=128,maxPendingStreams=2048,maxRememberedEvents=2048}={}){
 if(kernelModel!=='past-segment-v2'||dispersionModel!=='brownian'||transport.dispersionModel==='taylor')throw new RangeError('Logical continuous source requires explicit past-segment-v2 and Brownian transport');
 for(const k of ['describe','describeCombustion','sample','sampleBody'])if(typeof sourceProvider?.[k]!=='function')throw new TypeError('Logical source requires actual provider.'+k+'; no root fallback');
 text(profileId,'profileId');for(const [n,v,m]of [['queueCapacity',queueCapacity,8192],['maxPendingEvents',maxPendingEvents,2048],['maxPendingStreams',maxPendingStreams,4096],['maxRememberedEvents',maxRememberedEvents,16384]])integer(v,n,m);
 if(maxPendingEvents>maxRememberedEvents)throw new RangeError('Remembered identities must cover pending events');
 if(!Number.isFinite(centralFraction)||centralFraction<0||centralFraction>=1||!Number.isFinite(groundChargeFraction)||groundChargeFraction<=0||groundChargeFraction>=1)throw new RangeError('Invalid authored matter fractions');
 function assertState(s){const d=info(s);if((d.dispersion?.model??'brownian')!=='brownian'||!s.snapshot().profiles.some(p=>p.id===profileId))throw new RangeError('Brownian state with the declared optical profile required');return d;}
 const initial=assertState(state);let boundState=state,entries=new Map(),seen=new Map(),tombstones=new Map(),closedThrough=-Infinity,nextSerial=0,nextEmissionId=initial.lastEmissionId+1,expectedLastId=initial.lastEmissionId,revision=0,epoch=0,disposed=false,fault=null;
 let allocatedArea=0,materializedArea=0,cancelledReservedArea=0,registeredEvents=0,emissionsLifetime=0,duplicates=0,staleEvents=0,clears=0,releaseErrors=0,lastReleaseError=null,sourceWindHistory=createSourceWindHistory({time:initial.time,wind:state.snapshot().currentWind});
 const prepared=new WeakMap(),recent=[],completed=[];
 const reserved=map=>sum([...map.values()].map(e=>e.cursor.diagnostics().reserved));
 const streamCount=map=>sum([...map.values()].map(e=>e.profile.streams.length));
 function release(id){try{sourceProvider.release?.(id);}catch(error){releaseErrors++;lastReleaseError=String(error.message||error);}}
 function assertReady(){if(disposed)throw new Error('Logical source adapter disposed');if(fault)throw new Error('Logical source fault-locked; explicit clear required');}
 function prepare(events,{throughTime,windVector=sourceWindHistory?.samples.at(-1)?.wind}={}){
  assertReady();finite(throughTime,'source throughTime');if(throughTime<closedThrough)throw new RangeError('Logical source watermark cannot rewind');if(!Array.isArray(events)||events.length>maxRememberedEvents)throw new TypeError('Original event batch must be a bounded array');
  const before=info(boundState);if(throughTime<before.time-1e-10||!Number.isSafeInteger(before.lastEmissionId+1)||before.lastEmissionId!==expectedLastId)throw new RangeError('Physical source time/IDs changed outside the unique scheduler');
  if(!Number.isFinite(sourceProvider.time)||sourceProvider.time<throughTime)throw new RangeError('Actual source provider has not reached this physical time');
  const proposed=new Map([...entries].map(([id,e])=>[id,{...e,cursor:e.cursor.clone(),sampled:new Set(e.sampled)}])),newSeen=new Map(seen),newTombstones=new Map(tombstones);
  let serial=nextSerial,newAllocated=0,newRegistered=0,dup=0,stale=0;
  const batch=events.map(rawEvent).sort((a,b)=>a.time-b.time||(a.kind==='launch'?0:1)-(b.kind==='launch'?0:1)||compare(a.eventId,b.eventId));
  for(const event of batch){
   if(event.time>throughTime)throw new RangeError('Cannot consume a future source event');const known=newSeen.get(event.key);
   if(known!==undefined){if(known!==event.fingerprint)throw new RangeError('Conflicting same-key source event');dup++;continue;}
   if(newTombstones.has(event.eventId)){stale++;continue;}if(event.time<closedThrough)throw new RangeError('Unrecognized stale source event cannot be reconstructed');
   let entry=proposed.get(event.eventId);
   if(!entry){const d=descriptor(sourceProvider,event,{centralFraction,groundChargeFraction});if(!Number.isSafeInteger(serial+1))throw new RangeError('Logical source serial exhausted');entry={...d,cursor:createLogicalBurnCursor(d.profile,{maxReadyCells:queueCapacity}),serial:serial++,sampled:new Set()};proposed.set(event.eventId,entry);newAllocated+=d.profile.budget.total;newRegistered++;}
   if(!entry.descriptor.sourceEvents.some(s=>s.kind===event.kind&&s.time===event.time&&s.seed===event.seed))throw new RangeError('Original source clock differs from reserved graph');
   const actual=sourceProvider.sample(event.eventId,{kind:'event',eventKind:event.kind,time:event.time,seed:event.seed}),point=vec(actual?.position,'source event point');
   if(actual.eventId!==event.eventId||actual.time!==event.time||point.some((v,i)=>v!==event.position[i]))throw new RangeError('Original sound event and actual world source differ');newSeen.set(event.key,event.fingerprint);
  }
  if(proposed.size>maxPendingEvents||streamCount(proposed)>maxPendingStreams||newSeen.size+newTombstones.size+proposed.size>maxRememberedEvents)throw new RangeError('Bounded logical stream/identity capacity exceeded before sampling/commit');
  const cursorTokens=new Map(),ready=[];
  for(const [id,e]of proposed){const token=e.cursor.prepare({throughTime});cursorTokens.set(id,token);for(const cell of token.cells){if(ready.length===queueCapacity)throw new RangeError('Combined ready capacity exceeded');ready.push({id,cell,entry:e});}}
  ready.sort((a,b)=>a.cell.time-b.cell.time||compare(a.cell.key,b.cell.key));
  if(before.pendingEmissions+ready.length>queueCapacity||!Number.isSafeInteger(nextEmissionId+ready.length))throw new RangeError('Physical pending capacity/ID domain would be exceeded');
  // Previous horizon minus one maximum cell retains a not-yet-ready crossing
  // interval even when this update is a larger bounded catch-up.
  const preparedWind=appendSourceWindHistory(sourceWindHistory,{time:throughTime,windVector,retainFrom:sourceWindHistory.throughTime-.30,maxSamples:1024});
  const emissions=ready.map(({cell:c,entry:e},i)=>{
   let value;
   if(c.mode==='burn')value=(e.poweredMotionKnots?pastPiecewiseSegmentSourceMoments:pastSegmentSourceMoments)({start:c.start,end:c.end,...(e.poweredMotionKnots?{depositTime:c.end,integrationBreaks:(e.poweredMotionKnots.find(r=>r.bodyId===c.bodyId)?.knots??[]).filter(time=>time>c.start&&time<c.end)}:{}),mass:c.mass,windHistory:preparedWind,sigmaPerp:.30,transport,samplePosition:time=>{const sampled=sourceProvider.sampleBody(c.eventId,{bodyId:c.bodyId,time});if(sampled?.eventId!==c.eventId||sampled.time!==time||sampled.bodyId!==undefined&&sampled.bodyId!==c.bodyId)throw new RangeError('Actual body sample identity/time mismatch');return vec(sampled.position,'actual logical body point');}});
   else{const sampled=sourceProvider.sample(c.eventId,{kind:'event',eventKind:c.eventKind,time:c.sourceTime,seed:c.eventSeed});if(sampled?.eventId!==c.eventId||sampled.time!==c.sourceTime)throw new RangeError('Actual trigger sample identity/time mismatch');const event={eventId:c.eventId,type:e.profile.type,kind:c.eventKind,time:c.sourceTime,seed:c.eventSeed,position:vec(sampled.position,'trigger point'),key:JSON.stringify([c.eventId,c.eventKind,c.sourceTime])};value=createPyroSmokeEventPackets(event,c.triggerArea,profileId,'logical-shape')[c.packetIndex];}
   const source={emissionId:nextEmissionId+i,time:c.time,sourceId:'lb-'+e.serial+'-'+c.streamIndex,profileId,mass:c.mass,mean:Object.freeze([...value.mean]),covariance:Object.freeze([...value.covariance]),temperatureExcessK:value.temperatureExcessK,buoyantVelocity:value.buoyantVelocity,...(e.poweredMotionKnots&&c.mode==='burn'?{kernelDiagnostics:{...value.diagnostics,birthCovariance:[...value.covariance]}}:{})};validateEmission(source,before);return Object.freeze(source);
  });
  const readyArea=sum(emissions.map(e=>e.mass));if(before.ledger.emitted+before.ledger.pendingMass+readyArea>LIMIT.referenceMass)throw new RangeError('Total physical reference matter exceeds numeric domain');
  const token=Object.freeze({throughTime,readyCount:ready.length,readyArea,newReservedArea:newAllocated,reservedAreaBefore:reserved(entries)});
  prepared.set(token,{revision,epoch,state:boundState,baseTime:before.time,baseLastId:before.lastEmissionId,proposed,newSeen,newTombstones,cursorTokens,ready,emissions,preparedWind,throughTime,serial,newAllocated,newRegistered,dup,stale});return token;
 }
 function install(tx,accepted,partial){
  const acceptedById=new Map();for(let i=0;i<accepted;i++){const r=tx.ready[i];acceptedById.set(r.id,(acceptedById.get(r.id)||0)+1);if(r.cell.mode==='burn')r.entry.sampled.add(r.cell.bodyId);}
  const map=new Map(tx.proposed);
  for(const [id,e]of map){e.cursor.commit(tx.cursorTokens.get(id),{acceptedCount:partial?(acceptedById.get(id)||0):tx.cursorTokens.get(id).readyCount});const d=e.cursor.diagnostics();if(!d.remainingCells){map.delete(id);tx.newTombstones.set(id,e.lastBirth);completed.push({eventId:id,type:e.profile.type,bodyCount:e.profile.bodyCount,materializedBodies:e.sampled.size,allocated:e.profile.budget.total,materialized:d.materialized});release(id);}}
  if(completed.length>32)completed.splice(0,completed.length-32);
  entries=map;seen=tx.newSeen;tombstones=tx.newTombstones;sourceWindHistory=tx.preparedWind;nextSerial=tx.serial;allocatedArea+=tx.newAllocated;registeredEvents+=tx.newRegistered;duplicates+=tx.dup;staleEvents+=tx.stale;materializedArea+=sum(tx.emissions.slice(0,accepted).map(e=>e.mass));emissionsLifetime+=accepted;expectedLastId=info(boundState).lastEmissionId;nextEmissionId=Math.max(nextEmissionId,expectedLastId+1);
  if(!partial){closedThrough=tx.throughTime;for(const [k]of seen)if(JSON.parse(k)[2]<closedThrough)seen.delete(k);for(const [id,last]of tombstones)if(last<closedThrough)tombstones.delete(id);}
  for(let i=0;i<accepted;i++){const c=tx.ready[i].cell,e=tx.emissions[i];recent.push({key:c.key,eventId:c.eventId,sourceID:c.sourceID,bodyId:c.bodyId,role:c.role,time:e.time,emissionId:e.emissionId,mass:e.mass,position:[...e.mean]});}if(recent.length>32)recent.splice(0,recent.length-32);revision++;
 }
 function commit(token){
  assertReady();const tx=token&&prepared.get(token),before=info(boundState);if(!tx||tx.revision!==revision||tx.epoch!==epoch||tx.state!==boundState||before.time!==tx.baseTime||before.lastEmissionId!==tx.baseLastId)throw new Error('Stale/foreign logical transaction or changed physical state');prepared.delete(token);
  let accepted=0;try{for(const e of tx.emissions){const result=boundState.queueEmission(e);if(result?.accepted!==true)throw new Error('Physical state did not accept logical source');accepted++;}}
  catch(error){const observed=info(boundState).lastEmissionId;accepted=Math.max(accepted,tx.emissions.filter(e=>e.emissionId<=observed).length);install(tx,accepted,true);fault={message:String(error.message||error),acceptedPackets:accepted,expectedPackets:tx.emissions.length,throughTime:tx.throughTime,notRolledBack:true};throw error;}
  install(tx,accepted,false);return{packets:accepted,referenceArea:token.readyArea,reservedArea:reserved(entries),closedThrough};
 }
 return{
  prepare,commit,consume(events,options){return commit(prepare(events,options));},
  clearForState(next,{time}={}){if(disposed)throw new Error('Logical adapter disposed');finite(time,'clear time');if(time<closedThrough)throw new RangeError('Clear cannot rewind source watermark');const d=assertState(next),snapshot=next.snapshot();if(Math.abs(d.time-time)>1e-10||d.pendingEmissions||snapshot.packets.length||d.ledger.emitted)throw new RangeError('Cleared physical state must be empty at the same current time');const cancelled=reserved(entries);for(const [id,e]of entries){tombstones.set(id,e.lastBirth);release(id);}cancelledReservedArea+=cancelled;entries=new Map();boundState=next;sourceWindHistory=createSourceWindHistory({time,wind:snapshot.currentWind});expectedLastId=d.lastEmissionId;nextEmissionId=Math.max(nextEmissionId,d.lastEmissionId+1);closedThrough=time;fault=null;epoch++;clears++;revision++;return{cancelledReservedArea:cancelled,totalCancelledReservedArea:cancelledReservedArea,epoch,closedThrough};},
  diagnostics(){const remaining=[...entries.values()].map(e=>({eventId:e.profile.eventId,type:e.profile.type,bodyCount:e.profile.bodyCount,materializedBodies:e.sampled.size,...e.cursor.diagnostics()}));return{version:'pyro-smoke-logical-events-v1',sourceModel:'trajectory-v1',coverage:'all-logical',emissionProfile:LOGICAL_BURN_PROFILE,revision,epoch,closedThrough:Number.isFinite(closedThrough)?closedThrough:null,nextEmissionId,nextSerial,allocatedArea,materializedArea,reservedArea:reserved(entries),cancelledReservedArea,accountingResidual:allocatedArea-materializedArea-reserved(entries)-cancelledReservedArea,registeredEvents,emissionsLifetime,pendingEvents:entries.size,pendingStreams:streamCount(entries),remainingCells:sum(remaining.map(d=>d.remainingCells)),futureCellArrays:0,positionArchives:0,duplicates,staleEvents,clears,rememberedEventKeys:seen.size,tombstones:tombstones.size,fault:fault?{...fault}:null,releaseErrors,lastReleaseError,queueCapacity,maxPendingEvents,maxPendingStreams,maxRememberedEvents,activeCoverage:remaining,completedCoverage:completed.map(d=>({...d})),recentSources:recent.map(e=>({...e,position:[...e.position]})),parameters:{emissionProfile:LOGICAL_BURN_PROFILE,kernelModel:'past-segment-v2',dispersionModel:'brownian',centralFraction,groundChargeFraction,maximumCellSeconds:.30,budgets:{aerial:20.35,fan:.9,bouquet:2}},limits:['Authored reference matter, not measured kg/fuel/smoke yield. No ascent-engine source or render-tail duplication.','All logical body paths; full-SPD segment moments still approximate. No source cohort merge.','Requires actual causal sampleBody; no fallback to root or future positions.','Fixed4096 density merging and optional resolved-field pair cap remain independent downstream limits.','Predictable input checks precede queueing; unexpected partial acceptance fault-locks and is never rolled back.']};},
  dispose(){if(disposed)return;cancelledReservedArea+=reserved(entries);for(const id of entries.keys())release(id);entries.clear();seen.clear();tombstones.clear();sourceWindHistory=null;disposed=true;revision++;},
 };
}
