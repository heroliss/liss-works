/* Three r180 RGBA-packed directional shadow map, sampled along the AIR ray.
 * Underwater callers first backtrace their refracted solar ray to its entry
 * point. This is a plane-interface approximation, not a wavy inverse solver.
 */
export const sunShadowGLSL=/* glsl */`
  uniform highp sampler2D uSunShadowMap;
  uniform mat4 uSunShadowMatrix;
  uniform vec2 uSunShadowSize;
  uniform float uSunShadowEnabled,uSunShadowBias,uSunShadowNormalBias,uSunShadowRadius,uSunShadowIntensity;
  float treeSunVisibility(vec3 airPoint){
    if(uSunShadowEnabled<0.5)return 1.0;
    vec4 projected=uSunShadowMatrix*vec4(airPoint+vec3(0.0,uSunShadowNormalBias,0.0),1.0);
    vec3 coordinate=projected.xyz/max(projected.w,0.00001);
    // Derivatives are evaluated before the varying frustum branch. Explicit
    // LOD depth reads are safe in the fixed PCF loop and never interpolate
    // packed depth before comparing it.
    vec2 footprint=max(abs(dFdx(coordinate.xy)),abs(dFdy(coordinate.xy)))*uSunShadowSize;
    float radius=clamp(max(uSunShadowRadius,max(footprint.x,footprint.y)*0.65),1.0,5.0);
    if(coordinate.z<0.0||coordinate.z>1.0||any(lessThan(coordinate.xy,vec2(0.0)))||any(greaterThan(coordinate.xy,vec2(1.0))))return 1.0;
    vec2 texel=radius/uSunShadowSize;
    float comparison=coordinate.z+uSunShadowBias,visibility=0.0;
    for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
      vec2 uv=coordinate.xy+vec2(float(i),float(j))*texel;
      if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))visibility+=1.0;
      else visibility+=step(comparison,unpackRGBAToDepth(textureLod(uSunShadowMap,uv,0.0)));
    }
    return mix(1.0,visibility/9.0,clamp(uSunShadowIntensity,0.0,1.0));
  }
`;

export function createSunShadowBinding(THREE,sunLight=null){
  const fallback=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat,THREE.UnsignedByteType);
  fallback.minFilter=fallback.magFilter=THREE.NearestFilter;fallback.needsUpdate=true;
  const uniforms={uSunShadowMap:{value:fallback},uSunShadowMatrix:{value:new THREE.Matrix4()},uSunShadowSize:{value:new THREE.Vector2(1,1)},
    uSunShadowEnabled:{value:0},uSunShadowBias:{value:0},uSunShadowNormalBias:{value:0},uSunShadowRadius:{value:1},uSunShadowIntensity:{value:1}};
  let updates=0;
  function update(light=sunLight){
    if(light)sunLight=light;
    const shadow=sunLight?.shadow,map=shadow?.map;
    const ready=!!(sunLight?.castShadow&&map?.texture&&shadow?.matrix);
    uniforms.uSunShadowEnabled.value=ready?1:0;
    if(ready){
      uniforms.uSunShadowMap.value=map.texture;
      // Keep the actual matrix reference: Three updates it immediately before
      // a shadow draw. Copying it before that draw creates a one-frame mismatch.
      uniforms.uSunShadowMatrix.value=shadow.matrix;
      uniforms.uSunShadowSize.value.set(map.width||shadow.mapSize.x,map.height||shadow.mapSize.y);
      uniforms.uSunShadowBias.value=Number.isFinite(shadow.bias)?shadow.bias:0;
      uniforms.uSunShadowNormalBias.value=Math.max(0,shadow.normalBias||0);
      uniforms.uSunShadowRadius.value=Math.max(1,shadow.radius||1);
      uniforms.uSunShadowIntensity.value=Number.isFinite(shadow.intensity)?shadow.intensity:1;
    }else uniforms.uSunShadowMap.value=fallback;
    updates++;return ready;
  }
  update();
  return {uniforms,update,diagnostics:()=>({enabled:uniforms.uSunShadowEnabled.value===1,mapSize:uniforms.uSunShadowSize.value.toArray(),bias:uniforms.uSunShadowBias.value,normalBiasMetres:uniforms.uSunShadowNormalBias.value,pcfTapsPerQuery:9,queriesPerWaterFragment:3,updates,packing:'Three.js RGBADepthPacking; ordinary non-reversed directional shadow',limits:['receives the existing caster map; does not add missing terrain casters','plane solar-refraction interface at mean sea level','three independent PCF queries, including one volume midpoint','main renderer requests up to 60 Hz in high quality, 30 Hz balanced; actual rate is frame limited'] }),dispose(){fallback.dispose();}};
}

export function refractedSolarEntry(THREE,bottom,towardSun,planeY=0){
  const incident=towardSun.clone().normalize().negate(),eta=1/1.333,dot=incident.y;
  const direction=incident.multiplyScalar(eta).addScaledVector(new THREE.Vector3(0,1,0),-(eta*dot+Math.sqrt(Math.max(0,1-eta*eta*(1-dot*dot)))));
  const distance=Math.max(0,planeY-bottom.y)/Math.max(.15,-direction.y);
  return {entry:bottom.clone().addScaledVector(direction,-distance),direction,distance};
}
