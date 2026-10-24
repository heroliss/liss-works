import { resolveLatestRelease } from '../lib/github-release';

document.querySelectorAll<HTMLElement>('[data-release-download]').forEach(async entry => {
  const link = entry.querySelector<HTMLAnchorElement>('[data-release-link]');
  const label = entry.querySelector<HTMLElement>('[data-release-label]');
  const metadata = entry.querySelector<HTMLElement>('[data-release-meta]');
  if (!link || !label || !metadata) return;
  entry.setAttribute('aria-busy', 'true');
  try {
    const release = await resolveLatestRelease({
      repository: entry.dataset.repository ?? '',
      assetPattern: entry.dataset.assetPattern ?? '',
    });
    if (release) {
      link.href = release.url;
      label.textContent = entry.dataset.compact === 'true' ? 'Windows 版' : '下载 Windows 版';
      metadata.textContent = `${release.version} · ${release.sizeLabel}`;
      link.setAttribute('aria-label', `下载 Windows 版（${release.version}，${release.sizeLabel}）`);
      entry.dataset.state = 'resolved';
      return;
    }
  } catch {
    // The server-rendered link remains a working latest-release entry.
  } finally {
    entry.setAttribute('aria-busy', 'false');
  }
  label.textContent = entry.dataset.compact === 'true' ? 'Windows 版' : '查看最新版本';
  metadata.textContent = '前往 GitHub 下载';
  entry.dataset.state = 'fallback';
});
