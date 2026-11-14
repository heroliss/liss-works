import {deriveWeather} from './weather.js';
import {DEFAULT_QUALITY, QUALITY_PRESETS} from './quality-presets.js';
import {FIREWORK_TYPES} from './fireworks-physics.js';
import {initQuickExperience} from './ui-quick-experience.js';
const viewLabels = {shore:'白沙岸边',lagoon:'玻璃浅海',aerial:'高空俯瞰',sandbar:'沙舌尽头',palm:'椰林树下',reef:'珊瑚浅滩',waterline:'贴近水面',island:'离岛全景',sun:'朝向太阳',moon:'朝向月亮',stars:'星河视角',fireworks:'海上远景','fireworks-close':'岛边近景','fireworks-beach':'沙滩仰望','fireworks-palms':'椰林剪影','fireworks-aerial':'高空俯瞰烟花'};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Explicit civil offset; never parse datetime-local in the browser's own zone.
export function civilToUTC(value, offsetMinutes = 0) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value));
  if (!match || !Number.isFinite(offsetMinutes)) return null;
  const parts = match.slice(1).map(n => Number(n || 0));
  const [year, month, day, hour, minute, second] = parts;
  const date = new Date(0);date.setUTCFullYear(year, month - 1, day);date.setUTCHours(hour, minute, second, 0);
  if ([date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate(),date.getUTCHours(),date.getUTCMinutes(),date.getUTCSeconds()].some((n,i)=>n!==parts[i])) return null;
  return date.getTime() - offsetMinutes * 60000;
}
export function utcToCivil(utcMs, offsetMinutes = 0) {
  if (!Number.isFinite(utcMs) || !Number.isFinite(offsetMinutes)) return '';
  const date = new Date(utcMs + offsetMinutes * 60000);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0,19) : '';
}
export function formatUTCOffset(minutes) {
  const absolute = Math.abs(Math.round(minutes));
  return `UTC${minutes < 0 ? '−' : '+'}${String(Math.floor(absolute/60)).padStart(2,'0')}:${String(absolute%60).padStart(2,'0')}`;
}

function formatDisplayTransformStatus(info,requested,hdrEnabled=false){
  const reasons={
    'awaiting-render':'等待绘制确认','not-presented':'等待绘制确认',
    'selected-legacy':'已选择原有模式','preparing-exact-target':'正在准备对应亮度资源',
    'exact-target-ready':'对应亮度资源已就绪','exact-target-rendered':'已绘制确认',
    'unsupported-target':'该峰值暂不支持，已回退','validation-failed':'校验失败，已回退',
    'sdr-target-validation-failed':'SDR 资源校验失败，已回退','preparation-failed':'资源准备失败，已回退',
    'output-render-failed':'绘制失败，已回退','calibration-target-changed':'校准值已变化，暂用原有模式',
    'browser-white-unavailable':'未取得系统参考白，已回退','pbo-legacy-only':'当前显示桥仅支持原有模式',
    'bridge-fallback':'当前显示桥使用原有模式','sdr-target-initialization-failed':'输出准备失败，已回退',
    'render-declined':'已使用原有模式','non-boolean-render-result':'输出未确认，已回退',
    'adapter-error':'输出异常，已回退','disabled':'已关闭','hdr-disabled':'HDR 已关闭',
    'disposed':'显示模块已关闭','stale-request':'请求已更新','loading':'资源准备中',
    'ready':'资源已就绪','rendered':'已绘制确认','not-requested':'尚未请求',
  };
  const reasonText=value=>value?(Object.hasOwn(reasons,value)?reasons[value]:'详见诊断'):'';
  const data=info&&info.requested===requested?info:{},preparation=data.preparation;
  const status=typeof preparation==='string'?preparation:preparation?.status||(data.pending?'pending':'idle');
  const reason=(typeof preparation==='object'?preparation?.reason:null)||data.reason;
  const target=typeof preparation==='object'&&Number.isFinite(preparation?.peakNits)?`（目标 ${preparation.peakNits} nit）`:'';
  const lines=[`请求：${requested==='aces2'?'ACES 2（实验）':'原有色彩呈现'}`];
  if(status==='pending')lines.push(`HDR 目标资源准备中${target}，尚未确认新目标生效${reason&&reason!=='preparing-exact-target'?'：'+reasonText(reason):''}`);
  else if(status==='unsupported')lines.push(`HDR 目标暂不支持${target}${reason?'：'+reasonText(reason):''}`);
  else if(status==='failed')lines.push(`HDR 目标准备失败${target}：${reasonText(reason)||'校验失败，已回退'}`);
  for(const key of ['sdr','hdr']){
    const value=data[key],mode=typeof value==='string'?value:value?.effective;
    const peak=value?.peakNits,why=value?.reason;
    let result=mode==='aces2'?`ACES 2${Number.isFinite(peak)?` · 精确目标 ${peak} nit`:' · 目标待确认'}`:mode==='legacy'?`原有色彩呈现${Number.isFinite(peak)?` · 目标 ${peak} nit`:''}`:'等待绘制确认';
    const explanation=reasonText(why);
    if(explanation&&!(mode==='none'&&explanation==='等待绘制确认'))result+=`（${explanation}）`;
    lines.push(`${key==='hdr'&&!hdrEnabled?'HDR：当前关闭；最近一帧':key.toUpperCase()+' 最近一帧'}：${result}`);
  }
  if(requested==='aces2')lines.push('含数值精度变体；不是官方认证。');
  return lines.join('\n');
}

export function initUI(callbacks = {}) {
  const $ = (selector) => document.querySelector(selector);
  const state = {
    sun: { azimuth: 100, elevation: 48, intensity: 1 },
    view: 'shore', quality: DEFAULT_QUALITY, paused: false, sound: true, hidden: false,
    director:{mode:'off',periodSeconds:240},
    qualityState:{requested:DEFAULT_QUALITY,effective:null,custom:false,limits:[]},
    time:{utcMs:Date.UTC(2026,9,26,4),rate:1,running:true,mode:'astronomical',timeZoneOffsetMinutes:480,observer:{latitude:4.478,longitude:118.61,height:0},preset:null},
    lamps:{mode:'night',linked:false,selected:0,lamps:Array.from({length:3},()=>({enabled:true,brightness:.65,color:'#ffdfab'}))},
    flashlight:{enabled:false,brightness:1},
    fireworks:{type:'peony',autoLaunch:false,autoDirection:true,azimuth:110,elevation:78,autoFrame:false,smokeQuality:'light',persistentSmoke:false,cloudIllumination:true,resolvedSmokeLighting:false,intensityScale:1,intervalSeconds:7.5,randomIntervals:true,intervalMinSeconds:1,intervalMaxSeconds:5,randomLaunchTilt:true,automaticTiltMinDegrees:-40,automaticTiltMaxDegrees:40,launchSpreadDegrees:3,burstTiltDegrees:12,burstRollDegrees:8},
    wind: 1.8, current: .16,
    sea:{swellHeight:.16,windSea:1,clarity:.90},
    graphics:{indirect:'low',shadows:'recommended',targetFps:60,hdr:false,hdrHeadroom:4,hdrMode:'auto',displayTransform:'legacy',displayName:'auto',systemCalibration:true,peakNits:1000,paperWhiteNits:203,waveResolution:512},
    displayTransformState:{requested:'legacy',preparation:{status:'idle'},sdr:null,hdr:null},
    weather:{humidity:.68,temperature:29,cloudBase:'auto',thickness:950,coverage:.35,shear:1.1},
    air:{enabled:true,aerosolScale:8,shadows:true},
    lens: { focal:28, aperture:8, exposure:0, dof:false, vignette:true, antialias:'smaa', automatic:false,temporal:true,glintAA:true,firelightAA:true,opticalBloom:true,opticalBloomStrength:.75,opticalFlare:false,focusMode:'target',focusDistance:60,manualExposureEV:0 },
    night:{date:'2026-10-26T22:00',autoExposure:true},
    panelOpen: false, viewsOpen: false, timePanelOpen: !window.matchMedia('(max-width:600px)').matches, fireworksOpen: false, activeCategory: 'camera', statsVisible: false,
    stats: {fps:null,gpuMs:null,paused:false,status:'ready',renderScale:1},
  };
  let quickExperience=null;
  let fireworkSubmitSequence=0;
  let toastTimer;
  let ready = false;

  const notify = (message, duration = 2800) => {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
  };
  const invoke = async (key, ...args) => {
    if(['onTimeChange','onLocationChange','onSunChange','onReset'].includes(key)||(key==='onNightChange'&&args[0]?.date)){
      state.time.preset=null;quickExperience?.cancelTimePreset();
    }
    try { return await callbacks[key]?.(...args); }
    catch (error) { console.error(`Atoll UI ${key}:`, error); notify('操作暂时没有完成，请再试一次'); }
  };

  function setInput(id, value) {
    const input=$('#'+id);
    if(document.activeElement!==input) input.value=String(value);
  }
  function fillRange(id) {
    const slider=$('#'+id), fraction=(Number(slider.value)-Number(slider.min))/(Number(slider.max)-Number(slider.min));
    slider.style.setProperty('--fill',`${clamp(fraction,0,1)*100}%`);
  }
  function markQualityCustom() {
    state.qualityState.custom=true;updateQualityUI();
  }
  function updateQualityUI() {
    const info=state.qualityState, custom=$('#quality option[value="custom"]');
    custom.hidden=!info.custom;$('#quality').value=info.custom?'custom':info.requested;
    const profile=QUALITY_PRESETS[info.requested]||QUALITY_PRESETS.medium;
    const values=info.effective, details=[];
    if(values){
      if(Number.isFinite(values.msaaSamples))details.push(`抗锯齿 ${values.msaaSamples}×`);
      if(Number.isFinite(values.shadowSize))details.push(`阴影 ${values.shadowSize}`);
      if(Number.isFinite(values.waveResolution))details.push(`海面 ${values.waveResolution}`);
    }
    const limits=Array.isArray(info.limits)?info.limits:[];
    $('#quality-status').textContent=(info.custom?'自定义设置':`${profile.label}档`)+(details.length?` · ${details.join(' · ')}`:`。${profile.description}`)+(limits.length?`。设备调整：${limits.join('；')}`:'');
  }
  function updateTimeUI() {
    const clock=state.time, civil=utcToCivil(clock.utcMs,clock.timeZoneOffsetMinutes);
    if(civil){
      setInput('night-date',civil);setInput('time-of-day',Number(civil.slice(11,13))*60+Number(civil.slice(14,16)));
      $('#time-output').textContent=civil.slice(11,16);
      $('#utc-readout').textContent=`UTC ${new Date(clock.utcMs).toISOString().slice(0,19).replace('T',' ')} · ${formatUTCOffset(clock.timeZoneOffsetMinutes)}`;
      state.night.date=civil;
    }
    $('#time-mode').value=clock.mode;$('#time-running').checked=clock.running;
    const rate=$('#time-rate');
    if(![...rate.options].some(option=>Number(option.value)===clock.rate))rate.add(new Option(`${clock.rate}×`,String(clock.rate)));
    rate.value=String(clock.rate);fillRange('time-of-day');
    for(const key of ['latitude','longitude','height'])setInput(`observer-${key}`,clock.observer[key]);
    setInput('time-zone',clock.timeZoneOffsetMinutes/60);
    $('#artistic-sun-controls').hidden=clock.mode!=='artistic';
    document.querySelectorAll('[data-time]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.time===clock.preset)));
    quickExperience?.syncTime();
  }
  function submitCivil(value) {
    const utcMs=civilToUTC(value,state.time.timeZoneOffsetMinutes);
    if(utcMs===null){notify('请输入有效日期与时间');return;}
    state.time.utcMs=utcMs;state.time.preset=null;updateTimeUI();
    if(typeof callbacks.onTimeChange==='function')invoke('onTimeChange',{utcMs});
    else invoke('onNightChange',{...state.night,date:value});
  }
  function updateLampUI() {
    const group=state.lamps,lamp=group.lamps[group.selected];
    $('#lamp-mode').value=group.mode;$('#lamp-select').value=group.selected;
    $('#lamp-linked').checked=group.linked;$('#lamp-enabled').checked=lamp.enabled;
    $('#lamp-enabled').parentElement.lastChild.textContent=group.linked?'三盏灯启用':'这盏灯启用';
    setInput('lamp-brightness',lamp.brightness);$('#lamp-brightness-output').textContent=`${Math.round(lamp.brightness*100)}%`;
    $('#lamp-color').value=lamp.color;fillRange('lamp-brightness');
  }
  function changeLamp(patch) {
    const indices=state.lamps.linked?[0,1,2]:[state.lamps.selected];
    for(const index of indices){Object.assign(state.lamps.lamps[index],patch);invoke('onLampChange',{index,...state.lamps.lamps[index]});}
    updateLampUI();
  }
  function updateFlashlightUI() {
    $('#flashlight-enabled').checked=state.flashlight.enabled;setInput('flashlight-brightness',state.flashlight.brightness);
    $('#flashlight-output').textContent=`${Math.round(state.flashlight.brightness*100)}%`;fillRange('flashlight-brightness');
  }
  let lastNonZeroFireworkIntensity=1;
  function updateFireworksUI() {
    const f=state.fireworks;$('#firework-type').value=f.type;
    const profile=f.effectProfile||'legacy';$('#firework-profile').value=profile;
    $('#firework-profile-hint').textContent=profile==='three-heart-radiant120-v1'?'金色长尾，蓝外层、绿中层、红内芯分别燃尽。120 米为参考展开，低角度碰水会裁切花形。仅限单次燃放。':profile==='three-heart-scale120-v1'?'蓝外层、绿中层、红内芯。外层在爆开后2.5秒参考展开120米；这是创作标定，低角度碰水会裁切花形。仅限单次燃放。':profile==='three-heart-v1'?'蓝外层、绿中层、红内芯，分别燃尽。仅限单次燃放。':profile==='two-colour-v1'?'由红转绿，金色尾迹独立燃尽。仅限单次燃放。':`共${FIREWORK_TYPES.length}种烟花；随机燃放包含常用样式与大型编排。`;
    const type=FIREWORK_TYPES.find(t=>t.id===f.type)||FIREWORK_TYPES[0];
    const complex=profile==='legacy'&&type.collection==='large-choreographed',description=$('#firework-complex-description');
    description.hidden=!complex;description.textContent=complex?`编排约${type.burn}秒。${type.description}`:'';
    $('#firework-height').textContent=complex?`${type.ground?'近地编排参考顶点':'编排参考高度'}约${type.height}米；这是创作参考，仰角会改变实际轨迹。`:type.ground?`近地上升型，参考顶点约${type.height}米；仰角会改变实际高度。`:`标准仰角约${type.height}米爆开；低仰角会降低实际高度。${type.pattern==='smiley'?'笑脸是立体场景中的平面图案，侧看会压扁。':''}`;
    $('#firework-auto').checked=f.autoLaunch;$('#firework-direction').checked=f.autoDirection;$('#firework-frame').checked=f.autoFrame;
    $('#persistent-smoke').checked=f.persistentSmoke;$('#firework-cloud-light').checked=f.cloudIllumination;
    $('#smoke-quality').value=f.smokeQuality||'light';
    $('#smoke-quality-status').textContent=(f.smokeQuality==='full'?'长期体积烟随风移动、自然扩散并长期累积，支持逐源穿烟遮光；计算开销高，密集连续燃放可能明显变慢。':f.smokeQuality==='off'?'已关闭烟气；保留烟花火星、尾迹与声音。':'轻量短烟使用简化烟团，受整体烟花光源照亮并较快消散；不计算逐源穿烟遮光。')+'切换烟气模式会清空已有烟气。';
    $('#smoke-resolved-light').checked=f.resolvedSmokeLighting;
    const lightStatus=f.lightFieldStatus,lightHint=!f.resolvedSmokeLighting?'让烟气跟随附近火星的颜色与位置受光。':!f.persistentSmoke?'开启体积烟尘后生效。':lightStatus?.awaitingSmoke?'发射烟花后观察烟气受光。':lightStatus?.supported===false?'当前场景超出细致受光预算，使用整体光源近似；可减少连续发射。':'按实际火星的分布照亮烟气。';
    if($('#smoke-light-status').textContent!==lightHint)$('#smoke-light-status').textContent=lightHint;
    const gpu=f.gpuTransmission;
    if(gpu){
      $('#smoke-gpu').checked=gpu.requested;
      const text=f.smokeQuality!=='full'?(f.smokeQuality==='off'?'当前已关闭烟气。':'当前轻量短烟不计算逐源穿烟遮光；此选项仅用于长期体积烟。'):!gpu.requested?'使用 CPU 计算烟尘遮光。':gpu.available===false?'此设备未通过兼容检查，已使用 CPU。':gpu.reason==='not-prepared'||gpu.idle?'已就绪，发射烟花后生效。':gpu.effective===false?'当前工作量使用 CPU 兼容路径。':'由 GPU 计算火星穿过烟尘后的亮度；保留原有烟量。';
      if($('#smoke-gpu-status').textContent!==text)$('#smoke-gpu-status').textContent=text;
    }
    if(f.intensityScale>0)lastNonZeroFireworkIntensity=f.intensityScale;
    setInput('firework-brightness',f.intensityScale>0?f.intensityScale:lastNonZeroFireworkIntensity);fillRange('firework-brightness');$('#firework-brightness').disabled=f.intensityScale===0;$('#firework-blackout').checked=f.intensityScale===0;$('#firework-brightness-output').textContent=f.intensityScale===0?'0× · 调试':`${Number(f.intensityScale.toFixed(2))}×`;
    for(const [id,key]of [['interval','intervalSeconds'],['spread','launchSpreadDegrees'],['tilt','burstTiltDegrees'],['roll','burstRollDegrees']]){setInput('firework-'+id,f[key]);fillRange('firework-'+id);$('#firework-'+id+'-output').textContent=id==='interval'?`${Number(f[key].toFixed(2))} 秒`:`±${f[key]}°`;}
    $('#firework-random-intervals').checked=!!f.randomIntervals;
    $('#firework-random-launch-tilt').checked=!!f.randomLaunchTilt;
    $('#firework-interval').disabled=!!f.randomIntervals;
    for(const [id,key,enabled]of [['interval-min','intervalMinSeconds',f.randomIntervals],['interval-max','intervalMaxSeconds',f.randomIntervals],['auto-tilt-min','automaticTiltMinDegrees',f.randomLaunchTilt],['auto-tilt-max','automaticTiltMaxDegrees',f.randomLaunchTilt]]){
      setInput('firework-'+id,f[key]);$('#firework-'+id).disabled=!enabled||typeof callbacks.onFireworksChange!=='function';
    }
    const capacity=Number.isInteger(f.maxActive)&&f.maxActive>0?`最多${f.maxActive}发同时在空中；`:'并发上限以实际配置为准；';
    $('#firework-capacity-hint').textContent=capacity+'满额时跳过新发射，不积压排队。手动发射保留细微方向随机；爆开图案随机始终生效。';
    for(const key of ['azimuth','elevation']){
      const id='firework-'+key;setInput(id,f[key]);$('#'+id+'-output').textContent=`${Math.round(f[key])}°`;fillRange(id);
      $('#'+id).disabled=(key==='azimuth'&&f.autoDirection)||typeof callbacks.onFireworksChange!=='function';
    }
    quickExperience?.syncFireworks();
  }
  async function submitFireworks(patch) {
    if(patch.smokeQuality!==undefined)patch={...patch,persistentSmoke:patch.smokeQuality==='full'};
    else if(patch.persistentSmoke!==undefined)patch={...patch,smokeQuality:patch.persistentSmoke?'full':'off'};
    if(patch.type!==undefined&&patch.type!=='chrysanthemum'||patch.autoLaunch)patch={...patch,effectProfile:'legacy'};
    if(patch.effectProfile&&patch.effectProfile!=='legacy')patch={...patch,type:'chrysanthemum',autoLaunch:false};
    const request=++fireworkSubmitSequence,previous=Object.fromEntries(Object.keys(patch).map(key=>[key,{present:Object.hasOwn(state.fireworks,key),value:state.fireworks[key]}]));
    Object.assign(state.fireworks,patch);updateFireworksUI();
    const {type,autoLaunch,autoDirection,azimuth,elevation,autoFrame,smokeQuality,persistentSmoke,cloudIllumination,resolvedSmokeLighting,intensityScale,intervalSeconds,randomIntervals,intervalMinSeconds,intervalMaxSeconds,randomLaunchTilt,automaticTiltMinDegrees,automaticTiltMaxDegrees,launchSpreadDegrees,burstTiltDegrees,burstRollDegrees,effectProfile='legacy'}=state.fireworks;
    try{
      if(typeof callbacks.onFireworksChange!=='function')throw new Error('Firework settings callback is unavailable');
      const result=await callbacks.onFireworksChange({type,autoLaunch,autoDirection,azimuth,elevation,autoFrame,smokeQuality,persistentSmoke,cloudIllumination,resolvedSmokeLighting,intensityScale,intervalSeconds,randomIntervals,intervalMinSeconds,intervalMaxSeconds,randomLaunchTilt,automaticTiltMinDegrees,automaticTiltMaxDegrees,launchSpreadDegrees,burstTiltDegrees,burstRollDegrees,effectProfile});
      if(result?.accepted===false)throw new Error(result.reason||'Firework settings declined');
      return result;
    }catch(error){
      console.error('Atoll firework settings:',error);
      if(request===fireworkSubmitSequence){
        for(const [key,old]of Object.entries(previous))if(old.present)state.fireworks[key]=old.value;else delete state.fireworks[key];
        updateFireworksUI();
        // A rejected numeric edit must also restore the focused input; normal
        // renderer sync deliberately leaves an actively edited input untouched.
        for(const [id,key]of [['firework-interval-min','intervalMinSeconds'],['firework-interval-max','intervalMaxSeconds'],['firework-auto-tilt-min','automaticTiltMinDegrees'],['firework-auto-tilt-max','automaticTiltMaxDegrees']])if(Object.hasOwn(previous,key))$('#'+id).value=String(state.fireworks[key]);
        const message=intervalMinSeconds>intervalMaxSeconds?'最短间隔不能大于最长间隔，设置未更改。':automaticTiltMinDegrees>automaticTiltMaxDegrees?'最小倾角不能大于最大倾角，设置未更改。':'设置未生效，请检查数值范围后重试。';
        notify(message);
      }
      return {accepted:false,reason:String(error.message||error)};
    }
  }
  function setupNewControls() {
    for(const input of document.querySelectorAll('[data-callback]')){
      input.disabled=typeof callbacks[input.dataset.callback]!=='function';
      if(input.disabled)input.title='此功能尚未准备';
    }
    if(typeof callbacks.onTimeChange!=='function')state.time.mode='artistic';
    $('#view-preset').disabled=typeof callbacks.onView!=='function';
    $('#view-preset').addEventListener('change',event=>{setView(event.target.value);invoke('onView',state.view);});
    $('#director-mode').addEventListener('change',event=>{state.director.mode=event.target.value;invoke('onDirectorChange',{...state.director});});
    $('#director-period').addEventListener('change',event=>{state.director.periodSeconds=Number(event.target.value);invoke('onDirectorChange',{...state.director});});
    for(const button of document.querySelectorAll('[data-weather]')){
      button.disabled=typeof callbacks.onWeatherPreset!=='function';
      button.addEventListener('click',()=>invoke('onWeatherPreset',button.dataset.weather));
    }
    for(const button of document.querySelectorAll('[data-time]')){
      button.disabled=typeof callbacks.onTimePreset!=='function'&&(typeof callbacks.onNightPreset!=='function'||button.dataset.time==='dawn');
      button.addEventListener('click',async()=>{
        const previous=state.time.preset;
        const result=await invoke(typeof callbacks.onTimePreset==='function'?'onTimePreset':'onNightPreset',button.dataset.time);
        state.time.preset=result===false||result===undefined?previous:button.dataset.time;updateTimeUI();
      });
    }
    $('#time-mode').addEventListener('change',event=>{state.time.mode=event.target.value;updateTimeUI();invoke('onTimeChange',{mode:state.time.mode});});
    $('#time-rate').addEventListener('change',event=>{state.time.rate=Number(event.target.value);invoke('onTimeChange',{rate:state.time.rate});});
    $('#time-running').addEventListener('change',event=>{state.time.running=event.target.checked;invoke('onTimeChange',{running:state.time.running});});
    $('#time-of-day').addEventListener('input',event=>{
      const date=utcToCivil(state.time.utcMs,state.time.timeZoneOffsetMinutes).slice(0,10), minutes=Number(event.target.value);
      submitCivil(`${date}T${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}:00`);
    });
    for(const id of ['observer-latitude','observer-longitude','observer-height','time-zone'])$('#'+id).addEventListener('change',event=>{
      if(!event.target.value||!event.target.checkValidity()){event.target.reportValidity();return;}
      for(const key of ['latitude','longitude','height'])state.time.observer[key]=Number($('#observer-'+key).value);
      state.time.timeZoneOffsetMinutes=Math.round(Number($('#time-zone').value)*60);updateTimeUI();
      invoke('onLocationChange',{...state.time.observer,timeZoneOffsetMinutes:state.time.timeZoneOffsetMinutes});
    });
    $('#lamp-select').addEventListener('change',event=>{state.lamps.selected=Number(event.target.value);updateLampUI();});
    $('#lamp-linked').addEventListener('change',event=>{state.lamps.linked=event.target.checked;updateLampUI();});
    $('#lamp-mode').addEventListener('change',event=>{state.lamps.mode=event.target.value;invoke('onLampMode',state.lamps.mode);});
    $('#lamp-enabled').addEventListener('change',event=>changeLamp({enabled:event.target.checked}));
    $('#lamp-brightness').addEventListener('input',event=>changeLamp({brightness:Number(event.target.value)}));
    $('#lamp-color').addEventListener('input',event=>changeLamp({color:event.target.value}));
    for(const [id,key]of [['flashlight-enabled','enabled'],['flashlight-brightness','brightness']])$('#'+id).addEventListener(key==='enabled'?'change':'input',event=>{
      state.flashlight[key]=key==='enabled'?event.target.checked:Number(event.target.value);updateFlashlightUI();invoke('onFlashlightChange',{...state.flashlight});
    });
    $('#firework-type').addEventListener('change',event=>submitFireworks({type:event.target.value}));
    $('#firework-profile').addEventListener('change',event=>submitFireworks({effectProfile:event.target.value}));
    $('#smoke-quality').addEventListener('change',event=>submitFireworks({smokeQuality:event.target.value}));
    for(const [id,key]of [['firework-random-intervals','randomIntervals'],['firework-random-launch-tilt','randomLaunchTilt']])$('#'+id).addEventListener('change',event=>submitFireworks({[key]:event.target.checked}));
    for(const [ids,keys]of [[['firework-interval-min','firework-interval-max'],['intervalMinSeconds','intervalMaxSeconds']],[['firework-auto-tilt-min','firework-auto-tilt-max'],['automaticTiltMinDegrees','automaticTiltMaxDegrees']]])for(const id of ids)$('#'+id).addEventListener('change',()=>submitFireworks(Object.fromEntries(keys.map((key,index)=>[key,$('#'+ids[index]).value===''?NaN:Number($('#'+ids[index]).value)]))));
    for(const [id,key]of [['firework-auto','autoLaunch'],['firework-direction','autoDirection'],['firework-frame','autoFrame'],['persistent-smoke','persistentSmoke'],['firework-cloud-light','cloudIllumination'],['smoke-resolved-light','resolvedSmokeLighting']])$('#'+id).addEventListener('change',event=>submitFireworks({[key]:event.target.checked}));
    $('#clear-smoke').addEventListener('click',()=>invoke('onClearSmoke'));
    $('#firework-air-glow').addEventListener('input',event=>{const value=Number(event.target.value);$('#firework-air-glow-output').textContent=`${value}%`;fillRange('firework-air-glow');invoke('onFireworkAirGlow',value/100);});fillRange('firework-air-glow');
    $('#smoke-gpu').addEventListener('change',async event=>{const result=await invoke('onSmokeGPUChange',event.target.checked);if(result)state.fireworks.gpuTransmission={requested:result.requested,available:result.support?.passed??true,effective:result.enabled};updateFireworksUI();});
    $('#firework-brightness').addEventListener('input',event=>submitFireworks({intensityScale:Number(event.target.value)}));
    $('#firework-blackout').addEventListener('change',event=>submitFireworks({intensityScale:event.target.checked?0:lastNonZeroFireworkIntensity}));
    for(const [id,key]of [['interval','intervalSeconds'],['spread','launchSpreadDegrees'],['tilt','burstTiltDegrees'],['roll','burstRollDegrees']])$('#firework-'+id).addEventListener('input',event=>submitFireworks({[key]:Number(event.target.value)}));
    for(const key of ['azimuth','elevation'])$('#firework-'+key).addEventListener('input',event=>submitFireworks({[key]:Number(event.target.value)}));
    for(const [id,callback]of [['launch-firework','onLaunchFirework'],['launch-random-firework','onRandomFirework'],['stop-fireworks','onStopFireworks']])$('#'+id).addEventListener('click',async()=>{
      const button=$('#'+id);button.disabled=true;await invoke(callback);button.disabled=typeof callbacks[callback]!=='function';
    });
  }

  const settingsCategories=['camera','sea','weather','time','lighting','lamps','fireworks','navigation'];
  const compactLayout=()=>window.matchMedia('(max-width: 600px)').matches;
  function setPanel(open) {
    open=!!open;
    if(open){setViews(false);setFireworksPanel(false);}
    if(!open&&$('#panel-content').contains(document.activeElement))$('#panel-toggle').focus({preventScroll:true});
    state.panelOpen = open;
    $('#panel-toggle').setAttribute('aria-expanded', String(open));
    $('#panel-content').hidden = !open;
    $('.control-panel').classList.toggle('collapsed', !open);
    document.body.classList.toggle('panel-expanded', open);
  }
  function setViews(open) {
    open=!!open;
    if(open){setPanel(false);setFireworksPanel(false);}
    if(!open&&$('#views-content').contains(document.activeElement))$('#views-toggle').focus({preventScroll:true});
    state.viewsOpen=open;
    $('#views-toggle').setAttribute('aria-expanded',String(open));
    $('#views-content').hidden=!open;
    $('#view-drawer').classList.toggle('collapsed',!open);
    document.body.classList.toggle('views-expanded',open);
  }
  const compactLowQuery=window.matchMedia('(max-width: 600px) and (max-height: 600px)');
  const compactLowLayout=()=>compactLowQuery.matches;
  function setTimePanel(open){
    // The four time presets are a permanent top-centre control; the former
    // collapsible drawer is kept only as a compatible no-op entry point.
    state.timePanelOpen=true;
    $('#quick-time-content').hidden=false;$('#time-panel').classList.remove('collapsed');
    document.body.classList.remove('time-panel-collapsed');
  }
  function setFireworksPanel(open){
    open=!!open;
    if(open){setPanel(false);setViews(false);}
    if(!open&&$('#fireworks-content').contains(document.activeElement))$('#fireworks-toggle').focus({preventScroll:true});
    state.fireworksOpen=open;
    $('#fireworks-toggle').setAttribute('aria-expanded',String(open));
    $('#fireworks-content').hidden=!open;$('#experience-dock').classList.toggle('collapsed',!open);
    document.body.classList.toggle('fireworks-collapsed',!open);
  }
  function setCategory(category,{focus=false}={}){
    if(!settingsCategories.includes(category))return;
    state.activeCategory=category;
    for(const key of settingsCategories){
      const selected=key===category,tab=$('#tab-'+key);
      tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
      $('#settings-'+key).hidden=!selected;
    }
    $('.settings-scroll').scrollTop=0;
    if(focus)$('#tab-'+category).focus({preventScroll:true});
  }
  function updatePerformanceUI(){
    const info=state.stats,paused=info.paused||state.paused;
    $('#performance-hud').hidden=!state.statsVisible;
    $('#stats-toggle').setAttribute('aria-pressed',String(state.statsVisible));
    $('#stats-toggle').setAttribute('aria-label',state.statsVisible?'隐藏帧率':'显示帧率');
    $('#stats-toggle-label').textContent=state.statsVisible?'隐藏帧率':'显示帧率';
    $('#fps-value').textContent=paused||info.status==='interrupted'||!Number.isFinite(info.fps)?'—':String(Math.max(0,Math.round(info.fps)));
    const extra=[];
    if(info.status==='interrupted')extra.push('画面已中断');
    else if(paused)extra.push('已暂停');
    else {
      if(Number.isFinite(info.gpuMs)&&info.gpuMs>=0)extra.push(`GPU ${info.gpuMs.toFixed(1)} ms`);
      if(Number.isFinite(info.renderScale)&&info.renderScale>0&&info.renderScale<.999)extra.push(`内部像素 ${Math.round(info.renderScale*100)}%`);
      if(!extra.length)extra.push(Number.isFinite(info.fps)?'实时渲染':'正在测量');
    }
    $('#performance-detail').textContent=extra.join(' · ');
  }
  function setHidden(hidden) {
    state.hidden = hidden;
    document.body.classList.toggle('ui-hidden', hidden);
    for(const surface of document.querySelectorAll('.chrome'))surface.inert=hidden;
    $('#restore-ui').hidden = !hidden;
    if (hidden) $('#restore-ui').focus({ preventScroll: true });
    else $('#hide-ui').focus({ preventScroll: true });
  }
  function setView(name) {
    if (!viewLabels[name]) return;
    state.view = name;
    document.querySelectorAll('[data-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
    $('#view-label').textContent = viewLabels[name];
    const thumbnail=document.querySelector(`.view-card[data-view="${name}"] img`),dockThumb=$('#dock-view-thumb');
    if(dockThumb){dockThumb.hidden=!thumbnail||thumbnail.hidden;if(thumbnail&&!thumbnail.hidden)dockThumb.src=thumbnail.src;}
    $('#view-preset').value = name;
  }
  function updateSunUI() {
    ['azimuth', 'elevation', 'intensity'].forEach((key) => {
      const slider = $(`#sun-${key}`);
      slider.value = state.sun[key];
      const progress = ((Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) * 100;
      slider.style.setProperty('--fill', `${progress}%`);
      $(`#${key}-output`).textContent = key === 'intensity' ? `${Math.round(state.sun[key] * 100)}%` : `${Math.round(state.sun[key])}°`;
    });
  }
  function togglePause() {
    state.paused = !state.paused;
    $('#pause').setAttribute('aria-pressed', String(state.paused));
    $('#pause').setAttribute('aria-label', state.paused ? '继续场景' : '暂停场景');
    state.stats.paused=state.paused;updatePerformanceUI();
    invoke('onPause', state.paused);
  }
  function updateWaterUI() {
    ['wind', 'current'].forEach((key) => {
      const slider = $(`#${key}-speed`);
      slider.value = state[key];
      const progress = ((Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) * 100;
      slider.style.setProperty('--fill', `${progress}%`);
      const display = key === 'wind' ? state[key].toFixed(1) : String(Math.round(state[key] * 100));
      $(`#${key}-output`).textContent = `${display} ${key === 'wind' ? 'm/s' : 'cm/s'}`;
      slider.setAttribute('aria-valuetext', `${display} ${key === 'wind' ? '米每秒' : '厘米每秒'}`);
    });
  }
  function reset() {
    state.quality=DEFAULT_QUALITY;state.qualityState={requested:DEFAULT_QUALITY,effective:null,custom:false,limits:[]};updateQualityUI();
    state.sun = { azimuth: 100, elevation: 48, intensity: 1 };
    state.sea={swellHeight:.16,windSea:1,clarity:.90};
    state.graphics={indirect:'low',shadows:'recommended',targetFps:60,hdr:false,hdrHeadroom:4,hdrMode:'auto',displayTransform:'legacy',displayName:'auto',systemCalibration:true,peakNits:1000,paperWhiteNits:203,waveResolution:512};
    state.displayTransformState={requested:'legacy',preparation:{status:'idle'},sdr:null,hdr:null};
    state.wind = 1.8;
    state.current = .16;
    state.weather={humidity:.68,temperature:29,cloudBase:'auto',thickness:950,coverage:.35,shear:1.1};
    state.air={enabled:true,aerosolScale:8,shadows:true};
    state.lens={focal:28,aperture:8,exposure:0,manualExposureEV:0,dof:false,vignette:true,antialias:'smaa',automatic:false,temporal:true,glintAA:true,firelightAA:true,opticalBloom:true,opticalBloomStrength:.75,opticalFlare:false,focusMode:'target',focusDistance:60};
    updateSunUI();
    updateWaterUI();
    updateLensUI();
    updateWeatherUI();
    updateAirUI();
    setView('shore');
    invoke('onSunChange', { ...state.sun });
    invoke('onWind', state.wind);
    invoke('onCurrent', state.current);
    invoke('onWeatherChange',{...state.weather});
    invoke('onAirChange',{...state.air});
    invoke('onLensChange', {...state.lens});
    updateGraphicsUI();updateSeaUI();
    invoke('onSeaChange',{...state.sea});invoke('onGraphicsChange',{...state.graphics});
    if (typeof callbacks.onQualityPreset==='function') invoke('onQualityPreset',DEFAULT_QUALITY);
    invoke('onReset');
    notify('回到初见时的晴天');
  }

  $('#panel-toggle').addEventListener('click', () => setPanel(!state.panelOpen));
  $('#views-toggle').addEventListener('click',()=>setViews(!state.viewsOpen));
  $('#fireworks-toggle').addEventListener('click',()=>setFireworksPanel(!state.fireworksOpen));
  $('#stats-toggle').addEventListener('click',()=>{state.statsVisible=!state.statsVisible;updatePerformanceUI();});
  for(const tab of document.querySelectorAll('[data-category]'))tab.addEventListener('click',()=>setCategory(tab.dataset.category));
  $('.settings-tabs').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    const current=settingsCategories.indexOf(state.activeCategory),direction=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;
    const next=event.key==='Home'?0:event.key==='End'?settingsCategories.length-1:(current+direction+settingsCategories.length)%settingsCategories.length;
    event.preventDefault();event.stopPropagation();setCategory(settingsCategories[next],{focus:true});
  });
  for(const image of document.querySelectorAll('.view-card img'))image.addEventListener('error',()=>{image.hidden=true;image.closest('.view-card').classList.add('thumbnail-unavailable');});
  const compactQuery=window.matchMedia('(max-width: 600px)');
  compactQuery.addEventListener?.('change',event=>{if(event.matches){setTimePanel(false);if(state.panelOpen&&state.viewsOpen)setViews(false);}});
  compactLowQuery.addEventListener?.('change',event=>{
    if(event.matches){setTimePanel(false);setFireworksPanel(false);}
  });
  const coach=$('#coach');let coachTimer=0;
  const showCoach=(seconds=16)=>{coach.classList.remove('seen');clearTimeout(coachTimer);coachTimer=setTimeout(()=>coach.classList.add('seen'),seconds*1000);};
  const openHelp=()=>{setCategory('navigation');setPanel(true);$('#tab-navigation').focus({preventScroll:true});showCoach();};
  $('#help-toggle').addEventListener('click',openHelp);
  document.addEventListener('keydown',event=>{if(event.key==='?'&&!/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)&&!event.target.isContentEditable){event.preventDefault();openHelp();}});
  $('#hide-ui').addEventListener('click', () => setHidden(true));
  $('#restore-ui').addEventListener('click', () => setHidden(false));
  $('#reset').addEventListener('click', reset);
  $('#pause').addEventListener('click', togglePause);
  $('#float-leaf').addEventListener('click', async () => {
    if (state.paused) { togglePause(); }
    const placed=await invoke('onFloat');
    if(placed&&window.matchMedia('(max-width:600px)').matches)setPanel(false);
  });
  $('#find-leaf').addEventListener('click',async()=>{const found=await invoke('onFindLeaf');if(found&&window.matchMedia('(max-width:600px)').matches)setPanel(false);});
  function updateWeatherUI(){
    const derived=deriveWeather(state.weather);
    for(const key of ['humidity','temperature','coverage','thickness','shear']){
      const slider=$(`#weather-${key}`);slider.value=state.weather[key];
      slider.style.setProperty('--fill',`${(Number(slider.value)-Number(slider.min))/(Number(slider.max)-Number(slider.min))*100}%`);
      $(`#${key}-output`).textContent=key==='humidity'||key==='coverage'?`${Math.round(state.weather[key]*100)}%`:key==='temperature'?`${state.weather[key]}°C`:key==='shear'?`${state.weather[key].toFixed(1)} m/s/km`:`${state.weather[key]} m`;
    }
    $('#weather-auto-base').checked=state.weather.cloudBase==='auto';
    $('#weather-base').disabled=state.weather.cloudBase==='auto';
    $('#weather-base').value=String(derived.cloudBase);
    $('#weather-base').style.setProperty('--fill',`${(derived.cloudBase-100)/2900*100}%`);
    $('#base-output').textContent=`${Math.round(derived.cloudBase)} m`;
    $('#weather-diagnostic').textContent=`露点约 ${derived.dewPoint.toFixed(1)}°C。云随海风移动，较高处风速不同。`;
  }
  function updateAirUI(){
    $('#air-enabled').checked=state.air.enabled;$('#air-shadows').checked=state.air.shadows;
    const slider=$('#air-aerosol');slider.value=state.air.aerosolScale;
    slider.style.setProperty('--fill',`${state.air.aerosolScale/24*100}%`);
    $('#air-output').textContent=state.air.aerosolScale===0?'清澈':state.air.aerosolScale<8?'通透':state.air.aerosolScale<16?'轻霭':'薄雾';
  }
  $('#air-enabled').addEventListener('change',event=>{state.air.enabled=event.target.checked;updateAirUI();invoke('onAirChange',{...state.air});});
  $('#air-shadows').addEventListener('change',event=>{state.air.shadows=event.target.checked;updateAirUI();invoke('onAirChange',{...state.air});});
  $('#air-aerosol').addEventListener('input',event=>{state.air.aerosolScale=Number(event.target.value);updateAirUI();invoke('onAirChange',{...state.air});});
  for(const key of ['humidity','temperature','coverage','thickness','shear'])$(`#weather-${key}`).addEventListener('input',event=>{state.weather[key]=Number(event.target.value);updateWeatherUI();invoke('onWeatherChange',{...state.weather});});
  $('#weather-auto-base').addEventListener('change',event=>{state.weather.cloudBase=event.target.checked?'auto':Number($('#weather-base').value);updateWeatherUI();invoke('onWeatherChange',{...state.weather});});
  $('#weather-base').addEventListener('input',event=>{state.weather.cloudBase=Number(event.target.value);updateWeatherUI();invoke('onWeatherChange',{...state.weather});});
  ['wind', 'current'].forEach((key) => {
    $(`#${key}-speed`).addEventListener('input', (event) => {
      state[key] = Number(event.target.value);
      updateWaterUI();
      invoke(key === 'wind' ? 'onWind' : 'onCurrent', state[key]);
    });
  });
  function syncSound(value){
    state.sound=!!value;
    $('#sound').setAttribute('aria-pressed',String(state.sound));
    $('#sound').setAttribute('aria-label',state.sound?'关闭环境声':'开启环境声');
  }
  $('#sound').addEventListener('click', async () => {
    const next=!state.sound,button=$('#sound');button.disabled=true;
    try{
      await callbacks.onSound?.(next);
      syncSound(next);
      notify(next?'海浪与海风已开启':'环境声已关闭');
    }catch(error){console.error('Atoll sound:',error);notify('环境声暂时无法开启，请再试一次');}
    finally{button.disabled=false;}
  });
  function updateLensUI(){
    for(const key of ['focal','exposure']){
      const slider=$(`#lens-${key}`);slider.value=state.lens[key];
      slider.style.setProperty('--fill',`${(Number(slider.value)-Number(slider.min))/(Number(slider.max)-Number(slider.min))*100}%`);
      $(`#${key}-output`).textContent=key==='focal'?`${state.lens.focal} mm`:`${state.lens.exposure>0?'+':''}${state.lens.exposure.toFixed(1)} EV`;
    }
    $('#lens-dof').checked=state.lens.dof;$('#lens-aperture').value=String(state.lens.aperture);$('#lens-aperture').disabled=!state.lens.dof;
    $('#antialias').value=state.lens.antialias;$('#automatic-quality').checked=state.lens.automatic;
    $('#temporal-aa').checked=state.lens.temporal;
    $('#glint-aa').checked=state.lens.glintAA;
    $('#firelight-aa').checked=state.lens.firelightAA;
    $('#optical-bloom').checked=state.lens.opticalBloom;
    const bloomStrength=$('#optical-bloom-strength');
    bloomStrength.value=String(Math.round(state.lens.opticalBloomStrength*100));
    bloomStrength.disabled=!state.lens.opticalBloom;fillRange('optical-bloom-strength');
    const bloomPercent=`${Math.round(state.lens.opticalBloomStrength*100)}%`;
    $('#optical-bloom-strength-output').textContent=bloomPercent;
    bloomStrength.setAttribute('aria-valuetext',bloomPercent);
    $('#optical-flare').checked=state.lens.opticalFlare;
    setInput('camera-manual-gain',state.lens.manualExposureEV??0);fillRange('camera-manual-gain');$('#camera-manual-gain').disabled=state.night.autoExposure;$('#camera-manual-gain-output').textContent=`${(state.lens.manualExposureEV??0).toFixed(2)} EV`;
    $('#focus-auto').checked=state.lens.focusMode!=='manual';$('#focus-distance').value=Number(state.lens.focusDistance).toFixed(1);
  }
  for(const key of ['focal','exposure'])$(`#lens-${key}`).addEventListener('input',event=>{state.lens[key]=Number(event.target.value);updateLensUI();invoke('onLensChange',{...state.lens});});
  $('#camera-manual-gain').addEventListener('input',event=>{state.lens.manualExposureEV=Number(event.target.value);updateLensUI();invoke('onLensChange',{...state.lens});});
  $('#lens-dof').addEventListener('change',event=>{state.lens.dof=event.target.checked;updateLensUI();invoke('onLensChange',{...state.lens});});
  $('#lens-aperture').addEventListener('change',event=>{state.lens.aperture=Number(event.target.value);invoke('onLensChange',{...state.lens});});
  $('#antialias').addEventListener('change',event=>{state.lens.antialias=event.target.value;invoke('onLensChange',{...state.lens});});
  $('#automatic-quality').addEventListener('change',event=>{state.lens.automatic=event.target.checked;invoke('onLensChange',{...state.lens});});
  $('#temporal-aa').addEventListener('change',event=>{state.lens.temporal=event.target.checked;invoke('onLensChange',{...state.lens});});
  $('#glint-aa').addEventListener('change',event=>{state.lens.glintAA=event.target.checked;invoke('onLensChange',{...state.lens});});
  $('#firelight-aa').addEventListener('change',event=>{state.lens.firelightAA=event.target.checked;invoke('onLensChange',{...state.lens});});
  $('#optical-bloom').addEventListener('change',event=>{state.lens.opticalBloom=event.target.checked;updateLensUI();invoke('onLensChange',{...state.lens});});
  $('#optical-bloom-strength').addEventListener('input',event=>{state.lens.opticalBloomStrength=Number(event.target.value)/100;updateLensUI();invoke('onLensChange',{...state.lens});});
  $('#optical-flare').addEventListener('change',event=>{state.lens.opticalFlare=event.target.checked;invoke('onLensChange',{...state.lens});});
  $('#focus-auto').addEventListener('change',event=>{if(!event.target.checked)state.lens.focusDistance=Number($('#focus-distance').value)||60;state.lens.focusMode=event.target.checked?'target':'manual';invoke('onLensChange',{...state.lens});});
  $('#focus-distance').addEventListener('change',event=>{state.lens.focusMode='manual';state.lens.focusDistance=Math.max(.3,Number(event.target.value)||60);updateLensUI();invoke('onLensChange',{...state.lens});});
  $('#focus-pick').addEventListener('click',()=>invoke('onFocusPick'));
  $('#restore-pivot').addEventListener('click',()=>invoke('onRestorePivot'));
  $('#night-date').addEventListener('change',event=>submitCivil(event.target.value));
  $('#night-exposure').addEventListener('change',event=>{state.night.autoExposure=event.target.checked;updateLensUI();invoke('onNightChange',{autoExposure:state.night.autoExposure});});
  $('#screenshot').addEventListener('click', async () => {
    $('#screenshot').disabled = true;
    await invoke('onScreenshot');
    $('#screenshot').disabled = false;
  });
  $('#fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else notify('此浏览器暂不支持全屏');
    } catch { notify('浏览器暂时无法进入全屏'); }
  });
  document.addEventListener('fullscreenchange', () => {
    $('#fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏');
    $('#fullscreen').setAttribute('aria-pressed', String(!!document.fullscreenElement));
  });
  ['azimuth', 'elevation', 'intensity'].forEach((key) => {
    $(`#sun-${key}`).addEventListener('input', (event) => {
      state.sun[key] = Number(event.target.value);
      updateSunUI();
      invoke('onSunChange', { ...state.sun });
    });
  });
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
    setView(button.dataset.view);
    invoke('onView', state.view);
    if(compactLayout())setViews(false);
  }));
  $('#quality').addEventListener('change', async (event) => {
    const id=event.target.value;if(!QUALITY_PRESETS[id])return;
    state.quality=id;state.qualityState={requested:id,effective:null,custom:false,limits:[]};updateQualityUI();
    event.target.disabled=true;
    if(typeof callbacks.onQualityPreset==='function'){
      const result=await invoke('onQualityPreset',id);
      if(result?.effective)Object.assign(state.qualityState,result);
    }else{
      await invoke('onQuality',['low','balanced'].includes(id)?'balanced':'high');
      state.qualityState.custom=true;state.qualityState.limits=['当前使用兼容画质设置'];
    }
    updateQualityUI();event.target.disabled=false;
  });
  document.addEventListener('keydown', (event) => {
    if (!ready || event.ctrlKey || event.altKey || event.metaKey || event.repeat || ['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) return;
    if (event.key.toLowerCase() === 'h') { event.preventDefault(); setHidden(!state.hidden); }
    else if (event.target.tagName === 'BUTTON'&&['Space','Enter'].includes(event.code)) return;
    else if (event.code === 'Space') { event.preventDefault(); togglePause(); }
    else if (event.key === 'Home') { event.preventDefault();setView('shore');invoke('onHome'); }
    else if (['1','2','3'].includes(event.key)) {
      setView(['shore','lagoon','aerial'][Number(event.key) - 1]);
      invoke('onView', state.view);
    } else if (event.key === 'Escape') {setPanel(false);setViews(false);setTimePanel(false);setFireworksPanel(false);}
  });
  function updateSeaUI(){
    $('#swell-height').value=state.sea.swellHeight;$('#wind-sea').value=state.sea.windSea;
    const clarity=Math.round(state.sea.clarity*100),description=clarity>=95?'极清澈':clarity>=80?'清透玻璃海':clarity>=50?'略有悬浮颗粒':clarity>=20?'较多悬浮颗粒':'颗粒较多';
    $('#water-clarity').value=clarity;$('#clarity-output').textContent=`${clarity}%`;
    $('#water-clarity').setAttribute('aria-valuetext',`清澈度 ${clarity}%，${description}`);
    $('#clarity-hint').textContent=`${description}。0% 颗粒较多，100% 极清澈；水下距离越远，细节越淡，颜色越明显。`;
    $('#swell-output').textContent=`${Math.round(state.sea.swellHeight*100)} cm`;
    $('#windsea-output').textContent=`${Math.round(state.sea.windSea*100)}%`;
    for(const id of ['swell-height','wind-sea','water-clarity']){const s=$('#'+id);s.style.setProperty('--fill',`${(s.value-s.min)/(s.max-s.min)*100}%`);}
  }
  // Reuse the existing settings rows without changing the document/styles.
  const displayRow=document.createElement('div');displayRow.className='lens-switch-row';
  displayRow.innerHTML='<label for="display-transform">色彩呈现</label><select id="display-transform" aria-describedby="display-transform-status"><option value="legacy">原有</option><option value="aces2">ACES 2（实验）</option></select>';
  const displayStatus=document.createElement('p');displayStatus.id='display-transform-status';displayStatus.className='flow-hint';displayStatus.style.whiteSpace='pre-line';
  displayStatus.setAttribute('role','status');displayStatus.setAttribute('aria-live','polite');displayStatus.setAttribute('aria-atomic','true');
  $('#hdr-mode').closest('.lens-switch-row').before(displayRow);
  const whiteNote=document.createElement('p');whiteNote.id='display-transform-white-note';whiteNote.className='flow-hint';whiteNote.hidden=true;
  whiteNote.textContent='ACES 2 生效时自带中调映射，不使用纸白增益；回退状态见下。';
  $('#hdr-white').closest('.lens-switch-row').after(whiteNote,displayStatus);
  $('#hdr-white').setAttribute('aria-describedby',[$('#hdr-white').getAttribute('aria-describedby'),'display-transform-white-note'].filter(Boolean).join(' '));
  function updateGraphicsUI(){
    $('#indirect-light').value=state.graphics.indirect;$('#shadow-quality').value=state.graphics.shadows;
    $('#frame-budget').value=state.graphics.targetFps;$('#wave-resolution').value=state.graphics.waveResolution;
    $('#hdr-mode').value=state.graphics.hdrMode;$('#hdr-display').value=state.graphics.displayName;
    $('#hdr-system').checked=state.graphics.systemCalibration;
    $('#hdr-peak').value=state.graphics.peakNits;$('#hdr-white').value=state.graphics.paperWhiteNits;
    $('#display-transform').value=state.graphics.displayTransform;
    const acesRequested=state.graphics.displayTransform==='aces2';
    $('#hdr-peak').disabled=state.graphics.systemCalibration;
    $('#hdr-white').disabled=state.graphics.systemCalibration||acesRequested;
    whiteNote.hidden=!acesRequested;
    displayStatus.textContent=formatDisplayTransformStatus(state.displayTransformState,state.graphics.displayTransform,state.graphics.hdr);
  }
  for(const [id,key]of [['swell-height','swellHeight'],['wind-sea','windSea']])$('#'+id).addEventListener('input',event=>{state.sea[key]=Number(event.target.value);updateSeaUI();invoke('onSeaChange',{...state.sea});});
  $('#water-clarity').addEventListener('input',event=>{const value=Number(event.target.value)/100;if(!Number.isFinite(value))return;state.sea.clarity=clamp(value,0,1);updateSeaUI();invoke('onSeaChange',{...state.sea});});
  for(const [id,key]of [['indirect-light','indirect'],['shadow-quality','shadows'],['frame-budget','targetFps'],['wave-resolution','waveResolution'],['hdr-mode','hdrMode'],['display-transform','displayTransform'],['hdr-display','displayName'],['hdr-peak','peakNits'],['hdr-white','paperWhiteNits']])$('#'+id).addEventListener('change',async event=>{state.graphics[key]=['targetFps','waveResolution','peakNits','paperWhiteNits'].includes(key)?Number(event.target.value):event.target.value;if(key==='displayTransform'){state.displayTransformState={requested:state.graphics.displayTransform,preparation:{status:state.graphics.displayTransform==='aces2'?'pending':'idle'},sdr:null,hdr:null};updateGraphicsUI();}const result=await invoke('onGraphicsChange',{...state.graphics});if(result?.parameters)Object.assign(state.graphics,result.parameters);updateGraphicsUI();});
  $('#hdr-system').addEventListener('change',event=>{state.graphics.systemCalibration=event.target.checked;updateGraphicsUI();invoke('onGraphicsChange',{...state.graphics});});
  $('#hdr-refresh').addEventListener('click',async()=>{const button=$('#hdr-refresh');button.disabled=true;await invoke('onRefreshDisplay');button.disabled=false;});
  // Photography, HDR and physical source edits deliberately do not mark a
  // rendering profile custom. Only independent rendering-cost overrides do.
  for(const id of ['indirect-light','shadow-quality','wave-resolution','antialias','automatic-quality','temporal-aa','glint-aa','optical-bloom'])$('#'+id).addEventListener('change',markQualityCustom);
  setupNewControls();
  $('#night-date').disabled=typeof callbacks.onTimeChange!=='function'&&typeof callbacks.onNightChange!=='function';
  $('#quality').disabled=typeof callbacks.onQualityPreset!=='function'&&typeof callbacks.onQuality!=='function';
  $('#lamp-select').disabled=$('#lamp-linked').disabled=typeof callbacks.onLampChange!=='function';
  quickExperience=initQuickExperience({state,callbacks,submitFireworks,invoke,togglePause,notify,openSettings(category){setCategory(category);setPanel(true);$('#tab-'+category).focus({preventScroll:true});}});
  // Shell wiring: sheet/tray dismissal, style chips, filmstrip wheel, first-run hints.
  $('#panel-close').addEventListener('click',()=>setPanel(false));
  $('#time-more').addEventListener('click',()=>{setCategory('time');setPanel(true);$('#tab-time').focus({preventScroll:true});});
  for(const button of document.querySelectorAll('[data-close-tray]'))button.addEventListener('click',()=>button.dataset.closeTray==='views'?setViews(false):setFireworksPanel(false));
  $('#scene').addEventListener('pointerdown',()=>{setViews(false);setFireworksPanel(false);if(ready&&!coach.classList.contains('seen'))showCoach(1.6);},{passive:true});
  $('.view-gallery').addEventListener('wheel',event=>{const strip=event.currentTarget;if(strip.scrollWidth<=strip.clientWidth||Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;event.preventDefault();strip.scrollLeft+=event.deltaY;},{passive:false});
  {
    const quickSelect=$('#quick-firework-type'),host=$('#firework-chips');
    for(const group of quickSelect.querySelectorAll('optgroup')){
      const section=document.createElement('div'),title=document.createElement('span');
      section.className='chip-group';section.setAttribute('role','group');section.setAttribute('aria-label',group.label);
      title.className='chip-group-label';title.textContent=group.label.replace('单发','');section.append(title);
      for(const option of group.querySelectorAll('option')){
        const chip=document.createElement('button');chip.type='button';chip.className='chip';chip.dataset.fireworkOption=option.value;
        chip.textContent=option.textContent.replace('（实验）','').trim();chip.setAttribute('aria-pressed','false');
        chip.addEventListener('click',()=>{if(quickSelect.disabled)return;quickSelect.value=option.value;quickSelect.dispatchEvent(new Event('change',{bubbles:true}));});
        section.append(chip);
      }
      host.append(section);
    }
    quickSelect.hidden=true;quickExperience.syncFireworks();
  }
  updateQualityUI();updateTimeUI();updateLampUI();updateFlashlightUI();updateFireworksUI();
  updateGraphicsUI();updateSeaUI();
  setPanel(state.panelOpen);setViews(state.viewsOpen);setCategory(state.activeCategory);updatePerformanceUI();
  setTimePanel(compactLowLayout()?false:state.timePanelOpen);setFireworksPanel(compactLowLayout()?false:state.fireworksOpen);
  updateSunUI();
  updateWaterUI();
  syncSound(state.sound);
  updateLensUI();
  updateWeatherUI();
  updateAirUI();

  return {
    state,
    notify,
    setView,setPanel,setViews,setCategory,setHidden,setTimePanel,setFireworksPanel,
    clearShowcase(){/* Compatibility: camera changes no longer clear independent time selection. */},
    showLeafAvailable(){ $('#find-leaf').hidden=false; },
    locateLeaf(location,show){const marker=$('#leaf-locator');marker.hidden=!(show&&location?.visible);if(!marker.hidden){marker.style.left=`${location.screen[0]}px`;marker.style.top=`${location.screen[1]}px`;}},
    setReady() {
      ready = true;
      const loading = $('#loading');
      if (loading) { loading.classList.add('leaving'); setTimeout(() => loading.remove(), 850); }
      document.body.classList.add('is-ready');showCoach();
    },
    syncGraphics(value){Object.assign(state.graphics,value);updateGraphicsUI();},
    syncSea(value={}){for(const [key,max]of [['swellHeight',.32],['windSea',1.5],['clarity',1]])if(Number.isFinite(value[key]))state.sea[key]=clamp(value[key],0,max);updateSeaUI();},
    syncSun(value){Object.assign(state.sun,value);updateSunUI();},
    syncWeather(value){Object.assign(state.weather,value);updateWeatherUI();},
    syncLens(value){Object.assign(state.lens,value);updateLensUI();},
    syncSound,
    syncTime(info={}){
      const clock=state.time;if(Object.hasOwn(info,'preset'))clock.preset=info.preset;
      for(const key of ['utcMs','rate','timeZoneOffsetMinutes'])if(Number.isFinite(info[key]))clock[key]=info[key];
      if(typeof info.running==='boolean')clock.running=info.running;
      if(['astronomical','artistic'].includes(info.mode))clock.mode=info.mode;
      if(info.observer)for(const key of ['latitude','longitude','height'])if(Number.isFinite(info.observer[key]))clock.observer[key]=info.observer[key];
      if('preset'in info)clock.preset=info.preset;
      if(info.label)$('.place-name').textContent=info.label;if(info.message)$('#night-info').textContent=info.message;
      updateTimeUI();
    },
    syncDirector(info={}){
      if(['off','island','fireworks'].includes(info.mode))state.director.mode=info.mode;
      if(Number.isFinite(info.periodSeconds))state.director.periodSeconds=info.periodSeconds;
      $('#director-mode').value=state.director.mode;$('#director-period').value=String(state.director.periodSeconds);
      $('#director-status').textContent=state.director.mode==='off'?'时间与天气独立；拖动、滚轮或移动键立即接管镜头。':`正在${state.director.mode==='island'?'缓缓环岛':'环绕观赏烟花'}，${Math.round(state.director.periodSeconds/60)}分钟一圈。手动移动立即接管；暂停场景会暂停运镜。`;
    },
    syncLamps(info={}){
      if(Array.isArray(info))info={lamps:info};
      if(['night','on','off'].includes(info.mode))state.lamps.mode=info.mode;
      // linked is an editor preference. A full renderer snapshot carries its
      // own default false and must not cancel the user's ongoing linked edit.
      // An explicit editor-only {linked:...} patch is still supported.
      if(typeof info.linked==='boolean'&&!Array.isArray(info.lamps))state.lamps.linked=info.linked;
      if(Number.isInteger(info.selected))state.lamps.selected=clamp(info.selected,0,2);
      if(Array.isArray(info.lamps))info.lamps.slice(0,3).forEach((lamp,index)=>{
        if(!lamp)return;const target=state.lamps.lamps[index];
        if(typeof lamp.enabled==='boolean')target.enabled=lamp.enabled;
        if(Number.isFinite(lamp.brightness))target.brightness=clamp(lamp.brightness,0,1);
        if(/^#[\da-f]{6}$/i.test(lamp.color))target.color=lamp.color;
      });
      if(info.message)$('#lamp-status').textContent=info.message;updateLampUI();
    },
    syncFlashlight(info={}){
      if(typeof info.enabled==='boolean')state.flashlight.enabled=info.enabled;
      if(Number.isFinite(info.brightness))state.flashlight.brightness=clamp(info.brightness,0,1);updateFlashlightUI();
    },
    syncFireworks(info={}){
      if(['light','full','off'].includes(info.smokeQuality))state.fireworks.smokeQuality=info.smokeQuality;
      else if(typeof info.persistentSmoke==='boolean')state.fireworks.smokeQuality=info.persistentSmoke?'full':'off';
      for(const key of ['type','autoLaunch','autoDirection','azimuth','elevation','autoFrame','persistentSmoke','cloudIllumination','resolvedSmokeLighting','intensityScale','intervalSeconds','randomIntervals','intervalMinSeconds','intervalMaxSeconds','randomLaunchTilt','automaticTiltMinDegrees','automaticTiltMaxDegrees','launchSpreadDegrees','burstTiltDegrees','burstRollDegrees','lightFieldStatus','gpuTransmission','effectProfile'])if(info[key]!==undefined)state.fireworks[key]=info[key];
      for(const key of ['active','queued'])if(Number.isFinite(info[key]))state.fireworks[key]=info[key];
      if(Number.isInteger(info.maxActive)&&info.maxActive>0)state.fireworks.maxActive=info.maxActive;
      if(info.message)$('#firework-status').textContent=info.message;
      else if(Number.isFinite(info.active)||Number.isFinite(info.queued))$('#firework-status').textContent=`空中 ${info.active||0} 发${info.queued?` · 等待 ${info.queued} 发`:''}`;
      updateFireworksUI();
    },
    setQualityState(info={}){
      const requested=info.requested??info.id;
      if(requested&&QUALITY_PRESETS[requested])state.qualityState.requested=requested;
      for(const key of ['effective','custom','limits'])if(info[key]!==undefined)state.qualityState[key]=info[key];
      state.quality=state.qualityState.custom?'custom':state.qualityState.requested;updateQualityUI();
    },
    setNavigationStatus(info={}){
      $('#navigation-status').textContent=info.message||(Number.isFinite(info.speedMps)?`当前移动速度 ${info.speedMps.toFixed(1)} m/s。按住右键滚轮可调整。`:'');
    },
    setThrowCharge(ratio=0,visible=false){
      const meter=$('#throw-charge'),value=Number.isFinite(ratio)?clamp(ratio,0,1):0;
      meter.hidden=!visible;meter.style.setProperty('--charge',value);meter.setAttribute('aria-valuenow',String(Math.round(value*100)));
      $('#throw-charge-label').textContent=`投石力度 · ${Math.round(value*100)}%`; 
    },
    setPaused(value){state.paused=!!value;state.stats.paused=state.paused;$('#pause').setAttribute('aria-pressed',String(state.paused));$('#pause').setAttribute('aria-label',state.paused?'继续场景':'暂停场景');updatePerformanceUI();},
    locateImpact(point,visible){const marker=$('#impact-locator');marker.hidden=!visible;if(visible){marker.style.left=point[0]+'px';marker.style.top=point[1]+'px';}},
    setNight(info){if(info.label)document.querySelector('.place-name').textContent=info.label;if(info.date){state.night.date=info.date;const utcMs=civilToUTC(info.date,state.time.timeZoneOffsetMinutes);if(utcMs!==null){state.time.utcMs=utcMs;updateTimeUI();}else $('#night-date').value=info.date;}if(info.autoExposure!==undefined){state.night.autoExposure=info.autoExposure;$('#night-exposure').checked=info.autoExposure;updateLensUI();}if(info.message)$('#night-info').textContent=info.message;},
    setDisplayTransformState(info={}){
      if(info.requested==='legacy'||info.requested==='aces2')state.graphics.displayTransform=info.requested;
      state.displayTransformState={...info,requested:state.graphics.displayTransform};updateGraphicsUI();
    },
    setDisplays(report,selection){
      const select=$('#hdr-display');select.replaceChildren(new Option('自动识别当前屏幕','auto'));
      for(const d of report?.displays||[])select.add(new Option(`${d.friendlyName} · ${d.deviceName.split('\\').at(-1)} · ${Math.round(d.maxLuminanceNits)} nit`,d.deviceName));
      select.value=state.graphics.displayName;
      if(selection?.display){const d=selection.display;if(state.graphics.systemCalibration){state.graphics.peakNits=selection.peakNits||1000;state.graphics.paperWhiteNits=selection.paperWhiteNits||203;updateGraphicsUI();}const peak=selection.nativePeakNits>0?`${Math.round(selection.nativePeakNits)} nit`:'未读到峰值（回退值，需手动）',white=selection.nativeSDRWhiteNits>0?`${Math.round(selection.nativeSDRWhiteNits)} nit`:'未读到 SDR 白（回退203）';$('#hdr-calibration').textContent=`系统报告（${d.deviceName.split('\\').at(-1)}）：峰值 ${peak}，SDR 白 ${white}。${selection.reason||''}；可手动选屏或输入校准值。`;}
      else $('#hdr-calibration').textContent='当前屏幕无法可靠匹配；可明确选择显示器，或手动填写峰值与参考白。';
    },
    setHDRSupport(info){
      state.graphics.hdr=!!info.enabled;
      if(info.enabled)$('#hdr-status').textContent=info.calibrationSource==='unverified-fallback'?'HDR 已开启 · 回退亮度参数，需手动校准':'HDR 已开启 · 按亮度参数映射';
      else if(state.graphics.hdrMode==='sdr')$('#hdr-status').textContent='已选择 SDR';
      else if(state.graphics.hdrMode==='auto'){
        const reason=info.apiAvailable===false?'浏览器尚不支持 HDR 输出':info.displayHDR===false?'当前显示环境未报告 HDR':info.calibrationSource==='unverified-fallback'?'缺少完整系统亮度数据':'系统 HDR 显示条件未满足';
        $('#hdr-status').textContent=`${reason}，自动使用 SDR`;
      }else $('#hdr-status').textContent='HDR 未能开启，当前使用 SDR';
      if(info.errors?.length)$('#hdr-status').textContent+=' · '+info.errors.at(-1);
      displayStatus.textContent=formatDisplayTransformStatus(state.displayTransformState,state.graphics.displayTransform,state.graphics.hdr);
    },
    setCameraExposure(info={}){if(!Number.isFinite(info.cameraEV))return;const f=v=>`${v>=0?'+':''}${v.toFixed(2)} EV`,$readout=$('#camera-exposure-readout'),text=`${info.mode==='manual'?'手动':'自动'} · 当前 ${f(info.cameraEV)} · 目标 ${f(info.targetEV??info.cameraEV)}`;if($readout.textContent!==text)$readout.textContent=text;},
    setStats(info = {}) {
      for(const key of ['fps','gpuMs','paused','status','renderScale'])if(Object.hasOwn(info,key))state.stats[key]=info[key];
      updatePerformanceUI();
      if(Number.isFinite(info.focusMetres)){$('#focus-info').textContent=`当前对焦约 ${info.focusMetres.toFixed(1)} 米。广角远景景深大；靠近物体、增大光圈或焦距可观察虚化。`;if(state.lens.focusMode!=='manual'&&document.activeElement!==$('#focus-distance')){state.lens.focusDistance=info.focusMetres;$('#focus-distance').value=info.focusMetres.toFixed(1);}}
      if (info.message) $('#scene-status').textContent = info.message;
      if (info.loading) { const detail = $('.loading-detail'); if (detail) detail.textContent = info.loading; }
      if (info.error) {
        $('#error-detail').textContent = info.error;
        $('#error').hidden = false;
      }
    },
  };
}
