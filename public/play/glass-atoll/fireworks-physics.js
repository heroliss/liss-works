// Deterministic display simulation, metres/seconds and authored reference cd.
// Linear drag is an explicit approximation to the speed-dependent drag of a
// burning star. No chemical construction, recipes or pyrotechnic CFD.
import {windResponse} from './wind-response.js';
import {sampleFiniteThrustResponse,sampleFiniteThrustAcceleration,getFiniteThrustMotionBound} from './firework-thrust-profile.js';
import {validateFireworkEffectProfile,compileFireworkLayerProfile,sampleProfileBodyEmission,sampleProfileBodyEmissionWindow} from './firework-layer-profile.js';
import {AUTOMATIC_SHOW_DEFAULTS,validateAutomaticShow,sampleAutomaticInterval,signedTiltAim} from './firework-auto-show.js';
import {COMPLEX_FIREWORK_TYPES,isComplexFirework,buildComplexFirework} from './complex-fireworks.js';
import {sampleComplexEnvelope,sampleComplexStyle} from './complex-fireworks-style.js';
import {sampleDisplayMotor,sampleDisplayMotorAcceleration,displayMotorDisplacementBound} from './complex-fireworks-motion.js';
const PI=Math.PI,TAU=2*PI,G=9.81;
// Supplier examples define a nominal rise at80deg, not a universal rule for
// every shell of this calibre. Burst width is reference-only in this stage.
export const FIREWORK_HEIGHT_PROFILES=Object.freeze({
  90:Object.freeze({calibreMm:90,riseMetres:120,referenceWidthMetres:60,source:'https://san-en-fireworks.com/index/products/productse/',evidence:'supplier product-scale example',widthCalibrated:false}),
  120:Object.freeze({calibreMm:120,riseMetres:160,referenceWidthMetres:120,source:'https://ojiyaenka.base.shop/items/34029650',evidence:'supplier product-scale example',widthCalibrated:false}),
  150:Object.freeze({calibreMm:150,riseMetres:190,referenceWidthMetres:150,source:'https://san-en-fireworks.com/index/products/productse/',evidence:'supplier product-scale example',widthCalibrated:false})
});
export const FIREWORK_TYPES=Object.freeze([
  {id:'peony',label:'牡丹',calibreMm:90,height:120,burn:3.1,count:224,trail:false},
  {id:'chrysanthemum',label:'菊',calibreMm:120,height:160,burn:4.3,count:192,trail:true},
  {id:'willow',label:'垂柳',calibreMm:150,height:190,burn:11.8,count:160,trail:true},
  {id:'palm',label:'棕榈',calibreMm:150,height:190,burn:6.2,count:12,trail:true},
  // Keep the legacy request/queue ID; the visible pattern is now a smiley.
  {id:'ring',label:'笑脸',pattern:'smiley',calibreMm:90,height:120,burn:3.6,count:72,trail:false},
  {id:'heart',label:'爱心',calibreMm:120,height:160,burn:3.8,count:64,trail:false},
  {id:'crossette',label:'分裂十字',calibreMm:90,height:120,burn:4.3,count:36,trail:true},
  {id:'strobe',label:'闪星',calibreMm:120,height:160,burn:6.2,count:160,trail:false},
  {id:'fan',label:'扇形彗星',height:44,burn:3.6,count:9,trail:true,ground:true},
  {id:'bouquet',label:'近地花束',height:32,burn:2.8,count:104,trail:true,ground:true},
  ...COMPLEX_FIREWORK_TYPES,
].map(o=>Object.freeze({...o,pattern:o.pattern||o.id,calibreMm:o.calibreMm??null,
  heightMeaning:o.collection?o.heightMeaning:o.ground?'nominal-visible-apex-above-launch':'reference-rise-above-launch-at80deg',
  heightReference:o.collection||o.ground?null:FIREWORK_HEIGHT_PROFILES[o.calibreMm],reference:o.reference??'https://www.optimum-fireworks.co.uk/glossary.html'})));
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const add=(a,b)=>a.map((x,i)=>x+b[i]),scale=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>scale(v,1/Math.max(1e-12,Math.hypot(...v)));
export function seededRandom(seed=1){let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
export function flightSegment(position,velocity,dt,drag=.2,wind=[0,0,0],gravity=G){
  dt=Math.max(0,dt);const acceleration=[0,-gravity,0];
  if(drag<1e-8)return {position:position.map((p,i)=>p+velocity[i]*dt+acceleration[i]*dt*dt*.5),velocity:velocity.map((v,i)=>v+acceleration[i]*dt)};
  const decay=Math.exp(-drag*dt),travel=-Math.expm1(-drag*dt)/drag;
  return {position:position.map((p,i)=>p+(wind[i]+acceleration[i]/drag)*dt+(velocity[i]-wind[i]-acceleration[i]/drag)*travel),
    velocity:velocity.map((v,i)=>wind[i]+acceleration[i]/drag+(v-wind[i]-acceleration[i]/drag)*decay)};
}
function sampleUnpoweredBody(body,time,timeline){
  if(time<body.birth)return null;
  const parent=body.parentBody?sampleBody(body.parentBody,body.birth,timeline):null;
  const p=parent?.position||body.position,v=parent?add(body.parentVelocityFraction===undefined?parent.velocity:scale(parent.velocity,body.parentVelocityFraction),body.velocityDelta):body.velocity,dt=time-body.birth,k=body.drag===undefined?.2:body.drag,gravity=body.gravity??G;
  if(k<1e-8)return flightSegment(p,v,dt,k,zeroWind,gravity);
  const first=timeline[0],last=timeline.at(-1);
  if(!last||timeline.length===1||body.birth>=last.time||time<=first.time)return flightSegment(p,v,dt,k,(body.birth>=last?.time?last:first)?.wind||zeroWind,gravity);
  const response=windResponse(timeline,k,body.birth,time);
  return {position:p.map((value,i)=>value+v[i]*response.travel+(i===1?-gravity*response.drift/k:0)+response.position[i]),
    velocity:v.map((value,i)=>value*response.decay+(i===1?-gravity*response.travel:0)+response.velocity[i])};
}
// The base sampler above retains its exact old arithmetic and parent lookup.
// Only the admitted root motor path adds a zero-initial-state response.
export function sampleBody(body,time,timeline=[{time:-Infinity,wind:[0,0,0]}]){
  if(body.parentBody?.thrustProfile||body.thrustProfile&&body.parentBody)throw new RangeError('Powered parent/child inheritance is not admitted');
  const state=sampleUnpoweredBody(body,time,timeline);
  if(state&&body.displayMotor){const response=sampleDisplayMotor(body.displayMotor,time-body.birth,body.drag??.2);return{position:state.position.map((v,c)=>v+response.position[c]),velocity:state.velocity.map((v,c)=>v+response.velocity[c])};}
  if(!state||!body.thrustProfile)return state;
  const k=body.drag===undefined?.2:body.drag,effectiveDrag=k<1e-8?0:k,response=sampleFiniteThrustResponse(body.thrustProfile,time-body.birth,effectiveDrag);
  return{position:state.position.map((v,c)=>v+response.positionDelta[c]),velocity:state.velocity.map((v,c)=>v+response.velocityDelta[c]),motorAcceleration:response.motorAcceleration};
}
export function bodyMotorAcceleration(body,time){
  if(!body||!Number.isFinite(body.birth)||!Number.isFinite(time))throw new RangeError('Motor acceleration requires finite body birth and absolute time');
  if(time<body.birth)return null;
  if(body.displayMotor)return sampleDisplayMotorAcceleration(body.displayMotor,time-body.birth);
  return body.thrustProfile?sampleFiniteThrustAcceleration(body.thrustProfile,time-body.birth):[0,0,0];
}
export function bodyMotorMotionBound(body,time){
  if(!body||!Number.isFinite(body.birth)||!Number.isFinite(time))throw new RangeError('Motor bound requires finite body birth and absolute time');
  const age=time-body.birth;if(age<0)return null;
  if(body.displayMotor){const J=body.displayMotor.maximumAcceleration*Math.min(age,body.displayMotor.endAge),pad=128*Number.EPSILON*Math.max(1,J)+1e-10;return{age,maximumVelocityDeltaMetresPerSecond:J+pad,maximumPositionDeltaMetres:displayMotorDisplacementBound(body.displayMotor,body.drag??.2,age)+pad,maximumMotorAccelerationMetresPerSecondSquared:body.displayMotor.maximumAcceleration+pad,fullIntegratedAccelerationMetresPerSecond:body.displayMotor.integratedAcceleration,profileId:body.displayMotor.schema,model:'bounded finite rotating author acceleration; immutable cell prefix and triangle inequalities'};}
  if(!body.thrustProfile)return{age,maximumVelocityDeltaMetresPerSecond:0,maximumPositionDeltaMetres:0,maximumMotorAccelerationMetresPerSecondSquared:0,fullIntegratedAccelerationMetresPerSecond:0,model:'unpowered'};
  if(body.parentBody)throw new RangeError('Powered parent/child inheritance is not admitted');
  const k=body.drag===undefined?.2:body.drag,raw=getFiniteThrustMotionBound(body.thrustProfile,age,k<1e-8?0:k),margin=v=>128*Number.EPSILON*Math.max(1,Math.abs(v))+1e-12;
  const speedPadding=margin(raw.maximumVelocityDeltaMetresPerSecond),positionPadding=margin(raw.maximumPositionDeltaMetres),accelerationPadding=margin(body.thrustProfile.maximumAccelerationMetresPerSecondSquared);
  return{...raw,maximumVelocityDeltaMetresPerSecond:raw.maximumVelocityDeltaMetresPerSecond+speedPadding,maximumPositionDeltaMetres:raw.maximumPositionDeltaMetres+positionPadding,
    maximumMotorAccelerationMetresPerSecondSquared:body.thrustProfile.maximumAccelerationMetresPerSecondSquared+accelerationPadding,
    numericPadding:{speedMetresPerSecond:speedPadding,positionMetres:positionPadding,accelerationMetresPerSecondSquared:accelerationPadding,policy:'128eps*max(1,abs(raw)) +1e-12 per scalar; practical conservative numerical margin, not arbitrary-epoch interval arithmetic'},
    rawReferenceBound:raw,profileId:body.thrustProfile.id,model:'finite prescribed motor contribution; passive drag/wind/gravity bound remains separate'};
}
const zeroWind=[0,0,0];
export function apexLaunch(height,drag=.075,gravity=G){
  height=Math.max(1,height);let lo=0,hi=30;
  for(let i=0;i<55;i++){const t=(lo+hi)*.5,h=gravity/(drag*drag)*(Math.expm1(drag*t)-drag*t);if(h<height)lo=t;else hi=t;}
  const time=(lo+hi)*.5;return{time,verticalVelocity:gravity/drag*Math.expm1(drag*time),height};
}

// Opt-in display trajectory calibrated to a supplier example's height/fuse
// labels. It is not a measured smiley trajectory or a charge/energy recipe.
function parseFlightOptions({type='peony',flightModel='apex',burstDelaySeconds,height}={}){
  if(flightModel!=='apex'&&flightModel!=='timed-reference')throw new RangeError('flightModel must be apex or timed-reference');
  if(flightModel==='apex'){if(burstDelaySeconds!==undefined)throw new RangeError('burstDelaySeconds requires timed-reference');return null;}
  if(type!=='ring')throw new RangeError('timed-reference currently requires ring');
  if(burstDelaySeconds!==3)throw new RangeError('timed-reference requires explicit burstDelaySeconds=3');
  if(height!==undefined)throw new RangeError('timed-reference uses the definition rise120; explicit height is unsupported');
  return{model:flightModel,burstDelaySeconds};
}
function validatePoweredFlightAdmission({effectProfile,height,flightModel='apex',burstDelaySeconds}){
  if(effectProfile!=='powered-bees-v1')return;
  if(height!==undefined||flightModel!=='apex'||burstDelaySeconds!==undefined)throw new RangeError('powered-bees-v1 requires definition-rise apex flight; explicit height and timed flight are unsupported');
}
function timedReferenceLaunch(height,time){
  const drag=.075,travel=-Math.expm1(-drag*time)/drag;
  return{time,verticalVelocity:(height+G*time/drag)/travel-G/drag,height};
}

// Analytic CIE 1931 fit (Wyman et al., JCGT 2013, 2(2), 1); approximate colour
// matching functions, NOT measured fireworks SPDs. Band locations follow the
// emitter families reviewed in verification/plans/FIREWORKS-RESEARCH.md.
function cie(w){const e=(a,b,c)=>Math.exp(-.5*((w-a)*(w<a?b:c))**2);return[.362*e(442,.0624,.0374)+1.056*e(599.8,.0264,.0323)-.065*e(501.1,.049,.0382),.821*e(568.8,.0213,.0247)+.286*e(530.9,.0613,.0322),1.217*e(437,.0845,.0278)+.681*e(459,.0385,.0725)];}
function emissionColour(kind){
  const xyz=[0,0,0];
  for(let w=380;w<=780;w+=5){let s=0;
    if(kind==='thermal'){const l=w*1e-9;s=1/(l**5*Math.expm1(.01438776877/(l*2850)))*1e-29;}
    else if(kind==='red')s=Math.exp(-.5*((w-642)/15)**2)+.25*Math.exp(-.5*((w-611)/8)**2);
    else if(kind==='green')s=Math.exp(-.5*((w-533)/18)**2)+.20*Math.exp(-.5*((w-561)/8)**2);
    else if(kind==='blue')s=Math.exp(-.5*((w-454)/15)**2)+.22*Math.exp(-.5*((w-488)/8)**2);
    else s=Math.exp(-.5*((w-589.3)/2)**2);
    const cmf=cie(w);for(let c=0;c<3;c++)xyz[c]+=s*cmf[c]*5;
  }
  let rgb=[3.24096994*xyz[0]-1.53738318*xyz[1]-.49861076*xyz[2],-.96924364*xyz[0]+1.8759675*xyz[1]+.04155506*xyz[2],.05563008*xyz[0]-.20397696*xyz[1]+1.05697151*xyz[2]];
  // A documented simple gamut compression: add neutral until nonnegative.
  // This changes the spectral chromaticity; do not claim exact spectral RGB.
  const neutral=Math.max(0,-Math.min(...rgb));rgb=rgb.map(x=>x+neutral);
  const Y=dot(rgb,[.2126,.7152,.0722]);return rgb.map(x=>x/Y);
}
export const EMISSION_PROFILES=Object.freeze(Object.fromEntries(['red','green','blue','yellow','thermal'].map(k=>[k,Object.freeze(emissionColour(k))])));
const palettes=['red','green','blue','red','yellow','red','green','blue','thermal','thermal'];
function sphere(i,n,rng){const y=1-2*(i+.5)/n,a=i*2.399963229728653+rng()*.08,r=Math.sqrt(1-y*y);return[r*Math.cos(a),y,r*Math.sin(a)];}
function planeBasis(azimuth){const a=azimuth*PI/180;return{right:[Math.cos(a),0,Math.sin(a)],up:[0,1,0],normal:[Math.sin(a),0,-Math.cos(a)]};}
// Hidden production/QA variants, not a camera-facing correction. The selected
// default reference uses72 seeded, stratified stars. The other diagnostic
// layouts retain their original point order and shared body-RNG consumption.
export const SMILEY_LAYOUTS=Object.freeze(['dense','spaced-mouth','compact-eyes','reference']);
const normaliseSmileyLayout=value=>SMILEY_LAYOUTS.includes(value)?value:'reference';
const smileyPoints=Object.freeze(Object.fromEntries(SMILEY_LAYOUTS.map(layout=>{
  const filled=layout==='compact-eyes'||layout==='reference',mouthCount=layout==='spaced-mouth'||layout==='reference'?24:48;
  return [layout,Object.freeze(Array.from({length:96+mouthCount},(_,i)=>{
    if(i<72){const a=TAU*i/72;return Object.freeze({x:Math.cos(a),y:Math.sin(a),part:'outline'});}
    if(i<96){
      const left=i<84,j=i-(left?72:84),a=filled?j*2.399963229728653:TAU*j/12;
      // Equal-area radial quantiles including the centre and original support
      // radius. Golden-angle azimuth uses no event RNG;12 stars keep their own
      // original intensity/radius/lifetime rather than becoming a larger source.
      const r=filled?.105*Math.sqrt(j/11):.105;
      return Object.freeze({x:(left?-.34:.34)+r*Math.cos(a),y:.32+r*Math.sin(a),part:left?'left-eye':'right-eye'});
    }
    // Circular U: equal angles give equal arc length including both endpoints.
    // The24-star option keeps the first24 original mouth stars' RNG properties;
    // it removes the remaining24 stars and their real candela, without makeup.
    const a=PI*(i-96)/(mouthCount-1);return Object.freeze({x:-.54*Math.cos(a),y:-.10-.54*Math.sin(a),part:'mouth'});
  }))];
})));
// Fixed-polyline arclength is an authored contour approximation, not a
// physical heart-shell model. Sampling stays inside one stratum per body;
// all variation is decided once from an independent event-seed namespace.
const heartContour=(()=>{
  const points=Array.from({length:2049},(_,i)=>{const a=TAU*i/2048;return[16*Math.sin(a)**3/18,(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))/18+.1];});
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  return{points,lengths,total:lengths.at(-1)};
})();
function heartPointAtFraction(fraction){
  const distance=fraction*heartContour.total;let lo=1,hi=heartContour.lengths.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(heartContour.lengths[mid]<distance)lo=mid+1;else hi=mid;}
  const t=(distance-heartContour.lengths[lo-1])/(heartContour.lengths[lo]-heartContour.lengths[lo-1]),a=heartContour.points[lo-1],b=heartContour.points[lo];
  return{x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,part:'heart'};
}
function polishedPatternPoints(type,seed){
  const rng=seededRandom((seed>>>0)^(type==='heart'?0x48e2c19b:0x73d64a21));
  const finish=(p,fraction)=>{const radial=type==='heart'?.99+.02*rng():.985+.014*rng();return Object.freeze({x:p.x*radial,y:p.y*radial,depth:(rng()*2-1)*.01,part:p.part,fraction,intensityUnit:rng(),lifeUnit:rng()});};
  if(type==='heart')return Object.freeze(Array.from({length:64},(_,i)=>{const f=(i+.5+(rng()*2-1)*.18)/64;return finish(heartPointAtFraction(f),f);}));
  const points=[];
  for(let i=0;i<46;i++){const f=(i+.5+(rng()*2-1)*.18)/46,a=TAU*f;points.push(finish({x:Math.cos(a),y:Math.sin(a),part:'outline'},f));}
  for(const left of [true,false])for(let j=0;j<6;j++){
    const a=j*2.399963229728653+(rng()*2-1)*.10,r=.105*Math.sqrt(j/5);
    points.push(finish({x:(left?-.34:.34)+r*Math.cos(a),y:.32+r*Math.sin(a),part:left?'left-eye':'right-eye'},null));
  }
  for(let i=0;i<14;i++){const f=(i+(i===0||i===13?0:(rng()*2-1)*.18))/13,a=PI*f;points.push(finish({x:-.54*Math.cos(a),y:-.10-.54*Math.sin(a),part:'mouth'},f));}
  return Object.freeze(points);
}
function groundVisibleApex(heads,originY){
  const heights=heads.map(b=>{const k=b.drag??.2,g=b.gravity??G,vy=b.velocity[1];
    const apex=vy<=0?0:k>1e-8?Math.log1p(k*vy/g)/k:vy/g;
    return flightSegment(b.position,b.velocity,Math.min(apex,b.life),k,zeroWind,g).position[1]-originY;
  });
  return {minimumRiseMetres:Math.min(...heights),maximumRiseMetres:Math.max(...heights),maximumWorldY:originY+Math.max(...heights),
    model:'per-head analytic linear-drag visible apex, clipped at burn-out; zero vertical wind',heightIsBurst:false};
}
export function starEnvelope(body,age){
  if(age<0||age>=body.life)return 0;
  // Strobe retains its complete old envelope/pulse arithmetic. Sustained
  // scalar stars cool over the final65% on a broad logarithmic light tail.
  // Both cooling factors are monotone with zero endpoint slopes; this is
  // an authored extinction law, independent of camera exposure, not a heat solve.
  const original=body.strobe||body.kind==='rocket',enter=clamp(age/.028,0,1);
  let envelope;
  if(original){const end=clamp((body.life-age)/Math.max(.16,body.life*.24),0,1);envelope=enter*enter*end*end*(.36+.64*Math.exp(-age/(body.life*.7)));}
  else{const q=clamp((age/body.life-.35)/.65,0,1),end=1-q;envelope=enter*enter*Math.exp(-32*q*q)*(end*end*(1+2*q))*(.36+.64*Math.exp(-age/(body.life*.7)));}
  if(body.strobe){const phase=age*body.frequency+body.phase,cycle=phase-Math.floor(phase),edge=.035;envelope*=clamp(cycle/edge,0,1)*clamp((body.duty-cycle)/edge,0,1);}
  return envelope;
}
// Legacy kind='rocket' is a ballistic mortar carrier with an authored attached
// ascent-light effect, not a continuously thrusting engine or a smoke-mass source.
// Source candela stays unchanged; this bounded C2 envelope is not renormalized.
export function bodyEmissionEnvelope(body,age){
  if(body.sourceStyle)return sampleComplexEnvelope(body,age);
  if(body.kind!=='rocket')return starEnvelope(body,age);
  if(age<=0||age>=body.life)return 0;
  const attack=Math.min(.12,body.life*.25),fade=Math.min(.40,body.life*.35);
  const enter=clamp(age/attack,0,1),end=clamp((body.life-age)/fade,0,1);
  return enter*enter*enter*(enter*(enter*6-15)+10)*end*end*end*(end*(end*6-15)+10);
}
// Full reference RGB is authoritative for opt-in profiles. Legacy consumers
// retain the original scalar envelope and the original colour-array identity.
export function sampleBodyEmission(body,age){
  if(body.burnProfile)return sampleProfileBodyEmission(body,age);
  if(body.sourceStyle){const value=sampleComplexStyle(body,age),intensityCdReference=body.intensity*value.envelope;return{emissionRGBReference:value.colour.map(v=>v*intensityCdReference),intensityCdReference,unitYColour:value.colour,allPhaseMaximumRGB:value.allPhaseMaximumRGB,envelope:value.envelope,effectProfile:'large-choreographed'};}
  const envelope=bodyEmissionEnvelope(body,age),intensityCdReference=body.intensity*envelope;
  return{emissionRGBReference:body.colour.map(v=>v*intensityCdReference),intensityCdReference,unitYColour:body.colour,allPhaseMaximumRGB:body.colour.map(v=>v*body.intensity),envelope,effectProfile:'legacy'};
}
export function sampleBodyEmissionWindow(body,options){return sampleProfileBodyEmissionWindow(body,options);}
function normaliseIntensityScale(value=1){
  if(!Number.isFinite(value)||value<0||value>64)throw new RangeError('intensityScale must be a finite number in0..64');
  return value===0?0:value;
}
// Effective linear-drag display profiles, matched to authored terminal speeds.
// These are not measured particle density/size or a thermal/combustion solve.
// The emitting radius below is optical and is NOT an aerodynamic sphere size.
export const STAR_DESCENT_PROFILES=Object.freeze(Object.fromEntries(Object.entries({peony:18,chrysanthemum:16,willow:10.5,palm:18,ring:18,heart:18,crossette:18,strobe:14}).map(([type,terminalSpeedMetresPerSecond])=>[type,Object.freeze({terminalSpeedMetresPerSecond,dragPerSecond:G/terminalSpeedMetresPerSecond,childTerminalSpeedMetresPerSecond:type==='crossette'?14:terminalSpeedMetresPerSecond,gravityMetresPerSecondSquared:G})])));
function validateStarDragModel(value){if(!['legacy','bounded-descent'].includes(value))throw new RangeError('starDragModel must be legacy or bounded-descent');return value;}
function validateBurstOrientation(value){
  if(value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['yawDegrees','tiltDegrees','rollDegrees'].includes(k)))throw new TypeError('burstOrientation accepts only yawDegrees/tiltDegrees/rollDegrees');
  const out={};for(const key of ['yawDegrees','tiltDegrees','rollDegrees']){const n=value[key]??0;if(!Number.isFinite(n)||Math.abs(n)>360)throw new RangeError('Burst orientation requires finite angles within360degrees');out[key]=n;}return Object.freeze(out);
}
function rotateAround(v,axis,radians){const c=Math.cos(radians),s=Math.sin(radians),d=dot(v,axis)*(1-c),q=cross(axis,v);return v.map((x,i)=>x*c+q[i]*s+axis[i]*d);}
function burstRotator(basis,orientation){
  if(!orientation||Object.values(orientation).every(v=>v===0))return v=>v;
  const {yawDegrees:yaw,tiltDegrees:tilt,rollDegrees:roll}=orientation;
  return v=>rotateAround(rotateAround(rotateAround(v,basis.normal,roll*PI/180),basis.right,tilt*PI/180),[0,1,0],yaw*PI/180);
}
export function createFireworkEvent({type='peony',origin=[29,.5,7],time=0,azimuth=104,elevation=80,seed=1,palette,height,smileyLayout='reference',intensityScale=1,referenceBrightnessGain=1,flightModel='apex',burstDelaySeconds,starDragModel='legacy',burstOrientation=null,effectProfile='legacy',patternAzimuth}={}){
  if(isComplexFirework(type)&&(height!==undefined||flightModel!=='apex'||burstDelaySeconds!==undefined))throw new RangeError('Large choreography currently requires its authored definition-rise apex flight');
  validateFireworkEffectProfile(type,effectProfile);
  intensityScale=normaliseIntensityScale(intensityScale);
  if(!Number.isFinite(referenceBrightnessGain)||referenceBrightnessGain<1||referenceBrightnessGain>64)throw new RangeError('Reference brightness gain requires1..64');
  starDragModel=validateStarDragModel(starDragModel);if(effectProfile==='powered-bees-v1'&&starDragModel!=='bounded-descent')throw new RangeError('powered-bees-v1 requires bounded-descent');burstOrientation=validateBurstOrientation(burstOrientation);
  if(effectProfile==='three-heart-scale120-v1'&&starDragModel!=='bounded-descent')throw new RangeError('three-heart-scale120-v1 requires bounded-descent');
  if(effectProfile==='three-heart-radiant120-v1'&&starDragModel!=='bounded-descent')throw new RangeError('three-heart-radiant120-v1 requires bounded-descent');
  validatePoweredFlightAdmission({effectProfile,height,flightModel,burstDelaySeconds});
  const flight=parseFlightOptions({type,flightModel,burstDelaySeconds,height});
  const definition=FIREWORK_TYPES.find(o=>o.id===type)||FIREWORK_TYPES[0],rng=seededRandom(seed),basis=planeBasis(azimuth),id=`${seed>>>0}-${time.toFixed(5)}`;
  if(patternAzimuth!==undefined&&!Number.isFinite(patternAzimuth))throw new RangeError('Finite pattern azimuth required');
  const patternBasis=patternAzimuth===undefined?basis:planeBasis(patternAzimuth),rotateBurst=burstRotator(patternBasis,burstOrientation),aerodynamics=starDragModel==='bounded-descent'&&!definition.ground?STAR_DESCENT_PROFILES[definition.id]:null;
  smileyLayout=type==='ring'?normaliseSmileyLayout(smileyLayout):null;
  const polishedPoints=type==='heart'||smileyLayout==='reference'?polishedPatternPoints(type,seed):null;
  const patternPoints=polishedPoints||(smileyLayout?smileyPoints[smileyLayout]:null);
  elevation=clamp(Number.isFinite(elevation)?elevation:80,25,90);
  const explicitWorldHeight=height!==undefined&&height!==null;
  // Defaults are rise above the launch point. The legacy explicit `height`
  // argument remains a worldY target so existing optical/GPU fixtures agree.
  const rise=explicitWorldHeight?height-origin[1]:definition.ground?definition.height-origin[1]:definition.height;
  // A type's nominal rise calibrates charge/speed at the default80deg.
  // Changing angle keeps kinetic energy fixed instead of silently increasing
  // muzzle energy to preserve the same high burst at a grazing trajectory.
  const reference=flight?timedReferenceLaunch(rise,flight.burstDelaySeconds):apexLaunch(rise),muzzleSpeed=reference.verticalVelocity/Math.sin(80*PI/180),verticalVelocity=muzzleSpeed*Math.sin(elevation*PI/180),flightTime=flight?flight.burstDelaySeconds:Math.log1p(.075*verticalVelocity/G)/.075;
  const direction=scale(basis.normal,muzzleSpeed*Math.cos(elevation*PI/180)),axis=add(scale(basis.normal,Math.cos(elevation*PI/180)),[0,Math.sin(elevation*PI/180),0]),axisUp=cross(axis,basis.right);
  const rocket={birth:time,position:[...origin],velocity:[direction[0],verticalVelocity,direction[2]],drag:.075,life:flightTime,kind:'rocket',radius:.023,intensity:18,colour:EMISSION_PROFILES.thermal};
  const burstTime=definition.ground?time:time+flightTime;
  const burstState=definition.ground?{position:[...origin],velocity:[0,0,0]}:sampleBody(rocket,burstTime);
  const selected=palette||palettes[FIREWORK_TYPES.indexOf(definition)],colour=EMISSION_PROFILES[selected]||EMISSION_PROFILES.red,heads=[];
  function body(i,p,v,options={}){const b={id:heads.length,event:id,birth:burstTime,position:p,velocity:v,drag:.22,life:definition.burn*(.88+rng()*.23),kind:'star',radius:.009+rng()*.005,intensity:5+rng()*5,colour,trail:definition.trail,seed:Math.floor(rng()*4294967296),...options};if(aerodynamics)b.drag=G/(options.parentBody?aerodynamics.childTerminalSpeedMetresPerSecond:aerodynamics.terminalSpeedMetresPerSecond);return b;}
  const complex=isComplexFirework(type)?buildComplexFirework(type,{eventId:id,origin,time,burstTime,burstState,basis:patternBasis,rotateBurst,rng,seed,rocket}):null;
  if(complex){heads.push(...complex.heads);if(rocket.displayMotor){const actual=sampleBody(rocket,burstTime);for(const b of [...heads,...complex.opticalFlashes])if(!b.parentBody){b.position=b.position.map((p,c)=>p+actual.position[c]-burstState.position[c]);b.basePosition=[...b.position];b.velocity=b.velocity.map((v,c)=>v+actual.velocity[c]-burstState.velocity[c]);b.baseVelocity=[...b.velocity];}burstState.position=actual.position;burstState.velocity=actual.velocity;}}
  for(let i=0;!complex&&i<(patternPoints?.length??definition.count);i++){
    let n=sphere(i,patternPoints?.length??definition.count,rng),v=scale(n,13+rng()*6),options={};
    if(type==='willow'){const a=i*2.399963229728653,randomY=-.05+rng()*.8,y=aerodynamics?1-2*(i+.5)/definition.count:randomY,r=Math.sqrt(1-y*y);v=[Math.cos(a)*r*28,y*28,Math.sin(a)*r*28];options={drag:.74,life:10.2+rng()*2.5,intensity:2.8+rng()*2.4,colour:EMISSION_PROFILES.thermal};}
    if(type==='palm'){const a=TAU*i/definition.count,y=.15+rng()*.65,r=Math.sqrt(1-y*y);v=[Math.cos(a)*r*28,y*28,Math.sin(a)*r*28];options={drag:.20,intensity:48,life:5.4+rng(),radius:.024};}
    if(type==='ring'){
      const p=patternPoints[i];v=add(scale(patternBasis.right,p.x*21),scale(patternBasis.up,p.y*21));
      if(polishedPoints)v=add(v,scale(patternBasis.normal,p.depth*21));
      options={drag:.16,patternPart:p.part,colour:palette?colour:EMISSION_PROFILES[p.part==='outline'?'yellow':'green'],...(polishedPoints?{intensity:5+5*p.intensityUnit,life:definition.burn*(.88+.23*p.lifeUnit)}:{})};
    }
    if(type==='heart'){
      const p=patternPoints[i];
      v=add(add(scale(patternBasis.right,p.x*21),scale(patternBasis.up,p.y*21)),scale(patternBasis.normal,p.depth*21));
      options={drag:.16,intensity:5+5*p.intensityUnit,life:definition.burn*(.88+.23*p.lifeUnit)};
    }
    if(type==='strobe')options={strobe:true,frequency:2.3+rng()*2.4,phase:rng(),duty:.23+rng()*.2,drag:.28};
    if(type==='fan'){
      const a=(i/(definition.count-1)-.5)*1.05,speed=34;
      v=add(scale(basis.right,Math.sin(a)*speed),scale(axis,Math.cos(a)*speed));
      options={birth:time+i*.065,drag:.15,life:3.2+rng()*.6,intensity:52,radius:.024,colour:EMISSION_PROFILES.thermal};
    }
    if(type==='bouquet'){const a=rng()*TAU,y=.66+rng()*.33,r=Math.sqrt(1-y*y),speed=21+rng()*10;v=scale(add(scale(axis,y),add(scale(basis.right,Math.cos(a)*r),scale(axisUp,Math.sin(a)*r))),speed);options={drag:.25,life:2.2+rng()*.7};}
    if(type==='crossette')options={life:.78,drag:.16,intensity:15,split:true};
    if(!definition.ground)v=rotateBurst(v);
    const b=body(i,[...burstState.position],add(v,burstState.velocity),options);b.basePosition=[...b.position];b.baseVelocity=[...b.velocity];heads.push(b);
    if(type==='crossette'){
      const splitTime=b.birth+b.life,split=sampleBody(b,splitTime),radial=unit(v),right=unit(cross(radial,Math.abs(radial[1])>.8?[1,0,0]:[0,1,0])),up=cross(radial,right);
      for(let k=0;k<4;k++){const a=k*PI*.5,extra=add(scale(right,Math.cos(a)*8.6),scale(up,Math.sin(a)*8.6));heads.push(body(i,split.position,add(split.velocity,extra),{birth:splitTime,life:2.5+rng()*.7,drag:.2,intensity:5.5,radius:.009,parent:b.id,parentBody:b,velocityDelta:extra}));}
    }
  }
  // Apply once after ALL parent/child options have been finalized. Never walk
  // parentBody recursively (the same parent also occurs in heads), nor rescale
  // during update/resolveBurst. Tails inherit their body's intensity naturally.
  const emissionScale=intensityScale*referenceBrightnessGain;
  if(emissionScale!==1){rocket.intensity*=emissionScale;for(const b of heads)b.intensity*=emissionScale;if(complex)for(const b of complex.opticalFlashes)b.intensity*=emissionScale;}
  const powered=effectProfile==='powered-bees-v1',radiant=effectProfile==='three-heart-radiant120-v1',poweredRight=powered?rotateBurst(basis.right):null,poweredUp=powered?rotateBurst(basis.up):null;
  const layered=effectProfile==='legacy'?null:powered?compileFireworkLayerProfile({type,effectProfile,heads,burstVelocity:burstState.velocity,eventSeed:seed>>>0,burstFrame:{right:poweredRight,up:poweredUp,forward:cross(poweredRight,poweredUp)}}):compileFireworkLayerProfile({type,effectProfile,heads,burstVelocity:burstState.velocity,eventSeed:seed>>>0});
  if(layered)for(const patch of layered.patches)Object.assign(heads[patch.id],patch);
  const last=Math.max(...heads.map(b=>b.birth+b.life)),baseEndTime=Math.max(last+.95,burstTime+(definition.ground?6:17)*.075+8.5);
  const endTime=complex?Math.max(baseEndTime,...heads.map(b=>b.birth+b.life+(b.sourceStyle?.tailSeconds??0)+.1),...heads.map(b=>b.birth+(definition.ground?0:Math.max(.15,b.sourceStyle?.onset??0))+6.5)):(powered||radiant)?Math.max(baseEndTime,...heads.map(b=>b.birth+Math.max(b.life,b.burnProfile?.material.endAge??0,b.thrustProfile?.motorEndAge??0)+(b.trailProfile?.durationSeconds??(b.trail?.35:0))+1)):baseEndTime;
  const events=type==='fan'||type==='display-vfan'?heads.map((b,i)=>({kind:'launch',time:b.birth,position:[...origin],type:definition.id,seed:(seed+i)>>>0,energy:type==='display-vfan'?.09:.18})):[{kind:'launch',time,position:[...origin],type:definition.id,seed,energy:definition.ground?.22:1},...(!definition.ground?[{kind:'burst',time:burstTime,position:[...burstState.position],type:definition.id,seed,energy:type==='palm'?1.15:1}]:[])];
  const heightInfo={inputMode:flight?'timed-reference-rise':definition.ground?'fixed-ground-kinematics':explicitWorldHeight?'explicit-worldY':'definition-rise',
    referenceRiseMetres:definition.ground?null:definition.height,referenceElevationDegrees:80,
    explicitWorldHeight:explicitWorldHeight?height:null,calibratedRiseMetres:definition.ground?null:reference.height,
    actualBurstWorldY:burstState.position[1],actualBurstRiseMetres:burstState.position[1]-origin[1],
    productReference:definition.heightReference,widthCalibrated:false,...(layered?.radialScale?{widthReferenceCalibration:layered.radialScale}:{}),
    visibleApex:definition.ground?groundVisibleApex(heads,origin[1]):null,...(flight?{flightInfo:{model:flight.model,burstDelaySeconds:flight.burstDelaySeconds,referenceRiseMetres:120,referenceElevationDegrees:80,referenceVerticalVelocity:reference.verticalVelocity,muzzleSpeed,actualBurstVerticalVelocity:burstState.velocity[1],heightMeaning:'rise at fixed fuse, not apex; changed elevation keeps reference muzzle speed',authorApproximation:'constant linear drag .075/s; example fuse interpreted as display launch-to-burst delay; not measured smiley ballistics',sourceURL:'https://rise-hanabi.jp/fireworks/knowledge/'}}:{})};
  const patternFrame=type==='ring'||type==='heart'||complex?Object.freeze({kind:burstOrientation?'fixed-world-rotated-plane':'fixed-world-plane-from-launch-azimuth',right:Object.freeze([...rotateBurst(patternBasis.right)]),up:Object.freeze([...rotateBurst(patternBasis.up)]),normal:Object.freeze([...rotateBurst(patternBasis.normal)])}):null;
  return{...(complex?{opticalFlashes:complex.opticalFlashes,audioEvents:complex.audioEvents,choreography:complex.choreography}:{}),...(patternAzimuth!==undefined?{patternAzimuth}:{}),id,type:definition.id,pattern:definition.pattern,smileyLayout,intensityScale,...(referenceBrightnessGain!==1?{referenceBrightnessGain}:{}),actualStarCount:heads.length,calibreMm:definition.calibreMm,heightInfo,patternFrame,definition,seed:seed>>>0,time,origin:[...origin],azimuth,elevation,rocket:definition.ground?null:rocket,burstTime,burstPosition:[...burstState.position],baselineBurst:burstState,heads,endTime,palette:selected,paletteMode:layered?'effect-profile':type==='ring'&&!palette?'yellow-outline-green-features':'single-colour',events,...(layered?{effectProfile,layerProfile:{schema:layered.schema,layerCounts:layered.layerCounts,referencePeakBudget:layered.referencePeakBudget,maximumLife:layered.maximumLife,limits:layered.limits,...(layered.radialScale?{radialScale:layered.radialScale}:{}),...(layered.radianceProfile?{radianceProfile:layered.radianceProfile,nativeReferencePeakBudget:layered.nativeReferencePeakBudget}:{}),photometry:layered.photometry,material:layered.material,...(layered.trailRecipeId!==undefined?{trailRecipeId:layered.trailRecipeId}:{}),...(powered?{motorBodyIds:layered.motorBodyIds,propulsionKind:layered.propulsionKind,motionProfile:layered.motionProfile}:{})}}:{}),...(aerodynamics?{aerodynamics:{model:'effective-linear-drag-matched-terminal',starDragModel,...aerodynamics,buoyancy:'dense burning body; no invented hot-gas lift',calibration:'authored terminal-speed reference, not measured particle properties'}}:{}),...(burstOrientation?{burstOrientation}: {})};
}
function resolveBurst(event,timeline){
  if(!event.rocket)return;
  const actual=sampleBody(event.rocket,event.burstTime,timeline),base=event.baselineBurst;
  event.burstPosition=actual.position;
  event.heightInfo.actualBurstWorldY=actual.position[1];event.heightInfo.actualBurstRiseMetres=actual.position[1]-event.origin[1];
  if(event.heightInfo.flightInfo)event.heightInfo.flightInfo.actualBurstVerticalVelocity=actual.velocity[1];
  for(const b of event.opticalFlashes?[...event.heads,...event.opticalFlashes]:event.heads)if(!b.parentBody){b.position=b.basePosition.map((p,i)=>p+actual.position[i]-base.position[i]);b.velocity=b.baseVelocity.map((v,i)=>v+actual.velocity[i]-base.velocity[i]);}
  for(const e of event.events)if(e.kind==='burst')e.position=[...actual.position];
  if(event.audioEvents)for(const e of event.audioEvents)e.position=sampleBody(e.anchorBody,e.time,timeline).position;
}
export function sampleFireworkEvent(event,time,{windTimeline,smoke=true,stars=true}={}){
  if(typeof stars!=='boolean')throw new TypeError('stars requires a boolean');
  resolveBurst(event,windTimeline);
  const particles=[];
  if(stars){
    if(event.rocket&&time>=event.time&&time<event.burstTime){const state=sampleBody(event.rocket,time,windTimeline);particles.push({...event.rocket,...state,body:event.rocket,age:time-event.time,emission:bodyEmissionEnvelope(event.rocket,time-event.time),kind:'rocket'});}
    for(const b of event.opticalFlashes?[...event.heads,...event.opticalFlashes]:event.heads){const age=time-b.birth;if(age<0||age>b.life)continue;const state=sampleBody(b,time,windTimeline);if(state.position[1]<.03)continue;const emission=b.burnProfile||b.sourceStyle?sampleBodyEmission(b,age):null;particles.push({...b,...state,body:b,age,emission:emission?emission.envelope:starEnvelope(b,age),...(emission?{colour:emission.unitYColour,emissionRGBReference:emission.emissionRGBReference,intensityCdReference:emission.intensityCdReference,unitYColour:emission.unitYColour,allPhaseMaximumRGB:emission.allPhaseMaximumRGB}: {})});}
  }
  if(smoke&&event.choreography&&time>=event.time){
    const rng=seededRandom(event.seed^0x7f4a7c15),n=event.definition.smokePuffs;
    for(let i=0;i<n;i++){
      const b=event.heads[Math.min(event.heads.length-1,Math.floor(i*event.heads.length/n))],central=!event.definition.ground&&i<3;
      const birth=central?event.burstTime:event.definition.ground?b.birth:b.birth+Math.max(.15,b.sourceStyle?.onset??0),age=time-birth;
      const a=rng()*TAU,spread=.6+rng()*.8,rise=.8+rng()*.8,verticalOffset=(rng()-.5)*.7;if(age<0||age>6.5)continue;
      const source=central?event.burstPosition:event.definition.ground?event.origin:sampleBody(b,birth,windTimeline).position;
      const puff={birth,position:add(source,[Math.cos(a)*spread,verticalOffset,Math.sin(a)*spread]),velocity:[Math.cos(a)*.5,rise,Math.sin(a)*.5],drag:.8,gravity:0},state=sampleBody(puff,time,windTimeline);
      particles.push({...state,kind:'smoke',body:puff,birth,age,life:6.5,radius:.7+age*.68,opticalDepth:.10*Math.exp(-age*.16)/(1+age*.38)*clamp((6.5-age)/1.2,0,1)**2,emission:0,colour:[.63,.65,.68],seed:event.seed+i});
    }
  }else if(smoke&&time>=event.burstTime){const rng=seededRandom(event.seed^0x9e3779b9),n=event.definition.ground?7:18;
    for(let i=0;i<n;i++){
      const birth=event.burstTime+i*.075,age=time-birth,a=TAU*rng(),r=2+rng()*9,y=(rng()-.3)*6,rise=1.2+rng();if(age<0||age>8.5)continue;
      const b={birth,position:add(event.burstPosition,[Math.cos(a)*r,y,Math.sin(a)*r]),velocity:[Math.cos(a)*2,rise,Math.sin(a)*2],drag:.8,gravity:0};
      const state=sampleBody(b,time,windTimeline),radius=1.1+age*.75;
      particles.push({...state,kind:'smoke',body:b,birth,age,life:8.5,radius,opticalDepth:.12*Math.exp(-age*.12)/(1+age*.32)*clamp((8.5-age)/1.5,0,1)**2,emission:0,colour:[.63,.65,.68],seed:event.seed+i});
    }
  }
  return particles;
}
// New scaled-profile reference only. Live composition uses the renderer's
// wind-history/source/shutter forecast instead. Every old eventBounds branch
// below retains its original arithmetic and payload.
function scaledEventReferenceBounds(event,options){
  if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('Scaled event bounds require an options object');
  if(options.windRanges!==undefined&&(!options.windRanges||typeof options.windRanges!=='object'||Array.isArray(options.windRanges)))throw new TypeError('windRanges requires a min/max component object');
  const wind=options.windRanges??{min:[0,0,0],max:[0,0,0]},vector=(v,name)=>{if(!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(x)||Math.abs(x)>1e8))throw new RangeError(name+' requires3 bounded finite components');return v;};
  const lo=vector(wind.min,'windRanges.min'),hi=vector(wind.max,'windRanges.max');if(lo.some((v,c)=>v>hi[c]||Math.abs(v)>50||Math.abs(hi[c])>50))throw new RangeError('Scaled event wind ranges require ordered components within50m/s');
  if(!Array.isArray(event.heads)||event.heads.length!==192)throw new RangeError('Scaled event reference requires192 original heads');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],include=p=>{vector(p,'Reference position');for(let c=0;c<3;c++){min[c]=Math.min(min[c],p[c]);max[c]=Math.max(max[c],p[c]);}},f=(k,t)=>{const F=-Math.expm1(-k*t)/k;return{F,H:t-F};},W=lo.map((v,c)=>Math.max(Math.abs(v),Math.abs(hi[c])));
  include(event.origin);include(event.burstPosition);let maximumTailPadding=0;
  for(const body of [...(event.rocket?[event.rocket]:[]),...event.heads]){
    const p=vector(body.position,'Body birth position'),v=vector(body.velocity,'Body birth velocity'),k=body.drag??.2,g=body.gravity??G,L=body.life;
    if(!(Number.isFinite(k)&&k>0&&Number.isFinite(g)&&g>=0&&Number.isFinite(L)&&L>=0)||body.parentBody||body.thrustProfile)throw new RangeError('Scaled event bounds require finite unpowered original linear-drag bodies');
    const duration=body===event.rocket?.5:(body.trailProfile?.durationSeconds??(body.trail?.35:0));if(!Number.isFinite(duration)||duration<0||duration>(event.effectProfile==='three-heart-radiant120-v1'?.88:.5))throw new RangeError('Scaled event tail duration exceeds reference contract');
    const ember=f(1.35,duration);
    for(let c=0;c<3;c++){
      let lower=p[c],upper=p[c];
      for(const w of[lo[c],hi[c]]){
        const terminal=w-(c===1?g/k:0),ages=[0,L],denominator=v[c]-terminal,decay=-terminal/denominator;
        if(decay>0&&decay<1){const age=-Math.log(decay)/k;if(age>0&&age<L)ages.push(age);}
        for(const age of ages){const q=f(k,age),value=p[c]+v[c]*q.F+terminal*q.H;lower=Math.min(lower,value);upper=Math.max(upper,value);}
      }
      // Held-wind positive drag convolution: |velocity_c| never exceeds this
      // convex component bound. Every tail release inside the head lifetime
      // inherits1/4 velocity and travels no more than its declared lag.
      const speed=Math.max(Math.abs(v[c]),W[c]+(c===1?g/k:0)),tailPad=.25*speed*ember.F+(W[c]+(c===1?G/1.35:0))*ember.H;
      maximumTailPadding=Math.max(maximumTailPadding,tailPad);min[c]=Math.min(min[c],lower-tailPad-1e-5);max[c]=Math.max(max[c],upper+tailPad+1e-5);
    }
  }
  min[1]=Math.max(0,min[1]);max[1]=Math.max(min[1],max[1]);if(![...min,...max].every(Number.isFinite))throw new RangeError('Scaled reference bounds exceeded numeric domain');const centre=min.map((v,c)=>(v+max[c])*.5);
  return{min,max,centre,radius:Math.hypot(...max.map((v,c)=>(v-min[c])*.5)),predicted:true,model:'scaled-profile analytic actual-birth linear-drag body and detached-tail centre reference',windRanges:{min:[...lo],max:[...hi]},windAssumption:options.windRanges===undefined?'zero external wind after each supplied actual birth frame':'explicit uniform-in-space held-wind component ranges after each supplied actual birth frame',maximumTailComponentPaddingMetres:maximumTailPadding,arithmeticPaddingMetres:1e-5,coverage:'Physical body and detached-tail centres over their declared lifetimes above worldY0; analytic component extrema and positive-kernel wind intervals',limitations:['Reference utility only; no complete live/history forecast, unknown future wind or terrain safety guarantee.','No shutter/raster stretch, camera Gaussian quad, DOF, bloom, persistent smoke or material termination enclosure.','Binary64 analytic bounds with small arithmetic padding; not a formal directed-rounding certificate.']};
}

export function eventBounds(event,options={}){
  if(event.effectProfile==='three-heart-scale120-v1')return scaledEventReferenceBounds(event,options);
  if(event.effectProfile==='three-heart-radiant120-v1')return scaledEventReferenceBounds(event,options);
  const p=event.burstPosition,r=event.type==='willow'?47:event.type==='palm'?62:event.definition.ground?45:54;
  return {min:[Math.min(event.origin[0]-4,p[0]-r),Math.max(0,event.origin[1]),Math.min(event.origin[2]-4,p[2]-r)],max:[Math.max(event.origin[0]+4,p[0]+r),p[1]+r,Math.max(event.origin[2]+4,p[2]+r)],centre:[p[0],Math.max(25,p[1]*.6),p[2]],radius:Math.hypot(r,p[1]*.6),predicted:true};
}

function launchAngleJitter(azimuth,elevation,degrees,rng){
  const az=azimuth*PI/180,el=elevation*PI/180,axis=[Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el)],right=[Math.cos(az),0,Math.sin(az)],up=cross(axis,right);
  const theta=Math.acos(1-rng()*(1-Math.cos(degrees*PI/180))),phi=TAU*rng(),offset=add(scale(right,Math.cos(phi)),scale(up,Math.sin(phi))),direction=add(scale(axis,Math.cos(theta)),scale(offset,Math.sin(theta)));
  if(degrees===0)return{azimuth,elevation,direction:axis};
  const actualAzimuth=Math.atan2(direction[0],-direction[2]),actualElevation=clamp(Math.asin(clamp(direction[1],-1,1))*180/PI,25,90)*PI/180;
  return{azimuth:actualAzimuth*180/PI,elevation:actualElevation*180/PI,direction:[Math.sin(actualAzimuth)*Math.cos(actualElevation),Math.sin(actualElevation),-Math.cos(actualAzimuth)*Math.cos(actualElevation)]};
}
function rangedSetting(value,name,min,max){if(!Number.isFinite(value)||value<min||value>max)throw new RangeError(name+' must be finite in'+min+'..'+max);return value;}
function mixLaunchSeed(seed){let x=seed>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return(x^(x>>>16))>>>0;}
function validatedLaunchSettings(patch,current){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new TypeError('Firework settings require an object');
  const next={...current,...patch};
  Object.assign(next,validateAutomaticShow(patch,current));
  const interval=Object.hasOwn(patch,'intervalSeconds')?patch.intervalSeconds:Object.hasOwn(patch,'interval')?patch.interval:current.intervalSeconds;
  next.interval=next.intervalSeconds=rangedSetting(interval,'intervalSeconds',.35,30);
  for(const[key,max]of [['launchSpreadDegrees',15],['burstTiltDegrees',45],['burstRollDegrees',30]])next[key]=rangedSetting(next[key],key,0,max);
  next.starDragModel=validateStarDragModel(next.starDragModel);
  for(const key of ['autoLaunch','autoDirection'])if(typeof next[key]!=='boolean')throw new TypeError(key+' requires a boolean');
  next.intensityScale=normaliseIntensityScale(next.intensityScale);next.smileyLayout=normaliseSmileyLayout(next.smileyLayout);next.elevation=clamp(Number.isFinite(next.elevation)?next.elevation:80,25,90);
  validateFireworkEffectProfile(next.type,next.effectProfile??'legacy');
  if(next.effectProfile==='powered-bees-v1'&&next.starDragModel!=='bounded-descent')throw new RangeError('powered-bees-v1 requires bounded-descent');
  if(next.effectProfile==='three-heart-scale120-v1'&&next.starDragModel!=='bounded-descent')throw new RangeError('three-heart-scale120-v1 requires bounded-descent');
  if(next.effectProfile==='three-heart-radiant120-v1'&&next.starDragModel!=='bounded-descent')throw new RangeError('three-heart-radiant120-v1 requires bounded-descent');
  validatePoweredFlightAdmission(next);
  if(next.autoLaunch&&(next.effectProfile??'legacy')!=='legacy')throw new RangeError('Candidate effectProfile requires explicit single chrysanthemum launches; automatic random mode is unsupported');
  return next;
}
export function createFireworksSimulation({origin=[29,.5,7],directionOrigin=origin,seed=14271,maxActive=4,maxQueued=16,launchPolicy='immediate',muzzleOffsetMetres=0,referenceBrightnessGain=1}={}){
  if(!Number.isFinite(referenceBrightnessGain)||referenceBrightnessGain<1||referenceBrightnessGain>64)throw new RangeError('Reference brightness gain requires1..64');
  if(!Number.isInteger(maxActive)||maxActive<1||maxActive>32)throw new RangeError('maxActive requires1..32 complete events');
  if(!Number.isInteger(maxQueued)||maxQueued<0||maxQueued>64)throw new RangeError('maxQueued requires0..64');
  if(!['immediate','legacy-queue'].includes(launchPolicy))throw new RangeError('launchPolicy must be immediate or legacy-queue');
  rangedSetting(muzzleOffsetMetres,'muzzleOffsetMetres',0,2);
  const settings={...AUTOMATIC_SHOW_DEFAULTS,type:'peony',azimuth:104,elevation:80,autoDirection:true,autoLaunch:false,interval:7.5,intervalSeconds:7.5,launchSpreadDegrees:3,burstTiltDegrees:12,burstRollDegrees:8,starDragModel:'bounded-descent',smileyLayout:'reference',intensityScale:1},active=[],queue=[],pending=[],slotTimes=Array(maxActive).fill(-Infinity);
  let now=0,index=0,showIndex=0,nextAutomatic=0,launches=0,rejected=0,skippedAutomatic=0,lastLaunch=null;
  const windTimeline=[{time:-Infinity,wind:[0,0,0]}];
  const intervalRandom=seededRandom(mixLaunchSeed(seed^0x68bc21eb));
  const nextInterval=()=>sampleAutomaticInterval(settings,settings.randomIntervals?intervalRandom():0);
  function begin(request,at=now,automatic=false){
    const nextIndex=index+1,eventSeed=(request.seed??(seed+Math.imul(nextIndex,2654435761)))>>>0,variation=seededRandom(mixLaunchSeed(eventSeed^0xa511e9b3)),type=request.randomType?FIREWORK_TYPES[Math.min(FIREWORK_TYPES.length-1,Math.floor(variation()*FIREWORK_TYPES.length))].id:(request.type??settings.type);
    const baseAzimuth=request.azimuth??(settings.autoDirection?Math.atan2(directionOrigin[0],-directionOrigin[2])*180/PI:settings.azimuth),baseElevation=request.elevation??settings.elevation;
    const spread=request.launchSpreadDegrees??settings.launchSpreadDegrees,tilt=request.burstTiltDegrees??settings.burstTiltDegrees,roll=request.burstRollDegrees??settings.burstRollDegrees;
    const aim=automatic&&settings.randomLaunchTilt?signedTiltAim(baseAzimuth,settings.automaticTiltMinDegrees+(settings.automaticTiltMaxDegrees-settings.automaticTiltMinDegrees)*variation()):launchAngleJitter(baseAzimuth,clamp(baseElevation,25,90),spread,variation),planar=type==='ring'||type==='heart'||isComplexFirework(type),randomOrientation=tilt===0&&roll===0?null:{yawDegrees:planar?(variation()*2-1)*tilt:variation()*360,tiltDegrees:(variation()*2-1)*tilt,rollDegrees:(variation()*2-1)*roll};
    const baseAxis=launchAngleJitter(baseAzimuth,clamp(baseElevation,25,90),0,()=>0).direction,actualOrigin=request.origin??origin.map((p,c)=>p+(aim.direction[c]-baseAxis[c])*muzzleOffsetMetres);
    const {randomType,launchSpreadDegrees,burstTiltDegrees,burstRollDegrees,...eventRequest}=request;
    const event=createFireworkEvent({...settings,...eventRequest,...(automatic&&settings.randomLaunchTilt?{patternAzimuth:baseAzimuth+90}:{}),referenceBrightnessGain,type,azimuth:aim.azimuth,elevation:aim.elevation,origin:actualOrigin,time:at,seed:eventSeed,burstOrientation:request.burstOrientation??randomOrientation});
    index=nextIndex;slotTimes[slotTimes.indexOf(Math.min(...slotTimes))]=event.endTime;active.push(event);launches++;lastLaunch=Object.freeze({id:event.id,type:event.type,time:at,azimuth:event.azimuth,elevation:event.elevation,origin:Object.freeze([...event.origin]),seed:event.seed,burstOrientation:event.burstOrientation??null,...(automatic?{automatic:true,...(aim.signedTiltDegrees!==undefined?{signedTiltDegrees:aim.signedTiltDegrees}:{})}:{}),...(event.effectProfile?{effectProfile:event.effectProfile}: {})});
    resolveBurst(event,windTimeline);for(const e of event.events)if(e.time<=now){e._delivered=true;pending.push({...e,eventId:event.id});}if(event.audioEvents)for(const e of event.audioEvents)if(e.time<=now){const {anchorBody,...value}=e;e._delivered=true;pending.push({...value,eventId:event.id});}return event;
  }
  function validateLaunch(options){
    if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('Launch options require an object');
    const flight=parseFlightOptions({type:settings.type,...options});let next=flight?{...options,type:'ring'}:{...options};
    if(Object.hasOwn(next,'intensityScale'))next.intensityScale=normaliseIntensityScale(next.intensityScale);
    for(const[key,max]of [['launchSpreadDegrees',15],['burstTiltDegrees',45],['burstRollDegrees',30]])if(Object.hasOwn(next,key))rangedSetting(next[key],key,0,max);
    if(Object.hasOwn(next,'starDragModel'))validateStarDragModel(next.starDragModel);
    if(Object.hasOwn(next,'burstOrientation'))validateBurstOrientation(next.burstOrientation);
    if(Object.hasOwn(next,'randomType')&&typeof next.randomType!=='boolean')throw new TypeError('randomType requires a boolean');
    if(Object.hasOwn(next,'azimuth')&&!Number.isFinite(next.azimuth))throw new RangeError('Launch azimuth must be finite');
    if(Object.hasOwn(next,'elevation')&&!Number.isFinite(next.elevation))throw new RangeError('Launch elevation must be finite');
    if(Object.hasOwn(next,'seed')&&(!Number.isInteger(next.seed)||next.seed<0||next.seed>4294967295))throw new RangeError('Launch seed requires unsigned32bit integer');
    const profile=next.effectProfile??settings.effectProfile??'legacy';validateFireworkEffectProfile(next.type??settings.type,profile);
    if(profile==='powered-bees-v1'&&(next.starDragModel??settings.starDragModel)!=='bounded-descent')throw new RangeError('powered-bees-v1 requires bounded-descent');
    if(profile==='three-heart-scale120-v1'&&(next.starDragModel??settings.starDragModel)!=='bounded-descent')throw new RangeError('three-heart-scale120-v1 requires bounded-descent');
    if(profile==='three-heart-radiant120-v1'&&(next.starDragModel??settings.starDragModel)!=='bounded-descent')throw new RangeError('three-heart-radiant120-v1 requires bounded-descent');
    validatePoweredFlightAdmission({...settings,...next,effectProfile:profile});
    if(next.randomType&&profile!=='legacy')throw new RangeError('Candidate effectProfile cannot use random type selection');
    return next;
  }
  const prune=at=>{for(let i=active.length-1;i>=0;i--)if(active[i].endTime<=at)active.splice(i,1);};
  function launch(options={}){
    options=validateLaunch(options);prune(now);
    if(active.length>=maxActive){
      if(launchPolicy==='legacy-queue'&&queue.length<maxQueued){queue.push({...options,_requestedAt:now});return{accepted:true,queued:true,position:queue.length};}
      rejected++;return{accepted:false,queued:false,reason:'active capacity',active:active.length,maxActive};
    }
    const e=begin(options);return{accepted:true,queued:false,id:e.id,type:e.type,smileyLayout:e.smileyLayout,intensityScale:e.intensityScale,actualStarCount:e.actualStarCount,burstTime:e.burstTime,azimuth:e.azimuth,elevation:e.elevation,origin:[...e.origin],burstOrientation:e.burstOrientation??null,...(e.effectProfile?{effectProfile:e.effectProfile,layerProfile:e.layerProfile}: {})};
  }
  return{
    configure(patch={}){
      if(['flightModel','burstDelaySeconds','burstOrientation','randomType'].some(k=>Object.hasOwn(patch,k)))throw new RangeError('Flight candidates, exact burst orientation and random type are per-launch only');
      const next=validatedLaunchSettings(patch,settings),wasAutomatic=settings.autoLaunch,intervalChanged=['intervalSeconds','randomIntervals','intervalMinSeconds','intervalMaxSeconds'].some(key=>next[key]!==settings[key]);Object.assign(settings,next);
      if(!wasAutomatic&&settings.autoLaunch)nextAutomatic=now;
      else if(wasAutomatic&&settings.autoLaunch&&intervalChanged)nextAutomatic=now+nextInterval();
      return{...settings};
    },
    launch,launchRandom(options={}){return launch({...options,randomType:true});},
    update({time=now,windVector=[0,0,0]}={}){
      if(!Number.isFinite(time)||time<now)return;now=time;
      const w=Array.isArray(windVector)?windVector:[windVector.x||0,windVector.y||0,windVector.z||0],old=windTimeline.at(-1).wind;
      if(w.some((v,i)=>Math.abs(v-old[i])>1e-6))windTimeline.push({time:now,wind:w.map(x=>Number.isFinite(x)?x:0)});
      for(const event of active){resolveBurst(event,windTimeline);for(const e of event.events)if(!e._delivered&&e.time<=now){pending.push({...e,eventId:event.id});e._delivered=true;}if(event.audioEvents)for(const e of event.audioEvents)if(!e._delivered&&e.time<=now){const {anchorBody,...value}=e;pending.push({...value,eventId:event.id});e._delivered=true;}}
      if(launchPolicy==='legacy-queue'){
        for(let safety=0;safety<64;safety++){
          const free=Math.min(...slotTimes),manual=queue.length?Math.max(queue[0]._requestedAt,free):Infinity,automatic=settings.autoLaunch?Math.max(nextAutomatic,free):Infinity,at=Math.min(manual,automatic);
          if(at>now)break;if(manual<=automatic)begin(queue.shift(),at);else{begin({type:FIREWORK_TYPES[showIndex++%FIREWORK_TYPES.length].id},at,true);nextAutomatic=at+nextInterval();}
        }
      }else if(settings.autoLaunch){
        for(let safety=0;safety<64&&nextAutomatic<=now;safety++){
          const at=nextAutomatic;prune(at);
          if(active.length>=maxActive){if(settings.randomIntervals){nextAutomatic=at+nextInterval();skippedAutomatic++;}else{const firstFree=Math.min(...active.map(e=>e.endTime)),until=Math.min(firstFree,now+settings.intervalSeconds*.5),skip=Math.max(1,Math.ceil((until-at)/settings.intervalSeconds));nextAutomatic+=skip*settings.intervalSeconds;skippedAutomatic+=skip;}continue;}
          begin({randomType:true},at,true);nextAutomatic=at+nextInterval();
        }
        // A huge imported clock jump cannot create an unbounded show backlog.
        if(nextAutomatic<=now){if(settings.randomIntervals){nextAutomatic=now+nextInterval();skippedAutomatic++;}else{const skip=Math.floor((now-nextAutomatic)/settings.intervalSeconds)+1;skippedAutomatic+=skip;nextAutomatic+=skip*settings.intervalSeconds;}}
      }
      prune(now);
      const oldest=Math.min(now-22,...active.map(e=>e.time));while(windTimeline.length>2&&windTimeline[1].time<oldest)windTimeline.shift();
    },
    particles(options={}){return active.flatMap(e=>sampleFireworkEvent(e,now,{windTimeline,...options}));},
    drainEvents(){return pending.splice(0);},
    stop(){settings.autoLaunch=false;queue.length=0;},
    get active(){return active;},get windTimeline(){return windTimeline;},
    get time(){return now;},get settings(){return{...settings};},get lastLaunch(){return lastLaunch;},
    get state(){return {...(referenceBrightnessGain!==1?{referenceBrightnessGain}:{}),time:now,active:active.length,queued:queue.length,launches,rejected,skippedAutomatic,maxActive,maxQueued,launchPolicy,nextAutomaticTime:settings.autoLaunch?nextAutomatic:null,lastLaunch:lastLaunch?structuredClone(lastLaunch):null,settings:{...settings},windSegments:windTimeline.length,
      activeEvents:active.map(e=>({id:e.id,type:e.type,pattern:e.pattern,smileyLayout:e.smileyLayout,intensityScale:e.intensityScale,actualStarCount:e.actualStarCount,calibreMm:e.calibreMm,heightInfo:{...e.heightInfo},paletteMode:e.paletteMode,...(e.effectProfile?{effectProfile:e.effectProfile,layerProfile:e.layerProfile}: {}),...(e.aerodynamics?{aerodynamics:{...e.aerodynamics}}:{}),burstOrientation:e.burstOrientation??null})),
      model:'analytic linear-drag segments; deterministic world-space events; authored reference photometry, not CFD',capacityPolicy:'complete events, immediate acceptance or explicit rejection; automatic full slots skip without queue'};},
  };
}
