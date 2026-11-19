import { setupLayeredShowcase } from './layered-showcase';

type Options = { signal: AbortSignal; preference: MediaQueryList };

/** Intelligence × Cost：进入视野时按四步展开真实界面的空间切片，悬停或点击后交由访客自由查看。 */
export function setupCostChartShowcase(options: Options): () => void {
  return setupLayeredShowcase({
    rootSelector: '[data-cost-showcase]',
    prefix: 'cc',
    order: ['overview', 'scenario', 'compare', 'sub'],
    autoStartStep: 'overview',
    fallbackStep: 'overview',
    swapMs: 850,
    riseMs: 850,
    pointMs: 1800,
    afterMs: 900,
    tilt: { x: 3.2, y: 4.6 },
    sheenScale: 24,
    threshold: .28,
    minTiltWidth: 901,
  }, options);
}
