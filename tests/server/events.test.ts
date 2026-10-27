import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createApp, type CommandRunner } from '../../server/src/app';
import { EventHub, catalogProjectOf, watchCatalog, type ChangeSource } from '../../server/src/events';
import type { ServerEvent } from '../../server/src/contract';
import { EXAMPLE_LOCK } from '../../tools/lock';

console.log('🧪 Checking the events of server/ (catalog.changed, example.changed, the SSE stream)...\n');

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A change source the test drives: `fire(path)` is a file change, as Vite's watcher or fs.watch would report it. */
function fakeChanges() {
  const listeners = new Set<(path: string) => void>();
  const source: ChangeSource = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return { source, fire: (path: string) => listeners.forEach((l) => l(path)), get count() { return listeners.size; } };
}

// 1. Which changes the catalog shows, and for which project.
{
  const cases: Array<[string, string | undefined]> = [
    ['projects/demo/assets/props/crate.png', 'demo'],
    ['projects/demo/sheets/props/crate.ts', 'demo'],
    ['projects/demo/src/theme.ts', 'demo'],
    ['projects/demo', 'demo'],
    ['projects/demo/review/contact.png', undefined],
    ['projects/demo/game/main.ts', undefined],
    ['projects/demo/STYLE.md', undefined],
    ['projects/.soulkeeper-copy/assets/x.png', undefined],
    ['projects/.soulkeeper-copy', undefined],
    ['projects/README.md', undefined],
    ['examples/soulkeeper/assets/x.png', undefined],
    ['core/volume/stage.ts', undefined],
  ];
  for (const [rel, project] of cases) assert.equal(catalogProjectOf(rel), project, rel);
}

// 2. The watch groups changes: one catalog.changed per group, each project once, sorted; the lock goes to onLock.
{
  const root = '/repo';
  const hub = new EventHub();
  const events: ServerEvent[] = [];
  hub.subscribe((e) => events.push(e));
  const changes = fakeChanges();
  let locks = 0;
  const stop = watchCatalog({ root, changes: changes.source, hub, lock: EXAMPLE_LOCK, onLock: () => locks++, groupMs: 40 });
  changes.fire('/repo/projects/b/assets/one.png');
  changes.fire('/repo/projects/a/sheets/two.ts');
  changes.fire('/repo/projects/b/assets/three.png');
  changes.fire('/repo/projects/b/review/four.png');
  changes.fire('/repo/projects/.copy/assets/five.png');
  assert.equal(events.length, 0, 'nothing is sent before the group ends');
  await wait(80);
  assert.deepEqual(events, [{ event: 'catalog.changed', data: { projects: ['a', 'b'] } }], 'one event for the group, each project once');
  changes.fire('/repo/projects/c/src/x.ts');
  await wait(80);
  assert.deepEqual(events[1], { event: 'catalog.changed', data: { projects: ['c'] } }, 'a later change starts a new group');
  changes.fire(`/repo/${EXAMPLE_LOCK}`);
  await wait(80);
  assert.equal(locks, 1, 'the lock is reported');
  assert.equal(events.length, 2, 'and is no catalog change');
  // A steady stream of changes still reports every group: the clock starts at the first change, not the last.
  for (let i = 0; i < 6; i++) {
    changes.fire('/repo/projects/d/assets/x.png');
    await wait(15);
  }
  assert.ok(events.length >= 3, 'a long run of changes is reported while it goes on');
  stop();
  assert.equal(changes.count, 0, 'stopping the watch stops listening');
}

// 3. The SSE stream of the app: the events of a job, in order and in the contract's shapes; catalog and example
// changes; the keep-alive comment.
const root = mkdtempSync(join(tmpdir(), 'diorama-events-'));
const put = (rel: string, content = 'x') => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};
put('projects/demo/sheets/props/crate.ts', 'export {};');

let release: (() => void) | undefined;
const run: CommandRunner = (args, _options, onProgress) =>
  new Promise((resolveRun) => {
    release = () => {
      onProgress?.({ done: 1, total: 2, current: 'props/crate' });
      onProgress?.({ done: 2, total: 2, current: 'props/lamp' });
      resolveRun({ ok: true, output: `ran ${args.join(' ')}` });
    };
  });
const changes = fakeChanges();
const app = createApp({ root, run, changes: changes.source, heartbeatMs: 30 });

/** Reads the event stream as it comes: the events parsed, and every raw line. */
async function openStream() {
  const res = await app.request('/__api/events');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ event: string; data: any }> = [];
  const raw: string[] = [];
  let buffer = '';
  void (async () => {
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let at: number;
      while ((at = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        raw.push(block);
        const name = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (name && data) events.push({ event: name, data: JSON.parse(data) });
      }
    }
  })();
  return { events, raw, close: () => reader.cancel() };
}

try {
  const stream = await openStream();
  await wait(10);
  assert.ok(stream.raw[0]?.includes('retry: 2000'), `the stream opens at once and says how soon to reconnect: ${stream.raw[0]}`);

  const queued = await app.request('/__api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'export', project: 'demo', subpath: 'props/' }) });
  assert.equal(queued.status, 202);
  const { job } = (await queued.json()) as { job: { id: string } };
  await wait(10);
  release!();
  await wait(20);
  const jobEvents = stream.events.filter((e) => e.event.startsWith('job.'));
  assert.deepEqual(jobEvents.map((e) => e.event), ['job.queued', 'job.started', 'job.progress', 'job.progress', 'job.finished']);
  assert.deepEqual(jobEvents[0].data.job.subpaths, ['props/']);
  assert.deepEqual(jobEvents[2].data, { id: job.id, progress: { done: 1, total: 2, current: 'props/crate' } });
  assert.equal(jobEvents[4].data.job.state, 'succeeded');
  assert.equal(jobEvents[4].data.job.output, 'ran tools/export.ts projects/demo props/ --progress', 'a job of POST /__api/jobs exports with --progress');

  // catalog.changed reaches the stream.
  changes.fire(join(root, 'projects', 'demo', 'assets', 'props', 'crate.png'));
  await wait(250);
  assert.deepEqual(stream.events.filter((e) => e.event === 'catalog.changed').map((e) => e.data), [{ projects: ['demo'] }]);

  // example.changed follows the lock another process takes and releases, and only when the state changes.
  put(EXAMPLE_LOCK, JSON.stringify({ pid: process.pid, startedAt: '2026-10-27T10:00:00.000Z', command: 'npm run example' }));
  changes.fire(join(root, EXAMPLE_LOCK));
  changes.fire(join(root, EXAMPLE_LOCK));
  await wait(10);
  rmSync(join(root, EXAMPLE_LOCK));
  changes.fire(join(root, EXAMPLE_LOCK));
  await wait(10);
  assert.deepEqual(stream.events.filter((e) => e.event === 'example.changed').map((e) => e.data), [
    { running: true, startedAt: '2026-10-27T10:00:00.000Z' },
    { running: false },
  ], 'the run started elsewhere, then ended: two events, however many times the lock was seen');

  // A quiet stream gets its keep-alive comment.
  const before = stream.raw.length;
  await wait(80);
  assert.ok(stream.raw.slice(before).some((block) => block.startsWith(': keep-alive')), 'a quiet stream is kept alive');

  // The stream answers GET alone.
  assert.equal((await app.request('/__api/events', { method: 'POST' })).status, 405);
  await stream.close();
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('✅ Event checks passed');
