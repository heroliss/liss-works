import {parseSmokeDispersion,taylorDispersionFactors,validateDispersionMemory} from './pyro-smoke-dispersion.js';
/* Bounded CPU smoke state. Relative dry mass, metres and physical seconds.
 * Profiles use authored m²/reference-mass coefficients, NOT measured kg/PM.
 * No renderer, exposure, camera, event lifetime, chemistry or fluid solver.
 */
const PI=Math.PI,GAUSS3=(2*PI)**1.5,EPS=Number.EPSILON;
export const PYRO_SMOKE_LIMITS=Object.freeze({maxCapacity:65536,maxProfiles:32,maxPendingEmissions:16384,maxPendingWindEvents:4096,worldCoordinate:1e9,covarianceElement:1e20,minimumCholeskyVariance:1e-24,referenceMass:1e12,opticalCoefficient:1e12,thermalExcessK:1e6,velocity:1e6});
const fail=(message,Type=RangeError)=>{throw new Type(message);};
const finite=(v,name,limit=Infinity)=>{if(!Number.isFinite(v)||Math.abs(v)>limit)fail(`${name} must be finite within ±${limit}`);return v;};
const vec=(v,name,limit=Infinity)=>{if(!v||v.length!==3)fail(`${name} requires three components`,TypeError);return Array.from(v,(x,i)=>finite(x,`${name}[${i}]`,limit));};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],norm=v=>Math.hypot(...v);
const safeId=(v,name)=>{if(typeof v!=='string'||!v.length||v.length>128)fail(`${name} must be a nonempty string of at most128 characters`,TypeError);return v;};
const positive=(v,name,limit=Infinity)=>{finite(v,name,limit);if(!(v>0))fail(`${name} must be positive`);return v;};
function covariance(value){
  if(!value||value.length!==9)fail('covariance requires a row-major3x3 matrix',TypeError);
  const c=Array.from(value,(v,i)=>finite(v,`covariance[${i}]`,PYRO_SMOKE_LIMITS.covarianceElement)),scale=Math.max(c[0],c[4],c[8]);
  if(!(scale>0))fail('covariance must be positive definite');
  for(const [a,b]of [[1,3],[2,6],[5,7]]){if(Math.abs(c[a]-c[b])>64*EPS*scale)fail('covariance must be symmetric');c[a]=c[b]=(c[a]+c[b])*.5;}
  const L=Array(9).fill(0);
  for(let i=0;i<3;i++)for(let j=0;j<=i;j++){
    let s=c[i*3+j];for(let k=0;k<j;k++)s-=L[i*3+k]*L[j*3+k];
    if(i===j){if(!(s>=PYRO_SMOKE_LIMITS.minimumCholeskyVariance))fail('covariance must be SPD with Cholesky variances>=1e-24 m2 in the published numeric domain');L[i*3+j]=Math.sqrt(s);}else L[i*3+j]=s/L[j*3+j];
  }
  const determinantRoot=L[0]*L[4]*L[8];if(!(determinantRoot>0)||!Number.isFinite(determinantRoot))fail('covariance determinant exceeds numeric range');
  return {covariance:c,L,determinantRoot};
}
const whiten=(L,v)=>{const x=v[0]/L[0],y=(v[1]-L[3]*x)/L[4];return[x,y,(v[2]-L[6]*x-L[7]*y)/L[8]];};
function kernel(p){
  if(p._dirty){Object.assign(p,covariance(p.covariance));p._normalization=p.mass/(GAUSS3*p.determinantRoot);positive(p._normalization,'Gaussian normalization');p._dirty=false;}
  return p;
}
const densityAt=(p,x)=>{kernel(p);const q=whiten(p.L,x.map((v,i)=>v-p.mean[i]));return p._normalization*Math.exp(-.5*dot(q,q));};
// Abramowitz-Stegun7.1.26 erfc approximation (~1.5e-7 absolute erf error).
// Use erfc differences on same-sign intervals to avoid subtracting near1.
function erfcPositive(x){if(x===Infinity)return 0;const t=1/(1+.3275911*x);return (((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);}
function erfDifference(a,b){
  if(a===b)return 0;
  // Short intervals use a two-node Gauss integral of erf', avoiding the
  // nonzero erf(0) approximation and cancellation in nearly equal tails.
  const width=b-a;if(Number.isFinite(width)&&width<1e-3/(1+Math.max(Math.abs(a),Math.abs(b)))){const h=width*.5,m=a+h,q=h/Math.sqrt(3);return 2/Math.sqrt(PI)*h*(Math.exp(-((m-q)**2))+Math.exp(-((m+q)**2)));}
  if(a>=0)return erfcPositive(a)-erfcPositive(b);if(b<=0)return erfcPositive(-b)-erfcPositive(-a);return(1-erfcPositive(-a))+(1-erfcPositive(b));
}
function columnAt(p,o,d,start,end){
  if(start===end)return 0;kernel(p);
  const q=whiten(p.L,o.map((v,i)=>v-p.mean[i])),v=whiten(p.L,d),A=dot(v,v),b=dot(q,v)/A,s=Math.sqrt(A*.5),perp=q.map((x,i)=>x-v[i]*b);
  const out=p._normalization*Math.exp(-.5*dot(perp,perp))*Math.sqrt(PI/(2*A))*erfDifference(s*(start+b),s*(end+b));
  if(!Number.isFinite(out)||out<0)fail('Gaussian column exceeded numeric range');return out;
}
function publicPacket(p){return {id:p.id,sourceId:p.sourceId,profileId:p.profileId,birthTime:p.birthTime,mass:p.mass,mean:[...p.mean],covariance:[...p.covariance],temperatureExcessK:p.temperatureExcessK,buoyantVelocity:p.buoyantVelocity,sourceCount:p.sourceCount,...(p.dispersionQ===undefined?{}:{dispersionQ:p.dispersionQ})};}
function sumMass(packets){let sum=0,c=0;for(const p of packets){const y=p.mass-c,t=sum+y;c=(t-sum)-y;sum=t;}return sum;}
function mergePair(a,b,id){
  if(a.profileId!==b.profileId)fail('Cross-profile merges are not permitted');
  const mass=a.mass+b.mass;positive(mass,'merged relative mass',PYRO_SMOKE_LIMITS.referenceMass);
  const wb=b.mass/mass,wa=a.mass/mass,delta=b.mean.map((v,i)=>v-a.mean[i]),mean=a.mean.map((v,i)=>v+wb*delta[i]),c=Array(9);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)c[i*3+j]=wa*a.covariance[i*3+j]+wb*b.covariance[i*3+j]+wa*wb*delta[i]*delta[j];
  const p={id,sourceId:a.sourceId===b.sourceId?a.sourceId:null,profileId:a.profileId,birthTime:Math.min(a.birthTime,b.birthTime),mass,mean,covariance:c,temperatureExcessK:wa*a.temperatureExcessK+wb*b.temperatureExcessK,buoyantVelocity:wa*a.buoyantVelocity+wb*b.buoyantVelocity,sourceCount:a.sourceCount+b.sourceCount,_dirty:true};
  if(a.dispersionQ!==undefined){if(b.dispersionQ===undefined)fail('Cannot merge mixed dispersion models');p.dispersionQ=validateDispersionMemory(a.dispersionQ+wb*(b.dispersionQ-a.dispersionQ));}
  kernel(p);return p;
}
const RAY_DIRECTIONS=Object.freeze([[1,0,0],[0,1,0],[0,0,1],...Array.from({length:9},(_,i)=>{const y=1-2*(i+.5)/9,a=i*2.399963229728653,r=Math.sqrt(1-y*y);return[r*Math.cos(a),y,r*Math.sin(a)];})]);
function mergeDiagnostics(a,b,m,profile,{coolSeconds,dragSeconds,ambientKelvin}){
  const delta=b.mean.map((v,i)=>v-a.mean[i]),distance=norm(delta),combined=covariance(a.covariance.map((v,i)=>v+b.covariance[i])),q=whiten(combined.L,delta),normalizedDistance=norm(q);
  const points=[a.mean,b.mean,m.mean];for(const p of [a,b])for(let c=0;c<3;c++)for(const sign of [-1,1]){const v=[...p.mean];v[c]+=sign*Math.sqrt(p.covariance[c*3+c]);points.push(v);}
  let peakError=0,peakReference=0,maximumSampledNewDensity=0;
  for(const x of points){const before=densityAt(a,x)+densityAt(b,x),after=densityAt(m,x);peakError=Math.max(peakError,Math.abs(after-before));peakReference=Math.max(peakReference,before);maximumSampledNewDensity=Math.max(maximumSampledNewDensity,after);}
  const extent=distance+6*Math.sqrt(Math.max(...[a,b,m].flatMap(p=>[p.covariance[0],p.covariance[4],p.covariance[8]])));let colError=0,colReference=0,relativePerRay=0;
  for(const centre of [a.mean,b.mean,m.mean])for(const d of RAY_DIRECTIONS){const o=centre.map((v,i)=>v-d[i]*extent),before=columnAt(a,o,d,0,extent*2)+columnAt(b,o,d,0,extent*2),after=columnAt(m,o,d,0,extent*2),error=Math.abs(after-before);colError=Math.max(colError,error);colReference=Math.max(colReference,before);relativePerRay=Math.max(relativePerRay,2*error/Math.max(before+after,1e-300));}
  const k=Math.max(...profile.extinctionPerMassRGB);
  const differentialThermalTravelBoundMetres=dragSeconds*Math.abs(a.buoyantVelocity-b.buoyantVelocity)+9.81/ambientKelvin*dragSeconds*coolSeconds*Math.abs(a.temperatureExcessK-b.temperatureExcessK),normalizedThermalTravelBound=differentialThermalTravelBoundMetres/Math.sqrt(a.covariance[4]+b.covariance[4]);
  return {distanceMetres:distance,normalizedDistance,differentialThermalTravelBoundMetres,normalizedThermalTravelBound,sampledPeakAbsoluteError:peakError,sampledPeakRelativeError:peakError/Math.max(peakReference,1e-300),maximumSampledNewDensity,sampledColumnAbsoluteError:colError,sampledColumnRelativeError:colError/Math.max(colReference,1e-300),maximumPerRaySymmetricRelativeError:relativePerRay,sampledOpticalDepthRGBAbsoluteError:profile.extinctionPerMassRGB.map(v=>v*colError),sampledMaximumOpticalDepthError:k*colError,peakSamples:points.length,columnRays:36,limits:'15 spatial points and36 finite rays; sampled errors, NOT global peak/column/source bounds. Spatial moments are preserved at merge time, not future heterogeneous thermal evolution.'};
}
function thermalFactors(dt,coolSeconds,dragSeconds,ambientKelvin){
  const a=1/coolSeconds,b=1/dragSeconds,ea=Math.exp(-a*dt),eb=Math.exp(-b*dt),Aa=-Math.expm1(-a*dt)/a,Ab=-Math.expm1(-b*dt)/b,c=9.81/ambientKelvin;
  if(Math.abs(a-b)<1e-10)return {ea,eb,Ab,velocityPerK:c*dt*eb,positionPerK:c*(Ab-dt*eb)/b};
  return {ea,eb,Ab,velocityPerK:c*(ea-eb)/(b-a),positionPerK:c*(Aa-Ab)/(b-a)};
}

/** CPU state only. Call queueEmission/setWind before advancing past their time.
 * Identical timestamped input events => identical fixed-tick30/60/120Hz state.
 * advanceTo may return behindSeconds>0; repeat it to catch up, never skip time.
 */
export function createPyroSmokeState({time=0,fixedStep=1/20,capacity=4096,profiles={reference:{extinctionPerMassRGB:[1,1,1],singleScatteringAlbedo:.9}},diffusivity=[.6,.12,.6],coolSeconds=12,dragSeconds=2,ambientKelvin=300,wind=[0,0,0],maxStepsPerAdvance=200,maxPendingEmissions=8192,maxPendingWindEvents=1024,preferredNormalizedDistance=.75,preferredPeakError=.05,preferredColumnError=.05,dispersionModel='brownian',lagrangianSeconds=10}={}){
  parseSmokeDispersion({dispersionModel,lagrangianSeconds});const taylor=dispersionModel==='taylor';
  finite(time,'origin time');positive(fixedStep,'fixedStep');if(time+fixedStep===time)fail('fixedStep is smaller than the numeric clock resolution');positive(coolSeconds,'coolSeconds');positive(dragSeconds,'dragSeconds');positive(ambientKelvin,'ambientKelvin');
  for(const [v,n,max]of [[capacity,'capacity',PYRO_SMOKE_LIMITS.maxCapacity],[maxStepsPerAdvance,'maxStepsPerAdvance',1000000],[maxPendingEmissions,'maxPendingEmissions',PYRO_SMOKE_LIMITS.maxPendingEmissions],[maxPendingWindEvents,'maxPendingWindEvents',PYRO_SMOKE_LIMITS.maxPendingWindEvents]])if(!Number.isInteger(v)||v<1||v>max)fail(`${n} requires integer1..${max}`);
  const K=vec(diffusivity,'diffusivity');if(K.some(v=>v<0))fail('diffusivity must be nonnegative');for(const [v,n]of [[preferredNormalizedDistance,'preferredNormalizedDistance'],[preferredPeakError,'preferredPeakError'],[preferredColumnError,'preferredColumnError']]){finite(v,n);if(v<0)fail(`${n} must be nonnegative`);}
  const profileMap=new Map();for(const [id,p]of Object.entries(profiles)){
    safeId(id,'profileId');const extinction=vec(p.extinctionPerMassRGB??[1,1,1],'extinctionPerMassRGB',PYRO_SMOKE_LIMITS.opticalCoefficient),ssa=typeof(p.singleScatteringAlbedo??.9)==='number'?Array(3).fill(p.singleScatteringAlbedo??.9):vec(p.singleScatteringAlbedo,'singleScatteringAlbedo');
    if(extinction.some(v=>v<0)||ssa.some(v=>!Number.isFinite(v)||v<0||v>1))fail('Profiles require nonnegative extinction and0..1 SSA');profileMap.set(id,{id,extinctionPerMassRGB:extinction,singleScatteringAlbedoRGB:ssa});
  }
  if(!profileMap.size||profileMap.size>Math.min(capacity,PYRO_SMOKE_LIMITS.maxProfiles))fail('Profile count must be1..min(capacity,32) so a same-profile capacity merge is always possible');
  let currentWind=vec(wind,'wind',PYRO_SMOKE_LIMITS.velocity),tick=0,requestedTime=time,lastEmissionId=-1,revision=0,emitted=0,emittedCorrection=0,accepted=0,merges=0,forcedMerges=0,preferredSameSource=0,preferredSameProfile=0,peakPackets=0,totalTickSteps=0;
  let maximumMergeDistance=0,maximumMergeNormalizedDistance=0,maximumMergePeakError=0,maximumMergeColumnError=0,maximumMergeOpticalDepthError=0,lastAdvanceSteps=0;
  const packets=[],emissionQueue=[],windQueue=[],mergeLog=[],clock=()=>time+tick*fixedStep;
  function insert(queue,item){let lo=0,hi=queue.length;while(lo<hi){const m=(lo+hi)>>>1;if(queue[m].time<=item.time)lo=m+1;else hi=m;}queue.splice(lo,0,item);}
  function compact(){
    while(packets.length>capacity){
      const groups=new Map(),sameSourceGroups=new Map();for(let i=0;i<packets.length;i++){const p=packets[i],g=groups.get(p.profileId)||[];g.push(i);groups.set(p.profileId,g);if(p.sourceId!==null){const key=p.profileId+'\0'+p.sourceId,s=sameSourceGroups.get(key)||[];s.push(i);sameSourceGroups.set(key,s);}}
      const pool=[],seen=new Set();
      function candidate(i,j,sameSource){if(i>j)[i,j]=[j,i];const key=i+','+j;if(seen.has(key))return;seen.add(key);const a=packets[i],b=packets[j],distance2=a.mean.reduce((s,v,c)=>s+(v-b.mean[c])**2,0),scale=a.covariance[0]+a.covariance[4]+a.covariance[8]+b.covariance[0]+b.covariance[4]+b.covariance[8],score=distance2/scale;pool.push({i,j,sameSource,score});}
      for(const group of sameSourceGroups.values()){group.sort((i,j)=>packets[i].mean[0]-packets[j].mean[0]||packets[i].id-packets[j].id);for(let k=0;k<group.length-1;k++)candidate(group[k],group[k+1],true);}
      for(const group of groups.values()){group.sort((i,j)=>packets[i].mean[0]-packets[j].mean[0]||packets[i].id-packets[j].id);for(let k=0;k<group.length;k++)for(let n=1;n<=4&&k+n<group.length;n++)candidate(group[k],group[k+n],packets[group[k]].sourceId!==null&&packets[group[k]].sourceId===packets[group[k+n]].sourceId);}
      // Keep the same stable top8 order without sorting the entire pair pool.
      const compareCandidate=(a,b)=>a.score-b.score||a.i-b.i||a.j-b.j,same=[],other=[];
      for(const c of pool){const list=c.sameSource?same:other;let lo=0,hi=list.length;while(lo<hi){const mid=(lo+hi)>>>1;if(compareCandidate(list[mid],c)<=0)lo=mid+1;else hi=mid;}if(lo<8){list.splice(lo,0,c);if(list.length>8)list.pop();}}
      const selected=[...same,...other];
      let choice=null,quality=Infinity,choicePreferred=false;
      for(const c of selected){const a=packets[c.i],b=packets[c.j],m=mergePair(a,b,-(merges+1)),d=mergeDiagnostics(a,b,m,profileMap.get(a.profileId),{coolSeconds,dragSeconds,ambientKelvin}),preferred=d.normalizedDistance<=preferredNormalizedDistance&&d.normalizedThermalTravelBound<=preferredNormalizedDistance&&d.sampledPeakRelativeError<=preferredPeakError&&d.sampledColumnRelativeError<=preferredColumnError,rank=preferred?(c.sameSource?0:1):2,q=rank*1e6+d.sampledColumnRelativeError+d.sampledPeakRelativeError+(d.normalizedDistance+d.normalizedThermalTravelBound)*.001;
        if(q<quality){choice={...c,merged:m,diagnostics:d};quality=q;choicePreferred=preferred;}}
      if(!choice)fail('No same-profile capacity merge candidate');
      const d=choice.diagnostics,classification=choicePreferred?(choice.sameSource?'preferred-same-source-overlap':'preferred-profile-overlap'):'forced-profile-approximation';
      if(!choicePreferred)forcedMerges++;else if(choice.sameSource)preferredSameSource++;else preferredSameProfile++;
      merges++;maximumMergeDistance=Math.max(maximumMergeDistance,d.distanceMetres);maximumMergeNormalizedDistance=Math.max(maximumMergeNormalizedDistance,d.normalizedDistance);maximumMergePeakError=Math.max(maximumMergePeakError,d.sampledPeakRelativeError);maximumMergeColumnError=Math.max(maximumMergeColumnError,d.sampledColumnRelativeError);maximumMergeOpticalDepthError=Math.max(maximumMergeOpticalDepthError,d.sampledMaximumOpticalDepthError);
      mergeLog.push({classification,profileId:choice.merged.profileId,...d});if(mergeLog.length>32)mergeLog.shift();
      packets.splice(choice.j,1);packets.splice(choice.i,1,choice.merged);revision++;
    }
  }
  function accept(p){packets.push(p);try{compact();}catch(error){packets.pop();throw error;}const y=p.mass-emittedCorrection,t=emitted+y;emittedCorrection=(t-emitted)-y;emitted=t;accepted++;peakPackets=Math.max(peakPackets,packets.length);revision++;}
  function parseEmission(s){
    let t=finite(s.time,'emission time');if(t<clock()-1e-10)fail('Emission is older than committed physical state; explicit restore/replay required');if(Math.abs(t-clock())<=1e-10)t=clock();
    if(!Number.isSafeInteger(s.emissionId)||s.emissionId<0||s.emissionId<=lastEmissionId)fail('emissionId must be a strictly increasing nonnegative safe integer');
    const profileId=s.profileId??'reference';if(!profileMap.has(profileId))fail('Unknown profileId');const sourceId=s.sourceId==null?null:safeId(String(s.sourceId),'sourceId');
    // Stable emitted IDs and a separate negative merge-ID sequence do not
    // depend on how future source inputs were batched by display frames.
    const p={id:s.emissionId,time:t,birthTime:t,sourceId,profileId,mass:positive(s.mass,'relative dry mass',PYRO_SMOKE_LIMITS.referenceMass),mean:vec(s.mean,'mean',PYRO_SMOKE_LIMITS.worldCoordinate),covariance:covariance(s.covariance).covariance,temperatureExcessK:finite(s.temperatureExcessK??0,'temperatureExcessK',PYRO_SMOKE_LIMITS.thermalExcessK),buoyantVelocity:finite(s.buoyantVelocity??0,'buoyantVelocity',PYRO_SMOKE_LIMITS.velocity),sourceCount:1,_dirty:true};if(taylor)p.dispersionQ=validateDispersionMemory(s.dispersionQ??1);else if(s.dispersionQ!==undefined)fail('dispersionQ requires Taylor state');if(emitted+sumMass(emissionQueue)+p.mass>PYRO_SMOKE_LIMITS.referenceMass)fail('Total relative mass exceeds numeric domain; input not accepted');kernel(p);return p;
  }
  function evolve(start,end){
    const dt=end-start;if(!(dt>0))return;const f=thermalFactors(dt,coolSeconds,dragSeconds,ambientKelvin),travel=currentWind.map(v=>v*dt);
    if(taylor){const diffusion=taylorDispersionFactors(dt,lagrangianSeconds),dx=travel[0],dy=travel[1],dz=travel[2];
      for(const p of packets){const varianceTime=dt*(1-p.dispersionQ)+p.dispersionQ*diffusion.freshTime;finite(p.mean[0]+dx,'transported mean.x',PYRO_SMOKE_LIMITS.worldCoordinate);finite(p.mean[1]+dy+p.buoyantVelocity*f.Ab+p.temperatureExcessK*f.positionPerK,'transported mean.y',PYRO_SMOKE_LIMITS.worldCoordinate);finite(p.mean[2]+dz,'transported mean.z',PYRO_SMOKE_LIMITS.worldCoordinate);for(let c=0;c<3;c++)finite(p.covariance[c*4]+2*K[c]*varianceTime,'diffused variance',PYRO_SMOKE_LIMITS.covarianceElement);finite(p.temperatureExcessK*f.ea,'cooled temperature');finite(p.buoyantVelocity*f.eb+p.temperatureExcessK*f.velocityPerK,'buoyant velocity');validateDispersionMemory(p.dispersionQ*diffusion.decay);}
      for(const p of packets){const varianceTime=dt*(1-p.dispersionQ)+p.dispersionQ*diffusion.freshTime;p.mean[0]+=dx;p.mean[1]+=dy+p.buoyantVelocity*f.Ab+p.temperatureExcessK*f.positionPerK;p.mean[2]+=dz;p.buoyantVelocity=p.buoyantVelocity*f.eb+p.temperatureExcessK*f.velocityPerK;p.temperatureExcessK*=f.ea;for(let c=0;c<3;c++)p.covariance[c*4]+=2*K[c]*varianceTime;p.dispersionQ*=diffusion.decay;p._dirty=true;}if(packets.length)revision++;return;
    }
    // Validate proposals first without per-packet temporary arrays; then apply
    // the same equations in place. A numeric failure cannot half-apply a segment.
    const dx=travel[0],dy=travel[1],dz=travel[2],kx=2*K[0]*dt,ky=2*K[1]*dt,kz=2*K[2]*dt;
    for(const p of packets){finite(p.mean[0]+dx,'transported mean.x',PYRO_SMOKE_LIMITS.worldCoordinate);finite(p.mean[1]+dy+p.buoyantVelocity*f.Ab+p.temperatureExcessK*f.positionPerK,'transported mean.y',PYRO_SMOKE_LIMITS.worldCoordinate);finite(p.mean[2]+dz,'transported mean.z',PYRO_SMOKE_LIMITS.worldCoordinate);finite(p.covariance[0]+kx,'diffused variance',PYRO_SMOKE_LIMITS.covarianceElement);finite(p.covariance[4]+ky,'diffused variance',PYRO_SMOKE_LIMITS.covarianceElement);finite(p.covariance[8]+kz,'diffused variance',PYRO_SMOKE_LIMITS.covarianceElement);finite(p.temperatureExcessK*f.ea,'cooled temperature');finite(p.buoyantVelocity*f.eb+p.temperatureExcessK*f.velocityPerK,'buoyant velocity');}
    for(const p of packets){p.mean[0]+=dx;p.mean[1]+=dy+p.buoyantVelocity*f.Ab+p.temperatureExcessK*f.positionPerK;p.mean[2]+=dz;p.buoyantVelocity=p.buoyantVelocity*f.eb+p.temperatureExcessK*f.velocityPerK;p.temperatureExcessK*=f.ea;p.covariance[0]+=kx;p.covariance[4]+=ky;p.covariance[8]+=kz;p._dirty=true;}if(packets.length)revision++;
  }
  const api={
    queueEmission(source){if(emissionQueue.length>=maxPendingEmissions)fail('Pending emission capacity exceeded; input not accepted');const p=parseEmission(source);if(p.time===clock())accept(p);else insert(emissionQueue,p);lastEmissionId=source.emissionId;return {accepted:true,emissionId:source.emissionId,queued:p.time!==clock()};},
    setWind({time:at=clock(),velocity}={}){finite(at,'wind event time');if(at<clock()-1e-10)fail('Wind event is older than committed state');if(Math.abs(at-clock())<=1e-10)at=clock();const v=vec(velocity,'wind velocity',PYRO_SMOKE_LIMITS.velocity);if(at===clock()){currentWind=v;return {queued:false,time:at};}const old=windQueue.findIndex(e=>e.time===at);if(old>=0)windQueue[old]={time:at,velocity:v};else{if(windQueue.length>=maxPendingWindEvents)fail('Pending wind event capacity exceeded; input not accepted');insert(windQueue,{time:at,velocity:v});}return {queued:true,time:at};},
    advanceTo(target){finite(target,'physical target time');if(target<requestedTime-1e-10)fail('Physical target cannot rewind; use explicit external restore/replay');requestedTime=target;const goal=Math.floor((target-time+1e-9)/fixedStep);let steps=0;
      while(tick<goal&&steps<maxStepsPerAdvance){const start=clock(),end=time+(tick+1)*fixedStep;let at=start;
        while(true){const next=Math.min(windQueue[0]?.time??Infinity,emissionQueue[0]?.time??Infinity);if(next>end)break;evolve(at,next);at=next;while(windQueue[0]?.time===next)currentWind=windQueue.shift().velocity;while(emissionQueue[0]?.time===next)accept(emissionQueue.shift());}evolve(at,end);tick++;steps++;}
      lastAdvanceSteps=steps;totalTickSteps+=steps;return {time:clock(),requestedTime:target,steps,completed:tick>=goal,behindSeconds:Math.max(0,target-clock()),uncommittedRemainderSeconds:tick>=goal?Math.max(0,target-clock()):null,revision};},
    sampleMedium(point){const x=vec(point,'sample point',PYRO_SMOKE_LIMITS.worldCoordinate),extinctionRGB=[0,0,0],scatteringRGB=[0,0,0];let density=0;for(const p of packets){const rho=densityAt(p,x),profile=profileMap.get(p.profileId);density+=rho;for(let c=0;c<3;c++){const e=rho*profile.extinctionPerMassRGB[c];extinctionRGB[c]+=e;scatteringRGB[c]+=e*profile.singleScatteringAlbedoRGB[c];}}if(![density,...extinctionRGB,...scatteringRGB].every(Number.isFinite))fail('Medium sample exceeded numeric range');return {density,extinctionRGB,scatteringRGB,units:'relative mass/m3; reference extinction and scattering per metre, uncalibrated'};},
    columnOpticalDepth({origin,direction,start=0,end}={}){const o=vec(origin,'ray origin',PYRO_SMOKE_LIMITS.worldCoordinate),d=vec(direction,'ray direction'),size=norm(d);if(!(size>0)||Math.abs(size-1)>1e-6)fail('Ray direction must be unit length');for(let i=0;i<3;i++)d[i]/=size;finite(start,'ray start');finite(end,'ray end');if(start<0||end<start)fail('Ray interval must satisfy0<=start<=end');const opticalDepthRGB=[0,0,0];let columnMass=0;for(const p of packets){const mass=columnAt(p,o,d,start,end),profile=profileMap.get(p.profileId);columnMass+=mass;for(let c=0;c<3;c++)opticalDepthRGB[c]+=mass*profile.extinctionPerMassRGB[c];}if(![columnMass,...opticalDepthRGB].every(Number.isFinite))fail('Optical depth exceeded numeric range');return {columnMass,opticalDepthRGB,transmissionRGB:opticalDepthRGB.map(v=>Math.exp(-v)),units:'relative mass/m2 and reference dimensionless optical depth; numerical erf approximation, not an unbiased renderer'};},
    snapshot(){return {schema:'glass-atoll.pyro-smoke-state.v1',...(taylor?{dispersion:{model:dispersionModel,lagrangianSeconds,diffusivity:[...K]}}:{}),time:clock(),requestedTime,tick,revision,currentWind:[...currentWind],packets:packets.map(publicPacket),profiles:Array.from(profileMap.values(),p=>({id:p.id,extinctionPerMassRGB:[...p.extinctionPerMassRGB],singleScatteringAlbedoRGB:[...p.singleScatteringAlbedoRGB]})),ledger:{emitted,airborne:sumMass(packets),pendingMass:sumMass(emissionQueue),deposited:0,escaped:0,explicitlyCleared:0},pendingEmissions:emissionQueue.length,pendingWindEvents:windQueue.length};},
    diagnostics(){const airborne=sumMass(packets);return {version:'pyro-smoke-state-v1',...(taylor?{dispersion:{model:dispersionModel,lagrangianSeconds,diffusivity:[...K]}}:{}),time:clock(),requestedTime,revision,packetCount:packets.length,capacity,peakPacketCount:peakPackets,pendingEmissions:emissionQueue.length,pendingWindEvents:windQueue.length,profileCount:profileMap.size,acceptedSources:accepted,lastEmissionId,totalTickSteps,lastAdvanceSteps,fixedStep,maxStepsPerAdvance,ledger:{emitted,airborne,pendingMass:sumMass(emissionQueue),residual:emitted-airborne,deposited:0,escaped:0,explicitlyCleared:0},merges,forcedMerges,preferredSameSourceMerges:preferredSameSource,preferredSameProfileMerges:preferredSameProfile,maximumMergeDistanceMetres:maximumMergeDistance,maximumMergeNormalizedDistance,maximumSampledMergePeakRelativeError:maximumMergePeakError,maximumSampledMergeColumnRelativeError:maximumMergeColumnError,maximumSampledMergeOpticalDepthError:maximumMergeOpticalDepthError,recentMerges:mergeLog.map(v=>({...v,sampledOpticalDepthRGBAbsoluteError:[...v.sampledOpticalDepthRGBAbsoluteError]})),units:'relative dry mass; metres; physical seconds; authored m2/reference-mass optical profiles. NOT calibrated kg/PM.',limits:[...(taylor?['stationary decorrelated-parcel Taylor marginal closure; TL authored, not measured relative-puff dispersion; q preserves common-drift diffusion moments only']:[]),'no age deletion; no deposition/domain/RH chemistry implemented','uniform piecewise-held wind and prescribed thermal/diffusion surrogate; no Navier-Stokes or shear','same-profile capacity merges conserve instantaneous spatial moments; no velocity/thermal variance or position-velocity cross covariance, so future heterogeneous thermal separation is not preserved','sampled peak/column diagnostics are not global optical bounds; differential-thermal-travel gate only limits preferred merges','forcedMerges signal visual approximation, not an accepted appearance','no camera/P/C/UTC or renderer dependency','erf columns have finite numerical approximation error; not an unbiased ray renderer','pending queues, profiles and recent merge log are bounded; no retained old source/active-event archive']};}
  };return api;
}
