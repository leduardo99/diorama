/**
 * Helpers shared by the props and decals of the scenery kit (`props.ts`, `tree.ts`, `decals.ts`).
 * Nothing here names a theme material: parts take the `VolumeStyle` a role resolved to.
 *
 * What a prop does through these helpers:
 * - the contact shadow and the pool of light on the floor go into `ctx.ground`, which the engine draws before
 *   the parts and their contour, so they lie under every part from every facing and never cross the ink line;
 * - small drawn things that belong to the prop (a flame, a glow, a wisp) are `object.custom` drawings
 *   sorted at a world point, with `on` when they must lie over their host from every side;
 * - bones, candles and the skull are built here once, so the bone pile, the coffin and the candle
 *   cluster share one hand.
 *
 * A piece is always built at world (0, 0, 0), whatever the cell it is laid in, so helpers default to the
 * frame's origin and never need a position of the placement.
 */

import { Path, Polygon, alpha, type Point, type Shape } from '@core/draw';
import type { Rng } from '@core';
import { Blob, Decal, Frame3, Round, Tube, groundShadow, vec3, type Camera, type Placed, type PieceContext, type StageObject, type Vec3, type VolumeStyle } from '@core/volume';
import { GLOWS, PALETTES } from '../theme';
import { SPACE } from '../space';
import { paintEmber } from '../gear/fire';
import { clamp01, easeOut, seg } from './motion';
import { glowFlame, mixTone } from './util';

// ----------------------------------------------------------------------------------------------
// Scale: every prop is sized against the character (guide 04 §3.3)
// ----------------------------------------------------------------------------------------------

/** Height of the project's standing character in world units (`SPACE.scale.character`): what every prop is measured against. */
export const CHARACTER = SPACE.scale.character;

/**
 * Nominal heights of the kit's props, to the top of the highest part, as multiples of the character (so a taller or
 * shorter cast rescales the kit). The catalog's `height` and each piece's scale come from these: a tombstone is about
 * 0.6 of a person, a lantern post taller than one, a dead tree two to three times.
 */
export const PROP_HEIGHT = {
  tombstone: 0.63,
  reliquary: 0.53,
  candles: 0.3,
  bones: 0.19,
  brazier: 0.5,
  post: 1.42,
  tree: 2.5,
  coffin: 0.3,
  /** The lever: its pedestal and plates are waist high, the handle's top (with the arm up) a little above. */
  lever: 0.5,
  /** A funerary urn: knee high, as big as a person can carry in both arms. */
  urn: 0.4,
} as const;

/** World units of a prop's nominal height (`PROP_HEIGHT` × the character). */
export const propHeight = (key: keyof typeof PROP_HEIGHT): number => Math.round(PROP_HEIGHT[key] * CHARACTER * 100) / 100;

/**
 * The scale that makes a prop drawn at a design size (`designed` world units tall, as its numbers are written) stand
 * as tall as its nominal height. Pieces keep their hand-tuned proportions and are drawn through `ctx.frame.scaled(k)`.
 */
export const scaleTo = (key: keyof typeof PROP_HEIGHT, designed: number): number => propHeight(key) / designed;

/**
 * How much the prop's forward axis lies across the screen (`x`, east or west) and in depth (`y`, towards or
 * away from the camera), from its facing (`ctx.yaw`): 0 or 1 for the four main facings, blended on the diagonals
 * of eight. A shadow or a plan that is longer along one axis than the other turns with the facing through these.
 */
export function facingWeights(ctx: Pick<PieceContext, 'yaw'>): { x: number; y: number } {
  return { x: Math.abs(Math.cos(ctx.yaw)), y: Math.abs(Math.sin(ctx.yaw)) };
}

/**
 * Contact shadow under a prop: an ellipse of radii `rx`, `ry` (world units) at `at` (default the placement's
 * centre), drawn into `ctx.ground`. Radii are across the screen (`rx`) and in depth (`ry`) unless `turned`: then
 * they follow the prop's own axes, `rx` across its side and `ry` along its forward, and the ellipse turns with the
 * facing (`ctx.yaw`: a chest wider than it is deep casts a shadow that is wide facing the camera and long in depth
 * facing east or west).
 */
export function contactShadow(ctx: PieceContext, rx: number, ry: number, o: { at?: Vec3; fill?: string; turned?: boolean } = {}): void {
  const at = o.at ?? ctx.frame.origin;
  // The facing relative to the camera-facing one (yaw π/2), in radians.
  const rotation = o.turned ? ctx.yaw - Math.PI / 2 : 0;
  const shape = groundShadow(ctx.camera, vec3(at.x, at.y, 0), rx, ry, rotation);
  ctx.ground.custom(vec3(at.x, at.y, 0), c => shape.fill(c, o.fill ?? alpha(PALETTES.ink, 0.35)));
}

/** How alive a flame is in one frame of a loop: the lean of its tip (px), its length (1 as it is drawn still) and the strength of its halo. */
export interface FlameLife {
  lean?: number;
  stretch?: number;
  strength?: number;
}

/**
 * A soul flame (`glowFlame`'s teardrop with a pale core and a halo) in motion: the tip leans by `lean` px, the flame is
 * `stretch` times as long and its halo has `strength`. With no life it is exactly the still flame, so frame 0 of a
 * flicker is the prop's still look.
 */
export function liveFlame(c: CanvasRenderingContext2D, glow: VolumeStyle, at: Point, size: number, life: FlameLife = {}): void {
  const { lean = 0, stretch = 1, strength = 0.9 } = life;
  if (lean === 0 && stretch === 1) return glowFlame(c, glow, at, size, strength);
  const r = glow.ramp;
  // The same belly and tip as `glowFlame`; the tip is moved (a skewed triangle) and lengthened from the belly's top.
  const base = at.y - size * 0.6;
  const belly = Polygon.circle(size, { cx: at.x, cy: at.y, segments: 20 });
  const tip = Polygon.fromPoints([{ x: at.x - size * 0.85, y: base }, { x: at.x + lean, y: base - size * 2.6 * stretch }, { x: at.x + size * 0.85, y: base }]);
  belly.union(tip).roundCorners(size * 0.4).draw(c, { fill: r.base, celShade: { shade: r.dark, lightPivot: 'bottom', litScale: 0.7 }, shadow: { color: alpha(r.base, strength), x: 0, y: 0, blur: size * 6 } });
  Polygon.circle(size * 0.45, { cx: at.x + lean * 0.12, cy: at.y - size * 0.2, segments: 12 }).fill(c, r.lit);
}

/** A soul flame (the kit's teardrop, with a pale core and a halo) whose belly stands at `at`, sorted over `host`; `life` animates it. */
export function soulFlame(object: StageObject, glow: VolumeStyle, at: Vec3, size: number, o: { host?: Placed; strength?: number; life?: FlameLife } = {}): void {
  object.custom(at, (c, cam) => liveFlame(c, glow, cam.project(at), size, { strength: o.strength ?? 0.9, ...o.life }), o.host ? { on: o.host } : {});
}

/** A thin wisp of soul rising from a point: a tapering stroke that leans and fades. `t` in px. */
export function wisp(c: CanvasRenderingContext2D, glow: VolumeStyle, from: Point, o: { height: number; lean: number; width?: number; alphaTop?: number }): void {
  const w = o.width ?? 1.1;
  const pts = [from, { x: from.x + o.lean * 0.3, y: from.y - o.height * 0.35 }, { x: from.x - o.lean * 0.25, y: from.y - o.height * 0.7 }, { x: from.x + o.lean, y: from.y - o.height }];
  Path.spline(pts, { style: 'smooth' }).toShape({ width: { start: w, end: 0.2 }, cap: 'round' }).fill(c, alpha(glow.ramp.lit, o.alphaTop ?? 0.55));
}

/** A small tonal copy of a material: `t` of the way from its base to its dark (t > 0) or lit (t < 0) end. Lines stay the material's. */
export function toned(m: VolumeStyle, t: number): VolumeStyle {
  const toward = (c: string) => mixTone(c, t > 0 ? m.ramp.dark : m.ramp.lit, Math.abs(t));
  return { ...m, ramp: { lit: toward(m.ramp.lit), base: toward(m.ramp.base), dark: toward(m.ramp.dark) } };
}

// ----------------------------------------------------------------------------------------------
// Bones
// ----------------------------------------------------------------------------------------------

/**
 * A long bone from `a` to `b` lying (or leaning) wherever: a shaft with two pairs of knobs at its ends,
 * painted as one mass so the joints read as part of the bone. `width` is the shaft's full width; the
 * knobs follow it. Returns the part (so something can rest `on` it).
 */
export function bone(object: StageObject, a: Vec3, b: Vec3, style: VolumeStyle, o: { width?: number; knob?: number; on?: Placed; bend?: number } = {}): Blob {
  const width = o.width ?? 2.3;
  const knob = o.knob ?? width * 0.72;
  const mid = vec3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2 + (o.bend ?? 0));
  const shaft = new Tube([a, mid, b], { start: width * 1.05, end: width });
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Each end carries a big knob and a smaller one beside it (a head and a condyle).
  const side = { x: -dy / len, y: dx / len };
  const end = (p: Vec3, sign: number) => [
    Round.ellipsoid(Frame3.facing(vec3(p.x + side.x * knob * 0.5 * sign, p.y + side.y * knob * 0.5 * sign, p.z), 0), knob, knob * 0.9, knob * 0.85),
    Round.ellipsoid(Frame3.facing(vec3(p.x - side.x * knob * 0.55 * sign, p.y - side.y * knob * 0.55 * sign, p.z), 0), knob * 0.78, knob * 0.7, knob * 0.7),
  ];
  const part = new Blob([shaft, ...end(a, 1), ...end(b, -1)]);
  object.add(part, style, o.on ? { on: o.on } : {});
  return part;
}

/**
 * A skull standing on the floor, turned by `frame` (its face looks along `forward`): cranium, cheekbones and
 * jaw as one mass, hollow sockets with an optional soul spark, a nose notch and a row of teeth. `r` is the
 * cranium's radius; `socket` is the colour of the hollows. Returns the mass (for `on`).
 */
export function skull(object: StageObject, g: Frame3, bone: VolumeStyle, o: { r: number; socket: string; glow?: VolumeStyle; on?: Placed }): Blob {
  const { r } = o;
  const cranium = Round.ellipsoid(g.moved(-r * 0.18, 0, r * 0.95), r * 1.02, r * 0.88, r * 0.92);
  const face = Round.ellipsoid(g.moved(r * 0.5, 0, r * 0.55), r * 0.62, r * 0.7, r * 0.62);
  const jaw = Round.ellipsoid(g.moved(r * 0.62, 0, r * 0.22), r * 0.58, r * 0.56, r * 0.28);
  const mass = new Blob([cranium, face, jaw]);
  object.add(mass, bone, o.on ? { on: o.on } : {});
  // The face turns with the frame: sockets and teeth are decals on a plane in front of it.
  const faceX = r * 1.06;
  for (const side of [-1, 1]) {
    const d = Decal.onFace(g, 'front', vec3(faceX, side * r * 0.36, r * 0.78), Polygon.ellipse(r * 0.24, r * 0.27, { segments: 14 }));
    object.add(d, { fill: o.socket }, { on: mass });
    if (o.glow) object.add(Decal.onFace(g, 'front', vec3(faceX + 0.05, side * r * 0.36, r * 0.74), Polygon.circle(r * 0.1, { segments: 10 })), { fill: o.glow.ramp.lit, shadow: GLOWS.soulFaint }, { on: d });
  }
  object.add(Decal.onFace(g, 'front', vec3(faceX, 0, r * 0.52), Polygon.triangle(r * 0.18, r * 0.22)), { fill: o.socket }, { on: mass });
  object.add(Decal.onFace(g, 'front', vec3(r * 1.1, 0, r * 0.28), Polygon.rect(r * 0.72, r * 0.16, { radius: r * 0.05 })), { fill: alpha(PALETTES.ink, 0.5) }, { on: mass });
  return mass;
}

// ----------------------------------------------------------------------------------------------
// Candles
// ----------------------------------------------------------------------------------------------

/** What `candle` builds. */
export interface CandleOptions {
  radius: number;
  height: number;
  /** Burning candles get a soul flame; stubs do not. */
  lit?: boolean;
  /** The part under it (`on`). */
  host?: Placed;
  /** Drips down the front: how many. */
  drips?: number;
  rng?: Rng;
  /** Scale of the absolute details (the wax foot, the drips, the wick, the flame) for a candle drawn bigger or smaller than designed. Default 1. */
  detail?: number;
  /** The flame in motion (a flicker's frame); none is the flame as drawn still. */
  life?: FlameLife;
}

/**
 * A soul candle standing at the frame's origin: a pale body that narrows a little towards the top, a wax
 * foot, drips and a wick; a burning one has a flame. Returns the body.
 */
export function candle(object: StageObject, g: Frame3, wax: VolumeStyle, glow: VolumeStyle, o: CandleOptions): Round {
  const { radius: r, height: h } = o;
  const d = o.detail ?? 1;
  const foot = Round.cylinder(g, r * 1.28, Math.min(1.1 * d, h * 0.3), r * 1.05);
  object.add(foot, wax, o.host ? { on: o.host } : {});
  const body = Round.cylinder(g, r, h, r * 0.86);
  object.add(body, wax, { on: foot });
  const rng = o.rng;
  // Drips: pale tongues of wax that crept down the side facing the camera (world +y).
  const here = (x: number, y: number, z: number) => vec3(g.origin.x + x, g.origin.y + y, g.origin.z + z);
  for (let i = 0; i < (o.drips ?? 0); i++) {
    const a = rng ? rng.float(-0.8, 0.8) : (i - 0.5) * 0.9;
    const len = rng ? rng.float(h * 0.25, h * 0.5) : h * 0.35;
    const x = r * 0.9 * Math.sin(a);
    const y = r * 0.9 * Math.cos(a);
    const top = h * 0.96;
    object.add(new Tube([here(x, y, top), here(x, y, top - len * 0.6), here(x, y, top - len)], { start: 0.9 * d, end: 1.5 * d }), { ramp: { lit: wax.ramp.lit, base: mixTone(wax.ramp.lit, wax.ramp.base, 0.4), dark: wax.ramp.base }, form: { highlight: false } }, { on: body });
  }
  const wick = g.at(0, 0, h + 0.2 * d);
  object.custom(wick, (c, cam) => {
    const p = cam.project(wick);
    Polygon.rect(0.55 * d, 1.1 * d, { cx: p.x, cy: p.y - 0.3 * d }).fill(c, wax.ramp.dark);
  }, { on: body });
  if (o.lit !== false) soulFlame(object, glow, g.at(0, 0, h + 1.3 * d), Math.max(1.1 * d, r * 0.78), { host: body, life: o.life });
  return body;
}

/** Points of an irregular ring on the floor around `at`: used for wax pools and the like (world units). */
export function ringPoints(rng: Rng, at: Vec3, rx: number, ry: number, n = 9, jitter = 0.18): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + rng.float(-jitter, jitter);
    return vec3(at.x + Math.cos(a) * rx * k, at.y + Math.sin(a) * ry * k, at.z);
  });
}

/** A shape on the floor from world points (x, y at z = 0 of the ground), smoothed. */
export function floorShape(cam: Camera, points: Vec3[]): Shape {
  return Polygon.fromPoints(points.map(p => cam.project(p))).smooth(2);
}

// ----------------------------------------------------------------------------------------------
// Light that moves: a burst of soul light and the motes that rise from it
// ----------------------------------------------------------------------------------------------

/** The fractional part of a number: a low-discrepancy hash of an index (golden-ratio steps), so motes differ without a generator. */
const fract = (x: number): number => x - Math.floor(x);

/**
 * A burst of soul light drawn flat over a prop: a wide bloom flattened by the tilt round `at` (the opening it comes
 * out of), a column that narrows and fades upwards with a paler core, and a fan of thin rays. `strength` (0 to 1)
 * fades the whole of it; `radius` is the bloom's, `height` the column's, in px.
 */
export function soulBurst(c: CanvasRenderingContext2D, glow: VolumeStyle, at: Point, o: { radius: number; height: number; strength: number }): void {
  const a = clamp01(o.strength);
  if (a <= 0.01) return;
  const { base, lit } = glow.ramp;
  c.save();
  c.translate(at.x, at.y);
  // The bloom.
  c.save();
  c.scale(1, 0.62);
  const bloom = c.createRadialGradient(0, 0, 0, 0, 0, o.radius);
  bloom.addColorStop(0, alpha(lit, 0.9 * a));
  bloom.addColorStop(0.32, alpha(base, 0.55 * a));
  bloom.addColorStop(1, alpha(base, 0));
  c.fillStyle = bloom;
  c.beginPath();
  c.arc(0, 0, o.radius, 0, Math.PI * 2);
  c.fill();
  c.restore();
  // A wedge from the opening up: `w0` wide at the foot, `w1` at the top, leaning by `lean`.
  const wedge = (w0: number, w1: number, h: number, lean: number, a0: number) => {
    const g = c.createLinearGradient(0, 0, lean, -h);
    g.addColorStop(0, alpha(lit, 0));
    g.addColorStop(0.14, alpha(lit, a0 * a));
    g.addColorStop(0.5, alpha(base, a0 * 0.55 * a));
    g.addColorStop(1, alpha(base, 0));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-w0, 0);
    c.lineTo(lean - w1, -h);
    c.lineTo(lean + w1, -h);
    c.lineTo(w0, 0);
    c.closePath();
    c.fill();
  };
  wedge(o.radius * 0.62, o.radius * 0.3, o.height, 0, 0.46);
  for (const [lean, len, w] of [[-0.62, 0.7, 0.1], [-0.3, 0.92, 0.09], [0.28, 0.86, 0.09], [0.6, 0.66, 0.1]] as const) wedge(o.radius * w * 1.6, o.radius * 0.03, o.height * len, lean * o.height * 0.55, 0.34);
  wedge(o.radius * 0.3, o.radius * 0.1, o.height * 0.86, 0, 0.7);
  c.restore();
}

/**
 * Motes of soul light rising from `at` as the clip runs from `p` = 0 to 1: each lives in its own window of the clip
 * (never wrapping past it, so the loop or the transition has none on its first and last frames), drifts up and a little
 * sideways, shrinks and fades. `from` and `until` bound where in the clip they may live. Positions come from the index.
 */
export function soulMotes(c: CanvasRenderingContext2D, glow: VolumeStyle, at: Point, p: number, o: { count: number; height: number; spread: number; size: number; from?: number; until?: number; strength?: number }): void {
  const from = o.from ?? 0.03;
  const until = o.until ?? 0.97;
  for (let i = 0; i < o.count; i++) {
    const life = Math.min(until - from, 0.4 + 0.2 * fract(i * 0.7548776662));
    const start = from + (until - from - life) * fract(i * 0.6180339887 + 0.17);
    const u = seg(p, start, start + life);
    if (u <= 0 || u >= 1) continue;
    const reach = o.height * (0.55 + 0.45 * fract(i * 0.5698402909 + 0.31));
    const x = at.x + (fract(i * 0.7548776662 + 0.5) - 0.5) * 2 * o.spread * (0.45 + 0.55 * u) + Math.sin((u + i * 0.29) * Math.PI * 2) * o.spread * 0.12;
    const y = at.y - reach * easeOut(u);
    const grow = 0.75 + 0.5 * fract(i * 0.4142135624);
    const fade = Math.sin(Math.PI * u);
    paintEmber(c, glow, x, y, o.size * grow * (1 - 0.35 * u) * 0.7, o.size * grow * (1 - 0.35 * u), Math.min(1, fade * 1.2) * (o.strength ?? 1));
  }
}
