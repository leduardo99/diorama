# Diorama commands

Run commands from the repository root. `npm run <command> -- --help` prints the options of one command, and `npm run export -- --help` those of the exporter. Use `npm run --silent` whenever you need to parse the output, because npm otherwise prints its own banner on stdout. With `--json`, stdout holds only the JSON and the human log goes to stderr: parse stdout alone (do not merge the streams with `2>&1`). Commands that create files refuse to overwrite anything, unless the command has `--force`.

## Start a project and make assets

| Task | Command |
| :--- | :--- |
| Create a project | `npm run new-project -- <project> [--style] [--genre <preset>] [--character <height>]`. Creates `projects/<project>/` with `src/theme.ts`, an empty `sheets/` and a `.gitignore` for `review/`. `--style` adds `STYLE.md`, only when the project is created (to add it later, copy `templates/optional/STYLE.md`). `--genre` adds `src/space.ts`, the space profile: a preset of proportions (cell against character, wall, door and fence heights, wall placement), `jrpg`, `action-rpg`, `tactics`, `farm-sim` or `dungeon-crawler`; the table in [volume guide 04](../../../../docs/guides/volume/04-scenery-kits.md#1-the-space-profile) says what each sets. `--character` is the character height in world units (default 80). |
| Create a prop or any one-off volume asset | `npm run new-asset -- <project> <subpath> --engine volume [--size 128x128] [--frames N] [--fps N] [--directions N (default 8)]`. Writes the drawing in `src/<subpath>.ts` and the sheet `sheets/<subpath>.ts`; `<subpath>` is kebab-case. |
| Create a character clip | `npm run new-asset -- <project> <character-folder>/<clip> --engine rig [--skeleton humanoid\|quadruped] [--clip walk\|run\|idle\|attack\|hit\|death] [--size WxH] [--frames N] [--directions N]`. The first clip creates `src/<character-folder>/character.ts`; every clip gets `sheets/<character-folder>/<clip>.ts`; `--skeleton`, `--size`, `--frames` and `--directions` apply to the first clip only. |
| Start a kit | `npm run new-kit -- <project> scenery\|gear\|vfx\|items [--force]`. Writes `src/<kit>/catalog.ts`, `index.ts` and a first piece in a family file, drawn with the theme's `VOLUMES` and sized by `src/space.ts` when the project has one (a crate prop, a helm on a mannequin character, a spark burst, a gem with two rarity tiers). Refuses to overwrite a kit unless `--force`. See `diorama-kits`. |

## Check, export, look

| Task | Command |
| :--- | :--- |
| Check one project | `npm run check -- <project> [--strict] [--json]`. The type check (`src/`, `sheets/` and `game/`), then the layout rules, then the determinism lint. `--strict` also fails on sheets without an export and assets without a sheet: the gate after an export. |
| Check the layout alone | `npm run layout -- <project> [--strict] [--json]` |
| Export official assets | `npm run export -- <project> [subpath...] [options]`. A `subpath` is a sheet under `sheets/`, without `.ts`, or a folder of them (`characters/hero/`); several can be given. The project's type check runs first and a type error stops the export; `--force` skips it for experiments. |
| Export only what changed | `npm run export -- <project> [subpath] --changed`. The sheets whose image is missing or older than the sheet or a local file it imports, however deep: the ones the viewer marks as stale. The engine (`core/`) does not count: after changing it, export everything. A theme edit makes every sheet stale. |
| Export with a JSON summary | `npm run --silent export -- <project> [subpath] [options] --json` |
| Export a mockup (never overwrites official files) | `npm run export -- <project> <subpath> --mockup` |
| List projects and assets | `npm run list -- [project] [--json]` |
| Measure a PNG | `npm run inspect -- <file.png> [--json]` |
| Review sheet of a strip or direction sheet | `npm run contact -- <file.png> [--rows W,SW] [--frames 0-3] [--with <b.png>] [--gray] [--bg <hex>] [--zoom N] [--out <png>] [--json]`. `--bg` takes six hex digits: write `--bg 6e6a64` or quote it, `--bg "#6e6a64"`, because an unquoted `#` starts a shell comment. `--with` stacks a second sheet under the first for comparison. |

Export options: `--grid` or `--compact` for a sheet, `--gap <px>`, `--cols <n>`, `--sheet-name <name>`, `--both`, `--no-json`, `--scale <n>`, `--format png|jpeg`, `--out-dir <path>`, `--force`, `--changed`, `--jobs <n>` (sheets rendered at once; the default is one per performance core, less one, and the files are the same with any number), `--server <url>` (use this running dev server). Values can be written as `--gap 8` or `--gap=8`. Every command refuses an option it does not take (with the closest one it does, when a letter or two is off), so a typo never runs a different check than the one asked for; `npm run <command> -- --help` lists its options.

Mirroring: `--out-dir` or `outDir` in `<project>/diorama.config.json` copies official outputs to another folder. Mockups are never mirrored. The config file accepts only `outDir`, `scale`, `format`, `cols` and `gap`; `npm run check` and `npm run layout` report any other key as an error.

## Kits, scenes, outfits

| Task | Command |
| :--- | :--- |
| One sheet per scenery piece | `npm run scenery-items -- <project> [--force]`, from `src/scenery/catalog.ts` into `sheets/scenery/`; then export `scenery/` |
| One sheet per gear part | `npm run gear-items -- <project> [--force]`, from `src/gear/catalog.ts` into `sheets/gear/`; then export `gear/` |
| One sheet per effect | `npm run vfx-items -- <project> [--force]`, from `src/vfx/catalog.ts` into `sheets/vfx/`; then export `vfx/` |
| One sheet per item icon | `npm run item-icons -- <project> [--force]`, from `src/items/catalog.ts` into `sheets/icons/`; then export `icons/` |
| Test a scenery piece in every join | `npm run scenery-test -- <project> <piece> [--on <floor>\|none] [--field] [--out <png>] [--keep]` |
| Turn a saved scene into source | `npm run new-scene -- <project> <name> --scene <file.json> [--force]`, writes `src/scenes/<name>.ts` and `sheets/scenes/<name>.ts` |
| Turn a saved outfit into a character | `npm run new-outfit-character -- <project> <name> --from <character> --outfit <file.json> [--force]`, writes `src/characters/<name>/` and the sheets of the clips it can use |

## The viewer, a game, the sample

| Task | Command |
| :--- | :--- |
| Open the viewer | `npm run view` (port 5173) |
| Serve a project's own game | `npm run game -- <project> [--port N]`; see `diorama-game` |
| Bring the sample in as a project | `npm run example [-- <sample>] [--force] [--no-export] [--changed] [--jobs N]`. Copies it from `examples/` to `projects/` and exports it; run again, it keeps your copy and exports what changed. |
| Check the environment | `npm run doctor` |

Repository work (changing Diorama itself, see [AGENTS.md](../../../../AGENTS.md)): `npm run docs:api` regenerates `docs/api/` after changing exported symbols in `core/`, `npm test` runs every test suite (`npm run test:docs` one of them), and `npm run export:sample`, `npm run check:sample` and `npm run compare-exports` are the export proof.
