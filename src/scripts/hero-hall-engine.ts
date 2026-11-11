import type * as Three from 'three';

type T = typeof import('three');
export type HallAddons = {
  Reflector: typeof import('three/addons/objects/Reflector.js').Reflector;
  EffectComposer: typeof import('three/addons/postprocessing/EffectComposer.js').EffectComposer;
  RenderPass: typeof import('three/addons/postprocessing/RenderPass.js').RenderPass;
  UnrealBloomPass: typeof import('three/addons/postprocessing/UnrealBloomPass.js').UnrealBloomPass;
  OutputPass: typeof import('three/addons/postprocessing/OutputPass.js').OutputPass;
};
export type HallItem = { name: string; tone: string; src: string; href: string };
export interface HallEngine {
  resize: () => boolean;
  /** Pointer over the hero (-1..1) and over the canvas (-1..1, or off-canvas). */
  setPointer: (x: number, y: number, canvasX: number, canvasY: number, active: boolean) => void;
  /** Light one screen from outside, e.g. a name chip; null for none. */
  setHighlight: (index: number | null) => void;
  /** Bring a work to the front of the constellation. */
  select: (index: number) => void;
  selected: () => number;
  hovered: () => number | null;
  /** Live drag: turn the whole constellation by an angle (radians). */
  setDrag: (angle: number) => void;
  /** Let go with an angular velocity; it coasts, then settles home. */
  release: (velocity: number) => void;
  pick: (x: number, y: number) => number | null;
  draw: (time: number, dt: number) => void;
  dispose: () => void;
}

type Screen = { group: Three.Group; tilt: Three.Group; face: Three.MeshBasicMaterial; rim: Three.MeshBasicMaterial; halo: Three.MeshBasicMaterial;
  pool: Three.Mesh; poolMat: Three.MeshBasicMaterial; tone: Three.Color; hover: number; focus: number; lean: Three.Vector2; phase: number; slot: number;
  pos: Three.Vector3; turn: number; size: number; hit: Three.Mesh };

const BG = 0x070b12;
// Slot 0 is the front: large, centred, close. The others float around it at
// different depths, heights, sizes and turns, so the set reads as a composed
// constellation rather than a row. [x, y, z, turn, size]
const SLOTS = [[0, 1.8, 2.3, 0, 1.2], [-3.8, 3.45, -2.6, .38, .74], [-3.4, .95, -.6, .3, .6], [3.5, 3.25, -2.8, -.42, .72], [3.15, .9, -.9, -.34, .58]];
const NARROW = [[0, 2.1, 2.2, 0, 1.3], [-2.9, 3.5, -2.2, .4, .66], [-2.5, .95, .2, .3, .56], [2.9, 3.3, -2, -.4, .7], [2.6, .9, .3, -.32, .56]];

function radialTexture(T: T, inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,.35)') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, inner); gradient.addColorStop(.32, mid); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 256, 256);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
}
function floorMask(T: T) {
  // Dims the mirror: clearer just in front of the screens, fully dark toward the edges.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(128, 150, 10, 128, 140, 128);
  gradient.addColorStop(0, 'rgba(7,11,18,.42)'); gradient.addColorStop(.55, 'rgba(7,11,18,.74)'); gradient.addColorStop(1, 'rgba(7,11,18,1)');
  context.fillStyle = gradient; context.fillRect(0, 0, 256, 256);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
}

/**
 * The five featured works as a floating constellation over a mirror floor. The
 * selected work stands large at the front; the others drift around it at their
 * own depths. Selecting another work brings it forward and the rest re-settle.
 * A wide glow behind the scene takes on the selected work's colour.
 */
export function createHallEngine(T: T, A: HallAddons, canvas: HTMLCanvasElement, context: WebGL2RenderingContext, items: HallItem[]): HallEngine {
  let renderer: Three.WebGLRenderer;
  try { renderer = new T.WebGLRenderer({ canvas, context, antialias: true, powerPreference: 'high-performance' }); }
  catch (error) { context.getExtension('WEBGL_lose_context')?.loseContext(); throw error; }
  // Quality steps down on its own if frames run slow: 0 full, 1 lighter, 2 no bloom.
  let ratio = Math.min(devicePixelRatio || 1, 1.5), quality = 0, slowFrames = 0, sampled = 0;
  renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(BG, 1);

  const scene = new T.Scene();
  scene.fog = new T.FogExp2(BG, .018);
  const camera = new T.PerspectiveCamera(32, 1, .1, 140);
  const disposables: { dispose: () => void }[] = [];
  const keep = <V extends { dispose: () => void }>(value: V) => { disposables.push(value); return value; };
  let released = false;

  scene.add(new T.HemisphereLight(0xbcdcf2, 0x0a1018, .95));
  const key = new T.DirectionalLight(0xfff0e0, 1); key.position.set(-3, 8, 8); scene.add(key);

  let width = 1, height = 1, narrow = false;
  const floor = new A.Reflector(keep(new T.PlaneGeometry(90, 90)), { clipBias: .003, textureWidth: 512, textureHeight: 512, color: 0x93a1b2 });
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const veil = new T.Mesh(keep(new T.PlaneGeometry(60, 60)), keep(new T.MeshBasicMaterial({ map: keep(floorMask(T)), transparent: true, depthWrite: false, fog: false })));
  veil.rotation.x = -Math.PI / 2; veil.position.set(0, .004, -2); scene.add(veil);

  const glow = keep(radialTexture(T));
  // A broad coloured glow behind the constellation, tinted by the selection.
  const backdropMat = keep(new T.MeshBasicMaterial({ map: glow, color: new T.Color(items[0]?.tone ?? '#6ee8e3'), transparent: true, opacity: .26, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
  const backdrop = new T.Mesh(keep(new T.PlaneGeometry(46, 26)), backdropMat); backdrop.position.set(0, 4.5, -14); scene.add(backdrop);
  const backdrop2Mat = keep(new T.MeshBasicMaterial({ map: glow, color: new T.Color('#8b6cf0'), transparent: true, opacity: .14, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
  const backdrop2 = new T.Mesh(keep(new T.PlaneGeometry(30, 18)), backdrop2Mat); backdrop2.position.set(9, 6, -16); scene.add(backdrop2);

  const loader = new T.TextureLoader();
  const screens: Screen[] = [];
  const count = items.length;
  const baseW = 3.6, baseH = baseW / 1.6;
  const frameGeometry = keep(new T.BoxGeometry(baseW + .16, baseH + .16, .1)), screenGeometry = keep(new T.PlaneGeometry(baseW, baseH));
  const haloGeometry = keep(new T.PlaneGeometry(baseW * 2.4, baseH * 2.8)), poolGeometry = keep(new T.PlaneGeometry(baseW * 1.9, 3.2));
  const frameMaterial = keep(new T.MeshStandardMaterial({ color: 0x0d141b, metalness: .8, roughness: .3 }));
  items.forEach((item, index) => {
    const group = new T.Group(); scene.add(group);
    const tilt = new T.Group(); group.add(tilt);
    const tone = new T.Color(item.tone);
    tilt.add(new T.Mesh(frameGeometry, frameMaterial));
    const face = keep(new T.MeshBasicMaterial({ color: 0x1a2630, toneMapped: false }));
    const screenMesh = new T.Mesh(screenGeometry, face); screenMesh.position.z = .055; tilt.add(screenMesh);
    const rim = keep(new T.MeshBasicMaterial({ color: tone.clone(), toneMapped: false }));
    const bar = (bw: number, bh: number, x: number, y: number) => { const m = new T.Mesh(keep(new T.BoxGeometry(bw, bh, .05)), rim); m.position.set(x, y, .06); tilt.add(m); };
    bar(baseW + .2, .035, 0, baseH / 2 + .1); bar(baseW + .2, .035, 0, -baseH / 2 - .1); bar(.035, baseH + .2, -baseW / 2 - .1, 0); bar(.035, baseH + .2, baseW / 2 + .1, 0);
    const halo = keep(new T.MeshBasicMaterial({ map: glow, color: tone, transparent: true, opacity: .2, blending: T.AdditiveBlending, depthWrite: false }));
    const haloMesh = new T.Mesh(haloGeometry, halo); haloMesh.position.z = -.12; tilt.add(haloMesh);
    const poolMat = keep(new T.MeshBasicMaterial({ map: glow, color: tone, transparent: true, opacity: .2, blending: T.AdditiveBlending, depthWrite: false }));
    const pool = new T.Mesh(poolGeometry, poolMat); pool.rotation.x = -Math.PI / 2; scene.add(pool);
    const slot = SLOTS[index % SLOTS.length];
    screens.push({ group, tilt, face, rim, halo, pool, poolMat, tone, hover: 0, focus: index === 0 ? 1 : 0, lean: new T.Vector2(), phase: index * 1.9 + .3, slot: index,
      pos: new T.Vector3(slot[0], slot[1], slot[2]), turn: slot[3], size: slot[4], hit: screenMesh });
    loader.load(item.src, texture => {
      if (released) { texture.dispose(); return; }
      texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const image = texture.image as { width: number; height: number };
      const imageAspect = image.width / Math.max(1, image.height), aspect = baseW / baseH;
      if (imageAspect > aspect) screenMesh.scale.set(1, aspect / imageAspect, 1); else screenMesh.scale.set(imageAspect / aspect, 1, 1);
      keep(texture); face.map = texture; face.color.setScalar(1); face.needsUpdate = true;
    });
  });

  const dustCount = 900, dust = new Float32Array(dustCount * 3), speeds = new Float32Array(dustCount);
  for (let index = 0; index < dustCount; index++) {
    dust.set([(Math.random() - .5) * 34, Math.random() * 9, -14 + Math.random() * 22], index * 3);
    speeds[index] = .05 + Math.random() * .14;
  }
  const dustGeometry = keep(new T.BufferGeometry()); dustGeometry.setAttribute('position', new T.BufferAttribute(dust, 3));
  scene.add(new T.Points(dustGeometry, keep(new T.PointsMaterial({ map: glow, color: 0xcfe6ff, size: .07, transparent: true, opacity: .5, blending: T.AdditiveBlending, depthWrite: false }))));

  const composer = new A.EffectComposer(renderer);
  composer.addPass(new A.RenderPass(scene, camera));
  const bloom = new A.UnrealBloomPass(new T.Vector2(256, 256), .5, .5, .86);
  composer.addPass(bloom);
  composer.addPass(new A.OutputPass());

  const raycaster = new T.Raycaster(), ndc = new T.Vector2(), local = new T.Vector2(), up = new T.Vector3(0, 1, 0);
  const pivot = new T.Vector3(0, 1.8, 0);
  const basePos = new T.Vector3(), lookBase = new T.Vector3(0, 2.7, 0), camPos = new T.Vector3(), camLook = new T.Vector3();
  const pointer = { x: 0, y: 0, weight: 0, tx: 0, ty: 0, tw: 0, cx: 9, cy: 9, on: false };
  const toneTarget = new T.Color(items[0]?.tone ?? '#6ee8e3');
  let hover: number | null = null, highlight: number | null = null, selected = 0, drag = 0, dragVelocity = 0, dragging = false;

  const assign = () => {
    // The selected work takes the front; the others keep their relative order
    // round the remaining slots, so a change reads as a gentle rotation.
    screens.forEach((screen, index) => { screen.slot = (index - selected + count) % count; });
  };
  const resize = () => {
    const nextWidth = Math.max(1, canvas.clientWidth), nextHeight = Math.max(1, canvas.clientHeight);
    if (nextWidth === width && nextHeight === height) return false;
    width = nextWidth; height = nextHeight; narrow = width < 700;
    renderer.setSize(width, height, false); composer.setSize(width, height);
    bloom.resolution.set(width * ratio * (quality ? .35 : .5), height * ratio * (quality ? .35 : .5));
    camera.aspect = width / height;
    camera.fov = narrow ? 44 : 32;
    // Step back until the constellation (about 15 units wide) fits the frame.
    const halfWide = Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
    const distance = Math.max(narrow ? 9 : 11, (narrow ? 4.4 : 7.6) / Math.tan(halfWide));
    basePos.set(0, 2.6 + distance * .04, distance);
    // On wide layouts the copy sits on the left, so frame the constellation to the right.
    if (narrow) camera.clearViewOffset(); else camera.setViewOffset(width, height, -(width * .18 + Math.max(0, width - 1440) * .12), 0, width, height);
    camera.updateProjectionMatrix();
    floor.getRenderTarget().setSize(Math.round(width * ratio * (quality ? .35 : .5)), Math.round(height * ratio * (quality ? .35 : .5)));
    return true;
  };
  const setPointer = (x: number, y: number, canvasX: number, canvasY: number, on: boolean) => {
    pointer.tx = x; pointer.ty = y; pointer.tw = on ? 1 : 0; pointer.cx = canvasX; pointer.cy = canvasY; pointer.on = on;
  };
  const pick = (x: number, y: number) => {
    ndc.set(x, -y); raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(screens.map(screen => screen.hit), false)[0];
    return hit ? screens.findIndex(screen => screen.hit === hit.object) : null;
  };
  const select = (index: number) => {
    selected = (index + count) % count; assign(); toneTarget.set(items[selected].tone);
  };

  const target = new T.Vector3();
  const draw = (time: number, dt: number) => {
    if (released) return;
    const step = dt || 1 / 60, quick = 1 - Math.exp(-step * 6), glide = 1 - Math.exp(-step * 3.2);
    pointer.x += (pointer.tx - pointer.x) * quick; pointer.y += (pointer.ty - pointer.y) * quick; pointer.weight += (pointer.tw - pointer.weight) * quick;
    if (!dragging) {
      drag += dragVelocity * step; dragVelocity *= Math.exp(-step * 2.6);
      dragVelocity -= drag * step * 3.2;
      if (Math.abs(drag) < .0005 && Math.abs(dragVelocity) < .0005) drag = dragVelocity = 0;
    }
    const yaw = drag + Math.sin(time * .13) * .05 + pointer.x * .2 * pointer.weight;
    const lift = Math.sin(time * .19) * .18 - pointer.y * .8 * pointer.weight;
    camPos.copy(basePos).sub(pivot).applyAxisAngle(up, -yaw).add(pivot); camPos.y += lift;
    camLook.copy(lookBase).sub(pivot).applyAxisAngle(up, -yaw * .4).add(pivot);
    camera.position.copy(camPos); camera.lookAt(camLook);
    backdropMat.color.lerp(toneTarget, 1 - Math.exp(-step * 2));
    hover = null;
    if (pointer.on && !dragging) {
      ndc.set(pointer.cx, -pointer.cy); raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(screens.map(screen => screen.hit), false)[0];
      if (hit) { hover = screens.findIndex(screen => screen.hit === hit.object); if (hit.uv) local.set(hit.uv.x * 2 - 1, hit.uv.y * 2 - 1); }
    }
    const lit = hover ?? highlight;
    const layout = narrow ? NARROW : SLOTS;
    screens.forEach((screen, index) => {
      const slot = layout[screen.slot], front = screen.slot === 0;
      screen.focus += ((front ? 1 : 0) - screen.focus) * glide;
      screen.hover += ((index === lit ? 1 : 0) - screen.hover) * (1 - Math.exp(-step * 7));
      const f = screen.focus, h = screen.hover, t = time + screen.phase;
      // Each work drifts on its own small loop around its slot.
      target.set(slot[0] + Math.sin(t * .37) * .22 * (1 - f * .6), slot[1] + Math.sin(t * .53) * .16, slot[2] + Math.cos(t * .29) * .25 * (1 - f * .6));
      screen.pos.lerp(target, glide); screen.turn += (slot[3] - screen.turn) * glide; screen.size += (slot[4] * (1 + h * .1) - screen.size) * glide;
      screen.group.position.copy(screen.pos); screen.group.rotation.y = screen.turn; screen.group.scale.setScalar(screen.size);
      screen.pool.position.set(screen.pos.x, .006, screen.pos.z + 1.1 * screen.size); screen.pool.scale.setScalar(screen.size);
      if (screen.face.map) screen.face.color.setScalar(.78 + f * .22 + h * .12);
      screen.rim.color.copy(screen.tone).multiplyScalar(.7 + f * .5 + h * .6);
      screen.halo.opacity = .14 + f * .2 + h * .16;
      screen.poolMat.opacity = .14 + f * .22 + h * .14;
      const own = index === hover;
      const leanX = own ? -local.y * .2 : -pointer.y * .06 * pointer.weight;
      const leanY = own ? local.x * .28 : pointer.x * .14 * pointer.weight;
      const follow = 1 - Math.exp(-step * (3.5 + index * .7));
      screen.lean.x += (leanX - screen.lean.x) * follow; screen.lean.y += (leanY - screen.lean.y) * follow;
      screen.tilt.rotation.x = screen.lean.x + Math.sin(t * .6) * .03;
      screen.tilt.rotation.y = screen.lean.y + Math.sin(t * .45) * .05;
      screen.tilt.rotation.z = Math.sin(t * .31) * .02 * (1 - f);
      screen.tilt.position.z = h * .7;
    });
    const positions = dustGeometry.attributes.position as Three.BufferAttribute;
    for (let index = 0; index < dustCount; index++) {
      let y = positions.getY(index) + speeds[index] * step;
      if (y > 9) y = 0;
      positions.setY(index, y);
    }
    positions.needsUpdate = true;
    // Watch real frame times for a while; step quality down if most frames are slow.
    if (dt && sampled < 240) {
      sampled++; if (dt > 1 / 40) slowFrames++;
      if (sampled % 80 === 0 && slowFrames > 50 && quality < 2) {
        quality++; slowFrames = 0;
        ratio = Math.min(ratio, 1); renderer.setPixelRatio(ratio); width = height = 0; resize();
      } else if (sampled % 80 === 0) slowFrames = 0;
    }
    if (quality >= 2) renderer.render(scene, camera); else composer.render(step);
  };
  const dispose = () => {
    if (released) return; released = true;
    disposables.forEach(item => item.dispose()); floor.dispose(); composer.dispose(); bloom.dispose();
    renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); scene.clear();
    canvas.width = canvas.height = 1;
  };
  resize(); assign();
  return {
    resize, setPointer, pick, draw, dispose, select,
    selected: () => selected,
    setHighlight: index => { highlight = index; },
    hovered: () => hover,
    setDrag: angle => { dragging = true; drag = angle; dragVelocity = 0; },
    release: velocity => { dragging = false; dragVelocity = velocity; },
  };
}
