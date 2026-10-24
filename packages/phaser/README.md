# @diorama/phaser

Diorama's exports in [Phaser](https://phaser.io) 4: a scene plugin that loads sheets by [the atlas contract](../../docs/guides/rig/04-atlas-contract.md), characters played by [`@diorama/runtime`](../runtime/README.md), the effects they cue, keyboard controls from their manifest, one depth order and nine-slices. A project's `game/` folder uses it ([rule 8](../../docs/ARCHITECTURE.md#rules)); `demo/` is the package's [test bench](#the-test-bench), which plays any project's characters.

- **The runtime plays, Phaser draws.** A character's clips, facings, events, root motion and effects come from the runtime's clip player (`steer`, `shownFrame`, `cues`, `stepFx`), never from Phaser's animations. Phaser shows the frame the runtime names, by its atlas name, where the runtime puts it.
- **Pixel for pixel.** Positions are rounded to whole pixels and `withDiorama` turns `pixelArt` on, so a frame is drawn as it was exported. With the canvas renderer the plugin turns `roundPixels` off for the scene's cameras and the ones added later: `pixelArt` forces it on, and on canvas it draws frames half a pixel too large.
- **Phaser 4.2.1**, a peer dependency pinned exactly (the repository installs it as a devDependency). In this repository the package is reached through the `@diorama/phaser` path alias (`tsconfig.json`, `vite.config.ts`).

## A scene

<!-- docs:allow-long -->
```ts
import Phaser from 'phaser';
import { withDiorama } from '@diorama/phaser';
class Sandbox extends Phaser.Scene {
  preload() { this.diorama.load('characters/guard/idle', { assets: '../assets/' }); }
  create() { this.diorama.controls(this.diorama.add.character('characters/guard', { x: 0, y: 0 }, { id: 1 })); }
}
new Phaser.Game(withDiorama({ type: Phaser.AUTO, width: 1280, height: 720, scene: Sandbox }));
```

1. `withDiorama(config)` adds the plugin to every scene (`this.diorama`) and turns `pixelArt` on. `DIORAMA_PLUGIN` is the plugin's entry for a config that lists its scene plugins itself.
2. `this.diorama.load(paths, { assets, maxTextureSize })` in `preload` queues sheets and everything they need by the contract: a character's other clips and the effects it cues, an effect's `follows`, a scenery piece's state and clip sheets (`dependenciesOf`). `assets` is the URL of the assets folder the paths start from (default `assets/`; a project's game page is in `game/`, so its exports are `../assets/`). What cannot be fetched or read is a warning (`this.diorama.warnings`), and the rest still loads. Each scene's load fetches every sheet it needs that the game has no texture for yet, so a scene is created with all of them even while another scene loads the same ones, or after a stopped (or restarted) scene left its load half done; and a file that comes starts the next, so a load goes on while the game loop sleeps.
3. Each picture becomes a texture named by its sheet path (`characters/guard/idle`) with every cell as a frame by its atlas name (`S_0`, `frame_3`): a packed sheet's frames keep their trim, and each frame's origin is `meta.pivot` (or the runtime's own default for what plays), so `this.add.image(x, y, 'characters/guard/idle', 'S_0')` stands the guard's feet on (x, y). A picture wider or taller than the renderer's textures (`maxTextureSize`, default WebGL's `MAX_TEXTURE_SIZE`; the sample's widest scenery is 9216 px) is cut into bands of whole cells, the sources of that one texture, so a frame keeps its name.
4. `this.diorama.add.character(folder, floorPoint, { id })` puts a `DioramaCharacter` on the floor: a Sprite whose `actor` is the runtime's (`id` is yours, handed back on its events). Each step it reads its `controls`, steers its actor by `steering`, shows `shownFrame` and sorts itself by `depthKey(screenY, 'actor', order)`, where `order` is the order the plugin added it in, so actors on one level are drawn in that order, whatever their ids and the display list's order. `act(key)`, `stance(key)`, `face(heading)` and `reset()` drive it; `floor` is what the ground allows of a move, and `aim` points its `fly` cues at a floor point.
5. `this.diorama.controls(character)` binds the keyboard to the character's manifest (`controls`): W, A, S and D steer, Shift runs in the last move clip, and 1 to 9 play `character.actions` in the runtime's order (attack, skill, dodge, jump...). The keys are not captured, so a text field on the page still types. A character's controls are its own: given others, or destroyed with it, they stop listening.
6. Effects play by themselves: a clip's event cues them (`cues`), and after every character has stepped the plugin moves them on (`stepFx`), plays an impact where a projectile ended, and draws each as an Image where the character that cued it is drawn (its `drawnWith`), sorted by `depthKey(screenY, 'fx', order)` (ground effects under everything that stands, `DEPTH.groundEffects`). An effect that follows a character, or loops until its clip changes, ends when the character is destroyed. `this.diorama.play(fx, by?)` plays one of your own.
7. Events: a character, and the plugin's `events` for all of them, emit `clip` (`ClipEvent`); the plugin's `events` also emit `fxstart` (`Fx`) and `fx` (`FxEvent`: an effect's `hit`, a projectile's `hit` where it ended, `end`). `EVENTS` names them.
8. `this.diorama.add.nineSlice(x, y, 'ui/dialog-panel', width, height, state?)` draws an interface piece at any size from the runtime's `nineSlice()` parts: nine Images in a Container, the same pixels with both renderers. Phaser's own `NineSlice` draws nothing with the canvas renderer.

Where a floor point is drawn is a character's own `projection`, else `this.diorama.projection`: null puts each character's floor on its own camera (tilt and export scale) with the floor's origin at world (0, 0), so the Phaser camera frames the scene. A character's effects are drawn with its projection too.

## Tests and a fixed clock

`sleepOnStart` in the game config's `callbacks.postBoot` stops the loop before its first frame, and `manualClock(game)` steps it by hand (`step(frames, ms)`), so every update sees exactly the time it is given and two runs play the same frames. Sleeping from a scene's `create` comes too late: a scene without files to load is created before the loop starts.

## The test bench

`demo/` (`index.html`, `main.ts`, `bench.ts`, `footer.ts`) is served at `/packages/phaser/demo/` by `npm run view`. It plays one character of a project's exports on an empty floor with the keyboard controls of its manifest, a panel with its keys and its last event, and the effects its clips cue: `?project=<name>` (default `soulkeeper`) and `?character=<id>` (default the project's first) pick it, `?renderer=canvas` or `webgl` the renderer, and `?clock=manual` stops the loop for a test (`window.bench.step(frames)`). The projects, where each lives and its characters (the folders of `assets/characters/` whose sheets are characters) come from the dev server's catalog (`/__api/projects`, `/__api/assets`), and the exports are read where the server serves them, `/<projects|examples>/<project>/assets/`. The footer switches project and character and leads back to the viewer, in the viewer's language (`diorama.lang`); the 1280 × 720 canvas is shown to fit the window, never larger (Phaser's `Scale.FIT` with `max`).

It is a test bench, not a game: a project's game is its own `game/`, and Soulkeeper has none yet. It imports only the package's own files, the runtime and `phaser`, like the package (both checks below cover it), and is not part of what the package exports or ships (`exports` and `files` name `src/` only). An edit to the package or the bench reloads the bench and the projects' game pages, and no other page (`vite.config.ts`).

## Modules

| File | What it does |
| :--- | :--- |
| `src/sheets.ts` | What needs no Phaser (`@diorama/phaser/sheets`, runs in node): `closure` and `Closure`, the sheets a set of sheets needs, for a host that fetches them itself; `planTexture`, a picture as textures and named frames (bands of whole cells, trims, origins); `frameNameOf`; the files' URLs |
| `src/loader.ts` | `loadSheets` on a scene's loader (each load fetches the atlases the game has not read, what they need, and each picture as its sheet's texture), the game's loaded sheets and `libraryOf` (in the order of the sheets' paths) |
| `src/plugin.ts` | `DioramaPlugin` (`this.diorama`), its effects, `withDiorama`, `DIORAMA_PLUGIN`, `DEPTH` |
| `src/character.ts` | `DioramaCharacter`, the Sprite the runtime's actor plays |
| `src/controls.ts` | `KeyboardControls` from a character's manifest |
| `src/nine-slice.ts` | `DioramaNineSlice` from the runtime's `nineSlice()` parts |
| `src/clock.ts` | `sleepOnStart`, `manualClock` |
| `src/events.ts` | `EVENTS` |

The full reference is [docs/api/phaser.md](../../docs/api/phaser.md).

**Not yet:** scenes (their ground picture, standing items sorted with the actors, navigation as the floor: milestone M3 with the runtime's live scenes), tint (Phaser's canvas renderer ignores it) and audio.

## How it is checked

- `tests/phaser/` (`npm run test:phaser`):
  - `loader.test.ts` (node) holds the closure (on the runtime's fixtures, cut from the sample's export), the frame names, the origins from the pivot and the bands of whole cells (with a small fake limit, and a synthetic strip of 90 floor tiles, 8640 px wide like the sample's crypt-flags, against WebGL's 8192).
  - `smoke.test.ts` opens `tests/phaser/page/main.ts` in headless Chromium with the canvas renderer, then with WebGL (SwiftShader, no GPU needed), and the loop asleep, on sheets it generates (`tests/phaser/fixtures.ts`) with a texture limit of 64 px, which cuts the character's clips into bands (the effects and the panel fit whole). A character walks and runs at its clips' ground speeds, slashes with a spark and casts a bolt into its burst, firing their events and cues. The frames it draws (on several bands of their textures), the bolt's frame and the nine-slice are the fixtures' pixels exactly on both renderers, and actors on one level are drawn in the order they were added.
  - `lifecycle.test.ts` (the page `tests/phaser/page/lifecycle.ts`, two downloads at a time and the loop asleep): loads that go on without the game loop, a restarted scene and its warnings, a scene stopped in the middle of its load and started again, two scenes loading the same sheets at once; a destroyed character's keyboard listeners and following effects, a character's effects on its own projection, a camera added after `create` on canvas, and a text field that types next to the game.
  - `standalone.test.ts` compiles the package alone with its own `tsconfig.json` (`src/` and the test bench, `demo/`): the DOM, Phaser's types and the runtime, nothing else.
- `tests/engine/boundary.test.ts` checks that the package (its test bench included) imports only its own files, the runtime and `phaser`, and that `src/sheets.ts` imports only the runtime.
