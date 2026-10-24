/**
 * @core/draw - Core Attribute Interfaces & Types
 */

export interface Point {
  x: number;
  y: number;
}

/** Shape of a wobble: smooth, chiseled or stepped. */
export type WobbleStyle = 'smooth' | 'chiseled' | 'stepped';

/** Hand-drawn wobble: amplitude, frequency, steps, seed and style. */
export interface WobbleOptions {
  /** Displacement amplitude in pixels (default: 2.0) */
  amplitude?: number;
  /** Spatial noise frequency (default: ~1.8) */
  frequency?: number;
  /** Subdivisions per edge (for coarse shapes) */
  steps?: number;
  /** Deterministic PRNG seed */
  seed?: number;
  /**
   * Personality style of the wobble:
   * - 'smooth' (default): continuous organic curve (simplex noise)
   * - 'chiseled': faceted straight segments (chiseled stone, chipped wood, low-poly)
   * - 'stepped': orthogonal/stepped cuts
   */
  style?: WobbleStyle;
  /** Average segment length in pixels for chiseled/stepped mode (default: 14) */
  segmentLength?: number;
}

/** Options for polygon constructors: center, rotation, rounding, wobble and seed. */
export interface PolygonOptions {
  /** Number of vertices/sides (>= 3, required for regular polygons) */
  sides?: number;
  /** Base outer radius when defining geometry, or corner rounding radius when passed in options (e.g. Polygon.regular(6, 40, { radius: 6 })) */
  radius?: number;
  /** Secondary inner radius (for stars or scalloped shapes) */
  innerRadius?: number;
  /** Center X position (default: 0) */
  cx?: number;
  /** Center Y position (default: 0) */
  cy?: number;
  /** Center point position (convenient Point alternative to cx and cy) */
  center?: Point;
  /**
   * Rotation in degrees (default: 0), applied around the origin (0, 0) before `cx`/`cy` places the result.
   * It does not pivot on the shape itself. For a shape built from free points, rotate it after creation
   * with `.rotate(degrees, pivot)`, for example `Polygon.stem(base, 40).rotate(180, base)`.
   */
  rotation?: number;
  /** Corner rounding factor (0 to 0.5, or pixel radius) */
  roundness?: number;
  /** Corner chamfer / bevel cut factor */
  bevel?: number;
  /** Procedural organic wobble deformation */
  wobble?: WobbleOptions | boolean;
  /** Deterministic PRNG seed */
  seed?: number;
}

/** Options for `Polygon.star`: inner radius and edge bulge, plus the polygon options. */
export interface StarOptions extends Partial<PolygonOptions> {
  innerRadius?: number;
  /**
   * Curvature of the edges between outer tips and inner valleys.
   * Positive values bow the edges inward (concave, gothic sparkle/four-point star).
   * Negative values puff the edges outward (convex). Default: 0
   */
  bulge?: number;
}

/** Options for `Polygon.crescent`: arc angle, rotation and segments. */
export interface CrescentOptions extends Partial<PolygonOptions> {
  /** Central sweep angle of the arc in degrees (default: 180) */
  arcAngle?: number;
  /** Angular rotation of the crescent moon in degrees (default: 0) */
  rotation?: number;
  /** Radial segments for curve discretization (default: 36) */
  segments?: number;
}

/** One ellipse lobe of `Polygon.lobes`: center and radii. */
export interface LobeDefinition {
  cx: number;
  cy: number;
  rx: number;
  ry?: number; // If omitted, assumes circular lobe (ry = rx)
}

/** Options for `Polygon.lobes`: number of segments. */
export interface LobesOptions extends Partial<PolygonOptions> {
  /** Angular radial raycast sampling resolution (default: 96) */
  segments?: number;
}

/** Width of a ribbon: a number, a start and end pair, or a function of the position along the line. */
export type RibbonWidth =
  | number
  | { start: number; end: number }
  | ((t: number) => number);

/** Options for `Polygon.stem`: sway, base and top width, and segments. */
export interface StemOptions extends Partial<PolygonOptions> {
  /** Horizontal sway/lean offset at the tip in pixels (default: 0) */
  sway?: number;
  /** Stem thickness at the base root in pixels (default: 8) */
  baseWidth?: number;
  /** Stem thickness at the top tip in pixels (default: 1.5) */
  topWidth?: number;
  /** Quadratic Bézier sampling steps along height (default: 16) */
  segments?: number;
}

/** Options for `Polygon.rect` and `Polygon.capsule`: size, corner radius, bevel and center. */
export interface RectOptions {
  width: number;
  height: number;
  cx?: number;
  cy?: number;
  /** Uniform corner radius or [topLeft, topRight, bottomRight, bottomLeft] */
  radius?: number | [number, number, number, number];
  /** Uniform corner chamfer/bevel in pixels, or [topLeft, topRight, bottomRight, bottomLeft] */
  bevel?: number | [number, number, number, number];
  rotation?: number;
  wobble?: WobbleOptions | boolean;
  seed?: number;
}

/** Options for `Polygon.circle`: center, number of segments and wobble. */
export interface CircleOptions {
  radius: number;
  cx?: number;
  cy?: number;
  /** Number of radial segments for interpolation (default: 36) */
  segments?: number;
  wobble?: WobbleOptions | boolean;
  seed?: number;
}

/** Options for `Polygon.ellipse`: radii, center, rotation and segments. */
export interface EllipseOptions {
  rx: number;
  ry: number;
  cx?: number;
  cy?: number;
  rotation?: number;
  segments?: number;
  wobble?: WobbleOptions | boolean;
  seed?: number;
}

/** Options for `Path.line`: wobble and seed. */
export interface LineOptions {
  from: Point;
  to: Point;
  wobble?: WobbleOptions | boolean;
  seed?: number;
}

/** Options for `Path.arc`: style, segments and wobble. */
export interface ArcOptions {
  cx: number;
  cy: number;
  radius: number;
  startAngle: number; // in degrees
  endAngle: number;   // in degrees
  segments?: number;
  /** Whether the arc is continuous smooth or chiseled in straight facets */
  style?: 'smooth' | 'chiseled';
  wobble?: WobbleOptions | boolean;
  seed?: number;
}

/** Options for `Path.curve`: steps, style and wobble. */
export interface CurveOptions {
  from: Point;
  to: Point;
  /** Perpendicular sagitta arch height */
  bow: number;
  steps?: number;
  /** Number of straight planar facets when in chiseled mode */
  segments?: number;
  /** Whether the curve is continuous smooth or chiseled in straight facets */
  style?: 'smooth' | 'chiseled';
  wobble?: WobbleOptions | boolean;
  seed?: number;
}

/** Options for `Path.spline`: tension and steps. */
export interface SplineOptions {
  /** Tension factor for Catmull-Rom interpolation (0.0 to 1.0, default: 0.5) */
  tension?: number;
  steps?: number;
  /** Alias for steps: number of interpolated segments between consecutive nodes */
  segmentsPerSpan?: number;
  /** Number of straight planar facets when in chiseled mode */
  segments?: number;
  /** Whether the curve is continuous smooth or chiseled in straight facets */
  style?: 'smooth' | 'chiseled';
  wobble?: WobbleOptions | boolean;
  seed?: number;
}

/** Options for `Path.bezier`: steps and style. */
export interface BezierOptions {
  steps?: number;
  /** Number of straight planar facets when in chiseled mode */
  segments?: number;
  /** Whether the curve is continuous smooth or chiseled in straight facets */
  style?: 'smooth' | 'chiseled';
  wobble?: WobbleOptions | boolean;
  seed?: number;
}

/** Options of Path.line(from, to, options): endpoints are positional, only wobble/seed go here. */
export type LineShapeOptions = Partial<Omit<LineOptions, 'from' | 'to'>>;

/** Options for `Path.wave`: steps and style. */
export interface WaveOptions {
  from: Point;
  to: Point;
  cycles?: number;
  amplitude?: number;
  steps?: number;
  /** Number of straight planar facets when in chiseled mode */
  segments?: number;
  style?: 'smooth' | 'chiseled';
  wobble?: WobbleOptions | boolean;
  seed?: number;
}

/** Options of Path.wave(from, to, cycles, amplitude, options): endpoints, cycles and amplitude are positional. */
export type WaveShapeOptions = Partial<Omit<WaveOptions, 'from' | 'to' | 'cycles' | 'amplitude'>>;

/** Stroke renderers: 'ribbon' (calligraphic, tapered end; the default) or 'clean' (uniform native stroke). */
export type BrushName = 'ribbon' | 'clean';

/** End cap of an open line. */
export type LineCap = 'butt' | 'round' | 'square';

/** How strokes join at corners: round, miter or bevel. */
export type StrokeJoin = 'miter' | 'round' | 'bevel';

/** Stroke options: width, color, renderer, join and the settings of the ribbon renderer. */
export interface StrokeOptions {
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

/** Where a stroke sits relative to the outline: center, inside or outside. */
export type StrokePosition = 'center' | 'inside' | 'outside';

/** Options for `Shape.offset()` and `offsetPolygon()`. */
export interface OffsetOptions {
  /** Miter limit factor to prevent acute spikes (default: 2.5) */
  miterLimit?: number;
}

/** Built-in anchor names of a shape: center, the four edges and the four corners. */
export type AnchorName =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight';

/**
 * Anything accepted where an anchor is expected: one of the 9 built-in `AnchorName`s or a custom
 * anchor registered with `setAnchor(name, point)`. Built-in names keep editor autocompletion.
 */
export type AnchorRef = AnchorName | (string & {});

/** Bounding box of a shape, with its edges, size and center. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Alias of `minX`. */
  left: number;
  /** Alias of `maxX`. */
  right: number;
  /** Alias of `minY` (screen coordinates: y grows downward, so `top < bottom`). */
  top: number;
  /** Alias of `maxY`. */
  bottom: number;
  center: Point;
}

/** One edge of a polygon: its midpoint, normal, tangent and length. */
export interface EdgeInfo {
  index: number;
  start: Point;
  end: Point;
  mid: Point;
  normal: Point;
  tangent: Point;
  angle: number;
  normalAngle: number;
  length: number;
}

/** Drop shadow: color, offset and blur. */
export interface ShadowOptions {
  color: string;
  x: number;
  y: number;
  blur?: number;
}

/** Options for `createGradient`: linear or radial, direction, color stops and points. */
export interface GradientOptions {
  type?: 'linear' | 'radial';
  /** Preset direction or custom angle in degrees (0 = left to right, 90 = top to bottom) */
  direction?: 'vertical' | 'horizontal' | 'diagonal' | number;
  stops: [number, string][];
  from?: Point | AnchorName;
  to?: Point | AnchorName;
  /** Center point or anchor for radial gradients (defaults to shape center) */
  center?: Point | AnchorName;
  r1?: number;
  r2?: number;
}

/** A texture attached to a ShapeStyle: any object with a `render` method. */
export interface Texture<TOptions = unknown> {
  render(ctx: CanvasRenderingContext2D, target: ShapeLike | Bounds, overrides?: Partial<TOptions>): void;
}

/** A rectangle with position and size. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A fill paint: a color string, a canvas gradient or a canvas pattern. */
export type Paint = string | CanvasGradient | CanvasPattern;

/** Anything that can be moved, rotated and scaled in place: `Shape` and `Path`. */
export interface Transformable {
  readonly bounds: BoundingBox;
  readonly center: Point;
  translate(dx: number, dy: number): this;
  rotate(angleDegrees: number, pivot?: Point | AnchorRef): this;
  scale(sx: number, sy?: number, pivot?: Point | AnchorRef): this;
  moveTo(target: Point, myAnchor?: AnchorRef): this;
}

/** Anything with bounds, a center and anchors, such as a Shape. */
export interface ShapeLike {
  bounds: BoundingBox;
  center: Point;
  anchor(name: AnchorName): Point;
  toPoints(): Point[];
  offset(distance: number, options?: { miterLimit?: number }): ShapeLike;
  createGradient(ctx: CanvasRenderingContext2D, options: GradientOptions): CanvasGradient;
  fill(ctx: CanvasRenderingContext2D, fillStyle: Paint): this;
  stroke(ctx: CanvasRenderingContext2D, strokeStyle?: import('./styles/stroke-style.js').StrokeStyle | StrokeOptions): this;
  draw(ctx: CanvasRenderingContext2D, options?: ShapeStyleOptions): this;
  clip(ctx: CanvasRenderingContext2D, fn: InsideCallback): unknown;
}

/** Callback that draws inside a shape, clipped to its silhouette. */
export type InsideCallback = (ctx: CanvasRenderingContext2D, shape: ShapeLike) => void;

/** Cel shading: shade color, light pivot and light scale. */
export interface CelShadeOptions {
  /** Underlying base shadow/shade color (filled across entire shape) */
  shade: string;
  /** Point or anchor name toward which the lit region recedes (light source direction, default: 'topLeft') */
  lightPivot?: Point | AnchorName;
  /** Scale multiplier of the illuminated sub-region relative to shape (default: { x: 0.84, y: 0.8 }) */
  litScale?: number | { x: number; y: number };
}

/** Plain options object for a ShapeStyle. */
export interface ShapeStyleOptions {
  /** Surface fill style (color, gradient, or pattern) */
  fill?: Paint;
  /** Optional cel-shaded lighting volume (underlying shade + lit sub-region) */
  celShade?: CelShadeOptions;
  /** Optional procedural surface texture or array of textures */
  texture?: Texture | Texture[];
  /** Stroke styling for the outline */
  stroke?: import('./styles/stroke-style.js').StrokeStyle | StrokeOptions;
  /** Outline alignment relative to perimeter */
  strokePosition?: StrokePosition;
  /** A drop or soft diffused shadow */
  shadow?: ShadowOptions;
  /** Safe clipping callback for internal illustrations/textures */
  inside?: InsideCallback;
}

/** Anything that can be positioned: Shape or Path. Used by attach and scatterAlong. */
export interface Placeable {
  readonly bounds: BoundingBox;
  readonly center: Point;
  anchor(name: AnchorRef): Point;
  translate(dx: number, dy: number): this;
}

/** Options for `displace`: amplitude, frequency, seed and mode. */
export interface DisplaceOptions {
  /** Maximum displacement in pixels (default 2). */
  amplitude?: number;
  /** Noise cycles per 100 px (default 3). */
  frequency?: number;
  seed?: number;
  /** Max edge length before displacing; smaller = smoother result, 0 = keep existing vertices (default 6). */
  densify?: number;
  /** 'normal' pushes along the contour normal (default); 'xy' jitters freely. */
  mode?: 'normal' | 'xy';
}

/** Options for `bend`: angle and axis. */
export interface BendOptions {
  /** Total bend in degrees across the extent (positive curves toward +y for axis 'x'). */
  angle: number;
  /** Axis along which the geometry is bent (default 'x'). */
  axis?: 'x' | 'y';
  /** Neutral point that stays put (default: bounds center). */
  pivot?: Point;
}

/** Options for `taper`: axis and the scale at each end. */
export interface TaperOptions {
  /** Axis along which the cross-section changes (default 'y'). */
  axis?: 'x' | 'y';
  /** Cross-section scale at the min end of the axis (default 1). */
  from?: number;
  /** Cross-section scale at the max end of the axis (default 0.5). */
  to?: number;
  pivot?: Point;
}

/** Options for `outline`: band width, position and miter limit. */
export interface OutlineOptions {
  /** Outline thickness in pixels (default 2). */
  width?: number;
  /** Where the band sits relative to the contour (default 'center'). */
  position?: StrokePosition;
  /** Miter limit for sharp corners (default 2.5). */
  miterLimit?: number;
}

/** Options for `toShape`: width, cap and cleanup. */
export interface ToShapeOptions {
  /** Thickness: constant, {start,end} taper, or a function of t (0..1). Closed paths use a constant width (default 2). */
  width?: RibbonWidth;
  /** Ends of an open path (default 'butt'). */
  cap?: LineCap;
  /** Resolve self-overlaps on tight curves via a boolean pass (default true). */
  clean?: boolean;
}

/** Form of width or stroke styling accepted by toShape, toRibbon, unionLine and cutLine. */
export type LineToShapeInput =
  | RibbonWidth
  | ToShapeOptions
  | import('./styles/stroke-style.js').StrokeStyle
  | StrokeOptions;

/** Options for `warp`: densification before the warp. */
export interface WarpOptions {
  /**
   * Max edge length before warping; smaller = smoother result, 0 = keep existing vertices (default 6).
   * Warping a coarse polygon without densifying only moves its few corners.
   */
  densify?: number;
}

/** Options for `twist`: angle and axis. */
export interface TwistOptions extends WarpOptions {
  /** Total rotation in degrees accumulated from the min end to the max end of the axis. */
  angle: number;
  /** Axis along which the rotation accumulates (default 'y'). */
  axis?: 'x' | 'y';
  /** Point the geometry rotates around (default: bounds center). */
  pivot?: Point;
}

/** Options for `inflate`: amount and radius. */
export interface InflateOptions extends WarpOptions {
  /** Pixels moved away from center at full strength. Negative values pinch toward it. */
  amount: number;
  /** Center of the effect (default: bounds center). */
  center?: Point;
  /** Soft-selection radius in pixels; influence fades smoothly to 0 at this distance (default: half the largest bounds side). */
  radius?: number;
}