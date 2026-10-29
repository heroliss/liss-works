import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

type Options = { signal: AbortSignal; preference: MediaQueryList };
type Kind = 'nodes' | 'pipeline' | 'orbit' | 'bars' | 'route' | 'glyph' | 'reading' | 'focus' | 'blocks' | 'tree' | 'map' | 'light';

const rhythm = (kind: Kind) => {
  if (['nodes', 'pipeline', 'route', 'tree', 'map'].includes(kind)) return { travel: 1.7, gap: 0.52, rest: 0.8, breath: 1.5, rotation: 0 };
  if (['orbit', 'focus', 'light'].includes(kind)) return { travel: 3.2, gap: 0.75, rest: 1.6, breath: 2.8, rotation: 38 };
  if (kind === 'reading') return { travel: 3.8, gap: 1, rest: 2.2, breath: 3.4, rotation: 0 };
  return { travel: 1.1, gap: 0.26, rest: 1.3, breath: 1.1, rotation: 0 };
};

/** Decorative geometry stays outside the real artifact and shares its controls. */
export function setupDetailWorldMotion({ signal, preference }: Options): () => void {
  if (signal.aborted) return () => {};
  const figures = Array.from(document.querySelectorAll<HTMLElement>('[data-detail-motion]'));
  if (!figures.length) return () => {};
  const root = document.documentElement;
  const previousPause = root.getAttribute('data-motion-paused');
  const controller = new AbortController();
  const media = gsap.matchMedia();
  const gates = new Set<() => void>();
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-detail-motion-toggle]'));
  const originals = buttons.map((button) => ({
    button, pressed: button.getAttribute('aria-pressed'), label: button.getAttribute('aria-label'), disabled: button.disabled,
    text: button.querySelector<HTMLElement>('[data-detail-motion-label]')?.textContent ?? '',
  }));
  let paused = root.dataset.motionPaused === 'true' || buttons.some((button) => button.getAttribute('aria-pressed') === 'true');
  let disposed = false;
  const sync = () => gates.forEach((gate) => gate());
  const updateButtons = () => {
    root.dataset.motionPaused = String(paused);
    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(paused));
      button.setAttribute('aria-label', paused ? '继续页面动态' : '暂停页面动态');
      button.disabled = preference.matches;
      const label = button.querySelector<HTMLElement>('[data-detail-motion-label]');
      if (label) label.textContent = paused ? '继续动态' : '暂停动态';
    });
  };
  buttons.forEach((button) => button.addEventListener('click', () => {
    paused = !paused;
    updateButtons();
    sync();
    window.dispatchEvent(new CustomEvent('portfolio:motion-state', { detail: { paused } }));
  }, { signal: controller.signal }));
  window.addEventListener('portfolio:motion-state', (event) => {
    const value = (event as CustomEvent<{ paused?: unknown }>).detail?.paused;
    if (typeof value !== 'boolean') return;
    paused = value;
    updateButtons();
    sync();
  }, { signal: controller.signal });
  document.addEventListener('visibilitychange', sync, { signal: controller.signal });
  updateButtons();

  const chapterLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.project-contents a[href^="#"]'));
  const chapters = chapterLinks.map(link => document.getElementById(link.hash.slice(1))).filter((section): section is HTMLElement => Boolean(section));
  const reading = new Set<Element>();
  const chapterObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) reading.add(entry.target); else reading.delete(entry.target); });
    const current = chapters.filter(section => reading.has(section)).at(-1);
    if (!current) return;
    chapterLinks.forEach(link => {
      if (link.hash === `#${current.id}`) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin:'-12% 0px -62% 0px' });
  chapters.forEach(section => chapterObserver.observe(section));

  media.add({ motion: '(prefers-reduced-motion: no-preference)', fine: '(hover: hover) and (pointer: fine)', wide: '(min-width: 900px)' }, (context) => {
    const { motion, fine, wide } = context.conditions!;
    const events = new AbortController();
    const observers: (IntersectionObserver | ResizeObserver)[] = [];
    const currentGates: (() => void)[] = [];
    let closed = false;
    updateButtons();
    if (motion) {
      const copy = Array.from(document.querySelectorAll<HTMLElement>('[data-detail-reveal]'));
      ScrollTrigger.batch(copy, {
        start:'top 94%', once:true, interval:.06, batchMax:4,
        onEnter: batch => context.add(() => gsap.fromTo(batch,{y:14},{y:0,duration:.8,stagger:.065,ease:'power3.out',clearProps:'transform'})),
      });
    }

    const page = document.querySelector<HTMLElement>('.detail-page');
    if (page && motion && fine && wide) {
      const layers = Array.from(page.querySelectorAll<HTMLElement>('[data-detail-field-layer]'));
      const fields = layers.map(layer => ({
        layer, visible:false,
        depth: Number(layer.dataset.detailFieldLayer) || 0,
        x: gsap.quickTo(layer, 'x', { duration: 1.05, ease: 'power3.out' }),
        y: gsap.quickTo(layer, 'y', { duration: 1.05, ease: 'power3.out' }),
      }));
      let held = false;
      let visible = false;
      const active = () => !closed && visible && !held && !paused && !document.hidden;
      const reset = (immediate = false) => {
        fields.forEach(field => [field.x,field.y].forEach(to => { to(0); if (immediate) to.tween.progress(1).pause(); }));
        page.dataset.detailFieldPointer = '0.000,0.000';
      };
      const gate = () => { if (!closed && (paused || document.hidden || !visible)) reset(true); };
      const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; gate(); });
      intersection.observe(page);
      observers.push(intersection);
      const layerObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const field = fields.find(field => field.layer === entry.target);
          if (!field) return;
          field.visible = entry.isIntersecting;
          if (!field.visible) [field.x,field.y].forEach(to => { to(0);to.tween.progress(1).pause(); });
        });
      });
      fields.forEach(field => layerObserver.observe(field.layer));
      observers.push(layerObserver);
      gates.add(gate); currentGates.push(gate);
      page.addEventListener('pointermove', event => {
        if (!active() || event.pointerType === 'touch') return;
        const x = gsap.utils.clamp(-1,1,event.clientX / Math.max(1,window.innerWidth)*2-1);
        const y = gsap.utils.clamp(-1,1,event.clientY / Math.max(1,window.innerHeight)*2-1);
        fields.filter(field => field.visible).forEach(field => { field.x(-x*24*field.depth); field.y(-y*18*field.depth); });
        page.dataset.detailFieldPointer = `${x.toFixed(3)},${y.toFixed(3)}`;
      }, { passive:true,signal:events.signal });
      page.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        held = true; fields.forEach(field => [field.x,field.y].forEach(to => to.tween.pause()));
      }, { signal:events.signal });
      const release = () => {
        const wasHeld = held; held = false;
        if (!page.matches(':hover')) reset();
        else if (wasHeld && active()) fields.filter(field => field.visible).forEach(field => [field.x,field.y].forEach(to => { if (to.tween.progress()<1) to.tween.resume(); }));
      };
      window.addEventListener('pointerup',release,{signal:events.signal});
      window.addEventListener('pointercancel',release,{signal:events.signal});
      window.addEventListener('blur',() => { held=false;reset(true); },{signal:events.signal});
      page.addEventListener('pointerleave',() => { if (!held) reset(); },{signal:events.signal});
      context.add(() => () => { delete page.dataset.detailFieldPointer; });
    }
    figures.forEach((figure) => {
      const plane = figure.querySelector<HTMLElement>('[data-detail-tilt]');
      const kind = figure.dataset.detailMotion as Kind;
      const timing = rhythm(kind);
      const animations: gsap.core.Animation[] = [];
      const pulses: SVGGeometryElement[] = [];
      let visible = false;
      let held = false;
      let bounds = { left: 0, top: 0, width: 1, height: 1 };
      let restX = 0, restY = 0, restZ = 0, response = 1;
      let camera = { x:0, width:1, height:1, perspective:1800, viewport:1 };
      const readPose = () => {
        if (!plane) return;
        const style = getComputedStyle(plane);
        restX = parseFloat(style.getPropertyValue('--artifact-rest-x')) || 0;
        restY = parseFloat(style.getPropertyValue('--artifact-rest-y')) || 0;
        restZ = parseFloat(style.getPropertyValue('--artifact-rest-z')) || 0;
        response = parseFloat(style.getPropertyValue('--artifact-response')) || 1;
      };
      readPose();
      const pointerEnabled = motion && fine && wide && plane;
      const xTo = pointerEnabled ? gsap.quickTo(plane, 'x', { duration: 0.65, ease: 'power3.out' }) : undefined;
      const yTo = pointerEnabled ? gsap.quickTo(plane, 'y', { duration: 0.65, ease: 'power3.out' }) : undefined;
      const rxTo = pointerEnabled ? gsap.quickTo(plane, 'rotationX', { duration: 0.8, ease: 'power3.out' }) : undefined;
      const ryTo = pointerEnabled ? gsap.quickTo(plane, 'rotationY', { duration: 0.8, ease: 'power3.out' }) : undefined;
      const pointerTweens = [xTo,yTo,rxTo,ryTo];
      const resetPointer = (immediate = false) => {
        xTo?.(0); yTo?.(0); rxTo?.(restX); ryTo?.(restY);
        if (immediate) pointerTweens.forEach(to => to?.tween.progress(1).pause());
        figure.dataset.detailPointer = '0.000,0.000';
      };
      const active = () => Boolean(!closed && motion && visible && !document.hidden && !paused && !preference.matches);
      const gate = () => {
        if (closed) return;
        const playing = active();
        animations.forEach((animation) => animation.paused(!playing));
        figure.dataset.detailMotionState = !motion || preference.matches ? 'reduced' : playing ? 'running' : 'paused';
        if (!playing) resetPointer(true);
      };
      if (motion) {
        const strokes = Array.from(figure.querySelectorAll<SVGGeometryElement>('[data-world-stroke]'));
        const flow = gsap.timeline({ paused: true, repeat: -1, repeatDelay: timing.rest });
        strokes.forEach((stroke, index) => {
          let length = 0;
          try { length = stroke.getTotalLength(); } catch { /* Unsupported decorative shapes remain static. */ }
          if (length < 1) return;
          const pulse = stroke.cloneNode(false) as SVGGeometryElement;
          const appearance = getComputedStyle(stroke);
          pulse.removeAttribute('id');
          pulse.removeAttribute('data-world-stroke');
          pulse.setAttribute('data-world-pulse', '');
          pulse.setAttribute('aria-hidden', 'true');
          pulse.setAttribute('pointer-events', 'none');
          pulse.setAttribute('marker-end', 'none');
          pulse.style.stroke = appearance.stroke;
          pulse.style.strokeWidth = appearance.strokeWidth;
          pulse.style.fill = 'none';
          stroke.parentElement?.appendChild(pulse);
          pulses.push(pulse);
          const dash = Math.min(46, length * 0.24);
          gsap.set(pulse, { strokeDasharray: `${dash} ${length + dash}`, strokeDashoffset: dash, opacity: 0 });
          flow.fromTo(pulse, { strokeDashoffset: dash, opacity: 0 },
            { strokeDashoffset: -length, opacity: kind === 'reading' ? 0.5 : 0.9, duration: timing.travel, ease: 'none' }, index * timing.gap);
          flow.to(pulse, { opacity: 0, duration: 0.18 }, index * timing.gap + timing.travel);
        });
        if (pulses.length) animations.push(flow);
        else flow.kill();
        const markers = Array.from(figure.querySelectorAll<SVGElement>('[data-world-marker]'));
        if (markers.length) animations.push(gsap.fromTo(markers,
          { opacity: 0.36, scale: kind === 'reading' ? 0.98 : 0.86 },
          { opacity: 0.88, scale: kind === 'reading' ? 1.03 : 1.16, duration: timing.breath, stagger: 0.24,
            repeat: -1, yoyo: true, ease: 'sine.inOut', transformOrigin: '50% 50%', paused: true }));
        const rotors = Array.from(figure.querySelectorAll<SVGElement>('[data-world-rotor]'));
        if (rotors.length && timing.rotation) animations.push(gsap.to(rotors,
          { rotation: 360, svgOrigin: '500 325', duration: timing.rotation, ease: 'none', repeat: -1, paused: true }));
      }
      const intersection = new IntersectionObserver(([entry]) => {
        if (closed) return;
        visible = entry.isIntersecting;
        gate();
      }, { threshold: 0.02 });
      intersection.observe(figure);
      observers.push(intersection);
      gates.add(gate);
      currentGates.push(gate);
      gate();
      if (pointerEnabled) {
        const measure = () => {
          if (closed) return;
          const box = figure.getBoundingClientRect();
          bounds = { left: box.left + window.scrollX, top: box.top + window.scrollY, width: box.width, height: box.height };
          const stage = plane.closest<HTMLElement>('.artifact-stage');
          if (stage) {
            const frame = stage.getBoundingClientRect();
            camera = { x:frame.x, width:plane.offsetWidth, height:plane.offsetHeight, perspective:parseFloat(getComputedStyle(stage).perspective)||1800, viewport:document.documentElement.clientWidth };
          }
        };
        measure();
        const size = new ResizeObserver(measure);
        size.observe(figure);
        observers.push(size);
        window.addEventListener('resize', () => { readPose();measure();resetPointer(true); }, { signal:events.signal });
        figure.addEventListener('pointerenter', measure, { signal: events.signal });
        figure.addEventListener('pointermove', (event) => {
          if (!active() || held || event.pointerType === 'touch') return;
          const x = gsap.utils.clamp(-1, 1, (event.pageX - bounds.left) / Math.max(1, bounds.width) * 2 - 1);
          const y = gsap.utils.clamp(-1, 1, (event.pageY - bounds.top) / Math.max(1, bounds.height) * 2 - 1);
          const broad = kind === 'orbit' || kind === 'light' ? 1.15 : kind === 'reading' ? .7 : 1;
          const targetX = restX-y*8*response*broad, targetY = restY+x*12*response*broad;
          // A wide plane can approach the viewport edge as it turns. Evaluate
          // its four projected corners from cached geometry before moving it;
          // keep the full screenshot visible instead of clipping its content.
          const fits = (strength:number) => {
            const ax=targetX*strength*Math.PI/180,ay=targetY*strength*Math.PI/180,az=restZ*Math.PI/180;
            return [-1,1].every(sx => [-1,1].every(sy => {
              const px=sx*camera.width/2,py=sy*camera.height/2;
              const y1=py*Math.cos(ax),z1=py*Math.sin(ax);
              const x2=px*Math.cos(ay)+z1*Math.sin(ay),z2=-px*Math.sin(ay)+z1*Math.cos(ay);
              const x3=x2*Math.cos(az)-y1*Math.sin(az);
              const screen=camera.x+camera.width/2+(x3+x*7*response*strength)/(1-z2/camera.perspective);
              return screen>=7&&screen<=camera.viewport-7;
            }));
          };
          let strength=1;
          if (!fits(1)) {
            let low=0,high=1;
            for(let step=0;step<8;step++){const middle=(low+high)/2;if(fits(middle))low=middle;else high=middle;}
            strength=low;
          }
          xTo?.(x*7*response*strength); yTo?.(y*7*response*strength);
          rxTo?.(targetX*strength); ryTo?.(targetY*strength);
          figure.dataset.detailPointer = `${x.toFixed(3)},${y.toFixed(3)}`;
        }, { passive: true, signal: events.signal });
        figure.addEventListener('pointerdown', event => {
          if (!event.isPrimary || event.button !== 0) return;
          held = true; pointerTweens.forEach(to => to?.tween.pause());
        }, { signal:events.signal });
        const release = () => {
          const wasHeld = held; held = false;
          if (!figure.matches(':hover')) resetPointer();
          else if (wasHeld && active()) pointerTweens.forEach(to => { if (to && to.tween.progress()<1) to.tween.resume(); });
        };
        window.addEventListener('pointerup',release,{signal:events.signal});
        window.addEventListener('pointercancel',release,{signal:events.signal});
        window.addEventListener('blur',() => { held=false;resetPointer(true); },{signal:events.signal});
        figure.addEventListener('pointerleave', () => { if (!held) resetPointer(); }, { signal: events.signal });
      }
      context.add(() => () => {
        pulses.forEach((pulse) => pulse.remove());
        figure.dataset.detailMotionState = 'paused';
        figure.dataset.detailPointer = '0.000,0.000';
      });
    });
    context.add(() => () => {
      closed = true;
      events.abort();
      observers.forEach((observer) => observer.disconnect());
      currentGates.forEach((gate) => gates.delete(gate));
    });
  });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    chapterObserver.disconnect();
    media.revert();
    gates.clear();
    originals.forEach(({ button, pressed, label, disabled, text }) => {
      if (pressed == null) button.removeAttribute('aria-pressed'); else button.setAttribute('aria-pressed', pressed);
      if (label == null) button.removeAttribute('aria-label'); else button.setAttribute('aria-label', label);
      button.disabled = disabled;
      const element = button.querySelector<HTMLElement>('[data-detail-motion-label]');
      if (element) element.textContent = text;
    });
    if (previousPause == null) root.removeAttribute('data-motion-paused'); else root.setAttribute('data-motion-paused', previousPause);
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
