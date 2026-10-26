import assert from 'node:assert/strict';
import { clipToAdd, exportFailureText, exportTypeErrors } from '../../viewer/src/lib/export-errors';

console.log('🧪 Checking how the viewer reads a failed export (type errors it cannot --force, other tails)...\n');

// What tools/export.ts prints on stderr when the project's type check refuses the export
// (tests/cli/cli.test.ts pins this format), with the cli endpoint's stdout part before it.
const refused = [
  'Exporting soulkeeper…',
  '',
  'Error: soulkeeper has 2 type error(s), so nothing was exported:',
  "  src/characters/guard.ts(3,14): error TS2322: Type 'string' is not assignable to type 'number'.",
  "  sheets/props/crate.ts(11,2): error TS2304: Cannot find name 'Crate'.",
  'Fix them (npm run check -- soulkeeper lists them with the layout rules), or pass --force to export anyway.',
].join('\n');

// 1. The refusal gives the whole error list, trimmed, and nothing of the CLI's own wording.
const errors = exportTypeErrors(refused);
assert.deepEqual(errors, [
  "src/characters/guard.ts(3,14): error TS2322: Type 'string' is not assignable to type 'number'.",
  "sheets/props/crate.ts(11,2): error TS2304: Cannot find name 'Crate'.",
], 'the file:line list is read out of the refusal');

// 2. What a toast or alert shows instead: the localized line, then the list; never the --force hint.
const text = exportFailureText(refused, 'Fix these type errors to export');
assert.ok(text.startsWith('Fix these type errors to export\n'), 'the localized line leads');
assert.ok(text.includes('src/characters/guard.ts(3,14)') && text.includes('sheets/props/crate.ts(11,2)'), 'every error is listed');
assert.ok(!text.includes('--force') && !text.includes('npm run check'), 'no flag the viewer cannot pass');

// 3. A single error and a project name that is not the one asked for still parse.
const one = 'Error: other-project has 1 type error(s), so nothing was exported:\n  src/a.ts(1,1): error TS1005: \',\' expected.\nFix them (npm run check -- other-project lists them with the layout rules), or pass --force to export anyway.';
assert.deepEqual(exportTypeErrors(one), ["src/a.ts(1,1): error TS1005: ',' expected."], 'one error is read too');

// 4. Colours and Windows line ends, as the exporter's output can carry them, still parse.
const painted = refused.replace('Error: soulkeeper', '\x1b[31m\nError: soulkeeper').replace('Fix them', '\x1b[39m\x1b[33mFix them').replace(/\n/g, '\r\n');
assert.deepEqual(exportTypeErrors(painted), errors, 'ANSI colours and CRLF are ignored');

// 5. Any other failure keeps the old behaviour: the output's last four lines.
const other = 'line one\nline two\nline three\nline four\nline five\nError: sheet props/nope.ts has no default export.';
assert.equal(exportTypeErrors(other), null, 'a render failure is not a type refusal');
assert.equal(exportFailureText(other, 'Fix these type errors to export'), 'line three\nline four\nline five\nError: sheet props/nope.ts has no default export.', 'other failures show the output tail');
assert.equal(exportTypeErrors(''), null, 'empty output parses to nothing');

// 6. A clip added to a character that exists: new-asset says what to add to its clips (as it prints it, in colour), and a first clip asks for nothing.
const step = "Add the clip to `clips` in projects/zz/src/characters/hero/character.ts: 'hit': hit(skeleton) (import hit from '@core/rig'). Until it is there, the sheet's character.sheet('hit') is a type error.";
const added = `\x1b[32mCreated projects/zz/sheets/characters/hero/hit.ts\x1b[39m\r\n\x1b[33m${step}\x1b[39m\r\nExport it with: npm run export -- zz characters/hero/hit`;
assert.equal(clipToAdd(added), step, 'the step, without colours');
assert.equal(clipToAdd('Created projects/zz/src/characters/hero/character.ts\nCreated projects/zz/sheets/characters/hero/idle.ts\nExport it with: npm run export -- zz characters/hero/idle'), undefined, 'a first clip needs nothing more');

console.log('\n✅ export failure text checks passed');
