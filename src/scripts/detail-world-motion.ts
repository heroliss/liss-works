import { gsap } from 'gsap';

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

  media.add({ motion: '(prefers-reduced-motion: no-preference)', fine: '(hover: hover) and (pointer: fine)' }, (context) => {
    const { motion, fine } = context.conditions!;
    const events = new AbortController();
    const observers: (IntersectionObserver | ResizeObserver)[] = [];
    const currentGates: (() => void)[] = [];
    let closed = false;
    updateButtons();
    figures.forEach((figure) => {
      const plane = figure.querySelector<HTMLElement>('[data-detail-tilt]');
      const kind = figure.dataset.detailMotion as Kind;
      const timing = rhythm(kind);
      const animations: gsap.core.Animation[] = [];
      const pulses: SVGGeometryElement[] = [];
      let visible = false;
      let bounds = { left: 0, top: 0, width: 1, height: 1 };
      const xTo = motion && fine && plane ? gsap.quickTo(plane, 'x', { duration: 0.55, ease: 'power3.out' }) : undefined;
      const yTo = motion && fine && plane ? gsap.quickTo(plane, 'y', { duration: 0.55, ease: 'power3.out' }) : undefined;
      const rxTo = motion && fine && plane ? gsap.quickTo(plane, 'rotationX', { duration: 0.65, ease: 'power3.out' }) : undefined;
      const ryTo = motion && fine && plane ? gsap.quickTo(plane, 'rotationY', { duration: 0.65, ease: 'power3.out' }) : undefined;
      const resetPointer = (immediate = false) => {
        [xTo, yTo, rxTo, ryTo].forEach((to) => { if (to) { to(0); if (immediate) to.tween.progress(1).pause(); } });
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
      if (motion && fine && plane) {
        const measure = () => {
          if (closed) return;
          const box = figure.getBoundingClientRect();
          bounds = { left: box.left + window.scrollX, top: box.top + window.scrollY, width: box.width, height: box.height };
        };
        measure();
        const size = new ResizeObserver(measure);
        size.observe(figure);
        observers.push(size);
        figure.addEventListener('pointerenter', measure, { signal: events.signal });
        figure.addEventListener('pointermove', (event) => {
          if (!active() || event.pointerType === 'touch') return;
          const x = gsap.utils.clamp(-1, 1, (event.pageX - bounds.left) / Math.max(1, bounds.width) * 2 - 1);
          const y = gsap.utils.clamp(-1, 1, (event.pageY - bounds.top) / Math.max(1, bounds.height) * 2 - 1);
          xTo?.(x * 12); yTo?.(y * 12); rxTo?.(-y * 7); ryTo?.(x * 9);
          figure.dataset.detailPointer = `${x.toFixed(3)},${y.toFixed(3)}`;
        }, { passive: true, signal: events.signal });
        figure.addEventListener('pointerleave', () => resetPointer(), { signal: events.signal });
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
