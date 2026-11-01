// Independent depth snapshot for effects that draw into an opaque target.
// Never sample an attached depth image, even when depthWrite is false.
export function createResolvedDepthCopy(THREE,renderer){
  const gl=renderer.getContext();let target=null,copies=0,disposed=false,lastSource=null;
  const save=()=>({target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),
    viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),test:renderer.getScissorTest(),
    actualViewport:renderer.getCurrentViewport(new THREE.Vector4()),actualScissor:Array.from(gl.getParameter(gl.SCISSOR_BOX)),actualTest:gl.isEnabled(gl.SCISSOR_TEST),
    drawFramebuffer:gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),readFramebuffer:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)});
  function restore(s){
    renderer.setViewport(s.viewport);renderer.setScissor(s.scissor);renderer.setScissorTest(s.test);
    const t=s.target,v=t?.viewport.clone(),c=t?.scissor.clone(),test=t?.scissorTest;
    try{if(t){t.viewport.copy(s.actualViewport);t.scissor.fromArray(s.actualScissor);t.scissorTest=s.actualTest;}renderer.setRenderTarget(t,s.face,s.mip);}
    finally{if(t){t.viewport.copy(v);t.scissor.copy(c);t.scissorTest=test;}}
    renderer.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER,s.drawFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,s.drawFramebuffer);
    renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER,s.readFramebuffer);
    // Three's diagnostic readback can change READ_FRAMEBUFFER without updating
    // the cached binding. Force the observed entry state as well as its cache.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,s.readFramebuffer);
  }
  function allocate(source){
    if(target&&target.width===source.width&&target.height===source.height&&target.depthTexture.type===source.depthTexture.type&&target.depthTexture.format===source.depthTexture.format&&target.depthTexture.internalFormat===source.depthTexture.internalFormat&&target.stencilBuffer===!!source.stencilBuffer)return;
    target?.dispose();
    const depth=new THREE.DepthTexture(source.width,source.height,source.depthTexture.type);depth.format=source.depthTexture.format;depth.internalFormat=source.depthTexture.internalFormat;
    depth.minFilter=depth.magFilter=THREE.NearestFilter;depth.generateMipmaps=false;
    target=new THREE.WebGLRenderTarget(source.width,source.height,{type:THREE.UnsignedByteType,format:THREE.RGBAFormat,depthTexture:depth,depthBuffer:true,stencilBuffer:!!source.stencilBuffer});
    target.texture.name='Unused color attachment for independent depth blit';target.texture.generateMipmaps=false;target.texture.minFilter=target.texture.magFilter=THREE.NearestFilter;
    target.depthTexture.name='Resolved opaque depth snapshot, never attached while sampled';
  }
  return{
    copy(source){
      if(disposed)throw new Error('Depth copy is disposed');
      if(!source?.isWebGLRenderTarget||!source.depthTexture||!source.depthBuffer||source.isWebGLCubeRenderTarget||source.texture?.isData3DTexture||source.texture?.isDataArrayTexture)throw new TypeError('Depth snapshot requires a 2D render target with a depth texture');
      if(source===target)throw new Error('Cannot copy a depth snapshot into itself');
      const s=save();
      if(s.target===target)throw new Error('Release the owned depth snapshot target before updating it');
      try{
        allocate(source);renderer.setRenderTarget(source);const sourceFramebuffer=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
        // setRenderTarget selects the live multisample FBO when Three uses
        // renderbuffers, or the extension-managed FBO with automatic RTT.
        // Use the actual framebuffer, not source.samples or its resolved texture.
        const sourceSamples=gl.getParameter(gl.SAMPLES),sourceStatus=gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER);
        if(sourceStatus!==gl.FRAMEBUFFER_COMPLETE)throw new Error(`Depth snapshot source framebuffer is incomplete: ${sourceStatus}`);
        renderer.setRenderTarget(target);renderer.setScissorTest(false);
        const destinationSamples=gl.getParameter(gl.SAMPLES),destinationStatus=gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER);
        if(destinationStatus!==gl.FRAMEBUFFER_COMPLETE||destinationSamples!==0)throw new Error(`Depth snapshot destination is not a complete single-sample framebuffer: ${destinationStatus}/${destinationSamples}`);
        renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER,sourceFramebuffer);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER,sourceFramebuffer);
        // WebGL2 depth resolve requires equal rectangles, matching depth storage
        // and NEAREST. Destination allocation preserves depth type/format;
        // DEPTH_BUFFER_BIT alone leaves both source and destination colors intact.
        gl.blitFramebuffer(0,0,source.width,source.height,0,0,target.width,target.height,gl.DEPTH_BUFFER_BIT,gl.NEAREST);
        lastSource={requestedSamples:source.samples,actualSamples:sourceSamples,destinationSamples,sourceStatus,destinationStatus,depthType:source.depthTexture.type,depthFormat:source.depthTexture.format};
        copies++;return target.depthTexture;
      }finally{restore(s);}
    },
    get target(){return target;},get state(){return{copies,width:target?.width??0,height:target?.height??0,samples:0,lastSource:lastSource?{...lastSource}:null,method:'WebGL2 same-size NEAREST depth blit/resolve from the actual draw framebuffer into an independent single-sample depth attachment',limits:['2D depth targets only; matching depth type/format and dimensions are retained. Multisample sample selection follows the implementation depth resolve.','Caller supplies the actual matching camera/projection. Depth storage is copied without reconstruction or a near/far approximation.']};},
    dispose(){if(disposed)return;disposed=true;target?.dispose();target=null;}
  };
}
