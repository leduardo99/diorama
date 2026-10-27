/**
 * The viewer's API: a Hono app answering the `/__api/*` routes. In development the `diorama-api`
 * plugin mounts it inside Vite's dev server (`getRequestListener`, vite.config.ts), so `npm run view`
 * stays one command and one process; `npm run server` (server/src/main.ts) runs it alone.
 *
 * `createApp` builds the app from options with no module-level state, so each test builds its own
 * (the commands it runs, the `example` run in flight). What it serves are the projects of `projects/`
 * alone (tools/project.ts, `VIEWER_ROOTS`): the samples of `examples/` are never listed, opened,
 * deleted or saved into; `npm run example` copies one in.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { EXAMPLE_LOCK, lockHolder } from '../../tools/lock';
import { cliArgs } from './cli-args';
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

/**
 * Whether a dev-server path goes to the API: it borders a route on "/", "." or the end, the rule
 * the plugin's connect mounts applied (Vite vendors connect). Anything else falls through to Vite.
 */
export const isApiPath = (path: string): boolean =>
  API_ROUTES.some((route) => path.startsWith(route) && (path.length === route.length || path[route.length] === '/' || path[route.length] === '.'));

export interface CommandResult {
  ok: boolean;
  output: string;
}

/** Runs a command of `/__api/cli`: its script and arguments in the repository, resolving its plain-text output. */
export type CommandRunner = (args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => Promise<CommandResult>;

export interface AppOptions {
  /** The repository root: the viewer's projects live in `projects/` under it. */
  root: string;
  /** What runs the commands of `/__api/cli`; the default is `node --import tsx` like the npm scripts. */
  run?: CommandRunner;
}

// Same entry point as the npm scripts, without a shell.
const realRun: CommandRunner = (args, options) =>
  new Promise((resolveRun) => {
    execFile(process.execPath, ['--import', 'tsx', ...args], options, (err, stdout, stderr) => {
      resolveRun({ ok: !err, output: (stdout + stderr).trim() });
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

export function createApp({ root, run = realRun }: AppOptions) {
  const app = new Hono();

  /** Routes that write answer 405 to anything but POST; the rest answer every method. */
  const postOnly = (handler: (c: Context) => Promise<Response>) => async (c: Context) => {
    if (c.req.method !== 'POST') return json(c, 405, { ok: false, error: 'Use POST.' });
    try {
      return await handler(c);
    } catch (err) {
      return sendError(c, err);
    }
  };

  // `npm run example` brings the sample in one run at a time (tools/lock.ts). A run is going on while this server runs
  // one (from the moment it is asked for, before the script takes the lock) or while another process holds the lock
  // (a terminal, another server): "Try the sample" shows it as running and does not start another.
  let exampleInFlight: { startedAt: string } | undefined;
  const exampleRun = (): { running: boolean; startedAt?: string } => {
    const holder = lockHolder(join(root, EXAMPLE_LOCK));
    if (exampleInFlight || holder) return { running: true, startedAt: exampleInFlight?.startedAt ?? (holder?.startedAt || undefined) };
    return { running: false };
  };

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

    // Runs new-project, new-asset, new-outfit-character, new-scene, gear-items, export and example from the viewer.
    '/__api/cli': postOnly(async (c) => {
      let args: string[];
      let isExample = false;
      // An outfit or a scene travels as a file: the script reads it from a temp folder that is removed when it ends.
      let outfitDir: string | undefined;
      const cleanup = () => (outfitDir ? rm(outfitDir, { recursive: true, force: true }) : undefined);
      try {
        const body = await readJsonBody(c);
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
        args = cliArgs(body, outfitFile);
        isExample = body.command === 'example';
      } catch (err: any) {
        await cleanup();
        return json(c, 400, { ok: false, output: `Error: ${err.message}` });
      }
      if (isExample) {
        // A second "Try the sample" (another tab, a double request) while one runs: answered as running, never started.
        if (exampleRun().running) return json(c, 409, { ok: false, running: true, output: 'npm run example is already running: it brings the sample in.' });
        exampleInFlight = { startedAt: new Date().toISOString() };
      }
      // Plain text output: no ANSI colors.
      const { FORCE_COLOR: _forceColor, ...env } = process.env;
      try {
        const result = await run(args, { cwd: root, env: { ...env, NO_COLOR: '1' } });
        return json(c, 200, result);
      } finally {
        if (isExample) exampleInFlight = undefined;
        await cleanup();
      }
    }),
  };

  for (const route of API_ROUTES) {
    const handler = handlers[route];
    // A mounted route matches its path bordered on "/", "." or the end (connect's rule in Vite).
    for (const pattern of [route, `${route}/*`, `${route}.*`]) app.all(pattern, handler);
  }

  return app;
}
