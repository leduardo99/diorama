/**
 * Ingrid's attack, the spear thrust (`attack`, `melee`): a one-handed underarm lunge.
 *
 * She draws the spear back beside her hip as it drops level, the shoulders turning away and the body
 * sinking (anticipation, 3 frames), holds for a frame, then drives it forward in two frames, the right
 * shoulder coming round, the left foot stepping into a lunge and the shield drawn in to the chest;
 * `hit` is the extreme pose (frame 6), where the arm is straight and the spear at full reach. A short
 * hold over the blow, a settle and the recovery to the idle pose on the last frame, the spear standing
 * upright again.
 *
 * Frames (12 at 0.6 s, 20 fps): 0-3 draw back, 3-4 hold, 4-6 thrust, 6-8 hold, 8-9 settle, 9-11 recover.
 *
 * Channels for the skin: `weaponYaw` / `weaponPitch` (the spear), `brow` and `mouth` (the face sets
 * itself for the blow).
 */

import { EVENTS, beat, defineClip, restFeet, type Beat, type Clip, type Drive, type SkeletonSpec } from '@core/rig';
import { SPEAR_REST_PITCH, SPEAR_REST_YAW } from '../../../gear';
import { ELBOW_L, ELBOW_R, HAND_L, HAND_R } from '../hold';

export const THRUST_FRAMES = 12;
/** Frame n of the export as normalized time of the clip (events live here). */
const F = (n: number) => n / THRUST_FRAMES;
/** The beat runs on `u`, which reaches 1 on the last frame (not at t = 1, which no frame samples), so the clip ends on the idle pose. */
const U = (frame: number) => frame / (THRUST_FRAMES - 1);

export const THRUST_BEAT: Beat = { apex: U(3), strike: U(4), extreme: U(6), hold: U(8), settle: U(9) };

export function thrust(skeleton: SkeletonSpec, seconds = 0.6): Clip {
  const k = skeleton.height / 80;
  const b = THRUST_BEAT;
  const feet = restFeet(skeleton);
  return defineClip({
    name: 'thrust',
    kind: 'attack',
    tags: ['melee'],
    seconds,
    events: [
      { t: F(6), name: EVENTS.hit },
      { t: F(9), name: EVENTS.cancel },
    ],
    drive(t: number): Drive {
      const u = Math.min(1, (t * THRUST_FRAMES) / (THRUST_FRAMES - 1));
      const B = (rest: number, apex: number, extreme: number, target: number, creep = 0) => beat(u, b, rest, apex, extreme, target, creep);
      const lean = B(0, -1.6, 5.5, 3.6, -0.4) * k;
      const crouch = B(0, 1.8, 3.6, 2.6, 0.2) * k;
      // The hands go with the lunge: forward by half the lean, down by the crouch.
      const follow = [lean * 0.5, 0, -crouch];
      return {
        root: [follow[0], 0, follow[2]],
        pitch: B(0, 4, -7, -5, 1),
        twist: B(0, 24, -20, -14, 2),
        trunk: { chest: [lean * 0.5, 0, 0], neck: [lean * 0.55, 0, 0], head: [lean * 0.6, 0, 0] },
        feet: {
          legL: [feet.legL[0] + B(0, -1.5, 10, 8) * k, feet.legL[1] + B(0, 0, -1, -0.8) * k, 0],
          legR: [feet.legR[0] + B(0, 2, -6, -4.5) * k, feet.legR[1] + B(0, 0, 1, 0.8) * k, 0],
        },
        arms: {
          // Drawn back beside the hip, then driven forward to arm's length at chest height.
          armR: {
            target: [B(HAND_R[0], -7, 21, 15) + follow[0], B(HAND_R[1], 12.5, 5, 7.5), B(HAND_R[2], 47, 55, 52) + follow[2]],
            elbow: [B(ELBOW_R[0], -1, 0.2, 0.1), B(ELBOW_R[1], 0.8, 0.6, 0.6), B(ELBOW_R[2], -0.6, -0.5, -0.7)],
          },
          // The shield comes in across the chest as she lunges.
          armL: {
            target: [B(HAND_L[0], 5, 11, 9) + follow[0], B(HAND_L[1], -12, -6, -8), B(HAND_L[2], 46, 54, 51) + follow[2]],
            elbow: ELBOW_L,
          },
        },
        extra: {
          weaponYaw: B(SPEAR_REST_YAW, 0.05, -0.12, -0.08),
          weaponPitch: B(SPEAR_REST_PITCH, 0.1, -0.05, 0.02),
          brow: B(0, -0.5, -0.8, -0.5),
          mouth: B(0, 0, 0.45, 0.2),
        },
      };
    },
  });
}
