/**
 * Helpers shared by the pieces of the scenery kit.
 *
 * Nothing here knows a theme material by name: pieces ask for a role (`role(ctx.materials, 'stone')`)
 * and the catalog decides which material plays it, so the kit can be re-materialed (grey crypt
 * stone, sandstone, bone gravel) without touching a piece.
 */

import { Path, Polygon, alpha, lerpColor, type Point, type Shape } from '@core/draw';
import { FLOOR_EDGE, Frame3, Solid, floorTile as engineFloorTile, vec3, type Camera, type FloorTile, type PieceContext, type SceneMaterials, type Vec3, type VolumeStyle } from '@core/volume';
import { PALETTES, STROKES } from '../theme';

// ----------------------------------------------------------------------------------------------
// Materials
// ----------------------------------------------------------------------------------------------

/**
 * The material that plays a role in the scene. `role(m, 'flagstone', 'stone')` tries the names in
 * order, so a piece can fall back to a plainer role. Throws an error that names the missing role
 * (a scene that forgot one fails loudly, not as a black volume).
 */
export function role(materials: SceneMaterials, ...names: string[]): VolumeStyle {
  for (const name of names) {
    const material = materials[name];
    if (material) return material;
  }
  const others = names.slice(1);
  throw new Error(`scenery: the scene has no material for the role "${names[0]}"${others.length ? ` (nor ${others.map(n => `"${n}"`).join(', ')})` : ''}. Roles it has: ${Object.keys(materials).join(', ') || 'none'}.`);
}

/** Tone between two ramp tones, `t` of the way from `a` to `b`. */
export const mixTone = (a: string, b: string, t: number) => lerpColor(a, b, t);

/** A tone between a material and its pale (t > 0) or dark (t < 0) end: stone is never quite one tone. */
export function tone(m: VolumeStyle, t: number): VolumeStyle {
  const ramp = m.ramp;
  const toward = (c: string) => mixTone(c, t > 0 ? ramp.lit : ramp.dark, Math.abs(t));
  return { ...m, ramp: { lit: toward(ramp.lit), base: toward(ramp.base), dark: toward(ramp.dark) } };
}

/** Thin uniform line (round caps) for small floor details. */
export const hairline = (color: string, width = 0.6) => STROKES.fine.with({ color, width, join: 'round' });

/** The contact shadow of floor slabs and walls on whatever lies under them: translucent theme ink. */
export const castShadow = (strength = 0.22) => alpha(PALETTES.ink, strength);

// ----------------------------------------------------------------------------------------------
// Geometry helpers
// ----------------------------------------------------------------------------------------------

/**
 * An axis-aligned box in world axes: `x0..x1` across the screen, `y0..y1` in depth (y grows towards
 * the camera), `z0..z1` up. Pieces build in these world offsets from the placement's origin.
 */
export function boxAt(origin: Frame3, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Solid {
  return Solid.box(origin.moved((x0 + x1) / 2, (y0 + y1) / 2, z0), x1 - x0, y1 - y0, z1 - z0);
}

/** The placement's frame with its axes along the world's (forward = +x, side = +y), whatever the facing. */
export const worldFrame = (ctx: Pick<PieceContext, 'frame'>): Frame3 => Frame3.facing(ctx.frame.origin, 0);

// ----------------------------------------------------------------------------------------------
// Walls and fences
// ----------------------------------------------------------------------------------------------

// A wall or fence cell builds straight into `ctx.object` (and its shadow into `ctx.ground`): the engine cuts it
// where it joins a neighbour, on the cell's border towards a connected east or west edge and above `ctx.seam(top)`
// towards a connected north one, so a run reads as one thing. A piece only has to keep what it draws at a border
// the same in every mask and variant, and keep posts and finials near a connected north edge below its seam line.

/** A rectangle on the floor (world `x0..x1` across, `y0..y1` in depth, from the placement's origin) as a screen shape. */
export function groundPatch(cam: Camera, origin: Vec3, x0: number, x1: number, y0: number, y1: number): Shape {
  const at = (x: number, y: number) => cam.project(vec3(origin.x + x, origin.y + y, 0));
  return Polygon.fromPoints([at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]);
}

// ----------------------------------------------------------------------------------------------
// Floor tiles
// ----------------------------------------------------------------------------------------------

/** What a floor piece paints with: the engine's floor tile (guide 04 §3.1). */
export type Tile = FloorTile;

/**
 * Paints one floor frame with the engine's `floorTile`: a whole tile or a dual-grid transition, drawn in screen pixels
 * around the projected origin and clipped to itself. `paint` draws the material over `t.region` and its details; whatever
 * it draws outside the region (tufts, a slab's side) stays inside the tile and close to the edge.
 *
 * What the kit decides here: every floor uses the engine's `FLOOR_EDGE` (the same roughness for all of them, so a lower
 * floor's edge lies exactly under a higher one's), the bevel is stroked with `STROKES.fine`, and the lowest floor
 * (priority 0) does not grow its transitions: nothing lies under it for antialiasing to let through.
 */
export function floorTile(ctx: PieceContext, o: { priority: number; salt?: number; paint: (t: Tile) => void }): void {
  engineFloorTile(ctx, {
    salt: o.salt,
    paint: o.paint,
    edge: o.priority === 0 ? { ...FLOOR_EDGE, grow: 0 } : FLOOR_EDGE,
    line: STROKES.fine,
  });
}

// ----------------------------------------------------------------------------------------------
// Small drawing helpers for floor details
// ----------------------------------------------------------------------------------------------

/** The engine's irregular blob (a stain, a pebble, moss on a stone) from an ellipse roughened by noise. */
export { floorBlob as blob } from '@core/volume';

/** A small rune in decal space: a stem with two raised branches, centred on the origin. The kit's ward, burned into piers and posts. */
export function runeShape(): Shape {
  const bar = (a: Point, b: Point) => new Path([a, b]).toShape({ width: 0.8, cap: 'round' });
  return bar({ x: 0, y: -2.3 }, { x: 0, y: 2.3 }).union([bar({ x: 0, y: -0.2 }, { x: -1.6, y: -2.1 }), bar({ x: 0, y: -0.2 }, { x: 1.6, y: -2.1 })]);
}

/** Style of a glowing mark (a rune) laid on stone or timber: the glow role's saturated base and a small halo. */
export const soulMark = (glow: VolumeStyle) => ({ fill: glow.ramp.base, shadow: { color: alpha(glow.ramp.base, 0.9), x: 0, y: 0, blur: 3.5 } });

/** A glowing flame or lantern core: the glow role's saturated base with a pale core and a halo, drawn as a shape, not a volume. */
export function glowFlame(c: CanvasRenderingContext2D, glow: VolumeStyle, at: Point, size: number, strength = 0.9): void {
  const r = glow.ramp;
  const flame = Polygon.circle(size, { cx: at.x, cy: at.y, segments: 20 }).union(Polygon.triangle(size * 1.7, size * 2.6, { cx: at.x, cy: at.y - size * 1.9 })).roundCorners(size * 0.4);
  flame.draw(c, { fill: r.base, celShade: { shade: r.dark, lightPivot: 'bottom', litScale: 0.7 }, shadow: { color: alpha(r.base, strength), x: 0, y: 0, blur: size * 6 } });
  Polygon.circle(size * 0.45, { cx: at.x, cy: at.y - size * 0.2, segments: 12 }).fill(c, r.lit);
}

