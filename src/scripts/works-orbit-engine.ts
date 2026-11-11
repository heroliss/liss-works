import type * as Three from 'three';

type T = typeof import('three');
export type OrbitItem = { slug: string; name: string; category: string; group: string; accent: string; href: string; image: string };
export type OrbitInput = { x: number; y: number; active: number; spin: number; hover: string | null };
export interface OrbitEngine {
  resize: () => boolean;
  draw: (time: number, input: OrbitInput, dt: number) => void;
  pick: (x: number, y: number) => OrbitItem | null;
  dispose: () => void;
}

type Slab = { item: OrbitItem; mesh: Three.Mesh; glow: Three.Mesh; face: Three.MeshBasicMaterial; edge: Three.MeshStandardMaterial;
  ring: number; angle: number; lift: number; focus: number };

/**
 * Every project as a thin glass slab carrying its real screenshot, rimmed in its
 * identity colour, circling a faceted core on two counter-rotating tilted rings.
 * One renderer, one clock; textures stream in after the first frame.
 */
export function createOrbitEngine(T: T, canvas: HTMLCanvasElement, context: WebGL2RenderingContext, items: OrbitItem[]): OrbitEngine {
  let renderer: Three.WebGLRenderer;
  try { renderer = new T.WebGLRenderer({ canvas, context, antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch (error) { context.getExtension('WEBGL_lose_context')?.loseContext(); throw error; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 1, .1, 80);
  const disposables: { dispose: () => void }[] = [];
  const keep = <V extends { dispose: () => void }>(value: V) => { disposables.push(value); return value; };
  let released = false;

  scene.add(new T.HemisphereLight(0xbfe6ff, 0x101820, .9));
  const key = new T.DirectionalLight(0xffe4c4, 1.5); key.position.set(-4, 6, 7); scene.add(key);
  const rimLight = new T.DirectionalLight(0x86d8ff, 1.1); rimLight.position.set(5, -2, -6); scene.add(rimLight);
  const coreLight = new T.PointLight(0x9fe9ff, 9, 9, 1.6); scene.add(coreLight);

  // The faceted core: a dark polished crystal, its edges drawn in light and a
  // soft inner glow, standing for the person behind the projects.
  const core = new T.Group(); scene.add(core);
  const crystalGeometry = keep(new T.IcosahedronGeometry(1.05, 0));
  const crystal = new T.Mesh(crystalGeometry, keep(new T.MeshPhysicalMaterial({
    color: 0x0f2a33, metalness: .15, roughness: .18, clearcoat: 1, clearcoatRoughness: .1, flatShading: true,
    emissive: 0x0a3644, emissiveIntensity: .7, transparent: true, opacity: .94,
  })));
  core.add(crystal);
  core.add(new T.LineSegments(keep(new T.EdgesGeometry(crystalGeometry)), keep(new T.LineBasicMaterial({ color: 0xc4f6ff, transparent: true, opacity: .62 }))));
  const inner = new T.Mesh(keep(new T.IcosahedronGeometry(.5, 1)), keep(new T.MeshBasicMaterial({ color: 0x86e6ff, transparent: true, opacity: .4, blending: T.AdditiveBlending, depthWrite: false })));
  core.add(inner);
  const haloCanvas = document.createElement('canvas'); haloCanvas.width = haloCanvas.height = 128;
  const haloContext = haloCanvas.getContext('2d')!;
  const gradient = haloContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(150,230,255,.55)'); gradient.addColorStop(.35, 'rgba(110,200,240,.16)'); gradient.addColorStop(1, 'rgba(80,160,220,0)');
  haloContext.fillStyle = gradient; haloContext.fillRect(0, 0, 128, 128);
  const haloTexture = keep(new T.CanvasTexture(haloCanvas)); haloTexture.colorSpace = T.SRGBColorSpace;
  const halo = new T.Sprite(keep(new T.SpriteMaterial({ map: haloTexture, blending: T.AdditiveBlending, depthWrite: false, transparent: true })));
  halo.scale.set(5.4, 5.4, 1); scene.add(halo);

  // A faint shell of dust gives the space depth when the camera turns.
  const dust = new Float32Array(260 * 3);
  for (let index = 0; index < 260; index++) {
    const u = Math.random() * 2 - 1, phi = Math.random() * Math.PI * 2, radius = 6.5 + Math.random() * 7;
    const s = Math.sqrt(1 - u * u);
    dust.set([Math.cos(phi) * s * radius, u * radius * .6, Math.sin(phi) * s * radius], index * 3);
  }
  const dustGeometry = keep(new T.BufferGeometry()); dustGeometry.setAttribute('position', new T.BufferAttribute(dust, 3));
  const points = new T.Points(dustGeometry, keep(new T.PointsMaterial({ color: 0x9cc6d2, size: .04, transparent: true, opacity: .55, depthWrite: false })));
  scene.add(points);

  // Two tilted rings, split by kind: games and tools inside, AI, data and
  // experiments outside, so the counter-rotation also reads as two families.
  const rings = [new T.Group(), new T.Group()];
  rings[0].rotation.set(.2, 0, .08); rings[1].rotation.set(.1, 0, -.1);
  rings.forEach(ring => scene.add(ring));
  const families = [items.filter(item => item.group === 'games' || item.group === 'tools'), items.filter(item => item.group !== 'games' && item.group !== 'tools')];
  const loader = new T.TextureLoader();
  const slabs: Slab[] = [];
  families.forEach((family, ringIndex) => {
    const width = ringIndex ? 1.62 : 1.36, height = width / 1.6;
    const geometry = keep(new T.BoxGeometry(width, height, .04));
    const glowGeometry = keep(new T.PlaneGeometry(width + .2, height + .2));
    family.forEach((item, index) => {
      const accent = new T.Color(item.accent);
      const edge = keep(new T.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: .55, roughness: .3, metalness: .2 }));
      const face = keep(new T.MeshBasicMaterial({ color: 0x1a2a30, toneMapped: false }));
      const back = keep(new T.MeshStandardMaterial({ color: 0x0a1116, emissive: accent, emissiveIntensity: .05, roughness: .55, metalness: .3 }));
      const mesh = new T.Mesh(geometry, [edge, edge, edge, edge, face, back]);
      const glow = new T.Mesh(glowGeometry, keep(new T.MeshBasicMaterial({ color: accent, transparent: true, opacity: .16, blending: T.AdditiveBlending, depthWrite: false })));
      glow.position.z = -.04; mesh.add(glow);
      const angle = index / family.length * Math.PI * 2 + (ringIndex ? .2 : 0);
      mesh.userData.slug = item.slug;
      rings[ringIndex].add(mesh);
      slabs.push({ item, mesh, glow, face, edge, ring: ringIndex, angle, lift: (index % 3 - 1) * .1, focus: 0 });
      loader.load(item.image, texture => {
        if (released) { texture.dispose(); return; }
        texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        const image = texture.image as { width: number; height: number };
        const imageAspect = image.width / Math.max(1, image.height), slabAspect = width / height;
        // Cover-fit the screenshot onto the slab face without distorting it.
        if (imageAspect > slabAspect) { texture.repeat.set(slabAspect / imageAspect, 1); texture.offset.set((1 - texture.repeat.x) / 2, 0); }
        else { texture.repeat.set(1, imageAspect / slabAspect); texture.offset.set(0, (1 - texture.repeat.y) / 2); }
        keep(texture); face.map = texture; face.color.set(0xffffff); face.needsUpdate = true;
      });
    });
  });

  const raycaster = new T.Raycaster(), ndc = new T.Vector2();
  let width = 1, height = 1, distance = 12, az = 0, el = 0;
  const target = new T.Vector3(0, -.05, 0);

  const resize = () => {
    const nextWidth = Math.max(1, canvas.clientWidth), nextHeight = Math.max(1, canvas.clientHeight);
    if (nextWidth === width && nextHeight === height) return false;
    width = nextWidth; height = nextHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep the outer ring inside narrow frames by stepping the camera back.
    distance = 13 * Math.max(1, 1.45 / camera.aspect);
    camera.updateProjectionMatrix();
    return true;
  };

  const draw = (time: number, input: OrbitInput, dt: number) => {
    if (released) return;
    const ease = 1 - Math.exp(-(dt || 1) * 3.2);
    az += (input.x * .42 * input.active - az) * ease;
    el += (-input.y * .2 * input.active - el) * ease;
    camera.position.set(Math.sin(az) * distance, 2.3 + Math.sin(el) * distance * .55, Math.cos(az) * distance);
    camera.lookAt(target);
    rings[0].rotation.y = time * .07 + input.spin;
    rings[1].rotation.y = -time * .05 - input.spin * .72 + .4;
    core.rotation.set(Math.sin(time * .35) * .18, time * .3, 0);
    inner.scale.setScalar(1 + Math.sin(time * 1.6) * .06);
    points.rotation.y = time * .012;
    const focusing = input.hover !== null;
    slabs.forEach((slab, index) => {
      const radius = slab.ring ? 4.7 : 3.15;
      slab.mesh.position.set(Math.sin(slab.angle) * radius, slab.lift + Math.sin(time * .8 + index * 1.7) * .07, Math.cos(slab.angle) * radius);
      // Each slab turns most of the way outward but leans toward the viewer on the
      // front arc. w - k·sin(w) is continuous all the way round, so nothing flips.
      const spin = rings[slab.ring].rotation.y, world = slab.angle + spin;
      slab.mesh.rotation.set(0, world - .3 * Math.sin(world) - spin, 0);
      const goal = slab.item.slug === input.hover ? 1 : 0;
      slab.focus += (goal - slab.focus) * (1 - Math.exp(-(dt || 1) * 9));
      slab.mesh.scale.setScalar(1 + slab.focus * .16);
      slab.edge.emissiveIntensity = .55 + slab.focus * 1.1;
      (slab.glow.material as Three.MeshBasicMaterial).opacity = .14 + slab.focus * .32;
      const dim = focusing ? .62 + slab.focus * .38 : 1;
      if (slab.face.map) slab.face.color.setScalar(dim);
    });
    renderer.render(scene, camera);
  };

  const pick = (x: number, y: number) => {
    if (released) return null;
    ndc.set(x, -y); raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(slabs.map(slab => slab.mesh), false)[0];
    const slug = hit?.object.userData.slug as string | undefined;
    return slug ? slabs.find(slab => slab.item.slug === slug)!.item : null;
  };

  const dispose = () => {
    if (released) return;
    released = true;
    disposables.forEach(item => item.dispose());
    renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); scene.clear();
    canvas.width = canvas.height = 1;
  };
  resize();
  return { resize, draw, pick, dispose };
}
