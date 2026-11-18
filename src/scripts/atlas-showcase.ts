type Options = { signal: AbortSignal; preference: MediaQueryList };

const ORDER = ['overview', 'match', 'commute', 'xiaoqu'];
const SWAP_MS = 850;
const RISE_MS = 850;
const POINT_MS = 1800;
const AFTER_MS = 900;
const TILT = { x: 3.2, y: 4.6 };

/** 全国房价交互舆图：进入视野时按四步展开真实界面的空间切片，悬停或点击后交由访客自由查看。 */
export function setupAtlasShowcase({ signal, preference }: Options): () => void {
  if (signal.aborted) return () => {};
  const found = document.querySelector<HTMLElement>('[data-atlas-showcase]');
  if (!found) return () => {};
  const root: HTMLElement = found;
  const all = <T extends HTMLElement = HTMLElement>(selector: string) => Array.from(root.querySelectorAll<T>(selector));
  const scene = root.querySelector<HTMLElement>('[data-at-scene]');
  const win = root.querySelector<HTMLElement>('[data-at-window]');
  const copiesBox = root.querySelector<HTMLElement>('[data-at-copies]');
  const steps = all<HTMLButtonElement>('[data-at-step]');
  const copies = all('[data-at-copy]');
  const layers = all<HTMLButtonElement>('[data-at-layer]');
  const sockets = all('[data-at-socket]');
  const bases = all<HTMLImageElement>('[data-at-base]');
  const zooms = all<HTMLAnchorElement>('[data-at-zoom]');
  const points = all('[data-at-point]');
  const callouts = all('[data-at-callout]');
  const shotOf = Object.fromEntries(steps.map(button => [button.dataset.atStep ?? '', button.dataset.shot ?? '']));
  const initialStep = root.dataset.step || 'commute';
  const events = new AbortController();
  let current = initialStep, visible = false, started = false, userTook = false, hovering = false, focused = false, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined, enterTimer: ReturnType<typeof setTimeout> | undefined;
  let queue: string[] = [], frame = 0, playFrame = 0;
  let pointerX = 0, pointerY = 0, targetX = 0, targetY = 0;

  const paused = () => document.documentElement.dataset.motionPaused === 'true';
  const still = () => preference.matches || paused() || document.hidden;
  const mark = (element: HTMLElement, on: boolean) => on ? element.setAttribute('data-on', '') : element.removeAttribute('data-on');
  const groupsOf = (step: string) => points.filter(point => point.dataset.step === step).map(point => point.dataset.atPoint ?? '');
  const lastRise = (step: string) => Math.max(0, ...layers.filter(layer => layer.dataset.step === step).map(layer => Number.parseFloat(layer.style.getPropertyValue('--d')) || 0));
  const enterTime = (step: string) => SWAP_MS + lastRise(step) + RISE_MS;

  function setHot(group: string | null) {
    for (const element of [...layers, ...points, ...callouts]) {
      const hot = group !== null && (element.dataset.group ?? element.dataset.atPoint ?? element.dataset.atCallout) === group && element.dataset.step === current;
      if (hot) element.setAttribute('data-hot', ''); else element.removeAttribute('data-hot');
    }
  }

  function show(step: string, animate: boolean) {
    current = step;
    const shot = shotOf[step] ?? '';
    root.dataset.step = step;
    root.dataset.shot = shot;
    steps.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.atStep === step)));
    copies.forEach(copy => {
      const on = copy.dataset.atCopy === step;
      mark(copy, on); copy.inert = !on;
      if (on) copy.removeAttribute('aria-hidden'); else copy.setAttribute('aria-hidden', 'true');
    });
    layers.forEach(layer => { const on = layer.dataset.step === step; mark(layer, on); layer.inert = !on; });
    sockets.forEach(socket => mark(socket, socket.dataset.step === step));
    bases.forEach(base => {
      const on = base.dataset.atBase === shot;
      mark(base, on);
      if (on) base.removeAttribute('aria-hidden'); else base.setAttribute('aria-hidden', 'true');
    });
    zooms.forEach(zoom => { zoom.hidden = zoom.dataset.atZoom !== shot; });
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
    win?.style.setProperty('--sheen-x', `${(pointerX * 24).toFixed(2)}%`);
    win?.style.setProperty('--sheen-y', `${(pointerY * 24).toFixed(2)}%`);
    if (pointerX !== targetX || pointerY !== targetY) frame = requestAnimationFrame(tilt);
  }

  function aim(x: number, y: number) {
    targetX = x; targetY = y;
    if (!frame) frame = requestAnimationFrame(tilt);
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !started && !userTook && !still()) { started = true; show('overview', true); }
    if (visible) play(); else stopDemo();
  }, { threshold: .28 });
  observer.observe(root);

  const on = events.signal;
  steps.forEach((button, index) => {
    button.addEventListener('click', () => {
      takeOver();
      show(button.dataset.atStep || 'commute', true);
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
      show(target?.dataset.atStep || 'commute', true);
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
      zooms.find(zoom => zoom.dataset.atZoom === shot)?.click();
    }, { signal: on });
  });

  points.forEach(point => {
    const group = point.dataset.atPoint ?? null;
    point.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovering = true; stopDemo(); setHot(group); } }, { signal: on });
    point.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') { hovering = false; setHot(null); play(); } }, { signal: on });
  });

  scene?.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovering = true; stopDemo(); } }, { signal: on });
  scene?.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || still()) return;
    const rect = scene.getBoundingClientRect();
    aim(Math.max(-1, Math.min(1, ((event.clientX - rect.left) / Math.max(1, rect.width) - .5) * 2)),
      Math.max(-1, Math.min(1, ((event.clientY - rect.top) / Math.max(1, rect.height) - .5) * 2)));
  }, { passive: true, signal: on });
  scene?.addEventListener('pointerleave', () => { hovering = false; setHot(null); aim(0, 0); play(); }, { signal: on });

  root.addEventListener('focusin', () => { focused = true; stopDemo(); }, { signal: on });
  root.addEventListener('focusout', event => {
    if (root.contains(event.relatedTarget as Node | null)) return;
    focused = false; setHot(null); play();
  }, { signal: on });

  const syncMotion = () => { if (still()) { stopDemo(); aim(0, 0); } else play(); };
  document.addEventListener('visibilitychange', syncMotion, { signal: on });
  preference.addEventListener('change', syncMotion, { signal: on });
  const pauseObserver = new MutationObserver(syncMotion);
  pauseObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion-paused'] });

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    stopDemo();
    clearTimeout(enterTimer);
    cancelAnimationFrame(frame);
    observer.disconnect();
    pauseObserver.disconnect();
    events.abort();
    win?.style.removeProperty('--tilt-x'); win?.style.removeProperty('--tilt-y');
    win?.style.removeProperty('--sheen-x'); win?.style.removeProperty('--sheen-y');
  };
  signal.addEventListener('abort', cleanup, { once: true });
  return cleanup;
}
