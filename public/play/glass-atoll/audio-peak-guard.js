export const AUDIO_PEAK_GUARD=Object.freeze({ceiling:.975,lookaheadSeconds:.005,releaseSeconds:.08});

const workletLoads=new WeakMap();
export async function createAudioPeakGuard(context,{onWarning=()=>{}}={}) {
  if(context.audioWorklet&&typeof globalThis.AudioWorkletNode==='function'){
    try{
      if(!workletLoads.has(context))workletLoads.set(context,context.audioWorklet.addModule(new URL('./audio-peak-worklet.js',import.meta.url).href));
      await workletLoads.get(context);
      const node=new AudioWorkletNode(context,'atoll-peak-guard',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'});
      return{node,mode:'linked-stereo-lookahead',...AUDIO_PEAK_GUARD};
    }catch(error){onWarning('音频峰值预读保护不可用，改用软峰值保护：'+error.message);}
  }
  // Compatibility path: continuous slope at the knee, bounded at +/-0.975.
  // This reshapes only the loudest peaks and introduces no additional delay.
  const node=context.createWaveShaper(),curve=new Float32Array(65537),knee=.8,span=AUDIO_PEAK_GUARD.ceiling-knee;
  for(let i=0;i<curve.length;i++){
    const x=i/(curve.length-1)*2-1,a=Math.abs(x);
    curve[i]=Math.sign(x)*(a<=knee?a:knee+span*(1-Math.exp(-(a-knee)/span)));
  }
  node.curve=curve;
  return{node,mode:'soft-peak-fallback',...AUDIO_PEAK_GUARD,lookaheadSeconds:0};
}
