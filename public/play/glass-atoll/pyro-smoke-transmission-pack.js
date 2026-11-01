// Experimental source-transmission inputs, independent of renderer/exposure.
// All physical positions enter as original binary64 world coordinates.
export const SMOKE_TRANSMISSION_LIMITS=Object.freeze({defaultSources:64,defaultPackets:48,defaultPairs:3072,maxSources:18000,maxPackets:4096,maxPairs:1048576,maxRequestPairs:12000000,tilePackets:64});
const finite=(v,n)=>{if(typeof v!=='number'||!Number.isFinite(v))throw new RangeError(n+' must be finite');return v;},f32=(v,n)=>{const a=Math.fround(finite(v,n));if(!Number.isFinite(a))throw new RangeError(n+' exceeds finite Float32');return a;},vec=(v,n)=>{if(!v||v.length!==3)throw new TypeError(n+' requires3 coordinates');return Array.from(v,(x,i)=>finite(x,n+'['+i+']'));};
export const smokeTransmissionCameraKey=eye=>vec(eye,'eye').map(v=>Object.is(v,-0)?'-0':String(v)).join(',');
export function planSmokeTransmission(count,packets,{maxSources=64,maxPackets=48,maxPairs=3072,maxRequestPairs=null}={}){
  for(const[v,n,max]of [[maxSources,'maxSources',18000],[maxPackets,'maxPackets',4096],[maxPairs,'maxPairs',1048576]])if(!Number.isSafeInteger(v)||v<1||v>max)throw new RangeError(n+' exceeds explicit constructor limits');
  if(maxRequestPairs!==null&&(!Number.isSafeInteger(maxRequestPairs)||maxRequestPairs<1||maxRequestPairs>12000000))throw new RangeError('maxRequestPairs exceeds explicit complete-request limit');
  const requestPairs=maxRequestPairs??maxPairs;
  if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(packets)||packets<0)throw new RangeError('Active counts must be nonnegative safe integers');
  const pairs=count*packets,tileCount=Math.ceil(packets/64);let reason=null;if(count>maxSources)reason='source-capacity';else if(packets>maxPackets)reason='packet-capacity';else if(pairs>requestPairs)reason='pair-work-capacity';return{supported:!reason,reason:reason??'ready',count,packets,pairs,maxPairs:requestPairs,tileCount,maxTiles:Math.ceil(maxPackets/64),maxSources,maxPackets,tilePackets:64};
}
function shape(c){if(!c||c.length!==9)throw new TypeError('Full-SPD covariance requires9 components');const a=Array.from(c,(x,i)=>finite(x,'covariance['+i+']')),scale=Math.max(a[0],a[4],a[8]);for(const[i,j]of [[1,3],[2,6],[5,7]])if(Math.abs(a[i]-a[j])>64*Number.EPSILON*scale)throw new RangeError('Covariance must be symmetric');const l0=Math.sqrt(a[0]),l1=a[3]/l0,l2=Math.sqrt(a[4]-l1*l1),l3=a[6]/l0,l4=(a[7]-l3*l1)/l2,l5=Math.sqrt(a[8]-l3*l3-l4*l4),L=[l0,l1,l2,l3,l4,l5];if(!L.every(Number.isFinite)||[l0,l2,l5].some(x=>!(x>0)))throw new RangeError('Covariance must be SPD');return L;}
export function packSmokeTransmissionInputs({snapshot,count,endpoints64,origins64=null,active,eye,sourceVersion},{maxSources=64,maxPackets=48,maxPairs=3072,maxRequestPairs=null,packetData=null,sourceData=null}={}){
  if(!snapshot||!Array.isArray(snapshot.packets))throw new TypeError('Committed density snapshot required');const plan=planSmokeTransmission(count,snapshot.packets.length,{maxSources,maxPackets,maxPairs,maxRequestPairs});if(!plan.supported)return{...plan,effective:false};
  if(!Number.isSafeInteger(sourceVersion)||sourceVersion<0)throw new RangeError('Per-fill sourceVersion required');if(!(endpoints64 instanceof Float64Array)||endpoints64.length<count*3||(origins64!==null&&(!(origins64 instanceof Float64Array)||origins64.length<count*3))||!(active instanceof Uint8Array)||active.length<count)throw new TypeError('Original-double endpoints64/origins64 and all-row active mask required');
  const E=vec(eye,'eye'),pout=packetData??new Float32Array(maxPackets*16),sout=sourceData??new Float32Array(maxSources*12);if(!(pout instanceof Float32Array)||pout.length<maxPackets*16||!(sout instanceof Float32Array)||sout.length<maxSources*12)throw new RangeError('Fixed input buffers too small');pout.fill(0);sout.fill(0);
  const profiles=new Map((snapshot.profiles??[]).map(p=>[p.id,p])),diagnostics={maximumMeanQuantizationMetres:0,maximumEndpointQuantizationMetres:0,maximumOriginQuantizationMetres:0,maximumDirectionQuantization:0,maximumLengthQuantizationMetres:0,maximumCholeskyRelativeQuantization:0,maximumNormalizationRelativeQuantization:0,activeRays:0,zeroLengthRays:0,inactiveRows:0,maximumWhitenedCoordinateBound:0,maximumWhitenedDirectionBound:0,originalDoubleReflectionOrigins:true};
  for(let i=0;i<snapshot.packets.length;i++){const p=snapshot.packets[i],mean=vec(p.mean,'packet.mean'),L=shape(p.covariance),ext=vec(profiles.get(p.profileId)?.extinctionPerMassRGB,'extinction');if(ext.some(x=>x<0)||!(finite(p.mass,'mass')>0))throw new RangeError('Positive mass and nonnegative extinction required');const norm=p.mass/((2*Math.PI)**1.5*L[0]*L[2]*L[5]),o=i*16,values=[mean[0]-E[0],mean[1]-E[1],mean[2]-E[2],norm,...L.slice(0,4),L[4],L[5],ext[0],ext[1],ext[2],0,0,0];for(let j=0;j<16;j++)pout[o+j]=f32(values[j],'packet field');if([pout[o+4],pout[o+6],pout[o+9]].some(x=>!(x>0))||(ext.some(x=>x>0)&&!(pout[o+3]>0)))throw new RangeError('Packet factor/normalization underflows Float32');for(let j=0;j<3;j++)diagnostics.maximumMeanQuantizationMetres=Math.max(diagnostics.maximumMeanQuantizationMetres,Math.abs(pout[o+j]-values[j]));for(let j=0;j<6;j++)if(L[j]!==0)diagnostics.maximumCholeskyRelativeQuantization=Math.max(diagnostics.maximumCholeskyRelativeQuantization,Math.abs(pout[o+4+j]-L[j])/Math.abs(L[j]));diagnostics.maximumNormalizationRelativeQuantization=Math.max(diagnostics.maximumNormalizationRelativeQuantization,Math.abs(pout[o+3]-norm)/norm);}
  let min0=Infinity,min1=Infinity,min2=Infinity,max0=-Infinity,max1=-Infinity,max2=-Infinity;
  for(let i=0;i<count;i++){
    const o=i*12,w=i*3;
    if(active[i]===0){diagnostics.inactiveRows++;continue;}
    if(active[i]!==1)throw new RangeError('active mask must contain0 or1');
    const ox=finite(origins64?origins64[w]:E[0],'source coordinates'),oy=finite(origins64?origins64[w+1]:E[1],'source coordinates'),oz=finite(origins64?origins64[w+2]:E[2],'source coordinates');
    const ex=finite(endpoints64[w],'source coordinates'),ey=finite(endpoints64[w+1],'source coordinates'),ez=finite(endpoints64[w+2],'source coordinates');
    const dx=ex-ox,dy=ey-oy,dz=ez-oz,length=Math.hypot(dx,dy,dz);
    if(length===0){diagnostics.zeroLengthRays++;continue;}
    // Keep both original binary64 normalizations and Float32 write order.
    const u0=dx/length,u1=dy/length,u2=dz/length,size=Math.hypot(u0,u1,u2),d0=u0/size,d1=u1/size,d2=u2/size;
    const r0=ox-E[0],r1=oy-E[1],r2=oz-E[2],e0=ex-E[0],e1=ey-E[1],e2=ez-E[2];
    sout[o]=f32(r0,'source ray');sout[o+1]=f32(r1,'source ray');sout[o+2]=f32(r2,'source ray');sout[o+3]=f32(length,'source ray');
    sout[o+4]=f32(e0,'source ray');sout[o+5]=f32(e1,'source ray');sout[o+6]=f32(e2,'source ray');sout[o+7]=f32(1,'source ray');
    sout[o+8]=f32(d0,'source ray');sout[o+9]=f32(d1,'source ray');sout[o+10]=f32(d2,'source ray');sout[o+11]=f32(0,'source ray');
    if(!(sout[o+3]>0))throw new RangeError('Nonzero source ray length underflows Float32');
    const f0=sout[o],f1=sout[o+1],f2=sout[o+2],f4=sout[o+4],f5=sout[o+5],f6=sout[o+6];
    diagnostics.maximumOriginQuantizationMetres=Math.max(diagnostics.maximumOriginQuantizationMetres,Math.abs(f0-r0));
    diagnostics.maximumEndpointQuantizationMetres=Math.max(diagnostics.maximumEndpointQuantizationMetres,Math.abs(f4-e0));
    diagnostics.maximumDirectionQuantization=Math.max(diagnostics.maximumDirectionQuantization,Math.abs(sout[o+8]-d0));
    diagnostics.maximumOriginQuantizationMetres=Math.max(diagnostics.maximumOriginQuantizationMetres,Math.abs(f1-r1));
    diagnostics.maximumEndpointQuantizationMetres=Math.max(diagnostics.maximumEndpointQuantizationMetres,Math.abs(f5-e1));
    diagnostics.maximumDirectionQuantization=Math.max(diagnostics.maximumDirectionQuantization,Math.abs(sout[o+9]-d1));
    diagnostics.maximumOriginQuantizationMetres=Math.max(diagnostics.maximumOriginQuantizationMetres,Math.abs(f2-r2));
    diagnostics.maximumEndpointQuantizationMetres=Math.max(diagnostics.maximumEndpointQuantizationMetres,Math.abs(f6-e2));
    diagnostics.maximumDirectionQuantization=Math.max(diagnostics.maximumDirectionQuantization,Math.abs(sout[o+10]-d2));
    diagnostics.maximumLengthQuantizationMetres=Math.max(diagnostics.maximumLengthQuantizationMetres,Math.abs(sout[o+3]-length));diagnostics.activeRays++;
    // The old second scan used these same already-rounded Float32 values.
    min0=Math.min(min0,f0);max0=Math.max(max0,f0);min0=Math.min(min0,f4);max0=Math.max(max0,f4);
    min1=Math.min(min1,f1);max1=Math.max(max1,f1);min1=Math.min(min1,f5);max1=Math.max(max1,f5);
    min2=Math.min(min2,f2);max2=Math.max(max2,f2);min2=Math.min(min2,f6);max2=Math.max(max2,f6);
  }
  // Conservative engineering domain gate prevents obvious Float32 overflows.
  // It is NOT a proof of the CPU's1e-5 optical error budget.
  const min=[min0,min1,min2],max=[max0,max1,max2];
  for(let i=0;i<snapshot.packets.length;i++){const o=i*16;if(pout[o+10]===0&&pout[o+11]===0&&pout[o+12]===0)continue;const a=pout[o+4],b=pout[o+5],d=pout[o+6],e=pout[o+7],f=pout[o+8],g=pout[o+9],i00=1/a,i10=-b*i00/d,i11=1/d,i20=-(e*i00+f*i10)/g,i21=-f*i11/g,i22=1/g,invNorm=Math.hypot(i00,i10,i11,i20,i21,i22),distance=diagnostics.activeRays?Math.hypot(...min.map((v,c)=>Math.max(Math.abs(v-pout[o+c]),Math.abs(max[c]-pout[o+c])))):0,qBound=distance*invNorm,lineBound=snapshot.packets[i].mass*invNorm*invNorm/(2*Math.PI);diagnostics.maximumWhitenedCoordinateBound=Math.max(diagnostics.maximumWhitenedCoordinateBound,qBound);diagnostics.maximumWhitenedDirectionBound=Math.max(diagnostics.maximumWhitenedDirectionBound,invNorm);if(qBound>1e5||invNorm>1e5||!Number.isFinite(lineBound)||lineBound>1e20)return{...plan,supported:false,effective:false,reason:'numeric-conditioning-not-admitted',diagnostics,opticallyAdmitted:false};}
  return{...plan,packetData:pout,sourceData:sout,densityRevision:snapshot.revision,sourceVersion,cameraKey:smokeTransmissionCameraKey(E),eye:E,diagnostics,layout:{packetStride:16,sourceStride:12,packetFields:'relative mean.xyz,norm;L00,L10,L11,L20;L21,L22,extR,extG;extB,0,0,0',sourceFields:'origin-eye.xyz,length;endpoint-eye.xyz,active;unitDirection.xyz,0'},opticallyAdmitted:false};
}
// QA convenience only. Production FW writes reused Float64 buffers directly.
export function smokeTransmissionWorldSources(sources,{eye,reflection=false,planeY=0}={}){const E=vec(eye,'eye'),count=sources.length,endpoints64=new Float64Array(count*3),origins64=new Float64Array(count*3),active=new Uint8Array(count);for(let i=0;i<count;i++){const to=vec(sources[i].position??sources[i],'source'),o=i*3;endpoints64.set(to,o);let from=E;if(reflection){const t=(planeY-E[1])/(to[1]-E[1]);if(!Number.isFinite(t)||t<0||t>1)continue;from=E.map((v,c)=>v+(to[c]-v)*t);}origins64.set(from,o);active[i]=1;}return{count,endpoints64,origins64,active,eye:E};}
