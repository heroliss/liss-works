import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';

// Load the real Astro data modules without adding a test-only dependency.
const resolver = registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
    throw error;
  }
} });
const { projectWorlds, getProjectWorld, projectWorldStyle } = await import('../src/data/project-worlds.ts');
const { projects } = await import('../src/data/projects.ts');
const { prioritizeProjects } = await import('../src/data/project-priority.ts');
resolver.deregister();

const repo = path.resolve(import.meta.dirname, '..');
// Frozen pre-redesign diagnostics from 2026-11-02, not the mutable Git HEAD.
// This continues to work after the new palette is committed or in a shallow clone;
// no expected replacement hex values are duplicated in the test.
const baseline = { minimumDistance: .00627, nearestMean: .0321,
  closest: [ { a: 'china-house-price-map', b: 'qt-labs', distance: .00627 },
    { a: 'gomoku', b: 'liss-blocks', distance: .01552 },
    { a: 'liss-web', b: 'mkfun', distance: .01753 } ] };

const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
function rgb(hex) {
  assert.match(hex, /^#[\da-f]{6}$/i, 'Theme colours must be explicit sRGB hex values');
  return [1, 3, 5].map(index => linear(parseInt(hex.slice(index, index + 2), 16) / 255));
}
function luminance(hex) { const [r, g, b] = rgb(hex); return .2126 * r + .7152 * g + .0722 * b; }
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
// Oklab's published linear-sRGB conversion; distances below are screening metrics,
// not a promise that every person can distinguish every pair of theme colours.
function lab(hex) {
  const [r, g, b] = rgb(hex);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .808675766 * s];
}
function distance(a, b) { const x = lab(a), y = lab(b); return Math.hypot(...x.map((value, index) => value - y[index])); }
const round = (value, digits = 5) => +value.toFixed(digits);
const ordered = prioritizeProjects(projects), projectById = new Map(projects.map(project => [project.slug, project]));
const ids = projects.map(project => project.slug);
assert.deepEqual(new Set(Object.keys(projectWorlds)), new Set(ids), 'Every project must have exactly one authored identity');
assert.equal(new Set(ids.map(id => projectWorlds[id].accent.toLowerCase())).size, ids.length, 'Exact duplicate project accents');

const styles = fs.readdirSync(path.join(repo, 'src/styles')).filter(file => file.endsWith('.css')).map(file => ({ file, source: fs.readFileSync(path.join(repo, 'src/styles', file), 'utf8') }));
const mismatches = [], cssBindings = [], detailRoles = new Map();
const checkBinding = (file, selector, body, id, role, expected) => {
  const match = body.match(new RegExp('--' + role + '\\s*:\\s*(#[0-9a-f]{6})\\b', 'i'));
  if (!match) return;
  cssBindings.push({ file, selector, id, role, colour: match[1] });
  if (match[1].toLowerCase() !== expected.toLowerCase()) mismatches.push({ file, selector, id, role, actual: match[1], expected });
};
const homeSelectors = {
  '.framework-chapter': 'ssframework', '.framework-showcase': 'ssframework', '.workflow-chapter': 'dubforge',
  '.game-scene--blocks': 'liss-blocks', '.game-scene--outpost': 'outpost', '.game-scene--gomoku': 'gomoku',
};
for (const { file, source } of styles) for (const rule of source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = rule[1].trim(), body = rule[2];
  const detail = selector.match(/^\.detail-page\[data-project-world=["']([^"']+)["']\]$/);
  const id = detail?.[1] ?? homeSelectors[selector];
  if (id && projectWorlds[id]) {
    checkBinding(file, selector, body, id, 'accent', projectWorlds[id].accent);
    checkBinding(file, selector, body, id, 'cyan', projectWorlds[id].accent);
    if (detail) checkBinding(file, selector, body, id, 'surface', projectWorlds[id].surface);
    if (detail) {
      const roles = { ...(detailRoles.get(id) ?? {}), source: file };
      for (const role of ['raised', 'muted', 'ink', 'text']) {
        const literal = body.match(new RegExp('--' + role + '\\s*:\\s*(#[0-9a-f]{6})\\b', 'i'));
        if (literal) roles[role] = literal[1];
      }
      detailRoles.set(id, roles);
    }
  }
  if (selector === '.home-next') for (const [role, project] of [['electric', 'dubforge'], ['coral', 'outpost'], ['citron', 'ssframework']]) checkBinding(file, selector, body, project, role, projectWorlds[project].accent);
}

function pairs(worlds, selected = ids) {
  const result = [];
  for (let a = 0; a < selected.length; a++) for (let b = a + 1; b < selected.length; b++) {
    const x = selected[a], y = selected[b];
    result.push({ a: x, b: y, distance: round(distance(worlds[x].accent, worlds[y].accent)), sameGroup: projectById.get(x)?.group === projectById.get(y)?.group });
  }
  return result.sort((a, b) => a.distance - b.distance);
}
function nearestMean(worlds) { return ids.reduce((sum, id) => sum + Math.min(...ids.filter(other => other !== id).map(other => distance(worlds[id].accent, worlds[other].accent))), 0) / ids.length; }
const after = pairs(projectWorlds);
const hero = ['panxu', 'dubforge', 'ssframework', 'glass-atoll', 'gomoku'];
const games = ['liss-blocks', 'outpost', 'gomoku'];
const adjacent = [];
for (const group of new Set(projects.map(project => project.group))) {
  const groupIds = ordered.filter(project => project.group === group).map(project => project.slug);
  for (let index = 1; index < groupIds.length; index++) adjacent.push({ group, a: groupIds[index - 1], b: groupIds[index], distance: round(distance(projectWorlds[groupIds[index - 1]].accent, projectWorlds[groupIds[index]].accent)) });
}
const colours = ids.map(id => {
  const world = getProjectWorld(id), [L, a, b] = lab(world.accent);
  assert.deepEqual(getProjectWorld(id), world, 'Identity must be deterministic, not generated per access');
  assert.ok(projectWorldStyle(id).includes('--project-tone:' + world.accent));
  assert.ok(projectWorldStyle(id).includes('--world-surface:' + world.surface));
  return { id, group: projectById.get(id).group, accent: world.accent, surface: world.surface,
    oklch: { lightness: round(L), chroma: round(Math.hypot(a, b)), hue: round((Math.atan2(b, a) * 180 / Math.PI + 360) % 360, 2) },
    accentOnPage: round(contrast(world.accent, '#0b0e10'), 3), accentOnSurface: round(contrast(world.accent, world.surface), 3),
    bodyOnSurface: round(contrast('#eeefeb', world.surface), 3), mutedOnSurface: round(contrast('#b6beba', world.surface), 3) };
});
const readable = ids.every(id => {
  const world = projectWorlds[id];
  return contrast(world.accent, '#0b0e10') >= 4.5 && contrast(world.accent, world.surface) >= 4.5 && contrast('#eeefeb', world.surface) >= 4.5 && contrast('#b6beba', world.surface) >= 4.5;
});
const raisedDiagnostics = [...detailRoles].filter(([, roles]) => roles.raised).map(([id, roles]) => ({
  id, source: roles.source, raised: roles.raised,
  accentOnRaised: round(contrast(projectWorlds[id].accent, roles.raised), 3),
  textOnRaised: round(contrast(roles.text ?? roles.ink ?? '#eeefeb', roles.raised), 3),
  mutedOnRaised: round(contrast(roles.muted ?? '#b6beba', roles.raised), 3),
}));
const raisedRisks = raisedDiagnostics.filter(item => item.accentOnRaised < 4.5 || item.textOnRaised < 4.5 || item.mutedOnRaised < 4.5);
const improved = after[0].distance > baseline.minimumDistance && nearestMean(projectWorlds) > baseline.nearestMean;
const diagnosticOnly = process.argv.includes('--diagnose');
const report = {
  passed: readable && mismatches.length === 0 && (diagnosticOnly || improved), diagnosticOnly,
  projects: ids.length, fixedUniqueAccents: true, readable, paletteImproved: improved,
  before: baseline,
  after: { minimumDistance: after[0].distance, nearestMean: round(nearestMean(projectWorlds)), closest: after.slice(0, 12) },
  contexts: { homeHeroClosest: pairs(projectWorlds, hero).slice(0, 5), middleGames: pairs(projectWorlds, games), sameGroupClosest: after.filter(pair => pair.sameGroup).slice(0, 10), adjacentWithinLibraryGroups: adjacent.sort((a, b) => a.distance - b.distance) },
  cssBindingsChecked: cssBindings.length, cssMismatches: mismatches, raisedDiagnostics, raisedRisks, colours,
  method: { distance: 'Euclidean OKLab; diagnostic similarity only, no universal pairwise visibility guarantee.', contrast: 'WCAG sRGB relative luminance for explicit solid colours. Rendered gradients, alpha layers and photographs need browser inspection.', sources: ['https://bottosson.github.io/posts/oklab/', 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html'] },
};
const out = process.argv.find(argument => argument.startsWith('--out='))?.slice(6);
if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify(report, null, 2));
if (!diagnosticOnly) {
  assert.ok(readable, 'One or more theme text roles fall below 4.5:1 on solid authored backgrounds');
  assert.deepEqual(mismatches, [], 'CSS literal overrides drift from project identity data');
  assert.ok(improved, 'Global closest pair and mean nearest-neighbour separation must improve over the measured pre-redesign palette');
}
