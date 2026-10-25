/**
 * The gear catalog of Soulkeeper: the kit as an editor sees it, and the characters it can dress.
 * The viewer's customizer loads this module (`CATALOG`, `CHARACTERS`) and `new-outfit-character`
 * reads it; saved outfits (`OutfitData`) name parts, bases and materials by the ids below.
 *
 * - `CATALOG.parts`: one `PartInfo` for every part of the kit: a kebab-case id, the label shown in
 *   the picker (UI copy is English), the group it is listed under, the slots it fits, the material
 *   roles it reads (every role its code asks for, fallbacks included, most specific first), its
 *   options with the part's own defaults, and `requires` for the add-ons that rest on another part
 *   (a crest on a helm, a smear on a blade). `kind: 'body'` marks the bones under the gear (skull,
 *   ribs, limbs, the fist on the scythe); `equip` names the equipment slot a part takes alone (helm,
 *   pauldron, weapon, shield, greave, bracer, belt, coat), so swapping and equipping replace it.
 *   `wield` says how the sword (blade), the scythe (polearm) and the shield are held, and gives the
 *   sword and the scythe their sockets (`tip`, `lantern`), so a character's tip follows its weapon.
 * - `CATALOG.bases`: the base bodies an outfit is drawn over (the bone legs).
 * - `CATALOG.materials`: the theme's `VOLUMES`, by name.
 * - `CHARACTERS`: the guard, Malvek and the captain: each one's rig (label, skeleton, clips with
 *   their frames, camera, cell, pivot, shadow, sockets: `characters/<name>/spec.ts`) and the outfit
 *   it wears (`characters/<name>/outfit.ts`). Each character's `character.ts` spreads that same rig,
 *   so the customizer and the exported manifest show one name, and draws that same outfit with
 *   `outfitFromData(OUTFIT, CATALOG)`, so what the customizer edits is what the game exports.
 *
 * Adding a part: export it from its kit file, list it here (its defaults must be the part's own),
 * and give it a group, slots and roles. The catalog is not re-exported by `index.ts`: it imports the
 * characters' rigs, which import the kit.
 *
 * Groups: head (skulls, helms, crowns, crests), shoulders, torso (coats, tunics, tabards, collars),
 * garments (belts, limb wear, sleeves, hip pieces), weapons, shields, effects (what a weapon or a
 * hand leaves in the air), bodies (bone limbs, spine, rib cage, hands).
 */

import type { BaseInfo, GearCatalog, OutfitCharacterInfo, PartInfo, PartOption } from '@core/rig';
import { VOLUMES } from '../theme';
import { CAPTAIN_RIG } from '../characters/captain/spec';
import { OUTFIT as CAPTAIN_OUTFIT } from '../characters/captain/outfit';
import { GUARD_RIG } from '../characters/guard/spec';
import { OUTFIT as GUARD_OUTFIT } from '../characters/guard/outfit';
import { MALVEK_RIG } from '../characters/malvek/spec';
import { OUTFIT as MALVEK_OUTFIT } from '../characters/malvek/outfit';
import {
  SHIELD_RADIUS, SWORD_BLADE,
  baldric, belt, boneArm, boneHand, boneLeg, boneLegs, boneSkull, boneSpine, bracer, chargedEdge, coatSleeve, coatTorso, fireCrown, greave, grimoire,
  groundShockwave, helmCrest, highCollar, hornedHelm, lamedPauldron, legWraps, longCoat, notchedSword, palmFlame, pouch, reaperScythe, ribBreastplate,
  ribCage, roundShield, sashTail, scytheFist, scytheHeld, scytheSmear, skullBuckle, skullPauldron, skullSutures, soulLantern, swordHeld, tabard, tunic,
  weaponSmear,
} from '.';

// ----------------------------------------------------------------------------------------------
// Option builders: the part's own default goes in, a range an editor can sweep comes with it.
// ----------------------------------------------------------------------------------------------

const num = (key: string, label: string, def: number, min: number, max: number, step = 0.05): PartOption => ({ key, label, type: 'number', default: def, min, max, step });
const flag = (key: string, label: string, def = true): PartOption => ({ key, label, type: 'boolean', default: def });
/** Which hip a piece hangs on (the parts accept the select's strings; their own default is -1, the left hip). */
const hip = (label: string): PartOption => ({
  key: 'side',
  label,
  type: 'select',
  default: '-1',
  choices: [{ value: '-1', label: 'Left' }, { value: '1', label: 'Right' }],
});
/** A seed picks which random tears, tongues or sparks a part draws: the part's own seed first, then two others. */
const variation = (def: string): PartOption => ({
  key: 'seed',
  label: 'Variation',
  type: 'select',
  default: def,
  choices: [{ value: def, label: 'Default' }, { value: `${def}-b`, label: 'Variation B' }, { value: `${def}-c`, label: 'Variation C' }],
});
const size = (def = 1, min = 0.7, max = 1.4, step = 0.05) => num('size', 'Size', def, min, max, step);
const bladeLength = () => num('length', 'Blade length (same as the sword)', SWORD_BLADE, 14, 40, 1);

// ----------------------------------------------------------------------------------------------
// Parts
// ----------------------------------------------------------------------------------------------

const PARTS: PartInfo[] = [
  // Head: the skull and what sits on it.
  { id: 'bone-skull', label: 'Skull', group: 'head', kind: 'body', part: boneSkull, slots: ['head'], roles: ['bone', 'hollow', 'glow'] },
  { id: 'skull-sutures', label: 'Skull sutures', group: 'head', kind: 'body', part: skullSutures, slots: ['head'], roles: ['boneGroove', 'hollow'], requires: 'bone-skull' },
  {
    id: 'horned-helm', label: 'Horned helm', group: 'head', equip: 'helm', part: hornedHelm, slots: ['head'], roles: ['metal', 'bone'], requires: 'bone-skull',
    options: [
      size(1, 0.8, 1.3, 0.01),
      flag('horns', 'Horns'),
      num('hornSize', 'Horn size', 1, 0.5, 1.6),
      flag('nasal', 'Nasal bar'),
    ],
  },
  {
    id: 'fire-crown', label: 'Fire crown', group: 'head', equip: 'helm', part: fireCrown, slots: ['head'], roles: ['glow'], requires: 'bone-skull',
    options: [num('tongues', 'Flames', 11, 5, 15, 1), size(1, 0.6, 1.8), variation('fire-crown')],
  },
  {
    id: 'helm-crest', label: 'Helm crest', group: 'head', part: helmCrest, slots: ['head'], roles: ['metal', 'plume', 'clothAccent', 'cloth'], requires: 'horned-helm',
    options: [
      size(1, 0.8, 1.4, 0.01),
      num('strands', 'Loose strands', 2, 0, 3, 1),
      num('sway', 'Sway', 0.5, 0, 1.2),
      flag('comb', 'Metal comb'),
    ],
  },

  // Shoulders.
  {
    id: 'lamed-pauldron', label: 'Lamed pauldron', group: 'shoulders', equip: 'pauldron', part: lamedPauldron, slots: ['shoulder'], roles: ['metal'],
    options: [num('lames', 'Lames', 2, 1, 4, 1), flag('spike', 'Spike'), flag('rivets', 'Rivets'), size()],
  },
  {
    id: 'skull-pauldron', label: 'Skull pauldron', group: 'shoulders', equip: 'pauldron', part: skullPauldron, slots: ['shoulder'], roles: ['metal', 'bone', 'hollow'],
    options: [size(), flag('spikes', 'Spikes')],
  },

  // Torso: what is worn around the trunk.
  { id: 'tunic', label: 'Tunic', group: 'torso', part: tunic, slots: ['pelvis'], roles: ['cloth'], options: [num('hem', 'Hem', 9, 5, 14, 0.5)] },
  {
    id: 'tabard', label: 'Tabard', group: 'torso', part: tabard, slots: ['pelvis'], roles: ['clothAccent'],
    options: [num('length', 'Length', 14, 8, 24, 1), num('width', 'Width', 6.4, 4, 12, 0.2)],
  },
  { id: 'baldric', label: 'Baldric', group: 'torso', part: baldric, slots: ['shoulder'], roles: ['leather'], options: [num('width', 'Width', 1.5, 0.8, 2.6, 0.1)] },
  { id: 'coat-torso', label: 'Coat (torso)', group: 'torso', equip: 'coat', part: coatTorso, slots: ['chest'], roles: ['cloth'] },
  {
    id: 'rib-breastplate', label: 'Rib breastplate', group: 'torso', part: ribBreastplate, slots: ['chest'], roles: ['boneLimb', 'bone', 'hollow'], requires: 'coat-torso',
    options: [num('ribs', 'Rib pairs', 5, 3, 6, 1)],
  },
  { id: 'high-collar', label: 'High collar', group: 'torso', part: highCollar, slots: ['chest'], roles: ['cloth', 'clothAccent'], options: [num('height', 'Height', 1, 0.7, 1.5)] },
  // `length` is left out: by default it follows the skeleton (down to a hand above the ankles), so it has no fixed default to offer.
  { id: 'long-coat', label: 'Long coat (skirt)', group: 'torso', part: longCoat, slots: ['pelvis'], roles: ['cloth'], options: [variation('long-coat')] },

  // Garments: belts, hip pieces, limb wear and sleeves.
  { id: 'belt', label: 'Belt', group: 'garments', equip: 'belt', part: belt, slots: ['pelvis'], roles: ['leather', 'metal'], options: [flag('buckle', 'Buckle')] },
  { id: 'pouch', label: 'Pouch', group: 'garments', part: pouch, slots: ['pelvis'], roles: ['leather'], options: [hip('Hip')] },
  { id: 'greave', label: 'Greave', group: 'garments', equip: 'greave', part: greave, slots: ['shin'], roles: ['metal'], options: [flag('kneeCop', 'Knee cop')] },
  { id: 'bracer', label: 'Bracer', group: 'garments', equip: 'bracer', part: bracer, slots: ['forearm'], roles: ['metal'], options: [size(1, 0.8, 1.4)] },
  { id: 'leg-wraps', label: 'Leg wraps', group: 'garments', equip: 'greave', part: legWraps, slots: ['shin'], roles: ['leather'], options: [num('count', 'Wraps', 2, 0, 3, 1)] },
  { id: 'coat-sleeve', label: 'Coat sleeve', group: 'garments', part: coatSleeve, slots: ['shoulder'], roles: ['cloth', 'clothAccent'] },
  {
    id: 'sash-tail', label: 'Sash tail', group: 'garments', part: sashTail, slots: ['pelvis'], roles: ['clothAccent'], requires: 'belt',
    options: [hip('Buckle side'), num('length', 'Length', 17, 8, 26, 1)],
  },
  { id: 'skull-buckle', label: 'Skull buckle', group: 'garments', part: skullBuckle, slots: ['pelvis'], roles: ['bone', 'hollow'], requires: 'belt' },
  { id: 'grimoire', label: 'Grimoire', group: 'garments', part: grimoire, slots: ['pelvis'], roles: ['clothAccent', 'metal', 'bone', 'glow'], options: [hip('Hip')] },

  // Weapons.
  {
    id: 'notched-sword', label: 'Notched sword', group: 'weapons', equip: 'weapon', wield: { class: 'blade', sockets: { tip: (pose, skeleton, p) => swordHeld(pose, skeleton, p.side, (p.options.length as number | undefined) ?? SWORD_BLADE).tip } }, part: notchedSword, slots: ['hand'], roles: ['blade', 'metalAccent', 'metal', 'leather', 'glow'],
    options: [
      num('length', 'Blade length', SWORD_BLADE, 14, 40, 1),
      flag('notch', 'Notch'),
      flag('fuller', 'Fuller'),
      flag('runes', 'Runes'),
      flag('guard', 'Guard'),
      flag('grip', 'Grip'),
      flag('pommel', 'Pommel'),
    ],
  },
  {
    id: 'reaper-scythe', label: "Reaper's scythe", group: 'weapons', equip: 'weapon', wield: { class: 'polearm', sockets: { tip: (pose, skeleton, p) => scytheHeld(pose, skeleton, p.side).tip, lantern: (pose, skeleton, p) => scytheHeld(pose, skeleton, p.side).lantern } }, part: reaperScythe, slots: ['hand'], roles: ['wood', 'metal', 'blade', 'metalAccent'],
    options: [flag('etched', 'Etchings'), flag('bands', 'Iron bands')],
  },
  { id: 'scythe-fist', label: 'Fist on the scythe', group: 'weapons', kind: 'body', part: scytheFist, slots: ['hand'], roles: ['boneLimb', 'bone'], requires: 'reaper-scythe' },
  { id: 'soul-lantern', label: 'Soul lantern', group: 'weapons', part: soulLantern, slots: ['hand'], roles: ['metal', 'glow'], requires: 'reaper-scythe' },

  // Shields.
  {
    id: 'round-shield', label: 'Round shield', group: 'shields', equip: 'shield', wield: { class: 'shield', offHand: 'hold' }, part: roundShield, slots: ['forearm'], roles: ['wood', 'woodSeam', 'metal', 'clothAccent'],
    options: [num('radius', 'Radius', SHIELD_RADIUS, 4.5, 9, 0.1), flag('boss', 'Boss'), flag('rim', 'Rim'), flag('band', 'Painted band'), flag('planks', 'Planks')],
  },

  // Effects: what a weapon or a hand leaves in the air during a clip.
  {
    id: 'weapon-smear', label: 'Weapon trail', group: 'effects', part: weaponSmear, slots: ['hand'], roles: ['glow', 'blade', 'metalAccent', 'metal'], requires: 'notched-sword',
    options: [bladeLength()],
  },
  { id: 'charged-edge', label: 'Charged edge', group: 'effects', part: chargedEdge, slots: ['hand'], roles: ['glow'], requires: 'notched-sword', options: [bladeLength()] },
  {
    id: 'ground-shockwave', label: 'Shockwave', group: 'effects', part: groundShockwave, slots: ['hand'], roles: ['glow'], requires: 'notched-sword',
    options: [bladeLength(), num('seconds', 'Duration (s)', 0.27, 0.15, 0.5, 0.01), num('arc', 'Arc', 2.1, 1.2, 3, 0.05), variation('soul-cleave')],
  },
  {
    id: 'scythe-smear', label: 'Scythe trail', group: 'effects', part: scytheSmear, slots: ['hand'], roles: ['glow', 'blade', 'metalAccent', 'metal'], requires: 'reaper-scythe',
    options: [num('lead', 'Lead', 0.2, 0.05, 0.4, 0.01), num('span', 'Reach', 0.1, 0.03, 0.25, 0.01), num('width', 'Width', 30, 10, 50, 1)],
  },
  {
    id: 'palm-flame', label: 'Palm flame', group: 'effects', part: palmFlame, slots: ['hand'], roles: ['glow'], requires: 'bone-hand',
    options: [num('size', 'Size', 3.1, 2, 5, 0.1), num('burst', 'Burst duration (s)', 0.22, 0.1, 0.5, 0.01)],
  },

  // Bodies: the bones a skeleton warrior wears its gear on.
  { id: 'bone-leg', label: 'Bone leg', group: 'bodies', kind: 'body', part: boneLeg, slots: ['thigh'], roles: ['boneLimb', 'bone'] },
  { id: 'bone-spine', label: 'Bone spine', group: 'bodies', kind: 'body', part: boneSpine, slots: ['chest'], roles: ['boneLimb', 'bone'] },
  { id: 'rib-cage', label: 'Rib cage', group: 'bodies', kind: 'body', part: ribCage, slots: ['chest'], roles: ['boneLimb', 'bone', 'hollow'] },
  { id: 'bone-arm', label: 'Bone arm', group: 'bodies', kind: 'body', part: boneArm, slots: ['shoulder'], roles: ['boneLimb', 'bone'] },
  { id: 'bone-hand', label: 'Open bone hand', group: 'bodies', kind: 'body', part: boneHand, slots: ['hand'], roles: ['boneLimb', 'bone'] },
];

const BASES: BaseInfo[] = [
  { id: 'bone-legs', label: 'Bone legs', skin: boneLegs, roles: ['boneLimb', 'bone'] },
];

export const CATALOG: GearCatalog = {
  parts: PARTS,
  bases: BASES,
  materials: VOLUMES,
};

// ----------------------------------------------------------------------------------------------
// Characters
// ----------------------------------------------------------------------------------------------

export const CHARACTERS: OutfitCharacterInfo[] = [
  { id: 'guard', ...GUARD_RIG, outfit: GUARD_OUTFIT },
  { id: 'malvek', ...MALVEK_RIG, outfit: MALVEK_OUTFIT },
  { id: 'captain', ...CAPTAIN_RIG, outfit: CAPTAIN_OUTFIT },
];
