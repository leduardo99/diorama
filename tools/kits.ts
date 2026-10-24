/**
 * Diorama - what `npm run new-kit` writes: a minimal kit in `src/<kit>/` (docs/ARCHITECTURE.md, "Kits").
 *
 *   npm run new-kit -- <project> scenery|gear|vfx|items [--force]
 *
 * Each kit gets `catalog.ts` (what editors and the kit's generator command read), `index.ts` (what other code
 * imports) and one first piece in a family file, written against the engine's real types and the project's own
 * theme (`CAMERA`, the `VOLUMES` materials) and space profile (`src/space.ts`, when it has one). The first piece is a
 * block-out that renders, so the kit's generator command, the export and `check --strict` work on it at once; the
 * guides (docs/guides/volume/04 and 06, docs/guides/rig/05) and the sample's kits are the full form.
 *
 * Pieces never import the theme: they read the material that plays each of their roles (`ctx.materials.<role>`), and
 * the catalog maps roles to keys of `VOLUMES`, chosen here by name among the theme's materials.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LAYOUT } from './project.js';

export const KIT_KINDS = ['scenery', 'gear', 'vfx', 'items'] as const;
export type KitKind = (typeof KIT_KINDS)[number];

/** What new-kit needs to know about a project's theme and space. */
export interface KitTheme {
  /** Keys of the theme's `VOLUMES`, in their order. */
  materials: string[];
  /** Whether `src/space.ts` exports `SPACE` (the space profile). */
  space: boolean;
}

/** A file of a kit, relative to `src/<kit>/`. */
export interface KitFile {
  name: string;
  content: string;
}

/** The kit's first piece: its id in the catalog, and the family file it is written in. */
export const FIRST_PIECE: Record<KitKind, { id: string; family: string }> = {
  scenery: { id: 'crate', family: 'props.ts' },
  gear: { id: 'helm', family: 'heads.ts' },
  vfx: { id: 'spark', family: 'bursts.ts' },
  items: { id: 'gem', family: 'gems.ts' },
};

/**
 * Reads the project's theme (and space profile) by importing them, as the generator commands import catalogs. Throws an
 * error that says what is missing: a theme without `CAMERA` or without a `VOLUMES` material cannot hold a kit.
 */
export async function readKitTheme(projectDir: string): Promise<KitTheme> {
  const themeFile = join(projectDir, LAYOUT.src, 'theme.ts');
  if (!existsSync(themeFile)) throw new Error('src/theme.ts is missing: create the project with npm run new-project, or restore src/theme.ts.');
  const theme = (await import(pathToFileURL(themeFile).href)) as { CAMERA?: unknown; VOLUMES?: Record<string, unknown> };
  if (!theme.CAMERA) throw new Error('src/theme.ts exports no CAMERA: a kit draws with the project\'s one camera (templates/project/src/theme.ts has it).');
  const materials = theme.VOLUMES && typeof theme.VOLUMES === 'object' ? Object.keys(theme.VOLUMES) : [];
  if (!materials.length) throw new Error('src/theme.ts exports no VOLUMES material: a kit\'s pieces are drawn with them (add one, as templates/project/src/theme.ts does).');
  const spaceFile = join(projectDir, LAYOUT.src, 'space.ts');
  const space = existsSync(spaceFile) && Boolean(((await import(pathToFileURL(spaceFile).href)) as { SPACE?: unknown }).SPACE);
  return { materials, space };
}

/** The theme material for a role: the first of `names` the theme has, else its first material. */
function pick(theme: KitTheme, names: string[]): string {
  return names.find(n => theme.materials.includes(n)) ?? theme.materials[0];
}

/** A string literal in the project's style: single quotes. */
function quote(text: string): string {
  return `'${text.replace(/[\\']/g, '\\$&')}'`;
}

/** `VOLUMES.stone`, or `VOLUMES['my-stone']` for a key that is not an identifier. */
function volume(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `VOLUMES.${key}` : `VOLUMES[${quote(key)}]`;
}

/** The files of a new kit for `project` (its name, for comments and commands). */
export function kitFiles(kind: KitKind, project: string, theme: KitTheme): KitFile[] {
  switch (kind) {
    case 'scenery': return sceneryKit(project, theme);
    case 'gear': return gearKit(project, theme);
    case 'vfx': return vfxKit(project, theme);
    case 'items': return itemsKit(project, theme);
  }
}

// ---------------------------------------------------------------------------------------------
// scenery: a prop (guide 04 §3.3 and §5)
// ---------------------------------------------------------------------------------------------

function sceneryKit(project: string, theme: KitTheme): KitFile[] {
  const wood = pick(theme, ['wood', 'timber', 'darkwood', 'planks']);
  const size = theme.space
    ? `/** The crate's size in world units: about 0.6 of a cell across and 0.4 of a character tall (the space profile). */
export const CRATE = {
  length: Math.round(SPACE.grid.cell.x * 0.6),
  width: Math.round(SPACE.grid.cell.x * 0.6),
  height: Math.round(SPACE.scale.character * 0.4),
};`
    : `/**
 * The crate's size in world units, against a character about 80 tall (the reference sizes in STYLE.md). With a space
 * profile (src/space.ts, guide 04 §1) read the sizes from it instead: \`SPACE.grid.cell.x\`, \`SPACE.scale.character\`.
 */
export const CRATE = { length: 28, width: 28, height: 32 };`;
  const props = `/**
 * Props of the scenery kit (docs/guides/volume/04-scenery-kits.md §3.3): pieces with no connection, standing on their
 * footprint. A piece draws one frame into \`ctx.object\`, built in \`ctx.frame\` (turned to its facing), with the materials
 * its catalog entry's \`roles\` ask for: it never imports the theme, so the catalog can re-material the kit.
 *
 * \`crate\` is the kit's first piece, written by \`npm run new-kit\`: a block-out to make the project's own (the
 * diorama-volume skill and its quality bar say how) or to replace with the next prop.
 */

import { Solid, type ScenePiece } from '@core/volume';${theme.space ? `\nimport { SPACE } from '../space';` : ''}

${size}

export const crate: ScenePiece = ctx => {
  const wood = ctx.materials.wood;
  if (!wood) throw new Error('crate: the scenery catalog gives no material to the role "wood" (defaultMaterials)');
  const body = Solid.box(ctx.frame, CRATE.length, CRATE.width, CRATE.height);
  ctx.object.add(body, wood);
  // The lid: a rim a little wider than the body, resting on it.
  ctx.object.add(Solid.box(ctx.frame.moved(0, 0, CRATE.height - 3), CRATE.length + 2, CRATE.width + 2, 3), wood, { on: body });
};
`;
  const grid = theme.space
    ? `  // The space profile's grid and camera, and the profile itself (src/space.ts): sizes, wall placement, scale checks.
  grid: SPACE.grid,
  camera: SPACE.camera,
  space: SPACE,`
    : `  // No space profile yet: cells of 48 × 36 px on the theme's camera, walls at cell centres, no scale check. Add
  // src/space.ts (guide 04 §1) and use grid: SPACE.grid, camera: SPACE.camera, space: SPACE.
  grid: Grid.fromScreen(CAMERA, 48, 36),
  camera: CAMERA,`;
  const catalog = `/**
 * The scenery catalog of ${project} (docs/guides/volume/04-scenery-kits.md §5): the kit as editors and the exporter see it.
 * \`npm run scenery-items -- ${project}\` writes one tile set per piece into \`sheets/scenery/\`, the viewer's scene painter
 * loads \`SCENERY\`, and saved scenes (\`npm run new-scene\`) name pieces and materials by the ids below.
 *
 * - \`pieces\`: one \`ScenePieceInfo\` per piece: id, label, group, how it connects, its variants (one label each), the
 *   roles its code reads, its options with the piece's own defaults, and \`height\` so \`inspect\` checks its scale.
 * - \`materials\`: the theme's \`VOLUMES\`; \`defaultMaterials\`: which of them plays each role.
 *
 * Adding a piece: write it in a family file (\`props.ts\`, \`floors.ts\`, \`walls.ts\`...), export it from \`index.ts\`, list it
 * here, then run \`npm run scenery-items -- ${project}\`, export \`scenery/\` and \`npm run scenery-test -- ${project} <piece>\`.
 * \`examples/soulkeeper/src/scenery/catalog.ts\` is the full form: floors, walls, fences, doors and living props.
 */

import { ${theme.space ? '' : 'Grid, '}type SceneryCatalog, type ScenePieceInfo } from '@core/volume';
import { ${theme.space ? '' : 'CAMERA, '}VOLUMES } from '../theme';${theme.space ? `\nimport { SPACE } from '../space';` : ''}
import { CRATE, crate } from './props';

const PIECES: ScenePieceInfo[] = [
  { id: 'crate', label: 'Crate', group: 'prop', piece: crate, connect: 'none', height: CRATE.height, variantLabels: ['Plain'], roles: ['wood'] },
];

export const SCENERY: SceneryCatalog = {
  pieces: PIECES,
  materials: VOLUMES,
  // Which theme material (a key of VOLUMES) plays each role the pieces ask for.
  defaultMaterials: { wood: ${quote(wood)} },
${grid}
};
`;
  const index = `/**
 * The scenery kit of ${project}, for code: its pieces by family. Editors, the exporter and the generated sheets read the
 * kit through \`catalog.ts\` (\`SCENERY\`); scenes and other kits import pieces from here (\`../scenery\`).
 */

export * from './props';
`;
  return [{ name: 'props.ts', content: props }, { name: 'catalog.ts', content: catalog }, { name: 'index.ts', content: index }];
}

// ---------------------------------------------------------------------------------------------
// gear: a part on a mannequin that wears it (guide rig 05)
// ---------------------------------------------------------------------------------------------

function gearKit(project: string, theme: KitTheme): KitFile[] {
  const metal = pick(theme, ['metal', 'iron', 'steel', 'bronze', 'brass']);
  const body = pick(theme, ['cloth', 'skin', 'flesh', 'robe']);
  const heads = `/**
 * Head gear of the gear kit (docs/guides/rig/05-gear-and-outfits.md §2): parts for the \`head\` slot. A part builds in its
 * slot's frame (\`ctx.at.frame\`: forward, right, up), reads the materials of its roles, never the theme, and returns the
 * volume it added so other parts can rest \`on\` it.
 *
 * \`helm\` is the kit's first part, written by \`npm run new-kit\`: a block-out dome to make the project's own.
 */

import type { Part } from '@core/rig';
import { Round } from '@core/volume';

/** Options of \`helm\`. */
export interface HelmOptions {
  /** Scale of the dome against the head (1 = as drawn). Default 1. */
  size?: number;
}

/**
 * A plain round helm over the head joint, open below the brow.
 * Slot: \`head\`. Roles: \`metal\`. Returns the dome, so a crest can rest on it.
 */
export const helm: Part<HelmOptions> = (ctx, { size = 1 }) => {
  const metal = ctx.materials.metal;
  if (!metal) throw new Error('helm: the outfit gives no material to the role "metal"');
  // The head's radius in the engine's mannequin: 0.075 of the skeleton's height.
  const r = ctx.kit.skeleton.height * 0.075 * size;
  const dome = Round.ellipsoid(ctx.at.frame.moved(0, 0, r * 0.45), r * 1.45, r * 1.25, r * 1.05);
  ctx.object.add(dome, metal);
  return dome;
};
`;
  const bodies = `/**
 * Base bodies of the gear kit (docs/guides/rig/05-gear-and-outfits.md §3): what an outfit is drawn over. A base receives
 * the outfit's materials, so its material is a role like any part's.
 *
 * \`mannequinBody\` is the engine's block-out body (\`mannequinSkin\`), written by \`npm run new-kit\` so the first part has a
 * body to sit on: replace it with the project's own (bones, flesh, fur) when a character of the project wears the kit.
 * Roles: \`body\`.
 */

import { mannequinSkin, type BaseInfo } from '@core/rig';

export const mannequinBody: BaseInfo['skin'] = (object, pose, kit, materials) => {
  const body = materials.body;
  if (!body) throw new Error('mannequinBody: the outfit gives no material to the role "body"');
  mannequinSkin(body)(object, pose, kit);
};
`;
  const catalog = `/**
 * The gear catalog of ${project} (docs/guides/rig/05-gear-and-outfits.md §5): the kit as an editor sees it, and the characters
 * it can dress. \`npm run gear-items -- ${project}\` writes one sheet per part into \`sheets/gear/\`, the viewer's Customize tab
 * loads \`CATALOG\` and \`CHARACTERS\`, and \`npm run new-outfit-character\` turns a saved outfit into a character.
 *
 * - \`CATALOG.parts\`: one \`PartInfo\` per part: id, label, group, the slots it fits, the roles it reads, its options with
 *   the part's own defaults, and \`equip\`, the equipment slot it takes alone.
 * - \`CATALOG.bases\`: the bodies an outfit is drawn over; \`CATALOG.materials\`: the theme's \`VOLUMES\`.
 * - \`CHARACTERS\`: who can wear the kit. \`mannequin\` is a block-out humanoid written by \`npm run new-kit\`, so the kit has a
 *   wearer from the start: list the project's own characters here (their rig and the outfit they wear, as the sample's
 *   \`characters/<name>/spec.ts\` and \`outfit.ts\` do) and drop it once they wear the kit.
 *
 * Adding a part: write it in a family file (\`heads.ts\`, \`torso.ts\`, \`weapons.ts\`...), export it from \`index.ts\`, list it
 * here, then run \`npm run gear-items -- ${project}\` and export \`gear/\`. \`examples/soulkeeper/src/gear/catalog.ts\` is the full form.
 */

import { humanoid, idle, type BaseInfo, type GearCatalog, type OutfitCharacterInfo, type PartInfo } from '@core/rig';
import { CAMERA, VOLUMES } from '../theme';
import { helm, mannequinBody } from '.';

const PARTS: PartInfo[] = [
  {
    id: 'helm', label: 'Helm', group: 'head', equip: 'helm', part: helm, slots: ['head'], roles: ['metal'],
    options: [{ key: 'size', label: 'Size', type: 'number', default: 1, min: 0.8, max: 1.3, step: 0.05 }],
  },
];

const BASES: BaseInfo[] = [
  { id: 'mannequin', label: 'Mannequin', skin: mannequinBody, roles: ['body'] },
];

export const CATALOG: GearCatalog = {
  parts: PARTS,
  bases: BASES,
  materials: VOLUMES,
};

const skeleton = humanoid();

export const CHARACTERS: OutfitCharacterInfo[] = [
  {
    id: 'mannequin',
    label: 'Mannequin',
    skeleton,
    camera: CAMERA,
    // The cell of a humanoid (as new-asset --engine rig writes it): 96 × 112, the feet at 48, 96.
    width: 96,
    height: 112,
    pivot: { x: 48, y: 96 },
    // 1.6 s at 16 frames (10 fps): the idle the diorama-rig skill recommends over the preset's slow 8 frames in 2 s.
    clips: { idle: { clip: idle(skeleton, { seconds: 1.6 }), frames: 16 } },
    // Which theme material (a key of VOLUMES) plays each role, and the pieces it wears.
    outfit: { base: 'mannequin', materials: { body: ${quote(body)}, metal: ${quote(metal)} }, pieces: [{ part: 'helm', slot: 'head' }] },
  },
];
`;
  const index = `/**
 * The gear kit of ${project}, for code: its parts by family and the base bodies. Characters and other kits import parts from
 * here (\`../gear\`). The catalog (\`catalog.ts\`) is a module of its own, imported by name: it lists the characters, whose
 * rigs import the kit.
 *
 * Material roles the parts read (an outfit maps each to a theme material): \`metal\` (helm), \`body\` (the mannequin).
 */

export * from './bodies';
export * from './heads';
`;
  return [
    { name: 'heads.ts', content: heads },
    { name: 'bodies.ts', content: bodies },
    { name: 'catalog.ts', content: catalog },
    { name: 'index.ts', content: index },
  ];
}

// ---------------------------------------------------------------------------------------------
// vfx: a burst (guide 06 §1)
// ---------------------------------------------------------------------------------------------

function vfxKit(project: string, theme: KitTheme): KitFile[] {
  const glow = pick(theme, ['glow', 'accent', 'soul', 'fire', 'magic']);
  const bursts = `/**
 * Bursts of the effect kit (docs/guides/volume/06-effects-items-and-hud.md §1): effects that play once where something
 * happens and leave nothing. An effect draws one frame into \`ctx.object\` (floor marks into \`ctx.ground\`) around its
 * origin, with \`ctx.t\` running 0 → 1 across it, and reads the materials of its roles, never the theme.
 *
 * \`spark\` is the kit's first effect, written by \`npm run new-kit\`: a flash that swells and fades out, its last frame
 * empty. Light is drawn with \`@core/draw\` shapes in \`object.custom\`; anything solid would be a volume part.
 */

import { Polygon, alpha } from '@core/draw';
import { vec3, type EffectPiece } from '@core/volume';

/** Frames of \`spark\`, a one-shot: the peak early, then the fall-off to nothing. */
export const SPARK_FRAMES = 8;

export const spark: EffectPiece = ctx => {
  const glow = ctx.materials.glow;
  if (!glow) throw new Error('spark: the effect catalog gives no material to the role "glow" (defaultMaterials)');
  const { camera: cam, t, size } = ctx;
  const fade = 1 - t;
  if (fade <= 0) return;
  const at = cam.project(vec3(0, 0, 0));
  // The reach grows fast and slows (an ease out), while the light fades.
  const r = size * cam.scale * (0.35 + 0.65 * (1 - fade ** 3));
  ctx.object.custom(vec3(0, 0, 0), c => {
    const halo = Polygon.circle(r, { cx: at.x, cy: at.y });
    halo.fill(c, halo.createGradient(c, { type: 'radial', center: at, r1: 0, r2: r, stops: [[0, alpha(glow.ramp.lit, 0.9 * fade)], [0.45, alpha(glow.ramp.base, 0.6 * fade)], [1, alpha(glow.ramp.dark, 0)]] }));
    Polygon.circle(r * 0.3 * fade, { cx: at.x, cy: at.y }).fill(c, alpha(glow.ramp.lit, fade));
  });
};
`;
  const catalog = `/**
 * The effect catalog of ${project} (docs/guides/volume/06-effects-items-and-hud.md §1): what characters play on their clip
 * events, as the exporter and the viewer's playground see it (\`VFX\`). \`npm run vfx-items -- ${project}\` writes one sheet
 * per effect into \`sheets/vfx/\`, and characters cue effects by id (\`defineCharacter({ effects })\`).
 *
 * - \`effects\`: one \`EffectInfo\` per effect: id, label, kind, timing (frames, fps, loop, events), \`size\` (its reach in
 *   world units, which sizes the cell) and the roles its code reads.
 * - \`materials\`: the theme's \`VOLUMES\`; \`defaultMaterials\`: which of them plays each role.
 *
 * Adding an effect: write it in a family file (\`bursts.ts\`, \`impacts.ts\`, \`projectiles.ts\`...), export it from \`index.ts\`,
 * list it here, then run \`npm run vfx-items -- ${project}\` and export \`vfx/\`. \`examples/soulkeeper/src/vfx/catalog.ts\` is the full form.
 */

import type { EffectCatalog, EffectInfo } from '@core/volume';
import { CAMERA, VOLUMES } from '../theme';${theme.space ? `\nimport { SPACE } from '../space';` : ''}
import { SPARK_FRAMES, spark } from './bursts';

const EFFECTS: EffectInfo[] = [
  // ${theme.space ? 'A small flash, about a hand across (0.15 of the character).' : 'A small flash, about a hand across for a character 80 tall.'}
  { id: 'spark', label: 'Spark', kind: 'burst', piece: spark, roles: ['glow'], frames: SPARK_FRAMES, fps: 12, size: ${theme.space ? 'Math.round(SPACE.scale.character * 0.15)' : '12'} },
];

export const VFX: EffectCatalog = {
  effects: EFFECTS,
  materials: VOLUMES,
  // Which theme material (a key of VOLUMES) plays each role the effects ask for.
  defaultMaterials: { glow: ${quote(glow)} },
  camera: CAMERA,${theme.space ? '\n  space: SPACE,' : ''}
};
`;
  const index = `/**
 * The effect kit of ${project}, for code: its effects by family. The exporter and the generated sheets read the kit through
 * \`catalog.ts\` (\`VFX\`).
 */

export * from './bursts';
`;
  return [{ name: 'bursts.ts', content: bursts }, { name: 'catalog.ts', content: catalog }, { name: 'index.ts', content: index }];
}

// ---------------------------------------------------------------------------------------------
// items: a piece of its own and its icon (guide 06 §2)
// ---------------------------------------------------------------------------------------------

function itemsKit(project: string, theme: KitTheme): KitFile[] {
  const gem = pick(theme, ['crystal', 'gem', 'accent', 'glow', 'soul']);
  const plain = pick(theme, ['stone', 'metal', 'iron', 'steel', 'bone']);
  const gems = `/**
 * Gems of the item kit (docs/guides/volume/06-effects-items-and-hud.md §2): items drawn by a piece of their own. A piece
 * builds the item into \`ctx.object\` around \`ctx.frame\` (its centre, turned to the icon's view), at any world size: the
 * icon fits it to its square. It reads the materials of its roles, never the theme.
 *
 * \`gem\` is the kit's first item, written by \`npm run new-kit\`: a block-out cut stone to make the project's own.
 */

import type { ItemPiece } from '@core/rig';
import { Round } from '@core/volume';

export const gem: ItemPiece = ctx => {
  const stone = ctx.materials.gem;
  if (!stone) throw new Error('gem: the item catalog gives no material to the role "gem" (defaultMaterials)');
  // Centred on the origin: a pointed pavilion up to the girdle, then the crown, whose lit top is the table.
  const base = ctx.frame.moved(0, 0, -3.4);
  const pavilion = Round.cylinder(base, 0.3, 4.2, 4.4);
  ctx.object.add(pavilion, stone);
  ctx.object.add(Round.cylinder(base.moved(0, 0, 4.2), 4.4, 2.6, 2.6), stone, { on: pavilion });
};
`;
  const catalog = `/**
 * The item catalog of ${project} (docs/guides/volume/06-effects-items-and-hud.md §2): \`ITEMS\`, read by
 * \`npm run item-icons -- ${project}\`, which writes one icon sheet per item into \`sheets/icons/\`.
 *
 * - \`items\`: one \`ItemInfo\` per item: id, label, kind, rarity, stack, description, and what draws its icon: a piece of its
 *   own (\`piece\` with its \`roles\`), a gear part drawn as worn (\`gear: { part }\`, with \`gear\` below), or both.
 * - \`rarities\`: the tiers, each with a theme color (here the tones of two materials; a palette token works too).
 * - \`icon\`: the icon square and the room kept round the item. \`background\` and \`frame\` (the slot art under and over the
 *   item, by rarity) are optional: \`examples/soulkeeper/src/items/rarity.ts\` draws them.
 *
 * Adding an item: write its piece in a family file (\`gems.ts\`, \`potions.ts\`, \`keys.ts\`...), export it from \`index.ts\`,
 * list it here, then run \`npm run item-icons -- ${project}\` and export \`icons/\`. \`examples/soulkeeper/src/items/catalog.ts\` is the full form.
 */

import type { ItemCatalog, ItemInfo } from '@core/rig';
import { CAMERA, VOLUMES } from '../theme';
import { gem } from './gems';

const ITEM_LIST: ItemInfo[] = [
  { id: 'gem', label: 'Gem', kind: 'material', rarity: 'common', stack: 20, description: 'A cut stone.', piece: gem, roles: ['gem'] },
];

export const ITEMS: ItemCatalog = {
  items: ITEM_LIST,
  // The tiers, from the plainest up. The tier lives in the icon's frame and ground; the item keeps its own colors.
  rarities: {
    common: { label: 'Common', color: ${volume(plain)}.ramp.lit },
    rare: { label: 'Rare', color: ${volume(gem)}.ramp.base },
  },
  icon: { size: 48, padding: 5 },
  camera: CAMERA,
  materials: VOLUMES,
  // Which theme material (a key of VOLUMES) plays each role the pieces ask for.
  defaultMaterials: { gem: ${quote(gem)} },
};
`;
  const index = `/**
 * The item kit of ${project}, for code: the pieces drawn for the icons, by family. The icon sheets read the kit through
 * \`catalog.ts\` (\`ITEMS\`).
 */

export * from './gems';
`;
  return [{ name: 'gems.ts', content: gems }, { name: 'catalog.ts', content: catalog }, { name: 'index.ts', content: index }];
}
