# The character atlas contract (`@core/rig`)

**Purpose.** This page lists what a game, the viewer's playground or any other player can rely on in the exported files of a character. It also gives the rules for playing them. Producers (skins, clips) are covered in guides [02](02-gaits-and-clips.md) and [03](03-skins-and-character-assets.md); this page is for consumers. `@diorama/runtime` plays these rules in pure TypeScript, for games and the playground alike ([packages/runtime/README.md](../../../packages/runtime/README.md)).

---

## 1. Files

A character defined with `defineCharacter` exports one sheet per clip, all in one folder:

```
assets/characters/<folder>/<key>.png   rows = facings, columns = frames
assets/characters/<folder>/<key>.json  atlas: frames, meta (layout), meta.data (this contract)
```

Every sheet's JSON repeats the whole character manifest, so reading any one sheet is enough to know every clip, its file and its meaning.

## 2. Layout (`meta`)

| Field | Meaning |
| :--- | :--- |
| `frames["<DIR>_<n>"]` | Cell rectangle in exported px. Single-facing sheets name cells `frame_<n>`. |
| `meta.directions`, `meta.directionOrder` | Facing names in row order: S, SW, W, NW, N, NE, E, SE (8), or S, W, N, E (4). |
| `meta.directionFacings` | Yaw of each row in radians. S = π/2 faces the camera; rows go clockwise on screen. Pick the row nearest to the movement direction. |
| `meta.pivot` | Where the feet stand in a cell: `x`, `y` in exported px, plus `logical`. Draw the cell so the pivot lands on the character's ground position. |
| `meta.scale` | Exported px per logical px (usually 2). World units in `meta.data` are logical px. |
| `meta.fps` | Frames ÷ seconds of this clip. |

## 3. Clip data (`meta.data`)

| Field | Meaning |
| :--- | :--- |
| `role` | `'character'`. Props use `'prop'`, scenery `'scenery'`, tiles `'tile'`, effects `'vfx'`, UI `'ui'`. A gear part exported alone (`defineGearAsset`) uses `'gear'` with `part`, `label`, `group`, `kind`, `equip` (when it has one), `slot`, `side` and the `character` whose cell and pivot it shares |
| `key` | This clip's key in the manifest (the file name). |
| `action` | The clip's kind: `idle`; locomotion `walk`, `run`, `sprint`, `crawl`, `fly`, `swim`; actions `attack`, `skill`, `hit`, `death`, `dodge`, `jump`, `emote`, `interact`, `spawn`, or a generic `action`. |
| `clipKind` | Coarse category: `idle`, `locomotion` or `action`. |
| `tags` | Free qualifiers such as `melee`, `ranged`, `aoe`, `heavy`. |
| `loop`, `hold` | Loops forever, or plays once. `hold` means the clip stays on its last frame (death). |
| `seconds`, `groundSpeed` | Clip length, and the world units per second the sprite moves while locomotion plays. Multiply by `meta.scale` for exported px. |
| `events` | `[{ frame, name }]`. The names below are conventions that games and the playground understand; a clip may carry events with any other name (a non-combat clip such as `interact` or `emote` has its own). Standard names: `hit` (deal damage), `cast` (a skill commits), `release` (its effect leaves), `cancel` (the action may be interrupted from here), `land`, `step:<leg>`, `spawn:<socket>` (something appears at that socket). |
| `travel` | Root motion of an action that covers ground: world units along the facing from the start at each frame, then at the end (frames + 1 values). It is negative for movement backwards (a backstep, a knock-back). Move the sprite along the facing by the difference between frames. Absent for clips in place. |
| `sockets` | `{ names, frames }`. `frames["<DIR>_<n>"]` holds one `[x, y, d]` per name: x, y in logical px from the cell's top-left corner; d is depth relative to the body's center (positive = in front of the body: draw the effect over the sprite). `head` and `center` are always present. |
| `motion` | The export's own check: bone drift, foot slide, loop gap and warnings. Not needed to play the clip. |
| `character` | The manifest (§4). |

## 4. The manifest (`meta.data.character`)

- `name` (the character's id) and `label` (the name to show; atlases exported before labels have none: show `name`).
- `skeleton`, `cell` (logical size), `scale`, `pivot`, `directions`, `camera` (`tilt`, `heightBoost`) and `sockets` (names).
- `clips`: one entry per clip, with `key`, `name`, `kind`, `category`, `tags`, `loop`, `hold`, `seconds`, `frames`, `fps`, `groundSpeed`, `events` and `travel`.
- `controls`: default bindings.
  - `idle`: the idle key.
  - `move`: locomotion keys from slowest to fastest; the first is the walk, the last the run.
  - `actions`: action keys grouped by kind, e.g. `{ attack: ['slash'], skill: ['spell'], hit: ['hit'], death: ['death'] }`.
- `wield`: what the character holds when it was defined with an outfit, `main` (right hand) and `off` (left), each with `part`, `class` and `hands`. Clips list what they are made to hold in `wields` (`main` / `off` classes, `unarmed` for an empty hand); a clip marked `usable: false` is made for something else and is not in `controls`: players leave it out.
- `effects`: effects to play on clip events, by clip key. Each cue has `on` (the event, or `start` / `end` of the clip), `effect` (an effect id: its sheet is `sheets/vfx/<id>.ts`, exported to `assets/vfx/<id>`), `at` (the socket it starts at; default the socket of a `spawn:<socket>` event on the same frame, else `center`; `feet` is the pivot on the floor) and `motion` (`fly`, `follow` or `stay`).
- `warnings`: problems found when the character was defined. Show them, don't block on them.

## 5. Playing rules

1. **Default state:** `controls.idle`, looping, or a **stance**: a game can make a looping clip the base instead of idle (a defend pose, a cast loop). Actions, hit and death still play over it and the character returns to it after them; walking shows the gait, and stopping shows the stance again. Resetting the character drops it.
2. **Moving:** pick a `controls.move` clip by input (walk, or run with a modifier). Move the sprite at its `groundSpeed` along the input direction and show the nearest facing row. On screen, ground distances along the view shrink with the camera tilt: for a world direction (dx, dy) of unit length, the screen velocity is `(dx, dy × sin(camera.tilt)) × groundSpeed × scale` px/s, with `camera` from the manifest. At that exact speed the planted feet stay on the floor in every direction.
3. **Priority:** death > hit > other actions (attack, skill, dodge, jump, interact, emote, spawn) > locomotion > idle. A higher priority always interrupts a lower one.
4. **Interrupting an action:**
   - It can be replaced from its `cancel` event on; without one, only when it ends.
   - Hit and death interrupt anything.
   - Locomotion and idle can always be replaced.
5. **Ending:** a non-looping clip returns to idle (or to locomotion if the input is held). A `hold` clip stays on its last frame until the character is reset.
6. **Events:**
   - Apply damage on `hit`.
   - Fire the skill's effect on `release`, spawning it at the `spawn:<socket>` socket when one is given.
   - Play footstep sounds and dust on `step:*`.
   - Shake or dust on `land`.
7. **Root motion:** while an action with `travel` plays, move the sprite by the per-frame difference along the facing it started with.
8. **Effects at sockets:** screen position = cell origin + `[x, y] × meta.scale`. Draw the effect over the sprite when `d > 0` and under it otherwise.
9. **Effect cues:** when a clip reaches an event with cues, play each cue's effect sheet (its atlas `meta.data.effect` says kind, frames, fps, loop, layer, travel, follows):
   - `stay`: at the socket where the event fired, once (or looping until the clip ends, for loops).
   - `follow`: tracking the socket's position frame by frame while the clip plays.
   - `fly`: a projectile leaves the socket along the facing the action started with, at `travel.speed` (on screen, its depth component shrinks by sin(tilt) like a character's), showing the effect row nearest its heading; it ends after `travel.range` or where the scene's navigation blocks it, and plays its `follows` effect there.
   - **Aimed fly:** a game may aim a `fly` cue at a point on the floor instead (a target): the projectile heads for that point and shows the row nearest that heading.
   - **Effect events:** an effect sheet's own `events` fire as its frames are reached (on every lap of a loop), and `end` when it ends. A projectile's damage lands on the `hit` of the effect it `follows`, or where the projectile ends when that effect has no `hit` (or there is none).
   - Effects with `layer: 'ground'` are drawn under every standing thing; `air` effects are sorted with them by the point on the floor under their origin: the socket's position with its height dropped, never the socket lowered by the effect's `height`.
   - The effect's `height` says where its own floor marks are drawn (a projectile's pool of light is `height` below its origin), not where to place it: the origin goes on the socket. A kit cues effects with floor marks from a socket at about that height, or makes one effect per height.
   - Rows: a `fly` effect shows the row nearest its heading, and `stay` or `follow` effects the row nearest the actor's facing. `meta.directionFacings` gives each row's heading (a 16-facing sheet names its rows `D0`…`D15`, `D0` facing south).
   - Effects run on their own clock (their `fps`), not the clip's, and a `stay` effect plays to its end even after the clip moved on. Clips that hold their last frame (a death) still fire `end`.
10. **Draw order:** a scene's ground goes first, then `ground` effects. Then standing things (walls, doors, props), characters and `air` effects are drawn by the screen y of their floor point, rounded to the nearest sixteenth of a pixel, lower on the screen in front.
    - Things whose y rounds to the same sixteenth are level. On one level, standing things come first, in the scene's layout order, then characters, then `air` effects.
    - `depthKey(screenY, kind, order)` in `@diorama/runtime` turns this into one number, which a renderer can use as its depth.
    - The rounding is a grid, not a tolerance: two things 0.01 px apart can fall on two levels. The order differs from an exact comparison of y only below a sixteenth of a pixel, where the eye cannot tell.

## 6. Older or partial files

Fields were added over time: older atlases may lack `action`, `sockets`, `travel` or `character`, and an older manifest its `label`. Fall back to:
- `clipKind`;
- `groundSpeed > 0` for locomotion, `loop` for idle, anything else as an action;
- grouping clips by folder, skeleton and pivot;
- showing the manifest's `name` where it has no `label`;
- for effects on a clip without `sockets`, a start 60 px of the sheet above the feet;
- for a projectile whose `travel` has no `range`, a flight of 150 world units.

Never infer meaning from file names.
