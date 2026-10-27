/**
 * The trimmed export (`npm run export -- … --trim`): each frame of a sheet is cut to its drawn pixels and the pieces are
 * packed into pages no larger than `maxPage` on a side. The atlas keeps, for each frame, where its piece sat in its
 * untrimmed cell (`ox`, `oy`) and the cell's size (`cellW`, `cellH`), and which page holds it, so a reader puts every
 * frame at the screen position it had. `@diorama/runtime` and `@diorama/phaser` read both layouts
 * (docs/guides/rig/04-atlas-contract.md).
 *
 * Pure and deterministic: the same sheet always packs the same way.
 */

import type { Decoded } from './png';

/** A cell of the untrimmed sheet, in exported px. */
export interface Cell {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a trimmed frame went: its piece on its page, and where the piece sat in its cell. */
export interface TrimmedFrame {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  ox: number;
  oy: number;
  cellW: number;
  cellH: number;
}

export interface TrimmedPage {
  width: number;
  height: number;
  /** RGBA. */
  pixels: Buffer;
}

export interface TrimResult {
  pages: TrimmedPage[];
  frames: Record<string, TrimmedFrame>;
}

/** The largest side of a page by default: the texture size every WebGL device and phone loads. */
export const DEFAULT_MAX_PAGE = 4096;

/** Transparent px between pieces, so a game that filters the texture when it scales never pulls in a neighbour. */
export const PIECE_GAP = 2;

/** The smallest rectangle of a cell holding every pixel that is not fully transparent, or null for an empty cell. */
export function drawnBounds(image: Decoded, cell: Cell): { x: number; y: number; width: number; height: number } | null {
  if (image.channels !== 4) return { x: 0, y: 0, width: cell.width, height: cell.height };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < cell.height; y++) {
    const row = ((cell.y + y) * image.width + cell.x) * 4;
    for (let x = 0; x < cell.width; x++) {
      if (image.pixels[row + x * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Cuts each cell to its drawn pixels and packs the pieces in shelves, tallest first, into pages of at most `maxPage`
 * px on a side. An empty cell becomes a 1 × 1 transparent piece, so every frame keeps an entry. Throws when a piece
 * is larger than a page.
 */
export function trimSheet(image: Decoded, cells: Cell[], maxPage = DEFAULT_MAX_PAGE): TrimResult {
  const pieces = cells.map((cell) => {
    const drawn = drawnBounds(image, cell);
    const bounds = drawn ?? { x: 0, y: 0, width: 1, height: 1 };
    if (bounds.width > maxPage || bounds.height > maxPage) {
      throw new Error(`frame ${cell.name} is ${bounds.width} × ${bounds.height} px once trimmed, larger than a page of ${maxPage} px: raise --max-page`);
    }
    return { cell, bounds };
  });

  // Tallest first (then widest, then by name), so shelves waste little height; the order never depends on anything else.
  const order = [...pieces].sort((a, b) => b.bounds.height - a.bounds.height || b.bounds.width - a.bounds.width || a.cell.name.localeCompare(b.cell.name));

  // A page about as wide as it is tall: the square root of the pieces' area, never narrower than the widest piece.
  const area = pieces.reduce((sum, p) => sum + (p.bounds.width + PIECE_GAP) * (p.bounds.height + PIECE_GAP), 0);
  const widest = Math.max(...pieces.map((p) => p.bounds.width));
  const pageWidth = Math.min(maxPage, Math.max(widest, Math.ceil(Math.sqrt(area))));

  const placed: Array<{ piece: (typeof pieces)[number]; page: number; x: number; y: number }> = [];
  const pageHeights: number[] = [0];
  let page = 0;
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const piece of order) {
    const { width, height } = piece.bounds;
    if (x > 0 && x + width > pageWidth) {
      x = 0;
      y += shelf + PIECE_GAP;
      shelf = 0;
    }
    if (y + height > maxPage) {
      page += 1;
      pageHeights.push(0);
      x = 0;
      y = 0;
      shelf = 0;
    }
    placed.push({ piece, page, x, y });
    pageHeights[page] = Math.max(pageHeights[page], y + height);
    shelf = Math.max(shelf, height);
    x += width + PIECE_GAP;
  }

  const pageWidths = pageHeights.map((_, index) => Math.max(1, ...placed.filter((p) => p.page === index).map((p) => p.x + p.piece.bounds.width)));
  const pages: TrimmedPage[] = pageHeights.map((height, index) => ({ width: pageWidths[index], height: Math.max(1, height), pixels: Buffer.alloc(pageWidths[index] * Math.max(1, height) * 4) }));
  const frames: Record<string, TrimmedFrame> = {};
  for (const { piece, page: index, x: px, y: py } of placed) {
    const { cell, bounds } = piece;
    const target = pages[index];
    // An empty cell's 1 × 1 piece copies its corner, which is transparent.
    for (let row = 0; row < bounds.height; row++) {
      const from = ((cell.y + bounds.y + row) * image.width + cell.x + bounds.x) * 4;
      image.pixels.copy(target.pixels, ((py + row) * target.width + px) * 4, from, from + bounds.width * 4);
    }
    frames[cell.name] = { page: index, x: px, y: py, width: bounds.width, height: bounds.height, ox: bounds.x, oy: bounds.y, cellW: cell.width, cellH: cell.height };
  }
  return { pages, frames };
}

/** The file of a page: the first keeps the sheet's own name, the next ones add their index (`idle.png`, `idle.1.png`). */
export const pageFile = (base: string, page: number, ext: string): string => (page === 0 ? `${base}.${ext}` : `${base}.${page}.${ext}`);

/** Whether a file of assets/ is an extra page of a trimmed sheet (`idle.1.png` next to `idle.json`), not an asset of its own. */
export const isExtraPage = (rel: string, exists: (rel: string) => boolean): boolean => {
  const match = /^(.*)\.(\d+)\.(png|jpg|webp)$/.exec(rel);
  return match !== null && exists(`${match[1]}.json`);
};
