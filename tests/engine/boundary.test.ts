import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, resolve, sep } from 'node:path';

console.log('🧪 Checking the public surface and the dependency direction (docs/ARCHITECTURE.md)...\n');

const ROOT = resolve('.').split(sep).join('/');
const problems: string[] = [];

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'temp', 'scratch', '.tanstack', '.diorama-trash', '.docs-snippets']);

function scanFiles(dir: string, exts = ['.ts', '.tsx']): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (SKIP_DIRS.has(entry)) continue;
        results.push(...scanFiles(full, exts));
      } else if (exts.some(ext => full.endsWith(ext)) && !full.endsWith('.d.ts')) {
        results.push(full);
      }
    }
  } catch {
    // The directory may not exist (a fresh clone has no projects).
  }
  return results;
}

/** The text of a TypeScript file with comments removed (strings are kept as they are). */
function stripComments(source: string): string {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      out += source.slice(i, end < 0 ? source.length : end + 2).replace(/[^\n]/g, '');
      i = end < 0 ? source.length : end + 1;
    } else if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      i = (end < 0 ? source.length : end) - 1;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) j += source[j] === '\\' ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Every module specifier a file imports, re-exports or loads dynamically. */
function specifiersOf(file: string): string[] {
  const code = stripComments(readFileSync(file, 'utf8'));
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/gm;
  return [...code.matchAll(re)].map(match => match[2]);
}

/** The repository-relative path of a file, with forward slashes. */
const rel = (file: string) => {
  const path = file.split(sep).join('/');
  return path.startsWith(`${ROOT}/`) ? path.slice(ROOT.length + 1) : path;
};

const ALIASES: Record<string, string> = {
  '@core': 'core/index',
  '@core/draw': 'core/draw/index',
  '@core/volume': 'core/volume/index',
  '@core/rig': 'core/rig/index',
};

/** The packages games and the viewer share (packages/), by the name they are imported with. */
const PACKAGES: Record<string, string> = {
  '@diorama/runtime': 'packages/runtime/src/index',
  '@diorama/phaser': 'packages/phaser/src/index',
  '@diorama/phaser/sheets': 'packages/phaser/src/sheets',
};

/** The repository path (no extension) a specifier lands on, or undefined for a package. */
function target(file: string, spec: string): string | undefined {
  if (spec in ALIASES) return ALIASES[spec];
  if (spec in PACKAGES) return PACKAGES[spec];
  if (spec.startsWith('@core/')) return `core/${spec.slice('@core/'.length)}`;
  if (spec.startsWith('@/')) return `viewer/src/${spec.slice(2)}`;
  if (!spec.startsWith('.')) return undefined;
  return posix.normalize(posix.join(posix.dirname(rel(file)), spec)).replace(/\.(js|ts|tsx)$/, '');
}

const inside = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);
const ENTRYPOINTS = Object.keys(ALIASES);

const report = (message: string) => problems.push(message);

// ---------------------------------------------------------------------------------------------
// 1. The public surface: everything outside the engine reaches it through @core, @core/draw,
//    @core/volume and @core/rig, never through internal/ and never through a path into core/.
// ---------------------------------------------------------------------------------------------

const outsideEngine = [
  ...scanFiles('projects'),
  ...scanFiles('examples'),
  ...scanFiles('templates'),
  ...scanFiles('tools'),
  ...scanFiles('viewer'),
];

for (const file of outsideEngine) {
  // The tools are the engine's own tooling: they may import core's files by path (tools/cli.ts reads core/volume/space.ts).
  const byPathAllowed = inside(rel(file), 'tools');
  for (const spec of specifiersOf(file)) {
    if (/(^|\/)internal(\/|$)/.test(spec)) {
      report(`${rel(file)} imports "${spec}": internal/ is private implementation.`);
    }
    if (spec.startsWith('@core/') && !ENTRYPOINTS.includes(spec)) {
      report(`${rel(file)} imports "${spec}", a non-canonical subpath of @core: only ${ENTRYPOINTS.join(', ')} are public.`);
    }
    const landed = target(file, spec);
    if (!byPathAllowed && spec.startsWith('.') && landed && inside(landed, 'core')) {
      report(`${rel(file)} imports "${spec}" (${landed}): reach the engine through ${ENTRYPOINTS.join(', ')}, not by path.`);
    }
  }
}

// The public entrypoints do not export internal paths.
for (const entry of ['core/draw/index.ts', 'core/volume/index.ts', 'core/rig/index.ts']) {
  for (const line of readFileSync(entry, 'utf8').split('\n')) {
    if (line.trim().startsWith('export') && line.includes('/internal/')) {
      report(`${entry} leaks internal implementation: ${line.trim()}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 2. The dependency direction inside the engine: draw <- volume <- rig, with the top-level files
//    of core/ (asset, random, noise, color, packer, ui) beside them.
// ---------------------------------------------------------------------------------------------

type Layer = 'draw' | 'volume' | 'rig' | 'top';

const layerOf = (path: string): Layer | undefined =>
  inside(path, 'core/draw') ? 'draw' : inside(path, 'core/volume') ? 'volume' : inside(path, 'core/rig') ? 'rig' : inside(path, 'core') ? 'top' : undefined;

/** Which layers each layer may import. */
const MAY_IMPORT: Record<Layer, Layer[]> = {
  draw: ['draw', 'top'],
  volume: ['volume', 'draw', 'top'],
  rig: ['rig', 'volume', 'draw', 'top'],
  top: ['top', 'draw'],
};

/** What `draw` may take from the top level of core/: the basics (random, noise, color), nothing that builds an asset. */
const DRAW_MAY_USE_TOP = new Set(['core/random', 'core/noise', 'core/color']);

/** Folders the engine never imports. */
const NOT_ENGINE = ['tools', 'scripts', 'viewer', 'projects', 'examples', 'templates', 'tests', 'docs'];

for (const file of scanFiles('core')) {
  const from = layerOf(rel(file))!;
  for (const spec of specifiersOf(file)) {
    const landed = target(file, spec);
    if (!landed) {
      if (/^(tools|scripts|viewer|projects|examples|tests)\//.test(spec)) report(`${rel(file)} imports "${spec}": core never imports tools, viewer, projects, examples or tests.`);
      continue;
    }
    const outside = NOT_ENGINE.find(folder => inside(landed, folder));
    if (outside || !inside(landed, 'core')) {
      report(`${rel(file)} imports "${spec}" (${landed}): core never imports tools, viewer, projects, examples or tests (nor anything outside core/).`);
      continue;
    }
    const to = layerOf(landed)!;
    if (!MAY_IMPORT[from].includes(to)) {
      const why = from === 'top' ? 'the top-level files of core/ import neither volume nor rig' : `${from} imports nothing of ${to} (draw <- volume <- rig)`;
      report(`${rel(file)} imports "${spec}" (${landed}): ${why}.`);
    } else if (from === 'draw' && to === 'top' && !DRAW_MAY_USE_TOP.has(landed)) {
      report(`${rel(file)} imports "${spec}" (${landed}): draw takes only the basics of core/ (random, noise, color).`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 3. The packages: @diorama/runtime imports nothing (not core/, not a package, not Node; the DOM is
//    left out by its own tsconfig, which tests/runtime/standalone.test.ts compiles it with);
//    @diorama/phaser imports only the runtime and phaser (tests/phaser/standalone.test.ts compiles
//    it alone), and its `sheets` entry not even phaser, so it runs without a browser; core never
//    imports a package (the producer and the players share the files, not code); and everything
//    else reaches a package through its alias, never by a path into packages/.
// ---------------------------------------------------------------------------------------------

const RUNTIME = 'packages/runtime';
const runtimeFiles = scanFiles(RUNTIME);
for (const file of runtimeFiles) {
  for (const spec of specifiersOf(file)) {
    const landed = target(file, spec);
    if (!spec.startsWith('.') || !landed || !inside(landed, RUNTIME)) {
      report(`${rel(file)} imports "${spec}"${landed ? ` (${landed})` : ''}: @diorama/runtime imports nothing outside packages/runtime (no core/, no packages, no node: modules).`);
    }
  }
}
const PHASER = 'packages/phaser';
const PHASER_IMPORTS = ['phaser', '@diorama/runtime'];
const phaserFiles = scanFiles(PHASER);
for (const file of phaserFiles) {
  for (const spec of specifiersOf(file)) {
    const landed = target(file, spec);
    const own = spec.startsWith('.') && landed !== undefined && inside(landed, PHASER);
    if (!own && !PHASER_IMPORTS.includes(spec)) {
      report(`${rel(file)} imports "${spec}"${landed ? ` (${landed})` : ''}: @diorama/phaser imports only its own files, ${PHASER_IMPORTS.join(' and ')} (no core/, no other package, no node: modules).`);
    }
  }
}
const SHEETS_ENTRY = `${PHASER}/src/sheets.ts`;
for (const spec of specifiersOf(resolve(SHEETS_ENTRY))) {
  if (spec !== '@diorama/runtime') report(`${SHEETS_ENTRY} imports "${spec}": @diorama/phaser/sheets runs without Phaser (in node, in the tests), so it imports only @diorama/runtime.`);
}
for (const file of scanFiles('core')) {
  for (const spec of specifiersOf(file)) {
    if (spec in PACKAGES || spec.startsWith('@diorama/')) report(`${rel(file)} imports "${spec}": core never imports the packages that play its files.`);
  }
}

/**
 * Outside packages/, a package is reached through its alias (`@diorama/runtime`), never by a path into packages/: tsx
 * resolves the tsconfig paths, so the tools and the tests use the alias as the viewer does.
 */
function pathIntoPackage(file: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const landed = target(file, spec);
  if (!landed || !inside(landed, 'packages') || inside(rel(file), 'packages')) return null;
  return `${rel(file)} imports "${spec}" (${landed}): reach a package through its alias (${Object.keys(PACKAGES).join(', ')}), not by a path into packages/.`;
}
for (const file of [...outsideEngine, ...scanFiles('tests'), ...scanFiles('scripts')]) {
  for (const spec of specifiersOf(file)) {
    const problem = pathIntoPackage(file, spec);
    if (problem) report(problem);
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Nothing imports tests/.
// ---------------------------------------------------------------------------------------------

const everythingButTests = [
  ...scanFiles('core'),
  ...scanFiles('packages'),
  ...scanFiles('tools'),
  ...scanFiles('scripts'),
  ...scanFiles('viewer'),
  ...scanFiles('templates'),
  ...scanFiles('examples'),
  ...scanFiles('projects'),
  resolve('vite.config.ts'),
];
for (const file of everythingButTests) {
  for (const spec of specifiersOf(file)) {
    const landed = target(file, spec);
    if ((landed && inside(landed, 'tests')) || /(^|\/)tests\//.test(spec)) report(`${rel(file)} imports "${spec}": nothing imports tests/.`);
  }
}

// ---------------------------------------------------------------------------------------------
// 5. The checker itself: the rules above can only fail if these hold.
// ---------------------------------------------------------------------------------------------

assert.equal(target(resolve('core/draw/shapes/shape.ts'), '../../volume/camera.js'), 'core/volume/camera', 'a relative import resolves to its repository path');
assert.equal(target(resolve('viewer/src/a.ts'), '@core/rig'), 'core/rig/index', 'an alias resolves to its entry file');
assert.equal(layerOf('core/volume/camera'), 'volume');
assert.equal(layerOf('core/random'), 'top');
assert.equal(layerOf('tools/cli'), undefined);
assert.ok(specifiersOf(resolve('core/index.ts')).includes('./asset.js'), 'the scanner reads the specifiers of a file');
assert.ok(scanFiles('core').length > 20 && scanFiles('viewer').length > 20, 'the scanner finds the engine and the viewer');
assert.ok(runtimeFiles.length > 10 && runtimeFiles.some(f => rel(f) === `${RUNTIME}/src/index.ts`), 'the scanner finds the runtime');
assert.equal(target(resolve('viewer/src/a.ts'), '@diorama/runtime'), 'packages/runtime/src/index', 'a package resolves to its entry file');
assert.equal(target(resolve('examples/x/game/main.ts'), '@diorama/phaser/sheets'), 'packages/phaser/src/sheets', 'a package entry by its subpath too');
assert.ok(phaserFiles.length > 5 && phaserFiles.some(f => rel(f) === `${PHASER}/src/index.ts`), 'the scanner finds @diorama/phaser');
assert.ok(specifiersOf(resolve(`${PHASER}/src/plugin.ts`)).includes('phaser'), 'and reads its imports of phaser');
assert.deepEqual(specifiersOf(resolve(SHEETS_ENTRY)), ['@diorama/runtime'], 'the scanner reads the sheets entry');
assert.equal(target(resolve(`${RUNTIME}/src/actor.ts`), './frames.js'), `${RUNTIME}/src/frames`);
assert.ok(specifiersOf(resolve(`${RUNTIME}/src/index.ts`)).every(spec => spec.startsWith('./')), 'the runtime\'s entry re-exports its own modules');
assert.ok(pathIntoPackage(resolve('viewer/src/probe-path.ts'), '../../packages/runtime/src/actor.js'), 'a path into packages/ from the viewer is refused');
assert.ok(pathIntoPackage(resolve('tests/runtime/probe.test.ts'), '../../packages/runtime/src/index.js'), 'from a test too, even to the entry file');
assert.ok(pathIntoPackage(resolve('tools/probe.ts'), '../packages/runtime/src/actor.js'), 'a tool may not reach inside a package');
assert.ok(pathIntoPackage(resolve('tools/probe.ts'), '../packages/runtime/src/index.js'), 'nor name its entry file: tsx resolves the alias for tools too');
assert.equal(pathIntoPackage(resolve('viewer/src/probe-path.ts'), '@diorama/runtime'), null, 'the alias is the way in');
assert.equal(pathIntoPackage(resolve(`${RUNTIME}/src/actor.ts`), './frames.js'), null, 'a package\'s own files are its own business');
assert.deepEqual(specifiersOf(resolve('tests/engine/boundary.test.ts')).filter(spec => spec.startsWith('.')), [], 'comments and strings do not count as imports');

assert.equal(problems.length, 0, `Boundary problems:\n${problems.map(p => `  - ${p}`).join('\n')}`);

console.log('✔ Public surface, dependency direction and test isolation verified!\n');
