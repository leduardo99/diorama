/**
 * Malvek Ravenlight's rig: everything about the character except what he wears (the outfit is
 * `outfit.ts`): the gaunt `humanoid()` skeleton (`skeleton.ts`), the clips with their frame
 * counts, the camera, the cell, the pivot, the shadow and the sockets. `character.ts` defines the
 * exportable character from it and the gear catalog (`../../gear/catalog.ts`) lists it in
 * `CHARACTERS`.
 *
 * Controls (read from the manifest): idle, walk and run for movement; `reap` is the attack (damage at
 * its `hit` event, the wide scythe sweep); `soulbolt` is the skill (`cast` ends the draw, `release` +
 * `spawn:palm` on the frame the palm throws the bolt); `backstep` is the dodge, by root motion
 * (`travel`, negative); `hit` is the reaction to damage (hit-stop, knock-back); `death` holds its
 * last frame.
 * Sockets: `palm` (where the flame hovers over the open left hand), plus the automatic `head` and
 * `center`; `tip` (the scythe blade's tip) and `lantern` (the caged soul lantern) come from the scythe
 * the outfit holds. `reap` is made for a polearm (`wields`).
 *
 * Cell 208 x 224, pivot (104, 148). The scythe is 111 units long (taller than he is) and the reap
 * swings it through more than 200 degrees from over the right shoulder, so the cell is wide and
 * tall: the wind-up comes within 10 px of the top, and the death, where the scythe is flung out to the
 * side, within 13 px of the left and right. Below the pivot the death needs the room too: the scythe
 * falls to the floor beside the body, and in the facings that look along it (S, SE, E) it reaches 61 px
 * below the pivot (14 px to spare). The idle, walk and run use only the middle of the cell. The pivot
 * is the centre of the footprint, the same in every clip.
 */

import { alpha } from '@core/draw';
import type { OutfitCharacterInfo } from '@core/rig';
import { CAMERA, PALETTES } from '../../theme';
import { palmPoint, scytheHeld } from '../../gear';
import { malvekBackstep } from './clips/backstep';
import { malvekDeath } from './clips/death';
import { malvekHit } from './clips/hit';
import { malvekIdle, malvekLocomotion } from './clips/moves';
import { REAP_FRAMES, reap } from './clips/reap';
import { malvekSkeleton } from './skeleton';
import { BOLT_FRAMES, soulbolt } from './clips/soulbolt';

const skeleton = malvekSkeleton();

const PIVOT = { x: 104, y: 148 };

export const MALVEK_RIG = {
  label: 'Malvek Ravenlight',
  skeleton,
  camera: CAMERA,
  width: 208,
  height: 224,
  pivot: PIVOT,
  shadow: alpha(PALETTES.ink, 0.35),
  sockets: {
    palm: pose => palmPoint(pose, skeleton, -1),
  },
  clips: {
    idle: { clip: malvekIdle(skeleton), frames: 16 },
    walk: { clip: malvekLocomotion(skeleton, 'walk'), frames: 12 },
    run: { clip: malvekLocomotion(skeleton, 'run'), frames: 12 },
    // 14 frames in 0.7 s (20 fps): wind-up, a 3-frame sweep, hold, a 3-frame recovery.
    reap: { clip: reap(skeleton), frames: REAP_FRAMES, wields: { main: ['polearm'] } },
    // The skill: a 4-frame draw, a 2-frame thrust, `release` and `spawn:palm` on frame 6 (17 fps).
    soulbolt: { clip: soulbolt(skeleton), frames: BOLT_FRAMES },
    // 10 frames: the snap, a 3-frame hit-stop, the recovery (25 fps).
    hit: { clip: malvekHit(skeleton), frames: 10 },
    death: { clip: malvekDeath(skeleton), frames: 12 },
    // The dodge: 10 frames in 0.45 s (22 fps), root motion backwards.
    backstep: { clip: malvekBackstep(skeleton), frames: 10 },
  },
} satisfies Omit<OutfitCharacterInfo, 'id' | 'outfit'>;
