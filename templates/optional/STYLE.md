# Style: [Project Name]

The art direction of the project. `src/theme.ts` is the source of truth for colors, line weights, the camera and the materials; this file says in words what the theme implements and holds what it cannot express: sizes, facings, layering, motion and where the accent goes. The `diorama-style` skill says how to fill it in.

## Summary of the theme

- **Palette:** the materials of the world (cloth, skin, wood, stone, metal...) and the one saturated accent.
- **Camera and light:** `CAMERA` tilt, height boost, light azimuth and elevation, and the `CONTOUR` around every object.
- **Materials:** the `VOLUMES` keys and what each one is for; which are matte (`form: { highlight: false }`) and which shine.
- **Lines:** the contour outside each silhouette, inner lines in a darker shade of each material, thin crease edges.

## Specifications the theme cannot express

- **Export scale** (logical size × scale): 2.
- **Facings:** 8 for actors and props that turn, 4 for pieces seen only along the grid, 1 for marks on the floor.
- **Layering:** what glows over what; contact shadows and pools of light on the ground, under the parts.
- **Motion:** loops close on `t = frame / frames`; frames and fps per kind of clip.
- **Accent:** where the saturated color is allowed, and where it is not.

## Reference sizes

Every asset uses the same world scale, in world units of `@core/volume` (1 unit = 1 logical pixel). The table below is one starting point to replace with the project's own: the `jrpg` space profile at a character height of 80 under the theme's `CAMERA` (a character about two cells tall and one wide, walls taller than the character). For contrast, the `tactics` profile at a height of 64 gives a cell of 64 × 48 on screen (as wide as the character is tall), walls of 58, doors of 70 and fences of 29, and `farm-sim` at 64 a cell of 32 × 24 and walls of 102. With a space profile (`src/space.ts`) the cell, wall, door and fence sizes come from `SPACE`: change a proportion there, never piece by piece, and keep this table in step.

| Thing | Size | Of the character's height |
| :--- | :--- | :--- |
| Character (standing, feet to top of head) | 80 | 1 |
| Grid cell on screen | 48 × 36 | 0.6 (its width) |
| Wall height | 100 | 1.25 |
| Door height (clear) | 92 | 1.15 |
| Fence height | 44 | 0.55 |

The size of each character, scenery piece and prop (cell, pivot, export size) is added below as the project grows.

## Quality overrides

The quality bar of the `diorama-review` skill has a floor every style must clear (a silhouette that reads in every facing, no clipping, one camera, light and scale) and defaults that suit most styles (three tones per material, thin inner lines, one focal accent). When this style differs from a default on purpose (two flat bands, no inner lines, a monochrome palette), say what and why here, so a warning of `npm run inspect` is explained and not "fixed". `inspect` does not read this file.
