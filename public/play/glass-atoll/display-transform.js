import {createACES2Output,ACES2_OUTPUT_VARIANT,ACES2_OUTPUT_TARGETS,ACES2_OUTPUT_PEAK_RANGE} from './aces2-output.js';

// Selects an output transform, never an exposure or lighting policy. The adapter
// returns false until an exact target is ready; its caller then draws legacy.
// An SDR export has its own effective state and cannot relabel the HDR surface.
export function createDisplayTransform(THREE,renderer,{onStateChange=()=>{},createOutput=createACES2Output}={}){
  let requested='legacy',peak=1000,revision=0,disposed=false,output=null,pending=null,key=null,lastNotice='',preparationError=null;
  let preparation={status:'idle',reason:'selected-legacy',peakNits:peak};
  const surfaces={sdr:{effective:'none',peakNits:100,reason:'not-presented'},hdr:{effective:'none',peakNits:peak,reason:'not-presented'}};
  const frames={sdr:0,hdr:0},fallbackFrames={sdr:0,hdr:0};
  const renderErrors={sdr:null,hdr:null};
  const modeValue=v=>{if(!['legacy','aces2'].includes(v))throw new RangeError('Unknown display transform');return v;};
  const peakValue=v=>{if(typeof v!=='number'||!Number.isFinite(v)||v<40||v>10000)throw new RangeError('Display peak must be finite within40..10000nit');return Math.round(v);};
  const summary=()=>({requested,preparation:{...preparation,error:preparationError},sdr:{...surfaces.sdr},hdr:{...surfaces.hdr},variant:ACES2_OUTPUT_VARIANT,supportedTargets:[...ACES2_OUTPUT_TARGETS],preparablePeakRange:{...ACES2_OUTPUT_PEAK_RANGE},lastError:preparationError||renderErrors.hdr||renderErrors.sdr||null});
  function notify(){const info=summary(),next=JSON.stringify(info);if(next===lastNotice)return;lastNotice=next;try{onStateChange(info);}catch{}}
  function surface(kind,effective,reason,target=kind==='sdr'?100:peak){if(!Object.hasOwn(surfaces,kind))throw new RangeError('Unknown output surface');surfaces[kind]={effective,peakNits:target,reason,error:renderErrors[kind]};notify();}
  function configure({mode=requested,peakNits=peak,retry=false}={}){
    if(disposed)throw new Error('Display transform is disposed');mode=modeValue(mode);const nextPeak=peakValue(peakNits),nextKey=JSON.stringify([mode,nextPeak]);
    if(!retry&&key===nextKey)return pending||Promise.resolve(api.state);
    key=nextKey;requested=mode;peak=nextPeak;preparationError=null;renderErrors.sdr=renderErrors.hdr=null;const request=++revision;
    // A new selection has not presented a frame yet. Do not carry a previous
    // target's failure forward or claim that the new selection has rendered.
    surfaces.sdr={effective:'none',peakNits:100,reason:'awaiting-render',error:null};
    surfaces.hdr={effective:'none',peakNits:peak,reason:'awaiting-render',error:null};
    if(mode==='legacy'){
      pending=null;preparation={status:'idle',reason:'selected-legacy',peakNits:peak};notify();return Promise.resolve(api.state);
    }
    preparation={status:'pending',reason:'preparing-exact-target',peakNits:peak};notify();
    const job=(async()=>{
      try{
        if(!output)output=createOutput(THREE,renderer);
        // The module has a global latest-request epoch. Sequential admission
        // preserves the100nit SDR cache before preparing the chosen HDR peak.
        const sdr=await output.prepareTarget({peakNits:100});
        if(disposed||request!==revision)return api.state;
        if(!sdr.ready){preparationError=sdr.error||sdr.reason;preparation={status:'failed',reason:'sdr-target-validation-failed',peakNits:100};notify();return api.state;}
        const hdr=peak===100?sdr:await output.prepareTarget({peakNits:peak});
        if(disposed||request!==revision)return api.state;
        preparation={status:hdr.ready?'ready':hdr.supported===false?'unsupported':'failed',reason:hdr.ready?'exact-target-ready':hdr.reason,peakNits:peak};
        if(!hdr.ready&&hdr.error)preparationError=hdr.error;
        notify();return api.state;
      }catch(error){
        if(disposed||request!==revision)return api.state;
        preparationError=String(error?.message||error);preparation={status:'failed',reason:'preparation-failed',peakNits:peak};notify();return api.state;
      }finally{if(request===revision)pending=null;}
    })();pending=job;return job;
  }
  function fallback(kind,reason,target){fallbackFrames[kind]++;surface(kind,'legacy',reason,target);return false;}
  function render({kind,input,exposure,target=null,viewport,peakNits,sdrWhiteNits}={}){
    if(!Object.hasOwn(surfaces,kind))throw new RangeError('Unknown output surface');
    const targetPeak=kind==='sdr'?100:peakValue(peakNits??peak);
    if(disposed)return fallback(kind,'disposed',targetPeak);
    if(requested!=='aces2')return fallback(kind,'selected-legacy',targetPeak);
    if(kind==='hdr'&&targetPeak!==peak)return fallback(kind,'calibration-target-changed',targetPeak);
    if(!output?.isReady(targetPeak))return fallback(kind,preparation.status==='unsupported'?'unsupported-target':preparation.status==='failed'?'target-validation-failed':'preparing-exact-target',targetPeak);
    if(kind==='hdr'&&(!(sdrWhiteNits>0)||!Number.isFinite(sdrWhiteNits)))return fallback(kind,'browser-white-unavailable',targetPeak);
    try{
      output.render({input,exposure,target,viewport,peakNits:targetPeak,nitsToLinear:kind==='hdr'?100/sdrWhiteNits:1,encodeSRGB:true});
      renderErrors[kind]=null;frames[kind]++;surface(kind,'aces2','exact-target-rendered',targetPeak);return true;
    }catch(error){renderErrors[kind]=String(error?.message||error);return fallback(kind,'output-render-failed',targetPeak);}
  }
  function noteFallback({kind,reason,error=null}={}){if(!Object.hasOwn(surfaces,kind))throw new RangeError('Unknown output surface');renderErrors[kind]=error?String(error):null;return fallback(kind,requested==='aces2'?String(reason||'bridge-fallback'):'selected-legacy');}
  const api={configure,render,noteFallback,
    get state(){return {...summary(),revision,disposed,frames:{...frames},fallbackFrames:{...fallbackFrames},output:output?.state||null};},
    dispose(){if(disposed)return;disposed=true;++revision;pending=null;output?.dispose();preparation={status:'idle',reason:'disposed',peakNits:peak};notify();}
  };
  return api;
}
