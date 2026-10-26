---
name: diorama-rig
description: Create animated 2.5D characters and creatures with `@core/rig` in Diorama — humanoids, quadrupeds, insects, birds or invented bodies, with gear and outfits; walk, run, idle, attacks and other clips exported in 8 facings with ground speed and events. Use when an asset has a skeleton or moves like a creature; use diorama-volume for the 2.5D rules and diorama for the general production rules.
---

# Characters and creatures in Diorama

The engine already does the mechanics:
- skeletons as data, IK with exact bone lengths;
- gaits with planted feet and an exported ground speed, attack beats;
- the sheet layout, and a motion check on every export.

Your job is what it cannot decide: the body plan, the timing, and an art skin that clears the quality bar. Read `diorama` (production) and `diorama-volume` (2.5D, quality bar) first.

## Routing

| Need | Read |
| :--- | :--- |
| Choosing or writing a skeleton (humanoid, quadruped, spider, bird, serpent) | [guide 01](../../../docs/guides/rig/01-skeletons-and-creatures.md) |
| Gaits, idles, attacks, events, `extra` channels, the motion check | [guide 02](../../../docs/guides/rig/02-gaits-and-clips.md) |
| defineCharacter, writing a skin, sockets, sorting rules, smears, cells, pivot | [guide 03](../../../docs/guides/rig/03-skins-and-character-assets.md) |
| What the exported files promise to games and the playground (kinds, events, sockets, root motion, playing rules) | [guide 04](../../../docs/guides/rig/04-atlas-contract.md) |
| Armor, weapons, garments as reusable parts; outfits and variants; materials by role. The viewer's Customize tab dresses characters with the kit, and `npm run new-outfit-character` saves an outfit as a character | [guide 05](../../../docs/guides/rig/05-gear-and-outfits.md) |
| Exact signatures | [rig API](../../../docs/api/rig.md), [volume API](../../../docs/api/volume.md) |
| Timing: anticipation, holds, overshoot, smears, loops | [diorama-volume motion reference](../diorama-review/references/motion.md) |
| The finish every skin must reach | [diorama-volume quality bar](../diorama-review/references/quality-bar.md) |

Worked examples (read-only, for technique: the one exception to project isolation) in `examples/soulkeeper/src/characters/`; the sheets that export them are in `examples/soulkeeper/sheets/characters/`:
- `guard/character.ts` with `spec.ts`, `outfit.ts` and `clips/`: a humanoid dressed from the gear kit (`examples/soulkeeper/src/gear/`, guide 05): weapon, shield, helm, smear, sockets taken from the held weapon, hit and death, dodge and jump clips;
- `wolf/character.ts` with `shared/ghoul-wolf.ts`: quadruped with fur tufts, a jaw channel, and a howl skill spawning at its `mouth` socket;
- `spider/character.ts` with `shared/bone-spider.ts` and `shared/bone-spider-skin.ts`: an eight-legged skeleton written as data (vector knees, a tetrapod gait, a custom idle with `extra` channels) and a spit skill;
- `malvek/character.ts` with `spec.ts`, `outfit.ts` and `skeleton.ts`, and `captain/`: a second humanoid and a rank variant, both assembled from the gear kit;
- `shared/` holds what several characters use (`humanoid-clips.ts`, `sword-angle.ts`) and the body plans kept apart from their character (the spider's and the wolf's bodies, each used by one character here);
- a clip that is only a gait or an idle has no file of its own in `src/`: its sheet imports `character` and exports `character.sheet('<clip>')`, as in `examples/soulkeeper/sheets/characters/guard/walk.ts`.

## Workflow

1. **Body plan and clip set.**
   - Pick a preset or write the skeleton (guide 01).
   - Plan the clips a game needs: idle, walk, run, an attack, hit and death at least, plus the design's skills, dodges and emotes. Give each one a kind.
   - Run `npm run new-asset -- <project> characters/<name>/<clip> --engine rig [--skeleton humanoid|quadruped] [--clip walk|run|idle|attack|hit|death] [--frames N] [--directions N]`. The first clip creates `src/characters/<name>/character.ts` (`defineCharacter`), and `--skeleton`, `--size`, `--frames` and `--directions` apply to it only. Every clip gets its sheet, `sheets/characters/<name>/<clip>.ts`, which only exports `character.sheet('<clip>')`; for later clips the command prints the entry to add to `clips`.
   - For a new body plan, scaffold with any skeleton, then replace the skeleton and clips with your own factories in `src/characters/<name>/skeleton.ts` (or `src/characters/shared/<body>.ts` when several characters use it). Names are kebab-case with no underscore, and drawing code stays in `src/`.
   - Write the character's size and cell in `STYLE.md`'s reference sizes.
2. **Block out motion.** Keep `mannequinSkin(VOLUMES.x)` (the template's skin; it works for any body) in `character.ts`.
   - Export and run `npm run inspect` on each sheet: `motion: clean · loops (gap 0)` (or `· plays once` for actions), and a `character:` / `controls:` summary with no ⚠.
   - Run `npm run contact` on every row, and `--rows ... --frames ...` to zoom what moves.
   - Fix proportions, gait numbers and timing now, while the skin is cheap.
   - The scaffolded idle is `idle(skeleton)`: 8 frames over 2 s, which is 4 fps and reads as slow. Give it `idle(skeleton, { seconds: 1.6 })` and 16 frames through `clips: { idle: { clip: idle(skeleton, { seconds: 1.6 }), frames: 16 } }` (guide 02 §1, guide 03 §1). Walk and run are right as scaffolded.
3. **Design the skin.**
   - List the primary, secondary and tertiary details before coding. Primary features must survive every facing.
   - Pick one focal accent and one asymmetric element that shows the facing.
4. **Build the skin** (guide 03):
   - masses as `Blob`s, built along the trunk's axis so hit and death can pitch the body;
   - bands with `visibleArc` / `bandOnEllipsoid`;
   - one-sided parts sorted by depth;
   - effects through `custom`, started at the clip's events;
   - sockets declared for everything a game attaches to.
5. **Export every clip and check** (gates below). Compare it side by side with a finished character of the project (`npm run contact -- <a.png> --with <b.png>`), and play it in the viewer's Playground.
6. **Iterate on what the review found.** Usual fixes:
   - a face hidden by a helm;
   - a shield or tabard showing through the body;
   - flat values;
   - a mane that reads as quills.

## Rejection rules

Reject or rewrite character code that:

- Animates by hand-placing joints per frame, or solves IK inside a skin. Clips drive; `solvePose` solves.
- Moves the character in the sheet during locomotion. Loops are in place; the game moves the sprite at `groundSpeed`.
- Has periodic terms with fractional cycles per loop, windowed bumps (`bell`) that run past t = 1, or samples t = 1.
- Builds an idle or any other cycle with `defineClip` without `loop: true` (it then plays once and its closure is never checked).
- Hard-codes the hit frame in the skin instead of reading `kit.clip.events`.
- Leaves a clip without a meaningful `kind` (a generic `action` cannot be bound to a control), an attack without `hit`, a skill without `cast`/`release`, or a death without `hold`.
- Repeats skeleton, cell, pivot or skin in every clip file instead of one `defineCharacter`; names a clip key differently from its file.
- Builds trunk parts along world up, so they stand upright when the body lies down in a death.
- Moves the body across the cell during an action instead of declaring `travel` (root motion).
- Uses different pivots or cell sizes between clips of the same character.
- Mirrors facings of an asymmetric character, or builds in world coordinates instead of pose frames.
- Ships a mannequin (blockout) skin, or a skin missing a detail tier (see the quality bar).
- Draws armor, weapons or garments inline in one character's skin when the project has a gear kit: they are parts (guide 05), so other characters and the customizer can reuse them. A project without one starts it with `npm run new-kit -- <project> gear` (`src/gear/` with a first part, a helm, and a mannequin in `CHARACTERS` that wears it); list the project's characters in `CHARACTERS` once they wear the kit.

## Quality gates

1. **Motion and contract:**
   - `inspect` prints `motion: clean`, with `loops (gap 0)` for cycles. That means no bone drift, foot slide, sunken feet or joints, open loop or contract warning, and no `hint:` about a forgotten `loop: true`.
   - The `character:` summary has no ⚠: no missing sheet, no missing idle, no unknown socket.
   - The `controls:` line binds every clip you planned.
2. **Layout:** no cell touching its edges, no empty cells, the same pivot across clips.
3. **Quality bar:** `inspect` prints no `quality` warnings, or the report says why one does not apply.
4. **Every facing, every frame:** contact sheets of every row, and a zoom of the moving parts.
   - For attacks, check the beat in the frame strip: anticipation, hold, strike over 2–3 frames, one smear, extreme hold, settle.
   - For deaths, check that the last frame lies flat in every row.
   - For skills, check that the effect starts at `release` from its socket.
5. **Consistency:** same camera, contour, scale and finish as the project's other characters.

## Reporting

Report:
- the skeleton and clips made, and the gait numbers you changed;
- the detail tiers of the skin;
- each gate with its result;
- what still needs judging in motion (in the game, at speed).
