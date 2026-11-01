// Deterministic metre-scale preset flight. The host owns the wall clock, input,
// OrbitControls and terrain/fixture collision policy; no renderer is created.
const TAU=Math.PI*2,HALF=Math.PI/2,MAX_EASE_SPEED=1.875;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,w)=>a+(b-a)*w;
const norm=v=>Math.hypot(...v);
const copyPose=p=>({position:p.position.slice(),target:p.target.slice()});
const finite=(v,name,min=0)=>{if(!Number.isFinite(v)||v<min)throw new RangeError(`${name} must be finite and at least ${min}`);return v;};
const vector=(v,name)=>{const a=Array.isArray(v)||ArrayBuffer.isView(v)?Array.from(v):v&&[v.x,v.y,v.z];if(!a||a.length!==3||!a.every(Number.isFinite))throw new TypeError(`${name} requires three finite metres`);return a;};
const freezePose=p=>Object.freeze({position:Object.freeze(p.position.slice()),target:Object.freeze(p.target.slice())});
const smooth=w=>w*w*w*(10+w*(-15+6*w));
const angularDelta=(from,to,preferred=1)=>{
  let d=((to-from+Math.PI)%TAU+TAU)%TAU-Math.PI;
  // A stable side at almost-opposite views prevents tiny coordinate roundoff
  // from choosing an entirely different side of the island. At most1deg extra.
  if(Math.abs(Math.abs(d)-Math.PI)<Math.PI/180&&Math.sign(d)!==preferred)d+=preferred*TAU;
  return d;
};
const look=(pose,fallbackYaw)=>{
  const d=pose.target.map((v,i)=>v-pose.position[i]),distance=norm(d);
  if(!(distance>=.75))throw new RangeError('Camera and target must be separated by at least0.75m');
  const horizontal=Math.hypot(d[0],d[2]);
  return{yaw:horizontal>1e-10?Math.atan2(d[0],-d[2]):fallbackYaw,pitch:Math.atan2(d[1],horizontal),distance};
};

/**
 * Source/destination inputs are snapshotted. sample() accepts elapsed seconds,
 * is independent of call order/frame rate, and returns new arrays each call.
 */
export function planCameraTransition({from,to,centre=[-1.5,0,-1],terrainHeight=null,clearanceMetres=.5,seaClearanceMetres=.42,minDurationSeconds=1.8,maxAngularSpeedRadiansPerSecond=.55,maxSpeedMetresPerSecond=45,arcLiftMetres=null,turnDirection=1,reducedMotion=false,minPitchRadians=-HALF+.06,maxPitchRadians=HALF-.03}={}){
  if(!from||!to)throw new TypeError('Camera transition requires from/to poses');
  const source={position:vector(from.position,'from.position'),target:vector(from.target,'from.target')},destination={position:vector(to.position,'to.position'),target:vector(to.target,'to.target')},anchor=vector(centre,'centre');
  if(terrainHeight!==null&&typeof terrainHeight!=='function')throw new TypeError('terrainHeight must be a function or null');
  finite(clearanceMetres,'clearanceMetres');finite(seaClearanceMetres,'seaClearanceMetres');finite(minDurationSeconds,'minDurationSeconds');
  finite(maxAngularSpeedRadiansPerSecond,'maxAngularSpeedRadiansPerSecond',1e-6);finite(maxSpeedMetresPerSecond,'maxSpeedMetresPerSecond',1e-6);
  if(arcLiftMetres!==null)finite(arcLiftMetres,'arcLiftMetres');
  if(turnDirection!==1&&turnDirection!==-1)throw new RangeError('turnDirection must be+1 or-1');
  if(typeof reducedMotion!=='boolean')throw new TypeError('reducedMotion must be boolean');
  if(!Number.isFinite(minPitchRadians)||!Number.isFinite(maxPitchRadians)||minPitchRadians<=-HALF||maxPitchRadians>=HALF||minPitchRadians>=maxPitchRadians)throw new RangeError('Pitch limits must be ordered strictly inside vertical poles');
  const floorAt=(x,z)=>{if(!terrainHeight)return seaClearanceMetres;const h=terrainHeight(x,z);if(!Number.isFinite(h))throw new RangeError('terrainHeight must return finite metres');return Math.max(seaClearanceMetres,h+clearanceMetres);};
  // Reject an invalid look before terrain safety changes the eye; otherwise a
  // coincident target could accidentally become valid only because it moved.
  look(source,0);look(destination,0);
  const adjustments=[];
  for(const[name,pose]of [['from',source],['to',destination]]){const floor=floorAt(pose.position[0],pose.position[2]);if(pose.position[1]<floor){adjustments.push({endpoint:name,requestedEyeY:pose.position[1],safeEyeY:floor});pose.position[1]=floor;}}
  const radial=p=>Math.hypot(p[0]-anchor[0],p[2]-anchor[2]),r0=radial(source.position),r1=radial(destination.position),rMax=Math.max(r0,r1);
  let angle0=r0>1e-9?Math.atan2(source.position[0]-anchor[0],-(source.position[2]-anchor[2])):r1>1e-9?Math.atan2(destination.position[0]-anchor[0],-(destination.position[2]-anchor[2])):0;
  const angle1=r1>1e-9?Math.atan2(destination.position[0]-anchor[0],-(destination.position[2]-anchor[2])):angle0,angleDelta=angularDelta(angle0,angle1,turnDirection),side=Math.abs(angleDelta)>1e-9?Math.sign(angleDelta):turnDirection;
  for(const[name,pose,fallback]of [['from',source,angle0+Math.PI],['to',destination,angle1+Math.PI]]){const l=look(pose,fallback),pitch=clamp(l.pitch,minPitchRadians,maxPitchRadians);if(pitch!==l.pitch){const cp=Math.cos(pitch);pose.target=[pose.position[0]+Math.sin(l.yaw)*cp*l.distance,pose.position[1]+Math.sin(pitch)*l.distance,pose.position[2]-Math.cos(l.yaw)*cp*l.distance];adjustments.push({endpoint:name,requestedPitchRadians:l.pitch,safePitchRadians:pitch});}}
  const a=look(source,angle0+Math.PI),b=look(destination,angle1+Math.PI),yawDelta=angularDelta(a.yaw,b.yaw,side),pitchDelta=b.pitch-a.pitch,dr=r1-r0,dy=destination.position[1]-source.position[1];
  const horizontalDerivativeBound=Math.hypot(dr,rMax*angleDelta);
  let lift=arcLiftMetres??Math.min(8,horizontalDerivativeBound*.025)*Math.min(1,Math.abs(angleDelta)/.5);
  const pathAt=(w,archLift)=>{const angle=angle0+angleDelta*w,r=mix(r0,r1,w);return[anchor[0]+Math.sin(angle)*r,mix(source.position[1],destination.position[1],w)+4*w*(1-w)*archLift,anchor[2]-Math.cos(angle)*r];};
  // One small plan-time terrain survey, no per-frame route search. The final
  // guard remains exact at the sampled eye; no promise of tree/prop collision.
  for(let i=1;i<257;i++){const w=i/257,p=pathAt(w,0),arch=4*w*(1-w);const needed=(floorAt(p[0],p[2])-p[1])/arch;if(needed>0)lift=Math.max(lift,needed+.03);}
  lift=Math.max(0,lift);
  const plannedDerivativeBound=Math.hypot(horizontalDerivativeBound,Math.abs(dy)+4*lift),lookAngleDerivativeBound=Math.hypot(yawDelta,pitchDelta);
  const naturalDuration=Math.max(minDurationSeconds,MAX_EASE_SPEED*plannedDerivativeBound/maxSpeedMetresPerSecond,MAX_EASE_SPEED*lookAngleDerivativeBound/maxAngularSpeedRadiansPerSecond);
  const samePose=source.position.every((v,i)=>v===destination.position[i])&&source.target.every((v,i)=>v===destination.target[i]);
  const durationSeconds=reducedMotion||samePose?0:naturalDuration;
  const diagnostics=Object.freeze({model:'polar-arc-with-independent-unwrapped-look',durationSeconds,reducedMotion,stationary:samePose,orbitAngleRadians:angleDelta,lookYawRadians:yawDelta,lookPitchRadians:pitchDelta,arcLiftMetres:lift,minimumHorizontalRadiusMetres:Math.min(r0,r1),maximumAngularSpeedRadiansPerSecond:durationSeconds?MAX_EASE_SPEED*lookAngleDerivativeBound/durationSeconds:0,plannedMaximumTranslationMetresPerSecond:durationSeconds?MAX_EASE_SPEED*plannedDerivativeBound/durationSeconds:0,requiredMaxDistance:Math.max(a.distance,b.distance)*1.001,requiredMaxTargetRadius:(norm(anchor)+rMax+Math.max(Math.abs(source.position[1]-anchor[1]),Math.abs(destination.position[1]-anchor[1]))+lift+Math.max(a.distance,b.distance))*1.001,adjustments:Object.freeze(adjustments.map(Object.freeze)),limits:Object.freeze(['The translation bound applies to the planned smooth curve; an exact terrain safety correction can add velocity when terrain changes between survey samples.','No tree/fixture collision, occlusion or motion-sickness guarantee. Terrain and sea clearance use the host metre-scale function.','Reduced motion cuts to the final safe pose instead of a fast moving sweep.','The host must cancel other camera writers, expand OrbitControls limits before the first sample and preserve manual takeover.'])});
  const first=freezePose(source),last=freezePose(destination);
  return Object.freeze({durationSeconds,from:first,to:last,diagnostics,sample(elapsedSeconds){
    finite(elapsedSeconds,'elapsedSeconds');
    const progress=durationSeconds?clamp(elapsedSeconds/durationSeconds,0,1):1;
    if(progress===0)return{...copyPose(first),progress,done:false,floorLimited:false};
    if(progress===1)return{...copyPose(last),progress,done:true,floorLimited:false};
    const w=smooth(progress),position=pathAt(w,lift),floor=floorAt(position[0],position[2]),floorLimited=position[1]<floor;
    position[1]=Math.max(position[1],floor);
    const yaw=a.yaw+yawDelta*w,pitch=a.pitch+pitchDelta*w,distance=Math.exp(mix(Math.log(a.distance),Math.log(b.distance),w)),cp=Math.cos(pitch);
    const target=[position[0]+Math.sin(yaw)*cp*distance,position[1]+Math.sin(pitch)*distance,position[2]-Math.cos(yaw)*cp*distance];
    return{position,target,progress,done:false,floorLimited};
  }});
}
