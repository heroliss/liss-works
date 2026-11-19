import { resolveLatestRelease } from '../lib/github-release';

document.querySelectorAll<HTMLElement>('[data-release-download]').forEach(async entry => {
  const link = entry.querySelector<HTMLAnchorElement>('[data-release-link]');
  const label = entry.querySelector<HTMLElement>('[data-release-label]');
  const metadata = entry.querySelector<HTMLElement>('[data-release-meta]');
  if (!link || !label || !metadata) return;
  const compact = entry.dataset.compact === 'true';
  const hasSnapshot = entry.dataset.hasSnapshot === 'true';
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
    // Keep the pre-resolved direct download snapshot or fallback link intact.
  } finally {
    entry.setAttribute('aria-busy', 'false');
  }
  // Never downgrade a verified build-time direct .zip link when GitHub's anonymous API is rate-limited.
  if (hasSnapshot) return;
  link.target = '_blank';
  label.textContent = '查看最新版本';
  metadata.textContent = '前往 GitHub 下载';
  entry.dataset.state = 'fallback';
});

// Zero-network sync on /projects/: if a detail page already cached a newer version in localStorage
// (matching github-release.ts), reflect fresh, validated versions on library badges.
const statusBadges = Array.from(document.querySelectorAll<HTMLElement>('[data-release-status]'));
if (statusBadges.length) {
  try {
    const now = Date.now();
    const maxAgeMs = 10 * 60 * 1000;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('liss:github-release:v1:')) continue;
      const parsed = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (parsed?.schema !== 1 || typeof parsed?.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) continue;
      if (parsed.savedAt < 0 || parsed.savedAt > now || now - parsed.savedAt >= maxAgeMs) continue;
      const repo = String(parsed?.repository ?? '').toLowerCase();
      const version = typeof parsed?.release?.version === 'string' ? parsed.release.version.trim() : '';
      if (!repo || !version || version.length > 80 || /[\u0000-\u001f\u007f]/.test(version)) continue;
      for (const badge of statusBadges) {
        if ((badge.dataset.repository ?? '').toLowerCase() === repo) {
          const base = (badge.dataset.baseStatus ?? '').trim();
          badge.textContent = base ? `${base} · ${version}` : version;
        }
      }
    }
  } catch {
    // Storage access is optional.
  }
}
