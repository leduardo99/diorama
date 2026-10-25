/**
 * How Ingrid stands holding what she holds: the shared pose of every clip's arms. The right hand
 * grips the spear at her side, at the height where its butt just rests on the floor and the shaft
 * stands nearly upright (`SPEAR_REST`); the left forearm carries the round shield a little forward of the hip. Both are
 * hand targets in the creature's frame (forward, right, up), solved by IK; a clip moves them with
 * `holdArms` (they follow the chest, so a lean or a breath carries the hands along) and adds its own
 * offsets. Measures are for `humanoid(1.18)` (the shoulders are about 10.6 out and 66.7 up).
 */

import type { ArmDrive, Drive, Local } from '@core/rig';

/**
 * Right hand on the spear, left hand under the shield, at rest. The spear hand sits forward and out
 * of the shoulder, so the shaft and the head stand clear of the face and the helm in the profiles
 * and the 3/4 views instead of crossing them.
 */
export const HAND_R: Local = [6.5, 16.5, 44];
export const HAND_L: Local = [6, -12.5, 45];
/** Where the elbows point: down, a little out and back, so the upper arms hang. */
export const ELBOW_R: Local = [-0.4, 0.4, -1];
export const ELBOW_L: Local = [-0.3, -0.5, -1];

export const add = (a: Local, b: Local): Local => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smoothstep = (x: number) => clamp01(x) * clamp01(x) * (3 - 2 * clamp01(x));

/** How far a drive has moved the chest (root, lean, sway, breath): the hands go with it. */
export function chestShift(d: Drive): Local {
  const r = d.root ?? [0, 0, 0];
  const c = d.trunk?.chest ?? [0, 0, 0];
  return [r[0] + c[0], r[1] + c[1], r[2] + c[2]];
}

/** Both arms on their holds, following the chest, with an offset per hand. */
export function holdArms(d: Drive, right: Local = [0, 0, 0], left: Local = [0, 0, 0]): Record<string, ArmDrive> {
  const shift = chestShift(d);
  return {
    armR: { target: add(add(HAND_R, shift), right), elbow: ELBOW_R },
    armL: { target: add(add(HAND_L, shift), left), elbow: ELBOW_L },
  };
}
