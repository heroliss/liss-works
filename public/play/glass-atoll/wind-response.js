// Exact affine response to the existing piecewise-held wind timeline.
// Checkpoints are shared by drag coefficient; no wind quantization/resampling.
const timelines=new WeakMap();
const zero=[0,0,0];
// An opt-in synchronous bulk-query scope. Cache only the wind-only affine
// response; body positions, velocities, parents and render state stay outside.
// No scope survives the callback or changes the ordinary public call path.
let currentMemo=null;
const negativeZero=Symbol('wind response negative zero'),memoLimit=4096;
const exactKey=x=>Object.is(x,-0)?negativeZero:x;
function immutableResponse(value){Object.freeze(value.position);Object.freeze(value.velocity);return Object.freeze(value);}
function disableMemo(scope){scope.disabled=true;scope.values.clear();scope.entries=0;}

/** Reuse exact (drag,birth,time) responses within one synchronous callback.
 * Timeline knots must remain immutable, as for ordinary windResponse calls.
 * Historical edits require invalidateWindResponse. Cached responses are read
 * only, including their arrays. Nested scopes are independent; a nested scope
 * for another timeline does not borrow the outer cache. No pose/state cache.
 */
export function withWindResponseMemo(timeline,callback){
  if(!Array.isArray(timeline))throw new TypeError('Wind response memo requires a timeline array');
  if(typeof callback!=='function'||Object.prototype.toString.call(callback)==='[object AsyncFunction]'||Object.prototype.toString.call(callback)==='[object AsyncGeneratorFunction]')throw new TypeError('Wind response memo requires a synchronous callback');
  const previous=currentMemo,scope={previous,timeline,length:timeline.length,first:timeline[0],last:timeline.at(-1),values:new Map(),entries:0,disabled:false};
  currentMemo=scope;
  try{
    const result=callback();
    if(result!==null&&(typeof result==='object'||typeof result==='function')&&typeof result.then==='function'){
      // Consume rejection only for a real Promise via the intrinsic method.
      // Do not execute an arbitrary thenable's user-defined then function.
      try{Promise.prototype.then.call(result,()=>{},()=>{});}catch{}
      throw new TypeError('Wind response memo callback must not return a Promise or thenable');
    }
    return result;
  }finally{disableMemo(scope);currentMemo=previous;}
}
function factors(k,dt){
  const x=k*dt,decay=Math.exp(-x),travel=-Math.expm1(-x)/k;
  const drift=x<1e-3?dt*x*(.5-x/6+x*x/24-x*x*x/120+x*x*x*x/720):dt-travel;
  return {decay,travel,drift};
}
function constant(w,k,dt){
  const f=factors(k,dt);return {...f,position:[w[0]*f.drift,w[1]*f.drift,w[2]*f.drift],velocity:[w[0]*(1-f.decay),w[1]*(1-f.decay),w[2]*(1-f.decay)]};
}
function lastAt(timeline,time){
  let lo=0,hi=timeline.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(timeline[mid].time<=time)lo=mid+1;else hi=mid;}
  return Math.max(0,lo-1);
}
function context(timeline){
  let c=timelines.get(timeline);
  if(!c){c={length:-1,first:null,last:null,revision:0,drags:new Map(),queries:0,rebuilds:0,appended:0};timelines.set(timeline,c);}
  const first=timeline[0],last=timeline.at(-1);
  if(c.length!==timeline.length||c.first!==first||c.last!==last){c.revision++;c.length=timeline.length;c.first=first;c.last=last;}
  return c;
}
function syncDrag(c,timeline,k){
  let cache=c.drags.get(k);
  if(cache?.revision===c.revision)return cache;
  if(!cache){cache={revision:-1,points:new WeakMap(),last:null,lastPoint:null,memo:new Map()};c.drags.set(k,cache);}
  let index=-1;
  if(cache.last){
    index=lastAt(timeline,cache.last.time);
    while(index>=0&&timeline[index].time===cache.last.time&&timeline[index]!==cache.last)index--;
    if(index<0||timeline[index]!==cache.last)index=-1;
  }
  if(index<0){
    cache.points=new WeakMap();cache.last=null;cache.lastPoint=null;c.rebuilds++;
    // No exponential at absolute time. The first finite knot is a local
    // arbitrary V=X=0 origin; affine differences cancel this initial choice.
    index=timeline.findIndex(segment=>Number.isFinite(segment.time));
    if(index<0)throw new Error('Nonconstant wind response requires a finite knot');
    const segment=timeline[index],point={time:segment.time,wind:segment.wind??zero,V:[0,0,0],X:[0,0,0]};
    cache.points.set(segment,point);cache.last=segment;cache.lastPoint=point;
  }
  for(let i=index+1;i<timeline.length;i++){
    const segment=timeline[i],previous=cache.lastPoint,dt=segment.time-previous.time;
    if(!Number.isFinite(dt)||dt<0)throw new RangeError('Wind timeline must have nondecreasing finite knots after its initial constant segment');
    const f=factors(k,dt),V=[],X=[];
    for(let j=0;j<3;j++){
      V[j]=f.decay*previous.V[j]+(1-f.decay)*previous.wind[j];
      X[j]=previous.X[j]+f.travel*previous.V[j]+f.drift*previous.wind[j];
    }
    const point={time:segment.time,wind:segment.wind??zero,V,X};
    cache.points.set(segment,point);cache.last=segment;cache.lastPoint=point;c.appended++;
  }
  cache.memo.clear();cache.revision=c.revision;return cache;
}
function prefix(cache,segment,time,k){
  let value=cache.memo.get(time);if(value)return value;
  const point=cache.points.get(segment);
  if(!point)throw new Error('Wind checkpoint missing after timeline mutation; call invalidateWindResponse for historical edits');
  const f=factors(k,time-point.time),V=[],X=[];
  for(let i=0;i<3;i++){
    V[i]=f.decay*point.V[i]+(1-f.decay)*point.wind[i];
    X[i]=point.X[i]+f.travel*point.V[i]+f.drift*point.wind[i];
  }
  value={V,X};if(cache.memo.size>=96)cache.memo.clear();cache.memo.set(time,value);return value;
}

/** Wind-only position/velocity from zero initial state over [birth,time].
 * Supports arbitrary query order and last-wind future extension. Timeline
 * segments must be immutable once appended; append/prune are detected cheaply.
 */
export function windResponse(timeline,k,birth,time){
  const scope=currentMemo;
  if(!scope||scope.timeline!==timeline)return uncachedWindResponse(timeline,k,birth,time);
  if(!scope.disabled&&(scope.length!==timeline.length||scope.first!==timeline[0]||scope.last!==timeline.at(-1)))disableMemo(scope);
  if(scope.disabled)return immutableResponse(uncachedWindResponse(timeline,k,birth,time));
  const K=exactKey(k),B=exactKey(birth),T=exactKey(time),hit=scope.values.get(K)?.get(B)?.get(T);
  if(hit)return hit;
  const value=immutableResponse(uncachedWindResponse(timeline,k,birth,time));
  // Recursive initial-wind queries may have inserted entries while evaluating
  // this result. Re-read the maps, and do not allocate new keys above the cap.
  if(!scope.disabled&&scope.entries<memoLimit){
    let byBirth=scope.values.get(K);if(!byBirth){byBirth=new Map();scope.values.set(K,byBirth);}
    let byTime=byBirth.get(B);if(!byTime){byTime=new Map();byBirth.set(B,byTime);}
    if(!byTime.has(T)){byTime.set(T,value);scope.entries++;}
  }
  return value;
}
function uncachedWindResponse(timeline,k,birth,time){
  const dt=time-birth;
  if(!(k>0)||!Number.isFinite(k)||!Number.isFinite(birth)||!Number.isFinite(time)||dt<0)throw new RangeError('Wind response requires finite positive drag and ordered finite query times');
  if(!timeline.length)return constant(zero,k,dt);
  if(timeline.length===1||birth>=timeline.at(-1).time||time<=timeline[0].time)return constant((birth>=timeline.at(-1).time?timeline.at(-1):timeline[0]).wind??zero,k,dt);
  const begin=lastAt(timeline,birth),end=lastAt(timeline,time);
  if(begin===end)return constant(timeline[begin].wind??zero,k,dt);
  const c=context(timeline);c.queries++;
  const cache=syncDrag(c,timeline,k),firstFinite=Number.isFinite(timeline[0].time)?0:1,anchor=timeline[firstFinite].time;
  if(time<=anchor)return constant(timeline[0].wind??zero,k,dt);
  if(birth<anchor){
    const before=constant(timeline[0].wind??zero,k,anchor-birth),after=windResponse(timeline,k,anchor,time),whole=factors(k,dt);
    return {...whole,position:before.position.map((p,i)=>p+after.travel*before.velocity[i]+after.position[i]),velocity:before.velocity.map((v,i)=>v*after.decay+after.velocity[i])};
  }
  const a=prefix(cache,timeline[begin],birth,k),b=prefix(cache,timeline[end],time,k),f=factors(k,dt);
  return {...f,position:b.X.map((x,i)=>x-a.X[i]-f.travel*a.V[i]),velocity:b.V.map((v,i)=>v-f.decay*a.V[i])};
}

// Explicit invalidation for QA/editors replacing values inside an old segment.
// The simulation itself only appends immutable records and prunes the front.
export function invalidateWindResponse(timeline){timelines.delete(timeline);for(let scope=currentMemo;scope;scope=scope.previous)if(scope.timeline===timeline)disableMemo(scope);}
export function windResponseDiagnostics(timeline){
  const c=timelines.get(timeline);return c?{revision:c.revision,dragClasses:c.drags.size,prefixQueries:c.queries,checkpointAppends:c.appended,rebuilds:c.rebuilds}: {revision:0,dragClasses:0,prefixQueries:0,checkpointAppends:0,rebuilds:0};
}
