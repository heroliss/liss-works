/** Asset-level validation; no GPU, browser, or claim of final runtime approval. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { loadCreatorCharacter } from '../../../src/scripts/creator-character.ts';
import { createCreatorPerformer } from '../../../src/scripts/creator-performance.ts';

const directory = path.dirname(fileURLToPath(import.meta.url));
const asset = path.resolve(directory, '../../../public/media/creator-room/creator-character-v18.glb');
const data = await fs.readFile(asset);
const nativeFetch = globalThis.fetch;
globalThis.location = { href: 'http://local.invalid/about/' };
globalThis.fetch = async () => new Response(data);
const parent = new THREE.Group();
const abort = new AbortController();
const result = { asset, bytes: data.length, assetOnly: true, checks: [], passed: false };
function check(name, ok, detail) { result.checks.push({ name, passed: Boolean(ok), detail }); if (!ok) throw new Error(name); }
try {
  const document=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
  const triangles=document.meshes.reduce((total,m)=>total+m.primitives.reduce((n,p)=>n+document.accessors[p.indices].count/3,0),0);
  check('triangle-budget',triangles<90000,{triangles,limit:90000});
  check('self-contained-original-asset',!document.images?.length&&!document.buffers.some(b=>b.uri),{images:document.images?.length??0,buffers:document.buffers.length});
  const character = await loadCreatorCharacter(THREE, parent, { url: '/character.glb', signal: abort.signal });
  check('attached-once', parent.children.length === 1, parent.children.length);
  const bones = new Map(); let meshes=0, morphs=0;
  character.root.traverse((o) => { if (o.isBone) bones.set(o.name, o); if(o.isMesh){meshes++;morphs+=Object.keys(o.morphTargetDictionary ?? {}).length;} });
  check('real-skinned-rig', bones.size >= 30 && meshes > 15 && morphs >= 10, {bones:bones.size,meshes,morphs});
  check('finite-human-bounds', Number.isFinite(character.bounds.min.y) && character.bounds.max.y > 1.4 && character.bounds.max.y < 1.7, {min:character.bounds.min.toArray(),max:character.bounds.max.toArray()});
  const getBone = name => bones.get(THREE.PropertyBinding.sanitizeNodeName(name));
  const length = (a,b) => getBone(a).getWorldPosition(new THREE.Vector3()).distanceTo(getBone(b).getWorldPosition(new THREE.Vector3()));
  const segments=['L','R'].flatMap(s=>[[`upper_arm.${s}`,`forearm.${s}`],[`forearm.${s}`,`hand.${s}`]]);
  const lengths=segments.map(([a,b])=>length(a,b));
  const leftPalmFrame=getBone('hand.L').getWorldQuaternion(new THREE.Quaternion());
  const restMatrices=Object.fromEntries([...bones].map(([name,bone])=>[name,bone.matrixWorld.toArray()]));
  const performer = createCreatorPerformer();
  let maximumLengthError=0, maximumKeyboardError=0, maximumLeftPalmAngle=0, maximumLeftWristError=0, maximumLeftTypingError=0, maximumLeftReachProjection=0, maximumLeftShoulderDistance=0;
  for (let i=0;i<1440;i++) {
    const pose=performer.sample(i/30,{x:Math.sin(i*.031),y:Math.cos(i*.017),active:1,speed:.2},1/30);
    character.apply(pose,1/30);
    maximumLeftPalmAngle=Math.max(maximumLeftPalmAngle,leftPalmFrame.angleTo(getBone('hand.L').getWorldQuaternion(new THREE.Quaternion())));
    maximumLeftWristError=Math.max(maximumLeftWristError,getBone('hand.L').getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(-.183,.848,.105)));
    const leftTarget=new THREE.Vector3(-.183,.848+pose.typing*Math.sin(pose.cycle*Math.PI*2*19-1)*.0018,.105);
    maximumLeftReachProjection=Math.max(maximumLeftReachProjection,getBone('hand.L').getWorldPosition(new THREE.Vector3()).distanceTo(leftTarget));
    maximumLeftShoulderDistance=Math.max(maximumLeftShoulderDistance,getBone('upper_arm.L').getWorldPosition(new THREE.Vector3()).distanceTo(leftTarget));
    for(let j=0;j<segments.length;j++) maximumLengthError=Math.max(maximumLengthError,Math.abs(length(...segments[j])-lengths[j]));
    for (const bone of bones.values()) checkFinite(bone);
    if(pose.beat==='type' && pose.thinking<.02 && pose.mouse<.02 && pose.delight<.02) {
      const wrist=getBone('hand.R').getWorldPosition(new THREE.Vector3());
      maximumKeyboardError=Math.max(maximumKeyboardError,wrist.distanceTo(new THREE.Vector3(.183,.848,.045)));
      maximumLeftTypingError=Math.max(maximumLeftTypingError,getBone('hand.L').getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(-.183,.848,.105)));
    }
  }
  check('two-cycles-finite',true,{samples:1440,seconds:48});
  check('fixed-arm-lengths',maximumLengthError<.000001,{maximumLengthError,lengths});
  check('typing-wrist-contact',maximumKeyboardError<.008&&maximumLeftTypingError<.008,{maximumKeyboardError,maximumLeftTypingError});
  const leftArmReachLimit=lengths[0]+lengths[1]-.004;
  result.motionCorrection={leftWristTarget:[-.183,.848,.105],maximumLeftPalmAngle,maximumLeftWristTargetError:maximumLeftWristError,maximumLeftWristReachProjection:maximumLeftReachProjection,maximumLeftShoulderDistance,leftArmReachLimit,minimumLeftReachMargin:leftArmReachLimit-maximumLeftShoulderDistance,maximumLeftTypingError,passed:maximumLeftPalmAngle<.00001&&maximumLeftWristError<.008&&maximumLeftReachProjection<.001&&maximumLeftShoulderDistance<=leftArmReachLimit&&maximumLeftTypingError<.008};
  if(!result.motionCorrection.passed)throw new Error('left palm lost its keyboard frame during a right-hand gesture');
  const samples=[];
  for(const [label,time] of [['read',2],['think',4.9],['type',8],['delight',16]]) {
    performer.reset();let pose;
    for(let i=0;i<=Math.ceil(time*30);i++)pose=performer.sample(Math.min(time,i/30),{x:0,y:0,active:0,speed:0},1/30);
    character.apply(pose,1/30);
    samples.push({label,time,pose,matrices:Object.fromEntries([...bones].map(([name,bone])=>[name,bone.matrixWorld.toArray()]))});
  }
  await fs.writeFile(path.join(directory,'pose-reference.json'),JSON.stringify({restMatrices,samples},null,2));
  const skeletons=new Set();let releasedBoneTextures=0;
  character.root.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});
  skeletons.forEach(s=>{s.computeBoneTexture();s.boneTexture.addEventListener('dispose',()=>releasedBoneTextures++);});
  abort.abort();character.dispose();character.dispose();
  check('bone-textures-released',releasedBoneTextures===skeletons.size,{releasedBoneTextures,skeletons:skeletons.size});
  check('idempotent-abort-dispose',parent.children.length===0,parent.children.length);
  const alreadyAborted=new AbortController();alreadyAborted.abort();let rejected=false;
  try { await loadCreatorCharacter(THREE,parent,{url:'/character.glb',signal:alreadyAborted.signal}); } catch { rejected=true; }
  check('pre-aborted-load',rejected&&parent.children.length===0, rejected);
  result.passed=true;
} catch(error) { result.error=String(error);process.exitCode=1; }
finally { globalThis.fetch=nativeFetch; await fs.writeFile(path.join(directory,'character-static-validation.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2)); }
function checkFinite(bone) {
  const q=bone.quaternion;
  if(![q.x,q.y,q.z,q.w,bone.position.x,bone.position.y,bone.position.z].every(Number.isFinite)) throw new Error(`nonfinite ${bone.name}`);
}
