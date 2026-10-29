"""Original clay creator: authored lofts, continuous sculpt unions, skinned rig.

Blender 5.2: --background --factory-startup --disable-autoexec --python this.py
Coordinates in this source use the runtime's Y-up / facing -Z convention.
No downloaded meshes, textures, fonts, or generated character images are used.
"""
import bpy, bmesh, math, json, os, sys
from mathutils import Vector
from math import sin, cos, pi, sqrt, exp
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parents[2]
DEST = SITE / 'public/media/creator-room/creator-character-v18.glb'
DEST.parent.mkdir(parents=True, exist_ok=True)
FAST = '--face-only' in sys.argv
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def V(p): return Vector((p[0], -p[2], p[1]))
def semantic(p): return Vector((p[0], p[2], -p[1]))
def mat(name, color, rough=.76, metal=0):
    color=tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in color)
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*color,1)
    b.inputs['Roughness'].default_value=rough; b.inputs['Metallic'].default_value=metal
    b.inputs['Specular IOR Level'].default_value=.22
    return m
skin=mat('warm biscuit clay',(0.76,.56,.40),.79)
ear_inner=mat('warm ear relief',(.47,.235,.16),.82)
navy=mat('ink blue cardigan',(.046,.078,.135),.9)
knit=mat('raised knit seams',(.066,.105,.17),.9)
cream=mat('oatmeal cotton',(.66,.59,.45),.94)
pants=mat('charcoal olive trousers',(.115,.135,.13),.92)
shoe=mat('tobacco suede',(.13,.075,.048),.92)
sole=mat('rubber outsole',(.036,.041,.045),.97)
hair=mat('sculpted espresso hair',(.16,.105,.075),.81)
hair_relief=mat('hair planes',(.19,.13,.09),.84)
browmat=mat('brows',(.19,.115,.075),.88)
beardmat=mat('soft clay beard',(.36,.245,.16),.94)
eye_white=mat('warm eye whites',(.77,.72,.60),.55)
iris=mat('hazel iris',(.24,.135,.06),.83)
pupil=mat('deep pupil',(.035,.026,.021),.88)
lip=mat('warm muted lips',(.43,.215,.145),.79)
mouthmat=mat('mouth inset',(.115,.035,.026),.96)
frame=mat('umber titanium glasses',(.045,.037,.031),.39,.2)
lens=mat('clear optical lenses',(.48,.65,.66),.14)
bs=lens.node_tree.nodes.get('Principled BSDF'); bs.inputs['Alpha'].default_value=.07
lens.surface_render_method='DITHERED'; lens.diffuse_color=(.48,.65,.66,.07)
all_mesh=[]; weights={}; morphs=[]

def mesh(name,verts,faces,material):
    m=bpy.data.meshes.new(name); m.from_pydata([V(v) for v in verts],[],faces); m.update()
    bm=bmesh.new();bm.from_mesh(m);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(m);bm.free()
    ob=bpy.data.objects.new(name,m); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material)
    for p in m.polygons:p.use_smooth=True
    all_mesh.append(ob); return ob
def uv(name,center,radii,material,seg=28,rings=18):
    verts=[];faces=[]
    for j in range(rings+1):
        a=pi*j/rings
        for i in range(seg):
            b=2*pi*i/seg
            verts.append((center[0]+radii[0]*sin(a)*cos(b),center[1]+radii[1]*cos(a),center[2]+radii[2]*sin(a)*sin(b)))
    for j in range(rings):
        for i in range(seg):
            n=j*seg+i; k=j*seg+(i+1)%seg
            faces.append((n,k,k+seg,n+seg))
    return mesh(name,verts,faces,material)
def loft(name,centers,rx,rz,material,seg=24,frame_axis=None):
    centers=[Vector(x) for x in centers]; vs=[];fs=[];previous=None
    for j,c in enumerate(centers):
        t=(centers[min(j+1,len(centers)-1)]-centers[max(0,j-1)]).normalized()
        a=previous.copy() if previous is not None else Vector(frame_axis or (1,0,0))
        a=(a-t*a.dot(t))
        if a.length<1e-5:a=t.cross(Vector((0,0,1)))
        a.normalize();previous=a.copy()
        b=t.cross(a).normalized()
        for i in range(seg):
            q=c+a*rx[j]*cos(i*2*pi/seg)+b*rz[j]*sin(i*2*pi/seg); vs.append(tuple(q))
    for j in range(len(centers)-1):
        for i in range(seg):
            n=j*seg+i; k=j*seg+(i+1)%seg;fs.append((n,k,k+seg,n+seg))
    fs.append(tuple(range(seg-1,-1,-1)));fs.append(tuple((len(centers)-1)*seg+i for i in range(seg)))
    return mesh(name,vs,fs,material)
def tube(name,path,radius,material,seg=10):
    rs=radius if isinstance(radius,list) else [radius]*len(path)
    return loft(name,path,rs,rs,material,seg, (0,1,0))
def sculpt(parts,name,voxel=.007,smooth=5):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts:ob.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();ob=parts[0];ob.name=name
    for p in parts[1:]:
        if p in all_mesh:all_mesh.remove(p)
    mod=ob.modifiers.new('fused continuous clay volume','REMESH');mod.mode='VOXEL';mod.voxel_size=voxel
    mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=ob.modifiers.new('hand-smoothed volume','SMOOTH');mod.factor=.60;mod.iterations=smooth
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=ob.modifiers.new('runtime topology budget','DECIMATE');mod.ratio=.39
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in ob.data.polygons:p.use_smooth=True
    return ob
def rigid(ob,bone):weights[ob.name]=lambda p,b=bone:{b:1}
def keys(ob,changes):
    ob.shape_key_add(name='Basis')
    for name,fn in changes.items():
        k=ob.shape_key_add(name=name)
        for v,kp in zip(ob.data.vertices,k.data):kp.co=V(fn(semantic(v.co)))
    morphs.append(ob)

# Head: deliberately broad cranium, tapered jaw and shallow facial plane.
hc=(0,1.36,.42)
profiles=[(-.171,.018,.026,-.019),(-.154,.061,.052,-.024),(-.128,.092,.076,-.020),(-.087,.113,.091,-.012),(-.035,.124,.106,0),(.025,.128,.111,.007),(.083,.119,.104,.013),(.129,.092,.084,.018),(.161,.047,.047,.021),(.174,.006,.009,.021)]
head=loft('continuous head sculpt',[(0,hc[1]+y,hc[2]+z) for y,x,d,z in profiles],[x for y,x,d,z in profiles],[d for y,x,d,z in profiles],skin,64)
parts=[head]
parts += [uv('nose bridge',(0,1.365,.319),(.017,.040,.020),skin),uv('rounded nose tip',(0,1.337,.294),(.023,.019,.024),skin),uv('nose wing L',(-.015,1.330,.311),(.014,.011,.014),skin),uv('nose wing R',(.015,1.330,.311),(.014,.011,.014),skin)]
head=sculpt(parts,'Creator face • continuous topology',.0048,5);rigid(head,'head')
def cheek_key(p):
    g=exp(-((abs(p.x)-.075)/.038)**2-((p.y-1.312)/.035)**2-((p.z-.335)/.045)**2)
    return (p.x,p.y+.009*g,p.z-.002*g)
keys(head,{'CheekRaise':cheek_key})

# Sculptural ears have a continuous silhouette and a recessed concha.
for s,side in [(-1,'L'),(1,'R')]:
    ear=uv('ear '+side,(s*.129,1.358,.432),(.023,.043,.026),skin,28,24);rigid(ear,'head')
    inner=uv('ear concha '+side,(s*.146,1.359,.420),(.007,.025,.014),ear_inner,20,16);rigid(inner,'head')
    anti=tube('ear antihelix '+side,[(s*.148,1.337,.422),(s*.151,1.351,.414),(s*.150,1.370,.416),(s*.146,1.378,.424)],.004,skin);rigid(anti,'head')

# Actual eyes, iris and pupil. Gaze is a bone rotation, blink is eyelid geometry.
eye_specs=[]
for s,side in [(-1,'L'),(1,'R')]:
    ec=(s*.060,1.382,.323);eye_specs.append((s,side,ec))
    eye=uv('eyeball '+side,ec,(.027,.024,.025),eye_white,32,24);rigid(eye,'eye.'+side)
    ir=uv('iris '+side,(ec[0],ec[1],ec[2]-.024),(.0128,.013,.0026),iris,28,18);rigid(ir,'eye.'+side)
    pu=uv('pupil '+side,(ec[0],ec[1],ec[2]-.0261),(.0062,.007,.0015),pupil,24,16);rigid(pu,'eye.'+side)
    for upper in [True,False]:
        vs=[];fs=[];N=40;M=10
        def lid_point(i,j,closed=False,back=False,wide=False):
            u=-1+2*i/N;v=j/M; ar=sqrt(max(0,1-u*u));x=ec[0]+u*(.0255+.010*v)
            inner=ec[1]+((.012 if upper else -.009)*ar)
            if wide:inner=ec[1]+((.018 if upper else -.013)*ar)
            if closed:inner=ec[1]-.001*ar
            outer=ec[1]+((.036 if upper else -.029)*ar)
            y=inner*(1-v)+outer*v
            dx=(x-ec[0])/.027;dy=(inner-ec[1])/.024
            zi=ec[2]-.025*sqrt(max(.06,1-dx*dx-dy*dy))-.0055
            z=zi*(1-v)+(.315+.009*abs(u))*v
            # A lid is a spherical envelope, not a chord through the eyeball.
            # Include the shallow iris/pupil relief so a fully closed lid really
            # occludes it while the eyeball retains its original volume.
            for cx,cy,cz,rx,ry,rz in [(ec[0],ec[1],ec[2],.027,.024,.025),(ec[0],ec[1],ec[2]-.024,.0128,.013,.0026),(ec[0],ec[1],ec[2]-.0261,.0062,.007,.0015)]:
                r=1-((x-cx)/rx)**2-((y-cy)/ry)**2
                if r>=0:z=min(z,cz-rz*sqrt(r)-.0035)
            return (x,y,z+(.0035 if back else 0))
        for back in [False,True]:
            for j in range(M+1):
                for i in range(N+1):vs.append(lid_point(i,j,False,back))
        size=(M+1)*(N+1)
        for j in range(M):
            for i in range(N):
                n=j*(N+1)+i;fs.extend([(n,n+1,n+N+2,n+N+1),(size+n+N+1,size+n+N+2,size+n+1,size+n)])
        border=list(range(N+1))+[j*(N+1)+N for j in range(1,M+1)]+[M*(N+1)+i for i in range(N-1,-1,-1)]+[j*(N+1) for j in range(M-1,0,-1)]
        for a,b in zip(border,border[1:]+border[:1]):fs.append((a,a+size,b+size,b))
        ob=mesh(('upper' if upper else 'lower')+' eyelid '+side,vs,fs,skin);rigid(ob,'head')
        ob.shape_key_add(name='Basis');k=ob.shape_key_add(name='Blink_'+side)
        for idx,kp in enumerate(k.data):
            back=idx>=size;q=idx%size;j=q//(N+1);i=q%(N+1);kp.co=V(lid_point(i,j,True,back))
        k=ob.shape_key_add(name='EyeWide')
        for idx,kp in enumerate(k.data):
            back=idx>=size;q=idx%size;j=q//(N+1);i=q%(N+1);kp.co=V(lid_point(i,j,False,back,True))
        morphs.append(ob)
    brow=tube('brow clay '+side,[(s*.020,1.428,.310),(s*.038,1.440,.301),(s*.064,1.444,.302),(s*.087,1.437,.312),(s*.100,1.427,.322)],[.0045,.007,.0072,.0055,.0025],browmat,12);rigid(brow,'head')
    keys(brow,{'Brow_'+side:lambda p,s=s:(p.x,p.y+.012*(1-.45*min(1,abs(p.x)/.105)),p.z-.001)})

# A recessed mouth with volumetric upper and lower lips, expressive corners.
for upper in [True,False]:
    path=[];rad=[]
    for i in range(25):
        u=-1+2*i/24;arc=1-u*u
        x=.046*u;y=1.283+(.002*arc if upper else -.0035*arc)
        if upper:y+=.0018*cos(u*pi*2)*arc
        z=.310+.014*u*u
        path.append((x,y,z));rad.append((.001+.0023*arc) if upper else (.001+.003*arc))
    ob=tube(('upper' if upper else 'lower')+' lip',path,rad,lip,12);rigid(ob,'head')
    def smile_fn(p):
        f=min(1,abs(p.x)/.046);return(p.x*1.06,p.y+.012*f*f,p.z-.001)
    def open_fn(p,upper=upper):
        a=max(0,1-(p.x/.05)**2);return(p.x,p.y+(.006 if upper else -.014)*a,p.z-.003*a)
    keys(ob,{'Smile':smile_fn,'MouthOpen':open_fn})
vs=[];fs=[]
for j in range(9):
    a=pi*j/8
    for i in range(33):
        u=-1+2*i/32;f=sqrt(max(0,1-u*u));vs.append((u*.0475,1.282+.0016*cos(a)*f,.315+.018*u*u))
for j in range(8):
    for i in range(32):n=j*33+i;fs.append((n,n+1,n+34,n+33))
inside=mesh('mouth inner opening',vs,fs,mouthmat);rigid(inside,'head')
def mouth_open(p):
    a=max(0,1-(p.x/.0475)**2);f=sqrt(a)
    c=(p.y-1.282)/(.0016*f) if f>.0001 else 0
    return(p.x,1.283-.005*a+(.016*a+.0035*f)*c,p.z-.0035)
keys(inside,{'Smile':lambda p:(p.x*1.06,p.y+.012*(abs(p.x)/.046)**2,p.z-.001),'MouthOpen':mouth_open})

# Adult jaw beard: a shallow, authored jaw shell; moustache follows upper lip.
vs=[];fs=[]
for j in range(8):
    v=j/7
    for i in range(41):
        a=-1.22+2.44*i/40;x=sin(a)*(.095-.022*v)
        y=1.298-.075*v+.017*abs(sin(a));z=.413-cos(a)*(.079-.009*v)-.004
        vs.append((x,y,z))
for j in range(7):
    for i in range(40):n=j*41+i;fs.append((n,n+1,n+42,n+41))
# Beard is kept as a subtle jaw silhouette, not two protruding moustache pieces.
bd=mesh('soft sculpted beard boundary',vs,fs,beardmat);rigid(bd,'head')

# Broad swept hair locks, merged into one sculpt; no floating wire hairs.
vs=[];fs=[];N=64;M=18
for j in range(M+1):
    t=j/M
    for i in range(N):
        a=2*pi*i/N;front=max(0,-sin(a))
        bottom=1.344+.122*front+.007*cos(a*2)
        y=bottom+(1.548-bottom)*t
        r=sqrt(max(.0008,1-t*t))
        vs.append((.136*r*cos(a),y,.441+.124*r*sin(a)))
for j in range(M):
    for i in range(N):n=j*N+i;k=j*N+(i+1)%N;fs.append((n,k,k+N,n+N))
fs.append(tuple(M*N+i for i in range(N)))
fs.append(tuple(i for i in range(N-1,-1,-1)))
cap=mesh('hair base sculpt',vs,fs,hair);locks=[cap]
for n in range(3):
    z=n*.027
    locks.append(loft('diagonal swept quiff',[(.109,1.463-.004*n,.354+z),(.063,1.514-.003*n,.327+z),(-.009,1.552-.008*n,.344+z),(-.082,1.535-.012*n,.383+z),(-.122,1.472-.012*n,.423+z)],[.005,.022,.031,.025,.004],[.006,.025,.025,.023,.005],hair,24,(0,1,0)))
for s in [-1,1]:
    locks.append(loft('integrated temple hair',[(s*.126,1.458,.415),(s*.129,1.405,.419),(s*.117,1.361,.419)],[.018,.014,.004],[.023,.019,.005],hair,18))
hp=sculpt(locks,'single sculpted swept hairstyle',.0058,6);rigid(hp,'head')

# Round glasses, articulated bridge and temples, no opaque rectangular lenses.
for s,side,ec in eye_specs:
    path=[]
    for i in range(65):
        a=2*pi*i/64;path.append((ec[0]+.038*cos(a),1.382+.034*sin(a),.287+.003*cos(a)))
    ob=tube('round glasses rim '+side,path,.0027,frame,8);rigid(ob,'head')
    # Open optical aperture: no translucent overlay to bleach expressive eyes.
    ob=tube('glasses temple '+side,[(s*.098,1.394,.291),(s*.119,1.396,.337),(s*.141,1.392,.409),(s*.140,1.374,.438)],.0024,frame,8);rigid(ob,'head')
bridge=tube('arched glasses bridge',[(-.022,1.389,.287),(-.014,1.398,.280),(0,1.401,.278),(.014,1.398,.280),(.022,1.389,.287)],.0023,frame,8);rigid(bridge,'head')

if not FAST:
    # Neck and shirt are one smooth shoulder/trapezius volume, short visible neck.
    neckparts=[loft('shirt chest',[(0,.68,.50),(0,.82,.49),(0,.96,.47),(0,1.055,.445),(0,1.13,.425)],[.12,.13,.13,.10,.066],[.06,.07,.07,.065,.055],cream,32),loft('neck skin',[(0,1.095,.44),(0,1.128,.43),(0,1.167,.425),(0,1.215,.42)],[.078,.061,.052,.055],[.066,.055,.050,.052],skin,32)]
    # Keep shirt distinct material but contiguous shoulders beneath cardigan.
    shirt=neckparts[0];neck=neckparts[1]
    weights[neck.name]=lambda p:{'neck':1-max(0,min(1,(p.y-1.16)/.045)),'head':max(0,min(1,(p.y-1.16)/.045))}
    weights[shirt.name]=lambda p:{'spine':max(0,min(1,(.98-p.y)/.23)),'chest':max(0,min(1,(p.y-.75)/.23))}
    torsoc=[(0,.65,.50),(0,.73,.50),(0,.86,.48),(0,.98,.455),(0,1.055,.45),(0,1.105,.44),(0,1.132,.431)]
    tx=[.166,.191,.212,.240,.191,.115,.084];tz=[.12,.133,.14,.143,.115,.083,.069]
    torso=loft('cardigan torso',torsoc,tx,tz,navy,48)
    garment=[torso]
    arm_points={}
    for s,side in [(-1,'L'),(1,'R')]:
        shoulder=(s*.225,1.035,.448);elbow=(s*.318,.902,.234);wrist=(s*.183,.848,.045)
        arm_points[side]=(shoulder,elbow,wrist)
        path=[(s*.155,1.018,.451),shoulder,(s*.277,.987,.364),elbow,(s*.273,.862,.139),(s*.202,.850,.066)]
        garment.append(loft('sleeve '+side,path,[.080,.086,.075,.068,.059,.053],[.075,.077,.067,.061,.053,.046],navy,28,(0,0,1)))
    cardigan=sculpt(garment,'continuous cardigan shoulders and bent sleeves',.0085,6)
    # An inlaid shirt panel follows the same continuous chest. No destructive
    # boolean crossing the shoulder union, and no thin broken collar faces.
    def front_point(y,u):
        k=next((i for i in range(len(torsoc)-1) if torsoc[i][1]<=y<=torsoc[i+1][1]),len(torsoc)-2)
        a=(y-torsoc[k][1])/(torsoc[k+1][1]-torsoc[k][1]);a=max(0,min(1,a))
        rx=tx[k]*(1-a)+tx[k+1]*a;d=tz[k]*(1-a)+tz[k+1]*a;zc=torsoc[k][2]*(1-a)+torsoc[k+1][2]*a
        w=.070+.021*sin(pi*max(0,min(1,(y-.68)/.452)));x=u*w
        return(x,y,zc-d*sqrt(max(.01,1-(x/rx)**2))-.005)
    vs=[];fs=[]
    for j in range(25):
        for i in range(17):vs.append(front_point(.68+.452*j/24,-1+2*i/16))
    for j in range(24):
        for i in range(16):n=j*17+i;fs.append((n,n+17,n+18,n+1))
    panel=mesh('cream crewneck inlaid front',vs,fs,cream)
    def segdist(p,a,b):
        a=Vector(a);b=Vector(b);t=max(0,min(1,(p-a).dot(b-a)/(b-a).length_squared));return (p-(a+(b-a)*t)).length,t
    def body_weight(p):
        candidates=[]
        for side,(sh,el,wr) in arm_points.items():
            a,t=segdist(p,sh,el);b,u=segdist(p,el,wr)
            candidates += [('upper_arm.'+side,a),('forearm.'+side,b)]
        torso_dist=max(0,abs(p.x)-.12)+max(0,.74-p.y)
        candidates += [('spine',torso_dist+abs(p.y-.82)*.30),('chest',torso_dist+abs(p.y-.99)*.30)]
        # Anatomical ownership prevents opposite-sleeve contamination.
        candidates=[(n,d) for n,d in candidates if not (n.endswith('.L') and p.x>.025) and not(n.endswith('.R') and p.x<-.025)]
        candidates.sort(key=lambda k:k[1]);best=candidates[:3]
        vals={n:exp(-d*38) for n,d in best};tot=sum(vals.values());return {n:v/tot for n,v in vals.items()}
    weights[cardigan.name]=body_weight
    weights[panel.name]=lambda p:{'spine':max(0,min(1,(1.0-p.y)/.24)),'chest':max(0,min(1,(p.y-.76)/.24))}
    for s,side in [(-1,'L'),(1,'R')]:
        edge=tube('cardigan front binding '+side,[front_point(.68+.452*j/12,s) for j in range(13)],.006,knit,12)
        weights[edge.name]=lambda p:{'chest':max(0,min(1,(p.y-.76)/.24)),'spine':max(0,min(1,(1.0-p.y)/.24))}
        cuff=tube('soft cuff rim '+side,[(s*.248,.880,.088),(s*.215,.886,.061),(s*.180,.868,.060),(s*.170,.832,.078),(s*.200,.812,.100),(s*.235,.833,.112),(s*.248,.880,.088)],.008,knit,10);rigid(cuff,'forearm.'+side)
    ob=tube('cream crewneck rolled edge',[(.070*cos(i*2*pi/48),1.134,.431+.068*sin(i*2*pi/48)) for i in range(49)],.006,cream,10);rigid(ob,'chest')
    # Seated trousers: pelvis + bent legs form one continuous garment.
    trou=[uv('trouser pelvis',(0,.59,.51),(.185,.145,.143),pants,32,24)]
    for s in [-1,1]:
        trou.append(loft('bent trouser leg',[(s*.105,.58,.51),(s*.123,.565,.35),(s*.129,.53,.14),(s*.135,.49,.095),(s*.141,.32,.085),(s*.145,.12,.08)],[.100,.097,.084,.078,.065,.054],[.105,.095,.080,.073,.059,.047],pants,28,(1,0,0)))
    tr=sculpt(trou,'continuous seated trousers',.009,5)
    def leg_weights(p):
        side='L' if p.x<0 else 'R'
        if p.y>.55 and p.z>.38:return {'pelvis':1}
        if p.y>.48:
            q=max(0,min(1,(p.z-.12)/.24));return {'thigh.'+side:1-q*.35,'pelvis':q*.35}
        q=max(0,min(1,(p.y-.40)/.10));return {'shin.'+side:1-q,'thigh.'+side:q}
    weights[tr.name]=leg_weights
    for s,side in [(-1,'L'),(1,'R')]:
        ob=sculpt([uv('loafer upper',(s*.15,.083,.012),(.066,.046,.13),shoe,28,20),uv('loafer instep',(s*.15,.11,.06),(.058,.058,.067),shoe,24,18)],'clay suede loafer '+side,.006,3);rigid(ob,'foot.'+side)
        so=uv('shoe sole '+side,(s*.15,.042,.002),(.069,.015,.132),sole,28,16);rigid(so,'foot.'+side)
    # Hands are fused palms, thumb-webs and tapering finger lofts, with smooth skin.
    finger_paths={}
    for s,side in [(-1,'L'),(1,'R')]:
        base=(s*.183,.847,.041)
        palm=uv('palm sculpt '+side,(s*.178,.846,.009),(.048,.021,.050),skin,32,22)
        hp=[palm,loft('wrist blend',[base,(s*.177,.846,.006)],[.040,.042],[.022,.023],skin,24,(1,0,0))]
        fingers=[]
        for k,offset in enumerate([-.030,-.010,.011,.031]):
            x=s*(.177+offset);length=[.069,.078,.074,.058][k]
            path=[(x,.848,-.016),(x+s*.002,.846,-.042),(x+s*.003,.837,-.042-length*.43),(x+s*.004,.824,-.042-length*.80)]
            r=[.0105,.010,.0085,.0055] if k<3 else [.009,.0085,.007,.0045]
            hp.append(loft('finger sculpt',path,r,[v*.85 for v in r],skin,16,(1,0,0)))
            fingers.append(path)
        tp=[(s*.142,.845,.027),(s*.125,.846,.004),(s*.117,.835,-.023),(s*.116,.823,-.039)]
        hp.append(loft('thumb web',tp,[.021,.016,.012,.007],[.018,.013,.011,.006],skin,18,(1,0,0)))
        hand=sculpt(hp,'continuous sculpted hand '+side,.0033,4)
        finger_paths[side]=[tp]+fingers
        def hw(p,side=side,fp=[tp]+fingers):
            if p.z>.005 and abs(p.x)>.14:return {'hand.'+side:1}
            ds=[]
            for fi,path in enumerate(fp):
                for bi in range(2):
                    a=path[bi+1] if fi else path[bi];b=path[bi+2] if fi else path[bi+1]
                    d,t=segdist(p,a,b);ds.append((f'finger{fi}_{bi+1}.{side}',d))
            ds.sort(key=lambda x:x[1]);bn,d=ds[0]
            f=max(0,min(1,(-p.z+.014)/.045)) if int(bn[6]) else max(0,min(1,(.145-abs(p.x))/.025))
            return {bn:f,'hand.'+side:1-f}
        weights[hand.name]=hw
        # Sculpted fingertips remain one skin surface; no detached nail caps.

# Rest skeleton. All lengths remain constant at runtime.
arm=bpy.data.armatures.new('Creator rig');rig=bpy.data.objects.new('CreatorRig',arm);bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
bone_specs={}
def bone(name,a,b,parent=None):
    bo=arm.edit_bones.new(name);bo.head=V(a);bo.tail=V(b)
    if parent:bo.parent=arm.edit_bones[parent]
    bone_specs[name]={'head':list(a),'tail':list(b),'parent':parent};return bo
bone('pelvis',(0,.57,.50),(0,.73,.49))
bone('spine',(0,.73,.49),(0,.91,.46),'pelvis')
bone('chest',(0,.91,.46),(0,1.075,.45),'spine')
bone('neck',(0,1.075,.45),(0,1.19,.425),'chest')
bone('head',(0,1.19,.425),(0,1.48,.425),'neck')
for s,side,ec in eye_specs:bone('eye.'+side,ec,(ec[0],ec[1],ec[2]-.03),'head')
if not FAST:
    for s,side in [(-1,'L'),(1,'R')]:
        sh,el,wr=arm_points[side]
        bone('clavicle.'+side,(s*.05,1.04,.45),sh,'chest')
        bone('upper_arm.'+side,sh,el,'clavicle.'+side)
        bone('forearm.'+side,el,wr,'upper_arm.'+side)
        bone('hand.'+side,wr,(s*.177,.846,-.038),'forearm.'+side)
        for fi,path in enumerate(finger_paths[side]):
            a,b,c=(path[0],path[1],path[2]) if fi==0 else (path[1],path[2],path[3])
            bone(f'finger{fi}_1.{side}',a,b,'hand.'+side)
            bone(f'finger{fi}_2.{side}',b,c,f'finger{fi}_1.{side}')
        bone('thigh.'+side,(s*.105,.58,.51),(s*.135,.49,.095),'pelvis')
        bone('shin.'+side,(s*.135,.49,.095),(s*.145,.12,.08),'thigh.'+side)
        bone('foot.'+side,(s*.145,.12,.08),(s*.15,.06,-.09),'shin.'+side)
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
for ob in all_mesh:
    if ob.name not in weights:raise RuntimeError('No skin ownership '+ob.name)
    for name in bone_specs:ob.vertex_groups.new(name=name)
    fn=weights[ob.name]
    for vert in ob.data.vertices:
        vals=fn(semantic(vert.co));tot=sum(vals.values()) or 1
        for name,w in vals.items():
            if w>1e-5:ob.vertex_groups[name].add([vert.index],w/tot,'REPLACE')
    mod=ob.modifiers.new('fixed-length anatomical rig','ARMATURE');mod.object=rig;ob.parent=rig

# Render studio, intentionally not exported. Face expressions use the same rig/morphs.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=900;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.color=(.08,.08,.08);scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.045,.065,.095,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
scene.view_settings.view_transform='AgX'
def light(name,loc,color,power,size):
    da=bpy.data.lights.new(name,'AREA');da.energy=power;da.color=color;da.shape='DISK';da.size=size
    ob=bpy.data.objects.new(name,da);bpy.context.collection.objects.link(ob);ob.location=V(loc)
    ob.rotation_euler=(V((0,1.3,.35))-ob.location).to_track_quat('-Z','Y').to_euler()
light('large warm key',(-1,2.25,-1.05),(1,.78,.54),95,1.4)
light('cool screen bounce',(.8,1.6,-.75),(.43,.73,1),60,1.2)
light('soft cyan rim',(-.7,1.8,1.1),(.34,.75,.86),100,1.1)
camera_data=bpy.data.cameras.new('expression portrait camera');camera=bpy.data.objects.new('expression portrait camera',camera_data);bpy.context.collection.objects.link(camera)
camera.location=V((-.62,1.51,-.82));target=V((0,1.38,.39));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=.58;scene.camera=camera

def expression(values):
    for ob in morphs:
        for k in ob.data.shape_keys.key_blocks:
            if k.name!='Basis':k.value=values.get(k.name,0)
    rig.pose.bones['head'].rotation_mode='XYZ';rig.pose.bones['head'].rotation_euler=(0,0,0)
expressions={
 '01-neutral':{'Smile':.10,'CheekRaise':.05},
 '02-thinking':{'Blink_L':.22,'Blink_R':.12,'Brow_L':.75,'Brow_R':.12,'Smile':.06},
 '03-smile':{'Smile':.82,'CheekRaise':.72,'Blink_L':.12,'Blink_R':.12,'Brow_L':.12,'Brow_R':.12},
 '04-surprise':{'MouthOpen':.85,'EyeWide':.85,'Brow_L':.95,'Brow_R':.90,'CheekRaise':.08},
}
expression(expressions['01-neutral'])
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'creator-character-v18.blend'))
if not FAST:
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
    for ob in all_mesh:ob.select_set(True)
    # Neutral export basis: runtime owns all expression values.
    expression({})
    bpy.ops.export_scene.gltf(filepath=str(DEST),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=False,export_skins=True,export_morph=True,export_morph_normal=True,export_materials='EXPORT')
triangles=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in all_mesh)
manifest={'source':'original procedural Blender sculpt; no external character assets','units':'meters','runtimeAxes':'Y up, faces -Z','triangles':triangles,'meshCount':len(all_mesh),'meshes':{ob.name:sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in all_mesh},'bones':bone_specs,'morphs':{ob.name:[k.name for k in ob.data.shape_keys.key_blocks if k.name!='Basis'] for ob in morphs},'glb':str(DEST) if not FAST else None,'expressions':expressions}
(HERE/'character-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print('CHARACTER_TRIANGLES',triangles,flush=True)
for name,values in expressions.items():
    expression(values);scene.render.filepath=str(HERE/(name+'.png'));bpy.ops.render.render(write_still=True)
expression({'Blink_L':1,'Blink_R':1,'Smile':.08})
scene.render.filepath=str(HERE/'07-blink-closed.png');bpy.ops.render.render(write_still=True)
if not FAST:
    expression(expressions['01-neutral'])
    scene.render.resolution_x=1000;scene.render.resolution_y=1100
    camera.location=V((-.86,1.36,-1.43));target=V((0,.82,.30))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.ortho_scale=1.78
    scene.render.filepath=str(HERE/'05-seated-body.png');bpy.ops.render.render(write_still=True)
    camera.location=V((-.63,1.32,-.50));target=V((0,.88,.06))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.ortho_scale=.78
    scene.render.filepath=str(HERE/'06-hands.png');bpy.ops.render.render(write_still=True)
print('CHARACTER_DONE',flush=True)
