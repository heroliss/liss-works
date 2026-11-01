// Pure, shared incident swell definition. No renderer, clocks or state mutation.
import {waveComponents,waveOmega,seaStateDefaults} from './waves.js';

export const SHORELINE_SWELL_MODES=Object.freeze(waveComponents.filter(w=>w.kind==='swell').map(w=>Object.freeze({
  k:w.k,kx:w.k*Math.cos(w.angle),kz:w.k*Math.sin(w.angle),dx:Math.cos(w.angle),dz:Math.sin(w.angle),amplitude:w.amplitude,omega:waveOmega(w.k),phase:w.phase,
})));
export const SHORELINE_BOUNDARY_LIMITS=Object.freeze({modeCount:64,maximumSwellHeightMetres:.32,referenceDepthMetres:3});
if(SHORELINE_SWELL_MODES.length!==64)throw new Error('Shoreline boundary requires the declared native64-mode swell');

export function createShorelineBoundary({swellHeight=seaStateDefaults.swellHeight,startTime=0,rampSeconds=6}={}){
  if(!Number.isFinite(swellHeight)||swellHeight<0||swellHeight>.32)throw new RangeError('swellHeight must be within0..0.32m');
  if(!Number.isFinite(startTime)||!Number.isFinite(rampSeconds)||rampSeconds<0||rampSeconds>60)throw new RangeError('Finite startTime and rampSeconds0..60 required');
  const gain=swellHeight/seaStateDefaults.swellHeight;
  function ramp(time){const a=rampSeconds===0?1:Math.max(0,Math.min(1,(time-startTime)/rampSeconds));return a*a*(3-2*a);}
  function phases(time){if(!Number.isFinite(time))throw new RangeError('Finite physical boundary time required');return SHORELINE_SWELL_MODES.map(w=>((w.phase-w.omega*time)%(2*Math.PI)+2*Math.PI)%(2*Math.PI));}
  function sample(x,z,restDepth,time,outwardNormal=null){
    if(![x,z,restDepth,time].every(Number.isFinite)||!(restDepth>0))throw new RangeError('Finite position/time and positive restDepth required');
    if(outwardNormal&&(!Array.isArray(outwardNormal)||outwardNormal.length!==2||!outwardNormal.every(Number.isFinite)||Math.abs(Math.hypot(...outwardNormal)-1)>1e-10))throw new RangeError('Outward normal must be a unit2-vector');
    let eta=0,u=0,v=0;const impedance=Math.sqrt(9.81/restDepth),scale=gain*ramp(time);
    for(const w of SHORELINE_SWELL_MODES){
      if(outwardNormal&&w.dx*outwardNormal[0]+w.dz*outwardNormal[1]>=0)continue;
      const h=w.amplitude*scale*Math.sin(w.kx*x+w.kz*z-w.omega*time+w.phase);eta+=h;u+=h*impedance*w.dx;v+=h*impedance*w.dz;
    }
    return{eta,u,v};
  }
  return Object.freeze({sample,phases,ramp,gain,
    settings:Object.freeze({swellHeight,startTime,rampSeconds}),
    amplitudeSupportMetres:gain*SHORELINE_SWELL_MODES.reduce((s,w)=>s+Math.abs(w.amplitude),0),
    limits:Object.freeze(['Same native64 swell modes and absolute phases; wind sea and legacy20s boundary are not added.',
      'Boundary velocity uses depth-averaged linear long-wave impedance sqrt(g/h); not a dispersive/Boussinesq continuation or bathymetric ray refraction.',
      'Only modes directed into each open edge are prescribed; outgoing characteristic is retained. Oblique transparency is approximate.'])});
}
