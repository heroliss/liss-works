import type { HallEngine, HallItem } from './hero-hall-engine';

type Options = { signal: AbortSignal; preference: MediaQueryList };

/** Lazy WebGL exhibition hall for the home hero. A still row of works is the fallback. */
export function setupHeroHall({ signal, preference }: Options): () => void {
  const root = document.querySelector<HTMLElement>('[data-works-hall]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-hall-canvas]');
  if (!root || !canvas || signal.aborted) return () => {};
  const chips = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-hall-chip]'));
  const label = root.querySelector<HTMLElement>('[data-hall-label]');
  const labelName = root.querySelector<HTMLElement>('[data-hall-label-name]');
  const labelCategory = root.querySelector<HTMLElement>('[data-hall-label-category]');
  const focus = root.querySelector<HTMLElement>('[data-hall-focus]');
  const focusHook = root.querySelector<HTMLElement>('[data-hall-focus-hook]');
  const focusName = root.querySelector<HTMLElement>('[data-hall-focus-name]');
  const focusLink = root.querySelector<HTMLAnchorElement>('[data-hall-focus-link]');
  const items: HallItem[] = chips.map(chip => ({ name: chip.dataset.name ?? '', tone: chip.style.getPropertyValue('--tone').trim() || '#9cdef1', src: chip.dataset.image ?? '', href: chip.getAttribute('href') ?? '#' }));
  const events = new AbortController();
  let engine: HallEngine | undefined, loading = false, failed = false, disposed = false, visible = false;
  let frame = 0, last = 0, time = 0, shownHover: number | null = null;
  let pointerAt = { x: 0, y: 0 };
  const fine = matchMedia('(hover:hover) and (pointer:fine)');
  const paused = () => document.documentElement.dataset.motionPaused === 'true';
  const animated = () => !!engine && visible && !document.hidden && !paused() && !preference.matches;

  const showLabel = (index: number | null) => {
    if (!label) return;
    if (index === null) { delete label.dataset.visible; return; }
    if (labelName) labelName.textContent = items[index].name;
    if (labelCategory) labelCategory.textContent = chips[index].dataset.category ?? '';
    label.style.setProperty('--tone', items[index].tone); label.dataset.visible = 'true';
  };
  // Bring a work to the front of the constellation and update its caption.
  const choose = (index: number) => {
    engine?.select(index);
    chips.forEach((chip, i) => { if (i === index) chip.setAttribute('aria-current', 'true'); else chip.removeAttribute('aria-current'); });
    if (focus) {
      focus.style.setProperty('--tone', items[index].tone);
      if (focusHook) focusHook.textContent = chips[index].dataset.hook ?? '';
      if (focusName) focusName.textContent = items[index].name;
      if (focusLink) focusLink.href = items[index].href;
      if (!preference.matches) { delete focus.dataset.changing; void focus.offsetWidth; focus.dataset.changing = 'true'; }
    }
    request();
  };
  const render = (now: number) => {
    frame = 0;
    if (!engine || disposed) return;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60; last = now;
    if (animated()) time += dt;
    try { engine.draw(time, animated() ? dt : 1); } catch { fail(); return; }
    const hovered = engine.hovered();
    if (hovered !== shownHover) {
      shownHover = hovered; showLabel(hovered); canvas.style.cursor = hovered === null ? '' : 'pointer';
      chips.forEach((chip, i) => { if (i === hovered) chip.dataset.active = 'true'; else delete chip.dataset.active; });
    }
    if (label && hovered !== null) { label.style.setProperty('--lx', `${pointerAt.x + 16}px`); label.style.setProperty('--ly', `${pointerAt.y + 18}px`); }
    if (animated()) frame = requestAnimationFrame(render); else last = 0;
  };
  const request = () => { if (!frame && engine && visible && !disposed) frame = requestAnimationFrame(render); };
  const fail = () => {
    if (failed || disposed) return; failed = true; cancelAnimationFrame(frame); frame = 0;
    engine?.dispose(); engine = undefined; delete root.dataset.glReady; canvas.hidden = true; showLabel(null);
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
      engine.resize(); request();
    } catch { fail(); }
    finally { loading = false; }
  };

  const local = (event: PointerEvent | MouseEvent) => {
    const box = canvas.getBoundingClientRect();
    return { x: (event.clientX - box.left) / Math.max(1, box.width) * 2 - 1, y: (event.clientY - box.top) / Math.max(1, box.height) * 2 - 1 };
  };
  root.addEventListener('pointermove', event => {
    if (!engine || event.pointerType === 'touch' || !fine.matches) return;
    pointerAt = { x: event.clientX, y: event.clientY };
    const box = root.getBoundingClientRect(), point = local(event), overCanvas = event.target === canvas;
    engine.setPointer((event.clientX - box.left) / box.width * 2 - 1, (event.clientY - box.top) / box.height * 2 - 1, overCanvas ? point.x : 9, overCanvas ? point.y : 9, !preference.matches);
    request();
  }, { passive: true, signal: events.signal });
  root.addEventListener('pointerleave', () => { engine?.setPointer(0, 0, 9, 9, false); request(); }, { signal: events.signal });

  // Drag turns the whole hall freely; on release it coasts and settles back.
  let drag: { id: number; x: number; y: number; lastX: number; lastY: number; time: number; velocity: number; velocityY: number; moved: boolean } | null = null;
  let suppressClick = 0;
  const unit = () => Math.max(320, canvas.clientWidth * .5);
  const angleFor = (dx: number) => {
    const raw = dx / unit() * .9, limit = .75;
    return Math.abs(raw) <= limit ? raw : Math.sign(raw) * (limit + (Math.abs(raw) - limit) * .3);
  };
  // Dragging down raises the camera (looking down over the mirror); up lowers it.
  const pitchFor = (dy: number) => dy / Math.max(260, canvas.clientHeight * .6) * .6;
  canvas.addEventListener('pointerdown', event => {
    if (!engine || !event.isPrimary || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, time: event.timeStamp, velocity: 0, velocityY: 0, moved: false };
  }, { signal: events.signal });
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId || !engine) return;
    const dx = event.clientX - drag.x, dy = event.pointerType === 'touch' ? 0 : event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; canvas.setPointerCapture(event.pointerId); root.dataset.dragging = 'true'; }
    if (!drag.moved) return;
    const dt = Math.max(.008, (event.timeStamp - drag.time) / 1000);
    drag.velocity = drag.velocity * .6 + (event.clientX - drag.lastX) / dt * .4;
    drag.velocityY = drag.velocityY * .6 + (event.clientY - drag.lastY) / dt * .4;
    drag.lastX = event.clientX; drag.lastY = event.clientY; drag.time = event.timeStamp;
    engine.setDrag(angleFor(dx), pitchFor(dy)); request();
  }, { passive: true, signal: events.signal });
  const endDrag = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const state = drag; drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!state.moved || !engine) return;
    delete root.dataset.dragging; suppressClick = performance.now() + 320;
    const stale = event.timeStamp - state.time > 120, clamp = (value: number) => Math.max(-2.5, Math.min(2.5, value));
    const velocity = stale ? 0 : state.velocity / unit() * .9, velocityY = stale || event.pointerType === 'touch' ? 0 : pitchFor(state.velocityY);
    engine.release(clamp(velocity), clamp(velocityY)); request();
  };
  canvas.addEventListener('pointerup', endDrag, { signal: events.signal });
  canvas.addEventListener('pointercancel', endDrag, { signal: events.signal });
  // A click on a screen scrolls to that work's chapter instead of leaving the page.
  canvas.addEventListener('click', event => {
    if (!engine || performance.now() < suppressClick) return;
    const point = local(event), index = engine.pick(point.x, point.y);
    if (index === null) return;
    // A side work comes to the front; the front work leads down to its chapter.
    if (index !== engine.selected()) { choose(index); return; }
    document.querySelector(items[index].href)?.scrollIntoView({ behavior: preference.matches ? 'auto' : 'smooth', block: 'start' });
  }, { signal: events.signal });
  chips.forEach((chip, index) => {
    const on = () => { engine?.setHighlight(index); request(); }, off = () => { engine?.setHighlight(null); request(); };
    chip.addEventListener('pointerenter', on, { signal: events.signal }); chip.addEventListener('pointerleave', off, { signal: events.signal });
    chip.addEventListener('focus', on, { signal: events.signal }); chip.addEventListener('blur', off, { signal: events.signal });
    // With the hall running, a chip brings its work forward; without it, the link scrolls as usual.
    chip.addEventListener('click', event => { if (!engine || engine.selected() === index) return; event.preventDefault(); choose(index); }, { signal: events.signal });
  });
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
    engine?.dispose(); engine = undefined; delete root.dataset.glReady; showLabel(null);
    const fresh = canvas.cloneNode(false) as HTMLCanvasElement; fresh.hidden = true; canvas.replaceWith(fresh);
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
