import type { AtollEngine } from './atoll-water-engine';

type Options = { signal: AbortSignal; preference: MediaQueryList };
export function setupAtollWater({ signal, preference }: Options): () => void {
  const root=document.querySelector<HTMLElement>('[data-atoll-water]');
  if(!root||signal.aborted)return()=>{};
  const stage=root.querySelector<HTMLElement>('[data-atoll-stage]')!;
  const canvas=root.querySelector<HTMLCanvasElement>('[data-atoll-canvas]')!;
  const fallback=root.querySelector<HTMLElement>('[data-atoll-fallback]')!;
  const status=root.querySelector<HTMLElement>('[data-atoll-status]')!;
  const toggle=root.querySelector<HTMLButtonElement>('[data-atoll-pause]')!;
  const label=root.querySelector<HTMLElement>('[data-atoll-pause-label]')!;
  const moments=[...root.querySelectorAll<HTMLButtonElement>('[data-atoll-moment]')];
  const events=new AbortController(),forced=matchMedia('(forced-colors: active)');
  let engine:AtollEngine|undefined,disposed=false,loading=false,failed=false,visible=false;
  let frame=0,last=0,time=7,draws=0,lastRipple=0,moment=Number(root.dataset.waterMoment||0);
  let bounds={left:0,top:0,width:1,height:1};
  let exporter:HTMLButtonElement|undefined,exportLink:HTMLAnchorElement|undefined;
  const pointer={x:0,y:0};
  const paused=()=>document.documentElement.dataset.motionPaused==='true';
  const running=()=>!!engine&&visible&&!document.hidden&&!disposed&&!paused()&&!preference.matches&&!forced.matches;
  const stop=()=>{cancelAnimationFrame(frame);frame=0;last=0;};
  const draw=(dt=0)=>{engine?.draw(time,pointer,dt);if(++draws%15===0)root.dataset.waterFrames=String(draws);};
  const render=(now:number)=>{
    frame=0;if(!running())return;
    frame=requestAnimationFrame(render);
    if(last&&now-last<1000/30-1)return;
    const dt=last?Math.min(.07,(now-last)/1000):1/30;last=now;time+=dt;
    draw(dt);
  };
  const measure=()=>{
    const rect=stage.getBoundingClientRect();bounds={left:rect.left+scrollX,top:rect.top+scrollY,width:rect.width,height:rect.height};
    if(engine){engine.resize();if(visible&&!document.hidden)engine.repaint();}
  };
  const unavailable=()=>{
    if(disposed||failed)return;failed=true;stop();engine?.dispose();engine=undefined;
    canvas.hidden=true;fallback.hidden=false;toggle.hidden=true;root.dataset.waterState='fallback';
    moments.forEach(button=>{button.disabled=true;});status.textContent='浅海与离岛的静帧；完整画面仍可查看。';
  };
  const sync=()=>{
    if(disposed)return;
    if(!engine){if(visible&&!document.hidden&&!loading&&!failed&&!forced.matches)void load();return;}
    canvas.hidden=forced.matches;fallback.hidden=!forced.matches;toggle.hidden=forced.matches;
    moments.forEach(button=>{button.disabled=forced.matches;});
    toggle.disabled=preference.matches;toggle.setAttribute('aria-pressed',String(paused()));
    label.textContent=preference.matches?'静态海面':paused()?'继续海面':'暂停海面';
    root.dataset.waterState=forced.matches?'fallback':preference.matches?'static':paused()?'paused':visible&&!document.hidden?'playing':'suspended';
    if(running()){if(!frame)frame=requestAnimationFrame(render);}
    else{stop();if(preference.matches&&visible&&!document.hidden&&!forced.matches){pointer.x=pointer.y=0;engine.draw(time,pointer,0);}}
  };
  const load=async()=>{
    loading=true;
    try{
      const {createAtollEngine}=await import('./atoll-water-engine');
      if(disposed||!visible||document.hidden)return;
      const candidate=createAtollEngine(canvas,stage);
      if(disposed){candidate.dispose();return;}
      engine=candidate;engine.moment(moment);measure();draw();
      moments.forEach(button=>{button.disabled=false;button.setAttribute('aria-pressed',String(Number(button.dataset.atollMoment)===moment));});
      status.textContent='椰树与沙洲，随波纹轻轻荡开的倒影。';sync();
      if(import.meta.env.DEV&&new URLSearchParams(location.search).get('capture')==='atoll'){
        exporter=document.createElement('button');exporter.type='button';exporter.textContent='导出海面静帧';exporter.dataset.atollExport='';
        exportLink=document.createElement('a');exportLink.textContent='下载海面静帧';exportLink.hidden=true;exportLink.download='atoll-water.png';
        root.querySelector('figcaption')?.append(exporter,exportLink);
        exporter.addEventListener('click',()=>{const data=engine?.capture?.();if(data&&exportLink){exportLink.href=data;exportLink.hidden=false;}},{signal:events.signal});
      }
    }catch(error){if(!disposed){console.warn('Island water fallback:',error);unavailable();}}
    finally{loading=false;}
  };
  const view=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();});view.observe(stage);
  const size=new ResizeObserver(measure);size.observe(stage);
  moments.forEach(button=>button.addEventListener('click',()=>{
    moment=Number(button.dataset.atollMoment);root.dataset.waterMoment=String(moment);engine?.moment(moment);
    moments.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    if(!running()&&engine)draw();
  },{signal:events.signal}));
  toggle.addEventListener('click',()=>{
    const value=!paused();document.documentElement.dataset.motionPaused=String(value);
    window.dispatchEvent(new CustomEvent('portfolio:motion-state',{detail:{paused:value}}));
  },{signal:events.signal});
  const interact=(event:PointerEvent,tap=false)=>{
    if(!running()||(!tap&&event.pointerType==='touch'))return;
    const x=Math.max(-1,Math.min(1,(event.pageX-bounds.left)/bounds.width*2-1));
    const y=Math.max(-1,Math.min(1,(event.pageY-bounds.top)/bounds.height*2-1));
    pointer.x=x;pointer.y=y;
    if(tap||performance.now()-lastRipple>115){engine?.ripple(x,y,time,tap?1:.55);lastRipple=performance.now();}
  };
  stage.addEventListener('pointerenter',measure,{passive:true,signal:events.signal});
  stage.addEventListener('pointermove',event=>interact(event),{passive:true,signal:events.signal});
  stage.addEventListener('pointerdown',event=>interact(event,true),{passive:true,signal:events.signal});
  stage.addEventListener('pointerleave',()=>{pointer.x=pointer.y=0;},{signal:events.signal});
  window.addEventListener('portfolio:motion-state',sync,{signal:events.signal});
  document.addEventListener('visibilitychange',sync,{signal:events.signal});
  preference.addEventListener('change',sync,{signal:events.signal});forced.addEventListener('change',sync,{signal:events.signal});
  canvas.addEventListener('webglcontextlost',event=>{if(!disposed){event.preventDefault();unavailable();}},{signal:events.signal});
  const dispose=()=>{
    if(disposed)return;disposed=true;stop();events.abort();view.disconnect();size.disconnect();engine?.dispose();engine=undefined;
    canvas.hidden=true;fallback.hidden=false;toggle.hidden=true;moments.forEach(button=>{button.disabled=true;});
    exporter?.remove();exportLink?.remove();
    const fresh=canvas.cloneNode(false) as HTMLCanvasElement;fresh.removeAttribute('width');fresh.removeAttribute('height');canvas.replaceWith(fresh);
    root.dataset.waterState='waiting';delete root.dataset.waterFrames;signal.removeEventListener('abort',dispose);
  };
  signal.addEventListener('abort',dispose,{once:true});return dispose;
}
