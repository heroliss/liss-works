import { setupLayeredShowcase } from './layered-showcase';

type Options = { signal: AbortSignal; preference: MediaQueryList };

/** 盘序: plays the checkup once in view, points at each panel in turn, and hands over to the visitor. */
export function setupPanxuShowcase(options: Options): () => void {
  return setupLayeredShowcase({
    rootSelector: '[data-panxu]',
    prefix: 'px',
    order: ['scan', 'sort', 'explain', 'clean'],
    autoStartStep: 'scan',
    fallbackStep: 'sort',
    swapMs: 900,
    riseMs: 900,
    pointMs: 1700,
    afterMs: 900,
    tilt: { x: 3.5, y: 5 },
    sheenScale: 25,
    threshold: .3,
    minTiltWidth: 761,
  }, options);
}
