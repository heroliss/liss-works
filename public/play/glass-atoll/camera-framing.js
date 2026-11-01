// Fits the actual perspective projection instead of the box's diagonal sphere.
// The observer retains a low eye height; every forecast corner stays inside.
export function fitPerspectiveBounds(THREE,camera,box,{eyeHeight=8,margin=.90,bearing=null,reflectionPlaneY}={}){
  if(reflectionPlaneY!==undefined)return fitReflectedPerspectiveBounds(THREE,camera,box,{eyeHeight,margin,bearing,reflectionPlaneY});
  const center=box.getCenter(new THREE.Vector3()),axis=bearing?.clone()||camera.position.clone().sub(center);axis.y=0;if(axis.lengthSq()<1e-8)axis.set(-1,0,-1);axis.normalize();
  const probe=camera.clone(),p=new THREE.Vector3(),position=new THREE.Vector3(),corners=[];
  for(let i=0;i<8;i++)corners.push(new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z));
  const fits=distance=>{position.copy(center).addScaledVector(axis,distance);position.y=eyeHeight;probe.position.copy(position);probe.lookAt(center);probe.updateMatrixWorld();return corners.every(c=>{p.copy(c).project(probe);return p.z>=-1&&p.z<=1&&Math.abs(p.x)<=margin&&Math.abs(p.y)<=margin;});};
  let lo=.5,hi=Math.max(20,box.getSize(new THREE.Vector3()).length());while(!fits(hi)&&hi<100000)hi*=1.5;
  for(let i=0;i<34;i++){const mid=(lo+hi)*.5;if(fits(mid))hi=mid;else lo=mid;}fits(hi*1.002);
  return{position:position.clone(),target:center,distance:position.distanceTo(center),horizontalDistance:hi*1.002,margin};
}

// A planar water reflection is the perspective projection of a virtual source
// below the plane. Include both sets of corners without changing source bounds.
function fitReflectedPerspectiveBounds(THREE,camera,box,{eyeHeight,margin,bearing,reflectionPlaneY}){
  if(!Number.isFinite(reflectionPlaneY))throw new RangeError('reflectionPlaneY must be finite');
  const reflectedMin=2*reflectionPlaneY-box.max.y,reflectedMax=2*reflectionPlaneY-box.min.y;
  if(!Number.isFinite(reflectedMin)||!Number.isFinite(reflectedMax))throw new RangeError('Reflected bounds exceed finite coordinates');
  const bounds=box.clone();bounds.min.y=Math.min(bounds.min.y,reflectedMin);bounds.max.y=Math.max(bounds.max.y,reflectedMax);
  const center=bounds.getCenter(new THREE.Vector3());center.y=reflectionPlaneY;
  const axis=bearing?.clone()||camera.position.clone().sub(center);axis.y=0;if(axis.lengthSq()<1e-8)axis.set(-1,0,-1);axis.normalize();
  const probe=camera.clone(),p=new THREE.Vector3(),position=new THREE.Vector3(),corners=[];
  for(let i=0;i<8;i++){const corner=new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z);corners.push(corner,corner.clone().setY(2*reflectionPlaneY-corner.y));}
  // Far clipping is not monotone with increasing search distance: the initial
  // diagonal can already be beyond far while a closer angular fit is valid.
  const fits=(distance,checkFar=false)=>{position.copy(center).addScaledVector(axis,distance);position.y=eyeHeight;probe.position.copy(position);probe.lookAt(center);probe.updateMatrixWorld();return corners.every(c=>{p.copy(c).applyMatrix4(probe.matrixWorldInverse);const depth=-p.z;p.applyMatrix4(probe.projectionMatrix);return depth>=probe.near&&p.z>=-1&&(!checkFar||(depth<=probe.far&&p.z<=1))&&Math.abs(p.x)<=margin&&Math.abs(p.y)<=margin;});};
  let lo=.5,hi=Math.max(20,bounds.getSize(new THREE.Vector3()).length());while(!fits(hi)&&hi<100000)hi*=1.5;
  if(!fits(hi))throw new RangeError('Source and reflected bounds do not fit within the camera clipping volume');
  for(let i=0;i<34;i++){const mid=(lo+hi)*.5;if(fits(mid))hi=mid;else lo=mid;}
  if(!fits(hi,true))throw new RangeError('Source and reflected bounds do not fit within the camera clipping volume');
  let horizontalDistance=hi*1.002;if(!fits(horizontalDistance,true)){horizontalDistance=hi;fits(horizontalDistance,true);}
  return{position:position.clone(),target:center,distance:position.distanceTo(center),horizontalDistance,margin,reflectionFraming:{planeY:reflectionPlaneY,cornerCount:16,sourceBounds:{min:box.min.toArray(),max:box.max.toArray()},fittedBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}}};
}
