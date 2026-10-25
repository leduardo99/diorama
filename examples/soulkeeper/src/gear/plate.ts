/**
 * Plate: armour of fitted steel plates with gilded edges, made for the living body of `flesh.ts` —
 * a winged helm over the hair, a fitted cuirass over the torso, plate pauldrons, tassets over a
 * skirt, plate vambraces and plate greaves. Worn over a slight body (`flesh-torso` with a `width`
 * under 1, `fitted-sleeve`, `leggings`), they make a slim armoured figure rather than a bulky one.
 *
 * Every plate follows the skeleton's scale (`scaleOf`) like the flesh it covers, and the trunk
 * through `ctx.body`, so a hit recoils it and a death lays it flat; the helm is built on the shared
 * `headFrame`, so it turns with the face.
 *
 * Materials by role:
 * - `metal`: the plates;
 * - `trim` (optional): the gilded edges, bands and bosses (falls back to `metal`, so an outfit with
 *   no gilt gets plain steel).
 */

import { Polygon } from '@core/draw';
import { along, partFrame, ringsAlong, type Part } from '@core/rig';
import { Frame3, Round, Solid, Tube, UP, add3, cross3, dot3, lerp3, norm3, scale3, sub3, vec3, visibleArc, type Vec3 } from '@core/volume';
import { headFrame } from './heads';
import { trunkScale } from './torso';
import { armOf, legOf, plate, role, scaleOf, type NoOptions } from './util';

/** The gilded edge of a plate: the `trim` role, or the plate's own metal when the outfit has none. */
const gilt = (materials: Parameters<typeof role>[0]) => role(materials, 'trim', 'metal');

// ----------------------------------------------------------------------------------------------
// The winged helm
// ----------------------------------------------------------------------------------------------

/** Options of `wingedHelm`. */
export interface WingedHelmOptions {
  /** Scale of the dome, its rim and the wings. Default 1. */
  size?: number;
  /** The wings at the temples. Default true. */
  wings?: boolean;
  /** Scale of the wings alone. Default 1. */
  wingSize?: number;
  /** A raised ridge over the crown, front to back. Default true. */
  ridge?: boolean;
  /**
   * How far the rim rides up the forehead (0 just over the brows .. 1 high on the brow, a strip of
   * forehead showing under it). The dome rises with it, so the helm still sits on the hair. Default 0.
   */
  rise?: number;
}

/** The dome as [height along its axis, half-length forward, half-width], from the rim up. */
const DOME: [number, number, number][] = [[0, 5, 4.8], [1.2, 4.9, 4.7], [2.6, 4.3, 4.15], [3.8, 3, 2.9], [4.5, 1.45, 1.4], [4.75, 0.05, 0.05]];
/**
 * A wing's feathers, leading first: [elevation from the sweep towards the crown, how far the feather
 * turns out from straight back (radians, 0 back, π/2 out to the side), length, width].
 */
const WING_FEATHERS: [number, number, number, number][] = [[0.6, 0.3, 8.6, 2.1], [0.4, 0.5, 7.8, 2], [0.2, 0.75, 6.8, 1.9], [0, 1, 5.6, 1.7]];
/** How far the dome's axis leans back (radians): the rim rides above the brows and dips over the nape. */
const DOME_TILT = 0.32;

/**
 * A winged helm: a rounded steel dome whose rim rides high over the brow and low over the nape, so
 * the whole face reads under it (`rise` lifts it further, baring a strip of forehead) and the hair
 * falls out from under it at the sides and the back; a gilded band round the rim, a raised ridge
 * over the crown, and a wing at each temple — four steel feathers swept back from the temple and
 * fanned up, so they slant back in profile and open out from the front, the leading one edged in
 * gilt, from a gilded boss.
 * Rests on the hair (`on: '<hair id>'`) or the head: it is drawn over the hair it covers. The far
 * wing sorts by depth, so it hides behind the dome.
 * Slot: `head`. Roles: `metal`, `trim` (optional: the band, the bosses and the leading feathers' edge).
 */
export const wingedHelm: Part<WingedHelmOptions> = (ctx, { size = 1, wings = true, wingSize = 1, ridge = true, rise = 0 }) => {
  const { object: o, kit, materials, host } = ctx;
  const { head } = headFrame(ctx);
  const cam = kit.camera;
  const k = scaleOf(ctx) * size;
  const metal = role(materials, 'metal');
  const trim = gilt(materials);
  // A small lift over everything else on the head: the helm is the outermost piece there, so a
  // fringe that sweeps up under its rim never paints over the band.
  const lift = { bias: 3.5 * k, ...(host ? { on: host } : {}) };
  const axisUp = norm3(add3(scale3(head.up, Math.cos(DOME_TILT)), scale3(head.forward, -Math.sin(DOME_TILT))));
  const axisFwd = norm3(add3(scale3(head.forward, Math.cos(DOME_TILT)), scale3(head.up, Math.sin(DOME_TILT))));
  const frame = partFrame(head.at(-0.9 * k, 0, (2.9 + 1.6 * rise) * k), axisFwd, axisUp);
  const dome = Round.loft(DOME.map(([h, rx, ry]) => ({ center: frame.at(0, 0, h * k), rx: rx * k, ry: ry * k, axes: [frame.forward, frame.right] as [Vec3, Vec3] })));
  o.add(dome, metal, lift);
  // The band round the rim: the half that faces the camera.
  const band = visibleArc(cam, frame.at(0, 0, 0.35 * k), frame.forward, frame.right, 5.05 * k, 4.85 * k);
  if (band.length > 1) o.add(new Tube(band, 0.72 * k), trim, { on: dome });
  if (ridge) {
    // Over the crown from the brow to the nape, only where the dome turns to the camera.
    const run: Vec3[] = [];
    const flush = () => {
      if (run.length > 1) o.add(new Tube(run.slice(), { start: 0.75 * k, end: 0.75 * k }), metal, { on: dome });
      run.length = 0;
    };
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI;
      const fx = Math.cos(a);
      const h = 0.6 + 4.15 * Math.sin(a);
      const p = frame.at(fx * 4.9 * k * Math.sqrt(Math.max(0, 1 - (h / 4.85) ** 2)) + fx * 0.25 * k, 0, h * k + 0.2 * k);
      if (cam.faces(norm3(sub3(p, frame.at(0, 0, 0.6 * k))))) run.push(p);
      else flush();
    }
    flush();
  }
  if (wings) {
    const w = k * wingSize;
    // The feathers without the crease lines: four thin plates in a fan would stack their edges into
    // a dark tangle, so each wing reads as one steel shape with a gilded leading edge.
    const featherMetal = { ...metal, edge: undefined };
    for (const s of [-1, 1]) {
      // Each wing is a fan that curves like a bird's: the low feathers spread out sideways, the high
      // ones sweep back, all flaring away from the crown, so the fan opens from the front and from
      // the side alike instead of showing its edge.
      const rise = norm3(add3(scale3(head.up, Math.cos(0.3)), scale3(head.right, s * Math.sin(0.3))));
      const root = frame.at(0.3 * k, s * 4.4 * k, 2.4 * k);
      WING_FEATHERS.forEach(([theta, yaw, length, width], i) => {
        const back = norm3(add3(scale3(head.forward, -Math.cos(yaw)), scale3(head.right, s * Math.sin(yaw))));
        const dir = norm3(add3(scale3(back, Math.cos(theta)), scale3(rise, Math.sin(theta))));
        // The leading edge is the side towards the crown and the front.
        const hint = add3(head.up, scale3(head.forward, 0.6));
        const lead = norm3(sub3(hint, scale3(dir, dot3(hint, dir))));
        const L = length * w;
        const W = width * w;
        const thick = 0.55 * w;
        const normal = cross3(dir, lead);
        const feather = Solid.extrude(new Frame3(add3(root, scale3(normal, -thick / 2)), dir, lead, normal), Polygon.fromPoints([
          { x: 0, y: 0.42 * W }, { x: 0.5 * L, y: 0.5 * W }, { x: 0.86 * L, y: 0.34 * W }, { x: L, y: 0.12 * W },
          { x: 0.72 * L, y: -0.34 * W }, { x: 0.32 * L, y: -0.5 * W }, { x: 0, y: -0.42 * W },
        ]), thick);
        o.add(feather, featherMetal, { bias: 2 * k });
        if (i === 0) {
          const edge = [0.08, 0.5, 0.86, 0.98].map(u => add3(root, add3(scale3(dir, u * L), scale3(lead, (u < 0.6 ? 0.47 : u < 0.9 ? 0.36 : 0.16) * W))));
          o.add(new Tube(edge, { start: 0.28 * w, end: 0.12 * w }), trim, { on: feather });
        }
      });
      // The gilded boss the feathers spring from: over the dome on the side that faces the camera.
      const outward = norm3(add3(scale3(head.right, s), scale3(head.forward, 0.2)));
      const boss = Round.ellipsoid(partFrame(root, outward, head.up), 0.8 * w, 1.15 * w, 1.15 * w);
      o.add(boss, trim, cam.faces(outward) ? { on: dome } : { bias: 2 * k });
    }
  }
  return dome;
};

// ----------------------------------------------------------------------------------------------
// The cuirass
// ----------------------------------------------------------------------------------------------

/**
 * Rings of the cuirass, waist to neckline: [height above the chest joint, half-width, half-depth,
 * how far forward of the trunk's axis], on the 80-unit scale. A fitted breastplate: it ends at the
 * natural waist, narrowest just above its lower edge, swells forward over the chest and narrows
 * again to the neckline, so the trunk tapers from the chest to the waist.
 */
const CUIRASS_RINGS: [number, number, number, number][] = [
  [-13, 4.45, 3.65, 0.15],
  [-10.5, 4.0, 3.55, 0.2],
  [-6.5, 4.85, 4.05, 0.5],
  [-3, 5.85, 4.5, 0.65],
  [0.4, 6.05, 4.25, 0.35],
  [3.2, 5.1, 3.55, 0],
  [4.8, 3.7, 2.9, 0],
];

/** Options of `cuirass`. */
export interface CuirassOptions {
  /** Room added round the body it encloses, on every side. Default 0.4. */
  ease?: number;
  /** A raised keel down the middle of the breastplate, edged in gilt. Default true. */
  keel?: boolean;
  /** Scale of the shell's breadth (its width and depth; the heights stay). Default 1. */
  width?: number;
}

/**
 * A cuirass: a fitted breastplate and backplate as one steel shell from the natural waist to the
 * neckline, swelling over the chest and tapering to the waist, with a gilded band along the
 * neckline and the lower edge and a raised keel down the middle with a gilded line on it. It ends
 * at the waist, so tassets or a skirt hang from under its edge. It follows the trunk (`ctx.body`),
 * so a hit recoils it and a death lays it down. Worn over a body it rests `on` it
 * (`on: '<torso id>'`) and encloses it, the way a coat does; `ease` adds the room. The neck stays
 * bare above the neckline. Returns the shell, so other pieces can rest on it.
 * Slot: `chest`. Roles: `metal`, `trim` (optional: the bands and the keel's line).
 */
export const cuirass: Part<CuirassOptions> = (ctx, { ease = 0.4, keel = true, width = 1 }) => {
  const { object: o, kit, body, at, materials, host } = ctx;
  const { up, right: across, forward: chestFwd } = body;
  const cam = kit.camera;
  const k = scaleOf(ctx);
  const s = trunkScale(ctx);
  const c = at.frame.origin;
  const metal = role(materials, 'metal');
  const trim = gilt(materials);
  const centre = (h: number, fwd: number) => add3(c, add3(scale3(up, h * s), scale3(chestFwd, fwd * k * width)));
  const rings = CUIRASS_RINGS.map(([h, rx, ry, fwd]) => [h, rx * width, ry * width, fwd] as const);
  const shell = Round.loft(rings.map(([h, rx, ry, fwd]) => ({ center: centre(h, fwd), rx: (rx + ease) * k, ry: (ry + ease) * k, axes: [across, chestFwd] as [Vec3, Vec3] })));
  o.add(shell, metal, host ? { on: host } : {});
  // Half-width and half-depth of the shell at a height, and its centre there.
  const ringAt = (h: number) => {
    let i = 1;
    while (i < rings.length - 1 && h > rings[i][0]) i++;
    const w = Math.max(0, Math.min(1, (h - rings[i - 1][0]) / (rings[i][0] - rings[i - 1][0])));
    const mix = (j: 1 | 2 | 3) => rings[i - 1][j] + (rings[i][j] - rings[i - 1][j]) * w;
    return { rx: (mix(1) + ease) * k, ry: (mix(2) + ease) * k, at: centre(h, mix(3)) };
  };
  // The bands along the neckline and the lower edge: the half of each ring that faces the camera.
  const top = rings[rings.length - 1][0] - 0.4;
  const bottom = rings[0][0] + 0.55;
  for (const [h, w] of [[top, 0.7], [bottom, 0.8]] as const) {
    const ring = ringAt(h);
    const arc = visibleArc(cam, ring.at, across, chestFwd, ring.rx + 0.15 * k, ring.ry + 0.15 * k);
    if (arc.length > 1) o.add(new Tube(arc, w * k), trim, { on: shell });
  }
  // A point on the shell's surface at height h, at an angle round the trunk (0 straight ahead, positive towards the right).
  const surface = (h: number, angle: number, lift = 0.1) => {
    const ring = ringAt(h);
    return add3(ring.at, add3(scale3(chestFwd, Math.cos(angle) * (ring.ry + lift * k)), scale3(across, Math.sin(angle) * (ring.rx + lift * k))));
  };
  const normalAt = (h: number, angle: number) => {
    const ring = ringAt(h);
    return norm3(add3(scale3(chestFwd, Math.cos(angle) / ring.ry), scale3(across, Math.sin(angle) / ring.rx)));
  };
  // Only the runs that face the camera: a line on the far side would show through the shell.
  const line = (points: [number, number, number][], w: number, style: typeof metal) => {
    let run: Vec3[] = [];
    const flush = () => {
      if (run.length > 1) o.add(new Tube(run, w * k), style, { on: shell });
      run = [];
    };
    for (const [h, a, lift] of points) {
      if (cam.faces(normalAt(h, a))) run.push(surface(h, a, lift));
      else flush();
    }
    flush();
  };
  if (keel) {
    // The keel: a low steel ridge from the neckline to the lower edge, and one straight gilded line on its crest.
    const run: [number, number, number][] = [[top - 0.6, 0, 0.1], [0, 0, 0.25], [-3, 0, 0.3], [-6.5, 0, 0.25], [-10.5, 0, 0.15], [bottom + 0.4, 0, 0.1]];
    line(run, 1.1, metal);
    line(run.map(([h, a, lift]) => [h, a, lift + 0.35]), 0.38, trim);
  }
  return shell;
};

// ----------------------------------------------------------------------------------------------
// Plate pauldrons
// ----------------------------------------------------------------------------------------------

/** Options of `platePauldron`. */
export interface PlatePauldronOptions {
  /** Lames stepping down the upper arm under the cap, 0 to 3. Default 2. */
  lames?: number;
  /** Scale of the cap and its lames. Default 1. */
  size?: number;
}

/**
 * A plate pauldron shaped to the shoulder: a low steel cap over the joint, tilted out along the
 * slope of the shoulder, with a gilded rim, and narrower lames that step down the outside of the
 * upper arm under it, each overlapping the one below, so it reads as layered plates rather than a
 * ball. The lames follow the upper arm part of the way, so a raised arm carries them along. It
 * follows the trunk. Mirrored by side. Returns the cap.
 * Slot: `shoulder` (side -1 left, 1 right). Roles: `metal`, `trim` (optional: the rim).
 */
export const platePauldron: Part<PlatePauldronOptions> = (ctx, { lames = 2, size = 1 }) => {
  const { object: o, pose, kit, body, at, materials } = ctx;
  const { up, right: across, forward: chestFwd } = body;
  const cam = kit.camera;
  const k = scaleOf(ctx) * size;
  const side = at.side;
  const metal = role(materials, 'metal');
  const trim = gilt(materials);
  const [sh, el] = pose.chains[armOf(ctx, side).name];
  const arm = norm3(sub3(el, sh));
  // The cap's axis leans out over the arm, so the plate slopes down from the neck to the arm like
  // the shoulder under it, instead of standing up off it.
  const tilt = norm3(add3(up, scale3(across, 0.75 * side)));
  const base = add3(at.frame.origin, add3(scale3(up, 1.0 * k), scale3(across, 0.6 * side * k)));
  // Down the outside of the upper arm: halfway between straight down-and-out and the arm's own line.
  const step = norm3(lerp3(norm3(sub3(scale3(across, 0.45 * side), up)), arm, 0.5));
  const count = Math.max(0, Math.min(3, Math.round(lames)));
  // The lames first, from the lowest up, so each one above overlaps the one below.
  for (let i = count; i >= 1; i--) {
    const centre = add3(base, scale3(step, 1.75 * i * k));
    const lameUp = norm3(lerp3(tilt, scale3(step, -1), 0.2 * i));
    const lame = Round.ellipsoid(partFrame(centre, chestFwd, lameUp), (3.05 - 0.22 * i) * k, (3.15 - 0.3 * i) * k, 1.05 * k);
    o.add(lame, metal);
  }
  const capFrame = partFrame(base, chestFwd, tilt);
  const cap = Round.ellipsoid(capFrame, 3.2 * k, 3.35 * k, 1.9 * k);
  o.add(cap, metal);
  // The gilded rim along the cap's lower edge only, where it laps over the lames: seen from the side
  // a whole ring would read as a target on the shoulder.
  let run: Vec3[] = [];
  const flush = () => {
    if (run.length > 1) o.add(new Tube(run, 0.5 * k), trim, { on: cap });
    run = [];
  };
  for (const p of visibleArc(cam, capFrame.at(0, 0, -0.45 * k), capFrame.forward, capFrame.right, 3.22 * k, 3.38 * k)) {
    if (dot3(sub3(p, base), up) < 0.4 * k) run.push(p);
    else flush();
  }
  flush();
  return cap;
};

// ----------------------------------------------------------------------------------------------
// Tassets
// ----------------------------------------------------------------------------------------------

/** Options of `tassets`. */
export interface TassetsOptions {
  /** Length of the plates from their top, on the 80-unit scale. Default 12. */
  length?: number;
  /**
   * Height of the plates' top above the pelvis joint, on the 80-unit scale: 9.5 hangs them from
   * the waist, under the edge of a fitted cuirass; about 2.5 from the hips. Default 9.5.
   */
  top?: number;
  /** A gap down the front between the two front plates, where the skirt under them shows. Default true. */
  split?: boolean;
  /** The plate behind, over the seat. Default true. */
  back?: boolean;
}

/**
 * Tassets: a short skirt of steel plates hanging from the waist and flaring over the hips — two in
 * front, one on each side and one behind — each of two overlapping lames with a gilded hem. With
 * `split` the front pair stands apart, so the cloth skirt shows down the middle and the legs read
 * under it. The front plates follow their thigh, so they swing with the stride; once the body lies
 * they drape from the waist along the floor, the way the tabard does. Worn over a cloth skirt (a
 * `tunic` that rises to the waist).
 * Slot: `pelvis`. Roles: `metal`, `trim` (optional: the hems). Returns the front-left plate.
 */
export const tassets: Part<TassetsOptions> = (ctx, { length = 12, top: rise = 9.5, split = true, back = true }) => {
  const { object: o, pose, kit, body, at, materials, host } = ctx;
  const { up, hipRight, hipForward, lie } = body;
  const cam = kit.camera;
  const k = scaleOf(ctx);
  const metal = role(materials, 'metal');
  const trim = gilt(materials);
  const pelvis = at.frame.origin;
  const flatAway = (() => {
    const b = vec3(-up.x, -up.y, 0);
    return norm3(Math.hypot(b.x, b.y) > 1e-3 ? b : scale3(pose.frame.forward, -1));
  })();
  const thigh = (side: number) => {
    const chain = pose.chains[legOf(ctx, side).name];
    return norm3(sub3(chain[1], chain[0]));
  };
  // Each plate: its angle round the hips (0 ahead, positive to the right), width, and the leg it follows.
  const front = split ? { angle: 0.58, width: 3.5 } : { angle: 0.42, width: 5.6 };
  const plates: { angle: number; width: number; follow: number }[] = [
    { angle: -front.angle, width: front.width, follow: -1 },
    { angle: front.angle, width: front.width, follow: 1 },
    { angle: -1.5, width: 3.6, follow: 0 },
    { angle: 1.5, width: 3.6, follow: 0 },
    ...(back ? [{ angle: Math.PI, width: 6, follow: 0 }] : []),
  ];
  // The ring the plates hang from: round the waist when they start high, round the hips when low.
  const ahead = 5.6 - 0.17 * (rise - 2.6);
  const beside = 7 - 0.29 * (rise - 2.6);
  const L = length * k * (1 - 0.3 * lie);
  const on = host ? { on: host } : {};
  let first: ReturnType<typeof plate> | undefined;
  for (const p of plates) {
    const out = norm3(add3(scale3(hipForward, Math.cos(p.angle)), scale3(hipRight, Math.sin(p.angle))));
    const tangent = norm3(cross3(up, out));
    const top = add3(pelvis, add3(scale3(up, rise * k), add3(scale3(hipForward, Math.cos(p.angle) * ahead * k), scale3(hipRight, Math.sin(p.angle) * beside * k))));
    let down = norm3(add3(scale3(up, -1), scale3(out, 0.2)));
    if (p.follow !== 0) down = norm3(lerp3(down, add3(thigh(p.follow), scale3(out, 0.2)), 0.45));
    if (lie > 0) {
      const drop = Math.max(0, Math.min(0.95, (top.z - 0.6 * k) / L));
      down = norm3(lerp3(down, add3(scale3(flatAway, Math.sqrt(1 - drop * drop)), vec3(0, 0, -drop)), lie));
    }
    const W = p.width * k;
    const facing = cam.faces(out);
    // Only the plates on the camera's side rest on the skirt: one behind the body sorts by its own
    // depth, or resting on the skirt would lift it over the cuirass in front.
    const near = dot3(out, cam.viewDir) > -0.3 ? on : {};
    // Two lames: the upper one over the lower, the lower one hemmed in gilt.
    const lowerTop = add3(top, scale3(down, 0.45 * L));
    const lowerEdge: [number, number][] = [[0.5, 0.56], [0.56, 0.32], [0.58, 0], [0.56, -0.32], [0.5, -0.56]];
    const lower = plate(lowerTop, down, tangent, Polygon.fromPoints([{ x: 0, y: -W / 2 }, { x: 0, y: W / 2 }, ...lowerEdge.map(([x, y]) => ({ x: x * L, y: y * W }))]), 0.6 * k);
    o.add(lower, metal, near);
    const upper = plate(add3(top, scale3(out, 0.3 * k)), down, tangent, Polygon.fromPoints([
      { x: 0, y: -W * 0.46 }, { x: 0, y: W * 0.46 }, { x: 0.52 * L, y: W * 0.52 }, { x: 0.52 * L, y: -W * 0.52 },
    ]), 0.6 * k);
    // Resting on the skirt like the lower lame, added after it, so it laps over it without rising
    // over a cuirass that rests on the skirt too (`on` the lower lame would lift it over everything there).
    o.add(upper, metal, near);
    if (facing) {
      const hem = lowerEdge.map(([x, y]) => add3(lowerTop, add3(scale3(down, x * L), add3(scale3(tangent, y * W), scale3(out, 0.65 * k)))));
      o.add(new Tube(hem, 0.55 * k), trim, { on: lower });
    }
    first ??= lower;
  }
  return first;
};

// ----------------------------------------------------------------------------------------------
// Plate greaves
// ----------------------------------------------------------------------------------------------

/** Options of `plateGreave`. */
export interface PlateGreaveOptions {
  /** A small cop over the front of the knee. Default true. */
  kneeCop?: boolean;
}

/**
 * A plate greave fitted to the flesh leg: a slim steel shell down the shin from under the knee to
 * the ankle, swelling over the calf and narrowing to the ankle, and a small cop over the front of
 * the knee, plain steel with no band round the top (from above a band reads as a ring round the
 * knee). Pair it with a `boot` for the foot; over `leggings` it rests on them (`on: '<leggings id>'`).
 * Slot: `shin` (side -1 left, 1 right). Roles: `metal`. Returns the shin plate.
 */
export const plateGreave: Part<PlateGreaveOptions> = (ctx, { kneeCop = true }) => {
  const { object: o, pose, at, materials, host } = ctx;
  const k = scaleOf(ctx);
  const on = host ? { on: host } : {};
  const [, knee, ankle] = pose.chains[legOf(ctx, at.side).name];
  const metal = role(materials, 'metal');
  const shin = along([knee, ankle], [0.12, 0.36, 0.7, 0.97]);
  const shell = Round.loft(ringsAlong(shin, [[2.05 * k, 2.2 * k], [2.3 * k, 2.45 * k], [1.75 * k, 1.85 * k], [1.6 * k, 1.7 * k]], pose.frame.forward));
  // The bias keeps the plate over the leg it encloses and the boot's shaft under it.
  o.add(shell, metal, { bias: 13 * k, ...on });
  if (kneeCop) {
    const copFrame = partFrame(add3(knee, pose.frame.dir(1.75 * k, 0, 0.35 * k)), pose.frame.forward);
    const cop = Round.ellipsoid(copFrame, 0.8 * k, 1.45 * k, 1.4 * k);
    o.add(cop, metal, { bias: 14 * k, ...on });
  }
  return shell;
};

// ----------------------------------------------------------------------------------------------
// Plate vambraces
// ----------------------------------------------------------------------------------------------

/**
 * A plate vambrace: a steel shell round the forearm from below the elbow to the wrist, tapering
 * from the forearm's swell to the wrist and flaring a little there, with a gilded line along its
 * wrist edge. Wear it over a sleeve (or the bare arm), resting on it (`on: '<sleeve id>'`), and pair
 * it with a `glove`; a shield can rest on it.
 * Slot: `forearm` (side -1 left, 1 right). Roles: `metal`, `trim` (optional: the wrist edge). Returns the shell.
 */
export const plateVambrace: Part<NoOptions> = ctx => {
  const { object: o, pose, kit, at, materials, host } = ctx;
  const cam = kit.camera;
  const k = scaleOf(ctx);
  const [, el, ha] = pose.chains[armOf(ctx, at.side).name];
  const metal = role(materials, 'metal');
  const trim = gilt(materials);
  // Rounded off at the elbow end, so the shell reads as a fitted plate and not a cut pipe.
  const fore = along([el, ha], [0.24, 0.3, 0.55, 0.82, 0.97]);
  const shell = Round.loft(ringsAlong(fore, [[1.3 * k, 1.25 * k], [1.72 * k, 1.64 * k], [1.62 * k, 1.55 * k], [1.38 * k, 1.32 * k], [1.6 * k, 1.5 * k]], UP));
  // The bias keeps the plate over the sleeve it encloses.
  o.add(shell, metal, { bias: 4 * k, ...(host ? { on: host } : {}) });
  const ring = partFrame(fore[4], sub3(ha, el), UP);
  const band = visibleArc(cam, fore[4], ring.right, ring.up, 1.65 * k, 1.55 * k);
  if (band.length > 1) o.add(new Tube(band, 0.45 * k), trim, { on: shell });
  return shell;
};
