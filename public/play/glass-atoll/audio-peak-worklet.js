import {AudioPeakKernel} from './audio-peak-kernel.js';

class AtollPeakGuard extends AudioWorkletProcessor {
  constructor(){super();this.kernel=new AudioPeakKernel({sampleRate});}
  process(inputs,outputs){this.kernel.process(inputs[0]||[],outputs[0]);return true;}
}
registerProcessor('atoll-peak-guard',AtollPeakGuard);
