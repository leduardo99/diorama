/**
 * @core/rig - Characters, character assets and skins
 *
 * `defineCharacter` declares one character: skeleton, skin, cell, sockets and every clip with
 * its action kind. Each clip file exports `character.sheet('<key>')`, a sheet of that clip in
 * every facing (rows are directions, columns are frames sampled at t = frame / frames). Every
 * sheet's atlas JSON carries the clip's data (kind, ground speed, events by frame, sockets per
 * frame) and the whole character manifest, so a game or the viewer's playground can bind
 * controls and play it without guessing. `defineCharacterAsset` is the single-sheet building
 * block underneath.
 */

import { defineAsset, type AssetDefinition } from '../asset.js';
import { Camera } from '../volume/camera.js';
import { Frame3, directionName, facingYaw } from '../volume/frame.js';
import { Stage, type ObjectOptions, type StageObject } from '../volume/stage.js';
import { Polygon } from '../draw/index.js';
import { Blob, Round, Tube, type Section, type VolumeStyle } from '../volume/volume.js';
import { len3, lerp3, norm3, sub3, vec3, type Vec3 } from '../volume/vec3.js';
import { categoryOf, restFeet, type ActionKind, type Clip } from './clips.js';
import { partFrame, solvePose, type Pose } from './pose.js';
import type { SkeletonSpec } from './skeleton.js';
import { checkClip } from './verify.js';
import { outfitFromData, type GearCatalog, type OutfitData } from './gear.js';
import { checkWield, weaponSockets } from './wield.js';

/** What a skin receives besides the pose. */
export interface SkinKit {
  camera: Camera;
  skeleton: SkeletonSpec;
  clip: Clip;
  /** Normalized time of this frame. */
  t: number;
  /** The pose at another normalized time of the same clip and facing (for smears and trails). */
  poseAt(t: number): Pose;
}

/** Draws a pose: adds the character's parts to its stage object. */
export type Skin = (object: StageObject, pose: Pose, kit: SkinKit) => void;

/** Options of `defineCharacterAsset`. */
export interface CharacterAssetOptions {
  skeleton: SkeletonSpec;
  clip: Clip;
  skin: Skin;
  /** The project's camera (`CAMERA` from the theme). */
  camera: Camera;
  /** Logical cell size and export scale (default 2). */
  width: number;
  height: number;
  scale?: number;
  /** Frames per direction. */
  frames: number;
  /** Facings as rows (default 8). */
  directions?: number;
  /** Where the character stands in the cell (centre of its footprint), in logical pixels. */
  pivot: { x: number; y: number };
  /**
   * Contact shadow color from the theme, usually ink with alpha (`alpha(PALETTES.ink, 0.35)`). The
   * shadow is an ellipse around the rest feet, padded by 0.12 × `skeleton.height` along the body and
   * 0.1 × across, turning with the facing. Omit for no shadow.
   */
  shadow?: string;
  /** Outer contour of the character (see `ObjectOptions.contour`). */
  contour?: ObjectOptions['contour'];
  /**
   * Named points exported per frame (see `defineCharacter`). `head` and `center` are always
   * added from the skeleton.
   */
  sockets?: Record<string, SocketFn>;
  /** The character this sheet belongs to: its manifest goes into the atlas JSON. */
  character?: CharacterManifest;
  /** This clip's key in the character (the clip file's name). */
  key?: string;
}

/** A named point a game attaches things to (a hand, a blade tip, a mouth), computed from the pose. */
export type SocketFn = (pose: Pose) => Vec3;

/**
 * Socket positions of a sheet: `names` in order, and for every frame name (`<DIR>_<frame>`, or
 * `frame_<n>` for a single facing) one `[x, y, d]` per name. x, y are logical px from the cell's
 * top-left corner; d is the depth towards the camera relative to the body's center (positive =
 * in front of the body, so an effect there draws over the sprite).
 */
export interface SocketTable {
  names: string[];
  frames: Record<string, [number, number, number][]>;
}

/** One clip in a character manifest. */
export interface ManifestClip {
  /** Clip key: the sheet file is `<key>.png` / `<key>.json` next to this one. */
  key: string;
  name: string;
  kind: ActionKind;
  category: 'idle' | 'locomotion' | 'action';
  tags: string[];
  loop: boolean;
  hold: boolean;
  seconds: number;
  frames: number;
  fps: number;
  /** World units (logical px) per second; multiply by `scale` for exported pixels. */
  groundSpeed: number;
  events: { frame: number; name: string }[];
  /** Root motion: forward distance from the start at each frame, then at the end (frames + 1 values). Absent when the clip stays in place. */
  travel?: number[];
  /** What the clip is made to hold (see `ClipWields`). Absent when it suits anything. */
  wields?: ClipWields;
  /** False when the character does not hold what the clip is made for: players leave it out (it is not in `controls`). */
  usable?: boolean;
}

/**
 * Everything a player needs to drive a character, repeated in every sheet's atlas JSON
 * (`meta.data.character`). Interrupt rules the playground follows: death > hit > other actions
 * > locomotion > idle; an action may be cut short from its `cancel` event on (else only when it
 * ends); when an action ends the character returns to idle, except `hold` clips (death).
 */
export interface CharacterManifest {
  /** The character's id, as `defineCharacter` was given it ('ossuary-guard'). */
  name: string;
  /** The name people read, for a game's menus, the viewer and the test bench ('Ossuary Guard'). */
  label: string;
  skeleton: string;
  cell: { width: number; height: number };
  scale: number;
  pivot: { x: number; y: number };
  directions: string[];
  /**
   * The project camera's tilt (degrees) and height boost. On screen, ground distances along the
   * view (towards or away from the camera) shrink by sin(tilt): move the sprite at
   * (vx, vy · sin(tilt)) × scale px/s for a world velocity (vx, vy), or the feet slide when the
   * character walks up or down the screen.
   */
  camera: { tilt: number; heightBoost: number };
  sockets: string[];
  clips: ManifestClip[];
  /** Default bindings: the idle clip, locomotion keys by speed (slowest first), action keys by kind. */
  controls: { idle?: string; move: string[]; actions: Partial<Record<ActionKind, string[]>> };
  /** Effects to play on clip events, by clip key (see `EffectCue`). */
  effects: Record<string, EffectCue[]>;
  /** What the character holds in its main (right) and off (left) hand, when it was defined with an outfit. */
  wield?: { main?: { part: string; class: string; hands: 1 | 2 }; off?: { part: string; class: string; hands: 1 | 2 } };
  /** Problems found when the character was defined (missing idle, unknown sockets in events, clips made for another weapon). */
  warnings: string[];
}

/**
 * An effect a character plays on an event of one of its clips: a projectile on `release`, sparks on
 * `hit`, a circle at its feet on `cast`, dust on `land`. `effect` is the effect's id in the project's
 * effect catalog (its sheet is `sheets/vfx/<id>.ts`, exported to `assets/vfx/<id>`).
 */
export interface EffectCue {
  /** The clip event it plays on ('release', 'hit', 'cast', 'land', 'step:left'), or 'start' / 'end' of the clip. */
  on: string;
  effect: string;
  /**
   * The socket it starts at ('tip', 'mouth', 'hand'…). Default: the socket of the clip's
   * `spawn:<socket>` event on the same frame, else 'center'; 'feet' for the character's pivot on the floor.
   */
  at?: string;
  /** How it moves: 'fly' along the facing the action started with (projectiles), 'follow' the socket while it plays (auras, trails), or 'stay' where it started (default). */
  motion?: 'fly' | 'follow' | 'stay';
}

/** A name in words, for a character without a `label`: 'ossuary-guard' is 'Ossuary guard'. */
function inWords(name: string): string {
  const words = name.split(/[-_\s]+/).filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Root motion per frame (and at the end) of a clip with `travel`, rounded to 0.1 world units. */
function travelOf(clip: Clip, frames: number): number[] {
  return Array.from({ length: frames + 1 }, (_, f) => Math.round(clip.travel!(f / frames) * 10) / 10);
}

/** Socket table of one clip, computed from poses (no rendering). */
function socketTable(o: CharacterAssetOptions, directions: number): SocketTable {
  const fns: Record<string, SocketFn> = {
    head: pose => pose.joints[o.skeleton.head],
    center: pose => {
      const pts = o.skeleton.trunk.map(j => pose.joints[j.name]);
      return vec3(pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length, pts.reduce((s, p) => s + p.z, 0) / pts.length);
    },
    ...o.sockets,
  };
  const names = Object.keys(fns);
  const cam = o.camera.at(o.pivot);
  const frames: SocketTable['frames'] = {};
  const r1 = (x: number) => Math.round(x * 10) / 10;
  for (let d = 0; d < directions; d++) {
    const frame = Frame3.facing(vec3(0, 0, 0), facingYaw(d, directions));
    for (let f = 0; f < o.frames; f++) {
      const pose = solvePose(o.skeleton, frame, o.clip.drive(f / o.frames));
      const centerDepth = cam.depth(fns.center(pose));
      frames[directions > 1 ? `${directionName(d, directions)}_${f}` : `frame_${f}`] = names.map(n => {
        const p = fns[n](pose);
        const s2 = cam.project(p);
        return [r1(s2.x), r1(s2.y), r1(cam.depth(p) - centerDepth)];
      });
    }
  }
  return { names, frames };
}

/** What `drawCharacterFrame` needs: the character and its view (a subset of `CharacterAssetOptions`). */
export type CharacterView = Pick<CharacterAssetOptions, 'skeleton' | 'clip' | 'skin' | 'camera' | 'pivot' | 'shadow' | 'contour'>;

/** The contact shadow of a character for a pose: the standing footprint, blended into the lying body. */
function shadowFor(o: CharacterView) {
  const feet = Object.values(restFeet(o.skeleton));
  const h = o.skeleton.height;
  // The contact shadow covers the standing footprint and, when the body is low (lying, crouched),
  // the floor under every low joint: a death lies inside its shadow, a walk keeps the same one.
  const restTrunkZ = o.skeleton.trunk.reduce((sum, j) => sum + j.at[2], 0) / o.skeleton.trunk.length;
  const bounds = (pts: number[][], pad = 1) => {
    const fs = pts.map(p => p[0]);
    const ss = pts.map(p => p[1]);
    return {
      rx: Math.max(6, (Math.max(...fs) - Math.min(...fs)) / 2 + h * 0.12 * pad),
      ry: Math.max(5, (Math.max(...ss) - Math.min(...ss)) / 2 + h * 0.1 * pad),
      cx: (Math.max(...fs) + Math.min(...fs)) / 2,
      cy: (Math.max(...ss) + Math.min(...ss)) / 2,
    };
  };
  const standing = bounds(feet.map(f => [f[0], f[1]]));
  const shadowOf = (pose: Pose) => {
    // Blend in the low joints only as the trunk drops below ~85% of its rest height.
    const trunkZ = o.skeleton.trunk.reduce((sum, j) => sum + pose.joints[j.name].z, 0) / o.skeleton.trunk.length;
    const w = Math.max(0, Math.min(1, (0.85 * restTrunkZ - trunkZ) / (0.4 * restTrunkZ)));
    if (w === 0) return standing;
    const f = pose.frame;
    // Thin tails do not widen the footprint.
    const tails = new Set((o.skeleton.tails ?? []).flatMap(tl => (pose.chains[tl.name] ?? []).slice(1)));
    const low = Object.values(pose.joints).filter(p => p.z < 0.45 * h && !tails.has(p)).map(p => [p.x * f.forward.x + p.y * f.forward.y, p.x * f.right.x + p.y * f.right.y]);
    const lying = bounds([...feet.map(ft => [ft[0], ft[1]]), ...low], 0.5);
    return { rx: standing.rx + (lying.rx - standing.rx) * w, ry: standing.ry + (lying.ry - standing.ry) * w, cx: standing.cx + (lying.cx - standing.cx) * w, cy: standing.cy + (lying.cy - standing.cy) * w };
  };
  return shadowOf;
}

/**
 * Draws one frame of a character into a canvas context, exactly as its exported sheet does: the
 * pose at normalized time `t` and facing `facing` (radians; π/2 faces the camera), the contact
 * shadow and the skin, with the world origin at `o.pivot`. Editors and previews (the viewer's
 * customizer) call it to show a character live without exporting it.
 */
export function drawCharacterFrame(ctx: CanvasRenderingContext2D, o: CharacterView, t: number, facing = Math.PI / 2, shadowOf = shadowFor(o)): void {
  const cam = o.camera.at(o.pivot);
  const frame = Frame3.facing(vec3(0, 0, 0), facing);
  const poseAt = (u: number) => solvePose(o.skeleton, frame, o.clip.drive(((u % 1) + 1) % 1));
  const stage = new Stage(cam);
  const pose = poseAt(t);
  if (o.shadow) {
    const shadowColor = o.shadow;
    // The shadow turns with the footprint (longer along the body of a quadruped).
    const { rx, ry, cx, cy } = shadowOf(pose);
    stage.custom(vec3(0, 0, 0), c => {
      Polygon.ellipse(rx, ry).mapVertices(p => cam.project(frame.at(cx + p.x, cy + p.y, 0))).fill(c, shadowColor);
    }, { layer: 0 });
  }
  const body = stage.object({ contour: o.contour });
  o.skin(body, pose, { camera: cam, skeleton: o.skeleton, clip: o.clip, t, poseAt });
  stage.draw(ctx);
}

/** Defines an exportable sheet of one clip: directions × frames, with the clip's data in the atlas JSON. */
export function defineCharacterAsset(o: CharacterAssetOptions): AssetDefinition {
  const directions = o.directions ?? 8;
  const frameOf = (t: number) => Math.round(t * o.frames) % o.frames;
  const shadowOf = shadowFor(o);
  return defineAsset({
    width: o.width,
    height: o.height,
    scale: o.scale ?? 2,
    frames: o.frames,
    fps: Math.round((o.frames / o.clip.seconds) * 100) / 100,
    directions,
    pivot: o.pivot,
    animations: { [o.clip.name]: Array.from({ length: o.frames }, (_, i) => i) },
    data: {
      // For players and viewers: a character sheet, what the clip means (`action` kind and its
      // coarse `clipKind` category), its events and sockets, and the whole character manifest.
      role: 'character',
      clipKind: categoryOf(o.clip.kind),
      action: o.clip.kind,
      tags: o.clip.tags,
      hold: o.clip.hold,
      ...(o.key ? { key: o.key } : {}),
      skeleton: o.skeleton.name,
      clip: o.clip.name,
      loop: o.clip.loop,
      seconds: o.clip.seconds,
      groundSpeed: o.clip.speed,
      groundSpeedUnits: 'world units (logical px) per second; multiply by meta.scale for exported pixels',
      events: o.clip.events.map(e => ({ frame: frameOf(e.t), name: e.name })),
      ...(o.clip.travel ? { travel: travelOf(o.clip, o.frames), travelUnits: 'forward world units from the start, per frame then at the end; move the sprite along the facing' } : {}),
      // Measured on every export; `npm run inspect` prints the warnings.
      motion: checkClip(o.skeleton, o.clip),
      sockets: socketTable(o, directions),
      ...(o.character ? { character: o.character } : {}),
    },
    render({ ctx, frameIndex = 0, facing = Math.PI / 2 }) {
      drawCharacterFrame(ctx, o, frameIndex / o.frames, facing, shadowOf);
    },
  });
}

/** A clip of a character, with its own frame count when the default does not fit. */
export type CharacterClip = Clip | { clip: Clip; frames?: number; wields?: ClipWields };

/**
 * What a clip is made to hold, by hand: the classes of held parts (`PartInfo.wield.class`) it suits
 * in the main (right) and off (left) hand; 'unarmed' for an empty hand. A slash made for a blade is
 * `{ main: ['blade'] }`, a shield bash `{ off: ['shield'] }`, a dual-wield combo `{ main: ['blade'],
 * off: ['blade'] }`. A clip without it (walk, hit, a spell) suits anything.
 */
export interface ClipWields {
  main?: string[];
  off?: string[];
}

/**
 * Options of `defineCharacter`. `K` is the union of the keys of `clips`; `defineCharacter` infers it
 * from the object literal, so `CharacterOptions` alone (`K` = `string`) is every character's options.
 */
export interface CharacterOptions<K extends string = string> extends Omit<CharacterAssetOptions, 'clip' | 'frames' | 'character' | 'key' | 'skin'> {
  /** The character's id for players and the viewer (e.g. 'ossuary-guard'). */
  name: string;
  /** The name people read. Default: the name in words ('ossuary-guard' is 'Ossuary guard'). */
  label?: string;
  /** How the character is drawn; with `outfit` and no skin, `outfitFromData(outfit.data, outfit.catalog)`. */
  skin?: Skin;
  /**
   * The outfit it wears, as data. With it the character holds what the outfit holds: the held items'
   * sockets (a blade's `tip`) replace sockets of the same name, the clips made for something else are
   * marked unusable and left out of `controls`, and `warnings` says what does not match (`checkWield`).
   */
  outfit?: { data: OutfitData; catalog: GearCatalog };
  /**
   * Every clip, by key. The key is the clip file's name: `characters/<name>/<key>.ts` exports
   * `character.sheet('<key>')`. Lowercase letters, digits and dashes. `defineCharacter` takes the keys
   * from the object passed (a literal, or a value whose type keeps its key names), and
   * `character.sheet` accepts only those.
   */
  clips: Record<K, CharacterClip>;
  /** Frames of a clip that does not set its own. Default 8. */
  frames?: number;
  /** Override default bindings (see `CharacterManifest.controls`). */
  controls?: Partial<CharacterManifest['controls']>;
  /** Effects to play on clip events, by clip key: `{ cast: [{ on: 'release', effect: 'soul-bolt', motion: 'fly' }] }`. */
  effects?: Record<string, EffectCue[]>;
}

/**
 * A defined character: its manifest and one exportable sheet per clip. `K` is the union of its clip
 * keys (`'idle' | 'walk'`...); `Character` alone, with `K` = `string`, is any character.
 */
export interface Character<K extends string = string> {
  manifest: CharacterManifest;
  /**
   * The sheet of one clip: `export default character.sheet('walk')` in `<name>/walk.ts`. A key the
   * character does not declare in `clips` is a type error there, and throws if it gets past the types.
   */
  sheet(key: K): AssetDefinition;
}

/**
 * The clip keys of a character, as a union: `ClipKey<typeof character>` is `'idle' | 'walk'` for a
 * character with those two clips, and `string` when its clips do not keep their key names
 * (`Object.fromEntries`, a `Record<string, ...>`): then any key type-checks.
 */
export type ClipKey<C extends Character> = C extends Character<infer K> ? K : never;

/**
 * Declares a character once: skeleton, skin, camera, cell, pivot, sockets and every clip. Each
 * clip file is one line, `export default character.sheet('<key>')`, and every exported sheet
 * carries the full manifest, so players never guess what a sheet is from its file name.
 * The clip keys are inferred from `clips`: a sheet file that names a clip the character does not
 * declare fails to type-check (see `ClipKey`).
 * Throws on a bad key; collects softer problems (no idle, events naming unknown sockets) in
 * `manifest.warnings`, which `npm run inspect` prints.
 */
export function defineCharacter<K extends string = string>(o: CharacterOptions<K>): Character<K> {
  const clipsIn: Record<string, CharacterClip> = o.clips;
  const keys = Object.keys(clipsIn);
  if (keys.length === 0) throw new Error(`character "${o.name}": no clips`);
  for (const k of keys) if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(k)) throw new Error(`character "${o.name}": clip key "${k}" must be lowercase letters, digits and dashes (it is the file name)`);
  const skin = o.skin ?? (o.outfit ? outfitFromData(o.outfit.data, o.outfit.catalog) : undefined);
  if (!skin) throw new Error(`character "${o.name}": give it a skin or an outfit`);
  const wield = o.outfit ? checkWield(clipsIn, o.outfit.data, o.outfit.catalog) : undefined;
  const socketFns = { ...o.sockets, ...(o.outfit ? weaponSockets(o.outfit.data, o.outfit.catalog, o.skeleton) : {}) };
  const entries = keys.map(key => {
    const c = clipsIn[key];
    const clip = 'drive' in c ? c : c.clip;
    const frames = ('drive' in c ? undefined : c.frames) ?? o.frames ?? 8;
    if (!(frames >= 1)) throw new Error(`character "${o.name}": clip "${key}" needs at least 1 frame`);
    return { key, clip, frames, wields: 'drive' in c ? undefined : c.wields };
  });
  const frameOf = (t: number, frames: number) => Math.round(t * frames) % frames;
  const directions = o.directions ?? 8;
  const sockets = ['head', 'center', ...Object.keys(socketFns).filter(k => k !== 'head' && k !== 'center')];
  const clips: ManifestClip[] = entries.map(({ key, clip, frames, wields }) => ({
    key,
    name: clip.name,
    kind: clip.kind,
    category: categoryOf(clip.kind),
    tags: clip.tags,
    loop: clip.loop,
    hold: clip.hold,
    seconds: clip.seconds,
    frames,
    fps: Math.round((frames / clip.seconds) * 100) / 100,
    groundSpeed: clip.speed,
    events: clip.events.map(e => ({ frame: frameOf(e.t, frames), name: e.name })),
    ...(clip.travel ? { travel: travelOf(clip, frames) } : {}),
    ...(wields ? { wields } : {}),
    ...(wield?.unusable.some(u => u.key === key) ? { usable: false } : {}),
  }));
  const playable = clips.filter(c => c.usable !== false);
  const actions: Partial<Record<ActionKind, string[]>> = {};
  for (const c of playable) if (c.category === 'action') (actions[c.kind] ??= []).push(c.key);
  const controls: CharacterManifest['controls'] = {
    idle: playable.find(c => c.kind === 'idle')?.key,
    move: playable.filter(c => c.category === 'locomotion').sort((a, b) => a.groundSpeed - b.groundSpeed).map(c => c.key),
    actions,
    ...o.controls,
  };
  const warnings: string[] = [...(wield?.warnings ?? [])];
  if (!controls.idle) warnings.push('no idle clip: players have nothing to return to after an action');
  for (const [key, cues] of Object.entries(o.effects ?? {})) {
    const clip = clips.find(c => c.key === key);
    if (!clip) {
      warnings.push(`effects: no clip "${key}" (clips: ${keys.join(', ')})`);
      continue;
    }
    for (const cue of cues) {
      if (cue.on !== 'start' && cue.on !== 'end' && !clip.events.some(e => e.name === cue.on)) warnings.push(`effects of "${key}": event "${cue.on}" is not one of the clip's events (${clip.events.map(e => e.name).join(', ') || 'none'}, or start / end)`);
      if (cue.at && cue.at !== 'feet' && !sockets.includes(cue.at)) warnings.push(`effects of "${key}": socket "${cue.at}" is not one of the character's (${sockets.join(', ')}, or feet)`);
    }
  }
  for (const c of clips) {
    for (const e of c.events) {
      const socket = e.name.startsWith('spawn:') ? e.name.slice(6) : undefined;
      if (socket && !sockets.includes(socket)) warnings.push(`clip "${c.key}": event "${e.name}" names an unknown socket (known: ${sockets.join(', ')})`);
    }
  }
  const manifest: CharacterManifest = {
    name: o.name,
    label: o.label ?? inWords(o.name),
    skeleton: o.skeleton.name,
    cell: { width: o.width, height: o.height },
    scale: o.scale ?? 2,
    pivot: o.pivot,
    directions: Array.from({ length: directions }, (_, d) => directionName(d, directions)),
    camera: { tilt: o.camera.tilt, heightBoost: o.camera.heightBoost },
    sockets,
    clips,
    controls,
    effects: o.effects ?? {},
    ...(wield ? { wield: { ...(wield.main ? { main: { part: wield.main.part, class: wield.main.class, hands: wield.main.hands } } : {}), ...(wield.off ? { off: { part: wield.off.part, class: wield.off.class, hands: wield.off.hands } } : {}) } } : {}),
    warnings,
  };
  const { name: _name, label: _label, clips: _clips, frames: _frames, controls: _controls, effects: _effects, outfit: _outfit, skin: _skin, sockets: _sockets, ...shared } = o;
  return {
    manifest,
    sheet(key: K): AssetDefinition {
      const e = entries.find(x => x.key === key);
      if (!e) throw new Error(`character "${o.name}" has no clip "${key}" (clips: ${keys.join(', ')})`);
      return defineCharacterAsset({ ...shared, skin, sockets: socketFns, clip: e.clip, frames: e.frames, character: manifest, key });
    },
  };
}

/**
 * Sections around a path (a spine, a neck, a snout): ellipses perpendicular to the path,
 * `radii[i]` = [across, vertical] at point i. Feed them to `Round.loft`.
 */
export function ringsAlong(points: Vec3[], radii: [number, number][], upHint: Vec3 = vec3(0, 0, 1)): Section[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    let dir = norm3(sub3(b, a));
    if (len3(dir) < 1e-6) dir = vec3(1, 0, 0);
    const f = partFrame(p, dir, upHint);
    const [across, vertical] = radii[Math.min(i, radii.length - 1)];
    return { center: p, rx: across, ry: vertical, axes: [f.right, f.up] as [Vec3, Vec3] };
  });
}

/** Points along a chain resampled at fractions `ts` (0 = root, 1 = tip), for tapered limbs and tails. */
export function along(chain: Vec3[], ts: number[]): Vec3[] {
  const lengths = chain.slice(1).map((p, i) => len3(sub3(p, chain[i])));
  const total = lengths.reduce((s, l) => s + l, 0) || 1;
  return ts.map(t => {
    let d = t * total;
    for (let i = 0; i < lengths.length; i++) {
      if (d <= lengths[i] || i === lengths.length - 1) return lerp3(chain[i], chain[i + 1], Math.min(1, d / (lengths[i] || 1)));
      d -= lengths[i];
    }
    return chain[chain.length - 1];
  });
}

/**
 * Generic block-out skin for any skeleton: the trunk as one blob (a tube through the trunk
 * joints plus an ellipsoid at each, so it holds for a straight spine, a curled body or joints
 * that are not a chain), tapered tubes for limbs and tails, an ellipsoid head facing forward.
 * Use it to check proportions and motion before writing the project's real skin.
 */
export function mannequinSkin(style: VolumeStyle, limbStyle: VolumeStyle = style): Skin {
  return (o, pose, kit) => {
    const h = kit.skeleton.height;
    const r = h * 0.075;
    const headName = kit.skeleton.head;
    // The head joint gets the head below; every other trunk joint is a body mass.
    const trunk = kit.skeleton.trunk.map(j => ({ name: j.name, at: pose.joints[j.name] }));
    const masses: (Round | Tube)[] = trunk.filter(j => j.name !== headName).map(j => Round.ellipsoid(partFrame(j.at, pose.frame.forward), r * 1.15, r, r * 1.1));
    // Tube through the joints in trunk order, skipping coincident ones (a degenerate path).
    const path: Vec3[] = [];
    for (const { at } of trunk) if (!path.length || len3(sub3(at, path[path.length - 1])) > 1e-3) path.push(at);
    if (path.length > 1) masses.unshift(new Tube(path, r * 2));
    if (masses.length) o.add(new Blob(masses), style);
    for (const leg of kit.skeleton.legs) o.add(new Tube(pose.chains[leg.name], t => r * (0.7 - 0.35 * t)), limbStyle);
    for (const arm of kit.skeleton.arms ?? []) o.add(new Tube(pose.chains[arm.name], t => r * (0.55 - 0.2 * t)), limbStyle);
    for (const tail of kit.skeleton.tails ?? []) o.add(new Tube(pose.chains[tail.name], t => r * (0.6 - 0.45 * t)), limbStyle);
    const head = pose.joints[kit.skeleton.head];
    o.add(Round.ellipsoid(partFrame(head, pose.frame.forward), r * 1.3, r * 1.05, r * 1.15), style);
  };
}

