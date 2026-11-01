// Pure source-only exposure helpers. No simulation advance, renderer, storage
// exposure, camera exposure or smoke/transmission query is performed here.
const finite=(value,name)=>{if(typeof value!=='number'||!Number.isFinite(value))throw new RangeError(name+' must be finite');return value;};
const positive=(value,name)=>{finite(value,name);if(!(value>0))throw new RangeError(name+' must be positive');return value;};
const integer=(value,lo,hi,name)=>{if(!Number.isSafeInteger(value)||value<lo||value>hi)throw new RangeError(name+' requires an integer in '+lo+'..'+hi);return value;};
const vector=(value,name)=>{const a=value?.toArray?value.toArray():value;if(!a||a.length!==3)throw new TypeError(name+' requires three components');return Array.from({length:3},(_,i)=>finite(a[i],name+' component'));};
const colourVector=(value,name)=>{const a=vector(value,name);if(a.some(v=>v<0))throw new RangeError(name+' must be nonnegative');return a;};

export function resolveFireworkExposure({physicalNow,shutterSeconds=1/120}={}){
  finite(physicalNow,'Physical now');finite(shutterSeconds,'Shutter seconds');
  if(shutterSeconds<0||shutterSeconds>1)throw new RangeError('Shutter seconds requires0..1');
  const from=physicalNow-shutterSeconds,to=physicalNow,anchor=physicalNow-shutterSeconds*.5,durationSeconds=to-from;
  if(!Number.isFinite(from)||!Number.isFinite(anchor)||(shutterSeconds>0&&!(durationSeconds>0)))throw new RangeError('Positive shutter is not representable at this physical time');
  return Object.freeze({physicalNow,shutterSeconds,from,to,anchor,durationSeconds,mode:'causal-end',units:'physical seconds; requested shutter may differ from represented endpoint width'});
}

// Positive local exponential moments on a unit interval. In particular, this
// never subtracts two nearly equal cumulative emitted-energy prefixes.
function exponentialMoments(z){
  if(z<1e-3){
    const p0=1+z*(-.5+z*(1/6+z*(-1/24+z*(1/120+z*(-1/720+z/5040)))));
    const p1=.5+z*(-1/3+z*(1/8+z*(-1/30+z*(1/144+z*(-1/840+z/5760)))));
    return [p0,p1];
  }
  const p0=-Math.expm1(-z)/z,p1=(p0-Math.exp(-z))/z;
  return [p0,p1];
}

export function sampleFixedReleaseEmberWindow(
  {releaseTime,sourceIntensity,duration,colourAtAge,colourSegments=1,allPhaseColourMaximum:providedMaximum}={},
  {fromTime,toTime,outRGB,bins=8}={}
){
  finite(releaseTime,'Release time');finite(sourceIntensity,'Release source intensity');positive(duration,'Ember duration');
  if(sourceIntensity<0)throw new RangeError('Release source intensity must be nonnegative');
  if(typeof colourAtAge!=='function'||colourAtAge.constructor?.name==='AsyncFunction')throw new TypeError('colourAtAge must be a synchronous unit-Y RGB callback');
  integer(colourSegments,1,256,'Colour segments');integer(bins,1,64,'RGB bins');finite(fromTime,'Exposure start');finite(toTime,'Exposure end');
  const width=toTime-fromTime;
  if(toTime<fromTime||!Number.isFinite(width))throw new RangeError('Exposure window must have a finite nonnegative width');
  if(width>0&&!(width/bins>0))throw new RangeError('Exposure bin width is not representable');
  const target=outRGB??new Float64Array(bins*3);
  if(!(Array.isArray(target)||target instanceof Float32Array||target instanceof Float64Array)||target.length<bins*3)throw new TypeError('outRGB requires a sufficiently large floating array');
  const maximum=providedMaximum===undefined?[0,0,0]:colourVector(providedMaximum,'All-phase colour maximum'),knots=new Map();
  function node(index){
    if(knots.has(index))return knots.get(index);
    const age=duration*(index/colourSegments),rgb=colourVector(colourAtAge(age),'Ember colour');
    const Y=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    if(Math.abs(Y-1)>1e-6)throw new RangeError('Ember colour must have unit photopic Y; sourceIntensity already contains I');
    if(providedMaximum===undefined){for(let c=0;c<3;c++)maximum[c]=Math.max(maximum[c],rgb[c]);}
    else if(rgb.some((v,c)=>v>maximum[c]+Math.max(1,maximum[c])*1e-12))throw new RangeError('Visited colour exceeds the supplied all-phase maximum');
    knots.set(index,rgb);return rgb;
  }
  // Piecewise-linear colour extrema are at the endpoints. A caller with a
  // validated shared LUT bound may supply it and avoid this full node scan.
  if(providedMaximum===undefined)for(let j=0;j<=colourSegments;j++)node(j);
  const values=new Float64Array(bins*3),averageRGB=[0,0,0],relativeStart=fromTime-releaseTime;
  let overlaps=0;
  if(sourceIntensity>0&&relativeStart<=duration&&(toTime-releaseTime)>=0){
    if(width===0){
      if(relativeStart>=0&&relativeStart<=duration){
        const s=relativeStart/duration*colourSegments,j=Math.min(colourSegments-1,Math.floor(s)),u=s-j,a=node(j),b=node(j+1),gain=sourceIntensity*Math.exp(-3.5*(relativeStart/duration));
        for(let c=0;c<3;c++){const value=gain*(a[c]*(1-u)+b[c]*u);for(let i=0;i<bins;i++)values[i*3+c]=value;}
      }
    }else{
      const binWidth=width/bins;
      for(let i=0;i<bins;i++){
        const binFrom=width*(i/bins),binTo=width*((i+1)/bins),sum=[0,0,0],correction=[0,0,0];
        // Include one neighbour on each side of the estimated indices. Exact
        // overlap clipping below owns inclusion; this only avoids a full LUT
        // scan for every narrow bin, including at rounded knot boundaries.
        const indexAt=offset=>Math.max(0,Math.min(colourSegments,(relativeStart+offset)/duration*colourSegments));
        const first=Math.max(0,Math.floor(indexAt(binFrom))-1),last=Math.min(colourSegments-1,Math.floor(indexAt(binTo))+1);
        for(let j=first;j<=last;j++){
          const segmentFrom=duration*(j/colourSegments),segmentTo=duration*((j+1)/colourSegments),segmentWidth=segmentTo-segmentFrom;
          if(!(segmentWidth>0))throw new RangeError('Colour segment width is not representable');
          // Offsets stay relative to the exposure START. Constructing every
          // absolute time would collapse narrow bins at large physical clocks.
          const lo=Math.max(binFrom,-relativeStart,segmentFrom-relativeStart),hi=Math.min(binTo,duration-relativeStart,segmentTo-relativeStart),h=hi-lo;
          if(!(h>0))continue;
          const a=node(j),b=node(j+1),u0=Math.max(0,Math.min(1,((relativeStart-segmentFrom)+lo)/segmentWidth)),u1=Math.max(0,Math.min(1,u0+h/segmentWidth));
          const age=Math.max(0,Math.min(duration,relativeStart+lo)),z=3.5*(h/duration),[p0,p1]=exponentialMoments(z),gain=Math.exp(-3.5*(age/duration))*(h/binWidth);
          for(let c=0;c<3;c++){
            const ca=a[c]*(1-u0)+b[c]*u0,cb=a[c]*(1-u1)+b[c]*u1;
            const contribution=gain*((p0-p1)*ca+p1*cb),value=contribution-correction[c],next=sum[c]+value;correction[c]=(next-sum[c])-value;sum[c]=next;
          }
          overlaps++;
        }
        for(let c=0;c<3;c++)values[i*3+c]=sum[c]*sourceIntensity;
      }
    }
  }
  for(let c=0;c<3;c++){
    let sum=0,correction=0;
    for(let i=0;i<bins;i++){const value=values[i*3+c]/bins-correction,next=sum+value;correction=(next-sum)-value;sum=next;}
    averageRGB[c]=sum;
  }
  // Finish validation before touching a borrowed upload array.
  if(values.some(v=>!Number.isFinite(v)||v<0)||averageRGB.some(v=>!Number.isFinite(v)||v<0)||target instanceof Float32Array&&values.some(v=>!Number.isFinite(Math.fround(v))))throw new RangeError('Exposure RGB exceeds the finite output domain');
  for(let i=0;i<values.length;i++)target[i]=values[i];
  return {rgbBins:target,bins,averageRGB,allPhaseColourMaximum:maximum.slice(),releaseTime,sourceIntensity,duration,fromTime,toTime,durationSeconds:width,
    colourSegments,colourNodesEvaluated:knots.size,segmentOverlaps:overlaps,colourMaximumPolicy:providedMaximum===undefined?'all piecewise-linear endpoint maxima':'caller-provided all-phase bound; visited nodes checked',
    units:'reference-cd weighted unit-Y linear RGB; sourceIntensity already includes release allocation',
    limits:'Fixed-release discrete ember; no continuous release-grid history, trajectory, spatial PSF, transmission, receiver exposure or camera motion integral'};
}

export function sampleCausalOpticalAnchor({birth,physicalNow,shutterSeconds=1/120,sampleAt}={}){
  finite(birth,'Kinematic birth');if(typeof sampleAt!=='function'||sampleAt.constructor?.name==='AsyncFunction')throw new TypeError('sampleAt must be a synchronous past-state callback');
  const exposure=resolveFireworkExposure({physicalNow,shutterSeconds});
  if(birth>physicalNow)return null;
  const sampledTime=Math.max(birth,exposure.anchor);
  if(sampledTime>physicalNow)throw new RangeError('Optical anchor cannot sample a future state');
  const state=sampleAt(sampledTime);
  if(state?.then)throw new TypeError('Optical anchor sampling must be synchronous');
  const position=vector(state?.position,'Sampled position'),velocity=vector(state?.velocity,'Sampled velocity'),virtualBirthAnchor=exposure.anchor<birth,virtualOffsetSeconds=exposure.anchor-sampledTime;
  if(virtualBirthAnchor)for(let c=0;c<3;c++)position[c]+=velocity[c]*virtualOffsetSeconds;
  if(position.some(v=>!Number.isFinite(v)))throw new RangeError('Virtual raster anchor exceeds finite coordinates');
  return {position,velocity,exposure,sampledTime,virtualBirthAnchor,virtualOffsetSeconds,
    positionPolicy:virtualBirthAnchor?'Linear backward extension of birth pose for raster reference only; not a physical pre-birth state':'Actual sampled past midpoint pose',
    limits:'Source-only raster anchor; no past camera, nonlinear-motion, depth/occlusion or transmission integration'};
}
