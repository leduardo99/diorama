/**
 * Sheets for the Phaser smoke test, written here as the exporter would (PNG and atlas JSON, contract fields only): the
 * sample's own exports are not versioned. Every pixel is a function of where it is (`cellPixel`), so the test knows what
 * each frame must draw without reading the PNG back.
 *
 * - `characters/dummy/`: idle (a packed sheet: trimmed frames, rows of unequal height), walk, run, slash (`hit` cues the
 *   spark at its `tip` socket) and cast (`release` cues the bolt, which flies), four facings, 24 × 32 cells pivoted at
 *   (12, 28), exported at scale 2;
 * - `vfx/spark` (an impact with a `hit`), `vfx/bolt` (a projectile that `follows` the burst) and `vfx/burst`;
 * - `ui/panel`: a nine-slice whose borders keep one colour along their length, so any stretch draws known pixels.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { Atlas, AtlasFrame, CharacterManifest, EffectCue } from '@diorama/runtime';

export const DIRS = ['S', 'W', 'N', 'E'];
export const FACINGS = [Math.PI / 2, Math.PI, 1.5 * Math.PI, 2 * Math.PI];
export const CELL = { width: 24, height: 32 };
export const PIVOT = { x: 12, y: 28 };
export const SCALE = 2;

type Rgba = [number, number, number, number];

// ---------------------------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------------------------

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Buffer) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An 8-bit RGBA PNG of `width` × `height` whose pixels come from `at`. */
export function encodePng(width: number, height: number, at: (x: number, y: number) => Rgba): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) raw.set(at(x, y), y * (width * 4 + 1) + 1 + x * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------------------------
// The character
// ---------------------------------------------------------------------------------------------

interface ClipDef {
  key: string;
  kind: string;
  category: 'idle' | 'locomotion' | 'action';
  frames: number;
  fps: number;
  groundSpeed?: number;
  events?: { frame: number; name: string }[];
  /** A socket at the same place on every frame (logical px of the cell). */
  socket?: { name: string; x: number; y: number };
}

export const CLIPS: ClipDef[] = [
  { key: 'idle', kind: 'idle', category: 'idle', frames: 2, fps: 4 },
  { key: 'walk', kind: 'walk', category: 'locomotion', frames: 4, fps: 8, groundSpeed: 30, events: [{ frame: 0, name: 'step:legL' }, { frame: 2, name: 'step:legR' }] },
  { key: 'run', kind: 'run', category: 'locomotion', frames: 4, fps: 12, groundSpeed: 60, events: [{ frame: 0, name: 'step:legL' }, { frame: 2, name: 'step:legR' }] },
  { key: 'slash', kind: 'attack', category: 'action', frames: 4, fps: 10, events: [{ frame: 2, name: 'hit' }, { frame: 3, name: 'cancel' }], socket: { name: 'tip', x: 10, y: 6 } },
  { key: 'cast', kind: 'skill', category: 'action', frames: 4, fps: 10, events: [{ frame: 2, name: 'release' }, { frame: 2, name: 'spawn:hand' }, { frame: 3, name: 'cancel' }], socket: { name: 'hand', x: 8, y: 7 } },
];

const EFFECTS: Record<string, EffectCue[]> = {
  slash: [{ on: 'hit', effect: 'spark', at: 'tip' }],
  cast: [{ on: 'release', effect: 'bolt', motion: 'fly' }],
};

/**
 * A pixel of a cell (exported px): a body (an ellipse) whose colour says which clip, facing, frame and place it is, a rim
 * of half-transparent pixels round it, and nothing outside. The body moves a little from frame to frame, so a packed
 * sheet's trims differ. A canvas keeps its colours multiplied by their alpha, so a half-transparent pixel reads back
 * exactly only in the channels that survive that (0 and 255 always do): the rim's colours are made of those.
 */
export function cellPixel(clip: number, row: number, frame: number, x: number, y: number): Rgba {
  const cx = 11.5 + ((frame + row) % 3) - 1;
  const cy = 17 + (frame % 2);
  const d = ((x - cx) / (8 + (clip % 2))) ** 2 + ((y - cy) / 12) ** 2;
  if (d > 1.15) return [0, 0, 0, 0];
  if (d > 1) return [255, clip % 2 ? 255 : 0, clip % 3 ? 0 : 255, 128];
  return [(clip * 40 + x * 7) % 256, (row * 60 + y * 5) % 256, (frame * 70 + x + y) % 256, 255];
}

const manifest: CharacterManifest = {
  name: 'dummy',
  skeleton: 'humanoid',
  cell: { width: CELL.width / SCALE, height: CELL.height / SCALE },
  pivot: { x: PIVOT.x / SCALE, y: PIVOT.y / SCALE },
  scale: SCALE,
  directions: DIRS,
  camera: { tilt: 48, heightBoost: 1.2 },
  sockets: ['center', 'tip', 'hand'],
  clips: CLIPS.map((c) => ({ key: c.key, kind: c.kind, category: c.category, tags: [], loop: c.category !== 'action', hold: false, seconds: c.frames / c.fps, frames: c.frames, fps: c.fps, groundSpeed: c.groundSpeed ?? 0, events: c.events ?? [] })),
  controls: { idle: 'idle', move: ['walk', 'run'], actions: { attack: ['slash'], skill: ['cast'] } },
  effects: EFFECTS,
};

/** Where a cell's body is, inside the cell: what a packed sheet keeps of it. */
function trimOf(clip: number, row: number, frame: number) {
  let [x0, y0, x1, y1] = [CELL.width, CELL.height, 0, 0];
  for (let y = 0; y < CELL.height; y++) {
    for (let x = 0; x < CELL.width; x++) {
      if (cellPixel(clip, row, frame, x, y)[3] === 0) continue;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x + 1), Math.max(y1, y + 1)];
    }
  }
  return { ox: x0, oy: y0, width: x1 - x0, height: y1 - y0 };
}

/** A clip's sheet: its cells on the grid (four facings down, frames across), or packed (trimmed, row after row). */
function clipSheet(index: number, packed: boolean): { atlas: Atlas; png: Buffer } {
  const clip = CLIPS[index];
  const frames: Record<string, AtlasFrame> = {};
  const owner = new Map<string, { row: number; frame: number; ox: number; oy: number; x: number; y: number }>();
  let width = clip.frames * CELL.width;
  let height = DIRS.length * CELL.height;
  if (packed) {
    let y = 0;
    width = 0;
    DIRS.forEach((dir, row) => {
      let x = 0;
      let tallest = 0;
      for (let frame = 0; frame < clip.frames; frame++) {
        const trim = trimOf(index, row, frame);
        frames[`${dir}_${frame}`] = { x, y, width: trim.width, height: trim.height, ox: trim.ox, oy: trim.oy, cellW: CELL.width, cellH: CELL.height };
        owner.set(`${dir}_${frame}`, { row, frame, ox: trim.ox, oy: trim.oy, x, y });
        x += trim.width;
        tallest = Math.max(tallest, trim.height);
      }
      width = Math.max(width, x);
      y += tallest;
    });
    height = y;
  } else {
    DIRS.forEach((dir, row) => {
      for (let frame = 0; frame < clip.frames; frame++) frames[`${dir}_${frame}`] = { x: frame * CELL.width, y: row * CELL.height, width: CELL.width, height: CELL.height };
    });
  }
  const sockets = clip.socket
    ? { names: [clip.socket.name], frames: Object.fromEntries(Object.keys(frames).map((name) => [name, [[clip.socket!.x, clip.socket!.y, 1] as [number, number, number]]])) }
    : undefined;
  const atlas: Atlas = {
    meta: {
      project: 'smoke', mode: 'directions', frameCount: clip.frames, directions: DIRS, directionFacings: FACINGS, pivot: { x: PIVOT.x, y: PIVOT.y },
      frameWidth: CELL.width, frameHeight: CELL.height, fps: clip.fps, width, height, scale: SCALE, image: `${clip.key}.png`,
      data: { role: 'character', contract: 1, skeleton: 'humanoid', key: clip.key, action: clip.kind, clipKind: clip.category, loop: clip.category !== 'action', hold: false, groundSpeed: clip.groundSpeed ?? 0, events: clip.events ?? [], sockets, character: manifest },
    },
    frames,
  };
  const png = encodePng(width, height, (x, y) => {
    if (!packed) return cellPixel(index, Math.floor(y / CELL.height), Math.floor(x / CELL.width), x % CELL.width, y % CELL.height);
    for (const [name, rect] of Object.entries(frames)) {
      if (x < rect.x || y < rect.y || x >= rect.x + rect.width || y >= rect.y + rect.height) continue;
      const at = owner.get(name)!;
      return cellPixel(index, at.row, at.frame, x - rect.x + at.ox, y - rect.y + at.oy);
    }
    return [0, 0, 0, 0];
  });
  return { atlas, png };
}

/** The pixels a character's frame must draw: its whole untrimmed cell, row by row, RGBA. */
export function expectedCell(clipKey: string, row: number, frame: number): number[] {
  const clip = CLIPS.findIndex((c) => c.key === clipKey);
  const out: number[] = [];
  for (let y = 0; y < CELL.height; y++) for (let x = 0; x < CELL.width; x++) out.push(...cellPixel(clip, row, frame, x, y));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Effects and the panel
// ---------------------------------------------------------------------------------------------

/** An effect's pixel: a disc whose colour says which effect, row and frame. */
const fxPixel = (seed: number, row: number, frame: number, x: number, y: number, size: number): Rgba =>
  (x - size / 2 + 0.5) ** 2 + (y - size / 2 + 0.5) ** 2 <= (size / 2 - 1) ** 2 ? [(seed * 90 + frame * 30) % 256, (row * 50 + x * 9) % 256, (y * 9) % 256, 255] : [0, 0, 0, 0];

/** Each effect's colour seed and frame size (px): what `expectedFx` draws. */
export const FX = { spark: { seed: 1, size: 16 }, bolt: { seed: 2, size: 12 }, burst: { seed: 3, size: 20 } } as const;

/** The pixels an effect's frame must draw (its whole cell, row by row, RGBA), and its size. */
export function expectedFx(id: keyof typeof FX, row: number, frame: number): number[] {
  const { seed, size } = FX[id];
  const out: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out.push(...fxPixel(seed, row, frame, x, y, size));
  return out;
}

function effectSheet(seed: number, effect: Record<string, unknown>, size: number, rows: number): { atlas: Atlas; png: Buffer } {
  const frameCount = Number(effect.frames);
  const directions = rows > 1 ? DIRS : [];
  const frames: Record<string, AtlasFrame> = {};
  for (let row = 0; row < rows; row++) for (let f = 0; f < frameCount; f++) frames[rows > 1 ? `${DIRS[row]}_${f}` : `frame_${f}`] = { x: f * size, y: row * size, width: size, height: size };
  const atlas: Atlas = {
    meta: {
      project: 'smoke', mode: rows > 1 ? 'directions' : 'strip', frameCount, ...(rows > 1 ? { directions, directionFacings: FACINGS } : {}), pivot: { x: size / 2, y: size / 2 },
      frameWidth: size, frameHeight: size, fps: Number(effect.fps), width: frameCount * size, height: rows * size, scale: SCALE, image: `${effect.id}.png`,
      data: { role: 'vfx', contract: 1, effect: { layer: 'air', height: 0, size: 10, directions: rows, ...effect } as never },
    },
    frames,
  };
  return { atlas, png: encodePng(frameCount * size, rows * size, (x, y) => fxPixel(seed, Math.floor(y / size), Math.floor(x / size), x % size, y % size, size)) };
}

/** The panel: 12 × 12 px, 3 px borders. Corners differ pixel by pixel; an edge keeps one colour along its length; the middle is one colour. */
export const PANEL = { size: 12, inset: 3 };
export function panelPixel(x: number, y: number): Rgba {
  const { size, inset } = PANEL;
  const side = (v: number) => (v < inset ? 0 : v >= size - inset ? 2 : 1);
  const [sx, sy] = [side(x), side(y)];
  if (sx !== 1 && sy !== 1) return [40 + x * 10, 40 + y * 10, 200, 255];
  if (sx === 1 && sy === 1) return [30, 60, 90, 255];
  // An edge: its colour changes across it, never along it.
  return sx === 1 ? [200, 100 + y * 9, 50, 255] : [100 + x * 9, 200, 50, 255];
}
const panel: Atlas = {
  meta: { project: 'smoke', mode: 'strip', frameCount: 1, frameWidth: PANEL.size, frameHeight: PANEL.size, width: PANEL.size, height: PANEL.size, scale: 1, image: 'panel.png', data: { role: 'ui', contract: 1, kind: 'panel', nineSlice: { left: PANEL.inset, top: PANEL.inset, right: PANEL.inset, bottom: PANEL.inset }, states: ['normal'] } },
  frames: { frame_0: { x: 0, y: 0, width: PANEL.size, height: PANEL.size } },
};

/** Writes every fixture sheet under `dir` (an assets folder): `<path>.json` and its PNG. */
export function writeFixtures(dir: string) {
  const write = (path: string, { atlas, png }: { atlas: Atlas; png: Buffer }) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, `${path}.json`), JSON.stringify(atlas));
    writeFileSync(join(dir, dirname(path), atlas.meta.image!), png);
  };
  CLIPS.forEach((clip, index) => write(`characters/dummy/${clip.key}`, clipSheet(index, clip.key === 'idle')));
  write('vfx/spark', effectSheet(FX.spark.seed, { id: 'spark', kind: 'impact', frames: 3, fps: 12, loop: false, events: [{ frame: 1, name: 'hit' }] }, FX.spark.size, 1));
  write('vfx/bolt', effectSheet(FX.bolt.seed, { id: 'bolt', kind: 'projectile', frames: 2, fps: 12, loop: true, travel: { speed: 120, range: 60 }, follows: 'burst', followsSheet: 'vfx/burst', events: [] }, FX.bolt.size, 4));
  write('vfx/burst', effectSheet(FX.burst.seed, { id: 'burst', kind: 'impact', frames: 3, fps: 12, loop: false, events: [{ frame: 1, name: 'hit' }] }, FX.burst.size, 1));
  write('ui/panel', { atlas: panel, png: encodePng(PANEL.size, PANEL.size, panelPixel) });
}
