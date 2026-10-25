/**
 * @core/rig - Gear: dressing a pose with reusable parts
 *
 * The mechanics every armor, weapon and garment needs, whatever the art style:
 * - `bodyFrames`: frames of the trunk built from the solved pose (not from world up), so gear
 *   follows the body when it twists, pitches in a hit or lies down in a death;
 * - `slotFrame`: where a part sits (head, chest, pelvis, shoulders, forearms, hands, shins,
 *   back), as a right-handed frame plus the side (-1 left, 1 right) for mirrored parts;
 * - `held`: a weapon's grip and direction from the hand and the clip's `weaponYaw` / `weaponPitch`;
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
  /** Default direction in the creature's frame when the clip sets no weapon angle. Default [0.55, 0.3, -0.75] (low and forward). */
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
}

/** A held item's grip, direction and ends. */
export interface Held {
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
}

/** The clip channel of an item held on `side`: 'weapon' for the main (right) hand, 'offWeapon' for the left. */
export const weaponChannel = (side: number): string => (side < 0 ? 'offWeapon' : 'weapon');

/**
 * Grip and direction of an item held in a hand, read from the clip's `extra.weaponYaw` and
 * `extra.weaponPitch` (radians, in the creature's frame; `offWeaponYaw` / `offWeaponPitch` with
 * `channel: 'offWeapon'`) or the `rest` direction. When the body
 * lies down the item settles along the floor beside the arm, and the tip never goes below `floor`.
 * Use the same call in the skin and in the character's sockets, so the drawing and the socket agree.
 */
export function held(pose: Pose, skeleton: SkeletonSpec, hand: string, o: HeldOptions): Held {
  const f = pose.frame;
  const grip = pose.joints[`${hand}.hand`];
  const channel = o.channel ?? 'weapon';
  const yaw = pose.extra[`${channel}Yaw`];
  const r = o.rest ?? [0.55, 0.3, -0.75];
  let dir: Vec3;
  if (yaw === undefined) dir = norm3(f.dir(r[0], r[1], r[2]));
  else {
    const pitch = pose.extra[`${channel}Pitch`] ?? 0;
    dir = norm3(f.dir(Math.cos(yaw) * Math.cos(pitch), Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch)));
  }
  const body = bodyFrames(pose, skeleton);
  if (body.lie > 0) {
    const flat = vec3(body.up.x, body.up.y, 0);
    const ahead = Math.hypot(flat.x, flat.y) > 1e-3 ? norm3(flat) : f.forward;
    const k = body.lie * body.lie * (3 - 2 * body.lie);
    dir = norm3(lerp3(dir, norm3(add3(ahead, scale3(f.right, 0.3))), k));
  }
  const floor = o.floor ?? 1;
  if (grip.z + dir.z * o.length < floor) {
    const z = Math.max(-1, Math.min(1, (floor - grip.z) / o.length));
    const h = Math.hypot(dir.x, dir.y) || 1;
    const s = Math.sqrt(1 - z * z) / h;
    dir = vec3(dir.x * s, dir.y * s, z);
  }
  const buttLength = o.butt ? (dir.z > 0.02 ? Math.min(o.butt, Math.max(0, (grip.z - floor) / dir.z)) : o.butt) : 0;
  const hint = Math.abs(dir.z) > 0.9 ? f.forward : f.up;
  return { grip, dir, tip: add3(grip, scale3(dir, o.length)), butt: sub3(grip, scale3(dir, buttLength)), frame: partFrame(grip, dir, hint) };
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

/** A skin assembled from parts: an optional base skin (the body), then the pieces in order. */
export interface OutfitSpec {
  /** The body under the gear. It receives the outfit's materials as a fourth argument (a plain `Skin` works too). */
  base?: (object: StageObject, pose: Pose, kit: SkinKit, materials: MaterialSet) => void;
  materials: MaterialSet;
  pieces: OutfitPiece[];
}

/**
 * Assembles a skin from parts, the data-driven way to dress characters and make variants: swap a
 * piece, change a side, give a piece other materials. Pieces are drawn in order after the base;
 * `on` hands a piece the volume of an earlier one.
 */
export function outfit(spec: OutfitSpec): Skin {
  return (object, pose, kit) => {
    spec.base?.(object, pose, kit, spec.materials);
    const body = bodyFrames(pose, kit.skeleton);
    const placed = new Map<string, Placed>();
    for (const piece of spec.pieces) {
      const host = piece.on ? placed.get(piece.on) : undefined;
      if (piece.on && !host) throw new Error(`outfit: piece "${piece.id ?? piece.slot}" rests on "${piece.on}", which was not placed before it`);
      const at = slotFrame(pose, kit.skeleton, piece.slot, piece.side ?? 1, body);
      const place = () => piece.part({ object, pose, kit, body, at, materials: { ...spec.materials, ...piece.materials }, host }, piece.options ?? {});
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
}

/** A point on a held item (see `WieldInfo.sockets`). */
export type WieldSocket = (pose: Pose, skeleton: SkeletonSpec, piece: { side: -1 | 1; options: Record<string, unknown> }) => Vec3;

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

/**
 * Builds a skin from an outfit saved as data, with the catalog's parts, bases and materials.
 * Part options left out take the defaults the catalog declares. Throws with every problem
 * `validateOutfit` finds.
 */
export function outfitFromData(data: OutfitData, catalog: GearCatalog): Skin {
  const problems = validateOutfit(data, catalog);
  if (problems.length) throw new Error(`outfit:\n- ${problems.join('\n- ')}`);
  const base = data.base ? catalog.bases.find(b => b.id === data.base)!.skin : undefined;
  return outfit({
    base,
    materials: materialsOf(data.materials, catalog),
    pieces: data.pieces.map(p => {
      const info = catalog.parts.find(x => x.id === p.part)!;
      const defaults = Object.fromEntries((info.options ?? []).map(o => [o.key, o.default]));
      return { part: info.part, slot: p.slot, side: p.side, options: { ...defaults, ...p.options }, materials: materialsOf(p.materials, catalog), id: p.id, on: p.on, hidden: p.hidden };
    }),
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
