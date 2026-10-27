/**
 * The viewer's API: a Hono app answering the `/__api/*` routes. In development the `diorama-api`
 * plugin mounts it inside Vite's dev server (`getRequestListener`, vite.config.ts), so `npm run view`
 * stays one command and one process; `npm run server` (server/src/main.ts) runs it alone.
 *
 * `createApp` builds the app from options with no module-level state, so each test builds its own
 * (the commands it runs, its queue of jobs, its events). What it serves are the projects of `projects/`
 * alone (tools/project.ts, `VIEWER_ROOTS`): the samples of `examples/` are never listed, opened,
 * deleted or saved into; `npm run example` copies one in.
 *
 * The commands that write run as jobs (jobs.ts): `POST /__api/jobs` queues one, `GET /__api/jobs` lists them, and
 * `GET /__api/events` streams what happens to them and to the catalog as Server-Sent Events (contract.ts, events.ts).
 * `/__api/cli` queues a job too and answers when it has finished, as it always answered.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { EXAMPLE_LOCK, lockHolder } from '../../tools/lock';
import { cliArgs, jobTarget } from './cli-args';
import type { Job, JobProgress } from './contract';
import { EventHub, watchCatalog, type ChangeSource } from './events';
import { JobQueue, parseProgressLine, type CommandResult, type JobRequest } from './jobs';
import { buildAssetCatalog, buildProjectCatalog } from './catalog';
import { PathError, deleteAsset, deleteProject, planDelete, restoreAsset, restoreProject } from './assets-fs';

/**
 * The API's routes, in the order the plugin mounted them. The dev server forwards a request to the
 * app when its path borders one of these on "/", "." or the end (connect's rule in Vite), so a path
 * that is no route still falls through to Vite; `npm run server` answers each of them the same way.
 */
export const API_ROUTES = [
  '/__api/server',
  '/__api/assets',
  '/__api/projects',
  '/__api/asset-files',
  '/__api/delete',
  '/__api/restore',
  '/__api/delete-project',
  '/__api/restore-project',
  '/__api/example-run',
  '/__api/cli',
] as const;

/** The routes of the jobs and their events: `/__api/jobs`, `/__api/jobs/<id>` and `/__api/events` (GET). */
export const JOB_ROUTES = ['/__api/jobs', '/__api/events'] as const;

/**
 * Whether a dev-server path goes to the API: it borders a route on "/", "." or the end, the rule
 * the plugin's connect mounts applied (Vite vendors connect). Anything else falls through to Vite.
 */
export const isApiPath = (path: string): boolean =>
  [...API_ROUTES, ...JOB_ROUTES].some((route) => path.startsWith(route) && (path.length === route.length || path[route.length] === '/' || path[route.length] === '.'));

export type { CommandResult };

/**
 * Runs a job's command: its script and arguments in the repository, resolving its plain-text output. The lines
 * `--progress` prints go to `onProgress`, not into the output.
 */
export type CommandRunner = (args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }, onProgress?: (progress: JobProgress) => void) => Promise<CommandResult>;

export interface AppOptions {
  /** The repository root: the viewer's projects live in `projects/` under it. */
  root: string;
  /** What runs the jobs' commands; the default is `node --import tsx` like the npm scripts. */
  run?: CommandRunner;
  /** Where file changes come from, for `catalog.changed` and `example.changed`; without it, only the jobs' events are sent. */
  changes?: ChangeSource;
  /** How often an open event stream gets a comment line that keeps the connection open. */
  heartbeatMs?: number;
}

/** An open event stream gets a comment this often, so no proxy or browser closes a quiet connection. */
export const HEARTBEAT_MS = 15_000;

// Same entry point as the npm scripts, without a shell. stderr is read line by line: a progress line of `--progress`
// is reported as it comes and left out of the output, which keeps stdout then stderr as the command printed them.
export const runCommand: CommandRunner = (args, options, onProgress) =>
  new Promise((resolveRun) => {
    const child = spawn(process.execPath, ['--import', 'tsx', ...args], { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let partial = '';
    const take = (line: string) => {
      const progress = parseProgressLine(line);
      if (progress) onProgress?.(progress);
      else stderr += `${line}\n`;
    };
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      const lines = (partial + chunk).split('\n');
      partial = lines.pop() ?? '';
      lines.forEach(take);
    });
    child.on('error', (err) => resolveRun({ ok: false, output: err.message }));
    child.on('close', (code) => {
      if (partial) take(partial);
      resolveRun({ ok: code === 0, output: (stdout + stderr).trim() });
    });
  });

const json = (c: Context, status: ContentfulStatusCode, body: unknown) => c.json(body, status);

function sendError(c: Context, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return json(c, err instanceof PathError ? 400 : 500, { ok: false, error: message });
}

// Mutating endpoints only accept JSON: a cross-site form post cannot send that without a CORS preflight.
async function readJsonBody(c: Context): Promise<any> {
  if (!String(c.req.header('content-type') ?? '').startsWith('application/json')) {
    throw new PathError('Content-Type must be application/json.');
  }
  try {
    return JSON.parse((await c.req.text()) || '{}');
  } catch {
    throw new PathError('Body is not valid JSON.');
  }
}

/**
 * A request body of `/__api/cli` or `POST /__api/jobs` as the job it asks for. Throws with the message to answer on a
 * bad request. `progress` adds `--progress` to an export or an example, for the job's progress.
 */
async function jobRequestOf(body: any, progress: boolean): Promise<JobRequest> {
  // An outfit or a scene travels as a file: the script reads it from a temp folder that is removed when the job ends.
  let outfitDir: string | undefined;
  const cleanup = () => (outfitDir ? rm(outfitDir, { recursive: true, force: true }) : undefined);
  try {
    let outfitFile: string | undefined;
    if (body?.command === 'new-outfit-character' || body?.command === 'new-scene') {
      const isScene = body.command === 'new-scene';
      const data = isScene ? body.scene : body.outfit;
      const list = isScene ? data?.props : data?.pieces;
      if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(list)) throw new Error(isScene ? 'scene must be an object with a props list.' : 'outfit must be an object with a pieces list.');
      outfitDir = await mkdtemp(join(tmpdir(), isScene ? 'diorama-scene-' : 'diorama-outfit-'));
      outfitFile = join(outfitDir, isScene ? 'scene.json' : 'outfit.json');
      await writeFile(outfitFile, JSON.stringify(data, null, 2));
    }
    const args = cliArgs(body, outfitFile);
    const target = jobTarget(body);
    if (progress && (body.command === 'export' || body.command === 'example')) args.push('--progress');
    return { command: body.command, ...target, args, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

export function createApp({ root, run = runCommand, changes, heartbeatMs = HEARTBEAT_MS }: AppOptions) {
  const app = new Hono();
  const hub = new EventHub();
  // Plain text output: no ANSI colors.
  const { FORCE_COLOR: _forceColor, ...env } = process.env;
  const queue = new JobQueue({ hub, run: (args, onProgress) => run(args, { cwd: root, env: { ...env, NO_COLOR: '1' } }, onProgress) });

  /** Routes that write answer 405 to anything but POST; the rest answer every method. */
  const postOnly = (handler: (c: Context) => Promise<Response>) => async (c: Context) => {
    if (c.req.method !== 'POST') return json(c, 405, { ok: false, error: 'Use POST.' });
    try {
      return await handler(c);
    } catch (err) {
      return sendError(c, err);
    }
  };

  // `npm run example` brings the sample in one run at a time (tools/lock.ts). A run is going on while this server has
  // one queued or running (from the moment it is asked for, before the script takes the lock) or while another process
  // holds the lock (a terminal, another server): "Try the sample" shows it as running and does not start another.
  const exampleJob = (): Job | undefined => queue.list().find((job) => job.command === 'example' && (job.state === 'queued' || job.state === 'running'));
  const exampleRun = (): { running: boolean; startedAt?: string } => {
    const job = exampleJob();
    const holder = lockHolder(join(root, EXAMPLE_LOCK));
    if (job || holder) return { running: true, startedAt: job ? (job.startedAt ?? job.queuedAt) : (holder?.startedAt || undefined) };
    return { running: false };
  };
  // example.changed: sent when the run's state changes, whether this server's job or another process's lock changed it.
  let exampleSent = JSON.stringify({ running: false });
  const notifyExample = () => {
    const state = exampleRun();
    const key = JSON.stringify(state);
    if (key === exampleSent) return;
    exampleSent = key;
    hub.emit({ event: 'example.changed', data: state });
  };
  hub.subscribe((event) => {
    if ((event.event === 'job.queued' || event.event === 'job.started' || event.event === 'job.finished') && event.data.job.command === 'example') notifyExample();
  });
  if (changes) watchCatalog({ root, changes, hub, lock: EXAMPLE_LOCK, onLock: notifyExample });

  const handlers: Record<(typeof API_ROUTES)[number], (c: Context) => Promise<Response> | Response> = {
    // Who this server is: `npm run game` asks, to tell this repository's dev server from any other program on its port.
    '/__api/server': (c) => json(c, 200, { app: 'diorama', root }),

    '/__api/assets': async (c) => {
      try {
        return json(c, 200, await buildAssetCatalog(root));
      } catch (err) {
        return sendError(c, err);
      }
    },

    '/__api/projects': async (c) => {
      try {
        return json(c, 200, await buildProjectCatalog(root));
      } catch (err) {
        return sendError(c, err);
      }
    },

    // The exact files a delete would move, so the confirm dialog shows what the server will really do.
    '/__api/asset-files': async (c) => {
      try {
        return json(c, 200, await planDelete(root, c.req.query('project') ?? '', c.req.query('subpath') ?? ''));
      } catch (err) {
        return sendError(c, err);
      }
    },

    // Deleting moves files into .diorama-trash/assets/<project>/<id>/ so it can be undone.
    '/__api/delete': postOnly(async (c) => {
      const body = await readJsonBody(c);
      const result = await deleteAsset(root, body.project, body.subpath, { deleteSheet: body.deleteSheet === true });
      return json(c, 200, { ok: true, ...result });
    }),

    '/__api/restore': postOnly(async (c) => {
      const body = await readJsonBody(c);
      return json(c, 200, { ok: true, ...(await restoreAsset(root, body.project, body.trashId)) });
    }),

    // Deleting a project of projects/ moves the whole folder to <repo>/.diorama-trash/projects/ so it can be undone too.
    '/__api/delete-project': postOnly(async (c) => {
      const body = await readJsonBody(c);
      return json(c, 200, { ok: true, ...(await deleteProject(root, body.project)) });
    }),

    '/__api/restore-project': postOnly(async (c) => {
      const body = await readJsonBody(c);
      return json(c, 200, { ok: true, ...(await restoreProject(root, body.project, body.trashId)) });
    }),

    '/__api/example-run': (c) => json(c, 200, exampleRun()),

    // Runs new-project, new-asset, new-outfit-character, new-scene, gear-items, export and example from the viewer:
    // queued as a job like any other, and answered once it has finished.
    '/__api/cli': postOnly(async (c) => {
      let request: JobRequest;
      try {
        request = await jobRequestOf(await readJsonBody(c), false);
      } catch (err: any) {
        return json(c, 400, { ok: false, output: `Error: ${err.message}` });
      }
      // A second "Try the sample" (another tab, a double request) while one runs: answered as running, never started.
      if (request.command === 'example' && exampleRun().running) {
        await request.cleanup?.();
        return json(c, 409, { ok: false, running: true, output: 'npm run example is already running: it brings the sample in.' });
      }
      const job = await queue.submit(request).done;
      return json(c, 200, { ok: job.state === 'succeeded', output: job.output ?? '' });
    }),
  };

  for (const route of API_ROUTES) {
    const handler = handlers[route];
    // A mounted route matches its path bordered on "/", "." or the end (connect's rule in Vite).
    for (const pattern of [route, `${route}/*`, `${route}.*`]) app.all(pattern, handler);
  }

  const getOnly = (c: Context) => json(c, 405, { ok: false, error: 'Use GET.' });

  // POST queues a job (202, the job); GET lists the jobs queued, running and the last finished.
  app.all('/__api/jobs', async (c) => {
    if (c.req.method === 'GET') return json(c, 200, queue.list());
    if (c.req.method !== 'POST') return json(c, 405, { ok: false, error: 'Use GET or POST.' });
    let request: JobRequest;
    try {
      request = await jobRequestOf(await readJsonBody(c), true);
    } catch (err) {
      return json(c, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    if (request.command === 'example') {
      // "Try the sample" again while this server brings it in answers that job; while another process does, a 409.
      const running = exampleJob();
      if (running) {
        await request.cleanup?.();
        return json(c, 202, { job: running });
      }
      if (lockHolder(join(root, EXAMPLE_LOCK))) {
        await request.cleanup?.();
        return json(c, 409, { ok: false, running: true, error: 'npm run example is already running: it brings the sample in.' });
      }
    }
    return json(c, 202, { job: queue.submit(request).job });
  });

  app.all('/__api/jobs/:id', (c) => {
    if (c.req.method !== 'GET') return getOnly(c);
    const job = queue.get(c.req.param('id'));
    return job ? json(c, 200, job) : json(c, 404, { ok: false, error: `No job ${c.req.param('id')}.` });
  });

  // Every event of the hub, as it happens; a comment line keeps a quiet connection open.
  app.all('/__api/events', (c) => {
    if (c.req.method !== 'GET') return getOnly(c);
    return streamSSE(c, async (stream) => {
      const stop = hub.subscribe((event) => {
        void stream.writeSSE({ event: event.event, data: JSON.stringify(event.data) });
      });
      const beat = setInterval(() => void stream.write(': keep-alive\n\n'), heartbeatMs);
      // The first bytes open the stream at once (EventSource fires "open"), and say how soon to reconnect.
      await stream.write('retry: 2000\n: connected\n\n');
      await new Promise<void>((resolveStream) => stream.onAbort(resolveStream));
      clearInterval(beat);
      stop();
    });
  });

  return app;
}
