/**
 * @core/rig - Gear: dressing a pose with reusable parts
 *
 * The mechanics every armor, weapon and garment needs, whatever the art style:
 * - `bodyFrames`: frames of the trunk built from the solved pose (not from world up), so gear
 *   follows the body when it twists, pitches in a hit or lies down in a death;
 * - `slotFrame`: where a part sits (head, chest, pelvis, shoulders, forearms, hands, shins,
 *   back), as a right-handed frame plus the side (-1 left, 1 right) for mirrored parts;
 * - `held`: a weapon's grip and direction from the hand and the clip's `weaponYaw` / `weaponPitch`;
 *   with a `hold` (see `./grip.ts`), its grip sits in the palm of the hand, not at the wrist;
 * - grips (`Grip`): where each hand closes on what it holds, handed to the hand's parts
 *   (`PartContext.grip`), and the other hand moved onto a two-handed item's second grip;
 * - materials by role (`metal`, `cloth`, `bone`, ...), so one helm can be iron on one character
 *   and bronze on another;
 * - `outfit`: a skin assembled from a list of parts, the data-driven way to make variants;
 * - `slotsOf`: the slots a skeleton has, so editors offer only those.
 * The parts themselves (the shape of a helm, a pauldron, a scythe) are the project's art and live
 * in its kit; see guide 05.
 */

import { Frame3 } from '../volume/frame.js';
import type { StageObject } from '../volume/stage.js';
import type { Placed, VolumeStyle } from '../volume/volume.js';
import { add3, cross3, dot3, len3, lerp3, norm3, scale3, sub3, vec3, type Vec3 } from '../volume/vec3.js';
import type { CharacterClip, Skin, SkinKit } from './character.js';
import type { Camera } from '../volume/camera.js';
import { HAND, handSize, heldGrip, palmFrame, resolveHold, restAxis, secondHand, type Grip, type Hold, type Palm, type ResolvedHold, type SecondHand } from './grip.js';
import { partFrame, type Pose } from './pose.js';
import type { SkeletonSpec } from './skeleton.js';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Frames of the body for one pose, all built from the joints so they follow pitch, twist and lying down. */
export interface BodyFrames {
  /** Trunk axis: pelvis → chest for an upright body. */
  up: Vec3;
  /** Where the chest faces (it twists with the shoulders in attacks). */
  forward: Vec3;
  /** The chest's right (shoulder line, left → right). */
  right: Vec3;
  /** The hips' forward and right (they do not twist with the shoulders). */
  hipForward: Vec3;
  hipRight: Vec3;
  /** 0 standing, 1 lying flat (a death): gear that hangs (capes, scabbards, tabards) drapes by it. */
  lie: number;
}

const square = (v: Vec3, up: Vec3) => {
  const s = sub3(v, scale3(up, dot3(v, up)));
  return len3(s) > 1e-6 ? norm3(s) : s;
};

/**
 * The chest joint of a skeleton: the trunk joint the arms hang from, or, without arms, the last
 * trunk joint before the head. (A humanoid's trunk goes on to a neck; the chest is where the
 * shoulders are.)
 */
export function chestJoint(skeleton: SkeletonSpec): string {
  const shoulder = skeleton.arms?.[0]?.shoulder;
  if (shoulder && skeleton.trunk.some(t => t.name === shoulder)) return shoulder;
  return skeleton.trunk.filter(t => t.name !== skeleton.head).at(-1)!.name;
}

/**
 * Pitch-safe frames of a body. Bipeds (two legs or fewer): the trunk axis (first trunk joint →
 * chest joint) is up and the chest faces where the shoulders point. Creatures with more legs: the
 * trunk axis (rump → chest) is forward and up is perpendicular to it.
 */
export function bodyFrames(pose: Pose, skeleton: SkeletonSpec): BodyFrames {
  const j = pose.joints;
  const f = pose.frame;
  const first = j[skeleton.trunk[0].name];
  const last = j[chestJoint(skeleton)];
  const axis = len3(sub3(last, first)) > 1e-6 ? norm3(sub3(last, first)) : f.up;
  if (skeleton.legs.length <= 2) {
    const up = axis;
    const arms = skeleton.arms ?? [];
    const l = arms.find(a => a.side < 0);
    const r = arms.find(a => a.side > 0);
    const across = l && r ? square(sub3(j[`${r.name}.shoulder`], j[`${l.name}.shoulder`]), up) : square(f.right, up);
    const right = len3(across) > 1e-6 ? across : square(f.right, up);
    const hipRight = square(f.right, up);
    return {
      up,
      forward: norm3(cross3(right, up)),
      right,
      hipForward: norm3(cross3(hipRight, up)),
      hipRight,
      lie: clamp01((0.78 - up.z) / 0.5),
    };
  }
  const forward = axis;
  const right = square(f.right, forward);
  const up = norm3(cross3(forward, right));
  return { up, forward, right, hipForward: forward, hipRight: right, lie: clamp01((0.6 - up.z) / 0.5) };
}

/** Where a part sits. Paired slots take a side. */
export type Slot = 'head' | 'chest' | 'pelvis' | 'back' | 'shoulder' | 'upperArm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot';

/** Slots that come in pairs (one per side); the others are central. */
export const isPairedSlot = (slot: Slot): boolean => slot !== 'head' && slot !== 'chest' && slot !== 'pelvis' && slot !== 'back';

/**
 * The slots a skeleton has, with their sides: head, chest, back and pelvis (side 0), then shoulder,
 * upper arm, forearm and hand for each arm, and thigh, shin and foot for each side with a leg. A wolf
 * or a spider has no arm slots. `slotFrame` throws for a slot that is not listed.
 */
export function slotsOf(skeleton: SkeletonSpec): { slot: Slot; side: -1 | 0 | 1 }[] {
  const out: { slot: Slot; side: -1 | 0 | 1 }[] = (['head', 'chest', 'back', 'pelvis'] as const).map(slot => ({ slot, side: 0 as const }));
  const armSides = ([-1, 1] as const).filter(side => (skeleton.arms ?? []).some(a => a.side === side));
  for (const slot of ['shoulder', 'upperArm', 'forearm', 'hand'] as const) for (const side of armSides) out.push({ slot, side });
  let legSides = ([-1, 1] as const).filter(side => skeleton.legs.some(l => Math.sign(l.offset[1]) === side));
  if (!legSides.length && skeleton.legs.length) legSides = [1];
  for (const slot of ['thigh', 'shin', 'foot'] as const) for (const side of legSides) out.push({ slot, side });
  return out;
}

/** A slot's frame and side: build the part in `frame`, multiplying side offsets by `side` for mirrored parts. */
export interface SlotFrame {
  frame: Frame3;
  /** -1 left, 1 right, 0 for central slots. */
  side: -1 | 0 | 1;
  /** Bone length of a limb slot (upper arm, forearm, thigh, shin), 0 otherwise. */
  length: number;
}

/**
 * The frame of a slot for one pose. Frames are right-handed (forward, right, up), so mirrored
 * parts read `side` instead of flipping an axis (a flipped frame would turn faces inside out).
 * - head, chest, pelvis, back: origin on the joint (chest: `chestJoint`); forward, right and up of
 *   the chest (pelvis: of the hips; back: the chest moved behind the spine).
 * - shoulder: origin on the shoulder joint, chest axes.
 * - upperArm, forearm, thigh, shin: origin at the bone's start, forward along the bone, up towards
 *   the body's forward.
 * - hand, foot: origin on the joint, forward along the forearm or the foot.
 */
export function slotFrame(pose: Pose, skeleton: SkeletonSpec, slot: Slot, side: -1 | 1 = 1, body = bodyFrames(pose, skeleton)): SlotFrame {
  const j = pose.joints;
  const frame = (origin: Vec3, forward = body.forward, right = body.right, up = body.up) => new Frame3(origin, forward, right, up);
  const arm = (skeleton.arms ?? []).find(a => a.side === side);
  const leg = skeleton.legs.find(l => Math.sign(l.offset[1]) === side) ?? skeleton.legs[0];
  const bone = (a: Vec3, b: Vec3, hint: Vec3): SlotFrame => ({ frame: partFrame(a, sub3(b, a), hint), side, length: len3(sub3(b, a)) });
  switch (slot) {
    case 'head':
      return { frame: frame(j[skeleton.head]), side: 0, length: 0 };
    case 'chest':
      return { frame: frame(j[chestJoint(skeleton)]), side: 0, length: 0 };
    case 'pelvis':
      return { frame: frame(j[skeleton.trunk[0].name], body.hipForward, body.hipRight), side: 0, length: 0 };
    case 'back':
      return { frame: frame(add3(j[chestJoint(skeleton)], scale3(body.forward, -0.06 * skeleton.height))), side: 0, length: 0 };
    case 'shoulder':
      if (!arm) throw new Error(`skeleton "${skeleton.name}" has no ${side < 0 ? 'left' : 'right'} arm for slot "shoulder"`);
      return { frame: frame(j[`${arm.name}.shoulder`]), side, length: 0 };
    case 'upperArm':
    case 'forearm':
    case 'hand': {
      if (!arm) throw new Error(`skeleton "${skeleton.name}" has no ${side < 0 ? 'left' : 'right'} arm for slot "${slot}"`);
      const [sh, el, ha] = pose.chains[arm.name];
      if (slot === 'upperArm') return bone(sh, el, body.forward);
      if (slot === 'forearm') return bone(el, ha, body.forward);
      return { frame: partFrame(ha, sub3(ha, el), body.up), side, length: 0 };
    }
    case 'thigh':
    case 'shin':
    case 'foot': {
      const c = pose.chains[leg.name];
      if (slot === 'thigh') return bone(c[0], c[1], body.hipForward);
      if (slot === 'shin') return bone(c[1], c[2], body.hipForward);
      const toe = c.length > 3 ? sub3(c[3], c[2]) : body.hipForward;
      return { frame: partFrame(j[`${leg.name}.foot`], len3(toe) > 1e-6 ? toe : body.hipForward, vec3(0, 0, 1)), side, length: 0 };
    }
  }
}

/** Options of `held`. */
export interface HeldOptions {
  /**
   * Default direction in the creature's frame when the clip sets no weapon angle. Default [0.55, 0.3, -0.75] (low and forward).
   * With a `hold`, the item turns from it, as little as it must, until the wrist holds it comfortably (`restAxis`).
   */
  rest?: [number, number, number];
  /**
   * The clip channels it reads: `extra.<channel>Yaw` and `<channel>Pitch`. Default 'weapon', the main
   * (right) hand's. An item in the off hand reads 'offWeapon' (`weaponChannel(side)`), so it keeps its
   * rest unless a clip made for two weapons swings it.
   */
  channel?: string;
  /** Length from the grip to the tip, for the floor clamp and the tip socket. */
  length: number;
  /** Lowest height the tip may reach (the floor plus a margin). Default 1. */
  floor?: number;
  /**
   * Length behind the grip, for items that extend on both sides of the hand (a staff, a scythe's
   * snath, a spear's butt). It shortens when it would go below `floor`, so the end touches the
   * floor instead of sinking. Default 0.
   */
  butt?: number;
  /**
   * How the hand holds it (`Hold`: its kind, its handle and where on the handle the hands close).
   * With it the grip is in the palm of the hand (`palmFrame`), not at the wrist: the item is placed so
   * the point of its handle at `hold.grip` is the middle of the fist, and the part draws its handle
   * round `grip` (from `handle.from` to `handle.to`). Give the same call as the part's
   * `PartInfo.wield.held`, so its hands close on it. Without it the grip is the wrist joint, as
   * before holds existed.
   */
  hold?: Hold;
}

/** A held item's grip, direction and ends. */
export interface Held {
  /** Where the hand holds it: the middle of the fist with a `hold`, the wrist joint without. */
  grip: Vec3;
  dir: Vec3;
  tip: Vec3;
  /** The end behind the grip (the grip itself when `butt` is 0). */
  butt: Vec3;
  /**
   * Frame along the item (forward = dir). Its roll is stable: up leans towards the creature's up,
   * or towards its forward when the item is nearly vertical. A blade that must face a given way
   * (a scythe, an axe) reads its own heading from the clip, by convention `extra.bladeAim`
   * (radians in the creature's frame, 0 = forward).
   */
  frame: Frame3;
  /** With a `hold`: the hold as resolved for the skeleton (every default filled in, lengths in world units). */
  hold?: ResolvedHold;
  /** With a `hold`: the holding hand's palm frame, whose origin is `grip`. */
  palm?: Palm;
  /** With a `hold`: the ends of the handle on the item's axis, its butt end (fraction 0) and its head or guard end (1). */
  handle?: { from: Vec3; to: Vec3 };
  /** With a `hold` that has a second grip: where the other hand may close, from one end of its range to the other (one point for a fixed grip). */
  second?: { from: Vec3; to: Vec3 };
  /**
   * With a `hold`, when the clip lets go (`extra.<channel>Release`): how far the hand has let go of the item, 0..1.
   * The item leaves the palm and settles on the floor; the hand's fingers open (`heldGrip`). Absent while held.
   */
  released?: number;
}

/** The clip channel of an item held on `side`: 'weapon' for the main (right) hand, 'offWeapon' for the left. */
export const weaponChannel = (side: number): string => (side < 0 ? 'offWeapon' : 'weapon');

/**
 * Grip and direction of an item held in a hand, read from the clip's `extra.weaponYaw` and
 * `extra.weaponPitch` (radians, in the creature's frame; `offWeaponYaw` / `offWeaponPitch` with
 * `channel: 'offWeapon'`) or the `rest` direction. When the body
 * lies down an item without a `hold` settles along the floor beside the arm; one with a `hold` stays
 * in the hand until the clip lets it go (`extra.weaponRelease`, 0 held → 1 let go, `offWeaponRelease`
 * for the off hand), as the `death` preset does. The tip never goes below `floor`.
 * With `hold` the grip is the palm centroid of the hand (see `HeldOptions.hold`), and the result
 * carries the resolved hold, the palm frame, the handle's ends and the second grip's range.
 * Use the same call in the skin, in the character's sockets and in the part's `PartInfo.wield.held`,
 * so the drawing, the sockets and the hands agree.
 */
export function held(pose: Pose, skeleton: SkeletonSpec, hand: string, o: HeldOptions): Held {
  const f = pose.frame;
  const wrist = pose.joints[`${hand}.hand`];
  const channel = o.channel ?? 'weapon';
  const yaw = pose.extra[`${channel}Yaw`];
  const r = o.rest ?? [0.55, 0.3, -0.75];
  const hold = o.hold ? resolveHold(o.hold, skeleton) : undefined;
  let dir: Vec3;
  if (yaw === undefined) {
    dir = norm3(f.dir(r[0], r[1], r[2]));
    // With a hold, the engine chose this direction, not a clip: the hand turns the item to where it holds it comfortably.
    if (hold) dir = restAxis(pose, skeleton, hand, dir, hold);
  } else {
    const pitch = pose.extra[`${channel}Pitch`] ?? 0;
    dir = norm3(f.dir(Math.cos(yaw) * Math.cos(pitch), Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch)));
  }
  const body = bodyFrames(pose, skeleton);
  // Lying down, the item settles along the floor beside the arm, ahead of the body. A held item (a hold) does so only
  // when the clip lets it go, below; until then it stays where the hand turns it, lying or not.
  const ahead = Math.hypot(body.up.x, body.up.y) > 1e-3 ? norm3(vec3(body.up.x, body.up.y, 0)) : f.forward;
  const beside = norm3(add3(ahead, scale3(f.right, 0.3)));
  if (body.lie > 0 && !hold) {
    const k = body.lie * body.lie * (3 - 2 * body.lie);
    dir = norm3(lerp3(dir, beside, k));
  }
  const floor = o.floor ?? 1;
  const liftOffFloor = (from: Vec3, lowest = floor) => {
    if (from.z + dir.z * o.length >= lowest) return false;
    const z = Math.max(-1, Math.min(1, (lowest - from.z) / o.length));
    const h = Math.hypot(dir.x, dir.y) || 1;
    const s = Math.sqrt(1 - z * z) / h;
    dir = vec3(dir.x * s, dir.y * s, z);
    return true;
  };
  let grip = wrist;
  let palm: Palm | undefined;
  let released = 0;
  if (!hold) liftOffFloor(grip);
  else {
    // The palm turns with the handle, and the handle may tip up off the floor from where the palm is: twice settles it.
    // A fist lying on the floor keeps the handle its radius and the fingers round it above the floor.
    const arm = (skeleton.arms ?? []).find(a => a.name === hand);
    const lowest = arm ? hold.handle.radius + HAND.wrap * handSize(skeleton, arm).length : undefined;
    const palmFor = () => palmFrame(pose, skeleton, hand, { axis: hold.reverse ? scale3(dir, -1) : dir, angle: hold.angle, lowest });
    palm = palmFor();
    for (let k = 0; k < 2 && liftOffFloor(palm.at); k++) palm = palmFor();
    grip = palm.at;
    // The clip lets go (a death): the item leaves the palm and settles on the floor below it, beside the arm.
    released = Math.max(0, Math.min(1, pose.extra[`${channel}Release`] ?? 0));
    if (released > 0) {
      dir = norm3(lerp3(dir, vec3(beside.x, beside.y, 0), released));
      grip = lerp3(grip, vec3(grip.x, grip.y, hold.handle.radius), released);
      // On the way down the tip stays above the floor; once let go the item lies on it, its handle its radius above.
      liftOffFloor(grip, floor + (Math.min(floor, hold.handle.radius) - floor) * released);
    }
  }
  const buttLength = o.butt ? (dir.z > 0.02 ? Math.min(o.butt, Math.max(0, (grip.z - floor) / dir.z)) : o.butt) : 0;
  const hint = Math.abs(dir.z) > 0.9 ? f.forward : f.up;
  const out: Held = { grip, dir, tip: add3(grip, scale3(dir, o.length)), butt: sub3(grip, scale3(dir, buttLength)), frame: partFrame(grip, dir, hint) };
  if (!hold || !palm) return out;
  const along = (fraction: number) => add3(grip, scale3(dir, (fraction - hold.grip) * hold.handle.length));
  out.hold = hold;
  out.palm = palm;
  if (released > 0) out.released = released;
  out.handle = { from: along(0), to: along(1) };
  if (hold.second) out.second = { from: along(hold.second[0]), to: along(hold.second[1]) };
  return out;
}

/**
 * Materials by role. Parts ask for a role (`metal`, `cloth`, `bone`, ...) and the outfit (or the
 * skin) decides which theme material plays it, so one helm is iron on a guard and bronze on a
 * captain. Common roles: metal, metalAccent, cloth, clothAccent, leather, wood, bone, hollow,
 * glow, fur. Any other name works.
 */
export type MaterialSet = Record<string, VolumeStyle>;

/** Everything a part receives. */
export interface PartContext {
  object: StageObject;
  pose: Pose;
  kit: SkinKit;
  body: BodyFrames;
  /** The slot's frame, side and bone length. */
  at: SlotFrame;
  materials: MaterialSet;
  /** The placed volume of the part this one rests on (`on`), if any. */
  host?: Placed;
  /**
   * For a part in a hand slot whose hand holds something: where the hand closes on it (the held
   * part's `wield.held` or `wield.grip`; for the other hand of a two-handed item, its second grip),
   * so a hand part draws a fist round the handle, curled by `grip.curl`. Undefined for an empty
   * hand, which stays as it is.
   */
  grip?: Grip;
}

/**
 * A reusable piece of gear: it adds its volumes to the object and returns the main one, so
 * other parts can rest `on` it. `O` are the part's own options (size, lames, length...).
 */
export type Part<O = Record<string, unknown>> = (ctx: PartContext, options: O) => Placed | void;

/** One part of an outfit. */
export interface OutfitPiece {
  part: Part<any>;
  slot: Slot;
  /** For paired slots: -1 left, 1 right. Default 1. */
  side?: -1 | 1;
  options?: Record<string, unknown>;
  /** Overrides of the outfit's materials for this piece (a gilded pauldron on an iron suit). */
  materials?: MaterialSet;
  /** Name for other pieces to rest on. */
  id?: string;
  /** The `id` of an earlier piece this one rests on: it receives that piece's volume as `host`. */
  on?: string;
  /** Placed for other pieces to rest on, but not drawn (an item icon's helm without its skull). */
  hidden?: boolean;
}

/**
 * Something an outfit holds in a hand, so the hands close on it (`PartContext.grip`) and, for an item
 * held in both, the other hand reaches its second grip. `outfitFromData` makes them from the catalog
 * (`outfitHolds`); a code outfit lists them in `OutfitSpec.holds`.
 */
export interface OutfitHold {
  /** The hand that holds it: -1 left, 1 right. */
  side: -1 | 1;
  /** Hands it takes: 2 puts the other hand on its second grip (`secondHand`). Default 1. */
  hands?: 1 | 2;
  /** Where it is in a pose: the part's own `held` call, with its `hold`. */
  held?: (pose: Pose, skeleton: SkeletonSpec) => Held;
  /**
   * Where the hands close on it, when `held` cannot say (a shield strapped to the forearm, whose strap
   * is wherever the hand is: `palmGrip`): the holding hand's grip, then the other hand's for an item
   * held in both. It overrides what `held` gives the hands.
   */
  grip?: (pose: Pose, skeleton: SkeletonSpec) => (Grip | undefined)[];
}

/** What an outfit's holds make of one pose (`holdPose`). */
export interface HoldPose {
  /** The pose, with the other arm on the second grip of an item held in both hands (the pose given when nothing moved). */
  pose: Pose;
  /** Where each hand that holds something closes on it. */
  grips: { side: -1 | 1; grip: Grip }[];
  /** What the second hand of each two-handed item did: where it closes, how far it slid, whether it let go. */
  second: SecondHand[];
}

/**
 * The hands of a pose on what an outfit holds: each holding hand's grip (from the hold's `grip`, else
 * its `held` with a `hold`) and, for an item held in both hands, the other arm moved onto its second
 * grip (`secondHand`). The outfit skin draws with it; `defineCharacter` measures the sockets on the
 * same pose, so a socket on the other hand follows it.
 */
export function holdPose(pose: Pose, skeleton: SkeletonSpec, holds: readonly OutfitHold[]): HoldPose {
  let out = pose;
  const grips = new Map<-1 | 1, Grip>();
  const second: SecondHand[] = [];
  for (const h of holds) {
    const item = h.held?.(out, skeleton);
    const given = h.grip?.(out, skeleton);
    const main = given?.[0] ?? (item ? heldGrip(item) : undefined);
    if (main) grips.set(h.side, main);
    if ((h.hands ?? 1) !== 2) continue;
    const moved = item ? secondHand(out, skeleton, item, h.side) : undefined;
    if (moved) {
      out = moved.pose;
      second.push(moved);
    }
    const other = given?.[1] ?? moved?.grip;
    if (other) grips.set(h.side === 1 ? -1 : 1, other);
  }
  return { pose: out, grips: [...grips].map(([side, grip]) => ({ side, grip })), second };
}

/** Holds that move an arm (an item in both hands placed by `held`): the pose then changes, and what reads it must read the moved one. */
export const holdsMoveArms = (holds: readonly OutfitHold[]): boolean => holds.some(h => (h.hands ?? 1) === 2 && h.held !== undefined);

/** A skin assembled from parts: an optional base skin (the body), then the pieces in order. */
export interface OutfitSpec {
  /** The body under the gear. It receives the outfit's materials as a fourth argument (a plain `Skin` works too). */
  base?: (object: StageObject, pose: Pose, kit: SkinKit, materials: MaterialSet) => void;
  materials: MaterialSet;
  pieces: OutfitPiece[];
  /**
   * What the outfit holds, so the pieces in a holding hand's slot receive its grip (`PartContext.grip`)
   * and an item held in both hands brings the other hand to its second grip. Without it no hand
   * receives a grip and the pose is drawn as solved.
   */
  holds?: OutfitHold[];
}

/**
 * Assembles a skin from parts, the data-driven way to dress characters and make variants: swap a
 * piece, change a side, give a piece other materials. Pieces are drawn in order after the base;
 * `on` hands a piece the volume of an earlier one. With `holds`, the pieces in a hand slot receive
 * where that hand closes on what it holds, and an item held in both hands moves the other arm onto
 * its second grip before anything is drawn (the base, every piece and `kit.poseAt` see that pose).
 */
export function outfit(spec: OutfitSpec): Skin {
  const holds = spec.holds?.length ? spec.holds : undefined;
  const moves = holds ? holdsMoveArms(holds) : false;
  return (object, solved, solvedKit) => {
    const state = holds ? holdPose(solved, solvedKit.skeleton, holds) : undefined;
    const pose = state?.pose ?? solved;
    const kit: SkinKit = moves ? { ...solvedKit, poseAt: t => holdPose(solvedKit.poseAt(t), solvedKit.skeleton, holds!).pose } : solvedKit;
    spec.base?.(object, pose, kit, spec.materials);
    const body = bodyFrames(pose, kit.skeleton);
    const placed = new Map<string, Placed>();
    for (const piece of spec.pieces) {
      const host = piece.on ? placed.get(piece.on) : undefined;
      if (piece.on && !host) throw new Error(`outfit: piece "${piece.id ?? piece.slot}" rests on "${piece.on}", which was not placed before it`);
      const side = piece.side ?? 1;
      const at = slotFrame(pose, kit.skeleton, piece.slot, side, body);
      const grip = piece.slot === 'hand' ? state?.grips.find(g => g.side === side)?.grip : undefined;
      const ctx: PartContext = { object, pose, kit, body, at, materials: { ...spec.materials, ...piece.materials }, host, ...(grip ? { grip } : {}) };
      const place = () => piece.part(ctx, piece.options ?? {});
      const result = piece.hidden ? object.hidden(place) : place();
      if (piece.id && result) placed.set(piece.id, result);
    }
  };
}

/** One adjustable option of a part, for editors (the viewer's customizer). */
export type PartOption =
  | { key: string; label: string; type: 'number'; default: number; min: number; max: number; step?: number }
  | { key: string; label: string; type: 'boolean'; default: boolean }
  | { key: string; label: string; type: 'select'; default: string; choices: { value: string; label: string }[] };

/** A part as an editor sees it: what it is, where it goes, what can be tuned. */
export interface PartInfo {
  /** Stable id used in saved outfits (e.g. 'horned-helm'). */
  id: string;
  label: string;
  /** Grouping for pickers: 'head', 'shoulders', 'torso', 'garments', 'weapons', 'shields', 'effects'... */
  group: string;
  part: Part<any>;
  /** Slots the part fits. Paired slots (shoulder, forearm, hand, shin...) take a side. */
  slots: Slot[];
  /** Material roles the part reads (so editors offer a material per role). */
  roles: string[];
  options?: PartOption[];
  /** The part (or parts) this one must rest on, when it is an add-on: a crest on a helm, a smear on any sword. */
  requires?: string | string[];
  /**
   * What it is: `gear` (default), `body` (part of the creature under the gear: bone limbs, a rib cage;
   * editors fold it away and item lists skip it) or `effect` (a flourish played by clips: smears,
   * shockwaves). Without it, the groups 'bodies' and 'effects' count as body and effect.
   */
  kind?: PartKind;
  /**
   * The equipment slot it takes alone ('helm', 'weapon', 'shield', 'pauldron'...): equipping another
   * part with the same `equip` on the same side replaces it, the way a game's equipment screen works.
   * Parts without one are layers that stack (a tunic under a tabard, a pouch at a belt).
   */
  equip?: string;
  /** How it is held, for weapons, shields, staves, lanterns in a hand or on a forearm (see `WieldInfo`). */
  wield?: WieldInfo;
}

/**
 * How a part is held. A hand (its hand and forearm slots) holds one wielded part; a two-handed one
 * leaves the other hand empty. Clips say which classes they are made for (`CharacterClip.wields`),
 * so a character's attacks match what it holds (`checkWield`).
 */
export interface WieldInfo {
  /** The class clips are made for: 'blade', 'polearm', 'staff', 'bow', 'shield', or the project's own. */
  class: string;
  /** Hands it takes: 2 leaves nothing else in the other hand. Default 1. */
  hands?: 1 | 2;
  /**
   * In the off (left) hand: 'hold' when it may simply be held (a shield, a lantern, a torch), 'swing'
   * when it only makes sense in clips made to swing it (a second sword). Default 'swing'.
   */
  offHand?: 'hold' | 'swing';
  /**
   * Points on the item for events and effects (its tip, a muzzle), from the pose, the piece's side
   * and options; the same `held` call the part draws with. A character wearing it gets them as
   * sockets (`off-<name>` in the off hand), so they follow the weapon it holds.
   */
  sockets?: Record<string, WieldSocket>;
  /**
   * How the hands hold it: its hold kind, its handle (length, radius) and where on the handle the
   * hands close (`Hold`), for a tool that wants to know it without placing the item. The engine does
   * not read it: the hands and the checks take the hold from the item `held` returns, so pass the same
   * hold to the part's `held` call and give that call as `held` below.
   */
  hold?: Hold;
  /**
   * Where it is in a pose, from the pose, the piece's side and options: the same `held` call (with its
   * `hold`) the part draws with. `outfitFromData` hands the holding hand's parts their grip from it
   * (`PartContext.grip`) and, when the item takes both hands (`hands: 2`), moves the other hand onto
   * its second grip. Without it (and without `grip`) the hands stay as they are.
   */
  held?: WieldHeld;
  /**
   * Where the hands close on it, when `held` cannot say: an item placed on the forearm, such as a
   * strapped shield, whose strap is wherever the hand is (`palmGrip`, with the board's outward normal as
   * `behind`). The holding hand's grip first, then, for an item held in both hands, the other hand's.
   * It overrides what `held` gives the hands.
   */
  grip?: WieldGrip;
}

/** A point on a held item (see `WieldInfo.sockets`). */
export type WieldSocket = (pose: Pose, skeleton: SkeletonSpec, piece: { side: -1 | 1; options: Record<string, unknown> }) => Vec3;

/** Where a held item is in a pose (see `WieldInfo.held`): the part's own `held` call. */
export type WieldHeld = (pose: Pose, skeleton: SkeletonSpec, piece: { side: -1 | 1; options: Record<string, unknown> }) => Held;

/** Where the hands close on a held item (see `WieldInfo.grip`): the holding hand's grip, then the other hand's for an item held in both. */
export type WieldGrip = (pose: Pose, skeleton: SkeletonSpec, piece: { side: -1 | 1; options: Record<string, unknown> }) => (Grip | undefined)[];

/** Slots where a part is held in a hand (a sword in the hand, a shield on the forearm). */
export const isHandSlot = (slot: Slot): boolean => slot === 'hand' || slot === 'forearm';

/** What a part is (see `PartInfo.kind`). */
export type PartKind = 'gear' | 'body' | 'effect';

/** A part's kind, falling back to its group ('bodies' → body, 'effects' → effect). */
export const partKind = (info: PartInfo): PartKind => info.kind ?? (info.group === 'bodies' ? 'body' : info.group === 'effects' ? 'effect' : 'gear');

/** The parts a part may rest on (empty when it is not an add-on). */
export const partRequires = (info: PartInfo): string[] => (info.requires === undefined ? [] : Array.isArray(info.requires) ? info.requires : [info.requires]);

/** A base body an outfit is drawn over (bone body, flesh, fur), as editors see it. */
export interface BaseInfo {
  id: string;
  label: string;
  /** The body; it receives the outfit's materials as a fourth argument. */
  skin: NonNullable<OutfitSpec['base']>;
  roles: string[];
}

/**
 * A project's gear catalog: every part and base body with editor metadata, the theme materials
 * that may play each role, and the characters an outfit can be put on (skeleton and clips).
 * The kit exports it from `src/gear/catalog.ts`; editors and saved outfits refer to parts by id.
 */
export interface GearCatalog {
  parts: PartInfo[];
  bases: BaseInfo[];
  /** Theme materials by name (usually `VOLUMES`). */
  materials: Record<string, VolumeStyle>;
}

/** An outfit as data (JSON): parts and materials by id and name, so editors can save and load it. */
export interface OutfitData {
  base?: string;
  /** Role → material name in the catalog. */
  materials: Record<string, string>;
  pieces: {
    part: string;
    slot: Slot;
    side?: -1 | 1;
    options?: Record<string, unknown>;
    materials?: Record<string, string>;
    id?: string;
    on?: string;
    hidden?: boolean;
  }[];
}

/** Turns a role → material-name map into a `MaterialSet`, failing on unknown names. */
function materialsOf(names: Record<string, string> | undefined, catalog: GearCatalog): MaterialSet {
  const out: MaterialSet = {};
  for (const [role, name] of Object.entries(names ?? {})) {
    const m = catalog.materials[name];
    if (!m) throw new Error(`outfit: unknown material "${name}" for role "${role}" (known: ${Object.keys(catalog.materials).join(', ')})`);
    out[role] = m;
  }
  return out;
}

/**
 * Checks an outfit against a catalog and returns the problems (unknown parts, slots a part does
 * not fit, missing or wrong hosts, two pieces with one id, two parts in one equipment slot, two
 * held parts in one hand or beside a two-handed one, unknown materials, options out of range).
 * Empty when it is valid.
 */
export function validateOutfit(data: OutfitData, catalog: GearCatalog): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  if (data.base && !catalog.bases.some(b => b.id === data.base)) problems.push(`unknown base "${data.base}"`);
  for (const name of [...Object.values(data.materials), ...data.pieces.flatMap(p => Object.values(p.materials ?? {}))]) {
    if (!catalog.materials[name]) problems.push(`unknown material "${name}"`);
  }
  const equipped = new Map<string, number>();
  const holding = new Map<number, { index: number; hands: number }>();
  data.pieces.forEach((p, i) => {
    const info = catalog.parts.find(x => x.id === p.part);
    const where = `piece ${i + 1} (${p.part})`;
    if (!info) return void problems.push(`${where}: unknown part`);
    if (!info.slots.includes(p.slot)) problems.push(`${where}: does not fit slot "${p.slot}" (fits ${info.slots.join(', ')})`);
    if (p.on && !ids.has(p.on)) problems.push(`${where}: rests on "${p.on}", which is not an earlier piece`);
    const requires = partRequires(info);
    const named = requires.map(r => `"${r}"`).join(' or ');
    if (requires.length && !p.on) problems.push(`${where}: must rest on a ${named} piece`);
    const host = p.on ? data.pieces.slice(0, i).find(q => q.id === p.on) : undefined;
    if (requires.length && host && !requires.includes(host.part)) problems.push(`${where}: rests on a "${host.part}" piece, but needs a ${named} one`);
    if (info.wield && isHandSlot(p.slot)) {
      const side = p.side ?? 1;
      const other = holding.get(side);
      if (other !== undefined) problems.push(`${where}: the ${side < 0 ? 'left' : 'right'} hand already holds piece ${other.index + 1} (${data.pieces[other.index].part})`);
      else holding.set(side, { index: i, hands: info.wield.hands ?? 1 });
    }
    if (info.equip) {
      const key = `${info.equip}:${isPairedSlot(p.slot) ? (p.side ?? 1) : 0}`;
      const other = equipped.get(key);
      if (other !== undefined) problems.push(`${where}: takes equipment slot "${info.equip}"${isPairedSlot(p.slot) ? ` (${(p.side ?? 1) < 0 ? 'left' : 'right'})` : ''}, already taken by piece ${other + 1} (${data.pieces[other].part})`);
      else equipped.set(key, i);
    }
    for (const opt of info.options ?? []) {
      const v = p.options?.[opt.key];
      if (v === undefined) continue;
      if (opt.type === 'number' && (typeof v !== 'number' || v < opt.min || v > opt.max)) problems.push(`${where}: option "${opt.key}" must be a number in [${opt.min}, ${opt.max}]`);
      if (opt.type === 'boolean' && typeof v !== 'boolean') problems.push(`${where}: option "${opt.key}" must be true or false`);
      if (opt.type === 'select' && !opt.choices.some(c => c.value === v)) problems.push(`${where}: option "${opt.key}" must be one of ${opt.choices.map(c => c.value).join(', ')}`);
    }
    // `on` names a piece by id: two pieces with one id make it ambiguous.
    if (p.id && ids.has(p.id)) problems.push(`${where}: id "${p.id}" is used by an earlier piece`);
    if (p.id) ids.add(p.id);
  });
  // A two-handed part leaves the other hand empty.
  for (const [side, held] of holding) {
    const other = holding.get(-side);
    if (held.hands === 2 && other) problems.push(`piece ${held.index + 1} (${data.pieces[held.index].part}): takes both hands, but the ${side < 0 ? 'right' : 'left'} hand holds piece ${other.index + 1} (${data.pieces[other.index].part})`);
  }
  return problems;
}

/** A piece's options with the catalog's defaults for the ones it leaves out. */
const optionsOf = (info: PartInfo, options: Record<string, unknown> | undefined): Record<string, unknown> => ({ ...Object.fromEntries((info.options ?? []).map(o => [o.key, o.default])), ...options });

/**
 * What an outfit as data holds, as `outfitFromData` reads it: for each hand, the first held part in its
 * hand or forearm slot (the one `wieldOf` counts) whose `wield` says where it is (`held`) or where the
 * hands close on it (`grip`), called with the piece's side and options (the defaults filled in).
 */
export function outfitHolds(data: OutfitData, catalog: GearCatalog): OutfitHold[] {
  const out: OutfitHold[] = [];
  const sides = new Set<number>();
  for (const p of data.pieces) {
    const info = catalog.parts.find(x => x.id === p.part);
    if (!info?.wield || !isHandSlot(p.slot)) continue;
    const side = p.side ?? 1;
    if (sides.has(side)) continue;
    sides.add(side);
    const { held: place, grip, hands = 1 } = info.wield;
    if (!place && !grip) continue;
    const piece = { side, options: optionsOf(info, p.options) };
    const hold: OutfitHold = { side, hands };
    if (place) hold.held = (pose, skeleton) => place(pose, skeleton, piece);
    if (grip) hold.grip = (pose, skeleton) => grip(pose, skeleton, piece);
    out.push(hold);
  }
  return out;
}

/**
 * Builds a skin from an outfit saved as data, with the catalog's parts, bases and materials.
 * Part options left out take the defaults the catalog declares. The pieces in a hand slot receive
 * where that hand closes on what it holds (`PartContext.grip`, from the held part's `wield.held` or
 * `wield.grip`), and a part held in both hands brings the other hand to its second grip (see
 * `outfitHolds`). Throws with every problem `validateOutfit` finds.
 */
export function outfitFromData(data: OutfitData, catalog: GearCatalog): Skin {
  const problems = validateOutfit(data, catalog);
  if (problems.length) throw new Error(`outfit:\n- ${problems.join('\n- ')}`);
  const base = data.base ? catalog.bases.find(b => b.id === data.base)!.skin : undefined;
  const holds = outfitHolds(data, catalog);
  return outfit({
    base,
    materials: materialsOf(data.materials, catalog),
    pieces: data.pieces.map(p => {
      const info = catalog.parts.find(x => x.id === p.part)!;
      return { part: info.part, slot: p.slot, side: p.side, options: optionsOf(info, p.options), materials: materialsOf(p.materials, catalog), id: p.id, on: p.on, hidden: p.hidden };
    }),
    ...(holds.length ? { holds } : {}),
  });
}

/**
 * A character editors may dress: everything `defineCharacter` needs except the skin, plus the
 * outfit it wears by default. The kit's `src/gear/catalog.ts` exports a list of them
 * (`CHARACTERS`); a saved outfit becomes a new character with the same skeleton, clips and cell.
 */
export interface OutfitCharacterInfo {
  id: string;
  /** The name editors show: the same as the character's `defineCharacter` label when one rig object gives both. */
  label: string;
  skeleton: SkeletonSpec;
  clips: Record<string, CharacterClip>;
  camera: Camera;
  width: number;
  height: number;
  pivot: { x: number; y: number };
  shadow?: string;
  directions?: number;
  frames?: number;
  sockets?: Record<string, (pose: Pose) => Vec3>;
  outfit: OutfitData;
}
