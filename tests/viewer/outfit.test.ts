import assert from 'node:assert/strict';
import type { GearCatalog, OutfitData, PartInfo } from '../../core/rig';
import {
  addPiece, canMove, hostCandidates, isPaired, movePiece, optionValue, partsBySlot, pieceKeys, removePiece, reorderPiece, rolesOf,
  setBase, setHost, setMaterial, setOption, setPieceMaterial, setSide, setSlot, splitRoles,
} from '../../viewer/src/lib/outfit/edit';

console.log('🧪 Checking the customizer\'s outfit edits (add, remove, order, hosts, options, materials)...\n');

const part = (id: string, group: string, slots: PartInfo['slots'], extra: Partial<PartInfo> = {}): PartInfo =>
  ({ id, label: id, group, part: () => {}, slots, roles: ['metal'], ...extra });

const helm = part('helm', 'head', ['head'], {
  options: [
    { key: 'size', label: 'Size', type: 'number', default: 1, min: 0.5, max: 2 },
    { key: 'visor', label: 'Visor', type: 'boolean', default: true },
  ],
});
const crest = part('crest', 'head', ['head'], { requires: 'helm', roles: ['cloth'] });
const pauldron = part('pauldron', 'shoulders', ['shoulder', 'upperArm'], { roles: ['metal', 'metalAccent'] });
const cape = part('cape', 'garments', ['back'], { roles: ['cloth'] });
const catalog: GearCatalog = {
  parts: [helm, crest, pauldron, cape],
  bases: [{ id: 'bone', label: 'Bone', skin: () => {}, roles: ['boneLimb', 'bone'] }],
  materials: {},
};

const empty: OutfitData = { base: 'bone', materials: { metal: 'iron' }, pieces: [] };

// 1. Adding: one piece for a central slot, one per side for a paired slot, each with its own id.
assert.equal(isPaired('shoulder'), true);
assert.equal(isPaired('head'), false);
let outfit = addPiece(empty, helm, { slot: 'head' });
assert.deepEqual(outfit.pieces, [{ part: 'helm', slot: 'head', id: 'helm' }]);
assert.deepEqual(empty.pieces, [], 'the outfit it was given is left alone');
outfit = addPiece(outfit, pauldron, { slot: 'shoulder', sides: [1, -1] });
assert.deepEqual(outfit.pieces.slice(1).map((p) => [p.id, p.side]), [['pauldron-right', 1], ['pauldron-left', -1]]);
outfit = addPiece(outfit, pauldron, { slot: 'shoulder' });
assert.equal(outfit.pieces.at(-1)?.id, 'pauldron-right-2', 'ids stay unique');
assert.equal(outfit.pieces.at(-1)?.side, 1, 'a paired slot without a side takes the right one');

// 2. Hosts: an add-on rests on a piece of the part it requires; removing the host takes its add-ons along.
outfit = addPiece(outfit, crest, { slot: 'head', on: 'helm' });
const crestIndex = outfit.pieces.length - 1;
assert.deepEqual(hostCandidates(outfit, crestIndex, crest), [0], 'only the helm matches "requires"');
assert.deepEqual(hostCandidates(outfit, 2, pauldron), [0, 1], 'a part with no requirement may rest on any earlier piece');
const noHostId = { ...empty, pieces: [{ part: 'helm', slot: 'head' as const }, { part: 'crest', slot: 'head' as const }] };
const hosted = setHost(noHostId, 1, 0);
assert.equal(hosted.pieces[0].id, 'helm', 'the host gets an id when it had none');
assert.equal(hosted.pieces[1].on, 'helm');
assert.equal('on' in setHost(hosted, 1, null).pieces[1], false);
const removed = removePiece(outfit, catalog, 0);
assert.equal(removed.removed, 2, 'the helm and the crest resting on it');
assert.deepEqual(removed.outfit.pieces.map((p) => p.part), ['pauldron', 'pauldron', 'pauldron']);
assert.equal(removePiece(outfit, catalog, 1).removed, 1);

// 3. Order: a piece never goes before its host nor after what rests on it.
assert.equal(canMove(outfit, 0, -1), false);
assert.equal(canMove(outfit, crestIndex, -1), true);
assert.equal(canMove(outfit, crestIndex, 1), false, 'last piece');
const stacked = addPiece(addPiece(empty, helm, { slot: 'head' }), crest, { slot: 'head', on: 'helm' });
assert.equal(canMove(stacked, 1, -1), false, 'the crest cannot go before the helm');
assert.equal(canMove(stacked, 0, 1), false, 'nor the helm after the crest');
assert.deepEqual(movePiece(stacked, 1, -1), stacked, 'a blocked move changes nothing');
assert.deepEqual(movePiece(outfit, 1, 1).pieces.map((p) => p.id).slice(0, 3), ['helm', 'pauldron-left', 'pauldron-right']);

// 3b. A drag in the list moves a piece over several places at once, under the same rule as the arrows.
const ids = (o: OutfitData) => o.pieces.map((p) => p.id);
assert.deepEqual(ids(outfit), ['helm', 'pauldron-right', 'pauldron-left', 'pauldron-right-2', 'crest']);
assert.deepEqual(ids(reorderPiece(outfit, 3, 1)), ['helm', 'pauldron-right-2', 'pauldron-right', 'pauldron-left', 'crest'], 'up two places');
assert.deepEqual(ids(reorderPiece(outfit, 1, 3)), ['helm', 'pauldron-left', 'pauldron-right-2', 'pauldron-right', 'crest'], 'down two places');
assert.deepEqual(ids(reorderPiece(outfit, 0, 3)), ['pauldron-right', 'pauldron-left', 'pauldron-right-2', 'helm', 'crest'], 'the helm may pass what does not rest on it');
assert.deepEqual(ids(reorderPiece(outfit, 4, 1)), ['helm', 'crest', 'pauldron-right', 'pauldron-left', 'pauldron-right-2'], 'the crest may go up to just after its helm');
assert.equal(reorderPiece(outfit, 4, 0), outfit, 'the crest never goes before its helm: the outfit comes back as it was');
assert.equal(reorderPiece(outfit, 0, 4), outfit, 'nor the helm after its crest');
assert.equal(reorderPiece(outfit, 2, 2), outfit, 'no move, no new outfit (no undo step)');
assert.equal(reorderPiece(outfit, 2, 9), outfit, 'a place outside the list is refused');
assert.equal(outfit.pieces.length, 5, 'the outfit it was given is left alone');

// 3c. Keys that follow the pieces when the order changes: ids when they have them, else part, place and side, counted.
assert.deepEqual(pieceKeys(reorderPiece(outfit, 3, 1)), ['id:helm', 'id:pauldron-right-2', 'id:pauldron-right', 'id:pauldron-left', 'id:crest']);
const anonymous: OutfitData = { ...empty, pieces: [
  { part: 'pauldron', slot: 'shoulder', side: 1 },
  { part: 'pauldron', slot: 'shoulder', side: -1 },
  { part: 'pauldron', slot: 'shoulder', side: 1 },
  { part: 'helm', slot: 'head' },
] };
const keys = pieceKeys(anonymous);
assert.deepEqual(keys, ['part:pauldron:shoulder:1', 'part:pauldron:shoulder:-1', 'part:pauldron:shoulder:1#2', 'part:helm:head:0']);
assert.equal(new Set(keys).size, keys.length, 'every key is unique, alike pieces included');
assert.deepEqual(pieceKeys(reorderPiece(anonymous, 3, 0)), [keys[3], keys[0], keys[1], keys[2]], 'each piece keeps its key when another passes it');

// 4. Slots and sides.
const moved = setSlot(addPiece(empty, pauldron, { slot: 'shoulder', sides: [-1] }), 0, 'upperArm');
assert.deepEqual([moved.pieces[0].slot, moved.pieces[0].side], ['upperArm', -1], 'a paired slot keeps its side');
const central = setSlot(addPiece(empty, helm, { slot: 'head' }), 0, 'head');
assert.equal('side' in central.pieces[0], false);
assert.equal(setSide(moved, 0, 1).pieces[0].side, 1);

// 5. Options: only what differs from the default is stored.
const sizeOption = helm.options![0];
let tuned = setOption(addPiece(empty, helm, { slot: 'head' }), 0, sizeOption, 1.5);
assert.deepEqual(tuned.pieces[0].options, { size: 1.5 });
assert.equal(optionValue(tuned.pieces[0], sizeOption), 1.5);
assert.equal(optionValue(tuned.pieces[0], helm.options![1]), true, 'untouched options show their default');
tuned = setOption(tuned, 0, sizeOption, 1);
assert.equal('options' in tuned.pieces[0], false, 'back to the default removes the key and the empty map');

// 6. Materials: per role for the outfit, and per piece as an override; empty maps disappear.
assert.deepEqual(setMaterial(empty, 'cloth', 'sash').materials, { metal: 'iron', cloth: 'sash' });
assert.deepEqual(setMaterial(empty, 'metal', undefined).materials, {});
let gilded = setPieceMaterial(addPiece(empty, helm, { slot: 'head' }), 0, 'metal', 'bronze');
assert.deepEqual(gilded.pieces[0].materials, { metal: 'bronze' });
gilded = setPieceMaterial(gilded, 0, 'metal', undefined);
assert.equal('materials' in gilded.pieces[0], false);
assert.equal('base' in setBase(empty, undefined), false);
assert.equal(setBase(empty, 'bone').base, 'bone');

// 7. Roles the editor offers a material for: the base's and those of the parts in use.
assert.deepEqual(rolesOf(empty, catalog), { main: ['bone'], advanced: ['boneLimb'] }, 'the body\'s limb tone is a refinement of its bone');
// metalAccent falls back to metal, so it is advanced; the rest need a choice.
assert.deepEqual(rolesOf(addPiece(addPiece(empty, pauldron, { slot: 'shoulder' }), cape, { slot: 'back' }), catalog), { main: ['bone', 'metal', 'cloth'], advanced: ['boneLimb', 'metalAccent'] });
assert.deepEqual(splitRoles(['boneLimb', 'bone', 'hollow']), { main: ['bone', 'hollow'], advanced: ['boneLimb'] });
assert.deepEqual(splitRoles(['wood', 'woodSeam', 'metal', 'clothAccent']), { main: ['wood', 'metal', 'clothAccent'], advanced: ['woodSeam'] }, 'a refinement without its base in the list is a main role');
assert.deepEqual(splitRoles(['blade', 'metalAccent', 'metal', 'glow']), { main: ['blade', 'metal', 'glow'], advanced: ['metalAccent'] });
assert.deepEqual(splitRoles(['metals', 'metal']), { main: ['metals', 'metal'], advanced: [] }, 'only a capital letter after the base makes a refinement');

// A role one piece refines and another needs is a main role.
const lamp = part('lamp', 'weapons', ['hand'], { roles: ['metalAccent'] });
const mixed = { ...catalog, parts: [...catalog.parts, lamp] };
assert.deepEqual(rolesOf(addPiece(addPiece(empty, pauldron, { slot: 'shoulder' }), lamp, { slot: 'hand' }), mixed), { main: ['bone', 'metal', 'metalAccent'], advanced: ['boneLimb'] });

// 8. The picker groups parts in catalog order and filters them by slot.
assert.deepEqual(partsBySlot(catalog).map((g) => [g.group, g.parts.map((p) => p.id)]), [['head', ['helm', 'crest']], ['shoulders', ['pauldron']], ['garments', ['cape']]]);
assert.deepEqual(partsBySlot(catalog, 'back').map((g) => g.group), ['garments']);
assert.deepEqual(partsBySlot(catalog, 'foot'), []);

console.log('✅ viewer outfit edit checks passed');
