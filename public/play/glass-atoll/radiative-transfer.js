/**
 * Independent, single-scattering segment algebra. Not integrated into the scene.
 *
 * A transfer maps radiance behind a segment to radiance at its front:
 *   L_front = S + T * L_back (componentwise RGB).
 * `extinctionRGB` is beta_e [m^-1]; `sourceRGB` is j [radiance / m],
 * equivalently emitted/scattered power per volume per steradian. j includes
 * incident illumination and a normalized phase function, not a second 1/pi.
 * There is no implicit exposure, tone curve, density, distance falloff or gain.
 *
 * Co-spatial constituents add beta and j before integration. Distinct front/back
 * segments compose in spatial order. Multiple lights add j ONLY: counting the
 * same medium once per light would incorrectly repeat its extinction.
 *
 * This algebra cannot invert a separately discretized air/background rendering.
 * In particular, never divide by a small T_air to recover a supposed clear ray.
 * Callers must supply one shared segment partition and consistent ray distances.
 *
 * CPU inputs are finite/nonnegative; SSA is in [0,1], |g| < 1. The GLSL functions
 * assume the same validated domain. JS is double precision; GLSL requires highp
 * float. Neither is an arbitrary-range/FP16-storage overflow guarantee.
 */

const INV_4PI=1/(4*Math.PI);
const MU_ROUNDOFF=1e-12;

function scalar(value,name,{min=0,max=Infinity}={}){
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new RangeError(`${name} must be finite in [${min}, ${max}].`);
  return value;
}
function vector(value,name,{signed=false}={}){
  if(!value||value.length!==3)throw new TypeError(`${name} must have exactly three channels.`);
  return Array.from(value,(v,c)=>scalar(v,`${name}[${c}]`,{min:signed?-Infinity:0}));
}
function output(value,name){
  if(!Number.isFinite(value)||value<0)throw new RangeError(`${name} exceeds finite nonnegative radiance arithmetic.`);
  return value;
}
function cosine(value){
  scalar(value,'cosine',{min:-1-MU_ROUNDOFF,max:1+MU_ROUNDOFF});
  return Math.max(-1,Math.min(1,value));
}
function asymmetry(value){
  scalar(value,'g',{min:-1,max:1});
  if(Math.abs(value)===1)throw new RangeError('g must be strictly between -1 and 1.');
  return value;
}
function checkedTransfer(transfer){
  const T=vector(transfer?.T,'transfer.T'),S=vector(transfer?.S,'transfer.S');
  T.forEach((v,c)=>scalar(v,`transfer.T[${c}]`,{max:1}));
  return{T,S};
}

// phi(x)=(1-exp(-x))/x. Degree 10, alternating Taylor series. For 0<=x<.25
// the first omitted term is <= .25^11/12! = 4.978e-16. This branch avoids both
// cancellation and 0/0 in CPU and highp GLSL, including subnormal beta*length.
function smallOpticalIntegralFactor(x){
  return 1+x*(-1/2+x*(1/6+x*(-1/24+x*(1/120+x*(-1/720+x*(1/5040+x*(-1/40320+x*(1/362880+x*(-1/3628800+x/39916800)))))))));
}

export function homogeneousSegment({extinctionRGB=[0,0,0],sourceRGB=[0,0,0],length=0}={}){
  const beta=vector(extinctionRGB,'extinctionRGB'),j=vector(sourceRGB,'sourceRGB');
  scalar(length,'length');
  const T=[],S=[];
  for(let c=0;c<3;c++){
    const x=beta[c]*length;
    // x can overflow for finite beta and length: exp(-Infinity)=0 and the
    // saturated integral is 1/beta, so no Infinity/Infinity division is needed.
    const integral=length===0?0:beta[c]===0?length:x<.25?length*smallOpticalIntegralFactor(x):-Math.expm1(-x)/beta[c];
    T.push(Math.exp(-x));
    S.push(output(j[c]*integral,`segment.S[${c}]`));
  }
  return{T,S};
}

/** Integrate this result ONCE over the shared geometric segment. */
export function combineMedia(...media){
  const extinctionRGB=[0,0,0],sourceRGB=[0,0,0];
  for(const medium of media){
    const beta=vector(medium?.extinctionRGB,'medium.extinctionRGB'),j=vector(medium?.sourceRGB,'medium.sourceRGB');
    for(let c=0;c<3;c++){
      extinctionRGB[c]=output(extinctionRGB[c]+beta[c],`combined.extinctionRGB[${c}]`);
      sourceRGB[c]=output(sourceRGB[c]+j[c],`combined.sourceRGB[${c}]`);
    }
  }
  return{extinctionRGB,sourceRGB};
}

/** Sum light contributions while retaining the medium's extinction once. */
export function sumSources(...sources){
  const result=[0,0,0];
  for(const source of sources){
    const j=vector(source,'sourceRGB');
    for(let c=0;c<3;c++)result[c]=output(result[c]+j[c],`summed.sourceRGB[${c}]`);
  }
  return result;
}

/** front is nearest the eye. This operation is associative, not commutative. */
export function composeTransfers(front,back){
  const a=checkedTransfer(front),b=checkedTransfer(back);
  return{T:a.T.map((t,c)=>t*b.T[c]),S:a.S.map((s,c)=>output(s+a.T[c]*b.S[c],`composed.S[${c}]`))};
}

export function applyTransfer(transfer,backgroundRGB){
  const {T,S}=checkedTransfer(transfer),background=vector(backgroundRGB,'backgroundRGB');
  return S.map((s,c)=>output(s+T[c]*background[c],`applied.RGB[${c}]`));
}

export function scatteringCoefficients(extinctionRGB,singleScatteringAlbedo){
  const beta=vector(extinctionRGB,'extinctionRGB');
  const ssa=typeof singleScatteringAlbedo==='number'?[singleScatteringAlbedo,singleScatteringAlbedo,singleScatteringAlbedo]:vector(singleScatteringAlbedo,'singleScatteringAlbedo');
  ssa.forEach((v,c)=>scalar(v,`singleScatteringAlbedo[${c}]`,{max:1}));
  return beta.map((v,c)=>v*ssa[c]);
}

/** Normalized HG phase [sr^-1]. cosine is incoming dot outgoing PROPAGATION. */
export function hgPhase(cosTheta,g=0){
  const mu=cosine(cosTheta),a=Math.abs(asymmetry(g));
  const alignedMu=g<0?-mu:mu;
  // Equivalent to 1+g*g-2*g*mu; avoids cancellation near the forward peak.
  const d=(1-a)*(1-a)+2*a*(1-alignedMu);
  return INV_4PI*(1-a)*(1+a)/(d*Math.sqrt(d));
}

/** All-direction phase bound, including negative g/back-scattering profiles. */
export function hgPhaseMax(g=0){
  const a=Math.abs(asymmetry(g));
  return INV_4PI*(1+a)/((1-a)*(1-a));
}

export function rayleighPhase(cosTheta){
  const mu=cosine(cosTheta);
  return 3/(16*Math.PI)*(1+mu*mu);
}

function unitDirection(value,name){
  const v=vector(value,name,{signed:true}),scale=Math.max(...v.map(Math.abs));
  if(scale===0)throw new RangeError(`${name} must be nonzero.`);
  const normalized=v.map(x=>x/scale),norm=Math.hypot(...normalized);
  return normalized.map(x=>x/norm);
}

/** Source->sample and sample->eye, NOT sample->source and sample->eye. */
export function scatteringCosine(incomingPropagation,outgoingPropagation){
  const a=unitDirection(incomingPropagation,'incomingPropagation'),b=unitDirection(outgoingPropagation,'outgoingPropagation');
  return cosine(a.reduce((s,v,c)=>s+v*b[c],0));
}

/** Incident RGB is irradiance in the same reference as the output radiance. */
export function scatteringSource({scatteringRGB,incidentRGB,cosine:cosTheta,g=0}={}){
  const scattering=vector(scatteringRGB,'scatteringRGB'),incident=vector(incidentRGB,'incidentRGB'),phase=hgPhase(cosTheta,g);
  return scattering.map((sigma,c)=>output(sigma*incident[c]*phase,`sourceRGB[${c}]`));
}

/** Explicit storage scaling: T is dimensionless; only S is radiance. */
export function scaleTransferRadiance(transfer,factor){
  scalar(factor,'radiance scale');
  const {T,S}=checkedTransfer(transfer);
  return{T,S:S.map((s,c)=>output(s*factor,`scaled.S[${c}]`))};
}

// Deliberately self-contained: caller validates coefficients/SSA/g/directions.
// No sampler, uniform, implicit P/C, framebuffer output or shader version.
// highp is required; storage precision and scene integration need separate GPU QA.
export const radiativeTransferGLSL=/* glsl */`
precision highp float;
const float RT_INV_4PI=0.07957747154594766788;
struct RTTransfer { vec3 T; vec3 S; };
struct RTMedium { vec3 extinctionRGB; vec3 sourceRGB; };

float rtSmallOpticalIntegralFactor(float x){
  return 1.+x*(-1./2.+x*(1./6.+x*(-1./24.+x*(1./120.+x*(-1./720.+x*(1./5040.+x*(-1./40320.+x*(1./362880.+x*(-1./3628800.+x/39916800.)))))))));
}
float rtOpticalIntegral(float beta,float distance){
  if(distance==0.)return 0.;
  if(beta==0.)return distance;
  float x=beta*distance;
  if(x<.25)return distance*rtSmallOpticalIntegralFactor(x);
  return (1.-exp(-x))/beta;
}
RTTransfer rtSegment(vec3 extinctionRGB,vec3 sourceRGB,float distance){
  vec3 integral=vec3(rtOpticalIntegral(extinctionRGB.r,distance),rtOpticalIntegral(extinctionRGB.g,distance),rtOpticalIntegral(extinctionRGB.b,distance));
  return RTTransfer(exp(-extinctionRGB*distance),sourceRGB*integral);
}
RTMedium rtCombineMedia(RTMedium a,RTMedium b){
  return RTMedium(a.extinctionRGB+b.extinctionRGB,a.sourceRGB+b.sourceRGB);
}
RTTransfer rtCompose(RTTransfer front,RTTransfer back){
  return RTTransfer(front.T*back.T,front.S+front.T*back.S);
}
vec3 rtApply(RTTransfer medium,vec3 backgroundRGB){return medium.S+medium.T*backgroundRGB;}
vec3 rtScatteringCoefficients(vec3 extinctionRGB,vec3 singleScatteringAlbedo){return extinctionRGB*singleScatteringAlbedo;}
vec3 rtScatteringCoefficients(vec3 extinctionRGB,float singleScatteringAlbedo){return extinctionRGB*singleScatteringAlbedo;}
float rtHG(float cosine,float g){
  float a=abs(g),mu=g<0.?-clamp(cosine,-1.,1.):clamp(cosine,-1.,1.);
  float d=(1.-a)*(1.-a)+2.*a*(1.-mu);
  return RT_INV_4PI*(1.-a)*(1.+a)/(d*sqrt(d));
}
float rtHGMax(float g){float a=abs(g);return RT_INV_4PI*(1.+a)/((1.-a)*(1.-a));}
float rtRayleigh(float cosine){float mu=clamp(cosine,-1.,1.);return 3.*RT_INV_4PI*.25*(1.+mu*mu);}
vec3 rtUnitDirection(vec3 direction){
  float scale=max(abs(direction.x),max(abs(direction.y),abs(direction.z)));
  return normalize(direction/scale);
}
float rtScatteringCosine(vec3 incomingPropagation,vec3 outgoingPropagation){
  return clamp(dot(rtUnitDirection(incomingPropagation),rtUnitDirection(outgoingPropagation)),-1.,1.);
}
vec3 rtScatteringSource(vec3 scatteringRGB,vec3 incidentRGB,float cosine,float g){return scatteringRGB*incidentRGB*rtHG(cosine,g);}
RTTransfer rtScaleRadiance(RTTransfer medium,float factor){return RTTransfer(medium.T,medium.S*factor);}
`;
