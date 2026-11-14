import {FIREWORK_RECEIVER_LIGHT_COUNT,FIREWORK_NEAR_LIGHT_COUNT} from './firework-receiver-lighting.js';
import {fireworkLightFieldGLSL} from './firework-light-field.js';
import {fireworkBurstShadowGLSL,fireworkBurstShadowDisabledGLSL} from './firework-burst-shadow.js';
import {RAW_PER_CANDELA,finiteSourceRadiance} from './scene-radiometry.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const LOCAL_LIGHT_COUNT=4+FIREWORK_RECEIVER_LIGHT_COUNT;
// Display shells burn 260–300m above the cay. The old 280m cutoff removed
// their light at ground level; keep inverse-square falloff across the scene.
export const FIREWORK_LIGHT_RANGE=4096;
// Three points on the cay's elliptical perimeter enclose its centre. The
// luminous sphere has no hood or azimuthal baffles; its point-light proxy is
// shared by native PBR, water, foliage transmission and the air integrator.
export const GROUND_LAMP_LAYOUT=[[-21,5.3],[18,5.3],[-1.5,-13.7]];
export const GROUND_LAMP_RADIUS=.065;
const GROUND_LAMP_SOURCE_HEIGHT=.108;
// Same fields drive native PBR lights, custom water/air and emitter geometry.
export const localLightGLSL=/* glsl */`
  uniform vec4 uLocalPosition[${LOCAL_LIGHT_COUNT}],uLocalColour[${LOCAL_LIGHT_COUNT}],uLocalDirection[${LOCAL_LIGHT_COUNT}],uLocalCone[${LOCAL_LIGHT_COUNT}];
  uniform vec4 uLocalBurstBounds[2];
  uniform highp sampler2D uLocalShadowMap;
  uniform mat4 uLocalShadowMatrix;
  uniform vec2 uLocalShadowSize;
  uniform float uLocalShadowEnabled,uLocalShadowBias;
  float localFlashVisibility(vec3 p){
    if(uLocalShadowEnabled<.5)return 1.;vec4 h=uLocalShadowMatrix*vec4(p+vec3(0.,.01,0.),1.);vec3 q=h.xyz/max(h.w,1e-7);
    if(q.z<0.||q.z>1.||any(lessThan(q.xy,vec2(0.)))||any(greaterThan(q.xy,vec2(1.))))return 1.;
    float v=0.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec4 packed=textureLod(uLocalShadowMap,q.xy+vec2(float(x),float(y))/uLocalShadowSize,0.);float depth=dot(packed,vec4(.99609375,.0038909912109375,.00001519918441772461,.00000005960464477539));v+=step(q.z+uLocalShadowBias,depth);}
    return v/9.;
  }
  vec3 localIncident(vec3 p,int i,out vec3 L){
    vec3 d=uLocalPosition[i].xyz-p;float d2=max(dot(d,d),uLocalPosition[i].w*uLocalPosition[i].w);L=d*inversesqrt(max(dot(d,d),1e-10));
    // Match Three's native punctual-light near-field attenuation for the
    // ground lamps. The physical diffuser radius remains a separate emission
    // area; a point light is not an exact near-field area-light integrator.
    if(i<3)d2=max(d2,.01);
    if(max(max(uLocalColour[i].r,uLocalColour[i].g),uLocalColour[i].b)<1e-12)return vec3(0.);
    float a=1.;if(uLocalDirection[i].w>.5)a=smoothstep(uLocalCone[i].x,uLocalCone[i].y,dot(-L,uLocalDirection[i].xyz));
    float cutDistance=i<3?length(d):sqrt(d2);
    float cut=max(0.,1.-pow(cutDistance/max(uLocalCone[i].z,.01),4.));a*=cut*cut;
    if(a<=0.)return vec3(0.);
    if(i==3)a*=localFlashVisibility(p);
    return uLocalColour[i].rgb*(a/d2);
  }
  vec3 localIrradiance(vec3 p,vec3 normal){vec3 e=vec3(0.);for(int i=0;i<${LOCAL_LIGHT_COUNT};i++){if(max(max(uLocalColour[i].r,uLocalColour[i].g),uLocalColour[i].b)<1e-12)continue;vec3 L;vec3 E=localIncident(p,i,L);e+=E*max(0.,dot(normal,L));}return e;}
  float localReceiverReactive(vec3 p){float r=0.;for(int i=4;i<${LOCAL_LIGHT_COUNT};i++){vec3 d=p-uLocalPosition[i].xyz;float energy=max(max(uLocalColour[i].r,uLocalColour[i].g),uLocalColour[i].b);r=max(r,step(1e-7,energy)*step(dot(d,d),uLocalCone[i].z*uLocalCone[i].z));}return r;}
  float localReflectionReactive(vec3 p,vec3 ray){float r=0.;for(int i=0;i<2;i++){vec3 d=uLocalBurstBounds[i].xyz-p;float along=dot(d,ray),radius=uLocalBurstBounds[i].w;r=max(r,step(.01,radius)*step(0.,along)*step(max(0.,dot(d,d)-along*along),(radius*1.5+3.)*(radius*1.5+3.)));}return r;}
`;

export function createLocalLights(THREE,{scene,terrainHeight=()=>0,fireField=null,fireShadow=null}={}){
  const root=new THREE.Group();root.name='Three low surface luminaires';scene.add(root);
  const settings={mode:'night',linked:false,lamps:[0,1,2].map(()=>({enabled:true,brightness:.18,color:'#ffdfa5'})),flashlight:{enabled:false,brightness:.7}};
  const white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);white.needsUpdate=true;white.minFilter=white.magFilter=THREE.NearestFilter;
  const uniforms={uLocalPosition:{value:Array.from({length:LOCAL_LIGHT_COUNT},()=>new THREE.Vector4())},uLocalColour:{value:Array.from({length:LOCAL_LIGHT_COUNT},()=>new THREE.Vector4())},uLocalDirection:{value:Array.from({length:LOCAL_LIGHT_COUNT},()=>new THREE.Vector4())},uLocalCone:{value:Array.from({length:LOCAL_LIGHT_COUNT},()=>new THREE.Vector4(-1,1,30,0))},uLocalBurstBounds:{value:[new THREE.Vector4(),new THREE.Vector4()]},uLocalShadowMap:{value:white},uLocalShadowMatrix:{value:new THREE.Matrix4()},uLocalShadowSize:{value:new THREE.Vector2(1,1)},uLocalShadowEnabled:{value:0},uLocalShadowBias:{value:-.0002}};
  const records=[],fixtures=[],applied=new WeakSet();let lastFrame=null,lastShadowTime=-Infinity,shadowSize=1024,shadowHz=30,lastRawBound=0,lastShadowPose='';
  const metal=new THREE.MeshStandardMaterial({color:'#74614a',metalness:.82,roughness:.30}),baseMaterial=new THREE.MeshStandardMaterial({color:'#292e2b',metalness:.65,roughness:.48});
  function makeSpot(index,position,target,angle,penumbra){const light=new THREE.SpotLight('#ffffff',0,45,angle,penumbra,2);light.layers.enable(1);light.position.fromArray(position);light.target.position.fromArray(target);light.castShadow=index===3;light.shadow.mapSize.set(shadowSize,shadowSize);light.shadow.camera.near=.08;light.shadow.camera.far=45;light.shadow.bias=-.00015;light.shadow.normalBias=.018;light.shadow.autoUpdate=false;scene.add(light,light.target);records[index]={light,position:new THREE.Vector3(...position),direction:new THREE.Vector3(...target).sub(light.position).normalize(),radius:index===3?.025:.035,range:45,rawRGB:[0,0,0],candela:0};return light;}
  for(let i=0;i<3;i++){
    const [x,z]=GROUND_LAMP_LAYOUT[i],y=terrainHeight(x,z),group=new THREE.Group();group.name='Omnidirectional opal ground lamp '+(i+1);group.position.set(x,y,z);root.add(group);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.091,.104,.04,48),baseMaterial);base.position.y=.004;base.castShadow=true;group.add(base);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.088,.004,8,48).rotateX(Math.PI/2),metal);rim.position.y=.025;group.add(rim);
    const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(.033,.051,.025,32),metal);pedestal.position.y=.0355;pedestal.castShadow=true;group.add(pedestal);
    const collar=new THREE.Mesh(new THREE.TorusGeometry(.027,.003,8,40).rotateX(Math.PI/2),metal);collar.position.y=.049;group.add(collar);
    const emitterMaterial=new THREE.MeshStandardMaterial({color:'#e4e6df',roughness:.60,metalness:0,emissive:'#000000',emissiveIntensity:1});
    const diffuser=new THREE.Mesh(new THREE.SphereGeometry(GROUND_LAMP_RADIUS,48,24),emitterMaterial);diffuser.position.y=GROUND_LAMP_SOURCE_HEIGHT;diffuser.name='Unshielded frosted opal sphere';group.add(diffuser);
    const light=new THREE.PointLight('#ffffff',0,45,2);light.layers.enable(1);light.position.set(x,y+GROUND_LAMP_SOURCE_HEIGHT,z);scene.add(light);
    records[i]={light,position:light.position.clone(),direction:new THREE.Vector3(),radius:GROUND_LAMP_RADIUS,range:45,rawRGB:[0,0,0],candela:0};fixtures.push({group,emitterMaterial});
  }
  // The unshielded ground sources need no shadow cubemaps. Their physical
  // housings still cast and receive the existing Sun/Moon and torch shadows.
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const flash=makeSpot(3,[0,2,0],[0,2,-1],.40,.58);
  for(let i=4;i<LOCAL_LIGHT_COUNT;i++){const light=new THREE.PointLight('#fff',0,FIREWORK_LIGHT_RANGE,2);light.layers.enable(1);light.visible=false;/* Shader-only diffuse proxy: retain a compatibility light mirror without registering it with the scene. */records[i]={light,position:new THREE.Vector3(),direction:new THREE.Vector3(),radius:5,range:FIREWORK_LIGHT_RANGE,rawRGB:[0,0,0],candela:0};}
  function configure(patch={}){if(['night','on','off'].includes(patch.mode))settings.mode=patch.mode;if(typeof patch.linked==='boolean')settings.linked=patch.linked;if(patch.lamps)for(let i=0;i<3;i++)if(patch.lamps[i])Object.assign(settings.lamps[i],patch.lamps[i]);if(patch.index!==undefined){const ids=patch.linked||settings.linked?[0,1,2]:[clamp(Math.round(patch.index),0,2)];for(const i of ids)for(const key of ['enabled','brightness','color'])if(patch[key]!==undefined)settings.lamps[i][key]=patch[key];}if(patch.flashlight)Object.assign(settings.flashlight,patch.flashlight);return structuredClone(settings);}
  const rgb=new THREE.Color(),forward=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  function update({frame,camera,sunAltitude=45,clusters=[],burstBounds=[]}){
    lastFrame=frame;const scale=frame.sceneScale??2**frame.storageEV,raw=frame.rawPerCandela??RAW_PER_CANDELA,night=1-THREE.MathUtils.smoothstep(sunAltitude,-5,0),enabled=settings.mode==='on'?1:settings.mode==='off'?0:night;
    for(let i=0;i<3;i++){const s=settings.lamps[i],r=records[i];r.candela=s.enabled?clamp(s.brightness,0,1)*65*enabled:0;rgb.set(s.color);r.rawRGB=rgb.toArray().map(v=>v*r.candela*raw);fixtures[i].emitterMaterial.emissive.copy(rgb).multiplyScalar(finiteSourceRadiance(r.candela,r.radius)*raw*scale);}
    camera.getWorldDirection(forward);right.crossVectors(forward,up).normalize();const r=records[3],desired=camera.position.clone().addScaledVector(right,.19).addScaledVector(up,-.16).addScaledVector(forward,.10);
    r.position.copy(desired);r.direction.lerp(forward,1-Math.exp(-Math.max(.001,frame.dt)/.025)).normalize();r.candela=settings.flashlight.enabled?clamp(settings.flashlight.brightness,0,1)*850:0;rgb.set('#fff2db');r.rawRGB=rgb.toArray().map(v=>v*r.candela*raw);
    for(let i=4;i<LOCAL_LIGHT_COUNT;i++){const c=clusters[i-4],r=records[i];if(c){r.position.fromArray(c.position);r.radius=Math.max(.1,c.radius??c.sourceRadius??8);r.range=Math.max(40,c.range??FIREWORK_LIGHT_RANGE);const color=c.linearColor??c.color??[1,.8,.5];r.candela=Math.max(0,c.referenceCandela??c.candela??c.intensity??0);r.rawRGB=color.map(v=>Math.max(0,v)*r.candela*raw);}else{r.candela=0;r.rawRGB=[0,0,0];}}
    for(let i=0;i<LOCAL_LIGHT_COUNT;i++){const r=records[i],l=r.light;l.position.copy(r.position);if(l.isSpotLight)l.target.position.copy(r.position).add(r.direction);l.color.setRGB(...r.rawRGB);l.intensity=scale;l.distance=r.range;l.target?.updateMatrixWorld();uniforms.uLocalPosition.value[i].set(...r.position.toArray(),r.radius);uniforms.uLocalColour.value[i].set(...r.rawRGB.map(v=>v*scale),r.candela);uniforms.uLocalDirection.value[i].set(...r.direction.toArray(),l.isSpotLight?1:0);uniforms.uLocalCone.value[i].set(l.isSpotLight?Math.cos(l.angle):-1,l.isSpotLight?Math.cos(l.angle*(1-l.penumbra)):1,r.range,i>=4?1:0);}
    for(let i=0;i<2;i++){const b=burstBounds[i];uniforms.uLocalBurstBounds.value[i].set(...(b?.center??b?.position??[0,0,0]),Math.max(0,b?.radius??0));}
    flash.castShadow=settings.flashlight.enabled;const shadowPose=[...records[3].position.toArray(),...records[3].direction.toArray()].map(v=>Math.round(v*1e5)).join(',');
    if(flash.castShadow&&(frame.time-lastShadowTime>=1/shadowHz||shadowPose!==lastShadowPose)){flash.shadow.needsUpdate=true;lastShadowTime=frame.time;lastShadowPose=shadowPose;}
    const shadow=flash.shadow;if(flash.castShadow&&shadow.map){uniforms.uLocalShadowMap.value=shadow.map.texture;uniforms.uLocalShadowMatrix.value=shadow.matrix;uniforms.uLocalShadowSize.value.copy(shadow.mapSize);uniforms.uLocalShadowEnabled.value=1;}else{uniforms.uLocalShadowMap.value=white;uniforms.uLocalShadowEnabled.value=0;}
    lastRawBound=(1+1e-12)*records.reduce((sum,r,i)=>sum+Math.max(...r.rawRGB)*(i<3?Math.max(1/(Math.PI*r.radius*r.radius),1/(Math.PI*.02**2)):i===3?1/(Math.PI*.04**2):1/Math.max(.01,r.radius*r.radius)),0);
    return settings;
  }
  function apply(material){if(!material?.isMeshStandardMaterial||applied.has(material))return;applied.add(material);const previous=material.onBeforeCompile.bind(material),key=material.customProgramCacheKey.bind(material);material.onBeforeCompile=(shader,renderer)=>{previous(shader,renderer);Object.assign(shader.uniforms,uniforms,fireField?.uniforms,fireShadow?.uniforms);shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLocalWorld;').replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 localWorld=vec4(transformed,1.);
        #ifdef USE_BATCHING
          localWorld=batchingMatrix*localWorld;
        #endif
        #ifdef USE_INSTANCING
          localWorld=instanceMatrix*localWorld;
        #endif
        vLocalWorld=(modelMatrix*localWorld).xyz;`);const thin=shader.fragmentShader.includes('uGroveTransmissionBudget');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vLocalWorld;\n'+localLightGLSL+(fireField?fireworkLightFieldGLSL:'vec3 fireFieldIrradiance(vec3 p,vec3 n){return vec3(0.);}')+(fireShadow?fireworkBurstShadowGLSL:fireworkBurstShadowDisabledGLSL)).replace('#include <dithering_fragment>','#include <dithering_fragment>\n#ifdef SCENE_REACTIVE_OUTPUT\nsceneReactiveMask=max(sceneReactiveMask,localReceiverReactive(vLocalWorld));\n#endif');shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      // Firework receiver records are diffuse-only; ground lamps and torch
      // remain native PBR lights, including their specular response.
      vec3 fireworkDiffuseNormal=inverseTransformDirection(normal,viewMatrix);
      vec3 fireworkDiffuseIncident=vec3(0.);
      // Slots 4..${3+FIREWORK_NEAR_LIGHT_COUNT} are exact proxies for stars near the cay; the far light is the probe field.
      for(int fireworkId=4;fireworkId<${4+FIREWORK_NEAR_LIGHT_COUNT};fireworkId++){
        if(max(max(uLocalColour[fireworkId].r,uLocalColour[fireworkId].g),uLocalColour[fireworkId].b)<1e-12)continue;
        vec3 fireworkL;
        vec3 fireworkE=localIncident(vLocalWorld,fireworkId,fireworkL);
        fireworkDiffuseIncident+=fireworkE*max(0.,dot(fireworkDiffuseNormal,fireworkL));
      }
      fireworkDiffuseIncident+=fireFieldIrradiance(vLocalWorld,fireworkDiffuseNormal)*fireBurstVisibility(vLocalWorld,fireworkDiffuseNormal);
      reflectedLight.directDiffuse+=fireworkDiffuseIncident*BRDF_Lambert(material.diffuseColor);
`);if(thin)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`vec3 localThinNormal=inverseTransformDirection(nonPerturbedNormal,viewMatrix);
      for(int localId=0;localId<${4+FIREWORK_NEAR_LIGHT_COUNT};localId++){vec3 localL;vec3 localE=localIncident(vLocalWorld,localId,localL);float back=max(0.,-dot(localThinNormal,localL));outgoingLight+=localE*groveNormalTransmission*back*.31830988618;}
      outgoingLight+=fireFieldIrradiance(vLocalWorld,-localThinNormal)*fireBurstVisibility(vLocalWorld,localThinNormal)*groveNormalTransmission*.31830988618;
      #include <opaque_fragment>`);};material.customProgramCacheKey=()=>key()+'-local-receiver-near-proxies-probe-field-burst-shadow-v5';material.needsUpdate=true;}
  return {root,uniforms,glsl:localLightGLSL,records,configure,update,apply,
    setSceneExposure(P){const scale=2**P;for(let i=0;i<LOCAL_LIGHT_COUNT;i++){records[i].light.intensity=scale;uniforms.uLocalColour.value[i].set(...records[i].rawRGB.map(v=>v*scale),records[i].candela);if(i<3)fixtures[i].emitterMaterial.emissive.setRGB(...records[i].rawRGB.map(v=>v*scale/(Math.PI*records[i].radius**2)));}if(lastFrame)lastFrame={...lastFrame,storageEV:P,sceneScale:scale};},
    setQuality({flashShadowSize=1024,flashShadowHz=30}={}){shadowHz=flashShadowHz;if(shadowSize!==flashShadowSize){shadowSize=flashShadowSize;flash.shadow.map?.dispose();flash.shadow.map=null;flash.shadow.mapSize.set(shadowSize,shadowSize);}flash.shadow.needsUpdate=true;},
    get shadowNeedsUpdate(){return !!(flash.castShadow&&flash.shadow.needsUpdate);},
    getRadianceBound(){return {maxRGB:lastRawBound,reference:'finite spherical lamp emitters and conservative near-receiver RGB bound',limits:['native PBR punctual lights remain a finite-distance approximation near emitter housings','fireworks use up to '+FIREWORK_RECEIVER_LIGHT_COUNT+' source-I/RGB conserving diffuse-only shader proxies; no native firework specular']};},
    get state(){return {...structuredClone(settings),layout:'triangle around the cay',fixture:{heightMetres:GROUND_LAMP_SOURCE_HEIGHT+GROUND_LAMP_RADIUS,diameterMetres:2*GROUND_LAMP_RADIUS,emission:'unshielded spherical diffuser; omnidirectional point-light approximation'},rawReference:RAW_PER_CANDELA,shadowSize,shadowHz,active:records.filter(r=>r.candela>0).length,lights:records.map((r,i)=>({id:i,type:r.light.isSpotLight?'spot':'point',receiverPath:i<4?'native-PBR':'diffuse-shader',nativeSceneLight:i<4,position:r.position.toArray(),direction:r.direction.toArray(),candela:r.candela,rawRGB:r.rawRGB,radius:r.radius})),frameStorageEV:lastFrame?.storageEV??0};},
    dispose(){for(const r of records){scene.remove(r.light);if(r.light.target)scene.remove(r.light.target);r.light.shadow?.map?.dispose();}root.traverse(o=>{o.geometry?.dispose();});scene.remove(root);metal.dispose();baseMaterial.dispose();fixtures.forEach(x=>x.emitterMaterial.dispose());white.dispose();}
  };
}



