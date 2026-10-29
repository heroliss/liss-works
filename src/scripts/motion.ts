import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { setupPortfolioMotion } from './portfolio-motion';
import { setupExpressiveMotion } from './expressive-motion';
import { setupSignalField } from './signal-field';

gsap.registerPlugin(ScrollTrigger);

// Every page is complete before this module runs. Motion enhances that readable
// state; no CSS class or loading gate is needed to reveal the actual content.
let dispose: (() => void) | undefined;

function initializeMotion() {
  dispose?.();

  const root = document.documentElement;
  const abort = new AbortController();
  const { signal } = abort;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const media = gsap.matchMedia();
  let interactions = gsap.context(() => {}, document.body);
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let heroPlayed = false;
  const revealed = new WeakSet<Element>();
  const shuttered = new WeakSet<Element>();

  const workflows: (() => void)[] = [];

  const refresh = () => {
    if (disposed) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (!disposed && !preference.matches) ScrollTrigger.refresh();
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
        const picture = container.hasAttribute('data-motion-picture')
          ? container
          : container.querySelector<HTMLElement>('[data-motion-picture]');
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
  const disposeSignal = setupSignalField({ signal, preference });

  document.querySelectorAll<HTMLElement>('[data-workflow]').forEach((workflow) => {
    const buttons = Array.from(workflow.querySelectorAll<HTMLButtonElement>('button[data-flow-step]'));
    const nodes = Array.from(workflow.querySelectorAll<HTMLElement | SVGElement>('[data-flow-node]'));
    const paths = Array.from(workflow.querySelectorAll<SVGGeometryElement>('[data-flow-path]'));
    const caption = workflow.querySelector<HTMLElement>('[data-flow-caption]');
    if (!buttons.length) return;
    const initial = buttons.find((button) => button.getAttribute('aria-pressed') === 'true') ?? buttons[0];
    let selected = Number(initial.dataset.flowStep) || 0;
    let running: gsap.core.Timeline | undefined;
    const lengths = paths.map((path) => {
      try { return path.getTotalLength(); } catch { return 0; }
    });

    const select = (step: number, animate: boolean) => {
      const button = buttons.find((entry) => Number(entry.dataset.flowStep) === step);
      if (!button) return;
      selected = step;
      // Revert an interrupted step before drawing the latest one. Killing a
      // timeline alone would leave the previous node slightly scaled or a
      // connector half drawn after rapid clicks.
      running?.revert();
      running = undefined;
      buttons.forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
      nodes.forEach((node, index) => {
        const position = Number(node.dataset.flowNode ?? index);
        node.dataset.active = String(position <= step);
        node.dataset.current = String(position === step);
      });
      paths.forEach((path, index) => {
        path.dataset.active = String(Number(path.dataset.flowPath ?? index) < step);
      });
      workflow.dataset.flowCurrent = String(step);
      if (caption && button.dataset.caption) caption.textContent = button.dataset.caption;
      if (!animate || preference.matches) return;

      interactions.add(() => {
        const current = nodes.find((node, index) => Number(node.dataset.flowNode ?? index) === step);
        running = gsap.timeline({ defaults: { ease: 'power2.out' } });
        if (current) {
          running.fromTo(current,
            { scale: 0.985 },
            { scale: 1, duration: 0.32, transformOrigin: '50% 50%', clearProps: 'transform' },
            0,
          );
        }
        paths.forEach((path, index) => {
          if (!lengths[index] || Number(path.dataset.flowPath ?? index) >= step) {
            gsap.set(path, { clearProps: 'strokeDasharray,strokeDashoffset' });
            return;
          }
          running!.fromTo(path,
            { strokeDasharray: lengths[index], strokeDashoffset: lengths[index] },
            { strokeDashoffset: 0, duration: 0.38, clearProps: 'strokeDasharray,strokeDashoffset' },
            index * 0.08,
          );
        });
        if (caption) {
          running.fromTo(caption,
            { y: 4, opacity: 0.8 },
            { y: 0, opacity: 1, duration: 0.26, clearProps: 'transform,opacity' },
            0.06,
          );
        }
      });
    };

    buttons.forEach((button) => {
      button.addEventListener('click', () => select(Number(button.dataset.flowStep), true), { signal });
    });
    select(selected, false);
    workflows.push(() => { select(selected, false); });
  });

  preference.addEventListener('change', () => {
    interactions.revert();
    interactions = gsap.context(() => {}, document.body);

    workflows.forEach((restore) => restore());
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
    disposeSignal();
    media.revert();
    interactions.revert();

    workflows.forEach((restore) => restore());
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
window.addEventListener('pagehide', () => dispose?.());
window.addEventListener('pageshow', (event) => { if (event.persisted) initializeMotion(); });
