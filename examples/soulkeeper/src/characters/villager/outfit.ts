/**
 * Villager outfit, as data: a plain living body — the flesh family — in the kit's soft garments:
 * a work apron over a tunic, a shawl, boots, and the hair style worn loose in a tail. It exists to
 * show the body family works with the kit's garments, the way `../warden/outfit.ts` does for the
 * hooded warden.
 *
 * It is `OutfitData` like the guard's (`../guard/outfit.ts`): part ids and material names of the
 * catalog, so the viewer's customizer edits exactly what the game exports. `character.ts` draws it
 * with `outfitFromData(OUTFIT, CATALOG)`.
 */

import type { OutfitData } from '@core/rig';

export const OUTFIT: OutfitData = {
  base: 'flesh-legs',
  // Which theme material plays each role of the gear kit for the villager: olive work clothes,
  // leather straps and boots, chestnut hair.
  materials: {
    skin: 'skin',
    hair: 'leather',
    hollow: 'hollow',
    cloth: 'moss',
    clothAccent: 'sash',
    leather: 'leather',
  },
  pieces: [
    { part: 'boot', slot: 'foot', side: -1 },
    { part: 'boot', slot: 'foot', side: 1 },
    { part: 'tunic', slot: 'pelvis' },
    { part: 'apron', slot: 'pelvis' },
    { part: 'flesh-torso', slot: 'chest' },
    { part: 'shawl', slot: 'chest' },
    { part: 'flesh-arm', slot: 'shoulder', side: -1 },
    { part: 'flesh-arm', slot: 'shoulder', side: 1 },
    { part: 'flesh-hand', slot: 'hand', side: -1 },
    { part: 'flesh-hand', slot: 'hand', side: 1 },
    { part: 'flesh-head', slot: 'head', id: 'head' },
    { part: 'hair-tail', slot: 'head', on: 'head' },
  ],
};
