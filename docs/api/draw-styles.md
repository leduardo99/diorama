# @core/draw - Styles, Strokes & Colors

> Auto-generated public API reference. Do not edit directly; re-run `npm run docs:api`.

Fill and stroke styles, cel-shading lights, shadows, the two stroke renderers ('ribbon' and 'clean') and color helpers.

## Table of Contents

- [Classes & Constructors](#classes--constructors)
  - [`StrokeStyle`](#strokestyle)
  - [`ShapeStyle`](#shapestyle)
- [Functions & Operations](#functions--operations)
  - [`alpha`](#alpha)
  - [`lerpColor`](#lerpcolor)
  - [`parseColor`](#parsecolor)
- [Types & Interfaces](#types--interfaces)
  - [`RGBA`](#rgba)
  - [`Paint`](#paint)
  - [`StrokeOptions`](#strokeoptions)
  - [`ShadowOptions`](#shadowoptions)
  - [`ShapeStyleOptions`](#shapestyleoptions)
  - [`CelShadeOptions`](#celshadeoptions)
  - [`BrushName`](#brushname)
  - [`StrokeJoin`](#strokejoin)
  - [`StrokePosition`](#strokeposition)
  - [`GradientOptions`](#gradientoptions)

---

## Classes & Constructors

### `StrokeStyle`

A stroke: width, color, renderer and options. Immutable; derive variants with `.with`.

**Constructor:**
```ts
new StrokeStyle<P extends object = {}>(attrs?: StrokeOptions & P): StrokeStyle<P>
```

**Properties:**

- `attrs: Readonly<StrokeOptions & P>`
- `width: number | undefined`
- `color: string | undefined`
- `renderer: string | undefined`

**Instance Methods:**

- `.with<P2 extends object = P>(overrides: Partial<StrokeOptions & P & P2>): StrokeStyle<P & P2>`
  Derives a new StrokeStyle with specific attribute overrides. Keys that are not StrokeOptions keys are kept and merged too.
- `.render(ctx: CanvasRenderingContext2D, points: Point[], closed?: boolean): void`
  Renders a polyline or closed loop onto the canvas context using this style, with the renderer named in attrs.renderer ('ribbon' when unset).

---

### `ShapeStyle`

A style for shapes: fill, stroke, shadow, textures and an inner callback.

**Constructor:**
```ts
new ShapeStyle(attrs?: ShapeStyleOptions): ShapeStyle
```

**Properties:**

- `attrs: Readonly<ShapeStyleOptions>`
- `fill: Paint | undefined`
- `celShade: CelShadeOptions | undefined`
- `texture: Texture<unknown> | Texture<unknown>[] | undefined`
- `stroke: StrokeStyle<{}> | StrokeOptions | undefined`
- `shadow: ShadowOptions | undefined`
- `strokePosition: StrokePosition | undefined`
- `inside: InsideCallback | undefined`

**Instance Methods:**

- `.with(overrides: Partial<ShapeStyleOptions>): ShapeStyle`
  Derives a new ShapeStyle with specific attribute overrides. Performs deep merge on composite attributes (stroke, shadow, celShade) to prevent losing preset configurations.

---

## Functions & Operations

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

### `parseColor`

Parses hex (#rgb, #rrggbb, #rrggbbaa) or rgb/rgba strings into { r, g, b, a }.

```ts
function parseColor(color: string): RGBA
```

---

## Types & Interfaces

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

### `Paint`

A fill paint: a color string, a canvas gradient or a canvas pattern.

```ts
type Paint = string | CanvasGradient | CanvasPattern
```

### `StrokeOptions`

Stroke options: width, color, renderer, join and the settings of the ribbon renderer.

```ts
interface StrokeOptions {
  /** Line width in pixels (default: 2) */
  width?: number;
  /** Line / ink color (default: '#1c1714') */
  color?: string;
  /** Stroke rendering algorithm (default: 'ribbon') */
  renderer?: BrushName;
  /** Corner join style for loops and polyline vertices (default: 'miter') */
  join?: StrokeJoin;
  /** Maximum miter expansion ratio to prevent needle-like spikes on sharp corners (default: 6.0) */
  miterLimit?: number;
  /** Coordinate scale factor (default: 1.0) */
  scale?: number;
  /** PRNG seed */
  seed?: number;
  /** Whether the start of the stroke tapers smoothly (default: false) */
  taperStart?: boolean;
  /** Whether the end of the stroke tapers smoothly (default: true for handdrawn) */
  taperEnd?: boolean;
  /** Whether this stroke is a continuous closed perimeter loop (default: false) */
  closed?: boolean;
  /** Organic micro-caliper variation amplitude (0 to 0.4) */
  caliperNoise?: number;
  /** Edge jitter magnitude */
  jitter?: number;
  /** Number of rendering passes (default: 1) */
  passes?: number;
  /** Stroke alignment relative to shape boundary */
  position?: StrokePosition;
}
```

### `ShadowOptions`

Drop shadow: color, offset and blur.

```ts
interface ShadowOptions {
  color: string;
  x: number;
  y: number;
  blur?: number;
}
```

### `ShapeStyleOptions`

Plain options object for a ShapeStyle.

```ts
interface ShapeStyleOptions {
  /** Surface fill style (color, gradient, or pattern) */
  fill?: Paint;
  /** Optional cel-shaded lighting volume (underlying shade + lit sub-region) */
  celShade?: CelShadeOptions;
  /** Optional procedural surface texture or array of textures */
  texture?: Texture<unknown> | Texture<unknown>[];
  /** Stroke styling for the outline */
  stroke?: StrokeStyle<{}> | StrokeOptions;
  /** Outline alignment relative to perimeter */
  strokePosition?: StrokePosition;
  /** A drop or soft diffused shadow */
  shadow?: ShadowOptions;
  /** Safe clipping callback for internal illustrations/textures */
  inside?: InsideCallback;
}
```

### `CelShadeOptions`

Cel shading: shade color, light pivot and light scale.

```ts
interface CelShadeOptions {
  /** Underlying base shadow/shade color (filled across entire shape) */
  shade: string;
  /** Point or anchor name toward which the lit region recedes (light source direction, default: 'topLeft') */
  lightPivot?: Point | AnchorName;
  /** Scale multiplier of the illuminated sub-region relative to shape (default: { x: 0.84, y: 0.8 }) */
  litScale?: number | { x: number; y: number; };
}
```

### `BrushName`

Stroke renderers: 'ribbon' (calligraphic, tapered end; the default) or 'clean' (uniform native stroke).

```ts
type BrushName = "ribbon" | "clean"
```

### `StrokeJoin`

How strokes join at corners: round, miter or bevel.

```ts
type StrokeJoin = "round" | "miter" | "bevel"
```

### `StrokePosition`

Where a stroke sits relative to the outline: center, inside or outside.

```ts
type StrokePosition = "center" | "inside" | "outside"
```

### `GradientOptions`

Options for `createGradient`: linear or radial, direction, color stops and points.

```ts
interface GradientOptions {
  type?: "linear" | "radial";
  /** Preset direction or custom angle in degrees (0 = left to right, 90 = top to bottom) */
  direction?: number | "vertical" | "horizontal" | "diagonal";
  stops: [number, string][];
  from?: Point | AnchorName;
  to?: Point | AnchorName;
  /** Center point or anchor for radial gradients (defaults to shape center) */
  center?: Point | AnchorName;
  r1?: number;
  r2?: number;
}
```

