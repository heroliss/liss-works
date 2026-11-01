// Clean Sand 02 photographed albedo at its published 2.14 m width.
// Normal and roughness are code-native: no Sand 03 / footwear scan data is read.
// Albedo is shared with the refracted seabed; standard PBR retains scene lighting.
export const sandAlbedoGLSL = /* glsl */`
  uniform sampler2D uSandColor;
  uniform float uSandFineTile;
  uniform vec3 uSandColorMean;
  uniform float uSandAlbedoGain;
  float sandHash(vec2 p) {
    vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);
    return fract((p3.x+p3.y)*p3.z);
  }
  vec2 sandHash2(vec2 p) {return vec2(sandHash(p+vec2(19.19,73.27)),sandHash(p+vec2(41.73,11.31)));}
  float sandNoise(vec2 p) {
    vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(sandHash(i),sandHash(i+vec2(1,0)),f.x),mix(sandHash(i+vec2(0,1)),sandHash(i+vec2(1)),f.x),f.y);
  }
  float sandNoiseResolve(float cellsPerPixel){return 1.-smoothstep(.25,.5,cellsPerPixel);}
  float sandFilteredNoise(vec2 p,float cellsPerPixel){
    float weight=sandNoiseResolve(cellsPerPixel);
    if(weight<=0.)return .5;
    return mix(.5,sandNoise(p),weight);
  }
  float sandFbm(vec2 p,float cellsPerPixel) {
    if(cellsPerPixel>=.5)return .5;
    float v=.55*sandFilteredNoise(p,cellsPerPixel);p=mat2(.8,-.6,.6,.8)*p*2.07+7.3;cellsPerPixel*=2.07;
    v+=.28*sandFilteredNoise(p,cellsPerPixel);p=mat2(.6,.8,-.8,.6)*p*2.03+13.1;cellsPerPixel*=2.03;
    return v+.17*sandFilteredNoise(p,cellsPerPixel);
  }
  vec3 sandPhotographedColour(vec2 uv,vec2 dx,vec2 dy) {
    // Derivatives are supplied by the unconditional caller, before this
    // varying branch. A many-tile footprint contains only the source mean.
    float resolved=1.-smoothstep(1.,3.,max(length(dx),length(dy)));
    if(resolved<=0.)return uSandColorMean;
    vec2 skew=mat2(1.,0.,-.577350269,1.154700538)*uv;
    vec2 cell=floor(skew),f=fract(skew),v0,v1,v2;vec3 w;
    if(f.x+f.y<1.) {w=vec3(1.-f.x-f.y,f.x,f.y);v0=cell;v1=cell+vec2(1,0);v2=cell+vec2(0,1);}
    else {w=vec3(f.x+f.y-1.,1.-f.x,1.-f.y);v0=cell+1.;v1=cell+vec2(0,1);v2=cell+vec2(1,0);}
    w=w*w*(3.-2.*w);w/=max(dot(w,vec3(1)),.0001);
    vec3 average=(textureGrad(uSandColor,uv+sandHash2(v0)*31.7,dx,dy)*w.x+
                  textureGrad(uSandColor,uv+sandHash2(v1)*31.7,dx,dy)*w.y+
                  textureGrad(uSandColor,uv+sandHash2(v2)*31.7,dx,dy)*w.z).rgb;
    vec3 detailed=clamp(uSandColorMean+(average-uSandColorMean)*inversesqrt(max(dot(w,w),.333333)),vec3(.001),vec3(1));
    return mix(uSandColorMean,detailed,resolved);
  }
  float sandWetness(vec2 worldXZ,float height,float footprint) {
    // These bounds follow exactly from the original edge noise in [0,1].
    // Fully submerged cells and dry dune cells need no wet-edge hashes.
    if(height<=.008)return 1.;
    if(height>=.1935)return 0.;
    float edge=.13+.055*(sandFilteredNoise(worldXZ*.72,footprint*.72)-.5)+.022*(sandFilteredNoise(worldXZ*2.1,footprint*2.1)-.5);
    return 1.-smoothstep(.008,edge+.025,height);
  }
  float sandWetness(vec2 worldXZ,float height){
    float footprint=max(length(dFdx(worldXZ)),length(dFdy(worldXZ)));
    return sandWetness(worldXZ,height,footprint);
  }
  vec3 sampleSandAlbedo(vec2 worldXZ,float height) {
    vec2 dx=dFdx(worldXZ),dy=dFdy(worldXZ);
    float footprint=max(length(dx),length(dy));
    vec3 photographed=sandPhotographedColour(worldXZ/uSandFineTile,dx/uSandFineTile,dy/uSandFineTile);
    float sourceY=dot(photographed,vec3(.2126,.7152,.0722));
    float meanY=dot(uSandColorMean,vec3(.2126,.7152,.0722));
    // Restore the complete clean source texture. There is no high-pass rescue
    // of a contaminated scan, and no low-pass that erases natural sediment.
    float grainTone=clamp(pow(max(sourceY,.003)/max(meanY,.003),.88),.43,1.48);
    float deposits=sandFbm(worldXZ*.13,footprint*.13),swales=sandFbm(worldXZ*.63+17.5,footprint*.63);
    float tone=mix(1.,grainTone,.92)*mix(.91,1.07,deposits)*mix(.96,1.04,swales);
    float resolve=1.-smoothstep(.00065,.0028,footprint);
    float grain=0.,pore=0.;
    if(resolve>0.){
      vec2 q=worldXZ*630.;grain=sandHash(floor(q));
      pore=(1.-smoothstep(.06,.33,length(fract(q)-.5)))*step(.83,grain);
    }
    tone*=1.-pore*.14*resolve;
    vec3 colour=vec3(.665,.642,.589)*tone;
    colour*=mix(vec3(1),vec3(1.025,.975,.956),step(.975,grain)*resolve*.65);
    colour*=mix(vec3(1),vec3(.665,.707,.743),sandWetness(worldXZ,height,footprint));
    float reef=0.,reefDepth=smoothstep(.55,3.,-height);
    if(reefDepth>0.)reef=smoothstep(.64,.80,sandFbm(worldXZ*.14+7.,footprint*.14))*reefDepth;
    colour=mix(colour,colour*vec3(.59,.65,.51),reef*.36);
    return clamp(colour*uSandAlbedoGain,vec3(.04),vec3(.88));
  }
`;
const sandNormalGLSL = /* glsl */`
  uniform float uSandMicroStrength;
  float sandHash3(vec3 p) {p=fract(p*.1031);p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
  vec4 sandNoiseGradient(vec3 p) {
    vec3 i=floor(p),f=fract(p),u=f*f*(3.-2.*f),du=6.*f*(1.-f);
    float a=sandHash3(i),b=sandHash3(i+vec3(1,0,0));
    float c=sandHash3(i+vec3(0,1,0)),d=sandHash3(i+vec3(1,1,0));
    float e=sandHash3(i+vec3(0,0,1)),g=sandHash3(i+vec3(1,0,1));
    float h=sandHash3(i+vec3(0,1,1)),j=sandHash3(i+vec3(1,1,1));
    float z0=mix(mix(a,b,u.x),mix(c,d,u.x),u.y),z1=mix(mix(e,g,u.x),mix(h,j,u.x),u.y);
    return vec4(mix(z0,z1,u.z),
      mix(mix(b-a,d-c,u.y),mix(g-e,j-h,u.y),u.z)*du.x,
      mix(mix(c-a,d-b,u.x),mix(h-e,j-g,u.x),u.z)*du.y,(z1-z0)*du.z);
  }
  vec3 sandWorldNormal(vec3 baseNormal,vec3 p) {
    float footprint=max(length(dFdx(p)),length(dFdy(p)));
    float resolved=1.-smoothstep(.00075,.0035,footprint);
    float larger=1.-smoothstep(.0035,.018,footprint);
    if(larger<=0.&&resolved<=0.)return baseNormal;
    vec4 micro=vec4(0.),granules=vec4(0.);
    if(resolved>0.)micro=sandNoiseGradient(p*610.+vec3(5.3,17.7,3.9));
    if(larger>0.)granules=sandNoiseGradient(p*175.+vec3(19.2,3.7,14.9));
    vec2 slope=(-micro.yw*.22*resolved-granules.yw*.065*larger)*uSandMicroStrength;
    slope*=mix(1.,.48,sandWetness(p.xz,p.y,footprint));
    // Large-scale shape comes from the actual terrain normals, including the
    // sparse millimetre bedform geometry. No photographed normal map is read.
    vec3 tangent=normalize(vec3(1,0,0)-baseNormal*baseNormal.x);
    vec3 bitangent=normalize(cross(tangent,baseNormal));
    return normalize(baseNormal+tangent*slope.x+bitangent*slope.y);
  }
  float sampleSandRoughness(vec3 p) {
    float footprint=max(length(dFdx(p)),length(dFdy(p)));
    float resolved=1.-smoothstep(.0006,.0023,footprint);
    float broadResolved=1.-smoothstep(.004,.018,footprint);
    float wet=sandWetness(p.xz,p.y,footprint),dry=.90;
    if(broadResolved>0.&&wet<1.)dry+=(sandNoise(p.xz*80.+13.7)-.5)*.04*broadResolved;
    float r=mix(dry,.31,wet);
    if(resolved<=0.)return r;
    vec2 q=p.xz*610.;
    float facet=step(.989,sandHash(floor(q)+31.6))*(1.-smoothstep(.12,.28,length(fract(q)-.5)));
    return mix(r,.22,facet*resolved*.8);
  }
`;


function cpuNoise(x,z) {
  const hash=(a,b)=>{const v=Math.sin(a*127.1+b*311.7)*43758.5453;return v-Math.floor(v);};
  const ix=Math.floor(x),iz=Math.floor(z);let fx=x-ix,fz=z-iz;
  fx=fx*fx*(3-2*fx);fz=fz*fz*(3-2*fz);
  const lo=hash(ix,iz)*(1-fx)+hash(ix+1,iz)*fx;
  const hi=hash(ix,iz+1)*(1-fx)+hash(ix+1,iz+1)*fx;
  return lo*(1-fz)+hi*fz;
}

function microRelief(x,z,height) {
  if(height<.02||height>2.8)return 0;
  const dry=Math.min(1,Math.max(0,(height-.02)/.22));
  const warp=cpuNoise(x*.41+3.1,z*.41-1.7);
  const pockets=Math.max(0,cpuNoise(x*.16,z*.16)-.38)/.62;
  const ridge=Math.sin((x*.62+z*.32+warp*.85)*Math.PI*2);
  return dry*(.0018*(cpuNoise(x*.9,z*.9)-.5)+.0065*ridge*pockets);
}

/**
 * @param {object} options
 * textures array: [cleanColor], or object: {color}.
 * Only this colour texture is sampled. Normals/roughness are entirely native.
 * Texture ownership stays with the caller. update(time) refreshes caustics.
 */
export function createSand(THREE,{geometry,textures,sunDirection,getCaustics=()=>null,terrainHeight,onCompile,fragments=true,fineTileMetres=2.14,colorMean=[.11938986,.09344617,.06486245]}={}) {
  if(!geometry)throw new Error('createSand requires the terrain geometry.');
  const color=Array.isArray(textures)?textures[0]:textures?.color;
  if(!color?.isTexture)throw new Error('createSand requires a clean colour texture.');
  color.wrapS=color.wrapT=THREE.RepeatWrapping;
  color.colorSpace=THREE.SRGBColorSpace;
  const albedoUniforms={
    uSandColor:{value:color},uSandFineTile:{value:fineTileMetres},
    uSandColorMean:{value:new THREE.Vector3(...colorMean)},uSandAlbedoGain:{value:.91}
  };
  const fallback=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);fallback.needsUpdate=true;
  const uniforms={...albedoUniforms,
    uSandMicroStrength:{value:1},uSandCausticMap:{value:fallback},uSandCausticExtent:{value:64},
    uSandTime:{value:0},uSandInspect:{value:0},uSunDir:{value:sunDirection||new THREE.Vector3(1,1,0).normalize()},
    // Compatibility aliases for existing inspection tools.
    uSand:{value:color}
  };
  if(!geometry.userData.atollSandRelief){
    const position=geometry.attributes.position;
    let maximum=0;
    for(let i=0;i<position.count;i++){
      const x=position.getX(i),z=position.getZ(i),h=position.getY(i),d=microRelief(x,z,h);
      position.setY(i,h+d);maximum=Math.max(maximum,Math.abs(d));
    }
    position.needsUpdate=true;geometry.computeVertexNormals();
    geometry.userData.atollSandRelief={maximumDisplacementMetres:maximum};
  }
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.89,metalness:0});
  let compiled;
  material.onBeforeCompile=shader=>{
    compiled=shader;Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSandWorld;')
      .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvSandWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vSandWorld;
      uniform sampler2D uSandCausticMap;
      uniform float uSandCausticExtent;
      uniform float uSandInspect;
      ${sandAlbedoGLSL}
      ${sandNormalGLSL}
    `).replace('#include <map_fragment>',`
      diffuseColor.rgb=sampleSandAlbedo(vSandWorld.xz,vSandWorld.y);
    `).replace('#include <normal_fragment_maps>',`
      vec3 sandBaseWorld=inverseTransformDirection(normal,viewMatrix);
      vec3 sandN=sandWorldNormal(sandBaseWorld,vSandWorld);
      normal=normalize(mat3(viewMatrix)*sandN);
    `).replace('#include <roughnessmap_fragment>',`
      float roughnessFactor=sampleSandRoughness(vSandWorld);
    `).replace('#include <lights_fragment_end>',`
      #include <lights_fragment_end>
      float sandDepth=-vSandWorld.y;
      vec2 causticUV=vSandWorld.xz/(2.*uSandCausticExtent)+.5;
      float concentration=texture2D(uSandCausticMap,causticUV).r;
      float covered=1.-smoothstep(.45,.49,max(abs(causticUV.x-.5),abs(causticUV.y-.5)));
      float causticAmount=covered*smoothstep(.04,.32,sandDepth)*(1.-smoothstep(1.5,5.,sandDepth));
      reflectedLight.directDiffuse*=mix(1.,clamp(concentration,.05,6.),causticAmount);
    `).replace('#include <opaque_fragment>',`
      if(uSandInspect>.5&&uSandInspect<1.5)outgoingLight=vec3(sandWetness(vSandWorld.xz,vSandWorld.y),roughnessFactor,.0);
      if(uSandInspect>1.5)outgoingLight=diffuseColor.rgb;
      #include <opaque_fragment>
    `);
    onCompile?.(shader);
  };
  material.customProgramCacheKey=()=> 'atoll-coral-sand-v7-footprint-filtered-native-grains';
  const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;mesh.name='Photographic coral sand, damp swash and submerged shelf';
  const detailGroup=new THREE.Group();detailGroup.name='Sparse real-scale coral and shell fragments';
  if(fragments&&terrainHeight)makeFragments(THREE,detailGroup,terrainHeight);
  const update=(time=0)=>{
    uniforms.uSandTime.value=time;
    const source=getCaustics?.();
    uniforms.uSandCausticMap.value=source?.texture||(source?.isTexture?source:fallback);
    uniforms.uSandCausticExtent.value=source?.extent||64;
  };
  update();
  return {mesh,material,uniforms,albedoUniforms,detailGroup,update,
    get shader(){return compiled;},
    get metadata(){return {source:'Sand 02 diffuse only',fineTileMetres,colorLinearMean:colorMean,normalModel:'code-native grains over geometric bedforms',roughnessModel:'code-native dry/wet dielectric',microRelief:geometry.userData.atollSandRelief,fragmentCount:detailGroup.userData.count||0};},
    dispose(){material.dispose();fallback.dispose();detailGroup.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}
  };
}

function makeFragments(THREE,group,terrainHeight) {
  let seed=61297;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
  const count=144,positions=[],uv=[],indices=[];
  const sides=8;
  positions.push(0,.10,0);uv.push(.5,.5);
  for(let i=0;i<sides;i++){
    const a=i/sides*Math.PI*2,r=.72+random()*.28;
    positions.push(Math.cos(a)*r,(random()-.5)*.12,Math.sin(a)*r*.66);uv.push(.5+Math.cos(a)*.5,.5+Math.sin(a)*.5);
  }
  for(let i=0;i<sides;i++)indices.push(0,i+1,(i+1)%sides+1);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.81,side:THREE.DoubleSide});
  const objects=new THREE.InstancedMesh(geo,mat,count);objects.name='Centimetre coral-shell fragments';objects.castShadow=true;objects.receiveShadow=true;
  const transform=new THREE.Object3D();let placed=0;
  for(let attempt=0;attempt<12000&&placed<count;attempt++){
    const x=(random()-.5)*83,z=(random()-.5)*58,h=terrainHeight(x,z);
    if(h<.015||h>.58||random()>.48)continue;
    // 12--55 mm full length. Thin broken flakes, never boulders or spheres.
    const length=.012+Math.pow(random(),2)*.043;
    transform.position.set(x,h+microRelief(x,z,h)+.001,z);
    transform.rotation.set((random()-.5)*.23,random()*Math.PI*2,(random()-.5)*.18);
    transform.scale.set(length*.5,length*(.18+random()*.18),length*.5);
    transform.updateMatrix();objects.setMatrixAt(placed,transform.matrix);
    const color=new THREE.Color().setRGB(.61+random()*.12,.59+random()*.11,.53+random()*.12);
    objects.setColorAt(placed,color);placed++;
  }
  objects.count=placed;objects.instanceMatrix.needsUpdate=true;group.userData.count=placed;group.add(objects);
}
