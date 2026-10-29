import { gsap } from 'gsap';

type Options = { signal: AbortSignal; preference: MediaQueryList };
type Point = { x: number; y: number };

/** Real outgoing links stay native. Only the annotation ink and route cursors move. */
export function setupProjectEnding({ signal, preference }: Options): () => void {
  if (signal.aborted) return () => {};
  const events = new AbortController();
  const media = gsap.matchMedia();
  const root = document.documentElement;
  const observers: (ResizeObserver | IntersectionObserver)[] = [];
  const cleanups: (() => void)[] = [];
  const gates = new Set<() => void>();
  let disposed = false;
  const resync = () => gates.forEach(gate => gate());
  const paused = () => root.dataset.motionPaused === 'true';
  window.addEventListener('portfolio:motion-state', resync, { signal:events.signal });
  window.addEventListener('focus', resync, { signal:events.signal });
  document.addEventListener('visibilitychange', resync, { signal:events.signal });

  document.querySelectorAll<HTMLElement>('[data-project-postscript]').forEach(note => {
    const ink = note.querySelector<HTMLElement>('[data-postscript-ink]');
    if (!ink) return;
    let visible = false, held = false;
    let bounds = { left:0, top:0, width:1, height:1 };
    const measure = () => { const box=note.getBoundingClientRect();bounds={left:box.left+scrollX,top:box.top+scrollY,width:box.width,height:box.height}; };
    const size = new ResizeObserver(measure); size.observe(note); observers.push(size);
    const view = new IntersectionObserver(([entry]) => { visible=entry.isIntersecting;resync(); }); view.observe(note); observers.push(view);
    measure();
    note.addEventListener('pointerenter',measure,{signal:events.signal});
    media.add({ motion:'(prefers-reduced-motion:no-preference)', fine:'(hover:hover) and (pointer:fine)' }, context => {
      if (!context.conditions!.motion || !context.conditions!.fine) return;
      const local = new AbortController();
      const xTo=gsap.quickTo(ink,'x',{duration:.9,ease:'power3.out'}),yTo=gsap.quickTo(ink,'y',{duration:.9,ease:'power3.out'});
      const tweens=[xTo,yTo];
      const active=()=>visible&&!held&&!paused()&&!document.hidden&&!preference.matches;
      const reset=(immediate=false)=>{xTo(0);yTo(0);if(immediate)tweens.forEach(to=>to.tween.progress(1).pause());};
      const gate=()=>{if(document.hidden)held=false;if(!visible||paused()||document.hidden)reset(true);};gates.add(gate);
      note.addEventListener('pointermove',event=>{
        if(!active()||event.pointerType==='touch')return;
        const x=gsap.utils.clamp(-1,1,(event.pageX-bounds.left)/Math.max(1,bounds.width)*2-1);
        const y=gsap.utils.clamp(-1,1,(event.pageY-bounds.top)/Math.max(1,bounds.height)*2-1);
        xTo(x*7);yTo(y*5);
      },{passive:true,signal:local.signal});
      note.addEventListener('pointerdown',event=>{if(event.isPrimary&&event.button===0){held=true;tweens.forEach(to=>to.tween.pause());}},{signal:local.signal});
      const release=()=>{const wasHeld=held;held=false;if(!note.matches(':hover'))reset();else if(wasHeld&&active())tweens.forEach(to=>{if(to.tween.progress()<1)to.tween.resume();});};
      window.addEventListener('pointerup',release,{signal:local.signal});
      window.addEventListener('pointercancel',release,{signal:local.signal});
      window.addEventListener('blur',()=>{held=false;reset(true);},{signal:local.signal});
      note.addEventListener('pointerleave',()=>{if(!held)reset();},{signal:local.signal});
      return()=>{held=false;local.abort();gates.delete(gate);};
    });
  });

  document.querySelectorAll<HTMLElement>('[data-project-continuation]').forEach(section => {
    const board=section.querySelector<HTMLElement>('[data-continuation-board]');
    const origin=section.querySelector<HTMLElement>('[data-continuation-origin]');
    const wires=section.querySelector<SVGSVGElement>('[data-continuation-wires]');
    const nodes=Array.from(section.querySelectorAll<HTMLElement>('[data-continuation-node]'));
    const paths=Array.from(section.querySelectorAll<SVGPathElement>('[data-continuation-path]'));
    const runners=Array.from(section.querySelectorAll<SVGCircleElement>('[data-continuation-runner]'));
    if(!board||!origin||!wires||nodes.length!==paths.length)return;
    let visible=false,held=false,selected=-1,frame=0;
    let samples: Point[][] = [];
    let bounds=nodes.map(()=>({left:0,top:0,width:1,height:1}));
    const previousReady=section.dataset.pathmapReady;
    const originalPaths=paths.map(path=>path.getAttribute('d'));
    const originalViewBox=wires.getAttribute('viewBox');
    let trace: (index:number) => void = () => {};
    const measure=()=>{
      if(disposed)return;
      // Read all layout once, then author the curves and cache their samples.
      // Pointer handlers only interpolate these numbers; they never read layout.
      const box=board.getBoundingClientRect(),start=origin.getBoundingClientRect();
      const pins=nodes.map(node=>node.querySelector<HTMLElement>('[data-continuation-pin]')!.getBoundingClientRect());
      bounds=nodes.map(node=>{const b=node.getBoundingClientRect();return{left:b.left+scrollX,top:b.top+scrollY,width:b.width,height:b.height};});
      const ox=start.left+start.width/2-box.left,oy=start.top+start.height/2-box.top;
      const phone=window.innerWidth<=900;
      wires.setAttribute('viewBox',`0 0 ${Math.max(1,box.width)} ${Math.max(1,box.height)}`);
      paths.forEach((path,index)=>{
        const pin=pins[index],tx=pin.left+pin.width/2-box.left,ty=pin.top+pin.height/2-box.top;
        const reach=Math.max(32,Math.min(100,(ty-oy)*.42));
        let d=`M${ox} ${oy}C${ox} ${oy+reach} ${tx} ${ty-reach} ${tx} ${ty}`;
        if(phone)d=`M${ox} ${oy}L${ox} ${Math.max(oy,ty-22)}Q${ox} ${ty} ${tx} ${ty}`;
        else if(index===2){const corridor=box.width*.63,bend=Math.max(oy+100,ty-80);d=`M${ox} ${oy}C${ox} ${oy+50} ${corridor} ${oy+35} ${corridor} ${oy+100}L${corridor} ${bend}C${corridor} ${ty-15} ${tx} ${ty-70} ${tx} ${ty}`;}
        path.setAttribute('d',d);
      });
      samples=paths.map(path=>{
        const length=path.getTotalLength();
        return Array.from({length:97},(_,i)=>{const point=path.getPointAtLength(length*i/96);return{x:point.x,y:point.y};});
      });
      section.dataset.pathmapReady='true';
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};
    const size=new ResizeObserver(schedule);size.observe(board);nodes.forEach(node=>size.observe(node));observers.push(size);
    const view=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;resync();});view.observe(section);observers.push(view);
    window.addEventListener('resize',schedule,{signal:events.signal});
    section.addEventListener('pointerenter',schedule,{signal:events.signal});
    measure();
    const activate=(index:number)=>{
      if(selected===index)return;
      selected=index;
      nodes.forEach((node,i)=>node.dataset.branchActive=String(i===index));
      paths.forEach((path,i)=>path.dataset.branchActive=String(i===index));
      section.dataset.activeBranch=String(index);
      trace(index);
    };
    nodes.forEach((node,index)=>{
      node.addEventListener('pointermove',event=>{if(!held&&event.pointerType!=='touch'&&(event.movementX||event.movementY))activate(index);},{passive:true,signal:events.signal});
      node.addEventListener('focusin',()=>activate(index),{signal:events.signal});
    });
    media.add({motion:'(prefers-reduced-motion:no-preference)',fine:'(hover:hover) and (pointer:fine)',wide:'(min-width:761px)'},context=>{
      if(!context.conditions!.motion)return;
      const local=new AbortController();
      const feedback=gsap.context(()=>{},section);
      let flight:gsap.core.Tween|undefined;
      let queuedTrace=-1;
      const flow={progress:0};
      const setX=runners.map(runner=>gsap.quickSetter(runner,'x','px'));
      const setY=runners.map(runner=>gsap.quickSetter(runner,'y','px'));
      const photos=context.conditions!.fine&&context.conditions!.wide?nodes.map(node=>{
        const photo=node.querySelector<HTMLElement>('[data-continuation-photo]')!;
        return{x:gsap.quickTo(photo,'x',{duration:.85,ease:'power3.out'}),y:gsap.quickTo(photo,'y',{duration:.85,ease:'power3.out'})};
      }):[];
      const active=()=>visible&&!held&&!paused()&&!document.hidden&&!preference.matches;
      const resetPhotos=(immediate=false)=>photos.forEach(photo=>[photo.x,photo.y].forEach(to=>{to(0);if(immediate)to.tween.progress(1).pause();}));
      const gate=()=>{
        if(document.hidden)held=false;
        if(active()&&queuedTrace>=0)trace(queuedTrace);
        flight?.paused(!active());
        if(!visible||paused()||document.hidden)resetPhotos(true);
      };gates.add(gate);
      trace=index=>{
        queuedTrace=index;feedback.revert();flight=undefined;flow.progress=0;
        if(!active())return;
        queuedTrace=-1;
        feedback.add(()=>{
          const start=samples[index]?.[0]??{x:0,y:0};
          gsap.set(runners[index],{x:start.x,y:start.y,opacity:.95});
          flight=gsap.to(flow,{progress:1,duration:1.15,ease:'power2.inOut',onUpdate:()=>{
            const points=samples[index];if(!points?.length)return;
            const position=flow.progress*(points.length-1),a=Math.floor(position),b=Math.min(a+1,points.length-1),t=position-a;
            setX[index](points[a].x+(points[b].x-points[a].x)*t);
            setY[index](points[a].y+(points[b].y-points[a].y)*t);
          }});
        });
      };
      nodes.forEach((node,index)=>{
        node.addEventListener('pointermove',event=>{
          if(!photos[index]||!active()||event.pointerType==='touch')return;
          const box=bounds[index];
          const x=gsap.utils.clamp(-1,1,(event.pageX-box.left)/Math.max(1,box.width)*2-1);
          const y=gsap.utils.clamp(-1,1,(event.pageY-box.top)/Math.max(1,box.height)*2-1);
          photos[index].x(x*5);photos[index].y(y*4);
        },{passive:true,signal:local.signal});
        node.addEventListener('pointerleave',()=>{if(!held&&photos[index]){photos[index].x(0);photos[index].y(0);}},{signal:local.signal});
      });
      section.addEventListener('pointerdown',event=>{
        if(!event.isPrimary||event.button!==0)return;
        held=true;flight?.pause();photos.forEach(photo=>[photo.x,photo.y].forEach(to=>to.tween.pause()));
      },{signal:local.signal});
      const release=()=>{
        const wasHeld=held;held=false;
        if(!section.matches(':hover'))resetPhotos();
        else if(wasHeld&&active())photos.forEach(photo=>[photo.x,photo.y].forEach(to=>{if(to.tween.progress()<1)to.tween.resume();}));
        gate();
      };
      window.addEventListener('pointerup',release,{signal:local.signal});
      window.addEventListener('pointercancel',release,{signal:local.signal});
      window.addEventListener('blur',()=>{held=false;resetPhotos(true);flight?.pause();},{signal:local.signal});
      return()=>{held=false;local.abort();feedback.revert();gates.delete(gate);trace=()=>{};};
    });
    cleanups.push(()=>{
      cancelAnimationFrame(frame);
      if(previousReady===undefined)delete section.dataset.pathmapReady;else section.dataset.pathmapReady=previousReady;
      if(originalViewBox===null)wires.removeAttribute('viewBox');else wires.setAttribute('viewBox',originalViewBox);
      paths.forEach((path,index)=>{const d=originalPaths[index];if(d===null)path.removeAttribute('d');else path.setAttribute('d',d);delete path.dataset.branchActive;});
      nodes.forEach(node=>delete node.dataset.branchActive);delete section.dataset.activeBranch;
    });
  });

  const dispose=()=>{
    if(disposed)return;disposed=true;events.abort();media.revert();observers.forEach(observer=>observer.disconnect());cleanups.forEach(cleanup=>cleanup());gates.clear();signal.removeEventListener('abort',dispose);
  };
  signal.addEventListener('abort',dispose,{once:true});
  return dispose;
}
