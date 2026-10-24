/**
 * @diorama/phaser compiles on its own: `packages/phaser` with its own tsconfig.json (lib ES2022 and the DOM, no ambient
 * types, strict), in this process, as tests/runtime/standalone.test.ts does for the runtime. Its one path alias is
 * `@diorama/runtime`, and `phaser` resolves to the types Phaser ships. The program may read nothing else: no file of
 * core/, no other package, no Node types. Its package.json depends on the runtime and asks for Phaser as a peer, at the
 * version the repository pins. Paths are compared as real paths: TypeScript reads files through symlinks (a node_modules
 * that is a link, a temp folder under /tmp on macOS) by where they really are.
 */

import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';

console.log('🧪 Checking that @diorama/phaser compiles alone (the DOM, Phaser\'s types and the runtime only)...\n');

/** Where a file or folder really is, links followed. */
const real = (path: string) => realpathSync(path);
const PACKAGE = resolve('packages/phaser');
const RUNTIME = real(resolve('packages/runtime/src'));
const PHASER_TYPES = real(resolve('node_modules/phaser/types'));
const REAL_PACKAGE = real(PACKAGE);
const configFile = resolve(PACKAGE, 'tsconfig.json');
const read = ts.readConfigFile(configFile, ts.sys.readFile);
assert.equal(read.error, undefined, 'the package has its own tsconfig.json');
const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, PACKAGE, undefined, configFile);
assert.deepEqual(parsed.errors, []);
assert.deepEqual(parsed.options.lib, ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], 'lib ES2022 and the DOM');
assert.equal(parsed.options.strict, true);
assert.deepEqual(Object.keys(parsed.options.paths ?? {}), ['@diorama/runtime'], 'one alias: the runtime');
assert.deepEqual(parsed.options.types, [], 'no ambient types (no node)');

const show = (d: ts.Diagnostic) => {
  const message = ts.flattenDiagnosticMessageText(d.messageText, ' ');
  if (!d.file || d.start === undefined) return message;
  const { line } = d.file.getLineAndCharacterOfPosition(d.start);
  return `${relative(resolve('.'), d.file.fileName).split(sep).join('/')}:${line + 1}: ${message}`;
};

/** Compiles the package, plus extra files (path inside the package -> source) served from memory. */
function compile(extra: Record<string, string> = {}) {
  const host = ts.createCompilerHost(parsed.options);
  const virtual = new Map(Object.entries(extra).map(([path, source]) => [resolve(PACKAGE, path), source]));
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.getSourceFile = (name, version, onError, create) => (virtual.has(resolve(name)) ? ts.createSourceFile(name, virtual.get(resolve(name))!, version) : getSourceFile(name, version, onError, create));
  host.fileExists = (name) => virtual.has(resolve(name)) || fileExists(name);
  host.readFile = (name) => virtual.get(resolve(name)) ?? readFile(name);
  const program = ts.createProgram({ rootNames: [...parsed.fileNames, ...virtual.keys()], options: parsed.options, host });
  return { program, errors: ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error) };
}

/** The real path of a file the program read (a virtual probe file is where the package really is). */
const readPath = (file: string) => {
  const path = resolve(file);
  return path.startsWith(PACKAGE + sep) ? REAL_PACKAGE + path.slice(PACKAGE.length) : real(path);
};

/** The files a program reads from outside the package, the runtime, Phaser's types and the language's own library. */
const outsideOf = (program: ts.Program) =>
  program.getSourceFiles().map((f) => readPath(f.fileName)).filter((f) => ![REAL_PACKAGE, RUNTIME, PHASER_TYPES].some((dir) => f.startsWith(dir + sep)) && !/[\\/]typescript[\\/]lib[\\/]lib\.[^\\/]+\.d\.ts$/.test(f));

// 1. The package alone: no errors, and it reads only its own files, the runtime's sources, Phaser's types and the libraries.
const alone = compile();
assert.equal(alone.errors.length, 0, `@diorama/phaser does not compile on its own:\n${alone.errors.map(show).join('\n')}`);
assert.deepEqual(outsideOf(alone.program), [], 'it reads nothing but the package, the runtime, Phaser\'s types and the language library');
const reads = alone.program.getSourceFiles().map((f) => readPath(f.fileName));
assert.ok(reads.some((f) => f === resolve(RUNTIME, 'index.ts')), 'the runtime comes through its alias');
assert.ok(reads.some((f) => f === resolve(PHASER_TYPES, 'phaser.d.ts')), 'phaser resolves to the types it ships');
assert.ok(alone.program.getRootFileNames().some((f) => f.endsWith('src/index.ts')) && alone.program.getRootFileNames().some((f) => f.endsWith('src/sheets.ts')), 'both entries are compiled');

// 2. The checks bite: the engine, a Node module or another package does not compile, or is caught reading outside.
const probes: Array<[string, string, RegExp]> = [
  ['src/probe-core.ts', "import { createRng } from '@core';\nexport const rng = createRng;\n", /Cannot find module '@core'/],
  ['src/probe-node.ts', "import { readFileSync, realpathSync } from 'node:fs';\nexport const read = readFileSync;\n", /Cannot find module 'node:fs'/],
  ['src/probe-node-global.ts', 'export const cwd = process.cwd();\n', /Cannot find name 'process'/],
];
for (const [path, source, expected] of probes) {
  const probe = compile({ [path]: source });
  const own = probe.errors.filter((d) => d.file && resolve(d.file.fileName) === resolve(PACKAGE, path));
  assert.ok(own.some((d) => expected.test(ts.flattenDiagnosticMessageText(d.messageText, ' '))), `${path} is refused: ${own.map(show).join('; ') || 'no error'}`);
}
// The DOM is there: the binding draws in a browser.
assert.equal(compile({ 'src/probe-dom.ts': 'export const title = document.title;\n' }).errors.length, 0, 'a DOM global compiles');
// A package with its own types, or a relative path out of the package, compiles in TypeScript's eyes: what the program reads catches it.
const byPackage = compile({ 'src/probe-vite.ts': "import type { Plugin } from 'vite';\nexport type P = Plugin;\n" });
assert.ok(outsideOf(byPackage.program).some((f) => f.includes(`${sep}node_modules${sep}vite${sep}`)), 'another package is caught by what the program reads');
const byPath = compile({ 'src/probe-path.ts': "import { EDGE } from '../../../core/volume/grid.js';\nexport const edge = EDGE;\n" });
assert.ok(outsideOf(byPath.program).some((f) => f.endsWith(`${sep}core${sep}volume${sep}grid.ts`)), 'a relative import out of the package is caught too');

// 3. The package: private, ES modules, its sources as the exports, the runtime as its dependency and Phaser as a peer, pinned
// to the version the repository installs.
const pkg = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8'));
const root = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
assert.equal(pkg.name, '@diorama/phaser');
assert.equal(pkg.private, true);
assert.equal(pkg.type, 'module');
assert.deepEqual(pkg.exports, { '.': './src/index.ts', './sheets': './src/sheets.ts' });
assert.deepEqual(Object.keys(pkg.dependencies), ['@diorama/runtime']);
assert.deepEqual(pkg.peerDependencies, { phaser: root.devDependencies.phaser }, 'Phaser is a peer, at the pinned version');
assert.match(root.devDependencies.phaser, /^\d+\.\d+\.\d+$/, 'the repository pins Phaser exactly');
for (const field of ['devDependencies', 'optionalDependencies']) assert.equal(pkg[field], undefined, `no ${field}`);

console.log(`✔ ${parsed.fileNames.length} files compile alone with the DOM, Phaser's types and the runtime; core, Node and other packages do not.\n`);
