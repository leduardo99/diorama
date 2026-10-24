/**
 * Diorama - the layout rules of a project (docs/ARCHITECTURE.md, "Rules"), as a checker.
 *
 *   npm run layout -- <project> [--strict] [--json]     the rules alone
 *   npm run check -- <project>                          type errors, then these rules
 *
 * Errors break a rule; warnings are missing exports and orphan assets, which a fresh checkout (no
 * assets/ yet) always has: `--strict` counts them as errors. Every message says what to move where.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { ALLOWED_CONFIG_KEYS, GENERATED_SHEETS, LAYOUT, OS_METADATA, isSheetFile, walkFiles, type GeneratedFolder } from './project.js';
import { codeReferences, cssReferences, htmlReferences, type Reference } from './references.js';

export { ALLOWED_CONFIG_KEYS };

export interface LayoutIssue {
  /** Short rule id: root, config, underscore, name, sheet-file, thin, generated, direction, kit, assets, game, missing, orphan. */
  rule: string;
  /** Project-relative path the issue is about. */
  path: string;
  /** The line of the file it is on, when it is about a line (an import). */
  line?: number;
  message: string;
}

export interface LayoutReport {
  errors: LayoutIssue[];
  warnings: LayoutIssue[];
}

/** What may stand at a project root (OS metadata aside): the four places, and a game. */
export const ROOT_DIRS = ['src', 'sheets', 'assets', 'review', 'game'] as const;
export const ROOT_FILES = ['STYLE.md', 'README.md', 'diorama.config.json', '.gitignore'] as const;

/** A sheet longer than this many lines of code (comments and blank lines aside) is not thin. */
export const THIN_SHEET_LINES = 20;

/** Lowercase words joined by `-`; `--` joins a scenery piece and its state or clip (`crypt-door--open`). */
const KEBAB = /^[a-z0-9]+(?:--?[a-z0-9]+)*$/;
/** Exported images (PNG, or JPEG for an export with `format: 'jpeg'`) and atlas JSON. */
const IMAGE_EXT = ['.png', '.jpg'];
const ASSET_EXT = [...IMAGE_EXT, '.json'];
/** What a game is made of (rule 8): code, data, its page and its notes. Its pictures are the exports in assets/. */
const GAME_CODE_EXT = ['.ts', '.tsx', '.js', '.mjs'];
const GAME_EXT = [...GAME_CODE_EXT, '.json', '.html', '.css', '.md'];
/** The packages a game imports by name (rule 8); everything else it loads is a relative path inside its game/. */
export const GAME_PACKAGES = ['@diorama/runtime', '@diorama/phaser', '@diorama/phaser/sheets', 'phaser'] as const;
/** The repository's top folders: a bare specifier that starts with one is a path from the root (tsconfig's `baseUrl`), not a package. */
const REPO_FOLDERS = ['core', 'packages', 'projects', 'examples', 'templates', 'tools', 'viewer', 'tests', 'scripts', 'docs'];
/** A URL with a scheme (`https:`, `data:`, `node:`) or a protocol-relative one (`//cdn...`). */
const SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
/** Pictures: a game has none of its own, it shows the project's exports. */
const PICTURE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|psd|aseprite)$/i;

const isDir = (path: string) => existsSync(path) && statSync(path).isDirectory();

/** The text of a TypeScript file with comments removed (strings are kept as they are). */
function stripComments(source: string): string {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const block = source.slice(i, end < 0 ? source.length : end + 2);
      out += block.replace(/[^\n]/g, '');
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

/** Relative module specifiers a file imports or re-exports (`./x`, `../src/y`). */
function relativeImports(code: string): string[] {
  const specs: string[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])(\.{1,2}\/[^'"]*|\.{1,2})\1/gm;
  for (const m of code.matchAll(re)) specs.push(m[2]);
  return specs;
}

/** The part of a glob pattern before its first wildcard (`../src/**` -> `../src/`), negation aside. */
const globBase = (pattern: string) => pattern.replace(/^!/, '').split(/[*?[\]{}()]/)[0];

/** A path or URL without its query and hash (`./level.json?raw`). */
const pathOf = (spec: string) => spec.split(/[?#]/)[0];

/** Is a file or folder (absolute) inside `dir` (absolute), or `dir` itself? */
const within = (path: string, dir: string) => path === dir || path.startsWith(dir + sep);

/** The game folder (repository-relative, `projects/x/game`) an absolute path is in, if it is in one. */
function gameFolderOf(repo: string, path: string): string | undefined {
  const rel = relative(repo, path).split(sep).join('/');
  return /^((?:projects|examples)\/[^/]+\/game)(?:\/|$)/.exec(rel)?.[1];
}

/** The repository's compiler options (tsconfig.json: `baseUrl`, `paths`, the module resolution), for resolving specifiers as TypeScript does. */
function compilerOptionsOf(repo: string): ts.CompilerOptions | undefined {
  const file = join(repo, 'tsconfig.json');
  if (!existsSync(file)) return undefined;
  const read = ts.readConfigFile(file, ts.sys.readFile);
  if (read.error) return undefined;
  return ts.convertCompilerOptionsFromJson(read.config?.compilerOptions ?? {}, repo, file).options;
}

/** Where a relative import of `fromRel` lands, project-relative (`src/gear/index`), or undefined outside the project. */
function importTarget(fromRel: string, spec: string): string | undefined {
  const target = posix.normalize(posix.join(posix.dirname(fromRel), spec));
  return target.startsWith('../') || target === '..' ? undefined : target;
}

/** A name that may be a JavaScript identifier for the re-export hint. */
function camel(name: string): string {
  return name.replace(/-+([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Is this file in a generated sheet folder? Then which one. */
function generatedFolderOf(sheetRel: string): GeneratedFolder | undefined {
  const top = sheetRel.split('/')[0];
  return top in GENERATED_SHEETS && sheetRel.includes('/') ? (top as GeneratedFolder) : undefined;
}

/**
 * Checks one project folder against the layout rules. `name` is how the project is called in
 * suggested commands; `repo` is the repository it is in (its tsconfig.json resolves the imports of
 * src/ and sheets/ for rule 8), by default two folders up (`<repo>/projects/<name>`).
 */
export function checkLayout(projectDir: string, name: string, repo = resolve(projectDir, '..', '..')): LayoutReport {
  const errors: LayoutIssue[] = [];
  const warnings: LayoutIssue[] = [];
  const error = (rule: string, path: string, message: string, line?: number) => errors.push(line === undefined ? { rule, path, message } : { rule, path, line, message });
  const warn = (rule: string, path: string, message: string) => warnings.push({ rule, path, message });

  // Rule 1: four places (and a game, rule 8), STYLE.md, an optional README.md, the export config and a .gitignore.
  for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
    if (OS_METADATA.has(entry.name)) continue;
    const allowed = entry.isDirectory() ? (ROOT_DIRS as readonly string[]).includes(entry.name) : (ROOT_FILES as readonly string[]).includes(entry.name);
    if (allowed) continue;
    const what = entry.isDirectory() ? `${entry.name}/` : entry.name;
    const where = entry.isDirectory()
      ? `code goes in src/${entry.name}/, sheets in sheets/${entry.name}/, scratch in review/${entry.name}/`
      : /\.(ts|js)$/.test(entry.name)
        ? `code goes in src/${entry.name}, a sheet in sheets/${entry.name}`
        : /\.(png|jpe?g|json)$/i.test(entry.name)
          ? `exports belong in assets/ (written by npm run export), anything else in review/`
          : `notes go in README.md or STYLE.md, scratch in review/`;
    error('root', what, `${what} is not allowed at the project root, which holds only src/, sheets/, assets/, review/, game/, STYLE.md, README.md, diorama.config.json and .gitignore: ${where}.`);
  }

  const configPath = join(projectDir, 'diorama.config.json');
  if (existsSync(configPath) && !isDir(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        error('config', 'diorama.config.json', `diorama.config.json must be a JSON object (allowed keys: ${ALLOWED_CONFIG_KEYS.join(', ')}).`);
      } else {
        const unknownKeys = Object.keys(config).filter(k => !(ALLOWED_CONFIG_KEYS as readonly string[]).includes(k));
        if (unknownKeys.length > 0) {
          error('config', 'diorama.config.json', `diorama.config.json has unknown keys: ${unknownKeys.join(', ')}. Remove them or fix their spelling (allowed keys: ${ALLOWED_CONFIG_KEYS.join(', ')}).`);
        }
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      error('config', 'diorama.config.json', `diorama.config.json is not valid JSON (${detail}; allowed keys: ${ALLOWED_CONFIG_KEYS.join(', ')}).`);
    }
  }

  // Rules 2 and 6: no underscore prefixes, kebab-case names, in src/ and sheets/.
  const named = new Set<string>();
  for (const place of [LAYOUT.src, LAYOUT.sheets] as const) {
    const base = join(projectDir, place);
    for (const rel of walkFiles(base)) {
      const parts = rel.split('/');
      parts.forEach((part, i) => {
        const isFile = i === parts.length - 1;
        const markdown = place === LAYOUT.src && isFile && /\.md$/i.test(part);
        const stem = isFile ? part.replace(/\..*$/, '') : part;
        const path = `${place}/${parts.slice(0, i + 1).join('/')}${isFile ? '' : '/'}`;
        // A folder is reported once, however many files it holds.
        if (named.has(path)) return;
        named.add(path);
        if (stem.startsWith('_')) {
          const renamed = `${place}/${[...parts.slice(0, i), part.replace(/^_+/, '')].join('/')}${isFile ? '' : '/'}`;
          error('underscore', path, place === LAYOUT.sheets
            ? `${path}: no underscore prefixes (rule 2). Every file in sheets/ is a sheet: move helper code to src/ (e.g. src/${[...parts.slice(0, i), part.replace(/^_+/, '')].join('/')}) and import it from there.`
            : `${path}: no underscore prefixes (rule 2): nothing in src/ is exported by itself, so rename it to ${renamed} (and fix its imports).`);
        } else if (!KEBAB.test(markdown ? stem.toLowerCase() : stem)) {
          const kebab = stem.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s.]+/g, '-').toLowerCase();
          error('name', path, `${path}: names are kebab-case (lowercase words joined by "-", rule 6): rename it to ${posix.join(place, ...parts.slice(0, i), isFile ? part.replace(stem, kebab) : kebab)}${isFile ? '' : '/'}.`);
        }
      });
    }
  }

  // Sheets: .ts files only, thin, generated ones with their header, importing only from src/ (or @core).
  const sheetsDir = join(projectDir, LAYOUT.sheets);
  const sheetFiles = walkFiles(sheetsDir);
  const sheets: string[] = [];
  for (const rel of sheetFiles) {
    const path = `sheets/${rel}`;
    if (!isSheetFile(rel)) {
      error('sheet-file', path, `${path}: sheets/ holds only sheets (.ts files that export one asset). Move it to src/ if code reads it, or to review/ if it is scratch.`);
      continue;
    }
    sheets.push(rel.replace(/\.ts$/, ''));
    const source = readFileSync(join(sheetsDir, rel), 'utf8');
    const code = stripComments(source);
    const stem = rel.replace(/\.ts$/, '');
    const srcTwin = `src/${stem}`;
    const hint = `Move the definition to ${srcTwin}.ts, export it by name there and make the sheet one line: export { ${camel(stem.split('/').pop()!)} as default } from '${posix.relative(posix.dirname(path), srcTwin)}';`;
    const declares = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\b|class\s+[A-Za-z_$])/m.test(code)
      || /=>\s*\{/.test(code)
      || /^\s*(?!if\b|for\b|while\b|switch\b|catch\b|return\b)(?:async\s+)?[A-Za-z_$][\w$]*\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*(?::[^{=]+)?\{/m.test(code);
    const lines = code.split('\n').filter(line => line.trim()).length;
    if (declares) error('thin', path, `${path} declares a function or a class: drawing code lives in src/, a sheet only imports and exports (rule 3). ${hint}`);
    else if (lines > THIN_SHEET_LINES) error('thin', path, `${path} has ${lines} lines of code (a sheet is thin: at most ${THIN_SHEET_LINES}, rule 3). ${hint}`);
    const generated = generatedFolderOf(rel);
    if (generated) {
      const { command } = GENERATED_SHEETS[generated];
      if (!source.startsWith(`// Generated by npm run ${command}`)) {
        error('generated', path, `${path} has lost its "// Generated by npm run ${command}" first line: sheets/${generated}/ is written by npm run ${command} -- ${name} and never edited (rule 3). Change src/${GENERATED_SHEETS[generated].kit}/catalog.ts and run the command with --force; a hand-written sheet belongs in another folder of sheets/.`);
      }
    }
    for (const spec of relativeImports(code)) {
      const target = importTarget(path, spec);
      if (target === undefined) {
        error('direction', path, `${path} imports "${spec}", outside the project: a sheet imports from src/ (or @core, @core/draw, @core/volume, @core/rig).`);
      } else if (target === 'sheets' || target.startsWith('sheets/')) {
        error('direction', path, `${path} imports "${spec}", another sheet (rule 4): move what both need to src/ and import it from there.`);
      } else if (!(target === 'src' || target.startsWith('src/'))) {
        error('direction', path, `${path} imports "${spec}" (${target}): a sheet imports only from src/ (rule 4).`);
      }
    }
  }

  // src/ never imports sheets/ (rule 4); a kit with a catalog has an index (rule 6).
  const srcDir = join(projectDir, LAYOUT.src);
  for (const rel of walkFiles(srcDir)) {
    if (!/\.(ts|tsx|js)$/.test(rel)) continue;
    const path = `src/${rel}`;
    const code = stripComments(readFileSync(join(srcDir, rel), 'utf8'));
    for (const spec of relativeImports(code)) {
      const target = importTarget(path, spec);
      if (target && (target === 'sheets' || target.startsWith('sheets/') || target.startsWith('assets/') || target.startsWith('review/'))) {
        const place = target.split('/')[0];
        error('direction', path, place === 'sheets'
          ? `${path} imports "${spec}", a sheet (rule 4: src/ never imports sheets/). Move the definition from ${target}.ts into src/ and let the sheet re-export it.`
          : `${path} imports "${spec}" from ${place}/: src/ is code, ${place}/ is output (rule 7).`);
      }
    }
  }

  // Rule 8: src/ and sheets/ never import a game, this project's or another's, however the specifier reaches it: resolved
  // as TypeScript resolves it with the repository's tsconfig.json (relative paths, baseUrl, the aliases), else as a path.
  const options = compilerOptionsOf(repo);
  const cache = options ? ts.createModuleResolutionCache(repo, (f) => f, options) : undefined;
  const ownGame = join(projectDir, LAYOUT.game);
  for (const place of [LAYOUT.src, LAYOUT.sheets] as const) {
    const base = join(projectDir, place);
    for (const rel of walkFiles(base)) {
      if (!/\.(ts|tsx|js|mjs)$/.test(rel) || rel.endsWith('.d.ts')) continue;
      const path = `${place}/${rel}`;
      const file = join(base, rel);
      for (const ref of codeReferences(readFileSync(file, 'utf8'), file)) {
        const written = ref.spec ?? ref.prefix;
        // A sheet's relative imports are rule 4's: only src/.
        if (written === undefined || (place === LAYOUT.sheets && written.startsWith('.'))) continue;
        let landed: string | undefined;
        if (ref.kind === 'module' || ref.kind === 'dynamic') {
          if (options && ref.spec !== null) landed = ts.resolveModuleName(ref.spec, file, options, ts.sys, cache).resolvedModule?.resolvedFileName;
          // What TypeScript does not resolve (a JSON, a file not written yet, a template's start): where the path points.
          if (!landed && (written.startsWith('.') || written.startsWith('/'))) landed = written.startsWith('/') ? join(repo, pathOf(written)) : resolve(dirname(file), pathOf(written));
        } else if (!SCHEME.test(written)) {
          const target = ref.kind === 'glob' ? globBase(written) : pathOf(written);
          landed = target.startsWith('/') ? join(repo, target) : resolve(dirname(file), target);
        }
        const game = landed && gameFolderOf(repo, resolve(landed));
        if (!game) continue;
        const own = within(resolve(landed!), ownGame);
        const what = ref.kind === 'module' || ref.kind === 'dynamic' ? `imports ${ref.text}` : `${ref.kind === 'glob' ? 'globs' : 'makes a URL of'} ${ref.text}`;
        error('game', path, `${path} ${what} from ${own ? 'game/' : `${game}/`} (rule 8: ${place}/ never imports ${own ? 'the game' : 'a game'}): ${place}/ draws the assets and the game plays their exports, so what the game needs stays in game/.`, ref.line);
      }
    }
  }
  if (isDir(srcDir)) {
    const folders = [srcDir, ...walkFiles(srcDir).map(rel => join(srcDir, dirname(rel)))];
    for (const dir of [...new Set(folders)]) {
      const rel = posix.join('src', dir.slice(srcDir.length).split('\\').join('/').replace(/^\//, ''));
      if (existsSync(join(dir, 'catalog.ts')) && !existsSync(join(dir, 'index.ts'))) {
        error('kit', `${rel}/`, `${rel}/ has a catalog.ts but no index.ts (rule 6): a kit has both, catalog.ts for editors and index.ts for code. Add ${rel}/index.ts that re-exports the kit's pieces.`);
      }
    }
  }

  // game/: code and data only, playing the exports through the packages (rule 8). Every module specifier and URL of its
  // code, CSS and pages is one of the packages a game uses or a relative path that stays inside game/; anything else is an
  // error, and a dynamic import or a glob is a static string that starts with ./ or ../.
  const gameDir = join(projectDir, LAYOUT.game);
  const through = 'a game plays the exports in assets/ through @diorama/phaser and @diorama/runtime';
  const packages = GAME_PACKAGES.join(', ');
  for (const rel of walkFiles(gameDir)) {
    const path = `game/${rel}`;
    const ext = posix.extname(rel).toLowerCase();
    if (!GAME_EXT.includes(ext)) {
      error('game', path, PICTURE_EXT.test(rel)
        ? `${path}: game/ holds code and data only (rule 8): images come from assets/, through the packages (this.diorama.load of @diorama/phaser fetches a sheet's picture with its atlas). Draw it in src/ and export it from a sheet, or move it to review/ if it is a reference.`
        : `${path}: game/ holds code and data only (rule 8: ${GAME_EXT.join(', ')}). Move it to review/ if it is scratch.`);
      continue;
    }
    const file = join(gameDir, rel);
    const source = readFileSync(file, 'utf8');
    const references = ext === '.html' ? htmlReferences(source) : ext === '.css' ? cssReferences(source) : GAME_CODE_EXT.includes(ext) ? codeReferences(source, file) : [];
    for (const ref of references) {
      const problem = gameReference(ref, file, path);
      if (problem) error('game', path, problem, ref.line);
    }
  }

  /** What is wrong with a reference of a file of game/ (rule 8), as the message; undefined when it is allowed. */
  function gameReference(ref: Reference, file: string, path: string): string | undefined {
    const how = `${ref.how === 'import' || ref.how === 'export ... from' ? '' : ` with ${ref.how}`}${ref.where ? ` in ${ref.where}` : ''}`;
    const verb = ref.kind === 'glob' ? 'globs' : ref.kind === 'url' ? 'loads' : 'imports';
    const said = `${path} ${verb} ${ref.text}${how}`;
    const { spec } = ref;
    if (spec !== null && (spec === '@core' || spec.startsWith('@core/'))) return `${path} imports "${spec}"${how}: a game never imports the engine (rule 8), ${through}.`;
    if (spec === null) {
      return ref.kind === 'glob'
        ? `${said}: a pattern of import.meta.glob in game/ is a static string that starts with ./ or ../ and stays inside game/ (rule 8). Write the pattern out ('./levels/*.json').`
        : ref.kind === 'dynamic'
          ? `${said}: a dynamic import in game/ is a static string that starts with ./ or ../ and stays inside game/ (rule 8), so where it goes can be checked. Write the path out, or list the files with import.meta.glob('./levels/*.ts').`
          : `${said}: game/ loads only static paths inside game/ (rule 8). Write the path out.`;
    }
    // A module specifier that is not a path is a package: one of the game's, or an error. A glob may be negative (!./old/**).
    const written = ref.kind === 'glob' ? spec.replace(/^!/, '') : spec;
    const relativeSpec = written === '.' || written === '..' || written.startsWith('./') || written.startsWith('../');
    if (ref.kind === 'module' && (GAME_PACKAGES as readonly string[]).includes(spec)) return undefined;
    if ((ref.kind === 'dynamic' || ref.kind === 'glob') && !relativeSpec) {
      return ref.kind === 'glob'
        ? `${said}: a pattern of import.meta.glob in game/ starts with ./ or ../ and stays inside game/ (rule 8). Write it from the file ('./levels/*.json').`
        : `${said}: a dynamic import in game/ is a static path that starts with ./ or ../ and stays inside game/ (rule 8). Import a package (${packages}) with a static import at the top of the file.`;
    }
    if (ref.kind === 'module' && !relativeSpec && !spec.startsWith('/') && !SCHEME.test(spec)) {
      const first = spec.split('/')[0];
      const hint = spec.startsWith('@/')
        ? '@/ is the viewer\'s alias (viewer/src/): a game never imports the viewer.'
        : REPO_FOLDERS.includes(first)
          ? 'The repository\'s tsconfig.json reads it as a path from the repository\'s root (its baseUrl): reach your own files by a relative path inside game/, the packages by their names.'
          : first === 'phaser' || first === '@diorama'
            ? `Import the package by its name: ${packages}.`
            : 'Write what it does in game/: a game uses no other package.';
      return `${said}, which is not a package a game uses (rule 8: ${packages}). ${hint}`;
    }
    // A URL in CSS or HTML may point at the page itself (#id).
    if (ref.kind === 'url' && spec.startsWith('#')) return undefined;
    if (SCHEME.test(spec)) {
      return ref.kind === 'module' || ref.kind === 'dynamic'
        ? `${said}, which is not a package a game uses (rule 8: ${packages}): a game runs in the browser and imports only its own files and those packages.`
        : `${said}, which is not a file of game/: a game loads only its own files and the packages (rule 8), nothing from the network or inlined as a data: URL. Put code and data in game/, pictures in assets/ (drawn in src/, exported from a sheet).`;
    }
    const target = spec.startsWith('/') ? join(repo, pathOf(spec)) : resolve(dirname(file), ref.kind === 'glob' ? globBase(spec) : pathOf(spec));
    if (spec.startsWith('/')) {
      const fromHere = posix.relative(posix.dirname(path), relative(projectDir, target).split(sep).join('/')) || '.';
      const fix = within(target, gameDir) ? ` Here that is "${fromHere.startsWith('.') ? fromHere : `./${fromHere}`}".` : '';
      return `${said}, a path from the root of the dev server (the repository's root, Vite's): game/ reaches its own files by relative paths inside game/ and the packages by name (rule 8), so the game works wherever the project is.${fix}`;
    }
    if (within(target, gameDir)) return undefined;
    const inProject = within(target, projectDir);
    const inside = relative(projectDir, target).split(sep).join('/');
    const landed = !inProject ? 'outside the project' : inside || 'the project\'s root';
    const place = inProject ? inside.split('/')[0] : undefined;
    const hint = !inProject
      ? 'Reach a package by its name (@diorama/phaser, @diorama/runtime, phaser), not by a path.'
      : !place ? `Only game/ is the game's: ${through}.`
        : place === LAYOUT.src || place === LAYOUT.sheets ? `src/ and sheets/ draw the assets; ${through}.`
          : place === LAYOUT.assets ? 'Images come from assets/, through the packages: this.diorama.load fetches a sheet\'s picture with its atlas.'
            : `${place}/ is not the game's.`;
    const only = ref.kind === 'url' ? 'loads only its own files' : ref.kind === 'glob' ? 'globs only its own files' : 'imports only its own files and packages';
    return `${said} (${landed}): game/ ${only} (rule 8). ${hint}`;
  }

  // assets/: outputs only, mirroring sheets/ (rules 5 and 7).
  const assetsDir = join(projectDir, LAYOUT.assets);
  const assets = walkFiles(assetsDir);
  const sheetSet = new Set(sheets);
  const groupSheets = new Set<string>();
  for (const rel of assets.filter(r => r.endsWith('.json'))) {
    try {
      const mode = JSON.parse(readFileSync(join(assetsDir, rel), 'utf8'))?.meta?.mode;
      // `export --grid` / `--compact` writes a group sheet next to its folder's assets: it has no sheet of its own.
      if (mode === 'grid' || mode === 'compact') groupSheets.add(rel.replace(/\.json$/, ''));
    } catch {
      // An unreadable atlas is reported below like any other orphan, if it has no sheet.
    }
  }
  const exported = new Set<string>();
  for (const rel of assets) {
    const path = `assets/${rel}`;
    const ext = posix.extname(rel).toLowerCase();
    if (!ASSET_EXT.includes(ext)) {
      error('assets', path, `${path}: assets/ holds only exported images (PNG) and atlas JSON (rule 7). Move it to review/ if it is a review file, or to src/ if code reads it.`);
      continue;
    }
    const stem = rel.slice(0, -ext.length);
    if (IMAGE_EXT.includes(ext)) exported.add(stem);
    if (groupSheets.has(stem) || sheetSet.has(stem)) continue;
    warn('orphan', path, `${path} has no sheet (sheets/${stem}.ts does not exist, rule 5): delete it, or export the sheet that now writes it.`);
  }
  for (const stem of sheets) {
    if (exported.has(stem)) continue;
    warn('missing', `sheets/${stem}.ts`, `sheets/${stem}.ts has no export yet (assets/${stem}.png, rule 5): npm run export -- ${name} ${stem}`);
  }
  return { errors, warnings };
}
