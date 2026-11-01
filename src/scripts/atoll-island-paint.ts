/** Filled contours, ink and cel shading on a transparent 2D sheet.
 * No model, mesh, scene graph or 3D asset is used by this illustration. */
export function paintAtollIsland(canvas: HTMLCanvasElement, moment: number, pointer = { x: 0, y: 0 }) {
  const c = canvas.getContext('2d')!;
  const W = 1024, H = 800;
  if(canvas.width!==W)canvas.width=W;if(canvas.height!==H)canvas.height=H;
  c.clearRect(0,0,W,H);
  const night = moment > 1.5, dusk = moment > .5 && !night;
  const ink = night ? '#26474c' : dusk ? '#53605a' : '#366965';
  const sand = night ? '#96b9b9' : dusk ? '#efd2ad' : '#f6edce';
  const shade = night ? '#668f99' : dusk ? '#c49b8b' : '#d8c7a1';
  const greens = night ? ['#365e60', '#477b73', '#608f7e'] : dusk ? ['#376d63', '#508d70', '#8daf79'] : ['#277568', '#409a7b', '#8ac49a'];
  const yaw=pointer.x*.34,co=Math.cos(yaw),si=Math.sin(yaw);
  const P = (x: number, y: number, z: number): [number, number] => {
    const rx=x*co-z*si,rz=x*si+z*co;
    return [W*.50+(rx-rz*.34)*158,H*.72+rz*(72+pointer.y*15)-y*(171+pointer.y*9)];
  };
  const coast = (scale: number, height: number, dx = 0, dz = 0) => {
    c.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = i / 120 * Math.PI * 2, r = 1 + .085 * Math.sin(a * 3 + .6) + .045 * Math.cos(a * 5);
      const p = P(Math.cos(a) * 1.58 * r * scale + dx, height + Math.sin(a * 2) * .013, Math.sin(a) * .99 * r * scale + dz);
      if (!i) c.moveTo(...p); else c.lineTo(...p);
    }
    c.closePath();
  };
  c.lineJoin = 'round'; c.lineCap = 'round';
  // The narrow lower contour reads as a sandy ledge rather than a flat badge.
  coast(1.02, -.018); c.fillStyle = shade; c.fill();
  c.strokeStyle = ink; c.lineWidth = 2.5; c.stroke();
  coast(1, .06); c.fillStyle = sand; c.fill();
  c.strokeStyle = night ? '#bad7cf' : '#fff7de'; c.lineWidth = 3; c.stroke();
  c.save(); coast(.96, .064); c.clip();
  c.strokeStyle = dusk ? '#ffe7bd' : night ? '#acd0c8' : '#fffbea'; c.lineWidth = 5;
  for (let i = 0; i < 5; i++) {
    const p = P(-1.2 + i * .4, .075, .58 + (i % 2) * .09);
    c.beginPath(); c.moveTo(...p); c.bezierCurveTo(p[0]+23,p[1]-6,p[0]+49,p[1]+5,p[0]+65,p[1]-1); c.stroke();
  }
  coast(.62, .12, -.04, -.14); c.fillStyle = greens[0]; c.fill();
  coast(.56, .15, -.08, -.23); c.fillStyle = greens[1]; c.fill();
  c.restore();
  // A few low, shaded bushes keep the palms rooted in the drawing.
  for (let i = 0; i < 9; i++) {
    const a = i * 2.399, r = .16 + (i % 4) * .13;
    const p = P(Math.cos(a) * r, .15, Math.sin(a) * r - .14), size = 12 + i % 5 * 2;
    c.beginPath(); c.ellipse(p[0],p[1],size,size*.55,-.16,0,Math.PI*2); c.fillStyle = greens[i%3]; c.fill();
    c.strokeStyle = ink; c.lineWidth = 1.4; c.stroke();
  }
  // Curved trunks and broad, pointed fronds are drawn back to front.
  const palms = [
    {x:-.70,z:-.30,h:1.49,lean:.14,seed:1}, {x:.15,z:-.46,h:1.62,lean:-.17,seed:2},
    {x:.73,z:-.12,h:1.34,lean:.23,seed:3}, {x:-.29,z:.24,h:1.36,lean:-.21,seed:4},
    {x:.35,z:.37,h:1.17,lean:.17,seed:5},
  ];
  palms.sort((a,b)=>(a.x*si+a.z*co)-(b.x*si+b.z*co));
  for (const t of palms) {
    const base = P(t.x,.15,t.z), crown = P(t.x+t.lean,t.h,t.z-.025);
    c.beginPath();c.ellipse(base[0]+7,base[1]+2,15,3.6,.1,0,Math.PI*2);c.fillStyle='#204f4b3b';c.fill();
    const trunk = () => { c.beginPath(); c.moveTo(...base); c.bezierCurveTo(base[0]-8,base[1]-45,crown[0]-11,crown[1]+42,...crown); };
    trunk(); c.strokeStyle = ink; c.lineWidth = 13; c.stroke();
    trunk(); c.strokeStyle = night ? '#a6ad90' : dusk ? '#d1b68a' : '#d9c69a'; c.lineWidth = 8.5; c.stroke();
    c.strokeStyle = night ? '#516f6a' : '#9d956f'; c.lineWidth = 2;
    for (let j=1;j<8;j++) {
      const f=j/8, x=base[0]*(1-f)+crown[0]*f-5*Math.sin(f*Math.PI), y=base[1]*(1-f)+crown[1]*f;
      c.beginPath(); c.moveTo(x-4,y); c.lineTo(x+4,y-2.5); c.stroke();
    }
    for (let j=0;j<8;j++) {
      const a=j/8*Math.PI*2+t.seed*.42, dx=Math.cos(a)*(82+(j%3)*17), dy=Math.sin(a)*41+14;
      const tip=[crown[0]+dx,crown[1]+dy], lift=26+(j%2)*9;
      c.beginPath(); c.moveTo(...crown);
      c.bezierCurveTo(crown[0]+dx*.24,crown[1]-lift-12,crown[0]+dx*.76,tip[1]-32,tip[0],tip[1]+9);
      c.bezierCurveTo(crown[0]+dx*.68,tip[1]-7,crown[0]+dx*.29,crown[1]+9,...crown);
      c.fillStyle=greens[(j+t.seed)%3]; c.fill(); c.strokeStyle=ink; c.lineWidth=2.4; c.stroke();
      c.beginPath(); c.moveTo(...crown); c.quadraticCurveTo(crown[0]+dx*.52,crown[1]-lift*.65,...tip as [number,number]);
      c.strokeStyle=night ? '#7ca394' : '#a9d1a2'; c.lineWidth=1.2; c.stroke();
    }
    for (let j=0;j<3;j++) {
      c.beginPath(); c.arc(crown[0]-6+j*6,crown[1]+6+(j%2)*3,5,0,Math.PI*2); c.fillStyle=night ? '#81977b' : '#a89963'; c.fill(); c.strokeStyle=ink; c.lineWidth=1.5; c.stroke();
    }
  }
  // Inked stones, with two filled faces each; no extruded geometry.
  for (const [x,z,s] of [[-1.21,.20,.17],[1.17,.15,.21],[1.33,.32,.12]]) {
    const p=P(x,.07,z), w=s*158;
    c.beginPath(); c.moveTo(p[0]-w,p[1]); c.lineTo(p[0]-w*.6,p[1]-w*.65); c.lineTo(p[0]+w*.42,p[1]-w*.85); c.lineTo(p[0]+w,p[1]-w*.1); c.lineTo(p[0]+w*.35,p[1]+w*.30); c.closePath();
    c.fillStyle=night?'#537f89':'#8faaa3'; c.fill(); c.strokeStyle=ink; c.lineWidth=2; c.stroke();
    c.beginPath(); c.moveTo(p[0]-w*.6,p[1]-w*.65); c.lineTo(p[0]+w*.42,p[1]-w*.85); c.lineTo(p[0]+w*.1,p[1]-w*.23); c.closePath(); c.fillStyle=night?'#82a5a8':'#c5d2be'; c.fill();
  }
}
