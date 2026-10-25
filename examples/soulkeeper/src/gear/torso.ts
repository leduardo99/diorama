/**
 * Torso: what a body wears around its trunk: a tunic, a tabard with torn panels, a baldric, and the
 * long coat: a fitted coat body, a bone rib breastplate over it, a high collar and the split skirt.
 *
 * All of it follows the trunk (`ctx.body`), so the hit recoil and the death topple carry it
 * along. Only what truly hangs (the tabard panels, which drape to the floor once the body lies)
 * looks at world up.
 */

import { createRng } from '@core';
import { Polygon } from '@core/draw';
import { partFrame, type Part, type PartContext } from '@core/rig';
import { Frame3, Round, Solid, Tube, UP, add3, cross3, dot3, lerp3, norm3, scale3, sub3, vec3, type Placed, type Vec3 } from '@core/volume';
import { legOf, plate, role, tornPanel } from './util';

/** Options of `tunic`. */
export interface TunicOptions {
  /** How far the hem hangs below the pelvis joint. Default 9. */
  hem?: number;
}

/**
 * A short tunic: a loft that widens from the waist to the hem. Lying down, the hem rides up a
 * little so the skirt does not trail past the cell. Returns the tunic, so a belt can rest on it.
 * Slot: `pelvis`. Roles: `cloth`.
 */
export const tunic: Part<TunicOptions> = ({ object: o, body, at, materials }, { hem = 9 }) => {
  const { up, hipRight, hipForward, lie } = body;
  const pelvis = at.frame.origin;
  const ring = (dz: number, side: number, depth: number) => ({ center: add3(pelvis, scale3(up, dz)), rx: side, ry: depth, axes: [hipRight, hipForward] as [Vec3, Vec3] });
  const skirt = Round.loft([ring(3, 6.2, 4.7), ring(-3, 7.2, 5.6), ring(-hem + 3 * lie, 8, 6.4)]);
  o.add(skirt, role(materials, 'cloth'));
  return skirt;
};

/** Options of `tabard`. */
export interface TabardOptions {
  /** Length of the panels. Default 14. */
  length?: number;
  /** Width of the panels. Default 6.4. */
  width?: number;
  /** Offsets of the torn hem teeth, front then back (each list is spread across the width). */
  tears?: [number[], number[]];
}

const TEARS: [number[], number[]] = [[0.4, 2.2, -0.3, 1.6, 0], [1.2, -0.2, 2, 0.3, 1]];

/**
 * A tabard: a front and a back panel with torn hems. The panels hang towards the knees, so they
 * swing a little with the stride; standing they follow the trunk axis, and once the body lies they
 * drape from the waist along the floor, away from the head, until the hem touches it.
 * Slot: `pelvis`. Roles: `clothAccent`. Returns the front panel.
 */
export const tabard: Part<TabardOptions> = ({ object: o, pose, kit, body, at, materials }, { length = 14, width = 6.4, tears = TEARS }) => {
  const j = pose.joints;
  const { up, hipRight, hipForward, lie } = body;
  const pelvis = at.frame.origin;
  const cloth = role(materials, 'clothAccent');
  const [first, second] = kit.skeleton.legs;
  const knees = lerp3(j[`${first.name}.knee`], j[`${second.name}.knee`], 0.5);
  const sway = sub3(knees, pelvis);
  const swing = scale3(sub3(sway, scale3(UP, dot3(sway, UP))), 1 - lie);
  const panel = length * (1 - 0.36 * lie);
  let front: Placed | undefined;
  for (const s of [1, -1]) {
    const top = add3(pelvis, add3(scale3(hipForward, s * 5.1), scale3(up, 2.2)));
    const hang = add3(scale3(up, -1), add3(scale3(hipForward, 0.28 * s), scale3(swing, 0.03)));
    let down = hang;
    if (lie > 0) {
      // Away from the head along the floor, sloping down until the hem touches it.
      const back = vec3(-up.x, -up.y, 0);
      const flat = norm3(Math.hypot(back.x, back.y) > 1e-3 ? back : scale3(pose.frame.forward, -1));
      const drop = Math.max(0, Math.min(0.95, (top.z - 0.6) / panel));
      const drape = add3(scale3(flat, Math.sqrt(1 - drop * drop)), vec3(0, 0, -drop));
      down = norm3(lerp3(norm3(hang), drape, lie));
    }
    const cut = plate(top, down, hipRight, tornPanel(panel, width, s > 0 ? tears[0] : tears[1]), 0.6);
    o.add(cut, cloth);
    front ??= cut;
  }
  return front;
};

/** Options of `baldric`. */
export interface BaldricOptions {
  /** Width of the strap. Default 1.5. */
  width?: number;
}

/**
 * A leather baldric from the shoulder it is worn on across the chest to the opposite hip, drawn as
 * a front and a back run (the back run sorts behind the body).
 * Slot: `shoulder` (side -1 over the left shoulder, 1 over the right). Roles: `leather`.
 * Needs the trunk joints `chest` and `pelvis`.
 */
export const baldric: Part<BaldricOptions> = ({ object: o, pose, body, at, materials }, { width = 1.5 }) => {
  const j = pose.joints;
  const { up, right: across, forward: chestFwd } = body;
  const side = at.side;
  const c0 = add3(j.chest, scale3(up, -4.4));
  const onChest = (h: number, fwd: number, sideways: number) => add3(c0, add3(scale3(up, h), add3(scale3(chestFwd, fwd), scale3(across, sideways))));
  const leather = role(materials, 'leather');
  let front: Placed | undefined;
  for (const s of [1, -1]) {
    const run = [
      add3(at.frame.origin, add3(scale3(chestFwd, s * 2.6), scale3(up, 0.8))),
      onChest(0.5, s * 5.2, -1.2 * side),
      add3(j.pelvis, add3(scale3(across, -5.2 * side), add3(scale3(chestFwd, s * 4.6), scale3(up, 3.4)))),
    ];
    const strap = new Tube(run, width);
    o.add(strap, leather, { bias: s > 0 ? 2.5 : -2.5 });
    front ??= strap;
  }
  return front;
};

/** The trunk's length against the 23 units between the pelvis and the chest of the 80-unit `humanoid()`. */
export function trunkScale(ctx: Pick<PartContext, 'kit'>): number {
  const t = ctx.kit.skeleton.trunk;
  const pelvis = t.find(j => j.name === 'pelvis') ?? t[0];
  const chest = t.find(j => j.name === 'chest') ?? t[t.length - 2];
  return Math.abs(chest.at[2] - pelvis.at[2]) / 23;
}

/** Rings of the coat's body, waist to neck: [height above the chest joint, half-width, half-depth], on the 80-unit scale. */
const COAT_RINGS: [number, number, number][] = [
  [-23.5, 5.6, 4.2],
  [-16, 4.9, 3.8],
  [-9, 5.8, 4.2],
  [-3, 6.8, 4.6],
  [1.2, 8.4, 4.4],
  [3.6, 6.4, 3.7],
  [5.6, 2.9, 2.7],
];

/** Half-width and half-depth of the coat's body at height `h` above the chest joint (80-unit scale). */
export function coatRing(h: number): [number, number] {
  const r = COAT_RINGS;
  if (h <= r[0][0]) return [r[0][1], r[0][2]];
  for (let i = 1; i < r.length; i++) {
    if (h <= r[i][0]) {
      const w = (h - r[i - 1][0]) / (r[i][0] - r[i - 1][0]);
      return [r[i - 1][1] + (r[i][1] - r[i - 1][1]) * w, r[i - 1][2] + (r[i][2] - r[i - 1][2]) * w];
    }
  }
  return [r[r.length - 1][1], r[r.length - 1][2]];
}

/** Options of `coatTorso`. */
export interface CoatTorsoOptions {
  /** Room added round the body the coat encloses, on every side. Default 0: the cut the bones were fitted for. */
  ease?: number;
}

/**
 * The body of a coat: one loft from the waist to the neck, narrow at the waist, a little fuller
 * over the ribs and wide across the shoulders, closing round the neck. It follows the trunk
 * (`ctx.body`), so a hit recoils it and a death lays it down. Returns the coat, so a sash and a
 * breastplate can rest on it.
 * Worn over a fuller body it rests `on` it (`on: '<torso id>'`), so the coat encloses it instead
 * of sorting under it, and `ease` adds the room that body needs — the way the hood rests on the
 * head.
 * Slot: `chest`. Roles: `cloth`.
 */
export const coatTorso: Part<CoatTorsoOptions> = (ctx, { ease = 0 }) => {
  const { object: o, body, at, materials, host } = ctx;
  const { up, right: across, forward: chestFwd } = body;
  const s = trunkScale(ctx);
  const c = at.frame.origin;
  const rings = COAT_RINGS.map(([h, rx, ry]) => ({ center: add3(c, scale3(up, h * s)), rx: rx + ease, ry: ry + ease, axes: [across, chestFwd] as [Vec3, Vec3] }));
  const coat = Round.loft(rings);
  o.add(coat, role(materials, 'cloth'), host ? { on: host } : {});
  return coat;
};

/** Options of `ribBreastplate`. */
export interface RibBreastplateOptions {
  /** Pairs of ribs, 3 to 6. Default 5. */
  ribs?: number;
}

/**
 * A bone rib cage worn over the coat as a breastplate: a dark plate on the front of the chest,
 * a sternum and pairs of ribs that curve round it and slope down towards the sternum, with the
 * collarbones running up to the shoulders. Only the front is armored: it draws nothing once the chest turns
 * its back to the camera (the coat shows alone), and every rib is cut where the chest turns away from it.
 * Rests on the coat (give it as the host).
 * Slot: `chest`. Roles: `boneLimb` (falls back to `bone`), `hollow` (the plate).
 */
export const ribBreastplate: Part<RibBreastplateOptions> = (ctx, { ribs = 5 }) => {
  const { object: o, pose, kit, body, at, materials, host } = ctx;
  const cam = kit.camera;
  const { up, right: across, forward: chestFwd } = body;
  // Only the front is armored: once the chest turns its back to the camera the coat shows alone. The plate rests
  // `on` the coat, so without this gate it would show through the coat from behind (guide 03: `on` only while its face is towards the camera).
  if (dot3(chestFwd, cam.viewDir) < -0.1) return;
  const s = trunkScale(ctx);
  const c = at.frame.origin;
  const bone = role(materials, 'boneLimb', 'bone');
  const at3 = (h: number, fwd = 0, side = 0) => add3(c, add3(scale3(up, h * s), add3(scale3(chestFwd, fwd), scale3(across, side))));
  const [rxMid, ryMid] = coatRing(-5.5);
  const plate0 = Round.ellipsoid(partFrame(at3(-5.5, ryMid - 1.3), chestFwd, up), 2.3, rxMid * 0.78, 9.2 * s);
  o.add(plate0, role(materials, 'hollow'), host ? { on: host } : {});
  const count = Math.max(3, Math.min(6, Math.round(ribs)));
  for (let i = 0; i < count; i++) {
    const h = -0.4 - i * (10.4 / count) * 1;
    const [rx, ry] = coatRing(h);
    const centre = at3(h);
    // Run of the ring that is in front of the chest and turned to the camera, sloping down to the sternum.
    const run: Vec3[] = [];
    const flush = () => {
      if (run.length > 1) o.add(new Tube(run.slice(), 1.2), bone, { on: plate0 });
      run.length = 0;
    };
    for (let k = 0; k <= 12; k++) {
      const th = ((38 + (104 * k) / 12) * Math.PI) / 180;
      const p = add3(centre, add3(scale3(across, Math.cos(th) * (rx + 0.5)), scale3(chestFwd, Math.sin(th) * (ry + 0.5))));
      const n = norm3(add3(scale3(across, Math.cos(th) / rx), scale3(chestFwd, Math.sin(th) / ry)));
      if (cam.faces(n)) run.push(sub3(p, scale3(up, Math.max(0, dot3(sub3(p, centre), chestFwd)) * 0.3)));
      else flush();
    }
    flush();
  }
  if (cam.faces(chestFwd)) {
    const frontOf = (h: number) => coatRing(h)[1] + 0.9;
    o.add(new Tube([at3(2.4, frontOf(2.4)), at3(-4, frontOf(-4)), at3(-10.4, frontOf(-10.4))], { start: 1.7, end: 1.2 }), bone, { on: plate0, bias: 1.5 });
  }
  // Collarbones from the top of the sternum out to the shoulders.
  const neckFront = coatRing(2.4)[1] + 0.7;
  for (const side of [-1, 1]) {
    const arm = (kit.skeleton.arms ?? []).find(a => a.side === side);
    if (!arm) continue;
    o.add(new Tube([at3(2.4, neckFront, 0), at3(3, neckFront - 0.4, side * 4), pose.joints[`${arm.name}.shoulder`]], 1.0), bone, { on: plate0, bias: 1 });
  }
  return plate0;
};

/** Options of `highCollar`. */
export interface HighCollarOptions {
  /** Scale of the collar's height. Default 1. */
  height?: number;
}

/**
 * A high collar open at the front: a wide flared plate behind the neck whose two tips rise on both
 * sides of the skull, and a swept-back wing on each side of the neck. All three follow the chest.
 * A thin trim follows the scalloped top edge of the back plate when the outfit has a `clothAccent`.
 * Slot: `chest`. Roles: `cloth`, `clothAccent` (optional: the trim). Returns the back plate.
 */
export const highCollar: Part<HighCollarOptions> = (ctx, { height = 1 }) => {
  const { object: o, body, at, materials } = ctx;
  const { up, right: across, forward: chestFwd } = body;
  const s = trunkScale(ctx);
  const cloth = role(materials, 'cloth');
  const neck = add3(at.frame.origin, scale3(up, 4.4 * s));
  const k = height;
  // Back plate: its profile lies in the plane of the shoulders and the trunk axis, leaning back a little.
  const lean = 0.25;
  const upBack = norm3(sub3(scale3(up, Math.cos(lean)), scale3(chestFwd, Math.sin(lean))));
  const backFrame = new Frame3(add3(neck, scale3(chestFwd, -2.2)), across, upBack, cross3(across, upBack)).moved(0, 0, -0.5);
  const back = Solid.extrude(backFrame, Polygon.fromPoints([
    { x: -3.4, y: 0 }, { x: -7.4, y: 3.6 * k }, { x: -9.8, y: 9 * k }, { x: -6, y: 6.8 * k }, { x: -2.2, y: 5.6 * k },
    { x: 0, y: 5.4 * k }, { x: 2.2, y: 5.6 * k }, { x: 6, y: 6.8 * k }, { x: 9.8, y: 9 * k }, { x: 7.4, y: 3.6 * k }, { x: 3.4, y: 0 },
  ]), 1);
  o.add(back, cloth);
  const trim = materials.clothAccent;
  if (trim) {
    const edge = [[-9.8, 9], [-6, 6.8], [-2.2, 5.6], [0, 5.4], [2.2, 5.6], [6, 6.8], [9.8, 9]].map(([x, y]) => backFrame.at(x, y * k, 1.1));
    o.add(new Tube(edge, 0.8), trim, { on: back });
  }
  for (const side of [-1, 1]) {
    const out = 0.38;
    const upWing = norm3(add3(scale3(up, Math.cos(out)), scale3(across, side * Math.sin(out))));
    const wingFrame = new Frame3(add3(neck, add3(scale3(across, 3.9 * side), scale3(chestFwd, -0.4))), chestFwd, upWing, cross3(chestFwd, upWing)).moved(0, 0, -0.5);
    o.add(Solid.extrude(wingFrame, Polygon.fromPoints([{ x: 2.6, y: 0 }, { x: -3.8, y: 0 }, { x: -4.6, y: 7.4 * k }, { x: -0.8, y: 4.8 * k }]), 1), cloth);
  }
  return back;
};

/** Options of `longCoat`. */
export interface LongCoatOptions {
  /** Length of the panels from the waist. Default: down to a hand's breadth above the ankles of the standing body, so the shins show. */
  length?: number;
  /** Seed of the torn hem. Default 'long-coat'. */
  seed?: string;
}

/**
 * The skirt of a long split coat: a wide back panel and two front tails that part at the middle,
 * each a flattened loft that flares to the hem and ends in torn tongues. The front tails follow
 * their leg (the hem swings with the stride), the back panel follows both a little. Once the body
 * lies, the panels drape from the waist along the floor away from the head and shorten, the way
 * the tabard does.
 * Slot: `pelvis`. Roles: `cloth`. Returns the back panel.
 */
export const longCoat: Part<LongCoatOptions> = (ctx, { length, seed = 'long-coat' }) => {
  const { object: o, pose, kit, body, at, materials } = ctx;
  const { up, hipRight, hipForward, lie } = body;
  const cloth = role(materials, 'cloth');
  const pelvis = at.frame.origin;
  const topLift = 2.6;
  const L = length ?? kit.skeleton.trunk[0].at[2] + topLift - 12;
  const rng = createRng(seed);
  const legs = [legOf(ctx, -1), legOf(ctx, 1)].map(l => {
    const chain = pose.chains[l.name];
    return norm3(sub3(chain[chain.length - 1], chain[0]));
  });
  const flatAway = (() => {
    const back = vec3(-up.x, -up.y, 0);
    return norm3(Math.hypot(back.x, back.y) > 1e-3 ? back : scale3(pose.frame.forward, -1));
  })();
  type Panel = { side: number; lat: [number, number]; fwd: [number, number]; half: [number, number]; thick: [number, number]; follow: Vec3; tongues: number };
  const panels: Panel[] = [
    { side: 0, lat: [0, 0], fwd: [-3, -3.8], half: [6.4, 12.4], thick: [2.4, 2.8], follow: norm3(add3(legs[0], legs[1])), tongues: 6 },
    { side: -1, lat: [4.3, 7.6], fwd: [2.6, 3.4], half: [3.1, 6.6], thick: [2.5, 3], follow: legs[0], tongues: 4 },
    { side: 1, lat: [4.3, 7.6], fwd: [2.6, 3.4], half: [3.1, 6.6], thick: [2.5, 3], follow: legs[1], tongues: 4 },
  ];
  let first: Placed | undefined;
  for (const p of panels) {
    const weight = p.side === 0 ? 0.3 : 0.62;
    const top = add3(pelvis, scale3(up, topLift));
    const hang = norm3(lerp3(scale3(up, -1), p.follow, weight));
    const panelL = L * (1 - 0.36 * lie);
    let dir = hang;
    if (lie > 0) {
      const drop = Math.max(0, Math.min(0.95, (top.z - 0.6) / panelL));
      dir = norm3(lerp3(hang, add3(scale3(flatAway, Math.sqrt(1 - drop * drop)), vec3(0, 0, -drop)), lie));
    }
    const mix = (pair: [number, number], u: number) => pair[0] + (pair[1] - pair[0]) * u;
    const sideSign = p.side === 0 ? 1 : p.side;
    const centre = (u: number, lateral = 0) => {
      const c = add3(top, add3(scale3(dir, panelL * u), add3(scale3(hipRight, sideSign * mix(p.lat, u) + lateral), scale3(hipForward, mix(p.fwd, u)))));
      const floor = mix(p.thick, u) + 0.5;
      return c.z < floor ? vec3(c.x, c.y, floor) : c;
    };
    const ends = [0, 0.3, 0.62, 0.88];
    const loft = Round.loft(ends.map(u => ({ center: centre(u), rx: mix(p.half, u), ry: mix(p.thick, u), axes: [hipRight, hipForward] as [Vec3, Vec3] })));
    o.add(loft, cloth);
    first ??= loft;
    // The torn hem: tongues of different lengths, tapering to a point, spread across the panel.
    for (let k = 0; k < p.tongues; k++) {
      const frac = ((k + 0.5) / p.tongues) * 2 - 1;
      const reach = 1.03 + rng.float(-0.11, 0.1) + (k % 2 ? 0.03 : 0);
      const base = centre(0.74, frac * mix(p.half, 0.74) * 0.92);
      const tip = centre(reach, frac * mix(p.half, reach) * 0.98 + rng.float(-0.5, 0.5));
      const mid = lerp3(base, tip, 0.5);
      o.add(new Tube([base, mid, tip], { start: ((mix(p.half, 0.74) * 1.84) / p.tongues) * rng.float(1.05, 1.5), end: 0.35 }), cloth, { on: loft });
    }
  }
  return first;
};
