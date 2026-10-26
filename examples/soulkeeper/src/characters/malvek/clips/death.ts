/**
 * Malvek's death: the body topples forward and ends face down, held on its last frame. The motion
 * is the ossuary guard's (`humanoidDeath`: knees that buckle onto the floor, arms flung up and then laid
 * along the trunk, the trunk landing exactly flat at the height where the skirt rests, the `land`
 * event), which is written for any `humanoid()`-shaped body; this wrapper replaces the guard's sword
 * channels with the scythe's. The scythe flies out with the flung right arm, falls, and the skin
 * lays it on the floor beside the hand, the blade turned outwards; the lantern is thrown and settles
 * on the floor. `extra.dead` (0 alive, 1 dead) puts the fire out: the crown, the flame and the eyes
 * burn low as the body falls.
 */

import { defineClip, smooth, track, type Clip, type Drive, type SkeletonSpec } from '@core/rig';
import { SCYTHE_REST_AIM, SCYTHE_REST_PITCH, SCYTHE_REST_YAW } from '../../../gear';
import { humanoidDeath } from '../../shared/humanoid-clips';
import { clamp01 } from '../hold';

export function malvekDeath(skeleton: SkeletonSpec, seconds = 0.9): Clip {
  const base = humanoidDeath(skeleton, { seconds });
  return defineClip({
    ...base,
    drive(t: number): Drive {
      const d = base.drive(t);
      return {
        ...d,
        extra: {
          // The hands let go as the base death says (`weaponRelease`, `offWeaponRelease`).
          ...d.extra,
          weaponYaw: track(t, [[0, SCYTHE_REST_YAW], [0.08, SCYTHE_REST_YAW], [0.3, 1.9], [0.5, 1.4], [1, 1.4]]),
          weaponPitch: track(t, [[0, SCYTHE_REST_PITCH], [0.08, SCYTHE_REST_PITCH], [0.3, 0.7], [0.5, -0.2], [1, -0.2]]),
          bladeAim: track(t, [[0, SCYTHE_REST_AIM], [0.3, 0.8], [0.6, 1.9], [1, 1.9]]),
          lanternSway: track(t, [[0, 0], [0.12, 0.2], [0.3, -0.6], [0.5, 0.3], [0.7, 0]]),
          dead: smooth(clamp01((t - 0.15) / 0.55)),
        },
      };
    },
  });
}
