import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname, join, relative, sep } from 'node:path';
import { execFile } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildAssetCatalog, buildProjectCatalog } from './viewer/server/catalog';
import { cliArgs } from './viewer/server/cli-args';
import { EXAMPLE_LOCK, lockHolder } from './tools/lock';
import { LAYOUT, PROJECT_ROOTS, listProjects } from './tools/project';
import { PathError, deleteAsset, deleteProject, planDelete, restoreAsset, restoreProject } from './viewer/server/assets-fs';

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  sendJson(res, err instanceof PathError ? 400 : 500, { ok: false, error: message });
}

// Mutating endpoints only accept JSON: a cross-site form post cannot send that without a CORS preflight.
function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolveBody, reject) => {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
      reject(new PathError('Content-Type must be application/json.'));
      return;
    }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        resolveBody(JSON.parse(raw || '{}'));
      } catch {
        reject(new PathError('Body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function postOnly(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>): Connect.NextHandleFunction {
  return (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Use POST.' });
    handler(req, res).catch((err) => sendError(res, err));
  };
}

// "@/..." resolves to the viewer sources. Added by a plugin so the shared resolve.alias block stays as it is.
function viewerPathsPlugin(): Plugin {
  return {
    name: 'viewer-paths',
    config: () => ({ resolve: { alias: { '@': resolve(__dirname, 'viewer/src') } } }),
  };
}

function dioramaApiPlugin(): Plugin {
  return {
    name: 'diorama-api',
    configureServer(server) {
      // The repository root: the viewer's projects live in projects/ (tools/project.ts, VIEWER_ROOTS); the samples in
      // examples/ are not listed, and npm run example copies one in.
      const repo = server.config.root;

      // The viewer is a single-page app under /viewer/: deep links must reach its index.html,
      // not the redirect page at the repository root that Vite would fall back to.
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (path.startsWith('/viewer/') && !extname(path) && !path.startsWith('/viewer/@') && String(req.headers.accept ?? '').includes('text/html')) {
          req.url = '/viewer/index.html';
        }
        next();
      });

      // A project's game (game/index.html) and the Phaser test bench (packages/phaser/demo/index.html) are folders' pages,
      // served for the address with its slash (`/projects/my-game/game/`). Without the slash Vite finds no file and falls back
      // to the repository's root page, which sends you to the viewer: send the address to the folder instead, with its query.
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        const at = url.indexOf('?');
        const path = at < 0 ? url : url.slice(0, at);
        const page = /^\/(?:(?:projects|examples)\/[\w-][\w.-]*\/game|packages\/phaser\/demo)$/.test(path);
        if (page && existsSync(join(repo, path, 'index.html'))) {
          res.statusCode = 302;
          res.setHeader('Location', `${path}/${at < 0 ? '' : url.slice(at)}`);
          res.end();
          return;
        }
        next();
      });

      // Who this server is: `npm run game` asks, to tell this repository's dev server from any other program on its port.
      server.middlewares.use('/__api/server', (_req, res) => sendJson(res, 200, { app: 'diorama', root: repo }));

      server.middlewares.use('/__api/assets', async (_req, res) => {
        try {
          sendJson(res, 200, await buildAssetCatalog(repo));
        } catch (err) {
          sendError(res, err);
        }
      });

      server.middlewares.use('/__api/projects', async (_req, res) => {
        try {
          sendJson(res, 200, await buildProjectCatalog(repo));
        } catch (err) {
          sendError(res, err);
        }
      });

      // The exact files a delete would move, so the confirm dialog shows what the server will really do.
      server.middlewares.use('/__api/asset-files', async (req, res) => {
        try {
          const params = new URL(req.url ?? '', 'http://localhost').searchParams;
          sendJson(res, 200, await planDelete(repo, params.get('project') ?? '', params.get('subpath') ?? ''));
        } catch (err) {
          sendError(res, err);
        }
      });

      // Deleting moves files into .diorama-trash/assets/<project>/<id>/ so it can be undone.
      server.middlewares.use('/__api/delete', postOnly(async (req, res) => {
        const body = await readJsonBody(req);
        const result = await deleteAsset(repo, body.project, body.subpath, { deleteSheet: body.deleteSheet === true });
        sendJson(res, 200, { ok: true, ...result });
      }));

      server.middlewares.use('/__api/restore', postOnly(async (req, res) => {
        const body = await readJsonBody(req);
        sendJson(res, 200, { ok: true, ...(await restoreAsset(repo, body.project, body.trashId)) });
      }));

      // Deleting a project of projects/ moves the whole folder to <repo>/.diorama-trash/projects/ so it can be undone too.
      server.middlewares.use('/__api/delete-project', postOnly(async (req, res) => {
        const body = await readJsonBody(req);
        sendJson(res, 200, { ok: true, ...(await deleteProject(repo, body.project)) });
      }));

      server.middlewares.use('/__api/restore-project', postOnly(async (req, res) => {
        const body = await readJsonBody(req);
        sendJson(res, 200, { ok: true, ...(await restoreProject(repo, body.project, body.trashId)) });
      }));

      // `npm run example` brings the sample in one run at a time (tools/lock.ts). A run is going on while this server runs
      // one (from the moment it is asked for, before the script takes the lock) or while another process holds the lock
      // (a terminal, another server): "Try the sample" shows it as running and does not start another.
      let exampleInFlight: { startedAt: string } | undefined;
      const exampleRun = (): { running: boolean; startedAt?: string } => {
        const holder = lockHolder(join(repo, EXAMPLE_LOCK));
        if (exampleInFlight || holder) return { running: true, startedAt: exampleInFlight?.startedAt ?? (holder?.startedAt || undefined) };
        return { running: false };
      };
      server.middlewares.use('/__api/example-run', (_req, res) => sendJson(res, 200, exampleRun()));

      // Runs new-project, new-asset, new-outfit-character, new-scene, gear-items, export and example from the viewer
      server.middlewares.use('/__api/cli', postOnly(async (req, res) => {
        let args: string[];
        let isExample = false;
        // An outfit or a scene travels as a file: the script reads it from a temp folder that is removed when it ends.
        let outfitDir: string | undefined;
        const cleanup = () => (outfitDir ? rm(outfitDir, { recursive: true, force: true }) : undefined);
        try {
          const body = await readJsonBody(req);
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
          return sendJson(res, 400, { ok: false, output: `Error: ${err.message}` });
        }
        if (isExample) {
          // A second "Try the sample" (another tab, a double request) while one runs: answered as running, never started.
          if (exampleRun().running) return sendJson(res, 409, { ok: false, running: true, output: 'npm run example is already running: it brings the sample in.' });
          exampleInFlight = { startedAt: new Date().toISOString() };
        }
        // Same entry point as the npm scripts, without a shell. Plain text output: no ANSI colors.
        const { FORCE_COLOR: _forceColor, ...env } = process.env;
        execFile(
          process.execPath,
          ['--import', 'tsx', ...args],
          { cwd: server.config.root, env: { ...env, NO_COLOR: '1' } },
          async (err, stdout, stderr) => {
            if (isExample) exampleInFlight = undefined;
            await cleanup();
            sendJson(res, 200, { ok: !err, output: (stdout + stderr).trim() });
          },
        );
      }));

      // Tell the open viewer to refetch whenever an export, a sheet, a source file or a delete changes the catalog. A folder of
      // projects/ with a dot name is no project (npm run example copies into one, then renames it into place).
      let pending: ReturnType<typeof setTimeout> | undefined;
      const notify = (file: string) => {
        const normalized = file.replace(/\\/g, '/');
        if (!/\/projects\/[^/.][^/]*\/(assets|sheets|src)\//.test(normalized)) return;
        clearTimeout(pending);
        pending = setTimeout(() => server.ws.send({ type: 'custom', event: 'diorama:update', data: { file: normalized } }), 150);
      };
      server.watcher.on('add', notify).on('change', notify).on('unlink', notify);
    },

    // Vite reloads every open page when a module outside any HMR boundary is changed, created or deleted. Projects (src/,
    // sheets/), the engine and the tools are such modules: the viewer reads the catalog from the server and loads the kits
    // it needs on demand, and a reload would throw away its state and its toasts (the Undo that follows a delete, the
    // progress of "Try the sample"). `hotUpdate` sees all three kinds of event; the older `handleHotUpdate` saw changes
    // only, so creating or deleting a project's files (Delete project, npm run example, a new asset) still reloaded it.
    hotUpdate({ file, server }) {
      const rel = relative(server.config.root, file).split(sep).join('/');
      // The pages are the browser's: the client environment sends their reloads, once.
      const client = this.environment.name === 'client';
      // @diorama/phaser is in no page but its test bench (packages/phaser/demo/) and the projects' games (the viewer plays
      // the exports with the runtime alone): reload those pages, and only them. Every folder of projects/ and examples/
      // counts, a sample that a project of the same name hides too (each has its own game page).
      if (rel.startsWith('packages/phaser/')) {
        if (client) {
          const games = PROJECT_ROOTS.flatMap((root) => listProjects(server.config.root, [root])).filter(({ dir }) => existsSync(join(dir, LAYOUT.game, 'index.html')));
          for (const path of ['/packages/phaser/demo/index.html', ...games.map(({ rel: project }) => `/${project}/${LAYOUT.game}/index.html`)]) {
            this.environment.hot.send({ type: 'full-reload', path });
          }
        }
        return [];
      }
      if (!/^(projects|examples|core|templates|tools)\//.test(rel)) return;
      // A project's game (game/, rule 8 of docs/ARCHITECTURE.md) is a page of its own: reload that page, and only that one.
      const game = /^((?:projects|examples)\/[^/]+\/game)\//.exec(rel);
      if (game && client) this.environment.hot.send({ type: 'full-reload', path: `/${game[1]}/index.html` });
      return [];
    },
  };
}

export default defineConfig({
  plugins: [
    // The router plugin must run before the React plugin.
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './viewer/src/routes',
      generatedRouteTree: './viewer/src/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
    viewerPathsPlugin(),
    dioramaApiPlugin(),
  ],
  resolve: {
    alias: {
      '@core/draw': resolve(__dirname, 'core/draw/index.ts'),
      '@core/volume': resolve(__dirname, 'core/volume/index.ts'),
      '@core/rig': resolve(__dirname, 'core/rig/index.ts'),
      '@core': resolve(__dirname, 'core/index.ts'),
      '@diorama/runtime': resolve(__dirname, 'packages/runtime/src/index.ts'),
      '@diorama/phaser/sheets': resolve(__dirname, 'packages/phaser/src/sheets.ts'),
      '@diorama/phaser': resolve(__dirname, 'packages/phaser/src/index.ts'),
    },
  },
  // Pre-bundled when the server starts: a game page (npm run game) and the Phaser test bench import Phaser, and finding it
  // only then would make Vite reload every open page, the viewer's too.
  optimizeDeps: { include: ['phaser'] },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        viewer: resolve(__dirname, 'viewer/index.html'),
      },
    },
  },
  // Fixed port: if 5173 is taken, fail with a clear error instead of silently serving elsewhere.
  server: {
    port: 5173,
    strictPort: true,
    open: false,
    // Local only: the viewer is not reachable from other machines on the network.
    host: 'localhost',
    // npm run example builds its copy in a hidden folder of projects/ and renames it into place: a watch inside it
    // would hold the folder open, and Windows refuses to rename a folder while anything inside it is open.
    watch: { ignored: ['**/projects/.*/**'] },
  },
});
