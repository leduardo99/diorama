/**
 * Effects: what a held weapon leaves in the air during a clip. They are parts too, so an outfit
 * lists them after the weapon and rests them `on` its blade, but they draw nothing as gear: they
 * read the clip (`kit.clip.events`, `kit.t`, `kit.poseAt`) and the pose's channels, and each draws
 * a drawn shape through `object.custom`.
 * - `weaponSmear`: one crescent of the blade's sweep just before the clip's `hit` event;
 * - `chargedEdge`: a glowing edge over the blade while `extra.charge` (0..1) is up;
 * - `groundShockwave`: a crescent of fire spreading over the floor from where the blade struck,
 *   from a skill's `release` event on;
 * - `scytheSmear`: the crescent of a scythe's wide sweep, the two frames before the clip's `hit`;
 * - `palmFlame`: the soul flame that hovers over an open palm and flares for a skill's release.
 *
 * Slot for all three: `hand` (the hand that holds the weapon, side 1 right). Roles: `glow` (the
 * fire) and `blade` (the pale edge of the smear). Give them the same `length` as the weapon.
 */

import { createRng } from '@core';
import { Path, alpha } from '@core/draw';
import { easeOutCubic, slotFrame, type Part, type Pose, type SkeletonSpec } from '@core/rig';
import { add3, scale3, sub3, vec3, type Vec3 } from '@core/volume';
import { paintEmber, paintFlame } from './fire';
import { clamp01, halo, role, tones } from './util';
import { SWORD_BLADE, SWORD_HILT, scytheHeld, swordHeld } from './weapons';

/** Options shared by the weapon effects. */
export interface WeaponEffectOptions {
  /** Length of the weapon's blade, as given to `notchedSword`. Default 24. */
  length?: number;
}

/**
 * One smear mid-strike: the blade's sweep over the last fifteenth of a second, as a crescent that
 * fades in towards the edge. A skill (a slower clip with a short cut) shows it from the first cut
 * frame, so an overhead sweep reads from the apex down to the floor.
 * Reads the clip's `hit` event.
 */
export const weaponSmear: Part<WeaponEffectOptions> = ({ object: o, pose, kit, at, materials, host }, { length = SWORD_BLADE }) => {
  const strike = kit.clip.events.find(e => e.name === 'hit');
  const [lead, start] = kit.clip.kind === 'skill' ? [0.2, 0.23] : [0.13, 0.16];
  if (!strike || !(kit.t > strike.t - lead && kit.t <= strike.t)) return;
  const side = at.side === 0 ? 1 : at.side;
  const span = Math.min(kit.t - (strike.t - start), 1 / 15 / kit.clip.seconds);
  const samples = Array.from({ length: 10 }, (_, i) => swordHeld(kit.poseAt(kit.t - span * (1 - i / 9)), kit.skeleton, side, length));
  const reach = SWORD_HILT + length + 2;
  const tail = tones(materials, 'glow').lit;
  const edge = tones(materials, 'blade', 'metalAccent', 'metal').lit;
  o.custom(swordHeld(pose, kit.skeleton, side, length).grip, (ctx, c) => {
    const outer = samples.map(s => c.project(s.tip));
    const inner = samples.map((s, i) => c.project(add3(s.grip, scale3(s.dir, reach - (length * 0.5 * i) / 9))));
    const path = Path.polyline([...outer, ...inner.reverse()], true);
    const a = outer[0];
    const b = outer[outer.length - 1];
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, alpha(tail, 0));
    g.addColorStop(1, alpha(edge, 0.9));
    path.close().fill(ctx, g);
  }, host ? { on: host } : {});
};

/**
 * The blade burns brighter through a charge: a glowing edge over the steel, scaled by
 * `extra.charge` (0..1). Draws nothing while the charge is below 0.02.
 */
export const chargedEdge: Part<WeaponEffectOptions> = ({ object: o, pose, kit, at, materials, host }, { length = SWORD_BLADE }) => {
  const charge = pose.extra.charge ?? 0;
  if (charge <= 0.02) return;
  const { grip, dir } = swordHeld(pose, kit.skeleton, at.side === 0 ? 1 : at.side, length);
  const glow = role(materials, 'glow');
  const lamp = halo(glow, 10);
  const from = add3(grip, scale3(dir, SWORD_HILT + 3));
  const to = add3(grip, scale3(dir, SWORD_HILT + length + 1.5));
  o.custom(grip, (ctx, c) => {
    const a = c.project(from);
    const b = c.project(to);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = lamp.color;
    ctx.shadowBlur = lamp.blur * charge;
    ctx.strokeStyle = alpha(glow.ramp.base, 0.6 * charge);
    ctx.lineWidth = 3.1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = alpha(glow.ramp.lit, 0.92 * charge);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }, host ? { on: host } : {});
};

/** Options of `groundShockwave`. */
export interface GroundShockwaveOptions extends WeaponEffectOptions {
  /** Seconds the fire lasts after the release frame. Default 0.27. */
  seconds?: number;
  /** Half-opening of the crescent, radians: a little more than a half circle, open towards the wielder. Default 2.1. */
  arc?: number;
  /** Seed of the flame tongues and the sparks. Default 'soul-cleave'. */
  seed?: string;
}

/**
 * Fire spreading over the floor from where the blade struck, for the `release` event of a skill: a
 * crescent facing away from the wielder that expands and thins out over about four frames, short
 * flame tongues along its outer edge, a flash at the impact on the release frame and a few sparks
 * that rise from the impact and fall. It stays where the blade met the floor (the point is solved
 * at the release time, so the ring does not follow the body as it recovers), and lies under the
 * character: its depth bias puts it before every part of the body. Nothing is drawn for a clip
 * that is not a skill or has no `release` event.
 */
export const groundShockwave: Part<GroundShockwaveOptions> = ({ object: o, kit, at, materials, host }, { length = SWORD_BLADE, seconds = 0.27, arc = 2.1, seed = 'soul-cleave' }) => {
  const release = kit.clip.kind === 'skill' ? kit.clip.events.find(e => e.name === 'release') : undefined;
  if (!release) return;
  const age = (kit.t - release.t) * kit.clip.seconds;
  if (age < -1e-6 || age >= seconds) return;
  const glow = role(materials, 'glow');
  const lamp = halo(glow, 10);
  const struck = kit.poseAt(release.t);
  const { tip } = swordHeld(struck, kit.skeleton, at.side === 0 ? 1 : at.side, length);
  const centre = vec3(tip.x, tip.y, 0);
  const fwd = struck.frame.forward;
  const sideways = struck.frame.right;
  const a = clamp01(age / seconds);
  const fade = Math.pow(1 - a, 0.95);
  const radius = 4 + 17 * easeOutCubic(a);
  const thick = 2 + 4.2 * (1 - a);
  const onFloor = (angle: number, r: number, z = 0.3): Vec3 =>
    add3(centre, add3(scale3(add3(scale3(fwd, Math.cos(angle)), scale3(sideways, Math.sin(angle))), r), vec3(0, 0, z)));
  const steps = 20;
  const taper = (th: number) => Math.pow(Math.max(0, 1 - (th / arc) ** 2), 0.6);
  const angles = Array.from({ length: steps + 1 }, (_, i) => -arc + (2 * arc * i) / steps);
  o.custom(centre, (ctx, c) => {
    const outer = angles.map(th => c.project(onFloor(th, radius + 0.4 * thick * taper(th))));
    const inner = angles.map(th => c.project(onFloor(th, radius - 0.6 * thick * taper(th))));
    ctx.save();
    ctx.shadowColor = lamp.color;
    ctx.shadowBlur = lamp.blur * fade;
    Path.polyline([...outer, ...inner.slice().reverse()], true).close().fill(ctx, alpha(glow.ramp.base, 0.78 * fade));
    ctx.shadowBlur = 0;
    // A pale line along the outer edge: the lit rim of the fire.
    ctx.strokeStyle = alpha(glow.ramp.lit, 0.95 * fade);
    ctx.lineWidth = 0.9;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    outer.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    // Flame tongues along the edge, rising and shrinking as the ring spreads.
    const rng = createRng(seed);
    const tongues = 9;
    ctx.fillStyle = alpha(glow.ramp.lit, 0.88 * fade);
    for (let i = 0; i < tongues; i++) {
      const th = -arc * 0.78 + (2 * arc * 0.78 * i) / (tongues - 1);
      const lift = (2.2 + 4.2 * rng.random()) * (1 - a) * Math.pow(taper(th), 0.5) + 0.4;
      const sway = Math.sin(age * 38 + i * 1.7) * 0.9;
      const base = radius + 0.2 * thick;
      const l = c.project(onFloor(th - 0.07, base));
      const r = c.project(onFloor(th + 0.07, base));
      const top = c.project(add3(onFloor(th, base + sway), vec3(0, 0, lift)));
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(top.x, top.y);
      ctx.lineTo(r.x, r.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }, { bias: -1e4 });

  // Flash and sparks sit over the blade tip. The flash lasts about the release frame only.
  const flash = clamp01(1 - age / 0.06);
  o.custom(tip, (ctx, c) => {
    const rng = createRng(`${seed}-sparks`);
    ctx.save();
    ctx.shadowColor = lamp.color;
    ctx.shadowBlur = lamp.blur;
    if (flash > 0) {
      const p = c.project(add3(centre, vec3(0, 0, 1.5)));
      ctx.strokeStyle = alpha(glow.ramp.lit, flash);
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const th = (i / 10) * Math.PI * 2 + 0.2;
        const r0 = 3.4;
        const r1 = r0 + (i % 2 ? 4.2 : 8) * flash;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(th) * r0, p.y + Math.sin(th) * r0 * 0.8);
        ctx.lineTo(p.x + Math.cos(th) * r1, p.y + Math.sin(th) * r1 * 0.8);
        ctx.stroke();
      }
      ctx.fillStyle = alpha(glow.ramp.lit, 0.9 * flash);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6 * flash + 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = alpha(glow.ramp.lit, fade);
    for (let i = 0; i < 7; i++) {
      const th = -arc + rng.random() * 2 * arc;
      const speed = 18 + 30 * rng.random();
      const rise = 38 + 40 * rng.random();
      const z = 1.5 + rise * age - 120 * age * age;
      if (z < 0) continue;
      const p = c.project(onFloor(th, speed * age, z));
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.5 + 0.5 * rng.random(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }, host ? { on: host } : {});
};

/**
 * The crescent a scythe's sweep leaves just before the clip's `hit` event: the blade's tip and a
 * point on the snath a good way below the blade, sampled over the last stretch of the sweep, as a band
 * that is widest where the blade is now and tapers to a point behind it, fading in towards the
 * edge. (The blade leads the sweep, so the tip alone would draw a line: the band spans from the tip
 * back along the snath.) It is drawn on the frames before the hit (never on the hit frame itself:
 * that shows the blade at its extreme). Rests on the scythe's snath.
 * Slot: `hand` (side 1 right). Roles: `glow` (the tail), `blade` (the pale edge).
 */
export const scytheSmear: Part<{ lead?: number; span?: number; width?: number }> = ({ object: o, pose, kit, at, materials, host }, { lead = 0.2, span = 0.1, width = 30 }) => {
  const strike = kit.clip.events.find(e => e.name === 'hit');
  if (!strike || !(kit.t > strike.t - lead && kit.t < strike.t - 1e-6)) return;
  const side = at.side === 0 ? 1 : at.side;
  const from = Math.max(0, kit.t - span);
  const samples = Array.from({ length: 12 }, (_, i) => scytheHeld(kit.poseAt(from + ((kit.t - from) * i) / 11), kit.skeleton, side));
  const tail = tones(materials, 'glow').lit;
  const edge = tones(materials, 'blade', 'metalAccent', 'metal').lit;
  o.custom(scytheHeld(pose, kit.skeleton, side).tip, (ctx, c) => {
    const outer = samples.map(s => c.project(s.tip));
    // The inner line runs back along the snath, further the newer the sample, so the band tapers to a point behind.
    const inner = samples.map((s, i) => c.project(sub3(s.top, scale3(s.dir, width * (i / 11)))));
    const path = Path.polyline([...outer, ...inner.reverse()], true);
    const a = outer[0];
    const b = outer[outer.length - 1];
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, alpha(tail, 0));
    g.addColorStop(1, alpha(edge, 0.92));
    path.close().fill(ctx, g);
  }, host ? { on: host } : {});
};

/** Where the soul flame of an open palm hovers: above the palm, a little towards the fingers, rising when it flares (`extra.flare`, 0..1). */
export function palmPoint(pose: Pose, skeleton: SkeletonSpec, side: -1 | 1 = -1): Vec3 {
  const { frame } = slotFrame(pose, skeleton, 'hand', side);
  const lift = 5.4 + 1.8 * (pose.extra.flare ?? 0);
  return add3(add3(frame.origin, scale3(frame.forward, 2.4)), vec3(0, 0, lift));
}

/** Options of `palmFlame`. */
export interface PalmFlameOptions {
  /** Radius of the flame's belly, logical px. Default 3.1. */
  size?: number;
  /** Seconds the release burst lasts after the clip's `release` event. Default 0.22. */
  burst?: number;
}

/**
 * The soul flame over an open palm: a lost soul (a flame with a pale core and two hollow eyes)
 * that pulses twice and sways once per loop, with a few embers rising from it. `extra.flare`
 * (0..1) swells it and its halo; from a skill's `release` event a short burst of sparks leaves it
 * along the facing. It dims out as `extra.dead` or the body lying down takes the body.
 * Rests on the hand (give it as the host).
 * Slot: `hand` (side -1 left). Roles: `glow`. Channels: `extra.flare`, `extra.dead`.
 */
export const palmFlame: Part<PalmFlameOptions> = ({ object: o, pose, kit, body, at, materials, host }, { size = 3.1, burst = 0.22 }) => {
  const glow = role(materials, 'glow');
  const tau = Math.PI * 2;
  const t = kit.t;
  const flare = pose.extra.flare ?? 0;
  const alive = 1 - Math.max(body.lie, pose.extra.dead ?? 0);
  if (alive < 0.05) return;
  const p = palmPoint(pose, kit.skeleton, at.side === 0 ? -1 : at.side);
  const release = kit.clip.kind === 'skill' ? kit.clip.events.find(e => e.name === 'release') : undefined;
  const age = release ? (kit.t - release.t) * kit.clip.seconds : -1;
  const forward = pose.frame.forward;
  o.custom(p, (ctx, c) => {
    const q = c.project(p);
    const pulse = Math.sin(tau * 2 * t);
    const r = size * alive * (1 + 0.09 * pulse) * (1 + 0.85 * flare);
    const lean = -1.2 + Math.sin(tau * (t + 0.19)) * 1.1;
    const lift = Math.sin(tau * (t + 0.3)) * 0.7;
    paintFlame(ctx, glow, q.x, q.y + lift, r, { lean, halo: 10 * (1 + 0.45 * pulse) * (1 + flare), eyes: true });
    for (let i = 0; i < 3; i++) {
      const life = (t + i / 3) % 1;
      paintEmber(ctx, glow, q.x - 3 + i * 3 + Math.sin(tau * life + i * 2) * 1.2 + lean * 0.4, q.y - r * 3 - life * 7, 0.7 * (1 - 0.6 * life), 1.2 * (1 - 0.6 * life), 0.9 * (1 - life) * alive);
    }
    // The release burst: a few sparks thrown out along the facing, fading over `burst` seconds.
    if (age >= -1e-6 && age < burst) {
      const k = clamp01(age / burst);
      const dir = c.project(add3(p, scale3(forward, 1)));
      const dx = dir.x - q.x;
      const dy = dir.y - q.y;
      const n = Math.hypot(dx, dy) || 1;
      ctx.save();
      ctx.strokeStyle = alpha(glow.ramp.lit, 1 - k);
      ctx.shadowColor = alpha(glow.ramp.base, 0.9 * (1 - k));
      ctx.shadowBlur = 6;
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const spread = (i - 3) * 0.42;
        const ca = Math.cos(spread);
        const sa = Math.sin(spread);
        const ux = (dx / n) * ca - (dy / n) * sa;
        const uy = (dx / n) * sa + (dy / n) * ca;
        const r0 = 5 + 16 * easeOutCubic(k);
        const r1 = r0 + 6 * (1 - k) * (i % 2 ? 0.6 : 1);
        ctx.beginPath();
        ctx.moveTo(q.x + ux * r0, q.y + uy * r0);
        ctx.lineTo(q.x + ux * r1, q.y + uy * r1);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, host ? { on: host } : {});
};
