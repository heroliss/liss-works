# Creator character v18

Original seated adult clay character for the miniature night studio. The model,
topology, weights, expression keys, glasses and clothing are authored by
`build_character.py` in Blender 5.2.1 LTS. No external character mesh, texture,
font, motion-capture file or paid model service is used. The concept PNG beside
this file is an art-direction reference only; it is not projected into the GLB.

## Reproduce

From `site-next`, using the installed local executable:

```powershell
& 'D:/Blender 5.2/blender.exe' --background --factory-startup --disable-autoexec --python art/creator-room/v18/build_character.py
node --experimental-strip-types art/creator-room/v18/verify_character.mjs
& 'D:/Blender 5.2/blender.exe' --background --factory-startup --disable-autoexec --python art/creator-room/v18/render_pose_samples.py
```

The first command writes the editable `.blend`, self-contained public GLB,
four expression portraits, a fully closed blink, the seated body, hand detail,
and `character-manifest.json`. Modifiers are applied before creating expression
keys; glTF export leaves `export_apply=False` so the real morph targets survive.

## Runtime contract

- Coordinates: metres, Y up, facing -Z, no baked performance yaw.
- Pelvis about `[0,.57,.50]`, head centre `[0,1.36,.42]`.
- 41 bones, 45 mesh primitives, 88,624 triangles; no image textures or baked clips.
- Continuous sculpted cardigan/shoulder/sleeve skin and continuous palm/fingers.
- `Blink_L/R`, `EyeWide`, `Brow_L/R`, `Smile`, `MouthOpen`, `CheekRaise` are actual
  shape keys. Lids follow the front envelope of eye/iris/pupil; the eyeball is
  never scaled to simulate blinking.
- `creator-character.ts` dynamically imports GLTFLoader only when called.
  `loadCreatorCharacter(THREE,parent,{url,signal})` exports `root`, `bounds`,
  `apply(pose,dt)` and idempotent `dispose()`.
- Chair, chest, neck/head and gaze consume the shared performance values once.
  Analytic two-bone IK projects unreachable targets into the reachable sphere;
  it does not scale or change upper/lower arm length. Fingers consume the five
  curl weights in thumb/index/middle/ring/pinky order.
- Left wrist contact is `[-.183,.848,.105]`, at the keyboard's near edge; the
  left palm stays in its keyboard frame during right-hand gestures. The right
  thinking wrist follows a head-local point .01/.015/-.09 from the bind pivot,
  and its palm blends toward the current face orientation.
- Small facial meshes do not cast shadow-map stripes. Head/hair/body retain
  real cast shadows. No emissive face material or fake performance metrics.
- Abort/dispose removes the character, geometry, materials, textures, and the
  skeleton's lazily allocated bone texture. The module owns no RAF or timer;
  the room controller owns pause, visibility, reduced motion and scheduling.

## Evidence and limits

`character-static-validation.json` validates the actual exported GLB. It checks
the sub-90k triangle budget, self-contained content, rig/morph presence, finite
bounds, two full performance cycles, unchanged arm lengths, both typing wrists'
contact, bone-texture cleanup, double dispose, and pre-aborted loading. The
`motionCorrection` fields also measure the left palm's frame and its full-cycle
reach margin with extreme pointer input; the typing stroke is 1.8mm by design.
It is a CPU asset check, not a WebGL/browser acceptance claim.

The `pose-*.png` images apply actual runtime IK matrices back to the authored
Blender rig using relative bone bases; they check skin silhouettes in read,
think, type and delight poses. The earlier `pose-render.log` used an invalid
stale-parent transfer and is superseded by `pose-render-final.log` and these
current images. The final face/body renders were viewed directly. Full-room
lighting, responsive framing, continuous motion and final posters are verified
separately by the parent task in the real browser.

Early build logs preserve the look-and-fix history; they are not current
acceptance reports. `character-build-final.log` is the final geometry export.
`character-final-files.json` records its files and SHA-256 values.
