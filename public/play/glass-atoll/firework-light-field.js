// Direct firework light on the island as a small probe field.
//
// A burst is a cloud of hundreds of stars 100 m or more above the cay. A loop
// over sixteen point proxies per pixel is both expensive on foliage and a poor
// model of that soft, extended source. Here every far star group is projected
// onto 18 probes (3 x 3 over the cay, at ground level and at 18 m) as RGB
// order-1 spherical harmonics of its normal irradiance; a pixel interpolates the
// eight surrounding probes and evaluates once. Cost no longer depends on how
// many stars or shells burn.
//
// Evaluation uses the non-linear order-1 reconstruction (Hazel, "Reconstructing
// diffuse lighting from spherical harmonic data"): exact for a uniform sphere,
// zero behind a single source and E at normal incidence, with a ~12% residual
// at grazing incidence. It carries no occlusion; the optional burst shadow is a
// separate term. Sources close to the cay keep exact point proxies (see
// splitReceiverRows) because their inverse-square falloff varies faster than
// the probe spacing can represent.
export const FIREWORK_FIELD_PROBES=18;
export const FIREWORK_FIELD_BOUNDS=Object.freeze([-34,-24,68,48]);
export const FIREWORK_FIELD_TOP=18;

export const fireworkLightFieldGLSL=/* glsl */`
  uniform vec4 uFireFieldR[${FIREWORK_FIELD_PROBES}],uFireFieldG[${FIREWORK_FIELD_PROBES}],uFireFieldB[${FIREWORK_FIELD_PROBES}];
  uniform vec4 uFireFieldBounds;
  uniform vec3 uFireFieldBase0,uFireFieldBase1,uFireFieldBase2;
  uniform float uFireFieldTop,uFireFieldScale;
  float fireFieldBase(int id){
    if(id<3)return uFireFieldBase0[id];
    if(id<6)return uFireFieldBase1[id-3];
    return uFireFieldBase2[id-6];
  }
  float fireFieldChannel(vec4 c,vec3 n){
    if(c.x<=0.)return 0.;
    float len=length(c.yzw),r=min(len/c.x,1.),q=len>1e-20?.5*(1.+dot(c.yzw,n)/len):.5;
    float p=1.+2.*r,a=(1.-r)/(1.+r);
    return c.x*(a+(1.-a)*(p+1.)*pow(max(q,0.),p));
  }
  vec3 fireFieldIrradiance(vec3 p,vec3 worldNormal){
    if(uFireFieldScale<=0.)return vec3(0.);
    vec2 q=clamp((p.xz-uFireFieldBounds.xy)/uFireFieldBounds.zw,vec2(0.),vec2(.999999))*2.;
    ivec2 cell=ivec2(floor(q));vec2 f=fract(q);
    vec3 n=worldNormal*inversesqrt(max(dot(worldNormal,worldNormal),1.e-10));
    vec4 red=vec4(0.),green=vec4(0.),blue=vec4(0.);
    for(int corner=0;corner<4;corner++){
      int x=corner-2*(corner/2),z=corner/2,id=(cell.y+z)*3+cell.x+x;
      float weight=(x==0?1.-f.x:f.x)*(z==0?1.-f.y:f.y),base=fireFieldBase(id);
      float y=clamp((p.y-base)/max(.1,uFireFieldTop-base),0.,1.);
      red+=weight*mix(uFireFieldR[id],uFireFieldR[id+9],y);
      green+=weight*mix(uFireFieldG[id],uFireFieldG[id+9],y);
      blue+=weight*mix(uFireFieldB[id],uFireFieldB[id+9],y);
    }
    return vec3(fireFieldChannel(red,n),fireFieldChannel(green,n),fireFieldChannel(blue,n))*uFireFieldScale;
  }
`;

export function createFireworkLightField(THREE,{terrainHeight=()=>0}={}){
  const count=FIREWORK_FIELD_PROBES,bounds=FIREWORK_FIELD_BOUNDS,base=new Float32Array(9),probes=[];
  for(let y=0;y<2;y++)for(let z=0;z<3;z++)for(let x=0;x<3;x++){
    const px=bounds[0]+x*bounds[2]/2,pz=bounds[1]+z*bounds[3]/2,id=z*3+x;
    base[id]=Math.max(.12,terrainHeight(px,pz)+.22);probes.push([px,y?FIREWORK_FIELD_TOP:base[id],pz]);
  }
  const vectors=()=>Array.from({length:count},()=>new THREE.Vector4());
  const uniforms={uFireFieldR:{value:vectors()},uFireFieldG:{value:vectors()},uFireFieldB:{value:vectors()},
    uFireFieldBounds:{value:new THREE.Vector4(...bounds)},uFireFieldBase0:{value:new THREE.Vector3().fromArray(base,0)},uFireFieldBase1:{value:new THREE.Vector3().fromArray(base,3)},uFireFieldBase2:{value:new THREE.Vector3().fromArray(base,6)},
    uFireFieldTop:{value:FIREWORK_FIELD_TOP},uFireFieldScale:{value:0}};
  const channels=[uniforms.uFireFieldR.value,uniforms.uFireFieldG.value,uniforms.uFireFieldB.value],sh=new Float64Array(count*12);
  let sceneScale=1,lit=false,rowCount=0,peak=0;
  // rows: {position,intensity,colour|emissionRGBReference}; rawPerCandela converts candela to raw irradiance at 1 m.
  function update({rows=[],rawPerCandela=3.6e-5,sceneScale:scale=sceneScale}={}){
    sceneScale=scale;sh.fill(0);rowCount=rows.length;peak=0;
    for(const row of rows){
      const I=row.intensity;if(!(I>0))continue;
      const r=(row.emissionRGBReference?.[0]??row.colour[0]*I)*rawPerCandela,g=(row.emissionRGBReference?.[1]??row.colour[1]*I)*rawPerCandela,b=(row.emissionRGBReference?.[2]??row.colour[2]*I)*rawPerCandela;
      const floor=Math.max(1,(row.radius??0)**2);
      for(let p=0;p<count;p++){
        const probe=probes[p],dx=row.position[0]-probe[0],dy=row.position[1]-probe[1],dz=row.position[2]-probe[2],d2=dx*dx+dy*dy+dz*dz,inverse=.25/Math.max(d2,floor),length=Math.sqrt(Math.max(d2,1e-12)),o=p*12;
        const nx=dx/length,ny=dy/length,nz=dz/length;
        sh[o]+=r*inverse;sh[o+1]+=r*inverse*nx;sh[o+2]+=r*inverse*ny;sh[o+3]+=r*inverse*nz;
        sh[o+4]+=g*inverse;sh[o+5]+=g*inverse*nx;sh[o+6]+=g*inverse*ny;sh[o+7]+=g*inverse*nz;
        sh[o+8]+=b*inverse;sh[o+9]+=b*inverse*nx;sh[o+10]+=b*inverse*ny;sh[o+11]+=b*inverse*nz;
      }
    }
    for(let p=0;p<count;p++)for(let c=0;c<3;c++){const o=p*12+c*4;channels[c][p].set(sh[o],sh[o+1],sh[o+2],sh[o+3]);peak=Math.max(peak,sh[o]*4);}
    lit=peak>0;uniforms.uFireFieldScale.value=lit?sceneScale:0;
    return lit;
  }
  // CPU mirror of the shader, in raw (unscaled) irradiance. Used by checks and diagnostics.
  function sampleIrradiance(position,normal){
    const u=Math.min(.999999,Math.max(0,(position[0]-bounds[0])/bounds[2]))*2,v=Math.min(.999999,Math.max(0,(position[2]-bounds[1])/bounds[3]))*2,x0=Math.floor(u),z0=Math.floor(v),fx=u-x0,fz=v-z0;
    const length=Math.hypot(...normal)||1,n=normal.map(value=>value/length),coefficients=new Float64Array(12);
    for(let corner=0;corner<4;corner++){
      const x=corner%2,z=corner>>1,id=(z0+z)*3+x0+x,weight=(x?fx:1-fx)*(z?fz:1-fz),y=Math.min(1,Math.max(0,(position[1]-base[id])/Math.max(.1,FIREWORK_FIELD_TOP-base[id])));
      for(let k=0;k<12;k++)coefficients[k]+=weight*(sh[id*12+k]*(1-y)+sh[(id+9)*12+k]*y);
    }
    return [0,1,2].map(c=>{
      const R0=coefficients[c*4];if(!(R0>0))return 0;
      const vector=[coefficients[c*4+1],coefficients[c*4+2],coefficients[c*4+3]],len=Math.hypot(...vector),r=Math.min(len/R0,1),q=len>1e-20?.5*(1+(vector[0]*n[0]+vector[1]*n[1]+vector[2]*n[2])/len):.5,p=1+2*r,a=(1-r)/(1+r);
      return R0*(a+(1-a)*(p+1)*Math.max(q,0)**p);
    });
  }
  return {uniforms,glsl:fireworkLightFieldGLSL,probes,update,sampleIrradiance,
    setSceneExposure(P){sceneScale=2**P;uniforms.uFireFieldScale.value=lit?sceneScale:0;},
    getRadianceBound(){return {maxRGB:peak,reference:'largest probe normal irradiance; a receiver between probes cannot exceed the probe maximum by interpolation'};},
    get state(){return {probes:count,lit,rows:rowCount,peakRawIrradiance:peak,sceneScale,uniformVectors:count*3+5,extraSamplers:0,model:'RGB order-1 SH of far-source normal irradiance; non-linear reconstruction; no occlusion'};}};
}
