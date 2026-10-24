/**
 * @core/draw - Polygon Class & Parametric Geometry
 * 
 * Class-based parametric shape representation extending Shape.
 * Provides static factories for standard geometric forms (regular, triangle, diamond, rect, circle, star).
 */

import { createNoise2D } from '../../noise.js';
import type {
  Point,
  PolygonOptions,
  RectOptions,
  CircleOptions,
  EllipseOptions,
  WobbleOptions,
  StarOptions,
  CrescentOptions,
  LobeDefinition,
  LobesOptions,
  StemOptions,
} from '../types.js';
import { Shape, type PolygonRegion } from './shape.js';
import { filletPoints } from '../internal/fillet.js';
import { computeBoundingBox } from '../internal/geometry.js';
import { clonePoints } from '../internal/points.js';
import { strokeRing } from '../internal/stroker.js';

/** A closed, fillable polygon, built from points or from a parametric constructor such as `Polygon.rect`. */
export class Polygon extends Shape {
  private _points: Point[];

  constructor(attrsOrPoints: PolygonOptions | Point[]) {
    super();
    if (Array.isArray(attrsOrPoints)) {
      this._points = clonePoints(attrsOrPoints);
    } else {
      this._points = generatePolygonPoints(attrsOrPoints);
    }
  }

  protected liveRegions(): PolygonRegion[] {
    return [{ outer: this._points, holes: [] }];
  }

  clone(): Polygon {
    return new Polygon(clonePoints(this._points)).adoptAnchors(this);
  }

  /**
   * Applies circular arc filleting to all corners of this polygon.
   * Works on any polygon, including those generated from arbitrary points.
   */
  override roundCorners(radius: number | number[], stepsPerCorner = 4): Polygon {
    const rounded = filletPoints(this._points, radius, true, stepsPerCorner);
    return new Polygon(rounded);
  }

  // ==========================================
  // STATIC PARAMETRIC FACTORIES
  // ==========================================

  /**
   * Instantiates a Polygon from arbitrary polyline/polygon points.
   * Supports optional center offset, rotation, corner rounding, and wobble.
   * `rotation` turns the points around the origin (0, 0), not around the shape. To turn a shape in place,
   * call `.rotate(degrees, pivot)` on the result.
   */
  static fromPoints(points: Point[], attrs: Partial<PolygonOptions> = {}): Polygon {
    let pts = points;
    if (attrs.center !== undefined || attrs.cx !== undefined || attrs.cy !== undefined || attrs.rotation !== undefined) {
      const cx = attrs.center?.x ?? attrs.cx ?? 0;
      const cy = attrs.center?.y ?? attrs.cy ?? 0;
      const rotRad = ((attrs.rotation ?? 0) * Math.PI) / 180;
      pts = pts.map(p => rotateAndTranslate(p, rotRad, cx, cy));
    }
    const bounds = computeBoundingBox(pts);
    const minDim = Math.max(1, Math.min(bounds.width, bounds.height));
    const rFactor = attrs.roundness ?? (attrs.radius !== undefined ? (attrs.radius < 1.0 ? attrs.radius : attrs.radius / minDim) : 0);
    if (rFactor > 0) {
      pts = applyCornerRounding(pts, rFactor);
    }
    if (attrs.wobble) {
      pts = applyPolygonWobble(pts, attrs.wobble, attrs.seed ?? 101);
    }
    return new Polygon(pts);
  }

  /**
   * Regular N-sided equilateral polygon (e.g. 3 = triangle, 5 = pentagon, 6 = hexagon).
   */
  static regular(sides: number, radius: number, attrs: Partial<PolygonOptions> = {}): Polygon {
    const { radius: attrR, center, ...restAttrs } = attrs;
    const cx = center?.x ?? attrs.cx ?? 0;
    const cy = center?.y ?? attrs.cy ?? 0;
    // attrR is corner radius if passed in options; convert to proportional roundness:
    const effRoundness = attrs.roundness ?? (attrR !== undefined ? (attrR < 1.0 ? attrR : attrR / (radius * 2)) : undefined);
    return new Polygon({
      sides,
      radius,
      cx,
      cy,
      ...restAttrs,
      roundness: effRoundness,
    });
  }

  /**
   * Parametric isosceles triangle with explicit base width and height. Shapes are y-down,
   * and the triangle is centred on its centroid (not on its bounding box) at `cx`, `cy` (default
   * the origin): the apex points up on screen at (0, -2h/3), the base runs at y = +h/3 from
   * (-base/2) to (+base/2). So `triangle(12, 18)` spans x -6..6 and y -12..6 (bounds centre at
   * y = -h/6). `rotation` (degrees) turns it clockwise on screen around the centroid. To stand
   * the apex on the origin, translate by (0, 2h/3); for a point-down triangle use `.flip('y', 0)`.
   * Rounded corners (`roundness`, `radius`) pull the points in, so those bounds are smaller.
   */
  static triangle(base: number, height: number, attrs: Partial<PolygonOptions> = {}): Polygon {
    const cx = attrs.center?.x ?? attrs.cx ?? 0;
    const cy = attrs.center?.y ?? attrs.cy ?? 0;
    const rotRad = ((attrs.rotation ?? 0) * Math.PI) / 180;

    const raw: Point[] = [
      { x: 0, y: -height * (2 / 3) },
      { x: base / 2, y: height * (1 / 3) },
      { x: -base / 2, y: height * (1 / 3) },
    ];

    const transformed = raw.map(p => rotateAndTranslate(p, rotRad, cx, cy));
    const rFactor = attrs.roundness ?? (attrs.radius !== undefined ? (attrs.radius < 1.0 ? attrs.radius : attrs.radius / Math.min(base, height)) : 0);
    const rounded = (rFactor && rFactor > 0)
      ? applyCornerRounding(transformed, rFactor)
      : transformed;

    const finalPts = attrs.wobble
      ? applyPolygonWobble(rounded, attrs.wobble, attrs.seed ?? 102)
      : rounded;

    return new Polygon(finalPts);
  }

  /**
   * Parametric Diamond / Rhombus with explicit width and height.
   */
  static diamond(width: number, height: number, attrs: Partial<PolygonOptions> = {}): Polygon {
    const cx = attrs.center?.x ?? attrs.cx ?? 0;
    const cy = attrs.center?.y ?? attrs.cy ?? 0;
    const hw = width / 2;
    const hh = height / 2;
    const rotRad = ((attrs.rotation ?? 0) * Math.PI) / 180;

    const raw: Point[] = [
      { x: 0, y: -hh },
      { x: hw, y: 0 },
      { x: 0, y: hh },
      { x: -hw, y: 0 },
    ];

    const transformed = raw.map(p => rotateAndTranslate(p, rotRad, cx, cy));
    const rFactor = attrs.roundness ?? (attrs.radius !== undefined ? (attrs.radius < 1.0 ? attrs.radius : attrs.radius / Math.min(width, height)) : 0);
    const rounded = (rFactor && rFactor > 0)
      ? applyCornerRounding(transformed, rFactor)
      : transformed;

    const finalPts = attrs.wobble
      ? applyPolygonWobble(rounded, attrs.wobble, attrs.seed ?? 103)
      : rounded;

    return new Polygon(finalPts);
  }

  /**
   * Parametric Star with outer point radius and inner valley radius.
   * Can be called with (points, outerRadius, innerRadius?, options?)
   * or (points, outerRadius, options?) omitting innerRadius.
   * Supports concave/convex edge curvature via options.bulge.
   */
  static star(
    points: number,
    outerRadius: number,
    innerRadiusOrAttrs?: number | Partial<StarOptions>,
    attrs?: Partial<StarOptions>
  ): Polygon {
    let rIn: number;
    let actualAttrs: Partial<StarOptions>;

    if (typeof innerRadiusOrAttrs === 'object' && innerRadiusOrAttrs !== null) {
      actualAttrs = innerRadiusOrAttrs;
      rIn = actualAttrs.innerRadius ?? outerRadius * 0.45;
    } else {
      rIn = (typeof innerRadiusOrAttrs === 'number' ? innerRadiusOrAttrs : undefined) ?? outerRadius * 0.45;
      actualAttrs = attrs ?? {};
    }

    const { radius: attrR, ...restAttrs } = actualAttrs;
    const effRoundness = actualAttrs.roundness ?? (attrR !== undefined ? (attrR < 1.0 ? attrR : attrR / (outerRadius * 2)) : undefined);

    return new Polygon({
      sides: Math.max(3, points),
      radius: outerRadius,
      innerRadius: rIn,
      ...restAttrs,
      roundness: effRoundness,
    } as any);
  }

  /**
   * Parametric Crescent Moon shape with outer radius, central thickness, and sharp cusps.
   */
  static crescent(radius: number, thickness: number, options: CrescentOptions = {}): Polygon {
    const arcAngleDeg = options.arcAngle ?? 180;
    const arcAngleRad = (arcAngleDeg * Math.PI) / 180;
    const segs = Math.max(8, options.segments ?? 36);

    const outerPts: Point[] = [];
    const innerPts: Point[] = [];

    // Outer arc: from -arcAngleRad/2 to +arcAngleRad/2
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const ang = -arcAngleRad / 2 + arcAngleRad * t;
      outerPts.push({
        x: Math.cos(ang) * radius,
        y: Math.sin(ang) * radius,
      });
    }

    // Inner arc: returns from +arcAngleRad/2 down to -arcAngleRad/2
    for (let s = segs; s >= 0; s--) {
      const t = s / segs;
      const ang = -arcAngleRad / 2 + arcAngleRad * t;
      const effThick = thickness * Math.sin(t * Math.PI);
      const innerR = Math.max(0, radius - effThick);
      innerPts.push({
        x: Math.cos(ang) * innerR,
        y: Math.sin(ang) * innerR,
      });
    }

    const allPts = [...outerPts, ...innerPts];
    const { arcAngle: _, segments: __, ...polyOpts } = options;
    return Polygon.fromPoints(allPts, polyOpts);
  }

  /**
   * Generates a continuous organic envelope enclosing multiple ellipse lobes (clouds, bushes, slime)
   * via analytical raycasting from the barycenter without sharp CSG boolean seams.
   */
  static lobes(lobes: LobeDefinition[], options: LobesOptions = {}): Polygon {
    if (lobes.length === 0) return new Polygon([]);

    const numLobes = lobes.length;
    let sumX = 0, sumY = 0;
    for (const l of lobes) {
      sumX += l.cx;
      sumY += l.cy;
    }
    const baryX = sumX / numLobes;
    const baryY = sumY / numLobes;

    const segs = options.segments ?? 96;
    const pts: Point[] = [];

    for (let k = 0; k < segs; k++) {
      const theta = (k * Math.PI * 2) / segs;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      let rMax = 0;

      for (let j = 0; j < numLobes; j++) {
        const lobe = lobes[j];
        const x0 = lobe.cx;
        const y0 = lobe.cy;
        const rx = lobe.rx;
        const ry = lobe.ry ?? rx;

        if (rx <= 0 || ry <= 0) continue;

        const dx = baryX - x0;
        const dy = baryY - y0;

        const rxSq = rx * rx;
        const rySq = ry * ry;

        const A = (cosT * cosT) / rxSq + (sinT * sinT) / rySq;
        const B = 2 * ((dx * cosT) / rxSq + (dy * sinT) / rySq);
        const C = (dx * dx) / rxSq + (dy * dy) / rySq - 1;

        const disc = B * B - 4 * A * C;
        if (disc >= 0 && A > 0) {
          const sqrtD = Math.sqrt(disc);
          const t1 = (-B + sqrtD) / (2 * A);
          const t2 = (-B - sqrtD) / (2 * A);
          const tMax = Math.max(t1, t2);
          if (tMax > rMax) {
            rMax = tMax;
          }
        }
      }

      if (rMax > 0) {
        pts.push({
          x: baryX + cosT * rMax,
          y: baryY + sinT * rMax,
        });
      }
    }

    const { segments: _, ...polyOpts } = options;
    return Polygon.fromPoints(pts, polyOpts);
  }

  /**
   * Parametric tapered stem, horn, or vine with quadratic curve and wind sway.
   * `base` is where the stem attaches. To turn a stem around its attachment point, use
   * `Polygon.stem(base, height).rotate(degrees, base)`. The `rotation` option pivots on the origin.
   */
  static stem(base: Point, height: number, options: StemOptions = {}): Polygon {
    const sway = options.sway ?? 0;
    const pBase = base;
    const pTop = { x: base.x + sway, y: base.y - height };
    const pCtrl = { x: base.x + sway * 0.4, y: base.y - height * 0.5 };
    const segs = options.segments ?? 16;

    const curvePts: Point[] = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const inv = 1 - t;
      curvePts.push({
        x: inv * inv * pBase.x + 2 * inv * t * pCtrl.x + t * t * pTop.x,
        y: inv * inv * pBase.y + 2 * inv * t * pCtrl.y + t * t * pTop.y,
      });
    }

    const baseW = options.baseWidth ?? 8;
    const topW = options.topWidth ?? 1.5;
    const ribbonPts = strokeRing(curvePts, { start: baseW, end: topW });

    const { sway: _, baseWidth: __, topWidth: ___, segments: ____, ...polyOpts } = options;
    return Polygon.fromPoints(ribbonPts, polyOpts);
  }

  /**
   * Parametric Rectangle with individual corner radii and wobble support.
   * Supports both explicit pixel radii (>= 1.0) and proportional factors (< 1.0).
   */
  static rect(width: number, height: number, attrs: Partial<RectOptions> = {}): Polygon {
    const cx = attrs.cx ?? 0;
    const cy = attrs.cy ?? 0;
    const rotRad = ((attrs.rotation ?? 0) * Math.PI) / 180;
    const minDimHalf = Math.min(width, height) / 2;

    let bTL = 0, bTR = 0, bBR = 0, bBL = 0;
    if (typeof attrs.bevel === 'number') {
      const b = (attrs.bevel > 0 && attrs.bevel < 1.0) ? attrs.bevel * minDimHalf : attrs.bevel;
      bTL = bTR = bBR = bBL = b;
    } else if (Array.isArray(attrs.bevel)) {
      [bTL, bTR, bBR, bBL] = attrs.bevel.map(b => (b > 0 && b < 1.0) ? b * minDimHalf : b);
    }

    let rTL = 0, rTR = 0, rBR = 0, rBL = 0;
    if (typeof attrs.radius === 'number') {
      const r = (attrs.radius > 0 && attrs.radius < 1.0) ? attrs.radius * minDimHalf : attrs.radius;
      rTL = rTR = rBR = rBL = r;
    } else if (Array.isArray(attrs.radius)) {
      [rTL, rTR, rBR, rBL] = attrs.radius.map(r => (r > 0 && r < 1.0) ? r * minDimHalf : r);
    }

    const maxR = minDimHalf;
    rTL = Math.min(rTL, maxR);
    rTR = Math.min(rTR, maxR);
    rBR = Math.min(rBR, maxR);
    rBL = Math.min(rBL, maxR);

    bTL = Math.min(bTL, maxR);
    bTR = Math.min(bTR, maxR);
    bBR = Math.min(bBR, maxR);
    bBL = Math.min(bBL, maxR);

    const hasBevel = bTL > 0 || bTR > 0 || bBR > 0 || bBL > 0;

    const hw = width / 2;
    const hh = height / 2;
    const pts: Point[] = [];

    if (hasBevel) {
      // 45-degree flat beveled / chamfered corners (chiseled stone / shield cut)
      pts.push({ x: -hw + bTL, y: -hh });
      pts.push({ x: hw - bTR, y: -hh });
      if (bTR > 0) pts.push({ x: hw, y: -hh + bTR });

      pts.push({ x: hw, y: hh - bBR });
      if (bBR > 0) pts.push({ x: hw - bBR, y: hh });

      pts.push({ x: -hw + bBL, y: hh });
      if (bBL > 0) pts.push({ x: -hw, y: hh - bBL });

      if (bTL > 0) {
        pts.push({ x: -hw, y: -hh + bTL });
      }
    } else {
      // Top edge
      pts.push({ x: -hw + rTL, y: -hh });
      pts.push({ x: hw - rTR, y: -hh });

      // Top-right corner
      if (rTR > 0) {
        addCornerArc(pts, hw - rTR, -hh + rTR, rTR, -Math.PI / 2, 0);
      }

      // Right edge
      pts.push({ x: hw, y: hh - rBR });

      // Bottom-right corner
      if (rBR > 0) {
        addCornerArc(pts, hw - rBR, hh - rBR, rBR, 0, Math.PI / 2);
      }

      // Bottom edge
      pts.push({ x: -hw + rBL, y: hh });

      // Bottom-left corner
      if (rBL > 0) {
        addCornerArc(pts, -hw + rBL, hh - rBL, rBL, Math.PI / 2, Math.PI);
      }

      // Left edge & Top-left corner
      if (rTL > 0) {
        pts.push({ x: -hw, y: -hh + rTL });
        // Arc stops before (-hw + rTL, -hh) to avoid duplicating pts[0]
        const range = (Math.PI * 3) / 2 - Math.PI;
        const steps = 4;
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const a = Math.PI + range * t;
          pts.push({
            x: -hw + rTL + Math.cos(a) * rTL,
            y: -hh + rTL + Math.sin(a) * rTL,
          });
        }
      }
    }

    const transformed = pts.map(p => rotateAndTranslate(p, rotRad, cx, cy));
    const finalPts = attrs.wobble
      ? applyPolygonWobble(transformed, attrs.wobble, attrs.seed ?? 104)
      : transformed;

    return new Polygon(finalPts);
  }

  /**
   * Parametric Circle with optional simplex noise wobble.
   */
  static circle(radius: number, attrs: Partial<CircleOptions> = {}): Polygon {
    const segs = attrs.segments ?? 36;
    const cx = attrs.cx ?? 0;
    const cy = attrs.cy ?? 0;

    const pts: Point[] = [];
    const step = (Math.PI * 2) / segs;
    for (let i = 0; i < segs; i++) {
      const ang = i * step;
      pts.push({
        x: cx + Math.cos(ang) * radius,
        y: cy + Math.sin(ang) * radius,
      });
    }

    const finalPts = attrs.wobble
      ? applyPolygonWobble(pts, attrs.wobble, attrs.seed ?? 105)
      : pts;

    return new Polygon(finalPts);
  }

  /**
   * Parametric Ellipse with rx, ry and rotation.
   */
  static ellipse(rx: number, ry: number, attrs: Partial<EllipseOptions> = {}): Polygon {
    const segs = attrs.segments ?? 36;
    const cx = attrs.cx ?? 0;
    const cy = attrs.cy ?? 0;
    const rotRad = ((attrs.rotation ?? 0) * Math.PI) / 180;

    const pts: Point[] = [];
    const step = (Math.PI * 2) / segs;
    for (let i = 0; i < segs; i++) {
      const ang = i * step;
      const rawP = {
        x: Math.cos(ang) * rx,
        y: Math.sin(ang) * ry,
      };
      pts.push(rotateAndTranslate(rawP, rotRad, cx, cy));
    }

    const finalPts = attrs.wobble
      ? applyPolygonWobble(pts, attrs.wobble, attrs.seed ?? 106)
      : pts;

    return new Polygon(finalPts);
  }

  /**
   * Parametric Capsule / Pill shape.
   */
  static capsule(width: number, height: number, attrs: Partial<RectOptions> = {}): Polygon {
    const radius = Math.min(width, height) / 2;
    return Polygon.rect(width, height, {
      radius,
      ...attrs,
    });
  }
}

// ==========================================
// GEOMETRIC ALGORITHMIC FUNCTIONS
// ==========================================

function generatePolygonPoints(options: PolygonOptions): Point[] {
  const sides = Math.max(3, Math.floor(options.sides ?? 3));
  const rOuter = options.radius ?? 50;
  const rInner = options.innerRadius;
  const cx = options.cx ?? 0;
  const cy = options.cy ?? 0;
  const rotDeg = options.rotation ?? 0;
  const rotRad = (rotDeg * Math.PI) / 180;
  const roundness = Math.max(0, Math.min(0.5, options.roundness ?? 0));

  const totalVertices = rInner !== undefined ? sides * 2 : sides;
  const angleStep = (Math.PI * 2) / totalVertices;

  const baseVertices: Point[] = [];
  for (let i = 0; i < totalVertices; i++) {
    const angle = rotRad - Math.PI / 2 + i * angleStep;
    const r = (rInner !== undefined && i % 2 === 1) ? rInner : rOuter;
    baseVertices.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    });
  }

  let rawVertices = baseVertices;
  const starBulge = (options as StarOptions).bulge;
  if (starBulge && Math.abs(starBulge) > 0.001) {
    const bulged: Point[] = [];
    const n = baseVertices.length;
    const stepsPerEdge = 4;
    for (let i = 0; i < n; i++) {
      const p1 = baseVertices[i];
      const p2 = baseVertices[(i + 1) % n];
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      // Inward normal pointing toward center (cx, cy)
      const toCenterX = cx - mx;
      const toCenterY = cy - my;
      const centerDist = Math.hypot(toCenterX, toCenterY);
      const nx = centerDist > 0.0001 ? toCenterX / centerDist : 0;
      const ny = centerDist > 0.0001 ? toCenterY / centerDist : 0;

      const disp = starBulge * dist * 0.5;
      const cpX = mx + nx * disp;
      const cpY = my + ny * disp;

      bulged.push(p1);
      for (let s = 1; s < stepsPerEdge; s++) {
        const t = s / stepsPerEdge;
        const inv = 1 - t;
        bulged.push({
          x: inv * inv * p1.x + 2 * inv * t * cpX + t * t * p2.x,
          y: inv * inv * p1.y + 2 * inv * t * cpY + t * t * p2.y,
        });
      }
    }
    rawVertices = bulged;
  }

  const roundedVertices = roundness > 0
    ? applyCornerRounding(rawVertices, roundness)
    : rawVertices;

  if (options.wobble) {
    return applyPolygonWobble(roundedVertices, options.wobble, options.seed ?? 101);
  }

  return roundedVertices;
}

function rotateAndTranslate(p: Point, rad: number, cx: number, cy: number): Point {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos,
  };
}

function addCornerArc(
  pts: Point[],
  centerArcX: number,
  centerArcY: number,
  arcR: number,
  startAng: number,
  endAng: number,
  steps = 4
) {
  const range = endAng - startAng;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const a = startAng + range * t;
    pts.push({
      x: centerArcX + Math.cos(a) * arcR,
      y: centerArcY + Math.sin(a) * arcR,
    });
  }
}

function applyCornerRounding(vertices: Point[], roundFactor: number): Point[] {
  const n = vertices.length;
  if (n < 3 || roundFactor <= 0) return vertices;

  let totalLen = 0;
  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % n];
    totalLen += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  const avgLen = totalLen / n;
  const radius = avgLen * roundFactor;
  return filletPoints(vertices, radius, true, 4);
}


function sanitizePolygonVertices(vertices: Point[]): Point[] {
  const n = vertices.length;
  if (n < 3) return vertices;

  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const curr = vertices[i];
    const prev = result[result.length - 1];
    if (!prev || Math.hypot(curr.x - prev.x, curr.y - prev.y) > 0.001) {
      result.push(curr);
    }
  }

  // Strip closing duplicate if present
  if (result.length > 2) {
    const first = result[0];
    const last = result[result.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) <= 0.001) {
      result.pop();
    }
  }

  return result;
}

function applyPolygonWobble(
  rawVertices: Point[],
  wobbleOption: WobbleOptions | boolean,
  seed: number
): Point[] {
  const vertices = sanitizePolygonVertices(rawVertices);
  const n = vertices.length;
  if (n < 2) return vertices;

  const opt: WobbleOptions = typeof wobbleOption === 'object' ? wobbleOption : {};
  const baseAmp = opt.amplitude ?? 2.0;
  const noiseSeed = opt.seed ?? seed;
  const noise2D = createNoise2D(noiseSeed);
  const freq = opt.frequency ?? 1.8;
  const style = opt.style ?? 'smooth';

  // 1. CHISELED / FACETED: Straight planar segments with noisy angular corners (chiseled stone/wood)
  if (style === 'chiseled') {
    const targetStep = opt.segmentLength ?? 16.0;
    const chiseledPts: Point[] = [];

    for (let i = 0; i < n; i++) {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % n];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);

      chiseledPts.push(p1);
      if (len > targetStep) {
        const sub = Math.ceil(len / targetStep);
        for (let s = 1; s < sub; s++) {
          const t = s / sub;
          chiseledPts.push({
            x: p1.x + dx * t,
            y: p1.y + dy * t,
          });
        }
      }
    }

    const total = chiseledPts.length;
    let totalPerim = 0;
    for (let i = 0; i < total; i++) {
      const pNext = chiseledPts[(i + 1) % total];
      totalPerim += Math.hypot(pNext.x - chiseledPts[i].x, pNext.y - chiseledPts[i].y);
    }

    const result: Point[] = [];
    let curDist = 0;

    for (let i = 0; i < total; i++) {
      const prev = chiseledPts[(i - 1 + total) % total];
      const curr = chiseledPts[i];
      const next = chiseledPts[(i + 1) % total];

      if (i > 0) curDist += Math.hypot(curr.x - prev.x, curr.y - prev.y);

      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const tLen = Math.hypot(tx, ty);
      let nx = 0, ny = 0;
      if (tLen > 0.0001) {
        nx = -ty / tLen;
        ny =  tx / tLen;
      }

      const angle = (curDist / Math.max(1, totalPerim)) * Math.PI * 2;
      const sampleX = Math.cos(angle) * freq;
      const sampleY = Math.sin(angle) * freq;

      const offset = noise2D(sampleX, sampleY) * baseAmp;

      result.push({
        x: curr.x + nx * offset,
        y: curr.y + ny * offset,
      });
    }

    return result;
  }

  // 2. STEPPED: Orthogonal / stepped jagged cuts
  if (style === 'stepped') {
    const targetStep = opt.segmentLength ?? 18.0;
    const result: Point[] = [];

    for (let i = 0; i < n; i++) {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % n];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);

      const nx = len > 0 ? -dy / len : 0;
      const ny = len > 0 ?  dx / len : 0;

      const steps = Math.max(1, Math.round(len / targetStep));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const nextT = (s + 1) / steps;
        const midT = (t + nextT) / 2;

        const noiseVal = noise2D(p1.x * 0.03 + s * 1.5, p1.y * 0.03 + s * 1.5) * baseAmp;

        result.push({
          x: p1.x + dx * t,
          y: p1.y + dy * t,
        });
        result.push({
          x: p1.x + dx * midT + nx * noiseVal,
          y: p1.y + dy * midT + ny * noiseVal,
        });
      }
    }

    return result;
  }

  // 3. SMOOTH WOBBLE (default): Dense continuous simplex wave
  const dense: Point[] = [];
  const targetStepDist = 6.0;

  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);

    dense.push(p1);
    if (len > targetStepDist) {
      const sub = Math.ceil(len / targetStepDist);
      for (let s = 1; s < sub; s++) {
        const t = s / sub;
        dense.push({
          x: p1.x + dx * t,
          y: p1.y + dy * t,
        });
      }
    }
  }

  const totalPoints = dense.length;
  if (totalPoints < 3) return vertices;

  const result: Point[] = [];
  let totalPerimeter = 0;
  for (let i = 0; i < totalPoints; i++) {
    const pNext = dense[(i + 1) % totalPoints];
    totalPerimeter += Math.hypot(pNext.x - dense[i].x, pNext.y - dense[i].y);
  }

  let currentDist = 0;
  for (let i = 0; i < totalPoints; i++) {
    const prev = dense[(i - 1 + totalPoints) % totalPoints];
    const curr = dense[i];
    const next = dense[(i + 1) % totalPoints];

    if (i > 0) {
      currentDist += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    }

    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tLen = Math.hypot(tx, ty);
    let nx = 0, ny = 0;
    if (tLen > 0.0001) {
      nx = -ty / tLen;
      ny =  tx / tLen;
    }

    const angle = (currentDist / Math.max(1, totalPerimeter)) * Math.PI * 2;
    const sampleX = Math.cos(angle) * freq;
    const sampleY = Math.sin(angle) * freq;

    const offset = noise2D(sampleX, sampleY) * baseAmp;

    result.push({
      x: curr.x + nx * offset,
      y: curr.y + ny * offset,
    });
  }

  return result;
}
