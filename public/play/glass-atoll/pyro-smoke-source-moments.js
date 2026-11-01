import {parseSmokeDispersion,taylorDispersionAge} from './pyro-smoke-dispersion.js';
// Pure CPU source quadrature. No renderer, camera/exposure, RNG or state writes.
export const SMOKE_SOURCE_TRANSPORT=Object.freeze({diffusivity:Object.freeze([.6,.12,.6]),coolSeconds:12,dragSeconds:2,ambientKelvin:300,temperatureExcessK:12,buoyantVelocity:.35});
const GL_NODES=Object.freeze([-.906179845938664,-.5384693101056831,0,.5384693101056831,.906179845938664]);
const GL_WEIGHTS=Object.freeze([.2369268850561891,.4786286704993665,.5688888888888889,.4786286704993665,.2369268850561891]);
const finite=(v,label)=>{if(!Number.isFinite(v))throw new RangeError(label+' must be finite');return v;};
const vector=(v,label)=>{if(!v||v.length!==3)throw new TypeError(label+' needs3 components');return Array.from(v,(x,i)=>finite(x,label+i));};
const positive=(v,label)=>{finite(v,label);if(!(v>0))throw new RangeError(label+' must be positive');return v;};
const kahan=values=>{let sum=0,c=0;for(const value of values){const y=value-c,t=sum+y;c=(t-sum)-y;sum=t;}return sum;};
function parseTransport(t){const dispersion=parseSmokeDispersion(t),diffusivity=vector(t.diffusivity,'diffusivity');if(diffusivity.some(x=>x<0))throw new RangeError('Diffusivity must be nonnegative');return{diffusivity,coolSeconds:positive(t.coolSeconds,'coolSeconds'),dragSeconds:positive(t.dragSeconds,'dragSeconds'),ambientKelvin:positive(t.ambientKelvin,'ambientKelvin'),temperatureExcessK:finite(t.temperatureExcessK,'temperatureExcessK'),buoyantVelocity:finite(t.buoyantVelocity,'buoyantVelocity'),...(dispersion.dispersionModel==='taylor'?dispersion:{})};}
function freezeHistory(samples,throughTime){return Object.freeze({samples:Object.freeze(samples),throughTime});}
function validateHistory(h){if(!h||!Array.isArray(h.samples)||!h.samples.length)throw new TypeError('Timestamped smoke wind history required');finite(h.throughTime,'wind throughTime');let last=-Infinity;for(const s of h.samples){finite(s.time,'wind time');if(s.time<=last||s.time>h.throughTime)throw new RangeError('Wind sample clocks must be strictly increasing and not future');const wind=vector(s.wind,'wind');if(wind.some(x=>Math.abs(x)>1e6))throw new RangeError('Wind outside physical state domain');last=s.time;}return h;}
export function createSourceWindHistory({time,wind=[0,0,0]}={}){finite(time,'wind origin');const v=vector(wind,'wind');if(v.some(x=>Math.abs(x)>1e6))throw new RangeError('Wind outside physical state domain');return freezeHistory([Object.freeze({time,wind:Object.freeze(v)})],time);}
/** Transactional value: the caller only installs it after state accepts the batch.
 * Retain one held sample before retainFrom; never quantize or interpolate wind.
 */
export function appendSourceWindHistory(history,{time,windVector,retainFrom=time-.30,maxSamples=1024}={}){validateHistory(history);finite(time,'wind time');finite(retainFrom,'wind retainFrom');if(time<history.throughTime)throw new RangeError('Smoke wind history cannot rewind');if(!Number.isSafeInteger(maxSamples)||maxSamples<2||maxSamples>16384)throw new RangeError('Wind capacity requires2..16384');const wind=vector(windVector,'windVector');if(wind.some(v=>Math.abs(v)>1e6))throw new RangeError('Wind outside physical state domain');let samples=history.samples.slice(),last=samples.at(-1);if(wind.some((v,i)=>v!==last.wind[i])){const sample=Object.freeze({time,wind:Object.freeze(wind)});if(last.time===time)samples[samples.length-1]=sample;else samples.push(sample);}let first=0;while(first+1<samples.length&&samples[first+1].time<=retainFrom)first++;if(first)samples=samples.slice(first);if(samples.length>maxSamples)throw new RangeError('Causal smoke wind-history capacity exceeded; no knot was dropped');return freezeHistory(samples,time);}
export function integrateSourceWind(history,start,end){validateHistory(history);finite(start,'wind integral start');finite(end,'wind integral end');if(end<start||start<history.samples[0].time||end>history.throughTime)throw new RangeError('Smoke wind integral needs the complete known past interval');if(end===start)return[0,0,0];const values=[[],[],[]],samples=history.samples;for(let i=0;i<samples.length;i++){const a=Math.max(start,samples[i].time),b=Math.min(end,samples[i+1]?.time??end);if(b>a)for(let c=0;c<3;c++)values[c].push(samples[i].wind[c]*(b-a));if(b>=end)break;}return values.map(kahan);}
/** Same native linear thermal/buoyant semigroup as the physical state. */
export function sourceThermalAge(age,transport=SMOKE_SOURCE_TRANSPORT){const t=parseTransport(transport);finite(age,'source age');if(age<0)throw new RangeError('A source cannot be aged backwards');const a=1/t.coolSeconds,b=1/t.dragSeconds,ea=Math.exp(-a*age),eb=Math.exp(-b*age),Aa=-Math.expm1(-a*age)/a,Ab=-Math.expm1(-b*age)/b,c=9.81/t.ambientKelvin;let velocityPerK,positionPerK;if(Math.abs(a-b)<1e-10){velocityPerK=c*age*eb;positionPerK=c*(Ab-age*eb)/b;}else{velocityPerK=c*(ea-eb)/(b-a);positionPerK=c*(Aa-Ab)/(b-a);}const out={temperatureExcessK:t.temperatureExcessK*ea,buoyantVelocity:t.buoyantVelocity*eb+t.temperatureExcessK*velocityPerK,rise:t.buoyantVelocity*Ab+t.temperatureExcessK*positionPerK};if(!Object.values(out).every(Number.isFinite))throw new RangeError('Thermal age exceeded numerical domain');return out;}
/** Five positive quadrature nodes are aged to the SAME birth/end time first.
 * This is one delayed source-time cell, not continuous emission before its end.
 * Mean/full-SPD covariance match that sampled representative mixture at birth;
 * later heat/velocity-position cross covariance is not carried by old state.
 */
export function pastSegmentSourceMoments({start,end,mass,samplePosition,windHistory,sigmaPerp=.30,transport=SMOKE_SOURCE_TRANSPORT}={}){
  finite(start,'segment start');finite(end,'segment end');if(!(end>start)||end-start>.30000001)throw new RangeError('Segment must be a positive causal cell of at most.30s');positive(mass,'source mass');positive(sigmaPerp,'source transverse sigma');if(typeof samplePosition!=='function')throw new TypeError('A past physical samplePosition callback is required');const model=parseTransport(transport);validateHistory(windHistory);if(start<windHistory.samples[0].time||end>windHistory.throughTime)throw new RangeError('Past segment lost wind coverage or reaches the future');const mid=start+(end-start)*.5,half=(end-start)*.5,weightSum=kahan(GL_WEIGHTS),weights=GL_WEIGHTS.map(w=>w/weightSum),samples=[];
  for(let i=0;i<5;i++){const time=mid+half*GL_NODES[i];if(time<start||time>end)throw new RangeError('Quadrature escaped its causal interval');const raw=vector(samplePosition(time),'actual root point'),age=end-time,wind=integrateSourceWind(windHistory,time,end),thermal=sourceThermalAge(age,model),position=raw.map((v,c)=>v+wind[c]+(c===1?thermal.rise:0)),ageModel=model.dispersionModel==='taylor'?taylorDispersionAge(age,model.lagrangianSeconds):null,variance=model.diffusivity.map(k=>sigmaPerp*sigmaPerp+2*k*(ageModel?ageModel.varianceTime:age));if(!position.every(Number.isFinite)||!variance.every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Aged source moment outside numeric domain');samples.push({time,weight:weights[i],position,variance,temperatureExcessK:thermal.temperatureExcessK,buoyantVelocity:thermal.buoyantVelocity,...(ageModel?{dispersionQ:ageModel.dispersionQ}:{})});}
  const origin=samples[0].position,relative=samples.map(s=>s.position.map((v,c)=>v-origin[c])),offset=[0,1,2].map(c=>kahan(samples.map((s,i)=>s.weight*relative[i][c]))),mean=offset.map((v,c)=>v+origin[c]),covariance=Array(9).fill(0);
  for(let r=0;r<3;r++)for(let c=r;c<3;c++){const value=kahan(samples.map((s,i)=>s.weight*((relative[i][r]-offset[r])*(relative[i][c]-offset[c])+(r===c?s.variance[r]:0))));covariance[r*3+c]=value;covariance[c*3+r]=value;}
  const temperatureExcessK=kahan(samples.map(s=>s.weight*s.temperatureExcessK)),buoyantVelocity=kahan(samples.map(s=>s.weight*s.buoyantVelocity)),temperatureVariance=kahan(samples.map(s=>s.weight*(s.temperatureExcessK-temperatureExcessK)**2)),buoyantVelocityVariance=kahan(samples.map(s=>s.weight*(s.buoyantVelocity-buoyantVelocity)**2));if(![...mean,...covariance,temperatureExcessK,buoyantVelocity].every(Number.isFinite))throw new RangeError('Collapsed source moments are not finite');
  return{mass,mean,covariance,temperatureExcessK,buoyantVelocity,...(model.dispersionModel==='taylor'?{dispersionQ:kahan(samples.map(s=>s.weight*s.dispersionQ))}:{}),diagnostics:{kernelModel:'past-segment-v2',window:[start,end],quadratureNodes:5,normalizedWeightSum:kahan(weights),sigmaPerp,agedToBirth:true,...(model.dispersionModel==='taylor'?{dispersionModel:'taylor',lagrangianSeconds:model.lagrangianSeconds}:{}),temperatureVariance,buoyantVelocityVariance,limits:'birth moments of this sampled representative segment only; delayed source cell and discarded future thermal/velocity cross-covariance are approximations'}};
}

/** Positive uniform-material quadrature split at actual force knots only.
 * All nodes are transported to depositTime (the ORIGINAL cell end), including
 * nodes from early subintervals. This returns one Gaussian, never one per knot.
 * The old five-node path remains exact when no interior split is requested.
 */
export function pastPiecewiseSegmentSourceMoments({start,end,depositTime=end,integrationBreaks=[],mass,samplePosition,windHistory,sigmaPerp=.30,transport=SMOKE_SOURCE_TRANSPORT}={}){
  finite(start,'segment start');finite(end,'segment end');finite(depositTime,'deposit time');
  if(!(end>start)||end-start>.30000001||depositTime<end)throw new RangeError('Piecewise segment requires a causal original cell of at most .30s and common deposit time');
  if(!Array.isArray(integrationBreaks)||integrationBreaks.length>12)throw new RangeError('Force integration breaks require at most 12 bounded interior knots');
  let previous=start;
  for(const time of integrationBreaks){finite(time,'integration break');if(time<=previous||time>=end)throw new RangeError('Force integration breaks must strictly increase inside the original cell');previous=time;}
  if(!integrationBreaks.length&&depositTime===end)return pastSegmentSourceMoments({start,end,mass,samplePosition,windHistory,sigmaPerp,transport});
  positive(mass,'source mass');positive(sigmaPerp,'source transverse sigma');
  if(typeof samplePosition!=='function')throw new TypeError('A past physical samplePosition callback is required');
  const model=parseTransport(transport);validateHistory(windHistory);
  if(start<windHistory.samples[0].time||depositTime>windHistory.throughTime)throw new RangeError('Piecewise source lost wind coverage or reaches the future');
  const edges=[start,...integrationBreaks,end],weightSum=kahan(GL_WEIGHTS),nodes=[];
  // Preflight every clock and positive material weight before provider sampling.
  for(let cell=0;cell<edges.length-1;cell++){
    const a=edges[cell],b=edges[cell+1],half=(b-a)*.5,mid=a+half,share=(b-a)/(end-start);
    for(let i=0;i<GL_NODES.length;i++){
      const time=mid+half*GL_NODES[i],weight=share*GL_WEIGHTS[i]/weightSum;
      if(!(time>a&&time<b)||!(weight>0)||!Number.isFinite(weight))throw new RangeError('Force quadrature cell has no representable positive interior node/weight');
      nodes.push({time,weight});
    }
  }
  const normalization=kahan(nodes.map(n=>n.weight));
  for(const node of nodes){
    node.weight/=normalization;
    const raw=vector(samplePosition(node.time),'actual body point'),age=depositTime-node.time,wind=integrateSourceWind(windHistory,node.time,depositTime),thermal=sourceThermalAge(age,model),ageModel=model.dispersionModel==='taylor'?taylorDispersionAge(age,model.lagrangianSeconds):null;
    node.position=raw.map((v,c)=>v+wind[c]+(c===1?thermal.rise:0));
    node.variance=model.diffusivity.map(k=>sigmaPerp*sigmaPerp+2*k*(ageModel?ageModel.varianceTime:age));
    node.temperatureExcessK=thermal.temperatureExcessK;node.buoyantVelocity=thermal.buoyantVelocity;
    if(ageModel)node.dispersionQ=ageModel.dispersionQ;
    if(!node.position.every(Number.isFinite)||!node.variance.every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Aged piecewise source outside numeric domain');
  }
  const origin=nodes[0].position,relative=nodes.map(n=>n.position.map((v,c)=>v-origin[c])),offset=[0,1,2].map(c=>kahan(nodes.map((n,i)=>n.weight*relative[i][c]))),mean=offset.map((v,c)=>v+origin[c]),covariance=Array(9).fill(0);
  // Full parallel-axis covariance, including between-subinterval separation.
  for(let r=0;r<3;r++)for(let c=r;c<3;c++){
    const value=kahan(nodes.map((n,i)=>n.weight*((relative[i][r]-offset[r])*(relative[i][c]-offset[c])+(r===c?n.variance[r]:0))));
    covariance[r*3+c]=value;covariance[c*3+r]=value;
  }
  const temperatureExcessK=kahan(nodes.map(n=>n.weight*n.temperatureExcessK)),buoyantVelocity=kahan(nodes.map(n=>n.weight*n.buoyantVelocity)),temperatureVariance=kahan(nodes.map(n=>n.weight*(n.temperatureExcessK-temperatureExcessK)**2)),buoyantVelocityVariance=kahan(nodes.map(n=>n.weight*(n.buoyantVelocity-buoyantVelocity)**2));
  if(![...mean,...covariance,temperatureExcessK,buoyantVelocity].every(Number.isFinite))throw new RangeError('Collapsed piecewise moments are not finite');
  return{mass,mean,covariance,temperatureExcessK,buoyantVelocity,...(model.dispersionModel==='taylor'?{dispersionQ:kahan(nodes.map(n=>n.weight*n.dispersionQ))}:{}),diagnostics:{kernelModel:'past-segment-v2',window:[start,end],depositTime,integrationBreaks:[...integrationBreaks],quadratureNodes:nodes.length,subintervals:edges.length-1,materialWeighting:'uniform-per-life duration fractions',normalizedWeightSum:kahan(nodes.map(n=>n.weight)),sigmaPerp,agedToBirth:true,...(model.dispersionModel==='taylor'?{dispersionModel:'taylor',lagrangianSeconds:model.lagrangianSeconds}:{}),temperatureVariance,buoyantVelocityVariance,limits:'one Gaussian matches the positive common-end sampled mixture; no exact multimodal field or future thermal/velocity cross-covariance claim'}};
}
