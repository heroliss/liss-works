type Options = { signal: AbortSignal; preference: MediaQueryList };
type DrawerInfo = { name: string; size: string; group: string; example: string; note: string };

const ORDER = ['scan', 'sort', 'explain', 'clean'] as const;
const HOLD: Record<string, number> = { scan: 3800, sort: 4800, explain: 4800, clean: 6800 };
const FREE = { before: 19.7, after: 29.8 };

/** The 盘序 drawer cabinet: plays the checkup once in view, then hands control to the visitor. */
export function setupPanxuShowcase({ signal, preference }: Options): () => void {
  if (signal.aborted) return () => {};
  const rootElement = document.querySelector<HTMLElement>('[data-panxu]');
  if (!rootElement) return () => {};
  const root: HTMLElement = rootElement;
  const scene = root.querySelector<HTMLElement>('[data-px-scene]');
  const world = root.querySelector<HTMLElement>('[data-px-world]');
  const steps = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-px-step]'));
  const copies = Array.from(root.querySelectorAll<HTMLElement>('[data-px-copy]'));
  const shots = Array.from(root.querySelectorAll<HTMLElement>('[data-px-shot]'));
  const drawers = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-px-drawer]'));
  const detail = root.querySelector<HTMLElement>('[data-px-detail]');
  const free = root.querySelector<HTMLElement>('[data-px-free]');
  let info: Record<string, DrawerInfo> = {};
  try { info = JSON.parse(root.querySelector('[data-px-drawers]')?.textContent || '{}'); } catch { info = {}; }
  const initialStep = root.dataset.step || 'sort';
  const initialDetail = detail?.textContent ?? '';
  const events = new AbortController();
  let current = initialStep, visible = false, started = false, userTook = false, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined, countFrame = 0, tiltFrame = 0;
  let tiltX = 0, tiltY = 0, targetX = 0, targetY = 0;
  const paused = () => document.documentElement.dataset.motionPaused === 'true';
  const still = () => preference.matches || paused() || document.hidden;

  function countTo(target: number) {
    if (!free) return;
    cancelAnimationFrame(countFrame);
    const start = Number.parseFloat(free.textContent || '') || FREE.before;
    if (Math.abs(start - target) < .05 || preference.matches) { free.textContent = target.toFixed(1); return; }
    const begin = performance.now() + 450, duration = 1300;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - begin) / duration)), eased = 1 - (1 - progress) ** 3;
      free.textContent = (start + (target - start) * eased).toFixed(1);
      if (progress < 1 && !disposed) countFrame = requestAnimationFrame(tick);
    };
    countFrame = requestAnimationFrame(tick);
  }
  function show(step: string) {
    current = step;
    root.dataset.step = step;
    steps.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.pxStep === step)));
    copies.forEach(copy => { copy.hidden = copy.dataset.pxCopy !== step; });
    shots.forEach(shot => { shot.dataset.active = String(shot.dataset.pxShot === step); });
    countTo(step === 'clean' ? FREE.after : FREE.before);
  }
  function schedule() {
    clearTimeout(timer); timer = undefined;
    if (disposed || userTook || !visible || still()) return;
    const index = ORDER.indexOf(current as typeof ORDER[number]);
    timer = setTimeout(() => { show(ORDER[(index + 1) % ORDER.length]); schedule(); }, HOLD[current] ?? 4600);
  }
  function describe(drawer: HTMLElement | null) {
    drawers.forEach(item => { if (item === drawer) item.dataset.hot = 'true'; else delete item.dataset.hot; });
    if (!detail) return;
    const data = drawer ? info[drawer.dataset.pxDrawer ?? ''] : undefined;
    if (!data) { detail.textContent = initialDetail; return; }
    const name = document.createElement('b'); name.textContent = data.name;
    detail.replaceChildren(name, ` · ${data.size} · ${data.group}`, document.createElement('br'), `${data.example}。${data.note}`);
  }
  function tilt() {
    tiltFrame = 0;
    tiltX += (targetX - tiltX) * .14; tiltY += (targetY - tiltY) * .14;
    if (Math.abs(targetX - tiltX) < .01 && Math.abs(targetY - tiltY) < .01) { tiltX = targetX; tiltY = targetY; }
    world?.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
    world?.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
    if (tiltX !== targetX || tiltY !== targetY) tiltFrame = requestAnimationFrame(tilt);
  }
  function aim(x: number, y: number) {
    targetX = y; targetY = x;
    if (!tiltFrame) tiltFrame = requestAnimationFrame(tilt);
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !started && !userTook && !still()) { started = true; show('scan'); }
    schedule();
  }, { threshold: .3 });
  observer.observe(root);

  steps.forEach(button => button.addEventListener('click', () => {
    userTook = true; clearTimeout(timer); show(button.dataset.pxStep || 'sort');
  }, { signal: events.signal }));
  drawers.forEach(drawer => {
    drawer.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') describe(drawer); }, { signal: events.signal });
    drawer.addEventListener('focus', () => describe(drawer), { signal: events.signal });
    drawer.addEventListener('click', () => {
      userTook = true; clearTimeout(timer);
      // Opening a drawer before the checkup has sorted anything shows the sorted plan.
      if (current === 'scan') show('sort');
      describe(drawer);
    }, { signal: events.signal });
  });
  scene?.addEventListener('pointerleave', () => { describe(null); aim(0, 0); }, { signal: events.signal });
  scene?.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || still() || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    const bounds = scene.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1));
    aim(x * 7, -y * 4);
  }, { passive: true, signal: events.signal });
  window.addEventListener('portfolio:motion-state', () => { if (still()) aim(0, 0); schedule(); }, { signal: events.signal });
  document.addEventListener('visibilitychange', schedule, { signal: events.signal });
  preference.addEventListener('change', () => { if (preference.matches) aim(0, 0); schedule(); }, { signal: events.signal });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    events.abort(); observer.disconnect(); clearTimeout(timer);
    cancelAnimationFrame(countFrame); cancelAnimationFrame(tiltFrame);
    show(initialStep);
    if (free) free.textContent = FREE.before.toFixed(1);
    describe(null);
    world?.style.removeProperty('--tilt-x'); world?.style.removeProperty('--tilt-y');
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
