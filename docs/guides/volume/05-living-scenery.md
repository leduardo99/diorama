# Living scenery (`@core/volume`)

**Purpose.** Make a scenery kit something characters live in, not a backdrop:
- pieces with **states and animations**: a door that opens, a chest, a lever, an urn that breaks, flames that flicker;
- **doors** standing on cell edges in wall runs;
- **navigation** exported with every scene: where characters can walk, what blocks, what can be used;
- **characters sorted in depth** against walls and props.

It builds on guide 04 (kits, space profile, scenes). The engine gives the mechanics; the pieces' looks and timing are the project's art.

**API reference:** [`docs/api/volume.md`](../../api/volume.md): `PieceClip`, `PieceNav`, `PieceContext.state` / `.clip`, `ScenePlacement.state` / `.edge`, `defineTileSet` (`state`, `clip`, `variant`), `sceneNavigation`, `pieceBlocks`. Moving on the navigation is the players' part: [`docs/api/runtime.md`](../../api/runtime.md) (`@diorama/runtime`): `canStep`, `findPath`, `moveIn`, `cellAt`, `flightStop`.

---

## 1. States and clips

A piece (prop, decal or door) can rest in several **states** and play **clips** between them:

```
states: ['whole', 'broken'],
clips: { breaking: { frames: 6, from: 'whole', to: 'broken', events: [{ frame: 2, name: 'break' }] } },
nav: { passableIn: ['broken'], interact: 'break', interactIn: ['whole'] },
```

(an urn's catalog entry, beside its id, group and piece)

- **`states`:** resting looks, the default first. A scene picks one per placement (`{ piece, col, row, state }`); the piece reads `ctx.state`.
- **`clips`:** each has `frames`, `fps` (default 10), `events`, and either:
  - **a transition**, `from` → `to` (a door opening, an urn breaking). `ctx.clip.t` runs from 0 on its first frame to 1 on its last; the last frame should match the `to` state's still frame, and the first the `from` state's;
  - **a loop**, `loop: true`, optionally `from` (a lamp's flame, a lantern's flicker). `ctx.clip.t` is frame ÷ frames, so frame `frames` would equal frame 0: close the loop.
- **Events** mark the moment a game reacts: `open` (the door lets characters through from here), `break`, `spark`, `release`.
- **Names:** name a transition by its action ('opening', 'closing', 'breaking', 'pulling') and never like a state: a state and a clip of one name would both export as `<id>--<name>`, and `validateCatalog` refuses it.
- **The piece** draws `ctx.state` when still, and the clip's frame when `ctx.clip` is set (its state is then the clip's `from`). Animate with `t` and the frame's seed; keep the silhouette's pivot fixed so a game can swap sheets in place.
- **Timing helpers:** `playhead(ctx.clip)` is the position in frames; `keyed(x, [[frame, value], …])` is a smooth curve through hand-timed keys (an overshoot is a key above the target); `loopWave(t, cycles, phase)` closes a loop exactly. `frame.pitched(deg)` tips a frame about its side axis (a lid on a back hinge) and `frame.rolled(deg)` about its forward axis (a tumbling shard); `turned(deg)` swings it about up (a door leaf on its hinge).
- **Sheets:** `scenery-items` writes one sheet per extra state (`sheets/scenery/<id>--<state>.ts`) and one per clip (`sheets/scenery/<id>--<clip>.ts`): the clip's frames across and, down, the facings of each variant (`rows` says which facing and variant each row is). The atlas says `clip` (frames, fps, loop, from, to, events) the way a character's sheet does, and every sheet lists the piece's `states` with their sheets (`stateSheets`), `clips` and `nav`.

## 2. Doors

A **door** (`group: 'door'`) stands on a cell edge between two wall vertices (walls on borders, guide 04 §3.2):

- **Placement:** `{ piece, col, row, edge: 'N' | 'W', state }` puts it on the north or west edge of cell (col, row); `col` may be `cols` for a west edge and `row` `rows` for a north edge, on the scene's outer border. It faces across its edge (S for a north edge, E for a west edge; `dir` may turn it to the other side).
- **The wall run is cut there:** the walls on either side end in piers, which are the door's jambs. The door draws its frame, lintel and leaf between them, exactly one cell wide, so a character walking along a column of cells passes through its middle.
- **Size:** the door piece is one cell wide; the opening's height is `SPACE.scale.door`, and the lintel reaches the wall's height. Give the catalog entry a `cell` wide enough for the jambs and an open leaf.
- **States and clips:** `states: ['closed', 'open']`, a clip `opening` (closed → open, with an `open` event when the leaf clears the way) and `closing` (with `shut`); `nav: { passableIn: ['open'], interact: 'door' }`.
- **Draw order:** a door is drawn after the wall vertex on its north or west end and, on a west edge, before the one on its south end: keep the door's parts between the piers' shafts, plinths and caps, never over them.
- **Edge-on doors:** under the tilted camera a door on a west or east edge shows mostly its edge when shut. Give it a mark that reads from the front (a lit symbol on the lintel's top, say).
- **Width:** a door is one cell wide. A path two cells wide needs two doors side by side (or a wider door piece the project builds), or it narrows at the door.
- **A gate** in a fence is a door too, between fence posts.
- With walls at cell centres (the `tactics` and `dungeon-crawler` presets), a door is a wall piece in the wall run (it connects like a wall); edge doors need walls on borders.

## 3. Navigation

`sceneNavigation(scene, catalog)` turns a scene into movement data, and every scene asset's atlas carries it (`navigation`):

| Field | What it holds |
| :--- | :--- |
| `cost[row][col]` | the cost of entering a cell: 1 for plain ground, more for slow ground, 0 when it cannot be entered |
| `walls[row][col]` | the cell's edges that cannot be crossed, N 1, E 2, S 4, W 8 |
| `doors` | each door: its prop index, cell, edge, state and whether it lets characters through now |
| `interactables` | things to use now: kind, piece, cell, state, and the cells a character uses it from |
| `posts[row][col]` | walls on borders: the vertices where a blocking wall stands (piers, pillars), one more row and column than the cells |

How pieces count (`nav`, else the group's default):
- **Floors** cost `nav.cost` (default 1); a floor with `nav.blocks` (deep water) cannot be entered; a cell without floor neither.
- **Props** block the cells of their turned footprint, unless `nav.blocks: false` (a low stack of planks a character walks over) or their state is in `nav.passableIn` (a broken urn). **Decals** never block.
- **Walls and fences on borders** block the cell edges they run along; at cell centres they block their cells. Low walls block too.
- **Doors** block their edge until their state is passable.
- **`nav.interact`** lists a piece in `interactables`: 'door', 'chest', 'lever', 'break', or the project's own kinds; **`nav.interactIn`** limits it to some states, so a chest once opened or an urn once broken drops out.

Moving on it is done by the players, not the engine, with `@diorama/runtime` ([`packages/runtime/README.md`](../../../packages/runtime/README.md)). A game reads the navigation from the scene sheet's atlas (`meta.data.navigation`, with its `grid`); the viewer's playground builds the same navigation from the project's source with `sceneNavigation` and moves on it with `moveIn` and `flightStop`:
- `canStep(nav, from, to)`: a 4-neighbour step for grid movement;
- `findPath(nav, from, to)`: the cheapest path (A*), or null;
- `cellAt(grid, p)` and `moveIn(nav, grid, p, delta, radius, postRadius?)`: free movement on the floor (world units) that slides along walls, stops a body's radius short of what blocks, keeps clear of wall posts, and takes long moves in half-cell steps so nothing is tunnelled through;
- `flightStop(nav, grid, from, to)`: where something flying along the floor (a projectile) is stopped by a cell that cannot be entered, a wall or a shut door.

In the engine, `sceneNavigation(scene, catalog, { open: { 3: true } })` recomputes the navigation with doors opened or shut by prop index, as a game changes them.

## 4. Characters in the scene

A scene draws in passes (guide 04 §2): floors, decals, then walls, fences, doors and props sorted by where they stand. Characters belong to that last pass:

- **Background:** draw floors and decals once (they never cover a character).
- **Sorting:** each frame, sort the standing items of `layoutScene` (or the scene atlas's `layout`) and the characters by the y of their pivot on the floor, and draw them in that order. A character north of a wall is drawn before it and hidden by it; one in front is drawn after.
- **Pivots:** a wall's pivot is its vertex (or cell centre), a prop's the centre of its footprint, a door's the middle of its edge, a character's its feet.
- **Live pieces:** a game swaps a placement's still frame for its clip's frames while it plays (`renderer.frame({ ...item, clip: { name, frame } })` in the viewer), then rests it in the clip's `to` state and recomputes the navigation.

## 5. Checklist

- Every state has a still sheet and every clip an animated one; transitions start and end on the still frames of their states; loops close.
- Events sit on the frame a game should react on (a door's `open` when the leaf clears the way).
- Doors are one cell wide between the wall's piers, with a lintel at the wall's height and an opening at `SPACE.scale.door`.
- `nav` is true to the art: what looks solid blocks, what looks walkable does not, what can be used says `interact`.
- `scenery-test` shows a prop in each state and a door in a walled room, closed on one wall and open on another.
- The scene's `navigation` (in its atlas) matches the picture: walk the playground around the walls and through the doors.
