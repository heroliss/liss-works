// One soft shadow for the brightest far burst.
//
// The probe field has no occlusion, so palms cast nothing while a shell burns
// overhead. A burst is 100 m or more away and tens of metres wide, which makes
// it close to a distant disc: one orthographic depth map from its intensity
// centroid, filtered over a penumbra sized by its angular radius, is enough.
// The field's irradiance is reduced only by the share of far light that this
// burst provides, so a second shell elsewhere still fills the shadow.
//
// The map is refreshed a few times per second and only while a burst is
// bright enough to matter; it costs nothing otherwise. Casters are drawn with
// their own depth material (wind-animated foliage keeps its motion).
export const fireworkBurstShadowGLSL=/* glsl */`
  uniform highp sampler2D uFireShadowMap;
  uniform mat4 uFireShadowMatrix;
  uniform vec4 uFireShadowParams; // share, penumbra slope in map UV per metre of occluder distance, depth bias, map size
  uniform vec3 uFireShadowDirection;
  float fireShadowDepth(vec2 uv){
    return dot(textureLod(uFireShadowMap,uv,0.),vec4(.99609375,.0038909912109375,.00001519918441772461,.00000005960464477539));
  }
  float fireBurstVisibility(vec3 p,vec3 n){
    float share=uFireShadowParams.x;if(share<=0.)return 1.;
    vec4 h=uFireShadowMatrix*vec4(p+n*.12+uFireShadowDirection*.1,1.);vec3 q=h.xyz/h.w;
    if(q.z<=0.||q.z>=1.||any(lessThan(q.xy,vec2(.002)))||any(greaterThan(q.xy,vec2(.998))))return 1.;
    // Twelve taps on a golden-angle disc, rotated per pixel. The disc radius is the
    // burst's penumbra for an occluder about six metres above the receiver.
    float angle=6.2831853*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
    float radius=max(1.5/uFireShadowParams.w,uFireShadowParams.y*6.),lit=0.;
    for(int i=0;i<12;i++){
      float t=(float(i)+.5)/12.,a=angle+float(i)*2.39996323;
      vec2 uv=q.xy+vec2(cos(a),sin(a))*(sqrt(t)*radius);
      lit+=step(q.z-uFireShadowParams.z,fireShadowDepth(uv));
    }
    return 1.-share*(1.-lit/12.);
  }
`;
export const fireworkBurstShadowDisabledGLSL='float fireBurstVisibility(vec3 p,vec3 n){return 1.;}';

export function createFireworkBurstShadow(THREE,renderer,{centre=[6,4,0],halfExtent=52,depthRange=420}={}){
  let size=1024,hz=12,enabled=true,target=null,casters=null,casterKey='',lastTime=-Infinity,lastPosition=null,renders=0,lastMs=0,active=false;
  const white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);white.needsUpdate=true;white.minFilter=white.magFilter=THREE.NearestFilter;
  const camera=new THREE.OrthographicCamera(-halfExtent,halfExtent,halfExtent,-halfExtent,1,depthRange),focus=new THREE.Vector3(...centre),direction=new THREE.Vector3(0,1,0);
  const depthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
  const bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),clear=new THREE.Color();
  const uniforms={uFireShadowMap:{value:white},uFireShadowMatrix:{value:new THREE.Matrix4()},uFireShadowParams:{value:new THREE.Vector4(0,0,.0004,size)},uFireShadowDirection:{value:new THREE.Vector3(0,1,0)}};
  function ensureTarget(){
    if(target&&target.width===size)return;target?.dispose();
    target=new THREE.WebGLRenderTarget(size,size,{type:THREE.UnsignedByteType,format:THREE.RGBAFormat,depthBuffer:true,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false});
    target.texture.name='Dominant firework burst depth';target.texture.colorSpace=THREE.NoColorSpace;uniforms.uFireShadowParams.value.w=size;
  }
  function collect(scene){
    const key=scene.children.length+':'+scene.children.map(c=>c.id).join(',');if(casters&&key===casterKey)return casters;
    casters=[];casterKey=key;scene.traverse(object=>{if(object.isMesh&&object.castShadow)casters.push(object);});return casters;
  }
  function disable(){if(active){active=false;uniforms.uFireShadowParams.value.x=0;uniforms.uFireShadowMap.value=white;}}
  // dominant: {position,radius,share,candela} of the brightest far burst, or null.
  function update({scene,dominant=null,time=0,minimumCandela=1500,force=false}={}){
    if(!enabled||!dominant||!(dominant.candela>=minimumCandela)||!(dominant.share>.05)){disable();return false;}
    const position=dominant.position,distance=Math.hypot(position[0]-centre[0],position[1]-centre[1],position[2]-centre[2]);
    if(!(distance>20)||position[1]-centre[1]<8){disable();return false;}
    const params=uniforms.uFireShadowParams.value;params.x=Math.min(1,dominant.share);
    // Penumbra half-width per metre between occluder and receiver is the burst's angular radius.
    params.y=Math.min(.35,dominant.radius/distance)/(2*halfExtent);
    // Refresh at most hz times a second, and only four times a second while the burst's
    // direction has barely changed (the map then only has to follow swaying foliage).
    const turned=!lastPosition||Math.hypot(position[0]-lastPosition[0],position[1]-lastPosition[1],position[2]-lastPosition[2])>.02*distance;
    if(!force&&active&&time>=lastTime&&(time-lastTime<1/hz||!turned&&time-lastTime<.25))return true;
    const stamp=performance.now();ensureTarget();
    direction.set(position[0]-centre[0],position[1]-centre[1],position[2]-centre[2]).normalize();
    camera.position.copy(focus).addScaledVector(direction,depthRange*.5);camera.up.set(0,1,0);if(Math.abs(direction.y)>.98)camera.up.set(1,0,0);
    camera.lookAt(focus);camera.updateMatrixWorld();camera.updateProjectionMatrix();
    const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),autoClear=renderer.autoClear,alpha=renderer.getClearAlpha(),shadowAuto=renderer.shadowMap.autoUpdate,shadowDirty=renderer.shadowMap.needsUpdate;
    renderer.getClearColor(clear);const swapped=[];
    try{
      renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
      renderer.setRenderTarget(target);renderer.setClearColor(0xffffff,1);renderer.clear(true,true,false);renderer.autoClear=false;
      for(const mesh of collect(scene)){
        if(!mesh.visible||!mesh.parent)continue;let shown=true;for(let node=mesh.parent;node;node=node.parent)if(!node.visible){shown=false;break;}
        if(!shown)continue;
        swapped.push(mesh,mesh.material);mesh.material=mesh.customDepthMaterial||depthMaterial;
        renderer.render(mesh,camera);
      }
    }finally{
      for(let i=0;i<swapped.length;i+=2)swapped[i].material=swapped[i+1];
      renderer.setClearColor(clear,alpha);renderer.autoClear=autoClear;renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowDirty;renderer.setRenderTarget(previous,face,mip);
    }
    uniforms.uFireShadowMatrix.value.copy(bias).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
    uniforms.uFireShadowDirection.value.copy(direction);uniforms.uFireShadowMap.value=target.texture;
    lastTime=time;lastPosition=[...position];active=true;renders++;lastMs=performance.now()-stamp;return true;
  }
  return {uniforms,glsl:fireworkBurstShadowGLSL,update,
    setQuality({size:nextSize=size,hz:nextHz=hz,enabled:nextEnabled=enabled}={}){size=nextSize;hz=nextHz;enabled=!!nextEnabled;if(!enabled)disable();return{size,hz,enabled};},
    get state(){return {enabled,active,size,hz,renders,lastRenderMs:lastMs,casters:casters?.length??0,share:uniforms.uFireShadowParams.value.x,penumbraUVPerMetre:uniforms.uFireShadowParams.value.y,extraSamplers:1,model:'orthographic depth from the dominant far burst centroid; 12-tap rotated disc sized by burst angular radius; scales only that burst\'s share of the field'};},
    dispose(){target?.dispose();white.dispose();depthMaterial.dispose();}};
}
