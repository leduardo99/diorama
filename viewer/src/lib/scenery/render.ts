import { drawScene, type SceneData, type SceneRenderer, type SceneryCatalog } from '@core/volume';
import { currentTranslator } from '../../i18n/store';
import type { Cell, Edge } from './edit';

/** Pixels the canvas may have along a side and in all: past them a browser draws nothing. */
const MAX_SIDE = 8192;
const MAX_AREA = 32_000_000;

/** Where a scene sits in its drawing: the cell grid, and the room around it that tall pieces need. */
export interface Geometry {
  /** Logical size of the drawing. */
  width: number;
  height: number;
  /** Screen position of the centre of cell (0, 0). */
  origin: { x: number; y: number };
  /** Logical pixels of a cell on screen. */
  cell: { w: number; h: number };
}

/** The same margins `defineSceneAsset` uses, so the editor shows what the exported reference image shows. */
export function geometryOf(scene: Pick<SceneData, 'cols' | 'rows'>, catalog: SceneryCatalog): Geometry {
  const { w, h } = catalog.grid.screen;
  const margin = w * 2;
  return {
    width: Math.ceil(scene.cols * w + margin * 2),
    height: Math.ceil(scene.rows * h + margin * 2.5),
    origin: { x: margin + w / 2, y: margin * 1.75 + h / 2 },
    cell: { w, h },
  };
}

/** The cell under a point of the drawing (logical px); it may lie outside the scene. */
export function cellFromPoint(geo: Geometry, x: number, y: number): Cell {
  return { col: Math.floor((x - (geo.origin.x - geo.cell.w / 2)) / geo.cell.w), row: Math.floor((y - (geo.origin.y - geo.cell.h / 2)) / geo.cell.h) };
}

/**
 * The vertex nearest to a point of the drawing (logical px), as the cell whose top-left corner it is, and how far the
 * point is from it in cells. Walls on borders are painted on vertices: near one, and not in the cell between four.
 */
export function vertexFromPoint(geo: Geometry, x: number, y: number): { vertex: Cell; distance: number } {
  const fx = (x - (geo.origin.x - geo.cell.w / 2)) / geo.cell.w;
  const fy = (y - (geo.origin.y - geo.cell.h / 2)) / geo.cell.h;
  const col = Math.round(fx);
  const row = Math.round(fy);
  return { vertex: { col, row }, distance: Math.hypot(fx - col, fy - row) };
}

/**
 * The cell edge nearest to a point of the drawing (logical px), and how far the point is from it in cells: a door stands
 * on the edge under the pointer, on a horizontal one ('N' of the cell below it) or a vertical one ('W' of the cell to its right).
 */
export function edgeFromPoint(geo: Geometry, x: number, y: number): { edge: Edge; distance: number } {
  const fx = (x - (geo.origin.x - geo.cell.w / 2)) / geo.cell.w;
  const fy = (y - (geo.origin.y - geo.cell.h / 2)) / geo.cell.h;
  const horizontal = { edge: { col: Math.floor(fx), row: Math.round(fy), edge: 'N' as const }, distance: Math.abs(fy - Math.round(fy)) };
  const vertical = { edge: { col: Math.round(fx), row: Math.floor(fy), edge: 'W' as const }, distance: Math.abs(fx - Math.round(fx)) };
  return horizontal.distance <= vertical.distance ? horizontal : vertical;
}

/** The two ends of an edge on the drawing (logical px). */
export function edgeLine(geo: Geometry, e: Edge): { x1: number; y1: number; x2: number; y2: number } {
  const x = geo.origin.x - geo.cell.w / 2 + e.col * geo.cell.w;
  const y = geo.origin.y - geo.cell.h / 2 + e.row * geo.cell.h;
  return e.edge === 'N' ? { x1: x, y1: y, x2: x + geo.cell.w, y2: y } : { x1: x, y1: y, x2: x, y2: y + geo.cell.h };
}

/** The box a block of cells covers, in logical px. */
export function cellBox(geo: Geometry, at: Cell, across = 1, deep = 1) {
  return { x: geo.origin.x - geo.cell.w / 2 + at.col * geo.cell.w, y: geo.origin.y - geo.cell.h / 2 + at.row * geo.cell.h, width: across * geo.cell.w, height: deep * geo.cell.h };
}

/** The scale the sheets are exported at: what a game gets, and the most the painter draws at. */
export const EXPORT_SCALE = 2;

/**
 * The scale to draw the scene at, given how many device pixels a logical pixel gets on screen (`zoom × devicePixelRatio`).
 * The art is made for the export scale, so there is nothing to gain from drawing it larger: a bigger canvas only costs
 * more to draw and to keep (frames are cached at this scale, and a canvas at 4× is 16 times the area of one at 1×). Up
 * to the export scale it is drawn at exactly that; beyond it, at a whole divisor when there is one, so the page can
 * show it larger with hard edges (`image-rendering: pixelated`) and every drawn pixel is a whole block of screen pixels.
 */
export function renderScale(deviceScale: number): number {
  if (deviceScale <= EXPORT_SCALE) return deviceScale;
  // An odd whole ratio (3×, 5×) has no whole divisor above 1; any other is drawn at the export scale.
  return Number.isInteger(deviceScale) && deviceScale % EXPORT_SCALE !== 0 ? 1 : EXPORT_SCALE;
}

/** The pixel scale to draw at: what was asked for, lowered when the canvas would be too big. */
export function fitScale(geo: Geometry, wanted: number): number {
  return Math.min(wanted, MAX_SIDE / geo.width, MAX_SIDE / geo.height, Math.sqrt(MAX_AREA / (geo.width * geo.height)));
}

/**
 * The painter's zooms, a quarter to four times: − / + and Ctrl+wheel step through them, and Fit takes one of them.
 * Few steps on purpose: a new drawing scale empties the renderer's cache, so a Fit that followed every pixel of a resize
 * would draw every frame again each time; between steps a resize draws nothing.
 */
export const ZOOMS = [0.25, 0.5, 0.75, 1, 2, 3, 4] as const;

/** A zoom of the painter, or Fit: the largest step at which the whole drawing fits the canvas box. */
export type Zoom = number | 'fit';

/** CSS px left round a fitted drawing. */
const FIT_MARGIN = 16;

/** The largest zoom step at which the whole drawing (the scene and the room for tall pieces) fits a box of CSS px; the smallest when none does. */
export function fitZoom(geo: Pick<Geometry, 'width' | 'height'>, box: { width: number; height: number }): number {
  return ZOOMS.filter((z) => geo.width * z <= box.width - FIT_MARGIN * 2 && geo.height * z <= box.height - FIT_MARGIN * 2).at(-1) ?? ZOOMS[0];
}

/** The next zoom step in or out from the one on screen (Fit's included); the same at either end. */
export function stepZoom(zoom: number, delta: 1 | -1): number {
  return (delta > 0 ? ZOOMS.find((z) => z > zoom) : ZOOMS.filter((z) => z < zoom).at(-1)) ?? zoom;
}

/** Sizes a canvas to the drawing at a scale. Only when it differs: assigning a size clears the canvas. */
export function sizeCanvas(canvas: HTMLCanvasElement, geo: Geometry, scale: number) {
  const width = Math.round(geo.width * scale);
  const height = Math.round(geo.height * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

/** Clears the canvas, sets its transform to the scale and runs `draw`. Returns the error it threw, if any: a piece that breaks must not take the page down. */
function drawInto(canvas: HTMLCanvasElement, geo: Geometry, scale: number, draw: (ctx: CanvasRenderingContext2D) => void): string | null {
  sizeCanvas(canvas, geo, scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return currentTranslator().t('errors.noCanvas');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  try {
    draw(ctx);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Draws the whole scene once with the engine, for pictures that are made and kept (thumbnails, the playground backdrop). */
export const renderScene = (canvas: HTMLCanvasElement, geo: Geometry, scene: SceneData, catalog: SceneryCatalog, scale: number) =>
  drawInto(canvas, geo, scale, (ctx) => drawScene(ctx, scene, catalog, geo.origin));

/** Draws the whole scene through a renderer: frames it drew before are copied from its cache, so after an edit only the new ones are painted. */
export const paintScene = (canvas: HTMLCanvasElement, renderer: SceneRenderer, geo: Geometry, scene: SceneData, scale: number) =>
  drawInto(canvas, geo, scale, (ctx) => renderer.draw(ctx, scene, geo.origin));
