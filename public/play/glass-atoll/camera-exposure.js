// Relative camera exposure GAIN, in stops. A positive value admits more light.
// This is deliberately not labelled physical EV100 (whose sign is opposite).
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const finite=(v,name)=>{if(!Number.isFinite(v))throw new TypeError(`${name} must be finite`);return v;};

// An authored perceptual ceiling keeps twilight/night recognisably dark.
// It limits photographic compensation, never the physical sky or storage P.
export function conservativeExposureCeiling(solarAltitudeDeg,nightCeilingEV=14){
  finite(solarAltitudeDeg,'solarAltitudeDeg');finite(nightCeilingEV,'nightCeilingEV');
  if(nightCeilingEV<0||nightCeilingEV>24)throw new RangeError('nightCeilingEV must be between0 and24');
  const knots=[[10,0],[0,Math.min(1,nightCeilingEV)],[-6,Math.min(5,nightCeilingEV)],[-9,Math.min(9,nightCeilingEV)],[-12,Math.min(14,nightCeilingEV)],[-15,Math.min(18,nightCeilingEV)],[-16,nightCeilingEV]];
  if(solarAltitudeDeg>=10)return 0;
  for(let i=1;i<knots.length;i++){const [hi,a]=knots[i-1],[lo,b]=knots[i];if(solarAltitudeDeg>=lo)return a+(b-a)*smooth((hi-solarAltitudeDeg)/(hi-lo));}
  return nightCeilingEV;
}

/** CPU summary of an ACTUAL small HDR image, when a host supplies one.
 * No renderer, GPU pass/readback or pretend synthetic scene metering lives here.
 * storageEV is subtracted in log space so changing FP16 storage cannot meter
 * as a change in physical scene brightness. rgba/rgb may be a typed array.
 */
export function buildExposureHistogram({pixels,width,height,channels=4,storageEV=0,bins=64,minLog2=-32,maxLog2=16,centreWeighted=true}={}){
  finite(storageEV,'storageEV');
  if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1||![3,4].includes(channels)||!pixels||pixels.length!==width*height*channels)throw new TypeError('Histogram requires a complete finiteRGB image');
  if(!Number.isInteger(bins)||bins<8||bins>256||!Number.isFinite(minLog2)||!Number.isFinite(maxLog2)||maxLog2<=minLog2)throw new RangeError('Invalid log-luminance histogram interval');
  const counts=new Float64Array(bins);let totalWeight=0,positiveWeight=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*channels,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    if(![r,g,b].every(v=>Number.isFinite(v)&&v>=0))throw new RangeError('Histogram pixels must be finite and nonnegative');
    const nx=2*(x+.5)/width-1,ny=2*(y+.5)/height-1,w=centreWeighted?.25+.75*Math.exp(-2*(nx*nx+ny*ny)):1;
    const Y=.2126*r+.7152*g+.0722*b,logY=Y>0?Math.log2(Y)-storageEV:minLog2;
    const k=clamp(Math.floor((logY-minLog2)/(maxLog2-minLog2)*bins),0,bins-1);
    counts[k]+=w;totalWeight+=w;if(Y>0)positiveWeight+=w;
  }
  return {counts:Array.from(counts),totalWeight,positiveWeight,minLog2,maxLog2,storageEV,scope:'actual supplied HDR pixels only; storage exposure removed in log space'};
}

// Trim the brightest5% (small lamps/sparks) and darkest2%; retain the dark
// bulk rather than treating the brightest point as whole-frame luminance.
export function exposureHistogramSummary(histogram,{lowPercent=.02,highPercent=.95,middleGray=.18}={}){
  if(!histogram||!Array.isArray(histogram.counts)||histogram.counts.length<8||!histogram.counts.every(v=>Number.isFinite(v)&&v>=0)||!(histogram.maxLog2>histogram.minLog2)||!Number.isFinite(histogram.minLog2)||!Number.isFinite(histogram.maxLog2))throw new TypeError('Invalid exposure histogram');
  if(!(lowPercent>=0&&lowPercent<highPercent&&highPercent<=1)||!Number.isFinite(middleGray)||middleGray<=0)throw new RangeError('Invalid histogram metering policy');
  const total=histogram.counts.reduce((s,v)=>s+v,0),low=total*lowPercent,high=total*highPercent;
  if(!(total>0)||!(histogram.positiveWeight>0))return {valid:false,reason:'no-positive-radiance',cameraGainEV:null};
  let cursor=0,weight=0,weightedLog=0;const step=(histogram.maxLog2-histogram.minLog2)/histogram.counts.length;
  histogram.counts.forEach((count,i)=>{const take=Math.max(0,Math.min(cursor+count,high)-Math.max(cursor,low));weightedLog+=take*(histogram.minLog2+(i+.5)*step);weight+=take;cursor+=count;});
  if(!(weight>0))return {valid:false,reason:'empty-percentile-range',cameraGainEV:null};
  const meanLog2=weightedLog/weight;
  return {valid:true,cameraGainEV:Math.log2(middleGray)-meanLog2,meanLog2,retainedWeight:weight,totalWeight:total,lowPercent,highPercent,model:'centre-weighted trimmed log luminance; relative middle-gray reference'};
}

// Linear far from target, exponential within one stop; exact integration of
// a bounded stop-rate avoids large first-step pumping and near-target jitter.
export function adaptExposureGain(current,target,dt,{darkeningStopsPerSecond=4,brighteningStopsPerSecond=.75,transitionStops=1}={}){
  for(const [name,value]of Object.entries({current,target,dt,darkeningStopsPerSecond,brighteningStopsPerSecond,transitionStops}))finite(value,name);
  if(dt<0||darkeningStopsPerSecond<=0||brighteningStopsPerSecond<=0||transitionStops<=0)throw new RangeError('Invalid camera adaptation parameters');
  const difference=target-current,distance=Math.abs(difference);if(distance===0||dt===0)return current;
  const speed=difference<0?darkeningStopsPerSecond:brighteningStopsPerSecond,linearDistance=Math.max(0,distance-transitionStops),linearTime=linearDistance/speed;
  const remaining=dt<=linearTime?distance-speed*dt:Math.min(distance,transitionStops)*Math.exp(-speed*(dt-linearTime)/transitionStops);
  return target-Math.sign(difference)*remaining;
}

// Naked-eye night: a moonless pristine sky (~22 mag/arcsec^2, ~1.7e-4 cd/m^2)
// is ~5.3 stops darker than a high full-Moon sky, yet dark adaptation keeps the
// Milky Way plainly visible. The ceiling therefore rises with missing moonlight
// (same sqrt shape as the night prior) instead of one cap for every night.
export function moonAwareNightCeiling(moonIllumination=1,{fullMoonCeilingEV=14,moonlessBoostEV=5}={}){
  finite(moonIllumination,'moonIllumination');
  return fullMoonCeilingEV+moonlessBoostEV*(1-Math.sqrt(clamp(moonIllumination,0,1)));
}

export function createCameraExposure({nightCeilingEV=14,maximumMeterInfluenceEV=2,darkeningStopsPerSecond=4,brighteningStopsPerSecond=.75,transitionStops=1}={}){
  for(const [name,value]of Object.entries({nightCeilingEV,maximumMeterInfluenceEV,darkeningStopsPerSecond,brighteningStopsPerSecond,transitionStops}))finite(value,name);
  if(nightCeilingEV<0||nightCeilingEV>24||maximumMeterInfluenceEV<0||darkeningStopsPerSecond<=0||brighteningStopsPerSecond<=0||transitionStops<=0)throw new RangeError('Invalid camera exposure configuration');
  let initialized=false,actualBaseEV=0,targetBaseEV=0,state={mode:'automatic',cameraEV:0,targetEV:0,initialized:false,metering:'awaiting-frame'};
  return {
    update({enabled=true,recommendedEV=0,solarAltitudeDeg=48,manualExposureEV=null,compensationEV=0,dt=0,reset=false,histogram=null,nightCeilingEV:frameNightCeilingEV=nightCeilingEV,darkeningStopsPerSecond:frameDarkening=darkeningStopsPerSecond}={}){
      for(const [name,value]of Object.entries({recommendedEV,solarAltitudeDeg,compensationEV,dt}))finite(value,name);
      if(typeof enabled!=='boolean'||typeof reset!=='boolean'||dt<0)throw new TypeError('Invalid camera exposure update');
      if(manualExposureEV!==null)finite(manualExposureEV,'manualExposureEV');
      finite(frameNightCeilingEV,'nightCeilingEV');finite(frameDarkening,'darkeningStopsPerSecond');if(frameDarkening<=0)throw new RangeError('darkeningStopsPerSecond must be positive');
      const manual=manualExposureEV===null?(initialized?actualBaseEV:0):clamp(manualExposureEV,-12,24);
      const ceiling=conservativeExposureCeiling(solarAltitudeDeg,clamp(frameNightCeilingEV,0,24)),prior=clamp(Math.min(recommendedEV,ceiling),-12,24),meter=histogram?exposureHistogramSummary(histogram):null;
      let target=enabled?prior:manual;
      if(enabled&&meter?.valid)target=Math.min(ceiling,clamp(meter.cameraGainEV,prior-maximumMeterInfluenceEV,prior+maximumMeterInfluenceEV));
      targetBaseEV=target;
      if(!initialized||reset||!enabled)actualBaseEV=target;
      else actualBaseEV=adaptExposureGain(actualBaseEV,target,Math.min(dt,.25),{darkeningStopsPerSecond:frameDarkening,brighteningStopsPerSecond,transitionStops});
      initialized=true;
      state={mode:enabled?'automatic':'manual',cameraEV:clamp(actualBaseEV+compensationEV,-24,24),targetEV:clamp(targetBaseEV+compensationEV,-24,24),actualBaseEV,targetBaseEV,compensationEV,manualExposureEV:manual,priorEV:prior,ceilingEV:ceiling,initialized,resetApplied:reset,metering:enabled?(meter?.valid?'actual-histogram':'bounded-celestial-prior'):'fixed-manual',histogram:meter,
        convention:'positive relative gainEV brightens; not absolute EV100',limits:['Night/twilight ceiling is authored perceptual intent, not eye physiology or absolute photometric calibration.','A histogram is used only when a host supplies actual HDR pixels; no GPU metering is implied by a missing histogram.','Storage exposureP is a separate precision variable and must cancel before display.']};
      return {...state,histogram:meter?{...meter}:null,limits:state.limits.slice()};
    },
    get state(){return {...state,histogram:state.histogram?{...state.histogram}:null,limits:state.limits?.slice()??[]};}
  };
}
