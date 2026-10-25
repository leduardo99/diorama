import { advance as advanceActor, createActor, frameIndex, play, reset as resetActor, shown, shownFrame, steer, takeEvents, toFloor, type ClipEvent as RuntimeClipEvent, type Floor, type LastEvent } from '@diorama/runtime';
import type { Character, Clip } from './library';
import { floorAt, inView, viewOf, viewOfActor, viewPointOf, type Actor, type AssetRef } from './view';

/**
 * The playground's characters: the runtime's clip player (`@diorama/runtime`: priority, cancel, hold, events, root motion,
 * steering at `groundSpeed`), placed in the view. Positions here are actor units (exported pixels of the view); the
 * runtime moves actors on the floor, and the view keeps them between its sides and the scene's walls.
 */

export { facingOf, type Input } from '@diorama/runtime';
export type { Actor };

/**
 * The frame an actor shows now, and where its feet sit in the rectangle the view draws (exported px): the sheet's pivot,
 * else the middle of that rectangle's bottom. The view draws a frame's rectangle as it is, trimmed or not, at the feet less
 * this pivot, so the fallback measures that rectangle; the runtime's `shownFrame` measures a packed frame's untrimmed cell,
 * for hosts that draw the trimmed part at its offset in it.
 */
export function currentFrame(actor: Actor) {
  const now = shownFrame(actor);
  return { ...now, pivot: now.clip.atlas.meta.pivot ?? { x: now.rect.width / 2, y: now.rect.height } };
}

export type ClipEvent = Omit<RuntimeClipEvent<AssetRef>, 'actor'> & { actor: Actor };

export type Emit = (event: ClipEvent) => void;

/** Exported pixels kept between the anchor and the side edges of the scene. */
const EDGE = 60;
/** Room kept between the anchor and the scene's side edges: what the sprite sticks out of its anchor, at most a third of the scene. */
function sideRoom(clip: Clip, bounds: Bounds) {
  const { frameWidth = 0, pivot } = clip.atlas.meta;
  const anchor = pivot?.x ?? frameWidth / 2;
  const cap = bounds.width / 3;
  return { left: Math.min(Math.max(EDGE, anchor), cap), right: Math.min(Math.max(EDGE, frameWidth - anchor), cap) };
}

const clampX = (x: number, clip: Clip, bounds: Bounds) => {
  const { left, right } = sideRoom(clip, bounds);
  return Math.max(left, Math.min(bounds.width - right, x));
};

export interface Bounds {
  width: number;
  height: number;
  /** What the floor allows of a step from one point to another (a scene's walls and closed doors) for a body of `radius` world units: the point it ends at. */
  constrain?: (from: { x: number; y: number }, to: { x: number; y: number }, radius?: number) => { x: number; y: number };
}

const NO_BOUNDS: Bounds = { width: Infinity, height: Infinity };

/**
 * The view as the runtime's floor: a move keeps the sprite's room inside the view's sides, stays between its top and
 * bottom, and goes as far as the scene lets it. The view draws each sheet at its own export scale, so a clip moves its
 * sprite by its own `meta.scale` (`groundSpeed × meta.scale` px per second, root motion likewise), across the view and,
 * shrunk by the camera's tilt, in depth.
 */
function viewFloor(actor: Actor, bounds: Bounds): Floor {
  const view = viewOfActor(actor);
  return {
    move: (from, delta, radius, clip) => {
      const at = viewPointOf(view, from);
      const ahead = { x: at.x + delta.x * view.kx * clip.scale, y: at.y + delta.y * view.ky * clip.scale };
      const to = { x: clampX(ahead.x, clip as Clip, bounds), y: Math.max(0, Math.min(bounds.height, ahead.y)) };
      return floorAt(view, bounds.constrain ? bounds.constrain(at, to, radius) : to);
    },
  };
}

/** A stride of the looping base clip (`step:<leg>`): it fires on every step, so the HUD names strides only when asked. */
export const isStep = (name: string) => name === 'step' || name.startsWith('step:');

/** The last event each actor fired that is not a stride: what the HUD shows while strides are hidden. */
const lastNotStep = new WeakMap<Actor, LastEvent>();

const emitAll = (events: RuntimeClipEvent<AssetRef>[], emit: Emit) => {
  for (const event of events) {
    // Each event is seen, not only the runtime's last one: a call that fires a hit and then a stride keeps the hit. `start` and
    // `end` are not events of the sheet (the runtime never makes them its `lastEvent`), so the HUD leaves them out too.
    if (!isStep(event.name) && event.name !== 'start' && event.name !== 'end') lastNotStep.set(event.actor as Actor, { name: event.name, clip: event.clip.key, frame: event.frame });
    emit(event as ClipEvent);
  }
};

/** A character (or a sprite, without one) standing at a point of the view, showing `clip`. */
export function newActor(id: number, clip: Clip, x: number, y: number, character: Character | null = null, row = 0): Actor {
  return inView(createActor(character ?? clip, toFloor(viewOf(character, clip.scale), { x, y }), { id, clip, row }), { x, y });
}

/** Back to idle (the runtime's `reset`), forgetting the events the HUD shows, strides or not. */
export function reset(actor: Actor) {
  resetActor(actor);
  lastNotStep.delete(actor);
}

/** Starts an action if priority and cancel let it; its `start` and first-frame events are emitted at once. */
export function startClip(actor: Actor, clip: Clip | null | undefined, emit: Emit): boolean {
  if (!play(actor, clip)) return false;
  emitAll(takeEvents(actor), emit);
  return true;
}

/** Moves the clocks forward: events, root motion, and the end of an action (back to idle, or frozen when it holds). */
export function advance(actor: Actor, dt: number, emit: Emit = () => {}, bounds: Bounds = NO_BOUNDS) {
  emitAll(advanceActor(actor, dt, viewFloor(actor, bounds)), emit);
}

/** Moves the player at exactly the speed its clip was authored for, so the feet do not slide. */
export function stepPlayer(actor: Actor, input: { dx: number; dy: number; run: boolean }, dt: number, bounds: Bounds, emit: Emit) {
  emitAll(steer(actor, input, dt, viewFloor(actor, bounds)), emit);
}

export interface HudInfo {
  character: string;
  clip: string;
  kind: string;
  state: 'idle' | 'moving' | 'action' | 'hold';
  frame: number;
  frames: number;
  /** The direction row being shown (S, SE, W...). */
  direction: string;
  /** The last event it fired, as `name · clip f3`; a stride only when asked. */
  event: string | null;
  /** A scene stands behind the actors. */
  world: boolean;
  /** The last thing a piece of the scene did (a door's `open`), as `name · piece f3`; null with no scene or before any. */
  scene: string | null;
  /** What the E key does from where the character stands ("Abrir porta"); null when there is nothing in reach. */
  use: string | null;
}

/** What the HUD shows of an actor; with `stepEvents` off, its event is the last one that is not a stride. */
export function hudOf(actor: Actor, moving: boolean, stepEvents: boolean): Omit<HudInfo, 'world' | 'scene' | 'use'> {
  const { clip, row, time, loops } = shown(actor);
  const state = actor.held ? 'hold' : actor.act ? 'action' : moving ? 'moving' : 'idle';
  const last = stepEvents ? actor.lastEvent : (lastNotStep.get(actor) ?? null);
  return {
    character: actor.character?.name ?? clip.key,
    clip: clip.key,
    kind: clip.kind,
    state,
    frame: frameIndex(clip, time, loops),
    direction: clip.atlas.meta.directions?.[row] ?? 'S',
    frames: clip.frameCount,
    event: last ? `${last.name} · ${last.clip} f${last.frame}` : null,
  };
}
