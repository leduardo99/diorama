# @diorama/runtime - Playing the Atlas Contract

> Auto-generated public API reference. Do not edit directly; re-run `npm run docs:api`.

Pure TypeScript with no DOM and no dependencies, shared by games and the viewer: reads exported sheets (`readSheet`, `dependenciesOf`, `buildLibrary`), plays characters in floor world units (`createActor`, `play`, `steer`, `advance`, `stance`, `socketAt`), the effects they cue (`cues`, `stepFx`), movement on a scene's navigation (`moveIn`, `findPath`, `flightStop`), one depth order (`depthKey`), floor-to-screen projections and the geometry of interface pieces.

## Table of Contents

- [Classes & Constructors](#classes--constructors)
  - [`ContractError`](#contracterror)
- [Functions & Operations](#functions--operations)
  - [`EDGE`](#edge)
  - [`CONTRACT`](#contract)
  - [`dependenciesOf`](#dependenciesof)
  - [`imageSheet`](#imagesheet)
  - [`isAnimated`](#isanimated)
  - [`manifestOf`](#manifestof)
  - [`readSheet`](#readsheet)
  - [`sheetNamed`](#sheetnamed)
  - [`DEFAULT_TILT`](#default_tilt)
  - [`buildLibrary`](#buildlibrary)
  - [`effectSheetOf`](#effectsheetof)
  - [`clipFrames`](#clipframes)
  - [`clipNames`](#clipnames)
  - [`eventsByFrame`](#eventsbyframe)
  - [`eventsOf`](#eventsof)
  - [`facingOf`](#facingof)
  - [`frameIndex`](#frameindex)
  - [`framesOf`](#framesof)
  - [`rowFor`](#rowfor)
  - [`projectionOf`](#projectionof)
  - [`toFloor`](#tofloor)
  - [`toScreen`](#toscreen)
  - [`BODY_RADIUS`](#body_radius)
  - [`FREE_FLOOR`](#free_floor)
  - [`advance`](#advance)
  - [`canStart`](#canstart)
  - [`createActor`](#createactor)
  - [`face`](#face)
  - [`frameSocket`](#framesocket)
  - [`play`](#play)
  - [`priorityOf`](#priorityof)
  - [`reset`](#reset)
  - [`shown`](#shown)
  - [`shownFrame`](#shownframe)
  - [`socketAt`](#socketat)
  - [`stance`](#stance)
  - [`steer`](#steer)
  - [`takeEvents`](#takeevents)
  - [`cues`](#cues)
  - [`cuesOn`](#cueson)
  - [`frameOfFx`](#frameoffx)
  - [`hasCues`](#hascues)
  - [`liftAt`](#liftat)
  - [`rowOfHeading`](#rowofheading)
  - [`stepFx`](#stepfx)
  - [`canStep`](#canstep)
  - [`cellAt`](#cellat)
  - [`findPath`](#findpath)
  - [`flightStop`](#flightstop)
  - [`moveIn`](#movein)
  - [`depthKey`](#depthkey)
  - [`capPlacement`](#capplacement)
  - [`fillRect`](#fillrect)
  - [`layoutText`](#layouttext)
  - [`minimumSize`](#minimumsize)
  - [`nineSlice`](#nineslice)
  - [`stretchFill`](#stretchfill)
  - [`playableClips`](#playableclips)
  - [`wieldOf`](#wieldof)
  - [`createRng`](#createrng)
- [Types & Interfaces](#types--interfaces)
  - [`Atlas`](#atlas)
  - [`AtlasData`](#atlasdata)
  - [`AtlasEvent`](#atlasevent)
  - [`AtlasFrame`](#atlasframe)
  - [`AtlasMeta`](#atlasmeta)
  - [`AtlasSockets`](#atlassockets)
  - [`ClipGrips`](#clipgrips)
  - [`ClipMotion`](#clipmotion)
  - [`GripMeasure`](#gripmeasure)
  - [`Rect`](#rect)
  - [`Vec2`](#vec2)
  - [`CharacterManifest`](#charactermanifest)
  - [`EffectCue`](#effectcue)
  - [`ManifestClip`](#manifestclip)
  - [`WieldHand`](#wieldhand)
  - [`EffectMeta`](#effectmeta)
  - [`ItemMeta`](#itemmeta)
  - [`PieceClipData`](#piececlipdata)
  - [`PieceClipSheet`](#piececlipsheet)
  - [`PieceHeight`](#pieceheight)
  - [`PieceNavData`](#piecenavdata)
  - [`PieceRow`](#piecerow)
  - [`PieceTile`](#piecetile)
  - [`Grid`](#grid)
  - [`NavCell`](#navcell)
  - [`SceneLayoutItem`](#scenelayoutitem)
  - [`SceneNavigation`](#scenenavigation)
  - [`SpaceData`](#spacedata)
  - [`FontMeta`](#fontmeta)
  - [`Insets`](#insets)
  - [`UiBox`](#uibox)
  - [`Sheet`](#sheet)
  - [`SheetKind`](#sheetkind)
  - [`SheetPath`](#sheetpath)
  - [`SheetRef`](#sheetref)
  - [`Character`](#character)
  - [`Clip`](#clip)
  - [`ClipCategory`](#clipcategory)
  - [`EffectSheet`](#effectsheet)
  - [`IconSheet`](#iconsheet)
  - [`Library`](#library)
  - [`UiSheet`](#uisheet)
  - [`Frame`](#frame)
  - [`Projection`](#projection)
  - [`Active`](#active)
  - [`Actor`](#actor)
  - [`ClipEvent`](#clipevent)
  - [`Floor`](#floor)
  - [`Input`](#input)
  - [`LastEvent`](#lastevent)
  - [`Fx`](#fx)
  - [`FxEvent`](#fxevent)
  - [`FxWorld`](#fxworld)
  - [`GlyphPlace`](#glyphplace)
  - [`SlicePart`](#slicepart)

---

## Classes & Constructors

### `ContractError`

A file that is not an atlas the runtime can read: the message names its path.

**Constructor:**
```ts
new ContractError(path: string, message: string): ContractError
```

---

## Functions & Operations

### `EDGE`

Cell edge bits of `SceneNavigation.walls`.

```ts
const EDGE: { readonly N: 1; readonly E: 2; readonly S: 4; readonly W: 8; }
```

---

### `CONTRACT`

The version of the atlas contract this runtime reads. A sheet that says a newer one (`meta.data.contract`) is read with a warning.

```ts
const CONTRACT: 1
```

---

### `dependenciesOf`

What to fetch next for a sheet to play:
- a character's other clips (the manifest's keys, siblings of the sheet) and the effects it cues (`vfx/<id>`);
- an effect's `follows` (`followsSheet`, or `vfx/<follows>`);
- a piece of scenery's state and clip sheets (siblings unless they name a path).
Paths are listed once, in that order, never the sheet itself. A scene names its pieces by id only; their sheets come with C2.

```ts
function dependenciesOf(sheet: Sheet<SheetRef>): string[]
```

---

### `imageSheet`

An image exported without an atlas: one frame, played as a sprite.

```ts
function imageSheet<A extends SheetRef = SheetRef>(ref: string | A, size: { width: number; height: number; }): Sheet<A>
```

---

### `isAnimated`

Whether a sheet plays (`strip` or `directions`): grid and compact sheets have no playback order.

```ts
function isAnimated(atlas: Atlas): boolean
```

---

### `manifestOf`

The manifest of a character sheet. A gear item names its wearer as plain text: that is not a manifest.

```ts
function manifestOf(atlas: Atlas): CharacterManifest | undefined
```

---

### `readSheet`

Reads an exported atlas JSON. Throws a `ContractError` naming the path when it is not an atlas (not an object, or no
`meta` object). Cells that are not listed by name (no `frames`, or `frames` in another shape, such as the array of
other packers) are taken from the grid of `frameWidth` × `frameHeight`, with a warning when `frames` was there.

```ts
function readSheet<A extends SheetRef = SheetRef>(ref: string | A, json: unknown): Sheet<A>
```

---

### `sheetNamed`

A sheet named by another: a path from the assets root when it has a `/`, else a sibling of the sheet that names it (as scenery pieces name their state and clip sheets).

```ts
function sheetNamed(from: string, name: string): string
```

---

### `DEFAULT_TILT`

The camera tilt (degrees) assumed when a character has no manifest.

```ts
const DEFAULT_TILT: 48
```

---

### `buildLibrary`

Puts read sheets together: characters from their clips, the effects, interface pieces, icons and sprites.

```ts
function buildLibrary<A extends SheetRef>(sheets: Iterable<Sheet<A>>): Library<A>
```

---

### `effectSheetOf`

The effect a sheet describes, or null when it is not an effect sheet.

```ts
function effectSheetOf<A extends SheetRef>(asset: A, atlas: Atlas): EffectSheet<A> | null
```

---

### `clipFrames`

The frame rectangles of one clip facing one direction, in playback order.

```ts
function clipFrames(atlas: Atlas, clip: string, directionIndex: number): Rect[]
```

---

### `clipNames`

The clips a sheet's atlas names (`meta.animations`), or 'default' for the one it is.

```ts
function clipNames(atlas: Atlas): string[]
```

---

### `eventsByFrame`

Events keyed by frame index, so the timeline and the current frame can look them up directly.

```ts
function eventsByFrame(atlas: Atlas | undefined): Map<number, string[]>
```

---

### `eventsOf`

The events a sheet declares: a clip's own, or an effect's (`meta.data.effect.events`).

```ts
function eventsOf(atlas: Atlas | undefined): AtlasEvent[]
```

---

### `facingOf`

The heading a row faces.

```ts
function facingOf(of: Atlas | readonly number[], row: number): number
```

---

### `frameIndex`

The frame a clip shows at a time: a loop wraps, anything else holds its last frame.

```ts
function frameIndex(clip: { fps: number; frameCount: number; }, time: number, loops: boolean): number
```

---

### `framesOf`

The frames of one facing row of a sheet, trim-aware: a raw sheet's frames are their whole cells.

```ts
function framesOf(sheet: { asset: { path: string; }; rects: (row: number) => Rect[]; }, row: number): Frame[]
```

---

### `rowFor`

The direction row that faces a heading. Headings are world yaws on the floor, which are screen angles (x right, y down):
row 0 (S) looks at the camera, π/2, and every next row turns clockwise (`meta.directionFacings`, or the facings themselves).

```ts
function rowFor(of: Atlas | readonly number[], heading: number): number
```

---

### `projectionOf`

The projection of a scene sheet's floor, with its picture's top-left corner at screen (0, 0): its grid, where cell
(0, 0)'s centre lies in the picture (logical px; both `meta.data`) and its export scale (`meta.scale`). Without a
scene, a character's own camera: its tilt and export scale, with the floor's origin at screen (0, 0).

```ts
function projectionOf(scene: Atlas | null, fallback: { tilt: number; scale: number; }): Projection
```

---

### `toFloor`

The floor point (world units) under a screen point (px) that lies on the floor.

```ts
function toFloor(p: Projection, screen: Vec2): Vec2
```

---

### `toScreen`

A floor point (world units) on the screen (px), drawn `lift` logical px above the floor.

```ts
function toScreen(p: Projection, floor: Vec2, lift?: number): Vec2
```

---

### `BODY_RADIUS`

World units a character's body reaches from its feet: a scene's floor stops it this far short of a wall.

```ts
const BODY_RADIUS: 9
```

---

### `FREE_FLOOR`

A floor with nothing on it: every move goes all the way.

```ts
const FREE_FLOOR: Floor
```

---

### `advance`

Moves the clocks forward: events, root motion, and the end of an action (back to the base clip, or frozen when it holds).

```ts
function advance<A extends SheetRef>(actor: Actor<A>, dt: number, floor?: Floor): ClipEvent<A>[]
```

---

### `canStart`

Whether a clip may start now. Death and hit interrupt anything (a hit cannot follow death); any other action
only replaces a lower or equal one from its `cancel` event on, or once it has ended. A held clip is final.

```ts
function canStart<A extends SheetRef>(actor: Actor<A>, clip: Clip<A>): boolean
```

---

### `createActor`

An actor of a character, starting in `clip` (default its idle) at a floor point; or a sprite, from one clip. `row` (or
`heading`, a world yaw) is its facing. `id` is the host's: the runtime keeps no count of its own, so two worlds (or two
tests) in one process never share one.

```ts
function createActor<A extends SheetRef>(of: Character<A> | Clip<A>, pos: Vec2, o: { id: number; clip?: Clip<A> | undefined; row?: number | undefined; heading?: number | undefined; radius?: number | undefined; }): Actor<...>
```

---

### `face`

Turns the actor to the row nearest a heading (a world yaw).

```ts
function face<A extends SheetRef>(actor: Actor<A>, heading: number): void
```

---

### `frameSocket`

Where a socket is in a frame of a clip, in the sheet's own px from the top-left corner of the frame's cell (contract §5
rule 8: the socket's `[x, y] × meta.scale`), and its depth (> 0: in front of the body). A host that draws the cell with
its pivot on a screen point finds the socket at that point less the pivot plus this. Null when the frame has no such socket.

```ts
function frameSocket<A extends SheetRef>(clip: Clip<A>, row: number, frame: number, name: string): { x: number; y: number; depth: number; } | null
```

---

### `play`

Starts an action (a clip, or a clip key of the actor's character) if priority and cancel let it (rules 3 and 4); false
when refused. Its `start` and the events of its first frame are fired now and handed out by the next step.

```ts
function play<A extends SheetRef>(actor: Actor<A>, key: string | Clip<A> | null | undefined): boolean
```

---

### `priorityOf`

death beats hit beats every other action; locomotion and idle are not actions at all.

```ts
function priorityOf(clip: Clip<SheetRef>): 2 | 4 | 3
```

---

### `reset`

Back to idle: forgets the action, the frozen clip, the stance, the facing of the last event and the events `play` kept.

```ts
function reset<A extends SheetRef>(actor: Actor<A>): void
```

---

### `shown`

What is being drawn for an actor right now.

```ts
function shown<A extends SheetRef>(actor: Actor<A>): { clip: Clip<A>; row: number; time: number; loops: boolean; }
```

---

### `shownFrame`

The frame an actor is showing right now, and where its feet sit inside that frame (exported px of the cell).

```ts
function shownFrame<A extends SheetRef>(actor: Actor<A>): { clip: Clip<A>; rect: Rect; frame: Frame; pivot: { x: number; y: number; logical?: { x: number; y: number; } | undefined; }; row: number; index: number; }
```

---

### `socketAt`

A socket of the frame shown now (or of `at`): the floor point under it (world units), how far above it the socket is
drawn (logical px) and its depth (> 0: in front of the body). Null when the frame has no such socket.

```ts
function socketAt<A extends SheetRef>(actor: Actor<A>, name: string, at?: { clip: Clip<A>; row: number; frame: number; } | undefined): { floor: Vec2; lift: number; depth: number; } | null
```

---

### `stance`

A looping clip (a clip, or a key of the actor's character) as the base instead of idle: a defend pose, a cast loop.
Actions, hit and death still play over it, and the actor returns to it after them; walking shows the gait and stopping
the stance again (a stance set while walking shows when the actor stops). `null` goes back to idle. False when the clip
is not there or does not loop.

```ts
function stance<A extends SheetRef>(actor: Actor<A>, key: string | Clip<A> | null): boolean
```

---

### `steer`

Moves an actor by its input at exactly the speed its gait was authored for (`groundSpeed`, rule 2), so the feet do not
slide: the first gait walks, the last one runs. Moving cancels an action once its `cancel` event has passed, never before.

```ts
function steer<A extends SheetRef>(actor: Actor<A>, input: Input, dt: number, floor?: Floor): ClipEvent<A>[]
```

---

### `takeEvents`

The events fired since the last step (by `play`), handed out once.

```ts
function takeEvents<A extends SheetRef>(actor: Actor<A>): ClipEvent<A>[]
```

---

### `cues`

The effects a clip's event cues, ready to play: `stay` where it started, `follow` its socket, `fly` along the facing the
action started with (`event.row`) at the sheet's travel speed. `aim` points a `fly` cue at a floor point instead: it
heads there and shows the row nearest that heading. Cues whose sheets are not in `effects` play nothing.

```ts
function cues<A extends SheetRef>(event: ClipEvent<A>, effects: Map<string, EffectSheet<A>>, o?: { aim?: Vec2 | undefined; }): Fx<A>[]
```

---

### `cuesOn`

The cues of a clip that play on an event.

```ts
function cuesOn(character: Character<SheetRef> | null, clipKey: string, name: string): EffectCue[]
```

---

### `frameOfFx`

The frame an effect shows at an age: a loop wraps, a one-shot holds its last until it is done.

```ts
function frameOfFx(fx: { sheet: EffectSheet<SheetRef>; age: number; }): number
```

---

### `hasCues`

Whether a character cues effects at all: a character that does keeps the generic rings out of its way.

```ts
function hasCues(character: Character<SheetRef> | null): boolean
```

---

### `liftAt`

How high an origin is above the floor under it, on the screen: the socket's position with its height dropped lands on
the actor's floor point (contract §5 rule 9), so it is the distance down to the actor's feet (in either's units).

```ts
function liftAt(actor: { y: number; }, origin: { y: number; }): number
```

---

### `rowOfHeading`

The sheet's row that faces nearest a heading (a world yaw, like the sheets' facings); the only row of a round effect.

```ts
function rowOfHeading(sheet: EffectSheet<SheetRef>, heading: number): number
```

---

### `stepFx`

Moves the effects on by `dt` seconds. A projectile flies along its heading until its range runs out or the world stops
it, and plays the effect it `follows` there; a following effect tracks its socket; a looping one ends with the action
it was cued in; a one-shot ends after its last frame. Returns the effects still playing and what they did.

```ts
function stepFx<A extends SheetRef>(effects: Fx<A>[], dt: number, world: FxWorld<A>): { fx: Fx<A>[]; events: FxEvent<A>[]; }
```

---

### `canStep`

Whether a character can step from a cell to a 4-neighbour: the target can be entered and no wall or closed door stands between.

```ts
function canStep(nav: SceneNavigation, from: NavCell, to: NavCell): boolean
```

---

### `cellAt`

The cell a point of the floor (world units, cell (0, 0) centred on the origin) stands in.

```ts
function cellAt(grid: Grid, p: Vec2): NavCell
```

---

### `findPath`

The cheapest 4-neighbour path from one cell to another (A*), both ends included, or null.

```ts
function findPath(nav: SceneNavigation, from: NavCell, to: NavCell): NavCell[] | null
```

---

### `flightStop`

Where something that flies along the floor from `from` to `to` (world units) is stopped: the last point it reaches
before a cell that cannot be entered, a wall or a shut door, or null when the way is clear. The path is followed in
steps of a fifth of a cell, and a step across a corner needs one of its two ways round to be open.

```ts
function flightStop(nav: SceneNavigation, grid: Grid, from: Vec2, to: Vec2): Vec2 | null
```

---

### `moveIn`

Moves a character standing at `p` (world units on the floor) by `delta`, with a body of `radius`,
sliding along what blocks: each axis moves on its own and stops `radius` short of an edge it cannot
cross (a wall, a closed door, a cell that cannot be entered), and the body is pushed clear of the
posts of walls on borders (piers, pillars; `postRadius`, default a fifth of a cell). Long moves are
taken in steps of at most half a cell, so nothing is tunnelled through. For free movement in the
playground and in games; grid games step with `canStep` instead.

```ts
function moveIn(nav: SceneNavigation, grid: Grid, p: Vec2, delta: Vec2, radius: number, postRadius?: number): Vec2
```

---

### `depthKey`

The depth key of something whose floor point is at `screenY` (px): larger keys are drawn later, in front.

```ts
function depthKey(screenY: number, kind: "standing" | "actor" | "fx", order?: number): number
```

---

### `capPlacement`

Where a bar's cap goes. The cap is a frame drawn the size of the bar with its bright edge at the full end of the fill box (as
at 100%); a game moves it back along `grows` by what is missing from the value, so it sits where the fill ends, and clips it
to the fill box so nothing of it shows outside. Offsets are in logical px; `clip` is the fill box.

```ts
function capPlacement(box: UiBox, value: number, grows: "right" | "left" | "up" | "down"): { dx: number; dy: number; clip: UiBox; }
```

---

### `fillRect`

The part of a bar's fill box a value fills (0 to 1), growing the way the bar grows.

```ts
function fillRect(box: UiBox, value: number, grows: "right" | "left" | "up" | "down"): UiBox
```

---

### `layoutText`

Sets text with a bitmap font the way a game does: each glyph's cell at the pen, the pen moving by that glyph's advance
(a narrow "1" takes less room) and the font's spacing; a newline goes down a line height. A character the font does not
have leaves a gap as wide as a space (or half a cell). Sizes are in logical px.

```ts
function layoutText(font: FontMeta, text: string): { glyphs: GlyphPlace[]; width: number; height: number; }
```

---

### `minimumSize`

The smallest size (logical px) a nine-slice can be drawn at: the borders that never stretch, and one pixel of middle.

```ts
function minimumSize(insets: Insets): { width: number; height: number; }
```

---

### `nineSlice`

The parts of a nine-slice drawn at a size: the corners keep their size, the edges stretch along their length and the middle
both ways. `src` is the frame on the sheet (px), the insets are logical px (× `scale` to sheet px), and `width`, `height`
are the size to draw at, in the same px as the sheet. A size under the insets is raised to them. Parts with no area are left out.

```ts
function nineSlice(src: Rect, insets: Insets, scale: number, width: number, height: number): SlicePart[]
```

---

### `stretchFill`

A bar made longer (or taller) than its sheet: its fill box grows by the same amount, so the fill still reaches the end of the frame.

```ts
function stretchFill(box: UiBox, extraW: number, extraH: number): UiBox
```

---

### `playableClips`

The clips a character can play: the manifest marks `usable: false` the ones made for something it does not hold, and
they are never played even when their sheets are there. When that leaves none, every clip is kept.

```ts
function playableClips<C extends { key: string; }>(clips: C[], manifest: CharacterManifest | null | undefined): C[]
```

---

### `wieldOf`

What a character holds in its main (right) and off (left) hand, when it was defined with an outfit.

```ts
function wieldOf(character: { manifest: CharacterManifest | null; }): { main?: WieldHand | undefined; off?: WieldHand | undefined; }
```

---

### `createRng`

Draws in [0, 1), one per call, from a seed.

```ts
function createRng(seed: number): () => number
```

---

## Types & Interfaces

### `Atlas`

An exported atlas JSON.

```ts
interface Atlas {
  meta: AtlasMeta;
  frames: Record<string, AtlasFrame>;
}
```

### `AtlasData`

`meta.data`: what the engine says a sheet is. Each role fills its own fields.

```ts
interface AtlasData {
  /** Written by the engine for characters; assets exported before that are classified by fallback rules (contract §6). */
  role?: string;
  /** The contract version the sheet was written for (`CONTRACT`). */
  contract?: number;
  clipKind?: "locomotion" | "idle" | "action";
  /** The clip's kind: idle, walk, run, attack, skill, hit, death... (docs/guides/rig/04-atlas-contract.md). */
  action?: string;
  key?: string;
  tags?: string[];
  hold?: boolean;
  /** Root motion: forward world units from the start at each frame, then at the end (frames + 1 values). */
  travel?: number[];
  /** What `travel` is in, in words. */
  travelUnits?: string;
  /** The export's own check of a character clip (bone drift, foot slide, loop gap, warnings): not needed to play it. */
  motion?: ClipMotion;
  /** The export's check of how a character's hands hold what it holds, for a character holding an item that says how it is held: not needed to play it. */
  grips?: ClipGrips;
  sockets?: AtlasSockets;
  /** The character's manifest on a character sheet; on a gear item only the id of the character it is worn by. */
  character?: string | CharacterManifest;
  /** A gear item (`role: 'gear'`): the catalog part it shows, its equipment slot (`equip`, when it has one), slot and side. */
  part?: string;
  equip?: string;
  /** What a gear item, a prop or a piece of scenery is called and the group it belongs to ('head', 'door', 'wall'...). */
  label?: string;
  group?: string;
  slot?: string;
  side?: number;
  skeleton?: string;
  /** A character clip's name; on a piece's clip sheet, the clip it plays (frames, fps, loop, from, to, events). */
  clip?: string | PieceClipSheet;
  loop?: boolean;
  seconds?: number;
  groundSpeed?: number;
  groundSpeedUnits?: string;
  events?: AtlasEvent[];
  /** Visual effects (`role: 'vfx'`), with the camera they were drawn for. */
  effect?: EffectMeta;
  camera?: { tilt: number; heightBoost?: number | undefined; };
  /** Item icons (`role: 'icon'`). */
  item?: ItemMeta;
  /** Interface pieces (`role: 'ui'`): what it is for, and what a game needs to stretch or fill it. */
  kind?: string;
  nineSlice?: Insets;
  /** Interface pieces: one row per state (nine-slices, images). Scenery pieces: the states it rests in. */
  states?: string[];
  fillBox?: UiBox;
  grows?: "right" | "left" | "up" | "down";
  /** Bars: the layers, one frame each, in sheet order ('back', 'fill', 'frame', then the optional 'cap'). */
  layers?: string[];
  /** Bars: the cap, a frame drawn with the bright edge at the full end of `fillBox`, within `width` logical px of it. */
  cap?: { width: number; };
  /** Slots: the margin round the well (logical px), so a slot for an icon is the icon plus these. */
  content?: Insets;
  measure?: string;
  font?: FontMeta;
  /** Portrait frames: the window (logical px) a portrait shows through. */
  window?: UiBox;
  /** Cursors: the point that clicks (logical px from the cell's top-left; `meta.pivot` marks it too). */
  hotspot?: Vec2;
  /** Scenery pieces: the piece, the sheet of each resting state and the clips between them (guide 05 of volume). */
  piece?: string;
  /** The state this sheet shows, one of `states`. */
  state?: string;
  stateSheets?: Record<string, string>;
  clips?: Record<string, PieceClipData>;
  nav?: PieceNavData;
  footprint?: [number, number];
  /** 0 on the ground (floors, decals), 1 standing. */
  layer?: number;
  /** One per frame: the neighbour mask and the variant it is drawn for. */
  tiles?: PieceTile[];
  /** How many looks it comes in, and their names. */
  variants?: number;
  variantLabels?: string[];
  /** Its nominal height, world units and screen px; a wall or fence in several heights has one row per height. */
  height?: { world: number; screen: number; };
  heights?: PieceHeight[];
  connect?: string;
  maskBits?: Record<string, number>;
  joins?: string[];
  priority?: number;
  /** The space profile the scenery, scene or effect was drawn in (`@core/volume` `spaceData`). */
  space?: SpaceData;
  /** Scenes (`role: 'scene'`): the grid, where cell (0, 0)'s centre is in the picture (logical px), the layout and the navigation. */
  cols?: number;
  /** A scene's rows; on a piece's sheet, what its rows are ('heights', or the facing and variant of each row of a clip sheet). */
  rows?: number | "heights" | PieceRow[];
  grid?: Grid;
  origin?: Vec2;
  walls?: string;
  layout?: SceneLayoutItem[];
  navigation?: SceneNavigation;
}
```

### `AtlasEvent`

A named moment of a clip, on a frame (0-based): `hit`, `cast`, `release`, `cancel`, `land`, `step:<leg>`, `spawn:<socket>`.

```ts
interface AtlasEvent {
  frame: number;
  name: string;
}
```

### `AtlasFrame`

A cell of the sheet's picture, in exported px. A packed sheet (trimmed frames) adds where the cell was cut from.

```ts
interface AtlasFrame {
  /** The same cell in logical px (exported px over `meta.scale`). */
  logical?: Rect;
  direction?: string;
  frame?: number;
  /** Packed sheets: the trimmed frame's offset inside its untrimmed cell, and the cell's size (exported px). */
  ox?: number;
  oy?: number;
  cellW?: number;
  cellH?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
```

### `AtlasMeta`

The layout of a sheet: its mode, frames, facings (rows) and their yaws, pivot, fps and export scale, and `data`.

```ts
interface AtlasMeta {
  project?: string;
  mode?: string;
  frameCount?: number;
  directions?: string[];
  directionFacings?: number[];
  directionOrder?: string;
  pivot?: { x: number; y: number; logical?: { x: number; y: number; } | undefined; };
  data?: AtlasData;
  frameWidth?: number;
  frameHeight?: number;
  fps?: number;
  width?: number;
  height?: number;
  scale?: number;
  format?: string;
  image?: string;
  animations?: Record<string, number[]>;
}
```

### `AtlasSockets`

Points on the body where effects appear. x, y are logical px from the cell's top-left; d > 0 is in front of the body.

```ts
interface AtlasSockets {
  names: string[];
  frames: Record<string, [x: number, y: number, d: number][]>;
}
```

### `ClipGrips`

What the export measured on how a character's hands hold what it holds (`@core/rig` `checkGrips`): ratios of the hand, the arm and a palm.

```ts
interface ClipGrips {
  gripGap: GripMeasure | null;
  openHandHolding: GripMeasure | null;
  wristLimit: GripMeasure | null;
  reachStretch: GripMeasure | null;
  gripDrift: GripMeasure | null;
  handleTooShort: GripMeasure | null;
  errors: string[];
  warnings: string[];
  notes: string[];
}
```

### `ClipMotion`

What the export measured on a character clip (`@core/rig` `checkClip`), in world units.

```ts
interface ClipMotion {
  boneDrift: number;
  footSlide: number | null;
  lowestFoot: number;
  lowestJoint: number;
  loopGap: number;
  warnings: string[];
}
```

### `GripMeasure`

One grip check's worst value over a sheet's facings and frames (`@core/rig` `GripMeasure`).

```ts
interface GripMeasure {
  worst: number;
  /** The frame it is in, `<DIR>_<n>` as in `sockets`. */
  frame: string;
  hand: "right" | "left";
  /** Frames past the check's limit, of those measured. */
  failing: number;
  of: number;
}
```

### `Rect`

A rectangle in px.

```ts
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

### `Vec2`

A point: on the floor in world units, or on the screen in px, as each use says.

```ts
interface Vec2 {
  x: number;
  y: number;
}
```

### `CharacterManifest`

Every sheet of a character repeats this: reading any one of them describes them all.

```ts
interface CharacterManifest {
  /** The character's id ('ossuary-guard'). */
  name: string;
  /** The name to show ('Ossuary Guard'). Older atlases have none: show `name`. */
  label?: string;
  skeleton?: string;
  /** The cell's logical size and the pivot in it. */
  cell?: { width: number; height: number; };
  pivot?: { x: number; y: number; };
  scale: number;
  directions: string[];
  /** The camera the sheets were rendered with: `tilt` in degrees above the ground plane. */
  camera?: { tilt: number; heightBoost?: number | undefined; };
  sockets: string[];
  clips: ManifestClip[];
  controls: { idle?: string | undefined; move: string[]; actions: Partial<Record<string, string[]>>; };
  /** Effects to play on clip events, by clip key. */
  effects?: Record<string, EffectCue[]>;
  /** What the outfit holds in each hand (`wield`), when the character was made from one. */
  wield?: { main?: WieldHand | undefined; off?: WieldHand | undefined; };
  warnings?: string[];
}
```

### `EffectCue`

An effect a character plays on an event of one of its clips (docs/guides/rig/04-atlas-contract.md §4).

```ts
interface EffectCue {
  /** The clip event ('release', 'hit', 'cast', 'land', 'step:left'), or 'start' / 'end' of the clip. */
  on: string;
  /** The effect's id: its sheet is `vfx/<id>`. */
  effect: string;
  /** The socket it starts at; default the socket of a `spawn:<socket>` event on the same frame, else 'center'; 'feet' is the pivot on the floor. */
  at?: string;
  motion?: "fly" | "follow" | "stay";
}
```

### `ManifestClip`

One clip of the manifest: its key (the sheet's file name), kind, timing, ground speed, events and root motion.

```ts
interface ManifestClip {
  key: string;
  name?: string;
  kind: string;
  category: string;
  tags: string[];
  loop: boolean;
  hold: boolean;
  seconds: number;
  frames: number;
  fps: number;
  groundSpeed: number;
  events: AtlasEvent[];
  travel?: number[];
  /** The classes of held parts, by hand, the clip is made for (`core/rig` `ClipWields`); none suits anything. */
  wields?: { main?: string[] | undefined; off?: string[] | undefined; };
  /** False when the clip is made for something the character does not hold: it is left out of `controls` and must not be played. */
  usable?: boolean;
}
```

### `WieldHand`

A part held in one hand: the gear part, its class ('blade', 'staff') and how many hands it takes.

```ts
interface WieldHand {
  part: string;
  class: string;
  hands: 2 | 1;
}
```

### `EffectMeta`

Frames across, facings down, pivoted on the effect's origin.

```ts
interface EffectMeta {
  id: string;
  label?: string;
  /** projectile, impact, cast, aura, area, burst or trail. */
  kind: string;
  frames: number;
  fps: number;
  loop: boolean;
  /** 'ground' under every standing thing, 'air' sorted with them. */
  layer: "ground" | "air";
  /** Height of the origin above the floor, world units. */
  height: number;
  /** Radius it reaches, world units. */
  size: number;
  directions: number;
  events?: AtlasEvent[];
  /** Projectiles: world units per second and how far (world units) before they end. */
  travel?: { speed: number; range?: number | undefined; };
  /** The effect played where this one ends. */
  follows?: string;
  followsSheet?: string;
}
```

### `ItemMeta`

What an item icon's sheet says about the item (`meta.data.item`, role 'icon').

```ts
interface ItemMeta {
  id: string;
  label: string;
  kind: string;
  rarity: string;
  rarityLabel?: string;
  rarityColor?: string;
  stack?: number;
  description?: string;
  /** The gear part the item equips: the part's id in the gear catalog. */
  gear?: string;
  /** That part's equipment slot, when the gear catalog gives the part one. */
  equip?: string;
}
```

### `PieceClipData`

A clip of a piece: a transition from one state to another (a door opening), or a loop (a flame).

```ts
interface PieceClipData {
  frames: number;
  fps?: number;
  loop?: boolean;
  from?: string;
  to?: string;
  events?: AtlasEvent[];
  /** Its sheet: a sibling of the piece's sheet (`crypt-door--opening`), or a path from the assets root when it has a `/`. */
  sheet?: string;
}
```

### `PieceClipSheet`

The clip a piece's clip sheet plays (`meta.data.clip` of `<piece>--<clip>`).

```ts
interface PieceClipSheet {
  name: string;
  frames: number;
  fps: number;
  loop: boolean;
  from?: string;
  to?: string;
  events: AtlasEvent[];
}
```

### `PieceHeight`

A row of a wall or fence that comes in several heights: its height's name, in world units and screen px.

```ts
interface PieceHeight {
  row: number;
  name?: string | number;
  world: number;
  screen: number;
}
```

### `PieceNavData`

How a piece counts for navigation (`nav` of its catalog entry).

```ts
interface PieceNavData {
  blocks?: boolean;
  cost?: number;
  passableIn?: string[];
  interact?: string;
  interactIn?: string[];
}
```

### `PieceRow`

A row of a piece's clip sheet: the facing and the variant it shows.

```ts
interface PieceRow {
  row: number;
  dir: number;
  variant: number;
}
```

### `PieceTile`

A frame of a piece's sheet: the neighbour mask and the variant it is drawn for.

```ts
interface PieceTile {
  frame: number;
  mask: number;
  variant: number;
}
```

### `Grid`

The scene's grid: a cell's size on the screen (logical px) and on the floor (world units).

```ts
interface Grid {
  screen: { w: number; h: number; };
  cell: { x: number; y: number; };
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

### `SceneLayoutItem`

A thing of the scene's picture, in drawing order: its piece, the frame of its sheet, and where its pivot is (logical px).

```ts
interface SceneLayoutItem {
  piece: string;
  frame: number;
  row: number;
  dir: number;
  mask: number;
  variant: number;
  /** 'floor' and 'decal' are the ground; 'object' stands and is sorted with the characters. */
  pass: string;
  x: number;
  y: number;
  state?: string;
  edge?: "N" | "W";
  options?: Record<string, unknown>;
}
```

### `SceneNavigation`

Where characters can go in a scene (`meta.data.navigation`).

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
  /** Things to use: chests, levers, breakables, doors. `cells` are the cells a character uses them from. */
  interactables: { index: number; piece: string; kind: string; col: number; row: number; state?: string | undefined; cells: NavCell[]; }[];
  /** Walls on borders: the vertices where a blocking wall stands, `posts[row][col]` for the vertex at the top-left corner of cell (col, row), (rows + 1) × (cols + 1): piers and lone pillars a body cannot walk through even where no edge is closed. */
  posts: boolean[][];
}
```

### `SpaceData`

The project's space profile as its sheets repeat it (`meta.data.space` of scenery, scenes and effects): the projection,
the sizes in world units, and the cell and sizes on the screen (logical px).

```ts
interface SpaceData {
  projection: string;
  preset?: string;
  /** Where walls stand: 'center' of their cells or on the 'border' between them. */
  walls?: string;
  /** World units: a standing character's height, a cell's width, a wall's, a doorway's and a fence's height. */
  scale: { character: number; cell: number; wall: number; door: number; fence: number; };
  /** The same on the screen (logical px), and a cell's size there. */
  screen: { cell: { w: number; h: number; }; character: number; wall: number; door: number; fence: number; };
}
```

### `FontMeta`

A bitmap font (`meta.data.font`, ui kind 'font'): one glyph per frame, in `chars` order.

```ts
interface FontMeta {
  chars: string;
  cell: { w: number; h: number; };
  baseline: number;
  lineHeight: number;
  spacing: number;
  advances: Record<string, number>;
}
```

### `Insets`

What interface sheets say about themselves (`role: 'ui'`, core/ui.ts): insets, fill boxes and bitmap fonts.

```ts
interface Insets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
```

### `UiBox`

A box in logical pixels.

```ts
interface UiBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
```

### `Sheet`

A sheet as read: the host's handle on it, its atlas and what it is.

```ts
interface Sheet<A extends SheetRef = SheetRef> {
  asset: A;
  /** Null for an image exported without an atlas. */
  atlas: Atlas | null;
  kind: SheetKind;
  /** The picture's size in exported px. */
  size: { width: number; height: number; };
  /** What could be read only in part (a newer contract than this runtime's). */
  warnings: string[];
}
```

### `SheetKind`

What a sheet is to a player:
- `character`: a clip of a character (a manifest, a skeleton or `role: 'character'`);
- `effect`: a visual effect (`role: 'vfx'`), played on cues;
- `ui` and `icon`: interface pieces and item icons, which are not placed on a scene;
- `sprite`: anything else that plays as it is (a prop, a piece of scenery, a scene's picture, an image without an atlas);
- `grid`: a grid or compact sheet, which has no playback order.

```ts
type SheetKind = "character" | "effect" | "ui" | "icon" | "sprite" | "grid"
```

### `SheetPath`

A sheet's place in the assets, from the assets root and without extension: 'characters/guard/idle'.

```ts
type SheetPath = string
```

### `SheetRef`

What the host knows a sheet by: its path, and where its image is when it loads it from a url. Hosts may add their own fields.

```ts
interface SheetRef {
  path: string;
  url?: string;
}
```

### `Character`

A character: its clips and the bindings of its controls, its camera and the effects it cues.

```ts
interface Character<A extends SheetRef = SheetRef> {
  id: string;
  /** The manifest's `name`, the character's id ('ossuary-guard'); without a manifest, the folder's last segment. */
  name: string;
  /** The name people read: the manifest's `label` ('Ossuary Guard'), else `name` (atlases exported before labels). */
  label: string;
  folder: string;
  clips: Clip<A>[];
  idle: Clip<A> | null;
  /** Slowest first: the first one walks, the last one runs. */
  locomotion: Clip<A>[];
  /** Bound to 1, 2, 3...: attack, skill, dodge and the like, in that order. Hit and death have their own keys. */
  actions: Clip<A>[];
  hit: Clip<A> | null;
  death: Clip<A> | null;
  /** Problems the engine found when the character was defined. Shown, never blocking. */
  warnings: string[];
  /** Camera tilt in degrees: ground distances along the view shrink by its sine on screen. */
  tilt: number;
  /** The camera's height boost: how much a height above the floor lifts something on the screen. */
  boost: number;
  /** Exported px per world unit of its sheets. */
  scale: number;
  /** The effects it plays on the events of its clips, by clip key (`meta.data.character.effects`). */
  effects: Record<string, EffectCue[]>;
  /** The manifest, when its sheets have one. */
  manifest: CharacterManifest | null;
}
```

### `Clip`

A playable clip: one sheet, its frames by facing row, and what the contract says about it.

```ts
interface Clip<A extends SheetRef = SheetRef> {
  /** The sheet it plays, as the host gave it to `readSheet`. */
  asset: A;
  atlas: Atlas;
  /** The file name without extension: the key the manifest refers to. */
  key: string;
  name: string;
  /** idle, walk, run, attack, skill, hit, death, dodge... */
  kind: string;
  category: ClipCategory;
  tags: string[];
  fps: number;
  frameCount: number;
  loop: boolean;
  /** Plays once and stays on its last frame until the character is reset. */
  hold: boolean;
  /** World units per second the character moves while it plays, so the feet stay planted (locomotion). */
  groundSpeed: number;
  events: AtlasEvent[];
  /** The action may be interrupted from this frame on. */
  cancelFrame: number | null;
  /** Root motion in world units: distance ahead at each frame boundary (frames + 1 values). */
  travel: number[] | null;
  /** Exported px per world unit (`meta.scale`). */
  scale: number;
  /** The frames of this clip when facing one direction row, cached. */
  rects: (row: number) => Rect[];
}
```

### `ClipCategory`

What a clip does: stands, moves, or acts.

```ts
type ClipCategory = "locomotion" | "idle" | "action"
```

### `EffectSheet`

An effect's sheet, read from its atlas.

```ts
interface EffectSheet<A extends SheetRef = SheetRef> {
  id: string;
  asset: A;
  atlas: Atlas;
  kind: string;
  frames: number;
  fps: number;
  loop: boolean;
  layer: "ground" | "air";
  /** World units: where the effect draws its own floor marks (a projectile's pool of light is this far below its origin). It does not place the effect: the origin goes on the socket. */
  height: number;
  /** Radius it reaches, world units. */
  size: number;
  events: AtlasEvent[];
  travel: { speed: number; range: number | undefined; } | null;
  /** The effect played where this one ends. */
  follows: string | null;
  /** Exported px per world unit. */
  scale: number;
  /** The effect's origin inside a frame, exported px. */
  pivot: { x: number; y: number; };
  /** How many rows (facings) the sheet has. */
  rows: number;
  /** The frames of one row. */
  rects: (row: number) => Rect[];
}
```

### `IconSheet`

An item's icon (`role: 'icon'`).

```ts
interface IconSheet<A extends SheetRef = SheetRef> {
  asset: A;
  atlas: Atlas;
  item: ItemMeta;
}
```

### `Library`

Everything a set of sheets holds, put together by `buildLibrary`.

```ts
interface Library<A extends SheetRef = SheetRef> {
  /** In folder order. Older atlases can make two characters of one folder and skeleton (split by pivot): they share an id. */
  characters: Character<A>[];
  /** By effect id: the sheets characters cue on their events. */
  effects: Map<string, EffectSheet<A>>;
  ui: Map<string, UiSheet<A>>;
  /** By item id. */
  icons: Map<string, IconSheet<A>>;
  /** Everything else that plays as it is: props, scenery, pictures, images without an atlas. */
  sprites: Clip<A>[];
}
```

### `UiSheet`

An interface piece (`role: 'ui'`): its kind and what a game needs to stretch, fill or set it (geometry in `ui.ts`).

```ts
interface UiSheet<A extends SheetRef = SheetRef> {
  asset: A;
  atlas: Atlas;
  kind: string;
  /** Exported px per logical px. */
  scale: number;
  states: string[];
  nineSlice: Insets | null;
  fillBox: UiBox | null;
  grows: "right" | "left" | "up" | "down";
  layers: string[];
  cap: { width: number; } | null;
  content: Insets | null;
  font: FontMeta | null;
  /** A portrait frame's window (logical px): where a game puts the portrait. */
  window: UiBox | null;
  /** A cursor's hotspot (logical px from the cell's top-left): the point that clicks. */
  hotspot: Vec2 | null;
}
```

### `Frame`

A cell to draw: where it is on its sheet (exported px) and, for a packed sheet whose frames are trimmed, where the
trimmed frame sits in its untrimmed cell (`ox`, `oy`) and the cell's size. The pivot is in the untrimmed cell.

```ts
interface Frame {
  sheet: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  cellW: number;
  cellH: number;
}
```

### `Projection`

How the floor (world units) is drawn on a screen (px).

```ts
interface Projection {
  /** Screen px per logical px: the sheets' export scale when they are drawn at their own size. */
  scale: number;
  /** Logical px of one world unit across the screen and in depth: `grid.screen.w / grid.cell.x` (1) and `sin(tilt)`. */
  kx: number;
  ky: number;
  /** Where the floor's origin is on the screen, px. */
  origin: Vec2;
}
```

### `Active`

An action in progress. It remembers the facing it started with: root motion follows that, not the input.

```ts
interface Active<A extends SheetRef = SheetRef> {
  clip: Clip<A>;
  time: number;
  row: number;
  /** Root motion already applied, in world units along the facing. */
  travelled: number;
  /** The last frame whose events were fired. */
  fired: number;
}
```

### `Actor`

One thing standing on the floor: a character, or a sprite (a single clip and no character).

```ts
interface Actor<A extends SheetRef = SheetRef> {
  /** The host's own id for it (unique among the actors it plays together): the runtime only hands it back on events. */
  id: number;
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
```

### `ClipEvent`

An event a clip fired: which, on which frame and facing, with the other events of that frame.

```ts
interface ClipEvent<A extends SheetRef = SheetRef> {
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
```

### `Floor`

What the ground allows of a move: where a body of `radius` at `from` ends up when it moves by `delta` (world units).

```ts
interface Floor {
  /** `clip` is the clip that moves it (a gait, an action's root motion): a host may keep its sprite inside a view, or move it at that sheet's own scale. */
  move(from: Vec2, delta: Vec2, radius: number, clip: Clip<SheetRef>): Vec2;
}
```

### `Input`

What the player holds: a direction (any length; none to stand) and the run modifier.

```ts
interface Input {
  dx: number;
  dy: number;
  run: boolean;
}
```

### `LastEvent`

The last event an actor's clips fired, for a HUD.

```ts
interface LastEvent {
  name: string;
  clip: string;
  frame: number;
}
```

### `Fx`

A playing effect.

```ts
interface Fx<A extends SheetRef = SheetRef> {
  sheet: EffectSheet<A>;
  /** The point on the floor under its origin (world units): where it is sorted among what stands, and what the floor stops. */
  pos: Vec2;
  /** Logical px its origin is drawn above that point: the height of the socket it left from (the actor's floor point less the socket's y on the screen), never the effect's own `height`. */
  lift: number;
  /** The sheet's row it shows. */
  row: number;
  /** Seconds since it began. */
  age: number;
  motion: "fly" | "follow" | "stay";
  /** `follow`: the actor whose socket it tracks. */
  follow?: { actor: Actor<A>; socket: string; };
  /** A looping effect ends with the action it was cued in (or when the actor changes its base clip). */
  until?: { actor: Actor<A>; act: Active<A> | null; clip: Clip<A>; };
  /** `fly`: velocity on the floor in world units per second, world units flown and the range they end at. */
  fly?: { vx: number; vy: number; flown: number; speed: number; range: number; };
  /** The character that cued it: its camera sets how a depth distance reads on the screen. */
  character: Character<A> | null;
  /** The projectile it plays where that one ended (an impact); null for a cued effect. */
  from: Fx<A> | null;
  /** The last frame whose events were fired. */
  fired: number;
  done: boolean;
}
```

### `FxEvent`

Something an effect did: one of its sheet's events (`hit` on an impact's frame), `end`, or a projectile's `hit` where it ended.

```ts
interface FxEvent<A extends SheetRef = SheetRef> {
  fx: Fx<A>;
  name: string;
  frame: number;
  /** Where on the floor it happened. */
  pos: Vec2;
}
```

### `FxWorld`

Everything a step needs to know about the world around the effects.

```ts
interface FxWorld<A extends SheetRef = SheetRef> {
  /** The effect sheets by id: what a projectile plays where it ends (`follows`). */
  effects: Map<string, EffectSheet<A>>;
  /** Where the floor stops a projectile flying from one floor point to another: the last point it reaches before a cell that cannot be entered, a wall or a shut door (`flightStop`), or null when the way is clear. */
  blocked?: (from: Vec2, to: Vec2, fx: Fx<A>) => Vec2 | null;
}
```

### `GlyphPlace`

A glyph set on a line: the character, its frame on the font sheet, and where its cell goes (logical px from the text's top-left).

```ts
interface GlyphPlace {
  char: string;
  /** The frame of the glyph: its place in `chars`. */
  index: number;
  x: number;
  y: number;
}
```

### `SlicePart`

A part of a nine-slice: where it comes from on the sheet and where it goes (both in pixels).

```ts
interface SlicePart {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}
```

