/** Continuous ring coordinates and time-based settling, without DOM or animation globals. */
export type RingMotion = { position: number; velocity: number; target: number | null };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function wrapPhase(value: number, count: number): number {
  if (!Number.isFinite(value) || count < 1) return 0;
  return ((value % count) + count) % count;
}

export function circularOffset(index: number, phase: number, count: number): number {
  if (count < 2) return 0;
  return wrapPhase(index - phase + count / 2, count) - count / 2;
}

export function nearestPhase(index: number, phase: number, count: number): number {
  return count > 1 ? phase + circularOffset(index, phase, count) : 0;
}

/** Kept for callers that still ask for a spacing angle; the cover flow uses a fixed turn. */
export function ringStep(count: number): number {
  return count < 2 ? 0 : 55;
}

/**
 * Width of the focused screenshot. It takes a large share of the row so the image
 * itself is readable; an optional height budget keeps it inside short windows.
 */
export function ringCardWidth(width: number, maxHeight = Infinity): number {
  const byWidth = width < 700 ? width * .74 : width * .44;
  const byHeight = Number.isFinite(maxHeight) ? (maxHeight - 70) / .625 : Infinity;
  return clamp(Math.min(byWidth, byHeight), 220, 720);
}

/** Layout constants shared by the pose and the drag controller, in card widths. */
export function ringLayout(width: number, maxHeight = Infinity) {
  const card = ringCardWidth(width, maxHeight), narrow = width < 700;
  // The first neighbour slides most of the way out from behind the focus; the rest
  // stack in tight slivers so many projects stay faintly visible on each side.
  const lift = card * (narrow ? .5 : .56), stack = card * (narrow ? .07 : .08);
  const reach = Math.max(card * .7, width / 2 - card * .04);
  const perSide = Math.max(1, Math.min(9, Math.floor((reach - lift) / stack)));
  return { card, lift, stack, perSide, turn: narrow ? 58 : 55, depth: card * .55 };
}

/**
 * A cover flow: the focused screenshot faces the viewer at full size; neighbours
 * swing inward around their own axis, recede and stack as slim slivers that grow
 * darker the further they are. Movement is C1-continuous through the first slot,
 * so dragging never jerks, and short filtered lists fade at their index seam.
 */
export function ringPose(offset: number, width: number, count: number, maxHeight = Infinity) {
  const distance = Math.abs(offset), sign = Math.sign(offset);
  const { lift, stack, perSide, turn, depth } = ringLayout(width, maxHeight);
  const t = Math.min(distance, 1), ease = t * (2 - t);
  const seam = count / 2;
  const seamFade = count < 2 ? 1 : clamp((seam - distance) / Math.min(.6, seam * .4), 0, 1);
  const edge = clamp(perSide + 1 - distance, 0, 1);
  const opacity = count < 2 ? 1 : Math.min(seamFade, edge * edge * (3 - 2 * edge));
  return {
    x: count < 2 ? 0 : sign * (lift * ease + stack * distance),
    y: 0,
    z: count < 2 ? 0 : -(depth * ease + stack * .35 * distance),
    rotateY: count < 2 ? 0 : -sign * turn * ease,
    scale: count < 2 ? 1 : 1 - .13 * ease,
    opacity,
    shade: count < 2 ? 0 : clamp(.42 * ease + .05 * Math.max(0, distance - 1), 0, .78),
    visible: count > 0 && opacity > .003 && (count < 2 || distance < seam),
    zIndex: Math.round(1000 - distance * 20),
  };
}

/** An exact critical spring / exponential coast. dt is seconds, capped after suspension. */
export function advanceRing(state: RingMotion, dt: number): RingMotion {
  const delta = clamp(Number.isFinite(dt) ? dt : 0, 0, .05);
  let { position, velocity, target } = state;
  if (![position, velocity].every(Number.isFinite)) return { position: 0, velocity: 0, target: 0 };
  if (target !== null) {
    const omega = 17, displacement = position - target;
    const coefficient = velocity + omega * displacement, decay = Math.exp(-omega * delta);
    position = target + (displacement + coefficient * delta) * decay;
    velocity = (velocity - omega * coefficient * delta) * decay;
    if (Math.abs(position - target) < .0005 && Math.abs(velocity) < .006) return { position: target, velocity: 0, target: null };
  } else if (Math.abs(velocity) > .08) {
    const friction = 5.8, decay = Math.exp(-friction * delta);
    position += velocity * (1 - decay) / friction;
    velocity *= decay;
  } else if (Math.abs(position - Math.round(position)) > .0005) {
    target = Math.round(position);
  } else {
    position = Math.round(position); velocity = 0;
  }
  return { position, velocity, target };
}

export function normalizeWheel(deltaX: number, deltaY: number, mode = 0, pagePixels = 800): number {
  const value = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  const multiplier = mode === 1 ? 16 : mode === 2 ? pagePixels : 1;
  return clamp((Number.isFinite(value) ? value : 0) * multiplier, -180, 180);
}

export function gestureAxis(dx: number, dy: number): 'pending' | 'horizontal' | 'vertical' {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return 'pending';
  return Math.abs(dx) > Math.abs(dy) * 1.12 ? 'horizontal' : 'vertical';
}
