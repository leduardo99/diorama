# @diorama/runtime

The atlas contract in pure TypeScript: it reads Diorama's exported sheets and plays them. Games and the viewer's Playground share it to play [the contract](../../docs/guides/rig/04-atlas-contract.md): the Playground's characters, their clips and their effects run on it. The Playground still draws effects with the pixel arithmetic it had before the runtime, so its frames did not change; `tests/viewer/vfx.test.ts` checks that every effect lands where the runtime's floor point and lift put it.

- **No DOM and no dependencies.** The host fetches the files and draws. The runtime says what to draw, where, and when: frames, facings, events, effects and depth.
- **Floor units.** Positions are floor points in world units, the logical px of the exports. With a scene, the origin is the centre of cell (0, 0), like the scene's navigation. A `Projection` puts floor points on the screen: across, a world unit is `kx × scale` px; in depth it is `ky × scale` px, so depth shrinks with the camera's tilt.
- **Source, not a build.** In this repository it is reached through the `@diorama/runtime` path alias (`tsconfig.json`, `vite.config.ts`). `package.json` already declares its `exports`, so publishing it later is one build step.

## Playing a character

<!-- docs:allow-long -->
```ts
import { buildLibrary, createActor, cues, play, projectionOf, readSheet, shownFrame, steer, stepFx, toScreen, type Fx } from '@diorama/runtime';
const json: unknown = { meta: {}, frames: {} }; // what the host fetched: characters/hero/idle.json, and the sheets it depends on
const library = buildLibrary([readSheet('characters/hero/idle', json)]);
const actor = createActor(library.characters[0], { x: 0, y: 0 }, { id: 1 });
let effects: Fx[] = [];
play(actor, 'slash');
for (const event of steer(actor, { dx: 1, dy: 0, run: false }, 1 / 60)) effects.push(...cues(event, library.effects));
effects = stepFx(effects, 1 / 60, { effects: library.effects }).fx;
const feet = toScreen(projectionOf(null, { tilt: actor.character!.tilt, scale: actor.character!.scale }), actor.pos);
const { frame, pivot } = shownFrame(actor); // draw frame.x, .y, .w, .h of frame.sheet at feet − pivot + (frame.ox, frame.oy)
```

1. Fetch a sheet's JSON and read it with `readSheet(path, json)`. Paths start at the assets root and have no extension. A file that is not an atlas throws a `ContractError` naming it; cells listed in another shape than the contract's (another packer's array) are taken from the grid, with a warning in `sheet.warnings`. `dependenciesOf(sheet)` lists what to fetch next: a character's other clips and the effects it cues (`vfx/<id>`), an effect's `follows` (so the follow-up comes from the effect sheet's own list), and a scenery piece's state and clip sheets.
2. `buildLibrary(sheets)` makes the characters (their clips grouped by manifest, with the bindings of its `controls` and the `label` to show, else its `name`), the effects by id, the interface pieces by path, the icons by item, and sprites for everything else. Older atlases fall back on the rules of the contract's §6.
3. `createActor(character, floorPoint, { id })` puts a character on the floor (the id is yours: the runtime keeps no count), and each step returns the events its clips fired:
   - `steer(actor, input, dt, floor?)` walks or runs at the gait's `groundSpeed`, so the feet stay planted;
   - `advance(actor, dt, floor?)` moves the clocks without input: the clips' events, an action's root motion (through the floor) and its end;
   - `play(actor, key)` starts an action if its priority and the `cancel` event allow it. Its `start` and first-frame events come with the next step, or from `takeEvents`;
   - `stance(actor, key)` makes a looping clip the base instead of idle (a defend pose, a cast loop);
   - `reset(actor)` goes back to idle.
4. `cues(event, effects, { aim? })` turns an event into the effects its character cues. `stepFx(effects, dt, world)` moves them on and returns their events: the impact's `hit`, `end`, and, for a projectile whose impact has no `hit`, a `hit` where it ended.
5. Draw `shownFrame(actor).frame` with the cell's `pivot` on `toScreen(projection, actor.pos)`: a packed sheet's frame is the trimmed part of its cell, `ox`, `oy` into it (`cellW` × `cellH`). Draw an effect at `toScreen(projection, fx.pos, fx.lift)`. `socketAt(actor, name)` is a socket on the floor with its lift, and `frameSocket(clip, row, frame, name)` the same socket in the sheet's own px. `depthKey(screenY, kind, order)` gives a draw order: the Playground's, on a grid of a sixteenth of a px (see `src/depth.ts`).

Every sheet of an export shares one scale, so one projection draws them all. A host that draws each sheet at its own exported size, whatever its `meta.scale`, as the viewer's Playground does, also moves each sprite at that sheet's rate: the Playground's floor moves a sprite by the moving clip's `meta.scale`, and it speeds a projectile up or down by its effect sheet's scale over the character's.

A `Floor` is what the ground allows of a move. A scene's floor is `moveIn` on its navigation (`meta.data.navigation` of the scene sheet, with its `grid`), and `flightStop` is what stops a projectile there. `FREE_FLOOR` lets every move go through.

## Modules

| File | What it does |
| :--- | :--- |
| `src/contract/` | Types of the exported JSON (atlas, character manifest, effect, scenery piece, scene and navigation, UI, item), and `CONTRACT`, the version it reads |
| `src/read.ts` | `readSheet`, `imageSheet`, `dependenciesOf`, sheet paths, roles and the §6 fallbacks; `ContractError` names the file |
| `src/library.ts` | `buildLibrary`, `Character`, `Clip`, `EffectSheet`, `UiSheet`, `IconSheet` |
| `src/frames.ts` | The cells of a clip in playback order, `framesOf` (trim-aware `Frame`s), `rowFor`, `facingOf`, `frameIndex`, the events of a sheet |
| `src/projection.ts` | `projectionOf` (a scene sheet's grid, origin and scale, or a character's camera), `toScreen`, `toFloor` |
| `src/actor.ts` | The clip player (contract §5 rules 1 to 8): priority, cancel, hold, events, root motion, steering, stance, sockets |
| `src/effects.ts` | Effect cues (rule 9): stay, follow, fly, aimed fly, effect events |
| `src/navigation.ts` | `canStep`, `findPath`, `cellAt`, `moveIn` and `flightStop` on a scene's navigation |
| `src/depth.ts` | `depthKey`: standing items, actors and air effects in one order, on a grid of a sixteenth of a px |
| `src/ui.ts` | Nine-slices, bar fill and cap, bitmap text layout |
| `src/gear.ts` | What a character holds (`wieldOf`), and the clips that suit it (`playableClips`) |
| `src/random.ts` | `createRng(seed)` for game rules |

The full reference is [docs/api/runtime.md](../../docs/api/runtime.md).

**Not yet:**
- live scenes, `navigationAt`, the scene's ground frame and `Library.pieces` / `Library.scenes` (milestone M3, with contract changes C2 and C3);
- `walkTo`, an actor following a path at its gait's own speed (with the scenes, M3);
- equipment variants that swap in place, `setCharacter` and `variantOf` (M6).

## How it is checked

- `tests/runtime/` (`npm run test:runtime`) holds the rules, the contract type test and the conformance traces.
  - The rules run on synthetic atlases and on small JSON fixtures of exported sheets (`tests/runtime/fixtures/`).
  - `contract.test.ts` checks that the engine's producer types can be assigned to these and, for the types it lists, that every field these name is one the engine still writes. It compiles itself, so `npm test` runs the type checks too.
  - The conformance traces in `tests/runtime/conformance/` record what the runtime plays, frame by frame, for three exported characters. Another implementation replays them.
- `tests/runtime/standalone.test.ts` compiles the package alone with its own `tsconfig.json`: lib ES2022, no DOM, no paths.
- `tests/engine/boundary.test.ts` checks that the runtime imports nothing outside `packages/runtime`, that core never imports it, and that everything else reaches it through `@diorama/runtime`, never by a path into `packages/`.
