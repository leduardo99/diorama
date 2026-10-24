---
name: diorama
description: Create, modify, check and export programmatic 2.5D game assets with Diorama — props, scenery kits, effects, item icons and HUD pieces with `@core/volume`, animated characters, gear and outfits with `@core/rig`. Use for asset code, projects and the export pipeline; it routes to diorama-volume, diorama-rig, diorama-setup and diorama-review.
---

# Diorama

This skill defines the production policy for the assets this repository builds: 2.5D art drawn with code in one shared camera and light, exported as PNG sheets with an atlas JSON that a game can play. It does not teach the API. The API is documented per module (see Routing), and the guides explain when to use each module.

Pick the skill for the job, and read this one first:

| The job | Skill |
| :--- | :--- |
| A new checkout, `npm run doctor` fails, nothing runs yet | `diorama-setup` |
| Props, scenery kits and scenes, effects, item icons, HUD pieces, armor and weapons as parts | `diorama-volume` |
| Characters and creatures with a skeleton: clips, skins, gear and outfits | `diorama-rig` |
| Checking an export, reviewing sheets, the viewer's Playground | `diorama-review` |

## Where things go

A project is one folder: `projects/<project>/` (yours; Diorama does not version it) or `examples/<project>/`, versioned with Diorama: Soulkeeper, the sample game (`examples/soulkeeper`). Commands and the viewer find a project by name, `projects/` first, then `examples/`; `projects/<name>` or `examples/<name>` picks one. Inside it there are four places, and nothing else at the root but `STYLE.md`, an optional `README.md`, `diorama.config.json` and `.gitignore`:

| Place | It holds | You write it |
| :--- | :--- | :--- |
| `src/` | The code: `theme.ts`, `space.ts`, `characters/`, the kits (`gear/`, `scenery/`, `vfx/`, `items/`), `scenes/`, `ui/`. Nothing here is exported by itself. | Yes |
| `sheets/` | One thin file per exported sheet. It imports the asset from `src/` and exports it: `export { crate as default } from '../../src/props/crate';`. | Hand-written ones, yes. `gear/`, `scenery/`, `vfx/` and `icons/` are generated. |
| `assets/` | The exported PNG and atlas JSON, at the same path as their sheet. | Never: `npm run export` writes it. |
| `review/` | Contact sheets (`contact/`), scenery tests (`scenery-tests/`), mockups (`mockups/`) and scratch. | Never versioned; delete it any time. |
| `game/` | Optional: a game that plays the exports with `@diorama/runtime` and `@diorama/phaser` (code and data only; its images come from `assets/`). | Yes, when the project is a game (`npm run game -- <project>` serves it). |

The rules the layout check enforces (the eight of [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)):

- **No underscores.** Everything in `src/` is a module and everything in `sheets/` is a sheet. A helper, a catalog or data is a plain file in `src/` (`src/scenery/catalog.ts`, `src/scenery/util.ts`).
- **Kebab-case names**, one concept per file (markdown notes in `src/`, like `README.md`, may use capitals). A kit folder with a `catalog.ts` also has an `index.ts`: `catalog.ts` is what editors read, `index.ts` is what other code imports.
- **Thin sheets.** Drawing code lives in `src/`; a sheet declares no function or class. `new-asset` writes both files for you. A character lives once in `src/characters/<id>/character.ts`, and each clip is a one-line sheet `sheets/characters/<id>/<clip>.ts`.
- **Generated sheets** are written by their command from a kit's catalog and are never edited: `sheets/gear/` (`gear-items`), `sheets/scenery/` (`scenery-items`), `sheets/vfx/` (`vfx-items`) and `sheets/icons/` (`item-icons`). To change one, change `src/<kit>/catalog.ts` and run the command with `--force`.
- **One direction.** `src/` never imports `sheets/`, and a sheet never imports another sheet.
- **Mirrors.** Every sheet has its export in `assets/` at the same path, and every asset has its sheet.
- **A game is apart.** Everything `game/` imports or loads is a relative path inside `game/` or one of `@diorama/runtime`, `@diorama/phaser`, `@diorama/phaser/sheets` and `phaser` (never `@core`, `../src` or a root path); `src/` and `sheets/` never import a game, and it holds no images: it reads `assets/` through the packages.

`npm run check -- <project>` runs the type check, then these rules, then the determinism lint (`Math.random`, the clock and raw colors outside `src/theme.ts`, see Rejection rules), and every message says what to move where or what to use instead. After an export run `npm run layout -- <project> --strict`, which also fails on a sheet that was never exported and on an asset that has no sheet. To see a finished project in this layout, `npm run example` exports Soulkeeper, the sample game (`examples/soulkeeper`; about 45 seconds on four performance cores; `assets/` is not versioned, so a fresh clone has none), and the skills point to its `src/` for technique.

## Authority

1. **User prompt**: the requested asset, scope, or explicit request for ideation.
2. **`<project>/src/theme.ts`**: palette colors, ramps, stroke presets, shape styles, the camera and the volume materials.
3. **`<project>/STYLE.md`** (optional): when it exists, it is the style that the theme implements, or the specifications the theme cannot express. See the two flows below.
4. **This document**: universal production rules and quality gates.
5. **Module guides and API reference**: consulted for the module you are using.

### Two flows

- **Style first.** The style is defined before the theme. Write `STYLE.md` (`new-project --style`), then build `src/theme.ts` from it.
- **Theme first.** The theme exists before anything else. `STYLE.md` is optional here, and when it exists it holds only a summary of the theme plus what the theme cannot express: resolution rules, edge treatment, layering, motion and the reference sizes.

Most projects use the theme-first flow. Do not write `STYLE.md` only to have one. The exception is the reference sizes (character height, door height, grid size): every asset of a project uses the same world scale, so `diorama-volume` has you create the file when it is missing.

## Routing

Read the guide for a module before using it (the [guides index](../../../docs/guides/README.md) lists them all). Read its API file to get exact signatures. Do not rely on memory for signatures.

| Need | Guide | API reference |
| :--- | :--- | :--- |
| World axes, the camera, light, facings, pivot, the sheet layout (`@core/volume`) | [volume 01](../../../docs/guides/volume/01-space-camera-and-facings.md) and the `diorama-volume` skill | [volume](../../../docs/api/volume.md) |
| Choosing solids, round volumes, tubes and decals; how the stage sorts | [volume 02](../../../docs/guides/volume/02-volumes-and-stage.md) | [volume](../../../docs/api/volume.md) |
| Props, scenery pieces, armor and equipment | [volume 03](../../../docs/guides/volume/03-props-scenery-and-armor.md) | [volume](../../../docs/api/volume.md) |
| The game's space profile, scenery kits, floors, walls and fences that connect, scenes as data, tile sets | [volume 04](../../../docs/guides/volume/04-scenery-kits.md) | [volume](../../../docs/api/volume.md) |
| Living scenery: states and clips, doors on cell edges, navigation | [volume 05](../../../docs/guides/volume/05-living-scenery.md) | [volume](../../../docs/api/volume.md) |
| Effects cued on character events, items and inventory icons, the HUD | [volume 06](../../../docs/guides/volume/06-effects-items-and-hud.md) | [volume](../../../docs/api/volume.md), [rig](../../../docs/api/rig.md), [core](../../../docs/api/core.md) |
| Characters and creatures: skeletons, gaits, clips, skins (`@core/rig`) | [rig 01](../../../docs/guides/rig/01-skeletons-and-creatures.md), [02](../../../docs/guides/rig/02-gaits-and-clips.md), [03](../../../docs/guides/rig/03-skins-and-character-assets.md) and the `diorama-rig` skill | [rig](../../../docs/api/rig.md) |
| Playing exported characters: manifest, controls, events, sockets (for games and the viewer's Playground) | [rig 04](../../../docs/guides/rig/04-atlas-contract.md) | — |
| Armor, weapons and garments as parts; outfits and variants | [rig 05](../../../docs/guides/rig/05-gear-and-outfits.md) | [rig](../../../docs/api/rig.md) |
| The drawing layer under every volume, effect and HUD piece: geometry, paths, styles, textures (`@core/draw`) | [draw README](../../../core/draw/README.md) | [draw-geometry](../../../docs/api/draw-geometry.md), [draw-paths](../../../docs/api/draw-paths.md), [draw-styles](../../../docs/api/draw-styles.md), [draw-textures](../../../docs/api/draw-textures.md) |
| Asset contract, PRNG, noise, colors, sheet packing, interface assets (`@core`) | — | [core](../../../docs/api/core.md) |

## Engine selection

- `@core/volume`: 2.5D volumes in the project's 3/4 camera: props, scenery kits and scenes, armor, effects, item icons, optionally rendered in several facings (`directions`). Parts are `@core/draw` shapes, so the theme's ramps, strokes and textures apply. Export at `scale: 2`.
- `@core/rig`: skeletons, gaits and clips for characters and creatures, exported in 8 facings (4 for grid-only characters) with a manifest for games and the viewer's Playground (`new-asset --engine rig`). Skins, gear and outfits are drawn with `@core/volume`.
- `@core/draw`: the drawing layer (`Polygon`, `Path`, `PathBuilder`, styles, hatch, stipple, grit). Volume and rig call it for you. You use it directly for decals, effects and the HUD in `core/ui.ts` (nine-slice panels, bars, bitmap fonts, cursors).
- `@core`: the asset contract, deterministic PRNG, noise, colors, sheet packing.

Sizes are logical. The exported image is `width × scale` (per frame, for animations). `width: 96, scale: 2` exports 192 px. Assets are declared with `defineAsset` from `@core`, or with the module's own declaration: `defineCharacter` from `@core/rig`, and `defineSceneAsset`, `defineTileSet`, `defineEffect`, `defineItemIcon`, `defineGearAsset` and the interface helpers for kits (see the guides).

For facings, set `directions` (volume assets, and characters through `defineCharacter`): each direction is a row, `render` receives `facing`, and the atlas JSON lists `meta.directions` and frames named `<direction>_<frame>`. Declare `pivot` (where the object meets the ground) so engines anchor every cell at the same point.

For animation, set `frames` (and `fps`). The export writes a horizontal strip of the frames and an atlas JSON with `frame_0..frame_N`. Optional `animations` names ranges of frames, for example `{ idle: [0, 1, 2, 3] }`; the atlas JSON lists them under `meta.animations`. Use `new-asset ... --frames N --fps N` to start from a strip.

`defineAsset` takes `width`, `height`, `scale`, optional `frames`/`fps`/`animations`/`directions`/`pivot`, and a `render(context)` function that receives `ctx` and `frameIndex`/`frameCount`. The engine creates the canvas. Do not create canvases yourself. Optional `data` is written to the atlas JSON as `meta.data`: set `data: { role: 'prop' }` on props so a game and the viewer can tell what the asset is. The declarations of characters and kits write their own role (`character`, `gear`, `vfx`, `icon`, `ui`, `scene`, and for scenery `tile` on floors and the piece's group on the rest). The types are in [`core/asset.ts`](../../../core/asset.ts).

---

## Rejection rules

Reject or rewrite code that violates these rules:

- **Project isolation.** Work only inside `projects/<project>/`. Do not read or borrow code from other `projects/*` directories unless the user asks. The one exception is the worked examples a module skill names, all in the `src/` of Soulkeeper, the sample game (`examples/soulkeeper/src/`): `diorama-rig` names `characters/`, `diorama-volume` names `scenery/`, `gear/`, `items/` and `ui/`. Read them for technique, never copy their art or tokens.
- **Deterministic.** The same source exports the same pixels. No `Math.random`, no `Date`, no wall-clock time, no network or file reads at render time. Variation comes from `createRng(seed)` per part, and noise from `createNoise2D(seed)`. `npm run check` reports `Math.random`, `createRng()` without a seed, `new Date`, `Date()`, `Date.now` and `performance.now` in `src/` and `sheets/` with the file and line.
- **No other graphics stacks.** Raw Canvas2D cascades, raw SVG, Rough.js and HTML/CSS layouts are not allowed in asset files. Draw with `@core/volume`, `@core/rig` and the `@core/draw` builders, which the engine rasterizes.
- **No hardcoded geometry arrays.** Build geometry with `Polygon`, `Path`, `PathBuilder`, transforms, anchors and booleans. No hand-concatenated or hand-transformed raw point arrays for whole objects. Short literal point lists passed to `Polygon.fromPoints` or `Path.spline` for small shapes (a blade profile, a tear, a groove) are allowed.
- **No hardcoded styling.** Compose `src/theme.ts` tokens, ramps, `VOLUMES.*` materials and stroke presets. No stray `#hex` values or renderer settings in asset files. `npm run check` reports every `#hex`, `rgb()`/`rgba()` and `hsl()`/`hsla()` literal outside `src/theme.ts` (the one file that holds the palette) with the file and line.
- **Rotate parts with a pivot.** The `rotation` option of a shape built from free points turns it around the origin, not around the shape. Build the part, then `.rotate(degrees, pivot)`.
- **No fake organic shapes.** For organic forms (terrain, vines, clouds, creatures) build continuous contours, not clusters of circles.
- **No leaking details.** Interior marks, highlights and textures stay inside their host (`inside` callback or a texture on that shape).
- **No baked text.** Official game assets contain no rendered text, labels or numbers, except the glyphs of a bitmap font. Preview text is allowed only when the user asks for it, and must be removed or guarded with `if (context.preview)` before the official export.
- **Keep the layout.** Drawing code, helpers, catalogs and scene data are plain kebab-case files in `src/`; `sheets/` holds only thin sheets (no underscore prefixes anywhere). Never put code in a sheet, never import a sheet from `src/`, and never edit a generated sheet or anything in `assets/` or `review/`. `npm run check -- <project>` reports every break and where to move it.

## Quality gates

Every asset is checked against these four criteria before it is delivered:

1. **Theme adherence.** Uses the project's palette, ramps, materials and stroke presets, and matches the art direction in `STYLE.md`.
2. **Form articulation.** Distinct parts (blade, guard, hilt; body, eyes; surface, bevel) are visually separated. No flat monochrome blobs.
3. **Production maturity.** Reads as finished game art, not a wireframe, debug graphic or placeholder.
4. **Technical integrity.** Compiles, exports cleanly at the engine's scale, produces no console errors, has no unintended clipping, and contains no baked typography. The `inspect` command reports the numbers for this gate (see `diorama-review`).

On top of them, volume and rig assets have their own gates: every facing looked at in a `contact` sheet, the quality bar from `inspect`, and for characters the motion check. They are in `diorama-volume` and `diorama-rig`; an asset is not delivered before they pass.

## Review loop

Do not stop at the first export. For every asset:

1. `check`, export, `inspect` (the numbers), then `contact` (look at every row, plus `--gray` for the value test).
2. Name what is wrong in the picture, not only in the numbers: a proportion, a value, a facing that does not read, a pop between frames.
3. Change geometry, colors or layers, and run 1 again. Compare with the previous sheet using `contact --with` when the change is subtle.
4. Finish when `inspect` is clean (or each warning is explained) and every row and frame holds up. `diorama-review` describes each step.

## Ideation mode

Ideation runs only when the user asks for it (for example "let's brainstorm" or "explore variations before locking the style"). In that case draft 2 to 3 variants as `src/drafts/<draft>.ts` with a sheet `sheets/drafts/<draft>.ts` (`new-asset -- <project> drafts/<draft>`), export them as mockups with `npm run export -- <project> drafts/<draft> --mockup` (they land in `review/mockups/`, never in `assets/`), present them as contact sheets side by side, and formalize `STYLE.md` and `src/theme.ts` only after the user chooses a direction. Delete `src/drafts/` and `sheets/drafts/` once a direction is chosen. Otherwise go straight to production with the existing `STYLE.md` and `src/theme.ts`.

---

## Commands

Run commands from the repository root. Use `npm run --silent` whenever you need to parse the output, because npm otherwise prints its own banner on stdout. With `--json`, stdout holds only the JSON and the human log goes to stderr: parse stdout alone (do not merge the streams with `2>&1`). Commands that create files refuse to overwrite anything, unless the command has `--force`.

| Task | Command |
| :--- | :--- |
| Create a project | `npm run new-project -- <project> [--style] [--genre <preset>] [--character <height>]` (creates `projects/<project>/` with `src/theme.ts`, an empty `sheets/` and a `.gitignore` for `review/`. `--style` adds `STYLE.md`, only when the project is created; to add it later, copy `templates/optional/STYLE.md`. `--genre` adds `src/space.ts`, the game's space profile: grid, scale against the characters and wall placement from a preset (`jrpg`, `action-rpg`, `tactics`, `farm-sim`, `dungeon-crawler`), guide 04 of `@core/volume`) |
| Create an asset | `npm run new-asset -- <project> <subpath> --engine volume [--size 128x128] [--frames N] [--fps N] [--directions N (default 8)]` (writes the drawing in `src/<subpath>.ts` and the sheet `sheets/<subpath>.ts`; `<subpath>` is kebab-case) |
| Create a character clip | `npm run new-asset -- <project> <character-folder>/<clip> --engine rig [--skeleton humanoid\|quadruped] [--clip walk\|run\|idle\|attack\|hit\|death] [--size WxH] [--frames N] [--directions N]` (the first clip creates `src/<character-folder>/character.ts`; every clip gets `sheets/<character-folder>/<clip>.ts`; `--skeleton`, `--size`, `--frames` and `--directions` apply to the first clip only) |
| Start a kit | `npm run new-kit -- <project> scenery\|gear\|vfx\|items [--force]` (writes `src/<kit>/catalog.ts`, `index.ts` and a first piece in a family file, drawn with the theme's `VOLUMES` and sized by `src/space.ts` when the project has one: a crate prop, a helm on a mannequin character, a spark burst, a gem with two rarity tiers; refuses to overwrite a kit unless `--force`; then run the kit's generator command) |
| Check one project | `npm run check -- <project> [--strict] [--json]` (the type check, then the layout rules, then the determinism lint; `--strict` also fails on sheets without an export and assets without a sheet, the gate after an export; `--json` is for parsing) |
| Check the layout alone | `npm run layout -- <project> [--strict] [--json]` (`--strict` also fails on sheets without an export and assets without a sheet: run it after exporting) |
| Export official assets | `npm run export -- <project> [subpath] [options]` (`subpath` is a sheet under `sheets/`, without `.ts`, or a folder of them, `characters/hero/`; the project's type check runs first and a type error stops the export, `--force` skips it for experiments) |
| Export only what changed | `npm run export -- <project> [subpath] --changed` (the sheets whose image is missing or older than the sheet or a local file it imports, however deep: the ones the viewer marks as stale; the engine, `core/`, does not count) |
| Export Soulkeeper, the sample game | `npm run example` (`examples/soulkeeper`, about 45 seconds on four performance cores) |
| Export with a JSON summary | `npm run --silent export -- <project> [subpath] [options] --json` |
| Export a mockup (never overwrites official files) | `npm run export -- <project> <subpath> --mockup` |
| List projects and assets | `npm run list -- [project] [--json]` |
| Measure a PNG | `npm run inspect -- <file.png> [--json]` |
| Review sheet of a strip or direction sheet | `npm run contact -- <file.png> [--rows W,SW] [--frames 0-3] [--with <b.png>] [--gray] [--bg <hex>] [--zoom N]` (`--bg` takes six hex digits: write `--bg 6e6a64` or quote it, `--bg "#6e6a64"`, because an unquoted `#` starts a shell comment; `--with` stacks a second sheet under the first for comparison) |
| One sheet per scenery piece | `npm run scenery-items -- <project> [--force]` (from `src/scenery/catalog.ts` into `sheets/scenery/`; then export `scenery/`) |
| Test a scenery piece in every join | `npm run scenery-test -- <project> <piece> [--on <floor>\|none] [--field]` |
| Turn a saved scene into source | `npm run new-scene -- <project> <name> --scene <file.json>` (writes `src/scenes/<name>.ts` and `sheets/scenes/<name>.ts`) |
| One sheet per gear part | `npm run gear-items -- <project> [--force]` (from `src/gear/catalog.ts` into `sheets/gear/`; then export `gear/`) |
| Turn a saved outfit into a character | `npm run new-outfit-character -- <project> <name> --from <character> --outfit <file.json>` (writes `src/characters/<name>/` and the sheets of its clips) |
| One sheet per effect | `npm run vfx-items -- <project> [--force]` (from `src/vfx/catalog.ts` into `sheets/vfx/`; then export `vfx/`) |
| One sheet per item icon | `npm run item-icons -- <project> [--force]` (from `src/items/catalog.ts` into `sheets/icons/`; then export `icons/`) |
| Open the viewer | `npm run view` |
| Regenerate the API reference | `npm run docs:api` (into `docs/api/`, after changing exported symbols in `core/`) |

Export options: `--grid` or `--compact` for a sheet, `--gap <px>`, `--cols <n>`, `--sheet-name <name>`, `--both`, `--no-json`, `--scale <n>`, `--format png|jpeg`, `--out-dir <path>`, `--force` (export despite type errors), `--changed` (only what is out of date), `--jobs <n>` (sheets rendered at once; the default is one per performance core, less one, and the files are the same with any number). Values can be written as `--gap 8` or `--gap=8`. The full list is `npm run export -- --help`.

Mirroring: `--out-dir` or `outDir` in `<project>/diorama.config.json` copies official outputs to another folder. Mockups are never mirrored. The config file accepts only `outDir`, `scale`, `format`, `cols` and `gap`; `npm run check` and `npm run layout` report any other key as an error.

---

## Production workflow

1. **Project.** If the project does not exist, create it with `new-project`. A game with scenery or several characters on one map needs a space profile: ask which kind of game it is and pass the closest `--genre` preset. Read the active project's `src/theme.ts`, and `STYLE.md` if it exists.
2. **Asset.** Create the files with `new-asset`, which refuses to overwrite: the drawing goes in `src/`, the sheet in `sheets/`. Build the form with the module guides as reference, then compose the layers and apply styles. Kits (scenery, gear, effects, item icons) start from a `catalog.ts` in their `src/` folder, and a generator command writes one sheet per entry. A project without the kit starts it with `npm run new-kit -- <project> scenery|gear|vfx|items`: `catalog.ts`, `index.ts` and a first piece in a family file, a block-out to make the project's own; the next pieces go into the family files and the catalog by hand (the sample's catalogs are the full form).
3. **Check.** Run `check -- <project>`: types, then the layout, then determinism. Fix every error in the project before exporting. Errors in other projects are not yours to fix.
4. **Export.** Run the export with `--json` and read the output paths from the summary (they are in `assets/`, mirroring `sheets/`). It type checks the project first and exports nothing while there is a type error (`typeCheck: 'failed'` and `typeErrors` in the summary); fix them rather than passing `--force`, which is for experiments. After a full export, `layout -- <project> --strict` confirms every sheet is exported and no asset is orphaned.
5. **Measure.** Run `inspect` on each official output. Compare the numbers with what the asset should be: bounds, edges, cells, quality warnings, motion.
6. **Look.** Make the `contact` sheet, open it with the image viewer (see Harness notes) and review it against the quality gates. For a folder or sheet, review the sheet or two or three representative assets instead of every file.
7. **Polish.** If an asset is crude, flat or off-direction, change geometry, colors or layers, then repeat steps 3 to 6 before finishing.

Mockups are for review only (they are written to `review/mockups/`). Use `--mockup` to see sample labels or placeholder content, and remove them before the official export. Mockups are checked with the same steps, but they never go to the game.

---

## Harness notes

- To view a PNG or JPEG, use the `Read` tool with the absolute path printed by the export. Other harnesses may name the image viewer differently. Use whichever tool displays raster images.
- The export never requires a running dev server. The viewer does, and it is covered by the `diorama-review` skill.
