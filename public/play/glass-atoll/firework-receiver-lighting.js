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
// Large shows carry thousands of burning stars. The partition below is a
// sixteen-proxy approximation, so feeding it every star only costs time. Above
// the threshold, stars are first summed per firework into the eight octants
// around that firework's intensity centroid, split into an inner and an outer
// shell. Each bin conserves its stars' total I, RGB and centroid and carries
// their spread as its radius, so the proxy totals are unchanged.
const BIN_THRESHOLD=192;
function binRows(rows){
  const events=new Map();
  for(const p of rows){let e=events.get(p.eventId);if(!e){e={I:0,c:[0,0,0],rows:[]};events.set(p.eventId,e);}e.I+=p.intensity;for(let k=0;k<3;k++)e.c[k]+=p.position[k]*p.intensity;e.rows.push(p);}
  const out=[];
  for(const [eventId,e] of events){
    if(e.rows.length<=16){for(const p of e.rows)out.push(p);continue;}
    const c=e.c.map(v=>v/e.I);let spread=0;
    for(const p of e.rows){const x=p.position[0]-c[0],y=p.position[1]-c[1],z=p.position[2]-c[2];spread+=p.intensity*(x*x+y*y+z*z);}
    const split=spread/e.I,bins=new Array(16);
    for(const p of e.rows){
      const x=p.position[0]-c[0],y=p.position[1]-c[1],z=p.position[2]-c[2],index=(x<0?1:0)|(y<0?2:0)|(z<0?4:0)|(x*x+y*y+z*z>split?8:0);
      let b=bins[index];if(!b)b=bins[index]={I:0,position:[0,0,0],rgb:[0,0,0],rows:[]};
      b.I+=p.intensity;for(let k=0;k<3;k++){b.position[k]+=p.position[k]*p.intensity;b.rgb[k]+=p.emissionRGBReference?.[k]??p.colour[k]*p.intensity;}b.rows.push(p);
    }
    for(const b of bins){
      if(!b)continue;const position=b.position.map(v=>v/b.I);let radius=0;
      for(const p of b.rows)radius=Math.max(radius,Math.hypot(p.position[0]-position[0],p.position[1]-position[1],p.position[2]-position[2])+p.radius);
      out.push({kind:'star',eventId,position,intensity:b.I,emissionRGBReference:b.rgb,colour:b.rgb.map(v=>v/b.I),radius});
    }
  }
  return out;
}
export function createReceiverLightClusterBuilder({maximum=FIREWORK_RECEIVER_LIGHT_COUNT}={}){
  if(!Number.isInteger(maximum)||maximum<1)throw new RangeError('Receiver light count must be a positive integer');
  let capacity=0,field=new Float64Array(),importance=new Float64Array();
  const rgb=[0,0,0],proxyField=new Float64Array(STRIDE);
  function build(records,events,{eventIds}={}){
    const allowed=eventIds===undefined?null:new Set(eventIds);let rows=[];
    for(const p of records)if(p.kind==='star'&&p.intensity>0&&(!allowed||allowed.has(p.eventId)))rows.push(p);
    if(!rows.length)return [];
    if(rows.length>BIN_THRESHOLD)rows=binRows(rows);
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

// Receiver lighting is split by distance to the cay. Stars close to it keep up to
// four exact point proxies, because their inverse-square falloff changes within a
// few metres. Everything else feeds the probe field (firework-light-field.js).
// Between 30 m and 55 m from the cay's box a star is shared by a smooth weight,
// so a falling star hands over without a step. Totals are conserved.
export const FIREWORK_NEAR_LIGHT_COUNT=4;
const CAY_BOX=Object.freeze({min:[-34,0,-24],max:[46,20,24]});
function nearWeight(position){
  let d2=0;for(let c=0;c<3;c++){const d=Math.max(CAY_BOX.min[c]-position[c],0,position[c]-CAY_BOX.max[c]);d2+=d*d;}
  const t=Math.min(1,Math.max(0,(Math.sqrt(d2)-30)/25));return 1-t*t*(3-2*t);
}
const scaledRow=(p,w)=>({kind:'star',eventId:p.eventId,position:p.position,radius:p.radius,colour:p.colour,intensity:p.intensity*w,...(p.emissionRGBReference?{emissionRGBReference:p.emissionRGBReference.map(v=>v*w)}:{})});
export function createReceiverLighting(){
  const nearBuilder=createReceiverLightClusterBuilder({maximum:FIREWORK_NEAR_LIGHT_COUNT});
  function build(records){
    let rows=[];for(const p of records)if(p.kind==='star'&&p.intensity>0)rows.push(p);
    if(rows.length>BIN_THRESHOLD)rows=binRows(rows);
    const near=[],far=[],events=new Map();let I=0;const centre=[0,0,0],rgb=[0,0,0];
    for(const p of rows){
      const w=nearWeight(p.position);
      if(w>0)near.push(w>=1?p:scaledRow(p,w));
      if(w>=1)continue;
      const q=w<=0?p:scaledRow(p,1-w);far.push(q);I+=q.intensity;
      let e=events.get(q.eventId);if(!e){e={I:0,position:[0,0,0],rows:[]};events.set(q.eventId,e);}e.I+=q.intensity;e.rows.push(q);
      for(let c=0;c<3;c++){centre[c]+=q.position[c]*q.intensity;rgb[c]+=q.emissionRGBReference?.[c]??q.colour[c]*q.intensity;e.position[c]+=q.position[c]*q.intensity;}
    }
    let farAggregate=null,dominant=null;
    if(I>1e-6){
      const position=centre.map(v=>v/I),color=rgb.map(v=>v/I);let spread=0;
      for(const q of far)spread+=q.intensity*((q.position[0]-position[0])**2+(q.position[1]-position[1])**2+(q.position[2]-position[2])**2+(q.radius??0)**2);
      const radius=Math.max(2,Math.sqrt(spread/I));
      // One proxy for consumers that only need the far light's total and rough origin
      // (bounce-light solve, smoke, storage-exposure bound). Surfaces use the field.
      farAggregate={position,color,colour:color,referenceCandela:I,intensity:I,radius,rmsRadius:radius,maxExtent:radius,eventId:'receiver/far',kind:'fireworks far aggregate',pathFlags:{diffuse:false,smoke:true,specular:false},illuminationModel:'intensity centroid of all far stars; surfaces are lit by the probe field instead'};
      let best=null;for(const e of events.values())if(!best||e.I>best.I)best=e;
      const p=best.position.map(v=>v/best.I);let s=0;for(const q of best.rows)s+=q.intensity*((q.position[0]-p[0])**2+(q.position[1]-p[1])**2+(q.position[2]-p[2])**2+(q.radius??0)**2);
      dominant={position:p,radius:Math.max(1,Math.sqrt(s/best.I)),share:best.I/I,candela:best.I};
    }
    return {near:near.length?nearBuilder.build(near):[],far,farAggregate,dominant};
  }
  return {build};
}
