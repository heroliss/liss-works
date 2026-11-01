import {waveComponents,waveCascades,waveStatistics,seaStateDefaults,sanitizeSeaState,evaluateWaveSpectrum} from './waves.js';

// Four metre-scale periodic Fourier fields, evaluated on GPU once per frame.
// This is a 256-mode linear directional spectrum, not an FFT or Navier–Stokes.
// Independent domains and dense random modes remove the old sparse crosshatch.
export function createWaveSpectrum(THREE,renderer,{resolution=256,seaState=seaStateDefaults}={}){
  let physicalSeaState=sanitizeSeaState(seaState);
  const targets=waveCascades.map((band,i)=>{
    const target=new THREE.WebGLRenderTarget(resolution,resolution,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,depthBuffer:false,stencilBuffer:false,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping});
    target.texture.name=`Spectrum ${i}: height, slope and squared slope / ${band.domain} m`;
    target.texture.colorSpace=THREE.NoColorSpace;return target;
  });
  const materials=waveCascades.map((band,index)=>{
    const modes=waveComponents.filter(w=>w.cascade===index);
    const sum=modes.map((w,i)=>{
      const kx=2*Math.PI*w.modeX/band.domain,kz=2*Math.PI*w.modeZ/band.domain;
      return `a=dot(p,vec2(${kx.toFixed(10)},${kz.toFixed(10)}))+uPhases[${i}];h+=${w.amplitude.toFixed(10)}*sin(a);s+=vec2(${(w.amplitude*kx).toFixed(10)},${(w.amplitude*kz).toFixed(10)})*cos(a);`;
    }).join('\n');
    return new THREE.ShaderMaterial({name:`Dense directional spectrum ${index}`,depthTest:false,depthWrite:false,toneMapped:false,
      uniforms:{uPhases:{value:new Float32Array(modes.length)}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`precision highp float;varying vec2 vUv;uniform float uPhases[${modes.length}];void main(){vec2 p=vUv*${band.domain.toFixed(8)};float h=0.,a;vec2 s=vec2(0.);${sum}\ngl_FragColor=vec4(h,s,dot(s,s));}`});
  });
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,2),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),materials[0]);scene.add(quad);
  // Base fields remain in physical default units, so their moment mips keep
  // one stable interpretation. Per-system gains are applied together to
  // height/slope and squared to variance by the shared waterField GLSL.
  const uniforms={uWaveDomains:{value:new THREE.Vector4(...waveCascades.map(w=>w.domain))},uWaveResolution:{value:resolution},uSwell:{value:physicalSeaState.swellHeight/seaStateDefaults.swellHeight},uWindSea:{value:physicalSeaState.windSea}};
  targets.forEach((target,i)=>uniforms[`uWave${i}`]={value:target.texture});
  const modes=waveCascades.map((_,i)=>waveComponents.filter(w=>w.cascade===i));
  let lastTime=null,updates=0;
  function update(time,force=false){
    if(!force&&time===lastTime)return;
    const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
    try{
      for(let i=0;i<4;i++){
        const phases=materials[i].uniforms.uPhases.value;
        modes[i].forEach((w,j)=>{const omega=Math.sqrt((9.81*w.k+.000070244*w.k**3)*Math.tanh(Math.min(w.k*3,4)));phases[j]=((w.phase-omega*time)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);});
        // CPU double precision phase wrapping avoids high-frequency phase
        // quantisation after the page has been left running for many hours.
        quad.material=materials[i];renderer.setRenderTarget(targets[i]);renderer.render(scene,camera);
      }
    }finally{renderer.setRenderTarget(previous,face,mip);}
    lastTime=time;updates++;
  }
  function setSeaState(next={}){
    physicalSeaState=sanitizeSeaState(next,physicalSeaState);
    uniforms.uSwell.value=physicalSeaState.swellHeight/seaStateDefaults.swellHeight;
    uniforms.uWindSea.value=physicalSeaState.windSea;
    return {...physicalSeaState};
  }
  return {uniforms,targets,update,setSeaState,
    setResolution(value){const next=[256,512,1024].includes(Number(value))?Number(value):512;if(next===resolution)return;resolution=next;targets.forEach(t=>t.setSize(next,next));uniforms.uWaveResolution.value=next;lastTime=null;},
    sample(x,z,time,options={}){return evaluateWaveSpectrum(x,z,time,{...options,seaState:physicalSeaState});},
    get state(){return{...waveStatistics,seaState:{...physicalSeaState},swell:{peakPeriodSeconds:7.5,referenceSignificantHeightMetres:seaStateDefaults.swellHeight,directionRadians:waveCascades[0].direction,directionalSpreadRadians:waveCascades[0].directionSpread,frequencyStdFraction:.16,windIndependent:true},windSea:{peakPeriodSeconds:waveCascades[1].peakPeriod,frequencyShape:'JONSWAP-shaped, gamma3.3, log-k importance weighted; no fetch/growth solve'},domainsMetres:waveCascades.map(b=>b.domain),resolution,updates,time:lastTime,channels:['height','slopeX','slopeZ','slopeSquared'],method:'256-mode GPU Fourier synthesis: independent narrow swell + broader wind sea, mipmapped slope moments; non-FFT',phasePrecision:'CPU double precision modulo 2pi each frame',limitations:['reference-depth3m analytic spectrum; no ray-traced bathymetric refraction','linear superposition, no overturning or full nonlinear wave interactions','SWE boundary swell is a separate lower-frequency resolved system']};},
    dispose(){targets.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());quad.geometry.dispose();}};
}
