import type * as Three from 'three';

type Options = { signal: AbortSignal; preference: MediaQueryList };
type T = typeof import('three');
type Point = [number, number, number];
type Material = Three.MeshStandardMaterial | Three.MeshPhysicalMaterial | Three.MeshBasicMaterial;
type Engine = { resize: () => boolean; repaint: () => void; draw: (time: number, x: number, y: number, dt: number) => void; dispose: () => void };

/** The module is cheap on every other page. Geometry and WebGL are loaded only
 * after an actual creator-room is found and reaches the viewport. */
export function setupCreatorRoom({ signal, preference }: Options): () => void {
  const root = document.querySelector<HTMLElement>('[data-creator-room]');
  if (!root || signal.aborted) return () => {};
  const canvas = root.querySelector<HTMLCanvasElement>('[data-creator-canvas]')!;
  const stage = root.querySelector<HTMLElement>('[data-creator-stage]')!;
  const fallback = root.querySelector<HTMLElement>('[data-creator-fallback]')!;
  const status = root.querySelector<HTMLElement>('[data-creator-status]')!;
  const toggle = root.querySelector<HTMLButtonElement>('[data-creator-motion-toggle]')!;
  const label = root.querySelector<HTMLElement>('[data-creator-motion-label]')!;
  const events = new AbortController(), urls = new Set<string>(), timers = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false, visible = false, loading = false, failed = false, engine: Engine | undefined;
  let frame = 0, last = 0, time = 0, pointerX = 0, pointerY = 0, needsPaint = false;
  let bounds = { left: 0, top: 0, width: 1, height: 1 };
  const saved = { state: root.dataset.roomState, canvas: canvas.hidden, fallback: fallback.hidden, text: status.textContent };
  const paused = () => document.documentElement.dataset.motionPaused === 'true';
  const measure = () => {
    if (disposed) return;
    const box = stage.getBoundingClientRect();
    bounds = { left: box.left + scrollX, top: box.top + scrollY, width: box.width, height: box.height };
    if (engine?.resize()) needsPaint = true;
    if (visible && !document.hidden && engine && needsPaint && (paused() || preference.matches)) { engine.repaint(); needsPaint = false; }
  };
  const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
  const canAnimate = () => !disposed && !!engine && visible && !document.hidden && !paused() && !preference.matches;
  const render = (now: number) => {
    frame = 0;
    if (!canAnimate()) return;
    frame = requestAnimationFrame(render);
    if (last && now - last < 1000 / 30 - 1) return;
    const dt = last ? Math.min(.08, (now - last) / 1000) : 0;
    last = now; time += dt;
    engine!.draw(time, pointerX, pointerY, dt);
    needsPaint = false;
  };
  const sync = () => {
    if (disposed) return;
    toggle.hidden = !engine;
    toggle.disabled = !engine || preference.matches;
    toggle.setAttribute('aria-pressed', String(paused()));
    label.textContent = preference.matches ? '静态场景' : paused() ? '继续场景' : '暂停场景';
    if (!engine) { if (visible && !document.hidden && !failed && !loading) void load(); return; }
    root.dataset.roomState = preference.matches ? 'static' : paused() ? 'paused' : document.hidden || !visible ? 'suspended' : 'playing';
    if (canAnimate()) { if (!frame) frame = requestAnimationFrame(render); }
    else {
      stop(); pointerX = pointerY = 0;
      if (visible && !document.hidden) {
        if (preference.matches) { engine.draw(7, 0, 0, 0); needsPaint = false; }
        else if (needsPaint) { engine.repaint(); needsPaint = false; }
      }
    }
  };
  const unavailable = () => {
    if (disposed || failed) return;
    failed = true; stop(); engine?.dispose(); engine = undefined;
    canvas.hidden = true; fallback.hidden = false; toggle.hidden = true;
    root.dataset.roomState = 'fallback';
    status.textContent = '此浏览器暂时无法展开实时空间。静态桌面与文字仍可正常查看。';
  };
  let exportButton: HTMLButtonElement | undefined;
  const addExport = () => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('capture') || exportButton) return;
    exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.dataset.creatorExport = '';
    exportButton.textContent = '保存创作场景静帧'; root.querySelector('figcaption')?.append(exportButton);
    exportButton.addEventListener('click', () => {
      if (!engine || disposed) return;
      engine.repaint();
      canvas.getContext('webgl2')?.finish();
      canvas.toBlob(blob => {
        if (!blob || disposed) return;
        const url = URL.createObjectURL(blob); urls.add(url);
        const link = document.createElement('a'); link.href = url; link.download = 'creator-room.png'; link.click();
        const timer = setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); timers.delete(timer); }, 1500); timers.add(timer);
      }, 'image/png');
    }, { signal: events.signal });
  };
  const load = async () => {
    if (loading || engine || failed || disposed || !visible || document.hidden) return;
    loading = true; root.dataset.roomState = 'loading';
    try {
      const THREE = await import('three');
      if (disposed) return;
      if (!visible || document.hidden) { root.dataset.roomState = 'waiting'; return; }
      const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
      if (!context) { unavailable(); return; }
      engine = makeRoom(THREE, canvas, stage, context);
      if (disposed) { engine.dispose(); engine = undefined; return; }
      measure(); engine.draw(preference.matches ? 7 : time, 0, 0, 0); needsPaint = false;
      fallback.hidden = true; canvas.hidden = false; addExport(); sync();
    } catch { unavailable(); }
    finally { loading = false; }
  };
  const view = new IntersectionObserver(([entry]) => {
    if (disposed) return;
    visible = entry.isIntersecting;
    if (visible && !engine) void load();
    sync();
  }); view.observe(stage);
  const size = new ResizeObserver(measure); size.observe(stage);
  toggle.addEventListener('click', () => {
    const value = !paused(); document.documentElement.dataset.motionPaused = String(value);
    window.dispatchEvent(new CustomEvent('portfolio:motion-state', { detail: { paused: value } }));
  }, { signal: events.signal });
  stage.addEventListener('pointerenter', measure, { signal: events.signal });
  stage.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || !canAnimate()) return;
    pointerX = Math.max(-1, Math.min(1, (event.pageX - bounds.left) / Math.max(1, bounds.width) * 2 - 1));
    pointerY = Math.max(-1, Math.min(1, (event.pageY - bounds.top) / Math.max(1, bounds.height) * 2 - 1));
  }, { passive: true, signal: events.signal });
  stage.addEventListener('pointerleave', () => { pointerX = pointerY = 0; }, { signal: events.signal });
  window.addEventListener('portfolio:motion-state', sync, { signal: events.signal });
  document.addEventListener('visibilitychange', sync, { signal: events.signal });
  preference.addEventListener('change', sync, { signal: events.signal });
  canvas.addEventListener('webglcontextlost', event => { if (!disposed) { event.preventDefault(); unavailable(); } }, { signal: events.signal });
  const dispose = () => {
    if (disposed) return; disposed = true; stop(); events.abort(); view.disconnect(); size.disconnect(); engine?.dispose(); engine = undefined;
    exportButton?.remove(); urls.forEach(url => URL.revokeObjectURL(url)); timers.forEach(clearTimeout); urls.clear(); timers.clear();
    canvas.hidden = saved.canvas; fallback.hidden = saved.fallback; status.textContent = saved.text;
    // A restored BFCache page must get a fresh WebGL context after the previous
    // renderer explicitly lost its context during disposal.
    const freshCanvas = canvas.cloneNode(false) as HTMLCanvasElement;
    freshCanvas.removeAttribute('width'); freshCanvas.removeAttribute('height'); canvas.replaceWith(freshCanvas);
    toggle.hidden = true; toggle.disabled = true; toggle.setAttribute('aria-pressed', 'false'); label.textContent = '暂停场景';
    if (saved.state === undefined) delete root.dataset.roomState; else root.dataset.roomState = saved.state;
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}

function makeRoom(T: T, canvas: HTMLCanvasElement, stage: HTMLElement, context: WebGL2RenderingContext): Engine {
  let renderer: Three.WebGLRenderer;
  try { renderer = new T.WebGLRenderer({ canvas, context, antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch (error) { context.getExtension('WEBGL_lose_context')?.loseContext(); throw error; }
  const scene = new T.Scene();
  const geometries = new Set<Three.BufferGeometry>(), materials = new Set<Three.Material>(), textures = new Set<Three.Texture>(), shadows = new Set<Three.LightShadow>();
  let released = false;
  const release = () => {
    if (released) return; released = true;
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); shadows.forEach(s => s.dispose());
    renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); scene.clear();
    geometries.clear(); materials.clear(); textures.clear(); shadows.clear(); canvas.width = canvas.height = 1;
  };
  try {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.28;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap; renderer.setClearColor(0x0b0e10, 0);
  const camera = new T.PerspectiveCamera(33, 1, .03, 30), world = new T.Group(); scene.add(world);
  const standard = (color: number | string, roughness = .7, metalness = 0) => { const m = new T.MeshStandardMaterial({ color, roughness, metalness }); materials.add(m); return m; };
  const physical = (settings: Three.MeshPhysicalMaterialParameters) => { const m = new T.MeshPhysicalMaterial(settings); materials.add(m); return m; };
  const mesh = (geometry: Three.BufferGeometry, material: Material, parent: Three.Object3D = world) => {
    geometries.add(geometry); materials.add(material); const item = new T.Mesh(geometry, material); item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  };
  const at = (object: Three.Object3D, p: Point) => { object.position.set(...p); return object; };
  const group = (parent: Three.Object3D = world, p: Point = [0, 0, 0]) => { const g = new T.Group(); at(g, p); parent.add(g); return g; };
  const box = (w: number, h: number, d: number, material: Material, p: Point, parent: Three.Object3D = world) => at(mesh(new T.BoxGeometry(w, h, d), material, parent), p) as Three.Mesh;
  const ellipsoid = (r: Point, material: Material, p: Point, parent: Three.Object3D = world, segments = 28) => { const m = mesh(new T.SphereGeometry(1, segments, 20), material, parent); m.scale.set(...r); at(m, p); return m; };
  const line = (points: Point[], radius: number, material: Material, parent: Three.Object3D = world) => mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), Math.max(12, points.length * 7), radius, 6, false), material, parent);
  const roundedShape = (w: number, h: number, r: number) => {
    const s = new T.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  };
  const rounded = (w: number, h: number, d: number, r: number, material: Material, p: Point, parent: Three.Object3D = world) => {
    const bevel = Math.min(d / 4, .009);
    const geometry = new T.ExtrudeGeometry(roundedShape(w - bevel * 2, h - bevel * 2, Math.max(.001, r - bevel)), { depth: d - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 7, steps: 1 });
    geometry.translate(0, 0, -d / 2 + bevel); return at(mesh(geometry, material, parent), p) as Three.Mesh;
  };
  const slab = (w: number, d: number, h: number, r: number, material: Material, p: Point, parent: Three.Object3D = world) => { const m = rounded(w, d, h, r, material, p, parent); m.rotation.x = -Math.PI / 2; return m; };
  const vertical = new T.Vector3(0, 1, 0), delta = new T.Vector3();
  const aimBone = (bone: Three.Mesh, a: Point, b: Point) => {
    delta.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); bone.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    bone.scale.y = delta.length(); bone.quaternion.setFromUnitVectors(vertical, delta.normalize());
  };
  const bone = (radius: number, material: Material, parent: Three.Object3D, a: Point, b: Point) => { const m = mesh(new T.CylinderGeometry(radius, radius * .89, 1, 18), material, parent); aimBone(m, a, b); return m; };
  const canvasTexture = (paint: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void, w = 512, h = 512) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')!, c);
    const texture = new T.CanvasTexture(c); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); textures.add(texture); return { canvas: c, texture, ctx: c.getContext('2d')! };
  };
  const walnut = standard(0x9b8a72, .69), floor = standard(0x293530, .94), steel = standard(0x414b46, .4, .72), black = standard(0x172321, .7), trim = standard(0x63736a, .4, .4);
  const wood = canvasTexture((c, image) => {
    c.fillStyle = '#61533e'; c.fillRect(0, 0, image.width, image.height);
    for (let i = 0; i < 140; i++) { c.strokeStyle = `rgba(30,24,16,${.035 + (i % 5) * .012})`; c.lineWidth = 1 + i % 3; c.beginPath(); c.moveTo(0, i * 4); c.bezierCurveTo(150, i * 4 - 8, 300, i * 4 + 7, 512, i * 4); c.stroke(); }
  }); walnut.map = wood.texture;
  slab(3.08, 2.48, .075, .15, floor, [0, -.04, -.13]);
  const wall = standard(0x2e3b35, .96); rounded(3.08, 1.68, .065, .02, wall, [0, .80, -1.35]);
  box(3.07, .055, .032, walnut, [0, .05, -1.304]);
  const window = group(world, [.87, 1.18, -1.306]);
  const night = standard(0x182d39, .32); night.emissive.set(0x244453); night.emissiveIntensity = .18;
  rounded(.75, .83, .025, .018, black, [0, 0, 0], window); box(.675, .755, .009, night, [0, 0, .018], window);
  box(.018, .76, .022, trim, [0, 0, .034], window); box(.675, .016, .022, trim, [0, -.07, .034], window);
  slab(.86, .16, .034, .014, walnut, [.87, .745, -1.24]);
  // A quiet home shelf, with actual small books and a ceramic pot.
  slab(.60, .17, .025, .012, walnut, [-.91, 1.41, -1.22]);
  [0x877e68, 0x5a7668, 0x586e76, 0x9b8469].forEach((color, i) => { const book = rounded(.053, .19 + i % 2 * .025, .105, .005, standard(color, .95), [-1.13 + i * .06, 1.52, -1.22]); book.rotation.z = i === 3 ? -.13 : .01; });
  const pot = standard(0x81866b, .9), leaf = standard(0x627960, .88);
  at(mesh(new T.LatheGeometry([new T.Vector2(.045, 0), new T.Vector2(.059, .09), new T.Vector2(.054, .098)], 24), pot), [-.72, 1.425, -1.21]);
  for (let i = 0; i < 6; i++) { const a = i * 2.4; const l = ellipsoid([.016, .07, .008], leaf, [-.72 + Math.cos(a) * .034, 1.58 + i % 2 * .02, -1.21 + Math.sin(a) * .03]); l.rotation.z = Math.sin(a) * .7; l.rotation.x = Math.cos(a) * .4; }
  slab(2.25, .86, .048, .045, walnut, [0, .755, -.34]);
  for (const x of [-1.005, 1.005]) for (const z of [-.66, -.02]) {
    at(mesh(new T.CylinderGeometry(.024, .027, .70, 16), steel), [x, .375, z]);
    ellipsoid([.033, .015, .033], black, [x, .019, z]);
  }
  box(2.01, .06, .035, steel, [0, .30, -.66]); box(1.65, .055, .16, black, [0, .67, -.62]);
  const tower = rounded(.23, .48, .42, .024, black, [1.12, .27, -.42]);
  const vent = standard(0x43504a, .7);
  for (let i = 0; i < 10; i++) box(.13, .005, .004, vent, [1.12, .17 + i * .022, -.204]);
  const buttonMaterial = standard(0x9bbaa1, .4); buttonMaterial.emissive.set(0x5c836b); buttonMaterial.emissiveIntensity = .3;
  ellipsoid([.009, .009, .004], buttonMaterial, [1.12, .456, -.203]); tower.castShadow = true;

  // Three 27-inch proportions, side panels turned inward by 30 degrees.
  const screens: { ctx: CanvasRenderingContext2D; texture: Three.CanvasTexture; canvas: HTMLCanvasElement; kind: number }[] = [];
  [-1, 0, 1].forEach((side, index) => {
    const monitor = group(world, [side * .60, 1.095, -.48 + Math.abs(side) * .13]); monitor.rotation.y = side * -Math.PI / 6;
    rounded(.616, .362, .032, .012, black, [0, 0, 0], monitor);
    box(.575, .004, .007, trim, [0, -.166, .020], monitor);
    bone(.012, steel, monitor, [0, -.17, -.01], [0, -.305, -.04]);
    slab(.22, .15, .014, .025, steel, [0, -.315, -.02], monitor);
    const screen = canvasTexture(() => {}, 960, 540); screens.push({ ...screen, kind: index });
    const screenMaterial = new T.MeshBasicMaterial({ map: screen.texture, toneMapped: false }); materials.add(screenMaterial);
    mesh(new T.PlaneGeometry(.591, .3324), screenMaterial, monitor).position.z = .0175;
    const light = new T.PointLight(0xb4d8d1, side === 0 ? .70 : .36, 1.6, 2); light.position.set(0, 0, .20); monitor.add(light);
    line([[0, -.03, -.025], [0, -.20, -.08], [.10 * (side || 1), -.34, -.12], [.15 * side, -.40, -.15]], .004, black, monitor);
  });
  // Keyboard caps and labels are real, individually raised geometry.
  slab(.58, .205, .018, .018, black, [0, .792, -.006]);
  const keyRows = ['1234567890-=', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  const keyPositions: { x: number; z: number; label: string }[] = [];
  keyRows.forEach((row, r) => [...row].forEach((label, c) => keyPositions.push({ x: -.245 + c * .039 + r * .008, z: -.075 + r * .039, label })));
  const keyGeometry = new T.BoxGeometry(.031, .012, .030); geometries.add(keyGeometry);
  const keyMat = standard(0x66726b, .75), caps = new T.InstancedMesh(keyGeometry, keyMat, keyPositions.length); caps.castShadow = true; caps.receiveShadow = true; world.add(caps);
  const matrix = new T.Matrix4(); keyPositions.forEach((key, i) => { matrix.makeTranslation(key.x, .807, key.z); caps.setMatrixAt(i, matrix); });
  slab(.19, .025, .012, .004, keyMat, [0, .807, .076]);
  const labels = canvasTexture((c) => { c.clearRect(0, 0, 1160, 410); c.fillStyle = '#e0e5dc'; c.font = '19px monospace'; c.textAlign = 'center'; keyPositions.forEach(k => c.fillText(k.label, (k.x / .58 + .5) * 1160, (k.z / .205 + .5) * 410 + 6)); }, 1160, 410);
  const labelMat = new T.MeshBasicMaterial({ map: labels.texture, transparent: true, depthWrite: false, toneMapped: false }); materials.add(labelMat);
  const labelPlane = mesh(new T.PlaneGeometry(.58, .205), labelMat); labelPlane.rotation.x = -Math.PI / 2; at(labelPlane, [0, .8135, -.006]); labelPlane.castShadow = false;
  ellipsoid([.036, .021, .057], black, [.39, .804, .018]); line([[.39, .823, -.026], [.39, .824, .005], [.39, .819, .035]], .0012, trim);
  const mat = standard(0x31443d, .95); slab(.20, .24, .003, .018, mat, [.39, .782, .018]);
  const mugMat = physical({ color:0x96a391, roughness:.32, metalness:0, clearcoat:.25 });
  const mug = group(world, [.80, .78, -.04]);
  mesh(new T.LatheGeometry([new T.Vector2(.035, 0), new T.Vector2(.039, .006), new T.Vector2(.044, .095), new T.Vector2(.039, .1), new T.Vector2(.036, .008)], 32), mugMat, mug);
  const mugHandle = mesh(new T.TorusGeometry(.028, .006, 9, 24), mugMat, mug); mugHandle.rotation.y = Math.PI / 2; at(mugHandle, [.041, .054, 0]);
  const tea = standard(0x302a1e, .27); const teaTop = mesh(new T.CircleGeometry(.035, 28), tea, mug); teaTop.rotation.x = -Math.PI / 2; teaTop.position.y = .085;

  // Task lamp: an articulated stem, enamel shade and a physically placed bulb.
  const enamel = standard(0x627566, .36, .35), warm = standard(0xffd8a0, .3); warm.emissive.set(0xffc578); warm.emissiveIntensity = 2.5;
  slab(.18, .15, .025, .07, enamel, [-.99, .789, -.45]);
  line([[-.99,.80,-.45],[-1.01,1.10,-.45],[-.91,1.35,-.47],[-.82,1.30,-.47]], .013, enamel);
  at(mesh(new T.LatheGeometry([new T.Vector2(.113,0),new T.Vector2(.11,.014),new T.Vector2(.045,.115),new T.Vector2(.025,.121)],32),enamel),[-.82,1.20,-.47]);
  ellipsoid([.04,.017,.04],warm,[-.82,1.217,-.47]);
  const lamp = new T.SpotLight(0xffd3a0, 11, 2.6, .90, 1, 2); at(lamp,[-.82,1.22,-.47]); at(lamp.target,[-.60,.75,-.04]); lamp.castShadow=true;lamp.shadow.mapSize.set(768,768);lamp.shadow.radius=3.5;lamp.shadow.bias=-.0008;shadows.add(lamp.shadow);world.add(lamp,lamp.target);

  // Ergonomic chair, pelvis and legs establish adult seated proportions.
  const cloth = standard(0x657982, .96), trousers = standard(0x3b4346, .94), chairFabric = standard(0x2b3338, .97), shoe = standard(0x282e2a, .82);
  const fabric = canvasTexture((c, image) => {
    c.fillStyle='#d0d3d0'; c.fillRect(0,0,image.width,image.height);
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){const v=184+((x*31+y*71)%39);c.fillStyle=`rgb(${v},${v+2},${v+1})`;c.fillRect(x,y,1,1);}
  },128,128);fabric.texture.wrapS=fabric.texture.wrapT=T.RepeatWrapping;fabric.texture.repeat.set(5,5);cloth.bumpMap=fabric.texture;cloth.bumpScale=.0012;
  const chair = group(world,[0,0,.51]);
  slab(.53,.50,.085,.10,chairFabric,[0,.49,0],chair);
  const back = rounded(.49,.53,.075,.09,chairFabric,[0,.86,.205],chair);back.rotation.x=-.14;
  line([[-.22,.59,.16],[-.25,.84,.19],[-.20,1.10,.23]],.012,steel,chair);line([[.22,.59,.16],[.25,.84,.19],[.20,1.10,.23]],.012,steel,chair);
  at(mesh(new T.CylinderGeometry(.027,.035,.36,18),steel,chair),[0,.27,0]);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;bone(.013,steel,chair,[0,.12,0],[Math.cos(a)*.31,.065,Math.sin(a)*.31]);const wheel=ellipsoid([.035,.035,.019],black,[Math.cos(a)*.31,.035,Math.sin(a)*.31],chair);wheel.rotation.y=a;}
  for(const side of [-1,1]){
    bone(.080,trousers,world,[side*.115,.55,.49],[side*.15,.46,.13]);ellipsoid([.076,.07,.075],trousers,[side*.15,.46,.13]);
    bone(.055,trousers,world,[side*.15,.44,.13],[side*.17,.10,.15]);const foot=ellipsoid([.067,.045,.12],shoe,[side*.17,.065,.08]);foot.rotation.y=side*-.12;
  }
  ellipsoid([.20,.11,.17],trousers,[0,.59,.49]);
  const body = group(world,[0,.65,.50]);
  const torso = mesh(new T.LatheGeometry([new T.Vector2(.165,-.025),new T.Vector2(.19,.04),new T.Vector2(.20,.20),new T.Vector2(.235,.35),new T.Vector2(.23,.39),new T.Vector2(.16,.465),new T.Vector2(.085,.49)],40),cloth,body);torso.scale.z=.67;
  line([[-.16,.06,-.08],[-.17,.21,-.12],[-.13,.36,-.13]],.0015,standard(0x3d5350,.98),body);
  const skin = physical({color:0xc5a085,roughness:.68,metalness:0,clearcoat:.035}), skinShade=standard(0xa27d65,.78), lip=standard(0x906959,.75), hair=standard(0x302b25,.75), hairLine=standard(0x3c352d,.81);
  at(mesh(new T.CylinderGeometry(.049,.058,.065,24),skin,body),[0,.504,-.045]);
  ellipsoid([.083,.033,.051],cloth,[-.068,.466,-.018],body);ellipsoid([.083,.033,.051],cloth,[.068,.466,-.018],body);
  const collar=mesh(new T.TorusGeometry(.062,.013,10,30),cloth,body);collar.rotation.x=Math.PI/2;at(collar,[0,.485,-.04]);
  const headPivot=group(body,[0,.525,-.065]),head=group(headPivot,[0,.117,0]);
  const skullGeometry=new T.SphereGeometry(1,48,36),position=skullGeometry.attributes.position;
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);const jaw=y<-.20?.76+(y+1)*.25:1;
    position.setXYZ(i,x*.084*jaw,y*.126,z*(z<0?.084:.094)+(y<-.45?-.008:0));
  }skullGeometry.computeVertexNormals();
  const complexion:number[]=[];for(let i=0;i<position.count;i++){const y=position.getY(i),z=position.getZ(i);const stubble=z<-.025&&y<-.025?.93:1;const cheek=z<-.035&&Math.abs(position.getX(i))>.035&&Math.abs(y+.015)<.035; complexion.push(stubble,stubble*(cheek?.955:1),stubble*(cheek?.92:1));}
  skullGeometry.setAttribute('color',new T.Float32BufferAttribute(complexion,3));const faceSkin=skin.clone();faceSkin.vertexColors=true;materials.add(faceSkin);mesh(skullGeometry,faceSkin,head);
  ellipsoid([.038,.017,.023],skin,[0,-.095,-.047],head);
  const noseGeometry=new T.BufferGeometry(),np:number[]=[],ni:number[]=[];
  const rings=[{y:.030,z:-.075,x:.007,h:.008},{y:.014,z:-.092,x:.007,h:.010},{y:-.002,z:-.109,x:.011,h:.008},{y:-.011,z:-.099,x:.015,h:.006},{y:-.016,z:-.083,x:.012,h:.005}];
  rings.forEach((ring,r)=>{for(let j=0;j<16;j++){const a=j/16*Math.PI*2;np.push(Math.cos(a)*ring.x,ring.y+Math.sin(a)*ring.h,ring.z);if(r){const k=r*16+j,n=r*16+(j+1)%16;ni.push(k-16,k,n-16,n-16,k,n);}}});
  noseGeometry.setAttribute('position',new T.Float32BufferAttribute(np,3));noseGeometry.setIndex(ni);noseGeometry.computeVertexNormals();mesh(noseGeometry,skin,head);
  for(const side of [-1,1]){
    ellipsoid([.011,.028,.018],skin,[side*.083,-.006,.007],head);
    ellipsoid([.006,.016,.010],skinShade,[side*.091,-.006,.008],head);
    line([[side*.091,.014,.002],[side*.096,.007,-.002],[side*.095,-.013,.002],[side*.090,-.025,.010]],.0025,skin,head);
    ellipsoid([.006,.008,.008],skin,[side*.087,-.028,.013],head);
  }
  line([[-.024,-.049,-.077],[0,-.052,-.087],[.024,-.049,-.077]],.0015,lip,head);
  line([[-.019,-.053,-.079],[0,-.056,-.085],[.019,-.053,-.079]],.0017,skinShade,head);
  const eyes:Three.Group[]=[],irises:Three.Object3D[]=[];
  for(const side of [-1,1]){
    const eye=group(head,[side*.035,.022,-.076]);eyes.push(eye);
    ellipsoid([.019,.008,.006],standard(0xd8dcd6,.5),[0,0,0],eye);
    const iris=group(eye,[0,0,-.0055]);irises.push(iris);ellipsoid([.0062,.0061,.0024],standard(0x394743,.4),[0,0,0],iris);ellipsoid([.0028,.0034,.0015],black,[0,0,-.002],iris);
    ellipsoid([.0011,.0011,.0007],standard(0xe8ead7,.3),[-.0015,.002,-.0034],iris,10);
    line([[-.019,.001,-.001],[0,.009,-.002],[.019,.001,-.001]],.0018,skinShade,eye);
    line([[side*.013,.043,-.078],[side*.034,.048,-.078],[side*.055,.041,-.067]],.0028,hair,head);
  }
  // The scalp is not a second ball: the front hairline ends above the brows,
  // while sides and back extend naturally around the ears and nape.
  const hp:number[]=[],hi:number[]=[],hr=40,hv=18;
  for(let y=0;y<=hv;y++)for(let x=0;x<=hr;x++){
    const a=x/hr*Math.PI*2,backness=(Math.sin(a)+1)/2,angle=y/hv*(1.09+backness*.90);
    const wave=1+.012*Math.sin(a*7+angle*4);hp.push(Math.cos(a)*Math.sin(angle)*.087*wave,Math.cos(angle)*.132,Math.sin(a)*Math.sin(angle)*.099);
    if(y&&x){const n=y*(hr+1)+x;hi.push(n-hr-2,n,n-1,n-hr-2,n-hr-1,n);}
  }
  const hairGeometry=new T.BufferGeometry();hairGeometry.setAttribute('position',new T.Float32BufferAttribute(hp,3));hairGeometry.setIndex(hi);hairGeometry.computeVertexNormals();mesh(hairGeometry,hair,head);
  for(let i=0;i<23;i++){
    const a=i/23*Math.PI*2;line([[Math.cos(a)*.028-.005,.125,Math.sin(a)*.029],[Math.cos(a+.18)*.062,.102,Math.sin(a+.18)*.068],[Math.cos(a+.30)*.079,.065,Math.sin(a+.30)*.085]],.0006,hairLine,head);
  }
  for(const side of [-1,1])ellipsoid([.008,.020,.012],hair,[side*.078,.011,.009],head);
  const glasses=standard(0x7d8c80,.29,.76),lens=physical({color:0xb8d1c4,transparent:true,opacity:.10,roughness:.07,metalness:0,depthWrite:false,side:T.DoubleSide});
  for(const side of [-1,1]){
    const frame=group(head,[side*.035,.022,-.090]);frame.rotation.y=side*.10;
    const shape=roundedShape(.060,.037,.009);const contour=shape.getPoints(28).map(p=>[p.x,p.y,0] as Point);contour.push(contour[0]);line(contour,.00115,glasses,frame);
    mesh(new T.ShapeGeometry(shape,16),lens,frame).position.z=-.0004;
    line([[side*.064,.026,-.086],[side*.083,.026,-.035],[side*.089,.021,.015],[side*.086,.009,.031]],.0012,glasses,head);
  }
  line([[-.006,.027,-.093],[0,.031,-.103],[.006,.027,-.093]],.0012,glasses,head);

  type HandRig={side:number;upper:Three.Mesh;lower:Three.Mesh;elbowJoint:Three.Mesh;hand:Three.Group;fingers:Three.Group[][]};
  const arms:HandRig[]=[];
  for(const side of [-1,1]){
    const shoulder:[number,number,number]=[side*.22,.365,-.005],elbow:Point=[side*.29,.26,-.20],wrist:Point=[side*.155,.225,-.43];
    ellipsoid([.066,.075,.067],cloth,shoulder,body);const upper=bone(.050,cloth,body,shoulder,elbow),lower=bone(.037,cloth,body,elbow,wrist),elbowJoint=ellipsoid([.044,.042,.045],cloth,elbow,body);
    const hand=group(body,wrist);ellipsoid([.030,.013,.038],skin,[0,0,-.023],hand);
    at(mesh(new T.CylinderGeometry(.025,.027,.026,18),cloth,hand),[0,0,.009]).rotation.x=Math.PI/2;
    const fingers:Three.Group[][]=[];
    const lengths=[.030,.036,.034,.026];
    for(let i=0;i<4;i++){
      const joints:Three.Group[]=[];let parent:Three.Object3D=hand;
      for(let j=0;j<3;j++){
        const len=lengths[i]*(j===0?.47:j===1?.30:.23),joint=group(parent,j===0?[(i-1.5)*.014,0,-.048]:[0,0,-lengths[i]*(j===1?.47:.30)]);joints.push(joint);
        const phalange=mesh(new T.CapsuleGeometry(.0052,len-.006,3,8),skin,joint);phalange.rotation.x=Math.PI/2;phalange.position.z=-len/2;
        if(j===2){const nail=ellipsoid([.0037,.0008,len*.29],standard(0xc3a993,.55),[0,.005,-len*.61],joint,12);nail.castShadow=false;}
        parent=joint;
      }fingers.push(joints);
    }
    const thumb=group(hand,[-side*.027,-.001,-.012]);thumb.rotation.y=-side*.65;thumb.rotation.z=side*.2;
    const thumbBone=mesh(new T.CapsuleGeometry(.007,.018,3,10),skin,thumb);thumbBone.rotation.x=Math.PI/2;thumbBone.position.z=-.012;
    arms.push({side,upper,lower,elbowJoint,hand,fingers});
  }
  scene.add(new T.HemisphereLight(0xc3d8d6,0x30362e,1.85));
  const key=new T.DirectionalLight(0xc2ddd2,2.0);at(key,[-2,3,2]);scene.add(key);
  const faceFill=new T.DirectionalLight(0xc6e1df,1.45);at(faceFill,[-2,2.4,-.7]);scene.add(faceFill);
  const rim=new T.DirectionalLight(0xe7bd88,1.0);at(rim,[1.5,2,-1.6]);scene.add(rim);

  const target=new T.Vector3(0,1.055,-.035),baseCamera=new T.Vector3(),look=new T.Vector3();
  let width=1,height=1,screenTick=-1,draws=0,slow=0,degraded=false;
  const resize=()=>{
    const nextWidth=Math.max(1,stage.clientWidth),nextHeight=Math.max(1,stage.clientHeight);
    if(nextWidth===width&&nextHeight===height)return false;
    width=nextWidth;height=nextHeight;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false);
    target.set(width<700?-.065:0,1.055,-.035);
    const direction=new T.Vector3(width<700?-.50:-1.02,width<700?.54:.43,1).normalize();
    const right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),direction).normalize(),up=new T.Vector3().crossVectors(direction,right).normalize();
    const tan=Math.tan(camera.fov*Math.PI/360);let distance=0;
    const anchors:Point[]=[];
    for(const side of [-1,0,1])for(const x of [-.308,.308])for(const y of [-.181,.181])for(const z of [-.022,.022]){
      const a=side*-Math.PI/6;anchors.push([side*.60+x*Math.cos(a)+z*Math.sin(a),1.095+y,-.48+Math.abs(side)*.13-x*Math.sin(a)+z*Math.cos(a)]);
    }
    anchors.push([-.13,1.46,.37],[.13,1.46,.37],[-.27,1.10,.46],[.27,1.10,.46],[-.33,.81,-.10],[.44,.81,.09],[0,.80,.72]);
    if(width>=700)anchors.push([-.86,1.42,-.47],[.85,.84,-.02]);
    for(const point of anchors){const p=new T.Vector3(...point).sub(target),depth=p.dot(direction);distance=Math.max(distance,depth+Math.abs(p.dot(right))/(tan*camera.aspect),depth+Math.abs(p.dot(up))/tan);}
    distance*=width<700?1.14:1.08;
    for(let i=0;i<6;i++){
      camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateMatrixWorld();
      if(anchors.every(point=>{const p=new T.Vector3(...point).project(camera);return Math.abs(p.x)<.93&&Math.abs(p.y)<.93;}))break;
      distance*=1.06;
    }
    baseCamera.copy(camera.position);
    return true;
  };
  const smooth=(a:number,b:number,v:number)=>{const x=Math.max(0,Math.min(1,(v-a)/(b-a)));return x*x*(3-2*x);};
  const paintScreens=(phase:number)=>{
    screens.forEach(({ctx:c,texture,kind})=>{
      c.fillStyle='#111e20';c.fillRect(0,0,960,540);c.fillStyle='#213330';c.fillRect(0,0,960,43);
      c.fillStyle='#a9bdb2';c.font='20px sans-serif';c.fillText(kind===0?'AI conversation':kind===1?'scene.ts':'Interaction notes',25,29);
      if(kind===0){
        c.fillStyle='#263d38';c.fillRect(34,88,690,72);c.fillStyle='#d4dfd4';c.font='27px sans-serif';c.fillText('把指针移动做得更轻一些。',56,133);
        const reply='可以。先平滑相机，再收敛视线。';const chars=phase<4?Math.floor(reply.length*smooth(.3,3.8,phase)):reply.length;
        c.fillStyle='#8dc5ae';c.fillText('AI',36,223);c.fillStyle='#cbd8ce';c.fillText(reply.slice(0,chars),36,273);
        c.fillStyle='#77938a';c.font='21px monospace';c.fillText('camera.lerp( target, easing )',36,337);c.fillText('gaze follows with a small delay',36,374);
        c.strokeStyle='#48605a';c.lineWidth=2;c.strokeRect(30,444,898,62);c.fillStyle='#7e958a';c.font='22px sans-serif';c.fillText('继续整理交互细节…',48,485);
      }else if(kind===1){
        const code=['const studio = createRoom();','','function update( dt ) {','  camera.position.lerp( target, .06 );','  character.lookAt( screen );','','  if ( typing ) {','    hands.pressKey( phase );','  }','','  renderer.render( studio, camera );','}'];
        c.font='24px monospace';code.forEach((row,i)=>{c.fillStyle='#617970';c.fillText(String(i+1).padStart(2,' '),18,87+i*35);c.fillStyle=i===3||i===7?'#a9d7b6':i===0||i===2?'#a6c8df':'#c3cec3';c.fillText(row,70,87+i*35);});
        if(phase>4&&phase<12){c.fillStyle='#d7dfbf';c.fillRect(546,313,3,26);}
      }else{
        c.font='28px sans-serif';c.fillStyle='#d6e0d5';c.fillText('把动作放回空间里。',38,105);
        c.font='24px monospace';['pointer  →  camera','attention → screen','fingers  →  keyboard','pause    →  stillness'].forEach((row,i)=>{c.fillStyle=i%2?'#c5b99b':'#a8c9b8';c.fillText(row,38,180+i*61);});
        c.strokeStyle='#4d6860';c.lineWidth=2;c.beginPath();c.moveTo(38,448);c.bezierCurveTo(267,401,492,509,888,437);c.stroke();
      }texture.needsUpdate=true;
    });
  };
  const draw=(elapsed:number,nx:number,ny:number,dt:number)=>{
    const started=performance.now(),phase=elapsed%18,reply=1-smooth(3,5,phase)+smooth(16.3,18,phase),typing=smooth(4,6,phase)*(1-smooth(11,13,phase)),thinking=smooth(11.5,13,phase)*(1-smooth(15,17,phase));
    body.rotation.x=-.105+Math.sin(elapsed*1.7)*.006;body.rotation.z=Math.sin(elapsed*.6)*.003;torso.scale.y=1+Math.sin(elapsed*1.7)*.006;
    headPivot.rotation.y=reply*1.08+thinking*.96+nx*.045;headPivot.rotation.x=-.035-typing*.045+thinking*.055+ny*.025;
    const blinkPhase=elapsed%4.6,blink=blinkPhase<.16?Math.max(.07,Math.abs(Math.cos(blinkPhase/.16*Math.PI))):1;
    eyes.forEach(eye=>eye.scale.y=blink);irises.forEach(iris=>{iris.position.x=-reply*.002+nx*.0015;iris.position.y=-typing*.001;});
    arms.forEach(({side,upper,lower,elbowJoint,hand,fingers})=>{
      const thought=side===1?thinking:0,elbow:Point=[side*.29,.26+thought*.015,-.20+thought*.04],wrist:Point=[side*(.155-thought*.055),.225+thought*.245+typing*Math.sin(elapsed*9+side)*.0025,-.43+thought*.33];
      aimBone(upper,[side*.22,.365,-.005],elbow);aimBone(lower,elbow,wrist);elbowJoint.position.set(...elbow);hand.position.set(...wrist);hand.rotation.x=thought*1.05;hand.rotation.z=side*(.05+thought*.18);
      fingers.forEach((joints,i)=>joints.forEach((joint,j)=>{joint.rotation.x=(j===0?.11:-.12)-thought*(j?.4:.12)+typing*(j===0?.12:.035)*Math.sin(elapsed*13+i*2.3+side+j*.8);}));
    });
    look.copy(baseCamera);look.x+=nx*.15;look.y-=ny*.075;look.z+=nx*.025;
    camera.position.lerp(look,dt?1-Math.exp(-dt*3.8):1);camera.lookAt(target.x+nx*.018,target.y-ny*.015,target.z);
    const tick=Math.floor(elapsed*8);if(tick!==screenTick){screenTick=tick;paintScreens(phase);}
    renderer.render(scene,camera);
    if(++draws>20&&!degraded){slow+=performance.now()-started>26?1:-.15;slow=Math.max(0,slow);if(slow>25){degraded=true;renderer.setPixelRatio(Math.min(devicePixelRatio||1,1));renderer.setSize(width,height,false);renderer.render(scene,camera);}}
  };
  resize();
  return {resize,repaint:()=>renderer.render(scene,camera),draw,dispose:release};
  } catch (error) { release(); throw error; }
}
