import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { API_ROUTES, createApp, isApiPath, type CommandResult, type CommandRunner } from '../../server/src/app';
import { EXAMPLE_LOCK } from '../../tools/lock';

console.log('🧪 Checking the API routes of server/ (the same statuses and bodies the plugin answered)...\n');

// A repository in miniature: one project in <repo>/projects with an export and its sheet.
const root = mkdtempSync(join(tmpdir(), 'diorama-server-'));
const project = 'demo';
const dir = join(root, 'projects', project);
const put = (rel: string, content = 'x') => {
  const file = join(dir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};
put('assets/props/crate.png');
put('assets/props/crate.json', JSON.stringify({ meta: { mode: 'sheet', frameCount: 1 } }));
put('sheets/props/crate.ts', 'export {};');

// The command runner is injected: a real command takes seconds, and what the route answers is the
// runner's result, not the command. `calls` records what the route hands it.
interface Call {
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}
const calls: Call[] = [];
let onRun: (() => Promise<CommandResult>) | undefined;
const run: CommandRunner = (args, options) => {
  calls.push({ args, ...options });
  return onRun ? onRun() : Promise.resolve({ ok: true, output: 'done' });
};
const app = createApp({ root, run });

const post = (body: unknown, contentType = 'application/json') => ({
  method: 'POST',
  headers: { 'Content-Type': contentType },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

/** Waits until the command of a job is running (the queue starts it asynchronously). */
const untilCalled = async (n: number) => {
  for (let i = 0; i < 100 && calls.length < n; i++) await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, n, `the command was to run (${calls.length} of ${n})`);
};

try {
  // 1. /__api/server says who answers and where, on any method (the plugin mounted it with use()).
  {
    const res = await app.request('/__api/server');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { app: 'diorama', root }, 'the API names this repository');
    assert.equal(res.headers.get('content-type'), 'application/json');
    const again = await app.request('/__api/server', { method: 'POST' });
    assert.equal(again.status, 200, 'a read route answers every method, as the mount did');
  }

  // 2. /__api/projects and /__api/assets answer the catalogs of projects/ alone.
  {
    const res = await app.request('/__api/projects');
    assert.equal(res.status, 200);
    const list = (await res.json()) as Array<Record<string, unknown>>;
    assert.equal(list.length, 1, 'one project is listed');
    assert.equal(list[0].name, project);
    assert.equal(list[0].assetCount, 1);

    const res2 = await app.request('/__api/assets');
    assert.equal(res2.status, 200);
    const assets = (await res2.json()) as Array<Record<string, unknown>>;
    const crate = assets.find((a) => a.subpath === 'props/crate.png');
    assert.ok(crate, 'the export is in the catalog');
    assert.equal(crate.project, project);
    assert.equal(crate.url, `/projects/${project}/assets/props/crate.png`);
    assert.equal(crate.sheet, 'props/crate.ts');
  }

  // 3. /__api/asset-files plans a delete; a refused path or a missing project is a 400.
  {
    const res = await app.request(`/__api/asset-files?project=${project}&subpath=props/crate.png`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      project,
      subpath: 'props/crate.png',
      files: [
        { kind: 'image', area: 'assets', rel: 'props/crate.png', path: `projects/${project}/assets/props/crate.png`, optional: false },
        { kind: 'atlas', area: 'assets', rel: 'props/crate.json', path: `projects/${project}/assets/props/crate.json`, optional: false },
        { kind: 'sheet', area: 'sheets', rel: 'props/crate.ts', path: `projects/${project}/sheets/props/crate.ts`, optional: true },
      ],
    });

    const missing = await app.request(`/__api/asset-files?project=${project}`);
    assert.equal(missing.status, 400);
    assert.deepEqual(await missing.json(), { ok: false, error: 'Path is empty.' });

    const traversal = await app.request(`/__api/asset-files?project=${project}&subpath=..%2Fescape.png`);
    assert.equal(traversal.status, 400);
    assert.equal((await traversal.json()).ok, false);

    const ghost = await app.request(`/__api/asset-files?project=ghost&subpath=props/crate.png`);
    assert.equal(ghost.status, 400);
    assert.deepEqual(await ghost.json(), { ok: false, error: 'Project "ghost" does not exist in projects/.' });
  }

  // 4. /__api/delete writes: 405 without POST, 400 without JSON, 400 for a refused path, and moves
  // the files into the trash on a good request.
  {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await app.request('/__api/delete', { method });
      assert.equal(res.status, 405, `${method} /__api/delete is 405`);
      assert.deepEqual(await res.json(), { ok: false, error: 'Use POST.' });
    }
    const form = await app.request('/__api/delete', post('project=demo', 'application/x-www-form-urlencoded'));
    assert.equal(form.status, 400);
    assert.deepEqual(await form.json(), { ok: false, error: 'Content-Type must be application/json.' });

    const badJson = await app.request('/__api/delete', post('not json {'));
    assert.equal(badJson.status, 400);
    assert.deepEqual(await badJson.json(), { ok: false, error: 'Body is not valid JSON.' });

    const empty = await app.request('/__api/delete', post({}));
    assert.equal(empty.status, 400);
    assert.deepEqual(await empty.json(), { ok: false, error: 'Path is empty.' });

    const escape = await app.request('/__api/delete', post({ project, subpath: '../escape.png' }));
    assert.equal(escape.status, 400);
    assert.equal((await escape.json()).ok, false);
    assert.ok(existsSync(join(dir, 'assets/props/crate.png')), 'a refused delete moves nothing');

    const res = await app.request('/__api/delete', post({ project, subpath: 'props/crate.png' }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { trashId: string; moved: unknown[] };
    assert.equal(body.ok, true);
    assert.equal(body.project, project);
    assert.equal(body.subpath, 'props/crate.png');
    assert.equal(body.moved.length, 2, 'image and atlas move, the sheet stays');
    assert.ok(!existsSync(join(dir, 'assets/props/crate.png')) && existsSync(join(dir, 'sheets/props/crate.ts')));

    // 5. /__api/restore puts them back; a trashed manifest that is not JSON is a 500, an unknown id a 400.
    const restored = await app.request('/__api/restore', post({ project, trashId: body.trashId }));
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), { ok: true, restored: [`projects/${project}/assets/props/crate.png`, `projects/${project}/assets/props/crate.json`] });
    assert.ok(existsSync(join(dir, 'assets/props/crate.png')));

    const get = await app.request('/__api/restore');
    assert.equal(get.status, 405);

    const nothing = await app.request('/__api/restore', post({ project, trashId: 'missing' }));
    assert.equal(nothing.status, 400);
    assert.deepEqual(await nothing.json(), { ok: false, error: 'Nothing in the trash with id missing.' });

    const forged = join(root, '.diorama-trash', 'assets', project, 'forged');
    mkdirSync(forged, { recursive: true });
    writeFileSync(join(forged, 'manifest.json'), 'not json {');
    const broken = await app.request('/__api/restore', post({ project, trashId: 'forged' }));
    assert.equal(broken.status, 500, 'anything but a PathError is a 500');
    assert.equal((await broken.json()).ok, false);
    rmSync(forged, { recursive: true, force: true });
  }

  // 6. /__api/delete-project and /__api/restore-project move the whole folder and back.
  {
    assert.equal((await app.request('/__api/delete-project')).status, 405);
    const ghost = await app.request('/__api/delete-project', post({ project: 'ghost' }));
    assert.equal(ghost.status, 400);
    assert.deepEqual(await ghost.json(), { ok: false, error: 'Project "ghost" does not exist in projects/.' });

    const res = await app.request('/__api/delete-project', post({ project }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { trashId: string };
    assert.equal(body.ok, true);
    assert.equal(body.project, project);
    assert.ok(!existsSync(dir), 'the project folder is gone');

    const restored = await app.request('/__api/restore-project', post({ project, trashId: body.trashId }));
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), { ok: true, restored: project });
    assert.ok(existsSync(join(dir, 'assets/props/crate.png')));
  }

  // 7. /__api/example-run says whether `npm run example` is going on, here or in another process.
  {
    const idle = await app.request('/__api/example-run');
    assert.equal(idle.status, 200);
    assert.deepEqual(await idle.json(), { running: false });

    const lock = join(root, EXAMPLE_LOCK);
    writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: '2026-01-02T03:04:05.000Z', command: 'npm run example' }));
    const held = await app.request('/__api/example-run');
    assert.deepEqual(await held.json(), { running: true, startedAt: '2026-01-02T03:04:05.000Z' }, 'a run holding the lock shows as running');
    rmSync(lock);
  }

  // 8. POST /__api/jobs refuses a bad request with a 400 and the reason; a good one reaches the runner with the
  // script's arguments, the repository as cwd and a plain-text env, and the job ends as the command did. While an
  // example runs, /__api/example-run says so with the time it started.
  {
    const form = await app.request('/__api/jobs', post('x=1', 'application/x-www-form-urlencoded'));
    assert.equal(form.status, 400);
    assert.deepEqual(await form.json(), { ok: false, error: 'Content-Type must be application/json.' });
    const noCommand = await app.request('/__api/jobs', post({}));
    assert.equal(noCommand.status, 400);
    assert.match((await noCommand.json()).error, /^command must be/);
    const outfit = await app.request('/__api/jobs', post({ command: 'new-outfit-character', project, name: 'x', from: 'y', outfit: {} }));
    assert.equal(outfit.status, 400);
    assert.deepEqual(await outfit.json(), { ok: false, error: 'outfit must be an object with a pieces list.' });

    const finished = async (id: string) => {
      for (let i = 0; i < 200; i++) {
        const job = (await (await app.request(`/__api/jobs/${id}`)).json()) as { state: string; output?: string };
        if (job.state === 'succeeded' || job.state === 'failed') return job;
        await new Promise((r) => setImmediate(r));
      }
      throw new Error(`job ${id} never finished`);
    };

    calls.length = 0;
    const good = (await (await app.request('/__api/jobs', post({ command: 'gear-items', project }))).json()) as { job: { id: string } };
    const goodJob = await finished(good.job.id);
    assert.deepEqual([goodJob.state, goodJob.output], ['succeeded', 'done'], 'the job ends as the command did, with its output');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, ['tools/cli.ts', 'gear-items', `projects/${project}`]);
    assert.equal(calls[0].cwd, root);
    assert.equal(calls[0].env.NO_COLOR, '1', 'no ANSI colors in the output');
    assert.equal('FORCE_COLOR' in calls[0].env, false);

    onRun = () => Promise.resolve({ ok: false, output: 'failed hard' });
    const bad = (await (await app.request('/__api/jobs', post({ command: 'gear-items', project, force: true }))).json()) as { job: { id: string } };
    const failedJob = await finished(bad.job.id);
    assert.deepEqual([failedJob.state, failedJob.output], ['failed', 'failed hard'], 'a failed command is a failed job, with its output');
    onRun = undefined;

    let release: (result: CommandResult) => void;
    onRun = () => new Promise((r) => { release = r; });
    const before = calls.length;
    const sample = (await (await app.request('/__api/jobs', post({ command: 'example' }))).json()) as { job: { id: string } };
    await untilCalled(before + 1);
    assert.deepEqual(calls[before].args, ['tools/cli.ts', 'example', '--progress'], 'example runs with --progress, for the export inside it');
    const state = (await (await app.request('/__api/example-run')).json()) as { running: boolean; startedAt?: string };
    assert.equal(state.running, true, 'the job going on shows');
    assert.ok(typeof state.startedAt === 'string' && !Number.isNaN(Date.parse(state.startedAt)), 'with when it started');
    release!({ ok: true, output: 'brought in' });
    await finished(sample.job.id);
    assert.deepEqual(await (await app.request('/__api/example-run')).json(), { running: false });
    onRun = undefined;
  }

  // 9. A mounted path also answers under it (the connect mounts' rule: "/" borders a route); a path
  // that borders no route is no answer of the API.
  {
    const under = await app.request('/__api/projects/anything');
    assert.equal(under.status, 200);
    assert.ok(Array.isArray(await under.json()), 'a path under a route answers like the route');

    const none = await app.request('/__api/projectsx');
    assert.equal(none.status, 404, 'no border, no route: Vite keeps it, as the mounts did');
  }

  // 10. isApiPath is the gate the dev server forwards on: a path reaches the API when it borders a
  // route on "/", "." or the end, as the connect mounts did. Everything else stays with Vite —
  // including a path that only happens to have "/" or "." at a route's length (tools/runner.html,
  // which the exporter's pages load).
  {
    for (const path of ['/__api/server', '/__api/assets/extra', '/__api/assets.json', '/__api/delete/']) {
      assert.ok(isApiPath(path), `${path} reaches the API`);
    }
    for (const path of ['/', '/index.html', '/viewer/', '/viewer/index.html', '/tools/runner.html', '/tools/sheet-runner.html', '/projects/demo/game/', '/packages/phaser/demo/', '/__api', '/__api/assetsx', '/__api/delete2', '/__apis/assets', '/@vite/client', '/src/app.ts']) {
      assert.ok(!isApiPath(path), `${path} stays with Vite`);
    }
  }

  // The app's route table is what the dev server forwards (vite.config.ts reads it).
  assert.ok(API_ROUTES.includes('/__api/delete') && API_ROUTES.length === 9, 'every route of the API is mounted');
  assert.ok(!isApiPath('/__api/cli'), 'the old command route is gone: commands are jobs');
  for (const path of ['/__api/jobs', '/__api/jobs/job-1', '/__api/events']) assert.ok(isApiPath(path), `${path} reaches the API`);
  assert.ok(!isApiPath('/__api/jobsx') && !isApiPath('/__api/eventsource'), 'the job routes border on "/", "." or the end too');

  // 11. The job routes: POST queues (202 and the job), GET lists and finds, the rest is refused.
  {
    calls.length = 0;
    const queued = await app.request('/__api/jobs', post({ command: 'export', project, subpath: 'props/' }));
    assert.equal(queued.status, 202);
    const { job } = (await queued.json()) as { job: Record<string, unknown> };
    assert.deepEqual([job.command, job.project, job.subpaths], ['export', project, ['props/']]);
    assert.ok(job.state === 'queued' || job.state === 'running');
    await untilCalled(1);
    assert.deepEqual(calls[0].args, ['tools/export.ts', `projects/${project}`, 'props/', '--progress'], 'a job exports with --progress, for its progress');
    for (let i = 0; i < 100 && (await (await app.request(`/__api/jobs/${job.id}`)).json()).state !== 'succeeded'; i++) await new Promise((r) => setImmediate(r));

    const one = await app.request(`/__api/jobs/${job.id}`);
    assert.equal(one.status, 200);
    const ended = (await one.json()) as Record<string, unknown>;
    assert.deepEqual([ended.id, ended.state, ended.output], [job.id, 'succeeded', 'done'], 'one job, finished, with its output');
    assert.ok(typeof ended.startedAt === 'string' && typeof ended.finishedAt === 'string', 'with when it started and ended');
    const list = (await (await app.request('/__api/jobs')).json()) as Array<{ id: string }>;
    assert.ok(list.some((j) => j.id === job.id), 'the list has the finished job');

    const created = await app.request('/__api/jobs', post({ command: 'new-project', name: 'fresh' }));
    assert.equal(((await created.json()) as { job: { project: string } }).job.project, 'fresh', 'a new project is the project its job writes to');

    const missing = await app.request('/__api/jobs/job-999');
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { ok: false, error: 'No job job-999.' });
    assert.equal((await app.request(`/__api/jobs/${job.id}`, { method: 'DELETE' })).status, 405);
    assert.equal((await app.request('/__api/jobs', { method: 'PUT' })).status, 405);

    const bad = await app.request('/__api/jobs', post({ command: 'export', project: '../x' }));
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { ok: false, error: 'project must be the name of a project in projects/.' });
    const form = await app.request('/__api/jobs', post('x=1', 'application/x-www-form-urlencoded'));
    assert.equal(form.status, 400, 'POST takes JSON alone');

    // "Try the sample" twice while this server brings it in: the second answers the first job.
    let release: (result: CommandResult) => void;
    onRun = () => new Promise((r) => { release = r; });
    const before = calls.length;
    const first = (await (await app.request('/__api/jobs', post({ command: 'example' }))).json()) as { job: { id: string; project: string } };
    assert.equal(first.job.project, 'soulkeeper', 'example writes to the sample\'s copy in projects/');
    await untilCalled(before + 1);
    const again = await app.request('/__api/jobs', post({ command: 'example' }));
    assert.equal(again.status, 202);
    assert.equal(((await again.json()) as { job: { id: string } }).job.id, first.job.id, 'the run going on answers');
    assert.equal(calls.length, before + 1, 'and no second run starts');
    release!({ ok: true, output: 'brought in' });
    onRun = undefined;

    // While another process holds the lock: a 409, and nothing runs.
    for (let i = 0; i < 100 && (await (await app.request('/__api/example-run')).json()).running; i++) await new Promise((r) => setImmediate(r));
    writeFileSync(join(root, EXAMPLE_LOCK), JSON.stringify({ pid: process.pid, startedAt: '', command: 'npm run example' }));
    const held = await app.request('/__api/jobs', post({ command: 'example' }));
    assert.equal(held.status, 409);
    assert.equal(((await held.json()) as { running: boolean }).running, true);
    assert.equal(calls.length, before + 1);
    rmSync(join(root, EXAMPLE_LOCK));
  }

  console.log('✅ API route checks passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
