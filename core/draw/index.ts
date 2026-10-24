/**
 * @core/draw - the drawing layer of Diorama.
 *
 * Shapes, paths, booleans, deformations, fill and stroke styles, procedural textures and color helpers.
 * `@core/volume` projects every part into these shapes; effects and the HUD draw with them directly.
 */

// Side-effect registration: the boolean engine behind union/subtract/intersect.
import './internal/boolean.js';

// Geometry
export { Shape, CompoundShape, type PolygonRegion } from './shapes/shape.js';
export { Polygon } from './shapes/polygon.js';
export { Path, PathBuilder } from './shapes/path.js';

// Styles
export { StrokeStyle } from './styles/stroke-style.js';
export { ShapeStyle } from './styles/shape-style.js';

// Placement
export {
  attach,
  scatterAlong,
  type AttachOptions,
  type Scatterable,
  type ScatterAlongOptions,
} from './ops/place.js';

// Procedural textures
export { Hatch } from './textures/hatch.js';
export { Stipple } from './textures/stipple.js';
export { Grit } from './textures/grit.js';

// Color utilities
export { alpha, lerpColor, parseColor, type RGBA } from '../color.js';

// Core types & options interfaces
export type {
  Point,
  Paint,
  Bounds,
  InsideCallback,
  ShapeLike,
  Placeable,
  PolygonOptions,
  RectOptions,
  CircleOptions,
  EllipseOptions,
  LineOptions,
  LineShapeOptions,
  ArcOptions,
  CurveOptions,
  SplineOptions,
  BezierOptions,
  WaveOptions,
  WaveShapeOptions,
  WobbleOptions,
  StrokeOptions,
  ShadowOptions,
  ShapeStyleOptions,
  CelShadeOptions,
  StarOptions,
  CrescentOptions,
  LobeDefinition,
  LobesOptions,
  RibbonWidth,
  StemOptions,
  BrushName,
  LineCap,
  WobbleStyle,
  StrokeJoin,
  StrokePosition,
  AnchorName,
  AnchorRef,
  BoundingBox,
  EdgeInfo,
  GradientOptions,
  Texture,
  DisplaceOptions,
  BendOptions,
  TaperOptions,
  WarpOptions,
  TwistOptions,
  InflateOptions,
  OutlineOptions,
  ToShapeOptions,
  LineToShapeInput,
  OffsetOptions,
  Transformable,
} from './types.js';

export type { HatchOptions, HatchBounds } from './textures/hatch.js';
export type { StippleOptions, StippleGradient } from './textures/stipple.js';
export type { GritOptions } from './textures/grit.js';
