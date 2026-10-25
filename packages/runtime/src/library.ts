/**
 * What a game can play, read only from exported sheets and following docs/guides/rig/04-atlas-contract.md: a character is
 * a set of clips that share a manifest (or, for older atlases, a folder, skeleton and pivot); effects are played on cues;
 * interface pieces and icons are looked up by path and item; everything else is a sprite. Meaning never comes from file names.
 */

import type { Atlas, AtlasEvent, Rect, Vec2 } from './contract/atlas.js';
import type { CharacterManifest, EffectCue } from './contract/character.js';
import type { EffectMeta } from './contract/effect.js';
import type { ItemMeta } from './contract/item.js';
import type { FontMeta, Insets, UiBox } from './contract/ui.js';
import { clipFrames, clipNames } from './frames.js';
import { playableClips } from './gear.js';
import { basenameOf, dirnameOf, manifestOf, type Sheet, type SheetPath, type SheetRef } from './read.js';

/** What a clip does: stands, moves, or acts. */
export type ClipCategory = 'idle' | 'locomotion' | 'action';

/** A playable clip: one sheet, its frames by facing row, and what the contract says about it. */
export interface Clip<A extends SheetRef = SheetRef> {
  /** The sheet it plays, as the host gave it to `readSheet`. */
  asset: A;
  atlas: Atlas;
  /** The file name without extension: the key the manifest refers to. */
  key: string;
  name: string;
  /** idle, walk, run, attack, skill, hit, death, dodge... */
  kind: string;
  category: ClipCategory;
  tags: string[];
  fps: number;
  frameCount: number;
  loop: boolean;
  /** Plays once and stays on its last frame until the character is reset. */
  hold: boolean;
  /** World units per second the character moves while it plays, so the feet stay planted (locomotion). */
  groundSpeed: number;
  events: AtlasEvent[];
  /** The action may be interrupted from this frame on. */
  cancelFrame: number | null;
  /** Root motion in world units: distance ahead at each frame boundary (frames + 1 values). */
  travel: number[] | null;
  /** Exported px per world unit (`meta.scale`). */
  scale: number;
  /** The frames of this clip when facing one direction row, cached. */
  rects: (row: number) => Rect[];
}

/** The camera tilt (degrees) assumed when a character has no manifest. */
export const DEFAULT_TILT = 48;

/** A character: its clips and the bindings of its controls, its camera and the effects it cues. */
export interface Character<A extends SheetRef = SheetRef> {
  id: string;
  /** The manifest's `name`, the character's id ('ossuary-guard'); without a manifest, the folder's last segment. */
  name: string;
  /** The name people read: the manifest's `label` ('Ossuary Guard'), else `name` (atlases exported before labels). */
  label: string;
  folder: string;
  clips: Clip<A>[];
  idle: Clip<A> | null;
  /** Slowest first: the first one walks, the last one runs. */
  locomotion: Clip<A>[];
  /** Bound to 1, 2, 3...: attack, skill, dodge and the like, in that order. Hit and death have their own keys. */
  actions: Clip<A>[];
  hit: Clip<A> | null;
  death: Clip<A> | null;
  /** Problems the engine found when the character was defined. Shown, never blocking. */
  warnings: string[];
  /** Camera tilt in degrees: ground distances along the view shrink by its sine on screen. */
  tilt: number;
  /** The camera's height boost: how much a height above the floor lifts something on the screen. */
  boost: number;
  /** Exported px per world unit of its sheets. */
  scale: number;
  /** The effects it plays on the events of its clips, by clip key (`meta.data.character.effects`). */
  effects: Record<string, EffectCue[]>;
  /** The manifest, when its sheets have one. */
  manifest: CharacterManifest | null;
}

/** An effect's sheet, read from its atlas. */
export interface EffectSheet<A extends SheetRef = SheetRef> {
  id: string;
  asset: A;
  atlas: Atlas;
  kind: string;
  frames: number;
  fps: number;
  loop: boolean;
  layer: 'ground' | 'air';
  /** World units: where the effect draws its own floor marks (a projectile's pool of light is this far below its origin). It does not place the effect: the origin goes on the socket. */
  height: number;
  /** Radius it reaches, world units. */
  size: number;
  events: AtlasEvent[];
  travel: { speed: number; range: number | undefined } | null;
  /** The effect played where this one ends. */
  follows: string | null;
  /** Exported px per world unit. */
  scale: number;
  /** The effect's origin inside a frame, exported px. */
  pivot: { x: number; y: number };
  /** How many rows (facings) the sheet has. */
  rows: number;
  /** The frames of one row. */
  rects: (row: number) => Rect[];
}

/** An interface piece (`role: 'ui'`): its kind and what a game needs to stretch, fill or set it (geometry in `ui.ts`). */
export interface UiSheet<A extends SheetRef = SheetRef> {
  asset: A;
  atlas: Atlas;
  kind: string;
  /** Exported px per logical px. */
  scale: number;
  states: string[];
  nineSlice: Insets | null;
  fillBox: UiBox | null;
  grows: 'right' | 'left' | 'up' | 'down';
  layers: string[];
  cap: { width: number } | null;
  content: Insets | null;
  font: FontMeta | null;
  /** A portrait frame's window (logical px): where a game puts the portrait. */
  window: UiBox | null;
  /** A cursor's hotspot (logical px from the cell's top-left): the point that clicks. */
  hotspot: Vec2 | null;
}

/** An item's icon (`role: 'icon'`). */
export interface IconSheet<A extends SheetRef = SheetRef> {
  asset: A;
  atlas: Atlas;
  item: ItemMeta;
}

/** Everything a set of sheets holds, put together by `buildLibrary`. */
export interface Library<A extends SheetRef = SheetRef> {
  /** In folder order. Older atlases can make two characters of one folder and skeleton (split by pivot): they share an id. */
  characters: Character<A>[];
  /** By effect id: the sheets characters cue on their events. */
  effects: Map<string, EffectSheet<A>>;
  ui: Map<SheetPath, UiSheet<A>>;
  /** By item id. */
  icons: Map<string, IconSheet<A>>;
  /** Everything else that plays as it is: props, scenery, pictures, images without an atlas. */
  sprites: Clip<A>[];
}

const ACTION_ORDER = ['attack', 'skill', 'dodge', 'jump', 'interact', 'emote', 'spawn', 'action'];
const orderOf = (kind: string) => {
  const at = ACTION_ORDER.indexOf(kind);
  return at < 0 ? ACTION_ORDER.length : at;
};

/** Old atlases have no clipKind: what the clip does says what it is. */
function categoryOf(atlas: Atlas): ClipCategory {
  const { data } = atlas.meta;
  if (data?.clipKind) return data.clipKind;
  if ((data?.groundSpeed ?? 0) > 0) return 'locomotion';
  return data?.loop ? 'idle' : 'action';
}

/** A playable clip of an animated sheet. */
export function clipOf<A extends SheetRef>(asset: A, atlas: Atlas): Clip<A> {
  const rows = new Map<number, Rect[]>();
  const firstClip = clipNames(atlas)[0];
  const { data, scale = 1 } = atlas.meta;
  const category = categoryOf(atlas);
  const events = data?.events ?? [];
  const cancels = events.filter((e) => e.name === 'cancel').map((e) => e.frame);
  return {
    asset,
    atlas,
    key: data?.key ?? basenameOf(asset.path),
    name: data?.key ?? basenameOf(asset.path),
    kind: data?.action ?? (category === 'idle' ? 'idle' : category === 'locomotion' ? 'walk' : 'action'),
    category,
    tags: data?.tags ?? [],
    fps: atlas.meta.fps || 8,
    frameCount: atlas.meta.frameCount ?? 1,
    loop: data?.loop ?? true,
    hold: data?.hold ?? false,
    groundSpeed: data?.groundSpeed ?? 0,
    events,
    cancelFrame: cancels.length > 0 ? Math.min(...cancels) : null,
    travel: data?.travel ?? null,
    scale,
    rects: (row) => {
      let cached = rows.get(row);
      if (!cached) {
        cached = clipFrames(atlas, firstClip, row);
        rows.set(row, cached);
      }
      return cached;
    },
  };
}

/** An image without an atlas: one frame, anchored at the bottom centre. */
export function stillClip<A extends SheetRef>(asset: A, size: { width: number; height: number }): Clip<A> {
  const { width, height } = size;
  const atlas: Atlas = { meta: { mode: 'strip', frameCount: 1, frameWidth: width, frameHeight: height, scale: 1 }, frames: {} };
  const key = basenameOf(asset.path);
  return {
    asset,
    atlas,
    key,
    name: key,
    kind: 'idle',
    category: 'idle',
    tags: [],
    fps: 1,
    frameCount: 1,
    loop: true,
    hold: false,
    groundSpeed: 0,
    events: [],
    cancelFrame: null,
    travel: null,
    scale: 1,
    rects: () => [{ x: 0, y: 0, width, height }],
  };
}

/** Where a kind of effect is drawn when its sheet does not say: area and cast effects on the ground, the rest sorted in among the things standing. */
const GROUND_KINDS = new Set(['area', 'cast']);

/** The effect a sheet describes, or null when it is not an effect sheet. */
export function effectSheetOf<A extends SheetRef>(asset: A, atlas: Atlas): EffectSheet<A> | null {
  const data = atlas.meta.data;
  if (data?.role !== 'vfx') return null;
  const meta: Partial<EffectMeta> = data.effect ?? {};
  const kind = meta.kind ?? 'burst';
  const frames = meta.frames ?? atlas.meta.frameCount ?? 1;
  const cache = new Map<number, Rect[]>();
  const scale = atlas.meta.scale ?? 1;
  const frameWidth = atlas.meta.frameWidth ?? 0;
  const frameHeight = atlas.meta.frameHeight ?? 0;
  return {
    id: meta.id ?? basenameOf(asset.path),
    asset,
    atlas,
    kind,
    frames,
    fps: meta.fps ?? atlas.meta.fps ?? 12,
    loop: meta.loop ?? false,
    layer: meta.layer ?? (GROUND_KINDS.has(kind) ? 'ground' : 'air'),
    height: meta.height ?? 0,
    size: meta.size ?? 0,
    events: meta.events ?? [],
    travel: meta.travel ? { speed: meta.travel.speed, range: meta.travel.range } : null,
    follows: meta.follows ?? null,
    scale,
    pivot: atlas.meta.pivot ? { x: atlas.meta.pivot.x, y: atlas.meta.pivot.y } : { x: frameWidth / 2, y: frameHeight / 2 },
    rows: Math.max(1, atlas.meta.directions?.length ?? 1),
    rects: (row) => {
      let rects = cache.get(row);
      if (!rects) cache.set(row, (rects = clipFrames(atlas, 'default', Math.min(row, Math.max(0, (atlas.meta.directions?.length ?? 1) - 1)))));
      return rects;
    },
  };
}

function uiSheetOf<A extends SheetRef>(asset: A, atlas: Atlas): UiSheet<A> {
  const data = atlas.meta.data ?? {};
  return {
    asset,
    atlas,
    kind: data.kind ?? 'image',
    scale: atlas.meta.scale ?? 1,
    states: data.states ?? [],
    nineSlice: data.nineSlice ?? null,
    fillBox: data.fillBox ?? null,
    grows: data.grows ?? 'right',
    layers: data.layers ?? [],
    cap: data.cap ?? null,
    content: data.content ?? null,
    font: data.font ?? null,
    window: data.window ?? null,
    hotspot: data.hotspot ?? null,
  };
}

const present = <T>(clip: T | undefined): clip is T => clip !== undefined;

/** The bindings: from the manifest's controls when there is one, else from what each clip declares. */
function bindings<A extends SheetRef>(clips: Clip<A>[], manifest: CharacterManifest | undefined) {
  const byKey = new Map(clips.map((c) => [c.key, c]));
  const pick = (keys: string[] = []) => keys.map((k) => byKey.get(k)).filter(present);

  if (manifest) {
    const { controls } = manifest;
    const groups = Object.entries(controls.actions ?? {}).filter(([kind]) => kind !== 'hit' && kind !== 'death');
    groups.sort(([a], [b]) => orderOf(a) - orderOf(b));
    return {
      idle: (controls.idle === undefined ? undefined : byKey.get(controls.idle)) ?? null,
      locomotion: pick(controls.move),
      actions: groups.flatMap(([, keys]) => pick(keys)),
      hit: pick(controls.actions?.hit)[0] ?? null,
      death: pick(controls.actions?.death)[0] ?? null,
    };
  }
  const byCategory = (category: ClipCategory) => clips.filter((c) => c.category === category);
  return {
    idle: byCategory('idle')[0] ?? null,
    locomotion: byCategory('locomotion').sort((a, b) => a.groundSpeed - b.groundSpeed),
    actions: byCategory('action')
      .filter((c) => c.kind !== 'hit' && c.kind !== 'death')
      .sort((a, b) => orderOf(a.kind) - orderOf(b.kind) || a.key.localeCompare(b.key)),
    hit: clips.find((c) => c.kind === 'hit') ?? null,
    death: clips.find((c) => c.kind === 'death') ?? null,
  };
}

function makeCharacter<A extends SheetRef>(folder: string, clips: Clip<A>[]): Character<A> {
  const manifest = clips.map((c) => manifestOf(c.atlas)).find((m) => m !== undefined);
  const own = playableClips(clips, manifest);
  const name = manifest?.name ?? basenameOf(folder);
  return {
    id: `${folder}|${manifest?.name ?? clips[0].atlas.meta.data?.skeleton ?? ''}`,
    name,
    label: manifest?.label ?? name,
    folder,
    clips: own,
    ...bindings(own, manifest),
    warnings: manifest?.warnings ?? [],
    tilt: manifest?.camera?.tilt ?? DEFAULT_TILT,
    boost: manifest?.camera?.heightBoost ?? 1.2,
    scale: manifest?.scale ?? clips[0].scale,
    effects: manifest?.effects ?? {},
    manifest: manifest ?? null,
  };
}

/** Characters group by manifest; older atlases by folder, skeleton and pivot. */
function groupKey(path: SheetPath, atlas: Atlas): string {
  const manifest = manifestOf(atlas);
  if (manifest) return `${dirnameOf(path)}|character:${manifest.name}`;
  const { pivot } = atlas.meta;
  return `${dirnameOf(path)}|${atlas.meta.data?.skeleton}|${pivot?.x},${pivot?.y}`;
}

/** Puts read sheets together: characters from their clips, the effects, interface pieces, icons and sprites. */
export function buildLibrary<A extends SheetRef>(sheets: Iterable<Sheet<A>>): Library<A> {
  const characterClips = new Map<string, Clip<A>[]>();
  const library: Library<A> = { characters: [], effects: new Map(), ui: new Map(), icons: new Map(), sprites: [] };
  for (const { asset, atlas, kind, size } of sheets) {
    if (!atlas) {
      library.sprites.push(stillClip(asset, size));
      continue;
    }
    if (kind === 'effect') {
      const sheet = effectSheetOf(asset, atlas)!;
      library.effects.set(sheet.id, sheet);
    } else if (kind === 'ui') {
      library.ui.set(asset.path, uiSheetOf(asset, atlas));
    } else if (kind === 'icon') {
      const item = atlas.meta.data?.item;
      if (item) library.icons.set(item.id, { asset, atlas, item });
    } else if (kind === 'character') {
      const key = groupKey(asset.path, atlas);
      characterClips.set(key, [...(characterClips.get(key) ?? []), clipOf(asset, atlas)]);
    } else if (kind === 'sprite') {
      library.sprites.push(clipOf(asset, atlas));
    }
  }
  library.characters = [...characterClips.entries()].map(([key, clips]) => makeCharacter(key.split('|')[0], clips)).sort((a, b) => a.folder.localeCompare(b.folder));
  return library;
}
