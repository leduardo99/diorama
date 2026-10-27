import assert from 'node:assert/strict';
import { CLI_COMMANDS, cliArgs } from '../../server/src/cli-args';

console.log('🧪 Checking the commands the viewer runs as jobs: every one names its project as projects/<name>...\n');

// The viewer's projects are those of projects/ alone. A bare name would make a command look in projects/, then examples/,
// so with no project of that name left (deleted in another tab) a save would land in the shipped sample: every command
// that works on a project must get it as projects/<name>, never as a bare name and never as examples/<name>.
const project = 'soulkeeper';
const outfitFile = '/tmp/diorama-outfit-x/outfit.json';
const requests: Record<(typeof CLI_COMMANDS)[number], Record<string, unknown>> = {
  'new-project': { command: 'new-project', name: 'my-game', style: true },
  'new-asset': { command: 'new-asset', project, subpath: 'props/crate', engine: 'volume', frames: '1', size: '64x64', fps: '6' },
  'new-kit': { command: 'new-kit', project, kit: 'gear' },
  'new-outfit-character': { command: 'new-outfit-character', project, name: 'squire', from: 'knight', force: true },
  'new-scene': { command: 'new-scene', project, name: 'crypt', force: true },
  'gear-items': { command: 'gear-items', project, force: true },
  export: { command: 'export', project, subpath: 'gear/', sheet: 'grid', gap: '8' },
  example: { command: 'example', project: 'elsewhere', force: true },
};
assert.deepEqual(Object.keys(requests).sort(), [...CLI_COMMANDS].sort(), 'every command the endpoint runs is checked here');

const built = Object.fromEntries(CLI_COMMANDS.map((command) => [command, cliArgs(requests[command], outfitFile)])) as Record<(typeof CLI_COMMANDS)[number], string[]>;
// The commands that work on a project: the project is the argument right after the command, as projects/<name>.
for (const command of ['new-asset', 'new-kit', 'new-outfit-character', 'new-scene', 'gear-items'] as const) {
  assert.deepEqual(built[command].slice(0, 3), ['tools/cli.ts', command, `projects/${project}`], `${command} names projects/${project}: ${built[command].join(' ')}`);
}
assert.deepEqual(built.export.slice(0, 2), ['tools/export.ts', `projects/${project}`], `export names projects/${project}: ${built.export.join(' ')}`);
for (const [command, args] of Object.entries(built)) {
  assert.ok(!args.some((arg) => arg === project || arg.startsWith('examples/')), `${command} never names a project bare or a sample: ${args.join(' ')}`);
}
// new-project only ever creates projects/<name>; example copies the sample to projects/soulkeeper, never with --force
// from the viewer (an existing copy is the user's), whatever the request says.
assert.deepEqual(built['new-project'], ['tools/cli.ts', 'new-project', 'my-game', '--style']);
assert.deepEqual(built.example, ['tools/cli.ts', 'example']);
assert.deepEqual(built['new-scene'].slice(3), ['crypt', '--scene', outfitFile, '--force'], 'the scene travels as the file the handler saved');
assert.deepEqual(built.export.slice(2), ['gear/', '--grid', '--gap=8']);

// What could be read as a path or a flag is refused before anything runs: a sample by path, a parent, a dot name, a flag.
for (const bad of ['examples/soulkeeper', 'projects/soulkeeper', '../soulkeeper', 'a\\b', '.hidden', '-rf', '', '  ']) {
  for (const command of ['new-asset', 'gear-items', 'export'] as const) {
    assert.throws(() => cliArgs({ ...requests[command], project: bad }, outfitFile), Error, `${command} refuses the project ${JSON.stringify(bad)}`);
  }
}
assert.throws(() => cliArgs({ ...requests['new-asset'], subpath: '--force' }), /cannot start with "-"/, 'a value cannot be a flag');
assert.deepEqual(cliArgs({ command: 'export', project, subpaths: ['props/crate', 'gear/'] }), ['tools/export.ts', `projects/${project}`, 'props/crate', 'gear/'], 'an export of several sheets is one run');
assert.throws(() => cliArgs({ command: 'export', project, subpaths: ['props/crate', '--force'] }), /cannot start with "-"/, 'no subpath of the list can be a flag');
assert.throws(() => cliArgs({ ...requests['new-scene'] }), /scene is required/, 'a scene needs the file the handler saved');
assert.throws(() => cliArgs({ command: 'rm' }), /command must be/, 'an unknown command is refused');

// The kind of game of a new project: --genre with the preset (the script checks it), and the height with it.
assert.deepEqual(cliArgs({ command: 'new-project', name: 'my-game', genre: 'tactics', character: '64' }), ['tools/cli.ts', 'new-project', 'my-game', '--genre', 'tactics', '--character', '64']);
assert.deepEqual(cliArgs({ command: 'new-project', name: 'my-game', genre: 'jrpg' }), ['tools/cli.ts', 'new-project', 'my-game', '--genre', 'jrpg'], 'the default height is the script\'s');
assert.deepEqual(cliArgs({ command: 'new-project', name: 'my-game', genre: '', character: '64' }), ['tools/cli.ts', 'new-project', 'my-game'], 'no kind of game yet: no profile, and no height without one');
assert.throws(() => cliArgs({ command: 'new-project', name: 'my-game', genre: '--force' }), /cannot start with "-"/, 'the genre cannot be a flag');
assert.throws(() => cliArgs({ command: 'new-project', name: 'my-game', genre: 'jrpg', character: '-5' }), /cannot start with "-"/, 'nor the height');

// new-kit starts one of the kits in a project of projects/.
assert.deepEqual(cliArgs({ command: 'new-kit', project, kit: 'scenery' }), ['tools/cli.ts', 'new-kit', `projects/${project}`, 'scenery']);
assert.throws(() => cliArgs({ command: 'new-kit', project, kit: 'weapons' }), /kit must be scenery, gear, vfx, items/, 'only the kits new-kit knows');
assert.throws(() => cliArgs({ command: 'new-kit', project: '../x', kit: 'gear' }), /project must be the name/, 'and only in a project of projects/');

console.log('✅ Job argument checks passed');
