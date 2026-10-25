import { currentFrame, type Actor } from '@/lib/playground/actor';
import type { Effect } from '@/lib/playground/effects';
import type { Clip } from '@/lib/playground/library';
import type { World } from '@/lib/scenery/background';
import { frameOfFx, type EffectSheet, type Fx } from '@/lib/playground/vfx';
import type { Live, Standing } from '@/lib/scenery/living';
import { drawNavigation } from '@/lib/scenery/nav-draw';

export interface SceneOptions {
  /** Screen px per actor unit: the zoom chosen, or the one "Fit" worked out. */
  zoom: number;
  shadow: boolean;
  anchor: boolean;
  bounds: boolean;
  sockets: boolean;
  /** The HUD names the base clip's strides (`step:<leg>`) too; off, its event is the last one that is not a stride. */
  stepEvents: boolean;
  /** Time scale of the whole scene: 1 is real time, lower values slow it down to read frames and events, 0 freezes it. */
  speed: number;
  /** A saved scenery scene the actors live in (its ground behind them, its walls and props sorted in among them), or null. */
  world: World | null;
  /** Draws where characters can go (the scene's navigation) over everything. */
  navigation: boolean;
  /** The project's visual effects by id: what characters cue on their clips' events. */
  effects: Map<string, EffectSheet>;
}

export const AMBER = '#f2a93b';
/** A pixel counts as part of a sprite when it is at least this opaque. */
export const SOLID_ALPHA = 16;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const solidCache = new Map<string, Box>();
let scan: CanvasRenderingContext2D | null = null;

/** The smallest box, in frame pixels, that holds every solid pixel of a frame. Cached: frames do not change. */
function solidBounds(image: HTMLImageElement, rect: { x: number; y: number; width: number; height: number }): Box {
  const key = `${image.src}|${rect.x},${rect.y},${rect.width},${rect.height}`;
  const cached = solidCache.get(key);
  if (cached) return cached;
  scan ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  let box: Box = { left: 0, top: 0, right: rect.width, bottom: rect.height };
  if (scan) {
    scan.canvas.width = rect.width;
    scan.canvas.height = rect.height;
    scan.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    const { data } = scan.getImageData(0, 0, rect.width, rect.height);
    const found: Box = { left: rect.width, top: rect.height, right: 0, bottom: 0 };
    // Every other pixel is enough for a box, and four times cheaper across all frames of a character.
    for (let y = 0; y < rect.height; y += 2) {
      for (let x = 0; x < rect.width; x += 2) {
        if (data[(y * rect.width + x) * 4 + 3] < SOLID_ALPHA) continue;
        found.left = Math.min(found.left, x);
        found.right = Math.max(found.right, x + 2);
        found.top = Math.min(found.top, y);
        found.bottom = Math.max(found.bottom, y + 2);
      }
    }
    if (found.right > found.left && found.bottom > found.top) box = found;
  }
  solidCache.set(key, box);
  return box;
}

const stableCache = new Map<string, Box>();

/**
 * Everything an actor can ever cover, relative to its anchor: the union of the solid pixels of every frame,
 * direction and animation it has. Null until all of its sheets are loaded, so a partial box is never kept.
 */
export function stableBox(actor: Actor, images: Map<string, HTMLImageElement>): Box | null {
  const clips = actor.character?.clips ?? [actor.clip];
  const key = actor.character ? `character:${actor.character.id}` : actor.clip.asset.url;
  const cached = stableCache.get(key);
  if (cached) return cached;
  if (clips.some((clip) => !images.has(clip.asset.url))) return null;
  const union: Box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const clip of clips) {
    const image = images.get(clip.asset.url)!;
    const rows = Math.max(1, clip.atlas.meta.directions?.length ?? 1);
    for (let row = 0; row < rows; row++) {
      for (const rect of clip.rects(row)) {
        const pivot = clip.atlas.meta.pivot ?? { x: rect.width / 2, y: rect.height };
        const box = solidBounds(image, rect);
        union.left = Math.min(union.left, box.left - pivot.x);
        union.top = Math.min(union.top, box.top - pivot.y);
        union.right = Math.max(union.right, box.right - pivot.x);
        union.bottom = Math.max(union.bottom, box.bottom - pivot.y);
      }
    }
  }
  stableCache.set(key, union);
  return union;
}

let probe: CanvasRenderingContext2D | null = null;

/** Alpha of one pixel of a sheet. */
function alphaAt(image: HTMLImageElement, x: number, y: number): number {
  probe ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  if (!probe) return 255;
  probe.clearRect(0, 0, 1, 1);
  probe.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
  return probe.getImageData(0, 0, 1, 1).data[3];
}

/** The nearest actor under a world point whose pixel there is solid, so clicking the empty corners of a frame misses. */
export function pick(actors: Actor[], images: Map<string, HTMLImageElement>, x: number, y: number): Actor | undefined {
  for (const actor of [...actors].sort((a, b) => b.y - a.y)) {
    const { clip, rect, pivot } = currentFrame(actor);
    const lx = x - (actor.x - pivot.x);
    const ly = y - (actor.y - pivot.y);
    if (lx < 0 || ly < 0 || lx >= rect.width || ly >= rect.height) continue;
    const image = images.get(clip.asset.url);
    if (image && alphaAt(image, rect.x + Math.floor(lx), rect.y + Math.floor(ly)) >= SOLID_ALPHA) return actor;
  }
  return undefined;
}

export function drawGround(ctx: CanvasRenderingContext2D, width: number, height: number, zoom: number) {
  const css = getComputedStyle(ctx.canvas);
  ctx.fillStyle = css.getPropertyValue('--checker-a') || '#111';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = css.getPropertyValue('--checker-b') || '#181818';
  const cell = 32 * zoom;
  for (let y = 0; y * cell < height; y++) {
    for (let x = y % 2; x * cell < width; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);
  }
}

/**
 * Where a scene's drawing starts in actor units: centred in the view, on a whole number of screen pixels, so that
 * everything drawn on it (the ground, the frames of what stands) stays on one pixel grid with the characters.
 */
export function worldAt(world: World, width: number, height: number, zoom: number) {
  return { x: Math.round((width - world.width * zoom) / 2) / zoom, y: Math.round((height - world.height * zoom) / 2) / zoom };
}

/** The scene's ground (floors and decals): never in front of a character. */
export function drawWorldGround(ctx: CanvasRenderingContext2D, world: World, at: { x: number; y: number }, zoom: number) {
  ctx.drawImage(world.background, Math.round(at.x * zoom), Math.round(at.y * zoom), world.width * zoom, world.height * zoom);
}

/** One wall, fence, door or prop of the scene at its frame now (resting, or a clip's), where its pivot lies. */
export function drawStanding(ctx: CanvasRenderingContext2D, world: World, live: Live, standing: Standing, time: number, at: { x: number; y: number }, zoom: number) {
  const item = world.living.drawnItem(live, standing, time);
  const frame = world.renderer.frame(item, live.scene.materials);
  const left = Math.round(standing.screen.x * world.scale - frame.x);
  const top = Math.round(standing.screen.y * world.scale - frame.y);
  ctx.drawImage(frame.image as CanvasImageSource, Math.round((at.x + left) * zoom), Math.round((at.y + top) * zoom), frame.image.width * zoom, frame.image.height * zoom);
}

/** The navigation drawn once per version of it (a door opening makes a new one), over the scene. */
const navLayers = new WeakMap<object, HTMLCanvasElement>();
export function drawNavLayer(ctx: CanvasRenderingContext2D, world: World, live: Live, at: { x: number; y: number }, zoom: number) {
  let layer = navLayers.get(live.nav);
  if (!layer) {
    layer = document.createElement('canvas');
    layer.width = world.width;
    layer.height = world.height;
    const g = layer.getContext('2d');
    if (g) {
      g.scale(world.scale, world.scale);
      drawNavigation(g, live.nav, world.geo, 1 / world.scale);
    }
    navLayers.set(live.nav, layer);
  }
  ctx.drawImage(layer, Math.round(at.x * zoom), Math.round(at.y * zoom), world.width * zoom, world.height * zoom);
}

export function drawActor(
  ctx: CanvasRenderingContext2D,
  actor: Actor,
  images: Map<string, HTMLImageElement>,
  opts: SceneOptions,
  isPlayer: boolean,
  isSelected: boolean,
) {
  const { clip, rect, pivot, row, index } = currentFrame(actor);
  const image = images.get(clip.asset.url);
  if (!image) return;
  const z = opts.zoom;
  const left = Math.round(actor.x * z - pivot.x * z);
  const top = Math.round(actor.y * z - pivot.y * z);

  if (opts.shadow) {
    ctx.fillStyle = 'rgb(0 0 0 / 0.35)';
    ctx.beginPath();
    ctx.ellipse(actor.x * z, actor.y * z, rect.width * 0.16 * z, rect.width * 0.06 * z, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (isSelected) {
    // A crisp outline around the opaque pixels, plus a ring on the ground at the anchor.
    ctx.filter = `drop-shadow(${z}px 0 0 ${AMBER}) drop-shadow(-${z}px 0 0 ${AMBER}) drop-shadow(0 ${z}px 0 ${AMBER}) drop-shadow(0 -${z}px 0 ${AMBER})`;
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, left, top, rect.width * z, rect.height * z);
    ctx.filter = 'none';
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(actor.x * z, actor.y * z, rect.width * 0.2 * z, rect.width * 0.075 * z, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, left, top, rect.width * z, rect.height * z);
  if (opts.bounds) {
    ctx.strokeStyle = 'rgb(255 255 255 / 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, rect.width * z, rect.height * z);
  }
  if (opts.anchor) {
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(actor.x * z - 6, actor.y * z);
    ctx.lineTo(actor.x * z + 6, actor.y * z);
    ctx.moveTo(actor.x * z, actor.y * z - 6);
    ctx.lineTo(actor.x * z, actor.y * z + 6);
    ctx.stroke();
  }
  if (opts.sockets) drawSockets(ctx, clip, row, { left, top }, z, index);
  if (isPlayer || isSelected) {
    ctx.fillStyle = 'rgb(255 255 255 / 0.9)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${clip.key} · ${clip.atlas.meta.directions?.[row] ?? 'S'}`, actor.x * z, Math.max(14, top + 14));
    ctx.textAlign = 'left';
  }
}

/** Debug markers on the sockets of the frame being shown: filled when the effect would draw in front of the body. */
function drawSockets(ctx: CanvasRenderingContext2D, clip: Clip, row: number, origin: { left: number; top: number }, z: number, frame: number) {
  const sockets = clip.atlas.meta.data?.sockets;
  if (!sockets) return;
  const directions = clip.atlas.meta.directions ?? [];
  const key = directions.length > 1 ? `${directions[row]}_${frame}` : `frame_${frame}`;
  const scale = clip.atlas.meta.scale ?? 1;
  const points = sockets.frames[key] ?? [];
  ctx.font = '10px ui-monospace, monospace';
  points.forEach(([x, y, d], i) => {
    const px = origin.left + x * scale * z;
    const py = origin.top + y * scale * z;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = d > 0 ? AMBER : 'rgb(255 255 255 / 0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgb(0 0 0 / 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
    ctx.fillText(sockets.names[i] ?? '', px + 5, py - 4);
  });
}

/** Effects behind the body are drawn before the actors, the rest after them. */
export function drawEffects(ctx: CanvasRenderingContext2D, effects: Effect[], z: number, pass: 'under' | 'over') {
  for (const effect of effects) {
    const t = effect.age / effect.life;
    if (effect.type === 'projectile') {
      // The first moments of a projectile born behind the body stay under it.
      const under = effect.behind && effect.age < 0.15;
      if ((pass === 'under') !== under) continue;
      ctx.fillStyle = AMBER;
      ctx.globalAlpha = 1 - t * 0.5;
      ctx.beginPath();
      ctx.arc(effect.x * z, effect.y * z, 6 * Math.min(z, 3), 0, Math.PI * 2);
      ctx.fill();
      // A short trail behind it shows which way it is going.
      for (const [back, radius, alpha] of [[0.04, 4.5, 0.45], [0.08, 3, 0.3], [0.12, 2, 0.2]]) {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc((effect.x - effect.vx * back) * z, (effect.y - effect.vy * back) * z, radius * Math.min(z, 3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (pass === 'over') {
      ctx.strokeStyle = effect.tone === 'hit' ? AMBER : effect.tone === 'cast' ? 'rgb(150 200 255 / 0.9)' : 'rgb(255 255 255 / 0.5)';
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(effect.x * z, effect.y * z, effect.radius * t * z + 4, (effect.radius * t * z + 4) * (effect.tone === 'land' ? 0.4 : 1), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

/** One playing visual effect at its frame, its origin (the sheet's pivot) on the point it is at. */
export function drawFx(ctx: CanvasRenderingContext2D, fx: Fx, images: Map<string, HTMLImageElement>, zoom: number) {
  const image = images.get(fx.sheet.asset.url);
  const rect = fx.sheet.rects(fx.row)[frameOfFx(fx)];
  if (!image || !rect) return;
  const { pivot } = fx.sheet;
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, Math.round((fx.x - pivot.x) * zoom), Math.round((fx.y - pivot.y) * zoom), rect.width * zoom, rect.height * zoom);
}
