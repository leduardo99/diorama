/**
 * Flesh bodies: a living head with a face, the torso it stands on, arms, hands and legs (the
 * `flesh-legs` base), and hair.
 *
 * Everything is built for the `humanoid()` skeleton and follows the trunk through `ctx.body`, the
 * way the bone family does, so a hit recoils it and a death lays it flat. The head is built on the
 * shared `headFrame`: standing it stays level whatever the trunk does; once the body lies it turns
 * its face towards the camera, so the expression still reads from every facing.
 *
 * The face reads three expression channels of `pose.extra`, each with a neutral default so an
 * outfit that never drives them still gets a resting face:
 * - `extra.brow` (-1 furrowed .. 1 raised, default 0): the brows' inner ends drop or lift;
 * - `extra.mouth` (0 closed .. 1 open, default 0): the lips part;
 * - `extra.eyes` (0 closed .. 1 open, default 1): the eyelids open and close.
 * On top of the channels the face reacts on its own: `extra.hurt` furrows the brow, parts the lips
 * and squints; once the body lies (`lie`, or `extra.dead` raised by a death) the eyes close and the
 * mouth slackens; in an idle clip (`clip.kind === 'idle'`) the eyes blink once a loop.
 *
 * Materials by role:
 * - `flesh`: skin (head, neck, torso, arms, hands, legs, feet);
 * - `hair`: brows and the hair parts (no hair part: the brows only);
 * - `hollow`: the mouth's inside, the eyes' dark.
 */

import { Polygon } from '@core/draw';
import { bump, outfit, partFrame, type OutfitPiece, type OutfitSpec, type Part } from '@core/rig';
import { Blob, Decal, Round, Tube, add3, norm3, scale3, sub3, vec3, type Vec3 } from '@core/volume';
import { headFrame } from './heads';
import { trunkScale } from './torso';
import { armOf, clamp01, legOf, role, tones, type NoOptions } from './util';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** A thin quad along a segment in a decal's 2D space (the brows' run on the face). */
const quad = (a: { x: number; y: number }, b: { x: number; y: number }, width: number) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (width / 2);
  const ny = (dx / l) * (width / 2);
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
};

/**
 * A living head: cranium, jaw and ears as one mass, a neck down to the collar, and a face — two
 * eyes with lids, two brows, a nose and a mouth — laid as flat marks on the face's plane, with
 * profile twins of the eyes on the sides so the head is not blank in the profile facings. The
 * brows take the `hair` role, so they match whatever the hair parts wear.
 * Slot: `head`. Roles: `flesh`, `hair`, `hollow`. Channels: `extra.brow`, `extra.mouth`,
 * `extra.eyes` (plus `extra.hurt` and `extra.dead`, which the face reads on its own).
 */
export const fleshHead: Part<NoOptions> = ctx => {
  const { object: o, pose, kit, materials } = ctx;
  const { head, faceFwd, up, lie } = headFrame(ctx);
  const flesh = role(materials, 'flesh');
  const skin = flesh.ramp;
  const hair = role(materials, 'hair');
  const hollow = tones(materials, 'hollow');

  // The expression channels, with the face's own reactions on top (see the file's doc).
  const hurt = pose.extra.hurt ?? 0;
  const dead = Math.max(lie, pose.extra.dead ?? 0);
  const brow = clamp((pose.extra.brow ?? 0) - 0.85 * hurt, -1, 1);
  const mouth = clamp01(Math.max(pose.extra.mouth ?? 0, 0.7 * hurt, 0.28 * dead));
  const blink = kit.clip.kind === 'idle' ? bump(kit.t, 0.8, 0.92) : 0;
  const eyes = clamp01((pose.extra.eyes ?? 1) * (1 - 0.4 * hurt)) * (1 - dead) * (1 - blink);
  const raise = Math.max(0, brow);
  const furrow = Math.max(0, -brow);

  // Cranium and the jaw/cheek mass under it, merged so the head reads as one volume.
  const skull = new Blob([
    Round.ellipsoid(head.moved(-0.4, 0, 0.7), 4.6, 4.25, 4.55),
    Round.ellipsoid(partFrame(head.at(2.3, 0, -2.7), faceFwd, up), 2.9, 3.3, 2.3),
  ]);
  o.add(skull, flesh);
  for (const s of [-1, 1]) o.add(Round.ellipsoid(head.moved(-0.6, s * 4.05, -0.9), 0.85, 0.5, 1.05), flesh, { on: skull });
  // The nose reads in profile: a small bump on the face's front.
  o.add(Round.ellipsoid(partFrame(head.at(4.1, 0, -1), faceFwd, up), 0.55, 0.5, 0.7), flesh, { on: skull });

  for (const s of [-1, 1]) {
    // Eye: the white (skin's lightest tone), the iris, the upper lid's crease; the lid closes by
    // flattening the white and the iris until only the crease reads.
    o.add(Decal.onFace(head, 'front', vec3(3.95, s * 1.55, -0.1), Polygon.ellipse(0.95, 0.68 * eyes + 0.08)), { fill: skin.lit }, { on: skull });
    o.add(Decal.onFace(head, 'front', vec3(3.97, s * 1.55, -0.14), Polygon.ellipse(0.5, 0.56 * eyes + 0.05)), { fill: hollow.dark }, { on: skull });
    o.add(Decal.onFace(head, 'front', vec3(3.95, s * 1.55, 0.62), Polygon.rect(1.2, 0.3)), { fill: skin.dark }, { on: skull });
    // Brow: a hair run over the eye, drawn on the face's plane (decal space: x runs towards the
    // character's left, y downwards); the inner end drops when the face furrows, lifts when it raises.
    const browAt = (side: number, up2: number) => ({ x: -s * side, y: -up2 });
    o.add(
      Decal.onFace(head, 'front', vec3(4.5, 0, 0), Polygon.fromPoints(quad(browAt(2.6, 1.35 + 0.35 * raise), browAt(0.85, 1.75 + 0.5 * raise - 0.9 * furrow), 0.62))),
      { fill: hair.ramp.base },
      { on: skull },
    );
    // Profile twins: the eye and the brow on the side of the head, so profile facings keep a face.
    const side = s > 0 ? 'right' : 'left';
    o.add(Decal.onFace(head, side, vec3(2.75, s * 4.28, -0.1), Polygon.ellipse(0.55, 0.6 * eyes + 0.05)), { fill: hollow.dark }, { on: skull });
    o.add(Decal.onFace(head, side, vec3(2.7, s * 4.28, 1.45 + 0.35 * raise - 0.45 * furrow), Polygon.rect(1.35, 0.55)), { fill: hair.ramp.base }, { on: skull });
  }
  // Nose shadow and mouth on the face's front; the mouth is a thin line at rest that opens into an oval.
  o.add(Decal.onFace(head, 'front', vec3(4.45, 0, -1.35), Polygon.triangle(1, 1.1)), { fill: skin.dark }, { on: skull });
  o.add(Decal.onFace(head, 'front', vec3(5, 0, -2.35), Polygon.ellipse(0.95 + 0.35 * mouth, 0.18 + 0.7 * mouth)), { fill: hollow.dark }, { on: skull });
  return skull;
};

/**
 * The living trunk, neck included: one loft from the waist up through the ribs and the chest's
 * breadth to a neck that ends under the jaw, so the head never floats and garments sit on a body,
 * not on air. Follows the trunk, so a hit recoils it and a death lays it down. Returns the loft,
 * so garments can rest on it.
 * Slot: `chest`. Roles: `flesh`.
 */
export const fleshTorso: Part<NoOptions> = ctx => {
  const { object: o, body, at, materials } = ctx;
  const { up, right: across, forward: chestFwd } = body;
  const s = trunkScale(ctx);
  const c = at.frame.origin;
  const ring = (h: number, rx: number, ry: number) => ({ center: add3(c, scale3(up, h * s)), rx, ry, axes: [across, chestFwd] as [Vec3, Vec3] });
  const torso = Round.loft([ring(-20.5, 5.2, 3.9), ring(-14, 4.9, 3.7), ring(-8, 5.5, 4), ring(-2.5, 6.7, 4.4), ring(0.8, 7.6, 4.3), ring(3.4, 6, 3.6), ring(6, 2.9, 2.6), ring(9, 2.35, 2.1)]);
  o.add(torso, role(materials, 'flesh'));
  return torso;
};

/**
 * A cap of short-cropped hair over the crown and the back of the head, its front edge a fringe
 * above the brows; a few tufts along the hairline keep the edge from reading as a swim cap.
 * Rests on the head (`on: '<head id>'`, `requires` the flesh head).
 * Slot: `head`. Roles: `hair`.
 */
export const hairCrop: Part<NoOptions> = ctx => {
  const { object: o, materials, host } = ctx;
  const { head } = headFrame(ctx);
  const hair = role(materials, 'hair');
  const on = host ? { on: host } : {};
  const cap = Round.ellipsoid(head.moved(-1.15, 0, 1.45), 4.75, 4.4, 4.4);
  o.add(cap, hair, on);
  for (const s of [-1, 1]) {
    o.add(new Tube([head.at(4.15, s * 3, 1.9), head.at(4.5, s * 1.7, 2.3), head.at(4.4, s * 0.5, 2.5)], { start: 0.85, end: 0.5 }), hair, on);
    // Sideburns down beside the ear.
    o.add(new Tube([head.at(0.4, s * 4.35, 1.4), head.at(0.2, s * 4.45, -0.2)], { start: 0.8, end: 0.45 }), hair, on);
  }
  return cap;
};

/**
 * A sleek cap drawn back into a tail: the hair hugs the skull (a shorter fringe than the crop) and
 * a tied fall runs from the crown down past the nape, following the head, so it lies with it.
 * Rests on the head (`on: '<head id>'`, `requires` the flesh head).
 * Slot: `head`. Roles: `hair`.
 */
export const hairTail: Part<NoOptions> = ctx => {
  const { object: o, materials, host } = ctx;
  const { head, lie } = headFrame(ctx);
  const hair = role(materials, 'hair');
  const on = host ? { on: host } : {};
  const cap = Round.ellipsoid(head.moved(-1.35, 0, 1.55), 4.7, 4.35, 4.4);
  o.add(cap, hair, on);
  // The fall: gathered at the crown, it hangs past the nape and slackens when the head lies.
  const drop = 1 - 0.4 * lie;
  const tie = Round.ellipsoid(head.moved(-4.5, 0, 2.6), 1.1, 1, 1.1);
  o.add(tie, hair, on);
  o.add(
    new Tube(
      [head.at(-4.9, 0, 2.2), head.at(-5.4, 0.6, -1.8 * drop), head.at(-4.4, 0.4, -6.2 * drop)],
      { start: 1.9, end: 0.8 },
    ),
    hair,
    on,
  );
  for (const s of [-1, 1]) o.add(new Tube([head.at(4.2, s * 2.4, 2.1), head.at(4.45, s * 1.2, 2.5), head.at(4.3, s * 0.2, 2.6)], { start: 0.7, end: 0.45 }), hair, on);
  return cap;
};

/**
 * One fleshed arm: a rounded shoulder, upper arm, elbow, forearm and a wrist nub as one mass,
 * thicker than the bone arm's bare bones. Returns the arm so a bracer or a sleeve can rest on it.
 * Slot: `shoulder` (side -1 left, 1 right). Roles: `flesh`.
 */
export const fleshArm: Part<NoOptions> = ctx => {
  const { object: o, pose, body, at } = ctx;
  const [sh, el, ha] = pose.chains[armOf(ctx, at.side).name];
  const d = norm3(sub3(ha, el));
  const arm = new Blob([
    Round.ellipsoid(partFrame(sh, body.forward, body.up), 3, 3, 3),
    new Tube([sh, el], { start: 3.1, end: 2.35 }),
    Round.ellipsoid(partFrame(el, pose.frame.forward), 2.2, 2.2, 2.2),
    new Tube([el, ha], { start: 2.4, end: 1.9 }),
    Round.ellipsoid(partFrame(add3(ha, scale3(d, 0.5)), d), 2, 1.7, 1.5),
  ]);
  o.add(arm, role(ctx.materials, 'flesh'));
  return arm;
};

/**
 * A relaxed flesh hand: a palm a little thicker than the bone hand's, four fingers curled a
 * little, and a thumb on the inner side; it sits at the wrist and points along the forearm.
 * Pair it with a `glove` (the glove's cuff covers the wrist) or a held item.
 * Slot: `hand` (side -1 left, 1 right). Roles: `flesh`.
 */
export const fleshHand: Part<NoOptions> = ctx => {
  const { object: o, at, materials } = ctx;
  const flesh = role(materials, 'flesh');
  const f = at.frame;
  const palm = Round.ellipsoid(f.moved(2.2, 0, 0.1), 2.8, 2.5, 1.2);
  o.add(palm, flesh);
  for (let i = 0; i < 4; i++) {
    const y = (i - 1.5) * 1.35;
    const len = 4.5 - 0.45 * Math.abs(i - 1.5) * 1.2 + (i === 1 || i === 2 ? 0.4 : 0);
    o.add(new Tube([f.at(3.7, y * 0.9, 0.4), f.at(3.7 + len * 0.55, y * 1.15, 0.9), f.at(3.7 + len, y * 1.3, 1.9)], { start: 1.15, end: 0.6 }), flesh, { on: palm });
  }
  // The thumb on the side towards the body, kicked out and up.
  const inner = -at.side;
  o.add(new Tube([f.at(1.4, inner * 1.9, 0.2), f.at(3, inner * 3.3, 0.7), f.at(4.6, inner * 3.8, 1.5)], { start: 1.4, end: 0.65 }), flesh, { on: palm });
  return palm;
};

/**
 * One fleshed leg: thigh, knee, shin and a shod-able foot as one mass, the flesh counterpart of
 * `boneLeg`. The foot is the bare foot a `boot` covers.
 * Slot: `thigh` (side -1 left, 1 right). Roles: `flesh`.
 */
export const fleshLeg: Part<NoOptions> = ctx => {
  const { object: o, pose, at } = ctx;
  const leg = legOf(ctx, at.side).name;
  const [hip, knee, ankle] = pose.chains[leg];
  const f = pose.frame;
  const foot = Round.ellipsoid(partFrame(add3(pose.joints[`${leg}.foot`], f.dir(1.9, 0, 0.8)), f.forward), 3.9, 2.05, 1.5);
  const mass = new Blob([new Tube([hip, knee], { start: 3.4, end: 2.5 }), Round.ellipsoid(partFrame(knee, f.forward), 2.3, 2.3, 2.4), new Tube([knee, ankle], { start: 2.5, end: 1.85 }), foot]);
  o.add(mass, role(ctx.materials, 'flesh'));
  return mass;
};

/** The hips the `flesh-legs` base hangs its legs from, so the crotch is not a gap between two tubes. */
const fleshHip: Part<NoOptions> = ctx => {
  const { object: o, body, at, materials } = ctx;
  const { up, hipRight, hipForward } = body;
  const hip = Round.ellipsoid(partFrame(add3(at.frame.origin, scale3(up, 1)), hipForward, up), 4.4, 5.9, 4);
  o.add(hip, role(materials, 'flesh'));
  return hip;
};

const FLESH_BASE: OutfitPiece[] = [
  { part: fleshHip, slot: 'pelvis' },
  { part: fleshLeg, slot: 'thigh', side: -1 },
  { part: fleshLeg, slot: 'thigh', side: 1 },
];

/**
 * The base body of a living figure: the hips and both flesh legs. It is an outfit's `base`
 * (`BaseInfo.skin`): the outfit hands it its own materials as the fourth argument, so the legs and
 * hips wear the same `flesh` as the rest of the body.
 * Roles: `flesh`.
 */
export const fleshLegs: NonNullable<OutfitSpec['base']> = (object, pose, kit, materials) => outfit({ materials, pieces: FLESH_BASE })(object, pose, kit);
