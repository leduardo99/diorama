/**
 * Diorama - Core Asset Contract
 *
 * Minimal contract for defining visual assets drawn with @core/draw, @core/volume, @core/rig or plain canvas calls.
 */

import { BAYER_4X4 } from './noise.js';

/** Output file format of an exported asset. */
export type AssetFormat = 'png' | 'jpeg';

/** Context passed to an asset's `render` function: its size, scale, format and frame. */
export interface AssetRenderContext {
  /** Logical width of one frame. The exported image is `width × scale` (times `frames` across, for a strip). */
  width: number;
  /** Logical height of one frame. The exported image is `height × scale`. */
  height: number;
  /** Rendering scale multiplier */
  scale: number;
  /** Target export format */
  format: AssetFormat;
  /** Project name (e.g. "my-game") */
  project?: string;
  /** Path of the sheet being rendered, relative to the project's `sheets/` (e.g. `props/crate.ts`) */
  sourcePath?: string;
  /** Whether the render is in preview/mockup mode (true) or official production export (false) */
  preview?: boolean;
  /** Resolve a file path relative to the project's `src/` (an image or data file the drawing reads) to a URL */
  resolveResource?: (relPath: string) => string;
  /**
   * 0-based frame being rendered, from 0 to `frameCount - 1` (0 for a single image). The exporter always supplies it,
   * so `t = frameIndex / frameCount` type checks without a default.
   */
  frameIndex: number;
  /** Number of frames of the asset: its `frames`, 1 for a single image. The exporter always supplies it. */
  frameCount: number;
  /** 0-based direction (row) being rendered when the asset declares `directions` */
  direction?: number;
  /** Number of directions (rows) of the asset; 1 when it declares none */
  directionCount?: number;
  /**
   * Facing of the current direction, in radians, for `Frame3.facing`: row 0 faces the camera
   * (S, π/2) and each next row turns clockwise on screen.
   */
  facing?: number;
  /** Name of the current direction: "S", "SW", "W", ... (8), "S", "W", "N", "E" (4), or "D<index>". */
  directionName?: string;
}

/**
 * Standard contract for objects capable of rendering to Canvas2D (Shapes, Polygons, Paths, Groups).
 */
export interface Drawable {
  draw?: (ctx: CanvasRenderingContext2D, style?: any) => void;
  fill?: (ctx: CanvasRenderingContext2D, fillStyle?: any) => void;
  stroke?: (ctx: CanvasRenderingContext2D, strokeStyle?: any) => void;
}

/** Edge mode of an asset: 'native' keeps smooth edges, 'none' makes them hard, 'dither' uses an ordered Bayer pattern. */
export type AntialiasingMode = 'native' | 'none' | 'dither';

/** Context passed to `render`: the canvas, its drawing context and the render context fields. */
export interface FullRenderContext extends AssetRenderContext {
  /** The root container element */
  root: HTMLElement;
  /** The automatically created and scaled Canvas element */
  canvas: HTMLCanvasElement;
  /** The canvas's drawing context, ready for drawing */
  ctx: CanvasRenderingContext2D;
}

/** Input of `defineAsset`: size, scale, format, frames, edge mode and the `render` function. */
export interface AssetDefinitionInput {
  /**
   * Logical width of one frame (the whole asset when `frames` is 1). Sizes are logical:
   * the exported image is `width × scale` per frame, so `width: 96, scale: 2` exports 192 px.
   */
  width: number;
  /** Logical height of one frame. The exported image is `height × scale`. */
  height: number;
  /**
   * Optional frame count for animation strips or multi-state spritesheets.
   * When > 1, the engine automatically arranges N frames and supplies `context.frameIndex` (0..N-1).
   */
  frames?: number;
  /** Optional playback speed recommendation (frames per second, default: 5) */
  fps?: number;
  /**
   * Optional named animations over the frames of a strip, for example `{ idle: [0, 1, 2, 3] }`.
   * They are written to the atlas JSON as `meta.animations`, so an engine can play them by name.
   * Indices are 0-based and must be lower than `frames`. Output data only: it does not constrain
   * how a game plays the frames.
   */
  animations?: Record<string, number[]>;
  /**
   * Number of facings rendered as rows of the sheet (1, 4 or 8 for named directions). Each row
   * repeats every frame for one direction; `render` receives `direction`, `facing` and
   * `directionName`. The atlas JSON lists the rows in `meta.directions`. Default 1.
   */
  directions?: number;
  /**
   * Anchor point of every cell in logical pixels, usually where the object touches the ground
   * (between the feet, the base of a prop). Written to the atlas JSON as `meta.pivot`.
   */
  pivot?: { x: number; y: number };
  /**
   * Extra data for the game, written to the atlas JSON as `meta.data` (JSON-serializable):
   * for example a character clip's ground speed, duration and events.
   */
  data?: Record<string, unknown>;
  /** Output format: 'png' (default) or 'jpeg' */
  format?: AssetFormat;
  /** JPEG quality (1-100), default 90 */
  quality?: number;
  /** Output multiplier. The exported image is `width × scale` by `height × scale`. Default 1. */
  scale?: number;
  /** Background color: default 'transparent' for PNG, '#ffffff' for JPEG */
  background?: string;
  /** Optional custom output name (defaults to file basename) */
  name?: string;
  /** Optional custom asset identifier */
  id?: string;
  /**
   * Edge mode applied to the final canvas pixels after `render` runs:
   * - 'native': keep the browser's smooth antialiased alpha (default)
   * - 'none': hard alpha cutoff, every pixel becomes fully opaque or fully transparent
   * - 'dither': Bayer 4x4 ordered dithering of alpha into fully opaque or fully transparent pixels
   */
  antialiasing?: AntialiasingMode;
  /** Alpha cutoff threshold (0-255, default 128) used by 'none' */
  alphaThreshold?: number;
  /**
   * Main render function called by the engine.
   * Receives a fully prepared context including `ctx` and `canvas`.
   */
  render: (context: FullRenderContext) => Promise<void> | void;
}

/** The normalized asset definition returned by `defineAsset`. */
export interface AssetDefinition extends Omit<AssetDefinitionInput, 'render'> {
  format: AssetFormat;
  scale: number;
  background: string;
  quality: number;
  antialiasing?: AntialiasingMode;
  alphaThreshold?: number;
  render: (root: HTMLElement, context: AssetRenderContext) => Promise<void> | void;
}

/**
 * Declares an asset for rendering and export.
 * Applies convenient defaults for format, transparency, and scaling.
 */
export function defineAsset(definition: AssetDefinitionInput): AssetDefinition {
  const format: AssetFormat = definition.format ?? 'png';
  const background = definition.background ?? (format === 'jpeg' ? '#ffffff' : 'transparent');
  const scale = definition.scale ?? 1;
  const quality = definition.quality ?? 90;

  return {
    ...definition,
    format,
    background,
    scale,
    quality,
    render: async (root: HTMLElement, context: AssetRenderContext) => {
      const edgeMode = definition.antialiasing;
      const isCrisp = edgeMode === 'none' || edgeMode === 'dither';
      const { canvas, ctx } = createCanvas(root, context, { crisp: isCrisp });
      await definition.render({ ...context, root, canvas, ctx });
      if (edgeMode === 'none' || edgeMode === 'dither') {
        applyEdgeMode(ctx, canvas, edgeMode, definition.alphaThreshold ?? 128);
      }
    }
  };
}

/**
 * Forces every pixel of the canvas to full or zero alpha.
 * `createCanvas({ crisp })` only disables image smoothing, which does not affect vector fills,
 * so hard edges are produced here by thresholding the rendered alpha channel.
 */
function applyEdgeMode(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  mode: 'none' | 'dither',
  threshold: number
): void {
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;

  for (let y = 0; y < height; y++) {
    const bayerRow = BAYER_4X4[y % 4];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha === 0) continue;
      const opaque = mode === 'dither' ? alpha / 255 >= bayerRow[x % 4] : alpha >= threshold;
      data[idx + 3] = opaque ? 255 : 0;
    }
  }

  ctx.putImageData(image, 0, 0);
}

/** Options for `createCanvas`: crisp edges, alpha and scale. */
export interface CanvasOptions {
  crisp?: boolean;
  alpha?: boolean;
  scale?: number;
  antialiasing?: AntialiasingMode;
  alphaThreshold?: number;
}

/**
 * Convenient DOM helper: creates and configures an HTML5 Canvas inside root.
 * Accepts either explicit dimensions (width, height, options?)
 * or an AssetRenderContext object (context, options?).
 * 
 * Automatically applies backing store scaling (canvas.width = width * scale)
 * and adjusts ctx.scale(scale, scale) so vector paths rasterize at true physical density.
 */
export function createCanvas(
  root: HTMLElement,
  context: AssetRenderContext,
  options?: CanvasOptions
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
export function createCanvas(
  root: HTMLElement,
  width: number,
  height: number,
  options?: CanvasOptions
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
export function createCanvas(
  root: HTMLElement,
  widthOrContext: number | AssetRenderContext,
  heightOrOptions?: number | CanvasOptions,
  options?: CanvasOptions
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  let width: number;
  let height: number;
  let opts: CanvasOptions | undefined;
  let scale = 1;

  if (typeof widthOrContext === 'object' && widthOrContext !== null) {
    width = widthOrContext.width;
    height = widthOrContext.height;
    scale = widthOrContext.scale ?? 1;
    opts = heightOrOptions as CanvasOptions | undefined;
  } else {
    width = widthOrContext as number;
    height = heightOrOptions as number;
    opts = options;
    scale = opts?.scale ?? 1;
  }

  if (opts?.scale !== undefined) {
    scale = opts.scale;
  }

  const physicalWidth = Math.max(1, Math.round(width * scale));
  const physicalHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = physicalWidth;
  canvas.height = physicalHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.display = 'block';

  if (opts?.crisp) {
    canvas.style.imageRendering = 'pixelated';
  }

  root.appendChild(canvas);

  const ctx = canvas.getContext('2d', {
    alpha: opts?.alpha ?? true,
    willReadFrequently: true,
  });

  if (!ctx) {
    throw new Error('Failed to acquire a canvas drawing context');
  }

  if (opts?.crisp) {
    ctx.imageSmoothingEnabled = false;
  }

  if (scale !== 1) {
    ctx.scale(scale, scale);
  }

  return { canvas, ctx };
}

