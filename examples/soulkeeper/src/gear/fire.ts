/**
 * Soul fire, drawn flat: the teardrop flame every fire part of the kit paints (`fireCrown`,
 * `palmFlame`, the lantern's soul). Flames are drawn shapes that always rise up the screen, so they
 * are drawn through `object.custom` at a projected point, never as volumes.
 *
 * Colors come from the `glow` role's ramp, so another outfit burns in another color: the saturated
 * `base` is the body and the halo, `lit` the pale core, `dark` the shade at the root and the eyes.
 * Every motion that feeds these helpers is a function of `kit.t` made of whole cycles, so a loop
 * closes.
 */

import { alpha } from '@core/draw';
import type { VolumeStyle } from '@core/volume';

/** Appends the outline of a teardrop flame to the current path: round belly at (cx, cy), tip `2.6 r` above it, leaning by `lean`. */
export function flamePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, lean = 0): void {
  const tipX = cx + lean;
  const tipY = cy - r * 2.6;
  ctx.moveTo(tipX, tipY);
  ctx.bezierCurveTo(cx + lean * 0.4 + r * 0.25, cy - r * 1.5, cx + r * 1.05, cy - r * 0.8, cx + r, cy);
  ctx.arc(cx, cy, r, 0, Math.PI, false);
  ctx.bezierCurveTo(cx - r * 1.05, cy - r * 0.8, cx + lean * 0.4 - r * 0.6, cy - r * 1.6, tipX, tipY);
  ctx.closePath();
}

/** Options of `paintFlame`. */
export interface FlameOptions {
  /** Sideways lean of the tip, px. Default 0. */
  lean?: number;
  /** Halo blur, px; 0 for none. Default 0. */
  halo?: number;
  /** Two hollow eyes on the belly: a lost soul. Default false. */
  eyes?: boolean;
  /** Halo and fill alpha. Default 1. */
  strength?: number;
}

/**
 * One flame: a body shaded from `base` towards `dark` at its root, a pale `lit` core and, for a
 * lost soul, two hollow eyes. `r` is the belly radius in logical px.
 */
export function paintFlame(ctx: CanvasRenderingContext2D, glow: VolumeStyle, cx: number, cy: number, r: number, options: FlameOptions = {}): void {
  const { lean = 0, halo = 0, eyes = false, strength = 1 } = options;
  const { base, lit, dark } = glow.ramp;
  ctx.save();
  ctx.globalAlpha *= strength;
  const body = ctx.createLinearGradient(cx, cy - r * 2.6, cx, cy + r);
  body.addColorStop(0, base);
  body.addColorStop(0.62, base);
  body.addColorStop(1, dark);
  ctx.fillStyle = body;
  if (halo > 0) {
    ctx.shadowColor = alpha(base, 0.9);
    ctx.shadowBlur = halo;
  }
  ctx.beginPath();
  flamePath(ctx, cx, cy, r, lean);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = alpha(base, 0);
  ctx.fillStyle = lit;
  ctx.beginPath();
  flamePath(ctx, cx + lean * 0.1, cy + r * 0.15, r * 0.55, lean * 0.5);
  ctx.fill();
  if (eyes) {
    const eye = Math.max(0.5, r * 0.17);
    ctx.fillStyle = dark;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * r * 0.35, cy - r * 0.1, eye, eye * 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A rising ember: a small diamond. */
export function paintEmber(ctx: CanvasRenderingContext2D, glow: VolumeStyle, x: number, y: number, w: number, h: number, a: number): void {
  ctx.save();
  ctx.fillStyle = alpha(glow.ramp.lit, a);
  ctx.shadowColor = alpha(glow.ramp.base, 0.55 * a);
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
