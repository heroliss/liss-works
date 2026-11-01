// Private rest-geometry helpers. No random numbers, animation or material code.
// A transported rachis frame is only a plane-visibility diagnostic here;
// existing leaflet axes/centre lines and the authored roll angles stay fixed.
const finite=v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);

export function createFrondTransport(THREE,curve,lateral,segments=23){
  const tangents=[],normals=[],q=new THREE.Quaternion();
  for(let i=0;i<=segments;i++){
    const t=i/segments,T=curve(Math.min(1,t+.006)).sub(curve(Math.max(0,t-.006))).normalize();
    if(i===0){
      const N=new THREE.Vector3().crossVectors(lateral,T);
      if(!finite(N)||N.lengthSq()<1e-12)throw new Error('Invalid initial rachis frame');
      normals.push(N.normalize());
    }else{
      q.setFromUnitVectors(tangents[i-1],T);
      const N=normals[i-1].clone().applyQuaternion(q);N.addScaledVector(T,-N.dot(T)).normalize();
      if(N.dot(normals[i-1])<0)N.negate();normals.push(N);
    }
    tangents.push(T);
  }
  return {normalAt(t,T,roll=0){
    const a=Math.max(0,Math.min(segments,t*segments)),i=Math.min(segments-1,Math.floor(a));
    const N=normals[i].clone().lerp(normals[i+1],a-i);
    N.addScaledVector(T,-N.dot(T));
    if(!finite(N)||N.lengthSq()<1e-12)return null;
    return N.normalize().applyAxisAngle(T,roll);
  }};
}

export function sectionRotation(THREE,normal,direction,roll,oldSide,oldUp){
  if(!normal||!finite(normal))return {valid:false,reason:'invalid transported normal'};
  const N=normal.clone().addScaledVector(direction,-normal.dot(direction));
  if(!finite(N)||N.lengthSq()<1e-10)return {valid:false,reason:'normal parallel to leaflet axis'};
  const side=new THREE.Vector3().crossVectors(direction,N.normalize()).normalize().applyAxisAngle(direction,roll);
  const up=new THREE.Vector3().crossVectors(side,direction).normalize();
  // Respect the old section's handedness, not its world-Y sign. No normal flip
  // is selected from a camera or from the sign of the transported normal.y.
  if(new THREE.Vector3().crossVectors(oldSide,direction).dot(oldUp)<0)up.negate();
  const r=new Float64Array(9),a=side.toArray(),b=up.toArray(),c=direction.toArray(),x=oldSide.toArray(),y=oldUp.toArray();
  for(let row=0;row<3;row++)for(let col=0;col<3;col++)r[row*3+col]=a[row]*x[col]+b[row]*y[col]+c[row]*c[col];
  let error=0;
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){let d=0;for(let k=0;k<3;k++)d+=r[k*3+i]*r[k*3+j];error=Math.max(error,Math.abs(d-(i===j?1:0)));}
  const determinant=r[0]*(r[4]*r[8]-r[5]*r[7])-r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6]);
  if(!Array.from(r).every(Number.isFinite)||error>1e-9||Math.abs(determinant-1)>1e-9)return {valid:false,reason:'non-orthogonal section rotation',error,determinant};
  return {valid:true,rotation:r,error,determinant};
}

// Records: start vertex, vertex count, row-major rotation[9]. Rotate only the
// two edge vertices around the uploaded legacy middle vertex of each row.
export function rotatePinnaEdges(legacy,records){
  const candidate=legacy.slice();
  for(let j=0;j<records.length;j+=11){
    const start=records[j],rows=records[j+1]/3;
    for(let row=1;row<rows-1;row++){
      const middle=(start+row*3+1)*3,mx=legacy[middle],my=legacy[middle+1],mz=legacy[middle+2];
      for(const edge of [-1,1]){
        const k=middle+edge*3,x=legacy[k]-mx,y=legacy[k+1]-my,z=legacy[k+2]-mz;
        candidate[k]=mx+records[j+2]*x+records[j+3]*y+records[j+4]*z;
        candidate[k+1]=my+records[j+5]*x+records[j+6]*y+records[j+7]*z;
        candidate[k+2]=mz+records[j+8]*x+records[j+9]*y+records[j+10]*z;
      }
    }
  }
  return candidate;
}

export function fallbackDegeneratePinnae(candidate,legacy,indices,records){
  const reverted=new Set();let invalidTriangles=0;
  function recordAt(vertex){let lo=0,hi=records.length/11-1;while(lo<=hi){const m=(lo+hi)>>1,s=records[m*11],n=records[m*11+1];if(vertex<s)hi=m-1;else if(vertex>=s+n)lo=m+1;else return m;}return -1;}
  for(let i=0;i<indices.length;i+=3){
    const ia=indices[i]*3,ib=indices[i+1]*3,ic=indices[i+2]*3;
    const ax=candidate[ib]-candidate[ia],ay=candidate[ib+1]-candidate[ia+1],az=candidate[ib+2]-candidate[ia+2];
    const bx=candidate[ic]-candidate[ia],by=candidate[ic+1]-candidate[ia+1],bz=candidate[ic+2]-candidate[ia+2];
    const cx=ay*bz-az*by,cy=az*bx-ax*bz,cz=ax*by-ay*bx,cross2=cx*cx+cy*cy+cz*cz;
    const edgeProduct=(ax*ax+ay*ay+az*az)*(bx*bx+by*by+bz*bz);
    if(!(cross2>Math.max(1e-18,edgeProduct*1e-12))){
      const record=recordAt(indices[i]);
      if(record<0)throw new Error('Invalid unchanged pinna geometry');
      if(reverted.has(record))throw new Error('Legacy fallback unexpectedly degenerate');
      const start=records[record*11]*3,end=start+records[record*11+1]*3;candidate.set(legacy.subarray(start,end),start);reverted.add(record);invalidTriangles++;
    }
  }
  return {degenerateFallbackLeaves:reverted.size,firstInvalidTriangles:invalidTriangles};
}

export function completePalmGeometryFrame(geometry,removedDegenerateTriangles){
  geometry.computeVertexNormals();const normals=geometry.attributes.normal.array;let repairedUnusedNormals=0;
  for(let j=0;j<normals.length;j+=3){const l2=normals[j]*normals[j]+normals[j+1]*normals[j+1]+normals[j+2]*normals[j+2];if(!(l2>1e-12)){normals[j]=0;normals[j+1]=1;normals[j+2]=0;repairedUnusedNormals++;}}
  geometry.computeTangents();const tangent=geometry.attributes.tangent.array,leafAxes=geometry.attributes.aLeafAxis.array;let repairedUnusedTangents=0;
  for(let j=0,k=0;j<tangent.length;j+=4,k+=3){
    const nx=normals[k],ny=normals[k+1],nz=normals[k+2];let tx=tangent[j],ty=tangent[j+1],tz=tangent[j+2],dot=tx*nx+ty*ny+tz*nz;
    tx-=dot*nx;ty-=dot*ny;tz-=dot*nz;let l2=tx*tx+ty*ty+tz*tz;
    if(!(l2>1e-12)||!Number.isFinite(l2)){
      tx=leafAxes[k];ty=leafAxes[k+1];tz=leafAxes[k+2];dot=tx*nx+ty*ny+tz*nz;tx-=dot*nx;ty-=dot*ny;tz-=dot*nz;l2=tx*tx+ty*ty+tz*tz;
      if(!(l2>1e-12)){if(Math.abs(ny)<.9){tx=-nz;ty=0;tz=nx;}else{tx=0;ty=nz;tz=-ny;}l2=tx*tx+ty*ty+tz*tz;}
      repairedUnusedTangents++;
    }
    const inv=1/Math.sqrt(l2);tangent[j]=tx*inv;tangent[j+1]=ty*inv;tangent[j+2]=tz*inv;tangent[j+3]=tangent[j+3]<0?-1:1;
  }
  geometry.attributes.normal.needsUpdate=true;geometry.attributes.tangent.needsUpdate=true;geometry.computeBoundingSphere();geometry.boundingSphere.radius+=2.2;geometry.computeBoundingBox();
  geometry.userData.frameValidation={removedDegenerateTriangles,repairedUnusedNormals,repairedUnusedTangents};
}
