import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildAssetCatalog, buildProjectCatalog } from '../../viewer/server/catalog';
import { createTranslator } from '../../viewer/src/i18n/core';
import { characterLabel, detailsTitle, readableName, roleDetail, roleOf } from '../../viewer/src/lib/asset-role';
import { exportTarget, isStale, pendingExports, progressPercent, projectTotals } from '../../viewer/src/lib/export-state';
import { clipsOf, groupAnimations } from '../../viewer/src/lib/groups';
import type { AssetFileMeta, AtlasInfo } from '../../viewer/src/lib/types';

console.log('🧪 Checking the viewer catalog (projects/ only, export state, engines, kits, scenes and games)...\n');

// A repository in miniature: projects live in <repo>/projects, the samples in <repo>/examples.
const root = mkdtempSync(join(tmpdir(), 'diorama-catalog-'));
const project = 'demo';

/** Writes a file and stamps it with an mtime given in seconds (so the tests do not depend on the clock). */
function put(area: 'assets' | 'sheets' | 'src' | 'game', rel: string, seconds: number, content = 'x', where = `projects/${project}`) {
  const file = join(root, where, area, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  utimesSync(file, seconds, seconds);
}

try {
  put('assets', 'a.png', 1000);
  put('assets', 'sub/c.png', 1000);
  put('assets', 'd.png', 1000);
  put('assets', 'orphan.png', 1000);

  // A sheet is a thin file: the drawing it re-exports is in src/, and that may import more (a theme, shared skins).
  put('sheets', 'a.ts', 900, `import { drawing } from '../src/drawing';\nexport default drawing;`);
  put('src', 'drawing.ts', 900, `import { theme } from './theme/index';\nexport const drawing = theme;`);
  put('src', 'theme/index.ts', 900, `export * from './palette';`);
  put('src', 'theme/palette.ts', 1500); // four files down the chain, changed after a.png was exported
  put('sheets', 'sub/c.ts', 900);
  put('sheets', 'd.ts', 1000.5); // newer, but within the tolerance
  put('sheets', 'b.ts', 900); // never exported
  put('sheets', 'sub/e.ts', 900); // never exported, in a folder
  put('sheets', 'notes.d.ts', 900); // a type declaration is not a sheet

  // An atlas says what a sheet is: a gear item carries its part id, label and group.
  put('sheets', 'gear/helm.ts', 900);
  put('assets', 'gear/helm.png', 1000);
  put('assets', 'gear/helm.json', 1000, JSON.stringify({ meta: { mode: 'directions', frameCount: 1, data: { role: 'gear', part: 'helm', label: 'Elmo', group: 'head', character: 'guard' } } }));
  put('assets', 'gear/plain.png', 1000);
  put('assets', 'gear/plain.json', 1000, JSON.stringify({ meta: { mode: 'sheet', data: { role: 5 } } }));
  // A sheet's rows are not always facings, in the shapes the sample exports: an interface piece's rows are its states, a
  // wall's its heights, and a scenery clip sheet says the facing and the variant of each row.
  const rowSheets: Array<[name: string, meta: object, facings: number]> = [
    ['captain-idle', { mode: 'directions', frameCount: 16, directions: ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'], data: { role: 'character' } }, 8],
    ['button', { mode: 'directions', frameCount: 1, directions: ['S', 'W', 'N', 'E'], data: { role: 'ui', kind: 'button', states: ['normal', 'hover', 'pressed', 'disabled'] } }, 1],
    ['crypt-wall', { mode: 'directions', frameCount: 64, directions: ['D0', 'D1'], data: { role: 'wall', rows: 'heights' } }, 1],
    ['candle-cluster--flicker', { mode: 'directions', frameCount: 6, directions: ['D0', 'D1', 'D2'], data: { role: 'prop', rows: [0, 1, 2].map((variant) => ({ row: variant, dir: 0, variant })) } }, 1],
    ['crypt-door--closing', { mode: 'directions', frameCount: 8, directions: ['S', 'W', 'N', 'E'], data: { role: 'door', rows: [0, 1, 2, 3].map((dir) => ({ row: dir, dir, variant: 0 })) } }, 4],
  ];
  for (const [name, meta] of rowSheets) {
    put('assets', `rows/${name}.png`, 1000);
    put('assets', `rows/${name}.json`, 1000, JSON.stringify({ meta }));
  }
  // A character's clips carry its manifest (`meta.data.character`), with the name people read since labels exist; the
  // spider's atlas was exported before them.
  const clipAtlas = (frameCount: number, character: object) => JSON.stringify({ meta: { mode: 'directions', frameCount, directions: ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'], data: { role: 'character', character } } });
  for (const [clip, frames] of [['idle', 16], ['walk', 12]] as const) {
    put('assets', `characters/guard/${clip}.png`, 1000);
    put('assets', `characters/guard/${clip}.json`, 1000, clipAtlas(frames, { name: 'ossuary-guard', label: 'Ossuary Guard', skeleton: 'humanoid' }));
  }
  put('assets', 'characters/spider/idle.png', 1000);
  put('assets', 'characters/spider/idle.json', 1000, clipAtlas(8, { name: 'bone-spider', skeleton: 'spider' }));

  const assets = await buildAssetCatalog(root);
  const byPath = (subpath: string) => assets.find((a) => a.subpath === subpath)!;

  // 1. The freshness of an asset follows its source and the local files that source imports.
  assert.equal(byPath('a.png').sheet, 'a.ts', 'an export is found at its sheet\'s own path');
  assert.equal(byPath('a.png').sourceMtime, 1500 * 1000, 'src/ code imported by the sheet counts, however deep');
  assert.equal(isStale(byPath('a.png')), true, 'code newer than the image makes the asset stale');
  assert.equal(isStale(byPath('sub/c.png')), false, 'an older sheet is fresh');
  assert.equal(isStale(byPath('d.png')), false, 'less than a second newer is not stale');
  assert.equal(byPath('orphan.png').sheet, null);
  assert.equal(byPath('orphan.png').sourceMtime, null);
  assert.equal(isStale(byPath('orphan.png')), false, 'an export without a sheet is never stale');
  assert.equal(byPath('a.png').url, '/projects/demo/assets/a.png');

  const helm = byPath('gear/helm.png').atlasInfo;
  assert.deepEqual([helm?.role, helm?.part, helm?.label, helm?.group], ['gear', 'helm', 'Elmo', 'head']);
  assert.equal(byPath('gear/plain.png').atlasInfo?.role, null, 'a role that is not text is ignored');
  // A character's clip names its character, its manifest's id and label, and its id alone for an atlas exported before
  // labels. A gear sheet names its wearer as text: that is no character, and the label stays the gear's own.
  assert.deepEqual(byPath('characters/guard/idle.png').atlasInfo?.character, { name: 'ossuary-guard', label: 'Ossuary Guard' });
  assert.deepEqual(byPath('characters/spider/idle.png').atlasInfo?.character, { name: 'bone-spider', label: 'bone-spider' });
  assert.deepEqual([helm?.character, helm?.label], [null, 'Elmo']);
  assert.equal(byPath('rows/captain-idle.png').atlasInfo?.character, null, 'a character sheet without a manifest has none');
  assert.equal(byPath('characters/guard/walk.png').atlasInfo?.label, null, 'the character is not the clip\'s label: the table titles clips by their file');
  assert.deepEqual([characterLabel(byPath('characters/guard/walk.png')), characterLabel(byPath('gear/helm.png'))], ['Ossuary Guard', null]);
  // The catalog's characters as the grid shows them: one card each, by its label, with its folder.
  const cards = groupAnimations(assets, assets).flatMap((e) => (e.type === 'group' && e.group.folder.startsWith('characters/') ? [[e.group.name, e.group.folder, e.group.assets.map((a) => a.subpath)]] : []));
  assert.deepEqual(cards, [
    ['Ossuary Guard', 'characters/guard', ['characters/guard/idle.png', 'characters/guard/walk.png']],
    ['bone-spider', 'characters/spider', ['characters/spider/idle.png']],
  ]);
  assert.equal(byPath('a.png').atlasInfo, null, 'no atlas, no role');
  // A card's "8d" counts the directions a sheet faces, not its rows.
  assert.deepEqual(rowSheets.map(([name]) => byPath(`rows/${name}.png`).atlasInfo?.facings), rowSheets.map(([, , facings]) => facings));

  // The viewer sorts sheets into types by their role: scenery kits bring four roles of their own.
  const roleFor = (role: string | null) => roleOf({ atlasInfo: role === null ? null : { role } } as Parameters<typeof roleOf>[0]);
  assert.deepEqual(['character', 'gear', 'prop'].map(roleFor), ['character', 'gear', 'prop']);
  assert.deepEqual(['tile', 'wall', 'fence', 'decal', 'scene'].map(roleFor), Array(5).fill('scenery'));
  assert.deepEqual([null, 'unknown'].map(roleFor), ['other', 'other']);

  // The Details window is titled by what the asset is, in the shapes the sample exports: a character's clip by the
  // character (its label, as its group card; an older sheet without a manifest, its folder), anything else by its own title
  // (its label, else its file name).
  const sheet = (subpath: string, info: Partial<AtlasInfo>) =>
    ({ subpath, atlasInfo: { mode: 'directions', frameCount: 1, directions: ['S', 'W', 'N', 'E'], role: null, label: null, character: null, ...info } }) as AssetFileMeta;
  const EIGHT = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];
  const captain = { name: 'ossuary-captain', label: 'Ossuary Captain' };
  const sample = [
    sheet('characters/captain/walk.png', { role: 'character', frameCount: 12, directions: EIGHT, character: captain }),
    sheet('characters/captain/idle.png', { role: 'character', frameCount: 16, directions: EIGHT, character: captain }),
    // A character `new-asset --engine rig` makes has its idle alone, and its name in words.
    sheet('characters/bat/idle.png', { role: 'character', frameCount: 8, directions: EIGHT, character: { name: 'bat', label: 'Bat' } }),
    sheet('characters/old/idle.png', { role: 'character', frameCount: 16, directions: EIGHT }),
    sheet('characters/old/walk.png', { role: 'character', frameCount: 12, directions: EIGHT }),
    sheet('hero.png', { role: 'character', frameCount: 4 }),
    sheet('gear/horned-helm.png', { role: 'gear', label: 'Horned helm', kind: 'gear', directions: EIGHT }),
    sheet('scenery/coffin.png', { role: 'prop', label: 'Coffin', frameCount: 2 }),
    sheet('scenery/crypt-door--closing.png', { role: 'door', label: 'Crypt door', frameCount: 8 }),
    sheet('scenery/crypt-archway.png', { role: 'door', label: 'Crypt archway' }),
    sheet('scenery/candle-cluster--flicker.png', { role: 'prop', label: 'Soul candles', frameCount: 6, directions: ['D0', 'D1', 'D2'] }),
    sheet('vfx/soul-bolt.png', { role: 'vfx', kind: 'projectile', frameCount: 6, directions: EIGHT }),
    sheet('ui/button.png', { role: 'ui', kind: 'button' }),
  ];
  const find = (subpath: string) => sample.find((a) => a.subpath === subpath)!;
  const titleOf = (subpath: string) => detailsTitle(find(subpath));
  assert.deepEqual(['characters/captain/idle.png', 'characters/captain/walk.png'].map(titleOf), ['Ossuary Captain', 'Ossuary Captain'], 'a clip is titled by its character');
  assert.equal(titleOf('characters/bat/idle.png'), 'Bat', 'even a character with a single clip');
  assert.equal(titleOf('characters/old/walk.png'), 'Old', 'an older sheet without a manifest: its folder, as a name reads');
  assert.equal(titleOf('hero.png'), 'Hero', 'a character with no folder: its file name, as a name reads');
  assert.equal(titleOf('gear/horned-helm.png'), 'Horned helm', 'a gear sheet by its label, as its card');
  assert.equal(titleOf('ui/button.png'), 'Button', 'an interface piece with no label: its file name, as a name reads');
  assert.equal(readableName('stone-crate'), 'Stone crate', 'a kebab-case name reads as a label is written');
  assert.deepEqual(['scenery/coffin.png', 'scenery/crypt-door--closing.png', 'scenery/crypt-archway.png'].map(titleOf), ['Coffin', 'Crypt door', 'Crypt archway']);
  assert.deepEqual(sample.map(characterLabel).filter(Boolean), ['Ossuary Captain', 'Ossuary Captain', 'Bat'], 'only a clip of a character with a manifest has a label');

  // Only a character's clips are one entry in the grid (and one set of clips in its Details window), whatever else a folder
  // holds: the animated sheets of scenery/ (a door's --closing, the candles' --flicker) are each an asset, as the still
  // ones beside them, the effects and the interface pieces are. A character with a single clip is still that character,
  // by its label, and an older one without a manifest is grouped by its folder.
  const entries = groupAnimations(sample, sample).map((e) => (e.type === 'group' ? `${e.group.name} (${e.group.folder}): ${e.group.assets.map((a) => a.subpath.split('/').pop()).join(' ')}` : e.asset.subpath));
  assert.deepEqual(entries, [
    'Ossuary Captain (characters/captain): idle.png walk.png',
    'Bat (characters/bat): idle.png',
    'old (characters/old): idle.png walk.png',
    'hero.png',
    'gear/horned-helm.png',
    'scenery/coffin.png',
    'scenery/crypt-door--closing.png',
    'scenery/crypt-archway.png',
    'scenery/candle-cluster--flicker.png',
    'vfx/soul-bolt.png',
    'ui/button.png',
  ]);
  assert.deepEqual(['scenery/crypt-door--closing.png', 'scenery/crypt-archway.png', 'vfx/soul-bolt.png'].map((subpath) => clipsOf(sample, find(subpath)).length), [1, 1, 1]);
  assert.deepEqual(clipsOf(sample, find('characters/captain/walk.png')).map((a) => a.subpath), ['characters/captain/idle.png', 'characters/captain/walk.png'], 'idle first');
  // Two characters in one folder are two, by their manifests, as the runtime has them.
  const pair = [sheet('characters/duo/a.png', { role: 'character', frameCount: 4, character: { name: 'a', label: 'A' } }), sheet('characters/duo/b.png', { role: 'character', frameCount: 4, character: { name: 'b', label: 'B' } })];
  assert.deepEqual(groupAnimations(pair, pair).map((e) => (e.type === 'group' ? e.group.name : '')), ['A', 'B']);

  // A badge names an effect's kind in the language of the screen, as the Details window does; a kind the interface has no
  // word for, and an interface piece's kind, are shown as the atlas writes them.
  const detailOf = (info: Partial<AtlasInfo>, lang: 'en' | 'pt-BR') => roleDetail(sheet('vfx/x.png', info), createTranslator(lang).t);
  assert.deepEqual([detailOf({ role: 'vfx', kind: 'projectile' }, 'en'), detailOf({ role: 'vfx', kind: 'projectile' }, 'pt-BR')], ['Projectile', 'Projétil']);
  assert.equal(detailOf({ role: 'vfx', kind: 'beam' }, 'pt-BR'), 'beam');
  assert.equal(detailOf({ role: 'vfx' }, 'en'), null);
  assert.equal(detailOf({ role: 'ui', kind: 'button' }, 'pt-BR'), 'button');

  // 2. Sheets with no image at their own path are pending; code in src/ is not a sheet, nor are exported ones.
  const [meta] = await buildProjectCatalog(root);
  assert.deepEqual(meta.pendingSheets, ['b.ts', 'sub/e.ts']);
  assert.equal(meta.sheetCount, 6, 'only the .ts files of sheets/ count (a.ts, b.ts, d.ts, gear/helm.ts, sub/c.ts, sub/e.ts)');
  assert.equal(meta.name, 'demo');
  assert.deepEqual([meta.hasGearKit, meta.hasSceneryKit, meta.scenes], [false, false, []]);

  // 3. The banner and the modal read both lists from one place.
  const pending = pendingExports(assets, meta);
  assert.deepEqual(pending.stale.map((a) => a.subpath), ['a.png']);
  assert.deepEqual(pending.missing, ['b.ts', 'sub/e.ts']);
  assert.deepEqual(pendingExports(assets, undefined).missing, []);

  // The project bar's totals count the assets (one per exported sheet) and their size, then what is not exported yet,
  // while there is any: the sheets are not a second total.
  const mb = 2.5 * 1024 * 1024;
  const [english, portuguese] = [createTranslator('en'), createTranslator('pt-BR')];
  assert.equal(projectTotals({ ...meta, totalSize: mb }, 4, english), '4 assets · 2.50 MB · 2 not exported', 'sheets show only as what is not exported yet');
  assert.equal(projectTotals({ ...meta, pendingSheets: [], totalSize: 1536 }, 1, english), '1 asset · 1.5 kB', 'all exported: one count and the size');
  // The bars that count an export: done of total as a percentage, never past either end, and empty for nothing to do.
  assert.equal(progressPercent(3, 12), 25);
  assert.equal(progressPercent(0, 40), 0);
  assert.equal(progressPercent(40, 40), 100);
  assert.equal(progressPercent(5, 4), 100, 'more done than counted (the catalog read late) stays a full bar');
  assert.equal(progressPercent(-1, 4), 0);
  assert.equal(progressPercent(0, 0), 0, 'no step to take is an empty bar, not NaN');
  assert.equal(projectTotals({ ...meta, totalSize: mb }, 4, portuguese), '4 assets · 2,50 MB · 2 sem export');
  assert.equal(projectTotals({ ...meta, pendingSheets: ['a.ts'], totalSize: 0 }, 0, portuguese), '0 asset · 0 B · 1 sem export', 'Portuguese counts zero as one');
  assert.doesNotMatch(projectTotals(meta, assets.length, english), /sheet/, 'assets and sheets are not two totals');

  // 4. What export.ts takes for a sheet is its path under sheets/ without the extension.
  assert.equal(exportTarget('characters/wolf/bite.ts'), 'characters/wolf/bite');

  // The kits and saved scenes are found on disk, so a file created while the viewer runs shows up at the next refresh.
  put('src', 'gear/catalog.ts', 900);
  put('src', 'scenery/catalog.ts', 900);
  put('src', 'scenes/yard.ts', 900, 'export const SCENE = {};');
  put('src', 'scenes/map.ts', 900, 'export function readMap() {}');
  put('sheets', 'scenes/yard.ts', 900);
  put('assets', 'scenes/yard.png', 2000);
  put('src', 'scenes/crypt-2.ts', 900, 'import type { SceneData } from "@core/volume";\nexport const SCENE: SceneData = {};');
  const [withKits] = await buildProjectCatalog(root);
  assert.deepEqual([withKits.hasGearKit, withKits.hasSceneryKit, withKits.scenes], [true, true, ['crypt-2', 'yard']], 'only the files of src/scenes/ that export SCENE are scenes, not helpers like map.ts');
  put('src', 'gear/_catalog.ts', 900);
  put('src', 'scenery/_catalog.ts', 900);
  rmSync(join(root, 'projects', project, 'src', 'gear', 'catalog.ts'));
  assert.equal((await buildProjectCatalog(root))[0].hasGearKit, false, 'a kit is src/gear/catalog.ts: the old _catalog.ts is not one');
  rmSync(join(root, 'projects', project, 'src', 'gear', '_catalog.ts'));
  rmSync(join(root, 'projects', project, 'src', 'scenery', '_catalog.ts'));

  // A project has a game when it has its page, game/index.html (rule 8): code alone in game/ is not one yet.
  assert.equal(withKits.hasGame, false, 'no game/ folder, no game');
  put('game', 'main.ts', 900, 'export {};');
  assert.equal((await buildProjectCatalog(root))[0].hasGame, false, 'game/ without its index.html is not a game');
  put('game', 'index.html', 900, '<!DOCTYPE html><script type="module" src="./main.ts"></script>');
  assert.equal((await buildProjectCatalog(root))[0].hasGame, true, 'game/index.html is the game the viewer links to');
  rmSync(join(root, 'projects', project, 'game'), { recursive: true });

  // 5. Exporting a sheet clears both states.
  put('assets', 'a.png', 2000);
  put('assets', 'b.png', 2000);
  put('assets', 'sub/e.png', 2000);
  const after = await buildAssetCatalog(root);
  const [metaAfter] = await buildProjectCatalog(root);
  assert.equal(pendingExports(after, metaAfter).stale.length, 0);
  assert.deepEqual(metaAfter.pendingSheets, []);

  // 6. A sheet belongs to the engine it reaches, through the files it imports too: rig wins over volume, and a sheet with neither has none.
  const engineSources: Array<[name: string, code: string, engine: 'rig' | 'volume' | null]> = [
    ['rig', "import { defineCharacter } from '@core/rig';\nimport { box } from '@core/volume';", 'rig'],
    ['volume', "import { box } from '@core/volume';\nimport { alpha } from '@core/draw';", 'volume'],
    ['via', "import { skeleton } from '../../src/eng/shared';", 'rig'],
    ['ui', "import { defineNineSlice } from '@core';\nimport { alpha } from '@core/draw';", null],
  ];
  put('src', 'eng/shared.ts', 900, "import { humanoid } from '@core/rig';");
  for (const [name, code] of engineSources) {
    put('sheets', `eng/${name}.ts`, 900, code);
    put('assets', `eng/${name}.png`, 2000);
  }
  const engines = await buildAssetCatalog(root);
  assert.deepEqual(engineSources.map(([name]) => engines.find((a) => a.subpath === `eng/${name}.png`)?.engine), engineSources.map(([, , engine]) => engine));
  assert.equal(engines.find((a) => a.subpath === 'orphan.png')?.engine, null, 'no sheet, no engine');

  // 7. The viewer lists projects/ only: the samples of examples/ ship with Diorama and are not the app's to browse or edit
  // (saving into one would change the sample), so neither their projects nor their assets are in the catalog, whatever
  // their name. `npm run example` copies a sample into projects/, and then it is listed like any project of the user's.
  put('assets', 'gear/helm.png', 1000, 'x', 'examples/sample');
  put('assets', 'gear/helm.json', 1000, '{}', 'examples/sample');
  put('sheets', 'gear/helm.ts', 900, "import { CATALOG } from '../../src/gear/catalog';\nimport { defineGearAsset } from '@core/rig';", 'examples/sample');
  put('src', 'gear/catalog.ts', 1200, 'export const CATALOG = {};', 'examples/sample');
  put('sheets', 'vfx/spark.ts', 900, '', 'examples/sample');
  put('assets', 'a.png', 1000, 'x', 'examples/demo'); // a sample with the name of a project of projects/
  const everything = await buildAssetCatalog(root);
  assert.ok(!everything.some((a) => a.project === 'sample'), 'a sample in examples/ is not in the asset catalog');
  assert.ok(everything.every((a) => a.url.startsWith('/projects/demo/')), 'every asset is one of projects/');
  assert.deepEqual((await buildProjectCatalog(root)).map((m) => m.name), ['demo'], 'only the folders of projects/ are projects of the viewer');
  rmSync(join(root, 'projects', project), { recursive: true });
  assert.deepEqual(await buildProjectCatalog(root), [], 'without projects/ the viewer has no project, even with samples in examples/');
  assert.deepEqual(await buildAssetCatalog(root), []);
  // The sample, copied into projects/ (what npm run example does), is a project like any other.
  mkdirSync(join(root, 'projects'), { recursive: true });
  cpSync(join(root, 'examples', 'sample'), join(root, 'projects', 'sample'), { recursive: true, preserveTimestamps: true });
  const copied = await buildAssetCatalog(root);
  const copiedHelm = copied.find((a) => a.project === 'sample' && a.subpath === 'gear/helm.png')!;
  assert.deepEqual([copiedHelm.url, copiedHelm.sheet, copiedHelm.engine], ['/projects/sample/assets/gear/helm.png', 'gear/helm.ts', 'rig']);
  assert.equal(copiedHelm.sourceMtime, 1200 * 1000, 'the copy keeps the times of the sample, so its export state is the same');
  const [sampleMeta] = await buildProjectCatalog(root);
  assert.deepEqual([sampleMeta.name, sampleMeta.hasGearKit, sampleMeta.assetCount, sampleMeta.pendingSheets], ['sample', true, 1, ['vfx/spark.ts']]);
  rmSync(join(root, 'projects', 'sample'), { recursive: true });
  put('assets', 'a.png', 1000);

  // 8. Nothing but the four places is read: review/ (scratch) and anything else at the project root stay out.
  writeFileSync(join(root, 'projects', project, 'stray.png'), 'x');
  const reviewFile = join(root, 'projects', project, 'review', 'contact', 'a.png');
  mkdirSync(dirname(reviewFile), { recursive: true });
  writeFileSync(reviewFile, 'x');
  assert.ok(!(await buildAssetCatalog(root)).some((a) => a.subpath.includes('contact') || a.subpath.includes('stray')), 'only assets/ holds exports: review/ and the project root are never read');

  console.log('✅ viewer catalog export-state checks passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
