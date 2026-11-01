// A metric first-person pebble; exact linearized drag and swept collision.
export const STONE_DENSITY=2600,STONE_GRAVITY=9.81,STONE_DRAG=.12;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function stoneLaunchSpeed(charge=0){const x=clamp(charge,0,1);return 5+17*(x*x*(3-2*x));}
export function sampleStonePath(start,velocity,time,drag=STONE_DRAG){
  const t=Math.max(0,time),a=drag>1e-8?-Math.expm1(-drag*t)/drag:t,e=drag>1e-8?Math.exp(-drag*t):1;
  const drop=drag>1e-8?-STONE_GRAVITY*(t-a)/drag:-.5*STONE_GRAVITY*t*t;
  return {position:start.map((v,i)=>v+velocity[i]*a+(i===1?drop:0)),velocity:velocity.map((v,i)=>v*e+(i===1?-STONE_GRAVITY*a:0))};
}
export function findStoneImpact({start,velocity,from=0,to,surfaceHeight=()=>0,terrainHeight=()=>-32,born=0}){
  const sample=age=>{const s=sampleStonePath(start,velocity,age),[x,y,z]=s.position,w=surfaceHeight(x,z,born+age),land=terrainHeight(x,z);return{...s,age,height:Math.max(w,land),kind:land>w?'land':'water',distance:y-Math.max(w,land)};};
  let a=sample(from);if(a.distance<0)return{...a,position:[a.position[0],a.height,a.position[2]]};
  const steps=Math.max(1,Math.ceil((to-from)*120));
  for(let i=1;i<=steps;i++){const b=sample(from+(to-from)*i/steps);if(b.distance<=0){let lo=a.age,hi=b.age;for(let k=0;k<18;k++){const m=(lo+hi)*.5;if(sample(m).distance>0)lo=m;else hi=m;}const hit=sample((lo+hi)*.5);hit.position[1]=hit.height;return hit;}a=b;}
  return null;
}

export const STONE_WATER_DENSITY=1025,STONE_WATER_DRAG_COEFFICIENT=.47,STONE_WATER_STEP=1/240,STONE_WATER_MAX_AGE=90;
export function submergedStoneParameters(diameter=.025,{density=STONE_DENSITY,waterDensity=STONE_WATER_DENSITY,dragCoefficient=STONE_WATER_DRAG_COEFFICIENT}={}){
  if(![diameter,density,waterDensity,dragCoefficient].every(Number.isFinite)||!(diameter>0)||!(density>0)||!(waterDensity>0)||dragCoefficient<0)throw new RangeError('Stone dimensions, densities and drag coefficient must be finite physical values.');
  const volume=Math.PI*diameter**3/6,area=Math.PI*diameter**2/4,mass=density*volume,dragPerMetre=.5*waterDensity*dragCoefficient*area/mass,gravityY=-STONE_GRAVITY*(1-waterDensity/density);
  if(![volume,area,mass,dragPerMetre,gravityY].every(Number.isFinite)||!(mass>0))throw new RangeError('Stone parameters exceed the finite metric range.');
  return{diameter,radius:diameter/2,volumeCubicMetres:volume,areaSquareMetres:area,massKg:mass,waterDensityKgPerCubicMetre:waterDensity,dragCoefficient,dragPerMetre,gravityY,terminalSpeedMetresPerSecond:dragPerMetre>0?Math.sqrt(Math.abs(gravityY)/dragPerMetre):null};
}

// v' = g_eff - k |v|v. A gravity half-kick, exact quadratic-drag drift,
// gravity half-kick is second-order, dissipative and cannot overshoot drag.
// k=.5*rho_water*Cd*A/m has units 1/m, not an arbitrary per-frame damping.
export function stepSubmergedStone(position,velocity,dt,parameters=submergedStoneParameters()){
  if(!Number.isFinite(dt)||dt<0||!position.every(Number.isFinite)||!velocity.every(Number.isFinite))throw new TypeError('Submerged stone state and duration must be finite.');
  const v=velocity.map((x,i)=>x+(i===1?parameters.gravityY*dt*.5:0)),speed=Math.hypot(...v),q=parameters.dragPerMetre*speed*dt,drift=q>0?dt*Math.log1p(q)/q:dt,attenuation=1/(1+q);
  const result={position:position.map((x,i)=>x+v[i]*drift),velocity:v.map((x,i)=>x*attenuation+(i===1?parameters.gravityY*dt*.5:0))};
  if(!result.position.every(Number.isFinite)||!result.velocity.every(Number.isFinite))throw new RangeError('Submerged stone integration exceeded finite coordinates.');
  return result;
}

// Sphere support against a locally planar heightfield. On flat ground its
// centre is exactly terrainHeight+radius; the slope term prevents uphill burial.
export function stoneBedHeight(terrainHeight,x,z,radius=.0125){
  const epsilon=Math.max(.005,radius),h=terrainHeight(x,z),hx0=terrainHeight(x-epsilon,z),hx1=terrainHeight(x+epsilon,z),hz0=terrainHeight(x,z-epsilon),hz1=terrainHeight(x,z+epsilon);
  if(![h,hx0,hx1,hz0,hz1].every(Number.isFinite))throw new TypeError('Stone terrain must return finite heights.');
  const gx=(hx1-hx0)/(2*epsilon),gz=(hz1-hz0)/(2*epsilon);return h+radius*Math.sqrt(1+gx*gx+gz*gz);
}

export function createStoneThrow(THREE,{scene,onImpact=()=>{},surfaceHeight=()=>0,terrainHeight=()=>-32,maxStones=12,maxResting=24}={}){
  const geometry=new THREE.IcosahedronGeometry(.0125,1),material=new THREE.MeshStandardMaterial({color:'#514d45',roughness:.7});
  const stones=[],resting=[],poolLimit=clamp(Math.floor(Number.isFinite(maxStones)?maxStones:12),1,64),restLimit=clamp(Math.floor(Number.isFinite(maxResting)?maxResting:24),0,128);
  const counters={launched:0,waterEntries:0,landImpacts:0,bedContacts:0,expiredAir:0,expiredWater:0,evictedResting:0};let serial=0,lastTime=0,disposed=false;
  function add(start,velocity,time,{diameter=.025,charge=0}={}){
    if(disposed)return{launched:false,reason:'disposed'};
    if(stones.length>=poolLimit)return{launched:false,reason:'too-many-active-stones'};
    if(![...start,...velocity,time,diameter,charge].every(Number.isFinite)||!(diameter>0))return{launched:false,reason:'nonfinite-stone-input'};
    const mesh=new THREE.Mesh(geometry,material);mesh.name='First-person metric pebble';mesh.castShadow=true;mesh.receiveShadow=true;mesh.layers.enable(1);mesh.frustumCulled=false;mesh.scale.setScalar(diameter/.025);mesh.position.fromArray(start);scene.add(mesh);
    const item={id:++serial,start:[...start],velocity:[...velocity],born:time,age:0,diameter,charge,mass:STONE_DENSITY*Math.PI*diameter**3/6,mesh,phase:'air',water:null};stones.push(item);counters.launched++;return{launched:true,id:item.id,speed:Math.hypot(...velocity),diameterMetres:diameter,charge};
  }
  function waterRotation(s,age){const w=s.water,spin=.18*(-Math.expm1(-Math.max(0,age)/.18));s.mesh.rotation.set(w.entryAirAge*9+spin*9,w.entryAirAge*12+spin*12,w.entryAirAge*5+spin*5);}
  function rest(s,position,time,kind){
    s.phase=kind==='water'?'resting-water':'resting-land';s.restTime=time;s.restKind=kind;
    s.mesh.position.fromArray(position);s.mesh.position.y=Math.max(s.mesh.position.y,stoneBedHeight(terrainHeight,position[0],position[2],s.diameter/2));
    if(kind==='land')s.mesh.rotation.set(s.id*.91,s.id*.37,s.id*.23);else{waterRotation(s,time-s.water.enteredAt);counters.bedContacts++;}
    resting.push(s);while(resting.length>restLimit){scene.remove(resting.shift().mesh);counters.evictedResting++;}
  }
  function refineEntry(s,hit,throughAge){
    const distance=age=>{const p=sampleStonePath(s.start,s.velocity,age).position;return p[1]-Math.max(surfaceHeight(p[0],p[2],s.born+age),terrainHeight(p[0],p[2]));};
    let lo=Math.max(0,hit.age-1e-5),hi=Math.min(throughAge,hit.age+1e-5);
    if(distance(lo)>0&&distance(hi)<=0){for(let k=0;k<36;k++){const middle=(lo+hi)*.5;if(distance(middle)>0)lo=middle;else hi=middle;}const age=(lo+hi)*.5,p=sampleStonePath(s.start,s.velocity,age),w=surfaceHeight(p.position[0],p.position[2],s.born+age),land=terrainHeight(p.position[0],p.position[2]);return{...p,age,height:Math.max(w,land),kind:land>w?'land':'water',position:[p.position[0],Math.max(w,land),p.position[2]]};}
    return hit;
  }
  function bedStep(s,position,velocity,dt){
    const sample=t=>{const p=stepSubmergedStone(position,velocity,t,s.water.parameters),floor=stoneBedHeight(terrainHeight,p.position[0],p.position[2],s.diameter/2);return{...p,t,floor,distance:p.position[1]-floor};};
    let a=sample(0);if(a.distance<=0)return{...a,hit:true,position:[a.position[0],a.floor,a.position[2]]};
    const end=sample(dt),travel=Math.hypot(...end.position.map((v,i)=>v-position[i])),pieces=clamp(Math.ceil(travel/(s.diameter*.25)),1,64);
    for(let i=1;i<=pieces;i++){const b=i===pieces?end:sample(dt*i/pieces);if(b.distance<=0){let lo=a.t,hi=b.t;for(let k=0;k<24;k++){const middle=(lo+hi)*.5;if(sample(middle).distance>0)lo=middle;else hi=middle;}const hit=sample((lo+hi)*.5);return{...hit,hit:true,position:[hit.position[0],hit.floor,hit.position[2]]};}a=b;}
    return{...end,hit:false};
  }
  function updateWater(s,time){
    const w=s.water,age=Math.min(STONE_WATER_MAX_AGE,Math.max(0,time-w.enteredAt)),ticks=Math.floor(age/STONE_WATER_STEP+1e-9);
    while(w.ticks<ticks){const next=bedStep(s,w.position,w.velocity,STONE_WATER_STEP);if(next.hit){rest(s,next.position,w.enteredAt+w.ticks*STONE_WATER_STEP+next.t,'water');return;}w.position=next.position;w.velocity=next.velocity;w.ticks++;}
    // Preview the fractional tick without committing it. Contact is committed
    // on the same240Hz lattice at every render rate; the preview never buries.
    const remainder=Math.max(0,age-w.ticks*STONE_WATER_STEP),preview=stepSubmergedStone(w.position,w.velocity,remainder,w.parameters),floor=stoneBedHeight(terrainHeight,preview.position[0],preview.position[2],s.diameter/2);
    preview.position[1]=Math.max(preview.position[1],floor);s.mesh.position.fromArray(preview.position);w.displayVelocity=preview.velocity;w.displayAge=age;waterRotation(s,age);
    if(time-w.enteredAt>=STONE_WATER_MAX_AGE){scene.remove(s.mesh);s.phase='expired';counters.expiredWater++;}
  }
  return {material,
    launchRay(camera,direction,charge,time){const dir=direction.clone().normalize(),right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0)).normalize();const start=camera.position.clone().addScaledVector(dir,.24).addScaledVector(right,.12).add(new THREE.Vector3(0,-.12,0));start.y=Math.max(start.y,terrainHeight(start.x,start.z)+.04,surfaceHeight(start.x,start.z,time)+.04);const speed=stoneLaunchSpeed(charge);return add(start.toArray(),dir.multiplyScalar(speed).toArray(),time,{charge});},
    // Compatibility for saved fixtures. Interactive UI now uses launchRay.
    launch(camera,x,z,time){const start=camera.position.clone(),duration=.72,a=-Math.expm1(-STONE_DRAG*duration)/STONE_DRAG,target=new THREE.Vector3(x,surfaceHeight(x,z,time+duration),z),v=target.sub(start).divideScalar(a);v.y+=STONE_GRAVITY*(duration-a)/(STONE_DRAG*a);return add(start.toArray(),v.toArray(),time);},
    update(time){
      if(disposed)return;if(!Number.isFinite(time))throw new TypeError('Stone time must be finite.');if(time<lastTime)return;lastTime=time;
      for(let i=stones.length-1;i>=0;i--){const s=stones[i];
        if(s.phase==='air'){
          const age=Math.min(14,Math.max(0,time-s.born)),pointHit=findStoneImpact({start:s.start,velocity:s.velocity,from:s.age,to:age,born:s.born,surfaceHeight,terrainHeight});
          if(pointHit){const hit=refineEntry(s,pointHit,age),speed=Math.hypot(...hit.velocity),event={id:s.id,time:s.born+hit.age,position:[...hit.position],velocity:[...hit.velocity],normalSpeed:Math.abs(hit.velocity[1]),speed,diameter:s.diameter,mass:s.mass,energy:.5*s.mass*speed*speed,kind:hit.kind,charge:s.charge};
            s.mesh.position.fromArray(hit.position);if(hit.kind==='land'){counters.landImpacts++;rest(s,hit.position,event.time,'land');}else{s.phase='underwater';s.water={enteredAt:event.time,entryAirAge:hit.age,entryPosition:[...hit.position],entryVelocity:[...hit.velocity],position:[...hit.position],velocity:[...hit.velocity],parameters:submergedStoneParameters(s.diameter),ticks:0,displayAge:0,displayVelocity:[...hit.velocity]};counters.waterEntries++;}
            onImpact(hit.position[0],hit.position[2],event);
          }else if(age>=14){scene.remove(s.mesh);s.phase='expired';counters.expiredAir++;}
          else{const p=sampleStonePath(s.start,s.velocity,age);s.mesh.position.fromArray(p.position);s.mesh.rotation.set(age*9,age*12,age*5);s.age=age;}
        }
        if(s.phase==='underwater')updateWater(s,time);
        if(s.phase!=='air'&&s.phase!=='underwater')stones.splice(i,1);
      }
    },
    // Existing callers receive the same AIR-only array and field names.
    get state(){return stones.filter(s=>s.phase==='air').map(s=>({id:s.id,diameterMetres:s.diameter,massKg:s.mass,charge:s.charge,age:Math.max(0,lastTime-s.born),position:s.mesh.position.toArray(),start:s.start,initialVelocity:s.velocity}));},
    get underwaterState(){return stones.filter(s=>s.phase==='underwater').map(s=>({id:s.id,phase:s.phase,diameterMetres:s.diameter,massKg:s.mass,enteredAt:s.water.enteredAt,age:Math.max(0,lastTime-s.water.enteredAt),position:s.mesh.position.toArray(),velocity:[...s.water.displayVelocity],entryPosition:[...s.water.entryPosition],entryVelocity:[...s.water.entryVelocity],committedTicks:s.water.ticks,stepSeconds:STONE_WATER_STEP}));},
    get restingState(){return resting.map(s=>({id:s.id,phase:s.phase,kind:s.restKind,diameterMetres:s.diameter,massKg:s.mass,position:s.mesh.position.toArray(),rotation:s.mesh.rotation.toArray(),restTime:s.restTime,enteredAt:s.water?.enteredAt??null}));},
    diagnostics(){return{air:stones.filter(s=>s.phase==='air').length,underwater:stones.filter(s=>s.phase==='underwater').length,resting:resting.length,maxMoving:poolLimit,maxResting:restLimit,stepSeconds:STONE_WATER_STEP,maximumUnderwaterAgeSeconds:STONE_WATER_MAX_AGE,water:submergedStoneParameters(),counters:{...counters},disposed,limits:['Air collision retains the historical centre-crossing surface event; partial immersion and entry cavity are not solved','Cd=.47 andrho_water1025kg/m3 are prescribed sphere/seawater proxies, not measured irregular-pebble data','Still-water quadratic drag and buoyancy; no wave/current advection, rebound, granular contact or bed rolling','Contacts use a locally planar sphere/heightfield support; fractional-tick previews clamp above bed until the fixed tick commits']};},
    dispose(){if(disposed)return;disposed=true;stones.forEach(s=>scene.remove(s.mesh));resting.forEach(s=>scene.remove(s.mesh));stones.length=resting.length=0;geometry.dispose();material.dispose();}
  };
}
