// Causal air-source visibility support only. This does not extinguish fuel,
// transfer material, alter a trajectory, or delete deposited smoke.
export const AIR_SUPPORT_SCHEMA='glass-atoll.air-support.v1';
export class AirSupportCapacityError extends RangeError{
  constructor(limit,maximum){super(`Air support ${limit} capacity ${maximum} exceeded; no partial result published`);this.name='AirSupportCapacityError';this.code='AIR_SUPPORT_CAPACITY';this.limit=limit;this.maximum=maximum;}
}
const finite=(v,n)=>{if(typeof v!=='number'||!Number.isFinite(v))throw new RangeError(n+' must be finite');return v;};
const nonnegative=(v,n)=>{finite(v,n);if(v<0)throw new RangeError(n+' must be nonnegative');return v;};
const integer=(v,lo,hi,n)=>{if(!Number.isSafeInteger(v)||v<lo||v>hi)throw new RangeError(n+` requires an integer in ${lo}..${hi}`);return v;};
const callback=(f,n)=>{if(typeof f!=='function'||f.constructor?.name==='AsyncFunction')throw new TypeError(n+' must be a synchronous function');return f;};
const sync=(value,n)=>{if(value&&typeof value.then==='function'){try{Promise.prototype.then.call(value,()=>{},()=>{});}catch{}throw new TypeError(n+' must return synchronously');}return value;};
const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){for(const v of Object.values(o))freeze(v);Object.freeze(o);}return o;};
function request(options){
  if(!options||typeof options!=='object')throw new TypeError('Air support requires options');
  const {physicalNow,from,to}=options;finite(physicalNow,'Physical now');finite(from,'Support start');finite(to,'Support end');
  if(to<from||to>physicalNow||!Number.isFinite(to-from))throw new RangeError('Support requires finite from <= to <= physicalNow');
  const timeToleranceSeconds=finite(options.timeToleranceSeconds??1e-8,'Time tolerance');if(!(timeToleranceSeconds>0))throw new RangeError('Time tolerance must be positive');
  return{physicalNow,from,to,timeToleranceSeconds,clearanceToleranceMetres:nonnegative(options.clearanceToleranceMetres??1e-10,'Clearance tolerance'),maxIntervals:integer(options.maxIntervals??64,1,4096,'maxIntervals'),maxEvaluations:integer(options.maxEvaluations??8192,1,1000000,'maxEvaluations'),maxDepth:integer(options.maxDepth??64,0,64,'maxDepth')};
}
function budget(maximum){const counts={samples:0,bounds:0,analyticPoses:0,total:0};return{counts,tick(kind){if(counts.total>=maximum)throw new AirSupportCapacityError('evaluations',maximum);counts[kind]++;counts.total++;}};}
function append(list,entry){
  if(!(entry.to>entry.from))return;
  const previous=list.at(-1);
  if(previous&&entry.from<=previous.to){previous.to=Math.max(previous.to,entry.to);if(entry.lower!==undefined)previous.lower=Math.min(previous.lower,entry.lower);if(entry.upper!==undefined)previous.upper=Math.max(previous.upper,entry.upper);}
  else list.push({...entry});
}
function unionIntervals(intervals){const out=[];for(const p of intervals.slice().sort((a,b)=>a.from-b.from||a.to-b.to))append(out,p);return out;}
function plainIntervals(list){return list.map(p=>({from:p.from,to:p.to}));}
function solver(options,work){
  const q=request(options),sampleClearanceAt=callback(options.sampleClearanceAt,'sampleClearanceAt'),boundInterval=callback(options.boundInterval,'boundInterval');
  const positive=[],negative=[],uncertain=[],samples=new Map();let maximumUnresolvedBracketSeconds=0,domainEndClass=null;
  function sample(t){
    if(t<q.from||t>q.to||t>q.physicalNow)throw new RangeError('Air support attempted a noncausal/out-of-window sample');
    if(!samples.has(t)){work.tick('samples');samples.set(t,finite(sync(sampleClearanceAt(t),'sampleClearanceAt'),'Sampled clearance'));}return samples.get(t);
  }
  function cap(){for(const [name,list]of [['positive intervals',positive],['negative intervals',negative],['unresolved brackets',uncertain]])if(list.length>q.maxIntervals)throw new AirSupportCapacityError(name,q.maxIntervals);}
  function classify(a,b,depth){
    work.tick('bounds');const raw=sync(boundInterval({from:a,to:b,left:samples.get(a),right:samples.get(b)}),'boundInterval');
    if(!raw||typeof raw!=='object')throw new TypeError('boundInterval requires {lower,upper}');const lower=finite(raw.lower,'Clearance lower bound'),upper=finite(raw.upper,'Clearance upper bound'),resolutionFloor=nonnegative(raw.resolutionFloorMetres??0,'Clearance resolution floor');if(lower>upper)throw new RangeError('Clearance lower bound exceeds upper bound');
    for(const t of [a,b]){const v=samples.get(t);if(v!==undefined&&(v<lower||v>upper))throw new RangeError('Clearance bound contradicts an observed endpoint');}
    if(lower>0){append(positive,{from:a,to:b,lower});if(b===q.to)domainEndClass=true;cap();return;}
    if(upper<=0){append(negative,{from:a,to:b,upper});if(b===q.to)domainEndClass=false;cap();return;}
    const width=b-a,m=a+width*.5;
    if(width<=q.timeToleranceSeconds*.25||depth>=q.maxDepth||!(m>a&&m<b)||upper-lower<=Math.max(q.clearanceToleranceMetres,4*resolutionFloor)){
      append(uncertain,{from:a,to:b});maximumUnresolvedBracketSeconds=Math.max(maximumUnresolvedBracketSeconds,width);if(b===q.to)domainEndClass=null;cap();return;
    }
    // Values are cached and passed to the declared bound provider. A bound
    // may use them with its certified derivative enclosure, never as a claim
    // that a sampled grid proves absence of an intervening narrow crossing.
    sample(a);sample(m);sample(b);classify(a,m,depth+1);classify(m,b,depth+1);
  }
  if(q.from===q.to){const g=sample(q.to),active=g>0;return freeze({schema:AIR_SUPPORT_SCHEMA,model:options.model??'declared-continuous-clearance-enclosure',status:'resolved',physicalNow:q.physicalNow,from:q.from,to:q.to,durationSeconds:0,timeToleranceSeconds:q.timeToleranceSeconds,instantaneous:true,currentActive:active,currentClearance:g,intervals:active?[{from:q.to,to:q.to,anchorTime:q.to,anchorClearanceLowerBound:g}]:[],possibleIntervals:active?[{from:q.to,to:q.to}]:[],negativeIntervals:active?[]:[{from:q.to,to:q.to}],unresolvedBrackets:[],totalUnresolvedSeconds:0,maximumUnresolvedBracketSeconds:0,evaluations:{...work.counts},policy:'strict clearance > 0; instantaneous endpoint only; no trajectory/material mutation'});}
  const partition=options.partitionTimes??[];if(!Array.isArray(partition))throw new TypeError('partitionTimes requires an array');
  const cuts=[q.from];let previous=-Infinity;for(const t of partition){finite(t,'Partition time');if(t<previous)throw new RangeError('Partition times must be sorted');previous=t;if(t>q.from&&t<q.to&&t!==cuts.at(-1))cuts.push(t);}cuts.push(q.to);
  for(let i=1;i<cuts.length;i++)classify(cuts[i-1],cuts[i],0);
  const possible=unionIntervals([...positive,...uncertain]);if(possible.length>q.maxIntervals)throw new AirSupportCapacityError('possible intervals',q.maxIntervals);
  const totalUnresolvedSeconds=uncertain.reduce((sum,p)=>sum+p.to-p.from,0);
  maximumUnresolvedBracketSeconds=uncertain.reduce((maximum,p)=>Math.max(maximum,p.to-p.from),0);
  const currentClearance=samples.get(q.to)??(domainEndClass===null?sample(q.to):null),currentActive=currentClearance===null?domainEndClass:currentClearance>0;
  const intervals=positive.map(p=>({from:p.from,to:p.to,anchorTime:p.from+(p.to-p.from)*.5,anchorClearanceLowerBound:p.lower}));
  // Inner support is deliberate. Every omitted ambiguous interval remains
  // published in possibleIntervals/unresolvedBrackets with its finite width.
  // A caller must not accept status='uncertain' as a solved boundary.
  return freeze({schema:AIR_SUPPORT_SCHEMA,model:options.model??'declared-continuous-clearance-enclosure',status:uncertain.length?(maximumUnresolvedBracketSeconds<=q.timeToleranceSeconds?'bounded':'uncertain'):'resolved',physicalNow:q.physicalNow,from:q.from,to:q.to,durationSeconds:q.to-q.from,timeToleranceSeconds:q.timeToleranceSeconds,instantaneous:false,currentActive,currentClearance,intervals,possibleIntervals:plainIntervals(possible),negativeIntervals:plainIntervals(negative),unresolvedBrackets:plainIntervals(uncertain),totalUnresolvedSeconds,maximumUnresolvedBracketSeconds,evaluations:{...work.counts},policy:'strict clearance > 0; intervals are certified-positive inner support; possibleIntervals retains every unresolved bracket; no dropped interval or support renormalization',limits:'Certification is conditional on the declared continuous clearance enclosure. Bounded root time is numerical support uncertainty, not exact chemical extinction, collision response, nonlinear shutter integration or smoke accounting.'});
}

/** Resolve a continuous clearance under a caller-proved closed-interval bound.
 * boundInterval({from,to,left?,right?}) returns finite lower/upper enclosing g
 * over the COMPLETE interval. A finite sampling grid is not such a proof.
 */
export function resolveBoundedAirSupport(options){const q=request(options);return solver(options,budget(q.maxEvaluations));}

/** Build the generic clearance/enclosure callbacks from a bounded heightfield.
 * trajectoryBounds({from,to}) supplies finite minimumY, maximumY,
 * maximumAbsVerticalSpeed, maximumHorizontalSpeed. Surface limits enclose the
 * COMPLETE queried domain/time, not just samples. Omitted error means0.
 */
export function createBoundedAirClearance({sampleAt,trajectoryBounds,surface,clearanceMetres=.03,numericPaddingMetres=1e-12}={}){
  callback(sampleAt,'sampleAt');callback(trajectoryBounds,'trajectoryBounds');if(!surface||typeof surface!=='object')throw new TypeError('A bounded surface contract is required');
  const heightAt=callback(surface.heightAt,'surface.heightAt'),minimumHeight=finite(surface.minimumHeight,'Surface minimum height'),maximumHeight=finite(surface.maximumHeight,'Surface maximum height'),slope=nonnegative(surface.maximumSpatialSlope,'Surface slope bound'),rate=nonnegative(surface.maximumTimeRate,'Surface temporal rate bound'),surfaceError=nonnegative(surface.heightErrorMetres??0,'Surface height error');
  if(minimumHeight>maximumHeight)throw new RangeError('Surface height bounds are inverted');clearanceMetres=nonnegative(clearanceMetres,'Clearance');numericPaddingMetres=nonnegative(numericPaddingMetres,'Numeric padding');
  const sampleClearanceAt=time=>{finite(time,'Clearance sample time');const state=sync(sampleAt(time),'sampleAt'),p=state?.position;if(!p||p.length!==3||![...p].every(v=>typeof v==='number'&&Number.isFinite(v)))throw new RangeError('sampleAt requires a finite3D position');const h=finite(sync(heightAt(p[0],p[2],time),'surface.heightAt'),'Surface height');if(h<minimumHeight-surfaceError||h>maximumHeight+surfaceError)throw new RangeError('Surface sample exceeds its declared global height bounds');return finite(p[1]-h-clearanceMetres,'Clearance');};
  const boundInterval=({from,to,left,right})=>{
    finite(from,'Bound start');finite(to,'Bound end');if(to<from)throw new RangeError('Bound interval is reversed');const raw=sync(trajectoryBounds({from,to}),'trajectoryBounds');if(!raw||typeof raw!=='object')throw new TypeError('trajectoryBounds requires a finite enclosure');
    const minY=finite(raw.minimumY,'Trajectory minimumY'),maxY=finite(raw.maximumY,'Trajectory maximumY'),vy=nonnegative(raw.maximumAbsVerticalSpeed,'Trajectory vertical speed bound'),vxz=nonnegative(raw.maximumHorizontalSpeed,'Trajectory horizontal speed bound'),trajectoryError=nonnegative(raw.heightErrorMetres??0,'Trajectory height error');if(minY>maxY)throw new RangeError('Trajectory Y bounds are inverted');
    const scale=Math.max(1,Math.abs(minY),Math.abs(maxY),Math.abs(minimumHeight),Math.abs(maximumHeight),clearanceMetres),padding=numericPaddingMetres+32*Number.EPSILON*scale+trajectoryError+surfaceError;
    let lower=minY-maximumHeight-clearanceMetres-padding,upper=maxY-minimumHeight-clearanceMetres+padding;
    const L=finite((vy+slope*vxz+rate)*(1+32*Number.EPSILON),'Clearance Lipschitz bound');
    if(left!==undefined&&right!==undefined){finite(left,'Left clearance');finite(right,'Right clearance');const margin=L*(to-from)*.5+padding;lower=Math.max(lower,Math.min(left,right)-margin);upper=Math.min(upper,Math.max(left,right)+margin);}
    return{lower:finite(lower,'Clearance lower bound'),upper:finite(upper,'Clearance upper bound'),resolutionFloorMetres:padding};
  };
  return Object.freeze({sampleClearanceAt,boundInterval,contract:Object.freeze({model:'trajectory-height enclosure + bounded heightfield + certified speed/slope/time-rate Lipschitz enclosure',minimumHeight,maximumHeight,maximumSpatialSlope:slope,maximumTimeRate:rate,clearanceMetres,numericPaddingMetres,heightErrorMetres:surfaceError,revision:surface.revision??null,limits:'Caller proves continuous surface and global/local bounds; this adapter does not certify arbitrary callbacks or discover terrain bounds by sampling.'})});
}

function verticalPose(s,time){
  const t=time-s.from;if(t<0||time>s.to)throw new RangeError('Plane pose request is outside its committed segment');
  if(s.drag<1e-8)return{y:s.y+s.vy*t-.5*s.gravity*t*t,vy:s.vy-s.gravity*t};
  const k=s.drag,z=k*t,E=Math.exp(-z),F=-Math.expm1(-z)/k;
  // (t-F)/k uses its local series near0, avoiding catastrophic cancellation.
  const drift=z<1e-3?t*t*(.5+z*(-1/6+z*(1/24+z*(-1/120+z*(1/720-z/5040))))):(t-F)/k;
  const H=k*drift;return{y:s.y+s.vy*F+s.windY*H-s.gravity*drift,vy:s.vy*E+(s.windY*k-s.gravity)*F};
}
function extremum(s){
  if(s.drag<1e-8){if(s.gravity===0)return null;const dt=s.vy/s.gravity;return dt>0&&dt<s.to-s.from?s.from+dt:null;}
  const terminal=s.windY-s.gravity/s.drag,coefficient=s.vy-terminal;if(coefficient===0)return null;const ratio=-terminal/coefficient;if(!(ratio>0&&ratio<1))return null;const dt=-Math.log(ratio)/s.drag;return dt>0&&dt<s.to-s.from?s.from+dt:null;
}
/** Exact-law plane specialization, with numerical root brackets. Each segment
 * has {from,to,y,vy,drag,windY,gravity}; its pose is at segment.from. Segments
 * are committed finite held-wind linear-drag pieces covering[from,to]. This
 * is NOT a motor-force or arbitrary callback trajectory solver.
 */
export function resolvePlaneAirSupport(options){
  const q=request(options),planeHeight=finite(options.planeHeight??0,'Plane height'),clearance=nonnegative(options.clearanceMetres??.03,'Clearance'),padding=nonnegative(options.numericPaddingMetres??1e-12,'Numeric padding'),continuity=nonnegative(options.continuityTolerance??1e-8,'Continuity tolerance'),work=budget(q.maxEvaluations);
  if(!Array.isArray(options.segments)||!options.segments.length||options.segments.length>4096)throw new TypeError('Plane support requires1..4096 committed segments');
  const segments=options.segments.map(raw=>{if(!raw||typeof raw!=='object')throw new TypeError('Invalid plane segment');const s={from:finite(raw.from,'Segment start'),to:finite(raw.to,'Segment end'),y:finite(raw.y,'Segment initial Y'),vy:finite(raw.vy,'Segment initial Vy'),drag:nonnegative(raw.drag??.2,'Segment drag'),windY:finite(raw.windY??0,'Segment vertical wind'),gravity:finite(raw.gravity??9.81,'Segment gravity')};if(s.to<s.from||s.to>q.physicalNow)throw new RangeError('Segment requires finite from <= to <= physicalNow');return s;});
  const endPoses=new Map(),endPose=s=>{if(!endPoses.has(s)){work.tick('analyticPoses');endPoses.set(s,verticalPose(s,s.to));}return endPoses.get(s);};
  for(let i=1;i<segments.length;i++){const a=segments[i-1],b=segments[i];if(a.to!==b.from)throw new RangeError('Plane segments must be sorted, adjacent and nonoverlapping');const end=endPose(a);if(Math.abs(end.y-b.y)>continuity||Math.abs(end.vy-b.vy)>continuity)throw new RangeError('Plane segment pose/velocity is discontinuous');}
  if(segments[0].from>q.from||segments.at(-1).to<q.to)throw new RangeError('Plane segments do not cover requested support');
  const cuts=[];for(const s of segments){if(s.from>q.from&&s.from<q.to)cuts.push(s.from);const e=extremum(s);if(e!==null&&e>q.from&&e<q.to)cuts.push(e);}cuts.sort((a,b)=>a-b);
  function segmentAt(time){let lo=0,hi=segments.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(segments[m].from<=time)lo=m;else hi=m-1;}return segments[lo];}
  const cache=new Map();
  function g(time){if(time<q.from||time>q.to||time>q.physicalNow)throw new RangeError('Plane support attempted a noncausal/out-of-window pose');if(!cache.has(time)){work.tick('analyticPoses');const state=verticalPose(segmentAt(time),time);cache.set(time,finite(state.y-planeHeight-clearance,'Analytical plane clearance'));}return cache.get(time);}
  function bounds({from,to}){
    const a=g(from),b=g(to),s=segmentAt(from),leftLimit=to===s.to?finite(endPose(s).y-planeHeight-clearance,'Plane left-limit clearance'):b;
    let lo=Math.min(a,b,leftLimit),hi=Math.max(a,b,leftLimit);
    // The solver partitions at every segment boundary and vertical extremum.
    // Endpoints therefore enclose this complete monotone vertical interval.
    // Pose continuity admits only tiny numerical seams. Include the previous
    // segment's left limit as well as the right-hand boundary pose, or such a
    // seam could hide a small positive interval just before the boundary.
    const error=padding+32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b),Math.abs(leftLimit),Math.abs(planeHeight),clearance);
    if(a===0&&b===0&&leftLimit===0&&s.vy===0&&s.gravity===0&&(s.drag<1e-8||s.windY===0))return{lower:0,upper:0};
    return{lower:finite(lo-error,'Plane lower bound'),upper:finite(hi+error,'Plane upper bound'),resolutionFloorMetres:error};
  }
  return solver({...options,sampleClearanceAt:g,boundInterval:bounds,partitionTimes:cuts,model:'held-wind linear-drag vertical plane pieces; analytic extrema partitions; finite numerical root brackets'},work);
}
