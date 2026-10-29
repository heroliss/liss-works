import { gsap } from 'gsap';

interface ProjectMotionOptions {
  signal: AbortSignal;
  preference: MediaQueryList;
}

// Every repeating animation belongs to a real project relationship and shares
// the page's visibility, preference and explicit pause controls.
export function setupProjectMotion({ signal, preference }: ProjectMotionOptions) {
  const controller = new AbortController();
  const localSignal = controller.signal;
  const media = gsap.matchMedia();
  const gates = new Set<() => void>();
  let paused = document.querySelector('[data-motion-toggle]')?.getAttribute('aria-pressed') === 'true';
  let disposed = false;
  const resync = () => gates.forEach((sync) => sync());
  window.addEventListener('portfolio:motion-state', (event) => {
    paused = Boolean((event as CustomEvent<{ paused: boolean }>).detail?.paused);
    resync();
  }, { signal: localSignal });
  document.addEventListener('visibilitychange', resync, { signal: localSignal });

  media.add({
    motion: '(prefers-reduced-motion: no-preference)',
    fine: '(hover: hover) and (pointer: fine)',
    diagramWide: '(min-width: 761px)',
  }, (context) => {
    const { motion, fine, diagramWide } = context.conditions!;
    const events = new AbortController();
    const observers: (IntersectionObserver | ResizeObserver)[] = [];
    const syncs: (() => void)[] = [];
    const watch = (element: HTMLElement, change: (playing: boolean) => void) => {
      let visible = false;
      const active = () => Boolean(motion && visible && !document.hidden && !paused && !preference.matches);
      const sync = () => change(active());
      const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: 0.04 });
      observer.observe(element);
      observers.push(observer);
      syncs.push(sync);
      gates.add(sync);
      sync();
      return active;
    };

    document.querySelectorAll<HTMLElement>('[data-ambient-region]').forEach((region) => {
      watch(region, (playing) => { region.dataset.motionVisible = String(playing); });
      context.add(() => () => { region.dataset.motionVisible = 'false'; });
    });

    // The project canvas and its real image turn together. The article keeps
    // its separate scroll transform; the native image link remains unchanged.
    if (motion && fine && diagramWide) document.querySelectorAll<HTMLElement>('.game-scene > .game-art').forEach(plane => {
      const scene = plane.parentElement!;
      let held = false;
      let restX = 0, restY = 0, restZ = 0;
      let bounds = { left:0, top:0, width:1, height:1 };
      let camera = { left:0, width:1, height:1, perspective:1700, viewport:1 };
      const readPose = () => {
        const css = getComputedStyle(plane);
        restX = parseFloat(css.getPropertyValue('--game-rest-x')) || 0;
        restY = parseFloat(css.getPropertyValue('--game-rest-y')) || 0;
        restZ = parseFloat(css.getPropertyValue('--game-rest-z')) || 0;
      };
      readPose();
      const rx = gsap.quickTo(plane, 'rotationX', { duration:.8, ease:'power3.out' });
      const ry = gsap.quickTo(plane, 'rotationY', { duration:.8, ease:'power3.out' });
      const lightX = gsap.quickTo(plane, '--material-light-x', { duration:.8, ease:'power3.out' });
      const lightY = gsap.quickTo(plane, '--material-light-y', { duration:.8, ease:'power3.out' });
      const shine = gsap.quickTo(plane, '--material-shine', { duration:.8, ease:'power3.out' });
      const tweens = [rx,ry,lightX,lightY,shine];
      const reset = (immediate = false) => {
        rx(restX); ry(restY); lightX(0); lightY(0); shine(.58);
        if (immediate) tweens.forEach(to => to.tween.progress(1).pause());
        plane.dataset.gamePointer = '0.000,0.000';
      };
      const measure = () => {
        const box = scene.getBoundingClientRect();
        bounds = { left:box.left+scrollX, top:box.top+scrollY, width:box.width, height:box.height };
        camera = { left:box.left+plane.offsetLeft, width:plane.offsetWidth, height:plane.offsetHeight, perspective:parseFloat(getComputedStyle(scene).perspective)||1700, viewport:document.documentElement.clientWidth };
      };
      const active = watch(scene, playing => { if (!playing) reset(true); });
      measure();
      const size = new ResizeObserver(measure);
      size.observe(scene); size.observe(plane); observers.push(size);
      window.addEventListener('resize', () => { readPose(); measure(); reset(true); }, { signal:events.signal });
      scene.addEventListener('pointerenter', measure, { signal:events.signal });
      scene.addEventListener('pointermove', event => {
        if (held || !active() || event.pointerType === 'touch') return;
        const x = gsap.utils.clamp(-1,1,(event.pageX-bounds.left)/Math.max(1,bounds.width)*2-1);
        const y = gsap.utils.clamp(-1,1,(event.pageY-bounds.top)/Math.max(1,bounds.height)*2-1);
        const ax=restX-y*6, ay=restY+x*9;
        const fits = (strength:number) => {
          const a=ax*strength*Math.PI/180,b=ay*strength*Math.PI/180,z=restZ*Math.PI/180;
          return [-1,1].every(sx => [-1,1].every(sy => {
            const px=sx*camera.width/2,py=sy*camera.height/2,y1=py*Math.cos(a),z1=py*Math.sin(a);
            const x2=px*Math.cos(b)+z1*Math.sin(b),z2=-px*Math.sin(b)+z1*Math.cos(b);
            const screen=camera.left+camera.width/2+(x2*Math.cos(z)-y1*Math.sin(z))/(1-z2/camera.perspective);
            return screen>=8 && screen<=camera.viewport-8;
          }));
        };
        let strength=1;
        if (!fits(1)) { let low=0,high=1; for(let i=0;i<8;i++){const mid=(low+high)/2;if(fits(mid))low=mid;else high=mid;}strength=low; }
        rx(ax*strength); ry(ay*strength); lightX(x*3); lightY(-y*2); shine(.58+(x-y)*.12);
        plane.dataset.gamePointer = `${x.toFixed(3)},${y.toFixed(3)}`;
      }, { passive:true, signal:events.signal });
      scene.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        held=true; tweens.forEach(to => to.tween.pause());
      }, { signal:events.signal });
      const release = () => {
        const wasHeld=held; held=false;
        if (!scene.matches(':hover')) reset();
        else if (wasHeld && active()) tweens.forEach(to => { if(to.tween.progress()<1)to.tween.resume(); });
      };
      window.addEventListener('pointerup', release, { signal:events.signal });
      window.addEventListener('pointercancel', release, { signal:events.signal });
      window.addEventListener('blur', () => { held=false;reset(true); }, { signal:events.signal });
      scene.addEventListener('pointerleave', () => { if(!held)reset(); }, { signal:events.signal });
      context.add(() => () => { delete plane.dataset.gamePointer; });
    });

    document.querySelectorAll<HTMLElement>('[data-architecture]').forEach((architecture) => {
      const paths = Array.from(architecture.querySelectorAll<SVGPathElement>('.map-connections path:not([data-architecture-signal])'));
      const nodes = Array.from(architecture.querySelectorAll<SVGGElement>('.map-node'));
      architecture.setAttribute('aria-busy', 'false');
      architecture.dataset.playback = motion ? 'paused' : 'reduced';
      if (!motion || !diagramWide || paths.length !== 4) return;
      const signals = paths.map((path, index) => {
        const pulse = path.cloneNode(false) as SVGPathElement;
        pulse.removeAttribute('id');
        pulse.dataset.architectureSignal = String(index);
        pulse.setAttribute('aria-hidden', 'true');
        pulse.setAttribute('pointer-events', 'none');
        pulse.setAttribute('marker-end', 'none');
        path.parentElement?.appendChild(pulse);
        return pulse;
      });
      const phase = 1.15;
      const mark = (index: number) => {
        architecture.dataset.flowCurrent = String(index);
        nodes.forEach((node, position) => { node.dataset.current = String(position === index); });
      };
      const loop = gsap.timeline({ paused: true, repeat: -1 });
      signals.forEach((pulse, index) => {
        let length = 1;
        try { length = Math.max(1, paths[index].getTotalLength()); } catch { /* A malformed path stays a quiet baseline. */ }
        const dash = Math.min(32, length * 0.36);
        gsap.set(pulse, {
          stroke: 'var(--cyan)', strokeWidth: 4, opacity: 0,
          strokeDasharray: `${dash} ${length + dash}`, strokeDashoffset: dash,
        });
        loop.call(() => mark(index), [], index * phase);
        loop.fromTo(pulse, { strokeDashoffset: dash, opacity: 0 },
          { strokeDashoffset: -length, opacity: 1, duration: 0.98, ease: 'none' }, index * phase);
        loop.to(pulse, { opacity: 0, duration: 0.12 }, index * phase + 0.98);
      });
      loop.to({}, { duration: 0.2 });
      const active = watch(architecture, (playing) => {
        loop.paused(!playing);
        architecture.dataset.playback = playing ? 'flowing' : 'paused';
      });
      const inspect = (index: number) => {
        mark(index);
        loop.time(index * phase);
        if (active()) loop.play();
      };
      nodes.forEach((node, index) => {
        if (fine) node.addEventListener('pointerenter', () => inspect(index), { signal: events.signal });
        node.addEventListener('focusin', () => inspect(index), { signal: events.signal });
      });
      if (fine) {
        architecture.addEventListener('pointerenter', () => loop.timeScale(1.24), { signal: events.signal });
        architecture.addEventListener('pointerleave', () => loop.timeScale(1), { signal: events.signal });
      }
      architecture.querySelectorAll('[data-architecture-replay]').forEach((button) => {
        button.addEventListener('click', () => { loop.restart(); if (!active()) loop.pause(); }, { signal: events.signal });
      });
      context.add(() => () => {
        signals.forEach((pulse) => pulse.remove());
        nodes.forEach((node) => { delete node.dataset.current; });
        architecture.dataset.playback = 'paused';
        delete architecture.dataset.flowCurrent;
      });
    });

    document.querySelectorAll<HTMLElement>('[data-workflow]').forEach((workflow) => {
      const buttons = Array.from(workflow.querySelectorAll<HTMLButtonElement>('button[data-flow-step]'));
      const nodes = Array.from(workflow.querySelectorAll<HTMLElement | SVGElement>('[data-flow-node]'));
      const paths = Array.from(workflow.querySelectorAll<SVGGeometryElement>('[data-flow-path]'));
      const pulses = Array.from(workflow.querySelectorAll<HTMLElement>('[data-workflow-pulse]'));
      const controls = workflow.querySelector<HTMLElement>('.workflow-controls');
      const caption = workflow.querySelector<HTMLElement>('[data-flow-caption]');
      if (!buttons.length) return;
      const originalLive = caption?.getAttribute('aria-live');
      const initial = buttons.find((button) => button.getAttribute('aria-pressed') === 'true') ?? buttons[0];
      let selected = Number(initial.dataset.flowStep) || 0;
      const feedback = gsap.context(() => {}, workflow);
      let running: gsap.core.Timeline | undefined;
      let pulseLoop: gsap.core.Timeline | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let playing = false;
      let hovering = false;
      let focusing = false;
      let nextAt = Date.now() + 3800;
      const lengths = paths.map((path) => { try { return path.getTotalLength(); } catch { return 0; } });
      const select = (step: number, animate: boolean, announce = false) => {
        const button = buttons.find((entry) => Number(entry.dataset.flowStep) === step);
        if (!button) return;
        // Reuse one context: automatic cycling must not retain a new feedback
        // timeline in the page context every four seconds for a long visit.
        feedback.revert();
        running = undefined;
        selected = step;
        buttons.forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
        nodes.forEach((node, index) => {
          const position = Number(node.dataset.flowNode ?? index);
          node.dataset.active = String(position <= step);
          node.dataset.current = String(position === step);
        });
        paths.forEach((path, index) => { path.dataset.active = String(Number(path.dataset.flowPath ?? index) < step); });
        pulses.forEach((pulse, index) => { pulse.dataset.current = String(index === step); });
        workflow.dataset.flowCurrent = String(step);
        if (caption) {
          caption.setAttribute('aria-live', announce ? 'polite' : 'off');
          if (button.dataset.caption) caption.textContent = button.dataset.caption;
        }
        if (!animate || !motion || preference.matches) return;
        feedback.add(() => {
          running = gsap.timeline({ defaults: { ease: 'power2.out' } });
          const current = nodes.find((node, index) => Number(node.dataset.flowNode ?? index) === step);
          if (current) running.fromTo(current, { scale: 0.96 },
            { scale: 1, duration: 0.4, transformOrigin: '50% 50%', clearProps: 'transform' }, 0);
          paths.forEach((path, index) => {
            if (!lengths[index] || Number(path.dataset.flowPath ?? index) >= step) return;
            running!.fromTo(path, { strokeDasharray: lengths[index], strokeDashoffset: lengths[index] },
              { strokeDashoffset: 0, duration: 0.55, clearProps: 'strokeDasharray,strokeDashoffset' }, index * 0.12);
          });
          if (caption) running.fromTo(caption, { y: 5, opacity: 0.7 },
            { y: 0, opacity: 1, duration: 0.35, clearProps: 'transform,opacity' }, 0.04);
        });
      };
      const scheduleAuto = () => {
        clearTimeout(timer);
        if (!playing || hovering || focusing) return;
        timer = setTimeout(() => {
          if (!playing || hovering || focusing) return;
          select((selected + 1) % buttons.length, true);
          nextAt = Date.now() + 4200;
          scheduleAuto();
        }, Math.max(100, nextAt - Date.now()));
      };
      const manual = (step: number) => {
        select(step, selected !== step, true);
        nextAt = Date.now() + 7000;
        scheduleAuto();
      };
      buttons.forEach((button) => {
        button.addEventListener('click', () => manual(Number(button.dataset.flowStep)), { signal: events.signal });
        button.addEventListener('focusin', () => {
          focusing = true;
          manual(Number(button.dataset.flowStep));
        }, { signal: events.signal });
        if (fine) button.addEventListener('pointerenter', () => {
          hovering = true;
          manual(Number(button.dataset.flowStep));
        }, { signal: events.signal });
      });
      controls?.addEventListener('pointerleave', () => {
        hovering = false;
        nextAt = Date.now() + 7000;
        scheduleAuto();
      }, { signal: events.signal });
      controls?.addEventListener('focusout', (event) => {
        if (event.relatedTarget instanceof Node && controls.contains(event.relatedTarget)) return;
        focusing = false;
        nextAt = Date.now() + 7000;
        scheduleAuto();
      }, { signal: events.signal });
      select(selected, false);
      if (motion && pulses.length) {
        pulseLoop = gsap.timeline({ paused: true, repeat: -1 }).fromTo(pulses,
          { scale: 0.86 }, { scale: 1.14, duration: 1.1, stagger: 0.27, repeat: 1, yoyo: true, ease: 'sine.inOut' });
      }
      watch(workflow, (active) => {
        if (active && !playing) nextAt = Math.max(nextAt, Date.now() + 2000);
        playing = active;
        workflow.dataset.playback = active ? 'cycling' : motion ? 'paused' : 'reduced';
        pulseLoop?.paused(!active);
        if (!active) running?.pause();
        else running?.resume();
        scheduleAuto();
      });
      context.add(() => () => {
        clearTimeout(timer);
        feedback.revert();
        if (caption) {
          if (originalLive == null) caption.removeAttribute('aria-live');
          else caption.setAttribute('aria-live', originalLive);
        }
        workflow.dataset.playback = 'paused';
      });
    });

    context.add(() => () => {
      events.abort();
      observers.forEach((observer) => observer.disconnect());
      syncs.forEach((sync) => gates.delete(sync));
    });
  });

  const close = () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    media.revert();
    gates.clear();
    signal.removeEventListener('abort', close);
  };
  signal.addEventListener('abort', close, { once: true });
  if (signal.aborted) close();
  return close;
}
