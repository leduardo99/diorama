import { DEFAULT_TILT, projectionOf, toFloor, toScreen, type Actor as RuntimeActor, type Character, type Fx as RuntimeFx, type Projection, type SheetRef, type Vec2 } from '@diorama/runtime';
import { stripExtension } from '../format';
import type { AssetFileMeta } from '../types';

/**
 * How the playground puts the runtime on its canvas. The runtime keeps actors and effects on the floor, in world units;
 * the playground works in *actor units* (exported pixels of the view: canvas px over the zoom), so every actor and effect
 * gets `x`, `y` there, projected with its character's own camera (tilt) at its export scale, the floor's origin at the
 * view's top-left corner. A scene is mapped onto the same units by `scenery/living.ts` (`Mapping`).
 *
 * Points the view puts somewhere read back exactly: a floor point made from a view point (a spawn, a drag, a move the view
 * clamped) remembers that view point, and an effect is drawn where the view placed it (`placeFx`: on the socket of the
 * frame it was cued on, as the view draws that frame, then moved in actor units). Without that, the round trip through
 * the camera's tilt would put half-pixel positions an ulp off, a pixel off once drawn, and change the ties the draw order keeps.
 */

/** The viewer's handle on a sheet: the server's file metadata, with the path the runtime knows it by. */
export type AssetRef = AssetFileMeta & SheetRef;

export const sheetRef = (asset: AssetFileMeta): AssetRef => ({ ...asset, path: stripExtension(asset.subpath) });

/** The projection of a character (or, without one, of a sheet at `scale`) onto the view. */
export const viewOf = (character: Character<AssetRef> | null, scale: number): Projection => projectionOf(null, { tilt: character?.tilt ?? DEFAULT_TILT, scale: character?.scale ?? scale });

/** The view point (actor units) each floor point the view made was made from. The runtime replaces floor points, never changes them. */
const placed = new WeakMap<Vec2, Vec2>();

/** The floor point under a view point (actor units), which reads back as that very view point. */
export function floorAt(view: Projection, at: Vec2): Vec2 {
  const floor = toFloor(view, at);
  placed.set(floor, { x: at.x, y: at.y });
  return floor;
}

/** Where a floor point is in the view (actor units): the view point it was made from, or its projection. */
export const viewPointOf = (view: Projection, floor: Vec2): Vec2 => placed.get(floor) ?? toScreen(view, floor);

/** An actor of the runtime with its floor point in actor units: setting `x` or `y` moves it there. */
export type Actor = RuntimeActor<AssetRef> & { x: number; y: number };

const actorViews = new WeakMap<object, Projection>();

/** The projection an actor is shown with. */
export const viewOfActor = (actor: RuntimeActor<AssetRef>): Projection => actorViews.get(actor) ?? viewOf(actor.character, actor.clip.scale);

/** Gives a runtime actor its place in the view, at a view point (actor units) when one is given. */
export function inView(actor: RuntimeActor<AssetRef>, at?: Vec2): Actor {
  const view = viewOf(actor.character, actor.clip.scale);
  actorViews.set(actor, view);
  if (at) actor.pos = floorAt(view, at);
  const now = () => viewPointOf(view, actor.pos);
  return Object.defineProperties(actor, {
    x: { get: () => now().x, set: (x: number) => (actor.pos = floorAt(view, { x, y: now().y })), enumerable: true, configurable: true },
    y: { get: () => now().y, set: (y: number) => (actor.pos = floorAt(view, { x: now().x, y })), enumerable: true, configurable: true },
  }) as Actor;
}

/**
 * A playing effect as the view shows it: the runtime's effect (`fx`), with its origin (`x`, `y`), its height above the floor
 * point under it (`lift`) and a projectile's velocity in actor units. Setting `x` or `y` moves the effect, keeping its height.
 */
export interface Fx {
  readonly fx: RuntimeFx<AssetRef>;
  readonly sheet: RuntimeFx<AssetRef>['sheet'];
  x: number;
  y: number;
  readonly row: number;
  readonly age: number;
  readonly motion: RuntimeFx<AssetRef>['motion'];
  readonly lift: number;
  readonly follow: RuntimeFx<AssetRef>['follow'];
  readonly until: RuntimeFx<AssetRef>['until'];
  readonly fly: RuntimeFx<AssetRef>['fly'];
  readonly character: RuntimeFx<AssetRef>['character'];
  readonly done: boolean;
}

/** Where the view draws an effect (actor units): its origin, and how far above the floor point under it that is. */
export interface Drawn {
  x: number;
  y: number;
  lift: number;
}

interface FxView {
  shown: Fx;
  view: Projection;
  /** Where the view placed it, for the floor point it stood on then: it holds while the runtime leaves that point. */
  drawn: (Drawn & { pos: Vec2 }) | null;
  /** A projectile's velocity in actor units per second, as the view moves it. */
  velocity: Vec2 | null;
}

const fxViews = new WeakMap<RuntimeFx<AssetRef>, FxView>();

/** The projection an effect is shown with: its character's, like the actor that cued it. */
export const viewOfFx = (fx: RuntimeFx<AssetRef>): Projection => fxViews.get(fx)?.view ?? viewOf(fx.character, fx.sheet.scale);

/** Where an effect is drawn now (actor units): where the view placed it, else the projection of its floor point and lift. */
export function drawnOf(fx: RuntimeFx<AssetRef>): Drawn {
  const state = fxViews.get(fx);
  if (state?.drawn && state.drawn.pos === fx.pos) return state.drawn;
  const view = viewOfFx(fx);
  const floor = viewPointOf(view, fx.pos);
  const lift = fx.lift * view.scale;
  return { x: floor.x, y: floor.y - lift, lift };
}

/** A projectile's velocity in actor units per second: the one the view gave it, else its floor velocity projected. */
export function velocityOf(fx: RuntimeFx<AssetRef>): Vec2 | null {
  const state = fxViews.get(fx);
  if (state?.velocity) return state.velocity;
  if (!fx.fly) return null;
  const view = viewOfFx(fx);
  return { x: fx.fly.vx * view.kx * view.scale, y: fx.fly.vy * view.ky * view.scale };
}

/**
 * Says where the view draws an effect, for the floor point the runtime has it on now (and, for a projectile, how fast it
 * crosses the view). The runtime keeps its own floor point; once it moves the effect to another, the view places it again.
 */
export function placeFx(fx: RuntimeFx<AssetRef>, at: Drawn, velocity?: Vec2) {
  const state = fxViews.get(fx) ?? viewFx(fx);
  state.drawn = { pos: fx.pos, x: at.x, y: at.y, lift: at.lift };
  if (velocity) state.velocity = { x: velocity.x, y: velocity.y };
}

/** Moves an effect in the view (the scene moved under it), keeping its height: the runtime's floor point follows. */
function moveFx(fx: RuntimeFx<AssetRef>, at: Drawn) {
  fx.pos = floorAt(viewOfFx(fx), { x: at.x, y: at.y + at.lift });
  placeFx(fx, at);
}

function viewFx(fx: RuntimeFx<AssetRef>): FxView {
  const field = <K extends keyof RuntimeFx<AssetRef>>(key: K) => ({ get: () => fx[key], enumerable: true });
  const shown = Object.defineProperties({ fx } as Fx, {
    sheet: field('sheet'),
    x: { get: () => drawnOf(fx).x, set: (x: number) => moveFx(fx, { ...drawnOf(fx), x }), enumerable: true },
    y: { get: () => drawnOf(fx).y, set: (y: number) => moveFx(fx, { ...drawnOf(fx), y }), enumerable: true },
    row: field('row'),
    age: field('age'),
    motion: field('motion'),
    lift: { get: () => drawnOf(fx).lift, enumerable: true },
    follow: field('follow'),
    until: field('until'),
    fly: {
      get: () => {
        const velocity = velocityOf(fx);
        return fx.fly && velocity && { ...fx.fly, vx: velocity.x, vy: velocity.y };
      },
      enumerable: true,
    },
    character: field('character'),
    done: field('done'),
  });
  const state: FxView = { shown, view: viewOf(fx.character, fx.sheet.scale), drawn: null, velocity: null };
  fxViews.set(fx, state);
  return state;
}

/** A runtime effect in the view (the same view object every time it is asked for). */
export const fxInView = (fx: RuntimeFx<AssetRef>): Fx => (fxViews.get(fx) ?? viewFx(fx)).shown;

/** The zooms the playground offers (screen px per actor unit); "fit" is worked out from the scene and the view (`fitZoom`). */
export const ZOOMS = [1, 2, 3, 4] as const;
export type Zoom = 'fit' | (typeof ZOOMS)[number];
/** The zoom with no scene to fit, and the one a first visit starts at. */
export const DEFAULT_ZOOM = 2;
/** Screen px kept round a fitted scene, as the Details window keeps round a frame. */
const FIT_MARGIN = 48;

/**
 * The zoom that shows the whole of a scene (actor units) in a view (screen px), by the Details window's rule: the largest
 * whole zoom that fits, up to the largest offered, else the fraction that fits (never under a tenth). A view with no room
 * past its margin (a hidden or collapsed pane) fits nothing: null.
 */
export function fitZoom(scene: { width: number; height: number }, view: { width: number; height: number }): number | null {
  if (view.width <= FIT_MARGIN || view.height <= FIT_MARGIN) return null;
  const fit = Math.min((view.width - FIT_MARGIN) / scene.width, (view.height - FIT_MARGIN) / scene.height);
  return fit >= 1 ? Math.min(Math.floor(fit), ZOOMS.at(-1)!) : Math.max(0.1, fit);
}
