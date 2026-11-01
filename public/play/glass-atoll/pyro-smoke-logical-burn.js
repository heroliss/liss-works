import {COMPLEX_FIREWORK_TYPES} from './complex-fireworks.js';
// Opt-in logical matter scheduler only. No renderer, RNG, sound or state writes.
// M is authored reference material/area, never measured fuel, kg or smoke yield.
export const LOGICAL_BURN_PROFILE='logical-family-continuous-v1';
const TYPES=new Set(['peony','chrysanthemum','willow','palm','ring','heart','crossette','strobe','fan','bouquet',...COMPLEX_FIREWORK_TYPES.map(t=>t.id)]);
const BODY_ROLES=new Set(['aerial-root','aerial-child','ground-comet']);
const profiles=new WeakSet(),STEP=.30,MAX_STREAMS=4096,MAX_CELLS_PER_STREAM=32768;
const compare=(a,b)=>a<b?-1:a>b?1:0;
const finite=(v,name)=>{if(!Number.isFinite(v))throw new RangeError(name+' must be finite');return v;};
const integer=(v,name,max)=>{if(!Number.isSafeInteger(v)||v<1||v>max)throw new RangeError(name+' must be a bounded positive integer');return v;};
const identity=(v,name,max=512)=>{if(typeof v!=='string'||!v.length||v.length>max)throw new TypeError(name+' requires a bounded nonempty string');return v;};
const sum=values=>{let s=0,c=0;for(const v of values){const y=v-c,t=s+y;c=(t-s)-y;s=t;}return s;};
function portions(total,weights){const denominator=sum(weights);if(!(total>0)||!(denominator>0))throw new RangeError('Positive representable matter allocation required');let assigned=0;return weights.map((w,i)=>{const m=i===weights.length-1?total-assigned:total*w/denominator;assigned+=m;if(!(m>0)||!Number.isFinite(m))throw new RangeError('Matter share is not positive and representable');return m;});}
function cellGeometry(b){
 const resolution=8*Number.EPSILON*Math.max(1,Math.abs(b.birth),Math.abs(b.endTime));
 if(resolution>1e-9)throw new RangeError('Absolute clock cannot represent causal interior quadrature');
 const firstAge=Math.min(b.life,.1+.2*((Math.imul(b.bodyId,2654435761)+1013904223)>>>0)/2**32);
 let count=1+Math.ceil((b.life-firstAge)/STEP);
 while(count>1&&firstAge+(count-2)*STEP>=b.life)count--;
 while(firstAge+(count-1)*STEP<b.life)count++;
 integer(count,'Per-body cell count',MAX_CELLS_PER_STREAM);
 let penultimateAge=null;
 if(count>1){const before=firstAge+(count-2)*STEP;if(b.life-before<=32*resolution){const start=count>2?firstAge+(count-3)*STEP:0;penultimateAge=(start+b.life)/2;}}
 const age=i=>i===count-1?b.life:penultimateAge!==null&&i===count-2?penultimateAge:firstAge+i*STEP;
 // Check the extrema and the adjusted boundary without allocating future cells.
 for(const i of new Set([0,Math.max(0,count-2),count-1])){const a=i?age(i-1):0,width=(b.birth+age(i))-(b.birth+a);if(!(width>32*resolution)||width>STEP+1e-8)throw new RangeError('Burn cell cannot provide representable causal interior samples');}
 return{firstAge,count,penultimateAge};
}
function ageAt(s,i){return i===s.count-1?s.life:s.penultimateAge!==null&&i===s.count-2?s.penultimateAge:s.firstAge+i*STEP;}
function prefixMass(s,next){if(next===0)return 0;if(next===s.count)return s.mass;return s.mode==='burn'?s.mass*(ageAt(s,next-1)/s.life):s.mass*next/s.count;}

/** Consumes the immutable describeCombustion value, never a render ledger.
 * Additional geometry metadata may exist on graph; it is neither read nor copied.
 */
export function buildLogicalBurnProfile(graph,{centralFraction=.20,groundChargeFraction=.10}={}){
 if(!graph||graph.schema!=='glass-atoll.combustion-metadata.v1'||!TYPES.has(graph.type)||!Array.isArray(graph.nodes)||graph.nodes.length>MAX_STREAMS)throw new TypeError('Bounded actual combustion metadata v1 required');
 const eventId=identity(graph.id,'eventId',128),type=graph.type,ground=type==='fan'||type==='bouquet'||type==='display-vfan';
 if(ground!==graph.ground)throw new RangeError('Ground type/metadata mismatch');
 const launchTime=finite(graph.launchTime,'launchTime'),burstTime=finite(graph.burstTime,'burstTime'),endTime=finite(graph.endTime,'endTime');
 if(burstTime<launchTime||endTime<burstTime)throw new RangeError('Event clock order is invalid');
 if(!Number.isFinite(centralFraction)||centralFraction<0||centralFraction>=1)throw new RangeError('centralFraction must be in [0,1) so every burn family has matter');
 if(!Number.isFinite(groundChargeFraction)||groundChargeFraction<=0||groundChargeFraction>=1)throw new RangeError('groundChargeFraction must be in (0,1) for both mouth and comet matter');
 const seen=new Map(),bodyIDs=new Set(),bodies=[],lifts=[],bursts=[];let carriers=0;
 for(const n of graph.nodes){
  const sourceID=identity(n?.sourceID,'sourceID');if(seen.has(sourceID))throw new RangeError('Duplicate logical source ID');
  const birth=finite(n.birth,'source.birth'),life=finite(n.life,'source.life');
  if(life<0||n.endTime!==birth+life||birth<launchTime||n.endTime>endTime)throw new RangeError('Logical lifetime outside event domain');
  const parent=n.parentSourceID==null?null:seen.get(n.parentSourceID);if(n.parentSourceID!=null&&!parent)throw new RangeError('Topologically ordered parent required');
  if(n.eventId!==eventId)throw new RangeError('Logical source belongs to another event');
  const node={sourceID,parentSourceID:n.parentSourceID??null,role:n.role,birth,life,endTime:n.endTime,bodyId:n.bodyId??null,parentBodyId:n.parentBodyId??null,familyID:n.familyID??null,patternPart:n.patternPart??null};
  if(BODY_ROLES.has(n.role)){
   if(!(life>0)||!Number.isSafeInteger(n.bodyId)||n.bodyId<0||bodyIDs.has(n.bodyId))throw new RangeError('Unique nonnegative body ID and positive life required');
   identity(n.familyID,'familyID');bodyIDs.add(n.bodyId);
   if(n.role==='aerial-child'){
    const liveWaterfall=type==='display-waterfall'&&n.patternPart==='waterfall-ember';
    const validBirth=liveWaterfall?n.parentVelocityFraction===.25&&!!parent&&birth>parent.birth&&birth<parent.endTime:birth===parent?.endTime;
    if(ground||!parent||!BODY_ROLES.has(parent.role)||n.parentBodyId!==parent.bodyId||n.familyID!==parent.familyID||!validBirth)throw new RangeError('Child must inherit its actual family at parent death');
    if(liveWaterfall)node.parentVelocityFraction=.25;
   }
   else if(n.role==='aerial-root'){if(ground||parent?.role!=='burst'||n.parentBodyId!==null||birth!==burstTime)throw new RangeError('Aerial root must start at its actual burst');}
   else if(!ground||parent?.role!=='lift'||n.parentBodyId!==null||birth!==parent.birth)throw new RangeError('Ground comet must match its actual lift');
   bodies.push(node);
  }else if(n.role==='lift'||n.role==='burst'){
   if(life!==0||n.bodyId!==null||!Number.isSafeInteger(n.sourceEventSeed)||n.sourceEventSeed<0||n.sourceEventSeed>4294967295||n.sourceEventKind!==(n.role==='lift'?'launch':'burst'))throw new RangeError('Original instantaneous trigger clock/seed required');
   node.eventKind=n.sourceEventKind;node.eventSeed=n.sourceEventSeed;(n.role==='lift'?lifts:bursts).push(node);
  }else if(n.role==='mortar-carrier'){if(ground)throw new RangeError('Ground event cannot contain a mortar carrier');carriers++;}
  else throw new RangeError('Unknown logical source role');
  seen.set(sourceID,node);
 }
 if(!bodies.length||lifts.length!==(type==='fan'?9:type==='display-vfan'?128:1)||bursts.length!==(ground?0:1)||carriers!==(ground?0:1)||Math.min(...lifts.map(n=>n.birth))!==launchTime||!ground&&bursts[0].birth!==burstTime)throw new RangeError('Current native trigger/body contract changed');
 const total=ground?(type==='fan'?.9:type==='display-vfan'?12.8:2):20.35,launch=ground?total*groundChargeFraction:.35,central=ground?0:20*centralFraction,bodyMass=ground?total-launch:20-central,streams=[];
 function trigger(node,mass){if(mass===0)return;const count=node.role==='lift'?9:3;streams.push(Object.freeze({...node,mode:'trigger',mass,count,interval:.075}));}
 portions(launch,lifts.map(()=>1)).forEach((m,i)=>trigger(lifts[i],m));if(central>0)trigger(bursts[0],central);
 const families=new Map();for(const b of bodies){const list=families.get(b.familyID)||[];list.push(b);families.set(b.familyID,list);}
 const values=[...families.values()],familyMasses=portions(bodyMass,values.map(()=>1));
 values.forEach((members,familyIndex)=>{
  const byID=new Map(members.map(b=>[b.sourceID,b])),children=new Map(),shares=new Map();
  for(const b of members)if(byID.has(b.parentSourceID)){const a=children.get(b.parentSourceID)||[];a.push(b);children.set(b.parentSourceID,a);}
  if(members.filter(b=>!byID.has(b.parentSourceID)).length!==1)throw new RangeError('Each family must have exactly one root');
  for(const b of members){const p=byID.get(b.parentSourceID);shares.set(b.sourceID,p?shares.get(p.sourceID)/children.get(p.sourceID).length:1);}
  const weights=members.map(b=>shares.get(b.sourceID)*b.life),allocations=portions(familyMasses[familyIndex],weights),denominator=sum(weights);
  members.forEach((b,i)=>streams.push(Object.freeze({...b,mode:'burn',mass:allocations[i],pathShare:shares.get(b.sourceID),familyMass:familyMasses[familyIndex],familyLifeIntegral:denominator,...cellGeometry(b)})));
 });
 if(streams.length>MAX_STREAMS)throw new RangeError('Logical stream capacity exceeded; no body was truncated');
 const profile=Object.freeze({schema:LOGICAL_BURN_PROFILE,eventId,type,ground,launchTime,burstTime,endTime,streams:Object.freeze(streams),bodyCount:bodies.length,familyCount:families.size,cellCount:sum(streams.map(s=>s.count)),maximumCellSeconds:STEP,budget:Object.freeze({total,launch,central,bodies:bodyMass,centralFraction,groundChargeFraction}),authorProfile:Object.freeze({allocation:'equal positive family budgets; child pathShare divided equally; per-body mass proportional to pathShare*authored life',rate:'uniform along each authored physical-body life; independent of I/RGB/strobe',units:'authored reference material/area, not kg, fuel or measured smoke yield',coverage:'all-logical',carrierSmoke:'not established; no engine smoke assigned'}),limits:Object.freeze(['No future XYZ, RNG, audio, light or camera is read. Trigger life0 is not a measured charge burn duration.','No source cohort merge, transport/optics solve or production integration. Existing downstream density merges remain approximate.'])});
 profiles.add(profile);return profile;
}

export function logicalBurnCell(profile,streamIndex,index){
 if(!profiles.has(profile)||!Number.isSafeInteger(streamIndex)||streamIndex<0||streamIndex>=profile.streams.length)throw new RangeError('Actual logical profile and valid stream index required');
 const s=profile.streams[streamIndex];if(!Number.isSafeInteger(index)||index<0||index>=s.count)throw new RangeError('Invalid logical cell index');
 const startAge=s.mode==='burn'?(index?ageAt(s,index-1):0):index*s.interval,endAge=s.mode==='burn'?ageAt(s,index):startAge,start=s.birth+startAge,time=s.birth+endAge,mass=prefixMass(s,index+1)-prefixMass(s,index);
 if(!(mass>0)||!Number.isFinite(mass)||!Number.isFinite(time))throw new RangeError('Source cell mass/clock is not representable');
 return Object.freeze({key:JSON.stringify([profile.eventId,LOGICAL_BURN_PROFILE,s.sourceID,index]),eventId:profile.eventId,type:profile.type,sourceID:s.sourceID,familyID:s.familyID,role:s.role,bodyId:s.bodyId,parentBodyId:s.parentBodyId,mode:s.mode,streamIndex,index,time,start,end:time,mass,...(s.mode==='trigger'?{eventKind:s.eventKind,eventSeed:s.eventSeed,sourceTime:s.birth,packetIndex:index,triggerArea:s.mass}:{bodyBirth:s.birth,bodyLife:s.life})});
}

/** Local cursor transaction, not the physical state's queue transaction.
 * Callbacks synchronously resolve ready cells only. Commit the actually accepted
 * prefix after external queueing; a partial prefix fault-locks until clear.
 */
export function createLogicalBurnCursor(profile,{maxReadyCells=8192}={}){
 if(!profiles.has(profile))throw new TypeError('A buildLogicalBurnProfile value is required');integer(maxReadyCells,'maxReadyCells',8192);
 function make(saved){
  let next=saved?[...saved.next]:profile.streams.map(()=>0),through=saved?.through??profile.launchTime,materialized=saved?.materialized??0,correction=saved?.correction??0,cancelled=saved?.cancelled??0,revision=saved?.revision??0,closed=saved?.closed??false,fault=saved?.fault?{...saved.fault}:null;
  let preparing=false;
  const tokens=new WeakMap(),reserved=()=>sum(profile.streams.map((s,i)=>s.mass-prefixMass(s,next[i])));
  function diagnostics(){return{profile:LOGICAL_BURN_PROFILE,eventId:profile.eventId,type:profile.type,revision,throughTime:through,closed,fault:fault?{...fault}:null,allocated:profile.budget.total,materialized,reserved:reserved(),cancelled,accountingResidual:profile.budget.total-materialized-reserved()-cancelled,bodyCount:profile.bodyCount,streamCount:profile.streams.length,remainingCells:sum(profile.streams.map((s,i)=>s.count-next[i])),pendingStreams:next.filter((n,i)=>n<profile.streams[i].count).length,maxReadyCells,futureCellArrays:0,positionArchives:0};}
  const api={profile,diagnostics,
   prepare({throughTime,sampleCell=()=>null}={}){
    finite(throughTime,'throughTime');if(preparing||closed||fault||throughTime<through)throw new RangeError('Busy, closed, faulted or rewound logical source cursor');if(typeof sampleCell!=='function')throw new TypeError('sampleCell must be synchronous');
    const cells=[];
    for(let i=0;i<next.length;i++){const s=profile.streams[i];for(let k=next[i];k<s.count;k++){const cell=logicalBurnCell(profile,i,k);if(cell.time>throughTime)break;if(cells.length===maxReadyCells)throw new RangeError('Ready cell capacity exceeded before any sampling/commit');cells.push(cell);}}
    cells.sort((a,b)=>a.time-b.time||compare(a.key,b.key));
    let samples;preparing=true;try{samples=cells.map(cell=>{const value=sampleCell(cell,throughTime);if(value&&typeof value.then==='function')throw new TypeError('Asynchronous source sampling is not supported');return value;});}finally{preparing=false;}
    const token=Object.freeze({eventId:profile.eventId,throughTime,cells:Object.freeze(cells),samples:Object.freeze(samples),readyCount:cells.length,readyMass:sum(cells.map(c=>c.mass))});tokens.set(token,{revision});return token;
   },
   commit(token,{acceptedCount=token?.readyCount}={}){
    const tx=token&&tokens.get(token);if(preparing||!tx||tx.revision!==revision||closed||fault)throw new RangeError('Busy, stale, foreign, closed or faulted logical preparation');
    if(!Number.isSafeInteger(acceptedCount)||acceptedCount<0||acceptedCount>token.cells.length)throw new RangeError('acceptedCount must name the actual sorted prefix');tokens.delete(token);
    const proposed=[...next];for(let i=0;i<acceptedCount;i++){const c=token.cells[i];if(c.index!==proposed[c.streamIndex])throw new Error('Accepted cells are not a stream prefix');proposed[c.streamIndex]++;}
    for(let i=0;i<acceptedCount;i++){const y=token.cells[i].mass-correction,t=materialized+y;correction=(t-materialized)-y;materialized=t;}next=proposed;
    if(acceptedCount===token.cells.length)through=token.throughTime;else{fault={reason:'partial external source acceptance; not rolled back',acceptedCount,readyCount:token.cells.length,attemptedThroughTime:token.throughTime};if(acceptedCount)through=Math.max(through,token.cells[acceptedCount-1].time);}
    revision++;return diagnostics();
   },
   clone(){return make({next,through,materialized,correction,cancelled,revision,closed,fault});},
   clear(time){finite(time,'clear time');if(preparing||time<through)throw new RangeError('Busy source or clear would rewind logical time');if(!closed){cancelled+=reserved();next=profile.streams.map(s=>s.count);closed=true;fault=null;through=time;revision++;}return diagnostics();},
  };
  return Object.freeze(api);
 }
 return make();
}
