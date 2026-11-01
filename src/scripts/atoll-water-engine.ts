import { paintAtollIsland } from './atoll-island-paint';
import { waterVertex, waterFragment } from './atoll-water-shaders';

export interface AtollEngine {
  resize: () => void;
  repaint: () => void;
  draw: (time: number, pointer: { x: number; y: number }, dt: number) => void;
  ripple: (x: number, y: number, time: number, strength?: number) => void;
  moment: (value: number) => void;
  capture?: () => string;
  dispose: () => void;
}

/** One fullscreen triangle shades a perspective sea; the island is a 2D ink
 * texture. There are no scene objects, model files or 3D geometry resources. */
export function createAtollEngine(canvas: HTMLCanvasElement, stage: HTMLElement): AtollEngine {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' });
  if (!gl) throw new Error('WebGL 2 unavailable');
  const textures: WebGLTexture[] = [], shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null, vao: WebGLVertexArrayObject | null = null, released = false;
  const dispose = () => {
    if (released) return; released = true;
    textures.forEach(texture => gl.deleteTexture(texture)); shaders.forEach(shader => gl.deleteShader(shader));
    if (program) gl.deleteProgram(program); if (vao) gl.deleteVertexArray(vao);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.width = canvas.height = 1;
  };
  try {
    const shader = (source: string, kind: number) => {
      const result = gl.createShader(kind)!; shaders.push(result); gl.shaderSource(result, source); gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result) || 'Water shader did not compile');
      return result;
    };
    program = gl.createProgram()!;
    gl.attachShader(program, shader(waterVertex, gl.VERTEX_SHADER)); gl.attachShader(program, shader(waterFragment, gl.FRAGMENT_SHADER)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Water program did not link');
    gl.useProgram(program); vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const uniform = (name: string) => gl.getUniformLocation(program!, name);
    const resolution = uniform('uResolution'), clock = uniform('uTime'), mouse = uniform('uPointer'), phase = uniform('uMoment'), rippleUniform = uniform('uRipples[0]');
    const texture = (source: TexImageSource, unit: number, name: string, flip: boolean) => {
      const t = gl.createTexture()!; textures.push(t); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); gl.uniform1i(uniform(name), unit); return t;
    };
    const illustration = document.createElement('canvas'); paintAtollIsland(illustration, 0);
    const islandTexture = texture(illustration, 0, 'uIsland', true);
    const ripples = new Float32Array(32); for (let i=0;i<8;i++) ripples[i*4+2]=-100;
    let rippleIndex=0, goalMoment=0, moment=0, paintedMoment=0, paintedX=0, paintedY=0, width=0, height=0;
    let smoothX=0, smoothY=0;
    const resize = () => {
      const w=Math.max(1,stage.clientWidth), h=Math.max(1,stage.clientHeight);
      const ratio=Math.min(devicePixelRatio || 1,1.5,Math.sqrt(1_150_000/(w*h)));
      const nextWidth=Math.round(w*ratio),nextHeight=Math.round(h*ratio);
      if(nextWidth===width&&nextHeight===height)return;
      width=nextWidth;height=nextHeight;canvas.width=width;canvas.height=height;
      gl.viewport(0,0,width,height); gl.uniform2f(resolution,width,height);
    };
    const draw: AtollEngine['draw'] = (time, pointer, dt) => {
      if (released || gl.isContextLost()) return;
      // A roughly half-second response softens both turning and returning,
      // while leaving the pointer's full angular range unchanged.
      const blend=dt?1-Math.exp(-dt*1.85):1;
      smoothX+=(pointer.x-smoothX)*blend; smoothY+=(pointer.y-smoothY)*blend;
      moment+=(goalMoment-moment)*(dt?1-Math.exp(-dt*4):1);
      if (Math.abs(moment-paintedMoment)>.10 || Math.abs(smoothX-paintedX)>.006 || Math.abs(smoothY-paintedY)>.010 || (!dt && moment!==paintedMoment)) {
        paintAtollIsland(illustration,moment,{x:smoothX,y:smoothY}); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,islandTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,illustration); paintedMoment=moment;paintedX=smoothX;paintedY=smoothY;
      }
      gl.uniform1f(clock,time); gl.uniform1f(phase,moment); gl.uniform2f(mouse,smoothX,smoothY); gl.uniform4fv(rippleUniform,ripples);
      gl.drawArrays(gl.TRIANGLES,0,3);
    };
    const ripple: AtollEngine['ripple'] = (x,y,time,strength=.6) => {
      const aspect=width/height, distance=aspect<1.15?10.4:9.4;
      const yaw=smoothX*.34;
      const origin=[Math.sin(yaw)*distance,distance*(.635+smoothY*.08),Math.cos(yaw)*distance];
      const f=[-origin[0],-origin[1],-.25-origin[2]], fl=Math.hypot(...f); for(let i=0;i<3;i++)f[i]/=fl;
      const rl=Math.hypot(f[2],f[0]), r=[-f[2]/rl,0,f[0]/rl];
      const up=[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]];
      const dir=f.map((v,i)=>v+r[i]*x*aspect*.33+up[i]*(-y)*.33), t=-origin[1]/dir[1];
      const px=origin[0]+dir[0]*t,pz=origin[2]+dir[2]*t;
      if(!Number.isFinite(t)||t<0||Math.abs(px)>7||Math.abs(pz)>6)return;
      ripples.set([px,pz,time-.006,strength],(rippleIndex++%8)*4);
    };
    resize();
    return {resize,draw,repaint:()=>{if(!released&&!gl.isContextLost())gl.drawArrays(gl.TRIANGLES,0,3);},ripple,moment:value=>{goalMoment=Math.max(0,Math.min(2,value));},dispose,
      ...(import.meta.env.DEV?{capture:()=>{gl.drawArrays(gl.TRIANGLES,0,3);return canvas.toDataURL('image/png');}}:{})};
  } catch(error) { dispose(); throw error; }
}
