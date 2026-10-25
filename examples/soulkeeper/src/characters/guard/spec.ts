/**
 * Ossuary guard rig: everything about the character except what it wears (the outfit is
 * `outfit.ts`): its label, the skeleton (humanoid), the clips with their frame counts, the camera,
 * the cell, the pivot, the shadow and the sockets. `character.ts` defines the exportable character
 * from it and the gear catalog (`../../gear/catalog.ts`) lists it in `CHARACTERS`, so the viewer's
 * customizer and `new-outfit-character` dress the same body with the same clips, under the same name.
 *
 * Controls (read from the manifest): idle, walk and run for movement; `slash` is the attack
 * (damage at its `hit` event); `cleave` is the skill, Soul Cleave (charged overhead cut: `cast`
 * ends the charge, `release` + `hit` + `spawn:tip` on the impact frame); `dash` and `backstep`
 * are the dodges and `jump` a forward leap, all three by root motion (`travel`); `hit` is the
 * reaction to damage (hit-stop, knock-back); `death` holds its last frame.
 * Sockets: `hand` (sword hand), `shield` (centre of the left-forearm shield), plus the automatic
 * `head` and `center`; `tip` (the blade's tip) comes from the sword the outfit holds (its catalog
 * `wield.sockets`). `slash` and `cleave` are made for a blade (`wields`).
 */

import { alpha } from '@core/draw';
import { humanoid, idle, locomotion, slash, type OutfitCharacterInfo } from '@core/rig';
import { CAMERA, PALETTES } from '../../theme';
import { shieldDisc, swordHeld } from '../../gear';
import { humanoidDeath, humanoidHit } from '../shared/humanoid-clips';
import { CLEAVE_FRAMES, cleave } from './clips/cleave';
import { guardDodge } from './clips/dodge';
import { guardJump } from './clips/jump';

const skeleton = humanoid();

// Cell 108 x 162, pivot (54, 124). The cell used to be 108 x 120 with the pivot at (54, 94): the
// jump (feet up to 27 units off the floor, arms and sword raised, and in N, NE and NW the body
// leaning away from the camera, which lifts everything further on screen) reaches 115 px above
// the pivot, and Soul Cleave's shockwave in S reaches 32 px below it. The pivot moved down by 30
// (room above) and the cell grew by 42 (30 above, 12 below), so every clip keeps its feet at the
// same distance from the pivot and the pivot stays the centre of the footprint. A body lying on
// the floor spans about 55 units along the facing, so in S and N its head or skirt reaches 22 px
// below the pivot (the camera tilt shortens depth to 0.74).
const PIVOT = { x: 54, y: 124 };

export const GUARD_RIG = {
  // The name people read, in the exported manifest (`defineCharacter`) and in the customizer (`CHARACTERS`).
  label: 'Ossuary Guard',
  skeleton,
  camera: CAMERA,
  width: 108,
  height: 162,
  pivot: PIVOT,
  shadow: alpha(PALETTES.ink, 0.35),
  sockets: {
    // The kit's socket helpers make the same calls as the pieces that draw, so socket and drawing agree.
    hand: pose => swordHeld(pose, skeleton).grip,
    shield: pose => shieldDisc(pose, skeleton).center,
  },
  clips: {
    // 1.6 s at 16 frames: 10 fps, with every term closing over the loop.
    idle: { clip: idle(skeleton, { seconds: 1.6 }), frames: 16 },
    // 12 frames: locomotion needs more than 8 to read smooth at its cadence.
    walk: { clip: locomotion(skeleton, 'walk'), frames: 12 },
    run: { clip: locomotion(skeleton, 'run'), frames: 12 },
    slash: { clip: slash(skeleton), frames: 12, wields: { main: ['blade'] } },
    // 10 frames: the snap, a 3-frame hit-stop, the recovery (25 fps).
    hit: { clip: humanoidHit(skeleton), frames: 10 },
    death: { clip: humanoidDeath(skeleton), frames: 12 },
    // 14 frames in 0.9 s (15.6 fps): charge, a 3-frame cut, hold, recovery.
    cleave: { clip: cleave(skeleton), frames: CLEAVE_FRAMES, wields: { main: ['blade'] } },
    // Dodges: 10 frames in 0.45 s (22 fps); the jump 12 frames in 0.75 s (16 fps).
    dash: { clip: guardDodge(skeleton, 'dash'), frames: 10 },
    backstep: { clip: guardDodge(skeleton, 'backstep'), frames: 10 },
    jump: { clip: guardJump(skeleton, { distance: 0.4 * skeleton.height, seconds: 0.75, frames: 12 }), frames: 12 },
  },
} satisfies Omit<OutfitCharacterInfo, 'id' | 'outfit'>;
