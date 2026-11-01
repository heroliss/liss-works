// Optical quadrature nodes of a continuously replenished tail. A node keeps
// its lag, not its material identity: actual detached bodies remain in physics.
import {sampleBody} from './fireworks-physics.js';
import {bodyMotorAcceleration} from './fireworks-physics.js';
const known=new WeakSet(),G=9.81,DRAG=1.35;
const finite=(x,name)=>{if(typeof x!=='number'||!Number.isFinite(x))throw new RangeError(name+' must be finite');return x;};
export function createTailReleaseFieldNode(body,lagSeconds){
  if(!body||typeof body!=='object')throw new TypeError('Tail field requires a source body');
  finite(body.birth,'Body birth');finite(lagSeconds,'Tail lag');
  if(lagSeconds<0||lagSeconds>.88)throw new RangeError('Tail lag requires0...88 seconds');
  const birth=body.birth+lagSeconds;if(!Number.isFinite(birth))throw new RangeError('Tail field birth overflow');
  const node=Object.freeze({schema:'glass-atoll.tail-release-field-node.v1',body,sourceBirth:body.birth,lagSeconds,birth,emberDrag:DRAG,emberGravity:G,
    decay:Math.exp(-DRAG*lagSeconds),travel:-Math.expm1(-DRAG*lagSeconds)/DRAG});
  known.add(node);return node;
}
function windAt(timeline,time){
  if(!timeline.length)return[0,0,0];let lo=0,hi=timeline.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(timeline[mid].time<=time)lo=mid;else hi=mid-1;}
  return timeline[lo].wind;
}
export function sampleTailReleaseFieldNode(node,time,timeline){
  if(!known.has(node))throw new TypeError('Tail field node must be created by its factory');finite(time,'Tail field sample time');
  if(!Array.isArray(timeline))throw new TypeError('Tail field requires a wind timeline');
  if(node.sourceBirth!==node.body.birth)throw new RangeError('Source birth changed; rebuild its optical field node');
  if(time<node.birth)return null;
  const {body,lagSeconds,decay,travel}=node,releaseTime=Math.max(body.birth,time-lagSeconds),source=sampleBody(body,releaseTime,timeline);
  if(!source)throw new RangeError('Tail release clock predates its source body');
  const ember={birth:releaseTime,position:source.position,velocity:source.velocity.map(v=>v*.25),drag:DRAG,gravity:G},state=sampleBody(ember,time,timeline),wind=windAt(timeline,releaseTime),k=body.drag??.2,gravity=body.gravity??G;
  finite(k,'Source drag');finite(gravity,'Source gravity');
  // Derivative of q(t)=ember(body(t-lag), lag), NOT the velocity of the
  // individual ember whose release time is held fixed. At held-wind knots use
  // the right-hand source acceleration, matching timeline lookup semantics.
  const motorAcceleration=body.displayMotor?bodyMotorAcceleration(body,releaseTime):source.motorAcceleration;
  const velocity=source.velocity.map((v,c)=>{
    const passiveAcceleration=(k<1e-8?0:k*(wind[c]-v))-(c===1?gravity:0),acceleration=motorAcceleration?passiveAcceleration+motorAcceleration[c]:passiveAcceleration;
    const windVelocity=state.velocity[c]-.25*v*decay+(c===1?G*travel:0);
    return v+.25*acceleration*travel+windVelocity-(1-decay)*wind[c];
  });
  return{position:state.position,velocity,releaseTime,lagSeconds,
    model:'fixed-lag Eulerian radiance-field node; original detached physical body is not overwritten',
    limits:body.displayMotor?'linear-drag/gravity plus finite authored display-motor acceleration; held-wind/force one-sided derivative; no ground termination interval':body.thrustProfile?'linear-drag/gravity plus admitted prescribed motor acceleration; held-wind/force one-sided derivative; no ground termination interval':'linear-drag/gravity source; held-wind one-sided derivative; no motor acceleration or ground termination interval'};
}
