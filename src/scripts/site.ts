const dialog = document.querySelector<HTMLDialogElement>('.lightbox');
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-lightbox]'));
if (dialog && typeof dialog.showModal === 'function' && links.length) {
  const image = new Image();
  image.className = 'lightbox__image';
  const stage = dialog.querySelector<HTMLElement>('[data-lightbox-stage]')!;
  const imageSlot = dialog.querySelector<HTMLElement>('[data-lightbox-slot]')!;
  const title = dialog.querySelector<HTMLElement>('.lightbox__title')!;
  const caption = dialog.querySelector<HTMLElement>('.lightbox__caption')!;
  const count = dialog.querySelector<HTMLElement>('.lightbox__count')!;
  const original = dialog.querySelector<HTMLAnchorElement>('.lightbox__original')!;
  const prev = dialog.querySelector<HTMLButtonElement>('.lightbox__prev')!;
  const next = dialog.querySelector<HTMLButtonElement>('.lightbox__next')!;
  const zoomBtn = dialog.querySelector<HTMLButtonElement>('[data-lightbox-zoom]');
  const zoomLabel = dialog.querySelector<HTMLElement>('[data-lightbox-zoom-label]');
  let items: HTMLAnchorElement[] = [], index = 0, opener: HTMLAnchorElement | undefined;
  let zoomed = false, dragging = false, movedDuringDrag = false;
  let dragStartX = 0, dragStartY = 0, scrollLeftStart = 0, scrollTopStart = 0;
  let touchStartX = 0, touchStartY = 0;

  function setZoom(nextZoom: boolean) {
    zoomed = nextZoom;
    dialog!.dataset.zoomed = String(zoomed);
    zoomBtn?.setAttribute('aria-pressed', String(zoomed));
    if (zoomLabel) zoomLabel.textContent = zoomed ? '适应窗口' : '1:1 放大';
    if (zoomed) {
      const natW = image.naturalWidth || image.width || 1440;
      dialog!.style.setProperty('--zoom-w', `${natW}px`);
      requestAnimationFrame(() => {
        imageSlot.scrollLeft = Math.max(0, (imageSlot.scrollWidth - imageSlot.clientWidth) / 2);
        imageSlot.scrollTop = Math.max(0, (imageSlot.scrollHeight - imageSlot.clientHeight) / 4);
      });
    } else {
      dialog!.style.removeProperty('--zoom-w');
      imageSlot.scrollLeft = 0;
      imageSlot.scrollTop = 0;
    }
  }

  function render() {
    const item = items[index];
    if (!item) return;
    setZoom(false);
    const thumbnail = item.querySelector('img');
    if (thumbnail) {
      image.width = Number(thumbnail.getAttribute('width')) || thumbnail.naturalWidth;
      image.height = Number(thumbnail.getAttribute('height')) || thumbnail.naturalHeight;
    } else if (item.dataset.width && item.dataset.height) {
      // A link without a thumbnail (盘序's 「看原图」) states its size, so the previous image's size is not kept.
      image.width = Number(item.dataset.width);
      image.height = Number(item.dataset.height);
    }
    image.src = item.href;
    image.alt = item.dataset.title ?? '项目截图';
    imageSlot.replaceChildren(image);
    title.textContent = item.dataset.title ?? '';
    caption.textContent = item.dataset.caption ?? '';
    count.textContent = `${index + 1} / ${items.length}`;
    original.href = item.href;
    const single = items.length <= 1;
    dialog!.dataset.single = String(single);
    prev.hidden = single;
    next.hidden = single;
    prev.disabled = index === 0;
    next.disabled = index === items.length - 1;
  }

  for (const link of links) link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    opener = link;
    items = links.filter(item => item.dataset.gallery === link.dataset.gallery);
    index = items.indexOf(link);
    render();
    dialog.showModal();
    document.documentElement.classList.add('modal-open');
  });

  function move(delta: number) {
    if (items.length <= 1) return;
    const nextIdx = Math.max(0, Math.min(items.length - 1, index + delta));
    if (nextIdx === index) return;
    index = nextIdx;
    render();
  }

  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  zoomBtn?.addEventListener('click', () => setZoom(!zoomed));
  imageSlot.addEventListener('dblclick', event => {
    if (!(event.target instanceof Element) || !event.target.closest('.lightbox__image')) return;
    event.preventDefault();
    setZoom(!zoomed);
  });

  // Drag-to-pan when zoomed to 1:1 (only capture pointer once actual drag movement begins)
  let activePointerId: number | null = null;
  imageSlot.addEventListener('pointerdown', event => {
    if (!zoomed || event.pointerType === 'touch' || event.button !== 0) return;
    dragging = true;
    movedDuringDrag = false;
    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    scrollLeftStart = imageSlot.scrollLeft;
    scrollTopStart = imageSlot.scrollTop;
  });
  imageSlot.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== activePointerId) return;
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    if (!movedDuringDrag && Math.hypot(dx, dy) > 4) {
      movedDuringDrag = true;
      dialog.dataset.dragging = 'true';
      try { imageSlot.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    }
    if (movedDuringDrag) {
      imageSlot.scrollLeft = scrollLeftStart - dx;
      imageSlot.scrollTop = scrollTopStart - dy;
    }
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    activePointerId = null;
    delete dialog.dataset.dragging;
    setTimeout(() => { movedDuringDrag = false; }, 0);
  };
  imageSlot.addEventListener('pointerup', endDrag);
  imageSlot.addEventListener('pointercancel', endDrag);

  // Touch swipe navigation when not zoomed
  stage.addEventListener('touchstart', event => {
    if (zoomed || event.touches.length !== 1) return;
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', event => {
    if (zoomed || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - touchStartX;
    const dy = event.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx < 0 ? 1 : -1);
  }, { passive: true });

  dialog.querySelector('.lightbox__close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (movedDuringDrag) return;
    if (event.target === dialog || (!zoomed && (event.target === stage || event.target === imageSlot))) dialog.close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' && !zoomed) { event.preventDefault(); move(-1); }
    else if (event.key === 'ArrowRight' && !zoomed) { event.preventDefault(); move(1); }
    else if (event.key === 'z' || event.key === 'Z') { event.preventDefault(); setZoom(!zoomed); }
  });
  dialog.addEventListener('close', () => {
    setZoom(false);
    document.documentElement.classList.remove('modal-open');
    opener?.focus();
  });
}

document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const block = document.getElementById(button.dataset.copy ?? '');
    if (!block) return;
    const live = button.closest('.code-block')?.querySelector('[role="status"]');
    try {
      await navigator.clipboard.writeText(block.textContent ?? '');
      if (live) live.textContent = '已复制';
      button.dataset.copied = 'true';
      setTimeout(() => { if (live) live.textContent = ''; delete button.dataset.copied; }, 2000);
    } catch {
      if (live) live.textContent = '请选中代码后复制';
    }
  });
});
