# @core/draw - Paths, Lines & Curves

> Auto-generated public API reference. Do not edit directly; re-run `npm run docs:api`.

Continuous path generation, PathBuilder fluent chaining, parametric measuring, variable-width ribbons, arc-length queries and path concatenation.

## Table of Contents

- [Classes & Constructors](#classes--constructors)
  - [`Path`](#path)
  - [`PathBuilder`](#pathbuilder)
- [Types & Interfaces](#types--interfaces)
  - [`LineOptions`](#lineoptions)
  - [`LineShapeOptions`](#lineshapeoptions)
  - [`ArcOptions`](#arcoptions)
  - [`CurveOptions`](#curveoptions)
  - [`SplineOptions`](#splineoptions)
  - [`BezierOptions`](#bezieroptions)
  - [`WaveOptions`](#waveoptions)
  - [`WaveShapeOptions`](#waveshapeoptions)
  - [`WobbleOptions`](#wobbleoptions)
  - [`RibbonWidth`](#ribbonwidth)
  - [`LineCap`](#linecap)
  - [`WobbleStyle`](#wobblestyle)
  - [`ToShapeOptions`](#toshapeoptions)
  - [`LineToShapeInput`](#linetoshapeinput)

---

## Classes & Constructors

### `Path`

An open or closed line. Stroke it with `stroke`, or convert it into a fillable shape with `toShape`.

**Constructor:**
```ts
new Path(points: Point[], closed?: boolean): Path
```

**Properties:**

- `closed: boolean` — Whether the last point connects back to the first.
- `points: Point[]` — Copy of the vertices.
- `bounds: BoundingBox`
- `center: Point`
- `anchorNames: string[]` — Names of the custom anchors set with setAnchor.
- `length: number` — Total length in pixels (includes the closing segment for closed paths).

**Static Factories:**

- `Path.line(from: Point, to: Point, options?: Partial<Omit<LineOptions, "from" | "to">>): Path`
  Straight line, optionally wobbled ('smooth' | 'chiseled' | 'stepped').
- `Path.arc(center: Point, radius: number, startAngle: number, endAngle: number, options?: Partial<ArcOptions>): Path`
  Circular arc between two angles in degrees ('smooth' or 'chiseled').
- `Path.curve(from: Point, to: Point, bow: number, options?: Partial<CurveOptions>): Path`
  Quadratic arch. `bow` is the perpendicular sagitta: the apex lies `|bow|` away from the chord. A positive bow bulges along `normalAt`, which is the right-hand side of the direction of travel on screen. For `from (0,0)` to `to (100,0)`, `bow: 10` passes through `(50, 10)`.
- `Path.spline(points: Point[], options?: Partial<SplineOptions>): Path`
  Catmull-Rom spline through the points ('chiseled' gives facets).
- `Path.bezier(p1: Point, cp1: Point, cp2: Point, p2: Point, options?: Partial<BezierOptions>): Path`
  Cubic Bezier from p1 to p2 with control points cp1, cp2.
- `Path.wave(from: Point, to: Point, cycles?: number, amplitude?: number, options?: Partial<Omit<WaveOptions, "from" | "to" | "cycles" | "amplitude">>): Path`
  Sine wave between two points.
- `Path.polyline(points: Point[], closed?: boolean): Path`
  Polyline through arbitrary points.
- `Path.concat(...paths: Path[]): Path`
  Joins paths end to end, welding coinciding endpoints. The result is closed only if the LAST path is closed.
- `Path.builder(startPoint?: Point | undefined): PathBuilder`
  Starts a fluent builder at `startPoint`.

**Instance Methods:**

- `.anchor(name: AnchorRef): Point`
  Built-in bounding-box anchor ('center', 'top', 'bottomLeft', ...) or a custom anchor set with setAnchor.
- `.setAnchor(name: string, at: number | Point): this`
  Registers a custom named anchor. `at` is an absolute Point, or a number (0..1) meaning "that fraction of the arc length along this path" (path.setAnchor('mid', 0.5)). Custom anchors follow translate/rotate/scale/moveTo and clone()/flip(), and are dropped by operations that build new geometry. Built-in names cannot be redefined.
- `.vertex(index: number): Point`
- `.edge(index: number): EdgeInfo`
- `.pointAt(t: number): Point`
  Point at normalized distance t. Use as a dynamic anchor: `shape.moveTo(path.pointAt(0.5))`.
- `.tangentAt(t: number): Point`
  Unit direction of travel at t.
- `.normalAt(t: number): Point`
  Unit normal at t: the tangent rotated +90 degrees, `(-dy, dx)`. On screen (y grows downward) this points to the right-hand side of the direction of travel.
- `.translate(dx: number, dy: number): this`
- `.rotate(angleDegrees: number, pivot?: Point | AnchorRef | undefined): this`
- `.scale(sx: number, sy?: number, pivot?: Point | AnchorRef | undefined): this`
- `.moveTo(target: Point, myAnchor?: AnchorRef): this`
- `.clone(): Path`
- `.reverse(): Path`
  Same points in reverse order.
- `.slice(t0: number, t1: number): Path`
  Portion between normalized distances t0 and t1 (always open).
- `.resample(count: number): Path`
  `count` evenly spaced points along the path.
- `.offset(distance: number, miterLimit?: number): Path`
  Parallel path at `distance` pixels. Positive values move along `normalAt` (the right-hand side of the travel direction on screen).
- `.roundCorners(radius: number | number[], stepsPerCorner?: number): Path`
  Circular fillet on corners.
- `.mapVertices(fn: (p: Point, index: number, count: number) => void | Point): Path`
- `.displace(options?: DisplaceOptions): Path`
  Organic noise displacement; end points of open paths stay pinned.
- `.subdivide(maxEdge: number): Path`
- `.smooth(iterations?: number): Path`
- `.bend(options: BendOptions): Path`
- `.taper(options?: TaperOptions): Path`
- `.warp(fn: (p: Point, uv: Point) => void | Point, options?: WarpOptions): Path`
  Free-form warp: fn(p, uv) gets a copy of each vertex and its normalized position (0..1) in the path bounds; returns the new point.
- `.twist(options: TwistOptions): Path`
  Rotates vertices progressively along an axis (0 at the min end, angle degrees at the max end).
- `.inflate(options: InflateOptions): Path`
  Swells (amount > 0) or pinches (amount < 0) the area around center with smooth radial falloff.
- `.flip(axis?: "x" | "y", at?: number | undefined): Path`
  Mirror copy across a line (axis: 'x': left <-> right across x = at; aaxis: 'y': top <-> bottom across y = at; at defaults to the bounds center). Point order is kept, so the start maps to the reflected start. To build a symmetric outline from half a contour, join it with its reversed flip and close it.
- `.close(): CompoundShape`
  Closes the path and returns it as a fillable shape (the line itself becomes the boundary).
- `.toShape(options?: LineToShapeInput): Shape`
  Turns the line into filled geometry of the given thickness (constant, taper, or function of t). Open paths get `cap` ends; closed paths become a constant-width ring. Accepts a number, function, ToShapeOptions, or a StrokeStyle/StrokeOptions.
- `.toRibbon(options?: LineToShapeInput): Shape`
  Alias of toShape (the name agents tend to reach for): turns the line into a filled ribbon.
- `.stroke(ctx: CanvasRenderingContext2D, strokeStyle?: StrokeStyle<{}> | StrokeOptions | undefined): this`
  Strokes the line with a StrokeStyle (or plain options).
- `.draw(ctx: CanvasRenderingContext2D, style?: ShapeStyle | ShapeStyleOptions | undefined): this`
  Same contract as Shape.draw: optional `fill` (the path is closed implicitly) followed by `stroke`. Shadow, textures, cel shading and `inside` apply to the filled area.

---

### `PathBuilder`

Fluent builder for compound trajectories: lines, arcs, curves, splines, beziers, waves.
A Path has no sub-paths: every segment continues from the current point.

**Constructor:**
```ts
new PathBuilder(startPoint?: Point | undefined): PathBuilder
```

**Properties:**

- `currentPoint: Point`

**Instance Methods:**

- `.moveTo(ptOrX: number | Point, y?: number | undefined): this`
  Sets the start point. Accepts either a Point or (x, y) coordinates.
- `.lineTo(ptOrX: number | Point, yOrOptions?: number | Partial<Omit<LineOptions, "from" | "to">> | undefined, options?: Partial<Omit<LineOptions, "from" | "to">> | undefined): this`
  Adds a straight line to the target. Accepts either a Point or (x, y) coordinates.
- `.arcTo(center: Point, radius: number, startAngle: number, endAngle: number, options?: Partial<ArcOptions> | undefined): this`
  Arc around `center`; the arc is appended starting from its own first point.
- `.curveTo(to: Point, bow: number, options?: Partial<CurveOptions> | undefined): this`
- `.bezierTo(cp1: Point, cp2: Point, endPoint: Point, options?: Partial<BezierOptions> | undefined): this`
- `.splineTo(points: Point[], options?: Partial<SplineOptions> | undefined): this`
  Spline from the current point through `points`.
- `.waveTo(to: Point, cycles?: number, amplitude?: number, options?: Partial<Omit<WaveOptions, "from" | "to" | "cycles" | "amplitude">> | undefined): this`
- `.roundCorners(radius: number | number[], stepsPerCorner?: number): this`
  Fillets the corners recorded so far. Call before build()/close().
- `.build(closed?: boolean, roundRadius?: number | number[] | undefined): Path`
  Finishes as a Path for stroking. Optionally rounds corners.
- `.close(roundRadius?: number | number[] | undefined): CompoundShape`
  Closes and returns a fillable shape. Optionally rounds every corner, including the seam.
- `.toShape(options?: LineToShapeInput | undefined, roundRadius?: number | number[] | undefined): Shape`
  Turns the path directly into filled geometry (ribbon) of the given thickness or stroke style. Optionally rounds corners before solidifying.
- `.toRibbon(options?: LineToShapeInput | undefined, roundRadius?: number | number[] | undefined): Shape`
  Alias of toShape: turns the path directly into a filled ribbon.

---

## Types & Interfaces

### `LineOptions`

Options for `Path.line`: wobble and seed.

```ts
interface LineOptions {
  from: Point;
  to: Point;
  wobble?: boolean | WobbleOptions;
  seed?: number;
}
```

### `LineShapeOptions`

Options of Path.line(from, to, options): endpoints are positional, only wobble/seed go here.

```ts
type LineShapeOptions = { wobble?: boolean | WobbleOptions | undefined; seed?: number | undefined; }
```

### `ArcOptions`

Options for `Path.arc`: style, segments and wobble.

```ts
interface ArcOptions {
  cx: number;
  cy: number;
  radius: number;
  startAngle: number;
  endAngle: number;
  segments?: number;
  /** Whether the arc is continuous smooth or chiseled in straight facets */
  style?: "smooth" | "chiseled";
  wobble?: boolean | WobbleOptions;
  seed?: number;
}
```

### `CurveOptions`

Options for `Path.curve`: steps, style and wobble.

```ts
interface CurveOptions {
  from: Point;
  to: Point;
  /** Perpendicular sagitta arch height */
  bow: number;
  steps?: number;
  /** Number of straight planar facets when in chiseled mode */
  segments?: number;
  /** Whether the curve is continuous smooth or chiseled in straight facets */
  style?: "smooth" | "chiseled";
  wobble?: boolean | WobbleOptions;
  seed?: number;
}
```

### `SplineOptions`

Options for `Path.spline`: tension and steps.

```ts
interface SplineOptions {
  /** Tension factor for Catmull-Rom interpolation (0.0 to 1.0, default: 0.5) */
  tension?: number;
  steps?: number;
  /** Alias for steps: number of interpolated segments between consecutive nodes */
  segmentsPerSpan?: number;
  /** Number of straight planar facets when in chiseled mode */
  segments?: number;
  /** Whether the curve is continuous smooth or chiseled in straight facets */
  style?: "smooth" | "chiseled";
  wobble?: boolean | WobbleOptions;
  seed?: number;
}
```

### `BezierOptions`

Options for `Path.bezier`: steps and style.

```ts
interface BezierOptions {
  steps?: number;
  /** Number of straight planar facets when in chiseled mode */
  segments?: number;
  /** Whether the curve is continuous smooth or chiseled in straight facets */
  style?: "smooth" | "chiseled";
  wobble?: boolean | WobbleOptions;
  seed?: number;
}
```

### `WaveOptions`

Options for `Path.wave`: steps and style.

```ts
interface WaveOptions {
  from: Point;
  to: Point;
  cycles?: number;
  amplitude?: number;
  steps?: number;
  /** Number of straight planar facets when in chiseled mode */
  segments?: number;
  style?: "smooth" | "chiseled";
  wobble?: boolean | WobbleOptions;
  seed?: number;
}
```

### `WaveShapeOptions`

Options of Path.wave(from, to, cycles, amplitude, options): endpoints, cycles and amplitude are positional.

```ts
type WaveShapeOptions = { wobble?: boolean | WobbleOptions | undefined; seed?: number | undefined; steps?: number | undefined; segments?: number | undefined; style?: "smooth" | "chiseled" | undefined; }
```

### `WobbleOptions`

Hand-drawn wobble: amplitude, frequency, steps, seed and style.

```ts
interface WobbleOptions {
  /** Displacement amplitude in pixels (default: 2.0) */
  amplitude?: number;
  /** Spatial noise frequency (default: ~1.8) */
  frequency?: number;
  /** Subdivisions per edge (for coarse shapes) */
  steps?: number;
  /** Deterministic PRNG seed */
  seed?: number;
  /** Personality style of the wobble: - 'smooth' (default): continuous organic curve (simplex noise) - 'chiseled': faceted straight segments (chiseled stone, chipped wood, low-poly) - 'stepped': orthogonal/stepped cuts */
  style?: WobbleStyle;
  /** Average segment length in pixels for chiseled/stepped mode (default: 14) */
  segmentLength?: number;
}
```

### `RibbonWidth`

Width of a ribbon: a number, a start and end pair, or a function of the position along the line.

```ts
type RibbonWidth = number | { start: number; end: number; } | ((t: number) => number)
```

### `LineCap`

End cap of an open line.

```ts
type LineCap = "butt" | "round" | "square"
```

### `WobbleStyle`

Shape of a wobble: smooth, chiseled or stepped.

```ts
type WobbleStyle = "smooth" | "chiseled" | "stepped"
```

### `ToShapeOptions`

Options for `toShape`: width, cap and cleanup.

```ts
interface ToShapeOptions {
  /** Thickness: constant, {start,end} taper, or a function of t (0..1). Closed paths use a constant width (default 2). */
  width?: RibbonWidth;
  /** Ends of an open path (default 'butt'). */
  cap?: LineCap;
  /** Resolve self-overlaps on tight curves via a boolean pass (default true). */
  clean?: boolean;
}
```

### `LineToShapeInput`

Form of width or stroke styling accepted by toShape, toRibbon, unionLine and cutLine.

```ts
type LineToShapeInput = RibbonWidth | ToShapeOptions | StrokeStyle<{}> | StrokeOptions
```

