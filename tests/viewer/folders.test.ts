import assert from 'node:assert/strict';
import { folderTree, searchFolders } from '../../viewer/src/lib/folders';

console.log('🧪 Checking the folder picker of the Assets filters (tree order, counts, depth, search by path)...\n');

// In no order: the catalog lists files as the disk gives them.
const subpaths = [
  'items/sub10/a.png',
  'loose.png',
  'gear/torso/apron.png',
  'characters-old/ghost.png',
  'characters/wolf/idle.png',
  'items/item10.png',
  'characters/captain/idle.png',
  'gear/belt.png',
  'items/sub2/a.png',
  'characters/captain/walk.png',
];
const tree = folderTree(subpaths);

// Tree order: a folder right after its parent, siblings by name (numbers read as numbers). Sorting whole paths would put
// characters-old between characters and characters/captain, under the wrong parent.
assert.deepEqual(
  tree.map((row) => row.path),
  ['characters', 'characters/captain', 'characters/wolf', 'characters-old', 'gear', 'gear/torso', 'items', 'items/sub2', 'items/sub10'],
);
// A folder counts every asset below it; a file at the root makes no folder.
const byPath = Object.fromEntries(tree.map((row) => [row.path, row]));
assert.equal(byPath.characters.count, 3);
assert.equal(byPath['characters/captain'].count, 2);
assert.equal(byPath.gear.count, 2, 'gear holds belt and, below it, torso/apron');
assert.equal(byPath['gear/torso'].count, 1);
// Its name is its last part, its depth how many folders hold it.
assert.deepEqual([byPath['gear/torso'].name, byPath['gear/torso'].depth], ['torso', 1]);
assert.deepEqual([byPath['characters-old'].name, byPath['characters-old'].depth], ['characters-old', 0]);
assert.deepEqual(folderTree(['a.png', 'b.png']), [], 'no folders, no rows');

// Search: every word somewhere in the path, in any case, the tree order kept; nothing typed shows them all.
assert.deepEqual(searchFolders(tree, '').map((row) => row.path), tree.map((row) => row.path));
assert.deepEqual(searchFolders(tree, '  ').length, tree.length);
assert.deepEqual(searchFolders(tree, 'CAPT').map((row) => row.path), ['characters/captain']);
assert.deepEqual(searchFolders(tree, 'gear torso').map((row) => row.path), ['gear/torso'], 'each word must match');
assert.deepEqual(searchFolders(tree, 'char/w').map((row) => row.path), [], 'a word is matched as written, not fuzzily');
assert.deepEqual(searchFolders(tree, 'items/sub').map((row) => row.path), ['items/sub2', 'items/sub10'], 'a word can span the separator');

console.log('✅ Folder picker checks passed');
