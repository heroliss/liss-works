type Options = { signal: AbortSignal; preference: MediaQueryList };

/** Drift, tilt, drag and highlight for the home light table. Pure DOM; no WebGL. */
export function setupWorksTable({ signal, preference }: Options): () => void {
  const root = document.querySelector<HTMLElement>('[data-works-table]');
  if (!root || signal.aborted) return () => {};
  const scene = root.querySelector<HTMLElement>('[data-table-scene]')!;
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-table-row]'));
  const toggle = root.querySelector<HTMLButtonElement>('[data-table-motion]');
  const toggleLabel = root.querySelector<HTMLElement>('[data-table-motion-label]');
  const events = new AbortController();
  const speeds = [-16, 11, -20];
  const fine = matchMedia('(hover:hover) and (pointer:fine)');
  const state = rows.map((row, index) => ({ row, x: 0, width: 1, speed: speeds[index % speeds.length] }));
  const css = getComputedStyle(root);
  const baseRx = parseFloat(css.getPropertyValue('--rx')) || 57, baseRz = parseFloat(css.getPropertyValue('--rz')) || -13;
  let rx = baseRx, rz = baseRz, targetRx = baseRx, targetRz = baseRz;
  let frame = 0, last = 0, visible = true, disposed = false, hovering = false;
  let drag: { id: number; x: number; moved: boolean; last: number; time: number; velocity: number } | null = null;
  let coast = 0, suppressClick = 0;
  const paused = () => document.documentElement.dataset.motionPaused === 'true';
  const drifting = () => !paused() && !preference.matches;

  const measure = () => {
    state.forEach((entry, index) => {
      const run = entry.row.querySelector<HTMLElement>('[data-table-run]');
      const gap = parseFloat(getComputedStyle(entry.row).columnGap) || 0;
      const width = (run?.offsetWidth ?? 1) + gap;
      // Start centred, each row staggered by a part of a card.
      if (entry.width <= 1) entry.x = -width * .5 - index * (run?.firstElementChild as HTMLElement | null ?? run!).offsetWidth * .42;
      entry.width = Math.max(1, width);
    });
    place();
  };
  const wrap = (value: number, width: number) => ((value % width) + width) % width - width;
  const place = () => {
    state.forEach(entry => { entry.x = wrap(entry.x, entry.width); entry.row.style.transform = `translate3d(${entry.x.toFixed(1)}px,0,0)`; });
    root.style.setProperty('--rx', `${rx.toFixed(2)}deg`); root.style.setProperty('--rz', `${rz.toFixed(2)}deg`);
  };
  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible) return;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60; last = now;
    const slow = hovering ? .25 : 1;
    state.forEach(entry => {
      if (!drag) entry.x += (drifting() ? entry.speed * slow : 0) * dt + coast * dt;
    });
    coast *= Math.exp(-dt * 3);
    const ease = 1 - Math.exp(-dt * 5);
    rx += (targetRx - rx) * ease; rz += (targetRz - rz) * ease;
    place();
    const settling = Math.abs(targetRx - rx) > .01 || Math.abs(targetRz - rz) > .01 || Math.abs(coast) > 1;
    if (drifting() || drag || settling) frame = requestAnimationFrame(tick); else last = 0;
  };
  const request = () => { if (!frame && visible && !disposed) frame = requestAnimationFrame(tick); };

  const syncToggle = () => {
    if (!toggle) return;
    toggle.disabled = preference.matches;
    toggle.setAttribute('aria-pressed', String(paused()));
    if (toggleLabel) toggleLabel.textContent = preference.matches ? '静止' : paused() ? '继续漂移' : '暂停漂移';
  };
  toggle?.addEventListener('click', () => {
    const value = !paused(); document.documentElement.dataset.motionPaused = String(value);
    window.dispatchEvent(new CustomEvent('portfolio:motion-state', { detail: { paused: value } }));
    syncToggle(); request();
  }, { signal: events.signal });
  window.addEventListener('portfolio:motion-state', () => { syncToggle(); request(); }, { signal: events.signal });
  preference.addEventListener('change', () => { syncToggle(); request(); }, { signal: events.signal });

  root.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || !fine.matches || preference.matches) return;
    const box = root.getBoundingClientRect();
    const x = (event.clientX - box.left) / Math.max(1, box.width) * 2 - 1, y = (event.clientY - box.top) / Math.max(1, box.height) * 2 - 1;
    // Strong but bounded: about ±7° of pitch and ±9° of turn.
    targetRx = baseRx + y * 7; targetRz = baseRz + x * 9; request();
  }, { passive: true, signal: events.signal });
  root.addEventListener('pointerleave', () => { targetRx = baseRx; targetRz = baseRz; hovering = false; request(); }, { signal: events.signal });
  scene.addEventListener('pointerover', event => { hovering = !!(event.target as Element).closest('[data-table-card]'); }, { signal: events.signal });

  scene.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, moved: false, last: event.clientX, time: event.timeStamp, velocity: 0 }; coast = 0;
  }, { signal: events.signal });
  scene.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.last;
    if (!drag.moved && Math.abs(event.clientX - drag.x) > 6) { drag.moved = true; scene.setPointerCapture(event.pointerId); root.dataset.dragging = 'true'; }
    if (!drag.moved) return;
    // Dragging moves the table under the pointer; deeper rows move a little less.
    state.forEach((entry, index) => { entry.x += dx * (1.25 - index * .12); });
    const dt = Math.max(.008, (event.timeStamp - drag.time) / 1000);
    drag.velocity = drag.velocity * .5 + dx / dt * .5; drag.last = event.clientX; drag.time = event.timeStamp;
    place(); request();
  }, { passive: true, signal: events.signal });
  const release = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.moved) { suppressClick = performance.now() + 320; coast = event.timeStamp - drag.time > 120 ? 0 : Math.max(-900, Math.min(900, drag.velocity)); }
    if (scene.hasPointerCapture(event.pointerId)) scene.releasePointerCapture(event.pointerId);
    drag = null; delete root.dataset.dragging; request();
  };
  scene.addEventListener('pointerup', release, { signal: events.signal });
  scene.addEventListener('pointercancel', release, { signal: events.signal });
  scene.addEventListener('click', event => { if (performance.now() < suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); } }, { capture: true, signal: events.signal });
  scene.addEventListener('dragstart', event => event.preventDefault(), { signal: events.signal });

  root.querySelectorAll<HTMLElement>('[data-table-group]').forEach(chip => {
    const on = () => { root.dataset.highlight = chip.dataset.tableGroup; chip.dataset.active = 'true'; };
    const off = () => { if (root.dataset.highlight === chip.dataset.tableGroup) delete root.dataset.highlight; delete chip.dataset.active; };
    chip.addEventListener('pointerenter', on, { signal: events.signal }); chip.addEventListener('pointerleave', off, { signal: events.signal });
    chip.addEventListener('focus', on, { signal: events.signal }); chip.addEventListener('blur', off, { signal: events.signal });
    // In the library the chips drive the page's own filters instead of navigating.
    chip.addEventListener('click', event => {
      const filter = document.querySelector<HTMLButtonElement>(`[data-group-filter="${chip.dataset.tableGroup}"]`);
      if (!filter) return;
      event.preventDefault();
      const already = filter.getAttribute('aria-pressed') === 'true';
      (already ? document.querySelector<HTMLButtonElement>('[data-group-filter="all"]') ?? filter : filter).click();
      document.querySelector('#atlas-gallery')?.scrollIntoView({ behavior: preference.matches ? 'auto' : 'smooth', block: 'start' });
    }, { signal: events.signal });
  });
  // Mirror the library's current filter result onto the prints.
  window.addEventListener('portfolio:atlas-filter', () => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-atlas-item]'));
    const visible = new Set(items.filter(item => !item.hidden).map(item => item.dataset.atlasItem));
    const filtering = visible.size > 0 && visible.size < items.length;
    if (filtering) root.dataset.filtering = 'true'; else delete root.dataset.filtering;
    root.querySelectorAll<HTMLElement>('[data-table-card]').forEach(card => { card.dataset.match = String(!filtering || visible.has(card.dataset.tableCard)); });
    root.querySelectorAll<HTMLElement>('[data-table-group]').forEach(chip => {
      const pressed = document.querySelector(`[data-group-filter="${chip.dataset.tableGroup}"][aria-pressed="true"]`);
      if (pressed) chip.dataset.selected = 'true'; else delete chip.dataset.selected;
    });
  }, { signal: events.signal });
  root.querySelector<HTMLButtonElement>('[data-table-random]')?.addEventListener('click', event => {
    let pool: string[] = [];
    try { pool = JSON.parse((event.currentTarget as HTMLElement).dataset.pool ?? '[]'); } catch { pool = []; }
    // In the library, jump to a random visible card on the page; elsewhere open a random project.
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-atlas-item]')).filter(card => !card.hidden);
    if (cards.length) {
      const card = cards[Math.floor(Math.random() * cards.length)];
      card.scrollIntoView({ behavior: preference.matches ? 'auto' : 'smooth', block: 'center' });
      card.dataset.pulse = 'true'; setTimeout(() => { delete card.dataset.pulse; }, 1800);
      return;
    }
    if (pool.length) window.location.assign(pool[Math.floor(Math.random() * pool.length)]);
  }, { signal: events.signal });

  const view = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) request(); else { cancelAnimationFrame(frame); frame = 0; last = 0; } });
  view.observe(root);
  const size = new ResizeObserver(() => measure()); size.observe(scene);
  document.addEventListener('visibilitychange', () => { last = 0; request(); }, { signal: events.signal });
  measure(); syncToggle(); request();

  const dispose = () => {
    if (disposed) return; disposed = true; cancelAnimationFrame(frame); events.abort(); view.disconnect(); size.disconnect();
    rows.forEach(row => row.style.removeProperty('transform')); root.style.removeProperty('--rx'); root.style.removeProperty('--rz');
    delete root.dataset.highlight; delete root.dataset.dragging;
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
