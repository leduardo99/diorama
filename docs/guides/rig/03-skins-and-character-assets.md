# Skins and character assets (`@core/rig`)

**Purpose.** Declare a character once with `defineCharacter` (skeleton, skin, cell, sockets, clips), draw its poses with `@core/volume` parts (the skin), and export one sheet per clip in every facing. A skin is the project's art: the same skeleton can wear a skeleton warrior, a knight or a goblin. What the exported files promise to players is in [guide 04](04-atlas-contract.md).

**API reference:** [`docs/api/rig.md`](../../api/rig.md), and [`volume.md`](../../api/volume.md) for the parts.

---

## 1. Files

- **`src/characters/<name>/character.ts`** declares the character with `defineCharacter`:
  - `name` (the character's id, e.g. `ossuary-guard`), `label` (the name people read, for a game's menus and the viewer; default the name in words, `Ossuary guard`), `skeleton`, `skin`, the theme's `CAMERA`;
  - the cell (`width`, `height`), the `pivot` (where the feet stand in the cell) and a `shadow` (`alpha(PALETTES.ink, 0.35)` in the examples; an ellipse sized from the rest feet and `skeleton.height`);
  - `frames` (default per clip) and `directions`;
  - `sockets` (named points for effects);
  - `clips`, a record of key → clip, or `{ clip, frames }` for a clip that needs its own frame count.
  Nothing in `src/` is exported by itself: the sheets are.
- **`sheets/characters/<name>/<key>.ts`**, one per clip, is one line: `export default character.sheet('<key>')`, importing `character` from `src/characters/<name>/character.ts`. The key is the file name: lowercase letters, digits and dashes.
  - `defineCharacter` takes the keys from `clips`, so a key the character does not declare (a typo, a clip not added to `clips` yet) is a type error in the sheet file, reported by `npm run check`, and not a failure at export. `ClipKey<typeof character>` is the union of the keys.
  - Keep the keys visible to TypeScript: write `clips` as an object literal, and end a shared rig object (`spec.ts`) with `satisfies Omit<OutfitCharacterInfo, 'id' | 'outfit'>` instead of annotating it with that type. The rig then carries the `label`, so the gear kit's `CHARACTERS` and `defineCharacter` spread one name. An annotation, or clips built with `Object.fromEntries` (as `new-outfit-character` does), widens the keys to `string`: every key type-checks and a wrong one fails only at export.
- **The skin** lives in its own file when it is long (`src/characters/shared/<name>.ts` or `<name>-skin.ts` when several characters use it), and so do skeleton and clip factories for a new body plan; a character's own clip factories go in `src/characters/<name>/clips/<clip>.ts`, its rig in `spec.ts` and a saved outfit in `outfit.ts`.
- **Scaffolding:** `npm run new-asset -- <p> characters/<name>/<clip> --engine rig` writes `src/characters/<name>/character.ts` on the first clip, with a mannequin skin and the preset clip named by the file (or by `--clip`), and the clip's sheet. For later clips it writes the sheet and prints the entry to add to `clips`; until you add it, `npm run check` reports the sheet's key as a type error. For a new body plan, scaffold with any `--skeleton`, then replace the skeleton and clips with your own factories.
- **Block out first:** use `mannequinSkin(VOLUMES.x)` (it draws any skeleton) to check proportions and motion in every facing. Write the real skin after.
- **Clip set:** a playable character usually has idle, walk, run, at least one attack, hit and death. Add skills, dodges and emotes as the design needs. `inspect` warns when there is no idle and when a clip has no exported sheet.

## 2. Writing a skin

A skin receives `(object, pose, kit)` and adds parts to that one stage object.

- **Frames:** build every part in a frame from the pose. `partFrame(origin, forward, upHint)` gives a frame along a bone. The upper body faces where the shoulders point (it twists in attacks): take `across` from shoulder to shoulder and `forward = across × up`.
- **Survive pitch:** hit and death pitch and drop the trunk, so a death lies the body flat. Build trunk parts along the trunk's own axis, never along world up (`pose.frame.up`); otherwise a skirt or a rib cage stays upright while the body lies down. Trunk parts are skirts, rib cages, spines, belts and carapaces.
  - Biped: `bodyUp = norm3(sub3(j.chest, j.pelvis))`.
  - Quadruped: the pelvis-to-chest `back` axis.
  - `bodyFrames(pose, skeleton)` returns both cases ready: `up`, `forward`, `right`, the hips' own `hipForward` and `hipRight`, and `lie` (0 standing, 1 lying flat). For a body with more than two legs, `forward` is the trunk axis and `up` is perpendicular to it.
  - Keep world up only for things that truly hang, such as a dangling chain.
  - Check the last frames of the death sheet in every row.
- **Masses:** a body or a skull with a jaw is a `Blob` of `Round` and `Tube` masses (one outline, organic union). Limbs are `Tube`s along `pose.chains`, with knobs at the joints and masses at the haunches. Use `ringsAlong` for lofts along a spine or snout and `along` to resample a chain.
- **Bands:** belts, ribs, bracelets and wraps are a `Tube` through `visibleArc`; around an ellipsoid (a rib hoop on an abdomen, a collar on a round neck) use `bandOnEllipsoid(cam, frame, forward, side, up, at, { axis })`, which follows the curved surface.
- **Decals** are flat: on a curved body they float off the surface away from their origin. Keep them small, or place them on the face plane at the body's radius, or build the mark as a thin `Tube` or band instead.
- **Sorting:**
  - `on` is for parts always over their host: a buckle on a belt, a helm on a skull.
  - Parts on one side of the body (a nasal bar, a chest bib, front and back tabards, a shield on the outside of the forearm) go by depth. Otherwise, use `on` only while `kit.camera.faces(normal)`.
  - Clumps that should only break the outline (fur tufts) use a large negative `bias`.
  - `on` chains are transitive: everything resting `on` a part is drawn after it, so ribs `on` a glow decal cover the glow. Put both on the body: the glow then sorts at its origin's depth among the ribs, so leave the cage open where it shows, or draw the glow as a `custom` effect `on` the last rib.
- **Effects:** a smear uses `kit.poseAt(t)` to sample the weapon a few times before the hit event and draws a crescent through `object.custom(..., { on: blade })`. A skill's wave or muzzle flash starts at its `release` event. Read the clip's `events` (and `kit.clip.kind`) instead of hard-coding times. During a hit, `pose.extra.hurt` (0..1) lets eyes flare or the face flinch.
- **Sockets:** declare in `defineCharacter({ sockets })` every point a game attaches things to: a hand, a blade tip, a mouth, a shield. Each is a function of the pose (`pose => pose.joints['armR.hand']`). `head` and `center` are automatic. When the skin computes a point with a helper (a blade from the weapon angle, a muzzle from the head frame), export that helper and use it in both places, so the socket and the drawing agree. A `spawn:<socket>` event must name a declared socket.
- **Variation and cost:** variation comes from `createRng(seed)`, never `Math.random`. Never call shape booleans per part. A skin should cost a few milliseconds per cell; measure it if the export gets slow.

## 3. The quality floor

Every skin clears the diorama-volume [quality bar](../../../.agents/skills/diorama-volume/references/quality-bar.md):
- three tones per material and selective inner lines;
- one focal accent;
- detail in three tiers;
- no mannequin shapes;
- a ragged outline where the material is ragged.

The skin's doc comment lists its primary, secondary and tertiary details.

## 4. Cells, pivot and data

- **Cell and pivot:** pick a cell with margin for the widest pose of any clip: weapons, horns, tails, lunges, and above all the death. A lying humanoid is about as long as it was tall, so the cell needs about 0.3 × height below the pivot; the guard's 108 × 120 cell has its pivot at (54, 94). `npm run inspect` must report no cell touching its edges. The pivot is the centre of the footprint, the same in every clip of one character, so clips swap without a jump.
- **Rows and names:** rows are facings in the order S, SW, W, NW, N, NE, E, SE. Frames are named `<DIR>_<frame>`.
- **Atlas data:** each sheet's JSON carries the clip's `action` (kind), `key`, `tags`, `hold`, `events` by frame, `travel` (root motion), `sockets` per frame, the `motion` check and the whole character manifest (clips, controls, warnings). [Guide 04](04-atlas-contract.md) lists every field and the playing rules. Players and the viewer read these fields; never make them guess from file names.
- **Direction count:** 8 directions are the default for characters. 4 directions suit small enemies seen only on a grid. Never mirror an asymmetric character.
