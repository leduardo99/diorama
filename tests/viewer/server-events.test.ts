import assert from 'node:assert/strict';
import { CATALOG_KEYS, createJobTracker, queryUpdatesFor } from '../../viewer/src/lib/server-events';
import { failedSheets } from '../../viewer/src/lib/export-errors';
import type { Job, JobProgress } from '../../viewer/src/lib/types';

console.log('🧪 Checking how the viewer follows the server\'s events (queries, jobs, failed sheets)...\n');

// 1. What each event refreshes: the catalog for a change on disk and for a finished job, the sample's run as it is
// told, and nothing for the steps of a job.
const job = (over: Partial<Job> = {}): Job => ({ id: 'job-1', command: 'export', project: 'demo', subpaths: [], state: 'queued', queuedAt: 't0', ...over });
assert.deepEqual(queryUpdatesFor({ event: 'catalog.changed', data: { projects: ['demo'] } }), { invalidate: [['assets'], ['projects']] });
assert.deepEqual(queryUpdatesFor({ event: 'job.finished', data: { job: job({ state: 'failed' }) } }).invalidate, CATALOG_KEYS, 'a finished job reads the catalog again');
assert.deepEqual(queryUpdatesFor({ event: 'example.changed', data: { running: true, startedAt: 't1' } }), { invalidate: [], exampleRun: { running: true, startedAt: 't1' } }, 'the run is set, not fetched');
for (const event of ['job.queued', 'job.started'] as const) assert.deepEqual(queryUpdatesFor({ event, data: { job: job() } }), { invalidate: [] }, `${event} refreshes nothing`);
assert.deepEqual(queryUpdatesFor({ event: 'job.progress', data: { id: 'job-1', progress: { done: 1, total: 2 } } }), { invalidate: [] });

// 2. The tracker: a waiter hears its job queued, started and progressing, and resolves when it finishes; another job's
// events do not reach it.
{
  const jobs = createJobTracker();
  const heard: string[] = [];
  const progress: JobProgress[] = [];
  const done = jobs.wait(job(), {
    onQueued: () => heard.push('queued'),
    onStarted: () => heard.push('started'),
    onProgress: (p) => progress.push(p),
  });
  assert.deepEqual(jobs.awaited(), ['job-1']);
  jobs.handle({ event: 'job.started', data: { job: job({ id: 'job-2', state: 'running' }) } });
  jobs.handle({ event: 'job.started', data: { job: job({ state: 'running' }) } });
  jobs.handle({ event: 'job.progress', data: { id: 'job-2', progress: { done: 9, total: 9 } } });
  jobs.handle({ event: 'job.progress', data: { id: 'job-1', progress: { done: 1, total: 2, current: 'props/crate' } } });
  jobs.handle({ event: 'job.finished', data: { job: job({ state: 'succeeded', output: 'ok' }) } });
  assert.deepEqual((await done).output, 'ok');
  assert.deepEqual(heard, ['queued', 'started'], 'what the POST answered (queued), then its own start');
  assert.deepEqual(progress, [{ done: 1, total: 2, current: 'props/crate' }], 'only its own progress');
  assert.deepEqual(jobs.awaited(), [], 'a finished job is no longer awaited');
}

// 3. A job that finished before its POST answered resolves at once; one the POST says is running hears it started.
{
  const jobs = createJobTracker();
  jobs.handle({ event: 'job.finished', data: { job: job({ id: 'job-7', state: 'failed', output: 'type errors' }) } });
  assert.equal((await jobs.wait(job({ id: 'job-7', state: 'running' }))).state, 'failed', 'the event came first: the job is not waited for forever');
  let started = 0;
  void jobs.wait(job({ id: 'job-8', state: 'running', progress: { done: 3, total: 5 } }), { onStarted: () => started++ });
  assert.equal(started, 1, 'a job already running is said to have started');
}

// 4. After a reconnection: a job read from the server settles its waiters when it has finished; one the server no
// longer knows fails them.
{
  const jobs = createJobTracker();
  const kept = jobs.wait(job({ id: 'job-3' }));
  const lost = jobs.wait(job({ id: 'job-4' }));
  jobs.update(job({ id: 'job-3', state: 'running' }));
  assert.deepEqual(jobs.awaited().sort(), ['job-3', 'job-4'], 'a job still running is still awaited');
  jobs.update(job({ id: 'job-3', state: 'succeeded', output: 'done' }));
  assert.equal((await kept).output, 'done');
  jobs.lose('job-4', new Error('restarted'));
  await assert.rejects(lost, /restarted/);
  assert.deepEqual(jobs.awaited(), []);
}

// 5. The sheets an export reported as failed: it goes on past them.
assert.deepEqual(failedSheets([
  'Diorama Export [project: demo] (3 assets)',
  '  ✔ props/crate.png (2x, 4 KB) 120ms',
  '  ✖ props/lamp FAILED: Cannot read properties of undefined',
  '  \x1b[31m✖\x1b[39m gear/helm FAILED: boom',
  'Summary: 1 output, 2 failed',
].join('\n')), ['props/lamp', 'gear/helm']);
assert.deepEqual(failedSheets('Error: demo has 2 type error(s), so nothing was exported:'), [], 'a refusal names no sheet');

console.log('✅ Server event checks passed');
