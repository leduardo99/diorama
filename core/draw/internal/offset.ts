/**
 * @core/draw - Polygon Inset / Outset Offset Engine
 * 
 * Computes uniform parallel curve offsets (inset for d < 0, outset for d > 0)
 * using edge normal displacement and miter intersection with bevel clamping.
 */

import type { OffsetOptions, Point } from '../types.js';

/**
 * Calculates the signed area of a polygon using the Shoelace formula.
 * In screen coordinates (Y down):
 * - area > 0: Clockwise (CW)
 * - area < 0: Counter-Clockwise (CCW)
 */
export function getPolygonSignedArea(points: Point[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return sum * 0.5;
}

/**
 * Offsets a closed polygon by distance `d`:
 * - d > 0: Expands outward (outset)
 * - d < 0: Shrinks inward (inset)
 */
export function offsetPolygon(points: Point[], distance: number, options: OffsetOptions = {}): Point[] {
  const n = points.length;
  if (n < 3 || Math.abs(distance) < 0.001) {
    return points.map(p => ({ x: p.x, y: p.y }));
  }

  const miterLimit = options.miterLimit ?? 2.5;
  const isCW = getPolygonSignedArea(points) > 0;

  // 1. Calculate edge vectors and outward unit normals
  const edges: {
    p1: Point;
    p2: Point;
    dx: number;
    dy: number;
    len: number;
    nx: number;
    ny: number;
  }[] = [];

  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);

    if (len < 0.0001) {
      // Degenerate edge
      edges.push({ p1, p2, dx: 1, dy: 0, len: 1, nx: 0, ny: 1 });
      continue;
    }

    // Outward normal based on polygon winding order (in screen coordinates Y-down, left of CW tangent is (dy, -dx))
    const nx = isCW ? dy / len : -dy / len;
    const ny = isCW ? -dx / len : dx / len;

    edges.push({ p1, p2, dx, dy, len, nx, ny });
  }

  // 2. Intersect adjacent offset lines
  const result: Point[] = [];

  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n;
    const e1 = edges[prevIdx];
    const e2 = edges[i];

    // Shifted endpoints
    const p1A = { x: e1.p1.x + e1.nx * distance, y: e1.p1.y + e1.ny * distance };
    const p1B = { x: e1.p2.x + e1.nx * distance, y: e1.p2.y + e1.ny * distance };

    const p2A = { x: e2.p1.x + e2.nx * distance, y: e2.p1.y + e2.ny * distance };
    const p2B = { x: e2.p2.x + e2.nx * distance, y: e2.p2.y + e2.ny * distance };

    // Line 1: p1A + t * (e1.dx, e1.dy)
    // Line 2: p2A + u * (e2.dx, e2.dy)
    const d1x = e1.dx;
    const d1y = e1.dy;
    const d2x = e2.dx;
    const d2y = e2.dy;

    const denom = d1x * d2y - d1y * d2x;

    if (Math.abs(denom) < 0.0001) {
      // Parallel or collinear edges: average the shifted points
      result.push({
        x: (p1B.x + p2A.x) * 0.5,
        y: (p1B.y + p2A.y) * 0.5,
      });
      continue;
    }

    const diffX = p2A.x - p1A.x;
    const diffY = p2A.y - p1A.y;
    const t = (diffX * d2y - diffY * d2x) / denom;

    const ix = p1A.x + t * d1x;
    const iy = p1A.y + t * d1y;

    // Check miter distance from original vertex
    const origP = points[i];
    const miterDist = Math.hypot(ix - origP.x, iy - origP.y);
    const maxDist = Math.abs(distance) * miterLimit;

    if (miterDist > maxDist && maxDist > 0.001) {
      // Clamp / bevel the spike
      const scale = maxDist / miterDist;
      result.push({
        x: origP.x + (ix - origP.x) * scale,
        y: origP.y + (iy - origP.y) * scale,
      });
    } else {
      result.push({ x: ix, y: iy });
    }
  }

  return result;
}
