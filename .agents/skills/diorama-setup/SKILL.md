---
name: diorama-setup
description: Prepare a Diorama checkout to run tests, the viewer and asset exports, and walk through the first prop and the first character. Use when the environment is new, when `npm run doctor` fails, or after cloning or copying the repository.
---

# Diorama setup

This skill prepares the environment, checks that it works, and shows the shortest path to a first prop and a first character. For producing assets after that, use the `diorama` skill; for checking what was produced, `diorama-review`.

## 1. Check the environment

Run:

```bash
npm run doctor
```

It checks the Node.js version, the installed dependencies, the headless Chromium used by the exporter, and `tsconfig.json`. Each failure prints the command that fixes it. Go to the next step only when it prints `Environment is ready.`

## 2. Install

Requires Node.js 22 or newer.

```bash
npm install
npx playwright install chromium
```

`npm install` uses the committed `package-lock.json`. Do not run `npm update` as part of setup, because it changes the locked versions.

## 3. Verify

Run the checks in this order. Each one must pass before moving on.

```bash
npm test
npx tsc --noEmit -p tsconfig.json
```

- `npm test` runs every suite under `tests/`: the engine (`tests/engine/`: core, volume, rig and the dependency boundaries of [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)), the documentation (`tests/docs/`: the snippets of the skills and guides compile, and every link and path they name exists), the runtime (`tests/runtime/`: `@diorama/runtime` on synthetic sheets and on fixtures cut from the sample's export, and its conformance traces), the viewer's logic (`tests/viewer/`) and the commands (`tests/cli/`). The command checks create temporary projects under `projects/`, export them through Chromium, and remove them afterwards. A passing run therefore confirms that the exporter and the review commands render.
- The `tsc` command reports errors from every folder it covers, including `projects/` and `examples/`. Errors in `core/`, `tools/`, `templates/` and `viewer/` mean the setup is broken. Errors in `projects/` are not caused by setup and are not blocking.

## 4. Open the viewer

```bash
npm run view
```

Then open `http://localhost:5173`. On Windows, `dev.bat` starts the same server and opens the browser; on macOS and Linux, `sh dev.sh` does the same. Soulkeeper, the sample game (`examples/soulkeeper`), ships with Diorama, but the viewer shows only your projects, those of `projects/`: with none, it opens on a page that offers "New project" and "Try the sample". Run `npm run example` once (or press "Try the sample"): it copies the sample to `projects/soulkeeper` and exports its 163 sheets there (about 45 seconds on four performance cores; exports are never versioned, so a fresh clone has none). Then open the project soulkeeper, its Playground tab to see characters move and its Scenery tab to see scenes; the test bench of `@diorama/phaser`, `http://localhost:5173/packages/phaser/demo/?project=soulkeeper`, plays its characters in Phaser. The `diorama-review` skill explains what to look at.

## 5. First prop

Create a project (it gets `src/theme.ts` with the camera and the volume materials, an empty `sheets/` and a `.gitignore` for `review/`), then a prop with four facings:

```bash
npm run new-project -- my-game --style
npm run new-asset -- my-game props/crate --engine volume --directions 4
```

`new-asset` wrote two files: the drawing in `projects/my-game/src/props/crate.ts` and its sheet in `projects/my-game/sheets/props/crate.ts`, which only re-exports it (the layout of [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md): `src/` is code, `sheets/` is what gets exported). The template of `src/props/crate.ts` already places the camera at the pivot and declares `frame`, the local frame turned by `facing`; it leaves the stage empty. Replace the comment before `stage.draw(ctx)` with one `stage.object()` holding the volume, using a material from `VOLUMES` in `src/theme.ts`:

```
const crate = stage.object();
crate.add(Solid.box(frame, 40, 30, 26), VOLUMES.wood);
```

Import `Solid` from `@core/volume` (next to `Frame3`, `Stage` and `vec3`) and `VOLUMES` from `../theme` (next to `CAMERA`). The accent material is for the one focal detail, not for a whole body. This is only the blockout; guides 01 to 03 of `@core/volume` and the `diorama-volume` skill tell how to make it a finished prop. Then run the loop:

```bash
npm run check -- my-game
npm run --silent export -- my-game props/crate --json
npm run inspect -- projects/my-game/assets/props/crate.png
npm run contact -- projects/my-game/assets/props/crate.png
```

`check` runs the type check, then the layout rules, then the determinism lint (no `Math.random`, no clock, no raw colors outside `src/theme.ts`); `npm run layout -- my-game --strict` after an export also confirms every sheet is exported. The export type checks the project first and writes nothing while it has a type error. Open the contact sheet (it is written to `projects/my-game/review/contact/props/crate-contact.png`; the path is printed) and look at every row. In the viewer, the prop is in the project's Assets tab and, being a prop, in the Playground's palette.

## 6. First character

A character is written once, in `src/characters/<id>/character.ts`, and each of its clips is a one-line sheet in `sheets/characters/<id>/`. The first clip creates the character:

```bash
npm run new-asset -- my-game characters/hero/walk --engine rig --skeleton humanoid
npm run new-asset -- my-game characters/hero/idle --engine rig
```

The first command writes `src/characters/hero/character.ts` (`defineCharacter`, with a mannequin skin to replace) and the sheet `sheets/characters/hero/walk.ts`. The second writes `sheets/characters/hero/idle.ts` and prints the line to add to `clips` in `character.ts`. Add it, then:

```bash
npm run check -- my-game
npm run --silent export -- my-game characters/hero/ --json
npm run inspect -- projects/my-game/assets/characters/hero/walk.png
npm run contact -- projects/my-game/assets/characters/hero/walk.png
```

`inspect` prints `motion: clean · loops (gap 0)` and a `character:` summary for the walk. Open the Playground tab of `my-game` to walk the character with WASD. The mannequin skin is a blockout: the `diorama-rig` skill covers the body plan, the other clips and the skin that has to replace it before the character ships.

## Troubleshooting

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| `doctor` says Chromium is missing | `npx playwright install chromium` was not run, or the browser cache is elsewhere | Run the install command. To use a different browser cache, set `PLAYWRIGHT_BROWSERS_PATH` before installing. |
| `npm run export` fails before writing a file | Chromium is missing | Run `npm run doctor` first, then the install command. The exporter does not need port 5173: it reuses a running viewer or starts its own server. |
| `npm test` fails in `tests/docs/docs.test.ts` | A guide or skill has a fenced `ts` block that is too long or does not compile, a link that points nowhere, or a backticked path that does not exist | Fix the block, the link or the path. Do not add `docs:allow-long` to hide a block. |
| `npm test` fails in `tests/engine/boundary.test.ts` | An import crosses a boundary of the architecture (for example `volume` importing `rig`, or the viewer reaching into `core/`) | Move the code to the side of the arrow it belongs to; the message names the file and the import. |
| `npm run check -- <project>` fails after the type check | The project breaks a layout rule (a file at the root, an underscore, a sheet with drawing code...) or a determinism rule (`Math.random`, `Date`, a raw `#hex` color outside `src/theme.ts`) | Do what the message says; it names the file (and the line) and where to move it or what to use instead. |
| `npm run export` stops with "type error(s), so nothing was exported" | The project's code does not type check | Fix the errors it lists (`npm run check -- <project>` shows them too). `--force` exports anyway, for experiments only. |
| `npm run docs:api` changes files in `docs/api/` after setup | The API changed in source, and the generated reference was not updated | Commit the regenerated files. They are generated and must not be edited by hand. |

## Rules for this skill

- Do not install packages outside `package.json`. If a package is needed, add it to the file and reinstall.
- Do not edit `package-lock.json` by hand.
- Do not change files in `projects/` while setting up, apart from the first prop and first character of a project the user asked for. Setup otherwise only reads them.
