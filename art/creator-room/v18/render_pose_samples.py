"""Inspect the actual runtime IK matrices on the authored Blender skin.
This is an asset reference render, not a browser/WebGL acceptance substitute.
"""
import bpy,json
from pathlib import Path
from mathutils import Matrix,Vector
H=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(H/'creator-character-v18.blend'))
data=json.loads((H/'pose-reference.json').read_text())
rig=bpy.data.objects['CreatorRig'];scene=bpy.context.scene
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
def matrix(values):return Matrix(tuple(tuple(values[c*4+r] for c in range(4)) for r in range(4)))
def V(p):return Vector((p[0],-p[2],p[1]))
scene.render.resolution_x=1050;scene.render.resolution_y=1100
camera=scene.camera;camera.location=V((-2.8,1.7,.8));target=V((0,.95,.25));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=1.68
for sample in data['samples']:
    desired={}
    for bone in rig.pose.bones:
        name=bone.name.replace('.','')
        current=matrix(sample['matrices'][name]);rest=matrix(data['restMatrices'][name])
        desired[bone.name]=C@current@rest.inverted()@C.inverted()@bone.bone.matrix_local
    # Assign relative bases from the whole desired hierarchy, rather than
    # relying on stale depsgraph parent matrices between individual assignments.
    for bone in rig.pose.bones:
        matrix_parent=bone.parent.bone.matrix_local@desired[bone.parent.name].inverted() if bone.parent else Matrix.Identity(4)
        bone.matrix_basis=bone.bone.matrix_local.inverted()@matrix_parent@desired[bone.name]
    p=sample['pose'];values={'Blink_L':p['blinkLeft'],'Blink_R':p['blinkRight'],'Brow_L':p['browLeft'],'Brow_R':p['browRight'],'Smile':p['smile'],'MouthOpen':p['mouthOpen'],'CheekRaise':p['cheekRaise'],'EyeWide':max(p['mouthOpen']*.8,p['delight']*.3)*(1-max(p['blinkLeft'],p['blinkRight']))}
    for ob in bpy.data.objects:
        if ob.type=='MESH' and ob.data.shape_keys:
            for k in ob.data.shape_keys.key_blocks:
                if k.name!='Basis':k.value=values.get(k.name,0)
    bpy.context.view_layer.update();scene.render.filepath=str(H/('pose-'+sample['label']+'.png'));bpy.ops.render.render(write_still=True)
print('POSE_REFERENCES_DONE',flush=True)
