import assert from 'node:assert/strict';
import { execFile, execSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { inflateSync } from 'node:zlib';
import { restoreProject } from '../../tools/trash';
import { exportTypeErrors } from '../../viewer/src/lib/export-errors';

console.log('🧪 Checking agent commands (new-project, new-asset, new-kit, check, layout, game, list, example, export incl. --changed and --jobs, inspect, contact)...\n');

const project = `zz-cli-test-${Date.now()}`;
const projectDir = resolve('projects', project);
const layoutProject = `${project}-layout`;
const layoutDir = resolve('projects', layoutProject);
const kitsProject = `${project}-kits`;
const kitsDir = resolve('projects', kitsProject);
const bareKitsProject = `${project}-kits-nospace`;
const bareKitsDir = resolve('projects', bareKitsProject);

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs tools/cli.ts in `cwd` (the repository it works in), without colors. Never throws: callers check the exit code. */
function cli(args: string[], cwd = resolve('.')): Result {
  const result = spawnSync(process.execPath, [resolve('node_modules', 'tsx', 'dist', 'cli.mjs'), resolve('tools', 'cli.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: undefined } });
  return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

// Runs an npm script. Never throws: callers check the exit code.
function run(command: string): Result {
  try {
    const stdout = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (err: any) {
    return { code: err.status ?? 1, stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? '') };
  }
}

/**
 * A hand-written asset in the project layout: the definition in src/<name>.ts as a named export,
 * the sheet in sheets/<name>.ts re-exporting it (`source` is written with `export default`).
 */
function writeAsset(name: string, source: string): void {
  const id = name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  writeFileSync(resolve(projectDir, 'src', `${name}.ts`), source.replace('export default ', `export const ${id} = `), 'utf8');
  writeFileSync(resolve(projectDir, 'sheets', `${name}.ts`), `export { ${id} as default } from '../src/${name}';\n`, 'utf8');
}

const badgeSource = `import { defineAsset } from '@core';
import { Polygon } from '@core/draw';

export default defineAsset({
  width: 32,
  height: 32,
  scale: 1,
  render({ ctx, preview }) {
    Polygon.circle(12, { cx: 16, cy: 16 }).draw(ctx, { fill: preview ? '#00ff00' : '#ff0000' });
  },
});
`;

try {
  // 1. new-project creates the layout (src/theme.ts, an empty sheets/, a .gitignore for review/) and refuses to overwrite it.
  const created = run(`npm run --silent new-project -- ${project}`);
  assert.equal(created.code, 0, `new-project failed: ${created.stderr}`);
  assert.ok(created.stdout.includes('--engine volume|rig'), `new-project must point at the two engines: ${created.stdout}`);
  const theme = readFileSync(resolve(projectDir, 'src', 'theme.ts'), 'utf8');
  for (const token of ['export const PALETTES', 'export const RAMPS', 'export const CAMERA', 'export const VOLUMES']) {
    assert.ok(theme.includes(token), `the template theme must declare ${token.split(' ').pop()}`);
  }
  assert.deepEqual(readdirSync(resolve(projectDir, 'sheets')), [], 'sheets/ starts empty');
  assert.ok(/^review\/$/m.test(readFileSync(resolve(projectDir, '.gitignore'), 'utf8')), 'the project .gitignore ignores review/');
  assert.deepEqual(readdirSync(projectDir).filter(n => n !== '.DS_Store').sort(), ['.gitignore', 'sheets', 'src'], 'a new project holds only src/, sheets/ and its .gitignore');
  assert.ok(!existsSync(resolve(projectDir, 'STYLE.md')), 'STYLE.md is optional and must not be created by default');
  assert.ok(!existsSync(resolve(projectDir, 'src', 'space.ts')), 'space.ts is only written with --genre');
  const withOptional = run(`npm run --silent new-project -- ${project}-opt --style`);
  assert.equal(withOptional.code, 0, `new-project --style failed: ${withOptional.stderr}`);
  const optionalDir = resolve('projects', `${project}-opt`);
  try {
    assert.ok(readFileSync(resolve(optionalDir, 'STYLE.md'), 'utf8').includes(`${project}-opt`), 'STYLE.md must carry the name');
  } finally {
    rmSync(optionalDir, { recursive: true, force: true });
  }
  const again = run(`npm run --silent new-project -- ${project}`);
  assert.notEqual(again.code, 0, 'new-project must refuse an existing project');
  // --genre writes the space profile from an engine preset; an unknown preset stops before anything is written.
  const badGenre = run(`npm run --silent new-project -- ${project}-genre --genre nope`);
  assert.notEqual(badGenre.code, 0, 'an unknown genre must fail');
  assert.ok(badGenre.stderr.includes('jrpg'), 'and list the presets');
  assert.ok(!existsSync(resolve('projects', `${project}-genre`)), 'without creating the project');
  const genreDir = resolve('projects', `${project}-genre`);
  try {
    assert.equal(run(`npm run --silent new-project -- ${project}-genre --genre tactics --character 64`).code, 0);
    const space = readFileSync(resolve(genreDir, 'src', 'space.ts'), 'utf8');
    assert.ok(space.includes("preset: 'tactics'") && space.includes('= 64;') && space.includes("from './theme'"), 'space.ts carries the preset and the character height, and reads the theme next to it');
  } finally {
    rmSync(genreDir, { recursive: true, force: true });
  }

  // 2. new-asset: volume is the default engine; the drawing in src/<subpath>.ts (a named export), the sheet in
  // sheets/<subpath>.ts (one line re-exporting it); space-separated values; refusal to overwrite.
  const asset = run(`npm run --silent new-asset -- ${project} props/barrel --size 96x64`);
  assert.equal(asset.code, 0, `new-asset failed: ${asset.stderr}`);
  const assetFile = readFileSync(resolve(projectDir, 'src', 'props', 'barrel.ts'), 'utf8');
  assert.ok(assetFile.includes('width: 96') && assetFile.includes('height: 64'), 'new-asset must honor --size');
  assert.ok(assetFile.includes("from '@core/volume'") && assetFile.includes('pivot: { x: 48, y: 50 }'), 'without --engine the asset is a volume asset with its pivot near the bottom');
  assert.ok(assetFile.includes('export const barrel = defineAsset({') && !assetFile.includes('export default'), 'the drawing is a named export of src/');
  assert.equal(readFileSync(resolve(projectDir, 'sheets', 'props', 'barrel.ts'), 'utf8'), "export { barrel as default } from '../../src/props/barrel';\n", 'the sheet is one re-export');
  assert.ok(asset.stdout.includes('The export is 192x128 per frame, 8 directions as rows'), `new-asset must say how big the export is: ${asset.stdout}`);
  assert.notEqual(
    run(`npm run --silent new-asset -- ${project} props/barrel --engine volume`).code,
    0,
    'new-asset must refuse an existing file',
  );

  // 2a. Volume assets: 8 facings by default, the theme's camera; --directions 1 for a piece that never turns; strips.
  const vol = run(`npm run --silent new-asset -- ${project} props/crate --engine volume --size 64x64`);
  assert.equal(vol.code, 0, `new-asset --engine volume failed: ${vol.stderr}`);
  const volFile = readFileSync(resolve(projectDir, 'src', 'props', 'crate.ts'), 'utf8');
  assert.ok(volFile.includes('directions: 8') && volFile.includes("from '../theme'") && volFile.includes('CAMERA.at(') && volFile.includes('scale: 2'), 'volume template uses 8 facings, the theme camera and scale 2');
  assert.equal(run(`npm run --silent new-asset -- ${project} marks/rune --directions 1 --frames 4 --fps 8`).code, 0);
  const rune = readFileSync(resolve(projectDir, 'src', 'marks', 'rune.ts'), 'utf8');
  assert.ok(!rune.includes('directions:') && rune.includes('frames: 4') && rune.includes('fps: 8') && rune.includes('frameIndex'), 'one facing writes no directions; frames and fps make a strip');
  // Only the two engines of Diorama; a rejected command leaves no file.
  for (const engine of ['sprite', 'nope']) {
    const refused = run(`npm run --silent new-asset -- ${project} flat --engine ${engine}`);
    assert.ok(refused.code !== 0 && refused.stderr.includes('"volume" or "rig"'), `--engine ${engine} must be refused and name the engines: ${refused.stderr}`);
  }
  assert.notEqual(run(`npm run --silent new-asset -- ${project} flat --directions 0`).code, 0, '--directions must be a whole number, 1 or more');
  const badName = run(`npm run --silent new-asset -- ${project} props/Big_Crate`);
  assert.ok(badName.code !== 0 && badName.stderr.includes('kebab-case'), `a subpath that is not kebab-case must be refused: ${badName.stderr}`);
  assert.ok(!existsSync(resolve(projectDir, 'src', 'flat.ts')) && !existsSync(resolve(projectDir, 'sheets', 'flat.ts')) && !existsSync(resolve(projectDir, 'sheets', 'props', 'Big_Crate.ts')), 'a rejected command must not leave a file');

  // 2c. Rig assets: the first clip of a character creates its src/<folder>/character.ts (defineCharacter with
  // the theme's first VOLUMES key in mannequinSkin, cell and pivot fitting the skeleton); every
  // clip sheet (sheets/<folder>/<clip>.ts) is one line exporting character.sheet('<key>').
  const charDir = (name: string) => resolve(projectDir, 'src', 'characters', name);
  const clipSheet = (name: string, clip: string) => resolve(projectDir, 'sheets', 'characters', name, `${clip}.ts`);
  const rig = run(`npm run --silent new-asset -- ${project} characters/knight/walk --engine rig`);
  assert.equal(rig.code, 0, `new-asset --engine rig failed: ${rig.stderr}`);
  const knight = readFileSync(resolve(charDir('knight'), 'character.ts'), 'utf8');
  assert.ok(knight.includes('defineCharacter({') && knight.includes("name: 'knight'") && knight.includes('mannequinSkin(VOLUMES.cloth)'), 'the character wraps the first theme material in mannequinSkin');
  assert.ok(knight.includes("from '../../theme'") && knight.includes('camera: CAMERA') && knight.includes('diorama-rig skill'), 'the character reads the theme camera and points at the skill');
  assert.ok(knight.includes('humanoid()') && knight.includes("walk: locomotion(skeleton, 'walk')"), 'the first clip is a humanoid walk keyed by the file name');
  assert.ok(knight.includes('width: 96') && knight.includes('height: 112') && knight.includes('pivot: { x: 48, y: 96 }'), 'humanoid cell is 96x112 with the feet at 48,96');
  assert.ok(knight.includes('frames: 8') && knight.includes('directions: 8'), 'rig template defaults to 8 frames and 8 facings');
  const knightWalk = readFileSync(clipSheet('knight', 'walk'), 'utf8');
  assert.ok(knightWalk.includes("from '../../../src/characters/knight/character'") && knightWalk.includes("character.sheet('walk')"), 'a clip sheet only exports its sheet of the character in src/');
  assert.ok(!existsSync(resolve(charDir('knight'), 'walk.ts')), 'nothing of a clip sheet is written into src/');
  const rigPup = run(`npm run --silent new-asset -- ${project} characters/pup/walk --engine rig --skeleton quadruped --frames 4 --directions 4`);
  assert.equal(rigPup.code, 0, `new-asset --engine rig --skeleton quadruped failed: ${rigPup.stderr}`);
  const pupChar = readFileSync(resolve(charDir('pup'), 'character.ts'), 'utf8');
  assert.ok(pupChar.includes('quadruped()') && pupChar.includes('width: 112') && pupChar.includes('height: 96') && pupChar.includes('pivot: { x: 56, y: 72 }'), 'quadruped cell is 112x96 with the feet at 56,72');
  assert.ok(pupChar.includes('frames: 4') && pupChar.includes('directions: 4'), 'rig template honors --frames and --directions');
  // A second clip of an existing character leaves character.ts alone and says what to add.
  const pupBite = run(`npm run --silent new-asset -- ${project} characters/pup/bite --engine rig --clip attack`);
  assert.equal(pupBite.code, 0, pupBite.stderr);
  assert.ok(pupBite.stdout.includes("'bite': bite(skeleton)") && readFileSync(resolve(charDir('pup'), 'character.ts'), 'utf8') === pupChar, 'a second clip is added by hand to clips');
  assert.ok(readFileSync(clipSheet('pup', 'bite'), 'utf8').includes("character.sheet('bite')"), 'and gets its sheet');
  writeFileSync(resolve(charDir('pup'), 'character.ts'), pupChar.replace(/import \{ ([^}]*) \} from '@core\/rig';/, "import { bite, $1 } from '@core/rig';").replace('  clips: {\n', '  clips: {\n    bite: bite(skeleton),\n'), 'utf8');
  assert.equal(run(`npm run --silent new-asset -- ${project} characters/imp/idle --engine rig --size 80x100`).code, 0);
  const imp = readFileSync(resolve(charDir('imp'), 'character.ts'), 'utf8');
  assert.ok(imp.includes('idle: idle(skeleton)') && imp.includes('width: 80') && imp.includes('pivot: { x: 40, y: 86 }'), 'the clip preset follows the file name, and --size scales the pivot with the cell');
  for (const [target, flags, why] of [
    ['characters/bad', '--skeleton bird', 'an unknown skeleton'],
    ['characters/bad', '--clip fly', 'an unknown clip'],
    ['characters/bad', '--fps 8', '--fps (the clip sets the playback speed)'],
    ['lonely', '', 'a clip without a character folder'],
    ['characters/ogre/Walk_Fast', '', 'a clip key that is not lowercase-dashed'],
  ]) {
    assert.notEqual(run(`npm run --silent new-asset -- ${project} ${target} --engine rig ${flags}`).code, 0, `rig must reject ${why}`);
  }
  assert.ok(!existsSync(resolve(projectDir, 'sheets', 'characters', 'bad.ts')) && !existsSync(resolve(projectDir, 'src', 'characters', 'character.ts')) && !existsSync(charDir('ogre')) && !existsSync(resolve(projectDir, 'sheets', 'characters', 'ogre')), 'a rejected rig command must not leave a file');
  assert.notEqual(run(`npm run --silent new-asset -- ${project} flat --engine volume --skeleton humanoid`).code, 0, '--skeleton must be refused outside --engine rig');
  assert.notEqual(run(`npm run --silent new-asset -- ${project} flat --clip walk`).code, 0, '--clip must be refused outside --engine rig');
  // A theme with no VOLUMES material leaves a TODO instead of guessing a key.
  const bare = `${project}-novol`;
  const bareDir = resolve('projects', bare);
  assert.equal(run(`npm run --silent new-project -- ${bare}`).code, 0);
  try {
    writeFileSync(resolve(bareDir, 'src', 'theme.ts'), `import { Camera, type VolumeStyle } from '@core/volume';
export const PALETTES = { ink: '#000000' };
export const CAMERA = new Camera({ tilt: 48, heightBoost: 1.2, light: { azimuth: 140, elevation: 45, ambient: 0.35 } });
export const VOLUMES: Record<string, VolumeStyle> = {};
`, 'utf8');
    assert.equal(run(`npm run --silent new-asset -- ${bare} hero/walk --engine rig`).code, 0);
    const bareFile = readFileSync(resolve(bareDir, 'src', 'hero', 'character.ts'), 'utf8');
    assert.ok(bareFile.includes('TODO') && !bareFile.includes('VOLUMES.cloth'), 'a theme without a VOLUMES key must leave a TODO');
  } finally {
    rmSync(bareDir, { recursive: true, force: true });
  }

  // 2b. A freshly created project must type-check and follow the layout: the template theme may not depend on
  // missing files, and the scaffolds are thin sheets over src/. Not exported yet: warnings, unless --strict.
  const checked = run(`npm run --silent check -- ${project}`);
  assert.equal(checked.code, 0, `a new project must pass check: ${checked.stdout}`);
  assert.ok(checked.stdout.includes('layout follows docs/ARCHITECTURE.md') && checked.stdout.includes('not exported yet'), `check runs the layout rules too: ${checked.stdout}`);
  assert.notEqual(run(`npm run --silent check -- ${project} --strict`).code, 0, 'with --strict, sheets without an export fail');

  // 3. list --json reports the sheets, and where the project lives.
  const listed = JSON.parse(run(`npm run --silent list -- ${project} --json`).stdout);
  assert.deepEqual(listed.projects[0].sheets, ['characters/imp/idle', 'characters/knight/walk', 'characters/pup/bite', 'characters/pup/walk', 'marks/rune', 'props/barrel', 'props/crate']);
  assert.equal(listed.projects[0].dir, `projects/${project}`);
  // examples/<name> names the sample explicitly, whether or not a copy is in projects/ (where a bare name looks first: both
  // states are checked in a miniature repository in 3a).
  const sampleListed = JSON.parse(run('npm run --silent list -- examples/soulkeeper --json').stdout).projects[0];
  assert.deepEqual([sampleListed.project, sampleListed.dir, sampleListed.sample], ['soulkeeper', 'examples/soulkeeper', true], 'examples/<name> is the sample, labelled as one');
  assert.equal(listed.projects[0].sample, false, 'a project of projects/ is not a sample');
  const everyProject = cli(['list']);
  assert.ok(everyProject.stdout.includes('soulkeeper examples/soulkeeper sample (npm run example copies it into projects/)'), `list shows the samples, labelled: ${everyProject.stdout.split('\n').filter(line => line.includes('soulkeeper')).join(' | ')}`);
  assert.ok(JSON.parse(run('npm run --silent list -- --json').stdout).projects.some((p: { dir: string; sample: boolean }) => p.dir === 'examples/soulkeeper' && p.sample), 'and --json marks them');
  const missingProject = run('npm run --silent list -- zz-no-such-project');
  assert.ok(missingProject.code !== 0 && missingProject.stderr.includes('projects/ or examples/') && missingProject.stderr.includes('soulkeeper (examples)'), `an unknown project lists the ones there are, the samples too: ${missingProject.stderr}`);
  // projects/<name> is how the viewer names a project: the answer is about projects/ alone, the viewer has no samples.
  for (const missing of [cli(['gear-items', 'projects/zz-no-such-project']), run('npm run --silent export -- projects/zz-no-such-project')]) {
    assert.ok(missing.code !== 0 && /[Pp]roject "zz-no-such-project" does not exist in projects\/\./.test(missing.stderr) && !missing.stderr.includes('examples'), `a missing project of projects/ is not answered with the samples: ${missing.stderr}`);
  }

  // 3a. example copies a sample of examples/ into projects/ (everything but review/, every file with its times), refuses to
  // copy over a copy that is there (it is the user's), and --force first moves that one to the viewer's trash. The command
  // works in the repository it runs in: here a miniature one with a small sample, and --no-export (the export it runs,
  // --changed or full, is checked for real in 3b, in this repository).
  const mini = mkdtempSync(join(tmpdir(), 'diorama-example-'));
  const example = (...args: string[]) => cli(['example', ...args], mini);
  const lockFile = join(mini, 'projects', '.example.lock');
  const projectsOf = () => readdirSync(join(mini, 'projects')).sort();
  try {
    const shipped = join(mini, 'examples', 'sample');
    const putSample = (rel: string, content: string, seconds: number) => {
      const file = join(shipped, rel);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, content);
      utimesSync(file, seconds, seconds);
    };
    putSample('STYLE.md', '# Sample\n', 900);
    putSample('src/theme.ts', 'export const THEME = 1;\n', 900);
    putSample('sheets/props/crate.ts', "export { THEME as default } from '../../src/theme';\n", 900);
    putSample('assets/props/crate.png', 'png', 1000);
    putSample('assets/props/crate.json', '{}', 1000);
    putSample('review/contact/crate-contact.png', 'scratch', 1000);
    const copy = join(mini, 'projects', 'sample');
    // Projects are found in projects/ first, then examples/; examples/<name> names the sample explicitly. A bare name finds
    // the sample while no project of that name is in projects/, and the copy once example has made one.
    const bareDir = () => JSON.parse(cli(['list', 'sample', '--json'], mini).stdout).projects[0].dir;
    assert.equal(bareDir(), 'examples/sample', 'without a copy, a bare name is the sample of examples/');

    const first = example('sample', '--no-export');
    assert.equal(first.code, 0, `example failed: ${first.stderr}`);
    assert.equal(bareDir(), 'projects/sample', 'with a copy, a bare name is the copy in projects/');
    assert.equal(JSON.parse(cli(['list', 'examples/sample', '--json'], mini).stdout).projects[0].dir, 'examples/sample', 'and examples/<name> still the sample');
    assert.ok(first.stdout.includes('Copied examples/sample to projects/sample/') && first.stdout.includes('its exports with their times'), `example says what it copied: ${first.stdout}`);
    assert.ok(first.stdout.includes('npm run export -- projects/sample --changed'), `with the sample's exports, only what is out of date needs exporting: ${first.stdout}`);
    assert.ok(first.stdout.includes('npm run view') && first.stdout.includes('/viewer/p/sample') && first.stdout.includes('/packages/phaser/demo/?project=sample'), `example says how to open it: ${first.stdout}`);
    assert.deepEqual(readdirSync(copy).sort(), ['STYLE.md', 'assets', 'sheets', 'src'], 'everything but review/ is copied');
    assert.equal(readFileSync(join(copy, 'sheets/props/crate.ts'), 'utf8'), readFileSync(join(shipped, 'sheets/props/crate.ts'), 'utf8'));
    assert.deepEqual(['sheets/props/crate.ts', 'src/theme.ts', 'assets/props/crate.png'].map(rel => statSync(join(copy, rel)).mtimeMs), [900_000, 900_000, 1_000_000], 'every file keeps its time, so export --changed sees the same state as in the sample');
    assert.ok(existsSync(join(shipped, 'review/contact/crate-contact.png')), 'the sample is left as it ships');
    assert.deepEqual(projectsOf(), ['sample'], 'the copy is renamed into place: no copy folder and no lock is left in projects/');

    // A copy that is there is the user's: nothing is copied over it.
    writeFileSync(join(copy, 'src', 'mine.ts'), 'export const MINE = 1;\n');
    putSample('STYLE.md', '# Sample, newer\n', 2000);
    const again = example('sample', '--no-export');
    assert.equal(again.code, 0, `example on an existing copy failed: ${again.stderr}`);
    assert.ok(again.stdout.includes('projects/sample/ already exists') && again.stdout.includes('--force'), `example says the copy is kept, and how to replace it: ${again.stdout}`);
    assert.ok(existsSync(join(copy, 'src', 'mine.ts')) && readFileSync(join(copy, 'STYLE.md'), 'utf8') === '# Sample\n', 'the copy is left as it is');

    // --force: the old copy goes to the viewer's trash (where its restore finds it), and a fresh one takes its place. The
    // restore refuses while the fresh copy is there, so the command says to move that one out of the way first.
    const forced = example('sample', '--force', '--no-export');
    assert.equal(forced.code, 0, `example --force failed: ${forced.stderr}`);
    const trashed = /\.diorama-trash\/projects\/([^/]+)\/sample\//.exec(forced.stdout);
    assert.ok(trashed, `example --force says where the old copy went: ${forced.stdout}`);
    assert.ok(existsSync(join(mini, '.diorama-trash', 'projects', trashed[1], 'sample', 'src', 'mine.ts')), 'the old copy is in the trash, whole');
    assert.ok(!existsSync(join(copy, 'src', 'mine.ts')) && readFileSync(join(copy, 'STYLE.md'), 'utf8') === '# Sample, newer\n', 'and a fresh copy of the sample is in projects/');
    assert.ok(forced.stdout.includes('move that out of the way first') && forced.stdout.includes('mv projects/sample projects/sample-fresh') && forced.stdout.includes(`mv .diorama-trash/projects/${trashed[1]}/sample projects/sample`), `example --force prints the steps that get the old copy back: ${forced.stdout}`);
    await assert.rejects(restoreProject(mini, 'sample', trashed[1]), /already exists/, 'the restore never moves the old copy over the fresh one');
    renameSync(copy, `${copy}-fresh`);
    await restoreProject(mini, 'sample', trashed[1]);
    assert.ok(existsSync(join(copy, 'src', 'mine.ts')), "with the fresh copy moved away, the viewer's restore brings the old copy back");
    rmSync(`${copy}-fresh`, { recursive: true });

    // The export's own options are passed on (npm run example used to be an export of the sample); anything else is refused
    // with what the command takes, never read as a sample name.
    const passed = example('sample', '--no-export', '--changed', '--jobs', '2');
    assert.ok(passed.code === 0 && passed.stdout.includes('npm run export -- projects/sample --changed --jobs=2'), `--jobs goes to the export (and --changed, which an existing copy gets anyway; a fresh one is checked below): ${passed.stdout} ${passed.stderr}`);
    const refusals: Array<[string[], string]> = [
      [['--grid', '--no-export'], '--grid is not an option of npm run example'],
      [['--jobs', 'many', '--no-export'], '--jobs needs a whole number'],
      [['--jobs'], '--jobs needs a value'],
      [['props/crate', '--no-export'], 'npm run export -- projects/soulkeeper props/crate'],
      [['sample', 'props/', '--no-export'], 'copies one sample'],
    ];
    for (const [args, says] of refusals) {
      const refused = example(...args);
      assert.ok(refused.code !== 0 && refused.stderr.includes(says), `example ${args.join(' ')} is refused with "${says}": ${refused.stderr}`);
    }

    // One run at a time: a run holds projects/.example.lock (its pid) while it copies and exports, and another refuses. A
    // lock whose process is gone, or an empty one a run left long ago, is stale and taken over; every run removes its own.
    writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: '2026-01-01T00:00:00.000Z', command: 'npm run example' }));
    const busy = example('sample', '--force', '--no-export');
    assert.ok(busy.code !== 0 && busy.stderr.includes('npm run example is already running') && busy.stderr.includes(`process ${process.pid}`) && busy.stderr.includes('remove projects/.example.lock'), `a second run refuses: ${busy.stderr}`);
    assert.ok(existsSync(join(copy, 'src', 'mine.ts')) && JSON.parse(readFileSync(lockFile, 'utf8')).pid === process.pid, 'and touches neither the copy nor the lock of the run that holds it');
    const gone = spawnSync(process.execPath, ['-e', '']).pid;
    writeFileSync(lockFile, JSON.stringify({ pid: gone, startedAt: '2026-01-01T00:00:00.000Z', command: 'npm run example' }));
    const takenOver = example('sample', '--no-export');
    assert.equal(takenOver.code, 0, `a lock whose process is gone does not stop a run: ${takenOver.stderr}`);
    assert.ok(!existsSync(lockFile), 'and the run removes the lock when it ends');
    writeFileSync(lockFile, '');
    assert.ok(example('sample', '--no-export').stderr.includes('already running'), 'a lock being written (no pid yet) holds');
    utimesSync(lockFile, 1000, 1000);
    assert.equal(example('sample', '--no-export').code, 0, 'an empty lock left long ago is stale');
    assert.ok(!existsSync(lockFile), 'and an empty lock left long ago is removed too');

    // A copy that fails half way (an unreadable file) leaves nothing in projects/ and changes nothing: with --force, the
    // user's copy stays where it is and nothing goes to the trash.
    const unreadable = join(shipped, 'src', 'secret.ts');
    writeFileSync(unreadable, 'export const SECRET = 1;\n');
    chmodSync(unreadable, 0o000);
    let readable = true;
    try {
      readFileSync(unreadable);
    } catch {
      readable = false;
    }
    if (readable) {
      console.log('  (skipped the failed-copy check: this user reads files without permission, as root does)');
    } else {
      const trashEntries = () => (existsSync(join(mini, '.diorama-trash', 'projects')) ? readdirSync(join(mini, '.diorama-trash', 'projects')).length : 0);
      const trashBefore = trashEntries();
      const brokenForce = example('sample', '--force', '--no-export');
      assert.ok(brokenForce.code !== 0 && brokenForce.stderr.includes('could not copy examples/sample to projects/sample/') && brokenForce.stderr.includes('projects/sample was left as it was'), `a failed copy says so: ${brokenForce.stderr}`);
      assert.ok(existsSync(join(copy, 'src', 'mine.ts')), 'with --force, the copy that was there stays');
      assert.equal(trashEntries(), trashBefore, 'and nothing went to the trash');
      assert.deepEqual(projectsOf(), ['sample'], 'no half copy and no lock are left in projects/');
      rmSync(copy, { recursive: true });
      const broken = example('sample', '--no-export');
      assert.ok(broken.code !== 0 && broken.stderr.includes('Nothing was left in projects/'), `a failed first copy says so: ${broken.stderr}`);
      assert.deepEqual(projectsOf(), [], 'and leaves no projects/sample that a later run would take for the user\'s');
      // A copy folder that a killed run left behind is removed by the next run (only one runs at a time).
      mkdirSync(join(mini, 'projects', '.sample.copy-99999', 'src'), { recursive: true });
      chmodSync(unreadable, 0o644);
      assert.equal(example('sample', '--no-export').code, 0);
      assert.deepEqual(projectsOf(), ['sample'], 'what a killed copy left is removed');
    }
    chmodSync(unreadable, 0o644);
    rmSync(unreadable);

    // A link at projects/<sample>: --force removes the link only (never what it leads to) and puts a copy there; a link that
    // leads nowhere is refused without --force, before anything is copied.
    rmSync(copy, { recursive: true, force: true });
    const elsewhere = join(mini, 'elsewhere');
    mkdirSync(join(elsewhere, 'src'), { recursive: true });
    writeFileSync(join(elsewhere, 'src', 'kept.ts'), 'export const KEPT = 1;\n');
    symlinkSync(elsewhere, copy);
    assert.ok(example('sample', '--no-export').stdout.includes('already exists'), 'a link to a folder is the user\'s project too');
    const relinked = example('sample', '--force', '--no-export');
    assert.ok(relinked.code === 0 && relinked.stdout.includes('Removed the link projects/sample') && relinked.stdout.includes('the folder it leads to is untouched'), `--force removes the link: ${relinked.stdout} ${relinked.stderr}`);
    assert.ok(!lstatSync(copy).isSymbolicLink() && existsSync(join(copy, 'STYLE.md')), 'and makes a real copy in its place');
    assert.deepEqual(readdirSync(elsewhere), ['src'], 'what the link led to is untouched');
    assert.ok(existsSync(join(elsewhere, 'src', 'kept.ts')));
    assert.ok(!readdirSync(join(mini, 'projects')).some((entry) => entry.startsWith('.sample.')), 'and leaves nothing hidden in projects/');
    rmSync(copy, { recursive: true });
    // --force moves a link aside until the copy is in place: a run killed in between leaves it there, and the next run puts it back.
    symlinkSync(elsewhere, join(mini, 'projects', '.sample.link-1'));
    const swept = example('sample', '--no-export');
    assert.ok(swept.stdout.includes('already exists') && lstatSync(copy).isSymbolicLink() && readlinkSync(copy) === elsewhere, `a link a killed --force run had moved aside goes back to its place: ${swept.stdout} ${swept.stderr}`);
    unlinkSync(copy);
    symlinkSync(join(mini, 'nowhere'), copy);
    const dangling = example('sample', '--no-export');
    assert.ok(dangling.code !== 0 && dangling.stderr.includes('projects/sample is a link to') && dangling.stderr.includes('which does not exist') && dangling.stderr.includes('--force'), `a link that leads nowhere is refused clearly: ${dangling.stderr}`);
    assert.ok(lstatSync(copy).isSymbolicLink(), 'and left alone');
    assert.ok(!existsSync(lockFile), 'a run that fails after taking the lock removes it');
    assert.equal(example('sample', '--force', '--no-export').code, 0, '--force replaces a link that leads nowhere');
    assert.ok(!lstatSync(copy).isSymbolicLink() && !existsSync(join(mini, 'nowhere')));

    // A sample without exports is exported whole; a name that is not a sample, or no sample at all, is an error.
    rmSync(join(shipped, 'assets'), { recursive: true });
    rmSync(copy, { recursive: true });
    const bare = example('sample', '--no-export');
    assert.ok(bare.code === 0 && bare.stdout.includes('npm run export -- projects/sample\n') && !bare.stdout.includes('its exports'), `without exports the copy is exported whole: ${bare.stdout}`);
    rmSync(copy, { recursive: true });
    const changedOnly = example('sample', '--no-export', '--changed');
    assert.ok(changedOnly.code === 0 && changedOnly.stdout.includes('npm run export -- projects/sample --changed\n'), `--changed goes to the export of a fresh copy without exports: ${changedOnly.stdout} ${changedOnly.stderr}`);
    const unknown = example('nope', '--no-export');
    assert.ok(unknown.code !== 0 && unknown.stderr.includes('no sample "nope" in examples/') && unknown.stderr.includes('Samples: sample'), `an unknown sample lists the ones there are: ${unknown.stderr}`);
    const byDefault = example('--no-export');
    assert.ok(byDefault.code !== 0 && byDefault.stderr.includes('no sample "soulkeeper"'), `without a name it is Soulkeeper: ${byDefault.stderr}`);
    assert.ok(!existsSync(lockFile), 'and a run that fails before taking the lock leaves none');
  } finally {
    rmSync(mini, { recursive: true, force: true });
  }
  const exampleHelp = run('npm run --silent example -- --help');
  assert.ok(exampleHelp.code === 0 && exampleHelp.stdout.includes('projects/soulkeeper') && exampleHelp.stdout.includes('--force') && exampleHelp.stdout.includes('--no-export') && exampleHelp.stdout.includes('--changed'), `example --help lists its options: ${exampleHelp.stdout}`);

  // 3b. The export example runs, for real, in this repository: a throwaway sample with one sheet, copied to projects/ and
  // exported whole (it came without exports); run again, the copy is the user's and --changed finds nothing to do; a
  // sample that ships its exports brings them along, and --changed exports only what is out of date (nothing here).
  // A run stopped half way leaves its throwaway sample behind (git-ignored): one cli test runs at a time, so any found goes.
  for (const root of ['examples', 'projects']) {
    for (const entry of readdirSync(root)) if (entry.startsWith('zz-cli-sample-')) rmSync(resolve(root, entry), { recursive: true, force: true });
  }
  const throwaway = `zz-cli-sample-${Date.now()}`;
  const throwawaySample = resolve('examples', throwaway);
  const throwawayCopy = resolve('projects', throwaway);
  try {
    mkdirSync(join(throwawaySample, 'src'), { recursive: true });
    mkdirSync(join(throwawaySample, 'sheets'), { recursive: true });
    writeFileSync(join(throwawaySample, 'src', 'badge.ts'), badgeSource.replace('export default ', 'export const badge = '));
    writeFileSync(join(throwawaySample, 'sheets', 'badge.ts'), "export { badge as default } from '../src/badge';\n");
    const png = join(throwawayCopy, 'assets', 'badge.png');
    const full = cli(['example', throwaway, '--jobs', '1']);
    assert.equal(full.code, 0, `example with its export failed: ${full.stdout} ${full.stderr}`);
    assert.ok(full.stdout.includes(`Exporting projects/${throwaway}: all 1 sheet.`) && !full.stdout.includes(`Exporting projects/${throwaway} with --changed`), `a sample without exports is exported whole: ${full.stdout}`);
    assert.ok(existsSync(png) && full.stdout.includes('badge.png (32x32'), `the export wrote the copy's image: ${full.stdout}`);
    assert.ok(full.stdout.includes(`${throwaway} is ready in projects/${throwaway}/, exported.`));
    assert.ok(!existsSync(join(throwawaySample, 'assets')), 'and nothing into the sample');
    const exportedAt = statSync(png).mtimeMs;
    const kept = cli(['example', throwaway]);
    assert.ok(kept.code === 0 && kept.stdout.includes('already exists') && kept.stdout.includes(`Exporting projects/${throwaway} with --changed`), `an existing copy is exported with --changed: ${kept.stdout} ${kept.stderr}`);
    assert.ok(kept.stdout.includes('--changed: 0 never exported, 0 older than their code, 1 up to date') && kept.stdout.includes('Nothing exported'), `the real export ran with --changed: ${kept.stdout}`);
    assert.equal(statSync(png).mtimeMs, exportedAt, 'nothing up to date is exported again');
    cpSync(join(throwawayCopy, 'assets'), join(throwawaySample, 'assets'), { recursive: true, preserveTimestamps: true });
    rmSync(throwawayCopy, { recursive: true });
    const shippedExports = cli(['example', throwaway]);
    assert.ok(shippedExports.code === 0 && shippedExports.stdout.includes('its exports with their times') && shippedExports.stdout.includes(`Exporting projects/${throwaway} with --changed`) && shippedExports.stdout.includes('1 up to date'), `exports that come along are kept: ${shippedExports.stdout} ${shippedExports.stderr}`);
    assert.ok(Math.abs(statSync(png).mtimeMs - statSync(join(throwawaySample, 'assets', 'badge.png')).mtimeMs) < 1, 'with the time they had in the sample (to the millisecond a copy keeps)');
    assert.ok(!existsSync(resolve('projects', '.example.lock')), 'the run left no lock');
  } finally {
    rmSync(throwawaySample, { recursive: true, force: true });
    rmSync(throwawayCopy, { recursive: true, force: true });
  }

  // 3c. A volume scaffold exports as a direction sheet: 8 rows, the pivot at scale 2, the role in meta.data.
  assert.equal(run(`npm run --silent export -- ${project} props/crate`).code, 0, 'the volume scaffold must export');
  const crate = JSON.parse(readFileSync(resolve(projectDir, 'assets', 'props', 'crate.json'), 'utf8'));
  assert.deepEqual(crate.meta.directions, ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE']);
  assert.deepEqual([crate.meta.width, crate.meta.height, crate.meta.pivot.x, crate.meta.pivot.y, crate.meta.data.role], [128, 1024, 64, 100, 'prop']);

  // 4. Mockup isolation (the review render scenery-test uses): an official export is not changed by a mockup export.
  writeAsset('badge', badgeSource);
  const official = run(`npm run --silent export -- ${project} badge --json`);
  assert.equal(official.code, 0, `official export failed: ${official.stderr}`);
  const officialPath = resolve(projectDir, 'assets', 'badge.png');
  const before = readFileSync(officialPath);

  const mockup = run(`npm run --silent export -- ${project} badge --mockup --json`);
  assert.equal(mockup.code, 0, `mockup export failed: ${mockup.stderr}`);
  const mockupSummary = JSON.parse(mockup.stdout);
  assert.equal(mockupSummary.mode, 'mockup');
  assert.equal(mockupSummary.outputDir, `projects/${project}/review/mockups`);
  assert.ok(existsSync(resolve(projectDir, 'review', 'mockups', 'badge.png')), 'mockup must write to review/mockups/');
  assert.ok(readFileSync(officialPath).equals(before), 'mockup export must not change assets/badge.png');

  // 5. Unknown export options, and values they cannot take, are rejected before anything is rendered.
  for (const flag of ['--preview', '--sheet', '-c', '--jobs 0', '--jobs two', '--changed --grid']) {
    assert.notEqual(run(`npm run --silent export -- ${project} badge ${flag}`).code, 0, `${flag} must be rejected`);
  }

  // 5b. A sheet is drawn at the scale it is exported at, alone and in a group sheet: its pixels are a native render, not a
  // resampled one. The sheet pins scale 2 and fills every other column one device pixel wide; exported at 3, a canvas drawn
  // at 2 and stretched to 3 blurs the stripes and leaves far fewer than half the pixels transparent.
  mkdirSync(resolve(projectDir, 'src', 'scale'), { recursive: true });
  mkdirSync(resolve(projectDir, 'sheets', 'scale'), { recursive: true });
  writeFileSync(resolve(projectDir, 'src', 'scale', 'stripes.ts'), `import { defineAsset } from '@core';

export const stripes = defineAsset({
  width: 8,
  height: 8,
  scale: 2,
  render({ ctx, width, height, scale }) {
    ctx.fillStyle = '#ff0000';
    for (let x = 0; x < width * scale; x += 2) ctx.fillRect(x / scale, 0, 1 / scale, height);
  },
});
`, 'utf8');
  writeFileSync(resolve(projectDir, 'sheets', 'scale', 'stripes.ts'), "export { stripes as default } from '../../src/scale/stripes';\n", 'utf8');
  for (const [args, png] of [['scale/stripes', 'scale/stripes.png'], ['scale/ --grid --sheet-name=stripes-grid', 'scale/stripes-grid.png']]) {
    assert.equal(run(`npm run --silent export -- ${project} ${args} --scale=3`).code, 0, `export ${args} at scale 3`);
    const shot = JSON.parse(run(`npm run --silent inspect -- projects/${project}/assets/${png} --json`).stdout);
    assert.deepEqual([shot.width, shot.transparentShare, shot.distinctOpaqueColors], [24, 0.5, 1], `${png} is drawn at scale 3, not stretched to it`);
  }
  rmSync(resolve(projectDir, 'sheets', 'scale'), { recursive: true });
  rmSync(resolve(projectDir, 'src', 'scale'), { recursive: true });
  rmSync(resolve(projectDir, 'assets', 'scale'), { recursive: true });

  // 6. inspect returns numbers for an official output.
  const inspected = JSON.parse(run(`npm run --silent inspect -- projects/${project}/assets/badge.png --json`).stdout);
  assert.equal(inspected.width, 32);
  assert.equal(inspected.height, 32);
  assert.ok(inspected.distinctOpaqueColors > 0, 'inspect must count opaque colors');

  // 6b. A character sheet reports its loop in inspect, and contact takes a subset of rows and frames.
  const pup = run(`npm run --silent export -- ${project} characters/pup/walk --json`);
  assert.equal(pup.code, 0, `rig export failed: ${pup.stderr}`);
  const pupPng = `projects/${project}/assets/characters/pup/walk.png`;
  const pupInspect = run(`npm run --silent inspect -- ${pupPng}`);
  assert.ok(/motion: clean · loops \(gap 0\)/.test(pupInspect.stdout), `inspect must print the loop status: ${pupInspect.stdout}`);
  assert.ok(pupInspect.stdout.includes('character: pup · this sheet: walk (walk) · 2 clips') && pupInspect.stdout.includes('controls: idle none · move walk · attack: bite'), `inspect must summarize the character manifest: ${pupInspect.stdout}`);
  assert.ok(pupInspect.stdout.includes('no sheet for clip "bite"') && pupInspect.stdout.includes('no idle clip'), 'inspect must report clips without a sheet and manifest warnings');
  assert.equal(JSON.parse(run(`npm run --silent inspect -- ${pupPng} --json`).stdout).motion.loop, true, 'inspect --json must carry the loop flag');

  // The hint needs an atlas whose clip stands still, ends where it starts and has loop false.
  // Scratch files of the test live in review/ (the project's scratch place).
  const loopy = (data: object) => {
    writeFileSync(resolve(projectDir, 'review', 'temp', 'loopy.json'), JSON.stringify({ frames: {}, meta: { data } }), 'utf8');
    return run(`npm run --silent inspect -- projects/${project}/review/temp/loopy.png`);
  };
  mkdirSync(resolve(projectDir, 'review', 'temp'), { recursive: true });
  copyFileSync(resolve(projectDir, 'assets', 'badge.png'), resolve(projectDir, 'review', 'temp', 'loopy.png'));
  const cycle = loopy({ loop: false, groundSpeed: 0, clipKind: 'idle', motion: { loopGap: 0, warnings: [] } });
  assert.ok(cycle.stdout.includes('motion: clean · plays once') && cycle.stdout.includes('pass loop: true to defineClip'), `a closed clip with loop false must get the hint: ${cycle.stdout}`);
  const cycleJson = JSON.parse(run(`npm run --silent inspect -- projects/${project}/review/temp/loopy.png --json`).stdout).motion;
  assert.ok(cycleJson.loop === false && cycleJson.loopGap === 0 && String(cycleJson.hint).includes('pass loop: true to defineClip'), 'inspect --json must carry the loop flag, the gap and the hint');
  assert.ok(!loopy({ loop: false, groundSpeed: 0, clipKind: 'action', events: [{ frame: 4, name: 'hit' }], motion: { loopGap: 0, warnings: [] } }).stdout.includes('hint:'), 'an action (it has events) needs no loop hint');
  assert.ok(loopy({ loop: false, groundSpeed: 0, clipKind: 'action', events: [], motion: { loopGap: 0, warnings: [] } }).stdout.includes('hint:'), 'an engine atlas of a forgotten cycle (clipKind action, no events) gets the hint');
  assert.ok(!loopy({ loop: false, groundSpeed: 0, clipKind: 'idle', motion: { loopGap: 0.4, warnings: [] } }).stdout.includes('hint:'), 'an open clip needs no loop hint');
  assert.ok(loopy({ loop: true, motion: { loopGap: null, warnings: [] } }).stdout.includes('motion: clean · loops\n'), 'a null loopGap prints the loop without a gap');

  // Contact: 4 facings (S, W, N, E) x 4 frames of 224x192 cells. 2x by default, subsets in the name.
  const sheet = (args: string) => JSON.parse(run(`npm run --silent contact -- ${pupPng} ${args} --json`).stdout);
  const pngSize = (rel: string) => {
    const bytes = readFileSync(resolve(rel));
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  };
  const full = sheet('');
  assert.ok(full.file.startsWith(`projects/${project}/review/contact/characters/pup/walk-contact`), `contact writes into review/contact/ at the asset's path: ${full.file}`);
  assert.equal(full.zoom, 2, 'contact defaults to 2x while the sheet stays narrow');
  assert.equal(full.rows, 4);
  assert.deepEqual(pngSize(full.file), { width: 4 * 224 * 2 + 5 * 6, height: 4 * 192 * 2 + 5 * 6 }, 'full sheet at 2x');
  const part = sheet('--rows W,S --frames 0-1');
  assert.ok(part.file.endsWith('walk-contact-W-S-f0-1.png'), `subset must be in the file name: ${part.file}`);
  assert.deepEqual(part.subset, { rows: ['W', 'S'], frames: [0, 1] });
  assert.deepEqual(pngSize(part.file), { width: 2 * 224 * 2 + 3 * 6, height: 2 * 192 * 2 + 3 * 6 }, 'two rows x two frames at 2x');
  assert.ok(existsSync(resolve(full.file)) && existsSync(resolve(part.file)), 'a subset must not overwrite the full sheet');
  assert.ok(sheet('--rows w --frames 0,2 --gray').file.endsWith('walk-contact-W-f0_2-gray.png'), 'rows match any case, a frame list is encoded with "_", gray goes last');
  assert.equal(sheet('--rows N --zoom 1').zoom, 1, 'an explicit --zoom wins');
  assert.notEqual(run(`npm run --silent contact -- ${pupPng} --rows NE`).code, 0, 'contact must reject a direction the sheet lacks');
  assert.notEqual(run(`npm run --silent contact -- ${pupPng} --frames 9`).code, 0, 'contact must reject a frame the sheet lacks');
  assert.notEqual(run(`npm run --silent contact -- ${pupPng} --frames 3-1`).code, 0, 'contact must reject a backwards frame range');
  // A sheet that would pass ~4000px at 2x drops to 1x: 30 cells of 160px.
  writeAsset('wide', `import { defineAsset } from '@core';
import { Polygon } from '@core/draw';

export default defineAsset({
  width: 160,
  height: 32,
  scale: 1,
  frames: 30,
  fps: 12,
  render({ ctx, frameIndex = 0 }) {
    Polygon.circle(8, { cx: 16 + frameIndex * 4, cy: 16 }).draw(ctx, { fill: '#2244ff' });
  },
});
`);
  const wideExport = run(`npm run --silent export -- ${project} wide`);
  assert.equal(wideExport.code, 0, `the wide strip must export: ${wideExport.stderr}`);
  const wide = JSON.parse(run(`npm run --silent contact -- projects/${project}/assets/wide.png --json`).stdout);
  assert.equal(wide.zoom, 1, 'a very wide strip falls back to 1x');
  assert.equal(pngSize(wide.file).width, 30 * 160 + 31 * 6);
  assert.equal(JSON.parse(run(`npm run --silent contact -- projects/${project}/assets/wide.png --frames 0-3 --json`).stdout).zoom, 2, 'a subset of the strip fits at 2x');
  assert.notEqual(run(`npm run --silent contact -- projects/${project}/assets/wide.png --rows W`).code, 0, '--rows needs a direction sheet: a strip has no directions');

  // Contact --with: the same rows and frames of a second sheet, as a band under the first behind a
  // 2px line, with the cells aligned. The rows of a PNG written by contact (no filter) are compared.
  const pixelRows = (rel: string): Buffer[] => {
    const bytes = readFileSync(resolve(rel));
    const idat: Buffer[] = [];
    for (let at = 8; at < bytes.length; at += 12 + bytes.readUInt32BE(at)) {
      if (bytes.toString('ascii', at + 4, at + 8) === 'IDAT') idat.push(bytes.subarray(at + 8, at + 8 + bytes.readUInt32BE(at)));
    }
    const raw = inflateSync(Buffer.concat(idat));
    const stride = pngSize(rel).width * 4 + 1;
    return Array.from({ length: pngSize(rel).height }, (_, y) => raw.subarray(y * stride + 1, (y + 1) * stride));
  };
  const rowsMatch = (whole: Buffer[], from: number, band: Buffer[]) => band.every((row, y) => whole[from + y].equals(row));
  const versus = (args: string, a: string, b: string) => JSON.parse(run(`npm run --silent contact -- ${a} --with ${b} ${args} --json`).stdout);
  writeFileSync(resolve(projectDir, 'review', 'temp', 'walk-before.json'), readFileSync(resolve(pupPng.replace(/\.png$/, '.json'))));
  copyFileSync(resolve(pupPng), resolve(projectDir, 'review', 'temp', 'walk-before.png'));
  const beforePng = `projects/${project}/review/temp/walk-before.png`;
  const onSelf = versus('--rows W,S --frames 0-1', pupPng, beforePng);
  assert.deepEqual({ width: onSelf.width, height: onSelf.height }, { width: part.width, height: 2 * part.height + 2 }, 'two bands of the same size and a 2px line between them');
  assert.ok(onSelf.file.endsWith('walk-vs-temp_walk-before-contact-W-S-f0-1.png') && onSelf.with === beforePng, `the second sheet is in the name: ${onSelf.file}`);
  assert.deepEqual(onSelf.bands.map((b: { rows: number }) => b.rows), [2, 2]);
  const solo = pixelRows(part.file);
  const stacked = pixelRows(onSelf.file);
  assert.ok(rowsMatch(stacked, 0, solo) && rowsMatch(stacked, part.height + 2, solo), 'each band is the plain sheet, cells at the same columns');
  const line = stacked[part.height];
  assert.ok(line.equals(stacked[part.height + 1]) && line.equals(Buffer.alloc(line.length, line.subarray(0, 4))) && !line.equals(stacked[part.height - 1]), 'a plain 2px line, not the gap color, separates the bands');

  // A second character: its own rows and frames come from its own sheet. Without --rows it follows the first sheet's directions
  // (4 here, the wolf has 8); the other way round it cannot, and says so.
  assert.equal(run(`npm run --silent new-asset -- ${project} characters/wolf/walk --engine rig --skeleton quadruped --frames 4`).code, 0);
  assert.equal(run(`npm run --silent export -- ${project} characters/wolf/walk`).code, 0);
  const wolfPng = `projects/${project}/assets/characters/wolf/walk.png`;
  const other = versus('--rows W,S --frames 0-1', pupPng, wolfPng);
  assert.ok(other.file.endsWith('walk-vs-wolf_walk-contact-W-S-f0-1.png'), `a sheet from another folder is named with it: ${other.file}`);
  const wolfSolo = JSON.parse(run(`npm run --silent contact -- ${wolfPng} --rows W,S --frames 0-1 --json`).stdout);
  assert.ok(rowsMatch(pixelRows(other.file), part.height + 2, pixelRows(wolfSolo.file)), 'the bottom band is the second sheet, same rows and frames');
  const followed = versus('', pupPng, wolfPng);
  assert.deepEqual(followed.bands.map((b: { rowOrder: string }) => b.rowOrder), ['S | W | N | E', 'S | W | N | E'], 'the second sheet follows the directions of the first');
  const reversed = run(`npm run --silent contact -- ${wolfPng} --with ${pupPng}`);
  assert.ok(reversed.code !== 0 && reversed.stderr.includes('has no direction "SW"') && reversed.stderr.includes('--rows'), `a sheet with fewer directions must name the way out: ${reversed.stderr}`);
  assert.equal(JSON.parse(run(`npm run --silent contact -- ${wolfPng} --with ${pupPng} --rows W --json`).stdout).rows, 2, '--rows lets the wolf sheet be compared with the pup');

  // Cells of different sizes cannot line up, unless --zoom says each band keeps its own: 224x192 against 32x32.
  const badgePng = `projects/${project}/assets/badge.png`;
  const mismatch = run(`npm run --silent contact -- ${pupPng} --with ${badgePng}`);
  assert.ok(mismatch.code !== 0 && mismatch.stderr.includes('cells differ in size') && mismatch.stderr.includes('--zoom'), `different cell sizes must fail with a clear message: ${mismatch.stderr}`);
  const mixed = versus('--zoom 1', pupPng, badgePng);
  assert.deepEqual({ width: mixed.width, height: mixed.height }, { width: 4 * 224 + 5 * 6, height: (4 * 192 + 5 * 6) + 2 + (32 + 2 * 6) }, 'with --zoom each band keeps its own cell size, left-aligned');
  assert.deepEqual(mixed.bands.map((b: { cell: object }) => b.cell), [{ width: 224, height: 192 }, { width: 32, height: 32 }]);
  assert.notEqual(run(`npm run --silent contact -- ${pupPng} --with=`).code, 0, '--with needs a file');
  assert.notEqual(run(`npm run --silent contact -- ${pupPng} --with projects/${project}/assets/none.png`).code, 0, '--with must reject a missing file');

  // 7. An unknown command is refused, and the CLI lists the commands it has.
  const unknown = run(`npx tsx tools/cli.ts nope ${project}`);
  assert.ok(unknown.code !== 0 && unknown.stderr.includes('unknown command "nope"') && unknown.stderr.includes('npm run new-asset'), `an unknown command must be refused with the list of commands: ${unknown.stderr}`);

  // 8. Named animations reach the atlas; an out-of-range index fails before any PNG is written.
  writeAsset('strip', `import { defineAsset } from '@core';
import { Polygon } from '@core/draw';

export default defineAsset({
  width: 32,
  height: 32,
  scale: 1,
  frames: 2,
  fps: 4,
  animations: { idle: [0, 1] },
  render({ ctx, frameIndex = 0 }) {
    Polygon.circle(8 + frameIndex * 2, { cx: 16, cy: 16 }).draw(ctx, { fill: '#2244ff' });
  },
});
`);
  const strip = run(`npm run --silent export -- ${project} strip --json`);
  assert.equal(strip.code, 0, `strip export failed: ${strip.stderr}`);
  const atlas = JSON.parse(readFileSync(resolve(projectDir, 'assets', 'strip.json'), 'utf8'));
  assert.deepEqual(atlas.meta.animations, { idle: [0, 1] }, 'atlas must carry the named animations');
  assert.equal(atlas.meta.frameCount, 2);

  writeAsset('badstrip', `import { defineAsset } from '@core';

export default defineAsset({
  width: 32,
  height: 32,
  scale: 1,
  frames: 2,
  animations: { idle: [0, 5] },
  render({ ctx }) {},
});
`);
  const bad = run(`npm run --silent export -- ${project} badstrip`);
  assert.notEqual(bad.code, 0, 'an out-of-range animation index must fail the export');
  assert.ok(!existsSync(resolve(projectDir, 'assets', 'badstrip.png')), 'a failed animation must not leave a PNG behind');

  // 9. --help on a subcommand prints its usage and exits 0; without a command it lists them all.
  const help = run('npm run --silent new-asset -- --help');
  assert.equal(help.code, 0, '--help must exit 0');
  assert.ok(help.stdout.includes('--frames') && help.stdout.includes('volume|rig'), '--help must describe the options of the two engines');
  const overview = run('npx tsx tools/cli.ts --help');
  assert.ok(overview.code === 0 && overview.stdout.includes('npm run scenery-items') && overview.stdout.includes('npm run export'), `--help lists the commands: ${overview.stdout}`);

  // 10. The layout checker (npm run layout, and npm run check): each rule fails with a message that says what to move where.
  assert.equal(run(`npm run --silent new-project -- ${layoutProject}`).code, 0);
  const layoutOf = (args = '') => run(`npm run --silent layout -- ${layoutProject} ${args}`);
  const clean = layoutOf();
  assert.ok(clean.code === 0 && clean.stdout.includes('layout follows docs/ARCHITECTURE.md'), `a new project follows the layout: ${clean.stdout}`);
  assert.equal(run(`npm run --silent new-asset -- ${layoutProject} props/crate`).code, 0);
  const unexported = layoutOf();
  assert.ok(unexported.code === 0 && unexported.stdout.includes('not exported yet'), `a sheet without its export is a warning: ${unexported.stdout}`);
  const strict = layoutOf('--strict');
  assert.ok(strict.code !== 0 && strict.stdout.includes('sheets/props/crate.ts has no export yet') && strict.stdout.includes(`npm run export -- ${layoutProject} props/crate`), `--strict fails on it and says how to export it: ${strict.stdout}`);
  // Each broken rule, one at a time: write the file, check the message, remove it.
  const breaks = (file: string, content: string, expected: string[], why: string) => {
    const full = resolve(layoutDir, file);
    mkdirSync(resolve(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
    try {
      const result = layoutOf();
      assert.notEqual(result.code, 0, `${why} must fail the layout check`);
      for (const text of expected) assert.ok(result.stdout.includes(text), `${why}: the message must say "${text}": ${result.stdout}`);
      return result;
    } finally {
      rmSync(full, { force: true });
    }
  };
  breaks('notes.txt', 'todo\n', ['notes.txt is not allowed at the project root', 'README.md or STYLE.md'], 'a stray file at the root');
  breaks('drafts/crate.ts', 'export {};\n', ['drafts/ is not allowed at the project root', 'src/drafts/'], 'a stray folder at the root');
  rmSync(resolve(layoutDir, 'drafts'), { recursive: true, force: true });
  breaks('diorama.config.json', '{"scale": 2, "unknownKey": true}\n', ['diorama.config.json has unknown keys: unknownKey', 'Remove them or fix their spelling', 'allowed keys: outDir, scale, format, cols, gap'], 'an unknown key in diorama.config.json');
  breaks('diorama.config.json', '{', ['is not valid JSON', 'allowed keys: outDir, scale, format, cols, gap'], 'invalid JSON in diorama.config.json');
  breaks('diorama.config.json', '[]', ['must be a JSON object', 'allowed keys: outDir, scale, format, cols, gap'], 'a non-object diorama.config.json');
  writeFileSync(resolve(layoutDir, 'diorama.config.json'), '{"scale": 2, "format": "png"}\n', 'utf8');
  assert.equal(layoutOf().code, 0, 'known keys in diorama.config.json are allowed');
  rmSync(resolve(layoutDir, 'diorama.config.json'));
  breaks('src/_helpers.ts', 'export const x = 1;\n', ['src/_helpers.ts: no underscore prefixes', 'rename it to src/helpers.ts'], 'an underscore file in src/');
  breaks('sheets/_shared.ts', 'export const x = 1;\n', ['sheets/_shared.ts: no underscore prefixes', 'Every file in sheets/ is a sheet'], 'an underscore file in sheets/');
  breaks('src/BigCrate.ts', 'export const x = 1;\n', ['names are kebab-case', 'src/big-crate.ts'], 'a name that is not kebab-case');
  breaks('src/_draft.md', '# Draft\n', ['src/_draft.md: no underscore prefixes', 'rename it to src/draft.md'], 'an underscore markdown file in src/');
  breaks('src/My Notes.md', '# Notes\n', ['names are kebab-case', 'src/my-notes.md'], 'a markdown file with spaces in src/');
  writeFileSync(resolve(layoutDir, 'src', 'README.md'), '# Notes\n', 'utf8');
  writeFileSync(resolve(layoutDir, 'src', 'CHANGELOG.md'), '# Changes\n', 'utf8');
  assert.equal(layoutOf().code, 0, 'markdown files in src/ are allowed');
  rmSync(resolve(layoutDir, 'src', 'README.md'));
  rmSync(resolve(layoutDir, 'src', 'CHANGELOG.md'));
  const fat = `import { defineAsset } from '@core';

export default defineAsset({
  width: 32,
  height: 32,
  render({ ctx }) {
    ctx.fillRect(0, 0, 4, 4);
  },
});
`;
  breaks('sheets/props/fat.ts', fat, ['sheets/props/fat.ts declares a function or a class', 'drawing code lives in src/', "export { fat as default } from '../../src/props/fat'"], 'a sheet with drawing code');
  const long = `import { defineAsset } from '@core';\n\nconst SIZES = [\n${Array.from({ length: 24 }, (_, i) => `  ${i},`).join('\n')}\n];\n\nexport default defineAsset({ width: SIZES.length, height: 1 } as never);\n`;
  breaks('sheets/props/long.ts', long, ['sheets/props/long.ts has 28 lines of code', 'at most 20'], 'a long sheet');
  breaks('src/uses-sheet.ts', "import crate from '../sheets/props/crate';\n\nexport const again = crate;\n", ['src/uses-sheet.ts imports "../sheets/props/crate", a sheet', 'src/ never imports sheets/'], 'src/ importing a sheet');
  breaks('sheets/props/twin.ts', "export { default } from './crate';\n", ['sheets/props/twin.ts imports "./crate", another sheet'], 'a sheet importing a sheet');
  breaks('sheets/gear/helm.ts', "export { crate as default } from '../../src/props/crate';\n", ['has lost its "// Generated by npm run gear-items" first line', `npm run gear-items -- ${layoutProject}`], 'a generated sheet without its header');
  breaks('src/kit/catalog.ts', 'export const KIT = {};\n', ['src/kit/ has a catalog.ts but no index.ts'], 'a kit without its index');
  rmSync(resolve(layoutDir, 'src', 'kit'), { recursive: true, force: true });
  breaks('assets/notes.txt', 'x\n', ['assets/notes.txt: assets/ holds only exported images (PNG) and atlas JSON'], 'a stray file in assets/');
  // Rule 8: a game/ is code and data that plays the exports through the packages. Its own clock, dice and colours are fine.
  const gameDir = resolve(layoutDir, 'game');
  mkdirSync(gameDir, { recursive: true });
  writeFileSync(resolve(gameDir, 'index.html'), '<!DOCTYPE html>\n<div id="game"></div>\n<script type="module" src="./main.ts"></script>\n', 'utf8');
  writeFileSync(resolve(gameDir, 'main.ts'), [
    "import Phaser from 'phaser';",
    "import { withDiorama } from '@diorama/phaser';",
    "import { LEVEL } from './level';",
    '',
    "export const config = withDiorama({ type: Phaser.CANVAS, parent: 'game', backgroundColor: '#102030', scene: [] });",
    'export const seed = Math.random() + Date.now() + LEVEL.length;',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(resolve(gameDir, 'level.ts'), 'export const LEVEL = [1, 2, 3];\n', 'utf8');
  writeFileSync(resolve(gameDir, 'waves.json'), '{ "waves": 3 }\n', 'utf8');
  assert.equal(layoutOf().code, 0, `a game of code and data follows the layout: ${layoutOf().stdout}`);
  breaks('game/hero.png', 'x', ['game/hero.png: game/ holds code and data only (rule 8)', 'images come from assets/, through the packages'], 'an image in game/');
  breaks('game/engine.ts', "import { createRng } from '@core';\n\nexport const rng = createRng(1);\n", ['game/engine.ts imports "@core": a game never imports the engine (rule 8)'], 'a game importing the engine');
  breaks('game/drawing.ts', "export { crate } from '../src/props/crate';\n", ['game/drawing.ts imports "../src/props/crate" (src/props/crate): game/ imports only its own files and packages (rule 8)', 'src/ and sheets/ draw the assets'], 'a game importing src/');
  breaks('src/uses-game.ts', "import { LEVEL } from '../game/level';\n\nexport const levels = LEVEL;\n", ['src/uses-game.ts imports "../game/level" from game/ (rule 8: src/ never imports the game)'], 'src/ importing the game');
  // check type checks game/ (with the packages' types) and does not lint it.
  const gameChecked = JSON.parse(run(`npm run --silent check -- ${layoutProject} --json`).stdout);
  assert.ok(gameChecked.projectErrors.length === 0 && gameChecked.lint.ok && gameChecked.layout.ok, `check passes a game that reads the clock, rolls dice and names its colours: ${JSON.stringify(gameChecked.projectErrors)} ${JSON.stringify(gameChecked.lint.issues)}`);
  writeFileSync(resolve(gameDir, 'broken.ts'), "export const lives: number = 'three';\n", 'utf8');
  const gameBroken = JSON.parse(run(`npm run --silent check -- ${layoutProject} --json`).stdout);
  assert.ok(gameBroken.ok === false && gameBroken.projectErrors.some((e: string) => e.includes('game/broken.ts(1,14): error TS2322')), `check type checks game/: ${JSON.stringify(gameBroken.projectErrors)}`);
  rmSync(gameDir, { recursive: true, force: true });
  // An asset without its sheet is an orphan: a warning, an error with --strict.
  mkdirSync(resolve(layoutDir, 'assets'), { recursive: true });
  writeFileSync(resolve(layoutDir, 'assets', 'ghost.png'), readFileSync(resolve(projectDir, 'assets', 'badge.png')));
  assert.equal(layoutOf().code, 0, 'an orphan asset is only a warning');
  assert.ok(layoutOf('--strict').stdout.includes('assets/ghost.png has no sheet'), 'and --strict names it');
  rmSync(resolve(layoutDir, 'assets', 'ghost.png'));
  // check runs the same rules after the type check, and --json carries the report.
  writeFileSync(resolve(layoutDir, 'scratch.md'), 'x\n', 'utf8');
  const checkBroken = run(`npm run --silent check -- ${layoutProject}`);
  assert.ok(checkBroken.code !== 0 && checkBroken.stdout.includes('no type errors') && checkBroken.stdout.includes('scratch.md is not allowed at the project root'), `check fails on a layout error: ${checkBroken.stdout}`);
  const layoutJson = JSON.parse(layoutOf('--json').stdout);
  assert.ok(layoutJson.ok === false && layoutJson.errors.some((e: { rule: string; path: string }) => e.rule === 'root' && e.path === 'scratch.md'), 'layout --json lists the errors by rule and path');
  rmSync(resolve(layoutDir, 'scratch.md'));
  assert.equal(layoutOf().code, 0, 'and passes again once the file is gone');
  // The sample follows every rule.
  const sample = JSON.parse(run('npm run --silent layout -- examples/soulkeeper --json').stdout);
  assert.ok(sample.ok && sample.errors.length === 0, `examples/soulkeeper follows the layout: ${JSON.stringify(sample.errors.slice(0, 3))}`);

  // 10b. game serves a project's game/ and prints where: it says so of a project without one, and where the exports can be
  // tried in Phaser instead; when this repository's dev server already answers on the port (it says who it is at
  // /__api/server) it only prints the URL, and any other program there, a page server or another checkout's dev server,
  // is an error. The scratch project gets a game for it.
  const noGame = run(`npm run --silent game -- ${layoutProject}`);
  assert.ok(noGame.code !== 0 && noGame.stderr.includes(`${layoutProject} has no game: projects/${layoutProject}/game/index.html does not exist`) && noGame.stderr.includes(`/packages/phaser/demo/?project=${layoutProject}`), `game says a project has no game, and points at the test bench: ${noGame.stderr}`);
  mkdirSync(gameDir, { recursive: true });
  writeFileSync(resolve(gameDir, 'index.html'), '<!DOCTYPE html>\n<div id="game"></div>\n', 'utf8');
  /** Runs `game <the scratch project>` against a server on a free port that answers with `answer`; never throws. */
  const gameAgainst = async (answer: (url: string) => { type: string; body: string }) => {
    const server = createServer((req, res) => {
      const { type, body } = answer(req.url ?? '');
      res.setHeader('Content-Type', type);
      res.end(body);
    });
    await new Promise<void>((done) => server.listen(0, done));
    const port = (server.address() as { port: number }).port;
    try {
      const out = await promisify(execFile)(process.execPath, ['--import', 'tsx', 'tools/cli.ts', 'game', layoutProject, '--port', String(port)], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
      return { port, code: 0, stdout: out.stdout, stderr: out.stderr };
    } catch (err: any) {
      return { port, code: err.code ?? 1, stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? '') };
    } finally {
      server.close();
    }
  };
  const identity = (root: string) => (url: string) => (url.startsWith('/__api/server') ? { type: 'application/json', body: JSON.stringify({ app: 'diorama', root }) } : { type: 'text/html', body: '<!DOCTYPE html>' });
  const ours = await gameAgainst(identity(resolve('.')));
  assert.ok(ours.code === 0 && ours.stdout.includes('already serves the game') && ours.stdout.trim().endsWith(`http://localhost:${ours.port}/projects/${layoutProject}/game/`), `game prints the page's URL when this repository's dev server serves it: ${ours.stdout}${ours.stderr}`);
  const page = await gameAgainst(() => ({ type: 'text/html', body: '<!DOCTYPE html>' }));
  assert.ok(page.code !== 0 && page.stderr.includes(`port ${page.port} is taken by another program: it answers, but it is not this repository's dev server`), `a server that only answers with a page is not the dev server: ${page.stdout}${page.stderr}`);
  const elsewhere = await gameAgainst(identity('/somewhere/else/diorama'));
  assert.ok(elsewhere.code !== 0 && elsewhere.stderr.includes('the dev server of another checkout of Diorama (/somewhere/else/diorama)'), `another checkout's dev server is not this one's: ${elsewhere.stdout}${elsewhere.stderr}`);
  rmSync(gameDir, { recursive: true, force: true });

  // 11. new-kit: each kit's catalog.ts, index.ts and first piece, on a project with a space profile; the generator commands,
  // new-scene and the export work on them, and the project passes check --strict once exported.
  assert.equal(run(`npm run --silent new-project -- ${kitsProject} --genre jrpg`).code, 0);
  const kitFile = (kit: string, name: string) => resolve(kitsDir, 'src', kit, name);
  const firstPieces: [string, string, string, string][] = [
    // kit, family file, generator command, generated sheet
    ['scenery', 'props.ts', 'scenery-items', 'scenery/crate'],
    ['gear', 'heads.ts', 'gear-items', 'gear/helm'],
    ['vfx', 'bursts.ts', 'vfx-items', 'vfx/spark'],
    ['items', 'gems.ts', 'item-icons', 'icons/gem'],
  ];
  for (const [kit, family] of firstPieces) {
    const made = run(`npm run --silent new-kit -- ${kitsProject} ${kit}`);
    assert.equal(made.code, 0, `new-kit ${kit} failed: ${made.stderr}`);
    for (const name of ['catalog.ts', 'index.ts', family]) assert.ok(existsSync(kitFile(kit, name)), `new-kit ${kit} writes src/${kit}/${name}`);
  }
  const sceneryCatalog = readFileSync(kitFile('scenery', 'catalog.ts'), 'utf8');
  assert.ok(sceneryCatalog.includes('space: SPACE') && sceneryCatalog.includes("from '../space'") && sceneryCatalog.includes("defaultMaterials: { wood: 'wood' }"), 'the scenery catalog reads the space profile and maps its role to a theme material');
  assert.ok(readFileSync(kitFile('gear', 'catalog.ts'), 'utf8').includes("id: 'mannequin'") && existsSync(kitFile('gear', 'bodies.ts')), 'the gear kit has a wearer from the start');
  // An existing kit is never overwritten without --force; --force rewrites the kit's files.
  const refusedKit = run(`npm run --silent new-kit -- ${kitsProject} scenery`);
  assert.ok(refusedKit.code !== 0 && refusedKit.stderr.includes('already has a kit') && refusedKit.stderr.includes('--force'), `new-kit must refuse an existing kit: ${refusedKit.stderr}`);
  const propsSource = readFileSync(kitFile('scenery', 'props.ts'), 'utf8');
  writeFileSync(kitFile('scenery', 'props.ts'), `${propsSource}// edited\n`, 'utf8');
  assert.ok(readFileSync(kitFile('scenery', 'catalog.ts'), 'utf8') === sceneryCatalog, 'a refused new-kit changes nothing');
  assert.equal(run(`npm run --silent new-kit -- ${kitsProject} scenery --force`).code, 0);
  assert.equal(readFileSync(kitFile('scenery', 'props.ts'), 'utf8'), propsSource, '--force rewrites the kit');
  const badKit = run(`npm run --silent new-kit -- ${kitsProject} weapons`);
  assert.ok(badKit.code !== 0 && badKit.stderr.includes('"scenery", "gear", "vfx" or "items"'), `an unknown kit is refused with the four kinds: ${badKit.stderr}`);
  for (const [kit, , command, sheet] of firstPieces) {
    const generated = run(`npm run --silent ${command} -- ${kitsProject}`);
    assert.equal(generated.code, 0, `${command} must work on a new ${kit} kit: ${generated.stderr}`);
    assert.ok(existsSync(resolve(kitsDir, 'sheets', `${sheet}.ts`)), `${command} writes sheets/${sheet}.ts`);
  }
  mkdirSync(resolve(kitsDir, 'review', 'temp'), { recursive: true });
  const sceneFile = resolve(kitsDir, 'review', 'temp', 'yard.json');
  // jrpg puts walls on cell borders: the walls grid is one larger each way.
  writeFileSync(sceneFile, JSON.stringify({ cols: 2, rows: 2, floor: [[null, null], [null, null]], walls: [[null, null, null], [null, null, null], [null, null, null]], props: [{ piece: 'crate', col: 0, row: 0 }] }), 'utf8');
  const scene = run(`npm run --silent new-scene -- ${kitsProject} yard --scene ${sceneFile}`);
  assert.equal(scene.code, 0, `new-scene must work on a new scenery kit: ${scene.stderr}`);
  const kitExport = run(`npm run --silent export -- ${kitsProject} scenery/ gear/ vfx/ icons/ scenes/ --json`);
  assert.equal(kitExport.code, 0, `the new kits must export: ${kitExport.stderr}`);
  const kitSummary = JSON.parse(kitExport.stdout);
  assert.deepEqual([kitSummary.typeCheck, kitSummary.successCount, kitSummary.failCount], ['clean', 5, 0], 'the export type checks first, then writes every sheet');
  const kitsStrict = run(`npm run --silent check -- ${kitsProject} --strict`);
  assert.equal(kitsStrict.code, 0, `a project with the four new kits passes check --strict after an export: ${kitsStrict.stdout}`);

  // 11b. --changed exports the sheets whose image is missing or older than their code, and nothing else. The code is the
  // sheet and the local files it imports, however deep: vfx/spark reaches src/vfx/bursts.ts through src/vfx/catalog.ts.
  const kitSheets = ['gear/helm', 'icons/gem', 'scenery/crate', 'scenes/yard', 'vfx/spark'];
  assert.deepEqual(kitSummary.outputs.map((o: { asset: string }) => o.asset), kitSheets, 'the summary lists the sheets by path, however the renders finish');
  const stampAll = (dir: string, secondsAgo: number) => {
    const at = Date.now() / 1000 - secondsAgo;
    for (const rel of readdirSync(dir, { recursive: true }) as string[]) {
      if (statSync(resolve(dir, rel)).isFile()) utimesSync(resolve(dir, rel), at, at);
    }
  };
  // Times are set, not waited for: the code an hour old, the exports half an hour old (the second of slack does not matter).
  stampAll(resolve(kitsDir, 'src'), 3600);
  stampAll(resolve(kitsDir, 'sheets'), 3600);
  stampAll(resolve(kitsDir, 'assets'), 1800);
  const exportChanged = (paths = '') => {
    const result = run(`npm run --silent export -- ${kitsProject} ${paths} --changed --json`);
    assert.equal(result.code, 0, `export --changed failed: ${result.stderr}`);
    return JSON.parse(result.stdout);
  };
  const nothing = exportChanged();
  assert.deepEqual([nothing.outputs, nothing.upToDate, nothing.typeCheck], [[], 5, 'skipped'], 'with every image newer than its code --changed exports nothing, and needs no type check or browser');
  const minuteAgo = Date.now() / 1000 - 60;
  utimesSync(kitFile('vfx', 'bursts.ts'), minuteAgo, minuteAgo);
  const helmPng = resolve(kitsDir, 'assets', 'gear', 'helm.png');
  const helmTime = statSync(helmPng).mtimeMs;
  const touched = exportChanged();
  assert.deepEqual([touched.outputs.map((o: { asset: string }) => o.asset), touched.upToDate, touched.typeCheck], [['vfx/spark'], 4, 'clean'], 'a file two imports down makes its sheet out of date, and only that one; the type check runs before it is exported');
  assert.equal(statSync(helmPng).mtimeMs, helmTime, 'an up-to-date sheet is not written again');
  assert.deepEqual(exportChanged().outputs, [], 'once exported, the sheet is up to date');
  rmSync(resolve(kitsDir, 'assets', 'icons', 'gem.png'));
  assert.deepEqual(exportChanged('icons/ scenery/').outputs.map((o: { asset: string }) => o.asset), ['icons/gem'], 'a sheet without its image is exported; paths narrow --changed as they narrow any export');

  // --jobs: the sheets render side by side in pages kept open, and any number of them writes the same files as one.
  const assetBytes = () => {
    const dir = resolve(kitsDir, 'assets');
    return new Map((readdirSync(dir, { recursive: true }) as string[]).filter(rel => statSync(resolve(dir, rel)).isFile()).sort().map(rel => [rel, readFileSync(resolve(dir, rel))]));
  };
  const exportJobs = (jobs: number) => {
    const result = run(`npm run --silent export -- ${kitsProject} --jobs ${jobs} --json`);
    assert.equal(result.code, 0, `export --jobs ${jobs} failed: ${result.stderr}`);
    return { summary: JSON.parse(result.stdout), files: assetBytes() };
  };
  const oneLane = exportJobs(1);
  const threeLanes = exportJobs(3);
  assert.deepEqual([...threeLanes.files.keys()], [...oneLane.files.keys()], '--jobs 3 writes the files --jobs 1 writes');
  for (const [rel, bytes] of oneLane.files) assert.ok(threeLanes.files.get(rel)!.equals(bytes), `assets/${rel} is the same byte for byte with --jobs 3 and --jobs 1`);
  assert.deepEqual(threeLanes.summary.outputs.map((o: { asset: string }) => o.asset), oneLane.summary.outputs.map((o: { asset: string }) => o.asset), 'and the summary is in the same order');
  assert.deepEqual(oneLane.summary.outputs.map((o: { asset: string }) => o.asset), kitSheets);
  // The tip to combine sheets with --grid is for a person at a terminal: a program reading the output through a pipe (the
  // viewer) never gets it.
  const piped = spawnSync(process.execPath, [resolve('node_modules', 'tsx', 'dist', 'cli.mjs'), resolve('tools', 'export.ts'), kitsProject, 'icons/', 'scenery/'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: undefined } });
  assert.ok(piped.status === 0 && piped.stdout.includes('Summary: 2 outputs'), `a piped export of two sheets works: ${piped.stdout} ${piped.stderr}`);
  assert.ok(!`${piped.stdout}${piped.stderr}`.includes('Tip:'), `through a pipe the export prints no tip about --grid: ${piped.stdout}`);
  // Without a space profile the scenery catalog takes the theme's camera and a grid of its own.
  assert.equal(run(`npm run --silent new-project -- ${bareKitsProject}`).code, 0);
  for (const kit of ['scenery', 'vfx']) assert.equal(run(`npm run --silent new-kit -- ${bareKitsProject} ${kit}`).code, 0);
  assert.ok(readFileSync(resolve(bareKitsDir, 'src', 'scenery', 'catalog.ts'), 'utf8').includes('grid: Grid.fromScreen(CAMERA, 48, 36)'), 'no space profile: the theme camera and a 48 × 36 grid');
  const bareCheck = run(`npm run --silent check -- ${bareKitsProject}`);
  assert.equal(bareCheck.code, 0, `kits without a space profile type check: ${bareCheck.stdout}`);

  // 12. export refuses a project with type errors (the type check of npm run check runs first) and --force exports it anyway.
  const brokenLine = propsSource.split('\n').length;
  writeFileSync(kitFile('scenery', 'props.ts'), `${propsSource}export const broken: number = 'not a number';\n`, 'utf8');
  const cratePng = resolve(kitsDir, 'assets', 'scenery', 'crate.png');
  rmSync(cratePng);
  const refusedExport = run(`npm run --silent export -- ${kitsProject} scenery/`);
  assert.notEqual(refusedExport.code, 0, 'an export with a type error must fail');
  assert.ok(refusedExport.stderr.includes('1 type error(s), so nothing was exported') && refusedExport.stderr.includes(`src/scenery/props.ts(${brokenLine},14): error TS2322`) && refusedExport.stderr.includes('--force'), `it prints the errors and the way out: ${refusedExport.stderr}`);
  const readByViewer = exportTypeErrors(refusedExport.stderr)?.map((line) => line.replace(/\\/g, '/'));
  assert.ok(readByViewer?.length === 1 && readByViewer[0].endsWith(`src/scenery/props.ts(${brokenLine},14): error TS2322: Type 'string' is not assignable to type 'number'.`), `the viewer reads this refusal (viewer/src/lib/export-errors.ts): keep the two in step: ${JSON.stringify(readByViewer)}`);
  assert.ok(!existsSync(cratePng), 'a refused export writes nothing');
  const refusedJson = JSON.parse(run(`npm run --silent export -- ${kitsProject} scenery/ --json`).stdout);
  assert.ok(refusedJson.typeCheck === 'failed' && refusedJson.typeErrors.length === 1 && refusedJson.outputs.length === 0, 'export --json carries the type errors');
  const forced = run(`npm run --silent export -- ${kitsProject} scenery/ --force --json`);
  assert.equal(forced.code, 0, `--force exports a project with type errors: ${forced.stderr}`);
  assert.ok(JSON.parse(forced.stdout).typeCheck === 'skipped' && existsSync(cratePng), 'with --force the check is skipped and the sheet written');
  // scenery-test is a review render: it does not stop on the project's type errors.
  assert.equal(run(`npm run --silent scenery-test -- ${kitsProject} crate`).code, 0, 'scenery-test renders while the project has a type error');
  writeFileSync(kitFile('scenery', 'props.ts'), propsSource, 'utf8');

  // 13. check reports what makes an export non-deterministic, with the file, the line and what to use instead; comments do not count,
  // and color literals are allowed in src/theme.ts only.
  writeFileSync(kitFile('scenery', 'noise.ts'), [
    "// Math.random(), new Date() and '#ff0000' in a comment do not count.",
    '/** Nor rgba(0, 0, 0, 0.5) in a doc comment. */',
    'export const jitter = Math.random();',
    'export const stamp = Date.now() + performance.now();',
    'export const born = new Date();',
    "export const tint = { fill: '#ff0000', shade: `rgba(${jitter}, 2, 3, 0.5)` };",
    "export const label = 'Math.random in a string is not a call';",
    "import { createRng } from '@core';",
    "export const rolls = [createRng(), createRng('crate'), createRng(7)];",
    '',
  ].join('\n'), 'utf8');
  writeFileSync(resolve(kitsDir, 'sheets', 'swatch.ts'), "export default { color: 'hsl(10, 50%, 50%)' };\n", 'utf8');
  const noisy = run(`npm run --silent check -- ${kitsProject} --json`);
  assert.notEqual(noisy.code, 0, 'check must fail on non-deterministic code');
  const lint = JSON.parse(noisy.stdout).lint as { ok: boolean; issues: { rule: string; path: string; line: number; message: string }[] };
  const found = lint.issues.map(i => `${i.path}:${i.line}:${i.rule}`);
  assert.deepEqual(found, [
    'src/scenery/noise.ts:3:random',
    'src/scenery/noise.ts:4:clock',
    'src/scenery/noise.ts:4:clock',
    'src/scenery/noise.ts:5:clock',
    'src/scenery/noise.ts:6:color',
    'src/scenery/noise.ts:6:color',
    'src/scenery/noise.ts:9:random',
    'sheets/swatch.ts:1:color',
  ], 'each pattern is found once, in code and strings only, never in comments or src/theme.ts; a seeded createRng is fine');
  const say = (line: number, rule: string) => lint.issues.filter(i => i.line === line && i.rule === rule).map(i => i.message).join(' | ');
  assert.ok(say(3, 'random').startsWith('src/scenery/noise.ts:3: Math.random') && say(3, 'random').includes('createRng(seed)'), `Math.random points at createRng: ${say(3, 'random')}`);
  assert.ok(say(4, 'clock').includes('Date.now reads the clock') && say(4, 'clock').includes('performance.now reads the clock') && say(5, 'clock').includes('new Date') && say(5, 'clock').includes('frameIndex'), `the clock points at frameIndex and createRng: ${say(4, 'clock')}`);
  assert.ok(say(9, 'random').includes('createRng() without a seed'), `an unseeded createRng is reported: ${say(9, 'random')}`);
  assert.ok(say(6, 'color').includes('"#ff0000" is a raw color') && say(6, 'color').includes('"rgba(...)"') && say(6, 'color').includes('src/theme.ts'), `raw colors point at the theme: ${say(6, 'color')}`);
  assert.ok(noisy.stdout.includes('"ok": false') && run(`npm run --silent check -- ${kitsProject}`).stdout.includes('8 determinism problem(s)'), 'the text report counts them');
  rmSync(kitFile('scenery', 'noise.ts'));
  rmSync(resolve(kitsDir, 'sheets', 'swatch.ts'));
  // The sample is deterministic.
  const sampleCheck = JSON.parse(run('npm run --silent check -- examples/soulkeeper --json').stdout);
  assert.ok(sampleCheck.lint.ok && sampleCheck.lint.issues.length === 0 && sampleCheck.projectErrors.length === 0, `examples/soulkeeper passes the type check and the determinism lint: ${JSON.stringify(sampleCheck.projectErrors.slice(0, 3))} ${JSON.stringify(sampleCheck.lint.issues.slice(0, 3))}`);

  console.log('✔ new-project, new-asset (volume and rig), new-kit, check (types, layout, determinism), layout (rule 8 included), game, list, example, export (incl. --mockup, the type check, --changed and --jobs), inspect and contact behave as documented.\n');
} finally {
  rmSync(projectDir, { recursive: true, force: true });
  rmSync(layoutDir, { recursive: true, force: true });
  rmSync(kitsDir, { recursive: true, force: true });
  rmSync(bareKitsDir, { recursive: true, force: true });
}
