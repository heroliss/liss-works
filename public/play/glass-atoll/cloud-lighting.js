import * as THREE from 'three';
import { cloudShadowGLSL } from './sky.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const cloudShadowLookupGLSL=/* glsl */`
  uniform sampler2D uCloudShadowMap,uCloudShadowFar;
  uniform float uCloudShadowExtent,uCloudShadowFarExtent,uCloudTime;
  uniform vec3 uCloudLightDirection;
  float getCloudShadow(vec3 worldPoint,float time){
    vec2 projected=worldPoint.xz-uCloudLightDirection.xz*max(0.,worldPoint.y-1.)/max(.08,uCloudLightDirection.y);
    vec2 uv=projected/(2.*uCloudShadowExtent)+.5;
    float border=max(abs(uv.x-.5),abs(uv.y-.5));
    float covered=1.-smoothstep(.45,.495,border);
    vec2 farUV=projected/(2.*uCloudShadowFarExtent)+.5;
    // Beyond the coarse domain retain its edge rather than inventing clear
    // sunlight. Atmospheric perspective hides this far-field approximation.
    float distant=texture2D(uCloudShadowFar,clamp(farUV,vec2(.002),vec2(.998))).r;
    return mix(distant,texture2D(uCloudShadowMap,clamp(uv,vec2(.001),vec2(.999))).r,covered);
  }
`;

// Large-scale cloud extinction is sampled once into a 2 m grid at 4 Hz. Both
// terrain and water use this same map; leaf height projects along the sun ray.
export function createCloudShadowCache(renderer,atmosphere,{extent=256,size=256,maxHz=4,farExtent=8192,farSize=256}={}){
  const target=new THREE.WebGLRenderTarget(size,size,{type:THREE.HalfFloatType,depthBuffer:false});
  target.texture.name='Shared volume-cloud solar transmission';
  const farTarget=new THREE.WebGLRenderTarget(farSize,farSize,{type:THREE.HalfFloatType,depthBuffer:false});
  farTarget.texture.name='Distant sea cloud transmission / 16 km';
  Object.assign(atmosphere.uniforms,{uCloudShadowMap:{value:target.texture},uCloudShadowExtent:{value:extent},uCloudShadowFar:{value:farTarget.texture},uCloudShadowFarExtent:{value:farExtent},uCloudShadowBakeExtent:{value:extent}});
  const material=new THREE.ShaderMaterial({uniforms:atmosphere.uniforms,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`varying vec2 vUv;uniform float uCloudShadowBakeExtent;${cloudShadowGLSL}\nvoid main(){vec2 p=(vUv-.5)*(2.*uCloudShadowBakeExtent);float t=getCloudShadow(vec3(p.x,1.,p.y),uCloudTime);gl_FragColor=vec4(t,t,t,1.);}`});
  const quad=new FullScreenQuad(material);let lastTime=-Infinity,updates=0;
  return {
    update(time,force=false){
      if(!force&&time-lastTime<1/maxHz)return;
      const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
      try{atmosphere.uniforms.uCloudShadowBakeExtent.value=extent;renderer.setRenderTarget(target);quad.render(renderer);atmosphere.uniforms.uCloudShadowBakeExtent.value=farExtent;renderer.setRenderTarget(farTarget);quad.render(renderer);lastTime=time;updates++;}
      finally{renderer.setRenderTarget(previous,face,mip);}
    },
    get state(){return {extentMetres:extent,resolution:size,cellMetres:2*extent/size,farExtentMetres:farExtent,farResolution:farSize,farCellMetres:2*farExtent/farSize,maxHz,lastTime,updates,farBoundary:'clamped edge transmission, not a forced clear sky'};},
    dispose(){target.dispose();farTarget.dispose();material.dispose();quad.dispose();}
  };
}

// One shared world-space cloud extinction model modulates direct sunlight.
// Existing object shadowing and diffuse sky illumination remain independent.
export function applyCloudLighting(material,atmosphere){
  if(!material?.isMeshStandardMaterial||material.userData.atollCloudLighting)return;
  material.userData.atollCloudLighting=true;
  const previous=material.onBeforeCompile.bind(material),previousKey=material.customProgramCacheKey.bind(material);
  const directChunk=THREE.ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight );\n directLight.color *= getCloudShadow(vCloudWorld,uCloudTime);'
  );
  material.onBeforeCompile=(shader,renderer)=>{
    previous(shader,renderer);Object.assign(shader.uniforms,atmosphere.uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCloudWorld;')
      .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 cloudWorld=vec4(transformed,1.);
        #ifdef USE_BATCHING
          cloudWorld=batchingMatrix*cloudWorld;
        #endif
        #ifdef USE_INSTANCING
          cloudWorld=instanceMatrix*cloudWorld;
        #endif
        vCloudWorld=(modelMatrix*cloudWorld).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vCloudWorld;\n${cloudShadowLookupGLSL}`)
      .replace('#include <lights_fragment_begin>',directChunk)
      .replace('uGroveTranslucency*getShadowMask()','uGroveTranslucency*getShadowMask()*getCloudShadow(vCloudWorld,uCloudTime)');
  };
  material.customProgramCacheKey=()=>previousKey()+'-shared-volume-cloud-light-v1';
  material.needsUpdate=true;
}
