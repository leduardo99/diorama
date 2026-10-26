/**
 * @core/rig - Clip checks
 *
 * Measures what makes procedural animation look broken, for any skeleton and clip: bones that
 * stretch, planted feet that slide against the ground speed, feet that sink below the floor and
 * loops that do not close (the end-to-start gap is measured for every clip, warned about for
 * loops and moving clips). `defineCharacterAsset` runs it on every export and writes the result
 * to the atlas JSON, so `npm run inspect` can warn about a new creature or clip without a test.
 *
 * `checkGrips` measures how the hands hold what a character holds, per facing and frame, as ratios
 * of the hand and the arm so they hold for any style: the palm off its grip (`gripGap`), a hand that
 * holds and is told nothing (`openHandHolding`), a wrist past its limits (`wristLimit`), the other
 * arm past its reach (`reachStretch`), the handle slipping in the palm (`gripDrift`) and a handle too
 * short for its hands (`handleTooShort`). `defineCharacter` writes it to the atlas JSON as `grips`.
 */

import { Frame3, directionName, facingYaw } from '../volume/frame.js';
import { add3, cross3, dot3, len3, scale3, sub3, vec3, type Vec3 } from '../volume/vec3.js';
import { categoryOf, type Clip } from './clips.js';
import { footCycle } from './gait.js';
import { holdPose, outfitHolds, type GearCatalog, type OutfitData, type OutfitHold } from './gear.js';
import { HAND, LIMIT_SLACK, WRIST, handSize, palmFrame, pastLimits, type Grip, type Palm } from './grip.js';
import { solvePose } from './pose.js';
import type { SkeletonSpec } from './skeleton.js';
import { wieldOf } from './wield.js';

/** Result of `checkClip`, in world units (logical px). */
export interface ClipCheck {
  /** Worst change of a bone's length from its spec. */
  boneDrift: number;
  /** Locomotion only: worst difference between a planted foot's motion and the ground speed. */
  footSlide: number | null;
  /** Lowest foot height (negative = below the floor). */
  lowestFoot: number;
  /** Lowest height of any joint (a body or tail sinking into the floor shows as negative). */
  lowestJoint: number;
  /**
   * Worst joint distance between the end and the start of the clip, measured for every clip.
   * Loops (`loop: true`) and moving clips (`speed` > 0) are warned about when it is not ~0; a
   * non-looping clip in place (an attack) may legitimately end elsewhere, so it is only reported.
   */
  loopGap: number;
  /** One line per problem, with the usual cause. Empty when the clip is clean. */
  warnings: string[];
}

const dist = (a: Vec3, b: Vec3) => len3(sub3(a, b));

/** Samples a clip `samples` times and measures bone drift, foot slide, floor contact and loop closure. */
export function checkClip(skeleton: SkeletonSpec, clip: Clip, samples = 96): ClipCheck {
  const frame = Frame3.facing(vec3(0, 0, 0), 0);
  const pose = (t: number) => solvePose(skeleton, frame, clip.drive(((t % 1) + 1) % 1));
  const gait = clip.speed > 0 ? skeleton.gaits[clip.name] : undefined;
  let boneDrift = 0;
  let footSlide = 0;
  let lowestFoot = Infinity;
  let lowestJoint = Infinity;
  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    const p = pose(t);
    for (const leg of skeleton.legs) {
      const c = p.chains[leg.name];
      boneDrift = Math.max(boneDrift, Math.abs(dist(c[0], c[1]) - leg.lengths[0]), Math.abs(dist(c[1], c[2]) - leg.lengths[1]));
      if (leg.foot) boneDrift = Math.max(boneDrift, Math.abs(dist(c[2], c[3]) - leg.foot.length));
      lowestFoot = Math.min(lowestFoot, p.joints[`${leg.name}.foot`].z);
    }
    for (const q of Object.values(p.joints)) lowestJoint = Math.min(lowestJoint, q.z);
    for (const arm of skeleton.arms ?? []) {
      const c = p.chains[arm.name];
      boneDrift = Math.max(boneDrift, Math.abs(dist(c[0], c[1]) - arm.lengths[0]), Math.abs(dist(c[1], c[2]) - arm.lengths[1]));
    }
    // A planted foot moves backwards at exactly the ground speed: the game moves the sprite
    // forward at that speed, so on screen the foot stays on the floor.
    if (gait) {
      const q = pose(t + 1 / samples);
      for (const leg of skeleton.legs) {
        const ph = gait.phases[leg.name];
        if (!footCycle(gait, t + ph).planted || !footCycle(gait, t + 1 / samples + ph).planted) continue;
        const moved = dist(p.joints[`${leg.name}.foot`], q.joints[`${leg.name}.foot`]);
        footSlide = Math.max(footSlide, Math.abs(moved - clip.speed * (clip.seconds / samples)));
      }
    }
  }
  const first = pose(0);
  const last = pose(1 - 1e-9);
  const loopGap = Math.max(0, ...Object.keys(first.joints).map(k => dist(first.joints[k], last.joints[k])));
  const round = (x: number) => Math.round(x * 1000) / 1000;
  const warnings: string[] = [];
  if (boneDrift > 0.05) warnings.push(`bones stretch by ${round(boneDrift)}: a target is out of reach and soft IK gave way; shorten the reach or lower the trunk`);
  if (gait && footSlide > 0.05) warnings.push(`planted feet slide by ${round(footSlide)} per sample: the trunk drop cannot keep a foot on its stride; reduce stride or lift, or raise duty`);
  if (lowestFoot < -0.05) warnings.push(`a foot sinks ${round(-lowestFoot)} below the floor: feet targets must have z ≥ 0`);
  if (lowestJoint < -1) warnings.push(`a joint sinks ${round(-lowestJoint)} below the floor: lower the trunk less, or lift the tail or head`);
  // The action contract: what players and the playground rely on.
  const names = clip.events.map(e => e.name);
  if (clip.kind === 'attack' && !names.includes('hit')) warnings.push('an attack without a `hit` event: games deal damage on that frame');
  if (clip.kind === 'skill' && !names.includes('cast') && !names.includes('release')) warnings.push('a skill without a `cast` or `release` event: games fire the effect on that frame');
  if (clip.kind === 'death' && !clip.hold) warnings.push('a death without `hold: true`: it would return to idle when it ends');
  for (const e of clip.events) if (!(e.t >= 0 && e.t < 1)) warnings.push(`event "${e.name}" at t = ${e.t}: events must be in [0, 1)`);
  // Only cycles must close: loops, and locomotion (a clip with ground speed repeats even when
  // `loop` was left at its default of false). Attacks and other one-shots return to rest or not.
  if ((clip.loop || clip.speed > 0) && loopGap > 0.05) {
    const hint = clip.loop ? '' : ' (the clip moves but `loop` is false: pass `loop: true` to defineClip)';
    warnings.push(`the loop does not close (gap ${round(loopGap)}): every periodic term needs a whole number of cycles per loop${hint}`);
  }
  return { boneDrift: round(boneDrift), footSlide: gait ? round(footSlide) : null, lowestFoot: round(lowestFoot), lowestJoint: round(lowestJoint), loopGap: round(loopGap), warnings };
}


// ---------------------------------------------------------------------------------------------
// Grip checks: how the hands hold what a character holds.
// ---------------------------------------------------------------------------------------------

/**
 * How far a grip check lets a hold go before it reports it, as ratios, so the limits hold for any body
 * and style: `gap` and `drift` are fractions of the hand's length (wrist to fingertip, `handSize`),
 * `stretch` a fraction of the arm's full length.
 */
export const GRIP_TOLERANCE = {
  /** `gripGap`: the palm centroid off the point of the handle the hand holds. */
  gap: 0.1,
  /** `gripDrift`: the handle moving in the palm from one frame to the next (its grip point, and a point a palm's width along it, so a turn counts too). */
  drift: 0.1,
  /** `reachStretch`: the other arm, or the reach its grip asks of it, past the arm's full length. */
  stretch: 0.005,
} as const;

/** The worst value of one grip check over a sheet's facings and frames, and where it is. */
export interface GripMeasure {
  /** The worst value, in the check's own ratio (see `GripCheck`). */
  worst: number;
  /** The frame it is in: `<DIR>_<frame>` as in the socket table (`frame_<n>` for a single facing). */
  frame: string;
  /** The hand it was measured on. */
  hand: 'left' | 'right';
  /** How many measured frames are past the check's limit. */
  failing: number;
  /** How many were measured (one per frame and hand). */
  of: number;
}

/**
 * What `checkGrips` finds in one clip: how the hands hold what the character holds, per facing and
 * frame of its sheet, as ratios (of the hand's length, the arm's length, a palm's width, the wrist's
 * limits), so the limits hold for any body and style. A measure is null when there was nothing to
 * measure (no hand of that kind).
 */
export interface GripCheck {
  /**
   * The palm centroid of a hand that holds, against the point of the handle it holds, as a fraction of
   * the hand's length: 0 for an item placed by `held` with its hold, 0.3 for one placed at the wrist.
   * Past `GRIP_TOLERANCE.gap` is an error. A second hand letting go is not measured.
   */
  gripGap: GripMeasure | null;
  /** The share of frames (0..1) in which a hand that holds something is given no grip, so its hand part stays open. Above 0 is an error. */
  openHandHolding: GripMeasure | null;
  /**
   * The wrist angle a hold needs against the wrist's hard limit that way (`WRIST`; 1 is at the limit).
   * Past 1 (with half a degree of slack) is an error. In an idle or locomotion clip (rest and carry poses)
   * a wrist within its limits but past the comfortable range (40° of flexion or extension, 20° of
   * deviation) is a warning.
   */
  wristLimit: GripMeasure | null;
  /**
   * The other hand on an item held in both hands: its arm's reach (shoulder to wrist, or what its grip
   * asks of it) against the arm's full length, 1 when straight. Past 1 (and `GRIP_TOLERANCE.stretch`)
   * is an error; a grip that slid along its range, or a hand that let go to stay within reach, is a note.
   */
  reachStretch: GripMeasure | null;
  /** The handle moving in the palm between consecutive frames, as a fraction of the hand's length. Past `GRIP_TOLERANCE.drift` is an error. */
  gripDrift: GripMeasure | null;
  /** The room on a handle for its hands, in palms: its length over a palm per hand that holds it, and two hands' spacing over a palm. Under 1 is an error. */
  handleTooShort: GripMeasure | null;
  /** One line per problem, with the usual cause. */
  errors: string[];
  warnings: string[];
  /** What the engine did on purpose (a grip that slid along its range, a hand that let go out of reach). */
  notes: string[];
}

/** What `checkGrips` measures: what a character holds, and which of its hands hold something. */
export interface GripSubject {
  /** What it holds and how (`outfitHolds`, `OutfitSpec.holds`): the pose and the grips come from `holdPose`, as the outfit draws them. */
  holds: readonly OutfitHold[];
  /**
   * Every hand that holds something, whether or not its item says how it is held, with the item's name
   * for the reports: a hand among these that is given no grip stays open (`openHandHolding`). Default:
   * the sides of `holds`, and the other hand of an item held in both.
   */
  holding?: { side: -1 | 1; item?: string; hands?: 1 | 2 }[];
}

/** What an outfit as data holds, for `checkGrips`: its holds (`outfitHolds`), and every hand with a held part in its hand or forearm slot (`wieldOf`). */
export function gripSubject(data: OutfitData, catalog: GearCatalog): GripSubject {
  const { main, off } = wieldOf(data, catalog);
  const holding = [main, off].flatMap(w => (w ? [{ side: w.side, item: w.part, hands: w.hands }] : []));
  return { holds: outfitHolds(data, catalog), holding };
}

const handName = (side: number): 'left' | 'right' => (side < 0 ? 'left' : 'right');
const otherSide = (side: -1 | 1): -1 | 1 => (side === 1 ? -1 : 1);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const pointAt = (a: Vec3, b: Vec3, t: number) => add3(a, scale3(sub3(b, a), t));
/** `v` in the frame (x, y, z). */
const inFrame = (v: Vec3, x: Vec3, y: Vec3, z: Vec3) => vec3(dot3(v, x), dot3(v, y), dot3(v, z));
const frameName = (d: number, directions: number, f: number) => (directions > 1 ? `${directionName(d, directions)}_${f}` : `frame_${f}`);

/** The worst value of one check so far. `lower` keeps the least value (room on a handle) instead of the greatest. */
class Worst {
  private best = -Infinity;
  private at = '';
  private side = 1;
  failing = 0;
  of = 0;
  constructor(private readonly lower = false) {}
  add(value: number, frame: string, side: number, bad: boolean) {
    this.of++;
    if (bad) this.failing++;
    const v = this.lower ? -value : value;
    if (v > this.best) {
      this.best = v;
      this.at = frame;
      this.side = side;
    }
  }
  result(): GripMeasure | null {
    return this.of ? { worst: r3(this.lower ? -this.best : this.best), frame: this.at, hand: handName(this.side), failing: this.failing, of: this.of } : null;
  }
}

/** A hand on its handle in one frame, for the drift: the grip point from the palm centroid in the palm's frame (over the hand's length), and the handle's axis in the finger tube's frame. */
interface Seat {
  offset: Vec3;
  axis: Vec3;
}

/** A wrist past its hard limits, in words: 'radial deviation 31° (limit 20°)'. */
function wristInWords(n: { flexion: number; deviation: number }): string {
  const parts: string[] = [];
  if (n.flexion > WRIST.flexion) parts.push(`flexion ${Math.round(n.flexion)}° (limit ${WRIST.flexion}°)`);
  if (-n.flexion > WRIST.extension) parts.push(`extension ${Math.round(-n.flexion)}° (limit ${WRIST.extension}°)`);
  if (n.deviation > WRIST.radial) parts.push(`radial deviation ${Math.round(n.deviation)}° (limit ${WRIST.radial}°)`);
  if (-n.deviation > WRIST.ulnar) parts.push(`ulnar deviation ${Math.round(-n.deviation)}° (limit ${WRIST.ulnar}°)`);
  return parts.join(' and ');
}

/**
 * Measures how a character's hands hold what it holds in one clip, in every facing and frame of its
 * sheet (`directions` × `frames`, default 8 × 8, sampled at t = frame / frames as the sheet is): the
 * pose and the grips come from the holds (`holdPose`), and each item is placed by its own `held` on
 * the pose that is drawn. Six checks, each the worst value with its frame (see `GripCheck` for their
 * ratios and limits): `gripGap`, `openHandHolding`, `wristLimit`, `reachStretch`, `gripDrift` and
 * `handleTooShort`, with errors, warnings and notes in words. `defineCharacter` runs it for a character
 * whose outfit holds an item that says how it is held (`wield.held` or `wield.grip`) and writes it to
 * every sheet's atlas JSON (`meta.data.grips`), which `npm run inspect` prints.
 */
export function checkGrips(skeleton: SkeletonSpec, clip: Clip, subject: GripSubject, o: { directions?: number; frames?: number } = {}): GripCheck {
  const directions = o.directions ?? 8;
  const frames = o.frames ?? 8;
  const holds = subject.holds;
  const armOn = (side: number) => (skeleton.arms ?? []).find(a => a.side === side);
  // Every hand that holds something, once, with what: an item held in both hands holds the other hand too.
  const holding = new Map<-1 | 1, string | undefined>();
  for (const x of subject.holding ?? holds.map(h => ({ side: h.side, hands: h.hands, item: undefined }))) {
    for (const side of (x.hands ?? 1) === 2 ? [x.side, otherSide(x.side)] : [x.side]) if (!holding.has(side)) holding.set(side, x.item);
  }
  const resting = categoryOf(clip.kind) !== 'action';
  const gap = new Worst();
  const open = new Map<-1 | 1, Worst>([...holding.keys()].map(side => [side, new Worst()]));
  const wrist = new Worst();
  const comfort = new Worst();
  const reach = new Worst();
  const drift = new Worst();
  const room = new Worst(true);
  const slid = new Worst();
  const released = new Worst();
  const atWrist = new Set<string>();
  const noSecond = new Set<string>();
  const wristWords = new Map<string, string>();

  for (let d = 0; d < directions; d++) {
    const facing = Frame3.facing(vec3(0, 0, 0), facingYaw(d, directions));
    const seats = new Map<string, { side: -1 | 1; list: (Seat | null)[] }>();
    for (let f = 0; f < frames; f++) {
      const name = frameName(d, directions, f);
      const state = holdPose(solvePose(skeleton, facing, clip.drive(f / frames)), skeleton, holds);
      const pose = state.pose;
      const gripOf = (side: number) => state.grips.find(g => g.side === side)?.grip;
      const letGo = new Set<number>();
      /** A hand on what it holds: its wrist, and with the point it holds and its palm centroid, the gap and the seat for the drift. */
      const measure = (side: -1 | 1, key: string, grip: Grip, palm: Palm, length: number, at?: { point: Vec3; palm: Vec3 }) => {
        const n = grip.palm.needs;
        const hard = Math.max(n.flexion > 0 ? n.flexion / WRIST.flexion : -n.flexion / WRIST.extension, n.deviation > 0 ? n.deviation / WRIST.radial : -n.deviation / WRIST.ulnar);
        const past = pastLimits(n) > LIMIT_SLACK;
        wrist.add(hard, name, side, past);
        if (past) wristWords.set(`${side}:${name}`, wristInWords(n));
        // Comfort is for a wrist within its hard limits: one past them is already an error.
        if (resting && !past) {
          const soft = Math.max(Math.abs(n.flexion) / WRIST.comfort, Math.abs(n.deviation) / (WRIST.comfort / 2));
          comfort.add(soft, name, side, soft > 1);
        }
        if (!seats.has(key)) seats.set(key, { side, list: new Array<Seat | null>(frames).fill(null) });
        if (!at) return;
        const g = Math.max(len3(sub3(at.point, at.palm)), len3(sub3(grip.at, at.point))) / length;
        gap.add(g, name, side, g > GRIP_TOLERANCE.gap);
        seats.get(key)!.list[f] = {
          offset: scale3(inFrame(sub3(at.point, at.palm), palm.along, palm.thumb, palm.normal), 1 / length),
          axis: inFrame(grip.axis, palm.tube, palm.normal, cross3(palm.tube, palm.normal)),
        };
      };
      holds.forEach((h, i) => {
        const side = h.side;
        const arm = armOn(side);
        if (!arm) return;
        const hand = handSize(skeleton, arm);
        const item = h.held?.(pose, skeleton);
        if (item?.released) {
          // Letting go, as the clip says (`Held.released`): neither this hand nor the other hand of a two-handed item holds it.
          letGo.add(side);
          if ((h.hands ?? 1) === 2) letGo.add(otherSide(side));
          return;
        }
        const grip = gripOf(side);
        const wristNow = pose.chains[arm.name][2];
        // The point of the handle the hand holds, and the palm centroid of the hand as drawn.
        let at: { point: Vec3; palm: Vec3 } | undefined;
        if (item?.hold && item.palm) at = { point: item.handle ? pointAt(item.handle.from, item.handle.to, item.hold.grip) : item.grip, palm: add3(wristNow, sub3(item.palm.at, item.palm.wrist)) };
        else if (item) {
          at = { point: item.grip, palm: palmFrame(pose, skeleton, arm.name, { axis: item.dir }).at };
          atWrist.add(handName(side));
        } else if (grip) at = { point: grip.at, palm: add3(wristNow, sub3(grip.palm.at, grip.palm.wrist)) };
        if (grip) measure(side, `main:${i}`, grip, item?.palm ?? grip.palm, hand.length, at);
        else if (at) {
          // Placed without a hold: the hand is told nothing (an open hand, below) and the item is not in the palm.
          const g = len3(sub3(at.point, at.palm)) / hand.length;
          gap.add(g, name, side, g > GRIP_TOLERANCE.gap);
        }
        if (item?.hold) {
          const r = item.hold.handle.length / ((h.hands ?? 1) * hand.palm);
          room.add(r, name, side, r < 1);
        }
        if ((h.hands ?? 1) !== 2) return;
        const other = otherSide(side);
        const otherArm = armOn(other);
        if (!otherArm) return;
        const otherHand = handSize(skeleton, otherArm);
        const otherGrip = gripOf(other);
        const [shoulder, , w] = pose.chains[otherArm.name];
        const full = otherArm.lengths[0] + otherArm.lengths[1];
        const centroid = HAND.centroid * otherHand.length;
        const extension = len3(sub3(w, shoulder)) / full;
        const asks = (p: Vec3) => (len3(sub3(p, shoulder)) - centroid) / full;
        const moved = state.second.filter(s => s.arm === otherArm.name).at(-1);
        if (moved && item?.hold && item.handle) {
          // The engine's second hand: on the item as drawn, at the fraction it chose.
          const target = pointAt(item.handle.from, item.handle.to, moved.fraction);
          const holdsIt = moved.weight >= 1 - 1e-9;
          // A `wield.grip` may name another point for this hand than the engine moved it to: it closes there.
          const r = Math.max(extension, holdsIt ? asks(target) : 0, holdsIt && otherGrip ? asks(otherGrip.at) : 0);
          reach.add(r, name, other, r > 1 + GRIP_TOLERANCE.stretch);
          if (moved.slid) slid.add(moved.fraction, name, other, true);
          if (moved.released) released.add(asks(target), name, other, true);
          if (moved.weight <= 0) letGo.add(other);
          if (holdsIt) {
            const spacing = (Math.abs(moved.fraction - item.hold.grip) * item.hold.handle.length) / otherHand.palm;
            room.add(spacing, name, other, spacing < 1);
          }
          if (otherGrip) measure(other, `second:${i}`, otherGrip, otherGrip.palm, otherHand.length, holdsIt ? { point: target, palm: add3(w, sub3(otherGrip.palm.at, otherGrip.palm.wrist)) } : undefined);
        } else if (otherGrip) {
          // A grip the item's own `grip` gives the other hand: the arm is not moved onto it, so it must reach it as the clip has it.
          const r = Math.max(extension, asks(otherGrip.at));
          reach.add(r, name, other, r > 1 + GRIP_TOLERANCE.stretch);
          measure(other, `second:${i}`, otherGrip, otherGrip.palm, otherHand.length, { point: otherGrip.at, palm: add3(w, sub3(otherGrip.palm.at, otherGrip.palm.wrist)) });
        } else noSecond.add(handName(other));
      });
      // A hand that holds something and is given no grip stays open (a second hand that let go is not holding).
      for (const side of holding.keys()) {
        if (!armOn(side) || letGo.has(side)) continue;
        const isOpen = !gripOf(side);
        open.get(side)!.add(isOpen ? 1 : 0, name, side, isOpen);
      }
    }
    // The drift: the handle in the palm from one frame to the next, round the loop for a cycle.
    for (const { side, list } of seats.values()) {
      const arm = armOn(side)!;
      const { length, palm } = handSize(skeleton, arm);
      for (let f = 0; f < (clip.loop ? frames : frames - 1); f++) {
        const a = list[f];
        const b = list[(f + 1) % frames];
        if (!a || !b) continue;
        const slip = Math.max(len3(sub3(a.offset, b.offset)), (palm / length) * len3(sub3(a.axis, b.axis)));
        drift.add(slip, frameName(d, directions, (f + 1) % frames), side, slip > GRIP_TOLERANCE.drift);
      }
    }
  }

  // The hand open the most often (its share of the frames it was measured in).
  const openHand = [...open.values()].map(w => w.result()).filter((m): m is GripMeasure => !!m).map(m => ({ ...m, worst: r3(m.failing / m.of) })).sort((a, b) => b.worst - a.worst)[0] ?? null;
  const measures = {
    gripGap: gap.result(),
    openHandHolding: openHand,
    wristLimit: wrist.result(),
    reachStretch: reach.result(),
    gripDrift: drift.result(),
    handleTooShort: room.result(),
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  const where = (m: GripMeasure) => `${m.failing} of ${m.of} frames, worst ${m.frame}`;
  const { gripGap: g, openHandHolding: oh, wristLimit: wl, reachStretch: rs, gripDrift: gd, handleTooShort: ht } = measures;
  if (g?.failing) {
    const cause = atWrist.has(g.hand)
      ? 'it is placed at the wrist, not in the palm: pass its hold to its `held` call (`HeldOptions.hold`)'
      : 'it is placed on another pose than the one drawn, or away from the palm: place it with `held` and its hold, on the pose the part receives';
    errors.push(`gripGap: the ${g.hand} palm is ${g.worst} hand lengths from where it holds its item (${where(g)}): ${cause}`);
  }
  if (oh?.failing) {
    const item = holding.get(oh.hand === 'left' ? -1 : 1);
    const cause = noSecond.has(oh.hand)
      ? 'the item takes both hands, but its hold has no second grip (`Hold.second`) and its `wield.grip` gives this hand none'
      : atWrist.has(oh.hand)
        ? 'its `held` call has no hold, so the hand is told nothing: pass the hold to `held`'
        : 'its part says neither where it is (`wield.held`, with a hold) nor where the hand closes on it (`wield.grip`; `palmGrip` for a strap behind a surface)';
    errors.push(`openHandHolding: the ${oh.hand} hand holds ${item ? `"${item}"` : 'an item'} but is given no grip (${oh.failing} of ${oh.of} frames, first ${oh.frame}), so its hand part stays open: ${cause}`);
  }
  if (wl?.failing) {
    const words = wristWords.get(`${wl.hand === 'left' ? -1 : 1}:${wl.frame}`);
    errors.push(`wristLimit: the ${wl.hand} wrist needs ${words} to hold its item (${wl.worst} of its limit; ${where(wl)}): the hand stops at its limit and the handle leaves the fist; turn the item less against the forearm (the clip's \`weaponYaw\` / \`weaponPitch\`: a rest the engine chose is already turned to where the wrist holds it), or turn the forearm with it`);
  }
  const cm = comfort.result();
  if (cm?.failing) warnings.push(`wristLimit: at rest the ${cm.hand} wrist is bent past its comfortable range (${cm.worst} of it; ${where(cm)}): a resting hand sits near neutral (extended 15 to 30°, up to 15° towards the little finger); carry the item, or pose the forearm, so the hand holds it with the wrist nearly straight`);
  if (rs?.failing) errors.push(`reachStretch: the ${rs.hand} arm must reach ${rs.worst} of its full length for its grip (${where(rs)}): give the grip a range it may slide in (\`Hold.second\`), or bring the hands closer in the clip`);
  const s = slid.result();
  if (s) notes.push(`reachStretch: the ${s.hand} hand slid along its grip's range to stay within reach in ${s.of} frames (first ${s.frame})`);
  const rl = released.result();
  if (rl) notes.push(`reachStretch: the ${rl.hand} hand let go, its grip out of reach (up to ${rl.worst} of the arm's length), in ${rl.of} frames (worst ${rl.frame})`);
  if (gd?.failing) errors.push(`gripDrift: the handle moves ${gd.worst} hand lengths in the ${gd.hand} palm from one frame to the next (${where(gd)}): place the item with \`held\` and its hold in every frame, and keep the wrist within its limits (a hand stopped at a limit lets the handle turn in the fist)`);
  if (ht?.failing) errors.push(`handleTooShort: the handle gives the ${ht.hand} hand ${ht.worst} palms of room (${where(ht)}): a hand needs a palm (H / 24) of handle, and two hands a palm between them; lengthen \`Hold.handle.length\` or move the grips apart`);
  return { ...measures, errors, warnings, notes };
}
