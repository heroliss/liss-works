import { gsap } from 'gsap';

/** The questions remain native archive links; enhancement only changes the lit page. */
export function setupExplorationInvitation({ signal, preference }: { signal: AbortSignal; preference: MediaQueryList }): () => void {
  const root = document.querySelector<HTMLElement>('[data-exploration-invitation]');
  if (!root || signal.aborted) return () => {};
  const plane = root.querySelector<HTMLElement>('[data-invite-plane]');
  const camera = root.querySelector<HTMLElement>('[data-invite-camera]');
  const light = root.querySelector<HTMLElement>('[data-invite-light]');
  const pictures = Array.from(root.querySelectorAll<HTMLElement>('[data-invite-picture]'));
  const cues = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-invite-cue]'));
  const status = root.querySelector<HTMLElement>('[data-invite-status]');
  if (!plane || !camera || !light || pictures.length !== cues.length) return () => {};
  const events = new AbortController();
  const fine = window.matchMedia('(hover:hover) and (pointer:fine)');
  const saved = { active: root.getAttribute('data-invite-active'), tone: root.style.getPropertyValue('--invite-tone'),
    ambience: root.style.getPropertyValue('--invite-ambience'),
    states: pictures.map(picture => ({ hidden: picture.hidden, inert: picture.inert, style: picture.getAttribute('style'),
      loading: picture.querySelector('img')?.getAttribute('loading') ?? null })),
    cues: cues.map(cue => cue.getAttribute('data-active')) };
  let active = Math.max(0, pictures.findIndex(picture => !picture.hidden));
  let requested = active, ticket = 0, visible = false, held = false, disposed = false, pendingAnnounce = false;
  let paused = document.documentElement.dataset.motionPaused === 'true';
  let bounds = camera.getBoundingClientRect();
  let measuredScrollX = window.scrollX, measuredScrollY = window.scrollY, pointerInside = false;
  let turn: gsap.core.Tween | undefined;
  let palette: gsap.core.Tween | undefined;
  const context = gsap.context(() => {}, root);
  let tiltX!: gsap.QuickToFunc, tiltY!: gsap.QuickToFunc, shiftX!: gsap.QuickToFunc, shiftY!: gsap.QuickToFunc;
  let lightX!: gsap.QuickToFunc, lightY!: gsap.QuickToFunc;
  context.add(() => {
    tiltX = gsap.quickTo(plane, 'rotationX', { duration: .8, ease: 'power3.out' });
    tiltY = gsap.quickTo(plane, 'rotationY', { duration: .8, ease: 'power3.out' });
    shiftX = gsap.quickTo(plane, 'x', { duration: .75, ease: 'power3.out' });
    shiftY = gsap.quickTo(plane, 'y', { duration: .75, ease: 'power3.out' });
    lightX = gsap.quickTo(light, 'x', { duration: 1.05, ease: 'power3.out' });
    lightY = gsap.quickTo(light, 'y', { duration: 1.05, ease: 'power3.out' });
  });
  const movers = [tiltX, tiltY, shiftX, shiftY, lightX, lightY];
  const canMove = () => !disposed && visible && !paused && !preference.matches && !document.hidden;
  const reset = (immediate = false) => {
    if (disposed) return;
    movers.forEach(to => { to(0); if (immediate) to.tween.progress(1).pause(); });
    root.dataset.invitePointer = '0.000,0.000';
  };
  const settle = () => {
    turn?.progress(1); turn?.kill(); turn = undefined;
    palette?.progress(1); palette?.kill(); palette = undefined;
  };
  const gate = () => {
    root.dataset.inviteState = preference.matches ? 'reduced' : paused ? 'paused' : document.hidden ? 'hidden' : visible ? 'ready' : 'offscreen';
    if (!canMove()) { settle(); reset(true); held = false; }
  };
  const choose = async (index: number, announce = false) => {
    if (disposed || held || !pictures[index]) return;
    const alreadyRequested = requested === index;
    pendingAnnounce = alreadyRequested ? pendingAnnounce || announce : announce;
    requested = index;
    if (index === active) {
      ticket++; delete root.dataset.inviteLoading;
      if (pendingAnnounce && status) status.textContent = cues[index].querySelector('.invitation-question__text')?.textContent ?? '';
      return;
    }
    if (alreadyRequested && root.dataset.inviteLoading === 'true') return;
    const id = ++ticket;
    const picture = pictures[index];
    const image = picture.querySelector<HTMLImageElement>('img');
    if (!image) return;
    root.dataset.inviteLoading = 'true';
    image.loading = 'eager';
    try { await image.decode(); } catch { /* A failed preview never changes any native destination. */
      if (id === ticket && !disposed) { delete root.dataset.inviteLoading; requested = active; }
      return;
    }
    if (disposed || id !== ticket) return;
    if (held) { requested = active; delete root.dataset.inviteLoading; return; }
    settle();
    pictures.forEach((entry, i) => { entry.hidden = i !== index; entry.inert = i !== index; });
    cues.forEach((cue, i) => { cue.dataset.active = String(i === index); });
    active = index;
    root.dataset.inviteActive = String(index);
    delete root.dataset.inviteLoading;
    const tone = picture.dataset.inviteTone ?? '#ffd08a';
    // The selected bookmark, question and entry share their colour immediately;
    // only the background light eases between topics.
    root.style.setProperty('--invite-tone', tone);
    if (pendingAnnounce && status) status.textContent = cues[index].querySelector('.invitation-question__text')?.textContent ?? '';
    if (canMove()) context.add(() => {
      turn = gsap.fromTo(picture, { opacity: .35, y: 22, rotationX: -5 },
        { opacity: 1, y: 0, rotationX: 0, duration: .65, ease: 'power3.out', clearProps: 'opacity,transform' });
      palette = gsap.to(root, { '--invite-ambience': tone, duration: .55, ease: 'power2.out' });
    });
    else root.style.setProperty('--invite-ambience', tone);
  };
  cues.forEach((cue, index) => {
    cue.addEventListener('pointermove', event => {
      if (fine.matches && event.pointerType !== 'touch' && (event.movementX || event.movementY)) void choose(index);
    }, { passive: true, signal: events.signal });
    cue.addEventListener('focus', () => { void choose(index, true); }, { signal: events.signal });
  });
  const measure = () => { bounds = camera.getBoundingClientRect(); measuredScrollX = window.scrollX; measuredScrollY = window.scrollY; };
  camera.addEventListener('pointerenter', () => { pointerInside = true; measure(); }, { signal: events.signal });
  camera.addEventListener('pointermove', event => {
    pointerInside = true;
    if (!canMove() || held || !fine.matches || event.pointerType === 'touch') return;
    // This unpinned camera stays in document flow: compensate cached viewport
    // bounds for scrolling without measuring layout in the pointer callback.
    const left = bounds.left - (window.scrollX - measuredScrollX);
    const top = bounds.top - (window.scrollY - measuredScrollY);
    const x = Math.max(-1, Math.min(1, (event.clientX - left) / Math.max(1, bounds.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - top) / Math.max(1, bounds.height) * 2 - 1));
    tiltX(-y * 2); tiltY(x * 2.8); shiftX(x * 4); shiftY(y * 3);
    lightX(x * 28); lightY(y * 18);
    root.dataset.invitePointer = `${x.toFixed(3)},${y.toFixed(3)}`;
  }, { passive: true, signal: events.signal });
  camera.addEventListener('pointerleave', () => { pointerInside = false; if (!held) reset(!canMove()); }, { signal: events.signal });
  root.addEventListener('pointerdown', () => { held = true; movers.forEach(to => to.tween.pause()); turn?.pause(); palette?.pause(); }, { signal: events.signal });
  const release = () => { held = false; if (canMove()) {
    turn?.resume(); palette?.resume();
    if (!pointerInside) reset(); else movers.forEach(to => { if (to.tween.progress() < 1) to.tween.resume(); });
  } else gate(); };
  window.addEventListener('pointerup', release, { signal: events.signal });
  window.addEventListener('pointercancel', release, { signal: events.signal });
  window.addEventListener('blur', () => { held = false; pointerInside = false; settle(); reset(true); }, { signal: events.signal });
  window.addEventListener('portfolio:motion-state', event => {
    const value = (event as CustomEvent<{ paused?: boolean }>).detail?.paused;
    if (typeof value === 'boolean') { paused = value; gate(); }
  }, { signal: events.signal });
  document.addEventListener('visibilitychange', gate, { signal: events.signal });
  preference.addEventListener('change', gate, { signal: events.signal });
  fine.addEventListener('change', () => reset(true), { signal: events.signal });
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; gate(); });
  observer.observe(root);
  const resize = new ResizeObserver(() => { measure(); reset(true); });
  resize.observe(camera);
  gate();
  const dispose = () => {
    if (disposed) return;
    disposed = true; ticket++; events.abort(); observer.disconnect(); resize.disconnect();
    turn?.kill(); palette?.kill(); context.revert();
    pictures.forEach((picture, i) => { picture.hidden = saved.states[i].hidden; picture.inert = saved.states[i].inert;
      const style = saved.states[i].style; if (style === null) picture.removeAttribute('style'); else picture.setAttribute('style', style);
      const image = picture.querySelector('img'); const loading = saved.states[i].loading;
      if (image) { if (loading === null) image.removeAttribute('loading'); else image.setAttribute('loading', loading); } });
    cues.forEach((cue, i) => { const value = saved.cues[i]; if (value === null) cue.removeAttribute('data-active'); else cue.setAttribute('data-active', value); });
    if (saved.active === null) root.removeAttribute('data-invite-active'); else root.setAttribute('data-invite-active', saved.active);
    root.style.setProperty('--invite-tone', saved.tone);
    if (saved.ambience) root.style.setProperty('--invite-ambience', saved.ambience); else root.style.removeProperty('--invite-ambience');
    delete root.dataset.invitePointer; delete root.dataset.inviteState; delete root.dataset.inviteLoading;
    if (status) status.textContent = '';
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
