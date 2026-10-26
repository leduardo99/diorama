/**
 * @core/rig - Skeleton specs
 *
 * A skeleton is data: a trunk (a chain of joints from the rear or bottom of the body to the
 * head), legs hanging from trunk joints, optional arms and tails, and the gaits it can walk
 * with. Humanoids, quadrupeds, insects or creatures are the same format with other numbers.
 *
 * Local coordinates are [forward, side, up]: forward is where the creature faces, side is its
 * right hand, up is up. Units are the world units of `@core/volume`.
 */

import type { GaitSpec } from './gait.js';

/** [forward, side (right +), up] in the creature's own frame, in world units (1 unit = 1 logical px). */
export type Local = [number, number, number];

/** A joint of the trunk at rest. */
export interface TrunkJoint {
  name: string;
  at: Local;
}

/** A leg: two IK bones from a hip socket, plus an optional foot segment down to the ground. */
export interface LegSpec {
  name: string;
  /** Trunk joint the leg hangs from. */
  hip: string;
  /** Hip socket relative to that joint. */
  offset: Local;
  /** Upper and lower bone lengths (thigh and shin; upper arm and forearm for a front leg). */
  lengths: [number, number];
  /**
   * Extra segment from the lowest joint to the ground contact: the hind foot of a digitigrade
   * leg (hock to paw) or the pastern of a front leg (wrist to paw). `tilt` (degrees) leans it so
   * the joint above sits behind the contact; 0 is vertical.
   */
  foot?: { length: number; tilt: number };
  /**
   * Which way the middle joint bends. `'forward'` for knees and stifles, `'back'` for the elbows
   * of front legs. Or a direction `[forward, side, up]` in the creature's frame (side: right +)
   * towards which the joint bulges, for limbs that do not bend in the forward/back plane:
   * insect and spider legs arch up and out, so a left leg uses `[0, -1, 1.2]` and a right leg
   * `[0, 1, 1.2]`. The direction does not need to be perpendicular to the hip-to-foot line (the
   * solver projects it onto the plane of the bend), only finite and non-zero.
   */
  knee: 'forward' | 'back' | Local;
  /** Rest contact point, relative to the hip socket projected on the ground. Default [0, 0, 0]. */
  stance?: Local;
}

/** An arm: two bones from a shoulder socket, posed by swing (FK) or by a hand target (IK). */
export interface ArmSpec {
  name: string;
  /** Trunk joint the arm hangs from. */
  shoulder: string;
  /** Shoulder socket relative to that joint. */
  offset: Local;
  /** Upper arm and forearm lengths. */
  lengths: [number, number];
  /** -1 for the left arm, 1 for the right arm. */
  side: -1 | 1;
  /** Leg whose phase drives this arm's swing while walking (usually the opposite leg). */
  swingWith?: string;
  /**
   * Length of the hand, from the wrist to the fingertips: a held item's grip sits in its palm, a
   * fraction of it past the wrist (`HAND.centroid`). Default a tenth of the skeleton's height (`HAND.length`).
   */
  hand?: number;
}

/** A tail (or any loose chain): segments from a root, hanging back and down at rest. */
export interface TailSpec {
  name: string;
  /** Trunk joint the tail hangs from. */
  root: string;
  /** Root socket relative to that joint. */
  offset: Local;
  /** Number of segments (the chain has segments + 1 points). */
  segments: number;
  /** Total length in world units. */
  length: number;
  /** Rest angle below horizontal, pointing backwards, in degrees. */
  pitch: number;
}

/** A complete skeleton: trunk, limbs and gaits. */
export interface SkeletonSpec {
  name: string;
  /** Overall height in world units, for scale references. */
  height: number;
  /** Trunk joints in order from the rear (or bottom) to the head. */
  trunk: TrunkJoint[];
  /** Name of the trunk joint that carries the head. */
  head: string;
  legs: LegSpec[];
  arms?: ArmSpec[];
  tails?: TailSpec[];
  /** Gaits this skeleton can use, by name ("walk", "run", "trot", ...). */
  gaits: Record<string, GaitSpec>;
}

/**
 * Validates a skeleton spec: unique names, limbs hanging from existing trunk joints, knees that
 * are 'forward', 'back' or a finite non-zero direction, gaits that give every leg a phase.
 * Returns the same spec, so it can wrap a literal.
 */
export function defineSkeleton(spec: SkeletonSpec): SkeletonSpec {
  const trunk = new Set(spec.trunk.map(j => j.name));
  if (trunk.size !== spec.trunk.length) throw new Error(`skeleton "${spec.name}": trunk joint names must be unique`);
  if (!trunk.has(spec.head)) throw new Error(`skeleton "${spec.name}": head "${spec.head}" is not a trunk joint`);
  const names = new Set<string>();
  const unique = (n: string) => {
    if (names.has(n) || trunk.has(n)) throw new Error(`skeleton "${spec.name}": duplicate name "${n}"`);
    names.add(n);
  };
  for (const leg of spec.legs) {
    unique(leg.name);
    if (!trunk.has(leg.hip)) throw new Error(`skeleton "${spec.name}": leg "${leg.name}" hangs from unknown joint "${leg.hip}"`);
    if (typeof leg.knee !== 'string') {
      const k = leg.knee as unknown;
      if (!Array.isArray(k) || k.length !== 3 || !k.every(Number.isFinite) || Math.hypot(k[0], k[1], k[2]) === 0) {
        throw new Error(`skeleton "${spec.name}": leg "${leg.name}" knee must be 'forward', 'back' or a finite non-zero [forward, side, up] direction, got ${JSON.stringify(k)}`);
      }
    } else if (leg.knee !== 'forward' && leg.knee !== 'back') {
      throw new Error(`skeleton "${spec.name}": leg "${leg.name}" knee must be 'forward', 'back' or a [forward, side, up] direction, got "${leg.knee}"`);
    }
  }
  for (const arm of spec.arms ?? []) {
    unique(arm.name);
    if (!trunk.has(arm.shoulder)) throw new Error(`skeleton "${spec.name}": arm "${arm.name}" hangs from unknown joint "${arm.shoulder}"`);
    if (arm.swingWith && !spec.legs.some(l => l.name === arm.swingWith)) throw new Error(`skeleton "${spec.name}": arm "${arm.name}" swings with unknown leg "${arm.swingWith}"`);
    if (arm.hand !== undefined && !(Number.isFinite(arm.hand) && arm.hand > 0)) throw new Error(`skeleton "${spec.name}": arm "${arm.name}" hand length must be a positive number, got ${arm.hand}`);
  }
  for (const tail of spec.tails ?? []) {
    unique(tail.name);
    if (!trunk.has(tail.root)) throw new Error(`skeleton "${spec.name}": tail "${tail.name}" grows from unknown joint "${tail.root}"`);
  }
  for (const [gaitName, gait] of Object.entries(spec.gaits)) {
    for (const leg of spec.legs) {
      if (gait.phases[leg.name] === undefined) throw new Error(`skeleton "${spec.name}": gait "${gaitName}" has no phase for leg "${leg.name}"`);
    }
  }
  return spec;
}
