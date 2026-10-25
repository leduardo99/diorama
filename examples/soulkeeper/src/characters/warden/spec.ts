/**
 * Ossuary warden rig: a living humanoid — the flesh body family — under a hood. Skeleton, cell and
 * pivot are the guard's (a variant is the same skeleton and clips on another body and outfit); the
 * outfit is `outfit.ts`, as data. `character.ts` defines the exportable character from both and
 * the gear catalog (`../../gear/catalog.ts`) lists it in `CHARACTERS`.
 *
 * Controls (read from the manifest): idle, walk and run for movement; `slash` is the attack (damage
 * at its `hit` event); `hit` is the reaction to damage (hit-stop, knock-back); `death` holds its
 * last frame.
 * Sockets: `hand` (sword hand), plus the automatic `head` and `center`; `tip` comes from the sword
 * the outfit holds. `slash` is made for a blade (`wields`).
 */

import { alpha } from '@core/draw';
import { humanoid, idle, locomotion, slash, type OutfitCharacterInfo } from '@core/rig';
import { CAMERA, PALETTES } from '../../theme';
import { swordHeld } from '../../gear';
import { humanoidDeath, humanoidHit } from '../shared/humanoid-clips';

const skeleton = humanoid();

// The guard's cell and pivot: same skeleton, same clips, so the same room.
const PIVOT = { x: 54, y: 124 };

export const WARDEN_RIG = {
  // The name people read, in the exported manifest (`defineCharacter`) and in the customizer (`CHARACTERS`).
  label: 'Ossuary Warden',
  skeleton,
  camera: CAMERA,
  width: 108,
  height: 162,
  pivot: PIVOT,
  shadow: alpha(PALETTES.ink, 0.35),
  sockets: {
    hand: pose => swordHeld(pose, skeleton).grip,
  },
  clips: {
    idle: { clip: idle(skeleton, { seconds: 1.6 }), frames: 16 },
    walk: { clip: locomotion(skeleton, 'walk'), frames: 12 },
    run: { clip: locomotion(skeleton, 'run'), frames: 12 },
    slash: { clip: slash(skeleton), frames: 12, wields: { main: ['blade'] } },
    hit: { clip: humanoidHit(skeleton), frames: 10 },
    death: { clip: humanoidDeath(skeleton), frames: 12 },
  },
} satisfies Omit<OutfitCharacterInfo, 'id' | 'outfit'>;
