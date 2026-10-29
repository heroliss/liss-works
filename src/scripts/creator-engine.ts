import type * as Three from 'three';
import type { CreatorCharacter } from './creator-character';
import type { CreatorPointer } from './creator-performance-types';
import { createCreatorPerformer } from './creator-performance';
import { createCreatorSet } from './creator-set';

type T = typeof import('three');
export interface CreatorEngine {
  resize: () => boolean;
  repaint: () => void;
  draw: (time: number, pointer: CreatorPointer, dt: number) => void;
  dispose: () => void;
}

/** The actor has finished loading before a GPU context is allocated. The set,
 * actor, choreography and camera then share one clock and one render loop. */
export function createRoomEngine(T: T, canvas: HTMLCanvasElement, stage: HTMLElement,
  context: WebGL2RenderingContext, actor: CreatorCharacter): CreatorEngine {
  let renderer: Three.WebGLRenderer;
  try { renderer = new T.WebGLRenderer({ canvas, context, antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch (error) { actor.dispose(); context.getExtension('WEBGL_lose_context')?.loseContext(); throw error; }
  const scene = new T.Scene();
  let set: ReturnType<typeof createCreatorSet> | undefined, released = false;
  const performer = createCreatorPerformer();
  const release = () => {
    if (released) return;
    released = true;
    actor.dispose(); set?.dispose(); performer.reset();
    renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); scene.clear();
    canvas.width = canvas.height = 1;
  };
  try {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.setClearColor(0x0a1019, 0);
    set = createCreatorSet(T, scene, renderer);
    set.world.add(actor.root);
    const camera = new T.PerspectiveCamera(32, 1, .04, 24);
    const target = new T.Vector3(0, .99, .05);
    const goal = new T.Vector3(), look = new T.Vector3(), relative = new T.Vector3();
    const spherical = new T.Spherical(), orbit = new T.Spherical();
    let width = 0, height = 0, distance = 3.9, yaw = 0, pitch = 0, pointerY = 0;
    let draws = 0, slow = 0, degraded = false;
    const anchors = [
      [-.95, .86, -.58], [.95, .86, -.58], [-.96, 1.29, -.13], [.96, 1.29, -.13],
      [-.28, 1.60, .47], [.28, 1.60, .47], [-.32, .82, -.12], [.43, .82, .07],
      [-.35, .60, .77], [.35, .60, .77], [0, 1.35, .67],
    ].map(p => new T.Vector3(...p as [number, number, number]));
    const resize = () => {
      const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
      if (w === width && h === height) return false;
      width = w; height = h; camera.aspect = width / height; camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      // A side view reveals both the face and the inward-facing display arc.
      // Phone keeps that same character view instead of switching to his back.
      const direction = new T.Vector3(-1, width < 700 ? .40 : .34, .31).normalize();
      target.set(width < 700 ? -.02 : 0, width < 700 ? .96 : 1.00, .10);
      const right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), direction).normalize();
      const up = new T.Vector3().crossVectors(direction, right).normalize();
      const tan = Math.tan(camera.fov * Math.PI / 360);
      distance = 0;
      for (const anchor of anchors) {
        relative.copy(anchor).sub(target);
        distance = Math.max(distance, relative.dot(direction) + Math.abs(relative.dot(right)) / (tan * camera.aspect),
          relative.dot(direction) + Math.abs(relative.dot(up)) / tan);
      }
      // The phone is an intimate view of the creator and work surface. The
      // decorative plinth/desk legs may leave the shot; the face and hands lead.
      distance *= width < 700 ? .92 : 1.11;
      spherical.setFromVector3(direction.multiplyScalar(distance));
      // Reframe for the new aspect ratio without resampling the frozen pose or
      // clock. Preserve the existing orbit, so a paused phone rotation cannot
      // crop the character or restart his action.
      orbit.set(spherical.radius, spherical.phi + pitch, spherical.theta + yaw);
      camera.position.setFromSpherical(orbit).add(target);
      look.copy(target); look.y -= pointerY * .012; camera.lookAt(look);
      return true;
    };
    const draw = (time: number, pointer: CreatorPointer, dt: number) => {
      const started = performance.now();
      const pose = performer.sample(time, pointer, dt);
      actor.apply(pose, dt);
      set!.update(pose, time);
      const gain = width < 700 ? .7 : 1;
      const a = dt ? 1 - Math.exp(-dt / .22) : 1;
      yaw += (pointer.x * .18 * gain - yaw) * a;
      pitch += (pointer.y * .065 * gain - pitch) * a;
      orbit.set(spherical.radius, spherical.phi + pitch, spherical.theta + yaw);
      goal.setFromSpherical(orbit).add(target);
      pointerY = pointer.y; look.copy(target); look.y -= pointerY * .012;
      camera.position.lerp(goal, a); camera.lookAt(look);
      renderer.render(scene, camera);
      if (++draws > 25 && !degraded) {
        slow = Math.max(0, slow + (performance.now() - started > 27 ? 1 : -.2));
        if (slow > 28) {
          degraded = true;
          renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1));
          renderer.setSize(width, height, false);
          renderer.render(scene, camera);
        }
      }
    };
    resize();
    return { resize, draw, repaint: () => renderer.render(scene, camera), dispose: release };
  } catch (error) { release(); throw error; }
}
