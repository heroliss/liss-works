import { setupLayeredShowcase } from './layered-showcase';

type Options = { signal: AbortSignal; preference: MediaQueryList };

/** 全国房价交互舆图：进入视野时按四步展开真实界面的空间切片，悬停或点击后交由访客自由查看。 */
export function setupAtlasShowcase(options: Options): () => void {
  return setupLayeredShowcase({
    rootSelector: '[data-atlas-showcase]',
    prefix: 'at',
    order: ['overview', 'match', 'commute', 'xiaoqu'],
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
