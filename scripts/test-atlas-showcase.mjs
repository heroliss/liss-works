import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';

const resolver = registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
    throw error;
  }
} });
const { ATLAS_SHOT, ATLAS_SWEEP_MS, atlasLayers, atlasPoints, atlasSteps } = await import('../src/data/atlas-showcase.ts');
const { getProject } = await import('../src/data/projects.ts');
resolver.deregister();

const site = path.resolve(import.meta.dirname, '..');
const checks = [];
function check(name, action) { action(); checks.push(name); }
const inside = ([l, t, r, b], [L, T, R, B]) => l >= L && t >= T && r <= R && b <= B;
const overlap = ([l, t, r, b], [L, T, R, B]) => l < R && L < r && t < B && T < b;

check('every step shows a published 1680x1050 screenshot of china-house-price-map', () => {
  const project = getProject('china-house-price-map');
  assert.deepEqual(atlasSteps.map(step => step.id), ['overview', 'match', 'commute', 'xiaoqu']);
  for (const step of atlasSteps) {
    const image = project.gallery.find(item => item.src.endsWith(`/${step.shot}.webp`));
    assert.ok(image, `${step.shot} is in the gallery`);
    assert.deepEqual([image.width, image.height], [ATLAS_SHOT.width, ATLAS_SHOT.height], step.shot);
    for (const name of [`${step.shot}.webp`, `${step.shot}-1600.webp`]) {
      assert.ok(fs.existsSync(path.join(site, 'public/media/china-house-price-map', name)), name);
    }
  }
});

check('cut-out panels stay within screenshot bounds and do not overlap within any step', () => {
  assert.equal(new Set(atlasLayers.map(layer => layer.id)).size, atlasLayers.length, 'ids are unique');
  for (const layer of atlasLayers) {
    const [l, t, r, b] = layer.rect;
    assert.ok(l < r && t < b && inside(layer.rect, [0, 0, ATLAS_SHOT.width, ATLAS_SHOT.height]), layer.id);
    assert.ok(layer.depth > 0 && layer.depth <= 120 && layer.delay >= 0, layer.id);
    for (const other of atlasLayers) {
      if (other !== layer && other.step === layer.step) {
        assert.ok(!overlap(layer.rect, other.rect), `${layer.id} / ${other.id}`);
      }
    }
  }
});

check('every explanation point maps to at least one panel and every panel is explained', () => {
  for (const step of atlasSteps) {
    const points = atlasPoints.filter(point => point.step === step.id);
    assert.ok(points.length >= 3 && points.length <= 4, `${step.id}: three to four points`);
    for (const point of points) {
      assert.ok(atlasLayers.some(layer => layer.step === step.id && layer.group === point.group), point.group);
    }
  }
  for (const layer of atlasLayers) {
    assert.ok(atlasPoints.some(point => point.step === layer.step && point.group === layer.group), layer.id);
  }
});

check('overview panels rise in west-to-east meridian sweep order', () => {
  const ovLayers = atlasLayers.filter(layer => layer.step === 'overview');
  assert.equal(ovLayers.length, 4);
  ovLayers.forEach(layer => {
    const midX = (layer.rect[0] + layer.rect[2]) / 2;
    assert.equal(layer.delay, Math.round(midX / ATLAS_SHOT.width * ATLAS_SWEEP_MS), layer.id);
  });
});

check('the stylesheet keeps 3D parents free of flattening properties', () => {
  const css = fs.readFileSync(path.join(site, 'src/styles/atlas-showcase.css'), 'utf8');
  for (const parent of ['.at-float', '.at-window', '.at-screen']) {
    for (const rule of css.matchAll(new RegExp(`(?:^|\\})\\s*\\${parent}\\s*\\{([^}]*)\\}`, 'g'))) {
      assert.doesNotMatch(rule[1], /(?:^|;)\s*(?:opacity|filter|overflow|mask|clip-path)\s*:/, `${parent} must stay 3D`);
    }
  }
});

console.log(`atlas showcase: ${checks.length} checks passed`);
