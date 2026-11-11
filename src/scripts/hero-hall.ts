import type { HallEngine, HallItem } from './hero-hall-engine';

type Options = { signal: AbortSignal; preference: MediaQueryList };

/** Lazy WebGL hall behind the home spotlight. The CSS table remains the fallback. */
export function setupHeroHall({ signal, preference }: Options): () => void {
  const root = document.querySelector<HTMLElement>('[data-works-spotlight]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-hall-canvas]');
  if (!root || !canvas || signal.aborted) return () => {};
  const picks = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-spotlight-pick]'));
  const items: HallItem[] = picks.map(button => ({ name: button.dataset.name ?? '', tone: button.style.getPropertyValue('--tone').trim() || '#9cdef1', src: button.dataset.image ?? '', href: button.dataset.href ?? '#' }));
  const events = new AbortController();
  let engine: HallEngine | undefined, loading = false, failed = false, disposed = false, visible = false;
  let frame = 0, last = 0, time = 0, active = Number(root.dataset.active) || 0;
  const fine = matchMedia('(hover:hover) and (pointer:fine)');
  const paused = () => document.documentElement.dataset.motionPaused === 'true';
  const animated = () => !!engine && visible && !document.hidden && !paused() && !preference.matches;

  const render = (now: number) => {
    frame = 0;
    if (!engine || disposed) return;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60; last = now;
    if (animated()) time += dt;
    try { engine.draw(time, animated() ? dt : 1); } catch { fail(); return; }
    if (animated()) frame = requestAnimationFrame(render); else last = 0;
  };
  const request = () => { if (!frame && engine && visible && !disposed) frame = requestAnimationFrame(render); };
  const fail = () => {
    if (failed || disposed) return; failed = true; cancelAnimationFrame(frame); frame = 0;
    engine?.dispose(); engine = undefined; delete root.dataset.glReady; canvas.hidden = true;
  };
  const load = async () => {
    if (loading || engine || failed || disposed) return;
    loading = true;
    try {
      const [T, reflector, composer, renderPass, bloom, output, { createHallEngine }] = await Promise.all([
        import('three'), import('three/addons/objects/Reflector.js'), import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/OutputPass.js'), import('./hero-hall-engine'),
      ]);
      if (disposed) return;
      const context = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
      if (!context) { fail(); return; }
      canvas.hidden = false; root.dataset.glReady = 'true';
      engine = createHallEngine(T, { Reflector: reflector.Reflector, EffectComposer: composer.EffectComposer, RenderPass: renderPass.RenderPass, UnrealBloomPass: bloom.UnrealBloomPass, OutputPass: output.OutputPass }, canvas, context, items);
      engine.resize(); engine.setActive(active, true); request();
    } catch { fail(); }
    finally { loading = false; }
  };

  const point = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    return { x: (event.clientX - box.left) / Math.max(1, box.width) * 2 - 1, y: (event.clientY - box.top) / Math.max(1, box.height) * 2 - 1 };
  };
  root.addEventListener('works-spotlight:change', event => {
    active = (event as CustomEvent<{ index: number }>).detail.index;
    engine?.setActive(active, preference.matches); request();
  }, { signal: events.signal });
  root.addEventListener('pointermove', event => {
    if (!engine || event.pointerType === 'touch' || !fine.matches) return;
    const box = root.getBoundingClientRect(), local = point(event);
    const overCanvas = event.target === canvas;
    // Off the canvas the pointer still steers the lean and camera, but hovers no screen.
    engine.setPointer((event.clientX - box.left) / box.width * 2 - 1, (event.clientY - box.top) / box.height * 2 - 1, overCanvas ? local.x : 9, overCanvas ? local.y : 9, !preference.matches);
    request();
    requestAnimationFrame(() => { canvas.style.cursor = engine?.hovered() == null ? '' : 'pointer'; });
  }, { passive: true, signal: events.signal });
  root.addEventListener('pointerleave', () => { engine?.setPointer(0, 0, 9, 9, false); canvas.style.cursor = ''; request(); }, { signal: events.signal });
  // Drag to turn the hall; release snaps to the nearest screen, a flick goes one further.
  let drag: { id: number; x: number; lastX: number; time: number; velocity: number; moved: boolean } | null = null;
  let suppressClick = 0;
  const hold = (value: boolean) => root.dispatchEvent(new CustomEvent('works-spotlight:hold', { detail: value }));
  const angleFor = (dx: number) => {
    if (!engine) return 0;
    // Dragging left brings the next screen (to the right) into view.
    const raw = dx / Math.max(240, canvas.clientWidth * .34) * engine.spread;
    // Rubber band past the first and last screens.
    const min = -(engine.count - 1 - active) * engine.spread, max = active * engine.spread;
    const over = raw < min ? raw - min : raw > max ? raw - max : 0;
    return raw - over + over * .3;
  };
  canvas.addEventListener('pointerdown', event => {
    if (!engine || !event.isPrimary || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, lastX: event.clientX, time: event.timeStamp, velocity: 0, moved: false };
  }, { signal: events.signal });
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId || !engine) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; canvas.setPointerCapture(event.pointerId); root.dataset.dragging = 'true'; hold(true); }
    if (!drag.moved) return;
    const dt = Math.max(.008, (event.timeStamp - drag.time) / 1000);
    drag.velocity = drag.velocity * .6 + (event.clientX - drag.lastX) / dt * .4;
    drag.lastX = event.clientX; drag.time = event.timeStamp;
    engine.setDrag(angleFor(dx)); request();
  }, { passive: true, signal: events.signal });
  const endDrag = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const state = drag; drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!state.moved || !engine) return;
    delete root.dataset.dragging; suppressClick = performance.now() + 320;
    const fling = event.timeStamp - state.time > 120 ? 0 : state.velocity * .22;
    const angle = angleFor(event.clientX - state.x + fling);
    const target = Math.max(0, Math.min(engine.count - 1, active + Math.round(-angle / engine.spread)));
    engine.release(target);
    if (target !== active) root.dispatchEvent(new CustomEvent('works-spotlight:pick', { detail: { index: target } }));
    hold(false); request();
  };
  canvas.addEventListener('pointerup', endDrag, { signal: events.signal });
  canvas.addEventListener('pointercancel', endDrag, { signal: events.signal });
  canvas.addEventListener('click', event => {
    if (!engine || performance.now() < suppressClick) return;
    const { x, y } = point(event as PointerEvent), index = engine.pick(x, y);
    if (index === null) return;
    if (index === active) window.location.assign(items[index].href);
    else root.dispatchEvent(new CustomEvent('works-spotlight:pick', { detail: { index } }));
  }, { signal: events.signal });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(); }, { signal: events.signal });
  const sync = () => { if (visible && !engine) void load(); request(); };
  window.addEventListener('portfolio:motion-state', sync, { signal: events.signal });
  document.addEventListener('visibilitychange', () => { last = 0; sync(); }, { signal: events.signal });
  preference.addEventListener('change', sync, { signal: events.signal });
  const view = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  view.observe(root);
  const size = new ResizeObserver(() => { if (engine?.resize()) request(); });
  size.observe(canvas);

  const dispose = () => {
    if (disposed) return; disposed = true; cancelAnimationFrame(frame); events.abort(); view.disconnect(); size.disconnect();
    engine?.dispose(); engine = undefined; delete root.dataset.glReady;
    const fresh = canvas.cloneNode(false) as HTMLCanvasElement; fresh.hidden = true; canvas.replaceWith(fresh);
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
