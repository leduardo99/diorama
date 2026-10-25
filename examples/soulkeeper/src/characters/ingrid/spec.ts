/**
 * Ingrid the Valkyrie's rig: everything about the character except what she wears (the outfit is
 * `outfit.ts`): a `humanoid()` at 1.18 (94 tall, 1.18 times the guard), the clips with their frame
 * counts, the camera, the cell, the pivot, the shadow and the sockets. `character.ts` defines the
 * exportable character from it and the gear catalog (`../../gear/catalog.ts`) lists it in
 * `CHARACTERS`, so the viewer's customizer dresses her.
 *
 * Controls (read from the manifest): idle, walk and run for movement; `thrust` is the attack (damage
 * at its `hit` event, the spear at full reach); `soulspear` is the skill (`cast` ends the draw,
 * `release` + `spawn:tip` on the frame the spear is driven home, where the soul burst plays); `hit`
 * is the reaction to damage (hit-stop, knock-back); `death` holds its last frame.
 * Sockets: `shield` (the centre of the shield on her left forearm), plus the automatic `head` and
 * `center`; `tip` (the spear's point) comes from the spear the outfit holds. `thrust` and
 * `soulspear` are made for a polearm (`wields`).
 *
 * Cell 208 x 224, pivot (104, 148), Malvek's: the spear is 108 long and stands to about 104 at rest;
 * the thrust draws its butt about 54 behind her and carries its point about 86 ahead, Soul Spear raises
 * its head to about 133 on the draw, the death lays it on the floor beside her, and the spread wings
 * span about 90. The pivot is the centre of the footprint, the same in every clip.
 */

import { alpha } from '@core/draw';
import { humanoid, type OutfitCharacterInfo } from '@core/rig';
import { CAMERA, PALETTES } from '../../theme';
import { shieldDisc } from '../../gear';
import { ingridIdle, ingridLocomotion } from './clips/moves';
import { ingridDeath, ingridHit } from './clips/reactions';
import { SOULSPEAR_FRAMES, soulspear } from './clips/soulspear';
import { THRUST_FRAMES, thrust } from './clips/thrust';

const skeleton = humanoid(1.18);

const PIVOT = { x: 104, y: 148 };

export const INGRID_RIG = {
  // The name people read, in the exported manifest (`defineCharacter`) and in the customizer (`CHARACTERS`).
  label: 'Ingrid the Valkyrie',
  skeleton,
  camera: CAMERA,
  width: 208,
  height: 224,
  pivot: PIVOT,
  shadow: alpha(PALETTES.ink, 0.35),
  sockets: {
    shield: pose => shieldDisc(pose, skeleton).center,
  },
  clips: {
    idle: { clip: ingridIdle(skeleton), frames: 16 },
    walk: { clip: ingridLocomotion(skeleton, 'walk'), frames: 12 },
    run: { clip: ingridLocomotion(skeleton, 'run'), frames: 12 },
    // 12 frames in 0.6 s (20 fps): draw back, a 2-frame thrust, hold, recovery.
    thrust: { clip: thrust(skeleton), frames: THRUST_FRAMES, wields: { main: ['polearm'] } },
    // The skill: 16 frames in 1 s (16 fps), `release` and `spawn:tip` on frame 7.
    soulspear: { clip: soulspear(skeleton), frames: SOULSPEAR_FRAMES, wields: { main: ['polearm'] } },
    // 10 frames: the snap, a 3-frame hit-stop, the recovery (25 fps).
    hit: { clip: ingridHit(skeleton), frames: 10 },
    death: { clip: ingridDeath(skeleton), frames: 12 },
  },
} satisfies Omit<OutfitCharacterInfo, 'id' | 'outfit'>;
