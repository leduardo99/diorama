/**
 * Spirit wings: a pair of spectral wings of soul fire on the back, folded and faint at rest, spread
 * wide when a clip raises `extra.wings`.
 *
 * They are drawn, not modelled: each wing is a chain from the shoulder blade through an elbow to a
 * wrist, posed in 3D on the trunk (so they turn with the facing and follow a hit or a fall), its
 * feathers laid along it and painted flat in the `glow` role as one translucent shape with a halo
 * and pale shafts. Each wing sorts at its own root, so seen from the front both stay behind the
 * body, from behind they spread over the cloak, and in profile the near one shows in front of the
 * far one.
 */

import { alpha } from '@core/draw';
import type { Part } from '@core/rig';
import { add3, lerp3, norm3, scale3, sub3, type Vec3 } from '@core/volume';
import { clamp01, role, scaleOf } from './util';

/** Options of `spiritWings`. */
export interface SpiritWingsOptions {
  /** How far the wings are spread when no clip drives `extra.wings` (0 folded .. 1 spread). Default 0.08. */
  spread?: number;
  /** Opacity of the folded wings (they brighten as they spread). Default 0.45. */
  strength?: number;
  /** Scale of the wings. Default 1. */
  span?: number;
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Spectral wings on the back: folded down along the back at rest, faint, with a slow shimmer; they
 * open up and out to a wide span and brighten as `extra.wings` rises to 1, and fade once the body
 * lies (`lie`, or `extra.dead`). Ten feathers to a wing, each with a covert over its root: the inner
 * ones hang from the arm, the outer ones turn to continue it, as a bird's primaries do.
 * Slot: `back`. Roles: `glow`. Channels: `extra.wings` (0..1).
 */
export const spiritWings: Part<SpiritWingsOptions> = (ctx, { spread = 0.08, strength = 0.45, span = 1 }) => {
  const { object: o, pose, kit, body, at, materials } = ctx;
  const glow = role(materials, 'glow');
  const fade = 1 - clamp01(Math.max(body.lie, pose.extra.dead ?? 0) * 1.4);
  if (fade <= 0.02) return;
  const k = scaleOf(ctx) * span;
  const open = smooth(clamp01(pose.extra.wings ?? spread));
  const opacity = (strength + (0.88 - strength) * open) * fade;
  const { up, right: across, forward } = body;
  const tau = Math.PI * 2;
  // A slow shimmer, whole cycles of the clip, stronger while folded.
  const shimmer = Math.sin(tau * kit.t) * (1 - 0.6 * open);
  for (const s of [-1, 1]) {
    const out = scale3(across, s);
    const back = scale3(forward, -1);
    const down = scale3(up, -1);
    const local = (o0: number, u0: number, b0: number): Vec3 => add3(scale3(out, o0 * k), add3(scale3(up, u0 * k), scale3(back, b0 * k)));
    // Folded, the wrist rides above and outside the shoulder, so a feathered tip shows over each
    // pauldron, and the long feathers hang from it down the back; spread, the arm reaches up and out
    // and the feathers fan from it.
    const root = add3(at.frame.origin, local(3, 2.6, 0.3));
    const elbow = add3(root, lerp3(local(3.4, 4, 1.5), local(10, 8.5, 2.5), open));
    const wrist = add3(root, lerp3(local(5.4, 7.2 + 0.5 * shimmer, 2), local(22, 15 + 0.6 * shimmer, 3.5), open));
    const arm = (u: number) => (u < 0.4 ? lerp3(root, elbow, u / 0.4) : lerp3(elbow, wrist, (u - 0.4) / 0.6));
    const along = norm3(sub3(wrist, elbow));
    const trail = norm3(add3(down, add3(scale3(back, 0.1), scale3(out, 0.18))));
    type Feather = { base: Vec3; tip: Vec3; width: number };
    const feathers: Feather[] = [];
    const count = 10;
    for (let i = 0; i < count; i++) {
      const u = 0.1 + (0.9 * i) / (count - 1);
      // Folded, every feather hangs down the back, the outer ones longest, to the back of the knees;
      // spread, they hang from the arm as a broad sail and the outer ones turn to continue it.
      const turn = open * smooth(clamp01((u - 0.55) / 0.45)) * 0.75;
      const dir = norm3(lerp3(trail, add3(along, scale3(trail, 0.3)), turn));
      const lengthOf = ((5 + 21 * u * u) * (1 - open) + (8 + 9 * u) * open) * k;
      const base = arm(u);
      const width = (2.6 + 1.6 * u) * k;
      feathers.push({ base, tip: add3(base, scale3(dir, lengthOf)), width });
      // A covert over its root, so the wing near the arm reads as one surface.
      feathers.push({ base, tip: add3(base, scale3(dir, lengthOf * 0.45)), width: width * 1.25 });
    }
    o.custom(add3(root, local(0, 0, 2)), (ctx2, cam) => {
      const leaf = (f: Feather) => {
        const a = cam.project(f.base);
        const b = cam.project(f.tip);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l = Math.hypot(dx, dy) || 1;
        const nx = (-dy / l) * (f.width * cam.scale) / 2;
        const ny = (dx / l) * (f.width * cam.scale) / 2;
        ctx2.moveTo(a.x - nx * 0.6, a.y - ny * 0.6);
        ctx2.quadraticCurveTo(a.x + dx * 0.45 - nx * 1.1, a.y + dy * 0.45 - ny * 1.1, b.x, b.y);
        ctx2.quadraticCurveTo(a.x + dx * 0.45 + nx * 1.1, a.y + dy * 0.45 + ny * 1.1, a.x + nx * 0.6, a.y + ny * 0.6);
        ctx2.closePath();
      };
      ctx2.save();
      // The body of the wing: every feather in one path, filled once, so overlaps do not stack up.
      ctx2.beginPath();
      for (const f of feathers) leaf(f);
      // The arm itself, a soft band from the root to the wrist.
      const pts = [root, elbow, wrist].map(p => cam.project(p));
      ctx2.shadowColor = alpha(glow.ramp.base, 0.8 * opacity);
      ctx2.shadowBlur = (6 + 6 * open) * cam.scale;
      ctx2.fillStyle = alpha(glow.ramp.base, 0.55 * opacity);
      ctx2.fill();
      ctx2.shadowBlur = 0;
      ctx2.strokeStyle = alpha(glow.ramp.lit, 0.75 * opacity);
      ctx2.lineCap = 'round';
      ctx2.lineJoin = 'round';
      ctx2.lineWidth = 1.4 * k * cam.scale;
      ctx2.beginPath();
      ctx2.moveTo(pts[0].x, pts[0].y);
      ctx2.lineTo(pts[1].x, pts[1].y);
      ctx2.lineTo(pts[2].x, pts[2].y);
      ctx2.stroke();
      // The shafts: pale lines down each feather.
      ctx2.lineWidth = 0.6 * k * cam.scale;
      ctx2.strokeStyle = alpha(glow.ramp.lit, 0.6 * opacity);
      ctx2.beginPath();
      for (const f of feathers) {
        const a = cam.project(f.base);
        const b = cam.project(lerp3(f.base, f.tip, 0.82));
        ctx2.moveTo(a.x, a.y);
        ctx2.lineTo(b.x, b.y);
      }
      ctx2.stroke();
      ctx2.restore();
    });
  }
};
