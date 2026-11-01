// A fixed world-space caster footprint avoids camera-following shadow shimmer.
export const shadowLevels={
  soft:{size:2048,hz:60,waterRadius:1},
  recommended:{size:4096,hz:60,waterRadius:1},
  fine:{size:6144,hz:60,waterRadius:1},
  ultra:{size:8192,hz:60,waterRadius:1}
};
export function createShadowQuality(THREE,renderer,light,grove){
  const bounds=new THREE.Box3().setFromObject(grove).expandByScalar(1.4);
  let level='recommended',lastDirection='',footprint=[100,85],customHz=null;
  function fit(){
    light.updateMatrixWorld();light.target.updateMatrixWorld();light.shadow.updateMatrices(light);
    const view=light.shadow.camera.matrixWorldInverse,box=new THREE.Box3(),p=new THREE.Vector3();
    for(let i=0;i<8;i++)box.expandByPoint(p.set(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z).applyMatrix4(view));
    // Same rays cover the full land/water receiver shadow; reserve a ground
    // footprint for shells/coral too, plus animated canopy bounds above.
    for(const x of [-39,43])for(const z of [-27,29])box.expandByPoint(p.set(x,0,z).applyMatrix4(view));
    const camera=light.shadow.camera;
    const texel=Math.max(box.max.x-box.min.x,box.max.y-box.min.y)/light.shadow.mapSize.x;
    camera.left=Math.floor((box.min.x-1)/texel)*texel;camera.right=Math.ceil((box.max.x+1)/texel)*texel;
    camera.bottom=Math.floor((box.min.y-1)/texel)*texel;camera.top=Math.ceil((box.max.y+1)/texel)*texel;
    camera.near=.1;camera.far=Math.max(260,-box.min.z+100);camera.updateProjectionMatrix();
    footprint=[camera.right-camera.left,camera.top-camera.bottom];light.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;
  }
  function setQuality(value){
    customHz=null;
    level=shadowLevels[value]?value:'recommended';const settings=shadowLevels[level];
    const size=Math.min(settings.size,renderer.capabilities.maxTextureSize);
    if(light.shadow.mapSize.x!==size){light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapPass?.dispose();light.shadow.mapPass=null;light.shadow.mapSize.set(size,size);}
    // PCFSoft on standard materials ignores radius; our underwater PCF uses it.
    light.shadow.radius=settings.waterRadius;fit();
  }
  setQuality(level);
  return {setQuality,setSampling({size,hz}={}){const match=Object.keys(shadowLevels).find(k=>shadowLevels[k].size===size);setQuality(match||'recommended');customHz=Number.isFinite(hz)?Math.max(1,hz):null;},update(){const key=light.position.toArray().map(x=>x.toFixed(5)).join();if(key!==lastDirection){lastDirection=key;fit();}},get hz(){return customHz??shadowLevels[level].hz;},diagnostics(){return {level,mapSize:light.shadow.mapSize.toArray(),footprintMetres:footprint,texelMetres:footprint.map(x=>x/light.shadow.mapSize.x),maxHz:customHz??shadowLevels[level].hz,filter:'PCFSoft on land; footprint-aware 9-tap PCF in water',stability:'caster bounds in light space, no camera-following atlas',limits:['single directional atlas, not cascades or PCSS','no blocker-distance solar penumbra solver']};}};
}
