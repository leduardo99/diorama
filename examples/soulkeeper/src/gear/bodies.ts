/**
 * Bodies: the bone limbs, spine and rib cage a skeleton warrior wears its gear on.
 *
 * Everything is built for the `humanoid()` skeleton and follows the trunk through `ctx.body`, so
 * a hit recoils it and a death lays it flat. Materials by role:
 * - `boneLimb` (falls back to `bone`): limb bones, spine, ribs, collarbones;
 * - `hollow`: the dark inside of the rib cage.
 *
 * `boneLegs` is the base body (the outfit's `base`). Everything else is a part listed as a piece, in
 * the order it must be drawn: the spine and the rib cage over the tunic and belt (at exact depth
 * ties, such as a body lying flat, the piece listed later wins, and a base body is always first),
 * the arms and the skull with an `id` because gear rests on them (a shield on the forearm, a helm
 * on the skull).
 */

import { outfit, partFrame, type MaterialSet, type OutfitPiece, type OutfitSpec, type Part } from '@core/rig';
import { Blob, Round, Tube, add3, dot3, lerp3, norm3, scale3, sub3, visibleArc } from '@core/volume';
import { armOf, closedHand, knobbly, legOf, role, type NoOptions } from './util';

const boneLimb = (m: MaterialSet) => role(m, 'boneLimb', 'bone');

/**
 * One bone leg: femur, knee knob, shin and a bony foot as one mass.
 * Slot: `thigh` (side -1 left, 1 right). Roles: `boneLimb`.
 */
export const boneLeg: Part<NoOptions> = ctx => {
  const { object: o, pose, at } = ctx;
  const leg = legOf(ctx, at.side).name;
  const [hip, knee, ankle] = pose.chains[leg];
  const f = pose.frame;
  const foot = Round.ellipsoid(partFrame(add3(pose.joints[`${leg}.foot`], f.dir(1.8, 0, 0.9)), f.forward), 3.6, 1.9, 1.3);
  const bones = new Blob([new Tube([hip, knee], { start: 3, end: 2.1 }), Round.ellipsoid(partFrame(knee, f.forward), 2.1, 2.1, 2.2), new Tube([knee, ankle], { start: 2.2, end: 1.6 }), foot]);
  o.add(bones, boneLimb(ctx.materials));
  return bones;
};

/**
 * Spine from the pelvis to the chest and the neck vertebrae up to the skull.
 * Slot: `chest`. Roles: `boneLimb`. Needs the trunk joints `pelvis`, `chest`, `neck` and `head`.
 */
export const boneSpine: Part<NoOptions> = ({ object: o, pose, materials }) => {
  const j = pose.joints;
  const bone = boneLimb(materials);
  const spine = new Tube([j.pelvis, lerp3(j.pelvis, j.chest, 0.5), j.chest], knobbly(2.1, 6));
  o.add(spine, bone);
  o.add(new Tube([j.chest, j.neck, lerp3(j.neck, j.head, 0.35)], knobbly(1.9, 3)), bone);
  return spine;
};

/**
 * Hollow rib cage: a dark loft with ribs sloping down towards the sternum, the sternum, the back of
 * the spine seen through the ribs and both collarbones.
 * Slot: `chest`. Roles: `boneLimb`, `hollow`. Needs a trunk joint named `chest`.
 */
export const ribCage: Part<NoOptions> = ({ object: o, pose, kit, body, materials }) => {
  const j = pose.joints;
  const cam = kit.camera;
  const { up, right: across, forward: chestFwd } = body;
  const bone = boneLimb(materials);
  const c0 = add3(j.chest, scale3(up, -4.4));
  const at = (h: number, fwd = 0, side = 0) => add3(c0, add3(scale3(up, h), add3(scale3(chestFwd, fwd), scale3(across, side))));
  const hollow = Round.loft([
    { center: at(-5), rx: 4.4, ry: 3.4, axes: [across, chestFwd] },
    { center: at(-1), rx: 6, ry: 4.4, axes: [across, chestFwd] },
    { center: at(2.6), rx: 6.3, ry: 4.6, axes: [across, chestFwd] },
    { center: at(5), rx: 5, ry: 3.8, axes: [across, chestFwd] },
  ]);
  o.add(hollow, role(materials, 'hollow'));
  // Back of the spine, seen through the ribs from behind.
  o.add(new Tube([at(-5, -3.6), at(5, -3.4)], knobbly(1.8, 5)), bone);
  const ribs = [
    { h: 3.6, rx: 6.4, ry: 4.7 },
    { h: 1.3, rx: 6.6, ry: 4.8 },
    { h: -1, rx: 6.2, ry: 4.6 },
    { h: -3.2, rx: 5.2, ry: 4 },
  ];
  for (const r of ribs) {
    // Ribs slope down towards the sternum.
    const arc = visibleArc(cam, at(r.h), across, chestFwd, r.rx, r.ry, 0.02).map(p => sub3(p, scale3(up, Math.max(0, dot3(sub3(p, at(r.h)), chestFwd)) * 0.32)));
    if (arc.length) o.add(new Tube(arc, 1.25), bone, { on: hollow });
  }
  o.add(new Tube([at(4.8, 4.2), at(-2.4, 4.4)], { start: 1.7, end: 1.2 }), bone, { bias: 1.5 });
  for (const s of [-1, 1]) o.add(new Tube([at(4.9, 3.4), at(5.6, 1.6, s * 4.5), j[`${armOf({ kit }, s).name}.shoulder`]], 1.3), bone, { bias: 1 });
  return hollow;
};

/**
 * One bone arm: shoulder knob, humerus, elbow knob, forearm and a small hand as one mass.
 * Slot: `shoulder` (side -1 left, 1 right). Roles: `boneLimb`. Returns the arm so a shield or a
 * bracer can rest on it (`id` it in the outfit).
 */
export const boneArm: Part<NoOptions> = ctx => {
  const { object: o, pose, body, at } = ctx;
  const [sh, el, ha] = pose.chains[armOf(ctx, at.side).name];
  const d = norm3(sub3(ha, el));
  const arm = new Blob([
    Round.ellipsoid(partFrame(sh, body.forward, body.up), 2.3, 2.3, 2.3),
    new Tube([sh, el], { start: 2.3, end: 1.7 }),
    Round.ellipsoid(partFrame(el, pose.frame.forward), 1.7, 1.7, 1.7),
    new Tube([el, ha], { start: 1.8, end: 1.4 }),
    Round.ellipsoid(partFrame(add3(ha, scale3(d, 0.8)), d), 2.1, 1.7, 1.4),
  ]);
  o.add(arm, boneLimb(ctx.materials));
  return arm;
};

const LEGS: OutfitPiece[] = [
  { part: boneLeg, slot: 'thigh', side: -1 },
  { part: boneLeg, slot: 'thigh', side: 1 },
];

/**
 * The base body of a skeleton warrior: both bone legs. It is an outfit's `base` (`BaseInfo.skin`):
 * the outfit hands it its own materials as the fourth argument, so the legs wear the same `boneLimb`
 * as the rest of the bones.
 * Roles: `boneLimb` (falls back to `bone`).
 */
export const boneLegs: NonNullable<OutfitSpec['base']> = (object, pose, kit, materials) => outfit({ materials, pieces: LEGS })(object, pose, kit);

/**
 * An open bone hand, palm up: a flat palm, four fingers fanned a little and curling up at the tips,
 * and a thumb on the inner side. It sits at the wrist (the end of the forearm bone) and points along
 * the forearm; the palm faces the way the body's up does, so a raised forearm shows it open to the
 * sky. Pair it with a `coatSleeve` (the cuff covers the wrist) and a `palmFlame` above it. While
 * the hand holds something (`ctx.grip`) it is a plain bony fist round the handle instead (`closedHand`).
 * Slot: `hand` (side -1 left, 1 right). Roles: `boneLimb` (falls back to `bone`).
 */
export const boneHand: Part<NoOptions> = ctx => {
  const { object: o, at, materials } = ctx;
  const bone = boneLimb(materials);
  if (ctx.grip) return closedHand(ctx, ctx.grip, bone, 0.95);
  const f = at.frame;
  const palm = Round.ellipsoid(f.moved(2.2, 0, 0.1), 2.7, 2.4, 1);
  o.add(palm, bone);
  for (let i = 0; i < 4; i++) {
    const y = (i - 1.5) * 1.25;
    const len = 4.4 - 0.45 * Math.abs(i - 1.5) * 1.2 + (i === 1 || i === 2 ? 0.4 : 0);
    o.add(new Tube([f.at(3.6, y * 0.9, 0.4), f.at(3.6 + len * 0.55, y * 1.15, 0.9), f.at(3.6 + len, y * 1.3, 1.9)], { start: 1.15, end: 0.55 }), bone, { on: palm });
  }
  // The thumb on the side towards the body, kicked out and up.
  const inner = -at.side;
  o.add(new Tube([f.at(1.4, inner * 1.8, 0.2), f.at(2.9, inner * 3.2, 0.7), f.at(4.5, inner * 3.7, 1.5)], { start: 1.35, end: 0.6 }), bone, { on: palm });
  return palm;
};
