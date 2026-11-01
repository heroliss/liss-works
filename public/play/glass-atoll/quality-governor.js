// Resolution governor: use actual GPU time when available, with slow recovery.
// It cannot guarantee a frame rate on arbitrary hardware or under OS contention.
export function createQualityGovernor({onScale,enabled=true,scale=1,minScale=.6,targetFps=60}={}) {
  let current=scale,elapsed=0,cooldown=6,healthy=0,overBudget=0,lastGpu=null,ewma=null,changes=[];
  let recentFrames=[],slowFrames=0,severeFrames=0,lastPacingChange=-Infinity;
  function reset(){elapsed=0;cooldown=3;healthy=0;overBudget=0;ewma=null;lastGpu=null;recentFrames=[];slowFrames=0;severeFrames=0;lastPacingChange=-Infinity;}
  return {
    setEnabled(value){enabled=!!value;reset();if(!enabled&&current!==1){current=1;onScale?.(current);}},
    reset,
    setTargetFps(value){
      const next=Math.max(24,Math.min(120,Number(value)||60));
      if(next!==targetFps){
        // A deliberately larger frame budget should make quality available
        // immediately. Pixel work scales with linear resolution squared.
        const restored=enabled&&next<targetFps?Math.min(1,current*Math.sqrt(targetFps/next)):current;
        targetFps=next;reset();if(restored>current){current=restored;onScale?.(current);}
      }
    },
    update({delta,wallDelta=delta,gpuMs,cpuMs=0,frameMs}){
      if(!enabled||!Number.isFinite(delta)||delta<=0||delta>.08||!Number.isFinite(wallDelta)||wallDelta<=0)return;
      // Physics deliberately clamps long frames, but quality recovery must
      // follow visible wall time. Cap one stall so it cannot force a downscale.
      const wallStep=Math.min(wallDelta,1);
      const pacingDelta=Math.min(wallDelta,.5);
      elapsed+=wallStep;cooldown=Math.max(0,cooldown-wallStep);
      // Startup shader compilation is outside the steady rendering budget.
      if(elapsed<6){ewma=null;return;}
      const cost=Number.isFinite(gpuMs)&&gpuMs>0?Math.max(gpuMs,cpuMs):Math.max(cpuMs,frameMs||0);
      if(!Number.isFinite(cost)||cost<=0)return;
      const budgetScale=60/targetFps;
      if(Number.isFinite(frameMs)&&frameMs>0){
        const frame={slow:frameMs>17.2*budgetScale?1:0,severe:frameMs>150*budgetScale?1:0};
        recentFrames.push(frame);slowFrames+=frame.slow;severeFrames+=frame.severe;
        if(recentFrames.length>120){const expired=recentFrames.shift();slowFrames-=expired.slow;severeFrames-=expired.severe;}
      }
      ewma=ewma===null?cost:ewma+(cost-ewma)*(1.-Math.exp(-pacingDelta/1.5));
      lastGpu=gpuMs;
      if(cooldown>0)return;
      // A fast mean can still miss the 60 Hz presentation budget. Require a
      // persistent slow-frame fraction and meaningful GPU load, not one stall.
      const pacingPressure=recentFrames.length>=90&&slowFrames/recentFrames.length>.04&&ewma>8*budgetScale;
      // Sparse GPU timer samples can be stale while actual presentation is
      // persistently very slow. Eight severe frames distinguish this from a
      // single compile/pause stall without relying on the sampled GPU cost.
      const severePacingPressure=recentFrames.length>=8&&severeFrames/recentFrames.length>=.75;
      // The tail of a smoothed one-off stall is not sustained rendering load.
      overBudget=cost>15.1*budgetScale||pacingPressure||severePacingPressure?overBudget+pacingDelta:0;
      if((ewma>15.1*budgetScale||pacingPressure||severePacingPressure)&&current>minScale){
        if(overBudget<1.8)return;
        const paceOnly=severePacingPressure&&ewma<=15.1*budgetScale;
        const next=Math.max(minScale,Math.round(Math.min(current-.04,pacingPressure||paceOnly?current*.92:current*Math.sqrt(13.4*budgetScale/ewma))*100)/100);
        if(next<current){current=next;if(pacingPressure||severePacingPressure)lastPacingChange=elapsed;changes.push({seconds:+elapsed.toFixed(2),scale:current,costMs:+ewma.toFixed(2),reason:severePacingPressure?'severe frame pacing':pacingPressure?'frame pacing':'GPU budget'});onScale?.(current);cooldown=3;healthy=0;overBudget=0;recentFrames=[];slowFrames=0;severeFrames=0;}
      }else if(ewma<10.8*budgetScale&&current<1&&(elapsed-lastPacingChange>45||ewma<7*budgetScale)){
        healthy+=pacingDelta;
        if(healthy>8){current=Math.min(1,Math.round((current+.025)*1000)/1000);changes.push({seconds:+elapsed.toFixed(2),scale:current,costMs:+ewma.toFixed(2)});onScale?.(current);cooldown=3;healthy=0;}
      }else healthy=0;
    },
    get state(){return {enabled,targetFps,referenceBudgetMs:1000/targetFps,scale:current,minimumScale:minScale,smoothedCostMs:ewma,lastGpuMs:lastGpu,slowFrameFraction:recentFrames.length?slowFrames/recentFrames.length:0,severeFrameFraction:recentFrames.length?severeFrames/recentFrames.length:0,changes:changes.slice(-12)};}
  };
}
