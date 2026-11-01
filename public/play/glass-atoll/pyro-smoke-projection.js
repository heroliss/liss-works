// CPU screen bounds for the same finite K-sigma Gaussian proxy. Physical
// density remains whole-space; omitted ray tails keep the renderer's existing
// exp(-K*K/2) optical-depth bound. This module never changes mass or lighting.
const finiteArray=(value,length,label)=>{
  const a=value?.elements??value;
  if(!a||a.length!==length||!Array.from(a).every(Number.isFinite))throw new TypeError(label+' requires'+length+' finite components');
  return Array.from(a);
};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const covarianceProduct=(a,c,b)=>a[0]*(c[0]*b[0]+c[1]*b[1]+c[2]*b[2])+a[1]*(c[3]*b[0]+c[4]*b[1]+c[5]*b[2])+a[2]*(c[6]*b[0]+c[7]*b[1]+c[8]*b[2]);

export function createSmokeProjector({viewMatrix,projectionMatrix,width,height,supportSigma=5}={}){
  const v=finiteArray(viewMatrix,16,'viewMatrix'),p=finiteArray(projectionMatrix,16,'projectionMatrix');
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!Number.isFinite(supportSigma)||supportSigma<4||supportSigma>5)throw new RangeError('Positive viewport and supportSigma4..5 required');
  // Numerator/denominator are affine functions of world position. This also
  // supports asymmetric perspective view offsets without assuming centre NDC0.
  const row=index=>{
    const q=[p[index],p[index+4],p[index+8]],a=[0,0,0];
    for(let j=0;j<3;j++)a[j]=q[0]*v[j*4]+q[1]*v[j*4+1]+q[2]*v[j*4+2];
    return{a,offset:q[0]*v[12]+q[1]*v[13]+q[2]*v[14]+p[index+12]};
  };
  const x=row(0),y=row(1),w=row(3),k2=supportSigma*supportSigma;
  const whole={rect:[-1,-1,1,1],culled:false,fullScreenFallback:true,projectedPixelUpperBound:width*height};
  const ratio=(n,d,nn,dd,nd)=>{
    const A=d*d-k2*dd;
    if(!(A>128*Number.EPSILON*(d*d+k2*dd)))return null;
    const termA=k2*(nn*d*d-2*nd*n*d+dd*n*n),termB=k2*k2*(nn*dd-nd*nd),D=termA-termB;
    // Roundoff in a nearly rank-one projected ellipse must widen, never cull.
    if(!Number.isFinite(D)||D< -256*Number.EPSILON*(Math.abs(termA)+Math.abs(termB)))return null;
    const centre=(n*d-k2*nd)/A,radius=Math.sqrt(Math.max(0,D))/A;
    if(!Number.isFinite(centre)||!Number.isFinite(radius))return null;
    return[centre-radius,centre+radius];
  };
  return Object.freeze({project(mean,covariance){
    if(!mean||mean.length!==3||!covariance||covariance.length!==9)throw new TypeError('Gaussian mean3/covariance9 required');
    const d=dot(w.a,mean)+w.offset,dd=covarianceProduct(w.a,covariance,w.a);
    if(!Number.isFinite(d)||!Number.isFinite(dd)||dd<0)throw new RangeError('Projected Gaussian depth must be finite and nonnegative');
    const depthRadius=supportSigma*Math.sqrt(dd);
    if(d+depthRadius<=0)return{rect:null,culled:true,fullScreenFallback:false,projectedPixelUpperBound:0};
    if(d<=depthRadius)return{...whole,rect:[...whole.rect]};
    const bx=ratio(dot(x.a,mean)+x.offset,d,covarianceProduct(x.a,covariance,x.a),dd,covarianceProduct(x.a,covariance,w.a)),by=ratio(dot(y.a,mean)+y.offset,d,covarianceProduct(y.a,covariance,y.a),dd,covarianceProduct(y.a,covariance,w.a));
    if(!bx||!by)return{...whole,rect:[...whole.rect]};
    // One physical pixel covers Float32 instance rounding and boundary raster
    // rules. It only widens the analytic interval; density is not scaled.
    const padX=2/width,padY=2/height;
    const rect=[Math.max(-1,bx[0]-padX),Math.max(-1,by[0]-padY),Math.min(1,bx[1]+padX),Math.min(1,by[1]+padY)];
    if(rect[0]>=rect[2]||rect[1]>=rect[3])return{rect:null,culled:true,fullScreenFallback:false,projectedPixelUpperBound:0};
    return{rect,culled:false,fullScreenFallback:false,projectedPixelUpperBound:(rect[2]-rect[0])*(rect[3]-rect[1])*width*height*.25};
  }});
}
