/**
 * Props of the graveyard kit: the pieces a set is dressed with. Each one is a `ScenePiece`: it draws one frame
 * of the prop into `ctx.object` in `ctx.frame` (origin at the centre of its footprint on the floor, which is
 * world 0, 0, 0 whatever the cell, turned to its facing), so the same code serves the tile set, the scene
 * painter and a game's own layout.
 *
 * - tombstone and reliquary were standalone assets; their drawing lives here now and
 *   their sheets (`sheets/props/*.ts`) are one-line tile sets (`asset` in the catalog), with a cell sized for the profile's 48-wide cells.
 * - the contact shadow and the pool of soul light on the floor are drawn into `ctx.ground` through
 *   `prop-parts.ts`: the engine draws them before the parts and their contour, so they lie under every
 *   part from every facing and the ink line stays crisp over them.
 * - the footprint turns with the facing (`footprintOf`): the 1 × 2 coffin facing east or west covers 2 × 1
 *   cells, and its shadow and plan turn with it through `facingWeights(ctx)`. Everything else stands in one cell
 *   (the tombstone and the reliquary included) or, for the dead tree, two by two.
 *
 * Sizes are measured against the character (`SPACE.scale.character`, 80 world units, 1 unit = 1 logical px at the
 * camera's x scale): every prop is drawn at the size its numbers are written in, then scaled by `scaleTo` so its top
 * stands at its `PROP_HEIGHT` (a tombstone about 0.6 of a person, the reliquary half, a candle cluster and a bone pile
 * low, a lantern post and the dead tree taller than one). Solids and rounds scale through `ctx.frame.scaled(k)`;
 * what a frame cannot scale (decal shapes, tube widths, flames and glows, shadows) is multiplied by `k` by hand.
 */

import { createRng } from '@core';
import { Path, Polygon, alpha, type Point, type Shape } from '@core/draw';
import { Decal, Frame3, Round, Solid, Tube, floorGlow, norm3, pieceRng, scale3, vec3, visibleArc, type PieceContext, type ScenePiece, type VolumeStyle } from '@core/volume';
import { GLOWS, PALETTES, RAMPS, SHAPE_STYLES, STROKES } from '../theme';
import { CHARACTER, bone as boneShape, candle as candleParts, contactShadow, facingWeights, floorShape, liveFlame, propHeight, ringPoints, scaleTo, skull as skullParts, soulBurst, soulMotes, toned, wisp } from './prop-parts';
import { RAD, flutter, pitched, playhead, track, type Keys } from './motion';
import { paintFlame } from '../gear/fire';
import { blob, hairline, mixTone, role, runeShape, soulMark, worldFrame } from './util';

// ----------------------------------------------------------------------------------------------
// Tombstone
// ----------------------------------------------------------------------------------------------

/** Cell and pivot of the tombstone's sheet: one 48-wide cell and a little more, room above for the arch and below for the shadow. */
export const TOMBSTONE_CELL = { width: 64, height: 80, pivot: { x: 32, y: 58 } };

// Local sizes as designed: length = along forward (depth), width = along side, height = up.
const PLINTH = { length: 20, width: 44, height: 5 };
const STEP = { length: 16, width: 38, height: 4 };
const SLAB = { width: 26, shoulder: 30, thickness: 8, archRadius: 18 };

/** The headstone as designed stands this tall (plinth, step, slab and the crown of its arch). */
const TOMBSTONE_DESIGN_TOP = PLINTH.height + STEP.height + SLAB.shoulder + Math.sqrt(SLAB.archRadius ** 2 - (SLAB.width / 2 - SLAB.archRadius) ** 2);
/** Scale from the design to its nominal height (about 0.63 of the character): a headstone and its base fit one 48-wide cell. */
const TS = scaleTo('tombstone', TOMBSTONE_DESIGN_TOP);
const ORIGIN = { x: 0, y: 0 };
/** A decal shape drawn in design units, scaled to the tombstone (about the decal's own origin, where it was drawn). */
const sized = (shape: Shape): Shape => shape.scale(TS, TS, ORIGIN);

/** Slab outline in (side, up) coordinates, up positive: a lancet arch over a straight body, with a worn chip. */
function slabProfile(): Shape {
  const { width: w, shoulder: s, archRadius: r } = SLAB;
  const body = Polygon.rect(w, s, { cx: 0, cy: s / 2 });
  const left = Polygon.circle(r, { cx: -w / 2 + r, cy: s, segments: 24 });
  const right = Polygon.circle(r, { cx: w / 2 - r, cy: s, segments: 24 });
  const above = Polygon.rect(w, r, { cx: 0, cy: s + r / 2 });
  const arch = left.intersect(right).intersect(above);
  // A chunk broken off the right shoulder of the arch (the object's right hand).
  const chip = Polygon.triangle(9, 7, { cx: w / 2 - 0.5, cy: s + 8 });
  chip.rotate(-120, chip.center);
  return body.union(arch).subtract(chip);
}

/** Carved skull in decal space (x = right, y = down), centred on the origin; sockets are holes. */
function carvedSkull(): { relief: Shape; sockets: Shape } {
  const cranium = Polygon.ellipse(5.4, 5, { cx: 0, cy: -1.2, segments: 40 });
  const jaw = Polygon.rect(6.2, 4.2, { cx: 0, cy: 3.6, radius: 1.2 });
  const eyes = Polygon.circle(1.6, { cx: -2.2, cy: -0.6, segments: 20 }).union(
    Polygon.circle(1.6, { cx: 2.2, cy: -0.6, segments: 20 }),
  );
  const nose = Polygon.triangle(1.6, 1.8, { cx: 0, cy: 1.9 });
  const teeth = [-1.5, 0, 1.5].map(x => Polygon.rect(0.45, 2, { cx: x, cy: 4.4 }));
  const relief = cranium.union(jaw).subtract([eyes, nose, ...teeth]);
  return { relief, sockets: eyes };
}

/** Crack running down from the chip, in decal space (x = right, y = down, origin at the slab base). */
function slabCrack(seed: number): Shape {
  const rng = createRng(seed);
  const top = { x: SLAB.width / 2 - 4, y: -(SLAB.shoulder + 3.5) };
  const points = [top];
  for (let i = 1; i <= 4; i++) {
    const prev = points[points.length - 1];
    points.push({ x: prev.x - rng.float(1, 2.6), y: prev.y + rng.float(3.2, 4.6) });
  }
  return Path.spline(points, { style: 'chiseled' }).toShape({ width: { start: 1.1, end: 0.25 }, cap: 'round' });
}

/** The tombstone's options: what is carved on it, whether a candle burns at its foot, moss. The defaults are the stone as it always was. */
export interface TombstoneOptions {
  emblem: 'skull' | 'cross' | 'none';
  candle: boolean;
  moss: boolean;
}

/** A cross carved in relief, in decal space (x right, y down), centred on the origin. */
function carvedCross(): Shape {
  return Polygon.rect(2.6, 17, { cx: 0, cy: 1, radius: 0.6 }).union(Polygon.rect(11, 2.6, { cx: 0, cy: -3, radius: 0.6 }));
}

/**
 * Gothic tombstone: a pointed-arch headstone on a two-tier plinth, a carved skull with soul-fire eyes on the
 * front, a chipped and cracked shoulder, and a soul candle on the step. Front (skull, candle) against back
 * (plain slab) tells the facing, so it has four rows.
 */
export const tombstone: ScenePiece<TombstoneOptions> = (ctx, opt) => {
  const o = ctx.object;
  const stone = role(ctx.materials, 'stone');
  const bone = role(ctx.materials, 'bone');
  // Everything below is written at the design size; this frame scales solids and positions to the nominal height.
  const frame = ctx.frame.scaled(TS);

  // Contact shadow follows the plinth footprint as it turns: wide across the screen facing the camera or away
  // from it (forward in depth, `turn.y`), long in depth facing east or west (forward across the
  // screen, `turn.x`), where the tombstone covers 1 × 2 cells.
  const turn = facingWeights(ctx);
  contactShadow(ctx, (PLINTH.width * 0.62 * turn.y + PLINTH.length * 0.7 * turn.x) * TS, (PLINTH.length * 0.7 * turn.y + PLINTH.width * 0.5 * turn.x) * TS, { fill: GLOWS.ground });

  // Silhouette: plinth, step, slab.
  const plinth = Solid.box(frame, PLINTH.length, PLINTH.width, PLINTH.height);
  const stepFrame = frame.moved(0, 0, PLINTH.height);
  const step = Solid.box(stepFrame, STEP.length, STEP.width, STEP.height);
  const slabBase = stepFrame.moved(-1.5, 0, STEP.height);
  // Extrude the arch profile along forward: profile x = side, profile y = up.
  const slabFrame = new Frame3(slabBase.at(-SLAB.thickness / 2, 0, 0), slabBase.dir(0, 1, 0), slabBase.dir(0, 0, 1), slabBase.dir(1, 0, 0));
  const slab = Solid.extrude(slabFrame, slabProfile(), SLAB.thickness);

  o.add(plinth, stone);
  o.add(step, stone, { on: plinth });
  o.add(slab, stone, { on: step });

  // Front carvings: recessed arch panel, skull relief with soul-fire eyes, crack.
  const front = SLAB.thickness / 2;
  const panelShape = sized(slabProfile()
    .offset(-3)
    .intersect(Polygon.rect(SLAB.width, SLAB.shoulder + SLAB.archRadius, { cx: 0, cy: (SLAB.shoulder + SLAB.archRadius) / 2 + 12 }))
    .flip('y', 0));
  const panel = Decal.onFace(slabBase, 'front', vec3(front, 0, 0), panelShape);
  if (opt.emblem === 'skull') {
    const { relief, sockets } = carvedSkull();
    const skullAt = vec3(front, 0, SLAB.shoulder + 1);
    const skullDecal = Decal.onFace(slabBase, 'front', skullAt, sized(relief));
    const eyes = Decal.onFace(slabBase, 'front', skullAt, sized(sockets.offset(-0.5)));
    const crackDecal = Decal.onFace(slabBase, 'front', vec3(front, 0, 0), sized(slabCrack(7)));
    o.add(panel, SHAPE_STYLES.stoneCarve, { on: slab });
    o.add(skullDecal, SHAPE_STYLES.stoneRelief, { on: panel });
    o.add(eyes, SHAPE_STYLES.soul, { on: skullDecal });
    o.add(crackDecal, SHAPE_STYLES.stoneCrack, { on: slab });
  } else {
    o.add(panel, SHAPE_STYLES.stoneCarve, { on: slab });
    if (opt.emblem === 'cross') o.add(Decal.onFace(slabBase, 'front', vec3(front, 0, SLAB.shoulder - 3), sized(carvedCross())), SHAPE_STYLES.stoneRelief, { on: panel });
    o.add(Decal.onFace(slabBase, 'front', vec3(front, 0, 0), sized(slabCrack(7))), SHAPE_STYLES.stoneCrack, { on: slab });
  }
  // A small crack hanging from the plinth's top edge (decal y runs down the face from the edge).
  const plinthCrack = Decal.onFace(frame, 'front', vec3(PLINTH.length / 2, 14, PLINTH.height), sized(slabCrack(23).scale(0.35).moveTo({ x: 0, y: 0.4 }, 'topLeft')));
  o.add(plinthCrack, SHAPE_STYLES.stoneCrack, { on: plinth });

  // Moss on the plinth: ragged patches along its top edge and the step's, in the moss role.
  if (opt.moss) {
    const mossRole = role(ctx.materials, 'moss');
    const mossStyle = { fill: alpha(mossRole.ramp.base, 0.95) };
    const rng = createRng(31);
    for (const [x, y, w] of [[-8, 18, 5.2], [3, -17.5, 4.4], [8, 15.5, 3.6], [-6, -19, 3.8]] as const) {
      o.add(Decal.onFace(frame, 'top', vec3(x, y, PLINTH.height), sized(blob(0, 0, w * 0.5, w * 0.34, rng.int(1, 999), 0, 0.3))), mossStyle, { on: plinth });
    }
    o.add(Decal.onFace(frame, 'front', vec3(PLINTH.length / 2, -10, PLINTH.height * 0.5), sized(blob(0, 0, 4.6, 1.1, 5, 0, 0.3))), mossStyle, { on: plinth });
  }

  // Soul candle on the step, beside the slab on the object's left hand. Kept clear of the slab's outline in
  // every facing: a round sorts at its centre, the slab's tall faces would hide it.
  if (!opt.candle) return;
  const candleFrame = stepFrame.moved(STEP.length / 2 - 3.5, -16.2, STEP.height);
  const wax = Round.cylinder(candleFrame, 2.2, 0.8);
  const candle = Round.cylinder(candleFrame, 1.6, 7, 1.4);
  o.add(wax, bone, { on: step });
  o.add(candle, bone, { on: wax });
  const flameAt = candleFrame.at(0, 0, 7.6);
  o.custom(
    flameAt,
    (c, view) => {
      const tip = view.project(flameAt);
      const flame = Polygon.circle(1.5 * TS, { cx: tip.x, cy: tip.y - 1.2 * TS, segments: 20 })
        .union(Polygon.triangle(2.6 * TS, 4 * TS, { cx: tip.x, cy: tip.y - 3.6 * TS }))
        .roundCorners(0.6 * TS);
      flame.draw(c, SHAPE_STYLES.soul);
    },
    { on: candle },
  );
};

// ----------------------------------------------------------------------------------------------
// Reliquary
// ----------------------------------------------------------------------------------------------

/** Cell and pivot of the reliquary's sheet: one 48-wide cell and more; room above for the candle's flame, the open lid (it stands past the chest's own height) and the burst of light and its motes, to the sides for the lid and its candle swung out, below for the shadow and the light on the floor. */
export const RELIQUARY_CELL = { width: 80, height: 96, pivot: { x: 40, y: 74 } };

// Local dimensions as designed (world units): depth along forward, width along side, heights up.
const CHEST = { depth: 22, width: 34, foot: 2, body: 14, lidRise: 8 };
/** The chest as designed stands this tall with its candle and flame on the lid. */
const CHEST_DESIGN_TOP = CHEST.foot + CHEST.body + CHEST.lidRise - 0.6 + 6 + 8;
/** Scale from the design to its nominal height (about half the character): a chest in one 48-wide cell. */
const RK = scaleTo('reliquary', CHEST_DESIGN_TOP);

/** The lid when the chest rests open: a little past upright, leaning on its hinge. */
const LID_OPEN = 105;
/** The light inside an open chest when the burst has passed (0 to 1). */
const LIGHT_OPEN = 0.55;

/**
 * The reliquary's animations, by name (the catalog's `clips`): the lid swings up on its back hinge with a burst of soul
 * light, and comes down again. The tables below are written in frames of these clips.
 * They are named for what the lid is doing (`opening`, `closing`), not `open` and `close`: a clip and a state share the name of their
 * sheet (`<id>--<name>`), and the chest's resting state is already `open`.
 * - `opening`, 10 frames: the lid lifts a hair and drops back with light leaking through (anticipation, frames 1 and 2), swings
 *   up in three strides, passes its resting angle (118°, the peak, where the burst is brightest and the `open` event is) and settles;
 * - `closing`, 8 frames: the lid lifts a little, falls with gathering speed, slams shut (`close`, frame 5), rebounds and settles.
 */
export const RELIQUARY_CLIPS = {
  opening: { frames: 10, fps: 12, from: 'shut', to: 'open', events: [{ frame: 5, name: 'open' }] },
  closing: { frames: 8, fps: 12, from: 'open', to: 'shut', events: [{ frame: 5, name: 'close' }] },
};

/** How the chest looks in one frame: the lid's angle (degrees), the light inside, the burst, the candle's flame and its smoke. */
interface ChestPose {
  lid: number;
  /** Soul light in the chest (0 to 1): it lights the lining, the orb and, through the gap, the seam. */
  light: number;
  /** The column of light and the bloom that burst out (0 to 1). */
  burst: number;
  /** Progress of the clip for the motes the burst throws up, or -1 for none. */
  motes: number;
  /** The candle's flame (0 snuffed, 1 as drawn on the shut chest). */
  flame: number;
  /** Smoke from the snuffed wick (0 to 1). */
  smoke: number;
}

const POSE_SHUT: ChestPose = { lid: 0, light: 0, burst: 0, motes: -1, flame: 1, smoke: 0 };
const POSE_OPEN: ChestPose = { lid: LID_OPEN, light: LIGHT_OPEN, burst: 0, motes: -1, flame: 0, smoke: 0 };

/** The key tables of the two clips: the last key of each is the resting pose it ends in. */
const OPENING = {
  lid: [[0, 0], [1, 4], [2, 1.5], [3, 38], [4, 88], [5, 118], [6, 108], [7, 102.5], [8, 105.5], [9, LID_OPEN]],
  light: [[0, 0], [1, 0.85], [2, 0.7], [3, 0.9], [4, 1], [5, 1], [6, 0.8], [7, 0.66], [8, 0.58], [9, LIGHT_OPEN]],
  burst: [[0, 0], [2, 0], [3, 0.45], [4, 0.9], [5, 1], [6, 0.7], [7, 0.4], [8, 0.15], [9, 0]],
  flame: [[0, 1], [2, 1], [3, 0.65], [4, 0.25], [5, 0], [9, 0]],
  smoke: [[0, 0], [4, 0], [5, 0.8], [6, 0.7], [7, 0.45], [8, 0.2], [9, 0]],
} satisfies Record<string, Keys>;
const CLOSING = {
  lid: [[0, LID_OPEN], [1, 109], [2, 98], [3, 60], [4, 22], [5, 0], [6, 5.5], [7, 0]],
  light: [[0, LIGHT_OPEN], [1, 0.6], [2, 0.5], [3, 0.36], [4, 0.2], [5, 0.7], [6, 0.8], [7, 0]],
  burst: [[0, 0], [7, 0]],
  flame: [[0, 0], [4, 0], [5, 0.3], [6, 0.75], [7, 1]],
  smoke: [[0, 0], [7, 0]],
} satisfies Record<string, Keys>;

/** The chest's pose for a still (its resting state) or one frame of a clip. */
function chestPose(ctx: PieceContext): ChestPose {
  const clip = ctx.clip;
  if (!clip) return ctx.state === 'open' ? POSE_OPEN : POSE_SHUT;
  const x = playhead(clip);
  const keys = clip.name === 'closing' ? CLOSING : OPENING;
  return { lid: track(x, keys.lid), light: track(x, keys.light), burst: track(x, keys.burst), motes: clip.name === 'opening' ? clip.t : -1, flame: track(x, keys.flame), smoke: track(x, keys.smoke) };
}

/**
 * Reliquary: the necromancer's chest. A wooden body with an arched lid, iron bands and a bone skull lock whose
 * eyes burn with soul fire. Eight facings: the lock and the hinges make it asymmetric, so every direction is
 * rendered, never mirrored.
 *
 * It rests shut (`state` 'shut', the sheet in `props/reliquary`) or open ('open'): then the lid stands on its back hinge, the
 * candle is snuffed and the lining glows with soul light round an orb and a few relics. The clips swing the lid between them
 * (`RELIQUARY_CLIPS`): everything is drawn from the pose of the frame, so frame 0 of `opening` is the shut chest and its last
 * frame the open one, and `closing` goes the other way.
 */
export const reliquary: ScenePiece<Record<string, never>> = ctx => {
  const chestObj = ctx.object;
  const wood = role(ctx.materials, 'darkwood');
  const iron = role(ctx.materials, 'metal');
  const bone = role(ctx.materials, 'bone');
  const glow = role(ctx.materials, 'glow');
  const cam = ctx.camera;
  const pose = chestPose(ctx);
  const { depth: DEPTH, width: WIDTH, foot: FOOT, body: BODY_H, lidRise: LID_RISE } = CHEST;
  // The whole chest is one object: its parts sort among themselves, face by face. Written at the design size, drawn through a scaled frame.
  const base = ctx.frame.scaled(RK);
  const sized = (shape: Shape): Shape => shape.scale(RK, RK, { x: 0, y: 0 });
  const body = base.moved(0, 0, FOOT);
  // The lid turns on a hinge along the back's top edge. `lid` is the lid's own frame (forward along the lid, up through it,
  // origin on the hinge) and `onLid(forward, side, up)` a point of it written as on the shut chest (forward from the middle of the body).
  const open = pose.lid > 0.01;
  // The inside only shows once the lid has cleared it: a lid a few degrees up still covers it (its back half would sort behind the lining).
  const showInside = pose.lid > 12;
  const hinge = body.at(-DEPTH / 2, 0, BODY_H);
  const lid = pitched(new Frame3(hinge, body.forward, body.right, body.up), pose.lid * RAD);
  const onLid = (fw: number, sd: number, up: number) => lid.at(DEPTH / 2 + fw, sd, up);
  const lidSection = (at: number) => new Frame3(onLid(0, at, 0), lid.forward, lid.up, lid.right);

  // Feet under the corners, the body, and the arched lid (profile in the forward/up plane, extruded across the width).
  for (const f of [-1, 1]) {
    for (const s of [-1, 1]) {
      chestObj.add(Solid.box(base.moved(f * (DEPTH / 2 - 2), s * (WIDTH / 2 - 2.5), 0), 3.5, 4, FOOT), iron);
    }
  }
  const chest = Solid.box(body, DEPTH, WIDTH, BODY_H);
  chestObj.add(chest, wood);

  const arch = Path.arc({ x: 0, y: 0 }, DEPTH / 2, 0, 180).close().scale(1, LID_RISE / (DEPTH / 2), { x: 0, y: 0 });
  const lidSolid = Solid.extrude(lidSection(-WIDTH / 2), arch, WIDTH);
  chestObj.add(lidSolid, wood);

  // Iron bands: slightly larger arches (on the lid) and straps that wrap the body.
  const band = arch.clone().scale(1.07, 1.12, { x: 0, y: 0 });
  for (const s of [-WIDTH / 2 + 5, WIDTH / 2 - 7.4]) {
    chestObj.add(Solid.extrude(lidSection(s), band, 2.4), iron);
    chestObj.add(Solid.box(body.moved(0, s + 1.2, -0.3), DEPTH + 0.8, 2.4, BODY_H + 0.3), iron);
  }
  // Rim where the lid meets the body: a block under the shut lid, a ring (four bars) once the lid lifts and the inside shows.
  if (!open) chestObj.add(Solid.box(body.moved(0, 0, BODY_H - 1.2), DEPTH + 0.6, WIDTH + 0.6, 1.6), iron);
  else {
    const bar = 1.5;
    chestObj.add(Solid.box(body.moved(DEPTH / 2 + 0.3 - bar / 2, 0, BODY_H - 1.2), bar, WIDTH + 0.6, 1.6), iron);
    chestObj.add(Solid.box(body.moved(-(DEPTH / 2 + 0.3 - bar / 2), 0, BODY_H - 1.2), bar, WIDTH + 0.6, 1.6), iron);
    for (const side of [-1, 1]) chestObj.add(Solid.box(body.moved(0, side * ((WIDTH + 0.6) / 2 - bar / 2), BODY_H - 1.2), DEPTH + 0.6 - 2 * bar, bar, 1.6), iron);
  }

  // Bone skull lock on the front face, with burning eyes and a keyhole mouth.
  const front = (x: number, z: number) => vec3(DEPTH / 2 + 0.4, x, z);
  const lockSkull = sized(Polygon.ellipse(4.2, 4, { cx: 0, cy: 0 })
    .union(Polygon.rect(5.2, 3.4, { cx: 0, cy: 3.6, radius: 1.2 }))
    .subtract([
      Polygon.ellipse(1.25, 1.1, { cx: -1.6, cy: 0.2 }),
      Polygon.ellipse(1.25, 1.1, { cx: 1.6, cy: 0.2 }),
      Polygon.rect(0.9, 2.4, { cx: 0, cy: 4.4 }),
    ]));
  const lock = Decal.onFace(body, 'front', front(0, BODY_H - 3.5), lockSkull);
  chestObj.add(lock, SHAPE_STYLES.bone, { on: chest });
  const eyes = sized(Polygon.circle(0.75, { cx: -1.6, cy: 0.3 }).union(Polygon.circle(0.75, { cx: 1.6, cy: 0.3 })));
  chestObj.add(Decal.onFace(body, 'front', front(0, BODY_H - 3.5), eyes), { fill: RAMPS.soul.lit, shadow: GLOWS.soulFaint }, { on: lock });

  // Hinges on the back: they show which side is the back from every angle.
  for (const s of [-WIDTH / 2 + 6.2, WIDTH / 2 - 6.2]) {
    const hinge = sized(Polygon.rect(3.2, 2.2, { cx: 0, cy: 0, radius: 0.6 }));
    chestObj.add(Decal.onFace(body, 'back', vec3(-DEPTH / 2 - 0.3, s, BODY_H - 1.2), hinge), { fill: RAMPS.iron.base, stroke: STROKES.detail.with({ width: 0.7 }) }, { on: chest });
  }

  // The inside, once the lid is up: a dark wine lining lit by the soul light and an orb of it on crossed bones.
  if (showInside) {
    const lining = mixTone(RAMPS.sash.dark, RAMPS.hollow.base, 0.4);
    const inside = Decal.onFace(body, 'top', vec3(0, 0, BODY_H), sized(Polygon.rect(WIDTH - 2.4, DEPTH - 2.4, { cx: 0, cy: 0, radius: 1 })));
    chestObj.add(inside, { fill: lining, stroke: hairline(alpha(wood.ramp.lit, 0.6), 0.6) }, { on: chest });
    const lit = Math.min(1, pose.light);
    const region = inside.projected(cam);
    const heart = body.at(-1, 0, BODY_H);
    chestObj.custom(heart, (c, v) => {
      const p = v.project(heart);
      region.clip(c, () => {
        c.save();
        c.translate(p.x, p.y);
        c.scale(1, Math.sin((v.tilt * Math.PI) / 180));
        const rr = 19 * RK;
        const g = c.createRadialGradient(0, 0, 0, 0, 0, rr);
        g.addColorStop(0, alpha(glow.ramp.lit, 0.95 * lit));
        g.addColorStop(0.3, alpha(glow.ramp.base, 0.72 * lit));
        g.addColorStop(0.75, alpha(glow.ramp.dark, 0.38 * lit));
        g.addColorStop(1, alpha(glow.ramp.dark, 0.12 * lit));
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, rr, 0, Math.PI * 2);
        c.fill();
        c.restore();
      });
    }, { on: inside });
    // Relics lying on the lining: two bones crossed and the orb on top.
    const at = (fw: number, sd: number, z: number) => body.at(fw, sd, BODY_H + z);
    boneShape(chestObj, at(-4, -9, 1), at(5, 4, 1), toned(bone, 0.12), { width: 1.9 * RK, knob: 1.35 * RK, on: inside });
    boneShape(chestObj, at(4.6, -8.4, 1.3), at(-5.4, 5, 1.3), toned(bone, 0.3), { width: 1.8 * RK, knob: 1.3 * RK, on: inside });
    const orbAt = at(-1.4, 0.4, 3.4);
    const orb = Round.ellipsoid(Frame3.facing(orbAt, 0), 3.2 * RK, 3.2 * RK, 3.2 * RK);
    chestObj.add(orb, { ...glow, ramp: { lit: RAMPS.soul.lit, base: RAMPS.soul.lit, dark: RAMPS.soul.base } }, { on: inside });
    chestObj.custom(orbAt, (c, v) => {
      const p = v.project(orbAt);
      const r = 8.5 * RK;
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, alpha(glow.ramp.lit, 0.6 * lit));
      g.addColorStop(1, alpha(glow.ramp.base, 0));
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, r, 0, Math.PI * 2);
      c.fill();
    }, { on: orb });
    // The lid's underside, lined like the chest.
    const under = new Decal(onLid(0, 0, -0.02), norm3(lid.right), norm3(lid.forward), sized(Polygon.rect(WIDTH - 3, DEPTH - 3, { cx: 0, cy: 0, radius: 1.2 })), scale3(norm3(lid.up), -1));
    chestObj.add(under, { fill: mixTone(lining, RAMPS.sash.dark, 0.35), stroke: hairline(alpha(iron.ramp.lit, 0.45), 0.6) }, { on: lidSolid });
  }

  // A bone candle on the lid, burning with soul fire (a round volume plus a drawn flame sorted at its wick): it rides the lid and goes out as the chest opens.
  const candle = new Frame3(onLid(-1, WIDTH / 2 - 9, LID_RISE - 0.6), lid.forward, lid.right, lid.up);
  const candleBody = Round.cylinder(candle, 1.9, 6, 1.7);
  // On the lid's top while it lies on the chest; once the lid stands up the candle is on the side away from the camera or towards it, and depth decides.
  chestObj.add(candleBody, bone, pose.lid < 45 ? { on: lidSolid } : {});
  const wick = candle.at(0, 0, 6);
  if (pose.flame > 0.02) {
    chestObj.custom(wick, c => {
      const p = cam.project(wick);
      const r = 1.9 * RK * (0.45 + 0.55 * pose.flame);
      const tip = { x: p.x - 0.4 * RK, y: p.y - r * 3.4 };
      const flame = Path.builder(tip)
        .bezierTo({ x: p.x + r * 0.3, y: p.y - r * 2 }, { x: p.x + r * 1.05, y: p.y - r * 1.2 }, { x: p.x + r, y: p.y - r * 0.6 })
        .arcTo({ x: p.x, y: p.y - r * 0.6 }, r, 0, 180)
        .bezierTo({ x: p.x - r * 1.05, y: p.y - r * 1.2 }, { x: p.x - r * 0.6, y: p.y - r * 2.1 }, tip)
        .close();
      flame.draw(c, SHAPE_STYLES.soul);
    }, { on: candleBody });
  }
  if (pose.smoke > 0.02) {
    chestObj.custom(wick, c => {
      const p = cam.project(wick);
      wisp(c, { ramp: { lit: PALETTES.fleshLit, base: PALETTES.flesh, dark: PALETTES.fleshDark } }, { x: p.x, y: p.y - 1 }, { height: 12 * RK, lean: 2.4 * RK, width: 0.9, alphaTop: 0.5 * pose.smoke });
    }, { on: candleBody });
  }

  // Light leaking through the gap of a lid that has lifted a hair (or is slamming shut): a glowing line along the front edge of the rim,
  // sorted at the edge, so it shows from the front and is hidden behind the lid when the front edge is on the far side.
  if (!showInside && pose.light > 0.01 && pose.burst < 0.01) {
    const left = body.at(DEPTH / 2, -WIDTH / 2 + 1.4, BODY_H + 0.2);
    const right = body.at(DEPTH / 2, WIDTH / 2 - 1.4, BODY_H + 0.2);
    const edge = body.at(DEPTH / 2, 0, BODY_H + 0.2);
    chestObj.custom(edge, c => {
      const a = cam.project(left);
      const b = cam.project(right);
      c.save();
      c.lineCap = 'round';
      c.shadowColor = alpha(glow.ramp.base, 0.95 * pose.light);
      c.shadowBlur = 7 * RK;
      c.strokeStyle = alpha(glow.ramp.lit, Math.min(1, pose.light * 1.1));
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.restore();
    }, { on: chest });
  }

  // The burst: soul light welling out of the opening (a bloom, a column, rays) and motes thrown up, over everything.
  const mouth = body.at(-1, 0, BODY_H + 1);
  if (pose.burst > 0.01) {
    chestObj.custom(mouth, c => {
      const p = cam.project(mouth);
      soulBurst(c, glow, p, { radius: 17 * RK, height: 30 * RK, strength: pose.burst });
      if (pose.motes >= 0) soulMotes(c, glow, { x: p.x, y: p.y - 2 * RK }, pose.motes, { count: 9, height: 34 * RK, spread: 11 * RK, size: 1.7 * RK, from: 0.3, until: 0.96 });
    }, { on: chest, bias: 500 });
  }

  // The shadow follows the chest's footprint: wide facing the camera, long in depth facing east or west.
  contactShadow(ctx, WIDTH * 0.62 * RK, DEPTH * 0.62 * RK, { turned: true });
  // Light spilling on the floor round an open chest.
  const spill = Math.max(pose.burst * 0.34, pose.light * 0.2);
  if (spill > 0.01) floorGlow(ctx.ground, ctx.frame.origin, { radius: 21 * RK, color: glow.ramp.base, strength: spill });
};

// ----------------------------------------------------------------------------------------------
// Candle cluster
// ----------------------------------------------------------------------------------------------

/** Cell of a small prop (a candle cluster, a pile of bones): a 48-wide cell and a little more, room for the flames above and the shadow and pool of light below. */
export const SMALL_CELL = { width: 64, height: 60, pivot: { x: 32, y: 38 } };

/** One candle of a cluster: where it stands (world units from the centre), its size and whether it still burns. */
interface CandleSpec {
  x: number;
  y: number;
  h: number;
  r: number;
  lit: boolean;
}

/** The arrangements of a cluster, one per variant: candles of every height, burnt stubs among them. */
const CLUSTERS: CandleSpec[][] = [
  [
    { x: 0.5, y: -1.8, h: 9.6, r: 2.2, lit: true },
    { x: -5.4, y: 1.6, h: 6.4, r: 1.9, lit: true },
    { x: 5, y: 2.4, h: 4.8, r: 1.8, lit: true },
    { x: -1.4, y: 6, h: 3, r: 1.7, lit: false },
    { x: 3.6, y: -5, h: 2.2, r: 1.5, lit: false },
  ],
  [
    { x: -3.6, y: -2.4, h: 8, r: 2.1, lit: true },
    { x: 2.4, y: 0.6, h: 11, r: 2.3, lit: true },
    { x: -2.2, y: 4.2, h: 4.2, r: 1.8, lit: true },
    { x: 6.6, y: 4, h: 2.6, r: 1.6, lit: false },
    { x: -7, y: 3, h: 2, r: 1.4, lit: false },
  ],
  [
    { x: -0.4, y: -0.6, h: 7.2, r: 2.4, lit: true },
    { x: 5.6, y: -3.2, h: 5.4, r: 1.9, lit: true },
    { x: -5.8, y: -2.8, h: 3.6, r: 1.8, lit: false },
    { x: 1.4, y: 5.6, h: 2.4, r: 1.7, lit: true },
    { x: -3.6, y: 5, h: 1.6, r: 1.5, lit: false },
  ],
];

/** The tallest candle of the cluster as designed (variant 1) stands this tall with its flame. */
const CLUSTER_DESIGN_TOP = 21;
/** Scale from the design to the cluster's nominal height (a little under a third of the character): candles of a knee-high altar. */
const CK = scaleTo('candles', CLUSTER_DESIGN_TOP);

/** The candle cluster's loop (the catalog's `clips`): every flame leans and breathes on its own phase, the pool of light under them with it. 6 frames, a flicker. */
export const CANDLE_CLIPS = { flicker: { frames: 6, fps: 8, loop: true } };

/** The candle cluster's options. */
export interface CandleClusterOptions {
  /** How many of the variant's candles stand (the tallest come first). */
  candles: number;
  /** Strength of the pool of soul light on the floor (0 for none). */
  glow: number;
}

/**
 * Soul candles: a handful of pale candles of every height on one melted pool of wax, some burning with soul
 * fire and some burnt down to stubs, with drips down their sides and a faint green pool of light on the floor.
 * Round and scattered by hand, so one facing and three arrangements (variants).
 */
export const candleCluster: ScenePiece<CandleClusterOptions> = (ctx, o) => {
  const { object: parts, ground } = ctx;
  const wax = role(ctx.materials, 'bone');
  const glow = role(ctx.materials, 'glow');
  const rng = pieceRng(ctx);
  const g = worldFrame(ctx);
  const specs = CLUSTERS[ctx.variant % CLUSTERS.length].slice(0, Math.max(1, Math.round(o.candles)));
  // The loop's phase: 0 on the still look (every wave below is zero there) and frame ÷ frames on a flicker.
  const t = ctx.clip?.t ?? 0;
  contactShadow(ctx, 11 * CK, 8 * CK);
  if (o.glow > 0) floorGlow(ctx.ground, ctx.frame.origin, { radius: 21 * CK, color: glow.ramp.base, strength: o.glow * (1 + 0.16 * flutter(t, 1, 0.2) + 0.08 * flutter(t, 2, 0.6)) });
  // The wax that ran off: a pale pool on the floor with a darker rim, a lit upper-left edge and a few runs.
  const pool = floorShape(ctx.camera, ringPoints(rng, vec3(g.origin.x, g.origin.y + 0.4 * CK, 0), 12.4 * CK, 8.6 * CK, 12, 0.13));
  const poolLit = floorShape(ctx.camera, ringPoints(rng, vec3(g.origin.x - 1.2 * CK, g.origin.y - 0.4 * CK, 0), 9.4 * CK, 6.2 * CK, 10, 0.12));
  ground.custom(g.origin, c => {
    pool.fill(c, mixTone(wax.ramp.base, wax.ramp.dark, 0.5));
    poolLit.fill(c, alpha(wax.ramp.base, 0.8));
    pool.stroke(c, hairline(alpha(mixTone(wax.ramp.dark, PALETTES.ink, 0.5), 0.95), 0.8));
  }, { bias: 2 });
  // Crumbs of wax at the pool's rim.
  for (let i = 0; i < 3; i++) {
    const a = rng.float(0, Math.PI * 2);
    const at = g.at(Math.cos(a) * rng.float(11, 13) * CK, Math.sin(a) * rng.float(8.2, 9.6) * CK, 0.4);
    ground.custom(at, (c, cam) => {
      const q = cam.project(at);
      Polygon.ellipse(rng.float(0.6, 0.95) * CK, rng.float(0.4, 0.6) * CK, { cx: q.x, cy: q.y, segments: 8 }).fill(c, mixTone(wax.ramp.base, wax.ramp.dark, 0.25));
    }, { bias: 3 });
  }
  // A flame leans and breathes once or twice a loop, each candle on its own phase (the draught reaches them one after another); the small ones less.
  specs.forEach((s, i) => {
    const size = Math.max(1.1 * CK, s.r * CK * 0.78);
    const life = { lean: size * 0.8 * flutter(t, 1, i * 0.21), stretch: 1 + 0.3 * flutter(t, 2, i * 0.37 + 0.1), strength: 0.9 + 0.08 * flutter(t, 2, i * 0.37) };
    candleParts(parts, g.moved(s.x * CK, s.y * CK, 0), wax, glow, { radius: s.r * CK, height: s.h * CK, lit: s.lit, drips: s.h > 4 ? 2 : 0, rng, detail: CK, life });
  });
};

// ----------------------------------------------------------------------------------------------
// Bone pile
// ----------------------------------------------------------------------------------------------

/** The heap as designed (the skull on top of the crossed bones) stands this tall. */
const BONES_DESIGN_TOP = 12;
/** Scale from the design to the heap's nominal height: more than one skeleton's worth, low next to a person. */
const BK = scaleTo('bones', BONES_DESIGN_TOP);

/** The bone pile's options. */
export interface BonePileOptions {
  /** The skull on top of the heap. */
  skull: boolean;
  /** A stub of a soul candle stuck among the bones. */
  candle: boolean;
  /** Soul sparks in its sockets. */
  sparks: boolean;
}

/**
 * A heap of bones: long bones crossed on the floor, ribs bowed over them, a few vertebrae and knucklebones,
 * a soul candle stub among them, and a skull on top that looks along the prop's facing. The skull makes it asymmetric: eight rows, and two
 * variants (a crossed heap; a rib cage with the skull rolled aside).
 */
export const bonePile: ScenePiece<BonePileOptions> = (ctx, o) => {
  const parts = ctx.object;
  const bn = role(ctx.materials, 'bone');
  const glow = role(ctx.materials, 'glow');
  const f = ctx.frame;
  const rng = pieceRng(ctx);
  const k = BK;
  // Written at the design size: positions go through `at`, sizes through `k`.
  const at = (fw: number, sd: number, z: number) => f.at(fw * k, sd * k, z * k);
  contactShadow(ctx, 15 * k, 10.5 * k);
  // Bones lie in layers: the lower ones in the shade of the upper ones.
  const under = toned(bn, 0.34);
  const middle = toned(bn, 0.14);
  const pebble = (x: number, y: number, r: number) => parts.add(Round.ellipsoid(Frame3.facing(at(x, y, r * 0.6), rng.float(0, 3)), r * 1.3 * k, r * k, r * 0.7 * k), middle);
  if (ctx.variant === 0) {
    // Two long bones crossed, the skull on the crossing looking along the facing, ribs and small bones about.
    boneShape(parts, at(-10, -6.2, 1.6), at(10, 6.4, 1.6), under, { width: 2.7 * k, knob: 2.0 * k });
    boneShape(parts, at(-10, 6, 1.7), at(9.6, -6.4, 1.7), middle, { width: 2.5 * k, knob: 1.9 * k, bend: 2.4 * k });
    boneShape(parts, at(-4, 8.6, 1.4), at(5.4, 9.4, 1.4), middle, { width: 2.0 * k, knob: 1.6 * k });
    if (o.skull) skullParts(parts, f.moved(0.8 * k, 0, 4.8 * k).turned(-12), toned(bn, -0.1), { r: 3.9 * k, socket: RAMPS.hollow.base, glow: o.sparks ? glow : undefined });
    for (let i = 0; i < 3; i++) parts.add(Round.cylinder(Frame3.facing(at(-12.4 + i * 2.1, -3.4 - i * 1.5, 0), 0), 1.35 * k, 1.2 * k, 1.1 * k), middle);
    pebble(12, 1.8, 1.0);
    pebble(9.4, 9.6, 0.9);
    pebble(-9.8, 9.4, 0.85);
    if (o.candle) candleParts(parts, f.moved(-8.6 * k, 7.4 * k, 0), bn, glow, { radius: 1.6 * k, height: 4.4 * k, drips: 1, rng, detail: k });
  } else {
    // A rib cage on its side, a leg bone leaning on it, the skull rolled off to the front.
    for (let i = 0; i < 5; i++) {
      const radius = 5.8 - Math.abs(i - 2) * 0.6;
      const sd = 0.8 + i * 0.2;
      const pts = [0, 0.25, 0.5, 0.75, 1].map(t => {
        const a = Math.PI * t;
        return at(-8.5 + i * 3.5 + 1.4 * Math.sin(a), sd - radius * Math.cos(a), 0.9 + radius * 0.82 * Math.sin(a));
      });
      parts.add(new Tube(pts, { start: 1.3 * k, end: 1.0 * k }), i % 2 ? middle : bn);
    }
    parts.add(new Tube([at(-9, 0.8, 1.2), at(-2, 1.2, 1.4), at(7, 1.4, 1.2)], { start: 1.4 * k, end: 1.4 * k }), under);
    boneShape(parts, at(-9.6, 6.2, 1.6), at(8.4, 7.4, 1.6), under, { width: 2.6 * k, knob: 1.9 * k });
    boneShape(parts, at(3, -7.6, 2), at(10.6, -0.4, 4.6), bn, { width: 2.2 * k, knob: 1.7 * k });
    if (o.skull) skullParts(parts, f.moved(6.6 * k, 3 * k, 0.2 * k).turned(58), toned(bn, -0.1), { r: 3.6 * k, socket: RAMPS.hollow.base, glow: o.sparks ? glow : undefined });
    pebble(-12, 3, 1.0);
    pebble(-1.5, 10.6, 0.9);
    pebble(11.4, -5.2, 0.85);
    if (o.candle) candleParts(parts, f.moved(-9.4 * k, -7.6 * k, 0), bn, glow, { radius: 1.6 * k, height: 5.2 * k, drips: 1, rng, detail: k });
  }
};

// ----------------------------------------------------------------------------------------------
// Soul brazier
// ----------------------------------------------------------------------------------------------

/** The brazier's loop (the catalog's `clips`): the tongues of fire lean and swell out of step, the coals pulse and embers rise. 8 frames. */
export const BRAZIER_CLIPS = { burn: { frames: 8, fps: 10, loop: true } };

/** The soul brazier's options. */
export interface BrazierOptions {
  /** Height of the fire: 1 is a roaring one, 0.4 low embers. */
  fire: number;
  /** Strength of the pool of soul light on the floor. */
  glow: number;
}

/** Cell of the brazier: its pool of light spreads wider than the bowl. */
export const BRAZIER_CELL = { width: 80, height: 78, pivot: { x: 40, y: 52 } };

/** Plan sizes of the brazier as designed (world units): the rim's height and radius. */
const BRAZIER = { rimZ: 21.4, rim: 10.8 };
/** The brazier as designed rises this high, to the tips of its fire. */
const BRAZIER_DESIGN_TOP = 40;
/** Scale from the design to the brazier's nominal height (half the character): a bowl at about knee height. */
const BR = scaleTo('brazier', BRAZIER_DESIGN_TOP);

/**
 * An iron brazier burning soul fire: three splayed legs braced by a ring, a riveted bowl with a lipped rim and
 * two horn handles, the fire rising from glowing coals with a few wisps, and a pool of soul light on the floor.
 * Round and the same from every side, so one facing; variant 1 is the embers of a fire that is nearly out.
 */
export const soulBrazier: ScenePiece<BrazierOptions> = (ctx, o) => {
  const parts = ctx.object;
  const iron = role(ctx.materials, 'metal');
  const glow = role(ctx.materials, 'glow');
  // Written at the design size; solids and positions scale through the frame, tube widths and flat drawings by BR.
  const g = worldFrame(ctx).scaled(BR);
  const rng = pieceRng(ctx);
  const cam = ctx.camera;
  const { rimZ, rim } = BRAZIER;
  const fire = ctx.variant === 1 ? Math.min(o.fire, 0.45) : o.fire;
  // The loop's phase (0 on the still look: every wave below is zero there) and how lively this variant is (embers barely stir).
  const t = ctx.clip?.t ?? 0;
  const live = ctx.variant === 1 ? 0.45 : 1;
  contactShadow(ctx, 13 * BR, 9.5 * BR);
  floorGlow(ctx.ground, ctx.frame.origin, { radius: 28 * BR, color: glow.ramp.base, strength: o.glow * (ctx.variant === 1 ? 0.6 : 1) * (1 + 0.14 * live * flutter(t, 1, 0.3) + 0.07 * live * flutter(t, 3, 0.1)) });
  const thin: VolumeStyle = { ...iron, stroke: STROKES.detail.with({ color: alpha(iron.ramp.dark, 0.9), width: 0.45 }), edge: undefined };
  // Legs: three tubes splayed from under the bowl to pads on the floor, braced by a ring.
  for (const a of [-Math.PI * 0.5, -Math.PI * 0.5 + (Math.PI * 2) / 3, -Math.PI * 0.5 + (Math.PI * 4) / 3]) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    parts.add(new Tube([g.at(c * 4, s * 4, 13), g.at(c * 6.6, s * 6.6, 7), g.at(c * 8.6, s * 8.6, 1.1)], { start: 2.7 * BR, end: 2.1 * BR }), iron);
    parts.add(Round.ellipsoid(Frame3.facing(g.at(c * 9, s * 9, 0.7), 0), 2.2 * BR, 2.2 * BR, 0.9 * BR), iron);
  }
  const ring = visibleArc(cam, g.at(0, 0, 5.4), vec3(1, 0, 0), vec3(0, 1, 0), 7.4 * BR, 7.4 * BR, 0.25);
  if (ring.length > 1) parts.add(new Tube(ring, 1.4 * BR), thin);
  // The bowl: a lathe from a short stem to a flared lip; the rim ring and a riveted band are tubes on it.
  const bowl = Round.lathe(g, [[10.5, 2.6], [12.2, 5.6], [15, 8.7], [18.4, 10.3], [rimZ - 0.4, rim - 0.3], [rimZ, rim - 0.9]]);
  parts.add(bowl, iron);
  const band = visibleArc(cam, g.at(0, 0, 15.2), vec3(1, 0, 0), vec3(0, 1, 0), 9.1 * BR, 9.1 * BR, 0.18);
  if (band.length > 1) parts.add(new Tube(band, 1.6 * BR), thin, { on: bowl });
  const lip = visibleArc(cam, g.at(0, 0, rimZ - 0.3), vec3(1, 0, 0), vec3(0, 1, 0), (rim - 0.2) * BR, (rim - 0.2) * BR, 0.3);
  if (lip.length > 1) parts.add(new Tube(lip, 2.1 * BR), { ...iron, ramp: { ...iron.ramp, base: iron.ramp.lit }, stroke: thin.stroke }, { on: bowl });
  // Rivets along the band.
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.12 + 0.76 * (i / 6));
    parts.add(Round.ellipsoid(Frame3.facing(g.at(Math.cos(a) * 9.4, Math.sin(a) * 9.4, 15.2), 0), 0.75 * BR, 0.75 * BR, 0.75 * BR), { ...iron, ramp: { ...iron.ramp, base: iron.ramp.lit } }, { on: bowl });
  }
  // Horn handles: out from the rim on both sides, curling up.
  for (const side of [-1, 1]) {
    parts.add(new Tube([g.at(side * (rim - 0.6), 0.6, rimZ - 3), g.at(side * (rim + 2.6), 0.4, rimZ - 4.4), g.at(side * (rim + 4.2), 0.2, rimZ - 1.6)], { start: 2.2 * BR, end: 1.5 * BR }), iron, { on: bowl });
  }
  // The interior: a dark hollow under a lipped rim, glowing coals, then the fire over them.
  const centre = g.at(0, 0, rimZ);
  const ky = Math.sin((cam.tilt * Math.PI) / 180);
  const inner = (rim - 1.2) * BR;
  const hollow = mixTone(iron.ramp.dark, PALETTES.ink, 0.65);
  parts.custom(centre, (c, v) => {
    const p = v.project(centre);
    Polygon.ellipse(inner, inner * ky, { cx: p.x, cy: p.y, segments: 36 }).fill(c, hollow);
    const coals = Polygon.ellipse(inner * 0.76, inner * 0.76 * ky, { cx: p.x, cy: p.y + 0.4 * BR, segments: 32 });
    const pulse = Math.min(1.25, 1 + 0.12 * live * flutter(t, 2, 0.2));
    coals.fill(c, coals.createGradient(c, { type: 'radial', center: { x: p.x, y: p.y + 0.4 * BR }, r1: 0, r2: inner * 0.78, stops: [[0, alpha(glow.ramp.lit, Math.min(1, 0.75 * pulse))], [0.3, alpha(glow.ramp.base, Math.min(1, 0.62 * pulse))], [0.75, alpha(glow.ramp.dark, 0.7)], [1, alpha(glow.ramp.dark, 0.1)]] }));
    // Embers: a few bright flecks on the coals.
    for (let i = 0; i < 9; i++) {
      const a = rng.float(0, Math.PI * 2);
      const d = rng.float(0.1, 0.78) * inner;
      Polygon.circle(rng.float(0.3, 0.6) * BR, { cx: p.x + Math.cos(a) * d, cy: p.y + 0.4 * BR + Math.sin(a) * d * ky, segments: 8 }).fill(c, glow.ramp.lit);
    }
    // The inner wall's lit lip, upper left.
    const arc = Path.arc({ x: p.x, y: p.y }, inner, 190, 300).scale(1, ky, { x: p.x, y: p.y });
    arc.stroke(c, hairline(alpha(iron.ramp.lit, 0.85), 0.9));
  }, { on: bowl });
  // The fire: a soft light over the bowl, then tongues of different sizes (the tallest in the middle) leaning
  // outwards, their bellies just inside the rim so the front lip hides their roots.
  const heart = g.at(0, 0, rimZ + 8 * fire);
  parts.custom(heart, (c, v) => {
    const p = v.project(heart);
    const r = 17 * BR * (0.55 + 0.45 * fire) * (1 + 0.07 * live * flutter(t, 1, 0.5));
    const grad = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    grad.addColorStop(0, alpha(glow.ramp.base, 0.32 * (1 + 0.16 * live * flutter(t, 2, 0.1))));
    grad.addColorStop(1, alpha(glow.ramp.base, 0));
    c.fillStyle = grad;
    c.beginPath();
    c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.fill();
  }, { on: bowl });
  const tongues: { x: number; y: number; size: number; lean: number; halo?: number }[] = [
    { x: -2, y: -3.4, size: 3.2, lean: -0.3 },
    { x: 2.4, y: -3, size: 3, lean: 0.3 },
    { x: -4.4, y: 0.2, size: 3.7, lean: -0.55 },
    { x: 4.3, y: 0.2, size: 3.9, lean: 0.6 },
    { x: 0, y: 0.4, size: 5, lean: 0.15, halo: 8 },
    { x: 0.8, y: 3.4, size: 2.5, lean: 0.2 },
  ];
  // Each tongue swells and leans on its own phase (the flame runs round the bowl) and once or twice a loop.
  tongues.forEach((tg, i) => {
    const size = tg.size * (0.4 + 0.6 * fire) * (1 + 0.2 * live * flutter(t, 1 + (i % 2), i / 6));
    const belly = g.at(tg.x * 0.85, tg.y * 0.8, rimZ + 0.6 + size * 0.5);
    const lean = (tg.lean + 0.7 * live * flutter(t, 1, i / 6 + 0.25)) * size * BR;
    parts.custom(belly, (c, v) => {
      const p = v.project(belly);
      paintFlame(c, glow, p.x, p.y, size * BR, { lean, halo: tg.halo ? tg.halo * fire * BR * (1 + 0.2 * live * flutter(t, 2, 0.4)) : 0, strength: 0.96 });
    }, { on: bowl });
  });
  // A few wisps rising off the fire.
  if (fire > 0.5) {
    const top = g.at(0, 0, rimZ + 17);
    parts.custom(top, (c, v) => {
      const p = v.project(top);
      wisp(c, glow, { x: p.x - 4 * BR, y: p.y + 3 * BR }, { height: 9 * BR * (1 + 0.12 * flutter(t, 1, 0.1)), lean: (-2 + 1.2 * flutter(t, 1, 0.35)) * BR, width: 0.9, alphaTop: 0.5 });
      wisp(c, glow, { x: p.x + 3.5 * BR, y: p.y + 2 * BR }, { height: 8 * BR * (1 + 0.12 * flutter(t, 1, 0.6)), lean: (2.4 + 1.2 * flutter(t, 1, 0.8)) * BR, width: 0.8, alphaTop: 0.45 });
    }, { on: bowl });
    // Embers that lift off the fire and die, each in its own stretch of the loop (none on its first and last frames, so it closes).
    if (t > 0) {
      parts.custom(top, (c, v) => {
        const p = v.project(top);
        soulMotes(c, glow, { x: p.x, y: p.y + 6 * BR }, t, { count: 6, height: 22 * BR, spread: 5.5 * BR, size: 1.5, from: 0.02, until: 0.98, strength: 0.9 });
      }, { on: bowl });
    }
  }
};

// ----------------------------------------------------------------------------------------------
// Lantern post
// ----------------------------------------------------------------------------------------------

/** Cell of the lantern post: a tall, thin prop whose arm reaches to either side and whose light pools on the floor beside it. */
export const POST_CELL = { width: 112, height: 164, pivot: { x: 56, y: 120 } };

/**
 * The post's footing, arm and lantern are drawn this many times the size they were designed at (a pole 58 tall with a
 * lantern 11 tall), in proportion to the character: a lantern about a fifth of a person's height on a pole well
 * over a person's. The pole itself is as tall as its option says, so the details do not grow with it.
 */
const PK = (1.5 * CHARACTER) / 80;
/** The finial, the arm and the cap stand this high above the pole's top, as designed. */
const POST_ABOVE_POLE = 5.4;
/** Default height of the pole, to where the arm leaves it: puts the finial's tip at the post's nominal height (taller than a person, about 1.4 of one). */
export const POST_POLE = propHeight('post') - POST_ABOVE_POLE * PK;

/** The lantern post's loop (the catalog's `clips`): the flame in the cage breathes and the light on the floor with it. 6 frames. */
export const POST_CLIPS = { flicker: { frames: 6, fps: 8, loop: true } };

/** The lantern post's options. */
export interface LanternPostOptions {
  /** Height of the pole in world units, to where the arm leaves it. */
  height: number;
  /** Strength of the pool of soul light on the floor. */
  glow: number;
}

/**
 * Lantern post: a stone footing, a tapering iron pole with collars, a scrolled arm that reaches out to the
 * object's right and a soul-fire lantern hanging from it on a chain. The arm makes it asymmetric: four rows,
 * the lantern at its left, behind the pole, at its right and in front of it.
 */
export const lanternPost: ScenePiece<LanternPostOptions> = (ctx, o) => {
  const parts = ctx.object;
  const iron = role(ctx.materials, 'metal');
  const stone = role(ctx.materials, 'stone');
  const glow = role(ctx.materials, 'glow');
  // Written at the design size (a pole 58 tall); solids and positions scale through the frame, tube widths and flat drawings by PK.
  const f = ctx.frame.scaled(PK);
  const H = o.height / PK;
  const reach = 13;
  const lamp = f.moved(0, reach, 0);
  const thin: VolumeStyle = { ...iron, stroke: STROKES.detail.with({ color: alpha(iron.ramp.dark, 0.9), width: 0.45 }), edge: undefined };
  const lit: VolumeStyle = { ...iron, ramp: { ...iron.ramp, base: iron.ramp.lit }, stroke: thin.stroke, edge: undefined };
  // The loop's phase: 0 on the still look (every wave below is zero there).
  const t = ctx.clip?.t ?? 0;
  contactShadow(ctx, 8.5 * PK, 6.4 * PK, { at: f.at(0.8, 0.8, 0) });
  floorGlow(ctx.ground, f.at(0, reach, 0), { radius: 20 * PK, color: glow.ramp.base, strength: o.glow * (1 + 0.22 * flutter(t, 1, 0.25) + 0.1 * flutter(t, 2, 0.7)) });
  // Stone footing in two steps, then the pole.
  const foot = Solid.box(f, 9.6, 9.6, 3.4);
  parts.add(foot, stone);
  const step = Solid.box(f.moved(0, 0, 3.4), 6.6, 6.6, 2.2);
  parts.add(step, stone, { on: foot });
  const pole = Round.lathe(f.moved(0, 0, 5.6), [[0, 2.6], [1.6, 2.1], [4, 1.8], [H * 0.5, 1.5], [H - 5.6, 1.15]]);
  parts.add(pole, iron);
  for (const z of [7.2, H * 0.45, H - 2.6]) parts.add(Round.cylinder(f.moved(0, 0, z), 2.35, 1.3, 2.1), lit, { on: pole });
  parts.add(Round.ellipsoid(f.moved(0, 0, H + 0.4), 1.5, 1.5, 1.7), iron, { on: pole });
  parts.add(Round.cylinder(f.moved(0, 0, H + 1.8), 0.6, 3.6, 0.1), iron, { on: pole });
  // The arm: up out of the pole, over, and a brace under it.
  const arm = new Tube([f.at(0, 0, H - 2), f.at(0, 1.8, H + 1.8), f.at(0, 6.4, H + 3.6), f.at(0, 11, H + 2.6), f.at(0, reach, H + 0.4)], { start: 2.2 * PK, end: 1.5 * PK });
  parts.add(arm, iron, { on: pole });
  parts.add(new Tube([f.at(0, 1.2, H - 13), f.at(0, 5.4, H - 7.6), f.at(0, 9.6, H + 0.4)], 1.1 * PK), thin, { on: arm });
  parts.add(Round.ellipsoid(f.moved(0, reach, H + 0.6), 1.2, 1.2, 1.2), iron, { on: arm });
  // The chain and the lantern: a cage of four posts between a base plate and a peaked cap, the flame inside.
  const top = H - 3.4;
  const bot = top - 11;
  parts.add(new Tube([f.at(0, reach, H + 0.2), f.at(0.4, reach, H - 1.6), f.at(0, reach, top + 3.2)], 0.9 * PK), thin, { on: arm });
  parts.add(Round.cylinder(lamp.moved(0, 0, top), 5, 3.2, 0.6), iron);
  parts.add(Round.cylinder(lamp.moved(0, 0, top + 3), 1.2, 1.2, 0.9), lit);
  const plate = Solid.box(lamp.moved(0, 0, bot - 1.1), 7.4, 7.4, 1.3);
  parts.add(plate, iron);
  const flameAt = lamp.at(0, 0, bot + 3.2);
  parts.custom(lamp.at(0, 0, bot + 5), (c, v) => {
    const p = v.project(flameAt);
    // The glow behind the bars: a soft disc, then the flame.
    const breath = 1 + 0.1 * flutter(t, 2, 0.15);
    const halo = Polygon.circle(8 * PK * breath, { cx: p.x, cy: p.y - 3 * PK, segments: 24 });
    halo.fill(c, halo.createGradient(c, { type: 'radial', center: { x: p.x, y: p.y - 3 * PK }, r1: 0, r2: 8 * PK * breath, stops: [[0, alpha(glow.ramp.base, 0.6 * Math.min(1.3, 1 + 0.22 * flutter(t, 1, 0.4)))], [1, alpha(glow.ramp.base, 0)]] }));
    liveFlame(c, glow, { x: p.x, y: p.y + 0.6 * PK }, 2.6 * PK, { lean: 2.6 * PK * 0.65 * flutter(t, 1, 0.1), stretch: 1 + 0.26 * flutter(t, 2, 0.5), strength: 0.95 });
  });
  for (const [x, y] of [[-3.1, -3.1], [3.1, -3.1], [-3.1, 3.1], [3.1, 3.1]]) parts.add(Round.cylinder(lamp.moved(x, y, bot), 0.7, top - bot), iron);
};

// ----------------------------------------------------------------------------------------------
// Coffin
// ----------------------------------------------------------------------------------------------

/** Cell of the coffin: about a character long, so it is wider than a cell when it lies across the screen, and the lid slides off past its foot. */
export const COFFIN_CELL = { width: 176, height: 140, pivot: { x: 88, y: 90 } };

/** Plan of the coffin in (forward, side): the head end is the narrow one at the back, the shoulders the widest, the feet at the front. */
const COFFIN_PLAN: Point[] = [{ x: -26, y: -6.8 }, { x: -15, y: -10.8 }, { x: 26, y: -5 }, { x: 26, y: 5 }, { x: -15, y: 10.8 }, { x: -26, y: 6.8 }];
const COFFIN_H = 11;
/** The coffin as designed, 52 long, stands this tall to the top of its lid's inlay. */
const COFFIN_DESIGN_TOP = COFFIN_H + 2.6 + 1.3;
/** Scale from the design to the coffin's nominal height: it comes out about as long as the character is tall (1 × 2 cells: 48 × 96). */
const CF = scaleTo('coffin', COFFIN_DESIGN_TOP);

/** The coffin's options. */
export interface CoffinOptions {
  /** How far the lid has slid off (0 closed, 1 about a third of its length), when the variant is the open one. */
  ajar: number;
}

/** A cross for the lid, in decal space (x right, y down): the crossbar near the head end, which is up the screen when it faces the camera. */
function lidCross(): Shape {
  const v = Polygon.rect(1.9, 17, { cx: 0, cy: 0.5, radius: 0.5 });
  const h = Polygon.rect(9, 1.9, { cx: 0, cy: -4.4, radius: 0.5 });
  return v.union(h);
}

/**
 * Coffin: a hexagonal box of dark wood with a lid, iron corner straps and nails, a bone cross inlaid on the lid
 * and a soul ward. 1 × 2 cells. Variant 0 is shut; variant 1 has the lid slid off the head end, showing the dark
 * inside, the occupant's skull and bones and a glow of soul fire. Four rows (the head end tells front from back).
 */
export const coffin: ScenePiece<CoffinOptions> = (ctx, o) => {
  const parts = ctx.object;
  const wood = role(ctx.materials, 'darkwood');
  const iron = role(ctx.materials, 'metal');
  const bn = role(ctx.materials, 'bone');
  const glow = role(ctx.materials, 'glow');
  const open = ctx.variant === 1;
  // The lid slides past the foot only as far as the footprint leaves room (two cells long, in design units), and the
  // coffin moves back by half the slide, so coffin and lid together stay inside its 1 × 2 cells.
  const room = Math.max(0, (2 * Math.min(ctx.grid.cell.x, ctx.grid.cell.y)) / CF - 2 * COFFIN_PLAN[2].x - 1);
  const slide = open ? Math.min(17 * o.ajar, room) : 0;
  // Written at the design size; solids and positions scale through the frame, tube widths, decal shapes and flat drawings by CF.
  const f = ctx.frame.scaled(CF).moved(-slide / 2, 0, 0);
  const sized = (shape: Shape): Shape => shape.scale(CF, CF, { x: 0, y: 0 });
  // The shadow lies along the coffin: long in depth facing the camera or away from it (forward in depth, `turn.y`),
  // long across the screen facing east or west (forward across it, `turn.x`), where it covers 2 × 1 cells.
  const turn = facingWeights(ctx);
  contactShadow(ctx, (25 * turn.x + 14.5 * turn.y) * CF, (25 * turn.y + 14.5 * turn.x) * CF, { at: f.at(0.8, 0, 0) });
  const body = Solid.extrude(f, COFFIN_PLAN, COFFIN_H);
  parts.add(body, wood);
  const shape = Polygon.fromPoints(COFFIN_PLAN);
  // A decal on the top reads as a viewer looking at it: x to the right (the side axis), y down (forward).
  const onTop = (points: Point[]) => Polygon.fromPoints(points.map(q => ({ x: q.y, y: q.x })));
  // Iron handles on the long sides: bails between two staples, on the box under the lid.
  const half = (x: number) => (x < -15 ? 6.8 + ((x + 26) / 11) * 4 : 10.8 - ((x + 15) / 41) * 5.8);
  for (const side of [-1, 1]) {
    for (const x of [-7, 9]) {
      const w = half(x);
      const bail = new Tube([f.at(x - 2.4, side * (w + 0.2), 5.6), f.at(x, side * (w + 1.5), 4.8), f.at(x + 2.4, side * (w + 0.2), 5.6)], 1.0 * CF);
      parts.add(bail, { ...iron, stroke: STROKES.detail.with({ color: alpha(iron.ramp.dark, 0.9), width: 0.4 }) });
    }
  }
  // The lid: a plank plate a little wider than the box, a raised panel on it, iron straps and nails.
  const lf = f.moved(slide, 0, COFFIN_H).turned(open ? 7 * o.ajar : 0);
  let inside: ReturnType<typeof Decal.onFace> | undefined;
  if (open) {
    // The inside, seen through the opening: a hollow lined in dark, with the occupant on it.
    inside = Decal.onFace(f, 'top', vec3(0, 0, COFFIN_H), sized(onTop(COFFIN_PLAN).offset(-2)));
    parts.add(inside, { fill: RAMPS.hollow.base, stroke: hairline(alpha(wood.ramp.lit, 0.7), 0.7) }, { on: body });
    const glowHere = f.at(-14, 0, COFFIN_H);
    parts.custom(glowHere, (c, v) => {
      const p = v.project(glowHere);
      const r = 9 * CF;
      const grad = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0, alpha(glow.ramp.base, 0.5));
      grad.addColorStop(1, alpha(glow.ramp.base, 0));
      c.fillStyle = grad;
      c.beginPath();
      c.ellipse(p.x, p.y, r, r * 0.75, 0, 0, Math.PI * 2);
      c.fill();
    }, { on: inside });
    // Skull and the top of a rib cage, flat on the lining.
    const skullShape = Polygon.ellipse(3.6, 3.4, { cx: 0, cy: -0.6, segments: 24 }).union(Polygon.rect(3.6, 2.6, { cx: 0, cy: 2.6, radius: 0.9 }));
    const sockets = Polygon.ellipse(0.95, 1, { cx: -1.5, cy: -0.9, segments: 12 }).union(Polygon.ellipse(0.95, 1, { cx: 1.5, cy: -0.9, segments: 12 }));
    const skullDecal = Decal.onFace(f, 'top', vec3(-18.6, 0, COFFIN_H), sized(skullShape.subtract(sockets)));
    parts.add(skullDecal, { fill: bn.ramp.base, stroke: hairline(alpha(bn.ramp.dark, 0.9), 0.5) }, { on: inside });
    parts.add(Decal.onFace(f, 'top', vec3(-18.6, 0, COFFIN_H), sized(sockets.offset(-0.2))), { fill: glow.ramp.lit, shadow: GLOWS.soulFaint }, { on: skullDecal });
    for (let i = 0; i < 3; i++) {
      const bar = Polygon.rect(9.4 - i * 0.9, 1.1, { radius: 0.5, cx: 0, cy: 0 });
      parts.add(Decal.onFace(f, 'top', vec3(-12.6 + i * 3, 0, COFFIN_H), sized(bar)), { fill: alpha(bn.ramp.base, 0.95) }, { on: inside });
    }
  }
  const lidHost = inside ?? body;
  const lidShape = shape.clone().offset(0.9);
  const lid = Solid.extrude(lf, lidShape, 2.6);
  parts.add(lid, wood, { on: lidHost });
  const panel = Solid.extrude(lf.moved(0, 0, 2.6), shape.clone().offset(-3.4), 1.3);
  parts.add(panel, toned(wood, -0.18), { on: lid });
  // Iron straps across the lid near both ends, and nails at the corners.
  for (const x of [-17.5, 17]) {
    const w = x < 0 ? 17.5 : 11;
    parts.add(Solid.box(lf.moved(x, 0, 2.5), 2.2, w * 1.0, 1.0), iron, { on: panel });
  }
  for (const [x, y] of [[-22, -4.6], [-22, 4.6], [22.5, -3.6], [22.5, 3.6], [-9.5, -9.2], [-9.5, 9.2], [12, -7], [12, 7]]) {
    parts.add(Round.ellipsoid(lf.moved(x, y, 2.4), 0.7, 0.7, 0.55), { ...iron, ramp: { ...iron.ramp, base: iron.ramp.lit } }, { on: lid });
  }
  // The inlay: a bone cross, and a soul ward at the foot.
  const cross = Decal.onFace(lf, 'top', vec3(-3.6, 0, 3.9), sized(lidCross()));
  parts.add(cross, SHAPE_STYLES.bone, { on: panel });
  parts.add(Decal.onFace(lf, 'top', vec3(12.4, 0, 3.9), sized(runeShape().scale(0.9))), soulMark(glow), { on: panel });
};
