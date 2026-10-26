/**
 * The atlas JSON every Diorama sheet is exported with (`tools/export.ts`): the cells of its picture (`frames`), its layout
 * (`meta`) and, in `meta.data`, what a player needs to know about it. docs/guides/rig/04-atlas-contract.md is the contract.
 */

import type { CharacterManifest } from './character.js';
import type { EffectMeta } from './effect.js';
import type { ItemMeta } from './item.js';
import type { PieceClipData, PieceClipSheet, PieceHeight, PieceNavData, PieceRow, PieceTile } from './scenery.js';
import type { Grid, SceneLayoutItem, SceneNavigation, SpaceData } from './scene.js';
import type { FontMeta, Insets, UiBox } from './ui.js';

/** A point: on the floor in world units, or on the screen in px, as each use says. */
export interface Vec2 {
  x: number;
  y: number;
}

/** A rectangle in px. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A named moment of a clip, on a frame (0-based): `hit`, `cast`, `release`, `cancel`, `land`, `step:<leg>`, `spawn:<socket>`. */
export interface AtlasEvent {
  frame: number;
  name: string;
}

/** Points on the body where effects appear. x, y are logical px from the cell's top-left; d > 0 is in front of the body. */
export interface AtlasSockets {
  names: string[];
  frames: Record<string, Array<[x: number, y: number, d: number]>>;
}

/** A cell of the sheet's picture, in exported px. A packed sheet (trimmed frames) adds where the cell was cut from. */
export interface AtlasFrame extends Rect {
  /** The same cell in logical px (exported px over `meta.scale`). */
  logical?: Rect;
  direction?: string;
  frame?: number;
  /** Packed sheets: the trimmed frame's offset inside its untrimmed cell, and the cell's size (exported px). */
  ox?: number;
  oy?: number;
  cellW?: number;
  cellH?: number;
}

/** What the export measured on a character clip (`@core/rig` `checkClip`), in world units. */
export interface ClipMotion {
  boneDrift: number;
  footSlide: number | null;
  lowestFoot: number;
  lowestJoint: number;
  loopGap: number;
  warnings: string[];
}

/** One grip check's worst value over a sheet's facings and frames (`@core/rig` `GripMeasure`). */
export interface GripMeasure {
  worst: number;
  /** The frame it is in, `<DIR>_<n>` as in `sockets`. */
  frame: string;
  hand: 'left' | 'right';
  /** Frames past the check's limit, of those measured. */
  failing: number;
  of: number;
}

/** What the export measured on how a character's hands hold what it holds (`@core/rig` `checkGrips`): ratios of the hand, the arm and a palm. */
export interface ClipGrips {
  gripGap: GripMeasure | null;
  openHandHolding: GripMeasure | null;
  wristLimit: GripMeasure | null;
  reachStretch: GripMeasure | null;
  gripDrift: GripMeasure | null;
  handleTooShort: GripMeasure | null;
  errors: string[];
  warnings: string[];
  notes: string[];
}

/** `meta.data`: what the engine says a sheet is. Each role fills its own fields. */
export interface AtlasData {
  /** Written by the engine for characters; assets exported before that are classified by fallback rules (contract §6). */
  role?: string;
  /** The contract version the sheet was written for (`CONTRACT`). */
  contract?: number;
  clipKind?: 'locomotion' | 'idle' | 'action';
  /** The clip's kind: idle, walk, run, attack, skill, hit, death... (docs/guides/rig/04-atlas-contract.md). */
  action?: string;
  key?: string;
  tags?: string[];
  hold?: boolean;
  /** Root motion: forward world units from the start at each frame, then at the end (frames + 1 values). */
  travel?: number[];
  /** What `travel` is in, in words. */
  travelUnits?: string;
  /** The export's own check of a character clip (bone drift, foot slide, loop gap, warnings): not needed to play it. */
  motion?: ClipMotion;
  /** The export's check of how a character's hands hold what it holds, for a character holding an item that says how it is held: not needed to play it. */
  grips?: ClipGrips;
  sockets?: AtlasSockets;
  /** The character's manifest on a character sheet; on a gear item only the id of the character it is worn by. */
  character?: CharacterManifest | string;
  /** A gear item (`role: 'gear'`): the catalog part it shows, its equipment slot (`equip`, when it has one), slot and side. */
  part?: string;
  equip?: string;
  /** What a gear item, a prop or a piece of scenery is called and the group it belongs to ('head', 'door', 'wall'...). */
  label?: string;
  group?: string;
  slot?: string;
  side?: number;
  skeleton?: string;
  /** A character clip's name; on a piece's clip sheet, the clip it plays (frames, fps, loop, from, to, events). */
  clip?: string | PieceClipSheet;
  loop?: boolean;
  seconds?: number;
  groundSpeed?: number;
  groundSpeedUnits?: string;
  events?: AtlasEvent[];
  /** Visual effects (`role: 'vfx'`), with the camera they were drawn for. */
  effect?: EffectMeta;
  camera?: { tilt: number; heightBoost?: number };
  /** Item icons (`role: 'icon'`). */
  item?: ItemMeta;
  /** Interface pieces (`role: 'ui'`): what it is for, and what a game needs to stretch or fill it. */
  kind?: string;
  nineSlice?: Insets;
  /** Interface pieces: one row per state (nine-slices, images). Scenery pieces: the states it rests in. */
  states?: string[];
  fillBox?: UiBox;
  grows?: 'right' | 'left' | 'up' | 'down';
  /** Bars: the layers, one frame each, in sheet order ('back', 'fill', 'frame', then the optional 'cap'). */
  layers?: string[];
  /** Bars: the cap, a frame drawn with the bright edge at the full end of `fillBox`, within `width` logical px of it. */
  cap?: { width: number };
  /** Slots: the margin round the well (logical px), so a slot for an icon is the icon plus these. */
  content?: Insets;
  measure?: string;
  font?: FontMeta;
  /** Portrait frames: the window (logical px) a portrait shows through. */
  window?: UiBox;
  /** Cursors: the point that clicks (logical px from the cell's top-left; `meta.pivot` marks it too). */
  hotspot?: Vec2;
  /** Scenery pieces: the piece, the sheet of each resting state and the clips between them (guide 05 of volume). */
  piece?: string;
  /** The state this sheet shows, one of `states`. */
  state?: string;
  stateSheets?: Record<string, string>;
  clips?: Record<string, PieceClipData>;
  nav?: PieceNavData;
  footprint?: [number, number];
  /** 0 on the ground (floors, decals), 1 standing. */
  layer?: number;
  /** One per frame: the neighbour mask and the variant it is drawn for. */
  tiles?: PieceTile[];
  /** How many looks it comes in, and their names. */
  variants?: number;
  variantLabels?: string[];
  /** Its nominal height, world units and screen px; a wall or fence in several heights has one row per height. */
  height?: { world: number; screen: number };
  heights?: PieceHeight[];
  connect?: string;
  maskBits?: Record<string, number>;
  joins?: string[];
  priority?: number;
  /** The space profile the scenery, scene or effect was drawn in (`@core/volume` `spaceData`). */
  space?: SpaceData;
  /** Scenes (`role: 'scene'`): the grid, where cell (0, 0)'s centre is in the picture (logical px), the layout and the navigation. */
  cols?: number;
  /** A scene's rows; on a piece's sheet, what its rows are ('heights', or the facing and variant of each row of a clip sheet). */
  rows?: number | 'heights' | PieceRow[];
  grid?: Grid;
  origin?: Vec2;
  walls?: string;
  layout?: SceneLayoutItem[];
  navigation?: SceneNavigation;
}

/** The layout of a sheet: its mode, frames, facings (rows) and their yaws, pivot, fps and export scale, and `data`. */
export interface AtlasMeta {
  project?: string;
  mode?: string;
  frameCount?: number;
  directions?: string[];
  directionFacings?: number[];
  directionOrder?: string;
  pivot?: { x: number; y: number; logical?: { x: number; y: number } };
  data?: AtlasData;
  frameWidth?: number;
  frameHeight?: number;
  fps?: number;
  width?: number;
  height?: number;
  scale?: number;
  format?: string;
  image?: string;
  animations?: Record<string, number[]>;
}

/** An exported atlas JSON. */
export interface Atlas {
  meta: AtlasMeta;
  frames: Record<string, AtlasFrame>;
}
