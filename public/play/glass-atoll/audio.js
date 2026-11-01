// Recorded ambience with lightweight Web Audio spatial mixing. Audio remains
// enabled by setEnabled(true); browsers may defer playback until a user gesture. This is a sound
// design model; recordings and gain envelopes are not a fluid pressure solver.
import {waterImpactSound} from './water-impact.js';
import {createAudioPeakGuard} from './audio-peak-guard.js';

// Exactly the same impact mapping is used by the live and offline graphs.
// Legacy calls retain their former per-play variation / offline rate of1.
export function splashAudioParameters(strength=1,impact={},variationIndex=0,{offline=false}={}){
  const parameters=waterImpactSound(strength,impact);
  if(parameters.mode==='legacy-strength')parameters.playbackRate=offline?1:.94+(variationIndex%5)*.03;
  return parameters;
}

export const SOUND_SOURCES = Object.freeze({
  ocean: { file:'ocean-shore.ogg', name:'Beach sounds South Carolina — Anthropic42', kind:'recorded beach ambience', license:'Public domain', url:'https://commons.wikimedia.org/wiki/File:Beach_sounds_South_Carolina.ogg' },
  leaves: { file:'leaf-rustle.ogg', name:'Rustling leaves — Gravity Sound', kind:'recorded leaf sound effect', license:'CC BY 4.0', url:'https://commons.wikimedia.org/wiki/File:Rustling_leaves_(Gravity_Sound).wav' },
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const vec=(v,fallback=[0,0,0])=>Array.isArray(v)?v.map((x,i)=>finite(x,fallback[i])):[finite(v?.x,fallback[0]),finite(v?.y,fallback[1]),finite(v?.z,fallback[2])];
const randomSource=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};

/** Equal-power, zero-slope head/tail overlap; no JS timer is needed at runtime. */
export function crossfadeLoopPCM(channels,sampleRate,fadeSeconds=1.2) {
  const n=channels[0]?.length||0;
  const overlap=Math.max(2,Math.min(Math.floor(n*.24),Math.round(fadeSeconds*sampleRate)));
  if(n<8)throw new Error('Audio loop is too short.');
  const length=n-overlap;
  const result=channels.map(input=>{
    const out=new Float32Array(length);
    // Bulk-copy the untouched body; do JS/trigonometry only in the overlap.
    // This keeps the one-off enable gesture from traversing millions of samples.
    out.set(input.subarray(0,length));
    for(let i=0;i<overlap;i++){
      const angle=smooth(i/overlap)*Math.PI*.5;
      out[i]=input[i]*Math.sin(angle)+input[length+i]*Math.cos(angle);
    }
    return out;
  });
  return {channels:result,sampleRate,overlapFrames:overlap,duration:length/sampleRate};
}

export function proceduralSplashPCM(sampleRate=48000,seed=7219) {
  const random=randomSource(seed),length=Math.round(sampleRate*.72),data=new Float32Array(length);
  let brown=0,phase=0,mean=0;
  for(let i=0;i<length;i++){
    const t=i/sampleRate,white=random()*2-1;
    brown=.83*brown+.17*white;
    const impact=(.62*brown+.18*white)*(1-Math.exp(-t*800))*Math.exp(-t*21);
    phase+=Math.PI*2*(240+690*Math.exp(-t*16))/sampleRate;
    let bubbles=Math.sin(phase)*.095*Math.exp(-Math.max(0,t-.028)*24)*smooth(t/.028);
    for(const [at,hz,level] of [[.13,1150,.027],[.25,1720,.018],[.39,1380,.010]]){
      const age=t-at;if(age>0)bubbles+=Math.sin(age*hz*Math.PI*2)*level*(1-Math.exp(-age*900))*Math.exp(-age*55);
    }
    const end=smooth((.72-t)/.028);
    data[i]=(impact+bubbles)*end;mean+=data[i];
  }
  mean/=length;
  for(let i=0;i<length;i++)data[i]-=mean*2*Math.sin(Math.PI*i/(length-1))**2;
  return {channels:[data],sampleRate,duration:length/sampleRate};
}

function airPCM(sampleRate,seed=91387) {
  const random=randomSource(seed),channels=[new Float32Array(sampleRate*6),new Float32Array(sampleRate*6)];
  for(const data of channels){let a=0,b=0;for(let i=0;i<data.length;i++){const w=random()*2-1;a=.985*a+.015*w;b=.68*b+.32*w;data[i]=a*1.6+b*.18;}}
  return crossfadeLoopPCM(channels,sampleRate,.6);
}
function bufferFromPCM(context,pcm) {
  const buffer=context.createBuffer(pcm.channels.length,pcm.channels[0].length,pcm.sampleRate);
  pcm.channels.forEach((channel,i)=>buffer.copyToChannel(channel,i));return buffer;
}
function loopBuffer(context,buffer,fade) {
  return bufferFromPCM(context,crossfadeLoopPCM(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),buffer.sampleRate,fade));
}

export function audioPCMStats(buffer) {
  const channels=buffer.channels||Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  let peak=0,power=0,count=0,nonFinite=0,seam=0;
  for(const channel of channels){
    seam=Math.max(seam,Math.abs(channel[0]-channel[channel.length-1]));
    for(const value of channel){if(!Number.isFinite(value)){nonFinite++;continue;}peak=Math.max(peak,Math.abs(value));power+=value*value;count++;}
  }
  return {peak,peakDbfs:20*Math.log10(Math.max(peak,1e-12)),rmsDbfs:10*Math.log10(Math.max(power/Math.max(count,1),1e-24)),nonFinite,seamDifference:seam,samples:count};
}
export function encodeAudioWav(buffer) {
  const channels=buffer.channels||Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  const sampleRate=buffer.sampleRate,n=channels[0].length,c=channels.length,out=new Uint8Array(44+n*c*2),view=new DataView(out.buffer);
  const str=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
  str(0,'RIFF');view.setUint32(4,out.length-8,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,c,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*c*2,true);view.setUint16(32,c*2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,n*c*2,true);
  for(let i=0;i<n;i++)for(let ch=0;ch<c;ch++){const x=clamp(channels[ch][i],-1,1);view.setInt16(44+(i*c+ch)*2,Math.round(x<0?x*32768:x*32767),true);}
  return out;
}

function defaultShoreline(){return Array.from({length:64},(_,i)=>{const a=i/64*Math.PI*2;return[Math.cos(a)*30,0,Math.sin(a)*19];});}
function nearestShore(points,p) {
  let best={distance:Infinity,point:[0,0,0],index:0};
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[2]-a[2];
    const t=clamp(((p[0]-a[0])*dx+(p[2]-a[2])*dz)/Math.max(dx*dx+dz*dz,1e-6),0,1);
    const q=[a[0]+dx*t,.05,a[2]+dz*t],d=Math.hypot(q[0]-p[0],q[2]-p[2]);
    if(d<best.distance)best={distance:d,point:q,index:i};
  }
  const offset=Math.max(1,Math.round(points.length*.075));
  return {...best,points:[best.point,points[(best.index+offset)%points.length],points[(best.index-offset+points.length)%points.length]]};
}
function panner(context,position,refDistance=14,rolloff=.65) {
  const node=context.createPanner();node.panningModel='HRTF';node.distanceModel='inverse';node.refDistance=refDistance;node.maxDistance=300;node.rolloffFactor=rolloff;node.coneInnerAngle=360;
  node.setPosition(...position);return node;
}
function setParam(param,value,time,offline=false,constant=.08) {
  if(!param)return;
  if(offline)param.linearRampToValueAtTime(value,time);
  else param.setTargetAtTime(value,time,constant);
}
function setPosition(node,p,time,offline=false) {
  if(node.positionX){setParam(node.positionX,p[0],time,offline,.025);setParam(node.positionY,p[1],time,offline,.025);setParam(node.positionZ,p[2],time,offline,.025);}
  else node.setPosition(...p);
}
function attachSplashAudio(ctx,master,buffer,position,listener,parameters,at){
  const source=ctx.createBufferSource(),gain=ctx.createGain(),delay=ctx.createDelay(2);
  source.buffer=buffer;source.playbackRate.value=parameters.playbackRate;gain.gain.value=parameters.gain;
  const spatial=panner(ctx,position,2,1);
  delay.delayTime.value=clamp(Math.hypot(...position.map((v,i)=>v-listener[i]))/343,0,1.8);
  let filter=null;
  if(parameters.mode==='normal-energy'){
    filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=Math.min(parameters.lowpassHz,ctx.sampleRate*.45);filter.Q.value=.45;
    source.connect(filter);filter.connect(gain);
  }else source.connect(gain);
  gain.connect(spatial);spatial.connect(delay);delay.connect(master);
  if(at===undefined)source.start();else source.start(at);
  return{source,gain,spatial,delay,filter};
}

export function createSoundscape({
  shoreline=defaultShoreline(),palmPosition=[-7,10,-2],referenceWind=1.8,
  assetBase='./assets/audio/',masterVolume=.75,proceduralAir=true,onWarning,
  AudioContextConstructor=globalThis.AudioContext||globalThis.webkitAudioContext,
  OfflineAudioContextConstructor=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext,
}={}) {
  const shore=shoreline.map(p=>Array.isArray(p)?(p.length===2?[p[0],.05,p[1]]:vec(p)):vec(p));
  if(shore.length<3)throw new Error('A shoreline needs at least three points.');
  const leafPosition=vec(palmPosition,[-7,10,-2]);
  const assetURL=new URL(assetBase.endsWith('/')?assetBase:assetBase+'/',import.meta.url);
  const bytes=new Map(),decoded={},warnings=[],activeSplashes=new Set();
  let context,graph,loading,captureTap,enabled=false,disposed=false,suspendTimer,resumePending=false,epoch=0,splashCount=0,audibleSplashes=0,lastApplyTime=-Infinity,lastSplashResponse=null;
  let last={time:0,wind:referenceWind,cameraPosition:[40,3,30],cameraForward:[0,0,-1],paused:false};
  let lastMix={sea:0,wind:0,air:0,swell:0,shoreDistance:0,shorePositions:[]};
  const warn=message=>{if(!warnings.includes(message)){warnings.push(message);onWarning?.(message);}};

  async function sourceBuffer(ctx,key,metadata) {
    try {
      if(!bytes.has(key))bytes.set(key,fetch(new URL(SOUND_SOURCES[key].file,assetURL)).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.arrayBuffer();}));
      const data=await bytes.get(key),buffer=await ctx.decodeAudioData(data.slice(0));
      metadata[key]={duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,sourceName:SOUND_SOURCES[key].name,recorded:true,file:SOUND_SOURCES[key].file};
      if(ctx===context)decoded[key]=metadata[key];
      return loopBuffer(ctx,buffer,key==='ocean'?1.7:1.2);
    } catch(error) {
      warn(`${key} recording unavailable; using labelled procedural fallback (${error.message}).`);
      const pcm=airPCM(ctx.sampleRate,key==='ocean'?82173:91387),buffer=bufferFromPCM(ctx,pcm);
      metadata[key]={duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,sourceName:`Procedural ${key} fallback`,recorded:false};if(ctx===context)decoded[key]=metadata[key];return buffer;
    }
  }

  async function buildGraph(ctx,offline=false,startTime=0,sceneTime=0) {
    const metadata={};let mixState={...lastMix};
    const [ocean,leaves]=await Promise.all([sourceBuffer(ctx,'ocean',metadata),sourceBuffer(ctx,'leaves',metadata)]);
    const master=ctx.createGain();master.gain.value=0;
    const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-9;compressor.knee.value=9;compressor.ratio.value=3;compressor.attack.value=.012;compressor.release.value=.23;
    const guard=await createAudioPeakGuard(ctx,{onWarning:warn});
    const {node:output,...peakGuard}=guard;
    master.connect(compressor);compressor.connect(output);output.connect(ctx.destination);
    const sources=[],nodes=[master,compressor,output];
    function layer(buffer,{position=null,level=0,offset=0,cutoff=9500,ref=14}={}) {
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=cutoff;filter.Q.value=.45;gain.gain.value=level;
      source.connect(filter);filter.connect(gain);
      let spatial;if(position){spatial=panner(ctx,position,ref);gain.connect(spatial);spatial.connect(master);nodes.push(spatial);}else gain.connect(master);
      source.start(startTime,(offset+sceneTime*.37)%buffer.duration);sources.push(source);nodes.push(source,filter,gain);
      return {source,filter,gain,spatial};
    }
    const bed=layer(ocean,{offset:0});
    const waves=[0,.347,.673].map((fraction,i)=>layer(ocean,{position:shore[i]||shore[0],offset:ocean.duration*fraction}));
    const rustle=layer(leaves,{position:leafPosition,ref:10,cutoff:5200,offset:2.9});
    const air=proceduralAir?layer(bufferFromPCM(ctx,airPCM(ctx.sampleRate)),{offset:1.9,cutoff:1800}):null;
    const splashBuffers=Array.from({length:4},(_,i)=>bufferFromPCM(ctx,proceduralSplashPCM(ctx.sampleRate,7219+i*701)));
    function apply(frame,audioTime=ctx.currentTime) {
      const p=vec(frame.cameraPosition,[40,3,30]),f=vec(frame.cameraForward,[0,0,-1]);
      const magnitude=Math.max(.00001,Math.hypot(...f)),forward=f.map(v=>v/magnitude);
      const listener=ctx.listener;setPosition(listener,p,audioTime,offline);
      if(listener.forwardX){for(const [axis,value] of [['X',forward[0]],['Y',forward[1]],['Z',forward[2]]])setParam(listener['forward'+axis],value,audioTime,offline,.025);setParam(listener.upX,0,audioTime,offline,.025);setParam(listener.upY,1,audioTime,offline,.025);setParam(listener.upZ,0,audioTime,offline,.025);}
      else listener.setOrientation(...forward,0,1,0);
      const near=nearestShore(shore,p),wind=clamp(finite(frame.wind,referenceWind),0,12),windRatio=wind/referenceWind;
      const hasEnvelope=Number.isFinite(frame.swellEnvelope);
      const swell=hasEnvelope?clamp(frame.swellEnvelope,0,1):.5+.5*Math.sin(finite(frame.time)*Math.PI*.5);
      const sea=(.68+.32*Math.sqrt(windRatio))*(.75+.25*swell);
      const windLevel=clamp(.23*Math.pow(windRatio,.85),0,.80),airLevel=proceduralAir?clamp(.035*Math.pow(windRatio,.9),0,.10):0;
      setParam(bed.gain.gain,(.045+.145/(1+near.distance/45))*sea,audioTime,offline);
      waves.forEach((wave,i)=>{setPosition(wave.spatial,near.points[i],audioTime,offline);setParam(wave.gain.gain,[.65,.45,.45][i]*sea,audioTime,offline);setParam(wave.filter.frequency,clamp(10000-near.distance*38,1700,10000),audioTime,offline,.15);});
      setParam(rustle.gain.gain,windLevel,audioTime,offline,.16);setParam(rustle.filter.frequency,clamp(1800+windRatio*2400,1400,8500),audioTime,offline,.18);
      if(air){setParam(air.gain.gain,airLevel,audioTime,offline,.18);setParam(air.filter.frequency,clamp(1000+windRatio*700,800,4200),audioTime,offline,.18);}
      mixState={sea,wind:windLevel,air:airLevel,swell,swellSource:hasEnvelope?'scene envelope':'statistical 4-second fallback',effectiveWind:wind,shoreDistance:near.distance,shorePositions:near.points.map(p=>[...p])};if(!offline)lastMix=mixState;
    }
    return {ctx,master,compressor,output,peakGuard,sources,nodes,splashBuffers,apply,startTime,decoded:metadata,get mix(){return mixState;},dispose(){sources.forEach(s=>{try{s.stop();}catch{}});nodes.forEach(n=>{try{n.disconnect();}catch{}});}};
  }

  function fadeAndSuspend() {
    clearTimeout(suspendTimer);if(!graph||!context)return;
    graph.master.gain.setTargetAtTime(0,context.currentTime,.045);
    const token=epoch;suspendTimer=setTimeout(()=>{if(token===epoch&&(!enabled||last.paused)&&context?.state==='running')context.suspend().catch(()=>{});},260);
  }
  async function setEnabled(value) {
    if(disposed)throw new Error('Soundscape has been disposed.');
    enabled=!!value;epoch++;clearTimeout(suspendTimer);
    if(!enabled){fadeAndSuspend();return api.state;}
    if(!AudioContextConstructor)throw new Error('Web Audio is not available.');
    // Resume before any fetch await, while the enabling click is still active.
    if(!context){try{context=new AudioContextConstructor({latencyHint:'interactive',sampleRate:48000});}catch{context=new AudioContextConstructor({latencyHint:'interactive'});}}
    const unlocked=context.resume();
    if(!loading)loading=buildGraph(context,false,context.currentTime+.04,last.time).then(g=>{if(disposed)g.dispose();else graph=g;return g;});
    await Promise.all([unlocked,loading]);
    if(disposed)return api.state;
    if(enabled&&!last.paused){graph.apply(last);graph.master.gain.setTargetAtTime(clamp(masterVolume,0,1),context.currentTime,.09);}
    else fadeAndSuspend();
    return api.state;
  }
  function update(frame={}) {
    if(disposed)return;
    const previousPaused=last.paused;last={...last,...frame,time:finite(frame.time,last.time),wind:finite(frame.wind,last.wind)};
    if(!enabled||!graph)return;
    if(last.paused){if(!previousPaused) {epoch++;fadeAndSuspend();}return;}
    if(previousPaused||context.state==='suspended'){
      // Keep one frame-driven retry while autoplay is blocked. Explicit enabling
      // still calls resume synchronously inside the next user gesture.
      if(!resumePending){
        resumePending=true;epoch++;clearTimeout(suspendTimer);
        context.resume().then(()=>{if(enabled&&!last.paused){graph.apply(last);graph.master.gain.setTargetAtTime(clamp(masterVolume,0,1),context.currentTime,.07);}}).catch(()=>{}).finally(()=>{resumePending=false;});
      }
    }
    if(context.state==='running'&&context.currentTime-lastApplyTime>=1/30){graph.apply(last);lastApplyTime=context.currentTime;}
  }
  function splash(x,z,strength=1,impact={}) {
    splashCount++;const parameters=splashAudioParameters(strength,impact,audibleSplashes);lastSplashResponse=parameters;
    if(!parameters.valid||!enabled||last.paused||!graph||context.state!=='running')return false;
    const item=attachSplashAudio(context,graph.master,graph.splashBuffers[audibleSplashes%graph.splashBuffers.length],[finite(x),.03,finite(z)],vec(last.cameraPosition),parameters);
    activeSplashes.add(item);audibleSplashes++;
    item.source.onended=()=>setTimeout(()=>{activeSplashes.delete(item);for(const n of Object.values(item))try{n?.disconnect();}catch{}},Math.ceil(item.delay.delayTime.value*1000+50));
    return true;
  }
  async function renderOffline({seconds=12,sampleRate=48000,time=0,wind=referenceWind,cameraPosition=[38,3,30],cameraForward=[-1,0,-1],swellEnvelope,splashEvents=[]}={}) {
    if(!OfflineAudioContextConstructor)throw new Error('OfflineAudioContext is not available.');
    seconds=clamp(finite(seconds,12),1,120);sampleRate=clamp(Math.round(sampleRate),22050,96000);
    const offline=new OfflineAudioContextConstructor(2,Math.ceil(seconds*sampleRate),sampleRate);
    const g=await buildGraph(offline,true,0,time);g.master.gain.setValueAtTime(0,0);g.master.gain.linearRampToValueAtTime(clamp(masterVolume,0,1),.12);
    for(let t=0;t<=seconds;t+=1/30)g.apply({time:time+t,wind,cameraPosition,cameraForward,swellEnvelope:typeof swellEnvelope==='function'?swellEnvelope(time+t):swellEnvelope},t);
    const splashResponses=[];
    for(const event of splashEvents){
      const at=clamp(finite(event.at),0,seconds-.01),parameters=splashAudioParameters(event.strength,event.impact||event,0,{offline:true});
      splashResponses.push({at,...parameters});if(!parameters.valid)continue;
      attachSplashAudio(offline,g.master,g.splashBuffers[0],[finite(event.x),.03,finite(event.z)],vec(cameraPosition),parameters,at);
    }
    g.master.gain.setValueAtTime(clamp(masterVolume,0,1),Math.max(.12,seconds-.16));g.master.gain.linearRampToValueAtTime(0,seconds);
    const buffer=await offline.startRendering(),report={...audioPCMStats(buffer),seconds,sampleRate,decoded:{...g.decoded},mix:{...g.mix},peakGuard:{...g.peakGuard},splashResponses,note:'Same Web Audio graph; recorded samples + authored energy response, not acoustic pressure simulation.'};
    g.dispose();return {buffer,wav:encodeAudioWav(buffer),report};
  }
  function startCapture() {
    if(!enabled||!graph||disposed)throw new Error('Enable and load sound before starting an audio capture.');
    if(!captureTap){captureTap=context.createMediaStreamDestination();graph.output.connect(captureTap);}
    return captureTap.stream;
  }
  function stopCapture() {
    if(!captureTap)return;
    try{graph?.output.disconnect(captureTap);}catch{}
    captureTap.stream.getTracks().forEach(track=>track.stop());captureTap=null;
  }
  const api={setEnabled,update,splash,renderOffline,startCapture,stopCapture,
    get context(){return context;},get eventOutput(){return graph?.master||null;},
    get state(){return {enabled,contextState:context?.state||'not-created',loading:!!loading&&!graph,loaded:!!graph,peakGuard:graph?{...graph.peakGuard}:null,decoded:JSON.parse(JSON.stringify(decoded)),sources:Object.values(SOUND_SOURCES).map(s=>s.name),mix:{...lastMix},paused:!!last.paused,splashCount,audibleSplashes,activeSplashes:activeSplashes.size,lastSplashResponse,loopSources:graph?.sources.length||0,captureActive:!!captureTap,fallbacks:['procedural stone splash',...(proceduralAir?['quiet shaped-noise air bed']:[]),...warnings],warnings:[...warnings]};},
    dispose(){stopCapture();disposed=true;enabled=false;epoch++;clearTimeout(suspendTimer);for(const item of activeSplashes){try{item.source.stop();}catch{}for(const n of Object.values(item))try{n.disconnect();}catch{}}activeSplashes.clear();graph?.dispose();context?.close().catch(()=>{});}
  };
  return api;
}
