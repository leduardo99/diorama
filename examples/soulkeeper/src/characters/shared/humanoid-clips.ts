/**
 * Clip factories shared by the humanoid characters of the project (any `humanoid()`-shaped
 * skeleton wearing the notched sword): the guard, the captain and, through its own wrapper, Malvek.
 * Each is the engine's preset with the changes this skeleton and its gear need.
 *
 * - `humanoidHit`: the `hit` preset with the recoil spread along the trunk and the sword following
 *   the flung arm (read below);
 * - `humanoidDeath`: the `death` preset with the legs folded, the arms laid along the sides and the
 *   trunk landing flat (read below). Malvek replaces its sword channels with the scythe's
 *   (`../malvek/clips/death.ts`).
 *
 * The clips that only the guard uses (the dodges, the jump, Soul Cleave) stay in `guard/`.
 */

import { EVENTS, bell, defineClip, easeInCubic, hit, restFeet, smooth, solvePose, track, type ArmDrive, type Clip, type Drive, type HitOptions, type Local, type SkeletonSpec } from '@core/rig';
import { Frame3, vec3 } from '@core/volume';
import { swordMix } from './sword-angle';

// ----------------------------------------------------------------------------------------------
// Hit
// ----------------------------------------------------------------------------------------------

/**
 * The ossuary guard's hit: the engine's `hit` (a snap back in one frame, a freeze on the pose, the
 * recovery, knock-back by root motion, `extra.hurt` for the skin) with the sword following the
 * flung arm. In the preset the arms fling back and the blade keeps its default angle, forward and
 * down through the body; here it swings out and up with the arm as the blow lands, in step with
 * `hurt`, and settles back to the default as the guard recovers. The skin flares the eyes and
 * gapes the jaw from `hurt`.
 *
 * The preset throws the head back by 0.13 x height but the chest by only a ninth of that. On this
 * skeleton (a thin bare neck, 4.5 units from chest to neck joint and 8.5 from there to the head)
 * the skull kinks off the spine, and from the high camera, in S and SE, where "back" is up the
 * screen, it rises off the shoulders on a stalk. Here the recoil is spread along the trunk like a
 * bent-back spine (chest 0.44, neck 0.54, head 0.77 of the preset's head offset): the whole upper
 * body arcs away from the blow and the head stays on the neck. The freeze and the knock-back are
 * the preset's.
 */

/** Share of the preset's head offset (along the facing) that each trunk joint takes. */
const RECOIL = { chest: 0.44, neck: 0.54, head: 0.77 };

export function humanoidHit(skeleton: SkeletonSpec, options: HitOptions | number = {}): Clip {
  const base = hit(skeleton, options);
  return defineClip({
    ...base,
    drive(t: number): Drive {
      const d = base.drive(t);
      const hurt = d.extra?.hurt ?? 0;
      const back = d.trunk?.head?.[0] ?? 0;
      const trunk = { ...d.trunk };
      for (const [name, share] of Object.entries(RECOIL)) {
        const o = d.trunk?.[name] ?? [0, 0, 0];
        trunk[name] = [back * share, o[1], o[2]];
      }
      return { ...d, trunk, extra: { ...d.extra, ...swordMix(2, 0.15, hurt) } };
    },
  });
}

// ----------------------------------------------------------------------------------------------
// Death
// ----------------------------------------------------------------------------------------------

/**
 * The ossuary guard's death: the knees buckle, the arms fling up, the body topples forward and ends
 * face down, held on its last frame. The same timing as the engine's `death` preset (fall, small
 * rebound, `land` event) with the changes this skeleton and cell need:
 * - the legs fold under the hips with the knees forward on the floor (the preset keeps the feet
 *   where they stood, which leaves both knees standing up above the lying body);
 * - the arms are driven by hand targets and settle along the sides of the trunk (the preset
 *   throws them 8 units past the head, out of the cell in S);
 * - the trunk lands exactly flat (pitch -90) at the height where the tunic rests on the floor,
 *   with the pelvis shifted back so the head and the skirt reach about the same distance from the
 *   pivot in S and N;
 * - the sword follows the flung arm through `extra.weaponYaw` / `weaponPitch`, then the skin lays
 *   it on the floor.
 * The skin reads the trunk's pitch to drape the tabard, lay the sword and shield down and turn the
 * skull to the camera.
 */

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpL = (a: Local, b: Local, t: number): Local => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export interface HumanoidDeathOptions {
  /** Seconds of the whole clip. */
  seconds?: number;
  /** Where the pelvis ends along the facing, in units (negative = behind the standing spot). */
  pelvisX?: number;
  /** Height of the trunk's line above the floor once down. */
  restZ?: number;
}

export function humanoidDeath(skeleton: SkeletonSpec, options: HumanoidDeathOptions = {}): Clip {
  const k = skeleton.height / 80;
  const seconds = options.seconds ?? 0.9;
  const first = skeleton.trunk[0].at;
  const last = skeleton.trunk[skeleton.trunk.length - 1].at;
  const pivotZ = (first[2] + last[2]) / 2;
  const LAND = 0.68;
  const PITCH = -90;
  // The pelvis ends where the toppled trunk puts it (its height under the pivot), plus a shift.
  const pelvisFinalX = options.pelvisX ?? -17 * k;
  const topple = pivotZ - first[2]; // after a -90 pitch the pelvis is this far behind the pivot
  const dxFinal = pelvisFinalX + topple;
  const dzFinal = (options.restZ ?? 6.6 * k) - pivotZ;
  const rest = restFeet(skeleton);
  // Rest hands, solved once from the idle arms: the starting point of the arm targets.
  const idleDrive: Drive = { arms: { armL: { swing: 0.05, flex: 0.18 }, armR: { swing: 0.05, flex: 0.18 } } };
  const rp = solvePose(skeleton, Frame3.facing(vec3(0, 0, 0), 0), idleDrive);
  const restHand = (name: string): Local => [rp.joints[`${name}.hand`].x, rp.joints[`${name}.hand`].y, rp.joints[`${name}.hand`].z];
  const hands: Record<string, { rest: Local; flung: Local; down: Local; elbowRest: Local; elbowDown: Local }> = {};
  for (const arm of skeleton.arms ?? []) {
    const s = arm.side;
    hands[arm.name] = {
      rest: restHand(arm.name),
      // Thrown up and out as the body goes over.
      flung: [8 * k, s * 19 * k, 26 * k],
      // Lying along the side of the trunk, palms down.
      down: [pelvisFinalX + (s > 0 ? 2 : 4) * k, s * 16.5 * k, 1.8 * k],
      elbowRest: [0, s * 0.7, -1],
      elbowDown: [0, s * 1, 0.25],
    };
  }
  return defineClip({
    name: 'death',
    kind: 'death',
    seconds,
    events: [{ t: LAND, name: EVENTS.land }],
    drive(t: number): Drive {
      const buckle = smooth(clamp01(t / 0.3));
      const fall = easeInCubic(clamp01((t - 0.12) / (LAND - 0.12)));
      const rebound = t > LAND ? 0.04 * bell(clamp01((t - LAND) / 0.25)) : 0;
      const down = clamp01(0.25 * buckle + 0.75 * fall - rebound);
      const pitch = PITCH * fall;
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
        const side = Math.sign(r[1]);
        feet[leg.name] = lerpL(r, [pelvisFinalX - 0.5 * k, side * 6.4 * k, 1.3 * k], w);
      }
      // Arms: thrown up as the body goes over, then dropped along the sides.
      const throwUp = smooth(clamp01((t - 0.08) / 0.2)) * (1 - smooth(clamp01((t - 0.3) / (LAND - 0.3))));
      const settle = smooth(clamp01((t - 0.3) / (LAND + 0.05 - 0.3)));
      const arms: Record<string, ArmDrive> = {};
      for (const arm of skeleton.arms ?? []) {
        const h = hands[arm.name];
        const base = lerpL(h.rest, h.down, settle);
        arms[arm.name] = { target: lerpL(base, h.flung, throwUp), elbow: lerpL(h.elbowRest, h.elbowDown, settle) };
      }
      // The sword goes with the flung arm (the skin's `weaponYaw` / `weaponPitch`), then the hands let
      // go as the arms drop (`weaponRelease`) and what they held settles on the floor beside the arm.
      const weaponYaw = track(t, [[0, 0.5], [0.08, 0.5], [0.3, 1.05], [0.5, 0.6], [1, 0.6]]);
      const weaponPitch = track(t, [[0, -0.875], [0.08, -0.875], [0.3, 0.55], [0.5, -0.5], [1, -0.5]]);
      return {
        root: [dx * Math.cos(a) - dz * Math.sin(a), 0, dx * Math.sin(a) + dz * Math.cos(a)],
        pitch,
        feet,
        arms,
        extra: { weaponYaw, weaponPitch, weaponRelease: settle, offWeaponRelease: settle },
      };
    },
  });
}
