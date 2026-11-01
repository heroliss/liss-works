import * as THREE from 'three';
import { waveGLSL, waveComponents } from './waves.js';

const LEAF_LENGTH=.22, LEAF_WIDTH=.082, FREEBOARD=.004;
const transportWaves=waveComponents.map(w=>({...w,dx:Math.cos(w.angle),dz:Math.sin(w.angle),omega:Math.sqrt((9.81*w.k+.000070244*w.k**3)*Math.tanh(Math.min(w.k*3,4))),geometryFilter:1-THREE.MathUtils.smoothstep(w.k,5,9)}));

// Used only for screen cues. The rendered mesh samples the complete shared GPU
// surface (including SWE); this estimate does not read the GPU back to the CPU.
export function estimateLeafSurface(uniforms,x,z,time=uniforms.uTime?.value||0){
  const offset=uniforms.uCurrentOffset?.value||{x:0,y:0},wind=uniforms.uWind?.value??1;
  let height=0;
  for(const w of transportWaves){
    height+=w.geometryFilter*w.amplitude*(w.kind==='swell'?(uniforms.uSwell?.value??1):wind*(uniforms.uWindSea?.value??1))*Math.sin(((x-offset.x)*w.dx+(z-offset.y)*w.dz)*w.k-w.omega*time+w.phase);
  }
  return height;
}

export function projectedLeafPixels(camera,distance,viewportHeight=900,length=LEAF_LENGTH){
  if(!camera?.projectionMatrix||!(distance>0))return 0;
  return length*Math.abs(camera.projectionMatrix.elements[5])*viewportHeight/(2*distance);
}

// Material tracers: mean current transports the leaves, while wave orbits
// oscillate around that path. The two effects deliberately remain distinct.
export function createFloatingLeaves(scene,{uniforms,hydrodynamics,terrainHeight}){
  const leaves=[];
  let serial=0,lastTime=uniforms.uTime?.value||0;
  const positions=[],uvs=[],indices=[];
  const segments=28;
  for(let i=0;i<=segments;i++){
    const t=i/segments,x=(t-.5)*LEAF_LENGTH;
    const width=Math.pow(Math.sin(Math.PI*t),.7)*LEAF_WIDTH*.5;
    for(let k=-1;k<=1;k++){
      positions.push(x,.0015+(k===0?.0018:.0011)*Math.sin(Math.PI*t)+.0015*Math.pow(t,6),k*width);
      uvs.push(t,(k+1)*.5);
    }
    if(i<segments)for(let k=0;k<2;k++){
      const a=i*3+k;indices.push(a,a+1,a+3,a+1,a+4,a+3);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,0,128);
  gradient.addColorStop(0,'#8c6b38');gradient.addColorStop(.12,'#8d9944');gradient.addColorStop(.48,'#9fa44f');gradient.addColorStop(.52,'#b4ad6a');gradient.addColorStop(.88,'#7e8e3d');gradient.addColorStop(1,'#947344');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,512,128);
  for(let i=0;i<130;i++){
    const x=(Math.sin(i*127.1)*43758.5453%1+1)%1*512,y=(Math.sin(i*311.7)*15731.83%1+1)%1*128;
    ctx.fillStyle=i%3?'#b4b17b16':'#5e612d18';ctx.beginPath();ctx.ellipse(x,y,2+(i%5),.8+(i%3),-.4,0,Math.PI*2);ctx.fill();
  }
  ctx.strokeStyle='#b7bd7777';ctx.lineWidth=1;
  for(let x=10;x<510;x+=16){ctx.beginPath();ctx.moveTo(x,64);ctx.quadraticCurveTo(x+7,30,x+23,0);ctx.moveTo(x,64);ctx.quadraticCurveTo(x+7,98,x+23,128);ctx.stroke();}
  ctx.strokeStyle='#b4bb77';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,64);ctx.lineTo(512,64);ctx.stroke();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:.52,metalness:0,side:THREE.DoubleSide});
  const depthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
  for(const mat of [material,depthMaterial]){
    mat.defines={...mat.defines,BAKED_WAVE_TEXTURES:1};
    mat.onBeforeCompile=shader=>{
      // New spectral textures are shared automatically; no stale uniform list.
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader='#define GEOMETRY_PASS\n'+waveGLSL+'\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec3 leafWorld=(modelMatrix*vec4(transformed,1.)).xyz;
        transformed.y+=surface(leafWorld.xz)+${FREEBOARD.toFixed(4)};
      `);
      if(mat===material)shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        vec3 leafNormalWorld=(modelMatrix*vec4(position,1.)).xyz;
        vec3 leafField=waterField(leafNormalWorld.xz);
        vec3 waveSlope=vec3(leafField.y,0.,leafField.z);
        objectNormal.x-=dot(waveSlope,modelMatrix[0].xyz)*objectNormal.y;
        objectNormal.z-=dot(waveSlope,modelMatrix[2].xyz)*objectNormal.y;
        objectNormal=normalize(objectNormal);
      `);
    };
    mat.customProgramCacheKey=()=> 'atoll-buoyant-leaf-v3-metric-normal';
  }
  const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3(),point=new THREE.Vector3();
  function positionEstimate(leaf){
    const p=leaf.mesh.position;return new THREE.Vector3(p.x,estimateLeafSurface(uniforms,p.x,p.z,lastTime)+FREEBOARD+.003,p.z);
  }
  function terrainOccludes(a,b){
    const steps=Math.min(96,Math.max(12,Math.ceil(a.distanceTo(b)/.8)));
    for(let i=1;i<steps;i++){point.lerpVectors(a,b,i/steps);if(terrainHeight(point.x,point.z)>point.y+.015)return true;}
    return false;
  }
  function focusFor(x,z,camera){
    const target=new THREE.Vector3(x,estimateLeafSurface(uniforms,x,z,lastTime),z);
    const direction=new THREE.Vector3(camera.position.x-x,0,camera.position.z-z).normalize();
    if(direction.lengthSq()<.1)direction.set(1,0,0);
    for(const angle of [0,.45,-.45,.9,-.9,Math.PI]){
      const d=direction.clone().applyAxisAngle(new THREE.Vector3(0,1,0),angle);
      const position=target.clone().addScaledVector(d,3.4);position.y=target.y+1.65;
      if(position.y<terrainHeight(position.x,position.z)+.5)continue;
      if(!terrainOccludes(position,target))return{position:position.toArray(),target:target.toArray()};
    }
    return null;
  }
  function suggestSpawn(camera,{viewportHeight=900,minimumPixels=12,maxDistance=140}={}){
    camera.updateMatrixWorld();const candidates=[];
    for(const y of [-.78,-.64,-.49,-.34,-.18,.02])for(const x of [0,-.23,.23,-.46,.46,-.65,.65]){
      ray.setFromCamera(new THREE.Vector2(x,y),camera);
      if(!ray.ray.intersectPlane(plane,hit)||terrainHeight(hit.x,hit.z)>-.1)continue;
      const distance=hit.distanceTo(camera.position);
      if(distance>maxDistance||distance<.7||terrainOccludes(camera.position,hit))continue;
      candidates.push({x:hit.x,z:hit.z,distance,projectedPixels:projectedLeafPixels(camera,distance,viewportHeight),ndc:[x,y],score:distance*(1+.1*Math.abs(x))+.8*Math.abs(y+.55)});
    }
    candidates.sort((a,b)=>a.score-b.score);if(!candidates.length)return null;
    const best=candidates[0];delete best.score;
    return{...best,depth:-terrainHeight(best.x,best.z),focusRecommended:best.projectedPixels<minimumPixels,focus:focusFor(best.x,best.z,camera)};
  }
  function locate(camera,{viewportWidth=1440,viewportHeight=900,id=null}={}){
    const leaf=id===null?leaves.at(-1):leaves.find(l=>l.id===id);if(!leaf)return null;
    camera.updateMatrixWorld();const p=positionEstimate(leaf),ndc=p.clone().project(camera),distance=p.distanceTo(camera.position);
    const visible=ndc.z>=-1&&ndc.z<=1&&Math.abs(ndc.x)<.98&&Math.abs(ndc.y)<.98&&!terrainOccludes(camera.position,p);
    return{id:leaf.id,world:p.toArray(),ndc:ndc.toArray(),screen:[(ndc.x*.5+.5)*viewportWidth,(.5-ndc.y*.5)*viewportHeight],visible,distance,projectedPixels:projectedLeafPixels(camera,distance,viewportHeight),focus:focusFor(p.x,p.z,camera),heightEstimateOnly:true,age:leaf.age,stranded:leaf.stranded};
  }
  return{
    material,
    suggestSpawn,locate,
    spawnVisible(camera,options){
      const suggestion=suggestSpawn(camera,options);if(!suggestion||!this.spawn(suggestion.x,suggestion.z))return null;
      return{...suggestion,id:serial};
    },
    spawn(x,z){
      if(!Number.isFinite(x+z)||terrainHeight(x,z)>-.04)return false;
      if(leaves.length>=12){scene.remove(leaves.shift().mesh);}
      const mesh=new THREE.Mesh(geometry,material);mesh.name='Floating coastal leaf · 22 cm';mesh.customDepthMaterial=depthMaterial;
      mesh.position.set(x,0,z);mesh.rotation.y=++serial*2.399963;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.renderOrder=3;mesh.layers.set(0);
      mesh.userData.physicalSize={length:LEAF_LENGTH,width:LEAF_WIDTH,unit:'m'};scene.add(mesh);
      leaves.push({id:serial,mesh,anchor:new THREE.Vector2(x,z),stranded:false,age:0,start:[x,z]});return true;
    },
    update(dt,time){
      lastTime=time;dt=Math.max(0,Math.min(dt,.1));
      for(const leaf of leaves){
        leaf.age+=dt;if(leaf.stranded)continue;
        const mesh=leaf.mesh,p={x:leaf.anchor.x,z:leaf.anchor.y};
        const initial=hydrodynamics.sampleFlow(p.x,p.z);
        const mean=hydrodynamics.sampleFlow(p.x+initial.x*dt*.5,p.z+initial.z*dt*.5);
        let vx=mean.x,vz=mean.z;
        let orbitalX=0,orbitalZ=0;
        const wind=uniforms.uWind.value,current=uniforms.uCurrentOffset.value;
        for(const w of transportWaves){
          const omega=w.omega,dx=w.dx,dz=w.dz;
          const phase=((p.x-current.x)*dx+(p.z-current.y)*dz)*w.k-omega*time+w.phase;
          const gain=w.kind==='swell'?(uniforms.uSwell?.value??1):wind*(uniforms.uWindSea?.value??1);
          const orbital=w.amplitude*gain*Math.cos(phase);
          const stokes=w.amplitude*w.amplitude*gain*gain*omega*w.k;
          vx+=stokes*dx;vz+=stokes*dz;
          orbitalX+=orbital*dx;orbitalZ+=orbital*dz;
        }
        let nx=p.x+vx*dt,nz=p.z+vz*dt;
        if(terrainHeight(nx,nz)>-.035){
          const gx=terrainHeight(p.x+.2,p.z)-terrainHeight(p.x-.2,p.z);
          const gz=terrainHeight(p.x,p.z+.2)-terrainHeight(p.x,p.z-.2);
          const mag=gx*gx+gz*gz;
          if(mag>1e-9){const inward=Math.max(0,(vx*gx+vz*gz)/mag);vx-=gx*inward;vz-=gz*inward;}
          nx=p.x+vx*dt;nz=p.z+vz*dt;
          if(terrainHeight(nx,nz)>-.02){leaf.stranded=true;continue;}
        }
        leaf.anchor.set(nx,nz);mesh.position.x=nx+orbitalX;mesh.position.z=nz+orbitalZ;
        if(Math.hypot(mean.x,mean.z)>.01){
          const desired=Math.atan2(-mean.z,mean.x);
          let d=desired-mesh.rotation.y;d=Math.atan2(Math.sin(d),Math.cos(d));mesh.rotation.y+=d*Math.min(1,dt*.65);
        }
      }
    },
    get state(){return leaves.map(l=>({id:l.id,position:l.mesh.position.toArray(),renderPositionEstimate:positionEstimate(l).toArray(),anchor:l.anchor.toArray(),stranded:l.stranded,age:l.age,start:l.start,lengthMetres:LEAF_LENGTH,widthMetres:LEAF_WIDTH,freeboardMetres:FREEBOARD}));},
    dispose(){for(const l of leaves)scene.remove(l.mesh);leaves.length=0;geometry.dispose();material.dispose();depthMaterial.dispose();texture.dispose();}
  };
}
