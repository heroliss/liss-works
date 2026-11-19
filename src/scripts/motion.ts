import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

type MotionOptions = { signal: AbortSignal; preference: MediaQueryList };
type Disposer = () => void;

// Every page is complete before this module runs. Motion enhances that readable
// state; no CSS class or loading gate is needed to reveal the actual content.
let dispose: Disposer | undefined;
let pauseBeforePageHide: boolean | undefined;
const pauseStorageKey = 'liss:motion-paused';

function readStoredPause(): boolean | undefined {
  try {
    const value = window.sessionStorage.getItem(pauseStorageKey);
    return value === 'true' ? true : value === 'false' ? false : undefined;
  } catch { return undefined; }
}

function storePause(value: boolean) {
  try { window.sessionStorage.setItem(pauseStorageKey, String(value)); } catch { /* Storage is optional. */ }
}

function restorePause(value: boolean) {
  document.documentElement.dataset.motionPaused = String(value);
  document.querySelectorAll('[data-motion-toggle], [data-detail-motion-toggle]').forEach((button) => {
    button.setAttribute('aria-pressed', String(value));
  });
}

function initializeMotion() {
  dispose?.();
  const storedPause = readStoredPause();
  if (storedPause !== undefined) restorePause(storedPause);

  const root = document.documentElement;
  const abort = new AbortController();
  const { signal } = abort;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const media = gsap.matchMedia();
  const disposers: Disposer[] = [];
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const revealed = new WeakSet<Element>();
  const refresh = () => {
    if (disposed) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      // Lazy pictures must not interrupt an in-flight native chapter scroll.
      if (!disposed && !preference.matches) ScrollTrigger.refresh(true);
    }, 100);
  };

  const options: MotionOptions = { signal, preference };
  const mount = (selector: string, load: () => Promise<(opts: MotionOptions) => Disposer>) => {
    if (!document.querySelector(selector)) return;
    void load().then((setup) => {
      if (disposed || signal.aborted) return;
      const cleanup = setup(options);
      if (disposed || signal.aborted) cleanup();
      else disposers.push(cleanup);
    }).catch(() => { /* Progressive enhancement: keep page usable if a chunk fails to load. */ });
  };

  media.add(
    {
      motion: '(prefers-reduced-motion: no-preference)',
      reduced: '(prefers-reduced-motion: reduce)',
    },
    (context) => {
      const { motion } = context.conditions!;
      root.dataset.motion = motion ? 'ready' : 'reduced';
      if (!motion) return;

      const parts = Array.from(document.querySelectorAll<HTMLElement>('[data-motion="reveal"]'))
        .filter((element) => !revealed.has(element));
      if (parts.length) {
        ScrollTrigger.batch(parts, {
          start: 'top 90%',
          once: true,
          interval: 0.07,
          batchMax: 4,
          onEnter: (batch) => {
            context.add(() => {
              const sequence = gsap.timeline({ defaults: { ease: 'power3.out' } });
              batch.forEach((element, index) => {
                revealed.add(element);
                const picture = element.matches('figure, picture, img, video, [data-motion-picture]');
                const heading = element.matches('h1, h2, h3, h4');
                if (picture) {
                  sequence.fromTo(
                    element,
                    { scale: 1.025, opacity: 0.88 },
                    { scale: 1, opacity: 1, duration: 0.8, clearProps: 'transform,opacity' },
                    index * 0.07,
                  );
                } else {
                  sequence.fromTo(
                    element,
                    { y: heading ? 20 : 12 },
                    { y: 0, duration: heading ? 0.75 : 0.6, clearProps: 'transform' },
                    index * 0.07,
                  );
                }
              });
            });
          },
        });
      }
    },
  );

  // Route-scoped dynamic imports: each page only downloads the controllers its DOM needs.
  mount('[data-chapter-nav], [data-scroll-layer], [data-page-progress], a[data-magnetic], button[data-magnetic]', () => import('./expressive-motion').then(m => m.setupExpressiveMotion));
  mount('[data-works-hall]', () => import('./hero-hall').then(m => m.setupHeroHall));
  mount('[data-ambient-region], .game-scene > .game-art', () => import('./project-motion').then(m => m.setupProjectMotion));
  mount('[data-dub-reel], [data-framework-showcase]', () => import('./showcase-narratives').then(m => m.setupShowcaseNarratives));
  mount('[data-atoll-water]', () => import('./atoll-water').then(m => m.setupAtollWater));
  mount('[data-panxu]', () => import('./panxu-showcase').then(m => m.setupPanxuShowcase));
  mount('[data-atlas-showcase]', () => import('./atlas-showcase').then(m => m.setupAtlasShowcase));
  mount('[data-cost-showcase]', () => import('./cost-chart-showcase').then(m => m.setupCostChartShowcase));
  mount('[data-exploration-invitation]', () => import('./exploration-invitation').then(m => m.setupExplorationInvitation));
  mount('[data-works-table]', () => import('./works-table').then(m => m.setupWorksTable));
  mount('[data-project-atlas]', () => import('./atlas-library').then(m => m.setupAtlasLibrary));
  mount('[data-project-atmosphere]', () => import('./project-atmosphere').then(m => m.setupProjectAtmosphere));
  mount('[data-project-world]', () => import('./detail-world-motion').then(m => m.setupDetailWorldMotion));
  mount('[data-project-postscript], [data-project-continuation]', () => import('./project-ending').then(m => m.setupProjectEnding));
  mount('[data-lab-room]', () => import('./lab-room-motion').then(m => m.setupLabRoomMotion));
  mount('[data-works-orbit]', () => import('./works-orbit').then(m => m.setupWorksOrbit));
  mount('[data-about-studio], [data-studio-lost]', () => import('./about-studio-motion').then(m => m.setupAboutStudioMotion));
  mount('[data-site-footer]', () => import('./footer-motion').then(m => m.setupFooterMotion));

  if (storedPause !== undefined) {
    window.dispatchEvent(new CustomEvent('portfolio:motion-state', { detail: { paused: storedPause } }));
  }

  preference.addEventListener('change', () => {
    root.dataset.motion = preference.matches ? 'reduced' : 'ready';
    refresh();
  }, { signal });

  document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    if (image.complete) return;
    image.addEventListener('load', refresh, { once: true, signal });
    image.addEventListener('error', refresh, { once: true, signal });
  });
  document.fonts?.ready.then(refresh);

  dispose = () => {
    if (disposed) return;
    disposed = true;
    abort.abort();
    clearTimeout(refreshTimer);
    while (disposers.length) disposers.pop()?.();
    media.revert();
    delete root.dataset.motion;
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMotion, { once: true });
} else {
  initializeMotion();
}

document.addEventListener('astro:page-load', initializeMotion);
document.addEventListener('astro:before-swap', () => dispose?.());
window.addEventListener('portfolio:motion-state', (event) => {
  const value = (event as CustomEvent<{ paused?: unknown }>).detail?.paused;
  if (typeof value !== 'boolean') return;
  pauseBeforePageHide = value;
  storePause(value);
});
window.addEventListener('pagehide', () => {
  const stored = document.documentElement.getAttribute('data-motion-paused');
  pauseBeforePageHide = stored === null
    ? Boolean(document.querySelector('[data-motion-toggle][aria-pressed="true"], [data-detail-motion-toggle][aria-pressed="true"]'))
    : stored === 'true';
  storePause(pauseBeforePageHide);
  dispose?.();
});
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  const latestPause = readStoredPause() ?? pauseBeforePageHide;
  if (latestPause !== undefined) {
    // Disposal restores authored defaults. Put the visitor's choice back before
    // homepage and detail modules read their respective root/button state.
    restorePause(latestPause);
  }
  initializeMotion();
});
