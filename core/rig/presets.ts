/**
 * @core/rig - Presets
 *
 * Ready skeletons and actions to start from. A preset is only data plus clips: copy and change
 * its numbers (or scale it) for another creature; nothing in the engine depends on it.
 */

import { EVENTS, defineClip, restFeet, type Clip } from './clips.js';
import { Frame3 } from '../volume/frame.js';
import { vec3 } from '../volume/vec3.js';
import { solvePose, type Drive } from './pose.js';
import { defineSkeleton, type Local, type SkeletonSpec } from './skeleton.js';
import { BEAT, beat, bell, bump, easeInCubic, easeOutQuad, smooth, track, type Beat } from './tracks.js';

const scaleL = (p: Local, k: number): Local => [p[0] * k, p[1] * k, p[2] * k];

/**
 * Biped, about 80 units tall at `scale` 1. Hip height sits just under the leg's reach, so knees
 * are nearly straight at rest but never lock. Gaits: walk (duty 0.6) and run (duty 0.35, flight).
 */
export function humanoid(scale = 1): SkeletonSpec {
  const k = scale;
  return defineSkeleton({
    name: 'humanoid',
    height: 80 * k,
    trunk: [
      { name: 'pelvis', at: scaleL([0, 0, 35], k) },
      { name: 'chest', at: scaleL([0, 0, 58], k) },
      { name: 'neck', at: scaleL([0, 0, 62.5], k) },
      { name: 'head', at: scaleL([0.8, 0, 71], k) },
    ],
    head: 'head',
    legs: [
      { name: 'legL', hip: 'pelvis', offset: scaleL([0, -4.8, 0], k), lengths: [18 * k, 17.5 * k], knee: 'forward', stance: scaleL([1, -0.6, 0], k) },
      { name: 'legR', hip: 'pelvis', offset: scaleL([0, 4.8, 0], k), lengths: [18 * k, 17.5 * k], knee: 'forward', stance: scaleL([-1, 0.6, 0], k) },
    ],
    arms: [
      { name: 'armL', shoulder: 'chest', offset: scaleL([0, -9, -1.5], k), lengths: [12.5 * k, 12 * k], side: -1, swingWith: 'legR' },
      { name: 'armR', shoulder: 'chest', offset: scaleL([0, 9, -1.5], k), lengths: [12.5 * k, 12 * k], side: 1, swingWith: 'legL' },
    ],
    gaits: {
      walk: { duty: 0.6, stride: 27 * k, cadence: 1.55, phases: { legL: 0, legR: 0.5 }, lift: 6.5 * k, lean: 0.4 * k, roll: 7, twist: 7, armSwing: 0.36, armFlex: 0.2, tailSway: 0 },
      run: {
        duty: 0.35, stride: 28 * k, cadence: 2.05, phases: { legL: 0, legR: 0.5 }, lift: 13 * k, heelKick: 1,
        bob: 2.4 * k, bobCycles: 2, bobPhase: 0.17, lean: 5 * k, roll: 11, twist: 12, armSwing: 0.6, armFlex: 1.2, armAcross: 0.95,
      },
    },
  });
}

/**
 * Four-legged digitigrade body (a wolf or a dog), about 37 units tall at the head and 60 long at
 * `scale` 1. Hind legs bend forward at the stifle and have a hock segment; front legs bend
 * back at the elbow and stand on a pastern. Gaits: walk (lateral sequence, a quarter apart)
 * and run (transverse gallop with spine flex and a flight phase).
 */
export function quadruped(scale = 1): SkeletonSpec {
  const k = scale;
  return defineSkeleton({
    name: 'quadruped',
    height: 37 * k,
    trunk: [
      { name: 'pelvis', at: scaleL([-14, 0, 27], k) },
      { name: 'waist', at: scaleL([-2, 0, 27.5], k) },
      { name: 'chest', at: scaleL([11, 0, 28.5], k) },
      { name: 'neck', at: scaleL([18, 0, 33], k) },
      { name: 'head', at: scaleL([24, 0, 36], k) },
    ],
    head: 'head',
    legs: [
      { name: 'hindL', hip: 'pelvis', offset: scaleL([-1, -4.2, -2.5], k), lengths: [11 * k, 10.5 * k], foot: { length: 7.5 * k, tilt: 16 }, knee: 'forward', stance: scaleL([-1, 0, 0], k) },
      { name: 'hindR', hip: 'pelvis', offset: scaleL([-1, 4.2, -2.5], k), lengths: [11 * k, 10.5 * k], foot: { length: 7.5 * k, tilt: 16 }, knee: 'forward', stance: scaleL([-1, 0, 0], k) },
      { name: 'foreL', hip: 'chest', offset: scaleL([0.5, -3.8, -5], k), lengths: [9 * k, 9 * k], foot: { length: 4.5 * k, tilt: 12 }, knee: 'back', stance: scaleL([1, 0, 0], k) },
      { name: 'foreR', hip: 'chest', offset: scaleL([0.5, 3.8, -5], k), lengths: [9 * k, 9 * k], foot: { length: 4.5 * k, tilt: 12 }, knee: 'back', stance: scaleL([1, 0, 0], k) },
    ],
    tails: [{ name: 'tail', root: 'pelvis', offset: scaleL([-3.5, 0, 1.5], k), segments: 7, length: 21 * k, pitch: 38 }],
    gaits: {
      walk: { duty: 0.66, stride: 13 * k, cadence: 1.9, phases: { hindL: 0, foreL: 0.25, hindR: 0.5, foreR: 0.75 }, lift: 4.5 * k, bob: 0.6 * k, bobCycles: 2, bobPhase: 0.1, tailSway: 14, tailLift: 4 },
      run: {
        duty: 0.32, stride: 18 * k, cadence: 2.5, phases: { hindL: 0, hindR: 0.1, foreL: 0.48, foreR: 0.58 }, lift: 7 * k, heelKick: 0.6,
        bob: 3 * k, bobCycles: 1, bobPhase: 0.22, pitch: 5, pitchPhase: 0.05, flex: 3 * k, flexPhase: 0.3, tailSway: 8, tailLift: 18,
      },
    },
  });
}

/**
 * One-handed slash for a humanoid holding a weapon in `armR`: wind up behind the right shoulder,
 * hold, cut across to the left past the target, hold, settle, recover. The weapon's direction
 * goes to the skin as `extra.weaponYaw` and `extra.weaponPitch` (radians, in the creature's
 * frame); the hit event sits at the end of the strike.
 */
export function slash(skeleton: SkeletonSpec, b: Beat = BEAT, seconds = 0.42): Clip {
  const chest = skeleton.trunk.find(j => j.name === 'chest')!.at;
  const feet = restFeet(skeleton);
  const k = skeleton.height / 80;
  return defineClip({
    name: 'slash',
    kind: 'attack',
    tags: ['melee'],
    seconds,
    events: [{ t: b.extreme, name: EVENTS.hit }],
    drive(t: number): Drive {
      const B = (rest: number, apex: number, extreme: number, target: number, creep = 0) => beat(t, b, rest, apex, extreme, target, creep);
      const phi = B(0.6, 2.3, -2.15, -1.8, 0.12);
      const hand = phi * 0.66;
      const reach = B(12, 12, 19.8, 16, -0.4) * k;
      const up = B(-6, -2, -7.6, -6.5, 0.4) * k;
      const crouch = B(0.5, 1.5, 3.8, 2, 0.3) * k;
      const lean = B(0, -1.5, 5.6, 3.4, -0.4) * k;
      return {
        root: [lean * 0.5, 0, -crouch],
        trunk: { chest: [lean * 0.5, 0, 0], head: [lean * 0.6, 0, 0] },
        twist: (B(0.2, 0.7, -0.72, -0.45, 0.1) * 180) / Math.PI,
        feet: {
          legL: [feet.legL[0] + 6 * k, feet.legL[1] - 1.5 * k, 0],
          legR: [feet.legR[0] - 7 * k, feet.legR[1] + 1.5 * k, 0],
        },
        arms: {
          armR: { target: [chest[0] + Math.cos(hand) * reach, chest[1] + Math.sin(hand) * reach, chest[2] + up], elbow: [0.3, 0.7, -0.9] },
          // The free arm counterbalances: out to the side at chest height, opposite the blade.
          armL: { target: [chest[0] + 3 * k - Math.cos(phi) * 6 * k, chest[1] - 13 * k - Math.sin(phi) * 6 * k, chest[2] - 9 * k], elbow: [-0.2, -1, -0.6] },
        },
        extra: { weaponYaw: phi, weaponPitch: B(-0.15, 0.25, -0.25, -0.18, 0.03) },
      };
    },
  });
}

/**
 * Lunging bite for a quadruped: gather back with the head low, hold, spring forward past the
 * target with the jaw open and the front feet stepping in, snap shut during the hold, settle,
 * recover. The skin reads `extra.jaw` (0 closed, 1 open) and `extra.ears` (1 = flattened).
 */
export function bite(skeleton: SkeletonSpec, b: Beat = BEAT, seconds = 0.5): Clip {
  const feet = restFeet(skeleton);
  const k = skeleton.height / 37;
  const fronts = skeleton.legs.filter(l => l.knee === 'back').map(l => l.name);
  return defineClip({
    name: 'bite',
    kind: 'attack',
    tags: ['melee'],
    seconds,
    events: [{ t: b.extreme, name: EVENTS.hit }],
    drive(t: number): Drive {
      const B = (rest: number, apex: number, extreme: number, target: number, creep = 0) => beat(t, b, rest, apex, extreme, target, creep);
      const lunge = B(0, -3.5, 8, 5.5, -0.3) * k;
      const drive: Drive = {
        root: [lunge, 0, B(0, -2.5, 0.8, 0, -0.2) * k],
        pitch: B(0, -4, 3, 1, -0.5),
        // The head leads the lunge and stretches past the body, so the bite reads in profile and from the front.
        trunk: { neck: [B(0, -1.5, 4, 2.5) * k, 0, B(0, -2, 0.5, 0) * k], head: [B(0, -2.5, 8.5, 4.5) * k, 0, B(0, -3, 0.5, -0.5) * k] },
        feet: { ...feet },
        tails: { tail: { lift: B(0, -12, 16, 6), sway: 6, phase: Math.PI * 2 * t } },
        extra: {
          // A snarl during the gather, wide open through the strike and the extreme (two or three
          // frames at 10–12 fps), then the snap shut during the hold: the chomp is what reads.
          jaw: track(t, [[0, 0], [b.apex, 0.45], [b.strike, 0.85], [b.extreme, 1], [(b.extreme + b.hold) / 2, 1], [b.hold, 0.05], [1, 0]]),
          ears: track(t, [[0, 0], [b.apex, 1], [b.settle, 1], [1, 0]]),
        },
      };
      // Front feet step in with the lunge (swing during the strike) and back during the recovery.
      for (const name of fronts) {
        const r = feet[name];
        const step = track(t, [[0, 0], [b.strike, 0], [b.extreme, 5.5 * k], [b.settle, 4.5 * k], [0.82, 4.5 * k], [1, 0]]);
        const inStrike = t > b.strike && t < b.extreme ? bell((t - b.strike) / (b.extreme - b.strike)) : 0;
        const inRecover = t > 0.82 ? bell((t - 0.82) / 0.18) : 0;
        drive.feet![name] = [r[0] + step, r[1], r[2] + 3.5 * k * (inStrike + inRecover)];
      }
      return drive;
    },
  });
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Options of `hit`. */
export interface HitOptions {
  /** Seconds of the whole clip. Default 0.4. */
  seconds?: number;
  /** How hard the blow lands: 1 is a firm flinch, 0.6 a graze, 2 a heavy knock-back. Default 1. */
  strength?: number;
  /**
   * How far the blow pushes the character back, in world units (root motion: the export writes it
   * as negative `travel`). Default 0.12 × height × strength; 0 to stay in place.
   */
  knockback?: number;
}

/**
 * Reaction to a blow, for any skeleton: the body snaps back from the hit in a frame or two (the top
 * of the trunk most, like a whiplash), freezes on that pose for a beat (hit-stop: what sells the
 * impact), then recovers. The front lifts, arms fling back, tails rise, and the blow pushes the
 * character back (root motion, `knockback`). Feet stay planted relative to the body: a push
 * slides them, as it should. `cancel` marks when another action may cut it short; the skin reads
 * `extra.hurt` (0..1) to flash eyes or flinch the face.
 */
export function hit(skeleton: SkeletonSpec, options: HitOptions | number = {}): Clip {
  const o = typeof options === 'number' ? { seconds: options } : options;
  const seconds = o.seconds ?? 0.4;
  const k = o.strength ?? 1;
  const h = skeleton.height;
  const n = skeleton.trunk.length;
  const knock = o.knockback ?? 0.12 * h * k;
  const SNAP = 0.1;
  const STOP = 0.3;
  // Snap, freeze with a slight shiver, recover.
  const impact = (t: number) => (t < SNAP ? easeOutQuad(t / SNAP) : t < STOP ? 1 - 0.04 * ((t - SNAP) / (STOP - SNAP)) : 0.96 * (1 - smooth((t - STOP) / (1 - STOP))));
  return defineClip({
    name: 'hit',
    kind: 'hit',
    seconds,
    events: [{ t: 0.6, name: EVENTS.cancel }],
    ...(knock ? { travel: (t: number) => -knock * easeOutQuad(clamp01(t / STOP)) } : {}),
    drive(t: number): Drive {
      const f = impact(t);
      const shiver = t > SNAP && t < STOP ? Math.sin((t - SNAP) * 90) * 0.012 * h * k : 0;
      const trunk: Record<string, Local> = {};
      // The recoil grows along the trunk but stays spread over it: a head thrown far back on its own
      // reads as a stretched neck from the high camera, not as an impact.
      skeleton.trunk.forEach((j, i) => {
        const w = n > 1 ? i / (n - 1) : 1;
        trunk[j.name] = [-0.07 * k * h * (0.3 + 0.7 * w) * f, shiver * w, 0];
      });
      return {
        root: [-0.03 * k * h * f, 0, -0.035 * k * h * f],
        trunk,
        pitch: 16 * k * f,
        arms: Object.fromEntries((skeleton.arms ?? []).map(a => [a.name, { swing: -0.8 * k * f, flex: 0.25 + 0.7 * f, out: 0.2 + 0.4 * k * f }])),
        tails: Object.fromEntries((skeleton.tails ?? []).map(tl => [tl.name, { lift: 26 * k * f }])),
        extra: { hurt: f },
      };
    },
  });
}

/**
 * Feet that stay planted in the world while the body travels by root motion: each foot keeps its
 * spot until its swing window, then steps to its new spot (the start plus the total travel), with
 * a lift. Returned in the body's frame (world spot minus the travel so far), as `Drive.feet` wants.
 * Use it in custom clips with `travel` (a lunge that keeps its ground, a charge): `windows` maps each
 * leg to the [start, end] of its step in normalized time, `distance` is the total travel, `raise`
 * lifts every foot (a jump's arc).
 */
export function stepsAlong(skeleton: SkeletonSpec, travel: (t: number) => number, distance: number, windows: Record<string, [number, number]>, lift: number, t: number, raise = 0): Record<string, Local> {
  const rest = restFeet(skeleton);
  const feet: Record<string, Local> = {};
  for (const leg of skeleton.legs) {
    const r = rest[leg.name];
    const [a, b] = windows[leg.name] ?? [0.3, 0.6];
    const u = clamp01((t - a) / (b - a));
    const worldX = r[0] + distance * smooth(u);
    feet[leg.name] = [worldX - travel(t), r[1], r[2] + lift * bump(t, a, b) + raise];
  }
  return feet;
}

/** Options of `jump`. */
export interface JumpOptions {
  /** Seconds of the whole clip. Default 0.75. */
  seconds?: number;
  /** Peak height of the feet above the floor, in world units. Default 0.28 × height. */
  height?: number;
  /** Distance covered forward (root motion). Default 0 (a jump in place). */
  distance?: number;
}

/**
 * Jump for any skeleton: crouch (anticipation), push off (`takeoff`), an arc with the legs
 * tucked and the arms thrown up, `land` with a crouch that absorbs it, recover. With a
 * `distance` the body travels by root motion while the feet stay planted until takeoff and land
 * on their new spot. The cell must fit the top of the arc.
 */
export function jump(skeleton: SkeletonSpec, options: JumpOptions = {}): Clip {
  const h = skeleton.height;
  const seconds = options.seconds ?? 0.75;
  const height = options.height ?? 0.28 * h;
  const distance = options.distance ?? 0;
  const UP = 0.3;
  const DOWN = 0.7;
  const travel = (t: number) => distance * smooth(clamp01((t - UP) / (DOWN - UP)));
  const windows = Object.fromEntries(skeleton.legs.map(l => [l.name, [UP, DOWN] as [number, number]]));
  return defineClip({
    name: 'jump',
    kind: 'jump',
    seconds,
    events: [{ t: UP, name: 'takeoff' }, { t: DOWN, name: EVENTS.land }, { t: 0.86, name: EVENTS.cancel }],
    ...(distance ? { travel } : {}),
    drive(t: number): Drive {
      // Crouch before takeoff and after landing; the body rides the arc in between.
      const crouch = 0.1 * h * (bump(t, 0.02, UP + 0.04) + 0.8 * bump(t, DOWN - 0.04, 0.98));
      const air = t > UP && t < DOWN ? Math.sin((Math.PI * (t - UP)) / (DOWN - UP)) : 0;
      const arc = height * air;
      // The legs tuck mid-air: the feet rise a little more than the body.
      const tuck = 0.08 * h * air * air;
      const feet = stepsAlong(skeleton, travel, distance, windows, 0, t, arc + tuck);
      const armsUp = bump(t, UP - 0.1, DOWN);
      return {
        root: [0, 0, arc - crouch],
        pitch: -6 * bump(t, 0.02, UP + 0.04) + 4 * air,
        feet,
        arms: Object.fromEntries((skeleton.arms ?? []).map(a => [a.name, { swing: -0.6 * bump(t, 0.02, UP) + 1.6 * armsUp, flex: 0.3 + 0.5 * armsUp, out: 0.15 + 0.35 * armsUp }])),
        tails: Object.fromEntries((skeleton.tails ?? []).map(tl => [tl.name, { lift: 20 * air - 10 * bump(t, 0.02, UP) }])),
      };
    },
  });
}

/** Options of `dodge`. */
export interface DodgeOptions {
  /** Seconds of the whole clip. Default 0.45. */
  seconds?: number;
  /** 'dash' darts forward low; 'backstep' hops back with the guard up. Default 'dash'. */
  style?: 'dash' | 'backstep';
  /** Distance covered (root motion), in world units. Default 0.55 × height (dash), 0.35 × height (backstep). */
  distance?: number;
}

/**
 * Dodge for any skeleton: a quick, low dash forward or a hop back, covered by root motion (the
 * game moves the sprite; the body stays in its cell). Feet stay planted in the world and step to
 * their new spots one after the other, so nothing slides. `cancel` marks the recovery, where
 * another action may start.
 */
export function dodge(skeleton: SkeletonSpec, options: DodgeOptions = {}): Clip {
  const h = skeleton.height;
  const style = options.style ?? 'dash';
  const seconds = options.seconds ?? 0.45;
  const back = style === 'backstep';
  const distance = (back ? -1 : 1) * (options.distance ?? (back ? 0.35 : 0.55) * h);
  const travel = (t: number) => distance * smooth(clamp01((t - 0.08) / 0.62));
  // Feet step one after the other: front feet first for a dash, rear feet first for a backstep.
  const order = skeleton.legs.map(l => l.name).sort((x, y) => (restFeet(skeleton)[back ? x : y][0] - restFeet(skeleton)[back ? y : x][0]));
  const windows = Object.fromEntries(order.map((name, i) => {
    const a = 0.1 + (0.4 * i) / Math.max(1, order.length);
    return [name, [a, a + 0.32] as [number, number]];
  }));
  return defineClip({
    name: back ? 'backstep' : 'dash',
    kind: 'dodge',
    tags: [style],
    seconds,
    events: [{ t: 0.7, name: EVENTS.cancel }],
    travel,
    drive(t: number): Drive {
      const crouch = bump(t, 0, 0.9);
      const feet = stepsAlong(skeleton, travel, distance, windows, 0.12 * h, t);
      return {
        feet,
        root: [0, 0, -(back ? 0.06 : 0.11) * h * crouch],
        trunk: Object.fromEntries(skeleton.trunk.map((j, i) => [j.name, [(back ? -0.03 : 0.06) * h * crouch * (i / Math.max(1, skeleton.trunk.length - 1)), 0, 0] as Local])),
        pitch: (back ? 6 : -10) * crouch,
        arms: Object.fromEntries((skeleton.arms ?? []).map(a => [a.name, back ? { swing: 0.6 * crouch, flex: 0.4 + 0.8 * crouch, out: 0.2 } : { swing: -0.7 * crouch, flex: 0.3 + 0.4 * crouch, out: 0.25 }])),
        tails: Object.fromEntries((skeleton.tails ?? []).map(tl => [tl.name, { lift: (back ? 10 : -8) * crouch }])),
      };
    },
  });
}

/**
 * Death for any skeleton, held on its last frame, with `land` when the body hits the floor,
 * `extra.dead` (0 alive → 1 dead) for the skin to dim eyes or glows, and `extra.weaponRelease` and
 * `extra.offWeaponRelease` (0 held → 1 let go): the hands let go of what they hold as the arms drop,
 * and it settles on the floor (`held`). A death that keeps its weapon in hand sets them to 0.
 * - Bipeds: the knees buckle, the arms fling up, the body topples forward and lands flat, face
 *   down; the legs fold under the hips and the arms settle along the trunk, so nothing stands up
 *   from the lying body.
 * - More legs: the body collapses onto its belly with a slump and a twist, the head drops to the
 *   floor and lolls to one side, tails go limp to the side; front legs slide forward and every
 *   foot a little out, so the legs splay.
 * A lying humanoid is about as long as it was tall: its cell needs about 0.3 × height below the
 * pivot (the end of the body nearest the camera).
 */
export function death(skeleton: SkeletonSpec, seconds = 0.9): Clip {
  const h = skeleton.height;
  const first = skeleton.trunk[0].at;
  const last = skeleton.trunk[skeleton.trunk.length - 1].at;
  const pivotZ = (first[2] + last[2]) / 2;
  const biped = skeleton.legs.length <= 2;
  const rest = restFeet(skeleton);
  const n = skeleton.trunk.length;
  const LAND = biped ? 0.68 : 0.62;
  const lerpL = (a: Local, b: Local, t: number): Local => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // Biped: where the pelvis ends (behind the standing spot) and the trunk's height once flat.
  const pelvisFinalX = -0.21 * h;
  const restZ = 0.083 * h;
  // After a -90° pitch the pelvis sits (pivot height − pelvis height) behind the pivot.
  const dxFinal = pelvisFinalX + (pivotZ - first[2]);
  const dzFinal = restZ - pivotZ;
  const restPose = solvePose(skeleton, Frame3.facing(vec3(0, 0, 0), 0), {});
  const hands = (skeleton.arms ?? []).map(arm => {
    const p = restPose.joints[`${arm.name}.hand`];
    const s = arm.side;
    return {
      name: arm.name,
      rest: [p.x, p.y, p.z] as Local,
      flung: [0.1 * h, s * 0.24 * h, 0.33 * h] as Local,
      down: [pelvisFinalX + (s > 0 ? 0.025 : 0.05) * h, s * 0.2 * h, 0.022 * h] as Local,
      elbowRest: [0, s * 0.7, -1] as Local,
      elbowDown: [0, s, 0.25] as Local,
    };
  });
  // Creatures: the head end and the joint before it slump to the floor and to one side.
  const headIndex = skeleton.trunk.findIndex(j => j.name === skeleton.head);
  const lowest = Math.min(...skeleton.trunk.map(j => j.at[2]));
  const bellyDrop = lowest - 0.32 * h;

  return defineClip({
    name: 'death',
    kind: 'death',
    seconds,
    events: [{ t: LAND, name: EVENTS.land }],
    drive(t: number): Drive {
      const buckle = smooth(clamp01(t / 0.3));
      const fall = easeInCubic(clamp01((t - 0.12) / (LAND - 0.12)));
      // A small rebound after the body lands.
      const rebound = t > LAND ? 0.04 * bell(clamp01((t - LAND) / 0.25)) : 0;
      const down = clamp01(0.25 * buckle + 0.75 * fall - rebound);
      const dead = smooth(clamp01((t - 0.15) / (LAND + 0.2 - 0.15)));
      // The hands let go as the arms drop after the fling, and what they held is on the floor when the body lands.
      const release = smooth(clamp01((t - 0.3) / (LAND + 0.05 - 0.3)));
      if (biped) {
        const pitch = -90 * fall;
        // The solver pitches the trunk after adding offsets, so the shift is given in the pitched
        // frame (rotated back by the pitch) to come out as intended.
        const a = (-pitch * Math.PI) / 180;
        const dx = dxFinal * fall;
        const dz = dzFinal * down;
        // Legs fold under the hips: feet slide to just under the pelvis as the body drops.
        const w = smooth(clamp01((t - 0.06) / (LAND - 0.06)));
        const feet: Record<string, Local> = {};
        for (const leg of skeleton.legs) {
          const r = rest[leg.name];
          feet[leg.name] = lerpL(r, [pelvisFinalX - 0.006 * h, Math.sign(r[1]) * 0.08 * h, 0.016 * h], w);
        }
        // Arms: thrown up as the body goes over, then dropped along the sides.
        const throwUp = smooth(clamp01((t - 0.08) / 0.2)) * (1 - smooth(clamp01((t - 0.3) / (LAND - 0.3))));
        const settle = smooth(clamp01((t - 0.3) / (LAND + 0.05 - 0.3)));
        const arms = Object.fromEntries(hands.map(hd => [hd.name, { target: lerpL(lerpL(hd.rest, hd.down, settle), hd.flung, throwUp), elbow: lerpL(hd.elbowRest, hd.elbowDown, settle) }]));
        return {
          root: [dx * Math.cos(a) - dz * Math.sin(a), 0, dx * Math.sin(a) + dz * Math.cos(a)],
          pitch,
          feet,
          arms,
          tails: Object.fromEntries((skeleton.tails ?? []).map(tl => [tl.name, { lift: -6 * down }])),
          extra: { dead, weaponRelease: release, offWeaponRelease: release },
        };
      }
      // Creatures: collapse onto the belly, then the head end slumps a little after the landing.
      const slump = smooth(clamp01((t - 0.2) / 0.55));
      const limp = smooth(clamp01((t - 0.15) / 0.45));
      const trunk: Record<string, Local> = {};
      skeleton.trunk.forEach((j, i) => (trunk[j.name] = [0, 0, -0.12 * h * (n > 1 ? i / (n - 1) : 0) * down]));
      if (headIndex > 0) {
        const neck = skeleton.trunk[headIndex - 1].name;
        trunk[neck] = [trunk[neck][0] - 0.054 * h * slump, 0.032 * h * slump, trunk[neck][2] - 0.095 * h * slump];
        trunk[skeleton.head] = [trunk[skeleton.head][0] - 0.22 * h * slump, 0.12 * h * slump, trunk[skeleton.head][2] - 0.18 * h * slump];
      }
      // Front legs slide forward and every foot a little out as the body drops, so the legs splay
      // instead of folding through the floor.
      const feet: Record<string, Local> = {};
      for (const leg of skeleton.legs) {
        const r = rest[leg.name];
        feet[leg.name] = [r[0] + (leg.knee === 'back' ? 0.28 * h * down : 0), r[1] + Math.sign(r[1]) * 0.05 * h * down, r[2]];
      }
      return {
        root: [0, 0, -bellyDrop * down],
        trunk,
        feet,
        pitch: -4 * down - 4 * slump,
        twist: 6 * slump,
        roll: 8 * down,
        tails: Object.fromEntries((skeleton.tails ?? []).map(tl => [tl.name, { lift: -12 * limp, curl: 40 * limp, sway: 110 * limp, phase: 3.77 }])),
        extra: { dead, weaponRelease: release, offWeaponRelease: release },
      };
    },
  });
}
