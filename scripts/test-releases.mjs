import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { projects } from '../src/data/projects.ts';
import { createReleaseResolver, formatReleaseSize, latestReleaseUrl, parseLatestRelease } from '../src/lib/github-release.ts';

function projectDownload(repository) {
  const config = projects.find((project) => project.download?.repository === repository)?.download;
  assert.ok(config, `The real project configuration must include ${repository}`);
  return config;
}
const outpost = projectDownload('heroliss/Outpost');
const opengl = projectDownload('heroliss/LearnOpengl');
const aoe = projectDownload('heroliss/aoe4-flow');

function asset(config = outpost, name = 'Outpost-Windows-x64.zip', size = 80_438_371, version = 'v2026.10.24', extra = {}) {
  return { name, state: 'uploaded', size, browser_download_url: `https://github.com/${config.repository}/releases/download/${encodeURIComponent(version)}/${encodeURIComponent(name)}`, ...extra };
}
function payload(assets = [asset()], extra = {}) {
  return { draft: false, prerelease: false, tag_name: 'v2026.10.24', assets, ...extra };
}
function response(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value };
}
function memoryStorage() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('latest formal release determines the direct URL, version and size together', () => {
  const release = parseLatestRelease(payload(), outpost);
  assert.equal(release.version, 'v2026.10.24');
  assert.equal(release.sizeLabel, '76.7 MiB');
  assert.equal(release.size, 80_438_371);
  assert.equal(release.url, asset().browser_download_url);
  assert.equal(release.releaseUrl, 'https://github.com/heroliss/Outpost/releases/tag/v2026.10.24');
  const next = parseLatestRelease(payload([asset(outpost, 'Outpost-Windows-x64.zip', 104_857_600, 'v2027.1')], { tag_name: 'v2027.1' }), outpost);
  assert.equal(next.version, 'v2027.1');
  assert.equal(next.sizeLabel, '100 MiB');
  assert.match(next.url, /v2027\.1\//);
});

test('project patterns support both stable and versioned Windows filenames', () => {
  for (const [config, names] of [
    [outpost, ['Outpost-Windows-x64.zip', 'Outpost-2027.1-Windows-x64.zip', 'Outpost-v2027.1-win-x64.zip']],
    [opengl, ['LearnOpenGL-win-x64.zip', 'LearnOpenGL-2026.10.24-win-x64.zip', 'LearnOpenGL-v2027.1-windows-x64.zip']],
    [aoe, ['AoE4-Flow-v3.3.0-Windows-x64.zip', 'AoE4-Flow-v4.0.0-Windows-x64.zip']],
  ]) for (const name of names) assert.ok(parseLatestRelease(payload([asset(config, name)]), config), name);
});

test('restored desktop projects follow versioned formal packages with version and size together', () => {
  for (const [repository, stem] of [
    ['heroliss/qt-labs', 'Liss-QtLabs'],
    ['heroliss/text-lab', 'Liss-TextLab'],
    ['heroliss/systems-lab', 'SystemsLab'],
    ['heroliss/nex', 'Liss-NEX'],
    ['heroliss/liss-blocks', 'Liss-Blocks'],
  ]) {
    const config = projectDownload(repository);
    for (const [version, size] of [['v1.0.0', 52_000_001], ['v2.4.0', 61_000_003]]) {
      const name = `${stem}-${version.slice(1)}-win-x64.zip`;
      const release = parseLatestRelease(payload([asset(config, name, size, version)], { tag_name: version }), config);
      assert.ok(release, name);
      assert.equal(release.version, version);
      assert.equal(release.size, size);
      assert.equal(release.url, asset(config, name, size, version).browser_download_url);
      for (const invalid of [`${name}.sha256`, `${stem}-2.4.0-linux-x64.zip`, `${stem}-2.4.0-win-arm64.zip`]) {
        assert.equal(parseLatestRelease(payload([asset(config, invalid, size, version)], { tag_name: version }), config), null, invalid);
      }
    }
  }
});

test('drafts, prereleases and incomplete release metadata are rejected', () => {
  for (const extra of [{ draft: true }, { prerelease: true }, { draft: undefined }, { prerelease: undefined }, { tag_name: '' }, { tag_name: '\nmalformed' }]) {
    assert.equal(parseLatestRelease(payload(undefined, extra), outpost), null);
  }
});

test('checksums, source archives, non-Windows builds and pending uploads are excluded', () => {
  const names = ['Outpost-Windows-x64.zip.sha256', 'Source-code.zip', 'Outpost-linux-x64.zip', 'Outpost-WebGL.zip'];
  const invalid = names.map((name) => asset(outpost, name));
  invalid.push(asset(outpost, undefined, undefined, undefined, { state: 'new' }));
  const good = asset();
  assert.equal(parseLatestRelease(payload([...invalid, good]), outpost)?.url, good.browser_download_url);
  assert.equal(parseLatestRelease(payload(invalid), outpost), null);
});

test('empty, fractional and invalid asset sizes are rejected', () => {
  for (const size of [0, -1, 0.5, NaN, Infinity, '80438371', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseLatestRelease(payload([asset(outpost, undefined, size)]), outpost), null);
  }
});

test('multiple matching Windows packages are treated as ambiguous', () => {
  assert.equal(parseLatestRelease(payload([asset(), asset(outpost, 'Outpost-2027.1-Windows-x64.zip')]), outpost), null);
});

test('direct downloads must belong to the exact repository, release tag and filename', () => {
  const good = asset();
  for (const url of [
    good.browser_download_url.replace('https:', 'http:'),
    good.browser_download_url.replace('github.com', 'github.com.evil.test'),
    good.browser_download_url.replace('github.com', 'github.com@evil.test'),
    good.browser_download_url.replace('/Outpost/', '/OtherRepo/'),
    good.browser_download_url.replace('/v2026.10.24/', '/v2025/'),
    `${good.browser_download_url}?redirect=https://evil.test`,
    `${good.browser_download_url}#fragment`,
    good.browser_download_url.replace('Outpost-Windows-x64.zip', 'different.zip'),
  ]) assert.equal(parseLatestRelease(payload([{ ...good, browser_download_url: url }]), outpost), null, url);
});

test('invalid repository identifiers and unanchored or broken filename patterns are rejected', () => {
  for (const config of [
    { ...outpost, repository: 'heroliss/Outpost/extra' },
    { ...outpost, repository: '../Outpost' },
    { ...outpost, repository: 'https://github.com/heroliss/Outpost' },
    { ...outpost, assetPattern: '.*zip' },
    { ...outpost, assetPattern: '^[$' },
  ]) {
    assert.equal(parseLatestRelease(payload(), config), null);
    assert.equal(latestReleaseUrl(config), '');
  }
  assert.equal(latestReleaseUrl(outpost), 'https://github.com/heroliss/Outpost/releases/latest');
});

test('size labels cover small downloads and GiB without locale-specific separators', () => {
  assert.equal(formatReleaseSize(1), '1 B');
  assert.equal(formatReleaseSize(1536), '1.5 KiB');
  assert.equal(formatReleaseSize(1024 ** 3), '1 GiB');
  assert.equal(formatReleaseSize(0), '');
});

test('the anonymous API request omits credentials and accepts GitHub JSON', async () => {
  let captured;
  const resolve = createReleaseResolver({ storage: null, fetch: async (...args) => { captured = args; return response(payload()); } });
  assert.ok(await resolve(outpost));
  assert.equal(captured[0], 'https://api.github.com/repos/heroliss/Outpost/releases/latest');
  assert.equal(captured[1].credentials, 'omit');
  assert.equal(captured[1].headers.Accept, 'application/vnd.github+json');
  assert.equal(captured[1].headers['X-GitHub-Api-Version'], '2026-03-10');
  assert.ok(captured[1].signal instanceof AbortSignal);
});

test('network, 429, 404, bad JSON and missing Windows assets return null for the UI fallback', async () => {
  for (const fetch of [
    async () => { throw new Error('offline'); },
    async () => response({}, 429),
    async () => response({}, 404),
    async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } }),
    async () => response(payload([])),
  ]) {
    const resolve = createReleaseResolver({ storage: null, fetch });
    assert.equal(await resolve(outpost), null);
  }
});

test('a stalled request times out even when the fetch implementation ignores cancellation', async () => {
  let signal;
  const resolve = createReleaseResolver({ storage: null, timeoutMs: 10, fetch: async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  } });
  assert.equal(await resolve(outpost), null);
  assert.equal(signal.aborted, true);
});

test('same repository and pattern share an in-flight request', async () => {
  let calls = 0;
  let finish;
  const resolve = createReleaseResolver({ storage: null, fetch: async () => { calls++; return new Promise((done) => { finish = done; }); } });
  const first = resolve(outpost);
  const second = resolve({ ...outpost, repository: 'HEROLISS/OUTPOST' });
  assert.equal(calls, 1);
  finish(response(payload()));
  assert.deepEqual(await first, await second);
});

test('consumer cancellation does not abort another control sharing the request', async () => {
  let finish;
  let requestSignal;
  const resolve = createReleaseResolver({ storage: null, fetch: async (_url, options) => {
    requestSignal = options.signal;
    return new Promise((done) => { finish = done; });
  } });
  const controller = new AbortController();
  const cancelled = resolve(outpost, { signal: controller.signal });
  const surviving = resolve(outpost);
  controller.abort();
  assert.equal(await cancelled, null);
  assert.equal(requestSignal.aborted, false);
  finish(response(payload()));
  assert.ok(await surviving);
});

test('successful results are cached for ten minutes, then new version and size are fetched', async () => {
  const storage = memoryStorage();
  let time = 1_000_000;
  let calls = 0;
  const fetch = async () => {
    calls++;
    return response(calls === 1 ? payload() : payload([asset(outpost, 'Outpost-Windows-x64.zip', 104_857_600, 'v2027.1')], { tag_name: 'v2027.1' }));
  };
  const resolve = createReleaseResolver({ storage, now: () => time, fetch });
  assert.equal((await resolve(outpost)).version, 'v2026.10.24');
  time += 599_999;
  assert.equal((await resolve(outpost)).version, 'v2026.10.24');
  assert.equal(calls, 1);
  time += 1;
  assert.equal((await resolve(outpost)).version, 'v2027.1');
  assert.equal((await resolve(outpost)).sizeLabel, '100 MiB');
  assert.equal(calls, 2);
});

test('expired cache is never presented as latest when the refresh fails', async () => {
  const storage = memoryStorage();
  const initial = createReleaseResolver({ storage, now: () => 1000, fetch: async () => response(payload()) });
  await initial(outpost);
  const offline = createReleaseResolver({ storage, now: () => 601_000, fetch: async () => response({}, 429) });
  assert.equal(await offline(outpost), null);
});

test('malformed, future-dated or malicious cached URLs are ignored and refreshed', async () => {
  for (const mutate of [
    () => '{bad json',
    (entry) => JSON.stringify({ ...entry, schema: 999 }),
    (entry) => JSON.stringify({ ...entry, repository: 'attacker/other' }),
    (entry) => JSON.stringify({ ...entry, savedAt: 10_000 }),
    (entry) => JSON.stringify({ ...entry, release: { ...entry.release, url: 'javascript:alert(1)' } }),
    (entry) => JSON.stringify({ ...entry, release: { ...entry.release, url: entry.release.url.replace('/Outpost/', '/other/') } }),
    (entry) => JSON.stringify({ ...entry, release: { ...entry.release, size: -1 } }),
  ]) {
    const storage = memoryStorage();
    await createReleaseResolver({ storage, now: () => 1000, fetch: async () => response(payload()) })(outpost);
    const [key, value] = [...storage.values][0];
    storage.setItem(key, mutate(JSON.parse(value)));
    let calls = 0;
    const resolve = createReleaseResolver({ storage, now: () => 1000, fetch: async () => { calls++; return response(payload()); } });
    assert.ok(await resolve(outpost));
    assert.equal(calls, 1);
  }
});

test('storage read/write failures do not affect a valid download', async () => {
  const storage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  const resolve = createReleaseResolver({ storage, fetch: async () => response(payload()) });
  assert.ok(await resolve(outpost));
});

test('failed requests are not cached and can recover on the next attempt', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const resolve = createReleaseResolver({ storage, fetch: async () => response(payload(), ++calls === 1 ? 429 : 200) });
  assert.equal(await resolve(outpost), null);
  assert.equal(storage.values.size, 0);
  assert.ok(await resolve(outpost));
  assert.equal(calls, 2);
});

// Optional acceptance against separately retained public API captures; ordinary
// tests remain entirely self-contained and never depend on the network or captures.
const fixtureFlag = process.argv.indexOf('--fixtures');
if (fixtureFlag !== -1) {
  const directory = process.argv[fixtureFlag + 1];
  assert.ok(directory, '--fixtures requires the directory containing the API captures');
  for (const config of [outpost, opengl, aoe]) {
    const repositoryName = config.repository.split('/')[1];
    test(`actual project configuration parses captured ${repositoryName} latest release`, async () => {
      const captured = JSON.parse(await readFile(join(directory, `${repositoryName}-latest.json`), 'utf8'));
      const resolved = parseLatestRelease(captured, config);
      assert.ok(resolved);
      const matching = captured.assets.filter((item) => item.state === 'uploaded' && new RegExp(config.assetPattern, 'i').test(item.name));
      assert.equal(matching.length, 1);
      assert.equal(resolved.url, matching[0].browser_download_url);
      assert.equal(resolved.version, captured.tag_name);
      assert.equal(resolved.size, matching[0].size);
      assert.ok(resolved.sizeLabel);
    });
  }
}
