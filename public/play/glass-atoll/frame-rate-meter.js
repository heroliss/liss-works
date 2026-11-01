// Count actual scene draws over wall-clock windows, not idle rAF callbacks.
export function createFrameRateMeter({windowMs=1000}={}){
  if(!Number.isFinite(windowMs)||windowMs<=0)throw new RangeError('Frame-rate window must be positive');
  let start=null,frames=0,wasPaused=null;
  return {
    reset(now){if(!Number.isFinite(now))throw new RangeError('Finite wall-clock time required');start=now;frames=0;wasPaused=null;},
    tick(now,{rendered=false,paused=false}={}){
      if(!Number.isFinite(now))throw new RangeError('Finite wall-clock time required');
      if(start===null||now<start){start=now;frames=0;wasPaused=paused;return{fps:0,paused,warmingUp:!paused,elapsedMs:0,renderedFrames:0};}
      if(paused!==wasPaused){start=now;frames=0;wasPaused=paused;return{fps:0,paused,warmingUp:!paused,elapsedMs:0,renderedFrames:0};}
      if(rendered&&!paused)frames++;
      const elapsedMs=now-start;
      if(elapsedMs<windowMs)return null;
      const result={fps:paused?0:Math.round(frames*1000/elapsedMs),paused,warmingUp:false,elapsedMs,renderedFrames:frames};
      start=now;frames=0;return result;
    }
  };
}
