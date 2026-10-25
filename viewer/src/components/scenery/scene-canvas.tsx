import { memo, useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef } from 'react';
import { useSelector } from '@tanstack/react-store';
import { createSceneRenderer, type SceneData, type SceneryCatalog, type SpaceHeight } from '@core/volume';
import { MapPinIcon } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Rich, useT } from '@/i18n';
import { isTyping } from '@/lib/hotkeys';
import {
  anchorFor, doorAt, edgeInside, edgeOf, fill, inside, isDoor, pickAt, pieceOf, placeDoor, placeProp, sameEdge, toggleFigure, wallsOnBorders, withLayers,
  type Cell, type Edge, type EraseLayer, type Layer, type Picked, type Selection,
} from '@/lib/scenery/edit';
import { advance, advanceDoor, draggedGhost, isCarrying, isMove, resultOf, same, startMove, startMoveDoor, startMoveFigure, startMoveWall, startPaint, startSweep, sweepSpots, type Stroke } from '@/lib/scenery/gesture';
import { figureAt, figureBox, spriteAt, spriteOf, spritesOf, type Sprite } from '@/lib/scenery/hit';
import type { Tool } from '@/lib/scenery/labels';
import { navigationOf } from '@/lib/scenery/navigation';
import { framesOf, warm } from '@/lib/scenery/warm';
import { drawOverlay, footprintOfProp, propBox, type Ghost, type Mark } from '@/lib/scenery/overlay';
import { cellBox, cellFromPoint, edgeFromPoint, fitScale, geometryOf, paintScene, renderScale, stepZoom, vertexFromPoint } from '@/lib/scenery/render';
import type { CanvasStatusStore } from '@/lib/scenery/status';
import { cn } from '@/lib/utils';
import { SelectionPopover, type UseBrush } from './selection-popover';

/** What a frame has to redraw. */
const MAIN = 1;
const OVERLAY = 2;

/** How near a vertex the pointer must be to take a wall that has no picture under it (in cells). */
const NEAR_VERTEX = 0.45;

export interface Brush {
  floor: string | null;
  wall: string | null;
  door: string | null;
  prop: string | null;
}

/** The kinds of thing a pointer may find under it. */
interface Allow {
  props: boolean;
  walls: boolean;
  figures: boolean;
  floor: boolean;
}
const EVERYTHING: Allow = { props: true, walls: true, figures: true, floor: true };

/** What an eraser takes: the props layer includes scale figures, and "all" is whatever is on top under the pointer. */
const allowOf = (layer: EraseLayer): Allow => ({ props: layer === 'all' || layer === 'props', walls: layer === 'all' || layer === 'walls', figures: layer === 'all' || layer === 'props', floor: layer === 'all' || layer === 'floor' });

/** What a right click takes: the eraser's layer, or the layer the tool in hand paints; whatever is on top for the others. */
const eraseLayerOf = (tool: Tool, layer: EraseLayer): EraseLayer =>
  tool === 'erase' ? layer : tool === 'floor' || tool === 'fill' ? 'floor' : tool === 'wall' ? 'walls' : tool === 'prop' || tool === 'door' || tool === 'figure' ? 'props' : 'all';

interface Props {
  catalog: SceneryCatalog;
  scene: SceneData;
  visible: Record<Layer, boolean>;
  /** The zoom on screen, Fit already worked out (from the box this canvas reports as `view`). */
  zoom: number;
  grid: boolean;
  tool: Tool;
  eraseLayer: EraseLayer;
  brush: Brush;
  /** Facing and variant a prop is placed with; no variant leaves the look to the engine, which picks one from the position. */
  propDir: number;
  propVariant: number | undefined;
  /** The resting state a prop or door is placed in; undefined for the piece's first. */
  placeState: string | undefined;
  /** Doors are put turned to their other side. */
  doorFlip: boolean;
  /** Shows where characters can go (`sceneNavigation`) over the scene. */
  navigation: boolean;
  /** The height walls are painted at, one of their piece's `heights`; undefined for the piece's default. */
  wallHeight: SpaceHeight | undefined;
  selection: Selection | null;
  /** The scene has problems: nothing is redrawn and the last good picture stays. */
  blocked: boolean;
  /** Nothing painted yet: the canvas says where to start. */
  empty: boolean;
  status: CanvasStatusStore;
  /** The scene a gesture leaves behind: one call, one undo step. */
  onCommit: (scene: SceneData) => void;
  /** An edit of the scene that is not a gesture (the popover's): `merge` joins quick repeats into one undo step. */
  onEdit: (update: (scene: SceneData) => SceneData, merge?: string) => void;
  onSelect: (selection: Selection | null) => void;
  onPick: (picked: Picked) => void;
  onZoom: (zoom: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onUseBrush: (brush: UseBrush) => void;
}

type Pan = { x: number; y: number; left: number; top: number };

/**
 * The scene as the engine draws it, under a light overlay that follows the pointer: the grid, what a click would touch,
 * the selection. Nothing here re-renders React while the pointer moves: the stroke, the hovered cell and the scene on
 * screen are refs, edits are pure functions of the stroke, and one animation frame per change draws the canvases (the
 * engine's cached renderer copies frames it already has). The gesture is committed once, when it ends.
 *
 * Everything in the scene is picked by what is seen under the pointer (the pictures the renderer drew, then scale
 * figures, then the floor cell): props, walls, figures and floors can all be selected, and the eraser takes whatever is on top.
 */
export const SceneCanvas = memo(function SceneCanvas(props: Props) {
  const { catalog, scene, visible, zoom, grid, tool, eraseLayer, brush, propDir, propVariant, placeState, doorFlip, navigation, wallHeight, selection, blocked, empty, status, onCommit, onEdit, onSelect, onPick, onZoom, onDuplicate, onRemove, onUseBrush } = props;
  const { t } = useT();
  const geo = useMemo(() => geometryOf({ cols: scene.cols, rows: scene.rows }, catalog), [scene.cols, scene.rows, catalog]);
  // The scene is drawn at the export scale at most and shown larger with hard edges: the same pixels a game gets, for a fraction of the work and memory.
  const scale = fitScale(geo, renderScale(zoom * (window.devicePixelRatio || 1)));
  // Frames are canvases at the drawing scale: the cache keeps a few hundred, not the engine's default of 1500.
  const renderer = useMemo(() => createSceneRenderer(catalog, { limit: 800 }), [catalog]);

  const box = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const dragging = useSelector(status, (state) => state.dragging);
  // Where the last paint stroke ended (a vertex for walls on borders): Shift draws a straight line from there.
  const lastPaint = useRef<{ layer: 'floor' | 'walls'; at: Cell } | null>(null);
  // The vertex nearest the pointer, and what is under it by its picture (with the select and erase tools).
  const vertex = useRef<Cell | null>(null);
  const hoverTarget = useRef<Selection | null>(null);
  // The cell edge nearest the pointer, for the door tool.
  const edge = useRef<Edge | null>(null);
  // Where the eraser's last sample was (logical px): the next ones are taken along the line from there.
  const lastSample = useRef<{ x: number; y: number } | null>(null);
  // The pictures of the props and walls on screen, to pick them by what is drawn and not by the cells they stand in.
  const sprites = useRef<{ scene: SceneData; scale: number; renderer: typeof renderer; geo: typeof geo; list: Sprite[] } | null>(null);
  // The box of the selected prop's picture, measured once per prop, scale, zoom and renderer (`ready`: from the drawing at that scale).
  const measured = useRef<{ prop: SceneData['props'][number]; scale: number; zoom: number; renderer: typeof renderer; ready: boolean; box: ReturnType<typeof propBox> } | null>(null);
  // When the pointer last did something on the canvas: warming waits for it to be quiet.
  const touched = useRef(0);
  const stroke = useRef<Stroke | null>(null);
  const pan = useRef<Pan | null>(null);
  const hover = useRef<Cell | null>(null);
  const spaceHeld = useRef(false);
  // The scene the main canvas shows: the committed one, or the stroke's while it lasts and until its commit arrives.
  const shown = useRef(scene);
  // What the main canvas was last drawn from, and at which scale the renderer's cache stands.
  const drawn = useRef<{ scene: SceneData; visible: Props['visible']; scale: number; renderer: typeof renderer } | null>(null);
  const frame = useRef(0);
  const pending = useRef(0);
  const flush = useRef<(todo: number) => void>(() => {});

  const schedule = useCallback((todo: number) => {
    pending.current |= todo;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const now = pending.current;
      pending.current = 0;
      flush.current(now);
    });
  }, []);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  /** The pictures of the scene on screen: the renderer's frames at the scale of the last drawing of the main canvas, so null before it. */
  const spritesOfScene = (live: SceneData): Sprite[] | null => {
    if (drawn.current?.scale !== scale || drawn.current.renderer !== renderer) return null;
    let cached = sprites.current;
    if (!cached || cached.scene !== live || cached.scale !== scale || cached.renderer !== renderer || cached.geo !== geo) {
      try {
        cached = { scene: live, scale, renderer, geo, list: spritesOf(live, catalog, renderer, geo, scale) };
      } catch {
        return null;
      }
      sprites.current = cached;
    }
    return cached.list;
  };

  /**
   * What is under a point of the drawing (logical px), by what is seen: a scale figure, else the top-most picture of a
   * prop or wall, else a wall on the vertex the point is near, else the floor of the cell. Null when nothing.
   */
  const targetAt = (x: number, y: number, allow: Allow): Selection | null => {
    const live = shown.current;
    if (allow.figures) {
      const figure = figureAt(live, catalog, geo, x, y);
      if (figure !== undefined) return { kind: 'figure', index: figure };
    }
    const list = allow.props || allow.walls ? spritesOfScene(live) : null;
    const hit = list ? spriteAt(list, scale, x, y, { prop: allow.props && visible.props, wall: allow.walls && visible.walls }) : undefined;
    if (hit) return hit.kind === 'prop' ? { kind: 'prop', index: hit.index } : { kind: 'wall', at: hit.at };
    if (allow.walls && visible.walls && wallsOnBorders(live)) {
      const near = vertexFromPoint(geo, x, y);
      if (near.distance <= NEAR_VERTEX && live.walls[near.vertex.row]?.[near.vertex.col]) return { kind: 'wall', at: near.vertex };
    }
    const cell = cellFromPoint(geo, x, y);
    return allow.floor && visible.floor && inside(live, cell) && live.floor[cell.row][cell.col] ? { kind: 'floor', at: cell } : null;
  };

  /** How a selected or hovered thing is outlined: its cells, a rim round its picture, the vertex a wall stands on, or a figure's box. */
  const markOf = (target: Selection, live: SceneData, list: Sprite[] | null): Mark => {
    switch (target.kind) {
      case 'prop': {
        const prop = live.props[target.index];
        const sprite = list && spriteOf(list, target);
        // A door stands on an edge, not in cells.
        return { ...(prop ? (isDoor(prop) ? { edge: edgeOf(prop) } : { footprint: footprintOfProp(catalog, prop) }) : {}), ...(sprite ? { sprite } : {}) };
      }
      case 'wall': {
        const sprite = list && spriteOf(list, target);
        return { ...(wallsOnBorders(live) ? { vertex: target.at } : { footprint: { at: target.at, across: 1, deep: 1 } }), ...(sprite ? { sprite } : {}) };
      }
      case 'figure': {
        const figure = live.figures?.[target.index];
        const figureRect = figure && figureBox(catalog, geo, figure);
        return { ...(figure ? { footprint: { at: figure, across: 1, deep: 1 } } : {}), ...(figureRect ? { box: figureRect } : {}) };
      }
      case 'floor':
        return { footprint: { at: target.at, across: 1, deep: 1 } };
    }
  };

  /** Where the selection's popover is anchored, in CSS px of the canvas: over the picture, the figure or the cell. */
  const anchorBox = (target: Selection, live: SceneData, list: Sprite[] | null, view: Parameters<typeof propBox>[0]): { x: number; y: number; width: number; height: number } | null => {
    const cells = (at: Cell, across = 1, deep = 1) => {
      const b = cellBox(geo, at, across, deep);
      return { x: b.x * zoom, y: b.y * zoom, width: b.width * zoom, height: b.height * zoom };
    };
    const k = zoom / scale;
    switch (target.kind) {
      case 'prop': {
        const prop = live.props[target.index];
        if (!prop) return null;
        let measure = measured.current;
        // The picture is read from the renderer's cache, so only once the main canvas is drawn at this scale. A zoom moves the
        // anchor before that drawing: until it is made, the box measured at the zoom before is scaled, and measured again after.
        const ready = drawn.current?.scale === scale;
        if (!measure || measure.prop !== prop || measure.scale !== scale || measure.zoom !== zoom || measure.renderer !== renderer || (ready && !measure.ready)) {
          const before = measure?.prop === prop && measure.renderer === renderer ? measure.box : null;
          const r = measure ? zoom / measure.zoom : 1;
          const box = ready ? propBox(view, zoom, prop) : before && { x: before.x * r, y: before.y * r, width: before.width * r, height: before.height * r };
          measure = { prop, scale, zoom, renderer, ready, box };
          measured.current = measure;
        }
        const foot = footprintOfProp(catalog, prop);
        return measure.box ?? cells(foot.at, foot.across, foot.deep);
      }
      case 'wall': {
        const sprite = list && spriteOf(list, target);
        return sprite ? { x: sprite.left * k, y: sprite.top * k, width: sprite.width * k, height: sprite.height * k } : cells(target.at);
      }
      case 'figure': {
        const figure = live.figures?.[target.index];
        const rect = figure && figureBox(catalog, geo, figure);
        return rect ? { x: rect.x * zoom, y: rect.y * zoom, width: rect.width * zoom, height: rect.height * zoom } : null;
      }
      case 'floor':
        return cells(target.at);
    }
  };

  // The frame callback is replaced after every render, so it always sees the latest props without being a dependency of anything.
  useLayoutEffect(() => {
    flush.current = (todo) => {
      const canvas = main.current;
      const over = overlay.current;
      if (!canvas || !over) return;
      const current = drawn.current;
      if (todo & MAIN && !blocked && !(current && current.scene === shown.current && current.visible === visible && current.scale === scale && current.renderer === renderer)) {
        const started = performance.now();
        const error = paintScene(canvas, renderer, geo, withLayers(shown.current, visible), scale);
        const ms = Math.round(performance.now() - started);
        drawn.current = { scene: shown.current, visible, scale, renderer };
        // The drawing time is for a quiet moment, not for every frame of a stroke.
        status.setState((s) => (s.error === error && (stroke.current || s.ms === ms) ? s : { ...s, error, ms: stroke.current ? s.ms : ms }));
      }
      if (!(todo & OVERLAY)) return;
      const live = shown.current;
      const carried = stroke.current ? draggedGhost(stroke.current, catalog) : null;
      const armed = tool === 'prop' && brush.prop ? pieceOf(catalog, brush.prop) : undefined;
      const wall = tool === 'wall' && brush.wall ? pieceOf(catalog, brush.wall) : undefined;
      const doorInfo = tool === 'door' && brush.door ? pieceOf(catalog, brush.door) : undefined;
      const door = edge.current;
      const point = hover.current;
      const corner = vertex.current;
      const onBorders = wallsOnBorders(live);
      // Walls on borders are painted on the vertex nearest the pointer.
      const atVertices = onBorders && tool === 'wall';
      const ghost: Ghost | null =
        carried ??
        (stroke.current
          ? null
          : armed && point
            ? { kind: 'prop', info: armed, at: anchorFor(live, armed, point, propDir), dir: propDir, variant: propVariant, ...(placeState !== undefined && armed.states?.includes(placeState) ? { state: placeState } : {}) }
            : wall && (onBorders ? corner : point)
              ? { kind: 'wall', info: wall, at: onBorders ? corner! : point!, height: wallHeight }
              : doorInfo && door && edgeInside(live, door) && doorAt(live, door) < 0
                ? { kind: 'door', info: doorInfo, edge: door, flip: doorFlip, ...(placeState !== undefined && doorInfo.states?.includes(placeState) ? { state: placeState } : {}) }
                : null);
      const list = selection || hoverTarget.current ? spritesOfScene(live) : null;
      // What is being carried is not where it was selected: its mark and popover step aside until it lands.
      const selected = !carried && !isCarrying(stroke.current) ? selection : null;
      // With the select and erase tools, what is under the pointer is outlined (red for the eraser) and the cursor says it can be grabbed.
      const under = (tool === 'select' || tool === 'erase') && !stroke.current ? hoverTarget.current : null;
      box.current?.toggleAttribute('data-over-prop', under !== null && tool === 'select');
      const view = { geo, scale, catalog, renderer, scene: live };
      drawOverlay(over, {
        ...view,
        grid,
        selection: selected ? markOf(selected, live, list) : null,
        hoverMark: under && !(selected && selected.kind === under.kind && JSON.stringify(selected) === JSON.stringify(under)) ? markOf(under, live, list) : null,
        erasing: tool === 'erase',
        hover: ghost || (stroke.current && isMove(stroke.current)) || tool === 'select' || tool === 'erase' || tool === 'figure' || tool === 'door' || atVertices ? null : point,
        hoverVertex: atVertices && !(stroke.current && isMove(stroke.current)) ? corner : null,
        hoverEdge: tool === 'door' && door && edgeInside(live, door) && !stroke.current ? door : null,
        navigation: navigation ? navigationOf(live, catalog) : null,
        figure: tool === 'figure' && point ? point : null,
        // The ghost is copied from the renderer's cache, which stands at the scale of the last drawing of the main canvas.
        ghost: drawn.current?.scale === scale ? ghost : null,
      });
      // The popover's anchor lies over what is selected.
      const place = anchor.current;
      const at = selected && anchorBox(selected, live, list, view);
      if (place && at) {
        place.style.transform = `translate(${at.x}px, ${at.y}px)`;
        place.style.width = `${at.width}px`;
        place.style.height = `${at.height}px`;
      }
    };
  });

  // The scene, its layers or its size changed: draw. A scene that is the stroke's own stays as it is.
  useLayoutEffect(() => {
    if (!stroke.current) shown.current = scene;
    schedule(MAIN | OVERLAY);
  }, [scene, visible, geo, scale, renderer, blocked, schedule]);
  // A zoom that keeps the drawing scale redraws nothing, but the selection's popover must follow it.
  useLayoutEffect(() => schedule(OVERLAY), [grid, tool, eraseLayer, brush.prop, brush.wall, brush.door, wallHeight, propDir, propVariant, placeState, doorFlip, navigation, selection, zoom, schedule]);
  // The pieces the brushes hold are drawn into the renderer's cache in idle time, so the first stroke does not pay for their frames.
  useEffect(() => {
    if (blocked) return;
    const items = [brush.floor, brush.wall, brush.prop].flatMap((id) => {
      const info = id ? pieceOf(catalog, id) : undefined;
      return info ? framesOf(info, catalog) : [];
    });
    return warm(
      renderer,
      items,
      shown.current.materials,
      () => drawn.current?.scale === scale && drawn.current.renderer === renderer,
      () => performance.now() - touched.current > 600,
    );
  }, [renderer, scale, catalog, blocked, brush.floor, brush.wall, brush.prop]);
  // The popover opens in this commit: its anchor must already be over what is selected, not at the corner for a frame (nor at the old place after a zoom).
  useLayoutEffect(() => {
    if (selection) flush.current(OVERLAY);
  }, [selection, scene.props, scene.walls, scene.figures, zoom]);

  // Space held pans with the pointer: a data attribute, not state, so holding it re-renders nothing.
  useEffect(() => {
    const hold = (on: boolean) => {
      spaceHeld.current = on;
      box.current?.setAttribute('data-space', String(on));
    };
    const down = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.repeat || isTyping(e.target)) return;
      e.preventDefault();
      hold(true);
    };
    const up = (e: KeyboardEvent) => e.key === ' ' && hold(false);
    const lost = () => hold(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', lost);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', lost);
    };
  }, []);

  // Ctrl or Cmd with the wheel zooms. Not a React prop: React's wheel listener is passive and cannot cancel the page's own zoom.
  const zoomBy = useEffectEvent((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const next = stepZoom(zoom, e.deltaY < 0 ? 1 : -1);
    if (next !== zoom) onZoom(next);
  });
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const listener = (e: WheelEvent) => zoomBy(e);
    element.addEventListener('wheel', listener, { passive: false });
    return () => element.removeEventListener('wheel', listener);
  }, []);

  // The box goes to the status, where Fit reads it. Measured in a layout effect, before the first drawing (a ResizeObserver
  // alone reports after the frame is drawn, which would draw it once at the wrong scale), and with the scrollbars in
  // (`offset*`, not `client*`): a scrollbar that comes or goes with the zoom must not change what Fit fits.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const report = () => {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      status.setState((s) => (s.view?.width === width && s.view.height === height ? s : { ...s, view: { width, height } }));
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element, { box: 'border-box' });
    return () => observer.disconnect();
  }, [status]);

  // Synthetic pointers (tests, remote desktops) have nothing to capture.
  const capture = (e: React.PointerEvent, on: boolean) => {
    try {
      if (on) e.currentTarget.setPointerCapture(e.pointerId);
      else e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // The gesture still works, only without leaving the canvas.
    }
  };

  /** An edit that is over at once (a click): it is on screen in this frame and is one undo step. */
  const apply = (next: SceneData) => {
    if (next === scene) return;
    shown.current = next;
    schedule(MAIN | OVERLAY);
    onCommit(next);
  };

  /** The stroke moves on: what it shows is drawn in the next frame. A carried prop is out of the scene, so its popover steps aside. */
  const follow = (next: Stroke) => {
    stroke.current = next;
    shown.current = next.scene;
    const carrying = isCarrying(next);
    box.current?.toggleAttribute('data-carrying', carrying);
    status.setState((s) => (s.dragging === carrying ? s : { ...s, dragging: carrying }));
    schedule(MAIN | OVERLAY);
  };

  const pointerOf = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const { vertex: corner, distance } = vertexFromPoint(geo, x, y);
    return { x, y, cell: cellFromPoint(geo, x, y), vertex: corner, distance, edge: edgeFromPoint(geo, x, y).edge };
  };

  /** The eyedropper: what is drawn under the pointer (a prop, a wall by its picture), else the floor of the cell. */
  const pickAtPointer = (p: ReturnType<typeof pointerOf>) => {
    const hit = targetAt(p.x, p.y, { props: visible.props, walls: visible.walls, figures: false, floor: false });
    const picked: Picked | null =
      hit?.kind === 'prop'
        ? { kind: 'prop', index: hit.index }
        : pickAt(scene, catalog, p.cell, { ...visible, props: false }, hit?.kind === 'wall' ? hit.at : wallsOnBorders(scene) ? null : p.cell);
    if (picked) onPick(picked);
  };

  /**
   * What the eraser takes along a line of samples (logical px) over the scene as it is now: what is on top at each sample,
   * once; a cell whose ground already went with a prop in this stroke keeps its floor. The scene changes once, after all of them.
   */
  const sweepAlong = (current: Extract<Stroke, { kind: 'sweep' }>, samples: { x: number; y: number }[], allow: Allow): Stroke => {
    const spots = new Map<string, { key: string; target: Selection }>();
    for (const { x, y } of samples) {
      const target = targetAt(x, y, allow);
      if (!target) continue;
      const cell = target.kind === 'floor' ? target.at : cellFromPoint(geo, x, y);
      const key = `${cell.col},${cell.row}`;
      const id = target.kind === 'wall' || target.kind === 'floor' ? `${target.kind}:${target.at.col},${target.at.row}` : `${target.kind}:${target.index}`;
      if (target.kind === 'floor' && (current.visited.has(key) || [...spots.values()].some((s) => s.key === key))) continue;
      spots.set(id, { key, target });
    }
    return sweepSpots(current, [...spots.values()]);
  };

  const startErasing = (e: React.PointerEvent, p: ReturnType<typeof pointerOf>, allow: Allow) => {
    capture(e, true);
    lastSample.current = { x: p.x, y: p.y };
    follow(sweepAlong(startSweep(scene) as Extract<Stroke, { kind: 'sweep' }>, [{ x: p.x, y: p.y }], allow));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    touched.current = performance.now();
    // Focus follows the pointer onto the canvas, so a control used before (a menu that gave the focus back to its button) lets go of it.
    e.currentTarget.focus({ preventScroll: true });
    if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
      e.preventDefault();
      pan.current = { x: e.clientX, y: e.clientY, left: box.current!.scrollLeft, top: box.current!.scrollTop };
      box.current!.setAttribute('data-panning', 'true');
      capture(e, true);
      return;
    }
    const erasing = e.button === 2;
    if (e.button !== 0 && !erasing) return;
    const p = pointerOf(e);
    const { cell } = p;
    hover.current = cell;
    vertex.current = p.vertex;
    edge.current = p.edge;
    // Walls on borders are painted on the vertex nearest the pointer.
    const border = wallsOnBorders(scene);
    // Alt or Cmd borrows the eyedropper, whatever the tool.
    if (!erasing && (e.altKey || e.metaKey)) {
      pickAtPointer(p);
      return;
    }
    // The right button erases what the tool works on (whatever is on top for the select tool).
    if (erasing) {
      if (tool === 'pick') return;
      startErasing(e, p, allowOf(eraseLayerOf(tool, eraseLayer)));
      return;
    }
    switch (tool) {
      case 'floor':
      case 'wall': {
        const layer = tool === 'floor' ? 'floor' : 'walls';
        const id = tool === 'floor' ? brush.floor : brush.wall;
        if (!id) return;
        capture(e, true);
        const at = layer === 'walls' && border ? p.vertex : cell;
        // Shift joins the last painted cell (vertex) to this one with a straight line.
        const from = e.shiftKey && lastPaint.current?.layer === layer ? lastPaint.current.at : null;
        const started = startPaint(scene, layer, id, from ?? at, layer === 'walls' ? wallHeight : undefined);
        follow(from ? advance(started, at, catalog) : started);
        return;
      }
      case 'erase':
        startErasing(e, p, allowOf(eraseLayer));
        return;
      case 'fill':
        if (brush.floor) apply(fill(scene, 'floor', cell, brush.floor));
        return;
      case 'prop': {
        const info = brush.prop ? pieceOf(catalog, brush.prop) : undefined;
        if (info) apply(placeProp(scene, info, anchorFor(scene, info, cell, propDir), { dir: propDir, variant: propVariant, state: placeState }));
        return;
      }
      case 'door': {
        // The door goes on the edge nearest the pointer, and not on an edge that has one.
        const info = brush.door ? pieceOf(catalog, brush.door) : undefined;
        if (info) apply(placeDoor(scene, info, p.edge, { flip: doorFlip, state: placeState }));
        return;
      }
      case 'select': {
        // What is selected is what is seen under the pointer, not the cell it stands in.
        const hit = targetAt(p.x, p.y, EVERYTHING);
        onSelect(hit);
        if (!hit || hit.kind === 'floor') return;
        capture(e, true);
        // Props, walls and scale figures are carried; they keep the offset between the pointer and where they were grabbed.
        follow(hit.kind === 'prop' ? (isDoor(scene.props[hit.index]) ? startMoveDoor(scene, hit.index) : startMove(scene, hit.index, cell)) : hit.kind === 'wall' ? startMoveWall(scene, hit.at, border ? p.vertex : cell) : startMoveFigure(scene, hit.index, cell));
        return;
      }
      case 'pick':
        pickAtPointer(p);
        return;
      case 'figure':
        apply(toggleFigure(scene, cell));
        return;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    touched.current = performance.now();
    const panning = pan.current;
    if (panning) {
      box.current!.scrollLeft = panning.left - (e.clientX - panning.x);
      box.current!.scrollTop = panning.top - (e.clientY - panning.y);
      return;
    }
    const p = pointerOf(e);
    // The eraser takes what is under the pointer all along the way: a sample every few pixels from the last one.
    const sweeping = stroke.current;
    if (sweeping?.kind === 'sweep') {
      const allow = allowOf(eraseLayerOf(tool, eraseLayer));
      const from = lastSample.current ?? { x: p.x, y: p.y };
      const steps = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / 5));
      const next = sweepAlong(sweeping, Array.from({ length: steps }, (_, i) => ({ x: from.x + ((p.x - from.x) * (i + 1)) / steps, y: from.y + ((p.y - from.y) * (i + 1)) / steps })), allow);
      lastSample.current = { x: p.x, y: p.y };
      hover.current = p.cell;
      if (next !== sweeping) follow(next);
      return;
    }
    const border = wallsOnBorders(shown.current);
    const onVertices = border && tool === 'wall';
    const newCell = !same(p.cell, hover.current);
    const newEdge = tool === 'door' && !sameEdge(p.edge, edge.current);
    edge.current = p.edge;
    // With the select and erase tools what is under the pointer depends on the pixel, not on the cell.
    const found = (tool === 'select' || tool === 'erase') && !stroke.current ? targetAt(p.x, p.y, tool === 'erase' ? allowOf(eraseLayer) : EVERYTHING) : null;
    const newHit = JSON.stringify(found) !== JSON.stringify(hoverTarget.current);
    const newVertex = onVertices && !same(p.vertex, vertex.current);
    hover.current = p.cell;
    vertex.current = p.vertex;
    hoverTarget.current = found;
    if (!newCell && !newVertex && !newHit && !newEdge) return;
    if (newCell) status.setState((s) => ({ ...s, hover: p.cell }));
    const current = stroke.current;
    if (current) {
      // A stroke of walls on borders follows the vertices; every other stroke follows the cells.
      const onCorners = (current.kind === 'paint' && current.layer === 'walls' && wallsOnBorders(current.scene)) || (current.kind === 'move-wall' && border);
      const next = current.kind === 'move-door' ? advanceDoor(current, p.edge, catalog) : advance(current, onCorners ? p.vertex : p.cell, catalog);
      if (next !== current) {
        follow(next);
        return;
      }
    }
    schedule(OVERLAY);
  };

  const finish = (e: React.PointerEvent) => {
    if (pan.current) {
      pan.current = null;
      box.current!.removeAttribute('data-panning');
      capture(e, false);
      return;
    }
    const current = stroke.current;
    if (!current) return;
    stroke.current = null;
    capture(e, false);
    if (current.kind === 'paint') lastPaint.current = { layer: current.layer, at: current.last };
    lastSample.current = null;
    box.current?.removeAttribute('data-carrying');
    status.setState((s) => (s.dragging ? { ...s, dragging: false } : s));
    // The canvas stays on the result until the committed scene arrives as a prop, so there is no flash of the old one.
    const result = resultOf(current, catalog);
    shown.current = result;
    schedule(MAIN | OVERLAY);
    if (result !== scene) onCommit(result);
    // A wall that was carried is selected where it landed.
    if (current.kind === 'move-wall' && result !== scene) onSelect({ kind: 'wall', at: current.at });
  };

  const leave = () => {
    hover.current = null;
    vertex.current = null;
    edge.current = null;
    hoverTarget.current = null;
    status.setState((s) => (s.hover ? { ...s, hover: null } : s));
    schedule(OVERLAY);
  };

  // Where the scene itself lies in the drawing (the rest is room for tall pieces): it sits on the checkerboard that shows transparency.
  const stage = useMemo(() => {
    const b = cellBox(geo, { col: 0, row: 0 }, scene.cols, scene.rows);
    return { left: b.x * zoom, top: b.y * zoom, width: b.width * zoom, height: b.height * zoom };
  }, [geo, scene.cols, scene.rows, zoom]);

  return (
    <div className="relative min-h-0 flex-1">
      {/* A flex box, so the drawing is centred both ways while it fits and scrolls from its corner when it is larger (auto margins fall to 0; it never shrinks). */}
      <div ref={box} className="group absolute inset-0 flex overflow-auto bg-muted/30">
        <div className="relative m-auto shrink-0" style={{ width: geo.width * zoom, height: geo.height * zoom }}>
          <div aria-hidden className="checker absolute rounded-xs shadow-lg ring-1 ring-foreground/15" style={stage} />
          <canvas ref={main} className="pixelated absolute inset-0" style={{ width: geo.width * zoom, height: geo.height * zoom }} aria-label={t('scenery.sceneLabel')} />
          <canvas
            ref={overlay}
            tabIndex={-1}
            className={cn(
              'pixelated absolute inset-0 touch-none outline-none group-data-over-prop:cursor-grab group-data-carrying:cursor-grabbing group-data-[space=true]:cursor-grab group-data-[panning=true]:cursor-grabbing',
              tool === 'select' ? 'cursor-default' : 'cursor-crosshair',
            )}
            style={{ width: geo.width * zoom, height: geo.height * zoom }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onPointerLeave={leave}
            onContextMenu={(e) => e.preventDefault()}
          />
          <SelectionPopover
            catalog={catalog}
            scene={scene}
            selection={selection}
            open={tool === 'select' && !dragging}
            anchorRef={anchor}
            boundaryRef={box}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
            onUseBrush={onUseBrush}
            onClose={() => onSelect(null)}
          />
        </div>
      </div>
      {/* In the visible part of the canvas, not in the middle of a scene that may be scrolled away. */}
      {empty && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Empty className="w-fit flex-none rounded-lg border bg-background/80 backdrop-blur-sm">
            <EmptyHeader>
              <EmptyMedia variant="icon"><MapPinIcon /></EmptyMedia>
              <EmptyTitle>{t('scenery.empty.title')}</EmptyTitle>
              <EmptyDescription>
                <Rich id="scenery.empty.description" />
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}
    </div>
  );
});
