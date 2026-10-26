/**
 * @core/rig - Holding items: how a hand holds what it holds
 *
 * The rules and data every held item needs, whatever the art style. How a fist looks is the kit's;
 * the engine gives where it is and what it closes on:
 * - `Hold`: how an item is held, declared by the item: its kind (`HOLD_KINDS`, with defaults from how
 *   people hold each kind), its handle (length, radius) and where the hands close on it, as fractions
 *   of the handle from its butt (0) to its head or guard end (1); a two-handed item's second grip can
 *   be a range the other hand slides in;
 * - `palmFrame`: the hand's own frame, the OpenXR grip convention: its origin is the palm centroid (the
 *   middle of the closed fist, a fraction of the hand's length past the wrist), one axis is the palm
 *   normal, one the finger-tube axis a handle runs along, at the hold's angle to the hand's axis (65°
 *   for a power grip). A skeleton has no hand bone, so the hand's direction is solved for the handle:
 *   the most comfortable wrist, kept within the wrist's hard limits (`WRIST`), with the angles the hold
 *   needs measured so checks can report them;
 * - `held(..., { hold })` places an item with its grip in that palm (see gear);
 * - `secondHand`: the other arm on a two-handed item's second grip, by two-bone IK after the clip's
 *   pose, never stretched past full length, sliding the grip within its range or letting go when it is
 *   out of reach, by the clip's `extra.secondGrip` weight;
 * - `Grip`: what a hand part receives (`PartContext.grip`) to close round the handle.
 */

import { add3, cross3, dot3, len3, lerp3, norm3, scale3, sub3, vec3, type Vec3 } from '../volume/vec3.js';
import type { Held } from './gear.js';
import { twoBone } from './ik.js';
import type { Pose } from './pose.js';
import type { ArmSpec, SkeletonSpec } from './skeleton.js';

const toDegrees = (r: number) => (r * 180) / Math.PI;
const toRadians = (d: number) => (d * Math.PI) / 180;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => clamp(x, 0, 1);

/**
 * Proportions of the hand, from the Vitruvian canon (H is the body's height): the hand is H / 10 from
 * the wrist to the fingertips, the palm (four fingers) H / 24 across.
 */
export const HAND = {
  /** Hand length, wrist to fingertip, as a fraction of the body's height. `ArmSpec.hand` sets it for one arm. */
  length: 0.1,
  /** Palm width, as a fraction of the body's height: a grip needs at least this much handle per hand that holds it. */
  palm: 1 / 24,
  /** Distance from the wrist to the palm centroid (the middle of the closed fist, where a handle runs through it), as a fraction of hand length. */
  centroid: 0.3,
  /** Handle radius, as a fraction of hand length, at which the fingers can no longer close round it: `Grip.curl` falls from 1 to 0 as the radius grows to it. */
  open: 0.42,
  /** Thickness of the fingers wrapped round a handle, as a fraction of hand length: a fist resting on the floor holds its handle's axis the handle's radius and this much above it. */
  wrap: 0.1,
} as const;

/**
 * The wrist's range, in degrees: the clinical hard limits (flexion 80, extension 70, radial deviation
 * 20, ulnar deviation 30), the comfortable range for motion (about 40 each way) and where a hand at rest
 * sits (extended 15 to 30, ulnar deviation up to 15), the posture of the strongest power grip.
 */
export const WRIST = {
  flexion: 80,
  extension: 70,
  radial: 20,
  ulnar: 30,
  comfort: 40,
  rest: { extension: [15, 30] as const, ulnar: [0, 15] as const },
} as const;

/**
 * How a hand holds a kind of item. Each sets where the hands go on the handle by default
 * (`HOLD_KINDS`); any other string works and takes `HOLD_DEFAULT`.
 */
export type HoldKind =
  | 'one-hand-blade'
  | 'dagger'
  | 'two-hand-blade'
  | 'axe'
  | 'mace'
  | 'spear'
  | 'staff'
  | 'polearm'
  | 'scythe'
  | 'bow'
  | 'crossbow'
  | 'strapped-shield'
  | 'center-grip-shield'
  | 'precision'
  | 'two-hand-tool'
  | 'thrown'
  | 'carried-light';

/** How an item is held, as the item declares it (`WieldInfo.hold`, `HeldOptions.hold`). Everything left out takes its kind's default. */
export interface Hold {
  /** The kind of hold (`HoldKind`, or the project's own): it sets the defaults below. */
  kind?: HoldKind | (string & {});
  /** The handle, in world units: its length from butt to head (or guard) end, and its radius where the hands close. Default: the kind's, scaled by the body's height. */
  handle?: { length?: number; radius?: number };
  /** Where the holding hand closes, as a fraction of the handle from its butt (0) to its head or guard end (1). Default: the kind's. */
  grip?: number;
  /**
   * Where the other hand closes on an item held in both hands (`WieldInfo.hands: 2`): a fraction of the
   * handle, or a range `[from, to]` it may slide in (a spear's guiding front hand). Default: the kind's.
   */
  second?: number | [number, number];
  /** Angle between the handle and the hand's own axis, degrees: 65 for a power grip (the handle crosses the palm obliquely), less for a wand held along the fingers. Default: the kind's. */
  angle?: number;
  /** The head end comes out of the little finger's side of the fist instead of the thumb's (a dagger held point down). Default false. */
  reverse?: boolean;
}

/**
 * The defaults of a hold kind. Lengths are fractions of the body's height, so they hold for any
 * skeleton; a part that knows its handle declares it (`Hold.handle`).
 */
export interface HoldDefaults {
  grip: number;
  /**
   * The other hand's grip on an item held in both: a fraction or a range of fractions, or a distance
   * along the handle from the holding hand's grip, as a fraction of the body's height (`apart`,
   * positive towards the head end), with an optional half-range it slides in (`slide`): hands set by
   * the body rather than by the item, such as shoulder width on a staff.
   */
  second?: number | [number, number] | { apart: number; slide?: number };
  handle: { length: number; radius: number };
  angle: number;
}

/**
 * Where people put their hands on each kind of item (fractions from the butt), from the research in
 * rig guide 06: a one-hand blade's hand fills its grip; a longsword's lead hand sits just under the guard
 * (0.8 to 1) and the rear hand on or just above the pommel (0 to 0.35), adjacent with up to a palm
 * between them; a staff's and a polearm's hands are about shoulder width apart (0.25 H); a spear's
 * rear hand holds the butt and the front hand guides it; a scythe's grips are about 0.25 H apart; an
 * axe's hand stays near the butt and the other slides; a javelin is held at its balance (0.61 to 0.65).
 * Handle radii follow a power grip's 30 to 50 mm diameter, a wand's 12 mm.
 */
export const HOLD_KINDS: Readonly<Record<HoldKind, HoldDefaults>> = {
  'one-hand-blade': { grip: 0.5, handle: { length: 0.055, radius: 0.011 }, angle: 65 },
  dagger: { grip: 0.5, handle: { length: 0.055, radius: 0.01 }, angle: 65 },
  'two-hand-blade': { grip: 0.9, second: [0, 0.35], handle: { length: 0.15, radius: 0.012 }, angle: 65 },
  axe: { grip: 0.08, second: [0.3, 0.75], handle: { length: 0.4, radius: 0.012 }, angle: 65 },
  mace: { grip: 0.12, handle: { length: 0.3, radius: 0.012 }, angle: 65 },
  spear: { grip: 0.05, second: [0.25, 0.6], handle: { length: 1.2, radius: 0.0125 }, angle: 65 },
  staff: { grip: 0.38, second: { apart: 0.25 }, handle: { length: 1, radius: 0.0125 }, angle: 65 },
  polearm: { grip: 0.15, second: { apart: 0.25 }, handle: { length: 1.3, radius: 0.0125 }, angle: 65 },
  scythe: { grip: 0.55, second: { apart: -0.25 }, handle: { length: 0.9, radius: 0.012 }, angle: 65 },
  bow: { grip: 0.5, handle: { length: 0.07, radius: 0.014 }, angle: 45 },
  crossbow: { grip: 0.2, second: 0.6, handle: { length: 0.45, radius: 0.014 }, angle: 65 },
  'strapped-shield': { grip: 0.5, handle: { length: 0.07, radius: 0.008 }, angle: 65 },
  'center-grip-shield': { grip: 0.5, handle: { length: 0.07, radius: 0.011 }, angle: 65 },
  precision: { grip: 0.15, handle: { length: 0.15, radius: 0.0035 }, angle: 15 },
  'two-hand-tool': { grip: 0.05, second: [0.3, 0.6], handle: { length: 0.75, radius: 0.012 }, angle: 65 },
  thrown: { grip: 0.63, handle: { length: 1.5, radius: 0.01 }, angle: 65 },
  'carried-light': { grip: 0.3, handle: { length: 0.2, radius: 0.012 }, angle: 65 },
};

/** The defaults of a hold without a kind, or of a kind the engine does not know: a power grip in the middle of a short handle. */
export const HOLD_DEFAULT: HoldDefaults = { grip: 0.5, handle: { length: 0.06, radius: 0.011 }, angle: 65 };

/** A hold with every default filled in, for one skeleton (`resolveHold`). Lengths are world units. */
export interface ResolvedHold {
  kind?: string;
  handle: { length: number; radius: number };
  grip: number;
  /** The other hand's range on an item held in both hands (a fixed grip is `[f, f]`); absent when the hold has none. */
  second?: [number, number];
  angle: number;
  reverse: boolean;
}

const isFraction = (x: number) => Number.isFinite(x) && x >= 0 && x <= 1;

/** A hold with the defaults of its kind, scaled by the skeleton's height. Throws on a grip outside the handle or a handle that is not there. */
export function resolveHold(hold: Hold, skeleton: SkeletonSpec): ResolvedHold {
  const d = (hold.kind !== undefined && (HOLD_KINDS as Record<string, HoldDefaults>)[hold.kind]) || HOLD_DEFAULT;
  const H = skeleton.height;
  const length = hold.handle?.length ?? d.handle.length * H;
  const radius = hold.handle?.radius ?? d.handle.radius * H;
  const grip = hold.grip ?? d.grip;
  const angle = hold.angle ?? d.angle;
  const name = hold.kind ? `hold "${hold.kind}"` : 'hold';
  if (!(Number.isFinite(length) && length > 0)) throw new Error(`${name}: the handle's length must be a positive number, got ${length}`);
  if (!(Number.isFinite(radius) && radius >= 0)) throw new Error(`${name}: the handle's radius must be a number of 0 or more, got ${radius}`);
  if (!isFraction(grip)) throw new Error(`${name}: grip ${grip} must be a fraction of the handle, from 0 (the butt) to 1 (the head end)`);
  if (!(Number.isFinite(angle) && angle >= 0 && angle <= 90)) throw new Error(`${name}: angle ${angle} must be in degrees, from 0 (along the hand) to 90 (square to it)`);
  const s = hold.second ?? d.second;
  let second: [number, number] | undefined;
  if (typeof s === 'number' || Array.isArray(s)) {
    const [a, b] = typeof s === 'number' ? [s, s] : s;
    if (!isFraction(a) || !isFraction(b)) throw new Error(`${name}: second grip ${JSON.stringify(s)} must be fractions of the handle, from 0 (the butt) to 1 (the head end)`);
    second = [Math.min(a, b), Math.max(a, b)];
  } else if (s) {
    const at = grip + (s.apart * H) / length;
    const half = ((s.slide ?? 0) * H) / length;
    second = [clamp01(at - half), clamp01(at + half)];
  }
  return { ...(hold.kind !== undefined ? { kind: hold.kind } : {}), handle: { length, radius }, grip, ...(second ? { second } : {}), angle, reverse: hold.reverse ?? false };
}

/** The hand of an arm, in world units: its length (wrist to fingertip, `ArmSpec.hand` or H / 10) and its palm's width. */
export function handSize(skeleton: SkeletonSpec, arm: ArmSpec): { length: number; palm: number } {
  const length = arm.hand ?? HAND.length * skeleton.height;
  return { length, palm: (length * HAND.palm) / HAND.length };
}

/** Angles of the wrist, in degrees, the hand against the forearm. */
export interface WristAngles {
  /** Flexion (positive, the hand bent towards the palm) or extension (negative, towards the back of the hand). */
  flexion: number;
  /** Radial deviation (positive, the hand bent towards the thumb) or ulnar deviation (negative, towards the little finger). */
  deviation: number;
}

/**
 * The frame of a hand, the OpenXR grip convention. Its origin `at` is the palm centroid, the middle of
 * the closed fist; `normal` points out of the palm, into what the hand closes on; `tube` is the axis of
 * the tube the closed fingers make, from the little finger's side out of the thumb's, which a held
 * handle runs along; `along` is the hand's own axis, from the wrist to the knuckles, and `thumb` the
 * thumb's side across it. The same hand holds an item in every facing (a left hand stays a left hand).
 */
export interface Palm {
  at: Vec3;
  /** The wrist joint (the end of the arm). */
  wrist: Vec3;
  along: Vec3;
  thumb: Vec3;
  normal: Vec3;
  tube: Vec3;
  /** The hand's length, wrist to fingertip. */
  length: number;
  /** The angle the finger tube makes with the hand's axis, degrees: the hold's, moved by up to `GRIP_SLACK` where that spares the wrist. */
  angle: number;
  /** The wrist's angles the hand is drawn with: what the hold needs, kept within the hard limits (`WRIST`). */
  bend: WristAngles;
  /** The wrist's angles the hold needs, for checks: past the hard limits when `limited` (by the least any hand holding it would be). */
  needs: WristAngles;
  /**
   * The hand could not take the posture the hold needs: it stops at the wrist's hard limits, or tips up
   * off the floor (`lowest` of `palmFrame`), and the handle no longer runs along the finger tube.
   */
  limited: boolean;
}

/**
 * How far, in degrees, a handle may cross the palm off the hold's angle: a handle slides in the palm
 * (people settle a cylinder at 65 ± 7°, and take it squarer or more along the hand when the task asks),
 * so a hand turns the handle in the palm before it bends the wrist.
 */
export const GRIP_SLACK = 25;
/** Degrees off the hold's angle that cost the hand as much as the comfortable range costs the wrist. */
const GRIP_SPREAD = 15;

/** `v` turned by the shortest rotation that takes the unit vector `a` to the unit vector `b`. */
function turn(v: Vec3, a: Vec3, b: Vec3): Vec3 {
  const axis = cross3(a, b);
  const s = len3(axis);
  const c = dot3(a, b);
  if (s < 1e-9) {
    if (c > 0) return v;
    const k = norm3(Math.abs(a.x) < 0.9 ? cross3(a, vec3(1, 0, 0)) : cross3(a, vec3(0, 1, 0)));
    return sub3(scale3(k, 2 * dot3(k, v)), v);
  }
  const k = scale3(axis, 1 / s);
  return add3(add3(scale3(v, c), scale3(cross3(k, v), s)), scale3(k, dot3(k, v) * (1 - c)));
}

/** Where the solver aims the wrist: the middle of the rest posture (extended, a little towards the little finger). */
const REST_FLEXION = -(WRIST.rest.extension[0] + WRIST.rest.extension[1]) / 2;
const REST_DEVIATION = -(WRIST.rest.ulnar[0] + WRIST.rest.ulnar[1]) / 2;

/**
 * How much a wrist posture strains: its distance from the rest posture against the comfortable range
 * (deviation has half the range of flexion). A smooth bowl on purpose: a steeper cost past the hard
 * limits would split it into two hollows, and the hand would flip between them from one frame to the
 * next. The limits come in only when the hand that strains least is past them (`solveHand`).
 */
function strain(a: WristAngles): number {
  const f = (a.flexion - REST_FLEXION) / WRIST.comfort;
  const d = (a.deviation - REST_DEVIATION) / (WRIST.comfort / 2);
  return f * f + d * d;
}

interface Hand {
  along: Vec3;
  thumb: Vec3;
  normal: Vec3;
}

/**
 * The wrist angles of a hand against the forearm `fore`, the twist left to the forearm: the hand's
 * bend from the forearm (the angle between them) split along the hand's thumb side (deviation) and
 * its palm (flexion), the way a rotation vector splits, so it stays continuous however far it bends.
 */
function anglesOf(fore: Vec3, h: Hand): WristAngles {
  const bend = Math.acos(clamp(dot3(fore, h.along), -1, 1));
  const r = -dot3(fore, h.thumb);
  const n = -dot3(fore, h.normal);
  const across = Math.hypot(r, n);
  if (across < 1e-12) return { flexion: 0, deviation: 0 };
  return { flexion: toDegrees((bend * n) / across), deviation: toDegrees((bend * r) / across) };
}

/** Golden-section search for where `f` is lowest on [lo, hi]. */
function argmin(f: (x: number) => number, lo: number, hi: number, rounds = 20): number {
  const phi = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - phi * (hi - lo);
  let x2 = lo + phi * (hi - lo);
  let f1 = f(x1);
  let f2 = f(x2);
  for (let k = 0; k < rounds; k++) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - phi * (hi - lo);
      f1 = f(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + phi * (hi - lo);
      f2 = f(x2);
    }
  }
  return (lo + hi) / 2;
}

/** Nelder-Mead search for where `f` is lowest in two dimensions, from `x0` with a first step of `step`. Deterministic. */
function simplex(f: (x: [number, number]) => number, x0: [number, number], step: [number, number], rounds = 160): [number, number] {
  let pts: { x: [number, number]; v: number }[] = [x0, [x0[0] + step[0], x0[1]], [x0[0], x0[1] + step[1]]].map(x => ({ x: x as [number, number], v: f(x as [number, number]) }));
  const at = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let k = 0; k < rounds; k++) {
    pts.sort((a, b) => a.v - b.v);
    const [best, mid, worst] = pts;
    // Converged: the corners agree on the cost and lie within a thousandth of a degree of each other.
    if (worst.v - best.v < 1e-9 && Math.max(Math.abs(worst.x[0] - best.x[0]), Math.abs(mid.x[0] - best.x[0])) < 2e-5 && Math.max(Math.abs(worst.x[1] - best.x[1]), Math.abs(mid.x[1] - best.x[1])) < 1e-3) break;
    const centre: [number, number] = [(best.x[0] + mid.x[0]) / 2, (best.x[1] + mid.x[1]) / 2];
    const r = at(centre, worst.x, -1);
    const fr = f(r);
    if (fr < best.v) {
      const e = at(centre, worst.x, -2);
      const fe = f(e);
      pts[2] = fe < fr ? { x: e, v: fe } : { x: r, v: fr };
    } else if (fr < mid.v) pts[2] = { x: r, v: fr };
    else {
      const c = fr < worst.v ? at(centre, r, 0.5) : at(centre, worst.x, 0.5);
      const fc = f(c);
      if (fc < Math.min(fr, worst.v)) pts[2] = { x: c, v: fc };
      else pts = pts.map((p, i) => (i === 0 ? p : { x: at(best.x, p.x, 0.5), v: f(at(best.x, p.x, 0.5)) }));
    }
  }
  pts.sort((a, b) => a.v - b.v);
  return pts[0].x;
}

type SolvedHand = Hand & { tube: Vec3; angle: number; bend: WristAngles; needs: WristAngles; limited: boolean };

/**
 * The last hands solved: a drawing, its sockets and its effects ask for the same hand on the same pose
 * several times a frame. The solve is a pure function of its inputs, so a repeat returns the same hand.
 */
const solved = new Map<string, SolvedHand>();
const SOLVED_KEPT = 1024;

/** `solveHand`, remembered for the last inputs (copies, so nothing outside changes what is kept). */
function solveHandKept(fore: Vec3, axis: Vec3, angle: number, side: -1 | 1, hint: Vec3): SolvedHand {
  const key = [fore.x, fore.y, fore.z, axis.x, axis.y, axis.z, angle, side, hint.x, hint.y, hint.z].join(',');
  let hand = solved.get(key);
  if (!hand) {
    hand = solveHand(fore, axis, angle, side, hint);
    if (solved.size >= SOLVED_KEPT) solved.delete(solved.keys().next().value!);
    solved.set(key, hand);
  }
  const copy = (v: Vec3) => vec3(v.x, v.y, v.z);
  return { along: copy(hand.along), thumb: copy(hand.thumb), normal: copy(hand.normal), tube: copy(hand.tube), angle: hand.angle, bend: { ...hand.bend }, needs: { ...hand.needs }, limited: hand.limited };
}

/** How far, in degrees, wrist angles go past the hard limits (`WRIST`): 0 within them. */
export function pastLimits(a: WristAngles): number {
  return Math.max(0, a.flexion - WRIST.flexion, -a.flexion - WRIST.extension, a.deviation - WRIST.radial, -a.deviation - WRIST.ulnar);
}

/** Degrees past a limit a solved hand may be and still count as within it (the solver's own precision). */
export const LIMIT_SLACK = 0.5;

/**
 * The hand that closes on a handle along `axis` (out of the thumb's side) at the end of the forearm
 * `fore`: of the hands that do (the handle along their finger tube, crossing the palm within
 * `GRIP_SLACK` of the hold's `angle`), the one that strains least, the wrist and the grip together,
 * among those within the wrist's hard limits when any is; when none is, the one past them least, kept
 * within them (the handle then leaves the finger tube).
 */
function solveHand(fore: Vec3, axis: Vec3, angle: number, side: -1 | 1, hint: Vec3): SolvedHand {
  const gLo = Math.max(0, angle - GRIP_SLACK);
  const gHi = Math.min(90, angle + GRIP_SLACK);
  let e1 = sub3(fore, scale3(axis, dot3(fore, axis)));
  if (len3(e1) < 1e-6) e1 = sub3(hint, scale3(axis, dot3(hint, axis)));
  if (len3(e1) < 1e-6) e1 = cross3(axis, Math.abs(axis.z) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0));
  e1 = norm3(e1);
  const e2 = cross3(axis, e1);
  // A hand round the handle: its axis `gamma` degrees off the handle, turned `psi` round it from the forearm's side.
  const handAt = (psi: number, gamma: number): Hand => {
    const g = toRadians(gamma);
    const u = add3(scale3(e1, Math.cos(psi)), scale3(e2, Math.sin(psi)));
    const along = add3(scale3(axis, Math.cos(g)), scale3(u, Math.sin(g)));
    const thumb = sub3(scale3(axis, Math.sin(g)), scale3(u, Math.cos(g)));
    // Right-handed (forward × right = up): the right palm faces along × thumb, the left one the other way.
    return { along, thumb, normal: side > 0 ? cross3(along, thumb) : cross3(thumb, along) };
  };
  const cost = (psi: number, gamma: number) => {
    const g = (gamma - angle) / GRIP_SPREAD;
    return strain(anglesOf(fore, handAt(psi, gamma))) + g * g;
  };
  const steps = 48;
  const step = (2 * Math.PI) / steps;
  const gSteps = 6;
  const gStep = (gHi - gLo) / gSteps;
  let psi = 0;
  let gamma = angle;
  let best = Infinity;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j <= gSteps; j++) {
      const c = cost(i * step, gLo + j * gStep);
      if (c < best - 1e-12) {
        best = c;
        psi = i * step;
        gamma = gLo + j * gStep;
      }
    }
  }
  for (let round = 0; round < 3; round++) {
    psi = argmin(x => cost(x, gamma), psi - step, psi + step);
    if (gHi > gLo) gamma = argmin(x => cost(psi, x), Math.max(gLo, gamma - gStep), Math.min(gHi, gamma + gStep));
  }
  if (pastLimits(anglesOf(fore, handAt(psi, gamma))) > LIMIT_SLACK) {
    // The hand that strains least is past the wrist's limits. Another hand may still hold the handle
    // within them, with more strain: of those, the one that strains least; when none can, the one that
    // goes past them least (what the hold needs, at the least). A degree past a limit outweighs any strain
    // within them. The search starts from the hand that strains least, so the hand moves on smoothly
    // from frame to frame along the limit; only when no hand near it holds within the limits does it
    // look round the whole handle.
    const bounded = ([p, g]: [number, number]) => {
      const c = clamp(g, gLo, gHi);
      const x = pastLimits(anglesOf(fore, handAt(p, c)));
      return cost(p, c) + 0.1 * x * x;
    };
    let at = simplex(bounded, [psi, gamma], [step / 2, Math.max(1, gStep / 2)]);
    if (pastLimits(anglesOf(fore, handAt(at[0], clamp(at[1], gLo, gHi)))) > LIMIT_SLACK) {
      let start: [number, number] = at;
      let low = bounded(at);
      for (let i = 0; i < steps; i++) {
        for (let j = 0; j <= gSteps; j++) {
          const q: [number, number] = [i * step, gLo + j * gStep];
          const c = bounded(q);
          if (c < low - 1e-12) {
            low = c;
            start = q;
          }
        }
      }
      const far = simplex(bounded, start, [step / 2, Math.max(1, gStep / 2)]);
      if (bounded(far) < bounded(at) - 1e-9) at = far;
    }
    psi = at[0];
    gamma = clamp(at[1], gLo, gHi);
  }
  const h = handAt(psi, gamma);
  const needs = anglesOf(fore, h);
  const bend = { flexion: clamp(needs.flexion, -WRIST.extension, WRIST.flexion), deviation: clamp(needs.deviation, -WRIST.ulnar, WRIST.radial) };
  if (bend.flexion === needs.flexion && bend.deviation === needs.deviation) return { ...h, tube: axis, angle: gamma, bend: needs, needs, limited: false };
  // Past the limits: the hand turns back towards the forearm until the wrist is at its limits.
  const thumbF = turn(h.thumb, h.along, fore);
  const normalF = turn(h.normal, h.along, fore);
  const bent = toRadians(Math.hypot(bend.flexion, bend.deviation));
  const towards = add3(scale3(thumbF, bend.deviation), scale3(normalF, bend.flexion));
  const along = len3(towards) > 1e-12 ? norm3(add3(scale3(fore, Math.cos(bent)), scale3(norm3(towards), Math.sin(bent)))) : fore;
  const thumb = norm3(turn(thumbF, fore, along));
  const normal = norm3(turn(normalF, fore, along));
  const g = toRadians(gamma);
  // A hand the search left a hair past a limit (`LIMIT_SLACK`) is at it: the handle still runs along its finger tube.
  return { along, thumb, normal, tube: norm3(add3(scale3(along, Math.cos(g)), scale3(thumb, Math.sin(g)))), angle: gamma, bend, needs, limited: pastLimits(needs) > LIMIT_SLACK };
}

/**
 * The palm frame of an arm's hand in a pose. With `handle` (its axis out of the thumb's side, and the
 * hold's angle, default 65°), the hand is the one that closes on that handle with the least strain:
 * the handle crosses the palm near the hold's angle (`GRIP_SLACK`), the wrist near its rest posture,
 * and within the wrist's hard limits (`WRIST`) whenever a hand can hold it so; when none can, the hand
 * that goes past them least, stopped at them (`limited`). `bend` and `needs` say what it costs the
 * wrist: `needs` is then the least the hold asks past the limits. With `lowest`, the hand never puts its palm centroid
 * lower than that height: a hand lying on the floor (a body in a death) tips up to rest on it instead
 * of going through it (`limited` then). Without a handle, an empty hand: straight on the forearm, its
 * palm turned to the body's middle the way a hanging hand turns.
 */
export function palmFrame(pose: Pose, skeleton: SkeletonSpec, arm: string, handle?: { axis: Vec3; angle?: number; lowest?: number }): Palm {
  const spec = (skeleton.arms ?? []).find(a => a.name === arm);
  if (!spec) throw new Error(`palmFrame: skeleton "${skeleton.name}" has no arm "${arm}"`);
  const [, elbow, wrist] = pose.chains[arm];
  const d = sub3(wrist, elbow);
  const fore = len3(d) > 1e-9 ? norm3(d) : pose.frame.dir(0, 0, -1);
  const { length } = handSize(skeleton, spec);
  const angle = handle?.angle ?? HOLD_DEFAULT.angle;
  let hand: SolvedHand;
  if (handle && len3(handle.axis) > 1e-9) hand = solveHandKept(fore, norm3(handle.axis), angle, spec.side, pose.frame.forward);
  else {
    const inward = scale3(pose.frame.right, -spec.side);
    let normal = sub3(inward, scale3(fore, dot3(inward, fore)));
    if (len3(normal) < 1e-6) normal = sub3(pose.frame.forward, scale3(fore, dot3(pose.frame.forward, fore)));
    normal = norm3(normal);
    const thumb = spec.side > 0 ? cross3(normal, fore) : cross3(fore, normal);
    const g = toRadians(angle);
    const straight = { flexion: 0, deviation: 0 };
    hand = { along: fore, thumb, normal, tube: norm3(add3(scale3(fore, Math.cos(g)), scale3(thumb, Math.sin(g)))), angle, bend: straight, needs: straight, limited: false };
  }
  const reach = HAND.centroid * length;
  const lowest = handle?.lowest;
  if (lowest !== undefined && wrist.z + hand.along.z * reach < lowest) {
    // The hand tips up about the wrist, the least it must, until the palm rests at that height.
    const z = clamp((lowest - wrist.z) / reach, -1, 1);
    const flat = Math.hypot(hand.along.x, hand.along.y);
    const level = flat > 1e-9 ? scale3(vec3(hand.along.x, hand.along.y, 0), Math.sqrt(1 - z * z) / flat) : vec3(Math.sqrt(1 - z * z), 0, 0);
    const along = norm3(add3(level, vec3(0, 0, z)));
    const tipped = { along, thumb: norm3(turn(hand.thumb, hand.along, along)), normal: norm3(turn(hand.normal, hand.along, along)) };
    hand = { ...tipped, tube: norm3(turn(hand.tube, hand.along, along)), angle: hand.angle, bend: anglesOf(fore, tipped), needs: hand.needs, limited: true };
  }
  return {
    at: add3(wrist, scale3(hand.along, reach)),
    wrist,
    along: hand.along,
    thumb: hand.thumb,
    normal: hand.normal,
    tube: hand.tube,
    length,
    angle: hand.angle,
    bend: hand.bend,
    needs: hand.needs,
    limited: hand.limited,
  };
}

/**
 * Where a hand closes on what it holds, as a hand part receives it (`PartContext.grip`): draw the fist
 * round the handle there. The fingers in front of the handle wrap it (their volumes sort in front of
 * it); the little and ring fingers close tightest, the index finger and the thumb are the loose,
 * expressive ones (the kit's style).
 */
export interface Grip {
  /** The point on the handle's axis the hand closes round: the middle of the fist. */
  at: Vec3;
  /** Unit vector along the handle through the fist, out of the thumb's side (towards a blade's tip, a polearm's head; towards the pommel for a reversed hold). */
  axis: Vec3;
  /** Radius of the handle there, so the fingers wrap round it. */
  radius: number;
  /** How far the fingers close, from 0 (open) to 1 (fully closed): capped by the handle's thickness, and lower while a hand lets go. */
  curl: number;
  /** The hand's palm frame on the grip: where the hand points, the palm's normal, the finger tube, the wrist angles. */
  palm: Palm;
  /**
   * For a handle on the back of a surface (a shield's strap behind its board): the surface's outward
   * normal. The hand closes on the inner side, so while that face is towards the camera the item covers the fist.
   */
  behind?: Vec3;
}

/** How far fingers close on a handle of `radius`, for a hand `length` long (see `HAND.open`). */
export const curlFor = (radius: number, length: number): number => clamp01(1 - radius / (HAND.open * length));

/**
 * The grip of an arm's hand on a handle along `axis` (out of the thumb's side): the hand's palm frame
 * for it and the point the fist closes round, the palm centroid. For what is not placed by `held`,
 * whose handle is wherever the hand is (a shield's strap, with `behind`). `weight` (0..1, default 1)
 * opens the fingers as the hand lets go.
 */
export function palmGrip(pose: Pose, skeleton: SkeletonSpec, arm: string, o: { axis: Vec3; radius: number; angle?: number; behind?: Vec3; weight?: number }): Grip {
  const palm = palmFrame(pose, skeleton, arm, { axis: o.axis, angle: o.angle });
  return { at: palm.at, axis: norm3(o.axis), radius: o.radius, curl: curlFor(o.radius, palm.length) * clamp01(o.weight ?? 1), palm, ...(o.behind ? { behind: o.behind } : {}) };
}

/**
 * The holding hand's grip on an item `held` placed with a `hold`; undefined for one placed without (at
 * the wrist, the old way) and once the hand has let go of it (`Held.released`). While it lets go the
 * fingers open, and the fist stays in the palm, round the finger tube, as the item leaves it.
 */
export function heldGrip(item: Held): Grip | undefined {
  if (!item.hold || !item.palm) return undefined;
  const loose = 1 - (item.released ?? 0);
  if (loose <= 0) return undefined;
  const radius = item.hold.handle.radius;
  const curl = curlFor(radius, item.palm.length) * loose;
  if (item.released) return { at: item.palm.at, axis: item.palm.tube, radius, curl, palm: item.palm };
  return { at: item.grip, axis: item.hold.reverse ? scale3(item.dir, -1) : item.dir, radius, curl, palm: item.palm };
}

/** Wrist angles within the comfortable range for a held still pose (`WRIST.comfort`; deviation has half of it), the measure the grip checks use at rest. */
const comfortable = (a: WristAngles) => Math.max(Math.abs(a.flexion) / WRIST.comfort, Math.abs(a.deviation) / (WRIST.comfort / 2)) <= 1;

/**
 * Where an item rests in a hand when no clip sets its angle: the direction closest to `want` (the item's
 * rest) that the hand holds with the wrist within its comfortable range. People turn what they hold
 * rather than strain the wrist ("bend the tool, not the wrist"): the farthest a hand turns it is to the
 * direction it holds with the wrist at rest (extended, a little towards the little finger), where the
 * strain is least. `want` itself comes back when the wrist holds it comfortably already, so an item
 * whose rest suits the hand stays where it was. The search is a fixed bisection, so the same pose gives
 * the same direction and a moving arm turns the item smoothly.
 */
export function restAxis(pose: Pose, skeleton: SkeletonSpec, arm: string, want: Vec3, hold: Pick<ResolvedHold, 'angle' | 'reverse'>): Vec3 {
  if (!(skeleton.arms ?? []).some(a => a.name === arm)) return want;
  const sign = hold.reverse ? -1 : 1;
  const holds = (dir: Vec3) => {
    const palm = palmFrame(pose, skeleton, arm, { axis: scale3(dir, sign), angle: hold.angle });
    return !palm.limited && pastLimits(palm.needs) <= LIMIT_SLACK && comfortable(palm.needs);
  };
  const goal = norm3(want);
  if (holds(goal)) return goal;
  // The hand at the rest posture, from the straight hand `palmFrame` draws when it holds nothing: the
  // bend splits into flexion along the palm's normal and deviation along the thumb (as `anglesOf` reads it).
  const straight = palmFrame(pose, skeleton, arm);
  const fore = straight.along;
  const bend = Math.hypot(REST_FLEXION, REST_DEVIATION);
  const towards = norm3(add3(scale3(straight.normal, REST_FLEXION / bend), scale3(straight.thumb, REST_DEVIATION / bend)));
  const along = norm3(add3(scale3(fore, Math.cos(toRadians(bend))), scale3(towards, Math.sin(toRadians(bend)))));
  const thumb = norm3(turn(straight.thumb, fore, along));
  const g = toRadians(hold.angle);
  const ideal = scale3(norm3(add3(scale3(along, Math.cos(g)), scale3(thumb, Math.sin(g)))), sign);
  // Of the directions between the hand's ideal and the wanted rest, the one closest to the rest the wrist still holds.
  const w = Math.acos(clamp(dot3(ideal, goal), -1, 1));
  const between = (t: number) => {
    if (w < 1e-6) return goal;
    const s = Math.sin(w);
    return norm3(add3(scale3(ideal, Math.sin((1 - t) * w) / s), scale3(goal, Math.sin(t * w) / s)));
  };
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 10; k++) {
    const mid = (lo + hi) / 2;
    if (holds(between(mid))) lo = mid;
    else hi = mid;
  }
  return between(lo);
}

/** What `secondHand` did in one pose: the other hand on a two-handed item's second grip. */
export interface SecondHand {
  /** The pose with the other arm on the grip (the pose given, unchanged, when the hand let go entirely). */
  pose: Pose;
  /** The arm that moved. */
  arm: string;
  /** Where on the handle the hand goes, as a fraction from the butt (0) to the head end (1). */
  fraction: number;
  /** That point, on the handle's axis. */
  target: Vec3;
  /** What the hand closes on; absent when it let go entirely. */
  grip?: Grip;
  /** Distance from the palm, at full weight, to the grip: about 0 when the hand reaches it. */
  gap: number;
  /** How firmly the hand holds, 0..1: the clip's `extra.secondGrip` (default 1), lowered as the grip goes out of reach. */
  weight: number;
  /** The grip slid within its range (`Hold.second`) to come within reach of the arm. */
  slid: boolean;
  /** The grip was out of reach even so: the hand lets go (all the way once it is a palm's width short). */
  released: boolean;
}

/**
 * Puts the other hand on the second grip of an item held in both hands (its `hold.second`), a pass
 * after the clip's pose: the main hand drives the item, the other follows it. The other arm (the one on
 * the side opposite `side`, the holding hand's) is solved with two-bone IK so that its palm comes to the
 * grip: the elbow bends the way the clip bends it (falling back to down and out, in the creature's
 * frame, so it holds in every facing), and the arm reaches at most its full length, never stretched.
 * A grip with a range starts where the clip's hand is nearest, and slides along the range to come within
 * reach; out of reach even so, the hand lets go, fading out over a palm's width. The clip lets go on
 * its own with `extra.secondGrip` (0..1, default 1), keyed like any channel. Undefined when the item has
 * no second grip (it was placed without a `hold`, or its hold has none) or the skeleton no other arm.
 */
export function secondHand(pose: Pose, skeleton: SkeletonSpec, item: Held, side: -1 | 1): SecondHand | undefined {
  const hold = item.hold;
  if (!hold?.second) return undefined;
  const arm = (skeleton.arms ?? []).find(a => a.side === -side);
  if (!arm) return undefined;
  const [shoulder, elbow0, wrist0] = pose.chains[arm.name];
  const [l1, l2] = arm.lengths;
  const { length: hand, palm: palmWidth } = handSize(skeleton, arm);
  const centroid = HAND.centroid * hand;
  const L = hold.handle.length;
  const pointAt = (f: number) => add3(item.grip, scale3(item.dir, (f - hold.grip) * L));
  const fractionOf = (p: Vec3) => hold.grip + dot3(sub3(p, item.grip), item.dir) / L;
  const [a, b] = hold.second;
  // Where the clip has the hand: its palm, the wrist straight.
  const d0 = sub3(wrist0, elbow0);
  const palm0 = add3(wrist0, scale3(len3(d0) > 1e-9 ? norm3(d0) : pose.frame.dir(0, 0, -1), centroid));
  const preferred = clamp(fractionOf(palm0), a, b);
  // How far a grip is past the arm's comfortable reach (a little short of straight): the wrist reaches
  // towards it from the shoulder, the palm a centroid further on.
  const reach = 0.97 * (l1 + l2);
  const beyond = (f: number) => Math.max(0, len3(sub3(pointAt(f), shoulder)) - centroid - reach);
  let fraction = preferred;
  if (beyond(preferred) > 0) {
    // The reachable part of the range is one stretch (the distance to the shoulder is convex along the handle): slide to its nearest end.
    const nearest = clamp(fractionOf(shoulder), a, b);
    if (beyond(nearest) > 0) fraction = nearest;
    else {
      let out = preferred;
      let inside = nearest;
      for (let k = 0; k < 40; k++) {
        const mid = (out + inside) / 2;
        if (beyond(mid) > 0) out = mid;
        else inside = mid;
      }
      fraction = inside;
    }
  }
  const slid = Math.abs(fraction - preferred) > 1e-9;
  const target = pointAt(fraction);
  const axis = hold.reverse ? scale3(item.dir, -1) : item.dir;
  // The elbow bends the way the clip bends it; a straight arm falls back to down and out.
  const line = sub3(wrist0, shoulder);
  const u = len3(line) > 1e-9 ? norm3(line) : pose.frame.dir(0, 0, -1);
  const e = sub3(elbow0, shoulder);
  const bendClip = sub3(e, scale3(u, dot3(e, u)));
  const hint = add3(bendClip, scale3(norm3(pose.frame.dir(0, arm.side * 0.7, -1)), 0.02 * l1));
  const withArm = (w: Vec3): Pose => {
    const ik = twoBone(shoulder, w, l1, l2, hint, false);
    return { ...pose, joints: { ...pose.joints, [`${arm.name}.elbow`]: ik.mid, [`${arm.name}.hand`]: ik.end }, chains: { ...pose.chains, [arm.name]: [shoulder, ik.mid, ik.end] } };
  };
  const palmOf = (p: Pose) => palmFrame(p, skeleton, arm.name, { axis, angle: hold.angle });
  // The wrist goes where the palm lands on the grip; the palm depends on the forearm, so a few rounds.
  const toTarget = sub3(target, shoulder);
  let wrist = sub3(target, scale3(len3(toTarget) > 1e-9 ? norm3(toTarget) : u, centroid));
  let solved = withArm(wrist);
  let palm = palmOf(solved);
  for (let k = 0; k < 4; k++) {
    wrist = add3(wrist, sub3(target, palm.at));
    solved = withArm(wrist);
    palm = palmOf(solved);
  }
  const gap = len3(sub3(target, palm.at));
  const tolerance = 0.05 * hand;
  const reached = gap <= tolerance ? 1 : clamp01(1 - (gap - tolerance) / Math.max(1e-9, palmWidth - tolerance));
  // The other hand lets go with the holding one when the clip lets go (`Held.released`).
  const weight = clamp01(pose.extra.secondGrip ?? 1) * reached * (1 - (item.released ?? 0));
  const report = { arm: arm.name, fraction, target, gap, slid, released: reached < 1 };
  if (weight <= 0) return { pose, ...report, weight: 0 };
  if (weight < 1) {
    solved = withArm(lerp3(wrist0, wrist, weight));
    palm = palmOf(solved);
  }
  const radius = hold.handle.radius;
  const grip: Grip = { at: weight < 1 ? palm.at : target, axis, radius, curl: curlFor(radius, hand) * weight, palm };
  return { pose: solved, ...report, grip, weight };
}
