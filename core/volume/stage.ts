/**
 * @core/volume - Stage
 *
 * Two-level painter's algorithm for 2.5D assets:
 * - objects (one physical thing each: a chest, a tombstone, a candle standing next to it) are
 *   sorted by where they stand on the ground, like sprites in an isometric game;
 * - the parts of one object are sorted among themselves, solids face by face, so parts that
 *   wrap or touch each other (a band around a lid) are right from every facing.
 */

import { StrokeStyle, type StrokeOptions } from '../draw/index.js';
import type { Camera } from './camera.js';
import type { Piece, Placed } from './volume.js';
import { vec3, type Vec3 } from './vec3.js';

/** Placement options of a stage item. */
export interface StageOptions {
  /**
   * Added to the item's depth inside its object. Use it to break ties between coplanar pieces,
   * or to lay a flat detail over all its siblings (a large bias, see `on`); for attachments use `on`.
   */
  bias?: number;
  /**
   * Objects of a lower layer are always drawn first: ground marks 0, objects 1 (default),
   * overlays 2. Only meaningful on `stage.add`, `stage.custom` and `stage.object`.
   */
  layer?: number;
  /**
   * The part this item rests on or is fixed to (a candle on a lid, a lock on a door, a crest
   * on a helmet). The item joins that part's object and is drawn after every piece of it,
   * from every facing. The part must be added first.
   *
   * Chains work: an item may rest on a part that itself rests on another, and is then drawn
   * after both. `on` only means "after the host", never "under its siblings": items resting on
   * the same host sort among themselves by depth, and whatever rests on a decal is drawn over
   * that decal. So ribs `{ on: glow }` cover the glow they cross (a dense cage hides it
   * entirely), while ribs and glow both `{ on: body }` sort by depth (a decal sorts at its
   * origin, so near ribs may cover it and far ones not, depending on the facing). To show a
   * glow through a cage, leave the cage open where the glow is; to lay it over every sibling from
   * every facing, give it a `bias` larger than the object's depth spread (`{ on: body, bias: 100 }`).
   */
  on?: Placed;
}

/** Options of `stage.object()`. */
export interface ObjectOptions {
  /** Layer of the whole object (see `StageOptions.layer`). Default 1. */
  layer?: number;
  /**
   * Where the object stands on the ground. Default: the centre of its parts' footprint.
   * Set it for objects whose parts extend far from where they stand.
   */
  at?: Vec3;
  /**
   * Outer contour: the object's whole silhouette is inked with one line this many times the
   * widest outline among its parts (half of it shows outside), so the outside line is heavier
   * than the lines between parts and the object reads as one shape. Default: the camera's
   * `contour` (set once per project), else 1.7; `false` for none.
   * Pass `{ width, color }` for an explicit line (ink outside, material-colored lines inside).
   */
  contour?: number | false | { width: number; color: string };
}

/** Default outer contour width, as a multiple of each part's outline. */
export const CONTOUR_DEFAULT = 1.7;

interface Entry extends Piece {
  order: number;
}

/**
 * One physical object on the stage. Its parts are sorted among themselves; the object is
 * sorted against other objects by where it stands.
 */
export class StageObject {
  readonly camera: Camera;
  readonly layer: number;
  readonly order: number;
  private readonly at?: Vec3;
  private readonly owner: Stage;
  private entries: Entry[] = [];
  private grounds: Vec3[] = [];
  private top = new Map<Placed, number>();
  private readonly contour: number | false | { width: number; color: string };
  private outlined: { item: Placed; stroke: StrokeStyle }[] = [];
  private hiding = 0;

  constructor(owner: Stage, camera: Camera, order: number, options: ObjectOptions = {}) {
    this.owner = owner;
    this.camera = camera;
    this.order = order;
    this.layer = options.layer ?? 1;
    this.at = options.at;
    this.contour = options.contour ?? camera.contour ?? CONTOUR_DEFAULT;
  }

  /** Adds a part (volume or decal) with its style. */
  add<T extends Placed>(item: T, style: Parameters<T['draw']>[2], options: Omit<StageOptions, 'layer'> = {}): this {
    const cam = this.camera;
    const bias = options.bias ?? 0;
    const floor = this.floorFor(options.on);
    const pieces = item.pieces
      ? item.pieces(cam, style)
      : [{ depth: item.depth(cam), draw: (ctx: CanvasRenderingContext2D) => item.draw(ctx, cam, style) }];
    let top = -Infinity;
    for (const p of pieces) {
      const depth = Math.max(p.depth + bias, floor);
      top = Math.max(top, depth);
      if (!this.hiding) this.entries.push({ depth, draw: p.draw, order: this.entries.length });
    }
    this.top.set(item, top);
    this.owner.register(item, this);
    if (this.hiding) return this;
    if (item.ground) this.grounds.push(item.ground());
    const stroke = (style as { stroke?: StrokeStyle | StrokeOptions } | undefined)?.stroke;
    if ((item.outlines || item.silhouette) && stroke) this.outlined.push({ item, stroke: stroke instanceof StrokeStyle ? stroke : new StrokeStyle(stroke) });
    return this;
  }

  /**
   * Places the parts that `place` adds without drawing them: they are still there for other parts
   * to rest `on` (a helm on a skull that an inventory icon does not show), but add no pixels, no
   * contour and no footprint.
   */
  hidden<T>(place: () => T): T {
    this.hiding++;
    try {
      return place();
    } finally {
      this.hiding--;
    }
  }

  /** Adds a custom drawing (a flame, glow or smear drawn with `@core/draw`) sorted inside the object at the depth of a world point. */
  custom(at: Vec3, draw: (ctx: CanvasRenderingContext2D, cam: Camera) => void, options: Omit<StageOptions, 'layer'> = {}): this {
    const cam = this.camera;
    if (this.hiding) return this;
    this.entries.push({
      depth: Math.max(cam.depth(at) + (options.bias ?? 0), this.floorFor(options.on)),
      draw: ctx => draw(ctx, cam),
      order: this.entries.length,
    });
    this.grounds.push(vec3(at.x, at.y, 0));
    return this;
  }

  /** Depth of where the object stands, used to sort it against other objects. */
  key(): number {
    const g = this.at ?? footprint(this.grounds);
    return g ? this.camera.depth(vec3(g.x, g.y, 0)) : 0;
  }

  /** Draws the object's parts back to front. */
  draw(ctx: CanvasRenderingContext2D): void {
    const sorted = this.entries.slice().sort((a, b) => a.depth - b.depth || a.order - b.order);
    // The contour goes under every part: inside the silhouette the parts cover it, outside it shows.
    if (this.contour && this.outlined.length) {
      const widest = this.outlined.reduce((a, b) => ((b.stroke.width ?? 1) > (a.stroke.width ?? 1) ? b : a)).stroke;
      const c = this.contour;
      const line = typeof c === 'number'
        ? widest.with({ width: (widest.width ?? 1) * c, renderer: 'clean', join: 'round' })
        : new StrokeStyle({ width: c.width * 2, color: c.color, renderer: 'clean', join: 'round' });
      for (const { item } of this.outlined) for (const shape of item.outlines ? item.outlines(this.camera) : [item.silhouette!(this.camera)]) shape.stroke(ctx, line);
    }
    for (const e of sorted) e.draw(ctx);
  }

  private floorFor(host: Placed | undefined): number {
    if (!host) return -Infinity;
    const top = this.top.get(host);
    if (top === undefined) throw new Error('Stage: the `on` part must be added (to the same object) before the items resting on it.');
    return top + 1e-3;
  }
}

function footprint(points: Vec3[]): Vec3 | undefined {
  if (points.length === 0) return undefined;
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return vec3(x / points.length, y / points.length, 0);
}

/**
 * Collects the objects of an asset and draws them back to front through one camera.
 *
 * - `stage.object()` starts one physical object; add all of its parts to it.
 * - `stage.add(item)` makes a one-part object, or joins the object of its `on` host.
 * - Objects are sorted by layer, then by where they stand on the ground.
 */
export class Stage {
  readonly camera: Camera;
  private objects: StageObject[] = [];
  private owners = new Map<Placed, StageObject>();

  constructor(camera: Camera) {
    this.camera = camera;
  }

  /** Starts an object: every part of one physical thing goes in the same object. */
  object(options: ObjectOptions = {}): StageObject {
    const o = new StageObject(this, this.camera, this.objects.length, options);
    this.objects.push(o);
    return o;
  }

  /** Adds an item as its own object, or to the object of the part it rests `on`. */
  add<T extends Placed>(item: T, style: Parameters<T['draw']>[2], options: StageOptions = {}): this {
    (this.hostOf(options.on) ?? this.object({ layer: options.layer })).add(item, style, options);
    return this;
  }

  /** Adds a custom drawing as its own object standing at `at` (or to the object of its `on` host). */
  custom(at: Vec3, draw: (ctx: CanvasRenderingContext2D, cam: Camera) => void, options: StageOptions = {}): this {
    (this.hostOf(options.on) ?? this.object({ layer: options.layer })).custom(at, draw, options);
    return this;
  }

  /** @internal Records which object owns an item, so later items can rest `on` it. */
  register(item: Placed, owner: StageObject): void {
    this.owners.set(item, owner);
  }

  /** Draws every object back to front. */
  draw(ctx: CanvasRenderingContext2D): void {
    const keyed = this.objects.map(o => ({ o, key: o.key() }));
    keyed.sort((a, b) => a.o.layer - b.o.layer || a.key - b.key || a.o.order - b.o.order);
    for (const { o } of keyed) o.draw(ctx);
  }

  private hostOf(on: Placed | undefined): StageObject | undefined {
    if (!on) return undefined;
    const host = this.owners.get(on);
    if (!host) throw new Error('Stage: the `on` part must be added before the items resting on it.');
    return host;
  }
}
