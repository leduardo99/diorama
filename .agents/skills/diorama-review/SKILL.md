---
name: diorama-review
description: Verify Diorama outputs before delivery — the verification ladder, the numeric inspect command, contact sheets of every facing and frame, motion checks, the quality bar, readability and motion references, and the viewer (Assets with its Details window, Playground, Customize, Scenery, Export). Use after an export, when a volume or rig asset must be judged, or when the user asks to see or review assets.
---

# Reviewing assets in Diorama

This skill covers how to check what was produced: volume props, scenery, effects, icons and HUD pieces, and rig characters with their equipment. It does not cover writing asset code (see `diorama`, `diorama-volume`, `diorama-rig`, `diorama-kits`) or installing the environment (see `diorama-setup`). It owns three references, the criteria of every review:

- [quality bar](references/quality-bar.md): the floor every style clears, and the defaults `inspect` measures;
- [readability](references/readability.md): silhouette, value contrast, proportions for the camera;
- [motion](references/motion.md): loops, timing, strong moves, locomotion.

## Verification ladder

Go up the ladder only as far as the change needs. Each step is cheaper than the next.

1. **Compiles.** `npm run check -- <project>` reports no type errors, no layout errors and no determinism problems in the project (code in `src/`, thin sheets in `sheets/`, no `Math.random`, clock or raw colors outside `src/theme.ts`; see the layout and the rejection rules in `diorama`).
2. **Exported.** `npm run --silent export -- <project> <subpath> --json` exits with code 0 (it type checks first and exports nothing while the project has a type error; an export made with `--force` is an experiment, not a delivery), and each output has a path that exists in `assets/`. After a full export, `npm run check -- <project> --strict` is clean: every sheet has its export and no asset is left without its sheet.
3. **Measured.** `npm run inspect -- <output.png> --json` returns numbers that match what the asset should be (see below).
4. **Looked at.** Make a contact sheet (`npm run contact -- <output.png>`) and open it with the image viewer (the `Read` tool, using the absolute path it prints). Judge form, color and style against `STYLE.md`, in every row and every frame.
5. **In context.** Open the viewer to see a character or a prop move from its exported atlas (Playground), a scene laid out the way a game would (Scenery), or an outfit on a body (Customize). Only when the change needs it. For a game, `diorama-game`.

Do not skip step 3 for sprites. A sprite can look right and still be clipped, have an empty facing, or fail the quality bar.

## Reading `inspect`

Every report has `file`, `width` and `height`, and these fields:

| Field | What it means | What to check |
| :--- | :--- | :--- |
| `opaqueBounds` | Smallest rectangle that contains every pixel with alpha > 0 | For a sprite, leave a margin: the content should not fill the whole canvas unless it is a full-bleed background. |
| `reachesEdges` | Which sides of the canvas the content touches | A sprite that reaches an edge is probably clipped. A floor tile or a nine-slice is expected to reach its edges. |
| `transparentShare` | Fraction of fully transparent pixels | A full-canvas opaque sprite is almost always wrong. |
| `distinctOpaqueColors` | Count of distinct colors among opaque pixels | A shaded asset uses many. A very low count on an asset that should be shaded means flat fills (and is expected of a flat style). |

`inspect` reads PNG files only, with 8-bit RGB or RGBA. For a JPEG output, use the image viewer and skip this step.

Four more blocks appear in the `--json` report when they apply: `cells` for a sheet with an atlas, `quality` for any image with enough opaque pixels, and `motion` and `character` for sheets exported with `defineCharacter`. Without `--json` they print as the `cells:`, `quality:`, `motion:` and `character:` / `controls:` lines, with a ⚠ before each warning and each missing sheet.

| Block | Fields | What to check |
| :--- | :--- | :--- |
| `quality` | `valueSpread`, `toneLevels`, `inkShare`, `accentShare`, `warnings` | Every warning is fixed, or the report says why it does not apply (a style that differs on purpose says so in `STYLE.md`; see "Differing on purpose" in the quality bar). Floor tiles are judged on a calmer range, interface sheets on line weight only. |
| `motion` | `boneDrift`, `footSlide`, `lowestFoot`, `lowestJoint`, `loopGap`, `warnings`, `loop`, `hint` | Character sheets only. `warnings` is empty, and a cycle shows `loop: true` with a closed `loopGap`. A `hint` names a likely forgotten `loop: true`. See rig guide 02. |
| `character` | `name`, `key`, `action`, `clips`, `controls`, `warnings`, `missingSheets` | Characters defined with `defineCharacter`. `controls` is what the playground binds to keys. Every `missingSheets` entry is a clip whose sheet was not exported yet. |

## Strips and direction sheets

When the PNG has a companion atlas JSON (animation strips, direction sheets), `inspect` also checks every cell on its own and adds a `cells` block:

| Field | What to check |
| :--- | :--- |
| `count` | The number of cells: facings × frames. |
| `touchingCellEdges` | Must be empty for sprites. A cell that touches its border is clipped in that frame or direction, even when the whole image looks fine. |
| `empty` | Must be empty. An empty cell is a facing or frame that drew nothing. |
| `pivotToContentBottom` | Pixels from the lowest opaque pixel of each cell up to the declared pivot. Negative values mean content below the pivot, which is normal (the footprint's front edge and contact shadows extend towards the camera). A wide spread between cells means the object drifts against its anchor. |
| `heightAbovePivot`, `depthReach` | Scenery sheets whose catalog entry has a `height` (props, walls, fences): per row, the typical height of the cells above their pivot in export pixels (`measured`) against the nominal height (`expected`, from `height` and the space profile), and how far a piece may reach north in depth. The text report prints `height above pivot (px, typical vs nominal)` and an `off scale` quality warning when `measured` is under 0.85 times `expected`, or over 1.4 times it once `depthReach` is allowed for: resize the piece or correct its `height`. |

Then make a review sheet with `npm run contact -- <file.png>`: it lays every cell out zoomed on a flat background (one row per direction, or a grid when each direction has one frame) and writes it to `projects/<project>/review/contact/`, at the asset's path with a `-contact` suffix (`assets/props/crate.png` gives `review/contact/props/crate-contact.png`), never into `assets/`. Add `--gray` for the value test, `--bg <hex>` to match the game's floor (six hex digits: write `--bg 6e6a64` or quote it, `--bg "#6e6a64"`, because an unquoted `#` starts a shell comment), `--zoom N` to override the automatic zoom (at least 2×, reduced only to keep the sheet under about 4000 px). Zoom into what moves with `--rows W,SW` (direction names) and `--frames 0-3` (or `0,2,5`); each subset gets its own file name, so runs never overwrite each other.

Then look at the sheet itself: review **every row** of a direction sheet, not only the first. For each facing check that the primary feature is visible, front and back are distinguishable, and the light falls on the same side as in the other assets of the project. For animation, compare consecutive frames for pops and the last frame against the first for the loop seam. Crop and zoom the parts that move, and compare before and after side by side when you change something (next paragraph). Measure what you claim fixed: a number from `inspect` or a zoomed side-by-side per direction, not a glance at the whole sheet.

To compare two sheets, add `--with <b.png>`: `npm run contact -- <a.png> --with <b.png>` draws the same rows and frames of `b.png` as a second band directly below `a.png`, separated by a 2 px line, with the cells in the same columns, so frame 3 of one sits under frame 3 of the other. `--rows`, `--frames`, `--zoom`, `--gray` and `--bg` apply to both bands. Without `--rows`, the second sheet shows the directions of the first, in its order (it fails and names the way out if it lacks one). Use it for:

- **Before and after a change.** The export overwrites `assets/`, so copy the PNG and its JSON aside first (into `projects/<project>/review/before/`, which is scratch), export, and compare the copy with the new sheet.
- **One character against another, or an asset against a finished one of the project.** Check scale, light and finish.

Both sheets need the same cell size, or the command fails and says so. Pass `--zoom N` to stack them anyway: each band then keeps its own cell size, left-aligned. The file is named `<a>-vs-<b>-contact...png` (with the folder of `b` in the name when it is not the folder of `a`).

## Reviewing by kind of asset

- **Props and equipment pieces.** Every row of the contact sheet, then `--gray`. The silhouette identifies the object in every facing, and the pivot spread between rows is small.
- **Scenery pieces.** `npm run scenery-test -- <project> <piece>` renders the piece through every join it has (floor patches and saddles, wall loops, L, T and cross, a lone post) next to a scale figure, into `review/scenery-tests/`; add `--field` for a floor alone to judge repetition at 1×, and `--on <floor>` for what it stands on. Look at 1× first, then zoom with `contact --zoom 3`. Tiles are exact pixels and seamless.
- **Scenes and navigation.** Open the Scenery tab, load or paint the scene, and check the joins, the sorting of walls and props against each other, the scale against the figure, and the navigation overlay (the route button: red cells block, amber is slow, thick lines are blocked edges, green is a door that lets through).
- **Living scenery.** A transition clip starts on the `from` state's still and ends on the `to` state's (volume guide 05); compare the clip's first and last frames with the state sheets. Try it in the Playground: pick the scene, walk to the piece and press E.
- **Characters.** The `motion` and `character` blocks, every row and frame of each clip, then the Playground. For attacks check the beat in the strip (anticipation, hold, strike over 2 to 3 frames, one smear, extreme hold, settle); for deaths, that the last frame lies flat in every row; for skills, that the effect starts at `release` from its socket; for other actions, that the pose reads and the event sits where the game reacts.
- **Equipment and outfits.** The Customize tab dresses a character with the kit and previews it live; swap each slot, and check that a piece does not show through the body when it turns. The kit's parts are the generated sheets in `sheets/gear/`, exported to `assets/gear/`.
- **Effects.** The effect's Details window in the Assets tab (its size ring, and the flight of a projectile), then the character that cues it in the Playground.
- **Item icons and HUD.** The Details window of an icon is an inventory: every icon fills its square the same way and reads at 1×. A nine-slice stretches cleanly (try three sizes), a bar reads at every value with its cap, and the font sets "1234" and "-56" evenly.
- **Atlas JSON.** Outputs a game reads are data too: open the `.json` next to a PNG and check `meta.pivot`, `meta.directions`, `meta.data.role`, the frame names, and for a character the manifest (`meta.data.character`); for a scene its `layout` and `navigation`. Rig guide 04 lists every field.

## The viewer

`npm run view` starts the dev server and serves the viewer at `http://localhost:5173` (it is always that port; if the user already runs it, use theirs). It lists your projects, the folders of `projects/`, with their sources and their exported `assets/`; the samples in `examples/` are not listed until `npm run example` copies one in. It never reads `review/`, where contact sheets, scenery tests and mockups are written. The interface is in English or Brazilian Portuguese (the language switch in the header), and `?` opens a window with the keys of every page. A character has one name everywhere, its `label`, with its folder as secondary text.

Each project page has four tabs:

- **Assets.** Every exported sheet, filterable by kind (characters, gear, scenery, props, effects, icons, interface). Its **Details window** plays anything animated (Space plays and pauses, the arrows step frames, ↑ ↓ and 1–8 turn the facing, `[` and `]` move through a character's clips or through the list, + − 0 zoom, B changes the background between light, dark and checker, P and G toggle the pivot and frame-edge guides) and shows the clip's events, its frames and the atlas data. An effect, an item icon and an interface piece have bodies of their own (a size ring and a flight, an inventory of slots, a stretchable nine-slice). The project bar counts the sheets not exported yet, and a banner says when a source is newer than its export.
- **Playground.** Characters and props play from their exported atlases. WASD or the arrows move, Shift runs, Space and 1 to 9 trigger the character's actions in order, H is a hit, K a death, R resets, E uses the nearest door, lever or chest, `[` and `]` switch character, `/` searches the palette, and the palette places props and characters in the scene (the right button or Backspace removes, Esc stops placing). The toolbar shows or hides the shadow, anchor, bounds, sockets, step events and navigation, fits the view (a chosen scene opens fitted) and sets the speed (1×, ¼×, ⅒×, Pause; a badge shows when it is not 1×). Effects start at their sockets on the clip's events, and a chosen scene becomes the world: the character slides along walls and stops at shut doors. The HUD, "Now playing", names the strides (`step:<leg>`) only with "Step events" on.
- **Customize.** The gear kit's customizer: dress a character by slot, swap and take off gear, undo and redo, and save the outfit as a new character (`new-outfit-character`).
- **Scenery.** The scene painter for the project's scenery kit: floors, walls, fences, doors, props and scale figures, with the navigation overlay, saved as scenes (`new-scene`).

**Export.** The project bar's Export button and the New dialog's Export tab run the same export as `npm run export` (the whole project or a folder of sheets), and show the type errors that stop it. A banner and the pending-exports window export what is stale or missing, which is exactly what `--changed` exports.

The viewer has no controls for the space profile (genre or character height): those are `new-project` options or a hand-written `src/space.ts`.

Leave the server running while you work. Stop it with Ctrl+C when you are done, but only a server you started.

## Browser access

To see the viewer, use a browser tool that your harness provides. Navigate to the URL above, take a screenshot, and judge it.

Browser panes can be slow: they may advance animation at about 2 frames per second, lag in screenshots, or refuse a localhost server that the agent started. Do not judge motion from them. Use the `motion` block of `inspect`, the contact sheet of the frames (`--frames`, `--rows`), and the Playground's time scale at ⅒× or Pause. If the pane does not open the page, do not work around it: say so, and rely on steps 1 to 4 of the ladder.

Do not change files in `assets/` by hand: the export regenerates them, and `review/` is scratch that is safe to delete.

## Mockups

A mockup is an export with `--mockup`. It renders with `context.preview = true` into `projects/<project>/review/mockups/` (at the sheet's path), so it can show sample labels or placeholder content. The official `assets/` folder and any external `outDir` are never touched by mockups.

Review a mockup with the image viewer, using the path the export prints. Mockups are not listed in the viewer. Delete a mockup folder when it is no longer needed. It is regenerated on the next run.

## Reporting

When you finish a review, report the ladder steps you ran and their results, in that order. A step you did not run must be reported as not run, with the reason. Name what still needs to be judged in motion, in the game, at speed.
