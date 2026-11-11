import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { advanceRing, circularOffset, gestureAxis, nearestPhase, normalizeWheel, ringLayout, ringPose, wrapPhase, type RingMotion } from './archive-ring-math';

type Options = { signal: AbortSignal; preference: MediaQueryList };
type Pointer = { id:number;x:number;y:number;phase:number;lastPhase:number;time:number;axis:'pending'|'horizontal'|'vertical' };

export function setupArchiveAtlas({ signal, preference }: Options) {
  if (signal.aborted) return () => {};
  const atlasElement = document.querySelector<HTMLElement>('[data-project-atlas]');
  if (!atlasElement) return () => {};
  const atlas: HTMLElement = atlasElement;
  const viewportElement = atlas.querySelector<HTMLElement>('[data-atlas-ring]');
  const cameraElement = atlas.querySelector<HTMLElement>('[data-atlas-ring-camera]');
  const stageElement = atlas.querySelector<HTMLElement>('[data-atlas-stage]');
  if (!viewportElement || !cameraElement || !stageElement) return () => {};
  const viewport: HTMLElement = viewportElement, stage: HTMLElement = stageElement;
  const events = new AbortController(), media = gsap.matchMedia();
  const items = Array.from(atlas.querySelectorAll<HTMLElement>('[data-atlas-item]'));
  const cards = Array.from(atlas.querySelectorAll<HTMLAnchorElement>('[data-atlas-ring-card]'));
  const itemBySlug = new Map(items.map(item => [item.dataset.atlasItem, item]));
  const toggle = atlas.querySelector<HTMLButtonElement>('[data-atlas-motion-toggle]');
  const status = atlas.querySelector<HTMLElement>('[data-atlas-status]');
  const positionLabel = atlas.querySelector<HTMLElement>('[data-atlas-position]');
  const help = atlas.querySelector<HTMLElement>('[data-atlas-ring-help]');
  const copyBlock = atlas.querySelector<HTMLElement>('.atlas-display-copy');
  let copyFade: Animation | undefined;
  const links = Array.from(atlas.querySelectorAll<HTMLAnchorElement>('[data-atlas-link]'));
  const initial = items.find(item => item.dataset.previewHref === links[0]?.getAttribute('href')) ?? items[0];
  let selected: HTMLElement | undefined = initial;
  let list: HTMLElement[] = [], disposed = false, stageVisible = false;
  let paused = document.documentElement.dataset.motionPaused === 'true';
  let motion: RingMotion = { position:0, velocity:0, target:null };
  let raf = 0, previousTime = 0, wheelEnd: ReturnType<typeof setTimeout> | undefined;
  let pointer: Pointer | null = null, suppressClickUntil = 0, wheelTarget: number | null = null;
  let pageWheelAt = -Infinity;
  let width = Math.max(1, viewport.clientWidth), heightBudget = Infinity, cardWidth = 440, dragUnit = 250;
  let tiltX = 0, tiltY = 0, targetX = 0, targetY = 0;
  const tileGates = new Set<() => void>();
  const shown = (item: HTMLElement) => !item.hidden && !item.closest('[hidden]');
  const movingAllowed = () => !paused && !preference.matches && !document.hidden && stageVisible;

  function updateCopy(item: HTMLElement, announce = false) {
    if (selected === item && atlas.dataset.atlasSelected === item.dataset.atlasItem) return;
    const changed = selected !== undefined && selected !== item;
    selected = item;
    if (changed && copyBlock && typeof copyBlock.animate === 'function' && !preference.matches) {
      copyFade?.cancel();
      copyFade = copyBlock.animate([{ opacity: .45, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
    atlas.dataset.atlasSelected = item.dataset.atlasItem;
    atlas.style.setProperty('--atlas-tone', item.dataset.previewAccent ?? '#9cdef1');
    items.forEach(entry => entry.dataset.active = String(entry === item));
    const values: Record<string, string | undefined> = {
      title:item.dataset.previewTitle, summary:item.dataset.previewSummary,
      principle:item.dataset.previewPrinciple, direction:item.dataset.previewDirection,
      category:item.querySelector('.atlas-tile-meta span')?.textContent ?? '',
    };
    Object.entries(values).forEach(([key, value]) => {
      const node = atlas.querySelector<HTMLElement>(`[data-atlas-${key}]`);
      if (node) node.textContent = value ?? '';
    });
    links.forEach(link => link.href = item.dataset.previewHref ?? '#');
    if (announce && status) status.textContent = `当前预览 ${item.dataset.previewTitle}`;
  }

  function loadImage(card: HTMLElement) {
    const image = card.querySelector<HTMLImageElement>('img');
    if (!image || image.hasAttribute('src')) return;
    if (image.dataset.ringSrcset) image.srcset = image.dataset.ringSrcset;
    if (image.dataset.ringSrc) image.src = image.dataset.ringSrc;
  }

  function render(announce = false) {
    if (disposed) return;
    const count = list.length, activeIndex = count ? Math.round(wrapPhase(motion.position, count)) % count : -1;
    if (activeIndex >= 0) updateCopy(list[activeIndex], announce);
    const focusedCard = document.activeElement?.closest<HTMLElement>('[data-atlas-ring-card]');
    if (focusedCard && viewport.contains(focusedCard) && focusedCard.dataset.atlasRingCard !== list[activeIndex]?.dataset.atlasItem) {
      (count ? viewport : atlas.querySelector<HTMLElement>('#project-search'))?.focus({preventScroll:true});
    }
    const indices = new Map(list.map((item,index) => [item.dataset.atlasItem, index]));
    cards.forEach(card => {
      const index = indices.get(card.dataset.atlasRingCard);
      if (index === undefined) { card.hidden = true; card.tabIndex = -1; card.setAttribute('aria-hidden','true'); return; }
      const offset = circularOffset(index, motion.position, count), pose = ringPose(offset, width, count, heightBudget);
      card.hidden = !pose.visible;
      card.tabIndex = index === activeIndex ? 0 : -1;
      if (index === activeIndex) { card.removeAttribute('aria-hidden'); card.setAttribute('aria-current','true'); }
      else { card.setAttribute('aria-hidden','true'); card.removeAttribute('aria-current'); }
      card.dataset.ringActive = String(index === activeIndex);
      if (!pose.visible) return;
      // Seen from slightly above; the camera tilt follows the pointer on top of this.
      card.style.transform = `translate(-50%,-50%) rotateX(${(-3 + tiltX).toFixed(3)}deg) rotateY(${tiltY.toFixed(3)}deg) translate3d(${pose.x.toFixed(2)}px,${pose.y.toFixed(2)}px,${pose.z.toFixed(2)}px) rotateY(${pose.rotateY.toFixed(2)}deg) scale(${pose.scale.toFixed(4)})`;
      card.style.opacity = pose.opacity.toFixed(3);
      card.style.setProperty('--ring-shade', pose.shade.toFixed(3));
      card.style.zIndex = String(pose.zIndex);
      if (stageVisible) loadImage(card);
    });
    viewport.dataset.ringIndex = String(activeIndex);
    viewport.dataset.ringPhase = wrapPhase(motion.position, count).toFixed(4);
    viewport.dataset.count = String(count);
    if (positionLabel) positionLabel.textContent = count ? `${activeIndex + 1} / ${count}` : '0 / 0';
    if (help) help.textContent = helpText(count);
  }

  function helpText(count: number) {
    if (count < 2) return '点击画面进入工程';
    return matchMedia('(hover:hover) and (pointer:fine)').matches ? '滚轮或拖动浏览 · 方向键切换 · 点击中间画面进入' : '左右拖动浏览 · 点击中间画面进入';
  }

  function stopFrame() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; previousTime = 0; delete viewport!.dataset.ringAnimating;
  }
  function requestFrame() {
    if (!raf && movingAllowed() && !disposed) {
      viewport!.dataset.ringAnimating = 'true';
      raf = requestAnimationFrame(frame);
    }
  }
  function frame(time: number) {
    raf = 0;
    if (!movingAllowed() || disposed) { stopFrame(); return; }
    const dt = previousTime ? Math.min(.05, (time - previousTime) / 1000) : 1 / 60;
    previousTime = time;
    if (pointer?.axis !== 'horizontal') motion = advanceRing(motion, dt);
    const ease = 1 - Math.exp(-dt * 6.5);
    tiltX += (targetX - tiltX) * ease; tiltY += (targetY - tiltY) * ease;
    if (Math.abs(targetX-tiltX) < .002) tiltX = targetX;
    if (Math.abs(targetY-tiltY) < .002) tiltY = targetY;
    render();
    const unsettled = motion.target !== null || Math.abs(motion.velocity) > .006 || Math.abs(motion.position-Math.round(motion.position)) > .0005;
    if ((pointer?.axis !== 'horizontal' && unsettled) || tiltX !== targetX || tiltY !== targetY) requestFrame();
    else stopFrame();
  }
  function settleImmediately() {
    stopFrame();
    motion = {position:Math.round(motion.target ?? motion.position), velocity:0, target:null};
    tiltX=tiltY=targetX=targetY=0; render();
  }
  function endWheel() { clearTimeout(wheelEnd); wheelEnd=undefined; wheelTarget=null; }
  function releasePointer(coast = true, releaseTime?: number) {
    const old = pointer; pointer = null;
    delete viewport!.dataset.dragging;
    if (old && viewport!.hasPointerCapture(old.id)) viewport!.releasePointerCapture(old.id);
    if (old?.axis === 'horizontal') {
      if(releaseTime!==undefined){const idle=Math.max(0,(releaseTime-old.time)/1000);motion.velocity=idle>.12?0:motion.velocity*Math.exp(-idle*12);}
      suppressClickUntil = performance.now() + 350;
      if (!coast || !movingAllowed()) settleImmediately();
      else { motion.target=null; motion.velocity=Math.max(-6,Math.min(6,motion.velocity)); requestFrame(); }
    } else if (old && Math.abs(motion.position-Math.round(motion.position)) > .0005) {
      motion.target=Math.round(motion.position);
      if (!coast || !movingAllowed()) settleImmediately();else requestFrame();
    }
  }
  function gate() {
    if (!movingAllowed()) { endWheel(); releasePointer(false); settleImmediately(); }
    tileGates.forEach(check => check());
  }
  function select(item: HTMLElement | undefined, animate = true, announce = true) {
    if (!item || !shown(item)) return;
    const index = list.indexOf(item); if (index < 0) return;
    endWheel();
    const target = nearestPhase(index, motion.position, list.length);
    if (!animate || !movingAllowed()) { motion={position:index,velocity:0,target:null}; render(announce); }
    else { motion.target=target; requestFrame(); if (announce && status) status.textContent=`正在浏览 ${item.dataset.previewTitle}`; }
  }
  function filterChanged() {
    endWheel(); releasePointer(false); stopFrame();
    list = items.filter(shown);
    const keep = selected && list.includes(selected) ? selected : list[0];
    motion = {position:Math.max(0, keep ? list.indexOf(keep) : 0), velocity:0, target:null};
    stage!.dataset.empty = String(!list.length);
    if (!list.length) { selected=undefined; delete atlas!.dataset.atlasSelected; }
    render(); ScrollTrigger.refresh(true);
  }
  function measure() {
    width=Math.max(1, viewport!.clientWidth);
    // Leave room for the copy beneath so the focused screenshot never overflows a short window.
    heightBudget=Math.max(300, (window.innerHeight||900)*.7);
    const layout=ringLayout(width,heightBudget);
    cardWidth=layout.card; dragUnit=Math.max(120,layout.lift+layout.stack);
    viewport!.style.setProperty('--ring-card-width',`${cardWidth}px`);
    // Keep the enlarged screenshot, caption and floating shadow inside the stage
    // at the wide-phone breakpoint as well as in the desktop two-column layout.
    viewport!.style.setProperty('--ring-height',`${Math.ceil(Math.max(290,cardWidth*.625+110))}px`);
    render();
  }
  function syncControls() {
    if (toggle) {
      toggle.setAttribute('aria-pressed',String(paused));
      toggle.setAttribute('aria-label',paused?'继续页面动态':'暂停页面动态');
      toggle.disabled=preference.matches;
      const label=toggle.querySelector('[data-atlas-motion-label]');if(label)label.textContent=paused?'继续动态':'暂停动态';
    }
    document.documentElement.dataset.motionPaused=String(paused);gate();
  }
  toggle?.addEventListener('click',()=>{paused=!paused;syncControls();window.dispatchEvent(new CustomEvent('portfolio:motion-state',{detail:{paused}}));},{signal:events.signal});
  window.addEventListener('portfolio:motion-state',event=>{const value=(event as CustomEvent<{paused?:boolean}>).detail?.paused;if(typeof value==='boolean'){paused=value;syncControls();}},{signal:events.signal});
  window.addEventListener('portfolio:atlas-filter',filterChanged,{signal:events.signal});
  document.addEventListener('visibilitychange',gate,{signal:events.signal});
  window.addEventListener('blur',()=>{endWheel();releasePointer(false);settleImmediately();},{signal:events.signal});
  preference.addEventListener('change',()=>{syncControls();measure();},{signal:events.signal});

  viewport.addEventListener('pointerdown',event=>{
    if (!event.isPrimary || event.button!==0 || list.length<2 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    suppressClickUntil=0;
    endWheel();stopFrame();motion.velocity=0;motion.target=null;
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,phase:motion.position,lastPhase:motion.position,time:event.timeStamp,axis:'pending'};
  },{signal:events.signal});
  const pointerMoved=(event:PointerEvent)=>{
    if (pointer && pointer.id===event.pointerId) {
      const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
      if(pointer.axis==='pending') {
        pointer.axis=gestureAxis(dx,dy);
        if(pointer.axis==='horizontal') {viewport.focus({preventScroll:true});viewport.setPointerCapture(event.pointerId);viewport.dataset.dragging='true';}
      }
      if(pointer.axis!=='horizontal')return;
      if(event.cancelable)event.preventDefault();
      const phase=pointer.phase-dx/dragUnit,dt=Math.max(.008,Math.min(.06,(event.timeStamp-pointer.time)/1000));
      motion.velocity=motion.velocity*.55+(phase-pointer.lastPhase)/dt*.45;
      motion.position=phase;motion.target=null;pointer.lastPhase=phase;pointer.time=event.timeStamp;
      render();return;
    }
    if(event.pointerType==='touch'||!movingAllowed()||!matchMedia('(hover:hover) and (pointer:fine)').matches)return;
    const bounds=viewport.getBoundingClientRect();
    targetY=((event.clientX-bounds.left)/Math.max(1,bounds.width)*2-1)*5;
    targetX=-((event.clientY-bounds.top)/Math.max(1,bounds.height)*2-1)*3.5;
    requestFrame();
  };
  viewport.addEventListener('pointermove',pointerMoved,{passive:false,signal:events.signal});
  window.addEventListener('pointermove',event=>{if(pointer&&!(event.target instanceof Node&&viewport.contains(event.target)))pointerMoved(event);},{passive:false,signal:events.signal});
  viewport.addEventListener('pointerleave',()=>{if(!pointer){targetX=targetY=0;requestFrame();}},{signal:events.signal});
  viewport.addEventListener('pointerup',event=>{if(pointer?.id===event.pointerId)releasePointer(true,event.timeStamp);},{signal:events.signal});
  viewport.addEventListener('pointercancel',event=>{if(pointer?.id===event.pointerId)releasePointer(false);},{signal:events.signal});
  window.addEventListener('pointerup',event=>{if(pointer?.id===event.pointerId)releasePointer(true,event.timeStamp);},{signal:events.signal});
  window.addEventListener('pointercancel',event=>{if(pointer?.id===event.pointerId)releasePointer(false);},{signal:events.signal});
  // Touch starts with implicit capture on the hit card. Transferring capture to
  // the viewport bubbles that child's loss; only our own loss ends this drag.
  viewport.addEventListener('lostpointercapture',event=>{if(event.target===viewport&&pointer?.id===event.pointerId)releasePointer(false);},{signal:events.signal});
  viewport.addEventListener('dragstart',event=>event.preventDefault(),{signal:events.signal});
  viewport.addEventListener('click',event=>{
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    if(event.detail!==0&&performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();return;}
    const card=(event.target as Element).closest<HTMLAnchorElement>('[data-atlas-ring-card]');
    if(!card||!viewport.contains(card))return;
    if(card.dataset.atlasRingCard!==selected?.dataset.atlasItem){event.preventDefault();select(itemBySlug.get(card.dataset.atlasRingCard));}
  },{capture:true,signal:events.signal});
  // A page scroll that carries the ring under a resting pointer keeps scrolling the page;
  // only a wheel that starts over the ring turns it.
  window.addEventListener('wheel',event=>{if(!(event.target instanceof Node&&viewport.contains(event.target)))pageWheelAt=event.timeStamp;},{capture:true,passive:true,signal:events.signal});
  viewport.addEventListener('wheel',event=>{
    if(list.length<2||event.ctrlKey||event.metaKey||pointer)return;
    if(event.timeStamp-pageWheelAt<260){pageWheelAt=event.timeStamp;return;}
    const delta=normalizeWheel(event.deltaX,event.deltaY,event.deltaMode,viewport.clientHeight);
    if(!delta)return;
    event.preventDefault();
    if(!movingAllowed()){select(list[(Math.round(wrapPhase(motion.position,list.length))+Math.sign(delta)+list.length)%list.length],false);return;}
    wheelTarget=(wheelTarget??motion.target??motion.position)+delta/130;
    motion.target=wheelTarget;requestFrame();clearTimeout(wheelEnd);
    wheelEnd=setTimeout(()=>{wheelEnd=undefined;motion.target=Math.round(wheelTarget??motion.position);wheelTarget=null;requestFrame();},140);
  },{passive:false,signal:events.signal});
  viewport.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||list.length<2)return;
    const index=Math.round(wrapPhase(motion.target??motion.position,list.length))%list.length;
    const target=event.key==='ArrowRight'?list[(index+1)%list.length]:event.key==='ArrowLeft'?list[(index-1+list.length)%list.length]:event.key==='Home'?list[0]:event.key==='End'?list.at(-1):null;
    if(target){event.preventDefault();select(target);}
  },{signal:events.signal});

  const stageObserver=new IntersectionObserver(([entry])=>{stageVisible=entry.isIntersecting;if(stageVisible)render();gate();});
  stageObserver.observe(stage);
  const resize=new ResizeObserver(measure);resize.observe(viewport);

  // Shelves keep their existing small physical tilt. Only pointer input creates tweens.
  media.add({motion:'(prefers-reduced-motion:no-preference)',fine:'(hover:hover) and (pointer:fine)',wide:'(min-width:900px)'},context=>{
    if(!context.conditions?.motion||!context.conditions.fine||!context.conditions.wide)return;
    const local=new AbortController(), observers:IntersectionObserver[]=[];
    const ownedGates:(()=>void)[]=[];
    items.forEach(item=>{
      const surface=item.querySelector<HTMLElement>('[data-atlas-tilt]');if(!surface)return;
      const css=getComputedStyle(surface),rx0=parseFloat(css.getPropertyValue('--atlas-rest-x'))||0,ry0=parseFloat(css.getPropertyValue('--atlas-rest-y'))||0;
      let visible=false,held=false,bounds={left:0,top:0,width:1,height:1};
      const rx=gsap.quickTo(surface,'rotationX',{duration:.9,ease:'power3.out'}),ry=gsap.quickTo(surface,'rotationY',{duration:.9,ease:'power3.out'});
      const reset=(instant=false)=>{rx(rx0);ry(ry0);if(instant){rx.tween.progress(1).pause();ry.tween.progress(1).pause();}};
      const check=()=>{if(!visible||paused||document.hidden)reset(true);};tileGates.add(check);ownedGates.push(check);
      const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;check();});observer.observe(item);observers.push(observer);
      const measureTile=()=>{const b=item.getBoundingClientRect();bounds={left:b.left,top:b.top,width:b.width,height:b.height};};
      item.addEventListener('pointerenter',measureTile,{signal:local.signal});
      item.addEventListener('pointermove',event=>{if(!visible||paused||document.hidden||held||event.pointerType==='touch')return;const x=Math.max(-1,Math.min(1,(event.clientX-bounds.left)/bounds.width*2-1)),y=Math.max(-1,Math.min(1,(event.clientY-bounds.top)/bounds.height*2-1));rx(rx0-y*7);ry(ry0+x*10);},{passive:true,signal:local.signal});
      item.addEventListener('pointerleave',()=>{if(!held)reset(paused||document.hidden);},{signal:local.signal});
      item.addEventListener('pointerdown',event=>{if(!event.isPrimary||event.button!==0)return;held=true;rx.tween.pause();ry.tween.pause();},{signal:local.signal});
      window.addEventListener('pointerup',()=>{if(!held)return;held=false;reset(paused||document.hidden);},{signal:local.signal});
      window.addEventListener('pointercancel',()=>{if(!held)return;held=false;reset(true);},{signal:local.signal});
      window.addEventListener('blur',()=>{if(!held)return;held=false;reset(true);},{signal:local.signal});
      reset(true);
    });
    context.add(()=>()=>{local.abort();observers.forEach(observer=>observer.disconnect());ownedGates.forEach(check=>tileGates.delete(check));});
  });
  atlas.dataset.ringReady='true';measure();filterChanged();syncControls();
  const dispose=()=>{
    if(disposed)return;
    endWheel();copyFade?.cancel();releasePointer(false);stopFrame();disposed=true;events.abort();stageObserver.disconnect();resize.disconnect();media.revert();tileGates.clear();
    delete atlas.dataset.ringReady;delete viewport.dataset.ringAnimating;delete viewport.dataset.dragging;
    cards.forEach((card,index)=>{card.hidden=index!==0;card.tabIndex=index===0?0:-1;card.style.removeProperty('transform');card.style.removeProperty('opacity');card.style.removeProperty('z-index');card.style.removeProperty('--ring-shade');card.removeAttribute('aria-current');delete card.dataset.ringActive;if(index===0)card.removeAttribute('aria-hidden');else card.setAttribute('aria-hidden','true');});
    signal.removeEventListener('abort',dispose);
  };
  signal.addEventListener('abort',dispose,{once:true});return dispose;
}
