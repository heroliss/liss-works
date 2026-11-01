// Pure authored finite acceleration. No renderer, RNG-at-query-time, wind,
// gravity, photometry, mass, fuel or body-state mutation is performed here.
export const FINITE_THRUST_SCHEMA='glass-atoll.finite-thrust-profile.v1';
export const FINITE_THRUST_LIMITS=Object.freeze({maximumCells:12,maximumMotorEndSeconds:1.06,maximumAccelerationMetresPerSecondSquared:12,maximumIntegratedAccelerationMetresPerSecond:12.72,maximumQueryAgeSeconds:3600,maximumDragPerSecond:1000,responseCacheEntriesPerProfile:4,maximumHeadingStepDegrees:22.5,headingIntervalSeconds:.125});
const compiled=new WeakMap(),TAU=Math.PI*2,ZERO=Object.freeze([0,0,0]);
const finite=(x,name)=>{if(typeof x!=='number'||!Number.isFinite(x))throw new RangeError(name+' must be finite');return x;};
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
function record(value,keys,name){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new TypeError(name+' requires a plain object');
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(descriptors).some(k=>typeof k!=='string'||!keys.includes(k))||Object.values(descriptors).some(d=>d.get||d.set))throw new TypeError(name+' has unsupported fields/accessors');
  return value;
}
function dense(value,length,name){
  if(!Array.isArray(value)||value.length!==length||Object.keys(value).length!==length||Reflect.ownKeys(value).some(k=>typeof k==='symbol'))throw new TypeError(name+' requires a dense array');
  for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||d.get||d.set)throw new TypeError(name+' requires own data entries');}return value;
}
const vector=(v,name)=>dense(v,3,name).map(x=>finite(x,name+' component'));
const norm=v=>Math.hypot(v[0],v[1],v[2]),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>{const n=norm(v);if(!(n>0))throw new RangeError('Heading cannot be zero');return v.map(x=>x/n);};
function state(profile){const data=compiled.get(profile);if(!data)throw new TypeError('Use an immutable factory thrust profile');return data;}
function queryAge(age){finite(age,'Relative motor age');if(age>FINITE_THRUST_LIMITS.maximumQueryAgeSeconds)throw new RangeError('Relative motor age exceeds bounded query horizon');return age;}
function dragValue(drag){finite(drag,'Effective drag');if(drag<0||drag>FINITE_THRUST_LIMITS.maximumDragPerSecond)throw new RangeError('Effective drag outside0..1000 per second');return drag;}
function compile(id,input,authoring){
  if(typeof id!=='string'||!id.length||id.length>256)throw new TypeError('Thrust profile requires a bounded nonempty ID');
  if(!Array.isArray(input)||input.length<1||input.length>FINITE_THRUST_LIMITS.maximumCells)throw new RangeError('Finite thrust requires1..12 cells');dense(input,input.length,'Force cells');
  let end=0,impulse=0,correction=0,peak=0;
  const cells=input.map((cell,index)=>{
    record(cell,['fromAge','toAge','acceleration'],'Force cell');const fromAge=finite(cell.fromAge,'Cell start'),toAge=finite(cell.toAge,'Cell end');
    if(fromAge!==end||!(toAge>fromAge)||toAge>FINITE_THRUST_LIMITS.maximumMotorEndSeconds)throw new RangeError('Force cells must exactly tile0..finite motor end');
    const acceleration=vector(cell.acceleration,'World acceleration'),magnitude=norm(acceleration);
    if(magnitude>FINITE_THRUST_LIMITS.maximumAccelerationMetresPerSecondSquared)throw new RangeError('Force cell exceeds authored acceleration limit');
    const duration=toAge-fromAge,part=magnitude*duration-correction,next=impulse+part;correction=(next-impulse)-part;impulse=next;end=toAge;peak=Math.max(peak,magnitude);
    return{index,fromAge,toAge,acceleration,magnitudeMetresPerSecondSquared:magnitude};
  });
  if(impulse>FINITE_THRUST_LIMITS.maximumIntegratedAccelerationMetresPerSecond)throw new RangeError('Finite force exceeds integrated acceleration limit');
  const profile=freeze({schema:FINITE_THRUST_SCHEMA,id,cells,motorStartAge:0,motorEndAge:end,maximumAccelerationMetresPerSecondSquared:peak,integratedAccelerationMagnitudeMetresPerSecond:impulse,hardLimits:FINITE_THRUST_LIMITS,authoring,
    units:'world acceleration m/s2; relative physical seconds; effective drag s^-1; no newton/kg/fuel or optical calibration',
    model:'finite piecewise-held world acceleration; linear-drag zero-initial-state contribution added to separate ballistic/wind/gravity response',
    limits:'position/velocity continuous; prescribed acceleration can jump at cell boundaries; heading steps are not a continuous angular-rate/attitude model'});
  compiled.set(profile,{prefixByDrag:new Map()});return profile;
}
export function createFiniteThrustProfile(options){record(options,['id','cells'],'Thrust profile');return compile(options.id,options.cells,{kind:'explicit-authored-world-cells',physicalCalibration:'unknown mass, dimensions, fuel, thrust and attitude'});}

// F=integral(exp(-k*s),s0..dt), B=integral(F(k,s),s0..dt).
// Local series avoids cancellation in (dt-F)/k and handles k*dt underflow.
function coefficients(dt,k){
  if(dt===0)return{decay:1,travel:0,accelerationTravel:0};
  if(k===0)return{decay:1,travel:dt,accelerationTravel:dt*dt*.5};
  const z=k*dt;
  if(z<1e-3){
    const phi1=1+z*(-.5+z*(1/6+z*(-1/24+z*(1/120+z*(-1/720+z*(1/5040+z*(-1/40320+z/362880)))))));
    const phi2=.5+z*(-1/6+z*(1/24+z*(-1/120+z*(1/720+z*(-1/5040+z*(1/40320+z*(-1/362880+z/3628800)))))));
    return{decay:Math.exp(-z),travel:dt*phi1,accelerationTravel:dt*dt*phi2};
  }
  const travel=-Math.expm1(-z)/k;return{decay:Math.exp(-z),travel,accelerationTravel:(dt-travel)/k};
}
function step(p,v,a,dt,k){const f=coefficients(dt,k);return{position:p.map((x,c)=>x+v[c]*f.travel+a[c]*f.accelerationTravel),velocity:v.map((x,c)=>x*f.decay+a[c]*f.travel)};}
function prefixes(profile,k,data){
  const cache=data.prefixByDrag;if(cache.has(k))return cache.get(k);
  let p=[0,0,0],v=[0,0,0];const result=[{position:p,velocity:v}];
  for(const cell of profile.cells){const next=step(p,v,cell.acceleration,cell.toAge-cell.fromAge,k);p=next.position;v=next.velocity;result.push(next);}
  if(cache.size>=FINITE_THRUST_LIMITS.responseCacheEntriesPerProfile)cache.delete(cache.keys().next().value);cache.set(k,result);return result;
}
// At an exact boundary, the right-hand cell owns the new acceleration.
function cellAt(profile,age){let lo=0,hi=profile.cells.length;while(lo<hi){const m=(lo+hi)>>>1;if(age<profile.cells[m].toAge)hi=m;else lo=m+1;}return lo;}
export function sampleFiniteThrustAcceleration(profile,age){state(profile);queryAge(age);if(age<0)return null;const i=cellAt(profile,age);return i<profile.cells.length?[...profile.cells[i].acceleration]:[0,0,0];}
export function sampleFiniteThrustResponse(profile,age,dragPerSecond=0){
  const data=state(profile);queryAge(age);const k=dragValue(dragPerSecond);if(age<0)return null;
  const i=cellAt(profile,age),prefix=prefixes(profile,k,data),before=prefix[i],cell=profile.cells[i],from=cell?.fromAge??profile.motorEndAge,a=cell?.acceleration??ZERO,result=step(before.position,before.velocity,a,age-from,k);
  return{age,positionDelta:result.position,velocityDelta:result.velocity,motorAcceleration:[...a],responseAcceleration:result.velocity.map((v,c)=>a[c]-k*v),activeCellIndex:cell?i:null,motorActive:!!cell,dragPerSecond:k};
}
export function getFiniteThrustMotionBound(profile,age,dragPerSecond=0){
  state(profile);queryAge(age);const k=dragValue(dragPerSecond);if(age<0)return null;
  let J=0;for(const cell of profile.cells){const h=Math.max(0,Math.min(age,cell.toAge)-cell.fromAge);J+=cell.magnitudeMetresPerSecondSquared*h;}
  return{age,maximumVelocityDeltaMetresPerSecond:J,maximumPositionDeltaMetres:J*coefficients(age,k).travel,fullIntegratedAccelerationMetresPerSecond:profile.integratedAccelerationMagnitudeMetresPerSecond,
    derivation:'nonnegative linear-drag kernels: |deltaV|<=integral|a|; |deltaP|<=integral|a|*F(k,age); floating-point numerical enclosure with caller tolerance'};
}

function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return(h^(h>>>16))>>>0;}
function frameValue(input){
  if(input===undefined)return{right:[1,0,0],up:[0,1,0],forward:[0,0,1]};record(input,['right','up','forward'],'Burst frame');
  const f=Object.fromEntries(['right','up','forward'].map(k=>[k,vector(input[k],'Burst frame '+k)])),v=Object.values(f);
  if(v.some(a=>Math.abs(norm(a)-1)>1e-10)||Math.abs(dot(v[0],v[1]))>1e-10||Math.abs(dot(v[0],v[2]))>1e-10||Math.abs(dot(v[1],v[2]))>1e-10||Math.abs(dot(cross(v[0],v[1]),v[2])-1)>1e-10)throw new RangeError('Burst frame requires an orthonormal right-handed basis');return f;
}
export function compileSeededBeeThrust(options){
  record(options,['eventSeed','bodyId','timeScale','frame'],'Seeded bee thrust');const {eventSeed,bodyId}=options,timeScale=options.timeScale??1;
  if(!Number.isSafeInteger(eventSeed)||eventSeed<0||eventSeed>4294967295||!Number.isSafeInteger(bodyId)||bodyId<0||bodyId>191)throw new RangeError('Seeded bee requires uint32 event seed and native root ID0..191');
  finite(timeScale,'Instantiated motor time scale');if(timeScale<.94||timeScale>1.06)throw new RangeError('Instantiated motor time scale requires.94..1.06');
  const frame=frameValue(options.frame),key=JSON.stringify(['glass-atoll.thrust-v1',eventSeed,bodyId]),draw=(index,channel)=>hash(key+'/'+index+'/'+channel)/4294967296;
  const envelope=[{age:0,rate:0},{age:.05*timeScale,rate:12},{age:.75*timeScale,rate:12},{age:timeScale,rate:0}],end=timeScale,times=new Set(envelope.map(k=>k.age));
  for(let t=FINITE_THRUST_LIMITS.headingIntervalSeconds;t<end;t+=FINITE_THRUST_LIMITS.headingIntervalSeconds)times.add(t);
  const cuts=[...times].sort((a,b)=>a-b);if(cuts.length-1>FINITE_THRUST_LIMITS.maximumCells)throw new RangeError('Seeded force schedule exceeds finite cell limit');
  const y=draw(0,'sphere-y')*2-1,theta=draw(0,'sphere-angle')*TAU,r=Math.sqrt(Math.max(0,1-y*y));let direction=[r*Math.cos(theta),y,r*Math.sin(theta)];
  const headings=[direction];for(let j=1;j<=Math.floor(end/FINITE_THRUST_LIMITS.headingIntervalSeconds);j++){
    const tangent0=unit(cross(direction,Math.abs(direction[1])<.9?[0,1,0]:[1,0,0])),tangent1=cross(direction,tangent0),angle=draw(j,'turn')*FINITE_THRUST_LIMITS.maximumHeadingStepDegrees*Math.PI/180,az=draw(j,'azimuth')*TAU,tangent=tangent0.map((v,c)=>v*Math.cos(az)+tangent1[c]*Math.sin(az));
    direction=unit(direction.map((v,c)=>v*Math.cos(angle)+tangent[c]*Math.sin(angle)));headings.push(direction);
  }
  function area(lo,hi){let sum=0;for(let i=0;i<envelope.length-1;i++){const a=envelope[i],b=envelope[i+1],l=Math.max(lo,a.age),h=Math.min(hi,b.age);if(!(h>l))continue;const va=a.rate+(b.rate-a.rate)*(l-a.age)/(b.age-a.age),vb=a.rate+(b.rate-a.rate)*(h-a.age)/(b.age-a.age);sum+=(va+vb)*.5*(h-l);}return sum;}
  const cells=[];for(let i=0;i<cuts.length-1;i++){
    const fromAge=cuts[i],toAge=cuts[i+1],headingIndex=Math.floor(fromAge/FINITE_THRUST_LIMITS.headingIntervalSeconds),local=headings[headingIndex],world=unit([0,1,2].map(c=>frame.right[c]*local[0]+frame.up[c]*local[1]+frame.forward[c]*local[2])),magnitude=area(fromAge,toAge)/(toAge-fromAge);
    let acceleration=world.map(x=>x*magnitude);for(let n=0;norm(acceleration)>12&&n<4;n++)acceleration=acceleration.map(x=>x*(1-Number.EPSILON*2));
    cells.push({fromAge,toAge,acceleration});
  }
  return compile('bee-thrust-'+hash(key).toString(16),cells,{kind:'seeded-authored-bee-heading-cells',seedNamespace:'glass-atoll.thrust-v1',eventSeed,bodyId,timeScale,frame,headingIntervalSeconds:FINITE_THRUST_LIMITS.headingIntervalSeconds,maximumHeadingStepDegrees:FINITE_THRUST_LIMITS.maximumHeadingStepDegrees,headingsLocal:headings,magnitudeEnvelopeKnots:envelope,scalarEnvelopeAreaMetresPerSecond:area(0,end),meanCellPolicy:'exact local trapezoid mean of piecewise-linear envelope, within floating-point roundoff; only last-bit peak overshoot can shrink by a few ulps',physicalCalibration:'authored reference; no measured bee thrust/mass/size/attitude or continuous heading slew'});
}
