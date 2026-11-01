export const waterVertex = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.-1.,0.,1.); }
`;

export const waterFragment = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uMoment;
uniform vec2 uPointer;
uniform vec4 uRipples[8];
uniform sampler2D uIsland;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.03)+.15*noise(p*4.12);}
vec3 palette(vec3 day,vec3 dusk,vec3 night){return mix(mix(day,dusk,clamp(uMoment,0.,1.)),night,clamp(uMoment-1.,0.,1.));}
float waves(vec2 p){
 float h=sin(p.x*2.8+p.y*1.3-uTime*.83)*.024+sin(p.y*4.1-p.x*.9+uTime*.62)*.014;
 h+=sin(p.x*7.9+p.y*5.1-uTime*1.14)*.006;
 for(int i=0;i<8;i++){
  vec4 r=uRipples[i];float age=uTime-r.z,d=length(p-r.xy);
  if(age>0.&&age<5.){float ring=d-age*1.12;h+=sin(ring*15.)*exp(-ring*ring*3.4)*exp(-age*.72)*r.w*.036;}
 }
 return h;
}
vec3 normalAt(vec2 p){float e=.022;return normalize(vec3((waves(p-vec2(e,0))-waves(p+vec2(e,0)))/(2.*e),1.,(waves(p-vec2(0,e))-waves(p+vec2(0,e)))/(2.*e)));}
void main(){
 float aspect=uResolution.x/uResolution.y;
 float distance=aspect<1.15?10.4:9.4;
 float yaw=uPointer.x*.34;
 vec3 camera=vec3(sin(yaw)*distance,distance*(.635+uPointer.y*.08),cos(yaw)*distance);
 vec3 target=vec3(0.,0.,-.25),forward=normalize(target-camera),right=normalize(cross(forward,vec3(0,1,0))),up=cross(right,forward);
 float lens=.33;
 vec2 screen=vUv*2.-1.;vec3 ray=normalize(forward+right*screen.x*aspect*lens+up*screen.y*lens);
 if(ray.y>-.025){outColor=vec4(0);return;}
 vec3 hit=camera+ray*(-camera.y/ray.y);vec2 p=hit.xz;
 vec2 islandCenter=vec2(-.22,-1.12);
 float radius=length((p-islandCenter)/vec2(1.70,1.08));
 float boundary=length((p-vec2(0.,.0))/vec2(7.5,5.6));
 float alpha=1.-smoothstep(.62,1.,boundary);
 alpha*=smoothstep(-8.,-5.8,p.y)*(1.-smoothstep(4.9,7.1,p.y));
 // Fade both the sea's world-space extent and the finite drawing surface.
 // The last pixels are transparent even at narrow or very wide viewports.
 float screenEdge=length((vUv-vec2(.5,.46))/vec2(.56,.55));
 alpha*=1.-smoothstep(.58,1.04,screenEdge);
 alpha*=smoothstep(0.,.10,vUv.y)*smoothstep(0.,.08,1.-vUv.y);
 alpha*=smoothstep(0.,.075,vUv.x)*smoothstep(0.,.075,1.-vUv.x);
 vec3 n=normalAt(p);
 vec3 view=normalize(camera-hit),refraction=refract(-view,n,1./1.333);
 float depth=.16+2.0*smoothstep(.65,3.5,radius);
 vec2 floorPoint=p+refraction.xz*depth/max(.18,-refraction.y);
 float floorRadius=length((floorPoint-islandCenter)/vec2(1.7,1.08));
 floorRadius+=(noise(floorPoint*2.1)-.5)*.16;
 float lagoon=1.-smoothstep(1.1,3.5,floorRadius);
 vec3 deep=palette(vec3(.020,.155,.190),vec3(.085,.128,.195),vec3(.018,.053,.113));
 vec3 shallow=palette(vec3(.10,.58,.54),vec3(.31,.42,.39),vec3(.035,.19,.235));
 vec3 color=mix(deep,shallow,lagoon*.86);
 // Refracted floor colour and moving caustic cells, rather than line art water.
 float caustic=abs(sin(floorPoint.x*8.3+sin(floorPoint.y*6.1+uTime*.34))+sin(floorPoint.y*9.1+sin(floorPoint.x*4.3-uTime*.29)));
 caustic=pow(1.-smoothstep(.05,.24,caustic),1.4);
 color+=palette(vec3(.14,.25,.19),vec3(.20,.16,.10),vec3(.045,.12,.16))*caustic*lagoon*.10;
 float bands=floor(fbm(floorPoint*1.7)*5.)/5.;color*=.88+bands*.23;
 float shore=(1.-smoothstep(1.15,1.57,floorRadius))*smoothstep(.94,1.15,floorRadius);
 color=mix(color,palette(vec3(.65,.85,.70),vec3(.79,.68,.49),vec3(.19,.38,.40)),shore*.30);
 float foam=shore*smoothstep(.58,.83,noise(floorPoint*9.+uTime*.10));color+=foam*.10;
 // The inked island itself has a broken, compressed mirror in the near water.
 vec2 mirrorRelative=p-islandCenter;
 float mirrorDistance=dot(mirrorRelative,vec2(sin(yaw),cos(yaw)));
 vec2 mirrorUV=vec2(dot(mirrorRelative,vec2(cos(yaw),-sin(yaw)))/7.0+.5,mirrorDistance/4.2+.265)+n.xz*.045;
 vec4 mirrored=texture(uIsland,clamp(mirrorUV,.001,.999));
 float mirrorMask=step(0.,mirrorUV.x)*step(mirrorUV.x,1.)*step(0.,mirrorUV.y)*step(mirrorUV.y,1.);
 mirrorMask*=smoothstep(.12,.8,mirrorDistance)*exp(-max(0.,mirrorDistance-1.1)*.48)*(.65+.35*sin(p.y*23.+uTime*.77));
 color=mix(color,mirrored.rgb*.62,mirrored.a*mirrorMask*.18);
 // Fresnel environment and a broad, stylised sun trail use the computed normals.
 float fresnel=.025+.975*pow(1.-max(dot(n,view),0.),5.);
 vec3 sky=palette(vec3(.34,.63,.68),vec3(.89,.51,.35),vec3(.12,.25,.40));
 color=mix(color,sky,fresnel*.42);
 vec3 light=normalize(vec3(-.65,1.,-.65));vec3 halfVector=normalize(light+view);
 float specular=pow(max(dot(n,halfVector),0.),110.);
 color+=palette(vec3(.65,.82,.65),vec3(.97,.64,.29),vec3(.20,.38,.53))*specular*.65;
 float trail=exp(-pow((p.x+2.0+n.x*1.6)*.8,2.))*smoothstep(-3.,1.,p.y);
 color+=palette(vec3(.024,.048,.033),vec3(.15,.065,.015),vec3(.014,.025,.041))*trail*(.4+.6*smoothstep(.01,.065,n.z));
 color+= (hash(gl_FragCoord.xy)-.5)*.006;
 // A transparent, filled-contour illustration floats above the same plane.
 vec3 anchor=vec3(islandCenter.x,0.,islandCenter.y)-camera;
 float z=dot(anchor,forward);vec2 anchorUV=vec2(dot(anchor,right)/(z*lens*aspect),dot(anchor,up)/(z*lens))*.5+.5;
 float spriteW=7.0/(z*lens*2.*aspect),spriteH=spriteW*aspect*(800./1024.);
 vec2 islandUV=(vUv-anchorUV)/vec2(spriteW,spriteH)+vec2(.5,.28);
 islandUV.x+=sin(uTime*.63+islandUV.y*5.4)*.0024*smoothstep(.38,.8,islandUV.y);
 vec4 painted=texture(uIsland,clamp(islandUV,.001,.999));
 float valid=step(0.,islandUV.x)*step(islandUV.x,1.)*step(0.,islandUV.y)*step(islandUV.y,1.);
 painted.a*=valid;
 color=mix(color,painted.rgb,painted.a);alpha=max(alpha,painted.a);
 // Supply premultiplied colour to the browser compositor as well as alpha.
 // Transparent border pixels therefore contain no residual sea colour.
 outColor=vec4(color*alpha,alpha);
}
`;
