import {fitPerspectiveBounds} from './camera-framing.js';

const finiteVector=(value,name)=>{
  const result=Array.from(value??[]);
  if(result.length!==3||!result.every(Number.isFinite))throw new TypeError(`${name} requires three finite coordinates`);
  return result;
};

// The astronomical direction chooses the shore we observe from. Looking
// exactly along that direction loses the island whenever the sun/moon is
// above, behind or beside it; keep the look target on the island instead.
export function islandCelestialView(direction,{distance=88,eyeHeight=6,centre=[0,5,0],fallbackBearing=[.78,0,-.62]}={}){
  direction=finiteVector(direction,'direction');centre=finiteVector(centre,'centre');
  fallbackBearing=finiteVector(fallbackBearing,'fallbackBearing');
  if(!Number.isFinite(distance)||distance<=0||!Number.isFinite(eyeHeight))throw new RangeError('A positive distance and finite eye height are required');
  let x=direction[0],z=direction[2],length=Math.hypot(x,z);
  if(length<1e-6){x=fallbackBearing[0];z=fallbackBearing[2];length=Math.hypot(x,z);}
  if(length<1e-6)throw new RangeError('Fallback bearing requires a horizontal direction');
  return{position:[centre[0]-distance*x/length,eyeHeight,centre[2]-distance*z/length],target:centre.slice()};
}

// Preserve the authored composition when the island is already in shot. At
// long focal lengths/portrait aspect a fixed skyward preset can clip all land;
// move its aim only as far toward a known sand point as needed. This is a
// perspective-frustum guarantee for that witness, not an occlusion solver.
export function keepIslandInPreset(THREE,camera,view,{witness=[0,1.35,0],margin=.86}={}){
  const position=finiteVector(view.position,'view.position'),target=finiteVector(view.target,'view.target');
  witness=finiteVector(witness,'witness');
  if(!Number.isFinite(margin)||margin<=0||margin>=1)throw new RangeError('margin must be between zero and one');
  const probe=camera.clone(),point=new THREE.Vector3(...witness),aim=new THREE.Vector3();
  probe.position.fromArray(position);
  if(probe.position.distanceToSquared(point)<1e-8)throw new RangeError('Camera cannot coincide with island witness');
  const projects=t=>{
    aim.fromArray(target).lerp(point,t);
    if(aim.distanceToSquared(probe.position)<1e-10)return false;
    probe.lookAt(aim);probe.updateMatrixWorld();
    const p=point.clone().project(probe);
    return p.z>=-1&&p.z<=1&&Math.abs(p.x)<=margin&&Math.abs(p.y)<=margin;
  };
  if(projects(0))return{position,target,islandFraming:{adjusted:false,aimBlend:0,witness:witness.slice(),margin}};
  if(!projects(1))throw new RangeError('Island is outside near/far clipping distances');
  let lo=0,hi=1;
  // Find the first fitting interval before bisecting: the aim may rotate
  // through a wide direction, so monotonicity is only assumed locally.
  for(let i=1;i<=32;i++)if(projects(i/32)){lo=(i-1)/32;hi=i/32;break;}
  for(let i=0;i<32;i++){const t=(lo+hi)/2;if(projects(t))hi=t;else lo=t;}
  const result=target.map((v,c)=>v+(witness[c]-v)*hi);
  return{position,target:result,islandFraming:{adjusted:true,aimBlend:hi,witness:witness.slice(),margin}};
}

// An aerial shell really is much larger than this island. Fit the selected
// metre-scale forecast and land, without also reserving the complete water
// reflection. The shorter distance is a closer composition, not a smaller
// simulated shell. Align the observer with the authored pattern-plane normal
// derived from launch azimuth; per-event tilt/roll remain real random changes.
export function islandFireworksView(THREE,camera,{azimuth=104,envelope=null,eyeHeight=7,margin=.92,automaticFan=false}={}){
  if(!Number.isFinite(azimuth))throw new RangeError('azimuth must be finite');
  if(typeof automaticFan!=='boolean')throw new TypeError('automaticFan requires a boolean');
  const box=new THREE.Box3(new THREE.Vector3(-39,0,-27),new THREE.Vector3(44,18,30));
  if(envelope){
    const min=finiteVector(envelope.min,'envelope.min'),max=finiteVector(envelope.max,'envelope.max');
    if(min.some((v,c)=>v>max[c]))throw new RangeError('envelope min exceeds max');
    box.expandByPoint(new THREE.Vector3(...min));box.expandByPoint(new THREE.Vector3(...max));
  }else box.expandByPoint(new THREE.Vector3(65,150,10));
  // Signed automatic launch tilts spread in the bearing's vertical plane.
  // Observe its broad side instead of looking end-on along that same plane.
  // Keep the manual arithmetic exactly unchanged when automaticFan is false.
  const angle=(automaticFan?azimuth+90:azimuth)*Math.PI/180,normal=new THREE.Vector3(Math.sin(angle),0,-Math.cos(angle));
  const fit=fitPerspectiveBounds(THREE,camera,box,{eyeHeight,margin,bearing:normal.clone().negate()});
  return{position:fit.position.toArray(),target:fit.target.toArray(),islandFraming:{kind:'island-and-selected-firework',patternNormal:normal.toArray(),sourceBounds:{min:box.min.toArray(),max:box.max.toArray()},distance:fit.distance,margin,includesFullReflection:false}};
}
