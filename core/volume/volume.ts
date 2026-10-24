/**
 * @core/volume - Volumes
 *
 * 3D solids built in the 2.5D world and drawn through `@core/draw`: every projected part
 * becomes a `@core/draw` `Shape`, so palette ramps, strokes, textures and `inside` callbacks from
 * the project theme apply unchanged. Light and depth come from the `Camera`.
 */

import {
  CompoundShape,
  Path,
  Polygon,
  Shape,
  ShapeStyle,
  StrokeStyle,
  lerpColor,
  type InsideCallback,
  type Point,
  type RibbonWidth,
  type ShadowOptions,
  type ShapeStyleOptions,
  type StrokeOptions,
  type Texture,
} from '../draw/index.js';
import type { Camera } from './camera.js';
import { Frame3 } from './frame.js';
import { add3, cross3, dot3, len3, mix3, norm3, scale3, sub3, UP, vec3, type Vec3 } from './vec3.js';

/** A width that follows a part's thickness: `ratio` of it, kept within [min, max] world units. */
export interface FormWidth {
  ratio: number;
  min: number;
  max: number;
}

/**
 * How round volumes (rounds, tubes, blobs) show their form. Every band is a crescent: the
 * silhouette minus itself shifted along the light, so a finger and a torso both get a readable
 * shadow (a shadow proportional to size vanishes on small parts).
 */
export interface FormShading {
  /** Core shadow (ramp dark) on the side away from the light. */
  core?: FormWidth;
  /** Highlight (ramp lit) along the edge facing the light; `false` for none (matte cloth). */
  highlight?: FormWidth | false;
  /** Reflected light: a thin sliver of `color` along the edge inside the core shadow. */
  rim?: { color: string; width: number } | false;
}

/** Engine defaults: three readable tones on every round part. Themes override per material. */
export const FORM_DEFAULTS: Required<FormShading> = {
  core: { ratio: 0.3, min: 1, max: 3.6 },
  highlight: { ratio: 0.14, min: 0.45, max: 1.4 },
  rim: false,
};

function regionArea(points: Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Thickness of a projected part: 2·area / perimeter (a ribbon's width, a disc's radius). */
function thickness(shape: Shape): number {
  let area = 0;
  let perimeter = 0;
  for (const r of shape.regions) {
    const pts = r.outer;
    area += regionArea(pts);
    for (let i = 0; i < pts.length; i++) perimeter += Math.hypot(pts[(i + 1) % pts.length].x - pts[i].x, pts[(i + 1) % pts.length].y - pts[i].y);
  }
  return perimeter > 0 ? (2 * area) / perimeter : 0;
}

function formWidth(w: FormWidth, shape: Shape, cam: Camera): number {
  return Math.max(w.min * cam.scale, Math.min(w.max * cam.scale, thickness(shape) * w.ratio));
}

/**
 * Adds a shape's rings to the current canvas path, outer rings with positive area and holes
 * negative (so a nonzero fill or clip of several shapes is their union); `reverse` flips all of
 * them (a shape cut out of an enclosing rectangle); `dx`, `dy` offset the copy.
 */
function trace(ctx: CanvasRenderingContext2D, shape: Shape, reverse = false, dx = 0, dy = 0): void {
  for (const r of shape.regions) {
    [r.outer, ...r.holes].forEach((ring, k) => {
      if (ring.length < 3) return;
      let a = 0;
      for (let i = 0; i < ring.length; i++) a += ring[i].x * ring[(i + 1) % ring.length].y - ring[(i + 1) % ring.length].x * ring[i].y;
      const wantPositive = (k === 0) !== reverse;
      const pts = (a > 0) === wantPositive ? ring : ring.slice().reverse();
      ctx.moveTo(pts[0].x + dx, pts[0].y + dy);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + dx, pts[i].y + dy);
      ctx.closePath();
    });
  }
}

/**
 * Paints round parts as one mass, with canvas clipping only (polygon booleans are far too slow
 * for every part of every frame):
 * 1. the outline, twice as wide, under the fills: its inner half is covered, so the line sits
 *    outside the form, the bands stay visible, and inside a blob the parts cover each other's lines;
 * 2. every part in the dark tone; 3. clipped to the union, each part shifted towards the light
 *    in the base tone (the core shadow is what stays dark);
 * 4. the highlight (and rim) of each part: the part minus itself shifted, filled even-odd, and
 *    kept out of the other parts so no lit seam shows in the middle of a mass.
 */
function paintForm(ctx: CanvasRenderingContext2D, cam: Camera, parts: Shape[], style: VolumeStyle, union: () => Shape = () => parts[0]): void {
  const form = { ...FORM_DEFAULTS, ...style.form };
  const l = cam.lightOnScreen;
  const stroke = strokeStyleOf(style.stroke);
  if (stroke) for (const p of parts) p.stroke(ctx, stroke.with({ width: (stroke.width ?? 1) * 2 }));
  for (const p of parts) p.draw(ctx, { fill: style.ramp.dark, shadow: style.shadow });
  ctx.save();
  ctx.beginPath();
  for (const p of parts) trace(ctx, p);
  ctx.clip('nonzero');
  for (const p of parts) {
    const d = formWidth(form.core, p, cam);
    ctx.beginPath();
    trace(ctx, p, false, l.x * d, l.y * d);
    ctx.fillStyle = style.ramp.base;
    ctx.fill('nonzero');
  }
  const crescent = (i: number, d: number, color: string) => {
    const p = parts[i];
    ctx.save();
    if (parts.length > 1) {
      const b = p.bounds;
      const m = Math.abs(d) + 2;
      for (let k = 0; k < parts.length; k++) {
        if (k === i) continue;
        ctx.beginPath();
        ctx.rect(b.x - m, b.y - m, b.width + 2 * m, b.height + 2 * m);
        trace(ctx, parts[k], true);
        ctx.clip('nonzero');
      }
    }
    ctx.beginPath();
    trace(ctx, p);
    trace(ctx, p, false, l.x * d, l.y * d);
    ctx.fillStyle = color;
    ctx.fill('evenodd');
    ctx.restore();
  };
  const highlight = form.highlight;
  const rim = form.rim;
  parts.forEach((p, i) => {
    if (highlight) crescent(i, -formWidth(highlight, p, cam), style.ramp.lit);
    if (rim) crescent(i, rim.width * cam.scale, rim.color);
  });
  ctx.restore();
  if (style.texture || style.inside) union().draw(ctx, { texture: style.texture, inside: style.inside });
}

/** Three tones of one material: the theme's ramps (`RAMPS.wood`, ...) already have this shape. */
export interface ShadeRamp {
  lit: string;
  base: string;
  dark: string;
}

/** How a volume is painted: a material ramp plus the `@core/draw` styling of its outline and surfaces. */
export interface VolumeStyle {
  /** Material tones. Faces pick a tone from how much light they receive. */
  ramp: ShadeRamp;
  /**
   * Line around each part: the line between parts, under the object's outer contour (set `contour`
   * on the Camera). Make it a darker shade of the material and thinner than the contour.
   */
  stroke?: StrokeStyle | StrokeOptions;
  /**
   * Thin line at the creases of a faceted solid (neighbouring faces turned more than ~30 degrees).
   * Omit for none.
   */
  edge?: StrokeStyle | StrokeOptions;
  /** Texture painted on each visible face (or on the silhouette of a round volume). */
  texture?: Texture<unknown> | Texture<unknown>[];
  /** Details clipped to each visible face (faceted) or to the silhouette (round). */
  inside?: InsideCallback;
  /** Cel bands of faceted solids: 3 (default) snaps each face to dark / base / lit; 0 blends smoothly. */
  bands?: 0 | 2 | 3;
  /** Form shading of round volumes (see `FormShading`); fields left out use `FORM_DEFAULTS`. */
  form?: FormShading;
  /** Drop shadow of the silhouette. Prefer `groundShadow` for objects standing on the floor. */
  shadow?: ShadowOptions;
}

/**
 * Tone of a ramp for a light amount `t` in 0..1 (0 = in shadow, 1 = facing the light).
 * With 3 bands: below 0.22 dark, below 0.62 base, otherwise lit.
 */
export function rampTone(ramp: ShadeRamp, t: number, bands: 0 | 2 | 3 = 3): string {
  const k = Math.max(0, Math.min(1, t));
  // Thresholds tuned so, with the default light, tops are lit, faces towards the camera and
  // the light are base, and faces turned away from the light are dark.
  if (bands === 3) return k < 0.22 ? ramp.dark : k < 0.62 ? ramp.base : ramp.lit;
  if (bands === 2) return k < 0.5 ? ramp.dark : ramp.base;
  return k < 0.5 ? lerpColor(ramp.dark, ramp.base, k * 2) : lerpColor(ramp.base, ramp.lit, (k - 0.5) * 2);
}

/** One separately sorted piece of a volume (a face of a solid). */
export interface Piece {
  depth: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

/** Anything a `Stage` can sort and draw. */
export interface Placed {
  /** Distance towards the camera; larger is drawn later. */
  depth(cam: Camera): number;
  /** Draws the item through the camera. */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, style: unknown): void;
  /**
   * Optional: the item split into pieces sorted on their own (faces of a solid), so parts that
   * wrap or touch other parts (a band around a lid) sort correctly face by face.
   */
  pieces?(cam: Camera, style: unknown): Piece[];
  /** Optional: where the item stands on the ground (z is ignored), used to sort whole objects. */
  ground?(): Vec3;
  /** Optional: projected outline. */
  silhouette?(cam: Camera): Shape;
  /** Optional: shapes whose union is the projected outline (cheaper than `silhouette`), used for the object's outer contour. */
  outlines?(cam: Camera): Shape[];
}

function strokeStyleOf(s: StrokeStyle | StrokeOptions | undefined): StrokeStyle | undefined {
  if (!s) return undefined;
  return s instanceof StrokeStyle ? s : new StrokeStyle(s);
}

function lightAmount(cam: Camera, normal: Vec3): number {
  return (cam.shade(normal) - cam.light.ambient) / (1 - cam.light.ambient);
}

function convexHull(points: Point[]): Point[] {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Normal of a planar polygon (Newell's method), for faces given by points only. */
export function polygonNormal(points: Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return norm3(vec3(x, y, z));
}

const centroid3 = (pts: Vec3[]): Vec3 => scale3(pts.reduce((s, p) => add3(s, p), vec3(0, 0, 0)), 1 / pts.length);

/** One planar face of a faceted solid, with its outward normal. */
export interface Face {
  points: Vec3[];
  normal: Vec3;
}

/**
 * A faceted solid (box, plank, wall, roof, crate): planar faces, each painted with the tone
 * of the ramp that matches the light it receives. Visible faces are drawn back to front,
 * then the silhouette is outlined.
 */
export class Solid implements Placed {
  readonly faces: Face[];

  constructor(faces: Face[]) {
    this.faces = faces;
  }

  /**
   * Extrudes a profile into a solid. The profile is drawn in the frame's ground plane
   * (x = forward, y = side to the right) and rises `height` along the frame's up axis.
   * Use a frame turned on its side (`Frame3`) to extrude along other axes.
   */
  static extrude(frame: Frame3, profile: Shape | Point[], height: number): Solid {
    const pts2 = Array.isArray(profile) ? profile : profile.toPoints();
    // Signed area tells the winding; each edge's outward normal in profile space follows from it.
    let area = 0;
    for (let i = 0; i < pts2.length; i++) {
      const a = pts2[i];
      const b = pts2[(i + 1) % pts2.length];
      area += a.x * b.y - b.x * a.y;
    }
    const wind = area >= 0 ? 1 : -1;
    const bottom = pts2.map(p => frame.at(p.x, p.y, 0));
    const top = pts2.map(p => frame.at(p.x, p.y, height));
    const up = norm3(frame.up);
    const faces: Face[] = [
      { points: bottom.slice().reverse(), normal: scale3(up, -1) },
      { points: top, normal: up },
    ];
    for (let i = 0; i < pts2.length; i++) {
      const j = (i + 1) % pts2.length;
      const dx = pts2[j].x - pts2[i].x;
      const dy = pts2[j].y - pts2[i].y;
      if (Math.hypot(dx, dy) < 1e-9) continue;
      const normal = norm3(frame.dir(dy * wind, -dx * wind, 0));
      faces.push({ points: [bottom[i], bottom[j], top[j], top[i]], normal });
    }
    return new Solid(faces);
  }

  /** A box standing on the frame origin: `length` along forward, `width` along side, `height` up. Centered on forward and side. */
  static box(frame: Frame3, length: number, width: number, height: number): Solid {
    return Solid.extrude(frame, Polygon.rect(length, width), height);
  }

  /** Faces turned towards the camera, back to front. */
  visibleFaces(cam: Camera): Face[] {
    return this.faces
      .filter(f => cam.faces(f.normal))
      .sort((a, b) => cam.depth(centroid3(a.points)) - cam.depth(centroid3(b.points)));
  }

  /** Projected outline of the visible solid. */
  silhouette(cam: Camera): Shape {
    const shapes = this.visibleFaces(cam).map(f => Polygon.fromPoints(f.points.map(p => cam.project(p))));
    if (shapes.length === 0) return new CompoundShape([]);
    return shapes.length === 1 ? shapes[0] : shapes[0].union(shapes.slice(1));
  }

  depth(cam: Camera): number {
    return cam.depth(centroid3(this.faces.flatMap(f => f.points)));
  }

  ground(): Vec3 {
    const c = centroid3(this.faces.flatMap(f => f.points));
    return vec3(c.x, c.y, 0);
  }

  outlines(cam: Camera): Shape[] {
    return this.visibleFaces(cam).map(f => Polygon.fromPoints(f.points.map(p => cam.project(p))));
  }

  /** Projected shape of one face (for decals and hand-placed details). */
  faceShape(cam: Camera, face: Face): Shape {
    return Polygon.fromPoints(face.points.map(p => cam.project(p)));
  }

  /**
   * Visible faces as separately sorted pieces. Each face is filled with its ramp tone, then
   * its edges are inked: the outline stroke where the neighbouring face is hidden (the
   * silhouette), the thin edge stroke at creases (neighbour turned more than ~30°), and
   * nothing across smooth curved surfaces.
   */
  pieces(cam: Camera, style: VolumeStyle): Piece[] {
    const bands = style.bands ?? 3;
    // Edges are drawn face by face, so they use a uniform round-capped line: a calligraphic
    // brush would taper every short segment and fray the outline.
    const edge = strokeStyleOf(style.edge)?.with({ renderer: 'clean', join: 'round' });
    const outline = strokeStyleOf(style.stroke)?.with({ renderer: 'clean', join: 'round' });
    const visible = new Set(this.faces.filter(f => cam.faces(f.normal)));
    const neighbours = this.adjacency();
    return [...visible].map(face => {
      const pts = face.points.map(p => cam.project(p));
      return {
        depth: cam.depth(centroid3(face.points)),
        draw: (ctx: CanvasRenderingContext2D) => {
          const shape = Polygon.fromPoints(pts);
          const tone = rampTone(style.ramp, lightAmount(cam, face.normal), bands);
          // A hairline of the face's own tone seals the antialiasing seam between neighbouring faces.
          shape.stroke(ctx, { renderer: 'clean', width: 1, color: tone, join: 'round' });
          shape.draw(ctx, { fill: tone, texture: style.texture, inside: style.inside });
          // Classify each edge, then stroke runs of consecutive edges of the same kind as one line.
          const n = pts.length;
          const kinds = pts.map((_, i) => {
            const other = neighbours.get(edgeKey(face.points[i], face.points[(i + 1) % n]))?.find(f => f !== face);
            return !other || !visible.has(other) ? outline : dot3(other.normal, face.normal) < CREASE_COS ? edge : undefined;
          });
          const start = kinds.findIndex((k, i) => k !== kinds[(i - 1 + n) % n]);
          const first = start < 0 ? 0 : start;
          let run: Point[] = [];
          let brush = kinds[first];
          const flush = () => {
            if (brush && run.length > 1) new Path(run, start < 0 && run.length > n).stroke(ctx, brush);
          };
          for (let k = 0; k < n; k++) {
            const i = (first + k) % n;
            if (kinds[i] !== brush) {
              flush();
              run = [];
              brush = kinds[i];
            }
            if (run.length === 0) run.push(pts[i]);
            run.push(pts[(i + 1) % n]);
          }
          flush();
        },
      };
    });
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, style: VolumeStyle): void {
    const pieces = this.pieces(cam, style).sort((a, b) => a.depth - b.depth);
    for (const p of pieces) p.draw(ctx);
  }

  private adjacency(): Map<string, Face[]> {
    const map = new Map<string, Face[]>();
    for (const f of this.faces) {
      for (let i = 0; i < f.points.length; i++) {
        const k = edgeKey(f.points[i], f.points[(i + 1) % f.points.length]);
        const list = map.get(k) ?? [];
        list.push(f);
        map.set(k, list);
      }
    }
    return map;
  }
}

/** Faces whose normals differ by more than ~30° meet at a crease, which gets an edge line. */
const CREASE_COS = Math.cos((30 * Math.PI) / 180);

function vertexKey(p: Vec3): string {
  return `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;
}

function edgeKey(a: Vec3, b: Vec3): string {
  const ka = vertexKey(a);
  const kb = vertexKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/** A cross-section of a round volume: an ellipse around `center` in the plane of two axes. */
export interface Section {
  center: Vec3;
  /** Radius along the first axis (default: world x). */
  rx: number;
  /** Radius along the second axis (default: world y). Defaults to `rx`. */
  ry?: number;
  /** The two axes of the ellipse. Default: world x and y (a horizontal ring). */
  axes?: [Vec3, Vec3];
}

const RING_SEGMENTS = 20;

function ringPoints(s: Section): Vec3[] {
  const [a, b] = s.axes ?? [vec3(1, 0, 0), vec3(0, 1, 0)];
  const ry = s.ry ?? s.rx;
  const out: Vec3[] = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const t = (i / RING_SEGMENTS) * Math.PI * 2;
    out.push(mix3([s.center, 1], [a, Math.cos(t) * s.rx], [b, Math.sin(t) * ry]));
  }
  return out;
}

/**
 * A round volume (body, head, barrel, column, pot, rock) whose silhouette is the hull of
 * its cross-sections. It is painted like a `@core/draw` shape with cel shading whose highlight
 * sits on the side of the project light.
 */
export class Round implements Placed {
  readonly sections: Section[];
  /** Faces drawn over the body when visible (the flat cap of a cylinder). */
  readonly caps: Face[];

  constructor(sections: Section[], caps: Face[] = []) {
    this.sections = sections;
    this.caps = caps;
  }

  /** Volume through a list of cross-sections (two or more), like a loft of rings. */
  static loft(sections: Section[]): Round {
    return new Round(sections);
  }

  /** Ellipsoid with radii along the frame's forward, side and up axes, centered on the frame origin. */
  static ellipsoid(frame: Frame3, forward: number, side: number, up: number): Round {
    const sections: Section[] = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI;
      const k = Math.cos(a);
      sections.push({ center: frame.at(0, 0, Math.sin(a) * up), rx: Math.max(0.01, forward * k), ry: Math.max(0.01, side * k), axes: [frame.forward, frame.right] });
    }
    return new Round(sections);
  }

  /**
   * Cylinder (or cone frustum) standing on the frame origin, `height` along the frame's up
   * axis. The top cap is drawn as a lit face when the camera sees it.
   */
  static cylinder(frame: Frame3, radius: number, height: number, topRadius = radius): Round {
    const bottom: Section = { center: frame.origin, rx: radius, axes: [frame.forward, frame.right] };
    const top: Section = { center: frame.at(0, 0, height), rx: topRadius, axes: [frame.forward, frame.right] };
    const cap = ringPoints(top);
    return new Round([bottom, top], [{ points: cap, normal: norm3(frame.up) }]);
  }

  /** Lathe: a profile of [height, radius] pairs turned around the frame's up axis (vases, bottles, columns). */
  static lathe(frame: Frame3, profile: [number, number][]): Round {
    const sections = profile.map(([h, r]) => ({ center: frame.at(0, 0, h), rx: r, axes: [frame.forward, frame.right] as [Vec3, Vec3] }));
    const [h, r] = profile[profile.length - 1];
    const capRing = ringPoints({ center: frame.at(0, 0, h), rx: r, axes: [frame.forward, frame.right] });
    return new Round(sections, r > 0.01 ? [{ points: capRing, normal: norm3(frame.up) }] : []);
  }

  silhouette(cam: Camera): Shape {
    const hull = convexHull(this.sections.flatMap(ringPoints).map(p => cam.project(p)));
    return Polygon.fromPoints(hull).smooth(2);
  }

  depth(cam: Camera): number {
    return cam.depth(centroid3(this.sections.map(s => s.center)));
  }

  ground(): Vec3 {
    const c = centroid3(this.sections.map(s => s.center));
    return vec3(c.x, c.y, 0);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, style: VolumeStyle): void {
    const shape = this.silhouette(cam);
    paintForm(ctx, cam, [shape], style);
    for (const cap of this.caps) {
      if (!cam.faces(cap.normal)) continue;
      const capShape = Polygon.fromPoints(convexHull(cap.points.map(p => cam.project(p)))).smooth(1);
      capShape.draw(ctx, { fill: rampTone(style.ramp, lightAmount(cam, cap.normal), style.bands ?? 3) });
      const edge = strokeStyleOf(style.edge);
      if (edge) capShape.stroke(ctx, edge);
    }
  }

  outlines(cam: Camera): Shape[] {
    return [this.silhouette(cam)];
  }
}

/**
 * A tapered tube through world points (limbs, ropes, horns, handles, branches): the
 * projected spline becomes a `@core/draw` ribbon of the given width. `width` is the full width of the
 * tube (not the radius), in world units, which are logical px at camera scale 1: a number, a
 * `{ start, end }` pair for a taper, or a function of `t` (0 at the first point, 1 at the last).
 */
export class Tube implements Placed {
  readonly points: Vec3[];
  readonly width: RibbonWidth;

  constructor(points: Vec3[], width: RibbonWidth) {
    this.points = points;
    this.width = width;
  }

  silhouette(cam: Camera): Shape {
    const pts = this.points.map(p => cam.project(p));
    const w = this.width;
    const scaled: RibbonWidth = typeof w === 'number' ? w * cam.scale : typeof w === 'function' ? (t: number) => w(t) * cam.scale : { start: w.start * cam.scale, end: w.end * cam.scale };
    const path = pts.length > 2 ? Path.spline(pts) : Path.line(pts[0], pts[pts.length - 1]);
    // No boolean clean-up of self-overlaps at tight bends: the line is drawn under the fill
    // (see paintForm), so the overlap never shows, and the union costs more than the whole frame.
    return path.toShape({ width: scaled, cap: 'round', clean: false });
  }

  depth(cam: Camera): number {
    return cam.depth(centroid3(this.points));
  }

  ground(): Vec3 {
    const c = centroid3(this.points);
    return vec3(c.x, c.y, 0);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, style: VolumeStyle): void {
    paintForm(ctx, cam, [this.silhouette(cam)], style);
  }

  outlines(cam: Camera): Shape[] {
    return [this.silhouette(cam)];
  }
}

/**
 * Several round volumes and tubes painted as one organic mass (a body from rump, ribcage and
 * neck; a head from skull and muzzle): each part keeps its own cel shading, but only the union
 * of their silhouettes is outlined, so overlaps do not read as separate plates. Sorts as one
 * piece. A loft alone is the convex hull of its rings and cannot tuck in; a blob can.
 */
export class Blob implements Placed {
  readonly parts: (Round | Tube)[];

  constructor(parts: (Round | Tube)[]) {
    this.parts = parts;
  }

  silhouette(cam: Camera): Shape {
    const shapes = this.parts.map(p => p.silhouette(cam));
    return shapes.length === 1 ? shapes[0] : shapes[0].union(shapes.slice(1));
  }

  depth(cam: Camera): number {
    return this.parts.reduce((s, p) => s + p.depth(cam), 0) / Math.max(1, this.parts.length);
  }

  ground(): Vec3 {
    const g = this.parts.map(p => p.ground());
    return vec3(g.reduce((s, p) => s + p.x, 0) / g.length, g.reduce((s, p) => s + p.y, 0) / g.length, 0);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, style: VolumeStyle): void {
    // The whole mass in shadow tone, then every part's lit area on top, clipped to the union:
    // seams do not show, and an overlap is dark only where all parts are in shadow.
    const parts = this.outlines(cam);
    paintForm(ctx, cam, parts, style, () => (parts.length === 1 ? parts[0] : parts[0].union(parts.slice(1))));
  }

  outlines(cam: Camera): Shape[] {
    return this.parts.map(p => p.silhouette(cam));
  }
}

/**
 * A `@core/draw` shape laid on a surface (emblem, keyhole, rune, plank seam, window): the
 * shape's x runs along `u` and its y along `v` from `origin`. Hidden when the surface
 * faces away from the camera. Styled with a plain `ShapeStyle`.
 *
 * A decal sorts as a point, at the depth of its `origin`. Add it with `{ on: part }` to draw it
 * after the part it lies on; a decal on a curved surface needs `normal` set to the surface
 * normal at its origin (it is flat, and visible while that normal faces the camera).
 */
export class Decal implements Placed {
  readonly origin: Vec3;
  readonly u: Vec3;
  readonly v: Vec3;
  readonly shape: Shape;
  /** Outward normal of the surface the decal lies on. */
  readonly normal: Vec3;

  /**
   * `normal` defaults to `u` × `v`, the side a viewer sees the decal from when `u` runs to their
   * right and `v` down (the layout of `onFace`; world axes are x right, y towards the camera, z up).
   */
  constructor(origin: Vec3, u: Vec3, v: Vec3, shape: Shape, normal?: Vec3) {
    this.origin = origin;
    this.u = u;
    this.v = v;
    this.shape = shape;
    this.normal = norm3(normal ?? cross3(u, v));
  }

  /**
   * Decal on a face of a frame, laid out the way a viewer looking at that face reads it:
   * x runs to the viewer's right and y downwards, so text, runes and asymmetric emblems are
   * never mirrored. 'top' reads from the front (y runs towards the front edge). `at` is the
   * decal's origin in local coordinates (x = forward, y = side, z = up), on the face's plane.
   */
  static onFace(frame: Frame3, side: 'front' | 'back' | 'left' | 'right' | 'top', at: Vec3, shape: Shape): Decal {
    const o = frame.at(at.x, at.y, at.z);
    const down = scale3(frame.up, -1);
    const f = norm3(frame.forward);
    const r = norm3(frame.right);
    switch (side) {
      // Facing the object's front, the viewer's right is the object's left (−right), and so on.
      case 'front':
        return new Decal(o, scale3(r, -1), down, shape, f);
      case 'back':
        return new Decal(o, r, down, shape, scale3(f, -1));
      case 'right':
        return new Decal(o, f, down, shape, r);
      case 'left':
        return new Decal(o, scale3(f, -1), down, shape, scale3(r, -1));
      default:
        return new Decal(o, scale3(r, -1), f, shape, norm3(frame.up));
    }
  }

  visible(cam: Camera): boolean {
    return cam.faces(this.normal);
  }

  projected(cam: Camera): Shape {
    return this.shape.mapVertices(p => cam.project(mix3([this.origin, 1], [this.u, p.x], [this.v, p.y])));
  }

  depth(cam: Camera): number {
    return cam.depth(this.origin);
  }

  ground(): Vec3 {
    return vec3(this.origin.x, this.origin.y, 0);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, style: ShapeStyle | ShapeStyleOptions): void {
    if (!this.visible(cam)) return;
    this.projected(cam).draw(ctx, style);
  }
}

const ARC_SAMPLES = 48;

/**
 * Points of the ring `center + a·cos·rx + b·sin·ry` on the run of samples where `faces(t)` holds:
 * the whole ring (closed) when every sample does, an empty list when fewer than two do.
 */
function arcWhere(center: Vec3, a: Vec3, b: Vec3, rx: number, ry: number, faces: (t: number) => boolean): Vec3[] {
  const n = ARC_SAMPLES;
  const ts = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2);
  const at = (t: number) => mix3([center, 1], [a, Math.cos(t) * rx], [b, Math.sin(t) * ry]);
  const facing = ts.map(faces);
  const start = facing.findIndex((f, i) => f && !facing[(i - 1 + n) % n]);
  if (start < 0) return facing[0] ? [...ts, ts[0]].map(at) : [];
  const out: Vec3[] = [];
  for (let k = 0; k < n && facing[(start + k) % n]; k++) out.push(at(ts[(start + k) % n]));
  return out.length >= 2 ? out : [];
}

/**
 * The part of a ring that faces the camera, as points for a `Tube` (belts, bracelets, collars,
 * barrel hoops, ribs): the back half of a band around a body must not cross its front. The
 * ring is `center + a·cos·rx + b·sin·ry`; returns an empty list when no part of it faces the
 * camera. `grow` (default 0.1) lets the arc wrap a little past the silhouette so it meets the
 * outline. Rings on an ellipsoid: use `bandOnEllipsoid`, which decides visibility on the surface.
 */
export function visibleArc(cam: Camera, center: Vec3, a: Vec3, b: Vec3, rx: number, ry: number = rx, grow = 0.1): Vec3[] {
  const view = cam.viewDir;
  return arcWhere(center, a, b, rx, ry, t => {
    // Outward normal of an ellipse at angle t is along a·cos/rx + b·sin/ry.
    const m = mix3([a, Math.cos(t) / rx], [b, Math.sin(t) / ry]);
    return dot3(m, view) > -grow * len3(m);
  });
}

/** The axis of an ellipsoid's frame that a ring is cut perpendicular to (see `ringOnEllipsoid`). */
export type EllipsoidAxis = 'up' | 'forward' | 'side';

/** A ring in the form `visibleArc` takes: `center + a·cos·rx + b·sin·ry`. */
export interface EllipsoidRing {
  center: Vec3;
  a: Vec3;
  b: Vec3;
  rx: number;
  ry: number;
}

/**
 * The ring where a plane cuts an ellipsoid built like `Round.ellipsoid(frame, forward, side, up)`:
 * the plane stands `at` local units along `axis` from the frame origin ('up' by default, so
 * `at` is a height and the ring is horizontal; 'forward' cuts across the body like a rib; 'side'
 * cuts lengthwise). The radii shrink by sqrt(1 - (at/R)²) towards the poles, which is the scaling
 * agents otherwise do by hand; every point of the ring lies on the ellipsoid's surface. `at` is
 * clamped to the ellipsoid (a ring at a pole is 0.01 wide, like `Round.ellipsoid`'s poles). Scale
 * `rx` and `ry` slightly (1.02) if a tube should stand a little off the surface.
 */
export function ringOnEllipsoid(frame: Frame3, forward: number, side: number, up: number, at: number, axis: EllipsoidAxis = 'up'): EllipsoidRing {
  const radius = axis === 'forward' ? forward : axis === 'side' ? side : up;
  const t = Math.max(-1, Math.min(1, at / radius));
  const k = Math.sqrt(1 - t * t);
  const r = (x: number) => Math.max(0.01, x * k);
  switch (axis) {
    case 'forward':
      return { center: frame.at(t * forward, 0, 0), a: frame.right, b: frame.up, rx: r(side), ry: r(up) };
    case 'side':
      return { center: frame.at(0, t * side, 0), a: frame.forward, b: frame.up, rx: r(forward), ry: r(up) };
    default:
      return { center: frame.at(0, 0, t * up), a: frame.forward, b: frame.right, rx: r(forward), ry: r(side) };
  }
}

/**
 * The visible part of a band wrapped around an ellipsoid, as points for a `Tube` (a belt round a
 * body, ribs, stripes): the same ring as `ringOnEllipsoid(frame, forward, side, up, at, axis)`,
 * cut where the ellipsoid's surface turns away from the camera. Unlike `visibleArc`, which only
 * knows the ring's own plane, it tests the surface normal, so a ring above the equator shows
 * more than its front half (all of it near the top) and one below it shows less. `grow` (default
 * 0.1) lets the arc run a little past the silhouette so it meets the outline. Returns an empty
 * list when none of the ring faces the camera; a ring that is visible all round comes back closed.
 */
export function bandOnEllipsoid(
  cam: Camera,
  frame: Frame3,
  forward: number,
  side: number,
  up: number,
  at: number,
  options: { axis?: EllipsoidAxis; grow?: number } = {},
): Vec3[] {
  const { axis = 'up', grow = 0.1 } = options;
  const ring = ringOnEllipsoid(frame, forward, side, up, at, axis);
  const view = cam.viewDir;
  const axes: [Vec3, number][] = [[frame.forward, forward], [frame.right, side], [frame.up, up]];
  return arcWhere(ring.center, ring.a, ring.b, ring.rx, ring.ry, t => {
    const d = sub3(mix3([ring.center, 1], [ring.a, Math.cos(t) * ring.rx], [ring.b, Math.sin(t) * ring.ry]), frame.origin);
    // Gradient of the ellipsoid's equation: each axis contributes (coefficient / R²) along its own direction.
    const n = mix3(...axes.map(([ax, R]): [Vec3, number] => [ax, dot3(d, ax) / (dot3(ax, ax) ** 2 * R * R)]));
    return dot3(n, view) > -grow * len3(n);
  });
}

/**
 * Soft contact shadow on the ground (z = 0) under an object: an ellipse of radii `rx` (x) and `ry` (y),
 * turned by `rotation` radians on the floor, clockwise on screen (for a prop that faces a way:
 * `ctx.yaw - π/2`).
 * In a scenery piece, fill it in `ctx.ground`.
 */
export function groundShadow(cam: Camera, center: Vec3, rx: number, ry: number = rx, rotation = 0): Shape {
  // `Polygon.ellipse` turns by degrees; this API takes radians, like every other angle of @core/volume.
  return Polygon.ellipse(rx, ry, { cx: 0, cy: 0, rotation: (rotation * 180) / Math.PI }).mapVertices(p => cam.project(vec3(center.x + p.x, center.y + p.y, 0)));
}
