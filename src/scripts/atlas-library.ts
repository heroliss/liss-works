import { gsap } from 'gsap';

type Options = { signal: AbortSignal; preference: MediaQueryList };

/** Library cards: pointer tilt with a following highlight. Filtering lives in project-filter.ts. */
export function setupAtlasLibrary({ signal, preference }: Options): () => void {
  const atlas = document.querySelector<HTMLElement>('[data-project-atlas]');
  if (!atlas || signal.aborted) return () => {};
  const events = new AbortController();
  const fine = matchMedia('(hover:hover) and (pointer:fine)');
  const paused = () => document.documentElement.dataset.motionPaused === 'true';
  const items = Array.from(atlas.querySelectorAll<HTMLElement>('[data-atlas-item]'));
  const resets: (() => void)[] = [];
  items.forEach(item => {
    const surface = item.querySelector<HTMLElement>('[data-atlas-tilt]');
    if (!surface) return;
    const css = getComputedStyle(surface);
    const rx0 = parseFloat(css.getPropertyValue('--atlas-rest-x')) || 0, ry0 = parseFloat(css.getPropertyValue('--atlas-rest-y')) || 0;
    const rx = gsap.quickTo(surface, 'rotationX', { duration: .8, ease: 'power3.out' });
    const ry = gsap.quickTo(surface, 'rotationY', { duration: .8, ease: 'power3.out' });
    let bounds = { left: 0, top: 0, width: 1, height: 1 };
    const shine = surface.querySelector<HTMLElement>('.atlas-tile-shine');
    const reset = () => { rx(rx0); ry(ry0); shine?.style.setProperty('--sheen', '0'); };
    resets.push(() => gsap.set(surface, { clearProps: 'transform' }));
    item.addEventListener('pointerenter', () => { const box = item.getBoundingClientRect(); bounds = { left: box.left, top: box.top, width: box.width, height: box.height }; }, { signal: events.signal });
    item.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' || !fine.matches || preference.matches || paused()) return;
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      rx(rx0 - y * 8); ry(ry0 + x * 11);
      // The reflection slides opposite to the tilt, like light on a turning pane.
      shine?.style.setProperty('--sheen', (-(x * .8 + y * .4)).toFixed(3));
    }, { passive: true, signal: events.signal });
    item.addEventListener('pointerleave', reset, { signal: events.signal });
  });
  const dispose = () => { events.abort(); resets.forEach(fn => fn()); signal.removeEventListener('abort', dispose); };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
