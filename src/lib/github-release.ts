/** Public GitHub release metadata. No credentials or private API access are used. */
export interface ReleaseConfig {
  repository: string;
  /** A full, anchored filename pattern for the project's Windows download. */
  assetPattern: string;
}

export interface ResolvedRelease {
  url: string;
  version: string;
  size: number;
  sizeLabel: string;
  releaseUrl: string;
}

type ReleaseStorage = Pick<Storage, 'getItem' | 'setItem'>;
type ReleaseFetch = typeof globalThis.fetch;

export interface ReleaseResolverEnvironment {
  fetch?: ReleaseFetch;
  /** null disables persistent caching; access failures are always non-fatal. */
  storage?: ReleaseStorage | null;
  now?: () => number;
  timeoutMs?: number;
  cacheMaxAgeMs?: number;
}

interface ValidConfig extends ReleaseConfig {
  pattern: RegExp;
}

const CACHE_PREFIX = 'liss:github-release:v1:';
const CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validConfig(config: ReleaseConfig): ValidConfig | null {
  if (!config || typeof config.repository !== 'string' || typeof config.assetPattern !== 'string') return null;
  const parts = config.repository.split('/');
  if (parts.length !== 2 || !/^[a-z\d][a-z\d-]{0,38}$/i.test(parts[0])) return null;
  if (!/^[a-z\d_.-]{1,100}$/i.test(parts[1]) || ['.', '..'].includes(parts[1])) return null;
  if (config.assetPattern.length > 512 || !config.assetPattern.startsWith('^') || !config.assetPattern.endsWith('$')) return null;
  try {
    return { repository: config.repository, assetPattern: config.assetPattern, pattern: new RegExp(config.assetPattern, 'i') };
  } catch {
    return null;
  }
}

/** Stable units independent of the visitor's locale. */
export function formatReleaseSize(bytes: number): string {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Number((bytes / 1024).toFixed(1))} KiB`;
  if (bytes < 1024 ** 3) return `${Number((bytes / 1024 ** 2).toFixed(1))} MiB`;
  return `${Number((bytes / 1024 ** 3).toFixed(1))} GiB`;
}

/** A navigable fallback even when the API is unavailable or rate limited. */
export function latestReleaseUrl(config: ReleaseConfig): string {
  const valid = validConfig(config);
  return valid ? `https://github.com/${valid.repository}/releases/latest` : '';
}

function safeAssetName(urlValue: unknown, config: ValidConfig, version?: string): string | null {
  if (typeof urlValue !== 'string') return null;
  try {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) return null;
    const prefix = `/${config.repository}/releases/download/`;
    if (!url.pathname.toLowerCase().startsWith(prefix.toLowerCase())) return null;
    const remainder = url.pathname.slice(prefix.length);
    const lastSlash = remainder.lastIndexOf('/');
    if (lastSlash <= 0) return null;
    if (version !== undefined && decodeURIComponent(remainder.slice(0, lastSlash)) !== version) return null;
    const name = decodeURIComponent(remainder.slice(lastSlash + 1));
    if (!name || /[\u0000-\u001f\u007f/\\]/.test(name)) return null;
    return name;
  } catch {
    return null;
  }
}

/** Parse an untrusted API/cache payload without selecting a source archive or a different platform. */
export function parseLatestRelease(payload: unknown, config: ReleaseConfig): ResolvedRelease | null {
  const valid = validConfig(config);
  if (!valid || !record(payload) || payload.draft !== false || payload.prerelease !== false) return null;
  const version = payload.tag_name;
  if (typeof version !== 'string' || !version.trim() || version.length > 200 || /[\u0000-\u001f\u007f]/.test(version)) return null;
  if (!Array.isArray(payload.assets)) return null;
  const matches = payload.assets.filter((asset: unknown): asset is Record<string, unknown> => {
    if (!record(asset) || typeof asset.name !== 'string' || asset.state !== 'uploaded') return false;
    if (!/\.(zip|exe)$/i.test(asset.name) || !valid.pattern.test(asset.name)) return false;
    if (!Number.isSafeInteger(asset.size) || (asset.size as number) <= 0) return false;
    return safeAssetName(asset.browser_download_url, valid, version) === asset.name;
  });
  // An explicit fallback is preferable to arbitrarily downloading the wrong build.
  if (matches.length !== 1) return null;
  const asset = matches[0];
  const size = asset.size as number;
  return {
    url: asset.browser_download_url as string,
    version,
    size,
    sizeLabel: formatReleaseSize(size),
    releaseUrl: `https://github.com/${valid.repository}/releases/tag/${encodeURIComponent(version)}`,
  };
}

function browserStorage(): ReleaseStorage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function readCache(storage: ReleaseStorage | null, key: string, config: ValidConfig, now: number, maxAge: number): ResolvedRelease | null {
  try {
    const value: unknown = JSON.parse(storage?.getItem(key) ?? 'null');
    if (!record(value) || value.schema !== 1 || value.repository !== config.repository.toLowerCase() || value.assetPattern !== config.assetPattern) return null;
    if (typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt) || value.savedAt < 0 || value.savedAt > now || now - value.savedAt >= maxAge) return null;
    if (!record(value.release)) return null;
    const release = value.release;
    const name = safeAssetName(release.url, config);
    return parseLatestRelease({
      draft: false,
      prerelease: false,
      tag_name: release.version,
      assets: [{ name, size: release.size, state: 'uploaded', browser_download_url: release.url }],
    }, config);
  } catch {
    return null;
  }
}

function writeCache(storage: ReleaseStorage | null, key: string, config: ValidConfig, release: ResolvedRelease, now: number): void {
  try {
    storage?.setItem(key, JSON.stringify({
      schema: 1,
      repository: config.repository.toLowerCase(),
      assetPattern: config.assetPattern,
      savedAt: now,
      release: { url: release.url, version: release.version, size: release.size },
    }));
  } catch {
    // Private browsing, storage policy and a full quota must not break downloads.
  }
}

/** Abort one consumer without cancelling a request shared by other download buttons. */
function withSignal(promise: Promise<ResolvedRelease | null>, signal?: AbortSignal): Promise<ResolvedRelease | null> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    const aborted = () => resolve(null);
    signal.addEventListener('abort', aborted, { once: true });
    void promise.then((release) => {
      signal.removeEventListener('abort', aborted);
      resolve(release);
    });
  });
}

/** Isolated environments allow deterministic tests without any network requests. */
export function createReleaseResolver(environment: ReleaseResolverEnvironment = {}) {
  const pending = new Map<string, Promise<ResolvedRelease | null>>();
  const now = environment.now ?? Date.now;
  const timeoutMs = environment.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxAge = environment.cacheMaxAgeMs ?? CACHE_MAX_AGE_MS;

  return function resolve(config: ReleaseConfig, options: { signal?: AbortSignal } = {}): Promise<ResolvedRelease | null> {
    const valid = validConfig(config);
    if (!valid || options.signal?.aborted) return Promise.resolve(null);
    const key = `${CACHE_PREFIX}${JSON.stringify([valid.repository.toLowerCase(), valid.assetPattern])}`;
    const storage = environment.storage === undefined ? browserStorage() : environment.storage;
    const cached = readCache(storage, key, valid, now(), maxAge);
    if (cached) return Promise.resolve(cached);
    const existing = pending.get(key);
    if (existing) return withSignal(existing, options.signal);

    const request = (async (): Promise<ResolvedRelease | null> => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const fetchRelease = environment.fetch ?? globalThis.fetch;
        const responseTask = (async () => {
          const response = await fetchRelease(`https://api.github.com/repos/${valid.repository}/releases/latest`, {
            headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
            signal: controller.signal,
          });
          if (!response.ok) return null;
          return parseLatestRelease(await response.json(), valid);
        })();
        const timeoutTask = new Promise<null>((resolve) => {
          timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
        });
        const release = await Promise.race([responseTask, timeoutTask]);
        if (release) writeCache(storage, key, valid, release, now());
        return release;
      } catch {
        return null;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    })();
    pending.set(key, request);
    void request.finally(() => { pending.delete(key); });
    return withSignal(request, options.signal);
  };
}

/** Shared by every download control on the page. */
export const resolveLatestRelease = createReleaseResolver();
