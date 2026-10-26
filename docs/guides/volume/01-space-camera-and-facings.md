# Space, Camera and Facings (`@core/volume`)

**Purpose.** Place 3D volumes in one shared 2.5D space and render them from several facings. Props, scenery, equipment pieces and characters of a project all go through the same camera, so they match in angle, light and scale.

**API reference:** [`docs/api/volume.md`](../../api/volume.md). Signatures are not repeated here.

---

## 1. World axes and units

- x runs to the right of the screen, y runs towards the camera (down the screen), z runs up.
- One world unit is one logical pixel at camera scale 1. The export multiplies by the asset `scale` like any asset.
- Build objects in a local `Frame3` (forward, side, up), never in world coordinates. The frame's yaw turns the whole object, which is what makes every facing come from one build.

## 2. One camera per project

Declare the camera once in `src/theme.ts` (`CAMERA`) and place it per asset with `at(origin)`. Do not create cameras inside assets.

| Setting | Default | Change it when |
| :--- | :--- | :--- |
| `tilt` | 48° | The game's camera is steeper (top-down, ~60–70°) or flatter (~30–35°). Change it for the whole project, never per asset. |
| `heightBoost` | 1.2 | Leave it. The tilt shortens heights to cos(tilt) ≈ 0.67; 1.2 restores natural proportions. Do not also stretch legs or walls by hand. |
| `light` | from the upper left, slightly towards the camera | The project's art direction puts the key light elsewhere. One light for the whole project. |

The light decides which faces are lit: faces pick `lit`, `base` or `dark` from their ramp. A different light per asset is the fastest way to make a set of assets look unrelated.

With the default light (azimuth 140°, elevation 45°):

| Face turned | Tone | Consequence |
| :--- | :--- | :--- |
| Up (tops, lids, floors) | lit | The top reads first; keep identifying detail there or on the front. |
| Towards the camera, or to the left | base | Front faces are mid-tone: carvings and decals on them need a ramp `dark` or `lit` to show. |
| To the right, or away from the light | dark | Do not put the only identifying detail on the right-hand side. |

## 3. Facings and the export layout

Set `directions` in `defineAsset`. The export writes one row per direction, and `render` receives `facing` (radians) for `Frame3.facing`.

- Rows start facing the camera (S) and turn clockwise on screen: S, SW, W, NW, N, NE, E, SE for 8; S, W, N, E for 4.
- The atlas JSON lists `meta.directions`, `meta.directionFacings` and frames named `<direction>_<frame>`.

Decide in this order; the first row that matches wins:

| The object | Directions | Why |
| :--- | :--- | :--- |
| Moves or turns in the game (character, creature, vehicle, a turret) | 8 | Turns and diagonal movement need the diagonals. A character that only moves along the grid axes may use 4 (see rig guide 03). |
| Same from every side (barrel, column, pot, rock) | 1 | Every facing looks the same. |
| Static, placed by level design on the grid axes only (wall, door, fence, signpost, statue) | 4 | The game only places it in four orientations. |
| Static, but may be placed at diagonals or scattered freely (chest, crate, furniture, rubble) | 8 | Diagonal placements need their own rows. |

Whatever the count, an asymmetric object (a lock on one side, a weapon in one hand) gets every row rendered; never mirror one direction into another.

## 4. Pivot and cell

- The pivot is the centre of the object's footprint on the ground (between the feet of a character, the middle of a chest's base). Place the camera origin there and declare the same point as `pivot`. The JSON writes it in pixels, so the engine anchors every frame and direction at the same spot.
- Because the footprint extends towards the camera, the lowest pixels of a cell (front edge, contact shadow) sit below the pivot: `inspect` reports this as a negative `pivotToContentBottom`, which is expected. What matters is that the spread between cells stays small.
- Keep one cell size for every row and frame of an asset. Size it from the widest facing plus about 10% margin, and check with `inspect` that no row reaches the cell edges.

## 5. Quick decision table

| Situation | Recommended | Avoid | Reason |
| :--- | :--- | :--- | :--- |
| Turning an object | `Frame3.facing(origin, facing)` | Rotating points by hand | One build renders every row. |
| Matching another asset's look | The theme's `CAMERA` | A new `Camera` in the asset | Same tilt, light and height scale. |
| Taller-looking walls or legs | Keep `heightBoost` | Scaling heights by hand | The camera already compensates. |
| West-facing row of an asymmetric object | Render it | Mirroring the east row | Mirrors swap sides of asymmetric details. |
