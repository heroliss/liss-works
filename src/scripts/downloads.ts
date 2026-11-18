import { resolveLatestRelease } from '../lib/github-release';

document.querySelectorAll<HTMLElement>('[data-release-download]').forEach(async entry => {
  const link = entry.querySelector<HTMLAnchorElement>('[data-release-link]');
  const label = entry.querySelector<HTMLElement>('[data-release-label]');
  const metadata = entry.querySelector<HTMLElement>('[data-release-meta]');
  if (!link || !label || !metadata) return;
  const compact = entry.dataset.compact === 'true';
  entry.setAttribute('aria-busy', 'true');
  try {
    const release = await resolveLatestRelease({
      repository: entry.dataset.repository ?? '',
      assetPattern: entry.dataset.assetPattern ?? '',
    });
    if (release) {
      const assetName = decodeURIComponent(release.url.split('/').pop() ?? '');
      link.href = release.url;
      link.removeAttribute('target');
      label.textContent = compact ? `下载 ${release.version}` : `下载 Windows 版 · ${release.version}`;
      metadata.textContent = !compact && assetName
        ? `${assetName} · ${release.sizeLabel}`
        : `${release.version} · ${release.sizeLabel}`;
      link.setAttribute('aria-label', `直接下载 ${assetName || 'Windows 版'}（${release.version}，${release.sizeLabel}）`);
      entry.dataset.state = 'resolved';
      return;
    }
  } catch {
    // The server-rendered link remains a working latest-release entry.
  } finally {
    entry.setAttribute('aria-busy', 'false');
  }
  link.target = '_blank';
  label.textContent = compact ? '查看最新版本' : '查看最新版本';
  metadata.textContent = '前往 GitHub 下载';
  entry.dataset.state = 'fallback';
});

// Lazily enrich project cards with the live latest formal version as they scroll into view.
const statusBadges = Array.from(document.querySelectorAll<HTMLElement>('[data-release-status]'));
if (statusBadges.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const item of entries) {
      if (!item.isIntersecting) continue;
      const badge = item.target as HTMLElement;
      observer.unobserve(badge);
      void resolveLatestRelease({
        repository: badge.dataset.repository ?? '',
        assetPattern: badge.dataset.assetPattern ?? '',
      }).then(release => {
        if (!release) return;
        const base = (badge.dataset.baseStatus ?? badge.textContent ?? '').replace(/已发布$/, '').trim();
        badge.textContent = base ? `${base} · ${release.version}` : release.version;
      }).catch(() => {});
    }
  }, { rootMargin: '120px 0px' });
  statusBadges.forEach(badge => observer.observe(badge));
}
