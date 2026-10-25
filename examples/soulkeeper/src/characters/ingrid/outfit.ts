/**
 * Ingrid the Valkyrie, as outfit data: a living body (the flesh family, scaled with her
 * `humanoid(1.18)`) in plate — a winged helm over long dark wavy hair, a fitted cuirass, plate
 * pauldrons, plate vambraces over olive sleeves, a leather glove, split tassets over a short olive
 * skirt, plate greaves over leather leggings and boots — a crimson cape, the round shield on her left
 * forearm, a spear in her right hand — the gloved fist closed on its shaft (`spear-fist`, resting on
 * the spear, so the shaft runs through the hand in every facing) — and spirit wings of soul fire
 * folded on her back.
 * Her build is slim and athletic, not bulky: a slighter trunk (`flesh-torso` `width`) under a
 * cuirass that ends at the waist and tapers to it, shoulders about the guard's width at her scale
 * (small layered pauldrons that slope with the shoulder), arms of a believable thickness in fitted
 * sleeves, tassets that hang from the waist and part at the front, a skirt that rises to the waist
 * (`waist`) and ends high on the thigh, and long slim legs. The plate is the darker `armor` steel,
 * so it reads as metal (a dark base, lit edges, a core shadow); the gilt runs only along plate edges
 * and the keel.
 * Her face is made to read at its real size, about 14 pixels across: an oval face of warm
 * golden-brown (`oval`, no `ears` under the hair), dark eyes with whites and a lash line
 * (`eyeSize`, `eyeSpacing`, `whites`, `lashes`), arched brows (`arch`, `browWidth`), a soft nose with no line
 * (`nose`), rose lips in a calm half-smile (`smile`, `mouthWidth`, the `lips` role), turned a little
 * to the camera in the 3/4 views (`turn`), so both eyes read there. The helm's rim rides up the
 * forehead (`rise`) and the hair sweeps off it and frames the face from the temples (`hairline`).
 *
 * It is `OutfitData` like the guard's (`../guard/outfit.ts`): part ids and material names of the
 * catalog, so the viewer's customizer edits exactly what the game exports. `character.ts` draws it
 * with `outfitFromData(OUTFIT, CATALOG)`.
 *
 * Built to survive pitch: every trunk part follows the trunk, so the hit recoil and the death topple
 * carry it; the leggings cover the hips under the short skirt, so no skin shows once she lies; the
 * cape and the tassets drape on the floor once the body lies, the spear lies beside
 * her and the wings fade. The clips drive `weaponYaw` / `weaponPitch` (the spear), `wings` (the
 * spirit wings spread), `brow` and `mouth` (the face); `hurt` and `dead` reach the face and the wings.
 *
 * Detail tiers: primary = the winged helm, the spear, the cape, the shield, the spread wings in her
 * skill (silhouette); secondary = the hair falling from under the helm, the cuirass, the pauldrons,
 * the sleeves and vambraces, the tassets, the greaves, the folded wings; tertiary = the gilded edges
 * (helm band, wing feathers, neckline and waist, the keel's line, pauldron rims, vambrace cuffs,
 * tasset hems, the spear's bands), the knee cops, the spear's lugs and ridge, the face (brows, eyes,
 * lips).
 */

import type { OutfitData } from '@core/rig';

export const OUTFIT: OutfitData = {
  base: 'flesh-legs',
  // Which theme material plays each role of the gear kit for Ingrid: warm golden-brown skin and
  // near-black hair, her eyes (`hollow`) in the hair's warm near-black rather than the ink of a
  // skull's sockets, rose lips, polished armour steel with brass edges, olive cloth (`moss`) for the
  // skirt under the tassets and the sleeves under the vambraces, a crimson cape with a lighter edge,
  // leather leggings, glove, fist and boots, dark wood for the shield's painted planks and the spear's
  // shaft (darker than her skin, so the shaft never merges with the forearm beside it), the kit's
  // pale blade for the spear's head, and the soul fire for the wings.
  materials: {
    skin: 'skinWarm',
    hair: 'hair',
    hollow: 'hair',
    lips: 'lips',
    metal: 'armor',
    trim: 'brass',
    cloth: 'moss',
    cloak: 'sash',
    clothAccent: 'sashLit',
    leather: 'leather',
    wood: 'wood',
    blade: 'blade',
    glow: 'soul',
  },
  pieces: [
    { part: 'boot', slot: 'foot', side: -1 },
    { part: 'boot', slot: 'foot', side: 1 },
    { part: 'leggings', slot: 'thigh', side: -1, id: 'legL' },
    { part: 'leggings', slot: 'thigh', side: 1, id: 'legR' },
    { part: 'plate-greave', slot: 'shin', side: -1, on: 'legL' },
    { part: 'plate-greave', slot: 'shin', side: 1, on: 'legR' },
    { part: 'flesh-torso', slot: 'chest', id: 'torso', options: { width: 0.8, bottom: 12 } },
    { part: 'tunic', slot: 'pelvis', id: 'skirt', options: { hem: 6, waist: 10.5, width: 0.86 } },
    { part: 'tassets', slot: 'pelvis', on: 'skirt' },
    { part: 'cuirass', slot: 'chest', on: 'torso' },
    { part: 'cloak', slot: 'back' },
    { part: 'spirit-wings', slot: 'back' },
    { part: 'fitted-sleeve', slot: 'shoulder', side: -1, id: 'armL' },
    { part: 'fitted-sleeve', slot: 'shoulder', side: 1, id: 'armR' },
    { part: 'plate-vambrace', slot: 'forearm', side: -1, on: 'armL', id: 'vambraceL' },
    { part: 'plate-vambrace', slot: 'forearm', side: 1, on: 'armR' },
    { part: 'plate-pauldron', slot: 'shoulder', side: -1 },
    { part: 'plate-pauldron', slot: 'shoulder', side: 1 },
    { part: 'glove', slot: 'hand', side: -1, options: { size: 0.72 } },
    { part: 'round-shield', slot: 'forearm', side: -1, on: 'vambraceL', options: { radius: 7.6 } },
    {
      part: 'flesh-head', slot: 'head', id: 'head',
      options: { smile: 0.6, arch: 0.7, lashes: true, turn: 0.4, eyeSize: 0.85, eyeSpacing: 0.96, whites: true, browWidth: 0.8, nose: 'soft', mouthWidth: 0.8, ears: false, oval: 0.6 },
    },
    { part: 'hair-waves', slot: 'head', on: 'head', id: 'hair', options: { hairline: 0.8, volume: 0.65 } },
    { part: 'winged-helm', slot: 'head', on: 'hair', options: { rise: 0.35 } },
    { part: 'spear', slot: 'hand', side: 1, id: 'spear' },
    { part: 'spear-fist', slot: 'hand', side: 1, on: 'spear' },
  ],
};
