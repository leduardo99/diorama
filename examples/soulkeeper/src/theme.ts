/**
 * Project Design System & Theme Tokens
 *
 * Single source of truth for palettes, ramps, strokes, and shape styles.
 * Never hardcode raw hex colors or stroke settings in asset files.
 */

import { StrokeStyle, ShapeStyle, Stipple, alpha, lerpColor } from '@core/draw';
import { Camera, type VolumeStyle } from '@core/volume';

export const PALETTES = {
  bg: '#14121a',
  surface: '#242030',
  surfaceLit: '#38324a',
  accent: '#e6a15c',
  accentLit: '#ffc885',
  ink: '#0d0b12',
  white: '#f5f3fa',

  // Characters: cloth, bone, flesh, wood, iron and the spectral "soul fire".
  robeLit: '#54407a',
  robe: '#33284d',
  robeDark: '#1c1530',
  sash: '#7c2a3e',
  sashLit: '#a8435a',
  sashDark: '#4a1626',
  boneLit: '#f2ead4',
  bone: '#cdbf9d',
  boneDark: '#8a7b61',
  fleshLit: '#d9d4e6',
  flesh: '#a49fbc',
  fleshDark: '#655f80',
  // Living skin: a warm, muted rose-tan, desaturated to sit in the dusk palette; `flesh` above is
  // paler and cold on purpose — it serves smoke wisps and glyph highlights, not people.
  skinLit: '#e3bfa3',
  skin: '#b08d79',
  skinDark: '#5e443c',
  // Warm golden-brown skin: deeper and warmer than `skin`, its shadow a warm brown, never grey.
  skinWarmLit: '#e2a983',
  skinWarm: '#c3845e',
  skinWarmDark: '#8b573d',
  // Lips: a muted rose-brown, between the warm skin's shadow and a red, so a closed mouth reads as
  // lips, not a dark line.
  lipsLit: '#b65e4a',
  lips: '#963f33',
  lipsDark: '#6a2a24',
  // Dark brown hair, almost black: a warm near-black with a lit step that still reads as brown.
  hairLit: '#3b2a20',
  hair: '#231812',
  hairDark: '#120b08',
  woodLit: '#715749',
  wood: '#47362e',
  woodDark: '#2a1f1b',
  ironLit: '#8a8799',
  iron: '#535064',
  ironDark: '#2b2935',
  // Armour plate: a darker steel than `steel` with a bright lit step, so fitted plates read as
  // polished metal (a dark base, lit edges, a deep core shadow) and not as flat grey.
  armorLit: '#dedce8',
  armor: '#7a778c',
  armorDark: '#383545',
  soulLit: '#d6fff2',
  soul: '#5cf0c4',
  soulDark: '#1d8a76',
  // Ghoul fur: cold slate, darker than stone so creatures stand out from graves.
  furLit: '#8a86a0',
  fur: '#5b576f',
  furDark: '#34313f',
  // Weathered grave stone (tombstones, plinths): cool grey with a violet cast, lighter than iron.
  stoneLit: '#b3adbd',
  stone: '#7a7489',
  stoneDark: '#433e52',
  // Worn leather (belts, straps, grips) and the dark of hollow bodies (rib cages, mouths).
  leatherLit: '#9a6b4b',
  leather: '#6a4632',
  leatherDark: '#3a251c',
  hollow: '#1f1726',
  // Ghoul fur belly and muzzle: a paler slate.
  furPale: '#b4afc4',
  // Gilded fittings (ossuary captain): a muted brass, far from the soul fire's saturation.
  brassLit: '#ecd29a',
  brass: '#b58c45',
  brassDark: '#654722',
  // Scenery floors (graveyard kit): calm and darker than the actors on them. Packed grave earth, a
  // cool grey flagstone darker than the wall stone, the dark mortar between stones, dead moss and
  // bone gravel. Muted on purpose: the soul green stays the only saturated accent.
  dirtLit: '#7c6c62',
  dirt: '#4a3f40',
  dirtDark: '#211a1f',
  flagLit: '#7a7581',
  flag: '#585460',
  flagDark: '#36323f',
  mortarLit: '#3a3445',
  mortar: '#1c1823',
  mortarDark: '#100d16',
  mossLit: '#80815a',
  moss: '#4b4c37',
  mossDark: '#23251b',
  gravelLit: '#8c867e',
  gravel: '#585350',
  gravelDark: '#27242b',
  // Weathered grey timber (fences): lighter than the dark wood of chests and shields so it reads against dirt.
  timberLit: '#9a8f82',
  timber: '#695f55',
  timberDark: '#3f3733',
  // Murky water (flooded crypts): a dark, cool slate with a violet cast, darker than the flagstones it floods, a pale wet rim.
  waterLit: '#566c7d',
  water: '#212d39',
  waterDark: '#10161e',
  // Glazed funerary ceramic (urns): a dusk violet-grey clay glaze, lighter than the dirt and the flagstones it stands on, darker than the wall stone.
  ceramicLit: '#aa91b4',
  ceramic: '#6c5575',
  ceramicDark: '#392a45',
  // Item kit (src/items). Rarity tiers above bone and iron grey are muted metals too: a steel blue and a dusk violet;
  // legendary is the only tier that burns soul green. Each has a lit and a dark step for the slot frames' bevels.
  steelBlueLit: '#a9c4e2',
  steelBlue: '#6a92bd',
  steelBlueDark: '#2f4a6e',
  violetLit: '#c4aef0',
  violet: '#9672cc',
  violetDark: '#45306f',
  // Flask glass: a pale cool blue-grey, thin and bright next to the steel blue.
  glassLit: '#d5e0ee',
  glass: '#8696b2',
  glassDark: '#4a5470',
  // Old vellum (scrolls): a warmer, yellower pale than bone, so a scroll and a bone key never merge.
  parchmentLit: '#eee3c4',
  parchment: '#c7b68b',
  parchmentDark: '#7d6c4a',
};

export const RAMPS = {
  surface: {
    lit: PALETTES.surfaceLit,
    base: PALETTES.surface,
    dark: PALETTES.bg,
  },
  accent: {
    lit: PALETTES.accentLit,
    base: PALETTES.accent,
    dark: '#9e6231',
  },
  robe: { lit: PALETTES.robeLit, base: PALETTES.robe, dark: PALETTES.robeDark },
  sash: { lit: PALETTES.sashLit, base: PALETTES.sash, dark: PALETTES.sashDark },
  bone: { lit: PALETTES.boneLit, base: PALETTES.bone, dark: PALETTES.boneDark },
  flesh: { lit: PALETTES.fleshLit, base: PALETTES.flesh, dark: PALETTES.fleshDark },
  skin: { lit: PALETTES.skinLit, base: PALETTES.skin, dark: PALETTES.skinDark },
  skinWarm: { lit: PALETTES.skinWarmLit, base: PALETTES.skinWarm, dark: PALETTES.skinWarmDark },
  lips: { lit: PALETTES.lipsLit, base: PALETTES.lips, dark: PALETTES.lipsDark },
  hair: { lit: PALETTES.hairLit, base: PALETTES.hair, dark: PALETTES.hairDark },
  wood: { lit: PALETTES.woodLit, base: PALETTES.wood, dark: PALETTES.woodDark },
  iron: { lit: PALETTES.ironLit, base: PALETTES.iron, dark: PALETTES.ironDark },
  soul: { lit: PALETTES.soulLit, base: PALETTES.soul, dark: PALETTES.soulDark },
  stone: { lit: PALETTES.stoneLit, base: PALETTES.stone, dark: PALETTES.stoneDark },
  fur: { lit: PALETTES.furLit, base: PALETTES.fur, dark: PALETTES.furDark },
  furPale: { lit: '#d8d4e4', base: PALETTES.furPale, dark: PALETTES.furLit },
  leather: { lit: PALETTES.leatherLit, base: PALETTES.leather, dark: PALETTES.leatherDark },
  hollow: { lit: PALETTES.robeDark, base: PALETTES.hollow, dark: PALETTES.ink },
};

export const STROKES = {
  bold: new StrokeStyle({
    width: 4,
    color: PALETTES.ink,
    renderer: 'ribbon',
    join: 'round',
  }),

  fine: new StrokeStyle({
    width: 1.5,
    color: PALETTES.ink,
    renderer: 'clean',
  }),

  // The calligraphic 'ribbon' renderer with a round join:
  inkArt: new StrokeStyle({
    width: 3.5,
    color: PALETTES.ink,
    renderer: 'ribbon',
    join: 'round',
  }),

  // Character line weights (logical px, export scale 2).
  outline: new StrokeStyle({
    width: 2.2,
    color: PALETTES.ink,
    renderer: 'ribbon',
    join: 'round',
  }),
  detail: new StrokeStyle({
    width: 1.1,
    color: PALETTES.ink,
    renderer: 'ribbon',
    join: 'round',
  }),
  soulTrail: new StrokeStyle({
    width: 1.4,
    color: alpha(PALETTES.soul, 0.75),
    renderer: 'ribbon',
    join: 'round',
    taperStart: true,
    taperEnd: true,
  }),
};

/** Soft glows and shadows shared by every character. */
export const GLOWS = {
  soul: { color: alpha(PALETTES.soul, 0.9), x: 0, y: 0, blur: 10 },
  soulFaint: { color: alpha(PALETTES.soul, 0.55), x: 0, y: 0, blur: 6 },
  ground: alpha(PALETTES.ink, 0.45),
};

export const SHAPE_STYLES = {
  panel: new ShapeStyle({
    fill: PALETTES.surface,
    stroke: STROKES.bold,
    shadow: {
      color: alpha(PALETTES.ink, 0.4),
      x: 0,
      y: 4,
      blur: 8,
    },
  }),

  // Volume with cel-shaded lighting:
  gem: new ShapeStyle({
    fill: RAMPS.accent.base,
    celShade: {
      shade: RAMPS.accent.dark,
      lightPivot: 'topLeft',
      litScale: 0.84,
    },
    stroke: STROKES.fine,
  }),

  // Flat materials laid on volume props as decals (carved stone, cracks, glowing eyes): the props' light comes from CAMERA.
  bone: new ShapeStyle({
    fill: RAMPS.bone.base,
    celShade: { shade: RAMPS.bone.dark, lightPivot: 'topRight', litScale: { x: 0.78, y: 0.8 } },
    stroke: STROKES.detail,
  }),
  soul: new ShapeStyle({
    fill: RAMPS.soul.base,
    celShade: { shade: RAMPS.soul.dark, lightPivot: 'bottom', litScale: 0.7 },
    shadow: GLOWS.soul,
  }),

  // Decals carved into stone volumes (VOLUMES.stone).
  stoneCarve: new ShapeStyle({
    fill: alpha(PALETTES.ink, 0.32),
    stroke: STROKES.detail.with({ color: alpha(PALETTES.stoneLit, 0.4), width: 0.6 }),
  }),
  stoneRelief: new ShapeStyle({
    fill: PALETTES.stoneLit,
    stroke: STROKES.detail.with({ color: alpha(PALETTES.ink, 0.7), width: 0.7 }),
  }),
  stoneCrack: new ShapeStyle({ fill: alpha(PALETTES.ink, 0.75) }),
  /** Contact shadow on the floor under props (groundShadow shapes). */
  groundShadow: new ShapeStyle({ fill: GLOWS.ground }),
};

/**
 * 2.5D view shared by every volume asset of the project (props, scenery, characters):
 * Hades-like 3/4 tilt, one light from the upper left. Place it per asset with `CAMERA.at(origin)`.
 */
/**
 * Line hierarchy of every volume asset: one ink contour around each object (heavy, outside) and
 * lines between parts in a darker shade of each material (selective outline, see VOLUMES), so
 * inner details separate without turning into black wires.
 */
export const CONTOUR = { width: 1.25, color: PALETTES.ink };

export const CAMERA = new Camera({ tilt: 48, heightBoost: 1.2, light: { azimuth: 140, elevation: 45, ambient: 0.35 }, contour: CONTOUR });

const edge = STROKES.detail.with({ color: alpha(PALETTES.ink, 0.45), width: 0.8 });

const inner = (ramp: { dark: string }, width = 0.9) => STROKES.detail.with({ color: lerpColor(ramp.dark, PALETTES.ink, 0.6), width });

/**
 * Materials of volume assets: ramp + inner line + crease edge (+ form shading).
 * Add a material by adding a key here (the type is inferred, every entry is checked against
 * VolumeStyle); never a second VOLUMES-like export.
 */
export const VOLUMES = {
  wood: { ramp: RAMPS.wood, stroke: inner(RAMPS.wood, 1), edge },
  // Painted shield planks: a lighter wood so the disc reads as a surface, not a hole.
  shield: { ramp: { lit: '#a3805f', base: PALETTES.woodLit, dark: PALETTES.wood }, stroke: inner(RAMPS.wood, 0.9), edge },
  iron: { ramp: RAMPS.iron, stroke: inner(RAMPS.iron), edge: inner(RAMPS.iron, 0.6), form: { highlight: { ratio: 0.2, min: 0.6, max: 1.6 } } },
  bone: { ramp: RAMPS.bone, stroke: inner(RAMPS.bone), edge },
  boneLimb: { ramp: RAMPS.bone, stroke: inner(RAMPS.bone, 0.8), edge },
  // Gaps carved into bone: one flat shadow tone, no outline.
  boneGroove: { ramp: { lit: PALETTES.boneDark, base: PALETTES.boneDark, dark: PALETTES.boneDark } },
  // Pale grey-violet, matte like cloth: smoke wisps and glyph highlights, not skin.
  flesh: { ramp: RAMPS.flesh, stroke: inner(RAMPS.flesh), edge, form: { highlight: { ratio: 0.14, min: 0.5, max: 1.4 } } },
  // Skin for living people: the same matte treatment as the flesh volume, on the warm skin ramp.
  skin: { ramp: RAMPS.skin, stroke: inner(RAMPS.skin), edge, form: { highlight: { ratio: 0.14, min: 0.5, max: 1.4 } } },
  // Warm golden-brown skin, the same matte treatment on a deeper, warmer ramp, with a broader
  // highlight so a face a few pixels across still shows its modelling past the hair over its sides.
  skinWarm: { ramp: RAMPS.skinWarm, stroke: inner(RAMPS.skinWarm), edge, form: { highlight: { ratio: 0.2, min: 0.6, max: 2 } } },
  // Lips, laid flat on a face: no shading of their own.
  lips: { ramp: RAMPS.lips, form: { highlight: false } },
  // Dark hair: a soft sheen on the lit side, inner lines a shade darker than the hair so the locks separate.
  hair: { ramp: RAMPS.hair, stroke: inner(RAMPS.hair, 0.8), edge: inner(RAMPS.hair, 0.6), form: { highlight: { ratio: 0.12, min: 0.4, max: 1 } } },
  // Matte cloth: no highlight, a wider core shadow.
  robe: { ramp: RAMPS.robe, stroke: inner(RAMPS.robe, 1), edge, form: { highlight: false, core: { ratio: 0.36, min: 1.2, max: 4 } } },
  sash: { ramp: RAMPS.sash, stroke: inner(RAMPS.sash), edge: inner(RAMPS.sash, 0.6), form: { highlight: false } },
  // A lighter sash for trims that must read at 1x (hood rims, cowl edges): sashLit up a step.
  sashLit: { ramp: { lit: PALETTES.accentLit, base: PALETTES.sashLit, dark: PALETTES.sash }, stroke: inner(RAMPS.sash), edge: inner(RAMPS.sash, 0.6), form: { highlight: false } },
  leather: { ramp: RAMPS.leather, stroke: inner(RAMPS.leather, 0.8), edge: inner(RAMPS.leather, 0.6) },
  hollow: { ramp: RAMPS.hollow, form: { highlight: false } },
  fur: { ramp: RAMPS.fur, stroke: inner(RAMPS.fur, 1), edge, form: { highlight: { ratio: 0.1, min: 0.5, max: 1.2 } } },
  furLimb: { ramp: RAMPS.fur, stroke: inner(RAMPS.fur, 0.9), edge },
  // Mane clumps: a darker value than the body, so the ruff reads as one mass.
  mane: { ramp: { lit: PALETTES.fur, base: PALETTES.furDark, dark: '#211e29' }, stroke: inner({ dark: '#211e29' }, 0.8), form: { highlight: { ratio: 0.12, min: 0.4, max: 0.9 } } },
  furPale: { ramp: RAMPS.furPale, stroke: inner(RAMPS.fur, 0.8), edge, form: { highlight: false } },
  // Weapon blades: lighter than plain iron so they read against dark floors.
  blade: { ramp: { lit: PALETTES.white, base: PALETTES.stoneLit, dark: PALETTES.ironLit }, stroke: inner(RAMPS.iron, 0.8), edge: inner(RAMPS.iron, 0.6) },
  stone: {
    ramp: RAMPS.stone,
    stroke: inner(RAMPS.stone, 1),
    edge,
    texture: new Stipple({ density: 0.05, minRadius: 0.3, maxRadius: 0.8, color: alpha(PALETTES.stoneDark, 0.55), seed: 11 }),
  },
  // Aged, darker bone for limbs that must separate from a pale carapace (bone spider).
  legBone: {
    ramp: { lit: PALETTES.bone, base: PALETTES.boneDark, dark: lerpColor(PALETTES.boneDark, PALETTES.ink, 0.45) },
    stroke: inner({ dark: PALETTES.boneDark }, 0.8),
    edge,
  },
  // Soul fire as a material role (`glow` in the gear kit): eyes, runes and fire effects take their
  // saturated base, pale core and halo from this ramp, so another outfit can burn in another color.
  soul: { ramp: RAMPS.soul },
  // Polished steel: a step lighter than `iron`, still darker than `blade`, so armor separates from bone.
  steel: { ramp: { lit: PALETTES.stoneLit, base: PALETTES.ironLit, dark: PALETTES.iron }, stroke: inner(RAMPS.iron), edge: inner(RAMPS.iron, 0.6), form: { highlight: { ratio: 0.2, min: 0.6, max: 1.6 } } },
  // Armour plate: the darker steel ramp with a broad highlight on the lit edge, a deep core shadow
  // and a cool reflected light inside it, the three cues that make a curved plate read as metal.
  armor: {
    ramp: { lit: PALETTES.armorLit, base: PALETTES.armor, dark: PALETTES.armorDark },
    stroke: inner({ dark: PALETTES.armorDark }),
    edge: inner({ dark: PALETTES.armorDark }, 0.6),
    form: { highlight: { ratio: 0.22, min: 0.7, max: 1.8 }, core: { ratio: 0.36, min: 1.1, max: 4 }, rim: { color: PALETTES.ironLit, width: 0.55 } },
  },
  // Gilded metal for rank (pauldrons, a sword's guard, a crest's comb).
  brass: {
    ramp: { lit: PALETTES.brassLit, base: PALETTES.brass, dark: PALETTES.brassDark },
    stroke: inner({ dark: PALETTES.brassDark }),
    edge: inner({ dark: PALETTES.brassDark }, 0.6),
    form: { highlight: { ratio: 0.2, min: 0.6, max: 1.6 } },
  },
  // Scenery kit (src/scenery): floors read calmer than the actors, so their inner lines are thin.
  // Packed grave earth.
  dirt: { ramp: { lit: PALETTES.dirtLit, base: PALETTES.dirt, dark: PALETTES.dirtDark }, stroke: inner({ dark: PALETTES.dirtDark }, 0.7) },
  // Flagstones of crypt floors: a step darker than the wall stone, so walls and tombstones stand out from them.
  flagstone: { ramp: { lit: PALETTES.flagLit, base: PALETTES.flag, dark: PALETTES.flagDark }, stroke: inner({ dark: PALETTES.flagDark }, 0.7), edge: inner({ dark: PALETTES.flagDark }, 0.5) },
  // The dark joint between stones (wall courses, flagstones).
  mortar: { ramp: { lit: PALETTES.mortarLit, base: PALETTES.mortar, dark: PALETTES.mortarDark } },
  // Dead grass and moss: muted olive, far from the soul fire's saturation.
  moss: { ramp: { lit: PALETTES.mossLit, base: PALETTES.moss, dark: PALETTES.mossDark }, stroke: inner({ dark: PALETTES.mossDark }, 0.7), form: { highlight: false } },
  // Gravel the bones lie in.
  gravel: { ramp: { lit: PALETTES.gravelLit, base: PALETTES.gravel, dark: PALETTES.gravelDark }, stroke: inner({ dark: PALETTES.gravelDark }, 0.7) },
  // Weathered grey timber: fence pickets and rails.
  timber: { ramp: { lit: PALETTES.timberLit, base: PALETTES.timber, dark: PALETTES.timberDark }, stroke: inner({ dark: PALETTES.timberDark }, 0.8), edge },
  // Still murky water over flagstones: a flat dark surface, calmer than the stone it floods.
  water: { ramp: { lit: PALETTES.waterLit, base: PALETTES.water, dark: PALETTES.waterDark }, stroke: inner({ dark: PALETTES.waterDark }, 0.7), form: { highlight: false } },
  // Glazed ceramic (funerary urns): a dusk violet-grey glaze with a clear highlight.
  ceramic: { ramp: { lit: PALETTES.ceramicLit, base: PALETTES.ceramic, dark: PALETTES.ceramicDark }, stroke: inner({ dark: PALETTES.ceramicDark }, 0.9), edge },
  // Item kit (src/items): flask glass, vellum and the soul crystal of shards, gems and potions (the `soul` ramp with inked creases,
  // which the glow role of the gear kit has none of, so facets and a flask's shell read as solids).
  glass: { ramp: { lit: PALETTES.glassLit, base: PALETTES.glass, dark: PALETTES.glassDark }, stroke: inner({ dark: PALETTES.glassDark }, 0.8), edge, form: { highlight: { ratio: 0.22, min: 0.6, max: 1.8 } } },
  parchment: { ramp: { lit: PALETTES.parchmentLit, base: PALETTES.parchment, dark: PALETTES.parchmentDark }, stroke: inner({ dark: PALETTES.parchmentDark }, 0.8), edge, form: { highlight: false } },
  crystal: { ramp: RAMPS.soul, stroke: inner(RAMPS.soul, 0.8), edge: inner(RAMPS.soul, 0.6), form: { highlight: { ratio: 0.2, min: 0.6, max: 1.6 } } },
} satisfies Record<string, VolumeStyle>;

// ----------------------------------------------------------------------------------------------
// HUD kit (src/ui). Appended to the theme: the interface wears the actors' palette, so a panel
// and a slot belong with the necromancer and the crypt, and soul green stays the only saturated
// accent (a selected slot, the soul bar, a rune). The one other hue is the blood of the health bar.
// ----------------------------------------------------------------------------------------------

/** Tones that only the interface uses: the blood of the health bar and the dark parchment under panels, slots and tooltips. */
export const UI_PALETTES = {
  // Blood: the crimson of `sash` made brighter and wetter, so a fill reads at a sliver against dark stone.
  bloodLit: '#e0606e',
  blood: '#b02a3e',
  bloodDark: '#5c1424',
  // Parchment, dark: bone-dark ground down toward the ink, three steps.
  parchmentLit: lerpColor(PALETTES.boneDark, PALETTES.ink, 0.5),
  parchment: lerpColor(PALETTES.boneDark, PALETTES.ink, 0.72),
  parchmentDark: lerpColor(PALETTES.boneDark, PALETTES.ink, 0.86),
};

export const UI_RAMPS = {
  blood: { lit: UI_PALETTES.bloodLit, base: UI_PALETTES.blood, dark: UI_PALETTES.bloodDark },
  parchment: { lit: UI_PALETTES.parchmentLit, base: UI_PALETTES.parchment, dark: UI_PALETTES.parchmentDark },
  // Dark slate of frames: the stone of the scenery a step down, so a panel sits quietly over a lit floor. Light from the upper left.
  slate: { lit: PALETTES.stone, base: lerpColor(PALETTES.stone, PALETTES.stoneDark, 0.5), dark: PALETTES.stoneDark },
};

/** Interface line weights: the actors' `outline` around a piece, `detail` between its parts, and a hairline for fine grooves. */
export const UI_STROKES = {
  hair: STROKES.detail.with({ width: 0.7 }),
};
