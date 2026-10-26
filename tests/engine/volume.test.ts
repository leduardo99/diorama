import assert from 'node:assert/strict';
import { Polygon } from '../../core/draw/index.js';
import {
  Camera,
  Decal,
  Frame3,
  Round,
  Solid,
  Stage,
  DIRECTION_NAMES,
  directionName,
  facingYaw,
  rampTone,
  visibleArc,
  Grid,
  groundShadow,
  EDGE,
  CORNER,
  edgeMask,
  cornerMask,
  cornerMaskShape,
  drawScene,
  layoutScene,
  createSceneRenderer,
  footprintOf,
  validateScene,
  defineTileSet,
  cellOf,
  defineSceneAsset,
  seamTestScene,
  validateCatalog,
  defineSpace,
  SPACE_PRESETS,
  screenHeight,
  emptyScene,
  pieceHeight,
  heightsOf,
  sceneNavigation,
  defineEffect,
  validateEffects,
  drawEffectFrame,
  type EffectCatalog,
  type EffectContext,
  floorTile,
  masksOf,
  type PieceContext,
  type SceneryCatalog,
  type SceneData,
  ringOnEllipsoid,
  bandOnEllipsoid,
  Blob,
  Tube,
  dot3,
  len3,
  mix3,
  sub3,
  vec3,
  type EllipsoidAxis,
  type Face,
  type Placed,
  type Vec3,
} from '../../core/volume/index.js';

console.log('🧪 Starting @core/volume (2.5D) Test Suite...\n');

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const centroid = (f: Face) => f.points.reduce((s, p) => vec3(s.x + p.x / f.points.length, s.y + p.y / f.points.length, s.z + p.z / f.points.length), vec3(0, 0, 0));

// Camera: projection, depth, visibility and light.
{
  const cam = new Camera({ tilt: 48, heightBoost: 1.2, origin: { x: 10, y: 20 } });
  const t = (48 * Math.PI) / 180;
  const up = cam.project(vec3(0, 0, 10));
  near(up.x, 10);
  near(up.y, 20 - 10 * Math.cos(t) * 1.2);
  const towards = cam.project(vec3(0, 10, 0));
  near(towards.y, 20 + 10 * Math.sin(t));
  assert.ok(cam.depth(vec3(0, 5, 0)) > cam.depth(vec3(0, 0, 0)), 'points towards the camera are in front');
  assert.ok(cam.depth(vec3(0, 0, 5)) > cam.depth(vec3(0, 0, 0)), 'higher points are in front');
  assert.ok(cam.faces(vec3(0, 0, 1)), 'tops are visible');
  assert.ok(cam.faces(vec3(0, 1, 0)), 'faces towards the camera are visible');
  assert.ok(!cam.faces(vec3(0, -1, 0)), 'faces away from the camera are hidden');
  assert.ok(cam.shade(cam.lightDir) > cam.shade(vec3(0, 0, -1)), 'facing the light is brighter than facing the floor');
  near(cam.shade(vec3(0, 0, -1)), cam.light.ambient);
  const moved = cam.at({ x: 0, y: 0 });
  near(moved.project(vec3(3, 0, 0)).x, 3);
  assert.equal(moved.tilt, 48, 'at() keeps the view settings');
  console.log('✔ Camera projection, depth, visibility and light passed.');
}

// Facings: export order starts at S and turns clockwise on screen.
{
  near(facingYaw(0, 8), Math.PI / 2);
  near(facingYaw(2, 8), Math.PI);
  assert.deepEqual(DIRECTION_NAMES[8], ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE']);
  assert.equal(directionName(3, 4), 'E');
  assert.equal(directionName(2, 6), 'D2');
  const f = Frame3.facing(vec3(0, 0, 0), facingYaw(0, 8));
  near(f.forward.y, 1);
  near(f.right.x, -1, 1e-9);
  const p = f.turned(90).forward;
  near(p.x, -1, 1e-9);
  console.log('✔ Facings and frames passed.');
}

// Solids: every face normal points outwards, for convex and concave profiles.
{
  const frame = Frame3.facing(vec3(0, 0, 0), 0.3);
  const box = Solid.box(frame, 10, 6, 4);
  assert.equal(box.faces.length, 6);
  const center = frame.at(0, 0, 2);
  for (const face of box.faces) assert.ok(dot3(face.normal, sub3(centroid(face), center)) > 0, 'box normals point outwards');

  const L = Polygon.fromPoints([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }]);
  const solid = Solid.extrude(Frame3.facing(vec3(0, 0, 0), 0), L, 3);
  assert.equal(solid.faces.length, 8);
  // Each side face's normal points out of the profile: a probe just outside its edge midpoint lies outside the L.
  const inside = (x: number, y: number) => (x > 0 && x < 10 && y > 0 && y < 4) || (x > 0 && x < 4 && y > 0 && y < 10);
  for (const face of solid.faces.slice(2)) {
    const c = centroid(face);
    assert.ok(!inside(c.x + face.normal.x * 0.01, c.y + face.normal.y * 0.01), 'concave side normals point outwards');
    assert.ok(inside(c.x - face.normal.x * 0.01, c.y - face.normal.y * 0.01), 'and the inside is behind them');
  }

  const cam = new Camera();
  const visible = box.visibleFaces(cam);
  assert.ok(visible.length >= 2 && visible.length <= 3, 'a box shows two or three faces');
  assert.ok(visible.every(f => cam.faces(f.normal)));
  console.log('✔ Solid extrusion and face orientation passed.');
}

// Tones and decals.
{
  const ramp = { lit: 'L', base: 'B', dark: 'D' };
  assert.equal(rampTone(ramp, 0.1), 'D');
  assert.equal(rampTone(ramp, 0.5), 'B');
  assert.equal(rampTone(ramp, 0.9), 'L');
  const cam = new Camera();
  const toward = Frame3.facing(vec3(0, 0, 0), facingYaw(0, 8));
  const away = Frame3.facing(vec3(0, 0, 0), facingYaw(4, 8));
  const mark = Polygon.circle(1);
  assert.ok(Decal.onFace(toward, 'front', vec3(1, 0, 1), mark).visible(cam), 'a front decal facing the camera is visible');
  assert.ok(!Decal.onFace(away, 'front', vec3(1, 0, 1), mark).visible(cam), 'a front decal facing away is hidden');
  assert.ok(Decal.onFace(away, 'top', vec3(0, 0, 2), mark).visible(cam), 'a top decal is visible from any facing');
  // Front decals read like the screen when the face looks at the camera: x runs to screen right.
  const front = Decal.onFace(toward, 'front', vec3(1, 0, 1), Polygon.rect(2, 2, { cx: 5, cy: 0 })).projected(cam);
  assert.ok(front.bounds.center.x > 0, 'decal x runs to the viewer\'s right');
  // Profile frames: 'front' extrudes along forward with the profile standing in the right/up plane.
  const pf = toward.profile('front');
  assert.deepEqual([pf.forward, pf.right, pf.up], [toward.right, toward.up, toward.forward]);
  console.log('✔ Ramp tones and decal visibility passed.');
}

// A decal built with the layout of `onFace` and no `normal` faces the same way as the onFace one
// (the default used to be the opposite side, so such a decal was hidden from the front).
{
  const cam = new Camera();
  const mark = Polygon.circle(1);
  for (let dir = 0; dir < 8; dir++) {
    const frame = Frame3.facing(vec3(2, 3, 0), facingYaw(dir, 8));
    for (const side of ['front', 'back', 'left', 'right', 'top'] as const) {
      const placed = Decal.onFace(frame, side, vec3(1, 0.5, 1), mark);
      const plain = new Decal(placed.origin, placed.u, placed.v, mark);
      near(dot3(plain.normal, placed.normal), 1, 1e-9);
      assert.equal(plain.visible(cam), placed.visible(cam), `default normal of a ${side} decal, direction ${dir}`);
    }
  }
  console.log('✔ Decal default normal passed.');
}

// Stage: objects sort by where they stand; parts sort inside their object; `on` and layers.
{
  const cam = new Camera();
  const order: string[] = [];
  const item = (name: string, depth: number, groundY = 0): Placed => ({
    depth: () => depth,
    draw: () => order.push(name),
    ground: () => vec3(0, groundY, 0),
  });

  // A tall slab whose face centre is high (large depth) and a small candle standing in front of it.
  const stage = new Stage(cam);
  const slab = stage.object();
  slab.add(item('slab-back', 4, 0), null);
  slab.add(item('slab-face', 30, 0), null);
  stage.add(item('candle', 3, 6), null);
  stage.add(item('rock-behind', 50, -8), null);
  stage.add(item('shadow', 99, 0), null, { layer: 0 });
  stage.draw({} as CanvasRenderingContext2D);
  assert.deepEqual(order, ['shadow', 'rock-behind', 'slab-back', 'slab-face', 'candle'], 'objects sort by footprint, parts by depth');

  // Items resting `on` a part join its object and draw after every piece of that part.
  order.length = 0;
  const s2 = new Stage(cam);
  const lid = item('lid', 10);
  s2.add(lid, null);
  s2.add(item('lid-front', 12), null, { on: lid });
  s2.draw({} as CanvasRenderingContext2D);
  assert.deepEqual(order, ['lid', 'lid-front']);
  assert.throws(() => new Stage(cam).add(item('x', 0), null, { on: lid }), /must be added before/);
  console.log('✔ Stage objects, footprint order, layers and `on` passed.');
}

// Stage `on` chains: a glow on a body, ribs on the glow or on the body. `on` means "after the host",
// not "under its siblings", so ribs on a decal are drawn over it and sort by depth among themselves.
{
  const cam = new Camera();
  const ctx = {} as CanvasRenderingContext2D;
  const order: string[] = [];
  const item = (name: string, depth: number): Placed => ({ depth: () => depth, draw: () => order.push(name), ground: () => vec3(0, 0, 0) });
  const drawn = (build: (o: ReturnType<Stage['object']>) => void) => {
    order.length = 0;
    const stage = new Stage(cam);
    build(stage.object());
    stage.draw(ctx);
    return order.join(' ');
  };

  // Chains are transitive: each link is drawn after its host even where its own depth is lower.
  assert.equal(
    drawn(o => {
      const body = item('body', 10);
      const glow = item('glow', 5);
      const core = item('core', 1);
      o.add(body, null);
      o.add(glow, null, { on: body });
      o.add(core, null, { on: glow });
      o.add(item('rib-low', 0), null, { on: glow });
      o.add(item('rib-high', 20), null, { on: glow });
      o.add(item('leg', 12), null);
    }),
    'body glow core rib-low leg rib-high',
    'on chains: after the host, siblings by depth',
  );

  // The same parts, ribs on the glow or on the body: with `on: glow` the glow is under every rib;
  // with `on: body` the glow (sorted at its own depth) lands between the ribs behind and in front of it.
  const cage = (host: 'glow' | 'body') =>
    drawn(o => {
      const body = item('body', 10);
      const glow = item('glow', 15);
      o.add(body, null);
      o.add(glow, null, { on: body });
      o.add(item('rib-far', 12), null, { on: host === 'glow' ? glow : body });
      o.add(item('rib-near', 18), null, { on: host === 'glow' ? glow : body });
    });
  assert.equal(cage('glow'), 'body glow rib-far rib-near', 'ribs resting on the glow are drawn over it');
  assert.equal(cage('body'), 'body rib-far glow rib-near', 'ribs resting on the body sort against the glow by depth');

  // Real parts: an ellipsoid body, a hourglass decal on top and seven rib hoops across it.
  const hourglass = (() => {
    const base = 7;
    const height = 5.6;
    const apex = (height * 2) / 3;
    const lower = Polygon.triangle(base, height).translate(0, apex);
    const upper = Polygon.triangle(base, height).flip('y', 0).translate(0, -apex);
    near(lower.bounds.minY, 0);
    near(upper.bounds.maxY, 0);
    return upper.union(lower);
  })();
  const ramp = (name: string) => ({ lit: `${name}-lit`, base: `${name}-base`, dark: `${name}-dark` });
  const fills: string[] = [];
  const recorder = new Proxy({}, {
    get: (_t, k) => (k === 'createLinearGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : () => {}),
    set: (_t, k, v) => {
      if (k === 'fillStyle' && typeof v === 'string' && fills[fills.length - 1] !== v.split('-')[0]) fills.push(v.split('-')[0]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const [RF, RS, RU] = [11, 8.6, 8];
  const scene = (dir: number, host: 'glow' | 'body' | 'over') => {
    const camera = new Camera();
    const frame = Frame3.facing(vec3(0, 0, 10), facingYaw(dir, 8));
    const stage = new Stage(camera);
    const o = stage.object();
    const body = Round.ellipsoid(frame, RF, RS, RU);
    o.add(body, { ramp: ramp('body') });
    const glow = Decal.onFace(frame, 'top', vec3(0, 0, RU + 0.02), hourglass.clone().scale(1.5));
    o.add(glow, { fill: 'glow' }, host === 'over' ? { on: body, bias: 100 } : { on: body });
    for (let i = 0; i < 7; i++) {
      const band = bandOnEllipsoid(camera, frame, RF, RS, RU, -9.2 + i * 3, { axis: 'forward' });
      if (band.length > 1) o.add(new Tube(band, 1.2), { ramp: ramp(`rib${i}`) }, { on: host === 'glow' ? glow : body });
    }
    fills.length = 0;
    stage.draw(recorder);
    return { visible: glow.visible(camera), fills: fills.slice() };
  };
  let glowBetweenRibs = false;
  for (let dir = 0; dir < 8; dir++) {
    const onGlow = scene(dir, 'glow');
    assert.ok(onGlow.visible, 'a top decal is visible from every facing');
    assert.equal(onGlow.fills.filter(f => f === 'glow').length, 1, 'the glow is drawn once, never culled');
    assert.deepEqual(onGlow.fills.slice(0, 2), ['body', 'glow'], 'the glow is drawn right after the body, before every rib');
    assert.equal(onGlow.fills.length, 2 + 7, 'all seven ribs follow it');

    const onBody = scene(dir, 'body');
    const at = onBody.fills.indexOf('glow');
    assert.equal(onBody.fills.filter(f => f === 'glow').length, 1, 'the glow is drawn once, never culled');
    assert.equal(onBody.fills[0], 'body');
    assert.ok(at > 0, 'the glow is drawn after the body');
    if (at < onBody.fills.length - 1) glowBetweenRibs = true;

    // A large `bias` lays the glow over the whole cage, whatever the facing.
    const over = scene(dir, 'over');
    assert.equal(over.fills.length, 2 + 7, `direction ${dir}`);
    assert.equal(over.fills[0], 'body');
    assert.equal(over.fills[over.fills.length - 1], 'glow', 'a biased glow is drawn after every rib');
  }
  assert.ok(glowBetweenRibs, 'ribs on the body sort against the glow by depth: some ribs are drawn over it');
  console.log('✔ Stage `on` chains, decals as hosts and rib cages passed.');
}

// Round volumes expose a silhouette and depth without a canvas.
{
  const cam = new Camera();
  const cyl = Round.cylinder(Frame3.facing(vec3(0, 0, 0), 0), 3, 8);
  const s = cyl.silhouette(cam);
  assert.ok(s.bounds.width > 5.5 && s.bounds.height > 8, 'cylinder silhouette has its size on screen');
  assert.ok(cyl.depth(cam) > Round.cylinder(Frame3.facing(vec3(0, -10, 0), 0), 3, 8).depth(cam));
  console.log('✔ Round volumes passed.');
}

// visibleArc keeps the half of a band that faces the camera; contour and form need no booleans.
{
  const cam = new Camera();
  const arc = visibleArc(cam, vec3(0, 0, 10), vec3(1, 0, 0), vec3(0, 1, 0), 5);
  assert.ok(arc.length > 10 && arc.length < 40, 'a horizontal ring shows about half of its points');
  assert.ok(arc.every(p => p.y > -1.5), 'only the side towards the camera (+y)');
  const contoured = new Camera({ contour: { width: 1.5, color: '#000' } });
  assert.deepEqual(contoured.at({ x: 10, y: 10 }).contour, { width: 1.5, color: '#000' }, 'camera.at keeps the project contour');
  // Painting a blob of many parts goes through canvas calls only (no polygon booleans): fast.
  const parts = Array.from({ length: 12 }, (_, i) => new Tube([vec3(i, 0, 0), vec3(i + 4, 2, 6), vec3(i + 1, 4, 12)], 2));
  const blob = new Blob([...parts, Round.ellipsoid(Frame3.facing(vec3(0, 0, 8), 0), 6, 5, 7)]);
  const ops: string[] = [];
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : (..._a: unknown[]) => void ops.push(String(k))), set: () => true }) as unknown as CanvasRenderingContext2D;
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) new Stage(contoured).object().add(blob, { ramp: { lit: '#fff', base: '#888', dark: '#222' }, stroke: { width: 1, color: '#000' } });
  const stage = new Stage(contoured);
  stage.object().add(blob, { ramp: { lit: '#fff', base: '#888', dark: '#222' }, stroke: { width: 1, color: '#000' } });
  stage.draw(ctx);
  assert.ok(ops.includes('clip') && ops.includes('fill'), 'form shading uses canvas clipping');
  assert.ok(performance.now() - t0 < 1500, 'a 13-part blob paints in well under the export budget');
  console.log('✔ visibleArc, project contour and boolean-free form shading passed.');
}

// Bands on an ellipsoid: rings lie on the surface and only the camera-facing part is returned.
{
  const [F, S, U] = [11, 8.6, 8];
  const radiusOf = (axis: EllipsoidAxis) => (axis === 'forward' ? F : axis === 'side' ? S : U);
  const frames = [
    Frame3.facing(vec3(5, -3, 10), 0.7),
    Frame3.facing(vec3(0, 2, 4), facingYaw(3, 8)).scaled(1.3, 0.8, 1.1),
  ];
  // Position in the frame's own coordinates (coefficients of its axes, which may be scaled).
  const local = (frame: (typeof frames)[number], p: Vec3) => {
    const d = sub3(p, frame.origin);
    const c = (axis: Vec3) => dot3(d, axis) / dot3(axis, axis);
    return [c(frame.forward), c(frame.right), c(frame.up)];
  };
  const onRing = (ring: ReturnType<typeof ringOnEllipsoid>, t: number) => mix3([ring.center, 1], [ring.a, Math.cos(t) * ring.rx], [ring.b, Math.sin(t) * ring.ry]);

  for (const frame of frames) {
    for (const axis of ['up', 'forward', 'side'] as const) {
      for (const k of [-0.9, -0.5, 0, 0.3, 0.8]) {
        const ring = ringOnEllipsoid(frame, F, S, U, k * radiusOf(axis), axis);
        for (let i = 0; i < 24; i++) {
          const [x, y, z] = local(frame, onRing(ring, (i / 24) * Math.PI * 2));
          near((x / F) ** 2 + (y / S) ** 2 + (z / U) ** 2, 1);
        }
      }
    }
  }
  // The horizontal ring is the section `Round.ellipsoid` builds at that height; beyond the ends it stays on the pole.
  const frame0 = Frame3.facing(vec3(1, 2, 3), 0.4);
  const section = Round.ellipsoid(frame0, F, S, U).sections[2];
  const ring0 = ringOnEllipsoid(frame0, F, S, U, dot3(sub3(section.center, frame0.origin), frame0.up));
  near(len3(sub3(ring0.center, section.center)), 0);
  near(ring0.rx, section.rx);
  near(ring0.ry, section.ry as number);
  const pole = ringOnEllipsoid(frame0, F, S, U, 3 * U);
  near(len3(sub3(pole.center, frame0.at(0, 0, U))), 0);
  near(pole.rx, 0.01);

  // Visible part: exactly the ring points whose surface normal faces the camera (within `grow`).
  const cam = new Camera();
  const key = (p: Vec3) => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
  for (let dir = 0; dir < 8; dir++) {
    const frame = Frame3.facing(vec3(0, 0, 10), facingYaw(dir, 8));
    for (const axis of ['up', 'forward', 'side'] as const) {
      for (const k of [-0.6, -0.2, 0, 0.5, 0.85]) {
        const at = k * radiusOf(axis);
        const band = new Set(bandOnEllipsoid(cam, frame, F, S, U, at, { axis }).map(key));
        const ring = ringOnEllipsoid(frame, F, S, U, at, axis);
        for (let i = 0; i < 48; i++) {
          const p = onRing(ring, (i / 48) * Math.PI * 2);
          const [x, y, z] = local(frame, p);
          const n = frame.dir(x / (F * F), y / (S * S), z / (U * U));
          assert.equal(band.has(key(p)), dot3(n, cam.viewDir) > -0.1 * len3(n), `${axis} ring at ${at} sample ${i}, direction ${dir}`);
        }
      }
    }
  }
  // A frame with non-uniformly scaled axes builds a stretched ellipsoid: visibility follows the true surface
  // normal, here the numeric gradient of the ellipsoid's equation in world space.
  for (const scale of [[1.3, 0.8, 1.1], [2, 0.5, 1]] as const) {
    for (let dir = 0; dir < 8; dir += 3) {
      const frame = Frame3.facing(vec3(0, 0, 10), facingYaw(dir, 8)).scaled(...scale);
      const equation = (p: Vec3) => {
        const [x, y, z] = local(frame, p);
        return (x / F) ** 2 + (y / S) ** 2 + (z / U) ** 2;
      };
      const gradient = (p: Vec3): Vec3 => {
        const e = 1e-5;
        const d = (axis: 'x' | 'y' | 'z') => (equation({ ...p, [axis]: p[axis] + e }) - equation({ ...p, [axis]: p[axis] - e })) / (2 * e);
        return vec3(d('x'), d('y'), d('z'));
      };
      for (const axis of ['up', 'forward', 'side'] as const) {
        const at = 0.3 * radiusOf(axis);
        const band = new Set(bandOnEllipsoid(cam, frame, F, S, U, at, { axis }).map(key));
        const ring = ringOnEllipsoid(frame, F, S, U, at, axis);
        for (let i = 0; i < 48; i++) {
          const p = onRing(ring, (i / 48) * Math.PI * 2);
          const n = gradient(p);
          assert.equal(band.has(key(p)), dot3(n, cam.viewDir) > -0.1 * len3(n), `scaled ${scale} ${axis} sample ${i}, direction ${dir}`);
        }
      }
    }
  }
  // Unlike `visibleArc`, which knows only the ring's plane: above the equator more than half shows, below it less.
  const frame1 = Frame3.facing(vec3(0, 0, 10), facingYaw(0, 8));
  const arcLength = (h: number) => {
    const r = ringOnEllipsoid(frame1, F, S, U, h);
    return visibleArc(cam, r.center, r.a, r.b, r.rx, r.ry).length;
  };
  const equator = bandOnEllipsoid(cam, frame1, F, S, U, 0).length;
  assert.equal(equator, arcLength(0), 'at the equator both agree');
  assert.ok(bandOnEllipsoid(cam, frame1, F, S, U, 0.4 * U).length > arcLength(0.4 * U), 'a ring above the equator shows more of itself');
  assert.ok(bandOnEllipsoid(cam, frame1, F, S, U, -0.4 * U).length < arcLength(-0.4 * U), 'a ring below it shows less');
  const cap = bandOnEllipsoid(cam, frame1, F, S, U, 0.85 * U);
  assert.deepEqual(cap[0], cap[cap.length - 1], 'a ring near the top is visible all round and comes back closed');
  assert.deepEqual(bandOnEllipsoid(cam, frame1, F, S, U, -0.9 * U), [], 'a ring under the belly is hidden');
  console.log('✔ Ellipsoid rings and visible bands passed.');
}

// Scenery: pixel-exact grid, masks, seamless transitions, scenes as data, tile sets.
{
  const cam = new Camera();
  const grid = Grid.fromScreen(cam, 32, 24);
  const a = cam.project(grid.center(0, 0));
  const b = cam.project(grid.center(1, 1));
  near(b.x - a.x, 32, 1e-9, 'a cell is exactly 32 px wide on screen');
  near(b.y - a.y, 24, 1e-9, 'and exactly 24 px deep');
  const wallAt = (c: number, r: number) => (c === 1 && r >= 0 && r <= 2) || (r === 1 && c === 2);
  assert.equal(edgeMask(wallAt, 1, 1), EDGE.N | EDGE.E | EDGE.S, 'a wall cell sees its connected neighbours');
  assert.equal(cornerMask((c, r) => c >= 1 && r >= 1, 1, 1), CORNER.SE, 'the vertex at the top-left of (1,1) has only its SE cell covered');
  // Transition regions meet the tile's edges straight: covered quarters reach the border exactly.
  const se = cornerMaskShape(CORNER.SE | CORNER.SW, 32, 24).bounds;
  near(se.minX, -16, 1e-6, 'the south half reaches the left edge');
  near(se.maxX, 16, 1e-6, 'and the right edge');
  near(se.maxY, 12, 1e-6, 'and the bottom edge');
  near(se.minY, 0, 1e-6, 'and stops at the tile centre');
  assert.equal(masksOf('corners').length, 15);
  assert.equal(masksOf('edges').length, 16);
  // A tiny catalog: three floors, a wall, a gate, a prop; pieces record what they are asked to draw.
  const drawn: string[] = [];
  const contexts: { name: string; ctx: PieceContext; options: Record<string, unknown> }[] = [];
  const recorder = (name: string) => (ctx: PieceContext, options: Record<string, unknown>) => {
    drawn.push(`${name}:${ctx.mask}`);
    contexts.push({ name, ctx, options });
    if (name === 'wall') ctx.seam(40);
  };
  const style = { ramp: { lit: '#fff', base: '#888', dark: '#222' } };
  const catalog: SceneryCatalog = {
    pieces: [
      { id: 'dirt', label: 'Dirt', group: 'floor', piece: recorder('dirt'), connect: 'corners', priority: 0, roles: [] },
      { id: 'grass', label: 'Grass', group: 'floor', piece: recorder('grass'), connect: 'corners', priority: 1, variants: 2, roles: [] },
      { id: 'gravel', label: 'Gravel', group: 'floor', piece: recorder('gravel'), connect: 'corners', priority: 2, roles: [] },
      { id: 'wall', label: 'Wall', group: 'wall', piece: recorder('wall'), connect: 'edges', variants: 2, roles: ['stone'], options: [{ key: 'height', label: 'Height', type: 'number', default: 40, min: 20, max: 60 }] },
      { id: 'gate', label: 'Gate', group: 'fence', piece: recorder('gate'), connect: 'edges', joins: ['wall'], roles: [] },
      { id: 'stone', label: 'Stone', group: 'prop', piece: recorder('stone'), connect: 'none', directions: 4, footprint: [2, 1], roles: [] },
      { id: 'crack', label: 'Crack', group: 'decal', piece: recorder('crack'), connect: 'none', roles: [] },
    ],
    materials: { granite: style },
    defaultMaterials: { stone: 'granite' },
    grid,
    camera: cam,
  };
  const scene: SceneData = {
    cols: 3,
    rows: 2,
    floor: [['dirt', 'grass', 'dirt'], ['dirt', 'dirt', 'dirt']],
    walls: [[null, null, 'wall'], [null, null, 'wall']],
    props: [{ piece: 'stone', col: 0, row: 1, dir: 0 }],
  };
  assert.deepEqual(validateScene(scene, catalog), []);
  const ops: { op: string; args: unknown[] }[] = [];
  const ctx = new Proxy({}, {
    get: (_t, k) => (k === 'createLinearGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : k === 'getTransform' ? () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }) : (...args: unknown[]) => void ops.push({ op: String(k), args })),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  drawScene(ctx, scene, catalog, { x: 0, y: 0 });
  assert.equal(drawn.filter(d => d === 'dirt:15').length, 6, 'the lowest floor lays a full tile under every cell');
  assert.equal(drawn.filter(d => d.startsWith('grass:')).length, 4, 'a single grass cell makes four transition tiles around it');
  assert.deepEqual(drawn.filter(d => d.startsWith('wall:')).sort(), ['wall:1', 'wall:4'], 'two stacked wall cells connect south and north');
  assert.ok(drawn.includes('stone:0'), 'the prop is drawn');
  // Every piece is built at the world origin with the camera on its pivot, so a frame is the same wherever it is laid.
  for (const { ctx: c } of contexts) {
    assert.deepEqual(c.frame.origin, vec3(0, 0, 0), 'pieces are built at the origin');
    assert.ok(c.ground, 'every piece has a ground object');
  }
  const dirtSeeds = new Set(contexts.filter(c => c.name === 'dirt').map(c => `${c.ctx.variant}:${c.ctx.seed}`));
  assert.equal(dirtSeeds.size, 1, 'a frame (piece, mask, variant) has one seed wherever it is laid, as in its sheet');
  const pivots = new Set(contexts.filter(c => c.name === 'dirt').map(c => JSON.stringify(c.ctx.camera.project(vec3(0, 0, 0)))));
  assert.equal(pivots.size, 6, 'and the camera moves onto each cell');
  // Floors are drawn lowest priority first (whatever their rows), all clipped to the scene; walls and props after.
  const layout = layoutScene(scene, catalog);
  const order = layout.map(it => it.piece);
  assert.ok(order.lastIndexOf('dirt') < order.indexOf('grass'), 'every lower floor tile is drawn before the first higher one');
  assert.ok(order.lastIndexOf('grass') < order.indexOf('wall'), 'floors come before walls and props');
  assert.deepEqual(layout.filter(it => it.piece === 'wall').map(it => it.frame), layout.filter(it => it.piece === 'wall').map(it => it.mask * 2 + it.variant), 'a wall item names its frame in the sheet');
  // A higher floor lays tiles only next to its own cells: gravel inside dirt, with grass elsewhere, has no grass under it.
  const patch: SceneData = { cols: 5, rows: 3, floor: [['grass', 'dirt', 'dirt', 'dirt', 'dirt'], ['dirt', 'dirt', 'dirt', 'gravel', 'dirt'], ['dirt', 'dirt', 'dirt', 'dirt', 'dirt']], walls: Array.from({ length: 3 }, () => Array(5).fill(null)), props: [] };
  const patchItems = layoutScene(patch, catalog);
  assert.equal(patchItems.filter(it => it.piece === 'grass').length, 4, 'grass tiles only around its own cell');
  assert.ok(patchItems.filter(it => it.piece === 'grass').every(it => it.col <= 1 && it.row <= 1), 'none of them under the gravel');
  // Variants picked per position are not a checkerboard (plain FNV made h % 2 alternate cell by cell).
  const run: SceneData = { cols: 12, rows: 12, floor: Array.from({ length: 12 }, () => Array(12).fill('dirt')), walls: Array.from({ length: 12 }, () => Array(12).fill('wall')), props: [] };
  const variants = new Map(layoutScene(run, catalog).filter(it => it.piece === 'wall').map(it => [`${it.col},${it.row}`, it.variant]));
  let differ = 0;
  let pairs = 0;
  for (let r = 0; r < 12; r++) for (let c = 0; c < 11; c++, pairs++) if (variants.get(`${c},${r}`) !== variants.get(`${c + 1},${r}`)) differ++;
  assert.ok(differ / pairs > 0.3 && differ / pairs < 0.7, `neighbouring variants differ about half the time, not always (${differ}/${pairs})`);
  // A wall cell can carry its own variant and options; a gate joins the wall it lists, and the wall joins back.
  contexts.length = 0;
  drawScene(ctx, { ...scene, walls: [[null, 'gate', { piece: 'wall', variant: 1, options: { height: 30 } }], [null, null, 'wall']] }, catalog, { x: 0, y: 0 });
  const own = contexts.find(c => c.name === 'wall' && c.ctx.variant === 1 && c.options.height === 30);
  assert.ok(own, 'a cell\'s own variant and options reach the piece');
  assert.equal(own!.ctx.mask, EDGE.S | EDGE.W, 'the wall connects to the gate that joins it');
  assert.equal(contexts.find(c => c.name === 'gate')!.ctx.mask, EDGE.E, 'and the gate to the wall');
  // Connected walls are cut on the cell border towards east and west, and at their seam towards north.
  ops.length = 0;
  drawScene(ctx, { cols: 3, rows: 2, floor: [[null, null, null], [null, null, null]], walls: [[null, 'wall', null], ['wall', 'wall', 'wall']], props: [] }, catalog, { x: 0, y: 0 });
  const rects = ops.filter(o => o.op === 'rect').map(o => o.args as number[]);
  const middle = rects.find(r => Math.abs(r[0] - 16) < 1e-6 && Math.abs(r[2] - 32) < 1e-6);
  assert.ok(middle, 'the middle wall of an E-W run is cut on both cell borders');
  near(middle![1], cam.project(vec3(0, grid.cell.y / 2, 40)).y, 1e-6);
  // Props turn their footprint with their facing.
  assert.deepEqual(footprintOf(catalog.pieces[5], 0), [2, 1]);
  assert.deepEqual(footprintOf(catalog.pieces[5], 1), [1, 2], 'facing west, a 2×1 prop covers 1×2 cells');
  assert.deepEqual(footprintOf(catalog.pieces[5], 2), [2, 1]);
  const bad = validateScene({ ...scene, walls: [['dirt', null, { piece: 'wall', variant: 5, options: { height: 99, colour: 'red' } }], [null, null, null]], props: [{ piece: 'stone', col: 2, row: 1 }, { piece: 'stone', col: 0, row: 0, dir: 7 }, { piece: 'stone', col: 0, row: 1, dir: 1 }] }, catalog);
  for (const needle of ['is a floor, not a wall', 'does not fit', 'dir 7', 'covers 1×2', 'variant 5', 'from 20 to 60', 'no option "colour"']) assert.ok(bad.some(p => p.includes(needle)), `validation reports: ${needle}`);
  // The renderer draws each frame once and copies it after: an edit draws only its new frames.
  const fakeCanvas = (width: number, height: number) => ({ width, height, getContext: () => ctx });
  const renderer = createSceneRenderer(catalog, { canvas: fakeCanvas });
  renderer.draw(ctx, run, { x: 0, y: 0 });
  const first = renderer.drawn;
  assert.ok(first <= 16 * 2 + 1, `a 12×12 walled scene needs at most one frame per mask and variant (${first})`);
  renderer.draw(ctx, run, { x: 0, y: 0 });
  assert.equal(renderer.drawn, first, 'drawing it again draws nothing new');
  renderer.draw(ctx, { ...run, props: [{ piece: 'crack', col: 3, row: 3 }] }, { x: 0, y: 0 });
  assert.equal(renderer.drawn, first + 1, 'adding a decal draws one frame');
  const blits = ops.filter(o => o.op === 'drawImage').slice(-3).map(o => o.args.slice(1) as number[]);
  assert.ok(blits.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y)), 'frames land on whole device pixels');
  // Tile sets: frames per mask and variant, joins and priority in the atlas.
  const grassSet = defineTileSet({ catalog, piece: 'grass' });
  assert.equal(grassSet.frames, 30, 'a floor exports 15 corner masks × 2 variants');
  assert.equal(grassSet.width, 32);
  assert.equal(grassSet.height, 24);
  assert.equal((grassSet.data as any).priority, 1);
  const wallSet = defineTileSet({ catalog, piece: 'wall' });
  assert.equal(wallSet.frames, 32, 'a wall exports 16 edge masks × 2 variants');
  assert.equal((wallSet.data as any).tiles[10].mask, 5);
  assert.deepEqual((defineTileSet({ catalog, piece: 'gate' }).data as any).joins, ['wall']);
  assert.equal(defineTileSet({ catalog, piece: 'stone' }).directions, 4, 'a prop exports its facings as rows');
  assert.throws(() => defineTileSet({ catalog, piece: 'wall', options: { height: 5 } }), /from 20 to 60/);
  // A scene asset carries the layout a game follows, and flags frames the default sheets do not hold.
  const sceneAsset = defineSceneAsset({ catalog, scene });
  assert.equal((sceneAsset.data as any).layout.length, layout.length);
  const customised = defineSceneAsset({ catalog, scene: { ...scene, options: { wall: { height: 30 } } } }).data as any;
  assert.deepEqual(customised.layout.find((it: any) => it.piece === 'wall').options, { height: 30 }, 'an item drawn with other options says so');
  assert.equal(customised.layout.find((it: any) => it.piece === 'dirt').options, undefined, 'default frames carry no options');
  // Whole pixels where a game anchors and where floors meet, for a grid whose 1.5 cells are odd (42 px) and any margin.
  const oddGrid: SceneryCatalog = { ...catalog, grid: Grid.fromScreen(cam, 42, 30) };
  for (const p of oddGrid.pieces) {
    const { pivot } = cellOf(p, oddGrid);
    assert.ok(Number.isInteger(pivot.x) && Number.isInteger(pivot.y), `${p.id}: the default pivot (${pivot.x}, ${pivot.y}) is a whole pixel`);
  }
  for (const margin of [10, 13.3]) {
    const { origin } = defineSceneAsset({ catalog: oddGrid, scene, margin }).data as { origin: { x: number; y: number } };
    assert.ok(Number.isInteger(origin.x - 21) && Number.isInteger(origin.y - 15), `margin ${margin}: the floor's corner (${origin.x - 21}, ${origin.y - 15}) is a whole pixel`);
  }
  // groundShadow turns by radians: a quarter turn swaps the ellipse's extents on the floor.
  const flat = groundShadow(cam, vec3(0, 0, 0), 20, 8).bounds;
  const turnedShadow = groundShadow(cam, vec3(0, 0, 0), 20, 8, Math.PI / 2).bounds;
  near(turnedShadow.maxX - turnedShadow.minX, 16, 0.2);
  near((turnedShadow.maxY - turnedShadow.minY) / (flat.maxY - flat.minY), 20 / 8, 0.05);
  // Pieces get their facing as a yaw.
  contexts.length = 0;
  drawScene(ctx, { ...scene, props: [{ piece: 'stone', col: 0, row: 0, dir: 1 }] }, catalog, { x: 0, y: 0 });
  near(contexts.find(c => c.name === 'stone')!.ctx.yaw, facingYaw(1, 4));
  // The catalog is checked as a whole.
  assert.deepEqual(validateCatalog(catalog), []);
  const badCatalog = validateCatalog({ ...catalog, pieces: [...catalog.pieces, { ...catalog.pieces[0], variantLabels: ['a', 'b'] }, { id: 'odd', label: 'Odd', group: 'wall', piece: recorder('odd'), connect: 'none', joins: ['ghost'], roles: [] }] });
  for (const needle of ['used twice', '2 variantLabels for 1 variants', "connects by 'edges'", 'unknown piece "ghost"']) assert.ok(badCatalog.some(p => p.includes(needle)), `catalog check reports: ${needle}`);
  // Seam tests: a floor on a chosen floor, a field, props spaced by their cell.
  const onGrass = seamTestScene(catalog, 'gravel', { on: 'grass' });
  assert.equal(onGrass.floor[0][0], 'grass', 'patches stand on the floor asked for');
  const field = seamTestScene(catalog, 'grass', { field: true });
  assert.ok(field.floor.flat().every(id => id === 'grass'), 'a field is the floor alone');
  const props = seamTestScene(catalog, 'stone');
  assert.equal(props.props.length, 4, 'one placement per facing and variant');
  assert.deepEqual(validateScene(props, catalog), [], 'turned footprints fit');
  assert.ok(props.props[1].row - props.props[0].row >= Math.ceil(defineTileSet({ catalog, piece: 'stone' }).pivot!.y / 24), 'rows are spaced by the cell height');
  assert.equal(seamTestScene(catalog, 'stone', { on: null }).floor[0][0], null, 'or on no floor');
  // Space profiles: one scale from the character's height and a genre preset.
  const space = defineSpace({ camera: cam, character: 80, preset: 'jrpg' });
  assert.deepEqual(space.grid.screen, { w: 48, h: 36 }, 'a JRPG cell is 0.6 character wide, whole even pixels on screen');
  near(space.scale.wall, 100);
  assert.equal(space.walls, 'border');
  for (const name of Object.keys(SPACE_PRESETS) as (keyof typeof SPACE_PRESETS)[]) {
    const g = defineSpace({ camera: cam, character: 80, preset: name }).grid.screen;
    assert.ok(g.w % 2 === 0 && g.h % 2 === 0, `${name}: cells are even pixels`);
  }
  assert.equal(defineSpace({ camera: cam, character: 80, preset: 'tactics', walls: 'border', scale: { wall: 50 } }).scale.wall, 50, 'any size can be overridden');
  near(screenHeight(cam, 10), cam.project(vec3(0, 0, 0)).y - cam.project(vec3(0, 0, 10)).y);
  // Walls on borders: the walls grid is the vertices, and a wall stands on its vertex.
  const bordered: SceneryCatalog = { ...catalog, grid: space.grid, space };
  const room = emptyScene(bordered, 3, 2);
  assert.equal(room.walls.length, 3);
  assert.equal(room.walls[0].length, 4, 'one more row and column of vertices');
  room.floor = [['dirt', 'dirt', 'dirt'], ['dirt', 'dirt', 'dirt']];
  room.walls[0] = ['wall', 'wall', 'wall', 'wall'];
  room.walls[1][0] = 'wall';
  room.walls[2][0] = 'wall';
  assert.deepEqual(validateScene(room, bordered), []);
  assert.ok(validateScene({ ...room, walls: room.walls.slice(0, 2) }, bordered).some(p => p.includes('vertices')), 'a cell-sized walls grid is refused');
  const roomLayout = layoutScene(room, bordered);
  const corner = roomLayout.find(it => it.piece === 'wall' && it.col === 0 && it.row === 0)!;
  assert.deepEqual(corner.at, space.grid.vertex(0, 0), 'the corner wall stands on the vertex');
  assert.equal(corner.mask, EDGE.E | EDGE.S, 'and joins the runs along the north and west borders');
  // Nominal heights: walls and fences take the profile's sizes; the sheet carries them.
  assert.equal(pieceHeight(bordered.pieces[3], bordered), 100);
  assert.equal(pieceHeight(bordered.pieces[3], catalog), undefined, 'no profile, no nominal height');
  const wallData = defineTileSet({ catalog: bordered, piece: 'wall' }).data as any;
  near(wallData.height.screen, screenHeight(cam, 100), 0.01);
  assert.equal(wallData.space.preset, 'jrpg');
  // Scale figures are drawn by the editor and tests, after the walls in front of them, never in the layout.
  contexts.length = 0;
  ops.length = 0;
  drawScene(ctx, { ...room, figures: [{ col: 1, row: 1 }] }, bordered, { x: 0, y: 0 });
  assert.equal(layoutScene({ ...room, figures: [{ col: 1, row: 1 }] }, bordered).length, roomLayout.length, 'figures are not part of the layout');
  assert.ok(ops.some(o => o.op === 'arc'), 'a figure is drawn');
  assert.ok(validateScene({ ...room, figures: [{ col: 5, row: 0 }] }, bordered).some(p => p.includes('figures[0]')));
  assert.ok(validateCatalog({ ...bordered, grid }).some(p => p.includes("space profile's")), 'the catalog must use the profile\'s grid');
  // Heights: a wall that also makes a low wall; the scene picks per cell, the piece builds to ctx.height, the sheet has a row per height.
  const tiered: SceneryCatalog = { ...bordered, pieces: bordered.pieces.map(p => (p.id === 'wall' ? { ...p, heights: ['wall', 'fence'] } : p)) };
  assert.deepEqual(heightsOf(tiered.pieces[3], tiered), [100, 44]);
  assert.deepEqual(validateCatalog(tiered), []);
  assert.ok(validateCatalog({ ...tiered, pieces: tiered.pieces.map(p => (p.id === 'stone' ? { ...p, heights: [10] } : p)) }).some(p => p.includes('only walls and fences')));
  const lowRoom = { ...room, walls: room.walls.map(r => r.slice()) };
  lowRoom.walls[0][3] = { piece: 'wall', height: 'fence' };
  assert.deepEqual(validateScene(lowRoom, tiered), []);
  assert.ok(validateScene({ ...lowRoom, walls: lowRoom.walls.map((r, i) => (i === 0 ? r.map((w, j) => (j === 2 ? { piece: 'wall', height: 'door' } : w)) : r)) }, tiered).some(p => p.includes('is not one of')));
  const lowItems = layoutScene(lowRoom, tiered).filter(it => it.piece === 'wall');
  const low = lowItems.find(it => it.col === 3 && it.row === 0)!;
  assert.equal(low.height, 44);
  assert.equal(low.sheetRow, 1, 'its frame is in the second row of the sheet');
  assert.equal(lowItems.find(it => it.col === 0 && it.row === 0)!.height, 100, 'the rest keep the default height');
  // A step: the tall vertex next to the low one lays its arm towards it at the low height, under its own tall frame,
  // whose pier closes towards the low run (no tall shoulder half an edge long).
  const step = lowItems.filter(it => it.col === 2 && it.row === 0);
  assert.deepEqual(step.map(it => [it.height, it.mask]), [[44, EDGE.W | EDGE.E], [100, EDGE.W]], 'low arms first, then the tall pier without the arm towards the low run');
  assert.deepEqual(step.map(it => it.sheetRow), [1, 0], 'both frames come from the sheet: the low row, then the tall one');
  contexts.length = 0;
  drawScene(ctx, lowRoom, tiered, { x: 0, y: 0 });
  assert.deepEqual([...new Set(contexts.filter(c => c.name === 'wall').map(c => c.ctx.height))].sort(), [100, 44].sort(), 'pieces build to ctx.height');
  const tieredSheet = defineTileSet({ catalog: tiered, piece: 'wall' });
  assert.equal(tieredSheet.directions, 2, 'one row per height');
  assert.equal((tieredSheet.data as any).heights[1].name, 'fence');
  const wallTest = seamTestScene(bordered, 'wall');
  assert.equal(wallTest.walls.length, 10, 'seam tests follow the wall placement');
  assert.deepEqual(validateScene(wallTest, bordered), []);
  // Living scenery: states, clips, doors on edges, navigation.
  const living: SceneryCatalog = {
    ...bordered,
    pieces: [
      ...bordered.pieces,
      { id: 'door', label: 'Door', group: 'door', piece: recorder('door'), connect: 'none', directions: 4, roles: [], states: ['closed', 'open'], clips: { opening: { frames: 4, from: 'closed', to: 'open', events: [{ frame: 2, name: 'open' }] } }, nav: { passableIn: ['open'], interact: 'door' } },
      { id: 'chest', label: 'Chest', group: 'prop', piece: recorder('chest'), connect: 'none', roles: [], variants: 2, states: ['shut', 'open'], clips: { glow: { frames: 6, loop: true } }, nav: { interact: 'chest', interactIn: ['shut'] } },
      { id: 'urn', label: 'Urn', group: 'prop', piece: recorder('urn'), connect: 'none', roles: [], states: ['whole', 'broken'], nav: { passableIn: ['broken'], interact: 'break', interactIn: ['whole'] } },
    ],
  };
  assert.deepEqual(validateCatalog(living), []);
  const brokenCatalog = validateCatalog({ ...living, pieces: [...living.pieces, { id: 'bad', label: 'Bad', group: 'prop', piece: recorder('bad'), connect: 'none', roles: [], states: ['a'], clips: { go: { frames: 2, from: 'b', events: [{ frame: 5, name: 'x' }] } } }] });
  for (const needle of ['names state "b"', 'outside its 2 frames']) assert.ok(brokenCatalog.some(p => p.includes(needle)), `catalog check reports: ${needle}`);
  assert.ok(validateCatalog({ ...catalog, pieces: [...catalog.pieces, living.pieces.find(p => p.id === 'door')!] }).some(p => p.includes('walls on borders')), 'doors need walls on borders');
  // A 4 × 3 room: north wall along vertex row 0 with a door on the north edge of cell (1, 0), a chest, an urn.
  const hall: SceneData = { ...emptyScene(living, 4, 3), floor: Array.from({ length: 3 }, () => Array(4).fill('dirt')), props: [{ piece: 'door', col: 1, row: 0, edge: 'N' }, { piece: 'chest', col: 3, row: 1 }, { piece: 'urn', col: 1, row: 1 }] };
  hall.walls[0] = ['wall', 'wall', 'wall', 'wall', 'wall'];
  assert.deepEqual(validateScene(hall, living), []);
  for (const [bad, needle] of [
    [{ piece: 'door', col: 1, row: 0 }, "needs edge 'N' or 'W'"],
    [{ piece: 'door', col: 4, row: 0, edge: 'N' }, 'outside'],
    [{ piece: 'chest', col: 0, row: 0, edge: 'N' }, 'only doors'],
    [{ piece: 'chest', col: 0, row: 0, state: 'ajar' }, 'state "ajar"'],
  ] as const) assert.ok(validateScene({ ...hall, props: [bad as never] }, living).some(p => p.includes(needle)), `scene check reports: ${needle}`);
  const hallItems = layoutScene(hall, living);
  const doorItem = hallItems.find(it => it.piece === 'door')!;
  near(doorItem.at.x, space.grid.vertex(1, 0).x + space.grid.cell.x / 2);
  near(doorItem.at.y, space.grid.vertex(1, 0).y);
  assert.equal(doorItem.state, 'closed');
  assert.equal(doorItem.edge, 'N');
  const wallMasks = hallItems.filter(it => it.piece === 'wall').map(it => [it.col, it.mask]);
  assert.deepEqual(wallMasks.find(([c]) => c === 1)![1], EDGE.W, 'the door cuts the run: the wall on its west ends in a pier');
  assert.deepEqual(wallMasks.find(([c]) => c === 2)![1], EDGE.E, 'and so does the one on its east');
  // Pieces get their state and clip frames.
  contexts.length = 0;
  drawScene(ctx, hall, living, { x: 0, y: 0 });
  assert.equal(contexts.find(c => c.name === 'door')!.ctx.state, 'closed');
  const clipRenderer = createSceneRenderer(living, { canvas: (width: number, height: number) => ({ width, height, getContext: () => ctx }) });
  contexts.length = 0;
  clipRenderer.frame({ ...doorItem, clip: { name: 'opening', frame: 3 } });
  const opening = contexts.find(c => c.name === 'door')!.ctx;
  assert.deepEqual(opening.clip, { name: 'opening', frame: 3, frames: 4, t: 1 }, 'a transition runs t from 0 to 1');
  assert.equal(opening.state, 'closed', 'and is drawn from its from-state');
  // Sheets: a still sheet per state, an animated sheet per clip.
  const doorOpen = defineTileSet({ catalog: living, piece: 'door', state: 'open' }).data as any;
  assert.equal(doorOpen.state, 'open');
  assert.equal(doorOpen.clips.opening.sheet, 'door--opening');
  assert.deepEqual(doorOpen.stateSheets, { closed: 'door', open: 'door--open' }, 'a game finds each state\'s sheet');
  assert.ok(validateCatalog({ ...living, pieces: living.pieces.map(p => (p.id === 'door' ? { ...p, clips: { open: { frames: 2 } } } : p)) }).some(m => m.includes('the name of a state')), 'a clip may not share a state\'s sheet name');
  const glowRows = defineTileSet({ catalog: living, piece: 'chest', clip: 'glow' });
  assert.equal(glowRows.directions, 2, 'a clip sheet has a block of facings per variant');
  assert.deepEqual((glowRows.data as any).rows, [{ row: 0, dir: 0, variant: 0 }, { row: 1, dir: 0, variant: 1 }]);
  const openClip = defineTileSet({ catalog: living, piece: 'door', clip: 'opening' });
  assert.equal(openClip.frames, 4);
  assert.equal(openClip.directions, 4);
  assert.deepEqual((openClip.data as any).clip.events, [{ frame: 2, name: 'open' }]);
  assert.throws(() => defineTileSet({ catalog: living, piece: 'door', clip: 'shut' }), /no clip "shut"/);
  // Navigation: walls on borders block edges, closed doors too, blocking props close their cells.
  const nav = sceneNavigation(hall, living);
  assert.equal(nav.walls[0][0] & EDGE.N, EDGE.N, 'the north wall closes the north edge of the first row');
  assert.equal(nav.walls[0][1] & EDGE.N, EDGE.N, 'the closed door too');
  assert.equal(nav.cost[1][3], 0, 'the chest closes its cell');
  assert.equal(nav.cost[1][1], 0, 'the whole urn too');
  assert.equal(sceneNavigation({ ...hall, props: hall.props.map(p => (p.piece === 'urn' ? { ...p, state: 'broken' } : p)) }, living).cost[1][1], 1, 'a broken urn lets characters through');
  const opened = sceneNavigation(hall, living, { open: { 0: true } });
  assert.equal(opened.walls[0][1] & EDGE.N, 0, 'an open door does not');
  assert.equal(opened.doors[0].open, true);
  assert.deepEqual(nav.interactables.map(i => i.kind).sort(), ['break', 'chest', 'door']);
  const used = sceneNavigation({ ...hall, props: hall.props.map(p => (p.piece === 'chest' ? { ...p, state: 'open' } : p.piece === 'urn' ? { ...p, state: 'broken' } : p)) }, living);
  assert.deepEqual(used.interactables.map(i => i.kind), ['door'], 'an opened chest and a broken urn are no longer things to use');
  assert.equal(nav.posts.length, 4, 'posts are the vertices');
  assert.ok(nav.posts[0][0] && !nav.posts[2][2], 'where the walls stand');
  assert.ok(nav.interactables.find(i => i.kind === 'chest')!.cells.some(c => c.col === 2 && c.row === 1), 'a chest is used from the cells beside it');
  // Moving on it (canStep, findPath, moveIn) is the players' part: tests/runtime/navigation.test.ts walks the same hall.
  const doorTest = seamTestScene(living, 'door');
  assert.deepEqual(validateScene(doorTest, living), []);
  assert.deepEqual(doorTest.props.map(p => [p.edge, p.state]), [['N', undefined], ['W', 'open']], 'a door in its default and next states');
  assert.equal(seamTestScene(living, 'urn').props.length, 2, 'a prop in each of its states');
  // Frames tip and roll for hinged and tumbling parts.
  const tipped = Frame3.facing(vec3(0, 0, 0), 0).pitched(90);
  near(tipped.forward.z, 1, 1e-9);
  near(Frame3.facing(vec3(0, 0, 0), 0).rolled(90).right.z, 1, 1e-9);
  // Effects: a catalog of pieces exported as sheets with what a player needs.
  const seen: EffectContext[] = [];
  const effects: EffectCatalog = {
    effects: [
      { id: 'bolt', label: 'Bolt', kind: 'projectile', piece: (c: EffectContext) => void seen.push(c), frames: 4, loop: true, directions: 8, size: 10, height: 30, travel: { speed: 200, range: 300 }, follows: 'burst', roles: [] },
      { id: 'burst', label: 'Burst', kind: 'impact', piece: (c: EffectContext) => void seen.push(c), frames: 5, size: 16, events: [{ frame: 1, name: 'hit' }], roles: [] },
      { id: 'ring', label: 'Ring', kind: 'area', piece: () => {}, frames: 6, size: 40, roles: [] },
    ],
    materials: {},
    defaultMaterials: {},
    camera: cam,
  };
  assert.deepEqual(validateEffects(effects), []);
  const badFx = validateEffects({ ...effects, effects: [...effects.effects, { id: 'Arrow', label: 'x', kind: 'projectile', piece: () => {}, frames: 2, size: 4, follows: 'nope', events: [{ frame: 3, name: 'hit' }], roles: [] }] });
  for (const needle of ['lowercase', 'needs travel', 'unknown effect "nope"', 'outside its 2 frames']) assert.ok(badFx.some(p => p.includes(needle)), `effect problems reported: ${needle}`);
  const boltSheet = defineEffect({ catalog: effects, effect: 'bolt' });
  assert.equal(boltSheet.frames, 4);
  assert.equal(boltSheet.directions, 8, 'a projectile turns to its heading');
  const fx = (boltSheet.data as any).effect;
  assert.deepEqual([fx.kind, fx.layer, fx.travel.speed, fx.followsSheet], ['projectile', 'air', 200, 'vfx/burst']);
  assert.equal((defineEffect({ catalog: effects, effect: 'ring' }).data as any).effect.layer, 'ground', 'area effects lie on the floor');
  assert.ok(boltSheet.height > boltSheet.width, 'the cell has room for the floor under an effect in the air');
  drawEffectFrame(ctx, effects.effects[1], effects, cam, { frame: 4, dir: 0, options: {}, materials: {} });
  drawEffectFrame(ctx, effects.effects[0], effects, cam, { frame: 2, dir: 3, options: {}, materials: {} });
  assert.equal(seen[0].t, 1, 'a one-shot ends at t = 1');
  assert.equal(seen[1].t, 0.5, 'a loop runs frame ÷ frames');
  near(seen[1].yaw, facingYaw(3, 8));
  assert.equal(seen[1].height, 30);
  // floorTile: the region of a transition reaches the border straight, and a whole tile is the whole cell.
  const regions: { mask: number; bounds: { minX: number; maxX: number; minY: number; maxY: number }; full: boolean }[] = [];
  const floorStage = new Stage(cam);
  const floorObject = floorStage.object({ layer: 0 });
  for (const mask of [15, CORNER.SE | CORNER.SW]) {
    floorTile({ object: floorObject, ground: floorObject, camera: cam, grid, frame: Frame3.facing(vec3(0, 0, 0), Math.PI / 2), mask, variant: 0, dir: 0, directions: 1, yaw: Math.PI / 2, seed: 7, materials: {}, seam: () => {} }, { paint: t => void regions.push({ mask: t.mask, bounds: t.region.bounds, full: t.full }) });
  }
  floorStage.draw(ctx);
  const whole = regions.find(r => r.mask === 15)!;
  assert.ok(whole.full && Math.abs(whole.bounds.maxX - whole.bounds.minX - 32) < 1e-6, 'a whole tile covers the cell');
  const south = regions.find(r => r.mask !== 15)!;
  near(south.bounds.maxY, 12 + 0.7, 1e-3);
  console.log('✔ Scenery: grid, masks, transitions, scenes and tile sets passed.');
}

console.log('\n✨ @core/volume tests passed.\n');
