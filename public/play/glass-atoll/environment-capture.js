// Frozen six-face captures. Storage exposure belongs to the captured image,
// never to the current scene's transient firework/exposure budget.
export function chooseEnvironmentExposure({recommendedEV=0,maxRGB,maximumStoredRGB=65504/4}={}) {
  if(!Number.isFinite(maxRGB)||maxRGB<0)throw new RangeError('Sky radiance bound must be finite and nonnegative');
  if(!Number.isFinite(maximumStoredRGB)||maximumStoredRGB<=0)throw new RangeError('Invalid environment storage budget');
  const safeEV=maxRGB>0?Math.floor(Math.log2(maximumStoredRGB/maxRGB)):32;
  const recommended=Number.isFinite(recommendedEV)?recommendedEV:0;
  // Precision policy for weak captured sources, independent of camera C or
  // its automatic-exposure preference. The source bound still wins.
  const preferred=Math.max(recommended,maxRGB<1?21:0);
  const captureEV=Math.min(32,preferred,safeEV);
  if(captureEV < -48)throw new RangeError('Sky bound exceeds atmosphere storage-EV support');
  return {captureEV,safeEV,recommendedEV:recommended,preferredEV:preferred,maxRGB,maximumStoredRGB,storedBound:maxRGB*2**captureEV};
}

const directionArray=value=>{
  const a=value?.toArray?value.toArray():Array.isArray(value)?value:null;
  if(!a||a.length<3||!a.slice(0,3).every(Number.isFinite))return null;
  const length=Math.hypot(...a.slice(0,3));return length>0?a.slice(0,3).map(v=>v/length):null;
};
const angleDegrees=(a,b)=>a&&b?Math.acos(Math.max(-1,Math.min(1,a.reduce((s,v,i)=>s+v*b[i],0))))*180/Math.PI:0;
const copyTag=tag=>tag?{...tag,sunDirection:tag.sunDirection?.slice(),position:tag.position.slice(),exposure:{...tag.exposure}}:null;

/** All calls synchronous. update() returns a publication or null.
 * pmremGenerator/now are injectable for a renderer-free scheduling fixture.
 * An externally supplied PMREM generator is not disposed by this module.
 */
export function createEnvironmentCapture(THREE,renderer,{
  atmosphere,onPublish,cubeSize=256,faceRate=12,pmremInterval=2,
  maxCaptureAge=2,sunAngleThresholdDeg=2,utcJumpSeconds=900,
  minRefreshInterval=.5,maximumStoredRGB=65504/4,
  position=[0,2,0],now=()=>performance.now()/1000,pmremGenerator=null,
}={}) {
  for(const name of ['captureSnapshot','withSnapshot','prepareStarView','setStorageExposureEV','getRadianceBound','lighting'])
    if(typeof atmosphere?.[name]!=='function')throw new TypeError(`Environment capture requires atmosphere.${name}()`);
  if(!atmosphere.mesh?.isMesh||Array.isArray(atmosphere.mesh.material))throw new TypeError('Environment capture requires one sky mesh/material');
  if(!Number.isInteger(cubeSize)||cubeSize<16||(cubeSize&(cubeSize-1))!==0)throw new RangeError('cubeSize must be a power of two >=16');
  if(!Number.isFinite(faceRate)||faceRate<=0||!Number.isFinite(pmremInterval)||pmremInterval<0||!Number.isFinite(maxCaptureAge)||maxCaptureAge<=0||!Number.isFinite(minRefreshInterval)||minRefreshInterval<0)throw new RangeError('Invalid capture scheduling options');
  if(!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite))throw new TypeError('Capture position must have three finite metres');

  const cubes=Array.from({length:2},(_,i)=>{
    const target=new THREE.WebGLCubeRenderTarget(cubeSize,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,colorSpace:THREE.LinearSRGBColorSpace,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter,depthBuffer:false});
    target.texture.name=`Environment frozen cube ${i}`;return target;
  });
  const cameras=cubes.map(target=>{
    const camera=new THREE.CubeCamera(.1,24000,target);
    camera.coordinateSystem=renderer.coordinateSystem??THREE.WebGLCoordinateSystem;camera.updateCoordinateSystem();return camera;
  });
  const captureScene=new THREE.Scene(),captureMesh=atmosphere.mesh.clone(false);
  const captureMaterial=atmosphere.mesh.material.clone();
  // Keep source texture objects/uniforms shared; only the shader/defines are
  // frozen per job. Geometry, textures and the live sky mesh remain owned by sky.
  captureMaterial.uniforms=atmosphere.mesh.material.uniforms;
  captureMaterial.toneMapped=false;captureMesh.material=captureMaterial;
  captureMesh.visible=true;captureMesh.frustumCulled=false;captureMesh.layers.set(0);captureScene.add(captureMesh);
  const pmrem=pmremGenerator??new THREE.PMREMGenerator(renderer),pmrems=[null,null];
  let front=-1,environmentIndex=-1,cubeTag=null,environmentTag=null,job=null,disposed=false;
  let sceneEV=0,lastArgs={},lastInput=null,lastWall=now(),credits=0,lastFullWall=-Infinity,lastPMREMWall=-Infinity;
  let publicationRevision=0,pmremRevision=0,totalFaces=0,fullRefreshes=0,cancelledJobs=0;
  let pendingReason=null,lastReason='not initialized';const errors=[];

  function assertAlive(){if(disposed)throw new Error('Environment capture is disposed');}
  function reportError(error){errors.push(String(error?.message??error));if(errors.length>8)errors.shift();}
  function ratios(){return {cubeRatio:cubeTag?2**(sceneEV-cubeTag.captureEV):1,environmentRatio:environmentTag?2**(sceneEV-environmentTag.captureEV):1};}
  function setSceneExposure(value){
    assertAlive();if(!Number.isFinite(value))throw new TypeError('Scene exposure must be a finite EV');
    sceneEV=value;return ratios();
  }
  function argsWithDefaults(args={}){
    const result={...lastArgs,...args};
    result.time=Number.isFinite(result.time)?result.time:0;
    result.utcMs=Number.isFinite(result.utcMs)?result.utcMs:null;
    result.storageEV=Number.isFinite(result.storageEV)?result.storageEV:sceneEV;
    result.sunDirection=directionArray(result.sunDirection);
    result.position=(result.position??position).slice();
    if(result.position.length!==3||!result.position.every(Number.isFinite))throw new TypeError('Capture position must have three finite metres');
    return result;
  }

  // Save global viewport/scissor settings separately from the active RT's
  // actual viewport. A caller can have a custom viewport on a non-default FBO.
  function withRendererState(fn){
    const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
    const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4());
    const currentViewport=renderer.getCurrentViewport?.(new THREE.Vector4())??(target?.viewport?.clone()??viewport.clone());
    const scissorTest=renderer.getScissorTest(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
    const saved={autoClear:renderer.autoClear,autoClearColor:renderer.autoClearColor,autoClearDepth:renderer.autoClearDepth,autoClearStencil:renderer.autoClearStencil,toneMapping:renderer.toneMapping,toneMappingExposure:renderer.toneMappingExposure,outputColorSpace:renderer.outputColorSpace,xr:renderer.xr?.enabled,shadow:renderer.shadowMap?{enabled:renderer.shadowMap.enabled,autoUpdate:renderer.shadowMap.autoUpdate,needsUpdate:renderer.shadowMap.needsUpdate}:null};
    const gl=renderer.getContext?.();
    const actualScissor=gl?.getParameter&&gl.SCISSOR_BOX!==undefined?new THREE.Vector4().fromArray(gl.getParameter(gl.SCISSOR_BOX)):(target?.scissor?.clone()??scissor.clone());
    const actualScissorTest=gl?.isEnabled&&gl.SCISSOR_TEST!==undefined?gl.isEnabled(gl.SCISSOR_TEST):(target?.scissorTest??scissorTest);
    try{
      renderer.autoClear=renderer.autoClearColor=renderer.autoClearDepth=renderer.autoClearStencil=true;
      renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
      if(renderer.xr)renderer.xr.enabled=false;if(renderer.shadowMap)renderer.shadowMap.enabled=false;
      renderer.setClearColor(0,1);return fn();
    }finally{
      renderer.autoClear=saved.autoClear;renderer.autoClearColor=saved.autoClearColor;renderer.autoClearDepth=saved.autoClearDepth;renderer.autoClearStencil=saved.autoClearStencil;
      renderer.toneMapping=saved.toneMapping;renderer.toneMappingExposure=saved.toneMappingExposure;renderer.outputColorSpace=saved.outputColorSpace;
      if(renderer.xr)renderer.xr.enabled=saved.xr;if(saved.shadow)Object.assign(renderer.shadowMap,saved.shadow);
      renderer.setClearColor(color,alpha);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
      if(target){
        const tv=target.viewport.clone(),ts=target.scissor.clone(),test=target.scissorTest;
        try{target.viewport.copy(currentViewport);target.scissor.copy(actualScissor);target.scissorTest=actualScissorTest;renderer.setRenderTarget(target,face,mip);}
        finally{target.viewport.copy(tv);target.scissor.copy(ts);target.scissorTest=test;}
      }else renderer.setRenderTarget(null,face,mip);
    }
  }

  function begin(args,wall){
    const snapshot=atmosphere.captureSnapshot();
    const exposure=atmosphere.withSnapshot(snapshot,()=>chooseEnvironmentExposure({recommendedEV:atmosphere.lighting().recommendedExposureEV,maxRGB:atmosphere.getRadianceBound().maxRGB,maximumStoredRGB}));
    const tag={time:Number.isFinite(snapshot.time)?snapshot.time:args.time,utcMs:Number.isFinite(snapshot.utcMs)?snapshot.utcMs:args.utcMs,
      physicalRevision:args.physicalRevision??snapshot.physicalSkyRevision??null,captureEV:exposure.captureEV,exposure,
      sunDirection:args.sunDirection??directionArray(snapshot.uniforms?.sunPosition),position:args.position.slice()};
    const material=atmosphere.mesh.material,defines={...material.defines};
    if(captureMaterial.vertexShader!==material.vertexShader||captureMaterial.fragmentShader!==material.fragmentShader||JSON.stringify(captureMaterial.defines)!==JSON.stringify(defines))captureMaterial.needsUpdate=true;
    captureMaterial.vertexShader=material.vertexShader;captureMaterial.fragmentShader=material.fragmentShader;captureMaterial.defines=defines;
    captureMaterial.uniforms=material.uniforms;
    const back=front<0?0:1-front,camera=cameras[back];camera.position.fromArray(tag.position);camera.updateMatrixWorld(true);
    captureMesh.position.fromArray(tag.position);captureMesh.updateMatrixWorld(true);
    cubes[back].texture.generateMipmaps=false;
    return {snapshot,tag,back,camera,face:0,startedWall:wall,optics:{shutterSeconds:1/120,...args.optics}};
  }
  function drawFaces(active,count){
    return withRendererState(()=>atmosphere.withSnapshot(active.snapshot,()=>{
      atmosphere.setStorageExposureEV(active.tag.captureEV);
      const solar=atmosphere.uniforms?.uSolarDisk??captureMaterial.uniforms?.uSolarDisk;
      if(!solar)throw new TypeError('Sky capture requires uSolarDisk uniform');solar.value=0;
      const target=cubes[active.back];
      for(let n=0;n<count&&active.face<6;n++){
        const index=active.face,camera=active.camera.children[index];
        atmosphere.prepareStarView(renderer,camera,{width:cubeSize,height:cubeSize,storageEV:active.tag.captureEV,
          frame:{time:active.tag.time,utcMs:active.tag.utcMs,storageEV:active.tag.captureEV},optics:active.optics});
        target.texture.generateMipmaps=index===5;renderer.setRenderTarget(target,index,0);renderer.render(captureScene,camera);
        active.face++;totalFaces++;
      }
    }));
  }
  function publish(active,wall,forcePMREM,reason){
    const buildPMREM=forcePMREM||environmentIndex<0||wall-lastPMREMWall>=pmremInterval;
    let nextEnvironment=environmentIndex,newEnvironment=null;
    if(buildPMREM){
      nextEnvironment=environmentIndex<0?0:1-environmentIndex;
      newEnvironment=withRendererState(()=>pmrem.fromCubemap(cubes[active.back].texture,pmrems[nextEnvironment]));
      if(!newEnvironment?.texture)throw new Error('PMREM did not return a render target');
    }
    // All GPU work succeeded before either public pointer/tag changes.
    if(buildPMREM){pmrems[nextEnvironment]=newEnvironment;environmentIndex=nextEnvironment;environmentTag={...active.tag};lastPMREMWall=wall;pmremRevision++;}
    front=active.back;cubeTag={...active.tag};publicationRevision++;lastReason=reason;job=null;
    const result={cubeTarget:cubes[front],cubeTexture:cubes[front].texture,environmentTarget:pmrems[environmentIndex],environmentTexture:pmrems[environmentIndex]?.texture??null,
      cubeCaptureEV:cubeTag.captureEV,environmentCaptureEV:environmentTag?.captureEV??null,cubeTag:copyTag(cubeTag),environmentTag:copyTag(environmentTag),
      ...ratios(),revision:publicationRevision,pmremRevision,pmremUpdated:buildPMREM,reason};
    if(typeof onPublish==='function')onPublish(result);
    return result;
  }
  function refresh(args={},reason='explicit refresh'){
    assertAlive();const next=argsWithDefaults(args),wall=now();setSceneExposure(next.storageEV);lastArgs=next;
    if(job){cancelledJobs++;job=null;}
    try{
      const active=begin(next,wall);drawFaces(active,6);const result=publish(active,wall,true,reason);
      pendingReason=null;credits=0;lastWall=wall;lastFullWall=wall;fullRefreshes++;
      lastInput={...next,wall};return result;
    }catch(error){job=null;reportError(error);throw error;}
  }
  function update(args={}){
    assertAlive();const next=argsWithDefaults(args),wall=now();setSceneExposure(next.storageEV);lastArgs=next;
    if(front<0)return refresh(next,'initial capture');
    credits=Math.min(6,credits+Math.max(0,wall-lastWall)*faceRate);lastWall=wall;
    const revision=next.physicalRevision;
    const discrete=revision!==undefined&&revision!==cubeTag.physicalRevision&&(job?revision!==job.tag.physicalRevision:true);
    const utcStep=lastInput&&next.utcMs!==null&&lastInput.utcMs!==null?Math.abs(next.utcMs-lastInput.utcMs)/1000:0;
    if(discrete||utcStep>utcJumpSeconds){
      pendingReason=discrete?'physical revision':'UTC discontinuity';
      if(job){cancelledJobs++;job=null;}
    }
    const overAge=!next.paused&&job&&wall-job.startedWall>maxCaptureAge;
    if(overAge){pendingReason='capture deadline';cancelledJobs++;job=null;}
    const sunAngle=angleDegrees(next.sunDirection,cubeTag.sunDirection);
    // Gradual accelerated UTC never cancels a six-face job. The next complete
    // refresh is queued only at the job boundary; old front remains coherent.
    if(!job&&sunAngle>=sunAngleThresholdDeg&&!pendingReason)pendingReason='sun-angle threshold';
    lastInput={...next,wall};
    if(pendingReason){
      if(credits<6-1e-6||wall-lastFullWall<minRefreshInterval)return null;
      return refresh(next,pendingReason);
    }
    if(next.paused)return null;
    if(!job&&next.time===cubeTag.time&&next.utcMs===cubeTag.utcMs&&sunAngle<1e-7&&next.position.every((v,i)=>v===cubeTag.position[i]))return null;
    if(credits<1-1e-6)return null;
    try{
      if(!job)job=begin(next,wall);
      drawFaces(job,1);credits=Math.max(0,credits-1);
      return job.face===6?publish(job,wall,false,'scheduled capture'):null;
    }catch(error){job=null;reportError(error);throw error;}
  }

  return {
    initialize(args={}){return refresh(args,'initial capture');},refresh,update,setSceneExposure,
    get cubeTarget(){return front<0?null:cubes[front];},
    get environmentTarget(){return environmentIndex<0?null:pmrems[environmentIndex];},
    get environmentTexture(){return environmentIndex<0?null:pmrems[environmentIndex]?.texture??null;},
    get state(){
      const wall=now(),time=lastArgs.time??0,utcMs=lastArgs.utcMs;
      const age=tag=>tag?{captureAge:Math.max(0,time-tag.time),utcSecondsAge:Number.isFinite(utcMs)&&Number.isFinite(tag.utcMs)?Math.abs(utcMs-tag.utcMs)/1000:null,utcSignedSecondsAge:Number.isFinite(utcMs)&&Number.isFinite(tag.utcMs)?(utcMs-tag.utcMs)/1000:null}:null;
      return {initialized:front>=0,disposed,revision:publicationRevision,pmremRevision,cubeSize,faceRate,pmremInterval,totalFaces,fullRefreshes,cancelledJobs,
        cubeCaptureEV:cubeTag?.captureEV??null,environmentCaptureEV:environmentTag?.captureEV??null,sceneEV,...ratios(),cubeTag:copyTag(cubeTag),environmentTag:copyTag(environmentTag),
        cube:age(cubeTag),environment:age(environmentTag),pendingReason,job:job?{face:job.face,tag:copyTag(job.tag),wallAge:Math.max(0,wall-job.startedWall)}:null,
        allocated:{cubes:2,pmrems:pmrems.filter(Boolean).length},lastReason,errors:errors.slice(),
        limits:['Snapshot coherence, not instantaneous sky; cube/PMREM age are explicit','Sky cubemap is captured at one fixed point per round, not a spatial radiance field','Source bound is atmosphere analytic envelope; not photometer calibration','Explicit initialize/refresh draws six faces synchronously; scheduled work is face-budgeted','No CPU/GPU timing or FPS claim']};
    },
    dispose(){if(disposed)return;disposed=true;job=null;for(const target of cubes)target.dispose();for(const target of pmrems)target?.dispose();captureMaterial.dispose();captureScene.remove(captureMesh);if(!pmremGenerator)pmrem.dispose();},
  };
}
