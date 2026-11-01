import { waveGLSL, waveComponents } from './waves.js';
import {resolveWaterImpact,createWaterImpactDroplets} from './water-impact.js';
import {environmentLightGLSL} from './environment-local-lights.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Bounded visual water-entry response. The actual surface impulse belongs to the
// app's shared wave/SWE system; this module neither adds it nor plays audio.
export function createSplash(THREE,{scene,uniforms={},sunDirection=null,maxEvents=4,dropletCount=96,sampleSurfaceHeight=null,skyContainsSolarDisc=false}={}){
  if(!scene)throw new Error('createSplash requires a scene');
  const events=[];let serial=0,lastTime=0;
  const shared={...uniforms};
  shared.uSplashSun=uniforms.uSun||{value:sunDirection||new THREE.Vector3(.4,.8,.3).normalize()};
  shared.uSplashSunColor=uniforms.uSunColor||{value:new THREE.Color(1,.97,.9)};
  shared.uSplashIrradiance=uniforms.uSunIrradiance||{value:3.6};
  shared.uSplashSky=uniforms.uSkyCube||{value:null};
  // The environment may have been captured at a different FP16 storage P.
  // This is the same capture-to-scene ratio used by the water material.
  shared.uSplashSkyScale=uniforms.uSkyCubeScale||{value:1};
  // Both production cube-capture paths explicitly disable uSolarDisk, even
  // though the live sky's uniform returns to1 afterward. Only explicit cube
  // metadata may say it contains a disc; never infer this from the live sky.
  shared.uSplashSkyHasSun=uniforms.uSkyCubeHasSolarDisk||{value:skyContainsSolarDisc?1:0};
  shared.uSplashFallbackSky=uniforms.uSkyColor||{value:new THREE.Color(.65,.82,.96)};
  shared.uSplashHasSky={value:uniforms.uSkyCube?.value?1:0};
  const localLighting=['uLocalPosition','uLocalColour','uLocalDirection','uLocalCone','uLocalShadowMap','uLocalShadowMatrix','uLocalShadowSize','uLocalShadowEnabled','uLocalShadowBias'].every(key=>uniforms[key])
    ?environmentLightGLSL
    :'vec3 localIrradiance(vec3 p,vec3 n){return vec3(0.);}';
  const root=new THREE.Group();root.name='Metric stone-water splashes';scene.add(root);
  const lightGLSL=/* glsl */`
    uniform vec3 uSplashSun,uSplashSunColor,uSplashFallbackSky;
    uniform float uSplashIrradiance,uSplashHasSky,uSplashSkyScale,uSplashSkyHasSun;
    uniform samplerCube uSplashSky;
    vec3 splashSky(vec3 d){
      vec3 result=uSplashFallbackSky*mix(.4,1.,smoothstep(-.1,.6,d.y));
      if(uSplashHasSky>.5)result=max(vec3(0.),textureCube(uSplashSky,d).rgb)*uSplashSkyScale;
      return result;
    }
    ${localLighting}
    float splashFresnel(float cosine){
      return .02037+.97963*pow(1.-clamp(cosine,0.,1.),5.);
    }
    float splashSolarRadiance(vec3 reflectedDirection){
      // Irradiance E is an integral over the solar disc, not its radiance.
      // A normalized angular Gaussian approximates the finite 0.53 degree
      // disc convolved with this pixel's reflected-direction footprint. Its
      // solid-angle integral is E; larger footprints spread the same energy.
      vec3 dx=dFdx(reflectedDirection),dy=dFdy(reflectedDirection);
      float variance=.00465*.00465*.25+(dot(dx,dx)+dot(dy,dy))/12.;
      float angleSquared=max(0.,2.*(1.-dot(reflectedDirection,normalize(uSplashSun))));
      return (1.-uSplashHasSky*uSplashSkyHasSun)*uSplashIrradiance*exp(-angleSquared/(2.*variance))/(6.28318530718*variance);
    }
  `;
  const dropletVertex=/* glsl */`
    attribute vec3 aOffset,aVelocity;
    attribute float aRadius,aLife;
    uniform float uAge,uViewportHeight,uBaseHeight;
    uniform vec2 uOrigin;
    varying vec2 vDisc;
    varying vec3 vCenter;
    varying float vCoverage,vAlive;
    void main(){
      float age=max(uAge,0.);
      vec3 center=vec3(uOrigin.x,uBaseHeight,uOrigin.y)+aOffset+aVelocity*age+vec3(0.,-4.905*age*age,0.);
      vec4 eye=viewMatrix*vec4(center,1.);
      float metresPerPixel=2.*max(-eye.z,.02)/(max(projectionMatrix[1][1],.01)*max(uViewportHeight,1.));
      // Raster support only: opacity preserves the physical projected area.
      float radius=max(aRadius,metresPerPixel*.65);
      vCoverage=min(1.,aRadius*aRadius/(radius*radius));
      vAlive=step(0.,uAge)*(1.-smoothstep(aLife*.78,aLife,age));
      if(age>=aLife||eye.z>-.02)vAlive=0.;
      vDisc=position.xy;vCenter=center;
      eye.xy+=position.xy*radius;
      gl_Position=projectionMatrix*eye;
    }
  `;
  const dropletFragment=/* glsl */`
    ${lightGLSL}
    varying vec2 vDisc;
    varying vec3 vCenter;
    varying float vCoverage,vAlive;
    void main(){
      float r2=dot(vDisc,vDisc),aa=max(fwidth(r2),.002);
      float coverage=1.-smoothstep(1.-aa,1.+aa,r2);
      if(coverage*vCoverage*vAlive<.0002)discard;
      vec3 cameraRight=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
      vec3 cameraUp=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
      vec3 V=normalize(cameraPosition-vCenter);
      vec3 N=normalize(cameraRight*vDisc.x+cameraUp*vDisc.y+V*sqrt(max(0.,1.-r2)));
      float F=splashFresnel(dot(N,V));
      vec3 R=reflect(-V,N);
      vec3 color=splashSky(R)+uSplashSunColor*splashSolarRadiance(R);
      // Reflection-only transparent proxy: transmit the actual background
      // unchanged instead of replacing it with an unrelated sky direction.
      // This omits resolved droplet refraction/internal caustics, rather than
      // inventing an ambient/emissive visibility gain.
      float alpha=F*coverage*vCoverage*vAlive;
      gl_FragColor=vec4(color,clamp(alpha,0.,1.));
      #ifdef SCENE_REACTIVE_OUTPUT
        sceneReactiveMask=1.;
      #endif
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <premultiplied_alpha_fragment>
    }
  `;
  const crownVertex=/* glsl */`
    #define GEOMETRY_PASS
    ${waveGLSL}
    uniform float uAge,uScale,uSeed;
    uniform vec2 uOrigin;
    varying vec3 vWorld;
    varying vec2 vCrown;
    void main(){
      float t=clamp(uAge/.34,0.,1.),angle=uv.x*6.2831853;
      float radius=(.012+.088*(1.-exp(-t*4.)))*uScale;
      float fingers=.88+.07*sin(angle*13.+uSeed)+.035*sin(angle*19.-uSeed*.7)+.025*sin(angle*7.+uSeed*1.3);
      float rise=.082*sin(3.14159265*sqrt(t))*exp(-t*.75)*uScale;
      float rim=pow(uv.y,4.)*.004*sin(angle*13.+uSeed)*sin(3.14159265*t)*uScale;
      vec2 horizontal=uOrigin+vec2(cos(angle),sin(angle))*radius*(.85+.15*uv.y);
      vWorld=vec3(horizontal.x,surface(horizontal)+.001+rise*uv.y*fingers+rim,horizontal.y);
      vCrown=uv;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }
  `;
  const crownFragment=/* glsl */`
    ${lightGLSL}
    uniform float uAge,uSeed,uFoam;
    varying vec3 vWorld;
    varying vec2 vCrown;
    void main(){
      float age=uAge/.34;
      float fade=smoothstep(0.,.045,age)*(1.-smoothstep(.55,1.,age));
      if(fade<=.001)discard;
      vec3 N=normalize(cross(dFdx(vWorld),dFdy(vWorld)));
      vec3 V=normalize(cameraPosition-vWorld);if(dot(N,V)<0.)N=-N;
      float F=splashFresnel(dot(N,V));
      vec3 R=reflect(-V,N);
      vec3 color=splashSky(R)+uSplashSunColor*splashSolarRadiance(R);
      // Two parallel lossless air/water interfaces including their internal
      // reflection series: R_sheet=2F/(1+F), T_sheet=1-R_sheet.
      float sheetReflection=2.*F/(1.+F);
      // Entrained air scatters incident light at the broken crest. The lower
      // water sheet stays transparent; foam is absent on legacy splashes.
      float foam=0.;
      if(uFoam>0.){
        float fingers=.78+.12*sin(vCrown.x*81.6814+uSeed)+.1*sin(vCrown.x*119.3805-uSeed*.7);
        foam=uFoam*smoothstep(.25,.82,vCrown.y)*fingers;
        vec3 foamNormal=normalize(N+vec3(0.,1.,0.));
        vec3 foamLight=splashSky(vec3(0.,1.,0.))*.65
          +uSplashSunColor*(uSplashIrradiance*max(0.,dot(foamNormal,normalize(uSplashSun)))*.24)
          +localIrradiance(vWorld,foamNormal)*.24;
        color=mix(color,foamLight,foam);
      }
      float alpha=(sheetReflection+.42*foam)*fade*smoothstep(0.,.12,vCrown.y);
      gl_FragColor=vec4(color,clamp(alpha,0.,1.));
      #ifdef SCENE_REACTIVE_OUTPUT
        sceneReactiveMask=1.;
      #endif
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <premultiplied_alpha_fragment>
    }
  `;
  const crownGeometry=new THREE.PlaneGeometry(1,1,96,4);
  const quad=new THREE.BufferGeometry();
  quad.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,-1,1,0,1,1,0],3));quad.setIndex([0,1,2,2,1,3]);
  function estimateHeight(x,z,time){
    if(sampleSurfaceHeight){const h=sampleSurfaceHeight(x,z,time);if(Number.isFinite(h))return h;}
    const offset=uniforms.uCurrentOffset?.value||{x:0,y:0},wind=uniforms.uWind?.value??1;
    let h=0;
    for(const w of waveComponents){
      const omega=Math.sqrt((9.81*w.k+.000070244*w.k**3)*Math.tanh(Math.min(w.k*3,4)));
      const filter=1-THREE.MathUtils.smoothstep(w.k,5,9);
      h+=filter*w.amplitude*(w.kind==='swell'?(uniforms.uSwell?.value??1):wind*(uniforms.uWindSea?.value??1))*Math.sin(((x-offset.x)*Math.cos(w.angle)+(z-offset.y)*Math.sin(w.angle))*w.k-omega*time+w.phase);
    }
    return h;
  }
  function remove(index){
    const event=events[index];root.remove(event.group);event.geometry.dispose();event.dropletMaterial.dispose();event.crownMaterial.dispose();events.splice(index,1);
  }
  function spawn(x,z,time=lastTime,strength=1,options={}){
    if(!Number.isFinite(x+z+time+strength))return null;
    let {stoneDiameter=.025,surfaceHeight=null}=options;
    const impact=resolveWaterImpact(options);
    if(impact&&!impact.valid)return null;
    if(impact&&!impact.visible)return null;
    stoneDiameter=clamp(Number(stoneDiameter)||.025,.012,.045);
    while(events.length>=Math.max(1,maxEvents))remove(0);
    let seed=++serial*747796405;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
    const scale=impact?impact.scale:clamp(stoneDiameter/.025,.55,1.8)*Math.sqrt(clamp(strength,.2,1.6));
    const physicalDrops=impact?createWaterImpactDroplets(impact,{seed,capacity:dropletCount}):null;
    const count=physicalDrops?.count??clamp(Math.round(dropletCount),24,160);
    const offsets=physicalDrops?.offsets||[],velocities=physicalDrops?.velocities||[],radii=physicalDrops?.radii||[],lives=physicalDrops?.lives||[];
    for(let i=0;!physicalDrops&&i<count;i++){
      const angle=i*2.39996323+random()*.35,radial=.005+random()*.013*scale;
      const speed=(.22+random()*.66)*Math.sqrt(scale),up=(.75+random()*1.4)*Math.sqrt(scale);
      offsets.push(Math.cos(angle)*radial,.007+random()*.018,Math.sin(angle)*radial);
      velocities.push(Math.cos(angle)*speed,up,Math.sin(angle)*speed);
      // Default: mostly 0.4–2.4 mm diameter; sparse drops up to 4 mm.
      const diameter=(i%17===0?.0024+random()*.0016:.0004+Math.pow(random(),1.7)*.002)*scale;
      radii.push(diameter*.5);lives.push((up+Math.sqrt(up*up+2*9.81*.02))/9.81);
    }
    const geometry=new THREE.InstancedBufferGeometry();geometry.setIndex(quad.index.clone());geometry.setAttribute('position',quad.attributes.position.clone());geometry.instanceCount=count;
    geometry.setAttribute('aOffset',new THREE.InstancedBufferAttribute(new Float32Array(offsets),3));
    geometry.setAttribute('aVelocity',new THREE.InstancedBufferAttribute(new Float32Array(velocities),3));
    geometry.setAttribute('aRadius',new THREE.InstancedBufferAttribute(new Float32Array(radii),1));
    geometry.setAttribute('aLife',new THREE.InstancedBufferAttribute(new Float32Array(lives),1));
    const u={...shared,uOrigin:{value:new THREE.Vector2(x,z)},uAge:{value:0},uViewportHeight:{value:900},uScale:{value:scale},uFoam:{value:impact?.severity===undefined?0:.8*Math.sqrt(impact.severity)},uSeed:{value:random()*8},uBaseHeight:{value:Number.isFinite(surfaceHeight)?surfaceHeight:estimateHeight(x,z,time)}};
    // Premultiplication preserves the same colour compositing but also lets
    // scalar MRT reactive1 survive: that output has no source alpha channel,
    // so straight SRC_ALPHA blending would erase it. Main target uses R8.
    const dropletMaterial=new THREE.ShaderMaterial({uniforms:u,vertexShader:dropletVertex,fragmentShader:dropletFragment,transparent:true,premultipliedAlpha:true,depthWrite:false,depthTest:true});
    // The crown has a normalized authored animation clock; droplets always
    // receive unscaled physical seconds. Foam only affects physical entries.
    const crownUniforms=impact?{...u,uAge:{value:0}}:u;
    const crownMaterial=new THREE.ShaderMaterial({uniforms:crownUniforms,vertexShader:crownVertex,fragmentShader:crownFragment,defines:{BAKED_WAVE_TEXTURES:1},transparent:true,premultipliedAlpha:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide});
    const group=new THREE.Group();group.name='25 mm stone splash';
    const drops=new THREE.Mesh(geometry,dropletMaterial),crown=new THREE.Mesh(crownGeometry,crownMaterial);
    drops.frustumCulled=crown.frustumCulled=false;drops.renderOrder=4;crown.renderOrder=3;
    drops.name='Millimetre spherical drop impostors';crown.name='Thin centimetre water crown';
    group.add(drops,crown);root.add(group);
    const crownDuration=impact?.crownDurationSeconds??.34,duration=Math.max(crownDuration,...lives);
    const event={id:serial,x,z,born:time,group,geometry,dropletMaterial,crownMaterial,uniforms:u,crownUniforms,crownDuration,duration,count,scale,radii,lives,impact,physicalDrops};events.push(event);
    return{id:serial,x,z,stoneDiameterMetres:stoneDiameter,maximumDropDiameterMetres:Math.max(...radii)*2,durationSeconds:duration,impact,representedDropEnergy:physicalDrops?.energy??null};
  }
  return{
    spawn,root,
    update(dt,time,camera,viewport=900){
      lastTime=time;const height=typeof viewport==='number'?viewport:viewport.height||viewport.viewportHeight||900;
      shared.uSplashHasSky.value=shared.uSplashSky.value?1:0;
      for(let i=events.length-1;i>=0;i--){
        const event=events[i],age=Math.max(0,time-event.born);
        if(age>event.duration+.08){remove(i);continue;}
        event.uniforms.uAge.value=age;event.uniforms.uViewportHeight.value=Math.max(1,height);
        if(event.impact)event.crownUniforms.uAge.value=age*.34/event.crownDuration;
      }
    },
    clear(){while(events.length)remove(events.length-1);},
    get state(){return{active:events.length,maximumEvents:maxEvents,units:'metres/seconds',gravity:9.81,representation:'analytic spherical droplets + thin crown; not a fluid solve',events:events.map(e=>({id:e.id,x:e.x,z:e.z,age:Math.max(0,lastTime-e.born),dropCount:e.count,dropDiameterRangeMetres:[Math.min(...e.radii)*2,Math.max(...e.radii)*2],maximumCrownRadiusMetres:.1*e.scale,crownDurationSeconds:e.crownDuration,durationSeconds:e.duration,impactHeightEstimate:e.uniforms.uBaseHeight.value,impact:e.impact,representedDropEnergy:e.physicalDrops?.energy??null,representedDropRadiusScale:e.physicalDrops?.radiusScale??1}))};},
    dispose(){while(events.length)remove(events.length-1);quad.dispose();crownGeometry.dispose();scene.remove(root);}
  };
}
