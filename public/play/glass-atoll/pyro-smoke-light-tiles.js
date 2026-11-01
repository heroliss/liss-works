// Exact complete-request scheduling for the unchanged SH1 optical shader.
import {decomposeTransmissionInterval} from './smoke-transmission-rectangles.js';
// Bounded GPU map/reduce for the existing per-packet isotropic SH1 model.
// Every source row participates. Only FP32 summation order changes; this is
// neither temporal light reuse nor source/density reduction.
export const SMOKE_LIGHT_TILE_SOURCES=64;
const integer=(x,label,max)=>{if(!Number.isSafeInteger(x)||x<0||x>max)throw new RangeError(label+' exceeds bounded nonnegative integer domain');return x;};
// Explicit complete request policy affects tiled64 only; legacy maxBakePairs
// remains any positive safe integer over the same4096x14000 physical domain.
export function planSmokeLightTiles(packetCount,sourceCount,{maxPackets=4096,maxSources=14000,maxBakePairs=1048576,maxRequestPairs=null,maxMapPairs=1000000,maxMapDraws=64}={}){
  integer(maxPackets,'maxPackets',4096);integer(maxSources,'maxSources',14000);integer(maxBakePairs,'maxBakePairs',Number.MAX_SAFE_INTEGER);integer(maxMapPairs,'maxMapPairs',1048576);integer(maxMapDraws,'maxMapDraws',64);
  if(!maxPackets||!maxSources||!maxBakePairs||maxMapPairs<64||!maxMapDraws)throw new RangeError('Tile capacities/map policies must be positive');
  if(maxRequestPairs!==null){integer(maxRequestPairs,'maxRequestPairs',12000000);if(!maxRequestPairs)throw new RangeError('maxRequestPairs must be positive');}
  integer(packetCount,'packetCount',maxPackets);integer(sourceCount,'sourceCount',maxSources);
  const effectiveMaxPairs=maxRequestPairs??maxBakePairs,requiredPairs=packetCount*sourceCount,tileCount=Math.max(1,Math.ceil(sourceCount/SMOKE_LIGHT_TILE_SOURCES));
  if(requiredPairs>effectiveMaxPairs)return{supported:false,reason:'pair-work-capacity',requiredPairs,maxBakePairs,maxRequestPairs,effectiveMaxPairs,tileCount};
  const partialTexels=packetCount*tileCount,partialCapacityTexels=Math.ceil(Math.min(effectiveMaxPairs,maxPackets*maxSources)/64)+maxPackets;
  if(partialTexels>partialCapacityTexels)throw new Error('Tile allocation envelope violated');
  const partialWidth=Math.min(256,2**Math.ceil(Math.log2(Math.max(1,partialCapacityTexels)))),neutral=packetCount===0||sourceCount===0;
  const split=neutral?{supported:true,rects:[{x:0,y:0,width:partialWidth,height:Math.max(1,Math.ceil(partialTexels/partialWidth)),begin:0,end:Math.max(partialWidth,Math.ceil(partialTexels/partialWidth)*partialWidth),texels:Math.max(partialWidth,Math.ceil(partialTexels/partialWidth)*partialWidth)}]}:decomposeTransmissionInterval({begin:0,end:partialTexels,partialWidth,maxCellsPerRect:Math.floor(maxMapPairs/64),maxRects:maxMapDraws});
  if(!split.supported)return{supported:false,reason:split.reason,requiredPairs,maxBakePairs,maxRequestPairs,effectiveMaxPairs,tileCount,partialTexels,partialCapacityTexels,partialWidth,mapRects:[]};
  const mapRects=split.rects.map((r,index)=>({...r,index,conservativePairs:neutral?0:r.texels*64}));
  return{supported:true,requiredPairs,maxBakePairs,maxRequestPairs,effectiveMaxPairs,tileCount,tileSources:64,partialTexels,partialCapacityTexels,packetCapacity:maxPackets,sourceCapacity:maxSources,maxReductionIterations:Math.ceil(maxSources/64),partialWidth,neutral,mapRects,mapDraws:mapRects.length,bakePasses:mapRects.length+1,maxMapPairs,maxMapDraws,conservativePairs:neutral?0:partialTexels*64,fullFinalWrite:true};
}

export function createSmokeLightTileBaker(THREE,renderer,{maxPackets,maxSources,maxBakePairs,maxRequestPairs=null,maxMapPairs=1000000,maxMapDraws=64,anisotropy,momentsGLSL,preserveRenderer,layout}={}){
  planSmokeLightTiles(0,0,{maxPackets,maxSources,maxBakePairs,maxRequestPairs,maxMapPairs,maxMapDraws});
  if(typeof momentsGLSL!=='string'||typeof preserveRenderer!=='function'||typeof layout!=='function')throw new TypeError('Shared moment/shader/render contracts required');
  let resources=null,disposed=false,bakes=0,lastPlan=null;
  const texture=(data,size)=>{const t=new THREE.DataTexture(data,size.width,size.height,THREE.RGBAFormat,THREE.FloatType);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.flipY=false;t.unpackAlignment=1;t.needsUpdate=true;return t;};
  const target=size=>new THREE.WebGLRenderTarget(size.width,size.height,{count:3,format:THREE.RGBAFormat,type:THREE.FloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false,depthBuffer:false,stencilBuffer:false,samples:0});
  function ensure(gl){
    if(resources)return;
    const cap=planSmokeLightTiles(0,0,{maxPackets,maxSources,maxBakePairs,maxRequestPairs,maxMapPairs,maxMapDraws}),maximum=gl.getParameter(gl.MAX_TEXTURE_SIZE),packetSize=layout(maxPackets,maximum),sourceSize=layout(maxSources*2,maximum),partialSize=layout(cap.partialCapacityTexels,maximum),packetUpload=new Float32Array(packetSize.width*packetSize.height*4),sourceUpload=new Float32Array(sourceSize.width*sourceSize.height*4),packetTexture=texture(packetUpload,packetSize),sourceTexture=texture(sourceUpload,sourceSize),partialTarget=target(partialSize),finalTarget=target(packetSize);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    const vertex='precision highp float;in vec2 position;void main(){gl_Position=vec4(position,0.,1.);}';
    const shared={uPackets:{value:packetTexture},uSources:{value:sourceTexture},uPacketSize:{value:new THREE.Vector2(packetSize.width,packetSize.height)},uSourceSize:{value:new THREE.Vector2(sourceSize.width,sourceSize.height)},uPartialSize:{value:new THREE.Vector2(partialSize.width,partialSize.height)},uPacketCount:{value:0},uSourceCount:{value:0},uPartialCount:{value:0},uTileCount:{value:0},uG:{value:anisotropy}};
    const partialMaterial=new THREE.RawShaderMaterial({name:'Actual-source SH1 /64-source tiles',glslVersion:THREE.GLSL3,uniforms:shared,vertexShader:vertex,depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false,fragmentShader:/*glsl*/`precision highp float;precision highp int;
      uniform highp sampler2D uPackets,uSources;uniform vec2 uPacketSize,uSourceSize,uPartialSize;uniform int uPacketCount,uSourceCount,uPartialCount;uniform float uG;
      layout(location=0)out vec4 outR;layout(location=1)out vec4 outG;layout(location=2)out vec4 outB;
      ${momentsGLSL}
      vec4 sourceTexel(int index){return texelFetch(uSources,ivec2(index%int(uSourceSize.x),index/int(uSourceSize.x)),0);}
      void main(){int index=int(gl_FragCoord.x)+int(gl_FragCoord.y)*int(uPartialSize.x);vec4 R=vec4(0.),G=vec4(0.),B=vec4(0.);
        if(uPacketCount>0&&index<uPartialCount){int packetIndex=index%uPacketCount,tile=index/uPacketCount;vec4 packet=texelFetch(uPackets,ivec2(packetIndex%int(uPacketSize.x),packetIndex/int(uPacketSize.x)),0);
          for(int i=0;i<64;i++){int sourceIndex=tile*64+i;if(sourceIndex>=uSourceCount)break;vec4 a=sourceTexel(sourceIndex*2),b=sourceTexel(sourceIndex*2+1),moments=smokeIsotropicMoments(a.xyz-packet.xyz,packet.w+a.w);moments.yzw*=3.*uG;R+=b.x*moments;G+=b.y*moments;B+=b.z*moments;}}
        outR=R;outG=G;outB=B;}`});
    const reduceUniforms={uPartialR:{value:partialTarget.textures[0]},uPartialG:{value:partialTarget.textures[1]},uPartialB:{value:partialTarget.textures[2]},uPartialSize:shared.uPartialSize,uPacketSize:shared.uPacketSize,uPacketCount:shared.uPacketCount,uTileCount:shared.uTileCount};
    const reduceMaterial=new THREE.RawShaderMaterial({name:'Actual-source SH1 /tile reduction',glslVersion:THREE.GLSL3,uniforms:reduceUniforms,vertexShader:vertex,depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false,fragmentShader:/*glsl*/`precision highp float;precision highp int;
      uniform highp sampler2D uPartialR,uPartialG,uPartialB;uniform vec2 uPartialSize,uPacketSize;uniform int uPacketCount,uTileCount;
      layout(location=0)out vec4 outR;layout(location=1)out vec4 outG;layout(location=2)out vec4 outB;
      void main(){int packetIndex=int(gl_FragCoord.x)+int(gl_FragCoord.y)*int(uPacketSize.x);vec4 R=vec4(0.),G=vec4(0.),B=vec4(0.);
        if(packetIndex<uPacketCount){for(int tile=0;tile<${cap.maxReductionIterations};tile++){if(tile>=uTileCount)break;int index=tile*uPacketCount+packetIndex;ivec2 uv=ivec2(index%int(uPartialSize.x),index/int(uPartialSize.x));R+=texelFetch(uPartialR,uv,0);G+=texelFetch(uPartialG,uv,0);B+=texelFetch(uPartialB,uv,0);}}
        outR=R*.07957747154594767;outG=G*.07957747154594767;outB=B*.07957747154594767;}`});
    const camera=new THREE.Camera(),partialScene=new THREE.Scene(),reduceScene=new THREE.Scene();
    for(const [scene,material]of [[partialScene,partialMaterial],[reduceScene,reduceMaterial]]){const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);}
    const allocatedBytes=(packetUpload.byteLength+sourceUpload.byteLength)+(partialSize.width*partialSize.height+packetSize.width*packetSize.height)*16*3;
    resources={packetSize,sourceSize,partialSize,packetUpload,sourceUpload,packetTexture,sourceTexture,partialTarget,finalTarget,geometry,shared,partialMaterial,reduceMaterial,camera,partialScene,reduceScene,programChecked:false,packetData:null,allocatedBytes};
  }
  return{
    bake({packets,ledger,gl}={}){
      if(disposed)throw new Error('Tiled smoke light baker disposed');
      const plan=planSmokeLightTiles(packets.count,ledger.count,{maxPackets,maxSources,maxBakePairs,maxRequestPairs,maxMapPairs,maxMapDraws});if(!plan.supported)throw new RangeError('Tiled bake exceeds pair-work capacity');ensure(gl);const r=resources;if(r.partialSize.width!==plan.partialWidth)throw new RangeError('Tiled partial width below supported WebGL2 layout domain');
      if(r.packetData!==packets.data){r.packetUpload.fill(0);r.packetUpload.set(packets.data.subarray(0,packets.count*4));r.packetTexture.needsUpdate=true;r.packetData=packets.data;}
      r.sourceUpload.fill(0);r.sourceUpload.set(ledger.data.subarray(0,ledger.count*8));r.sourceTexture.needsUpdate=true;r.shared.uPacketCount.value=packets.count;r.shared.uSourceCount.value=ledger.count;r.shared.uPartialCount.value=plan.partialTexels;r.shared.uTileCount.value=plan.tileCount;
      preserveRenderer(THREE,renderer,context=>{
        const passes=[...plan.mapRects.map(rect=>[r.partialTarget,r.partialScene,r.partialMaterial,rect]),[r.finalTarget,r.reduceScene,r.reduceMaterial,{x:0,y:0,width:r.packetSize.width,height:r.packetSize.height}]];
        for(const[target,scene,material,rect]of passes){target.viewport.set(rect.x,rect.y,rect.width,rect.height);target.scissorTest=false;renderer.setRenderTarget(target);renderer.setScissorTest(false);if(context.checkFramebufferStatus(context.DRAW_FRAMEBUFFER)!==context.FRAMEBUFFER_COMPLETE)throw new Error('Tiled smoke framebuffer incomplete before render');renderer.render(scene,r.camera);if(renderer.getContext()!==context||context.isContextLost())throw new Error('Tiled smoke context lost or replaced');if(context.checkFramebufferStatus(context.DRAW_FRAMEBUFFER)!==context.FRAMEBUFFER_COMPLETE)throw new Error('Tiled smoke framebuffer incomplete after render');const p=renderer.properties.get(material).currentProgram;if(!p||!context.getProgramParameter(p.program,context.LINK_STATUS))throw new Error('Tiled smoke shader failed to link');const code=context.getError();if(code!==context.NO_ERROR)throw new Error('Tiled smoke GL error '+code);}
        r.programChecked=true;
      });
      bakes++;lastPlan=plan;return{...plan,bakePasses:plan.bakePasses,allocatedBytes:r.allocatedBytes,sourceTextureBytes:r.sourceUpload.byteLength,packetTextureBytes:r.packetUpload.byteLength,partialTargetBytes:r.partialSize.width*r.partialSize.height*48,finalTargetBytes:r.packetSize.width*r.packetSize.height*48,fixedCapacityTargets:true};
    },
    get target(){return resources?.finalTarget??null;},
    diagnostics(){return{allocated:!!resources,bakes,tileSources:64,lastPlan,allocatedBytes:resources?.allocatedBytes??0,fixedCapacityTargets:true,model:'complete-source64wide map/reduce; same isotropic Gaussian SH1; FP32summation order differs'};},
    dispose(){if(disposed)return;disposed=true;if(resources){const r=resources;r.packetTexture.dispose();r.sourceTexture.dispose();r.partialTarget.dispose();r.finalTarget.dispose();r.geometry.dispose();r.partialMaterial.dispose();r.reduceMaterial.dispose();resources=null;}}
  };
}
