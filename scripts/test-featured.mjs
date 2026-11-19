import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';

const resolver = registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + '.ts', context);
      throw error;
    }
  },
});
const {
  homeFeaturedWorks,
  homeFeaturedSlugs,
  featuredWorks,
  featuredSlugs,
  isFeaturedProject,
  getHomeFeaturedProjects,
  getFeaturedProjects,
} = await import('../src/data/featured-projects.ts');
const { projects } = await import('../src/data/projects.ts');
const { projectWorlds } = await import('../src/data/project-worlds.ts');
const { serializeJsonForHtml } = await import('../src/lib/safe-json.ts');
resolver.deregister();

const site = path.resolve(import.meta.dirname, '..');
const checks = [];
function check(name, action) { action(); checks.push(name); }

check('home featured works has 7 items and site-wide featured works has 9 items including AoE4 Flow & Liss Community', () => {
  assert.equal(homeFeaturedWorks.length, 7);
  assert.equal(homeFeaturedSlugs.size, 7);
  assert.equal(featuredWorks.length, 9);
  assert.equal(featuredSlugs.size, 9);

  for (const slug of [
    'glass-atoll', 'dubforge', 'ssframework', 'panxu',
    'china-house-price-map', 'intelligence-index-cost-linear', 'gomoku',
  ]) {
    assert.ok(homeFeaturedSlugs.has(slug), `missing home featured ${slug}`);
    assert.ok(isFeaturedProject(slug), `missing featured ${slug}`);
  }
  for (const slug of ['aoe4-flow', 'liss-web']) {
    assert.ok(!homeFeaturedSlugs.has(slug), `${slug} should stay out of home hero hall`);
    assert.ok(isFeaturedProject(slug), `${slug} should be a library featured project`);
  }

  const allSlugs = new Set(projects.map(p => p.slug));
  for (const item of getHomeFeaturedProjects()) {
    assert.ok(allSlugs.has(item.slug), `unknown home slug ${item.slug}`);
    assert.match(item.homeAnchor, /^#[a-z-]+$/);
  }
  for (const item of getFeaturedProjects()) {
    assert.ok(allSlugs.has(item.slug), `unknown slug ${item.slug}`);
    assert.ok(projectWorlds[item.slug]?.accent, `missing world accent for ${item.slug}`);
    assert.ok(item.shortName.length > 0 && item.hook.length > 0 && item.highlight.length > 0);
  }
});

check('home page contains the target section anchor for every home featured work', () => {
  const indexAstro = fs.readFileSync(path.join(site, 'src/pages/index.astro'), 'utf8');
  const atlasAstro = fs.readFileSync(path.join(site, 'src/components/AtlasShowcase.astro'), 'utf8');
  const costAstro = fs.readFileSync(path.join(site, 'src/components/CostChartShowcase.astro'), 'utf8');
  const panxuAstro = fs.readFileSync(path.join(site, 'src/components/PanxuShowcase.astro'), 'utf8');
  const dubAstro = fs.readFileSync(path.join(site, 'src/components/DubForgeWorkflow.astro'), 'utf8');
  const atollAstro = fs.readFileSync(path.join(site, 'src/components/GlassAtollFeature.astro'), 'utf8');
  const combined = [indexAstro, atlasAstro, costAstro, panxuAstro, dubAstro, atollAstro].join('\n');
  for (const item of homeFeaturedWorks) {
    const id = item.homeAnchor.slice(1);
    assert.ok(
      combined.includes(`id="${id}"`) || combined.includes(`'${id}'`),
      `Home page missing anchor target #${id} for ${item.slug}`,
    );
  }
});

check('hero-hall-engine defines at least 7 distinct desktop and mobile slots with periodic orbit yaw', () => {
  const engineSrc = fs.readFileSync(path.join(site, 'src/scripts/hero-hall-engine.ts'), 'utf8');
  const slotsBlock = engineSrc.match(/const SLOTS = \[([\s\S]*?)\];/)?.[1] ?? '';
  const narrowBlock = engineSrc.match(/const NARROW = \[([\s\S]*?)\];/)?.[1] ?? '';
  const countTuples = block => (block.match(/\[[^\]]+\]/g) ?? []).length;
  assert.ok(countTuples(slotsBlock) >= 7, 'SLOTS must have at least 7 coordinates');
  assert.ok(countTuples(narrowBlock) >= 7, 'NARROW must have at least 7 coordinates');
  assert.doesNotMatch(engineSrc, /turnBy\s*\*\s*0?\.\d+/, 'Screen yaw must stay 2π-periodic with camera orbit to prevent multi-spin drift');
});

check('serializeJsonForHtml neutralizes script-closing and HTML-sensitive sequences', () => {
  const payload = { text: '</script><img src=x onerror=alert(1)>&\u2028\u2029' };
  const serialized = serializeJsonForHtml(payload);
  assert.ok(!serialized.includes('</script>'));
  assert.ok(!serialized.includes('<'));
  assert.ok(!serialized.includes('>'));
  assert.ok(!serialized.includes('&'));
  assert.ok(!serialized.includes('\u2028'));
  assert.ok(!serialized.includes('\u2029'));
  assert.deepEqual(JSON.parse(serialized), payload);
});

check('downloads.ts reads release cache from localStorage matching github-release.ts', () => {
  const dl = fs.readFileSync(path.join(site, 'src/scripts/downloads.ts'), 'utf8');
  assert.match(dl, /\blocalStorage\b/);
  assert.doesNotMatch(dl, /\bsessionStorage\b/);
});

check('projects library exposes the featured filter without duplicating cards in a separate showcase band', () => {
  const projectsPage = fs.readFileSync(path.join(site, 'src/pages/projects/index.astro'), 'utf8');
  assert.match(projectsPage, /data-group-filter="featured"/);
  assert.doesNotMatch(projectsPage, /FeaturedProjectsShowcase/);
});

console.log(`featured & hardening checks: ${checks.length} passed`);
