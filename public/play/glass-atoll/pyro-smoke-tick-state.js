import {PYRO_SMOKE_LIMITS as LIMIT} from './pyro-smoke-state.js';
import {parseSmokeDispersion,taylorDispersionFactors,validateDispersionMemory} from './pyro-smoke-dispersion.js';
import {finite,vec,safeId,positive,covariance,kernel,densityAt,columnAt,publicPacket,sumMass,mergePair,mergeDiagnostics,thermalFactors} from './pyro-smoke-tick-math.js';
import {createSmokeMergeGraph} from './pyro-smoke-merge-graph.js';

// Explicit opt-in physical model. Queues are accepted independently of density;
// only complete fences publish density/wind/cursors. Legacy state is unchanged.
export function createPyroSmokeTickState({time=0,fixedStep=1/20,capacity=4096,profiles={reference:{extinctionPerMassRGB:[1,1,1],singleScatteringAlbedo:.9}},diffusivity=[.6,.12,.6],coolSeconds=12,dragSeconds=2,ambientKelvin=300,wind=[0,0,0],maxStepsPerAdvance=200,maxPendingEmissions=8192,maxPendingWindEvents=1024,preferredNormalizedDistance=.75,preferredPeakError=.05,preferredColumnError=.05,dispersionModel='brownian',lagrangianSeconds=10}={}){
  parseSmokeDispersion({dispersionModel,lagrangianSeconds});const taylor=dispersionModel==='taylor';
  finite(time,'origin time');positive(fixedStep,'fixedStep');if(time+fixedStep===time)throw new RangeError('fixedStep is smaller than numeric clock resolution');positive(coolSeconds,'coolSeconds');positive(dragSeconds,'dragSeconds');positive(ambientKelvin,'ambientKelvin');
  for(const [v,n,max]of [[capacity,'capacity',LIMIT.maxCapacity],[maxStepsPerAdvance,'maxStepsPerAdvance',1000000],[maxPendingEmissions,'maxPendingEmissions',8192],[maxPendingWindEvents,'maxPendingWindEvents',LIMIT.maxPendingWindEvents]])if(!Number.isInteger(v)||v<1||v>max)throw new RangeError(`${n} requires integer1..${max}`);
  const K=vec(diffusivity,'diffusivity');if(K.some(v=>v<0))throw new RangeError('diffusivity must be nonnegative');
  for(const [v,n]of [[preferredNormalizedDistance,'preferredNormalizedDistance'],[preferredPeakError,'preferredPeakError'],[preferredColumnError,'preferredColumnError']]){finite(v,n);if(v<0)throw new RangeError(n+' must be nonnegative');}
  const profileMap=new Map();for(const [id,p]of Object.entries(profiles)){
    safeId(id,'profileId');const albedo=p.singleScatteringAlbedo??.9,extinction=vec(p.extinctionPerMassRGB??[1,1,1],'extinctionPerMassRGB',LIMIT.opticalCoefficient),ssa=typeof albedo==='number'?Array(3).fill(albedo):vec(albedo,'singleScatteringAlbedo');
    if(extinction.some(v=>v<0)||ssa.some(v=>!Number.isFinite(v)||v<0||v>1))throw new RangeError('Profiles require nonnegative extinction and0..1 SSA');profileMap.set(id,{id,extinctionPerMassRGB:extinction,singleScatteringAlbedoRGB:ssa});
  }
  if(!profileMap.size||profileMap.size>Math.min(capacity,LIMIT.maxProfiles))throw new RangeError('Profile count must be1..min(capacity,32)');
  const initialWind=vec(wind,'wind',LIMIT.velocity),maxStagingPackets=capacity+maxPendingEmissions;
  if(!Number.isSafeInteger(maxStagingPackets*maxStagingPackets))throw new RangeError('Pair keys exceed safe integer domain');
  let committed={tick:0,wind:initialWind,packets:[],revision:0,emitted:0,emittedCorrection:0,accepted:0,merges:0,forcedMerges:0,preferredSameSource:0,preferredSameProfile:0,peakPackets:0,stagingPeakPackets:0,totalTickSteps:0,maximumMergeDistance:0,maximumMergeNormalizedDistance:0,maximumMergePeakError:0,maximumMergeColumnError:0,maximumMergeOpticalDepthError:0,mergeLog:[],cacheHits:0,cacheMisses:0};
  let emissionQueue=[],windQueue=[],lastEmissionId=-1,requestedTime=time,lastAdvanceSteps=0,lastAdvanceFences=0,lastAdvanceFailure=null,busy=false;
  const queryKernels=new WeakMap(),clock=()=>time+committed.tick*fixedStep;
  function enter(){if(busy)throw new Error('Smoke state mutation is already in progress');busy=true;}
  function insert(queue,item){let lo=0,hi=queue.length;while(lo<hi){const m=(lo+hi)>>>1;if(queue[m].time<=item.time)lo=m+1;else hi=m;}queue.splice(lo,0,item);}
  function clonePacket(p){return {...p,mean:[...p.mean],covariance:[...p.covariance],...(p.L?{L:[...p.L]}:{})};}
  function queryPacket(p){if(!p._dirty)return p;let q=queryKernels.get(p);if(!q){q=clonePacket(p);kernel(q);queryKernels.set(p,q);}return q;}
  function parseEmission(source){
    if(!source||typeof source!=='object')throw new TypeError('Emission object required');let at=finite(source.time,'emission time');if(at<clock()-1e-10)throw new RangeError('Source is older than committed state');if(Math.abs(at-clock())<=1e-10)at=clock();
    const id=source.emissionId;if(!Number.isSafeInteger(id)||id<0||id<=lastEmissionId)throw new RangeError('emissionId must be strictly increasing and nonnegative');
    const profileId=source.profileId??'reference';if(!profileMap.has(profileId))throw new RangeError('Unknown profileId');const rawSourceId=source.sourceId,sourceId=rawSourceId==null?null:safeId(String(rawSourceId),'sourceId');
    const p={id,time:at,birthTime:at,sourceId,profileId,mass:positive(source.mass,'relative dry mass',LIMIT.referenceMass),mean:vec(source.mean,'mean',LIMIT.worldCoordinate),covariance:covariance(source.covariance).covariance,temperatureExcessK:finite(source.temperatureExcessK??0,'temperatureExcessK',LIMIT.thermalExcessK),buoyantVelocity:finite(source.buoyantVelocity??0,'buoyantVelocity',LIMIT.velocity),sourceCount:1,_dirty:true};
    if(taylor)p.dispersionQ=validateDispersionMemory(source.dispersionQ??1);else if(source.dispersionQ!==undefined)throw new RangeError('dispersionQ requires Taylor state');
    if(committed.emitted+sumMass(emissionQueue)+p.mass>LIMIT.referenceMass)throw new RangeError('Total relative mass exceeds numeric domain');kernel(p);return p;
  }
  function commitFence(end,advanceTick){
    const s={...committed,wind:[...committed.wind],packets:committed.packets.slice(),mergeLog:committed.mergeLog.slice()},owned=new Set();let eHead=0,wHead=0,at=clock();
    function own(i){let p=s.packets[i];if(!owned.has(p)){p=clonePacket(p);s.packets[i]=p;owned.add(p);}return p;}
    function evolve(start,finish){
      const dt=finish-start;if(!(dt>0))return;const f=thermalFactors(dt,coolSeconds,dragSeconds,ambientKelvin),dx=s.wind[0]*dt,dy=s.wind[1]*dt,dz=s.wind[2]*dt,dispersion=taylor?taylorDispersionFactors(dt,lagrangianSeconds):null;
      for(const p of s.packets){
        const varianceTime=taylor?dt*(1-p.dispersionQ)+p.dispersionQ*dispersion.freshTime:dt;
        finite(p.mean[0]+dx,'transported mean.x',LIMIT.worldCoordinate);finite(p.mean[1]+dy+p.buoyantVelocity*f.Ab+p.temperatureExcessK*f.positionPerK,'transported mean.y',LIMIT.worldCoordinate);finite(p.mean[2]+dz,'transported mean.z',LIMIT.worldCoordinate);
        for(let c=0;c<3;c++)finite(p.covariance[c*4]+2*K[c]*varianceTime,'diffused variance',LIMIT.covarianceElement);finite(p.temperatureExcessK*f.ea,'cooled temperature');finite(p.buoyantVelocity*f.eb+p.temperatureExcessK*f.velocityPerK,'buoyant velocity');if(taylor)validateDispersionMemory(p.dispersionQ*dispersion.decay);
      }
      for(let i=0;i<s.packets.length;i++){
        const p=own(i),varianceTime=taylor?dt*(1-p.dispersionQ)+p.dispersionQ*dispersion.freshTime:dt;
        p.mean[0]+=dx;p.mean[1]+=dy+p.buoyantVelocity*f.Ab+p.temperatureExcessK*f.positionPerK;p.mean[2]+=dz;p.buoyantVelocity=p.buoyantVelocity*f.eb+p.temperatureExcessK*f.velocityPerK;p.temperatureExcessK*=f.ea;
        for(let c=0;c<3;c++)p.covariance[c*4]+=2*K[c]*varianceTime;if(taylor)p.dispersionQ*=dispersion.decay;p._dirty=true;
      }
      if(s.packets.length)s.revision++;
    }
    while(true){const next=Math.min(windQueue[wHead]?.time??Infinity,emissionQueue[eHead]?.time??Infinity);if(next>end)break;if(next<at)throw new RangeError('Pending input predates this fence');evolve(at,next);at=next;
      while(windQueue[wHead]?.time===next)s.wind=[...windQueue[wHead++].velocity];
      while(emissionQueue[eHead]?.time===next){
        if(s.packets.length>=maxStagingPackets)throw new RangeError('Commit staging capacity exceeded');const p=clonePacket(emissionQueue[eHead++]);s.packets.push(p);owned.add(p);
        const y=p.mass-s.emittedCorrection,t=s.emitted+y;s.emittedCorrection=(t-s.emitted)-y;s.emitted=t;s.accepted++;s.revision++;s.stagingPeakPackets=Math.max(s.stagingPeakPackets,s.packets.length);
      }
    }
    evolve(at,end);
    if(s.packets.length>capacity){
      // A zero-time fence can still contain shared committed dirty kernels.
      for(let i=0;i<s.packets.length;i++)if(s.packets[i]._dirty)own(i);
      const graph=createSmokeMergeGraph(s.packets);
      while(s.packets.length>capacity){
        const selected=graph.select();let choice=null,quality=Infinity,choicePreferred=false;
        for(const c of selected){
          const a=s.packets[c.i],b=s.packets[c.j],m=mergePair(a,b,-(s.merges+1));let d;
          if(c.edge.diagnosticsCache){d=c.edge.diagnosticsCache;s.cacheHits++;}else{d=mergeDiagnostics(a,b,m,profileMap.get(a.profileId),{coolSeconds,dragSeconds,ambientKelvin});c.edge.diagnosticsCache=d;s.cacheMisses++;}
          const preferred=d.normalizedDistance<=preferredNormalizedDistance&&d.normalizedThermalTravelBound<=preferredNormalizedDistance&&d.sampledPeakRelativeError<=preferredPeakError&&d.sampledColumnRelativeError<=preferredColumnError,rank=preferred?(c.sameSource?0:1):2,q=rank*1e6+d.sampledColumnRelativeError+d.sampledPeakRelativeError+(d.normalizedDistance+d.normalizedThermalTravelBound)*.001;
          if(q<quality){choice={...c,merged:m,diagnostics:d};quality=q;choicePreferred=preferred;}
        }
        if(!choice)throw new RangeError('No same-profile capacity merge candidate');const d=choice.diagnostics,classification=choicePreferred?(choice.sameSource?'preferred-same-source-overlap':'preferred-profile-overlap'):'forced-profile-approximation';
        if(!choicePreferred)s.forcedMerges++;else if(choice.sameSource)s.preferredSameSource++;else s.preferredSameProfile++;
        s.merges++;s.maximumMergeDistance=Math.max(s.maximumMergeDistance,d.distanceMetres);s.maximumMergeNormalizedDistance=Math.max(s.maximumMergeNormalizedDistance,d.normalizedDistance);s.maximumMergePeakError=Math.max(s.maximumMergePeakError,d.sampledPeakRelativeError);s.maximumMergeColumnError=Math.max(s.maximumMergeColumnError,d.sampledColumnRelativeError);s.maximumMergeOpticalDepthError=Math.max(s.maximumMergeOpticalDepthError,d.sampledMaximumOpticalDepthError);
        s.mergeLog.push({classification,profileId:choice.merged.profileId,...d});if(s.mergeLog.length>32)s.mergeLog.shift();s.packets.splice(choice.j,1);s.packets.splice(choice.i,1,choice.merged);owned.add(choice.merged);s.revision++;graph.merged(choice.nodeA,choice.nodeB,choice.merged);
      }
    }
    if(s.packets.length>capacity||!Number.isFinite(sumMass(s.packets)))throw new RangeError('Invalid committed smoke packet set');s.peakPackets=Math.max(s.peakPackets,s.packets.length);
    if(advanceTick){s.tick++;s.totalTickSteps++;}
    const nextEmissions=emissionQueue.slice(eHead),nextWind=windQueue.slice(wHead);
    // No user callbacks or fallible work after this atomic publication boundary.
    committed=s;emissionQueue=nextEmissions;windQueue=nextWind;
  }
  const api={
    queueEmission(source){enter();try{if(emissionQueue.length>=maxPendingEmissions)throw new RangeError('Pending emission capacity exceeded; input not accepted');const p=parseEmission(source),next=emissionQueue.slice();insert(next,p);emissionQueue=next;lastEmissionId=p.id;return{accepted:true,emissionId:p.id,queued:true};}finally{busy=false;}},
    setWind(input={}){enter();try{const {time:requestedAt=clock(),velocity}=input;let at=requestedAt;finite(at,'wind event time');if(at<clock()-1e-10)throw new RangeError('Wind event is older than committed state');if(Math.abs(at-clock())<=1e-10)at=clock();const v=vec(velocity,'wind velocity',LIMIT.velocity),next=windQueue.slice(),old=next.findIndex(e=>e.time===at);if(old>=0)next[old]={time:at,velocity:v};else{if(next.length>=maxPendingWindEvents)throw new RangeError('Pending wind event capacity exceeded');insert(next,{time:at,velocity:v});}windQueue=next;return{queued:true,time:at};}finally{busy=false;}},
    advanceFence(target){enter();try{finite(target,'physical target time');if(target<requestedTime-1e-10)throw new RangeError('Physical target cannot rewind');const goal=Math.floor((target-time+1e-9)/fixedStep);if(!Number.isSafeInteger(goal)||goal<committed.tick)throw new RangeError('Physical target exceeds representable tick domain');requestedTime=target;let steps=0,fences=0,failedEnd=clock(),failedKind='same-clock';lastAdvanceSteps=0;lastAdvanceFences=0;lastAdvanceFailure=null;
      try{
        if(emissionQueue[0]?.time===clock()||windQueue[0]?.time===clock()){commitFence(failedEnd,false);fences++;lastAdvanceFences=fences;}
        while(committed.tick<goal&&steps<maxStepsPerAdvance){failedEnd=time+(committed.tick+1)*fixedStep;failedKind='tick';commitFence(failedEnd,true);steps++;lastAdvanceSteps=steps;}
      }catch(error){
        // Only completed commits count. This bounded failure record reports the
        // attempted boundary without publishing any failed private stage.
        lastAdvanceFailure={requestedTime:target,committedTime:clock(),failedCommitEndTime:failedEnd,failedCommitKind:failedKind,completedSteps:steps,completedSameClockFences:fences};throw error;
      }
      return{time:clock(),requestedTime:target,steps,fences,completed:committed.tick>=goal,behindSeconds:Math.max(0,target-clock()),uncommittedRemainderSeconds:committed.tick>=goal?Math.max(0,target-clock()):null,revision:committed.revision};
    }finally{busy=false;}},
    advanceTo(target){return api.advanceFence(target);},
    sampleMedium(point){const x=vec(point,'sample point',LIMIT.worldCoordinate),extinctionRGB=[0,0,0],scatteringRGB=[0,0,0];let density=0;for(const packet of committed.packets){const p=queryPacket(packet),rho=densityAt(p,x),profile=profileMap.get(p.profileId);density+=rho;for(let c=0;c<3;c++){const e=rho*profile.extinctionPerMassRGB[c];extinctionRGB[c]+=e;scatteringRGB[c]+=e*profile.singleScatteringAlbedoRGB[c];}}if(![density,...extinctionRGB,...scatteringRGB].every(Number.isFinite))throw new RangeError('Medium sample exceeded numeric range');return{density,extinctionRGB,scatteringRGB,units:'relative mass/m3; reference extinction and scattering per metre, uncalibrated'};},
    columnOpticalDepth({origin,direction,start=0,end}={}){const o=vec(origin,'ray origin',LIMIT.worldCoordinate),d=vec(direction,'ray direction'),size=Math.hypot(...d);if(!(size>0)||Math.abs(size-1)>1e-6)throw new RangeError('Ray direction must be unit length');for(let i=0;i<3;i++)d[i]/=size;finite(start,'ray start');finite(end,'ray end');if(start<0||end<start)throw new RangeError('Ray interval must satisfy0<=start<=end');const opticalDepthRGB=[0,0,0];let columnMass=0;for(const packet of committed.packets){const p=queryPacket(packet),mass=columnAt(p,o,d,start,end),profile=profileMap.get(p.profileId);columnMass+=mass;for(let c=0;c<3;c++)opticalDepthRGB[c]+=mass*profile.extinctionPerMassRGB[c];}if(![columnMass,...opticalDepthRGB].every(Number.isFinite))throw new RangeError('Optical depth exceeded numeric range');return{columnMass,opticalDepthRGB,transmissionRGB:opticalDepthRGB.map(v=>Math.exp(-v)),units:'relative mass/m2 and reference dimensionless optical depth; numerical erf approximation, not an unbiased renderer'};},
    snapshot(){return{schema:'glass-atoll.pyro-smoke-state.v1',stateModel:'tick-graph-v1',...(taylor?{dispersion:{model:dispersionModel,lagrangianSeconds,diffusivity:[...K]}}:{}),time:clock(),requestedTime,tick:committed.tick,revision:committed.revision,currentWind:[...committed.wind],packets:committed.packets.map(publicPacket),profiles:Array.from(profileMap.values(),p=>({id:p.id,extinctionPerMassRGB:[...p.extinctionPerMassRGB],singleScatteringAlbedoRGB:[...p.singleScatteringAlbedoRGB]})),ledger:{emitted:committed.emitted,airborne:sumMass(committed.packets),pendingMass:sumMass(emissionQueue),deposited:0,escaped:0,explicitlyCleared:0},pendingEmissions:emissionQueue.length,pendingWindEvents:windQueue.length};},
    diagnostics(){const s=committed,airborne=sumMass(s.packets);return{version:'pyro-smoke-tick-state-v1',stateModel:'tick-graph-v1',...(taylor?{dispersion:{model:dispersionModel,lagrangianSeconds,diffusivity:[...K]}}:{}),time:clock(),requestedTime,revision:s.revision,packetCount:s.packets.length,capacity,peakPacketCount:s.peakPackets,stagingPeakPacketCount:s.stagingPeakPackets,maxStagingPackets,pendingEmissions:emissionQueue.length,pendingWindEvents:windQueue.length,pendingSameClockEmissions:emissionQueue.filter(e=>e.time===clock()).length,profileCount:profileMap.size,acceptedSources:s.accepted,lastEmissionId,totalTickSteps:s.totalTickSteps,lastAdvanceSteps,lastAdvanceFences,lastAdvanceFailure:lastAdvanceFailure?{...lastAdvanceFailure}:null,fixedStep,maxStepsPerAdvance,ledger:{emitted:s.emitted,airborne,pendingMass:sumMass(emissionQueue),residual:s.emitted-airborne,deposited:0,escaped:0,explicitlyCleared:0},merges:s.merges,forcedMerges:s.forcedMerges,preferredSameSourceMerges:s.preferredSameSource,preferredSameProfileMerges:s.preferredSameProfile,maximumMergeDistanceMetres:s.maximumMergeDistance,maximumMergeNormalizedDistance:s.maximumMergeNormalizedDistance,maximumSampledMergePeakRelativeError:s.maximumMergePeakError,maximumSampledMergeColumnRelativeError:s.maximumMergeColumnError,maximumSampledMergeOpticalDepthError:s.maximumMergeOpticalDepthError,diagnosticCacheHits:s.cacheHits,diagnosticCacheMisses:s.cacheMisses,recentMerges:s.mergeLog.map(v=>({...v,sampledOpticalDepthRGBAbsoluteError:[...v.sampledOpticalDepthRGBAbsoluteError]})),units:'relative dry mass; metres; physical seconds; authored m2/reference-mass optical profiles. NOT calibrated kg/PM.',limits:['Explicit tick-graph-v1; same-clock inputs remain pending until an advance fence.','Fences and causal input availability are part of deterministic replay; arbitrary fence partitions are not equivalent.','Public density is committed only; capacity+maxPending bounds private staging.','Source transport/thermal model and sampled merge quality remain approximations; no CFD, deposition or global optical compression bound.','Graph and diagnostic caches live for one common-time commit only.']};}
  };return api;
}
