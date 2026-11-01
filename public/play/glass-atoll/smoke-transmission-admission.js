import {createPyroSmokeColumns} from './pyro-smoke-columns.js';
import {createSmokeTransmissionGPU} from './pyro-smoke-transmission-gpu.js';

// One synchronous, user-triggered hardware sanity check on the EXISTING
// renderer. No new context, timers, animation loop or verification imports.
// This intentionally stalls for one4x1RGBA32F readback; never call per frame.
const errorText=error=>String(error?.message??error).slice(0,512);
const arraysEqual=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
function collectGLErrors(g){
  const errors=[];
  for(let i=0;i<16;i++){const error=g.getError();if(error===g.NO_ERROR)return errors;errors.push(error);}
  return errors;
}
function captureState(THREE,r,g){
  const drawCount=g.getParameter(g.MAX_DRAW_BUFFERS),target=r.getRenderTarget();
  return {target,face:r.getActiveCubeFace(),mip:r.getActiveMipmapLevel(),
    viewport:r.getViewport(new THREE.Vector4()),scissor:r.getScissor(new THREE.Vector4()),scissorTest:r.getScissorTest(),
    actualViewport:Array.from(g.getParameter(g.VIEWPORT)),actualScissor:Array.from(g.getParameter(g.SCISSOR_BOX)),actualScissorTest:g.isEnabled(g.SCISSOR_TEST),
    read:g.getParameter(g.READ_FRAMEBUFFER_BINDING),draw:g.getParameter(g.DRAW_FRAMEBUFFER_BINDING),readBuffer:g.getParameter(g.READ_BUFFER),
    drawBuffers:Array.from({length:drawCount},(_,i)=>g.getParameter(g.DRAW_BUFFER0+i)),
    packBuffer:g.getParameter(g.PIXEL_PACK_BUFFER_BINDING),packAlignment:g.getParameter(g.PACK_ALIGNMENT),packRowLength:g.getParameter(g.PACK_ROW_LENGTH),packSkipPixels:g.getParameter(g.PACK_SKIP_PIXELS),packSkipRows:g.getParameter(g.PACK_SKIP_ROWS),
    autoClear:r.autoClear,autoClearColor:r.autoClearColor,autoClearDepth:r.autoClearDepth,autoClearStencil:r.autoClearStencil,
    toneMapping:r.toneMapping,exposure:r.toneMappingExposure,outputColorSpace:r.outputColorSpace,
    xr:r.xr?.enabled,shadow:r.shadowMap?{enabled:r.shadowMap.enabled,autoUpdate:r.shadowMap.autoUpdate,needsUpdate:r.shadowMap.needsUpdate}:null,
    targetViewport:target?.viewport?.clone(),targetScissor:target?.scissor?.clone(),targetScissorTest:target?.scissorTest};
}
function restoreState(THREE,r,g,p){
  r.autoClear=p.autoClear;r.autoClearColor=p.autoClearColor;r.autoClearDepth=p.autoClearDepth;r.autoClearStencil=p.autoClearStencil;
  r.toneMapping=p.toneMapping;r.toneMappingExposure=p.exposure;r.outputColorSpace=p.outputColorSpace;
  if(r.xr)r.xr.enabled=p.xr;if(p.shadow)Object.assign(r.shadowMap,p.shadow);
  r.setViewport(p.viewport);r.setScissor(p.scissor);r.setScissorTest(p.scissorTest);
  try{
    if(p.target?.viewport)p.target.viewport.fromArray(p.actualViewport);
    if(p.target?.scissor){p.target.scissor.fromArray(p.actualScissor);p.target.scissorTest=p.actualScissorTest;}
    r.setRenderTarget(p.target,p.face,p.mip);
  }finally{
    if(p.targetViewport)p.target.viewport.copy(p.targetViewport);
    if(p.targetScissor){p.target.scissor.copy(p.targetScissor);p.target.scissorTest=p.targetScissorTest;}
  }
  // Restore the independent physical FBOs and their buffer selections. The
  // renderer's logical target alone cannot represent a separate READ binding.
  r.state.bindFramebuffer(g.DRAW_FRAMEBUFFER,p.draw);g.bindFramebuffer(g.DRAW_FRAMEBUFFER,p.draw);
  // Default framebuffer accepts only one BACK/NONE selection. Some real
  // browsers alias every DRAW_BUFFERi query to BACK on this framebuffer;
  // replaying that queried list verbatim is INVALID_OPERATION.
  let n=p.draw===null?1:p.drawBuffers.length;while(n>1&&p.drawBuffers[n-1]===g.NONE)n--;
  g.drawBuffers(p.drawBuffers.slice(0,n));
  r.state.bindFramebuffer(g.READ_FRAMEBUFFER,p.read);g.bindFramebuffer(g.READ_FRAMEBUFFER,p.read);g.readBuffer(p.readBuffer);
  g.bindBuffer(g.PIXEL_PACK_BUFFER,p.packBuffer);g.pixelStorei(g.PACK_ALIGNMENT,p.packAlignment);g.pixelStorei(g.PACK_ROW_LENGTH,p.packRowLength);g.pixelStorei(g.PACK_SKIP_PIXELS,p.packSkipPixels);g.pixelStorei(g.PACK_SKIP_ROWS,p.packSkipRows);
  r.state.viewport(new THREE.Vector4().fromArray(p.actualViewport));r.state.scissor(new THREE.Vector4().fromArray(p.actualScissor));r.state.setScissorTest(p.actualScissorTest);
}
function stateEquals(a,b){
  return ['target','face','mip','scissorTest','actualScissorTest','read','draw','readBuffer','packBuffer','packAlignment','packRowLength','packSkipPixels','packSkipRows','autoClear','autoClearColor','autoClearDepth','autoClearStencil','toneMapping','exposure','outputColorSpace','xr','targetScissorTest'].every(k=>a[k]===b[k])
    &&a.viewport.equals(b.viewport)&&a.scissor.equals(b.scissor)
    &&['actualViewport','actualScissor','drawBuffers'].every(k=>arraysEqual(a[k],b[k]))
    &&JSON.stringify(a.shadow)===JSON.stringify(b.shadow)
    &&(!a.targetViewport||a.targetViewport.equals(b.targetViewport))&&(!a.targetScissor||a.targetScissor.equals(b.targetScissor));
}
function fixture(){
  const eye=[0,1,2],ends=[[.1,.8,-4],[1.8,1.4,-4],eye,[.1,.8,-2]],count=4;
  return {snapshot:{time:0,revision:1,profiles:[{id:'sanity',extinctionPerMassRGB:[.7,1,.4]}],packets:[{id:1,profileId:'sanity',mass:.4,mean:[.1,.8,-2],covariance:[.7,.08,.02,.08,.9,.04,.02,.04,.6]}]},
    count,endpoints64:Float64Array.from(ends.flat()),origins64:Float64Array.from(ends.flatMap(()=>eye)),active:new Uint8Array([1,1,1,1]),eye,sourceVersion:1};
}
export function checkSmokeTransmissionSupport(THREE,renderer,{createField=createSmokeTransmissionGPU}={}){
  const report={passed:false,supported:false,reason:'not-checked',scope:'one synchronous4ray/1ordinary-SPD-packet hardware sanity; not universal optical accuracy, VTF integration or nativeFPS admission',
    sourceCount:4,packetCount:1,tolerance:1e-5,readbackCalls:0,readbackBytes:0,stateRestored:false,disposed:false,entryGLErrors:[],exitGLErrors:[],checks:[],errors:[]};
  let gl=null,saved=null,field=null;
  try{
    if(typeof createField!=='function'||createField.constructor?.name==='AsyncFunction'||!THREE?.Vector4||!renderer?.getContext)throw new TypeError('Existing Three renderer and synchronous field factory required');
    gl=renderer.getContext();
    if(!gl||typeof gl.readBuffer!=='function'||typeof gl.drawBuffers!=='function'||typeof gl.readPixels!=='function'||typeof gl.getError!=='function'){report.reason='webgl2-unavailable';return report;}
    if(gl.isContextLost?.()){report.reason='context-lost';return report;}
    report.entryGLErrors=collectGLErrors(gl);
    if(report.entryGLErrors.length){report.reason='entry-gl-error';report.errors.push('entry GL errors: '+report.entryGLErrors.join(','));return report;}
    if(!gl.getExtension('EXT_color_buffer_float')||gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)<1){report.reason='float-target-or-vertex-texture-unavailable';return report;}
    saved=captureState(THREE,renderer,gl);
    const input=fixture(),columns=createPyroSmokeColumns(input.snapshot,{errorBudget:0,columnKernel:'reference'}),expected=[];
    for(let i=0;i<4;i++)expected.push(columns.between(Array.from(input.origins64.subarray(i*3,i*3+3)),Array.from(input.endpoints64.subarray(i*3,i*3+3)),{errorBudget:0}).T);
    field=createField(THREE,renderer,{maxSources:4,maxPackets:1,maxPairs:4});
    if(field?.then){field.catch?.(()=>{});throw new TypeError('Field creation must be synchronous');}
    if(field?.prepare?.constructor?.name==='AsyncFunction')throw new TypeError('Field preparation must be synchronous');
    const result=field?.prepare?.(input);
    if(result?.then){result.catch?.(()=>{});throw new TypeError('Field preparation must be synchronous');}
    if(!result?.effective){report.reason=result?.reason??'field-unavailable';return report;}
    const target=field.target;
    if(!target?.isWebGLRenderTarget||target.width!==4||target.height!==1||target.texture?.type!==THREE.FloatType||target.texture?.format!==THREE.RGBAFormat||target.samples!==0||result.texture!==target.texture)throw new Error('Sanity field must provide its own4x1RGBA32F nonMSAA target');
    renderer.xr&&(renderer.xr.enabled=false);renderer.autoClear=false;renderer.setRenderTarget(target);renderer.setScissorTest(false);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.pixelStorei(gl.PACK_ALIGNMENT,4);gl.pixelStorei(gl.PACK_ROW_LENGTH,0);gl.pixelStorei(gl.PACK_SKIP_PIXELS,0);gl.pixelStorei(gl.PACK_SKIP_ROWS,0);
    if(gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Sanity read framebuffer incomplete');
    const pixels=new Float32Array(16);pixels.fill(NaN);
    report.readbackCalls++;report.readbackBytes+=pixels.byteLength;gl.readPixels(0,0,4,1,gl.RGBA,gl.FLOAT,pixels);
    let maximumError=0;const rows=[];
    for(let i=0;i<4;i++){
      const actual=Array.from(pixels.subarray(i*4,i*4+4)),finite=actual.every(Number.isFinite),range=actual.slice(0,3).every(x=>x>=0&&x<=1),alpha=actual[3]===1,error=Math.max(...actual.slice(0,3).map((x,c)=>Math.abs(x-expected[i][c])));
      maximumError=Math.max(maximumError,error);rows.push({actual,expected:expected[i],error});report.checks.push({name:'ray'+i,passed:finite&&range&&alpha&&error<=report.tolerance,finite,range,alpha,error});
    }
    report.rows=rows;report.maximumTError=maximumError;report.supported=report.checks.every(x=>x.passed);report.reason=report.supported?'tiny-hardware-sanity-passed':'tiny-numerical-check-failed';
  }catch(error){report.reason='support-check-failed';report.errors.push(errorText(error));}
  finally{
    if(saved){try{restoreState(THREE,renderer,gl,saved);report.stateRestored=true;}catch(error){report.stateRestored=false;report.errors.push('restore: '+errorText(error));report.reason='state-restore-failed';}}
    if(field){try{field.dispose?.();report.disposed=true;}catch(error){report.errors.push('dispose: '+errorText(error));report.reason='field-dispose-failed';}}
    if(saved&&report.stateRestored){try{report.stateRestored=stateEquals(saved,captureState(THREE,renderer,gl));if(!report.stateRestored)report.reason='state-restore-mismatch';}catch(error){report.stateRestored=false;report.errors.push('restore validation: '+errorText(error));report.reason='state-restore-failed';}}
    if(gl&&typeof gl.getError==='function'){
      try{report.exitGLErrors=collectGLErrors(gl);if(report.exitGLErrors.length){report.errors.push('exit GL errors: '+report.exitGLErrors.join(','));report.reason='exit-gl-error';}}
      catch(error){report.errors.push('exit GL error check: '+errorText(error));report.reason='gl-error-check-failed';}
    }
    report.passed=report.supported&&report.stateRestored&&report.errors.length===0;
    report.supported=report.passed;
  }
  return report;
}
