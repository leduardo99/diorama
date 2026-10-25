/**
 * Villager rig: a plain living humanoid — the flesh body family with the kit's garments and no
 * weapon. Skeleton, cell and pivot are the guard's; the outfit is `outfit.ts`, as data.
 * `character.ts` defines the exportable character from both and the gear catalog
 * (`../../gear/catalog.ts`) lists it in `CHARACTERS`.
 *
 * Controls (read from the manifest): idle, walk and run for movement — the clips a plain outfit
 * plays. Sockets: the automatic `head` and `center` only.
 */

import { alpha } from '@core/draw';
import { humanoid, idle, locomotion, type OutfitCharacterInfo } from '@core/rig';
import { CAMERA, PALETTES } from '../../theme';

const skeleton = humanoid();

// The guard's cell and pivot: same skeleton, so the same room.
const PIVOT = { x: 54, y: 124 };

export const VILLAGER_RIG = {
  // The name people read, in the exported manifest (`defineCharacter`) and in the customizer (`CHARACTERS`).
  label: 'Villager',
  skeleton,
  camera: CAMERA,
  width: 108,
  height: 162,
  pivot: PIVOT,
  shadow: alpha(PALETTES.ink, 0.35),
  clips: {
    idle: { clip: idle(skeleton, { seconds: 1.6 }), frames: 16 },
    walk: { clip: locomotion(skeleton, 'walk'), frames: 12 },
    run: { clip: locomotion(skeleton, 'run'), frames: 12 },
  },
} satisfies Omit<OutfitCharacterInfo, 'id' | 'outfit'>;
