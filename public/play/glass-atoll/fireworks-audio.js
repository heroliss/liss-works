// CC0 recording palette from compressed Freesound previews, plus synthesized
// launch fallback. User gesture/context belongs to root.
export const FIREWORK_AUDIO_SOURCE=Object.freeze({title:'Single Firework',author:'richwise',source:'https://freesound.org/people/richwise/sounds/455453/',license:'CC0 1.0',licenseURL:'https://creativecommons.org/publicdomain/zero/1.0/',file:'./assets/audio/fireworks/burst-richwise-preview-mono.ogg',kind:'real recording, trimmed mono from compressed public HQ preview',subjectiveReview:'not performed by agent; listening acceptance pending'});
export const FIREWORK_AUDIO_VARIANTS=Object.freeze([
  Object.freeze({id:'firecracker',title:'Firecracker - Single in Ground',author:'iliyabylich04',source:'https://freesound.org/people/iliyabylich04/sounds/651332/',license:'CC0 1.0',licenseURL:'https://creativecommons.org/publicdomain/zero/1.0/',file:'./assets/audio/fireworks/firecracker-iliyabylich04-mono.ogg',kind:'trimmed mono from public compressed HQ preview; sharp burst'}),
  Object.freeze({id:'bang',title:'Loud Firewords Bang Cut Off',author:'qubodup',source:'https://freesound.org/people/qubodup/sounds/840510/',license:'CC0 1.0',licenseURL:'https://creativecommons.org/publicdomain/zero/1.0/',file:'./assets/audio/fireworks/bang-qubodup-mono.ogg',kind:'trimmed mono from public compressed HQ preview; bright bang'}),
  Object.freeze({id:'boom-a',title:'NYE Loud Booms',author:'LOVEBURD',source:'https://freesound.org/people/LOVEBURD/sounds/376662/',license:'CC0 1.0',licenseURL:'https://creativecommons.org/publicdomain/zero/1.0/',file:'./assets/audio/fireworks/boom-lovebird-a-mono.ogg',kind:'first low boom trimmed mono from public compressed HQ preview'}),
  Object.freeze({id:'boom-b',title:'NYE Loud Booms',author:'LOVEBURD',source:'https://freesound.org/people/LOVEBURD/sounds/376662/',license:'CC0 1.0',licenseURL:'https://creativecommons.org/publicdomain/zero/1.0/',file:'./assets/audio/fireworks/boom-lovebird-b-mono.ogg',kind:'second low boom trimmed mono from public compressed HQ preview'}),
  Object.freeze({id:'crackle',title:'Fireworks Crackle',author:'16FThumaF',source:'https://freesound.org/people/16FThumaF/sounds/505264/',license:'CC0 1.0',licenseURL:'https://creativecommons.org/publicdomain/zero/1.0/',file:'./assets/audio/fireworks/crackle-16fthumaf-mono.ogg',kind:'high-passed mono texture trimmed from public compressed HQ preview'}),
]);
export function fireworkSoundChoice(event={}){
  let hash=(event.seed??1)>>>0;
  for(const char of String(event.type??''))hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  hash=(hash^(hash>>>16))>>>0;
  const subBurst=event.kind==='burst'&&Number.isFinite(event.energy)&&event.energy<.3;
  const palette=subBurst?['firecracker','bang']:['firecracker','bang','boom-a','boom-b'];
  const longTail=['willow','palm','strobe','display-waterfall','display-brocade'].includes(event.type);
  const textured=longTail||['chrysanthemum','crossette','display-vortex','display-double'].includes(event.type);
  return{variant:palette[hash%palette.length],subBurst,rate:.94+((hash>>>8)%9)*.015,accentDelay:.035+((hash>>>16)%5)*.018,
    crackle:textured||(hash>>>22)%3===0,tailDelay:longTail?.95:.38,longTail,
    bodyGain:2.6+((hash>>>12)%5)*.2,launchRate:.88+((hash>>>6)%9)*.025};
}
// Authored per-recording balance. The selected recording now supplies the
// attack/body; the former common richwise voice is a quieter low-passed layer.
export const FIREWORK_AUDIO_MIX=Object.freeze({
  primaryGains:Object.freeze({firecracker:7.5,bang:6.5,'boom-a':8,'boom-b':9.5}),
  subBurstGains:Object.freeze({firecracker:3.8,bang:2.8}),
  tailGain:12.8,lateTailGain:8.8,maximumVoices:24,
});
export function soundSpeed(temperature=29){return Math.sqrt(1.4*287.05*(273.15+Math.max(-30,Math.min(50,temperature))));}
export function acousticArrival(event,listener=[0,0,0],temperature=29){const distance=Math.hypot(...event.position.map((v,i)=>v-listener[i]));return{distance,delay:distance/soundSpeed(temperature),arrival:event.time+distance/soundSpeed(temperature)};}
function random(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
export function synthFireworkPCM(kind='launch',sampleRate=48000,seed=1){
  const duration=kind==='burst'?1.45:kind==='crackle'?.48:kind==='ascent'?1.35:.62,n=Math.ceil(duration*sampleRate),data=new Float32Array(n),rng=random(seed);let low=0,mid=0,peak=0;
  const pops=Array.from({length:6},()=>({at:rng()*.3,frequency:1200+rng()*2000}));
  for(let i=0;i<n;i++){const t=i/sampleRate,w=rng()*2-1;low=.965*low+.035*w;mid=.66*mid+.34*w;let value;
    if(kind==='burst')value=(low*3+mid*.8+w*.12)*(1-Math.exp(-t*1400))*Math.exp(-t*7)+.12*Math.sin(t*2*Math.PI*51)*Math.exp(-t*12);
    else if(kind==='crackle'){value=0;for(const p of pops){const a=t-p.at;if(a>0)value+=(mid*.7+w*.3)*Math.exp(-a*130)*Math.sin(a*p.frequency*2*Math.PI);}}
    else if(kind==='ascent')value=(mid*.7+w*.12)*Math.sin(Math.PI*Math.min(1,t/duration))**1.3*(.8+.2*Math.sin(t*17));
    else value=(low*2.1+mid*.22)*(1-Math.exp(-t*240))*Math.exp(-t*18)+mid*.11*Math.sin(Math.PI*Math.min(1,t/.5))**2;
    value*=Math.min(1,(duration-t)/.025);data[i]=value;peak=Math.max(peak,Math.abs(value));
  }
  for(let i=0;i<n;i++)data[i]=data[i]/Math.max(peak,1e-9)*.78;
  return{data,sampleRate,duration,kind:'acoustic synthesis; not a real explosion recording'};
}
const positionArray=v=>Array.isArray(v)?v:[v?.x||0,v?.y||0,v?.z||0];
export function createFireworksAudio({getContext=()=>null,getOutput=()=>null,isEnabled=()=>false,getListenerPosition=()=>[0,0,0],assetURL=new URL(FIREWORK_AUDIO_SOURCE.file,import.meta.url),onWarning=()=>{}}={}){
  let context=null,input=null,compressor=null,headroom=null,outputNode=null,loading=null,recording=null,epoch=0,paused=false,enabledLast=false,disposed=false;
  let scheduled=0,discarded=0,recordedPlays=0,synthesizedPlays=0,accentPlays=0,voiceLimitDrops=0,staleDrops=0,lastArrival=null,loadError=null;const voices=new Set(),synthBuffers=new Map(),variants=new Map(),variantPlays={},layerPlays={},recentLayers=[];
  async function prepare(){
    if(disposed||!isEnabled())return false;
    const ctx=await getContext(),output=getOutput();
    // Root enables/resumes its context before asynchronously building its
    // ambience graph. Do not commit a half-initialized helper while its aux
    // output is still null, or later calls would see the same context and
    // never attach this bus. A ready output is part of initialization.
    if(!ctx||!output||!isEnabled()||disposed)return false;
    // Keep the previously selected bus/headroom/attack and final peak guard.
    // Per-recording gains below replace the once-universal gain12 primary.
    if(context!==ctx){input?.disconnect();compressor?.disconnect();headroom?.disconnect();context=ctx;recording=null;loading=null;synthBuffers.clear();variants.clear();input=context.createGain();input.gain.value=.64;compressor=context.createDynamicsCompressor();compressor.threshold.value=-7;compressor.knee.value=7;compressor.ratio.value=5;compressor.attack.value=.0005;compressor.release.value=.17;headroom=context.createGain();headroom.gain.value=.70;input.connect(compressor);compressor.connect(headroom);headroom.connect(output);outputNode=output;}
    else if(outputNode!==output){headroom.disconnect();headroom.connect(output);outputNode=output;}
    if(loading)return loading;if(recording)return true;
    const decodingContext=context;
    const decode=async url=>{const response=await fetch(url);if(!response.ok)throw new Error('Fireworks recording HTTP '+response.status);return decodingContext.decodeAudioData(await response.arrayBuffer());};
    loading=(async()=>{
      const [main,...extras]=await Promise.allSettled([decode(assetURL),...FIREWORK_AUDIO_VARIANTS.map(item=>decode(new URL(item.file,import.meta.url)))]);
      if(disposed||context!==decodingContext)return false;
      if(main.status==='fulfilled')recording=main.value;
      else{loadError=main.reason?.message||String(main.reason);onWarning('烟花基础主体录音未载入；可用变体录音仍会播放，缺失录音使用合成暂态：'+loadError);}
      extras.forEach((result,i)=>{const item=FIREWORK_AUDIO_VARIANTS[i];if(result.status==='fulfilled')variants.set(item.id,result.value);else onWarning('烟花变体录音 '+item.id+' 未载入：'+(result.reason?.message||result.reason));});
      return!!recording;
    })();
    return loading;
  }
  function synthesized(kind,seed){const key=kind+':'+(seed%7);if(synthBuffers.has(key))return synthBuffers.get(key);const pcm=synthFireworkPCM(kind,context.sampleRate,seed),buffer=context.createBuffer(1,pcm.data.length,pcm.sampleRate);buffer.copyToChannel(pcm.data,0);synthBuffers.set(key,buffer);return buffer;}
  function cancel(){epoch++;for(const voice of voices){try{voice.gain.gain.cancelScheduledValues(context.currentTime);voice.gain.gain.setTargetAtTime(0,context.currentTime,.008);voice.source.stop(context.currentTime+.04);}catch{}}voices.clear();}
  async function enqueue(events,{time=0,listenerPosition=getListenerPosition(),temperature=29,paused:framePaused=false}={}){
    if(!Array.isArray(events))events=[events];if(events.length===0)return;if(disposed||framePaused||!isEnabled()){discarded+=events.length;return;}
    const token=epoch,entered=globalThis.performance?.now?.()??Date.now();await prepare();if(!context||disposed||token!==epoch||!isEnabled()||paused){discarded+=events.length;return;}
    const elapsed=((globalThis.performance?.now?.()??Date.now())-entered)/1000,listener=positionArray(listenerPosition);
    const accents=[];
    for(const event of events){
      if(!Array.isArray(event?.position)||event.position.length!==3||!event.position.every(Number.isFinite)||!Number.isFinite(event.time)||event.energy!==undefined&&!Number.isFinite(event.energy)){discarded++;continue;}
      const arrival=acousticArrival(event,listener,temperature),remaining=arrival.arrival-time-elapsed;
      // Never replay old events in a batch after loading/unmuting/resuming.
      if(remaining<-.12){discarded++;staleDrops++;continue;}
      if(voices.size>=FIREWORK_AUDIO_MIX.maximumVoices){discarded++;voiceLimitDrops++;continue;}
      const kind=event.kind==='burst'?'burst':event.kind==='crackle'?'crackle':'launch',choice=fireworkSoundChoice(event),variant=variants.get(choice.variant),subBurst=kind==='burst'&&choice.subBurst;
      const primary=kind==='burst'?(variant||recording):kind==='crackle'?variants.get('crackle'):null;
      const primaryId=primary?(primary===variant?choice.variant:primary===recording?'richwise':'crackle'):'synthesis-'+kind;
      const energy=Math.sqrt(Math.max(.05,Math.min(2,event.energy??1)));
      function play(buffer,{gainValue,delay=0,rate=1,role='primary',sourceId=primaryId,cutoff=18000,synthKind=kind}={}){
        if(voices.size>=FIREWORK_AUDIO_MIX.maximumVoices)return null;
        const source=context.createBufferSource();source.buffer=buffer||synthesized(synthKind,event.seed??1);source.playbackRate.value=rate;
        const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=Math.max(1100,cutoff/(1+arrival.distance/280));filter.Q.value=.45;
        const gain=context.createGain(),panner=context.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=24;panner.rolloffFactor=1;panner.maxDistance=5000;
        if(panner.positionX){panner.positionX.value=event.position[0];panner.positionY.value=event.position[1];panner.positionZ.value=event.position[2];}else panner.setPosition(...event.position);
        const when=context.currentTime+Math.max(.008,remaining-(buffer===recording?.015:0)+delay);gain.gain.value=gainValue*energy;
        source.connect(filter);filter.connect(gain);gain.connect(panner);panner.connect(input);
        const voice={source,filter,gain,panner};voices.add(voice);source.onended=()=>{voices.delete(voice);source.disconnect();filter.disconnect();gain.disconnect();panner.disconnect();};source.start(when);return when;
      }
      const primaryGain=kind==='burst'?(subBurst?(FIREWORK_AUDIO_MIX.subBurstGains[primaryId]??3.2):(FIREWORK_AUDIO_MIX.primaryGains[primaryId]??10)):kind==='crackle'?FIREWORK_AUDIO_MIX.tailGain:.42;
      function recordLayer(sourceId,role,gainValue,when,rate){
        layerPlays[role]=(layerPlays[role]||0)+1;
        recentLayers.push({source:sourceId,role,gain:gainValue*energy,time:when,rate,eventId:event.eventId??null,type:event.type});
        if(recentLayers.length>48)recentLayers.shift();
      }
      const primaryRate=kind==='launch'?choice.launchRate:choice.rate;
      const when=play(primary,{gainValue:primaryGain,rate:primaryRate});
      if(when===null){discarded++;continue;}
      scheduled++;if(primary)recordedPlays++;else synthesizedPlays++;
      recordLayer(primaryId,'primary',primaryGain,when,primaryRate);
      if(primary&&primary===variant)variantPlays[choice.variant]=(variantPlays[choice.variant]||0)+1;
      const addAccent=(buffer,options)=>accents.push(()=>{
        if(voices.size>=18)return;
        const at=play(buffer,options);if(at===null)return;
        accentPlays++;recordLayer(options.sourceId,options.role,options.gainValue,at,options.rate??1);
        if(options.sourceId!=='richwise'&&buffer)variantPlays[options.sourceId]=(variantPlays[options.sourceId]||0)+1;
      });
      if(kind==='burst'&&!subBurst){
        if(recording&&primary!==recording)addAccent(recording,{gainValue:choice.bodyGain,delay:.025,rate:1,role:'low-body',sourceId:'richwise',cutoff:2400});
        const crackle=variants.get('crackle');
        if(choice.crackle&&crackle){
          addAccent(crackle,{gainValue:FIREWORK_AUDIO_MIX.tailGain,delay:choice.tailDelay,rate:.94+((event.seed??1)%5)*.025,role:'crackle-tail',sourceId:'crackle'});
          if(choice.longTail)addAccent(crackle,{gainValue:FIREWORK_AUDIO_MIX.lateTailGain,delay:2.7,rate:1.06,role:'late-crackle',sourceId:'crackle'});
        }
      }else if(kind==='launch'&&!['fan','bouquet','display-vfan'].includes(event.type)){
        addAccent(null,{gainValue:.36,delay:.12,rate:choice.launchRate,role:'ascent',sourceId:'synthesis-ascent',cutoff:10000,synthKind:'ascent'});
      }
      lastArrival={kind,distance:arrival.distance,soundSpeed:soundSpeed(temperature),delay:arrival.delay,physicalEventTime:event.time,expectedArrival:arrival.arrival,audioTime:when,source:primaryId,accent:kind==='burst'&&!subBurst&&primary!==recording?'richwise-low-body':null};
    }
    // In a shared batch every primary gets first claim on the 24 voices. Late
    // texture/body layers yield before a later simultaneous primary is lost.
    for(const accent of accents)accent();
  }
  return{prepare,enqueue,consume:enqueue,cancel,
    update({paused:nextPaused=false}={}){const enabled=!!isEnabled();if(nextPaused&&!paused||!enabled&&enabledLast)cancel();paused=!!nextPaused;enabledLast=enabled;},
    diagnostics(){return{scheduled,discarded,recordedPlays,synthesizedPlays,accentPlays,voiceLimitDrops,staleDrops,variantPlays:{...variantPlays},layerPlays:{...layerPlays},recentLayers:recentLayers.map(v=>({...v})),activeVoices:voices.size,outputReady:!!outputNode,recordingLoaded:!!recording,recordingDuration:recording?.duration||0,variantsLoaded:[...variants.keys()],relativeBurstGain:null,legacyReferenceBurstGain:12,mixModel:'recording-selected primary + quieter low body + delayed crackle',mix:FIREWORK_AUDIO_MIX,postCompressorHeadroomGain:.7,compressorAttackSeconds:.0005,source:FIREWORK_AUDIO_SOURCE,variantSources:FIREWORK_AUDIO_VARIANTS,loadError,lastArrival,spatial:'HRTF; inverse pressure-distance once in PannerNode; temperature-dependent propagation delay',limits:['real compressed preview recordings; subjective background/timbre listening pending','launch/ascent and failed-load burst explicitly synthesized','fixed listener at emission scheduling; moving receiver sound-cone not solved','distance lowpass is an approximation; no absolute sound-pressure calibration','linear post-compressor headroom lowers all pyro SFX3.10dB; final shared peak guard remains responsible for sample ceiling']};},
    dispose(){disposed=true;cancel();input?.disconnect();compressor?.disconnect();headroom?.disconnect();},
  };
}
