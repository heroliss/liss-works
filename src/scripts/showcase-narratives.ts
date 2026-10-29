import { gsap } from 'gsap';

type Options = { signal: AbortSignal; preference: MediaQueryList };
type Running = gsap.core.Timeline | undefined;

/** Two authored machines, with real project pictures and ordinary gallery links. */
export function setupShowcaseNarratives({ signal, preference }: Options): () => void {
  const events = new AbortController();
  const root = document.documentElement;
  const cleanups: (() => void)[] = [];
  const gates = new Set<() => void>();
  let disposed = false;
  const scene = (element: HTMLElement, getTimeline: () => Running) => {
    let visible = false;
    const gate = () => {
      const playing = visible && !document.hidden && !preference.matches && root.dataset.motionPaused !== 'true';
      element.dataset.scenePlaying = String(playing);
      const timeline = getTimeline();
      if (preference.matches) timeline?.progress(1).pause();
      else timeline?.paused(!playing);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; gate(); }, { threshold: .05 });
    observer.observe(element); gates.add(gate);
    cleanups.push(() => { observer.disconnect(); gates.delete(gate); delete element.dataset.scenePlaying; });
    return gate;
  };
  const snapshots = (elements: Element[]) => {
    const saved = elements.map(element => ({ element, style: element.getAttribute('style'), transform: element.getAttribute('transform'), d: element.getAttribute('d') }));
    return () => saved.forEach(({ element, style, transform, d }) => {
      if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style);
      if (transform === null) element.removeAttribute('transform'); else element.setAttribute('transform', transform);
      if (d !== null) element.setAttribute('d', d);
    });
  };
  const collection = (host: HTMLElement, pictureHook: string, buttonHook: string) => {
    const pictures = Array.from(host.querySelectorAll<HTMLElement>(`[${pictureHook}]`));
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>(`[${buttonHook}]`));
    const originals = pictures.map(picture => ({ picture, hidden:picture.hidden, inert:picture.inert, active:picture.dataset.active }));
    const pressed = buttons.map(button => ({ button, disabled:button.disabled, pressed:button.getAttribute('aria-pressed') }));
    const mark = (value: string) => {
      host.dataset.active = value;
      pictures.forEach(picture => { const active=picture.getAttribute(pictureHook)===value; picture.hidden=!active; picture.inert=!active; picture.dataset.active=String(active); });
      buttons.forEach(button => button.setAttribute('aria-pressed',String(button.getAttribute(buttonHook)===value)));
    };
    const bind = (select: (value:string) => void) => buttons.forEach(button => {
      button.disabled=false;
      const activate=() => select(button.getAttribute(buttonHook)??'0');
      button.addEventListener('click',activate,{signal:events.signal});
      button.addEventListener('focusin',activate,{signal:events.signal});
      button.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch'&&matchMedia('(hover:hover) and (pointer:fine)').matches)activate();},{signal:events.signal});
    });
    cleanups.push(() => {
      originals.forEach(({picture,hidden,inert,active})=>{picture.hidden=hidden;picture.inert=inert;if(active===undefined)delete picture.dataset.active;else picture.dataset.active=active;});
      pressed.forEach(({button,disabled,pressed})=>{button.disabled=disabled;if(pressed===null)button.removeAttribute('aria-pressed');else button.setAttribute('aria-pressed',pressed);});
      host.dataset.active='0';
    });
    return {pictures,buttons,mark,bind};
  };

  document.querySelectorAll<HTMLElement>('[data-framework-gallery]').forEach(gallery=>{
    const {pictures,buttons,mark,bind}=collection(gallery,'data-framework-picture','data-framework-select');
    const wire=gallery.querySelector<SVGPathElement>('[data-framework-wire]');
    const plug=gallery.querySelector<SVGGElement>('[data-framework-plug]');
    const planes=Array.from(gallery.querySelectorAll<HTMLElement>('[data-framework-media]'));
    const restore=snapshots([...planes,...(wire?[wire]:[]),...(plug?[plug]:[])]);
    let timeline:Running;
    let current='0';
    const gate=scene(gallery,()=>timeline);
    const connect=(value:string,animate=true)=>{
      const button=buttons.find(button=>button.dataset.frameworkSelect===value);
      if(!button||value===current&&animate)return;
      const previous=buttons.find(button=>button.dataset.frameworkSelect===current);
      timeline?.kill();restore();
      mark(value);current=value;
      const selected=pictures.find(p=>p.dataset.frameworkPicture===value);
      const summaryTitle=gallery.querySelector<HTMLElement>('[data-framework-summary-title]');
      const summaryDescription=gallery.querySelector<HTMLElement>('[data-framework-summary-description]');
      if(summaryTitle)summaryTitle.textContent=selected?.querySelector('[data-framework-title]')?.textContent??'';
      if(summaryDescription)summaryDescription.textContent=selected?.querySelector('[data-framework-description]')?.textContent??'';
      const plane=pictures.find(p=>p.dataset.frameworkPicture===value)?.querySelector<HTMLElement>('[data-framework-media]');
      const x=Number(button.dataset.frameworkPortX??184),y=Number(button.dataset.frameworkPortY??168);
      const d=button.dataset.frameworkWireD;
      if(!animate||preference.matches||root.dataset.motionPaused==='true'){
        if(wire&&d)gsap.set(wire,{attr:{d}});
        if(plug)gsap.set(plug,{x,y});
        return;
      }
      timeline=gsap.timeline({paused:true});
      if(plug){
        gsap.set(plug,{x:Number(previous?.dataset.frameworkPortX??184),y:Number(previous?.dataset.frameworkPortY??168)});
        timeline.to(plug,{x:x-22,rotation:-7,duration:.16,ease:'power2.in'},0)
          .to(plug,{y,duration:.34,ease:'power3.inOut'},.16)
          .to(plug,{x,rotation:0,duration:.18,ease:'back.out(1.3)'},.5);
      }
      if(wire&&d){
        gsap.set(wire,{attr:{d:previous?.dataset.frameworkWireD??d}});
        timeline.to(wire,{opacity:.2,duration:.14},0)
          .to(wire,{attr:{d},duration:.38,ease:'power3.inOut'},.16)
          .to(wire,{opacity:1,duration:.18},.51);
      }
      if(plane)timeline.fromTo(plane,{y:9},{y:0,duration:.6,ease:'power3.out',clearProps:'transform'},.1);
      gate();
    };
    gallery.dataset.frameworkEnhanced='true';bind(value=>connect(value));connect('0',false);
    cleanups.push(()=>{timeline?.kill();restore();delete gallery.dataset.frameworkEnhanced;});
  });

  document.querySelectorAll<HTMLElement>('[data-dub-reel]').forEach(factory=>{
    const {pictures,buttons,mark,bind}=collection(factory,'data-reel-frame','data-reel-select');
    if(!pictures.length||!buttons.length)return;
    const tracks=Array.from(factory.querySelectorAll<HTMLElement|SVGElement>('[data-factory-track]'));
    const cameras=Array.from(factory.querySelectorAll<HTMLElement>('[data-reel-camera],[data-reel-console]'));
    const restore=snapshots([...tracks,...cameras]);
    let timeline:Running;
    let current='0';
    const gate=scene(factory,()=>timeline);
    const move=(value:string,animate=true)=>{
      if(!pictures.some(p=>p.dataset.reelFrame===value)||value===current&&animate)return;
      const previous=Number(current),index=Number(value),direction=index>=previous?1:-1;
      timeline?.kill();restore();mark(value);current=value;
      if(!animate||preference.matches||root.dataset.motionPaused==='true')return;
      const frame=pictures.find(p=>p.dataset.reelFrame===value);
      const camera=frame?.querySelector<HTMLElement>('[data-reel-camera]');
      const console=frame?.querySelector<HTMLElement>('[data-reel-console]');
      timeline=gsap.timeline({paused:true,defaults:{ease:'power3.out'}});
      if(camera)timeline.fromTo(camera,{x:direction*82,z:-28},{x:0,z:0,duration:.85,clearProps:'transform'},0);
      if(console)timeline.fromTo(console,{y:12},{y:0,duration:.55,clearProps:'transform'},.12);
      tracks.forEach((track,index)=>timeline!.fromTo(track,{x:direction*(index?58:28)},{x:0,duration:.9,clearProps:'transform'},0));
      gate();
    };
    factory.dataset.reelEnhanced='true';bind(value=>move(value));move('0',false);
    cleanups.push(()=>{timeline?.kill();restore();delete factory.dataset.reelEnhanced;});
  });
  const sync=()=>gates.forEach(gate=>gate());
  window.addEventListener('portfolio:motion-state',sync,{signal:events.signal});
  document.addEventListener('visibilitychange',sync,{signal:events.signal});
  preference.addEventListener('change',sync,{signal:events.signal});
  const spatial=gsap.matchMedia();
  spatial.add({desktop:'(min-width:900px)',wide:'(min-width:1101px)',fine:'(hover:hover) and (pointer:fine)',motion:'(prefers-reduced-motion:no-preference)'},mediaContext=>{
    const {desktop,fine,motion}=mediaContext.conditions!;
    if(!desktop||!fine||!motion)return;
    const pointerEvents=new AbortController();
    const context=gsap.context(()=>{},document.body);
    const resets:(()=>void)[]=[];
    document.querySelectorAll<HTMLElement>('[data-framework-gallery],[data-dub-reel]').forEach(host=>{
      const region=host.querySelector<HTMLElement>('.framework-showcase__rack,.dub-factory')??host;
      const world=host.querySelector<HTMLElement>('[data-scene-world]');
      if(!world)return;
      const style=getComputedStyle(world);
      const restX=parseFloat(style.getPropertyValue('--scene-rest-x'))||0;
      const restY=parseFloat(style.getPropertyValue('--scene-rest-y'))||0;
      const restZ=parseFloat(style.getPropertyValue('--scene-rest-z'))||0;
      const originalPointer=host.dataset.scenePointer;
      let rx:ReturnType<typeof gsap.quickTo>,ry:ReturnType<typeof gsap.quickTo>;
      context.add(()=>{
        gsap.set(world,{rotationX:restX,rotationY:restY,rotationZ:restZ});
        rx=gsap.quickTo(world,'rotationX',{duration:.85,ease:'power3.out'});
        ry=gsap.quickTo(world,'rotationY',{duration:.85,ease:'power3.out'});
      });
      let bounds={left:0,top:0,width:1,height:1};
      const measure=()=>{const box=region.getBoundingClientRect();bounds={left:box.left+scrollX,top:box.top+scrollY,width:box.width,height:box.height};};
      const reset=()=>{
        host.dataset.scenePointer='0.000,0.000';rx(restX);ry(restY);
        if(document.hidden||root.dataset.motionPaused==='true'){rx.tween.progress(1).pause();ry.tween.progress(1).pause();}
      };
      measure();
      region.addEventListener('pointerenter',measure,{signal:pointerEvents.signal});
      region.addEventListener('pointermove',event=>{
        if(host.dataset.scenePlaying!=='true'||event.pointerType==='touch')return;
        const x=gsap.utils.clamp(-1,1,(event.pageX-bounds.left)/bounds.width*2-1),y=gsap.utils.clamp(-1,1,(event.pageY-bounds.top)/bounds.height*2-1);
        host.dataset.scenePointer=`${x.toFixed(3)},${y.toFixed(3)}`;
        // Rotate the entire assembly; depth alone produces relative parallax.
        rx(restX-y*2.5);ry(restY+x*3.5);
      },{passive:true,signal:pointerEvents.signal});
      region.addEventListener('pointerleave',reset,{signal:pointerEvents.signal});
      const stop=()=>{if(document.hidden||root.dataset.motionPaused==='true')reset();};
      window.addEventListener('portfolio:motion-state',stop,{signal:pointerEvents.signal});
      document.addEventListener('visibilitychange',stop,{signal:pointerEvents.signal});
      resets.push(()=>{if(originalPointer===undefined)delete host.dataset.scenePointer;else host.dataset.scenePointer=originalPointer;});
    });
    return()=>{pointerEvents.abort();context.revert();resets.forEach(reset=>reset());};
  });
  const dispose=()=>{
    if(disposed)return;disposed=true;events.abort();spatial.revert();cleanups.reverse().forEach(cleanup=>cleanup());gates.clear();signal.removeEventListener('abort',dispose);
  };
  signal.addEventListener('abort',dispose,{once:true});
  return dispose;
}
