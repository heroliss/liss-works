// Direction-only ocean reflection candidate. World-Y is not the local sea
// normal on a curved planet. These functions allocate no GPU resources.
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const normalize=a=>{const l=Math.hypot(...a);if(!(l>0)||!Number.isFinite(l))throw new RangeError('A reflection vector must be finite and nonzero');return a.map(v=>v/l);};
const reflect=(V,N)=>V.map((v,i)=>-v+2*dot(V,N)*N[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function waterSmithVisibility(cosine,alpha){
  if(!Number.isFinite(cosine)||!Number.isFinite(alpha)||alpha<=0||alpha>1)throw new RangeError('Finite cosine and roughness0<alpha<=1 required');
  const c=Math.max(0,Math.min(1,cosine));return 2*c/(c+Math.sqrt(alpha*alpha+(1-alpha*alpha)*c*c));
}
export function waterReflectionDirections({view,normal,macroNormal=[0,1,0],alpha=.02,mode='geometric',unmaskedFacing=null}={}){
  if(!['legacy','geometric'].includes(mode)||![view,normal,macroNormal].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite)))throw new TypeError('Reflection mode and finite metric directions required');
  const V=normalize(view),N=normalize(normal),M=normalize(macroNormal),fine=reflect(V,N),macro=reflect(V,M),noV=dot(M,V),facing=unmaskedFacing??Math.max(0,dot(N,V));
  if(!Number.isFinite(facing))throw new TypeError('Finite original facet facing required');
  const legacyVisibility=waterSmithVisibility(Math.max(.0001,noV),alpha)*waterSmithVisibility(facing,alpha);
  if(mode==='legacy'){fine[1]=Math.max(fine[1],.006);macro[1]=Math.max(macro[1],.012);return{fineDirection:normalize(fine),macroDirection:normalize(macro),visibility:legacyVisibility,fineValid:true,macroProjected:false};}
  // Invisible/back-facing tessellation residue gets its closest local
  // tangent. A visible smooth sphere already has M.R=M.V>=0 exactly.
  const macroCos=dot(macro,M),projected=macro.map((v,i)=>v-M[i]*Math.min(0,macroCos));
  let safeMacro;if(Math.hypot(...projected)>1e-6)safeMacro=normalize(projected);else safeMacro=normalize(cross(M,Math.abs(M[1])<.9?[0,1,0]:[0,0,1]));
  const noL=dot(fine,M),fineValid=noL>0,visibility=legacyVisibility*waterSmithVisibility(noL,alpha);
  return{fineDirection:fineValid?normalize(fine):safeMacro.slice(),macroDirection:safeMacro,visibility,fineValid,macroProjected:macroCos<0};
}
export const waterReflectionDirectionGLSL=/* glsl */`
  uniform int uReflectionDirectionMode;
  float waterIncomingSmith(float cosine,float alpha){
    float c=clamp(cosine,0.,1.);
    return 2.*c/(c+sqrt(alpha*alpha+(1.-alpha*alpha)*c*c));
  }
  vec3 waterGeometricMacroRay(vec3 ray,vec3 macroNormal){
    vec3 tangent=ray-macroNormal*min(0.,dot(ray,macroNormal));
    float magnitude=length(tangent);
    return magnitude>1e-6?tangent/magnitude:normalize(cross(macroNormal,abs(macroNormal.y)<.9?vec3(0.,1.,0.):vec3(0.,0.,1.)));
  }
`;
