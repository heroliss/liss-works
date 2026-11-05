// Exercise the actual controller with a small DOM/event fixture. Layout, native
// touch scrolling and rendering remain real-browser acceptance checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setMaxListeners } from 'node:events';
import ts from 'typescript';

const compile = file => ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const controllerCode = compile('../src/scripts/archive-atlas.ts');
const mathCode = compile('../src/scripts/archive-ring-math.ts');
const checks = [];
function check(name, action) { action(); checks.push(name); }

class Element extends EventTarget {
  dataset = {}; attrs = new Map(); hidden = false; tabIndex = -1; textContent = '';
  style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } };
  clientWidth = 800; clientHeight = 470; captures = new Set();
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  hasAttribute(name) { return this.attrs.has(name); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  closest(selector) { return selector === '[hidden]' && this.hidden ? this : null; }
  contains(node) { return node === this || node?.parent === this; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
}
function event(type, properties = {}) {
  const value = new Event(type, { cancelable: true });
  for (const [key, data] of Object.entries(properties)) Object.defineProperty(value, key, { value: data });
  return value;
}
function fixture({ aborted = false, reduced = false } = {}) {
  const signal = new AbortController(); setMaxListeners(0, signal.signal);
  if (aborted) signal.abort();
  const preference = new EventTarget(); preference.matches = reduced;
  const document = new EventTarget(); document.documentElement = new Element(); document.hidden = false;
  const window = new EventTarget(), atlas = new Element(), viewport = new Element(), camera = new Element(), stage = new Element();
  const search = new Element(), status = new Element(), position = new Element(), help = new Element();
  const output = new Map(), link = new Element(); link.setAttribute('href', '/projects/alpha/');
  const items = ['alpha', 'beta', 'gamma'].map(slug => {
    const item = new Element();
    Object.assign(item.dataset, { atlasItem: slug, previewHref: `/projects/${slug}/`, previewTitle: slug, previewAccent: '#abcdef' });
    return item;
  });
  const cards = items.map(item => { const card = new Element(); card.parent = viewport; card.dataset.atlasRingCard = item.dataset.atlasItem; return card; });
  const focus = node => { document.activeElement = node; };
  [viewport, search, ...cards].forEach(node => node.focus = () => focus(node));
  const nodes = new Map([
    ['[data-atlas-ring]', viewport], ['[data-atlas-ring-camera]', camera], ['[data-atlas-stage]', stage],
    ['[data-atlas-status]', status], ['[data-atlas-position]', position], ['[data-atlas-ring-help]', help], ['#project-search', search],
  ]);
  atlas.querySelector = selector => {
    if (nodes.has(selector)) return nodes.get(selector);
    if (!output.has(selector)) output.set(selector, new Element());
    return selector === '[data-atlas-motion-toggle]' ? null : output.get(selector);
  };
  atlas.querySelectorAll = selector => selector === '[data-atlas-item]' ? items : selector === '[data-atlas-ring-card]' ? cards : selector === '[data-atlas-link]' ? [link] : [];
  document.querySelector = selector => selector === '[data-project-atlas]' ? atlas : null;
  let frameId = 0, timerId = 0, clock = 0, disconnected = 0, reverted = 0;
  const frames = new Map(), timers = new Map();
  class Observer {
    constructor(callback) { this.callback = callback; }
    observe() { this.callback([{ isIntersecting: true }]); }
    disconnect() { disconnected++; }
  }
  const media = { add() {}, revert() { reverted++; } };
  const sandbox = {
    exports: {}, require(name) {
      if (name === 'gsap') return { gsap: { matchMedia: () => media } };
      if (name === 'gsap/ScrollTrigger') return { ScrollTrigger: { refresh() {} } };
      if (name === './archive-ring-math') return math.exports;
      throw new Error(name);
    },
    document, window, AbortController, Node: Element, Element, performance: { now: () => clock },
    matchMedia: () => ({ matches: false }), IntersectionObserver: Observer, ResizeObserver: Observer,
    requestAnimationFrame(callback) { const id = ++frameId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }, CustomEvent,
  };
  const math = { exports: {} }; vm.runInNewContext(mathCode, math);
  vm.runInNewContext(controllerCode, sandbox);
  const dispose = sandbox.exports.setupArchiveAtlas({ signal: signal.signal, preference });
  const flush = () => { let remaining = 500; while (frames.size && remaining-- > 0) { clock += 1000 / 60; const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(clock)); } assert.ok(remaining > 0, 'controller should settle without an idle RAF'); };
  return { atlas, viewport, camera, items, cards, document, window, preference, signal, dispose, frames, timers, flush,
    observations: () => ({ disconnected, reverted }), status, help };
}

check('an already-aborted owner cannot initialize listeners or observers', () => {
  const app = fixture({ aborted: true });
  assert.equal(app.atlas.dataset.ringReady, undefined);
  assert.equal(app.frames.size, 0);
  assert.deepEqual(app.observations(), { disconnected: 0, reverted: 0 });
  app.dispose();
});

check('keyboard selection settles, exposes one current card and leaves no idle frame', () => {
  const app = fixture();
  app.viewport.dispatchEvent(event('keydown', { key: 'ArrowRight' })); app.flush();
  assert.equal(app.atlas.dataset.atlasSelected, 'beta');
  assert.equal(app.cards.filter(card => card.getAttribute('aria-current') === 'true').length, 1);
  assert.equal(app.cards[1].tabIndex, 0); assert.equal(app.cards[0].tabIndex, -1);
  assert.equal(app.frames.size, 0); app.dispose();
});

check('native vertical gestures leave phase and scrolling untouched', () => {
  const app = fixture();
  app.viewport.dispatchEvent(event('pointerdown', { pointerId: 1, isPrimary: true, button: 0, clientX: 100, clientY: 100, timeStamp: 0 }));
  const move = event('pointermove', { pointerId: 1, clientX: 102, clientY: 130, timeStamp: 16, pointerType: 'touch' });
  app.viewport.dispatchEvent(move);
  assert.equal(move.defaultPrevented, false); assert.equal(app.viewport.dataset.dragging, undefined);
  assert.equal(app.viewport.dataset.ringPhase, '0.0000');
  app.viewport.dispatchEvent(event('pointercancel', { pointerId: 1 }));
  assert.equal(app.viewport.captures.size, 0); app.dispose();
});

check('horizontal drag cancels safely and suppresses its trailing pointer click', () => {
  const app = fixture();
  app.viewport.dispatchEvent(event('pointerdown', { pointerId: 2, isPrimary: true, button: 0, clientX: 400, clientY: 100, timeStamp: 0 }));
  const move = event('pointermove', { pointerId: 2, clientX: 180, clientY: 104, timeStamp: 16, pointerType: 'touch' });
  app.viewport.dispatchEvent(move); assert.equal(move.defaultPrevented, true); assert.equal(app.viewport.captures.size, 1);
  app.viewport.dispatchEvent(event('lostpointercapture', { pointerId: 2, target: app.cards[0] }));
  assert.equal(app.viewport.captures.size, 1, 'transferring implicit touch capture from a child must not cancel the viewport drag');
  assert.equal(app.viewport.dataset.dragging, 'true');
  app.viewport.dispatchEvent(event('pointercancel', { pointerId: 2 }));
  assert.equal(app.viewport.captures.size, 0); assert.equal(app.viewport.dataset.dragging, undefined);
  const click = event('click', { detail: 1 }); app.viewport.dispatchEvent(click); assert.equal(click.defaultPrevented, true);
  assert.equal(Number(app.viewport.dataset.ringPhase), Math.round(Number(app.viewport.dataset.ringPhase)));
  app.dispose();
});

check('reduced motion changes selection immediately without scheduling animation', () => {
  const app = fixture({ reduced: true });
  app.viewport.dispatchEvent(event('keydown', { key: 'End' }));
  assert.equal(app.atlas.dataset.atlasSelected, 'gamma'); assert.equal(app.frames.size, 0);
  app.dispose();
});

check('aborting mid-animation removes ownership and stale current-card semantics', () => {
  const app = fixture();
  app.viewport.dispatchEvent(event('keydown', { key: 'ArrowRight' })); assert.ok(app.frames.size);
  app.signal.abort(); assert.equal(app.frames.size, 0); assert.equal(app.atlas.dataset.ringReady, undefined);
  assert.equal(app.cards.some(card => card.hasAttribute('aria-current')), false);
  assert.equal(app.cards.some(card => 'ringActive' in card.dataset), false);
  assert.deepEqual(app.observations(), { disconnected: 2, reverted: 1 });
  const selection = app.atlas.dataset.atlasSelected;
  app.viewport.dispatchEvent(event('keydown', { key: 'End' })); assert.equal(app.atlas.dataset.atlasSelected, selection);
  app.dispose(); assert.deepEqual(app.observations(), { disconnected: 2, reverted: 1 });
});

check('a plain vertical wheel scrolls the page and only shows a short hint', () => {
  const app = fixture();
  const wheel = event('wheel', { deltaX: 0, deltaY: 140, deltaMode: 0 });
  app.viewport.dispatchEvent(wheel);
  assert.equal(wheel.defaultPrevented, false); assert.equal(app.frames.size, 0);
  assert.equal(app.help.dataset.hint, 'true'); assert.match(app.help.textContent, /Shift/); assert.equal(app.timers.size, 1);
  [...app.timers.values()][0](); app.timers.clear();
  assert.equal(app.help.dataset.hint, undefined); assert.doesNotMatch(app.help.textContent, /照常滚动/);
  const again = event('wheel', { deltaX: 0, deltaY: 140, deltaMode: 0 });
  app.viewport.dispatchEvent(again);
  assert.equal(again.defaultPrevented, false); assert.equal(app.timers.size, 0, 'the hint is rate-limited');
  app.dispose();
});

check('sideways and Shift wheels turn the ring; aborting clears the snap, frame and hint', () => {
  for (const properties of [{ deltaX: 140, deltaY: 6 }, { deltaX: 0, deltaY: 140, shiftKey: true }]) {
    const app = fixture();
    const wheel = event('wheel', { deltaMode: 0, ...properties });
    app.viewport.dispatchEvent(wheel);
    assert.equal(wheel.defaultPrevented, true); assert.equal(app.timers.size, 1); assert.ok(app.frames.size);
    assert.equal(app.help.dataset.hint, undefined);
    app.signal.abort();
    assert.equal(app.timers.size, 0); assert.equal(app.frames.size, 0);
    app.viewport.dispatchEvent(event('wheel', { deltaMode: 0, ...properties }));
    assert.equal(app.timers.size, 0); assert.equal(app.frames.size, 0);
  }
  const hinted = fixture();
  hinted.viewport.dispatchEvent(event('wheel', { deltaX: 0, deltaY: 140, deltaMode: 0 }));
  hinted.signal.abort();
  assert.equal(hinted.timers.size, 0); assert.equal(hinted.help.dataset.hint, undefined);
});

console.log(JSON.stringify({ passed: true, groups: checks.length, checks,
  scope: 'Actual controller event/lifecycle fixture; not browser layout or real-device touch acceptance.' }, null, 2));
