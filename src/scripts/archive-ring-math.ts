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

export function ringPose(offset: number, width: number, count: number) {
  const distance = Math.abs(offset);
  const angle = offset * 32 * Math.PI / 180;
  const radius = Math.max(240, width * .82);
  const depth = Math.max(340, width * 1.35);
  // Reach transparency before the rear seam, including short filtered lists.
  // Most of the falloff is linear; only the almost-invisible end eases to zero.
  const seam = Math.min(count / 2, 2.65);
  const remaining = Math.max(0, seam - distance);
  const tail = Math.min(.24, seam * .2);
  const t = tail > 0 ? clamp(remaining / tail, 0, 1) : 0;
  const opacity = count < 2 ? 1 : remaining < tail
    ? tail / seam * t * t * (2 - t)
    : clamp(remaining / seam, 0, 1);
  return {
    x: Math.sin(angle) * radius,
    y: -Math.sin(Math.min(Math.PI / 2, Math.abs(angle))) * 28,
    z: (Math.cos(angle) - 1) * depth,
    rotateY: offset * 32,
    opacity,
    visible: count > 0 && opacity > .003 && (count < 2 || distance < seam),
    zIndex: Math.round(1000 - distance * 100),
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
