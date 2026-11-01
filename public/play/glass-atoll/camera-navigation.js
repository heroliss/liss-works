// Orbit with the left mouse; editor-style fly-look with right drag + keyboard.
export function createCameraNavigation(THREE,{camera,controls,canvas,onActivity=()=>{},speed=5}){
  const held=new Set(),velocity=new THREE.Vector3(),forward=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),move=new THREE.Vector3();
  const codes=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','KeyR','KeyF','PageUp','PageDown','ShiftLeft','ShiftRight']);
  let dragging=false,lastX=0,lastY=0,moved=false,disposed=false,pendingYaw=0,pendingPitch=0,pendingTravel=0,pointerId=null;
  const listeners=[];
  const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));};
  function flushOrbit(){
    const p=camera.position.clone(),q=camera.quaternion.clone(),t=controls.target.clone(),damping=controls.enableDamping;
    controls.enableDamping=false;controls.update();camera.position.copy(p);camera.quaternion.copy(q);controls.target.copy(t);controls.enableDamping=damping;
  }
  function turn(yaw,pitch){
    const distance=Math.max(.75,camera.position.distanceTo(controls.target));camera.getWorldDirection(forward);
    const theta=Math.atan2(forward.x,forward.z)+yaw,phi=Math.max(-1.53,Math.min(1.53,Math.asin(Math.max(-1,Math.min(1,forward.y)))+pitch));
    forward.set(Math.sin(theta)*Math.cos(phi),Math.sin(phi),Math.cos(theta)*Math.cos(phi));
    controls.target.copy(camera.position).addScaledVector(forward,distance);camera.lookAt(controls.target);
  }
  const editable=target=>/^(INPUT|SELECT|TEXTAREA)$/.test(target?.tagName)||target?.isContentEditable;
  listen(document,'keydown',event=>{
    if(disposed||editable(event.target)||event.ctrlKey||event.metaKey||event.altKey||!codes.has(event.code))return;
    event.preventDefault();if(!held.size){flushOrbit();onActivity();}held.add(event.code);
  });
  listen(document,'keyup',event=>held.delete(event.code));
  const clear=()=>{held.clear();velocity.set(0,0,0);pendingYaw=pendingPitch=pendingTravel=0;dragging=false;if(pointerId!==null){try{if(canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);}catch{}pointerId=null;}};
  listen(window,'blur',clear);listen(document,'visibilitychange',()=>{if(document.hidden)clear();});
  listen(canvas,'contextmenu',event=>event.preventDefault());
  listen(canvas,'pointerdown',event=>{
    if(event.button!==2)return;event.preventDefault();event.stopImmediatePropagation();canvas.focus({preventScroll:true});
    flushOrbit();onActivity();dragging=true;pendingTravel=0;lastX=event.clientX;lastY=event.clientY;pointerId=event.pointerId;canvas.setPointerCapture(event.pointerId);
  },true);
  listen(canvas,'pointermove',event=>{
    if(!dragging)return;event.preventDefault();event.stopImmediatePropagation();
    pendingYaw-=(event.clientX-lastX)*.003;pendingPitch-=(event.clientY-lastY)*.003;lastX=event.clientX;lastY=event.clientY;
  },true);
  listen(canvas,'pointerup',event=>{if(!dragging||event.button!==2)return;event.preventDefault();event.stopImmediatePropagation();dragging=false;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);pointerId=null;},true);
  listen(canvas,'pointercancel',clear,true);
  listen(canvas,'wheel',event=>{
    if(event.ctrlKey||event.metaKey)return;
    event.preventDefault();event.stopImmediatePropagation();flushOrbit();onActivity();
    const delta=Math.max(-180,Math.min(180,event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?120:1)));
    if(dragging)speed=Math.max(.3,Math.min(40,speed*Math.exp(-delta*.0015)));
    else pendingTravel=Math.max(-18,Math.min(18,pendingTravel-delta*.012));
  },{capture:true,passive:false});
  return {
    update(delta){
      const dt=Math.max(0,Math.min(.06,delta));
      // Smooth native input at render cadence with a short 35 ms response.
      const response=1-Math.exp(-dt/.035),dy=pendingYaw*response,dp=pendingPitch*response;
      if(Math.abs(dy)+Math.abs(dp)>1e-9){turn(dy,dp);pendingYaw-=dy;pendingPitch-=dp;moved=true;}
      const travel=pendingTravel*(1-Math.exp(-dt/.085));
      if(Math.abs(travel)>1e-6){camera.getWorldDirection(forward);camera.position.addScaledVector(forward,travel);controls.target.addScaledVector(forward,travel);pendingTravel-=travel;moved=true;}
      const axis=(positive,negative)=>positive.some(k=>held.has(k))-negative.some(k=>held.has(k));
      const f=axis(['KeyW','ArrowUp'],['KeyS','ArrowDown']),s=axis(['KeyD','ArrowRight'],['KeyA','ArrowLeft']),v=axis(['PageUp'],['PageDown']);
      const yaw=axis(['KeyQ'],['KeyE']),pitch=axis(['KeyR'],['KeyF']);
      if(yaw||pitch){turn(yaw*dt*.8,pitch*dt*.65);moved=true;}
      camera.getWorldDirection(forward);right.crossVectors(forward,up).normalize();
      move.copy(forward).multiplyScalar(f).addScaledVector(right,s).addScaledVector(up,v);
      if(move.lengthSq()>1)move.normalize();const boost=held.has('ShiftLeft')||held.has('ShiftRight')?4:1;move.multiplyScalar(speed*boost);
      velocity.lerp(move,1-Math.exp(-dt*(move.lengthSq()>0?12:18)));
      if(velocity.lengthSq()>1e-7){camera.position.addScaledVector(velocity,dt);controls.target.addScaledVector(velocity,dt);moved=true;}
      const changed=moved;moved=false;return changed;
    },
    stop(){clear();flushOrbit();},
    restorePivot(){this.setPivot(new THREE.Vector3(0,2.5,0));},
    setPivot(point){clear();flushOrbit();controls.maxDistance=Math.max(controls.maxDistance,camera.position.distanceTo(point)*1.001);controls.maxTargetRadius=Math.max(controls.maxTargetRadius,point.length()*1.001);controls.target.copy(point);camera.lookAt(point);onActivity();return true;},
    configure(value){if(Number.isFinite(value.speed))speed=Math.max(.3,Math.min(40,value.speed));},
    get state(){return {speedMetresPerSecond:speed,rightDrag:dragging,keys:[...held],velocity:velocity.toArray(),pendingRotation:[pendingYaw,pendingPitch],pendingTravel,pivot:controls.target.toArray(),wheel:'wheel moves camera and centre together without changing focal length; RMB+wheel changes fly speed',bindings:'WASD/arrows translate, QE yaw, RF pitch, PageUp/PageDown height, Shift x4, smooth right drag fly-look, left drag orbit, Home reset'};},
    dispose(){disposed=true;clear();listeners.forEach(remove=>remove());}
  };
}
