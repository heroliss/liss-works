import {createComplexStyle,COMPLEX_COLOURS} from './complex-fireworks-style.js';
import {createDisplayMotor,displayMotorDisplacementBound,sampleDisplayCoast,displayAirborneBurnLimit} from './complex-fireworks-motion.js';
const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){for(const v of Object.values(o))freeze(v);Object.freeze(o);}return o;};
export const COMPLEX_FIREWORK_TYPES=freeze([
  {id:'display-saturn',label:'流彩·星环',height:260,burn:5.1,count:256,description:'黄红粉紫绿外球、蓝紫内芯与疏朗星环，内芯先灭，星环渐暗收尾。'},
  {id:'display-heart',label:'流彩·星心',height:270,burn:5.1,count:256,description:'五色渐变外球包围蓝紫内球，疏朗而略不规则的金粉心形最后燃尽。'},
  {id:'display-flower',label:'流彩·星冠',height:280,burn:5.1,count:256,description:'内外两层球体与疏朗八瓣花冠分时渐暗，主爆有短促强闪。'},
  {id:'display-chase',label:'逐光·双环',height:250,burn:5.5,count:208,description:'双圈星体沿相反方向依次点燃，中央蓝球率先隐去。'},
  {id:'display-vfan',label:'金羽·往返扫射',height:65,burn:16.8,count:128,ground:true,description:'同一扇区内约13秒完成四轮往返扫射，穿过中央再折返，每条彗星带持续金色尾焰独立渐暗。'},
  {id:'display-helix',label:'螺旋·升龙',height:280,burn:5.8,count:192,description:'有限旋转侧推形成螺旋上升尾迹，爆开为双旋金蓝星群。'},
  {id:'display-vortex',label:'旋翼·群星',height:270,burn:5.7,count:192,description:'主球爆开后，一组带有限旋转推进的星体继续弯卷散开。'},
  {id:'display-waterfall',label:'星河·横空银瀑',height:240,burn:11.1,count:193,description:'银白彗星横穿夜空，沿途洒下长留空中的银金火星帘幕，缓慢渐暗为金色余烬；低空燃烧提前收束。'},
  {id:'display-double',label:'双响·花中花',height:290,burn:5.2,count:180,description:'主爆后十二组子花依次绽放，青蓝背景衬托红金双层花心。'},
  {id:'display-brocade',label:'锦冠·三幕',height:300,burn:7.2,count:256,description:'蓝紫内芯、金冠长尾、迟亮暖色碎星先后接续，主爆带强闪。'}
].map(d=>({...d,smokePuffs:({'display-saturn':14,'display-heart':14,'display-flower':20,'display-chase':8,'display-vfan':24,'display-helix':22,'display-vortex':16,'display-waterfall':24,'display-double':22,'display-brocade':24})[d.id],collection:'large-choreographed',pattern:d.id,trail:true,calibreMm:null,heightMeaning:d.ground?'authored-visible-apex':'authored-reference-rise-at80deg',heightReference:null,reference:'authored choreography informed by professional display examples; not measured shell dimensions'})));
export const isComplexFirework=type=>COMPLEX_FIREWORK_TYPES.some(d=>d.id===type);
export const COMPLEX_TYPE_LIMITS=freeze(Object.fromEntries(COMPLEX_FIREWORK_TYPES.map(d=>[d.id,{intrinsicSpeed:80,maximumBodySeconds:d.id==='display-brocade'?7.2:d.id==='display-waterfall'?11.1:d.ground?4.1:5.8,maximumBirthDelaySeconds:d.ground?12.7:0,minimumBodyDragPerSecond:d.ground?.18:d.id==='display-waterfall'?.45:.55,maximumBodyDragPerSecond:1.2,tailDurationSeconds:d.id==='display-waterfall'?2.2:1.2,maximumMotorDisplacementMetres:d.id==='display-helix'||d.id==='display-vortex'?120:0,maximumTrailCarriers:192,maximumHeads:288}])));

const add=(a,b)=>a.map((v,c)=>v+b[c]),scale=(a,s)=>a.map(v=>v*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>scale(v,1/Math.hypot(...v)),TAU=Math.PI*2;
function contourPoint(shape,a){let x=Math.cos(a),y=Math.sin(a);if(shape==='heart'){x=16*Math.sin(a)**3/18;y=(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))/18+.1;}if(shape==='flower'){const r=.72+.28*Math.cos(a*8);x*=r;y*=r;}return[x,y];}
// Arc-length strata avoid the clumps that equal parameter steps create near
// the heart's cusp. Jitter is chosen once at construction, never per frame.
function contourSamples(shape,count,rng){
  const vertices=Array.from({length:513},(_,i)=>contourPoint(shape,TAU*i/512)),lengths=[0];
  for(let i=1;i<vertices.length;i++)lengths.push(lengths[i-1]+Math.hypot(vertices[i][0]-vertices[i-1][0],vertices[i][1]-vertices[i-1][1]));
  return Array.from({length:count},(_,i)=>{const s=(i+.5+(rng()-.5)*.64)/count*lengths.at(-1);let lo=0,hi=512;while(hi-lo>1){const m=(lo+hi)>>1;if(lengths[m]<s)lo=m;else hi=m;}const t=(s-lengths[lo])/(lengths[hi]-lengths[lo]),r=1+(rng()-.5)*.07;return[(vertices[lo][0]+(vertices[hi][0]-vertices[lo][0])*t)*r,(vertices[lo][1]+(vertices[hi][1]-vertices[lo][1])*t)*r,(rng()-.5)*.025];});
}
function styleAtLife(style,life){const f=life/style.life;return createComplexStyle({...style,life,onset:style.onset*f,colours:style.colourKnots.map(k=>({age:k.age*f,rgb:k.rgb})),envelopeKnots:style.envelopeKnots.map(k=>({age:k.age*f,value:k.value}))});}
export function buildComplexFirework(type,{eventId,origin,time,burstTime,burstState,basis,rotateBurst,rng,seed,rocket}={}){
  if(!isComplexFirework(type))throw new RangeError('Unknown large display');
  const heads=[],opticalFlashes=[],audioEvents=[],limits=COMPLEX_TYPE_LIMITS[type];
  const point=(x,y,z=0)=>add(add(scale(basis.right,x),scale(basis.up,y)),scale(basis.normal,z));
  function body(position,velocity,life,style,extra={}){
    const b={id:heads.length,event:eventId,birth:burstTime,position:[...position],velocity:[...velocity],basePosition:[...position],baseVelocity:[...velocity],drag:.63,gravity:9.81,life,kind:'star',radius:.0105+rng()*.003,intensity:8+rng()*3,colour:COMPLEX_COLOURS.gold,trail:style.tailFraction>0,seed:Math.floor(rng()*4294967296),sourceStyle:style,...extra};heads.push(b);return b;
  }
  const makeStyle=(life,colours,tailSeconds=0,tailFraction=.25,tailColour='gold',onset=0,pulseHz=0,tailProfile=tailSeconds>=.42?'sustained-comet-v1':undefined)=>createComplexStyle({life,onset,colours:colours.map(([age,colour])=>({age,colour})),tailSeconds:tailProfile==='sustained-comet-v1'?Math.min(1.2,tailSeconds*1.5):tailSeconds,tailFraction,tailColour,pulseHz,pulsePhase:rng(),...(tailProfile?{tailProfile}:{})});
  const direction=(i,n)=>{const y=Math.max(-.9999,Math.min(.9999,1-2*(i+.5+(rng()-.5)*.35)/n)),a=i*2.399963229728653+(rng()-.5)*.16,r=Math.sqrt(1-y*y);return[r*Math.cos(a),y,r*Math.sin(a)];};
  const five=(life)=>[[0,'gold'],[life*.2,'red'],[life*.4,'pink'],[life*.63,'violet'],[life*.85,'green'],[life,'green']];
  function sphere(count,speed,life,style,part,trailEvery=1){for(let i=0;i<count;i++){const n=direction(i,count),v=rotateBurst(scale(n,speed*(.965+rng()*.07))),s=i%trailEvery===0?style:createComplexStyle({...style,colours:style.colourKnots.map(k=>({age:k.age,rgb:k.rgb})),envelopeKnots:style.envelopeKnots,tailSeconds:0,tailFraction:0});body(burstState.position,add(v,burstState.velocity),life,s,{patternPart:part});}}
  function planar(count,speed,life,style,shape='ring',onsets=false){const samples=contourSamples(shape,count,rng);for(let i=0;i<count;i++){const[x,y,z]=samples[i],duration=life*(.94+rng()*.10),onset=onsets?i/count*1.15:0,s=onsets?makeStyle(duration,[[0,'blue'],[1.4,'violet'],[3,'pink'],[duration,'gold']],.15,.1,'source',onset):styleAtLife(style,duration);body(burstState.position,add(rotateBurst(point(x*speed,y*speed,z*speed)),burstState.velocity),duration,s,{patternPart:shape+'-plane',intensity:12*(.78+rng()*.35)});}}
  function flash(intensity=12000,at=burstTime,parentBody=null){const life=.075,sourceStyle=createComplexStyle({life,colours:[{age:0,colour:'silver'},{age:life,colour:'gold'}],tailSeconds:0,tailFraction:0,envelopeKnots:[{age:0,value:0},{age:.004,value:1},{age:.016,value:.42},{age:.04,value:.08},{age:life,value:0}]});opticalFlashes.push({id:'flash-'+opticalFlashes.length,birth:at,position:[...burstState.position],velocity:[0,0,0],basePosition:[...burstState.position],baseVelocity:[0,0,0],drag:.63,gravity:0,life,kind:'star',radius:.04,intensity,colour:COMPLEX_COLOURS.silver,sourceStyle,sourceRole:'optical-flash',matter:false,...(parentBody?{parentBody,parent:parentBody.id,velocityDelta:[0,0,0]}:{})});}
  if(['display-saturn','display-heart','display-flower'].includes(type)){
    const outerLife=4.12,innerLife=2.55,coreLife=4.9,outer=makeStyle(outerLife,five(outerLife),.42,.26,'source');
    sphere(144,69,outerLife,outer,'outer-sphere',2);sphere(64,32,innerLife,makeStyle(innerLife,[[0,'blue'],[1.5,'violet'],[innerLife,'violet']]),'inner-sphere',2);
    planar(48,type==='display-heart'?56:58,coreLife,makeStyle(coreLife,[[0,'silver'],[2.2,'gold'],[3.8,'pink'],[coreLife,'gold']],.15,.1,'silver'),type==='display-saturn'?'ring':type==='display-heart'?'heart':'flower');
    if(type==='display-flower')flash();
  }else if(type==='display-chase'){
    planar(96,62,5.2,null,'ring',true);const start=heads.length;planar(64,40,4.7,null,'ring',true);for(let i=start;i<heads.length;i++){const b=heads[i],onset=(1-(i-start)/64)*1.15;b.sourceStyle=makeStyle(b.life,[[0,'green'],[b.life*.51,'blue'],[b.life,'silver']],.15,.1,'source',onset);}
    sphere(48,25,2.3,makeStyle(2.3,[[0,'blue'],[2.3,'violet']]),'inner-sphere');
  }else if(type==='display-vfan'){
    for(let i=0;i<128;i++){const angle=(38*Math.sin(TAU*4*i/127-Math.PI/2)+(rng()-.5)*.8)*Math.PI/180,life=4.1,birth=time+i*.10,v=add(scale(basis.right,Math.sin(angle)*42),[0,Math.cos(angle)*42,0]),c=['gold','silver','amber','pink'][Math.floor(i/32)],b=body(origin,v,life,makeStyle(life,[[0,c],[life*.65,'gold'],[life,'amber']],.7,.38,'gold'),{birth,drag:.18,radius:.019,intensity:42*(.9+rng()*.2),patternPart:'v-sweep-comet'});b.basePosition=[...origin];}
  }else if(type==='display-helix'){
    rocket.displayMotor=createDisplayMotor({right:basis.right,up:basis.normal,phase:rng()*TAU,acceleration:60,duration:3.3,turns:3});
    sphere(120,54,4.6,makeStyle(4.6,[[0,'blue'],[1.4,'violet'],[3.1,'pink'],[4.6,'gold']],.5,.3,'source'),'helix-canopy',2);
    for(let i=0;i<72;i++){const a=i/72*TAU*2.5,y=1-2*(i+.5)/72,n=unit(point(Math.cos(a),y*.8,Math.sin(a))),life=5.8;body(burstState.position,add(rotateBurst(scale(n,40)),burstState.velocity),life,makeStyle(life,[[0,'gold'],[2.3,'silver'],[4,'blue'],[life,'violet']],.7,.32,'silver'),{patternPart:'double-helix-stars'});}
  }else if(type==='display-vortex'){
    sphere(96,48,4.3,makeStyle(4.3,[[0,'red'],[1.8,'gold'],[4.3,'green']],.5,.22,'source'),'radial-sphere',2);
    for(let i=0;i<48;i++){const radial=unit(rotateBurst(direction(i,48))),u=unit(cross(radial,Math.abs(radial[1])>.9?[1,0,0]:[0,1,0])),v=cross(radial,u),life=4.8,displayMotor=createDisplayMotor({right:u,up:v,phase:rng()*TAU,acceleration:78,duration:2.2,turns:2});body(burstState.position,add(scale(radial,36),burstState.velocity),life,makeStyle(life,[[0,'blue'],[1.4,'violet'],[3,'pink'],[life,'amber']],.78,.4,'source'),{displayMotor,patternPart:'rotating-motor'});}
    planar(48,27,5.4,makeStyle(5.4,[[0,'silver'],[2.2,'gold'],[5.4,'pink']],0),'ring');
  }else if(type==='display-waterfall'){
    // Preserve the rotated horizontal bearing, while the authored horizontal
    // carrier keeps its 75m/s traverse and 14m/s rise even at large burst roll.
    const projected=rotateBurst(point(1,0)),heading=Math.hypot(projected[0],projected[2])>1e-8?unit([projected[0],0,projected[2]]):basis.right,carrierLife=3.25,carrier=body(burstState.position,add(add(scale(heading,75),[0,14,0]),burstState.velocity),carrierLife,makeStyle(carrierLife,[[0,'silver'],[carrierLife,'silver']],.88,.4,'silver'),{drag:.45,intensity:110,radius:.025,patternPart:'horizontal-carrier'});
    for(let i=0;i<192;i++){const birth=burstTime+.12+i/192*2.8,requestedLife=7.6+rng()*.5,velocityDelta=rotateBurst(point((rng()-.5)*2,-5-rng()*3,(rng()-.5)*1.8)),release=sampleDisplayCoast(carrier.position,carrier.velocity,birth-carrier.birth,carrier.drag),initialVelocity=add(scale(release.velocity,.25),velocityDelta),tailSeconds=i===191?0:2.2,life=displayAirborneBurnLimit({position:release.position,velocity:initialVelocity,requestedLife,drag:.45,tailSeconds});body(burstState.position,[0,0,0],life,makeStyle(life,[[0,'silver'],[life*.58,'gold'],[life,'amber']],tailSeconds,.38,'silver',0,0,'waterfall-filament-v1'),{birth,parent:carrier.id,parentBody:carrier,parentVelocityFraction:.25,velocityDelta,drag:.45,intensity:3.2+rng()*1.8,radius:.004+rng()*.002,patternPart:'waterfall-ember'});}
  }else if(type==='display-double'){
    sphere(24,55,4.9,makeStyle(4.9,[[0,'blue'],[2.3,'violet'],[4.9,'blue']]),'outer-pearls');
    for(let i=0;i<12;i++){const n=rotateBurst(direction(i,12)),parent=body(burstState.position,add(scale(n,31),burstState.velocity),.9+i*.015,makeStyle(.9+i*.015,[[0,'silver'],[.9+i*.015,'gold']],.35,.32,'gold'),{patternPart:'subshell-carrier',split:true});for(let j=0;j<12;j++){const v=rotateBurst(scale(direction(j,12),32)),life=3.8;body(burstState.position,[0,0,0],life,makeStyle(life,[[0,i%2?'pink':'green'],[1.8,i%2?'red':'blue'],[life,'gold']],j%2===0?.42:0,.3,'source'),{birth:parent.birth+parent.life,parent:parent.id,parentBody:parent,velocityDelta:v,patternPart:'subshell-star'});}audioEvents.push({kind:'burst',time:parent.birth+parent.life,position:[...burstState.position],type,seed:(seed+i+1)>>>0,energy:.12,audioOnly:true,anchorBody:parent});flash(2600,parent.birth+parent.life,parent);}
  }else if(type==='display-brocade'){
    sphere(160,65,7.2,makeStyle(7.2,[[0,'silver'],[1.8,'gold'],[5.3,'amber'],[7.2,'amber']],.88,.42,'gold'),'brocade-crown');
    sphere(64,30,2.8,makeStyle(2.8,[[0,'blue'],[1.5,'violet'],[2.8,'violet']]),'inner-sphere');
    sphere(32,42,6.5,makeStyle(6.5,[[0,'gold'],[6.5,'amber']],.22,.2,'gold',3.1,2.3),'late-glitter');flash(15000);
  }
  for(const b of heads)if(b.displayMotor&&displayMotorDisplacementBound(b.displayMotor,b.drag,b.life)>limits.maximumMotorDisplacementMetres)throw new RangeError('Display motor exceeds its authored spatial limit');
  if(rocket.displayMotor&&displayMotorDisplacementBound(rocket.displayMotor,rocket.drag,rocket.life)>limits.maximumMotorDisplacementMetres)throw new RangeError('Display ascent motor exceeds its authored spatial limit');
  if(heads.length>limits.maximumHeads||heads.filter(b=>b.sourceStyle.tailFraction>0).length>limits.maximumTrailCarriers)throw new RangeError('Large display exceeds its complete-event optical budget');
  return{heads,opticalFlashes,audioEvents,choreography:{collection:'large-choreographed',description:COMPLEX_FIREWORK_TYPES.find(d=>d.id===type).description,limits,model:'authored layered display; analytic drag, finite prescribed motor where declared; no CFD or measured product calibration'}};
}
