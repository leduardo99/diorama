---
name: diorama-game
description: Use Diorama's exports in a game — a project's `game/` folder, `@diorama/runtime` (the logic, no DOM) and `@diorama/phaser` (drawing in Phaser 4), the Phaser test bench, and the atlas contract for any other engine (anchoring on the pivot, facings, ground speed, events, sockets, depth) with `outDir` mirroring. Use when exported assets must be played, loaded in an engine, or checked in a game.
---

# Using the exports in a game

A project's `assets/` is the product: PNG sheets and atlas JSON that say everything a game needs. This skill is about playing them. Read `diorama` first; to review what was exported before it ships, `diorama-review`.

## What a project exports

Each sheet is an image and, when it has more than one cell or data, a JSON next to it. The JSON says where every frame is, where the pivot is, the facing of each row, and in `meta.data` what the asset is and how to play it: a character's manifest (clips, controls, events, sockets, root motion), an effect's kind and travel, a scene's layout and navigation, an interface piece's insets and states. [Rig guide 04](../../../docs/guides/rig/04-atlas-contract.md) is the contract: read it before writing a player, and never infer meaning from file names.

## Which way to play them

| You are making | Use |
| :--- | :--- |
| A game in Phaser 4, in the project | `game/` with `@diorama/phaser` |
| A game with your own renderer or logic, in TypeScript | `@diorama/runtime` for the rules (it draws nothing), your renderer for the pixels |
| A game in another engine | The atlas contract directly, with the exports mirrored into the engine's asset folder |
| A quick look at a project's characters in Phaser, no game yet | The test bench |

The packages are source in this repository, reached through the `@diorama/runtime` and `@diorama/phaser` aliases: [packages/runtime/README.md](../../../packages/runtime/README.md) and [packages/phaser/README.md](../../../packages/phaser/README.md) are their guides (`load`, `add.character`, `controls`, effects, events, nine-slices), and [docs/api/runtime.md](../../../docs/api/runtime.md) and [docs/api/phaser.md](../../../docs/api/phaser.md) the references. The runtime plays and Phaser draws: a character's clips, facings, events, root motion and effects come from the runtime's clip player, never from Phaser's animations. Scenes in Phaser (the ground picture, standing items sorted with the actors, navigation as the floor) are listed as not built yet in both READMEs; read what each says before promising a feature.

## A project's `game/`

`game/` is optional and apart from the rest of the project: a page (`game/index.html`) and its code and data, written by you and versioned like `src/`. Rule 8 of [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md#rules) keeps it that way, and `npm run check -- <project>` enforces it:

- It holds code and data only (`.ts`, `.tsx`, `.js`, `.mjs`, `.json`, `.html`, `.css`, `.md`). **No images**: its pictures come from `assets/`, loaded through the packages (`this.diorama.load(path, { assets: '../assets/' })`, since the page is in `game/`).
- Everything it imports or loads is a relative path that stays inside `game/`, or one of `@diorama/runtime`, `@diorama/phaser`, `@diorama/phaser/sheets` and `phaser`. Never `@core`, `../src`, `../sheets`, an alias, a root path or a URL with a scheme; the message says what to write instead.
- `src/` and `sheets/` never import the game, and nothing else in the project depends on it.
- The type check includes `game/`. The determinism lint does not: a game exports nothing and reads the clock and rolls dice by design.

To run it: `npm run game -- <project> [--port N]` serves it with the viewer's dev server at `/projects/<project>/game/` (it only prints the address when this checkout's viewer already runs), and the viewer's project bar shows **Play game** (and "Open game" in the ⋯ menu) when `game/index.html` exists. The viewer's Playground plays the same exports with debug tools; the game is the project's real thing, and the two should agree.

## The test bench

`/packages/phaser/demo/` plays one character of a project's exports on an empty floor with the keys of its manifest, a panel with its keys and last event, and the effects its clips cue. `?project=<name>` and `?character=<id>` pick what plays, `?renderer=canvas` or `webgl` the renderer, `?clock=manual` stops the loop for a test. It is a bench, not a game: use it to see a new character in Phaser before there is a `game/`.

## Another engine

Mirror the exports into the engine's asset folder instead of copying by hand: set `outDir` in the project's `diorama.config.json` (or pass `--out-dir` to `npm run export`), and every official export is also copied there. Mockups are never mirrored.

```json
{ "outDir": "../my-engine/assets/diorama", "scale": 2 }
```

The config accepts only `outDir`, `scale`, `format`, `cols` and `gap`; any other key is an error. Then play the files by the contract:

- **Anchor on the pivot.** `meta.pivot` is where the feet (or the base) stand in a cell; draw the cell so the pivot lands on the object's ground position. Every cell of an asset has the same size and pivot.
- **Pick the row by heading.** Rows are facings, clockwise on screen from the one facing the camera; `meta.directionFacings` gives each row's yaw. Frames are named `<DIR>_<n>`.
- **Move at the clip's ground speed.** A locomotion clip plays in place; the game moves the sprite at `groundSpeed`, and on screen the depth part shrinks with the camera tilt, `(dx, dy × sin(tilt)) × groundSpeed × scale`, so planted feet stay planted.
- **Follow the events.** `hit`, `cast`, `release`, `cancel`, `land`, `step:<leg>` and `spawn:<socket>` are conventions with rules for priority and interruption; a clip may carry events of its own. Sockets give the point to attach effects and items to, per frame. Root motion (`travel`) moves an action's sprite along the facing it started with.
- **Draw in depth order.** Ground first, then standing things, characters and air effects by the screen y of their floor point (the contract's rule 10).
- **Scenes** carry a `layout` (every frame with its place) and a `navigation` (what blocks, what is slow, doors, things to use) for the game to read; the sheets hold every frame.

## Process

1. Export the project (`npm run export -- <project>`) and check it (`npm run check -- <project> --strict`).
2. Decide the player from the table above, and read its guide and the contract.
3. Build `game/` (or the engine integration) against the exports, not against the source: a game reads `assets/`.
4. Run it (`npm run game -- <project>`, the bench, or the engine), play every clip and every facing, and compare with the Playground.
5. When the art changes, export again (`--changed`) and reload; the game never needs the source.

## Rules

- A game reads exports; it never imports the engine or the project's `src/`.
- Never read a clip's meaning from its file name: use the manifest.
- Do not hand-edit anything in `assets/`; change the source and export.
- Ask the user which engine and which resolution before building the integration.

## Checks that must pass

1. `npm run check -- <project>` is clean, `game/` included.
2. The game loads every sheet it needs without warnings (the Phaser plugin collects them in `this.diorama.warnings`).
3. Every clip of a character plays, interrupts and returns to idle by the contract; events fire on the frames the manifest lists.
4. Feet stay planted at the clip's ground speed in every direction; effects start at their sockets.
5. In another engine, a cell anchored on `meta.pivot` stands where the same asset stands in the viewer's Playground.

## Reporting

Report the player chosen and why, what was played (clips, facings, effects), the checks and their results, and what the player does not do yet.
