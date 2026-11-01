// Camera composition only. No source, physics, display, audio or smoke mutation.
const finite=(v,name)=>{if(!Number.isFinite(v))throw new RangeError(name+' must be finite');return v;};
const nonnegative=(v,name)=>{finite(v,name);if(v<0)throw new RangeError(name+' must be nonnegative');return v;};
const vector=(v,name)=>{if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite))throw new TypeError(name+' requires three finite metres');return v.slice();};
const bounds=(b,name)=>{if(!b||!b.min||!b.max)throw new TypeError(name+' requires min and max');const min=vector(b.min,name+'.min'),max=vector(b.max,name+'.max');if(min.some((v,i)=>v>max[i]))throw new RangeError(name+' is empty');return{min,max};};

// Snapshots must be supplied by the native emitter at exact current/held-wind
// forecast times. Sampling a window is not a continuous trajectory guarantee.
export function collectLuminousFramingPoints(frames,{time,lookAheadSeconds=1,startupUntilTime=time,paddingMetres=1,islandBounds={min:[-39,0,-27],max:[44,18,30]},minimumRelativeWeight=0,maximumExcludedFluxFraction=0}={}){
  finite(time,'time');nonnegative(lookAheadSeconds,'lookAheadSeconds');finite(startupUntilTime,'startupUntilTime');nonnegative(paddingMetres,'paddingMetres');
  for(const [value,name]of [[minimumRelativeWeight,'minimumRelativeWeight'],[maximumExcludedFluxFraction,'maximumExcludedFluxFraction']])if(!Number.isFinite(value)||value<0||value>=1)throw new RangeError(name+' requires [0,1)');
  const island=bounds(islandBounds,'islandBounds');if(!Array.isArray(frames)||!frames.length)throw new TypeError('Native source snapshots are required');
  const end=Math.max(time+lookAheadSeconds,startupUntilTime),selected=[],frameRows=[];let previous=-Infinity,currentFound=false;
  for(const frame of frames){finite(frame?.time,'frame.time');if(frame.time<=previous)throw new RangeError('Frame times must be strictly increasing');previous=frame.time;if(!Array.isArray(frame.sources))throw new TypeError('Frame sources must be an array');
    // Validate even out-of-window snapshots, so malformed future data is never
    // silently accepted as a valid forecast contract.
    const sources=frame.sources.map((s,index)=>{const position=vector(s.position,'source.position'),stretch=vector(s.stretch??[0,0,0],'source.stretch'),colour=vector(s.colour,'source.colour');if(colour.some(v=>v<0))throw new RangeError('Source RGB must be nonnegative');const intensity=nonnegative(s.intensity,'source.intensity'),radius=nonnegative(s.radius??0,'source.radius'),weight=intensity*Math.max(...colour);finite(weight,'source weight');return{position,stretch,radius,weight,index,eventId:s.eventId??null};});
    if(frame.time<time-1e-9||frame.time>end+1e-9)continue;if(Math.abs(frame.time-time)<=1e-9)currentFound=true;
    const total=sources.reduce((sum,s)=>sum+s.weight,0);finite(total,'total reference weight');const maximum=sources.reduce((m,s)=>Math.max(m,s.weight),0),threshold=maximum*minimumRelativeWeight;
    const included=sources.filter(s=>s.weight>0&&s.weight>=threshold),excluded=sources.filter(s=>s.weight>0&&s.weight<threshold).sort((a,b)=>b.weight-a.weight||a.index-b.index);let excludedWeight=excluded.reduce((sum,s)=>sum+s.weight,0);
    // A requested threshold cannot discard more reference RGB-weighted flux
    // than the caller's explicit budget. Default threshold/budget are both0.
    while(excluded.length&&excludedWeight>total*maximumExcludedFluxFraction){const s=excluded.shift();included.push(s);excludedWeight-=s.weight;}
    included.sort((a,b)=>a.index-b.index);for(const s of included){const radius=Math.max(paddingMetres,s.radius);selected.push({position:s.position.slice(),radius,time:frame.time,kind:'source',sourceIndex:s.index,eventId:s.eventId});if(s.stretch.some(v=>v!==0))for(const sign of [-.5,.5])selected.push({position:s.position.map((v,i)=>v+sign*s.stretch[i]),radius,time:frame.time,kind:'tail-endpoint',sourceIndex:s.index,eventId:s.eventId});}
    frameRows.push({time:frame.time,sources:sources.length,positiveSources:sources.filter(s=>s.weight>0).length,included:included.length,excluded:excluded.length,totalReferenceRGBWeight:total,excludedReferenceRGBWeight:Math.max(0,excludedWeight),excludedFraction:total?Math.max(0,excludedWeight)/total:0});
  }
  if(!currentFound)throw new RangeError('An exact current native snapshot is required');
  const points=[];for(let i=0;i<8;i++)points.push({position:[i&1?island.max[0]:island.min[0],i&2?island.max[1]:island.min[1],i&4?island.max[2]:island.min[2]],radius:0,kind:'island'});points.push(...selected);
  let maximumSampleGapSeconds=0;for(let i=1;i<frameRows.length;i++)maximumSampleGapSeconds=Math.max(maximumSampleGapSeconds,frameRows[i].time-frameRows[i-1].time);
  return{points,diagnostics:{time,windowEnd:end,lookAheadSeconds,startupUntilTime,paddingMetres,frames:frameRows,maximumSampleGapSeconds,pointCount:points.length,maximumExcludedFraction:Math.max(0,...frameRows.map(f=>f.excludedFraction)),limits:['Reference RGB-weighted emission, not camera-space visibility or a measured detection threshold.','Default keeps every positive source in every supplied in-window frame.','Current/forecast snapshots and spatial padding do not certify unsampled trajectory extrema or future changing wind.','Smoke/cloud extent is not a luminous emitter and must be framed separately when desired.']}};
}

// A capsule endpoint plus a small world-space sphere is fitted directly. This
// avoids fabricating the empty corner combinations of a world-axis AABB.
export function fitLuminousPoints(THREE,camera,points,{eyeHeight=8,margin=.90,bearing=null,targetXZ=[-1.5,-1],reflectionPlaneY=0,maximumDistance=100000}={}){
  finite(eyeHeight,'eyeHeight');finite(reflectionPlaneY,'reflectionPlaneY');if(!Number.isFinite(margin)||margin<=0||margin>=1)throw new RangeError('margin requires (0,1)');if(!Number.isFinite(maximumDistance)||maximumDistance<=.5)throw new RangeError('maximumDistance must exceed0.5');
  if(!camera?.isPerspectiveCamera||camera.coordinateSystem!==THREE.WebGLCoordinateSystem)throw new TypeError('A WebGL perspective camera is required');if(!Array.isArray(targetXZ)||targetXZ.length!==2||!targetXZ.every(Number.isFinite))throw new TypeError('targetXZ requires two finite metres');if(!Array.isArray(points)||!points.length)throw new TypeError('Framing points are required');
  const samples=[];for(const point of points){const position=vector(point.position,'point.position'),radius=nonnegative(point.radius??0,'point.radius');samples.push({position:new THREE.Vector3(...position),radius});const reflected=position.slice();reflected[1]=2*reflectionPlaneY-position[1];if(!reflected.every(Number.isFinite))throw new RangeError('Reflected coordinate overflow');samples.push({position:new THREE.Vector3(...reflected),radius});}
  const target=new THREE.Vector3(targetXZ[0],reflectionPlaneY,targetXZ[1]),axis=bearing?new THREE.Vector3(...vector(Array.isArray(bearing)?bearing:[bearing.x,bearing.y,bearing.z],'bearing')):camera.position.clone().sub(target);axis.y=0;if(axis.lengthSq()<1e-12)axis.set(-1,0,-1);axis.normalize();
  const probe=camera.clone(),position=new THREE.Vector3(),projection=probe.projectionMatrix.clone(),transform=new THREE.Matrix4(),frustum=new THREE.Frustum();
  // Premultiply clip x/y by1/margin, preserving off-axis view offsets and near/far.
  for(const row of [0,1])for(let column=0;column<4;column++)projection.elements[column*4+row]/=margin;
  let scans=0;
  const fits=(distance,checkFar=false)=>{scans++;position.copy(target).addScaledVector(axis,distance);position.y=eyeHeight;probe.position.copy(position);probe.lookAt(target);probe.updateMatrixWorld();transform.multiplyMatrices(projection,probe.matrixWorldInverse);frustum.setFromProjectionMatrix(transform,THREE.WebGLCoordinateSystem);return samples.every(s=>frustum.planes.every((p,i)=>(i===4&&!checkFar)||p.distanceToPoint(s.position)>=s.radius));};
  let radiusBound=20;for(const s of samples)radiusBound=Math.max(radiusBound,s.position.distanceTo(target)+s.radius);
  let lo=.5,hi=Math.min(maximumDistance,radiusBound);while(!fits(hi)&&hi<maximumDistance)hi=Math.min(maximumDistance,hi*1.5);
  if(!fits(hi))throw new RangeError('Luminous points cannot be enclosed within the distance budget');
  for(let i=0;i<36;i++){const mid=(lo+hi)*.5;if(fits(mid))hi=mid;else lo=mid;}
  if(!fits(hi,true))throw new RangeError('Luminous points cannot fit inside the far clipping plane');let distance=hi*1.002;if(distance>maximumDistance||!fits(distance,true)){distance=hi;fits(distance,true);}
  let minimumClearance=Infinity;for(const s of samples)for(const plane of frustum.planes)minimumClearance=Math.min(minimumClearance,plane.distanceToPoint(s.position)-s.radius);
  return{position:position.clone(),target,distance:position.distanceTo(target),horizontalDistance:distance,margin,diagnostics:{pointCount:points.length,sourceAndVirtualCount:samples.length,scans,reflectionPlaneY,targetXZ:targetXZ.slice(),minimumFrustumClearanceMetres:minimumClearance,limits:['All supplied padded source/tail/island points and virtual mirrors are enclosed.','Not unsampled future trajectories, an arbitrary wave-distorted glitter footprint, smoke volume or photographic quality.']}};
}

// Radius-only governor after the host establishes an initial safe composition.
// Required current coverage wins over smoothness if an unforecast source appears.
export function createFramingDistanceEnvelope({outwardSeconds=.8,inwardSeconds=3,inwardMetresPerSecond=25,shrinkHoldSeconds=1.2,hysteresisFraction=.03}={}){
  for(const [v,n]of [[outwardSeconds,'outwardSeconds'],[inwardSeconds,'inwardSeconds'],[inwardMetresPerSecond,'inwardMetresPerSecond']])if(!Number.isFinite(v)||v<=0)throw new RangeError(n+' must be positive');nonnegative(shrinkHoldSeconds,'shrinkHoldSeconds');if(!Number.isFinite(hysteresisFraction)||hysteresisFraction<0||hysteresisFraction>=1)throw new RangeError('hysteresisFraction requires [0,1)');
  let active=false,distance=0,belowSeconds=0,elapsed=0,coverageCorrections=0;
  const api={start(initialDistance){if(!Number.isFinite(initialDistance)||initialDistance<=0)throw new RangeError('Initial distance must be positive');distance=initialDistance;belowSeconds=elapsed=coverageCorrections=0;active=true;return api.state;},cancel(){active=false;return api.state;},update({dt,requiredDistance,forecastDistance=requiredDistance,paused=false}={}){nonnegative(dt,'dt');if(!Number.isFinite(requiredDistance)||requiredDistance<=0||!Number.isFinite(forecastDistance)||forecastDistance<requiredDistance)throw new RangeError('Finite forecast distance must cover the current required distance');if(!Number.isFinite(elapsed+dt))throw new RangeError('Framing clock overflow');if(!active)return null;if(paused||dt===0)return api.state;
      const target=forecastDistance;if(requiredDistance>distance){distance=requiredDistance;coverageCorrections++;belowSeconds=0;}
      if(target>distance){distance=target+(distance-target)*Math.exp(-dt/outwardSeconds);belowSeconds=0;}
      else if(target<distance*(1-hysteresisFraction)){const hold=Math.max(0,shrinkHoldSeconds-belowSeconds),moveTime=Math.max(0,dt-hold);belowSeconds+=dt;if(moveTime>0){let gap=distance-target,remaining=moveTime;const threshold=inwardMetresPerSecond*inwardSeconds;if(gap>threshold){const linearTime=Math.min(remaining,(gap-threshold)/inwardMetresPerSecond);gap-=inwardMetresPerSecond*linearTime;remaining-=linearTime;}distance=Math.max(target/(1-hysteresisFraction),target+gap*Math.exp(-remaining/inwardSeconds));}}
      else belowSeconds=0;
      distance=Math.max(distance,requiredDistance);elapsed+=dt;return api.state;},get state(){return{active,horizontalDistance:distance,elapsedSeconds:elapsed,belowTargetSeconds:belowSeconds,coverageCorrections,limits:['Host must establish a safe startup view, keep bearing/target stable and check its final actual projection.','Current coverage correction can jump if a new source was not forecast; this is reported, not hidden clipping.','Only supplied physical dt advances the governor; cancellation remains inactive until an explicit start.']};}};return api;
}
