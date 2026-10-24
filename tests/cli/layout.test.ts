/**
 * Rule 8 of docs/ARCHITECTURE.md as tools/layout.ts checks it, in this process (`checkLayout`, what `npm run layout` and
 * `npm run check` print): in a project's game/, every module specifier and URL of its code, CSS and pages is one of the
 * packages a game uses or a relative path that stays inside game/, and a dynamic import or a glob is a static string that
 * starts with ./ or ../; src/ and sheets/ never import a game, however the specifier reaches it (resolved as TypeScript
 * resolves it with the repository's tsconfig.json). Each way round the rule is written into a project, checked for its
 * message and removed; tests/cli/cli.test.ts breaks the rule through the commands themselves.
 */

import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { checkLayout, GAME_PACKAGES } from '../../tools/layout.js';

console.log('🧪 Checking rule 8 (a game imports only its own files and the packages; src/ never imports a game)...\n');

const ROOT = resolve('.');
const name = `zz-rule8-${Date.now()}`;
const dir = resolve('projects', name);
const other = `${name}-other`;
const otherDir = resolve('projects', other);

const write = (base: string, file: string, content: string) => {
  mkdirSync(dirname(resolve(base, file)), { recursive: true });
  writeFileSync(resolve(base, file), content, 'utf8');
};
const errorsOf = () => checkLayout(dir, name, ROOT).errors;

/** Writes one file, checks that the layout fails on it with these words (and on no other file), and removes it. */
function breaks(file: string, content: string, expected: string[], why: string, line?: number) {
  write(dir, file, content);
  try {
    const errors = errorsOf();
    assert.ok(errors.length > 0, `${why} must fail the layout check`);
    assert.deepEqual([...new Set(errors.map((e) => e.path))], [file], `${why}: only ${file} is wrong: ${JSON.stringify(errors)}`);
    const said = errors.map((e) => e.message).join('\n');
    for (const text of expected) assert.ok(said.includes(text), `${why}: the message must say "${text}":\n${said}`);
    if (line !== undefined) assert.ok(errors.some((e) => e.line === line), `${why}: on line ${line}: ${JSON.stringify(errors.map((e) => e.line))}`);
  } finally {
    rmSync(resolve(dir, file), { force: true });
  }
}

try {
  // A project with a game that follows the rule in every way it may: packages by name, relative paths inside game/, static
  // dynamic imports and globs, URLs of its own files from code, CSS and its page, a link to the web, a fragment.
  write(dir, 'src/theme.ts', 'export const INK = 1;\n');
  write(dir, 'game/index.html', [
    '<!DOCTYPE html>',
    '<link rel="stylesheet" href="./style.css">',
    '<a href="https://phaser.io">Phaser</a> <a href="../review/notes.md">notes</a>',
    '<div id="game" style="cursor: url(./cursor.css#x), auto"></div>',
    '<script type="module">import "./main.ts";</script>',
    '<script type="module" src=./main.ts></script>',
    '<!-- <script src="../src/theme.ts"></script> a comment loads nothing -->',
  ].join('\n'));
  write(dir, 'game/main.ts', [
    '/// <reference types="phaser" />',
    "import Phaser from 'phaser';",
    "import { withDiorama } from '@diorama/phaser';",
    "import { planTexture } from '@diorama/phaser/sheets';",
    "import type { Fx } from '@diorama/runtime';",
    "import { LEVEL } from './level';",
    "import waves from './data/waves.json?raw';",
    "export * from './level';",
    "// import { INK } from '../src/theme'; in a comment",
    "export const levels = import.meta.glob(['./data/*.json', '!./data/old-*.json']);",
    "export const map = new URL('./data/waves.json', import.meta.url);",
    "export const later = () => import('./level');",
    "export const tpl = () => import(`./level`);",
    "export const assets = '../assets/'; // a string a loader fetches at run time is not an import",
    "export type T = import('./level').Level;",
    'export const all = [Phaser, withDiorama, planTexture, LEVEL, waves] as unknown as Fx[];',
    '',
  ].join('\n'));
  write(dir, 'game/level.ts', "export const LEVEL = [1, 2];\nexport type Level = number[];\n");
  write(dir, 'game/data/waves.json', '{ "waves": 3 }\n');
  write(dir, 'game/style.css', "@import './theme.css';\nbody { background: url(\"./data/../theme.css\") }\nfilter: url(#glow);\n");
  write(dir, 'game/theme.css', 'body { color: red }\n');
  write(dir, 'game/cursor.css', '\n');
  assert.deepEqual(errorsOf(), [], 'a game that follows rule 8 in every way it may passes');
  assert.deepEqual([...GAME_PACKAGES], ['@diorama/runtime', '@diorama/phaser', '@diorama/phaser/sheets', 'phaser'], 'the packages a game uses');

  // 1. Root-absolute imports: Vite reads them from the repository's root.
  breaks('game/engine-root.ts', "import { createRng } from '/core/index.ts';\nexport const rng = createRng;\n", ['game/engine-root.ts imports "/core/index.ts", a path from the root of the dev server', 'by relative paths inside game/'], 'a root-absolute import of the engine', 1);
  breaks('game/engine-root.js', "import { createRng } from '/core/index.ts';\nexport const rng = createRng;\n", ['game/engine-root.js imports "/core/index.ts", a path from the root of the dev server'], 'the same in a .js file');
  breaks('game/theme-root.ts', `import { INK } from '/projects/${name}/src/theme.ts';\nexport const ink = INK;\n`, [`imports "/projects/${name}/src/theme.ts", a path from the root of the dev server`], 'a root-absolute import of the project\'s src/');
  breaks('game/self-root.ts', `import { LEVEL } from '/projects/${name}/game/level';\nexport const level = LEVEL;\n`, ['a path from the root of the dev server', 'Here that is "./level"'], 'a root-absolute import of the game\'s own file, with the relative path to write');
  // 2. Aliases and bare paths the repository's tsconfig reads from its root (baseUrl "."), and other packages.
  breaks('game/viewer.ts', "import { cn } from '@/lib/utils';\nexport const c = cn;\n", ['imports "@/lib/utils", which is not a package a game uses (rule 8: @diorama/runtime, @diorama/phaser, @diorama/phaser/sheets, phaser)', "@/ is the viewer's alias"], 'the @/ alias');
  breaks('game/bare.ts', `import { INK } from 'projects/${name}/src/theme';\nexport const ink = INK;\n`, [`imports "projects/${name}/src/theme", which is not a package a game uses`, 'a path from the repository\'s root (its baseUrl)'], 'a bare path through baseUrl');
  breaks('game/deep.ts', "import Scene from 'phaser/src/scene/Scene';\nexport const s = Scene;\n", ['imports "phaser/src/scene/Scene", which is not a package a game uses', 'Import the package by its name'], 'a deep import into a package');
  breaks('game/other-package.ts', "import { z } from 'zod';\nexport const schema = z;\n", ['imports "zod", which is not a package a game uses', 'a game uses no other package'], 'another package');
  breaks('game/node.ts', "import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n", ['imports "node:fs", which is not a package a game uses', 'a game runs in the browser'], 'a node: module');
  breaks('game/engine-sub.ts', "import { Polygon } from '@core/draw';\nexport const p = Polygon;\n", ['game/engine-sub.ts imports "@core/draw": a game never imports the engine (rule 8)'], 'the engine by a subpath');
  breaks('game/required.js', "const theme = require('../src/theme');\nmodule.exports = theme;\n", ['imports "../src/theme" with require() (src/theme): game/ imports only its own files and packages (rule 8)'], 'require() of src/');
  breaks('game/typed.ts', "export type Ink = typeof import('../src/theme').INK;\n", ['imports "../src/theme" with a type\'s import() (src/theme)'], 'a type\'s import() of src/');
  breaks('game/referenced.ts', '/// <reference path="../src/theme.ts" />\nexport {};\n', ['loads "../src/theme.ts" with /// <reference path> (src/theme.ts): game/ loads only its own files (rule 8)'], 'a triple-slash reference to src/');
  // 3. Dynamic imports and globs: static strings that start with ./ or ../ and stay inside game/.
  breaks('game/glob.ts', "export const all = import.meta.glob('../src/**');\n", ['game/glob.ts globs "../src/**" with import.meta.glob (src): game/ globs only its own files (rule 8)', 'src/ and sheets/ draw the assets'], 'import.meta.glob of src/');
  breaks('game/glob-up.ts', "export const all = import.meta.glob(['./data/*.json', '../**/*.ts'], { eager: true });\n", ['globs "../**/*.ts" with import.meta.glob (the project\'s root)', 'Only game/ is the game\'s'], 'a glob of the whole project, in a list');
  breaks('game/glob-computed.ts', "const where = './data';\nexport const all = import.meta.glob(where + '/*.json');\n", ['globs where + \'/*.json\' with import.meta.glob: a pattern of import.meta.glob in game/ is a static string'], 'a computed glob');
  breaks('game/glob-root.ts', "export const all = import.meta.glob('/core/**/*.ts');\n", ['globs "/core/**/*.ts" with import.meta.glob: a pattern of import.meta.glob in game/ starts with ./ or ../'], 'a root-absolute glob');
  breaks('game/template.ts', 'export const load = () => import(`../src/theme`);\n', ['imports "../src/theme" with import() (src/theme): game/ imports only its own files and packages (rule 8)'], 'import() of a template literal into src/');
  breaks('game/computed.ts', 'export const load = (file: string) => import(`../src/${file}`);\n', ['imports `../src/${file}` with import(): a dynamic import in game/ is a static string that starts with ./ or ../ and stays inside game/ (rule 8)', 'import.meta.glob'], 'import() of a computed path');
  breaks('game/lazy.ts', "export const load = () => import('phaser');\n", ['imports "phaser" with import(): a dynamic import in game/ is a static path that starts with ./ or ../', 'with a static import at the top of the file'], 'import() of a package');
  // 4. URLs from code, CSS and the page.
  breaks('game/url.ts', "export const hero = new URL('../assets/hero.png', import.meta.url);\n", ['game/url.ts loads "../assets/hero.png" with new URL(..., import.meta.url) (assets/hero.png): game/ loads only its own files (rule 8)', 'Images come from assets/, through the packages'], 'new URL() of an export');
  breaks('game/url-bare.ts', "export const hero = new URL('hero.png', import.meta.url);\nexport const up = new URL('../src/theme.ts', import.meta.url);\n", ['loads "../src/theme.ts" with new URL(..., import.meta.url) (src/theme.ts)'], 'new URL() of src/ (a bare name is a file of game/, which passes)');
  breaks('game/import.css', "@import '../src/x.css';\n", ['game/import.css loads "../src/x.css" with @import (src/x.css): game/ loads only its own files (rule 8)'], 'a CSS @import of src/', 1);
  breaks('game/hero.css', "\n.hero { background: url('../assets/hero.png') no-repeat; }\n", ['game/hero.css loads "../assets/hero.png" with url() (assets/hero.png)', 'Images come from assets/'], 'a CSS url() of an export', 2);
  breaks('game/unquoted.css', '.hero { background: url(../assets/hero.png); }\n', ['loads "../assets/hero.png" with url() (assets/hero.png)'], 'an unquoted CSS url()');
  breaks('game/set.css', ".hero { background-image: image-set('../assets/hero.png' 1x); }\n", ['loads "../assets/hero.png" with image-set() (assets/hero.png)'], 'image-set() of an export');
  breaks('game/remote.css', "@import url('https://fonts.example.com/font.css');\n.x { background: url(data:image/png;base64,AAAA) }\n", ['loads "https://fonts.example.com/font.css" with url(), which is not a file of game/', 'loads "data:image/png;base64,AAAA" with url(), which is not a file of game/'], 'a CSS import from the network and a data: URL');
  breaks('game/inline.html', '<!DOCTYPE html>\n<script type="module">\n  import { INK } from "../src/theme";\n</script>\n', ['game/inline.html imports "../src/theme" in an inline module script (src/theme): game/ imports only its own files and packages (rule 8)'], 'an inline module script importing src/', 3);
  breaks('game/unquoted.html', '<!DOCTYPE html>\n<script type="module" src=../src/main.ts></script>\n', ['game/unquoted.html loads "../src/main.ts" with <script src> (src/main.ts): game/ loads only its own files (rule 8)'], 'an unquoted src out of game/');
  breaks('game/root.html', '<!DOCTYPE html>\n<script type="module" src="/core/index.ts"></script>\n', ['game/root.html loads "/core/index.ts" with <script src>, a path from the root of the dev server'], 'a root-absolute src');
  breaks('game/entities.html', '<!DOCTYPE html>\n<script type="module" src="&#46;&#46;/src/main.ts"></script>\n', ['loads "../src/main.ts" with <script src> (src/main.ts)'], 'a src written with character references');
  breaks('game/style.html', '<!DOCTYPE html>\n<style>body { background: url(../assets/floor.png) }</style>\n<div style="background: url(\'../assets/hero.png\')"></div>\n', ['loads "../assets/floor.png" with url() in a <style> (assets/floor.png)', 'loads "../assets/hero.png" with url() in a style attribute of <div> (assets/hero.png)'], 'URLs in a <style> and a style attribute');
  breaks('game/map.html', '<!DOCTYPE html>\n<script type="importmap">{ "imports": { "level": "../src/theme.ts" } }</script>\n', ['loads "../src/theme.ts" with <script type="importmap"> (src/theme.ts)'], 'an import map into src/');
  breaks('game/handler.html', '<!DOCTYPE html>\n<button onclick="import(\'../src/theme\')">go</button>\n', ['imports "../src/theme" with import() in an onclick attribute (src/theme)'], 'an event handler attribute importing src/');
  breaks('game/icon.html', '<!DOCTYPE html>\n<link rel="icon" href="../assets/badge.png">\n<img srcset="./a.png 1x, ../assets/badge.png 2x">\n', ['loads "../assets/badge.png" with <link href> (assets/badge.png)', 'loads "../assets/badge.png" with <img srcset> (assets/badge.png)'], 'a link and a srcset out of game/');

  // 5. src/ and sheets/ never import a game: by a path that leaves the project and comes back in, through baseUrl, by a
  // root-absolute path, a glob, or another project's game.
  write(otherDir, 'game/level.ts', 'export const LEVEL = [3];\n');
  breaks('src/uses-game.ts', "import { LEVEL } from '../game/level';\nexport const l = LEVEL;\n", ['src/uses-game.ts imports "../game/level" from game/ (rule 8: src/ never imports the game)'], 'src/ importing the game', 1);
  breaks('src/around.ts', `import { LEVEL } from '../../${name}/game/level';\nexport const l = LEVEL;\n`, [`src/around.ts imports "../../${name}/game/level" from game/ (rule 8: src/ never imports the game)`], 'src/ importing the game by a path that leaves the project and comes back in');
  breaks('src/base-url.ts', `import { LEVEL } from 'projects/${name}/game/level';\nexport const l = LEVEL;\n`, [`imports "projects/${name}/game/level" from game/ (rule 8: src/ never imports the game)`], 'src/ importing the game through baseUrl');
  breaks('src/root.ts', `import { LEVEL } from '/projects/${name}/game/level';\nexport const l = LEVEL;\n`, [`imports "/projects/${name}/game/level" from game/`], 'src/ importing the game by a root-absolute path');
  breaks('src/json.ts', "import waves from '../game/data/waves.json';\nexport const w = waves;\n", ['imports "../game/data/waves.json" from game/'], 'src/ importing the game\'s data (which TypeScript does not resolve without resolveJsonModule)');
  breaks('src/later.ts', 'export const load = (n: string) => import(`../game/${n}`);\n', ['imports `../game/${n}` from game/'], 'src/ importing the game by a computed path');
  breaks('src/glob.ts', "export const all = import.meta.glob('../game/*.ts');\n", ['globs "../game/*.ts" from game/'], 'src/ globbing the game');
  breaks('src/other.ts', `import { LEVEL } from 'projects/${other}/game/level';\nexport const l = LEVEL;\n`, [`imports "projects/${other}/game/level" from projects/${other}/game/ (rule 8: src/ never imports a game)`], 'src/ importing another project\'s game');
  breaks('sheets/levels.ts', `export { LEVEL as default } from 'projects/${name}/game/level';\n`, [`sheets/levels.ts imports "projects/${name}/game/level" from game/ (rule 8: sheets/ never imports the game)`], 'a sheet importing the game through baseUrl');
  // The engine and the packages are not games.
  write(dir, 'src/fine.ts', "import { createRng } from '@core';\nimport { depthKey } from '@diorama/runtime';\nexport const both = [createRng, depthKey];\n");
  assert.deepEqual(errorsOf(), [], 'src/ may import the engine and the packages');

  // 6. The sample follows the rule.
  assert.deepEqual(checkLayout(resolve('examples/soulkeeper'), 'soulkeeper', ROOT).errors, [], 'examples/soulkeeper follows the layout');

  console.log('✔ Rule 8 refuses every way out of game/ (root paths, aliases, baseUrl, globs, dynamic and template imports, new URL, CSS, inline scripts and page attributes) and every way into a game from src/ and sheets/.\n');
} finally {
  rmSync(dir, { recursive: true, force: true });
  rmSync(otherDir, { recursive: true, force: true });
}
