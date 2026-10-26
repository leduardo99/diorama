/**
 * @diorama/runtime - the atlas contract in pure TypeScript
 *
 * Reads Diorama's exported sheets and plays them, for games and the viewer alike: characters by their manifest (clips,
 * facings, priority, cancel, hold, events, root motion, stances), the effects they cue, movement on a scene's navigation,
 * one depth order for what stands on a scene, and the geometry of interface pieces. No DOM and no dependencies: a host
 * fetches the files and draws what the runtime says. Positions are floor points in world units; `Projection` puts them on
 * the screen. The contract is docs/guides/rig/04-atlas-contract.md.
 */

export type { Atlas, AtlasData, AtlasEvent, AtlasFrame, AtlasMeta, AtlasSockets, ClipGrips, ClipMotion, GripMeasure, Rect, Vec2 } from './contract/atlas.js';
export type { CharacterManifest, EffectCue, ManifestClip, WieldHand } from './contract/character.js';
export type { EffectMeta } from './contract/effect.js';
export type { ItemMeta } from './contract/item.js';
export type { PieceClipData, PieceClipSheet, PieceHeight, PieceNavData, PieceRow, PieceTile } from './contract/scenery.js';
export { EDGE, type Grid, type NavCell, type SceneLayoutItem, type SceneNavigation, type SpaceData } from './contract/scene.js';
export type { FontMeta, Insets, UiBox } from './contract/ui.js';
export { CONTRACT } from './contract/version.js';

export { ContractError, dependenciesOf, imageSheet, isAnimated, manifestOf, readSheet, sheetNamed, type Sheet, type SheetKind, type SheetPath, type SheetRef } from './read.js';
export { DEFAULT_TILT, buildLibrary, effectSheetOf, type Character, type Clip, type ClipCategory, type EffectSheet, type IconSheet, type Library, type UiSheet } from './library.js';
export { clipFrames, clipNames, eventsByFrame, eventsOf, facingOf, frameIndex, framesOf, rowFor, type Frame } from './frames.js';
export { projectionOf, toFloor, toScreen, type Projection } from './projection.js';
export {
  BODY_RADIUS, FREE_FLOOR, advance, canStart, createActor, face, frameSocket, play, priorityOf, reset, shown, shownFrame, socketAt, stance, steer, takeEvents,
  type Active, type Actor, type ClipEvent, type Floor, type Input, type LastEvent,
} from './actor.js';
export { cues, cuesOn, frameOfFx, hasCues, liftAt, rowOfHeading, stepFx, type Fx, type FxEvent, type FxWorld } from './effects.js';
export { canStep, cellAt, findPath, flightStop, moveIn } from './navigation.js';
export { depthKey } from './depth.js';
export { capPlacement, fillRect, layoutText, minimumSize, nineSlice, stretchFill, type GlyphPlace, type SlicePart } from './ui.js';
export { playableClips, wieldOf } from './gear.js';
export { createRng } from './random.js';
