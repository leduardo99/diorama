/**
 * Shields: the round shield strapped to a forearm.
 */

import { Polygon } from '@core/draw';
import { bodyFrames, palmGrip, resolveHold, type Grip, type Hold, type Part, type Pose, type SkeletonSpec } from '@core/rig';
import { Decal, Frame3, Round, Tube, UP, add3, cross3, dot3, lerp3, norm3, scale3, sub3, type Vec3 } from '@core/volume';
import { PALETTES } from '../theme';
import { role, tones } from './util';

/** Default radius of the round shield. */
export const SHIELD_RADIUS = 6.6;

/**
 * Where a round shield sits on the forearm of `side` (-1 left, 1 right): its frame (x along the
 * forearm, z the outward face), the outward normal and the centre. Strapped on the outside of the
 * forearm and turned a little forward; a body that lies down lets it rest on the arm face up
 * instead of standing on its edge in the floor.
 *
 * The part draws from this and the character's `shield` socket reads `.center` of the same call,
 * so the drawing and the socket agree.
 */
export function shieldDisc(pose: Pose, skeleton: SkeletonSpec, side: -1 | 1 = -1): { frame: Frame3; n: Vec3; center: Vec3 } {
  const { right: across, forward: chestFwd, lie } = bodyFrames(pose, skeleton);
  const arm = (skeleton.arms ?? []).find(a => a.side === side);
  if (!arm) throw new Error(`gear: skeleton "${skeleton.name}" has no ${side < 0 ? 'left' : 'right'} arm for a shield`);
  const [, el, ha] = pose.chains[arm.name];
  const d = norm3(sub3(ha, el));
  const out0 = add3(scale3(across, side * (0.85 - 0.4 * lie)), add3(scale3(chestFwd, 0.5 * (1 - lie)), scale3(UP, 0.9 * lie)));
  const n = norm3(sub3(out0, scale3(d, dot3(out0, d))));
  const center = add3(lerp3(el, ha, 0.55), scale3(n, 1.3));
  return { frame: new Frame3(center, d, norm3(cross3(n, d)), n), n, center };
}

/** How the round shield is held: a strapped shield, the forearm through its straps and the hand on the grip behind the board. */
export const SHIELD_HOLD: Hold = { kind: 'strapped-shield' };

/**
 * Where the hand of `side` closes on the round shield (the shield's `wield.grip`): the grip behind the
 * board, wherever the hand is, running across the forearm in the board's plane. `behind` is the board's
 * outward normal, so the fist is hidden by the board while its face is towards the camera.
 */
export function shieldGrip(pose: Pose, skeleton: SkeletonSpec, side: -1 | 1 = -1): Grip {
  const arm = (skeleton.arms ?? []).find(a => a.side === side);
  if (!arm) throw new Error(`gear: skeleton "${skeleton.name}" has no ${side < 0 ? 'left' : 'right'} arm for a shield`);
  const { frame, n } = shieldDisc(pose, skeleton, side);
  const hold = resolveHold(SHIELD_HOLD, skeleton);
  return palmGrip(pose, skeleton, arm.name, { axis: scale3(frame.right, side), radius: hold.handle.radius, angle: hold.angle, behind: n });
}

/** Options of `roundShield`. */
export interface RoundShieldOptions {
  /** Radius of the disc. Default 6.6. */
  radius?: number;
  /** Iron boss at the centre. Default true. */
  boss?: boolean;
  /** Iron rim around the edge. Default true. */
  rim?: boolean;
  /** Painted band across the face. Default true. */
  band?: boolean;
  /** Plank seams on the face. Default true. */
  planks?: boolean;
}

/**
 * A round shield: a wooden disc with plank seams, an iron rim and boss, and a painted band. The
 * face is drawn only while it turns towards the camera, and then over the arm (`on` the arm piece
 * when the outfit gives it as the host); seen from the back it is just the disc, sorted by depth.
 * Slot: `forearm` (side -1 left, 1 right). Roles: `wood` (disc), `metal` (rim, boss),
 * `clothAccent` (band), `woodSeam` (plank seams; optional, the theme's `woodDark` when the outfit sets none).
 */
export const roundShield: Part<RoundShieldOptions> = (ctx, options) => {
  const { object: o, pose, kit, at, materials, host } = ctx;
  const { radius = SHIELD_RADIUS, boss = true, rim = true, band = true, planks = true } = options;
  const cam = kit.camera;
  const { frame: sf, n } = shieldDisc(pose, kit.skeleton, at.side === 0 ? -1 : at.side);
  const k = radius / SHIELD_RADIUS;
  const disc = Round.cylinder(sf, radius, 1.1);
  // Strapped on the outside of the forearm: over the arm when its face is towards the camera.
  const outside = cam.faces(n);
  o.add(disc, role(materials, 'wood'), outside && host ? { on: host } : {});
  if (outside) {
    const face = sf.moved(0, 0, 1.12);
    const onFace = (shape: Polygon) => new Decal(face.origin, face.forward, face.right, shape, n);
    const seam = materials.woodSeam ? tones(materials, 'woodSeam').base : PALETTES.woodDark;
    if (planks) for (const y of [-2.3 * k, 2.3 * k]) o.add(onFace(Polygon.rect(12.4 * k, 0.35, { cy: y })), { fill: seam }, { on: disc });
    if (band) o.add(onFace(Polygon.rect(12.6 * k, 3, { rotation: 35 })), { fill: tones(materials, 'clothAccent').base }, { on: disc });
    const metal = role(materials, 'metal');
    let rimTube: Tube | undefined;
    if (rim) {
      const rimPts = Array.from({ length: 25 }, (_, i) => face.at(Math.cos((i / 24) * Math.PI * 2) * 6.2 * k, Math.sin((i / 24) * Math.PI * 2) * 6.2 * k, 0));
      rimTube = new Tube(rimPts, 1.1);
      o.add(rimTube, metal, { on: disc });
    }
    if (boss) o.add(Round.ellipsoid(new Frame3(face.origin, face.forward, face.right, n), 2 * k, 2 * k, 1.3), metal, { on: rimTube ?? disc });
  }
  return disc;
};
