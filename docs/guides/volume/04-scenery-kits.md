# Scenery kits (`@core/volume`)

**Purpose.** Build a level's scenery once, as a kit of pieces on the project's grid, and lay it out like a tile map:
- floors with transitions between them;
- walls and fences that connect to their neighbours;
- props and decals.

The engine gives the mechanics: a pixel-exact grid, connection masks, the piece contract, the floor tile contract, scenes as data, the layout a game follows and the exported sheets. The pieces are the project's art.

**API reference:** [`docs/api/volume.md`](../../api/volume.md):
- space: `defineSpace`, `SPACE_PRESETS`, `SpaceProfile`, `screenHeight`, `scaleFigure`;
- grid and masks: `Grid`, `edgeMask`, `cornerMask`, `cornerMaskShape`;
- pieces: `ScenePiece`, `PieceContext`, `floorTile`, `FloorTile`, `FLOOR_EDGE`, `floorGlow`, `groundShadow`;
- catalog and scenes: `ScenePieceInfo`, `SceneryCatalog`, `validateCatalog`, `SceneData`, `validateScene`, `footprintOf`;
- drawing and export: `layoutScene`, `drawScene`, `createSceneRenderer`, `defineTileSet`, `defineSceneAsset`, `seamTestScene`.

**A kit's files.** `src/scenery/` holds one file per family of pieces (`floors.ts`, `walls.ts`, `fences.ts`, `props.ts`, `decals.ts`, as many as the project has), `catalog.ts` (what editors and the generator read) and `index.ts` (what other code imports). `npm run new-kit -- <project> scenery` writes `props.ts` with a first piece, `catalog.ts` and `index.ts` (§5). Scenes, the sets built from the kit, are `src/scenes/<name>.ts`, and their sheets `sheets/scenes/<name>.ts`.

---

## 1. The space profile

A project declares its game space once, in `src/space.ts`, and everything reads it:

```ts
import { Camera, defineSpace } from '@core/volume';

const CAMERA = new Camera({ tilt: 48, heightBoost: 1.2 }); // in a project: the theme's CAMERA
export const SPACE = defineSpace({ camera: CAMERA, preset: 'tactics', character: 64 });
```

- **`character`** is the height of a standing adult character in world units: what the project's skins are built at. Every other size is measured against it.
- **`preset`** starts from proportions (`SPACE_PRESETS`): how big a cell is against the character, how tall walls, doors and fences are, and whether walls stand on cell borders or through cell centres. The five ids are shorthand for common sets of those numbers; none of them limits the kind of game, and when none fits you start from the closest and override what differs:

| Preset | Character on the grid | Walls | Placement |
| :--- | :--- | :--- | :--- |
| `jrpg` | about 2 cells tall, 1 wide | 1.25 × the character | borders |
| `action-rpg` | about 1.5 cells tall | about the character's height | borders |
| `tactics` | one unit per cell, a cell as wide as a character is tall | 0.9 × | centres |
| `farm-sim` | about 2 cells tall on a dense grid | 1.6 × (buildings) | borders |
| `dungeon-crawler` | a little taller than a cell | 1.1 × | centres |

- **Overrides:** any size (`scale: { wall, door, fence, cell }`) and the wall placement (`walls: 'center' | 'border'`) can be changed; change proportions here, never piece by piece. A project with no walls and no grid (props and characters only) needs no space profile.
- **What it gives:** `SPACE.grid` (cells a whole, even number of pixels on screen), `SPACE.camera`, `SPACE.walls` and `SPACE.scale` (character, cell, wall, door, fence in world units). `screenHeight(camera, h)` turns a height into pixels on screen.
- **New projects:** `npm run new-project -- <name> --genre <preset> [--character <height>]` writes `src/space.ts`. For an existing project, write the file by hand.
- **The catalog** takes the profile's grid and camera and the profile itself: `{ grid: SPACE.grid, camera: SPACE.camera, space: SPACE, ... }`. `validateCatalog` refuses a catalog whose grid or camera is not the profile's.
- **Scale figures:** a scene's `figures` (cells) draw a plain mannequin of the profile's character height in the editor and in `scenery-test`, to judge proportions; games never draw them.
- **Projections:** the engine draws a tilted top-down view (3/4) on a rectangular grid. Isometric, side view, hex grids and height levels are on the roadmap; they will be chosen in the profile.

**The grid.** The camera tilts the floor, so a square world cell would project to a fractional height and leave seams. `Grid.fromScreen(CAMERA, w, h)` (what `defineSpace` uses) instead derives the world depth (h ÷ sin tilt) from the screen size. Export at a whole scale (2) and every tile is exact pixels. `grid.center(col, row)` is a cell's centre on the floor and `grid.vertex(col, row)` the corner between four cells. Rows grow towards the camera, down the screen. Write the profile's sizes in `STYLE.md`.

## 2. How a scene is built, and why it matters for a piece

`layoutScene(scene, catalog)` turns a scene into a list of frames in drawing order. `drawScene` draws them, `createSceneRenderer` draws them from a cache, and a game lays out the same frames from the sheets. Each item names:
- `piece`, `frame` and `dir` (the frame and its row in the sheet);
- `at` (its pivot);
- `mask`, `variant` and `pass`.

The order:

1. **Floors**, lowest priority first:
   - The lowest floor in the scene lays a full tile (mask 15) under every floored cell, at the cell's centre.
   - Every higher floor lays a dual-grid tile at each vertex next to one of its own cells. The tile's corner mask covers the cells of its priority or higher, so moss runs on under a gravel patch inside it and no dirt shows between them. Inside a patch of a higher floor, its mask-15 tiles sit at vertices, half a cell off the grid.
   - Each tile is clipped to itself, and the whole floor pass to the scene's cells: nothing spills past the scene's edge.
2. **Decals**, sorted by where they stand.
3. **Walls, fences and props**, sorted by where they stand, like characters. Each one's floor marks (`ctx.ground`: shadows, pools of light) are drawn right before its parts, clipped to the scene's floor, so a wall on the scene's edge casts no shadow onto nothing.

**A piece draws one frame, never one place.** The engine always builds it at the world origin, with the camera moved onto the placement:
- `ctx.frame.origin` is (0, 0, 0) everywhere.
- `ctx.seed` belongs to the frame (piece, mask, variant), not to the cell or the facing.

So a frame looks the same in its sheet, in `drawScene`, in the editor and in a game:
- **Variation between placements is a variant.** Details drawn from `pieceRng(ctx)` are the same in every placement of that frame, and turn with a prop in every facing. Ten cells of cracked flagstone are the same cracked tile unless the floor has more variants.
- **Give a floor enough variants that its repetition does not show** (4–6 for a field floor; §3.1).
- **Variants are picked per position** with a well-mixed hash, so two neighbours differ about 1 − 1/variants of the time: half the time with 2 variants, 80% with 5. That is a coin toss, not a rule: a run of five cells can still come out all damaged. Where a look matters (damage, runes, a gate), choose it in the scene (§4).

## 3. Pieces

A piece is a `ScenePiece<Options>`: `(ctx, options) => void`. It draws one frame into `ctx.object` with `@core/volume` parts, in `ctx.frame`.

| Group | Connect | Drawn where | Exported frames |
| :--- | :--- | :--- | :--- |
| `floor` | corners (dual grid) | the lowest floor: full tiles (mask 15) at cell centres; higher floors: transition tiles at vertices | 15 corner masks × variants, exactly one tile each |
| `wall`, `fence` | edges | at cell centres, through the cell, reaching the connected neighbours | 16 edge masks × variants |
| `prop` | none | at the centre of its footprint, in 1, 4 or 8 facings | rows per facing × variants |
| `decal` | none | on the floor (cracks, puddles, leaves), under every standing thing | rows per facing × variants |

What a piece receives (`PieceContext`):
- `object`: the parts.
- `ground`: marks on the floor under them, such as a contact shadow or a pool of light (§3.4).
- `camera`, `grid`, `frame`.
- `mask`, `variant`, `dir`, `directions` and `yaw` (the facing on the floor).
- `seed`.
- `materials`, by role.
- `seam(top)`, for walls and fences (§3.2).

**Axes.** Floors, walls and fences always face the camera: `ctx.frame` has forward = world +y (towards the camera). Build them in world axes: x across the screen, y in depth (negative is north), z up. The kit's `worldFrame(ctx)` (`Frame3.facing(origin, 0)`) gives a frame with forward = +x. Props are turned to their facing; build them in `ctx.frame` and they turn with it.

**Masks:** edge bits are N 1, E 2, S 4, W 8. Corner bits are NW 1, NE 2, SE 4, SW 8. N is up the screen.

### 3.1 Floors

Build every floor with `floorTile(ctx, { paint, salt?, edge?, line? })`. It hands `paint` a `FloorTile`:

| Member | What it is |
| :--- | :--- |
| `c`, `cam`, `cx`, `cy`, `w`, `h` | the canvas, the camera, the tile's centre on screen and its size (the grid's cell) |
| `mask`, `variant`, `full` | the frame; `full` is a whole tile (mask 15) |
| `region` | the area the material covers: `cornerMaskShape` with its edge roughened inside the tile and cut straight at the border |
| `edge` | that edge as polylines on screen, without the straight cut along the border |
| `rng` | the frame's generator (`ctx.seed`, mixed with `salt`) |
| `inRegion(fn)` | runs `fn` clipped to the region |
| `bevelEdge({ lit, dark, litWidth, darkWidth, recessed })` | strokes the edge by how it faces the light. A raised floor (flags, a gravel bed) is lit on its far edges and shows its side on the near ones; `recessed` (water, a pit) is the other way round |
| `at(x, y)`, `safe(margin)` | tile-local position to screen; the area `margin` inside the border |
| `spread(n)`, `fit(p, rx, ry, pad)` | `n` points on a jittered grid over the whole tile (no clumps, no gutter); a point moved so something `rx` × `ry` lies inside the tile |

The rules `floorTile` already keeps:
- **The edge** crosses the tile's border straight and in the same place in every tile. Its roughness fades to the exact cut near the border.
- **The same edge in every floor:** a lower floor runs on under a higher one (§2), so where both edges meet they must coincide. `floorTile` makes the waves a function of the tile-local position and of `edge` only. Give every floor of a kit the same `edge` (wrap `floorTile` once in the kit's `util.ts`; the default is `FLOOR_EDGE`). A floor therefore cannot have a calmer edge than its neighbours: set `rough` for the whole kit.
- **Grow:** a transition's region grows by `edge.grow`, so antialiasing never lets the lower edge peek out.
- **Clipping:** the engine clips every tile to itself. Anything drawn past it is lost in scenes and sheets alike.

The rules a floor keeps itself:
- **A whole tile tiles with itself and every variant.** Paint the same thing along the border in every variant (for flagstones, half mortar lines; otherwise the base tone only), keep details inside the tile, and align patterns (planks, flags) to the cell.
- **A floor works in two roles.** As a scene's lowest floor its whole tiles sit at cell centres. Inside a patch over a lower floor, its whole tiles sit at vertices. Test both: `scenery-test <floor> --field` and `scenery-test <floor> --on <lower floor>`.
- **No lattice in a field.** Use 4–6 variants. What works:
  - large features as soft stains, each only as big as the room it has, so none reaches the border and the ones near it are small;
  - small details on `t.spread`, sized with `t.fit`, so the border is as busy as the middle;
  - a distinctive motif (a flower, a twin ripple, a pair of pebbles) in at most one or two variants. A repeated motif shows in a field even when the average looks even.
- **Decoration near the edge only.** A floor's own decoration (tufts, a slab's side) stays inside its region or close to its edge, because it shows wherever that floor runs on under a higher one.
- **Calm:** a floor reads calmer than the actors on it (quality bar, floors). `inspect` judges floor sheets on a value spread from 0.12 to 0.45 and at least 4 tone levels. Keep details under about 8 px. A floor's own glow (glints on water) stays faint: cores under a pixel, a few per tile, in one or two variants.

**Adding a floor material** takes, in order:
1. palette tokens and a `VOLUMES` entry in the theme (append only);
2. a role for it in the catalog's `defaultMaterials`;
3. the piece, with a `priority` above the floors it covers, `variants` and `variantLabels`;
4. its catalog entry, then `scenery-items`, export, `scenery-test` (patches, `--field`, `--on`) and `inspect`;
5. a reference-size row in `STYLE.md`.

### 3.2 Walls and fences

- **Placement** comes from the space profile:
  - **`border`** (the `jrpg`, `action-rpg` and `farm-sim` presets): walls stand on the vertices between cells and run along cell borders. The `walls` grid of a scene is one larger each way, `(rows + 1) × (cols + 1)`: entry `[r][c]` is the vertex at the top-left corner of cell (c, r). A room of N × M cells is enclosed by walls on its border, and the floor ends exactly under them. A doorway is a missing vertex: one empty vertex in a run leaves an opening one cell wide.
  - **`center`** (the `tactics` and `dungeon-crawler` presets): walls stand in the middle of their cells and fill them as obstacles. A run goes from centre to centre: one empty cell in a row leaves about one and a half cells between the pier faces, and half a cell of floor shows outside an outer wall unless the wall is as thick as the cell.
  - The pieces are the same either way: the engine moves the pivot. Only the scene data and the painter change.
- **Shape:**
  - Pass through the pivot with a consistent thickness.
  - Draw a post or pier at the pivot plus a run towards each connected edge. Mask 0 is a lone post or pillar.
  - Build heights from the profile: `ctx`-independent constants in the kit read `SPACE.scale.wall`, `.fence` and `.door`, so the kit follows the profile.
- **A room needs walls on all its sides** (the south one too), or its front is open.
- **Heights:** a wall or fence can come in several heights, as world units or profile sizes: `heights: ['wall', 'fence']` is a stone wall that also makes a low wall, `['fence', 'wall']` an iron fence that also stands tall. The first is the default.
  - A scene picks one per cell (`{ "piece": "stone-wall", "height": "fence" }`), and the piece builds to `ctx.height`. Keep blocks, bars and posts their size: a low wall has fewer courses, not squashed ones.
  - The sheet has one row per height (`data.heights`), so keep a piece to two or three.
  - **Steps:** where the height changes along a run, the step falls at the taller cell's pier. Its arm towards the lower neighbour takes the lower height (when the piece comes in it), and its pier closes towards the lower run. `layoutScene` lists that cell twice: the lower height first with all its arms, then its own height with the arms that stay up. A game rebuilds the step from the same rows of the sheet.
  - Material and structure still make different pieces: a stone wall and an iron fence are two pieces, each in its heights.
- **Joins:** the engine makes a run read as one thing:
  - **East and west:** towards a connected east or west edge it cuts the cell's drawing on the cell's border, so a block or rail runs straight on into the neighbour with no outline end cap there. A block that straddles the border is drawn by both cells, each keeping its half. A loose stone lying across the border is sliced: keep rubble and loose details clear of borders.
  - **North:** call `ctx.seam(top)` with the height of the run's top at the north border. When the north edge is connected, the cell is cut above that line on screen, so its outline does not lie across the neighbour's top. Something at depth `y` and height `z` survives the cut when `camera.project(vec3(0, y, z)).y ≥ camera.project(vec3(0, -grid.cell.y / 2, top)).y`. Piers, teeth and finials taller than the run near a connected north edge are cut, so north–south runs of a ruin vary less than east–west ones.
  - **South:** needs nothing. The cell to the south is drawn later and covers the end.
- **Height:** keep the height the same wherever a cell meets a neighbour, in every mask and variant. A ruin may break its top inside the cell, but its height at the borders is fixed (the kit's ruined wall keeps two courses at every border), or neighbours step and leave half blocks.
- **`joins`:** lists other pieces a wall connects to, such as a gate in a fence. Either side declaring it is enough.
- **The camera:** under the tilted camera a north–south run shows mostly its top. That is the projection, not a bug; level designers should know it.

### 3.3 Props and decals

- **Size:** build props in world units against `SPACE.scale.character` (a signpost about 0.6 of a character, a tree 2–3 times), and give the catalog entry a `height` so `inspect` can check it.
- **Facings:** give asymmetric props 4 or 8 facings, and turn them in `ctx.frame`. `ctx.dir` counts from the camera clockwise on screen: with 4 facings, 0 S, 1 W, 2 N, 3 E; with 8, S, SW, W, NW, N, NE, E, SE. `ctx.yaw` is the same facing as an angle.
- **Footprint:** `footprint` is the footprint facing the camera, [across, deep]. Facing east or west it is swapped (`footprintOf(info, dir)`): a 2 × 1 bench turned west covers 1 × 2 cells. The diagonals of an 8-facing prop keep the unturned footprint. The placement's `col`, `row` is the turned footprint's top-left cell.
- **The cell:** the exported cell defaults to the grid's size (decals exactly the tiles, props a wall-height cell). Set `cell` on the piece when it needs more room: a tall tree, a lid sliding off, a glow's radius, a lantern arm. Size it for the largest option values, then check with `inspect` that no cell touches its edges.
- **Decals:** decals lie flat on the floor. Project world offsets onto the floor plane, and keep them inside their cell unless `cell` is larger.
- **Standing in a floor:** a prop cannot sink into what is under it; there is no waterline. A crate half in water stands on the water. For now, lay a ripple or wet decal under it.

### 3.4 Shadows and pools of light: `ctx.ground`

A contact shadow or a pool of light drawn into `ctx.object` would cover the outer contour (which is stroked under every part) or tint it. Draw them into `ctx.ground` instead: it is drawn before the parts and their contour, as part of the same frame.

- `groundShadow(camera, at, rx, ry, rotation)` is an ellipse on the floor; for a prop that faces a way, pass `ctx.yaw - π/2` as the rotation. Never read the facing back from `frame.forward`. It returns a `Shape`, not a part: hand it to the ground object, `ctx.ground.custom(vec3(0, 0, 0), c => shadow.fill(c, GLOWS.ground))`, where `GLOWS.ground` is the theme's translucent shadow color (a kit usually wraps this in one helper of its `util.ts`).
- `floorGlow(ctx.ground, at, { radius, color, strength })` is a soft pool of light flattened by the tilt: the light of a lamp or a campfire.

### 3.5 Materials and options

- **Materials by role:** `ctx.materials.stone`, `.mortar`, `.wood`, `.metal`, `.moss`. The catalog maps roles to theme materials, so a kit can be re-materialed: grey granite or sandstone.
  - Never import `VOLUMES` in a piece.
  - Add a role when a piece needs a material none of the existing roles plays (a new theme material, §3.1), such as `darkwood` for a cabinet when `wood` is the grey fence timber. Reuse a role when the material is the same thing.
- **Options:** declare every option in the catalog with its default (`PieceOption`). Scenes and tile sets are validated against them.

**Light:** the project camera's light applies to all pieces. Never bake a different light direction into a piece.

## 4. Scenes as data

`SceneData` is plain JSON (here for a catalog with walls at cell centres; on borders `walls` is one row and one column larger):

```json
{
  "cols": 4,
  "rows": 3,
  "floor": [
    ["dirt", "dirt", "dirt", "dirt"],
    ["dirt", "flagstone", "flagstone", "dirt"],
    ["dirt", "dirt", "grass", "dirt"]
  ],
  "walls": [
    ["stone-wall", "stone-wall", { "piece": "stone-wall", "variant": 1 }, { "piece": "stone-wall", "height": "fence" }],
    [null, null, null, null],
    [null, null, null, null]
  ],
  "props": [
    { "piece": "lamp", "col": 1, "row": 1, "variant": 2 },
    { "piece": "cracks", "col": 2, "row": 1 }
  ],
  "options": { "stone-wall": { "height": 34 } }
}
```

- **`floor`:** `floor[row][col]` is a floor piece id or null. Floor variants are always picked per tile; a scene cannot choose one.
- **`walls`:** `walls[row][col]` is a wall or fence id, null, or `{ piece, variant, height, options }` to choose that cell's look and height, for example a damaged block, a banner beside a gate, or moss. Options that change the run's height where it meets a neighbour must match along the run. With walls on borders the grid is the vertices, one larger each way (`emptyScene(catalog, cols, rows)` makes the right shape; `wallGridSize` gives it).
- **`figures`:** optional cells where a scale figure stands (§1); editors and tests draw them, games ignore them.
- **`props`:** props and decals alike, as `{ piece, col, row, dir, variant, options }`, with `col`, `row` the turned footprint's top-left cell.
- **`options`:** per piece id, for every placement of that piece. `materials` maps roles to material names for the whole scene.

`validateScene` lists every problem: unknown pieces, wrong groups, footprints that do not fit, facings, variants and option values out of range.

**What a game can rebuild.** The sheets hold every frame with the pieces' default options and the catalog's materials. A scene that sets other option values or materials draws frames no sheet holds: the scene asset's layout marks those items with their `options`. A look a game needs belongs in a variant, not in an option.

**Borders:** the floor pass is clipped to the scene's cells, so higher floors may touch the border. A scene still reads better with some of the lowest floor around its edge.

**Saving sets.** Keep sets (a market corner, a harbour entrance) as `SceneData` in `src/scenes/<name>.ts` exporting `SCENE`, and export each one with `defineSceneAsset` (the sheet `sheets/scenes/<name>.ts`) as a reference image: `npm run export -- <project> scenes/<name>`. Next to the PNG, the atlas JSON carries `layout`: every frame with its piece, frame, facing, pivot in the image and, when they differ from the defaults, its options.
- **From JSON:** `npm run new-scene -- <project> <name> --scene <file.json> [--force]` validates the file, then writes both files: `src/scenes/<name>.ts` with one line per row of cells and per placement, and `sheets/scenes/<name>.ts`. `--force` replaces an existing scene. The viewer's scene painter saves through it.
- **By hand:** write `src/scenes/<name>.ts` directly. Picture maps (a string per row, a letter per piece) are easy to read: a small helper beside the scenes (`src/scenes/map.ts`, which exports no `SCENE` and so is not a scene) turns them into `SceneData`. A scene the painter saves again comes back as JSON, without the maps.

**Editors** that redraw on every change use `createSceneRenderer(catalog)`. It draws each frame once into an offscreen canvas and copies it after, so an edit only draws its new frames. Positions are exact at whole scales.

## 5. The catalog and exports

`src/scenery/catalog.ts` exports `SCENERY: SceneryCatalog`:
- `pieces`: one `ScenePieceInfo` each, with:
  - id, label and group;
  - connect, variants and `variantLabels` (one label per variant, a single-variant piece included);
  - footprint, directions, priority and joins;
  - true roles and options with defaults;
  - `height`: the nominal height of its top, in world units or as a profile size (`'wall'`, `'door'`, `'fence'`, `'character'`); walls default to `'wall'` and fences to `'fence'`;
  - `cell` when needed, and `asset` when its sheet lives elsewhere;
- `materials` (the theme's `VOLUMES`) and `defaultMaterials`;
- `grid`, `camera` and `space` (the profile; its grid and camera).

**The first piece of a kit.** `npm run new-kit -- <project> scenery` writes `src/scenery/`: a crate prop in a family file (`src/scenery/props.ts`), the catalog (`src/scenery/catalog.ts`) and `src/scenery/index.ts` (`export * from './props';`), with the theme's materials and the space profile; it refuses to overwrite a kit unless `--force`. Written by hand, the minimum is this: a prop needs only `id`, `label`, `group: 'prop'`, `piece`, `connect: 'none'` and `roles` in its entry (add `height` so `inspect` checks its scale, and `directions` for 4 or 8 facings), and the catalog needs `materials: VOLUMES`, a `defaultMaterials` entry for every role the pieces ask for (`{ wood: 'wood' }`), and `grid: SPACE.grid`, `camera: SPACE.camera` and `space: SPACE`. Then `npm run check -- <project>`, `scenery-items`, `export -- <project> scenery/` and `scenery-test`. The list above is the full form of an entry, and `validateCatalog` names what is missing.

`validateCatalog` checks it: duplicate ids, a group with the wrong connection, labels that do not match the variants, unknown joins, facings, footprints, default options out of their own range and unknown materials. `scenery-items`, `new-scene` and `scenery-test` refuse a catalog with problems.

As in the gear kit, the files of `src/scenery/` are code, never exported by themselves: the sheets are.

- **Sheets:** `npm run scenery-items -- <project>` writes one generated `defineTileSet` sheet per piece in `sheets/scenery/`. Export them with `npm run export -- <project> scenery/` and every piece shows in the viewer's asset list. The export takes several paths at once (`export -- <project> scenery/ scenes/`).
  - A piece that already has its own sheet (a prop in `sheets/props/`) sets `asset: 'props/signpost'` (a path under `sheets/`) and gets no default sheet here. `asset: false` exports none.
- **The atlas:** a tile set's atlas says:
  - `role` (`tile`, `wall`, `fence`, `prop` or `decal`);
  - `connect`, `maskBits`, `variants`, `variantLabels` and `footprint`;
  - `priority` (floors) and `joins` (walls);
  - `height` (world units and pixels on screen) and `space` (the profile's sizes);
  - `grid` and `layer`;
  - `tiles`, which maps each frame to its mask and variant.
- **How a game lays the sheets out:** this is `layoutScene` (§2), and a scene asset's `layout` lists it.
  - Floors go first, lowest priority first: full tiles of the lowest floor at cell centres, then each higher floor's tiles at the vertices next to its cells.
  - Decals next.
  - Walls, fences (at cell centres, the frame of their edge mask) and props (at their turned footprint's centre) last, sorted by their pivot's y.

## 6. Checking a kit

- **Seams:** `npm run scenery-test -- <project> <piece>` renders the piece through every join it has:
  - for floors: patches, a single cell, the diagonal saddle, a ring round a hole and an L, on the lowest floor (for the lowest floor itself, another floor's patches on a field of it);
  - for walls and fences: a loop with a T, a cross, a lone post, a free run and a run through a joined piece;
  - for props and decals: every facing by every variant, spaced by the exported cell.
  - `--on <floor>` stands it on another floor (water over flagstones), `--on none` on no floor; `--field` renders a 14 × 10 field of a floor alone.
  - It writes `review/scenery-tests/<piece>[-field][-on-<floor>].png` and removes its temporary sheet. Look at it at 1× first, then zoomed: `npm run contact -- <png> --zoom 3` zooms the whole image.
- **Scale:** `scenery-test` draws scale figures beside the piece (inside a wall loop, beside each facing of a prop). `inspect` compares the typical height of a sheet's cells above their pivot with the piece's nominal height and warns when it is off scale (under 0.85 or over 1.4 times).
- **Quality:** `npm run inspect` on every sheet.
  - Floor tile sheets (`role: tile`) are judged as floors: value spread from 0.12 to 0.45, at least 4 tone levels, no accent needed; their cells touch their edges by design.
  - Decals need no accent.
  - Walls, fences and props are judged like any asset, and no cell should touch its edges.
- **Next to the actors:** compare a set with the project's characters at the same scale (`contact --with`, or the playground with the scene behind them). The floor must stay calmer than the actors, and wall and prop heights must match `STYLE.md`.

## 7. Checklist

- The project has a space profile (`src/space.ts`), the catalog uses its grid, camera and `space`, and the kit's sizes come from `SPACE.scale`.
- Tiles are exact pixels and seamless: `scenery-test` for every floor, on the floors it meets (`--on`), zoomed at 3×.
- A field of each floor (`scenery-test --field`) shows no lattice and no repeated motif at 1×. If it does, add variants, soften the large features, or keep the motif to one variant.
- Every wall and fence mask joins its neighbours: the run, L, T, cross and lone post of `scenery-test`. Heights at cell borders are the same in every mask and variant, `seam(top)` is called, and nothing loose lies across a connected border.
- Pieces read in the project's style and finish (quality bar): three tones per material, line hierarchy, detail tiers. A floor reads calmer than the characters on it.
- Props have the facings they need, fit their turned footprint, have a `cell` large enough for every option, and orient shadows and light from `ctx.yaw`.
- Every piece is in the catalog with true roles, option defaults and one `variantLabel` per variant, `validateCatalog` is clean, and its sheet is exported (or `asset` says where it is).
- Sets choose their wall looks where damage or a banner matters, use only frames the sheets hold where a game must rebuild them, and are exported with their layout.
- `STYLE.md` has a reference-size row for every new piece.
