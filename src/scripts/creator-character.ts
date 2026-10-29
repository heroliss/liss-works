import type * as Three from 'three';
import type { CreatorPose } from './creator-performance-types';

type ThreeModule = typeof import('three');
export interface CreatorCharacter {
  root: Three.Group;
  bounds: Three.Box3;
  apply(pose: CreatorPose, dt: number): void;
  dispose(): void;
}
interface LoadOptions { url: string; signal: AbortSignal }
interface Joint {
  bone: Three.Bone;
  rest: Three.Quaternion;
  parentFrame: Three.Quaternion;
}
interface Arm {
  side: 'L' | 'R';
  upper: Joint;
  fore: Joint;
  hand: Joint;
  upperAxis: Three.Vector3;
  foreAxis: Three.Vector3;
  upperLength: number;
  foreLength: number;
  handFrame: Three.Quaternion;
}

/** A GLB is fetched only after the About room requests a character. */
export async function loadCreatorCharacter(
  T: ThreeModule, parent: Three.Object3D, { url, signal }: LoadOptions,
): Promise<CreatorCharacter> {
  signal.throwIfAborted();
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  signal.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Creator character: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  const gltf = await new GLTFLoader().parseAsync(bytes, new URL('.', new URL(url, location.href)).href);
  const root = new T.Group();
  root.name = 'Original clay creator';
  root.add(gltf.scene);
  let disposed = false;
  const geometries = new Set<Three.BufferGeometry>();
  const skeletons = new Set<Three.Skeleton>();
  const materials = new Set<Three.Material>();
  const textures = new Set<Three.Texture>();
  root.traverse((object) => {
    if (!(object instanceof T.Mesh)) return;
    // Millimetre facial relief must not stripe the face with shadow-map acne.
    object.castShadow = !/(glasses|eyeball|iris|pupil|eyelid|brow|lip|mouth|ear_concha|ear_antihelix)/i.test(object.name);
    object.receiveShadow = true;
    geometries.add(object.geometry);
    if (object instanceof T.SkinnedMesh) skeletons.add(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
    }
  });
  function dispose() {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    root.removeFromParent();
    textures.forEach((texture) => {
      const image = texture.source?.data;
      if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
      texture.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    skeletons.forEach((skeleton) => skeleton.dispose());
    materials.forEach((material) => material.dispose());
    root.clear();
  }
  if (signal.aborted) { dispose(); signal.throwIfAborted(); }
  try {
    parent.add(root);
    root.updateWorldMatrix(true, true);
    const rootFrame = root.getWorldQuaternion(new T.Quaternion());
    const inverseRootFrame = rootFrame.clone().invert();
    const joints = new Map<string, Joint>();
    root.traverse((object) => {
      if (!(object instanceof T.Bone)) return;
      const parentFrame = object.parent!.getWorldQuaternion(new T.Quaternion()).premultiply(inverseRootFrame);
      joints.set(object.name, { bone: object, rest: object.quaternion.clone(), parentFrame });
    });
    const requireJoint = (name: string) => {
      const joint = joints.get(T.PropertyBinding.sanitizeNodeName(name));
      if (!joint) throw new Error(`Creator character: missing joint ${name}`);
      return joint;
    };
    const arms: Arm[] = (['L', 'R'] as const).map((side) => {
      const upper = requireJoint(`upper_arm.${side}`);
      const fore = requireJoint(`forearm.${side}`);
      const hand = requireJoint(`hand.${side}`);
      const a = upper.bone.getWorldPosition(new T.Vector3());
      const b = fore.bone.getWorldPosition(new T.Vector3());
      const c = hand.bone.getWorldPosition(new T.Vector3());
      return {
        side, upper, fore, hand,
        upperLength: a.distanceTo(b), foreLength: b.distanceTo(c),
        upperAxis: b.clone().sub(a).normalize().applyQuaternion(upper.bone.getWorldQuaternion(new T.Quaternion()).invert()),
        foreAxis: c.clone().sub(b).normalize().applyQuaternion(fore.bone.getWorldQuaternion(new T.Quaternion()).invert()),
        handFrame: hand.bone.getWorldQuaternion(new T.Quaternion()).premultiply(inverseRootFrame),
      };
    });
    const morphs: Array<{ mesh: Three.Mesh; index: number; name: string }> = [];
    root.traverse((object) => {
      if (!(object instanceof T.Mesh) || !object.morphTargetDictionary) return;
      for (const [name, index] of Object.entries(object.morphTargetDictionary)) morphs.push({ mesh: object, index, name });
    });
    const bounds = new T.Box3().setFromObject(root);
    const headBone = requireJoint('head').bone;
    // Bind-space wrist point just under the jaw: .01/.015/-.09 from head pivot.
    // Keeping it in head-local space also follows current head/chest/chair yaw.
    const chinContact = headBone.worldToLocal(root.localToWorld(new T.Vector3(.010, 1.205, .335)));
    const inverseHeadFrame = headBone.getWorldQuaternion(new T.Quaternion()).premultiply(inverseRootFrame).invert();
    const delta = new T.Quaternion(), rotation = new T.Quaternion(), parentQ = new T.Quaternion();
    const worldQ = new T.Quaternion(), baseQ = new T.Quaternion(), correction = new T.Quaternion();
    const headDelta = new T.Quaternion(), thinkingQ = new T.Quaternion();
    const euler = new T.Euler(0, 0, 0, 'YXZ');
    const shoulder = new T.Vector3(), target = new T.Vector3(), pole = new T.Vector3();
    const direction = new T.Vector3(), bend = new T.Vector3(), elbow = new T.Vector3();
    const origin = new T.Vector3(), axis = new T.Vector3(), endDirection = new T.Vector3();
    const keyboard = new T.Vector3(), gesture = new T.Vector3();
    const clamp = T.MathUtils.clamp;
    function poseJoint(name: string, pitch = 0, yaw = 0, roll = 0) {
      const joint = joints.get(T.PropertyBinding.sanitizeNodeName(name));
      if (!joint) return;
      // Convert semantic Y-up axes into the joint's authored parent rest frame.
      delta.setFromEuler(euler.set(-pitch, yaw, -roll));
      rotation.copy(joint.parentFrame).invert().multiply(delta).multiply(joint.parentFrame);
      joint.bone.quaternion.copy(rotation).multiply(joint.rest);
    }
    function orient(joint: Joint, localAxis: Three.Vector3, toward: Three.Vector3) {
      joint.bone.parent!.getWorldQuaternion(parentQ);
      baseQ.copy(parentQ).multiply(joint.rest);
      axis.copy(localAxis).applyQuaternion(baseQ);
      correction.setFromUnitVectors(axis, toward);
      worldQ.copy(correction).multiply(baseQ);
      joint.bone.quaternion.copy(parentQ.invert()).multiply(worldQ);
      joint.bone.updateWorldMatrix(false, true);
    }
    function solveArm(arm: Arm, pose: CreatorPose) {
      const s = arm.side === 'L' ? -1 : 1;
      arm.upper.bone.getWorldPosition(shoulder);
      // The left wrist rests at the near keyboard edge. Its fingertips still
      // point into the keys, while the turned torso can reach without stretch.
      keyboard.set(s * .183, .848, arm.side === 'L' ? .105 : .045);
      // Targets describe wrist contact, not the middle of the palm.
      target.copy(keyboard);
      if (arm.side === 'R') {
        gesture.set(.39, .849, .065); target.lerp(gesture, clamp(pose.mouse, 0, 1));
        // Chin moves with the actual head; hands approach its lower side.
        gesture.copy(chinContact);
        headBone.localToWorld(gesture);
        root.worldToLocal(gesture);
        target.lerp(gesture, clamp(pose.thinking, 0, 1));
        gesture.set(.29, 1.035, .185); target.lerp(gesture, clamp(pose.delight, 0, 1));
      }
      target.y += pose.typing * Math.sin(pose.cycle * Math.PI * 2 * 19 + s) * .0018;
      root.localToWorld(target);
      direction.copy(target).sub(shoulder);
      const distance = clamp(direction.length(), Math.abs(arm.upperLength - arm.foreLength) + .008, arm.upperLength + arm.foreLength - .004);
      direction.normalize();
      // Project unreachable targets to the reachable sphere; never scale a bone.
      target.copy(shoulder).addScaledVector(direction, distance);
      pole.set(s * .48, .78, .39); root.localToWorld(pole);
      origin.copy(pole).sub(shoulder);
      bend.copy(origin).addScaledVector(direction, -origin.dot(direction));
      if (bend.lengthSq() < 1e-8) bend.set(s, 0, .2);
      bend.normalize();
      const along = (arm.upperLength ** 2 - arm.foreLength ** 2 + distance ** 2) / (2 * distance);
      const height = Math.sqrt(Math.max(0, arm.upperLength ** 2 - along ** 2));
      elbow.copy(shoulder).addScaledVector(direction, along).addScaledVector(bend, height);
      endDirection.copy(elbow).sub(shoulder).normalize(); orient(arm.upper, arm.upperAxis, endDirection);
      endDirection.copy(target).sub(elbow).normalize(); orient(arm.fore, arm.foreAxis, endDirection);
      root.getWorldQuaternion(worldQ);
      if (arm.side === 'R') {
        // The thinking palm follows the same face direction as its contact.
        // Blend from the flat keyboard grip once, without changing the left hand.
        parentQ.copy(worldQ).invert();
        headBone.getWorldQuaternion(headDelta).premultiply(parentQ).multiply(inverseHeadFrame);
        delta.setFromEuler(euler.set(1.05, .12, .10));
        thinkingQ.copy(worldQ).multiply(headDelta).multiply(delta).multiply(arm.handFrame);
        delta.setFromEuler(euler.set(-pose.delight * .24, 0, pose.delight * .16));
        worldQ.multiply(delta).multiply(arm.handFrame).slerp(thinkingQ, clamp(pose.thinking, 0, 1));
      } else worldQ.multiply(arm.handFrame);
      arm.hand.bone.parent!.getWorldQuaternion(parentQ).invert();
      arm.hand.bone.quaternion.copy(parentQ).multiply(worldQ);
      arm.hand.bone.updateWorldMatrix(false, true);
    }
    function apply(pose: CreatorPose, _dt: number) {
      if (disposed) return;
      poseJoint('pelvis', 0, pose.chairYaw, 0);
      poseJoint('spine', pose.torsoLean * .35, pose.torsoYaw * .35, pose.torsoRoll * .35);
      poseJoint('chest', pose.torsoLean * .65 + pose.breath * .002, pose.torsoYaw * .65, pose.torsoRoll * .65);
      poseJoint('neck', pose.headPitch * .25, pose.headYaw * .25, pose.headRoll * .25);
      poseJoint('head', pose.headPitch * .75, pose.headYaw * .75, pose.headRoll * .75);
      poseJoint('eye.L', clamp(pose.gazeY, -.18, .18), clamp(pose.gazeX, -.25, .25));
      poseJoint('eye.R', clamp(pose.gazeY, -.18, .18), clamp(pose.gazeX, -.25, .25));
      root.updateWorldMatrix(true, true);
      for (const arm of arms) {
        solveArm(arm, pose);
        const fingers = arm.side === 'L' ? pose.fingerLeft : pose.fingerRight;
        for (let i = 0; i < 5; i++) {
          const curl = clamp(fingers[i] ?? 0, 0, 1);
          poseJoint(`finger${i}_1.${arm.side}`, curl * (i ? .44 : .26));
          poseJoint(`finger${i}_2.${arm.side}`, curl * (i ? .62 : .38));
        }
      }
      const values: Record<string, number> = {
        Blink_L: pose.blinkLeft, Blink_R: pose.blinkRight,
        Brow_L: pose.browLeft, Brow_R: pose.browRight,
        Smile: pose.smile, MouthOpen: pose.mouthOpen, CheekRaise: pose.cheekRaise,
        EyeWide: Math.max(pose.mouthOpen * .8, pose.delight * .3) * (1 - Math.max(pose.blinkLeft, pose.blinkRight)),
      };
      for (const { mesh, index, name } of morphs) mesh.morphTargetInfluences![index] = clamp(values[name] ?? 0, 0, 1);
      root.updateWorldMatrix(false, true);
    }
    signal.addEventListener('abort', dispose, { once: true });
    return { root, bounds, apply, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
