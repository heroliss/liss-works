const search = document.querySelector<HTMLInputElement>('#project-search');
const tag = document.querySelector<HTMLSelectElement>('#tag-filter');
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-group-filter]'));
const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-project-card]'));
const counter = document.querySelector('[data-result-count]');
const empty = document.querySelector<HTMLElement>('[data-empty]');
let group = 'all';
if (search && tag) {
 const params = new URLSearchParams(location.search);
 const initialGroup = params.get('group') ?? 'all';
 if (buttons.some(button=>button.dataset.groupFilter===initialGroup)) group=initialGroup;
 search.value=params.get('q')??'';
 const initialTag=params.get('tag')??'';
 if(Array.from(tag.options).some(option=>option.value===initialTag))tag.value=initialTag;
 function update(replaceUrl=true) {
  const query=search!.value.trim().toLocaleLowerCase();let found=0;
  cards.forEach(card=>{const matches=(group==='all'||card.dataset.group===group)&&(!tag!.value||(card.dataset.tags??'').split('|').some(value=>value.toLocaleLowerCase()===tag!.value.toLocaleLowerCase()))&&(!query||(card.dataset.search??'').toLocaleLowerCase().includes(query));card.hidden=!matches;if(matches)found++;});
  buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.groupFilter===group)));
  if(counter)counter.textContent=`显示 ${found} / ${cards.length} 个工程`;if(empty)empty.hidden=found!==0;
  if(replaceUrl){const next=new URLSearchParams();if(group!=='all')next.set('group',group);if(tag!.value)next.set('tag',tag!.value);if(search!.value.trim())next.set('q',search!.value.trim());history.replaceState(null,'',location.pathname+(next.size?'?'+next.toString():''));}
 }
 search.addEventListener('input',()=>update());tag.addEventListener('change',()=>update());
 buttons.forEach(button=>button.addEventListener('click',()=>{group=button.dataset.groupFilter??'all';update();}));
 document.querySelectorAll('[data-reset-filters]').forEach(button=>button.addEventListener('click',()=>{group='all';search.value='';tag.value='';update();}));
 update(false);
}

