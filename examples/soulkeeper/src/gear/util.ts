/**
 * Helpers shared by the parts of the kit.
 *
 * Nothing here knows a theme material: parts ask for a role (`role`), and the outfit decides.
 */

import { alpha, Polygon } from '@core/draw';
import type { Grip, MaterialSet, PartContext } from '@core/rig';
import { Frame3, Round, Solid, cross3, dot3, len3, norm3, scale3, sub3, vec3, type Placed, type ShadeRamp, type Vec3, type VolumeStyle } from '@core/volume';

/** A part with no options. */
export type NoOptions = Record<string, never>;

/**
 * The material that plays a role in the outfit. `role(m, 'blade', 'metal')` tries the names in
 * order, so a part can fall back to a plainer role when the outfit does not set the fine one.
 * Throws an error that names the missing role (an outfit that forgot one fails loudly, not as a
 * black volume).
 */
export function role(materials: MaterialSet, ...names: string[]): VolumeStyle {
  for (const name of names) {
    const material = materials[name];
    if (material) return material;
  }
  const others = names.slice(1);
  throw new Error(`gear: the outfit has no material for the role "${names[0]}"${others.length ? ` (nor ${others.map(n => `"${n}"`).join(', ')})` : ''}. Roles it has: ${Object.keys(materials).join(', ') || 'none'}.`);
}

/** The ramp of a role: flat decal fills (rivets, teeth, runes) take their tones from it. */
export const tones = (materials: MaterialSet, ...names: string[]): ShadeRamp => role(materials, ...names).ramp;

/**
 * Halo of a glowing role: the role's saturated base at `strength` alpha, `blur` logical px wide.
 * Same shape as the theme's `GLOWS` entries, but follows the role, so a fire outfit glows orange.
 */
export const halo = (glow: VolumeStyle, blur: number, strength = 0.9) => ({ color: alpha(glow.ramp.base, strength), x: 0, y: 0, blur });

/**
 * A hip choice read from an option: -1 (left) or 1 (right). An editor's select stores its choices
 * as strings, so `'-1'` and `'1'` are accepted too; anything else takes `fallback`.
 */
export function hipSide(value: unknown, fallback: -1 | 1): -1 | 1 {
  const n = Number(value);
  return n < 0 ? -1 : n > 0 ? 1 : fallback;
}

/** The arm that hangs on `side` (-1 left, 1 right) of a skeleton. */
export function armOf(ctx: Pick<PartContext, 'kit'>, side: number) {
  const arm = (ctx.kit.skeleton.arms ?? []).find(a => a.side === side);
  if (!arm) throw new Error(`gear: skeleton "${ctx.kit.skeleton.name}" has no ${side < 0 ? 'left' : 'right'} arm`);
  return arm;
}

/** The leg on `side`, picked the way `slotFrame` picks it (by the sign of the hip offset). */
export function legOf(ctx: Pick<PartContext, 'kit'>, side: number) {
  const { legs } = ctx.kit.skeleton;
  return legs.find(l => Math.sign(l.offset[1]) === side) ?? legs[0];
}

/** Tube width with vertebra-like bumps along it. */
export const knobbly = (w: number, n: number) => (t: number) => w * (0.85 + 0.25 * Math.abs(Math.sin(t * Math.PI * n)));

/** A flat plate hanging from `origin`: profile x runs along `down`, y along `across`, `thick` outwards. */
export function plate(origin: Vec3, down: Vec3, across: Vec3, profile: Polygon, thick: number): Solid {
  const d = norm3(down);
  const a = norm3(sub3(across, scale3(d, dot3(across, d))));
  return Solid.extrude(new Frame3(origin, d, a, norm3(cross3(d, a))), profile, thick);
}

/** Torn hem of a cloth panel: profile from the waist (x = 0) down to `length`, `width` across. */
export function tornPanel(length: number, width: number, teeth: number[]): Polygon {
  const half = width / 2;
  const hem = teeth.map((dx, i) => ({ x: length + dx, y: half - (width * (i + 0.5)) / teeth.length }));
  return Polygon.fromPoints([{ x: 0, y: -half * 0.85 }, { x: 0, y: half * 0.85 }, { x: length * 0.8, y: half }, ...hem, { x: length * 0.8, y: -half }]);
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Scale of a skeleton against the 80-unit `humanoid()`: parts that must follow a taller or shorter body scale their lengths by it. */
export const scaleOf = (ctx: Pick<PartContext, 'kit'>) => ctx.kit.skeleton.height / 80;

/**
 * A right-handed frame at `origin` whose `up` axis is `axis` (a hanging lantern, a rib around a
 * staff). Its forward is `hint` squared against the axis (any horizontal direction when they are parallel).
 */
export function axisFrame(origin: Vec3, axis: Vec3, hint: Vec3 = vec3(1, 0, 0)): Frame3 {
  const u = norm3(axis);
  let f = sub3(hint, scale3(u, dot3(hint, u)));
  if (len3(f) < 1e-4) f = cross3(u, vec3(0, 1, 0));
  f = norm3(f);
  return new Frame3(origin, f, cross3(u, f), u);
}

/**
 * A plain closed hand round what it holds (`ctx.grip`), for the kit's hand parts while their hand
 * holds something: one fist mass round the handle where the palm closes, the knuckles on along the
 * hand, wide enough for the handle, drawn over the handle and over the end of the arm it rests `on`.
 * Kept simple on purpose; an empty hand keeps its own drawing. `k` is the hand's size (the skeleton's
 * scale times the part's own). Returns the fist.
 */
export function closedHand(ctx: PartContext, grip: Grip, style: VolumeStyle, k: number): Placed {
  const f = axisFrame(grip.at, grip.axis, grip.palm.along);
  const fist = Round.ellipsoid(f.moved(0.4 * k, 0, 0), 2.1 * k, Math.max(1.8 * k, grip.radius + 0.6 * k), 2 * k);
  // A grip behind a board (a shield's strap) is hidden by it while the board faces the camera.
  const hidden = grip.behind !== undefined && ctx.kit.camera.faces(grip.behind);
  ctx.object.add(fist, style, { bias: (hidden ? -5 : 5) * k, ...(ctx.host ? { on: ctx.host } : {}) });
  return fist;
}
