/**
 * Ingrid's idle and locomotion: the engine's `idle` and `locomotion` presets (breathing and weight
 * shift, the gait's feet, trunk and roll) with the arms replaced by the holds of `../hold.ts`: the
 * right hand keeps the spear upright at her side, the left carries the shield, and both follow the
 * trunk. In the walk the spear leans forward a little and the hand lifts, so its butt clears the
 * floor; in the run it is carried low, slanting forward across the body.
 *
 * Every term is a whole number of cycles per loop, so the loops close; the preset's feet and trunk
 * are left as they are, so the gait's ground speed and planted feet hold.
 */

import { defineClip, idle, locomotion, type Clip, type Drive, type SkeletonSpec } from '@core/rig';
import { holdArms } from '../hold';

const TAU = Math.PI * 2;
/** In the walk the spear leans forward more than out, its head carried ahead of her. */
const WALK_YAW = 0.6;

/** 1.6 s at 16 frames (10 fps): a slow breath, the shield hand drifting once, the spear steady. */
export function ingridIdle(skeleton: SkeletonSpec, seconds = 1.6): Clip {
  const base = idle(skeleton, { seconds, breath: 0.6, sway: 0.4 });
  return defineClip({
    ...base,
    drive(t: number): Drive {
      const d = base.drive(t);
      return { ...d, arms: holdArms(d, [0, 0, 0], [0.4 * Math.sin(TAU * t + 1.2), 0, 0.6 * Math.sin(TAU * t + 0.4)]) };
    },
  });
}

/** Walk and run with the spear carried and the shield held steady, with a small counter-swing against the hips. */
export function ingridLocomotion(skeleton: SkeletonSpec, gait: 'walk' | 'run'): Clip {
  const base = locomotion(skeleton, gait);
  const run = gait === 'run';
  return defineClip({
    ...base,
    drive(t: number): Drive {
      const d = base.drive(t);
      const swingR = (d.arms?.armR?.swing ?? 0) - 0.05;
      const swingL = (d.arms?.armL?.swing ?? 0) - 0.05;
      const arms = holdArms(
        d,
        run ? [6 + 4 * swingR, -2, 2] : [1.6 * swingR, 0, 5],
        run ? [4 + 5 * swingL, 2, 3 + 0.8 * Math.abs(swingL)] : [2.4 * swingL, 0, 0.6],
      );
      return { ...d, arms, extra: run ? { weaponYaw: -0.3, weaponPitch: 0.42 } : { weaponYaw: WALK_YAW, weaponPitch: 1.22 } };
    },
  });
}
