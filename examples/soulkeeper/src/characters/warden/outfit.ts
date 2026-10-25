/**
 * Ossuary warden outfit, as data: a living body (the flesh family) under a hood — the face reads
 * beneath it, with a cropped fringe at the rim — a coat with sleeves, a cloak over the shoulders,
 * gloves, boots and a notched sword.
 * The hood and the cloak are the kit's soft garments (`../../gear/clothes.ts`); the body is the
 * flesh parts of `../../gear/flesh.ts`.
 *
 * It is `OutfitData` like the guard's (`../guard/outfit.ts`): part ids and material names of the
 * catalog, so the viewer's customizer edits exactly what the game exports. `character.ts` draws it
 * with `outfitFromData(OUTFIT, CATALOG)`.
 *
 * Built to survive pitch like the guard's: every trunk part follows the trunk, so the hit recoil
 * and the death topple carry it; the cloak's fall drapes on the floor once the body lies and the
 * face turns to the camera. `extra.hurt` furrows the warden's brow, parts her lips and squints her
 * eyes; `extra.dead` closes them.
 *
 * Detail tiers: primary = hood, cloak, the face beneath (silhouette); secondary = coat, tunic,
 * boots, gloves; tertiary = belt, smear.
 */

import type { OutfitData } from '@core/rig';

export const OUTFIT: OutfitData = {
  base: 'flesh-legs',
  // Which theme material plays each role of the gear kit for the warden: violet cloth for the
  // coat and hood with a lighter sash trim, a weathered grey-tan cloak (the `cloak` role) so the
  // three masses separate in value and hue, living skin, brown hair, iron fittings, the kit's
  // pale blade.
  materials: {
    skin: 'skin',
    hair: 'wood',
    hollow: 'hollow',
    cloth: 'robe',
    cloak: 'timber',
    clothAccent: 'sashLit',
    leather: 'leather',
    metal: 'iron',
    blade: 'blade',
    glow: 'soul',
  },
  pieces: [
    { part: 'boot', slot: 'foot', side: -1 },
    { part: 'boot', slot: 'foot', side: 1 },
    { part: 'leg-wraps', slot: 'shin', side: -1 },
    { part: 'leg-wraps', slot: 'shin', side: 1 },
    { part: 'tunic', slot: 'pelvis', id: 'tunic' },
    { part: 'belt', slot: 'pelvis', on: 'tunic' },
    { part: 'flesh-torso', slot: 'chest', id: 'torso' },
    { part: 'coat-torso', slot: 'chest', on: 'torso', options: { ease: 1.3 } },
    { part: 'cloak', slot: 'back' },
    { part: 'flesh-arm', slot: 'shoulder', side: -1 },
    { part: 'flesh-arm', slot: 'shoulder', side: 1 },
    { part: 'coat-sleeve', slot: 'shoulder', side: -1 },
    { part: 'coat-sleeve', slot: 'shoulder', side: 1 },
    { part: 'glove', slot: 'hand', side: -1 },
    { part: 'flesh-head', slot: 'head', id: 'head' },
    { part: 'hair-crop', slot: 'head', on: 'head' },
    { part: 'hood', slot: 'head', on: 'head' },
    { part: 'notched-sword', slot: 'hand', side: 1, id: 'blade' },
    { part: 'weapon-smear', slot: 'hand', side: 1, on: 'blade' },
  ],
};
