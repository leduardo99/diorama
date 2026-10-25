/**
 * Ingrid the Valkyrie, as outfit data.
 */

import type { OutfitData } from '@core/rig';

export const OUTFIT: OutfitData = {
  base: 'flesh-legs',
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
