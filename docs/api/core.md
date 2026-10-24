# @core - Shared Utilities

> Auto-generated public API reference. Do not edit directly; re-run `npm run docs:api`.

Asset contract (`defineAsset`, `createCanvas`), deterministic random, seeded noise, color helpers, sheet packing, the Bayer dithering matrix and interface assets (`defineNineSlice`, `defineBar`, `defineBitmapFont`, `defineUiImage`).

## Table of Contents

- [Functions & Operations](#functions--operations)
  - [`defineAsset`](#defineasset)
  - [`createCanvas`](#createcanvas)
  - [`createRng`](#createrng)
  - [`createNoise2D`](#createnoise2d)
  - [`BAYER_4X4`](#bayer_4x4)
  - [`packGrid`](#packgrid)
  - [`packCompact`](#packcompact)
  - [`parseColor`](#parsecolor)
  - [`alpha`](#alpha)
  - [`lerpColor`](#lerpcolor)
  - [`defineNineSlice`](#definenineslice)
  - [`defineBar`](#definebar)
  - [`defineBitmapFont`](#definebitmapfont)
  - [`defineUiImage`](#defineuiimage)
- [Types & Interfaces](#types--interfaces)
  - [`AssetFormat`](#assetformat)
  - [`AssetRenderContext`](#assetrendercontext)
  - [`Drawable`](#drawable)
  - [`AntialiasingMode`](#antialiasingmode)
  - [`FullRenderContext`](#fullrendercontext)
  - [`AssetDefinitionInput`](#assetdefinitioninput)
  - [`AssetDefinition`](#assetdefinition)
  - [`CanvasOptions`](#canvasoptions)
  - [`Rng`](#rng)
  - [`NoiseFunction2D`](#noisefunction2d)
  - [`RectItem`](#rectitem)
  - [`PlacedRect`](#placedrect)
  - [`PackResult`](#packresult)
  - [`GridPackOptions`](#gridpackoptions)
  - [`CompactPackOptions`](#compactpackoptions)
  - [`RGBA`](#rgba)
  - [`UiBox`](#uibox)
  - [`Insets`](#insets)
  - [`NineSliceOptions`](#ninesliceoptions)
  - [`BarLayer`](#barlayer)
  - [`BarOptions`](#baroptions)
  - [`BitmapFontOptions`](#bitmapfontoptions)
  - [`UiImageOptions`](#uiimageoptions)

---

## Functions & Operations

### `defineAsset`

Declares an asset for rendering and export.
Applies convenient defaults for format, transparency, and scaling.

```ts
function defineAsset(definition: AssetDefinitionInput): AssetDefinition
```

---

### `createCanvas`

Convenient DOM helper: creates and configures an HTML5 Canvas inside root.
Accepts either explicit dimensions (width, height, options?)
or an AssetRenderContext object (context, options?).

Automatically applies backing store scaling (canvas.width = width * scale)
and adjusts ctx.scale(scale, scale) so vector paths rasterize at true physical density.

```ts
function createCanvas(root: HTMLElement, context: AssetRenderContext, options?: CanvasOptions | undefined): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; }
function createCanvas(root: HTMLElement, width: number, height: number, options?: CanvasOptions | undefined): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; }
```

---

### `createRng`

Creates a deterministic PRNG using Mulberry32 algorithm.
Accepts a number seed or string (e.g. asset name or hash).

```ts
function createRng(seed?: string | number): Rng
```

---

### `createNoise2D`

Creates a simplex noise function of x and y, with an optional seed.
Returns values roughly in range [-1, 1].

```ts
function createNoise2D(seed?: string | number | undefined): NoiseFunction2D
```

---

### `BAYER_4X4`

The 4x4 Bayer threshold matrix, normalized to (0, 1), used for ordered dithering.

```ts
const BAYER_4X4: number[][]
```

---

### `packGrid`

Grid Packing:
1. Takes the max width and max height among all items to define uniform cell size.
2. Determines optimal rows and columns by increasing rows first, then columns.
3. Centers each item inside its cell.
4. Emergent resolution based on item count and spacing.

```ts
function packGrid<T extends RectItem>(items: T[], options?: GridPackOptions): PackResult<T>
```

---

### `packCompact`

Compact Packing (growing rectangle bin packing):
Packs rectangles as tightly as possible without overlap.
Emergent resolution expanding horizontally or vertically to maintain a balanced aspect ratio.

```ts
function packCompact<T extends RectItem>(items: T[], options?: CompactPackOptions): PackResult<T>
```

---

### `parseColor`

Parses hex (#rgb, #rrggbb, #rrggbbaa) or rgb/rgba strings into { r, g, b, a }.

```ts
function parseColor(color: string): RGBA
```

---

### `alpha`

Derives an RGBA color string with the specified opacity (0.0 to 1.0).

```ts
function alpha(color: string, opacity: number): string
```

---

### `lerpColor`

Linearly interpolates between two colors (hex or rgb/rgba).
`t` is clamped between 0 and 1.

```ts
function lerpColor(colorA: string, colorB: string, t: number): string
```

---

### `defineNineSlice`

A nine-slice image (panel, button, slot): drawn once per state, with the insets a game engine
stretches it by (Phaser `NineSlice`, Godot `NinePatchRect`). Draw corners and edges so that the
edges can repeat or stretch and the middle can fill any size: no feature may cross an inset line
except along its edge.

```ts
function defineNineSlice(o: NineSliceOptions): AssetDefinition
```

---

### `defineBar`

A bar as frames a game composes: the back, the fill clipped to the value along `grows` inside
`fillBox`, the cap (if any) moved to where the fill ends, then the frame over them. Frames follow
`layers` in the atlas ('back', 'fill', 'frame', then 'cap'), which also carries the insets and the
fill box, so a game can stretch the bar.

```ts
function defineBar(o: BarOptions): AssetDefinition
```

---

### `defineBitmapFont`

A bitmap font: one glyph per frame, drawn by the project (with `@core/draw` paths, in its style), with each
glyph's advance, the baseline and the line height in the atlas (`font`), so a game sets text with
it without a font file. Advances are measured while drawing, so a narrow '1' takes less room.
Setting text: draw each glyph's cell with its left edge at the pen, then move the pen by the
glyph's advance plus `spacing`. Ink may run past the advance (an outline): `spacing` keeps
neighbours apart.

```ts
function defineBitmapFont(o: BitmapFontOptions): AssetDefinition
```

---

### `defineUiImage`

A plain interface image in states (a cursor with its hotspot, a portrait frame, an ornament).

```ts
function defineUiImage(o: UiImageOptions): AssetDefinition
```

---

## Types & Interfaces

### `AssetFormat`

Output file format of an exported asset.

```ts
type AssetFormat = "png" | "jpeg"
```

### `AssetRenderContext`

Context passed to an asset's `render` function: its size, scale, format and frame.

```ts
interface AssetRenderContext {
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
  /** 0-based frame being rendered, from 0 to `frameCount - 1` (0 for a single image). The exporter always supplies it, so `t = frameIndex / frameCount` type checks without a default. */
  frameIndex: number;
  /** Number of frames of the asset: its `frames`, 1 for a single image. The exporter always supplies it. */
  frameCount: number;
  /** 0-based direction (row) being rendered when the asset declares `directions` */
  direction?: number;
  /** Number of directions (rows) of the asset; 1 when it declares none */
  directionCount?: number;
  /** Facing of the current direction, in radians, for `Frame3.facing`: row 0 faces the camera (S, π/2) and each next row turns clockwise on screen. */
  facing?: number;
  /** Name of the current direction: "S", "SW", "W", ... (8), "S", "W", "N", "E" (4), or "D<index>". */
  directionName?: string;
}
```

### `Drawable`

Standard contract for objects capable of rendering to Canvas2D (Shapes, Polygons, Paths, Groups).

```ts
interface Drawable {
  draw?: (ctx: CanvasRenderingContext2D, style?: any) => void;
  fill?: (ctx: CanvasRenderingContext2D, fillStyle?: any) => void;
  stroke?: (ctx: CanvasRenderingContext2D, strokeStyle?: any) => void;
}
```

### `AntialiasingMode`

Edge mode of an asset: 'native' keeps smooth edges, 'none' makes them hard, 'dither' uses an ordered Bayer pattern.

```ts
type AntialiasingMode = "native" | "none" | "dither"
```

### `FullRenderContext`

Context passed to `render`: the canvas, its drawing context and the render context fields.

```ts
interface FullRenderContext {
  /** The root container element */
  root: HTMLElement;
  /** The automatically created and scaled Canvas element */
  canvas: HTMLCanvasElement;
  /** The canvas's drawing context, ready for drawing */
  ctx: CanvasRenderingContext2D;
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
  /** 0-based frame being rendered, from 0 to `frameCount - 1` (0 for a single image). The exporter always supplies it, so `t = frameIndex / frameCount` type checks without a default. */
  frameIndex: number;
  /** Number of frames of the asset: its `frames`, 1 for a single image. The exporter always supplies it. */
  frameCount: number;
  /** 0-based direction (row) being rendered when the asset declares `directions` */
  direction?: number;
  /** Number of directions (rows) of the asset; 1 when it declares none */
  directionCount?: number;
  /** Facing of the current direction, in radians, for `Frame3.facing`: row 0 faces the camera (S, π/2) and each next row turns clockwise on screen. */
  facing?: number;
  /** Name of the current direction: "S", "SW", "W", ... (8), "S", "W", "N", "E" (4), or "D<index>". */
  directionName?: string;
}
```

### `AssetDefinitionInput`

Input of `defineAsset`: size, scale, format, frames, edge mode and the `render` function.

```ts
interface AssetDefinitionInput {
  /** Logical width of one frame (the whole asset when `frames` is 1). Sizes are logical: the exported image is `width × scale` per frame, so `width: 96, scale: 2` exports 192 px. */
  width: number;
  /** Logical height of one frame. The exported image is `height × scale`. */
  height: number;
  /** Optional frame count for animation strips or multi-state spritesheets. When > 1, the engine automatically arranges N frames and supplies `context.frameIndex` (0..N-1). */
  frames?: number;
  /** Optional playback speed recommendation (frames per second, default: 5) */
  fps?: number;
  /** Optional named animations over the frames of a strip, for example `{ idle: [0, 1, 2, 3] }`. They are written to the atlas JSON as `meta.animations`, so an engine can play them by name. Indices are 0-based and must be lower than `frames`. Output data only: it does not constrain how a game plays the frames. */
  animations?: Record<string, number[]>;
  /** Number of facings rendered as rows of the sheet (1, 4 or 8 for named directions). Each row repeats every frame for one direction; `render` receives `direction`, `facing` and `directionName`. The atlas JSON lists the rows in `meta.directions`. Default 1. */
  directions?: number;
  /** Anchor point of every cell in logical pixels, usually where the object touches the ground (between the feet, the base of a prop). Written to the atlas JSON as `meta.pivot`. */
  pivot?: { x: number; y: number; };
  /** Extra data for the game, written to the atlas JSON as `meta.data` (JSON-serializable): for example a character clip's ground speed, duration and events. */
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
  /** Edge mode applied to the final canvas pixels after `render` runs: - 'native': keep the browser's smooth antialiased alpha (default) - 'none': hard alpha cutoff, every pixel becomes fully opaque or fully transparent - 'dither': Bayer 4x4 ordered dithering of alpha into fully opaque or fully transparent pixels */
  antialiasing?: AntialiasingMode;
  /** Alpha cutoff threshold (0-255, default 128) used by 'none' */
  alphaThreshold?: number;
  /** Main render function called by the engine. Receives a fully prepared context including `ctx` and `canvas`. */
  render: (context: FullRenderContext) => void | Promise<void>;
}
```

### `AssetDefinition`

The normalized asset definition returned by `defineAsset`.

```ts
interface AssetDefinition {
  /** Output format: 'png' (default) or 'jpeg' */
  format: AssetFormat;
  /** Output multiplier. The exported image is `width × scale` by `height × scale`. Default 1. */
  scale: number;
  /** Background color: default 'transparent' for PNG, '#ffffff' for JPEG */
  background: string;
  /** JPEG quality (1-100), default 90 */
  quality: number;
  /** Edge mode applied to the final canvas pixels after `render` runs: - 'native': keep the browser's smooth antialiased alpha (default) - 'none': hard alpha cutoff, every pixel becomes fully opaque or fully transparent - 'dither': Bayer 4x4 ordered dithering of alpha into fully opaque or fully transparent pixels */
  antialiasing?: AntialiasingMode;
  /** Alpha cutoff threshold (0-255, default 128) used by 'none' */
  alphaThreshold?: number;
  render: (root: HTMLElement, context: AssetRenderContext) => void | Promise<void>;
  /** Logical width of one frame (the whole asset when `frames` is 1). Sizes are logical: the exported image is `width × scale` per frame, so `width: 96, scale: 2` exports 192 px. */
  width: number;
  /** Logical height of one frame. The exported image is `height × scale`. */
  height: number;
  /** Optional frame count for animation strips or multi-state spritesheets. When > 1, the engine automatically arranges N frames and supplies `context.frameIndex` (0..N-1). */
  frames?: number;
  /** Optional playback speed recommendation (frames per second, default: 5) */
  fps?: number;
  /** Optional named animations over the frames of a strip, for example `{ idle: [0, 1, 2, 3] }`. They are written to the atlas JSON as `meta.animations`, so an engine can play them by name. Indices are 0-based and must be lower than `frames`. Output data only: it does not constrain how a game plays the frames. */
  animations?: Record<string, number[]>;
  /** Number of facings rendered as rows of the sheet (1, 4 or 8 for named directions). Each row repeats every frame for one direction; `render` receives `direction`, `facing` and `directionName`. The atlas JSON lists the rows in `meta.directions`. Default 1. */
  directions?: number;
  /** Anchor point of every cell in logical pixels, usually where the object touches the ground (between the feet, the base of a prop). Written to the atlas JSON as `meta.pivot`. */
  pivot?: { x: number; y: number; };
  /** Extra data for the game, written to the atlas JSON as `meta.data` (JSON-serializable): for example a character clip's ground speed, duration and events. */
  data?: Record<string, unknown>;
  /** Optional custom output name (defaults to file basename) */
  name?: string;
  /** Optional custom asset identifier */
  id?: string;
}
```

### `CanvasOptions`

Options for `createCanvas`: crisp edges, alpha and scale.

```ts
interface CanvasOptions {
  crisp?: boolean;
  alpha?: boolean;
  scale?: number;
  antialiasing?: AntialiasingMode;
  alphaThreshold?: number;
}
```

### `Rng`

Diorama - Core Random Utilities

Deterministic, seedable pseudo-random number generator.
Allows procedural visual variations to remain repeatable between runs and exports.

```ts
interface Rng {
  /** Returns a float in [0, 1) */
  random: () => number;
  /** Returns a float in [min, max) */
  float: (min: number, max: number) => number;
  /** Returns an integer in [min, max] (inclusive) */
  int: (min: number, max: number) => number;
  /** Returns true with probability = chance (default 0.5) */
  boolean: (chance?: number | undefined) => boolean;
  /** Picks a random item from an array */
  pick: <T>(items: readonly T[]) => T;
  /** Returns a randomly shuffled copy of an array */
  shuffle: <T>(items: readonly T[]) => T[];
  /** Returns a random hex color or selects from a palette */
  color: (palette?: readonly string[] | undefined) => string;
}
```

### `NoiseFunction2D`

Samples the noise field in two dimensions

Coordinates should be finite, bigger than -2^31 and smaller than 2^31.

```ts
type NoiseFunction2D = (x: number, y: number) => number
```

### `RectItem`

Diorama - Sheet & Atlas Packing Algorithms

Provides deterministic layout algorithms for group exports:
1. packGrid: Uniform cell grid with emergent dimensions (increments row first, then col).
2. packCompact: rectangle bin-packing for minimal area without overlaps.

```ts
interface RectItem {
  name?: string;
  width: number;
  height: number;
}
```

### `PlacedRect`

A rectangle placed by a packing algorithm, with its position in the sheet.

```ts
interface PlacedRect<T extends RectItem = RectItem> {
  item: T;
  x: number;
  y: number;
  width: number;
  height: number;
  cellX?: number;
  cellY?: number;
  cellWidth?: number;
  cellHeight?: number;
}
```

### `PackResult`

Result of a packing algorithm: the sheet size and the placed rectangles.

```ts
interface PackResult<T extends RectItem = RectItem> {
  width: number;
  height: number;
  cols?: number;
  rows?: number;
  gap: number;
  items: PlacedRect<T>[];
}
```

### `GridPackOptions`

Options for `packGrid`: spacing between cells and an optional column count.

```ts
interface GridPackOptions {
  /** Minimum spacing in pixels between cells (default: 0) */
  gap?: number;
  /** Optional manual column override */
  cols?: number;
  /** Optional manual row override */
  rows?: number;
}
```

### `CompactPackOptions`

Options for `packCompact`: spacing between rectangles.

```ts
interface CompactPackOptions {
  /** Minimum spacing in pixels between rects (default: 0) */
  gap?: number;
}
```

### `RGBA`

Color Utilities for Diorama

Deterministic color manipulation (opacity/alpha, lightening, darkening, interpolation)
allowing coding agents to derive tonal variations and transparent states from theme tokens (src/theme.ts)
without violating the "No Hardcoded Styling" rule.

```ts
interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}
```

### `UiBox`

A box in logical pixels.

```ts
interface UiBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
```

### `Insets`

The fixed borders of a nine-slice image, in logical pixels.

```ts
interface Insets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
```

### `NineSliceOptions`

Options of `defineNineSlice`.

```ts
interface NineSliceOptions {
  /** What it is for: 'panel', 'button', 'slot', 'tooltip', 'frame' or the project's own. */
  kind: string;
  /** Logical size it is drawn at (a game stretches it to any size larger than the insets). */
  width: number;
  height: number;
  /** Borders that never stretch: the corners and the edges' thickness. */
  insets: Insets;
  /** States, one row each (default ['normal']): 'normal', 'hover', 'pressed', 'disabled', 'selected'. */
  states?: string[];
  /** Draws the image in a state into `box` (the whole cell). */
  draw: (c: CanvasRenderingContext2D, box: UiBox, state: string) => void;
  scale?: number;
  data?: Record<string, unknown>;
}
```

### `BarLayer`

The layers of a bar: back, fill, the optional cap at the fill's end, frame (drawn in that order).

```ts
type BarLayer = "back" | "fill" | "cap" | "frame"
```

### `BarOptions`

Options of `defineBar`.

```ts
interface BarOptions {
  /** What it measures ('health', 'mana', 'soul', 'xp', 'cooldown'): carried in the atlas. */
  measure?: string;
  width: number;
  height: number;
  /** Borders that never stretch when a game makes the bar longer. */
  insets: Insets;
  /** The box the fill occupies at full value, inside the frame. */
  fillBox: UiBox;
  /** Which way the fill grows. Default 'right'. */
  grows?: "right" | "left" | "up" | "down";
  /** A cap: the bright edge where the fill ends, drawn as a fourth frame at the full end of `fillBox` (as at 100%) within `width` logical px of it. A game moves it with the fill's end and clips it to `fillBox`, so a bar at any value shows its cut edge. */
  cap?: { width: number; };
  draw: (c: CanvasRenderingContext2D, box: UiBox, layer: BarLayer) => void;
  scale?: number;
  data?: Record<string, unknown>;
}
```

### `BitmapFontOptions`

Options of `defineBitmapFont`.

```ts
interface BitmapFontOptions {
  /** The characters, in frame order ('0123456789+-%' for damage numbers). */
  chars: string;
  /** Logical size of one glyph cell. */
  cell: { w: number; h: number; };
  /** Distance from the cell's top to the baseline. */
  baseline: number;
  /** Draws one glyph into its cell and returns its advance (how far the pen moves after it). */
  draw: (c: CanvasRenderingContext2D, char: string, box: UiBox) => number;
  /** Extra space between glyphs. Default 1. */
  spacing?: number;
  /** Distance between lines. Default the cell's height. */
  lineHeight?: number;
  scale?: number;
}
```

### `UiImageOptions`

Options of `defineUiImage`.

```ts
interface UiImageOptions {
  /** What it is: 'cursor', 'portrait-frame', 'ornament', 'icon-frame' or the project's own. */
  kind: string;
  width: number;
  height: number;
  /** States, one row each (default ['normal']). */
  states?: string[];
  /** Where the image's point is (a cursor's hotspot), in logical pixels. */
  pivot?: { x: number; y: number; };
  draw: (c: CanvasRenderingContext2D, box: UiBox, state: string) => void;
  scale?: number;
  data?: Record<string, unknown>;
}
```

