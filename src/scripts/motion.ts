import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { setupPortfolioMotion } from './portfolio-motion';
import { setupExpressiveMotion } from './expressive-motion';
import { setupProjectMotion } from './project-motion';
import { setupProjectAtmosphere } from './project-atmosphere';
import { setupDetailWorldMotion } from './detail-world-motion';
import { setupShowcaseNarratives } from './showcase-narratives';
import { setupArchiveAtlas } from './archive-atlas';
import { setupExplorationInvitation } from './exploration-invitation';
import { setupFooterMotion } from './footer-motion';
import { setupProjectEnding } from './project-ending';
import { setupLabRoomMotion } from './lab-room-motion';
import { setupAboutStudioMotion } from './about-studio-motion';
import { setupCreatorRoom } from './creator-room';

gsap.registerPlugin(ScrollTrigger);

// Every page is complete before this module runs. Motion enhances that readable
// state; no CSS class or loading gate is needed to reveal the actual content.
let dispose: (() => void) | undefined;
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
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let heroPlayed = false;
  const revealed = new WeakSet<Element>();
  const shuttered = new WeakSet<Element>();
  const refresh = () => {
    if (disposed) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      // Lazy pictures must not interrupt an in-flight native chapter scroll.
      if (!disposed && !preference.matches) ScrollTrigger.refresh(true);
    }, 100);
  };

  media.add(
    {
      motion: '(prefers-reduced-motion: no-preference)',
      reduced: '(prefers-reduced-motion: reduce)',
      desktop: '(min-width: 900px)',
    },
    (context) => {
      const { motion, desktop } = context.conditions!;
      root.dataset.motion = motion ? 'ready' : 'reduced';
      if (!motion) return;

      // The title remains fully opaque even on the first frame. Four parts at
      // most are coordinated into one short load sequence.
      const hero = Array.from(document.querySelectorAll<HTMLElement>('[data-motion="hero"]')).slice(0, 4);
      if (hero.length && !heroPlayed) {
        heroPlayed = true;
        gsap.timeline({ defaults: { ease: 'expo.out', duration: 0.8 } }).fromTo(
          hero,
          { y: 12 },
          { y: 0, stagger: 0.08, clearProps: 'transform' },
        );
      }

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

      // One real project image opens as a shutter. Only the picture is masked:
      // the title and supporting copy remain readable throughout. The mask is
      // applied when its timeline starts, never as a prerequisite for content.
      document.querySelectorAll<HTMLElement>('[data-motion="shutter"]').forEach((container) => {
        const pictureFrame = container.hasAttribute('data-motion-picture')
          ? container
          : container.querySelector<HTMLElement>('[data-motion-picture]');
        // Mask the bitmap, keeping its link hitbox and caption available while
        // the shutter opens. A first click must work during the entrance too.
        const picture = pictureFrame?.querySelector<HTMLImageElement>('img') ?? pictureFrame;
        if (!picture || shuttered.has(picture)) return;
        const image = picture.matches('img') ? picture : picture.querySelector<HTMLImageElement>('img');
        const opening = gsap.timeline({
          defaults: { duration: 1.1, ease: 'expo.out' },
          onStart: () => { shuttered.add(picture); },
          scrollTrigger: {
            trigger: picture,
            start: 'top 85%',
            once: true,
          },
        });
        opening.fromTo(picture,
          { clipPath: 'inset(0 0 100% 0)' },
          { clipPath: 'inset(0 0 0% 0)', immediateRender: false, clearProps: 'clipPath' },
          0,
        );
        if (image) {
          opening.fromTo(image,
            { scale: 1.06 },
            { scale: 1, immediateRender: false, clearProps: 'transform' },
            0,
          );
        }
      });

      // The native scrollbar controls one quiet movement of the real work.
      // Travel remains under 6% of the picture height, including short sheets.
      if (desktop) {
        document.querySelectorAll<HTMLElement>('[data-motion="sheet"]').forEach((sheet) => {
          const travel = () => Math.min(16, sheet.offsetHeight * 0.03);
          gsap.fromTo(
            sheet,
            { y: travel },
            {
              y: () => -travel(),
              ease: 'none',
              scrollTrigger: {
                trigger: sheet,
                start: 'clamp(top 75%)',
                end: 'clamp(bottom top)',
                scrub: true,
                invalidateOnRefresh: true,
              },
            },
          );
        });
      }
    },
  );

  const disposePortfolio = setupPortfolioMotion({ signal, preference });
  const disposeExpressive = setupExpressiveMotion({ signal, preference });
  const disposeProjects = setupProjectMotion({ signal, preference });
  const disposeAtmosphere = setupProjectAtmosphere({ signal, preference });
  const disposeDetails = setupDetailWorldMotion({ signal, preference });
  const disposeNarratives = setupShowcaseNarratives({ signal, preference });
  const disposeAtlas = setupArchiveAtlas({ signal, preference });
  const disposeInvitation = setupExplorationInvitation({ signal, preference });
  const disposeFooter = setupFooterMotion({ signal, preference });
  const disposeEnding = setupProjectEnding({ signal, preference });
  const disposeLabRoom = setupLabRoomMotion({ signal, preference });
  const disposeAboutStudio = setupAboutStudioMotion({ signal, preference });
  const disposeCreatorRoom = setupCreatorRoom({ signal, preference });
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
    disposePortfolio();
    disposeExpressive();
    disposeProjects();
    disposeAtmosphere();
    disposeDetails();
    disposeNarratives();
    disposeAtlas();
    disposeInvitation();
    disposeFooter();
    disposeEnding();
    disposeLabRoom();
    disposeAboutStudio();
    disposeCreatorRoom();
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
