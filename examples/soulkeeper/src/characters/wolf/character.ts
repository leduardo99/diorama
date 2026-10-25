/**
 * Ghoul wolf (quadruped): every clip of the character and its sockets. Clip sheets
 * (`sheets/characters/wolf/<clip>.ts`) are one line each, `export default character.sheet('<key>')`.
 *
 * Clips: idle, walk, run (locomotion), bite (attack), hit, death (held), howl (skill, aoe).
 * Sockets: `mouth` (the tip of the muzzle, from the skin's own head frame), plus `head` and `center`.
 */

import { alpha } from '@core/draw';
import { bite, defineCharacter, hit, idle, locomotion, quadruped, type EffectCue } from '@core/rig';
import { CAMERA, PALETTES } from '../../theme';
import { ghoulWolf, wolfMouth } from '../shared/ghoul-wolf';
import { collapse } from './clips/death';
import { howl } from './clips/howl';

const skeleton = quadruped();

/**
 * Effects the wolf plays on its clip events (catalog: `../../vfx/catalog.ts`): bone dust and chips at
 * the muzzle where a bite lands, and the souls that leave it when its death ends.
 */
const effects: Record<string, EffectCue[]> = {
  bite: [{ on: 'hit', effect: 'bone-dust', at: 'mouth' }],
  death: [{ on: 'end', effect: 'death-souls', at: 'center' }],
};

export const character = defineCharacter({
  name: 'ghoul-wolf',
  label: 'Ghoul Wolf',
  skeleton,
  skin: ghoulWolf,
  camera: CAMERA,
  width: 112,
  height: 96,
  pivot: { x: 56, y: 72 },
  shadow: alpha(PALETTES.ink, 0.35),
  sockets: { mouth: wolfMouth },
  frames: 8,
  effects,
  clips: {
    idle: { clip: idle(skeleton, { seconds: 1.6 }), frames: 16 },
    // 12 frames: locomotion needs more than 8 to read smooth at its cadence.
    walk: { clip: locomotion(skeleton, 'walk'), frames: 12 },
    run: { clip: locomotion(skeleton, 'run'), frames: 12 },
    // The engine's bite as is: jaw snarls in the gather, wide open through strike and extreme, snaps shut in the hold.
    bite: { clip: bite(skeleton), frames: 10 },
    hit: { clip: hit(skeleton, 0.4), frames: 8 },
    death: { clip: collapse(skeleton), frames: 12 },
    howl: { clip: howl(skeleton), frames: 12 },
  },
});
