/**
 * Ossuary warden: a living humanoid under a hood, the flesh body family wearing the gear kit
 * (humanoid skeleton). Every clip sheet (`sheets/characters/warden/<clip>.ts`) is one line,
 * `export default character.sheet('<key>')`; this file declares the character once.
 *
 * The rig (skeleton, clips, cell, pivot, sockets: see `spec.ts`) and the outfit (`outfit.ts`, as
 * data) are shared with the gear catalog, so the viewer's customizer edits exactly what this
 * character exports: `defineCharacter({ outfit })` draws it with `outfitFromData(OUTFIT, CATALOG)`
 * and takes the held weapon's sockets (`tip`) and clip checks from it.
 */

import { defineCharacter, type EffectCue } from '@core/rig';
import { CATALOG } from '../../gear/catalog';
import { OUTFIT } from './outfit';
import { WARDEN_RIG } from './spec';

/**
 * Effects the warden plays on her clip events (catalog: `../../vfx/catalog.ts`): steel sparks at
 * the blade's tip where a slash lands, and the souls that leave her when her death ends.
 */
const effects: Record<string, EffectCue[]> = {
  slash: [{ on: 'hit', effect: 'slash-spark', at: 'tip' }],
  death: [{ on: 'end', effect: 'death-souls', at: 'center' }],
};

export const character = defineCharacter({ ...WARDEN_RIG, name: 'ossuary-warden', outfit: { data: OUTFIT, catalog: CATALOG }, effects });
