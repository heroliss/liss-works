// Runtime adapter for causal AIR visibility. Motion, fuel and already emitted
// smoke are never terminated by this module. Surface bounds are supplied by
// the owner of the actual terrain; arbitrary height callbacks are not certified.
import {sampleBody} from './fireworks-physics.js';
import {bodyMotorMotionBound} from './fireworks-physics.js';
import {sampleTailReleaseFieldNode} from './firework-tail-field.js';
import {resolveBoundedAirSupport,resolvePlaneAirSupport} from './firework-air-support.js';

const finite=(v,n)=>{if(typeof v!=='number'||!Number.isFinite(v))throw new RangeError(n+' must be finite');return v;};
const field=node=>node?.schema==='glass-atoll.tail-release-field-node.v1';
export function createFireworkContactSupport(surface){
  if(!surface||typeof surface.heightAt!=='function'||typeof surface.boundAtHorizontalRegion!=='function')throw new TypeError('Contact support requires an explicitly bounded surface');
  for(const key of ['minimumHeight','maximumHeight','maximumSpatialSlope','maximumTimeRate'])finite(surface[key],'Surface '+key);
  if(surface.minimumHeight>surface.maximumHeight||surface.maximumSpatialSlope<0||surface.maximumTimeRate<0)throw new RangeError('Invalid surface bounds');
  if(surface.maximumTimeRate!==0)throw new RangeError('Runtime contact optics currently admits static surfaces only');
  const clearance=surface.clearanceMetres??.03;finite(clearance,'Surface clearance');if(clearance<0)throw new RangeError('Surface clearance cannot be negative');
  let now=0,timeline=[],maximumWind=[0,0,0],speedCache=new WeakMap(),supportCache=new WeakMap(),stats={};
  function begin({physicalNow,windTimeline}){
    finite(physicalNow,'Physical now');if(!Array.isArray(windTimeline))throw new TypeError('Contact support requires committed wind history');
    let previous=-Infinity;
    for(let i=0;i<windTimeline.length;i++){const knot=windTimeline[i],t=knot?.time;if(!(typeof t==='number'&&(Number.isFinite(t)||i===0&&t===-Infinity))||t<previous||t>physicalNow||!Array.isArray(knot.wind)||knot.wind.length!==3||knot.wind.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new RangeError('Contact wind history must be sorted, finite and committed');previous=t;}
    now=physicalNow;timeline=windTimeline;maximumWind=[0,0,0];
    for(const knot of timeline)if(knot.time<=now)for(let c=0;c<3;c++)maximumWind[c]=Math.max(maximumWind[c],Math.abs(finite(knot.wind[c],'Committed wind')));
    speedCache=new WeakMap();supportCache=new WeakMap();stats={currentQueries:0,surfaceQueries:0,viewQueries:0,fastAbove:0,planeSolves:0,boundedSolves:0,partialRows:0,emptyRows:0,maximumIntervals:0,maximumUnresolvedSeconds:0,evaluations:0};
  }
  function heightAt(position,time=now){stats.surfaceQueries++;const value=surface.heightAt(position[0],position[2],time);finite(value,'Surface height');if(value<surface.minimumHeight-1e-10||value>surface.maximumHeight+1e-10)throw new RangeError('Surface sample exceeds its declared height bounds');return value;}
  function isAboveSurface(position){stats.currentQueries++;const padding=128*Number.EPSILON*Math.max(1,Math.abs(position[1]),Math.abs(surface.maximumHeight));return position[1]-surface.maximumHeight-clearance>padding||position[1]-heightAt(position)-clearance>0;}
  function sampleAt(node,time){if(time>now)throw new RangeError('Contact support cannot sample future poses');return field(node)?sampleTailReleaseFieldNode(node,time,timeline):sampleBody(node,time,timeline);}
  function sourceSpeed(body){
    if(speedCache.has(body))return speedCache.get(body);
    if(body.birth>now)throw new RangeError('Source has not been born');
    const initial=sampleBody(body,body.birth,timeline),k=body.drag??.2,g=body.gravity??9.81;finite(k,'Source drag');finite(g,'Source gravity');if(k<0)throw new RangeError('Contact motion requires nonnegative drag');
    // Linear drag is a positive convolution of held wind. The base velocity
    // (including a parent's committed birth pose) and terminal forcing enclose
    // each component at every causal time up to now. No future hit is cached.
    const M=initial.velocity.map((v,c)=>k<1e-8?Math.abs(v)+(c===1?Math.abs(g)*Math.max(0,now-body.birth):0):Math.max(Math.abs(v),maximumWind[c]+(c===1?Math.abs(g)/k:0)));
    if(body.motorProfile)throw new RangeError('Unknown motor profile has no contact derivative bound');
    if(body.thrustProfile||body.displayMotor){const motor=bodyMotorMotionBound(body,now);for(let c=0;c<3;c++)M[c]+=motor.maximumVelocityDeltaMetresPerSecond;}
    speedCache.set(body,M);return M;
  }
  function nodeSpeed(node){
    if(!field(node))return sourceSpeed(node);
    const body=node.body,M=sourceSpeed(body),k=body.drag??.2,g=body.gravity??9.81,T=node.travel,E=node.decay;
    const motorA=body.thrustProfile||body.displayMotor?bodyMotorMotionBound(body,now).maximumMotorAccelerationMetresPerSecondSquared:0;
    return M.map((v,c)=>v+.25*T*((k<1e-8?0:k*(maximumWind[c]+v))+(c===1?Math.abs(g):0)+motorA)+2*(1-E)*maximumWind[c]);
  }
  function windAt(time){if(!timeline.length)return[0,0,0];let lo=0,hi=timeline.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(timeline[mid].time<=time)lo=mid;else hi=mid-1;}return timeline[lo].wind;}
  function regionAt(state,M,half){return surface.boundAtHorizontalRegion({minimumX:state.position[0]-M[0]*half,maximumX:state.position[0]+M[0]*half,minimumZ:state.position[2]-M[2]*half,maximumZ:state.position[2]+M[2]*half});}
  function resolve(p,exposure){
    if(!exposure||exposure.physicalNow!==now||exposure.to!==now||exposure.durationSeconds!==exposure.to-exposure.from||exposure.durationSeconds<0||exposure.durationSeconds>1||!Number.isFinite(exposure.from))throw new RangeError('Contact exposure must be the current causal-end window');
    let cache=supportCache.get(p);if(!cache){cache=new Map();supportCache.set(p,cache);}const key=exposure.durationSeconds;if(cache.has(key))return cache.get(key);if(cache.size>=4)cache.clear();stats.viewQueries++;
    const node=p.tailFieldNode??p.emberBody??p.sourceBody,birth=node?.birth;if(!Number.isFinite(birth))throw new RangeError('Contact source requires a finite kinematic birth');
    const M=nodeSpeed(node),duration=exposure.durationSeconds;
    // This even encloses the old virtual pre-birth raster extension. Thus the
    // complete old high-air path (including upload rounding) can remain exact.
    const fastPadding=128*Number.EPSILON*Math.max(1,Math.abs(p.position[1]),M[1]*duration,Math.abs(surface.maximumHeight));
    if(p.position[1]-M[1]*duration>surface.maximumHeight+clearance+fastPadding){stats.fastAbove++;cache.set(key,null);return null;}
    const from=Math.max(exposure.from,birth),to=exposure.to;
    if(from>to||from===to&&duration>0){cache.set(key,{intervals:[],status:'resolved',totalUnresolvedSeconds:0});return cache.get(key);}
    const poses=new Map(),pose=t=>{if(!poses.has(t)){const value=sampleAt(node,t);if(!value)throw new RangeError('Contact support pose predates birth');poses.set(t,value);}return poses.get(t);};
    const mid=from+(to-from)*.5,midState=pose(mid),region=regionAt(midState,M,(to-from)*.5);
    const numericPadding=128*Number.EPSILON*Math.max(1,...midState.position.map(Math.abs),...M.map(v=>v*Math.max(1,now-birth)));
    const common={physicalNow:now,from,to,timeToleranceSeconds:1e-8,clearanceToleranceMetres:0,maxIntervals:16,maxEvaluations:4096,numericPaddingMetres:numericPadding};
    let result;
    if(!field(node)&&!node.thrustProfile&&!node.displayMotor&&region.certifiedSeaOnly&&surface.maximumTimeRate===0&&duration>0){
      const cuts=[from,...timeline.filter(k=>k.time>from&&k.time<to).map(k=>k.time),to],segments=[];
      for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i];if(!(b>a))continue;const state=pose(a);segments.push({from:a,to:b,y:state.position[1],vy:state.velocity[1],drag:node.drag??.2,gravity:node.gravity??9.81,windY:windAt(a)[1]});}
      stats.planeSolves++;result=resolvePlaneAirSupport({...common,segments,planeHeight:region.planeHeight,clearanceMetres:clearance});
    }else{
      stats.boundedSolves++;
      const sampleClearanceAt=t=>{const state=pose(t);return state.position[1]-heightAt(state.position,t)-clearance;};
      const boundInterval=({from:a,to:b})=>{
        const t=a+(b-a)*.5,h=(b-a)*.5,state=pose(t),local=regionAt(state,M,h),surfaceHeight=heightAt(state.position,t),c=state.position[1]-surfaceHeight-clearance;
        const L=(M[1]+local.maximumSpatialSlope*Math.hypot(M[0],M[2])+local.maximumTimeRate)*(1+64*Number.EPSILON),padding=numericPadding+(local.heightErrorMetres??0),margin=L*h+padding;
        return{lower:Math.max(c-margin,state.position[1]-M[1]*h-local.maximumHeight-clearance-padding),upper:Math.min(c+margin,state.position[1]+M[1]*h-local.minimumHeight-clearance+padding),resolutionFloorMetres:2*padding};
      };
      const knots=[];for(const knot of timeline)for(const shift of field(node)?[0,node.lagSeconds]:[0]){const t=knot.time+shift;if(t>from&&t<to)knots.push(t);}const source=field(node)?node.body:node;if(source.thrustProfile)for(const cell of source.thrustProfile.cells){const t=source.birth+cell.toAge+(field(node)?node.lagSeconds:0);if(t>from&&t<to)knots.push(t);}if(source.displayMotor)for(const cell of source.displayMotor.cells)for(const age of [cell.from,cell.to]){const t=source.birth+age+(field(node)?node.lagSeconds:0);if(t>from&&t<to)knots.push(t);}knots.sort((a,b)=>a-b);
      result=resolveBoundedAirSupport({...common,sampleClearanceAt,boundInterval,partitionTimes:knots,model:'actual causal body/tail field; certified speed and static bounded surface'});
    }
    if(result.status==='uncertain'||result.totalUnresolvedSeconds>1e-7)throw new RangeError('Contact support boundary remains unresolved; no optical intervals dropped');
    stats.evaluations+=result.evaluations.total;stats.maximumUnresolvedSeconds=Math.max(stats.maximumUnresolvedSeconds,result.totalUnresolvedSeconds);stats.maximumIntervals=Math.max(stats.maximumIntervals,result.intervals.length);
    if(!result.intervals.length)stats.emptyRows++;else if(result.intervals.length!==1||result.intervals[0].from!==exposure.from||result.intervals[0].to!==exposure.to)stats.partialRows++;
    cache.set(key,result);return result;
  }
  return Object.freeze({begin,isAboveSurface,resolve,sampleAt,diagnostics:()=>({...stats,surface:surface.schema??'caller-bounded-surface',clearanceMetres:clearance,scope:'air-source centre support over static terrain/mean sea; finite root brackets; smoke and material unchanged'})});
}
