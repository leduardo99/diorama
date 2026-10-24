/**
 * @core/draw - Base Shape & CompoundShape classes
 *
 * Closed geometry with chainable CSG booleans, in-place transforms, immutable deformations,
 * anchors and unified drawing.
 *
 * Mutation contract:
 * - translate / rotate / scale / moveTo mutate the receiver and return `this` (use `.clone()` first to keep the original).
 * - Everything else (union, subtract, intersect, offset, roundCorners, outline, deformations) returns a NEW shape.
 * - toPoints() / regions return copies; mutating them never changes the shape.
 */

import type {
  Point,
  ShapeStyleOptions,
  StrokeOptions,
  AnchorRef,
  BoundingBox,
  EdgeInfo,
  GradientOptions,
  InsideCallback,
  Paint,
  DisplaceOptions,
  BendOptions,
  TaperOptions,
  WarpOptions,
  TwistOptions,
  InflateOptions,
  OutlineOptions,
  RibbonWidth,
  LineCap,
  LineToShapeInput,
  OffsetOptions,
} from '../types.js';
import type { Transformable } from '../types.js';
import { StrokeStyle } from '../styles/stroke-style.js';
import { ShapeStyle } from '../styles/shape-style.js';
import { offsetPolygon, getPolygonSignedArea } from '../internal/offset.js';
import { filletPoints } from '../internal/fillet.js';
import { computeBoundingBox, resolveAnchor, computeEdgeInfo } from '../internal/geometry.js';
import { createPath, runBoolean } from '../internal/registry.js';
import { AnchorSet } from '../internal/anchors.js';
import {
  clonePoints,
  translateVisitor,
  rotateVisitor,
  scaleVisitor,
  resolvePivot,
  resamplePolyline,
  subdividePoints,
  chaikin,
  polylineLength,
  type PointVisitor,
} from '../internal/points.js';
import { mapPoints, displacePoints, bendPoints, taperPoints, warpPoints, twistPoints, inflatePoints, reflectPoints } from '../internal/deform.js';
import type { Path } from './path.js';

/** A filled region: an outer ring and its holes. */
export interface PolygonRegion {
  outer: Point[];
  holes: Point[][];
}

/** Base class of every filled shape: transforms, anchors, booleans, deformations and drawing. */
export abstract class Shape implements Transformable {
  /** Live regions used by in-place operations. Never expose these arrays to callers. */
  protected abstract liveRegions(): PolygonRegion[];

  /** Independent deep clone. */
  abstract clone(): Shape;

  /** Copy of the outer ring of the primary region. */
  toPoints(): Point[] {
    return clonePoints(this.liveRegions()[0]?.outer ?? []);
  }

  /** Copy of every disconnected filled region (outer ring + holes). */
  get regions(): PolygonRegion[] {
    return this.liveRegions().map(region => ({
      outer: clonePoints(region.outer),
      holes: region.holes.map(clonePoints),
    }));
  }

  // ==========================================
  // INTROSPECTION & ANCHORS
  // ==========================================

  /** Axis-aligned bounding box and its center. */
  get bounds(): BoundingBox {
    return computeBoundingBox(this.liveRegions().flatMap(region => region.outer));
  }

  get center(): Point {
    return this.bounds.center;
  }

  private _anchors?: AnchorSet;

  /**
   * Point of the shape by name: the 9 built-in bounding-box anchors ('center', 'top', 'bottomLeft', ...)
   * or a custom anchor registered with `setAnchor`.
   */
  anchor(name: AnchorRef): Point {
    return this._anchors?.get(name) ?? resolveAnchor(this.bounds, name);
  }

  /**
   * Registers a custom named anchor (e.g. 'hilt', 'socket') at an absolute point.
   * Custom anchors move with `translate/rotate/scale/moveTo`, are kept by `clone()` and `flip()`,
   * and are dropped by operations that build new geometry (booleans, offsets, deformations).
   * Built-in names cannot be redefined.
   */
  setAnchor(name: string, at: Point): this {
    (this._anchors ??= new AnchorSet()).set(name, at);
    return this;
  }

  /** Names of the custom anchors set with `setAnchor`. */
  get anchorNames(): string[] {
    return this._anchors?.names() ?? [];
  }

  /** Copies custom anchors from `source`, optionally remapping their positions. For subclasses and derived shapes. */
  protected adoptAnchors(source: Shape, map?: (p: Point) => Point): this {
    if (source._anchors) (this._anchors ??= new AnchorSet()).adopt(source._anchors, map);
    return this;
  }

  /** Vertex of the primary outer ring (negative indices wrap). */
  vertex(index: number): Point {
    const pts = this.liveRegions()[0]?.outer ?? [];
    const n = pts.length;
    if (n === 0) return { x: 0, y: 0 };
    return { ...pts[((index % n) + n) % n] };
  }

  /** Edge i -> i+1 of the primary outer ring: midpoint, outward normal, tangent, angle, length. */
  edge(index: number): EdgeInfo {
    return computeEdgeInfo(this.liveRegions()[0]?.outer ?? [], index, true);
  }

  // ==========================================
  // IN-PLACE TRANSFORMS (return this)
  // ==========================================

  private visit(visitor: PointVisitor): this {
    for (const region of this.liveRegions()) {
      region.outer.forEach(visitor);
      for (const hole of region.holes) hole.forEach(visitor);
    }
    this._anchors?.visit(visitor);
    return this;
  }

  translate(dx: number, dy: number): this {
    return this.visit(translateVisitor(dx, dy));
  }

  /** Rotates by degrees around a Point or anchor name, built-in or custom (default: center). */
  rotate(angleDegrees: number, pivot?: Point | AnchorRef): this {
    return this.visit(rotateVisitor(angleDegrees, resolvePivot(pivot, this.bounds, this._anchors)));
  }

  /** Scales around a Point or anchor name, built-in or custom (default: center). `sy` defaults to `sx`. */
  scale(sx: number, sy = sx, pivot?: Point | AnchorRef): this {
    return this.visit(scaleVisitor(sx, sy, resolvePivot(pivot, this.bounds, this._anchors)));
  }

  /** Translates so that `myAnchor` (built-in or custom) lands on `target`. */
  moveTo(target: Point, myAnchor: AnchorRef = 'center'): this {
    const current = this.anchor(myAnchor);
    return this.translate(target.x - current.x, target.y - current.y);
  }

  // ==========================================
  // IMMUTABLE GEOMETRY OPERATIONS (return new shapes)
  // ==========================================

  private mapRings(fn: (ring: Point[], isHole: boolean) => Point[]): CompoundShape {
    return new CompoundShape(this.liveRegions().map(region => ({
      outer: fn(region.outer, false),
      holes: region.holes.map(hole => fn(hole, true)),
    })));
  }

  /** Inset (distance < 0) or outset (distance > 0) by a constant distance. */
  offset(distance: number, options: OffsetOptions = {}): Shape {
    return this.mapRings((ring, isHole) => offsetPolygon(ring, isHole ? -distance : distance, options));
  }

  /** Circular fillet on every corner. Radius may be a number or one per vertex. */
  roundCorners(radius: number | number[], stepsPerCorner = 4): Shape {
    return this.mapRings(ring => filletPoints(ring, radius, true, stepsPerCorner));
  }

  private toSolidInput(other: Shape | Path | Point[], pathWidth: RibbonWidth = 2): Shape | Point[] {
    if (other && typeof (other as any).toShape === 'function') {
      const p = other as Path;
      return p.closed ? p.close() : p.toShape({ width: pathWidth });
    }
    return other as Shape | Point[];
  }

  /**
   * Geometric union (CSG).
   * Accepts Shape, Path (converted with pathWidth, default 2), Point[], or an array of them.
   */
  union(other: (Shape | Path | Point[]) | (Shape | Path | Point[])[], pathWidth: RibbonWidth = 2): CompoundShape {
    if (Array.isArray(other) && other.length > 0 && typeof (other[0] as any)?.x !== 'number') {
      let current: CompoundShape = this as unknown as CompoundShape;
      for (const item of other) {
        current = current.union(item as Shape | Path | Point[], pathWidth);
      }
      return current;
    }
    return runBoolean('unite', this, this.toSolidInput(other as Shape | Path | Point[], pathWidth));
  }

  /**
   * Cuts `other` out of this shape (CSG).
   * Accepts Shape, Path (converted with pathWidth, default 2), Point[], or an array of them.
   */
  subtract(other: (Shape | Path | Point[]) | (Shape | Path | Point[])[], pathWidth: RibbonWidth = 2): CompoundShape {
    if (Array.isArray(other) && other.length > 0 && typeof (other[0] as any)?.x !== 'number') {
      let current: CompoundShape = this as unknown as CompoundShape;
      for (const item of other) {
        current = current.subtract(item as Shape | Path | Point[], pathWidth);
      }
      return current;
    }
    return runBoolean('subtract', this, this.toSolidInput(other as Shape | Path | Point[], pathWidth));
  }

  /**
   * Keeps only the overlap with `other` (CSG).
   * Accepts Shape, Path (converted with pathWidth, default 2), Point[], or an array of them.
   */
  intersect(other: (Shape | Path | Point[]) | (Shape | Path | Point[])[], pathWidth: RibbonWidth = 2): CompoundShape {
    if (Array.isArray(other) && other.length > 0 && typeof (other[0] as any)?.x !== 'number') {
      let current: CompoundShape = this as unknown as CompoundShape;
      for (const item of other) {
        current = current.intersect(item as Shape | Path | Point[], pathWidth);
      }
      return current;
    }
    return runBoolean('intersect', this, this.toSolidInput(other as Shape | Path | Point[], pathWidth));
  }

  /**
   * Unites a Path directly with this shape as a solid ribbon.
   * Accepts thickness, ToShapeOptions, or a StrokeStyle/StrokeOptions.
   */
  unionLine(path: Path, widthOrStroke: LineToShapeInput = 2, cap: LineCap = 'butt'): CompoundShape {
    const opts = typeof widthOrStroke === 'object' && !('start' in widthOrStroke && 'end' in widthOrStroke)
      ? widthOrStroke
      : { width: widthOrStroke as RibbonWidth, cap };
    const ribbon = path.closed ? path.close() : path.toShape(opts as any);
    return this.union(ribbon);
  }

  /**
   * Cuts this shape along a Path using a cutting ribbon.
   * Accepts thickness, ToShapeOptions, or a StrokeStyle/StrokeOptions.
   */
  cutLine(path: Path, widthOrStroke: LineToShapeInput = 2, cap: LineCap = 'butt'): CompoundShape {
    const opts = typeof widthOrStroke === 'object' && !('start' in widthOrStroke && 'end' in widthOrStroke)
      ? widthOrStroke
      : { width: widthOrStroke as RibbonWidth, cap };
    const blade = path.closed ? path.close() : path.toShape(opts as any);
    return this.subtract(blade);
  }

  // ==========================================
  // VERTEX DEFORMATION (return new shapes)
  // ==========================================

  /** Replaces every vertex: `fn(p, index, count)` returns the new point (or mutates the copy it receives). */
  mapVertices(fn: (p: Point, index: number, count: number) => Point | void): CompoundShape {
    return this.mapRings(ring => mapPoints(ring, fn));
  }

  /** Organic noise displacement along the contour normal (or free 'xy' jitter). Deterministic via `seed`. */
  displace(options: DisplaceOptions = {}): CompoundShape {
    return this.mapRings(ring => displacePoints(ring, true, options));
  }

  /** Inserts vertices so no edge is longer than `maxEdge`. */
  subdivide(maxEdge: number): CompoundShape {
    return this.mapRings(ring => subdividePoints(ring, maxEdge, true));
  }

  /** Re-spaces the outer ring to `count` evenly spaced vertices (holes get a proportional count). */
  resample(count: number): CompoundShape {
    return new CompoundShape(this.liveRegions().map(region => {
      const outerLen = polylineLength(region.outer, true) || 1;
      return {
        outer: resamplePolyline(region.outer, count, true),
        holes: region.holes.map(hole =>
          resamplePolyline(hole, Math.max(6, Math.round((count * polylineLength(hole, true)) / outerLen)), true)),
      };
    }));
  }

  /** Chaikin corner cutting; each iteration doubles the vertex count and softens corners. */
  smooth(iterations = 1): CompoundShape {
    return this.mapRings(ring => chaikin(ring, iterations, true));
  }

  /** Curves the shape by `angle` degrees along an axis. */
  bend(options: BendOptions): CompoundShape {
    return this.mapRings(ring => bendPoints(ring, options));
  }

  /** Scales the cross-section linearly along an axis (narrow one end, widen the other). */
  taper(options: TaperOptions = {}): CompoundShape {
    return this.mapRings(ring => taperPoints(ring, options));
  }

  /**
   * Free-form warp: `fn(p, uv)` receives a copy of each vertex and its normalized position `uv` (0..1) inside
   * the shape's bounds, and returns the new point. Edges are subdivided first (`densify`, default 6px).
   * Example: `shape.warp((p, uv) => ({ x: p.x + Math.sin(uv.y * 6) * 8, y: p.y }))`.
   */
  warp(fn: (p: Point, uv: Point) => Point | void, options: WarpOptions = {}): CompoundShape {
    const frame = this.bounds;
    return this.mapRings(ring => warpPoints(ring, true, frame, fn, options));
  }

  /** Rotates vertices progressively along an axis (0 at the min end, `angle` degrees at the max end). */
  twist(options: TwistOptions): CompoundShape {
    const frame = this.bounds;
    return this.mapRings(ring => twistPoints(ring, true, frame, options));
  }

  /** Swells (amount > 0) or pinches (amount < 0) the area around `center` with smooth radial falloff. */
  inflate(options: InflateOptions): CompoundShape {
    const frame = this.bounds;
    return this.mapRings(ring => inflatePoints(ring, true, frame, options));
  }

  /**
   * Mirror copy across a line. `axis: 'x'` reflects left <-> right across the vertical line x = `at`;
   * `axis: 'y'` reflects top <-> bottom across the horizontal line y = `at`. `at` defaults to the bounds center.
   * Returns a NEW shape (the original is untouched); custom anchors are mirrored too.
   * To get a symmetric whole instead of just the reflection, unite the shape with its flip.
   */
  flip(axis: 'x' | 'y' = 'x', at?: number): CompoundShape {
    const line = at ?? (axis === 'x' ? this.bounds.center.x : this.bounds.center.y);
    const flipped = new CompoundShape(this.liveRegions().map(region => ({
      // Reflection reverses winding; reverse each ring so orientation-sensitive operations keep working.
      outer: reflectPoints(region.outer, axis, line).reverse(),
      holes: region.holes.map(hole => reflectPoints(hole, axis, line).reverse()),
    })));
    return flipped.adoptAnchors(this, p => reflectPoints([p], axis, line)[0]);
  }

  // ==========================================
  // SHAPE <-> LINE
  // ==========================================

  /** The primary outer ring as a closed Path. Use `contours()` to include holes and islands. */
  perimeter(): Path {
    return createPath(clonePoints(this.liveRegions()[0]?.outer ?? []), true);
  }

  /** Every ring (outer rings and holes of all regions) as closed Paths. */
  contours(): Path[] {
    const out: Path[] = [];
    for (const region of this.liveRegions()) {
      out.push(createPath(clonePoints(region.outer), true));
      for (const hole of region.holes) out.push(createPath(clonePoints(hole), true));
    }
    return out;
  }

  /**
   * Turns the contour into filled geometry: a band of `width` around every ring.
   * The result is a regular shape: fill it, texture it, union it, clip with it.
   */
  outline(options: OutlineOptions = {}): CompoundShape {
    const width = options.width ?? 2;
    const half = width / 2;
    const position = options.position ?? 'center';
    const [d0, d1] = position === 'center' ? [-half, half] : position === 'outside' ? [0, width] : [-width, 0];
    const offsetOptions: OffsetOptions = { miterLimit: options.miterLimit };

    const bands: CompoundShape[] = [];
    for (const region of this.liveRegions()) {
      const rings: [Point[], boolean][] = [[region.outer, false], ...region.holes.map(h => [h, true] as [Point[], boolean])];
      for (const [ring, isHole] of rings) {
        if (ring.length < 3) continue;
        // Distances are measured away from the polygon interior; holes flip because their "outside" is inside the hole.
        const lo = isHole ? -d1 : d0;
        const hi = isHole ? -d0 : d1;
        const grown = new CompoundShape(offsetPolygon(ring, hi, offsetOptions));
        if (lo === 0) {
          bands.push(grown.subtract(ring));
          continue;
        }
        const shrunk = offsetPolygon(ring, lo, offsetOptions);
        const collapsed = lo < 0 && Math.sign(getPolygonSignedArea(shrunk)) !== Math.sign(getPolygonSignedArea(ring));
        bands.push(collapsed ? grown : grown.subtract(shrunk));
      }
    }
    if (bands.length === 0) return new CompoundShape([]);
    return bands.reduce((acc, band) => acc.union(band));
  }

  // ==========================================
  // RENDERING
  // ==========================================

  /** Linear or radial gradient fitted to this shape's bounds. */
  createGradient(ctx: CanvasRenderingContext2D, options: GradientOptions): CanvasGradient {
    const b = this.bounds;
    let grad: CanvasGradient;
    if (options.type === 'radial') {
      const center = options.center
        ? (typeof options.center === 'string' ? this.anchor(options.center) : options.center)
        : (options.from ? (typeof options.from === 'string' ? this.anchor(options.from) : options.from) : this.center);
      const outerCenter = options.to
        ? (typeof options.to === 'string' ? this.anchor(options.to) : options.to)
        : center;
      const r1 = options.r1 ?? 0;
      const maxRadius = Math.max(
        Math.hypot(b.minX - center.x, b.minY - center.y),
        Math.hypot(b.maxX - center.x, b.minY - center.y),
        Math.hypot(b.maxX - center.x, b.maxY - center.y),
        Math.hypot(b.minX - center.x, b.maxY - center.y)
      );
      const r2 = options.r2 ?? maxRadius;
      grad = ctx.createRadialGradient(center.x, center.y, r1, outerCenter.x, outerCenter.y, r2);
    } else {
      let p1: Point;
      let p2: Point;

      if (options.from && options.to) {
        p1 = typeof options.from === 'string' ? this.anchor(options.from) : options.from;
        p2 = typeof options.to === 'string' ? this.anchor(options.to) : options.to;
      } else {
        const dir = options.direction ?? 'vertical';
        if (dir === 'vertical') {
          p1 = this.anchor('top');
          p2 = this.anchor('bottom');
        } else if (dir === 'horizontal') {
          p1 = this.anchor('left');
          p2 = this.anchor('right');
        } else if (dir === 'diagonal') {
          p1 = this.anchor('topLeft');
          p2 = this.anchor('bottomRight');
        } else {
          const rad = (Number(dir) * Math.PI) / 180;
          const diag = Math.hypot(b.width, b.height) / 2;
          const cx = b.center.x;
          const cy = b.center.y;
          p1 = { x: cx - Math.cos(rad) * diag, y: cy - Math.sin(rad) * diag };
          p2 = { x: cx + Math.cos(rad) * diag, y: cy + Math.sin(rad) * diag };
        }
      }
      grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
    }

    for (const [stop, color] of options.stops) {
      grad.addColorStop(stop, color);
    }
    return grad;
  }

  /** Fills with the given paint (holes via even-odd). */
  fill(ctx: CanvasRenderingContext2D, fillStyle: Paint): this {
    const regions = this.liveRegions();
    if (!regions.some(region => region.outer.length >= 3)) return this;

    ctx.save();
    ctx.fillStyle = fillStyle;
    buildRegionPath(ctx, regions);
    ctx.fill('evenodd');
    ctx.restore();
    return this;
  }

  /** Runs `fn` with the context clipped to this shape. The clip is always restored. */
  clip(ctx: CanvasRenderingContext2D, fn: InsideCallback): this {
    const regions = this.liveRegions();
    if (!regions.some(region => region.outer.length >= 3)) return this;

    ctx.save();
    try {
      buildRegionPath(ctx, regions);
      ctx.clip('evenodd');
      fn(ctx, this);
    } finally {
      ctx.restore();
    }
    return this;
  }

  /** Strokes the contour with a StrokeStyle (or plain options). Position 'center' | 'inside' | 'outside'. */
  stroke(ctx: CanvasRenderingContext2D, strokeStyle?: StrokeStyle | StrokeOptions): this {
    const regions = this.liveRegions();
    if (!regions.some(region => region.outer.length >= 2)) return this;

    const style = strokeStyle instanceof StrokeStyle ? strokeStyle : new StrokeStyle(strokeStyle);
    renderPositionedStroke(ctx, regions, style);
    return this;
  }

  /**
   * Full pipeline: shadow, outside stroke, fill (optionally cel-shaded), textures, `inside` callback,
   * then center/inside stroke.
   */
  draw(ctx: CanvasRenderingContext2D, style?: ShapeStyle | ShapeStyleOptions): this {
    if (!style) return this;

    const fillVal = style.fill;
    const textureVal = style.texture;
    const strokeVal = style.stroke;
    const insideFn = style.inside;
    const shadowVal = style.shadow;
    const strokePos = style.strokePosition
      ?? (strokeVal instanceof StrokeStyle ? strokeVal.attrs.position : strokeVal?.position);
    const celVal = style.celShade;

    // 1. Shadow (single pass silhouette)
    if (shadowVal && shadowVal.color) {
      ctx.save();
      ctx.shadowColor = shadowVal.color;
      ctx.shadowBlur = shadowVal.blur ?? 0;
      ctx.shadowOffsetX = shadowVal.x ?? 0;
      ctx.shadowOffsetY = shadowVal.y ?? 0;
      if (fillVal || (celVal && celVal.shade)) {
        this.fill(ctx, shadowVal.color);
      } else if (strokeVal) {
        const strokeObj = strokeVal instanceof StrokeStyle ? strokeVal : new StrokeStyle(strokeVal);
        this.stroke(ctx, strokeObj.with({ position: strokePos, color: shadowVal.color }));
      }
      ctx.restore();
    }

    // 2. Outside stroke (before fill so the fill rests cleanly on top)
    if (strokeVal && strokePos === 'outside') {
      const strokeObj = strokeVal instanceof StrokeStyle ? strokeVal : new StrokeStyle(strokeVal);
      this.stroke(ctx, strokeObj.with({ position: 'outside' }));
    }

    // 3. Fill (with optional cel shading)
    if (celVal && celVal.shade) {
      this.fill(ctx, celVal.shade);

      const pivot = typeof celVal.lightPivot === 'string'
        ? this.anchor(celVal.lightPivot)
        : (celVal.lightPivot ?? this.anchor('topLeft'));

      let sx = 0.84;
      let sy = 0.80;
      if (typeof celVal.litScale === 'number') {
        sx = sy = celVal.litScale;
      } else if (celVal.litScale) {
        sx = celVal.litScale.x;
        sy = celVal.litScale.y;
      }

      if (fillVal) {
        const litShape = this.clone().scale(sx, sy, pivot);
        this.clip(ctx, () => {
          litShape.fill(ctx, fillVal);
        });
      }
    } else if (fillVal) {
      this.fill(ctx, fillVal);
    }

    // 4. Textures
    if (textureVal) {
      const list = Array.isArray(textureVal) ? textureVal : [textureVal];
      for (const tex of list) {
        if (tex && typeof tex.render === 'function') tex.render(ctx, this);
      }
    }

    // 5. Inside callback (clipped)
    if (insideFn) {
      this.clip(ctx, insideFn);
    }

    // 6. Center or inside stroke
    if (strokeVal && strokePos !== 'outside') {
      const strokeObj = strokeVal instanceof StrokeStyle ? strokeVal : new StrokeStyle(strokeVal);
      this.stroke(ctx, strokeObj.with({ position: strokePos }));
    }

    return this;
  }
}

/**
 * Shape made of one or more regions, each with optional holes.
 * Produced by booleans, offsets, deformations and `Path.close()`.
 */
export class CompoundShape extends Shape {
  private readonly _regions: PolygonRegion[];

  constructor(regions: PolygonRegion[]);
  constructor(points: Point[], holes?: Point[][]);
  constructor(regionsOrPoints: PolygonRegion[] | Point[], holes?: Point[][]) {
    super();
    const regions = isRegionArray(regionsOrPoints)
      ? regionsOrPoints
      : [{ outer: regionsOrPoints as Point[], holes: holes ?? [] }];
    this._regions = regions.map(region => ({
      outer: clonePoints(region.outer),
      holes: region.holes.map(clonePoints),
    }));
  }

  protected liveRegions(): PolygonRegion[] {
    return this._regions;
  }

  clone(): CompoundShape {
    return new CompoundShape(this._regions).adoptAnchors(this);
  }
}

function isRegionArray(value: PolygonRegion[] | Point[]): value is PolygonRegion[] {
  return value.length === 0 || 'outer' in value[0];
}

function buildRegionPath(ctx: CanvasRenderingContext2D, regions: PolygonRegion[]): void {
  ctx.beginPath();
  for (const region of regions) {
    addLoop(ctx, region.outer);
    for (const hole of region.holes) addLoop(ctx, hole);
  }
}

function addLoop(ctx: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length < 2) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
}

function renderPositionedStroke(ctx: CanvasRenderingContext2D, regions: PolygonRegion[], style: StrokeStyle): void {
  const position = style.attrs.position ?? 'center';
  const halfWidth = (style.width ?? 2) / 2;
  const distance = position === 'inside' ? -halfWidth : position === 'outside' ? halfWidth : 0;
  const renderStyle = style.with({ position: 'center' });
  for (const region of regions) {
    const outer = distance === 0 ? region.outer : offsetPolygon(region.outer, distance, { miterLimit: style.attrs.miterLimit });
    if (outer.length >= 2) renderStyle.render(ctx, outer, true);
    for (const hole of region.holes) {
      const contour = distance === 0 ? hole : offsetPolygon(hole, -distance, { miterLimit: style.attrs.miterLimit });
      if (contour.length >= 2) renderStyle.render(ctx, contour, true);
    }
  }
}
