type Options = { signal: AbortSignal; preference: MediaQueryList };

export interface LayeredShowcaseConfig {
  rootSelector: string;
  prefix: 'px' | 'at' | 'cc';
  order: readonly string[];
  autoStartStep: string;
  fallbackStep: string;
  swapMs: number;
  riseMs: number;
  pointMs: number;
  afterMs: number;
  tilt: { x: number; y: number };
  sheenScale: number;
  threshold: number;
  minTiltWidth: number;
}

/**
 * Shared 3D 4-step layered-screenshot showcase engine used by PanXu, China House
 * Price Map (Atlas) and Intelligence × Cost.
 * - Caches scene/window geometry on entry & resize (no per-mousemove layout thrash)
 * - Gates tilt RAF to fine pointers above the CSS 3D breakpoint
 * - Symmetric cleanup on disposal/navigation
 */
export function setupLayeredShowcase(config: LayeredShowcaseConfig, { signal, preference }: Options): () => void {
  if (signal.aborted) return () => {};
  const found = document.querySelector<HTMLElement>(config.rootSelector);
  if (!found) return () => {};
  const root: HTMLElement = found;
  const p = config.prefix;
  const key = (suffix: string) => `${p}${suffix}`;
  const all = <T extends HTMLElement = HTMLElement>(selector: string) => Array.from(root.querySelectorAll<T>(selector));

  const scene = root.querySelector<HTMLElement>(`[data-${p}-scene]`);
  const win = root.querySelector<HTMLElement>(`[data-${p}-window]`);
  const copiesBox = root.querySelector<HTMLElement>(`[data-${p}-copies]`);
  const steps = all<HTMLButtonElement>(`[data-${p}-step]`);
  const copies = all(`[data-${p}-copy]`);
  const layers = all<HTMLButtonElement>(`[data-${p}-layer]`);
  const sockets = all(`[data-${p}-socket]`);
  const bases = all<HTMLImageElement>(`[data-${p}-base]`);
  const zooms = all<HTMLAnchorElement>(`[data-${p}-zoom]`);
  const points = all(`[data-${p}-point]`);
  const callouts = all(`[data-${p}-callout]`);

  const stepAttr = key('Step');
  const copyAttr = key('Copy');
  const baseAttr = key('Base');
  const zoomAttr = key('Zoom');
  const pointAttr = key('Point');
  const calloutAttr = key('Callout');

  const shotOf = Object.fromEntries(steps.map(button => [button.dataset[stepAttr] ?? '', button.dataset.shot ?? '']));
  const initialStep = root.dataset.step || config.fallbackStep;
  const events = new AbortController();
  const fineDesktop = window.matchMedia(`(hover:hover) and (pointer:fine) and (min-width:${config.minTiltWidth}px)`);

  let current = initialStep, visible = false, started = false, userTook = false, hovering = false, focused = false, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined, enterTimer: ReturnType<typeof setTimeout> | undefined;
  let queue: string[] = [], frame = 0, playFrame = 0;
  let pointerX = 0, pointerY = 0, targetX = 0, targetY = 0;
  let rectDirty = true;
  let sceneRect: DOMRect | null = null;
  let winRect: DOMRect | null = null;

  const paused = () => document.documentElement.dataset.motionPaused === 'true';
  const still = () => preference.matches || paused() || document.hidden;
  const mark = (element: HTMLElement, on: boolean) => on ? element.setAttribute('data-on', '') : element.removeAttribute('data-on');
  const groupsOf = (step: string) => points.filter(point => point.dataset.step === step).map(point => point.dataset[pointAttr] ?? '');
  const lastRise = (step: string) => Math.max(0, ...layers.filter(layer => layer.dataset.step === step).map(layer => Number.parseFloat(layer.style.getPropertyValue('--d')) || 0));
  const enterTime = (step: string) => config.swapMs + lastRise(step) + config.riseMs;

  function measureRects() {
    sceneRect = scene ? scene.getBoundingClientRect() : null;
    winRect = win ? win.getBoundingClientRect() : sceneRect;
    rectDirty = false;
  }

  function setHot(group: string | null) {
    for (const element of [...layers, ...points, ...callouts]) {
      const id = element.dataset.group ?? element.dataset[pointAttr] ?? element.dataset[calloutAttr];
      const hot = group !== null && id === group && element.dataset.step === current;
      if (hot) element.setAttribute('data-hot', ''); else element.removeAttribute('data-hot');
    }
  }

  function show(step: string, animate: boolean) {
    current = step;
    const shot = shotOf[step] ?? '';
    root.dataset.step = step;
    root.dataset.shot = shot;
    steps.forEach(button => button.setAttribute('aria-pressed', String(button.dataset[stepAttr] === step)));
    copies.forEach(copy => {
      const on = copy.dataset[copyAttr] === step;
      mark(copy, on);
      copy.inert = !on;
      if (on) copy.removeAttribute('aria-hidden'); else copy.setAttribute('aria-hidden', 'true');
    });
    layers.forEach(layer => { const on = layer.dataset.step === step; mark(layer, on); layer.inert = !on; });
    sockets.forEach(socket => mark(socket, socket.dataset.step === step));
    bases.forEach(base => {
      const on = base.dataset[baseAttr] === shot;
      mark(base, on);
      if (on) base.removeAttribute('aria-hidden'); else base.setAttribute('aria-hidden', 'true');
    });
    zooms.forEach(zoom => { zoom.hidden = zoom.dataset[zoomAttr] !== shot; });
    setHot(null);
    clearTimeout(enterTimer);
    if (animate && !preference.matches) {
      root.dataset.entering = 'true';
      enterTimer = setTimeout(() => { delete root.dataset.entering; }, enterTime(step));
    } else delete root.dataset.entering;
  }

  function stopDemo() {
    clearTimeout(timer); timer = undefined;
    cancelAnimationFrame(playFrame);
    delete root.dataset.playing;
  }

  function play() {
    stopDemo();
    if (disposed || userTook || hovering || focused || !visible || still()) return;
    queue = groupsOf(current);
    const lead = root.dataset.entering === 'true' ? enterTime(current) : 500;
    root.style.setProperty('--hold', `${lead + queue.length * config.pointMs + config.afterMs}ms`);
    playFrame = requestAnimationFrame(() => { root.dataset.playing = 'true'; });
    timer = setTimeout(next, lead);
  }

  function next() {
    const group = queue.shift();
    if (group !== undefined) { setHot(group); timer = setTimeout(next, config.pointMs); return; }
    setHot(null);
    timer = setTimeout(() => {
      show(config.order[(config.order.indexOf(current) + 1) % config.order.length], true);
      play();
    }, config.afterMs);
  }

  function takeOver() {
    if (!userTook) copiesBox?.setAttribute('aria-live', 'polite');
    userTook = true;
    stopDemo();
  }

  function tilt() {
    frame = 0;
    pointerX += (targetX - pointerX) * .12;
    pointerY += (targetY - pointerY) * .12;
    if (Math.abs(targetX - pointerX) < .002 && Math.abs(targetY - pointerY) < .002) { pointerX = targetX; pointerY = targetY; }
    win?.style.setProperty('--tilt-x', `${(-pointerY * config.tilt.x).toFixed(3)}deg`);
    win?.style.setProperty('--tilt-y', `${(pointerX * config.tilt.y).toFixed(3)}deg`);
    win?.style.setProperty('--sheen-x', `${(pointerX * config.sheenScale).toFixed(2)}%`);
    win?.style.setProperty('--sheen-y', `${(pointerY * config.sheenScale).toFixed(2)}%`);
    if (pointerX !== targetX || pointerY !== targetY) frame = requestAnimationFrame(tilt);
  }

  function aim(x: number, y: number) {
    targetX = x; targetY = y;
    if (!frame) frame = requestAnimationFrame(tilt);
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) rectDirty = true;
    if (visible && !started && !userTook && !still()) { started = true; show(config.autoStartStep, true); }
    if (visible) play(); else stopDemo();
  }, { threshold: config.threshold });
  observer.observe(root);

  const resizeObserver = new ResizeObserver(() => { rectDirty = true; });
  if (scene) resizeObserver.observe(scene);
  if (win && win !== scene) resizeObserver.observe(win);

  const on = events.signal;
  window.addEventListener('scroll', () => { rectDirty = true; }, { passive: true, signal: on });
  window.addEventListener('resize', () => { rectDirty = true; }, { passive: true, signal: on });

  steps.forEach((button, index) => {
    button.addEventListener('click', () => {
      takeOver();
      show(button.dataset[stepAttr] || config.fallbackStep, true);
    }, { signal: on });
    button.addEventListener('keydown', event => {
      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % steps.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + steps.length) % steps.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = steps.length - 1;
      else return;
      event.preventDefault();
      takeOver();
      const target = steps[nextIndex];
      target?.focus();
      show(target?.dataset[stepAttr] || config.fallbackStep, true);
    }, { signal: on });
  });

  layers.forEach(layer => {
    const group = layer.dataset.group ?? null;
    layer.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') setHot(group); }, { signal: on });
    layer.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') setHot(null); }, { signal: on });
    layer.addEventListener('focus', () => setHot(group), { signal: on });
    layer.addEventListener('blur', () => setHot(null), { signal: on });
    layer.addEventListener('click', () => {
      takeOver();
      const shot = layer.dataset.shot ?? '';
      zooms.find(zoom => zoom.dataset[zoomAttr] === shot)?.click();
    }, { signal: on });
  });

  points.forEach(point => {
    const group = point.dataset[pointAttr] ?? null;
    point.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovering = true; stopDemo(); setHot(group); } }, { signal: on });
    point.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') { hovering = false; setHot(null); play(); } }, { signal: on });
  });

  let inScene = false;
  root.addEventListener('pointerenter', () => { rectDirty = true; }, { passive: true, signal: on });
  root.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || !scene) return;
    if (rectDirty || !sceneRect) measureRects();
    if (!sceneRect) return;
    const inside = event.clientX >= sceneRect.left && event.clientX <= sceneRect.right && event.clientY >= sceneRect.top && event.clientY <= sceneRect.bottom;
    if (inside) {
      if (!inScene) { inScene = true; hovering = true; stopDemo(); }
      if (!still() && fineDesktop.matches) {
        const bounds = winRect ?? sceneRect;
        const clamp = (value: number) => Math.max(-1, Math.min(1, value));
        aim(
          clamp((event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1),
          clamp((event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1),
        );
      }
    } else if (inScene) {
      inScene = false; aim(0, 0);
      if (!(event.target instanceof Element && event.target.closest(`[data-${p}-point]`))) {
        hovering = false; setHot(null); play();
      }
    }
  }, { passive: true, signal: on });
  root.addEventListener('pointerleave', () => { if (inScene) { inScene = false; hovering = false; setHot(null); aim(0, 0); play(); } }, { signal: on });

  root.addEventListener('focusin', () => { focused = true; stopDemo(); }, { signal: on });
  root.addEventListener('focusout', event => {
    if (root.contains(event.relatedTarget as Node | null)) return;
    focused = false; setHot(null); play();
  }, { signal: on });

  const syncMotion = () => { if (still()) { stopDemo(); aim(0, 0); } else play(); };
  window.addEventListener('portfolio:motion-state', syncMotion, { signal: on });
  document.addEventListener('visibilitychange', syncMotion, { signal: on });
  preference.addEventListener('change', syncMotion, { signal: on });
  const pauseObserver = new MutationObserver(syncMotion);
  pauseObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion-paused'] });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    events.abort();
    observer.disconnect();
    resizeObserver.disconnect();
    pauseObserver.disconnect();
    stopDemo();
    clearTimeout(enterTimer);
    cancelAnimationFrame(frame);
    show(initialStep, false);
    copiesBox?.removeAttribute('aria-live');
    root.style.removeProperty('--hold');
    for (const name of ['--tilt-x', '--tilt-y', '--sheen-x', '--sheen-y']) win?.style.removeProperty(name);
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
