import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

type Options = { signal:AbortSignal;preference:MediaQueryList };

export function setupArchiveAtlas({ signal,preference }:Options) {
  const atlas=document.querySelector<HTMLElement>('[data-project-atlas]');
  if(!atlas)return()=>{};
  const events=new AbortController(),media=gsap.matchMedia();
  let interactions=gsap.context(()=>{},atlas);
  const items=Array.from(atlas.querySelectorAll<HTMLElement>('[data-atlas-item]'));
  const stage=atlas.querySelector<HTMLElement>('[data-atlas-stage]')!;
  const plane=atlas.querySelector<HTMLElement>('[data-atlas-preview-tilt]')!;
  const content=atlas.querySelector<HTMLElement>('[data-atlas-preview-content]')!;
  const image=atlas.querySelector<HTMLImageElement>('[data-atlas-image]')!;
  const status=atlas.querySelector<HTMLElement>('[data-atlas-status]');
  const links=Array.from(atlas.querySelectorAll<HTMLAnchorElement>('[data-atlas-link]'));
  const previous=atlas.querySelector<HTMLButtonElement>('[data-atlas-previous]')!;
  const next=atlas.querySelector<HTMLButtonElement>('[data-atlas-next]')!;
  const toggle=atlas.querySelector<HTMLButtonElement>('[data-atlas-motion-toggle]')!;
  let displayed=items.find(item=>item.dataset.previewHref===links[0]?.getAttribute('href'))??items[0];
  let selected: HTMLElement | undefined=items.find(item=>item.dataset.atlasItem===atlas.dataset.atlasSelected)??displayed;
  let ticket=0,stageVisible=false,disposed=false,pendingAnnounce=false;
  atlas.style.setProperty('--atlas-tone',displayed.dataset.previewAccent??'#9cdef1');
  let paused=document.documentElement.dataset.motionPaused==='true';
  let transition:gsap.core.Tween|undefined,palette:gsap.core.Tween|undefined;
  const gates=new Set<()=>void>();
  const shown=(item:HTMLElement)=>!item.hidden&&!item.closest('[hidden]');
  const visibleItems=()=>items.filter(shown);
  const updatePosition=()=>{
    const list=visibleItems();
    const index=list.indexOf(displayed);
    const label=atlas.querySelector<HTMLElement>('[data-atlas-position]');
    if(label)label.textContent=`${Math.max(0,index)+1} / ${list.length}`;
    previous.disabled=next.disabled=list.length<2;
  };
  const syncControls=()=>{
    toggle.setAttribute('aria-pressed',String(paused));
    toggle.setAttribute('aria-label',paused?'继续页面动态':'暂停页面动态');
    toggle.disabled=preference.matches;
    const label=toggle.querySelector('[data-atlas-motion-label]');
    if(label)label.textContent=paused?'继续动态':'暂停动态';
    document.documentElement.dataset.motionPaused=String(paused);
    gates.forEach(gate=>gate());
  };
  const choose=async(item:HTMLElement|undefined,animate=true,announce=false)=>{
    if(!item||!shown(item)||disposed)return;
    const alreadyRequested=selected===item;
    pendingAnnounce=alreadyRequested?(pendingAnnounce||announce):announce;
    selected=item;
    items.forEach(entry=>entry.dataset.active=String(entry===item));
    atlas.dataset.atlasSelected=item.dataset.atlasItem;
    stage.dataset.empty='false';
    if(displayed===item){ticket++;delete stage.dataset.loading;updatePosition();if(announce&&status)status.textContent=`当前预览 ${item.dataset.previewTitle}`;return;}
    if(alreadyRequested&&stage.dataset.loading==='true')return;
    const turn=++ticket,source=item.dataset.previewSrc;
    if(!stageVisible){delete stage.dataset.loading;return;}
    if(!source)return;
    stage.dataset.loading='true';
    const preload=new Image();preload.src=source;
    try{await preload.decode();}catch{
      if(turn!==ticket||disposed)return;
      delete stage.dataset.loading;
      if(pendingAnnounce&&status)status.textContent='项目预览暂时无法载入，可直接从图版打开工程。';
      return;
    }
    if(disposed||turn!==ticket||selected!==item||!shown(item))return;
    if(!stageVisible){delete stage.dataset.loading;return;}
    transition?.revert();palette?.kill();
    image.src=source;image.alt=item.dataset.previewAlt??'';
    image.width=preload.naturalWidth;image.height=preload.naturalHeight;
    plane.style.setProperty('--atlas-ratio',String(preload.naturalWidth/preload.naturalHeight));
    const values:Record<string,string|undefined>={title:item.dataset.previewTitle,summary:item.dataset.previewSummary,principle:item.dataset.previewPrinciple,direction:item.dataset.previewDirection,category:item.querySelector('.atlas-tile-meta span')?.textContent??''};
    Object.entries(values).forEach(([key,value])=>{const node=atlas.querySelector<HTMLElement>(`[data-atlas-${key}]`);if(node)node.textContent=value??'';});
    links.forEach(link=>{link.href=item.dataset.previewHref??'#';if(link.classList.contains('atlas-preview-link'))link.setAttribute('aria-label',`打开 ${item.dataset.previewTitle} 项目`);});
    displayed=item;updatePosition();delete stage.dataset.loading;
    if(pendingAnnounce&&status)status.textContent=`当前预览 ${item.dataset.previewTitle}`;
    const moving=animate&&!preference.matches&&!paused;
    if(!moving){atlas.style.setProperty('--atlas-tone',item.dataset.previewAccent??'#9cdef1');return;}
    interactions.add(()=>{
      palette=gsap.to(atlas,{'--atlas-tone':item.dataset.previewAccent,duration:.65,ease:'power2.out'});
      transition=gsap.fromTo(content,{opacity:.3,y:8},{opacity:1,y:0,duration:.55,ease:'power3.out',clearProps:'opacity,transform'});
    });
  };
  const filterChanged=()=>{
    const list=visibleItems();
    if(!list.length){ticket++;stage.dataset.empty='true';delete stage.dataset.loading;selected=undefined;delete atlas.dataset.atlasSelected;return;}
    void choose(selected&&shown(selected)?selected:list[0],false,false);
    updatePosition();ScrollTrigger.refresh(true);
  };
  items.forEach(item=>{
    item.addEventListener('pointermove',event=>{if((event.movementX||event.movementY)&&event.pointerType!=='touch'&&window.matchMedia('(hover:hover) and (pointer:fine)').matches)void choose(item,true,false);},{signal:events.signal});
    item.addEventListener('focusin',()=>void choose(item,true,true),{signal:events.signal});
  });
  const step=(direction:number)=>{const list=visibleItems();const index=list.indexOf(selected??displayed);void choose(list[(Math.max(0,index)+direction+list.length)%list.length],true,true);};
  previous.addEventListener('click',()=>step(-1),{signal:events.signal});
  next.addEventListener('click',()=>step(1),{signal:events.signal});
  toggle.addEventListener('click',()=>{paused=!paused;transition?.progress(1);palette?.progress(1);syncControls();window.dispatchEvent(new CustomEvent('portfolio:motion-state',{detail:{paused}}));},{signal:events.signal});
  window.addEventListener('portfolio:motion-state',event=>{const value=(event as CustomEvent<{paused?:boolean}>).detail?.paused;if(typeof value==='boolean'){paused=value;syncControls();}},{signal:events.signal});
  window.addEventListener('portfolio:atlas-filter',filterChanged,{signal:events.signal});
  document.addEventListener('visibilitychange',()=>gates.forEach(g=>g()),{signal:events.signal});
  const stageObserver=new IntersectionObserver(([entry])=>{stageVisible=entry.isIntersecting;if(stageVisible&&selected!==displayed)void choose(selected,false,false);gates.forEach(g=>g());});
  stageObserver.observe(stage);

  media.add({motion:'(prefers-reduced-motion:no-preference)',fine:'(hover:hover) and (pointer:fine)',wide:'(min-width:900px)'},context=>{
    const {motion,fine,wide}=context.conditions!;
    const local=new AbortController();const observers:(IntersectionObserver|ResizeObserver)[]=[];
    const ownedGates:(()=>void)[]=[];let closed=false;
    const addGate=(gate:()=>void)=>{gates.add(gate);ownedGates.push(gate);};
    const float=atlas.querySelector<HTMLElement>('[data-atlas-float]')!;
    if(motion){
      const breathing=gsap.to(float,{y:-7,duration:4.4,ease:'sine.inOut',repeat:-1,yoyo:true,paused:true});
      const gate=()=>breathing.paused(closed||!stageVisible||paused||document.hidden);
      addGate(gate);gate();
      stage.addEventListener('pointerdown',()=>breathing.pause(),{signal:local.signal});
      window.addEventListener('pointerup',gate,{signal:local.signal});
      window.addEventListener('pointercancel',gate,{signal:local.signal});
      ScrollTrigger.batch(items.map(item=>item.querySelector<HTMLElement>('[data-atlas-reveal]')!),{start:'top 94%',once:true,batchMax:3,interval:.07,onEnter:batch=>{if(!paused)context.add(()=>gsap.fromTo(batch,{opacity:.62},{opacity:1,duration:.85,stagger:.07,clearProps:'opacity'}));}});
    }
    if(motion&&fine&&wide){
      const field=atlas.querySelector<HTMLElement>('[data-atlas-field]')!;
      const fieldX=gsap.quickTo(field,'x',{duration:1.05,ease:'power3.out'}),fieldY=gsap.quickTo(field,'y',{duration:1.05,ease:'power3.out'});
      let fieldHeld=false;
      const resetField=(immediate=false)=>[fieldX,fieldY].forEach(to=>{to(0);if(immediate)to.tween.progress(1).pause();});
      addGate(()=>{if(paused||document.hidden||!stageVisible)resetField(true);});
      stage.addEventListener('pointermove',event=>{if(!fieldHeld&&!paused&&!document.hidden){fieldX(-(event.clientX/window.innerWidth*2-1)*22);fieldY(-(event.clientY/window.innerHeight*2-1)*14);}},{passive:true,signal:local.signal});
      stage.addEventListener('pointerleave',()=>{if(!fieldHeld)resetField();},{signal:local.signal});
      stage.addEventListener('pointerdown',()=>{fieldHeld=true;[fieldX,fieldY].forEach(to=>to.tween.pause());transition?.pause();},{signal:local.signal});
      const releaseField=()=>{fieldHeld=false;if(!paused&&!document.hidden){[fieldX,fieldY].forEach(to=>{if(to.tween.progress()<1)to.tween.resume();});transition?.resume();}};
      window.addEventListener('pointerup',releaseField,{signal:local.signal});window.addEventListener('pointercancel',releaseField,{signal:local.signal});window.addEventListener('blur',()=>{fieldHeld=false;resetField(true);},{signal:local.signal});

      const controllers=[{region:stage,plane},...items.map(item=>({region:item,plane:item.querySelector<HTMLElement>('[data-atlas-tilt]')!}))];
      controllers.forEach(({region,plane:surface})=>{
        let visible=false,held=false,restX=0,restY=0,restZ=0;
        let bounds={left:0,top:0,width:1,height:1},camera={left:0,width:1,height:1,perspective:1800,viewport:1};
        const readRest=()=>{const css=getComputedStyle(surface);restX=parseFloat(css.getPropertyValue('--atlas-rest-x'))||0;restY=parseFloat(css.getPropertyValue('--atlas-rest-y'))||0;restZ=parseFloat(css.getPropertyValue('--atlas-rest-z'))||0;};
        readRest();
        const rx=gsap.quickTo(surface,'rotationX',{duration:.85,ease:'power3.out'}),ry=gsap.quickTo(surface,'rotationY',{duration:.85,ease:'power3.out'}),tx=gsap.quickTo(surface,'x',{duration:.7,ease:'power3.out'}),ty=gsap.quickTo(surface,'y',{duration:.7,ease:'power3.out'});
        const tweens=[rx,ry,tx,ty];
        const reset=(immediate=false)=>{rx(restX);ry(restY);tx(0);ty(0);if(immediate)tweens.forEach(to=>to.tween.progress(1).pause());region.dataset.atlasPointer='0.000,0.000';};
        const measure=()=>{const b=region.getBoundingClientRect(),c=surface.closest<HTMLElement>('.atlas-stage-camera,.atlas-tile-camera')!;const cb=c.getBoundingClientRect();bounds={left:b.left+scrollX,top:b.top+scrollY,width:b.width,height:b.height};camera={left:cb.left+(cb.width-surface.offsetWidth)/2,width:surface.offsetWidth,height:surface.offsetHeight,perspective:parseFloat(getComputedStyle(c).perspective)||1800,viewport:document.documentElement.clientWidth};};
        measure();reset(true);
        const gate=()=>{if(!visible||paused||document.hidden)reset(true);};addGate(gate);
        const io=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;gate();});io.observe(region);observers.push(io);
        const ro=new ResizeObserver(measure);ro.observe(region);ro.observe(surface);observers.push(ro);
        window.addEventListener('resize',()=>{readRest();measure();reset(true);},{signal:local.signal});
        region.addEventListener('pointerenter',measure,{signal:local.signal});
        region.addEventListener('pointermove',event=>{
          if(closed||held||!visible||paused||document.hidden||event.pointerType==='touch')return;
          const x=gsap.utils.clamp(-1,1,(event.pageX-bounds.left)/Math.max(1,bounds.width)*2-1),y=gsap.utils.clamp(-1,1,(event.pageY-bounds.top)/Math.max(1,bounds.height)*2-1);
          const ax=restX-y*8,ay=restY+x*12;
          const fits=(strength:number)=>{const a=ax*strength*Math.PI/180,b=ay*strength*Math.PI/180,z=restZ*Math.PI/180;return[-1,1].every(sx=>[-1,1].every(sy=>{const px=sx*camera.width/2,py=sy*camera.height/2,y1=py*Math.cos(a),z1=py*Math.sin(a),x2=px*Math.cos(b)+z1*Math.sin(b),z2=-px*Math.sin(b)+z1*Math.cos(b);const screen=camera.left+camera.width/2+((x2*Math.cos(z)-y1*Math.sin(z))+x*6*strength)/(1-z2/camera.perspective);return screen>=8&&screen<=camera.viewport-8;}));};
          let strength=1;if(!fits(1)){let low=0,high=1;for(let i=0;i<8;i++){const mid=(low+high)/2;if(fits(mid))low=mid;else high=mid;}strength=low;}
          rx(ax*strength);ry(ay*strength);tx(x*6*strength);ty(y*5*strength);region.dataset.atlasPointer=`${x.toFixed(3)},${y.toFixed(3)}`;
        },{passive:true,signal:local.signal});
        region.addEventListener('pointerleave',()=>{if(!held)reset();},{signal:local.signal});
        region.addEventListener('pointerdown',event=>{if(event.isPrimary&&event.button===0){held=true;tweens.forEach(to=>to.tween.pause());}},{signal:local.signal});
        const release=()=>{const wasHeld=held;held=false;if(!region.matches(':hover'))reset();else if(wasHeld&&!paused&&!document.hidden)tweens.forEach(to=>{if(to.tween.progress()<1)to.tween.resume();});};
        window.addEventListener('pointerup',release,{signal:local.signal});window.addEventListener('pointercancel',release,{signal:local.signal});window.addEventListener('blur',()=>{held=false;reset(true);},{signal:local.signal});
        context.add(()=>()=>{delete region.dataset.atlasPointer;});
      });
    }
    context.add(()=>()=>{closed=true;local.abort();observers.forEach(o=>o.disconnect());ownedGates.forEach(gate=>gates.delete(gate));});
  });
  preference.addEventListener('change',()=>{transition?.progress(1);palette?.progress(1);interactions.revert();interactions=gsap.context(()=>{},atlas);atlas.style.setProperty('--atlas-tone',displayed.dataset.previewAccent??'#9cdef1');syncControls();},{signal:events.signal});
  syncControls();filterChanged();
  const dispose=()=>{if(disposed)return;disposed=true;ticket++;events.abort();stageObserver.disconnect();media.revert();interactions.revert();gates.clear();signal.removeEventListener('abort',dispose);};
  signal.addEventListener('abort',dispose,{once:true});return dispose;
}
