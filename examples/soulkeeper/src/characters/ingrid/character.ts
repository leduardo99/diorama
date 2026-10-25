/**
 * Ingrid the Valkyrie, the chooser of the slain who escorts souls: a boss on the flesh body family at
 * 1.18 times the guard's height (`humanoid(1.18)`). Every clip sheet
 * (`sheets/characters/ingrid/<clip>.ts`) is one line, `export default character.sheet('<key>')`; this
 * file declares the character once.
 *
 * The rig (skeleton, clips, cell, pivot, sockets: see `spec.ts`) and the outfit (`outfit.ts`, as
 * data) are shared with the gear catalog, so the viewer's customizer edits exactly what this
 * character exports: `defineCharacter({ outfit })` draws it with `outfitFromData(OUTFIT, CATALOG)` and
 * takes the held spear's sockets (`tip`) and clip checks from it.
 */

import { defineCharacter, type EffectCue } from '@core/rig';
import { CATALOG } from '../../gear/catalog';
import { OUTFIT } from './outfit';
import { INGRID_RIG } from './spec';

/**
 * Effects Ingrid plays on her clip events (catalog: `../../vfx/catalog.ts`): steel sparks at the
 * spear's tip where a thrust lands; for Soul Spear a rune circle that draws itself round her feet from
 * the start (its own `release` lands near the clip's) and the soul burst at the spear's tip on
 * `release`; and the souls that leave her when her death ends.
 */
const effects: Record<string, EffectCue[]> = {
  thrust: [{ on: 'hit', effect: 'slash-spark', at: 'tip' }],
  soulspear: [
    { on: 'start', effect: 'cast-circle', at: 'feet' },
    { on: 'release', effect: 'soul-burst', at: 'tip' },
  ],
  death: [{ on: 'end', effect: 'death-souls', at: 'center' }],
};

export const character = defineCharacter({ ...INGRID_RIG, name: 'ingrid', outfit: { data: OUTFIT, catalog: CATALOG }, effects });
