import { ANCHORS, EDGES, DESTINATIONS } from './signal-field-data';

type SignalFieldOptions = { signal: AbortSignal; preference: MediaQueryList };
type Point = { x: number; y: number };
type FieldNode = Point & { dx: number; dy: number; vx: number; vy: number; radius: number };
type Pulse = {
  id: number;
  target: number;
  route: number[];
  lengths: number[];
  total: number;
  distance: number;
};

/** A bounded, event-driven signal network for the portfolio's workbench. */
export function setupSignalField({ signal, preference }: SignalFieldOptions): () => void {
  const root = document.querySelector<HTMLElement>('[data-signal-field]');
  const canvas = root?.querySelector<HTMLCanvasElement>('canvas');
  if (!root || !canvas || signal.aborted) return () => {};
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return () => {};

  const button = root.querySelector<HTMLButtonElement>('[data-signal-send]');
  const status = root.querySelector<HTMLElement>('[data-signal-status]');
  // A standalone signal band owns its pointer region; the hero remains an
  // optional host for compositions that place the field behind its screens.
  const pointerSurface = root.closest<HTMLElement>('.kinetic-hero') ?? root;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const scope = new AbortController();
  const listenerOptions = { signal: scope.signal };
  // A deterministic seed only varies dot weights; network geometry is authored above.
  let seed = 29831;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const nodes: FieldNode[] = ANCHORS.map(([x, y]) => ({
    x, y, dx: 0, dy: 0, vx: 0, vy: 0, radius: 1 + random() * .8,
  }));
  const adjacency: number[][] = nodes.map(() => []);
  for (const [from, to] of EDGES) {
    adjacency[from].push(to);
    adjacency[to].push(from);
  }
  const pointer = { x: 0, y: 0, active: false };
  let width = 0;
  let height = 0;
  let pageLeft = 0;
  let pageTop = 0;
  let dpr = 1;
  let activeTarget = Math.max(0, Math.min(2, Number(
    document.querySelector<HTMLElement>('[data-work-stage]')?.dataset.active,
  ) || 0));
  let pulses: Pulse[] = [];
  let pulseId = 0;
  let announcedPulseId = 0;
  let pingUntil = 0;
  let frameId = 0;
  let previousTime = 0;
  let inView = true;
  let disposed = false;

  const isRunning = () => !disposed && inView && !document.hidden && width > 0 && height > 0;
  const position = (index: number): Point => ({
    x: nodes[index].x * width + nodes[index].dx,
    y: nodes[index].y * height + nodes[index].dy,
  });
  const updateState = () => {
    root.dataset.signalState = !isRunning() ? 'paused' : preference.matches ? 'static'
      : pulses.length ? 'travelling' : pointer.active ? 'responsive' : 'idle';
    root.dataset.signalPulses = String(pulses.length);
    root.dataset.signalTarget = DESTINATIONS[activeTarget].name;
  };

  // Dijkstra uses the actual displayed edge lengths. Every bright route follows
  // these same connected edges; changing the destination changes the route.
  const shortestPath = (source: number, destination: number): number[] => {
    const distance = nodes.map(() => Infinity);
    const previous = nodes.map(() => -1);
    const visited = new Set<number>();
    distance[source] = 0;
    while (visited.size < nodes.length) {
      let nearest = -1;
      for (let index = 0; index < nodes.length; index++) {
        if (!visited.has(index) && (nearest < 0 || distance[index] < distance[nearest])) nearest = index;
      }
      if (nearest < 0 || !Number.isFinite(distance[nearest]) || nearest === destination) break;
      visited.add(nearest);
      for (const next of adjacency[nearest]) {
        const edgeLength = Math.hypot(
          (nodes[next].x - nodes[nearest].x) * width,
          (nodes[next].y - nodes[nearest].y) * height,
        );
        const candidate = distance[nearest] + edgeLength;
        if (candidate < distance[next]) {
          distance[next] = candidate;
          previous[next] = nearest;
        }
      }
    }
    const route = [destination];
    while (route[0] !== source && previous[route[0]] >= 0) route.unshift(previous[route[0]]);
    return route[0] === source ? route : [source];
  };

  const controlPoint = (a: Point, b: Point): Point => {
    const middle = { x: (a.x + b.x) * .5, y: (a.y + b.y) * .5 };
    if (!pointer.active || preference.matches) return middle;
    const offsetX = middle.x - pointer.x;
    const offsetY = middle.y - pointer.y;
    const distance = Math.hypot(offsetX, offsetY);
    const strength = Math.max(0, 1 - distance / 170) * .16;
    return { x: middle.x + offsetX * strength, y: middle.y + offsetY * strength };
  };
  const routePoint = (pulse: Pulse, distance: number): Point => {
    let segment = 0;
    let remaining = Math.max(0, distance);
    while (segment < pulse.lengths.length - 1 && remaining > pulse.lengths[segment]) {
      remaining -= pulse.lengths[segment++];
    }
    const a = position(pulse.route[segment]);
    const b = position(pulse.route[Math.min(segment + 1, pulse.route.length - 1)]);
    const control = controlPoint(a, b);
    const t = Math.min(1, remaining / (pulse.lengths[segment] || 1));
    const inverse = 1 - t;
    return {
      x: inverse * inverse * a.x + 2 * inverse * t * control.x + t * t * b.x,
      y: inverse * inverse * a.y + 2 * inverse * t * control.y + t * t * b.y,
    };
  };

  const draw = (now: number) => {
    if (!width || !height || disposed) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineWidth = .8;
    context.strokeStyle = '#9aaab1';
    context.globalAlpha = .3;
    context.beginPath();
    for (const [from, to] of EDGES) {
      const a = position(from);
      const b = position(to);
      const control = controlPoint(a, b);
      context.moveTo(a.x, a.y);
      context.quadraticCurveTo(control.x, control.y, b.x, b.y);
    }
    context.stroke();

    for (let index = 0; index < nodes.length; index++) {
      const point = position(index);
      const destination = DESTINATIONS.findIndex((target) => target.node === index);
      const selected = destination === activeTarget;
      context.fillStyle = destination >= 0 ? DESTINATIONS[destination].color : '#b3c7ce';
      context.globalAlpha = selected ? .95 : destination >= 0 ? .5 : .47;
      context.beginPath();
      context.arc(point.x, point.y, selected ? 3.2 : nodes[index].radius, 0, Math.PI * 2);
      context.fill();
      if (destination >= 0) {
        context.font = '13px Rajdhani, sans-serif';
        context.textAlign = 'right';
        context.globalAlpha = selected ? .95 : .65;
        context.fillText(DESTINATIONS[destination].name, point.x - 13, point.y - 11);
      }
      if (selected) {
        const ping = !preference.matches && now < pingUntil ? 1 - (pingUntil - now) / 650 : 0;
        context.strokeStyle = DESTINATIONS[activeTarget].color;
        context.globalAlpha = ping ? (1 - ping) * .65 : .32;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(point.x, point.y, ping ? 7 + ping * 18 : 8, 0, Math.PI * 2);
        context.stroke();
      }
    }

    for (const pulse of pulses) {
      context.strokeStyle = DESTINATIONS[pulse.target].color;
      context.lineWidth = 1.6;
      const trailLength = Math.min(62, pulse.distance);
      for (let trail = 0; trail < 7; trail++) {
        const a = routePoint(pulse, pulse.distance - trailLength + trailLength * trail / 7);
        const b = routePoint(pulse, pulse.distance - trailLength + trailLength * (trail + 1) / 7);
        context.globalAlpha = (trail + 1) / 8;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
      const head = routePoint(pulse, pulse.distance);
      context.fillStyle = '#f1f8f6';
      context.globalAlpha = .95;
      context.beginPath();
      context.arc(head.x, head.y, 2.6, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  };

  const stop = () => {
    cancelAnimationFrame(frameId);
    frameId = 0;
    previousTime = 0;
  };
  const wake = () => {
    updateState();
    if (!isRunning()) return;
    if (preference.matches) {
      draw(performance.now());
      return;
    }
    if (!frameId) frameId = requestAnimationFrame(frame);
  };
  const frame = (now: number) => {
    frameId = 0;
    if (!isRunning() || preference.matches) {
      previousTime = 0;
      updateState();
      return;
    }
    const delta = previousTime ? Math.min(32, now - previousTime) : 16.667;
    previousTime = now;
    const step = delta / 16.667;
    let moving = false;
    for (const node of nodes) {
      let targetX = 0;
      let targetY = 0;
      if (pointer.active) {
        const offsetX = node.x * width - pointer.x;
        const offsetY = node.y * height - pointer.y;
        const distance = Math.hypot(offsetX, offsetY);
        const force = Math.pow(Math.max(0, 1 - distance / 155), 2) * 28;
        targetX = offsetX / (distance || 1) * force;
        targetY = offsetY / (distance || 1) * force;
      }
      node.vx = (node.vx + (targetX - node.dx) * .075 * step) * Math.pow(.78, step);
      node.vy = (node.vy + (targetY - node.dy) * .075 * step) * Math.pow(.78, step);
      node.dx += node.vx * step;
      node.dy += node.vy * step;
      if (Math.abs(targetX - node.dx) + Math.abs(targetY - node.dy) + Math.abs(node.vx) + Math.abs(node.vy) > .04) {
        moving = true;
      } else {
        node.dx = targetX;
        node.dy = targetY;
        node.vx = node.vy = 0;
      }
    }
    const remaining: Pulse[] = [];
    for (const pulse of pulses) {
      pulse.distance += delta * .34;
      if (pulse.distance < pulse.total) {
        remaining.push(pulse);
      } else {
        if (pulse.target === activeTarget) pingUntil = now + 650;
        if (pulse.id === announcedPulseId && status) {
          status.textContent = `已抵达 ${DESTINATIONS[pulse.target].name} · 经过 ${pulse.route.length - 1} 跳连接`;
        }
      }
    }
    pulses = remaining;
    draw(now);
    updateState();
    if (moving || pulses.length || now < pingUntil) frameId = requestAnimationFrame(frame);
    else previousTime = 0;
  };

  const sendSignal = (source = 0, announce = true) => {
    const target = DESTINATIONS[activeTarget];
    if (preference.matches) {
      if (status && announce) status.textContent = `信号已定位至 ${target.name} · 已减少动态效果`;
      draw(performance.now());
      updateState();
      return;
    }
    const route = shortestPath(source === target.node ? 0 : source, target.node);
    const lengths = route.slice(1).map((node, index) => Math.hypot(
      (nodes[node].x - nodes[route[index]].x) * width,
      (nodes[node].y - nodes[route[index]].y) * height,
    ));
    const id = ++pulseId;
    pulses = [...pulses.slice(-3), {
      id, target: activeTarget, route, lengths,
      total: lengths.reduce((sum, length) => sum + length, 0), distance: 0,
    }];
    if (announce) {
      announcedPulseId = id;
      if (status) status.textContent = `信号正在前往 ${target.name} · 沿最短路径传递`;
    }
    wake();
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const oldWidth = width;
    const oldHeight = height;
    width = rect.width;
    height = rect.height;
    pageLeft = rect.left + window.scrollX;
    pageTop = rect.top + window.scrollY;
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    // A route's stored lengths belong to its launch geometry. End pending
    // transits on a real resize instead of letting the light jump off its edge.
    if (oldWidth !== width || oldHeight !== height) pulses = [];
    wake();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!finePointer.matches || preference.matches || event.pointerType !== 'mouse') return;
    pointer.x = event.pageX - pageLeft;
    pointer.y = event.pageY - pageTop;
    pointer.active = pointer.x >= 0 && pointer.x <= width && pointer.y >= 0 && pointer.y <= height;
    wake();
  };
  const clearPointer = () => {
    pointer.active = false;
    wake();
  };
  const onSelect = (event: Event) => {
    const index = Number((event as CustomEvent<{ index?: unknown }>).detail?.index);
    if (!Number.isInteger(index) || index < 0 || index >= DESTINATIONS.length) return;
    activeTarget = index;
    announcedPulseId = 0;
    pingUntil = preference.matches ? 0 : performance.now() + 650;
    if (status) status.textContent = `目标：${DESTINATIONS[index].name} · 发送一束信号，沿连接探索`;
    wake();
  };
  const onPreference = () => {
    stop();
    pointer.active = false;
    pulses = [];
    pingUntil = 0;
    for (const node of nodes) node.dx = node.dy = node.vx = node.vy = 0;
    if (status) status.textContent = preference.matches
      ? `目标：${DESTINATIONS[activeTarget].name} · 已减少动态效果`
      : `目标：${DESTINATIONS[activeTarget].name} · 发送一束信号，沿连接探索`;
    wake();
  };
  const onVisibility = () => {
    if (document.hidden) stop();
    else wake();
    updateState();
  };

  pointerSurface.addEventListener('pointermove', onPointerMove, { ...listenerOptions, passive: true });
  pointerSurface.addEventListener('pointerleave', clearPointer, listenerOptions);
  window.addEventListener('scroll', clearPointer, { ...listenerOptions, passive: true });
  window.addEventListener('resize', resize, { ...listenerOptions, passive: true });
  window.addEventListener('portfolio:stage-select', onSelect, listenerOptions);
  document.addEventListener('visibilitychange', onVisibility, listenerOptions);
  preference.addEventListener('change', onPreference, listenerOptions);
  finePointer.addEventListener('change', clearPointer, listenerOptions);
  button?.addEventListener('click', () => sendSignal(), listenerOptions);
  canvas.addEventListener('click', (event) => {
    // Read once per deliberate click, so a text overlay reflow or an entrance
    // transform cannot make a click select a stale canvas position. Pointer
    // movement and the draw loop continue to use cached bounds only.
    const rect = canvas.getBoundingClientRect();
    pageLeft = rect.left + window.scrollX;
    pageTop = rect.top + window.scrollY;
    const point = {
      x: (event.clientX - rect.left) * width / (rect.width || 1),
      y: (event.clientY - rect.top) * height / (rect.height || 1),
    };
    let source = 0;
    let nearest = Infinity;
    for (let index = 0; index < nodes.length; index++) {
      const node = position(index);
      const distance = Math.hypot(node.x - point.x, node.y - point.y);
      if (distance < nearest) { source = index; nearest = distance; }
    }
    sendSignal(source);
  }, listenerOptions);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resizeObserver.observe(root);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!inView) { stop(); pointer.active = false; }
    else wake();
    updateState();
  }, { rootMargin: '0px', threshold: .01 });
  intersectionObserver.observe(root);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stop();
    scope.abort();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    signal.removeEventListener('abort', dispose);
    pulses = [];
    root.dataset.signalState = 'disposed';
    root.dataset.signalPulses = '0';
  };
  signal.addEventListener('abort', dispose, { once: true });
  root.dataset.signalNodes = String(nodes.length);
  root.dataset.signalEdges = String(EDGES.length);
  root.dataset.signalReady = 'true';
  resize();
  if (status) status.textContent = `目标：${DESTINATIONS[activeTarget].name} · 发送一束信号，沿连接探索`;
  return dispose;
}
