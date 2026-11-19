import { gsap } from 'gsap';

interface ExpressiveMotionOptions {
  signal: AbortSignal;
  preference: MediaQueryList;
}

type ScrollSurface = {
  element: HTMLElement;
  anchor: HTMLElement;
  top: number;
  height: number;
  visible: boolean;
  rotation: number;
  move: (value: number) => void;
  turn?: (value: number) => void;
};

// Navigation progress, chapter indicator, subtle picture depth and magnetic CTA.
export function setupExpressiveMotion({ signal, preference }: ExpressiveMotionOptions) {
  const controller = new AbortController();
  const localSignal = controller.signal;
  const media = gsap.matchMedia();
  const root = document.documentElement;
  const progressBars = Array.from(document.querySelectorAll<HTMLElement>('[data-page-progress]'));
  const previousProgress = [root, ...progressBars].map((element) => ({
    element, value: element.style.getPropertyValue('--page-progress'),
  }));
  let disposed = false;
  let frame = 0;
  let geometryDirty = true;
  let surfaces: ScrollSurface[] = [];

  const update = () => {
    frame = 0;
    if (disposed || document.hidden) return;
    const scroll = window.scrollY;
    const viewport = window.innerHeight;
    const distance = Math.max(1, root.scrollHeight - viewport);
    if (geometryDirty) {
      surfaces.forEach((surface) => {
        const box = surface.anchor.getBoundingClientRect();
        surface.top = box.top + scroll;
        surface.height = box.height;
      });
      geometryDirty = false;
    }
    const progress = gsap.utils.clamp(0, 1, scroll / distance).toFixed(4);
    [root, ...progressBars].forEach((element) => element.style.setProperty('--page-progress', progress));
    surfaces.forEach((surface) => {
      if (!surface.visible) return;
      const position = gsap.utils.clamp(0, 1, (viewport + scroll - surface.top) / (viewport + surface.height));
      surface.move(36 - 58 * position);
      surface.turn?.(surface.rotation * (1 - 2 * position));
    });
  };
  const schedule = () => {
    if (!disposed && !document.hidden && !frame) frame = window.requestAnimationFrame(update);
  };
  const measure = () => { geometryDirty = true; schedule(); };
  window.addEventListener('scroll', schedule, { passive: true, signal: localSignal });
  window.addEventListener('resize', measure, { passive: true, signal: localSignal });
  document.addEventListener('load', measure, { capture: true, signal: localSignal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    } else measure();
  }, { signal: localSignal });
  const sizeObserver = new ResizeObserver(measure);
  sizeObserver.observe(document.body);
  document.fonts?.ready.then(() => { if (!disposed) measure(); });

  const chapters = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-chapter-nav] a[href^="#"]'))
    .map((link) => {
      const hash = link.getAttribute('href')?.slice(1) ?? '';
      let id = hash;
      try { id = decodeURIComponent(hash); } catch { /* An authored raw id still works. */ }
      return { link, section: document.getElementById(id), visible: false, top: 0 };
    }).filter((chapter): chapter is typeof chapter & { section: HTMLElement } => Boolean(chapter.section));
  const chapterOriginals = chapters.map(({ link }) => ({
    link, current: link.getAttribute('aria-current'), active: link.getAttribute('data-active'),
  }));
  const chapterNav = document.querySelector<HTMLElement>('[data-chapter-nav]');
  const previousChapterTone = chapterNav?.style.getPropertyValue('--chapter-tone') ?? '';
  const activate = (selected: HTMLAnchorElement) => {
    const dotTone = selected.style.getPropertyValue('--chapter-dot').trim();
    if (chapterNav && dotTone) chapterNav.style.setProperty('--chapter-tone', dotTone);
    chapters.forEach(({ link }) => {
      const active = link === selected;
      link.dataset.active = String(active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  if (chapters[0]) activate(chapters[0].link);
  const chapterObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const chapter = chapters.find(({ section }) => section === entry.target);
      if (chapter) { chapter.visible = entry.isIntersecting; chapter.top = entry.boundingClientRect.top; }
    });
    const visible = chapters.filter((chapter) => chapter.visible);
    if (visible.length) {
      visible.sort((a, b) => Math.abs(a.top) - Math.abs(b.top));
      activate(visible[0].link);
    }
  }, { rootMargin: '-12% 0px -55% 0px', threshold: [0, 0.15, 0.35, 0.6, 1] });
  chapters.forEach(({ section }) => chapterObserver.observe(section));

  media.add({
    motion: '(prefers-reduced-motion: no-preference)',
    fine: '(hover: hover) and (pointer: fine)',
    desktop: '(min-width: 900px)',
  }, (context) => {
    const { motion, fine, desktop } = context.conditions!;
    if (!motion || preference.matches) return;

    const observedSurfaces: ScrollSurface[] = [];
    document.querySelectorAll<HTMLElement>('[data-scroll-layer]').forEach((element) => {
      if (!desktop) return;
      gsap.set(element, { y: 0, rotation: 0 });
      observedSurfaces.push({
        element, anchor: element.parentElement ?? element,
        top: 0, height: 1, visible: false,
        rotation: gsap.utils.clamp(-3, 3, Number(element.dataset.rotation) || 0),
        move: gsap.quickSetter(element, 'y', 'px') as (value: number) => void,
        turn: gsap.quickSetter(element, 'rotation', 'deg') as (value: number) => void,
      });
    });
    surfaces = observedSurfaces;
    const surfaceObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const surface = observedSurfaces.find(({ element }) => element === entry.target);
        if (surface) surface.visible = entry.isIntersecting;
      });
      schedule();
    }, { rootMargin: '50px 0px' });
    observedSurfaces.forEach(({ element }) => surfaceObserver.observe(element));
    measure();
    context.add(() => () => {
      surfaceObserver.disconnect();
      if (surfaces === observedSurfaces) surfaces = [];
    });

    if (!fine) return;
    const pointer = new AbortController();
    const magnets = Array.from(document.querySelectorAll<HTMLElement>('a[data-magnetic], button[data-magnetic]'))
      .map((hitbox) => {
        const body = hitbox.querySelector<HTMLElement>('[data-magnet-body]');
        if (!body) return undefined;
        return {
          hitbox, body,
          x: gsap.quickTo(body, 'x', { duration: 0.36, ease: 'power3.out' }),
          y: gsap.quickTo(body, 'y', { duration: 0.36, ease: 'power3.out' }),
        };
      }).filter((magnet): magnet is NonNullable<typeof magnet> => Boolean(magnet));
    let activeMagnet: typeof magnets[number] | undefined;
    let magnetBox: DOMRect | undefined;
    let magnetDirty = false;
    let modalOpen = Boolean(document.querySelector('dialog[open]'));
    const release = (immediate = false) => {
      if (activeMagnet) {
        [activeMagnet.x, activeMagnet.y].forEach((to) => {
          to(0);
          if (immediate) to.tween.progress(1).pause();
        });
      }
      activeMagnet = undefined;
      magnetBox = undefined;
    };
    const modalObserver = new MutationObserver(() => {
      modalOpen = Boolean(document.querySelector('dialog[open]'));
      if (modalOpen) release(true);
    });
    document.querySelectorAll('dialog').forEach((dialog) => {
      modalObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    });
    const dirtyMagnet = () => { magnetDirty = true; };
    window.addEventListener('scroll', dirtyMagnet, { passive: true, signal: pointer.signal });
    window.addEventListener('resize', dirtyMagnet, { passive: true, signal: pointer.signal });
    document.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch' || document.hidden || modalOpen) { release(true); return; }
      const target = event.target instanceof Element ? event.target : undefined;
      const hitbox = target?.closest<HTMLElement>('a[data-magnetic], button[data-magnetic]');
      const nextMagnet = magnets.find((magnet) => magnet.hitbox === hitbox);
      if (nextMagnet !== activeMagnet) {
        release();
        activeMagnet = nextMagnet;
        magnetDirty = true;
      }
      if (activeMagnet && magnetDirty) {
        magnetBox = activeMagnet.hitbox.getBoundingClientRect();
        magnetDirty = false;
      }
      if (activeMagnet && magnetBox) {
        const x = gsap.utils.clamp(-1, 1, (event.clientX - magnetBox.left) / Math.max(1, magnetBox.width) * 2 - 1);
        const y = gsap.utils.clamp(-1, 1, (event.clientY - magnetBox.top) / Math.max(1, magnetBox.height) * 2 - 1);
        const radius = Math.max(1, Math.hypot(x, y));
        activeMagnet.x(x / radius * 7);
        activeMagnet.y(y / radius * 7);
      }
    }, { passive: true, signal: pointer.signal });
    root.addEventListener('pointerleave', () => release(), { signal: pointer.signal });
    window.addEventListener('blur', () => release(true), { signal: pointer.signal });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Tab' || event.key === 'Escape') release();
    }, { signal: pointer.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) release(true);
    }, { signal: pointer.signal });
    context.add(() => () => {
      pointer.abort();
      modalObserver.disconnect();
      magnets.forEach((magnet) => { magnet.x.tween.kill(); magnet.y.tween.kill(); });
    });
  });

  const close = () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    window.cancelAnimationFrame(frame);
    media.revert();
    sizeObserver.disconnect();
    chapterObserver.disconnect();
    previousProgress.forEach(({ element, value }) => {
      if (value) element.style.setProperty('--page-progress', value);
      else element.style.removeProperty('--page-progress');
    });
    if (chapterNav) {
      if (previousChapterTone) chapterNav.style.setProperty('--chapter-tone', previousChapterTone);
      else chapterNav.style.removeProperty('--chapter-tone');
    }
    chapterOriginals.forEach(({ link, current, active }) => {
      if (current === null) link.removeAttribute('aria-current');
      else link.setAttribute('aria-current', current);
      if (active === null) link.removeAttribute('data-active');
      else link.setAttribute('data-active', active);
    });
    signal.removeEventListener('abort', close);
  };
  signal.addEventListener('abort', close, { once: true });
  if (signal.aborted) close();
  else schedule();
  return close;
}
