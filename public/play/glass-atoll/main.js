import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWater } from './water.js';
import { createVegetation } from './vegetation.js';
import { initUI } from './ui.js';
import { waveGLSL, waveComponents,waveWindFactor,sanitizeSeaState } from './waves.js';
import { createWaveSpectrum } from './spectral-waves.js';
import { createCaustics } from './caustics.js';
import { createHydrodynamics } from './hydrodynamics.js';
import { createFloatingLeaves } from './floating-leaves.js';
import { createSand } from './sand.js';
import { createCameraNavigation } from './camera-navigation.js';
import { planCameraTransition } from './camera-transition.js';
import { createFrameRateMeter } from './frame-rate-meter.js';
import { createCameraExposure } from './camera-exposure.js';
import { checkSmokeTransmissionSupport } from './smoke-transmission-admission.js';
import { createCameraDirector } from './camera-director.js';
import { createStoneThrow } from './stone-throw.js';
import { resolveWaterImpact } from './water-impact.js';
import { DEFAULT_WATER_CLARITY,validateWaterClarity } from './water-optics.js';
import { estimateLeafSurface } from './floating-leaves.js';
import { createLens } from './lens.js';
import { createQualityGovernor } from './quality-governor.js';
import { createRenderBenchmark } from './render-benchmark.js';
import { createAtmosphere } from './sky.js';
import { applyCloudLighting,createCloudShadowCache } from './cloud-lighting.js';
import { createIndirectLighting } from './indirect-lighting.js';
import { createShadowQuality } from './shadow-quality.js';
import { sunShadowGLSL } from './sun-shadows.js';
import { createHDROutput,fetchDisplayHDR } from './hdr-output.js';
import {resolveObservedHDRCalibration} from './hdr-screen-selection.js';
import { createDisplayTransform } from './display-transform.js';
import { createSoundscape } from './audio.js';
import { createSplash } from './splash.js';
import { createAerialPerspective,marineAirCoefficients } from './aerial-perspective.js';
import { createCelestialController,exactCelestialEphemeris } from './celestial-controller.js';
import { createSceneRadiometry,RAW_PER_CANDELA } from './scene-radiometry.js';
import { createLocalLights } from './local-lights.js';
import { createEnvironmentLocalLights } from './environment-local-lights.js';
import { createEnvironmentCapture } from './environment-capture.js';
import { createFireworks } from './fireworks.js';
import {createAtollAirSurface} from './firework-surface.js';
import { getFireworkShowEnvelope } from './firework-show-envelope.js';
import { createPyroSmoke } from './pyro-smoke.js';
import { createSmokeTransmissionGPU } from './pyro-smoke-transmission-gpu.js';
import { planJointSmokeWork } from './smoke-joint-work.js';
import { createResolvedDepthCopy } from './depth-copy.js';
import { createFireworkEvent,sampleBody,sampleFireworkEvent } from './fireworks-physics.js';
import { createFireworksAudio } from './fireworks-audio.js';
import { DEFAULT_QUALITY,getQualityPreset,resolveQualityPreset } from './quality-presets.js';
import { fitPerspectiveBounds } from './camera-framing.js';
import {islandCelestialView,keepIslandInPreset,islandFireworksView} from './island-view-framing.js';
import {resolveSmokeMode,createSmokeEpochAdmission} from './smoke-runtime-policy.js';
import {validateAutomaticShow} from './firework-auto-show.js';

const parameters={sun:{azimuth:100,elevation:48,intensity:1},quality:'high',paused:false,sound:true,wind:1.8,current:.16,lens:{focal:28,aperture:8,exposure:0,dof:false,vignette:true,antialias:'smaa',automatic:false,firelightAA:true}};
parameters.lens.manualExposureEV=0;
parameters.lens.temporal=true;
parameters.lens.glintAA=true;
parameters.weather={humidity:.68,temperature:29,cloudBase:'auto',thickness:950,coverage:.35,shear:1.1};
parameters.air={enabled:true,aerosolScale:8,shadows:true};
parameters.graphics={indirect:'low',shadows:'recommended',targetFps:60,hdr:false,hdrMode:'auto',displayName:'auto',systemCalibration:true,peakNits:1000,paperWhiteNits:203,displayTransform:'legacy'};
parameters.sea={swellHeight:.16,windSea:1};
parameters.director={mode:'off',periodSeconds:240};
parameters.lens.opticalBloom=true;parameters.lens.opticalBloomStrength=.75;parameters.lens.opticalFlare=false;parameters.lens.focusMode='target';parameters.lens.focusDistance=60;
parameters.graphics.waveResolution=512;
parameters.qualityPreset=DEFAULT_QUALITY;parameters.renderSampling=getQualityPreset(DEFAULT_QUALITY).request;parameters.qualityCustom=false;
let renderer,scene,camera,controls,water,grove,sky,sunLight,hemi,pmrem,environmentTarget,skyCubeTarget,cubeCamera,caustics,hydrodynamics,floatingLeaves,sand;
let kernelBudgetFloat32=false;
let time=0,fps=0,transition=null,environmentTimer,pauseTargetTime=null,transientIndirectEnabled=true;
let showcaseRequest=0,showcaseCameraApplying=false;
const frameRateMeter=createFrameRateMeter();
const sunDirection=new THREE.Vector3(),keyDirection=new THREE.Vector3();
const clock=new THREE.Clock();
const size=new THREE.Vector2();
const raycaster=new THREE.Raycaster(),seaPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const pointer=new THREE.Vector2(),hit=new THREE.Vector3();
const fish=[];
let splashes,stoneThrow,pendingThrow,focusPicking=false,navigation,cameraDirector,directorPlan=null,leafLocatorUntil=0;
let seaParametersApplied=false;
let soundscape,atmosphere,environmentScene;
let cloudShadowCache,indirectLighting,shadowQuality,hdrOutput,displayTransform,displayReport=null,hdrCalibration=null,lastDisplaySignature=null,refreshingDisplay=null;
let displaySettingsApplying=false,displaySettingsPending=false,displayRefreshPending=false,lastDisplayObservationKey=null;
let nightSettings={date:'2026-10-26T22:00',autoExposure:true},lastSolarExposure=null;
const qaTransmissionLayoutReports=Object.create(null);
let celestialController,celestialFrame,localLights,environmentLocalLights,environmentCapture,fireworks,fireworksAudio,pyroSmoke,reflectionDepthCopy,frameSnapshot=null,qualityApplying=false,throwGesture=null,qaRenderLock=false,qaSmokeVariants=null;
let qaSmokeTransmissionField=null,qaSmokeTransmissionAdmission=null,qaSmokeTransmissionInput=null;
let smokeGPURequested=true,smokeGPUSupport=null;
// Opt-in integration pilot. No default capacity or presentation change.
let jointSmokePilot=false,jointSmokePending=null,jointSmokeActive=null,jointSmokeFault=null,jointSmokeLast=null,qaSmokeReviewProfile='production';
const smokeWorkPolicy=()=>jointSmokePilot?{maxRequestPairs:12000000,maxMapPairs:1000000,maxMapDraws:16}:{maxRequestPairs:4000000,maxMapPairs:1000000,maxMapDraws:8};
const radiometry=createSceneRadiometry(),cameraExposure=createCameraExposure();let exposureResetPending=true,lastExposureUI=-Infinity;let adaptedCameraEV=null,qaCameraExposureEV=null,lastUIUpdate=-1,lastFramedLaunches=0;
let qaSmokeTransmissionMode='fast';const qaSmokeLegacyMedia=new WeakMap();
const fireworksSettings={type:'peony',autoLaunch:false,autoDirection:true,azimuth:110,elevation:78,autoFrame:false,smokeQuality:'light',persistentSmoke:false,cloudIllumination:true,resolvedSmokeLighting:false,intensityScale:1,intervalSeconds:7.5,randomIntervals:true,intervalMinSeconds:1,intervalMaxSeconds:5,randomLaunchTilt:true,automaticTiltMinDegrees:-40,automaticTiltMaxDegrees:40,launchSpreadDegrees:3,burstTiltDegrees:12,burstRollDegrees:8,starDragModel:'bounded-descent',clusterModel:'moments',finiteClusterPhase:true};
const smokeEpochAdmission=createSmokeEpochAdmission();
let smokeLightStatus={requestedEnabled:false,effective:false,supported:true,reason:null};
let waveSpectrum;
let causticQuality='high';
let lastCubeTime=-1,lastPmremTime=-1,cubeFace=0;
const audioForward=new THREE.Vector3();
let shoreline=[];
const acousticWaves=waveComponents.filter(w=>w.k<12).map(w=>({...w,dx:Math.cos(w.angle),dz:Math.sin(w.angle),omega:Math.sqrt((9.81*w.k+.000070244*w.k**3)*Math.tanh(Math.min(w.k*3,4)))}));
let inspection;
let gpuTimer,gpuMs=null,frameIndex=0,graphicsContextInterrupted=false;
let lastShadowTime=-1;
let effectiveWind=1.8;
let lens,governor,aerialPerspective,renderScale=1,lastAirMieScale=null;
let renderBenchmark,nextGpuFrame=0,frameProbe=null;
let activeFrameProfile=null,qaFrozenWorkload=false,qaFrozenGuard=null;
let interactionEpoch=0,pauseIntentEpoch=0;
for(const type of ['pointerdown','keydown','wheel','input','change'])document.addEventListener(type,()=>{interactionEpoch++;},{capture:true,passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&qaFrozenGuard){qaFrozenGuard.cancelled=true;renderBenchmark.cancel('Page hidden during measurement; sample discarded');}});
let lastPausedRenderKey=null,pausedSteadyFrames=0,pausedRenderCached=false;
const gpuQueries=[];
const views={
  shore:{position:[-48,12,-40],target:[0,2.5,0]},
  lagoon:{position:[41,4,39],target:[-3,2.6,-3]},
  aerial:{position:[84,84,92],target:[2,-.5,0]},
  stars:{position:[38,2.5,-46],target:[5,26,4]},
  fireworks:{position:[-157,12,-367],target:[24,66,7]},
  moon:{position:[-48,2.5,26],target:[4,36,-2]}
};
Object.assign(views,{sandbar:{position:[42,2.8,-7],target:[10,2,0]},palm:{position:[-18,2.2,14],target:[-4,8,-5]},reef:{position:[72,9,4],target:[10,.5,0]},waterline:{position:[-33,1.25,-23],target:[-8,3,-2]},island:{position:[-65,30,54],target:[2,3,0]}});
const ui=initUI({
  async onQuickTimePreset(id){const result=await setNightPreset(id);if(result===false)return false;await setTime({running:false});ui.syncTime({preset:id});return result;},
  onShowcase(id){return applyShowcase(id);},
  onTimeChange(value){showcaseRequest++;return setTime(value);},
  onTimePreset(name){return setNightPreset(name);},
  onLocationChange(value){return setTime(value);},
  onWeatherPreset(name){return setWeatherPreset(name);},
  onQualityPreset(id){return applyQualityPreset(id);},
  onLampChange(value){localLights?.configure(value);refreshLocalSettings();},
  onLampMode(mode){localLights?.configure({mode});refreshLocalSettings();},
  onFlashlightChange(value){localLights?.configure({flashlight:value});refreshLocalSettings();},
  onFireworksChange(value){return configureFireworksSettings(value);},
  onDirectorChange(value){return setDirector(value);},
  onLaunchFirework(){return launchFirework();},
  onRandomFirework(){return launchFirework({randomType:true});},
  onStopFireworks(){const result=configureFireworksSettings({autoLaunch:false});fireworks?.stop();return result;},
  onClearSmoke(){clearSmoke();},
  onSmokeGPUChange(enabled){return setSmokeGPUEnabled(enabled);},
  onFocusPick(){focusPicking=true;renderer.domElement.focus({preventScroll:true});renderer.domElement.style.cursor='crosshair';ui.notify('点选希望清晰的物体；Esc 取消');},
  onRestorePivot(){navigation?.restorePivot();},
  onHome(){navigation?.stop();moveTo('shore');},
  onNightPreset(name){return setNightPreset(name);},
  onNightChange(value){return setNightScene(value);},
  onRefreshDisplay(){return refreshDisplay();},
  onGraphicsChange(value){return setGraphics(value);},
  onSeaChange(value){setSea(value);},
  onSunChange(value){Object.assign(parameters.sun,value);if(celestialController)celestialFrame=celestialController.configure({mode:'artistic'});setSun();syncTimeUI();},
  onView(name){moveTo(name);},
  async onReset(){nightSettings.autoExposure=true;ui.setNight({autoExposure:true});await setNightPreset('day');moveTo('shore');},
  onQuality(value){return applyQualityPreset(value==='balanced'?'balanced':'high');},
  onLensChange(value){configureLensSettings(value,{markQuality:true});},
  onPause(value){pauseIntentEpoch++;parameters.paused=value;if(value)pauseTargetTime=null;},
  async onSound(value){parameters.sound=value;try{await setSound(value);}catch(error){parameters.sound=false;ui.syncSound(false);await setSound(false);throw error;}},
  onDrop(){throwFromCamera(null,.45);},
  onWind(value){parameters.wind=value;},
  onCurrent(value){parameters.current=value;setCurrent();},
  onFloat(){return floatAtVisibleWater();},
  onFindLeaf(){return focusLeaf();},
  onWeatherChange(value){setWeather(value);},
  onAirChange(value){Object.assign(parameters.air,value);lens?.resetTemporalHistory('air parameters');setAir();},
  onScreenshot(){savePhoto();}
});

// A rounded coral cay with a long, asymmetric sand tongue and submerged shelf.
// The exact same function is used by planting, ray picking and the mesh.
export function terrainHeight(x,z){
  const xx=x+1.5, zz=z+1;
  const a=Math.atan2(zz/19,xx/30);
  let r=Math.hypot(xx/30,zz/19);
  r*=1.+.045*Math.sin(a*3.+.8)+.028*Math.cos(a*5.-1.2)+.017*Math.sin(a*9.);
  let h;
  if(r<1.25) h=1.30-1.30*Math.pow(r,2.25);
  else h=-.85-(r-1.25)*3.7;
  // Keep a broad pale lagoon shelf, before the reef falls away to deeper blue.
  h-=Math.max(0.,r-2.7)*5.;
  const spit=.65-((x-26.)*(x-26.)/330.+(z-7.)*(z-7.)/72.);
  h=Math.max(h,spit);
  h+=.027*Math.sin(x*1.1+z*.27)*Math.sin(z*.82-x*.21)*Math.exp(-Math.max(0.,r-1.)*.8);
  return Math.max(-32,h);
}

const noiseGLSL=/* glsl */`
  float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+1.),f.x),f.y);}
  float fb(vec2 p){float f=0.;float a=.5;for(int i=0;i<5;i++){f+=a*n2(p);p=mat2(1.6,-1.2,1.2,1.6)*p;a*=.5;}return f;}
`;

async function init(){
  // Geometry MSAA is on the HDR scene target. The final full-screen quad does
  // not need a second multisampled canvas or a preserved swap-chain buffer.
  renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});
  const glPrecision=renderer.getContext();
  kernelBudgetFloat32=[glPrecision.VERTEX_SHADER,glPrecision.FRAGMENT_SHADER].every(stage=>{const p=glPrecision.getShaderPrecisionFormat(stage,glPrecision.HIGH_FLOAT);return p&&p.precision>=23&&p.rangeMin>=126&&p.rangeMax>=127;});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.76;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  renderer.shadowMap.needsUpdate=true;
  gpuTimer=renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2');
  renderer.domElement.setAttribute('aria-label','热带玻璃海。WASD或方向键平移，QE旋转，RF俯仰，Shift加速。右拖自由看，左拖环绕，Alt点击移动中心，Home还原。点击海面投石。');
  renderer.domElement.tabIndex=0;
  document.querySelector('#scene').appendChild(renderer.domElement);
  scene=new THREE.Scene();
  // Finite camera-to-surface atmospheric transport is applied once after the
  // HDR scene, for land, foliage and water alike. No fixed-colour fog layer.
  camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.15,120000);
  camera.filmGauge=36;camera.setFocalLength(parameters.lens.focal);
  camera.position.fromArray(views.shore.position);
  controls=new OrbitControls(camera,renderer.domElement);
  controls.target.fromArray(views.shore.target);
  controls.enableDamping=true;controls.dampingFactor=.065;
  controls.minDistance=.75;controls.maxDistance=230;
  controls.minPolarAngle=.03;controls.maxPolarAngle=Math.PI-.06;
  controls.maxTargetRadius=1500;
  controls.panSpeed=.45;controls.rotateSpeed=.46;controls.zoomSpeed=.7;
  controls.screenSpacePanning=true;
  cameraDirector=createCameraDirector({terrainHeight});
  controls.addEventListener('start',manualCameraActivity);
  renderer.domElement.addEventListener('pointerdown',()=>stopDirector('pointer takeover'),{capture:true});
  navigation=createCameraNavigation(THREE,{camera,controls,canvas:renderer.domElement,onActivity:manualCameraActivity});
  lens=createLens(renderer,camera);
  await lens.ready;
  hdrOutput=await createHDROutput(THREE,renderer,{maxHz:120,onStateChange(info){if(displaySettingsApplying)return;parameters.graphics.hdr=info.enabled;ui.setHDRSupport(info);lastPausedRenderKey=null;}});
  lens.setHDROutput(hdrOutput);ui.setHDRSupport(hdrOutput.state);
  displayTransform=createDisplayTransform(THREE,renderer,{onStateChange(info){if(displaySettingsApplying)return;ui.setDisplayTransformState(info);hdrOutput?.requestRedraw();lastPausedRenderKey=null;}});
  lens.setDisplayTransform(displayTransform);hdrOutput.setDisplayTransform(displayTransform);
  displayReport=await fetchDisplayHDR();await applyDisplaySettings();
  governor=createQualityGovernor({onScale(value){renderScale=value;resize();}});
  renderBenchmark=createRenderBenchmark(()=>({viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,renderScale,lens:lens.state,water:water?.diagnostics?.(),spectrum:waveSpectrum?.state,performance:governor.state,parameters:structuredClone(parameters),atmosphere:atmosphere?.diagnostics(),audio:soundscape?.state,camera:camera.position.toArray(),target:controls.target.toArray()}));
  setLens();
  ui.setStats({loading:'展开真实晴空…'});
  atmosphere=createAtmosphere(THREE,{sunDirection,cloudSteps:64,cloudCoverage:.35,weather:parameters.weather});
  atmosphere.setCloudBaseContinuity(1);
  // A clear initial location in the same 3-D weather field. This is set once;
  // subsequent advection/evolution can bring these clouds over the island.
  atmosphere.uniforms.uCloudWeatherOrigin.value.set(.421875,.734375);
  await atmosphere.ready;
  celestialController=createCelestialController({utcMs:Math.floor(Date.now()/86400000)*86400000+(12-118.6/15)*3600000,latitude:4.5,longitude:118.6,rate:1,running:true,mode:'astronomical'});
  celestialFrame=celestialController.state;atmosphere.setCelestial(celestialFrame);atmosphere.setStorageExposureEV(0);
  sky=atmosphere.mesh;scene.add(sky);
  // Its vertex shader writes far depth (z=w). Draw after opaque geometry so
  // early depth rejection avoids marching atmosphere hidden by sea and sand.
  sky.renderOrder=10000;
  hemi=new THREE.HemisphereLight('#c8e9ff','#b6a78a',.65);hemi.layers.enable(1);scene.add(hemi);
  sunLight=new THREE.DirectionalLight('#fff5df',3.65);
  sunLight.castShadow=true;
  sunLight.shadow.autoUpdate=false;sunLight.shadow.needsUpdate=true;
  sunLight.layers.enable(1);
  sunLight.shadow.mapSize.set(4096,4096);
  Object.assign(sunLight.shadow.camera,{left:-50,right:50,top:45,bottom:-40,near:1,far:260});
  sunLight.shadow.normalBias=.035;sunLight.shadow.bias=-.00012;
  sunLight.shadow.radius=2;
  scene.add(sunLight);
  scene.add(sunLight.target);
  localLights=createLocalLights(THREE,{scene,terrainHeight});
  environmentLocalLights=createEnvironmentLocalLights(THREE,localLights);
  environmentCapture=createEnvironmentCapture(THREE,renderer,{atmosphere,onPublish(info){skyCubeTarget=info.cubeTarget;environmentTarget=info.environmentTarget;scene.environment=info.environmentTexture;if(water)water.uniforms.uSkyCube.value=info.cubeTexture;}});
  applySolarLighting();environmentCapture.initialize({time,utcMs:celestialFrame.utcMs,storageEV:0,physicalRevision:celestialFrame.physicalSkyRevision,sunDirection:celestialFrame.sunDirection});
  skyCubeTarget=environmentCapture.cubeTarget;environmentTarget=environmentCapture.environmentTarget;
  ui.setStats({loading:'让阳光穿过浅海…'});
  const loader=new THREE.TextureLoader();
  const textures=await Promise.all(['clean-sand/sand_02_diff_2k.jpg'].map(name=>loader.loadAsync(`./assets/${name}`)));
  textures.forEach(t=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),12);});
  textures[0].colorSpace=THREE.SRGBColorSpace;
  grove=createVegetation(THREE,{terrainHeight,seed:40219});
  // Select the transported rest geometry before fitting shadows or sampling
  // GI emitters. Diagnostic switching later requires GI off explicitly.
  grove.userData.setPalmFrameMode('transport');scene.add(grove);
  grove.userData.sunDirection.value.copy(keyDirection);
  grove.userData.sunColor?.value.copy(sunLight.color);
  if(grove.userData.windStrength)grove.userData.windStrength.value=parameters.wind;
  shadowQuality=createShadowQuality(THREE,renderer,sunLight,grove);
  indirectLighting=createIndirectLighting(THREE,{terrainHeight,grove,sunLight,atmosphere,quality:parameters.graphics.indirect});
  makeCoralAndShells();
  updateEnvironment();
  cloudShadowCache=createCloudShadowCache(renderer,atmosphere);cloudShadowCache.update(time,true);
  aerialPerspective=createAerialPerspective(THREE,renderer,{camera,atmosphere,sunLight,localLights:environmentLocalLights});
  lens.setAerialPerspective(aerialPerspective);setAir();
  ui.setStats({loading:'让潮流绕过沙洲…'});
  hydrodynamics=createHydrodynamics(THREE,renderer,{terrainHeight,extent:72,resolution:384});
  waveSpectrum=createWaveSpectrum(THREE,renderer,{resolution:parameters.graphics.waveResolution});waveSpectrum.update(0,true);
  water=createWater(renderer,scene,camera,keyDirection,{terrainHeight,skyCube:skyCubeTarget.texture,sandTexture:textures[0],atmosphere,waveSpectrum,sunLight,indirectLighting,localLights:environmentLocalLights});
  Object.assign(water.uniforms,hydrodynamics.uniforms);
  water.uniforms.uHydroEnabled.value=1;
  setCurrent();setSea(parameters.sea);
  water.uniforms.uIntensity.value=1;
  water.uniforms.uSunIrradiance.value=sunLight.intensity;
  water.uniforms.uSunColor.value.copy(sunLight.color);
  caustics=createCaustics(THREE,renderer,{waveGLSL,uniforms:water.uniforms,terrainHeight,sunDirection:keyDirection,extent:64,gridSegments:parameters.renderSampling.causticsGrid,textureSize:parameters.renderSampling.causticsSize,heightmapSize:1024,maxHz:parameters.renderSampling.causticsHz});
  water.uniforms.uCaustic.value=caustics.texture;
  water.uniforms.uCausticExtent.value=caustics.extent;
  caustics.update(0,true);
  makeTerrain(textures);
  Object.assign(water.uniforms,sand.albedoUniforms);
  floatingLeaves=createFloatingLeaves(scene,{uniforms:water.uniforms,hydrodynamics,terrainHeight});
  stoneThrow=createStoneThrow(THREE,{scene,onImpact:dropStone,terrainHeight,surfaceHeight:(x,z,t)=>estimateLeafSurface(water.uniforms,x,z,t)});
  splashes=createSplash(THREE,{scene,uniforms:water.uniforms,sunDirection:keyDirection,sampleSurfaceHeight:(x,z,t)=>estimateLeafSurface(water.uniforms,x,z,t)});
  fireworks=createFireworks(THREE,{terrainHeight,airSurface:createAtollAirSurface(terrainHeight),origin:[29,0,7],seed:14271,trailIntegration:'adaptive',sweptSourceVisibility:kernelBudgetFloat32,simulationOptions:{referenceBrightnessGain:64,maxActive:32}});scene.add(fireworks.rig);configureFireworksSettings(fireworksSettings);
  pyroSmoke=createRuntimeSmoke();reflectionDepthCopy=createResolvedDepthCopy(THREE,renderer);
  scene.traverse(object=>{if(object.isMesh){for(const material of Array.isArray(object.material)?object.material:[object.material])applyCloudLighting(material,atmosphere);}});
  applyCloudLighting(floatingLeaves.material,atmosphere);
  applyCloudLighting(stoneThrow.material,atmosphere);indirectLighting.apply(stoneThrow.material);indirectLighting.apply(floatingLeaves.material);
  scene.traverse(object=>{if(object.isMesh)for(const material of Array.isArray(object.material)?object.material:[object.material])indirectLighting.apply(material);});
  scene.traverse(object=>{if(object.isMesh)for(const material of Array.isArray(object.material)?object.material:[object.material])localLights.apply(material);});
  await indirectLighting.ready;
  updateIndirect(true);
  shoreline=createShoreline();
  soundscape=createSoundscape({shoreline,palmPosition:[-7,10,-2],onWarning:message=>console.warn(message)});
  fireworksAudio=createFireworksAudio({getContext:()=>soundscape.context,getOutput:()=>soundscape.eventOutput,isEnabled:()=>soundscape.state.enabled,getListenerPosition:()=>camera.position.toArray(),onWarning:message=>console.warn(message)});
  const startDefaultSound=()=>{
    if(!parameters.sound||document.hidden||graphicsContextInterrupted)return;
    // Do not await autoplay: a browser may keep resume pending until interaction.
    setSound(true).catch(error=>{
      if(error.name==='NotAllowedError')return;
      console.warn('Atoll default sound:',error);
      if(parameters.sound){parameters.sound=false;ui.syncSound(false);setSound(false).catch(()=>{});}
    });
  };
  const resumeDefaultSound=event=>{
    if(event.target?.closest?.('#sound')||!parameters.sound||soundscape.context?.state==='running')return;
    startDefaultSound();
  };
  document.addEventListener('pointerdown',resumeDefaultSound,{capture:true,passive:true});
  document.addEventListener('keydown',resumeDefaultSound,{capture:true});
  startDefaultSound();
  lens.setEffectsRenderer(drawFiniteEffects);water.setEffectsRenderer(drawFiniteEffects);
  await applyQualityPreset(parameters.qualityPreset);
  updateScenePhotometry(0,true);syncTimeUI();refreshLocalSettings();ui.syncFireworks(fireworksSettings);setSmokeGPUEnabled(smokeGPURequested);
  document.addEventListener('visibilitychange',()=>{const paused=parameters.paused||document.hidden;soundscape.update({paused});fireworksAudio.update({paused});});
  if(new URLSearchParams(location.search).get('inspect')==='caustic'){
    const inspectScene=new THREE.Scene();
    inspectScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:caustics.texture,toneMapped:false})));
    inspection={scene:inspectScene,camera:new THREE.OrthographicCamera(-1,1,1,-1,0,2)};inspection.camera.position.z=1;
  }
  bindInteraction();
  addEventListener('resize',resize);
  resize();controls.update();
  addEventListener('focus',()=>{if(!document.hidden&&parameters.graphics.hdrMode==='auto')refreshDisplay();});
  matchMedia('(dynamic-range: high)').addEventListener('change',()=>refreshDisplay());
  setInterval(()=>{if(!document.hidden&&parameters.graphics.hdrMode==='auto'&&parameters.graphics.displayName==='auto')refreshDisplay();},30000);
  // A window can move to another screen without resizing. This CPU-only check
  // reuses the native report; unchanged geometry performs no display/GPU work.
  setInterval(pollDisplayObservation,1000);
  // Warm up the real shader programs before dismissing the loading state.
  renderer.compile(scene,camera);
  frame();
  ui.setReady();
  window.__ATOLL__={
    get state(){return {ready:true,time,fps,gpuMs,renderScale,graphicsContextInterrupted,pausedRenderCached,pausedSteadyFrames,parameters:structuredClone(parameters),lens:lens.state,caustics:{quality:causticQuality,gridSegments:caustics.gridSegments,maxHz:caustics.maxHz},performance:governor.state,camera:camera.position.toArray(),target:controls.target.toArray(),ripples:water.uniforms.uRipples.value.map(v=>v.toArray()),triangles:lens.state.sceneStats.triangles,drawCalls:lens.state.sceneStats.calls,leaves:floatingLeaves.state};},
    setMotionEnabled(value){lens.setMotionEnabled(value);},
    navigation(){return navigation.state;},
    celestial(){return celestialController.state;},
    setTime, timePreset:setNightPreset,weatherPreset:setWeatherPreset,
    setWeather,
    photometry(){return {...radiometry.state,frame:frameSnapshot,environment:environmentCapture.state};},
    get diagnosticCameraEV(){return qaCameraExposureEV;},
    setDiagnosticCameraEV(value=null){if(value!==null&&(!Number.isFinite(value)||value<-24||value>24))throw new RangeError('Diagnostic camera EV requires null or a finite value within -24..24');qaCameraExposureEV=value;updateScenePhotometry(0,true);lens.resetTemporalHistory('diagnostic camera exposure');lastPausedRenderKey=null;return {enabled:value!==null,cameraEV:value,scope:'QA-only absolute photography exposure; storage P remains independently safe'};},
    localLights(){return localLights.state;},
    setLocalLights(value){localLights.configure(value);refreshLocalSettings();return localLights.state;},
    async runGroundLampsCheck(){const {runGroundLampsGPUCheck}=await import('./verification/ground-lamps-gpu-check.js');return runGroundLampsGPUCheck(THREE,renderer,createLocalLights);},
    async runRadiativeTransferCheck(){const {runRadiativeTransferGPUCheck}=await import('./verification/radiative-transfer-gpu-check.js');return runRadiativeTransferGPUCheck(THREE,renderer);},
    async runOpticalFlareCheck(){const {runOpticalFlareCheck}=await import('./verification/optical-flare-gpu-check.js');return runOpticalFlareCheck(THREE,renderer);},
    async runOpticalFlareBenchmark(options){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');const saved=parameters.paused;parameters.paused=true;qaRenderLock=true;try{const {runOpticalFlareBenchmark}=await import('./verification/optical-flare-benchmark.js');return await runOpticalFlareBenchmark(THREE,renderer,options);}finally{clock.getDelta();qaRenderLock=false;parameters.paused=saved;lastPausedRenderKey=null;}},
    async runSmokeGaussianCheck(){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runSmokeGaussianGPUCheck}=await import('./verification/pyro-smoke-renderer-gpu-check.js');return await runSmokeGaussianGPUCheck(THREE,renderer);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runDepthCopyCheck(revision=''){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runDepthCopyGPUCheck}=await import('./verification/depth-copy-gpu-check.js?revision='+encodeURIComponent(revision));return await runDepthCopyGPUCheck(THREE,renderer);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runSmokeAirCheck(){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runSmokeAirGPUCheck}=await import('./verification/pyro-smoke-air-gpu-check.js');return await runSmokeAirGPUCheck(THREE,renderer);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runSmokeLocalCheck(){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runSmokeLocalGPUCheck}=await import('./verification/pyro-smoke-local-gpu-check.js');return await runSmokeLocalGPUCheck(THREE,renderer);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runSmokeViewportCheck(){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runSmokeViewportGPUCheck}=await import('./verification/pyro-smoke-viewport-gpu-check.js');return await runSmokeViewportGPUCheck(THREE,renderer,{parentLocked:true});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runSmokeFinitePhaseCheck(){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runSmokeFinitePhaseGPUCheck}=await import('./verification/pyro-smoke-finite-phase-gpu-check.js');return await runSmokeFinitePhaseGPUCheck(THREE,renderer);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runTransientIndirectCheck(){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runTransientIndirectGPUCheck}=await import('./verification/transient-gi-gpu-check.js');return await runTransientIndirectGPUCheck(THREE,renderer,{parentLocked:true});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runResolvedSmokeFieldCheck(options={}){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const [{runResolvedSmokeFieldGPUCheck},{createPyroSmokeLightField},{createPyroSmokeRenderer}]=await Promise.all([import('./verification/pyro-smoke-resolved-field-gpu-check.js'),import('./pyro-smoke-light-field.js'),import('./pyro-smoke-renderer.js')]);return await runResolvedSmokeFieldGPUCheck(THREE,renderer,{...options,createField:createPyroSmokeLightField,createVolume:createPyroSmokeRenderer});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runResolvedSmokeFieldSupplementCheck(){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const [{runResolvedSmokeFieldSupplementGPUCheck},{createPyroSmokeLightField},{createPyroSmokeRenderer}]=await Promise.all([import('./verification/pyro-smoke-resolved-field-supplement-gpu-check.js'),import('./pyro-smoke-light-field.js'),import('./pyro-smoke-renderer.js')]);return await runResolvedSmokeFieldSupplementGPUCheck(THREE,renderer,{createField:createPyroSmokeLightField,createVolume:createPyroSmokeRenderer});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runSmokeFieldZeroCheck(){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const [{runSmokeLightFieldZeroGPUCheck},{createPyroSmokeLightField}]=await Promise.all([import('./verification/pyro-smoke-zero-field-gpu-check.js'),import('./pyro-smoke-light-field.js')]);return await runSmokeLightFieldZeroGPUCheck(THREE,renderer,{createField:createPyroSmokeLightField});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runACES2Check(options={}){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runACES2GPUCheck}=await import('./verification/aces2-gpu-check.js');return await runACES2GPUCheck(THREE,renderer,options);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runACES2StageCheck(options={}){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runACES2StageGPUCheck}=await import('./verification/aces2-stage-gpu-check.js');return await runACES2StageGPUCheck(THREE,renderer,options);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runACES2AtanCheck(options={}){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runACES2AtanCandidateGPUCheck}=await import('./verification/aces2-atan-gpu-check.js');return await runACES2AtanCandidateGPUCheck(THREE,renderer,options);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runACES2OutputCheck(options={}){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const [{runACES2OutputGPUCheck},{createACES2Output}]=await Promise.all([import('./verification/aces2-output-gpu-check.js'),import('./aces2-output.js')]);return await runACES2OutputGPUCheck(THREE,renderer,{...options,createOutput:createACES2Output});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runACES2GeneratedOutputCheck(options={}){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A live renderer with no active GPU diagnostic is required');qaRenderLock=true;try{const [{runACES2GeneratedOutputGPUCheck},{createACES2Output}]=await Promise.all([import('./verification/aces2-generated-output-gpu-check.js'),import('./aces2-output.js')]);return await runACES2GeneratedOutputGPUCheck(THREE,renderer,{...options,createOutput:createACES2Output});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runACES2PinnedRegressionCheck(options={}){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A live renderer with no active GPU diagnostic is required');qaRenderLock=true;try{const [{runACES2OutputGPUCheck},{createACES2Output}]=await Promise.all([import('./verification/r9-aces2-pinned-output-gpu-check.js'),import('./aces2-output.js')]);return await runACES2OutputGPUCheck(THREE,renderer,{...options,createOutput:createACES2Output});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runACES2OutputPerformance(options={}){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const [{runACES2OutputPerformance},{createACES2Output}]=await Promise.all([import('./verification/aces2-output-performance.js'),import('./aces2-output.js')]);return await runACES2OutputPerformance(THREE,renderer,{...options,createOutput:createACES2Output});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runHDRPresentationCheck(options={}){if(qaRenderLock||!parameters.paused)throw new Error('Pause the scene and finish other GPU diagnostics before capturing HDR');const {runHDRPresentedFrameCheck}=await import('./verification/hdr-presented-frame-check.js');return runHDRPresentedFrameCheck({...options,hdrOutput,requestFrame(){hdrOutput.requestRedraw();lastPausedRenderKey=null;}});},
    async runHDRGLFrameTrace(options={}){if(qaRenderLock||!parameters.paused)throw new Error('Pause the scene and finish other GPU diagnostics before tracing HDR');const {runHDRGLFrameTrace}=await import('./verification/hdr-gl-frame-trace.js');return runHDRGLFrameTrace({...options,renderer,hdrOutput,requestFrame(){hdrOutput.requestRedraw();lastPausedRenderKey=null;}});},
    readGLErrors(label='diagnostic'){const gl=renderer.getContext(),errors=[];for(let i=0;i<16;i++){const error=gl.getError();if(error===gl.NO_ERROR)break;errors.push(error);}const program=gl.getParameter(gl.CURRENT_PROGRAM),live=!!program&&gl.isProgram(program);return{label,errors,programLive:live,programDeletePending:live?gl.getProgramParameter(program,gl.DELETE_STATUS):null,vertexArrayLive:gl.isVertexArray(gl.getParameter(gl.VERTEX_ARRAY_BINDING))};},
    async runRadianceRestoreTrace({useBaseline=false}={}){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const [{runRadianceRestoreTrace},{createACES2Output}]=await Promise.all([import('./verification/radiance-restore-trace.js'),import('./aces2-output.js')]);return await runRadianceRestoreTrace(THREE,renderer,water.reflection.texture,water.reflection.width,water.reflection.height,{useBaseline,createOutput:createACES2Output});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runNearPlaneBoundSceneCheck(options={}){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runNearPlaneBoundSceneCheck}=await import('./verification/fireworks/near-plane-scene-check.js');return await runNearPlaneBoundSceneCheck(THREE,renderer,{...options,fireworks,camera,water,optics:currentOptics(),frame:frameSnapshot});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runTrajectorySceneCheck(options={}){const {runPyroTrajectorySceneCheck}=await import('./verification/pyro-trajectory-scene-check.js');return runPyroTrajectorySceneCheck(window.__ATOLL__,{...options,renderer,sourceProvider:fireworks.smokeSourceProvider});},
    async runReceiverLightCheck(options={}){const {runReceiverLightCheck}=await import('./verification/lighting-choreography/receiver-scene-check.js');return runReceiverLightCheck(window.__ATOLL__,{...options,THREE,renderer,fireworks,lens,camera,terrainHeight,localLights,scene});},
    async runMultiReceiverLightCheck(options={}){const {runMultiReceiverLightCheck}=await import('./verification/audio-light-lifecycle/multi-receiver-scene-check.js');return runMultiReceiverLightCheck(window.__ATOLL__,{...options,THREE,renderer,fireworks,lens,camera,terrainHeight,localLights,scene});},
    runSmokeKernelSceneCheck(options={}){return runSmokeVariantScene('./verification/pyro-smoke-kernel-scene-check.js','runSmokeKernelSceneCheck',[['point20',{kernelModel:'point',centralFraction:.2}],['segment20',{kernelModel:'past-segment-v2',centralFraction:.2}],['point05',{kernelModel:'point',centralFraction:.05}],['segment05',{kernelModel:'past-segment-v2',centralFraction:.05}]],options);},
    runSmokeSamplesSceneCheck(options={}){return runSmokeVariantScene('./verification/pyro-smoke-samples-scene-check.js','runSmokeSamplesSceneCheck',[['samples12',{kernelModel:'past-segment-v2',centralFraction:.05,trajectorySlots:12}],['samples48',{kernelModel:'past-segment-v2',centralFraction:.05,trajectorySlots:48}]],options);},
    runSmokeDispersionSceneCheck(options={}){return runSmokeVariantScene('./verification/pyro-smoke-dispersion-scene-check.js','runSmokeDispersionSceneCheck',[['brownian',{kernelModel:'past-segment-v2',centralFraction:.05,trajectorySlots:48,dispersionModel:'brownian'}],['taylor10',{kernelModel:'past-segment-v2',centralFraction:.05,trajectorySlots:48,dispersionModel:'taylor',lagrangianSeconds:10}]],options);},
    runResolvedSmokeFieldSceneCheck(options={}){return runSmokeVariantScene('./verification/pyro-smoke-resolved-field-scene-check.js','runResolvedSmokeFieldSceneCheck',[['proxy',{kernelModel:'past-segment-v2',centralFraction:.05,trajectorySlots:48,dispersionModel:'taylor',lagrangianSeconds:10}],['resolved',{kernelModel:'past-segment-v2',centralFraction:.05,trajectorySlots:48,dispersionModel:'taylor',lagrangianSeconds:10}]],options);},
    runPalmFanBurnSceneCheck(options={}){return runSmokeVariantScene('./verification/palm-fan-burn-scene-check.js','runPalmFanBurnSceneCheck',[['early',{kernelModel:'past-segment-v2',centralFraction:.05,trajectorySlots:48,dispersionModel:'taylor',lagrangianSeconds:10}],['continuous',{kernelModel:'past-segment-v2',centralFraction:.05,trajectorySlots:48,dispersionModel:'taylor',lagrangianSeconds:10,emissionProfile:'palm-fan-uniform-burn-v1'}]],options);},
    async runTransientCloudCheck(){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runTransientCloudGPUCheck}=await import('./verification/transient-cloud-gpu-check.js');return await runTransientCloudGPUCheck(THREE,renderer,atmosphere);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    fireworks(){return {...fireworks.diagnostics(),settings:{...fireworksSettings},lightingField:{...smokeLightStatus},bounds:fireworks.getBounds({shutterSeconds:parameters.lens.shutterSeconds??1/120}),audio:fireworksAudio.diagnostics()};},
    fireworkClusters(){return structuredClone(fireworks.getLightClusters());},
    fireworkReceiverClusters(){return structuredClone(fireworks.getReceiverLightClusters?.()??fireworks.getLightClusters());},
    traceReflectionBound(){
      const camera=water.prepareReflectionCamera(), rows=[];
      const bound=fireworks.getRadianceBound({camera,optics:{...currentOptics(),width:water.reflection.width,height:water.reflection.height,dof:false,legacyShutterSeconds:0},rawPerCandela:RAW_PER_CANDELA,onSourceBound:row=>{
        if(!(row.bound.peak>0)||!row.bound.visible||row.bound.depth<camera.near)return;rows.push({peak:row.bound.peak,rect:row.bound.rect,depth:row.bound.depth,omega:row.bound.omega,nearPlaneFallback:row.bound.nearPlaneFallback,projected:row.projected,source:row.source});
      }});
      rows.sort((a,b)=>b.peak-a.peak);return {bound,top:rows.slice(0,12),count:rows.length,reflectionSize:[water.reflection.width,water.reflection.height],reflectionLastRender:fireworks.diagnostics().lastRenderByView.reflection};
    },
    traceMainBound(){
      const rows=[];const bound=fireworks.getRadianceBound({camera,optics:currentOptics(),rawPerCandela:RAW_PER_CANDELA,onSourceBound:row=>{
        if(!(row.bound.peak>0)||!row.bound.visible||row.bound.depth<camera.near)return;rows.push({peak:row.bound.peak,rect:row.bound.rect,depth:row.bound.depth,omega:row.bound.omega,nearPlaneFallback:row.bound.nearPlaneFallback,projected:row.projected,source:row.source});
      }});rows.sort((a,b)=>b.peak-a.peak);return {bound,top:rows.slice(0,12),count:rows.length,mainSize:[lens.state.width,lens.state.height],mainLastRender:fireworks.diagnostics().lastRenderByView.main};
    },
    smoke(){return pyroSmoke.diagnostics();},
    smokeSnapshot(){return pyroSmoke.snapshot();},
    // QA-only: one real host for motion/performance review, no comparison fanout.
    // A caller must explicitly retire fireworks and clear matter first.
    setSmokeReviewProfile(name='production'){
      const profiles={production:{},taylor48:{kernelModel:'past-segment-v2',centralFraction:.05,trajectorySlots:48,dispersionModel:'taylor',lagrangianSeconds:10},'ring-burn':{kernelModel:'past-segment-v2',centralFraction:.05,trajectorySlots:48,dispersionModel:'taylor',lagrangianSeconds:10,emissionProfile:'ring-uniform-burn-v1'},'palm-fan-burn':{kernelModel:'past-segment-v2',centralFraction:.05,trajectorySlots:48,dispersionModel:'taylor',lagrangianSeconds:10,emissionProfile:'palm-fan-uniform-burn-v1'},'logical-all':{kernelModel:'past-segment-v2',centralFraction:.20,dispersionModel:'brownian',groundChargeFraction:.10,emissionProfile:'logical-family-continuous-v1'}};
      if(!Object.hasOwn(profiles,name))throw new RangeError('Unknown smoke review profile');
      if(qaSmokeVariants||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Retire fireworks and explicitly clear smoke before changing the QA source profile');
      const rendering=pyroSmoke.diagnostics().rendering;
      const next=createPyroSmoke(THREE,renderer,{time,wind:pyroSmoke.snapshot().currentWind,sourceModel:'trajectory-v1',sourceProvider:fireworks.smokeSourceProvider,...profiles[name],projectionMode:rendering.projectionMode,lightFieldBakeMode:rendering.lightFieldBakeMode,lightFieldMaxRequestPairs:smokeWorkPolicy().maxRequestPairs,lightFieldMaxMapPairs:1000000,lightFieldMaxMapDraws:smokeWorkPolicy().maxMapDraws});
      if(name==='ring-burn'&&next.diagnostics().events.parameters.emissionProfile!=='ring-uniform-burn-v1'){next.dispose();throw new Error('Ring burn profile has not been integrated into this loaded runtime');}
      if(name==='palm-fan-burn'&&next.diagnostics().events.parameters.emissionProfile!=='palm-fan-uniform-burn-v1'){next.dispose();throw new Error('Palm/fan burn profile has not been integrated into this loaded runtime');}
      if(name==='logical-all'&&next.diagnostics().events.parameters.emissionProfile!=='logical-family-continuous-v1'){next.dispose();throw new Error('All-body burn profile has not been integrated into this loaded runtime');}
      discardJointSmokePlan();const previous=pyroSmoke;pyroSmoke=next;qaSmokeReviewProfile=name;previous.dispose();updateScenePhotometry(0,true);lens.resetTemporalHistory('QA smoke source profile');lastPausedRenderKey=null;
      return {profile:name,diagnostics:pyroSmoke.diagnostics(),scope:'QA-only source replacement, resets on reload; production constructor unchanged'};
    },
    setJointSmokePilot(enabled=false){
      if(jointSmokeFault)throw new Error('The joint pilot fault requires a page reload; the diagnostic state records the cause');
      if(typeof enabled!=='boolean'||qaRenderLock||qaFrozenWorkload||graphicsContextInterrupted||!parameters.paused||qaSmokeVariants)throw new Error('Joint pilot requires a healthy, paused, exclusive scene');
      const f=fireworks.diagnostics(),d=pyroSmoke.diagnostics();
      if(f.active||f.queued||pyroSmoke.packetCount||d.state.ledger.pendingMass)throw new Error('Retire fireworks and explicitly clear smoke before changing the joint pilot');
      if(enabled&&(!smokeGPURequested||!smokeGPUSupport?.passed||qaSmokeTransmissionMode!=='fast'))throw new Error('Joint pilot requires the admitted GPU transmission route');
      discardJointSmokePlan();jointSmokeFault=null;jointSmokePilot=enabled;
      configureSmokeGPUField(smokeGPURequested&&!!smokeGPUSupport?.passed,{maxSources:18000,maxPackets:4096,maxPairs:1048576,...smokeWorkPolicy()});
      this.setSmokeReviewProfile(qaSmokeReviewProfile);lastPausedRenderKey=null;
      return this.smokeJointFrame();
    },
    smokeJointFrame(){return {requested:jointSmokePilot,pending:!!jointSmokePending,active:!!jointSmokeActive,fault:jointSmokeFault,last:jointSmokeLast,policy:smokeWorkPolicy(),scope:'Opt-in synchronous joint frame integration; no full-frame performance admission'};},
    clearSmoke,
    setFireworks:configureFireworksSettings,
    setFireworkEffectProfile(effectProfile='legacy'){if(!['legacy','three-heart-v1','three-heart-scale120-v1','three-heart-radiant120-v1','two-colour-v1','powered-bees-v1'].includes(effectProfile))throw new RangeError('Unknown effectProfile');return configureFireworksSettings({type:'chrysanthemum',autoLaunch:false,effectProfile});},
    fireworkShaderCaps(){const g=renderer.getContext();return{maxVertexAttributes:g.getParameter(g.MAX_VERTEX_ATTRIBS),maxVaryingVectors:g.getParameter(g.MAX_VARYING_VECTORS),maxVaryingComponents:g.getParameter(g.MAX_VARYING_COMPONENTS),requiredAttributes:13,estimatedVaryingComponents:54};},
    async runVectorShutterCheck(options={}){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A healthy exclusive renderer is required');const paused=parameters.paused;parameters.paused=true;qaRenderLock=true;try{const {runVectorShutterGPUCheck}=await import('./verification/r18-vector-shutter-gpu-check.js');return await runVectorShutterGPUCheck(THREE,renderer,{...options,parentLocked:true,createFireworks});}finally{clock.getDelta();qaRenderLock=false;parameters.paused=graphicsContextInterrupted?true:paused;lastPausedRenderKey=null;}},
    async runContactSupportCheck(options={}){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A healthy exclusive renderer is required');const paused=parameters.paused;parameters.paused=true;qaRenderLock=true;try{const {runContactSupportGPUCheck}=await import('./verification/r21-contact-support-gpu-check.js');return await runContactSupportGPUCheck(THREE,renderer,{...options,parentLocked:true,createFireworks});}finally{clock.getDelta();qaRenderLock=false;parameters.paused=graphicsContextInterrupted?true:paused;lastPausedRenderKey=null;}},
    async runTransmissionLayoutCheck(options={}){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A healthy exclusive renderer is required');const paused=parameters.paused;parameters.paused=true;qaRenderLock=true;try{const [{runTransmissionLayoutGPUCheck},{createSmokeTransmissionGPU:createLegacyField}]=await Promise.all([import('./verification/r23-transmission-layout-gpu-check.js'),import('./verification/r23-legacy-transmission-gpu.js')]);const report=await runTransmissionLayoutGPUCheck(THREE,renderer,{...options,parentLocked:true,createField:createSmokeTransmissionGPU,createLegacyField});const phase=options.phase??'first';if(report.passed&&report.actualGPU)qaTransmissionLayoutReports[phase]=Object.freeze({passed:true,actualGPU:true,phase});else delete qaTransmissionLayoutReports[phase];return report;}catch(error){delete qaTransmissionLayoutReports[options.phase??'first'];throw error;}finally{clock.getDelta();qaRenderLock=false;parameters.paused=graphicsContextInterrupted?true:paused;lastPausedRenderKey=null;}},
    async runSmokePrefixCheck(options={}){if(qaRenderLock||qaFrozenWorkload||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const [{runSmokePrefixGPUCheck},{createPyroSmokeRenderer}]=await Promise.all([import('./verification/r25-smoke-prefix-gpu-check.js'),import('./pyro-smoke-renderer.js')]);return await runSmokePrefixGPUCheck(THREE,renderer,{...options,parentLocked:true,createVolume:createPyroSmokeRenderer});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runTinyTransmissionCheck(options={}){if(qaRenderLock||qaFrozenWorkload||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const [{runTinyTransmissionGPUCheck},{createTinyTransmissionStepper}]=await Promise.all([import('./verification/r26-tiny-transmission-gpu-check.js'),import('./verification/r26-tiny-transmission-stepper.js')]);return await runTinyTransmissionGPUCheck(THREE,renderer,{...options,parentLocked:true,createStepper:createTinyTransmissionStepper});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runRowStraddleTransmissionCheck(options={}){if(qaRenderLock||qaFrozenWorkload||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const [{runRowStraddleTransmissionGPUCheck},{createCompleteTransmissionCandidate}]=await Promise.all([import('./verification/r26-row-straddle-gpu-check.js'),import('./verification/r26-complete-transmission-candidate.js')]);return await runRowStraddleTransmissionGPUCheck(THREE,renderer,{...options,parentLocked:true,createField:createCompleteTransmissionCandidate});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runCompleteNativeTransmissionCheck(options={}){if(qaRenderLock||qaFrozenWorkload||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const [{runCompleteNativeTransmissionGPUCheck},{createCompleteTransmissionCandidate}]=await Promise.all([import('./verification/r27-complete-native-gpu-check.js'),import('./verification/r26-complete-transmission-candidate.js')]);return await runCompleteNativeTransmissionGPUCheck(THREE,renderer,{...options,parentLocked:true,createField:createCompleteTransmissionCandidate});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runProductionNativeTransmissionCheck(options={}){if(qaRenderLock||qaFrozenWorkload||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const {runProductionNativeTransmissionGPUCheck}=await import('./verification/r27-production-native-gpu-check.js');return await runProductionNativeTransmissionGPUCheck(THREE,renderer,{...options,parentLocked:true,createField:createSmokeTransmissionGPU});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runCompleteNativeLightCheck(options={}){if(qaRenderLock||qaFrozenWorkload||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const [{runCompleteNativeLightGPUCheck},{createExactSmokeLightFieldCandidate}]=await Promise.all([import('./verification/r28-complete-native-light-gpu-check.js'),import('./verification/r28-exact-light-field-candidate.js')]);return await runCompleteNativeLightGPUCheck(THREE,renderer,{...options,parentLocked:true,createField:createExactSmokeLightFieldCandidate});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runProductionNativeLightCheck(options={}){if(qaRenderLock||qaFrozenWorkload||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const [{runProductionNativeLightGPUCheck},{createPyroSmokeLightField}]=await Promise.all([import('./verification/r28-production-native-light-gpu-check.js'),import('./pyro-smoke-light-field.js')]);return await runProductionNativeLightGPUCheck(THREE,renderer,{...options,parentLocked:true,createField:createPyroSmokeLightField});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    getR30SceneInventory(){return inspectR30SceneInventory();},
    async diagnoseR30NativeReplay(){
      if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused||qualityApplying||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Pause an empty healthy scene before the CPU replay observation');
      const fingerprint=()=>{const state=frozenWorkloadInfo();if(state.parameters.graphics.systemCalibration)delete state.parameters.graphics.peakNits;return JSON.stringify(state);},entry=fingerprint();
      let forbiddenRendererCalls=0;const rejectNative=()=>{forbiddenRendererCalls++;throw new Error('CPU replay observer may not invoke a renderer or obtain a graphics context');},inertRenderer=Object.freeze({render:rejectNative,getContext:rejectNative});
      qaRenderLock=true;
      try{
        const {diagnoseR30NativeReplay}=await import('./verification/r30-native-replay.js');
        if(fingerprint()!==entry)throw new Error('Scene changed while loading CPU observer; user action preserved');
        const report=await diagnoseR30NativeReplay(THREE,inertRenderer,{createFireworks,createPyroSmoke,terrainHeight,createAirSurface:createAtollAirSurface,yieldControl:async()=>{if(fingerprint()!==entry)throw new Error('User changed scene during CPU observer');await new Promise(requestAnimationFrame);if(fingerprint()!==entry)throw new Error('User changed scene during CPU observer');}});
        return {...report,actualGPU:false,forbiddenRendererCalls,originalSceneUntouched:fingerprint()===entry,scope:'CPU observation using an inert renderer whose render/context methods throw; no scene objects may be published or drawn'};
      }finally{clock.getDelta();qaRenderLock=false;}
    },
    async runR30FreshSceneCheck(options={}){
      if(Reflect.ownKeys(options).length)throw new Error('R30 scene check uses one fixed reviewed scene; no caller overrides');
      if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused||qualityApplying||qaSmokeVariants||inspection||throwGesture||pendingThrow||transition||parameters.director.mode!=='off'||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Pause an empty healthy scene with no interaction or diagnostic first');
      const entryKey=JSON.stringify(frozenWorkloadInfo());qaRenderLock=true;let bridge=null,result=null;
      try{
        const [{runR30FreshSceneCheck},{replayR30NativePair},{captureR30CurrentViews}]=await Promise.all([import('./verification/r30-fresh-scene-gpu-check.js'),import('./verification/r30-native-replay.js'),import('./verification/r30-native-preplan.js')]);
        if(JSON.stringify(frozenWorkloadInfo())!==entryKey||graphicsContextInterrupted||!parameters.paused||qualityApplying||qaSmokeVariants||inspection||throwGesture||pendingThrow||transition||parameters.director.mode!=='off'||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Scene changed during diagnostic loading; original user action preserved');
        bridge=createR30SceneBridge(captureR30CurrentViews);
        const measured=await runR30FreshSceneCheck(THREE,renderer,{parentLocked:true,createTransmission:createSmokeTransmissionGPU,replayNativePair:({yieldControl,signal}={})=>replayR30NativePair(THREE,renderer,{createFireworks,createPyroSmoke,terrainHeight,createAirSurface:createAtollAirSurface,yieldControl,signal}),bridge});result={...measured};
        return result;
      }finally{
        try{
          const restored=bridge?.restore({allowPresentation:false});
          if(result&&restored?.changed&&!restored.passed){result.measurementPassed=result.passed;result.passed=false;result.rootRestorationErrors=restored.errors;}
          if(result?.passed&&restored?.passed&&restored?.changed&&!graphicsContextInterrupted){
            const start=performance.now();
            try{setAir();updateScenePhotometry(0,true);setAir();water.render(time);lens.render(scene,camera.position.distanceTo(controls.target));result.originalPresentationRebuild={attempted:true,passed:true,scope:'One normal empty original-scene presentation after measured helper and native-state restoration; ordinary paused reconvergence can follow separately',cpuSubmitMs:performance.now()-start,hdrRequested:parameters.graphics.hdr,drawsIndividuallyCounted:false};}
            catch(error){result.measurementPassed=result.passed;result.passed=false;result.originalPresentationRebuild={attempted:true,passed:false,error:String(error?.stack??error).slice(0,4096)};}
            if(result.passed)lastPausedRenderKey=null;else if(parameters.paused){
              const round=values=>values.map(v=>Math.round(v*1e8)/1e8);
              lastPausedRenderKey=JSON.stringify([round(camera.position.toArray()),round(controls.target.toArray()),parameters,renderScale,innerWidth,innerHeight,scene.environment?.uuid,water.uniforms.uDebugMode.value,frameSnapshot.storageEV,Math.round(frameSnapshot.outputExposureScale*1e10)/1e10,celestialFrame.physicalSkyRevision,localLights.state.flashlight]);pausedSteadyFrames=41;pausedRenderCached=true;
            }
          }else if(restored?.changed&&parameters.paused){
            const round=values=>values.map(v=>Math.round(v*1e8)/1e8);
            lastPausedRenderKey=JSON.stringify([round(camera.position.toArray()),round(controls.target.toArray()),parameters,renderScale,innerWidth,innerHeight,scene.environment?.uuid,water.uniforms.uDebugMode.value,frameSnapshot.storageEV,Math.round(frameSnapshot.outputExposureScale*1e10)/1e10,celestialFrame.physicalSkyRevision,localLights.state.flashlight]);
            pausedSteadyFrames=41;pausedRenderCached=true;if(result)result.originalPresentationRebuild={attempted:false,reason:'Failed/cancelled measured transaction: no explicit restoration drawing; normal reload may rebuild original presentation'};
          }
        }finally{clock.getDelta();qaRenderLock=false;}
      }
    },
    async verifyR30BrowserNativeReplay(){
      if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused||qualityApplying||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Pause an empty healthy scene before strict browser CPU replay');
      const fingerprint=()=>{const state=frozenWorkloadInfo();if(state.parameters.graphics.systemCalibration)delete state.parameters.graphics.peakNits;return JSON.stringify(state);},entry=fingerprint();
      let forbiddenRendererCalls=0,pair=null;const rejectNative=()=>{forbiddenRendererCalls++;throw new Error('Strict browser CPU replay may not render or obtain a graphics context');},inertRenderer=Object.freeze({render:rejectNative,getContext:rejectNative});qaRenderLock=true;
      try{
        const {replayR30BrowserNativePair}=await import('./verification/r30-native-replay.js');
        if(fingerprint()!==entry)throw new Error('Scene changed while loading browser CPU replay; user action preserved');
        pair=await replayR30BrowserNativePair(THREE,inertRenderer,{createFireworks,createPyroSmoke,terrainHeight,createAirSurface:createAtollAirSurface,yieldControl:async()=>{if(fingerprint()!==entry)throw new Error('User changed scene during strict browser CPU replay');await new Promise(requestAnimationFrame);if(fingerprint()!==entry)throw new Error('User changed scene during strict browser CPU replay');}});
        pair.assertReady();const receipt={...pair.receipt};pair.dispose();
        return {...receipt,actualGPU:false,strictBrowserReplayPassed:true,ownedReplayDisposed:pair.disposed,forbiddenRendererCalls,originalSceneUntouched:fingerprint()===entry,sceneObjectsPublished:false,scope:'Strict browser-reference replay with inert renderer; no scene or optical field may be published'};
      }finally{try{pair?.dispose();}finally{clock.getDelta();qaRenderLock=false;}}
    },
    runR33WaterSolarControls(options={}){return runR33WaterSolarJob('runR33WaterSolarControls',options);},
    runR33WaterSolarTiming(options={}){return runR33WaterSolarJob('runR33WaterSolarTiming',options);},
    async runR32WaterSolarCheck(options={}){
      if(Reflect.ownKeys(options).length)throw new Error('R32 water check uses one fixed reviewed zero-source fixture; no caller overrides');
      if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused||qualityApplying||qaSmokeVariants||inspection||throwGesture||pendingThrow||transition||parameters.director.mode!=='off'||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Pause an empty healthy scene with no interaction or diagnostic first');
      const entryKey=JSON.stringify(frozenWorkloadInfo());qaRenderLock=true;let bridge=null,result=null;
      try{
        const {runR32WaterSolarCheck}=await import('./verification/r32-water-solar-gpu-check.js');
        if(JSON.stringify(frozenWorkloadInfo())!==entryKey||graphicsContextInterrupted||!parameters.paused)throw new Error('Scene changed while loading water check; original user action preserved');
        bridge=createR32WaterSolarBridge();
        result=await runR32WaterSolarCheck(THREE,renderer,{parentLocked:true,bridge});
        return result;
      }finally{
        try{const restored=bridge?.restore();if(result&&restored){result.rootRestoration=restored;if(!restored.passed){result.measurementPassed=result.passed;result.passed=false;}}}
        finally{clock.getDelta();qaRenderLock=false;}
      }
    },
    async runR31NativePhaseProfile(options={}){
      if(Reflect.ownKeys(options).length)throw new Error('R31 native phase profile uses one fixed reviewed scene; no caller overrides');
      if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused||qualityApplying||qaSmokeVariants||inspection||throwGesture||pendingThrow||transition||parameters.director.mode!=='off'||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Pause an empty healthy scene with no interaction or diagnostic first');
      const entryKey=JSON.stringify(frozenWorkloadInfo());qaRenderLock=true;let bridge=null,result=null;
      try{
        const [{runR31NativePhaseProfile},{replayR30BrowserNativePair},{captureR31CurrentViews}]=await Promise.all([import('./verification/r31-native-phase-profile-check.js'),import('./verification/r30-native-replay.js'),import('./verification/r31-native-preplan.js')]);
        if(JSON.stringify(frozenWorkloadInfo())!==entryKey||graphicsContextInterrupted||!parameters.paused||qualityApplying||qaSmokeVariants||inspection||throwGesture||pendingThrow||transition||parameters.director.mode!=='off'||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Scene changed during diagnostic loading; original user action preserved');
        bridge=createR31SceneBridge(captureR31CurrentViews);
        const measured=await runR31NativePhaseProfile(THREE,renderer,{parentLocked:true,createTransmission:createSmokeTransmissionGPU,replayNativePair:({yieldControl,signal}={})=>replayR30BrowserNativePair(THREE,renderer,{createFireworks,createPyroSmoke,terrainHeight,createAirSurface:createAtollAirSurface,yieldControl,signal}),bridge});result={...measured};
        return result;
      }finally{
        try{
          const restored=bridge?.restore({allowPresentation:false});
          if(result&&restored?.changed&&!restored.passed){result.measurementPassed=result.passed;result.passed=false;result.rootRestorationErrors=restored.errors;}
          if(result?.passed&&restored?.passed&&restored?.changed&&!graphicsContextInterrupted){
            const start=performance.now();
            try{setAir();updateScenePhotometry(0,true);setAir();water.render(time);lens.render(scene,camera.position.distanceTo(controls.target));result.originalPresentationRebuild={attempted:true,passed:true,scope:'One normal empty original-scene presentation after measured helper and native-state restoration; ordinary paused reconvergence can follow separately',cpuSubmitMs:performance.now()-start,hdrRequested:parameters.graphics.hdr,drawsIndividuallyCounted:false};}
            catch(error){result.measurementPassed=result.passed;result.passed=false;result.originalPresentationRebuild={attempted:true,passed:false,error:String(error?.stack??error).slice(0,4096)};}
            if(result.passed)lastPausedRenderKey=null;else if(parameters.paused){
              const round=values=>values.map(v=>Math.round(v*1e8)/1e8);
              lastPausedRenderKey=JSON.stringify([round(camera.position.toArray()),round(controls.target.toArray()),parameters,renderScale,innerWidth,innerHeight,scene.environment?.uuid,water.uniforms.uDebugMode.value,frameSnapshot.storageEV,Math.round(frameSnapshot.outputExposureScale*1e10)/1e10,celestialFrame.physicalSkyRevision,localLights.state.flashlight]);pausedSteadyFrames=41;pausedRenderCached=true;
            }
          }else if(restored?.changed&&parameters.paused){
            const round=values=>values.map(v=>Math.round(v*1e8)/1e8);
            lastPausedRenderKey=JSON.stringify([round(camera.position.toArray()),round(controls.target.toArray()),parameters,renderScale,innerWidth,innerHeight,scene.environment?.uuid,water.uniforms.uDebugMode.value,frameSnapshot.storageEV,Math.round(frameSnapshot.outputExposureScale*1e10)/1e10,celestialFrame.physicalSkyRevision,localLights.state.flashlight]);
            pausedSteadyFrames=41;pausedRenderCached=true;if(result)result.originalPresentationRebuild={attempted:false,reason:'Failed/cancelled measured transaction: no explicit restoration drawing; normal reload may rebuild original presentation'};
          }
        }finally{clock.getDelta();qaRenderLock=false;}
      }
    },
    async runR31NativeSceneCheck(options={}){
      if(Reflect.ownKeys(options).length)throw new Error('R31 native scene check uses one fixed reviewed scene; no caller overrides');
      if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused||qualityApplying||qaSmokeVariants||inspection||throwGesture||pendingThrow||transition||parameters.director.mode!=='off'||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Pause an empty healthy scene with no interaction or diagnostic first');
      const entryKey=JSON.stringify(frozenWorkloadInfo());qaRenderLock=true;let bridge=null,result=null;
      try{
        const [{runR31NativeSceneCheck},{replayR30BrowserNativePair},{captureR31CurrentViews}]=await Promise.all([import('./verification/r31-native-scene-gpu-check.js'),import('./verification/r30-native-replay.js'),import('./verification/r31-native-preplan.js')]);
        if(JSON.stringify(frozenWorkloadInfo())!==entryKey||graphicsContextInterrupted||!parameters.paused||qualityApplying||qaSmokeVariants||inspection||throwGesture||pendingThrow||transition||parameters.director.mode!=='off'||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Scene changed during diagnostic loading; original user action preserved');
        bridge=createR31SceneBridge(captureR31CurrentViews);
        const measured=await runR31NativeSceneCheck(THREE,renderer,{parentLocked:true,createTransmission:createSmokeTransmissionGPU,replayNativePair:({yieldControl,signal}={})=>replayR30BrowserNativePair(THREE,renderer,{createFireworks,createPyroSmoke,terrainHeight,createAirSurface:createAtollAirSurface,yieldControl,signal}),bridge});result={...measured};
        return result;
      }finally{
        try{
          const restored=bridge?.restore({allowPresentation:false});
          if(result&&restored?.changed&&!restored.passed){result.measurementPassed=result.passed;result.passed=false;result.rootRestorationErrors=restored.errors;}
          if(result?.passed&&restored?.passed&&restored?.changed&&!graphicsContextInterrupted){
            const start=performance.now();
            try{setAir();updateScenePhotometry(0,true);setAir();water.render(time);lens.render(scene,camera.position.distanceTo(controls.target));result.originalPresentationRebuild={attempted:true,passed:true,scope:'One normal empty original-scene presentation after measured helper and native-state restoration; ordinary paused reconvergence can follow separately',cpuSubmitMs:performance.now()-start,hdrRequested:parameters.graphics.hdr,drawsIndividuallyCounted:false};}
            catch(error){result.measurementPassed=result.passed;result.passed=false;result.originalPresentationRebuild={attempted:true,passed:false,error:String(error?.stack??error).slice(0,4096)};}
            if(result.passed)lastPausedRenderKey=null;else if(parameters.paused){
              const round=values=>values.map(v=>Math.round(v*1e8)/1e8);
              lastPausedRenderKey=JSON.stringify([round(camera.position.toArray()),round(controls.target.toArray()),parameters,renderScale,innerWidth,innerHeight,scene.environment?.uuid,water.uniforms.uDebugMode.value,frameSnapshot.storageEV,Math.round(frameSnapshot.outputExposureScale*1e10)/1e10,celestialFrame.physicalSkyRevision,localLights.state.flashlight]);pausedSteadyFrames=41;pausedRenderCached=true;
            }
          }else if(restored?.changed&&parameters.paused){
            const round=values=>values.map(v=>Math.round(v*1e8)/1e8);
            lastPausedRenderKey=JSON.stringify([round(camera.position.toArray()),round(controls.target.toArray()),parameters,renderScale,innerWidth,innerHeight,scene.environment?.uuid,water.uniforms.uDebugMode.value,frameSnapshot.storageEV,Math.round(frameSnapshot.outputExposureScale*1e10)/1e10,celestialFrame.physicalSkyRevision,localLights.state.flashlight]);
            pausedSteadyFrames=41;pausedRenderCached=true;if(result)result.originalPresentationRebuild={attempted:false,reason:'Failed/cancelled measured transaction: no explicit restoration drawing; normal reload may rebuild original presentation'};
          }
        }finally{clock.getDelta();qaRenderLock=false;}
      }
    },
    async runR30BrowserFreshSceneCheck(options={}){
      if(Reflect.ownKeys(options).length)throw new Error('R30 scene check uses one fixed reviewed scene; no caller overrides');
      if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused||qualityApplying||qaSmokeVariants||inspection||throwGesture||pendingThrow||transition||parameters.director.mode!=='off'||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Pause an empty healthy scene with no interaction or diagnostic first');
      const entryKey=JSON.stringify(frozenWorkloadInfo());qaRenderLock=true;let bridge=null,result=null;
      try{
        const [{runR30BrowserFreshSceneCheck},{replayR30BrowserNativePair},{captureR30CurrentViews}]=await Promise.all([import('./verification/r30-browser-fresh-scene-gpu-check.js'),import('./verification/r30-native-replay.js'),import('./verification/r30-native-preplan.js')]);
        if(JSON.stringify(frozenWorkloadInfo())!==entryKey||graphicsContextInterrupted||!parameters.paused||qualityApplying||qaSmokeVariants||inspection||throwGesture||pendingThrow||transition||parameters.director.mode!=='off'||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Scene changed during diagnostic loading; original user action preserved');
        bridge=createR30SceneBridge(captureR30CurrentViews);
        const measured=await runR30BrowserFreshSceneCheck(THREE,renderer,{parentLocked:true,createTransmission:createSmokeTransmissionGPU,replayNativePair:({yieldControl,signal}={})=>replayR30BrowserNativePair(THREE,renderer,{createFireworks,createPyroSmoke,terrainHeight,createAirSurface:createAtollAirSurface,yieldControl,signal}),bridge});result={...measured};
        return result;
      }finally{
        try{
          const restored=bridge?.restore({allowPresentation:false});
          if(result&&restored?.changed&&!restored.passed){result.measurementPassed=result.passed;result.passed=false;result.rootRestorationErrors=restored.errors;}
          if(result?.passed&&restored?.passed&&restored?.changed&&!graphicsContextInterrupted){
            const start=performance.now();
            try{setAir();updateScenePhotometry(0,true);setAir();water.render(time);lens.render(scene,camera.position.distanceTo(controls.target));result.originalPresentationRebuild={attempted:true,passed:true,scope:'One normal empty original-scene presentation after measured helper and native-state restoration; ordinary paused reconvergence can follow separately',cpuSubmitMs:performance.now()-start,hdrRequested:parameters.graphics.hdr,drawsIndividuallyCounted:false};}
            catch(error){result.measurementPassed=result.passed;result.passed=false;result.originalPresentationRebuild={attempted:true,passed:false,error:String(error?.stack??error).slice(0,4096)};}
            if(result.passed)lastPausedRenderKey=null;else if(parameters.paused){
              const round=values=>values.map(v=>Math.round(v*1e8)/1e8);
              lastPausedRenderKey=JSON.stringify([round(camera.position.toArray()),round(controls.target.toArray()),parameters,renderScale,innerWidth,innerHeight,scene.environment?.uuid,water.uniforms.uDebugMode.value,frameSnapshot.storageEV,Math.round(frameSnapshot.outputExposureScale*1e10)/1e10,celestialFrame.physicalSkyRevision,localLights.state.flashlight]);pausedSteadyFrames=41;pausedRenderCached=true;
            }
          }else if(restored?.changed&&parameters.paused){
            const round=values=>values.map(v=>Math.round(v*1e8)/1e8);
            lastPausedRenderKey=JSON.stringify([round(camera.position.toArray()),round(controls.target.toArray()),parameters,renderScale,innerWidth,innerHeight,scene.environment?.uuid,water.uniforms.uDebugMode.value,frameSnapshot.storageEV,Math.round(frameSnapshot.outputExposureScale*1e10)/1e10,celestialFrame.physicalSkyRevision,localLights.state.flashlight]);
            pausedSteadyFrames=41;pausedRenderCached=true;if(result)result.originalPresentationRebuild={attempted:false,reason:'Failed/cancelled measured transaction: no explicit restoration drawing; normal reload may rebuild original presentation'};
          }
        }finally{clock.getDelta();qaRenderLock=false;}
      }
    },
    async runR40DenseGPUCheck(phase='mirror'){
      if(!['mirror','light','joint'].includes(phase))throw new RangeError('Fixed R40 phase requires mirror, light or joint');
      if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused||qualityApplying||qaSmokeVariants||inspection||throwGesture||pendingThrow||transition||parameters.director.mode!=='off'||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Pause an empty healthy scene with no interaction or diagnostic first');
      qaRenderLock=true;try{const {runR40DenseCalibration}=await import('./verification/r40-dense-calibration-runtime.js');return await runR40DenseCalibration(THREE,renderer,{parentLocked:true,phase});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}
    },
    async runR39DenseGPUCheck(){
      if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused||qualityApplying||qaSmokeVariants||inspection||throwGesture||pendingThrow||transition||parameters.director.mode!=='off'||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Pause an empty healthy scene with no interaction or diagnostic first');
      qaRenderLock=true;try{const {runR39DenseCalibration}=await import('./verification/r39-dense-calibration-runtime.js');return await runR39DenseCalibration(THREE,renderer,{parentLocked:true});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}
    },
    async runR29SourcePeakCheck(options={}){if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const [{runR29SourcePeakGPUCheck},{createPyroSmokeLightField}]=await Promise.all([import('./verification/r29-source-peak-gpu-check.js'),import('./pyro-smoke-light-field.js')]);return await runR29SourcePeakGPUCheck(THREE,renderer,{...options,parentLocked:true,createTransmission:createSmokeTransmissionGPU,createLightField:createPyroSmokeLightField});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runR29LightPeakCheck(options={}){if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const [{runR29LightPeakGPUCheck},{createPyroSmokeLightField}]=await Promise.all([import('./verification/r29-light-peak-gpu-check.js'),import('./pyro-smoke-light-field.js')]);return await runR29LightPeakGPUCheck(THREE,renderer,{...options,parentLocked:true,createTransmission:createSmokeTransmissionGPU,createLightField:createPyroSmokeLightField});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runR29JointPeakCheck(options={}){if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const [{runR29JointPeakGPUCheck},{createPyroSmokeLightField}]=await Promise.all([import('./verification/r29-joint-peak-gpu-check.js'),import('./pyro-smoke-light-field.js')]);return await runR29JointPeakGPUCheck(THREE,renderer,{...options,parentLocked:true,createTransmission:createSmokeTransmissionGPU,createLightField:createPyroSmokeLightField});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runNativeTransmissionLayoutPair(options={}){if(qaRenderLock||qaFrozenWorkload||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');const phases=Object.fromEntries(['first','row-wrap','empty-shrink'].map(phase=>[phase,qaTransmissionLayoutReports[phase]?.passed===true]));const tinyReceipt={passed:Object.values(phases).every(Boolean),actualGPU:Object.values(phases).every(Boolean),phases};if(!tinyReceipt.passed)throw new Error('Current renderer must pass all three bounded transmission layout phases first');if((options.phase??'warmup')==='warmup'&&(!qaSmokeTransmissionInput||!qaSmokeTransmissionField))throw new Error('A frozen native GPU transmission input is required');qaRenderLock=true;try{const [{runNativeTransmissionLayoutPairCheck},{createSmokeTransmissionGPU:createLegacyField}]=await Promise.all([import('./verification/r23-native-transmission-layout-pair-check.js'),import('./verification/r23-legacy-transmission-gpu.js')]);return await runNativeTransmissionLayoutPairCheck(THREE,renderer,{...options,input:qaSmokeTransmissionInput,sourceContext:{physicalTime:time,workload:frozenWorkloadInfo()},tinyReceipt,parentLocked:true,createField:createSmokeTransmissionGPU,createLegacyField});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    setSmokeTransmissionLayout(layoutMode){if(!['active-count','legacy-max'].includes(layoutMode))throw new RangeError('Unknown transmission layout');if(qaRenderLock||qaFrozenWorkload||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');if(!qaSmokeTransmissionField||!smokeGPUSupport?.passed)throw new Error('An admitted GPU transmission field must already be enabled');configureSmokeGPUField(true,{maxSources:18000,maxPackets:4096,maxPairs:1048576,layoutMode});return qaSmokeTransmissionField.diagnostics();},
    async runPoweredOpticsCheck(options={}){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A healthy exclusive renderer is required');const paused=parameters.paused;parameters.paused=true;qaRenderLock=true;try{const {runPoweredOpticsGPUCheck}=await import('./verification/r22-powered-optics-gpu-check.js');return await runPoweredOpticsGPUCheck(THREE,renderer,{...options,parentLocked:true,createFireworks});}finally{clock.getDelta();qaRenderLock=false;parameters.paused=graphicsContextInterrupted?true:paused;lastPausedRenderKey=null;}},
    director(){return {...cameraDirector.state,...parameters.director,forecast:directorPlan?.forecast??null};},
    setDirector,
    launchFirework,
    launchRandomFirework(options={}){return launchFirework({...options,randomType:true});},
    cameraExposureState(){return cameraExposure.state;},
    async runSmokeTileCheck(options={}){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');const paused=parameters.paused;parameters.paused=true;qaRenderLock=true;try{const [{runSmokeTileGPUCheck},{createPyroSmokeLightField}]=await Promise.all([import('./verification/r16-smoke-light-tile-gpu-check.js'),import('./pyro-smoke-light-field.js')]);return await runSmokeTileGPUCheck(THREE,renderer,{...options,createField:createPyroSmokeLightField});}finally{clock.getDelta();qaRenderLock=false;parameters.paused=paused;lastPausedRenderKey=null;}},
    async runSmokeProjectionCheck(options={}){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A live renderer with no active diagnostic is required');const paused=parameters.paused;parameters.paused=true;qaRenderLock=true;try{const [{runSmokeProjectionGPUCheck},{createPyroSmokeRenderer}]=await Promise.all([import('./verification/r16-smoke-projection-gpu-check.js'),import('./pyro-smoke-renderer.js')]);return await runSmokeProjectionGPUCheck(THREE,renderer,{...options,parentLocked:true,createVolume:createPyroSmokeRenderer,snapshot:pyroSmoke.snapshot(),camera,frame:frameSnapshot,optics:currentOptics(),lighting:smokeLightingPayload(),air:finiteAirPayload(),localLighting:localLights,finiteClusterPhase:fireworksSettings.finiteClusterPhase});}finally{clock.getDelta();qaRenderLock=false;parameters.paused=paused;lastPausedRenderKey=null;}},
    setFireworkSourceVisibility(mode){fireworks.setSourceVisibility(mode);lastPausedRenderKey=null;return fireworks.sourceVisibility;},
    setSmokeProjectionMode(mode){pyroSmoke.setProjectionMode(mode);lastPausedRenderKey=null;lens.resetTemporalHistory('smoke projection');return pyroSmoke.diagnostics().rendering;},
    setSmokeLightingBakeMode(mode){pyroSmoke.setLightingBakeMode(mode);updateScenePhotometry(0,true);lastPausedRenderKey=null;lens.resetTemporalHistory('smoke light bake mode');return pyroSmoke.diagnostics().rendering;},
    setSmokeColumnKernel(mode){const result=pyroSmoke.setColumnKernel(mode);lastPausedRenderKey=null;lens.resetTemporalHistory('smoke transmission kernel');return result;},
    setSmokeColumnOriginCache(enabled){return pyroSmoke.setColumnOriginCache(enabled);},
    async runSmokeTransmissionCheck(options={}){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A live renderer with no active diagnostic is required');const paused=parameters.paused;parameters.paused=true;qaRenderLock=true;try{const {runSmokeTransmissionGPUCheck}=await import('./verification/r16-smoke-transmission-gpu-check.js');const report=await runSmokeTransmissionGPUCheck(THREE,renderer,{...options,parentLocked:true,createField:createSmokeTransmissionGPU});qaSmokeTransmissionAdmission=report;return report;}finally{clock.getDelta();qaRenderLock=false;parameters.paused=paused;lastPausedRenderKey=null;}},
    setSmokeTransmissionGPU({enabled=false,maxSources=64,maxPackets=48,maxPairs=3072}={}){if(qaRenderLock||qaFrozenWorkload)throw new Error('A rendering diagnostic is active');if(enabled&&!qaSmokeTransmissionAdmission?.passed)throw new Error('The current renderer must first pass the bounded transmission GPU check');configureSmokeGPUField(enabled,{maxSources,maxPackets,maxPairs});return {enabled:!!qaSmokeTransmissionField,caps:{maxSources,maxPackets,maxPairs},admittedTiny:qaSmokeTransmissionAdmission?.passed??false,scope:'QA-only explicit capacity expansion; no automatic native stress dispatch'};},
    setSmokeGPU:setSmokeGPUEnabled,
    smokeGPUSupport(){return smokeGPUSupport;},
    smokeTransmissionGPU(){return qaSmokeTransmissionField?.diagnostics()??{enabled:false,admittedTiny:qaSmokeTransmissionAdmission?.passed??false};},
    async runNativeSmokeTransmissionCheck(options={}){if(qaRenderLock||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');if(!qaSmokeTransmissionField||!qaSmokeTransmissionInput)throw new Error('No frozen GPU transmission result is available');qaRenderLock=true;try{const {runNativeSmokeTransmissionCheck}=await import('./verification/r16-smoke-native-transmission-check.js');return await runNativeSmokeTransmissionCheck(THREE,renderer,{...options,parentLocked:true,field:qaSmokeTransmissionField,input:qaSmokeTransmissionInput});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    waterFarField(mode){const result=water.configureFarField(mode);lastPausedRenderKey=null;lens.resetTemporalHistory('far sea geometry');return result;},
    waterReflectionDirections(mode){const result=water.configureReflectionDirections(mode);lastPausedRenderKey=null;lens.resetTemporalHistory('sea reflection directions');return result;},
    throwStone:throwFromCamera,
    setQuality:applyQualityPreset,
    sunShadowShaderSource(){return sunShadowGLSL;},
    shaderSamplers(){const gl=renderer.getContext(),types=new Set([gl.SAMPLER_2D,gl.SAMPLER_CUBE,gl.SAMPLER_3D,gl.SAMPLER_2D_ARRAY,gl.SAMPLER_2D_SHADOW,gl.SAMPLER_CUBE_SHADOW,gl.SAMPLER_2D_ARRAY_SHADOW,gl.INT_SAMPLER_2D,gl.UNSIGNED_INT_SAMPLER_2D]);return {fragmentLimit:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),programs:renderer.info.programs.map(p=>{const samplers=[];for(let i=0,n=gl.getProgramParameter(p.program,gl.ACTIVE_UNIFORMS);i<n;i++){const u=gl.getActiveUniform(p.program,i);if(types.has(u.type))samplers.push({name:u.name,size:u.size});}return {name:p.name,linked:!!gl.getProgramParameter(p.program,gl.LINK_STATUS),count:samplers.reduce((s,u)=>s+u.size,0),samplers};})};},
    async inspectRadiance(){const {readRadianceRange}=await import('./verification/radiance-range-gpu-check.js');return {...await lens.inspectRadiance(),reflection:await readRadianceRange(THREE,renderer,water.reflection.texture,water.reflection.width,water.reflection.height),photometry:radiometry.state};},
    async runBloomGaussianCheck(){if(qaRenderLock||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const {runBloomGaussianGPUCheck}=await import('./verification/complex-fireworks/bloom-gaussian-gpu-check.js');return await runBloomGaussianGPUCheck(THREE,renderer,{parentLocked:true});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runComplexStylesCheck(){if(qaRenderLock||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const {runComplexStylesGPUCheck}=await import('./verification/complex-fireworks/all-styles-gpu-check.js');return await runComplexStylesGPUCheck(THREE,renderer,{parentLocked:true,createFireworks});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runNearHeadShutterCheck(){if(qaRenderLock||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');qaRenderLock=true;try{const {runNearHeadShutterGPUCheck}=await import('./verification/complex-fireworks/near-head-shutter-gpu-check.js');return await runNearHeadShutterGPUCheck(THREE,renderer,{parentLocked:true});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runFireworksCheck(){const {runFireworksGPUCheck}=await import('./verification/fireworks/gpu-check.js');return runFireworksGPUCheck(THREE,renderer,createFireworks);},
    async runSmileyCheck(){const {runSmileyGPUCheck}=await import('./verification/fireworks/smiley-gpu-check.js');return runSmileyGPUCheck(THREE,renderer,createFireworks);},
    async runFireworksOpticsCheck(){const {runFireworksOpticsGPUCheck}=await import('./verification/fireworks/optics-gpu-check.js');return runFireworksOpticsGPUCheck(THREE,renderer,createFireworks);},
    async runFireworksTrailCheck(){const {runFireworksTrailABGPUCheck}=await import('./verification/fireworks/trail-ab-gpu-check.js');return runFireworksTrailABGPUCheck(THREE,renderer,createFireworks,{capture:true});},
    async runAdaptiveTrailCheck(){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A live renderer with no active GPU diagnostic is required');qaRenderLock=true;try{const {runAdaptiveTrailGPUCheck}=await import('./verification/fireworks/adaptive-tail-gpu-check.js');return await runAdaptiveTrailGPUCheck(THREE,renderer);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runAdaptiveTrailVaryingProbe(){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A live renderer with no active GPU diagnostic is required');qaRenderLock=true;try{const {runAdaptiveTrailVaryingProbe}=await import('./verification/fireworks/adaptive-tail-varying-probe.js');return await runAdaptiveTrailVaryingProbe(THREE,renderer);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    setFireworksTrailIntegration(mode,{resetHistory=true}={}){if(!['legacy8','adaptive'].includes(mode))throw new RangeError('Unknown trail integration');fireworks.configure({trailIntegration:mode});if(resetHistory){updateScenePhotometry(0,true);lens.resetTemporalHistory('QA trail optical integration');lastPausedRenderKey=null;return fireworks.diagnostics();}return{requested:mode,historyReset:false};},
    setFireworksTailColourMode(mode){if(!['constant','cooling'].includes(mode))throw new RangeError('Unknown detached-tail colour mode');fireworks.configure({tailColourMode:mode});updateScenePhotometry(0,true);lens.resetTemporalHistory('QA detached ember colour');lastPausedRenderKey=null;return fireworks.diagnostics();},
    setFireworksPhotometryMode(mode,{radiusMm=2}={}){fireworks.configure({photometryMode:mode,thermalEmittingRadiusMm:radiusMm});updateScenePhotometry(0,true);lens.resetTemporalHistory('QA thermal source photometry');lastPausedRenderKey=null;return fireworks.diagnostics();},
    setBackgroundLocalAir(enabled,{model='quadratic'}={}){if(model!=='quadratic')throw new RangeError('Support integration candidate is withdrawn pending GPU investigation');const patch={backgroundLocalScattering:enabled?1:0};aerialPerspective.configure(patch);Object.assign(parameters.air,patch);setAir();updateScenePhotometry(0,true);lens.resetTemporalHistory('QA background local scattering');lastPausedRenderKey=null;return aerialPerspective.diagnostics();},
    fireworkFramingSources(options={}){return fireworks.getFramingSources({shutterSeconds:currentOptics().shutterSeconds,...options});},
    get smokeTransmissionMode(){return qaSmokeTransmissionMode;},
    setSmokeTransmissionMode(mode,{resetHistory=true}={}){if(qaRenderLock||qaFrozenWorkload)throw new Error('A rendering diagnostic is active');if(!['legacy','fast'].includes(mode))throw new RangeError('Unknown smoke transmission route');qaSmokeTransmissionMode=mode;if(resetHistory){lens.resetTemporalHistory('QA smoke transmission route');lastPausedRenderKey=null;}return{requested:mode,historyReset:resetHistory};},
    async runFireworksBoundCheck(){const {runFireworksBoundGPUCheck}=await import('./verification/fireworks/bound-gpu-check.js');return runFireworksBoundGPUCheck(THREE,renderer,createFireworks);},
    async runMomentsBoundCheck(){if(qaRenderLock)throw new Error('A GPU diagnostic already owns the renderer');qaRenderLock=true;try{const {runFireworksBoundGPUCheck}=await import('./verification/fireworks/bound-gpu-check.js');return await runFireworksBoundGPUCheck(THREE,renderer,(T,options)=>createFireworks(T,{...options,clusterModel:'moments'}));}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runFireworksContactCheck(){const {runFireworksContactCheck}=await import('./verification/fireworks/contact-gpu-check.js');return runFireworksContactCheck(THREE,renderer,createFireworks);},
    async runFireworksAudioABCheck(){const {runFireworksAudioABCheck}=await import('./verification/fireworks/audio-ab-check.js');return runFireworksAudioABCheck({capture:true});},
    async runCelestialDiscCheck(){const {runCelestialDiscCheck}=await import('./verification/celestial-disc-gpu-check.js');return runCelestialDiscCheck(THREE,renderer,atmosphere);},
    async runStarFieldCheck(){const {runStarFieldCheck}=await import('./verification/star-field-gpu-check.js');return runStarFieldCheck(THREE,renderer,atmosphere);},
    async runCelestialZeroCheck(){const {runCelestialZeroCheck}=await import('./verification/celestial-zero-gpu-check.js');return runCelestialZeroCheck(THREE,renderer,atmosphere);},
    async runCelestialZeroCostCheck(){const {runCelestialZeroCostCheck}=await import('./verification/celestial-zero-cost-gpu.js');return runCelestialZeroCostCheck(THREE,renderer,atmosphere,{camera,width:lens.state.width,height:lens.state.height,cubePosition:[0,2,0]});},
    async runRadianceRangeCheck(){const {runRadianceRangeGPUCheck}=await import('./verification/radiance-range-gpu-check.js');return runRadianceRangeGPUCheck(THREE,renderer);},
    async runRadianceDefaultBufferCheck(){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A live renderer with no active GPU diagnostic is required');qaRenderLock=true;try{const {runRadianceDefaultBufferGPUCheck}=await import('./verification/r9-radiance-default-buffer-gpu-check.js');return await runRadianceDefaultBufferGPUCheck(THREE,renderer);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    interactions(){return {stones:stoneThrow.state,underwater:stoneThrow.underwaterState,resting:stoneThrow.restingState,stoneDiagnostics:stoneThrow.diagnostics(),splashes:splashes.state,pending:!!pendingThrow};},
    pickFocus(u,v){return lens.pickFocus(u,v);},
    night(){const light=atmosphere.lighting();return {settings:nightSettings,lighting:Object.fromEntries(Object.entries(light).map(([k,v])=>[k,v?.isColor||v?.isVector3?v.toArray():v]))};},
    display(){return {report:displayReport,calibration:hdrCalibration};},
    refreshDisplay,
    setNight:setNightScene,nightPreset:setNightPreset,
    graphics(){return {indirect:indirectLighting.diagnostics(),shadows:shadowQuality.diagnostics(),hdr:hdrOutput.state,displayTransform:displayTransform.state};},
    indirectProbeState(){const u=indirectLighting.uniforms;return{red:Array.from(u.uGIProbeR.value),green:Array.from(u.uGIProbeG.value),blue:Array.from(u.uGIProbeB.value),exposure:u.uGIExposureScale.value,enabled:u.uGIEnabled.value};},
    setTransientIndirect(enabled){transientIndirectEnabled=!!enabled;updateScenePhotometry(0,true);lens.resetTemporalHistory('local indirect comparison');lastPausedRenderKey=null;return indirectLighting.diagnostics().transient;},
    setGraphics,
    setSea,
    async runNightCheck(){const {runNightSkyCheck}=await import('./verification/night-sky-gpu-check.js');return runNightSkyCheck(THREE,renderer,atmosphere);},
    async runVegetationMotionCheck(){const {runVegetationMotionGPUCheck}=await import('./verification/vegetation-motion-gpu-check.js');const {selectiveTemporalGLSL}=await import('./lens.js');return runVegetationMotionGPUCheck(THREE,renderer,grove,camera,selectiveTemporalGLSL);},
    async runSeaStateCheck(){const {runSeaStateCheck}=await import('./verification/sea-state-gpu-check.js');return runSeaStateCheck(THREE,renderer);},
    async runIndirectCheck(){const {runIndirectLightingGPUCheck}=await import('./verification/indirect-lighting-gpu-check.js');return runIndirectLightingGPUCheck(THREE,renderer,indirectLighting);},
    setLens(value){return configureLensSettings(value,{sync:true});},
    setRenderScale(value){renderScale=THREE.MathUtils.clamp(value,.6,1);resize();},
    async benchmarkFrozenSmoke({seconds=3,projectionMode='ellipsoid',bakeMode='tiled64'}={}){if(jointSmokePilot)throw new Error('Disable the joint pilot before an incumbent isolated QA measurement');
      if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active)throw new Error('A rendering diagnostic is active');
      if(graphicsContextInterrupted)throw new Error('Graphics context interrupted');
      const paused=parameters.paused,override=qaCameraExposureEV,pauseEpoch=pauseIntentEpoch,launches=fireworks.diagnostics().launches,throws=stoneThrow.diagnostics().counters.launched;
      try{
        qaCameraExposureEV=radiometry.state.cameraEV;parameters.paused=false;qaFrozenWorkload=true;
        pyroSmoke.setProjectionMode(projectionMode);pyroSmoke.setLightingBakeMode(bakeMode);updateScenePhotometry(0,true);lastPausedRenderKey=null;
        const before=frozenWorkloadInfo();qaFrozenGuard={key:JSON.stringify(before),before,cancelled:false};
        const result=await renderBenchmark.start(Math.max(3,Math.min(5,seconds))),after=frozenWorkloadInfo();
        const interrupted=qaFrozenGuard.cancelled||graphicsContextInterrupted||document.hidden||qaRenderLock||result.frames<2||result.validity!=='valid'||JSON.stringify(after)!==qaFrozenGuard.key;
        return{...result,...(interrupted?{status:'cancelled',validity:'invalid',averageFps:null,reason:result.reason||'Scene changed during measurement; sample discarded'}:{}),workload:{before,after,interrupted},scope:'Actual main+reflection draws of one frozen physical workload; input changes cancel the measurement; not evolving-simulation performance',projectionMode,bakeMode};
      }finally{
        qaFrozenGuard=null;qaFrozenWorkload=false;
        if(graphicsContextInterrupted)parameters.paused=true;
        else if(pauseIntentEpoch===pauseEpoch&&fireworks.diagnostics().launches===launches&&stoneThrow.diagnostics().counters.launched===throws)parameters.paused=paused;
        qaCameraExposureEV=override;ui.setPaused(parameters.paused);clock.getDelta();lastPausedRenderKey=null;
      }
    },
    benchmark(seconds=12){if(graphicsContextInterrupted)throw new Error('Graphics context was interrupted; reload before benchmarking');if(parameters.paused)throw new Error('Resume the scene before benchmarking rendering');return renderBenchmark.start(seconds);},
    setFrameProbe(callback){frameProbe=typeof callback==='function'?callback:null;},
    profileFrames(seconds=10){activeFrameProfile={started:performance.now(),until:performance.now()+seconds*1000,frames:[]};return true;},
    frameProfile(){return activeFrameProfile;},
    get audio(){return soundscape.state;},
    captureAudio(){return soundscape.startCapture();},
    stopAudioCapture(){return soundscape.stopCapture();},
    async renderAudio(options){const result=await soundscape.renderOffline(options);let binary='';for(let i=0;i<result.wav.length;i+=32768)binary+=String.fromCharCode(...result.wav.subarray(i,i+32768));return {report:result.report,wavBase64:btoa(binary)};},
    atmosphere(){return {lighting:atmosphere.lighting(),diagnostics:atmosphere.diagnostics(),cloudShadowAtIsland:atmosphere.cloudShadowAt([0,1,0]),shadowCache:cloudShadowCache.state,sharedSun:{sceneRGB:sunLight.color.toArray(),waterRGB:water.uniforms.uSunColor.value.toArray(),leafRGB:grove.userData.sunColor.value.toArray(),sceneIntensity:sunLight.intensity,waterIntensity:water.uniforms.uSunIrradiance.value}};},
    setSun(value){Object.assign(parameters.sun,value);celestialFrame=celestialController.configure({mode:'artistic'});setSun();syncTimeUI();},
    setView:moveTo,
    interfaceState(){return structuredClone(ui.state);},
    cameraTransition(){return transition?{elapsedSeconds:transition.elapsedSeconds,...transition.plan.diagnostics}:null;},
    setCamera(position,target,{expandFramingLimits=false}={}){manualCameraActivity();navigation.stop();camera.position.fromArray(position);controls.target.fromArray(target);if(expandFramingLimits){controls.maxDistance=Math.max(controls.maxDistance,camera.position.distanceTo(controls.target)*1.2);controls.maxTargetRadius=Math.max(controls.maxTargetRadius,controls.target.length()*1.2);}controls.update();},
    drop(x,z){dropStone(x,z);},
    float(x,z){return floatingLeaves.spawn(x,z);},
    flow(x,z){return hydrodynamics.sampleFlow(x,z);},
    spectrum(){return waveSpectrum.state;},
    treeShadows(){return water.treeShadow.diagnostics();},
    waterDiagnostics(){return water.diagnostics();},
    cloudShape(value){atmosphere.uniforms.uCloudShapeBlend.value=Math.max(0,Math.min(2,value));cloudShadowCache.update(time,true);updateIndirect(true);updateEnvironment();lens.resetTemporalHistory('cloud shape');return atmosphere.uniforms.uCloudShapeBlend.value;},
    cloudDensityAt(position,physicalTime=time){return atmosphere.cloudDensityAt(position,physicalTime);},
    setCloudBaseContinuity(value){
      const flag=atmosphere.setCloudBaseContinuity(value);
      lastPausedRenderKey=null;lens.resetTemporalHistory('cloud base continuity');
      cloudShadowCache.update(time,true);updateIndirect(true);caustics?.update(time,true);updateEnvironment();
      return flag;
    },
    async runCloudBaseContinuityCheck(){const {runCloudBaseContinuityGPUCheck}=await import('./verification/cloud-base-continuity-gpu-check.js');return runCloudBaseContinuityGPUCheck(THREE,renderer,atmosphere);},
    weather(){return atmosphere.getWeatherState();},
    air(){return aerialPerspective.diagnostics();},
    setAir(value){Object.assign(parameters.air,value);lens.resetTemporalHistory('air parameters');setAir();},
    setDiffuseAir(enabled){atmosphere.setDiffuseAirEnabled(enabled);updateEnvironment();setAir();lens.resetTemporalHistory('diffuse air comparison');lastPausedRenderKey=null;return atmosphere.diagnostics().diffuseAir;},
    leafDebug(value){lastPausedRenderKey=null;lens.resetTemporalHistory('leaf diagnostic');return grove.userData.setLeafDebug?.(value);},
    setLeafCentroid(value){lastPausedRenderKey=null;lens.resetTemporalHistory('centroid colour diagnostic');return grove.userData.setCentroidColour(value);},
    setPalmFrameMode(mode){
      // A diagnostic switch cannot reuse GI emitter patches built from the
      // other rest geometry. Final production selection rebuilds the scene.
      if(parameters.graphics.indirect!=='off')throw new Error('Palm frame A/B requires indirect lighting off; emitter geometry is cached at scene construction.');
      const result=grove.userData.setPalmFrameMode(mode);
      if(result.changed){lastPausedRenderKey=null;lens.resetTemporalHistory('palm cross-section frame');scene.traverse(o=>{if(o.isLight&&o.shadow)o.shadow.needsUpdate=true;});renderer.shadowMap.needsUpdate=true;}
      return result;
    },
    palmFrameDiagnostics(){return grove.userData.palmFrameDiagnostics();},
    async runPalmFrameCoverageCheck(){const {runPalmFrameCoverageCheck}=await import('./verification/palm-frame-coverage-gpu-check.js');return runPalmFrameCoverageCheck(THREE,renderer,grove);},
    async runPalmFrameCostCheck(){if(jointSmokePilot)throw new Error('Disable the joint pilot before an incumbent isolated QA measurement');const {runPalmFrameCostGPUCheck}=await import('./verification/palm-frame-cost-gpu-check.js');return runPalmFrameCostGPUCheck(THREE,renderer,window.__ATOLL__,()=>lens.render(scene,camera.position.distanceTo(controls.target),{sdr:true}));},
    async runLeafCentroidCheck(){const {runLeafCentroidCheck}=await import('./verification/leaf-centroid-gpu-check.js');return runLeafCentroidCheck(THREE,renderer);},
    vegetationDiagnostics(){return grove.userData.diagnostics?.();},
    leafMips(){return grove.userData.inspectLeafMips?.(renderer);},
    async textureAudit(){
      const {auditTextureMipmaps}=await import('./verification/mipmap-audit.js?v=2');
      const entries=[],seen=new Set();
      const add=(texture,label,policy,role)=>{if(!texture?.isTexture||seen.has(texture.uuid))return;seen.add(texture.uuid);entries.push({texture,label,policy,role});};
      scene.traverse(o=>{if(o.isMesh)for(const material of Array.isArray(o.material)?o.material:[o.material])for(const [key,value]of Object.entries(material))if(value?.isTexture)add(value,`${material.type}.${key}`,'mip','surface material');});
      for(const [name,uniform]of Object.entries(water.uniforms)){
        const mip=/^uWave[0-3]$|^uSand|^uReflect$|^uSkyCube$|^uCaustic$|^uCloudNoise$/.test(name);
        add(uniform.value,name,mip?'mip':/^uDepth$|Depth|ShadowMap/.test(name)?'exact':'numeric','water/shared field');
      }
      add(reflectionTexture(),'reflection depth','exact','visibility');
      add(sunLight.shadow.map?.texture,'directional RGBA packed depth','exact','PCF comparison');
      return auditTextureMipmaps(renderer,entries,{probeMutable:true});
      function reflectionTexture(){return water.reflection.depthTexture;}
    },
    async runAerialCheck(){const {runAerialGPUCheck}=await import('./verification/aerial-gpu-check.js');return runAerialGPUCheck(THREE,renderer);},
    async runRefractionPropCheck(version=1){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A live renderer with no active GPU diagnostic is required');qaRenderLock=true;try{const {runRefractionPropGPUCheck}=await import(`./verification/r13-refraction-gpu-check.js?v=${version}`);return await runRefractionPropGPUCheck(THREE,renderer,{water});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runWaterOpticsCheck(version=1){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A live renderer with no active GPU diagnostic is required');qaRenderLock=true;try{const {runWaterOpticsGPUCheck}=await import(`./verification/r14-water-optics-gpu-check.js?v=${version}`);return await runWaterOpticsGPUCheck(THREE,renderer,{water,splash:splashes});}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runBackgroundAirCheck(version=1){if(qaRenderLock||graphicsContextInterrupted)throw new Error('A live renderer with no active GPU diagnostic is required');qaRenderLock=true;try{const {runBackgroundAirGPUCheck}=await import(`./verification/r12-background-air-gpu-check.js?v=${version}`);return await runBackgroundAirGPUCheck(THREE,renderer);}finally{clock.getDelta();qaRenderLock=false;lastPausedRenderKey=null;}},
    async runWaterTemporalCheck(){const {runTemporalWaterCheck}=await import('./verification/temporal-water-gpu-check.js');const {selectiveTemporalGLSL}=await import('./lens.js');return runTemporalWaterCheck(THREE,renderer,selectiveTemporalGLSL);},
    async waterVariance(regions){const {createWaterVarianceProbe}=await import('./verification/flicker-audit.js?v=3');const probe=createWaterVarianceProbe(THREE,renderer,water,camera);try{return probe.read(regions);}finally{probe.dispose();}},
    async replayFlicker({regions,frames=48,startTime=10,step=1/60,mode=0,kind='water'}={}){if(jointSmokePilot)throw new Error('Disable the joint pilot before an incumbent isolated QA measurement');
      const {createFlickerAnalyzer,createBrowserSnapshotReader}=await import('./verification/flicker-audit.js?v=6');
      const saved={paused:parameters.paused,lens:{...parameters.lens},offset:water.uniforms.uCurrentOffset.value.clone(),debug:water.uniforms.uDebugMode.value};
      const reader=createBrowserSnapshotReader(),reports={};parameters.paused=true;frames=Math.max(16,Math.min(96,frames));
      try{
        for(const enabled of [false,true]){
          parameters.lens[kind==='water'?'glintAA':'temporal']=enabled;setLens();water.uniforms.uDebugMode.value=mode;
          const analyzer=createFlickerAnalyzer(regions,{warmupFrames:0});
          for(let frame=-32;frame<frames;frame++){
            const sampleTime=startTime+frame*step;
            water.uniforms.uCurrentOffset.value.copy(saved.offset).addScaledVector(water.uniforms.uMeanCurrent.value,sampleTime-time);
            waveSpectrum.update(sampleTime,true);grove.userData.update(sampleTime);water.uniforms.uTime.value=sampleTime;
            caustics.update(sampleTime);sunLight.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;
            water.render(sampleTime);lens.render(scene,camera.position.distanceTo(controls.target));
            if(frame>=0)analyzer.push({timestamp:frame*step*1000,simulationTime:sampleTime,cameraKey:JSON.stringify([camera.position.toArray(),controls.target.toArray()]),phase:null,renderScale,regions:reader.read(renderer.domElement,regions)});
          }
          reports[enabled?'enabled':'disabled']=analyzer.finish();
        }
        return {kind:'Controlled identical-time directional-wave/wind replay; same camera, sky, hydro snapshot and source phases',captureMethod:'browser-2d-snapshot',frames,startTime,step,mode,scope:kind,reports,limits:['Bounded QA render, not production frame-rate measurement','SWE snapshot and sky/cloud field remain fixed; caustics and foliage shadow update at replay times','Residual includes real wave/wind motion; not all reduction is removal of sampling noise']};
      }finally{
        parameters.paused=saved.paused;Object.assign(parameters.lens,saved.lens);setLens();water.uniforms.uDebugMode.value=saved.debug;
        water.uniforms.uCurrentOffset.value.copy(saved.offset);waveSpectrum.update(time,true);grove.userData.update(time);water.uniforms.uTime.value=time;caustics.update(time,true);sunLight.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;lastPausedRenderKey=null;reader.dispose();
      }
    },
    setWeather,
    get splashes(){return splashes.state;},
    floatVisible(){return floatAtVisibleWater();},
    locateLeaf(){return floatingLeaves.locate(camera,{viewportWidth:innerWidth,viewportHeight:innerHeight});},
    focusLeaf,
    hydroDiagnostics(){return hydrodynamics.diagnostics({readback:true});},
    async runHydroCheck(){const {runHydroCheck}=await import('./verification/hydro-gpu-check.js');return runHydroCheck(THREE,renderer,createHydrodynamics);},
    async runSpectrumCheck(version=1){const {runSpectrumCheck}=await import(`./verification/spectral-gpu-check.js?v=${version}`);return runSpectrumCheck(THREE,renderer,waveSpectrum);},
    async runTemporalCheck(){const {runTemporalResolveCheck}=await import('./verification/temporal-aa-gpu-check.js');const {selectiveTemporalGLSL}=await import('./lens.js');return runTemporalResolveCheck(THREE,renderer,selectiveTemporalGLSL);},
    async runTemporalSequenceCheck(version=1){const {runTemporalSequenceCheck}=await import(`./verification/temporal-sequence-gpu-check.js?v=${version}`);const {selectiveTemporalGLSL}=await import('./lens.js');return runTemporalSequenceCheck(THREE,renderer,selectiveTemporalGLSL);},
    async runWeatherCheck(){const {runWeatherCheck}=await import('./verification/weather-gpu-check.js');return runWeatherCheck(THREE,renderer,atmosphere);},
    pause(value=true){pauseIntentEpoch++;parameters.paused=value;if(value)pauseTargetTime=null;ui.setPaused(value);},
    pauseAtPhysicalTime(target){if(!Number.isFinite(target)||target<time)throw new RangeError('Pause target must be finite and not earlier than physical time');pauseTargetTime=target===time?null:target;if(target===time){parameters.paused=true;ui.setPaused(true);}return{target,current:time};},
    debugFill(hemiIntensity,environmentIntensity){hemi.intensity=hemiIntensity;scene.environmentIntensity=environmentIntensity;},
    diagnostics(){return {sandSource:sandShader?.fragmentShader,sandUniforms:{sun:sunDirection.toArray(),texture:sandShader?.uniforms.uSand.value.image?.width},sand:sand.metadata,vegetation:grove.userData.diagnostics?.(),sceneMeshes:scene.children.filter(o=>o.isMesh).map(o=>({name:o.name,y:o.position.y,material:o.material.type})),sky:sky.userData};},
    debugSand(mode=0){sandShader.uniforms.uSandInspect.value=mode;},
    debugWater(mode=0){water.uniforms.uDebugMode.value=mode;lens.resetTemporalHistory('water diagnostic');lastPausedRenderKey=null;},
    reflectionDiagnostics(){return inspectTarget(water.reflection);},
    debugBuffer(name){
      if(!name){inspection=null;return;}
      const texture=name==='shadow'?sunLight.shadow.map.texture:name==='reflection'?water.reflection.texture:name==='refraction'?water.refraction.texture:caustics.texture;
      const inspectMaterial=name==='shadow'?new THREE.ShaderMaterial({uniforms:{uInput:{value:texture}},toneMapped:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'#include <packing>\nuniform sampler2D uInput;varying vec2 vUv;void main(){float d=unpackRGBAToDepth(texture2D(uInput,vUv));gl_FragColor=vec4(vec3(d),1.);}'}):new THREE.MeshBasicMaterial({map:texture,toneMapped:true});
      const inspectScene=new THREE.Scene();inspectScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),inspectMaterial));
      inspection={scene:inspectScene,camera:new THREE.OrthographicCamera(-1,1,1,-1,0,2)};inspection.camera.position.z=1;
    },
    screenshot(){renderSceneFrame({includeWater:false,sdr:true});return renderer.domElement.toDataURL('image/png');}
  };
}

let sandShader;
function makeTerrain(textures){
  const geometry=new THREE.PlaneGeometry(2,2,560,560).rotateX(-Math.PI/2);
  const p=geometry.attributes.position;
  const spread=v=>Math.sign(v)*(Math.abs(v)<.88?Math.abs(v)/.88*68:68+(Math.abs(v)-.88)/.12*170);
  for(let i=0;i<p.count;i++){const x=spread(p.getX(i)),z=spread(p.getZ(i));p.setXYZ(i,x,terrainHeight(x,z),z);}
  geometry.computeVertexNormals();
  sand=createSand(THREE,{geometry,textures,sunDirection:keyDirection,getCaustics:()=>caustics,terrainHeight,onCompile:shader=>{sandShader=shader;}});
  sand.mesh.castShadow=true;
  scene.add(sand.mesh,sand.detailGroup);
  const bottom=new THREE.Mesh(new THREE.PlaneGeometry(18000,18000).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:'#d9d1b3',roughness:1}));bottom.position.y=-33;scene.add(bottom);
}

function makeCoralAndShells(){
  const rng=seeded(39821);
  const material=new THREE.MeshStandardMaterial({color:'#e5d9bd',roughness:.94});
  const geometry=new THREE.IcosahedronGeometry(1,1);
  const coral=new THREE.InstancedMesh(geometry,material,130);
  coral.layers.enable(1);
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3();
  for(let i=0;i<130;i++){
    const a=rng()*Math.PI*2,r=1.+rng()*.8;
    const x=Math.cos(a)*32*r,z=Math.sin(a)*20*r;
    const h=terrainHeight(x,z);const s=.015+rng()*.07;
    q.setFromEuler(new THREE.Euler(rng()*3,rng()*6,rng()*3));
    scale.set(s,s*(.25+rng()*.5),s*(.6+rng()*.8));
    matrix.compose(new THREE.Vector3(x,h+s*.13,z),q,scale);coral.setMatrixAt(i,matrix);
    coral.setColorAt(i,new THREE.Color().setHSL(.09+rng()*.04,.08+rng()*.13,.63+rng()*.2));
  }
  coral.castShadow=coral.receiveShadow=true;scene.add(coral);
}
function seeded(seed){return ()=>{seed=(Math.imul(1664525,seed)+1013904223)|0;return (seed>>>0)/4294967296;};}
function makeFish(){
  const material=new THREE.MeshStandardMaterial({color:'#72918a',metalness:.12,roughness:.4});
  const bodyGeo=new THREE.SphereGeometry(1,12,6);
  const tailGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(-.16,.14,0),new THREE.Vector3(-.16,-.14,0)]);tailGeo.setIndex([0,1,2]);tailGeo.computeVertexNormals();
  for(let i=0;i<7;i++){
    const group=new THREE.Group();
    const body=new THREE.Mesh(bodyGeo,material);body.scale.set(.23,.075,.055);group.add(body);
    const tail=new THREE.Mesh(tailGeo,new THREE.MeshStandardMaterial({color:'#5e8178',side:THREE.DoubleSide,roughness:.6}));tail.position.x=-.2;group.add(tail);
    group.position.set(21+i*.8,-.75-i*.07,20+i*.24);scene.add(group);fish.push({group,tail,offset:i*.7});
  }
}

function setSun(refresh=true){
  if(!sky)return;
  exposureResetPending=true;
  lens?.resetTemporalHistory?.('sun');
  const s=parameters.sun;
  const e=THREE.MathUtils.degToRad(s.elevation),a=THREE.MathUtils.degToRad(s.azimuth);
  sunDirection.set(Math.cos(e)*Math.sin(a),Math.sin(e),-Math.cos(e)*Math.cos(a));
  sky.material.uniforms.sunPosition.value.copy(sunDirection);
  sky.material.uniforms.uSkyIntensity.value=s.intensity;
  sunLight.position.copy(sunDirection).multiplyScalar(110);
  atmosphere.setSun({direction:sunDirection,intensity:s.intensity});
  applySolarLighting();
  if(renderer){sunLight.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;}
  shadowQuality?.update();
  if(localLights)updateScenePhotometry(0,true);else{cloudShadowCache?.update(time,true);updateIndirect(true);}
  ui.syncSun(s);
  if(refresh){clearTimeout(environmentTimer);environmentTimer=setTimeout(updateEnvironment,170);}
}
function applySolarLighting(){
  const s=parameters.sun,lighting=atmosphere.lighting();
  keyDirection.copy(lighting.keyDirection||sunDirection);
  sunLight.position.copy(keyDirection).multiplyScalar(110);
  const scale=radiometry.state.sceneScale;
  sunLight.intensity=3.6*(lighting.physicalKeyStrength??lighting.physicalSunStrength??lighting.keyStrength??lighting.sunStrength)*scale;
  sunLight.color.copy(lighting.keyColor||lighting.sunColor);
  sunLight.castShadow=sunLight.intensity>1e-8;
  const chromeSunAltitude=celestialFrame?.mode==='astronomical'?celestialFrame.sun.altitudeDeg:parameters.sun.elevation;
  document.body.classList.toggle('night-view',chromeSunAltitude<4);
  updateExposure(lighting);
  // The HDR already supplies diffuse skylight. Keep the extra ground/sky fill
  // small enough to preserve the direct-sun / shade ratio on white coral sand.
  // Sky irradiance comes from the same radiance cube. This hemisphere is only
  // a bounded white-sand ground-bounce approximation, strongest on leaf undersides.
  hemi.color.setRGB(0,0,0);hemi.groundColor.setRGB(0,0,0);hemi.intensity=1;
  // skyTintPhysical already includes the artistic solar intensity. Applying it
  // again here would square only the water ambient while land/sky stay linear.
  if(water)water.uniforms.uIntensity.value=1;
  if(water)water.uniforms.uSunIrradiance.value=sunLight.intensity;
  if(water)water.uniforms.uSunColor.value.copy(sunLight.color);
  if(water)water.uniforms.uSkyColor.value.copy(lighting.skyTintPhysical||lighting.skyTint).multiplyScalar(1.7*scale);
  if(grove)grove.userData.sunDirection.value.copy(keyDirection);
  if(grove?.userData.sunColor)grove.userData.sunColor.value.copy(sunLight.color);
  if(grove?.userData.sunIrradiance)grove.userData.sunIrradiance.value=sunLight.intensity;
  if(grove?.userData.translucencyIntensity)grove.userData.translucencyIntensity.value=1;
}
function setWeather(value){
  Object.assign(parameters.weather,value);if(!atmosphere)return null;
  const state=atmosphere.setWeather(value,{immediate:parameters.paused});
  setAir();updateScenePhotometry(0,true);
  lens?.resetTemporalHistory?.('weather');
  if(parameters.paused){clearTimeout(environmentTimer);environmentTimer=setTimeout(updateEnvironment,170);}
  return state;
}
function setAir(){
  if(!atmosphere)return;
  const weather=atmosphere.getWeatherState().current;
  const coefficients=marineAirCoefficients({humidity:weather.humidity,aerosolScale:parameters.air.aerosolScale});
  const mieScale=coefficients.normalizedMieScale;
  if(lastAirMieScale===null||Math.abs(mieScale-lastAirMieScale)>1e-4){
    atmosphere.setAirMieScale(mieScale);lastAirMieScale=mieScale;
    applySolarLighting();
  }
  aerialPerspective?.configure({...parameters.air,quality:parameters.quality});
  aerialPerspective?.update({time,weather,sunDirection:keyDirection,quality:parameters.quality,sunLight});
}
function updateEnvironment(){
  if(environmentCapture){const c=celestialController?.state;environmentCapture.refresh({time,utcMs:c?.utcMs,storageEV:radiometry.state.storageEV,physicalRevision:c?.physicalSkyRevision,sunDirection:sunDirection});applyEnvironmentRatios();return;}
  skyCubeTarget.texture.generateMipmaps=true;
  sky.material.uniforms.uSolarDisk.value=0;
  cubeCamera.update(renderer,environmentScene);
  sky.material.uniforms.uSolarDisk.value=1;
  const old=environmentTarget;
  environmentTarget=pmrem.fromCubemap(skyCubeTarget.texture);
  scene.environment=environmentTarget.texture;
  scene.environmentIntensity=.8;
  if(old)old.dispose();
  lastPmremTime=time;lastCubeTime=time;cubeFace=0;
}
function updateDynamicEnvironment(){
  if(environmentCapture){const c=celestialFrame||celestialController.state;environmentCapture.update({time,utcMs:c.utcMs,storageEV:radiometry.state.storageEV,physicalRevision:c.physicalSkyRevision,sunDirection,paused:parameters.paused});applyEnvironmentRatios();return;}
  if(parameters.paused||time-lastCubeTime<1/12)return;
  const previous=renderer.getRenderTarget();
  sky.material.uniforms.uSolarDisk.value=0;
  skyCubeTarget.texture.generateMipmaps=cubeFace===5;
  renderer.setRenderTarget(skyCubeTarget,cubeFace);
  renderer.render(environmentScene,cubeCamera.children[cubeFace]);
  renderer.setRenderTarget(previous);
  sky.material.uniforms.uSolarDisk.value=1;
  cubeFace=(cubeFace+1)%6;lastCubeTime=time;
  if(cubeFace===0&&time-lastPmremTime>=2){
    const old=environmentTarget;environmentTarget=pmrem.fromCubemap(skyCubeTarget.texture);scene.environment=environmentTarget.texture;old?.dispose();lastPmremTime=time;
  }
}
function resize(){
  if(!renderer)return;
  // Even a same-size canvas reset discards its presented drawing buffer.
  // A paused view must redraw/reconverge after every resize notification.
  lastPausedRenderKey=null;pausedSteadyFrames=0;pausedRenderCached=false;
  const dpr=Math.min(devicePixelRatio,parameters.renderSampling?.dprCap??1.65);
  renderer.setPixelRatio(dpr);renderer.setSize(innerWidth,innerHeight);
  camera.aspect=innerWidth/innerHeight;camera.setFocalLength(parameters.lens.focal);
  renderer.getDrawingBufferSize(size);
  const sceneW=Math.max(1,Math.round(size.x*renderScale)),sceneH=Math.max(1,Math.round(size.y*renderScale));
  water?.resize(sceneW,sceneH,parameters.quality);
  lens?.setSize(sceneW,sceneH,size.x,size.y);
}
function validateLensShutter(settings){
  const shutter=settings.shutterSeconds===undefined?1/120:settings.shutterSeconds;
  if(!Number.isFinite(shutter)||shutter<0||shutter>1)throw new RangeError('Effect shutter seconds requires0..1');
}
function configureLensSettings(value={}, {markQuality=false,sync=false}={}){
  if('firelightAA'in value&&typeof value.firelightAA!=='boolean')throw new TypeError('Firelight AA requires a boolean');
  if('opticalBloomStrength'in value&&(!Number.isFinite(value.opticalBloomStrength)||value.opticalBloomStrength<0||value.opticalBloomStrength>1))throw new RangeError('Optical bloom strength requires 0..1');
  validateLensShutter({...parameters.lens,...value});
  const nextShutter=value.shutterSeconds??parameters.lens.shutterSeconds??1/120;if(nextShutter>1/60&&(fireworksSettings.effectProfile==='powered-bees-v1'||fireworks?.diagnostics().activeEvents?.some(e=>e.effectProfile==='powered-bees-v1')))throw new RangeError('Powered effects currently require shutterSeconds <=1/60');
  if('focal'in value&&value.focal!==parameters.lens.focal)stopDirector('focal length changed');
  const changed=['antialias','temporal','glintAA','opticalBloom','firelightAA'].some(k=>k in value&&value[k]!==parameters.lens[k]);
  Object.assign(parameters.lens,value);
  if(markQuality&&changed)markCustomQuality();
  setLens();if(sync)ui.syncLens(parameters.lens);
  return {...parameters.lens};
}
function setLens(){
  validateLensShutter(parameters.lens);
  if(!renderer||!camera)return;
  camera.setFocalLength(parameters.lens.focal);
  updateExposure();
  lens?.configure({...parameters.lens,quality:parameters.quality,msaaSamples:parameters.renderSampling?.msaaSamples});
  if(water?.uniforms.uGlintAA)water.uniforms.uGlintAA.value=parameters.lens.glintAA?1:0;
  governor?.setTargetFps(parameters.graphics.targetFps);
  if(governor&&governor.state.enabled!==parameters.lens.automatic)governor.setEnabled(parameters.lens.automatic);
}
function updateExposure(lighting=atmosphere?.lighting?.()){
  if(renderer)renderer.toneMappingExposure=radiometry.state.outputExposureScale;
}
async function setNightScene(value={}){
  if(value.autoExposure===false&&nightSettings.autoExposure){parameters.lens.manualExposureEV=THREE.MathUtils.clamp(cameraExposure.state.actualBaseEV??adaptedCameraEV??0,-4,20);ui.syncLens(parameters.lens);}
  Object.assign(nightSettings,value);if(!atmosphere)return null;
  if(value.date){const hasZone=/Z$|[+-]\d\d:\d\d$/.test(value.date),offset=celestialController?.state.timeZoneOffsetMinutes??480,utc=Date.parse(hasZone?value.date:value.date+'Z')-(hasZone?0:offset*60000);ui.setNight({autoExposure:nightSettings.autoExposure});return setTime({utcMs:utc,mode:'astronomical'});}
  updateScenePhotometry(0,true);ui.setNight({autoExposure:nightSettings.autoExposure});syncTimeUI();return atmosphere.lighting();
}
async function applyShowcase(id){
  const presets={'glass-day':{time:'day',view:'lagoon'},sunset:{time:'sunset',view:'sun'},'blue-hour':{time:'sunset',offsetMinutes:6,view:'fireworks'},'starry-night':{time:'stars',view:'stars'}};
  const preset=presets[id];if(!preset)throw new RangeError('Unknown showcase preset');
  if(!celestialController||!camera||qaRenderLock||qualityApplying||graphicsContextInterrupted)throw new Error('Scene is not ready for a showcase');
  const request=++showcaseRequest;
  // Presets compose existing time/camera operations. Sound, weather, quality,
  // physical smoke and active fireworks remain independent user choices.
  const changed=await setNightPreset(preset.time);if(changed===false||request!==showcaseRequest)return false;
  await setTime({running:false,...(preset.offsetMinutes?{utcMs:celestialController.state.utcMs+preset.offsetMinutes*60000}:{})});
  if(request!==showcaseRequest)return false;
  ui.syncTime({preset:preset.offsetMinutes?null:preset.time});
  showcaseCameraApplying=true;
  try{moveTo(preset.view);}finally{showcaseCameraApplying=false;}
  return {id,view:preset.view,clockStopped:true,launched:false};
}

async function setNightPreset(name){
  if(!celestialController)return;
  const c=celestialController.state,day=Math.floor(c.utcMs/86400000)*86400000,noon=day+(12-c.observer.longitudeDeg/15)*3600000;
  let utc=name==='moon'?Date.parse('2026-10-26T14:00:00Z'):name==='stars'?Date.parse('2026-08-13T14:00:00Z'):noon;
  if(name==='dawn'||name==='sunset'){const approx=noon+(name==='dawn'?-6:6)*3600000;let lo=approx-3*3600000,hi=approx+3*3600000;const altitude=t=>exactCelestialEphemeris(t,c.observer).sun.altitudeDeg+.30;let a=altitude(lo),b=altitude(hi);if(a*b>0){ui.notify('此地点今天没有对应的日出或日落，时间保持不变');return false;}for(let i=0;i<20;i++){const mid=(lo+hi)/2,v=altitude(mid);if(a*v<=0)hi=mid;else{lo=mid;a=v;}}utc=(lo+hi)/2;}
  await setTime({utcMs:utc,mode:'astronomical'});ui.syncTime({preset:name});ui.notify({day:'已切到当地白昼',dawn:'已切到当地黎明',sunset:'已切到当地日落',moon:'已切到月夜示例日期',stars:'已切到无月夜示例日期'}[name]||'时间已调整');return {name,utcMs:utc};
}
function updateIndirect(force=false,delta=1/60){
  const l=atmosphere?.lighting();
  indirectLighting?.update({time,delta:parameters.paused?0:delta,force,sunDirection:l?.keyDirection||sunDirection,sunColor:l?.keyColor||sunLight?.color,sunIntensity:3.6*(l?.physicalKeyStrength??0)});
}
function arrayRGB(value,fallback=[0,0,0]){return value?.toArray?value.toArray():Array.isArray(value)?value:fallback;}
function currentOptics(){const l=lens?.state;return {kernelBudgetFloat32,width:l?.width||innerWidth,height:l?.height||innerHeight,focalMm:parameters.lens.focal,aperture:parameters.lens.aperture,focusMetres:l?.focusMetres||60,sensorHeightMm:camera?.getFilmHeight()||24,firelightSigmaPixels:parameters.lens.firelightAA===false?.28:.42,dof:parameters.lens.dof,vignette:parameters.lens.vignette,shutterSeconds:l?.shutterSeconds??parameters.lens.shutterSeconds??1/120};}
function finiteAirPayload(){const light=atmosphere.lighting(),coefficients=marineAirCoefficients({...parameters.air,humidity:atmosphere.getWeatherState().current.humidity});return {...coefficients,enabled:parameters.air.enabled,sunDirection:keyDirection.toArray(),rawSunRGB:arrayRGB(light.keyColor).map(v=>v*3.6*(light.physicalKeyStrength??0)),ambientIrradianceRGB:arrayRGB(light.physicalSkyIrradiance)};}
function applyEnvironmentRatios(){if(!environmentCapture)return;const r=environmentCapture.setSceneExposure(radiometry.state.storageEV);scene.environmentIntensity=.8*r.environmentRatio;if(water){water.uniforms.uSkyCube.value=environmentCapture.cubeTarget.texture;water.uniforms.uSkyCubeScale.value=r.cubeRatio;}}
function markPhotometryPhase(profile,name){if(profile){const now=performance.now();profile.phases[name]=now-profile.last;profile.last=now;}}
function updateScenePhotometry(delta=0,force=false){
  if(!atmosphere||!localLights||!camera)return;
  const detailedOwner=activeFrameProfile&&performance.now()<activeFrameProfile.until?activeFrameProfile:null,detailed=detailedOwner?{time,force,started:performance.now(),phases:{}}:null;
  if(detailed)detailed.last=detailed.started;
  const light=atmosphere.lighting(),baseFrame={time,dt:delta,utcMs:celestialFrame?.utcMs,storageEV:radiometry.state.storageEV,sceneScale:radiometry.state.sceneScale,rawPerCandela:RAW_PER_CANDELA};
  markPhotometryPhase(detailed,'lighting-setup');
  atmosphere.prepareStarView(renderer,camera,{width:lens.state.width,height:lens.state.height,storageEV:baseFrame.storageEV,frame:baseFrame,optics:currentOptics()});
  markPhotometryPhase(detailed,'star-view');
  const clusters=fireworks?.getLightClusters()||[];markPhotometryPhase(detailed,'source-clusters');
  const receiverClusters=fireworks?.getReceiverLightClusters?.()||clusters;
  const b=fireworks?.getBounds({shutterSeconds:parameters.lens.shutterSeconds??1/120});markPhotometryPhase(detailed,'source-world-bounds');
  localLights.update({frame:baseFrame,camera,sunAltitude:celestialFrame?.mode==='astronomical'?celestialFrame.sun.altitudeDeg:parameters.sun.elevation,clusters:receiverClusters,burstBounds:b?.active?[{center:b.centre,radius:b.radius}]:[]});
  environmentLocalLights.update({frame:baseFrame,clusters});
  atmosphere.setTransientLights(clusters,{rawPerCandela:RAW_PER_CANDELA,enabled:fireworksSettings.cloudIllumination});
  markPhotometryPhase(detailed,'local-and-cloud-setup');
  const fieldRequested=fireworksSettings.resolvedSmokeLighting,fieldVisible=fieldRequested&&fireworksSettings.persistentSmoke&&pyroSmoke?.packetCount>0;
  let joint=null;
  if(jointSmokeEligible())try{joint=beginJointSmokePlan(baseFrame,fieldVisible);}catch(error){failJointSmokePlan(error);}
  else discardJointSmokePlan();
  let field;
  try{field=pyroSmoke?.prepareLighting?.({ledger:fieldVisible?(joint?joint.ledger:jointSmokeFault?null:fireworks.getEmissionLedger({rawPerCandela:RAW_PER_CANDELA})):null,enabled:fieldVisible&&!jointSmokeFault})||{effective:false,supported:false,reason:'not-integrated'};}
  catch(error){if(!joint)throw error;failJointSmokePlan(error);field={effective:false,supported:false,reason:'joint-field-failed'};}
  if(joint&&fieldVisible&&!field.effective)failJointSmokePlan(new Error('Joint SH field was not completed: '+field.reason));
  if(joint){joint.fieldVersion=field.version??null;joint.lightingEnabled=fieldVisible;}
  smokeLightStatus={requestedEnabled:fieldRequested,effective:!!field.effective,supported:field.supported!==false,reason:field.reason||null,requiredPairs:field.requiredPairs,maxBakePairs:field.maxBakePairs,version:field.version,reused:!!field.reused,hidden:!fireworksSettings.persistentSmoke,awaitingSmoke:!pyroSmoke?.packetCount};
  markPhotometryPhase(detailed,'resolved-smoke-lighting');
  // Prepare all raw irradiance before selecting FP16 storage exposure. Local
  // flashes bypass the solar cache blend and share the one final P conversion.
  cloudShadowCache?.update(time,force);updateIndirect(force,delta);
  indirectLighting?.prepareTransient({sources:localLights.records,enabled:transientIndirectEnabled&&parameters.graphics.indirect!=='off',physicalTime:time});
  const indirectBound=indirectLighting?.getRadianceBound();
  markPhotometryPhase(detailed,'indirect-and-cloud-shadow');
  const local=localLights.getRadianceBound(),skyBound=atmosphere.getRadianceBound();markPhotometryPhase(detailed,'local-and-sky-bounds');
  const pyro=fireworks?.getRadianceBound({camera,optics:joint?.main.optics??currentOptics(),rawPerCandela:RAW_PER_CANDELA})||{};markPhotometryPhase(detailed,'main-source-bound');
  const pstate=fireworks?.diagnostics();markPhotometryPhase(detailed,'source-diagnostics');
  const pyroMirror=water&&pstate?.active>0?fireworks.getRadianceBound({camera:water.prepareReflectionCamera(),optics:joint?.reflection.optics??{...currentOptics(),width:water.reflection.width,height:water.reflection.height,dof:false,legacyShutterSeconds:0},rawPerCandela:RAW_PER_CANDELA}):{};
  markPhotometryPhase(detailed,'mirror-source-bound');
  const cameraState=cameraExposure.update({enabled:nightSettings.autoExposure,recommendedEV:light.recommendedExposureEV||0,solarAltitudeDeg:celestialFrame?.mode==='astronomical'?celestialFrame.sun.altitudeDeg:parameters.sun.elevation,manualExposureEV:parameters.lens.manualExposureEV??0,compensationEV:parameters.lens.exposure,dt:delta,reset:exposureResetPending});
  exposureResetPending=false;adaptedCameraEV=cameraState.actualBaseEV;
  if(force||performance.now()-lastExposureUI>250){lastExposureUI=performance.now();ui.setCameraExposure(cameraState);}
  markPhotometryPhase(detailed,'camera-exposure-ui');
  const smokeBound=fireworksSettings.persistentSmoke?pyroSmoke?.getRadianceBound(smokeLightingPayload(),{air:finiteAirPayload(),localLighting:localLights}):null;
  const backgroundAirBound=aerialPerspective?.getRadianceBound?.();
  markPhotometryPhase(detailed,'medium-and-air-bounds');
  const night=(light.nightBlend||0)>.5,photometry=radiometry.update({recommendedEV:night?21:0,cameraExposureEV:qaCameraExposureEV===null?cameraState.cameraEV:qaCameraExposureEV,dt:delta,force,bounds:{sky:skyBound,locals:local,indirect:indirectBound,fireworks:Math.max(pyro.maximumRawRadiance||0,pyroMirror.maximumRawRadiance||0),medium:(local.maxRGB||0)*.25+(smokeBound?.maxRGB||0)+(backgroundAirBound?.maxRGB||0)}});
  markPhotometryPhase(detailed,'storage-exposure-selection');
  atmosphere.setStorageExposureEV(photometry.storageEV);localLights.setSceneExposure(photometry.storageEV);environmentLocalLights.setSceneExposure(photometry.storageEV);applySolarLighting();applyEnvironmentRatios();indirectLighting?.setSceneExposure(photometry.storageEV);
  lens?.setFrameExposure(photometry.storageEV,{dynamic:!parameters.paused&&!!(pstate?.active>0||celestialFrame?.running)});
  frameSnapshot={...baseFrame,...photometry,dt:parameters.paused?0:delta,adaptationDelta:delta,utcMs:celestialFrame?.utcMs,observer:celestialFrame?.observer,windVector:[effectiveWind*.936,0,effectiveWind*.352],weather:atmosphere.getWeatherState().current};
  markPhotometryPhase(detailed,'storage-and-shared-lighting');
  if(detailed){detailed.total=performance.now()-detailed.started;delete detailed.last;(detailedOwner.photometryFrames??=[]).push(detailed);}
}

function jointSmokeEligible(){return jointSmokePilot&&fireworksSettings.smokeQuality==='full'&&!qaRenderLock&&!qaFrozenWorkload&&!graphicsContextInterrupted&&!jointSmokeFault;}
function discardJointSmokePlan(){
  const plan=jointSmokePending;jointSmokePending=null;
  if(plan)for(const view of [plan.main,plan.reflection])if(view?.handle)plan.owner.discardPreparedSourceView(view.handle);
}
function failJointSmokePlan(error){
  if(!jointSmokeFault){jointSmokeFault={message:String(error?.message??error),time,recovery:'reload-required'};parameters.paused=true;ui?.setPaused(true);console.error('Joint smoke pilot stopped; reload required:',jointSmokeFault.message);}
  discardJointSmokePlan();qaSmokeTransmissionInput=null;
  try{pyroSmoke?.prepareLighting({enabled:false});}catch(cleanupError){jointSmokeFault.cleanupError=String(cleanupError?.message??cleanupError);}
}
function jointMediumStamp(host){
  if(!host)return null;
  const d=host.diagnostics(),s=d.state;
  // Physical packet/profile mutations increment revision. A clear starts a new
  // state whose revision may repeat, so the host's clear counter is also bound.
  return [d.clears,d.requestedPhysicalTime,d.committedPhysicalTime,s.revision,s.time,s.requestedTime,s.packetCount,s.profileCount,s.pendingEmissions,s.pendingWindEvents,s.lastEmissionId,s.totalTickSteps];
}
function assertJointMediumEpoch(plan,{full=false}={}){
  const stamp=jointMediumStamp(plan.mediumHost);
  if(stamp?.some((v,i)=>!Object.is(v,plan.mediumStamp[i])))throw new Error('Joint committed smoke epoch changed');
  if(full&&plan.mediumHost){
    const a=plan.snapshot,b=plan.mediumHost.snapshot();
    const header=s=>[s.schema,s.revision,s.time,s.requestedTime,s.tick,s.pendingEmissions,s.pendingWindEvents,...s.currentWind,s.profiles.length,s.packets.length];
    if(JSON.stringify(header(a))!==JSON.stringify(header(b))||JSON.stringify(a.profiles)!==JSON.stringify(b.profiles)||a.packets.some((p,i)=>p.id!==b.packets[i].id||p.profileId!==b.packets[i].profileId))throw new Error('Joint committed smoke layout changed');
  }
}
function jointOpticsKey(optics,reflection=false){
  return [optics.width,optics.height,optics.focalMm??28,optics.aperture??8,optics.focusMetres??60,optics.sensorHeightMm??24,!reflection&&optics.dof,optics.shutterSeconds??1/120,reflection?0:optics.shutterSeconds??1/120];
}
function expectedJointOptics(){
  const base=currentOptics(),focus=parameters.lens.focusMode==='manual'?THREE.MathUtils.clamp(parameters.lens.focusDistance,.3,24000):Math.max(.3,camera.position.distanceTo(controls.target));
  return {main:{...base,focusMetres:focus,sensorHeightMm:camera.getFilmHeight()},reflection:{...base,width:water.reflection.width,height:water.reflection.height,dof:false,legacyShutterSeconds:0}};
}
function assertJointPlan(plan,{full=false}={}){
  if(plan.owner!==fireworks||plan.time!==time||plan.mediumHost!==(fireworksSettings.persistentSmoke?pyroSmoke:null)||plan.transmission!==qaSmokeTransmissionField)throw new Error('Joint draw plan host/epoch changed');
  assertJointMediumEpoch(plan,{full});
  const optics=expectedJointOptics();
  for(const [name,reflection]of [['main',false],['reflection',true]]){
    const view=plan[name],key=jointOpticsKey(optics[name],reflection);
    if(view.consumed||key.some((v,i)=>!Object.is(v,view.key[i])))throw new Error('Joint planned draw optics changed');
    plan.owner.getPreparedSourceViewInfo(view.handle);
  }
  if(plan.ledger){
    // Cache lookup validates the borrowed ledger without preparing a new copy.
    const ledger=fireworks.getEmissionLedger({rawPerCandela:RAW_PER_CANDELA});
    if(ledger!==plan.ledger||ledger.version!==plan.ledger.version||ledger.time!==time)throw new Error('Joint emission ledger changed');
    const lighting=plan.mediumHost.diagnostics().rendering.resolvedLighting,field=lighting?.field;
    if(!lighting?.effective||field?.version!==plan.fieldVersion||field?.ledgerVersion!==ledger.version||field?.packetCount!==plan.snapshot.packets.length||field?.sourceCount!==ledger.count)throw new Error('Joint resolved-light field no longer matches this epoch');
  }
}
function beginJointSmokePlan(frame,lightingEnabled){
  discardJointSmokePlan();
  const mediumHost=fireworksSettings.persistentSmoke?pyroSmoke:null;
  if(mediumHost&&(!qaSmokeTransmissionField||qaSmokeTransmissionMode!=='fast'))throw new Error('Joint GPU transmission route is unavailable');
  const snapshot=mediumHost?.snapshot()??null;
  // The synchronous draw owns one public snapshot. Row preparation/validation
  // share it; physical state is neither modified nor substituted in the host.
  let plan;
  const medium=snapshot?.packets.length?Object.create(mediumHost,{snapshot:{value:()=>{if(plan)assertJointMediumEpoch(plan);return snapshot;}}}):null;
  const {main:mainOptics,reflection:reflectionOptics}=expectedJointOptics();
  plan={owner:fireworks,mediumHost,medium,snapshot,mediumStamp:jointMediumStamp(mediumHost),time,transmission:qaSmokeTransmissionField,ledger:lightingEnabled?fireworks.getEmissionLedger({rawPerCandela:RAW_PER_CANDELA}):null,consumed:[],main:null,reflection:null};
  jointSmokePending=plan;
  const prepare=(viewCamera,optics,reflection)=>{const handle=fireworks.prepareSourceView({camera:viewCamera,reflection,planeY:0,frame,optics,medium,legacySmoke:false});return {handle,camera:viewCamera,optics,key:jointOpticsKey(optics,reflection),info:fireworks.getPreparedSourceViewInfo(handle),consumed:false};};
  plan.main=prepare(camera,mainOptics,false);plan.reflection=prepare(water.prepareReflectionCamera(),reflectionOptics,true);
  if(plan.ledger&&(plan.ledger.time!==time||plan.ledger.rawPerCandela!==RAW_PER_CANDELA))throw new Error('Joint emission ledger epoch/units mismatch');
  plan.work=planJointSmokeWork({packetCount:snapshot?.packets.length??0,mainCount:plan.main.info.count,mainActiveRayCount:plan.main.info.activeRayCount,reflectionCount:plan.reflection.info.count,reflectionActiveRayCount:plan.reflection.info.activeRayCount,ledgerCount:plan.ledger?.count??0,lightingEnabled},smokeWorkPolicy());
  jointSmokeLast={time,counts:plan.work.counts,work:plan.work.work,supported:plan.work.supported,reasons:plan.work.reasons,consumed:[],complete:false};
  if(!plan.work.supported)throw new Error('Joint numeric budget refused before dispatch: '+JSON.stringify(plan.work.reasons));
  return plan;
}
function validateJointSmokeConsumer({camera:consumerCamera,target,reflection,planeY,optics}){
  const plan=jointSmokeActive,view=reflection?plan.reflection:plan.main;
  if(!view||view.consumed||plan.owner!==fireworks||plan.time!==time||plan.mediumHost!==(fireworksSettings.persistentSmoke?pyroSmoke:null)||plan.transmission!==qaSmokeTransmissionField||consumerCamera!==view.camera||planeY!==0)throw new Error('Joint source view epoch/consumer changed');
  assertJointMediumEpoch(plan);
  const key=jointOpticsKey({...optics,width:target.width,height:target.height},reflection);
  if(key.length!==view.key.length||key.some((x,i)=>!Object.is(x,view.key[i])))throw new Error('Joint source view actual optics changed');
  fireworks.getPreparedSourceViewInfo(view.handle); // before clouds/volume GPU
  return view;
}
function renderSceneFrame({includeWater=true,sdr=false,mark=()=>{}}={}){
  if(!jointSmokeEligible()){if(jointSmokeFault)throw new Error(jointSmokeFault.message);if(includeWater){water.render(time);mark('water-captures');}lens.render(scene,camera.position.distanceTo(controls.target),{sdr});mark('main-lens-display');return;}
  try{
    if(!jointSmokePending)updateScenePhotometry(0,true);
    if(jointSmokeFault||!jointSmokePending)throw new Error(jointSmokeFault?.message??'Joint source plan missing');
    // Normal setters/camera movement can invalidate a photometry plan before a
    // main-only screenshot. Replan once, before any world pass, rather than draw
    // with stale counts; an actual dispatch failure remains latched.
    try{assertJointPlan(jointSmokePending,{full:true});}
    catch(stale){discardJointSmokePlan();updateScenePhotometry(0,true);if(jointSmokeFault||!jointSmokePending)throw new Error(jointSmokeFault?.message??stale.message);assertJointPlan(jointSmokePending,{full:true});}
    jointSmokeActive=jointSmokePending;
    if(includeWater){water.render(time);mark('water-captures');}
    lens.render(scene,camera.position.distanceTo(controls.target),{sdr});mark('main-lens-display');
    const plan=jointSmokeActive;
    if(!plan.main.consumed||includeWater&&!plan.reflection.consumed)throw new Error('Joint frame did not consume every requested source view');
    jointSmokeLast={...jointSmokeLast,consumed:[...plan.consumed],requestedViews:includeWater?['reflection','main']:['main'],complete:true,fieldVersion:plan.fieldVersion};
  }catch(error){failJointSmokePlan(error);throw error;}
  finally{jointSmokeActive=null;discardJointSmokePlan();}
}

function smokeLightingPayload(air=finiteAirPayload()){return{ambientRGB:air.ambientIrradianceRGB,rawDirectionalRGB:air.rawSunRGB,directionalDirection:air.sunDirection,clusters:fireworks?.getLightClusters()||[],rawPerCandela:RAW_PER_CANDELA};}
async function runSmokeVariantScene(modulePath,exportName,definitions,options={}){
  if(qaSmokeVariants)throw new Error('Smoke source comparison already running');
  const original=pyroSmoke;
  try{
    const module=await import(modulePath);
    return await module[exportName](window.__ATOLL__,{...options,THREE,camera,
      createVariants(){
        if(qaSmokeVariants||fireworks.diagnostics().active||fireworks.diagnostics().queued||original.packetCount)throw new Error('Retire events and explicitly clear smoke before creating comparison hosts');
        const wind=original.snapshot().currentWind;qaSmokeVariants=new Map([['original',original]]);
        for(const [id,sourceOptions]of definitions)qaSmokeVariants.set(id,createPyroSmoke(THREE,renderer,{time,wind,sourceModel:'trajectory-v1',sourceProvider:fireworks.smokeSourceProvider,...sourceOptions,lightFieldMaxRequestPairs:4000000,lightFieldMaxMapPairs:1000000,lightFieldMaxMapDraws:8}));
        return [...qaSmokeVariants.keys()].filter(id=>id!=='original');
      },
      selectVariant(id){if(!qaSmokeVariants?.has(id))throw new Error('Unknown smoke source variant');pyroSmoke=qaSmokeVariants.get(id);updateScenePhotometry(0,true);lens.resetTemporalHistory('smoke source comparison');lastPausedRenderKey=null;return pyroSmoke.diagnostics();},
      getVariantSnapshots(){return Object.fromEntries([...qaSmokeVariants].filter(([id])=>id!=='original').map(([id,host])=>[id,host.snapshot()]));},
      getVariantDiagnostics(){return Object.fromEntries([...qaSmokeVariants].filter(([id])=>id!=='original').map(([id,host])=>[id,host.diagnostics()]));}
    });
  }finally{
    pyroSmoke=original;if(qaSmokeVariants)for(const host of qaSmokeVariants.values())if(host!==original)host.dispose();
    qaSmokeVariants=null;updateScenePhotometry(0,true);lens.resetTemporalHistory('restore smoke source host');lastPausedRenderKey=null;
  }
}
function createRuntimeSmoke(){return createPyroSmoke(THREE,renderer,{time,wind:[effectiveWind*.936,0,effectiveWind*.352],sourceModel:'trajectory-v1',sourceProvider:fireworks.smokeSourceProvider,projectionMode:'ellipsoid',lightFieldBakeMode:'tiled64',lightFieldMaxRequestPairs:smokeWorkPolicy().maxRequestPairs,lightFieldMaxMapPairs:1000000,lightFieldMaxMapDraws:smokeWorkPolicy().maxMapDraws});}
function restartSmokeEpoch(){
  if(!pyroSmoke)return;
  fireworks.clearLegacySmoke();
  discardJointSmokePlan();smokeEpochAdmission.reset();
  pyroSmoke.dispose();pyroSmoke=createRuntimeSmoke();
}
function flushPyroSources(){
  const events=fireworks.drainEvents();
  fireworksAudio.enqueue(events,{time,listenerPosition:camera.position.toArray(),temperature:atmosphere.getWeatherState().current.temperature,paused:parameters.paused||document.hidden});
  const smokeEvents=events.filter(event=>!event.audioOnly);
  if(qaSmokeVariants){for(const host of qaSmokeVariants.values())host.update({time,windVector:[effectiveWind*.936,0,effectiveWind*.352],events:smokeEvents});}
  else if(fireworksSettings.smokeQuality==='full')pyroSmoke.update({time,windVector:[effectiveWind*.936,0,effectiveWind*.352],events:smokeEpochAdmission.accept(smokeEvents,time)});
  return events;
}
function clearSmoke(){if(!pyroSmoke)return;flushPyroSources();fireworks.clearLegacySmoke();for(const host of qaSmokeVariants?qaSmokeVariants.values():[pyroSmoke])host.clear();lens?.resetTemporalHistory('clear reflected smoke');lastPausedRenderKey=null;ui.notify('当前烟尘已清除，后续发射会继续产生烟尘');}
function drawFiniteEffects({renderer,target,camera,opaqueDepth=null,reflection=false,planeY=0,width,height,optics}){
  if(!fireworks||!frameSnapshot)return;
  const air=finiteAirPayload(),cameraOptics={...currentOptics(),...optics,width:width||target.width,height:height||target.height};
  const jointView=jointSmokeActive?validateJointSmokeConsumer({camera,target,reflection,planeY,optics:cameraOptics}):null;
  if(reflection)atmosphere.renderTransientClouds({renderer,target,camera,reflection,planeY,frame:frameSnapshot});
  const medium=fireworksSettings.persistentSmoke?pyroSmoke:null;
  if(medium?.packetCount){const depth=reflection?reflectionDepthCopy.copy(target):opaqueDepth;medium.render({target,camera,opaqueDepth:depth,reflection,planeY,frame:frameSnapshot,optics:cameraOptics,air,lighting:smokeLightingPayload(air),localLighting:localLights,finiteClusterPhase:fireworksSettings.finiteClusterPhase});}
  let emitterMedium=jointView?jointSmokeActive.medium:medium;
  if(medium&&qaSmokeTransmissionMode==='legacy'){emitterMedium=qaSmokeLegacyMedia.get(medium);if(!emitterMedium){emitterMedium=Object.create(medium,{writeTransmission:{value:undefined}});qaSmokeLegacyMedia.set(medium,emitterMedium);}}
  fireworks.render({renderer,target,camera,opaqueDepth,reflection,planeY,frame:frameSnapshot,optics:cameraOptics,air,medium:emitterMedium,legacySmoke:fireworksSettings.smokeQuality==='light',transmissionBatch:jointView?(emitterMedium?jointSmokeActive.transmission:null):qaSmokeTransmissionField,preparedView:jointView?.handle??null});
  if(jointView){jointView.consumed=true;jointSmokeActive.consumed.push(reflection?'reflection':'main');const t=fireworks.diagnostics().lastRenderByView[reflection?'reflection':'main']?.sourceTransmission;if(t?.mediumQueries)throw new Error('Joint source view used CPU transmission');}
}
function syncTimeUI(){
  if(!celestialController)return;const c=celestialController.state,altitude=c.mode==='artistic'?parameters.sun.elevation:c.sun.altitudeDeg;
  ui.syncTime({utcMs:c.utcMs,rate:c.rate,running:c.running,mode:c.mode,observer:{latitude:c.observer.latitudeDeg,longitude:c.observer.longitudeDeg,height:c.observer.heightM},timeZoneOffsetMinutes:c.timeZoneOffsetMinutes,message:`${c.mode==='artistic'?'手动太阳':'太阳'} ${altitude.toFixed(1)}° · 月亮 ${c.moon.altitudeDeg.toFixed(1)}° · 月相 ${Math.round(c.moonPhase*100)}%`});
  ui.setNight({label:altitude>0?'晴空与海，随时间流转。':altitude>-12?'暮光，慢慢落在海上。':'夜色，环抱一座海岛。'});
}
function refreshLocalSettings(){if(!localLights)return;const s=localLights.state;ui.syncLamps(s);ui.syncFlashlight(s.flashlight);lastPausedRenderKey=null;lens?.resetTemporalHistory('local light parameters');if(atmosphere)updateScenePhotometry(0,true);}
async function setTime(patch={}){if(!celestialController)return;if(['utcMs','utcISO','date','latitude','longitude','height','latitudeDeg','longitudeDeg','heightM','mode'].some(k=>Object.hasOwn(patch,k)))exposureResetPending=true;celestialFrame=celestialController.configure(patch);atmosphere.setCelestial(celestialFrame);if(celestialFrame.mode==='artistic')setSun(false);else{sunDirection.fromArray(celestialFrame.sunDirection);atmosphere.setSun({intensity:1});}updateScenePhotometry(0,true);shadowQuality?.update();lens?.resetTemporalHistory('clock/location');updateEnvironment();syncTimeUI();lastPausedRenderKey=null;return celestialFrame;}
function setWeatherPreset(name){const presets={clear:{humidity:.55,temperature:29,coverage:.08,thickness:650,shear:.8},fair:{humidity:.68,temperature:29,coverage:.35,thickness:950,shear:1.1},cloudy:{humidity:.78,temperature:28,coverage:.72,thickness:1450,shear:1.8},humid:{humidity:.90,temperature:28,coverage:.28,thickness:850,shear:.7}};if(!presets[name])return;setWeather(presets[name]);ui.syncWeather(parameters.weather);ui.notify('天气预设已更新，时间与视角保持当前设置');}
async function applyQualityPreset(id=DEFAULT_QUALITY){
  parameters.qualityPreset=id;const requested=getQualityPreset(id),caps=renderer?{maxTextureSize:renderer.capabilities.maxTextureSize,sampleSupport:lens.state.sampleSupport}:{};const result=resolveQualityPreset(id,caps),q=result.effective;parameters.renderSampling=q;parameters.qualityCustom=false;qualityApplying=true;
  try{parameters.quality=q.msaaSamples>=8?'high':'balanced';parameters.graphics.waveResolution=q.waveResolution;parameters.graphics.shadows=({2048:'soft',4096:'recommended',6144:'fine',8192:'ultra'})[q.shadowSize]||'recommended';parameters.graphics.indirect=q.indirect;Object.assign(parameters.lens,{antialias:q.antialias,temporal:q.temporal,glintAA:q.glintAA,opticalBloom:q.opticalBloom});
    shadowQuality?.setSampling({size:q.shadowSize,hz:q.shadowHz});waveSpectrum?.setResolution(q.waveResolution);waveSpectrum?.update(time,true);caustics?.setSampling({grid:q.causticsGrid,size:q.causticsSize,hz:q.causticsHz});atmosphere?.setSampling?.({cloudSteps:q.cloudSteps,atmosphereSteps:q.atmosphereSteps});aerialPerspective?.setSampling?.({steps:q.airSteps,shadowTaps:q.airShadowTaps});water?.setSampling(q);indirectLighting?.setQuality(q.indirect);localLights?.setQuality({flashShadowSize:id==='low'?512:id==='ultra'?2048:1024,flashShadowHz:q.shadowHz});setLens();resize();caustics?.update(time,true);ui.syncGraphics(parameters.graphics);ui.syncLens(parameters.lens);ui.setQualityState({requested:id,effective:q,custom:false,limits:result.limits});lastPausedRenderKey=null;
    fireworks?.setQuality({trailSegments:({low:6,balanced:6,medium:8,high:12,ultra:16})[id]});
  }finally{qualityApplying=false;}return result;
}
function markCustomQuality(){
  if(qualityApplying)return;
  parameters.qualityCustom=true;
  const shadows=shadowQuality?.diagnostics();
  const effective={...parameters.renderSampling,
    ...(shadows?{shadowSize:shadows.mapSize[0],shadowHz:shadows.maxHz}:{}),
    ...(waveSpectrum?{waveResolution:waveSpectrum.state.resolution}:{}),
    indirect:parameters.graphics.indirect};
  parameters.renderSampling=effective;
  ui.setQualityState({requested:parameters.qualityPreset,effective,custom:true,limits:[]});
}
function configureFireworksSettings(value={}){
  value={...value,...validateAutomaticShow(value,fireworksSettings)};
  const smokeMode=resolveSmokeMode(value,fireworksSettings),smokeChanged=smokeMode.smokeQuality!==fireworksSettings.smokeQuality;
  if(smokeChanged&&qaSmokeVariants)throw new Error('Finish the smoke comparison before changing smoke mode');
  value={...value,...smokeMode};
  if(value.effectProfile==='powered-bees-v1'&&(parameters.lens.shutterSeconds??1/120)>1/60)throw new RangeError('Powered effects currently require shutterSeconds <=1/60');
  if(value.automaticDirection!==undefined&&value.autoDirection===undefined)value={...value,autoDirection:value.automaticDirection};
  if(value.effectProfile===undefined&&fireworksSettings.effectProfile&&((value.type!==undefined&&value.type!=='chrysanthemum')||value.autoLaunch))value={...value,effectProfile:'legacy'};
  const geometryChanged=['type','effectProfile','azimuth','elevation','autoDirection','autoLaunch','launchSpreadDegrees','burstTiltDegrees','burstRollDegrees','starDragModel','randomLaunchTilt','automaticTiltMinDegrees','automaticTiltMaxDegrees'].some(k=>k in value&&value[k]!==fireworksSettings[k]);
  const illuminationChanged=smokeChanged||['persistentSmoke','cloudIllumination','finiteClusterPhase','clusterModel','resolvedSmokeLighting'].some(k=>k in value&&value[k]!==fireworksSettings[k]);
  const {smokeQuality,persistentSmoke,cloudIllumination,finiteClusterPhase,resolvedSmokeLighting,...sourceSettings}=value;
  const result=fireworks?.configure(sourceSettings);
  if(value.autoFrame||(parameters.director.mode==='fireworks'&&geometryChanged))stopDirector('show forecast changed');
  Object.assign(fireworksSettings,value);
  if(smokeChanged)restartSmokeEpoch();
  if(illuminationChanged){lens?.resetTemporalHistory('firework illumination');if(atmosphere&&localLights)updateScenePhotometry(0,true);}
  if(geometryChanged&&['fireworks-close','fireworks'].includes(ui.state.view)&&camera)moveTo(ui.state.view);
  ui.syncFireworks({...fireworksSettings,maxActive:fireworks?.diagnostics().maxActive??32});lastPausedRenderKey=null;return result;
}
function stopDirector(reason='manual takeover'){
  const wasActive=cameraDirector?.cancel(reason)||false;
  parameters.director.mode='off';directorPlan=null;ui.syncDirector(parameters.director);
  return wasActive;
}
function manualCameraActivity(){
  if(!showcaseCameraApplying){showcaseRequest++;ui.clearShowcase?.();}
  stopDirector('manual takeover');transition=null;pendingThrow=null;
  ui.setView(null);
  if(fireworksSettings.autoFrame){fireworksSettings.autoFrame=false;ui.syncFireworks(fireworksSettings);}
}
function planDirector(mode){
  if(mode==='island')return {centre:[-1.5,0,-1],radius:82,eyeHeight:16,targetY:4.5};
  // One start-time composition covers the real metre-scale trajectories. It
  // never follows individual launches or scales particles to fill the frame.
  const box=new THREE.Box3(new THREE.Vector3(-39,0,-27),new THREE.Vector3(44,18,30));
  const live=fireworks.getBounds({shutterSeconds:parameters.lens.shutterSeconds??1/120});if(live.active){box.expandByPoint(new THREE.Vector3(...live.min));box.expandByPoint(new THREE.Vector3(...live.max));}
  const base=fireworks.rig.position,origin=[base.x,base.y+.83,base.z];
  const azimuth=fireworksSettings.autoDirection?Math.atan2(base.x,-base.z)*180/Math.PI:fireworksSettings.azimuth;
  const types=fireworksSettings.autoLaunch?fireworks.types:fireworks.types.filter(t=>t.id===fireworksSettings.type);
  for(const type of types){
    const envelope=getFireworkShowEnvelope({type:type.id,settings:fireworksSettings,origin:[base.x,base.y+.17,base.z],muzzleOffsetMetres:.66,azimuth,shutterSeconds:currentOptics().shutterSeconds});
    box.expandByPoint(new THREE.Vector3(...envelope.min));box.expandByPoint(new THREE.Vector3(...envelope.max));
  }
  const point=new THREE.Vector3();
  for(const type of types)for(const speed of [0,5]){
    const windTimeline=[{time:-Infinity,wind:[speed*.936,0,speed*.352]}];
    const event=createFireworkEvent({type:type.id,origin,azimuth,elevation:fireworksSettings.elevation,seed:14271,starDragModel:fireworksSettings.starDragModel??'bounded-descent',effectProfile:type.id==='chrysanthemum'?(fireworksSettings.effectProfile??'legacy'):'legacy'});
    sampleFireworkEvent(event,event.burstTime,{windTimeline,smoke:false});
    for(const body of [...(event.rocket?[event.rocket]:[]),...event.heads])for(let i=0;i<=16;i++){
      const p=sampleBody(body,body.birth+body.life*i/16,windTimeline).position;
      if(p[1]>=.03)box.expandByPoint(point.fromArray(p));
    }
  }
  box.expandByScalar(12);box.min.y=0;
  const centre=box.getCenter(new THREE.Vector3()),eyeHeight=16;let radius=0;
  for(let i=0;i<16;i++){
    const angle=i*Math.PI/8,bearing=new THREE.Vector3(Math.sin(angle),0,-Math.cos(angle));
    const fit=fitPerspectiveBounds(THREE,camera,box,{eyeHeight,margin:.84,bearing});radius=Math.max(radius,fit.distance);
  }
  return {centre:centre.toArray(),radius,eyeHeight,targetY:centre.y,forecast:{min:box.min.toArray(),max:box.max.toArray(),types:types.map(t=>t.id),windMetresPerSecond:[0,5],samplesPerBody:17,scope:'analytic physical-centre envelope covers configured launch cone and arbitrary burst rotations; fixed show/lens at start, separate12m optical margin, not persistent smoke or future user settings'}};
}
function setDirector(value={}){
  if(!cameraDirector)return null;
  const mode=value.mode??parameters.director.mode,period=value.periodSeconds??parameters.director.periodSeconds;
  if(!['off','island','fireworks'].includes(mode))throw new RangeError('Unknown camera-director mode');
  if(![120,240,480].includes(period))throw new RangeError('Orbit period must be120,240 or480 physical seconds');
  const samePlan=mode===parameters.director.mode&&cameraDirector.state.active&&directorPlan;
  parameters.director.periodSeconds=period;
  if(mode==='off'){stopDirector('selected manual mode');return cameraDirector.state;}
  navigation.stop();transition=null;pendingThrow=null;
  fireworksSettings.autoFrame=false;ui.syncFireworks(fireworksSettings);
  const started=performance.now();directorPlan=samePlan||planDirector(mode);parameters.director.mode=mode;
  controls.maxDistance=Math.max(controls.maxDistance,directorPlan.radius*1.2,camera.position.distanceTo(controls.target)*1.01);
  controls.maxTargetRadius=Math.max(controls.maxTargetRadius,Math.hypot(...directorPlan.centre)+directorPlan.radius*1.2);
  const desiredHorizontal=Math.sqrt(Math.max(0,directorPlan.radius**2-(directorPlan.eyeHeight-directorPlan.targetY)**2));
  const radialTravel=Math.hypot(Math.hypot(camera.position.x-directorPlan.centre[0],camera.position.z-directorPlan.centre[2])-desiredHorizontal,camera.position.y-directorPlan.eyeHeight);
  const entrySeconds=THREE.MathUtils.clamp(2.5+radialTravel/45,3,12);
  try{cameraDirector.start({...directorPlan,position:camera.position.toArray(),target:controls.target.toArray(),periodSeconds:period,entrySeconds});}
  catch(error){stopDirector('invalid initial pose');throw error;}
  ui.syncDirector(parameters.director);lastPausedRenderKey=null;
  return {...cameraDirector.state,mode,planningMs:performance.now()-started,forecast:directorPlan.forecast??null};
}
function frameFireworks(){
  const b=fireworks.getBounds({shutterSeconds:parameters.lens.shutterSeconds??1/120});if(!b.active)return;
  const box=new THREE.Box3(new THREE.Vector3(-39,0,-27),new THREE.Vector3(44,18,30));box.expandByPoint(new THREE.Vector3(...b.min));box.expandByPoint(new THREE.Vector3(...b.max));
  const fit=fitPerspectiveBounds(THREE,camera,box,{eyeHeight:THREE.MathUtils.clamp(camera.position.y,2.5,12),reflectionPlaneY:0});
  fit.position.y=Math.max(fit.position.y,terrainHeight(fit.position.x,fit.position.z)+1.6);
  controls.maxDistance=Math.max(controls.maxDistance,fit.distance*1.2);
  beginCameraTransition(fit.position,fit.target);
}
function launchFirework(options={}){if(!fireworks)return;if(options.randomType&&options.effectProfile&&options.effectProfile!=='legacy')throw new RangeError('Layer profiles require an explicit chrysanthemum selection');if((options.effectProfile??fireworksSettings.effectProfile)==='powered-bees-v1'&&(parameters.lens.shutterSeconds??1/120)>1/60)throw new RangeError('Powered effects currently require shutterSeconds <=1/60');if(options.randomType&&fireworksSettings.effectProfile&&fireworksSettings.effectProfile!=='legacy')configureFireworksSettings({effectProfile:'legacy'});fireworks.configure(fireworksSettings);const event=fireworks.launch({type:fireworksSettings.type,...options});if(event?.accepted===false){ui.notify(`空中已满${event.maxActive}发，请稍候再发射；本次没有排队`,2200);return event;}parameters.paused=false;ui.setPaused(false);if(fireworksSettings.autoFrame)frameFireworks();lastFramedLaunches=fireworks.diagnostics().launches;ui.notify('烟花已立即发射；手动移动可接管镜头');return event;}
function setSea(value={}){
  const clarity=validateWaterClarity(Object.hasOwn(value,'clarity')?value.clarity:(parameters.sea.clarity??DEFAULT_WATER_CLARITY));
  const next=sanitizeSeaState(value,parameters.sea),wavesChanged=!seaParametersApplied||Object.keys(next).some(key=>next[key]!==parameters.sea[key]);
  water?.configureOptics({clarity});Object.assign(parameters.sea,next,{clarity});ui.syncSea?.(parameters.sea);
  if(wavesChanged){waveSpectrum?.setSeaState(parameters.sea);
  // Long boundary waves remain in the shallow-water validity regime. This is
  // an authored lagoon coupling, not a claim to full dispersive refraction.
  hydrodynamics?.setSwellState({amplitude:.015*parameters.sea.swellHeight/.16,period:20,groupiness:.35});
    caustics?.update(time,true);if(waveSpectrum)seaParametersApplied=true;
  }
  lens?.resetTemporalHistory(wavesChanged?'sea state':'water clarity');lastPausedRenderKey=null;
  return waveSpectrum?.state;
}
async function setGraphics(value){
  if(Object.hasOwn(value,'displayTransform')&&!['legacy','aces2'].includes(value.displayTransform))throw new RangeError('Unknown display transform');
  const changed=new Set(Object.keys(value).filter(k=>value[k]!==parameters.graphics[k]));
  Object.assign(parameters.graphics,value);
  if(changed.has('indirect')){indirectLighting?.setQuality(parameters.graphics.indirect);updateIndirect(true);markCustomQuality();}
  if(changed.has('shadows')){shadowQuality?.setQuality(parameters.graphics.shadows);markCustomQuality();}
  governor?.setTargetFps(parameters.graphics.targetFps);
  if(waveSpectrum&&waveSpectrum.state.resolution!==parameters.graphics.waveResolution){waveSpectrum.setResolution(parameters.graphics.waveResolution);waveSpectrum.update(time,true);caustics?.update(time,true);markCustomQuality();}
  if(hdrOutput){
    await applyDisplaySettings();
    parameters.graphics.hdr=hdrOutput.state.enabled;
    ui.setHDRSupport(hdrOutput.state);
  }
  ui.syncGraphics(parameters.graphics);
  lastPausedRenderKey=null;
  // Display mapping/calibration changes the final presentation, not the stored
  // scene radiance. Retain settled AA when comparing the same frozen master.
  const outputOnly=[...changed].every(k=>['displayTransform','hdrMode','displayName','systemCalibration','peakNits','paperWhiteNits','hdr'].includes(k));
  if(!outputOnly)lens?.resetTemporalHistory('graphics');
  return {parameters:{...parameters.graphics},hdr:hdrOutput?.state,displayTransform:displayTransform?.state};
}
function captureHDRScreenObservation(){
  try{
    const s=window.screen;
    return{screen:{width:s.width,height:s.height,availLeft:s.availLeft,availTop:s.availTop,left:s.left,top:s.top,availWidth:s.availWidth,availHeight:s.availHeight},window:{screenX:window.screenX,screenY:window.screenY,outerWidth:window.outerWidth,outerHeight:window.outerHeight,devicePixelRatio:window.devicePixelRatio,visualViewportScale:window.visualViewport?.scale}};
  }catch{return null;}
}
function displaySettingsBlocked(){return graphicsContextInterrupted||qaRenderLock||qaFrozenWorkload||qualityApplying||!!renderBenchmark?.active;}
function displayRequestKey(observation){const g=parameters.graphics;return JSON.stringify([g.hdrMode,g.displayName,g.systemCalibration,g.displayTransform,...(g.systemCalibration?[]:[g.peakNits,g.paperWhiteNits]),observation]);}
function pollDisplayObservation(){
  if(document.hidden||parameters.graphics.hdrMode!=='auto'||parameters.graphics.displayName!=='auto')return;
  const key=JSON.stringify(captureHDRScreenObservation());
  if(key!==lastDisplayObservationKey)displaySettingsPending=true;
  if(displaySettingsPending&&!displaySettingsBlocked()&&!displaySettingsApplying)void applyDisplaySettings().catch(error=>console.warn('Display selection:',error.message));
}
async function refreshDisplay(){
  if(displaySettingsBlocked()){displayRefreshPending=true;return null;}
  if(refreshingDisplay)return refreshingDisplay;
  displayRefreshPending=false;
  refreshingDisplay=(async()=>{displayReport=await fetchDisplayHDR();return applyDisplaySettings();})().catch(error=>{console.warn('Display refresh:',error.message);return null;}).finally(()=>{refreshingDisplay=null;});return refreshingDisplay;
}
async function applyDisplaySettings(){
  if(!hdrOutput)return;
  if(displaySettingsBlocked()||displaySettingsApplying){displaySettingsPending=true;return hdrCalibration;}
  displaySettingsApplying=true;displaySettingsPending=false;
  const report=displayReport,observation=captureHDRScreenObservation(),request=displayRequestKey(observation),g=parameters.graphics;
  const current=()=>!displaySettingsBlocked()&&displayReport===report&&displayRequestKey(captureHDRScreenObservation())===request;
  try{
    const calibration=resolveObservedHDRCalibration(report,{deviceName:g.displayName==='auto'?undefined:g.displayName,...(g.systemCalibration?{}:{peakNits:g.peakNits,paperWhiteNits:g.paperWhiteNits})},observation);
    if(calibration.confidence==='screen-geometry')calibration.reason='已匹配当前浏览器所在屏幕';
    if(!calibration.display)calibration.reason='当前屏幕无法可靠匹配，请手动选择显示器或输入校准值';
    const nativeAllows=!calibration.display||calibration.display.advancedColorEnabled,verified=calibration.calibrationSource!=='unverified-fallback';
    const enable=g.hdrMode==='hdr'||g.hdrMode==='auto'&&hdrOutput.state.available&&nativeAllows&&verified;
    const signature=JSON.stringify([g.hdrMode,g.displayName,g.systemCalibration,calibration.display?.deviceName,calibration.confidence,calibration.observationSelection.reason,calibration.peakNits,calibration.paperWhiteNits,calibration.sdrWhiteNits,calibration.calibrationSource,nativeAllows,enable]);
    const changed=signature!==lastDisplaySignature||hdrOutput.state.enabled!==enable;
    if(changed){hdrOutput.configure({paperWhiteNits:calibration.paperWhiteNits,peakNits:calibration.peakNits,sdrWhiteNits:calibration.sdrWhiteNits,calibrationSource:calibration.calibrationSource,displayName:calibration.displayName});await hdrOutput.setEnabled(enable);}
    if(!current()){displaySettingsPending=true;return null;}
    await displayTransform?.configure({mode:g.displayTransform,peakNits:calibration.peakNits});
    if(!current()){displaySettingsPending=true;return null;}
    hdrCalibration=calibration;lastDisplaySignature=signature;lastDisplayObservationKey=JSON.stringify(observation);
    if(g.systemCalibration){g.peakNits=calibration.peakNits;g.paperWhiteNits=calibration.paperWhiteNits;}
    g.hdr=hdrOutput.state.enabled;ui.setDisplays(report,calibration);ui.setHDRSupport(hdrOutput.state);
    if(displayTransform)ui.setDisplayTransformState(displayTransform.state);
    if(changed){hdrOutput.requestRedraw();lastPausedRenderKey=null;}return calibration;
  }finally{displaySettingsApplying=false;}
}
function beginCameraTransition(position,target){
  navigation?.stop();
  const plan=planCameraTransition({from:{position:camera.position.toArray(),target:controls.target.toArray()},to:{position:position.toArray(),target:target.toArray()},terrainHeight,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,maxSpeedMetresPerSecond:Math.max(45,camera.position.distanceTo(position)*.6)});
  controls.maxDistance=Math.max(controls.maxDistance,plan.diagnostics.requiredMaxDistance);
  controls.maxTargetRadius=Math.max(controls.maxTargetRadius,plan.diagnostics.requiredMaxTargetRadius);
  transition={plan,elapsedSeconds:0};lastPausedRenderKey=null;
  return plan.diagnostics;
}
function moveTo(name){
  manualCameraActivity();
  if(!camera)return;
  let view=views[name];
  if(name==='sun'||name==='moon'){
    const direction=new THREE.Vector3(...(name==='moon'?celestialFrame.moonDirection:celestialFrame.sunDirection));
    if(name==='sun'&&celestialFrame.mode==='artistic')direction.copy(sunDirection);
    view=islandCelestialView(direction.toArray());
  }
  if(name==='fireworks-close'||name==='fireworks'){
    const base=fireworks.rig.position,azimuth=fireworksSettings.autoDirection?Math.atan2(base.x,-base.z)*180/Math.PI:fireworksSettings.azimuth;
    const types=name==='fireworks'&&fireworksSettings.autoLaunch?fireworks.types:fireworks.types.filter(type=>type.id===fireworksSettings.type);
    const envelopes=types.map(type=>getFireworkShowEnvelope({type:type.id,settings:fireworksSettings,origin:[base.x,base.y+.17,base.z],muzzleOffsetMetres:.66,azimuth,shutterSeconds:currentOptics().shutterSeconds}));
    const envelope={min:[0,1,2].map(c=>Math.min(...envelopes.map(e=>e.min[c]))),max:[0,1,2].map(c=>Math.max(...envelopes.map(e=>e.max[c])))};
    view=islandFireworksView(THREE,camera,{azimuth,envelope,automaticFan:fireworksSettings.autoLaunch&&fireworksSettings.randomLaunchTilt});
  }
  if(!view)return;
  view=keepIslandInPreset(THREE,camera,view,{witness:[0,terrainHeight(0,0)+.02,0]});
  if(fireworksSettings.autoFrame){fireworksSettings.autoFrame=false;ui.syncFireworks(fireworksSettings);}
  navigation?.stop();pendingThrow=null;
  beginCameraTransition(new THREE.Vector3(...view.position),new THREE.Vector3(...view.target));
  ui.setView(name);
}
function bindInteraction(){
  const canvas=renderer.domElement;
  const cancel=()=>{throwGesture=null;ui.setThrowCharge(0,false);};
  canvas.addEventListener('pointerdown',e=>{if(e.isPrimary&&e.button===0){canvas.focus({preventScroll:true});throwGesture={x:e.clientX,y:e.clientY,time:performance.now(),cancelled:false,picking:focusPicking||e.altKey};}});
  canvas.addEventListener('pointermove',e=>{if(throwGesture&&Math.hypot(e.clientX-throwGesture.x,e.clientY-throwGesture.y)>5){throwGesture.cancelled=true;ui.setThrowCharge(0,false);}});
  canvas.addEventListener('pointercancel',cancel);addEventListener('blur',cancel);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  canvas.addEventListener('pointerup',e=>{
    if(!throwGesture||!e.isPrimary||e.button!==0)return;
    const gesture=throwGesture;cancel();
    if(!gesture.cancelled&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)<5){
      if(gesture.picking){
        const uv=new THREE.Vector2(e.clientX/innerWidth,1-e.clientY/innerHeight),focus=lens.pickFocus(uv.x,uv.y);
        if(e.altKey&&focus.sky){focusPicking=false;canvas.style.cursor='';ui.notify('天空没有可移动的环绕中心，请点选地面或海面');return;}
        if(e.altKey&&!focus.sky){const p=new THREE.Vector3(uv.x*2-1,uv.y*2-1,.5).unproject(camera).sub(camera.position).normalize(),f=new THREE.Vector3();camera.getWorldDirection(f);navigation.setPivot(camera.position.clone().addScaledVector(p,focus.metres/Math.max(.01,p.dot(f))));ui.notify('已移动环绕中心，Home 可还原视角');}
        else{parameters.lens.focusMode='manual';parameters.lens.focusDistance=focus.metres;parameters.lens.dof=true;setLens();ui.syncLens(parameters.lens);ui.notify(`已对焦 ${focus.metres.toFixed(1)} 米`);}
        focusPicking=false;canvas.style.cursor='';return;
      }
      throwFromCamera({x:e.clientX,y:e.clientY},THREE.MathUtils.clamp((performance.now()-gesture.time)/1200,0,1));
    }
  });
  canvas.addEventListener('keydown',e=>{
    if(e.key==='Escape'){focusPicking=false;canvas.style.cursor='';pendingThrow=null;cancel();}
    if(['+','-','=','Enter'].includes(e.key))e.preventDefault();
    if(e.key==='Enter')throwFromCamera(null,.45);
    if(['+','-','='].includes(e.key)){stopDirector('keyboard dolly');const offset=camera.position.clone().sub(controls.target);offset.multiplyScalar(e.key==='-'?1.1:.9);navigation.stop();transition=null;camera.position.copy(controls.target).add(offset);controls.update();}
  });
  canvas.addEventListener('webglcontextlost',e=>{
    e.preventDefault();
    // Three can restore its own context while custom raw-GL resources and old
    // timer queries remain invalid. Keep the existing explicit reload policy;
    // never resume this scene or report a benchmark from its restored shell.
    graphicsContextInterrupted=true;parameters.paused=true;gpuTimer=null;gpuMs=null;fps=0;
    gpuQueries.length=0;frameProbe=null;pauseTargetTime=null;
    renderBenchmark?.cancel('webgl-context-lost');
    fireworksAudio?.cancel();soundscape?.setEnabled(false).catch(error=>console.warn('Audio stop after graphics interruption',error));
    ui.setPaused(true);ui.setStats({fps:0,paused:true,status:'interrupted',error:'图形连接已中断，刷新页面可重新进入海岛。'});
  });
}
function throwFromCamera(clientPoint=null,charge=.45){
  if(!stoneThrow)return null;
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.set(clientPoint?(clientPoint.x-rect.left)/rect.width*2-1:0,clientPoint?1-(clientPoint.y-rect.top)/rect.height*2:0);
  raycaster.setFromCamera(pointer,camera);parameters.paused=false;ui.setPaused(false);
  const event=stoneThrow.launchRay(camera,raycaster.ray.direction,charge,time);
  return event;
}
function floatAtVisibleWater(){
  const suggestion=floatingLeaves.suggestSpawn(camera,{viewportHeight:innerHeight,maxDistance:350});
  if(suggestion&&floatingLeaves.spawn(suggestion.x,suggestion.z)){
    leafLocatorUntil=performance.now()+6500;ui.showLeafAvailable();
    if(suggestion.focusRecommended&&suggestion.focus){focusLeaf();ui.notify('已放下22厘米的叶片，并靠近查看',3200);}
    else ui.notify('叶片已放在圈出的水面上，会随潮流漂移',3200);
    return suggestion;
  }
  ui.notify('请把视角转向近处海面，再放下一片叶子');
  return null;
}
function focusLeaf(){
  manualCameraActivity();
  const location=floatingLeaves.locate(camera,{viewportWidth:innerWidth,viewportHeight:innerHeight});
  if(!location?.focus){ui.notify('当前没有可观察的漂浮叶片');return false;}
  beginCameraTransition(new THREE.Vector3(...location.focus.position),new THREE.Vector3(...location.focus.target));
  leafLocatorUntil=performance.now()+6500;return true;
}
function setCurrent(){
  if(!hydrodynamics||!water)return;
  hydrodynamics.setCurrent(parameters.current);
  const reference=hydrodynamics.sampleFlow(60,60);
  water.uniforms.uMeanCurrent.value.set(reference.x,reference.z);
}
function dropStone(x,z,event={}){
  if(!water)return;
  if(event.kind==='land'||(!event.kind&&terrainHeight(x,z)>estimateLeafSurface(water.uniforms,x,z,event.time??time))){return;}
  const impactTime=event.time??time,epsilon=.04,step=1/120;
  const surface=(px,pz,pt)=>estimateLeafSurface(water.uniforms,px,pz,pt);
  const slopeX=(surface(x+epsilon,z,impactTime)-surface(x-epsilon,z,impactTime))/(2*epsilon);
  const slopeZ=(surface(x,z+epsilon,impactTime)-surface(x,z-epsilon,impactTime))/(2*epsilon);
  const flow=hydrodynamics.sampleFlow(x,z),vertical=(surface(x,z,impactTime+step)-surface(x,z,impactTime-step))/(2*step);
  const impact={stoneDiameter:event.diameter??.025,velocity:event.velocity,normalSpeed:event.normalSpeed,energy:event.energy,mass:event.mass,surfaceNormal:[-slopeX,1,-slopeZ],surfaceVelocity:[flow.x,vertical,flow.z]};
  const response=resolveWaterImpact(impact),strength=THREE.MathUtils.clamp(Math.sqrt(Math.max(.02,response?.normalEnergyJoules??event.energy??.5)/.5),.25,1.6);
  // Centimetre pebble, not a boulder: the old full-strength metre-wide impulse
  // carried several joules. These smaller visual/solver impulses fit its scale.
  water.impulse(x,z,impactTime,.10*strength);
  hydrodynamics.disturb(x,z,.20*strength);
  splashes.spawn(x,z,impactTime,strength,{...impact,surfaceHeight:event.position?.[1]});
  soundscape?.splash(x,z,strength,impact);
}

function configureSmokeGPUField(enabled,caps={maxSources:18000,maxPackets:4096,maxPairs:1048576,...smokeWorkPolicy()}){
  discardJointSmokePlan();
  qaSmokeTransmissionField?.dispose();qaSmokeTransmissionField=null;qaSmokeTransmissionInput=null;
  if(enabled){
    qaSmokeTransmissionField=createSmokeTransmissionGPU(THREE,renderer,caps);
    const prepare=qaSmokeTransmissionField.prepare;
    qaSmokeTransmissionField.prepare=input=>{const result=prepare(input);qaSmokeTransmissionInput=input;return result;};
  }
  lastPausedRenderKey=null;lens?.resetTemporalHistory('source transmission backend');
}
function setSmokeGPUEnabled(enabled){
  if(qaRenderLock||qaFrozenWorkload)throw new Error('A rendering diagnostic is active');
  smokeGPURequested=!!enabled;
  if(enabled&&!smokeGPUSupport&&!graphicsContextInterrupted)smokeGPUSupport=checkSmokeTransmissionSupport(THREE,renderer);
  configureSmokeGPUField(enabled&&!!smokeGPUSupport?.passed&&!graphicsContextInterrupted);
  ui.syncFireworks({gpuTransmission:{requested:smokeGPURequested,available:smokeGPUSupport?.passed??true,effective:!!qaSmokeTransmissionField}});
  return {requested:smokeGPURequested,enabled:!!qaSmokeTransmissionField,support:smokeGPUSupport};
}
function frozenWorkloadInfo(){
  const f=fireworks.diagnostics(),round=values=>values.map(v=>Math.round(v*1e8)/1e8),local=localLights.state;
  return {time,utcMs:celestialController.state.utcMs,camera:round(camera.position.toArray()),target:round(controls.target.toArray()),parameters:structuredClone(parameters),localLights:structuredClone({mode:local.mode,lamps:local.lamps,flashlight:local.flashlight}),fireworkSettings:{...fireworksSettings},active:f.activeEvents.map(e=>e.id),launches:f.launches,packets:pyroSmoke.packetCount,stones:stoneThrow.diagnostics().counters.launched,gpuTransmission:!!qaSmokeTransmissionField,gpuTransmissionConfiguration:qaSmokeTransmissionField?{layoutMode:qaSmokeTransmissionField.diagnostics().layoutMode,caps:qaSmokeTransmissionField.diagnostics().caps,route:qaSmokeTransmissionMode}:null,interactionEpoch,pauseIntentEpoch,renderScale};
}
function inspectR30SceneInventory(internal=false){
  if((qaRenderLock&&!internal)||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused)throw new Error('Pause a healthy scene with no active diagnostic first');
  const gl=renderer.getContext(),size=renderer.getSize(new THREE.Vector2()),buffer=renderer.getDrawingBufferSize(new THREE.Vector2()),objects=[],lights=[];
  scene.traverse(object=>{
    let visible=true;for(let parent=object;parent;parent=parent.parent)if(!parent.visible){visible=false;break;}
    if(object.isLight){lights.push({type:object.type,visible,castShadow:!!object.castShadow,intensity:object.intensity,layers:object.layers.mask,shadow:object.shadow?{autoUpdate:object.shadow.autoUpdate,needsUpdate:object.shadow.needsUpdate,mapSize:object.shadow.mapSize.toArray(),viewports:object.shadow.getViewportCount()}:null});return;}
    if(!(object.isMesh||object.isLine||object.isPoints))return;
    const geometry=object.geometry,materials=Array.isArray(object.material)?object.material:[object.material],groups=Array.isArray(object.material)?geometry.groups:[{start:0,count:geometry.index?.count??geometry.attributes.position?.count??0,materialIndex:0}];
    let drawUnits=0,shadowUnits=0;
    for(const group of groups){const material=materials[group.materialIndex??0];if(!material?.visible||group.count===0)continue;drawUnits+=material.transparent&&material.side===THREE.DoubleSide&&!material.forceSinglePass?2:1;shadowUnits++;}
    if(geometry.drawRange.count===0||(object.isInstancedMesh&&object.count===0)||(geometry.isInstancedBufferGeometry&&geometry.instanceCount===0))drawUnits=shadowUnits=0;
    objects.push({name:object.name,type:object.type,visible,layers:object.layers.mask,mainLayer:camera.layers.test(object.layers),drawUnits,shadowUnits,castShadow:!!object.castShadow,frustumCulled:object.frustumCulled,positions:geometry.attributes.position?.count??0,indexCount:geometry.index?.count??0,instances:object.isInstancedMesh?object.count:geometry.isInstancedBufferGeometry?geometry.instanceCount:1});
  });
  return {schema:'glass-atoll.r30-scene-inventory.v1',actualGPU:false,sceneDrawsSubmitted:0,time,paused:parameters.paused,empty:fireworks.diagnostics().active===0&&pyroSmoke.packetCount===0,renderer:{logicalSize:size.toArray(),drawingBufferSize:buffer.toArray(),pixelRatio:renderer.getPixelRatio(),canvasStyle:{width:renderer.domElement.style.width,height:renderer.domElement.style.height},drawingBufferFormat:gl.drawingBufferFormat??null,drawingBufferStorage:typeof gl.drawingBufferStorage,RGBA8:gl.RGBA8,RGBA16F:gl.RGBA16F,UNSIGNED_NORMALIZED:gl.UNSIGNED_NORMALIZED,FLOAT:gl.FLOAT,shadowMap:{enabled:renderer.shadowMap.enabled,autoUpdate:renderer.shadowMap.autoUpdate,needsUpdate:renderer.shadowMap.needsUpdate},autoClear:renderer.autoClear,sortObjects:renderer.sortObjects},camera:{position:camera.position.toArray(),target:controls.target.toArray(),aspect:camera.aspect,layers:camera.layers.mask},objects,lights,visibleDrawUnits:objects.filter(o=>o.visible).reduce((n,o)=>n+o.drawUnits,0),visibleShadowUnits:objects.filter(o=>o.visible&&o.castShadow).reduce((n,o)=>n+o.shadowUnits,0),lens:lens.state,water:water.diagnostics(),parameters:structuredClone(parameters),localLights:localLights.state,smoke:pyroSmoke.diagnostics(),sourceT:qaSmokeTransmissionField?.diagnostics()??null,contextLost:gl.isContextLost()};
}
function createR30SceneBridge(captureViews){
  const originalFireworks=fireworks,originalSmoke=pyroSmoke,entryViewport=[innerWidth,innerHeight,devicePixelRatio];
  let installed=null,restoration=null,closed=false;
  const demand=(value,message)=>{if(!value)throw new Error(message);};
  function fingerprint(){
    const intent=structuredClone(parameters),locals=localLights.state,celestial=celestialController.state,oldFireworks=originalFireworks.diagnostics();
    if(intent.graphics.systemCalibration)delete intent.graphics.peakNits;
    return JSON.stringify({intent,fireworkSettings:{...fireworksSettings},locals:{mode:locals.mode,linked:locals.linked,lamps:locals.lamps,flashlight:locals.flashlight},celestial:{mode:celestial.mode,utcMs:celestial.utcMs,running:celestial.running,rate:celestial.rate,observer:celestial.observer,timeZoneOffsetMinutes:celestial.timeZoneOffsetMinutes},camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),target:controls.target.toArray(),viewport:[innerWidth,innerHeight,devicePixelRatio],interactionEpoch,pauseIntentEpoch,original:{launches:oldFireworks.launches,active:oldFireworks.activeEvents.map(e=>e.id),revision:originalSmoke.diagnostics().state.revision},graphicsContextInterrupted});
  }
  function rigUnits(rig){let units=0;rig.traverse(object=>{if(!object.isMesh)return;let visible=true;for(let p=object;p;p=p.parent)if(!p.visible){visible=false;break;}if(!visible)return;const materials=Array.isArray(object.material)?object.material:[object.material],groups=Array.isArray(object.material)?object.geometry.groups:[{count:1,materialIndex:0}];for(const group of groups){const material=materials[group.materialIndex??0];if(material?.visible&&group.count!==0)units+=material.transparent&&material.side===THREE.DoubleSide&&!material.forceSinglePass?2:1;}});return units;}
  async function plan(pair){
    demand(!closed&&!installed&&fireworks===originalFireworks&&pyroSmoke===originalSmoke,'Original scene must remain installed during CPU planning');pair.assertReady();
    const inventory=inspectR30SceneInventory(true),optics={...currentOptics(),width:160,height:171},frame={time:pair.time,storageEV:radiometry.state.storageEV,rawPerCandela:RAW_PER_CANDELA};
    const views=await captureViews(THREE,pair,{camera,reflectionCamera:water.prepareReflectionCamera(),frame,optics});
    pair.assertReady();const replacementUnits=inventory.visibleDrawUnits-rigUnits(originalFireworks.rig)+rigUnits(pair.fireworks.rig);
    return {...views,inventory,replacementUnits,dimensions:{width:160,height:171,outputWidth:160,outputHeight:171,reflectionWidth:160,reflectionHeight:171,cameraAspect:camera.aspect},environmentScope:'Existing paused ocean/vegetation/cloud environment; fresh native firework/density/photometry and actual SDR scene composition, without wave/hydrodynamic advancement'};
  }
  function install(pair,field){
    demand(!closed&&!installed&&fireworks===originalFireworks&&pyroSmoke===originalSmoke,'Only one owned scene transaction');pair.assertReady();demand(pair.fireworks.rig.parent===null,'Owned launcher must be detached');demand(parameters.paused&&fireworksSettings.persistentSmoke&&fireworksSettings.resolvedSmokeLighting&&fireworksSettings.cloudIllumination&&qaSmokeTransmissionMode==='fast','Current scene must enable the reviewed smoke/cloud paths');
    const logical=renderer.getSize(new THREE.Vector2()),buffer=renderer.getDrawingBufferSize(new THREE.Vector2()),gl=renderer.getContext();
    installed={pair,field,context:gl,time,effectiveWind,frameSnapshot,radiometry:radiometry.state,sourceT:qaSmokeTransmissionField,sourceInput:qaSmokeTransmissionInput,rigVisible:originalFireworks.rig.visible,rigParent:originalFireworks.rig.parent,rigSibling:originalFireworks.rig.parent?.children.indexOf(originalFireworks.rig),bodyInert:document.body.inert,controlsEnabled:controls.enabled,renderer:{target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),logical:logical.toArray(),buffer:buffer.toArray(),pixelRatio:renderer.getPixelRatio(),styleWidth:renderer.domElement.style.width,styleHeight:renderer.domElement.style.height,format:gl.drawingBufferFormat},lens:{...lens.state},waterTime:water.uniforms.uTime.value,frameSettings:JSON.stringify(pair.fireworks.diagnostics().settings)};
    // Mark installed before any mutation so partial setup also has a rollback.
    document.body.inert=true;controls.enabled=false;
    pair.fireworks.rig.traverse(object=>{if(object.isMesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){applyCloudLighting(material,atmosphere);indirectLighting.apply(material);localLights.apply(material);}});
    originalFireworks.rig.visible=false;scene.add(pair.fireworks.rig);fireworks=pair.fireworks;pyroSmoke=pair.pyroSmoke;qaSmokeTransmissionField=field;qaSmokeTransmissionInput=null;time=pair.time;
    renderer.setRenderTarget(null);lens.setHDROutput(null);renderer.setDrawingBufferSize(160,171,1);
    if(typeof gl.drawingBufferStorage==='function'&&gl.drawingBufferFormat!==undefined)gl.drawingBufferStorage(gl.drawingBufferFormat,160,171);
    water.resize(160,171,parameters.quality);lens.setSize(160,171,160,171);lens.resetTemporalHistory('R30 fresh owned SDR frame');
    demand(camera.aspect===entryViewport[0]/entryViewport[1],'Original camera aspect changed during setup');
    return readScene();
  }
  function renderFrameSDR(mark){
    demand(installed&&!closed&&fireworks===installed.pair.fireworks&&pyroSmoke===installed.pair.pyroSmoke,'Owned scene is not installed');installed.pair.assertReady();
    mark('photometry');setAir();updateScenePhotometry(0,true);setAir();
    mark('water');water.render(time);
    mark('lens');lens.render(scene,camera.position.distanceTo(controls.target),{sdr:true});
    mark('complete');return readScene();
  }
  function readScene(){return {sceneInventory:inspectR30SceneInventory(true),fireworks:fireworks.diagnostics(),smoke:pyroSmoke.diagnostics(),sourceT:qaSmokeTransmissionField?.diagnostics()??null,frame:frameSnapshot?structuredClone(frameSnapshot):null,radiometry:radiometry.state,lens:lens.state,water:water.diagnostics(),flags:{ownedInstalled:!!installed&&fireworks===installed.pair.fireworks&&pyroSmoke===installed.pair.pyroSmoke&&qaSmokeTransmissionField===installed.field,pairSettingsUnchanged:installed?JSON.stringify(installed.pair.fireworks.diagnostics().settings)===installed.frameSettings:null,originalRigPreserved:originalFireworks.rig.parent===installed?.rigParent&&originalFireworks.rig.parent?.children.indexOf(originalFireworks.rig)===installed?.rigSibling,bodyInert:document.body.inert,controlsEnabled:controls.enabled,persistentSmoke:fireworksSettings.persistentSmoke,resolvedSmokeLighting:fireworksSettings.resolvedSmokeLighting,cloudIllumination:fireworksSettings.cloudIllumination,route:qaSmokeTransmissionMode}};}
  function restore({allowPresentation=false}={}){
    demand(allowPresentation===false,'Measured helper must not dispatch restoration presentation');
    if(closed)return restoration;closed=true;
    if(!installed)return restoration={changed:false,drawsSubmitted:0};
    const saved=installed,gl=saved.context,errors=[];
    const attempt=(stage,operation)=>{try{return operation();}catch(error){errors.push({stage,error:String(error?.stack??error).slice(0,2048)});return undefined;}};
    try{
      fireworks=originalFireworks;pyroSmoke=originalSmoke;qaSmokeTransmissionField=saved.sourceT;qaSmokeTransmissionInput=saved.sourceInput;time=saved.time;effectiveWind=saved.effectiveWind;frameSnapshot=saved.frameSnapshot;
      attempt('detach owned rig',()=>saved.pair.fireworks.rig.removeFromParent());originalFireworks.rig.visible=saved.rigVisible;
      attempt('detach HDR while restoring lens sizes',()=>lens.setHDROutput(null));attempt('bind default before recreating target storage',()=>renderer.setRenderTarget(null));
      const viewportChanged=innerWidth!==entryViewport[0]||innerHeight!==entryViewport[1]||devicePixelRatio!==entryViewport[2];
      const logicalWidth=viewportChanged?innerWidth:saved.renderer.logical[0],logicalHeight=viewportChanged?innerHeight:saved.renderer.logical[1],pixelRatio=viewportChanged?Math.min(devicePixelRatio,parameters.renderSampling?.dprCap??1.65):saved.renderer.pixelRatio;
      const outputWidth=viewportChanged?Math.floor(logicalWidth*pixelRatio):saved.lens.outputWidth,outputHeight=viewportChanged?Math.floor(logicalHeight*pixelRatio):saved.lens.outputHeight,sceneWidth=viewportChanged?Math.max(1,Math.round(outputWidth*renderScale)):saved.lens.width,sceneHeight=viewportChanged?Math.max(1,Math.round(outputHeight*renderScale)):saved.lens.height;
      attempt('restore drawing-buffer dimensions',()=>renderer.setDrawingBufferSize(logicalWidth,logicalHeight,pixelRatio));
      renderer.domElement.style.width=viewportChanged?logicalWidth+'px':saved.renderer.styleWidth;renderer.domElement.style.height=viewportChanged?logicalHeight+'px':saved.renderer.styleHeight;
      if(viewportChanged)attempt('preserve resized user camera',()=>{camera.aspect=logicalWidth/logicalHeight;camera.setFocalLength(parameters.lens.focal);});
      attempt('restore water dimensions',()=>water.resize(sceneWidth,sceneHeight,parameters.quality));attempt('restore lens dimensions',()=>lens.setSize(sceneWidth,sceneHeight,outputWidth,outputHeight));
      if(!gl.isContextLost()&&typeof gl.drawingBufferStorage==='function'&&saved.renderer.format!==undefined)attempt('restore drawing-buffer numeric format',()=>gl.drawingBufferStorage(saved.renderer.format,renderer.domElement.width,renderer.domElement.height));
      attempt('restore CPU photometric storage',()=>radiometry.update({recommendedEV:saved.radiometry.storageEV,cameraExposureEV:saved.radiometry.cameraEV,bounds:saved.radiometry.components,dt:0,force:true}));
      water.uniforms.uTime.value=saved.waterTime;attempt('restore lens storage exposure',()=>lens.setFrameExposure(saved.lens.storageEV,{dynamic:saved.lens.dynamicLighting}));attempt('invalidate rebuilt temporal history',()=>lens.resetTemporalHistory('R30 restore original presentation'));
      if(!gl.isContextLost())attempt('rebind original Three target using fresh storage',()=>renderer.setRenderTarget(saved.renderer.target,saved.renderer.face,saved.renderer.mip));lastPausedRenderKey=null;
      restoration={changed:true,passed:errors.length===0&&!gl.isContextLost(),errors,drawsSubmitted:0,viewportChanged,userIntentOverwritten:false,originalRefs:fireworks===originalFireworks&&pyroSmoke===originalSmoke&&qaSmokeTransmissionField===saved.sourceT,rigParentAndSiblingPreserved:originalFireworks.rig.parent===saved.rigParent&&originalFireworks.rig.parent?.children.indexOf(originalFireworks.rig)===saved.rigSibling,history:'Invalidated for normal original-scene rebuilding; no bitwise cache/history restoration claim',photometry:'Normal original empty scene must recompute lighting/cache presentation separately',native:'Original target object is rebound with recreated storage; no equality claim for disposed framebuffer/texture handles',dimensions:attempt('read restored dimensions',()=>renderer.getDrawingBufferSize(new THREE.Vector2()).toArray())};
      restoration.passed=errors.length===0&&!gl.isContextLost();
      return restoration;
    }finally{attempt('reconnect original HDR output',()=>lens.setHDROutput(hdrOutput));attempt('restore body interactivity',()=>{document.body.inert=saved.bodyInert;});attempt('restore orbit controls',()=>{controls.enabled=saved.controlsEnabled;});installed=null;if(restoration)restoration.passed=errors.length===0&&!gl.isContextLost();}
  }
  return Object.freeze({revision:'r30-main-owned-scene-bridge-v1',factory:createR30SceneBridge,fingerprint,plan,install,renderFrameSDR,readScene,restore});
}

function createR31SceneBridge(captureViews){
  const originalFireworks=fireworks,originalSmoke=pyroSmoke,entryViewport=[innerWidth,innerHeight,devicePixelRatio];
  let installed=null,restoration=null,closed=false;
  const demand=(value,message)=>{if(!value)throw new Error(message);};
  function fingerprint(){
    const intent=structuredClone(parameters),locals=localLights.state,celestial=celestialController.state,oldFireworks=originalFireworks.diagnostics();
    if(intent.graphics.systemCalibration)delete intent.graphics.peakNits;
    return JSON.stringify({intent,fireworkSettings:{...fireworksSettings},locals:{mode:locals.mode,linked:locals.linked,lamps:locals.lamps,flashlight:locals.flashlight},celestial:{mode:celestial.mode,utcMs:celestial.utcMs,running:celestial.running,rate:celestial.rate,observer:celestial.observer,timeZoneOffsetMinutes:celestial.timeZoneOffsetMinutes},camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),target:controls.target.toArray(),viewport:[innerWidth,innerHeight,devicePixelRatio],interactionEpoch,pauseIntentEpoch,original:{launches:oldFireworks.launches,active:oldFireworks.activeEvents.map(e=>e.id),revision:originalSmoke.diagnostics().state.revision},graphicsContextInterrupted});
  }
  function rigUnits(rig){let units=0;rig.traverse(object=>{if(!object.isMesh)return;let visible=true;for(let p=object;p;p=p.parent)if(!p.visible){visible=false;break;}if(!visible)return;const materials=Array.isArray(object.material)?object.material:[object.material],groups=Array.isArray(object.material)?object.geometry.groups:[{count:1,materialIndex:0}];for(const group of groups){const material=materials[group.materialIndex??0];if(material?.visible&&group.count!==0)units+=material.transparent&&material.side===THREE.DoubleSide&&!material.forceSinglePass?2:1;}});return units;}
  async function plan(pair){
    demand(!closed&&!installed&&fireworks===originalFireworks&&pyroSmoke===originalSmoke,'Original scene must remain installed during CPU planning');pair.assertReady();
    const inventory=inspectR30SceneInventory(true),mainExtent={width:1209,height:1292},reflectionExtent={width:water.reflection.width,height:water.reflection.height};
    demand(inventory.renderer.drawingBufferSize[0]===1209&&inventory.renderer.drawingBufferSize[1]===1292&&inventory.lens.width===1209&&inventory.lens.height===1292,'Fixed native original main dimensions must already be resolved');
    demand(water.refraction.width===1209&&water.refraction.height===1292&&reflectionExtent.width===1209&&reflectionExtent.height===1292&&parameters.renderSampling.reflectionScale===1&&parameters.renderSampling.reflectionSamples===2,'Preserve actual native refraction/reflection dimensions and requested sampling');
    const viewExtents={main:mainExtent,reflection:reflectionExtent},optics={...currentOptics(),...mainExtent},frame={time:pair.time,storageEV:radiometry.state.storageEV,rawPerCandela:RAW_PER_CANDELA};
    const views=await captureViews(THREE,pair,{camera,reflectionCamera:water.prepareReflectionCamera(),frame,optics,viewExtents});
    pair.assertReady();const replacementUnits=inventory.visibleDrawUnits-rigUnits(originalFireworks.rig)+rigUnits(pair.fireworks.rig);
    return {...views,inventory,replacementUnits,dimensions:{...mainExtent,outputWidth:1209,outputHeight:1292,reflectionWidth:reflectionExtent.width,reflectionHeight:reflectionExtent.height,cameraAspect:camera.aspect},environmentScope:'Existing paused ocean/vegetation/cloud environment; fresh native firework/density/photometry and actual native-size SDR scene composition, without wave/hydrodynamic advancement'};
  }
  function install(pair,field){
    demand(!closed&&!installed&&fireworks===originalFireworks&&pyroSmoke===originalSmoke,'Only one owned scene transaction');pair.assertReady();demand(pair.fireworks.rig.parent===null,'Owned launcher must be detached');demand(parameters.paused&&fireworksSettings.persistentSmoke&&fireworksSettings.resolvedSmokeLighting&&fireworksSettings.cloudIllumination&&qaSmokeTransmissionMode==='fast','Current scene must enable the reviewed smoke/cloud paths');
    const logical=renderer.getSize(new THREE.Vector2()),buffer=renderer.getDrawingBufferSize(new THREE.Vector2()),gl=renderer.getContext();
    installed={pair,field,context:gl,time,effectiveWind,frameSnapshot,radiometry:radiometry.state,sourceT:qaSmokeTransmissionField,sourceInput:qaSmokeTransmissionInput,rigVisible:originalFireworks.rig.visible,rigParent:originalFireworks.rig.parent,rigSibling:originalFireworks.rig.parent?.children.indexOf(originalFireworks.rig),bodyInert:document.body.inert,controlsEnabled:controls.enabled,renderer:{target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),logical:logical.toArray(),buffer:buffer.toArray(),pixelRatio:renderer.getPixelRatio(),styleWidth:renderer.domElement.style.width,styleHeight:renderer.domElement.style.height,format:gl.drawingBufferFormat},lens:{...lens.state},waterTime:water.uniforms.uTime.value,frameSettings:JSON.stringify(pair.fireworks.diagnostics().settings)};
    // Mark installed before any mutation so partial setup also has a rollback.
    document.body.inert=true;controls.enabled=false;
    pair.fireworks.rig.traverse(object=>{if(object.isMesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){applyCloudLighting(material,atmosphere);indirectLighting.apply(material);localLights.apply(material);}});
    originalFireworks.rig.visible=false;scene.add(pair.fireworks.rig);fireworks=pair.fireworks;pyroSmoke=pair.pyroSmoke;qaSmokeTransmissionField=field;qaSmokeTransmissionInput=null;time=pair.time;
    renderer.setRenderTarget(null);lens.setHDROutput(null);renderer.setDrawingBufferSize(1209,1292,1);
    if(typeof gl.drawingBufferStorage==='function'&&gl.drawingBufferFormat!==undefined)gl.drawingBufferStorage(gl.drawingBufferFormat,1209,1292);
    water.resize(1209,1292,parameters.quality);lens.setSize(1209,1292,1209,1292);lens.resetTemporalHistory('R31 fresh owned SDR frame');
    demand(water.refraction.width===1209&&water.refraction.height===1292&&water.reflection.width===1209&&water.reflection.height===1292&&water.reflection.samples===2&&lens.state.width===1209&&lens.state.height===1292,'Resolved native production targets changed during setup');
    demand(camera.aspect===entryViewport[0]/entryViewport[1],'Original camera aspect changed during setup');
    return readScene();
  }
  function renderFrameSDR(mark){
    demand(installed&&!closed&&fireworks===installed.pair.fireworks&&pyroSmoke===installed.pair.pyroSmoke,'Owned scene is not installed');installed.pair.assertReady();
    mark('photometry');setAir();updateScenePhotometry(0,true);setAir();
    mark('water');water.render(time);
    mark('lens');lens.render(scene,camera.position.distanceTo(controls.target),{sdr:true});
    mark('complete');return readScene();
  }
  function readScene(){return {sceneInventory:inspectR30SceneInventory(true),fireworks:fireworks.diagnostics(),smoke:pyroSmoke.diagnostics(),sourceT:qaSmokeTransmissionField?.diagnostics()??null,frame:frameSnapshot?structuredClone(frameSnapshot):null,radiometry:radiometry.state,lens:lens.state,water:water.diagnostics(),flags:{ownedInstalled:!!installed&&fireworks===installed.pair.fireworks&&pyroSmoke===installed.pair.pyroSmoke&&qaSmokeTransmissionField===installed.field,pairSettingsUnchanged:installed?JSON.stringify(installed.pair.fireworks.diagnostics().settings)===installed.frameSettings:null,originalRigPreserved:originalFireworks.rig.parent===installed?.rigParent&&originalFireworks.rig.parent?.children.indexOf(originalFireworks.rig)===installed?.rigSibling,bodyInert:document.body.inert,controlsEnabled:controls.enabled,persistentSmoke:fireworksSettings.persistentSmoke,resolvedSmokeLighting:fireworksSettings.resolvedSmokeLighting,cloudIllumination:fireworksSettings.cloudIllumination,route:qaSmokeTransmissionMode}};}
  function restore({allowPresentation=false}={}){
    demand(allowPresentation===false,'Measured helper must not dispatch restoration presentation');
    if(closed)return restoration;closed=true;
    if(!installed)return restoration={changed:false,drawsSubmitted:0};
    const saved=installed,gl=saved.context,errors=[];
    const attempt=(stage,operation)=>{try{return operation();}catch(error){errors.push({stage,error:String(error?.stack??error).slice(0,2048)});return undefined;}};
    try{
      fireworks=originalFireworks;pyroSmoke=originalSmoke;qaSmokeTransmissionField=saved.sourceT;qaSmokeTransmissionInput=saved.sourceInput;time=saved.time;effectiveWind=saved.effectiveWind;frameSnapshot=saved.frameSnapshot;
      attempt('detach owned rig',()=>saved.pair.fireworks.rig.removeFromParent());originalFireworks.rig.visible=saved.rigVisible;
      attempt('detach HDR while restoring lens sizes',()=>lens.setHDROutput(null));attempt('bind default before recreating target storage',()=>renderer.setRenderTarget(null));
      const viewportChanged=innerWidth!==entryViewport[0]||innerHeight!==entryViewport[1]||devicePixelRatio!==entryViewport[2];
      const logicalWidth=viewportChanged?innerWidth:saved.renderer.logical[0],logicalHeight=viewportChanged?innerHeight:saved.renderer.logical[1],pixelRatio=viewportChanged?Math.min(devicePixelRatio,parameters.renderSampling?.dprCap??1.65):saved.renderer.pixelRatio;
      const outputWidth=viewportChanged?Math.floor(logicalWidth*pixelRatio):saved.lens.outputWidth,outputHeight=viewportChanged?Math.floor(logicalHeight*pixelRatio):saved.lens.outputHeight,sceneWidth=viewportChanged?Math.max(1,Math.round(outputWidth*renderScale)):saved.lens.width,sceneHeight=viewportChanged?Math.max(1,Math.round(outputHeight*renderScale)):saved.lens.height;
      attempt('restore drawing-buffer dimensions',()=>renderer.setDrawingBufferSize(logicalWidth,logicalHeight,pixelRatio));
      renderer.domElement.style.width=viewportChanged?logicalWidth+'px':saved.renderer.styleWidth;renderer.domElement.style.height=viewportChanged?logicalHeight+'px':saved.renderer.styleHeight;
      if(viewportChanged)attempt('preserve resized user camera',()=>{camera.aspect=logicalWidth/logicalHeight;camera.setFocalLength(parameters.lens.focal);});
      attempt('restore water dimensions',()=>water.resize(sceneWidth,sceneHeight,parameters.quality));attempt('restore lens dimensions',()=>lens.setSize(sceneWidth,sceneHeight,outputWidth,outputHeight));
      if(!gl.isContextLost()&&typeof gl.drawingBufferStorage==='function'&&saved.renderer.format!==undefined)attempt('restore drawing-buffer numeric format',()=>gl.drawingBufferStorage(saved.renderer.format,renderer.domElement.width,renderer.domElement.height));
      attempt('restore CPU photometric storage',()=>radiometry.update({recommendedEV:saved.radiometry.storageEV,cameraExposureEV:saved.radiometry.cameraEV,bounds:saved.radiometry.components,dt:0,force:true}));
      water.uniforms.uTime.value=saved.waterTime;attempt('restore lens storage exposure',()=>lens.setFrameExposure(saved.lens.storageEV,{dynamic:saved.lens.dynamicLighting}));attempt('invalidate rebuilt temporal history',()=>lens.resetTemporalHistory('R31 restore original presentation'));
      if(!gl.isContextLost())attempt('rebind original Three target using fresh storage',()=>renderer.setRenderTarget(saved.renderer.target,saved.renderer.face,saved.renderer.mip));lastPausedRenderKey=null;
      restoration={changed:true,passed:errors.length===0&&!gl.isContextLost(),errors,drawsSubmitted:0,viewportChanged,userIntentOverwritten:false,originalRefs:fireworks===originalFireworks&&pyroSmoke===originalSmoke&&qaSmokeTransmissionField===saved.sourceT,rigParentAndSiblingPreserved:originalFireworks.rig.parent===saved.rigParent&&originalFireworks.rig.parent?.children.indexOf(originalFireworks.rig)===saved.rigSibling,history:'Invalidated for normal original-scene rebuilding; no bitwise cache/history restoration claim',photometry:'Normal original empty scene must recompute lighting/cache presentation separately',native:'Original target object is rebound with recreated storage; no equality claim for disposed framebuffer/texture handles',dimensions:attempt('read restored dimensions',()=>renderer.getDrawingBufferSize(new THREE.Vector2()).toArray())};
      restoration.passed=errors.length===0&&!gl.isContextLost();
      return restoration;
    }finally{attempt('reconnect original HDR output',()=>lens.setHDROutput(hdrOutput));attempt('restore body interactivity',()=>{document.body.inert=saved.bodyInert;});attempt('restore orbit controls',()=>{controls.enabled=saved.controlsEnabled;});installed=null;if(restoration)restoration.passed=errors.length===0&&!gl.isContextLost();}
  }
  return Object.freeze({revision:'r31-main-owned-native-scene-bridge-v1',factory:createR31SceneBridge,fingerprint,plan,install,renderFrameSDR,readScene,restore});
}
async function runR33WaterSolarJob(exportName,options){
  if(!['runR33WaterSolarControls','runR33WaterSolarTiming'].includes(exportName)||Reflect.ownKeys(options).length)throw new Error('R33 uses one fixed reviewed closed job; no caller overrides');
  if(qaRenderLock||qaFrozenWorkload||renderBenchmark.active||graphicsContextInterrupted||!parameters.paused||qualityApplying||displaySettingsApplying||refreshingDisplay||displaySettingsPending||displayRefreshPending||qaSmokeVariants||inspection||throwGesture||pendingThrow||transition||parameters.director.mode!=='off'||fireworks.diagnostics().active||fireworks.diagnostics().queued||pyroSmoke.packetCount)throw new Error('Pause an empty healthy scene after display calibration and interaction settle first');
  const key=JSON.stringify(frozenWorkloadInfo());qaRenderLock=true;let bridge=null,result=null;
  try{
    const module=await import('./verification/r33-water-solar-gpu-check.js');
    if(JSON.stringify(frozenWorkloadInfo())!==key||graphicsContextInterrupted||!parameters.paused||qualityApplying||displaySettingsApplying||refreshingDisplay)throw new Error('Scene changed during R33 loading; user action preserved');
    bridge=createR32WaterSolarBridge();result=await module[exportName](THREE,renderer,{parentLocked:true,bridge});return result;
  }finally{
    try{const restored=bridge?.restore();if(result&&restored){result.rootRestoration=restored;if(!restored.passed){result.measurementPassed=result.passed;result.passed=false;}}}
    finally{clock.getDelta();qaRenderLock=false;}
  }
}
function createR32WaterSolarBridge(){
  const originalMesh=water.mesh,originalGeometry=water.mesh.geometry,originalMaterial=water.mesh.material,originalUniforms=water.uniforms;
  const originalParent=originalMesh.parent,originalSibling=originalParent?.children.indexOf(originalMesh),bodyInertBefore=document.body.inert;
  const entryKey=JSON.stringify(frozenWorkloadInfo());let borrowed=false,restoration=null;
  const fingerprint=()=>JSON.stringify(frozenWorkloadInfo());
  function borrow(){
    if(borrowed||restoration||fingerprint()!==entryKey||!parameters.paused||graphicsContextInterrupted)throw new Error('Water fixture changed or was already borrowed');
    const buffer=renderer.getDrawingBufferSize(new THREE.Vector2());
    if(buffer.x!==1209||buffer.y!==1292||originalUniforms.uSunIrradiance.value!==0||originalUniforms.uSubmergedCount.value!==0||originalUniforms.uDebugMode.value!==0)throw new Error('R32 first fixture requires native1209x1292, exact zero key, no props and debug0');
    borrowed=true;document.body.inert=true;
    return Object.freeze({mesh:originalMesh,camera:camera.clone(),width:buffer.x,height:buffer.y,frame:structuredClone(frameSnapshot),waterDiagnostics:water.diagnostics(),phaseTime:time,bodyInertBefore});
  }
  function restore(){
    if(restoration)return restoration;
    const errors=[];
    if(water.mesh!==originalMesh||originalMesh.geometry!==originalGeometry||originalMesh.material!==originalMaterial||water.uniforms!==originalUniforms||originalMesh.parent!==originalParent||originalParent?.children.indexOf(originalMesh)!==originalSibling)errors.push('Original water mesh/material/geometry/uniforms/parent changed');
    const intentUnchanged=fingerprint()===entryKey;
    if(!intentUnchanged)errors.push('User scene intent changed; no original values were overwritten');
    document.body.inert=bodyInertBefore;
    restoration={changed:borrowed,passed:errors.length===0&&!graphicsContextInterrupted,errors,userIntentOverwritten:false,originalRefs:errors.length===0,drawsSubmitted:0,bodyInertRestored:document.body.inert===bodyInertBefore};return restoration;
  }
  return Object.freeze({revision:'r32-borrowed-water-bridge-v1',factory:createR32WaterSolarBridge,fingerprint,borrow,restore});
}
function frame(){
  requestAnimationFrame(frame);
  const frameStart=performance.now();
  const profile=activeFrameProfile&&frameStart<activeFrameProfile.until?{quality:parameters.qualityPreset,started:frameStart,phases:{},last:frameStart}:null;
  const mark=name=>{if(profile){const now=performance.now();profile.phases[name]=now-profile.last;profile.last=now;}};
  const wallDelta=clock.getDelta();
  let delta=Math.min(wallDelta,.055);if(qaFrozenWorkload)delta=0;
  if(document.hidden||qaRenderLock||graphicsContextInterrupted||jointSmokeFault){discardJointSmokePlan();frameRateMeter.reset(frameStart);return;}
  if(!displaySettingsBlocked()&&!displaySettingsApplying){
    if(displayRefreshPending)void refreshDisplay();
    else if(displaySettingsPending)void applyDisplaySettings().catch(error=>console.warn('Display selection:',error.message));
  }
  if(displaySettingsApplying){frameRateMeter.reset(frameStart);return;}
  if(qaFrozenGuard&&!qaFrozenGuard.cancelled&&JSON.stringify(frozenWorkloadInfo())!==qaFrozenGuard.key){qaFrozenGuard.cancelled=true;renderBenchmark.cancel('Scene changed during measurement; sample discarded');}
  const stopAtTarget=!parameters.paused&&pauseTargetTime!==null&&time+delta>=pauseTargetTime;
  if(stopAtTarget)delta=Math.max(0,pauseTargetTime-time);
  const gl=renderer.getContext();
  if(gpuTimer&&gpuQueries.length&&gl.getQueryParameter(gpuQueries[0],gl.QUERY_RESULT_AVAILABLE)){
    const query=gpuQueries.shift();if(!gl.getParameter(gpuTimer.GPU_DISJOINT_EXT)){gpuMs=Number((gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6).toFixed(3));renderBenchmark.gpu(gpuMs);}gl.deleteQuery(query);
  }
  let activeQuery=null;
  mark('timer-read');
  frameIndex++;
  if(!parameters.paused&&gpuTimer&&(renderBenchmark.active||frameIndex>=nextGpuFrame)&&gpuQueries.length<6){activeQuery=gl.createQuery();gl.beginQuery(gpuTimer.TIME_ELAPSED_EXT,activeQuery);nextGpuFrame=frameIndex+97+(frameIndex%37);}
  if(!parameters.paused){
    time=stopAtTarget?pauseTargetTime:time+delta;
    effectiveWind+=(parameters.wind-effectiveWind)*(1.-Math.exp(-delta/1.4));
    water.uniforms.uWind.value=waveWindFactor(effectiveWind);
    waveSpectrum.update(time);
    if(grove.userData.windStrength)grove.userData.windStrength.value=effectiveWind;
    water.uniforms.uCurrentOffset.value.addScaledVector(water.uniforms.uMeanCurrent.value,delta);
    hydrodynamics.update(delta,time);
    floatingLeaves.update(delta,time);
    grove?.userData.update?.(time);
    atmosphere.update({time,wind:effectiveWind,camera});
    if(sandShader)sandShader.uniforms.uSandTime.value=time;
    for(const f of fish){const t=time*.2+f.offset;f.group.position.set(24+Math.cos(t)*3,-.9+Math.sin(t*1.1)*.1,20+Math.sin(t)*2.);f.group.rotation.y=-t-Math.PI/2;f.tail.rotation.x=Math.sin(time*13+f.offset)*.25;}
  }
  mark('physical-simulation');
  celestialFrame=celestialController.update({time,dt:delta,paused:parameters.paused});
  atmosphere.setCelestial(celestialFrame);
  if(celestialFrame.mode==='astronomical'){sunDirection.fromArray(celestialFrame.sunDirection);if(atmosphere.uniforms.uSkyIntensity.value!==1)atmosphere.setSun({intensity:1});}
  else atmosphere.setSun({direction:sunDirection,intensity:parameters.sun.intensity});
  if(transition){
    // A hidden tab or a stalled frame cannot skip an entire camera turn.
    transition.elapsedSeconds+=Math.min(delta,.05);
    const pose=transition.plan.sample(transition.elapsedSeconds);
    camera.position.fromArray(pose.position);controls.target.fromArray(pose.target);
    if(pose.done){transition=null;controls.maxDistance=Math.max(230,camera.position.distanceTo(controls.target)*1.001);controls.maxTargetRadius=Math.max(1500,controls.target.length()*1.001);}
  }
  const directorPose=cameraDirector.update({dt:delta,paused:parameters.paused});
  if(directorPose){camera.position.fromArray(directorPose.position);controls.target.fromArray(directorPose.target);}
  const navigationChanged=navigation.update(delta);
  controls.update();
  if(pendingThrow&&performance.now()>=pendingThrow.at){const p=pendingThrow;pendingThrow=null;stoneThrow.launch(camera,p.x,p.z,time);}
  if(!parameters.paused)stoneThrow.update(time);
  // Keep the observer above the actual surface, including after panning on land.
  const floor=Math.max(.42,terrainHeight(camera.position.x,camera.position.z)+.5);
  if(camera.position.y<floor){const correction=floor-camera.position.y;camera.position.y=floor;if(navigationChanged)controls.target.y+=correction;camera.lookAt(controls.target);}
  camera.updateMatrixWorld();
  mark('celestial-navigation');
  if(!parameters.paused)fireworks.update({time,dt:delta,windVector:[effectiveWind*.936,0,effectiveWind*.352]});
  flushPyroSources();
  const launchCount=fireworks.diagnostics().launches;
  if(fireworksSettings.autoFrame&&launchCount>lastFramedLaunches)frameFireworks();
  lastFramedLaunches=launchCount;
  mark('firework-simulation-audio');
  setAir();updateScenePhotometry(delta);
  mark('photometry');
  splashes.update(delta,time,camera,lens.state.height);
  if(throwGesture&&!throwGesture.cancelled&&!throwGesture.picking)ui.setThrowCharge(Math.min(1,(performance.now()-throwGesture.time)/1200),true);
  ui.locateLeaf(performance.now()<leafLocatorUntil?floatingLeaves.locate(camera,{viewportWidth:innerWidth,viewportHeight:innerHeight}):null,performance.now()<leafLocatorUntil);
  mark('locators-cloud-GI');
  updateDynamicEnvironment();
  mark('environment-capture');
  if(!parameters.paused&&time-lastShadowTime>=1/shadowQuality.hz){shadowQuality.update();sunLight.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;lastShadowTime=time;}
  if(localLights.shadowNeedsUpdate)renderer.shadowMap.needsUpdate=true;
  setAir();
  water.setSubmergedObjects([...stoneThrow.underwaterState,...stoneThrow.restingState.filter(stone=>stone.kind==='water')]);
  caustics.update(time);
  sand.update(time);
  mark('shadow-caustics-sand');
  // Once a paused view has settled, retain its presented canvas. Camera,
  // light, weather, lens, resize and environment changes immediately redraw.
  const roundedPose=values=>values.map(v=>Math.round(v*1e8)/1e8);
  const pausedKey=parameters.paused?JSON.stringify([roundedPose(camera.position.toArray()),roundedPose(controls.target.toArray()),parameters,renderScale,innerWidth,innerHeight,scene.environment?.uuid,water.uniforms.uDebugMode.value,frameSnapshot.storageEV,Math.round(frameSnapshot.outputExposureScale*1e10)/1e10,celestialFrame.physicalSkyRevision,localLights.state.flashlight]):null;
  if(!parameters.paused||pausedKey!==lastPausedRenderKey){pausedSteadyFrames=0;lastPausedRenderKey=pausedKey;}
  else pausedSteadyFrames++;
  pausedRenderCached=parameters.paused&&pausedSteadyFrames>40&&!inspection;
  if(!pausedRenderCached&&!jointSmokeFault){atmosphere.prepareStarView(renderer,camera,{width:lens.state.width,height:lens.state.height,storageEV:frameSnapshot.storageEV,frame:frameSnapshot,optics:currentOptics()});try{renderSceneFrame({mark});}catch(error){if(!jointSmokePilot)throw error;failJointSmokePlan(error);}}else discardJointSmokePlan();
  if(frameProbe){const callback=frameProbe;frameProbe=null;callback(frameStart);}
  if(inspection)renderer.render(inspection.scene,inspection.camera);
  if(activeQuery){gl.endQuery(gpuTimer.TIME_ELAPSED_EXT);gpuQueries.push(activeQuery);}
  if(!parameters.paused)governor.update({delta,wallDelta,gpuMs,cpuMs:performance.now()-frameStart,frameMs:wallDelta*1000});
  const now=performance.now();
  const rate=frameRateMeter.tick(now,{rendered:!pausedRenderCached,paused:parameters.paused});
  if(now-lastUIUpdate>500){lastUIUpdate=now;syncTimeUI();const ps=fireworks.diagnostics(),gpu=qaSmokeTransmissionField?.diagnostics();ui.syncFireworks({...fireworksSettings,active:ps.active,queued:ps.queued,maxActive:ps.maxActive,lightFieldStatus:smokeLightStatus,gpuTransmission:{requested:smokeGPURequested,available:smokeGPUSupport?.passed??true,effective:gpu?.effective??!!qaSmokeTransmissionField,idle:!ps.active||!pyroSmoke.packetCount,reason:gpu?.reason}});ui.setNavigationStatus({speedMps:navigation.state.speedMetresPerSecond,message:'滚轮沿视线移动；按住右键滚轮调整移动速度'});}
  if(rate){fps=rate.fps;ui.setStats({fps:rate.warmingUp?null:fps,gpuMs,paused:parameters.paused,status:'ready',renderScale,focusMetres:lens.state.focusMetres});renderer.domElement.dataset.fps=rate.warmingUp?'':String(fps);renderer.domElement.dataset.camera=JSON.stringify(camera.position.toArray());renderer.domElement.dataset.simulationTime=time.toFixed(3);renderer.domElement.dataset.ripples=String(water.uniforms.uRipples.value.filter(v=>time-v.z>=0&&time-v.z<7).length);}
  camera.getWorldDirection(audioForward);
  soundscape.update({time,wind:effectiveWind,cameraPosition:camera.position,cameraForward:audioForward,paused:parameters.paused||document.hidden,swellEnvelope:shoreSoundEnvelope()});
  fireworksAudio.update({paused:parameters.paused||document.hidden});
  mark('ui-audio');
  if(profile){profile.total=performance.now()-frameStart;delete profile.last;activeFrameProfile.frames.push(profile);}
  renderBenchmark.frame(frameStart,performance.now()-frameStart);
  if(stopAtTarget){pauseTargetTime=null;parameters.paused=true;ui.setPaused(true);lastPausedRenderKey=null;}
}

async function setSound(enabled){
  await soundscape.setEnabled(enabled);
  if(enabled&&soundscape.state.enabled)await fireworksAudio?.prepare();else fireworksAudio?.cancel();
}
function createShoreline(){
  return Array.from({length:96},(_,i)=>{
    const angle=i/96*Math.PI*2,dx=Math.cos(angle),dz=Math.sin(angle);
    let lo=0,hi=85;
    for(let j=0;j<20;j++){const r=(lo+hi)*.5;if(terrainHeight(-1.5+dx*r,-1+dz*r)>0)lo=r;else hi=r;}
    return [-1.5+dx*(lo+hi)*.5,.05,-1+dz*(lo+hi)*.5];
  });
}
function shoreSoundEnvelope(){
  if(!shoreline.length||!water)return .5;
  let nearest=shoreline[0],best=Infinity;
  for(const p of shoreline){const d=(p[0]-camera.position.x)**2+(p[2]-camera.position.z)**2;if(d<best){best=d;nearest=p;}}
  const offset=water.uniforms.uCurrentOffset.value,wind=water.uniforms.uWind.value,current=water.uniforms.uMeanCurrent.value;
  let h=0,velocity=0;
  for(const w of acousticWaves){
    const phase=((nearest[0]-offset.x)*w.dx+(nearest[2]-offset.y)*w.dz)*w.k-w.omega*time+w.phase;
    const gain=w.kind==='swell'?water.uniforms.uSwell.value:wind*water.uniforms.uWindSea.value;
    h+=w.amplitude*gain*Math.sin(phase);
    velocity-=w.amplitude*gain*(w.omega+w.k*(w.dx*current.x+w.dz*current.y))*Math.cos(phase);
  }
  // Envelope from the same resolved fine-wave phases, not random audio sine
  // oscillators. GPU long-wave velocity is not read back into the audio graph.
  return THREE.MathUtils.clamp(Math.hypot(h,velocity*.42)/.075,0,1);
}
function savePhoto(){
  renderSceneFrame({includeWater:false,sdr:true});
  const a=document.createElement('a');a.download=`玻璃海-${new Date().toISOString().slice(0,10)}.png`;a.href=renderer.domElement.toDataURL('image/png');a.click();ui.notify('已保存没有界面的海岛照片');
}

function inspectTarget(source){
  const previous=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4());
  const target=new THREE.WebGLRenderTarget(source.width,source.height,{type:THREE.FloatType,depthBuffer:false});
  const inspectScene=new THREE.Scene(),material=new THREE.ShaderMaterial({uniforms:{uInput:{value:source.texture}},depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:'uniform sampler2D uInput;varying vec2 vUv;void main(){gl_FragColor=texture2D(uInput,vUv);}'});
  const geometry=new THREE.PlaneGeometry(2,2);inspectScene.add(new THREE.Mesh(geometry,material));
  const data=new Float32Array(source.width*source.height*4);
  try{
    renderer.setRenderTarget(target);renderer.render(inspectScene,new THREE.OrthographicCamera(-1,1,1,-1,0,1));
    renderer.readRenderTargetPixels(target,0,0,source.width,source.height,data);
    let invalid=0,negative=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],examples=[];
    for(let i=0;i<data.length;i+=4){let bad=false;for(let c=0;c<3;c++){const v=data[i+c];if(!Number.isFinite(v))bad=true;else{min[c]=Math.min(min[c],v);max[c]=Math.max(max[c],v);if(v<0)negative++;}}if(bad){invalid++;if(examples.length<5)examples.push([i/4%source.width,Math.floor(i/4/source.width)]);}}
    return {width:source.width,height:source.height,pixels:source.width*source.height,nonFinitePixels:invalid,negativeChannels:negative,minimum:min,maximum:max,examples};
  }finally{renderer.setRenderTarget(previous);renderer.setViewport(viewport);target.dispose();material.dispose();geometry.dispose();}
}

init().catch(error=>{
  console.error(error);
  ui.setStats({error:`海岛暂时无法载入。请刷新页面，或使用支持 WebGL 2 的浏览器。${error.message||''}`});
});
