// Native, same-origin page transitions keep the selected real artifact as the
// visual hand-off. Links and browser history retain their standard behaviour.
const changed = new Map<HTMLElement,string>();
const restore = () => {
 changed.forEach((value,element) => { if(value) element.style.viewTransitionName=value; else element.style.removeProperty('view-transition-name'); });
 changed.clear();
};
document.addEventListener('click',(event) => {
 const target=event.target instanceof Element ? event.target.closest<HTMLElement>('a[href], button[data-stage-card][aria-pressed="true"]') : null;
 if(!target || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (target instanceof HTMLAnchorElement && target.target==='_blank') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 const href=target instanceof HTMLAnchorElement ? target.href : target.dataset.href;
 if(!href) return;
 const destination=new URL(href,location.href);
 if(destination.origin!==location.origin || !/\/projects\/[^/]+\/?$/.test(destination.pathname)) return;
 restore();
 let picture:HTMLElement|null=target.querySelector('img');
 if(!picture && target.hasAttribute('data-stage-link')) {
  const stage=target.closest<HTMLElement>('[data-work-stage]');
  picture=stage?.querySelector<HTMLElement>(`[data-stage-piece="${stage.dataset.active}"] img`)??null;
 }
 if(!picture) picture=target.closest('.project-card')?.querySelector<HTMLElement>('img')??null;
 if(!picture) {
  const preview=document.querySelector<HTMLAnchorElement>('[data-archive-link]');
  if(preview?.href===destination.href) picture=document.querySelector<HTMLElement>('[data-archive-image]');
 }
 if(!picture) return;
 document.querySelectorAll<HTMLElement>('[data-shared-cover]').forEach(element=>{
  changed.set(element,element.style.viewTransitionName); element.style.viewTransitionName='none';
 });
 if(!changed.has(picture)) changed.set(picture,picture.style.viewTransitionName);
 picture.style.viewTransitionName='project-cover';
},true);
window.addEventListener('pageshow',restore);
