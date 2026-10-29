import { gsap } from 'gsap';

type Options = { signal: AbortSignal; preference: MediaQueryList };

/** Only recessed light planes move. Nodes, fields, buttons and results remain
 * stationary, and the real algorithm is owned by the workbench component. */
export function setupLabRoomMotion({ signal, preference }: Options): () => void {
  const room = document.querySelector<HTMLElement>('[data-lab-room]');
  if (!room || signal.aborted) return () => {};
  const documentRoot = document.documentElement;
  const events = new AbortController();
  const media = gsap.matchMedia();
  const toggle = room.querySelector<HTMLButtonElement>('[data-lab-motion-toggle]');
  const label = toggle?.querySelector<HTMLElement>('[data-lab-motion-label]');
  const saved = { disabled: toggle?.disabled, pressed: toggle?.getAttribute('aria-pressed'), label: label?.textContent, state: room.dataset.labRoomState };
  let disposed = false;
  let resync = () => {};
  const paused = () => documentRoot.dataset.motionPaused === 'true';
  const syncButton = () => {
    if (toggle) { toggle.disabled = false; toggle.setAttribute('aria-pressed', String(paused())); }
    if (label) label.textContent = paused() ? '恢复动态' : '暂停动态';
    resync();
  };
  toggle?.addEventListener('click', () => {
    const value = !paused();
    documentRoot.dataset.motionPaused = String(value);
    window.dispatchEvent(new CustomEvent('portfolio:motion-state', { detail: { paused: value } }));
  }, { signal: events.signal });
  window.addEventListener('portfolio:motion-state', syncButton, { signal: events.signal });
  syncButton();

  media.add({ motion: '(prefers-reduced-motion: no-preference)', fine: '(hover: hover) and (pointer: fine)' }, context => {
    if (!context.conditions!.motion || !context.conditions!.fine) {
      room.dataset.labRoomState = context.conditions!.motion ? 'static' : 'reduced';
      return () => { delete room.dataset.labRoomState; };
    }
    const local = new AbortController();
    let active = true, held = false, frame = 0;
    const fields = Array.from(room.querySelectorAll<HTMLElement>('[data-lab-field]')).map(element => {
      const owner = element.closest<HTMLElement>('.graph-pane, .evolution-display') ?? room;
      return { element, owner, visible: false, inside: false, x: 0, y: 0,
        box: { left: 0, top: 0, width: 1, height: 1 },
        amplitude: owner === room ? [14, 9] : [8, 5],
        xTo: gsap.quickTo(element, 'x', { duration: 1, ease: 'power3.out' }),
        yTo: gsap.quickTo(element, 'y', { duration: 1, ease: 'power3.out' }),
      };
    });
    const tweens = fields.flatMap(field => [field.xTo, field.yTo]);
    const allowed = () => active && !held && !paused() && !document.hidden && !preference.matches;
    const reset = (field: typeof fields[number], immediate = false) => {
      field.x = field.y = 0;
      [field.xTo, field.yTo].forEach(to => { to(0); if (immediate) to.tween.progress(1).pause(); });
    };
    const apply = (field: typeof fields[number], x: number, y: number) => {
      if (!allowed() || !field.visible) return;
      field.x = x; field.y = y;
      field.xTo(x * field.amplitude[0]); field.yTo(y * field.amplitude[1]);
    };
    const measure = () => {
      frame = 0; if (!active) return;
      const boxes = new Map<HTMLElement, DOMRect>();
      fields.forEach(field => { if (!boxes.has(field.owner)) boxes.set(field.owner, field.owner.getBoundingClientRect()); });
      fields.forEach(field => { const b = boxes.get(field.owner)!; field.box = { left: b.left + scrollX, top: b.top + scrollY, width: b.width, height: b.height }; });
    };
    const schedule = () => { if (active && !frame) frame = requestAnimationFrame(measure); };
    const gate = () => {
      if (!active) return;
      if (document.hidden) held = false;
      room.dataset.labRoomState = preference.matches ? 'reduced' : paused() || document.hidden ? 'paused' : 'ready';
      fields.forEach(field => {
        if (!allowed() || !field.visible) reset(field, true);
        else if (field.owner !== room && field.owner.contains(document.activeElement)) apply(field, .2, -.2);
      });
    };
    resync = gate;
    const view = new IntersectionObserver(entries => {
      if (!active) return;
      entries.forEach(entry => fields.filter(field => field.owner === entry.target).forEach(field => { field.visible = entry.isIntersecting; }));
      gate();
    });
    const size = new ResizeObserver(schedule);
    new Set(fields.map(field => field.owner)).forEach(owner => { view.observe(owner); size.observe(owner); });
    measure();
    room.addEventListener('pointerenter', schedule, { signal: local.signal });
    room.addEventListener('pointermove', event => {
      if (!allowed() || event.pointerType === 'touch') return;
      fields.forEach(field => {
        const inside = event.target instanceof Node && field.owner.contains(event.target);
        if (!inside) { if (field.inside) reset(field); field.inside = false; return; }
        field.inside = true;
        const x = gsap.utils.clamp(-1, 1, (event.pageX - field.box.left) / Math.max(1, field.box.width) * 2 - 1);
        const y = gsap.utils.clamp(-1, 1, (event.pageY - field.box.top) / Math.max(1, field.box.height) * 2 - 1);
        apply(field, x, y);
      });
    }, { passive: true, signal: local.signal });
    room.addEventListener('pointerleave', () => { fields.forEach(field => { field.inside = false; if (!held) reset(field, !allowed()); }); }, { signal: local.signal });
    room.addEventListener('pointerdown', event => { if (event.isPrimary && event.button === 0) { held = true; tweens.forEach(to => to.tween.pause()); } }, { signal: local.signal });
    const release = () => {
      if (!held) return; held = false;
      fields.forEach(field => { if (!allowed() || !field.visible || !field.inside) reset(field, !allowed()); else apply(field, field.x, field.y); });
    };
    window.addEventListener('pointerup', release, { signal: local.signal });
    window.addEventListener('pointercancel', release, { signal: local.signal });
    window.addEventListener('blur', () => { held = false; fields.forEach(field => { field.inside = false; reset(field, true); }); }, { signal: local.signal });
    room.addEventListener('focusin', () => { fields.forEach(field => { if (field.owner !== room && field.owner.contains(document.activeElement)) apply(field, .2, -.2); }); }, { signal: local.signal });
    room.addEventListener('focusout', event => { fields.forEach(field => { if (field.owner !== room && !(event.relatedTarget instanceof Node && field.owner.contains(event.relatedTarget)) && !field.inside && !held) reset(field); }); }, { signal: local.signal });
    window.addEventListener('resize', schedule, { signal: local.signal });
    document.addEventListener('visibilitychange', gate, { signal: local.signal });
    preference.addEventListener('change', gate, { signal: local.signal });
    gate();
    return () => {
      active = false; held = false; local.abort(); cancelAnimationFrame(frame);
      view.disconnect(); size.disconnect(); resync = () => {};
      delete room.dataset.labRoomState;
    };
  });

  const dispose = () => {
    if (disposed) return; disposed = true; events.abort(); media.revert();
    if (toggle) { toggle.disabled = saved.disabled ?? true; if (saved.pressed === null || saved.pressed === undefined) toggle.removeAttribute('aria-pressed'); else toggle.setAttribute('aria-pressed', saved.pressed); }
    if (label) label.textContent = saved.label ?? '暂停动态';
    if (saved.state === undefined) delete room.dataset.labRoomState; else room.dataset.labRoomState = saved.state;
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
