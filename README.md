<p align="center">
  <img src="docs/media/banner.webp" alt="DIORAMA in amber block letters over a 2.5D scene of scenery, characters and effects exported with Diorama" width="100%">
</p>

# Diorama

2.5D game assets as code. You write props, scenery, effects, rigged characters with their gear, item icons and HUD pieces in TypeScript, and Diorama draws them in one shared camera and light and exports them as sprite sheets with an atlas JSON that a game can play. It is built to be driven by coding agents, with skills and guides that tell them how, and a viewer that lets a person look at the result.

Diorama is for any kind of 2.5D game, in any look the theme can express: cute or realistic, flat or shaded, pixel art. The look is the project's own (its `src/theme.ts`), and the engine only keeps a quality floor. When a project has a grid, give it a space profile (`npm run new-project -- <name> --genre <preset>`): a preset sets how big a cell is against a character, how tall walls and doors are and whether walls stand on cell borders or through cell centres (`jrpg`, `action-rpg`, `tactics`, `farm-sim` and `dungeon-crawler` are five such sets, and any number in them can be overridden). A game that fits none of them overrides what differs. The engine draws a tilted top-down 3/4 view on a rectangular grid today; side view, isometric and hex grids are on the [roadmap](https://github.com/users/leduardo99/projects/1).

Everything is deterministic: the same source exports the same pixels. Sheets are rasterized to PNG (or JPEG) through headless Chromium.

## What is in it

- **Props and scenery** (`@core/volume`). Objects built from solids, round volumes, tubes and decals, projected through one 3/4 camera and rendered in 1, 4 or 8 facings. Scenery kits on the game's own grid: floors with transitions, walls and fences that connect, props, decals, and scenes saved as data. Scenery is alive: pieces rest in states and play clips between them (doors, chests, levers, breakables, flames), and the sheets carry the navigation a game needs.
- **Characters and gear** (`@core/rig`). Skeletons written as data (humanoid, quadruped, spider, bird, serpent, or your own), gaits with planted feet and an exported ground speed, clips with events, sockets and root motion, exported in 8 facings with a manifest. Equipment (wearables, carried and held items) is made of reusable parts that dress characters as outfits.
- **Effects, item icons and the HUD.** Visual effects cued on character events, items and inventory icons with rarity tiers, and interface pieces: nine-slice panels and buttons, bars, bitmap fonts and cursors.
- **A drawing layer** (`@core/draw`). Geometry, paths, styles and procedural textures: what volumes, effects and the HUD are drawn with.
- **A viewer.** A local web app to browse every export, play characters and scenes, dress characters and paint scenes.
- **Skills and guides for coding agents**, so an agent can produce assets that clear a quality floor and check its own work.

## Install

Requires Node.js 22 or newer.

```bash
npm install
npx playwright install chromium
npm run doctor
npm test
```

To open the viewer: on Windows, run `dev.bat`; on macOS and Linux, run `sh dev.sh`. Any system can run `npm run view` and then open `http://localhost:5173`. With no project yet, it says what Diorama is and offers "New project" and "Try the sample".

**The sample.** Diorama ships a sample project in `examples/`, to have something to open. `npm run example` brings it in as a project of yours: it copies it to `projects/` and exports it there. The viewer shows only your projects, those of `projects/`, so the copy is what it opens and what its editors save into, and the sample in `examples/` stays as it ships. Run `npm run example` again and it keeps your copy, exporting only the sheets whose code changed (`--changed`); `npm run example -- --force` replaces the copy with a fresh one, after moving yours to the viewer's trash (`.diorama-trash/`), and prints how to get yours back. "Try the sample" on the viewer's start page runs the same command. The sample is where Diorama's own changes are proved (`npm run export:sample`, `npm run compare-exports`, `npm run check:sample`, see [AGENTS.md](AGENTS.md)); it is not material to learn from: the skills and guides are.

The characters of any project also play in Phaser on the test bench of `@diorama/phaser`, `http://localhost:5173/packages/phaser/demo/?project=<name>`. A project with a game of its own gets "Play game" in the viewer ([packages/phaser/README.md](packages/phaser/README.md)).

## How a repository and a project are laid out

Every folder has one job, written down in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and `npm run check -- <project>` enforces the project rules.

```
core/        the engine: @core, @core/draw, @core/volume, @core/rig
packages/    @diorama/runtime: plays the exported files in a game (and in the viewer's Playground);
             @diorama/phaser: the same files in Phaser 4 (its test bench in demo/)
docs/        guides (docs/guides/), the generated API reference (docs/api/), ARCHITECTURE.md
tools/       the command line and the exporter
scripts/     the doctor and the API reference generator
templates/   what new-project copies (theme.ts, STYLE.md)
viewer/      the web app
tests/       engine, docs, runtime, viewer, phaser and cli suites
examples/    the sample project (versioned; npm run example copies it into projects/)
projects/    your projects, one folder each; not versioned by Diorama
.agents/     skills for coding agents
```

A project, in `projects/<project>/` or `examples/<project>/`, has four places:

```
<project>/
├── STYLE.md     art direction (optional)
├── src/         hand-written code: theme.ts, space.ts, characters/, gear/, scenery/, vfx/, items/, scenes/, ui/
├── sheets/      one thin file per exported sheet, importing from src/
├── assets/      exported PNG + atlas JSON, mirroring sheets/ (generated)
└── review/      contact sheets, scenery tests, mockups (scratch)
```

`src/` is code and nothing there is exported by itself; `sheets/` lists what is exported, each sheet a one-line re-export of an asset in `src/`; `assets/` is the output and `review/` is scratch, and neither is versioned. No file or folder starts with an underscore, names are kebab-case, and a kit folder (`gear/`, `scenery/`, `vfx/`, `items/`) has a `catalog.ts` for editors and an `index.ts` for code. `npm run check -- <project>` runs the type check, then these rules, then the determinism lint (no `Math.random`, no clock, no raw colors outside `src/theme.ts`), and says what to move or use instead when one is broken; `npm run layout -- <project> --strict` (or `npm run check -- <project> --strict`) also fails on sheets without an export, which is the gate after an export.

**`examples/` and `projects/`.** `examples/` holds the samples Diorama ships, versioned with it; `projects/` holds your own, one folder each, and Diorama does not version them (only [`projects/README.md`](projects/README.md) is in the repository), so each can be a git repository of its own. The viewer shows `projects/` only: a sample becomes one of your projects when `npm run example` copies it there. Commands find a project by name, in `projects/` first, then in `examples/`; `projects/<name>` or `examples/<name>` picks one exactly, so `examples/<name>` always names the sample itself. Never create assets in `examples/`.

## Start with a coding agent

Open this folder in a coding agent and ask:

> Read `.agents/skills/diorama-setup/SKILL.md` and prepare this environment.

The skills are plain Markdown in `.agents/skills/`, read by path (most agents do not load them by themselves), so [AGENTS.md](AGENTS.md) and this README point to them. When the setup passes, ask for what you want to make, and the agent follows this order:

1. `diorama` for the rules and the workflow, which routes to the skill for the job;
2. `diorama-style` when a project starts or its look changes: the theme, the palette, the light, `STYLE.md`, a first prop and character to prove the look, and the tiers of detail that make assets rich;
3. `diorama-volume` (props, scenery pieces, equipment, effects, icons, HUD), `diorama-rig` (characters and creatures) and `diorama-kits` (scenery, gear, effects and items as catalog-driven sets) to make the assets;
4. `diorama-review` to check them, and `diorama-game` to play them in a game.

## Start by hand

```bash
npm run new-project -- my-game --style
npm run new-asset -- my-game props/crate --engine volume --directions 4   # then build the volumes in projects/my-game/src/props/crate.ts
npm run new-asset -- my-game characters/hero/walk --engine rig            # a walk clip with a mannequin skin
npm run check -- my-game
npm run export -- my-game
npm run view
```

`new-asset` writes the drawing in `src/` and its sheet in `sheets/`. The `diorama-style` skill walks through the first prop and the first character in full.

## Commands

| Task | Command |
| :--- | :--- |
| Create a project | `npm run new-project -- <project> [--style] [--genre <preset>] [--character <height>]` |
| Create a prop or any other one-off volume asset (scenery pieces, gear, effects and items are catalog entries: [where a new thing goes](docs/ARCHITECTURE.md#where-a-new-thing-goes)) | `npm run new-asset -- <project> <subpath> --engine volume [--size WxH] [--frames N] [--fps N] [--directions N]` |
| Create a character clip | `npm run new-asset -- <project> <character-folder>/<clip> --engine rig [--skeleton humanoid\|quadruped] [--clip walk\|run\|idle\|attack\|hit\|death]` |
| Start a kit: catalog, index and a first piece | `npm run new-kit -- <project> scenery\|gear\|vfx\|items [--force]` |
| Check types, layout and determinism | `npm run check -- <project> [--strict] [--json]` |
| Check the layout alone | `npm run layout -- <project> [--strict] [--json]` |
| Export (type checks first; `--force` exports anyway) | `npm run export -- <project> [subpath] [options] [--force]` |
| Export only what changed since the last export | `npm run export -- <project> --changed` |
| Bring the sample in as a project and export it | `npm run example [-- --force]` |
| List your projects and the samples | `npm run list -- [project] [--json]` |
| Measure a PNG | `npm run inspect -- <file.png> [--json]` |
| Review sheet of a strip or direction sheet | `npm run contact -- <file.png> [--rows W,SW] [--frames 0-3] [--with <b.png>] [--gray] [--bg <hex>] [--zoom N]` |
| Write one sheet per scenery piece | `npm run scenery-items -- <project> [--force]` |
| Test a scenery piece in every join | `npm run scenery-test -- <project> <piece> [--on <floor>\|none] [--field]` |
| Turn a saved scene into source | `npm run new-scene -- <project> <name> --scene <file.json>` |
| Write one sheet per gear part | `npm run gear-items -- <project> [--force]` |
| Turn a saved outfit into a character | `npm run new-outfit-character -- <project> <name> --from <character> --outfit <file.json>` |
| Write one sheet per effect | `npm run vfx-items -- <project> [--force]` |
| Write one sheet per item icon | `npm run item-icons -- <project> [--force]` |
| Open the viewer | `npm run view` |
| Serve a project's own game (`game/index.html`) | `npm run game -- <project> [--port N]` |
| Regenerate the API reference (`docs/api/`) | `npm run docs:api` |
| Check the environment | `npm run doctor` |
| Run the tests | `npm test` |

`--genre` adds `src/space.ts`, the game's space profile (grid, scale against the characters, wall placement) from a preset of proportions: `jrpg`, `action-rpg`, `tactics`, `farm-sim` or `dungeon-crawler` (the table of [volume guide 04](docs/guides/volume/04-scenery-kits.md#1-the-space-profile) says what each sets). `--directions` is the number of facings, 1, 4 or 8; the default is 8. A volume asset is two files, the drawing in `src/<subpath>.ts` and the sheet `sheets/<subpath>.ts`. A rig clip belongs to a character: `<character-folder>/<clip>` names the folder (the character) and the clip, the first clip creates `src/<character-folder>/character.ts` (`defineCharacter`), every clip gets its sheet in `sheets/<character-folder>/<clip>.ts`, and later clips print the line to add to the character's `clips`. `new-kit` starts a kit in `src/<kit>/` (its `catalog.ts`, its `index.ts` and a first piece drawn with the theme's materials: a crate prop, a helm with a mannequin that wears it, a spark burst or a gem) and refuses to overwrite one unless `--force`. The four generated commands (`gear-items`, `scenery-items`, `vfx-items`, `item-icons`) write `sheets/gear/`, `sheets/scenery/`, `sheets/vfx/` and `sheets/icons/` from the catalogs in `src/`; export those folders afterwards. `export` type checks the project first and exports nothing while it has a type error; `--force` skips the check for experiments. It renders several sheets at once (`--jobs <n>`; by default one per performance core, less one), and the files are the same with any number. `--changed` exports only the sheets whose image is missing or older than the sheet or a local file it imports, however deep: the ones the viewer marks as stale. `--skeleton`, `--size`, `--frames` and `--directions` apply to the first clip only. `--with <b.png>` stacks the same rows and frames of a second sheet under the first, to compare before and after or one character with another. `--bg` takes six hex digits: write `--bg 6e6a64` or quote it (`--bg "#6e6a64"`), because an unquoted `#` starts a shell comment. `npm run <command> -- --help` lists the options of a command, and `npm run export -- --help` those of the exporter.

## The viewer

`npm run view` serves the viewer at `http://localhost:5173`. It lists your projects, the folders of `projects/`, with their sources and their exported assets; the samples in `examples/` are not listed until `npm run example` (or "Try the sample", when there is no project yet) copies one in. The interface is in English or Brazilian Portuguese, from the language switch in the header, and `?` opens the shortcuts window with the keys of every page. A character has one name everywhere: the `label` it declares, with its folder as secondary text. Each project has four tabs:

- **Assets.** Every exported sheet, filterable by kind (characters, gear, scenery, props, effects, icons, interface). Its Details window plays an animation (playback speed, facing, zoom, light, dark or checker background, the pivot and frame-edge guides, the events and frames, the data of the atlas) and has a body of its own for an effect, an item icon or an interface piece. The project bar counts the sheets not exported yet, and a banner says when a source is newer than its export.
- **Playground.** Characters and props play from their exported atlases: WASD or the arrows move, Shift runs, Space and 1 to 9 trigger actions, H is a hit, K a death, R resets, E uses what is next to the character, `[` and `]` switch character and `/` searches. A toolbar shows the shadow, anchor, bounds, sockets, step events and navigation, sets the speed (down to a pause) and fits the view. Effects start at their sockets, and a chosen scene becomes the world, with walls, doors and props that react and sort against the characters.
- **Customize.** Dress a character with the project's gear kit by slot, swap and take off gear, undo, and save the outfit as a new character.
- **Scenery.** Paint scenes with the project's scenery kit: floors, walls, fences, doors, props and scale figures, with the navigation overlay, saved as scenes.

**Export** is in the project bar and in the New dialog (its Export tab): it exports the whole project or a folder of sheets, the same export as `npm run export`, and shows the type errors that stop it. The banner exports what is stale or missing, as `--changed` does.

A project with a game of its own (`game/index.html`, which plays the exports in Phaser through `@diorama/phaser`) has **Play game** in its bar and "Open game" in its ⋯ menu, which open the game in a new tab at `/projects/<project>/game/`; the Playground plays the same exports with debug tools, and says so. To see a project's characters in Phaser without a game, the package's test bench is at `http://localhost:5173/packages/phaser/demo/?project=<name>` ([packages/phaser/README.md](packages/phaser/README.md#the-test-bench)).

## Projects

Your projects live in `projects/<project>/`, laid out as above. Create one with `npm run new-project -- <project>`; it starts with `src/theme.ts` (the palette, the camera and the materials, a neutral start to make your own), an empty `sheets/` and a `.gitignore` for `review/`. The `diorama-style` skill takes a project from a brief to a look.

## Skills and documentation for agents

The `.agents/skills/` folder holds the instructions for coding agents:

| Skill | Use it for |
| :--- | :--- |
| [`diorama-setup`](.agents/skills/diorama-setup/SKILL.md) | The environment only: the doctor, installing, the tests, opening the viewer. |
| [`diorama`](.agents/skills/diorama/SKILL.md) | The hub: the workflow, the rules, the project layout; routes to the others. Its `references/commands.md` lists the commands. |
| [`diorama-style`](.agents/skills/diorama-style/SKILL.md) | Choosing the look: theme, palette, light, outline, materials, `STYLE.md`, and probing it with one prop and one character. |
| [`diorama-volume`](.agents/skills/diorama-volume/SKILL.md) | Props, scenery pieces, equipment, effects, icons and HUD pieces. |
| [`diorama-rig`](.agents/skills/diorama-rig/SKILL.md) | Animated characters and creatures: skeletons, clips, skins, sockets. |
| [`diorama-kits`](.agents/skills/diorama-kits/SKILL.md) | Scenery, gear, effects and items as catalog-driven sets: `new-kit`, the generators, the checks. |
| [`diorama-review`](.agents/skills/diorama-review/SKILL.md) | Checking an export: `inspect`, contact sheets, motion, the viewer; the quality bar, readability and motion references. |
| [`diorama-game`](.agents/skills/diorama-game/SKILL.md) | Using the exports in a game: `game/`, `@diorama/runtime`, `@diorama/phaser`, other engines. |

The guides explain when to use each module, and are indexed in [`docs/guides/`](docs/guides/README.md): [`docs/guides/volume/`](docs/guides/volume/) (space and camera, volumes and the stage, props and equipment, scenery kits, living scenery, effects, items and the HUD), [`docs/guides/rig/`](docs/guides/rig/) (skeletons, gaits and clips, skins, the atlas contract, gear and outfits) and [`core/draw/README.md`](core/draw/README.md). The API reference is generated in [`docs/api/`](docs/api/), and the folder architecture is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Contributing

Ideas, bugs and pull requests are welcome. The [roadmap board](https://github.com/users/leduardo99/projects/1) shows what is next, [Discussions](https://github.com/leduardo99/diorama/discussions) is the place for ideas and questions, and [CONTRIBUTING.md](CONTRIBUTING.md) explains how to set up and what every change has to keep. If a coding agent does the work, point it at [AGENTS.md](AGENTS.md): the workflow from issue to pull request, with the checks for each kind of change.

## License

Diorama is released under the [MIT License](LICENSE). Third-party components and their licenses are listed in [THIRD_PARTY.md](THIRD_PARTY.md).

## Acknowledgements

**Special thanks to [MrMagma](https://www.youtube.com/channel/UCNYXxX72LuCUCpuSz_R42zg)**, the creator of NoctAssetForge. Diorama grew out of his tool: it started as an extension of NoctAssetForge, and parts of its code (the drawing layer, the asset and export pipeline, the CLI) come from it, used and relicensed here with his permission. Thank you for building it and for letting it become an open-source project.

Diorama is developed with [Claude Code](https://claude.com/claude-code): most of its code, guides and sample art were written by Claude (Anthropic) working with the maintainer, and commits carry a `Co-Authored-By` line saying so. The banner above was exported with Diorama.
