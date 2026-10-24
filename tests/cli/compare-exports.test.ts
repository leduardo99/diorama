import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

console.log('🧪 Checking npm run compare-exports (identical, different, missing and new files; JSON compared by value)...\n');

const root = mkdtempSync(join(tmpdir(), 'diorama-compare-'));
const before = join(root, 'before');
const after = join(root, 'after');
const put = (dir: string, file: string, body: string | Buffer) => {
  mkdirSync(join(dir, file, '..'), { recursive: true });
  writeFileSync(join(dir, file), body);
};
const run = () => spawnSync('npx', ['tsx', 'scripts/compare-exports.ts', '--before', before, '--after', after], { encoding: 'utf8' });

try {
  for (const dir of [before, after]) {
    put(dir, 'props/crate.png', Buffer.from([137, 80, 78, 71, 1, 2, 3]));
    put(dir, 'props/crate.json', '{"meta":{"a":1,"b":[1,2]}}');
  }
  // The same JSON written with another key order and spacing is the same atlas.
  put(after, 'props/crate.json', '{ "meta": { "b": [1, 2], "a": 1 } }');
  let r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2 of 2 files identical/);
  assert.match(r.stdout, /The exports are unchanged/);

  put(after, 'props/crate.png', Buffer.from([137, 80, 78, 71, 1, 2, 4]));
  put(after, 'props/barrel.png', Buffer.from([1]));
  put(before, 'props/urn.png', Buffer.from([2]));
  r = run();
  assert.equal(r.status, 1, 'a difference fails the command');
  assert.match(r.stdout, /Different: 1\n {2}props\/crate\.png/);
  assert.match(r.stdout, /Missing after the change: 1\n {2}props\/urn\.png/);
  assert.match(r.stdout, /New after the change: 1\n {2}props\/barrel\.png/);

  put(after, 'props/crate.json', '{"meta":{"a":2,"b":[1,2]}}');
  assert.match(run().stdout, /Different: 2/, 'a changed value in an atlas is a difference');

  const usage = spawnSync('npx', ['tsx', 'scripts/compare-exports.ts', '--before', before], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /--before and --after go together/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('✅ compare-exports checks passed');
