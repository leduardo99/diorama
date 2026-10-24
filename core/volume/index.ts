/**
 * @core/volume - 2.5D volumes for props, scenery, armor and characters
 *
 * A tilted orthographic camera with one project light, local frames that turn objects to
 * any facing, and volumes (faceted solids, round bodies, tubes, decals) that project into
 * `@core/draw` shapes, so project themes style them like any other drawing.
 */

import '../draw/index.js';

export { Camera, type CameraOptions, type LightOptions } from './camera.js';
export { Frame3, DIRECTION_NAMES, facingYaw, directionName } from './frame.js';
export {
  Solid,
  Round,
  Tube,
  Blob,
  Decal,
  groundShadow,
  visibleArc,
  ringOnEllipsoid,
  bandOnEllipsoid,
  rampTone,
  polygonNormal,
  FORM_DEFAULTS,
  type EllipsoidAxis,
  type EllipsoidRing,
  type FormShading,
  type FormWidth,
  type Face,
  type Section,
  type ShadeRamp,
  type VolumeStyle,
  type Placed,
  type Piece,
} from './volume.js';
export { Stage, StageObject, CONTOUR_DEFAULT, type StageOptions, type ObjectOptions } from './stage.js';
export { vec3, add3, sub3, scale3, dot3, cross3, len3, norm3, lerp3, mix3, UP, type Vec3 } from './vec3.js';
export { Grid, EDGE, CORNER, edgeMask, cornerMask, cornerMaskShape } from './grid.js';
export { defineSpace, SPACE_PRESETS, screenHeight, heightOf, spaceData, scaleFigure, type SpaceProfile, type SpaceScale, type SpaceOptions, type SpacePreset, type SpacePresetName, type SpaceHeight, type WallPlacement } from './space.js';
export { playhead, keyed, loopWave, type ClipKeys } from './clip-motion.js';
export { defineEffect, validateEffects, drawEffectFrame, effectCell, effectLayer, effectRng, type EffectKind, type EffectContext, type EffectPiece, type EffectInfo, type EffectCatalog, type EffectAssetOptions } from './effects.js';
export { sceneNavigation, pieceBlocks, type SceneNavigation, type NavCell } from './navigation.js';
export { floorTile, floorBlob, FLOOR_EDGE, type FloorTile, type FloorEdge, type FloorTileOptions } from './floor-tile.js';
export {
  drawScene,
  layoutScene,
  createSceneRenderer,
  validateScene,
  sceneMaterials,
  footprintOf,
  cellPiece,
  cellOf,
  frameOf,
  defineTileSet,
  defineSceneAsset,
  seamTestScene,
  wallPlacement,
  wallGridSize,
  emptyScene,
  pieceHeight,
  heightsOf,
  validateCatalog,
  floorGlow,
  masksOf,
  pieceRng,
  type SceneMaterials,
  type Connect,
  type PieceContext,
  type ScenePiece,
  type PieceOption,
  type ScenePieceInfo,
  type SceneryCatalog,
  type ScenePlacement,
  type SceneData,
  type SceneCell,
  type SceneItem,
  type PieceClip,
  type PieceNav,
  type DrawSceneOptions,
  type SceneCanvas,
  type SceneRenderer,
  type SceneRendererOptions,
  type TileSetOptions,
  type SceneAssetOptions,
} from './scenery.js';
