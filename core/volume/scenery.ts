/**
 * @core/volume - Scenery kits
 *
 * A project's scenery is a kit of pieces on its grid: floors (with transitions between them),
 * walls and fences (that connect to their neighbours), props and decals. This file gives the
 * mechanics, whatever the art: the piece contract, the editor catalog, scenes as data, the layout
 * a game follows, and the exported sheets it lays out (tile sets with one frame per connection
 * mask and variant, props in facings, whole scenes for reference). The pieces themselves are the
 * project's art; see guide 04.
 *
 * A scene is drawn exactly the way a game lays out the sheets: every placement is the frame of
 * its piece for that mask, variant and facing, drawn at its pivot. A piece is always built at
 * the world origin with the camera moved onto the placement, and its seed belongs to the frame,
 * not to the place, so a frame looks the same in the sheet, in `drawScene` and in a game.
 */

import { defineAsset, type AssetDefinition } from '../asset.js';
import { alpha } from '../draw/index.js';
import { createRng } from '../random.js';
import type { Camera } from './camera.js';
import { Frame3, facingYaw } from './frame.js';
import { CORNER, EDGE, cornerMask, edgeMask, type Grid } from './grid.js';
import { sceneNavigation } from './navigation.js';
import { heightOf, scaleFigure, screenHeight, spaceData, type SpaceHeight, type SpaceProfile, type WallPlacement } from './space.js';
import { Stage, type StageObject } from './stage.js';
import { vec3, type Vec3 } from './vec3.js';
import type { VolumeStyle } from './volume.js';

/** Materials by role (`stone`, `mortar`, `wood`, `metal`, `moss`...): pieces ask for roles, the kit maps them to theme materials. */
export type SceneMaterials = Record<string, VolumeStyle>;

/** How a piece connects to its neighbours, which decides its frames. */
export type Connect = 'none' | 'edges' | 'corners';

/** Everything a piece receives to draw one frame: a cell, a footprint or a dual-grid vertex. */
export interface PieceContext {
  /** The placement's parts. Floors and decals lie on the floor (layer 0); walls, fences and props stand on it (layer 1). */
  object: StageObject;
  /**
   * Marks on the floor under the parts: a contact shadow, a pool of light. They are drawn before
   * the parts and their outer contour, so the contour stays crisp over them. For floors and
   * decals this is `object` itself.
   */
  ground: StageObject;
  /** The project camera with the world origin on the placement's pivot. */
  camera: Camera;
  grid: Grid;
  /**
   * Origin at the placement's pivot on the floor (always world 0, 0, 0), turned to its facing:
   * x forward, y right, z up in the piece's own frame. Floors, walls and fences always face the
   * camera (forward = world +y, towards it), so build them in world axes.
   */
  frame: Frame3;
  /** Edge mask (walls, fences) or corner mask (floor transitions); 15 for a full floor tile, 0 when unconnected. */
  mask: number;
  /** Variant index, for pieces with several looks (cracked flags, a missing plank). */
  variant: number;
  /** Facing index of a prop (0 faces the camera, then clockwise on screen); 0 for the rest. */
  dir: number;
  /** Number of facings the piece is exported in (1 for everything but props). */
  directions: number;
  /**
   * The facing as a yaw on the floor (`facingYaw(dir, directions)`; π/2 faces the camera): orient
   * what is not part of the solids from it (a shadow, a pool of light, a trail), never from
   * `frame.forward` read back. The same for every frame of a placement.
   */
  yaw: number;
  /** The resting state this frame shows ('closed', 'open', 'broken'), for pieces with `states`; during a clip, its `from` state. */
  state?: string;
  /**
   * The frame of an animation being drawn, for pieces with `clips`: its name, frame index, frame count
   * and progress `t` (0 → 1 across a transition; frame ÷ frames round a loop). Undefined for still frames.
   */
  clip?: { name: string; frame: number; frames: number; t: number };
  /**
   * Walls and fences: the height of this frame's top in world units, one of the piece's `heights`
   * (build courses, bars and posts to it; keep blocks the same size, so a low wall has fewer
   * courses, not squashed ones). Other pieces: their nominal `height`, when the catalog gives one.
   */
  height?: number;
  /**
   * The seed of this frame: the same for a piece, mask and variant wherever it is laid, and the same
   * in every facing (details drawn from it turn with the prop). Pass it to `createRng` (or use
   * `pieceRng`) for details; a look that must differ between placements is a variant.
   */
  seed: number;
  materials: SceneMaterials;
  /**
   * Walls and fences: the height of the run's top where this cell meets its north neighbour.
   * When the north edge is connected the engine cuts the cell's drawing above that line on
   * screen, so this cell's outline does not lie across the neighbour's top. (Connected east and
   * west edges are always cut on the cell's border, and south needs no cut: the cell to the
   * south is drawn later and covers the end.) Keep posts and finials near a connected north
   * edge below the line, or they are cut too.
   */
  seam(top: number): void;
}

/** A scenery piece: draws one placement into its object. `O` are its options. */
export type ScenePiece<O = Record<string, unknown>> = (ctx: PieceContext, options: O) => void;

/** An editable option of a piece (same shape as rig part options). */
export type PieceOption =
  | { key: string; label: string; type: 'number'; default: number; min: number; max: number; step?: number }
  | { key: string; label: string; type: 'boolean'; default: boolean }
  | { key: string; label: string; type: 'select'; default: string; choices: { value: string; label: string }[] };

/**
 * An animation of a piece: a transition from one resting state to another (a door opening, an urn
 * breaking), or a loop (a flame flickering) played while the piece rests in `from`, or always.
 */
export interface PieceClip {
  frames: number;
  /** Frames per second. Default 10. */
  fps?: number;
  loop?: boolean;
  /** State it starts from (a transition) or plays in (a loop). */
  from?: string;
  /** State it ends in (a transition). */
  to?: string;
  /** Moments a game reacts to: { frame: 3, name: 'open' } (passable from there), 'break', 'spark'. */
  events?: { frame: number; name: string }[];
}

/** How a piece takes part in movement and play (`sceneNavigation`). */
export interface PieceNav {
  /**
   * Whether it stops movement. Defaults: floors no (deep water: yes), walls, fences, doors and props
   * yes, decals no.
   */
  blocks?: boolean;
  /** Floors: the cost of entering a cell (1 plain; 2 or 3 for mud or shallow water). */
  cost?: number;
  /** States in which it does not block: ['open'] for a door, ['broken'] for an urn. */
  passableIn?: string[];
  /** What a character can do with it, listed in the scene's navigation: 'door', 'chest', 'lever', 'break'… */
  interact?: string;
  /** States in which it can be used (default all): ['shut'] for a chest once opened, ['whole'] for an urn. */
  interactIn?: string[];
}

/** A piece as editors and exporters see it. */
export interface ScenePieceInfo {
  /** Stable id used in saved scenes (e.g. 'crypt-wall'). */
  id: string;
  label: string;
  /**
   * 'floor', 'wall', 'fence', 'door', 'prop' or 'decal'. Floors and decals draw on layer 0. A door
   * stands on a cell edge between two wall vertices (walls on borders) and breaks the run there: the
   * walls on either side end in piers, its jambs.
   */
  group: 'floor' | 'wall' | 'fence' | 'door' | 'prop' | 'decal';
  piece: ScenePiece<any>;
  connect: Connect;
  /** Number of looks (frames per mask). Default 1. */
  variants?: number;
  /** What each variant looks like, for editors ('intact', 'cracked'), in variant order. */
  variantLabels?: string[];
  /** Cells covered when facing the camera, [across, deep]; swapped when the prop faces east or west. Default [1, 1]. */
  footprint?: [number, number];
  /** Facings a prop can be placed in (1, 4 or 8). Default 1. */
  directions?: 1 | 4 | 8;
  /** Floors: higher priority floors are drawn over lower ones at transitions. */
  priority?: number;
  /**
   * Walls and fences: other piece ids they connect to besides themselves (a gate joins a fence).
   * Either side declaring it is enough: two pieces connect when one of them lists the other.
   */
  joins?: string[];
  roles: string[];
  options?: PieceOption[];
  /** Logical size of one exported cell and the pivot inside it (default: from the grid and the group). */
  cell?: { width: number; height: number; pivot: { x: number; y: number } };
  /**
   * Nominal height of the piece's top at its default options: world units, or a size of the
   * project's space profile ('wall', 'door', 'fence', 'character'). Walls default to 'wall' and
   * fences to 'fence' when the catalog has a space profile. `inspect` checks the exported sheet
   * against it.
   */
  height?: SpaceHeight;
  /**
   * Walls and fences: the heights the piece comes in, in world units or as profile sizes, e.g.
   * `['fence', 'wall']` for a stone wall that also makes a low wall. The first is the default.
   * A scene chooses one per cell (`{ piece, height }`), the piece builds to `ctx.height`, and the
   * sheet has one row per height. Default: `[height]`.
   */
  heights?: SpaceHeight[];
  /** Resting states, the default first ('closed', 'open'); a scene picks one per placement. Props, decals and doors. */
  states?: string[];
  /** Animations by name: transitions between states and loops. Each exports as its own sheet (`sheets/scenery/<id>--<clip>.ts`). */
  clips?: Record<string, PieceClip>;
  /** Movement and play: what blocks, what costs, what can be used. */
  nav?: PieceNav;
  /**
   * Where the piece's sheet is, as a path under the project's `sheets/` without `.ts`, when it is not
   * the generated `scenery/<id>` (e.g. 'props/tombstone' for a prop that has its own sheet), or false
   * for none. `scenery-items` writes no default sheet for it (its other states and clips still are).
   */
  asset?: string | false;
}

/** A project's scenery catalog: pieces, materials by name, the grid and the camera. */
export interface SceneryCatalog {
  pieces: ScenePieceInfo[];
  materials: Record<string, VolumeStyle>;
  /** Role → material name used when a scene or piece does not say otherwise. */
  defaultMaterials: Record<string, string>;
  grid: Grid;
  camera: Camera;
  /**
   * The project's space profile (`defineSpace`): its scale, where walls stand, and the grid and
   * camera above, which must be the profile's. Without it walls stand at cell centres and no
   * scale is checked.
   */
  space?: SpaceProfile;
}

/** A placed prop or decal. */
export interface ScenePlacement {
  piece: string;
  /** Cell of the footprint's top-left corner (the footprint as turned by `dir`). */
  col: number;
  row: number;
  /** Facing index (0 faces the camera, then clockwise on screen), for pieces with directions. */
  dir?: number;
  variant?: number;
  /** Resting state, one of the piece's `states` (default the first). */
  state?: string;
  /**
   * Doors: the edge of cell (col, row) the door stands on, 'N' (its north edge, between vertices
   * (col, row) and (col + 1, row)) or 'W' (its west edge, between (col, row) and (col, row + 1)).
   * col may be `cols` for a west edge and row `rows` for a north edge, on the scene's outer border.
   */
  edge?: 'N' | 'W';
  options?: Record<string, unknown>;
}

/** A wall or fence in a cell: its piece id, or the id with a variant and options for this cell only. */
export type SceneCell = string | { piece: string; variant?: number; height?: SpaceHeight; options?: Record<string, unknown> };

/** A scene as data: what an editor saves and `drawScene` draws. */
export interface SceneData {
  /** Size in cells. */
  cols: number;
  rows: number;
  /** Floor piece id per cell, `floor[row][col]` (null = no floor). Floor variants are picked per tile by position. */
  floor: (string | null)[][];
  /**
   * Wall or fence per cell, `walls[row][col]` (null = none): a piece id, or
   * `{ piece, variant, options }` to choose this cell's look. Options that change the run's height
   * where it meets a neighbour must match along the run. When the catalog's space profile puts
   * walls on borders, the grid is one larger each way, `(rows + 1) × (cols + 1)`, and each entry
   * is the vertex at the top-left corner of cell (col, row): walls run along cell borders.
   */
  walls: (SceneCell | null)[][];
  props: ScenePlacement[];
  /** Role → material name overrides for the whole scene. */
  materials?: Record<string, string>;
  /** Options per piece id for every placement of that piece in the scene. */
  options?: Record<string, Record<string, unknown>>;
  /**
   * Scale figures: plain mannequins of the space profile's character height standing in these
   * cells, to judge proportions in an editor or a test. Never part of the layout a game follows.
   */
  figures?: { col: number; row: number }[];
}

const find = (catalog: SceneryCatalog, id: string) => catalog.pieces.find(p => p.id === id);
const optionsOf = (info: ScenePieceInfo, extra?: Record<string, unknown>) => ({ ...Object.fromEntries((info.options ?? []).map(o => [o.key, o.default])), ...extra });

/** The piece id of a wall cell (`'crypt-wall'` or `{ piece: 'crypt-wall', ... }`), or null. */
export const cellPiece = (cell: SceneCell | null | undefined): string | null => (cell == null ? null : typeof cell === 'string' ? cell : cell.piece);

/** Where the catalog's walls stand: on cell borders when its space profile says so, else through cell centres. */
export const wallPlacement = (catalog: SceneryCatalog): WallPlacement => catalog.space?.walls ?? 'center';

/** Size of a scene's `walls` grid: the cells, or one more each way when walls stand on borders. */
export function wallGridSize(catalog: SceneryCatalog, cols: number, rows: number): { cols: number; rows: number } {
  return wallPlacement(catalog) === 'border' ? { cols: cols + 1, rows: rows + 1 } : { cols, rows };
}

/** An empty scene of this size for the catalog: no floor, no walls, no props. */
export function emptyScene(catalog: SceneryCatalog, cols: number, rows: number): SceneData {
  const w = wallGridSize(catalog, cols, rows);
  return { cols, rows, floor: Array.from({ length: rows }, () => Array(cols).fill(null)), walls: Array.from({ length: w.rows }, () => Array(w.cols).fill(null)), props: [] };
}

/** Nominal height of a piece in world units (its `height`, or the profile's wall and fence heights), if known. */
export function pieceHeight(info: ScenePieceInfo, catalog: SceneryCatalog): number | undefined {
  const h = info.heights?.[0] ?? info.height ?? (info.group === 'wall' ? 'wall' : info.group === 'fence' ? 'fence' : undefined);
  return h === undefined ? undefined : heightOf(catalog.space, h);
}

/** The heights a wall or fence comes in, in world units (its `heights`, else its nominal height); empty when unknown. */
export function heightsOf(info: ScenePieceInfo, catalog: SceneryCatalog): number[] {
  const list = info.heights ?? (info.height !== undefined || info.group === 'wall' || info.group === 'fence' ? [info.height ?? (info.group === 'wall' ? 'wall' : 'fence')] : []);
  return list.map(h => heightOf(catalog.space, h)).filter((h): h is number => h !== undefined);
}

/** Index of a scene cell's height among a piece's `heights` (0, the default, when it names none). -1 when it is not one of them. */
function heightIndex(info: ScenePieceInfo, height: SpaceHeight | undefined): number {
  if (height === undefined) return 0;
  return (info.heights ?? []).findIndex(h => h === height);
}

/** Resolves role → material names into a material set (catalog defaults, then overrides). */
export function sceneMaterials(catalog: SceneryCatalog, overrides?: Record<string, string>): SceneMaterials {
  const names = { ...catalog.defaultMaterials, ...overrides };
  const out: SceneMaterials = {};
  for (const [role, name] of Object.entries(names)) {
    const m = catalog.materials[name];
    if (!m) throw new Error(`scenery: unknown material "${name}" for role "${role}"`);
    out[role] = m;
  }
  return out;
}

/** True when a facing points more east or west than north or south. */
const sideways = (dir: number, directions: number) => {
  const yaw = facingYaw(dir, directions);
  return Math.abs(Math.cos(yaw)) > Math.abs(Math.sin(yaw)) + 1e-9;
};

/** Cells a prop or decal covers placed with facing `dir`: [across, deep], its footprint swapped when it faces east or west. */
export function footprintOf(info: ScenePieceInfo, dir = 0): [number, number] {
  const [w, d] = info.footprint ?? [1, 1];
  return sideways(dir, info.directions ?? 1) ? [d, w] : [w, d];
}

/**
 * Problems of a catalog: duplicate ids, a group with the wrong connection, labels that do not match
 * the variants, unknown joins, facings or footprints out of range, default options out of their
 * own range, materials that do not exist. Empty when valid. `scenery-items`, `new-scene` and
 * `scenery-test` refuse a catalog with problems.
 */
export function validateCatalog(catalog: SceneryCatalog): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of catalog.pieces) {
    const at = `piece "${p.id}"`;
    if (ids.has(p.id)) problems.push(`${at}: the id is used twice`);
    ids.add(p.id);
    if (p.group === 'floor' && p.connect !== 'corners') problems.push(`${at}: a floor connects by 'corners'`);
    if ((p.group === 'wall' || p.group === 'fence') && p.connect !== 'edges') problems.push(`${at}: a ${p.group} connects by 'edges'`);
    if ((p.group === 'prop' || p.group === 'decal' || p.group === 'door') && p.connect !== 'none') problems.push(`${at}: a ${p.group} connects by 'none'`);
    if (p.group === 'door' && wallPlacement(catalog) !== 'border') problems.push(`${at}: doors stand on cell edges, which needs a space profile with walls on borders`);
    if (p.states) {
      if (!p.states.length) problems.push(`${at}: states is empty`);
      if (new Set(p.states).size !== p.states.length) problems.push(`${at}: a state is listed twice`);
      if (p.group === 'floor' || p.group === 'wall' || p.group === 'fence') problems.push(`${at}: only props, decals and doors have states`);
    }
    for (const [name, clip] of Object.entries(p.clips ?? {})) {
      if (tiled(p)) problems.push(`${at}: clip "${name}": only props, decals and doors are animated`);
      if (!(Number.isInteger(clip.frames) && clip.frames >= 1)) problems.push(`${at}: clip "${name}" needs a whole number of frames`);
      for (const st of [clip.from, clip.to]) if (st !== undefined && !(p.states ?? []).includes(st)) problems.push(`${at}: clip "${name}" names state "${st}", which is not one of its states (${JSON.stringify(p.states ?? [])})`);
      for (const e of clip.events ?? []) if (!(Number.isInteger(e.frame) && e.frame >= 0 && e.frame < clip.frames)) problems.push(`${at}: clip "${name}" has event "${e.name}" at frame ${e.frame}, outside its ${clip.frames} frames`);
      if (name.includes('--')) problems.push(`${at}: clip names cannot contain "--" (it separates the piece from the clip in sheet names)`);
      if ((p.states ?? []).includes(name)) problems.push(`${at}: clip "${name}" has the name of a state; both would export as "${p.id}--${name}" (name transitions by their action: 'opening', 'breaking')`);
    }
    for (const st of [...(p.nav?.passableIn ?? []), ...(p.nav?.interactIn ?? [])]) if (!(p.states ?? []).includes(st)) problems.push(`${at}: nav names state "${st}", which is not one of its states`);
    const variants = p.variants ?? 1;
    if (!(Number.isInteger(variants) && variants >= 1)) problems.push(`${at}: variants must be a whole number from 1`);
    if (p.variantLabels && p.variantLabels.length !== variants) problems.push(`${at}: ${p.variantLabels.length} variantLabels for ${variants} variants`);
    if (p.directions !== undefined && ![1, 4, 8].includes(p.directions)) problems.push(`${at}: directions must be 1, 4 or 8`);
    if (p.footprint && !p.footprint.every(n => Number.isInteger(n) && n >= 1)) problems.push(`${at}: the footprint is whole cells, at least 1 × 1`);
    for (const j of p.joins ?? []) if (!catalog.pieces.some(q => q.id === j)) problems.push(`${at}: joins unknown piece "${j}"`);
    if (p.heights) {
      if (p.group !== 'wall' && p.group !== 'fence') problems.push(`${at}: only walls and fences come in several heights`);
      if (!p.heights.length) problems.push(`${at}: heights is empty`);
      for (const h of p.heights) {
        if (typeof h === 'number' ? !(h > 0) : !catalog.space) problems.push(`${at}: height ${JSON.stringify(h)} needs ${typeof h === 'number' ? 'to be positive' : 'a space profile in the catalog'}`);
      }
      if (new Set(p.heights).size !== p.heights.length) problems.push(`${at}: a height is listed twice`);
    }
    problems.push(...optionProblems(at, p, Object.fromEntries((p.options ?? []).map(o => [o.key, o.default]))).map(m => `${m} (its default)`));
  }
  for (const [role, name] of Object.entries(catalog.defaultMaterials)) if (!catalog.materials[name]) problems.push(`defaultMaterials: role "${role}" names unknown material "${name}"`);
  if (catalog.space) {
    const s = catalog.space;
    if (catalog.grid.screen.w !== s.grid.screen.w || catalog.grid.screen.h !== s.grid.screen.h) problems.push(`grid: the catalog's grid (${catalog.grid.screen.w} × ${catalog.grid.screen.h}) is not the space profile's (${s.grid.screen.w} × ${s.grid.screen.h}); use space.grid`);
    if (catalog.camera.tilt !== s.camera.tilt || catalog.camera.heightBoost !== s.camera.heightBoost) problems.push("camera: the catalog's camera is not the space profile's; use space.camera");
    for (const p of catalog.pieces) for (const h of [p.height, ...(p.heights ?? [])]) if (typeof h === 'string' && !(h in s.scale)) problems.push(`piece "${p.id}": height "${h}" is not a size of the space profile (${Object.keys(s.scale).join(', ')})`);
  }
  return problems;
}

/** Problems of a set of option values against a piece's declared options. */
function optionProblems(where: string, info: ScenePieceInfo, values: Record<string, unknown> | undefined): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(values ?? {})) {
    const o = info.options?.find(x => x.key === key);
    if (!o) problems.push(`${where}: "${info.id}" has no option "${key}"${info.options?.length ? ` (it has ${info.options.map(x => x.key).join(', ')})` : ''}`);
    else if (o.type === 'number' && (typeof value !== 'number' || value < o.min || value > o.max)) problems.push(`${where}: option "${key}" of "${info.id}" must be a number from ${o.min} to ${o.max}`);
    else if (o.type === 'boolean' && typeof value !== 'boolean') problems.push(`${where}: option "${key}" of "${info.id}" must be true or false`);
    else if (o.type === 'select' && !o.choices.some(c => c.value === value)) problems.push(`${where}: option "${key}" of "${info.id}" must be one of ${o.choices.map(c => c.value).join(', ')}`);
  }
  return problems;
}

/** Problems of a scene against a catalog (unknown pieces, wrong groups, out-of-bounds placements, bad options). Empty when valid. */
export function validateScene(scene: SceneData, catalog: SceneryCatalog): string[] {
  const problems: string[] = [];
  const grid = (name: 'floor' | 'walls', groups: string[]) => {
    const size = name === 'walls' ? wallGridSize(catalog, scene.cols, scene.rows) : { cols: scene.cols, rows: scene.rows };
    if (!Array.isArray(scene[name]) || scene[name].length !== size.rows || scene[name].some(r => !Array.isArray(r) || r.length !== size.cols)) {
      problems.push(`${name} must be ${size.rows} rows of ${size.cols} ${name === 'walls' && size.cols !== scene.cols ? 'vertices (walls stand on cell borders in this catalog)' : 'cells'}`);
      return;
    }
    scene[name].forEach((row, r) => row.forEach((entry, c) => {
      const id = cellPiece(entry);
      if (!id) return;
      const where = `${name}[${r}][${c}]`;
      if (name === 'floor' && typeof entry !== 'string') return void problems.push(`${where}: a floor cell is a piece id`);
      const info = find(catalog, id);
      if (!info) return void problems.push(`${where}: unknown piece "${id}"`);
      if (!groups.includes(info.group)) return void problems.push(`${where}: "${id}" is a ${info.group}, not a ${groups.join(' or ')}`);
      if (typeof entry === 'object' && entry) {
        if (entry.variant !== undefined && !(Number.isInteger(entry.variant) && entry.variant >= 0 && entry.variant < (info.variants ?? 1))) problems.push(`${where}: variant ${entry.variant} is not one of its ${info.variants ?? 1} variants`);
        if (entry.height !== undefined && heightIndex(info, entry.height) < 0) problems.push(`${where}: height ${JSON.stringify(entry.height)} is not one of "${info.id}"'s heights (${JSON.stringify(info.heights ?? [])})`);
        problems.push(...optionProblems(where, info, entry.options));
      }
    }));
  };
  grid('floor', ['floor']);
  grid('walls', ['wall', 'fence']);
  (scene.props ?? []).forEach((p, i) => {
    const where = `props[${i}]`;
    const info = find(catalog, p.piece);
    if (!info) return void problems.push(`${where}: unknown piece "${p.piece}"`);
    if (info.group !== 'prop' && info.group !== 'decal' && info.group !== 'door') problems.push(`${where}: "${p.piece}" is a ${info.group}, not a prop, decal or door`);
    if (p.dir !== undefined && !(Number.isInteger(p.dir) && p.dir >= 0 && p.dir < (info.directions ?? 1))) return void problems.push(`${where}: dir ${p.dir} is not one of its ${info.directions ?? 1} facings`);
    if (p.state !== undefined && !(info.states ?? []).includes(p.state)) problems.push(`${where}: state "${p.state}" is not one of "${p.piece}"'s states (${JSON.stringify(info.states ?? [])})`);
    if (info.group === 'door') {
      if (p.edge !== 'N' && p.edge !== 'W') return void problems.push(`${where}: a door needs edge 'N' or 'W'`);
      const fits = p.edge === 'N' ? p.col >= 0 && p.col < scene.cols && p.row >= 0 && p.row <= scene.rows : p.col >= 0 && p.col <= scene.cols && p.row >= 0 && p.row < scene.rows;
      if (!fits) problems.push(`${where}: the ${p.edge} edge of cell (${p.col}, ${p.row}) is outside the ${scene.cols}×${scene.rows} scene`);
      if (p.dir !== undefined && sideways(p.dir, info.directions ?? 1) !== (p.edge === 'W')) problems.push(`${where}: a door on a ${p.edge === 'N' ? 'north' : 'west'} edge faces ${p.edge === 'N' ? 'north or south' : 'east or west'}`);
    } else {
      if (p.edge !== undefined) problems.push(`${where}: only doors stand on an edge`);
      const [w, d] = footprintOf(info, p.dir ?? 0);
      if (p.col < 0 || p.row < 0 || p.col + w > scene.cols || p.row + d > scene.rows) problems.push(`${where}: "${p.piece}" at (${p.col}, ${p.row}) covers ${w}×${d} cells and does not fit the ${scene.cols}×${scene.rows} scene`);
    }
    if (p.variant !== undefined && !(Number.isInteger(p.variant) && p.variant >= 0 && p.variant < (info.variants ?? 1))) problems.push(`${where}: variant ${p.variant} is not one of its ${info.variants ?? 1} variants`);
    problems.push(...optionProblems(where, info, p.options));
  });
  const edges = new Set<string>();
  for (const p of scene.props ?? []) {
    if (find(catalog, p.piece)?.group !== 'door' || !p.edge) continue;
    const key = `${p.col},${p.row},${p.edge}`;
    if (edges.has(key)) problems.push(`two doors on the ${p.edge} edge of cell (${p.col}, ${p.row})`);
    edges.add(key);
  }
  for (const [id, values] of Object.entries(scene.options ?? {})) {
    const info = find(catalog, id);
    if (!info) problems.push(`options: unknown piece "${id}"`);
    else problems.push(...optionProblems('options', info, values));
  }
  for (const name of Object.values(scene.materials ?? {})) if (!catalog.materials[name]) problems.push(`unknown material "${name}"`);
  (scene.figures ?? []).forEach((f, i) => {
    if (!(f.col >= 0 && f.row >= 0 && f.col < scene.cols && f.row < scene.rows)) problems.push(`figures[${i}]: (${f.col}, ${f.row}) is outside the scene`);
  });
  return problems;
}

/** FNV-1a of a string. */
const fnv = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

/** Seed of a frame of a piece: what its sheet and every placement of it draw with. */
const frameSeed = (id: string, mask: number, variant: number) => fnv(`${id}:${mask}:${variant}`);

/**
 * A well-mixed hash of a position, to pick variants: FNV alone makes `h % 2` a checkerboard,
 * so the result goes through murmur's finalizer.
 */
const pick = (id: string, col: number, row: number) => {
  let h = fnv(`${id}@${col},${row}`);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

/** The masks a connectable piece is exported with. */
export function masksOf(connect: Connect): number[] {
  if (connect === 'none') return [0];
  // Corner mask 0 is an empty tile; every edge mask is a real piece (0 = a lone post).
  return connect === 'corners' ? Array.from({ length: 15 }, (_, i) => i + 1) : Array.from({ length: 16 }, (_, i) => i);
}

/** Masks of a piece's sheet (floors always use corner masks). */
const sheetMasks = (info: ScenePieceInfo) => (info.group === 'floor' ? masksOf('corners') : masksOf(info.connect));
/** Whether the piece's sheet has one frame per mask and variant (floors, walls, fences) or one per variant (props, decals). */
const tiled = (info: ScenePieceInfo) => info.group === 'floor' || info.connect !== 'none';

/** Frame index of a mask and variant in a piece's sheet (in the row of its facing). */
export function frameOf(info: ScenePieceInfo, mask: number, variant: number): number {
  const variants = info.variants ?? 1;
  return tiled(info) ? sheetMasks(info).indexOf(mask) * variants + variant : variant;
}

/** One frame laid in a scene: what `drawScene` draws and what a game lays out from the sheets. */
export interface SceneItem {
  piece: string;
  group: ScenePieceInfo['group'];
  /**
   * Floor transitions, and walls on borders: the vertex at the top-left corner of cell (col, row).
   * Everything else: its cell (props: the footprint's top-left cell).
   */
  col: number;
  row: number;
  /** World position of its pivot on the floor: a cell's or footprint's centre, or a vertex. */
  at: Vec3;
  mask: number;
  variant: number;
  /** Facing index of a prop; 0 for everything else. */
  dir: number;
  /** Row in the piece's sheet: the facing of a prop, the height of a wall or fence (index in its `heights`). */
  sheetRow: number;
  /** Walls and fences: the height of the frame's top in world units. */
  height?: number;
  /** The resting state drawn, for pieces with states. */
  state?: string;
  /** Doors: the edge they stand on. */
  edge?: 'N' | 'W';
  /** Frame index in the piece's sheet, in its row. */
  frame: number;
  /**
   * 'floor' items are drawn first, lowest priority first, each clipped to its tile and all to the
   * scene; then 'decal' items, then 'object' items (walls, fences, props), each by where they stand.
   */
  pass: 'floor' | 'decal' | 'object';
  options: Record<string, unknown>;
}

/**
 * Lays a scene out as frames, in drawing order (`SceneItem`):
 * - the lowest floor in the scene lays a full tile (mask 15) under every floored cell;
 * - every higher floor lays a dual-grid tile at each vertex next to one of its own cells, with the
 *   corner mask of the cells of its priority or higher (so it runs on under higher floors and no
 *   lower floor shows between two higher ones);
 * - walls and fences take the edge mask of neighbours of the same piece or a joined one;
 * - props and decals stand at the centre of their footprint, turned by their facing.
 * Variants not given in the scene are picked per position.
 */
export function layoutScene(scene: SceneData, catalog: SceneryCatalog): SceneItem[] {
  const problems = validateScene(scene, catalog);
  if (problems.length) throw new Error(`scenery:\n- ${problems.join('\n- ')}`);
  const grid = catalog.grid;
  const depth = (p: Vec3) => catalog.camera.depth(p);
  const inside = (c: number, r: number) => r >= 0 && r < scene.rows && c >= 0 && c < scene.cols;
  const floorAt = (c: number, r: number) => (inside(c, r) ? scene.floor[r][c] : null);
  const border = wallPlacement(catalog) === 'border';
  const wallSize = wallGridSize(catalog, scene.cols, scene.rows);
  const wallAt = (c: number, r: number) => (r >= 0 && r < wallSize.rows && c >= 0 && c < wallSize.cols ? scene.walls[r][c] : null);
  const item = (info: ScenePieceInfo, col: number, row: number, at: Vec3, mask: number, variant: number, dir: number, pass: SceneItem['pass'], extra?: Record<string, unknown>, level = 0, state?: string): SceneItem => {
    const heights = heightsOf(info, catalog);
    const resting = state ?? info.states?.[0];
    return {
      ...(resting !== undefined ? { state: resting } : {}),
      piece: info.id,
      group: info.group,
      col,
      row,
      at,
      mask,
      variant,
      dir,
      sheetRow: tiled(info) ? level : dir,
      ...(heights.length ? { height: heights[level] } : {}),
      frame: frameOf(info, mask, variant),
      pass,
      options: optionsOf(info, { ...scene.options?.[info.id], ...extra }),
    };
  };
  const floorItems: SceneItem[] = [];
  const ids = [...new Set(scene.floor.flat().filter((x): x is string => !!x))];
  const floors = ids.map(id => find(catalog, id)!).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const priorityAt = (c: number, r: number) => {
    const id = floorAt(c, r);
    return id ? find(catalog, id)!.priority ?? 0 : -Infinity;
  };
  floors.forEach((info, k) => {
    const variants = info.variants ?? 1;
    if (k === 0) {
      for (let r = 0; r < scene.rows; r++) for (let c = 0; c < scene.cols; c++) {
        if (floorAt(c, r)) floorItems.push(item(info, c, r, grid.center(c, r), 15, pick(info.id, c, r) % variants, 0, 'floor'));
      }
      return;
    }
    const p = info.priority ?? 0;
    for (let r = 0; r <= scene.rows; r++) for (let c = 0; c <= scene.cols; c++) {
      // Only next to one of its own cells: elsewhere a higher floor covers the same region.
      if (![floorAt(c - 1, r - 1), floorAt(c, r - 1), floorAt(c, r), floorAt(c - 1, r)].includes(info.id)) continue;
      const mask = cornerMask((cc, rr) => priorityAt(cc, rr) >= p, c, r);
      floorItems.push(item(info, c, r, grid.vertex(c, r), mask, pick(info.id, c, r) % variants, 0, 'floor'));
    }
  });
  const standing: { item: SceneItem; key: number; order: number }[] = [];
  /** The height (world units) a wall cell or vertex is laid at, when its piece comes in heights. */
  const heightAt = (c: number, r: number): number | undefined => {
    const entry = wallAt(c, r);
    const id = cellPiece(entry);
    if (!id) return undefined;
    const info = find(catalog, id)!;
    const heights = heightsOf(info, catalog);
    return heights[Math.max(0, heightIndex(info, typeof entry === 'object' && entry ? entry.height : undefined))];
  };
  const ARMS: [number, number, number][] = [[EDGE.N, 0, -1], [EDGE.E, 1, 0], [EDGE.S, 0, 1], [EDGE.W, -1, 0]];
  // Doors cut the wall runs on their edges: an edge between vertices (c, r) and (c + 1, r) is `c,r,H`, one between
  // (c, r) and (c, r + 1) is `c,r,V`; the walls on either side end there in piers, the door's jambs.
  const cuts = new Set<string>();
  for (const p of scene.props) if (find(catalog, p.piece)!.group === 'door') cuts.add(p.edge === 'N' ? `${p.col},${p.row},H` : `${p.col},${p.row},V`);
  const cutBetween = (c: number, r: number, dx: number, dy: number) =>
    dx === 1 ? cuts.has(`${c},${r},H`) : dx === -1 ? cuts.has(`${c - 1},${r},H`) : dy === 1 ? cuts.has(`${c},${r},V`) : cuts.has(`${c},${r - 1},V`);
  for (let r = 0; r < wallSize.rows; r++) for (let c = 0; c < wallSize.cols; c++) {
    const entry = wallAt(c, r);
    const id = cellPiece(entry);
    if (!id) continue;
    const info = find(catalog, id)!;
    const joins = new Set([id, ...(info.joins ?? [])]);
    const joined = (cc: number, rr: number) => {
      const other = cellPiece(wallAt(cc, rr));
      return !!other && (joins.has(other) || (find(catalog, other)!.joins ?? []).includes(id));
    };
    const mask = border ? ARMS.reduce((m, [bit, dx, dy]) => (joined(c + dx, r + dy) && !cutBetween(c, r, dx, dy) ? m | bit : m), 0) : edgeMask(joined, c, r);
    const own = typeof entry === 'object' && entry ? entry : undefined;
    // On borders a wall stands on the vertex at the top-left corner of cell (col, row) and runs along cell edges.
    const at = border ? grid.vertex(c, r) : grid.center(c, r);
    const variant = own?.variant ?? pick(id, c, r) % (info.variants ?? 1);
    const level = Math.max(0, heightIndex(info, own?.height));
    const heights = heightsOf(info, catalog);
    // A step: an arm towards a lower neighbour takes the neighbour's height when the piece comes in it, so the step
    // falls at this pier, which closes towards the lower run. Each lower height is laid first with the arms that reach
    // it, then the cell's own height with the arms that stay up; a game rebuilds it from the same rows of the sheet.
    const armLevel = new Map<number, number>();
    for (const [bit, dx, dy] of ARMS) {
      if (!(mask & bit)) continue;
      const theirs = heightAt(c + dx, r + dy);
      const lower = theirs !== undefined && heights.length ? heights.indexOf(theirs) : -1;
      armLevel.set(bit, lower >= 0 && heights[lower] < heights[level] ? lower : level);
    }
    const levels = [...new Set([level, ...armLevel.values()])].sort((a, b) => heights[a] - heights[b]);
    for (const l of levels.length ? levels : [level]) {
      let m = 0;
      for (const [bit, lv] of armLevel) if (!heights.length || heights[lv] >= heights[l]) m |= bit;
      standing.push({ item: item(info, c, r, at, levels.length > 1 ? m : mask, variant, 0, 'object', own?.options, l), key: depth(at), order: standing.length });
    }
  }
  for (const p of scene.props) {
    const info = find(catalog, p.piece)!;
    if (info.group === 'door') {
      // A door stands on the middle of its edge, facing across it.
      const v = grid.vertex(p.col, p.row);
      const at = p.edge === 'N' ? vec3(v.x + grid.cell.x / 2, v.y, 0) : vec3(v.x, v.y + grid.cell.y / 2, 0);
      const n = info.directions ?? 1;
      const dir = p.dir ?? (p.edge === 'N' || n === 1 ? 0 : (n * 3) / 4);
      const it = item(info, p.col, p.row, at, 0, p.variant ?? pick(p.piece, p.col, p.row) % (info.variants ?? 1), dir, 'object', p.options, 0, p.state);
      standing.push({ item: { ...it, edge: p.edge }, key: depth(at), order: standing.length });
      continue;
    }
    const dir = p.dir ?? 0;
    const [w, d] = footprintOf(info, dir);
    const centre = grid.center(p.col, p.row);
    const at = vec3(centre.x + ((w - 1) * grid.cell.x) / 2, centre.y + ((d - 1) * grid.cell.y) / 2, 0);
    const it = item(info, p.col, p.row, at, 0, p.variant ?? pick(p.piece, p.col, p.row) % (info.variants ?? 1), dir, info.group === 'decal' ? 'decal' : 'object', p.options, 0, p.state);
    standing.push({ item: it, key: depth(at), order: standing.length });
  }
  const sorted = (pass: SceneItem['pass']) => standing.filter(s => s.item.pass === pass).sort((a, b) => a.key - b.key || a.order - b.order).map(s => s.item);
  return [...floorItems, ...sorted('decal'), ...sorted('object')];
}

/**
 * Default exported cell of a piece: a floor or decal is exactly its tiles; walls, fences and props get room above,
 * in a cell of even width so the pivot in its middle is a whole pixel at any scale (a game anchors the sprite there).
 */
export function cellOf(info: ScenePieceInfo, catalog: SceneryCatalog): { width: number; height: number; pivot: { x: number; y: number } } {
  if (info.cell) return info.cell;
  const { w, h } = catalog.grid.screen;
  const [fw, fd] = info.footprint ?? [1, 1];
  if (info.group === 'floor' || info.group === 'decal') return { width: w * fw, height: h * fd, pivot: { x: (w * fw) / 2, y: (h * fd) / 2 } };
  const width = 2 * Math.ceil(w * fw * 0.75);
  const height = Math.ceil(h * fd + w * 2.4);
  return { width, height, pivot: { x: width / 2, y: height - Math.ceil(h * fd * 0.75) } };
}

/** What a frame is drawn with: its connection, look, facing and option values. */
interface FrameSpec {
  mask: number;
  variant: number;
  dir: number;
  /** Walls and fences: the height of the top in world units (else the piece's nominal height). */
  height?: number;
  /** The resting state (default the piece's first). */
  state?: string;
  /** A frame of an animation instead of the still state. */
  clip?: { name: string; frame: number };
  options: Record<string, unknown>;
}

/**
 * Draws one frame of a piece with `camera` on its pivot: the piece's floor marks, then its parts.
 * Floor tiles are clipped to their tile; walls and fences are cut where they join a neighbour
 * (on the border towards connected east and west edges, at the run's top towards a connected
 * north edge), so a run reads as one thing. Shared by sheets, `drawScene` and the renderer.
 */
function drawFrame(c: CanvasRenderingContext2D, info: ScenePieceInfo, catalog: SceneryCatalog, camera: Camera, f: FrameSpec, materials: SceneMaterials): void {
  const frame = buildFrame(info, catalog, camera, f, materials);
  frame.ground(c);
  frame.parts(c);
}

/**
 * Builds one frame of a piece and returns its two layers, each drawn with the frame's cuts: its floor
 * marks (shadows, pools of light; nothing for floors and decals) and its parts. A scene draws the
 * marks of a standing piece clipped to its floor, so a wall on the scene's edge casts no shadow onto
 * nothing, and the parts right after.
 */
function buildFrame(info: ScenePieceInfo, catalog: SceneryCatalog, camera: Camera, f: FrameSpec, materials: SceneMaterials): { ground(c: CanvasRenderingContext2D): void; parts(c: CanvasRenderingContext2D): void } {
  const stage = new Stage(camera);
  const flat = info.group === 'floor' || info.group === 'decal';
  const ground = flat ? undefined : stage.object({ layer: 0, at: vec3(0, 0, 0) });
  const object = stage.object({ layer: flat ? 0 : 1, at: vec3(0, 0, 0) });
  const directions = tiled(info) ? 1 : info.directions ?? 1;
  const yaw = tiled(info) ? Math.PI / 2 : facingYaw(f.dir, directions);
  let top: number | undefined;
  info.piece(
    {
      object,
      ground: ground ?? object,
      camera,
      grid: catalog.grid,
      frame: Frame3.facing(vec3(0, 0, 0), yaw),
      mask: f.mask,
      variant: f.variant,
      dir: f.dir,
      directions,
      yaw,
      height: f.height ?? pieceHeight(info, catalog),
      ...clipContext(info, f),
      seed: frameSeed(info.id, f.mask, f.variant),
      materials,
      seam: z => void (top = z),
    },
    f.options,
  );
  const centre = camera.project(vec3(0, 0, 0));
  const { w, h } = catalog.grid.screen;
  const far = 1e4;
  // Floor tiles are clipped to their tile; walls and fences are cut where they join a neighbour.
  let box: [number, number, number, number] | undefined;
  if (info.group === 'floor') box = [centre.x - w / 2, centre.y - h / 2, centre.x + w / 2, centre.y + h / 2];
  else if (info.connect === 'edges' && f.mask & (EDGE.E | EDGE.W | EDGE.N)) {
    const north = f.mask & EDGE.N && top !== undefined ? camera.project(vec3(0, -catalog.grid.cell.y / 2, top)).y : centre.y - far;
    box = [f.mask & EDGE.W ? centre.x - w / 2 : centre.x - far, north, f.mask & EDGE.E ? centre.x + w / 2 : centre.x + far, centre.y + far];
  }
  const cut = (c: CanvasRenderingContext2D, o: StageObject) => {
    if (!box) return o.draw(c);
    c.save();
    c.beginPath();
    c.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    c.clip();
    o.draw(c);
    c.restore();
  };
  return { ground: c => void (ground && cut(c, ground)), parts: c => cut(c, object) };
}

/** The state and animation frame a piece is drawn in. */
function clipContext(info: ScenePieceInfo, f: FrameSpec): { state?: string; clip?: PieceContext['clip'] } {
  const clip = f.clip ? info.clips?.[f.clip.name] : undefined;
  if (f.clip && !clip) throw new Error(`scenery: "${info.id}" has no clip "${f.clip.name}"`);
  const state = clip?.from ?? f.state ?? info.states?.[0];
  if (!clip || !f.clip) return state !== undefined ? { state } : {};
  const frame = Math.max(0, Math.min(clip.frames - 1, f.clip.frame));
  const t = clip.loop ? frame / clip.frames : clip.frames > 1 ? frame / (clip.frames - 1) : 1;
  return { ...(state !== undefined ? { state } : {}), clip: { name: f.clip.name, frame, frames: clip.frames, t } };
}

/** Clips `c` to the scene's floor (its cells on screen) and runs `fn`. */
function inSceneFloor(c: CanvasRenderingContext2D, scene: SceneData, catalog: SceneryCatalog, origin: { x: number; y: number }, fn: () => void): void {
  const { w, h } = catalog.grid.screen;
  c.save();
  c.beginPath();
  c.rect(origin.x - w / 2, origin.y - h / 2, scene.cols * w, scene.rows * h);
  c.clip();
  fn();
  c.restore();
}

/**
 * Draws a scene into a canvas context with the catalog's pieces, the way a game lays out the sheets
 * (see `layoutScene`): floors first, lowest priority first, each tile clipped to itself and all
 * to the scene's cells; then decals; then walls, fences and props by where they stand. `origin` is
 * the screen position of cell (0, 0)'s centre. For an editor that redraws often, use
 * `createSceneRenderer`, which draws each frame once.
 */
export function drawScene(ctx: CanvasRenderingContext2D, scene: SceneData, catalog: SceneryCatalog, origin: { x: number; y: number }, o: DrawSceneOptions = {}): void {
  const items = layoutScene(scene, catalog);
  const base = catalog.camera.at(origin);
  const materials = sceneMaterials(catalog, scene.materials);
  const draw = (it: SceneItem) => drawFrame(ctx, find(catalog, it.piece)!, catalog, catalog.camera.at(base.project(it.at)), it, materials);
  // A standing piece's floor marks are clipped to the scene's floor, and drawn right before its parts.
  const stand = (it: SceneItem) => {
    const frame = buildFrame(find(catalog, it.piece)!, catalog, catalog.camera.at(base.project(it.at)), it, materials);
    inSceneFloor(ctx, scene, catalog, origin, () => frame.ground(ctx));
    frame.parts(ctx);
  };
  inSceneFloor(ctx, scene, catalog, origin, () => items.filter(it => it.pass === 'floor').forEach(draw));
  items.filter(it => it.pass === 'decal').forEach(draw);
  standingOrder(items, o.figures === false ? [] : figuresOf(scene, catalog), catalog).forEach(e => (e.item ? stand(e.item) : drawFigure(ctx, catalog, catalog.camera.at(base.project(e.at)))));
}

/** Options of `drawScene` and `SceneRenderer.draw`. */
export interface DrawSceneOptions {
  /** Draw the scene's scale figures (default true; needs a space profile). */
  figures?: boolean;
}

/** The scene's scale figures as floor points (none without a space profile, which knows the character's height). */
function figuresOf(scene: SceneData, catalog: SceneryCatalog): Vec3[] {
  if (!catalog.space) return [];
  return (scene.figures ?? []).map(f => catalog.grid.center(f.col, f.row));
}

/** Walls, fences, props and scale figures in drawing order: by where they stand, figures after what stands level with them. */
function standingOrder(items: SceneItem[], figures: Vec3[], catalog: SceneryCatalog): { item?: SceneItem; at: Vec3 }[] {
  const objects = items.filter(it => it.pass === 'object').map(it => ({ item: it, at: it.at }));
  if (!figures.length) return objects;
  const depth = (p: Vec3) => catalog.camera.depth(p);
  const out: { item?: SceneItem; at: Vec3 }[] = [];
  const queue = figures.slice().sort((a, b) => depth(a) - depth(b));
  for (const o of objects) {
    while (queue.length && depth(queue[0]) < depth(o.at)) out.push({ at: queue.shift()! });
    out.push(o);
  }
  return [...out, ...queue.map(at => ({ at }))];
}

/** One scale figure, with `camera` on the cell it stands in. */
function drawFigure(ctx: CanvasRenderingContext2D, catalog: SceneryCatalog, camera: Camera): void {
  const stage = new Stage(camera);
  scaleFigure(stage.object({ at: vec3(0, 0, 0) }), vec3(0, 0, 0), catalog.space!.scale.character);
  stage.draw(ctx);
}

/** An offscreen canvas: an `OffscreenCanvas` or a DOM canvas. */
export interface SceneCanvas {
  width: number;
  height: number;
  getContext(type: '2d', options?: { willReadFrequently?: boolean }): unknown;
}

/** Options of `createSceneRenderer`. */
export interface SceneRendererOptions {
  /** Makes an offscreen canvas of a size in device pixels. Default: a DOM canvas, else an `OffscreenCanvas`. */
  canvas?: (width: number, height: number) => SceneCanvas;
  /** Most frames kept. Default 1500. */
  limit?: number;
}

/** Draws scenes from a cache of frames (see `createSceneRenderer`). */
export interface SceneRenderer {
  /**
   * Draws the scene like `drawScene`. Frames drawn before (same piece, mask, variant, facing,
   * options and materials) are reused, so after an edit only new frames are drawn. The context's
   * transform must be a scale and a translation; frames are drawn at that scale, and positions
   * are exact at whole scales (rounded to device pixels otherwise).
   */
  draw(ctx: CanvasRenderingContext2D, scene: SceneData, origin: { x: number; y: number }, o?: DrawSceneOptions): void;
  /**
   * The cached image of one laid-out frame at the current scale, and where its pivot is inside
   * it (device px): for a ghost under the pointer, or a thumbnail. Draws it if needed.
   */
  frame(item: SceneItem & { clip?: { name: string; frame: number } }, materials?: Record<string, string>): { image: SceneCanvas; x: number; y: number };
  /** Forgets every frame (after the kit's code changed). */
  clear(): void;
  /** Frames in the cache. */
  readonly size: number;
  /** Frames drawn since the renderer was made (cache misses). */
  readonly drawn: number;
}

function defaultCanvas(width: number, height: number): SceneCanvas {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  throw new Error('createSceneRenderer: no canvas is available here; pass `canvas`.');
}

/**
 * A scene renderer for editors and games that redraw often. Every frame (a piece with its mask,
 * variant, facing, options and materials) is drawn once into an offscreen canvas, in the piece's
 * exported cell plus a margin, and then copied to its place: the result is what `drawScene` and a
 * game laying out the sheets draw: frames are rasterized in software, like the exported sheets, so
 * at the export scale the result matches them pixel for pixel (up to the rounding of compositing
 * translucent edges). Changing the drawing scale starts a new cache.
 */
export function createSceneRenderer(catalog: SceneryCatalog, o: SceneRendererOptions = {}): SceneRenderer {
  const make = o.canvas ?? defaultCanvas;
  const limit = o.limit ?? 1500;
  /** A cached frame: its parts, its floor marks (standing pieces), both together (built when asked), and its pivot in device px. */
  type Cached = { parts: SceneCanvas; ground?: SceneCanvas; whole?: SceneCanvas; x: number; y: number };
  const cache = new Map<string, Cached>();
  const materialSets = new Map<string, SceneMaterials>();
  let scale = 1;
  let drawn = 0;
  const setScale = (s: number) => {
    if (s === scale) return;
    cache.clear();
    scale = s;
  };
  const frame = (it: SceneItem & { clip?: { name: string; frame: number } }, overrides?: Record<string, string>) => {
    const materialsKey = JSON.stringify(overrides ?? {});
    const key = `${it.piece}|${it.mask}|${it.variant}|${it.dir}|${it.height ?? ''}|${it.state ?? ''}|${it.clip ? `${it.clip.name}:${it.clip.frame}` : ''}|${JSON.stringify(it.options)}|${materialsKey}`;
    const hit = cache.get(key);
    if (hit) {
      // Most recently used last, so the oldest is dropped first.
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const info = find(catalog, it.piece);
    if (!info) throw new Error(`scenery: unknown piece "${it.piece}"`);
    let materials = materialSets.get(materialsKey);
    if (!materials) materialSets.set(materialsKey, (materials = sceneMaterials(catalog, overrides)));
    const cell = cellOf(info, catalog);
    const margin = info.group === 'floor' ? 0 : catalog.grid.screen.w / 2;
    const width = Math.max(1, Math.ceil((cell.width + margin * 2) * scale));
    const height = Math.max(1, Math.ceil((cell.height + margin * 2) * scale));
    // A software canvas rasterizes exactly like the exporter, so the frames match the sheets pixel for pixel
    // (a GPU canvas antialiases edges and blurs glows a little differently).
    const canvas = () => {
      const image = make(width, height);
      const c = image.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      c.setTransform(scale, 0, 0, scale, 0, 0);
      return { image, c };
    };
    const pivot = { x: cell.pivot.x + margin, y: cell.pivot.y + margin };
    const built = buildFrame(info, catalog, catalog.camera.at(pivot), it, materials);
    const parts = canvas();
    built.parts(parts.c);
    let ground: SceneCanvas | undefined;
    if (info.group !== 'floor' && info.group !== 'decal') {
      const g = canvas();
      built.ground(g.c);
      ground = g.image;
    }
    drawn++;
    const entry: Cached = { parts: parts.image, ground, x: pivot.x * scale, y: pivot.y * scale };
    if (cache.size >= limit) cache.delete(cache.keys().next().value!);
    cache.set(key, entry);
    return entry;
  };
  return {
    get size() {
      return cache.size;
    },
    get drawn() {
      return drawn;
    },
    clear() {
      cache.clear();
    },
    frame(it, materials) {
      const f = frame(it, materials);
      if (!f.ground) return { image: f.parts, x: f.x, y: f.y };
      if (!f.whole) {
        f.whole = make(f.parts.width, f.parts.height);
        const c = f.whole.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
        c.drawImage(f.ground as CanvasImageSource, 0, 0);
        c.drawImage(f.parts as CanvasImageSource, 0, 0);
      }
      return { image: f.whole, x: f.x, y: f.y };
    },
    draw(ctx, scene, origin, o = {}) {
      const items = layoutScene(scene, catalog);
      const t = ctx.getTransform();
      setScale(Math.hypot(t.a, t.b));
      const base = catalog.camera.at(origin);
      const device = (x: number, y: number) => ({ x: t.a * x + t.e, y: t.d * y + t.f });
      const { w, h } = catalog.grid.screen;
      const a = device(origin.x - w / 2, origin.y - h / 2);
      const b = device(origin.x - w / 2 + scene.cols * w, origin.y - h / 2 + scene.rows * h);
      const inFloor = (fn: () => void) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(Math.round(a.x), Math.round(a.y), Math.round(b.x) - Math.round(a.x), Math.round(b.y) - Math.round(a.y));
        ctx.clip();
        fn();
        ctx.restore();
      };
      // A standing piece's floor marks are clipped to the scene's floor, and drawn right before its parts.
      const blit = (it: SceneItem) => {
        const f = frame(it, scene.materials);
        const p = device(base.project(it.at).x, base.project(it.at).y);
        const x = Math.round(p.x - f.x);
        const y = Math.round(p.y - f.y);
        if (f.ground) inFloor(() => ctx.drawImage(f.ground as CanvasImageSource, x, y));
        ctx.drawImage(f.parts as CanvasImageSource, x, y);
      };
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      inFloor(() => items.filter(it => it.pass === 'floor').forEach(blit));
      items.filter(it => it.pass === 'decal').forEach(blit);
      // Scale figures are cheap and drawn live, in the scene's own transform.
      const figure = (at: Vec3) => {
        ctx.save();
        ctx.setTransform(t);
        drawFigure(ctx, catalog, catalog.camera.at(base.project(at)));
        ctx.restore();
      };
      standingOrder(items, o.figures === false ? [] : figuresOf(scene, catalog), catalog).forEach(e => (e.item ? blit(e.item) : figure(e.at)));
      ctx.restore();
    },
  };
}

/** Options of `defineTileSet`. */
export interface TileSetOptions {
  catalog: SceneryCatalog;
  piece: string;
  options?: Record<string, unknown>;
  /** Role → material name overrides. */
  materials?: Record<string, string>;
  scale?: number;
  /** A still sheet of this resting state (default the piece's first). */
  state?: string;
  /** An animated sheet of this clip instead: its frames across, the facings of every variant down. */
  clip?: string;
  /** Only this variant in an animated sheet (default: every variant, one block of facings each). */
  variant?: number;
}

/**
 * Exports one piece of the catalog as the sheet a game lays out:
 * - floors and connectable pieces: one frame per mask and variant (`meta.data.tiles` maps each
 *   frame to its mask and variant); a full floor tile is mask 15, transitions are the corner
 *   masks 1–14 of a dual-grid tile centred on a vertex;
 * - props and decals: rows per facing, one frame per variant.
 * Floor frames are exactly one tile, pivoted at its centre; draw floors at the tile's centre and
 * transitions at the vertex between four tiles. Every frame is what `drawScene` draws for it.
 */
export function defineTileSet(o: TileSetOptions): AssetDefinition {
  const info = find(o.catalog, o.piece);
  if (!info) throw new Error(`scenery: unknown piece "${o.piece}"`);
  const problems = optionProblems('defineTileSet', info, o.options);
  if (info.variantLabels && info.variantLabels.length !== (info.variants ?? 1)) problems.push(`"${info.id}" has ${info.variantLabels.length} variantLabels for ${info.variants ?? 1} variants`);
  if (o.state !== undefined && !(info.states ?? []).includes(o.state)) problems.push(`"${info.id}" has no state "${o.state}" (${JSON.stringify(info.states ?? [])})`);
  if (o.clip !== undefined && !info.clips?.[o.clip]) problems.push(`"${info.id}" has no clip "${o.clip}" (${Object.keys(info.clips ?? {}).join(', ') || 'none'})`);
  if (problems.length) throw new Error(`scenery:\n- ${problems.join('\n- ')}`);
  if (o.clip) return clipSheet(o, info, info.clips![o.clip]);
  const variants = info.variants ?? 1;
  // Rows: a prop's facings, or a wall's heights (one row per height it comes in).
  const heights = tiled(info) ? heightsOf(info, o.catalog) : [];
  const directions = tiled(info) ? Math.max(1, heights.length) : info.directions ?? 1;
  const masks = tiled(info) ? sheetMasks(info) : [0];
  const frames = masks.length * variants;
  const tiles = Array.from({ length: frames }, (_, i) => ({ frame: i, mask: masks[Math.floor(i / variants)], variant: i % variants }));
  const cell = cellOf(info, o.catalog);
  const materials = sceneMaterials(o.catalog, o.materials);
  const grid = o.catalog.grid;
  const options = optionsOf(info, o.options);
  const nominal = pieceHeight(info, o.catalog);
  return defineAsset({
    width: cell.width,
    height: cell.height,
    scale: o.scale ?? 2,
    frames,
    directions,
    pivot: cell.pivot,
    data: {
      role: info.group === 'floor' ? 'tile' : info.group,
      piece: info.id,
      label: info.label,
      group: info.group,
      connect: info.group === 'floor' ? 'corners' : info.connect,
      maskBits: info.group === 'floor' || info.connect === 'corners' ? CORNER : info.connect === 'edges' ? EDGE : {},
      variants,
      ...(info.variantLabels ? { variantLabels: info.variantLabels } : {}),
      footprint: info.footprint ?? [1, 1],
      ...(info.priority !== undefined ? { priority: info.priority } : {}),
      ...(info.joins?.length ? { joins: info.joins } : {}),
      ...(nominal !== undefined ? { height: { world: nominal, screen: Math.round(screenHeight(o.catalog.camera, nominal) * 100) / 100 } } : {}),
      ...(heights.length > 1 ? { rows: 'heights', heights: heights.map((h, row) => ({ row, name: info.heights?.[row], world: h, screen: Math.round(screenHeight(o.catalog.camera, h) * 100) / 100 })) } : {}),
      grid: { screen: grid.screen, cell: grid.cell },
      ...(o.catalog.space ? { space: spaceData(o.catalog.space) } : {}),
      ...pieceData(info, o.state),
      layer: info.group === 'floor' || info.group === 'decal' ? 0 : 1,
      tiles,
    },
    render({ ctx, frameIndex = 0, direction = 0 }) {
      const t = tiles[frameIndex];
      const level = heights.length ? heights[Math.min(direction, heights.length - 1)] : undefined;
      drawFrame(ctx, info, o.catalog, o.catalog.camera.at(cell.pivot), { mask: t.mask, variant: t.variant, dir: tiled(info) ? 0 : direction, height: level, state: o.state, options }, materials);
    },
  });
}

/**
 * What a sheet says about a piece's states, clips and part in play. Sheet names are siblings in
 * `sheets/scenery/` (`<id>--<state>`, `<id>--<clip>`), except a default state with its own `asset`,
 * which is that path under `sheets/`.
 */
function pieceData(info: ScenePieceInfo, state?: string) {
  return {
    ...(info.states ? { states: info.states, state: state ?? info.states[0], stateSheets: Object.fromEntries(info.states.map((st, i) => [st, i === 0 ? (info.asset || info.id) : `${info.id}--${st}`])) } : {}),
    ...(info.clips ? { clips: Object.fromEntries(Object.entries(info.clips).map(([name, c]) => [name, { ...c, fps: c.fps ?? 10, sheet: `${info.id}--${name}` }])) } : {}),
    ...(info.nav ? { nav: info.nav } : {}),
  };
}

/**
 * An animated sheet of one clip of a piece: the clip's frames across; down, the piece's facings for
 * each of its variants (or for the one variant asked); the atlas says the clip (frames, fps, loop,
 * from, to, events) like a character's, and `rows` which facing and variant each row is.
 */
function clipSheet(o: TileSetOptions, info: ScenePieceInfo, clip: PieceClip): AssetDefinition {
  const name = o.clip!;
  const cell = cellOf(info, o.catalog);
  const materials = sceneMaterials(o.catalog, o.materials);
  const options = optionsOf(info, o.options);
  const facings = info.directions ?? 1;
  const looks = o.variant !== undefined ? [o.variant] : Array.from({ length: info.variants ?? 1 }, (_, v) => v);
  const rows = looks.flatMap(variant => Array.from({ length: facings }, (_, dir) => ({ dir, variant })));
  const nominal = pieceHeight(info, o.catalog);
  return defineAsset({
    width: cell.width,
    height: cell.height,
    scale: o.scale ?? 2,
    frames: clip.frames,
    fps: clip.fps ?? 10,
    directions: rows.length,
    pivot: cell.pivot,
    data: {
      role: info.group,
      piece: info.id,
      label: info.label,
      group: info.group,
      rows: rows.map((r, row) => ({ row, ...r })),
      footprint: info.footprint ?? [1, 1],
      ...(nominal !== undefined ? { height: { world: nominal, screen: Math.round(screenHeight(o.catalog.camera, nominal) * 100) / 100 } } : {}),
      grid: { screen: o.catalog.grid.screen, cell: o.catalog.grid.cell },
      ...(o.catalog.space ? { space: spaceData(o.catalog.space) } : {}),
      ...pieceData(info),
      clip: { name, frames: clip.frames, fps: clip.fps ?? 10, loop: !!clip.loop, ...(clip.from ? { from: clip.from } : {}), ...(clip.to ? { to: clip.to } : {}), events: clip.events ?? [] },
      layer: info.group === 'decal' ? 0 : 1,
    },
    render({ ctx, frameIndex = 0, direction = 0 }) {
      const r = rows[Math.min(direction, rows.length - 1)];
      drawFrame(ctx, info, o.catalog, o.catalog.camera.at(cell.pivot), { mask: 0, variant: r.variant, dir: r.dir, clip: { name, frame: frameIndex }, options }, materials);
    },
  });
}

/** Options of `defineSceneAsset`. */
export interface SceneAssetOptions {
  catalog: SceneryCatalog;
  scene: SceneData;
  /** Extra logical pixels around the scene (room for walls and props above the top row), rounded to a whole pixel. Default 2 cells. */
  margin?: number;
  scale?: number;
  /** Draw the scene's scale figures (default false: a reference image shows the scene as a game would). */
  figures?: boolean;
}

/**
 * Exports a whole scene (a set, a vignette, a level chunk) as one image, for reference and
 * previews. Its atlas carries the layout a game follows to build the same picture from the
 * sheets: `layout` lists every frame in drawing order with its piece, frame, facing row and pivot
 * in the image (logical px). An item with `options` (or a scene with `materials`) draws a frame
 * the default sheets do not hold: a look a game needs belongs in a variant.
 */
export function defineSceneAsset(o: SceneAssetOptions): AssetDefinition {
  const { w, h } = o.catalog.grid.screen;
  const margin = Math.round(o.margin ?? w * 2);
  const width = Math.ceil(o.scene.cols * w + margin * 2);
  const height = Math.ceil(o.scene.rows * h + margin * 2.5);
  // The floor's corner on whole pixels, so its edges and the seams between its tiles are not drawn half-covered.
  const origin = { x: margin + w / 2, y: Math.round(margin * 1.75) + h / 2 };
  const base = o.catalog.camera.at(origin);
  const layout = layoutScene(o.scene, o.catalog).map(it => {
    const p = base.project(it.at);
    const info = find(o.catalog, it.piece)!;
    const defaults = optionsOf(info);
    // Option values other than the defaults draw a frame the piece's sheet does not hold.
    const custom = Object.fromEntries(Object.entries(it.options).filter(([k, v]) => defaults[k] !== v));
    return { piece: it.piece, frame: it.frame, row: it.sheetRow, dir: it.dir, mask: it.mask, variant: it.variant, pass: it.pass, x: p.x, y: p.y, ...(it.state !== undefined ? { state: it.state } : {}), ...(it.edge ? { edge: it.edge } : {}), ...(Object.keys(custom).length ? { options: custom } : {}) };
  });
  return defineAsset({
    width,
    height,
    scale: o.scale ?? 2,
    data: { role: 'scene', cols: o.scene.cols, rows: o.scene.rows, grid: { screen: o.catalog.grid.screen, cell: o.catalog.grid.cell }, walls: wallPlacement(o.catalog), origin, ...(o.catalog.space ? { space: spaceData(o.catalog.space) } : {}), ...(o.scene.materials ? { materials: o.scene.materials } : {}), layout, navigation: sceneNavigation(o.scene, o.catalog) },
    render({ ctx }) {
      drawScene(ctx, o.scene, o.catalog, origin, { figures: o.figures ?? false });
    },
  });
}

/**
 * A soft pool of light on the floor around `at` (world, z = 0): a radial gradient of `color` that
 * fades out at `radius` (logical px across), flattened by the camera's tilt; `strength` is its
 * alpha at the centre. Add it to `ctx.ground`, so it lies under the parts and their contour.
 */
export function floorGlow(ground: StageObject, at: Vec3, o: { radius: number; color: string; strength?: number }): void {
  const strength = o.strength ?? 0.28;
  ground.custom(vec3(at.x, at.y, 0), (c, cam) => {
    const p = cam.project(vec3(at.x, at.y, 0));
    c.save();
    c.translate(p.x, p.y);
    c.scale(1, Math.sin((cam.tilt * Math.PI) / 180));
    const g = c.createRadialGradient(0, 0, 0, 0, 0, o.radius);
    g.addColorStop(0, alpha(o.color, strength));
    g.addColorStop(0.5, alpha(o.color, strength * 0.45));
    g.addColorStop(1, alpha(o.color, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, o.radius, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }, { bias: 1 });
}

/** Rows of a picture map: `.` is the base, any other letter a piece from `keys`. */
const fromMap = (rows: string[], keys: Record<string, string | null>, base: string | null) => rows.map(row => [...row].map(ch => (ch === '.' ? base : keys[ch] ?? base)));

/**
 * A scene that puts one piece through every join it has, for the guide's seam check
 * (`npm run scenery-test`, or an editor's preview):
 * - a floor: patches of it on the lowest floor, or on `on` (a 3×3, a single cell, a diagonal pair
 *   for the saddle masks, a ring round a hole, an L); for the base floor itself, the same patches
 *   of another floor on a field of it; with `field`, a 14 × 10 field of the floor alone, to judge
 *   repetition at 1×;
 * - a wall or fence: a closed loop with a T below it, a cross, a lone post, a free run with two
 *   ends, and a run through the first piece it joins;
 * - a prop or decal: every facing (rows) by every variant of every state (columns), spaced by its
 *   exported cell;
 * - a door: a walled room with the door on its north wall and, in its next state, on its west wall.
 * Everything stands on the catalog's lowest floor, or on `on` (null for no floor).
 */
export function seamTestScene(catalog: SceneryCatalog, piece: string, o: { on?: string | null; field?: boolean } = {}): SceneData {
  const info = find(catalog, piece);
  if (!info) throw new Error(`scenery: unknown piece "${piece}"`);
  const floors = catalog.pieces.filter(p => p.group === 'floor').sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  if (o.on && find(catalog, o.on)?.group !== 'floor') throw new Error(`scenery: "${o.on}" is not a floor`);
  const base = o.on === undefined ? floors[0]?.id ?? null : o.on;
  if (info.group === 'floor') {
    // A field of the floor alone: its full tiles at cell centres, to judge repetition.
    if (o.field) return { ...emptyScene(catalog, 14, 10), floor: Array.from({ length: 10 }, () => Array(14).fill(info.id)), figures: [{ col: 7, row: 5 }] };
    const patches = ['...........', '.XXX..X....', '.XXX....X..', '.XXX...X...', '...........', '.XXXXX..X..', '.X...X..XX.', '.XXXXX.....', '...........'];
    const field = info.id === base ? info.id : base;
    const patch = info.id === base ? floors.find(f => f.id !== info.id)?.id ?? info.id : info.id;
    const floor = fromMap(patches, { X: patch }, field);
    return { ...emptyScene(catalog, 11, 9), floor, figures: [{ col: 9, row: 4 }] };
  }
  if (info.group === 'wall' || info.group === 'fence') {
    const joined = info.joins?.[0] ?? catalog.pieces.find(p => p.joins?.includes(info.id))?.id ?? info.id;
    const runs = ['...........', '.WWWWW..W..', '.W...W.WWW.', '.W...W..W..', '.WWWWW.....', '...W.......', '.W...WWWWW.', '...........', '..WWJWW....'];
    // On borders the walls grid has one more row and column (vertices); the runs keep their shape.
    const size = wallGridSize(catalog, 11, 9);
    const walls: (SceneCell | null)[][] = fromMap([...runs, ...Array(size.rows - runs.length).fill('.'.repeat(11))].map(r => r.padEnd(size.cols, '.')), { W: info.id, J: joined }, null);
    // A piece in several heights: the free run steps to its last height halfway.
    if ((info.heights?.length ?? 0) > 1) for (const col of [8, 9]) walls[6][col] = { piece: info.id, height: info.heights![info.heights!.length - 1] };
    // One figure inside the loop, one in front of the free run.
    return { cols: 11, rows: 9, floor: Array.from({ length: 9 }, () => Array(11).fill(base)), walls, props: [], figures: [{ col: 3, row: 2 }, { col: 7, row: 7 }] };
  }
  if (info.group === 'door') {
    // A walled room with the door on its north wall (default state) and on its west wall (its next state).
    const wall = catalog.pieces.find(p => info.joins?.includes(p.id)) ?? catalog.pieces.find(p => p.group === 'wall');
    const scene = { ...emptyScene(catalog, 7, 6), floor: Array.from({ length: 6 }, () => Array(7).fill(base)), figures: [{ col: 3, row: 3 }] };
    if (wall) {
      for (let c = 1; c <= 6; c++) (scene.walls[1][c] = wall.id), (scene.walls[5][c] = wall.id);
      for (let r = 1; r <= 5; r++) (scene.walls[r][1] = wall.id), (scene.walls[r][6] = wall.id);
    }
    scene.props = [{ piece: info.id, col: 3, row: 1, edge: 'N' }, { piece: info.id, col: 1, row: 3, edge: 'W', ...(info.states?.[1] ? { state: info.states[1] } : {}) }];
    return scene;
  }
  const directions = info.directions ?? 1;
  const variants = info.variants ?? 1;
  const states = info.states ?? [undefined];
  // Room for the tallest and widest facing: a tall prop must not stand in front of the row above.
  const cell = cellOf(info, catalog);
  const { w, h } = catalog.grid.screen;
  const turned = Array.from({ length: directions }, (_, d) => footprintOf(info, d));
  const across = Math.max(Math.max(...turned.map(t => t[0])) + 1, Math.ceil(cell.width / w) + 1);
  const deep = Math.max(Math.max(...turned.map(t => t[1])) + 1, Math.ceil(cell.pivot.y / h));
  const cols = states.length * variants * across + 1;
  const rows = directions * deep + 1;
  const props: ScenePlacement[] = [];
  // Columns: every variant of every state; rows: the facings.
  for (let d = 0; d < directions; d++) states.forEach((state, si) => {
    for (let v = 0; v < variants; v++) props.push({ piece: info.id, col: 1 + (si * variants + v) * across, row: 1 + d * deep, dir: d, variant: v, ...(state !== undefined ? { state } : {}) });
  });
  // A figure beside each facing's row.
  const figures = Array.from({ length: directions }, (_, d) => ({ col: 0, row: Math.min(rows - 1, 1 + d * deep + turned[d][1] - 1) }));
  return { ...emptyScene(catalog, cols, rows), floor: Array.from({ length: rows }, () => Array(cols).fill(base)), props, figures };
}

/** Random-but-stable helper for pieces: a `createRng` seeded by the frame. */
export const pieceRng = (ctx: Pick<PieceContext, 'seed'>) => createRng(ctx.seed);
