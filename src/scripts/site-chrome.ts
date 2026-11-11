// The floating header steps aside while scrolling down and returns when scrolling up.
const header = document.querySelector<HTMLElement>('[data-site-header]');
if (header) {
  let last = scrollY, frame = 0;
  const update = () => {
    frame = 0;
    const y = scrollY, delta = y - last;
    header.dataset.scrolled = String(y > 24);
    if (header.contains(document.activeElement)) header.dataset.hidden = 'false';
    else if (y < 120 || delta < -6) header.dataset.hidden = 'false';
    else if (delta > 8) header.dataset.hidden = 'true';
    if (Math.abs(delta) > 6) last = y;
  };
  addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(update); }, { passive: true });
  header.addEventListener('focusin', () => { header.dataset.hidden = 'false'; });
  update();
}
