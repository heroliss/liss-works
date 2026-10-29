import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

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
  const architectureRuns: { element: HTMLElement; play: () => void; played: () => boolean; finish: () => void }[] = [];

  stages.forEach((stage) => {
    const buttons = Array.from(stage.querySelectorAll<HTMLButtonElement>('button[data-stage-select]'));
    const surfaces = Array.from(stage.querySelectorAll<HTMLElement>('[data-stage-image]'));
    const caption = stage.querySelector<HTMLElement>('[data-stage-caption]');
    const links = Array.from(stage.querySelectorAll<HTMLAnchorElement>('[data-stage-link]'));
    let running: gsap.core.Timeline | undefined;
    const select = (value: string, animate: boolean) => {
      const button = buttons.find((entry) => entry.dataset.stageSelect === value);
      if (!button) return;
      running?.revert();
      running = undefined;
      stage.dataset.active = value;
      buttons.forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
      if (caption && button.dataset.caption) caption.textContent = button.dataset.caption;
      if (button.dataset.href) links.forEach((link) => { link.href = button.dataset.href!; });
      if (!animate || preference.matches) return;

      // Outer pieces keep their authored CSS position, rotation and transition.
      // Only the inner surface gives the new selection a short settling beat.
      const activeSurface = surfaces.find((surface) => surface.closest<HTMLElement>('[data-stage-piece]')?.dataset.stagePiece === value);
      const activePicture = activeSurface?.querySelector<HTMLImageElement>('img');
      interactions.add(() => {
        running = gsap.timeline({ defaults: { ease: 'power3.out' } });
        if (activePicture) {
          running.fromTo(activePicture,
            { scale: 1.018 },
            { scale: 1, duration: 0.55, clearProps: 'scale' },
            0,
          );
        }
        if (caption) {
          running.fromTo(caption,
            { y: 5 },
            { y: 0, duration: 0.32, clearProps: 'transform' },
            0.08,
          );
        }
      });
    };
    buttons.forEach((button) => button.addEventListener('click', () => {
      select(button.dataset.stageSelect ?? '', true);
    }, { signal: localSignal }));
    stage.querySelectorAll<HTMLElement>('[data-stage-piece]').forEach((piece) => {
      piece.addEventListener('focusin', () => select(piece.dataset.stagePiece ?? '0', true), { signal: localSignal });
    });
    select(stage.dataset.active ?? buttons[0]?.dataset.stageSelect ?? '0', false);
    cleanup.push(() => { running?.revert(); });
  });

  document.querySelectorAll<HTMLElement>('[data-architecture]').forEach((architecture) => {
    // This selector intentionally excludes the arrow marker's path in <defs>.
    const paths = Array.from(architecture.querySelectorAll<SVGPathElement>('.map-connections path'));
    if (!paths.length) return;
    const lengths = paths.map((path) => {
      try { return path.getTotalLength(); } catch { return 0; }
    });
    let running: gsap.core.Timeline | undefined;
    let played = false;
    const complete = () => {
      architecture.dataset.playback = 'complete';
      architecture.setAttribute('aria-busy', 'false');
    };
    const finish = () => { running?.kill(); running = undefined; complete(); };
    const play = () => {
      running?.revert();
      running = undefined;
      played = true;
      if (preference.matches) { complete(); return; }
      architecture.dataset.playback = 'drawing';
      architecture.setAttribute('aria-busy', 'true');
      interactions.add(() => {
        running = gsap.timeline({
          defaults: { duration: 0.45, ease: 'power2.inOut' },
          onComplete: complete,
        });
        paths.forEach((path, index) => {
          if (!lengths[index]) return;
          running!.fromTo(path,
            { strokeDasharray: lengths[index], strokeDashoffset: lengths[index] },
            { strokeDashoffset: 0, clearProps: 'strokeDasharray,strokeDashoffset' },
            index * 0.23,
          );
        });
      });
    };
    architecture.querySelectorAll<HTMLButtonElement>('button[data-architecture-replay]').forEach((button) => {
      button.addEventListener('click', play, { signal: localSignal });
    });
    complete();
    architectureRuns.push({ element: architecture, play, played: () => played, finish });
    cleanup.push(finish);
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

      architectureRuns.forEach((architecture) => {
        if (architecture.played()) return;
        ScrollTrigger.create({
          trigger: architecture.element,
          start: 'top 80%',
          once: true,
          onEnter: () => { if (!architecture.played()) architecture.play(); },
        });
      });

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
            { clipPath: 'inset(0 0 100% 0)', rotationX: 4, rotationY: -3, scale: 1.045 },
            {
              clipPath: 'inset(0 0 0% 0)', rotationX: 0, rotationY: 0, scale: 1,
              stagger: 0.1, immediateRender: false, clearProps: 'clipPath,transform',
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
                trigger: stage,
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
        const movers = surfaces.map((surface, index) => {
          const depth = 0.55 + (index % 3) * 0.2;
          return {
            depth,
            x: gsap.quickTo(surface, 'x', { duration: 0.7, ease: 'power3.out' }),
            y: gsap.quickTo(surface, 'y', { duration: 0.7, ease: 'power3.out' }),
            rx: gsap.quickTo(surface, 'rotationX', { duration: 0.8, ease: 'power3.out' }),
            ry: gsap.quickTo(surface, 'rotationY', { duration: 0.8, ease: 'power3.out' }),
          };
        });
        let bounds = stage.getBoundingClientRect();
        stage.addEventListener('pointerenter', () => { bounds = stage.getBoundingClientRect(); }, { signal: pointer.signal });
        stage.addEventListener('pointermove', (event) => {
          if (!settled || event.pointerType === 'touch') return;
          const x = gsap.utils.clamp(-1, 1, ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 2);
          const y = gsap.utils.clamp(-1, 1, ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 2);
          movers.forEach((move) => {
            move.x(x * 12 * move.depth);
            move.y(y * 10 * move.depth);
            move.rx(-y * 1.6 * move.depth);
            move.ry(x * 1.8 * move.depth);
          });
        }, { signal: pointer.signal });
        stage.addEventListener('pointerleave', () => {
          if (!settled) return;
          movers.forEach((move) => { move.x(0); move.y(0); move.rx(0); move.ry(0); });
        }, { signal: pointer.signal });
        context.add(() => () => pointer.abort());
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
    architectureRuns.forEach((architecture) => architecture.finish());
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
