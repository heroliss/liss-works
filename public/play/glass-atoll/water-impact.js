// Metres, seconds, kilograms and joules. This bounded visual/sound response is
// authored, not a calibrated free-surface or acoustic-pressure simulation.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,fallback)=>Number.isFinite(v)?v:fallback;
const vector=v=>Array.isArray(v)||ArrayBuffer.isView(v)?Array.from(v).slice(0,3):v&&typeof v==='object'?[v.x,v.y,v.z]:null;
const validVector=v=>v?.length===3&&v.every(Number.isFinite);
export const WATER_IMPACT_GRAVITY=9.81;
export const WATER_IMPACT_DENSITY=1025;
export const WATER_IMPACT_SURFACE_TENSION=.072;
const physicsKeys=['mass','energy','normalSpeed','velocity','surfaceNormal','surfaceVelocity'];

/** Returns null for the old strength-only API, including {surfaceHeight} calls. */
export function resolveWaterImpact(options={}){
  if(!physicsKeys.some(key=>options[key]!==undefined))return null;
  const diameter=clamp(finite(options.stoneDiameter,finite(options.diameter,.025)),.012,.045);
  const mass=options.mass===undefined?2600*Math.PI*diameter**3/6:options.mass;
  const velocity=vector(options.velocity),surfaceVelocity=vector(options.surfaceVelocity)||[0,0,0];
  const surfaceNormal=vector(options.surfaceNormal)||[0,1,0];
  if(!(Number.isFinite(mass)&&mass>0)||!validVector(surfaceVelocity)||!validVector(surfaceNormal)||
     (options.velocity!==undefined&&!validVector(velocity))||
     (options.energy!==undefined&&!(Number.isFinite(options.energy)&&options.energy>=0))||
     (options.normalSpeed!==undefined&&!(Number.isFinite(options.normalSpeed)&&options.normalSpeed>=0)))
    return{valid:false,reason:'invalid-water-impact-metadata'};
  const normalLength=Math.hypot(...surfaceNormal);
  if(normalLength<1e-9)return{valid:false,reason:'invalid-surface-normal'};
  const normal=surfaceNormal.map(v=>v/normalLength);
  let relativeVelocity=null,speed,normalSpeed,tangent=[0,0,0],source;
  if(velocity){
    relativeVelocity=velocity.map((v,i)=>v-surfaceVelocity[i]);
    speed=Math.hypot(...relativeVelocity);
    const signedNormal=relativeVelocity.reduce((sum,v,i)=>sum+v*normal[i],0);
    normalSpeed=Math.max(0,-signedNormal);
    tangent=relativeVelocity.map((v,i)=>v-signedNormal*normal[i]);
    source='relative velocity projected on supplied surface normal';
  }else if(options.normalSpeed!==undefined){
    normalSpeed=options.normalSpeed;
    speed=options.energy===undefined?normalSpeed:Math.sqrt(2*options.energy/mass);
    normalSpeed=Math.min(normalSpeed,speed);
    source='normal-speed metadata; missing vector/normal assumed world up';
  }else if(options.energy!==undefined){
    speed=normalSpeed=Math.sqrt(2*options.energy/mass);
    source='energy-only fallback assumes normal incidence';
  }else return{valid:false,reason:'missing-water-impact-kinematics'};
  const energy=.5*mass*speed*speed,normalEnergy=.5*mass*normalSpeed*normalSpeed;
  if(!Number.isFinite(energy+normalEnergy+speed))return{valid:false,reason:'unrepresentable-water-impact-energy'};
  const severity=clamp(Math.log1p(normalEnergy/.02)/Math.log1p(12/.02),0,1);
  // Keep slow entries small, while making the normal-speed difference readable
  // from the scene camera. Tangential speed cannot enlarge this response.
  const scale=Math.pow(diameter/.025,.4)*(.32+2.85*severity**1.2);
  return{
    valid:true,model:'bounded authored normal-energy response v2',source,
    stoneDiameterMetres:diameter,massKg:mass,speedMetresPerSecond:speed,
    normalSpeedMetresPerSecond:normalSpeed,relativeVelocity,normal,tangent,
    energyJoules:energy,normalEnergyJoules:normalEnergy,tangentialEnergyJoules:Math.max(0,energy-normalEnergy),
    suppliedEnergyJoules:options.energy??null,
    suppliedEnergyDifferenceJoules:options.energy===undefined?null:options.energy-energy,
    severity,scale,crownDurationSeconds:.16+.34*severity,
    maximumCrownRadiusMetres:.1*scale,
    // This covers represented droplet kinetic + potential + new surface energy;
    // it does not claim to budget the unresolved crown, waves or entrained air.
    representedDropEnergyBudgetJoules:.03*normalEnergy,
    visible:normalEnergy>1e-7,
  };
}

export function representedDropletEnergy({radii,velocities,offsets}){
  let kinetic=0,potential=0,surface=0,mass=0;
  for(let i=0;i<radii.length;i++){
    const r=radii[i],m=WATER_IMPACT_DENSITY*4*Math.PI*r*r*r/3;
    mass+=m;
    kinetic+=.5*m*(velocities[i*3]**2+velocities[i*3+1]**2+velocities[i*3+2]**2);
    potential+=m*WATER_IMPACT_GRAVITY*Math.max(0,offsets[i*3+1]);
    surface+=WATER_IMPACT_SURFACE_TENSION*4*Math.PI*r*r;
  }
  return{kineticJoules:kinetic,potentialJoules:potential,surfaceJoules:surface,totalJoules:kinetic+potential+surface,massKg:mass};
}

/** A deterministic set of physical droplets, not coarse glowing spray points. */
export function createWaterImpactDroplets(response,{seed=7219,capacity=96}={}){
  if(!response?.valid)throw new Error('A valid water impact is required.');
  const q=response.severity,count=response.visible?clamp(Math.round(clamp(finite(capacity,96),24,160)*(.30+q)),24,160):0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
  const offsets=[],velocities=[],radii=[],lives=[];
  const tangentLength=Math.hypot(response.tangent[0],response.tangent[2]),drift=Math.min(.4,tangentLength*.025);
  const driftX=tangentLength>0?response.tangent[0]/tangentLength*drift:0;
  const driftZ=tangentLength>0?response.tangent[2]/tangentLength*drift:0;
  for(let i=0;i<count;i++){
    const angle=i*2.39996323+random()*.35,radial=(.004+random()*.012)*response.scale;
    const speed=(.12+random()*.65)*(.45+1.35*q),up=(.35+random()*1.7)*(.48+1.1*q);
    offsets.push(Math.cos(angle)*radial,.003+random()*(.004+.010*q),Math.sin(angle)*radial);
    velocities.push(Math.cos(angle)*speed+driftX,up,Math.sin(angle)*speed+driftZ);
    const diameter=i%17===0?.0019+.0013*q+random()*.0006:.0004+Math.pow(random(),1.7)*(.0008+.0013*q);
    radii.push(diameter*.5);
    // The production vertex shader uses exactly -0.5*g*t², with physical time.
    const y=offsets[i*3+1];lives.push((up+Math.sqrt(up*up+2*WATER_IMPACT_GRAVITY*y))/WATER_IMPACT_GRAVITY);
  }
  let energy=representedDropletEnergy({radii,velocities,offsets}),radiusScale=1;
  if(energy.totalJoules>response.representedDropEnergyBudgetJoules){
    // Surface area scales as r² and moving mass as r³. A bounded bisection
    // preserves flight/gravity rather than slowing time to satisfy this budget.
    let low=0,high=1;
    for(let i=0;i<42;i++){
      const mid=(low+high)*.5;
      const trial=(energy.kineticJoules+energy.potentialJoules)*mid**3+energy.surfaceJoules*mid**2;
      if(trial<=response.representedDropEnergyBudgetJoules)low=mid;else high=mid;
    }
    radiusScale=low;for(let i=0;i<radii.length;i++)radii[i]*=radiusScale;
    energy=representedDropletEnergy({radii,velocities,offsets});
  }
  return{count,offsets,velocities,radii,lives,radiusScale,energy,gravity:WATER_IMPACT_GRAVITY,
    durationSeconds:Math.max(response.crownDurationSeconds,...lives)};
}

/** Shared live/offline authored gain and timbre mapping; no pressure calibration. */
export function waterImpactSound(strength=1,impact={}){
  const response=resolveWaterImpact(impact);
  if(!response)return{mode:'legacy-strength',valid:true,gain:.9*Math.sqrt(clamp(finite(strength,1),.1,2)),playbackRate:1,lowpassHz:20000,impact:null};
  if(!response.valid)return{mode:'normal-energy',valid:false,gain:0,playbackRate:1,lowpassHz:20000,impact:response};
  const q=response.severity;
  return{mode:'normal-energy',valid:true,gain:response.visible ? .14+1.30*q : 0,
    playbackRate:1.16-.38*q,lowpassHz:clamp(3400+5600*q,1000,18000),impact:response};
}
