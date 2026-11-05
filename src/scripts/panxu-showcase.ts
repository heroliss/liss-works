type Options = { signal: AbortSignal; preference: MediaQueryList };

const ORDER = ['scan', 'sort', 'explain', 'clean'];
const SWAP_MS = 900;   // the old panels settle and the window changes before new ones rise (CSS: .9s)
const RISE_MS = 900;   // one panel's rise (CSS transition)
const POINT_MS = 1700; // each explanation point in turn while the demo plays
const AFTER_MS = 900;  // after the last point, before the next step
const TILT = { x: 3.5, y: 5 };

/** 盘序: plays the checkup once in view, points at each panel in turn, and hands over to the visitor. */
export function setupPanxuShowcase({ signal, preference }: Options): () => void {
  if (signal.aborted) return () => {};
  const found = document.querySelector<HTMLElement>('[data-panxu]');
  if (!found) return () => {};
  const root: HTMLElement = found;
  const all = <T extends HTMLElement = HTMLElement>(selector: string) => Array.from(root.querySelectorAll<T>(selector));
  const scene = root.querySelector<HTMLElement>('[data-px-scene]');
  const win = root.querySelector<HTMLElement>('[data-px-window]');
  const copiesBox = root.querySelector<HTMLElement>('[data-px-copies]');
  const steps = all<HTMLButtonElement>('[data-px-step]');
  const copies = all('[data-px-copy]');
  const layers = all<HTMLButtonElement>('[data-px-layer]');
  const sockets = all('[data-px-socket]');
  const bases = all<HTMLImageElement>('[data-px-base]');
  const zooms = all<HTMLAnchorElement>('[data-px-zoom]');
  const points = all('[data-px-point]');
  const callouts = all('[data-px-callout]');
  const shotOf = Object.fromEntries(steps.map(button => [button.dataset.pxStep ?? '', button.dataset.shot ?? '']));
  const initialStep = root.dataset.step || 'sort';
  const events = new AbortController();
  let current = initialStep, visible = false, started = false, userTook = false, hovering = false, focused = false, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined, enterTimer: ReturnType<typeof setTimeout> | undefined;
  let queue: string[] = [], frame = 0, playFrame = 0;
  let pointerX = 0, pointerY = 0, targetX = 0, targetY = 0;
  const paused = () => document.documentElement.dataset.motionPaused === 'true';
  const still = () => preference.matches || paused() || document.hidden;
  const mark = (element: HTMLElement, on: boolean) => on ? element.setAttribute('data-on', '') : element.removeAttribute('data-on');
  const groupsOf = (step: string) => points.filter(point => point.dataset.step === step).map(point => point.dataset.pxPoint ?? '');
  const lastRise = (step: string) => Math.max(0, ...layers.filter(layer => layer.dataset.step === step).map(layer => Number.parseFloat(layer.style.getPropertyValue('--d')) || 0));
  const enterTime = (step: string) => SWAP_MS + lastRise(step) + RISE_MS;

  function setHot(group: string | null) {
    for (const element of [...layers, ...points, ...callouts]) {
      const hot = group !== null && (element.dataset.group ?? element.dataset.pxPoint ?? element.dataset.pxCallout) === group && element.dataset.step === current;
      if (hot) element.setAttribute('data-hot', ''); else element.removeAttribute('data-hot');
    }
  }
  function show(step: string, animate: boolean) {
    current = step;
    const shot = shotOf[step] ?? '';
    root.dataset.step = step;
    root.dataset.shot = shot;
    steps.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.pxStep === step)));
    copies.forEach(copy => {
      const on = copy.dataset.pxCopy === step;
      mark(copy, on); copy.inert = !on;
      if (on) copy.removeAttribute('aria-hidden'); else copy.setAttribute('aria-hidden', 'true');
    });
    layers.forEach(layer => { const on = layer.dataset.step === step; mark(layer, on); layer.inert = !on; });
    sockets.forEach(socket => mark(socket, socket.dataset.step === step));
    bases.forEach(base => {
      const on = base.dataset.pxBase === shot;
      mark(base, on);
      if (on) base.removeAttribute('aria-hidden'); else base.setAttribute('aria-hidden', 'true');
    });
    zooms.forEach(zoom => { zoom.hidden = zoom.dataset.pxZoom !== shot; });
    setHot(null);
    clearTimeout(enterTimer);
    // While entering, CSS delays the swap and each panel's rise; afterwards hovering answers at once.
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
  // (Re)start the demo of the current step: wait for its panels, then point at each in turn, then move on.
  function play() {
    stopDemo();
    if (disposed || userTook || hovering || focused || !visible || still()) return;
    queue = groupsOf(current);
    const lead = root.dataset.entering === 'true' ? enterTime(current) : 500;
    root.style.setProperty('--hold', `${lead + queue.length * POINT_MS + AFTER_MS}ms`);
    playFrame = requestAnimationFrame(() => { root.dataset.playing = 'true'; });
    timer = setTimeout(next, lead);
  }
  function next() {
    const group = queue.shift();
    if (group !== undefined) { setHot(group); timer = setTimeout(next, POINT_MS); return; }
    setHot(null);
    timer = setTimeout(() => {
      show(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length], true);
      play();
    }, AFTER_MS);
  }
  function takeOver() {
    if (!userTook) copiesBox?.setAttribute('aria-live', 'polite');
    userTook = true;
    stopDemo();
  }

  function tilt() {
    frame = 0;
    pointerX += (targetX - pointerX) * .12; pointerY += (targetY - pointerY) * .12;
    if (Math.abs(targetX - pointerX) < .002 && Math.abs(targetY - pointerY) < .002) { pointerX = targetX; pointerY = targetY; }
    win?.style.setProperty('--tilt-x', `${(-pointerY * TILT.x).toFixed(3)}deg`);
    win?.style.setProperty('--tilt-y', `${(pointerX * TILT.y).toFixed(3)}deg`);
    win?.style.setProperty('--sheen-x', `${(pointerX * 25).toFixed(2)}%`);
    win?.style.setProperty('--sheen-y', `${(pointerY * 25).toFixed(2)}%`);
    if (pointerX !== targetX || pointerY !== targetY) frame = requestAnimationFrame(tilt);
  }
  function aim(x: number, y: number) {
    targetX = x; targetY = y;
    if (!frame) frame = requestAnimationFrame(tilt);
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !started && !userTook && !still()) { started = true; show('scan', true); }
    if (visible) play(); else stopDemo();
  }, { threshold: .3 });
  observer.observe(root);

  const on = events.signal;
  steps.forEach(button => button.addEventListener('click', () => {
    takeOver();
    show(button.dataset.pxStep || 'sort', true);
  }, { signal: on }));
  layers.forEach(layer => {
    const group = layer.dataset.group ?? null;
    layer.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') setHot(group); }, { signal: on });
    layer.addEventListener('pointerleave', () => setHot(null), { signal: on });
    layer.addEventListener('focus', () => setHot(group), { signal: on });
    layer.addEventListener('blur', () => setHot(null), { signal: on });
    // The panel is part of a screenshot: open that screenshot, full size, in the site's viewer.
    layer.addEventListener('click', () => {
      takeOver();
      zooms.find(zoom => zoom.dataset.pxZoom === layer.dataset.shot)?.click();
    }, { signal: on });
  });
  points.forEach(point => {
    point.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      hovering = true; stopDemo(); setHot(point.dataset.pxPoint ?? null);
    }, { signal: on });
    point.addEventListener('pointerleave', () => { hovering = false; setHot(null); play(); }, { signal: on });
  });
  // The demo waits while the visitor looks closer, and carries on when they leave.
  scene?.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovering = true; stopDemo(); setHot(null); } }, { signal: on });
  scene?.addEventListener('pointerleave', () => { hovering = false; setHot(null); aim(0, 0); play(); }, { signal: on });
  scene?.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || still() || !win || !matchMedia('(hover:hover) and (pointer:fine) and (min-width:761px)').matches) return;
    const bounds = win.getBoundingClientRect();
    const clamp = (value: number) => Math.max(-1, Math.min(1, value));
    aim(clamp((event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1), clamp((event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1));
  }, { passive: true, signal: on });
  root.addEventListener('focusin', () => { focused = true; stopDemo(); }, { signal: on });
  root.addEventListener('focusout', event => {
    if (root.contains(event.relatedTarget as Node | null)) return;
    focused = false; play();
  }, { signal: on });
  window.addEventListener('portfolio:motion-state', () => { if (still()) aim(0, 0); play(); }, { signal: on });
  document.addEventListener('visibilitychange', play, { signal: on });
  preference.addEventListener('change', () => { if (preference.matches) aim(0, 0); play(); }, { signal: on });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    events.abort(); observer.disconnect(); stopDemo();
    clearTimeout(enterTimer); cancelAnimationFrame(frame);
    show(initialStep, false);
    copiesBox?.removeAttribute('aria-live');
    root.style.removeProperty('--hold');
    for (const name of ['--tilt-x', '--tilt-y', '--sheen-x', '--sheen-y']) win?.style.removeProperty(name);
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
