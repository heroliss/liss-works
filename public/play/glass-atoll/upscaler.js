/*
 * FSR1 EASU/RCAS float32 algorithm port for WebGL2.
 * Derived from AMD FidelityFX FSR, commit a21ffb8f6c13233ba336352bdff293894c706575.
 * Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * Adaptation: integer RGB fetches replace unavailable gather callbacks; exact
 * reciprocal/inverse-square-root replace AMD bit-level approximations. The
 * 12-tap directional EASU kernel, deringing, and RCAS limiters are retained.
 * Input is ALREADY tone-mapped and sRGB-encoded [0,1], stored in a NoColorSpace
 * RGBA target. There is no tone mapping or transfer function in these passes.
 */

export const FSR1_SOURCE_COMMIT='a21ffb8f6c13233ba336352bdff293894c706575';
export function fsrEasuConstants(inputWidth,inputHeight,outputWidth,outputHeight){
  return [inputWidth/outputWidth,inputHeight/outputHeight,.5*inputWidth/outputWidth-.5,.5*inputHeight/outputHeight-.5];
}
const vertexShader=/* glsl */`
  precision highp float;
  in vec3 position;
  out vec2 vUv;
  void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}
`;
const common=/* glsl */`
  precision highp float;
  precision highp int;
  uniform sampler2D uInput;
  uniform ivec2 uInputSize;
  in vec2 vUv;
  out vec4 outColor;
  vec3 fsrLoad(ivec2 p){return texelFetch(uInput,clamp(p,ivec2(0),uInputSize-1),0).rgb;}
  float fsrLuma2(vec3 c){return c.b*.5+(c.r*.5+c.g);}
`;
export const fsrEasuFragmentShader=/* glsl */`${common}
  uniform vec4 uCon0;
  void fsrEasuSet(inout vec2 dir,inout float len,float w,float a,float b,float c,float d,float e){
    float dx=d-b,dy=e-a;
    dir+=vec2(dx,dy)*w;
    float lx=clamp(abs(dx)/max(max(abs(d-c),abs(c-b)),1e-8),0.,1.);
    float ly=clamp(abs(dy)/max(max(abs(e-c),abs(c-a)),1e-8),0.,1.);
    len+=(lx*lx+ly*ly)*w;
  }
  void fsrEasuTap(inout vec3 colour,inout float weight,vec2 off,vec2 dir,vec2 len,float lob,float clp,vec3 c){
    vec2 v=vec2(off.x*dir.x+off.y*dir.y,-off.x*dir.y+off.y*dir.x)*len;
    float d2=min(dot(v,v),clp);
    float wB=.4*d2-1.,wA=lob*d2-1.;
    wB*=wB;wA*=wA;
    wB=1.5625*wB-.5625;
    float w=wB*wA;colour+=c*w;weight+=w;
  }
  void main(){
    // FsrEasuCon: ip * input/output + (0.5*input/output - 0.5).
    vec2 pp=vec2(ivec2(gl_FragCoord.xy))*uCon0.xy+uCon0.zw;
    ivec2 fp=ivec2(floor(pp));pp-=vec2(fp);
    // Exactly the RGB samples referenced by the official gather callbacks:
    //     b c
    //   e f g h
    //   i j k l
    //     n o
    vec3 b=fsrLoad(fp+ivec2(0,-1)),c=fsrLoad(fp+ivec2(1,-1));
    vec3 e=fsrLoad(fp+ivec2(-1,0)),f=fsrLoad(fp),g=fsrLoad(fp+ivec2(1,0)),h=fsrLoad(fp+ivec2(2,0));
    vec3 i=fsrLoad(fp+ivec2(-1,1)),j=fsrLoad(fp+ivec2(0,1)),k=fsrLoad(fp+ivec2(1,1)),l=fsrLoad(fp+ivec2(2,1));
    vec3 n=fsrLoad(fp+ivec2(0,2)),o=fsrLoad(fp+ivec2(1,2));
    float bL=fsrLuma2(b),cL=fsrLuma2(c),eL=fsrLuma2(e),fL=fsrLuma2(f),gL=fsrLuma2(g),hL=fsrLuma2(h);
    float iL=fsrLuma2(i),jL=fsrLuma2(j),kL=fsrLuma2(k),lL=fsrLuma2(l),nL=fsrLuma2(n),oL=fsrLuma2(o);
    vec2 dir=vec2(0);float len=0.;
    fsrEasuSet(dir,len,(1.-pp.x)*(1.-pp.y),bL,eL,fL,gL,jL);
    fsrEasuSet(dir,len,pp.x*(1.-pp.y),cL,fL,gL,hL,kL);
    fsrEasuSet(dir,len,(1.-pp.x)*pp.y,fL,iL,jL,kL,nL);
    fsrEasuSet(dir,len,pp.x*pp.y,gL,jL,kL,lL,oL);
    float dirR=dot(dir,dir);bool zero=dirR<1./32768.;
    float reciprocalLength=zero?1.:inversesqrt(dirR);
    dir.x=zero?1.:dir.x;dir*=reciprocalLength;
    len*=.5;len*=len;
    float stretch=dot(dir,dir)/max(max(abs(dir.x),abs(dir.y)),1e-8);
    vec2 anisotropy=vec2(1.+(stretch-1.)*len,1.-.5*len);
    float lob=.5+(.21-.5)*len,clp=1./lob;
    vec3 minimum=min(min(f,g),min(j,k)),maximum=max(max(f,g),max(j,k));
    vec3 accumulated=vec3(0);float accumulatedWeight=0.;
    fsrEasuTap(accumulated,accumulatedWeight,vec2(0,-1)-pp,dir,anisotropy,lob,clp,b);
    fsrEasuTap(accumulated,accumulatedWeight,vec2(1,-1)-pp,dir,anisotropy,lob,clp,c);
    fsrEasuTap(accumulated,accumulatedWeight,vec2(-1,1)-pp,dir,anisotropy,lob,clp,i);
    fsrEasuTap(accumulated,accumulatedWeight,vec2(0,1)-pp,dir,anisotropy,lob,clp,j);
    fsrEasuTap(accumulated,accumulatedWeight,-pp,dir,anisotropy,lob,clp,f);
    fsrEasuTap(accumulated,accumulatedWeight,vec2(-1,0)-pp,dir,anisotropy,lob,clp,e);
    fsrEasuTap(accumulated,accumulatedWeight,vec2(1,1)-pp,dir,anisotropy,lob,clp,k);
    fsrEasuTap(accumulated,accumulatedWeight,vec2(2,1)-pp,dir,anisotropy,lob,clp,l);
    fsrEasuTap(accumulated,accumulatedWeight,vec2(2,0)-pp,dir,anisotropy,lob,clp,h);
    fsrEasuTap(accumulated,accumulatedWeight,vec2(1,0)-pp,dir,anisotropy,lob,clp,g);
    fsrEasuTap(accumulated,accumulatedWeight,vec2(1,2)-pp,dir,anisotropy,lob,clp,o);
    fsrEasuTap(accumulated,accumulatedWeight,vec2(0,2)-pp,dir,anisotropy,lob,clp,n);
    outColor=vec4(clamp(accumulated/max(accumulatedWeight,1e-8),minimum,maximum),1.);
  }
`;
export const fsrRcasFragmentShader=/* glsl */`${common}
  uniform float uSharpness;
  void main(){
    ivec2 p=ivec2(gl_FragCoord.xy);
    vec3 b=fsrLoad(p+ivec2(0,-1)),d=fsrLoad(p+ivec2(-1,0)),e=fsrLoad(p),f=fsrLoad(p+ivec2(1,0)),h=fsrLoad(p+ivec2(0,1));
    vec3 mn4=min(min(b,d),min(f,h)),mx4=max(max(b,d),max(f,h));
    // Defined black/white limits replace the source's zero-divide corner cases.
    vec3 hitMin=min(mn4,e)/max(4.*mx4,vec3(1e-8));
    vec3 hitMax=(vec3(1)-max(mx4,e))/min(4.*mn4-vec3(4),vec3(-1e-8));
    vec3 channelLobe=max(-hitMin,hitMax);
    float lobe=max(-.1875,min(max(max(channelLobe.r,channelLobe.g),channelLobe.b),0.))*uSharpness;
    #ifdef FSR_RCAS_DENOISE
      float bL=fsrLuma2(b),dL=fsrLuma2(d),eL=fsrLuma2(e),fL=fsrLuma2(f),hL=fsrLuma2(h);
      float maximum=max(max(max(bL,dL),eL),max(fL,hL));
      float minimum=min(min(min(bL,dL),eL),min(fL,hL));
      float noise=clamp(abs(.25*(bL+dL+fL+hL)-eL)/max(maximum-minimum,1e-8),0.,1.);
      lobe*=1.-.5*noise;
    #endif
    vec3 colour=(e+lobe*(b+d+f+h))/(1.+4.*lobe);
    outColor=vec4(clamp(colour,0.,1.),1.);
  }
`;
const copyFragmentShader=/* glsl */`${common}
  void main(){outColor=vec4(fsrLoad(ivec2(gl_FragCoord.xy)),1.);}
`;

/** Input/output dimensions are PHYSICAL pixels, not CSS pixels. */
export function createSpatialUpscaler(THREE,renderer,{sharpnessStops=.7,denoise=true,precompile=true}={}) {
  if(!renderer?.capabilities?.isWebGL2)throw new Error('FSR1 spatial upscaler requires WebGL2.');
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  const makeMaterial=(name,fragmentShader,uniforms,defines={})=>new THREE.RawShaderMaterial({name,glslVersion:THREE.GLSL3,vertexShader,fragmentShader,uniforms,defines,depthTest:false,depthWrite:false,toneMapped:false,blending:THREE.NoBlending});
  const easuUniforms={uInput:{value:null},uInputSize:{value:new THREE.Vector2(1,1)},uCon0:{value:new THREE.Vector4(1,1,0,0)}};
  const rcasUniforms={uInput:{value:null},uInputSize:{value:new THREE.Vector2(1,1)},uSharpness:{value:Math.pow(2,-sharpnessStops)}};
  const copyUniforms={uInput:{value:null},uInputSize:{value:new THREE.Vector2(1,1)}};
  const easuMaterial=makeMaterial('Atoll_FSR1_EASU_FP32',fsrEasuFragmentShader,easuUniforms);
  const rcasMaterial=makeMaterial('Atoll_FSR1_RCAS_FP32',fsrRcasFragmentShader,rcasUniforms,denoise?{FSR_RCAS_DENOISE:1}:{});
  const copyMaterial=makeMaterial('Atoll_Native_Encoded_Copy',copyFragmentShader,copyUniforms);
  const target=new THREE.WebGLRenderTarget(1,1,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false,colorSpace:THREE.NoColorSpace});
  target.texture.name='FSR1 EASU perceptual RGB';target.texture.generateMipmaps=false;
  const scene=new THREE.Scene(),camera=new THREE.Camera(),triangle=new THREE.Mesh(geometry,copyMaterial);
  triangle.frustumCulled=false;triangle.matrixAutoUpdate=false;scene.add(triangle);
  let inputWidth=1,inputHeight=1,outputWidth=1,outputHeight=1,bypass=true,disposed=false,frames=0,lastCpuSubmitMs=0,warmed=false,warmupError=null;
  const savedViewport=new THREE.Vector4(),drawingBuffer=new THREE.Vector2();

  function setSize(inW,inH,outW,outH) {
    const values=[inW,inH,outW,outH].map(v=>Math.round(v));
    if(values.some(v=>!Number.isFinite(v)||v<1))throw new Error('FSR1 dimensions must be positive physical pixel sizes.');
    if(values[0]>values[2]||values[1]>values[3])throw new Error('FSR1 EASU is an upscaler; input cannot exceed output dimensions.');
    [inputWidth,inputHeight,outputWidth,outputHeight]=values;
    bypass=inputWidth===outputWidth&&inputHeight===outputHeight;
    if(!bypass&&(target.width!==outputWidth||target.height!==outputHeight))target.setSize(outputWidth,outputHeight);
    easuUniforms.uInputSize.value.set(inputWidth,inputHeight);
    easuUniforms.uCon0.value.fromArray(fsrEasuConstants(inputWidth,inputHeight,outputWidth,outputHeight));
    rcasUniforms.uInputSize.value.set(outputWidth,outputHeight);copyUniforms.uInputSize.value.set(inputWidth,inputHeight);
  }
  function setSharpness(stops) {
    if(!Number.isFinite(stops))throw new Error('RCAS sharpness must be finite.');
    sharpnessStops=Math.max(0,Math.min(2,stops));rcasUniforms.uSharpness.value=Math.pow(2,-sharpnessStops);
  }
  async function warmup() {
    try{
      for(const material of [easuMaterial,rcasMaterial,copyMaterial]){
        triangle.material=material;
        if(renderer.compileAsync)await renderer.compileAsync(scene,camera);else renderer.compile(scene,camera);
      }
      triangle.material=copyMaterial;warmed=true;return true;
    }catch(error){warmupError=String(error?.message||error);return false;}
  }
  function render(inputRT) {
    if(disposed)throw new Error('FSR1 upscaler is disposed.');
    if(warmupError)throw new Error(`FSR1 warmup failed: ${warmupError}`);
    const texture=inputRT?.texture||inputRT;
    if(!texture?.isTexture)throw new Error('FSR1 render requires an encoded input render target/texture.');
    if(texture.colorSpace&&texture.colorSpace!==THREE.NoColorSpace)throw new Error('FSR1 input must store encoded RGB in a NoColorSpace target; avoid automatic sRGB decode.');
    renderer.getDrawingBufferSize(drawingBuffer);
    if(drawingBuffer.x!==outputWidth||drawingBuffer.y!==outputHeight)throw new Error('Keep the canvas at full physical output resolution. Resize input RTs, not the canvas.');
    const started=performance.now(),autoClear=renderer.autoClear,scissor=renderer.getScissorTest();renderer.getViewport(savedViewport);
    renderer.autoClear=false;renderer.setScissorTest(false);
    try{
      if(!bypass){
        easuUniforms.uInput.value=texture;triangle.material=easuMaterial;renderer.setRenderTarget(target);renderer.render(scene,camera);
        rcasUniforms.uInput.value=target.texture;triangle.material=rcasMaterial;
      }else{copyUniforms.uInput.value=texture;triangle.material=copyMaterial;}
      renderer.setRenderTarget(null);
      const pixelRatio=renderer.getPixelRatio();renderer.setViewport(0,0,outputWidth/pixelRatio,outputHeight/pixelRatio);
      renderer.render(scene,camera);frames++;
    }finally{renderer.autoClear=autoClear;renderer.setViewport(savedViewport);renderer.setScissorTest(scissor);lastCpuSubmitMs=performance.now()-started;}
  }
  setSharpness(sharpnessStops);
  const ready=precompile?warmup():Promise.resolve(false);
  return {setSize,render,setSharpness,warmup,ready,
    get state(){return {algorithm:'FSR1 EASU + RCAS, FP32 WebGL2 port',sourceCommit:FSR1_SOURCE_COMMIT,input:[inputWidth,inputHeight],output:[outputWidth,outputHeight],scale:[inputWidth/outputWidth,inputHeight/outputHeight],bypass,mode:bypass?'native encoded copy':'EASU 12-tap + RCAS 5-tap',passes:bypass?1:2,sharpnessStops,rcasDenoise:denoise,frames,warmed,warmupError,lastCpuSubmitMs,gpuMilliseconds:null,gpuBudgetVerified:false,allocatedEasuBytes:target.width*target.height*4,inputContract:'tone-mapped sRGB-encoded RGB in NoColorSpace RT; no conversion in this module'};},
    dispose(){disposed=true;target.dispose();geometry.dispose();easuMaterial.dispose();rcasMaterial.dispose();copyMaterial.dispose();}
  };
}
