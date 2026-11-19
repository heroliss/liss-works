const search = document.querySelector<HTMLInputElement>('#project-search');
const tag = document.querySelector<HTMLSelectElement>('#tag-filter');
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-group-filter]'));
const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-project-card]'));
const counter = document.querySelector('[data-result-count]');
const empty = document.querySelector<HTMLElement>('[data-empty]');
const barReset = document.querySelector<HTMLButtonElement>('#atlas-filters [data-reset-filters]');
const randomButton = document.querySelector<HTMLButtonElement>('[data-atlas-random]');
let group = 'all';
let lastRandomSlug = '';

if (search && tag) {
  const params = new URLSearchParams(location.search);
  const initialGroup = params.get('group') ?? 'all';
  if (buttons.some(button => button.dataset.groupFilter === initialGroup)) group = initialGroup;
  search.value = params.get('q') ?? '';
  const initialTag = params.get('tag') ?? '';
  if (Array.from(tag.options).some(option => option.value === initialTag)) tag.value = initialTag;

  function update(replaceUrl = true) {
    const query = search!.value.trim().toLocaleLowerCase();
    const isFiltered = group !== 'all' || Boolean(tag!.value) || Boolean(query);
    let found = 0;
    cards.forEach(card => {
      const groupMatch = group === 'all'
        || (group === 'featured' ? card.dataset.featured === 'true' : card.dataset.group === group);
      const matches = groupMatch
        && (!tag!.value || (card.dataset.tags ?? '').split('|').some(value => value.toLocaleLowerCase() === tag!.value.toLocaleLowerCase()))
        && (!query || (card.dataset.search ?? '').toLocaleLowerCase().includes(query));
      card.hidden = !matches;
      if (matches) found++;
    });
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.groupFilter === group)));
    if (counter) {
      if (group === 'featured' && !tag!.value && !query) {
        counter.textContent = `重点项目 ${found} / ${cards.length} 个工程`;
      } else {
        counter.textContent = isFiltered ? `显示 ${found} / ${cards.length} 个工程` : `共 ${cards.length} 个工程`;
      }
    }
    if (barReset) barReset.hidden = !isFiltered;
    if (empty) empty.hidden = found !== 0;
    const atlas = document.querySelector<HTMLElement>('[data-project-atlas]');
    if (atlas) {
      atlas.dataset.filtered = String(isFiltered);
      atlas.querySelectorAll<HTMLElement>('[data-atlas-group]').forEach(section => {
        const count = section.querySelectorAll('[data-project-card]:not([hidden])').length;
        section.hidden = count === 0;
        const label = section.querySelector('[data-atlas-group-count]');
        if (label) label.textContent = `${count} 个工程`;
      });
      window.dispatchEvent(new CustomEvent('portfolio:atlas-filter', { detail: { count: found, group } }));
    }
    if (replaceUrl) {
      const next = new URLSearchParams();
      if (group !== 'all') next.set('group', group);
      if (tag!.value) next.set('tag', tag!.value);
      if (search!.value.trim()) next.set('q', search!.value.trim());
      history.replaceState(null, '', location.pathname + (next.size ? '?' + next.toString() : ''));
    }
  }

  function jumpToRandom() {
    let visible = cards.filter(card => !card.hidden);
    if (!visible.length) {
      group = 'all';
      search!.value = '';
      tag!.value = '';
      update();
      visible = cards.filter(card => !card.hidden);
    }
    if (!visible.length) return;
    const pool = visible.length > 1 ? visible.filter(card => card.dataset.atlasItem !== lastRandomSlug) : visible;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    lastRandomSlug = chosen.dataset.atlasItem ?? '';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    chosen.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    delete chosen.dataset.pulse;
    void chosen.offsetWidth;
    chosen.dataset.pulse = 'true';
    window.setTimeout(() => { delete chosen.dataset.pulse; }, 1800);
    chosen.querySelector<HTMLAnchorElement>('[data-atlas-project-link]')?.focus({ preventScroll: true });
  }

  search.addEventListener('input', () => update());
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape' && search.value && !event.isComposing) {
      event.preventDefault();
      search.value = '';
      update();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
    const target = event.target as HTMLElement | null;
    if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
    event.preventDefault();
    requestAnimationFrame(() => {
      search.focus();
      search.select();
    });
  });
  tag.addEventListener('change', () => update());
  buttons.forEach(button => button.addEventListener('click', () => {
    group = button.dataset.groupFilter ?? 'all';
    update();
  }));
  randomButton?.addEventListener('click', jumpToRandom);
  document.querySelectorAll('[data-reset-filters]').forEach(button => button.addEventListener('click', () => {
    group = 'all';
    search.value = '';
    tag.value = '';
    update();
  }));
  update(false);
}
