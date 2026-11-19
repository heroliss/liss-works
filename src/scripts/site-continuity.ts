// Native, same-origin page transitions keep the selected real artifact as the
// visual hand-off. Links and browser history retain their standard behaviour.
const changed = new Map<HTMLElement, string>();
const restore = () => {
  changed.forEach((value, element) => {
    if (value) element.style.viewTransitionName = value;
    else element.style.removeProperty('view-transition-name');
  });
  changed.clear();
};
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!target || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || target.target === '_blank' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let destination: URL;
  try {
    destination = new URL(target.href, location.href);
  } catch {
    return;
  }
  if (destination.origin !== location.origin || !/\/projects\/[^/]+\/?$/.test(destination.pathname)) return;
  restore();
  const picture = target.querySelector<HTMLElement>('img');
  if (!picture) return;
  document.querySelectorAll<HTMLElement>('[data-shared-cover]').forEach((element) => {
    changed.set(element, element.style.viewTransitionName);
    element.style.viewTransitionName = 'none';
  });
  if (!changed.has(picture)) changed.set(picture, picture.style.viewTransitionName);
  picture.style.viewTransitionName = 'project-cover';
}, true);
window.addEventListener('pageshow', restore);
