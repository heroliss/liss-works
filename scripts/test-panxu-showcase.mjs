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
const { PANXU_SHOT, PANXU_SWEEP_MS, panxuLayers, panxuPoints, panxuSteps } = await import('../src/data/panxu-showcase.ts');
const { getProject } = await import('../src/data/projects.ts');
resolver.deregister();

const site = path.resolve(import.meta.dirname, '..');
const checks = [];
function check(name, action) { action(); checks.push(name); }
const inside = ([l, t, r, b], [L, T, R, B]) => l >= L && t >= T && r <= R && b <= B;
const overlap = ([l, t, r, b], [L, T, R, B]) => l < R && L < r && t < B && T < b;

check('every step shows a published screenshot of 盘序 at the export size', () => {
  const project = getProject('panxu');
  assert.deepEqual(panxuSteps.map(step => step.id), ['scan', 'sort', 'explain', 'clean']);
  for (const step of panxuSteps) {
    const image = project.gallery.find(item => item.src.endsWith(`/${step.shot}.webp`));
    assert.ok(image, `${step.shot} is in the gallery`);
    assert.deepEqual([image.width, image.height], [PANXU_SHOT.width, PANXU_SHOT.height], step.shot);
    for (const name of [`${step.shot}.webp`, `${step.shot}-1600.webp`]) assert.ok(fs.existsSync(path.join(site, 'public/media/panxu', name)), name);
  }
});

check('panels are cut from inside the screenshot and do not cover each other within a step', () => {
  assert.equal(new Set(panxuLayers.map(layer => layer.id)).size, panxuLayers.length, 'ids are unique');
  for (const layer of panxuLayers) {
    const [l, t, r, b] = layer.rect;
    assert.ok(l < r && t < b && inside(layer.rect, [0, 0, PANXU_SHOT.width, PANXU_SHOT.height]), layer.id);
    assert.ok(layer.depth > 0 && layer.depth <= 120 && layer.delay >= 0, layer.id);
    if (layer.marker) assert.ok(inside(layer.marker.rect, layer.rect), `${layer.id}: the ring stays on its panel`);
    for (const other of panxuLayers) if (other !== layer && other.step === layer.step) assert.ok(!overlap(layer.rect, other.rect), `${layer.id} / ${other.id}`);
  }
});

check('every explanation point has the panels it describes, and every panel is explained', () => {
  for (const step of panxuSteps) {
    const points = panxuPoints.filter(point => point.step === step.id);
    assert.ok(points.length >= 2 && points.length <= 4, `${step.id}: two to four points`);
    for (const point of points) assert.ok(panxuLayers.some(layer => layer.step === step.id && layer.group === point.group), point.group);
  }
  for (const layer of panxuLayers) assert.ok(panxuPoints.some(point => point.step === layer.step && point.group === layer.group), layer.id);
});

check('the rows of 「空间都在哪里」 rise as the scan line passes their middle, top to bottom', () => {
  const rows = panxuLayers.filter(layer => layer.group === 'scan-chart');
  assert.equal(rows.length, 8);
  rows.forEach((row, index) => {
    const middle = (row.rect[1] + row.rect[3]) / 2;
    assert.equal(row.delay, Math.round(middle / PANXU_SHOT.height * PANXU_SWEEP_MS), row.id);
    if (index) assert.ok(row.delay > rows[index - 1].delay && row.rect[1] === rows[index - 1].rect[3], `${row.id} follows the row above`);
  });
});

check('the figures add up to the one real check-up they come from', () => {
  const figure = id => panxuSteps.find(step => step.id === id);
  assert.match(figure('scan').figureNote, /65\.9 GB/); // 10.8 + 28.1 + 27.0
  assert.equal(figure('scan').figure, '67 项'); // 22 + 40 + 5
  assert.match(figure('sort').figureNote, /55\.1 GB/); // 28.1 + 27.0
  assert.match(figure('clean').figureNote, /19\.7 → 29\.8 GB/); // 19.7 + 10.1
});

check('the stylesheet keeps 3D parents free of flattening properties', () => {
  const css = fs.readFileSync(path.join(site, 'src/styles/panxu-showcase.css'), 'utf8');
  for (const parent of ['.px-float', '.px-window', '.px-screen']) {
    for (const rule of css.matchAll(new RegExp(`(?:^|\\})\\s*\\${parent}\\s*\\{([^}]*)\\}`, 'g'))) {
      assert.doesNotMatch(rule[1], /(?:^|;)\s*(?:opacity|filter|overflow|mask|clip-path)\s*:/, `${parent} must stay 3D`);
    }
  }
});

console.log(`panxu showcase: ${checks.length} checks passed`);
