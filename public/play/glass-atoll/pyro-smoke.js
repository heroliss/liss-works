import {parseSmokeDispersion} from './pyro-smoke-dispersion.js';
import {createPyroSmokeState} from './pyro-smoke-state.js';
import {createPyroSmokeEvents} from './pyro-smoke-events.js';
import {createPyroSmokeTrajectoryEvents} from './pyro-smoke-trajectory-events.js';
import {createPyroSmokeLogicalEvents} from './pyro-smoke-logical-events.js';
import {LOGICAL_BURN_PROFILE} from './pyro-smoke-logical-burn.js';
import {SMOKE_SOURCE_TRANSPORT} from './pyro-smoke-source-moments.js';
import {createPyroSmokeColumns} from './pyro-smoke-columns.js';
import {createPyroSmokeRenderer} from './pyro-smoke-renderer.js';

// Host for one physical state, source event stream and its optical consumers.
// Integration is opt-in; no camera/exposure-dependent physical mass or ageing.
export function createPyroSmoke(THREE,renderer,{time=0,wind=[0,0,0],capacity=4096,sourceModel='legacy9',sourceProvider=null,kernelModel='point',centralFraction=.20,trajectorySlots=12,dispersionModel='brownian',lagrangianSeconds=10,emissionProfile='two-births',groundChargeFraction=.10,projectionMode='legacy-sphere',supportSigma=4,lightFieldBakeMode='serial-reference',lightFieldMaxRequestPairs=null,lightFieldMaxMapPairs=1000000,lightFieldMaxMapDraws=64}={}){
  if(emissionProfile!=='two-births'&&emissionProfile!=='ring-uniform-burn-v1'&&emissionProfile!=='palm-fan-uniform-burn-v1'&&emissionProfile!==LOGICAL_BURN_PROFILE)throw new RangeError('emissionProfile must be two-births,ring-uniform-burn-v1,palm-fan-uniform-burn-v1 or logical-family-continuous-v1');
  parseSmokeDispersion({dispersionModel,lagrangianSeconds});
  if(emissionProfile===LOGICAL_BURN_PROFILE&&(sourceModel!=='trajectory-v1'||kernelModel!=='past-segment-v2'||dispersionModel!=='brownian'))throw new RangeError('Logical profile requires explicit trajectory-v1/past-segment-v2/Brownian');
  if(trajectorySlots!==12&&trajectorySlots!==48)throw new RangeError('trajectorySlots must be12 or48');
  if(sourceModel!=='legacy9'&&sourceModel!=='trajectory-v1')throw new RangeError("sourceModel must be 'legacy9' or 'trajectory-v1'");
  if(sourceModel==='legacy9'&&(kernelModel!=='point'||centralFraction!==.20||trajectorySlots!==12||dispersionModel!=='brownian'||emissionProfile!=='two-births'))throw new RangeError('Source kernel controls require trajectory-v1; legacy9 remains unchanged');
  const sourceStateOptions=sourceModel==='trajectory-v1'?{maxPendingEmissions:8192,...(dispersionModel==='taylor'?{dispersionModel,lagrangianSeconds}:{}),...(kernelModel==='past-segment-v2'?{diffusivity:SMOKE_SOURCE_TRANSPORT.diffusivity,coolSeconds:SMOKE_SOURCE_TRANSPORT.coolSeconds,dragSeconds:SMOKE_SOURCE_TRANSPORT.dragSeconds,ambientKelvin:SMOKE_SOURCE_TRANSPORT.ambientKelvin}: {})}:{};
  let state=createPyroSmokeState({time,wind,capacity,...sourceStateOptions}),currentWind=[...wind],physicalTime=time,snapshot=state.snapshot(),revision=snapshot.revision;
  const events=sourceModel==='legacy9'?createPyroSmokeEvents({state}):emissionProfile===LOGICAL_BURN_PROFILE?createPyroSmokeLogicalEvents({state,sourceProvider,queueCapacity:8192,kernelModel,centralFraction,groundChargeFraction,dispersionModel,transport:SMOKE_SOURCE_TRANSPORT}):createPyroSmokeTrajectoryEvents({state,sourceProvider,queueCapacity:8192,kernelModel,centralFraction,trajectorySlots,dispersionModel,lagrangianSeconds,transport:SMOKE_SOURCE_TRANSPORT,...(emissionProfile==='two-births'?{}:{emissionProfile})}),columns=createPyroSmokeColumns(snapshot),volume=createPyroSmokeRenderer(THREE,renderer,{maxPackets:capacity,projectionMode,supportSigma,lightFieldBakeMode,lightFieldMaxRequestPairs,lightFieldMaxMapPairs,lightFieldMaxMapDraws});
  volume.setState(snapshot);let explicitlyCleared=0,clears=0,lastUpdateMs=0;
  function refresh(){const d=state.diagnostics();if(d.revision===revision)return;const start=performance.now();snapshot=state.snapshot();columns.update(snapshot);volume.setState(snapshot);revision=d.revision;lastUpdateMs=performance.now()-start;}
  return{
    update({time:now,windVector=currentWind,events:sourceEvents=[]}={}){
      if(!Number.isFinite(now)||now<physicalTime)throw new RangeError('Smoke physical time cannot rewind');
      let preparedSources=null;
      if(sourceModel==='trajectory-v1'){
        if(!Array.isArray(windVector)||windVector.length!==3||windVector.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))throw new RangeError('Trajectory wind requires3 finite physical components within1e6');
        const committed=state.diagnostics();if(Math.floor((now-committed.time+1e-9)/committed.fixedStep)>committed.maxStepsPerAdvance)throw new RangeError('Trajectory source update exceeds bounded physical catchup; advance in causal steps');
        preparedSources=events.prepare(sourceEvents,{throughTime:now,windVector});
      }
      if(windVector.some((v,i)=>v!==currentWind[i])){state.setWind({time:now,velocity:windVector});currentWind=[...windVector];}
      if(preparedSources)events.commit(preparedSources);else events.consume(sourceEvents,{throughTime:now});const advanced=state.advanceTo(now);physicalTime=now;refresh();return advanced;
    },
    clear(){
      // Explicit user operation; old mass is accounted for, not an age fade.
      const old=state.diagnostics();explicitlyCleared+=old.ledger.airborne+old.ledger.pendingMass;
      const next=createPyroSmokeState({time:physicalTime,wind:currentWind,capacity,...sourceStateOptions});events.clearForState(next,{time:physicalTime});state=next;snapshot=state.snapshot();revision=snapshot.revision;columns.update(snapshot);volume.setState(snapshot);clears++;
    },
    transmission(origin,endpoint,{reflection=false,planeY=0}={}){
      if(!snapshot.packets.length)return[1,1,1];let start=origin;
      if(reflection){const dy=endpoint[1]-origin[1],t=(planeY-origin[1])/dy;if(!Number.isFinite(t)||t<0||t>1)return[1,1,1];start=origin.map((v,i)=>v+(endpoint[i]-v)*t);}
      return columns.between(start,endpoint).T;
    },
    writeTransmission(origin,endpoint,out,{reflection=false,planeY=0}={}){
      if((!Array.isArray(out)&&!(out instanceof Float64Array))||out.length!==3)throw new TypeError('Transmission output requires Array or Float64Array length3');
      if(!snapshot.packets.length){out[0]=out[1]=out[2]=1;return out;}let start=origin;
      if(reflection){const dy=endpoint[1]-origin[1],t=(planeY-origin[1])/dy;if(!Number.isFinite(t)||t<0||t>1){out[0]=out[1]=out[2]=1;return out;}start=origin.map((v,i)=>v+(endpoint[i]-v)*t);}
      return columns.writeTransmissionBetween(start,endpoint,out);
    },
    setColumnOriginCache(value){return columns.setColumnOriginCache(value);},
    setColumnKernel(value){return columns.setColumnKernel(value);},
    prepareLighting(options){return volume.prepareLighting(options);},
    setProjectionMode(value){return volume.setProjectionMode(value);},
    setSupportSigma(value){return volume.setSupportSigma(value);},
    setLightingBakeMode(value){return volume.setLightingBakeMode(value);},
    render(options){return volume.render(options);},
    get packetCount(){return snapshot.packets.length;},
    getRadianceBound(lighting,options){return snapshot.packets.length?volume.getRadianceBound(lighting,options):{maxRGB:0};},
    // The render cache is keyed by density revision. Empty clocks/wind headers
    // can advance without changing that revision, so public snapshots are live.
    snapshot(){return state.snapshot();},
    diagnostics(){const physical=state.diagnostics();return{requestedPhysicalTime:physicalTime,committedPhysicalTime:physical.time,behindSeconds:Math.max(0,physicalTime-physical.time),state:physical,events:events.diagnostics(),...(sourceModel==='trajectory-v1'?{sourceModel,cancelledReservedArea:events.diagnostics().cancelledReservedArea}:{}),columns:columns.diagnostics(),rendering:volume.diagnostics(),explicitlyCleared,clears,lastUpdateMs,
      limits:['Physical transport uses fixed20Hz state commits; it is not a fluid/turbulence/settling solver.','Source-path extinction is queried at emitter/tail anchors; it is not exact per-pixel convolution through a varying medium.','Whole-space neutral Gaussian medium; scattering, overlap order and clear-air folding retain the renderer StageA approximations.']};},
    dispose(){events.dispose?.();volume.dispose();}
  };
}
