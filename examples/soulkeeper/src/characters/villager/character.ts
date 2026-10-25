/**
 * Villager: a plain living humanoid in the gear kit's soft garments (humanoid skeleton). Every clip
 * sheet (`sheets/characters/villager/<clip>.ts`) is one line, `export default character.sheet('<key>')`;
 * this file declares the character once.
 *
 * The rig (skeleton, clips, cell, pivot: see `spec.ts`) and the outfit (`outfit.ts`, as data) are
 * shared with the gear catalog, so the viewer's customizer edits exactly what this character
 * exports: `defineCharacter({ outfit })` draws it with `outfitFromData(OUTFIT, CATALOG)`.
 */

import { defineCharacter } from '@core/rig';
import { CATALOG } from '../../gear/catalog';
import { OUTFIT } from './outfit';
import { VILLAGER_RIG } from './spec';

export const character = defineCharacter({ ...VILLAGER_RIG, name: 'villager', outfit: { data: OUTFIT, catalog: CATALOG } });
