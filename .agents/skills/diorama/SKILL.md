---
name: diorama
description: The hub for making 2.5D game assets with Diorama — the workflow, the project layout, the rules every asset follows, the quality gates and where to go next (style, props and scenery, characters, kits, review, games). Use first for any asset work, in any kind of game or look; it routes to diorama-style, diorama-volume, diorama-rig, diorama-kits, diorama-review, diorama-game and diorama-setup.
---

# Diorama

This skill defines the workflow and the rules for the assets this repository builds: 2.5D art drawn with code in one shared camera and light, exported as PNG sheets with an atlas JSON that a game can play. Diorama is for any kind of 2.5D game and any look the project's theme can express; nothing here prescribes a genre or a style. It does not teach the API: the guides explain when to use each module and the generated reference gives the signatures (see Routing).

## Pick the skill for the job

| The job | Skill |
| :--- | :--- |
| A new checkout, `npm run doctor` fails, nothing runs yet | `diorama-setup` |
| A project starts, the user describes the game or the look, the palette, the light or the sizes change, or assets look plain (the tiers of detail) | `diorama-style` |
| Props, scenery pieces, equipment parts, effects, item icons, HUD pieces | `diorama-volume` |
| Characters and creatures with a skeleton: clips, skins, sockets | `diorama-rig` |
| Scenery, gear, effects and items as catalog-driven sets; scenes and outfits made from them | `diorama-kits` |
| Checking an export, reviewing sheets, the quality bar, the viewer | `diorama-review` |
| Playing the exports in a game, in Phaser or in another engine | `diorama-game` |

Other jobs, in short:

| The job | How |
| :--- | :--- |
| Remove an asset | The viewer's Delete moves its exports (and, if asked, its sheet) to `.diorama-trash/`, where they can be restored. By hand, delete the sheet in `sheets/` and its export in `assets/` together (a sheet without its export, or an export without its sheet, breaks the mirror rule), and the drawing in `src/` when nothing imports it. |
| Rename an asset | Move its sheet, its drawing and its export together, fix the imports, run `npm run check -- <project> --strict` after an export. |
| Learn a command's options | `npm run <command> -- --help`; the commands by job are in [references/commands.md](references/commands.md). |

## Where things go

A project is one folder, `projects/<project>/` (yours; Diorama does not version it). `examples/` holds the sample project that ships with Diorama: never create assets there, and do not borrow its code; `npm run example` copies it into `projects/` for the viewer. Commands find a project by name, `projects/` first, then `examples/`; `projects/<name>` or `examples/<name>` picks one exactly. A project has four places and nothing else at the root but `STYLE.md`, an optional `README.md`, `diorama.config.json` and `.gitignore`:

| Place | It holds | You write it |
| :--- | :--- | :--- |
| `src/` | The code: `theme.ts`, `space.ts`, `characters/`, the kits (`gear/`, `scenery/`, `vfx/`, `items/`), `scenes/`, `ui/`. Nothing here is exported by itself. | Yes |
| `sheets/` | One thin file per exported sheet. It imports the asset from `src/` and exports it: `export { crate as default } from '../../src/props/crate';`. | Hand-written ones, yes. `gear/`, `scenery/`, `vfx/` and `icons/` are generated. |
| `assets/` | The exported PNG and atlas JSON, at the same path as their sheet. | Never: `npm run export` writes it. |
| `review/` | Contact sheets (`contact/`), scenery tests (`scenery-tests/`), mockups (`mockups/`) and scratch. | Never versioned; delete it any time. |
| `game/` | Optional: a game that plays the exports (code and data only; its images come from `assets/`). | Yes, when the project is a game: `diorama-game`. |

The rules the layout check enforces are the eight of [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md#rules): four places only; no underscores; thin sheets (drawing code lives in `src/`); `src/` never imports `sheets/` and a sheet never imports a sheet; every sheet has its export and every asset its sheet; kebab-case names, one concept per file, a kit with a `catalog.ts` also has an `index.ts`; `assets/` holds only outputs; `game/` imports only the allowed packages. Generated sheets (`gear/`, `scenery/`, `vfx/`, `icons/`) are written by their command from a kit's catalog and never edited: change the catalog and run the command with `--force`.

`npm run check -- <project>` runs the type check, then these rules, then the determinism lint (`Math.random`, the clock and raw colors outside `src/theme.ts`), and every message says what to move where or what to use instead. After an export run `npm run check -- <project> --strict` (or `npm run layout -- <project> --strict`), which also fails on a sheet that was never exported and on an asset that has no sheet.

## Authority

1. **User prompt**: the requested asset, scope, or explicit request for ideation.
2. **`<project>/src/theme.ts`**: palette colors, ramps, stroke presets, shape styles, the camera and the volume materials.
3. **`<project>/STYLE.md`** (optional): the style that the theme implements, or the specifications the theme cannot express (reference sizes, accent policy, quality overrides). `diorama-style` says how to write it.
4. **This document**: universal production rules and quality gates.
5. **Module guides and API reference**: consulted for the module you are using.

The look belongs to the project. Do not borrow another project's palette or tokens, and do not write raw colors in an asset file to fix a look: change the theme.

## Routing

Read the guide for a module before using it (the [guides index](../../../docs/guides/README.md) lists them all). Read its API file to get exact signatures. Do not rely on memory for signatures.

| Need | Guide | API reference |
| :--- | :--- | :--- |
| World axes, the camera, light, facings, pivot, the sheet layout (`@core/volume`) | [volume 01](../../../docs/guides/volume/01-space-camera-and-facings.md) and the `diorama-volume` skill | [volume](../../../docs/api/volume.md) |
| Choosing solids, round volumes, tubes and decals; how the stage sorts | [volume 02](../../../docs/guides/volume/02-volumes-and-stage.md) | [volume](../../../docs/api/volume.md) |
| Props, scenery pieces, equipment | [volume 03](../../../docs/guides/volume/03-props-scenery-and-equipment.md) | [volume](../../../docs/api/volume.md) |
| The game's space profile, scenery kits, floors, walls and fences that connect, scenes as data, tile sets | [volume 04](../../../docs/guides/volume/04-scenery-kits.md) and `diorama-kits` | [volume](../../../docs/api/volume.md) |
| Living scenery: states and clips, doors on cell edges, navigation | [volume 05](../../../docs/guides/volume/05-living-scenery.md) | [volume](../../../docs/api/volume.md) |
| Effects cued on character events, items and inventory icons, the HUD | [volume 06](../../../docs/guides/volume/06-effects-items-and-hud.md) | [volume](../../../docs/api/volume.md), [rig](../../../docs/api/rig.md), [core](../../../docs/api/core.md) |
| Characters and creatures: skeletons, gaits, clips, skins (`@core/rig`) | [rig 01](../../../docs/guides/rig/01-skeletons-and-creatures.md), [02](../../../docs/guides/rig/02-gaits-and-clips.md), [03](../../../docs/guides/rig/03-skins-and-character-assets.md) and the `diorama-rig` skill | [rig](../../../docs/api/rig.md) |
| Playing exported characters: manifest, controls, events, sockets (for games and the viewer's Playground) | [rig 04](../../../docs/guides/rig/04-atlas-contract.md) and `diorama-game` | [runtime](../../../docs/api/runtime.md), [phaser](../../../docs/api/phaser.md) |
| Equipment as parts; outfits and variants | [rig 05](../../../docs/guides/rig/05-gear-and-outfits.md) and `diorama-kits` | [rig](../../../docs/api/rig.md) |
| The drawing layer under every volume, effect and HUD piece (`@core/draw`) | [draw README](../../../core/draw/README.md) | [draw-geometry](../../../docs/api/draw-geometry.md), [draw-paths](../../../docs/api/draw-paths.md), [draw-styles](../../../docs/api/draw-styles.md), [draw-textures](../../../docs/api/draw-textures.md) |
| Asset contract, PRNG, noise, colors, sheet packing, interface assets (`@core`) | — | [core](../../../docs/api/core.md) |

## Engine selection

- `@core/volume`: 2.5D volumes in the project's 3/4 camera: props, scenery and scenes, equipment parts, effects, item icons, optionally rendered in several facings (`directions`). Parts are `@core/draw` shapes, so the theme's ramps, strokes and textures apply. Their declarations default to `scale: 2`.
- `@core/rig`: skeletons, gaits and clips for characters and creatures, exported in 8 facings (4 for grid-only characters) with a manifest for games and the viewer's Playground. Skins and equipment are drawn with `@core/volume`.
- `@core/draw`: the drawing layer (`Polygon`, `Path`, `PathBuilder`, styles, hatch, stipple, grit). Volume and rig call it for you. You use it directly for decals, effects and the HUD in `core/ui.ts` (nine-slice panels, bars, bitmap fonts, cursors).
- `@core`: the asset contract, deterministic PRNG, noise, colors, sheet packing.

What the engine draws today is a tilted top-down 3/4 view on a rectangular grid. A game that needs a side view, an isometric view or a hex grid is outside it for now: say so instead of faking it.

Sizes are logical. The exported image is `width × scale` (per frame, for animations): `width: 96, scale: 2` exports 192 px. A `scale` in the project's `diorama.config.json` (or `--scale`) overrides every sheet's, and the sheet is drawn at it, never resampled: set it once there to export the whole project at one density. Assets are declared with `defineAsset` from `@core`, or with the module's own declaration (`defineCharacter`, `defineSceneAsset`, `defineTileSet`, `defineEffect`, `defineItemIcon`, `defineGearAsset` and the interface helpers; see the guides). For facings set `directions`: each direction is a row, `render` receives `facing`, and the atlas lists `meta.directions` and frames named `<direction>_<frame>`. Declare `pivot` (where the object meets the ground) so engines anchor every cell at the same point. For animation set `frames` (and `fps`): the export writes a horizontal strip and an atlas with `frame_0..frame_N`; optional `animations` names ranges of frames. `defineAsset` takes `width`, `height`, `scale`, optional `frames`, `fps`, `animations`, `directions`, `pivot`, and a `render(context)` that receives `ctx`; the engine creates the canvas, so never create one. Optional `data` is written to the atlas as `meta.data`: set `data: { role: 'prop' }` on props so a game and the viewer can tell what the asset is. The types are in [`core/asset.ts`](../../../core/asset.ts).

---

## Rejection rules

Reject or rewrite code that violates these rules:

- **Project isolation.** Work only inside `projects/<project>/`. Do not read or borrow code from other projects (`projects/*` or `examples/*`) unless the user asks, and never create assets in `examples/`.
- **Deterministic.** The same source exports the same pixels. No `Math.random`, no `Date`, no wall-clock time, no network or file reads at render time. Variation comes from `createRng(seed)` per part, and noise from `createNoise2D(seed)`. `npm run check` reports `Math.random`, `createRng()` without a seed, `new Date`, `Date()`, `Date.now` and `performance.now` in `src/` and `sheets/` with the file and line.
- **No other graphics stacks.** Raw Canvas2D cascades, raw SVG, Rough.js and HTML/CSS layouts are not allowed in asset files. Draw with `@core/volume`, `@core/rig` and the `@core/draw` builders, which the engine rasterizes.
- **No hardcoded geometry arrays.** Build geometry with `Polygon`, `Path`, `PathBuilder`, transforms, anchors and booleans. No hand-concatenated or hand-transformed raw point arrays for whole objects. Short literal point lists passed to `Polygon.fromPoints` or `Path.spline` for small shapes (a blade profile, a tear, a groove) are allowed.
- **No hardcoded styling.** Compose `src/theme.ts` tokens, ramps, `VOLUMES.*` materials and stroke presets. No stray `#hex` values or renderer settings in asset files. `npm run check` reports every `#hex`, `rgb()`/`rgba()` and `hsl()`/`hsla()` literal outside `src/theme.ts` with the file and line.
- **Rotate parts with a pivot.** The `rotation` option of a shape built from free points turns it around the origin, not around the shape. Build the part, then `.rotate(degrees, pivot)`.
- **No fake organic shapes.** For organic forms (terrain, vines, clouds, creatures) build continuous contours, not clusters of circles.
- **No leaking details.** Interior marks, highlights and textures stay inside their host (`inside` callback or a texture on that shape).
- **No baked text.** Official game assets contain no rendered text, labels or numbers, except the glyphs of a bitmap font. Preview text is allowed only when the user asks for it, and must be removed or guarded with `if (context.preview)` before the official export.
- **Keep the layout.** Drawing code, helpers, catalogs and scene data are plain kebab-case files in `src/`; `sheets/` holds only thin sheets. Never put code in a sheet, never import a sheet from `src/`, and never edit a generated sheet or anything in `assets/` or `review/`.

## Quality gates

Every asset is checked against these four criteria before it is delivered:

1. **Theme adherence.** Uses the project's palette, ramps, materials and stroke presets, and matches the art direction in `STYLE.md`.
2. **Form articulation.** Distinct parts (blade, handle, hilt; spout, lid, body; wall, window, roof) are visually separated. No flat monochrome blobs, unless the style is flat on purpose and says so.
3. **Production maturity.** Reads as finished game art, not a wireframe, debug graphic or placeholder.
4. **Technical integrity.** Compiles, exports cleanly at the engine's scale, produces no console errors, has no unintended clipping, and contains no baked typography. The `inspect` command reports the numbers for this gate.

On top of them, volume and rig assets have their own gates: every facing looked at in a `contact` sheet, the quality bar from `inspect`, and for characters the motion check. They are in `diorama-volume`, `diorama-rig` and the [quality bar](../diorama-review/references/quality-bar.md); an asset is not delivered before they pass.

## Review loop

Do not stop at the first export. For every asset:

1. `check`, export, `inspect` (the numbers), then `contact` (look at every row, plus `--gray` for the value test).
2. Name what is wrong in the picture, not only in the numbers: a proportion, a value, a facing that does not read, a pop between frames.
3. Change geometry, colors or layers, and run 1 again. Compare with the previous sheet using `contact --with` when the change is subtle.
4. Finish when `inspect` is clean (or each warning is explained) and every row and frame holds up. `diorama-review` describes each step.

## Production workflow

1. **Project.** If the project does not exist, or the user describes a new look, use `diorama-style`: it chooses the space profile, builds the theme and `STYLE.md`, and proves the look with a first prop and a first character. Otherwise read the project's `src/theme.ts` and `STYLE.md`.
2. **Asset.** Create the files with `new-asset`, which refuses to overwrite: the drawing goes in `src/`, the sheet in `sheets/`. Build the form with the module guides as reference, then compose the layers and apply styles. Sets of related pieces (scenery, gear, effects, item icons) are kits: `diorama-kits`.
3. **Check.** Run `npm run check -- <project>`: types, then the layout, then determinism. Fix every error in the project before exporting. Errors in other projects are not yours to fix.
4. **Export.** Run the export with `--json` and read the output paths from the summary (they are in `assets/`, mirroring `sheets/`). It type checks the project first and exports nothing while there is a type error; fix them rather than passing `--force`, which is for experiments. After a full export, `check -- <project> --strict` confirms every sheet is exported and no asset is orphaned.
5. **Measure.** Run `inspect` on each official output. Compare the numbers with what the asset should be: bounds, edges, cells, quality warnings, motion.
6. **Look.** Make the `contact` sheet, open it with the image viewer (see Harness notes) and review it against the quality gates. For a folder or sheet, review the sheet or two or three representative assets instead of every file.
7. **Polish.** If an asset is crude, flat or off-direction, change geometry, colors or layers, then repeat steps 3 to 6 before finishing.

Mockups are for review only (they are written to `review/mockups/`): `--mockup` shows sample labels or placeholder content and never touches `assets/`. Remove them before the official export; they never go to the game.

## Commands

[references/commands.md](references/commands.md) lists every command by job, with the flags worth knowing. Run commands from the repository root. Use `npm run --silent` whenever you need to parse the output, because npm otherwise prints its own banner on stdout; with `--json`, stdout holds only the JSON and the human log goes to stderr. Commands that create files refuse to overwrite anything, unless the command has `--force`. `npm run <command> -- --help` prints the options of one command.

## Harness notes

- To view a PNG or JPEG, use the `Read` tool with the absolute path printed by the export. Other harnesses may name the image viewer differently. Use whichever tool displays raster images.
- The export never requires a running dev server. The viewer does, and it is covered by the `diorama-review` skill. If the user already runs the viewer, use it and leave it running (`diorama-setup`).
- These skills are plain Markdown read by path; nothing loads them for you.
