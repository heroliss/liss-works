// Stereo-linked peak control. The peak window contains the delayed output
// sample and its following lookahead, so gain never exceeds its safe value.
// No normalization: below the ceiling, untouched audio passes at gain one.
export class AudioPeakKernel {
  constructor({sampleRate=48000,channels=2,lookaheadSeconds=.005,ceiling=.975,releaseSeconds=.08}={}) {
    this.delayFrames=Math.max(1,Math.ceil(sampleRate*lookaheadSeconds));
    this.ceiling=ceiling;
    this.release=Math.exp(-1/(sampleRate*releaseSeconds));
    this.buffers=Array.from({length:channels},()=>new Float32Array(this.delayFrames));
    this.queueSize=this.delayFrames+2;
    this.peaks=new Float32Array(this.queueSize);
    this.indices=new Float64Array(this.queueSize);
    this.head=0;this.tail=0;this.frame=0;this.gain=1;this.reductions=0;
  }
  process(input,output) {
    const frames=output[0]?.length??0;
    for(let i=0;i<frames;i++){
      const slot=this.frame%this.delayFrames;
      let peak=0;
      for(let c=0;c<this.buffers.length;c++){
        const value=input[c]?.[i]??0;
        // Invalid upstream samples must never poison the gain envelope.
        const clean=Number.isFinite(value)?value:0;
        output[c][i]=this.buffers[c][slot];
        this.buffers[c][slot]=clean;
        peak=Math.max(peak,Math.abs(clean));
      }
      while(this.head!==this.tail&&this.indices[this.head]<this.frame-this.delayFrames)this.head=(this.head+1)%this.queueSize;
      while(this.head!==this.tail){
        const previous=(this.tail-1+this.queueSize)%this.queueSize;
        if(this.peaks[previous]>peak)break;
        this.tail=previous;
      }
      this.peaks[this.tail]=peak;this.indices[this.tail]=this.frame;
      this.tail=(this.tail+1)%this.queueSize;
      const desired=Math.min(1,this.ceiling/Math.max(this.peaks[this.head],1e-20));
      this.gain=desired<this.gain?desired:desired+(this.gain-desired)*this.release;
      if(this.gain<.99999)this.reductions++;
      for(let c=0;c<this.buffers.length;c++)output[c][i]*=this.gain;
      this.frame++;
    }
  }
}
