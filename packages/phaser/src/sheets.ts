/**
 * What the loader does that needs no Phaser, so it runs anywhere (`@diorama/phaser/sheets`, the node tests): which sheets
 * a set of sheets needs by the contract (`closure`), where their files are, and how a sheet's picture becomes textures and
 * named frames (`planTexture`): one texture, or bands of whole cells when the picture is larger than the renderer can hold.
 */

import { dependenciesOf, readSheet, type Atlas, type Rect, type Sheet, type SheetPath } from '@diorama/runtime';

/** Where a sheet's atlas JSON is: `<assets><path>.json`. `assets` is the URL of the assets folder, ending in `/`. */
export const atlasURL = (assets: string, path: SheetPath) => `${assets}${path}.json`;

/** Where a sheet's picture is: the file `meta.image` names next to its JSON (a PNG, or a JPEG export), else `<path>.png`. */
export function imageURL(assets: string, path: SheetPath, atlas: Atlas | null): string {
  const image = atlas?.meta.image;
  if (!image) return `${assets}${path}.png`;
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  return `${assets}${folder}${image}`;
}

/**
 * The sheets wanted and the ones read so far, for a host that fetches them one by one: `want` the first ones, `read` each
 * JSON as it arrives, and fetch the paths it returns. The set is closed once nothing is pending: every sheet with its other
 * clips, the effects its character cues and their `follows`, and a scenery piece's state and clip sheets.
 */
export class Closure {
  /** Read sheets, in the order they were wanted. */
  readonly sheets = new Map<SheetPath, Sheet>();
  /** Wanted and not read yet. */
  readonly pending = new Set<SheetPath>();
  /** Sheets that could not be fetched or read, with why. */
  readonly failed = new Map<SheetPath, string>();

  /** The paths among these that are new: fetch each one and hand its JSON to `read`. */
  want(paths: Iterable<SheetPath>): SheetPath[] {
    const out: SheetPath[] = [];
    for (const path of paths) {
      if (this.sheets.has(path) || this.pending.has(path) || this.failed.has(path)) continue;
      this.pending.add(path);
      out.push(path);
    }
    return out;
  }

  /** Reads a fetched JSON (`readSheet`) and returns the sheets it needs that were not wanted yet. A file that is not an atlas fails. */
  read(path: SheetPath, json: unknown): SheetPath[] {
    this.pending.delete(path);
    let sheet: Sheet;
    try {
      sheet = readSheet(path, json);
    } catch (error) {
      this.failed.set(path, error instanceof Error ? error.message : String(error));
      return [];
    }
    this.sheets.set(path, sheet);
    return this.want(dependenciesOf(sheet));
  }

  /** A sheet that could not be fetched. */
  fail(path: SheetPath, reason: string) {
    this.pending.delete(path);
    this.failed.set(path, reason);
  }
}

/**
 * Every sheet these need, fetched with `fetchJson` (which resolves to the JSON of a path, or rejects when it is not
 * there). Sheets come in the order they were wanted, breadth first; the ones that failed are in `failed`, never thrown.
 */
export async function closure(paths: Iterable<SheetPath>, fetchJson: (path: SheetPath) => Promise<unknown>): Promise<Closure> {
  const set = new Closure();
  let wave = set.want(paths);
  while (wave.length) {
    const fetched = await Promise.all(wave.map((path) => fetchJson(path).then((json) => ({ path, json }), (error: unknown) => ({ path, error }))));
    const next: SheetPath[] = [];
    for (const result of fetched) {
      if ('error' in result) set.fail(result.path, result.error instanceof Error ? result.error.message : String(result.error));
      else next.push(...set.read(result.path, result.json));
    }
    wave = next;
  }
  return set;
}

/** A frame as the loader adds it to its texture: the band it is cut from, its place there, its untrimmed cell and its origin. */
export interface FramePlan {
  name: string;
  /** The band (texture source) it is on. */
  band: number;
  /** Where it is on its band, px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** A packed sheet's trimmed frame: its untrimmed cell's size and where the frame sits in it (exported px). */
  trim: { cellW: number; cellH: number; ox: number; oy: number } | null;
  /** The pivot as a fraction of the untrimmed cell (`meta.pivot` over its size), which Phaser takes as the frame's origin. */
  pivot: { x: number; y: number } | null;
}

/** A sheet's picture as textures: the bands it is cut into (rectangles of the picture, px; one band is the whole picture) and its frames. */
export interface TexturePlan {
  bands: Rect[];
  frames: FramePlan[];
}

/** The cells of an atlas by name: its `frames`, or the grid the runtime reads when it lists none (contract §6). */
export function cellsOf(atlas: Atlas): [string, Rect & Partial<Record<'ox' | 'oy' | 'cellW' | 'cellH', number>>][] {
  const named = Object.entries(atlas.frames);
  if (named.length) return named;
  const { frameWidth = 0, frameHeight = 0, frameCount = 1, directions = [] } = atlas.meta;
  if (!frameWidth || !frameHeight) return [];
  const rows = directions.length > 1 ? directions : [null];
  return rows.flatMap((direction, row) =>
    Array.from({ length: frameCount }, (_, index): [string, Rect] => [gridName(direction, index), { x: index * frameWidth, y: row * frameHeight, width: frameWidth, height: frameHeight }]),
  );
}

/** The name the runtime keys a cell with: `<direction>_<index>` on a sheet of several facings, `frame_<index>` otherwise. */
const gridName = (direction: string | null, index: number) => (direction ? `${direction}_${index}` : `frame_${index}`);

/**
 * Where to cut a length (px) so that no part is longer than `max` and no span (a cell's start and end) is cut through:
 * the cut points from 0 to `length`, as few as the spans allow. Throws when one span is longer than `max` by itself.
 */
export function cutsOf(length: number, max: number, spans: [start: number, end: number][], what = 'the picture'): number[] {
  if (length <= max) return [0, length];
  const crosses = (at: number) => spans.some(([start, end]) => start < at && at < end);
  const candidates = [...new Set([length, ...spans.flatMap(([start, end]) => [start, end])])].filter((at) => at > 0 && at <= length && !crosses(at)).sort((a, b) => a - b);
  const cuts = [0];
  while (cuts.at(-1)! < length) {
    const from = cuts.at(-1)!;
    const next = candidates.filter((at) => at > from && at - from <= max).at(-1);
    if (next === undefined) throw new Error(`${what} cannot be cut into bands of whole cells of at most ${max} px: a cell from ${from} px is larger than that`);
    cuts.push(next);
  }
  return cuts;
}

/** The pivot (exported px of the untrimmed cell) a sheet's frames are drawn on: `meta.pivot`, else the runtime's own default for what plays. */
function pivotOf(sheet: Sheet, cellW: number, cellH: number): { x: number; y: number } | null {
  const pivot = sheet.atlas?.meta.pivot;
  if (pivot) return { x: pivot.x, y: pivot.y };
  // What the runtime assumes without one: an effect's origin is the middle of its frame, a character's or a sprite's feet the middle of the cell's bottom.
  if (sheet.kind === 'effect') return { x: (sheet.atlas?.meta.frameWidth ?? cellW) / 2, y: (sheet.atlas?.meta.frameHeight ?? cellH) / 2 };
  if (sheet.kind === 'character' || sheet.kind === 'sprite') return { x: cellW / 2, y: cellH };
  return null;
}

/**
 * How a sheet's picture (`size`, px) becomes textures no larger than `maxTextureSize` on a side, and the frames on them: every
 * cell by its atlas name, a packed sheet's with its trim, and each with its origin from the pivot. A picture that fits is one
 * band; a larger one is cut into bands of whole cells, across and down, and each frame is placed on the band that holds it.
 */
export function planTexture(sheet: Sheet, size: { width: number; height: number }, maxTextureSize = Infinity): TexturePlan {
  const cells = sheet.atlas ? cellsOf(sheet.atlas) : [];
  const what = `${sheet.asset.path} (${size.width} × ${size.height} px)`;
  const xs = cutsOf(size.width, maxTextureSize, cells.map(([, r]) => [r.x, r.x + r.width]), what);
  const ys = cutsOf(size.height, maxTextureSize, cells.map(([, r]) => [r.y, r.y + r.height]), what);
  // The tile of the cut grid each cell lies in, numbered in reading order (along the top, then the next row down).
  const tiles = cells.map(([name, r]) => {
    const i = xs.findIndex((x, k) => k < xs.length - 1 && r.x >= x && r.x + r.width <= xs[k + 1]);
    const j = ys.findIndex((y, k) => k < ys.length - 1 && r.y >= y && r.y + r.height <= ys[k + 1]);
    if (i < 0 || j < 0) throw new Error(`${what}: the cell ${name} is not inside the picture`);
    return j * xs.length + i;
  });
  // Only the tiles that hold a cell become bands; a sheet without cells is one band, the whole picture.
  const used = tiles.length ? [...new Set(tiles)].sort((a, b) => a - b) : [0];
  const bands = used.map((tile): Rect => {
    const i = tile % xs.length;
    const j = Math.floor(tile / xs.length);
    return { x: xs[i], y: ys[j], width: xs[i + 1] - xs[i], height: ys[j + 1] - ys[j] };
  });
  const frames = cells.map(([name, cell], c): FramePlan => {
    const band = used.indexOf(tiles[c]);
    const trimmed = cell.cellW !== undefined || cell.cellH !== undefined;
    const cellW = cell.cellW ?? cell.width;
    const cellH = cell.cellH ?? cell.height;
    const pivot = pivotOf(sheet, cellW, cellH);
    return {
      name,
      band,
      x: cell.x - bands[band].x,
      y: cell.y - bands[band].y,
      width: cell.width,
      height: cell.height,
      trim: trimmed ? { cellW, cellH, ox: cell.ox ?? 0, oy: cell.oy ?? 0 } : null,
      pivot: pivot ? { x: pivot.x / cellW, y: pivot.y / cellH } : null,
    };
  });
  return { bands, frames };
}

const names = new WeakMap<object, string>();

/**
 * The name of a cell the runtime hands back (`shownFrame(actor).rect`, an effect's `rects(row)[frame]`): the atlas's own
 * key for one of its `frames`, else the grid name of where it is (`<direction>_<index>`, `frame_<index>`), which the loader
 * gives the cells of an atlas that lists none.
 */
export function frameNameOf(atlas: Atlas, rect: Rect): string {
  let name = names.get(rect);
  if (name === undefined) {
    for (const [key, cell] of Object.entries(atlas.frames)) names.set(cell, key);
    name = names.get(rect);
  }
  if (name !== undefined) return name;
  const { frameWidth = 1, frameHeight = 1, directions = [] } = atlas.meta;
  return gridName(directions.length > 1 ? directions[Math.round(rect.y / frameHeight)] : null, Math.round(rect.x / frameWidth));
}
