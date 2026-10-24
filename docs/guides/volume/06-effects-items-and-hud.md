# Effects, items and the HUD

**Purpose.** The pieces of a game that are neither characters nor scenery, made with the same rules:
- **visual effects** (projectiles, impacts, casts, auras, area blasts, bursts) that characters play on their clip events;
- **items** and their **inventory icons**, with rarity tiers;
- the **HUD and menus**: nine-slice panels, buttons and slots, bars, a bitmap font for numbers, cursors and frames.

Each follows the catalog-and-items pattern of the scenery kit (guide 04): a catalog in the project, one generated asset file per entry, sheets whose atlas says everything a game needs.

**API reference:**
- [`docs/api/volume.md`](../../api/volume.md): `EffectInfo`, `EffectCatalog`, `EffectContext`, `defineEffect`, `validateEffects`;
- [`docs/api/rig.md`](../../api/rig.md): `EffectCue`, `ItemInfo`, `ItemCatalog`, `defineItemIcon`, `validateItems`;
- [`docs/api/core.md`](../../api/core.md): `defineNineSlice`, `defineBar`, `defineBitmapFont`, `defineUiImage`.

---

## 1. Effects

A project keeps its effects in `src/vfx/` and exports `VFX: EffectCatalog` from `src/vfx/catalog.ts`, with:
- `effects`: one `EffectInfo` each;
- `materials` (the theme's `VOLUMES`), `defaultMaterials`;
- `camera`, and `space` when the project has a space profile.

`npm run vfx-items -- <project>` writes the generated sheet `sheets/vfx/<id>.ts` (`defineEffect`) for each. Export `vfx/`. A project without the kit starts it with `npm run new-kit -- <project> vfx`: a spark burst in `src/vfx/bursts.ts`, `catalog.ts` and `index.ts`.

**An effect** (`EffectInfo`):
- **`kind`:** `projectile`, `impact`, `cast`, `aura`, `area`, `burst` or `trail`. It tells a player how to play it.
- **Timing:** `frames`, `fps` (default 12), `loop` (projectiles in flight, auras), `events` (`hit` on an impact's frame of contact, `release`, `fade`).
- **Space:** `size` is the radius it reaches in world units, which sizes the cell. `height` is how far below its origin its own floor marks are drawn (a projectile's pool of light, a hand's height down); a player puts the origin on the cue's socket, never lifted or lowered by `height` (§1.1). `layer` is `ground` (rings, scorches: under every standing thing) or `air` (sorted with them); area and cast effects default to the ground.
- **`directions`:** 8 or 16 for a projectile, so its heading reads; 1 for a round burst. A 16-facing sheet names its rows `D0`…`D15` (`D0` south, `D4` west, `D8` north, `D12` east); `contact --rows W` finds them by compass name.
- **`cell`:** the default cell leaves the effect's reach on every side, plus the floor under an effect in the air. An effect flat on the floor (a ring) wastes half of it: give it a `cell` that fits.
- **Projectiles:** `travel: { speed, range }` in world units, and `follows`: the effect that plays where it ends (its impact).

**The piece** (`EffectPiece`) draws one frame into `ctx.object` (and floor marks into `ctx.ground`), around the effect's origin:
- `ctx.t` runs 0 → 1 across a one-shot (its last frame is 1) and frame ÷ frames round a loop, so a loop closes on its own.
- `ctx.frame` faces the heading: build a projectile along `forward`.
- The floor is `ctx.height` below the origin. Draw a projectile's glow pool or shadow there, so it reads as flying.
- `ctx.seed` is the same in every frame and facing, so random details hold still while the effect plays; animate them with `t`.
- Use `@core/volume` parts for anything solid (a bone shard) and `object.custom` drawings for light, smoke and sparks.

**What makes an effect read:**
- a clear silhouette in the first frames (anticipation), the peak early, then a fall-off;
- the project's saturated accent (soul green in Soulkeeper) as the core, darker tones at the rim, and a pale hot centre;
- a size that matches the character (`SPACE.scale.character`): a hand projectile about a hand's size, an area blast a few cells;
- loops that close, and one-shots that end empty (the last frame fades to nothing) unless they leave a mark (a scorch on the ground layer).

`inspect` judges effect sheets only on line weight: effects are glow and colour by nature.

### 1.1 Effects on character events

A character cues effects on its clip events in `defineCharacter`:

```ts
import type { EffectCue } from '@core/rig';

const effects: Record<string, EffectCue[]> = { cast: [{ on: 'release', effect: 'soul-bolt', motion: 'fly' }, { on: 'start', effect: 'cast-circle', at: 'feet' }] };
```

(passed as `defineCharacter({ ..., effects })`)

- `on`: the event (`release`, `hit`, `cast`, `land`, `step:left`), or `start` / `end` of the clip.
- `effect`: the effect's id.
- `at`: the socket it starts at. Default: the socket of a `spawn:<socket>` event on the same frame, else `center`; `feet` is the pivot on the floor.
- `motion`: `fly` (a projectile along the facing the action started with), `follow` (tracks the socket: auras, trails) or `stay` (default).
- **Height:** the effect's origin goes on the socket, and its floor marks are drawn `height` below it. Cue an effect with floor marks (a projectile's pool of light) from a socket at about that height: a hand for a bolt at a hand's height. A creature that spits from low down needs its own effect with its own `height`.
- **Timing:** an effect runs at its own `fps`. A `start` cue whose effect has a `release` event lands with the clip's own release only if its fps is tuned to it.

The cues go into the manifest of every sheet (`meta.data.character.effects`). The atlas contract (`docs/guides/rig/04-atlas-contract.md` §5) says how a player plays them, and the viewer's playground does.

## 2. Items and icons

A project keeps its items in `src/items/` and exports `ITEMS: ItemCatalog` from `src/items/catalog.ts`:
- `items`: one `ItemInfo` each: id, label, kind (`weapon`, `armor`, `consumable`, `key`, `material`, `currency`, `quest`, or the project's own), `rarity`, `stack`, `description`;
- each item is a gear part (`gear: { part, character?, materials?, options?, hosts? }`), drawn as worn with the body hidden, a piece of its own (`piece`: a potion, a key, a coin), or both: a piece drawn for the icon of a gear part the item equips (loot art that differs from the worn part, which still says what it equips);
- `rarities`: tiers with a label and a color (common, rare, epic, legendary);
- `icon: { size, padding }`: the icon square in logical pixels, and the room kept round the item;
- `background` and `frame`: the project's drawing under and over the item for its rarity (a slot's ground, a border, a corner gem);
- `camera`, `materials`, `defaultMaterials`, and `gear: { catalog, characters }` for gear items.

`npm run item-icons -- <project>` writes the generated sheet `sheets/icons/<id>.ts` (`defineItemIcon`). Export `icons/`. A project without the kit starts it with `npm run new-kit -- <project> items`: a gem in `src/items/gems.ts` with two rarity tiers, `catalog.ts` and `index.ts`.

**How an icon is made:** the item is drawn once to measure its pixels, then drawn again at the scale that fits the padded square, centred, so every icon fills its slot the same way and lines stay crisp. A soft halo (a crown of fire) counts in the measure and makes the item smaller.
- **The view:** three-quarters from the front left (`facing`, default 3π/4). `pose: { turn, tip }` turns a piece of its own before the view (a shield tipped towards the viewer); `spin` turns the drawn item in the icon's plane (a sword or a key on the diagonal).
- **Gear items:** drawn on the character, so they take `facing`, `pose.turn` and `spin`, never `pose.tip`. The character is `gear.character`, else the first whose outfit has the part; an add-on (a part with `requires`) must be in that outfit, on its host. The pieces the part rests on in that outfit (a helm's skull, a shield's arm) are drawn with it; `gear.hosts: 'hide'` places them without drawing them.

**A piece of its own** (`ItemPiece`) builds the item into `ctx.object` around `ctx.frame`, like a prop, at any world size: the icon is scaled to fit. Keep the project's materials and line weights, so the potion belongs with the helm.

**What makes icons read:** one clear silhouette per item, recognisable at 1×; the item's own colours, with the rarity carried by the frame and background only; the same light and outline as everything else; no tiny details that vanish at the icon size.

The atlas says `role: 'icon'` and the item (id, label, kind, rarity with its label and color, stack, description, the gear part and its `equip` slot).

**Icons in slots:** an icon carries its own ground and frame for its rarity. Either size the HUD's slots as the icon plus a margin, so a filled slot shows the icon inside the slot's frame, or leave the catalog's `background` and `frame` out and let the slot frame the item.

## 3. The HUD and menus

Interface pieces are drawn with `@core/draw` (no camera, no volumes) in `src/ui/` and exported by one sheet each in `sheets/ui/`:

| Piece | Function | What the atlas carries |
| :--- | :--- | :--- |
| Panel, dialog box, tooltip, button, slot | `defineNineSlice({ kind, width, height, insets, states, draw })` | `nineSlice` insets, one row per state (normal, hover, pressed, disabled, selected) |
| Health, mana, soul bar | `defineBar({ measure, width, height, insets, fillBox, grows, draw })` | three frames: back, fill, frame; the fill box and its direction |
| Damage numbers, short labels | `defineBitmapFont({ chars, cell, baseline, draw })` | one glyph per frame; `font`: advances, baseline, line height |
| Cursor, portrait frame, ornament | `defineUiImage({ kind, width, height, states, pivot, draw })` | states; the pivot is a cursor's hotspot |

- **States:** one row each, in the order of `meta.data.states` (the frames keep the sheet's row names, so read the states from there). `contact --rows hover` finds a row by its state.
- **Nine-slice:** a game stretches the edges and the middle to any size larger than the insets. Draw corners and edges so they can repeat or stretch; nothing may cross an inset line except along its edge.
- **Bars:** a game draws the back, the fill clipped to the value inside `fillBox` along `grows`, the cap, then the frame. The fill clipped by the game has a plain cut: give the bar a `cap` (`cap: { width }`, a fourth frame drawn at the full end of `fillBox`), the bright edge a game moves to where the fill ends and clips to `fillBox`, so a sliver still reads.
- **Bitmap font:** draw each glyph with `@core/draw` paths in the project's style and return its advance; a narrow `1` takes less room. A game draws each glyph's cell at the pen and moves the pen by the advance plus `spacing`; an outline that runs past the advance needs the spacing to keep neighbours apart. Damage numbers need `0123456789` and a few signs (`+-%`); dialog text is the game engine's own font.
- **Style:** the same palette, line hierarchy and light as the art (light from the upper left on bevels); flat by design, so `inspect` judges interface sheets only on line weight. The accent marks what is active or important (a selected slot, the soul bar).

## 4. Checklist

- Every effect, item and interface piece is in its catalog or folder, exported, and passes `inspect`.
- Effects: one-shots end empty or on their mark, loops close, events sit on the frame a game reacts on, projectiles have travel and an impact to follow; sizes match the character.
- Characters cue their effects on the right events and sockets; `inspect` shows no cue warnings.
- Icons: every item fills its square the same way and reads at 1×; rarity shows in the frame, not in the item; slots fit the icons.
- HUD: nine-slices stretch cleanly (try three sizes), bars read at every value with their cap, the font sets "1234" and "-56" evenly.
