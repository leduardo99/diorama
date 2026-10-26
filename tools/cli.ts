#!/usr/bin/env node
/**
 * Diorama - agent-facing commands for projects, assets and checks.
 *
 * A project is found by name in projects/ first, then examples/ (tools/project.ts); its code is in
 * src/, one thin file per exported sheet in sheets/, the exports in assets/ and review renders in
 * review/ (docs/ARCHITECTURE.md).
 *
 *   npm run new-project -- <project> [--style] [--genre <preset>] [--character <height>]
 *   npm run new-asset -- <project> <subpath> [--engine volume|rig] [--size 128x128] [--frames N] [--fps N] [--directions N]
 *                        [--skeleton humanoid|quadruped] [--clip walk|run|idle|attack|hit|death]   (rig only)
 *     volume: src/<subpath>.ts (the drawing, a named export) and sheets/<subpath>.ts (its one-line re-export).
 *     rig: <subpath> is <character-folder>/<clip>. The first clip creates src/<character-folder>/character.ts
 *     (defineCharacter); --skeleton, --size, --frames and --directions apply to that first clip only.
 *   npm run new-kit -- <project> scenery|gear|vfx|items [--force] [--json]
 *     src/<kit>/catalog.ts, src/<kit>/index.ts and a first piece in a family file (tools/kits.ts), for the kit's
 *     generator command (scenery-items, gear-items, vfx-items, item-icons).
 *   npm run list -- [project] [--json]
 *   npm run check -- <project> [--strict] [--json]
 *     the type check of src/, sheets/ and game/ (tools/typecheck.ts), the layout rules (tools/layout.ts) and the
 *     determinism lint of src/ and sheets/ (tools/lint.ts).
 *   npm run layout -- <project> [--strict] [--json]
 *   npm run game -- <project> [--port N]
 *     serves the project's game/ with the viewer's dev server (vite.config.ts) and prints its URL.
 *   npm run inspect -- <file.png> [--json]
 *   npm run contact -- <file.png> [--with <b.png>] [--rows W,SW] [--frames 0-3] [--zoom N] [--bg 6e6a64] [--gray]
 *     --bg takes six hex digits: an unquoted `#` starts a shell comment, so write 6e6a64 or "#6e6a64".
 *   npm run scenery-items | vfx-items | item-icons | gear-items -- <project> [--force] [--json]
 *   npm run new-scene -- <project> <name> --scene <file.json>
 *   npm run scenery-test -- <project> <piece>
 *   npm run new-outfit-character -- <project> <name> --from <character> --outfit <file.json>
 *   npm run example -- [sample] [--force] [--no-export] [--changed] [--jobs <n>]
 *     copies examples/soulkeeper to projects/soulkeeper (the viewer shows projects/ only) and exports it there.
 *
 * Commands that create files refuse to overwrite anything (the catalog commands keep the files
 * already there unless --force). Use --json (with `npm run --silent`) to get output that can be
 * parsed, and `npm run <command> -- --help` for the options of one command.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import pc from 'picocolors';
import { IMAGE_RE } from './freshness.js';
import { FIRST_PIECE, KIT_KINDS, kitFiles, readKitTheme, type KitKind, type KitTheme } from './kits.js';
import { serverOn } from './dev-server.js';
import { checkLayout, type LayoutReport } from './layout.js';
import { lintProject, type LintIssue } from './lint.js';
import { EXAMPLE_LOCK, takeLock } from './lock.js';
import { GENERATED_SHEETS, LAYOUT, PROJECT_ROOTS, REVIEW, findProject, generatedHeader, listProjects, listSheets, missingProject, walkFiles, type ProjectRef } from './project.js';
import { deleteProject, restoreProject } from './trash.js';
import { typeCheckProject } from './typecheck.js';

const ROOT = resolve(process.cwd());
const PROJECTS = resolve(ROOT, 'projects');
const TEMPLATES = resolve(ROOT, 'templates');
const PROJECT_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
/** The sample of examples/ that `npm run example` copies into projects/ when it is given no name. */
const DEFAULT_SAMPLE = 'soulkeeper';
/** kebab-case path segments: what the layout check accepts for files and folders. */
const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Json = Record<string, unknown>;

function fail(message: string, hint?: string): never {
  console.error(pc.red(`Error: ${message}`));
  if (hint) console.error(pc.gray(hint));
  process.exit(1);
}

const VALUE_FLAGS = ['engine', 'size', 'frames', 'fps', 'directions', 'out', 'zoom', 'bg', 'rows', 'skeleton', 'clip', 'with', 'from', 'outfit', 'scene', 'on', 'genre', 'character', 'port', 'jobs'];

function parseFlags(argv: string[]): { positionals: string[]; flags: Record<string, string | true> } {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split(/=(.*)/s);
    if (inline !== undefined) {
      flags[key] = inline;
    } else if (VALUE_FLAGS.includes(key)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) fail(`--${key} needs a value, for example --${key}=<value>.`);
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { positionals, flags };
}

/** The project called `name` (projects/ first, then examples/), or a clear error listing the ones there are. */
function requireProject(name: string | undefined): ProjectRef {
  if (!name) fail('a project name is required.');
  const project = findProject(name, ROOT);
  if (!project) {
    // `projects/<name>` (what the viewer runs) is answered with projects/ alone: the viewer has no samples to offer.
    const { message, hint } = missingProject(name, ROOT);
    fail(message, hint);
  }
  return project;
}

/** A path relative to the repository root, with forward slashes, for messages. */
function repoPath(file: string): string {
  return relative(ROOT, file).split(sep).join('/');
}

/** The import specifier from `fromFile` to `toFile` (without .ts), always starting with ./ or ../. */
function importPath(fromFile: string, toFile: string): string {
  const rel = relative(dirname(fromFile), toFile).split(sep).join('/').replace(/\.ts$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/** A camelCase identifier for a kebab-case name (`ability-slot` -> `abilitySlot`); reserved words get `Asset` appended. */
const RESERVED = new Set(['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'implements', 'interface', 'package', 'private', 'protected', 'public', 'await']);
function identifierFor(name: string): string {
  const camel = name.replace(/-+([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  const id = /^[0-9]/.test(camel) ? `asset${camel}` : camel;
  return RESERVED.has(id) ? `${id}Asset` : id;
}

function printJson(value: Json): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// new-project
// ---------------------------------------------------------------------------

/** Genre presets of the space profile, read from the engine so the CLI never drifts from it. */
async function spacePresets(): Promise<Record<string, { label: string; description: string }>> {
  return (await import('../core/volume/space.js')).SPACE_PRESETS;
}

async function newProject(positionals: string[], flags: Record<string, string | true>): Promise<void> {
  const name = positionals[0];
  if (!name || !PROJECT_NAME_RE.test(name)) {
    fail('project names use lowercase letters, digits, "-" and "_", and must start with a letter or digit.');
  }
  const target = resolve(PROJECTS, name);
  if (existsSync(target)) fail(`project "${name}" already exists. Nothing was changed.`);
  const example = findProject(`examples/${name}`, ROOT);
  const genre = typeof flags['genre'] === 'string' ? String(flags['genre']) : undefined;
  const character = typeof flags['character'] === 'string' ? Number(flags['character']) : 80;
  if (flags['genre'] === true) fail('--genre takes a preset name, e.g. --genre jrpg');
  if (!(character > 0)) fail('--character takes the height of a standing character in world units, e.g. --character 80');
  if (genre) {
    const presets = await spacePresets();
    if (!presets[genre]) fail(`unknown genre "${genre}". Presets:\n${Object.entries(presets).map(([k, v]) => `  ${k}: ${v.label}. ${v.description}`).join('\n')}`);
  }

  // The layout of docs/ARCHITECTURE.md: src/theme.ts from the template, an empty sheets/, and a
  // .gitignore for review/ (a project can be its own repository). assets/ appears with the first export.
  // STYLE.md is optional and added on request. OS metadata files (Finder's .DS_Store, Windows'
  // Thumbs.db) in a local checkout of the template are not copied.
  const osMetadata = /(^|[\\/])(\.DS_Store|Thumbs\.db)$/;
  cpSync(resolve(TEMPLATES, 'project'), target, { recursive: true, errorOnExist: true, force: false, filter: (src) => !osMetadata.test(src) });
  mkdirSync(resolve(target, LAYOUT.sheets), { recursive: true });
  writeFileSync(resolve(target, '.gitignore'), `# Review renders (contact sheets, scenery tests, mockups): scratch, safe to delete.\n${LAYOUT.review}/\n`, 'utf8');

  if (flags['style']) {
    const content = readFileSync(resolve(TEMPLATES, 'optional', 'STYLE.md'), 'utf8').replace('[Project Name]', name);
    writeFileSync(resolve(target, 'STYLE.md'), content, 'utf8');
  }

  if (genre) writeSpace(target, genre, character);

  console.log(pc.green(`Created projects/${name}/: src/theme.ts, an empty sheets/ and a .gitignore for review/.`));
  if (example) console.log(pc.yellow(`  It hides the example of the same name (examples/${name}): commands now find projects/${name} first.`));
  if (genre) console.log(`  src/space.ts: the ${genre} space profile (grid, scale, wall placement) for scenery and characters.`);
  console.log('Next steps:');
  console.log(`  1. Edit projects/${name}/src/theme.ts: palettes, the camera and the VOLUMES materials.`);
  if (!flags['style']) {
    console.log(`     STYLE.md is optional: --style adds it only when the project is created. Later, copy templates/optional/STYLE.md to projects/${name}/STYLE.md and put the name in its title.`);
  }
  console.log(`  2. npm run new-asset -- ${name} <subpath> --engine volume|rig`);
  console.log(`  3. npm run new-kit -- ${name} scenery|gear|vfx|items, for the first scenery piece, gear part, effect or item`);
}

/**
 * Writes src/space.ts: the project's space profile from a genre preset. The preset list comes from
 * the engine; an unknown name stops before anything is written.
 */
function writeSpace(projectDir: string, genre: string, character: number): void {
  const file = resolve(projectDir, LAYOUT.src, 'space.ts');
  writeFileSync(file, `/**
 * The game's space, declared once (docs/guides/volume/04-scenery-kits.md): the grid, the scale of everything against the
 * characters, and where walls stand. Scenery pieces and checks read SPACE; change proportions here, never in pieces.
 * Started from the "${genre}" preset; override any size with \`scale\` or the wall placement with \`walls\`.
 */

import { defineSpace } from '@core/volume';
import { CAMERA } from './theme';

/** Height of a standing adult character in world units: what the project's skins are built at. */
export const CHARACTER_HEIGHT = ${character};

export const SPACE = defineSpace({ camera: CAMERA, preset: '${genre}', character: CHARACTER_HEIGHT });
`, 'utf8');
}

// ---------------------------------------------------------------------------
// new-asset
// ---------------------------------------------------------------------------

function parseSize(value: string | true | undefined): { width: number; height: number } {
  const raw = value === undefined || value === true ? '128x128' : value;
  const match = /^(\d+)x(\d+)$/.exec(raw);
  if (!match) fail(`--size must look like 128x128, got "${raw}".`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

type Engine = 'volume' | 'rig';
const ENGINES: readonly Engine[] = ['volume', 'rig'];

/** Export scale of the scaffolds: set in a volume asset's file, the default of defineCharacter for rig. */
const ASSET_SCALE = 2;

/** Skeletons and clips `--engine rig` can scaffold: `@core/rig` presets, with the cell and pivot that fit each body. */
const RIG_SKELETONS = {
  humanoid: { width: 96, height: 112, pivotY: 96 / 112 },
  quadruped: { width: 112, height: 96, pivotY: 72 / 96 },
} as const;
const RIG_CLIPS = ['walk', 'run', 'idle', 'attack', 'hit', 'death'] as const;
type RigSkeleton = keyof typeof RIG_SKELETONS;
type RigClip = (typeof RIG_CLIPS)[number];

/** What the rig template needs beyond the cell: the preset, its clip and the theme material for the block-out skin. */
interface RigTemplate {
  skeleton: RigSkeleton;
  clip: RigClip;
  /** Clip key in the character (the clip file's name). */
  key: string;
  /** Character name (the clip folder's name). */
  name: string;
  pivot: { x: number; y: number };
  /** First key of `export const VOLUMES` in the project's theme, or undefined when none was found. */
  material: string | undefined;
}

/** The preset call that builds a scaffolded clip (`skeleton` is the character's skeleton). */
function rigClipCall(r: Pick<RigTemplate, 'skeleton' | 'clip'>): { call: string; import: string } {
  switch (r.clip) {
    case 'idle': return { call: 'idle(skeleton)', import: 'idle' };
    case 'hit': return { call: 'hit(skeleton)', import: 'hit' };
    case 'death': return { call: 'death(skeleton)', import: 'death' };
    case 'attack': return r.skeleton === 'quadruped' ? { call: 'bite(skeleton)', import: 'bite' } : { call: 'slash(skeleton)', import: 'slash' };
    default: return { call: `locomotion(skeleton, '${r.clip}')`, import: 'locomotion' };
  }
}

/** `character.ts` of a new character: defineCharacter with the block-out skin and its first clip. */
function characterSource(r: RigTemplate, width: number, height: number, frames: number, directions: number, themePath: string, sheetDir: string): string {
  const c = rigClipCall(r);
  const skin = `mannequinSkin(VOLUMES.${r.material ?? 'todo'})`;
  const todo = r.material ? '' : '  // TODO: theme.ts has no `export const VOLUMES` material to read: add one there, then name it here.\n';
  const imports = [...new Set(['defineCharacter', r.skeleton, c.import, 'mannequinSkin'])].sort();
  const key = /^[a-z_$][\w$]*$/i.test(r.key) ? r.key : `'${r.key}'`;
  return `/**
 * ${r.name}: the character, declared once. Each of its sheets (\`${sheetDir}/<clip>.ts\`) is a single
 * line, \`export default character.sheet('<key>')\`, and every exported sheet carries this manifest
 * (clip kinds, events, sockets, controls) for games and the viewer's playground.
 *
 * mannequinSkin only blocks out proportions and motion. Replace it with the project's own skin
 * (see the diorama-rig skill) before this ships. Add sockets (hand, weapon tip, mouth) for effects.
 */

import { alpha } from '@core/draw';
import { ${imports.join(', ')} } from '@core/rig';
import { CAMERA, PALETTES, VOLUMES } from '${themePath}';

const skeleton = ${r.skeleton}();

export const character = defineCharacter({
  name: '${r.name}',
  skeleton,
${todo}  skin: ${skin},
  camera: CAMERA,
  width: ${width},
  height: ${height},
  frames: ${frames},
  directions: ${directions},
  pivot: { x: ${r.pivot.x}, y: ${r.pivot.y} },
  shadow: alpha(PALETTES.ink, 0.35),
  clips: {
    ${key}: ${c.call},
  },
});
`;
}

/** `"a", "b" or "c"`: the allowed values of a flag, for error messages. */
function orList(names: readonly string[]): string {
  const quoted = names.map(n => `"${n}"`);
  return quoted.length < 2 ? quoted.join('') : `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`;
}

/** First material key of `export const VOLUMES` in a theme file (identifier keys only), or undefined. */
function firstVolumeKey(themeFile: string): string | undefined {
  const source = readFileSync(themeFile, 'utf8');
  const match = /export\s+const\s+VOLUMES\b[^=]*=\s*\{(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*(?:([A-Za-z_$][\w$]*)|'([A-Za-z_$][\w$]*)'|"([A-Za-z_$][\w$]*)")\s*:/.exec(source);
  return match ? match[1] ?? match[2] ?? match[3] : undefined;
}

/** A rig sheet: one line exporting the character's clip. */
function rigSheetSource(rig: RigTemplate, characterImport: string, characterRel: string): string {
  return `/** ${rig.name}: ${rig.key} sheet. Its clip, skeleton, skin and cell live in ${characterRel}. */

import { character } from '${characterImport}';

export default character.sheet('${rig.key}');
`;
}

/** A volume asset in src/: the drawing, exported by name. Animation lines only appear when the asset has more than one frame. */
function volumeSource(name: string, width: number, height: number, frames: number, fps: number, directions: number, themePath: string, sheetRel: string): string {
  const animated = frames > 1;
  const animLines = animated ? `  frames: ${frames},\n  fps: ${fps},\n` : '';
  const px = Math.round(width / 2);
  const py = Math.round(height * 0.78);
  const dirLine = directions > 1 ? `  directions: ${directions},\n` : '';
  const args = ['ctx', ...(animated ? ['frameIndex'] : []), 'facing = Math.PI / 2'].join(', ');
  return `/** The drawing of ${sheetRel} (that sheet re-exports it): block out the volumes, then the details. */

import { defineAsset } from '@core';
import { Frame3, Stage, vec3 } from '@core/volume';
import { CAMERA } from '${themePath}';

export const ${name} = defineAsset({
  width: ${width},
  height: ${height},
  scale: ${ASSET_SCALE},
${animLines}${dirLine}  pivot: { x: ${px}, y: ${py} },
  // What this is to players and the viewer's playground: 'prop', 'scenery', 'tile', 'vfx' or 'ui'.
  data: { role: 'prop' },
  render({ ${args} }) {
    const cam = CAMERA.at({ x: ${px}, y: ${py} });
    const stage = new Stage(cam);
    const frame = Frame3.facing(vec3(0, 0, 0), facing);
    // Block out the big volumes in \`frame\` first, then attach details with { on: part }.
    stage.draw(ctx);
  },
});
`;
}

function newAsset(positionals: string[], flags: Record<string, string | true>): void {
  const [projectName, subpath] = positionals;
  const project = requireProject(projectName);
  const projectDir = project.dir;
  if (!subpath || !subpath.split('/').every(part => KEBAB_RE.test(part))) {
    fail('asset subpath must be kebab-case names joined by "/" (lowercase letters, digits and "-"), for example props/crate or characters/goblin/walk.');
  }
  const engine = String(flags['engine'] ?? 'volume');
  if (!(ENGINES as readonly string[]).includes(engine)) {
    fail(`--engine must be ${orList(ENGINES)}, got "${engine}".`, 'volume: a prop, a piece of scenery or an effect built from 2.5D volumes. rig: a clip of an animated character.');
  }
  const directions = flags['directions'] !== undefined ? Number(flags['directions']) : 8;
  if (!Number.isInteger(directions) || directions < 1) fail('--directions must be a whole number, 1 or more (1, 4 or 8 have named directions).');
  if (engine !== 'rig') {
    for (const flag of ['skeleton', 'clip']) if (flags[flag] !== undefined) fail(`--${flag} needs --engine rig.`);
  } else if (flags['fps'] !== undefined) {
    fail('--fps does not apply to --engine rig: the clip\'s seconds set the playback speed.');
  }
  const skeleton = String(flags['skeleton'] ?? 'humanoid');
  if (!Object.keys(RIG_SKELETONS).includes(skeleton)) fail(`--skeleton must be ${orList(Object.keys(RIG_SKELETONS))}, got "${skeleton}".`);
  const key = subpath.split('/').pop()!;
  const clip = String(flags['clip'] ?? ((RIG_CLIPS as readonly string[]).includes(key) ? key : 'walk'));
  if (!(RIG_CLIPS as readonly string[]).includes(clip)) fail(`--clip must be ${orList(RIG_CLIPS)}, got "${clip}".`);
  if (engine === 'rig' && !subpath.includes('/')) fail('--engine rig needs <folder>/<clip>, e.g. characters/goblin/walk: the folder is the character, the file is the clip.');
  // Rig cells default to the size that fits the skeleton; volume assets default to 128x128.
  const preset = RIG_SKELETONS[skeleton as RigSkeleton];
  const { width, height } = engine === 'rig' && flags['size'] === undefined ? preset : parseSize(flags['size']);
  const frames = flags['frames'] !== undefined ? Number(flags['frames']) : engine === 'rig' ? 8 : 1;
  if (!Number.isInteger(frames) || frames < 1) fail('--frames must be a whole number, 1 or more.');
  const fps = flags['fps'] !== undefined ? Number(flags['fps']) : 6;
  if (!Number.isFinite(fps) || fps <= 0) fail('--fps must be a positive number.');

  // The sheet (what gets exported) and the code it re-exports: src/<subpath>.ts for a volume asset,
  // src/<character-folder>/character.ts for a rig clip.
  const srcDir = resolve(projectDir, LAYOUT.src);
  const sheetFile = resolve(projectDir, LAYOUT.sheets, `${subpath}.ts`);
  const characterDir = resolve(srcDir, dirname(subpath));
  const codeFile = engine === 'rig' ? resolve(characterDir, 'character.ts') : resolve(srcDir, `${subpath}.ts`);
  const themeFile = resolve(srcDir, 'theme.ts');
  if (existsSync(sheetFile)) fail(`${repoPath(sheetFile)} already exists. Nothing was changed.`);
  if (engine !== 'rig' && existsSync(codeFile)) fail(`${repoPath(codeFile)} already exists. Nothing was changed.`);
  if (!existsSync(themeFile)) {
    fail(`${project.rel}/src/theme.ts is missing.`, 'Create the project with npm run new-project, or restore src/theme.ts.');
  }

  const themePath = importPath(codeFile, themeFile);
  const rig: RigTemplate | undefined = engine === 'rig'
    ? {
        skeleton: skeleton as RigSkeleton,
        clip: clip as RigClip,
        key,
        name: subpath.split('/').slice(-2)[0],
        pivot: { x: Math.round(width / 2), y: Math.round(height * preset.pivotY) },
        material: firstVolumeKey(themeFile),
      }
    : undefined;
  mkdirSync(dirname(sheetFile), { recursive: true });
  mkdirSync(dirname(codeFile), { recursive: true });
  // A rig clip belongs to a character: create its character.ts on the first clip, otherwise
  // leave it alone and say what to add.
  let addToCharacter: string | undefined;
  if (rig) {
    if (!existsSync(codeFile)) {
      writeFileSync(codeFile, characterSource(rig, width, height, frames, directions, themePath, `sheets/${dirname(subpath)}`), 'utf8');
      console.log(pc.green(`Created ${repoPath(codeFile)}`));
    } else {
      // The character already chose its skeleton: suggest that skeleton's preset.
      const existing = /const\s+skeleton\s*=\s*(\w+)\(/.exec(readFileSync(codeFile, 'utf8'))?.[1];
      if (existing && existing in RIG_SKELETONS) rig.skeleton = existing as RigSkeleton;
      const c = rigClipCall(rig);
      addToCharacter = `Add the clip to \`clips\` in ${repoPath(codeFile)}: '${key}': ${c.call} (import ${c.import} from '@core/rig'). Until it is there, the sheet's character.sheet('${key}') is a type error: npm run check reports it and the export stops on it. --skeleton, --size, --frames and --directions are ignored: the character already sets them.`;
    }
    writeFileSync(sheetFile, rigSheetSource(rig, importPath(sheetFile, codeFile), `src/${dirname(subpath)}/character.ts`), 'utf8');
  } else {
    const name = identifierFor(key);
    writeFileSync(codeFile, volumeSource(name, width, height, frames, fps, directions, themePath, `sheets/${subpath}.ts`), 'utf8');
    console.log(pc.green(`Created ${repoPath(codeFile)}`));
    writeFileSync(sheetFile, `export { ${name} as default } from '${importPath(sheetFile, codeFile)}';\n`, 'utf8');
  }
  const scale = ASSET_SCALE;
  const rows = directions > 1 ? `, ${directions} directions as rows` : '';
  const perFrame = frames > 1 || directions > 1 ? ` per frame${frames > 1 ? `, ${frames} frames in a strip` : ''}${rows}` : '';
  console.log(pc.green(`Created ${repoPath(sheetFile)}`));
  const scaleNote = engine === 'rig' ? `scale ${scale} is the default of defineCharacter` : `scale ${scale}, set in ${repoPath(codeFile)}`;
  if (!addToCharacter) console.log(`Logical size ${width}x${height}. The export is ${width * scale}x${height * scale}${perFrame} (${scaleNote}).`);
  if (rig && !rig.material && !addToCharacter) console.log(pc.yellow('No material found in VOLUMES (src/theme.ts): fix the TODO in character.ts before exporting.'));
  if (addToCharacter) console.log(pc.yellow(addToCharacter));
  if (rig && !addToCharacter) console.log('The skin is a mannequin block-out: replace it with the project skin (diorama-rig skill) before it ships.');
  console.log(`Export it with: npm run export -- ${project.name} ${subpath}`);
}

// ---------------------------------------------------------------------------
// new-kit: src/<kit>/catalog.ts, index.ts and a first piece (tools/kits.ts), for the kit's generator command.
// ---------------------------------------------------------------------------

async function newKit(positionals: string[], flags: Record<string, string | true>): Promise<void> {
  const [projectName, kind] = positionals;
  const project = requireProject(projectName);
  if (!kind || !(KIT_KINDS as readonly string[]).includes(kind)) {
    fail(`the kit must be ${orList(KIT_KINDS)}${kind ? `, got "${kind}"` : ''}.`, 'npm run new-kit -- <project> scenery|gear|vfx|items [--force]');
  }
  const kit = kind as KitKind;
  const [folder, generated] = Object.entries(GENERATED_SHEETS).find(([, g]) => g.kit === kit)!;
  const kitDir = resolve(project.dir, LAYOUT.src, kit);
  let theme: KitTheme;
  try {
    theme = await readKitTheme(project.dir);
  } catch (err) {
    fail(`${project.rel}: ${(err as Error).message}`);
  }
  const files = kitFiles(kit, project.name, theme);
  // A kit is there when any file new-kit would write is: refuse unless --force, before writing anything.
  const existing = files.map(f => resolve(kitDir, f.name)).filter(existsSync);
  if (existing.length && !flags['force']) {
    fail(`${project.rel}/src/${kit}/ already has a kit: ${existing.map(f => basename(f)).join(', ')}. Nothing was changed.`, `Pass --force to replace these files (the kit's other files stay), or add the next piece by hand: its drawing in a family file, its entry in src/${kit}/catalog.ts.`);
  }
  mkdirSync(kitDir, { recursive: true });
  const written: string[] = [];
  for (const file of files) {
    const target = resolve(kitDir, file.name);
    writeFileSync(target, file.content, 'utf8');
    written.push(repoPath(target));
  }
  // Sheets generated from the catalog that was replaced may name pieces the new one lacks.
  const stale = existing.length ? listSheets(project.dir).filter(s => s.startsWith(`${folder}/`)) : [];
  const first = FIRST_PIECE[kit];
  const next = [
    `npm run ${generated.command} -- ${project.name}`,
    `npm run export -- ${project.name} ${folder}/`,
    `npm run check -- ${project.name} --strict`,
    ...(kit === 'scenery' ? [`npm run scenery-test -- ${project.name} ${first.id}`] : []),
  ];
  if (flags['json']) {
    printJson({ project: project.name, kit, files: written, firstPiece: first.id, space: theme.space, next, ...(stale.length ? { staleSheets: stale.map(s => `sheets/${s}.ts`) } : {}) });
    return;
  }
  console.log(pc.green(`Created the ${kit} kit of ${project.name}: ${written.join(', ')}`));
  console.log(`  Its first piece, "${first.id}" in src/${kit}/${first.family}, is a block-out drawn with the theme's materials: make it the project's own.`);
  if ((kit === 'scenery' || kit === 'vfx') && !theme.space) console.log(pc.yellow(`  No space profile (src/space.ts): the catalog uses the theme's camera${kit === 'scenery' ? ' and a 48 × 36 grid' : ''}. new-project --genre writes one; guide 04 §1 says how to add it by hand.`));
  if (stale.length) console.log(pc.yellow(`  sheets/${folder}/ still has ${stale.length} sheet(s) generated from the old catalog: delete the ones whose piece is gone, then run ${generated.command} with --force.`));
  console.log('Next:');
  next.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
  if (kit === 'scenery') console.log(`  A scene painted in the viewer's Scenery tab (or written as JSON) becomes source with npm run new-scene -- ${project.name} <name> --scene <file.json>.`);
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

function listOutputs(dir: string): string[] {
  return walkFiles(dir).filter(rel => ['.png', '.jpg', '.jpeg', '.json'].includes(extname(rel).toLowerCase()));
}

function list(positionals: string[], flags: Record<string, string | true>): void {
  const asJson = Boolean(flags['json']);
  // Every folder of projects/, then every sample of examples/ (one a project of the same name hides too: examples/<name> reaches it).
  const refs = positionals[0] ? [requireProject(positionals[0])] : PROJECT_ROOTS.flatMap(root => listProjects(ROOT, [root]));

  const projects = refs.map(ref => ({
    project: ref.name,
    dir: ref.rel,
    // A sample ships with Diorama (examples/): the viewer does not show it until npm run example copies it into projects/.
    sample: ref.root === 'examples',
    sheets: listSheets(ref.dir),
    assets: listOutputs(resolve(ref.dir, LAYOUT.assets)),
    // Review files (contact sheets, scenery tests, --mockup exports): never game assets.
    review: listOutputs(resolve(ref.dir, LAYOUT.review)),
    config: existsSync(resolve(ref.dir, 'diorama.config.json')),
  }));

  if (asJson) {
    printJson({ projects });
    return;
  }
  for (const p of projects) {
    console.log(`${pc.bold(p.project)} ${pc.gray(p.dir)}${p.sample ? pc.cyan(` sample (npm run example${p.project === DEFAULT_SAMPLE ? '' : ` -- ${p.project}`} copies it into projects/)`) : ''}`);
    console.log(`  sheets (${p.sheets.length}):  ${p.sheets.join(', ') || '-'}`);
    console.log(`  assets (${p.assets.length}):  ${p.assets.join(', ') || '-'}`);
    console.log(`  review files (${p.review.length}): ${p.review.join(', ') || '-'}`);
    console.log(`  config: ${p.config ? 'yes' : 'no'}`);
  }
}

// ---------------------------------------------------------------------------
// check and layout
// ---------------------------------------------------------------------------

/** Prints a layout report; with --strict its warnings count as errors. Returns whether it passes. */
function printLayout(project: ProjectRef, report: LayoutReport, strict: boolean): boolean {
  const failing = strict ? [...report.errors, ...report.warnings] : report.errors;
  const warnings = strict ? [] : report.warnings;
  if (failing.length === 0) console.log(pc.green(`${project.name}: layout follows docs/ARCHITECTURE.md (${project.rel}).`));
  else {
    console.log(pc.red(`${project.name}: ${failing.length} layout problem(s) in ${project.rel}/:`));
    for (const issue of failing) console.log(`  ${issue.message}`);
  }
  if (warnings.length) {
    const missing = warnings.filter(w => w.rule === 'missing').length;
    const orphans = warnings.length - missing;
    console.log(pc.yellow(`${project.name}: ${[missing ? `${missing} sheet(s) not exported yet` : '', orphans ? `${orphans} asset(s) without a sheet` : ''].filter(Boolean).join(', ')} (warnings; --strict makes them errors).`));
    const shown = warnings.length > 12 && missing === warnings.length ? [] : warnings.slice(0, 12);
    for (const w of shown) console.log(pc.yellow(`  ${w.message}`));
    if (warnings.length > shown.length) console.log(pc.yellow(`  ... ${shown.length ? `and ${warnings.length - shown.length} more` : `export them with: npm run export -- ${project.name}`}`));
  }
  return failing.length === 0;
}

function layout(positionals: string[], flags: Record<string, string | true>): void {
  const project = requireProject(positionals[0]);
  const strict = Boolean(flags['strict']);
  const report = checkLayout(project.dir, project.name, ROOT);
  const ok = (strict ? report.errors.length + report.warnings.length : report.errors.length) === 0;
  if (flags['json']) printJson({ project: project.name, dir: project.rel, ok, strict, ...report } as unknown as Json);
  else printLayout(project, report, strict);
  process.exit(ok ? 0 : 1);
}

/** Prints the determinism lint (tools/lint.ts). Returns whether it passes. */
function printLint(project: ProjectRef, issues: LintIssue[]): boolean {
  if (issues.length === 0) {
    console.log(pc.green(`${project.name}: deterministic (no Math.random, Date or raw colors outside src/theme.ts).`));
    return true;
  }
  console.log(pc.red(`${project.name}: ${issues.length} determinism problem(s) in ${project.rel}/:`));
  for (const issue of issues) console.log(`  ${issue.message}`);
  return false;
}

function check(positionals: string[], flags: Record<string, string | true>): void {
  const project = requireProject(positionals[0]);
  const asJson = Boolean(flags['json']);
  const strict = Boolean(flags['strict']);

  // The project's src/ and sheets/ with the repository's tsconfig (tools/typecheck.ts, the check export runs too).
  const types = typeCheckProject(project, ROOT);
  const { projectErrors } = types;
  const report = checkLayout(project.dir, project.name, ROOT);
  const layoutOk = (strict ? report.errors.length + report.warnings.length : report.errors.length) === 0;
  const lint = lintProject(project.dir);
  const ok = projectErrors.length === 0 && layoutOk && lint.length === 0;

  if (asJson) {
    printJson({
      project: project.name,
      dir: project.rel,
      ok,
      projectErrors,
      engineErrors: types.otherErrors.length,
      layout: { ok: layoutOk, strict, ...report },
      lint: { ok: lint.length === 0, issues: lint },
    });
  } else {
    if (projectErrors.length === 0) console.log(pc.green(`${project.name}: no type errors.`));
    else {
      console.log(pc.red(`${project.name}: ${projectErrors.length} type error(s):`));
      for (const line of projectErrors) console.log(`  ${line}`);
    }
    if (types.otherErrors.length > 0) {
      console.log(pc.yellow(`Warning: ${types.otherErrors.length} type error(s) outside the project, in the engine files it imports (not the project's to fix): ${types.otherErrors[0]}`));
    }
    printLayout(project, report, strict);
    printLint(project, lint);
  }
  process.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------------------
// game
// ---------------------------------------------------------------------------


/** Serves a project's game/ (rule 8) with the viewer's dev server, which resolves @diorama/phaser and serves assets/ next to it. */
async function game(positionals: string[], flags: Record<string, string | true>): Promise<void> {
  const project = requireProject(positionals[0]);
  const page = join(project.dir, LAYOUT.game, 'index.html');
  if (!existsSync(page)) {
    fail(
      `${project.name} has no game: ${project.rel}/game/index.html does not exist. A project's game is its own page in game/ that plays its exports through @diorama/phaser (docs/ARCHITECTURE.md, rule 8).`,
      `Write game/index.html and its code to make one (packages/phaser/README.md shows a scene). To try the exports in Phaser without a game, open the package's test bench under npm run view: http://localhost:5173/packages/phaser/demo/?project=${project.name}`,
    );
  }
  const port = flags['port'] === undefined ? 5173 : Number(flags['port']);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) fail(`--port must be a port number, not "${flags['port']}".`);
  const url = `http://localhost:${port}/${project.rel}/${LAYOUT.game}/`;
  const answering = await serverOn(port);
  if (answering.kind === 'ours') {
    console.log(pc.green(`${project.name}: the dev server on port ${port} already serves the game:`));
    console.log(url);
    return;
  }
  if (answering.kind === 'diorama') fail(`port ${port} is taken by the dev server of another checkout of Diorama (${answering.root}), which does not serve this one's projects.`, 'Stop it, or pass --port <another>.');
  if (answering.kind === 'other') fail(`port ${port} is taken by another program: it answers, but it is not this repository's dev server (npm run view).`, 'Stop it, or pass --port <another>.');
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: resolve(ROOT, 'vite.config.ts'), root: ROOT, server: { port, strictPort: true } });
  try {
    await server.listen();
  } catch (err) {
    await server.close();
    fail(`port ${port} is taken by another program: ${err instanceof Error ? err.message : String(err)}`, 'Stop it, or pass --port <another>.');
  }
  console.log(pc.green(`${project.name}: the game is served (Ctrl+C stops it):`));
  console.log(url);
}

// ---------------------------------------------------------------------------
// inspect (PNG only, 8-bit RGB or RGBA, non-interlaced)
// ---------------------------------------------------------------------------

interface Decoded {
  width: number;
  height: number;
  channels: number;
  pixels: Buffer;
}

function decodePng(buffer: Buffer): Decoded {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') fail('inspect only reads PNG files.');

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      if (bitDepth !== 8) fail(`inspect supports 8-bit PNG only (found ${bitDepth}-bit).`);
      if (colorType !== 6 && colorType !== 2) fail(`inspect supports RGB and RGBA PNG only (found color type ${colorType}).`);
      if (interlace !== 0) fail('inspect does not support interlaced PNG.');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let value = raw[src + x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc2 = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc2 ? left : pb <= pc2 ? up : upLeft;
      }
      pixels[y * stride + x] = value & 255;
    }
  }

  return { width, height, channels, pixels };
}

function inspect(positionals: string[], flags: Record<string, string | true>): void {
  const target = positionals[0];
  if (!target) fail('a PNG file is required.');
  const file = resolve(ROOT, target);
  if (!existsSync(file)) fail(`file not found: ${target}`);

  const image = decodePng(readFileSync(file));
  const { width, height, channels, pixels } = image;

  let minX = width, minY = height, maxX = -1, maxY = -1;
  let transparent = 0;
  const colors = new Set<number>();
  let opaque = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const a = channels === 4 ? pixels[i + 3] : 255;
      if (a === 0) {
        transparent++;
        continue;
      }
      opaque++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (colors.size < 200000) {
        colors.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
      }
    }
  }

  const total = width * height;
  const touches = {
    top: opaque > 0 && minY === 0,
    bottom: opaque > 0 && maxY === height - 1,
    left: opaque > 0 && minX === 0,
    right: opaque > 0 && maxX === width - 1,
  };

  // Strips and direction sheets: the image edges only tell about the outer cells, so each
  // cell from the companion atlas JSON is checked on its own.
  const atlasFile = file.replace(/\.png$/i, '.json');
  let cells: Json | undefined;
  if (existsSync(atlasFile)) {
    try {
      const atlas = JSON.parse(readFileSync(atlasFile, 'utf8'));
      const frames = Object.entries((atlas.frames ?? {}) as Record<string, { x: number; y: number; width: number; height: number }>);
      const pivot = atlas.meta?.pivot as { x: number; y: number } | undefined;
      const touching: string[] = [];
      const empty: string[] = [];
      const groundGaps: number[] = [];
      const tops: { y: number; top: number }[] = [];
      for (const [name, f] of frames) {
        let cx0 = Infinity, cy0 = Infinity, cx1 = -1, cy1 = -1;
        for (let y = f.y; y < f.y + f.height && y < height; y++) {
          for (let x = f.x; x < f.x + f.width && x < width; x++) {
            const a = channels === 4 ? pixels[(y * width + x) * channels + 3] : 255;
            if (a === 0) continue;
            if (x < cx0) cx0 = x;
            if (x > cx1) cx1 = x;
            if (y < cy0) cy0 = y;
            if (y > cy1) cy1 = y;
          }
        }
        if (cx1 < 0) {
          empty.push(name);
          continue;
        }
        if (cx0 === f.x || cy0 === f.y || cx1 === f.x + f.width - 1 || cy1 === f.y + f.height - 1) touching.push(name);
        if (pivot) {
          groundGaps.push(f.y + pivot.y - cy1);
          tops.push({ y: f.y, top: f.y + pivot.y - cy0 });
        }
      }
      // Scenery sheets say how tall the piece should stand (its nominal height from the space profile); a wall
      // that comes in several heights has one row per height.
      const nominal = atlas.meta?.data?.height as { world: number; screen: number } | undefined;
      const perRow = atlas.meta?.data?.heights as { row: number; world: number; screen: number }[] | undefined;
      const rowsY = [...new Set(tops.map(t => t.y))].sort((a, b) => a - b);
      const medianOf = (list: number[]) => (list.length ? list.slice().sort((a, b) => a - b)[Math.floor(list.length / 2)] : undefined);
      const heightRows = (nominal || perRow) && atlas.meta?.scale
        ? rowsY.map((y, row) => {
            const want = perRow?.[row] ?? nominal!;
            return { row, measured: medianOf(tops.filter(t => t.y === y).map(t => t.top))!, expected: Math.round(want.screen * atlas.meta.scale), world: want.world };
          })
        : [];
      cells = {
        count: frames.length,
        touchingCellEdges: touching,
        empty,
        ...(groundGaps.length
          ? { pivotToContentBottom: { min: Math.min(...groundGaps), max: Math.max(...groundGaps) } }
          : {}),
        ...(heightRows.length
          ? {
              heightAbovePivot: heightRows,
              // A piece also reaches north of its pivot in depth (a wall's north arm, a coffin lying lengthwise):
              // at most half its footprint's depth on screen.
              depthReach: Math.round(((Math.max(...((atlas.meta?.data?.footprint as number[] | undefined) ?? [1])) * ((atlas.meta?.data?.grid?.screen?.h as number | undefined) ?? 0)) / 2) * atlas.meta.scale),
            }
          : {}),
      };
    } catch {
      cells = undefined;
    }
  }

  const quality = qualityOf(image);
  // Off-scale scenery: the typical cell stands much shorter or taller than its nominal height says. The top
  // face, caps and finials add a little, so the band is wider above than below.
  // Other states and clips (an open lid, a broken stump, a swinging leaf) are judged on the default state's sheet only.
  let otherLook = false;
  try {
    const d = existsSync(file.replace(/\.png$/i, '.json')) ? JSON.parse(readFileSync(file.replace(/\.png$/i, '.json'), 'utf8')).meta?.data : undefined;
    otherLook = !!d?.clip || (Array.isArray(d?.states) && d.state !== d.states[0]);
  } catch {
    otherLook = false;
  }
  const tall = otherLook ? [] : (cells as { heightAbovePivot?: { row: number; measured: number; expected: number; world: number }[] } | undefined)?.heightAbovePivot ?? [];
  const reach = (cells as { depthReach?: number } | undefined)?.depthReach ?? 0;
  for (const t of tall) {
    // Too short against the height alone; too tall only beyond the height plus the depth the piece may reach north.
    const ratio = t.expected <= 0 ? 1 : t.measured < t.expected ? t.measured / t.expected : Math.max(1, (t.measured - reach) / t.expected);
    // Props in facings share one nominal height: one warning for the sheet is enough.
    if (quality && (ratio < 0.85 || ratio > 1.4) && !(t.row > 0 && tall.length > 1 && tall[0].world === t.world && quality.warnings.some(w => w.startsWith('off scale')))) {
      quality.warnings.push(`off scale${tall.length > 1 ? ` (row ${t.row})` : ''}: the piece stands ${t.measured} px above its pivot, its nominal height (${t.world} world units in the space profile) is ${t.expected} px${reach ? `, plus up to ${reach} px of depth north of the pivot` : ''}; resize it or correct its \`height\`/\`heights\` in the catalog`);
    }
  }
  let tileSheet = false;
  try {
    const atlasPath = file.replace(/\.png$/i, '.json');
    const role = quality && existsSync(atlasPath) ? JSON.parse(readFileSync(atlasPath, 'utf8')).meta?.data?.role : undefined;
    tileSheet = role === 'tile';
    if (quality && role === 'gear') {
      // A gear part alone is one or two materials by design: its values, tones and accent are
      // judged on the character that wears it, so only the line check applies here.
      quality.warnings = quality.warnings.filter(w => w.startsWith('lines dominate'));
    } else if (quality && role === 'tile') {
      // A floor reads calmer than the actors on it: a narrower value range, fewer tone levels and
      // no accent of its own (quality bar, floors).
      quality.warnings = quality.warnings.filter(w => w.startsWith('lines dominate'));
      if (quality.valueSpread < 0.12) quality.warnings.push(`flat floor (spread ${quality.valueSpread} < 0.12): give the material a dark and a lit tone, and details (cracks, pebbles, joints) a step apart from it`);
      if (quality.valueSpread > 0.45) quality.warnings.push(`busy floor (spread ${quality.valueSpread} > 0.45): floors read calmer than the actors on them; narrow the range and soften the details`);
      if (quality.toneLevels < 4) quality.warnings.push(`few tone levels on a floor (${quality.toneLevels} < 4): add a lit and a shadow tone to the material`);
    } else if (quality && role === 'decal') {
      // A decal is a quiet mark on the floor: an accent is optional.
      quality.warnings = quality.warnings.filter(w => !w.startsWith('no saturated accent'));
    } else if (quality && role === 'vfx') {
      // An effect is mostly glow and colour by nature: only too much black line matters.
      quality.warnings = quality.warnings.filter(w => w.startsWith('lines dominate'));
    } else if (quality && role === 'ui') {
      // Interface pieces are flat by design and carry no focal accent of their own.
      quality.warnings = quality.warnings.filter(w => w.startsWith('lines dominate'));
    }
  } catch {
    // An unreadable atlas keeps every warning.
  }
  // Character sheets carry the rig's motion check (bone drift, foot slide, loop closure) and the
  // clip's loop flag. Older atlases may lack the flag or have a null loopGap.
  let motion: { warnings?: string[]; loopGap?: number | null } | undefined;
  // A character holding items carries the grip checks (`checkGrips`): how its hands hold, per facing and frame.
  type GripLine = { worst: number; frame: string; hand: string; failing: number; of: number } | null;
  let grips: (Record<'gripGap' | 'openHandHolding' | 'wristLimit' | 'reachStretch' | 'gripDrift' | 'handleTooShort', GripLine> & { errors?: string[]; warnings?: string[]; notes?: string[] }) | undefined;
  let clipData: { loop?: boolean; groundSpeed?: number; events?: unknown[] } = {};
  // Characters defined with defineCharacter carry their manifest in every sheet.
  let character: { name: string; key?: string; action?: string; clips: { key: string; kind: string }[]; controls: { idle?: string; move: string[]; actions: Record<string, string[]> }; warnings: string[]; missingSheets: string[] } | undefined;
  try {
    const atlasPath = file.replace(/\.png$/i, '.json');
    if (existsSync(atlasPath)) {
      const data = JSON.parse(readFileSync(atlasPath, 'utf8')).meta?.data;
      motion = data?.motion;
      grips = data?.grips;
      clipData = { loop: data?.loop, groundSpeed: data?.groundSpeed, events: data?.events };
      const m = data?.character;
      if (m && Array.isArray(m.clips)) {
        // Every clip of the manifest must have its sheet next to this one (<key>.png).
        const dir = dirname(file);
        const missingSheets = m.clips.map((c: { key: string }) => c.key).filter((k: string) => !existsSync(join(dir, `${k}.png`)));
        const warnings = [...(m.warnings ?? [])];
        if (data.key && !m.clips.some((c: { key: string }) => c.key === data.key)) warnings.push(`this sheet's key "${data.key}" is not in the manifest`);
        // Every cued effect must have its sheet in the project's assets/vfx/ (a typo plays nothing).
        const assets = file.lastIndexOf(`${sep}${LAYOUT.assets}${sep}`);
        if (m.effects && assets >= 0) {
          const vfx = join(file.slice(0, assets), LAYOUT.assets, 'vfx');
          const ids = new Set(Object.values(m.effects as Record<string, { effect: string }[]>).flat().map(c => c.effect));
          for (const id of ids) if (!existsSync(join(vfx, `${id}.png`))) warnings.push(`effect "${id}" is cued but assets/vfx/${id}.png does not exist (a typo, or sheets/vfx/ not generated with vfx-items and exported)`);
        }
        character = { name: m.name, key: data.key, action: data.action, clips: m.clips.map((c: { key: string; kind: string }) => ({ key: c.key, kind: c.kind })), controls: m.controls, warnings, missingSheets };
      }
    }
  } catch {
    motion = undefined;
  }
  // A clip that ends where it starts, stands in place and has no events (actions mark their hit)
  // looks like a cycle with `loop` left at false: its closure is then never checked. clipKind
  // cannot tell: the engine calls every non-looping, standing clip an action.
  const loopGap = typeof motion?.loopGap === 'number' ? motion.loopGap : undefined;
  const loopHint = clipData.loop === false && loopGap !== undefined && loopGap < 0.05 && clipData.groundSpeed === 0 && !(clipData.events?.length)
    ? 'ends where it starts but loop is false — if it is a cycle, pass loop: true to defineClip so closure is checked'
    : undefined;

  const report = {
    file: target.replace(/\\/g, '/'),
    width,
    height,
    opaqueBounds: opaque > 0 ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
    reachesEdges: touches,
    transparentShare: Number((transparent / total).toFixed(4)),
    distinctOpaqueColors: colors.size,
    ...(cells ? { cells } : {}),
    ...(quality ? { quality } : {}),
    ...(motion
      ? { motion: { ...motion, ...(typeof clipData.loop === 'boolean' ? { loop: clipData.loop } : {}), ...(loopHint ? { hint: loopHint } : {}) } }
      : {}),
    ...(grips ? { grips } : {}),
    ...(character ? { character } : {}),
  };

  if (flags['json']) {
    printJson(report as unknown as Json);
    return;
  }
  console.log(pc.bold(report.file));
  console.log(`  size: ${width}x${height}`);
  console.log(`  content bounds: ${report.opaqueBounds ? `${minX},${minY} ${report.opaqueBounds.width}x${report.opaqueBounds.height}` : 'empty'}`);
  // Reaching an edge is fine for full-bleed backgrounds and a problem for sprites with a margin.
  console.log(`  reaches edges: ${Object.entries(touches).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`);
  console.log(`  transparent: ${(report.transparentShare * 100).toFixed(1)}%`);
  console.log(`  distinct opaque colors: ${report.distinctOpaqueColors}${colors.size >= 200000 ? '+' : ''}`);
  if (cells) {
    const c = cells as { count: number; touchingCellEdges: string[]; empty: string[]; pivotToContentBottom?: { min: number; max: number } };
    // Floor tiles are full-bleed by design: say so once instead of listing every frame.
    const touching = tileSheet && c.touchingCellEdges.length ? `all ${c.touchingCellEdges.length} by design (floor tiles are full-bleed)` : c.touchingCellEdges.join(', ') || 'none';
    console.log(`  cells: ${c.count}, touching their cell edges: ${touching}, empty: ${c.empty.join(', ') || 'none'}`);
    if (c.pivotToContentBottom) console.log(`  pivot to content bottom (px): ${c.pivotToContentBottom.min} to ${c.pivotToContentBottom.max}`);
    const h = (cells as { heightAbovePivot?: { row: number; measured: number; expected: number; world: number }[] }).heightAbovePivot;
    if (h?.length) console.log(`  height above pivot (px, typical vs nominal): ${h.map(r => `${h.length > 1 ? `row ${r.row} ` : ''}${r.measured} vs ${r.expected} (${r.world} world units)`).join('; ')}`);
  }
  if (quality) {
    console.log(`  quality: value spread ${quality.valueSpread}, tone levels ${quality.toneLevels}, ink ${(quality.inkShare * 100).toFixed(1)}%, accent ${(quality.accentShare * 100).toFixed(1)}%`);
    for (const w of quality.warnings) console.log(pc.yellow(`  ⚠ ${w}`));
  }
  if (motion) {
    const warnings = motion.warnings ?? [];
    const loops = clipData.loop === true ? ` · loops${loopGap !== undefined ? ` (gap ${loopGap})` : ''}` : clipData.loop === false ? ' · plays once' : '';
    console.log(`  motion: ${warnings.length ? `${warnings.length} problem(s)` : 'clean'}${loops}`);
    for (const w of warnings) console.log(pc.yellow(`  ⚠ motion: ${w}`));
    if (loopHint) console.log(pc.yellow(`  hint: ${loopHint}`));
  }
  if (grips) {
    const errors = grips.errors ?? [];
    const warnings = grips.warnings ?? [];
    const notes = grips.notes ?? [];
    const counts = [errors.length ? `${errors.length} error(s)` : '', warnings.length ? `${warnings.length} warning(s)` : '', notes.length ? `${notes.length} note(s)` : ''].filter(Boolean).join(', ');
    console.log(`  grips: ${counts || 'clean'}`);
    // The worst value of each check, with its frame: gap and drift in hand lengths, the wrist and the reach against their limits, the handle in palms per hand.
    const line = (name: string, m: GripLine) => (m ? `${name} ${m.worst} (${m.hand}, ${m.frame})` : `${name} -`);
    console.log(`    ${[line('gap', grips.gripGap), line('open', grips.openHandHolding), line('wrist', grips.wristLimit), line('reach', grips.reachStretch), line('drift', grips.gripDrift), line('handle', grips.handleTooShort)].join(' · ')}`);
    for (const e of errors) console.log(pc.red(`  ✖ grips: ${e}`));
    for (const w of warnings) console.log(pc.yellow(`  ⚠ grips: ${w}`));
    for (const n of notes) console.log(pc.dim(`  · grips: ${n}`));
  }
  if (character) {
    const c = character;
    const acts = Object.entries(c.controls.actions ?? {}).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ');
    console.log(`  character: ${c.name} · this sheet: ${c.key ?? '?'} (${c.action ?? '?'}) · ${c.clips.length} clips`);
    console.log(`  controls: idle ${c.controls.idle ?? 'none'} · move ${c.controls.move.join(' < ') || 'none'}${acts ? ` · ${acts}` : ''}`);
    for (const k of c.missingSheets) console.log(pc.yellow(`  ⚠ character: no sheet for clip "${k}" next to this one (add sheets/<character>/${k}.ts, which exports character.sheet('${k}'), and export it)`));
    for (const w of c.warnings) console.log(pc.yellow(`  ⚠ character: ${w}`));
  }
}

/**
 * Readability numbers of the opaque pixels, whatever the art style: how far apart the darkest and
 * lightest tones are, how many tone levels carry the form, how much of the sprite is line, and
 * whether a saturated accent gives it a focal point. Warnings name the usual fix.
 */
function qualityOf(image: Decoded): { valueSpread: number; toneLevels: number; inkShare: number; accentShare: number; warnings: string[] } | undefined {
  const { width, height, channels, pixels } = image;
  const lum: number[] = [];
  let ink = 0;
  let accent = 0;
  const bins = new Array(16).fill(0);
  for (let i = 0; i < width * height; i++) {
    const k = i * channels;
    if (channels === 4 && pixels[k + 3] < 200) continue;
    const r = pixels[k] / 255, g = pixels[k + 1] / 255, b = pixels[k + 2] / 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum.push(l);
    bins[Math.min(15, Math.floor(l * 16))]++;
    if (l < 0.07) ink++;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 0.55 && (max - min) / max > 0.5) accent++;
  }
  const n = lum.length;
  if (n < 50) return undefined;
  lum.sort((a, b) => a - b);
  const valueSpread = Number((lum[Math.floor(n * 0.95)] - lum[Math.floor(n * 0.05)]).toFixed(3));
  const toneLevels = bins.filter(c => c / n >= 0.015).length;
  const inkShare = Number((ink / n).toFixed(4));
  const accentShare = Number((accent / n).toFixed(4));
  const warnings: string[] = [];
  if (valueSpread < 0.3) warnings.push(`flat values (spread ${valueSpread} < 0.3): give each material dark, base and lit tones that differ, and neighbouring materials different values`);
  if (toneLevels < 5) warnings.push(`few tone levels (${toneLevels} < 5): the form reads as cut-out shapes; add form shading and secondary materials`);
  if (inkShare > 0.3) warnings.push(`lines dominate (${(inkShare * 100).toFixed(0)}% near-black > 30%): thinner inner lines in a dark shade of each material, thicker parts, or hollows in a dark color instead of black`);
  if (accentShare === 0) warnings.push('no saturated accent: a small focal color (eyes, gem, flame, runes) helps the eye find the subject (ignore for deliberately muted assets)');
  if (accentShare > 0.2) warnings.push(`accent everywhere (${(accentShare * 100).toFixed(0)}% > 20%): keep saturated color for the focal point`);
  return { valueSpread, toneLevels, inkShare, accentShare, warnings };
}

// ---------------------------------------------------------------------------
// contact: a zoomed review sheet of a strip or direction sheet. One row per direction (or
// one row of frames), each cell on a flat background, optionally desaturated for the value
// test. --rows and --frames keep only some directions and frame columns, so a 2000px sheet
// can be reviewed at a readable zoom. --with <b.png> stacks the same rows and frames of a
// second sheet under the first (a 2px line between them, cells aligned) to compare before
// and after, or one character with another. Written outside assets/, so official outputs
// are never touched.
// ---------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Widest contact sheet the automatic zoom produces: wider sheets fall back to a smaller zoom (an explicit --zoom still wins). */
const CONTACT_AUTO_MAX_WIDTH = 4000;

/** `--frames` of contact: "0-3", "0,2,5" or "0-2,5" as frame indexes in the order given, without repeats. */
function parseFrameList(raw: string): number[] {
  const out: number[] = [];
  for (const part of raw.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) fail(`--frames must look like 0-3 or 0,2,5, got "${raw}".`);
    const from = Number(m[1]);
    const to = m[2] !== undefined ? Number(m[2]) : from;
    if (to < from) fail(`--frames range "${part.trim()}" runs backwards: write ${to}-${from}.`);
    if (to > 9999) fail(`--frames "${part.trim()}" is not a frame index of any sheet.`);
    for (let i = from; i <= to; i++) if (!out.includes(i)) out.push(i);
  }
  return out;
}

/** Runs of consecutive numbers written compactly: [0,1,2,3] -> "0-3", [0,2,5] -> "0_2_5", [0,1,2,5] -> "0-2_5". */
function numberRuns(list: number[]): string {
  const runs: string[] = [];
  for (let i = 0; i < list.length;) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    runs.push(j > i ? `${list[i]}-${list[j]}` : String(list[i]));
    i = j + 1;
  }
  return runs.join('_');
}

type ContactCell = { name: string; x: number; y: number; width: number; height: number; direction?: string; frame?: number };

/** One PNG of a contact run with its atlas cells, one array per row of the image. */
interface ContactSheet {
  /** The path as given on the command line. */
  target: string;
  file: string;
  image: Decoded;
  rows: ContactCell[][];
  directionNames: string[];
  /** Other names for rows: a UI sheet's states ('hover'), compass names on a 16-facing sheet ('W' for D4). */
  rowAliases: Record<string, string>;
}

/** The cells of one sheet after --rows and --frames, and the size they are laid out in. */
interface ContactBand {
  sheet: ContactSheet;
  rows: ContactCell[][];
  cellW: number;
  cellH: number;
  cols: number;
  /** Directions named with --rows (absent when every row is kept). */
  pickedRows?: string[];
  pickedFrames?: number[];
  /** The direction of each row, when every row has one: the order the sheet of --with follows. */
  directions?: string[];
}

/** Gap between cells and around the sheet, and the line between the two bands of --with, in px. */
const CONTACT_GAP = 6;
const CONTACT_SEPARATOR = 2;
const CONTACT_BACKGROUND = [24, 22, 26];
const CONTACT_SEPARATOR_COLOR = [110, 106, 116];

function readContactSheet(target: string): ContactSheet {
  const file = resolve(ROOT, target);
  if (!existsSync(file)) fail(`file not found: ${target}`);
  const image = decodePng(readFileSync(file));
  let rows: ContactCell[][] = [[{ name: 'image', x: 0, y: 0, width: image.width, height: image.height }]];
  let directionNames: string[] = [];
  const rowAliases: Record<string, string> = {};
  const atlasFile = file.replace(/\.png$/i, '.json');
  if (existsSync(atlasFile)) {
    const atlas = JSON.parse(readFileSync(atlasFile, 'utf8'));
    if (Array.isArray(atlas.meta?.directions)) directionNames = atlas.meta.directions.map(String);
    const states = atlas.meta?.data?.states;
    if (Array.isArray(states)) states.forEach((state: unknown, i: number) => directionNames[i] && (rowAliases[String(state).toLowerCase()] = directionNames[i]));
    if (directionNames.length === 16) ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'].forEach((name, i) => (rowAliases[name.toLowerCase()] = directionNames[i * 2]));
    const frames = Object.entries((atlas.frames ?? {}) as Record<string, ContactCell>).map(([name, f]) => ({ ...f, name }));
    if (frames.length) {
      const byRow = new Map<number, ContactCell[]>();
      for (const f of frames) byRow.set(f.y, [...(byRow.get(f.y) ?? []), f]);
      rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r.sort((a, b) => a.x - b.x));
    }
  }
  return { target, file, image, rows, directionNames, rowAliases };
}

/** Direction of a cell: the atlas `direction` field, or the `<DIR>` of a frame named `<DIR>_<n>`. */
function contactDirection(sheet: ContactSheet, cell: ContactCell): string | undefined {
  if (cell.direction) return cell.direction;
  const prefix = cell.name.replace(/_\d+$/, '');
  return sheet.directionNames.includes(prefix) ? prefix : undefined;
}

/** Frame index of a cell: the atlas `frame` field, the `<n>` of its name, or its column. */
function contactFrame(cell: ContactCell, column: number): number {
  const named = /_(\d+)$/.exec(cell.name);
  return cell.frame ?? (named ? Number(named[1]) : column);
}

/**
 * Applies --rows and --frames to one sheet. `label` names the sheet in messages. `follow` is for the
 * second sheet of --with when --rows is absent: it shows the directions of the first sheet, in its order.
 */
function pickContactCells(sheet: ContactSheet, flags: Record<string, string | true>, label: string, follow?: string[]): ContactBand {
  let rows = sheet.rows;
  const byDirection = new Map<string, ContactCell[]>();
  for (const row of rows) {
    const direction = contactDirection(sheet, row[0]);
    if (direction) byDirection.set(direction, row);
  }

  // --rows keeps only the named directions, in the order given.
  let pickedRows: string[] | undefined;
  const named = flags['rows'] !== undefined;
  let wanted = follow && byDirection.size > 0 ? follow : undefined;
  if (named) {
    wanted = String(flags['rows']).split(',').map(n => n.trim()).filter(Boolean);
    if (wanted.length === 0) fail('--rows needs direction names, for example --rows W,SW.');
    if (byDirection.size === 0) fail(`--rows needs a direction sheet (an atlas JSON with directions next to the PNG); ${label} has none.`);
  }
  if (wanted) {
    const keys: string[] = [];
    const picked: ContactCell[][] = [];
    for (const name of wanted) {
      const alias = sheet.rowAliases[name.toLowerCase()];
      const key = [...byDirection.keys()].find(k => k.toLowerCase() === name.toLowerCase()) ?? (alias && byDirection.has(alias) ? alias : undefined);
      if (!key) {
        const known = `Directions: ${[...byDirection.keys()].join(', ')}${Object.keys(sheet.rowAliases).length ? ` (also: ${Object.keys(sheet.rowAliases).join(', ')})` : ''}`;
        if (named) fail(`--rows: ${label} has no direction "${name}".`, known);
        fail(`--with: ${label} has no direction "${name}", which the first sheet has.`, `Pass --rows with directions both sheets have. ${known}`);
      }
      if (keys.includes(key)) continue;
      keys.push(key);
      picked.push(byDirection.get(key)!);
    }
    rows = picked;
    if (named) pickedRows = keys;
  }
  const directions = rows.map(row => contactDirection(sheet, row[0]));
  const rowDirections = directions.every((d): d is string => d !== undefined) ? (directions as string[]) : undefined;

  // --frames keeps only these frame columns, in the order given.
  let pickedFrames: number[] | undefined;
  if (flags['frames'] !== undefined) {
    pickedFrames = parseFrameList(String(flags['frames']));
    const present = [...new Set(rows.flatMap(row => row.map(contactFrame)))].sort((a, b) => a - b);
    const missing = pickedFrames.filter(f => !present.includes(f));
    if (missing.length) fail(`--frames: ${label} has no frame ${missing.join(', ')}.`, `Frames: ${numberRuns(present).replace(/_/g, ', ')}`);
    const wantedFrames = pickedFrames;
    rows = rows.map(row => wantedFrames.map(f => row.find((c, i) => contactFrame(c, i) === f)).filter((c): c is ContactCell => c !== undefined));
  }

  // Sheets with one cell per row (still direction sheets) wrap into a grid of up to 4 columns.
  if (rows.length > 1 && rows.every(r => r.length === 1)) {
    const flat = rows.flat();
    const per = Math.min(4, flat.length);
    rows = Array.from({ length: Math.ceil(flat.length / per) }, (_, i) => flat.slice(i * per, i * per + per));
  }
  return {
    sheet,
    rows,
    cellW: Math.max(...rows.flat().map(c => c.width)),
    cellH: Math.max(...rows.flat().map(c => c.height)),
    cols: Math.max(...rows.map(r => r.length)),
    pickedRows,
    pickedFrames,
    directions: rowDirections,
  };
}

/** Paints the cells of one band, zoomed on the flat background, starting `top` px down the output. */
function paintContactBand(out: Buffer, outW: number, top: number, band: ContactBand, zoom: number, bg: number[], gray: boolean): void {
  const { width, height, channels, pixels } = band.sheet.image;
  const { cellW, cellH } = band;
  band.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const ox = CONTACT_GAP + c * (cellW * zoom + CONTACT_GAP);
      const oy = top + CONTACT_GAP + r * (cellH * zoom + CONTACT_GAP);
      for (let y = 0; y < cellH * zoom; y++) {
        for (let x = 0; x < cellW * zoom; x++) {
          const sx = cell.x + Math.floor(x / zoom);
          const sy = cell.y + Math.floor(y / zoom);
          let rgb = bg;
          if (sx < cell.x + cell.width && sy < cell.y + cell.height && sx < width && sy < height) {
            const i = (sy * width + sx) * channels;
            const a = (channels === 4 ? pixels[i + 3] : 255) / 255;
            rgb = [0, 1, 2].map(k => Math.round(pixels[i + k] * a + bg[k] * (1 - a)));
          }
          if (gray) {
            const l = Math.round(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]);
            rgb = [l, l, l];
          }
          const o = ((oy + y) * outW + ox + x) * 4;
          out[o] = rgb[0];
          out[o + 1] = rgb[1];
          out[o + 2] = rgb[2];
          out[o + 3] = 255;
        }
      }
    });
  });
}

/** What the second sheet of --with is called in the output name: its file name, with its folder when that differs from the first sheet's. */
function contactPartnerName(first: string, second: string): string {
  const base = basename(second).replace(/\.png$/i, '');
  const name = dirname(first) === dirname(second) ? base : `${basename(dirname(second))}_${base}`;
  return name.replace(/[^\w-]+/g, '_');
}

function contact(positionals: string[], flags: Record<string, string | true>): void {
  const target = positionals[0];
  if (!target) fail('a PNG file is required.');
  const withTarget = flags['with'] === undefined ? undefined : String(flags['with']);
  if (withTarget === '' || withTarget === 'true') fail('--with needs a second PNG file, for example --with <b.png>.');
  const first = readContactSheet(target);
  const second = withTarget !== undefined ? readContactSheet(withTarget) : undefined;
  const a = pickContactCells(first, flags, second ? `"${target}"` : 'this sheet');
  const b = second ? pickContactCells(second, flags, `"${withTarget}"`, a.directions) : undefined;
  const bands = b ? [a, b] : [a];
  if (b && (a.cellW !== b.cellW || a.cellH !== b.cellH) && flags['zoom'] === undefined) {
    fail(
      `--with: the cells differ in size (${a.cellW}x${a.cellH} px in "${target}", ${b.cellW}x${b.cellH} px in "${withTarget}"), so their columns cannot line up.`,
      'Pass --zoom N to stack them anyway: each band then keeps its own cell size, left-aligned.',
    );
  }

  const { cellW } = a;
  const gap = CONTACT_GAP;
  const cols = Math.max(...bands.map(band => band.cols));
  let zoom: number;
  if (flags['zoom'] !== undefined) {
    zoom = Number(flags['zoom']);
    if (!Number.isInteger(zoom) || zoom < 1) fail('--zoom must be a whole number, 1 or more.');
  } else {
    // At least 2x so a cell is readable (small cells grow toward ~320px), stepping down to 1x
    // when the sheet would get wider than CONTACT_AUTO_MAX_WIDTH.
    zoom = Math.max(2, Math.min(6, Math.round(320 / cellW)));
    while (zoom > 1 && cols * cellW * zoom + (cols + 1) * gap > CONTACT_AUTO_MAX_WIDTH) zoom--;
  }
  const bgRaw = typeof flags['bg'] === 'string' ? flags['bg'] : '6e6a64';
  const bgMatch = /^#?([0-9a-f]{6})$/i.exec(bgRaw);
  if (!bgMatch) fail('--bg must be six hex digits like 6e6a64 (an unquoted # starts a shell comment: quote "#6e6a64" or leave the # out).');
  const bg = [0, 2, 4].map(i => parseInt(bgMatch![1].slice(i, i + 2), 16));
  const gray = Boolean(flags['gray']);
  // Each band is a sheet of its own (cells, gaps around them); the second sits under the first behind a thin line.
  const bandHeights = bands.map(band => band.rows.length * band.cellH * zoom + (band.rows.length + 1) * gap);
  const outW = Math.max(...bands.map(band => band.cols * band.cellW * zoom + (band.cols + 1) * gap));
  const outH = bandHeights.reduce((sum, h) => sum + h, 0) + (bands.length - 1) * CONTACT_SEPARATOR;
  const out = Buffer.alloc(outW * outH * 4);
  for (let i = 0; i < outW * outH; i++) {
    out[i * 4] = CONTACT_BACKGROUND[0];
    out[i * 4 + 1] = CONTACT_BACKGROUND[1];
    out[i * 4 + 2] = CONTACT_BACKGROUND[2];
    out[i * 4 + 3] = 255;
  }
  let top = 0;
  bands.forEach((band, index) => {
    if (index > 0) {
      for (let y = 0; y < CONTACT_SEPARATOR; y++) {
        for (let x = 0; x < outW; x++) {
          const o = ((top + y) * outW + x) * 4;
          out[o] = CONTACT_SEPARATOR_COLOR[0];
          out[o + 1] = CONTACT_SEPARATOR_COLOR[1];
          out[o + 2] = CONTACT_SEPARATOR_COLOR[2];
        }
      }
      top += CONTACT_SEPARATOR;
    }
    paintContactBand(out, outW, top, band, zoom, bg, gray);
    top += bandHeights[index];
  });

  let outPath: string;
  if (typeof flags['out'] === 'string') {
    outPath = resolve(ROOT, flags['out']);
  } else {
    const rel = relative(ROOT, first.file).split(sep).join('/');
    // A project's export is reviewed in <project>/review/contact/, at the same path it has under assets/.
    const m = /^((?:projects|examples)\/[^/]+)\/assets\/(.+)\.png$/i.exec(rel);
    // The subset is part of the name, so reviewing W,SW and then N,NE does not overwrite the first sheet.
    const subset = [a.pickedRows?.join('-'), a.pickedFrames ? `f${numberRuns(a.pickedFrames)}` : undefined]
      .filter((part): part is string => Boolean(part))
      .map(part => `-${part.replace(/[^\w-]+/g, '_')}`)
      .join('');
    const versus = second ? `-vs-${contactPartnerName(first.file, second.file)}` : '';
    const suffix = `${versus}-contact${subset}${gray ? '-gray' : ''}.png`;
    outPath = m
      ? resolve(ROOT, m[1], LAYOUT.review, REVIEW.contact, `${m[2]}${suffix}`)
      : first.file.replace(/\.png$/i, suffix);
  }
  if (/(^|[\\/])assets[\\/]/.test(relative(ROOT, outPath))) {
    fail('contact sheets are review files and must not be written into assets/ (they go to <project>/review/contact/).');
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, encodePng(outW, outH, out));

  const rowOrder = (band: ContactBand) => band.rows.map(row => (row.length > 1 && row.every(c => /_0$/.test(c.name) || !/_\d+$/.test(c.name)) ? row.map(c => c.name.replace(/_\d+$/, '')).join(' ') : row[0].name.replace(/_\d+$/, ''))).join(' | ');
  const rowNames = rowOrder(a);
  const report = {
    file: relative(ROOT, outPath).split(sep).join('/'),
    width: outW,
    height: outH,
    rows: bands.reduce((sum, band) => sum + band.rows.length, 0),
    columns: cols,
    zoom,
    gray,
    rowOrder: rowNames,
    ...(a.pickedRows || a.pickedFrames ? { subset: { ...(a.pickedRows ? { rows: a.pickedRows } : {}), ...(a.pickedFrames ? { frames: a.pickedFrames } : {}) } } : {}),
    ...(b
      ? {
          with: withTarget,
          bands: bands.map(band => ({
            file: band.sheet.target.replace(/\\/g, '/'),
            rows: band.rows.length,
            columns: band.cols,
            cell: { width: band.cellW, height: band.cellH },
            rowOrder: rowOrder(band),
          })),
        }
      : {}),
  };
  if (flags['json']) {
    printJson(report as unknown as Json);
    return;
  }
  console.log(pc.green(`Wrote ${report.file}`));
  console.log(`  ${outW}x${outH} px, ${report.rows} row(s) x ${cols} column(s), zoom ${zoom}x${gray ? ', grayscale' : ''}; rows: ${rowNames}`);
  if (b) {
    console.log(`  top band: ${target}; bottom band, under a ${CONTACT_SEPARATOR}px line: ${withTarget} (rows: ${rowOrder(b)})`);
  }
  console.log('  Open it with the image viewer and review every row.');
}

// ---------------------------------------------------------------------------
// new-outfit-character: a saved outfit (from the viewer's customizer) becomes a character with
// the skeleton, clips and cell of a base character listed in the project's gear catalog.
// ---------------------------------------------------------------------------

/** The catalog module of a kit (`src/<kit>/catalog.ts`), or a clear error when the project has none. */
function kitCatalog(project: ProjectRef, kit: string, what: string): string {
  const file = resolve(project.dir, LAYOUT.src, kit, 'catalog.ts');
  if (!existsSync(file)) fail(`${project.rel}/src/${kit}/catalog.ts is missing: the project has no ${what}.`);
  return file;
}

async function newOutfitCharacter(positionals: string[], flags: Record<string, string | true>): Promise<void> {
  const project = requireProject(positionals[0]);
  const name = positionals[1];
  if (!name) fail('a character name is required: npm run new-outfit-character -- <project> <name> --from <character> --outfit <file.json>');
  if (!KEBAB_RE.test(name)) fail(`the character name "${name}" must be lowercase letters, digits and dashes.`);
  const from = typeof flags['from'] === 'string' ? flags['from'] : fail('--from <character id> is required (an id from CHARACTERS in src/gear/catalog.ts).');
  const outfitPath = typeof flags['outfit'] === 'string' ? resolve(String(flags['outfit'])) : fail('--outfit <file.json> is required.');
  const catalogFile = kitCatalog(project, 'gear', 'gear catalog (see docs/guides/rig/05-gear-and-outfits.md)');
  if (!existsSync(outfitPath)) fail(`outfit file not found: ${flags['outfit']}`);
  let outfitData: unknown;
  try {
    outfitData = JSON.parse(readFileSync(outfitPath, 'utf8'));
  } catch (err) {
    fail(`the outfit file is not valid JSON: ${(err as Error).message}`);
  }
  const mod = (await import(pathToFileURL(catalogFile).href)) as { CATALOG?: import('../core/rig/index.js').GearCatalog; CHARACTERS?: import('../core/rig/index.js').OutfitCharacterInfo[] };
  if (!mod.CATALOG || !mod.CHARACTERS) fail('src/gear/catalog.ts must export CATALOG and CHARACTERS.');
  const base = mod.CHARACTERS.find(c => c.id === from);
  if (!base) fail(`no character "${from}" in CHARACTERS (known: ${mod.CHARACTERS.map(c => c.id).join(', ')}).`);
  const { validateOutfit, checkWield } = await import('../core/rig/index.js');
  const problems = validateOutfit(outfitData as import('../core/rig/index.js').OutfitData, mod.CATALOG);
  if (problems.length) fail(`the outfit does not fit the catalog:\n- ${problems.join('\n- ')}`);
  // Clips made for another weapon than the one the outfit holds are left out (a slash for a blade on a scythe).
  const wield = checkWield(base.clips, outfitData as import('../core/rig/index.js').OutfitData, mod.CATALOG);

  // src/characters/<name>/{outfit,character}.ts, and one sheet per clip in sheets/characters/<name>/.
  const dir = resolve(project.dir, LAYOUT.src, 'characters', name);
  const sheetDir = resolve(project.dir, LAYOUT.sheets, 'characters', name);
  const characterFile = resolve(dir, 'character.ts');
  if (existsSync(characterFile) && !flags['force']) fail(`${project.rel}/src/characters/${name}/ already exists. Pass --force to replace its outfit, character and clip sheets.`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(sheetDir, { recursive: true });
  const written: string[] = [];
  const write = (file: string, text: string) => {
    writeFileSync(file, text, 'utf8');
    written.push(repoPath(file));
  };
  write(resolve(dir, 'outfit.ts'), `/** ${name}: the outfit saved from the viewer's customizer. Edit it here or re-save it there. */

import type { OutfitData } from '@core/rig';

export const OUTFIT: OutfitData = ${JSON.stringify(outfitData, null, 2)};
`);
  write(characterFile, `/**
 * ${name}: ${base.label} wearing a custom outfit (outfit.ts). Skeleton, clips, cell and sockets come
 * from the "${from}" entry of src/gear/catalog.ts; the outfit is drawn with the catalog's parts, the held
 * weapons give their sockets, and only the clips made for what it holds are kept (checkWield).
 * Its sheets are sheets/characters/${name}/<clip>.ts.
 */

import { checkWield, defineCharacter } from '@core/rig';
import { CATALOG, CHARACTERS } from '${importPath(characterFile, catalogFile)}';
import { OUTFIT } from './outfit';

const base = CHARACTERS.find(c => c.id === '${from}');
if (!base) throw new Error('src/gear/catalog.ts has no character "${from}"');
const { id: _id, label: _label, outfit: _outfit, clips, ...shared } = base;
const { usable } = checkWield(clips, OUTFIT, CATALOG);

export const character = defineCharacter({ ...shared, name: '${name}', clips: Object.fromEntries(usable.map(key => [key, clips[key]])), outfit: { data: OUTFIT, catalog: CATALOG } });
`);
  const keys = wield.usable;
  for (const key of keys) {
    const sheet = resolve(sheetDir, `${key}.ts`);
    write(sheet, `/** ${name}: ${key} sheet. */

import { character } from '${importPath(sheet, characterFile)}';

export default character.sheet('${key}');
`);
  }
  if (flags['json']) {
    printJson({ character: name, from, files: written, clips: keys, skipped: wield.unusable, warnings: wield.warnings } as unknown as Json);
    return;
  }
  console.log(pc.green(`Created ${name} from ${from}: ${written.length} files (${keys.length} clips).`));
  for (const u of wield.unusable) console.log(pc.yellow(`  skipped clip "${u.key}": it is made for ${u.needs}`));
  for (const w of wield.warnings.filter(w => !w.startsWith('clip "'))) console.log(pc.yellow(`  ⚠ ${w}`));
  console.log(`Export it with: npm run export -- ${project.name} characters/${name}/`);
}

// ---------------------------------------------------------------------------
// The catalog commands write generated sheets (docs/ARCHITECTURE.md): sheets/<folder>/<id>.ts, each
// starting with its "Generated by" line and importing the kit's catalog from src/<kit>/catalog.ts.
// ---------------------------------------------------------------------------

/** Writes one generated sheet unless it exists (and --force is absent); returns whether it was written. */
function writeGenerated(file: string, command: string, catalog: string, body: string, force: boolean): boolean {
  if (existsSync(file) && !force) return false;
  writeFileSync(file, `${generatedHeader(command, catalog)}\n${body}`, 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// gear-items: one sheet per catalog part (sheets/gear/<part>.ts), so every part is exported on its
// own and shows in the viewer's asset list and the customizer's pickers.
// ---------------------------------------------------------------------------

async function gearItems(positionals: string[], flags: Record<string, string | true>): Promise<void> {
  const project = requireProject(positionals[0]);
  const catalogFile = kitCatalog(project, 'gear', 'gear catalog (see docs/guides/rig/05-gear-and-outfits.md)');
  const mod = (await import(pathToFileURL(catalogFile).href)) as { CATALOG?: import('../core/rig/index.js').GearCatalog; CHARACTERS?: import('../core/rig/index.js').OutfitCharacterInfo[] };
  if (!mod.CATALOG || !mod.CHARACTERS?.length) fail('src/gear/catalog.ts must export CATALOG and a non-empty CHARACTERS.');
  const folder = 'gear';
  const dir = resolve(project.dir, LAYOUT.sheets, folder);
  mkdirSync(dir, { recursive: true });
  // Effects and body parts have nothing to show on their own; skip them.
  const { partKind } = await import('../core/rig/index.js');
  const created: string[] = [];
  const kept: string[] = [];
  for (const part of mod.CATALOG.parts) {
    if (partKind(part) !== 'gear') continue;
    const wearer = mod.CHARACTERS.find(c => c.outfit.pieces.some(p => p.part === part.id)) ?? mod.CHARACTERS[0];
    const file = resolve(dir, `${part.id}.ts`);
    const written = writeGenerated(file, GENERATED_SHEETS.gear.command, 'src/gear/catalog.ts', `/** ${part.label} (${part.group}): the part alone, worn by ${wearer.label}, in every facing. */

import { defineGearAsset } from '@core/rig';
import { CATALOG, CHARACTERS } from '${importPath(file, catalogFile)}';

export default defineGearAsset({ catalog: CATALOG, character: CHARACTERS.find(c => c.id === '${wearer.id}')!, part: '${part.id}' });
`, Boolean(flags['force']));
    (written ? created : kept).push(part.id);
  }
  if (flags['json']) {
    printJson({ created, kept } as unknown as Json);
    return;
  }
  console.log(pc.green(`gear-items: ${created.length} created, ${kept.length} already there in ${project.rel}/sheets/${folder}/ (--force rewrites them).`));
  if (created.length) console.log(`Export them with: npm run export -- ${project.name} ${folder}/`);
}

// ---------------------------------------------------------------------------
// scenery-items: one tile set per scenery catalog piece (sheets/scenery/<piece>.ts), plus one sheet
// per other state and per clip (sheets/scenery/<piece>--<state|clip>.ts).
// ---------------------------------------------------------------------------

async function sceneryItems(positionals: string[], flags: Record<string, string | true>): Promise<void> {
  const project = requireProject(positionals[0]);
  const catalogFile = kitCatalog(project, 'scenery', 'scenery catalog (see docs/guides/volume/04-scenery-kits.md)');
  const mod = (await import(pathToFileURL(catalogFile).href)) as { SCENERY?: import('../core/volume/index.js').SceneryCatalog };
  if (!mod.SCENERY) fail('src/scenery/catalog.ts must export SCENERY.');
  const { validateCatalog } = await import('../core/volume/index.js');
  const catalogProblems = validateCatalog(mod.SCENERY);
  if (catalogProblems.length) fail(`src/scenery/catalog.ts has problems:\n- ${catalogProblems.join('\n- ')}`);
  const folder = 'scenery';
  const dir = resolve(project.dir, LAYOUT.sheets, folder);
  mkdirSync(dir, { recursive: true });
  const created: string[] = [];
  const kept: string[] = [];
  const elsewhere: string[] = [];
  for (const piece of mod.SCENERY.pieces) {
    // A piece whose default sheet lives elsewhere (`asset: 'props/tombstone'`, a path under sheets/: its states and
    // clips still come here) or that exports nothing (`asset: false`).
    if (piece.asset !== undefined) elsewhere.push(piece.asset ? `${piece.id} (sheets/${piece.asset}.ts)` : piece.id);
    if (piece.asset === false) continue;
    // One sheet for the default state, one per other state, one per clip (`<id>--<state|clip>`).
    const sheets: { name: string; extra: string; what: string }[] = [
      ...(piece.asset === undefined ? [{ name: piece.id, extra: '', what: 'every mask, variant and facing a game lays out' }] : []),
      ...(piece.states ?? []).slice(1).map(state => ({ name: `${piece.id}--${state}`, extra: `, state: '${state}'`, what: `the "${state}" state, every variant and facing` })),
      ...Object.keys(piece.clips ?? {}).map(clip => ({ name: `${piece.id}--${clip}`, extra: `, clip: '${clip}'`, what: `the "${clip}" animation, its frames across and the facings down` })),
    ];
    for (const sheet of sheets) {
      const target = resolve(dir, `${sheet.name}.ts`);
      const written = writeGenerated(target, GENERATED_SHEETS.scenery.command, 'src/scenery/catalog.ts', `/** ${piece.label} (${piece.group}): ${sheet.what}. */

import { defineTileSet } from '@core/volume';
import { SCENERY } from '${importPath(target, catalogFile)}';

export default defineTileSet({ catalog: SCENERY, piece: '${piece.id}'${sheet.extra} });
`, Boolean(flags['force']));
      (written ? created : kept).push(sheet.name);
    }
  }
  if (flags['json']) {
    printJson({ created, kept, elsewhere } as unknown as Json);
    return;
  }
  console.log(pc.green(`scenery-items: ${created.length} created, ${kept.length} already there in ${project.rel}/sheets/${folder}/ (--force rewrites them).`));
  if (elsewhere.length) console.log(pc.gray(`Skipped, exported elsewhere (asset in the catalog): ${elsewhere.join(', ')}`));
  if (created.length) console.log(`Export them with: npm run export -- ${project.name} ${folder}/`);
}

// ---------------------------------------------------------------------------
// vfx-items / item-icons: one sheet per effect (sheets/vfx/<id>.ts) or item (sheets/icons/<id>.ts).
// ---------------------------------------------------------------------------

async function catalogItems(kind: 'vfx' | 'items', positionals: string[], flags: Record<string, string | true>): Promise<void> {
  const project = requireProject(positionals[0]);
  const spec = kind === 'vfx'
    ? { kit: 'vfx', exportName: 'VFX', folder: 'vfx' as const, guide: 'effects' }
    : { kit: 'items', exportName: 'ITEMS', folder: 'icons' as const, guide: 'items' };
  const command = GENERATED_SHEETS[spec.folder].command;
  const catalogFile = kitCatalog(project, spec.kit, `${spec.guide} catalog (see docs/guides/volume/06-effects-items-and-hud.md)`);
  const mod = (await import(pathToFileURL(catalogFile).href)) as Record<string, unknown>;
  const catalog = mod[spec.exportName] as { effects?: { id: string; label: string; kind: string }[]; items?: { id: string; label: string; kind: string }[] } | undefined;
  if (!catalog) fail(`src/${spec.kit}/catalog.ts must export ${spec.exportName}.`);
  const problems = kind === 'vfx'
    ? (await import('../core/volume/index.js')).validateEffects(catalog as never)
    : (await import('../core/rig/index.js')).validateItems(catalog as never);
  if (problems.length) fail(`src/${spec.kit}/catalog.ts has problems:\n- ${problems.join('\n- ')}`);
  const dir = resolve(project.dir, LAYOUT.sheets, spec.folder);
  mkdirSync(dir, { recursive: true });
  const created: string[] = [];
  const kept: string[] = [];
  for (const entry of (kind === 'vfx' ? catalog.effects : catalog.items) ?? []) {
    const file = resolve(dir, `${entry.id}.ts`);
    const from = importPath(file, catalogFile);
    const written = writeGenerated(file, command, `src/${spec.kit}/catalog.ts`, kind === 'vfx'
      ? `/** ${entry.label} (${entry.kind}): the effect's frames across and its facings down. */

import { defineEffect } from '@core/volume';
import { VFX } from '${from}';

export default defineEffect({ catalog: VFX, effect: '${entry.id}' });
`
      : `/** ${entry.label} (${entry.kind}): its inventory icon. */

import { defineItemIcon } from '@core/rig';
import { ITEMS } from '${from}';

export default defineItemIcon({ items: ITEMS, item: '${entry.id}' });
`, Boolean(flags['force']));
    (written ? created : kept).push(entry.id);
  }
  if (flags['json']) {
    printJson({ created, kept } as unknown as Json);
    return;
  }
  console.log(pc.green(`${command}: ${created.length} created, ${kept.length} already there in ${project.rel}/sheets/${spec.folder}/ (--force rewrites them).`));
  if (created.length) console.log(`Export them with: npm run export -- ${project.name} ${spec.folder}/`);
}

// ---------------------------------------------------------------------------
// new-scene: a scene saved as JSON (SceneData, e.g. from the viewer's scene painter) becomes
// src/scenes/<name>.ts (the data) and sheets/scenes/<name>.ts (its reference image).
// ---------------------------------------------------------------------------

/** A scene as a TypeScript literal a person can read: one line per row of cells and per placement. */
function formatScene(data: Record<string, unknown>): string {
  const lines: string[] = ['{'];
  const rest = { ...data };
  for (const key of ['cols', 'rows']) {
    if (key in rest) lines.push(`  ${key}: ${JSON.stringify(rest[key])},`);
    delete rest[key];
  }
  for (const key of ['floor', 'walls', 'props']) {
    const value = rest[key];
    delete rest[key];
    if (!Array.isArray(value)) continue;
    lines.push(`  ${key}: [`, ...value.map(v => `    ${JSON.stringify(v)},`), '  ],');
  }
  for (const [key, value] of Object.entries(rest)) lines.push(`  ${key}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')},`);
  lines.push('}');
  return lines.join('\n');
}

async function newScene(positionals: string[], flags: Record<string, string | true>): Promise<void> {
  const project = requireProject(positionals[0]);
  const name = positionals[1];
  if (!name) fail('a scene name is required: npm run new-scene -- <project> <name> --scene <file.json>');
  if (!KEBAB_RE.test(name)) fail(`the scene name "${name}" must be lowercase letters, digits and dashes.`);
  const scenePath = typeof flags['scene'] === 'string' ? resolve(String(flags['scene'])) : fail('--scene <file.json> is required.');
  if (!existsSync(scenePath)) fail(`scene file not found: ${flags['scene']}`);
  const catalogFile = kitCatalog(project, 'scenery', 'scenery catalog');
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(scenePath, 'utf8'));
  } catch (err) {
    fail(`the scene file is not valid JSON: ${(err as Error).message}`);
  }
  const mod = (await import(pathToFileURL(catalogFile).href)) as { SCENERY?: import('../core/volume/index.js').SceneryCatalog };
  if (!mod.SCENERY) fail('src/scenery/catalog.ts must export SCENERY.');
  const { validateScene, validateCatalog } = await import('../core/volume/index.js');
  const catalogProblems = validateCatalog(mod.SCENERY);
  if (catalogProblems.length) fail(`src/scenery/catalog.ts has problems:\n- ${catalogProblems.join('\n- ')}`);
  const problems = validateScene(data as import('../core/volume/index.js').SceneData, mod.SCENERY);
  if (problems.length) fail(`the scene does not fit the catalog:\n- ${problems.join('\n- ')}`);
  const sceneFile = resolve(project.dir, LAYOUT.src, 'scenes', `${name}.ts`);
  const sheetFile = resolve(project.dir, LAYOUT.sheets, 'scenes', `${name}.ts`);
  if (existsSync(sceneFile) && !flags['force']) fail(`${repoPath(sceneFile)} already exists. Pass --force to replace it.`);
  mkdirSync(dirname(sceneFile), { recursive: true });
  mkdirSync(dirname(sheetFile), { recursive: true });
  writeFileSync(sceneFile, `/** ${name}: a scene saved from the viewer's scene painter (SceneData). Edit it here or re-save it there; its sheet is sheets/scenes/${name}.ts. */

import type { SceneData } from '@core/volume';

export const SCENE: SceneData = ${formatScene(data as Record<string, unknown>)};
`, 'utf8');
  writeFileSync(sheetFile, `/** ${name}: the whole scene as one reference image. */

import { defineSceneAsset } from '@core/volume';
import { SCENERY } from '${importPath(sheetFile, catalogFile)}';
import { SCENE } from '${importPath(sheetFile, sceneFile)}';

export default defineSceneAsset({ catalog: SCENERY, scene: SCENE });
`, 'utf8');
  const files = [repoPath(sceneFile), repoPath(sheetFile)];
  if (flags['json']) {
    printJson({ scene: name, files } as unknown as Json);
    return;
  }
  console.log(pc.green(`Created scene ${name}: ${files.join(', ')}`));
  console.log(`Export it with: npm run export -- ${project.name} scenes/${name}`);
}

// ---------------------------------------------------------------------------
// scenery-test: one piece through every join it has (seamTestScene), rendered for review into
// <project>/review/scenery-tests/.
// ---------------------------------------------------------------------------

async function sceneryTest(positionals: string[], flags: Record<string, string | true>): Promise<void> {
  const project = requireProject(positionals[0]);
  const pieceId = positionals[1];
  if (!pieceId) fail('a piece id is required: npm run scenery-test -- <project> <piece>');
  const catalogFile = kitCatalog(project, 'scenery', 'scenery catalog');
  const mod = (await import(pathToFileURL(catalogFile).href)) as { SCENERY?: import('../core/volume/index.js').SceneryCatalog };
  if (!mod.SCENERY) fail('src/scenery/catalog.ts must export SCENERY.');
  if (!mod.SCENERY.pieces.some(p => p.id === pieceId)) fail(`unknown piece "${pieceId}". The catalog has: ${mod.SCENERY.pieces.map(p => p.id).join(', ')}`);
  const { validateCatalog } = await import('../core/volume/index.js');
  const catalogProblems = validateCatalog(mod.SCENERY);
  if (catalogProblems.length) fail(`src/scenery/catalog.ts has problems:\n- ${catalogProblems.join('\n- ')}`);
  const on = typeof flags['on'] === 'string' ? (flags['on'] === 'none' ? null : String(flags['on'])) : undefined;
  if (on && mod.SCENERY.pieces.find(p => p.id === on)?.group !== 'floor') fail(`--on takes a floor of the catalog (or none): ${mod.SCENERY.pieces.filter(p => p.group === 'floor').map(p => p.id).join(', ')}`);
  const testOptions = { ...(on !== undefined ? { on } : {}), ...(flags['field'] ? { field: true } : {}) };
  const testName = `${pieceId}${flags['field'] ? '-field' : ''}${on !== undefined ? `-on-${on ?? 'none'}` : ''}`;
  // A throwaway sheet (sheets/scenery-tests/), exported as a mockup (review/mockups/, never assets/),
  // then moved to review/scenery-tests/ and the sheet removed.
  const folder = REVIEW.sceneryTests;
  const dir = resolve(project.dir, LAYOUT.sheets, folder);
  const created = !existsSync(dir);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${testName}.ts`);
  writeFileSync(file, `/** Seam test of ${pieceId}: written and removed by npm run scenery-test. */

import { defineSceneAsset, seamTestScene } from '@core/volume';
import { SCENERY } from '${importPath(file, catalogFile)}';

export default defineSceneAsset({ catalog: SCENERY, scene: seamTestScene(SCENERY, '${pieceId}', ${JSON.stringify(testOptions)}), figures: true });
`, 'utf8');
  const mockupDir = resolve(project.dir, LAYOUT.review, REVIEW.mockups, folder);
  const rendered = resolve(mockupDir, `${testName}.png`);
  const png = resolve(project.dir, LAYOUT.review, folder, `${testName}.png`);
  rmSync(rendered, { force: true });
  try {
    // A review render, never an asset: it skips the export's type check (--force), which the official export of the piece runs.
    execFileSync(process.execPath, [resolve(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), resolve(ROOT, 'tools', 'export.ts'), project.rel, `${folder}/${testName}`, '--mockup', '--force'], { cwd: ROOT, stdio: flags['json'] ? 'pipe' : ['ignore', 'ignore', 'inherit'] });
  } finally {
    if (!flags['keep']) {
      rmSync(file, { force: true });
      if (created && readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
    }
  }
  if (!existsSync(rendered)) fail(`the seam test did not render (expected ${repoPath(rendered)}).`);
  mkdirSync(dirname(png), { recursive: true });
  cpSync(rendered, png);
  rmSync(rendered, { force: true });
  rmSync(rendered.replace(/\.png$/, '.json'), { force: true });
  // The mockup folders the export made for it go too when nothing else is in them.
  for (const empty of [mockupDir, dirname(mockupDir)]) {
    if (existsSync(empty) && readdirSync(empty).length === 0) rmSync(empty, { recursive: true, force: true });
  }
  let out = png;
  if (typeof flags['out'] === 'string') {
    out = resolve(String(flags['out']));
    mkdirSync(dirname(out), { recursive: true });
    cpSync(png, out);
  }
  if (flags['json']) {
    printJson({ piece: pieceId, file: out } as unknown as Json);
    return;
  }
  console.log(pc.green(`Seam test of ${pieceId}: ${relative(ROOT, out)}`));
  console.log(`Look at it at 1×, then zoom the joins: npm run contact -- ${relative(ROOT, out)} --zoom 3`);
}

// ---------------------------------------------------------------------------
// example: a sample of examples/, copied into projects/ so it is a project of the user's. The viewer shows projects/
// only, so the sample appears there, and what the viewer saves goes into the copy, never into the shipped sample.
// ---------------------------------------------------------------------------

/** A copy of the sample: everything but review/ (scratch) and OS metadata, every file with its times. */
function copySample(from: string, to: string): void {
  const osMetadata = /(^|[\\/])(\.DS_Store|Thumbs\.db|desktop\.ini)$/;
  const review = resolve(from, LAYOUT.review);
  cpSync(from, to, {
    recursive: true,
    errorOnExist: true,
    force: false,
    // The times say which exports are out of date (tools/freshness.ts): kept, `export --changed` finds the same ones.
    preserveTimestamps: true,
    filter: (src) => resolve(src) !== review && !resolve(src).startsWith(review + sep) && !osMetadata.test(src),
  });
}

/** What is at `path`, without following a link: nothing, a folder, a link (and where it leads), or something else. */
function entryAt(path: string): { kind: 'none' | 'dir' | 'other' } | { kind: 'link'; to: string; dangling: boolean; dir: boolean } {
  let info;
  try {
    info = lstatSync(path);
  } catch {
    return { kind: 'none' };
  }
  if (info.isSymbolicLink()) {
    const to = readlinkSync(path);
    try {
      return { kind: 'link', to, dangling: false, dir: statSync(path).isDirectory() };
    } catch {
      return { kind: 'link', to, dangling: true, dir: false };
    }
  }
  return { kind: info.isDirectory() ? 'dir' : 'other' };
}

/** The options of `example`. --changed and --jobs are the export's (`npm run example` used to be an export of the sample). */
const EXAMPLE_FLAGS = ['force', 'no-export', 'changed', 'jobs', 'help'];
const EXIT_ON_SIGNAL = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;

/**
 * Copies examples/<sample> to projects/<sample> and exports the copy. With exports in the sample's assets/, they come
 * along and only what is out of date is exported (--changed); without, every sheet is. A copy already in projects/ is
 * the user's: nothing is copied over it and it is exported with --changed, unless --force, which replaces it: the old
 * one goes to the trash (.diorama-trash/projects/<id>/<sample>, tools/trash.ts, the viewer's "Delete project"), a link
 * there is removed (the link only). One run at a time (tools/lock.ts), and the copy is made in a hidden folder of
 * projects/ and renamed into place, so a copy that fails half way leaves nothing behind and changes nothing.
 */
/**
 * renameSync, retried for a few seconds on Windows, where a folder cannot be renamed while something holds a handle
 * inside it (an antivirus or an indexer reading the files just written), as Vite's own gracefulRename does.
 */
function renameRetrying(from: string, to: string): void {
  if (process.platform !== 'win32') return renameSync(from, to);
  const start = Date.now();
  for (let delay = 10; ; delay = Math.min(delay + 10, 100)) {
    try {
      return renameSync(from, to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(code) || Date.now() - start > 5000 || existsSync(to)) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
    }
  }
}

/** Removes a folder this command made, without letting a failure hide the message that follows. */
function removeQuietly(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    // Left for the next run, which removes what a run cut short left.
  }
}

async function example(positionals: string[], flags: Record<string, string | true>): Promise<void> {
  const unknown = Object.keys(flags).filter(flag => !EXAMPLE_FLAGS.includes(flag));
  if (unknown.length) {
    fail(`${unknown.map(flag => `--${flag}`).join(', ')} ${unknown.length === 1 ? 'is not an option' : 'are not options'} of npm run example.`,
      `Its options: [sample] [--force] [--no-export] [--changed] [--jobs <n>] (npm run example -- --help). To export the copy another way: npm run export -- projects/${positionals[0] ?? DEFAULT_SAMPLE} [subpath...] [options].`);
  }
  if (positionals.length > 1) fail(`npm run example copies one sample, not "${positionals.join(' ')}".`, `To export some sheets of the copy: npm run export -- projects/${DEFAULT_SAMPLE} ${positionals.slice(1).join(' ')}`);
  const name = positionals[0] ?? DEFAULT_SAMPLE;
  if (!PROJECT_NAME_RE.test(name)) {
    fail(`"${name}" is not a sample name: give the name of a folder of examples/, e.g. ${DEFAULT_SAMPLE}.`,
      name.includes('/') ? `npm run example no longer takes sheets: to export some sheets of the copy, npm run export -- projects/${DEFAULT_SAMPLE} ${name}` : undefined);
  }
  const jobs = flags['jobs'];
  if (jobs !== undefined && (jobs === true || !/^[1-9]\d*$/.test(jobs))) fail(`--jobs needs a whole number of sheets to render at once, for example --jobs 4 (got "${jobs}").`);
  const sample = findProject(`examples/${name}`, ROOT);
  if (!sample) {
    const samples = listProjects(ROOT, ['examples']).map(p => p.name);
    fail(`there is no sample "${name}" in examples/.`, samples.length ? `Samples: ${samples.join(', ')}` : undefined);
  }
  const target = resolve(PROJECTS, name);
  const rel = `projects/${name}`;

  // One run at a time: a second one (another terminal, the viewer's "Try the sample") would copy and export beside it.
  const lock = takeLock(resolve(ROOT, EXAMPLE_LOCK), `npm run example${name === DEFAULT_SAMPLE ? '' : ` -- ${name}`}`);
  if (!lock.ok) {
    const { pid, startedAt } = lock.holder;
    fail(`npm run example is already running${pid ? ` (process ${pid}${startedAt ? `, started ${startedAt}` : ''})` : ''}: nothing was copied or exported. Wait for it to finish; it brings the sample in.`,
      `If no such run is going on (its process is gone), remove ${EXAMPLE_LOCK} and run npm run example again.`);
  }
  process.on('exit', lock.release);
  for (const [signal, code] of Object.entries(EXIT_ON_SIGNAL)) process.once(signal, () => process.exit(code));
  // What a run cut short left (one that was killed): the lock is this run's, so no other run is using them. A copy goes;
  // a link it had moved aside goes back to its place, or goes if a fresh copy took that place.
  for (const entry of existsSync(PROJECTS) ? readdirSync(PROJECTS) : []) {
    if (entry.startsWith(`.${name}.copy-`)) removeQuietly(join(PROJECTS, entry));
    if (entry.startsWith(`.${name}.link-`)) {
      if (entryAt(target).kind === 'none') renameSync(join(PROJECTS, entry), target);
      else unlinkSync(join(PROJECTS, entry));
    }
  }

  const force = Boolean(flags['force']);
  const at = entryAt(target);
  if (at.kind === 'other') fail(`${rel} is a file, not a project folder: nothing was copied over it.`, `Move it out of the way, then run npm run example again.`);
  if (at.kind === 'link' && !at.dir && !force) {
    fail(`${rel} is a link to ${at.to}, ${at.dangling ? 'which does not exist' : 'which is not a folder'}: nothing was copied.`,
      `Remove the link (only the link: rm ${rel}), or run npm run example -- --force, which removes it and puts a fresh copy there.`);
  }
  let copied = false;
  let restoreSteps: string[] = [];
  if (at.kind !== 'none' && !force) {
    console.log(pc.yellow(`${rel}/ already exists: it is your project, so nothing was copied over it.`));
    console.log(pc.gray(`  npm run example -- --force replaces it with a fresh copy of ${sample.rel}; the one there now goes to the trash first.`));
  } else {
    // The copy is made beside the target, in a folder no command lists (a dot name), and renamed into place when whole.
    mkdirSync(PROJECTS, { recursive: true });
    const temp = join(PROJECTS, `.${name}.copy-${process.pid}`);
    try {
      copySample(sample.dir, temp);
    } catch (err) {
      removeQuietly(temp);
      fail(`could not copy ${sample.rel} to ${rel}/: ${(err as Error).message}`,
        at.kind === 'none' ? `Nothing was left in projects/. Fix what it says, then run npm run example again.` : `${rel} was left as it was. Fix what it says, then run npm run example -- --force again.`);
    }
    // Only a whole copy takes the old one's place, and the old one comes back if the copy cannot get there.
    let trashId: string | undefined;
    let parked: string | undefined;
    try {
      if (at.kind === 'link') {
        // Moved aside until the copy is in place (renaming a link, or a junction, moves the link only), then removed.
        parked = join(PROJECTS, `.${name}.link-${process.pid}`);
        renameRetrying(target, parked);
      } else if (at.kind === 'dir') {
        // The viewer's own delete (tools/trash.ts): the folder moves whole to .diorama-trash/projects/<id>/<name>.
        ({ trashId } = await deleteProject(ROOT, name));
        const trashed = `.diorama-trash/projects/${trashId}/${name}`;
        console.log(pc.yellow(`Moved your ${rel}/ to ${trashed}/.`));
        // The viewer's restore (and a plain move) refuses while a project of that name is in projects/: the fresh copy is.
        restoreSteps = [
          `  To get it back: the fresh copy is in ${rel}/ now, so move that out of the way first, then move yours back:`,
          `    mv ${rel} ${rel}-fresh   (or delete the fresh copy in the viewer: the project's menu, Delete project)`,
          `    mv ${trashed} ${rel}`,
        ];
      }
      renameRetrying(temp, target);
    } catch (err) {
      removeQuietly(temp);
      let back = true;
      try {
        if (trashId) await restoreProject(ROOT, name, trashId);
        else if (parked && entryAt(parked).kind !== 'none') renameRetrying(parked, target);
      } catch {
        back = false;
      }
      const where = trashId ? `.diorama-trash/projects/${trashId}/${name}` : parked ? relative(ROOT, parked) : '';
      fail(`could not ${at.kind === 'none' ? 'put the copy in' : 'replace'} ${rel}/${at.kind === 'none' ? '' : ' with the fresh copy'}: ${(err as Error).message}`,
        at.kind === 'none' ? `Nothing was left in projects/.` : back ? `${rel} was left as it was.` : `${at.kind === 'link' ? 'The link' : 'Your old copy'} is in ${where}: move it back to ${rel}.`);
    }
    if (parked) {
      unlinkSync(parked);
      console.log(pc.yellow(`Removed the link ${rel} (to ${at.kind === 'link' ? at.to : ''}): the link only, ${at.kind === 'link' && at.dangling ? 'which led nowhere' : 'the folder it leads to is untouched'}.`));
    }
    copied = true;
  }
  const exported = walkFiles(resolve(target, LAYOUT.assets)).some(file => IMAGE_RE.test(file));
  const sheets = listSheets(target).length;
  if (copied) {
    console.log(pc.green(`Copied ${sample.rel} to ${rel}/ (everything but review/${exported ? ', its exports with their times' : ''}): ${sheets} sheet${sheets === 1 ? '' : 's'}.`));
    console.log(`  It is your project now, the one the viewer shows and saves into; ${sample.rel} stays as it ships.`);
  }
  for (const line of restoreSteps) console.log(pc.gray(line));

  // A copy that brought its exports, one that was already here, or --changed: only what is missing or older than its code.
  const changed = Boolean(flags['changed']) || !copied || exported;
  const exportArgs = [rel, ...(changed ? ['--changed'] : []), ...(jobs ? [`--jobs=${jobs}`] : [])];
  if (flags['no-export']) {
    console.log(pc.gray(`Not exported (--no-export). Export it with: npm run export -- ${exportArgs.join(' ')}`));
  } else {
    console.log(changed
      ? `Exporting ${rel} with --changed: only the sheets never exported or older than their code.`
      : `Exporting ${rel}: all ${sheets} sheet${sheets === 1 ? '' : 's'}${name === DEFAULT_SAMPLE ? ' (about 45 seconds on four performance cores)' : ''}.`);
    try {
      execFileSync(process.execPath, [resolve(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), resolve(ROOT, 'tools', 'export.ts'), ...exportArgs], { cwd: ROOT, stdio: 'inherit' });
    } catch {
      fail(`the export of ${rel} failed (its messages are above). The copy is in ${rel}/: fix what they say, then run npm run example again, which exports what is still missing.`);
    }
  }

  console.log(pc.green(flags['no-export'] ? `${name} is in ${rel}/, not exported yet.` : `${name} is ready in ${rel}/, exported.`));
  console.log(`  Open it: npm run view, then the project ${name} in the project switcher (http://localhost:5173/viewer/p/${name}).`);
  if (existsSync(resolve(target, LAYOUT.game, 'index.html'))) console.log(`  Its game: http://localhost:5173/${rel}/${LAYOUT.game}/ (npm run game -- ${name}).`);
  console.log(`  Its characters in Phaser, on the test bench of @diorama/phaser: http://localhost:5173/packages/phaser/demo/?project=${name}`);
}

const [command, ...rest] = process.argv.slice(2);
const { positionals, flags } = parseFlags(rest);

const USAGE: Record<string, string> = {
  'new-project': 'npm run new-project -- <project> [--style] [--genre <preset>] [--character <height>]\n  Creates projects/<project>/ with the layout of docs/ARCHITECTURE.md: src/theme.ts (from templates/project/: a neutral volume theme with palettes, ramps, line weights, the 2.5D CAMERA and the VOLUMES materials, to make the project\'s own), an empty sheets/ and a .gitignore for review/.\n  --genre      add src/space.ts, the space profile (grid, scale against the characters, wall placement) from a genre preset: jrpg, action-rpg, tactics, farm-sim or dungeon-crawler\n  --character  height of a standing character in world units for the profile (default 80)\n  --style      add STYLE.md (style first, or theme first with a summary). Only when the project is created: for an existing project copy templates/optional/STYLE.md to projects/<project>/STYLE.md',
  'new-asset': 'npm run new-asset -- <project> <subpath> [--engine volume|rig] [--size WxH] [--frames N] [--fps N] [--directions N] [--skeleton humanoid|quadruped] [--clip walk|run|idle|attack|hit|death]\n  <subpath>     kebab-case names joined by "/": the sheet is sheets/<subpath>.ts and the export assets/<subpath>.png. For rig it is <character-folder>/<clip>, e.g. characters/goblin/walk: the folder is the character, the file name is the clip key\n  --engine      volume (default: a prop, scenery piece or effect built from 2.5D volumes, turned to face each direction; the drawing goes in src/<subpath>.ts, exported by name, and the sheet re-exports it) or rig (an animated character clip on a @core/rig skeleton)\n  --size        logical size of one frame; the export is size × scale 2 (default 128x128; rig: 96x112 humanoid, 112x96 quadruped)\n  --frames      frames in an animation strip (default 1; rig 8)\n  --fps         playback speed hint (default 6; not for rig: the clip sets it)\n  --directions  facings rendered as rows (default 8: S, SW, W, NW, N, NE, E, SE; 4: S, W, N, E; 1 for a piece that never turns)\n  --skeleton    rig only: humanoid (default) or quadruped\n  --clip        rig only: walk, run, idle, attack, hit or death. Default: the file name when it is one of these, else walk\n  The first clip of a character creates src/<character-folder>/character.ts (defineCharacter, with a mannequin block-out skin to replace: diorama-rig skill). --skeleton, --size, --frames and --directions apply to that first clip only; a later clip prints the line to add to `clips` there.',
  'new-kit': 'npm run new-kit -- <project> scenery|gear|vfx|items [--force] [--json]\n  Starts a kit in src/<kit>/ (docs/ARCHITECTURE.md, Kits): catalog.ts (what editors and the generator command read), index.ts (what other code imports) and a first piece in a family file, written with the engine\'s types and the project\'s theme (CAMERA, the VOLUMES materials) and space profile (src/space.ts, when it has one):\n    scenery  src/scenery/props.ts, a crate prop (SCENERY)                then scenery-items, export scenery/, scenery-test; new-scene works on it\n    gear     src/gear/heads.ts, a helm, and bodies.ts, a mannequin body (CATALOG, and CHARACTERS with a mannequin that wears it)   then gear-items, export gear/\n    vfx      src/vfx/bursts.ts, a spark burst (VFX)                       then vfx-items, export vfx/\n    items    src/items/gems.ts, a gem with its rarity tiers (ITEMS)       then item-icons, export icons/\n  The first piece is a block-out that renders, so the kit\'s generator, the export and check --strict pass on it; make it the project\'s own. Refuses to overwrite an existing kit\'s files unless --force (the kit\'s other files stay).',
  list: 'npm run list -- [project] [--json]\n  Sheets, exported assets and review files (review/) of one project or of all of them: yours in projects/, then the samples of examples/, labelled as samples ("sample": true in --json; npm run example copies one into projects/, where the viewer shows it).',
  check: 'npm run check -- <project> [--strict] [--json]\n  Type-checks the project\'s src/, sheets/ and game/ with the repository\'s tsconfig (errors in the engine and package files it imports are counted apart), then checks its layout (npm run layout) and that src/ and sheets/ are deterministic (game/ is not linted): no Math.random, no Date or performance.now, and no raw color literals (#hex, rgb(), hsl()) outside src/theme.ts, each reported with its file and line. Fails on any of them; --strict also fails on sheets not exported yet and assets without a sheet.',
  layout: 'npm run layout -- <project> [--strict] [--json]\n  Checks the project against the rules of docs/ARCHITECTURE.md: only src/, sheets/, assets/, review/, game/, STYLE.md, README.md, diorama.config.json (only outDir, scale, format, cols and gap) and .gitignore at its root; no underscore prefixes and kebab-case names in src/ and sheets/ (markdown notes in src/ may use capitals); sheets are thin (no function or class, at most 20 lines of code) and generated ones keep their "Generated by" line; src/ never imports sheets/ and sheets never import sheets; a kit with catalog.ts has index.ts; assets/ holds only PNG and JSON; game/ holds code and data only (no images: they come from assets/, through the packages), and every import and URL of its code, CSS and page is a relative path that stays inside game/ or one of @diorama/runtime, @diorama/phaser, @diorama/phaser/sheets and phaser (a dynamic import or a glob: a static ./ or ../ path); src/ and sheets/ never import a game, their imports resolved with the repository\'s tsconfig.json. Sheets without an export and assets without a sheet are warnings (errors with --strict).',
  game: 'npm run game -- <project> [--port N]\n  Serves the project\'s game (game/index.html, rule 8 of docs/ARCHITECTURE.md) with the viewer\'s dev server and prints its URL, http://localhost:5173/<projects|examples>/<project>/game/; the page loads the exports from the project\'s assets/. When this repository\'s dev server (npm run view) already answers on the port, it only prints the URL; another program on the port is an error. Ctrl+C stops the server it started. A project without game/index.html has no game, and the command says so; the test bench of @diorama/phaser (/packages/phaser/demo/?project=<project>) plays its characters without one.\n  --port  the port to serve on (default 5173, the viewer\'s)',
  inspect: 'npm run inspect -- <file.png> [--json]\n  Size, content bounds, edges reached, transparency and distinct colors; with the atlas JSON next to the PNG, each cell (touching its edges, empty, pivot to content bottom, height above the pivot against the space profile); the quality numbers (value spread, tone levels, ink, accent) with warnings by role; the rig\'s motion check, the grip checks of a character holding items (gap, open hand, wrist, reach, drift, handle, each its worst value and frame) and the character manifest of a character sheet (with the cued effects looked up in assets/vfx/).',
  contact: 'npm run contact -- <file.png> [--with <b.png>] [--rows W,SW] [--frames 0-3] [--zoom N] [--bg <hex>] [--gray] [--out <png>] [--json]\n  Zoomed review sheet: one row per direction (or one row of frames) on a flat background.\n  --with    a second sheet drawn under the first, with the same rows and frames and the cells aligned (before and after, or one character against another). Both need the same cell size unless --zoom is given: each band then keeps its own cell size, left-aligned\n  --rows    only these directions (names from the atlas, in the order given; a UI sheet\'s states and, on a 16-facing sheet, the 8 compass names work too)\n  --frames  only these frame columns: 0-3, 0,2,5 or 0-2,5\n  --zoom    whole number; default 2 (more for small cells) while the sheet stays under 4000px wide, else 1\n  --bg      six hex digits, default 6e6a64. Write --bg 6e6a64 or quote it, --bg "#6e6a64": an unquoted # starts a shell comment\n  --gray    desaturate for the value test.\n  Written to <project>/review/contact/<asset path>[-vs-<b>]-contact[-<rows>][-f<frames>][-gray].png.',
  'new-scene': 'npm run new-scene -- <project> <name> --scene <file.json> [--force] [--json]\n  Turns a scene saved as JSON (SceneData, e.g. from the viewer\'s scene painter) into src/scenes/<name>.ts (SCENE) and sheets/scenes/<name>.ts (defineSceneAsset). The scene is validated against src/scenery/catalog.ts first.',
  'scenery-items': 'npm run scenery-items -- <project> [--force] [--json]\n  Writes sheets/scenery/<id>.ts for every piece of src/scenery/catalog.ts (SCENERY): defineTileSet, one frame per connection mask and variant (floors, walls, fences) or rows per facing (props, doors), plus <id>--<state>.ts for every other resting state and <id>--<clip>.ts for every animation. Pieces with `asset` in the catalog (a sheet path under sheets/, or false) get no default sheet here. Generated sheets start with their "Generated by" line; existing ones are kept unless --force. Then export scenery/.',
  'vfx-items': 'npm run vfx-items -- <project> [--force] [--json]\n  Writes sheets/vfx/<id>.ts for every effect of src/vfx/catalog.ts (VFX): defineEffect, its frames across and its facings down. Generated sheets start with their "Generated by" line; existing ones are kept unless --force. Then export vfx/.',
  'item-icons': 'npm run item-icons -- <project> [--force] [--json]\n  Writes sheets/icons/<id>.ts for every item of src/items/catalog.ts (ITEMS): defineItemIcon, the item fitted into the icon square with its rarity frame. Generated sheets start with their "Generated by" line; existing ones are kept unless --force. Then export icons/.',
  'scenery-test': 'npm run scenery-test -- <project> <piece> [--on <floor>|none] [--field] [--out <png>] [--keep] [--json]\n  Renders one piece through every join it has (seamTestScene: floor patches and saddles, wall loops, L, T, cross, lone post and joins, or every facing × variant of a prop) into <project>/review/scenery-tests/<piece>.png, through a throwaway sheet in sheets/scenery-tests/ (removed unless --keep).\n  --on     the floor everything stands on (default: the lowest floor; none for no floor), e.g. water over crypt-flags\n  --field  floors only: a 14 × 10 field of the floor alone, to judge repetition at 1×\n  Zoom the joins with contact --zoom 3.',
  'gear-items': 'npm run gear-items -- <project> [--force] [--json]\n  Writes sheets/gear/<id>.ts for every part of src/gear/catalog.ts (except effects and base bodies): defineGearAsset of the part alone, worn by the first character whose outfit has it. Generated sheets start with their "Generated by" line; existing ones are kept unless --force. Then export gear/.',
  example: 'npm run example -- [sample] [--force] [--no-export] [--changed] [--jobs <n>]\n  Copies Soulkeeper, the sample game (examples/soulkeeper; another folder of examples/ when [sample] names one), to projects/soulkeeper, everything but review/, and exports it there. The viewer shows the projects of projects/ only: the copy is a project of yours, which it shows and saves into, and the sample in examples/ stays as it ships. When the sample has exports in its assets/, they are copied with their times and only the sheets out of date are exported (--changed); otherwise every sheet is (about 45 seconds). When projects/soulkeeper already exists it is yours: nothing is copied over it, and it is exported with --changed. The copy is made in a hidden folder of projects/ and moved into place when it is whole, so a copy that fails leaves nothing behind. One run at a time: while one runs (projects/.example.lock holds its process), another refuses. Commands still reach the sample itself as examples/soulkeeper.\n  --force      replace an existing projects/soulkeeper with a fresh copy: the old one is moved to the viewer\'s trash, .diorama-trash/projects/<id>/soulkeeper (a link there is removed, the link only), and the command prints how to get it back (move the fresh copy out of the way, then move the old one back)\n  --no-export  copy only, without exporting\n  --changed    export only what is missing or out of date, even for a copy that came without exports\n  --jobs <n>   sheets the export renders at once (npm run export -- --help)',
  'new-outfit-character': 'npm run new-outfit-character -- <project> <name> --from <character> --outfit <file.json> [--force] [--json]\n  Turns an outfit saved as JSON (OutfitData, e.g. from the viewer\'s customizer) into src/characters/<name>/outfit.ts and character.ts (defineCharacter with the outfit and the skeleton, clips and cell of <character> from src/gear/catalog.ts CHARACTERS) and one sheet per clip it can use in sheets/characters/<name>/: clips made for another weapon than the one the outfit holds are skipped (checkWield). The outfit is validated against CATALOG first.',
};

/** Every command with its first usage line: what `--help` without a command, or an unknown command, prints. */
function overview(): string {
  return [
    'Diorama commands (npm run <command> -- --help for the options of one):',
    ...Object.values(USAGE).map(text => `  ${text.split('\n')[0]}`),
    '  npm run export -- <project> [subpath...] [--grid|--compact] [--mockup] [--changed] [--jobs <n>] [--force] [--json]   (type checks first; npm run export -- --help)',
  ].join('\n');
}

if (flags['help'] || command === '--help' || command === 'help') {
  console.log(command && USAGE[command] ? USAGE[command] : overview());
  process.exit(0);
}

const run = (task: Promise<void>) => task.catch(err => fail(String(err?.message ?? err)));

switch (command) {
  case 'new-project': run(newProject(positionals, flags)); break;
  case 'new-asset': newAsset(positionals, flags); break;
  case 'new-kit': run(newKit(positionals, flags)); break;
  case 'list': list(positionals, flags); break;
  case 'check': check(positionals, flags); break;
  case 'layout': layout(positionals, flags); break;
  case 'game': run(game(positionals, flags)); break;
  case 'inspect': inspect(positionals, flags); break;
  case 'contact': contact(positionals, flags); break;
  case 'new-outfit-character': run(newOutfitCharacter(positionals, flags)); break;
  case 'gear-items': run(gearItems(positionals, flags)); break;
  case 'scenery-items': run(sceneryItems(positionals, flags)); break;
  case 'new-scene': run(newScene(positionals, flags)); break;
  case 'scenery-test': run(sceneryTest(positionals, flags)); break;
  case 'vfx-items': run(catalogItems('vfx', positionals, flags)); break;
  case 'item-icons': run(catalogItems('items', positionals, flags)); break;
  case 'example': run(example(positionals, flags)); break;
  default:
    console.error(command ? pc.red(`Error: unknown command "${command}".`) : pc.red('Error: a command is required.'));
    console.error(overview());
    process.exit(1);
}
