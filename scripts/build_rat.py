import bpy
import math
import numpy as np
import random
from mathutils import Matrix, Vector
from pathlib import Path


BASE = Path(__file__).resolve().parent.parent
(BASE / 'scenes').mkdir(exist_ok=True)
(BASE / 'previews').mkdir(exist_ok=True)
(BASE / 'assets' / '3d').mkdir(parents=True, exist_ok=True)
(BASE / 'assets' / '3d' / 'textures').mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def save_image(name, rgba):
    h, w, _ = rgba.shape
    image = bpy.data.images.new(name, width=w, height=h, alpha=True)
    image.pixels.foreach_set(rgba.astype(np.float32).ravel())
    image.filepath_raw = str(BASE / 'assets' / '3d' / 'textures' / f'{name}.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image


def rgba(rgb):
    return np.concatenate((rgb, np.ones((*rgb.shape[:2], 1), dtype=np.float32)), axis=2)


size = 512
rng = np.random.default_rng(2095)
noise = rng.standard_normal((size, size)).astype(np.float32)
fiber = sum(np.roll(noise, d, axis=0) for d in range(-10, 11)) / 21
fiber = (fiber - fiber.mean()) / fiber.std()
cloud = np.repeat(np.repeat(rng.standard_normal((64, 64)), 8, axis=0), 8, axis=1)
cloud = sum(np.roll(cloud, d, axis=0) for d in range(-3, 4)) / 7
tone = np.clip(1 + 0.055 * fiber + 0.024 * cloud, 0.78, 1.16)
fur_rgb = np.clip(tone[..., None] * np.array((0.77, 0.685, 0.58), dtype=np.float32), 0, 1)
fur_color = save_image('rat_fur_color', rgba(fur_rgb))
gradient_v, gradient_u = np.gradient(fiber)
normal_rgb = np.stack((0.5 - 0.025 * gradient_u, 0.5 - 0.015 * gradient_v,
                       np.full_like(fiber, 0.98)), axis=2)
fur_normal = save_image('rat_fur_normal', rgba(np.clip(normal_rgb, 0, 1)))
rough = np.clip(0.82 + 0.045 * fiber, 0.68, 0.96)
fur_roughness = save_image('rat_fur_roughness', rgba(np.repeat(rough[..., None], 3, axis=2)))
v = np.linspace(0, 1, size, endpoint=False, dtype=np.float32)[:, None]
u = np.linspace(0, 1, size, endpoint=False, dtype=np.float32)[None, :]
rings = np.power((np.cos(2 * math.pi * 62 * v) + 1) / 2, 10)
tail_noise = rng.standard_normal((size, size)).astype(np.float32)
tail_tone = np.clip(0.96 - 0.105 * rings + 0.025 * tail_noise, 0.75, 1.04)
tail_rgb = tail_tone[..., None] * np.array((0.74, 0.48, 0.46), dtype=np.float32)
tail_color = save_image('rat_tail_scales', rgba(np.clip(tail_rgb, 0, 1)))


def material(name, color, roughness=0.8, metallic=0, subsurface=0,
             color_image=None, normal_image=None, rough_image=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = roughness
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Subsurface Weight'].default_value = subsurface
    if color_image:
        image_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        image_node.image = color_image
        mat.node_tree.links.new(image_node.outputs['Color'], node.inputs['Base Color'])
    if normal_image:
        image_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        image_node.image = normal_image
        image_node.image.colorspace_settings.name = 'Non-Color'
        normal_node = mat.node_tree.nodes.new('ShaderNodeNormalMap')
        normal_node.inputs['Strength'].default_value = 0.19
        mat.node_tree.links.new(image_node.outputs['Color'], normal_node.inputs['Color'])
        mat.node_tree.links.new(normal_node.outputs['Normal'], node.inputs['Normal'])
    if rough_image:
        image_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        image_node.image = rough_image
        image_node.image.colorspace_settings.name = 'Non-Color'
        mat.node_tree.links.new(image_node.outputs['Color'], node.inputs['Roughness'])
    return mat


cream = material('CreamFur', (0.77, 0.685, 0.58), 0.87, subsurface=0.04,
                 color_image=fur_color, normal_image=fur_normal, rough_image=fur_roughness)
hood = material('HoodFur', (0.77, 0.685, 0.58), 0.87, subsurface=0.04,
                color_image=fur_color, normal_image=fur_normal, rough_image=fur_roughness)
belly = material('WarmIvory', (0.83, 0.77, 0.68), 0.92, subsurface=0.05)
pink = material('EarPink', (0.67, 0.42, 0.43), 0.75, subsurface=0.09)
inner = material('EarInterior', (0.52, 0.30, 0.33), 0.8, subsurface=0.12)
paw = material('PawPink', (0.68, 0.46, 0.43), 0.83, subsurface=0.06)
claw = material('ClawIvory', (0.87, 0.79, 0.69), 0.53)
nostril = material('Nostril', (0.22, 0.10, 0.10), 0.91)
mouth = material('MouthLine', (0.38, 0.24, 0.23), 0.92)
tailmat = material('TailPink', (0.74, 0.48, 0.46), 0.81, subsurface=0.04,
                   color_image=tail_color)
nosemat = material('NosePink', (0.78, 0.43, 0.43), 0.53, subsurface=0.08)
eye = material('GlassEye', (0.018, 0.012, 0.015), 0.09)
shine = material('EyeGlint', (1, 0.96, 0.87), 0.15)
whisker = material('Whisker', (0.86, 0.78, 0.68), 0.5)


def parent(obj, p):
    obj.parent = p
    return obj


def joint(name, location, p=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_size = 0.045
    obj.location = location
    if p:
        obj.parent = p
    return obj


root = joint('RatRoot', (0, 0, 0))


def smooth(obj, mat, p=None):
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if p:
        parent(obj, p)
    return obj


def ellipsoid(name, location, scale, mat, p):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=(0, 0, 0))
    ob = bpy.context.object
    ob.name = name
    ob.location = location
    ob.scale = scale
    return smooth(ob, mat, p)


def loft(name, stations, mat, p, secondary=None, hood_at=None):
    n = 32
    verts = []
    for z, cy, wx, hy in stations:
        for i in range(n):
            a = 2 * math.pi * i / n
            verts.append((wx * math.cos(a), cy + hy * math.sin(a), z))
    faces = []
    for j in range(len(stations) - 1):
        for i in range(n):
            k = j * n + i
            q = j * n + (i + 1) % n
            faces.append((k, q, q + n, k + n))
    faces.append(tuple(reversed(range(n))))
    faces.append(tuple((len(stations) - 1) * n + i for i in range(n)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='CoatUV')
    for polygon in mesh.polygons:
        angular = {mesh.loops[i].vertex_index % n for i in polygon.loop_indices}
        for loop_id in polygon.loop_indices:
            vertex = mesh.loops[loop_id].vertex_index
            ring = vertex // n
            angle = vertex % n
            u_coord = 1.0 if angle == 0 and n - 1 in angular else angle / n
            uv.data[loop_id].uv = (u_coord, ring / (len(stations) - 1))
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    smooth(ob, mat, p)
    if secondary:
        mesh.materials.append(secondary)
        for f in mesh.polygons[: -2]:
            station = f.index // n
            if station >= hood_at:
                f.material_index = 1
    mod = ob.modifiers.new('Organic surface', 'SUBSURF')
    mod.levels = 2
    mod.render_levels = 2
    return ob


body_stations = [
    (-0.72, 0.34, 0.027, 0.050), (-0.66, 0.36, 0.155, 0.165),
    (-0.57, 0.385, 0.250, 0.240), (-0.46, 0.395, 0.297, 0.277),
    (-0.31, 0.405, 0.305, 0.290), (-0.16, 0.400, 0.284, 0.274),
    (-0.01, 0.407, 0.261, 0.247), (0.14, 0.422, 0.225, 0.219),
    (0.27, 0.451, 0.182, 0.179), (0.39, 0.47, 0.105, 0.105),
    (0.48, 0.47, 0.016, 0.025)
]
body = loft('Body', body_stations, cream, root, hood, 8)

head_j = joint('HeadPivot', (0, 0.48, 0.30), root)
head_j.scale.z = 0.90
head_stations = [
    (-0.17, 0.00, 0.045, 0.065), (-0.11, 0.00, 0.135, 0.130),
    (-0.01, 0.00, 0.186, 0.170), (0.10, -0.020, 0.190, 0.163),
    (0.20, -0.036, 0.178, 0.155), (0.29, -0.050, 0.151, 0.140),
    (0.39, -0.075, 0.110, 0.095), (0.47, -0.102, 0.062, 0.054),
    (0.515, -0.120, 0.028, 0.026)
]
loft('HeadFur', head_stations, hood, head_j)
for side in (-1, 1):
    ellipsoid(f'CheekContour_{side}', (side * 0.085, -0.064, 0.258),
              (0.062, 0.069, 0.103), hood, head_j)
    ellipsoid(f'Eye_{side}', (side * 0.164, 0.023, 0.154),
              (0.027, 0.024, 0.031), eye, head_j)
    ellipsoid(f'EyeGlint_{side}', (side * 0.188, 0.033, 0.166),
              (0.0035, 0.006, 0.005), shine, head_j)
    ellipsoid(f'EyeGlintSmall_{side}', (side * 0.189, 0.014, 0.148),
              (0.0018, 0.003, 0.003), shine, head_j)
ellipsoid('Nose', (0, -0.120, 0.515), (0.036, 0.025, 0.025), nosemat, head_j)


def ear_mesh(name, p, side):
    verts = []
    faces = []
    rings = (0.0, 0.34, 0.68, 0.87, 1.0)
    n = 24
    lateral = Vector((side * 0.52, 0, -0.854))
    facing = Vector((side * 0.854, 0, 0.52))
    for radius in rings:
        for i in range(n):
            a = 2 * math.pi * i / n
            bottom_taper = 0.75 + 0.25 * math.sin(a)
            cup = -0.020 * (1 - radius * radius) + 0.008 * radius**4
            point = (0.075 * bottom_taper * radius * math.cos(a) * lateral
                     + Vector((0, 0.115 * radius * math.sin(a), 0))
                     + cup * facing)
            verts.append(tuple(point))
    for j in range(len(rings) - 1):
        for i in range(n):
            a = j * n + i
            b = j * n + (i + 1) % n
            faces.append((a, b, b + n, a + n))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    smooth(ob, pink, p)
    mesh.materials.append(inner)
    for polygon in mesh.polygons:
        if polygon.index // n < 3:
            polygon.material_index = 1
    solid = ob.modifiers.new('Thin ear rim', 'SOLIDIFY')
    solid.thickness = 0.008
    sub = ob.modifiers.new('Soft ear', 'SUBSURF')
    sub.levels = 1
    return ob


for side in (-1, 1):
    e = joint(f'EarPivot_{"L" if side < 0 else "R"}', (side * 0.16, 0.105, 0.015), head_j)
    ear_mesh(f'EarCup_{side}', e, side)


def tapered_tube(name, points, radii, mat, p, sides=8):
    vertices = []
    faces = []
    for i, point in enumerate(points):
        tangent = Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])
        tangent.normalize()
        basis = tangent.cross(Vector((0, 1, 0))).normalized()
        if basis.length < 0.001:
            basis = tangent.cross(Vector((0, 0, 1))).normalized()
        normal = tangent.cross(basis).normalized()
        for j in range(sides):
            a = math.tau * j / sides
            v = Vector(point) + radii[i] * (math.cos(a) * basis + math.sin(a) * normal)
            vertices.append(v)
    for i in range(len(points) - 1):
        for j in range(sides):
            k = i * sides + j
            q = i * sides + (j + 1) % sides
            faces.append((k, q, q + sides, k + sides))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='TubeUV')
    for polygon in mesh.polygons:
        angular = {mesh.loops[i].vertex_index % sides for i in polygon.loop_indices}
        for loop_id in polygon.loop_indices:
            vertex = mesh.loops[loop_id].vertex_index
            ring = vertex // sides
            angle = vertex % sides
            u_coord = 1.0 if angle == 0 and sides - 1 in angular else angle / sides
            uv.data[loop_id].uv = (u_coord, ring / (len(points) - 1))
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    smooth(ob, mat, p)
    return ob


for side in (-1, 1):
    for kind, z, x in [('Front', 0.25, 0.215), ('Hind', -0.45, 0.245)]:
        key = 'L' if side < 0 else 'R'
        pivot = joint(f'{kind}FootPivot_{key}', (side * x, 0.20, z), root)
        if kind == 'Hind':
            leg_points = [(-side * 0.130, 0.255, 0.028),
                          (-side * 0.095, 0.155, 0.054),
                          (-side * 0.015, 0.035, 0.077),
                          (side * 0.012, -0.052, -0.028),
                          (side * 0.010, -0.105, -0.070),
                          (0, -0.155, 0.045)]
            leg_radii = [0.135, 0.131, 0.099, 0.053, 0.038, 0.028]
        else:
            leg_points = [(-side * 0.132, 0.260, -0.072),
                          (-side * 0.092, 0.145, -0.015),
                          (-side * 0.040, 0.045, 0.070),
                          (-side * 0.019, -0.036, 0.010),
                          (0, -0.111, 0.016),
                          (0, -0.151, 0.066)]
            leg_radii = [0.096, 0.089, 0.068, 0.049, 0.032, 0.027]
        leg = tapered_tube(f'{kind}Leg_{key}', leg_points, leg_radii, cream, pivot, 16)
        limb_subdivision = leg.modifiers.new('Rounded limb', 'SUBSURF')
        limb_subdivision.levels = 2
        limb_subdivision.render_levels = 2
        ellipsoid(f'{kind}Palm_{key}', (0, -0.162, 0.098),
                  (0.052 if kind == 'Hind' else 0.044, 0.022, 0.070), paw, pivot)
        count = 5 if kind == 'Hind' else 4
        for digit in range(count):
            offset = digit - (count - 1) / 2
            dx = offset * (0.025 if kind == 'Hind' else 0.022)
            reach = 0.070 - 0.009 * abs(offset)
            start = (dx * 0.7, -0.170, 0.142)
            knuckle = (dx * 1.18, -0.178, 0.17)
            tip = (dx * 1.48, -0.184, 0.17 + reach)
            tapered_tube(f'{kind}Finger_{key}_{digit}', [start, knuckle, tip],
                         [0.010, 0.008, 0.0035], paw, pivot, 6)
            tapered_tube(f'{kind}Claw_{key}_{digit}',
                         [tip, (tip[0] * 1.08, tip[1] - 0.001, tip[2] + 0.013)],
                         [0.0045, 0.0005], claw, pivot, 5)
        if kind == 'Front':
            tapered_tube(f'Thumb_{key}',
                         [(-side * 0.046, -0.165, 0.115), (-side * 0.075, -0.177, 0.137),
                          (-side * 0.080, -0.182, 0.157)],
                         [0.010, 0.007, 0.0025], paw, pivot, 6)

tail_parent = joint('TailPivot_0', (0, 0.35, -0.655), root)
tail_parent.rotation_euler.x = 0.14
for index in range(5):
    segment = joint(f'TailPivot_{index + 1}', (0, 0, -0.14), tail_parent)
    segment.rotation_euler.x = -0.15 + index * 0.052
    segment.rotation_euler.y = 0.05 - index * 0.006
    tail_parent = segment
tail_points = []
tail_radii = []
for i in range(121):
    t = i / 120
    tail_points.append((0.10 * t * t, 0.045 * math.sin(math.pi * t), -0.86 * t))
    tail_radii.append((0.044 * (1 - t) ** 0.82 + 0.001) *
                      (1 + 0.018 * math.cos(2 * math.pi * 50 * t)))
tapered_tube('TailSkin', tail_points, tail_radii, tailmat, bpy.data.objects['TailPivot_0'], 12)

for side in (-1, 1):
    ellipsoid(f'WhiskerPad_{side}', (side * 0.054, -0.119, 0.390),
              (0.046, 0.027, 0.060), hood, head_j)
    ellipsoid(f'Nostril_{side}', (side * 0.019, -0.121, 0.537),
              (0.004, 0.003, 0.002), nostril, head_j)
    upper_lid = []
    lower_lid = []
    for i in range(9):
        t = i / 8
        arch = math.sin(math.pi * t)
        z = 0.120 + 0.068 * t
        upper_lid.append((side * (0.176 + 0.005 * arch), 0.026 + 0.024 * arch, z))
        lower_lid.append((side * (0.176 + 0.004 * arch), 0.026 - 0.018 * arch, z))
    lid_radii = [0.0007 + 0.0032 * math.sin(math.pi * i / 8) for i in range(9)]
    tapered_tube(f'UpperEyelid_{side}', upper_lid, lid_radii, hood, head_j, 5)
    tapered_tube(f'LowerEyelid_{side}', lower_lid, lid_radii, hood, head_j, 5)
    tapered_tube(f'MouthBranch_{side}',
                 [(0, -0.141, 0.514), (side * 0.020, -0.156, 0.481),
                  (side * 0.042, -0.151, 0.465)], [0.0025, 0.002, 0.0004],
                 mouth, head_j, 5)
    for i in range(9):
        root_z = 0.397 - 0.012 * (i % 3)
        root_y = -0.122 + 0.014 * (i // 3)
        angle = (i - 4) / 4
        start = Vector((side * 0.094, root_y, root_z))
        end = Vector((side * (0.33 + 0.055 * (i % 3)),
                      root_y + 0.065 * angle, root_z + 0.13 * angle - 0.02))
        points = []
        for j in range(5):
            t = j / 4
            point = start.lerp(end, t)
            point.y += 0.026 * math.sin(math.pi * t)
            point.z += 0.028 * math.sin(math.pi * t) * angle
            points.append(tuple(point))
        tapered_tube(f'Whisker_{side}_{i}', points,
                     [0.0020, 0.0017, 0.00125, 0.0007, 0.00012], whisker, head_j, 4)


def fur_tufts(name, stations, p, mat, count, length_range, seed, z_limits):
    prng = random.Random(seed)
    vertices = []
    faces = []
    uv_values = []
    for _ in range(count):
        z = prng.uniform(*z_limits)
        segment = next(i for i in range(len(stations) - 1) if stations[i][0] <= z <= stations[i + 1][0])
        a0 = stations[segment]
        a1 = stations[segment + 1]
        fraction = (z - a0[0]) / (a1[0] - a0[0])
        cy, wx, hy = [a0[k] * (1 - fraction) + a1[k] * fraction for k in (1, 2, 3)]
        angle = prng.uniform(0, math.tau)
        if math.sin(angle) < -0.37:
            continue
        normal = Vector((math.cos(angle) / max(wx, 0.01),
                         math.sin(angle) / max(hy, 0.01), 0)).normalized()
        tangent = Vector((-math.sin(angle), math.cos(angle), 0))
        start = Vector((wx * math.cos(angle), cy + hy * math.sin(angle), z))
        length = prng.uniform(*length_range)
        width = length * prng.uniform(0.032, 0.064)
        lift = length * prng.uniform(0.035, 0.085)
        if z < -0.45:
            lift *= 0.35
        base = start + normal * 0.0015
        middle = base + Vector((0, 0, -length * 0.55)) + normal * (lift * 0.45)
        tip = base + Vector((0, 0, -length)) + normal * lift
        offset = len(vertices)
        vertices.extend((tuple(base - tangent * width), tuple(base + tangent * width),
                         tuple(middle + tangent * width * 0.55), tuple(tip)))
        faces.extend(((offset, offset + 1, offset + 2),
                      (offset, offset + 2, offset + 3)))
        texture_v = (z - stations[0][0]) / (stations[-1][0] - stations[0][0])
        uv_values.extend(((angle / math.tau, texture_v), (angle / math.tau + 0.003, texture_v),
                          (angle / math.tau + 0.002, texture_v - 0.012),
                          (angle / math.tau, texture_v - 0.025)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name='TuftUV')
    for polygon in mesh.polygons:
        for loop_id in polygon.loop_indices:
            uv.data[loop_id].uv = uv_values[mesh.loops[loop_id].vertex_index]
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    mat.use_backface_culling = False
    smooth(ob, mat, p)
    return ob


fur_tufts('BodyCoat', body_stations, root, cream, 3500, (0.014, 0.025), 61, (-0.54, 0.20))
fur_tufts('ShoulderCoat', body_stations, root, hood, 650, (0.012, 0.023), 73, (0.20, 0.39))
fur_tufts('HeadCoat', head_stations, head_j, hood, 1150, (0.007, 0.015), 83, (-0.12, 0.34))

groups = {}
for ob in tuple(bpy.data.objects):
    if ob.type == 'MESH' and ob.parent and len(ob.data.materials) == 1:
        key = (ob.parent.name, ob.data.materials[0].name)
        groups.setdefault(key, []).append(ob)
for (pivot_name, material_name), members in groups.items():
    if len(members) < 2:
        continue
    for ob in members:
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        for modifier in tuple(ob.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in members:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = members[0]
    bpy.ops.object.join()
    members[0].name = f'{pivot_name}_{material_name}'

bpy.context.view_layer.update()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(BASE / 'scenes' / 'rat.blend'))
for ob in root.children_recursive:
    if ob.type != 'MESH' or not ob.modifiers:
        continue
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    for modifier in tuple(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
root.rotation_euler.x = math.pi / 2
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
bpy.context.view_layer.objects.active = root
for ob in root.children_recursive:
    ob.select_set(True)
# Separate files, never a single GLB: embedded images load through blob: URLs, which
# kagerou.glass's img-src policy refuses.
bpy.ops.export_scene.gltf(filepath=str(BASE / 'assets' / '3d' / 'rat.gltf'),
                          export_format='GLTF_SEPARATE', use_selection=True,
                          export_apply=False, export_yup=True)
root.rotation_euler.x = 0
bpy.context.view_layer.update()

bpy.ops.object.select_all(action='DESELECT')
floor = material('PreviewFloor', (0.16, 0.19, 0.20), 0.9)
bpy.ops.mesh.primitive_plane_add(size=1000, location=(0, -0.003, 0))
ob = bpy.context.object
ob.name = 'PreviewFloor'
ob.rotation_euler.x = math.pi / 2
ob.data.materials.append(floor)

world = bpy.context.scene.world
world.color = (0.28, 0.28, 0.28)
def area(name, location, energy, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector((0, 0.35, 0)) - light.location).to_track_quat('-Z', 'Y').to_euler()

area('WarmKey', (-1.5, 2.5, 2.4), 480, 3.0)
area('CoolRim', (1.5, 1.7, -1.0), 260, 2.2)
camera_data = bpy.data.cameras.new('PreviewCamera')
camera = bpy.data.objects.new('PreviewCamera', camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (2.8, 1.48, 0.36)
forward = (Vector((0, 0.42, -0.1)) - camera.location).normalized()
right = forward.cross(Vector((0, 1, 0))).normalized()
up = right.cross(forward).normalized()
camera.rotation_euler = Matrix((right, up, -forward)).transposed().to_quaternion().to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 3.15
bpy.context.scene.camera = camera
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.samples = 24
bpy.context.scene.render.resolution_x = 900
bpy.context.scene.render.resolution_y = 900
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.image_settings.file_format = 'PNG'
bpy.context.scene.render.filepath = str(BASE / 'previews' / 'rat.png')
bpy.ops.render.render(write_still=True)
camera.location = (2.20, 1.53, 2.30)
forward = (Vector((0, 0.41, -0.12)) - camera.location).normalized()
right = forward.cross(Vector((0, 1, 0))).normalized()
up = right.cross(forward).normalized()
camera.rotation_euler = Matrix((right, up, -forward)).transposed().to_quaternion().to_euler()
camera_data.ortho_scale = 2.80
bpy.context.scene.render.filepath = str(BASE / 'previews' / 'rat-three-quarter.png')
bpy.ops.render.render(write_still=True)
