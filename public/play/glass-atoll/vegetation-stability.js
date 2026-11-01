// Diagnostic CPU evaluation of the existing analytic deformation. No geometry,
// wind parameters, texture filtering or temporal metadata is changed here.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=a=>{const l=Math.hypot(...a);return a.map(v=>v/Math.max(l,1e-12));};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const read=(g,name,i)=>Array.from(g.attributes[name].array.slice(i*g.attributes[name].itemSize,(i+1)*g.attributes[name].itemSize));
function rotate(p,axis,angle){const a=norm(axis),c=Math.cos(angle),s=Math.sin(angle),d=dot(a,p),v=cross(a,p);return p.map((x,i)=>x*c+v[i]*s+a[i]*d*(1-c));}
export function deformGroveVertexCPU(g,index,{time=0,wind=1.8,windDebug=1,direction=[.936,.352]}={}){
  let p=read(g,'position',index);const tree=read(g,'aTreeRoot',index),branch=read(g,'aBranchRoot',index),leaf=read(g,'aLeafRoot',index),branchAxis=read(g,'aBranchAxis',index),leafAxis=read(g,'aLeafAxis',index),motion=read(g,'aGroveMotion',index),phase=read(g,'aGrovePhase',index);
  const speed=clamp(wind*windDebug,0,5),force=speed*speed/25,flutterPower=speed/5,dir=norm([direction[0]+.00001,direction[1]+.00001]),windVector=[dir[0],0,dir[1]],bendAxis=[dir[1],0,-dir[0]];
  const gustTime=time-(tree[0]*dir[0]+tree[2]*dir[1])*.13,gust=.76+.19*Math.sin(gustTime*.52)+.11*Math.sin(gustTime*1.17+.8),response=.65*Math.sin(gustTime*.69+phase[0])+.35*Math.sin(gustTime*1.11+phase[0]*.73);
  const mainAngle=force*(.027*gust+.019*response)*motion[0],bt=gustTime-branch[3]*.09-motion[1]*.24,branchNoise=.65*Math.sin(bt*1.41+phase[1])+.35*Math.sin(bt*2.37+phase[1]*.63);
  const exposure=.84+.24*dot(norm(branchAxis.map(v=>v+.0001)),windVector),branchAngle=force*(.040*gust+.084*branchNoise)*motion[1]*motion[1]*exposure/Math.max(.45,phase[3]);
  const ft=gustTime+(leaf[0]*dir[0]+leaf[2]*dir[1])*.055,flutter=.70*Math.sin(ft*5.8+phase[2])+.30*Math.sin(ft*9.7+phase[2]*1.37),edge=4*motion[2]*(1-motion[2]);
  let leafAngle=flutterPower*.21*flutter*motion[2]*motion[2]*(.72+.28*motion[3]*edge);leafAngle*=(leaf[3]>=.0001?1:0)/Math.max(.65,phase[3]);
  const forward=norm(leafAxis.map(v=>v+.0001)),flapAxis=norm(add(add(cross(forward,[0,1,0]),forward.map(v=>v*.28)),[.0001,.0001,.0001]));
  p=add(leaf.slice(0,3),rotate(sub(p,leaf),flapAxis,leafAngle));
  p=add(branch.slice(0,3),rotate(sub(p,branch),bendAxis,branchAngle));
  return add(tree.slice(0,3),rotate(sub(p,tree),bendAxis,mainAngle));
}

export function profileVegetationMotion(THREE,grove,camera,{time=10,wind=grove.userData.windStrength.value,windDebug=1,height=900,maxSamples=1600,frameRates=[30,60,120]}={}){
  camera.updateMatrixWorld();grove.updateMatrixWorld(true);const rows=[],v=new THREE.Vector3(),view=new THREE.Vector3();
  const projectionScale=Math.abs(camera.projectionMatrix.elements[5])*height*.5,meshes=grove.children.filter(m=>/pinnae|coastal leaves/i.test(m.name)),perMesh=Math.ceil(maxSamples/Math.max(1,meshes.length));
  function project(mesh,index,t){v.fromArray(deformGroveVertexCPU(mesh.geometry,index,{time:t,wind,windDebug,direction:grove.userData.windDirection.value.toArray()})).applyMatrix4(mesh.matrixWorld);view.copy(v).applyMatrix4(camera.matrixWorldInverse);v.project(camera);return {x:v.x*height*camera.aspect*.5,y:v.y*height*.5,depth:-view.z,visible:v.z>-1&&v.z<1&&Math.abs(v.x)<1&&Math.abs(v.y)<1};}
  for(const mesh of meshes){const g=mesh.geometry,stride=Math.max(3,Math.floor(g.attributes.position.count/perMesh/3)*3);
    for(let i=1;i<g.attributes.position.count-1;i+=stride){const p=project(mesh,i,time);if(!p.visible)continue;const a=project(mesh,i-1,time),b=project(mesh,i+1,time),width=Math.hypot(a.x-b.x,a.y-b.y);if(width<1e-5)continue;
      for(const fps of frameRates){const old=project(mesh,i,time-1/fps),next=project(mesh,i,time+1/fps),velocity=Math.hypot(p.x-old.x,p.y-old.y),proxy=(.10+.20*wind+.03*wind*wind)/fps*projectionScale/Math.max(p.depth,.3);
        const accel=Math.hypot(next.x-2*p.x+old.x,next.y-2*p.y+old.y);rows.push({mesh:mesh.name,index:i,fps,depth:p.depth,width,actualPixels:velocity,proxyPixels:proxy,proxyHistoryFactor:Math.exp(-proxy*proxy*4),secondDifferencePixels:accel});}
    }
  }
  const percentile=(values,q)=>{values.sort((a,b)=>a-b);return values[Math.min(values.length-1,Math.floor(q*values.length))]??0;};
  const groups=frameRates.map(fps=>{const r=rows.filter(x=>x.fps===fps),val=key=>r.map(x=>x[key]);return {fps,samples:r.length,medianDepth:percentile(val('depth'),.5),medianLeafWidthPixels:percentile(val('width'),.5),medianActualPixelsPerFrame:percentile(val('actualPixels'),.5),p95ActualPixelsPerFrame:percentile(val('actualPixels'),.95),medianProxyPixelsPerFrame:percentile(val('proxyPixels'),.5),medianProxyHistoryFactor:percentile(val('proxyHistoryFactor'),.5),subpixelFraction:r.filter(x=>x.width<1).length/Math.max(1,r.length),maximumSecondDifferencePixels:Math.max(0,...val('secondDifferencePixels'))};});
  return {time,wind,windDebug,height,projectionScale,groups,rows,scope:'CPU analytic rest-geometry deformation and camera projection; no raster visibility/shading or temporal GPU outcome'};
}
