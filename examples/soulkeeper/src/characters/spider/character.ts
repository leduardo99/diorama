/**
 * Bone spider: the character definition. One skeleton (8 legs), one skin, one cell; each clip sheet
 * (`sheets/characters/spider/<clip>.ts`) is `export default character.sheet('<key>')`.
 *
 * Clips: walk, idle (custom: front-leg taps, fang pinch, soul pulse), hit, death (held) and spit,
 * a ranged skill. Sockets: `mouth` (between the fangs, where the spit leaves) and `abdomen` (the
 * soul hourglass), plus the automatic `head` and `center`.
 */

import { alpha } from '@core/draw';
import { defineCharacter, type EffectCue } from '@core/rig';
import { CAMERA, PALETTES } from '../../theme';
import { boneSpider, spiderDeath, spiderHit, spiderIdle, spiderSpit, spiderWalk } from '../shared/bone-spider';
import { boneSpiderSkin, spiderSockets } from '../shared/bone-spider-skin';

/**
 * Effects the spider plays on its clip events (catalog: `../../vfx/catalog.ts`): its spit is soul fire, so
 * the spider's own spit (`soul-spit`, drawn for a mouth about 6 high at the release, not the bolt's 44) leaves
 * between its fangs on `release` and flies along the facing, and the souls that leave it when its death ends.
 */
const effects: Record<string, EffectCue[]> = {
  spit: [{ on: 'release', effect: 'soul-spit', at: 'mouth', motion: 'fly' }],
  death: [{ on: 'end', effect: 'death-souls', at: 'center' }],
};

export const character = defineCharacter({
  name: 'bone-spider',
  label: 'Bone Spider',
  skeleton: boneSpider,
  skin: boneSpiderSkin,
  camera: CAMERA,
  width: 128,
  height: 112,
  pivot: { x: 64, y: 82 },
  shadow: alpha(PALETTES.ink, 0.35),
  frames: 8,
  effects,
  sockets: spiderSockets,
  clips: {
    idle: spiderIdle(),
    // 12 frames: locomotion needs more than 8 to read smooth at its cadence.
    walk: { clip: spiderWalk(), frames: 12 },
    hit: { clip: spiderHit(), frames: 6 },
    death: { clip: spiderDeath(), frames: 12 },
    spit: { clip: spiderSpit(), frames: 10 },
  },
});
