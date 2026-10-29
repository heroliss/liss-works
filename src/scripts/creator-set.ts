import type * as Three from 'three';
import type { CreatorPose } from './creator-performance-types';

type ThreeModule = typeof import('three');
type Point = [number, number, number];
type SetMaterial = Three.MeshStandardMaterial | Three.MeshPhysicalMaterial | Three.MeshBasicMaterial;
type Screen = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: Three.CanvasTexture; key: string };

/** An open, handmade miniature. The caller owns the renderer, camera, clock and
 * actor; this module owns only the set's registered GPU resources and lights. */
export function createCreatorSet(T: ThreeModule, scene: Three.Scene, renderer: Three.WebGLRenderer): {
  world: Three.Group; chair: Three.Group; update(pose: CreatorPose, time: number): void; dispose(): void;
} {
  const world = new T.Group(); world.name = 'creator-studio-set';
  const chair = new T.Group(); chair.name = 'low-studio-chair'; chair.position.z = .50;
  const geometries = new Set<Three.BufferGeometry>(), materials = new Set<Three.Material>();
  const textures = new Set<Three.Texture>(), shadows = new Set<Three.LightShadow>();
  const screens: Screen[] = [];
  const previousShadow = { enabled: renderer.shadowMap.enabled, type: renderer.shadowMap.type };
  let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true;
    world.removeFromParent();
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
    textures.forEach(item => item.dispose()); shadows.forEach(item => item.dispose());
    geometries.clear(); materials.clear(); textures.clear(); shadows.clear(); screens.length = 0;
    // The actor may be parented here, but its resources belong to its own owner.
    world.clear();
    if (renderer.shadowMap.type === T.PCFShadowMap) {
      renderer.shadowMap.enabled = previousShadow.enabled; renderer.shadowMap.type = previousShadow.type;
    }
  };
  const material = (color: number, roughness = .7, metalness = 0) => {
    const value = new T.MeshStandardMaterial({ color, roughness, metalness }); materials.add(value); return value;
  };
  const physical = (options: Three.MeshPhysicalMaterialParameters) => {
    const value = new T.MeshPhysicalMaterial(options); materials.add(value); return value;
  };
  const mesh = (geometry: Three.BufferGeometry, value: SetMaterial, parent: Three.Object3D = world) => {
    geometries.add(geometry); materials.add(value);
    const item = new T.Mesh(geometry, value); item.castShadow = item.receiveShadow = true; parent.add(item); return item;
  };
  const at = <O extends Three.Object3D>(item: O, position: Point): O => { item.position.set(...position); return item; };
  const group = (position: Point, parent: Three.Object3D = world) => { const item = new T.Group(); parent.add(item); return at(item, position); };
  const roundShape = (w: number, h: number, radius: number) => {
    const s = new T.Shape(), x = -w / 2, y = -h / 2, r = Math.min(radius, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  };
  const extrude = (shape: Three.Shape, depth: number, bevel = .008) => {
    const value = new T.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10, steps: 1 });
    value.translate(0, 0, -depth / 2 + bevel); geometries.add(value); return value;
  };
  const rounded = (w: number, h: number, d: number, r: number, value: SetMaterial, p: Point, parent: Three.Object3D = world) => {
    const b = Math.min(.008, d / 4);
    return at(mesh(extrude(roundShape(w - b * 2, h - b * 2, Math.max(.001, r - b)), d, b), value, parent), p);
  };
  const slab = (w: number, d: number, h: number, r: number, value: SetMaterial, p: Point, parent: Three.Object3D = world) => {
    const item = rounded(w, d, h, r, value, p, parent); item.rotation.x = -Math.PI / 2; return item;
  };
  const ellipsoid = (scale: Point, value: SetMaterial, p: Point, parent: Three.Object3D = world) => {
    const item = at(mesh(new T.SphereGeometry(1, 24, 16), value, parent), p); item.scale.set(...scale); return item;
  };
  const tube = (points: Point[], radius: number, value: SetMaterial, parent: Three.Object3D = world, segments = 28) =>
    mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), segments, radius, 6, false), value, parent);
  const strut = (from: Point, to: Point, radius: number, value: SetMaterial, parent: Three.Object3D = world) => {
    const a = new T.Vector3(...from), b = new T.Vector3(...to), vector = b.clone().sub(a);
    const item = mesh(new T.CylinderGeometry(radius, radius * .9, vector.length(), 16), value, parent);
    item.position.copy(a.add(b).multiplyScalar(.5)); item.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vector.normalize()); return item;
  };
  const canvas = (width: number, height: number): Screen => {
    const image = document.createElement('canvas'); image.width = width; image.height = height;
    const ctx = image.getContext('2d'); if (!ctx) throw new Error('Creator set requires a 2D canvas.');
    const texture = new T.CanvasTexture(image); textures.add(texture); texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return { canvas: image, ctx, texture, key: '' };
  };
  const smooth = (a: number, b: number, value: number) => { const v = Math.max(0, Math.min(1, (value - a) / (b - a))); return v * v * (3 - 2 * v); };
  try {
    scene.add(world); world.add(chair);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
    const navy = material(0x1c2940, .9), navyEdge = material(0x34415d, .7), ink = material(0x1a2232, .56);
    const bronze = material(0x827983, .38, .65), walnut = material(0xb48b68, .65), leather = material(0x34475a, .89);
    const ceramic = physical({ color: 0xbc765b, roughness: .42, clearcoat: .12, clearcoatRoughness: .45 });
    const paper = material(0xd9ceb3, .92), lampEnamel = material(0xc79153, .38, .3);
    const wood = canvas(512, 256); wood.ctx.fillStyle = '#bd9878'; wood.ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 62; i++) {
      const y = i * 4.3; wood.ctx.strokeStyle = `rgba(75,39,24,${.035 + i % 4 * .012})`; wood.ctx.lineWidth = 1 + i % 3;
      wood.ctx.beginPath(); wood.ctx.moveTo(0, y); wood.ctx.bezierCurveTo(140, y - 5, 370, y + 7, 512, y - 2); wood.ctx.stroke();
    }
    wood.texture.needsUpdate = true; walnut.map = wood.texture;
    const weave = canvas(128, 128); weave.ctx.fillStyle = '#e0e0e0'; weave.ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 64; i++) { weave.ctx.fillStyle = i % 2 ? '#c8c8c8' : '#d2d2d2'; weave.ctx.fillRect(i * 2, 0, 1, 128); weave.ctx.fillRect(0, i * 2, 128, 1); }
    weave.texture.colorSpace = T.NoColorSpace; weave.texture.wrapS = weave.texture.wrapT = T.RepeatWrapping; weave.texture.repeat.set(3, 3); weave.texture.needsUpdate = true;
    leather.bumpMap = weave.texture; leather.bumpScale = .0008;

    // The irregular rounded plinth and low, rising arc leave the left camera open.
    const plinthShape = new T.Shape(); plinthShape.moveTo(-1.46, .52);
    plinthShape.bezierCurveTo(-1.58, .96, -.98, 1.12, -.32, 1.12); plinthShape.bezierCurveTo(.45, 1.14, 1.52, 1.02, 1.53, .42);
    plinthShape.bezierCurveTo(1.57, -.40, 1.40, -1.10, .73, -1.12); plinthShape.bezierCurveTo(-.15, -1.18, -1.48, -.96, -1.46, .52);
    const plinth = at(mesh(extrude(plinthShape, .11, .018), navy), [0, -.055, 0]); plinth.rotation.x = -Math.PI / 2;
    const positions: number[] = [], indices: number[] = [], rimPoints: Point[] = [];
    for (let i = 0; i <= 56; i++) {
      const t = i / 56, angle = -1.14 + t * 2.32, x = Math.sin(angle) * 1.47, z = -Math.cos(angle) * .91 - .045;
      const h = .36 + 1.25 * smooth(.12, .70, t) - .16 * smooth(.86, 1, t), dx = Math.sin(angle) * .055, dz = -Math.cos(angle) * .055;
      positions.push(x, 0, z, x, h, z, x + dx, 0, z + dz, x + dx, h, z + dz); rimPoints.push([x, h + .003, z]);
      if (i < 56) { const a = i * 4; indices.push(a,a+4,a+1,a+1,a+4,a+5, a+2,a+3,a+6,a+3,a+7,a+6, a+1,a+5,a+3,a+3,a+5,a+7, a,a+2,a+4,a+2,a+6,a+4); }
    }
    indices.push(0,1,2,1,3,2,224,226,225,225,226,227);
    const wallGeometry = new T.BufferGeometry(); wallGeometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); wallGeometry.setIndex(indices); wallGeometry.computeVertexNormals(); mesh(wallGeometry, navy);
    tube(rimPoints, .008, navyEdge, world, 72);
    const windowAngle = .78, windowFrame = group([Math.sin(windowAngle) * 1.455, 1.235, -Math.cos(windowAngle) * .90 - .025]); windowFrame.rotation.y = -windowAngle;
    rounded(.48, .62, .045, .145, navyEdge, [0,0,0], windowFrame);
    const glass = physical({ color: 0x355c73, roughness: .34, metalness: .08, emissive: 0x2d4a72, emissiveIntensity: .2 });
    rounded(.424, .562, .012, .13, glass, [0,0,.027], windowFrame);
    rounded(.012, .54, .015, .004, bronze, [.026,0,.038], windowFrame);
    rounded(.40, .011, .015, .004, bronze, [0,-.055,.038], windowFrame);
    slab(.54, .13, .025, .025, navyEdge, [0,-.316,.04], windowFrame);

    // The front lip is a shallow sculpted concavity rather than a box edge.
    const deskShape = new T.Shape(); deskShape.moveTo(-1.16, .77); deskShape.quadraticCurveTo(-1.25,.77,-1.25,.67);
    deskShape.lineTo(-1.25,-.08); deskShape.quadraticCurveTo(-1.25,-.20,-1.12,-.20);
    deskShape.bezierCurveTo(-.55,-.20,-.47,-.12,0,-.115); deskShape.bezierCurveTo(.47,-.12,.58,-.20,1.12,-.20);
    deskShape.quadraticCurveTo(1.25,-.20,1.25,-.07); deskShape.lineTo(1.25,.67); deskShape.quadraticCurveTo(1.25,.77,1.15,.77); deskShape.closePath();
    const desk = at(mesh(extrude(deskShape, .048, .011), walnut), [0,.792,0]); desk.rotation.x = -Math.PI / 2;
    for (const side of [-1,1]) {
      strut([side*1.08,.77,-.61],[side*1.04,.04,-.65],.027,bronze); strut([side*1.08,.77,.08],[side*1.04,.04,.12],.027,bronze);
      strut([side*1.04,.23,-.65],[side*1.04,.23,.12],.014,bronze);
      for (const z of [-.65,.12]) ellipsoid([.034,.016,.034],ink,[side*1.04,.019,z]);
    }
    strut([-1.04,.65,-.68],[1.04,.65,-.68],.016,bronze);

    // Full-depth monitor shells remain deliberate from the side/back camera.
    const shell = material(0x526078, .48, .14), bezel = material(0x111c2c, .5), shellInset = material(0x39475f, .55);
    // Turn the entire 150-degree arc toward the open viewing side; each seam
    // retains its physical angle while the conversation face becomes readable.
    const displayArc = group([0,0,-.45]); displayArc.rotation.y = -.40;
    [-1,0,1].forEach(side => {
      const monitor = group([side*.60,1.095,-.03+Math.abs(side)*.13],displayArc); monitor.rotation.y = -side*Math.PI/6;
      rounded(.616,.362,.036,.019,shell,[0,0,0],monitor); rounded(.599,.345,.008,.014,bezel,[0,0,.020],monitor);
      rounded(.47,.24,.009,.035,shellInset,[0,.008,-.021],monitor);
      for(let row=0;row<5;row++) rounded(.23,.003,.004,.001,ink,[0,.059+row*.011,-.027],monitor);
      rounded(.024,.054,.012,.006,bronze,[0,-.056,-.032],monitor);
      strut([0,-.128,-.025],[0,-.272,-.073],.012,bronze,monitor); slab(.205,.135,.014,.04,bronze,[0,-.272,-.055],monitor);
      tube([[0,-.075,-.035],[.035,-.21,-.09],[side*.07,-.30,-.13],[side*.10,-.34,-.20]],.0035,ink,monitor,20);
      const screen = canvas(960,540); screens.push(screen);
      const value = new T.MeshBasicMaterial({map:screen.texture,toneMapped:false}); materials.add(value);
      const panelGeometry = new T.ShapeGeometry(roundShape(.585,.329,.009),8);
      // ShapeGeometry's default UVs are object coordinates; a monitor needs the
      // entire canvas mapped onto its small physical dimensions.
      const position = panelGeometry.getAttribute('position'), uv = panelGeometry.getAttribute('uv');
      for(let i=0;i<position.count;i++) uv.setXY(i,position.getX(i)/.585+.5,position.getY(i)/.329+.5);
      const panel = mesh(panelGeometry,value,monitor); panel.position.z = .025; panel.castShadow = panel.receiveShadow = false;
      const led = material(0xb9d8d0,.4); led.emissive.set(0x6b9c9f); led.emissiveIntensity=.28;
      ellipsoid([.0022,.0022,.001],led,[.272,-.168,.021],monitor);
    });

    const keyboard = group([0,.825,-.01]); slab(.59,.207,.016,.024,ink,[0,0,0],keyboard);
    const rows = ['1234567890-=','QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
    const keyPositions: {x:number;z:number;label:string}[] = [];
    rows.forEach((row,r) => [...row].forEach((label,c) => keyPositions.push({x:-.245+c*.039+r*.009,z:-.075+r*.038,label})));
    const keyGeometry = new T.ExtrudeGeometry(roundShape(.026,.024,.004),{depth:.005,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:1,curveSegments:3,steps:1});
    keyGeometry.translate(0,0,-.0025);geometries.add(keyGeometry);const capMaterial = material(0x9cafb4,.6);
    const caps = new T.InstancedMesh(keyGeometry,capMaterial,keyPositions.length); caps.castShadow=caps.receiveShadow=true; keyboard.add(caps);
    const transform = new T.Matrix4(), keyRotation = new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2), unit = new T.Vector3(1,1,1);
    keyPositions.forEach((key,i) => {transform.compose(new T.Vector3(key.x,.012,key.z),keyRotation,unit);caps.setMatrixAt(i,transform);});
    slab(.19,.025,.010,.005,capMaterial,[0,.012,.077],keyboard);
    const labels=canvas(1180,414);labels.ctx.clearRect(0,0,1180,414);labels.ctx.fillStyle='#26384c';labels.ctx.font='18px monospace';labels.ctx.textAlign='center';
    keyPositions.forEach(key=>labels.ctx.fillText(key.label,(key.x/.59+.5)*1180,(key.z/.207+.5)*414+6));labels.texture.needsUpdate=true;
    const labelMaterial=new T.MeshBasicMaterial({map:labels.texture,transparent:true,depthWrite:false,toneMapped:false});materials.add(labelMaterial);
    const labelPlane=mesh(new T.PlaneGeometry(.59,.207),labelMaterial,keyboard);labelPlane.rotation.x=-Math.PI/2;labelPlane.position.y=.0171;labelPlane.castShadow=labelPlane.receiveShadow=false;
    slab(.20,.245,.004,.024,leather,[.39,.819,.003]); ellipsoid([.036,.022,.058],shell,[.39,.842,.003]);
    tube([[.39,.864,-.038],[.39,.864,-.008],[.39,.855,.045]],.0011,bronze);

    const mug = group([.87,.818,-.05]);
    const mugGeometry = new T.LatheGeometry([new T.Vector2(.034,0),new T.Vector2(.041,.007),new T.Vector2(.046,.094),new T.Vector2(.044,.107),new T.Vector2(.039,.108),new T.Vector2(.036,.014),new T.Vector2(0,.012)],32);
    mesh(mugGeometry,ceramic,mug);const handle=at(mesh(new T.TorusGeometry(.029,.0065,10,28),ceramic,mug),[.043,.058,0]);handle.rotation.y=Math.PI/2;
    const tea=material(0x34212b,.3);const teaTop=mesh(new T.CircleGeometry(.037,28),tea,mug);teaTop.rotation.x=-Math.PI/2;teaTop.position.y=.090;
    slab(.113,.111,.004,.034,navyEdge,[.87,.818,-.05]);
    const notebook=group([-.64,.825,.009]);notebook.rotation.y=-.12;
    slab(.235,.17,.009,.008,leather,[0,0,0],notebook);slab(.218,.157,.006,.003,paper,[0,.007,0],notebook);
    for(let i=0;i<4;i++)tube([[-.085,.012,-.042+i*.023],[-.017,.012,-.039+i*.023],[.06,.012,-.043+i*.023]],.0007,navyEdge,notebook,8);
    strut([-.59,.84,.11],[-.42,.84,.065],.004,lampEnamel);

    // A sculptural lamp throws the one shadowed key toward the face and hands.
    slab(.18,.16,.026,.074,lampEnamel,[-1.035,.832,-.24]);
    tube([[-1.035,.845,-.24],[-1.09,1.13,-.25],[-1.03,1.45,-.25],[-.85,1.47,-.22]],.012,lampEnamel,world,36);
    const shade=group([-.85,1.455,-.22]);shade.rotation.z=.18;shade.rotation.x=-.18;
    mesh(new T.LatheGeometry([new T.Vector2(.115,0),new T.Vector2(.117,.015),new T.Vector2(.063,.102),new T.Vector2(.031,.119),new T.Vector2(.026,.116)],32),lampEnamel,shade);
    const bulbMaterial=material(0xffdcab,.4);bulbMaterial.emissive.set(0xffbd71);bulbMaterial.emissiveIntensity=1.5;
    ellipsoid([.055,.013,.055],bulbMaterial,[0,.012,0],shade);
    const ambient = new T.HemisphereLight(0xb9d9e8,0x32283d,1.45);world.add(ambient);
    const key = new T.SpotLight(0xffd4a4,12,3.7,.91,.9,2);at(key,[-.84,1.445,-.20]);at(key.target,[.03,1.10,.30]);
    key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.0003;key.shadow.normalBias=.002;key.shadow.radius=3;key.shadow.camera.near=.1;key.shadow.camera.far=4;
    shadows.add(key.shadow);world.add(key,key.target);
    const rim = new T.DirectionalLight(0xb9b9f5,1.35);at(rim,[1.4,2.1,.45]);at(rim.target,[0,1,.35]);shadows.add(rim.shadow);world.add(rim,rim.target);
    const sideFill = new T.DirectionalLight(0xa6bce9,.80);at(sideFill,[-1.8,1.3,.95]);at(sideFill.target,[0,.88,.40]);world.add(sideFill,sideFill.target);

    // A low upholstered shell leaves the shoulders, hands and face unobstructed.
    slab(.53,.47,.078,.10,leather,[0,.545,0],chair);
    const back=rounded(.50,.315,.068,.095,leather,[0,.775,.218],chair);back.rotation.x=-.10;
    tube([[-.22,.59,.15],[-.255,.72,.22],[-.215,.89,.25]],.012,bronze,chair,18);
    tube([[.22,.59,.15],[.255,.72,.22],[.215,.89,.25]],.012,bronze,chair,18);
    for(const side of [-1,1]){strut([side*.23,.58,.06],[side*.28,.73,.05],.01,bronze,chair);slab(.057,.23,.034,.023,leather,[side*.28,.755,-.015],chair);}
    strut([0,.12,0],[0,.50,0],.032,bronze,chair);
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5,x=Math.cos(a)*.30,z=Math.sin(a)*.30;strut([0,.13,0],[x,.075,z],.013,bronze,chair);const wheel=ellipsoid([.034,.034,.019],ink,[x,.036,z],chair);wheel.rotation.y=-a;}

    const contact=canvas(256,256),gradient=contact.ctx.createRadialGradient(128,128,18,128,128,124);gradient.addColorStop(0,'rgba(4,7,15,.38)');gradient.addColorStop(1,'rgba(4,7,15,0)');contact.ctx.fillStyle=gradient;contact.ctx.fillRect(0,0,256,256);contact.texture.needsUpdate=true;
    const contactMaterial=new T.MeshBasicMaterial({map:contact.texture,transparent:true,depthWrite:false,toneMapped:false});materials.add(contactMaterial);
    for(const [w,d,x,z] of [[1.1,.85,0,.50],[2.3,.80,0,-.28]]){const shadow=mesh(new T.PlaneGeometry(w,d),contactMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.set(x,.003,z);shadow.castShadow=shadow.receiveShadow=false;}

    const header=(screen:Screen,title:string,accent:string)=>{
      const c=screen.ctx;c.clearRect(0,0,960,540);c.fillStyle='#142033';c.fillRect(0,0,960,540);
      c.fillStyle=accent;c.fillRect(0,0,6,540);c.font='22px sans-serif';c.fillStyle='#b7c6d5';c.fillText(title,35,44);
      c.fillStyle='#29394c';c.fillRect(34,65,892,1);return c;
    };
    const paintReply=(screen:Screen,progress:number,strength=1)=>{
      const c=header(screen,'想法 / 对话草稿','#c3b5e8');c.font='35px sans-serif';c.fillStyle='#e7e3d8';c.fillText('让一个想法先运行起来。',42,132);
      c.globalAlpha=.25+.75*strength;
      c.fillStyle='#26394b';c.beginPath();c.roundRect(42,180,798,198,18);c.fill();c.fillStyle='#b9d0d0';c.font='30px sans-serif';
      const rows=['先搭出可以观察的形体。','再连接输入，给动作一个原因。','最后，让反馈变得清楚。'];
      rows.forEach((text,i)=>{const amount=smooth(i*.27,i*.27+.34,progress),count=Math.floor(text.length*amount);if(count)c.fillText(text.slice(0,count),68,235+i*54);});
      c.globalAlpha=1;c.fillStyle='#7e92a5';c.font='22px sans-serif';c.fillText('工作室动画示意',42,492);screen.texture.needsUpdate=true;
    };
    const paintCode=(screen:Screen,progress:number,time:number,typing:number,strength=1)=>{
      const c=header(screen,'原型 / 动作草稿','#9acdd2');const rows=['const shape = makePrototype();','','function update(input) {','  const intent = observe(input);','  shape.respond(intent);','  return render(shape);','}'];
      c.font='29px monospace';rows.forEach((row,i)=>{
        // There is already a draft on the desk. New input brings its active
        // lines forward instead of leaving two monitors empty for half a cycle.
        c.globalAlpha=.55;c.fillStyle='#71849a';c.fillText(String(i+1),36,126+i*47);c.fillText(row,88,126+i*47);
        c.globalAlpha=.25+.75*strength;const amount=smooth(i*.085,i*.085+.29,progress);
        c.fillStyle=i===4?'#bce2d3':i===2?'#cbb9e5':'#ccd8e3';c.fillText(row.slice(0,Math.floor(row.length*amount)),88,126+i*47);
      });
      if(typing>.1&&Math.floor(time*2)%2===0){c.fillStyle='#bce2d3';c.fillRect(88,460,13,3);}c.globalAlpha=1;c.fillStyle='#718a9e';c.font='22px sans-serif';c.fillText('构造 → 输入 → 反馈',36,508);screen.texture.needsUpdate=true;
    };
    const paintPreview=(screen:Screen,progress:number,time:number,delight:number,strength=1)=>{
      const c=header(screen,'原型 / 从形体到反馈','#e2b78f'),origin={x:479,y:333};
      const project=(x:number,y:number,z:number)=>({x:origin.x+(x-z)*135,y:origin.y+(x+z)*56-y*150});
      c.strokeStyle='#33485e';c.lineWidth=2;for(let i=-2;i<=2;i++){const a=project(i,-.03,-2),b=project(i,-.03,2),d=project(-2,-.03,i),e=project(2,-.03,i);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.moveTo(d.x,d.y);c.lineTo(e.x,e.y);c.stroke();}
      const block=(x:number,z:number,h:number,fill:string,delay:number)=>{
        const grow=smooth(delay,delay+.30,progress),height=.12+h*(.42+.58*grow),points=[project(x,0,z),project(x+.75,0,z),project(x+.75,height,z),project(x,height,z),project(x+.75,height,z+.75),project(x,height,z+.75),project(x,0,z+.75)];
        c.fillStyle=fill;c.globalAlpha=(.25+.75*grow)*(.25+.75*strength);c.beginPath();[0,1,2,4,5,6].forEach((n,i)=>i?c.lineTo(points[n].x,points[n].y):c.moveTo(points[n].x,points[n].y));c.closePath();c.fill();c.globalAlpha=.50+.50*strength;c.lineWidth=3;c.strokeStyle=grow>.8?'#c1dedc':'#6f8ba1';c.setLineDash(grow>.8?[]:[6,7]);
        for(const path of [[0,1,2,3,0],[3,2,4,5,3],[5,6,0],[4,2]]){c.beginPath();path.forEach((n,i)=>i?c.lineTo(points[n].x,points[n].y):c.moveTo(points[n].x,points[n].y));c.stroke();}c.setLineDash([]);return project(x+.375,height,z+.375);
      };
      const a=block(-1.10,-.50,.58,'#547d8b',.02),b=block(.02,.13,.95,'#a488b5',.30);
      const connect=smooth(.66,.9,progress);if(connect>0){c.strokeStyle='#e8bd93';c.lineWidth=4;c.beginPath();c.moveTo(a.x,a.y-12);c.bezierCurveTo(a.x+45,a.y-84,b.x-50,b.y-63,b.x,b.y-12);c.stroke();const t=(time*.34)%1,one=1-t,x=one*one*one*a.x+3*one*one*t*(a.x+45)+3*one*t*t*(b.x-50)+t*t*t*b.x,y=one*one*one*(a.y-12)+3*one*one*t*(a.y-84)+3*one*t*t*(b.y-63)+t*t*t*(b.y-12);c.fillStyle='#f1d5a2';c.beginPath();c.arc(x,y,4+delight*2,0,Math.PI*2);c.fill();}
      c.globalAlpha=1;c.font='27px sans-serif';c.fillStyle='#d7e0e3';c.fillText(progress<.30?'建立形体':progress<.72?'连接动作':'输入产生反馈',36,493);screen.texture.needsUpdate=true;
    };
    let lastCycle=-1;const revealed=[0,0,0];
    const update=(pose:CreatorPose,time:number)=>{
      if(disposed)return;chair.rotation.y=pose.chairYaw;
      const reply=Math.max(0,Math.min(1,pose.screenReply)),code=Math.max(0,Math.min(1,pose.screenCode)),preview=Math.max(0,Math.min(1,pose.screenPreview));
      if(pose.cycle<lastCycle)revealed.fill(0);lastCycle=pose.cycle;
      [reply,code,preview].forEach((value,i)=>{revealed[i]=Math.max(revealed[i],value,pose.beat==='return'?1:0);});
      const previewMoving=pose.beat==='preview'||pose.beat==='delight';
      const keys=[`${pose.beat}:${Math.round(reply*50)}`,`${pose.beat}:${Math.round(code*55)}:${pose.typing>.1?Math.floor(time*2):0}`,`${pose.beat}:${Math.round(preview*45)}:${previewMoving?Math.floor(time*8):0}:${Math.round(pose.delight*12)}`];
      screens.forEach((screen,i)=>{if(screen.key===keys[i])return;screen.key=keys[i];if(i===0)paintReply(screen,revealed[0],reply);else if(i===1)paintCode(screen,revealed[1],time,pose.typing,code);else paintPreview(screen,revealed[2],time,pose.delight,preview);});
    };
    paintReply(screens[0],0);paintCode(screens[1],0,0,0);paintPreview(screens[2],0,0,0);
    let triangles=0;world.traverse(object=>{if(!(object instanceof T.Mesh))return;const count=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;triangles+=count*(object instanceof T.InstancedMesh?object.count:1);});
    world.userData.creatorSet={bounds:{min:[-1.58,-.11,-1.14],max:[1.58,1.63,1.18]},triangles,keyboard:[0,.84,-.01],head:[0,1.36,.50]};
    return {world,chair,update,dispose};
  } catch(error) {dispose();throw error;}
}
