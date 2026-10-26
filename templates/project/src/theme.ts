/**
 * Project theme: the single source of truth for colors, line weights, the camera and the materials.
 * Asset files compose these tokens; they never write raw hex colors or stroke settings.
 *
 * The values are a neutral start (muted materials, one warm accent, a 3/4 view from above lit from
 * the upper left). Make them the project's own (the diorama-style skill says how), keep the structure:
 * PALETTES -> RAMPS -> STROKES -> CONTOUR and CAMERA -> VOLUMES, and SHAPE_STYLES for flat marks.
 */

import { ShapeStyle, StrokeStyle, alpha, lerpColor } from '@core/draw';
import { Camera, type VolumeStyle } from '@core/volume';

/** Named colors. Each material has a lit, a base and a dark step that differ clearly in value. */
export const PALETTES = {
  ink: '#15131a',
  white: '#f4f1ea',
  // Cloth: a muted slate blue. The block-out material of new characters (the first key of VOLUMES).
  clothLit: '#8e9ab0',
  cloth: '#5a647a',
  clothDark: '#30364a',
  // Skin: a warm, desaturated tan.
  skinLit: '#e8c8aa',
  skin: '#b88d6e',
  skinDark: '#6d4c3d',
  // Wood: brown timber, darker than the skin.
  woodLit: '#a27c5a',
  wood: '#6c4f38',
  woodDark: '#3a2a20',
  // Stone: a cool grey for floors, walls and plinths.
  stoneLit: '#b8b4ac',
  stone: '#7e7a72',
  stoneDark: '#45423e',
  // Metal: a blue-grey that shines (highlight in VOLUMES).
  metalLit: '#d0d4dc',
  metal: '#868c98',
  metalDark: '#3f434d',
  // Accent: the one saturated color (a gem, a flame, eyes, a selected slot). Keep it small.
  accentLit: '#ffd889',
  accent: '#eaa13a',
  accentDark: '#94601c',
};

/** Three tones per material: faces and round parts pick one from the light they receive. */
export const RAMPS = {
  cloth: { lit: PALETTES.clothLit, base: PALETTES.cloth, dark: PALETTES.clothDark },
  skin: { lit: PALETTES.skinLit, base: PALETTES.skin, dark: PALETTES.skinDark },
  wood: { lit: PALETTES.woodLit, base: PALETTES.wood, dark: PALETTES.woodDark },
  stone: { lit: PALETTES.stoneLit, base: PALETTES.stone, dark: PALETTES.stoneDark },
  metal: { lit: PALETTES.metalLit, base: PALETTES.metal, dark: PALETTES.metalDark },
  accent: { lit: PALETTES.accentLit, base: PALETTES.accent, dark: PALETTES.accentDark },
};

/** Line weights in logical px (the export doubles them at scale 2). */
export const STROKES = {
  // Around a flat piece (an effect's shape, a HUD frame).
  outline: new StrokeStyle({ width: 2.2, color: PALETTES.ink, renderer: 'ribbon', join: 'round' }),
  // Inside a piece, and the base of the inner lines of VOLUMES.
  detail: new StrokeStyle({ width: 1.1, color: PALETTES.ink, renderer: 'ribbon', join: 'round' }),
};

/** Glows and soft shadows: the `shadow` of a style, or the color of a contact shadow on the floor. */
export const GLOWS = {
  accent: { color: alpha(PALETTES.accent, 0.85), x: 0, y: 0, blur: 8 },
  ground: alpha(PALETTES.ink, 0.45),
};

/** Flat marks drawn with `@core/draw`: decals on volumes, contact shadows under props. */
export const SHAPE_STYLES = {
  /** Contact shadow on the floor under props (groundShadow shapes). */
  groundShadow: new ShapeStyle({ fill: GLOWS.ground }),
  /** A mark carved into a surface: a dark fill with a pale lip. */
  carve: new ShapeStyle({
    fill: alpha(PALETTES.ink, 0.32),
    stroke: STROKES.detail.with({ color: alpha(PALETTES.white, 0.3), width: 0.6 }),
  }),
};

/**
 * Line hierarchy of every volume asset: one ink contour around each object (heavy, outside) and
 * lines between parts in a darker shade of each material (see VOLUMES), so inner details separate
 * without turning into black wires. Keep the contour heavier than the inner lines.
 */
export const CONTOUR = { width: 1.25, color: PALETTES.ink };

/**
 * The 2.5D view shared by every asset of the project (props, scenery, effects, characters): one
 * tilt, height boost, light and contour make them all match. Place it per asset with
 * `CAMERA.at(origin)`; never create a camera inside an asset.
 */
export const CAMERA = new Camera({ tilt: 48, heightBoost: 1.2, light: { azimuth: 140, elevation: 45, ambient: 0.35 }, contour: CONTOUR });

/** Line between parts: a darker shade of the material itself (selective outline), thinner than the contour. */
const inner = (ramp: { dark: string }, width = 0.9) => STROKES.detail.with({ color: lerpColor(ramp.dark, PALETTES.ink, 0.6), width });
/** Thin line at the creases of faceted solids. */
const edge = STROKES.detail.with({ color: alpha(PALETTES.ink, 0.45), width: 0.8 });

/**
 * Materials of volume assets: a ramp, the inner line, the crease edge and optional form shading
 * (`form`: `highlight: false` for matte cloth, a stronger highlight for metal). See the quality bar
 * of the diorama-volume skill. Add a material by adding a key here (every entry is checked against
 * VolumeStyle); never a second VOLUMES-like export.
 */
export const VOLUMES = {
  // Matte cloth: no highlight, a wider core shadow.
  cloth: { ramp: RAMPS.cloth, stroke: inner(RAMPS.cloth, 1), edge, form: { highlight: false, core: { ratio: 0.36, min: 1.2, max: 4 } } },
  skin: { ramp: RAMPS.skin, stroke: inner(RAMPS.skin, 0.8), edge },
  wood: { ramp: RAMPS.wood, stroke: inner(RAMPS.wood, 1), edge },
  stone: { ramp: RAMPS.stone, stroke: inner(RAMPS.stone, 1), edge },
  metal: { ramp: RAMPS.metal, stroke: inner(RAMPS.metal), edge: inner(RAMPS.metal, 0.6), form: { highlight: { ratio: 0.2, min: 0.6, max: 1.6 } } },
  // The accent as a material: a gem, a flame, a status light, a selected slot. Glows take GLOWS.accent as their shadow.
  accent: { ramp: RAMPS.accent, stroke: inner(RAMPS.accent, 0.8), edge: inner(RAMPS.accent, 0.6), form: { highlight: { ratio: 0.2, min: 0.6, max: 1.6 } } },
} satisfies Record<string, VolumeStyle>;
