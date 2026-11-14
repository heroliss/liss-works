import {FIREWORK_TYPES} from './fireworks-physics.js';
const TIMES=Object.freeze({day:'白昼',sunset:'日落',moon:'月夜',stars:'星空'});
const TYPE_TO_SOURCE=Object.freeze({peony:'peony',chrysanthemum:'chrysanthemum',willow:'willow',palm:'palm',smiley:'ring',heart:'heart',crossette:'crossette',strobe:'strobe',comet:'fan',bouquet:'bouquet',...Object.fromEntries(FIREWORK_TYPES.filter(type=>type.collection==='large-choreographed').map(type=>[type.id,type.id]))});
const SOURCE_TO_TYPE=Object.freeze(Object.fromEntries(Object.entries(TYPE_TO_SOURCE).map(([key,value])=>[value,key])));
const PROFILES=new Set(['three-heart-v1','three-heart-radiant120-v1','two-colour-v1']);

// Presentation and in-flight button state only. Scene values always come from
// the existing UI state, and every edit uses the incumbent action callbacks.
export function initQuickExperience({state,callbacks,submitFireworks,invoke,togglePause,openSettings,notify}){
  const element=id=>{
    const node=document.getElementById(id);
    if(!node)throw new Error(`Missing quick-experience element: ${id}`);
    return node;
  };
  const timeButtons=[...document.querySelectorAll('button[data-quick-time]')].filter(button=>Object.hasOwn(TIMES,button.dataset.quickTime));
  const timeStatus=element('quick-time-status'),selection=element('quick-firework-type');
  const description=document.getElementById('quick-firework-description');
  const launch=element('quick-launch'),random=element('quick-random'),auto=element('quick-auto');
  const stop=element('quick-stop'),settings=element('quick-firework-settings'),status=element('quick-firework-status');
  const busy=new Set();
  let timeEpoch=0,timeBusy=0,timeMessage=null;
  const hasCallback=name=>typeof callbacks[name]==='function';
  const timeCallback=()=>hasCallback('onQuickTimePreset')?'onQuickTimePreset':'onTimePreset';
  function syncTime(){
    const selected=state.time?.preset,pending=timeBusy!==0;
    for(const button of timeButtons){
      button.setAttribute('aria-pressed',String(button.dataset.quickTime===selected));
      button.disabled=pending||!hasCallback(timeCallback());
      button.setAttribute('aria-busy',String(pending));
    }
    timeStatus.setAttribute('aria-busy',String(pending));
    timeStatus.textContent=timeMessage||(Object.hasOwn(TIMES,selected)?`${TIMES[selected]} · 已应用，机位保持当前设置。`:'时间与机位独立，可分别切换。');
  }
  function cancelTimePreset(){
    timeEpoch++;timeMessage=null;syncTime();
  }

  function syncFireworks(){
    const f=state.fireworks,profile=f.effectProfile||'legacy';
    const type=FIREWORK_TYPES.find(type=>type.id===f.type),complex=profile==='legacy'&&type?.collection==='large-choreographed';
    if(description){
      description.hidden=!complex;
      description.textContent=complex?`${type.label} · ${type.ground?'参考顶点':'参考高度'}约${type.height}米 · 编排约${type.burn}秒。${type.description}`:'';
    }
    const value=profile==='legacy'?`type:${SOURCE_TO_TYPE[f.type]||''}`:`profile:${profile}`;
    const represented=[...selection.options].some(option=>option.value===value);
    for(const chip of document.querySelectorAll('[data-firework-option]'))chip.setAttribute('aria-pressed',String(chip.dataset.fireworkOption===value));
    if(represented)selection.value=value;
    else selection.selectedIndex=-1;
    const option=[...selection.options].find(option=>option.value===value);
    const styleName=option?.textContent?.trim()||type?.label||'当前样式';
    const queued=Number.isFinite(f.queued)&&f.queued>0,scheduled=!!f.autoLaunch||queued;
    const current=document.getElementById('quick-current-style');
    if(current)current.textContent=f.autoLaunch?'随机燃放中':styleName;
    const toggle=document.getElementById('fireworks-toggle');
    toggle?.setAttribute('aria-label',`烟花样式：${styleName}，展开选择`);
    (launch.querySelector('span')||launch).textContent=scheduled?'停止后续':'放烟花';launch.classList.toggle('is-stopping',scheduled);
    launch.title=scheduled?'停止后续发射，保留空中烟花与烟尘':`发射${styleName}；暂停时会继续播放`;
    launch.setAttribute('aria-label',scheduled?'停止后续发射':`发射${styleName}`);
    selection.title=represented?'选择下一发的样式':'当前为详细设置中的其他实验样式；选择此处的样式可切换';
    selection.disabled=busy.has(selection)||!hasCallback('onFireworksChange');
    launch.disabled=busy.has(launch)||!hasCallback(scheduled?'onStopFireworks':'onLaunchFirework');
    random.disabled=busy.has(random)||!hasCallback('onRandomFirework');
    auto.disabled=busy.has(auto)||!hasCallback('onFireworksChange')||!hasCallback('onStopFireworks');
    auto.setAttribute('aria-pressed',String(!!f.autoLaunch));
    (auto.querySelector('span')||auto).textContent=f.autoLaunch?'燃放中':'持续随机';
    auto.title=f.autoLaunch?'停止后续发射，保留空中烟花与烟尘':`持续随机使用全部${FIREWORK_TYPES.length}种样式（含大型编排）；开始时恢复场景播放`;
    stop.disabled=busy.has(stop)||!hasCallback('onStopFireworks')||(!f.autoLaunch&&!queued);
    settings.disabled=typeof openSettings!=='function';
    const parts=[];
    if(Number.isFinite(f.active))parts.push(`空中 ${Math.max(0,Math.floor(f.active))}${Number.isInteger(f.maxActive)&&f.maxActive>0?` / ${f.maxActive}`:''} 发`);
    if(queued)parts.push(`等待 ${Math.floor(f.queued)} 发`);
    if(f.autoLaunch){
      parts.push('持续随机燃放中');
      if(f.randomIntervals&&Number.isFinite(f.intervalMinSeconds)&&Number.isFinite(f.intervalMaxSeconds))parts.push(`每 ${f.intervalMinSeconds}–${f.intervalMaxSeconds} 秒`);
      else if(Number.isFinite(f.intervalSeconds))parts.push(`每 ${f.intervalSeconds} 秒`);
      if(f.randomLaunchTilt&&Number.isFinite(f.automaticTiltMinDegrees)&&Number.isFinite(f.automaticTiltMaxDegrees)){
        const angle=value=>`${value>0?'+':''}${value}°`;
        parts.push(`自动倾角 ${angle(f.automaticTiltMinDegrees)}…${angle(f.automaticTiltMaxDegrees)}（0°竖直）`);
      }
    }
    else if(profile!=='legacy')parts.push(represented?'所选实验样式仅单次燃放':'当前使用详细设置中的其他实验样式');
    else parts.push(complex?`${type.label} · 大型编排`:'选择样式，立即发射');
    if(profile!=='legacy')parts.push('持续随机会切换为常用样式与大型编排');
    if(f.smokeQuality==='light')parts.push('轻量短烟');
    else if(f.smokeQuality==='full')parts.push('长期体积烟 · 高开销');
    else if(f.smokeQuality==='off')parts.push('烟气已关闭');
    const text=parts.join(' · ');
    if(status.textContent!==text)status.textContent=text;
  }
  async function withBusy(button,action){
    if(busy.has(button))return;
    busy.add(button);button.setAttribute('aria-busy','true');syncFireworks();
    try{return await action();}
    catch(error){console.error('Atoll quick experience:',error);notify?.('操作暂时没有完成，请再试一次');}
    finally{busy.delete(button);button.setAttribute('aria-busy','false');syncFireworks();}
  }

  selection.addEventListener('change',()=>{
    const value=selection.value;
    return withBusy(selection,()=>{
      const [kind,id]=value.split(':');
      if(kind==='type'&&Object.hasOwn(TYPE_TO_SOURCE,id))return submitFireworks({type:TYPE_TO_SOURCE[id],effectProfile:'legacy'});
      if(kind==='profile'&&PROFILES.has(id))return submitFireworks({effectProfile:id});
      throw new RangeError('Unknown quick firework selection');
    });
  });
  launch.addEventListener('click',()=>withBusy(launch,()=>invoke(state.fireworks.autoLaunch||state.fireworks.queued>0?'onStopFireworks':'onLaunchFirework')));
  random.addEventListener('click',()=>withBusy(random,()=>invoke('onRandomFirework')));
  stop.addEventListener('click',()=>withBusy(stop,()=>invoke('onStopFireworks')));
  auto.addEventListener('click',()=>withBusy(auto,async()=>{
    if(state.fireworks.autoLaunch)return invoke('onStopFireworks');
    const result=await submitFireworks({autoLaunch:true});
    if(result?.accepted===false)return result;
    if(state.paused)await togglePause();
  }));
  settings.addEventListener('click',()=>openSettings?.('fireworks'));
  for(const button of timeButtons)button.addEventListener('click',async()=>{
    const callback=timeCallback();
    if(timeBusy||!hasCallback(callback))return;
    const id=button.dataset.quickTime,ticket=++timeEpoch;
    timeBusy=ticket;timeMessage=`正在应用${TIMES[id]}…`;syncTime();
    try{
      // A time preset propagates failure and never invokes camera, launch or
      // sound callbacks. The scene callback publishes the real clock via syncTime.
      const result=await callbacks[callback](id);
      if(ticket===timeEpoch)timeMessage=result===false||result===undefined?'未能应用该时刻，可继续手动调节。':null;
    }catch(error){
      console.error('Atoll time preset:',error);
      if(ticket===timeEpoch){timeMessage='时间暂时未能更新，请重试。';notify?.('时间预设暂时没有完成，请再试一次');}
    }finally{
      if(timeBusy===ticket)timeBusy=0;
      syncTime();
    }
  });
  syncTime();syncFireworks();
  return {syncFireworks,syncTime,cancelTimePreset,clearShowcase(){},setShowcase(){return false;}};
}
