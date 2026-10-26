---
name: diorama-rig
description: Create animated 2.5D characters and creatures with `@core/rig` in Diorama — humanoids, quadrupeds, insects, birds or invented bodies; idle, locomotion and the actions a design needs, exported in 8 facings with ground speed, events and sockets. Use when an asset has a skeleton or moves like a creature; use diorama-volume for the 2.5D rules, diorama-kits for the equipment they wear, and diorama for the general production rules.
---

# Characters and creatures in Diorama

The engine already does the mechanics:
- skeletons as data, IK with exact bone lengths;
- gaits with planted feet and an exported ground speed, attack beats;
- the sheet layout, and a motion check on every export.

Your job is what it cannot decide: the body plan, the timing, and an art skin that clears the quality bar. Read `diorama` (production) and `diorama-volume` (2.5D) first, and `diorama-style` when the project has no look yet.

## Routing

| Need | Read |
| :--- | :--- |
| Choosing or writing a skeleton (humanoid, quadruped, spider, bird, serpent) | [guide 01](../../../docs/guides/rig/01-skeletons-and-creatures.md) |
| Gaits, idles, actions, events, `extra` channels, the motion check | [guide 02](../../../docs/guides/rig/02-gaits-and-clips.md) |
| defineCharacter, writing a skin, sockets, sorting rules, cells, pivot | [guide 03](../../../docs/guides/rig/03-skins-and-character-assets.md) |
| What the exported files promise to games and the playground (kinds, events, sockets, root motion, playing rules) | [guide 04](../../../docs/guides/rig/04-atlas-contract.md) |
| Equipment as reusable parts; outfits and variants; materials by role; what a character holds | [guide 05](../../../docs/guides/rig/05-gear-and-outfits.md) and the `diorama-kits` skill |
| Exact signatures | [rig API](../../../docs/api/rig.md), [volume API](../../../docs/api/volume.md) |
| Timing: anticipation, holds, overshoot, smears, loops | [motion reference](../diorama-review/references/motion.md) |
| The finish every skin must reach | [quality bar](../diorama-review/references/quality-bar.md) |

## Workflow

1. **Body plan and clip set.**
   - Pick a preset or write the skeleton (guide 01). Only `humanoid` and `quadruped` can be scaffolded; any other body is data you write.
   - Plan the clips the design needs. Every character starts with an idle and the locomotion it moves with (walk, run, or a crawl, a swim, a fly); then come the actions of its role: an attack, a skill, a dodge, a gather, a talk, an emote, a use of an object; add hit and death when it can be hurt or die. Give each clip a kind.
   - Run `npm run new-asset -- <project> characters/<name>/<clip> --engine rig [--skeleton humanoid|quadruped] [--clip walk|run|idle|attack|hit|death] [--frames N] [--directions N]`. The first clip creates `src/characters/<name>/character.ts` (`defineCharacter`), and `--skeleton`, `--size`, `--frames` and `--directions` apply to it only. Every clip gets its sheet, `sheets/characters/<name>/<clip>.ts`, which only exports `character.sheet('<clip>')`; for later clips the command prints the entry to add to `clips`.
   - The scaffold writes `name` (the id) but no `label`: add `label`, the name people read, to `defineCharacter` now. The viewer and the exported manifest show it everywhere.
   - For a new body plan, scaffold with any skeleton, then replace the skeleton and clips with your own factories in `src/characters/<name>/skeleton.ts` (or `src/characters/shared/<body>.ts` when several characters use it). Names are kebab-case with no underscore, and drawing code stays in `src/`.
   - The scaffold's cell is a block-out size. Check it against the widest pose (a death, a lunge, what is held) and write the character's size and cell in `STYLE.md`'s reference sizes.
2. **Block out motion.** Keep `mannequinSkin(VOLUMES.x)` (the template's skin; it works for any body) in `character.ts`.
   - Export and run `npm run inspect` on each sheet: `motion: clean · loops (gap 0)` (or `· plays once` for actions), and a `character:` / `controls:` summary with no ⚠.
   - Run `npm run contact` on every row, and `--rows ... --frames ...` to zoom what moves.
   - Fix proportions, gait numbers and timing now, while the skin is cheap.
   - The scaffolded idle is `idle(skeleton)`: 8 frames over 2 s, which is 4 fps and reads as slow. Give it `idle(skeleton, { seconds: 1.6 })` and 16 frames through `clips: { idle: { clip: idle(skeleton, { seconds: 1.6 }), frames: 16 } }` (guide 02 §1, guide 03 §1). Walk and run are right as scaffolded.
3. **Design the skin.**
   - List the primary, secondary and tertiary details before coding (or the tiers the project's style keeps). Primary features must survive every facing.
   - Pick the focal accent the style calls for and one asymmetric element that shows the facing.
4. **Build the skin** (guide 03):
   - masses as `Blob`s, built along the trunk's axis so hit and death can pitch the body;
   - bands with `visibleArc` / `bandOnEllipsoid`;
   - one-sided parts sorted by depth;
   - effects through `custom`, started at the clip's events, and cued from the character with `effects` (volume guide 06 §1.1);
   - sockets declared for everything a game attaches to (a hand, a tool tip, a mouth).
5. **Export every clip and check** (gates below). Compare it side by side with a finished character of the project (`npm run contact -- <a.png> --with <b.png>`), and play it in the viewer's Playground.
6. **Iterate on what the review found.** Usual fixes:
   - a face hidden by a hat or helm;
   - a shield, apron or bag showing through the body when it turns;
   - flat values;
   - a mane, fur or fringe that reads as quills.

When the character wears equipment, the parts, the outfit and what each hand holds are the gear kit's job: `diorama-kits` and [guide 05](../../../docs/guides/rig/05-gear-and-outfits.md). Clips can be made for what is held (`wields`); a clip made for another item is marked `usable: false` and left out of the controls.

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
- Ships a mannequin (blockout) skin, or a skin that stops at the floor of the quality bar where the style keeps more.
- Draws equipment inline in one character's skin when the project has a gear kit: they are parts, so other characters and the customizer can reuse them. A project without one starts it with `npm run new-kit -- <project> gear`.

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
   - For other actions (a gather, a use, an emote), check the pose reads in every row and the event sits on the frame the game reacts on.
5. **Consistency:** same camera, contour, scale and finish as the project's other characters.

## Reporting

Report:
- the skeleton and clips made, and the gait numbers you changed;
- the detail tiers of the skin;
- each gate with its result;
- what still needs judging in motion (in the game, at speed).
