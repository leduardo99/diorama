/**
 * Helpers shared by the effects of the project (`projectiles.ts`, `impacts.ts`, `ground.ts`,
 * `bursts.ts`). Effects are light and colour, so they are drawings made through
 * `object.custom` / `ground.custom` at the effect's origin (the kit's flames are drawn the same
 * way): this file holds the small tools those drawings share.
 *
 * Colours never appear here: an effect asks for a role (`glow`, `blade`, `bone`, `dust`) and the
 * catalog says which theme material plays it, so another project can burn in another colour.
 *
 * Every motion is a function of `ctx.t` (0 → 1 across a one-shot, frame ÷ frames round a loop), so
 * a loop closes and a one-shot ends where its last keys say (every effect here ends empty).
 */

import type { Rng } from '@core';
import { alpha, lerpColor } from '@core/draw';
import { vec3, type Camera, type EffectContext, type ShadeRamp } from '@core/volume';
import { flamePath } from '../gear/fire';
import { CAMERA, PALETTES } from '../theme';
import { SPACE } from '../space';

export const TAU = Math.PI * 2;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
/** Fast start, slow end: `p` 1 is linear, 2 and 3 ease out harder. */
export const easeOut = (x: number, p = 3) => 1 - Math.pow(1 - clamp01(x), p);
/** Slow start, fast end. */
export const easeIn = (x: number, p = 2) => Math.pow(clamp01(x), p);

/** Piecewise-linear value of `[[t, value], ...]` at `t` (keys in increasing t): the timing table of an effect. */
export function keys(t: number, table: readonly (readonly [number, number])[]): number {
  if (t <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [t1, v1] = table[i];
    if (t <= t1) {
      const [t0, v0] = table[i - 1];
      return lerp(v0, v1, (t - t0) / (t1 - t0 || 1));
    }
  }
  return table[table.length - 1][1];
}

/** The ramp of a material role (the catalog's `defaultMaterials` says which material plays it). */
export function ramp(c: Pick<EffectContext, 'materials'>, role: string): ShadeRamp {
  const m = c.materials[role];
  if (!m) throw new Error(`vfx: the catalog has no material for the role "${role}" (roles it has: ${Object.keys(c.materials).join(', ') || 'none'})`);
  return m.ramp;
}

/** Screen length of one world unit along the floor towards the camera: ground circles are ellipses this much squashed. */
export const floorSquash = (cam: Camera) => cam.project(vec3(0, 1, 0)).y - cam.project(vec3(0, 0, 0)).y;

/** A darker shade of a ramp's dark tone, for lines between tones (selective outline, as the theme's `inner`). */
export const rimOf = (r: ShadeRamp, amount = 0.45) => lerpColor(r.dark, PALETTES.ink, amount);

/** A soft round glow: `color` at `a` in the middle fading to nothing at `r`. `hold` (0..1) keeps the middle solid out to that share of `r`. */
export function softDisc(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number, hold = 0): void {
  if (a <= 0.003 || r <= 0.1) return;
  const g = c.createRadialGradient(x, y, r * hold, x, y, r);
  g.addColorStop(0, alpha(color, a));
  g.addColorStop(1, alpha(color, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

/** A soft glow lying on the floor: an ellipse `rx` wide and `rx × squash` deep. */
export function softPool(c: CanvasRenderingContext2D, x: number, y: number, rx: number, squash: number, color: string, a: number, hold = 0): void {
  if (a <= 0.003 || rx <= 0.1) return;
  c.save();
  c.translate(x, y);
  c.scale(1, squash);
  softDisc(c, 0, 0, rx, color, a, hold);
  c.restore();
}

/** A straight dash with round ends (a spark, a ray). */
export function dash(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number, color: string): void {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

/**
 * Appends a teardrop to the current path: its round base at (0, 0) and its tip `len` along +x, `w` across at the belly. `bend`
 * (a share of `len`, positive towards +y) curls the tip sideways and the body with it, as a flame bends in a draught.
 * Rotate and translate the context before calling it.
 */
export function dropPath(c: CanvasRenderingContext2D, len: number, w: number, bend = 0): void {
  const b = bend * len;
  c.moveTo(len, b);
  c.bezierCurveTo(len * 0.62, -w * 0.9 + b * 0.6, len * 0.2, -w * 1.2 + b * 0.15, 0, -w * 0.6);
  c.quadraticCurveTo(-w * 0.6, 0, 0, w * 0.6);
  c.bezierCurveTo(len * 0.2, w * 1.2 + b * 0.15, len * 0.62, w * 0.9 + b * 0.6, len, b);
  c.closePath();
}

/**
 * A tongue of soul fire from (x, y) towards `angle` (radians, screen): a darker rim, the saturated body and a pale
 * hot core. `len` and `w` are in logical px; `a` scales every alpha; `bend` curls it (see `dropPath`).
 */
export function tongue(c: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number, w: number, glow: ShadeRamp, a: number, bend = 0): void {
  if (a <= 0.003 || len <= 0.4) return;
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.beginPath();
  dropPath(c, len * 1.06, w * 1.22, bend);
  c.fillStyle = alpha(glow.dark, 0.92 * a);
  c.fill();
  c.beginPath();
  dropPath(c, len, w, bend);
  c.fillStyle = alpha(glow.base, a);
  c.fill();
  c.beginPath();
  dropPath(c, len * 0.62, w * 0.5, bend * 0.7);
  c.fillStyle = alpha(glow.lit, 0.95 * a);
  c.fill();
  c.restore();
}

/**
 * An upright teardrop of soul fire, the kit's own flame (`flamePath`): a darker rim round a saturated body that darkens towards
 * its root, and a pale hot core. (x, y) is the centre of its round belly, `r` the belly's radius, the tip stands `2.6 r` above.
 */
export function flameDrop(c: CanvasRenderingContext2D, x: number, y: number, r: number, glow: ShadeRamp, a: number, lean = 0): void {
  if (a <= 0.003 || r <= 0.3) return;
  c.save();
  c.fillStyle = alpha(glow.dark, a);
  c.beginPath();
  flamePath(c, x, y + r * 0.08, r * 1.22, lean * 1.05);
  c.fill();
  const body = c.createLinearGradient(x, y - r * 2.6, x, y + r);
  body.addColorStop(0, alpha(glow.base, a));
  body.addColorStop(0.6, alpha(glow.base, a));
  body.addColorStop(1, alpha(lerpColor(glow.base, glow.dark, 0.7), a));
  c.fillStyle = body;
  c.beginPath();
  flamePath(c, x, y, r, lean);
  c.fill();
  c.fillStyle = alpha(glow.lit, 0.95 * a);
  c.beginPath();
  flamePath(c, x + lean * 0.1, y + r * 0.18, r * 0.52, lean * 0.5);
  c.fill();
  c.restore();
}

/** The three tones of a soft material (dust, powder). */
export type Tone = { lit: string; base: string; dark: string };
export type Lobe = { dx: number; dy: number; k: number };

/**
 * One puff of dust, lumpy because it is a few lobes: each layer is one path (the lobes' union), so
 * a puff fades as one piece. A dark underside a little lower and wider (it reads as the outline),
 * the body, a lit crest to the upper left.
 */
export function cloud(cx: CanvasRenderingContext2D, x: number, y: number, r: number, lobes: Lobe[], tone: Tone, a: number): void {
  if (a <= 0.01 || r <= 0.3) return;
  const union = (ox: number, oy: number, grow: number, shrink: number) => {
    cx.beginPath();
    for (const l of lobes) {
      const rr = Math.max(0.1, l.k * r * shrink + grow);
      const px = x + l.dx * r + ox;
      const py = y + l.dy * r + oy;
      cx.moveTo(px + rr, py);
      cx.arc(px, py, rr, 0, TAU);
    }
  };
  cx.save();
  cx.fillStyle = alpha(lerpColor(tone.dark, PALETTES.ink, 0.25), a);
  union(r * 0.06, r * 0.12, 0.8, 1);
  cx.fill();
  cx.fillStyle = alpha(tone.base, a);
  union(0, 0, 0, 1);
  cx.fill();
  cx.fillStyle = alpha(tone.lit, a * 0.9);
  union(-r * 0.2, -r * 0.24, 0, 0.55);
  cx.fill();
  cx.restore();
}


/** The lobes of a lumpy puff: a body, a shoulder to each side and a crest, each nudged by the generator. */
export function puffLobes(rng: Rng): Lobe[] {
  return [
    { dx: 0, dy: 0, k: 0.72 },
    { dx: -0.58, dy: 0.1, k: 0.5 },
    { dx: 0.56, dy: 0.12, k: 0.56 },
    { dx: 0.04, dy: -0.46, k: 0.46 },
  ].map(l => ({ dx: l.dx + rng.float(-0.1, 0.1), dy: l.dy + rng.float(-0.08, 0.08), k: l.k * rng.float(0.9, 1.12) }));
}

/** A four-point star (a glint): `r` tall and wide, `thin` the share of its waist. */
export function glint(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number, thin = 0.16): void {
  if (a <= 0.003 || r <= 0.2) return;
  c.save();
  c.fillStyle = alpha(color, a);
  c.beginPath();
  const k = r * thin;
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x + k, y - k, x + r, y);
  c.quadraticCurveTo(x + k, y + k, x, y + r);
  c.quadraticCurveTo(x - k, y + k, x - r, y);
  c.quadraticCurveTo(x - k, y - k, x, y - r);
  c.closePath();
  c.fill();
  c.restore();
}

/**
 * The exported cell of a ground effect: its ring `size` wide on every side and as deep as the floor shows it, with `rise` logical
 * px above the ring for flames and motes. Ground effects are wide and shallow, so the default square cell would waste half of it.
 */
export function groundCell(size: number, rise: number, margin = 6): { width: number; height: number; pivot: { x: number; y: number } } {
  const sq = floorSquash(CAMERA);
  const rx = Math.ceil(size + margin);
  const down = Math.ceil(size * sq + margin);
  const up = Math.ceil(size * sq + rise + margin);
  return { width: rx * 2, height: up + down, pivot: { x: rx, y: up } };
}

/** Cells are 48 world units wide (`SPACE.scale.cell`): effects that reach "a cell" or "two cells" read it from here. */
export const CELL = SPACE.scale.cell;
