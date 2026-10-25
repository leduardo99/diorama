/**
 * Ingrid's skill, "Soul Spear" (`skill`, `ranged`): her spirit wings spread, she raises the spear
 * over her shoulder and drives it forward, and a burst of soul fire leaves its tip.
 *
 * The wings open from their folded rest to their full span through the anticipation (`extra.wings`
 * 0 to 1) while she rises onto the spear's draw: the spear comes up over the right shoulder, its head
 * high and forward, the body arching back and the shield arm swinging out for balance (5 frames).
 * `cast` ends the draw (frame 5: the cast can no longer be cancelled). Then she drives the spear
 * forward and a little down in two frames, the wings at their widest; `release` and `spawn:tip` share
 * the extreme frame (7), where the character's effects play the soul burst at the spear's tip. A hold
 * over the blow, the wings folding back down through the settle and the recovery, and the idle pose
 * on the last frame. `cancel` marks the recovery.
 *
 * Frames (16 at 1 s, 16 fps): 0-5 spread and draw, 5-6 hold (cast on 5), 6-7 drive (release on 7),
 * 7-10 hold, 10-11 settle, 11-15 recover.
 *
 * Channels for the skin: `wings` (0..1, the spirit wings), `weaponYaw` / `weaponPitch` (the spear),
 * `brow` and `mouth` (the face).
 */

import { EVENTS, beat, defineClip, restFeet, spawnEvent, track, type Beat, type Clip, type Drive, type SkeletonSpec } from '@core/rig';
import { SPEAR_REST_PITCH, SPEAR_REST_YAW } from '../../../gear';
import { ELBOW_L, ELBOW_R, HAND_L, HAND_R } from '../hold';

export const SOULSPEAR_FRAMES = 16;
const F = (n: number) => n / SOULSPEAR_FRAMES;
const U = (frame: number) => frame / (SOULSPEAR_FRAMES - 1);

export const SOULSPEAR_BEAT: Beat = { apex: U(5), strike: U(6), extreme: U(7), hold: U(10), settle: U(11) };

export function soulspear(skeleton: SkeletonSpec, seconds = 1): Clip {
  const k = skeleton.height / 80;
  const b = SOULSPEAR_BEAT;
  const feet = restFeet(skeleton);
  return defineClip({
    name: 'soulspear',
    kind: 'skill',
    tags: ['ranged'],
    seconds,
    events: [
      { t: F(5), name: EVENTS.cast },
      { t: F(7), name: EVENTS.release },
      { t: F(7), name: spawnEvent('tip') },
      { t: F(11), name: EVENTS.cancel },
    ],
    drive(t: number): Drive {
      const u = Math.min(1, (t * SOULSPEAR_FRAMES) / (SOULSPEAR_FRAMES - 1));
      const B = (rest: number, apex: number, extreme: number, target: number, creep = 0) => beat(u, b, rest, apex, extreme, target, creep);
      const lean = B(0, -2.2, 4.5, 3, -0.3) * k;
      const rise = B(0, 1.2, -2.4, -1.6, 0.2) * k;
      const follow = [lean * 0.5, 0, rise];
      return {
        root: [follow[0], 0, follow[2]],
        pitch: B(0, 7, -6, -4, 1),
        twist: B(0, 18, -14, -9, 2),
        trunk: { chest: [lean * 0.5, 0, 0], neck: [lean * 0.55, 0, 0], head: [lean * 0.6, 0, 0] },
        feet: {
          legL: [feet.legL[0] + B(0, -1, 7, 5.5) * k, feet.legL[1], 0],
          legR: [feet.legR[0] + B(0, 1.5, -4, -3) * k, feet.legR[1], 0],
        },
        arms: {
          // The spear hand: up over the right shoulder, then driven forward at shoulder height.
          armR: {
            target: [B(HAND_R[0], -2, 19, 14) + follow[0], B(HAND_R[1], 11, 5, 7), B(HAND_R[2], 74, 66, 63) + follow[2]],
            elbow: [B(ELBOW_R[0], -0.6, 0, 0), B(ELBOW_R[1], 1, 0.7, 0.7), B(ELBOW_R[2], 0.2, -0.4, -0.6)],
          },
          // The shield arm swings out for balance on the draw and comes back in on the drive.
          armL: {
            target: [B(HAND_L[0], 3, 9, 8) + follow[0], B(HAND_L[1], -17, -9, -10), B(HAND_L[2], 52, 52, 50) + follow[2]],
            elbow: ELBOW_L,
          },
        },
        extra: {
          wings: track(u, [[0, 0.08], [U(1), 0.3], [U(4), 1], [b.hold, 1], [U(12), 0.55], [U(14), 0.15], [1, 0.08]]),
          // Raised steep over the shoulder and turned a little out on the draw: a spear aimed forward
          // and up points along the view from the front and vanishes there, so it stands nearly
          // upright, its head well above the hand in every facing; still a little out on the drive.
          weaponYaw: B(SPEAR_REST_YAW, 0.35, 0.25, 0.18),
          weaponPitch: B(SPEAR_REST_PITCH, 1.3, -0.06, 0.02),
          brow: B(0, 0.5, -0.7, -0.4),
          mouth: B(0, 0.15, 0.7, 0.3),
        },
      };
    },
  });
}
