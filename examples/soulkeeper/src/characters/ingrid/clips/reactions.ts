/**
 * Ingrid's hit and death: the shared humanoid clips (`../../shared/humanoid-clips.ts`), written for
 * any `humanoid()`-shaped body, with the sword's channels replaced by the spear's and her hands on
 * their holds.
 *
 * - `ingridHit`: the shared hit (the snap back, the hit-stop, the recovery, the recoil spread along
 *   the trunk, `extra.hurt` for the face); the spear hand keeps its grip and the shaft tips back as the
 *   body is thrown, the shield arm is flung out, the wings flare a little.
 * - `ingridDeath`: the shared death (the knees buckle, the arms are flung up and laid along the
 *   trunk, the body lands face down and holds); the spear flies out with the flung right arm and the
 *   skin lays it on the floor beside her, and the wings fade as she falls (`extra.dead`).
 */

import { defineClip, smooth, track, type Clip, type Drive, type SkeletonSpec } from '@core/rig';
import { SPEAR_REST_PITCH, SPEAR_REST_YAW } from '../../../gear';
import { humanoidDeath, humanoidHit } from '../../shared/humanoid-clips';
import { clamp01, holdArms, lerp } from '../hold';

export function ingridHit(skeleton: SkeletonSpec): Clip {
  const base = humanoidHit(skeleton);
  return defineClip({
    ...base,
    drive(t: number): Drive {
      const d = base.drive(t);
      const hurt = d.extra?.hurt ?? 0;
      return {
        ...d,
        arms: holdArms(d, [-3 * hurt, 1.5 * hurt, 3 * hurt], [-6 * hurt, -6 * hurt, 4 * hurt]),
        extra: {
          ...d.extra,
          weaponYaw: lerp(SPEAR_REST_YAW, SPEAR_REST_YAW + 0.9, hurt),
          weaponPitch: lerp(SPEAR_REST_PITCH, 1.15, hurt),
          wings: 0.08 + 0.3 * hurt,
        },
      };
    },
  });
}

export function ingridDeath(skeleton: SkeletonSpec, seconds = 0.9): Clip {
  const base = humanoidDeath(skeleton, { seconds });
  return defineClip({
    ...base,
    drive(t: number): Drive {
      const d = base.drive(t);
      return {
        ...d,
        extra: {
          weaponYaw: track(t, [[0, SPEAR_REST_YAW], [0.08, SPEAR_REST_YAW], [0.3, 1.6], [0.5, 1.1], [1, 1.1]]),
          weaponPitch: track(t, [[0, SPEAR_REST_PITCH], [0.08, SPEAR_REST_PITCH], [0.3, 0.8], [0.5, -0.2], [1, -0.2]]),
          dead: smooth(clamp01((t - 0.15) / 0.55)),
        },
      };
    },
  });
}
