import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Flip);

interface PortfolioMotionOptions {
  signal: AbortSignal;
  preference: MediaQueryList;
}

export function setupPortfolioMotion({ signal, preference }: PortfolioMotionOptions) {
  const media = gsap.matchMedia();
  const controller = new AbortController();
  const localSignal = controller.signal;
  const onParentAbort = () => controller.abort();
  signal.addEventListener('abort', onParentAbort, { once: true });
  let interactions = gsap.context(() => {}, document.body);
  const cleanup: (() => void)[] = [];
  const stages = Array.from(document.querySelectorAll<HTMLElement>('[data-work-stage]'));
  const opened = new WeakSet<Element>();

  stages.forEach((stage) => {
    const buttons = Array.from(stage.querySelectorAll<HTMLButtonElement>('button[data-stage-select]'));
    const cards = Array.from(stage.querySelectorAll<HTMLButtonElement>('button[data-stage-card]'));
    const pieces = Array.from(stage.querySelectorAll<HTMLElement>('[data-stage-piece]'));
    const caption = stage.querySelector<HTMLElement>('[data-stage-caption]');
    const name = stage.querySelector<HTMLElement>('[data-stage-name]');
    const category = stage.querySelector<HTMLElement>('[data-stage-category]');
    const links = Array.from(stage.querySelectorAll<HTMLAnchorElement>('[data-stage-link]'));
    let running: gsap.core.Timeline | undefined;
    let layout: gsap.core.Timeline | undefined;
    let revision = 0;
    let held = false;
    let visible = true;
    const region = stage.closest<HTMLElement>('.kinetic-hero') ?? stage;
    const gate = () => {
      if (preference.matches) layout?.progress(1).pause();
      else layout?.paused(held || !visible || document.hidden || document.documentElement.dataset.motionPaused === 'true');
    };
    const settle = () => {
      revision++;
      layout?.revert();
      layout?.kill();
      layout = undefined;
      stage.dataset.stageTransitioning = 'false';
    };
    const select = (value: string, animate: boolean) => {
      const button = buttons.find((entry) => entry.dataset.stageSelect === value);
      if (!button || (animate && stage.dataset.active === value)) return;
      const moving = animate && !preference.matches && document.documentElement.dataset.motionPaused !== 'true';
      // Capture the currently painted pose before retiring a previous or held
      // transition. Fast retargeting therefore starts where the cards are now.
      const before = moving ? Flip.getState(pieces) : undefined;
      settle();
      const turn = revision;
      running?.revert();
      running = undefined;
      stage.dataset.active = value;
      const hero = stage.closest<HTMLElement>('.kinetic-hero');
      if (hero) {
        hero.dataset.active = value;
        if (button.dataset.tone) hero.style.setProperty('--hero-tone', button.dataset.tone);
        if (button.dataset.tone) hero.closest<HTMLElement>('.home-next')?.style.setProperty('--showcase-tone', button.dataset.tone);
      }
      pieces.forEach(piece => {
        piece.dataset.stageOffset = String((Number(piece.dataset.stagePiece) - Number(value) + cards.length) % cards.length);
      });
      buttons.forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
      cards.forEach((entry) => {
        const active = entry.dataset.stageCard === value;
        entry.setAttribute('aria-pressed', String(active));
        const projectName = buttons.find(button => button.dataset.stageSelect === entry.dataset.stageCard)?.dataset.name ?? '';
        entry.setAttribute('aria-label', active ? `打开 ${projectName} 项目` : `将 ${projectName} 切到前景`);
      });
      if (caption && button.dataset.caption) caption.textContent = button.dataset.caption;
      if (name && button.dataset.name) name.textContent = button.dataset.name;
      if (category && button.dataset.category) category.textContent = button.dataset.category;
      if (button.dataset.href) links.forEach((link) => { link.href = button.dataset.href!; });
      stage.dataset.stageTransitioning = String(moving);
      window.dispatchEvent(new CustomEvent('portfolio:stage-select', { detail: { index: Number(value), animate: moving } }));
      if (!moving || !before) return;

      interactions.add(() => {
        layout = Flip.from(before, {
          duration: .82, ease: 'power3.inOut', scale: true,
          onComplete: () => { if (turn === revision) stage.dataset.stageTransitioning = 'false'; },
        });
        running = gsap.timeline({ defaults: { ease: 'power3.out' } });
        if (caption) {
          running.fromTo(caption,
            { y: 5 },
            { y: 0, duration: 0.32, clearProps: 'transform' },
            0.08,
          );
        }
      });
      gate();
    };
    buttons.forEach((button) => {
      button.addEventListener('click', () => select(button.dataset.stageSelect ?? '', true), { signal: localSignal });
      button.addEventListener('pointermove', (event) => {
        // Scrolling or a layout animation under a stationary pointer must not
        // replace a choice made with the keyboard.
        if ((event.movementX || event.movementY) && event.pointerType !== 'touch' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
          select(button.dataset.stageSelect ?? '', true);
        }
      }, { signal: localSignal });
      button.addEventListener('focusin', () => select(button.dataset.stageSelect ?? '', true), { signal: localSignal });
    });
    cards.forEach((card) => {
      // Native activation selects a rear card. Repeating on the front card opens
      // its real project, matching the adjacent explicit project link.
      card.disabled = false;
      card.addEventListener('click', () => {
        if (stage.dataset.active === card.dataset.stageCard && card.dataset.href) window.location.assign(card.dataset.href);
        else select(card.dataset.stageCard ?? '', true);
      }, { signal: localSignal });
    });
    stage.querySelectorAll<HTMLElement>('[data-stage-piece]').forEach((piece) => {
      piece.addEventListener('focusin', (event) => {
        // Focusing a native card must leave its hitbox still until click,
        // Enter or Space activates it. Legacy linked pieces retain focus lift.
        if (event.target instanceof Element && event.target.closest('button[data-stage-card]')) return;
        select(piece.dataset.stagePiece ?? '0', true);
      }, { signal: localSignal });
    });
    select(stage.dataset.active ?? buttons[0]?.dataset.stageSelect ?? '0', false);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; gate(); });
    observer.observe(region);
    region.addEventListener('pointerdown', (event) => {
      if (event.isPrimary && event.button === 0) { held = true; gate(); }
    }, { signal: localSignal });
    const release = () => { held = false; gate(); };
    window.addEventListener('pointerup', release, { signal: localSignal });
    window.addEventListener('pointercancel', release, { signal: localSignal });
    window.addEventListener('blur', release, { signal: localSignal });
    window.addEventListener('resize', settle, { signal: localSignal });
    window.addEventListener('portfolio:motion-state', gate, { signal: localSignal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) held = false; gate(); }, { signal: localSignal });
    preference.addEventListener('change', gate, { signal: localSignal });
    cleanup.push(() => { observer.disconnect(); settle(); running?.revert(); delete stage.dataset.stageTransitioning; });
  });

  media.add(
    {
      motion: '(prefers-reduced-motion: no-preference)',
      reduced: '(prefers-reduced-motion: reduce)',
      desktop: '(min-width: 900px)',
      fine: '(hover: hover) and (pointer: fine)',
    },
    (context) => {
      const { motion, desktop, fine } = context.conditions!;
      if (!motion) return;

      stages.forEach((stage) => {
        const surfaces = Array.from(stage.querySelectorAll<HTMLElement>('[data-stage-image]'));
        const fresh = surfaces.filter((surface) => !opened.has(surface));
        let settled = fresh.length === 0;
        if (fresh.length) {
          fresh.forEach((surface) => opened.add(surface));
          gsap.timeline({
            defaults: { duration: 1.05, ease: 'expo.out' },
            onComplete: () => { settled = true; },
          }).fromTo(fresh,
            { clipPath: 'inset(0 0 100% 0)' },
            {
              clipPath: 'inset(0 0 0% 0)',
              stagger: 0.08, immediateRender: false, clearProps: 'clipPath',
            },
          );
        }

        const objects = stage.querySelector<HTMLElement>('[data-stage-objects]');
        if (desktop && objects) {
          gsap.fromTo(objects,
            { y: 0 },
            {
              y: -36, ease: 'none',
              scrollTrigger: {
                trigger: stage.closest<HTMLElement>('.kinetic-hero') ?? stage,
                start: 'clamp(top top)',
                end: 'clamp(bottom top)',
                scrub: true,
                invalidateOnRefresh: true,
              },
            },
          );
        }

        if (!desktop || !fine || !surfaces.length) return;
        const pointer = new AbortController();
        const region = stage.closest<HTMLElement>('.kinetic-hero') ?? stage;
        const light = region.querySelector<HTMLElement>('[data-pointer-light]');
        const lightX = light ? gsap.quickTo(light, 'x', { duration: 0.9, ease: 'power3.out' }) : undefined;
        const lightY = light ? gsap.quickTo(light, 'y', { duration: 0.9, ease: 'power3.out' }) : undefined;
        const movers = surfaces.map((surface) => {
          return {
            surface, piece: surface.closest<HTMLElement>('[data-stage-piece]')?.dataset.stagePiece,
            restX: 0, restY: 0, restZ: 0,
            x: gsap.quickTo(surface, 'x', { duration: 0.7, ease: 'power3.out' }),
            y: gsap.quickTo(surface, 'y', { duration: 0.7, ease: 'power3.out' }),
            rx: gsap.quickTo(surface, 'rotationX', { duration: 0.8, ease: 'power3.out' }),
            ry: gsap.quickTo(surface, 'rotationY', { duration: 0.8, ease: 'power3.out' }),
            rz: gsap.quickTo(surface, 'rotation', { duration: 0.65, ease: 'power3.out' }),
          };
        });
        let bounds = { left: 0, top: 0, width: 1, height: 1 };
        let inView = true;
        const measure = () => {
          const box = region.getBoundingClientRect();
          // Document coordinates remain valid while the native page scrolls.
          bounds = { left: box.left + window.scrollX, top: box.top + window.scrollY, width: box.width, height: box.height };
        };
        const reset = (immediate = false) => {
          movers.forEach((move) => {
            move.x(0); move.y(0); move.rx(move.restX); move.ry(move.restY); move.rz(move.restZ);
            if (immediate) [move.x, move.y, move.rx, move.ry, move.rz].forEach(to => to.tween.progress(1).pause());
          });
          [lightX, lightY].forEach((to) => {
            if (!to) return;
            to(0);
            if (immediate) to.tween.progress(1).pause();
          });
        };
        const updateRest = (immediate = true) => {
          // Read every pose before writing any transform to avoid layout churn.
          const values = movers.map((move) => {
            const style = getComputedStyle(move.surface);
            return {
              move,
              x: parseFloat(style.getPropertyValue('--card-rest-x')) || 0,
              y: parseFloat(style.getPropertyValue('--card-rest-y')) || 0,
              z: parseFloat(style.getPropertyValue('--card-rest-z')) || 0,
            };
          });
          values.forEach(({ move, x, y, z }) => { move.restX = x; move.restY = y; move.restZ = z; });
          reset(immediate);
        };
        updateRest();
        let pressed = false;
        let resizeFrame = 0;
        const resize = () => {
          cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(() => { measure(); updateRest(); });
        };
        measure();
        const sizeObserver = new ResizeObserver(resize);
        sizeObserver.observe(region);
        window.addEventListener('resize', resize, { signal: pointer.signal });
        const viewObserver = new IntersectionObserver(([entry]) => {
          inView = entry.isIntersecting;
          if (!inView && settled) reset(true);
        });
        viewObserver.observe(region);
        region.addEventListener('pointerenter', measure, { signal: pointer.signal });
        region.addEventListener('pointermove', (event) => {
          if (pressed || stage.dataset.stageTransitioning === 'true' || !settled || !inView || document.hidden || document.documentElement.dataset.motionPaused === 'true' || event.pointerType === 'touch') return;
          const x = gsap.utils.clamp(-1, 1, ((event.pageX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 2);
          const y = gsap.utils.clamp(-1, 1, ((event.pageY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 2);
          movers.forEach((move) => {
            const primary = move.piece === stage.dataset.active;
            move.x(primary ? x*10 : 0);
            move.y(primary ? y*8 : 0);
            move.rx(move.restX-y*5);
            move.ry(move.restY+x*7);
          });
          lightX?.(x * 40);
          lightY?.(y * 30);
        }, { signal: pointer.signal });
        region.addEventListener('pointerdown', (event) => {
          if (!event.isPrimary || event.button !== 0) return;
          pressed = true;
          movers.forEach(move => [move.x, move.y, move.rx, move.ry, move.rz].forEach(to => to.tween.pause()));
        }, { signal: pointer.signal });
        const release = () => {
          const wasPressed = pressed;
          pressed = false;
          if (settled && !region.matches(':hover')) reset();
          else if (wasPressed && inView && !document.hidden && document.documentElement.dataset.motionPaused !== 'true') {
            movers.forEach(move => [move.x, move.y, move.rx, move.ry, move.rz].forEach(to => {
              if (to.tween.progress() < 1) to.tween.resume();
            }));
          }
        };
        window.addEventListener('pointerup', release, { signal: pointer.signal });
        window.addEventListener('pointercancel', release, { signal: pointer.signal });
        window.addEventListener('blur', () => { pressed = false; if (settled) reset(true); }, { signal: pointer.signal });
        window.addEventListener('portfolio:stage-select', (event) => {
          updateRest(!(event as CustomEvent<{ animate?: boolean }>).detail?.animate);
        }, { signal: pointer.signal });
        region.addEventListener('pointerleave', () => {
          if (settled && !pressed) reset();
        }, { signal: pointer.signal });
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) pressed = false;
          if (document.hidden && settled) reset(true);
        }, { signal: pointer.signal });
        window.addEventListener('portfolio:motion-state', () => {
          if (document.documentElement.dataset.motionPaused === 'true' && settled) reset(true);
        }, { signal: pointer.signal });
        context.add(() => () => {
          pointer.abort();
          cancelAnimationFrame(resizeFrame);
          sizeObserver.disconnect();
          viewObserver.disconnect();
        });
      });
    },
  );

  document.querySelectorAll<HTMLElement>('[data-archive]').forEach((archive) => {
    const items = Array.from(archive.querySelectorAll<HTMLElement>('[data-archive-item]'));
    const image = archive.querySelector<HTMLImageElement>('img[data-archive-image]');
    const title = archive.querySelector<HTMLElement>('[data-archive-title]');
    const summary = archive.querySelector<HTMLElement>('[data-archive-summary]');
    const link = archive.querySelector<HTMLAnchorElement>('[data-archive-link]');
    const status = archive.querySelector<HTMLElement>('[data-archive-status]');
    if (!items.length || !image) return;
    let selected: HTMLElement | undefined;
    let displayed: HTMLElement | undefined;
    let ticket = 0;
    let transition: gsap.core.Timeline | undefined;

    const visible = (item: HTMLElement) => !item.closest('[hidden]');
    const mark = (item: HTMLElement) => {
      selected = item;
      items.forEach((entry) => {
        const active = entry === item;
        entry.dataset.selected = String(active);
        entry.dataset.active = String(active);
        entry.querySelectorAll<HTMLButtonElement>('[data-archive-select]').forEach((button) => {
          button.setAttribute('aria-pressed', String(active));
        });
      });
    };

    const choose = async (item: HTMLElement, animate: boolean, announce: boolean) => {
      if (!visible(item)) return;
      archive.dataset.empty = 'false';
      if (selected === item && displayed === item) {
        if (announce && status) status.textContent = `正在预览 ${item.dataset.previewTitle ?? ''}`;
        return;
      }
      mark(item);
      const request = ++ticket;
      const src = item.dataset.previewSrc;
      if (!src) return;
      archive.dataset.loading = 'true';

      // Keep the current finished image on screen until its replacement is
      // decoded. A monotonically increasing ticket prevents old hover requests
      // from winning after a later focus, click or filter change.
      const preload = new Image();
      preload.src = src;
      try {
        await preload.decode();
      } catch {
        if (request !== ticket || localSignal.aborted) return;
        delete archive.dataset.loading;
        if (displayed && visible(displayed)) mark(displayed);
        if (status && announce) status.textContent = '预览暂时无法载入，可以从工程名称打开详情。';
        return;
      }
      if (request !== ticket || localSignal.aborted || !visible(item) || archive.dataset.empty === 'true') return;
      transition?.revert();
      transition = undefined;
      image.removeAttribute('srcset');
      image.removeAttribute('sizes');
      image.src = src;
      image.alt = item.dataset.previewAlt ?? item.dataset.previewTitle ?? '';
      image.width = preload.naturalWidth;
      image.height = preload.naturalHeight;
      if (title) title.textContent = item.dataset.previewTitle ?? '';
      if (summary) summary.textContent = item.dataset.previewSummary ?? '';
      if (link && item.dataset.previewHref) link.href = item.dataset.previewHref;
      const pane = archive.querySelector<HTMLElement>('.archive-preview,.explore-preview');
      if (pane && item.dataset.previewAccent) pane.style.setProperty('--project-tone', item.dataset.previewAccent);
      displayed = item;
      delete archive.dataset.loading;
      if (status && announce) status.textContent = `正在预览 ${item.dataset.previewTitle ?? ''}`;
      if (!animate || preference.matches) return;
      interactions.add(() => {
        transition = gsap.timeline({ defaults: { ease: 'power3.out' } });
        transition.fromTo(image,
          { scale: 1.025, clipPath: 'inset(0 0 0 3%)' },
          { scale: 1, clipPath: 'inset(0 0 0 0%)', duration: 0.46, clearProps: 'transform,clipPath' },
          0,
        );
        if (title) transition.fromTo(title, { x: 7 }, { x: 0, duration: 0.35, clearProps: 'transform' }, 0.04);
      });
    };

    const itemAt = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return undefined;
      const item = target.closest<HTMLElement>('[data-archive-item]');
      return item && items.includes(item) && visible(item) ? item : undefined;
    };
    archive.addEventListener('pointerover', (event) => {
      if (event.pointerType === 'touch') return;
      const item = itemAt(event.target);
      if (item && item !== selected) void choose(item, true, false);
    }, { signal: localSignal });
    archive.addEventListener('focusin', (event) => {
      const item = itemAt(event.target);
      if (item) void choose(item, true, true);
    }, { signal: localSignal });
    archive.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('[data-archive-select]')) return;
      const item = itemAt(target);
      if (item) void choose(item, true, true);
    }, { signal: localSignal });

    const syncFilter = () => {
      const first = items.find(visible);
      if (!first) {
        ticket++;
        archive.dataset.empty = 'true';
        delete archive.dataset.loading;
        return;
      }
      archive.dataset.empty = 'false';
      void choose(first, false, false);
      ScrollTrigger.refresh();
    };
    const observer = new MutationObserver(syncFilter);
    observer.observe(archive, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    syncFilter();
    cleanup.push(() => { ticket++; observer.disconnect(); transition?.revert(); });
  });

  preference.addEventListener('change', () => {
    interactions.revert();
    interactions = gsap.context(() => {}, document.body);
  }, { signal: localSignal });

  return () => {
    controller.abort();
    signal.removeEventListener('abort', onParentAbort);
    media.revert();
    interactions.revert();
    cleanup.forEach((close) => close());
  };
}
