// QA-only six-source adapter for water and aerial scattering. The opaque island
// and smoke keep the full twenty-source localLights object.
import {localLightGLSL,LOCAL_LIGHT_COUNT,FIREWORK_LIGHT_RANGE} from './local-lights.js';
import {RAW_PER_CANDELA} from './scene-radiometry.js';

export const ENVIRONMENT_LIGHT_COUNT=6;
if(LOCAL_LIGHT_COUNT!==20)throw new Error('Environment6 requires the fixed 4+16 receiver layout');
const slots=localLightGLSL.split('[20]').length-1,loops=localLightGLSL.split('i<20').length-1;
if(slots!==4||loops!==2)throw new Error('Shared local GLSL changed; review six-source derivation');
export const environmentLightGLSL=localLightGLSL.replaceAll('[20]','[6]').replaceAll('i<20','i<6');

export function createEnvironmentLocalLights(THREE,full){
  if(!full||full.records?.length!==20||!full.uniforms||full.glsl!==localLightGLSL)throw new TypeError('Environment6 requires the current full local-light factory');
  const ownVectors=name=>({value:Array.from({length:6},()=>new THREE.Vector4())});
  const uniforms={...full.uniforms,uLocalPosition:ownVectors('uLocalPosition'),uLocalColour:ownVectors('uLocalColour'),uLocalDirection:ownVectors('uLocalDirection'),uLocalCone:ownVectors('uLocalCone')};
  // The first four records are the very same ground lamps and flashlight.
  // Two environment proxies contain the existing complete cloud clusters.
  const records=[...full.records.slice(0,4),...Array.from({length:2},()=>({position:new THREE.Vector3(),rawRGB:[0,0,0],radius:2,range:FIREWORK_LIGHT_RANGE,candela:0,sourceEventIds:[]}))];
  let latestClusters=[],rawPerCandela=RAW_PER_CANDELA,storageEV=0;
  function copyFixed(){
    for(const name of ['uLocalPosition','uLocalColour','uLocalDirection','uLocalCone'])for(let i=0;i<4;i++)uniforms[name].value[i].copy(full.uniforms[name].value[i]);
  }
  function uploadFireworks(){
    const scale=2**storageEV;
    for(let j=0;j<2;j++){
      const i=j+4,c=latestClusters[j],r=records[i];
      if(c){
        const intensity=c.referenceCandela??c.intensity??0,colour=c.linearColor??c.color??c.colour;
        if(!Number.isFinite(intensity)||intensity<0||!Array.isArray(colour)||colour.length!==3||!colour.every(x=>Number.isFinite(x)&&x>=0)||!Array.isArray(c.position)||c.position.length!==3||!c.position.every(Number.isFinite))throw new TypeError('Cloud cluster requires nonnegative finite I/RGB and position');
        r.position.fromArray(c.position);r.candela=intensity;r.rawRGB=colour.map(x=>x*intensity*rawPerCandela);r.radius=Math.max(.1,c.radius??2);r.range=Math.max(40,c.range??FIREWORK_LIGHT_RANGE);r.sourceEventIds=[...(c.mergedEventIds??[c.eventId])];
      }else{r.position.set(0,0,0);r.candela=0;r.rawRGB=[0,0,0];r.radius=2;r.range=FIREWORK_LIGHT_RANGE;r.sourceEventIds=[];}
      uniforms.uLocalPosition.value[i].set(r.position.x,r.position.y,r.position.z,r.radius);
      uniforms.uLocalColour.value[i].set(...r.rawRGB.map(x=>x*scale),r.candela);
      uniforms.uLocalDirection.value[i].set(0,0,0,0);
      uniforms.uLocalCone.value[i].set(-1,1,r.range,1);
    }
  }
  function update({clusters=[],frame={}}={}){
    if(!Array.isArray(clusters)||clusters.length>2)throw new RangeError('Environment6 needs the existing at-most-two cloud clusters');
    latestClusters=clusters;rawPerCandela=frame.rawPerCandela??RAW_PER_CANDELA;storageEV=frame.storageEV??Math.log2(frame.sceneScale??1);copyFixed();uploadFireworks();
  }
  function setSceneExposure(value){storageEV=value;copyFixed();uploadFireworks();}
  return {uniforms,glsl:environmentLightGLSL,records,update,setSceneExposure,get state(){return {sourceCount:6,fireworks:records.slice(4).map(r=>({position:r.position.toArray(),rawRGB:[...r.rawRGB],candela:r.candela,radius:r.radius,sourceEventIds:[...r.sourceEventIds]}))};}};
}
