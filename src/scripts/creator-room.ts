import type { CreatorCharacter } from './creator-character';
import type { CreatorEngine } from './creator-engine';
import type { CreatorPointer } from './creator-performance-types';

type Options = { signal: AbortSignal; preference: MediaQueryList };

/** The module is cheap on every other page. Geometry and WebGL are loaded only
 * after an actual creator-room is found and reaches the viewport. */
export function setupCreatorRoom({ signal, preference }: Options): () => void {
  const root = document.querySelector<HTMLElement>('[data-creator-room]');
  if (!root || signal.aborted) return () => {};
  const canvas = root.querySelector<HTMLCanvasElement>('[data-creator-canvas]')!;
  const stage = root.querySelector<HTMLElement>('[data-creator-stage]')!;
  const fallback = root.querySelector<HTMLElement>('[data-creator-fallback]')!;
  const status = root.querySelector<HTMLElement>('[data-creator-status]')!;
  const toggle = root.querySelector<HTMLButtonElement>('[data-creator-motion-toggle]')!;
  const label = root.querySelector<HTMLElement>('[data-creator-motion-label]')!;
  const events = new AbortController(), urls = new Set<string>(), timers = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false, visible = false, loading = false, failed = false, engine: CreatorEngine | undefined;
  let frame = 0, last = 0, time = 0, needsPaint = false, lastPointerTime = 0;
  const pointer: CreatorPointer = { x: 0, y: 0, active: 0, speed: 0 };
  const neutral: CreatorPointer = { x: 0, y: 0, active: 0, speed: 0 };
  const captureQuery = import.meta.env.DEV ? new URLSearchParams(location.search) : undefined;
  const captureTime = captureQuery?.has('capture') && captureQuery.has('pose') ? Number(captureQuery.get('pose')) : NaN;
  let bounds = { left: 0, top: 0, width: 1, height: 1 };
  const saved = { state: root.dataset.roomState, canvas: canvas.hidden, fallback: fallback.hidden, text: status.textContent };
  const paused = () => document.documentElement.dataset.motionPaused === 'true';
  const measure = () => {
    if (disposed) return;
    const box = stage.getBoundingClientRect();
    bounds = { left: box.left + scrollX, top: box.top + scrollY, width: box.width, height: box.height };
    try {
      if (engine?.resize()) needsPaint = true;
      if (visible && !document.hidden && engine && needsPaint && (paused() || preference.matches)) { engine.repaint(); needsPaint = false; }
    } catch { unavailable(); }
  };
  const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
  const canAnimate = () => !disposed && !!engine && visible && !document.hidden && !paused() && !preference.matches;
  const render = (now: number) => {
    frame = 0;
    if (!canAnimate()) return;
    frame = requestAnimationFrame(render);
    if (last && now - last < 1000 / 30 - 1) return;
    const dt = last ? Math.min(.08, (now - last) / 1000) : 0;
    last = now; time += dt;
    pointer.speed *= Math.exp(-dt * 5);
    try { engine!.draw(Number.isFinite(captureTime) ? captureTime : time, pointer, dt); }
    catch { unavailable(); return; }
    needsPaint = false;
  };
  const sync = () => {
    if (disposed) return;
    toggle.hidden = !engine;
    toggle.disabled = !engine || preference.matches;
    toggle.setAttribute('aria-pressed', String(paused()));
    label.textContent = preference.matches ? '静态场景' : paused() ? '继续场景' : '暂停场景';
    if (!engine) { if (visible && !document.hidden && !failed && !loading) void load(); return; }
    root.dataset.roomState = preference.matches ? 'static' : paused() ? 'paused' : document.hidden || !visible ? 'suspended' : 'playing';
    if (canAnimate()) { if (!frame) frame = requestAnimationFrame(render); }
    else {
      stop(); pointer.x = pointer.y = pointer.active = pointer.speed = 0;
      if (visible && !document.hidden) {
        try {
          if (preference.matches) { engine.draw(7, neutral, 0); needsPaint = false; }
          else if (needsPaint) { engine.repaint(); needsPaint = false; }
        } catch { unavailable(); }
      }
    }
  };
  const unavailable = () => {
    if (disposed || failed) return;
    failed = true; stop(); engine?.dispose(); engine = undefined;
    canvas.hidden = true; fallback.hidden = false; toggle.hidden = true;
    root.dataset.roomState = 'fallback';
    status.textContent = '此浏览器暂时无法展开实时空间。静态桌面与文字仍可正常查看。';
  };
  let exportButton: HTMLButtonElement | undefined;
  const addExport = () => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('capture') || exportButton) return;
    exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.dataset.creatorExport = '';
    exportButton.textContent = '保存创作场景静帧'; root.querySelector('figcaption')?.append(exportButton);
    exportButton.addEventListener('click', () => {
      if (!engine || disposed) return;
      engine.repaint();
      canvas.getContext('webgl2')?.finish();
      canvas.toBlob(blob => {
        if (!blob || disposed) return;
        const url = URL.createObjectURL(blob); urls.add(url);
        const link = document.createElement('a'); link.href = url; link.download = 'creator-room.png'; link.click();
        const timer = setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); timers.delete(timer); }, 1500); timers.add(timer);
      }, 'image/png');
    }, { signal: events.signal });
  };
  const load = async () => {
    if (loading || engine || failed || disposed || !visible || document.hidden) return;
    loading = true; root.dataset.roomState = 'loading';
    let stagedActor: CreatorCharacter | undefined;
    try {
      const [THREE, { loadCreatorCharacter }, { createRoomEngine }] = await Promise.all([
        import('three'), import('./creator-character'), import('./creator-engine'),
      ]);
      if (disposed) return;
      if (!visible || document.hidden) { root.dataset.roomState = 'waiting'; return; }
      const asset = root.dataset.creatorCharacter;
      if (!asset) throw new Error('Missing local creator character');
      stagedActor = await loadCreatorCharacter(THREE, new THREE.Group(), { url: asset, signal: events.signal });
      if (disposed) return;
      if (!visible || document.hidden) { root.dataset.roomState = 'waiting'; return; }
      const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
      if (!context) { unavailable(); return; }
      engine = createRoomEngine(THREE, canvas, stage, context, stagedActor); stagedActor = undefined;
      if (disposed) { engine.dispose(); engine = undefined; return; }
      measure(); engine.draw(preference.matches ? 7 : Number.isFinite(captureTime) ? captureTime : time, neutral, 0); needsPaint = false;
      fallback.hidden = true; canvas.hidden = false; addExport(); sync();
    } catch { unavailable(); }
    finally {
      stagedActor?.dispose(); loading = false;
      if (!engine && !failed && !disposed && visible && !document.hidden) sync();
    }
  };
  const view = new IntersectionObserver(([entry]) => {
    if (disposed) return;
    visible = entry.isIntersecting;
    if (visible && !engine) void load();
    sync();
  }); view.observe(stage);
  const size = new ResizeObserver(measure); size.observe(stage);
  toggle.addEventListener('click', () => {
    const value = !paused(); document.documentElement.dataset.motionPaused = String(value);
    window.dispatchEvent(new CustomEvent('portfolio:motion-state', { detail: { paused: value } }));
  }, { signal: events.signal });
  stage.addEventListener('pointerenter', event => { measure(); if (event.pointerType !== 'touch') pointer.active = 1; }, { signal: events.signal });
  stage.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || !canAnimate()) return;
    const x = Math.max(-1, Math.min(1, (event.pageX - bounds.left) / Math.max(1, bounds.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.pageY - bounds.top) / Math.max(1, bounds.height) * 2 - 1));
    const now = performance.now(), delta = Math.max(.016, (now - lastPointerTime) / 1000);
    pointer.speed = Math.min(1, Math.hypot(x - pointer.x, y - pointer.y) / delta * .16);
    pointer.x = x; pointer.y = y; pointer.active = 1; lastPointerTime = now;
  }, { passive: true, signal: events.signal });
  stage.addEventListener('pointerleave', () => { pointer.x = pointer.y = pointer.active = pointer.speed = 0; }, { signal: events.signal });
  window.addEventListener('portfolio:motion-state', sync, { signal: events.signal });
  document.addEventListener('visibilitychange', sync, { signal: events.signal });
  preference.addEventListener('change', sync, { signal: events.signal });
  canvas.addEventListener('webglcontextlost', event => { if (!disposed) { event.preventDefault(); unavailable(); } }, { signal: events.signal });
  const dispose = () => {
    if (disposed) return; disposed = true; stop(); events.abort(); view.disconnect(); size.disconnect(); engine?.dispose(); engine = undefined;
    exportButton?.remove(); urls.forEach(url => URL.revokeObjectURL(url)); timers.forEach(clearTimeout); urls.clear(); timers.clear();
    canvas.hidden = saved.canvas; fallback.hidden = saved.fallback; status.textContent = saved.text;
    // A restored BFCache page must get a fresh WebGL context after the previous
    // renderer explicitly lost its context during disposal.
    const freshCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
    freshCanvas.removeAttribute('width'); freshCanvas.removeAttribute('height'); canvas.replaceWith(freshCanvas);
    toggle.hidden = true; toggle.disabled = true; toggle.setAttribute('aria-pressed', 'false'); label.textContent = '暂停场景';
    if (saved.state === undefined) delete root.dataset.roomState; else root.dataset.roomState = saved.state;
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
