import assert from 'node:assert/strict';
import {
  wrapPhase, circularOffset, nearestPhase, ringPose, ringCardWidth, ringStep, advanceRing,
  normalizeWheel, gestureAxis, ringLayout,
} from '../src/scripts/archive-ring-math.ts';

const checks = [];
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ±${tolerance}`);
function check(name, action) { action(); checks.push(name); }
function stepFor(state, seconds, step) {
  let result = { ...state };
  for (let elapsed = 0; elapsed < seconds - 1e-10; elapsed += step) result = advanceRing(result, Math.min(step, seconds - elapsed));
  return result;
}

check('empty and single-result coordinates stay finite without presenting empty cards', () => {
  for (const count of [0, 1]) for (const phase of [-1e6, -.5, 0, .5, 1e6]) {
    assert.equal(circularOffset(0, phase, count), 0);
    assert.equal(nearestPhase(0, phase, count), 0);
    const pose = ringPose(circularOffset(0, phase, count), 700, count);
    Object.entries(pose).filter(([, value]) => typeof value === 'number').forEach(([, value]) => assert.ok(Number.isFinite(value)));
    assert.equal(pose.visible, count === 1);
  }
  assert.equal(wrapPhase(12, 0), 0);
});

check('phase wrapping handles reverse travel and arbitrarily many full turns', () => {
  for (const count of [2, 3, 7, 23]) for (const phase of [-1e6 - .125, -count - .125, -.125, 0, count + .125, 1e6 + .125]) {
    const wrapped = wrapPhase(phase, count);
    assert.ok(wrapped >= 0 && wrapped < count);
    near(wrapPhase(phase + count * 100, count), wrapped);
  }
});

check('selecting across the last/first seam uses the nearest equivalent turn', () => {
  near(nearestPhase(0, 22.8, 23), 23);
  near(nearestPhase(22, .2, 23), -1);
  for (const count of [2, 3, 23]) for (const phase of [-30.2, .25, 22.9, 10000.125]) for (let index = 0; index < count; index++) {
    const target = nearestPhase(index, phase, count);
    assert.ok(Math.abs(target - phase) <= count / 2 + 1e-9);
    near(wrapPhase(target, count), index, 1e-8);
  }
});

check('card pose is periodic when phase loops and front movement has no wrap jump', () => {
  const epsilon = 1e-5;
  for (const count of [2, 3, 23]) {
    const before = ringPose(circularOffset(0, count - epsilon, count), 900, count);
    const after = ringPose(circularOffset(0, count + epsilon, count), 900, count);
    assert.ok(Math.abs(before.x - after.x) < .01);
    near(before.z, after.z, 1e-6);
    near(before.opacity, after.opacity, 1e-6);
    for (let index = 0; index < count; index++) {
      const a = ringPose(circularOffset(index, .3, count), 900, count);
      const b = ringPose(circularOffset(index, count + .3, count), 900, count);
      for (const key of ['x', 'y', 'z', 'rotateY', 'opacity']) near(a[key], b[key], 1e-8);
    }
  }
});

check('short filtered rings fade to invisibility at their index seam', () => {
  for (const count of [2, 3, 4]) {
    const left = ringPose(-count / 2, 500, count), right = ringPose(count / 2, 500, count);
    assert.equal(left.visible, false); assert.equal(right.visible, false);
    near(left.opacity, 0); near(right.opacity, 0);
  }
  const front = ringPose(0, 900, 23);
  near(front.x, 0); near(front.z, 0); near(front.opacity, 1); assert.equal(front.visible, true);
  let lastOpacity = front.opacity;
  for (let offset = .1; offset <= 3.5; offset += .1) {
    const pose = ringPose(offset, 900, 23);
    assert.ok(pose.opacity >= 0 && pose.opacity <= 1 && pose.opacity <= lastOpacity + 1e-9);
    lastOpacity = pose.opacity;
  }
});

check('depth and falloff stay symmetric and monotone while cards turn away', () => {
  let previousDepth=0, previousOpacity=1;
  for (let offset=0;offset<3;offset+=.025) {
    const left=ringPose(-offset,900,23),right=ringPose(offset,900,23);
    near(left.x,-right.x); near(left.rotateY,-right.rotateY);
    near(left.z,right.z); near(left.y,right.y); near(left.opacity,right.opacity);
    if (right.visible) assert.ok(Math.abs(right.rotateY)<90,'visible cards must still face the viewer');
    assert.ok(right.z<=previousDepth+1e-9);
    assert.ok(right.opacity<=previousOpacity+1e-9);
    previousDepth=right.z;previousOpacity=right.opacity;
  }
});

check('the focused screenshot dominates while many neighbours stay faintly visible', () => {
  for (const width of [1440, 1100, 375]) {
    const card = ringCardWidth(width), { perSide } = ringLayout(width);
    assert.ok(card >= Math.min(width * .4, 720) - 1e-9 || width < 700, `focus is large at ${width}px`);
    const poses = Array.from({ length: 23 }, (_, index) => ringPose(circularOffset(index, 0, 23), width, 23));
    const shown = poses.filter(pose => pose.opacity > .5).length;
    assert.ok(shown >= (width < 700 ? 5 : 9), `at least a handful of neighbours remain visible at ${width}px (${shown})`);
    assert.equal(shown, 1 + 2 * perSide);
    for (const pose of poses.filter(pose => pose.visible)) assert.ok(Math.abs(pose.rotateY) < 90, 'no visible card turns edge-on');
    const front = ringPose(0, width, 23), first = ringPose(1, width, 23);
    assert.ok(first.scale < front.scale && first.shade > front.shade, 'neighbours are smaller and darker than the focus');
    assert.ok(first.x >= card * .5, 'the first neighbour slides out from behind the focus');
  }
});

check('cover flow motion is continuous through the first slot and stacks the rest evenly', () => {
  for (const width of [1440, 375]) {
    const step = 1e-4, slope = offset => (ringPose(offset + step, width, 23).x - ringPose(offset - step, width, 23).x) / (2 * step);
    near(slope(1 - 3 * step), slope(1 + 3 * step), 1);
    const gaps = [2, 3, 4].map(offset => ringPose(offset + 1, width, 23).x - ringPose(offset, width, 23).x);
    gaps.forEach(gap => near(gap, gaps[0], 1e-9));
    let previous = -1;
    for (let offset = 0; offset <= 6; offset += .25) {
      const shade = ringPose(offset, width, 23).shade;
      assert.ok(shade >= previous - 1e-12 && shade <= .78);
      previous = shade;
    }
    near(ringPose(0, width, 23).shade, 0);
  }
  assert.equal(ringStep(1), 0); assert.equal(ringStep(23), 55);
  assert.ok(ringCardWidth(1440, 400) < ringCardWidth(1440), 'a short window caps the focused card');
});

check('short filtered lists are already invisible at the seam before they wrap', () => {
  for (const count of [2, 3, 4]) {
    const epsilon = .0001;
    const approaching = ringPose(count / 2 - epsilon, 900, count);
    const wrapped = ringPose(-count / 2 + epsilon, 900, count);
    near(approaching.opacity, wrapped.opacity);
    assert.ok(approaching.opacity < .01, 'short-list seam must already be invisible before wrapping');
  }
});

check('spring and free coast are time-based across 60Hz and 120Hz steps', () => {
  for (const state of [{ position: 4, velocity: -2, target: 1 }, { position: 0, velocity: 10, target: null }]) {
    const sixty = stepFor(state, .3, 1 / 60), oneTwenty = stepFor(state, .3, 1 / 120);
    near(sixty.position, oneTwenty.position, 1e-8);
    near(sixty.velocity, oneTwenty.velocity, 1e-8);
  }
});

check('suspension-sized and invalid dt cannot create a large resume jump', () => {
  const state = { position: 2, velocity: 8, target: 7 };
  assert.deepEqual(advanceRing(state, 20), advanceRing(state, .05));
  for (const dt of [-1, NaN, Infinity]) {
    const result = advanceRing(state, dt);
    near(result.position, state.position); near(result.velocity, state.velocity);
  }
  assert.deepEqual(advanceRing({ position: NaN, velocity: 3, target: null }, .016), { position: 0, velocity: 0, target: 0 });
});

check('inertia eventually settles at one exact integer and remains idle', () => {
  for (const velocity of [-20, -3, 0, 3, 20]) {
    const settled = stepFor({ position: .27, velocity, target: null }, 8, 1 / 60);
    assert.equal(settled.velocity, 0); assert.equal(settled.target, null);
    assert.equal(settled.position, Math.round(settled.position));
    assert.deepEqual(advanceRing(settled, 1 / 60), settled);
  }
});

check('a reversed spring preserves finite velocity and reaches its new target', () => {
  const start = { position: 3.4, velocity: 8, target: -2 };
  const first = advanceRing(start, 1 / 60);
  assert.ok(Number.isFinite(first.position) && Number.isFinite(first.velocity));
  const settled = stepFor(first, 3, 1 / 60);
  assert.equal(settled.position, -2); assert.equal(settled.velocity, 0); assert.equal(settled.target, null);
  assert.deepEqual(start, { position: 3.4, velocity: 8, target: -2 });
});

check('wheel line/page modes preserve units and cap extreme device deltas', () => {
  near(normalizeWheel(0, 3, 1), normalizeWheel(0, 48));
  near(normalizeWheel(0, .1, 2, 800), 80);
  assert.equal(normalizeWheel(-120, 2), -120);
  assert.equal(normalizeWheel(0, 10000), 180); assert.equal(normalizeWheel(-10000, 0), -180);
  assert.equal(normalizeWheel(0, NaN), 0);
});

check('gesture threshold separates taps, horizontal dragging and native vertical scrolling', () => {
  for (const [x, y] of [[0, 0], [6, 1], [2, -6], [-6.9, 6.9]]) assert.equal(gestureAxis(x, y), 'pending');
  for (const [x, y] of [[7, 0], [-16, 2], [8, 7]]) assert.equal(gestureAxis(x, y), 'horizontal');
  for (const [x, y] of [[0, 7], [4, -14], [7, 7]]) assert.equal(gestureAxis(x, y), 'vertical');
});

console.log(JSON.stringify({ passed: true, groups: checks.length, checks }, null, 2));
