# @diorama/phaser - Exports in Phaser 4

> Auto-generated public API reference. Do not edit directly; re-run `npm run docs:api`.

A Phaser 4 scene plugin (`this.diorama`, `withDiorama`) that loads sheets by the atlas contract with what they need, as textures whose frames keep their atlas names and pivots (cut into bands of whole cells past the texture limit); `DioramaCharacter`, a Sprite played by `@diorama/runtime`'s clip player; the effects its clips cue; keyboard controls from its manifest; `depthKey` as depth; nine-slices from the runtime's geometry; and a clock a test steps by hand. What needs no Phaser is also `@diorama/phaser/sheets`.

## Table of Contents

- [Classes & Constructors](#classes--constructors)
  - [`DioramaCharacter`](#dioramacharacter)
  - [`KeyboardControls`](#keyboardcontrols)
  - [`DioramaNineSlice`](#dioramanineslice)
  - [`DioramaPlugin`](#dioramaplugin)
  - [`Closure`](#closure)
- [Functions & Operations](#functions--operations)
  - [`manualClock`](#manualclock)
  - [`sleepOnStart`](#sleeponstart)
  - [`EVENTS`](#events)
  - [`addSheetTexture`](#addsheettexture)
  - [`libraryOf`](#libraryof)
  - [`loadSheets`](#loadsheets)
  - [`maxTextureSizeOf`](#maxtexturesizeof)
  - [`DEPTH`](#depth)
  - [`DIORAMA_PLUGIN`](#diorama_plugin)
  - [`withDiorama`](#withdiorama)
  - [`atlasURL`](#atlasurl)
  - [`cellsOf`](#cellsof)
  - [`closure`](#closure)
  - [`cutsOf`](#cutsof)
  - [`frameNameOf`](#framenameof)
  - [`imageURL`](#imageurl)
  - [`planTexture`](#plantexture)
- [Types & Interfaces](#types--interfaces)
  - [`CharacterOptions`](#characteroptions)
  - [`LoadOptions`](#loadoptions)
  - [`FramePlan`](#frameplan)
  - [`TexturePlan`](#textureplan)

---

## Classes & Constructors

### `DioramaCharacter`

**Constructor:**
```ts
new DioramaCharacter(scene: Scene, character: Character<SheetRef>, pos: Vec2, options: CharacterOptions): DioramaCharacter
```

**Properties:**

- `actor: Actor<SheetRef>` — The runtime's actor: where it stands (`pos`, world units), its clips, its facing.
- `steering: Input` — What it is steered by on the next step: set by its `controls`, or by the game (any length; none to stand).
- `floor: Floor` — What the ground allows of a move.
- `projection: Projection | null` — Its own projection; null for the plugin's, or its camera's.
- `order: number` — Where it is drawn among the actors on one level (`depthKey`'s order): the order the plugin added it in, which the plugin sets.
- `aim: Vec2 | null` — Where its `fly` cues head (a floor point); null to fly along the facing the action started with.
- `fired: ClipEvent<SheetRef>[]` — The events its clips fired on its last step.
- `controls: KeyboardControls | null` — The keyboard, when the plugin's `controls` gave it one: read at the start of each step. Its own: replacing it, or destroying the character, destroys it.
- `drawnWith: Projection` — Where its floor points are drawn now, and its effects' (`projection`, else the plugin's, else its camera).
- `character: Character<SheetRef>` — The character it plays: its clips, the bindings of its controls (`locomotion`, `actions`), its camera and cues.

**Instance Methods:**

- `.act(key: string): boolean`
  Starts an action (a clip key), if priority and `cancel` allow it; false when refused. Its first events come with the next step.
- `.stance(key: string | null): boolean`
  A looping clip as its base instead of idle (a defend pose, a cast loop); null back to idle. False when it has no such loop.
- `.face(heading: number): this`
  Turns it to the row nearest a heading (a world yaw).
- `.reset(): this`
  Back to idle: forgets the action, a held last frame and the stance.
- `.sync(): this`
  Shows what the runtime says: the frame by its atlas name, the feet on the floor point (whole px), the depth of an actor.

---

### `KeyboardControls`

**Constructor:**
```ts
new KeyboardControls(scene: Scene): KeyboardControls
```

**Static Factories:**

- `KeyboardControls.legend(character: DioramaCharacter): [key: string, clip: string][]`
  The action each digit plays, for a legend: `[['1', 'slash'], ['2', 'cleave'], ...]`.

**Instance Methods:**

- `.read(character: DioramaCharacter): void`
  Sets the character's steering from W, A, S, D and Shift, and plays the actions of the digits pressed since the last read.
- `.destroy(): void`
  Stops listening to the digits (the character does it when it is destroyed, or given other controls). The keys stay the scene's.

---

### `DioramaNineSlice`

**Constructor:**
```ts
new DioramaNineSlice(scene: Scene, x: number, y: number, ui: UiSheet<SheetRef>, width: number, height: number, state?: string | undefined): DioramaNineSlice
```

**Properties:**

- `ui: UiSheet<SheetRef>` — The piece: its sheet, insets, scale and states.
- `sliceWidth: number` — The size it is drawn at, in the sheet's px (a size under the insets is raised to them).
- `sliceHeight: number`
- `shown: string` — The state it shows: one of `ui.states`, a row of the sheet.

**Instance Methods:**

- `.resize(width: number, height: number): this`
  Draws it at another size (the sheet's px).
- `.showState(state: string): this`
  Shows another state of the piece (`hover`, `pressed`...).

---

### `DioramaPlugin`

**Constructor:**
```ts
new DioramaPlugin(scene: Scene, pluginManager: PluginManager, pluginKey: string): DioramaPlugin
```

**Properties:**

- `projection: Projection | null` — Where floor points are drawn (a character's own `projection` aside), its effects' with them; null for each character's own camera, the floor's origin at world (0, 0).
- `blocked: ((from: Vec2, to: Vec2, fx: Fx<SheetRef>) => Vec2 | null) | undefined` — Where the floor stops a projectile (a scene's `flightStop`); none lets it fly its whole range.
- `events: EventEmitter` — `clip`, `fxstart` and `fx` (`EVENTS`), for every character and effect of the scene.
- `add: { character: (of: string | Character<SheetRef>, pos: Vec2, options: CharacterOptions) => DioramaCharacter; nineSlice: (x: number, y: number, path: string, width: number, height: number, state?: string | undefined) => DioramaNineSlice; }` — Game objects made from the loaded sheets, added to the scene.
- `library: Library<SheetRef>` — Everything the game has loaded, as the runtime's library.
- `warnings: readonly string[]` — What could not be fetched or read, and the sheets' own warnings.
- `effects: readonly Fx<SheetRef>[]` — The effects playing now.

**Instance Methods:**

- `.boot(): void`
  This method is called when the Scene boots. It is only ever called once.  By this point the plugin properties `scene` and `systems` will have already been set.  In here you can listen for {@link Phaser.Scenes.EventsScene events} and set-up whatever you need for this plugin to run. Here are the Scene events you can listen to:  - start - ready - preupdate - update - postupdate - resize - pause - resume - sleep - wake - transitioninit - transitionstart - transitioncomplete - transitionout - shutdown - destroy  At the very least you should offer a destroy handler for when the Scene closes down, i.e:  ```javascript var eventEmitter = this.systems.events; eventEmitter.once('destroy', this.sceneDestroy, this); ```
- `.destroy(): void`
  Destroys this plugin and releases all references it holds, including the Scene, Scene Systems, and Plugin Manager. This method is called automatically when the Scene is destroyed.  If you extend this class you should override this method, clean up any resources your plugin has created, and then call `BasePlugin.destroy` via `super.destroy()` or the prototype chain.
- `.load(paths: string | string[], options?: LoadOptions | undefined): this`
  Queues sheets and every sheet they need by the contract (call it in `preload`); `assets` is where the sheet paths start.
- `.character(of: string): Character<SheetRef>`
  A loaded character by its folder (`characters/guard`), its manifest's name or its id.
- `.ui(path: string): UiSheet<SheetRef>`
  A loaded interface piece by its sheet path.
- `.controls(character: DioramaCharacter): KeyboardControls`
  Keyboard controls for a character, read at the start of each of its steps (`KeyboardControls`); the ones it had are destroyed.
- `.enlist(character: DioramaCharacter): void`
  A character joins the scene (its constructor calls it): it gets the next order. When a scene has added more characters than `depthKey`'s orders hold, the ones still there are numbered again from 0, in the order they came.
- `.dismiss(character: DioramaCharacter): void`
  A character was destroyed: the effects that follow it, or loop until its clip changes, end on the next step (an `end` event).
- `.imageOf(fx: Fx<SheetRef>): Image | undefined`
  The Image an effect is drawn with.
- `.clip(event: ClipEvent<SheetRef>, character: DioramaCharacter): void`
  A character's clip event: passed on (`clip`), and the effects it cues start where it is drawn. Characters call it on their steps.
- `.play(fx: Fx<SheetRef>, by?: DioramaCharacter | null): Image`
  Plays an effect (one of `cues`, or one of your own) from now on, drawn where `by` is drawn (its `drawnWith`): by default the character whose actor it follows or loops with, else the plugin's `projection`, else the camera of its character. It gets the next order; when a scene has started more effects than `depthKey`'s orders hold, the ones playing are numbered again from 0, in the order they started.

---

### `Closure`

The sheets wanted and the ones read so far, for a host that fetches them one by one: `want` the first ones, `read` each
JSON as it arrives, and fetch the paths it returns. The set is closed once nothing is pending: every sheet with its other
clips, the effects its character cues and their `follows`, and a scenery piece's state and clip sheets.

**Properties:**

- `sheets: Map<string, Sheet<SheetRef>>` — Read sheets, in the order they were wanted.
- `pending: Set<string>` — Wanted and not read yet.
- `failed: Map<string, string>` — Sheets that could not be fetched or read, with why.

**Instance Methods:**

- `.want(paths: Iterable<string>): string[]`
  The paths among these that are new: fetch each one and hand its JSON to `read`.
- `.read(path: string, json: unknown): string[]`
  Reads a fetched JSON (`readSheet`) and returns the sheets it needs that were not wanted yet. A file that is not an atlas fails.
- `.fail(path: string, reason: string): void`
  A sheet that could not be fetched.

---

## Functions & Operations

### `manualClock`

Steps a sleeping game by hand: `step(frames, ms)` runs that many frames of `ms` each (default one frame of 1000 / 60).

```ts
function manualClock(game: Game): (frames?: number | undefined, ms?: number | undefined) => void
```

---

### `sleepOnStart`

Put it in the game config's `callbacks.postBoot`. The loop must sleep before its first frame: a scene's `create` can run
before the loop starts (a scene without files to load is created while the game boots), so sleeping there does nothing.
postBoot runs right before the loop starts, and the microtask it queues runs after that and before the first frame.

```ts
function sleepOnStart(game: Game): void
```

---

### `EVENTS`

The events the binding emits: a character and the plugin's `events` emit `clip`, the plugin's `events` the effects' ones.

```ts
const EVENTS: { readonly CLIP: "clip"; readonly FX_START: "fxstart"; readonly FX: "fx"; }
```

---

### `addSheetTexture`

Makes a sheet's texture from its picture and plan: the picture itself, or its bands as the texture's sources, then the frames.

```ts
function addSheetTexture(textures: TextureManager, key: string, image: HTMLImageElement, plan: TexturePlan): Texture | null
```

---

### `libraryOf`

Everything a game has loaded so far, as the runtime's library: its characters, effects, interface pieces, icons and
sprites. The sheets are taken in the order of their paths, as the viewer lists them, whatever order they came in: a
character's clips are always in the same order.

```ts
function libraryOf(game: Game): Library<SheetRef>
```

---

### `loadSheets`

Queues sheets on a scene's loader, with every sheet they need by the contract: call it in `preload` (elsewhere, start the
loader and wait for its `complete` event). Sheets the game already has as textures are not fetched again. What cannot be
fetched or read is a warning (`console.warn`, and the plugin's `warnings`), never an error: the rest still loads.

```ts
function loadSheets(scene: Scene, paths: string | string[], options?: LoadOptions): void
```

---

### `maxTextureSizeOf`

The longest texture side the game's renderer takes, px.

```ts
function maxTextureSizeOf(game: Game): number
```

---

### `DEPTH`

Depths under every `depthKey`: the ground (a scene's picture) first, then the effects of `layer: 'ground'`, which keep the
order they started in. Everything that stands on the floor (actors, standing items, air effects) is sorted by `depthKey`.

```ts
const DEPTH: { readonly ground: number; readonly groundEffects: number; }
```

---

### `DIORAMA_PLUGIN`

The plugin's entry for a game config's `plugins.scene`: `this.diorama` in every scene.

```ts
const DIORAMA_PLUGIN: PluginObjectItem
```

---

### `withDiorama`

A game config with the plugin in every scene (`this.diorama`) and `pixelArt` on, so frames are never smoothed. With the
canvas renderer the plugin also turns the cameras' `roundPixels` off, which `pixelArt` forces on (see `created`).

```ts
function withDiorama(config: GameConfig): GameConfig
```

---

### `atlasURL`

Where a sheet's atlas JSON is: `<assets><path>.json`. `assets` is the URL of the assets folder, ending in `/`.

```ts
function atlasURL(assets: string, path: string): string
```

---

### `cellsOf`

The cells of an atlas by name: its `frames`, or the grid the runtime reads when it lists none (contract §6).

```ts
function cellsOf(atlas: Atlas): [string, Rect & Partial<Record<"ox" | "oy" | "cellW" | "cellH", number>>][]
```

---

### `closure`

Every sheet these need, fetched with `fetchJson` (which resolves to the JSON of a path, or rejects when it is not
there). Sheets come in the order they were wanted, breadth first; the ones that failed are in `failed`, never thrown.

```ts
function closure(paths: Iterable<string>, fetchJson: (path: string) => Promise<unknown>): Promise<Closure>
```

---

### `cutsOf`

Where to cut a length (px) so that no part is longer than `max` and no span (a cell's start and end) is cut through:
the cut points from 0 to `length`, as few as the spans allow. Throws when one span is longer than `max` by itself.

```ts
function cutsOf(length: number, max: number, spans: [start: number, end: number][], what?: string): number[]
```

---

### `frameNameOf`

The name of a cell the runtime hands back (`shownFrame(actor).rect`, an effect's `rects(row)[frame]`): the atlas's own
key for one of its `frames`, else the grid name of where it is (`<direction>_<index>`, `frame_<index>`), which the loader
gives the cells of an atlas that lists none.

```ts
function frameNameOf(atlas: Atlas, rect: Rect): string
```

---

### `imageURL`

Where a sheet's picture is: the file `meta.image` names next to its JSON (a PNG, or a JPEG export), else `<path>.png`.

```ts
function imageURL(assets: string, path: string, atlas: Atlas | null): string
```

---

### `planTexture`

How a sheet's picture (`size`, px) becomes textures no larger than `maxTextureSize` on a side, and the frames on them: every
cell by its atlas name, a packed sheet's with its trim, and each with its origin from the pivot. A picture that fits is one
band; a larger one is cut into bands of whole cells, across and down, and each frame is placed on the band that holds it.

```ts
function planTexture(sheet: Sheet<SheetRef>, size: { width: number; height: number; }, maxTextureSize?: number): TexturePlan
```

---

## Types & Interfaces

### `CharacterOptions`

How a character is put on the floor.

```ts
interface CharacterOptions {
  /** Your id for it, unique among the characters of a scene: the runtime hands it back on events (`event.actor.id`). Any number: equal depths are ordered by `order`, not by it. */
  id: number;
  /** The clip it starts in (a key of its manifest), default its idle. */
  clip?: string;
  /** Its facing: a row of its sheets, or a heading (a world yaw: 0 east, π/2 south, toward the camera). */
  row?: number;
  heading?: number;
  /** World units its body reaches from its feet, for the floor's walls. */
  radius?: number;
  /** What the ground allows of a move (a scene's `moveIn`), default `FREE_FLOOR`. */
  floor?: Floor;
  /** Where its floor points are drawn, default the plugin's `projection`, else its own camera with the floor's origin at world (0, 0). */
  projection?: Projection;
}
```

### `LoadOptions`

Where a load finds the sheets, and how large a texture may be.

```ts
interface LoadOptions {
  /** The URL of the assets folder the sheet paths start from, relative to the page or absolute. Default `assets/`. */
  assets?: string;
  /** The longest side of a texture, px. Default the renderer's: WebGL's `MAX_TEXTURE_SIZE`, no limit on canvas. */
  maxTextureSize?: number;
}
```

### `FramePlan`

A frame as the loader adds it to its texture: the band it is cut from, its place there, its untrimmed cell and its origin.

```ts
interface FramePlan {
  name: string;
  /** The band (texture source) it is on. */
  band: number;
  /** Where it is on its band, px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** A packed sheet's trimmed frame: its untrimmed cell's size and where the frame sits in it (exported px). */
  trim: { cellW: number; cellH: number; ox: number; oy: number; } | null;
  /** The pivot as a fraction of the untrimmed cell (`meta.pivot` over its size), which Phaser takes as the frame's origin. */
  pivot: { x: number; y: number; } | null;
}
```

### `TexturePlan`

A sheet's picture as textures: the bands it is cut into (rectangles of the picture, px; one band is the whole picture) and its frames.

```ts
interface TexturePlan {
  bands: Rect[];
  frames: FramePlan[];
}
```

