import type { OrbitEngine, OrbitInput, OrbitItem } from './works-orbit-engine';

type Options = { signal: AbortSignal; preference: MediaQueryList };

/** Cheap on every page: three.js and the engine load only once an orbit is on screen. */
export function setupWorksOrbit({ signal, preference }: Options): () => void {
  const root = document.querySelector<HTMLElement>('[data-works-orbit]');
  if (!root || signal.aborted) return () => {};
  const stage = root.querySelector<HTMLElement>('[data-orbit-stage]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-orbit-canvas]')!;
  const list = root.querySelector<HTMLElement>('[data-orbit-list]')!;
  const label = root.querySelector<HTMLElement>('[data-orbit-label]')!;
  const labelName = root.querySelector<HTMLElement>('[data-orbit-label-name]')!;
  const labelCategory = root.querySelector<HTMLElement>('[data-orbit-label-category]')!;
  const toggle = root.querySelector<HTMLButtonElement>('[data-orbit-motion-toggle]');
  const toggleLabel = root.querySelector<HTMLElement>('[data-orbit-motion-label]');
  let items: OrbitItem[] = [];
  try { items = JSON.parse(root.querySelector('[data-orbit-items]')?.textContent ?? '[]'); } catch { items = []; }
  if (!items.length) return () => {};

  const events = new AbortController();
  const input: OrbitInput = { x: 0, y: 0, active: 0, spin: 0, hover: null };
  let engine: OrbitEngine | undefined, disposed = false, visible = false, loading = false, failed = false;
  let frame = 0, last = 0, time = 0, spinVelocity = 0, dirty = true;
  let drag: { id: number; x: number; spin: number; lastX: number; lastTime: number; moved: boolean } | null = null;
  let pointerPoint: { x: number; y: number } | null = null, suppressClick = 0;
  const paused = () => document.documentElement.dataset.motionPaused === 'true';
  const animated = () => !disposed && !!engine && visible && !document.hidden && !paused() && !preference.matches;

  const pointToNdc = (clientX: number, clientY: number) => {
    const box = stage.getBoundingClientRect();
    return { x: Math.max(-1, Math.min(1, (clientX - box.left) / Math.max(1, box.width) * 2 - 1)), y: Math.max(-1, Math.min(1, (clientY - box.top) / Math.max(1, box.height) * 2 - 1)) };
  };
  const setHover = (item: OrbitItem | null) => {
    const slug = item?.slug ?? null;
    if (slug === input.hover) return;
    input.hover = slug; dirty = true;
    stage.dataset.hovering = String(!!item);
    if (item) {
      labelName.textContent = item.name; labelCategory.textContent = item.category;
      label.style.setProperty('--orbit-tone', item.accent); label.dataset.visible = 'true';
    } else delete label.dataset.visible;
  };
  const updateHover = () => {
    if (!engine || !pointerPoint || drag?.moved) { if (!drag?.moved) setHover(null); return; }
    setHover(engine.pick(pointerPoint.x, pointerPoint.y));
  };

  const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
  const paint = () => { if (engine && visible && !document.hidden) { try { engine.draw(time, input, 0); } catch { unavailable(); } dirty = false; } };
  const render = (now: number) => {
    frame = 0;
    if (!animated()) { if (dirty) paint(); return; }
    frame = requestAnimationFrame(render);
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60;
    last = now; time += dt;
    if (!drag) { input.spin += spinVelocity * dt; spinVelocity *= Math.exp(-dt * 2.4); }
    input.active += ((pointerPoint ? 1 : 0) - input.active) * (1 - Math.exp(-dt * 4));
    updateHover();
    try { engine!.draw(time, input, dt); } catch { unavailable(); return; }
    dirty = false;
  };
  const request = () => { if (!frame && engine && visible) frame = requestAnimationFrame(render); };
  const sync = () => {
    if (disposed) return;
    if (toggle) {
      toggle.hidden = !engine; toggle.disabled = !engine || preference.matches;
      toggle.setAttribute('aria-pressed', String(paused()));
      if (toggleLabel) toggleLabel.textContent = preference.matches ? '静态画面' : paused() ? '继续转动' : '暂停转动';
    }
    if (!engine) { if (visible && !document.hidden && !failed && !loading) void load(); return; }
    root.dataset.orbitState = preference.matches ? 'static' : paused() ? 'paused' : visible && !document.hidden ? 'playing' : 'suspended';
    if (animated()) request(); else { stop(); dirty = true; request(); }
  };
  const unavailable = () => {
    if (disposed || failed) return;
    failed = true; stop(); engine?.dispose(); engine = undefined;
    canvas.hidden = true; root.dataset.orbitState = 'fallback'; delete root.dataset.orbitReady;
    if (toggle) toggle.hidden = true;
  };
  const load = async () => {
    if (loading || engine || failed || disposed) return;
    loading = true; root.dataset.orbitState = 'loading';
    try {
      const [THREE, { createOrbitEngine }] = await Promise.all([import('three'), import('./works-orbit-engine')]);
      if (disposed) return;
      const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
      if (!context) { unavailable(); return; }
      canvas.hidden = false;
      engine = createOrbitEngine(THREE, canvas, context, items);
      if (disposed) { engine.dispose(); engine = undefined; return; }
      root.dataset.orbitReady = 'true';
      engine.resize(); time = preference.matches ? 6 : 0; paint(); sync();
    } catch { unavailable(); }
    finally { loading = false; }
  };

  const view = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  view.observe(root);
  const size = new ResizeObserver(() => { if (engine?.resize()) { dirty = true; request(); } });
  size.observe(stage);

  stage.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' && !drag) return;
    pointerPoint = pointToNdc(event.clientX, event.clientY);
    if (drag && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; stage.setPointerCapture(event.pointerId); stage.dataset.dragging = 'true'; setHover(null); }
      if (drag.moved) {
        const next = drag.spin + dx / Math.max(260, stage.clientWidth * .55) * Math.PI;
        const dt = Math.max(.008, (event.timeStamp - drag.lastTime) / 1000);
        spinVelocity = spinVelocity * .5 + (next - input.spin) / dt * .5;
        input.spin = next; drag.lastX = event.clientX; drag.lastTime = event.timeStamp; dirty = true;
      }
    }
    if (!animated()) { updateHover(); request(); }
  }, { passive: true, signal: events.signal });
  stage.addEventListener('pointerleave', () => { if (!drag) { pointerPoint = null; setHover(null); request(); } }, { signal: events.signal });
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || !engine) return;
    drag = { id: event.pointerId, x: event.clientX, spin: input.spin, lastX: event.clientX, lastTime: event.timeStamp, moved: false };
    spinVelocity = 0;
  }, { signal: events.signal });
  const release = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.moved) { suppressClick = performance.now() + 300; if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId); }
    if (event.timeStamp - drag.lastTime > 120) spinVelocity = 0;
    spinVelocity = Math.max(-3, Math.min(3, spinVelocity));
    drag = null; delete stage.dataset.dragging;
    if (event.pointerType === 'touch') pointerPoint = null;
    request();
  };
  stage.addEventListener('pointerup', release, { signal: events.signal });
  stage.addEventListener('pointercancel', release, { signal: events.signal });
  stage.addEventListener('click', event => {
    if (!engine || performance.now() < suppressClick) return;
    const point = pointToNdc(event.clientX, event.clientY), item = engine.pick(point.x, point.y);
    if (item) window.location.assign(item.href);
  }, { signal: events.signal });
  toggle?.addEventListener('click', () => {
    const value = !paused(); document.documentElement.dataset.motionPaused = String(value);
    window.dispatchEvent(new CustomEvent('portfolio:motion-state', { detail: { paused: value } }));
  }, { signal: events.signal });
  window.addEventListener('portfolio:motion-state', sync, { signal: events.signal });
  document.addEventListener('visibilitychange', sync, { signal: events.signal });
  preference.addEventListener('change', sync, { signal: events.signal });
  canvas.addEventListener('webglcontextlost', event => { if (!disposed) { event.preventDefault(); unavailable(); } }, { signal: events.signal });
  list.addEventListener('focusin', event => {
    const slug = (event.target as HTMLElement).closest<HTMLElement>('[data-orbit-slug]')?.dataset.orbitSlug;
    const item = items.find(entry => entry.slug === slug); if (item) { setHover(item); request(); }
  }, { signal: events.signal });
  list.addEventListener('focusout', () => { setHover(null); request(); }, { signal: events.signal });

  const dispose = () => {
    if (disposed) return; disposed = true; stop(); events.abort(); view.disconnect(); size.disconnect();
    engine?.dispose(); engine = undefined;
    const fresh = canvas.cloneNode(false) as HTMLCanvasElement; fresh.hidden = true; canvas.replaceWith(fresh);
    delete root.dataset.orbitReady; root.dataset.orbitState = 'waiting'; delete label.dataset.visible;
    if (toggle) { toggle.hidden = true; toggle.disabled = true; }
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
