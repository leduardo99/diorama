---
name: diorama-volume
description: Create 2.5D assets with `@core/volume` in Diorama — props, scenery pieces, living scenery (doors, chests, levers), equipment parts, effects, item icons, HUD pieces, and anything that must match the project's 3/4 camera or be exported in several facings (directions). Use when an asset needs volume, a consistent camera and light across a set, or rows per direction; use diorama for the general production rules, diorama-kits for sets driven by a catalog.
---

# 2.5D volumes in Diorama

This skill covers how to plan, build and check volume assets. It does not repeat the general production policy (read `diorama` first) or the API (read the reference). The engine already handles the mechanics: projection, light, face sorting, edge inking, the direction layout and the atlas JSON. Your job is the decisions the engine cannot make.

## Routing

| Need | Read |
| :--- | :--- |
| Camera, light, facings, pivot, export layout | [guide 01](../../../docs/guides/volume/01-space-camera-and-facings.md) |
| Choosing solids, round volumes, tubes, decals; how the stage sorts | [guide 02](../../../docs/guides/volume/02-volumes-and-stage.md) |
| Props, scenery pieces, equipment | [guide 03](../../../docs/guides/volume/03-props-scenery-and-equipment.md) |
| The game's space (grid, scale against the characters, wall placement) and scenery on it: floors, walls and fences that connect, props, scenes as data, tile sets | [guide 04](../../../docs/guides/volume/04-scenery-kits.md) |
| Living scenery: pieces with states and animations, doors on cell edges, navigation | [guide 05](../../../docs/guides/volume/05-living-scenery.md) |
| Visual effects cued on character events, items and their inventory icons, the HUD (nine-slice panels and buttons, bars, bitmap fonts, cursors) | [guide 06](../../../docs/guides/volume/06-effects-items-and-hud.md) |
| Exact signatures | [volume API](../../../docs/api/volume.md) |
| The quality floor and defaults (tones, lines, accent, detail tiers, sorting, cost) | [quality bar](../diorama-review/references/quality-bar.md) |
| Silhouette, value contrast, proportions, readability per facing | [readability](../diorama-review/references/readability.md) |
| Anything with `frames > 1` (opening lids, flames, banners, pendulums; characters also follow diorama-rig) | [motion](../diorama-review/references/motion.md) |
| A set of related pieces driven by a catalog (scenery, effects, items) | the `diorama-kits` skill |

## When to use volume

- Props, scenery, equipment, effects, icons and the skins of characters are all built on `@core/volume`. Use it when the asset has depth in the game's 3/4 view, must match other 2.5D assets, or needs more than one facing.
- Animated bodies with a skeleton (characters and creatures) are `@core/rig`; read `diorama-rig` for them. Their skins and equipment are still volume parts.
- Flat art that is not part of the world (a nine-slice panel, a bar, a cursor, a bitmap font) is drawn with `@core/draw` through the HUD helpers of guide 06. The test: if it stands in the world, turns with the camera or casts light and shadow, it is a volume; if it is a screen element or a mark lying flat, it is drawn. Volume parts are `@core/draw` shapes, so its styles and textures still apply.

## Before the first volume asset of a project

1. The theme must declare `CAMERA` (one `Camera` for the whole project, with its `contour`) and the `VOLUMES` material tokens (ramp, inner line, crease edge, optional `form`). New projects get both from the template; add them to older themes. The look is the owner's choice (`diorama-style`); the floor of the [quality bar](../diorama-review/references/quality-bar.md) is not.
2. `STYLE.md` must hold the reference sizes (character height, door height, grid size) under a "Reference sizes" heading, so every asset uses the same world scale. If it has none yet, measure the existing volume assets (their sheets, not their code) and write the sizes down before building. For the first asset of a project there is nothing to measure: choose them (guide 03 §1 gives two starting points; `new-project --genre <preset> --character <height>` writes them as a space profile in `src/space.ts`) and write them in the table before building. If the project has no `STYLE.md`, copy `templates/optional/STYLE.md` (replace `[Project Name]`); `new-project --style` cannot be run on an existing project.

## Workflow per asset

1. **Decide the facings** with the table in guide 01. Asymmetric objects get every row rendered; never mirror.
2. **Create the files** with `npm run new-asset -- <project> <subpath> --engine volume --directions N [--size WxH]` (N from the table: 1, 4 or 8; without the flag the template has 8 rows). It writes the drawing in `src/<subpath>.ts` (a named export) and the sheet `sheets/<subpath>.ts` that exports it; keep the drawing in `src/` and the sheet one line. The template places the camera at the pivot and builds in a `Frame3` turned by `facing`.
3. **Block out** the one or two volumes that make the silhouette, all inside one `stage.object()` per physical thing. Export, run `npm run contact -- <png>` and look at every row before adding detail (`--rows`/`--frames` zoom a subset); fix proportions now.
4. **Attach** secondary parts with `{ on: part }`. Things that stand on the ground next to the object (a lamp at its foot, a rock, a pot) are separate objects. Add decals and textures last.
5. **Check** (below), then polish and repeat.

Different assets start differently:

- **Equipment pieces** (a hat, a backpack, a tool, a sword) are helpers that take a frame (guide 03 §4) so one drawing serves the character, the world prop and the icon. A project with many of them keeps them in a gear kit: `diorama-kits`.
- **Scenery, effects and item icons** are kits, entries in a catalog with a generator that writes their sheets: `diorama-kits`. A one-off prop is `new-asset`.
- **HUD pieces** (panels, bars, fonts, cursors) are hand-written: the drawing in `src/ui/<piece>.ts` with the HUD helpers of guide 06 and a one-line sheet in `sheets/ui/<piece>.ts`. `new-asset --engine volume` writes a camera-and-stage template that these do not use.
- **Animated props** (frames > 1): build the moving part in its own frame, drive it with `frameIndex`, and follow the [motion reference](../diorama-review/references/motion.md); every periodic term completes whole cycles per loop.

## Rejection rules

Reject or rewrite volume code that:

- Creates a `Camera` inside an asset, or changes tilt, height boost or light per asset. Use the theme's `CAMERA.at(origin)`.
- Projects or sorts by hand (`ctx` calls in world space, manual depth arrays, drawing parts in a fixed order). Everything goes through the `Stage`.
- Builds in world coordinates instead of a `Frame3`, or rotates points by hand to make facings.
- Uses `bias` to keep an attachment on top of its host. Use `on`.
- Adds the parts of one physical thing with separate `stage.add` calls (they then sort as separate objects). Group them with `stage.object()`.
- Mirrors one direction to produce another for an asymmetric object.
- Stretches heights by hand to compensate for the camera (`heightBoost` already does).
- Writes raw colors or stroke settings. Materials are `VOLUMES.*` (add a key to `VOLUMES` for a new material); decals use `SHAPE_STYLES.*` or small style objects built only from theme tokens (`{ fill: RAMPS.accent.base }`). `npm run check` reports raw `#hex`, `rgb()` and `hsl()` literals outside `src/theme.ts`.
- Uses `Math.random` or time. Variation comes from `createRng(seed)` per part. `npm run check` reports `Math.random`, `Date` and `performance.now` with the file and line.
- Calls shape booleans (`union`, `subtract`, `intersect`) per part per frame, or anything that makes a cell cost more than about 30 ms.
- Puts a one-sided part (a visor, a chest bib, a front panel) `on` a body without checking `cam.faces`, so it shows through when the body turns.
- Stops at the mannequin stage: egg heads, pin limbs, one blob for a body (the floor of the quality bar), or, where the style keeps the detail tiers, no secondary or tertiary detail.

## Quality gates (in addition to the four of diorama)

1. **Every row looked at.** `npm run contact -- <png>` lays out every direction zoomed on a flat background; open it and review each row, not only the first. The primary feature is visible in every row; front and back are distinguishable.
2. **Silhouette and value.** The silhouette alone identifies the object. `npm run contact -- <png> --gray` shows the value structure: adjacent parts must not merge into one gray (see the readability reference).
3. **Quality bar.** `npm run inspect -- <png>` prints `quality` with no warnings, or the report says why a warning does not apply (a style that differs on purpose says so in `STYLE.md`). The details the style keeps are named in the report.
4. **Consistency.** Same camera, light and world scale as the other volume assets of the project; compare side by side with one of them (`npm run contact -- <png> --with <other.png>`, plus `--zoom N` when the cells differ in size).
5. **Layout.** `inspect` reports `touchingCellEdges: []` and `empty: []`, and `pivotToContentBottom` has a small spread between rows (negative values are expected; see guide 01).

## Reporting

Report the facings chosen and why, the gates you ran with their results, and anything you could not verify (for example how it reads in motion when the asset is static).
