const dialog = document.querySelector<HTMLDialogElement>('.lightbox');
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-lightbox]'));
if (dialog && typeof dialog.showModal === 'function' && links.length) {
 const image = new Image(); image.className = 'lightbox__image';
 const imageSlot = dialog.querySelector<HTMLElement>('.lightbox__image-slot')!;
 const title = dialog.querySelector<HTMLElement>('.lightbox__title')!;
 const caption = dialog.querySelector<HTMLElement>('.lightbox__caption')!;
 const count = dialog.querySelector<HTMLElement>('.lightbox__count')!;
 const original = dialog.querySelector<HTMLAnchorElement>('.lightbox__original')!;
 const prev = dialog.querySelector<HTMLButtonElement>('.lightbox__prev')!;
 const next = dialog.querySelector<HTMLButtonElement>('.lightbox__next')!;
 let items: HTMLAnchorElement[] = [], index = 0, opener: HTMLAnchorElement | undefined;
 function render() {
   const item = items[index]; if (!item) return;
   const thumbnail = item.querySelector('img');
   if (thumbnail) { image.width = Number(thumbnail.getAttribute('width')) || thumbnail.naturalWidth; image.height = Number(thumbnail.getAttribute('height')) || thumbnail.naturalHeight; }
   image.src = item.href; image.alt = item.dataset.title ?? '项目截图';
   imageSlot.replaceChildren(image);
   title.textContent = item.dataset.title ?? ''; caption.textContent = item.dataset.caption ?? '';
   count.textContent = `${index + 1} / ${items.length}`; original.href = item.href;
   prev.disabled = index === 0; next.disabled = index === items.length - 1;
 }
 for (const link of links) link.addEventListener('click', event => {
   if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
   event.preventDefault(); opener = link;
   items = links.filter(item => item.dataset.gallery === link.dataset.gallery);
   index = items.indexOf(link); render(); dialog.showModal(); document.documentElement.classList.add('modal-open');
 });
 function move(delta:number) { index = Math.max(0, Math.min(items.length - 1, index + delta)); render(); }
 prev.addEventListener('click', () => move(-1)); next.addEventListener('click', () => move(1));
 dialog.querySelector('.lightbox__close')?.addEventListener('click', () => dialog.close());
 dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
 dialog.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') {event.preventDefault();move(-1);} if (event.key === 'ArrowRight') {event.preventDefault();move(1);} });
 dialog.addEventListener('close', () => {document.documentElement.classList.remove('modal-open');opener?.focus();});
}
document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => {
 button.addEventListener('click', async () => {
  const block = document.getElementById(button.dataset.copy ?? '');
  if (!block) return;
  const live = button.closest('.code-block')?.querySelector('[role="status"]');
  try {await navigator.clipboard.writeText(block.textContent ?? ''); if(live) live.textContent='已复制';button.dataset.copied='true';setTimeout(()=>{if(live)live.textContent='';delete button.dataset.copied;},2000);}
  catch {if(live)live.textContent='请选中代码后复制';}
 });
});
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-showcase-tab]'));
function selectTab(index: number, focus = false) {
 tabs.forEach((tab,i) => { const selected = i === index; tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;const panel=document.getElementById(tab.getAttribute('aria-controls')??'');if(panel)panel.hidden=!selected;});
 if(focus)tabs[index]?.focus();
}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectTab(index));tab.addEventListener('keydown',event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();selectTab(next,true);});});

