/**
 * Flesh bodies: a living head with a face, the torso it stands on, arms, hands and legs (the
 * `flesh-legs` base), and hair.
 *
 * Everything is built for the `humanoid()` skeleton and follows the trunk through `ctx.body`, the
 * way the bone family does, so a hit recoils it and a death lays it flat. The head is built on the
 * shared `headFrame`: standing it stays level whatever the trunk does; once the body lies it turns
 * its face towards the camera, so the expression still reads from every facing.
 *
 * Every measure follows the skeleton's scale (`scaleOf`: its height against the 80-unit
 * `humanoid()`), so a hero-sized `humanoid(1.18)` gets a body, a head and hair of its own size, not
 * a villager's stretched over longer bones.
 *
 * The face reads three expression channels of `pose.extra`, each with a neutral default so an
 * outfit that never drives them still gets a resting face:
 * - `extra.brow` (-1 furrowed .. 1 raised, default 0): the brows' inner ends drop or lift;
 * - `extra.mouth` (0 closed .. 1 open, default 0): the lips part;
 * - `extra.eyes` (0 closed .. 1 open, default 1): the eyelids open and close.
 * On top of the channels the face reacts on its own: `extra.hurt` furrows the brow, parts the lips
 * and squints; once the body lies (`lie`, or `extra.dead` raised by a death) the eyes close and the
 * mouth slackens; in an idle clip (`clip.kind === 'idle'`) the eyes blink once a loop. The head's
 * own options set the resting face a channel moves from: a `smile`, arched brows (`arch`) and a
 * lash line (`lashes`).
 *
 * Materials by role:
 * - `skin`: the living body (head, neck, torso, arms, hands, legs, feet);
 * - `hair`: brows and the hair parts (no hair part: the brows only);
 * - `hollow`: the mouth's inside, the eyes' dark.
 */

import { Polygon } from '@core/draw';
import { bump, outfit, partFrame, type OutfitPiece, type OutfitSpec, type Part } from '@core/rig';
import { Blob, Decal, Round, Tube, add3, dot3, norm3, scale3, sub3, vec3, type Vec3 } from '@core/volume';
import { headFrame } from './heads';
import { trunkScale } from './torso';
import { armOf, clamp01, legOf, role, scaleOf, tones, type NoOptions } from './util';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * A thin strip along a polyline in a decal's 2D space, `widths` given at each point (an arched brow).
 * The sides are offset along the averaged normal at each inner point, so the strip bends without gaps.
 */
const strip = (points: { x: number; y: number }[], widths: number[]) => {
  const normal = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
  };
  const side = points.map((p, i) => {
    const n0 = normal(points[Math.max(0, i - 1)], points[Math.max(1, i)]);
    const n1 = normal(points[Math.min(points.length - 2, i)], points[Math.min(points.length - 1, i + 1)]);
    const nx = n0.x + n1.x;
    const ny = n0.y + n1.y;
    const l = Math.hypot(nx, ny) || 1;
    return { x: (nx / l) * (widths[i] / 2), y: (ny / l) * (widths[i] / 2) };
  });
  return [...points.map((p, i) => ({ x: p.x + side[i].x, y: p.y + side[i].y })), ...points.map((p, i) => ({ x: p.x - side[i].x, y: p.y - side[i].y })).reverse()];
};

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

/** Options of `fleshHead`: the resting face, which the expression channels move from. */
export interface FleshHeadOptions {
  /** A resting smile: the mouth's corners lift (0 a straight line .. 1 a clear smile). Default 0. */
  smile?: number;
  /** Arched brows: each brow rises to a peak over the middle of the eye (0 straight .. 1 a high arch). Default 0. */
  arch?: number;
  /** A dark lash line along the upper lids, flicked up at the outer corners. Default false. */
  lashes?: boolean;
}

/**
 * A living head: cranium, jaw and ears as one mass, a neck down to the collar, and a face — two
 * eyes with lids, two brows, a nose and a mouth — laid as flat marks on the face's plane. Each
 * mark shows only where its face turns to the camera: the front face carries both eyes while it
 * dominates (through the 3/4 facings, so a facing never shows more than two eyes), and only near
 * the profile facings does the turned side carry its single eye, brow and mouth edge. The brows
 * take the `hair` role, so they match whatever the hair parts wear.
 * Slot: `head`. Roles: `skin`, `hair`, `hollow`. Channels: `extra.brow`, `extra.mouth`,
 * `extra.eyes` (plus `extra.hurt` and `extra.dead`, which the face reads on its own).
 * Options (`FleshHeadOptions`): `smile`, `arch`, `lashes`, the resting face; at their defaults the
 * face is the plain one.
 */
export const fleshHead: Part<FleshHeadOptions> = (ctx, { smile = 0, arch = 0, lashes = false } = {}) => {
  const { object: o, pose, kit, materials } = ctx;
  const { head, faceFwd, up, lie } = headFrame(ctx);
  const k = scaleOf(ctx);
  const skin = role(materials, 'skin');
  const tone = skin.ramp;
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
  // A smile fades as the face hurts or goes slack.
  const grin = clamp01(smile) * (1 - hurt) * (1 - dead);

  // Which side of the head turns to the camera. The marks draw only on the face they belong to:
  // the front while the face dominates or ties (S through the 3/4 facings, so a facing never shows
  // more than two eyes), the turned side only near the profile facings, and nothing once the back
  // of the head shows — no stray marks at NW, NE or N.
  const view = kit.camera.viewDir;
  const ahead = dot3(view, faceFwd);
  const aside = dot3(view, head.right);
  const frontOn = ahead >= Math.abs(aside) - 0.02;
  const sideOn = Math.abs(aside) >= 0.6 && ahead < 0.35 ? Math.sign(aside) : 0;

  // Cranium and the jaw/cheek mass under it, merged so the head reads as one volume.
  const skull = new Blob([
    Round.ellipsoid(head.moved(-0.4 * k, 0, 0.7 * k), 4.6 * k, 4.25 * k, 4.55 * k),
    Round.ellipsoid(partFrame(head.at(2.3 * k, 0, -2.7 * k), faceFwd, up), 2.9 * k, 3.3 * k, 2.3 * k),
  ]);
  o.add(skull, skin);
  // Ears stay on the head's sides in every facing; the ear on the far side hides once the head
  // turns enough for it to read as a stray oval instead of an ear.
  for (const s of [-1, 1]) if (s * aside > -0.4) o.add(Round.ellipsoid(head.moved(-0.6 * k, s * 4.05 * k, -0.9 * k), 0.8 * k, 0.45 * k, 0.95 * k), skin, { on: skull });
  // The nose reads in profile: a small bump on the face's front. Only while the face carries
  // marks — at rear facings it would poke out of the silhouette as a stray lump.
  if (frontOn || sideOn !== 0) o.add(Round.ellipsoid(partFrame(head.at(4.1 * k, 0, -1 * k), faceFwd, up), 0.55 * k, 0.5 * k, 0.7 * k), skin, { on: skull });

  if (frontOn) {
    for (const s of [-1, 1]) {
      // Eye: the white (skin's lightest tone), the iris, the upper lid's crease; the lid closes by
      // flattening the white and the iris until only the crease reads. The iris rests on the white:
      // it sits a hair lower, so by depth alone the white would paint over it.
      const white = Decal.onFace(head, 'front', vec3(3.95 * k, s * 1.75 * k, -0.15 * k), Polygon.ellipse(1.25 * k, (0.9 * eyes + 0.1) * k));
      o.add(white, { fill: tone.lit }, { on: skull });
      o.add(Decal.onFace(head, 'front', vec3(3.97 * k, s * 1.75 * k, -0.2 * k), Polygon.ellipse(0.7 * k, (0.74 * eyes + 0.06) * k)), { fill: hollow.dark }, { on: white });
      if (lashes) {
        // The lash line rides the top of the white as the lid closes, and flicks up at the outer
        // corner (decal space: x runs towards the character's left, so the outer corner is at -s).
        const lid = -0.15 + (0.9 * eyes + 0.1) * 0.95;
        const line = [
          { x: s * 1.05, y: 0.12 }, { x: s * 0.3, y: -0.1 }, { x: -s * 0.5, y: -0.08 }, { x: -s * 1.2, y: 0.02 }, { x: -s * 1.55, y: -0.42 },
          { x: -s * 1.15, y: 0.36 }, { x: -s * 0.45, y: 0.26 }, { x: s * 0.35, y: 0.24 }, { x: s * 1.05, y: 0.36 },
        ].map(p => ({ x: p.x * k, y: p.y * k }));
        o.add(Decal.onFace(head, 'front', vec3(3.97 * k, s * 1.75 * k, lid * k), Polygon.fromPoints(line)), { fill: hollow.dark }, { on: white });
      } else {
        o.add(Decal.onFace(head, 'front', vec3(3.95 * k, s * 1.75 * k, 0.78 * k), Polygon.rect(1.6 * k, 0.4 * k)), { fill: tone.dark }, { on: skull });
      }
      // Brow: a hair run over the eye, drawn on the face's plane (decal space: x runs towards the
      // character's left, y downwards); the inner end drops when the face furrows, lifts when it
      // raises. Arched, it rises to a peak over the eye and thins towards the temple.
      const browAt = (side: number, up2: number) => ({ x: -s * side * k, y: -up2 * k });
      const outer = 1.45 + 0.35 * raise;
      const inner = 1.9 + 0.5 * raise - 0.95 * furrow;
      const run = arch > 0
        ? strip([browAt(3, outer - 0.1 * arch), browAt(2.05, (outer + inner) / 2 + 0.5 * arch), browAt(0.75, inner)], [0.5 * k, 0.8 * k, 0.78 * k])
        : quad(browAt(2.9, outer), browAt(0.75, inner), 0.75 * k);
      o.add(Decal.onFace(head, 'front', vec3(4.5 * k, 0, 0), Polygon.fromPoints(run)), { fill: hair.ramp.base }, { on: skull });
    }
    // Nose shadow and mouth on the face's front; the mouth is a thin line at rest that opens into an
    // oval, and with a smile its corners lift into a soft crescent.
    o.add(Decal.onFace(head, 'front', vec3(4.45 * k, 0, -1.45 * k), Polygon.triangle(1.2 * k, 1.3 * k)), { fill: tone.dark }, { on: skull });
    if (grin > 0) {
      const w = 1.15 + 0.4 * mouth + 0.15 * grin;
      const lift = 0.55 * grin;
      const thick = 0.22 + 0.75 * mouth;
      const n = 7;
      const at = (i: number) => {
        const u = (i / (n - 1)) * 2 - 1;
        return { x: u * w, c: lift * (0.35 - u * u), t: thick * (1 - 0.6 * u * u) };
      };
      const top = Array.from({ length: n }, (_, i) => at(i)).map(p => ({ x: p.x * k, y: (p.c - p.t / 2) * k }));
      const bottom = Array.from({ length: n }, (_, i) => at(n - 1 - i)).map(p => ({ x: p.x * k, y: (p.c + p.t / 2) * k }));
      o.add(Decal.onFace(head, 'front', vec3(5 * k, 0, -2.4 * k), Polygon.fromPoints([...top, ...bottom])), { fill: hollow.dark }, { on: skull });
    } else {
      o.add(Decal.onFace(head, 'front', vec3(5 * k, 0, -2.4 * k), Polygon.ellipse((1.15 + 0.4 * mouth) * k, (0.22 + 0.75 * mouth) * k)), { fill: hollow.dark }, { on: skull });
    }
  }
  if (sideOn) {
    // The profile marks, on the one side of the head that faces the camera: a single eye and brow
    // and the mouth's near corner (the nose's bump is a mass, and already reads).
    const side = sideOn > 0 ? 'right' : 'left';
    const y = sideOn * 4.25 * k;
    o.add(Decal.onFace(head, side, vec3(2.9 * k, y, -0.05 * k), Polygon.ellipse(0.7 * k, (0.75 * eyes + 0.07) * k)), { fill: hollow.dark }, { on: skull });
    o.add(Decal.onFace(head, side, vec3(2.85 * k, y, (1.55 + 0.35 * raise - 0.5 * furrow) * k), Polygon.rect(1.6 * k, 0.65 * k)), { fill: hair.ramp.base }, { on: skull });
    o.add(Decal.onFace(head, side, vec3(4.1 * k, sideOn * 4.1 * k, -2.15 * k), Polygon.rect(1.1 * k, (0.22 + 0.45 * mouth) * k)), { fill: hollow.dark }, { on: skull });
  }
  return skull;
};

/**
 * The living trunk, neck included: one loft from the waist up through the ribs and the chest's
 * breadth to a neck that ends under the jaw, so the head never floats and garments sit on a body,
 * not on air. Follows the trunk, so a hit recoils it and a death lays it down. Returns the loft,
 * so garments can rest on it.
 * Slot: `chest`. Roles: `skin`.
 */
export const fleshTorso: Part<NoOptions> = ctx => {
  const { object: o, body, at, materials } = ctx;
  const { up, right: across, forward: chestFwd } = body;
  const s = trunkScale(ctx);
  const k = scaleOf(ctx);
  const c = at.frame.origin;
  const ring = (h: number, rx: number, ry: number) => ({ center: add3(c, scale3(up, h * s)), rx: rx * k, ry: ry * k, axes: [across, chestFwd] as [Vec3, Vec3] });
  const torso = Round.loft([ring(-20.5, 5.2, 3.9), ring(-14, 4.9, 3.7), ring(-8, 5.5, 4), ring(-2.5, 6.7, 4.4), ring(0.8, 7.6, 4.3), ring(3.4, 6, 3.6), ring(6, 2.9, 2.6), ring(9, 2.35, 2.1)]);
  o.add(torso, role(materials, 'skin'));
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
  const k = scaleOf(ctx);
  const hair = role(materials, 'hair');
  const on = host ? { on: host } : {};
  const cap = Round.ellipsoid(head.moved(-1.15 * k, 0, 1.45 * k), 4.75 * k, 4.4 * k, 4.4 * k);
  o.add(cap, hair, on);
  for (const s of [-1, 1]) {
    o.add(new Tube([head.at(4.15 * k, s * 3 * k, 1.9 * k), head.at(4.5 * k, s * 1.7 * k, 2.3 * k), head.at(4.4 * k, s * 0.5 * k, 2.5 * k)], { start: 0.85 * k, end: 0.5 * k }), hair, on);
    // Sideburns down beside the ear.
    o.add(new Tube([head.at(0.4 * k, s * 4.35 * k, 1.4 * k), head.at(0.2 * k, s * 4.45 * k, -0.2 * k)], { start: 0.8 * k, end: 0.45 * k }), hair, on);
  }
  return cap;
};

/**
 * Hair drawn back into a tail: a cap that hugs the skull with a low, tufted hairline across the
 * forehead (so the front reads as hair, not a helmet), wisps before the ears, and the tied fall —
 * swung a little to one side so it peeks out behind the shoulder in profile and hangs down the
 * back in the rear facings. Follows the head, so it lies with it.
 * Rests on the head (`on: '<head id>'`, `requires` the flesh head).
 * Slot: `head`. Roles: `hair`.
 */
export const hairTail: Part<NoOptions> = ctx => {
  const { object: o, materials, host } = ctx;
  const { head, lie } = headFrame(ctx);
  const k = scaleOf(ctx);
  const hair = role(materials, 'hair');
  const on = host ? { on: host } : {};
  const cap = Round.ellipsoid(head.moved(-1.5 * k, 0, 1.7 * k), 4.65 * k, 4.3 * k, 4.35 * k);
  o.add(cap, hair, on);
  // The hairline: a low fringe running temple to temple, dipping at the middle.
  o.add(new Tube([head.at(4.35 * k, -2.9 * k, 1.9 * k), head.at(4.6 * k, -1.3 * k, 1.4 * k), head.at(4.7 * k, 0, 1.1 * k), head.at(4.6 * k, 1.3 * k, 1.4 * k), head.at(4.35 * k, 2.9 * k, 1.9 * k)], { start: 0.95 * k, end: 0.95 * k }), hair, on);
  for (const s of [-1, 1]) {
    // A wisp before the ear.
    o.add(new Tube([head.at(4.3 * k, s * 3 * k, 1.6 * k), head.at(4.45 * k, s * 2.2 * k, 0.8 * k), head.at(4.2 * k, s * 1.7 * k, 0.1 * k)], { start: 0.7 * k, end: 0.4 * k }), hair, on);
  }
  // The fall: tied at the crown's back, it slips to the right of the nape so the tail reads from
  // the side and the back, and slackens when the head lies.
  const drop = 1 - 0.4 * lie;
  const tie = Round.ellipsoid(head.moved(-4.3 * k, 0.9 * k, 2.7 * k), 1 * k, 0.95 * k, 1.05 * k);
  o.add(tie, hair, on);
  o.add(
    new Tube(
      [head.at(-4.6 * k, 0.9 * k, 2.1 * k), head.at(-5.5 * k, 1.8 * k, -1.4 * drop * k), head.at(-4.6 * k, 1.5 * k, -6.4 * drop * k)],
      { start: 1.8 * k, end: 0.75 * k },
    ),
    hair,
    on,
  );
  return cap;
};

/** Options of `hairWaves`. */
export interface HairWavesOptions {
  /** Where the hair parts, across the crown: -1 over the left temple .. 1 over the right, 0 in the middle. Default 0.3, a little to the right. */
  parting?: number;
  /** How far the locks fall below the jaw, against shoulder length (1). Default 1. */
  length?: number;
  /** How far the hair stands out at the sides of the face (1 = full, 0.6 = close). Default 1. */
  volume?: number;
}

/**
 * Long wavy hair worn loose to the shoulders: a cap over the crown with a parting, a fringe that
 * sweeps from the parting across the forehead to the temples (above the brows, so they read), full
 * masses at the sides of the face that hide the ears, and waving locks that fall from under the
 * cap to the shoulders at the sides and down the nape at the back, each ending in a curl. A helm
 * can rest on it (give the helm `on: '<hair id>'`), and the locks then fall from under its rim.
 * The locks sort by their own depth, not `on` the head, so from the front they stay behind the
 * face and from behind they cover the nape; they shorten a little once the head lies.
 * Rests on the head (`on: '<head id>'`, `requires` the flesh head). Returns the cap.
 * Slot: `head`. Roles: `hair`.
 */
export const hairWaves: Part<HairWavesOptions> = (ctx, { parting = 0.3, length = 1, volume = 1 }) => {
  const { object: o, kit, materials, host } = ctx;
  const { head, lie } = headFrame(ctx);
  const k = scaleOf(ctx);
  const hair = role(materials, 'hair');
  const on = host ? { on: host } : {};
  const cam = kit.camera;
  const H = (x: number, y: number, z: number) => head.at(x * k, y * k, z * k);
  const fall = length * (1 - 0.35 * lie);
  const v = volume;
  // The cap over the crown and the back of the head, set high and back: seen from the camera's
  // height its outline ends above the brows, so the whole face reads under it.
  const cap = Round.ellipsoid(head.moved(-2 * k, 0, 2.5 * k), 4.1 * k, 4.4 * k, 3.9 * k);
  o.add(cap, hair, on);
  // The parting: a groove from the hairline back over the crown, where the cap's top turns to the camera.
  const py = 2.4 * Math.max(-1, Math.min(1, parting));
  const groove = { ramp: { lit: hair.ramp.dark, base: hair.ramp.dark, dark: hair.ramp.dark } };
  const partRun = [H(1.9, py, 4.95), H(0.4, py * 1.02, 6), H(-1.4, py * 1.04, 6.35)].filter(p => cam.faces(norm3(sub3(p, H(-2, 0, 2.5)))));
  if (partRun.length > 1) o.add(new Tube(partRun, 0.32 * k), groove, { on: cap });
  // The fringe: the hair sweeps from the parting over the forehead, the long side to the far temple,
  // the short side to the near one, high enough to leave the brows clear.
  // A point on the skull's surface (the head's cranium ellipsoid), `lift` out from it.
  const onSkull = (y: number, z: number, lift: number) => H(-0.4 + 4.6 * Math.sqrt(Math.max(0, 1 - (y / 4.25) ** 2 - ((z - 0.7) / 4.55) ** 2)) + lift, y, z);
  const sweep = (to: number, reach: number) => {
    const t = Math.sign(to);
    return new Tube([onSkull(py, 4.75, 0.35), onSkull(py + t * reach * 0.45, 4.05, 0.45), onSkull(t * 3, 3.35, 0.45), onSkull(t * 3.95, 1.9, 0.45)], { start: 1.2 * k, end: 0.55 * k });
  };
  o.add(sweep(py >= 0 ? -1 : 1, Math.abs(py) + 2.4), hair, on);
  o.add(sweep(py >= 0 ? 1 : -1, 3.2 - Math.abs(py)), hair, on);
  // A lock: a run that swings in and out as it falls, `amp` across, its end flipping out in a curl.
  const lock = (x: number, y: number, side: number, out: number, amp: number, width: number, phase = 0) => {
    const pts: Vec3[] = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const z = 1.6 - (10.4 * fall + 1.6) * u;
      const swing = Math.sin(u * Math.PI * 2.4 + phase) * amp * Math.min(1, u * 3);
      pts.push(H(x - 0.5 * u, y + side * (out * Math.sin(Math.min(1, u * 2.2) * Math.PI / 2) + swing), z));
    }
    const end = pts[pts.length - 1];
    pts.push(add3(end, add3(scale3(head.right, side * 1.1 * k), scale3(head.up, 0.5 * k))), add3(end, add3(scale3(head.right, side * 1.5 * k), scale3(head.up, 1.5 * k))));
    return new Tube(pts, { start: width * k, end: 0.6 * k });
  };
  for (const s of [-1, 1]) {
    // The side mass over the ear, and the locks that fall from it: front, middle and back.
    o.add(Round.ellipsoid(head.moved(-2 * k, s * (4.2 + 0.7 * v) * k, -1.6 * k), 2.9 * k, (1.3 + 0.6 * v) * k, 3.9 * k), hair);
    o.add(lock(-0.5, s * 4.3, s, 1.2 * v, 0.75, 2.6), hair);
    o.add(lock(-1.4, s * 4.5, s, 1.7 * v, 0.85, 3.1, 1.3), hair);
    o.add(lock(-3.6, s * 3.7, s, 1.4 * v, 0.8, 3, 2.4), hair);
  }
  // The back: a mass down the nape, and locks across it that wave down to the shoulders.
  o.add(Round.ellipsoid(head.moved(-3.5 * k, 0, -2.4 * k), 2.7 * k, 4.6 * k, 4.8 * k), hair);
  for (const [y, ph] of [[-2.7, 0.6], [-0.9, 2], [0.9, 0.2], [2.7, 1.5]]) o.add(lock(-4.4, y, Math.sign(y), 0.4, 0.6, 2.9, ph), hair);
  return cap;
};

/**
 * One fleshed arm: a rounded shoulder, upper arm, elbow, forearm and a wrist nub as one mass,
 * thicker than the bone arm's bare bones. Returns the arm so a bracer or a sleeve can rest on it.
 * Slot: `shoulder` (side -1 left, 1 right). Roles: `skin`.
 */
export const fleshArm: Part<NoOptions> = ctx => {
  const { object: o, pose, body, at } = ctx;
  const k = scaleOf(ctx);
  const [sh, el, ha] = pose.chains[armOf(ctx, at.side).name];
  const d = norm3(sub3(ha, el));
  const arm = new Blob([
    Round.ellipsoid(partFrame(sh, body.forward, body.up), 3 * k, 3 * k, 3 * k),
    new Tube([sh, el], { start: 3.1 * k, end: 2.35 * k }),
    Round.ellipsoid(partFrame(el, pose.frame.forward), 2.2 * k, 2.2 * k, 2.2 * k),
    new Tube([el, ha], { start: 2.4 * k, end: 1.9 * k }),
    Round.ellipsoid(partFrame(add3(ha, scale3(d, 0.5 * k)), d), 2 * k, 1.7 * k, 1.5 * k),
  ]);
  o.add(arm, role(ctx.materials, 'skin'));
  return arm;
};

/**
 * A relaxed flesh hand: a palm with the fingers kept as one soft, slightly tapered mass — at 1×
 * four separate fingers only read as claws — plus a thumb nub on the inner side. It sits at the
 * wrist and points along the forearm. Pair it with a `glove` (the glove's cuff covers the wrist)
 * or a held item.
 * Slot: `hand` (side -1 left, 1 right). Roles: `skin`.
 */
export const fleshHand: Part<NoOptions> = ctx => {
  const { object: o, at, materials } = ctx;
  const k = scaleOf(ctx);
  const skin = role(materials, 'skin');
  const f = at.frame;
  const palm = Round.ellipsoid(f.moved(1.9 * k, 0, 0.05 * k), 2.2 * k, 2 * k, 0.95 * k);
  o.add(palm, skin);
  // The fingers together: a short, softly tapering curl.
  o.add(new Tube([f.at(3 * k, 0, 0.25 * k), f.at(4.9 * k, 0, 0.7 * k), f.at(5.9 * k, 0, 1.6 * k)], { start: 1.7 * k, end: 0.85 * k }), skin, { on: palm });
  // The thumb on the side towards the body, a short nub kicked a little out.
  const inner = -at.side;
  o.add(new Tube([f.at(1.7 * k, inner * 1.5 * k, 0.1 * k), f.at(3.1 * k, inner * 2.6 * k, 0.6 * k)], { start: 1.05 * k, end: 0.6 * k }), skin, { on: palm });
  return palm;
};

/**
 * One fleshed leg: thigh, knee, shin and a shod-able foot as one mass, the flesh counterpart of
 * `boneLeg`. The foot is the bare foot a `boot` covers.
 * Slot: `thigh` (side -1 left, 1 right). Roles: `skin`.
 */
export const fleshLeg: Part<NoOptions> = ctx => {
  const { object: o, pose, at } = ctx;
  const k = scaleOf(ctx);
  const leg = legOf(ctx, at.side).name;
  const [hip, knee, ankle] = pose.chains[leg];
  const f = pose.frame;
  const foot = Round.ellipsoid(partFrame(add3(pose.joints[`${leg}.foot`], f.dir(1.9 * k, 0, 0.8 * k)), f.forward), 3.9 * k, 2.05 * k, 1.5 * k);
  const mass = new Blob([new Tube([hip, knee], { start: 3.4 * k, end: 2.5 * k }), Round.ellipsoid(partFrame(knee, f.forward), 2.3 * k, 2.3 * k, 2.4 * k), new Tube([knee, ankle], { start: 2.5 * k, end: 1.85 * k }), foot]);
  o.add(mass, role(ctx.materials, 'skin'));
  return mass;
};

/** The hips the `flesh-legs` base hangs its legs from, so the crotch is not a gap between two tubes. */
const fleshHip: Part<NoOptions> = ctx => {
  const { object: o, body, at, materials } = ctx;
  const k = scaleOf(ctx);
  const { up, hipRight, hipForward } = body;
  const hip = Round.ellipsoid(partFrame(add3(at.frame.origin, scale3(up, 1 * k)), hipForward, up), 4.4 * k, 5.9 * k, 4 * k);
  o.add(hip, role(materials, 'skin'));
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
 * hips wear the same `skin` as the rest of the body.
 * Roles: `skin`.
 */
export const fleshLegs: NonNullable<OutfitSpec['base']> = (object, pose, kit, materials) => outfit({ materials, pieces: FLESH_BASE })(object, pose, kit);
