/**
 * Weapons: the notched sword with soul runes, and the reaper's scythe with its caged soul lantern.
 *
 * A held weapon never reads the skeleton by itself: `held` (from `@core/rig`) lays it along the
 * clip's `extra.weaponYaw` / `extra.weaponPitch` (`offWeaponYaw` / `offWeaponPitch` in the left
 * hand, so a second weapon keeps its rest unless a clip swings it), rests it on the floor in a death
 * and keeps the tip above the floor. `swordHeld` is that call with the sword's numbers, shared by the drawing,
 * the effects (`weaponSmear`, `chargedEdge`, `groundShockwave` in `effects.ts`) and the
 * character's sockets, so they all agree on where the blade is.
 *
 * Each weapon says how it is held (`SWORD_HOLD`, `SCYTHE_HOLD`, `spearHold`: a `Hold` of `@core/rig`)
 * and passes it to its `held` call, so its grip sits in the palm of the hand, and the catalog gives the
 * same call as the part's `wield.held`, so the hand parts on that side close on it (`ctx.grip`).
 */

import { Polygon } from '@core/draw';
import { held, partFrame, weaponChannel, type Held, type Hold, type Part, type Pose, type SkeletonSpec } from '@core/rig';
import { Decal, Frame3, Solid, Round, Tube, UP, add3, cross3, dot3, len3, norm3, scale3, sub3, vec3, visibleArc, type Vec3 } from '@core/volume';
import { paintFlame } from './fire';
import { axisFrame, halo, role, tones, type NoOptions } from './util';

/** Default length of the sword's blade, from the guard to the tip. */
export const SWORD_BLADE = 24;

/**
 * How the sword is held: a one-hand blade's grip, the hand filling the leather grip (4.4 long, 0.75
 * round) with the palm at its middle.
 */
export const SWORD_HOLD: Hold = { kind: 'one-hand-blade', handle: { length: 4.4, radius: 0.75 } };

/**
 * Where the hilt is drawn from, this far along the blade past the grip (the palm, the middle of the
 * leather grip): from there the leather grip runs 3.6 back and 0.8 on, the guard sits 1.4 on and the
 * blade starts 2 on.
 */
export const SWORD_HILT = 1.4;

/** The tip is the blade's length past the start of the blade, 2 past the hilt. */
const reach = (blade: number) => SWORD_HILT + blade + 2;

/**
 * Grip, direction and tip of the sword in the hand of `side` (-1 left, 1 right, default the right
 * hand). With no weapon angle from the clip it points low and forward, a little across the body
 * (mirrored for the left hand). The blade rests on the floor instead of sinking into it: when the
 * hand is low (a body lying down) the blade turns towards the horizontal until its tip touches the floor.
 * Its grip is in the palm, the middle of the leather grip (`SWORD_HOLD`). The catalog's
 * `wield.sockets.tip` and `wield.held` call it with the piece's side and length, so a character's
 * `tip` follows the sword it holds and the hand on that side closes on it.
 */
export function swordHeld(pose: Pose, skeleton: SkeletonSpec, side: -1 | 1 = 1, blade = SWORD_BLADE): Held {
  const hand = (skeleton.arms ?? []).find(a => a.side === side);
  if (!hand) throw new Error(`gear: skeleton "${skeleton.name}" has no ${side < 0 ? 'left' : 'right'} arm to hold a sword`);
  return held(pose, skeleton, hand.name, { length: reach(blade), floor: 1.1, rest: [0.55, 0.3 * side, -0.75], channel: weaponChannel(side), hold: SWORD_HOLD });
}

/** Options of `notchedSword`. */
export interface NotchedSwordOptions {
  /** Length of the blade. Default 24. Pass the same value to the effects and to `swordHeld`. */
  length?: number;
  /** A nick taken out of the lower edge of the blade. Default true. */
  notch?: boolean;
  /** A groove down the blade, on both faces. Default true. */
  fuller?: boolean;
  /** Glowing runes in the groove; they swell with `extra.charge` (0..1). Default true. */
  runes?: boolean;
  /** An iron crossguard. Default true. */
  guard?: boolean;
  /** A leather grip. Default true. */
  grip?: boolean;
  /** An iron pommel. Default true. */
  pommel?: boolean;
}

/**
 * A notched, pointed blade with a fuller and soul runes, an iron guard, a leather grip and a pommel,
 * held in a hand along `held`. The fuller and the runes are drawn only on the face that turns
 * towards the camera. Returns the blade, so effects can rest on it (`id` it in the outfit).
 * Slot: `hand` (side 1 right, -1 left). Roles: `blade` (falls back to `metalAccent`, then `metal`),
 * `metal` (fuller, guard, pommel), `leather` (grip), `glow` (runes). Channels: `extra.weaponYaw`,
 * `extra.weaponPitch`, `extra.charge`.
 */
export const notchedSword: Part<NotchedSwordOptions> = (ctx, options) => {
  const { object: o, pose, kit, at, materials } = ctx;
  const { length = SWORD_BLADE, notch = true, fuller = true, runes = true, guard = true, grip = true, pommel = true } = options;
  const cam = kit.camera;
  const { dir, frame: inHand } = swordHeld(pose, kit.skeleton, at.side === 0 ? 1 : at.side, length);
  const bladeFrame = inHand.moved(SWORD_HILT, 0, 0);
  const charge = pose.extra.charge ?? 0;
  const metal = role(materials, 'metal');
  const shoulder = length - 2.5;
  const profile = Polygon.fromPoints([
    { x: 2, y: -1.3 }, { x: shoulder, y: -1.15 }, { x: length + 2, y: 0 }, { x: shoulder, y: 1.15 },
    ...(notch ? [{ x: 14, y: 1.25 }, { x: 13.2, y: 0.6 }, { x: 12.4, y: 1.25 }] : []),
    { x: 2, y: 1.3 },
  ]);
  const blade = Solid.extrude(bladeFrame.moved(0, 0, -0.35), profile, 0.7);
  o.add(blade, role(materials, 'blade', 'metalAccent', 'metal'));
  if (fuller || runes) {
    const glowRole = role(materials, 'glow');
    for (const s of [1, -1]) {
      const n = scale3(bladeFrame.up, s);
      if (!cam.faces(n)) continue;
      const face = bladeFrame.moved(0, 0, s * 0.36);
      const decal = (shape: Polygon) => new Decal(face.origin, face.forward, face.right, shape, n);
      let groove: Decal | undefined;
      if (fuller) {
        groove = decal(Polygon.rect(length - 9, 0.5, { cx: 3 + (length - 9) / 2 }));
        o.add(groove, { fill: tones(materials, 'metal').base }, { on: blade });
      }
      // The runes build up through the charge: wider and with a bigger halo.
      if (runes) {
        const runeGlow = halo(glowRole, 6 * (1 + 2.2 * charge), 0.55);
        for (const x of [6, 10, 14]) o.add(decal(Polygon.rect(1 + 0.7 * charge, 0.5 + 0.35 * charge, { cx: x })), { fill: glowRole.ramp.lit, shadow: runeGlow }, { on: groove ?? blade });
      }
    }
  }
  if (guard) o.add(Solid.box(bladeFrame.moved(1.4, 0, -0.7), 1.3, 8, 1.4), metal, { on: blade });
  if (grip) o.add(new Tube([bladeFrame.at(0.8, 0, 0), bladeFrame.at(-3.6, 0, 0)], 1.5), role(materials, 'leather'));
  if (pommel) o.add(Round.ellipsoid(partFrame(bladeFrame.at(-4.4, 0, 0), dir), 1.4, 1.4, 1.4), metal);
  return blade;
};

// ----------------------------------------------------------------------------------------------
// The scythe
// ----------------------------------------------------------------------------------------------

/**
 * Measures of the scythe, in world units. The grip is in the middle of the snath: `butt` below it
 * (the foot stands on the floor when the hand hangs at its rest height), `head` above it (where
 * the blade starts), and the blade reaches `blade` out from the snath.
 */
export const SCYTHE = { butt: 47, head: 64, blade: 27 };

/** Direction of the snath in the creature's frame when the clip sets no weapon angle: upright, a hair forward and leaning in towards the body. */
export const SCYTHE_REST: [number, number, number] = [0.04, -0.06, 1];
/** `weaponYaw` and `weaponPitch` of `SCYTHE_REST`: a clip that sets the weapon angle starts and ends here. */
export const SCYTHE_REST_YAW = Math.atan2(SCYTHE_REST[1], SCYTHE_REST[0]);
export const SCYTHE_REST_PITCH = Math.asin(SCYTHE_REST[2] / Math.hypot(...SCYTHE_REST));
/**
 * Where the blade points, as a heading (radians) in the creature's frame, horizontal: 0 forward,
 * positive towards the right. The clip may drive it with `extra.bladeAim`; the default sends the
 * blade across the body, over the head, and a little forward.
 */
export const SCYTHE_REST_AIM = -1.45;

/** Geometry of a scythe held in a hand: the snath, the blade and the lantern hung from its top. */
export interface ScytheHeld {
  /** The hand: the middle of the snath. */
  grip: Vec3;
  /** Unit vector along the snath, from the foot to the head. */
  dir: Vec3;
  /** The foot of the snath (shortened so it never goes below the floor). */
  butt: Vec3;
  /** The head of the snath, where the blade is fixed. */
  top: Vec3;
  /** Unit vector from the snath to the blade's tip, square to the snath. */
  side: Vec3;
  /** Frame of the blade: forward along `side`, right along `dir`, up its normal. Its origin is where the blade leaves the snath. */
  blade: Frame3;
  /** The tip of the blade. */
  tip: Vec3;
  /** Where the hook ends, on the side opposite the blade. */
  hookEnd: Vec3;
  /** The lantern's centre. */
  lantern: Vec3;
  /** Unit vector from the hook down the chain to the lantern. */
  hang: Vec3;
}

/** Profile of the blade in (along `side`, along `dir`) from where it leaves the snath: the back, then the cutting edge back to the base, with one nick. */
const BLADE_PROFILE = [
  { x: 0, y: 5.4 }, { x: 3.6, y: 7.8 }, { x: 9, y: 9.2 }, { x: 15, y: 8.4 }, { x: 20, y: 5.8 }, { x: 24, y: 2.6 }, { x: 27, y: -1.8 },
  { x: 22.6, y: 1.9 }, { x: 17.5, y: 3.9 }, { x: 14.7, y: 4.3 }, { x: 14, y: 3.3 }, { x: 13.2, y: 4.4 }, { x: 12, y: 4.5 }, { x: 7, y: 3.5 }, { x: 3, y: 1.9 }, { x: 0, y: 0.4 },
];
const BLADE_BASE = 4.5;
/** Length from the hook's end to the centre of the lantern's cage. */
const LANTERN_REACH = 9.2;

/**
 * How the scythe is held: in one hand round the snath, `SCYTHE.butt` up from its foot (the snath is
 * `SCYTHE.butt + SCYTHE.head` long, about 1 round where the hand closes).
 */
export const SCYTHE_HOLD: Hold = { kind: 'scythe', handle: { length: SCYTHE.butt + SCYTHE.head, radius: 1.05 }, grip: SCYTHE.butt / (SCYTHE.butt + SCYTHE.head) };

/**
 * The scythe's `held` call: the snath through the palm of the hand of `side` (`SCYTHE_HOLD`), its head
 * `SCYTHE.head` up from the grip, upright by default. `scytheHeld` builds on it, and the catalog's
 * `wield.held` is it, so the hand on that side closes where the snath is.
 */
export function snathHeld(pose: Pose, skeleton: SkeletonSpec, side: -1 | 1 = 1): Held {
  const arm = (skeleton.arms ?? []).find(a => a.side === side);
  if (!arm) throw new Error(`gear: skeleton "${skeleton.name}" has no ${side < 0 ? 'left' : 'right'} arm to hold a scythe`);
  return held(pose, skeleton, arm.name, { length: SCYTHE.head, floor: 3.2, rest: SCYTHE_REST, channel: weaponChannel(side), hold: SCYTHE_HOLD });
}

/**
 * Where the scythe is: the snath through the hand (angle from `extra.weaponYaw` / `weaponPitch`
 * through `snathHeld`, upright by default), the blade square to the snath towards `extra.bladeAim`, and
 * the lantern hanging by gravity from the hook (swinging by `extra.lanternSway`, radians, and
 * resting on the floor when the hook is low). When the body lies the snath settles on the floor.
 * Use it for the character's sockets (`tip`, `lantern`): the parts below draw from the same call.
 */
export function scytheHeld(pose: Pose, skeleton: SkeletonSpec, side: -1 | 1 = 1): ScytheHeld {
  const h = snathHeld(pose, skeleton, side);
  const { grip, dir } = h;
  const f = pose.frame;
  const buttLength = dir.z > 0.02 ? Math.min(SCYTHE.butt, Math.max(1, (grip.z - 0.7) / dir.z)) : SCYTHE.butt;
  const butt = sub3(grip, scale3(dir, buttLength));
  const top = h.tip;
  const aim = (side < 0 ? pose.extra.offBladeAim : pose.extra.bladeAim) ?? SCYTHE_REST_AIM;
  const ref = add3(scale3(f.forward, Math.cos(aim)), scale3(f.right, Math.sin(aim)));
  let across = sub3(ref, scale3(dir, dot3(ref, dir)));
  if (len3(across) < 0.25) across = cross3(dir, f.up);
  const sideDir = norm3(across);
  const origin = sub3(top, scale3(dir, BLADE_BASE));
  const blade = new Frame3(origin, sideDir, dir, norm3(cross3(sideDir, dir)));
  const tip = blade.at(27, -1.8, 0);
  // Hook on the side opposite the blade, a little below the top; the lantern hangs from its end.
  const hookStart = sub3(top, scale3(dir, 3));
  const hookEnd = add3(sub3(hookStart, scale3(sideDir, 5.9)), scale3(dir, 0.2));
  const outward = vec3(-sideDir.x, -sideDir.y, 0);
  const out = len3(outward) > 1e-3 ? norm3(outward) : f.right;
  const sway = pose.extra.lanternSway ?? 0;
  // The largest swing from vertical at which the lantern still clears the floor; a low hook lays it down.
  const free = (hookEnd.z - 3.6) / LANTERN_REACH;
  const angle = free >= Math.cos(sway) ? sway : Math.acos(Math.max(-1, free)) * (sway < 0 ? -1 : 1);
  const hang = norm3(add3(scale3(UP, -Math.cos(angle)), scale3(out, Math.sin(angle))));
  return { grip, dir, butt, top, side: sideDir, blade, tip, hookEnd, lantern: add3(hookEnd, scale3(hang, LANTERN_REACH)), hang };
}

/** Options of `reaperScythe`. */
export interface ReaperScytheOptions {
  /** A nick in the cutting edge and an etched groove along the blade. Default true. */
  etched?: boolean;
  /** Iron bands on the snath. Default true. */
  bands?: boolean;
}

/**
 * A reaper's scythe: a long dark snath through the hand with a spiked foot and two iron bands, an
 * iron collar at the head and a curved blade that sweeps off the side of the snath, with a pale
 * bevel along the cutting edge and an etched groove (drawn only on the face that turns to the
 * camera). The hook and the lantern are a separate part, `soulLantern`. Returns the snath, so the
 * hand, the lantern and the smear can rest on it.
 * Slot: `hand` (side 1 right). Roles: `wood` (snath), `metal` (collar, bands, foot), `blade` (falls
 * back to `metalAccent`, then `metal`). Channels: `extra.weaponYaw`, `weaponPitch`, `bladeAim`.
 */
export const reaperScythe: Part<ReaperScytheOptions> = (ctx, { etched = true, bands = true }) => {
  const { object: o, pose, kit, at, materials } = ctx;
  const cam = kit.camera;
  const g = scytheHeld(pose, kit.skeleton, at.side === 0 ? 1 : at.side);
  const wood = role(materials, 'wood');
  const metal = role(materials, 'metal');
  const snath = new Tube([g.butt, g.grip, g.top], { start: 2.3, end: 1.9 });
  o.add(snath, wood);
  o.add(new Tube([add3(g.butt, scale3(g.dir, 1.6)), sub3(g.butt, scale3(g.dir, 1.8))], { start: 2.8, end: 0.3 }), metal, { on: snath });
  if (bands) {
    for (const u of [0.28, 0.78]) {
      const p = add3(g.butt, scale3(sub3(g.top, g.butt), u));
      o.add(new Tube([sub3(p, scale3(g.dir, 0.9)), add3(p, scale3(g.dir, 0.9))], 3.1), metal, { on: snath });
    }
  }
  const collar = new Tube([sub3(g.top, scale3(g.dir, 5.6)), add3(g.top, scale3(g.dir, 0.9))], 3.3);
  o.add(collar, metal, { on: snath });
  const steel = role(materials, 'blade', 'metalAccent', 'metal');
  const plate = Solid.extrude(g.blade.moved(0, 0, -0.45), Polygon.fromPoints(BLADE_PROFILE), 0.9);
  o.add(plate, steel, { on: collar });
  if (etched) {
    const lit = tones(materials, 'blade', 'metalAccent', 'metal').lit;
    const groove = tones(materials, 'metal').base;
    for (const s of [1, -1]) {
      const n = scale3(g.blade.up, s);
      if (!cam.faces(n)) continue;
      const face = g.blade.moved(0, 0, s * 0.47);
      const decal = (shape: Polygon) => new Decal(face.origin, face.forward, face.right, shape, n);
      o.add(decal(Polygon.fromPoints([{ x: 3, y: 4.9 }, { x: 8, y: 6.9 }, { x: 14, y: 6.9 }, { x: 19, y: 5 }, { x: 23, y: 2.3 }, { x: 24.4, y: 1.9 }, { x: 19.6, y: 4.5 }, { x: 14, y: 5.6 }, { x: 8, y: 5.5 }, { x: 3, y: 4 }])), { fill: groove }, { on: plate });
      o.add(decal(Polygon.fromPoints([{ x: 0.6, y: 1 }, { x: 3.3, y: 2.4 }, { x: 7, y: 3.9 }, { x: 11.6, y: 4.3 }, { x: 11.5, y: 3.6 }, { x: 7, y: 3.2 }, { x: 3.2, y: 1.8 }, { x: 0.8, y: 0.6 }])), { fill: lit }, { on: plate });
    }
  }
  return snath;
};

/**
 * The bony hand closed on the snath: a fist round the grip with three finger bands wrapped
 * across it, drawn over the scythe whatever the facing. The sleeve's cuff ends at its back. It closes
 * where the outfit says the hand holds the snath (`ctx.grip`), else where `snathHeld` puts the grip.
 * Rests on the snath (give it as the host).
 * Slot: `hand` (side 1 right). Roles: `boneLimb` (falls back to `bone`).
 */
export const scytheFist: Part<NoOptions> = ctx => {
  const { object: o, pose, kit, at, materials, host } = ctx;
  const g = ctx.grip ? { grip: ctx.grip.at, dir: ctx.grip.axis } : snathHeld(pose, kit.skeleton, at.side === 0 ? 1 : at.side);
  const bone = role(materials, 'boneLimb', 'bone');
  const f = axisFrame(g.grip, g.dir, pose.frame.forward);
  const fist = Round.ellipsoid(f, 2.2, 2.3, 2.7);
  o.add(fist, bone, host ? { on: host } : {});
  for (const d of [-1.5, 0, 1.5]) {
    const ring = visibleArc(kit.camera, add3(g.grip, scale3(g.dir, d)), f.forward, f.right, 2.35, 2.45);
    if (ring.length) o.add(new Tube(ring, 0.75), bone, { on: fist });
  }
  return fist;
};

/** Options of `soulLantern`. */
export type SoulLanternOptions = NoOptions;

/**
 * A caged soul lantern on a hook off the head of the snath, on the side opposite the blade: a hook,
 * two chain links, an iron cap, a glass of soul-colored light with a lost soul burning in it, up to
 * four iron bars over the glass (only the ones that face the camera) and an iron base. It hangs by
 * gravity from the hook, swings with `extra.lanternSway` and rests on the floor when the scythe lies
 * down; the soul flickers on whole cycles of the clip.
 * Rests on the scythe's snath. Slot: `hand` (side 1 right). Roles: `metal`, `glow`.
 * Channels: `extra.lanternSway`.
 */
export const soulLantern: Part<SoulLanternOptions> = ctx => {
  const { object: o, pose, kit, at, materials, host } = ctx;
  const cam = kit.camera;
  const g = scytheHeld(pose, kit.skeleton, at.side === 0 ? 1 : at.side);
  const metal = role(materials, 'metal');
  const glow = role(materials, 'glow');
  const tau = Math.PI * 2;
  const t = kit.t;
  const hookStart = sub3(g.top, scale3(g.dir, 3));
  const hookMid = add3(sub3(hookStart, scale3(g.side, 3.6)), scale3(g.dir, 1.5));
  const hook = new Tube([hookStart, hookMid, g.hookEnd], 1.1);
  o.add(hook, metal, host ? { on: host } : {});
  const along = (d: number) => add3(g.hookEnd, scale3(g.hang, d));
  const up = scale3(g.hang, -1);
  for (const [d, flip] of [[1, 0], [2.4, 1]] as const) {
    o.add(Round.ellipsoid(axisFrame(along(d), up, flip ? vec3(0, 1, 0) : vec3(1, 0, 0)), 0.6, 0.55, 0.95), metal, { on: hook });
  }
  // Bottom to top: the base, the glass on it, the soul and the bars over the glass, the cap on top.
  const base = Round.cylinder(axisFrame(along(14.6), up), 3.1, 1.3);
  o.add(base, metal, { on: hook });
  const glass = Round.cylinder(axisFrame(along(13.3), up), 2.7, 8.3);
  const lamp = halo(glow, 10, 0.8);
  o.add(glass, { ramp: { lit: glow.ramp.base, base: glow.ramp.dark, dark: glow.ramp.dark }, shadow: lamp }, { on: base });
  const frame = axisFrame(along(9.2), up);
  o.custom(along(9.2), (ctx2, c) => {
    const p = c.project(along(9.2));
    const pulse = Math.sin(tau * (2 * t + 0.5));
    paintFlame(ctx2, glow, p.x, p.y + 1.8, 1.9 * (1 + 0.08 * pulse), { lean: 0.5 - 1.1 * Math.sin(tau * (t + 0.8)), eyes: true });
  }, { on: glass });
  for (let i = 0; i < 4; i++) {
    const a = ((45 + 90 * i) * Math.PI) / 180;
    const radial = add3(scale3(frame.forward, Math.cos(a)), scale3(frame.right, Math.sin(a)));
    if (!cam.faces(radial)) continue;
    const bar = (d: number) => add3(along(d), scale3(radial, 2.75));
    o.add(new Tube([bar(5.2), bar(13.3)], 0.6), metal, { on: glass });
  }
  o.add(Round.cylinder(axisFrame(along(5.2), up), 3, 2.2, 0.8), metal, { on: glass, bias: 3 });
};

// ----------------------------------------------------------------------------------------------
// The spear
// ----------------------------------------------------------------------------------------------

/**
 * Measures of the spear, in world units: `reach` from the grip to the tip, `butt` behind the grip
 * (the foot stands on the floor when the hand hangs at its rest height), `blade` the leaf head at the
 * tip, from its socket.
 */
export const SPEAR = { reach: 62, butt: 46, blade: 13 };

/**
 * Direction of the spear in the creature's frame when the clip sets no weapon angle: nearly upright,
 * planted by the foot and leaning a little forward and out, so the shaft and the head stand clear
 * of the face and the helm from every facing (ahead of the face in profile, outside the head in the
 * 3/4 views).
 */
export const SPEAR_REST: [number, number, number] = [0.08, 0.15, 1];
/** `weaponYaw` and `weaponPitch` of `SPEAR_REST`: a clip that sets the weapon angle starts and ends here. */
export const SPEAR_REST_YAW = Math.atan2(SPEAR_REST[1], SPEAR_REST[0]);
export const SPEAR_REST_PITCH = Math.asin(SPEAR_REST[2] / Math.hypot(...SPEAR_REST));

/**
 * How a spear is held: in one hand, `butt` up from its foot, round a shaft `reach + butt` long and
 * about 0.9 round.
 */
export const spearHold = (reach = SPEAR.reach, butt = SPEAR.butt): Hold => ({ kind: 'spear', handle: { length: reach + butt, radius: 0.9 }, grip: butt / (reach + butt) });

/**
 * Grip, direction, tip and butt of a spear in the hand of `side` (-1 left, 1 right, default the
 * right): the grip in the palm (`spearHold`), upright at rest, laid along the clip's
 * `weaponYaw` / `weaponPitch` (the off hand's channels in the left hand), resting on the floor in a
 * death, its butt shortened where it would go below the floor. The catalog's `wield.sockets.tip` and
 * `wield.held` call it with the piece's options, so a character's `tip` follows the spear it holds,
 * and the hand on that side closes where the shaft is.
 */
export function spearHeld(pose: Pose, skeleton: SkeletonSpec, side: -1 | 1 = 1, reach = SPEAR.reach, butt = SPEAR.butt): Held {
  const arm = (skeleton.arms ?? []).find(a => a.side === side);
  if (!arm) throw new Error(`gear: skeleton "${skeleton.name}" has no ${side < 0 ? 'left' : 'right'} arm to hold a spear`);
  return held(pose, skeleton, arm.name, { length: reach, butt, floor: 1.2, rest: SPEAR_REST, channel: weaponChannel(side), hold: spearHold(reach, butt) });
}

/**
 * A hand closed on the spear's shaft: a fist round the grip, three finger bands wrapped across the
 * shaft and a thumb over them, with a cuff at the wrist, drawn over the spear whatever the facing,
 * so the shaft reads as running through the hand. It stands in for the hand (or glove) on that side
 * and closes where the outfit says the hand holds the shaft (`ctx.grip`), else where `spearHeld` puts
 * the grip, in the palm. Gloved when the outfit has `leather`,
 * bare `skin` otherwise. Follows the skeleton's scale. Rests on the spear (give it as the host).
 * Slot: `hand` (side 1 right, -1 left). Roles: `leather` (falls back to `skin`).
 */
export const spearFist: Part<NoOptions> = ctx => {
  const { object: o, pose, kit, at, materials, host } = ctx;
  const side = at.side === 0 ? 1 : at.side;
  const arm = (kit.skeleton.arms ?? []).find(a => a.side === side);
  if (!arm) throw new Error(`gear: skeleton "${kit.skeleton.name}" has no ${side < 0 ? 'left' : 'right'} arm for a fist`);
  const g = ctx.grip ? { grip: ctx.grip.at, dir: ctx.grip.axis } : spearHeld(pose, kit.skeleton, side);
  const k = kit.skeleton.height / 80;
  const hand = role(materials, 'leather', 'skin');
  // The bias lifts the hand over the end of the sleeve or vambrace it comes out of, which sorts by
  // the middle of the forearm: from behind, the fist would otherwise hide under the wrist.
  const on = { bias: 5 * k, ...(host ? { on: host } : {}) };
  const [, elbow, wrist] = pose.chains[arm.name];
  const fore = norm3(sub3(wrist, elbow));
  // The cuff round the wrist, where the hand leaves the sleeve or the vambrace.
  o.add(new Tube([sub3(wrist, scale3(fore, 0.5 * k)), add3(wrist, scale3(fore, 0.8 * k))], 3.1 * k), hand, on);
  // Forward is where the knuckles are: the forearm's way, across the shaft.
  const f = axisFrame(g.grip, g.dir, fore);
  const fist = Round.ellipsoid(f.moved(0.45 * k, 0, 0), 2.05 * k, 1.75 * k, 2.15 * k);
  o.add(fist, hand, on);
  // The fingers: bands across the shaft on the side that faces the camera.
  for (const d of [-1.35, 0, 1.35]) {
    const band = visibleArc(kit.camera, add3(f.at(0.45 * k, 0, 0), scale3(g.dir, d * k)), f.forward, f.right, 2.1 * k, 1.8 * k);
    if (band.length > 1) o.add(new Tube(band, 0.7 * k), hand, { on: fist, bias: 5 * k });
  }
  // The thumb, over the top of the fist from the palm's side to the knuckles.
  const inner = -side;
  o.add(new Tube([f.at(-0.9 * k, inner * 1.1 * k, 1.7 * k), f.at(0.3 * k, inner * 1.0 * k, 2.35 * k), f.at(1.3 * k, inner * 0.5 * k, 2.1 * k)], { start: 1.3 * k, end: 0.85 * k }), hand, { on: fist, bias: 5 * k });
  return fist;
};

/** Options of `spear`. */
export interface SpearOptions {
  /** Length from the grip to the tip. Default 62. */
  length?: number;
  /** Length of the shaft behind the grip. Default 46. */
  butt?: number;
  /** Two small lugs, the wings of a winged spear, at the foot of the head. Default true. */
  lugs?: boolean;
  /** Gilded bands round the shaft under the head. Default true. */
  bands?: boolean;
}

/**
 * A spear: a long ash shaft through the hand with an iron ferrule at the butt, gilded bands under
 * the head, an iron socket with two lugs, and a leaf-shaped steel head with a pale ridge down the
 * face that turns to the camera. Held along `spearHeld`; returns the shaft, so a hand or an effect
 * can rest on it (`id` it in the outfit).
 * Slot: `hand` (side 1 right, -1 left). Roles: `wood` (shaft), `metal` (ferrule, socket, lugs),
 * `blade` (the head; falls back to `metalAccent`, then `metal`), `trim` (optional: the bands; falls
 * back to `metal`). Channels: `extra.weaponYaw`, `extra.weaponPitch`.
 */
export const spear: Part<SpearOptions> = (ctx, { length = SPEAR.reach, butt = SPEAR.butt, lugs = true, bands = true }) => {
  const { object: o, pose, kit, at, materials } = ctx;
  const cam = kit.camera;
  const g = spearHeld(pose, kit.skeleton, at.side === 0 ? 1 : at.side, length, butt);
  const wood = role(materials, 'wood');
  const metal = role(materials, 'metal');
  const steel = role(materials, 'blade', 'metalAccent', 'metal');
  const along = (d: number) => add3(g.grip, scale3(g.dir, d));
  const socket = length - SPEAR.blade;
  const shaft = new Tube([g.butt, g.grip, along(socket - 1)], { start: 1.9, end: 1.6 });
  o.add(shaft, wood);
  const buttLength = len3(sub3(g.grip, g.butt));
  if (buttLength > 3) o.add(new Tube([along(-buttLength + 2.4), along(-buttLength - 0.5)], { start: 2.2, end: 1.1 }), metal, { on: shaft });
  if (bands) {
    const trim = role(materials, 'trim', 'metal');
    for (const d of [socket - 7.5, socket - 5.6]) o.add(new Tube([along(d - 0.55), along(d + 0.55)], 2.5), trim, { on: shaft });
  }
  const sleeve = new Tube([along(socket - 3.6), along(socket + 0.8)], { start: 2.5, end: 1.7 });
  o.add(sleeve, metal, { on: shaft });
  const f = g.frame;
  if (lugs) {
    for (const s of [-1, 1]) o.add(new Tube([along(socket - 2.8), add3(along(socket - 2.2), scale3(f.right, s * 2.4))], { start: 1.1, end: 0.6 }), metal, { on: shaft });
  }
  const bladeFrame = new Frame3(along(socket), f.forward, f.right, f.up);
  const leaf = Solid.extrude(bladeFrame.moved(0, 0, -0.4), Polygon.fromPoints([
    { x: 0, y: -0.9 }, { x: 2.6, y: -1.95 }, { x: 5.6, y: -2.05 }, { x: 9.2, y: -1.3 }, { x: SPEAR.blade, y: 0 },
    { x: 9.2, y: 1.3 }, { x: 5.6, y: 2.05 }, { x: 2.6, y: 1.95 }, { x: 0, y: 0.9 },
  ]), 0.8);
  o.add(leaf, steel, { on: sleeve });
  const lit = tones(materials, 'blade', 'metalAccent', 'metal').lit;
  for (const s of [1, -1]) {
    const n = scale3(f.up, s);
    if (!cam.faces(n)) continue;
    const face = bladeFrame.moved(0, 0, s * 0.42);
    o.add(new Decal(face.origin, face.forward, face.right, Polygon.rect(SPEAR.blade - 2.4, 0.45, { cx: 1 + (SPEAR.blade - 2.4) / 2 }), n), { fill: lit }, { on: leaf });
  }
  return shaft;
};
