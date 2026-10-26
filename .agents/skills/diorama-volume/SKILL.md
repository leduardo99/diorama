---
name: diorama-volume
description: Create 2.5D assets with `@core/volume` in Diorama — props, scenery kits and scenes, living scenery (doors, chests, levers), armor and equipment pieces, effects, item icons, and anything that must match the project's 3/4 camera or be exported in several facings (directions). Use when an asset needs volume, a consistent camera and light across a set, or rows per direction; use diorama for the general production rules.
---

# 2.5D volumes in Diorama

This skill covers how to plan, build and check volume assets. It does not repeat the general production policy (read `diorama` first) or the API (read the reference). The engine already handles the mechanics: projection, light, face sorting, edge inking, the direction layout and the atlas JSON. Your job is the decisions the engine cannot make.

## Routing

| Need | Read |
| :--- | :--- |
| Camera, light, facings, pivot, export layout | [guide 01](../../../docs/guides/volume/01-space-camera-and-facings.md) |
| Choosing solids, round volumes, tubes, decals; how the stage sorts | [guide 02](../../../docs/guides/volume/02-volumes-and-stage.md) |
| Props, scenery kits, armor and equipment | [guide 03](../../../docs/guides/volume/03-props-scenery-and-equipment.md) |
| The game's space (grid, scale against the characters, wall placement, genre presets) and scenery kits on it: floors with transitions, walls and fences that connect, props, scenes as data, tile sets | [guide 04](../../../docs/guides/volume/04-scenery-kits.md) |
| Living scenery: pieces with states and animations (doors, chests, levers, breakables, flames), doors on cell edges, navigation exported with scenes, characters sorted against walls and props | [guide 05](../../../docs/guides/volume/05-living-scenery.md) |
| Visual effects (projectiles, impacts, casts, auras) cued on character events, items and their inventory icons, the HUD (nine-slice panels and buttons, bars, bitmap fonts, cursors) | [guide 06](../../../docs/guides/volume/06-effects-items-and-hud.md) |
| Exact signatures | [volume API](../../../docs/api/volume.md) |
| The quality floor every style must clear (tones, line hierarchy, focal accent, detail tiers, sorting, cost) | [references/quality-bar.md](../diorama-review/references/quality-bar.md) |
| Silhouette, value contrast, proportions, readability per facing | [references/readability.md](../diorama-review/references/readability.md) |
| Anything with `frames > 1` (opening chests, flames, banners; characters also follow diorama-rig) | [references/motion.md](../diorama-review/references/motion.md) |

## When to use volume

- Props, scenery, armor, effects, icons and the skins of characters are all built on `@core/volume`. Use it when the asset has depth in the game's 3/4 view, must match other 2.5D assets, or needs more than one facing.
- Animated bodies with a skeleton (characters and creatures) are `@core/rig`; read `diorama-rig` for them. Their skins and gear are still volume parts.
- Flat art that is not part of the world (a nine-slice panel, a bar, a cursor, a bitmap font) is drawn with `@core/draw` through the HUD helpers of guide 06. Volume parts are `@core/draw` shapes, so its styles and textures still apply.

Worked examples (read-only, for technique: an exception to project isolation, like the rig ones) in `examples/soulkeeper/src/`, each kit a folder with its `catalog.ts` and `index.ts`:
- `scenery/props.ts` with `scenery/prop-parts.ts`: a tombstone, a reliquary with an animated lid, a candle cluster, a brazier, a lantern post and a coffin, built from solids, round volumes, tubes and decals (`on`, `visibleArc`, `object.custom` flames). They are `ScenePiece`s (guide 04) that draw into `ctx.object` in `ctx.frame`; a standalone prop uses `defineAsset` as the template does, with the same parts;
- `gear/weapons.ts`, `gear/shields.ts`, `gear/heads.ts`: armor and weapons as helpers that take a frame (guide 03 §4);
- `items/` and `ui/`: item icons and HUD pieces (guide 06);
- `sheets/` beside it: the thin files that export all of the above (`sheets/props/tombstone.ts`, the generated `sheets/scenery/`, `sheets/icons/`).

## Before the first volume asset of a project

1. The theme must declare `CAMERA` (one `Camera` for the whole project, with its `contour`) and the `VOLUMES` material tokens (ramp, inner line, crease edge, optional `form`). New projects get both from the template; add them to older themes. The style is the owner's choice; the [quality bar](../diorama-review/references/quality-bar.md) is not.
2. `STYLE.md` must hold the reference sizes (character height, door height, grid size) under a "Reference sizes" heading, so every asset uses the same world scale. If it has none yet, measure the existing volume assets (their sheets, not their code) and write the sizes down before building. For the first asset of a project there is nothing to measure: choose them (the example of guide 03 §1 is a start: a character 80 units tall, a door 92, a floor cell 48 × 36 on screen, the `jrpg` profile; `new-project --genre <preset> --character <height>` writes them as a space profile in `src/space.ts`) and write them in the table before building. If `projects/<project>/STYLE.md` does not exist, create it by copying `templates/optional/STYLE.md` (replace `[Project Name]`; it already holds the starting sizes of the `jrpg` preset at a character height of 80, to replace with your own); `new-project --style` cannot be run on an existing project.

## Workflow per asset

1. **Decide the facings** with the table in guide 01. Asymmetric objects get every row rendered; never mirror.
2. **Create the files** with `npm run new-asset -- <project> <subpath> --engine volume --directions N [--size WxH]` (N from the table: 1, 4 or 8; without the flag the template has 8 rows). It writes the drawing in `src/<subpath>.ts` (a named export) and the sheet `sheets/<subpath>.ts` that exports it; keep the drawing in `src/` and the sheet one line. The template places the camera at the pivot and builds in a `Frame3` turned by `facing`.
3. **Block out** the one or two volumes that make the silhouette, all inside one `stage.object()` per physical thing. Export, run `npm run contact -- <png>` and look at every row before adding detail (`--rows`/`--frames` zoom a subset); fix proportions now.
4. **Attach** secondary parts with `{ on: part }`. Things that stand on the ground next to the object (a candle at its foot, a rock) are separate objects. Add decals and textures last.
5. **Check** (below), then polish and repeat.

Scenery, effects and icons are kits: a folder of `src/` with a `catalog.ts` (what editors read), an `index.ts` (what other code imports) and its pieces and helpers as plain files (`src/scenery/`, `src/vfx/`, `src/items/`; the gear kit, `src/gear/`, is the same shape). A project without the kit starts it with `npm run new-kit -- <project> scenery|vfx|items` (`gear` for the gear kit): it writes `catalog.ts`, `index.ts` and a first piece (a crate prop, a spark burst, a gem) that reads its materials by role and its sizes from `src/space.ts`, a block-out to replace or to make the project's own. A generator writes one sheet per catalog entry into `sheets/scenery/`, `sheets/vfx/` and `sheets/icons/` (`scenery-items`, `vfx-items`, `item-icons`), and you export those folders; a generated sheet is never edited, you change the catalog and run the command with `--force`. Guides 04 to 06 cover them. For a scenery piece, test the joins with `npm run scenery-test -- <project> <piece>` before calling it done, and judge it in the viewer's Scenery tab, painted into a scene.

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
- Puts a one-sided part (nasal bar, chest bib, front panel) `on` a body without checking `cam.faces`, so it shows through when the body turns.
- Stops at the mannequin stage: egg heads, pin limbs, one blob for a body, no secondary or tertiary detail (see the quality bar).

## Quality gates (in addition to the four of diorama)

1. **Every row looked at.** `npm run contact -- <png>` lays out every direction zoomed on a flat background; open it and review each row, not only the first. The primary feature is visible in every row; front and back are distinguishable.
2. **Silhouette and value.** The silhouette alone identifies the object. `npm run contact -- <png> --gray` shows the value structure: adjacent parts must not merge into one gray (see readability reference).
3. **Quality bar.** `npm run inspect -- <png>` prints `quality` with no warnings, or the report says why a warning does not apply. The primary, secondary and tertiary details are named in the report.
4. **Consistency.** Same camera, light and world scale as the other volume assets of the project; compare side by side with one of them (`npm run contact -- <png> --with <other.png>`, plus `--zoom N` when the cells differ in size).
5. **Layout.** `inspect` reports `touchingCellEdges: []` and `empty: []`, and `pivotToContentBottom` has a small spread between rows (negative values are expected; see guide 01).

## Reporting

Report the facings chosen and why, the gates you ran with their results, and anything you could not verify (for example how it reads in motion when the asset is static).
