import { gsap } from 'gsap';

type Options = { signal: AbortSignal; preference: MediaQueryList };
type Running = gsap.core.Timeline | undefined;

/** Two authored machines, with real project pictures and ordinary gallery links. */
export function setupShowcaseNarratives({ signal, preference }: Options): () => void {
  if(signal.aborted)return()=>{};
  const events = new AbortController();
  const root = document.documentElement;
  const cleanups: (() => void)[] = [];
  const gates = new Set<() => void>();
  let disposed = false;
  const scene = (element: HTMLElement, getTimeline: () => Running, onGate?: (playing:boolean) => void) => {
    let visible = false;
    let held = false;
    const gate = () => {
      const playing = visible && !held && !document.hidden && !preference.matches && root.dataset.motionPaused !== 'true';
      element.dataset.scenePlaying = String(playing);
      const timeline = getTimeline();
      if (preference.matches) timeline?.progress(1).pause();
      else timeline?.paused(!playing);
      onGate?.(playing);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; gate(); }, { threshold: .05 });
    observer.observe(element); gates.add(gate);
    element.addEventListener('pointerdown',event=>{if(event.isPrimary&&event.button===0){held=true;gate();}},{signal:events.signal});
    const release=()=>{held=false;gate();};
    window.addEventListener('pointerup',release,{signal:events.signal});
    window.addEventListener('pointercancel',release,{signal:events.signal});
    window.addEventListener('blur',release,{signal:events.signal});
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
      host.dispatchEvent(new CustomEvent('portfolio:scene-select'));
    };
    const bind = (select: (value:string) => void) => buttons.forEach(button => {
      button.disabled=false;
      const activate=() => select(button.getAttribute(buttonHook)??'0');
      button.addEventListener('click',activate,{signal:events.signal});
      button.addEventListener('focusin',activate,{signal:events.signal});
      button.addEventListener('pointermove',event=>{if((event.movementX||event.movementY)&&event.pointerType!=='touch'&&matchMedia('(hover:hover) and (pointer:fine)').matches)activate();},{signal:events.signal});
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
    const cameras=Array.from(factory.querySelectorAll<HTMLElement>('[data-reel-camera],[data-reel-console]'));
    const carrier=factory.querySelector<SVGGElement>('[data-factory-carrier]');
    const carrierLabel=factory.querySelector<SVGTextElement>('[data-factory-carrier-label]');
    const stations=Array.from(factory.querySelectorAll<SVGGElement>('[data-factory-station]'));
    const belts=Array.from(factory.querySelectorAll<SVGGElement>('[data-factory-belt-motion]'));
    const rollers=Array.from(factory.querySelectorAll<SVGGElement>('.factory-roller-spokes'));
    const restoreFeedback=snapshots(cameras);
    const restoreTransport=snapshots([...(carrier?[carrier]:[]),...belts,...rollers]);
    const sequenceOriginals=[...stations,...buttons].map(element=>({element,value:element.getAttribute('data-sequence-state')}));
    const labelOriginal=carrierLabel?.textContent??'';
    const metadata=['data-reel-target','data-reel-direction','data-reel-traveling','data-reel-moving','data-reel-transport','data-reel-carrier-x'].map(name=>({name,value:factory.getAttribute(name)}));
    const stationX=(index:number)=>Number(stations.find(station=>Number(station.dataset.factoryStation)===index)?.dataset.stationX??100+104*index);
    const origin=stationX(0),pose={x:origin};
    let targetX=origin;
    let timeline:Running;
    let current='0';
    const render=()=>{
      // SVG attributes update the source assembly, including its mobile <use>.
      // Every moving part is derived from one position, with no independent loop.
      carrier?.setAttribute('transform',`translate(${pose.x.toFixed(3)} 0)`);
      const distance=pose.x-origin;
      belts.forEach(belt=>belt.setAttribute('transform',`translate(${(distance%112).toFixed(3)} 0)`));
      rollers.forEach(roller=>roller.setAttribute('transform',`rotate(${(distance/31*180/Math.PI).toFixed(3)})`));
    };
    const gate=scene(factory,()=>timeline,playing=>{
      const traveling=Math.abs(targetX-pose.x)>.1;
      factory.dataset.reelTraveling=String(traveling);
      factory.dataset.reelMoving=String(traveling&&playing);
      factory.dataset.reelTransport=preference.matches?'reduced':traveling?(playing?'moving':'paused'):'rest';
    });
    const arrive=()=>{
      pose.x=targetX;render();
      factory.dataset.reelCarrierX=pose.x.toFixed(3);
      factory.dataset.reelTraveling='false';factory.dataset.reelMoving='false';
      factory.dataset.reelTransport=preference.matches?'reduced':'rest';
    };
    const move=(value:string,animate=true)=>{
      if(!pictures.some(p=>p.dataset.reelFrame===value)||value===current&&animate)return;
      timeline?.kill();timeline=undefined;
      // Only picture feedback resets. pose.x stays at the latest rendered
      // position, so rapidly changing a target never teleports the carrier.
      restoreFeedback();mark(value);current=value;targetX=stationX(Number(value));
      const direction=targetX>=pose.x?1:-1;
      const distance=Math.abs(targetX-pose.x);
      [...stations,...buttons].forEach(element=>{
        const index=Number(element.getAttribute(element.hasAttribute('data-factory-station')?'data-factory-station':'data-reel-select'));
        element.dataset.sequenceState=index<Number(value)?'earlier':index===Number(value)?'current':'later';
      });
      if(carrierLabel)carrierLabel.textContent=String(Number(value)+1).padStart(2,'0');
      factory.dataset.reelTarget=value;
      factory.dataset.reelDirection=distance<.1?'still':direction>0?'forward':'backward';
      factory.dataset.reelCarrierX=pose.x.toFixed(3);
      if(!animate||preference.matches||root.dataset.motionPaused==='true'){arrive();gate();return;}
      const frame=pictures.find(p=>p.dataset.reelFrame===value);
      const camera=frame?.querySelector<HTMLElement>('[data-reel-camera]');
      const consolePanel=frame?.querySelector<HTMLElement>('[data-reel-console]');
      timeline=gsap.timeline({paused:true,defaults:{ease:'power3.out'},onComplete:arrive});
      timeline.to(pose,{x:targetX,duration:gsap.utils.clamp(.35,1.2,.28+distance/1000),onUpdate:render},0);
      if(camera)timeline.fromTo(camera,{opacity:.72},{opacity:1,duration:.32,clearProps:'opacity'},0);
      if(consolePanel)timeline.fromTo(consolePanel,{opacity:.65},{opacity:1,duration:.3,clearProps:'opacity'},.04);
      gate();
    };
    factory.dataset.reelEnhanced='true';bind(value=>move(value));move('0',false);
    cleanups.push(()=>{
      timeline?.kill();restoreFeedback();restoreTransport();delete factory.dataset.reelEnhanced;
      sequenceOriginals.forEach(({element,value})=>{if(value===null)element.removeAttribute('data-sequence-state');else element.setAttribute('data-sequence-state',value);});
      metadata.forEach(({name,value})=>{if(value===null)factory.removeAttribute(name);else factory.setAttribute(name,value);});
      if(carrierLabel)carrierLabel.textContent=labelOriginal;
    });
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
      let restX=0,restY=0,restZ=0,held=false,visible=false;
      const readPose=()=>{
        const style=getComputedStyle(world);
        restX=parseFloat(style.getPropertyValue('--scene-rest-x'))||0;
        restY=parseFloat(style.getPropertyValue('--scene-rest-y'))||0;
        restZ=parseFloat(style.getPropertyValue('--scene-rest-z'))||0;
      };
      readPose();
      const originalPointer=host.dataset.scenePointer;
      let rx:ReturnType<typeof gsap.quickTo>,ry:ReturnType<typeof gsap.quickTo>;
      let lightX:ReturnType<typeof gsap.quickTo>,lightY:ReturnType<typeof gsap.quickTo>,shine:ReturnType<typeof gsap.quickTo>;
      context.add(()=>{
        gsap.set(world,{rotationX:restX,rotationY:restY,rotationZ:restZ});
        rx=gsap.quickTo(world,'rotationX',{duration:.85,ease:'power3.out'});
        ry=gsap.quickTo(world,'rotationY',{duration:.85,ease:'power3.out'});
        lightX=gsap.quickTo(world,'--material-light-x',{duration:.8,ease:'power3.out'});
        lightY=gsap.quickTo(world,'--material-light-y',{duration:.8,ease:'power3.out'});
        shine=gsap.quickTo(world,'--material-shine',{duration:.8,ease:'power3.out'});
      });
      let bounds={left:0,top:0,width:1,height:1};
      let camera={left:0,originX:0,originY:0,worldX:0,worldY:0,width:1,height:1,perspective:1450,viewport:1};
      let photos:{left:number;top:number;width:number;height:number;depth:number}[]=[];
      const measure=()=>{
        const box=region.getBoundingClientRect(),style=getComputedStyle(region);
        const origin=style.perspectiveOrigin.split(' ').map(parseFloat);
        bounds={left:box.left+scrollX,top:box.top+scrollY,width:box.width,height:box.height};
        camera={left:box.left,originX:origin[0]||box.width/2,originY:origin[1]||box.height/2,worldX:world.offsetLeft,worldY:world.offsetTop,width:world.offsetWidth,height:world.offsetHeight,perspective:parseFloat(style.perspective)||1450,viewport:document.documentElement.clientWidth};
        photos=Array.from(world.querySelectorAll<HTMLElement>('.media-link')).filter(photo=>!photo.closest('[hidden]')).map(photo=>{
          let left=0,top=0,depth=0;
          for(let node:HTMLElement|null=photo;node&&node!==world;node=node.offsetParent as HTMLElement|null){left+=node.offsetLeft;top+=node.offsetTop;}
          for(let node:HTMLElement|null=photo;node&&node!==world;node=node.parentElement){
            const transform=getComputedStyle(node).transform;
            if(transform!=='none')depth+=new DOMMatrixReadOnly(transform).m43;
          }
          return{left,top,width:photo.offsetWidth,height:photo.offsetHeight,depth};
        });
      };
      const tweens=()=>[rx,ry,lightX,lightY,shine];
      const reset=(immediate=false)=>{
        host.dataset.scenePointer='0.000,0.000';rx(restX);ry(restY);lightX(0);lightY(0);shine(.58);
        if(immediate)tweens().forEach(to=>to.tween.progress(1).pause());
      };
      const active=()=>visible&&host.dataset.scenePlaying==='true'&&!document.hidden&&root.dataset.motionPaused!=='true';
      measure();
      const size=new ResizeObserver(measure);size.observe(region);size.observe(world);
      world.querySelectorAll<HTMLElement>('.media-link').forEach(photo=>size.observe(photo));
      const view=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(!visible)reset(true);});view.observe(region);
      resets.push(()=>{size.disconnect();view.disconnect();});
      window.addEventListener('resize',()=>{readPose();measure();reset(true);},{signal:pointerEvents.signal});
      region.addEventListener('pointerenter',measure,{signal:pointerEvents.signal});
      // Refresh the cached real-image corners for click, focus and hover
      // selection alike, before the next pointer frame uses the camera.
      host.addEventListener('portfolio:scene-select',measure,{signal:pointerEvents.signal});
      region.addEventListener('pointermove',event=>{
        if(held||!active()||event.pointerType==='touch')return;
        const x=gsap.utils.clamp(-1,1,(event.pageX-bounds.left)/Math.max(1,bounds.width)*2-1),y=gsap.utils.clamp(-1,1,(event.pageY-bounds.top)/Math.max(1,bounds.height)*2-1);
        const ax=restX-y*3,ay=restY+x*4.5;
        const fits=(strength:number)=>{
          const a=ax*strength*Math.PI/180,b=ay*strength*Math.PI/180,z=restZ*Math.PI/180;
          return photos.every(photo=>[-1,1].every(sx=>[-1,1].every(sy=>{
            const px=photo.left+photo.width/2+sx*photo.width/2-camera.width/2;
            const py=photo.top+photo.height/2+sy*photo.height/2-camera.height/2;
            const y1=py*Math.cos(a)-photo.depth*Math.sin(a),z1=py*Math.sin(a)+photo.depth*Math.cos(a);
            const x2=px*Math.cos(b)+z1*Math.sin(b),z2=-px*Math.sin(b)+z1*Math.cos(b);
            const x3=x2*Math.cos(z)-y1*Math.sin(z),absolute=camera.worldX+camera.width/2+x3;
            const screen=camera.left+camera.originX+(absolute-camera.originX)/(1-z2/camera.perspective);
            return screen>=8&&screen<=camera.viewport-8;
          })));
        };
        let strength=1;
        if(!fits(1)){let low=0,high=1;for(let i=0;i<8;i++){const mid=(low+high)/2;if(fits(mid))low=mid;else high=mid;}strength=low;}
        host.dataset.scenePointer=`${x.toFixed(3)},${y.toFixed(3)}`;
        // One camera rotates the full machine, including its front hardware.
        rx(ax*strength);ry(ay*strength);lightX(x*3);lightY(-y*2);shine(.58+(x-y)*.12);
      },{passive:true,signal:pointerEvents.signal});
      region.addEventListener('pointerdown',event=>{if(event.isPrimary&&event.button===0){held=true;tweens().forEach(to=>to.tween.pause());}},{signal:pointerEvents.signal});
      const release=()=>{const wasHeld=held;held=false;if(!region.matches(':hover'))reset();else if(wasHeld&&active())tweens().forEach(to=>{if(to.tween.progress()<1)to.tween.resume();});};
      window.addEventListener('pointerup',release,{signal:pointerEvents.signal});
      window.addEventListener('pointercancel',release,{signal:pointerEvents.signal});
      window.addEventListener('blur',()=>{held=false;reset(true);},{signal:pointerEvents.signal});
      region.addEventListener('pointerleave',()=>{if(!held)reset();},{signal:pointerEvents.signal});
      const stop=()=>{if(document.hidden||root.dataset.motionPaused==='true')reset(true);};
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
