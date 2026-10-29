type Options = { signal: AbortSignal; preference: MediaQueryList };
type Kind = 'outpost' | 'nomad' | 'gomoku';
type Scene = {
  root: HTMLElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; kind: Kind;
  width: number; height: number; left: number; top: number; dpr: number; visible: boolean;
  x: number; y: number; targetX: number; targetY: number; time: number; lastQA: number;
  originalTransform: string; transform: string; transformPriority: string;
};
const COLORS: Record<Kind, string> = { outpost: '#ff9c82', nomad: '#bce7ad', gomoku: '#c6b6ff' };
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Project-specific peripheral motion; real screenshots remain the content. */
export function setupProjectAtmosphere({ signal, preference }: Options): () => void {
  if (signal.aborted) return () => {};
  const scenes: Scene[] = [];
  for (const root of Array.from(document.querySelectorAll<HTMLElement>('[data-project-atmosphere]'))) {
    const kind = root.dataset.projectAtmosphere as Kind;
    const canvas = root.querySelector<HTMLCanvasElement>('canvas');
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx || !(kind in COLORS)) continue;
    scenes.push({ root, canvas, ctx, kind, width: 0, height: 0, left: 0, top: 0, dpr: 1,
      visible: false, x: .5, y: .5, targetX: .5, targetY: .5, time: 0, lastQA: -Infinity,
      originalTransform: root.style.transform, transform: root.style.transform,
      transformPriority: root.style.getPropertyPriority('transform') });
  }
  if (!scenes.length) return () => {};
  const scope = new AbortController();
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const options = { signal: scope.signal, passive: true };
  let disposed = false;
  let paused = document.documentElement.dataset.motionPaused === 'true';
  let frameId = 0;
  let lastTime = 0;

  const metadata = (scene: Scene, now: number, force = false) => {
    const state = disposed ? 'disposed' : preference.matches ? 'reduced'
      : paused || !scene.visible || document.hidden ? 'paused' : 'running';
    if (scene.root.dataset.atmosphereState !== state) scene.root.dataset.atmosphereState = state;
    if (force || now - scene.lastQA >= 1000) {
      scene.root.dataset.atmosphereTime = scene.time.toFixed(2);
      scene.root.dataset.atmospherePointer = `${scene.targetX.toFixed(3)},${scene.targetY.toFixed(3)}`;
      scene.lastQA = now;
    }
  };
  const clear = (scene: Scene) => {
    scene.ctx.setTransform(1, 0, 0, 1, 0, 0);
    scene.ctx.clearRect(0, 0, scene.canvas.width, scene.canvas.height);
  };
  const positionPlane = (scene: Scene, restore = false) => {
    const x = (scene.x - .5) * 2;
    const y = (scene.y - .5) * 2;
    const original = scene.originalTransform;
    const base = original === 'none' ? '' : original;
    const value = restore || !fine.matches || Math.abs(x) + Math.abs(y) < .001 ? original
      : `${base} perspective(1000px) translate3d(${(x * 6).toFixed(2)}px,${(y * 6).toFixed(2)}px,0) rotateX(${(-y * 2).toFixed(2)}deg) rotateY(${(x * 3).toFixed(2)}deg)`.trim();
    if (scene.transform === value) return;
    if (value) scene.root.style.setProperty('transform', value, scene.transformPriority);
    else scene.root.style.removeProperty('transform');
    scene.transform = value;
  };
  const measure = (scene: Scene) => {
    const rect = scene.canvas.getBoundingClientRect();
    scene.width = rect.width;
    scene.height = rect.height;
    scene.left = rect.left + window.scrollX;
    scene.top = rect.top + window.scrollY;
    scene.dpr = Math.min(1.25, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * scene.dpr));
    const height = Math.max(1, Math.round(rect.height * scene.dpr));
    if (scene.canvas.width !== width) scene.canvas.width = width;
    if (scene.canvas.height !== height) scene.canvas.height = height;
  };
  const stroke = (ctx: CanvasRenderingContext2D, points: number[][], alpha = .65) => {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
  };
  const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  };

  const outpost = (scene: Scene) => {
    const { ctx, width: w, height: h, time: t, x, y } = scene;
    const unit = Math.min(w, h);
    const cx = w * .105 + (x - .5) * 12;
    const cy = h * .84 + (y - .5) * 12;
    const aim = Math.atan2(y * h - cy, x * w - cx);
    const sweep = t * .32 + aim * .48;
    for (let ring = 1; ring <= 3; ring++) {
      ctx.globalAlpha = .22 + ring * .06;
      ctx.beginPath();
      ctx.arc(cx, cy, unit * (.12 + ring * .095), -Math.PI, Math.PI * .12);
      ctx.stroke();
    }
    ctx.globalAlpha = .85;
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.arc(cx, cy, unit * .37, sweep - .48, sweep + .1);
    ctx.stroke();
    stroke(ctx, [[cx, cy], [cx + Math.cos(aim) * unit * .31, cy + Math.sin(aim) * unit * .31]], .45);
    // Three short moving trajectories remain at the screenshot's perimeter.
    const tracks = [[.02, .19, .30, .035], [.69, .035, .98, .27], [.68, .97, .98, .73]];
    for (let index = 0; index < tracks.length; index++) {
      const [ax, ay, bx, by] = tracks[index];
      const progress = (t * .19 + index * .31) % 1;
      const start = Math.max(0, progress - .12);
      const offsetX = (x - .5) * w * .025;
      const offsetY = (y - .5) * h * .05;
      stroke(ctx, [
        [(ax + (bx - ax) * start) * w + offsetX, (ay + (by - ay) * start) * h + offsetY],
        [(ax + (bx - ax) * progress) * w + offsetX, (ay + (by - ay) * progress) * h + offsetY],
      ], .8);
    }
  };
  const nomad = (scene: Scene) => {
    const { ctx, width: w, height: h, time: t, x, y } = scene;
    const wind = (x - .5) * 21;
    for (let bank = 0; bank < 2; bank++) {
      for (let line = 0; line < 3; line++) {
        const points: number[][] = [];
        for (let sample = 0; sample <= 26; sample++) {
          const horizontal = sample / 26;
          const wave = Math.sin(horizontal * 6 + t * .34 + line * .43) * (5 + line * 2);
          const base = bank ? h * .92 - line * 10 : h * .075 + line * 10;
          points.push([horizontal * w + wind, base + wave + (y - .5) * 13]);
        }
        stroke(ctx, points, .27 + line * .13);
      }
    }
    const cx = w * .87 + wind * .5;
    const cy = h * .85 + Math.sin(t * .6) * 5 + (y - .5) * 10;
    circle(ctx, cx, cy, 7, .75);
    circle(ctx, cx, cy, 15 + Math.sin(t * .65) * 3, .3);
    stroke(ctx, [[cx - 21, cy + 13], [cx - 8, cy + 5], [cx + 19, cy - 10]], .5);
  };
  const gomoku = (scene: Scene) => {
    const { ctx, width: w, height: h, time: t, x, y } = scene;
    // Search branches sit outside the real board; no stones or invented game state.
    for (let cluster = 0; cluster < 2; cluster++) {
      const sign = cluster ? -1 : 1;
      const cx = cluster ? w * .89 : w * .11;
      const cy = cluster ? h * .91 : h * .09;
      circle(ctx, cx, cy, 3.5, .65);
      for (let branch = 0; branch < 3; branch++) {
        const reach = (branch + 1) * Math.min(w * .048, 32);
        const endX = cx + sign * reach + (x - .5) * 15;
        const endY = cy + sign * (branch - 1) * 13 + (y - .5) * 10;
        const emphasis = .35 + Math.max(0, Math.sin(t * .82 - branch * 1.6)) * .45;
        stroke(ctx, [[cx, cy], [endX - sign * 9, cy], [endX - sign * 9, endY], [endX, endY]], emphasis);
        circle(ctx, endX, endY, 3 + Math.max(0, Math.sin(t * .82 - branch * 1.6)) * 2, emphasis);
      }
    }
  };
  const draw = (scene: Scene) => {
    const { ctx, width: w, height: h } = scene;
    clear(scene);
    ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
    ctx.save();
    // A transparent central window protects the game's actual action and UI.
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(w * .18, h * .19, w * .64, h * .62);
    ctx.clip('evenodd');
    ctx.strokeStyle = COLORS[scene.kind];
    ctx.lineWidth = 1.05;
    ctx.lineCap = 'round';
    if (scene.kind === 'outpost') outpost(scene);
    else if (scene.kind === 'nomad') nomad(scene);
    else gomoku(scene);
    ctx.restore();
  };
  const stop = () => {
    cancelAnimationFrame(frameId);
    frameId = 0;
    lastTime = 0;
  };
  const canRun = () => !disposed && !paused && !preference.matches && !document.hidden && scenes.some(
    scene => scene.visible && scene.width > 0 && scene.height > 0,
  );
  const wake = () => { if (canRun() && !frameId) frameId = requestAnimationFrame(frame); };
  const frame = (now: number) => {
    frameId = 0;
    if (!canRun()) { lastTime = 0; return; }
    const delta = lastTime ? Math.min(40, now - lastTime) / 1000 : 0;
    lastTime = now;
    const easing = 1 - Math.pow(.001, delta || 1 / 60);
    for (const scene of scenes) {
      if (!scene.visible || !scene.width || !scene.height) continue;
      scene.time += delta;
      scene.x += (scene.targetX - scene.x) * easing;
      scene.y += (scene.targetY - scene.y) * easing;
      positionPlane(scene);
      draw(scene);
      metadata(scene, now);
    }
    wake();
  };
  const refreshMeasurements = () => {
    scenes.forEach(measure);
    if (paused && !preference.matches) scenes.forEach(draw);
    wake();
  };

  for (const scene of scenes) {
    measure(scene);
    if (paused && !preference.matches) draw(scene);
    metadata(scene, performance.now(), true);
    scene.root.addEventListener('pointerenter', () => measure(scene), options);
    scene.root.addEventListener('pointermove', (event) => {
      if (!fine.matches || preference.matches || paused || event.pointerType !== 'mouse') return;
      scene.targetX = clamp((event.pageX - scene.left) / (scene.width || 1));
      scene.targetY = clamp((event.pageY - scene.top) / (scene.height || 1));
      wake();
    }, options);
    scene.root.addEventListener('pointerleave', () => { scene.targetX = scene.targetY = .5; }, options);
  }
  const resizeObserver = new ResizeObserver(refreshMeasurements);
  const intersectionObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const scene = scenes.find(item => item.root === entry.target);
      if (scene) { scene.visible = entry.isIntersecting; metadata(scene, performance.now()); }
    }
    if (canRun()) wake(); else stop();
  }, { threshold: .02 });
  for (const scene of scenes) {
    resizeObserver.observe(scene.root);
    resizeObserver.observe(scene.canvas);
    intersectionObserver.observe(scene.root);
  }
  const reset = () => {
    stop();
    for (const scene of scenes) {
      scene.x = scene.y = scene.targetX = scene.targetY = .5;
      positionPlane(scene, true);
      if (preference.matches) clear(scene);
      else if (paused) draw(scene);
      metadata(scene, performance.now(), true);
    }
    wake();
  };
  preference.addEventListener('change', reset, options);
  fine.addEventListener('change', reset, options);
  window.addEventListener('portfolio:motion-state', (event: Event) => {
    const value = (event as CustomEvent<{ paused?: unknown }>).detail?.paused;
    if (typeof value !== 'boolean') return;
    paused = value;
    if (paused) stop(); else wake();
    scenes.forEach(scene => metadata(scene, performance.now()));
  }, options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else wake();
    scenes.forEach(scene => metadata(scene, performance.now()));
  }, options);
  window.addEventListener('resize', refreshMeasurements, options);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stop();
    scope.abort();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    signal.removeEventListener('abort', dispose);
    for (const scene of scenes) { clear(scene); positionPlane(scene, true); metadata(scene, performance.now(), true); }
  };
  signal.addEventListener('abort', dispose, { once: true });
  return dispose;
}
