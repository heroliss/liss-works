// Two stable proxy lights for the per-pixel environment paths (air scattering,
// cloud glow, foam). Those paths march a ray per pixel, so they cannot afford
// one light per firework. The previous reduction merged the nearest pair of
// events each frame; when a shell appeared, expired or the nearest pair changed,
// a proxy teleported by up to ~100 m and the glow moved with it.
//
// Here every event is shared between two anchors by a smooth weight of its
// distance to each, and the anchors glide toward their own centroids with a
// short time constant. Total candela and RGB are conserved every frame; only
// the positions are low-pass filtered. Not a resolved area source.
const squared=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;

export function createFireworkEnvironmentProxies({timeConstantSeconds=.35}={}){
  if(!(timeConstantSeconds>0))throw new RangeError('Proxy time constant must be positive');
  let anchors=null,shown=[null,null];
  function update(lights=[],dt=0){
    const rows=lights.filter(l=>l.referenceCandela>0);
    if(!rows.length){anchors=null;shown=[null,null];return [];}
    if(!anchors){
      const first=rows.reduce((a,b)=>b.referenceCandela>a.referenceCandela?b:a);let far=first,reach=-1;
      for(const r of rows){const d=squared(r.position,first.position);if(d>reach){reach=d;far=r;}}
      anchors=[[...first.position],[...far.position]];
    }
    const sums=[0,1].map(()=>({I:0,position:[0,0,0],rgb:[0,0,0],ids:[],spread:0})),weights=new Float64Array(rows.length);
    for(let k=0;k<rows.length;k++){
      const r=rows[k],d0=squared(r.position,anchors[0])+1,d1=squared(r.position,anchors[1])+1,w0=d1*d1/(d0*d0+d1*d1);weights[k]=w0;
      for(let j=0;j<2;j++){const w=(j?1-w0:w0)*r.referenceCandela,s=sums[j];if(!(w>0))continue;s.I+=w;for(let c=0;c<3;c++){s.position[c]+=r.position[c]*w;s.rgb[c]+=r.color[c]*w;}s.ids.push(...(r.mergedEventIds??[r.eventId]));}
    }
    for(const s of sums)if(s.I>0)for(let c=0;c<3;c++){s.position[c]/=s.I;s.rgb[c]/=s.I;}
    for(let k=0;k<rows.length;k++){const r=rows[k],extent=r.maxExtent??r.radius??0;for(let j=0;j<2;j++){const w=(j?1-weights[k]:weights[k])*r.referenceCandela,s=sums[j];if(w>0)s.spread+=w*(squared(r.position,s.position)+extent*extent);}}
    // Anchors follow their own centroid. If both sit on the same spot while the
    // show is spread out, the second one glides to the farthest event instead.
    const blend=dt>0?1-Math.exp(-dt/timeConstantSeconds):0;
    if(blend>0){
      let far=rows[0],reach=-1;for(const r of rows){const d=squared(r.position,anchors[0]);if(d>reach){reach=d;far=r;}}
      const collapsed=squared(anchors[0],anchors[1])<.25*reach;
      for(let j=0;j<2;j++){const target=j===1&&collapsed?far.position:sums[j].I>0?sums[j].position:anchors[j];for(let c=0;c<3;c++)anchors[j][c]+=(target[c]-anchors[j][c])*blend;}
    }
    // A proxy centroid still hops when a bright shell lights up next to a dim one. Its
    // published position follows the centroid over a few frames; a proxy that was dark snaps.
    const follow=dt>0?1-Math.exp(-dt/(.4*timeConstantSeconds)):0;
    for(let j=0;j<2;j++){const s=sums[j];if(!(s.I>1e-6)){shown[j]=null;continue;}if(!shown[j])shown[j]=[...s.position];else for(let c=0;c<3;c++)shown[j][c]+=(s.position[c]-shown[j][c])*follow;s.position=[...shown[j]];}
    return sums.filter(s=>s.I>1e-6).map((s,slot)=>{
      // These proxies only feed air, cloud and foam. A floor of 20 m keeps a view ray that
      // passes through a young, still compact burst from seeing a point-source spike.
      const radius=Math.max(20,Math.sqrt(s.spread/s.I)),ids=[...new Set(s.ids)];
      return {position:s.position,color:s.rgb,colour:s.rgb,referenceCandela:s.I,intensity:s.I,radius,rmsRadius:radius,maxExtent:radius,
        kind:'fireworks diffuse cluster',eventId:'environment/'+slot,mergedEventIds:ids,pathFlags:{diffuse:true,smoke:true,specular:false},
        illuminationModel:'two smooth-weight anchor proxies; conserved instantaneous I/RGB; low-pass positions'};
    });
  }
  return {update,reset(){anchors=null;shown=[null,null];},get anchors(){return anchors?anchors.map(a=>[...a]):null;}};
}
