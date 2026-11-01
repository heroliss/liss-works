// Surface-light proxies are selected against island receivers, rather than
// merging distant events merely because their emitted intensities are large.
// Each proxy retains its sources' current reference candela and linear RGB.
export const FIREWORK_RECEIVER_LIGHT_COUNT=16;
const RECEIVER_POINTS=[[-22,2,0],[0,2,0],[22,2,0],[0,2,-13],[0,2,13],[29,2,7],[0,12,0],[25,1,0],[32,1,0]];
const STRIDE=RECEIVER_POINTS.length*3+12;
const RANGE=4096;
function projectedField(position,rgb,target,offset=0){
  let o=offset;for(let i=0;i<RECEIVER_POINTS.length;i++){
    const p=RECEIVER_POINTS[i],x=position[0]-p[0],y=position[1]-p[1],z=position[2]-p[2],q=x*x+y*y+z*z,d=Math.sqrt(q),cut=Math.max(0,1-(d/RANGE)**4),k=cut*cut/(Math.max(.01,q)*Math.max(d,1e-12));
    const v=[Math.max(0,y)*k,Math.max(0,x)*k,Math.max(0,-x)*k,Math.max(0,z)*k,Math.max(0,-z)*k];
    const count=i===1?5:1;for(let a=0;a<count;a++)for(let c=0;c<3;c++)target[o+a*3+c]=v[a]*rgb[c];o+=count*3;
  }
}
export function createReceiverLightClusterBuilder({maximum=FIREWORK_RECEIVER_LIGHT_COUNT}={}){
  if(!Number.isInteger(maximum)||maximum<1)throw new RangeError('Receiver light count must be a positive integer');
  let capacity=0,field=new Float64Array(),importance=new Float64Array();
  const rgb=[0,0,0],proxyField=new Float64Array(STRIDE);
  function build(records,events,{eventIds}={}){
    const allowed=eventIds===undefined?null:new Set(eventIds),rows=[];
    for(const p of records)if(p.kind==='star'&&p.intensity>0&&(!allowed||allowed.has(p.eventId)))rows.push(p);
    if(!rows.length)return [];
    if(rows.length>capacity){capacity=2**Math.ceil(Math.log2(rows.length));field=new Float64Array(capacity*STRIDE);importance=new Float64Array(capacity);}
    for(let index=0;index<rows.length;index++){
      const p=rows[index],offset=index*STRIDE;
      for(let c=0;c<3;c++)rgb[c]=p.emissionRGBReference?.[c]??p.colour[c]*p.intensity;
      projectedField(p.position,rgb,field,offset);
      let peak=0;for(let i=0;i<STRIDE;i+=3){const value=Math.max(field[offset+i],field[offset+i+1],field[offset+i+2]);if(value>peak)peak=value;}
      importance[index]=peak;
    }
    function node(indices){
      const summed=new Float64Array(STRIDE),position=[0,0,0],rgb=[0,0,0],splitCentre=[0,0,0];let I=0,w=0;
      for(const index of indices){const p=rows[index],P=p.intensity,W=importance[index],offset=index*STRIDE;I+=P;w+=W;for(let c=0;c<3;c++){position[c]+=p.position[c]*P;rgb[c]+=p.emissionRGBReference?.[c]??p.colour[c]*P;splitCentre[c]+=p.position[c]*W;}for(let k=0;k<STRIDE;k++)summed[k]+=field[offset+k];}
      for(let c=0;c<3;c++){position[c]/=I;splitCentre[c]=w>0?splitCentre[c]/w:position[c];}
      projectedField(position,rgb,proxyField);let error=0;for(let k=0;k<STRIDE;k++)error+=(proxyField[k]-summed[k])**2;
      return {indices,I,w,position,rgb,splitCentre,error,splittable:indices.length>1};
    }
    const bins=[node(Array.from({length:rows.length},(_,i)=>i))];
    while(bins.length<maximum){
      let worst=-1;for(let i=0;i<bins.length;i++)if(bins[i].splittable&&(worst<0||bins[i].error>bins[worst].error))worst=i;
      if(worst<0)break;
      const parent=bins[worst];let candidate=null,cost=Infinity;
      for(let axis=0;axis<3;axis++){
        const halves=[[],[]],cut=parent.splitCentre[axis];
        for(const index of parent.indices)halves[rows[index].position[axis]<cut?0:1].push(index);
        if(!halves[0].length||!halves[1].length)continue;
        const next=[node(halves[0]),node(halves[1])],error=next[0].error+next[1].error;
        if(error<cost){candidate=next;cost=error;}
      }
      if(!candidate){parent.splittable=false;continue;}
      bins.splice(worst,1,...candidate);
    }
    return Object.freeze(bins.map((b,slot)=>{
      let variance=0,maxExtent=0;const eventIds=new Set();
      for(const index of b.indices){const p=rows[index],q=p.position.reduce((s,v,c)=>s+(v-b.position[c])**2,0);variance+=p.intensity*(q+p.radius*p.radius/5);maxExtent=Math.max(maxExtent,Math.sqrt(q)+p.radius);eventIds.add(p.eventId);}
      const color=b.rgb.map(v=>v/b.I),rmsRadius=Math.sqrt(Math.max(0,variance/b.I));
      Object.freeze(b.position);Object.freeze(color);return Object.freeze({position:b.position,color,colour:color,referenceCandela:b.I,intensity:b.I,
        // A bound on a cloud is not a punctual attenuation radius. Native
        // Three lights clamp distance squared to .01; custom receivers match.
        radius:.1,rmsRadius,maxExtent,eventId:'receiver/'+slot,sourceEventIds:Object.freeze([...eventIds]),kind:'fireworks receiver cluster',pathFlags:{diffuse:true,smoke:false,specular:false},illuminationModel:'receiver-error spatial partition; conserved instantaneous source I/RGB and centroid; punctual approximation'});
    }));
  }
  return {build};
}
export function buildReceiverLightClusters(records,events,options){return createReceiverLightClusterBuilder(options).build(records,events,options);}




