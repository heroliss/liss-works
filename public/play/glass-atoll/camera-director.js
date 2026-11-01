// Pure pose controller. The host owns input, camera/OrbitControls writes,
// frustum limits, framing and UI. No clock/weather/exposure/event mutation.
const TAU=Math.PI*2;
const smoother=u=>u*u*u*(u*(u*6-15)+10);
const integratedSmoother=u=>u*u*u*u*(2.5-3*u+u*u);
const mix=(a,b,t)=>a+(b-a)*t;
const mod=(a,n)=>((a%n)+n)%n;
const copyPose=p=>p?{position:p.position.slice(),target:p.target.slice()}:null;
const vec=(value,name)=>{
  const v=Array.isArray(value)||ArrayBuffer.isView(value)?Array.from(value):value&&[value.x,value.y,value.z];
  if(!v||v.length!==3||!v.every(Number.isFinite))throw new TypeError(`${name} must contain three finite world metres`);return v;
};
const number=(value,name,minimum=-Infinity)=>{if(!Number.isFinite(value)||value<=minimum)throw new RangeError(`${name} must be finite and greater than ${minimum}`);return value;};
const norm=v=>Math.hypot(v[0],v[1],v[2]);

export function createCameraDirector({terrainHeight=()=>0,onChange=()=>{}}={}){
  if(typeof terrainHeight!=='function'||typeof onChange!=='function')throw new TypeError('terrainHeight/onChange must be functions');
  let defaults={periodSeconds:240,direction:1,entrySeconds:2},run=null,active=false,elapsed=0,compensation=0,lastPose=null,lastFloorLimited=false,lastFloor=null,reason='not started';
  const floorAt=(x,z)=>{const h=terrainHeight(x,z);if(!Number.isFinite(h))throw new RangeError('terrainHeight must return finite metres');return Math.max(.42,h+.5);};
  function validated(settings){
    const next={...settings};next.periodSeconds=number(next.periodSeconds,'periodSeconds',0);next.entrySeconds=number(next.entrySeconds,'entrySeconds',0);
    if(next.direction!==1&&next.direction!==-1)throw new RangeError('direction must be +1 or -1');return next;
  }
  function sample(){
    if(elapsed===0){lastFloorLimited=false;lastFloor=floorAt(...[run.position[0],run.position[2]]);return copyPose(run);}
    const u=Math.min(1,elapsed/run.entrySeconds),w=smoother(u);
    // Integrating the velocity ramp gives omega*D/2 at the join. Restarting
    // theta=omega*(t-D) there would jump both phase and angular velocity.
    const phaseSeconds=elapsed<run.entrySeconds?run.entrySeconds*integratedSmoother(u):elapsed-run.entrySeconds*.5;
    const phase=run.omega*mod(phaseSeconds,run.periodSeconds),angle=run.angle0+phase;
    const orbit=[run.centre[0]+run.horizontalRadius*Math.sin(angle),run.eyeHeight,run.centre[2]-run.horizontalRadius*Math.cos(angle)];
    const rawPosition=elapsed<run.entrySeconds?run.position.map((v,i)=>mix(v,orbit[i],w)):orbit;
    const position=rawPosition.slice();
    lastFloor=floorAt(position[0],position[2]);lastFloorLimited=position[1]<lastFloor;position[1]=Math.max(position[1],lastFloor);
    let target;
    if(elapsed<run.entrySeconds){
      // Blend the look pose in an unwrapped yaw/pitch chart, rather than
      // lerping target through the eye when starting from an outward view.
      const yaw=mix(run.yaw0,run.orbitYaw0+run.omega*phaseSeconds,w),pitch=mix(run.pitch0,run.orbitPitch,w),distance=mix(run.lookDistance,run.radius,w),cp=Math.cos(pitch);
      target=[rawPosition[0]+Math.sin(yaw)*cp*distance,rawPosition[1]+Math.sin(pitch)*distance,rawPosition[2]-Math.cos(yaw)*cp*distance];
    }else target=run.orbitTarget.slice();
    return{position,target};
  }
  const api={
    configure(patch={}){
      // Defaults only: an active run keeps its frozen path. The host cancels
      // and explicitly starts a new mode; there is never an auto-restart.
      for(const key of Object.keys(patch))if(!['periodSeconds','direction','entrySeconds'].includes(key))throw new TypeError(`Unknown director default ${key}; orbit geometry is supplied to start()`);
      defaults=validated({...defaults,...patch});return{...defaults};
    },
    start(options={}){
      const settings=validated({...defaults,...options}),position=vec(options.position,'position'),target=vec(options.target,'target'),centre=vec(options.centre??[0,0,0],'centre');
      const look=target.map((v,i)=>v-position[i]),lookDistance=norm(look);if(!(lookDistance>1e-6))throw new RangeError('Camera and target must differ');
      const eyeHeight=number(options.eyeHeight??position[1],'eyeHeight'),targetY=number(options.targetY??target[1],'targetY'),orbitTarget=[centre[0],targetY,centre[2]],vertical=eyeHeight-targetY;
      const radius=number(options.radius??Math.hypot(position[0]-centre[0],vertical,position[2]-centre[2]),'radius',Math.abs(vertical));
      const initialFloor=floorAt(position[0],position[2]);if(position[1]<initialFloor-1e-8)throw new RangeError('Initial eye is below terrain +0.5m / sea clearance; host must provide its actual safe pose');
      const dx=position[0]-centre[0],dz=position[2]-centre[2],angle0=Math.hypot(dx,dz)>1e-9?Math.atan2(dx,-dz):0,horizontalRadius=Math.sqrt(Math.max(0,radius*radius-vertical*vertical));
      const yaw0=Math.hypot(look[0],look[2])>1e-9?Math.atan2(look[0],-look[2]):angle0+Math.PI;
      let yawDelta=mod(angle0+Math.PI-yaw0+Math.PI,TAU)-Math.PI;
      // The antipodal tie has a fixed, mode-consistent direction, not a
      // camera-dependent sign flip caused by tiny cross-product roundoff.
      if(Math.abs(Math.abs(yawDelta)-Math.PI)<1e-10)yawDelta=settings.direction*Math.PI;
      run={position,target,centre,eyeHeight,targetY,orbitTarget,radius,horizontalRadius,angle0,yaw0,orbitYaw0:yaw0+yawDelta,pitch0:Math.asin(Math.max(-1,Math.min(1,look[1]/lookDistance))),orbitPitch:Math.atan2(-vertical,horizontalRadius),lookDistance,periodSeconds:settings.periodSeconds,entrySeconds:settings.entrySeconds,direction:settings.direction,omega:settings.direction*TAU/settings.periodSeconds};
      elapsed=compensation=0;active=true;reason='started';lastPose=copyPose(run);lastFloorLimited=false;lastFloor=initialFloor;onChange(api.state);return api.state;
    },
    update({dt=0,paused=false}={}){
      if(!active||paused)return null;
      if(!Number.isFinite(dt)||dt<0)throw new RangeError('dt must be finite nonnegative physical seconds');
      const y=dt-compensation,next=elapsed+y;compensation=(next-elapsed)-y;elapsed=next;
      lastPose=sample();return copyPose(lastPose);
    },
    cancel(why='manual takeover'){
      const changed=active;active=false;reason=String(why);if(changed)onChange(api.state);return changed;
    },
    get state(){
      const u=run?Math.min(1,elapsed/run.entrySeconds):0;
      return{active,elapsedSeconds:elapsed,phase:active?(u<1?'entry':'orbit'):'inactive',reason,periodSeconds:run?.periodSeconds??defaults.periodSeconds,direction:run?.direction??defaults.direction,entrySeconds:run?.entrySeconds??defaults.entrySeconds,orbitAngularVelocityRadiansPerSecond:active?run.omega*smoother(u):0,orbitAngularAccelerationRadiansPerSecondSquared:active&&u<1?run.omega*30*u*u*(1-u)*(1-u)/run.entrySeconds:0,radiusMetres:run?.radius??null,horizontalRadiusMetres:run?.horizontalRadius??null,eyeHeight:run?.eyeHeight??null,target:run?.orbitTarget.slice()??null,pose:copyPose(lastPose),floorLimited:lastFloorLimited,minimumEyeY:lastFloor,defaults:{...defaults},limits:['Host must stop navigation and cancel other pose writers before start, and allow the requested OrbitControls distance/target bounds.','Entry is C2 from a stationary pose when the terrain safety clamp is inactive. A floor contact can introduce a kink.','Terrain +0.5m and sea clearance .42m only; no tree/fixture collision solver or automatic visibility/framing guarantee.','Physical dt only; astronomical UTC, events, focal length, exposure and weather are not read or changed.']};
    },
  };
  return api;
}
