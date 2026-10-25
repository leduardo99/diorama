/**
 * Ingrid the Valkyrie, as outfit data: a living body (the flesh family, scaled with her
 * `humanoid(1.18)`) in plate — a winged helm over long dark wavy hair, a cuirass, plate pauldrons,
 * bracers, tassets over an olive skirt, plate greaves over boots — a crimson cape, the round shield
 * on her left forearm, a spear in her right hand, and spirit wings of soul fire folded on her back.
 * Her face is warm golden-brown with arched brows, a lash line and a calm half-smile at rest (the
 * flesh head's `smile`, `arch` and `lashes`).
 *
 * It is `OutfitData` like the guard's (`../guard/outfit.ts`): part ids and material names of the
 * catalog, so the viewer's customizer edits exactly what the game exports. `character.ts` draws it
 * with `outfitFromData(OUTFIT, CATALOG)`.
 *
 * Built to survive pitch: every trunk part follows the trunk, so the hit recoil and the death topple
 * carry it; the cape and the tassets drape on the floor once the body lies, the spear lies beside
 * her and the wings fade. The clips drive `weaponYaw` / `weaponPitch` (the spear), `wings` (the
 * spirit wings spread), `brow` and `mouth` (the face); `hurt` and `dead` reach the face and the wings.
 *
 * Detail tiers: primary = the winged helm, the spear, the cape, the shield, the spread wings in her
 * skill (silhouette); secondary = the hair falling from under the helm, the cuirass, the pauldrons,
 * the tassets, the greaves, the folded wings; tertiary = the gilded edges (helm band, wing feathers,
 * neckline and waist, pauldron rims, tasset hems, greave bands, the spear's bands), the cuirass's
 * keel, the spear's lugs and ridge, the face (lash line, smile).
 */

import type { OutfitData } from '@core/rig';

export const OUTFIT: OutfitData = {
  base: 'flesh-legs',
  // Which theme material plays each role of the gear kit for Ingrid: warm golden-brown skin and
  // near-black hair, polished steel plate with brass edges, an olive skirt (`moss`) under the tassets,
  // a crimson cape with a lighter edge, leather boots, the shield's painted planks and the spear's
  // shaft, the kit's pale blade for the spear's head, and the soul fire for the wings.
  materials: {
    skin: 'skinWarm',
    hair: 'hair',
    hollow: 'hollow',
    metal: 'steel',
    trim: 'brass',
    cloth: 'moss',
    cloak: 'sash',
    clothAccent: 'sashLit',
    leather: 'leather',
    wood: 'shield',
    blade: 'blade',
    glow: 'soul',
  },
  pieces: [
    { part: 'boot', slot: 'foot', side: -1 },
    { part: 'boot', slot: 'foot', side: 1 },
    { part: 'plate-greave', slot: 'shin', side: -1 },
    { part: 'plate-greave', slot: 'shin', side: 1 },
    { part: 'tunic', slot: 'pelvis', id: 'skirt', options: { hem: 13 } },
    { part: 'tassets', slot: 'pelvis' },
    { part: 'flesh-torso', slot: 'chest', id: 'torso' },
    { part: 'cuirass', slot: 'chest', on: 'torso' },
    { part: 'cloak', slot: 'back' },
    { part: 'spirit-wings', slot: 'back' },
    { part: 'flesh-arm', slot: 'shoulder', side: -1, id: 'armL' },
    { part: 'flesh-arm', slot: 'shoulder', side: 1 },
    { part: 'bracer', slot: 'forearm', side: -1, options: { size: 1.25 } },
    { part: 'bracer', slot: 'forearm', side: 1, options: { size: 1.25 } },
    { part: 'plate-pauldron', slot: 'shoulder', side: -1 },
    { part: 'plate-pauldron', slot: 'shoulder', side: 1 },
    { part: 'flesh-hand', slot: 'hand', side: -1 },
    { part: 'flesh-hand', slot: 'hand', side: 1 },
    { part: 'round-shield', slot: 'forearm', side: -1, on: 'armL', options: { radius: 7.6 } },
    { part: 'flesh-head', slot: 'head', id: 'head', options: { smile: 0.5, arch: 0.7, lashes: true } },
    { part: 'hair-waves', slot: 'head', on: 'head', id: 'hair' },
    { part: 'winged-helm', slot: 'head', on: 'hair' },
    { part: 'spear', slot: 'hand', side: 1, id: 'spear' },
  ],
};
