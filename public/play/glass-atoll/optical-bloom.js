// One normalized, threshold-free linear-HDR camera PSF. Flare is deliberately
// opt-in; it redistributes the SAME budget instead of adding a second bloom.
// This is an image-space, finite-energy approximation, not measured lens tracing.
const freezeRGB=values=>Object.freeze(values);
export const OPTICAL_PSF_KERNEL=Object.freeze({
  bloomWeights:freezeRGB([.4,.3,.2,.1]),
  ghosts:Object.freeze([
    Object.freeze({scale:-.72,weightsRGB:freezeRGB([.48,.44,.36])}),
    Object.freeze({scale:-.48,weightsRGB:freezeRGB([.32,.36,.40])}),
    Object.freeze({scale:.86,weightsRGB:freezeRGB([.20,.20,.24])}),
  ]),
  veilScale:.24,
});

// A25-sample, sigma2 Gaussian truncated at6sigma. Adjacent positive taps
// share one bilinear fetch: centre + six pairs on each side =13 fetches.
// This is a new bounded PSF option; the legacy pyramid stays unchanged.
const gaussianSigma=2,gaussianRadius=12;
const gaussianRaw=Array.from({length:2*gaussianRadius+1},(_,i)=>Math.exp(-.5*((i-gaussianRadius)/gaussianSigma)**2));
const gaussianMass=gaussianRaw.reduce((sum,value)=>sum+value,0);
const gaussianWeights=gaussianRaw.map(value=>value/gaussianMass);
const gaussianFetches=[{offset:0,weight:gaussianWeights[gaussianRadius]}];
for(let i=1;i<gaussianRadius;i+=2){
  const a=gaussianWeights[gaussianRadius+i],b=gaussianWeights[gaussianRadius+i+1],weight=a+b,offset=(i*a+(i+1)*b)/weight;
  gaussianFetches.push({offset:-offset,weight},{offset,weight});
}
export const OPTICAL_GAUSSIAN_PSF_KERNEL=Object.freeze({sigmaPixels:gaussianSigma,radiusPixels:gaussianRadius,
  weights:Object.freeze(gaussianWeights),fetches:Object.freeze(gaussianFetches.map(Object.freeze)),
  discreteTaps:25,textureFetchesPerAxis:13,axes:2,supportSigma:6,
  scope:'positive normalized finite discrete Gaussian; bilinear pair reconstruction at same-resolution texel centres; finite sensor crop and float rounding remain'});

function validateBloomStrength(value){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw new RangeError('Optical PSF bloomStrength must be a finite number from 0 to 1.');
}
export function opticalPSFBudget({bloom=true,flare=false,bloomStrength=1}={}){
  if(typeof bloom!=='boolean'||typeof flare!=='boolean')throw new TypeError('Optical PSF bloom/flare must be booleans.');
  validateBloomStrength(bloomStrength);
  const b=bloom?(flare?.013:.018)*bloomStrength:0,g=flare?.003:0,v=flare?.002:0;
  const total=b+(flare?.005:0);
  return{direct:1-total,bloom:b,ghost:g,veil:v,total};
}

// For sourceUV=.5+s*(destinationUV-.5), |s|<=1 expands source features.
// d(sourceUV)/d(destinationUV)=s^2: this Jacobian conserves continuous flux
// before the finite sensor crops it. RGB coating weights sum to one per channel.
// Positive normalized blur, bilinear interpolation, |s|^2<=1 and nonnegative
// mixture weights also give an L-infinity bound <=1, unlike focusing ghosts.
const glslNumber=value=>Number.isInteger(value)?`${value}.`:String(value);
const ghostGLSL=OPTICAL_PSF_KERNEL.ghosts.map(({scale,weightsRGB})=>
  `zeroOutside(t1,vec2(.5)+${glslNumber(scale)}*centred)*${glslNumber(scale*scale)}*vec3(${weightsRGB.map(glslNumber).join(',')})`).join('+');

function captureTargetState(THREE,renderer){
  const gl=renderer.getContext();
  return{target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),
    viewport:renderer.getCurrentViewport(new THREE.Vector4()),scissor:Array.from(gl.getParameter(gl.SCISSOR_BOX)),scissorTest:gl.isEnabled(gl.SCISSOR_TEST),
    readFramebuffer:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),readBuffer:gl.getParameter(gl.READ_BUFFER),autoClear:renderer.autoClear,xr:renderer.xr.enabled};
}
function restoreTargetState(renderer,saved){
  const target=saved.target,viewport=target?.viewport.clone(),scissor=target?.scissor.clone(),test=target?.scissorTest;
  try{
    // setRenderTarget normally restores the target's stored rectangle, which may
    // differ from the caller's current viewport/scissor. Restore both without
    // permanently changing the target's metadata or global logical rectangles.
    if(target){target.viewport.copy(saved.viewport);target.scissor.fromArray(saved.scissor);target.scissorTest=saved.scissorTest;}
    renderer.setRenderTarget(target,saved.face,saved.mip);
  }finally{if(target){target.viewport.copy(viewport);target.scissor.copy(scissor);target.scissorTest=test;}}
  const gl=renderer.getContext();
  renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER,saved.readFramebuffer);gl.readBuffer(saved.readBuffer);
  renderer.autoClear=saved.autoClear;renderer.xr.enabled=saved.xr;
}

export function createOpticalBloom(THREE,renderer,options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='quality'))throw new TypeError('Optical PSF options require only quality.');
  const quality=options.quality===undefined?'legacy':options.quality;if(quality!=='legacy'&&quality!=='gaussian')throw new RangeError('Optical PSF quality requires legacy or gaussian.');
  const targetOptions={type:THREE.HalfFloatType,depthBuffer:false,stencilBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter};
  const targets=Array.from({length:4},()=>new THREE.WebGLRenderTarget(1,1,targetOptions));
  const scratch=quality==='gaussian'?targets.map(()=>new THREE.WebGLRenderTarget(1,1,targetOptions)):[];
  const result=new THREE.WebGLRenderTarget(1,1,targetOptions);
  for(const target of [...targets,...scratch,result]){target.texture.colorSpace=THREE.NoColorSpace;target.texture.generateMipmaps=false;}
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1),geometry=new THREE.PlaneGeometry(2,2);
  const uniforms={tInput:{value:null},uPixel:{value:new THREE.Vector2()},t0:{value:targets[0].texture},t1:{value:targets[1].texture},t2:{value:targets[2].texture},t3:{value:targets[3].texture},uBudget:{value:new THREE.Vector4(.982,.018,0,0)},uFlare:{value:0}};
  const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const down=new THREE.ShaderMaterial({name:'Normalized camera PSF downsample',uniforms,vertexShader,depthTest:false,depthWrite:false,toneMapped:false,fragmentShader:`precision highp float;uniform highp sampler2D tInput;uniform vec2 uPixel;varying vec2 vUv;
    void main(){vec3 c=texture2D(tInput,vUv).rgb*.25;
      c+=(texture2D(tInput,vUv+uPixel*vec2(1,0)).rgb+texture2D(tInput,vUv-uPixel*vec2(1,0)).rgb+texture2D(tInput,vUv+uPixel*vec2(0,1)).rgb+texture2D(tInput,vUv-uPixel*vec2(0,1)).rgb)*.125;
      c+=(texture2D(tInput,vUv+uPixel).rgb+texture2D(tInput,vUv-uPixel).rgb+texture2D(tInput,vUv+uPixel*vec2(1,-1)).rgb+texture2D(tInput,vUv+uPixel*vec2(-1,1)).rgb)*.0625;gl_FragColor=vec4(c,1.);}`});
  const gaussianUniforms=quality==='gaussian'?{tInput:uniforms.tInput,uPixel:uniforms.uPixel,uAxis:{value:new THREE.Vector2(1,0)}}:null;
  const gaussian=quality==='gaussian'?new THREE.ShaderMaterial({name:'Normalized6sigma Gaussian camera PSF',uniforms:gaussianUniforms,vertexShader,depthTest:false,depthWrite:false,toneMapped:false,fragmentShader:`precision highp float;uniform highp sampler2D tInput;uniform vec2 uPixel,uAxis;varying vec2 vUv;
    void main(){vec3 c=vec3(0.);
      ${OPTICAL_GAUSSIAN_PSF_KERNEL.fetches.map(tap=>`c+=texture2D(tInput,vUv+uPixel*uAxis*${glslNumber(tap.offset)}).rgb*${glslNumber(tap.weight)};`).join('\n      ')}
      gl_FragColor=vec4(c,1.);}`}):null;
  const combine=new THREE.ShaderMaterial({name:'Single finite-energy camera PSF / optional ghost and veil',uniforms,vertexShader,depthTest:false,depthWrite:false,toneMapped:false,fragmentShader:`precision highp float;uniform highp sampler2D tInput,t0,t1,t2,t3;uniform vec4 uBudget;uniform float uFlare;varying vec2 vUv;
    vec3 zeroOutside(highp sampler2D image,vec2 uv){
      if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec3(0.);
      return texture2D(image,uv).rgb;
    }
    void main(){
      vec3 original=texture2D(tInput,vUv).rgb,spread=vec3(0.);
      if(uBudget.y>0.)spread=.4*texture2D(t0,vUv).rgb+.3*texture2D(t1,vUv).rgb+.2*texture2D(t2,vUv).rgb+.1*texture2D(t3,vUv).rgb;
      // Exact legacy expression and kernel when flare is disabled.
      if(uFlare<.5){gl_FragColor=vec4(mix(original,spread,uBudget.y),1.);return;}
      vec2 centred=vUv-vec2(.5);
      vec3 ghost=${ghostGLSL};
      vec3 veil=zeroOutside(t3,vec2(.5)+${glslNumber(OPTICAL_PSF_KERNEL.veilScale)}*centred)*${glslNumber(OPTICAL_PSF_KERNEL.veilScale**2)};
      gl_FragColor=vec4(uBudget.x*original+uBudget.y*spread+uBudget.z*ghost+uBudget.w*veil,1.);
    }`});
  const quad=new THREE.Mesh(geometry,down);quad.frustumCulled=false;scene.add(quad);
  let configuration={bloom:true,flare:false,bloomStrength:1},budget=opticalPSFBudget(configuration),width=1,height=1,disposed=false;
  const enabled=()=>budget.total>0;
  function ensureLive(){if(disposed)throw new Error('Optical PSF has been disposed.');}
  function state(){
    const ghostBoundRGB=[0,1,2].map(c=>OPTICAL_PSF_KERNEL.ghosts.reduce((sum,kernel)=>sum+kernel.weightsRGB[c]*kernel.scale**2,0));
    return{enabled:enabled(),bloom:configuration.bloom,flare:configuration.flare,bloomStrength:configuration.bloomStrength,strength:budget.total,budget:{...budget},levels:4,quality,passes:enabled()?(quality==='gaussian'?13:5):0,
      gaussianKernel:quality==='gaussian'?{sigmaPixels:gaussianSigma,radiusPixels:gaussianRadius,supportSigma:6,discreteTaps:25,textureFetchesPerAxis:13,passesPerLevel:2}:null,
      operatorPeakBoundRGB:ghostBoundRGB.map(g=>budget.direct+budget.bloom+budget.ghost*g+budget.veil*OPTICAL_PSF_KERNEL.veilScale**2),
      model:quality==='gaussian'?'single threshold-free linear HDR PSF with positive6sigma separable Gaussian after each downsample; at most1.8% radiance redistribution':'single threshold-free linear HDR PSF; opt-in affine ghost/veil share at most 1.8% radiance redistribution',
      flareScope:'visible input image only; finite sensor crop, no offscreen-source/lens-tracing/occlusion inference'};
  }
  return{
    configure(value){
      ensureLive();let next;
      // Legacy bool calls switch the effects while retaining the chosen amount.
      if(typeof value==='boolean')next={...configuration,bloom:value,flare:false};
      else if(value&&typeof value==='object'&&!Array.isArray(value)){
        for(const key of Object.keys(value)){
          if(key!=='bloom'&&key!=='flare'&&key!=='bloomStrength')throw new TypeError(`Unknown optical PSF option: ${key}`);
          if(key==='bloomStrength')validateBloomStrength(value[key]);
          if(key!=='bloomStrength'&&typeof value[key]!=='boolean')throw new TypeError(`Optical PSF ${key} must be boolean.`);
        }
        next={...configuration,...value};
      }else throw new TypeError('Optical PSF configure expects a bool or {bloom,flare,bloomStrength}.');
      const nextBudget=opticalPSFBudget(next);configuration=next;budget=nextBudget;
      uniforms.uBudget.value.set(budget.direct,budget.bloom,budget.ghost,budget.veil);uniforms.uFlare.value=configuration.flare?1:0;
      return state();
    },
    setSize(w,h){
      ensureLive();if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1)throw new RangeError('Optical PSF dimensions must be positive finite pixels.');
      width=Math.round(w);height=Math.round(h);
      targets.forEach((target,i)=>{const w=Math.max(1,Math.ceil(width/2**(i+1))),h=Math.max(1,Math.ceil(height/2**(i+1)));target.setSize(w,h);scratch[i]?.setSize(w,h);});result.setSize(width,height);
    },
    render(texture){
      ensureLive();if(!enabled())return texture;
      const previous=captureTargetState(THREE,renderer);
      try{
        renderer.xr.enabled=false;let input=texture,w=width,h=height;quad.material=down;
        for(let i=0;i<targets.length;i++){
          const target=targets[i];quad.material=down;uniforms.tInput.value=input;uniforms.uPixel.value.set(1/w,1/h);renderer.setRenderTarget(target);renderer.render(scene,camera);
          if(gaussian){
            quad.material=gaussian;uniforms.uPixel.value.set(1/target.width,1/target.height);uniforms.tInput.value=target.texture;gaussianUniforms.uAxis.value.set(1,0);renderer.setRenderTarget(scratch[i]);renderer.render(scene,camera);
            uniforms.tInput.value=scratch[i].texture;gaussianUniforms.uAxis.value.set(0,1);renderer.setRenderTarget(target);renderer.render(scene,camera);
          }
          input=target.texture;w=target.width;h=target.height;
        }
        uniforms.tInput.value=texture;quad.material=combine;renderer.setRenderTarget(result);renderer.render(scene,camera);return result.texture;
      }finally{restoreTargetState(renderer,previous);}
    },
    get resultTarget(){return enabled()?result:null;},get state(){return state();},
    dispose(){if(disposed)return;disposed=true;targets.forEach(target=>target.dispose());scratch.forEach(target=>target.dispose());result.dispose();geometry.dispose();down.dispose();gaussian?.dispose();combine.dispose();}
  };
}
