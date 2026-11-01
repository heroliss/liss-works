// Explicit opt-in G1 model. No incumbent host imports this module.
// Conservative depth-averaged2D SWE; hydrostatic reconstruction and Rusanov
// flux. h/qx/qz are metres / m2.s^-1; W is authored bed-contact moisture.
import {createShorelineBoundary,SHORELINE_SWELL_MODES} from './shoreline-boundary.js';

export const SHORELINE_LIMITS=Object.freeze({minimumResolution:8,maximumResolution:384,qualityResolutions:Object.freeze([192,256,384]),
  maximumTicksPerAdvance:120,maximumSubstepsPerTick:256,maximumCells:384*384,maximumWaterDepthMetres:1e4,maximumFluxM2ps:1e8});
const G=9.81,finite=(v,n)=>{if(!Number.isFinite(v))throw new RangeError(n+' must be finite');return v;};
const integer=(v,n,lo,hi)=>{if(!Number.isInteger(v)||v<lo||v>hi)throw new RangeError(`${n} requires integer${lo}..${hi}`);return v;};
const positive=(v,n)=>{finite(v,n);if(!(v>0))throw new RangeError(n+' must be positive');return v;};
const pair=(v,n)=>{if(!v||v.length!==2)throw new TypeError(n+' requires two indexed components');return[finite(v[0],n+'[0]'),finite(v[1],n+'[1]')];};
const sum=a=>{let s=0,c=0;for(let i=0;i<a.length;i++){const y=a[i]-c,t=s+y;c=(t-s)-y;s=t;}return s;};
const copyField=(v,n,name)=>{if(!v||v.length!==n)throw new TypeError(name+' field length mismatch');const a=new Float64Array(n);for(let i=0;i<n;i++)a[i]=finite(v[i],name+'['+i+']');return a;};
const sideNames=['west','east','south','north'];

function configuration(options={}){
  const {terrainHeight,resolution=256,center=[-34,-1],size=[24,24],time=0,tickSeconds=1/60,maxTicksPerAdvance=4,
    substepsPerTick,velocityBudgetMps=4,depthBudgetMetres,boundary='swell',incidentEdges=['west'],swellHeight=.16,boundaryRampSeconds=6,
    seaLevel=0,manning=.018,wetDepth=.002,wettingRate=8,dryingSeconds=35,cfl=.4,initialState,boundaryStartTime=time}=options;
  if(typeof terrainHeight!=='function')throw new TypeError('terrainHeight(x,z) in metres required');
  const n=integer(resolution,'resolution',8,384),count=n*n,c=pair(center,'center'),span=pair(size,'size');span.forEach(v=>positive(v,'domain size'));
  finite(time,'origin time');positive(tickSeconds,'tickSeconds');if(tickSeconds>1||time+tickSeconds===time)throw new RangeError('tickSeconds must be representable and at most1s');
  integer(maxTicksPerAdvance,'maxTicksPerAdvance',1,120);positive(velocityBudgetMps,'velocityBudgetMps');finite(seaLevel,'seaLevel');finite(manning,'manning');if(manning<0||manning>.2)throw new RangeError('manning must be within0..0.2');
  positive(wetDepth,'wetDepth');if(wetDepth>.05)throw new RangeError('wetDepth must be at most0.05m');positive(wettingRate,'wettingRate');positive(dryingSeconds,'dryingSeconds');positive(cfl,'cfl');if(cfl>.45)throw new RangeError('cfl must be at most0.45');
  if(boundary!=='closed'&&boundary!=='swell')throw new RangeError('boundary must be closed or swell');
  if(!Array.isArray(incidentEdges)||incidentEdges.length>4||incidentEdges.some(s=>!sideNames.includes(s))||new Set(incidentEdges).size!==incidentEdges.length)throw new RangeError('Distinct named incident edges required');
  const driveEdges=sideNames.map(s=>boundary==='swell'&&incidentEdges.includes(s)),dx=span[0]/n,dz=span[1]/n,x0=c[0]-span[0]/2,z0=c[1]-span[1]/2;
  const bed=new Float64Array(count);let maximumRestDepth=0;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const k=j*n+i;bed[k]=finite(terrainHeight(x0+(i+.5)*dx,z0+(j+.5)*dz),'bed');if(Math.abs(bed[k])>1e5)throw new RangeError('Bed outside numeric domain');maximumRestDepth=Math.max(maximumRestDepth,seaLevel-bed[k]);}
  const fields=initialState?{h:copyField(initialState.h,count,'h'),qx:copyField(initialState.qx,count,'qx'),qz:copyField(initialState.qz,count,'qz'),wetness:initialState.wetness?copyField(initialState.wetness,count,'wetness'):new Float64Array(count)}:
    {h:Float64Array.from(bed,b=>Math.max(0,seaLevel-b)),qx:new Float64Array(count),qz:new Float64Array(count),wetness:Float64Array.from(bed,b=>seaLevel-b>wetDepth?1:0)};
  let maximumInitialDepth=0;
  for(let k=0;k<count;k++){const h=fields.h[k];if(h<0||h>1e4||Math.abs(fields.qx[k])>1e8||Math.abs(fields.qz[k])>1e8||fields.wetness[k]<0||fields.wetness[k]>1||(h===0&&(fields.qx[k]!==0||fields.qz[k]!==0)))throw new RangeError('Invalid initial physical state');maximumInitialDepth=Math.max(maximumInitialDepth,h);}
  const incident=createShorelineBoundary({swellHeight,startTime:boundaryStartTime,rampSeconds:boundaryRampSeconds});
  const allocationDepth=depthBudgetMetres===undefined?Math.max(maximumRestDepth,maximumInitialDepth)+Math.max(1,2*incident.amplitudeSupportMetres):positive(depthBudgetMetres,'depthBudgetMetres');
  const allocationSpeed=velocityBudgetMps+Math.sqrt(G*allocationDepth),allocatedDt=cfl/(allocationSpeed/dx+allocationSpeed/dz);
  const microSteps=substepsPerTick===undefined?Math.max(1,Math.ceil(tickSeconds/allocatedDt)):integer(substepsPerTick,'substepsPerTick',1,256);integer(microSteps,'substepsPerTick',1,256);
  return{n,count,center:c,size:span,dx,dz,x0,z0,bed,fields,time,tickSeconds,maxTicksPerAdvance,microSteps,dt:tickSeconds/microSteps,incident,boundary,driveEdges,seaLevel,manning,wetDepth,wettingRate,dryingSeconds,cfl,
    allocation:{velocityBudgetMps,depthBudgetMetres:allocationDepth,allocatedDt},maximumRestDepth};
}
function newFields(c){return{h:new Float64Array(c.count),qx:new Float64Array(c.count),qz:new Float64Array(c.count),wetness:new Float64Array(c.count)};}
function workspace(c){const nx=(c.n+1)*c.n,nz=c.n*(c.n+1),make=n=>({mass:new Float64Array(n),normal:new Float64Array(n),tangent:new Float64Array(n),left:new Float64Array(n),right:new Float64Array(n),speed:new Float64Array(n)});return{x:make(nx),z:make(nz)};}
const readCell=(s,c,k)=>({h:s.h[k],qx:s.qx[k],qz:s.qz[k],b:c.bed[k]});
function ghost(s,c,k,side,x,z,time){
  const p=readCell(s,c,k),normal=side===0?[-1,0]:side===1?[1,0]:side===2?[0,-1]:[0,1];
  const restDepth=Math.max(0,c.seaLevel-p.b);
  if(c.boundary==='closed'||restDepth===0){if(side<2)p.qx=-p.qx;else p.qz=-p.qz;return p;}
  const u=p.h>0?p.qx/p.h:0,v=p.h>0?p.qz/p.h:0,incident=c.driveEdges[side]?c.incident.sample(x,z,restDepth,time,normal):{eta:0,u:0,v:0};
  const outgoing=u*normal[0]+v*normal[1]+2*Math.sqrt(G*p.h),incoming=incident.u*normal[0]+incident.v*normal[1]-2*Math.sqrt(G*Math.max(0,restDepth+incident.eta));
  const un=(outgoing+incoming)*.5,waveSpeed=Math.max(0,(outgoing-incoming)*.25),h=waveSpeed*waveSpeed/G,tangent=[-normal[1],normal[0]],ut=un<0?incident.u*tangent[0]+incident.v*tangent[1]:u*tangent[0]+v*tangent[1];
  return{h,qx:h*(un*normal[0]+ut*tangent[0]),qz:h*(un*normal[1]+ut*tangent[1]),b:p.b};
}
function face(a,b,axis,out,k){
  const ua=a.h>0?a.qx/a.h:0,va=a.h>0?a.qz/a.h:0,ub=b.h>0?b.qx/b.h:0,vb=b.h>0?b.qz/b.h:0,z=Math.max(a.b,b.b),ha=Math.max(0,a.h+a.b-z),hb=Math.max(0,b.h+b.b-z);
  const unA=axis===0?ua:va,unB=axis===0?ub:vb,utA=axis===0?va:ua,utB=axis===0?vb:ub,qa=ha*unA,qb=hb*unB,qtA=ha*utA,qtB=hb*utB,speed=Math.max(Math.abs(unA)+Math.sqrt(G*ha),Math.abs(unB)+Math.sqrt(G*hb));
  out.mass[k]=.5*(qa+qb)-.5*speed*(hb-ha);out.normal[k]=.5*(unA*qa+.5*G*ha*ha+unB*qb+.5*G*hb*hb)-.5*speed*(qb-qa);out.tangent[k]=.5*(unA*qtA+unB*qtB)-.5*speed*(qtB-qtA);
  out.left[k]=.5*G*(a.h*a.h-ha*ha);out.right[k]=.5*G*(b.h*b.h-hb*hb);out.speed[k]=speed;
}
function stepInto(input,output,c,time,work){
  const {n,dx,dz,dt}=c,X=work.x,Z=work.z;
  for(let j=0;j<n;j++)for(let i=0;i<=n;i++){
    const k=j*(n+1)+i,left=j*n+i-1,right=j*n+i,x=c.x0+i*dx,z=c.z0+(j+.5)*dz;
    face(i?readCell(input,c,left):ghost(input,c,right,0,x,z,time),i<n?readCell(input,c,right):ghost(input,c,left,1,x,z,time),0,X,k);
  }
  for(let j=0;j<=n;j++)for(let i=0;i<n;i++){
    const k=j*n+i,bottom=(j-1)*n+i,top=j*n+i,x=c.x0+(i+.5)*dx,z=c.z0+j*dz;
    face(j?readCell(input,c,bottom):ghost(input,c,top,2,x,z,time),j<n?readCell(input,c,top):ghost(input,c,bottom,3,x,z,time),1,Z,k);
  }
  let maxCFL=0,maxDepth=0,maxSpeed=0,minDepth=Infinity;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const k=j*n+i,L=j*(n+1)+i,R=L+1,B=j*n+i,T=B+n,localCFL=.5*dt*((X.speed[L]+X.speed[R])/dx+(Z.speed[B]+Z.speed[T])/dz);
    if(!Number.isFinite(localCFL)||localCFL>c.cfl*(1+64*Number.EPSILON))throw new RangeError('Shoreline step exceeds actual two-dimensional CFL; reduce the allocated microstep');maxCFL=Math.max(maxCFL,localCFL);
    const h=input.h[k]-dt/dx*(X.mass[R]-X.mass[L])-dt/dz*(Z.mass[T]-Z.mass[B]);
    let qx=input.qx[k]-dt/dx*(X.normal[R]+X.left[R]-X.normal[L]-X.right[L])-dt/dz*(Z.tangent[T]-Z.tangent[B]);
    let qz=input.qz[k]-dt/dx*(X.tangent[R]-X.tangent[L])-dt/dz*(Z.normal[T]+Z.left[T]-Z.normal[B]-Z.right[B]);
    if(![h,qx,qz].every(Number.isFinite)||h<0||h>1e4||Math.abs(qx)>1e8||Math.abs(qz)>1e8||(h===0&&(qx!==0||qz!==0)))throw new RangeError('Shoreline step produced invalid depth/momentum; no physical clamp was applied');
    if(h>0&&c.manning>0){const rate=G*c.manning*c.manning*Math.hypot(qx/h,qz/h)/(h**(4/3)),factor=1+rate*dt;qx/=factor;qz/=factor;}
    const wetness=h>c.wetDepth?1-(1-input.wetness[k])*Math.exp(-c.wettingRate*dt):input.wetness[k]*Math.exp(-dt/c.dryingSeconds);
    output.h[k]=h;output.qx[k]=qx;output.qz[k]=qz;output.wetness[k]=wetness;minDepth=Math.min(minDepth,h);maxDepth=Math.max(maxDepth,h);maxSpeed=Math.max(maxSpeed,h>0?Math.hypot(qx/h,qz/h):0);
  }
  let boundaryVolume=0;for(let j=0;j<n;j++)boundaryVolume+=dt*dz*(X.mass[j*(n+1)]-X.mass[j*(n+1)+n]);for(let i=0;i<n;i++)boundaryVolume+=dt*dx*(Z.mass[i]-Z.mass[n*n+i]);
  return{maxCFL,maxDepth,maxSpeed,minDepth,boundaryVolume};
}
function geometry(c){return{resolution:c.n,center:[...c.center],size:[...c.size],minimumXZ:[c.x0,c.z0],cellSize:[c.dx,c.dz]};}
function metadata(c){return{model:'shoreline-dynamics-v1',units:'h:m; qx/qz:m2/s; W:authored bed-contact fraction',grid:geometry(c),originTime:c.time,tickSeconds:c.tickSeconds,substepsPerTick:c.microSteps,microStepSeconds:c.dt,cflLimit:c.cfl,
  allocation:{...c.allocation},boundary:{kind:c.boundary,incidentEdges:sideNames.filter((s,i)=>c.driveEdges[i]),...c.incident.settings},wetDepthMetres:c.wetDepth,
  limitations:['Explicit independent candidate, not imported by the incumbent host.','Nonlinear depth-averaged hydrostatic model; no dispersive offshore waves, overturning, bubbles, reef roughness calibration or alongshore handoff outside this ROI.',
    ...c.incident.limits,'Numerical allocation budgets choose a fixed microstep, not physical h/u caps. Actual CFL or numeric failure rejects the private commit; no height/amplitude/velocity clamp.',
    'W is fixed-bed wet-contact memory, not a porous-sand or salinity simulation.','Same complete input/fence sequence is deterministic. Only complete origin-based ticks publish.']};}
function goalFor(target,c,committedTick,requestedTime){finite(target,'target');if(target<requestedTime-1e-10)throw new RangeError('Shoreline target cannot rewind');const goal=Math.floor((target-c.time+1e-10)/c.tickSeconds);if(!Number.isSafeInteger(goal)||goal<committedTick||!Number.isFinite(c.time+goal*c.tickSeconds))throw new RangeError('Unrepresentable shoreline tick target');return goal;}

/** CPU reference. All public field arrays are copies; committed state is private. */
export function createShorelineCPU(options={}){
  const c=configuration(options),work=workspace(c),buffers=[newFields(c),newFields(c)];let committed=c.fields,tick=0,revision=0,requestedTime=c.time,busy=false,disposed=false,lastFailure=null,lastSteps=0;
  const initialVolume=sum(committed.h)*c.dx*c.dz;let initialMax=0,initialMin=Infinity,initialSpeed=0;for(let i=0;i<c.count;i++){const h=committed.h[i];initialMax=Math.max(initialMax,h);initialMin=Math.min(initialMin,h);initialSpeed=Math.max(initialSpeed,h>0?Math.hypot(committed.qx[i]/h,committed.qz[i]/h):0);}let boundaryVolume=0,lastStats={maxCFL:0,maxDepth:initialMax,maxSpeed:initialSpeed,minDepth:initialMin};
  const clock=()=>c.time+tick*c.tickSeconds,enter=()=>{if(disposed)throw new Error('Shoreline CPU disposed');if(busy)throw new Error('Shoreline mutation in progress');busy=true;};
  function commitOne(){let input=committed,output=buffers[0],stats={maxCFL:0,maxDepth:0,maxSpeed:0,minDepth:Infinity,boundaryVolume:0};
    for(let micro=0;micro<c.microSteps;micro++){
      const s=stepInto(input,output,c,clock()+micro*c.dt,work);for(const k of ['maxCFL','maxDepth','maxSpeed'])stats[k]=Math.max(stats[k],s[k]);stats.minDepth=Math.min(stats.minDepth,s.minDepth);stats.boundaryVolume+=s.boundaryVolume;input=output;output=output===buffers[0]?buffers[1]:buffers[0];
    }
    const oldVolume=sum(committed.h)*c.dx*c.dz,newVolume=sum(input.h)*c.dx*c.dz,residual=newVolume-oldVolume-stats.boundaryVolume;
    if(!Number.isFinite(residual)||Math.abs(residual)>1e-9*Math.max(1,oldVolume))throw new RangeError('Shoreline commit volume closure failed');
    const old=committed;committed=input;const i=buffers.indexOf(input);buffers[i]=old;tick++;revision++;boundaryVolume+=stats.boundaryVolume;lastStats=stats;
  }
  const api={
    advanceFence(target){enter();try{const goal=goalFor(target,c,tick,requestedTime);requestedTime=target;lastSteps=0;lastFailure=null;while(tick<goal&&lastSteps<c.maxTicksPerAdvance){const end=c.time+(tick+1)*c.tickSeconds;try{commitOne();lastSteps++;}catch(error){lastFailure={requestedTime,committedTime:clock(),failedCommitEndTime:end,completedTicks:lastSteps,message:String(error.message||error)};throw error;}}
      return{time:clock(),requestedTime,completed:tick>=goal,steps:lastSteps,behindSeconds:Math.max(0,target-clock()),revision};
    }finally{busy=false;}},
    advanceTo(target){return api.advanceFence(target);},
    snapshot(){if(disposed)throw new Error('Shoreline CPU disposed');return{...metadata(c),time:clock(),requestedTime,tick,revision,bed:[...c.bed],h:[...committed.h],qx:[...committed.qx],qz:[...committed.qz],wetness:[...committed.wetness]};},
    diagnostics(){const volume=sum(committed.h)*c.dx*c.dz;return{...metadata(c),backend:'cpu-reference',time:clock(),requestedTime,tick,revision,busy,lastSteps,lastFailure:lastFailure?{...lastFailure}:null,
      ledger:{initialVolume,volume,boundaryVolume,residual:volume-initialVolume-boundaryVolume},state:{...lastStats},publicCells:c.count,maximumPrivateStateCells:3*c.count};},
    handoffData(){const out=new Float32Array(c.count*4);for(let i=0;i<c.count;i++){const h=committed.h[i],wet=h>c.wetDepth;out[i*4]=wet?h+c.bed[i]:0;out[i*4+1]=wet?committed.qx[i]/h:0;out[i*4+2]=wet?committed.qz[i]/h:0;out[i*4+3]=committed.wetness[i];}return{data:out,...geometry(c),time:clock(),channels:['eta','u','v','bedWetness'],note:'Later handoff replaces low-frequency surface; never stack this eta on its own incident swell.'};},
    dispose(){if(disposed)return;enter();try{disposed=true;}finally{busy=false;}},
  };return api;
}

/** Pure single-microstep reference for adversarial CFL/rotation/terrain tests. */
export function shorelineStep({terrainHeight,grid,physicalState,dt,time=0,...options}={}){
  const c=configuration({...options,boundaryStartTime:options.boundaryStartTime??0,terrainHeight,resolution:grid?.resolution,center:grid?.center,size:grid?.size,time,tickSeconds:dt,substepsPerTick:1,initialState:physicalState}),out=newFields(c),stats=stepInto(c.fields,out,c,time,workspace(c));return{...out,stats};
}

const fullscreenVertex=/*glsl*/`precision highp float;in vec3 position;void main(){gl_Position=vec4(position.xy,0.,1.);}`;
const stepFragment=/*glsl*/`
  precision highp float;precision highp int;
  uniform sampler2D uInput,uInputStats,uBed;
  uniform ivec2 uSize;uniform vec2 uMinimum,uCell;
  uniform float uDt,uSeaLevel,uManning,uWetDepth,uWettingRate,uDryingSeconds,uCflLimit,uBoundaryRamp;
  uniform bool uClosed,uResetStats;uniform bvec4 uDrive;
  uniform vec4 uWaves[64];
  layout(location=0) out vec4 stateOut;layout(location=1) out vec4 statsOut;
  const float g=9.81;
  struct Cell{float h;vec2 q;float b;};
  struct Flux{vec3 f;float left;float right;float speed;};
  Cell insideCell(ivec2 p){vec4 s=texelFetch(uInput,p,0);Cell a;a.h=s.r;a.q=s.gb;a.b=texelFetch(uBed,p,0).r;return a;}
  Cell ghostCell(ivec2 ref,int side,vec2 positionMetres){
    Cell a=insideCell(ref);vec2 n=side==0?vec2(-1,0):side==1?vec2(1,0):side==2?vec2(0,-1):vec2(0,1);float h0=max(0.,uSeaLevel-a.b);
    if(uClosed||h0==0.){a.q-=2.*dot(a.q,n)*n;return a;}
    vec2 u=a.h>0.?a.q/a.h:vec2(0),targetU=vec2(0);float eta=0.;
    if(uDrive[side])for(int k=0;k<64;k++){
      vec4 w=uWaves[k];vec2 d=normalize(w.xy);if(dot(d,n)>=0.)continue;
      float value=w.z*uBoundaryRamp*sin(dot(w.xy,positionMetres)+w.w);eta+=value;targetU+=value*sqrt(g/h0)*d;
    }
    float outgoing=dot(u,n)+2.*sqrt(g*a.h),incoming=dot(targetU,n)-2.*sqrt(g*max(0.,h0+eta));
    float un=(outgoing+incoming)*.5,c=max(0.,(outgoing-incoming)*.25);vec2 tangent=vec2(-n.y,n.x);
    float ut=un<0.?dot(targetU,tangent):dot(u,tangent);a.h=c*c/g;a.q=a.h*(un*n+ut*tangent);return a;
  }
  Flux flux(Cell a,Cell b,int axis){
    vec2 ua=a.h>0.?a.q/a.h:vec2(0),ub=b.h>0.?b.q/b.h:vec2(0);float z=max(a.b,b.b),ha=max(0.,a.h+a.b-z),hb=max(0.,b.h+b.b-z);
    float na=axis==0?ua.x:ua.y,nb=axis==0?ub.x:ub.y,ta=axis==0?ua.y:ua.x,tb=axis==0?ub.y:ub.x,qa=ha*na,qb=hb*nb,qta=ha*ta,qtb=hb*tb;
    Flux f;f.speed=max(abs(na)+sqrt(g*ha),abs(nb)+sqrt(g*hb));
    f.f=vec3(.5*(qa+qb)-.5*f.speed*(hb-ha),.5*(na*qa+.5*g*ha*ha+nb*qb+.5*g*hb*hb)-.5*f.speed*(qb-qa),.5*(na*qta+nb*qtb)-.5*f.speed*(qtb-qta));
    f.left=.5*g*(a.h*a.h-ha*ha);f.right=.5*g*(b.h*b.h-hb*hb);return f;
  }
  void main(){
    ivec2 p=ivec2(gl_FragCoord.xy);Cell a=insideCell(p);vec2 world=uMinimum+(vec2(p)+.5)*uCell;
    Cell l,r,b,t;
    if(p.x>0)l=insideCell(p-ivec2(1,0));else l=ghostCell(p,0,world-vec2(uCell.x*.5,0));
    if(p.x+1<uSize.x)r=insideCell(p+ivec2(1,0));else r=ghostCell(p,1,world+vec2(uCell.x*.5,0));
    if(p.y>0)b=insideCell(p-ivec2(0,1));else b=ghostCell(p,2,world-vec2(0,uCell.y*.5));
    if(p.y+1<uSize.y)t=insideCell(p+ivec2(0,1));else t=ghostCell(p,3,world+vec2(0,uCell.y*.5));
    Flux L=flux(l,a,0),R=flux(a,r,0),B=flux(b,a,1),T=flux(a,t,1);
    float localCfl=.5*uDt*((L.speed+R.speed)/uCell.x+(B.speed+T.speed)/uCell.y);
    float h=a.h-uDt/uCell.x*(R.f.x-L.f.x)-uDt/uCell.y*(T.f.x-B.f.x);
    vec2 q=a.q-vec2(uDt/uCell.x*(R.f.y+R.left-L.f.y-L.right)+uDt/uCell.y*(T.f.z-B.f.z),uDt/uCell.x*(R.f.z-L.f.z)+uDt/uCell.y*(T.f.y+T.left-B.f.y-B.right));
    vec4 previous=uResetStats?vec4(0):texelFetch(uInputStats,p,0);
    bool bad=previous.r>.5||any(isnan(vec4(h,q,localCfl)))||any(isinf(vec4(h,q,localCfl)))||h<0.||h>10000.||any(greaterThan(abs(q),vec2(1.e8)))||localCfl>uCflLimit*(1.+2.e-6)||(h==0.&&any(notEqual(q,vec2(0))));
    if(bad){stateOut=texelFetch(uInput,p,0);statsOut=vec4(1.,previous.g,0.,max(previous.a,localCfl));return;}
    if(h>0.&&uManning>0.)q/=1.+g*uManning*uManning*length(q/h)*uDt/pow(h,4./3.);
    float oldWet=texelFetch(uInput,p,0).a,wet=h>uWetDepth?1.-(1.-oldWet)*exp(-uWettingRate*uDt):oldWet*exp(-uDt/uDryingSeconds);
    float boundaryVolume=0.;if(p.x==0)boundaryVolume+=uDt*uCell.y*L.f.x;if(p.x+1==uSize.x)boundaryVolume-=uDt*uCell.y*R.f.x;if(p.y==0)boundaryVolume+=uDt*uCell.x*B.f.x;if(p.y+1==uSize.y)boundaryVolume-=uDt*uCell.x*T.f.x;
    stateOut=vec4(h,q,wet);statsOut=vec4(0.,previous.g+boundaryVolume,0.,max(previous.a,localCfl));
  }
`;

/** WebGL2 candidate. GPU publication is async at the API boundary, but G1 uses
 * one synchronous1x1 validation readback per complete tick. Its stalls/pass cost
 * are deliberately exposed; this is not a60fps/performance-approved backend.
 * C plus two work MRTs are independent, so failed stages never overwrite C.
 */
export function createShorelineGPU(THREE,renderer,options={}){
  const c=configuration(options),gl=renderer.getContext();
  if(typeof gl.drawBuffers!=='function'||!renderer.extensions.has('EXT_color_buffer_float')||gl.getParameter(gl.MAX_DRAW_BUFFERS)<2)throw new Error('Shoreline GPU requires WebGL2 RGBA32F MRT support');
  const targets=[],materials=[],ownedTextures=[],reduction=[];let disposed=false,busy=false,tick=0,revision=0,requestedTime=c.time,lastFailure=null,lastSteps=0,totalPasses=0,lastPasses=0,validationReads=0;
  const initialVolume=sum(c.fields.h)*c.dx*c.dz;let currentVolume=initialVolume,boundaryVolume=0,lastCfl=0,committed=null,buffers=null;
  const makeTarget=(n,count=1)=>{const t=new THREE.WebGLRenderTarget(n,n,{type:THREE.FloatType,format:THREE.RGBAFormat,count,depthBuffer:false,stencilBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false});for(const tex of t.textures){tex.colorSpace=THREE.NoColorSpace;tex.generateMipmaps=false;}targets.push(t);return t;};
  const dataTexture=(data,format)=>{const t=new THREE.DataTexture(data,c.n,c.n,format,THREE.FloatType);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.colorSpace=THREE.NoColorSpace;t.needsUpdate=true;ownedTextures.push(t);return t;};
  const raw=(name,fragmentShader,uniforms)=>{const m=new THREE.RawShaderMaterial({name,glslVersion:THREE.GLSL3,uniforms,vertexShader:fullscreenVertex,fragmentShader,depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});materials.push(m);return m;};
  const bedTexture=dataTexture(Float32Array.from(c.bed),THREE.RedFormat),initialData=new Float32Array(c.count*4);for(let i=0;i<c.count;i++){initialData[i*4]=c.fields.h[i];initialData[i*4+1]=c.fields.qx[i];initialData[i*4+2]=c.fields.qz[i];initialData[i*4+3]=c.fields.wetness[i];}
  const initialTexture=dataTexture(initialData,THREE.RGBAFormat),waveUniforms=SHORELINE_SWELL_MODES.map(w=>new THREE.Vector4(w.kx,w.kz,w.amplitude*c.incident.gain,w.phase));
  const uniforms={uInput:{value:null},uInputStats:{value:null},uBed:{value:bedTexture},uSize:{value:new THREE.Vector2(c.n,c.n)},uMinimum:{value:new THREE.Vector2(c.x0,c.z0)},uCell:{value:new THREE.Vector2(c.dx,c.dz)},
    uDt:{value:c.dt},uSeaLevel:{value:c.seaLevel},uManning:{value:c.manning},uWetDepth:{value:c.wetDepth},uWettingRate:{value:c.wettingRate},uDryingSeconds:{value:c.dryingSeconds},uCflLimit:{value:c.cfl},uBoundaryRamp:{value:0},uClosed:{value:c.boundary==='closed'},uResetStats:{value:true},uDrive:{value:c.driveEdges.map(Number)},uWaves:{value:waveUniforms}};
  const stepMaterial=raw('G1 conservative shoreline wet/dry step',stepFragment,uniforms);
  const initMaterial=raw('G1 shoreline complete-state initialization',`precision highp float;uniform sampler2D uInitial;layout(location=0)out vec4 stateOut;layout(location=1)out vec4 statsOut;void main(){stateOut=texelFetch(uInitial,ivec2(gl_FragCoord.xy),0);statsOut=vec4(0.,1.,0.,1.);}`,{uInitial:{value:initialTexture}});
  const reduceMaterial=raw('G1 shoreline validity/volume reduction',`precision highp float;precision highp int;uniform sampler2D uState,uStats;uniform ivec2 uInputSize;uniform bool uFirst;uniform float uCellArea;out vec4 outValue;void main(){ivec2 base=ivec2(gl_FragCoord.xy)*2;vec4 value=vec4(0);for(int j=0;j<2;j++)for(int i=0;i<2;i++){ivec2 p=base+ivec2(i,j);if(any(greaterThanEqual(p,uInputSize)))continue;vec4 s=texelFetch(uStats,p,0),v=uFirst?vec4(s.r,s.a,texelFetch(uState,p,0).r*uCellArea,s.g):s;value.xy=max(value.xy,v.xy);value.zw+=v.zw;}outValue=value;}`,
    {uState:{value:null},uStats:{value:null},uInputSize:{value:new THREE.Vector2()},uFirst:{value:true},uCellArea:{value:c.dx*c.dz}});
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1),quadGeometry=new THREE.PlaneGeometry(2,2),quad=new THREE.Mesh(quadGeometry,stepMaterial);quad.frustumCulled=false;scene.add(quad);
  // Read-only accessors preserve Uniform identity without fallible externally
  // replaceable setters at the physical publication boundary.
  const uniform=get=>Object.freeze(Object.defineProperty({},'value',{get,enumerable:true,configurable:false}));
  const publicUniforms=Object.freeze({uShoreState:uniform(()=>committed?.textures[0]??null),uShoreBed:uniform(()=>bedTexture),uShoreMinimum:uniform(()=>minimumUniform),uShoreSize:uniform(()=>sizeUniform),uShoreCommittedTime:uniform(()=>c.time+tick*c.tickSeconds)});
  const minimumUniform=new THREE.Vector2(c.x0,c.z0),sizeUniform=new THREE.Vector2(...c.size);
  function preserve(fn){
    const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),test=renderer.getScissorTest(),actualViewport=renderer.getCurrentViewport(new THREE.Vector4()),actualScissor=Array.from(gl.getParameter(gl.SCISSOR_BOX)),actualTest=gl.isEnabled(gl.SCISSOR_TEST),drawFramebuffer=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),readFramebuffer=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),auto=renderer.autoClear,xr=renderer.xr.enabled,shadowAuto=renderer.shadowMap.autoUpdate,shadowDirty=renderer.shadowMap.needsUpdate;
    if(targets.includes(target))throw new Error('Release the borrowed shoreline target before advancing');
    try{renderer.autoClear=false;renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.setScissorTest(false);return fn();}
    finally{renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(test);if(target){const v=target.viewport.clone(),s=target.scissor.clone(),st=target.scissorTest;target.viewport.copy(actualViewport);target.scissor.fromArray(actualScissor);target.scissorTest=actualTest;renderer.setRenderTarget(target,face,mip);target.viewport.copy(v);target.scissor.copy(s);target.scissorTest=st;}else renderer.setRenderTarget(null,face,mip);renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER,drawFramebuffer);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,drawFramebuffer);renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER,readFramebuffer);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,readFramebuffer);renderer.autoClear=auto;renderer.xr.enabled=xr;renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowDirty;}
  }
  function draw(material,target){quad.material=material;renderer.setRenderTarget(target);renderer.render(scene,camera);totalPasses++;lastPasses++;}
  function reduce(target){let state=target.textures[0],stats=target.textures[1],n=c.n;for(let level=0;level<reduction.length;level++){
    const u=reduceMaterial.uniforms;u.uState.value=state;u.uStats.value=stats;u.uInputSize.value.set(n,n);u.uFirst.value=level===0;draw(reduceMaterial,reduction[level]);stats=reduction[level].texture;n=reduction[level].width;
  }const result=new Float32Array(4);renderer.readRenderTargetPixels(reduction.at(-1),0,0,1,1,result);validationReads++;return result;}
  function cleanup(){targets.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());ownedTextures.forEach(t=>t.dispose());quadGeometry.dispose();}
  try{
    committed=makeTarget(c.n,2);buffers=[makeTarget(c.n,2),makeTarget(c.n,2)];let n=c.n;while(n>1){n=Math.ceil(n/2);reduction.push(makeTarget(n));}
    preserve(()=>{draw(initMaterial,committed);const r=reduce(committed);if(r[0]!==0||r[1]!==1||r[3]!==c.count||!Number.isFinite(r[2])||Math.abs(r[2]-initialVolume)>5e-5*Math.max(1,initialVolume))throw new Error('Shoreline GPU initialization/readback not verified');currentVolume=r[2];});
    initMaterial.uniforms.uInitial.value=null;initialTexture.dispose();initialTexture.image.data=null;ownedTextures.splice(ownedTextures.indexOf(initialTexture),1);c.fields=null;
  }catch(error){cleanup();disposed=true;throw error;}
  const clock=()=>c.time+tick*c.tickSeconds,enter=()=>{if(disposed)throw new Error('Shoreline GPU disposed');if(busy)throw new Error('Shoreline GPU mutation in progress');busy=true;};
  async function commitOne(){let input=committed,output=buffers[0],result;
    preserve(()=>{
      for(let micro=0;micro<c.microSteps;micro++){
        const physicalTime=clock()+micro*c.dt,phases=c.incident.phases(physicalTime);phases.forEach((phase,i)=>waveUniforms[i].w=phase);uniforms.uBoundaryRamp.value=c.incident.ramp(physicalTime);uniforms.uInput.value=input.textures[0];uniforms.uInputStats.value=input.textures[1];uniforms.uResetStats.value=micro===0;draw(stepMaterial,output);input=output;output=output===buffers[0]?buffers[1]:buffers[0];
      }
      result=reduce(input);
    });
    const [bad,cflMax,volume,flow]=result,residual=volume-currentVolume-flow,tolerance=5e-5*Math.max(1,currentVolume)+1e-5;
    if(!Array.from(result).every(Number.isFinite)||bad!==0||cflMax>c.cfl*(1+2e-6)||Math.abs(residual)>tolerance)throw new RangeError('Shoreline GPU private commit failed validity/CFL/volume validation');
    const old=committed;committed=input;buffers[buffers.indexOf(input)]=old;currentVolume=volume;boundaryVolume+=flow;lastCfl=cflMax;tick++;revision++;
  }
  const api={uniforms:publicUniforms,
    async advanceFence(target){enter();try{const goal=goalFor(target,c,tick,requestedTime);requestedTime=target;lastSteps=0;lastPasses=0;lastFailure=null;while(tick<goal&&lastSteps<c.maxTicksPerAdvance){const end=c.time+(tick+1)*c.tickSeconds;try{await commitOne();lastSteps++;}catch(error){lastFailure={requestedTime,committedTime:clock(),failedCommitEndTime:end,completedTicks:lastSteps,message:String(error.message||error)};throw error;}}
      return{time:clock(),requestedTime,completed:tick>=goal,steps:lastSteps,behindSeconds:Math.max(0,target-clock()),revision};
    }finally{busy=false;}},
    advanceTo(target){return api.advanceFence(target);},
    snapshot({readback=false}={}){if(disposed)throw new Error('Shoreline GPU disposed');const value={...metadata(c),time:clock(),requestedTime,tick,revision,borrowedTexture:true,texture:committed.textures[0]};if(readback){const data=new Float32Array(c.count*4);preserve(()=>renderer.readRenderTargetPixels(committed,0,0,c.n,c.n,data,undefined,0));value.data=data;value.bed=Float32Array.from(c.bed);}return value;},
    diagnostics(){return{...metadata(c),backend:'webgl2-g1',time:clock(),requestedTime,tick,revision,busy,lastSteps,lastFailure:lastFailure?{...lastFailure}:null,ledger:{initialVolume,volume:currentVolume,boundaryVolume,residual:currentVolume-initialVolume-boundaryVolume},state:{maxCFL:lastCfl},passes:{total:totalPasses,lastAdvance:lastPasses,reductionLevels:reduction.length,validationReads},memory:{stateMRTs:3,stateBytes:3*c.count*4*4,validationBytes:3*c.count*4*4,reductionBytes:reduction.reduce((s,t)=>s+t.width*t.height*16,0)},validation:'G1 synchronous1x1 Float32 validity/CFL/volume read per fixed commit; async API does not hide this stall. GPU/FPS not accepted.'};},
    dispose(){if(disposed)return;enter();try{disposed=true;cleanup();}finally{busy=false;}},
  };return api;
}
