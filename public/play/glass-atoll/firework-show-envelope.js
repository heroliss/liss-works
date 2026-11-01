import {FIREWORK_TYPES,createFireworkEvent} from './fireworks-physics.js';
import {getFireworkEffectProfileLimits,validateFireworkEffectProfile} from './firework-layer-profile.js';
import {COMPLEX_TYPE_LIMITS,isComplexFirework} from './complex-fireworks.js';
import {sampleDisplayMotor} from './complex-fireworks-motion.js';

// Pure physical-centre forecast for the current authored display simulation.
// Constants below are upper limits from the generator expressions, NOT fitted
// maxima from sampled seeds or physical pyrotechnic/product specifications.
export const FIREWORK_ENVELOPE_LIMITS=Object.freeze({
  peony:Object.freeze({intrinsicSpeed:19,lifeMultiplier:1.11}),
  chrysanthemum:Object.freeze({intrinsicSpeed:19,lifeMultiplier:1.11}),
  willow:Object.freeze({intrinsicSpeed:28,maximumBodySeconds:10.2+2.5}),
  palm:Object.freeze({intrinsicSpeed:28,maximumBodySeconds:5.4+1}),
  ring:Object.freeze({intrinsicSpeed:21,lifeMultiplier:1.11}),
  // |x|<=16/18, |y|<=(13+5+2+1)/18+.1 gives speed<32.51.
  heart:Object.freeze({intrinsicSpeed:33,lifeMultiplier:1.11}),
  // One root impulse<=19, one child impulse8.6; root.78 + child<=3.2s.
  crossette:Object.freeze({intrinsicSpeed:19+8.6,maximumBodySeconds:.78+2.5+.7}),
  strobe:Object.freeze({intrinsicSpeed:19,lifeMultiplier:1.11}),
  fan:Object.freeze({intrinsicSpeed:34,maximumBodySeconds:3.2+.6,maximumBirthDelaySeconds:8*.065}),
  bouquet:Object.freeze({intrinsicSpeed:21+10,maximumBodySeconds:2.2+.7}),
  ...COMPLEX_TYPE_LIMITS,
});
const G=9.81,DEG=Math.PI/180,SCALED_PROFILE='three-heart-scale120-v1',RADIANT_PROFILE='three-heart-radiant120-v1';
const finite=(x,name,min=-Infinity,max=Infinity)=>{if(!Number.isFinite(x)||x<min||x>max)throw new RangeError(`${name} requires finite${min}..${max}`);return x;};
const vector=(v,name,limit=1e6)=>{if(!v||v.length!==3)throw new TypeError(name+' requires3components');return Array.from(v,(x,c)=>finite(x,`${name}[${c}]`,-limit,limit));};
const range=(lo,hi)=>[Math.min(lo,hi),Math.max(lo,hi)];
const sum=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const product=(a,b)=>{const q=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return[Math.min(...q),Math.max(...q)];};
const scale=(a,s)=>product(a,[s,s]);
const factors=(k,t)=>{const F=-Math.expm1(-k*t)/k;return{F,H:t-F,E:Math.exp(-k*t)};};
const axis=(azimuth,elevation)=>{const a=azimuth*DEG,e=elevation*DEG;return[Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e)];};

/** Exact unit-sphere cap extrema, enlarged to the current25..90 pitch clamp. */
export function fireworkLaunchConeBounds(azimuth,elevation,spread){
  finite(azimuth,'azimuth');finite(elevation,'elevation',25,90);finite(spread,'launchSpreadDegrees',0,15);
  const a=axis(azimuth,elevation),c=Math.cos(spread*DEG),s=Math.sin(spread*DEG);
  const bounds=a.map(v=>[v<=-c?-1:v*c-Math.sqrt(Math.max(0,1-v*v))*s,v>=c?1:v*c+Math.sqrt(Math.max(0,1-v*v))*s]);
  const elevations=[Math.max(25,elevation-spread),Math.min(90,elevation+spread)];
  bounds[1]=elevations.map(e=>Math.sin(e*DEG));
  return{axis:a,components:bounds,elevationDegrees:elevations,halfAngleDegrees:spread};
}

/** Continuous signed tilt interval in the configured vertical bearing plane.
 * theta=0 is vertical, negative theta faces azimuth+180. Automatic tilt
 * replaces ordinary cone jitter; it must not expand beyond the UI interval.
 */
export function fireworkAutomaticTiltBounds(azimuth,minimum=-40,maximum=40){
  finite(azimuth,'azimuth');finite(minimum,'automaticTiltMinDegrees',-65,65);finite(maximum,'automaticTiltMaxDegrees',-65,65);
  if(minimum>maximum)throw new RangeError('Automatic tilt minimum exceeds maximum');
  const a=azimuth*DEG,lo=Math.sin(minimum*DEG),hi=Math.sin(maximum*DEG),minAbs=minimum<=0&&maximum>=0?0:Math.min(Math.abs(minimum),Math.abs(maximum)),maxAbs=Math.max(Math.abs(minimum),Math.abs(maximum));
  const components=[range(Math.sin(a)*lo,Math.sin(a)*hi),[Math.cos(maxAbs*DEG),Math.cos(minAbs*DEG)],range(-Math.cos(a)*lo,-Math.cos(a)*hi)];
  const middle=(minimum+maximum)*.5,axis=[Math.sin(a)*Math.sin(middle*DEG),Math.cos(middle*DEG),-Math.cos(a)*Math.sin(middle*DEG)];
  return{axis,components,elevationDegrees:[90-maxAbs,90-minAbs],halfAngleDegrees:0,signedTiltDegrees:[minimum,maximum],kind:'signed-tilt-bearing-plane'};
}
function windRanges(wind={maximumSpeed:5,direction:[.936,0,.352]}){
  if(wind.min!==undefined||wind.max!==undefined){
    const lo=vector(wind.min,'wind.min',50),hi=vector(wind.max,'wind.max',50);for(let c=0;c<3;c++)if(lo[c]>hi[c])throw new RangeError('wind.min exceeds wind.max');return lo.map((v,c)=>[v,hi[c]]);
  }
  const maximum=finite(wind.maximumSpeed??5,'wind.maximumSpeed',0,50),direction=vector(wind.direction??[.936,0,.352],'wind.direction',1),length=Math.hypot(...direction);
  if(Math.abs(length-1)>1e-9)throw new RangeError('wind.direction must be unit length');return direction.map(v=>range(0,v*maximum));
}

// For variable drag k in[kMin,kMax], initial positive velocity travels no
// further than F(kMin,t), while gravity has at least g*H(kMax,t)/kMax effect.
// Thus y(t)<=positiveV*F(kMin,t)+(max(0,windY)-g/kMax)*H(kMax,t).
// Its derivative is decreasing when the latter coefficient is negative;
// bracket its unique maximum and enclose both monotone terms at the bracket.
function verticalTravelUpper(positiveV,windY,kMin,kMax,tMax){
  positiveV=Math.max(0,positiveV);const c=Math.max(0,windY)-G/kMax;
  const value=t=>positiveV*factors(kMin,t).F+c*factors(kMax,t).H;
  if(c>=0)return value(tMax);
  if(positiveV===0)return 0;
  const derivative=t=>positiveV*Math.exp(-kMin*t)+c*(1-Math.exp(-kMax*t));
  if(derivative(tMax)>=0)return value(tMax);
  let lo=0,hi=tMax;for(let i=0;i<56;i++){const t=(lo+hi)*.5;if(derivative(t)>0)lo=t;else hi=t;}
  return positiveV*factors(kMin,hi).F+c*factors(kMax,lo).H;
}

// New display ascent only. Every seed changes phase inside an orthonormal
// force plane, so prefix velocity norms are phase invariant. On each held
// force cell, |v(t)| <= |v(start)| + A*dt; after cutoff, drag only decreases
// the norm. These are analytic interval bounds, not sampled trajectory maxima.
function displayCarrierMotorVelocityBound(motor,drag,from,to){
  if(motor?.schema!=='glass-atoll.display-motor.v1'||motor.maximumAcceleration!==60||motor.endAge!==3.3||motor.turns!==3||motor.cells.length!==72)throw new RangeError('Unsupported display ascent motor contract');
  let speed=0;
  for(const cell of motor.cells){
    const start=Math.max(from,cell.from),end=Math.min(to,cell.to);
    if(end<start)continue;
    const v=sampleDisplayMotor(motor,start,drag).velocity;
    speed=Math.max(speed,Math.hypot(...v)+motor.maximumAcceleration*(end-start));
  }
  if(to>=motor.endAge){const t=Math.max(from,motor.endAge);speed=Math.max(speed,Math.hypot(...sampleDisplayMotor(motor,t,drag).velocity));}
  return speed+1e-9;
}

// New version only: do not weaken the old19m/s layered or powered contracts.
function validateScaledLimits(limits,model,profile=SCALED_PROFILE){
  const radiant=profile===RADIANT_PROFILE;if(radiant&&limits?.authorGain!==16)throw new RangeError('Unsupported radiant authored-gain envelope contract');
  if(!limits||limits.maximumBodySeconds!==4.876||limits.intrinsicSpeed!==76||limits.unscaledIntrinsicSpeed!==19||limits.maximumRadialScale!==4||limits.maximumIgnitionDelaySeconds!==0||limits.tailDurationSeconds!==(radiant?.88:.35)||limits.propulsionKind!=='none'||limits.bodyCount!==192||limits.layerCount!==3||limits.requiredStarDragModel!=='bounded-descent'||limits.requiredBodyDragPerSecond!==G/16||model!=='bounded-descent')throw new RangeError('Unsupported scaled firework envelope contract');
}

// Component speed bounds are valid for every held-wind segment: velocity is
// a convex drag response to its initial velocity and bounded terminal forcing.
// At fixed lag q'=v+.25*a*F_e+wind response-(1-E_e)*w_release.
function scaledOpticalSupport(speed,wind,k,gravity,D,shutter){
  const f=factors(1.35,D),acceleration=speed.map((v,c)=>k*(v+wind[c])+(c===1?gravity:0)),fieldVelocity=speed.map((v,c)=>v+.25*acceleration[c]*f.F+2*(1-f.E)*wind[c]);
  const lagDerivative=speed.map((v,c)=>1.25*v+.25*acceleration[c]*f.F+(1-f.E)*wind[c]+(c===1?G*f.F:0));
  const tailPadding=speed.map((v,c)=>.25*v*f.F+(wind[c]+(c===1?G/1.35:0))*f.H),stretchPadding=lagDerivative.map(v=>.5*D*v);
  // Positive source exposure may persist up to S after source extinction.
  // Its midpoint is at most S/2 outside the luminous-life interval; birth
  // anchoring may extend backwards by S/2. Add a further S/2 for the raster
  // motion and S/2 for two independently birth-clamped stretch endpoints.
  const shutterPadding=fieldVelocity.map((v,c)=>1.5*Math.max(v,speed[c])*shutter),opticalPadding=shutterPadding.map((v,c)=>v+stretchPadding[c]);
  return{sourceVelocityBound:speed,sourceAccelerationBound:acceleration,tailFieldVelocityBound:fieldVelocity,tailLagDerivativeBound:lagDerivative,tailPadding,stretchPadding,shutterPadding,opticalPadding,tailSeconds:D,shutterSeconds:shutter};
}

function componentTravelBounds(position,velocity,wind,k,gravity,life){
  const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity],speed=[];
  for(let c=0;c<3;c++){
    for(const side of[0,1]){
      const initial=velocity[c][side],terminal=wind[c][side]-(c===1?gravity/k:0),ages=[0,life],ratio=-terminal/(initial-terminal);
      if(ratio>0&&ratio<1){const t=-Math.log(ratio)/k;if(t>0&&t<life)ages.push(t);}
      for(const t of ages){const f=factors(k,t),value=position[c][side]+initial*f.F+terminal*f.H;minimum[c]=Math.min(minimum[c],value);maximum[c]=Math.max(maximum[c],value);}
    }
    speed[c]=Math.max(Math.abs(velocity[c][0]),Math.abs(velocity[c][1]),Math.max(Math.abs(wind[c][0]),Math.abs(wind[c][1]))+(c===1?gravity/k:0));
  }
  return{min:minimum,max:maximum,speed};
}

/** Known-event continuous enclosure, including legal explicit-height flights.
 * The actual launch/fuse is fixed; future uniform wind can vary arbitrarily
 * within committed component ranges. No future body pose or RNG is sampled.
 */
export function getScaledFireworkLiveEnvelope(event,{windRanges:inputWind,shutterSeconds=1}={}){
  const radiant=event?.effectProfile===RADIANT_PROFILE;
  if(event?.effectProfile!==SCALED_PROFILE&&!radiant)throw new RangeError('Scaled live enclosure requires its explicit profile');
  const limits=getFireworkEffectProfileLimits(radiant?RADIANT_PROFILE:SCALED_PROFILE);validateScaledLimits(limits,event.aerodynamics?.starDragModel,radiant?RADIANT_PROFILE:SCALED_PROFILE);
  finite(shutterSeconds,'Scaled optical shutter seconds',0,1);
  const radialScale=event.layerProfile?.radialScale,alpha=finite(radialScale?.alpha,'Compiled radial scale alpha',Number.MIN_VALUE,4),S=19*alpha;
  if(radialScale.schema!=='glass-atoll.three-heart-radial-scale-calibration.v1'||!Object.isFrozen(radialScale)||radialScale.sourceGainIndependent!==true)throw new RangeError('Scaled live enclosure requires compiled immutable radial metadata');
  if(!Array.isArray(event.heads)||event.heads.length!==192||!event.rocket)throw new RangeError('Scaled live enclosure requires192 original heads and a carrier');
  const wind=windRanges(inputWind),W=wind.map(r=>Math.max(Math.abs(r[0]),Math.abs(r[1]))),rocket=event.rocket,origin=vector(rocket.position,'Carrier launch position'),initial=vector(rocket.velocity,'Carrier initial velocity'),carrierK=finite(rocket.drag,'Carrier drag',Number.MIN_VALUE),carrierG=finite(rocket.gravity??G,'Carrier gravity',0),carrierLife=finite(rocket.life,'Carrier life',0),flight=factors(carrierK,carrierLife);
  const burstPosition=wind.map((r,c)=>r.map(w=>origin[c]+initial[c]*flight.F+(w-(c===1?carrierG/carrierK:0))*flight.H)),burstVelocity=wind.map((r,c)=>r.map(w=>initial[c]*flight.E+(w-(c===1?carrierG/carrierK:0))*(1-flight.E)));
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],maximumPadding=[0,0,0],maximumOpticalPadding=[0,0,0],supports=[],baselineVelocity=vector(event.baselineBurst?.velocity,'Baseline carrier velocity'),baselinePosition=vector(event.baselineBurst?.position,'Baseline burst position');
  function include(position,velocity,k,gravity,life,duration,bodyId,scalarPostLife=0){
    const physical=componentTravelBounds(position,velocity,wind,k,gravity,life),support=scaledOpticalSupport(physical.speed,W,k,gravity,duration,shutterSeconds),padding=support.tailPadding.map((v,c)=>v+support.opticalPadding[c]+scalarPostLife*physical.speed[c]+1e-5);
    for(let c=0;c<3;c++){min[c]=Math.min(min[c],physical.min[c]-padding[c]);max[c]=Math.max(max[c],physical.max[c]+padding[c]);maximumPadding[c]=Math.max(maximumPadding[c],padding[c]);maximumOpticalPadding[c]=Math.max(maximumOpticalPadding[c],support.opticalPadding[c]);}
    supports.push({bodyId,lifeSeconds:life,...support});
  }
  include(origin.map(v=>[v,v]),initial.map(v=>[v,v]),carrierK,carrierG,carrierLife,.5,'rocket',.02);
  for(const body of event.heads){
    if(body.parentBody||body.thrustProfile||body.drag!==G/16||body.birth!==event.burstTime||(radiant?(body.trailProfile?.recipeId!=='radiant-layered-gold-v1'||body.trailProfile?.schema!=='glass-atoll.radiant-layer-trail-profile.v1'):body.trailProfile?.recipeId!=='layered-gold-v1'))throw new RangeError('Scaled live enclosure requires unchanged unpowered same-birth layered-gold roots');
    const base=vector(body.basePosition,'Root baseline birth position'),velocity=vector(body.baseVelocity,'Root scaled base velocity'),kick=velocity.map((v,c)=>v-baselineVelocity[c]);
    if(Math.hypot(...kick)>S+1e-7)throw new RangeError('Scaled source violates19*compiled-alpha intrinsic contract');
    const life=finite(body.life,'Scaled root life',Number.MIN_VALUE,4.876),duration=finite(body.trailProfile.durationSeconds,'Scaled root tail duration',0,radiant?.88:.35),gravity=finite(body.gravity??G,'Root gravity',0);
    include(burstPosition.map((r,c)=>r.map(v=>v+base[c]-baselinePosition[c])),burstVelocity.map((r,c)=>r.map(v=>v+kick[c])),body.drag,gravity,life,duration,body.id);
  }
  min[1]=Math.max(0,min[1]);max[1]=Math.max(min[1],max[1]);if(![...min,...max].every(Number.isFinite))throw new RangeError('Scaled live enclosure exceeded numeric domain');
  return{schema:'glass-atoll.scaled-firework-live-envelope.v1',eventId:event.id,effectProfile:radiant?RADIANT_PROFILE:SCALED_PROFILE,min,max,centre:min.map((v,c)=>(v+max[c])/2),burstPositionRanges:burstPosition,burstVelocityRanges:burstVelocity,
    limits:{familyIntrinsicSpeedMetresPerSecond:76,knownSourceIntrinsicSpeedMetresPerSecond:S,sourceRadialScaleAlpha:alpha,scaleBasis:'19*compiled alpha hard-input relation; per-body actual kick components, not sampled trajectory maxima',bodyCount:192,bodyMaximumSeconds:4.876,...(radiant?{tailMaximumSeconds:.88,trailRecipeId:'radiant-layered-gold-v1',radianceProfile:event.layerProfile.radianceProfile}:{}),windRanges:wind,opticalShutterSeconds:shutterSeconds,opticalMaximumShutterSeconds:1,maximumComponentPaddingMetres:maximumPadding,maximumOpticalComponentPaddingMetres:maximumOpticalPadding,arithmeticPaddingMetres:1e-5},
    support:supports,coverage:'All actual event roots, rocket, detached-tail centres and bounded causal midpoint/linear shutter/lag stretch proxy endpoints above worldY0; every held-wind history within supplied ranges, fixed actual launch and fuse',
    limitations:['Binary64 conservative interval derivation with arithmetic padding, not a formal directed-rounding certificate.','Camera Gaussian quad, DOF, bloom and persistent smoke have separate framing margins; this is not curved-path or time-varying transmission integration accuracy.','No prediction beyond supplied wind ranges, no terrain safety or post-contact120m visible-width guarantee.']};
}

/**
 * origin is a fixed launch point if muzzleOffsetMetres=0; otherwise the rig's
 * muzzle pivot and launch origin=origin+axis*muzzleOffsetMetres. The caller
 * resolves automatic seaward azimuth. All burst orientations are enclosed.
 */
export function getFireworkShowEnvelope(options={}){
  const settings=options.settings??{},pick=(key,fallback)=>options[key]??settings[key]??fallback;
  const type=pick('type','peony'),definition=FIREWORK_TYPES.find(t=>t.id===type),limits=FIREWORK_ENVELOPE_LIMITS[type];
  if(!definition||!limits)throw new RangeError('Unknown firework envelope type');
  const effectProfile=validateFireworkEffectProfile(type,options.effectProfile!==undefined?options.effectProfile:settings.effectProfile!==undefined?settings.effectProfile:'legacy');
  const profileLimits=effectProfile==='legacy'?null:getFireworkEffectProfileLimits(effectProfile),powered=effectProfile==='powered-bees-v1',scaled=effectProfile===SCALED_PROFILE||effectProfile===RADIANT_PROFILE;
  if(scaled)validateScaledLimits(profileLimits,pick('starDragModel','bounded-descent'),effectProfile);
  const sourceRadialScaleAlpha=scaled?finite(options.sourceRadialScaleAlpha??profileLimits.maximumRadialScale,'Known source radial scale alpha',Number.MIN_VALUE,profileLimits.maximumRadialScale):null,scaledShutterSeconds=scaled?finite(pick('shutterSeconds',1),'Scaled optical shutter seconds',0,1):0;
  // This extension covers only the current non-propelled, same-birth chrys
  // compiler. Future delays/motors/speeds require a separate interval proof.
  if(profileLimits&&!powered&&!scaled&&(!(profileLimits.maximumBodySeconds>0&&profileLimits.maximumBodySeconds<=4.876)||!(profileLimits.intrinsicSpeed>=0&&profileLimits.intrinsicSpeed<=19)||profileLimits.maximumIgnitionDelaySeconds!==0||!(profileLimits.tailDurationSeconds>=0&&profileLimits.tailDurationSeconds<=.35)||profileLimits.propulsionKind!=='none'||profileLimits.bodyCount!==192))throw new RangeError('Unsupported layered firework envelope contract');
  if(powered&&(profileLimits.propulsionKind!=='finite-held-author-acceleration-v1'||profileLimits.bodyCount!==192||profileLimits.motorBodyCount!==32||profileLimits.radialBodyCount!==160||profileLimits.intrinsicSpeed!==19||profileLimits.motorIntrinsicSpeed!==8.55||profileLimits.maximumBodySeconds!==4.773||profileLimits.maximumMotorBodySeconds!==1.908||profileLimits.maximumIntegratedAccelerationMetresPerSecond!==12.72||profileLimits.maximumMotorEndSeconds!==1.06||profileLimits.maximumMotorAccelerationMetresPerSecondSquared!==12||profileLimits.maximumOpticalShutterSeconds!==1/60||profileLimits.maximumIgnitionDelaySeconds!==0||profileLimits.tailDurationSeconds!==.35||profileLimits.motorTailDurationSeconds!==.18||pick('starDragModel','bounded-descent')!=='bounded-descent'))throw new RangeError('Unsupported powered firework envelope contract');
  const poweredShutterSeconds=powered?finite(pick('shutterSeconds',profileLimits.maximumOpticalShutterSeconds),'Powered optical shutter seconds',0,profileLimits.maximumOpticalShutterSeconds):0;
  if(pick('flightModel','apex')!=='apex'||options.height!==undefined||settings.height!==undefined)throw new RangeError('Show envelope currently supports definition-rise apex flights only');
  const origin=vector(options.origin??[29,.87,7],'origin'),muzzle=finite(options.muzzleOffsetMetres??0,'muzzleOffsetMetres',0,2);
  const azimuth=finite(pick('azimuth',110),'azimuth'),elevation=finite(pick('elevation',78),'elevation',25,90),spread=finite(pick('launchSpreadDegrees',3),'launchSpreadDegrees',0,15);
  finite(pick('burstTiltDegrees',12),'burstTiltDegrees',0,45);finite(pick('burstRollDegrees',8),'burstRollDegrees',0,30);
  const wind=windRanges(options.wind),padding=finite(options.paddingMetres??0,'paddingMetres',0,100);
  const automaticTilt=options.randomLaunchTilt!==undefined?!!options.randomLaunchTilt:!!settings.autoLaunch&&!!settings.randomLaunchTilt;
  const floor=finite(options.visibleFloorMetres??.03,'visibleFloorMetres',-1e6,1e6),cone=automaticTilt?fireworkAutomaticTiltBounds(azimuth,pick('automaticTiltMinDegrees',-40),pick('automaticTiltMaxDegrees',40)):fireworkLaunchConeBounds(azimuth,elevation,spread);
  const launch=cone.components.map((r,c)=>sum([origin[c],origin[c]],scale(r,muzzle)));
  const canonicalOrigin=origin.map((v,c)=>v+muzzle*cone.axis[c]);
  const canonical=createFireworkEvent({type,origin:canonicalOrigin,azimuth,elevation,seed:0,starDragModel:pick('starDragModel','bounded-descent'),smileyLayout:pick('smileyLayout','reference'),...(profileLimits?{effectProfile}:{})});
  const complex=isComplexFirework(type),drags=canonical.heads.map(b=>b.drag??.2),kMin=complex?limits.minimumBodyDragPerSecond:Math.min(...drags),kMax=complex?limits.maximumBodyDragPerSecond:Math.max(...drags);
  if(!(kMin>0&&Number.isFinite(kMax)))throw new RangeError('Unsupported body drag');
  if(complex&&drags.some(k=>k<kMin||k>kMax))throw new RangeError('Display generator violates its published body-drag interval');
  if(powered&&(kMin!==profileLimits.requiredBodyDragPerSecond||kMax!==kMin||canonical.heads.filter(b=>b.thrustProfile).length!==profileLimits.motorBodyCount))throw new RangeError('Powered generator drag/count violates the published envelope contract');
  if(scaled&&(kMin!==profileLimits.requiredBodyDragPerSecond||kMax!==kMin||canonical.heads.length!==192||canonical.heads.some(b=>b.parentBody||b.thrustProfile)))throw new RangeError('Scaled generator drag/count/propulsion violates the published envelope contract');
  const bodySeconds=profileLimits?.maximumBodySeconds??limits.maximumBodySeconds??definition.burn*limits.lifeMultiplier;
  const birthDelay=profileLimits?.maximumIgnitionDelaySeconds??limits.maximumBirthDelaySeconds??0;
  for(const b of canonical.heads)if(b.birth-canonical.burstTime+b.life>bodySeconds+birthDelay+1e-10)throw new Error('Generator lifetime exceeds its published envelope contract');
  const S=scaled?profileLimits.unscaledIntrinsicSpeed*sourceRadialScaleAlpha:profileLimits?.intrinsicSpeed??limits.intrinsicSpeed,bodyF=factors(kMin,bodySeconds).F,bodyH=factors(kMax,bodySeconds).H;
  let burst=launch.map(r=>r.slice()),burstVelocity=[[0,0],[0,0],[0,0]],carrierSeconds=[0,0],muzzleSpeed=0;
  const min=launch.map(r=>r[0]),max=launch.map(r=>r[1]);
  if(!definition.ground){
    const rocket=canonical.rocket,k=rocket.drag;muzzleSpeed=Math.hypot(...rocket.velocity);
    carrierSeconds=cone.elevationDegrees.map(e=>Math.log1p(k*muzzleSpeed*Math.sin(e*DEG)/G)/k);
    const low=factors(k,carrierSeconds[0]),high=factors(k,carrierSeconds[1]),F=[low.F,high.F],E=[high.E,low.E],H=[low.H,high.H];
    const maxRise=verticalTravelUpper(muzzleSpeed*cone.components[1][1],wind[1][1],k,k,carrierSeconds[1]);
    for(let c=0;c<3;c++){
      const initial=scale(cone.components[c],muzzleSpeed);
      burst[c]=sum(sum(launch[c],product(initial,F)),product(wind[c],H));
      burstVelocity[c]=sum(product(initial,E),product(wind[c],[1-low.E,1-high.E]));
      const rocketPosition=sum(sum(launch[c],product(initial,[0,high.F])),product(wind[c],[0,high.H]));
      if(c===1){
        burst[c]=sum(burst[c],scale(H,-G/k));
        // Flight fuse is the zero-vertical-wind apex for each launch pitch;
        // that homogeneous vertical velocity cancels exactly in the model.
        burstVelocity[c]=product(wind[c],[1-low.E,1-high.E]);
        burst[c][1]=Math.min(burst[c][1],launch[c][1]+maxRise);
        max[c]=Math.max(max[c],launch[c][1]+maxRise);
      }else{min[c]=Math.min(min[c],rocketPosition[0]);max[c]=Math.max(max[c],rocketPosition[1]);}
    }
  }
  let displayCarrierMotorSpeed=0;
  if(complex&&canonical.rocket?.displayMotor){
    displayCarrierMotorSpeed=displayCarrierMotorVelocityBound(canonical.rocket.displayMotor,canonical.rocket.drag,...carrierSeconds);
    burstVelocity=burstVelocity.map(r=>[r[0]-displayCarrierMotorSpeed,r[1]+displayCarrierMotorSpeed]);
  }
  for(let c=0;c<3;c++){
    const travel=sum(sum(burst[c],product(burstVelocity[c],[0,bodyF])),sum([-S*bodyF,S*bodyF],product(wind[c],[0,bodyH])));
    if(c===1)max[c]=Math.max(max[c],burst[c][1]+verticalTravelUpper(Math.max(0,burstVelocity[c][1])+S,wind[c][1],kMin,kMax,bodySeconds));
    else{min[c]=Math.min(min[c],travel[0]);max[c]=Math.max(max[c],travel[1]);}
  }
  // Detached embers are born anywhere inside the body envelope, inherit1/4
  // body velocity and then fly at drag1.35 for no more than this trail lag.
  const trailSeconds=profileLimits?.tailDurationSeconds??limits.tailDurationSeconds??(type==='willow'?.88:type==='palm'?.62:definition.trail?.35:0);
  const rocketTrailSeconds=definition.ground?0:.50;
  const windSpeedBound=Math.hypot(...wind.map(r=>Math.max(Math.abs(r[0]),Math.abs(r[1]))));
  const burstSpeedBound=Math.hypot(...burstVelocity.map(r=>Math.max(Math.abs(r[0]),Math.abs(r[1]))));
  const motorJ=powered?profileLimits.maximumIntegratedAccelerationMetresPerSecond:complex&&type==='display-vortex'?90*3.3:0;
  const bodySpeedBound=burstSpeedBound+S+windSpeedBound+G/kMin+motorJ;
  const emberPad=(v,t)=>{const f=factors(1.35,t);return .25*v*f.F+(windSpeedBound+G/1.35)*f.H;};
  const tailPadding=Math.max(emberPad(bodySpeedBound,trailSeconds),emberPad(muzzleSpeed+windSpeedBound+G*carrierSeconds[1],rocketTrailSeconds));
  // The positive drag-response kernel proves |deltaV|<=J and
  // |deltaP(t)|<=J*F(kMin,t), for every admitted force direction/schedule.
  // Extend the short motor body's source-clock horizon for a neighbouring
  // tail lag and shutter anchor; do not derive the bound from seed samples.
  let poweredBounds=null,poweredPadding=0;
  if(powered){
    const D=profileLimits.motorTailDurationSeconds,history=profileLimits.maximumMotorBodySeconds+poweredShutterSeconds+D,f=factors(1.35,D);
    const motorDisplacement= motorJ*factors(kMin,history).F;
    const velocity=burstSpeedBound+profileLimits.motorIntrinsicSpeed+windSpeedBound+G/kMin+motorJ;
    const acceleration=kMax*(velocity+windSpeedBound)+G+profileLimits.maximumMotorAccelerationMetresPerSecondSquared;
    // At fixed lag, q'(t)=v+.25*a*F_e+wind_velocity-(1-E_e)*w_release.
    // The two bounded wind terms together contribute at most2*(1-E_e)*W.
    const fieldVelocity=velocity+.25*acceleration*f.F+2*(1-f.E)*windSpeedBound;
    const shutterPadding=Math.max(velocity,fieldVelocity)*poweredShutterSeconds*.5;
    // At fixed observation time: |dq/dlag| <=1.25*V+.25*A*F_e
    // +(1-E_e)*W+g*F_e. A rendered neighbouring-node stretch has lag
    // separation<=D and half endpoint extent; its taper weight is<=1.
    const lagDerivative=1.25*velocity+.25*acceleration*f.F+(1-f.E)*windSpeedBound+G*f.F;
    const stretchPadding=.5*D*lagDerivative;
    poweredPadding=motorDisplacement+shutterPadding+stretchPadding;
    poweredBounds={nativeIntrinsicSpeedMetresPerSecond:S,combinedIntrinsicAllowanceMetresPerSecond:profileLimits.maximumCombinedIntrinsicSpeedMetresPerSecond,motorBodyCount:32,radialBodyCount:160,motorSeconds:profileLimits.maximumMotorEndSeconds,motorBodySeconds:profileLimits.maximumMotorBodySeconds,motorIntegratedAccelerationMetresPerSecond:motorJ,motorResponseHistorySeconds:history,motorDisplacementPaddingMetres:motorDisplacement,motorSourceVelocityBoundMetresPerSecond:velocity,motorSourceAccelerationBoundMetresPerSecondSquared:acceleration,motorTailFieldVelocityBoundMetresPerSecond:fieldVelocity,motorTailLagDerivativeBoundMetresPerSecond:lagDerivative,motorTailSeconds:D,opticalShutterSeconds:poweredShutterSeconds,opticalMaximumShutterSeconds:profileLimits.maximumOpticalShutterSeconds,motorOpticalShutterPaddingMetres:shutterPadding,motorOpticalStretchPaddingMetres:stretchPadding,totalPoweredPaddingMetres:poweredPadding};
  }
  let scaledBounds=null,scaledPadding=0;
  if(scaled){
    const body=scaledOpticalSupport([bodySpeedBound,bodySpeedBound,bodySpeedBound],wind.map(r=>Math.max(Math.abs(r[0]),Math.abs(r[1]))),kMax,G,trailSeconds,scaledShutterSeconds),rocket=scaledOpticalSupport([muzzleSpeed+windSpeedBound+G*carrierSeconds[1],muzzleSpeed+windSpeedBound+G*carrierSeconds[1],muzzleSpeed+windSpeedBound+G*carrierSeconds[1]],wind.map(r=>Math.max(Math.abs(r[0]),Math.abs(r[1]))),canonical.rocket?.drag??kMax,G,rocketTrailSeconds,scaledShutterSeconds);
    // Detached-centre travel was already included in tailPadding above.
    scaledPadding=Math.max(...body.opticalPadding,...rocket.opticalPadding);
    scaledBounds={familyIntrinsicSpeedMetresPerSecond:profileLimits.intrinsicSpeed,sourceIntrinsicSpeedMetresPerSecond:S,sourceRadialScaleAlpha,scaleBasis:options.sourceRadialScaleAlpha===undefined?'unknown-seed family cap4':'caller-supplied known compiled source subset',opticalShutterSeconds:scaledShutterSeconds,opticalMaximumShutterSeconds:1,body,rocket,additionalOpticalPaddingMetres:scaledPadding};
  }
  const displayMotorPadding=complex?limits.maximumMotorDisplacementMetres:0;
  const totalPadding=tailPadding+padding+1e-5+poweredPadding+scaledPadding+displayMotorPadding;
  for(let c=0;c<3;c++){min[c]-=totalPadding;max[c]+=totalPadding;}
  min[1]=floor;
  if(max[1]<floor)max[1]=floor;
  if(![...min,...max].every(Number.isFinite))throw new RangeError('Envelope exceeded numeric domain');
  return{schema:'glass-atoll.firework-show-envelope.v1',type,...(profileLimits?{effectProfile}:{}),min,max,centre:min.map((v,c)=>(v+max[c])/2),
    ...(automaticTilt?{automaticLaunchTilt:{kind:cone.kind,signedTiltDegrees:cone.signedTiltDegrees,manualConeJitterApplied:false}}:{}),
    launchDirectionRanges:cone.components,launchElevationRangeDegrees:cone.elevationDegrees,launchPositionRanges:launch,burstPositionRanges:burst,burstVelocityRanges:burstVelocity,
    limits:{intrinsicSpeedMetresPerSecond:S,bodySeconds,birthDelaySeconds:birthDelay,minimumBodyDragPerSecond:kMin,maximumBodyDragPerSecond:kMax,carrierSeconds,muzzleSpeedMetresPerSecond:muzzleSpeed,tailSeconds:trailSeconds,rocketTailSeconds:rocketTrailSeconds,tailAnchorPaddingMetres:tailPadding,compositionPaddingMetres:padding,arithmeticPaddingMetres:1e-5,windRanges:wind,...(complex?{display:{maximumHeads:limits.maximumHeads,maximumTrailCarriers:limits.maximumTrailCarriers,motorDisplacementPaddingMetres:displayMotorPadding,carrierInheritedMotorSpeedBoundMetresPerSecond:displayCarrierMotorSpeed,materialTimingIndependent:true}}:{}),...(poweredBounds?{powered:poweredBounds}:{}),...(scaledBounds?{scaled:scaledBounds}:{})},
    coverage:scaled?'All admitted scaled-profile seeds or declared known-alpha subset; physical bodies/detached tails plus conservative causal midpoint, neighbouring-tail stretch and linear shutter proxy support above the renderer floor.':powered?'All admitted seeds/force headings, configured launch cone and arbitrary burst rotations; native and powered physical luminous body/tail centres plus powered short-shutter linear raster proxy and neighbouring-tail stretch endpoints above the renderer floor.':'All allowed seed-dependent speeds/lives, configured launch cone and arbitrary burst rotations; physical luminous body and detached-tail centres above the renderer floor.',
    method:scaled?'analytic cone/positive drag intervals with separate76m/s family or19*known-alpha limit and continuous component optical derivative padding; no sampled-max bound':powered?'analytic cone/drag intervals + native hard limits + finite-force positive-kernel Minkowski enclosure J*F(kMin,t), inherited ember velocity, bounded fixed-lag derivative and half-shutter world displacement; no sampled-max bound':'analytic cone component extrema + positive linear-drag response intervals + generator hard speed/lifetime limits; canonical event only calibrates deterministic muzzle speed and drag classes',
    limitations:['Binary64 conservative analytic derivation with small arithmetic padding, not a formal directed-rounding certificate.',scaled?'Scaled world-space source/tail/stretch/shutter proxies only, S<=1s: camera Gaussian quad/DOF/bloom and persistent smoke retain separate framing margins. This does not prove curved-path integration accuracy or varying transmission.':powered?'Powered world-space raster centres/stretch/shutter proxies only, S<=1/60s: camera Gaussian quad/DOF/bloom, native scalar raster proxies and persistent smoke retain separate framing margins. This does not prove curved-path integration accuracy or varying transmission.':'Source-centre envelope only: camera-dependent Gaussian quad/DOF/shutter/bloom footprint and persistent drifting smoke require their separate framing margins.','Wind may vary piecewise in time only within supplied component bounds; no prediction of future user settings.','Current generator contract only; no arbitrary per-launch height, timed-reference flight or external physics modifications.']};
}
