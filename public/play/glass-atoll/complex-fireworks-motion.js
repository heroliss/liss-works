// Separate authored motor contract for display choreography. It does not
// relax the older powered-bee contract. Forces are prescribed, not fuel CFD.
const cache=new WeakMap(),GAP=1e-10;
const step=(p,v,a,dt,k)=>{const e=k>1e-8?Math.exp(-k*dt):1,F=k>1e-8?-Math.expm1(-k*dt)/k:dt,H=k>1e-8?(dt-F)/k:dt*dt*.5;return{position:p.map((x,c)=>x+v[c]*F+a[c]*H),velocity:v.map((x,c)=>x*e+a[c]*F)};};
const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){for(const v of Object.values(o))freeze(v);Object.freeze(o);}return o;};
// Vertical wind is zero in the display weather contract. This still-air
// coast is also the exact vertical state under arbitrary horizontal wind.
export function sampleDisplayCoast(position,velocity,age,drag=.45,gravity=9.81){
  if(!Array.isArray(position)||!Array.isArray(velocity)||position.length!==3||velocity.length!==3||[...position,...velocity,age,drag,gravity].some(x=>!Number.isFinite(x))||age<0||age>20||drag<=0||gravity<0)throw new RangeError('Finite display coast required');
  return step(position,velocity,[0,-gravity,0],age,drag);
}
export function displayAirborneBurnLimit({position,velocity,requestedLife,drag=.45,tailSeconds=0,minimumWorldY=1.03}={}){
  if(!Number.isFinite(requestedLife)||requestedLife<=0||requestedLife>20||!Number.isFinite(tailSeconds)||tailSeconds<0||tailSeconds>2.2||!Number.isFinite(minimumWorldY))throw new RangeError('Bounded airborne burn and released tail required');
  const gravity=9.81,minVerticalVelocity=Math.min(velocity[1],-gravity/drag),tailDrop=sampleDisplayCoast([0,0,0],[0,minVerticalVelocity*.25,0],tailSeconds,1.35,gravity).position[1],floor=minimumWorldY-Math.min(0,tailDrop);
  // Under downward gravity and drag the vertical trajectory has at most one
  // interior extremum, a maximum. Endpoint clearance therefore covers every
  // source age. The tail floor uses its worst downward release velocity.
  if(position[1]<floor)throw new RangeError('Display release is below its airborne tail clearance');
  if(sampleDisplayCoast(position,velocity,requestedLife,drag,gravity).position[1]>=floor)return requestedLife;
  let lo=0,hi=requestedLife;for(let i=0;i<56;i++){const age=(lo+hi)*.5;if(sampleDisplayCoast(position,velocity,age,drag,gravity).position[1]>=floor)lo=age;else hi=age;}return lo;
}
export function createDisplayMotor({right,up,phase=0,acceleration=70,duration=2.2,turns=2}={}){
  if(!Array.isArray(right)||!Array.isArray(up)||right.length!==3||up.length!==3||right.some(x=>!Number.isFinite(x))||up.some(x=>!Number.isFinite(x))||Math.abs(Math.hypot(...right)-1)>1e-8||Math.abs(Math.hypot(...up)-1)>1e-8||Math.abs(right.reduce((s,x,c)=>s+x*up[c],0))>1e-8)throw new RangeError('Display motor requires orthonormal force axes');
  if(!Number.isFinite(phase)||!Number.isFinite(acceleration)||acceleration<0||acceleration>90||!Number.isFinite(duration)||duration<=0||duration>3.3||!Number.isInteger(turns)||turns<1||turns>3)throw new RangeError('Display motor exceeds bounded authored force contract');
  const n=turns*24,cells=Array.from({length:n},(_,i)=>{const a=phase+Math.PI*2*turns*(i+.5)/n;return{from:i*duration/n,to:(i+1)*duration/n,acceleration:right.map((x,c)=>acceleration*(x*Math.cos(a)+up[c]*Math.sin(a)))};});
  const motor=freeze({schema:'glass-atoll.display-motor.v1',cells,endAge:duration,maximumAcceleration:acceleration,integratedAcceleration:acceleration*duration,turns,model:'finite piecewise-held rotating acceleration plus analytic drag; author choreography, not measured attitude or fuel'});cache.set(motor,new Map());return motor;
}
function prefix(motor,k){const map=cache.get(motor);if(!map)throw new TypeError('Use an immutable authored display motor');if(map.has(k))return map.get(k);if(map.size>=4)map.clear();const rows=[{position:[0,0,0],velocity:[0,0,0]}];for(const cell of motor.cells){const last=rows.at(-1);rows.push(step(last.position,last.velocity,cell.acceleration,cell.to-cell.from,k));}map.set(k,rows);return rows;}
export function sampleDisplayMotor(motor,age,drag){
  if(!Number.isFinite(age)||age<0||age>120||!Number.isFinite(drag)||drag<0||drag>10)throw new RangeError('Display motor query outside its finite domain');
  const rows=prefix(motor,drag);let lo=0,hi=motor.cells.length;while(lo<hi){const m=(lo+hi)>>>1;if(age<motor.cells[m].to)hi=m;else lo=m+1;}const cell=motor.cells[lo],start=cell?.from??motor.endAge,state=rows[lo];return step(state.position,state.velocity,cell?.acceleration??[0,0,0],Math.max(0,age-start),drag);
}
export function sampleDisplayMotorAcceleration(motor,age){
  if(!cache.has(motor)||!Number.isFinite(age))throw new TypeError('Finite display-motor acceleration query required');if(age<0)return null;let lo=0,hi=motor.cells.length;while(lo<hi){const m=(lo+hi)>>>1;if(age<motor.cells[m].to)hi=m;else lo=m+1;}return motor.cells[lo]?[...motor.cells[lo].acceleration]:[0,0,0];
}
export function displayMotorDisplacementBound(motor,drag,horizon){
  if(!Number.isFinite(horizon)||horizon<0||horizon>120)throw new RangeError('Finite motion horizon required');const rows=prefix(motor,drag);let bound=0;
  for(let i=0;i<motor.cells.length;i++){const c=motor.cells[i];if(c.from>horizon)break;const t=Math.max(0,Math.min(horizon,c.to)-c.from),r=rows[i];bound=Math.max(bound,Math.hypot(...r.position)+Math.hypot(...r.velocity)*t+.5*motor.maximumAcceleration*t*t);}
  if(horizon>=motor.endAge){const r=rows.at(-1),F=drag>1e-8?-Math.expm1(-drag*(horizon-motor.endAge))/drag:horizon-motor.endAge;bound=Math.max(bound,Math.hypot(...r.position)+Math.hypot(...r.velocity)*F);}return bound+GAP;
}
