# @core/volume - 2.5D Volumes, Camera & Facings

> Auto-generated public API reference. Do not edit directly; re-run `npm run docs:api`.

Tilted orthographic camera with one project light, local frames that turn objects to any facing, faceted solids, round volumes, tubes and decals that project into `@core/draw` shapes, and a stage that sorts them back to front. Used for props, scenery, armor pieces and characters exported in several directions.

## Table of Contents

- [Classes & Constructors](#classes--constructors)
  - [`Camera`](#camera)
  - [`Frame3`](#frame3)
  - [`Solid`](#solid)
  - [`Round`](#round)
  - [`Tube`](#tube)
  - [`Blob`](#blob)
  - [`Decal`](#decal)
  - [`Stage`](#stage)
  - [`StageObject`](#stageobject)
  - [`Grid`](#grid)
- [Functions & Operations](#functions--operations)
  - [`DIRECTION_NAMES`](#direction_names)
  - [`facingYaw`](#facingyaw)
  - [`directionName`](#directionname)
  - [`groundShadow`](#groundshadow)
  - [`visibleArc`](#visiblearc)
  - [`ringOnEllipsoid`](#ringonellipsoid)
  - [`bandOnEllipsoid`](#bandonellipsoid)
  - [`rampTone`](#ramptone)
  - [`polygonNormal`](#polygonnormal)
  - [`FORM_DEFAULTS`](#form_defaults)
  - [`CONTOUR_DEFAULT`](#contour_default)
  - [`vec3`](#vec3)
  - [`add3`](#add3)
  - [`sub3`](#sub3)
  - [`scale3`](#scale3)
  - [`dot3`](#dot3)
  - [`cross3`](#cross3)
  - [`len3`](#len3)
  - [`norm3`](#norm3)
  - [`lerp3`](#lerp3)
  - [`mix3`](#mix3)
  - [`UP`](#up)
  - [`EDGE`](#edge)
  - [`CORNER`](#corner)
  - [`edgeMask`](#edgemask)
  - [`cornerMask`](#cornermask)
  - [`cornerMaskShape`](#cornermaskshape)
  - [`defineSpace`](#definespace)
  - [`SPACE_PRESETS`](#space_presets)
  - [`screenHeight`](#screenheight)
  - [`heightOf`](#heightof)
  - [`spaceData`](#spacedata)
  - [`scaleFigure`](#scalefigure)
  - [`playhead`](#playhead)
  - [`keyed`](#keyed)
  - [`loopWave`](#loopwave)
  - [`defineEffect`](#defineeffect)
  - [`validateEffects`](#validateeffects)
  - [`drawEffectFrame`](#draweffectframe)
  - [`effectCell`](#effectcell)
  - [`effectLayer`](#effectlayer)
  - [`effectRng`](#effectrng)
  - [`sceneNavigation`](#scenenavigation)
  - [`pieceBlocks`](#pieceblocks)
  - [`floorTile`](#floortile)
  - [`floorBlob`](#floorblob)
  - [`FLOOR_EDGE`](#floor_edge)
  - [`drawScene`](#drawscene)
  - [`layoutScene`](#layoutscene)
  - [`createSceneRenderer`](#createscenerenderer)
  - [`validateScene`](#validatescene)
  - [`sceneMaterials`](#scenematerials)
  - [`footprintOf`](#footprintof)
  - [`cellPiece`](#cellpiece)
  - [`cellOf`](#cellof)
  - [`frameOf`](#frameof)
  - [`defineTileSet`](#definetileset)
  - [`defineSceneAsset`](#definesceneasset)
  - [`seamTestScene`](#seamtestscene)
  - [`wallPlacement`](#wallplacement)
  - [`wallGridSize`](#wallgridsize)
  - [`emptyScene`](#emptyscene)
  - [`pieceHeight`](#pieceheight)
  - [`heightsOf`](#heightsof)
  - [`validateCatalog`](#validatecatalog)
  - [`floorGlow`](#floorglow)
  - [`masksOf`](#masksof)
  - [`pieceRng`](#piecerng)
- [Types & Interfaces](#types--interfaces)
  - [`CameraOptions`](#cameraoptions)
  - [`LightOptions`](#lightoptions)
  - [`EllipsoidAxis`](#ellipsoidaxis)
  - [`EllipsoidRing`](#ellipsoidring)
  - [`FormShading`](#formshading)
  - [`FormWidth`](#formwidth)
  - [`Face`](#face)
  - [`Section`](#section)
  - [`ShadeRamp`](#shaderamp)
  - [`VolumeStyle`](#volumestyle)
  - [`Placed`](#placed)
  - [`Piece`](#piece)
  - [`StageOptions`](#stageoptions)
  - [`ObjectOptions`](#objectoptions)
  - [`Vec3`](#vec3)
  - [`SpaceProfile`](#spaceprofile)
  - [`SpaceScale`](#spacescale)
  - [`SpaceOptions`](#spaceoptions)
  - [`SpacePreset`](#spacepreset)
  - [`SpacePresetName`](#spacepresetname)
  - [`SpaceHeight`](#spaceheight)
  - [`WallPlacement`](#wallplacement)
  - [`ClipKeys`](#clipkeys)
  - [`EffectKind`](#effectkind)
  - [`EffectContext`](#effectcontext)
  - [`EffectPiece`](#effectpiece)
  - [`EffectInfo`](#effectinfo)
  - [`EffectCatalog`](#effectcatalog)
  - [`EffectAssetOptions`](#effectassetoptions)
  - [`SceneNavigation`](#scenenavigation)
  - [`NavCell`](#navcell)
  - [`FloorTile`](#floortile)
  - [`FloorEdge`](#flooredge)
  - [`FloorTileOptions`](#floortileoptions)
  - [`SceneMaterials`](#scenematerials)
  - [`Connect`](#connect)
  - [`PieceContext`](#piececontext)
  - [`ScenePiece`](#scenepiece)
  - [`PieceOption`](#pieceoption)
  - [`ScenePieceInfo`](#scenepieceinfo)
  - [`SceneryCatalog`](#scenerycatalog)
  - [`ScenePlacement`](#sceneplacement)
  - [`SceneData`](#scenedata)
  - [`SceneCell`](#scenecell)
  - [`SceneItem`](#sceneitem)
  - [`PieceClip`](#piececlip)
  - [`PieceNav`](#piecenav)
  - [`DrawSceneOptions`](#drawsceneoptions)
  - [`SceneCanvas`](#scenecanvas)
  - [`SceneRenderer`](#scenerenderer)
  - [`SceneRendererOptions`](#scenerendereroptions)
  - [`TileSetOptions`](#tilesetoptions)
  - [`SceneAssetOptions`](#sceneassetoptions)

---

## Classes & Constructors

### `Camera`

Tilted orthographic camera. World axes: x right, y towards the camera, z up.
`project` maps a world point to the screen; `depth` orders parts back to front.
Declare one camera per project in `src/theme.ts` and place it per asset with `at(origin)`.

**Constructor:**
```ts
new Camera(options?: CameraOptions): Camera
```

**Properties:**

- `tilt: number`
- `heightBoost: number`
- `light: Required<LightOptions>`
- `origin: Point`
- `scale: number`
- `contour?: false | { width: number; color: string; }`
- `viewDir: Vec3` — Unit vector from the scene towards the camera.
- `lightDir: Vec3` — Unit vector from the scene towards the light.
- `lightOnScreen: Point` — Screen direction (unit, logical pixels) pointing towards the light, used to place cel highlights.

**Instance Methods:**

- `.at(origin: Point, scale?: number | undefined): Camera`
  A copy of this camera with the world origin at `origin` on screen (and optionally another scale).
- `.project(p: Vec3): Point`
  Screen position of a world point, in logical pixels.
- `.depth(p: Vec3): number`
  Distance towards the camera: parts with a larger depth are drawn later (in front).
- `.faces(normal: Vec3): boolean`
  Whether a surface with this outward normal faces the camera (is visible).
- `.shade(normal: Vec3): number`
  Light received by a surface with this outward normal, from `ambient` (in shadow) to 1 (facing the light).

---

### `Frame3`

A local frame: an origin plus forward, right and up axes. Build an object in local
coordinates with `at(forward, side, up)`; the frame's yaw turns the whole object.

**Constructor:**
```ts
new Frame3(origin: Vec3, forward: Vec3, right: Vec3, up?: Vec3): Frame3
```

**Properties:**

- `origin: Vec3`
- `forward: Vec3`
- `right: Vec3`
- `up: Vec3`

**Static Factories:**

- `Frame3.facing(origin: Vec3, yaw: number): Frame3`
  Upright frame at `origin` facing `yaw` radians: 0 faces +x (screen right), π/2 faces +y (towards the camera). `right` is the object's own right hand.

**Instance Methods:**

- `.at(forward: number, side: number, up: number): Vec3`
  World point at local coordinates (forward, side to the right, up).
- `.dir(forward: number, side: number, up: number): Vec3`
  World direction (not translated) from local components.
- `.moved(forward: number, side: number, up: number): Frame3`
  The same axes moved to a local point of this frame.
- `.turned(degrees: number): Frame3`
  The frame turned by `degrees` around its up axis (positive turns forward towards right).
- `.pitched(degrees: number): Frame3`
  The frame tipped about its side axis by `degrees` (positive lifts forward towards up): a lid on a back hinge, a leaning part.
- `.rolled(degrees: number): Frame3`
  The frame rolled about its forward axis by `degrees` (positive lifts the right side).
- `.profile(plane: "front" | "side"): Frame3`
  A frame for `Solid.extrude` whose profile plane stands upright, so a profile drawn with x along one horizontal axis and y up is extruded along the other horizontal axis: - 'front': profile x = the object's right, y = up, extruded along forward (a gable, a   headstone, a shield seen from the front); - 'side': profile x = forward, y = up, extruded along the object's right (an arched lid,   a roof, a bench seen from the side). The origin stays where it is; move it first to start the extrusion at an edge.
- `.scaled(forward: number, side?: number, up?: number): Frame3`
  The frame with its axes scaled (non-uniform scaling of everything built in it).

---

### `Solid`

A faceted solid (box, plank, wall, roof, crate): planar faces, each painted with the tone
of the ramp that matches the light it receives. Visible faces are drawn back to front,
then the silhouette is outlined.

**Constructor:**
```ts
new Solid(faces: Face[]): Solid
```

**Properties:**

- `faces: Face[]`

**Static Factories:**

- `Solid.extrude(frame: Frame3, profile: Shape | Point[], height: number): Solid`
  Extrudes a profile into a solid. The profile is drawn in the frame's ground plane (x = forward, y = side to the right) and rises `height` along the frame's up axis. Use a frame turned on its side (`Frame3`) to extrude along other axes.
- `Solid.box(frame: Frame3, length: number, width: number, height: number): Solid`
  A box standing on the frame origin: `length` along forward, `width` along side, `height` up. Centered on forward and side.

**Instance Methods:**

- `.visibleFaces(cam: Camera): Face[]`
  Faces turned towards the camera, back to front.
- `.silhouette(cam: Camera): Shape`
  Projected outline of the visible solid.
- `.depth(cam: Camera): number`
  Distance towards the camera; larger is drawn later.
- `.ground(): Vec3`
  Optional: where the item stands on the ground (z is ignored), used to sort whole objects.
- `.outlines(cam: Camera): Shape[]`
  Optional: shapes whose union is the projected outline (cheaper than `silhouette`), used for the object's outer contour.
- `.faceShape(cam: Camera, face: Face): Shape`
  Projected shape of one face (for decals and hand-placed details).
- `.pieces(cam: Camera, style: VolumeStyle): Piece[]`
  Visible faces as separately sorted pieces. Each face is filled with its ramp tone, then its edges are inked: the outline stroke where the neighbouring face is hidden (the silhouette), the thin edge stroke at creases (neighbour turned more than ~30°), and nothing across smooth curved surfaces.
- `.draw(ctx: CanvasRenderingContext2D, cam: Camera, style: VolumeStyle): void`
  Draws the item through the camera.

---

### `Round`

A round volume (body, head, barrel, column, pot, rock) whose silhouette is the hull of
its cross-sections. It is painted like a `@core/draw` shape with cel shading whose highlight
sits on the side of the project light.

**Constructor:**
```ts
new Round(sections: Section[], caps?: Face[]): Round
```

**Properties:**

- `sections: Section[]`
- `caps: Face[]` — Faces drawn over the body when visible (the flat cap of a cylinder).

**Static Factories:**

- `Round.loft(sections: Section[]): Round`
  Volume through a list of cross-sections (two or more), like a loft of rings.
- `Round.ellipsoid(frame: Frame3, forward: number, side: number, up: number): Round`
  Ellipsoid with radii along the frame's forward, side and up axes, centered on the frame origin.
- `Round.cylinder(frame: Frame3, radius: number, height: number, topRadius?: number): Round`
  Cylinder (or cone frustum) standing on the frame origin, `height` along the frame's up axis. The top cap is drawn as a lit face when the camera sees it.
- `Round.lathe(frame: Frame3, profile: [number, number][]): Round`
  Lathe: a profile of [height, radius] pairs turned around the frame's up axis (vases, bottles, columns).

**Instance Methods:**

- `.silhouette(cam: Camera): Shape`
  Optional: projected outline.
- `.depth(cam: Camera): number`
  Distance towards the camera; larger is drawn later.
- `.ground(): Vec3`
  Optional: where the item stands on the ground (z is ignored), used to sort whole objects.
- `.draw(ctx: CanvasRenderingContext2D, cam: Camera, style: VolumeStyle): void`
  Draws the item through the camera.
- `.outlines(cam: Camera): Shape[]`
  Optional: shapes whose union is the projected outline (cheaper than `silhouette`), used for the object's outer contour.

---

### `Tube`

A tapered tube through world points (limbs, ropes, horns, handles, branches): the
projected spline becomes a `@core/draw` ribbon of the given width. `width` is the full width of the
tube (not the radius), in world units, which are logical px at camera scale 1: a number, a
`{ start, end }` pair for a taper, or a function of `t` (0 at the first point, 1 at the last).

**Constructor:**
```ts
new Tube(points: Vec3[], width: RibbonWidth): Tube
```

**Properties:**

- `points: Vec3[]`
- `width: RibbonWidth`

**Instance Methods:**

- `.silhouette(cam: Camera): Shape`
  Optional: projected outline.
- `.depth(cam: Camera): number`
  Distance towards the camera; larger is drawn later.
- `.ground(): Vec3`
  Optional: where the item stands on the ground (z is ignored), used to sort whole objects.
- `.draw(ctx: CanvasRenderingContext2D, cam: Camera, style: VolumeStyle): void`
  Draws the item through the camera.
- `.outlines(cam: Camera): Shape[]`
  Optional: shapes whose union is the projected outline (cheaper than `silhouette`), used for the object's outer contour.

---

### `Blob`

Several round volumes and tubes painted as one organic mass (a body from rump, ribcage and
neck; a head from skull and muzzle): each part keeps its own cel shading, but only the union
of their silhouettes is outlined, so overlaps do not read as separate plates. Sorts as one
piece. A loft alone is the convex hull of its rings and cannot tuck in; a blob can.

**Constructor:**
```ts
new Blob(parts: (Round | Tube)[]): Blob
```

**Properties:**

- `parts: (Round | Tube)[]`

**Instance Methods:**

- `.silhouette(cam: Camera): Shape`
  Optional: projected outline.
- `.depth(cam: Camera): number`
  Distance towards the camera; larger is drawn later.
- `.ground(): Vec3`
  Optional: where the item stands on the ground (z is ignored), used to sort whole objects.
- `.draw(ctx: CanvasRenderingContext2D, cam: Camera, style: VolumeStyle): void`
  Draws the item through the camera.
- `.outlines(cam: Camera): Shape[]`
  Optional: shapes whose union is the projected outline (cheaper than `silhouette`), used for the object's outer contour.

---

### `Decal`

A `@core/draw` shape laid on a surface (emblem, keyhole, rune, plank seam, window): the
shape's x runs along `u` and its y along `v` from `origin`. Hidden when the surface
faces away from the camera. Styled with a plain `ShapeStyle`.

A decal sorts as a point, at the depth of its `origin`. Add it with `{ on: part }` to draw it
after the part it lies on; a decal on a curved surface needs `normal` set to the surface
normal at its origin (it is flat, and visible while that normal faces the camera).

**Constructor:**
```ts
new Decal(origin: Vec3, u: Vec3, v: Vec3, shape: Shape, normal?: Vec3 | undefined): Decal
```

**Properties:**

- `origin: Vec3`
- `u: Vec3`
- `v: Vec3`
- `shape: Shape`
- `normal: Vec3` — Outward normal of the surface the decal lies on.

**Static Factories:**

- `Decal.onFace(frame: Frame3, side: "front" | "back" | "left" | "right" | "top", at: Vec3, shape: Shape): Decal`
  Decal on a face of a frame, laid out the way a viewer looking at that face reads it: x runs to the viewer's right and y downwards, so text, runes and asymmetric emblems are never mirrored. 'top' reads from the front (y runs towards the front edge). `at` is the decal's origin in local coordinates (x = forward, y = side, z = up), on the face's plane.

**Instance Methods:**

- `.visible(cam: Camera): boolean`
- `.projected(cam: Camera): Shape`
- `.depth(cam: Camera): number`
  Distance towards the camera; larger is drawn later.
- `.ground(): Vec3`
  Optional: where the item stands on the ground (z is ignored), used to sort whole objects.
- `.draw(ctx: CanvasRenderingContext2D, cam: Camera, style: ShapeStyle | ShapeStyleOptions): void`
  Draws the item through the camera.

---

### `Stage`

Collects the objects of an asset and draws them back to front through one camera.

- `stage.object()` starts one physical object; add all of its parts to it.
- `stage.add(item)` makes a one-part object, or joins the object of its `on` host.
- Objects are sorted by layer, then by where they stand on the ground.

**Constructor:**
```ts
new Stage(camera: Camera): Stage
```

**Properties:**

- `camera: Camera`

**Instance Methods:**

- `.object(options?: ObjectOptions): StageObject`
  Starts an object: every part of one physical thing goes in the same object.
- `.add<T extends Placed>(item: T, style: Parameters<T["draw"]>[2], options?: StageOptions): this`
  Adds an item as its own object, or to the object of the part it rests `on`.
- `.custom(at: Vec3, draw: (ctx: CanvasRenderingContext2D, cam: Camera) => void, options?: StageOptions): this`
  Adds a custom drawing as its own object standing at `at` (or to the object of its `on` host).
- `.register(item: Placed, owner: StageObject): void`
- `.draw(ctx: CanvasRenderingContext2D): void`
  Draws every object back to front.

---

### `StageObject`

One physical object on the stage. Its parts are sorted among themselves; the object is
sorted against other objects by where it stands.

**Constructor:**
```ts
new StageObject(owner: Stage, camera: Camera, order: number, options?: ObjectOptions): StageObject
```

**Properties:**

- `camera: Camera`
- `layer: number`
- `order: number`

**Instance Methods:**

- `.add<T extends Placed>(item: T, style: Parameters<T["draw"]>[2], options?: Omit<StageOptions, "layer">): this`
  Adds a part (volume or decal) with its style.
- `.hidden<T>(place: () => T): T`
  Places the parts that `place` adds without drawing them: they are still there for other parts to rest `on` (a helm on a skull that an inventory icon does not show), but add no pixels, no contour and no footprint.
- `.custom(at: Vec3, draw: (ctx: CanvasRenderingContext2D, cam: Camera) => void, options?: Omit<StageOptions, "layer">): this`
  Adds a custom drawing (a flame, glow or smear drawn with `@core/draw`) sorted inside the object at the depth of a world point.
- `.key(): number`
  Depth of where the object stands, used to sort it against other objects.
- `.draw(ctx: CanvasRenderingContext2D): void`
  Draws the object's parts back to front.

---

### `Grid`

A floor grid with cells a whole number of pixels on screen.

**Properties:**

- `screen: { w: number; h: number; }` — Logical pixels of a cell's top face on screen.
- `cell: { x: number; y: number; }` — World size of a cell: x across the screen, y in depth (towards the camera).

**Static Factories:**

- `Grid.fromScreen(camera: Camera, w: number, h: number): Grid`
  A grid whose cells are `w` × `h` logical pixels on screen with this camera (e.g. 32 × 24): world width `w`, world depth `h / sin(tilt)`. Export at a whole scale and the tiles stay exact pixels.

**Instance Methods:**

- `.center(col: number, row: number): Vec3`
  World position of the centre of cell (col, row) on the floor, with cell (0, 0) centred on the origin.
- `.vertex(col: number, row: number): Vec3`
  World position of the vertex between cells, at the top-left corner of cell (col, row).

---

## Functions & Operations

### `DIRECTION_NAMES`

Screen directions in export order, for 1, 4 or 8 facings: starts facing the camera (S) and turns clockwise on screen.

```ts
const DIRECTION_NAMES: Record<number, string[]>
```

---

### `facingYaw`

Yaw (radians) of direction `index` out of `count`, in export order: index 0 faces the
camera (S, yaw π/2) and each next index turns clockwise on screen.

```ts
function facingYaw(index: number, count: number): number
```

---

### `directionName`

Name of direction `index` out of `count` ("S", "SW", ...), or "D<index>" for other counts.

```ts
function directionName(index: number, count: number): string
```

---

### `groundShadow`

Soft contact shadow on the ground (z = 0) under an object: an ellipse of radii `rx` (x) and `ry` (y),
turned by `rotation` radians on the floor, clockwise on screen (for a prop that faces a way:
`ctx.yaw - π/2`).
In a scenery piece, fill it in `ctx.ground`.

```ts
function groundShadow(cam: Camera, center: Vec3, rx: number, ry?: number, rotation?: number): Shape
```

---

### `visibleArc`

The part of a ring that faces the camera, as points for a `Tube` (belts, bracelets, collars,
barrel hoops, ribs): the back half of a band around a body must not cross its front. The
ring is `center + a·cos·rx + b·sin·ry`; returns an empty list when no part of it faces the
camera. `grow` (default 0.1) lets the arc wrap a little past the silhouette so it meets the
outline. Rings on an ellipsoid: use `bandOnEllipsoid`, which decides visibility on the surface.

```ts
function visibleArc(cam: Camera, center: Vec3, a: Vec3, b: Vec3, rx: number, ry?: number, grow?: number): Vec3[]
```

---

### `ringOnEllipsoid`

The ring where a plane cuts an ellipsoid built like `Round.ellipsoid(frame, forward, side, up)`:
the plane stands `at` local units along `axis` from the frame origin ('up' by default, so
`at` is a height and the ring is horizontal; 'forward' cuts across the body like a rib; 'side'
cuts lengthwise). The radii shrink by sqrt(1 - (at/R)²) towards the poles, which is the scaling
agents otherwise do by hand; every point of the ring lies on the ellipsoid's surface. `at` is
clamped to the ellipsoid (a ring at a pole is 0.01 wide, like `Round.ellipsoid`'s poles). Scale
`rx` and `ry` slightly (1.02) if a tube should stand a little off the surface.

```ts
function ringOnEllipsoid(frame: Frame3, forward: number, side: number, up: number, at: number, axis?: EllipsoidAxis): EllipsoidRing
```

---

### `bandOnEllipsoid`

The visible part of a band wrapped around an ellipsoid, as points for a `Tube` (a belt round a
body, ribs, stripes): the same ring as `ringOnEllipsoid(frame, forward, side, up, at, axis)`,
cut where the ellipsoid's surface turns away from the camera. Unlike `visibleArc`, which only
knows the ring's own plane, it tests the surface normal, so a ring above the equator shows
more than its front half (all of it near the top) and one below it shows less. `grow` (default
0.1) lets the arc run a little past the silhouette so it meets the outline. Returns an empty
list when none of the ring faces the camera; a ring that is visible all round comes back closed.

```ts
function bandOnEllipsoid(cam: Camera, frame: Frame3, forward: number, side: number, up: number, at: number, options?: { axis?: EllipsoidAxis | undefined; grow?: number | undefined; }): Vec3[]
```

---

### `rampTone`

Tone of a ramp for a light amount `t` in 0..1 (0 = in shadow, 1 = facing the light).
With 3 bands: below 0.22 dark, below 0.62 base, otherwise lit.

```ts
function rampTone(ramp: ShadeRamp, t: number, bands?: 0 | 2 | 3): string
```

---

### `polygonNormal`

Normal of a planar polygon (Newell's method), for faces given by points only.

```ts
function polygonNormal(points: Vec3[]): Vec3
```

---

### `FORM_DEFAULTS`

Engine defaults: three readable tones on every round part. Themes override per material.

```ts
const FORM_DEFAULTS: Required<FormShading>
```

---

### `CONTOUR_DEFAULT`

Default outer contour width, as a multiple of each part's outline.

```ts
const CONTOUR_DEFAULT: 1.7
```

---

### `vec3`

Builds a Vec3.

```ts
function vec3(x: number, y: number, z: number): Vec3
```

---

### `add3`

```ts
function add3(a: Vec3, b: Vec3): Vec3
```

---

### `sub3`

```ts
function sub3(a: Vec3, b: Vec3): Vec3
```

---

### `scale3`

```ts
function scale3(a: Vec3, s: number): Vec3
```

---

### `dot3`

```ts
function dot3(a: Vec3, b: Vec3): number
```

---

### `cross3`

```ts
function cross3(a: Vec3, b: Vec3): Vec3
```

---

### `len3`

```ts
function len3(a: Vec3): number
```

---

### `norm3`

Unit vector in the direction of `a` (zero vector stays zero).

```ts
function norm3(a: Vec3): Vec3
```

---

### `lerp3`

```ts
function lerp3(a: Vec3, b: Vec3, t: number): Vec3
```

---

### `mix3`

Weighted sum: `mix3([a, 1], [b, 2])` is a + 2b.

```ts
function mix3(...terms: [Vec3, number][]): Vec3
```

---

### `UP`

World up (z).

```ts
const UP: Vec3
```

---

### `EDGE`

Edge bits of an edge mask.

```ts
const EDGE: { readonly N: 1; readonly E: 2; readonly S: 4; readonly W: 8; }
```

---

### `CORNER`

Corner bits of a corner mask.

```ts
const CORNER: { readonly NW: 1; readonly NE: 2; readonly SE: 4; readonly SW: 8; }
```

---

### `edgeMask`

Edge mask of a cell from a predicate over cells (true where a connecting piece stands).

```ts
function edgeMask(at: (col: number, row: number) => boolean, col: number, row: number): number
```

---

### `cornerMask`

Corner mask of the vertex at the top-left corner of cell (col, row): which of the four cells
around it are covered (true).

```ts
function cornerMask(covered: (col: number, row: number) => boolean, col: number, row: number): number
```

---

### `cornerMaskShape`

The region of a dual-grid tile covered by a material, for a corner mask: the covered quarters
joined with rounded inner corners, in tile-local coordinates (x right, y towards the camera,
origin at the tile centre, size `w` × `d`). Where the region meets the tile's edges it is cut
straight, so neighbouring tiles join without seams. Computed once per mask and size.

```ts
function cornerMaskShape(mask: number, w: number, d: number, round?: number): Shape
```

---

### `defineSpace`

Declares a project's game space from its camera, its character height and a genre preset.
The grid's cells are whole, even numbers of pixels on screen in both directions (so cell
centres and vertices land on whole pixels at every whole export scale); the cell's world width
is rounded to that.

```ts
function defineSpace(o: SpaceOptions): SpaceProfile
```

---

### `SPACE_PRESETS`

Genre presets: proportions that read right for each kind of game, as multiples of the
character's height. Pick the closest one when a project starts and override what differs.

```ts
const SPACE_PRESETS: Record<SpacePresetName, SpacePreset>
```

---

### `screenHeight`

Logical pixels on screen of something `height` world units tall standing on the floor.

```ts
function screenHeight(camera: Camera, height: number): number
```

---

### `heightOf`

World units of a height given as a number or as a size of the profile ('wall', 'door'...).

```ts
function heightOf(space: SpaceProfile | undefined, height: SpaceHeight): number | undefined
```

---

### `spaceData`

The profile in plain data, for atlases and editors: sizes in world units and in logical pixels on screen.

```ts
function spaceData(space: SpaceProfile): { projection: "top-down"; preset: SpacePresetName; walls: WallPlacement; scale: SpaceScale; screen: { ...; }; }
```

---

### `scaleFigure`

A scale figure: a plain, translucent mannequin of the project's character height standing at
`at`, for judging proportions next to scenery (the scene painter, `scenery-test`). It is a
checking aid, not art: games never draw it.

```ts
function scaleFigure(object: StageObject, at: Vec3, height: number, o?: { color?: string | undefined; ink?: string | undefined; }): void
```

---

### `playhead`

A piece clip's position in frames (`t × (frames − 1)`): the `x` of `keyed`.

```ts
function playhead(clip: { t: number; frames: number; }): number
```

---

### `keyed`

The value of hand-timed keys at frame position `x`: exactly a key's value on its frame, a smooth
curve (Catmull-Rom) through the keys between them, and the first or last value outside them.

```ts
function keyed(x: number, keys: ClipKeys): number
```

---

### `loopWave`

A wave for loops: `cycles` whole turns over the loop at `phase` (a fraction of a turn), minus its
starting value, so the loop's frame 0 is the still look and it closes exactly. Sum a few with
different cycles and phases for a flame.

```ts
function loopWave(t: number, cycles: number, phase?: number): number
```

---

### `defineEffect`

Exports one effect as the sheet a game plays: its frames across and its facings down, pivoted on
the effect's origin. The atlas says `role: 'vfx'` and the effect: kind, frames, fps, loop, layer,
height, size, events, travel and follows.

```ts
function defineEffect(o: EffectAssetOptions): AssetDefinition
```

---

### `validateEffects`

Problems of an effect catalog: ids, frames, events, travel, follows, materials. Empty when valid.

```ts
function validateEffects(catalog: EffectCatalog): string[]
```

---

### `drawEffectFrame`

Draws one frame of an effect with `camera` on its origin: its floor marks, then its parts.

```ts
function drawEffectFrame(c: CanvasRenderingContext2D, info: EffectInfo, catalog: EffectCatalog, camera: Camera, f: { frame: number; dir: number; options: Record<...>; materials: SceneMaterials; }): void
```

---

### `effectCell`

Default exported cell of an effect: room for its reach on every side, and for the floor under an effect in the air.

```ts
function effectCell(info: EffectInfo, camera: Camera): { width: number; height: number; pivot: { x: number; y: number; }; }
```

---

### `effectLayer`

Where an effect is drawn by default for its kind.

```ts
function effectLayer(info: EffectInfo): "ground" | "air"
```

---

### `effectRng`

A seeded generator for an effect (stable across its frames).

```ts
function effectRng(ctx: Pick<EffectContext, "seed">, salt?: number): Rng
```

---

### `sceneNavigation`

The navigation of a scene:
- a cell without floor, or with a floor that blocks (deep water), cannot be entered; other
  floors cost their `nav.cost` (default 1);
- props that block (all by default, decals never) close the cells of their turned footprint,
  unless their state is passable (an urn once broken);
- walls on borders close the cell edges they run along; walls at cell centres close their cells;
- doors close their edge until their state is passable ('open').
`open` overrides door states by prop index (a game's live state).

```ts
function sceneNavigation(scene: SceneData, catalog: SceneryCatalog, o?: { open?: Record<number, boolean> | undefined; }): SceneNavigation
```

---

### `pieceBlocks`

Whether a piece stops movement in a state (its `nav`, or the group's default).

```ts
function pieceBlocks(info: ScenePieceInfo, state?: string | undefined): boolean
```

---

### `floorTile`

Paints one floor frame: a whole tile (mask 15) or a dual-grid transition. Everything is painted
in screen pixels around the projected origin; the engine clips the tile to itself. `paint` draws
the material over `t.region` and its details; what it draws outside the region (tufts, a slab's
side) stays inside the tile and close to the edge, because it shows wherever this floor runs on
under a higher one.

Rules every floor of a kit follows (guide 04 §3.1):
- a whole tile paints the same along its border in every variant (half mortar lines, or nothing
  but the base tone), and its details sit inside it;
- a frame draws one tile, never one place: the look of a field comes from 4–6 variants, with
  large features soft and spread over the tile (`t.spread`, `t.fit`);
- every floor uses the same `edge`, so coinciding edges of two floors lie exactly on each other.

```ts
function floorTile(ctx: PieceContext, o: FloorTileOptions): void
```

---

### `floorBlob`

An irregular blob (a stain, a pebble, a puddle) from an ellipse roughened by noise, for floor details.

```ts
function floorBlob(cx: number, cy: number, rx: number, ry: number, seed: number, rotation?: number, rough?: number): Shape
```

---

### `FLOOR_EDGE`

Default edge of `floorTile`.

```ts
const FLOOR_EDGE: FloorEdge
```

---

### `drawScene`

Draws a scene into a canvas context with the catalog's pieces, the way a game lays out the sheets
(see `layoutScene`): floors first, lowest priority first, each tile clipped to itself and all
to the scene's cells; then decals; then walls, fences and props by where they stand. `origin` is
the screen position of cell (0, 0)'s centre. For an editor that redraws often, use
`createSceneRenderer`, which draws each frame once.

```ts
function drawScene(ctx: CanvasRenderingContext2D, scene: SceneData, catalog: SceneryCatalog, origin: { x: number; y: number; }, o?: DrawSceneOptions): void
```

---

### `layoutScene`

Lays a scene out as frames, in drawing order (`SceneItem`):
- the lowest floor in the scene lays a full tile (mask 15) under every floored cell;
- every higher floor lays a dual-grid tile at each vertex next to one of its own cells, with the
  corner mask of the cells of its priority or higher (so it runs on under higher floors and no
  lower floor shows between two higher ones);
- walls and fences take the edge mask of neighbours of the same piece or a joined one;
- props and decals stand at the centre of their footprint, turned by their facing.
Variants not given in the scene are picked per position.

```ts
function layoutScene(scene: SceneData, catalog: SceneryCatalog): SceneItem[]
```

---

### `createSceneRenderer`

A scene renderer for editors and games that redraw often. Every frame (a piece with its mask,
variant, facing, options and materials) is drawn once into an offscreen canvas, in the piece's
exported cell plus a margin, and then copied to its place: the result is what `drawScene` and a
game laying out the sheets draw: frames are rasterized in software, like the exported sheets, so
at the export scale the result matches them pixel for pixel (up to the rounding of compositing
translucent edges). Changing the drawing scale starts a new cache.

```ts
function createSceneRenderer(catalog: SceneryCatalog, o?: SceneRendererOptions): SceneRenderer
```

---

### `validateScene`

Problems of a scene against a catalog (unknown pieces, wrong groups, out-of-bounds placements, bad options). Empty when valid.

```ts
function validateScene(scene: SceneData, catalog: SceneryCatalog): string[]
```

---

### `sceneMaterials`

Resolves role → material names into a material set (catalog defaults, then overrides).

```ts
function sceneMaterials(catalog: SceneryCatalog, overrides?: Record<string, string> | undefined): SceneMaterials
```

---

### `footprintOf`

Cells a prop or decal covers placed with facing `dir`: [across, deep], its footprint swapped when it faces east or west.

```ts
function footprintOf(info: ScenePieceInfo, dir?: number): [number, number]
```

---

### `cellPiece`

The piece id of a wall cell (`'crypt-wall'` or `{ piece: 'crypt-wall', ... }`), or null.

```ts
function cellPiece(cell: SceneCell | null | undefined): string | null
```

---

### `cellOf`

Default exported cell of a piece: a floor or decal is exactly its tiles; walls, fences and props get room above.

```ts
function cellOf(info: ScenePieceInfo, catalog: SceneryCatalog): { width: number; height: number; pivot: { x: number; y: number; }; }
```

---

### `frameOf`

Frame index of a mask and variant in a piece's sheet (in the row of its facing).

```ts
function frameOf(info: ScenePieceInfo, mask: number, variant: number): number
```

---

### `defineTileSet`

Exports one piece of the catalog as the sheet a game lays out:
- floors and connectable pieces: one frame per mask and variant (`meta.data.tiles` maps each
  frame to its mask and variant); a full floor tile is mask 15, transitions are the corner
  masks 1–14 of a dual-grid tile centred on a vertex;
- props and decals: rows per facing, one frame per variant.
Floor frames are exactly one tile, pivoted at its centre; draw floors at the tile's centre and
transitions at the vertex between four tiles. Every frame is what `drawScene` draws for it.

```ts
function defineTileSet(o: TileSetOptions): AssetDefinition
```

---

### `defineSceneAsset`

Exports a whole scene (a set, a vignette, a level chunk) as one image, for reference and
previews. Its atlas carries the layout a game follows to build the same picture from the
sheets: `layout` lists every frame in drawing order with its piece, frame, facing row and pivot
in the image (logical px). An item with `options` (or a scene with `materials`) draws a frame
the default sheets do not hold: a look a game needs belongs in a variant.

```ts
function defineSceneAsset(o: SceneAssetOptions): AssetDefinition
```

---

### `seamTestScene`

A scene that puts one piece through every join it has, for the guide's seam check
(`npm run scenery-test`, or an editor's preview):
- a floor: patches of it on the lowest floor, or on `on` (a 3×3, a single cell, a diagonal pair
  for the saddle masks, a ring round a hole, an L); for the base floor itself, the same patches
  of another floor on a field of it; with `field`, a 14 × 10 field of the floor alone, to judge
  repetition at 1×;
- a wall or fence: a closed loop with a T below it, a cross, a lone post, a free run with two
  ends, and a run through the first piece it joins;
- a prop or decal: every facing (rows) by every variant of every state (columns), spaced by its
  exported cell;
- a door: a walled room with the door on its north wall and, in its next state, on its west wall.
Everything stands on the catalog's lowest floor, or on `on` (null for no floor).

```ts
function seamTestScene(catalog: SceneryCatalog, piece: string, o?: { on?: string | null | undefined; field?: boolean | undefined; }): SceneData
```

---

### `wallPlacement`

Where the catalog's walls stand: on cell borders when its space profile says so, else through cell centres.

```ts
function wallPlacement(catalog: SceneryCatalog): WallPlacement
```

---

### `wallGridSize`

Size of a scene's `walls` grid: the cells, or one more each way when walls stand on borders.

```ts
function wallGridSize(catalog: SceneryCatalog, cols: number, rows: number): { cols: number; rows: number; }
```

---

### `emptyScene`

An empty scene of this size for the catalog: no floor, no walls, no props.

```ts
function emptyScene(catalog: SceneryCatalog, cols: number, rows: number): SceneData
```

---

### `pieceHeight`

Nominal height of a piece in world units (its `height`, or the profile's wall and fence heights), if known.

```ts
function pieceHeight(info: ScenePieceInfo, catalog: SceneryCatalog): number | undefined
```

---

### `heightsOf`

The heights a wall or fence comes in, in world units (its `heights`, else its nominal height); empty when unknown.

```ts
function heightsOf(info: ScenePieceInfo, catalog: SceneryCatalog): number[]
```

---

### `validateCatalog`

Problems of a catalog: duplicate ids, a group with the wrong connection, labels that do not match
the variants, unknown joins, facings or footprints out of range, default options out of their
own range, materials that do not exist. Empty when valid. `scenery-items`, `new-scene` and
`scenery-test` refuse a catalog with problems.

```ts
function validateCatalog(catalog: SceneryCatalog): string[]
```

---

### `floorGlow`

A soft pool of light on the floor around `at` (world, z = 0): a radial gradient of `color` that
fades out at `radius` (logical px across), flattened by the camera's tilt; `strength` is its
alpha at the centre. Add it to `ctx.ground`, so it lies under the parts and their contour.

```ts
function floorGlow(ground: StageObject, at: Vec3, o: { radius: number; color: string; strength?: number | undefined; }): void
```

---

### `masksOf`

The masks a connectable piece is exported with.

```ts
function masksOf(connect: Connect): number[]
```

---

### `pieceRng`

Random-but-stable helper for pieces: a `createRng` seeded by the frame.

```ts
function pieceRng(ctx: Pick<PieceContext, "seed">): Rng
```

---

## Types & Interfaces

### `CameraOptions`

Options of a `Camera`.

```ts
interface CameraOptions {
  /** Angle of the view above the ground plane, in degrees. Default 48 (Hades-like 3/4 view). */
  tilt?: number;
  /** Vertical stretch applied to heights. The tilted view shortens vertical parts (legs, walls) more than depth; 1.2 compensates so figures and props read at a natural height. Default 1.2. */
  heightBoost?: number;
  /** The project's light. Default: from the upper left, slightly towards the camera. */
  light?: LightOptions;
  /** Screen position of the world origin, in logical pixels. Default { x: 0, y: 0 }. */
  origin?: Point;
  /** World units per logical pixel. Default 1. */
  scale?: number;
  /** The project's outer contour: one line of this width (what shows outside the silhouette) and color around every stage object, heavier than the lines between parts. Set it once here so every prop, character and scenery piece of the project shares it. Default: 1.7× the widest part outline of each object, in that outline's color; `false` for none. */
  contour?: false | { width: number; color: string; };
}
```

### `LightOptions`

The project's light: where it comes from, on the ground plane and above it.

```ts
interface LightOptions {
  /** Direction the light comes from on the ground plane, in degrees: 0 = from the right (+x), 90 = from the camera side (+y), 180 = from the left. */
  azimuth: number;
  /** Height of the light above the ground plane, in degrees (90 = straight down). */
  elevation: number;
  /** Light received by faces turned away from the light, 0..1. */
  ambient?: number;
}
```

### `EllipsoidAxis`

The axis of an ellipsoid's frame that a ring is cut perpendicular to (see `ringOnEllipsoid`).

```ts
type EllipsoidAxis = "side" | "up" | "forward"
```

### `EllipsoidRing`

A ring in the form `visibleArc` takes: `center + a·cos·rx + b·sin·ry`.

```ts
interface EllipsoidRing {
  center: Vec3;
  a: Vec3;
  b: Vec3;
  rx: number;
  ry: number;
}
```

### `FormShading`

How round volumes (rounds, tubes, blobs) show their form. Every band is a crescent: the
silhouette minus itself shifted along the light, so a finger and a torso both get a readable
shadow (a shadow proportional to size vanishes on small parts).

```ts
interface FormShading {
  /** Core shadow (ramp dark) on the side away from the light. */
  core?: FormWidth;
  /** Highlight (ramp lit) along the edge facing the light; `false` for none (matte cloth). */
  highlight?: false | FormWidth;
  /** Reflected light: a thin sliver of `color` along the edge inside the core shadow. */
  rim?: false | { color: string; width: number; };
}
```

### `FormWidth`

A width that follows a part's thickness: `ratio` of it, kept within [min, max] world units.

```ts
interface FormWidth {
  ratio: number;
  min: number;
  max: number;
}
```

### `Face`

One planar face of a faceted solid, with its outward normal.

```ts
interface Face {
  points: Vec3[];
  normal: Vec3;
}
```

### `Section`

A cross-section of a round volume: an ellipse around `center` in the plane of two axes.

```ts
interface Section {
  center: Vec3;
  /** Radius along the first axis (default: world x). */
  rx: number;
  /** Radius along the second axis (default: world y). Defaults to `rx`. */
  ry?: number;
  /** The two axes of the ellipse. Default: world x and y (a horizontal ring). */
  axes?: [Vec3, Vec3];
}
```

### `ShadeRamp`

Three tones of one material: the theme's ramps (`RAMPS.wood`, ...) already have this shape.

```ts
interface ShadeRamp {
  lit: string;
  base: string;
  dark: string;
}
```

### `VolumeStyle`

How a volume is painted: a material ramp plus the `@core/draw` styling of its outline and surfaces.

```ts
interface VolumeStyle {
  /** Material tones. Faces pick a tone from how much light they receive. */
  ramp: ShadeRamp;
  /** Line around each part: the line between parts, under the object's outer contour (set `contour` on the Camera). Make it a darker shade of the material and thinner than the contour. */
  stroke?: StrokeStyle<{}> | StrokeOptions;
  /** Thin line at the creases of a faceted solid (neighbouring faces turned more than ~30 degrees). Omit for none. */
  edge?: StrokeStyle<{}> | StrokeOptions;
  /** Texture painted on each visible face (or on the silhouette of a round volume). */
  texture?: Texture<unknown> | Texture<unknown>[];
  /** Details clipped to each visible face (faceted) or to the silhouette (round). */
  inside?: InsideCallback;
  /** Cel bands of faceted solids: 3 (default) snaps each face to dark / base / lit; 0 blends smoothly. */
  bands?: 0 | 2 | 3;
  /** Form shading of round volumes (see `FormShading`); fields left out use `FORM_DEFAULTS`. */
  form?: FormShading;
  /** Drop shadow of the silhouette. Prefer `groundShadow` for objects standing on the floor. */
  shadow?: ShadowOptions;
}
```

### `Placed`

Anything a `Stage` can sort and draw.

```ts
interface Placed {
  /** Distance towards the camera; larger is drawn later. */
  depth(cam: Camera): number;
  /** Draws the item through the camera. */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, style: unknown): void;
  /** Optional: the item split into pieces sorted on their own (faces of a solid), so parts that wrap or touch other parts (a band around a lid) sort correctly face by face. */
  pieces?(cam: Camera, style: unknown): Piece[];
  /** Optional: where the item stands on the ground (z is ignored), used to sort whole objects. */
  ground?(): Vec3;
  /** Optional: projected outline. */
  silhouette?(cam: Camera): Shape;
  /** Optional: shapes whose union is the projected outline (cheaper than `silhouette`), used for the object's outer contour. */
  outlines?(cam: Camera): Shape[];
}
```

### `Piece`

One separately sorted piece of a volume (a face of a solid).

```ts
interface Piece {
  depth: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}
```

### `StageOptions`

Placement options of a stage item.

```ts
interface StageOptions {
  /** Added to the item's depth inside its object. Use it to break ties between coplanar pieces, or to lay a flat detail over all its siblings (a large bias, see `on`); for attachments use `on`. */
  bias?: number;
  /** Objects of a lower layer are always drawn first: ground marks 0, objects 1 (default), overlays 2. Only meaningful on `stage.add`, `stage.custom` and `stage.object`. */
  layer?: number;
  /** The part this item rests on or is fixed to (a candle on a lid, a lock on a door, a crest on a helmet). The item joins that part's object and is drawn after every piece of it, from every facing. The part must be added first. Chains work: an item may rest on a part that itself rests on another, and is then drawn after both. `on` only means "after the host", never "under its siblings": items resting on the same host sort among themselves by depth, and whatever rests on a decal is drawn over that decal. So ribs `{ on: glow }` cover the glow they cross (a dense cage hides it entirely), while ribs and glow both `{ on: body }` sort by depth (a decal sorts at its origin, so near ribs may cover it and far ones not, depending on the facing). To show a glow through a cage, leave the cage open where the glow is; to lay it over every sibling from every facing, give it a `bias` larger than the object's depth spread (`{ on: body, bias: 100 }`). */
  on?: Placed;
}
```

### `ObjectOptions`

Options of `stage.object()`.

```ts
interface ObjectOptions {
  /** Layer of the whole object (see `StageOptions.layer`). Default 1. */
  layer?: number;
  /** Where the object stands on the ground. Default: the centre of its parts' footprint. Set it for objects whose parts extend far from where they stand. */
  at?: Vec3;
  /** Outer contour: the object's whole silhouette is inked with one line this many times the widest outline among its parts (half of it shows outside), so the outside line is heavier than the lines between parts and the object reads as one shape. Default: the camera's `contour` (set once per project), else 1.7; `false` for none. Pass `{ width, color }` for an explicit line (ink outside, material-colored lines inside). */
  contour?: number | false | { width: number; color: string; };
}
```

### `Vec3`

A point or direction in the 2.5D world: x right, y towards the camera, z up.

```ts
interface Vec3 {
  x: number;
  y: number;
  z: number;
}
```

### `SpaceProfile`

A project's game space.

```ts
interface SpaceProfile {
  /** The projection the engine draws (only 'top-down' today). */
  projection: "top-down";
  /** The preset it started from. */
  preset: SpacePresetName;
  camera: Camera;
  grid: Grid;
  walls: WallPlacement;
  scale: SpaceScale;
}
```

### `SpaceScale`

Sizes of a game space in world units, all measured against its characters.

```ts
interface SpaceScale {
  /** Height of a standing adult character: the reference everything is checked against. */
  character: number;
  /** Width of a grid cell (its depth follows from the camera so a cell is whole pixels on screen). */
  cell: number;
  /** Height of a full wall's top. */
  wall: number;
  /** Clear height of a doorway or gate. */
  door: number;
  /** Height of a fence, a railing or a low wall. */
  fence: number;
}
```

### `SpaceOptions`

Options of `defineSpace`.

```ts
interface SpaceOptions {
  camera: Camera;
  /** Height of the project's standing adult character, in world units (what its skins are built at). */
  character: number;
  /** Genre preset to start from. Default 'jrpg'. */
  preset?: SpacePresetName;
  /** Overrides of the preset. */
  walls?: WallPlacement;
  scale?: Partial<Omit<SpaceScale, "character">>;
}
```

### `SpacePreset`

A starting point for a kind of game.

```ts
interface SpacePreset {
  label: string;
  description: string;
  walls: WallPlacement;
  /** Sizes as multiples of the character's height. */
  ratios: Omit<SpaceScale, "character">;
}
```

### `SpacePresetName`

Names of the genre presets.

```ts
type SpacePresetName = "jrpg" | "action-rpg" | "tactics" | "farm-sim" | "dungeon-crawler"
```

### `SpaceHeight`

A height given in world units or as one of the profile's sizes.

```ts
type SpaceHeight = number | keyof SpaceScale
```

### `WallPlacement`

Where walls and fences stand: through the centre of their cells, or on the borders between cells.

```ts
type WallPlacement = "center" | "border"
```

### `ClipKeys`

Hand-timed keys, `[frame, value]`, sorted by frame.

```ts
type ClipKeys = readonly (readonly [number, number])[]
```

### `EffectKind`

What an effect is for, which tells a player how to play it.

```ts
type EffectKind = "projectile" | "impact" | "cast" | "aura" | "area" | "burst" | "trail"
```

### `EffectContext`

Everything an effect piece receives to draw one frame.

```ts
interface EffectContext {
  /** Parts that stand or fly (layer 1). */
  object: StageObject;
  /** Marks on the floor under them: rings, scorches, shadows, pools of light (layer 0, drawn first). */
  ground: StageObject;
  /** The project camera with the world origin on the effect's origin. */
  camera: Camera;
  /** Origin at the effect's origin (world 0, 0, 0), turned to its heading: x forward (a projectile's travel), y right, z up. An effect that plays in the air (a projectile at a hand's height) has its origin there: the floor is `height` below it. */
  frame: Frame3;
  /** Height of the origin above the floor in world units (0 for effects on the floor). */
  height: number;
  /** Progress: 0 → 1 across a one-shot effect (its last frame is 1); frame ÷ frames round a loop. */
  t: number;
  frameIndex: number;
  frames: number;
  /** Facing index and count (projectiles and other turned effects). */
  dir: number;
  directions: number;
  /** The heading as a yaw on the floor (π/2 faces the camera). */
  yaw: number;
  /** How far it reaches, in world units (its `size`). */
  size: number;
  /** The seed of this effect: the same in every frame and facing, so details hold still while it plays. */
  seed: number;
  materials: SceneMaterials;
}
```

### `EffectPiece`

An effect piece: draws one frame. `O` are its options.

```ts
type EffectPiece<O = Record<string, unknown>> = (ctx: EffectContext, options: O) => void
```

### `EffectInfo`

An effect as editors, exporters and players see it.

```ts
interface EffectInfo {
  /** Stable id: its sheet is `sheets/vfx/<id>.ts` (written by `npm run vfx-items`), exported to `assets/vfx/<id>`. */
  id: string;
  label: string;
  kind: EffectKind;
  piece: EffectPiece<any>;
  frames: number;
  /** Frames per second. Default 12. */
  fps?: number;
  /** Plays round and round (a projectile in flight, an aura); else once. */
  loop?: boolean;
  /** Facings it is drawn in (projectiles: 8 or 16, so its heading reads). Default 1. */
  directions?: 1 | 4 | 8 | 16;
  /** Radius it reaches in world units: sizes the exported cell. */
  size: number;
  /** Height of its origin above the floor (a projectile flies at about a hand's height). Default 0. */
  height?: number;
  /** Where a player draws it: 'ground' under every standing thing (rings, scorches), or 'air' sorted with them. Default by kind: area and cast on the ground, the rest in the air. */
  layer?: "ground" | "air";
  /** Moments a game reacts to: { frame: 2, name: 'hit' } (damage lands), 'release', 'fade'. */
  events?: { frame: number; name: string; }[];
  /** Projectiles: how fast they fly (world units per second) and how far before they end. */
  travel?: { speed: number; range?: number | undefined; };
  /** The effect played where this one ends (a projectile's impact). */
  follows?: string;
  roles: string[];
  options?: PieceOption[];
  /** Logical size of one exported cell and the pivot (the effect's origin) inside it (default from `size` and `height`). */
  cell?: { width: number; height: number; pivot: { x: number; y: number; }; };
}
```

### `EffectCatalog`

A project's effects: pieces, materials, camera and (optionally) its space profile.

```ts
interface EffectCatalog {
  effects: EffectInfo[];
  materials: Record<string, VolumeStyle>;
  defaultMaterials: Record<string, string>;
  camera: Camera;
  space?: SpaceProfile;
}
```

### `EffectAssetOptions`

Options of `defineEffect`.

```ts
interface EffectAssetOptions {
  catalog: EffectCatalog;
  effect: string;
  options?: Record<string, unknown>;
  /** Role → material name overrides. */
  materials?: Record<string, string>;
  scale?: number;
}
```

### `SceneNavigation`

Where characters can go in a scene.

```ts
interface SceneNavigation {
  cols: number;
  rows: number;
  /** Cost of entering each cell, `cost[row][col]`: 1 for plain ground, more for slow ground, 0 when it cannot be entered. */
  cost: number[][];
  /** Edges of each cell that cannot be crossed, `walls[row][col]`: N 1, E 2, S 4, W 8 (walls on borders, closed doors). */
  walls: number[][];
  /** Doors (on cell edges): the prop index in the scene, where, the state, and whether they let characters through now. */
  doors: { index: number; piece: string; col: number; row: number; edge: "N" | "W"; state?: string | undefined; open: boolean; }[];
  /** Things to use (`nav.interact` of their piece, in a state of its `interactIn`): chests, levers, breakables, doors. `cells` are the cells a character uses them from. */
  interactables: { index: number; piece: string; kind: string; col: number; row: number; state?: string | undefined; cells: NavCell[]; }[];
  /** Walls on borders: the vertices where a blocking wall stands, `posts[row][col]` for the vertex at the top-left corner of cell (col, row), (rows + 1) × (cols + 1): piers and lone pillars a body cannot walk through even where no edge is closed (`moveIn` of `@diorama/runtime` keeps clear of them). */
  posts: boolean[][];
}
```

### `NavCell`

A cell of the grid.

```ts
interface NavCell {
  col: number;
  row: number;
}
```

### `FloorTile`

What a floor piece paints with: the tile on screen, its covered region, its edge and helpers.

```ts
interface FloorTile {
  c: CanvasRenderingContext2D;
  cam: Camera;
  /** Screen position of the tile's centre and its size in logical pixels (the grid's cell, e.g. 32 × 24). */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Corner mask (15 = a whole tile) and variant of this frame. */
  mask: number;
  variant: number;
  /** True for a whole tile: nothing to transition. */
  full: boolean;
  /** The area the material covers, on screen, with its edge roughened inside the tile. */
  region: Shape;
  /** The roughened edge of the region as polylines on screen: only the part inside the tile, never the straight cut along its border. */
  edge: Point[][];
  /** The frame's generator (`ctx.seed` and the floor's `salt`). */
  rng: Rng;
  /** Strokes the region's edge inside the region, by how each stretch faces the light: `lit` where it faces the light, `dark` where it faces away. A raised floor (flagstones, a gravel bed) catches the light on its far edges and shows its side on the near ones; a `recessed` one (water, a pit) is the other way round. Widths are the visible widths; nothing is drawn along the border. */
  bevelEdge(o: { lit: string; dark: string; litWidth: number; darkWidth: number; recessed?: boolean | undefined; }): void;
  /** Runs `fn` clipped to the covered region (the engine already clips the whole tile to itself). */
  inRegion(fn: () => void): void;
  /** Tile-local position (origin at the centre, y down) on screen. */
  at(lx: number, ly: number): Point;
  /** A tile-local rectangle `margin` inside the border: where details may sit without crossing into a neighbour. */
  safe(margin: number): { x0: number; x1: number; y0: number; y1: number; };
  /** `n` tile-local points spread evenly over the whole tile, one to a cell of a jittered grid: unlike plain random points they neither clump nor leave a gutter by the border, so a repeated detail reads as an even texture instead of a cluster in every tile. */
  spread(n: number): Point[];
  /** Moves a tile-local point so something `rx` × `ry` across (plus `pad`) lies wholly inside the tile: big things end up inside, small ones keep their place near the border. */
  fit(p: Point, rx: number, ry?: number | undefined, pad?: number | undefined): Point;
}
```

### `FloorEdge`

How a kit's floors roughen their transitions. Every floor of a kit must use the same values.

```ts
interface FloorEdge {
  /** Amplitude (px) of the roughened edge. Default 1.7; 0 for a straight rounded edge. */
  rough: number;
  /** Distance (px) from the border over which the roughness fades to the exact cut. Default 4. */
  fade: number;
  /** A transition grows its region by this much, so antialiasing never lets a lower floor's edge show through. Default 0.7. */
  grow: number;
  /** Seed of the edge waves: one per kit, never per floor, variant or place. */
  seed: number;
}
```

### `FloorTileOptions`

Options of `floorTile`.

```ts
interface FloorTileOptions {
  /** Paints the material over `t.region` and its details. */
  paint: (t: FloorTile) => void;
  /** Mixed into the frame's seed, so two floors with the same seed still differ. */
  salt?: number;
  /** The kit's edge (same for every floor of the kit). */
  edge?: Partial<FloorEdge>;
  /** Line used by `bevelEdge` (its color and width are replaced). Default: a clean round line. */
  line?: StrokeStyle<{}>;
}
```

### `SceneMaterials`

Materials by role (`stone`, `mortar`, `wood`, `metal`, `moss`...): pieces ask for roles, the kit maps them to theme materials.

```ts
type SceneMaterials = { [x: string]: VolumeStyle; }
```

### `Connect`

How a piece connects to its neighbours, which decides its frames.

```ts
type Connect = "none" | "edges" | "corners"
```

### `PieceContext`

Everything a piece receives to draw one frame: a cell, a footprint or a dual-grid vertex.

```ts
interface PieceContext {
  /** The placement's parts. Floors and decals lie on the floor (layer 0); walls, fences and props stand on it (layer 1). */
  object: StageObject;
  /** Marks on the floor under the parts: a contact shadow, a pool of light. They are drawn before the parts and their outer contour, so the contour stays crisp over them. For floors and decals this is `object` itself. */
  ground: StageObject;
  /** The project camera with the world origin on the placement's pivot. */
  camera: Camera;
  grid: Grid;
  /** Origin at the placement's pivot on the floor (always world 0, 0, 0), turned to its facing: x forward, y right, z up in the piece's own frame. Floors, walls and fences always face the camera (forward = world +y, towards it), so build them in world axes. */
  frame: Frame3;
  /** Edge mask (walls, fences) or corner mask (floor transitions); 15 for a full floor tile, 0 when unconnected. */
  mask: number;
  /** Variant index, for pieces with several looks (cracked flags, a missing plank). */
  variant: number;
  /** Facing index of a prop (0 faces the camera, then clockwise on screen); 0 for the rest. */
  dir: number;
  /** Number of facings the piece is exported in (1 for everything but props). */
  directions: number;
  /** The facing as a yaw on the floor (`facingYaw(dir, directions)`; π/2 faces the camera): orient what is not part of the solids from it (a shadow, a pool of light, a trail), never from `frame.forward` read back. The same for every frame of a placement. */
  yaw: number;
  /** The resting state this frame shows ('closed', 'open', 'broken'), for pieces with `states`; during a clip, its `from` state. */
  state?: string;
  /** The frame of an animation being drawn, for pieces with `clips`: its name, frame index, frame count and progress `t` (0 → 1 across a transition; frame ÷ frames round a loop). Undefined for still frames. */
  clip?: { name: string; frame: number; frames: number; t: number; };
  /** Walls and fences: the height of this frame's top in world units, one of the piece's `heights` (build courses, bars and posts to it; keep blocks the same size, so a low wall has fewer courses, not squashed ones). Other pieces: their nominal `height`, when the catalog gives one. */
  height?: number;
  /** The seed of this frame: the same for a piece, mask and variant wherever it is laid, and the same in every facing (details drawn from it turn with the prop). Pass it to `createRng` (or use `pieceRng`) for details; a look that must differ between placements is a variant. */
  seed: number;
  materials: SceneMaterials;
  /** Walls and fences: the height of the run's top where this cell meets its north neighbour. When the north edge is connected the engine cuts the cell's drawing above that line on screen, so this cell's outline does not lie across the neighbour's top. (Connected east and west edges are always cut on the cell's border, and south needs no cut: the cell to the south is drawn later and covers the end.) Keep posts and finials near a connected north edge below the line, or they are cut too. */
  seam(top: number): void;
}
```

### `ScenePiece`

A scenery piece: draws one placement into its object. `O` are its options.

```ts
type ScenePiece<O = Record<string, unknown>> = (ctx: PieceContext, options: O) => void
```

### `PieceOption`

An editable option of a piece (same shape as rig part options).

```ts
type PieceOption = { key: string; label: string; type: "number"; default: number; min: number; max: number; step?: number | undefined; } | { key: string; label: string; type: "boolean"; default: boolean; } | { key: string; label: string; type: "select"; default: string; choices: { value: string; label: string; }[]; }
```

### `ScenePieceInfo`

A piece as editors and exporters see it.

```ts
interface ScenePieceInfo {
  /** Stable id used in saved scenes (e.g. 'crypt-wall'). */
  id: string;
  label: string;
  /** 'floor', 'wall', 'fence', 'door', 'prop' or 'decal'. Floors and decals draw on layer 0. A door stands on a cell edge between two wall vertices (walls on borders) and breaks the run there: the walls on either side end in piers, its jambs. */
  group: "wall" | "door" | "fence" | "floor" | "prop" | "decal";
  piece: ScenePiece<any>;
  connect: Connect;
  /** Number of looks (frames per mask). Default 1. */
  variants?: number;
  /** What each variant looks like, for editors ('intact', 'cracked'), in variant order. */
  variantLabels?: string[];
  /** Cells covered when facing the camera, [across, deep]; swapped when the prop faces east or west. Default [1, 1]. */
  footprint?: [number, number];
  /** Facings a prop can be placed in (1, 4 or 8). Default 1. */
  directions?: 1 | 4 | 8;
  /** Floors: higher priority floors are drawn over lower ones at transitions. */
  priority?: number;
  /** Walls and fences: other piece ids they connect to besides themselves (a gate joins a fence). Either side declaring it is enough: two pieces connect when one of them lists the other. */
  joins?: string[];
  roles: string[];
  options?: PieceOption[];
  /** Logical size of one exported cell and the pivot inside it (default: from the grid and the group). */
  cell?: { width: number; height: number; pivot: { x: number; y: number; }; };
  /** Nominal height of the piece's top at its default options: world units, or a size of the project's space profile ('wall', 'door', 'fence', 'character'). Walls default to 'wall' and fences to 'fence' when the catalog has a space profile. `inspect` checks the exported sheet against it. */
  height?: SpaceHeight;
  /** Walls and fences: the heights the piece comes in, in world units or as profile sizes, e.g. `['fence', 'wall']` for a stone wall that also makes a low wall. The first is the default. A scene chooses one per cell (`{ piece, height }`), the piece builds to `ctx.height`, and the sheet has one row per height. Default: `[height]`. */
  heights?: SpaceHeight[];
  /** Resting states, the default first ('closed', 'open'); a scene picks one per placement. Props, decals and doors. */
  states?: string[];
  /** Animations by name: transitions between states and loops. Each exports as its own sheet (`sheets/scenery/<id>--<clip>.ts`). */
  clips?: Record<string, PieceClip>;
  /** Movement and play: what blocks, what costs, what can be used. */
  nav?: PieceNav;
  /** Where the piece's sheet is, as a path under the project's `sheets/` without `.ts`, when it is not the generated `scenery/<id>` (e.g. 'props/tombstone' for a prop that has its own sheet), or false for none. `scenery-items` writes no default sheet for it (its other states and clips still are). */
  asset?: string | false;
}
```

### `SceneryCatalog`

A project's scenery catalog: pieces, materials by name, the grid and the camera.

```ts
interface SceneryCatalog {
  pieces: ScenePieceInfo[];
  materials: Record<string, VolumeStyle>;
  /** Role → material name used when a scene or piece does not say otherwise. */
  defaultMaterials: Record<string, string>;
  grid: Grid;
  camera: Camera;
  /** The project's space profile (`defineSpace`): its scale, where walls stand, and the grid and camera above, which must be the profile's. Without it walls stand at cell centres and no scale is checked. */
  space?: SpaceProfile;
}
```

### `ScenePlacement`

A placed prop or decal.

```ts
interface ScenePlacement {
  piece: string;
  /** Cell of the footprint's top-left corner (the footprint as turned by `dir`). */
  col: number;
  row: number;
  /** Facing index (0 faces the camera, then clockwise on screen), for pieces with directions. */
  dir?: number;
  variant?: number;
  /** Resting state, one of the piece's `states` (default the first). */
  state?: string;
  /** Doors: the edge of cell (col, row) the door stands on, 'N' (its north edge, between vertices (col, row) and (col + 1, row)) or 'W' (its west edge, between (col, row) and (col, row + 1)). col may be `cols` for a west edge and row `rows` for a north edge, on the scene's outer border. */
  edge?: "N" | "W";
  options?: Record<string, unknown>;
}
```

### `SceneData`

A scene as data: what an editor saves and `drawScene` draws.

```ts
interface SceneData {
  /** Size in cells. */
  cols: number;
  rows: number;
  /** Floor piece id per cell, `floor[row][col]` (null = no floor). Floor variants are picked per tile by position. */
  floor: (string | null)[][];
  /** Wall or fence per cell, `walls[row][col]` (null = none): a piece id, or `{ piece, variant, options }` to choose this cell's look. Options that change the run's height where it meets a neighbour must match along the run. When the catalog's space profile puts walls on borders, the grid is one larger each way, `(rows + 1) × (cols + 1)`, and each entry is the vertex at the top-left corner of cell (col, row): walls run along cell borders. */
  walls: (SceneCell | null)[][];
  props: ScenePlacement[];
  /** Role → material name overrides for the whole scene. */
  materials?: Record<string, string>;
  /** Options per piece id for every placement of that piece in the scene. */
  options?: Record<string, Record<string, unknown>>;
  /** Scale figures: plain mannequins of the space profile's character height standing in these cells, to judge proportions in an editor or a test. Never part of the layout a game follows. */
  figures?: { col: number; row: number; }[];
}
```

### `SceneCell`

A wall or fence in a cell: its piece id, or the id with a variant and options for this cell only.

```ts
type SceneCell = string | { piece: string; variant?: number | undefined; height?: SpaceHeight | undefined; options?: Record<string, unknown> | undefined; }
```

### `SceneItem`

One frame laid in a scene: what `drawScene` draws and what a game lays out from the sheets.

```ts
interface SceneItem {
  piece: string;
  group: "wall" | "door" | "fence" | "floor" | "prop" | "decal";
  /** Floor transitions, and walls on borders: the vertex at the top-left corner of cell (col, row). Everything else: its cell (props: the footprint's top-left cell). */
  col: number;
  row: number;
  /** World position of its pivot on the floor: a cell's or footprint's centre, or a vertex. */
  at: Vec3;
  mask: number;
  variant: number;
  /** Facing index of a prop; 0 for everything else. */
  dir: number;
  /** Row in the piece's sheet: the facing of a prop, the height of a wall or fence (index in its `heights`). */
  sheetRow: number;
  /** Walls and fences: the height of the frame's top in world units. */
  height?: number;
  /** The resting state drawn, for pieces with states. */
  state?: string;
  /** Doors: the edge they stand on. */
  edge?: "N" | "W";
  /** Frame index in the piece's sheet, in its row. */
  frame: number;
  /** 'floor' items are drawn first, lowest priority first, each clipped to its tile and all to the scene; then 'decal' items, then 'object' items (walls, fences, props), each by where they stand. */
  pass: "object" | "floor" | "decal";
  options: Record<string, unknown>;
}
```

### `PieceClip`

An animation of a piece: a transition from one resting state to another (a door opening, an urn
breaking), or a loop (a flame flickering) played while the piece rests in `from`, or always.

```ts
interface PieceClip {
  frames: number;
  /** Frames per second. Default 10. */
  fps?: number;
  loop?: boolean;
  /** State it starts from (a transition) or plays in (a loop). */
  from?: string;
  /** State it ends in (a transition). */
  to?: string;
  /** Moments a game reacts to: { frame: 3, name: 'open' } (passable from there), 'break', 'spark'. */
  events?: { frame: number; name: string; }[];
}
```

### `PieceNav`

How a piece takes part in movement and play (`sceneNavigation`).

```ts
interface PieceNav {
  /** Whether it stops movement. Defaults: floors no (deep water: yes), walls, fences, doors and props yes, decals no. */
  blocks?: boolean;
  /** Floors: the cost of entering a cell (1 plain; 2 or 3 for mud or shallow water). */
  cost?: number;
  /** States in which it does not block: ['open'] for a door, ['broken'] for an urn. */
  passableIn?: string[];
  /** What a character can do with it, listed in the scene's navigation: 'door', 'chest', 'lever', 'break'… */
  interact?: string;
  /** States in which it can be used (default all): ['shut'] for a chest once opened, ['whole'] for an urn. */
  interactIn?: string[];
}
```

### `DrawSceneOptions`

Options of `drawScene` and `SceneRenderer.draw`.

```ts
interface DrawSceneOptions {
  /** Draw the scene's scale figures (default true; needs a space profile). */
  figures?: boolean;
}
```

### `SceneCanvas`

An offscreen canvas: an `OffscreenCanvas` or a DOM canvas.

```ts
interface SceneCanvas {
  width: number;
  height: number;
  getContext(type: "2d", options?: { willReadFrequently?: boolean | undefined; } | undefined): unknown;
}
```

### `SceneRenderer`

Draws scenes from a cache of frames (see `createSceneRenderer`).

```ts
interface SceneRenderer {
  /** Draws the scene like `drawScene`. Frames drawn before (same piece, mask, variant, facing, options and materials) are reused, so after an edit only new frames are drawn. The context's transform must be a scale and a translation; frames are drawn at that scale, and positions are exact at whole scales (rounded to device pixels otherwise). */
  draw(ctx: CanvasRenderingContext2D, scene: SceneData, origin: { x: number; y: number; }, o?: DrawSceneOptions | undefined): void;
  /** The cached image of one laid-out frame at the current scale, and where its pivot is inside it (device px): for a ghost under the pointer, or a thumbnail. Draws it if needed. */
  frame(item: SceneItem & { clip?: { name: string; frame: number; } | undefined; }, materials?: Record<string, string> | undefined): { image: SceneCanvas; x: number; y: number; };
  /** Forgets every frame (after the kit's code changed). */
  clear(): void;
  /** Frames in the cache. */
  size: number;
  /** Frames drawn since the renderer was made (cache misses). */
  drawn: number;
}
```

### `SceneRendererOptions`

Options of `createSceneRenderer`.

```ts
interface SceneRendererOptions {
  /** Makes an offscreen canvas of a size in device pixels. Default: a DOM canvas, else an `OffscreenCanvas`. */
  canvas?: (width: number, height: number) => SceneCanvas;
  /** Most frames kept. Default 1500. */
  limit?: number;
}
```

### `TileSetOptions`

Options of `defineTileSet`.

```ts
interface TileSetOptions {
  catalog: SceneryCatalog;
  piece: string;
  options?: Record<string, unknown>;
  /** Role → material name overrides. */
  materials?: Record<string, string>;
  scale?: number;
  /** A still sheet of this resting state (default the piece's first). */
  state?: string;
  /** An animated sheet of this clip instead: its frames across, the facings of every variant down. */
  clip?: string;
  /** Only this variant in an animated sheet (default: every variant, one block of facings each). */
  variant?: number;
}
```

### `SceneAssetOptions`

Options of `defineSceneAsset`.

```ts
interface SceneAssetOptions {
  catalog: SceneryCatalog;
  scene: SceneData;
  /** Extra logical pixels around the scene (room for walls and props above the top row). Default 2 cells. */
  margin?: number;
  scale?: number;
  /** Draw the scene's scale figures (default false: a reference image shows the scene as a game would). */
  figures?: boolean;
}
```

