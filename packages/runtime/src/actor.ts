/**
 * The clip player: contract §5 rules 1 to 8. An actor stands on a floor point (world units) and shows one clip at a
 * time: its base clip (idle, the gait it walks in, or a stance) or an action, which priority, `cancel` and `hold` decide.
 * Steps return the events their frames reached; `play` keeps the events it fires for the next step (or `takeEvents`).
 */

import type { Vec2 } from './contract/atlas.js';
import { facingOf, frameIndex, frameOf, rowFor } from './frames.js';
import { DEFAULT_TILT, type Character, type Clip } from './library.js';
import { tiltFactor } from './projection.js';
import type { SheetRef } from './read.js';

/** An action in progress. It remembers the facing it started with: root motion follows that, not the input. */
export interface Active<A extends SheetRef = SheetRef> {
  clip: Clip<A>;
  time: number;
  row: number;
  /** Root motion already applied, in world units along the facing. */
  travelled: number;
  /** The last frame whose events were fired. */
  fired: number;
}

/** The last event an actor's clips fired, for a HUD. */
export interface LastEvent {
  name: string;
  clip: string;
  frame: number;
}

/** World units a character's body reaches from its feet: a scene's floor stops it this far short of a wall. */
export const BODY_RADIUS = 9;

/** One thing standing on the floor: a character, or a sprite (a single clip and no character). */
export interface Actor<A extends SheetRef = SheetRef> {
  /** The host's own id for it (unique among the actors it plays together): the runtime only hands it back on events. */
  readonly id: number;
  character: Character<A> | null;
  /** The looping clip shown when no action plays: idle, the gait being walked, or the stance. */
  clip: Clip<A>;
  /** Where it stands: a floor point in world units. */
  pos: Vec2;
  /** Direction row of the sheet. */
  row: number;
  /** Seconds into the base clip. */
  time: number;
  act: Active<A> | null;
  /** A `hold` clip that finished: it stays on its last frame until the actor is reset. */
  held: Active<A> | null;
  /** A looping clip played as the base instead of idle (a defend pose, a cast loop), until it is replaced. */
  stance: Clip<A> | null;
  /** World units its body reaches from its feet, for the floor's walls. */
  radius: number;
  lastEvent: LastEvent | null;
  /** The base clip whose events (`step:<leg>`) were last fired, and how many of its frames went by since it started. */
  baseClip: Clip<A> | null;
  baseFired: number;
  /** Events `play` fired, handed out by the next step. */
  pending: ClipEvent<A>[];
}

/** What the player holds: a direction (any length; none to stand) and the run modifier. */
export interface Input {
  dx: number;
  dy: number;
  run: boolean;
}

/** An event a clip fired: which, on which frame and facing, with the other events of that frame. */
export interface ClipEvent<A extends SheetRef = SheetRef> {
  actor: Actor<A>;
  clip: Clip<A>;
  row: number;
  frame: number;
  name: string;
  /** Every event name of the same frame: `release` comes with the `spawn:<socket>` that says where. */
  siblings: string[];
  /** The action it is an event of (`start` and `end` too); null for the base clip's events. */
  act: Active<A> | null;
  /** Where the actor stood when it fired. */
  pos: Vec2;
}

/** What the ground allows of a move: where a body of `radius` at `from` ends up when it moves by `delta` (world units). */
export interface Floor {
  /** `clip` is the clip that moves it (a gait, an action's root motion): a host may keep its sprite inside a view, or move it at that sheet's own scale. */
  move(from: Vec2, delta: Vec2, radius: number, clip: Clip<SheetRef>): Vec2;
}

/** A floor with nothing on it: every move goes all the way. */
export const FREE_FLOOR: Floor = { move: (from, delta) => ({ x: from.x + delta.x, y: from.y + delta.y }) };

/**
 * An actor of a character, starting in `clip` (default its idle) at a floor point; or a sprite, from one clip. `row` (or
 * `heading`, a world yaw) is its facing. `id` is the host's: the runtime keeps no count of its own, so two worlds (or two
 * tests) in one process never share one.
 */
export function createActor<A extends SheetRef>(of: Character<A> | Clip<A>, pos: Vec2, o: { id: number; clip?: Clip<A>; row?: number; heading?: number; radius?: number }): Actor<A> {
  const character = 'clips' in of ? of : null;
  const clip = o.clip ?? (character ? (character.idle ?? character.locomotion[0] ?? character.actions[0] ?? character.clips[0]) : (of as Clip<A>));
  const row = o.row ?? (o.heading !== undefined ? rowFor(clip.atlas, o.heading) : 0);
  return { id: o.id, character, clip, pos: { x: pos.x, y: pos.y }, row, time: 0, act: null, held: null, stance: null, radius: o.radius ?? BODY_RADIUS, lastEvent: null, baseClip: null, baseFired: -1, pending: [] };
}

/** death beats hit beats every other action; locomotion and idle are not actions at all. */
export const priorityOf = (clip: Clip<SheetRef>) => (clip.kind === 'death' ? 4 : clip.kind === 'hit' ? 3 : 2);

const cancellable = (act: Active<SheetRef>) => act.clip.cancelFrame !== null && Math.floor(act.time * act.clip.fps) >= act.clip.cancelFrame;

/** What is being drawn for an actor right now. */
export function shown<A extends SheetRef>(actor: Actor<A>) {
  const act = actor.held ?? actor.act;
  if (act) return { clip: act.clip, row: act.row, time: actor.held ? act.clip.frameCount / act.clip.fps : act.time, loops: false };
  return { clip: actor.clip, row: actor.row, time: actor.time, loops: true };
}

/** The frame an actor is showing right now, and where its feet sit inside that frame (exported px of the cell). */
export function shownFrame<A extends SheetRef>(actor: Actor<A>) {
  const { clip, row, time, loops } = shown(actor);
  const rects = clip.rects(row);
  const index = frameIndex(clip, time, loops);
  const rect = rects[index] ?? rects[0];
  const frame = frameOf(clip.asset.path, rect);
  // Without a pivot the feet are at the middle of the cell's bottom: the whole cell, also for a packed sheet's trimmed frame.
  const pivot = clip.atlas.meta.pivot ?? { x: frame.cellW / 2, y: frame.cellH };
  return { clip, rect, frame, pivot, row, index };
}

/**
 * Whether a clip may start now. Death and hit interrupt anything (a hit cannot follow death); any other action
 * only replaces a lower or equal one from its `cancel` event on, or once it has ended. A held clip is final.
 */
export function canStart<A extends SheetRef>(actor: Actor<A>, clip: Clip<A>): boolean {
  if (actor.held) return false;
  const current = actor.act;
  if (!current) return true;
  if (clip.kind === 'death') return current.clip.kind !== 'death';
  if (clip.kind === 'hit') return current.clip.kind !== 'death';
  return priorityOf(clip) >= priorityOf(current.clip) && cancellable(current);
}

const clipNamed = <A extends SheetRef>(actor: Actor<A>, key: string | Clip<A>) => (typeof key === 'string' ? actor.character?.clips.find((c) => c.key === key) : key);

const eventOf = <A extends SheetRef>(actor: Actor<A>, clip: Clip<A>, row: number, frame: number, name: string, siblings: string[], act: Active<A> | null): ClipEvent<A> => ({
  actor,
  clip,
  row,
  frame,
  name,
  siblings,
  act,
  pos: { x: actor.pos.x, y: actor.pos.y },
});

/**
 * Starts an action (a clip, or a clip key of the actor's character) if priority and cancel let it (rules 3 and 4); false
 * when refused. Its `start` and the events of its first frame are fired now and handed out by the next step.
 */
export function play<A extends SheetRef>(actor: Actor<A>, key: string | Clip<A> | null | undefined): boolean {
  const clip = key ? clipNamed(actor, key) : undefined;
  if (!clip || !canStart(actor, clip)) return false;
  actor.act = { clip, time: 0, row: actor.row, travelled: 0, fired: -1 };
  // `start` is not an event of the sheet: it is the moment the action begins, which effects can be cued on.
  actor.pending.push(eventOf(actor, clip, actor.act.row, 0, 'start', [], actor.act));
  fire(actor, actor.act, actor.pending);
  return true;
}

/** The events fired since the last step (by `play`), handed out once. */
export function takeEvents<A extends SheetRef>(actor: Actor<A>): ClipEvent<A>[] {
  const out = actor.pending;
  actor.pending = [];
  return out;
}

/**
 * A looping clip (a clip, or a key of the actor's character) as the base instead of idle: a defend pose, a cast loop.
 * Actions, hit and death still play over it, and the actor returns to it after them; walking shows the gait and stopping
 * the stance again (a stance set while walking shows when the actor stops). `null` goes back to idle. False when the clip
 * is not there or does not loop.
 */
export function stance<A extends SheetRef>(actor: Actor<A>, key: string | Clip<A> | null): boolean {
  if (key === null) {
    const was = actor.stance;
    actor.stance = null;
    const idle = actor.character?.idle;
    if (was && actor.clip === was && idle) {
      actor.clip = idle;
      actor.time = 0;
    }
    return true;
  }
  const clip = clipNamed(actor, key);
  if (!clip || !clip.loop) return false;
  const was = actor.stance;
  actor.stance = clip;
  // Only a resting base gives way to it at once: idle, or the stance it replaces, never the gait being walked.
  const resting = actor.clip === actor.character?.idle || (was !== null && actor.clip === was);
  if (!actor.act && !actor.held && resting && actor.clip !== clip) {
    actor.clip = clip;
    actor.time = 0;
  }
  return true;
}

/** Turns the actor to the row nearest a heading (a world yaw). */
export function face<A extends SheetRef>(actor: Actor<A>, heading: number) {
  actor.row = rowFor(actor.clip.atlas, heading);
}

/** Back to idle: forgets the action, the frozen clip, the stance, the facing of the last event and the events `play` kept. */
export function reset<A extends SheetRef>(actor: Actor<A>) {
  actor.pending = [];
  actor.act = null;
  actor.held = null;
  actor.stance = null;
  actor.time = 0;
  actor.lastEvent = null;
  actor.baseClip = null;
  const idle = actor.character?.idle;
  if (idle) actor.clip = idle;
}

/** Fires the events of every frame reached since the last call. */
function fire<A extends SheetRef>(actor: Actor<A>, act: Active<A>, out: ClipEvent<A>[]) {
  const reached = Math.min(Math.floor(act.time * act.clip.fps), act.clip.frameCount - 1);
  for (let frame = act.fired + 1; frame <= reached; frame++) {
    const names = act.clip.events.filter((e) => e.frame === frame).map((e) => e.name);
    for (const name of names) {
      actor.lastEvent = { name, clip: act.clip.key, frame };
      out.push(eventOf(actor, act.clip, act.row, frame, name, names, act));
    }
  }
  act.fired = reached;
}

/** Root motion (rule 7): the distance this action has covered by now, along the facing it started with. */
function travel<A extends SheetRef>(actor: Actor<A>, act: Active<A>, floor: Floor) {
  const { travel: path, fps, frameCount } = act.clip;
  if (!path) return;
  const f = Math.min(act.time * fps, frameCount);
  const i = Math.floor(f);
  const covered = path[i] + ((path[Math.min(i + 1, frameCount)] ?? path[i]) - path[i]) * (f - i);
  const heading = facingOf(act.clip.atlas, act.row);
  const ahead = covered - act.travelled;
  actor.pos = floor.move(actor.pos, { x: Math.cos(heading) * ahead, y: Math.sin(heading) * ahead }, actor.radius, act.clip);
  act.travelled = covered;
}

/** Fires the events (`step:<leg>`) of the looping base clip for every frame that went by, wrapping around its end. */
function fireBase<A extends SheetRef>(actor: Actor<A>, out: ClipEvent<A>[]) {
  const clip = actor.clip;
  if (actor.baseClip !== clip) {
    actor.baseClip = clip;
    actor.baseFired = -1;
  }
  const total = Math.floor(actor.time * clip.fps);
  if (total < actor.baseFired) actor.baseFired = -1;
  // After a long pause (a background tab) do not replay more than one lap of the clip.
  for (let f = Math.max(actor.baseFired + 1, total - clip.frameCount + 1); f <= total; f++) {
    const frame = f % clip.frameCount;
    const names = clip.events.filter((e) => e.frame === frame).map((e) => e.name);
    for (const name of names) {
      actor.lastEvent = { name, clip: clip.key, frame };
      out.push(eventOf(actor, clip, actor.row, frame, name, names, null));
    }
  }
  actor.baseFired = total;
}

/** One tick of the clocks: the base clip's events, or the action's root motion, events and end. */
function step<A extends SheetRef>(actor: Actor<A>, dt: number, floor: Floor, out: ClipEvent<A>[]) {
  if (actor.held) return;
  actor.time += dt;
  const act = actor.act;
  if (!act) {
    fireBase(actor, out);
    return;
  }
  act.time += dt;
  travel(actor, act, floor);
  fire(actor, act, out);
  if (act.time * act.clip.fps >= act.clip.frameCount) {
    out.push(eventOf(actor, act.clip, act.row, act.clip.frameCount - 1, 'end', [], act));
    if (act.clip.hold) actor.held = act;
    actor.act = null;
    actor.time = 0;
    if (actor.stance && !actor.held) actor.clip = actor.stance;
  }
}

/** Moves the clocks forward: events, root motion, and the end of an action (back to the base clip, or frozen when it holds). */
export function advance<A extends SheetRef>(actor: Actor<A>, dt: number, floor: Floor = FREE_FLOOR): ClipEvent<A>[] {
  const out = takeEvents(actor);
  step(actor, dt, floor, out);
  return out;
}

/**
 * Moves an actor by its input at exactly the speed its gait was authored for (`groundSpeed`, rule 2), so the feet do not
 * slide: the first gait walks, the last one runs. Moving cancels an action once its `cancel` event has passed, never before.
 */
export function steer<A extends SheetRef>(actor: Actor<A>, input: Input, dt: number, floor: Floor = FREE_FLOOR): ClipEvent<A>[] {
  const out = takeEvents(actor);
  const character = actor.character;
  if (!character || actor.held) return out;
  const wantsToMove = (input.dx !== 0 || input.dy !== 0) && character.locomotion.length > 0;

  if (actor.act && wantsToMove && cancellable(actor.act)) {
    actor.act = null;
    actor.time = 0;
  }
  if (!actor.act) {
    let next = actor.stance ?? character.idle ?? character.locomotion[0] ?? character.actions[0] ?? actor.clip;
    if (wantsToMove) {
      const length = Math.hypot(input.dx, input.dy);
      const gait = input.run ? character.locomotion.at(-1)! : character.locomotion[0];
      actor.pos = floor.move(actor.pos, { x: (input.dx / length) * gait.groundSpeed * dt, y: (input.dy / length) * gait.groundSpeed * dt }, actor.radius, gait);
      actor.row = rowFor(gait.atlas, Math.atan2(input.dy, input.dx));
      next = gait;
    }
    if (next !== actor.clip) {
      actor.clip = next;
      actor.time = 0;
    }
  }
  step(actor, dt, floor, out);
  return out;
}

/** The actor's export scale: its character's, or its clip's for a sprite. */
const scaleOf = (actor: Actor<SheetRef>) => actor.character?.scale ?? actor.clip.scale;

/**
 * Where a socket is in a frame of a clip, in the sheet's own px from the top-left corner of the frame's cell (contract §5
 * rule 8: the socket's `[x, y] × meta.scale`), and its depth (> 0: in front of the body). A host that draws the cell with
 * its pivot on a screen point finds the socket at that point less the pivot plus this. Null when the frame has no such socket.
 */
export function frameSocket<A extends SheetRef>(clip: Clip<A>, row: number, frame: number, name: string): { x: number; y: number; depth: number } | null {
  const sockets = clip.atlas.meta.data?.sockets;
  const index = sockets?.names.indexOf(name) ?? -1;
  if (!sockets || index < 0) return null;
  const directions = clip.atlas.meta.directions ?? [];
  const key = directions.length > 1 ? `${directions[row]}_${frame}` : `frame_${frame}`;
  const entry = sockets.frames[key]?.[index];
  if (!entry) return null;
  return { x: entry[0] * clip.scale, y: entry[1] * clip.scale, depth: entry[2] };
}

/**
 * Where a socket of a frame is drawn relative to the actor's feet, in logical px of the screen (`frameSocket` less the
 * cell's pivot), and its depth. Null when the frame has no such socket.
 */
export function socketOffset<A extends SheetRef>(actor: Actor<A>, clip: Clip<A>, row: number, frame: number, name: string): { x: number; y: number; depth: number } | null {
  const socket = frameSocket(clip, row, frame, name);
  if (!socket) return null;
  const pivot = clip.atlas.meta.pivot ?? { x: 0, y: 0 };
  // The sheet's own pixels, in the actor's logical px: a clip exported at another scale than its character keeps its pixels.
  const per = scaleOf(actor);
  return { x: (socket.x - pivot.x) / per, y: (socket.y - pivot.y) / per, depth: socket.depth };
}

/**
 * A point drawn at `offset` (logical px of the screen) from a floor point `feet`: the floor point under it, on the
 * screen's vertical (the socket's height dropped, contract §5 rule 9), and how far above that it is drawn. A point below
 * the feet is on the floor itself. `tilt` is the camera's, which shrinks depth on the screen.
 */
export function overFloor(feet: Vec2, offset: Vec2, tilt: number): { pos: Vec2; lift: number } {
  const ky = tiltFactor(tilt);
  const lift = Math.max(0, -offset.y);
  return { pos: { x: feet.x + offset.x, y: feet.y + (offset.y + lift) / ky }, lift };
}

/** The camera tilt an actor is drawn with. */
export const tiltOf = (actor: { character: Character<SheetRef> | null }) => actor.character?.tilt ?? DEFAULT_TILT;

/**
 * A socket of the frame shown now (or of `at`): the floor point under it (world units), how far above it the socket is
 * drawn (logical px) and its depth (> 0: in front of the body). Null when the frame has no such socket.
 */
export function socketAt<A extends SheetRef>(actor: Actor<A>, name: string, at?: { clip: Clip<A>; row: number; frame: number }): { floor: Vec2; lift: number; depth: number } | null {
  const now = shown(actor);
  const { clip, row, frame } = at ?? { clip: now.clip, row: now.row, frame: frameIndex(now.clip, now.time, now.loops) };
  const offset = socketOffset(actor, clip, row, frame, name);
  if (!offset) return null;
  const { pos, lift } = overFloor(actor.pos, offset, tiltOf(actor));
  return { floor: pos, lift, depth: offset.depth };
}
