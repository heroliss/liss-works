import {COMPLEX_FIREWORK_TYPES} from './complex-fireworks.js';
/* Timestamped source adapter for pyro-smoke-state.js; no renderer/main wiring.
 * Areas are AUTHOR-SET reference dry extinction area / relative units, not kg,
 * measured PM, explosive yield, audio energy or calibrated shell smoke output.
 * With state profile `reference`=[1,1,1], numeric mass equals reference area.
 * Other optical profiles must preserve the caller's declared reference units.
 * Gaussian means/covariances and buoyancy below are bounded surrogates, not CFD.
 *
 * Order: stage all available drainEvents -> flushThrough(physicalTime) ->
 * state.advanceTo(physicalTime). Never advance state beyond an unconsumed event.
 * Same-time events newly created after a flush remain legal; their cross-flush
 * tie order is actual arrival order, not an unknowable future event ordering.
 */
export const PYRO_SMOKE_EVENT_DEFAULTS=Object.freeze({burstArea:20,launchArea:.35,fanLaunchArea:.1,bouquetLaunchArea:2,packetsPerEvent:9,packetSpacingSeconds:.075});
const TYPES=new Set(['peony','chrysanthemum','willow','palm','ring','heart','crossette','strobe','fan','bouquet',...COMPLEX_FIREWORK_TYPES.map(t=>t.id)]);
const coordinateLimit=1e9,areaLimit=1e6,maximumKeys=16384;
const fail=(message,Type=RangeError)=>{throw new Type(message);};
const finite=(v,label)=>{if(!Number.isFinite(v))fail(label+' must be finite');return v;};
const text=(v,label,max=128)=>{if(typeof v!=='string'||!v.length||v.length>max)fail(label+' requires a nonempty string up to'+max+' characters',TypeError);return v;};
const integer=(v,label,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(v)||v<0||v>max)fail(label+' requires a nonnegative safe integer');return v;};
const compareText=(a,b)=>a<b?-1:a>b?1:0;
const compareEvent=(a,b)=>a.time-b.time||(a.kind==='launch'?0:1)-(b.kind==='launch'?0:1)||compareText(a.eventId,b.eventId)||compareText(a.type,b.type)||a.seed-b.seed;
function eventRecord(event){
  if(!event||typeof event!=='object')fail('Smoke source event must be an object',TypeError);
  if(event.kind!=='launch'&&event.kind!=='burst')fail('Smoke source kind must be launch or burst');
  const kind=event.kind,time=finite(event.time,'event.time'),eventId=text(event.eventId,'event.eventId'),type=text(event.type,'event.type',32),seed=integer(event.seed,'event.seed',4294967295);
  if(!TYPES.has(type))fail('Unsupported fireworks type');
  if(!event.position||event.position.length!==3)fail('event.position requires three world coordinates',TypeError);
  const position=Array.from(event.position,(v,i)=>{finite(v,'event.position['+i+']');if(Math.abs(v)>coordinateLimit)fail('event position outside smoke numeric domain');return v;});
  // The fan emits9 separate launch records; bouquet emits1. Neither has an
  // aerial burst record in production. Reject fabricated ground bursts.
  if(kind==='burst'&&(type==='fan'||type==='bouquet'||type==='display-vfan'))fail('Ground effect has launch smoke, not an aerial burst smoke event');
  const key=JSON.stringify([eventId,kind,time]);
  return{kind,time,eventId,type,seed,position,key,fingerprint:JSON.stringify([type,seed,position])};
}
function derivedRandom(event){
  // Isolated, domain-separated seed; never imports or advances star/audio RNG.
  let h=2166136261;for(const c of 'pyro-smoke-source-v1\0'+event.key+'\0'+event.seed)h=Math.imul(h^c.charCodeAt(0),16777619);
  let state=h>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
function sourcePackets(event,area,profileId,sourceId){
  const burst=event.kind==='burst',rng=derivedRandom(event),spread=burst?2.6:.2,sigma=burst?[1.6,1.1,1.6]:[.22,.35,.22],offsets=[[0,0,0]],base=[...event.position];
  if(!burst)base[1]+=.25;
  // Four deterministic antipodal pairs plus the centre: no arbitrary centre
  // drift at source construction, bounded spread, nine equal Gaussian kernels.
  for(let i=0;i<4;i++){const y=2*rng()-1,a=2*Math.PI*rng(),r=spread*Math.cbrt(rng()),s=Math.sqrt(1-y*y),p=[r*s*Math.cos(a),r*y,r*s*Math.sin(a)];offsets.push(p,p.map(v=>-v));}
  let assigned=0;return offsets.map((offset,i)=>{
    // Last-packet roundoff closure is not a source-gain redistribution.
    const mass=i===8?area-assigned:area/9;assigned+=mass;
    return{time:event.time+i*PYRO_SMOKE_EVENT_DEFAULTS.packetSpacingSeconds,sourceId,profileId,mass,mean:base.map((v,c)=>v+offset[c]),covariance:[sigma[0]**2,0,0,0,sigma[1]**2,0,0,0,sigma[2]**2],temperatureExcessK:burst?12:25,buoyantVelocity:burst?.35:.2};
  });
}
function stateInfo(state){
  if(!state||typeof state.queueEmission!=='function'||typeof state.diagnostics!=='function')fail('state requires queueEmission and diagnostics methods',TypeError);
  const d=state.diagnostics();finite(d.time,'state physical time');integer(d.lastEmissionId+1,'state next emission ID');return d;
}

/** Bounded emitter. clearForState replaces a caller-cleared physical state;
 * it cannot delete packets from the old state and never resets the ID sequence.
 * Queue failure is surfaced and locks injection until explicit clearForState;
 * no silent partial-source retry or source birth-time shift is performed.
 */
export function createPyroSmokeEvents({state,profileId='reference',burstArea=20,launchArea=.35,fanLaunchArea=.1,bouquetLaunchArea=2,maxPendingEvents=512,maxRememberedEvents=2048}={}){
  let boundState=state;const initial=stateInfo(state);text(profileId,'profileId');
  const parameters={burstArea,launchArea,fanLaunchArea,bouquetLaunchArea};for(const [k,v]of Object.entries(parameters)){finite(v,k);if(v<0||v>areaLimit)fail(k+' requires0..'+areaLimit+' authored reference area');}
  for(const [k,v]of Object.entries({maxPendingEvents,maxRememberedEvents})){integer(v,k,maximumKeys);if(v<1)fail(k+' must be positive');}
  if(maxPendingEvents>maxRememberedEvents)fail('maxPendingEvents cannot exceed maxRememberedEvents');
  const pending=new Map(),seen=new Map(),recent=[];
  let closedThrough=-Infinity,nextEmissionId=initial.lastEmissionId+1,nextSourceId=0,fault=null,revision=0,clears=0,stagedEvents=0,injectedEvents=0,duplicates=0,staleEvents=0,queuedPackets=0,queuedReferenceArea=0,areaCorrection=0,clearedPendingEvents=0,peakKeys=0;
  const amount=e=>e.kind==='burst'?burstArea:(e.type==='fan'||e.type==='display-vfan')?fanLaunchArea:e.type==='bouquet'?bouquetLaunchArea:launchArea;
  function pruneSeen(){for(const [key,value]of seen)if(value.time<closedThrough)seen.delete(key);}
  function ready(){if(fault)throw new Error('Smoke source injection is faulted; explicit clearForState required: '+fault.message);}
  function parseBatch(events){
    if(!Array.isArray(events))fail('stage requires an event array',TypeError);
    const proposed=new Map();let duplicateCount=0,staleCount=0;
    for(const raw of events){const e=eventRecord(raw),known=proposed.get(e.key)||pending.get(e.key)||seen.get(e.key);
      if(known){if(known.fingerprint!==e.fingerprint)fail('Conflicting world source data for the same event key');duplicateCount++;continue;}
      if(e.time<closedThrough){staleCount++;continue;}
      proposed.set(e.key,e);
    }
    if(pending.size+proposed.size>maxPendingEvents)fail('Pending source-event capacity exceeded; batch not accepted');
    // Never evict a same-watermark key: if paused-time creation exceeds this
    // bound, reject explicitly rather than forget/replay an old source.
    if(seen.size+pending.size+proposed.size>maxRememberedEvents)fail('Source identity capacity exceeded at current watermark; advance physical time before adding more events');
    return{proposed,duplicateCount,staleCount};
  }
  function stage(events){ready();const {proposed,duplicateCount,staleCount}=parseBatch(events);for(const [key,e]of proposed)pending.set(key,e);stagedEvents+=proposed.size;duplicates+=duplicateCount;staleEvents+=staleCount;peakKeys=Math.max(peakKeys,seen.size+pending.size);if(proposed.size)revision++;return{staged:proposed.size,duplicates:duplicateCount,stale:staleCount,pending:pending.size};}
  function flushThrough(time){
    ready();finite(time,'flush physical time');if(time<closedThrough)fail('Smoke source watermark cannot rewind');
    const sources=Array.from(pending.values()).filter(e=>e.time<=time).sort(compareEvent),d=stateInfo(boundState);
    if(sources.some(e=>e.time<d.time-1e-10))fail('Source predates committed state; consume events before state.advanceTo, never retime the source');
    if(!Number.isSafeInteger(nextEmissionId+sources.length*9))fail('Emission ID domain exhausted before batch injection');
    let eventsThisCall=0,packetsThisCall=0,areaThisCall=0;
    for(const event of sources){
      // The globally monotonic first emission ID also separates identities
      // when a new adapter is deliberately bound to an already populated state.
      const area=amount(event),sourceId='pyro-smoke-source-'+nextEmissionId+'-'+nextSourceId++,packets=area>0?sourcePackets(event,area,profileId,sourceId):[];let acceptedForEvent=0;
      try{for(const packet of packets){const result=boundState.queueEmission({...packet,emissionId:nextEmissionId});if(result?.accepted!==true)throw new Error('State did not accept smoke packet');nextEmissionId++;acceptedForEvent++;queuedPackets++;packetsThisCall++;const y=packet.mass-areaCorrection,t=queuedReferenceArea+y;areaCorrection=(t-queuedReferenceArea)-y;queuedReferenceArea=t;}}
      catch(error){fault={message:String(error.message||error),eventId:event.eventId,sourceId,acceptedPackets:acceptedForEvent,expectedPackets:packets.length};revision++;throw error;}
      pending.delete(event.key);seen.set(event.key,{time:event.time,fingerprint:event.fingerprint,status:'injected'});injectedEvents++;eventsThisCall++;areaThisCall+=area;revision++;
      recent.push({eventId:event.eventId,kind:event.kind,type:event.type,time:event.time,position:[...event.position],sourceId,derivedSeedDomain:'pyro-smoke-source-v1',packetCount:packets.length,referenceArea:area,lastBirthTime:packets.at(-1)?.time??null});if(recent.length>32)recent.shift();
    }
    closedThrough=time;pruneSeen();return{events:eventsThisCall,packets:packetsThisCall,referenceArea:areaThisCall,closedThrough,nextEmissionId,pending:pending.size};
  }
  return{
    stage,flushThrough,
    consume(events,{throughTime}={}){finite(throughTime,'consume throughTime');if(throughTime<closedThrough)fail('Smoke source watermark cannot rewind');const staged=stage(events);return{...flushThrough(throughTime),staged};},
    clearForState(nextState,{time}={}){
      finite(time,'clear physical time');if(time<closedThrough)fail('Cleared-state watermark cannot rewind');const d=stateInfo(nextState);if(Math.abs(d.time-time)>1e-10)fail('New smoke state must start at clear physical time; construct it with {time}, do not replay from time0');
      // Retain identity tombstones for pending/partial sources too. At equal
      // physical time old launch/burst is rejected, a genuinely new ID is legal.
      for(const [key,e]of pending)seen.set(key,{time:e.time,fingerprint:e.fingerprint,status:'explicitly-cleared'});
      clearedPendingEvents+=pending.size;pending.clear();boundState=nextState;closedThrough=time;nextEmissionId=Math.max(nextEmissionId,d.lastEmissionId+1);fault=null;clears++;revision++;pruneSeen();return{closedThrough,nextEmissionId,clears,rememberedEvents:seen.size};
    },
    diagnostics(){return{version:'pyro-smoke-events-v1',revision,closedThrough:Number.isFinite(closedThrough)?closedThrough:null,nextEmissionId,nextSourceId,pendingEvents:pending.size,rememberedEvents:seen.size,maxPendingEvents,maxRememberedEvents,peakRememberedAndPendingKeys:peakKeys,stagedEvents,injectedEvents,duplicates,staleEvents,queuedPacketsLifetime:queuedPackets,referenceAreaQueuedLifetime:queuedReferenceArea,clears,clearedPendingEvents,fault:fault?{...fault}:null,parameters:{...parameters,profileId,packetsPerEvent:9,packetSpacingSeconds:.075},recentSources:recent.map(e=>({...e,position:[...e.position]})),units:'authored reference dry extinction area / relative mass units at a unit reference optical coefficient; NOT measured kg/PM, audio energy or explosive yield',limits:['CPU adapter only; no main/render/physics/audio integration','9 bounded source means/SPD Gaussian kernels; Gaussian spatial support itself is infinite','mass conserved by downstream state, no age fade/deletion or deposited-mass model here','temperature excess, initial buoyancy, source spread and isotropic kernel sizes are authored surrogates, not CFD','completed drain world position is authoritative; no source relocation to current frame/camera','stage complete batches before flush, then advance state; equal-time events created after flush use arrival-order tie ordering','bounded identity storage never silently evicts same-watermark events; capacity rejects new input','clearForState replaces caller-cleared state, retains IDs/tombstones, no old event replay','state queue failure can be partial and is explicit/fault-locked until clearForState; caller must size queues/profiles before integration']};}
  };
}

// Optional trajectory adapter reuses the exact legacy source geometry/RNG.
export {sourcePackets as createPyroSmokeEventPackets};
