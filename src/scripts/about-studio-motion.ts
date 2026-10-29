import { gsap } from 'gsap';

type Options = { signal: AbortSignal; preference: MediaQueryList };
type Quick = ReturnType<typeof gsap.quickTo>;

/** Each native project link keeps a stable hit frame around its moving print. */
export function setupAboutStudioMotion({ signal, preference }: Options): () => void {
  const page=document.querySelector<HTMLElement>('[data-about-studio],[data-studio-lost]');
  if(!page||signal.aborted)return()=>{};
  const root=document.documentElement,events=new AbortController(),media=gsap.matchMedia();
  const gates=new Set<()=>void>();
  const controls=Array.from(page.querySelectorAll<HTMLButtonElement>('[data-studio-motion-toggle]'));
  const savedControls=controls.map(button=>({button,hidden:button.hidden,disabled:button.disabled,pressed:button.getAttribute('aria-pressed'),label:button.getAttribute('aria-label'),text:button.querySelector('[data-studio-motion-label]')?.textContent??''}));
  const previousState=page.getAttribute('data-studio-motion-state');
  let paused=root.dataset.motionPaused==='true',disposed=false;
  const update=()=>{
    controls.forEach(button=>{
      button.hidden=false;button.disabled=preference.matches;
      button.setAttribute('aria-pressed',String(paused));
      button.setAttribute('aria-label',paused?'继续页面动态':'暂停页面动态');
      const label=button.querySelector<HTMLElement>('[data-studio-motion-label]');
      if(label)label.textContent=paused?'继续动态':'暂停动态';
    });
    page.dataset.studioMotionState=preference.matches?'reduced':paused?'paused':document.hidden?'hidden':'ready';
  };
  const sync=()=>{update();gates.forEach(gate=>gate());};
  controls.forEach(button=>button.addEventListener('click',()=>{
    paused=!paused;root.dataset.motionPaused=String(paused);sync();
    window.dispatchEvent(new CustomEvent('portfolio:motion-state',{detail:{paused}}));
  },{signal:events.signal}));
  window.addEventListener('portfolio:motion-state',event=>{
    const value=(event as CustomEvent<{paused?:unknown}>).detail?.paused;
    if(typeof value==='boolean')paused=value;
    sync();
  },{signal:events.signal});
  document.addEventListener('visibilitychange',sync,{signal:events.signal});
  window.addEventListener('focus',sync,{signal:events.signal});
  preference.addEventListener('change',sync,{signal:events.signal});
  update();

  media.add({motion:'(prefers-reduced-motion:no-preference)',fine:'(hover:hover) and (pointer:fine)',compact:'(max-width:600px)'},context=>{
    if(!context.conditions!.motion)return;
    const local=new AbortController(),observers:(ResizeObserver|IntersectionObserver)[]=[],ownedGates:(()=>void)[]=[];
    const groups:{region:HTMLElement;tweens:Quick[];active:()=>boolean;focused:()=>boolean;park:(immediate?:boolean)=>void}[]=[];
    const measures:(()=>void)[]=[];
    let held=false,frame=0;
    const addGate=(gate:()=>void)=>{gates.add(gate);ownedGates.push(gate);};
    const allowed=()=>!disposed&&!held&&!paused&&!document.hidden&&!preference.matches;
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>measures.forEach(measure=>measure()));};

    const field=page.querySelector<HTMLElement>('[data-studio-field]');
    if(field&&context.conditions!.fine){
      let visible=false;
      const x=gsap.quickTo(field,'x',{duration:1.2,ease:'power3.out'}),y=gsap.quickTo(field,'y',{duration:1.2,ease:'power3.out'});
      const park=(immediate=false)=>[x,y].forEach(to=>{to(0);if(immediate)to.tween.progress(1).pause();});
      const active=()=>visible&&allowed();
      const gate=()=>{if(!visible||paused||document.hidden)park(true);};addGate(gate);
      const view=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;gate();});view.observe(page);observers.push(view);
      page.addEventListener('pointermove',event=>{
        if(!active()||event.pointerType==='touch')return;
        const nx=gsap.utils.clamp(-1,1,event.clientX/Math.max(1,window.innerWidth)*2-1);
        const ny=gsap.utils.clamp(-1,1,event.clientY/Math.max(1,window.innerHeight)*2-1);
        x(-nx*12);y(-ny*8);
      },{passive:true,signal:local.signal});
      page.addEventListener('pointerleave',()=>{if(!held)park();},{signal:local.signal});
      groups.push({region:page,tweens:[x,y],active,focused:()=>false,park});
    }

    page.querySelectorAll<HTMLElement>('[data-studio-region]').forEach(region=>{
      const plane=region.querySelector<HTMLElement>('[data-studio-plane]');
      if(!plane)return;
      const camera=plane.closest<HTMLElement>('.studio-camera,.studio-lost__camera');
      if(!camera)return;
      let visible=false,focused=region.contains(document.activeElement);
      let bounds={left:0,top:0,width:1,height:1};
      let geometry={left:0,width:1,height:1,perspective:1800,viewport:1};
      const css=getComputedStyle(plane);
      const restX=parseFloat(css.getPropertyValue('--studio-rest-x'))||0,restY=parseFloat(css.getPropertyValue('--studio-rest-y'))||0,restZ=parseFloat(css.getPropertyValue('--studio-rest-z'))||0;
      const x=gsap.quickTo(plane,'x',{duration:.8,ease:'power3.out'}),y=gsap.quickTo(plane,'y',{duration:.8,ease:'power3.out'});
      const rx=gsap.quickTo(plane,'rotationX',{duration:.85,ease:'power3.out'}),ry=gsap.quickTo(plane,'rotationY',{duration:.85,ease:'power3.out'});
      const glint=plane.querySelector<HTMLElement>('[data-studio-glint]');
      const gx=glint?gsap.quickTo(glint,'x',{duration:.8,ease:'power3.out'}):undefined;
      const gy=glint?gsap.quickTo(glint,'y',{duration:.8,ease:'power3.out'}):undefined;
      const tweens=[x,y,rx,ry,...[gx,gy].filter((to):to is Quick=>Boolean(to))];
      const measure=()=>{
        const box=region.getBoundingClientRect(),frame=camera.getBoundingClientRect();
        bounds={left:box.left+scrollX,top:box.top+scrollY,width:box.width,height:box.height};
        geometry={left:frame.left+plane.offsetLeft,width:plane.offsetWidth,height:plane.offsetHeight,perspective:parseFloat(getComputedStyle(camera).perspective)||1800,viewport:document.documentElement.clientWidth};
      };measures.push(measure);
      const limit=(ax:number,ay:number,tx:number)=>{
        const fits=(strength:number)=>{
          const a=ax*strength*Math.PI/180,b=ay*strength*Math.PI/180,z=restZ*Math.PI/180;
          return[-1,1].every(sx=>[-1,1].every(sy=>{
            const px=sx*geometry.width/2,py=sy*geometry.height/2,y1=py*Math.cos(a),z1=py*Math.sin(a);
            const x2=px*Math.cos(b)+z1*Math.sin(b),z2=-px*Math.sin(b)+z1*Math.cos(b);
            const screen=geometry.left+geometry.width/2+(x2*Math.cos(z)-y1*Math.sin(z)+tx*strength)/(1-z2/geometry.perspective);
            return screen>=8&&screen<=geometry.viewport-8;
          }));
        };
        if(fits(1))return 1;
        let low=0,high=1;for(let i=0;i<8;i++){const mid=(low+high)/2;if(fits(mid))low=mid;else high=mid;}return low;
      };
      const active=()=>visible&&allowed();
      const apply=(nx:number,ny:number)=>{
        if(!active())return;
        const ax=restX-ny*5,ay=restY+nx*8,tx=nx*4,strength=limit(ax,ay,tx);
        x(tx*strength);y(ny*3*strength);rx(ax*strength);ry(ay*strength);gx?.(nx*3);gy?.(-ny*2);
        region.dataset.studioPointer=`${nx.toFixed(3)},${ny.toFixed(3)}`;
      };
      const park=(immediate=false)=>{
        const strength=limit(restX,restY,0);
        x(0);y(0);rx(restX*strength);ry(restY*strength);gx?.(0);gy?.(0);
        if(immediate)tweens.forEach(to=>to.tween.progress(1).pause());
        region.dataset.studioPointer='0.000,0.000';
      };
      const gate=()=>{if(!visible||paused||document.hidden)park(true);else if(focused&&!held)apply(.25,-.2);};addGate(gate);
      const view=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;gate();});view.observe(region);observers.push(view);
      const size=new ResizeObserver(schedule);size.observe(camera);size.observe(plane);observers.push(size);
      region.addEventListener('pointerenter',measure,{signal:local.signal});
      region.addEventListener('pointermove',event=>{
        if(!context.conditions!.fine||!active()||event.pointerType==='touch')return;
        const nx=gsap.utils.clamp(-1,1,(event.pageX-bounds.left)/Math.max(1,bounds.width)*2-1),ny=gsap.utils.clamp(-1,1,(event.pageY-bounds.top)/Math.max(1,bounds.height)*2-1);
        apply(nx,ny);
      },{passive:true,signal:local.signal});
      region.addEventListener('focusin',()=>{focused=true;apply(.25,-.2);},{signal:local.signal});
      region.addEventListener('focusout',event=>{if(event.relatedTarget instanceof Node&&region.contains(event.relatedTarget))return;focused=false;if(!held)park();},{signal:local.signal});
      region.addEventListener('pointerleave',()=>{if(!held){if(focused)apply(.25,-.2);else park();}},{signal:local.signal});
      groups.push({region,tweens,active,focused:()=>focused,park});
      context.add(()=>()=>{delete region.dataset.studioPointer;});
    });
    measures.forEach(measure=>measure());groups.forEach(group=>group.park(true));
    window.addEventListener('resize',schedule,{signal:local.signal});
    page.addEventListener('pointerdown',event=>{
      if(!event.isPrimary||event.button!==0)return;
      held=true;groups.forEach(group=>group.tweens.forEach(to=>to.tween.pause()));
    },{signal:local.signal});
    const release=()=>{
      const wasHeld=held;held=false;
      groups.forEach(group=>{
        if(!group.region.matches(':hover')&&!group.focused())group.park();
        else if(wasHeld&&group.active())group.tweens.forEach(to=>{if(to.tween.progress()<1)to.tween.resume();});
      });
    };
    window.addEventListener('pointerup',release,{signal:local.signal});window.addEventListener('pointercancel',release,{signal:local.signal});
    window.addEventListener('blur',()=>{held=false;groups.forEach(group=>group.park(true));},{signal:local.signal});
    const hidden=()=>{if(document.hidden)held=false;};document.addEventListener('visibilitychange',hidden,{signal:local.signal});
    return()=>{held=false;local.abort();cancelAnimationFrame(frame);observers.forEach(observer=>observer.disconnect());ownedGates.forEach(gate=>gates.delete(gate));};
  });
  const dispose=()=>{
    if(disposed)return;disposed=true;events.abort();media.revert();gates.clear();
    if(previousState===null)delete page.dataset.studioMotionState;else page.setAttribute('data-studio-motion-state',previousState);
    savedControls.forEach(({button,hidden,disabled,pressed,label,text})=>{button.hidden=hidden;button.disabled=disabled;if(pressed===null)button.removeAttribute('aria-pressed');else button.setAttribute('aria-pressed',pressed);if(label===null)button.removeAttribute('aria-label');else button.setAttribute('aria-label',label);const node=button.querySelector('[data-studio-motion-label]');if(node)node.textContent=text;});
    signal.removeEventListener('abort',dispose);
  };
  signal.addEventListener('abort',dispose,{once:true});return dispose;
}
