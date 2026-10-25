import { useEffect, useImperativeHandle, useRef, type Ref, type RefObject } from 'react';
import type { Vec3 } from '@core/volume';
import { advance, facingOf, hudOf, newActor, reset, startClip, stepPlayer, type Actor, type Bounds, type ClipEvent, type HudInfo, type Input } from '@/lib/playground/actor';
import { spawnFromEvent, stepEffects, type Effect } from '@/lib/playground/effects';
import { floorY, hasCues, playCues, stepFx, type Fx } from '@/lib/playground/vfx';
import type { Armed, Character } from '@/lib/playground/library';
import { isModalOpen, isTyping } from '@/lib/hotkeys';
import { actionIndexOf, inputOf, isKey, keyOf, PLAYGROUND_KEYS } from '@/lib/playground/keys';
import type { World } from '@/lib/scenery/background';
import { useT } from '@/i18n';
import { useLabel } from '@/lib/scenery/labels';
import type { Live } from '@/lib/scenery/living';
import { drawActor, drawEffects, drawFx, drawGround, drawNavLayer, drawStanding, drawWorldGround, pick, stableBox, worldAt, type SceneOptions } from './canvas-draw';

export type { SceneOptions };

/** What the selection popover needs to know about the selected thing on the scene. */
export interface Selection {
  id: number;
  name: string;
  isPlayer: boolean;
  isCharacter: boolean;
  /** Direction names of the sheet, empty when it has a single facing. */
  directions: string[];
  row: number;
  /** The animations an NPC can loop; only characters have more than one. */
  clips: string[];
  clip: string;
  /** Being dragged, or walking under keyboard control: the popover steps aside until it stops. */
  busy: boolean;
}

/** Commands for the selected actor, called from the selection popover. */
export interface SceneHandle {
  remove: () => void;
  duplicate: () => void;
  setRow: (row: number) => void;
  setClip: (name: string) => void;
  control: () => void;
  deselect: () => void;
  /** Uses the nearest thing the controlled character can reach (the E key): a door, a chest, a lever. */
  interact: () => void;
}

interface Props {
  player: Character | null;
  images: Map<string, HTMLImageElement>;
  options: SceneOptions;
  armed: Armed | null;
  /** Changes whenever the scene must be emptied. */
  resetKey: number;
  onPlaced: () => void;
  onSelect: (selection: Selection | null) => void;
  /** What the controlled character is doing, about ten times a second. */
  onHud: (info: HudInfo | null) => void;
  /** A placed character was made the one that is controlled. */
  onControl: (characterId: string) => void;
  handle: Ref<SceneHandle>;
  /** Moved onto the selected thing every frame; a popover anchors to it. */
  anchorRef: RefObject<HTMLDivElement | null>;
}

const HUD_INTERVAL_MS = 100;

/** A scene being played: its things at their states of now, how long it has run (what the loops follow) and what failed to draw. */
interface Runtime {
  world: World;
  live: Live;
  project: (at: Vec3) => { x: number; y: number };
  time: number;
  broken: Set<string>;
  stop: () => void;
}

/** The playground canvas: a ground, a controllable character and whatever was placed. Runs its own frame loop. */
export function Scene({ player, images, options, armed, resetKey, onPlaced, onSelect, onHud, onControl, handle, anchorRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actors = useRef<Actor[]>([]);
  const effects = useRef<Effect[]>([]);
  // The visual effects the characters' cues play (sheets of the project), apart from the generic rings.
  const fx = useRef<Fx[]>([]);
  const playerActor = useRef<Actor | null>(null);
  const selected = useRef<Actor | null>(null);
  const drag = useRef<{ actor: Actor; dx: number; dy: number } | null>(null);
  const nextId = useRef(1);
  const busy = useRef(false);
  // The scene the actors live in, and where its drawing lies in the view (it is centred, so it moves with the zoom and the window).
  const runtime = useRef<Runtime | null>(null);
  const equivalent = useRef(new WeakSet<World>());
  const placed = useRef<{ world: World; at: { x: number; y: number } } | null>(null);
  const held = useRef(new Set<string>());
  // The loop and the handlers read the latest props through this ref instead of restarting on every change.
  const { t } = useT();
  const live = useRef({ images, options, armed, onPlaced, onSelect, onHud, onControl, t });
  live.current = { images, options, armed, onPlaced, onSelect, onHud, onControl, t };

  const isMoving = () => PLAYGROUND_KEYS.move.some((k) => held.current.has(k));
  const isBusy = (actor: Actor | null) => actor !== null && (drag.current?.actor === actor || (actor === playerActor.current && isMoving()));
  const select = (actor: Actor | null) => {
    selected.current = actor;
    busy.current = isBusy(actor);
    live.current.onSelect(actor ? describe(actor, actor === playerActor.current, busy.current) : null);
  };
  /** The scene's mapping onto the view now, with the code that plays it; null without a scene. */
  const mapNow = () => {
    const run = runtime.current;
    const at = placed.current?.at;
    return run && at ? { run, map: run.world.living.mappingOf(run.world.catalog, run.world.geo.origin, at) } : null;
  };
  /** Starts playing a scene: its things in their saved states, and its clips drawn into the cache in idle time. */
  const startRuntime = (world: World): Runtime => {
    const base = world.catalog.camera.at(world.geo.origin);
    const project = (at: Vec3) => base.project(at);
    const live = world.living.startLive(world.scene, world.catalog, project);
    let stopWarm = () => {};
    let cancelled = false;
    void import('@/lib/scenery/warm').then(({ warm }) => {
      if (!cancelled) stopWarm = warm(world.renderer, world.living.clipFrames(live), world.scene.materials, () => true, () => true);
    });
    return { world, live, project, time: 0, broken: new Set(), stop: () => ((cancelled = true), stopWarm()) };
  };
  const stopRuntime = () => {
    runtime.current?.stop();
    runtime.current = null;
    placed.current = null;
  };
  /** The nearest thing the controlled character can use from where it stands. */
  const reachable = () => {
    const now = mapNow();
    const me = playerActor.current;
    if (!now || !me) return null;
    const { living, catalog } = now.run.world;
    return { now, thing: living.usableFrom(now.run.live, catalog.grid, living.toWorld(now.map, me))[0] ?? null };
  };
  const interact = () => {
    const found = reachable();
    const me = playerActor.current;
    if (!found || !me) return;
    const { run, map } = found.now;
    run.world.living.use(run.live, run.world.catalog.grid, run.world.living.toWorld(map, me));
  };
  /** A blow lands where the character faces: what breaks there (an urn) plays its clip and, once broken, can be walked over. */
  const strikeBreakables = (event: ClipEvent) => {
    const now = mapNow();
    if (!now) return;
    const { run, map } = now;
    run.world.living.strike(run.live, run.world.catalog.grid, map, run.world.living.toWorld(map, { x: event.actor.x, y: event.actor.y }), facingOf(event.clip.atlas, event.row));
  };
  /** Moves every actor and effect: the scene they stand on was moved in the view. */
  const shiftAll = (dx: number, dy: number) => {
    for (const actor of actors.current) {
      actor.x += dx;
      actor.y += dy;
    }
    for (const effect of effects.current) {
      effect.x += dx;
      effect.y += dy;
    }
    for (const playing of fx.current) {
      playing.x += dx;
      playing.y += dy;
    }
  };
  /** Puts the controlled character on the scene's floor when it is not on it (a new scene was chosen under it). */
  const settle = () => {
    const now = mapNow();
    const me = playerActor.current;
    if (!now || !me) return;
    const { living, catalog } = now.run.world;
    if (living.standable(now.run.live, catalog.grid, living.toWorld(now.map, me))) return;
    const start = living.toView(now.map, living.spawnPoint(now.run.live, catalog.grid));
    me.x = start.x;
    me.y = start.y;
  };
  /** What a clip's events make appear on the scene. */
  const emit = (event: ClipEvent) => {
    const played = playCues(event, event.actor.character, live.current.options.effects);
    fx.current.push(...played.fx);
    // A character that cues effects has them to show; the generic rings are for the ones that do not (or whose effect sheets are missing).
    if (!hasCues(event.actor.character) || (played.fx.length === 0 && played.missing.length > 0)) spawnFromEvent(event, effects.current);
    if (event.name === 'hit') strikeBreakables(event);
  };
  /** The place a character starts on in the scene's floor, in the view; null without a scene. */
  const spawnInView = () => {
    const now = mapNow();
    return now ? now.run.world.living.toView(now.map, now.run.world.living.spawnPoint(now.run.live, now.run.world.catalog.grid)) : null;
  };
  const remove = (actor: Actor) => {
    actors.current = actors.current.filter((a) => a !== actor);
    if (selected.current === actor) select(null);
  };

  useImperativeHandle(handle, () => ({
    remove: () => {
      const actor = selected.current;
      if (actor && actor !== playerActor.current) remove(actor);
    },
    duplicate: () => {
      const actor = selected.current;
      if (!actor) return;
      const copy = newActor(nextId.current++, actor.clip, actor.x + 24, actor.y + 12, actor.character, actor.row);
      actors.current.push(copy);
      select(copy);
    },
    setRow: (row) => {
      const actor = selected.current;
      if (!actor) return;
      actor.row = row;
      select(actor);
    },
    setClip: (name) => {
      const actor = selected.current;
      const clip = actor?.character?.clips.find((c) => c.key === name);
      if (!actor || !clip || actor === playerActor.current) return;
      actor.clip = clip;
      actor.act = null;
      actor.time = 0;
      select(actor);
    },
    control: () => {
      const actor = selected.current;
      if (!actor?.character || actor === playerActor.current) return;
      playerActor.current = actor;
      live.current.onControl(actor.character.id);
      select(actor);
    },
    deselect: () => select(null),
    interact,
  }));

  useEffect(() => {
    actors.current = [];
    effects.current = [];
    fx.current = [];
    // A cleared scene starts again: doors shut, urns whole.
    stopRuntime();
    playerActor.current = null;
    selected.current = null;
    live.current.onSelect(null);
    live.current.onHud(null);
  }, [resetKey]);

  // Picking another character swaps the player in place. If that character already is the player (after
  // "controlar" on a placed one), nothing changes.
  useEffect(() => {
    if (!player || playerActor.current?.character?.id === player.id) return;
    const previous = playerActor.current;
    if (previous) remove(previous);
    const start = player.idle ?? player.locomotion[0] ?? player.actions[0] ?? player.clips[0];
    const canvas = canvasRef.current;
    const zoom = live.current.options.zoom;
    const at = previous ? { x: previous.x, y: previous.y } : (spawnInView() ?? { x: (canvas?.clientWidth ?? 600) / 2 / zoom, y: (canvas?.clientHeight ?? 400) / 1.6 / zoom });
    playerActor.current = newActor(nextId.current++, start, at.x, at.y, player, previous?.row ?? 0);
    actors.current.push(playerActor.current);
  }, [player]);

  // Keys come from the character's controls (`lib/playground/keys.ts`): WASD or the arrows move, Shift is the fastest
  // gait, Space and 1..9 are its actions in order, H plays hit, K death, R puts the character back to idle and E uses
  // what is in reach.
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      // A modal dialog over the scene (the shortcuts window) or an open menu owns the keyboard.
      if (isTyping(e.target) || isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = keyOf(e);
      const me = playerActor.current;
      if (isKey('move', key) || isKey('run', key)) {
        if (isKey('move', key)) e.preventDefault();
        held.current.add(key);
      } else if (isKey('remove', key)) {
        const actor = selected.current;
        if (actor && actor !== playerActor.current) {
          e.preventDefault();
          remove(actor);
        }
      } else if (isKey('escape', key)) {
        if (selected.current) select(null);
      } else if (me?.character) {
        const { actions, hit, death } = me.character;
        const index = actionIndexOf(e);
        if (index !== null && actions[index]) {
          e.preventDefault();
          startClip(me, actions[index], emit);
        } else if (isKey('hit', key)) startClip(me, hit, emit);
        else if (isKey('death', key)) startClip(me, death, emit);
        else if (isKey('reset', key)) reset(me);
        else if (isKey('use', key)) interact();
      }
    };
    // A key let go is always let go, wherever the focus went meanwhile (a field, a dialog) and whatever modifier is down: none stays held.
    const keyup = (e: KeyboardEvent) => held.current.delete(keyOf(e));
    const blur = () => held.current.clear();
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let lastHud = 0;

    const tick = (now: number) => {
      const { images: sheets, options: opts } = live.current;
      const dt = Math.min(0.05, (now - last) / 1000) * opts.speed;
      last = now;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      drawGround(ctx, width, height, opts.zoom);

      // The scene the actors live in: its ground goes behind them; what stands on it is sorted in among them below.
      let world = opts.world;
      // The catalog is refetched whenever a file of the project changes (an export, anyone's edit): the same scene again is not a new
      // one, so the one being played stays, with its open doors and broken urns and the frames it already drew.
      const kept = runtime.current?.world;
      if (world && kept && kept !== world) {
        if (!equivalent.current.has(world) && kept.catalog === world.catalog && JSON.stringify(kept.scene) === JSON.stringify(world.scene)) equivalent.current.add(world);
        if (equivalent.current.has(world)) world = kept;
      }
      if (!world && runtime.current) stopRuntime();
      if (world && runtime.current?.world !== world) {
        runtime.current?.stop();
        runtime.current = startRuntime(world);
        placed.current = null;
      }
      const run = runtime.current;
      const at = world && run ? worldAt(world, width, height, opts.zoom) : null;
      if (world && run && at) {
        const before = placed.current;
        placed.current = { world, at };
        // The view re-centres the scene when its size or the zoom changes: what stands on it moves along.
        if (before && (before.at.x !== at.x || before.at.y !== at.y)) shiftAll(at.x - before.at.x, at.y - before.at.y);
        // A new scene: the controlled character is put on its floor if it stands off it.
        if (!before) settle();
        drawWorldGround(ctx, world, at, opts.zoom);
      }
      const map = world && run && at ? world.living.mappingOf(world.catalog, world.geo.origin, at) : null;

      const bounds: Bounds = {
        width: width / opts.zoom,
        height: height / opts.zoom,
        // The controlled character cannot walk through walls or shut doors: a step goes as far as the scene's navigation lets it.
        ...(run && map ? { constrain: (from: { x: number; y: number }, to: { x: number; y: number }) => run.world.living.constrain(run.live, run.world.catalog.grid, map, from, to) } : {}),
      };
      const input: Input = inputOf(held.current);
      for (const actor of actors.current) {
        // A dragged player stays where the pointer holds it.
        if (actor === playerActor.current && drag.current?.actor !== actor) stepPlayer(actor, input, dt, bounds, emit);
        else advance(actor, dt);
      }
      effects.current = stepEffects(effects.current, dt, bounds);
      fx.current = stepFx(fx.current, dt, {
        sheets: opts.effects,
        bounds: { width: bounds.width, height: bounds.height },
        // A flying effect ends where the scene's floor stops it: a wall, a shut door, the edge of the floor.
        ...(run && map ? { blocked: (from: { x: number; y: number }, to: { x: number; y: number }) => run.world.living.flightStop(run.live, run.world.catalog.grid, map, from, to) } : {}),
      });
      if (run) {
        run.time += dt;
        run.world.living.stepLive(run.live, dt, run.project);
      }

      // Things further down the screen are nearer the camera and are drawn on top: the actors and the scene's walls,
      // fences, doors and props are sorted together by where they stand on the floor (the y of their pivot).
      for (const playing of fx.current) if (playing.sheet.layer === 'ground') drawFx(ctx, playing, sheets, opts.zoom);
      drawEffects(ctx, effects.current, opts.zoom, 'under');
      // Air effects stand where the floor is under their origin, so they are sorted with the actors and the scene's things.
      const sorted: { y: number; draw: () => void }[] = actors.current.map((actor) => ({ y: actor.y, draw: () => drawActor(ctx, actor, sheets, opts, actor === playerActor.current, actor === selected.current) }));
      for (const playing of fx.current) if (playing.sheet.layer !== 'ground') sorted.push({ y: floorY(playing), draw: () => drawFx(ctx, playing, sheets, opts.zoom) });
      sorted.sort((a, b) => a.y - b.y);
      const draw = (entry: { draw: () => void }) => entry.draw();
      let next = 0;
      if (world && run && at) {
        for (const standing of run.live.standing) {
          const depth = at.y + standing.screen.y * world.scale;
          while (next < sorted.length && sorted[next].y < depth) draw(sorted[next++]);
          if (run.broken.has(standing.item.piece)) continue;
          try {
            drawStanding(ctx, world, run.live, standing, run.time, at, opts.zoom);
          } catch (error) {
            // A piece that cannot be drawn is left out, not allowed to stop the scene.
            run.broken.add(standing.item.piece);
            console.error(`scenery: ${standing.item.piece}`, error);
          }
        }
      }
      while (next < sorted.length) draw(sorted[next++]);
      drawEffects(ctx, effects.current, opts.zoom, 'over');
      if (opts.navigation && world && run && at) drawNavLayer(ctx, world, run.live, at, opts.zoom);

      const chosen = selected.current;
      const anchor = anchorRef.current;
      if (chosen && anchor) {
        // The box does not depend on the frame being shown, so playing an animation never moves the popover.
        const box = stableBox(chosen, sheets);
        if (box) {
          const z = opts.zoom;
          anchor.style.transform = `translate(${Math.round((chosen.x + box.left) * z)}px, ${Math.round((chosen.y + box.top) * z)}px)`;
          anchor.style.width = `${(box.right - box.left) * z}px`;
          anchor.style.height = `${(box.bottom - box.top) * z}px`;
        }
        if (isBusy(chosen) !== busy.current) select(chosen);
      }
      if (now - lastHud > HUD_INTERVAL_MS) {
        lastHud = now;
        const found = reachable();
        const last = runtime.current?.live.last;
        live.current.onHud(
          playerActor.current
            ? {
                ...hudOf(playerActor.current, isMoving(), opts.stepEvents),
                world: runtime.current !== null,
                scene: last ? `${last.name} · ${last.piece} f${last.frame}` : null,
                use: found?.thing ? useLabel(live.current.t, found.thing.kind, found.thing.clip, found.now.run.world.catalog.pieces.find((p) => p.id === found.thing!.piece)?.label ?? found.thing.piece, found.thing.to) : null,
              }
            : null,
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toWorld = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const zoom = live.current.options.zoom;
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const { x, y } = toWorld(e);
    const { armed: item, onPlaced: done, images: sheets } = live.current;
    if (item) {
      let placed: Actor | null = null;
      if (item.type === 'sprite') placed = newActor(nextId.current++, item.clip, x, y, null, item.row);
      else {
        const start = item.character.idle ?? item.character.locomotion[0] ?? item.character.actions[0] ?? item.character.clips[0];
        placed = newActor(nextId.current++, start, x, y, item.character);
      }
      actors.current.push(placed);
      select(placed);
      done();
      return;
    }
    const hit = pick(actors.current, sheets, x, y);
    if (hit) {
      drag.current = { actor: hit, dx: hit.x - x, dy: hit.y - y };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.style.cursor = 'grabbing';
    }
    select(hit ?? null);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toWorld(e);
    const dragging = drag.current;
    if (dragging) {
      dragging.actor.x = Math.max(0, x + dragging.dx);
      dragging.actor.y = Math.max(0, y + dragging.dy);
      return;
    }
    const { armed: item, images: sheets } = live.current;
    e.currentTarget.style.cursor = item ? 'crosshair' : pick(actors.current, sheets, x, y) ? 'grab' : 'default';
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (selected.current) select(selected.current); // the popover comes back where the sprite was dropped
    e.currentTarget.style.cursor = 'grab';
  };

  // Right click removes the thing under the pointer; the controlled character stays.
  const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const zoom = live.current.options.zoom;
    const hit = pick(actors.current, live.current.images, (e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom);
    if (hit && hit !== playerActor.current) remove(hit);
  };

  return (
    // Focusable, so the keys can be handed to it (a click, Tab, or closing the scene select); the ring shows only to the keyboard.
    <canvas
      ref={canvasRef}
      id="playground-canvas"
      tabIndex={0}
      aria-label={t('playground.sceneLabel')}
      className="pixelated block size-full touch-none outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
    />
  );
}

function describe(actor: Actor, isPlayer: boolean, busy: boolean): Selection {
  const base = actor.clip;
  return {
    id: actor.id,
    name: actor.character?.label ?? base.name,
    isPlayer,
    isCharacter: actor.character !== null,
    directions: base.atlas.meta.directions && base.atlas.meta.directions.length > 1 ? base.atlas.meta.directions : [],
    row: actor.row,
    clips: actor.character?.clips.map((c) => c.key) ?? [],
    clip: base.key,
    busy,
  };
}
