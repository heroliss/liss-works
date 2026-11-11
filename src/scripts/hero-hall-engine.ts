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
  setActive: (index: number, instant?: boolean) => void;
  setPointer: (x: number, y: number, canvasX: number, canvasY: number, active: boolean) => void;
  hovered: () => number | null;
  /** Live drag: turn the view around the hall centre by an angle (radians). */
  setDrag: (angle: number) => void;
  /** Finish a drag on a screen, keeping the camera where the drag left it. */
  release: (index: number) => void;
  spread: number;
  count: number;
  pick: (x: number, y: number) => number | null;
  draw: (time: number, dt: number) => void;
  dispose: () => void;
}

type Screen = { group: Three.Group; tilt: Three.Group; base: Three.Vector3; scale: number; phase: number; lean: Three.Vector2; face: Three.MeshBasicMaterial; rim: Three.MeshBasicMaterial; halo: Three.MeshBasicMaterial; pool: Three.MeshBasicMaterial;
  shaft: Three.Mesh; shaftMat: Three.MeshBasicMaterial; tone: Three.Color; focus: number; hover: number; normal: Three.Vector3; width: number; height: number; hit: Three.Mesh };

const BG = 0x070b12;
const RADIUS = 9, SPREAD = .6;
// Hand-placed variation so the hall feels arranged by a person, not a grid:
// [radius offset, height, extra turn, roll, size].
const PLACES = [[.6, 1.75, .1, -.035, .92], [-.5, 1.35, -.06, .025, 1.04], [.15, 1.6, .05, -.015, 1.1], [-.7, 1.9, -.1, .04, .9], [.4, 1.4, .08, -.03, 1]];

function radialTexture(T: T, inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,.35)') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, inner); gradient.addColorStop(.32, mid); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 256, 256);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
}
function shaftTexture(T: T) {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const vertical = context.createLinearGradient(0, 0, 0, 256);
  vertical.addColorStop(0, 'rgba(255,255,255,0)'); vertical.addColorStop(.55, 'rgba(255,255,255,.55)'); vertical.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = vertical; context.fillRect(0, 0, 64, 256);
  context.globalCompositeOperation = 'destination-in';
  const horizontal = context.createLinearGradient(0, 0, 64, 0);
  horizontal.addColorStop(0, 'rgba(0,0,0,0)'); horizontal.addColorStop(.5, 'rgba(0,0,0,1)'); horizontal.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = horizontal; context.fillRect(0, 0, 64, 256);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
}
function floorMask(T: T) {
  // Dims the mirror: clearer just in front of the screens, fully dark toward the edges.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(128, 150, 10, 128, 140, 128);
  gradient.addColorStop(0, 'rgba(7,11,18,.38)'); gradient.addColorStop(.55, 'rgba(7,11,18,.72)'); gradient.addColorStop(1, 'rgba(7,11,18,1)');
  context.fillStyle = gradient; context.fillRect(0, 0, 256, 256);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
}

/**
 * A dark exhibition hall: five large screens carry the featured works over a
 * mirror floor. Each casts its colour onto the floor and into a light shaft;
 * the camera glides from one screen to the next as the spotlight changes.
 */
export function createHallEngine(T: T, A: HallAddons, canvas: HTMLCanvasElement, context: WebGL2RenderingContext, items: HallItem[]): HallEngine {
  let renderer: Three.WebGLRenderer;
  try { renderer = new T.WebGLRenderer({ canvas, context, antialias: true, powerPreference: 'high-performance' }); }
  catch (error) { context.getExtension('WEBGL_lose_context')?.loseContext(); throw error; }
  const ratio = Math.min(devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .98;
  renderer.setClearColor(BG, 1);

  const scene = new T.Scene();
  scene.fog = new T.FogExp2(BG, .052);
  const camera = new T.PerspectiveCamera(34, 1, .1, 120);
  const disposables: { dispose: () => void }[] = [];
  const keep = <V extends { dispose: () => void }>(value: V) => { disposables.push(value); return value; };
  let released = false;

  scene.add(new T.HemisphereLight(0x9fc4e0, 0x05080c, .55));
  const key = new T.DirectionalLight(0xfff0e0, .7); key.position.set(-3, 8, 6); scene.add(key);

  // Mirror floor, dimmed by a darker veil so the reflection reads as polished stone.
  let width = 1, height = 1;
  const floor = new A.Reflector(keep(new T.PlaneGeometry(80, 80)), { clipBias: .003, textureWidth: 512, textureHeight: 512, color: 0x8a96a6 });
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const veilTexture = keep(floorMask(T));
  const veil = new T.Mesh(keep(new T.PlaneGeometry(46, 46)), keep(new T.MeshBasicMaterial({ map: veilTexture, transparent: true, depthWrite: false, fog: false })));
  veil.rotation.x = -Math.PI / 2; veil.position.set(0, .004, -4); scene.add(veil);
  const ring = new T.Mesh(keep(new T.RingGeometry(RADIUS - 1.6, RADIUS - 1.56, 160)), keep(new T.MeshBasicMaterial({ color: 0x3a5068, transparent: true, opacity: .35, depthWrite: false })));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, .006, 0); scene.add(ring);

  const glow = keep(radialTexture(T));
  const shaftMap = keep(shaftTexture(T));
  const loader = new T.TextureLoader();
  const screens: Screen[] = [];
  const count = items.length;
  items.forEach((item, index) => {
    const offset = index - (count - 1) / 2;
    const group = new T.Group();
    // An arc of screens around a central viewpoint; each faces the centre, so the
    // camera can pan from one to the next without any screen blocking another.
    const place = PLACES[index % PLACES.length];
    const angle = offset * SPREAD + place[2] * .35, radius = RADIUS + place[0];
    group.position.set(Math.sin(angle) * radius, 0, -Math.cos(angle) * radius);
    group.rotation.y = -angle + place[2];
    scene.add(group);
    // Everything that floats and turns lives on the tilt group; the floor glow stays put.
    const tilt = new T.Group(); tilt.position.y = place[1]; tilt.rotation.z = place[3]; group.add(tilt);
    const tone = new T.Color(item.tone);
    const w = 3.5 * place[4], h = w / 1.6;
    const frame = new T.Mesh(keep(new T.BoxGeometry(w + .16, h + .16, .1)), keep(new T.MeshStandardMaterial({ color: 0x0b1117, metalness: .85, roughness: .32 })));
    tilt.add(frame);
    const face = keep(new T.MeshBasicMaterial({ color: 0x111a22, toneMapped: false }));
    const screenMesh = new T.Mesh(keep(new T.PlaneGeometry(w, h)), face); screenMesh.position.z = .055; tilt.add(screenMesh);
    // Emissive bars around the screen; bright enough to bloom.
    const rim = keep(new T.MeshBasicMaterial({ color: tone.clone().multiplyScalar(1.4), toneMapped: false }));
    const bar = (bw: number, bh: number, x: number, y: number) => { const m = new T.Mesh(keep(new T.BoxGeometry(bw, bh, .05)), rim); m.position.set(x, y, .06); tilt.add(m); };
    bar(w + .2, .03, 0, h / 2 + .1); bar(w + .2, .03, 0, -h / 2 - .1); bar(.03, h + .2, -w / 2 - .1, 0); bar(.03, h + .2, w / 2 + .1, 0);
    const halo = keep(new T.MeshBasicMaterial({ map: glow, color: tone, transparent: true, opacity: .4, blending: T.AdditiveBlending, depthWrite: false }));
    const haloMesh = new T.Mesh(keep(new T.PlaneGeometry(w * 2.2, h * 2.6)), halo); haloMesh.position.z = -.12; tilt.add(haloMesh);
    const pool = keep(new T.MeshBasicMaterial({ map: glow, color: tone, transparent: true, opacity: .5, blending: T.AdditiveBlending, depthWrite: false }));
    const poolMesh = new T.Mesh(keep(new T.PlaneGeometry(w * 1.9, 3.4)), pool); poolMesh.rotation.x = -Math.PI / 2; poolMesh.position.set(0, .005, 1.2); group.add(poolMesh);
    const shaftMat = keep(new T.MeshBasicMaterial({ map: shaftMap, color: tone, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    const shaft = new T.Mesh(keep(new T.PlaneGeometry(w * 1.25, 9)), shaftMat); shaft.position.set(0, 2.6, -.35); tilt.add(shaft);
    const normal = new T.Vector3(Math.sin(group.rotation.y), 0, Math.cos(group.rotation.y));
    screens.push({ group, tilt, base: tilt.position.clone(), scale: 1, phase: index * 1.7 + .4, lean: new T.Vector2(), face, rim, halo, pool, shaft, shaftMat, tone, focus: 0, hover: 0, normal, width: w, height: h, hit: screenMesh });
    loader.load(item.src, texture => {
      if (released) { texture.dispose(); return; }
      texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const image = texture.image as { width: number; height: number };
      const imageAspect = image.width / Math.max(1, image.height), aspect = w / h;
      // Contain: show the whole screenshot, letterboxed against the dark glass.
      if (imageAspect > aspect) { screenMesh.scale.set(1, aspect / imageAspect, 1); } else { screenMesh.scale.set(imageAspect / aspect, 1, 1); }
      keep(texture); face.map = texture; face.color.setScalar(.6); face.needsUpdate = true;
    });
  });

  // Dust drifting up through the light.
  const dustCount = 900, dust = new Float32Array(dustCount * 3), speeds = new Float32Array(dustCount);
  for (let index = 0; index < dustCount; index++) {
    dust.set([(Math.random() - .5) * 30, Math.random() * 7, -12 + Math.random() * 18], index * 3);
    speeds[index] = .05 + Math.random() * .12;
  }
  const dustGeometry = keep(new T.BufferGeometry()); dustGeometry.setAttribute('position', new T.BufferAttribute(dust, 3));
  const dustMaterial = keep(new T.PointsMaterial({ map: glow, color: 0xbfdcff, size: .055, transparent: true, opacity: .38, blending: T.AdditiveBlending, depthWrite: false }));
  scene.add(new T.Points(dustGeometry, dustMaterial));

  const composer = new A.EffectComposer(renderer);
  composer.addPass(new A.RenderPass(scene, camera));
  const bloom = new A.UnrealBloomPass(new T.Vector2(256, 256), .42, .45, .88);
  composer.addPass(bloom);
  composer.addPass(new A.OutputPass());

  const raycaster = new T.Raycaster(), ndc = new T.Vector2();
  let active = 0, hover: number | null = null, shift = 0;
  const pointer = { x: 0, y: 0, weight: 0, tx: 0, ty: 0, tw: 0, cx: 0, cy: 0, on: false };
  const local = new T.Vector2();
  const camPos = new T.Vector3(), camLook = new T.Vector3(), goalPos = new T.Vector3(), goalLook = new T.Vector3();
  const up = new T.Vector3(0, 1, 0), dragPos = new T.Vector3(), dragLook = new T.Vector3();
  let drag = 0, dragShown = 0, dragging = false;
  const goals = (index: number) => {
    const screen = screens[index];
    // Stand behind the centre, opposite the active screen, and look at it across the hall.
    goalLook.copy(screen.group.position).add(new T.Vector3(0, screen.base.y - .2, 0));
    goalPos.copy(screen.normal).multiplyScalar(1.4).add(new T.Vector3(0, 1.6, 0));
  };

  const resize = () => {
    const nextWidth = Math.max(1, canvas.clientWidth), nextHeight = Math.max(1, canvas.clientHeight);
    if (nextWidth === width && nextHeight === height) return false;
    width = nextWidth; height = nextHeight;
    renderer.setSize(width, height, false); composer.setSize(width, height);
    bloom.resolution.set(width * ratio * .5, height * ratio * .5);
    camera.aspect = width / height;
    // On wide layouts the copy sits on the left, so frame the hall to the right of centre.
    shift = width > 860 ? width * .17 : 0;
    if (shift) camera.setViewOffset(width, height, -shift, 0, width, height); else camera.clearViewOffset();
    camera.fov = camera.aspect < 1 ? 46 : 34;
    camera.updateProjectionMatrix();
    floor.getRenderTarget().setSize(Math.round(width * ratio * .5), Math.round(height * ratio * .5));
    return true;
  };
  const setActive = (index: number, instant = false) => {
    active = Math.max(0, Math.min(count - 1, index)); goals(active);
    if (instant) { camPos.copy(goalPos); camLook.copy(goalLook); screens.forEach((screen, i) => { screen.focus = i === active ? 1 : 0; }); }
  };
  const setPointer = (x: number, y: number, canvasX: number, canvasY: number, on: boolean) => {
    pointer.tx = x; pointer.ty = y; pointer.tw = on ? 1 : 0; pointer.cx = canvasX; pointer.cy = canvasY; pointer.on = on;
  };
  const pick = (x: number, y: number) => {
    ndc.set(x, -y); raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(screens.map(screen => screen.hit), false)[0];
    return hit ? screens.findIndex(screen => screen.hit === hit.object) : null;
  };

  const draw = (time: number, dt: number) => {
    if (released) return;
    const step = dt || 1 / 60;
    const glide = 1 - Math.exp(-step * 1.9), quick = 1 - Math.exp(-step * 6);
    camPos.lerp(goalPos, glide); camLook.lerp(goalLook, glide);
    // Dragging orbits the whole view around the hall centre, where the arc is centred.
    dragShown += (drag - dragShown) * (dragging ? 1 - Math.exp(-step * 18) : quick);
    dragPos.copy(camPos).applyAxisAngle(up, dragShown); dragLook.copy(camLook).applyAxisAngle(up, dragShown);
    pointer.x += (pointer.tx - pointer.x) * quick; pointer.y += (pointer.ty - pointer.y) * quick; pointer.weight += (pointer.tw - pointer.weight) * quick;
    // The camera orbits its target instead of sliding, so screens never shrink
    // as the pointer moves; it also drifts a little on its own.
    const yaw = Math.sin(time * .17) * .035 + pointer.x * .17 * pointer.weight;
    const pitch = Math.sin(time * .23) * .015 - pointer.y * .07 * pointer.weight;
    const offset = dragPos.clone().sub(dragLook);
    offset.applyAxisAngle(new T.Vector3(0, 1, 0), -yaw);
    const side = new T.Vector3().crossVectors(offset, new T.Vector3(0, 1, 0)).normalize();
    offset.applyAxisAngle(side, pitch);
    camera.position.copy(dragLook).add(offset);
    camera.lookAt(dragLook);
    // Which screen is under the pointer, and where on it.
    hover = null;
    if (pointer.on && !dragging) {
      ndc.set(pointer.cx, -pointer.cy); raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(screens.map(screen => screen.hit), false)[0];
      if (hit) { hover = screens.findIndex(screen => screen.hit === hit.object); if (hit.uv) local.set(hit.uv.x * 2 - 1, hit.uv.y * 2 - 1); }
    }
    screens.forEach((screen, index) => {
      screen.focus += ((index === active ? 1 : 0) - screen.focus) * (1 - Math.exp(-step * 3));
      screen.hover += ((index === hover ? 1 : 0) - screen.hover) * (1 - Math.exp(-step * 7));
      const f = screen.focus, h = screen.hover, lit = Math.max(f, h * .7);
      if (screen.face.map) screen.face.color.setScalar(.5 + lit * .5);
      screen.rim.color.copy(screen.tone).multiplyScalar(.45 + lit * .85);
      screen.halo.opacity = .05 + lit * .17;
      screen.pool.opacity = .05 + lit * .2;
      screen.shaftMat.opacity = f * .18;
      // Every screen leans gently toward the pointer; the hovered one tilts under it like a card.
      const leanX = (index === hover ? -local.y * .2 : -pointer.y * .07 * pointer.weight);
      const leanY = (index === hover ? local.x * .28 : pointer.x * .12 * pointer.weight);
      const follow = 1 - Math.exp(-step * (4 + index * .6));
      screen.lean.x += (leanX - screen.lean.x) * follow; screen.lean.y += (leanY - screen.lean.y) * follow;
      const t = time + screen.phase;
      screen.tilt.rotation.x = screen.lean.x + Math.sin(t * .6) * .025;
      screen.tilt.rotation.y = screen.lean.y + Math.sin(t * .45) * .03;
      screen.tilt.position.y = screen.base.y + Math.sin(t * .7) * .07 + f * .06;
      // Hovering brings a screen forward and makes it larger, never smaller.
      screen.tilt.position.z = h * .9 + f * .15;
      screen.scale += ((1 + h * .1 + f * .03) - screen.scale) * (1 - Math.exp(-step * 6));
      screen.tilt.scale.setScalar(screen.scale);
      screen.shaft.rotation.y = Math.atan2(camera.position.x - screen.group.position.x, camera.position.z - screen.group.position.z) - screen.group.rotation.y - screen.tilt.rotation.y;
    });
    const positions = dustGeometry.attributes.position as Three.BufferAttribute;
    for (let index = 0; index < dustCount; index++) {
      let y = positions.getY(index) + speeds[index] * step;
      if (y > 7) y = 0;
      positions.setY(index, y);
    }
    positions.needsUpdate = true;
    composer.render(step);
  };
  const dispose = () => {
    if (released) return; released = true;
    disposables.forEach(item => item.dispose()); floor.dispose(); composer.dispose(); bloom.dispose();
    renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); scene.clear();
    canvas.width = canvas.height = 1;
  };
  resize(); setActive(0, true);
  const setDrag = (angle: number) => { dragging = true; drag = angle; };
  const release = (index: number) => {
    // Bake the dragged view into the glide start, then glide to the chosen screen.
    camPos.applyAxisAngle(up, dragShown); camLook.applyAxisAngle(up, dragShown);
    drag = dragShown = 0; dragging = false; setActive(index);
  };
  return { resize, setActive, setPointer, hovered: () => hover, setDrag, release, spread: SPREAD, count, pick, draw, dispose };
}
