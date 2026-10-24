import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildAssetCatalog, buildProjectCatalog } from '../../viewer/server/catalog';
import { roleOf } from '../../viewer/src/lib/asset-role';
import { exportTarget, isStale, pendingExports } from '../../viewer/src/lib/export-state';

console.log('🧪 Checking the viewer catalog (projects and examples, export state, engines, kits, scenes and games)...\n');

// A repository in miniature: projects live in <repo>/projects and <repo>/examples.
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
  put('assets', 'gear/helm.json', 1000, JSON.stringify({ meta: { mode: 'directions', frameCount: 1, data: { role: 'gear', part: 'helm', label: 'Elmo', group: 'head' } } }));
  put('assets', 'gear/plain.png', 1000);
  put('assets', 'gear/plain.json', 1000, JSON.stringify({ meta: { mode: 'sheet', data: { role: 5 } } }));

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
  assert.deepEqual([byPath('a.png').root, byPath('a.png').url], ['projects', '/projects/demo/assets/a.png']);

  const helm = byPath('gear/helm.png').atlasInfo;
  assert.deepEqual([helm?.role, helm?.part, helm?.label, helm?.group], ['gear', 'helm', 'Elmo', 'head']);
  assert.equal(byPath('gear/plain.png').atlasInfo?.role, null, 'a role that is not text is ignored');
  assert.equal(byPath('a.png').atlasInfo, null, 'no atlas, no role');

  // The viewer sorts sheets into types by their role: scenery kits bring four roles of their own.
  const roleFor = (role: string | null) => roleOf({ atlasInfo: role === null ? null : { role } } as Parameters<typeof roleOf>[0]);
  assert.deepEqual(['character', 'gear', 'prop'].map(roleFor), ['character', 'gear', 'prop']);
  assert.deepEqual(['tile', 'wall', 'fence', 'decal', 'scene'].map(roleFor), Array(5).fill('scenery'));
  assert.deepEqual([null, 'unknown'].map(roleFor), ['other', 'other']);

  // 2. Sheets with no image at their own path are pending; code in src/ is not a sheet, nor are exported ones.
  const [meta] = await buildProjectCatalog(root);
  assert.deepEqual(meta.pendingSheets, ['b.ts', 'sub/e.ts']);
  assert.equal(meta.sheetCount, 6, 'only the .ts files of sheets/ count (a.ts, b.ts, d.ts, gear/helm.ts, sub/c.ts, sub/e.ts)');
  assert.deepEqual([meta.root, meta.rel], ['projects', 'projects/demo']);
  assert.deepEqual([meta.hasGearKit, meta.hasSceneryKit, meta.scenes], [false, false, []]);

  // 3. The banner and the modal read both lists from one place.
  const pending = pendingExports(assets, meta);
  assert.deepEqual(pending.stale.map((a) => a.subpath), ['a.png']);
  assert.deepEqual(pending.missing, ['b.ts', 'sub/e.ts']);
  assert.deepEqual(pendingExports(assets, undefined).missing, []);

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

  // 7. Projects come from projects/ and examples/; a name in projects/ wins; samples are marked as such.
  put('assets', 'gear/helm.png', 1000, 'x', 'examples/sample');
  put('assets', 'gear/helm.json', 1000, '{}', 'examples/sample');
  put('sheets', 'gear/helm.ts', 900, "import { CATALOG } from '../../src/gear/catalog';\nimport { defineGearAsset } from '@core/rig';", 'examples/sample');
  put('src', 'gear/catalog.ts', 1200, 'export const CATALOG = {};', 'examples/sample');
  put('sheets', 'vfx/spark.ts', 900, '', 'examples/sample');
  put('assets', 'a.png', 1000, 'x', 'examples/demo'); // hidden by projects/demo
  const everything = await buildAssetCatalog(root);
  const sampleHelm = everything.find((a) => a.project === 'sample' && a.subpath === 'gear/helm.png')!;
  assert.deepEqual([sampleHelm.root, sampleHelm.url, sampleHelm.sheet, sampleHelm.engine], ['examples', '/examples/sample/assets/gear/helm.png', 'gear/helm.ts', 'rig']);
  assert.equal(sampleHelm.sourceMtime, 1200 * 1000, 'the catalog the sheet imports counts for a sample too');
  assert.ok(!everything.some((a) => a.project === 'demo' && a.root === 'examples'), 'a project in projects/ hides the example of the same name');
  const metas = await buildProjectCatalog(root);
  assert.deepEqual(metas.map((m) => [m.name, m.root]), [['demo', 'projects'], ['sample', 'examples']]);
  const sampleMeta = metas.find((m) => m.name === 'sample')!;
  assert.deepEqual([sampleMeta.rel, sampleMeta.hasGearKit, sampleMeta.assetCount, sampleMeta.pendingSheets], ['examples/sample', true, 1, ['vfx/spark.ts']]);

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
