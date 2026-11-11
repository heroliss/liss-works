type Options = { signal: AbortSignal; preference: MediaQueryList };

/** Home spotlight: cycles five representative works, with pointer tilt and manual picks. */
export function setupWorksSpotlight({ signal, preference }: Options): () => void {
  const root = document.querySelector<HTMLElement>('[data-works-spotlight]');
  if (!root || signal.aborted) return () => {};
  const prints = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-spotlight-print]'));
  const picks = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-spotlight-pick]'));
  const card = root.querySelector<HTMLElement>('.works-spotlight__card');
  const hook = root.querySelector<HTMLElement>('[data-spotlight-hook]');
  const name = root.querySelector<HTMLElement>('[data-spotlight-name]');
  const summary = root.querySelector<HTMLElement>('[data-spotlight-summary]');
  const link = root.querySelector<HTMLAnchorElement>('[data-spotlight-link]');
  const events = new AbortController(), cycleMs = 5500;
  const fine = matchMedia('(hover:hover) and (pointer:fine)');
  const css = getComputedStyle(root);
  const baseRx = parseFloat(css.getPropertyValue('--rx')) || 54, baseRz = parseFloat(css.getPropertyValue('--rz')) || -9;
  let active = 0, timer: ReturnType<typeof setTimeout> | undefined, visible = true, holding = false, disposed = false;
  let rx = baseRx, rz = baseRz, targetRx = baseRx, targetRz = baseRz, frame = 0, last = 0;
  const paused = () => document.documentElement.dataset.motionPaused === 'true';
  root.style.setProperty('--cycle', `${cycleMs}ms`);

  const show = (index: number, announce = true) => {
    active = (index + prints.length) % prints.length;
    const pick = picks[active];
    prints.forEach((print, i) => { if (i === active) print.dataset.active = 'true'; else delete print.dataset.active; });
    picks.forEach((button, i) => button.setAttribute('aria-pressed', String(i === active)));
    root.dataset.active = String(active);
    root.style.setProperty('--tone', pick.style.getPropertyValue('--tone'));
    if (hook) hook.textContent = pick.dataset.hook ?? '';
    if (name) name.textContent = pick.dataset.name ?? '';
    if (summary) summary.textContent = pick.dataset.summary ?? '';
    if (link) link.href = pick.dataset.href ?? '#';
    if (card && announce && !preference.matches) { delete card.dataset.changing; void card.offsetWidth; card.dataset.changing = 'true'; }
    root.dispatchEvent(new CustomEvent('works-spotlight:change', { detail: { index: active } }));
    schedule();
  };
  const cycling = () => visible && !holding && !paused() && !preference.matches && !document.hidden;
  const schedule = () => {
    clearTimeout(timer); timer = undefined;
    // Restart the progress bar on the pressed pick.
    delete root.dataset.cycling;
    if (!cycling()) return;
    void root.offsetWidth; root.dataset.cycling = 'true';
    timer = setTimeout(() => show(active + 1), cycleMs);
  };

  const tick = (now: number) => {
    frame = 0; if (disposed) return;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60; last = now;
    const ease = 1 - Math.exp(-dt * 5);
    rx += (targetRx - rx) * ease; rz += (targetRz - rz) * ease;
    root.style.setProperty('--rx', `${rx.toFixed(2)}deg`); root.style.setProperty('--rz', `${rz.toFixed(2)}deg`);
    if (Math.abs(targetRx - rx) > .01 || Math.abs(targetRz - rz) > .01) frame = requestAnimationFrame(tick); else last = 0;
  };
  const request = () => { if (!frame) frame = requestAnimationFrame(tick); };
  root.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || !fine.matches || preference.matches) return;
    const box = root.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width * 2 - 1, y = (event.clientY - box.top) / box.height * 2 - 1;
    targetRx = baseRx + y * 7; targetRz = baseRz + x * 9; request();
  }, { passive: true, signal: events.signal });
  root.addEventListener('pointerleave', () => { targetRx = baseRx; targetRz = baseRz; request(); }, { signal: events.signal });

  prints.forEach((print, index) => {
    print.addEventListener('pointerenter', () => { if (fine.matches && index !== active) show(index); holding = true; schedule(); }, { signal: events.signal });
    print.addEventListener('pointerleave', () => { holding = false; schedule(); }, { signal: events.signal });
    print.addEventListener('click', event => { if (index !== active) { event.preventDefault(); show(index); } }, { signal: events.signal });
  });
  picks.forEach((button, index) => button.addEventListener('click', () => show(index), { signal: events.signal }));
  root.addEventListener('works-spotlight:pick', event => show((event as CustomEvent<{ index: number }>).detail.index), { signal: events.signal });
  root.addEventListener('works-spotlight:hold', event => { holding = (event as CustomEvent<boolean>).detail; schedule(); }, { signal: events.signal });
  const copy = root.querySelector<HTMLElement>('.works-spotlight__card');
  copy?.addEventListener('pointerenter', () => { holding = true; schedule(); }, { signal: events.signal });
  copy?.addEventListener('pointerleave', () => { holding = false; schedule(); }, { signal: events.signal });
  root.addEventListener('focusin', () => { holding = true; schedule(); }, { signal: events.signal });
  root.addEventListener('focusout', () => { holding = false; schedule(); }, { signal: events.signal });
  window.addEventListener('portfolio:motion-state', schedule, { signal: events.signal });
  document.addEventListener('visibilitychange', schedule, { signal: events.signal });
  preference.addEventListener('change', schedule, { signal: events.signal });
  const view = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); });
  view.observe(root);
  show(0, false);

  const dispose = () => {
    if (disposed) return; disposed = true; clearTimeout(timer); cancelAnimationFrame(frame); events.abort(); view.disconnect();
    root.style.removeProperty('--rx'); root.style.removeProperty('--rz'); delete root.dataset.cycling;
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
