// Pinned math extraction from legacy state67fa, through thermalFactors only.
// Deliberate validation delta: fixed-length indexed snapshots ignore arbitrary
// user iterators, bound reads and validate every copied component. See R12 QA.
// Legacy factory/file remains unchanged; no runtime source reading or eval.
import {PYRO_SMOKE_LIMITS} from './pyro-smoke-state.js';
import {validateDispersionMemory} from './pyro-smoke-dispersion.js';
const PI=Math.PI,GAUSS3=(2*PI)**1.5,EPS=Number.EPSILON;
const fail=(message,Type=RangeError)=>{throw new Type(message);};
const finite=(v,name,limit=Infinity)=>{if(!Number.isFinite(v)||Math.abs(v)>limit)fail(`${name} must be finite within ±${limit}`);return v;};
function indexedSnapshot(value,count,name){
  // Supported inputs are arrays, typed arrays and fixed-length indexed array-
  // likes. Length and each indexed component are read once; iterables are not
  // consumed, so a custom/infinite iterator cannot change size or allocation.
  if(!value||value.length!==count)fail(`${name} requires ${count} indexed components`,TypeError);
  const copy=Array(count);for(let i=0;i<count;i++)copy[i]=value[i];return copy;
}
const vec=(v,name,limit=Infinity)=>indexedSnapshot(v,3,name).map((x,i)=>finite(x,`${name}[${i}]`,limit));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],norm=v=>Math.hypot(...v);
const safeId=(v,name)=>{if(typeof v!=='string'||!v.length||v.length>128)fail(`${name} must be a nonempty string of at most128 characters`,TypeError);return v;};
const positive=(v,name,limit=Infinity)=>{finite(v,name,limit);if(!(v>0))fail(`${name} must be positive`);return v;};
function covariance(value){
  const c=indexedSnapshot(value,9,'covariance').map((v,i)=>finite(v,`covariance[${i}]`,PYRO_SMOKE_LIMITS.covarianceElement)),scale=Math.max(c[0],c[4],c[8]);
  if(!(scale>0))fail('covariance must be positive definite');
  for(const [a,b]of [[1,3],[2,6],[5,7]]){if(Math.abs(c[a]-c[b])>64*EPS*scale)fail('covariance must be symmetric');c[a]=c[b]=(c[a]+c[b])*.5;}
  const L=Array(9).fill(0);
  for(let i=0;i<3;i++)for(let j=0;j<=i;j++){
    let s=c[i*3+j];for(let k=0;k<j;k++)s-=L[i*3+k]*L[j*3+k];
    if(i===j){if(!(s>=PYRO_SMOKE_LIMITS.minimumCholeskyVariance))fail('covariance must be SPD with Cholesky variances>=1e-24 m2 in the published numeric domain');L[i*3+j]=Math.sqrt(s);}else L[i*3+j]=s/L[j*3+j];
  }
  const determinantRoot=L[0]*L[4]*L[8];if(!(determinantRoot>0)||!Number.isFinite(determinantRoot))fail('covariance determinant exceeds numeric range');
  return {covariance:c,L,determinantRoot};
}
const whiten=(L,v)=>{const x=v[0]/L[0],y=(v[1]-L[3]*x)/L[4];return[x,y,(v[2]-L[6]*x-L[7]*y)/L[8]];};
function kernel(p){
  if(p._dirty){Object.assign(p,covariance(p.covariance));p._normalization=p.mass/(GAUSS3*p.determinantRoot);positive(p._normalization,'Gaussian normalization');p._dirty=false;}
  return p;
}
const densityAt=(p,x)=>{kernel(p);const q=whiten(p.L,x.map((v,i)=>v-p.mean[i]));return p._normalization*Math.exp(-.5*dot(q,q));};
// Abramowitz-Stegun7.1.26 erfc approximation (~1.5e-7 absolute erf error).
// Use erfc differences on same-sign intervals to avoid subtracting near1.
function erfcPositive(x){if(x===Infinity)return 0;const t=1/(1+.3275911*x);return (((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);}
function erfDifference(a,b){
  if(a===b)return 0;
  // Short intervals use a two-node Gauss integral of erf', avoiding the
  // nonzero erf(0) approximation and cancellation in nearly equal tails.
  const width=b-a;if(Number.isFinite(width)&&width<1e-3/(1+Math.max(Math.abs(a),Math.abs(b)))){const h=width*.5,m=a+h,q=h/Math.sqrt(3);return 2/Math.sqrt(PI)*h*(Math.exp(-((m-q)**2))+Math.exp(-((m+q)**2)));}
  if(a>=0)return erfcPositive(a)-erfcPositive(b);if(b<=0)return erfcPositive(-b)-erfcPositive(-a);return(1-erfcPositive(-a))+(1-erfcPositive(b));
}
function columnAt(p,o,d,start,end){
  if(start===end)return 0;kernel(p);
  const q=whiten(p.L,o.map((v,i)=>v-p.mean[i])),v=whiten(p.L,d),A=dot(v,v),b=dot(q,v)/A,s=Math.sqrt(A*.5),perp=q.map((x,i)=>x-v[i]*b);
  const out=p._normalization*Math.exp(-.5*dot(perp,perp))*Math.sqrt(PI/(2*A))*erfDifference(s*(start+b),s*(end+b));
  if(!Number.isFinite(out)||out<0)fail('Gaussian column exceeded numeric range');return out;
}
function publicPacket(p){return {id:p.id,sourceId:p.sourceId,profileId:p.profileId,birthTime:p.birthTime,mass:p.mass,mean:[...p.mean],covariance:[...p.covariance],temperatureExcessK:p.temperatureExcessK,buoyantVelocity:p.buoyantVelocity,sourceCount:p.sourceCount,...(p.dispersionQ===undefined?{}:{dispersionQ:p.dispersionQ})};}
function sumMass(packets){let sum=0,c=0;for(const p of packets){const y=p.mass-c,t=sum+y;c=(t-sum)-y;sum=t;}return sum;}
function mergePair(a,b,id){
  if(a.profileId!==b.profileId)fail('Cross-profile merges are not permitted');
  const mass=a.mass+b.mass;positive(mass,'merged relative mass',PYRO_SMOKE_LIMITS.referenceMass);
  const wb=b.mass/mass,wa=a.mass/mass,delta=b.mean.map((v,i)=>v-a.mean[i]),mean=a.mean.map((v,i)=>v+wb*delta[i]),c=Array(9);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)c[i*3+j]=wa*a.covariance[i*3+j]+wb*b.covariance[i*3+j]+wa*wb*delta[i]*delta[j];
  const p={id,sourceId:a.sourceId===b.sourceId?a.sourceId:null,profileId:a.profileId,birthTime:Math.min(a.birthTime,b.birthTime),mass,mean,covariance:c,temperatureExcessK:wa*a.temperatureExcessK+wb*b.temperatureExcessK,buoyantVelocity:wa*a.buoyantVelocity+wb*b.buoyantVelocity,sourceCount:a.sourceCount+b.sourceCount,_dirty:true};
  if(a.dispersionQ!==undefined){if(b.dispersionQ===undefined)fail('Cannot merge mixed dispersion models');p.dispersionQ=validateDispersionMemory(a.dispersionQ+wb*(b.dispersionQ-a.dispersionQ));}
  kernel(p);return p;
}
const RAY_DIRECTIONS=Object.freeze([[1,0,0],[0,1,0],[0,0,1],...Array.from({length:9},(_,i)=>{const y=1-2*(i+.5)/9,a=i*2.399963229728653,r=Math.sqrt(1-y*y);return[r*Math.cos(a),y,r*Math.sin(a)];})]);
function mergeDiagnostics(a,b,m,profile,{coolSeconds,dragSeconds,ambientKelvin}){
  const delta=b.mean.map((v,i)=>v-a.mean[i]),distance=norm(delta),combined=covariance(a.covariance.map((v,i)=>v+b.covariance[i])),q=whiten(combined.L,delta),normalizedDistance=norm(q);
  const points=[a.mean,b.mean,m.mean];for(const p of [a,b])for(let c=0;c<3;c++)for(const sign of [-1,1]){const v=[...p.mean];v[c]+=sign*Math.sqrt(p.covariance[c*3+c]);points.push(v);}
  let peakError=0,peakReference=0,maximumSampledNewDensity=0;
  for(const x of points){const before=densityAt(a,x)+densityAt(b,x),after=densityAt(m,x);peakError=Math.max(peakError,Math.abs(after-before));peakReference=Math.max(peakReference,before);maximumSampledNewDensity=Math.max(maximumSampledNewDensity,after);}
  const extent=distance+6*Math.sqrt(Math.max(...[a,b,m].flatMap(p=>[p.covariance[0],p.covariance[4],p.covariance[8]])));let colError=0,colReference=0,relativePerRay=0;
  for(const centre of [a.mean,b.mean,m.mean])for(const d of RAY_DIRECTIONS){const o=centre.map((v,i)=>v-d[i]*extent),before=columnAt(a,o,d,0,extent*2)+columnAt(b,o,d,0,extent*2),after=columnAt(m,o,d,0,extent*2),error=Math.abs(after-before);colError=Math.max(colError,error);colReference=Math.max(colReference,before);relativePerRay=Math.max(relativePerRay,2*error/Math.max(before+after,1e-300));}
  const k=Math.max(...profile.extinctionPerMassRGB);
  const differentialThermalTravelBoundMetres=dragSeconds*Math.abs(a.buoyantVelocity-b.buoyantVelocity)+9.81/ambientKelvin*dragSeconds*coolSeconds*Math.abs(a.temperatureExcessK-b.temperatureExcessK),normalizedThermalTravelBound=differentialThermalTravelBoundMetres/Math.sqrt(a.covariance[4]+b.covariance[4]);
  return {distanceMetres:distance,normalizedDistance,differentialThermalTravelBoundMetres,normalizedThermalTravelBound,sampledPeakAbsoluteError:peakError,sampledPeakRelativeError:peakError/Math.max(peakReference,1e-300),maximumSampledNewDensity,sampledColumnAbsoluteError:colError,sampledColumnRelativeError:colError/Math.max(colReference,1e-300),maximumPerRaySymmetricRelativeError:relativePerRay,sampledOpticalDepthRGBAbsoluteError:profile.extinctionPerMassRGB.map(v=>v*colError),sampledMaximumOpticalDepthError:k*colError,peakSamples:points.length,columnRays:36,limits:'15 spatial points and36 finite rays; sampled errors, NOT global peak/column/source bounds. Spatial moments are preserved at merge time, not future heterogeneous thermal evolution.'};
}
function thermalFactors(dt,coolSeconds,dragSeconds,ambientKelvin){
  const a=1/coolSeconds,b=1/dragSeconds,ea=Math.exp(-a*dt),eb=Math.exp(-b*dt),Aa=-Math.expm1(-a*dt)/a,Ab=-Math.expm1(-b*dt)/b,c=9.81/ambientKelvin;
  if(Math.abs(a-b)<1e-10)return {ea,eb,Ab,velocityPerK:c*dt*eb,positionPerK:c*(Ab-dt*eb)/b};
  return {ea,eb,Ab,velocityPerK:c*(ea-eb)/(b-a),positionPerK:c*(Aa-Ab)/(b-a)};
}

export {finite,vec,safeId,positive,covariance,kernel,densityAt,columnAt,publicPacket,sumMass,mergePair,mergeDiagnostics,thermalFactors};
