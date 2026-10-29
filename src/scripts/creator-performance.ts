import type { CreatorBeat, CreatorPerformer, CreatorPointer, CreatorPose } from './creator-performance-types';

type Track = readonly (readonly [number, number])[];
type Stroke = readonly [time: number, finger: number, strength: number];

const PERIOD = 24;
const TAU = Math.PI * 2;
const neutralPointer: CreatorPointer = { x: 0, y: 0, active: 0, speed: 0 };

const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, low = 0, high = 1): number => Math.min(high, Math.max(low, value));
const smooth = (value: number): number => {
  const u = clamp(value);
  return clamp(u * u * u * (u * (u * 6 - 15) + 10));
};
const ramp = (time: number, start: number, end: number): number => smooth((time - start) / (end - start));
const envelope = (time: number, start: number, attack: number, release: number, end: number): number =>
  ramp(time, start, attack) * (1 - ramp(time, release, end));
const damp = (current: number, target: number, seconds: number, dt: number): number =>
  current + (target - current) * -Math.expm1(-dt / seconds);

function headAttention(base: number, extra: number): number {
  // Preserve the authored heading at zero input and approach the joint limit
  // smoothly instead of flattening a moving head against a hard clamp.
  const available = extra >= 0 ? .76 - base : base + .76;
  return base + available * Math.tanh(extra / available);
}

function track(time: number, keys: Track): number {
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (time <= b[0]) return a[1] + (b[1] - a[1]) * ramp(time, a[0], b[0]);
  }
  return keys[keys.length - 1][1];
}

// All base heading lives here, never in the actor bind pose or room group.
// Yaw > 0 turns the -Z-facing actor towards world -X. Chair yaw is inherited
// by pelvis, torso yaw is additional chest/spine yaw, head yaw is the combined
// additional neck/head yaw. Their neutral total is about 60 degrees.
const chairYaw: Track = [[0,.10],[5.60,.10],[6.55,.08],[11.70,.08],[12.55,.09],[14.50,.09],[15.55,.12],[17.10,.12],[19.10,.10],[24,.10]];
const torsoYaw: Track = [[0,.28],[2.80,.28],[3.65,.32],[5.66,.32],[6.55,.23],[11.85,.23],[12.70,.26],[14.80,.26],[15.70,.34],[16.65,.34],[18.65,.29],[22.40,.28],[24,.28]];
const headYaw: Track = [[0,.66],[2.67,.66],[3.25,.70],[5.54,.70],[6.18,.52],[11.98,.52],[12.60,.58],[14.66,.58],[15.30,.72],[16.60,.72],[18.10,.66],[24,.66]];
const gazeX: Track = [[0,-.07],[2.55,-.07],[2.90,.045],[4.75,.035],[5.42,.035],[5.76,-.17],[11.85,-.17],[12.15,-.10],[14.54,-.10],[14.85,.04],[16.65,.04],[17.70,-.035],[21.70,-.07],[24,-.07]];
const gazeY: Track = [[0,.018],[3.30,.018],[4.00,-.06],[5.45,-.06],[5.80,.11],[11.70,.11],[12.10,.035],[14.55,.035],[14.86,-.025],[16.40,-.025],[18.20,.025],[22.50,.018],[24,.018]];
const torsoLean: Track = [[0,.045],[3.25,.045],[4.25,.018],[5.70,.018],[6.70,.105],[10.90,.105],[12.10,.135],[13.50,.135],[14.70,.055],[15.65,.005],[16.55,.005],[18.70,.038],[22.50,.045],[24,.045]];
const torsoRoll: Track = [[0,-.008],[3.00,-.008],[4.20,.018],[5.60,.018],[6.60,.007],[11.80,.007],[12.60,-.012],[14.65,-.012],[15.60,.020],[17.10,.020],[19.20,-.008],[24,-.008]];
const headPitch: Track = [[0,.015],[3.20,.015],[4.15,-.035],[5.65,-.035],[6.35,.065],[11.60,.065],[12.35,.090],[13.45,.025],[14.60,-.015],[17.00,-.015],[19.20,.025],[22.40,.015],[24,.015]];
const headRoll: Track = [[0,-.018],[3.10,-.018],[4.20,.045],[5.55,.045],[6.40,-.010],[11.95,-.010],[12.65,-.032],[14.70,-.032],[15.60,.033],[17.10,.033],[19.30,-.018],[24,-.018]];
const nod: Track = [[0,0],[14.75,0],[15.05,.082],[15.42,-.018],[15.90,0],[24,0]];
const browLeft: Track = [[0,.12],[2.80,.12],[3.55,.42],[5.35,.36],[6.30,.09],[12.78,.09],[13.35,.57],[14.50,.57],[15.30,.32],[17.10,.32],[19.00,.15],[22.60,.12],[24,.12]];
const browRight: Track = [[0,.10],[2.90,.10],[3.70,.27],[5.40,.24],[6.40,.07],[12.90,.07],[13.50,.48],[14.55,.48],[15.40,.30],[17.20,.30],[19.20,.12],[22.60,.10],[24,.10]];
const smile: Track = [[0,.12],[3.30,.12],[4.35,.06],[6.20,.08],[12.80,.08],[13.60,.28],[14.70,.45],[15.50,.82],[16.50,.82],[18.10,.25],[20.80,.16],[22.80,.12],[24,.12]];
const mouthOpen: Track = [[0,.01],[3.40,.01],[4.40,.025],[6.20,.008],[12.85,.008],[13.28,.12],[14.10,.06],[15.30,.065],[16.50,.065],[18.10,.015],[22.30,.01],[24,.01]];
const cheekRaise: Track = [[0,.04],[12.80,.04],[13.80,.14],[15.40,.58],[16.50,.58],[18.20,.12],[22.60,.04],[24,.04]];

// Deliberately irregular but deterministic keystrokes: thumb, index, middle,
// ring, pinky. Left and right hands are offset, with real pauses between bursts.
const leftStrokes: readonly Stroke[] = [
  [6.78,1,.85],[7.04,2,.76],[7.38,1,.92],[7.68,3,.58],[7.92,0,.36],
  [8.73,2,.82],[8.99,1,.94],[9.24,4,.40],[9.55,2,.74],[9.82,0,.34],
  [10.40,1,.86],[10.71,3,.56],[10.98,2,.78],[11.25,1,.70],
];
const rightStrokes: readonly Stroke[] = [
  [6.94,2,.74],[7.21,1,.92],[7.52,3,.54],[7.82,1,.88],
  [8.84,1,.86],[9.12,2,.78],[9.40,3,.55],[9.72,1,.92],
  [10.53,2,.84],[10.85,1,.92],[11.13,4,.36],[11.43,1,.72],
];
const blinkTimes = [2.62,5.49,10.95,13.96,17.75,21.85] as const;

function stroke(time: number, at: number): number {
  return envelope(time, at - .075, at - .012, at + .025, at + .15);
}

function fingers(time: number, keys: readonly Stroke[], typing: number): number[] {
  const result = [0,0,0,0,0];
  for (const [at, finger, strength] of keys) {
    result[finger] = Math.max(result[finger], stroke(time, at) * strength * typing);
  }
  return result;
}

function blink(time: number, delay: number): number {
  let closure = 0;
  for (const at of blinkTimes) closure = Math.max(closure, envelope(time, at - .065 + delay, at + delay, at + .024 + delay, at + .150 + delay));
  return closure;
}

function beat(time: number): CreatorBeat {
  if (time < 3.25) return 'read';
  if (time < 6.25) return 'think';
  if (time < 11.85) return 'type';
  if (time < 14.60) return 'preview';
  if (time < 18.20) return 'delight';
  return 'return';
}

/** Angles are radians. Lean/pitch > 0 is forward/down; the actor maps these
 * semantic angles to its local axes. Gaze X > 0 is left, gaze Y > 0 is down.
 * Blink is eyelid closure, other face/gesture channels are 0..1, breath is -1..1.
 * Finger arrays contain final curl weights, including their gesture envelopes;
 * the actor must not multiply them by typing a second time. cycle is 0..1.
 * No clock runs here: the caller owns simulation time, visibility and pause.
 */
export function createCreatorPerformer(): CreatorPerformer {
  let interest = 0, speed = 0;
  let eyeX = 0, eyeY = 0, headX = 0, headY = 0, bodyX = 0, bodyY = 0;

  const reset = () => {
    interest = speed = 0;
    eyeX = eyeY = headX = headY = bodyX = bodyY = 0;
  };

  const sample = (time: number, pointer: CreatorPointer = neutralPointer, dt: number): CreatorPose => {
    const t = ((finite(time) % PERIOD) + PERIOD) % PERIOD;
    const step = clamp(finite(dt), 0, .08);
    const thinking = .88 * envelope(t, 3.30, 4.05, 5.00, 5.95);
    const typingGate = envelope(t, 6.25, 6.75, 11.30, 11.85);
    const bursts = Math.max(envelope(t,6.55,6.80,7.90,8.20), envelope(t,8.52,8.76,9.82,10.10), envelope(t,10.25,10.48,11.30,11.62));
    const typing = typingGate * (.58 + .42 * bursts);
    const mouse = .82 * envelope(t,12.05,12.45,13.25,13.85) + .72 * envelope(t,19.20,19.65,20.20,20.85);
    const delight = .85 * envelope(t,14.65,15.18,16.60,17.65);

    // One-way cascade gives attention a readable order without timers. dt=0
    // never advances this state, so static sampling/repainting needs no ticker.
    const active = clamp(finite(pointer?.active));
    speed = damp(speed, clamp(finite(pointer?.speed),0,4), .12, step);
    const targetInterest = active * (1 - .58 * smooth((speed - .35) / 1.15));
    interest = damp(interest, targetInterest, targetInterest > interest ? .13 : .42, step);
    eyeX = damp(eyeX, -clamp(finite(pointer?.x),-1,1) * interest, .085, step);
    eyeY = damp(eyeY, clamp(finite(pointer?.y),-1,1) * interest, .085, step);
    headX = damp(headX, eyeX, .24, step); headY = damp(headY, eyeY, .24, step);
    bodyX = damp(bodyX, headX, .44, step); bodyY = damp(bodyY, headY, .44, step);
    const attention = (1 - .65 * typing) * (1 - .35 * thinking);
    const visitor = interest * attention;

    const fingerLeft = fingers(t, leftStrokes, typing);
    const fingerRight = fingers(t, rightStrokes, typing);
    fingerRight[1] = Math.max(fingerRight[1], .86 * stroke(t,11.70)); // one deliberate confirmation key
    const thinkCurl = [.25,.18,.62,.70,.73];
    const delightCurl = [.42,.80,.82,.78,.72];
    const mouseCurl = [.20,.12,.28,.32,.35];
    for (let i = 0; i < 5; i++) fingerRight[i] = Math.max(fingerRight[i], thinkCurl[i] * thinking, delightCurl[i] * delight, mouseCurl[i] * mouse);
    fingerRight[1] = Math.max(fingerRight[1], mouse * (.12 + .35 * Math.max(stroke(t,12.66),stroke(t,19.95))));

    const breath = Math.sin(TAU * 6 * t / PERIOD);
    const idle = Math.sin(TAU * 3 * t / PERIOD);
    return {
      beat: beat(t), cycle: t / PERIOD, breath,
      torsoYaw: track(t,torsoYaw) + bodyX * .070 * attention,
      torsoLean: track(t,torsoLean) + breath * .006 + bodyY * .022 * attention,
      torsoRoll: track(t,torsoRoll) + idle * .003 - bodyX * .012 * attention,
      headYaw: headAttention(track(t,headYaw),headX * .120 * attention),
      headPitch: track(t,headPitch) + track(t,nod) - breath * .003 + headY * .060 * attention,
      headRoll: track(t,headRoll) + idle * .002 - headX * .025 * attention,
      gazeX: track(t,gazeX) + eyeX * .100 * attention,
      gazeY: track(t,gazeY) + eyeY * .075 * attention,
      blinkLeft: blink(t,0), blinkRight: blink(t,.012),
      browLeft: clamp(track(t,browLeft) + visitor * .160),
      browRight: clamp(track(t,browRight) + visitor * .110),
      smile: clamp(track(t,smile) + visitor * .120),
      mouthOpen: track(t,mouthOpen), cheekRaise: clamp(track(t,cheekRaise) + visitor * .080),
      typing, thinking, mouse, delight, fingerLeft, fingerRight,
      chairYaw: track(t,chairYaw) + bodyX * .025 * attention,
      // These are reveal/visibility strengths. On their descending segment,
      // screens fade or scroll the old fragment; do not erase it backwards.
      screenReply: envelope(t,.35,2.60,20.00,22.50),
      screenCode: envelope(t,6.65,11.72,20.65,23.10),
      screenPreview: envelope(t,12.78,13.35,18.45,20.55),
    };
  };
  return { sample, reset };
}
