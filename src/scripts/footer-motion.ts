import { gsap } from 'gsap';

type FooterMotionOptions = { signal: AbortSignal; preference: MediaQueryList };

/** Only the reflected light moves. All footer links retain native hit areas. */
export function setupFooterMotion({ signal, preference }: FooterMotionOptions): () => void {
  const footer = document.querySelector<HTMLElement>('[data-site-footer]');
  const light = footer?.querySelector<HTMLElement>('[data-footer-light]');
  if (signal.aborted || !footer || !light) return () => {};
  const previousState = footer.getAttribute('data-footer-state');
  const media = gsap.matchMedia();
  let disposed = false;

  media.add({ all:'all', fine: '(hover: hover) and (pointer: fine)', motion: '(prefers-reduced-motion: no-preference)' }, (context) => {
    if (!context.conditions?.fine || !context.conditions?.motion || preference.matches) {
      footer.dataset.footerState = preference.matches ? 'reduced' : 'static';
      return;
    }
    const events = new AbortController();
    let active = true;
    let visible = false;
    let bounds = { left:0, top:0, width:1, height:1 };
    const xTo = gsap.quickTo(light, 'x', { duration:.95, ease:'power3.out' });
    const yTo = gsap.quickTo(light, 'y', { duration:.95, ease:'power3.out' });
    const measure = () => {
      if (!active || disposed) return;
      const rect = footer.getBoundingClientRect();
      bounds = { left:rect.left + window.scrollX, top:rect.top + window.scrollY, width:rect.width, height:rect.height };
    };
    const canMove = () => active && !disposed && visible && !document.hidden && document.documentElement.dataset.motionPaused !== 'true';
    const reset = (immediate = false) => {
      [xTo,yTo].forEach(to => { to(0); if (immediate) to.tween.progress(1).pause(); });
    };
    const gate = () => {
      if (!active || disposed) return;
      footer.dataset.footerState = document.documentElement.dataset.motionPaused === 'true' ? 'paused' : document.hidden ? 'hidden' : visible ? 'ready' : 'offscreen';
      if (!canMove()) reset(true);
    };
    const size = new ResizeObserver(measure);
    size.observe(footer);
    const view = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; gate(); }, { threshold:.04 });
    view.observe(footer);
    measure();
    gate();
    footer.addEventListener('pointerenter', measure, { signal:events.signal });
    footer.addEventListener('pointermove', event => {
      if (!canMove() || event.pointerType === 'touch') return;
      const x = gsap.utils.clamp(-1,1,(event.pageX-bounds.left)/Math.max(1,bounds.width)*2-1);
      const y = gsap.utils.clamp(-1,1,(event.pageY-bounds.top)/Math.max(1,bounds.height)*2-1);
      xTo(x*10); yTo(y*6);
    }, { passive:true, signal:events.signal });
    footer.addEventListener('pointerleave', () => reset(!canMove()), { signal:events.signal });
    window.addEventListener('resize', measure, { signal:events.signal });
    window.addEventListener('blur', () => reset(true), { signal:events.signal });
    window.addEventListener('portfolio:motion-state', gate, { signal:events.signal });
    document.addEventListener('visibilitychange', gate, { signal:events.signal });
    return () => { active = false; events.abort(); size.disconnect(); view.disconnect(); };
  });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    media.revert();
    if (previousState === null) delete footer.dataset.footerState;
    else footer.setAttribute('data-footer-state', previousState);
  };
  signal.addEventListener('abort', dispose, { once:true });
  return dispose;
}
