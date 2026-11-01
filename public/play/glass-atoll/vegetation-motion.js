// Same-pass analytic moving-foliage vectors. No extra scene draw is required.
// Main colour needs RGBA16F motion + R16F current depth, both cleared to 0.
// Reference: https://research.nvidia.com/labs/rtr/publication/yang2020survey/
export function createVegetationMotionCapture(THREE){
  const previousVP=new THREE.Matrix4(),currentVP=new THREE.Matrix4(),poses=new Map(),materials=new WeakSet();
  let active=[],hasPrevious=false,frames=0,enabled=true;
  function zeroOtherMaterial(material){
    if(!material||materials.has(material))return;materials.add(material);
    const before=material.onBeforeCompile.bind(material),key=material.customProgramCacheKey.bind(material);
    material.onBeforeCompile=(shader,renderer)=>{
      before(shader,renderer);
      shader.fragmentShader='#define SCENE_REACTIVE_OUTPUT\nlayout(location=3) out float sceneReactiveMask;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/,match=>match+'\n sceneReactiveMask=0.;');
      if(shader.fragmentShader.includes('#define GROVE_MOTION_OUTPUT'))return;
      shader.fragmentShader='layout(location=1) out vec4 nonVegetationMotion;\nlayout(location=2) out float nonVegetationDepth;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/,match=>match+'\n nonVegetationMotion=vec4(0.);nonVegetationDepth=0.;');
    };
    material.customProgramCacheKey=()=>key()+'-zero-foliage-motion-v1';material.needsUpdate=true;
  }
  return {
    prepare(scene,camera,groups,{historyValid=false}={}){
      // Non-foliage fragments explicitly write zero. An unwritten MRT output
      // is undefined and may not be treated as reliable empty coverage.
      scene.traverse(o=>{if(o.isMesh||o.isPoints||o.isSprite)for(const m of Array.isArray(o.material)?o.material:[o.material])zeroOtherMaterial(m);});
      currentVP.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);active=[];
      for(const g of groups){if(!g.motion)continue;
        const m=g.motion,old=historyValid&&hasPrevious?poses.get(g):null;
        m.previousTime.value=old?.time??g.time.value;m.previousWind.value=old?.wind??g.wind.value;
        m.previousDirection.value.copy(old?.direction||m.direction.value);
        m.previousVP.value.copy(old?previousVP:currentVP);m.capture.value=enabled?1:0;active.push(g);
      }
    },
    finish(){
      for(const g of active){g.motion.capture.value=0;poses.set(g,{time:g.time.value,wind:g.wind.value,direction:g.motion.direction.value.clone()});}
      previousVP.copy(currentVP);hasPrevious=true;active=[];frames++;
    },
    reset(){hasPrevious=false;poses.clear();},
    setEnabled(value){enabled=Boolean(value);},
    get state(){return {enabled,frames,groups:poses.size,hasPrevious,extraScenePasses:0,attachment:'RGBA16F: unjittered UV velocity.xy, previous linear depth, MSAA coverage; R16F: current linear depth; normalize both by coverage',limits:['analytic rest-mesh wind and camera motion only; no arbitrary model-matrix animation','missing-coverage bridge retains conservative camera-only fallback']};},
    dispose(){for(const g of active)g.motion.capture.value=0;active=[];poses.clear();}
  };
}

// Keep the legacy camera-only path as fallback where no covered current leaf
// vector is available. All replacements are anchored and fail loudly on drift.
export function upgradeVegetationTemporalGLSL(source){
  function replaceOnce(before,after){if(!source.includes(before))throw new Error('Foliage motion temporal integration anchor missing: '+before.slice(0,90));source=source.replace(before,after);}
  replaceOnce('uniform sampler2D tCurrent,tCurrentDepth,tHistory,tHistoryMetadata;',`uniform highp sampler2D tCurrent,tCurrentDepth,tHistory,tHistoryMetadata,tVegetationMotion,tVegetationDepth;\n uniform float uVegetationMotionEnabled;`);
  replaceOnce('float taggedDepth=1.;',`float taggedDepth=1.;vec3 matchedMotion=vec3(0.);float matchedCurrentDepth=0.,hasMatchedMotion=0.;`);
  replaceOnce('if(coverage(sampleColour)>.012)taggedDepth=min(taggedDepth,textureLod(tCurrentDepth,uv,0.).r);',`if(coverage(sampleColour)>.012){
        float sampleDepth=textureLod(tCurrentDepth,uv,0.).r;
        vec4 motion=vec4(0.);
        if(uVegetationMotionEnabled>.5)motion=textureLod(tVegetationMotion,uv,0.);
        float physicalDepth=motion.a>.01?textureLod(tVegetationDepth,uv,0.).r/motion.a:0.;
        if(physicalDepth>.001)sampleDepth=(uFar-uNear*uFar/physicalDepth)/(uFar-uNear);
        if(sampleDepth<=taggedDepth){
          taggedDepth=sampleDepth;hasMatchedMotion=0.;
          if(motion.a>.01&&physicalDepth>.001){matchedMotion=motion.xyz/motion.a;matchedCurrentDepth=physicalDepth;hasMatchedMotion=1.;}
        }
      }`);
  replaceOnce('float depth=linearDepth(taggedDepth);',`float depth=hasMatchedMotion>.5?matchedCurrentDepth:linearDepth(taggedDepth);`);
  replaceOnce('vec2 previousUV=previousClip.xy/max(previousClip.w,1e-8)*.5+.5;',`vec2 previousUV=previousClip.xy/max(previousClip.w,1e-8)*.5+.5;
    if(hasMatchedMotion>.5)previousUV=vUv-matchedMotion.xy;`);
  replaceOnce('float expectedDepth=-(uPreviousView*world).z;',`float expectedDepth=hasMatchedMotion>.5?matchedMotion.z:-(uPreviousView*world).z;`);
  replaceOnce('float windPixels=worldSpeed*uMotionDelta*uProjectionScale/max(depth,.3);',`float windPixels=hasMatchedMotion>.5?0.:worldSpeed*uMotionDelta*uProjectionScale/max(depth,.3);`);
  return source;
}
