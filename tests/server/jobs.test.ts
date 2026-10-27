import assert from 'node:assert/strict';
import { EventHub } from '../../server/src/events';
import { FINISHED_KEPT, JobQueue, parseProgressLine, type CommandResult, type JobRequest } from '../../server/src/jobs';
import type { JobProgress, ServerEvent } from '../../server/src/contract';
import { runCommand } from '../../server/src/app';

console.log('🧪 Checking the job queue of server/ (one job per project, one export at a time, events)...\n');

/** A runner whose commands end when the test says: each call waits for its own release. */
function controlledRunner() {
  const calls: Array<{ args: string[]; onProgress: (p: JobProgress) => void; end: (r: CommandResult) => void; fail: (e: Error) => void }> = [];
  const run = (args: string[], onProgress: (p: JobProgress) => void) =>
    new Promise<CommandResult>((end, fail) => calls.push({ args, onProgress, end, fail }));
  return { calls, run };
}

const settle = () => new Promise((r) => setImmediate(r));

let cleaned: string[] = [];
const request = (command: JobRequest['command'], project: string, ...args: string[]): JobRequest => ({
  command, project, subpaths: [], args: [command, project, ...args], cleanup: () => { cleaned.push(`${command}:${project}:${args.join(' ')}`); },
});

function setup() {
  const hub = new EventHub();
  const events: ServerEvent[] = [];
  hub.subscribe((e) => events.push(e));
  const runner = controlledRunner();
  let tick = 0;
  const queue = new JobQueue({ hub, run: runner.run, now: () => `t${++tick}` });
  cleaned = [];
  return { hub, events, runner, queue };
}

const states = (queue: JobQueue) => Object.fromEntries(queue.list().map((j) => [j.id, j.state]));

// 1. Jobs of one project run one at a time, in the order they arrived.
{
  const { runner, queue } = setup();
  const a1 = queue.submit(request('new-asset', 'a', 'props/one'));
  const a2 = queue.submit(request('new-asset', 'a', 'props/two'));
  await settle();
  assert.deepEqual(states(queue), { [a1.job.id]: 'running', [a2.job.id]: 'queued' }, 'the second job of a project waits for the first');
  assert.equal(runner.calls.length, 1);
  runner.calls[0].end({ ok: true, output: 'one' });
  await a1.done;
  await settle();
  assert.equal(runner.calls.length, 2, 'the next job of the project starts when the first ends');
  assert.deepEqual(runner.calls[1].args, ['new-asset', 'a', 'props/two']);
}

// 2. Jobs of two projects run side by side; two exports (or an export and an example) never do.
{
  const { runner, queue } = setup();
  const a = queue.submit(request('new-asset', 'a', 'x'));
  const b = queue.submit(request('new-asset', 'b', 'y'));
  await settle();
  assert.deepEqual([states(queue)[a.job.id], states(queue)[b.job.id]], ['running', 'running'], 'two projects, two jobs at once');
  const ea = queue.submit(request('export', 'c'));
  const eb = queue.submit(request('example', 'd'));
  await settle();
  assert.equal(states(queue)[ea.job.id], 'running');
  assert.equal(states(queue)[eb.job.id], 'queued', 'an example waits while an export runs, even in another project');
  // A job behind a waiting one in the same project keeps its place, even when nothing else holds it back.
  const behind = queue.submit(request('new-asset', 'd', 'z'));
  await settle();
  assert.equal(states(queue)[behind.job.id], 'queued', 'a later job of a project never overtakes an earlier one');
  runner.calls[2].end({ ok: true, output: '' });
  await ea.done;
  await settle();
  assert.equal(states(queue)[eb.job.id], 'running', 'the example starts once the export has ended');
  assert.equal(states(queue)[behind.job.id], 'queued', 'and the job behind it still waits for it');
}

// 3. A request equal to a queued job answers that job; one equal to a running job is a new one.
{
  const { queue, events } = setup();
  const first = queue.submit(request('export', 'a'));
  const queued = queue.submit(request('export', 'a', 'props/'));
  const again = queue.submit(request('export', 'a', 'props/'));
  assert.equal(again.existing, true);
  assert.equal(again.job.id, queued.job.id, 'the same job answers the same request');
  assert.equal(again.done, queued.done);
  assert.deepEqual(cleaned, ['export:a:props/'], 'the duplicate request leaves nothing on disk');
  assert.equal(events.filter((e) => e.event === 'job.queued').length, 2, 'a duplicate is not queued again');
  await settle();
  const rerun = queue.submit(request('export', 'a'));
  assert.equal(rerun.existing, false, 'a request equal to the running job is queued');
  assert.notEqual(rerun.job.id, first.job.id);
}

// 4. A failed job ends as failed and the next one runs; a runner that throws fails the job with its message.
{
  const { runner, queue } = setup();
  const bad = queue.submit(request('export', 'a'));
  const next = queue.submit(request('export', 'b'));
  await settle();
  runner.calls[0].end({ ok: false, output: 'type errors' });
  const done = await bad.done;
  assert.equal(done.state, 'failed');
  assert.equal(done.output, 'type errors');
  await settle();
  assert.equal(states(queue)[next.job.id], 'running', 'a failure does not stop the queue');
  runner.calls[1].fail(new Error('spawn failed'));
  const thrown = await next.done;
  assert.deepEqual([thrown.state, thrown.output], ['failed', 'spawn failed']);
  assert.deepEqual(cleaned, ['export:a:', 'export:b:'], 'each job removes its temporary files when it ends, failed or not');
}

// 5. Events: queued, started, one progress per line, finished, in that order and in the contract's shapes; what an
// event carries never changes afterwards.
{
  const { runner, queue, events } = setup();
  const sub = queue.submit({ command: 'export', project: 'a', subpaths: ['props/'], args: ['tools/export.ts'] });
  await settle();
  runner.calls[0].onProgress({ done: 1, total: 2, current: 'props/crate' });
  runner.calls[0].onProgress({ done: 2, total: 2, current: 'props/lamp' });
  assert.deepEqual(queue.get(sub.job.id)!.progress, { done: 2, total: 2, current: 'props/lamp' }, 'the job keeps its last progress');
  runner.calls[0].end({ ok: true, output: 'Summary: 2 outputs' });
  await sub.done;
  assert.deepEqual(events.map((e) => e.event), ['job.queued', 'job.started', 'job.progress', 'job.progress', 'job.finished']);
  const [queued, started, p1, , finished] = events as any[];
  assert.deepEqual(queued.data.job, { id: sub.job.id, command: 'export', project: 'a', subpaths: ['props/'], state: 'queued', queuedAt: 't1' });
  assert.deepEqual([started.data.job.state, started.data.job.startedAt], ['running', 't2']);
  assert.deepEqual(p1.data, { id: sub.job.id, progress: { done: 1, total: 2, current: 'props/crate' } });
  assert.deepEqual(finished.data.job, {
    id: sub.job.id, command: 'export', project: 'a', subpaths: ['props/'], state: 'succeeded',
    queuedAt: 't1', startedAt: 't2', finishedAt: 't3', progress: { done: 2, total: 2, current: 'props/lamp' }, output: 'Summary: 2 outputs',
  });
  assert.equal(queued.data.job.state, 'queued', 'an event sent earlier still says what was true then');
  assert.equal(p1.data.progress.done, 1);
}

// 6. The list: what is queued or running in arrival order, then the last finished, newest first, at most FINISHED_KEPT.
{
  const { runner, queue } = setup();
  const ids: string[] = [];
  for (let i = 0; i < FINISHED_KEPT + 2; i++) {
    const sub = queue.submit(request('new-asset', 'a', String(i)));
    ids.push(sub.job.id);
    await settle();
    runner.calls[i].end({ ok: true, output: '' });
    await sub.done;
  }
  const waiting = queue.submit(request('export', 'b'));
  const list = queue.list();
  assert.equal(list.length, FINISHED_KEPT + 1);
  assert.equal(list[0].id, waiting.job.id, 'what has not finished comes first');
  assert.deepEqual(list.slice(1).map((j) => j.id), ids.slice(2).reverse(), 'then the finished ones, newest first, the oldest dropped');
  assert.equal(queue.get(ids[0]), undefined, 'a dropped job is no longer found');
  list[0].state = 'failed';
  assert.notEqual(queue.get(waiting.job.id)!.state, 'failed', 'the list is a copy');
}

// 7. The progress lines of --progress (tools/export.ts), and nothing else.
assert.deepEqual(parseProgressLine('{"diorama":"progress","done":3,"total":12,"sheet":"props/crate"}'), { done: 3, total: 12, current: 'props/crate' });
assert.equal(parseProgressLine('  ✔ props/crate.png (2x, 4 KB) 120ms'), undefined, 'a human line is output');
assert.equal(parseProgressLine('{"diorama":"progress","done":"3"}'), undefined, 'a line without numbers is not progress');
assert.equal(parseProgressLine('{"diorama":"progress",'), undefined, 'a broken line is not progress');

// 8. The real runner: a command's progress lines go to onProgress as they come, and the rest is its output, stdout first.
{
  const seen: JobProgress[] = [];
  const script = [
    'console.log("out line");',
    'process.stderr.write(\'{"diorama":"progress","done":1,"total":1,"sheet":"props/crate"}\\n\');',
    'console.error("err line");',
    'process.exit(3);',
  ].join(' ');
  const result = await runCommand(['-e', script], { cwd: process.cwd(), env: { ...process.env, NO_COLOR: '1' } }, (p) => seen.push(p));
  assert.deepEqual(seen, [{ done: 1, total: 1, current: 'props/crate' }], 'the progress line is reported');
  assert.deepEqual(result, { ok: false, output: 'out line\nerr line' }, 'and left out of the output; a non-zero exit is not ok');
}

console.log('✅ Job queue checks passed');
