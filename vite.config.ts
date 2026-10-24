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
import { LAYOUT, listProjects } from './tools/project';
import { PathError, deleteAsset, deleteProject, planDelete, restoreAsset, restoreProject } from './viewer/server/assets-fs';

// Maps a request from the viewer's "New" dialog to a tools/ script and its arguments (the layout of docs/ARCHITECTURE.md:
// new-asset writes src/ + sheets/, new-scene src/scenes/ + sheets/scenes/, gear-items sheets/gear/, new-outfit-character
// src/characters/<name>/ + sheets/characters/<name>/; export takes paths relative to sheets/). The scripts find the
// project by name in projects/ and then examples/, and do all the validation; this only rejects values that would be
// read as flags. `outfitFile` is where the handler saved the outfit (or scene) of a new-outfit-character / new-scene request.
function cliArgs(body: any, outfitFile?: string): string[] {
  const str = (v: unknown, field: string): string => {
    const s = String(v ?? '').trim();
    if (!s) throw new Error(`${field} is required.`);
    if (s.startsWith('-')) throw new Error(`${field} cannot start with "-".`);
    return s;
  };
  const optional = (v: unknown, field: string): string | undefined =>
    String(v ?? '').trim() ? str(v, field) : undefined;
  switch (body?.command) {
    case 'new-project': {
      const args = ['tools/cli.ts', 'new-project', str(body.name, 'name')];
      if (body.style) args.push('--style');
      return args;
    }
    case 'new-asset': {
      // The subpath is sheets/<subpath>.ts (kebab-case names joined by "/"); the drawing goes in src/.
      const engine = str(body.engine, 'engine');
      if (engine !== 'volume' && engine !== 'rig') throw new Error('engine must be volume or rig.');
      const args = [
        'tools/cli.ts', 'new-asset', str(body.project, 'project'), str(body.subpath, 'subpath'),
        `--engine=${engine}`,
        `--frames=${str(body.frames, 'frames')}`,
      ];
      // Both turn to face other directions.
      const directions = optional(body.directions, 'directions');
      if (directions) args.push(`--directions=${directions}`);
      if (engine === 'volume') {
        args.push(`--size=${str(body.size, 'size')}`, `--fps=${str(body.fps, 'fps')}`);
      } else {
        // A rig clip takes the cell of its skeleton and plays at the speed its seconds set: no --size, no --fps.
        // The first clip of a character folder creates src/<folder>/character.ts. Without --clip the script uses the file name when it is a clip name.
        args.push(`--skeleton=${str(body.skeleton, 'skeleton')}`);
        const clip = optional(body.clip, 'clip');
        if (clip) args.push(`--clip=${clip}`);
      }
      return args;
    }
    case 'gear-items': {
      // One sheet (sheets/gear/<part>.ts) per part of the project's gear catalog (it keeps the ones already there).
      const args = ['tools/cli.ts', 'gear-items', str(body.project, 'project')];
      if (body.force) args.push('--force');
      return args;
    }
    case 'new-scene': {
      if (!outfitFile) throw new Error('scene is required.');
      const args = ['tools/cli.ts', 'new-scene', str(body.project, 'project'), str(body.name, 'name'), '--scene', outfitFile];
      if (body.force) args.push('--force');
      return args;
    }
    case 'new-outfit-character': {
      if (!outfitFile) throw new Error('outfit is required.');
      const args = [
        'tools/cli.ts', 'new-outfit-character', str(body.project, 'project'), str(body.name, 'name'),
        '--from', str(body.from, 'from'), '--outfit', outfitFile,
      ];
      if (body.force) args.push('--force');
      return args;
    }
    case 'export': {
      // The subpath is relative to sheets/. Empty exports the whole project; a trailing "/" exports a folder.
      const args = ['tools/export.ts', str(body.project, 'project')];
      const subpath = optional(body.subpath, 'subpath');
      if (subpath) args.push(subpath);
      if (body.sheet === 'grid' || body.sheet === 'compact') {
        args.push(`--${body.sheet}`);
        const gap = optional(body.gap, 'gap');
        const cols = optional(body.cols, 'cols');
        if (gap) args.push(`--gap=${gap}`);
        if (cols) args.push(`--cols=${cols}`);
        if (body.both) args.push('--both');
      }
      if (body.mockup) args.push('--mockup');
      return args;
    }
    default:
      throw new Error('command must be new-project, new-asset, new-outfit-character, new-scene, gear-items or export.');
  }
}

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
      // The repository root: projects live in projects/ and examples/ (a name in projects/ wins), found by tools/project.ts.
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

      // Runs new-project, new-asset, new-outfit-character, new-scene, gear-items and export from the viewer
      server.middlewares.use('/__api/cli', postOnly(async (req, res) => {
        let args: string[];
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
        } catch (err: any) {
          await cleanup();
          return sendJson(res, 400, { ok: false, output: `Error: ${err.message}` });
        }
        // Same entry point as the npm scripts, without a shell. Plain text output: no ANSI colors.
        const { FORCE_COLOR: _forceColor, ...env } = process.env;
        execFile(
          process.execPath,
          ['--import', 'tsx', ...args],
          { cwd: server.config.root, env: { ...env, NO_COLOR: '1' } },
          async (err, stdout, stderr) => {
            await cleanup();
            sendJson(res, 200, { ok: !err, output: (stdout + stderr).trim() });
          },
        );
      }));

      // Tell the open viewer to refetch whenever an export, a sheet, a source file or a delete changes the catalog.
      let pending: ReturnType<typeof setTimeout> | undefined;
      const notify = (file: string) => {
        const normalized = file.replace(/\\/g, '/');
        if (!/\/(projects|examples)\/[^/]+\/(assets|sheets|src)\//.test(normalized)) return;
        clearTimeout(pending);
        pending = setTimeout(() => server.ws.send({ type: 'custom', event: 'diorama:update', data: { file: normalized } }), 150);
      };
      server.watcher.on('add', notify).on('change', notify).on('unlink', notify);
    },

    // Vite reloads every open page when a module outside any HMR boundary changes. Projects (src/, sheets/), the engine
    // and the tools are such modules: the viewer reads the catalog from the server and loads the kits it needs on
    // demand, and a reload would throw away its toasts (including the Undo that follows a delete).
    handleHotUpdate({ file, server }) {
      const rel = relative(server.config.root, file).split(sep).join('/');
      // @diorama/phaser is in no page but its test bench (packages/phaser/demo/) and the projects' games (the viewer plays
      // the exports with the runtime alone): reload those pages, and only them.
      if (rel.startsWith('packages/phaser/')) {
        const games = listProjects(server.config.root).filter(({ dir }) => existsSync(join(dir, LAYOUT.game, 'index.html')));
        for (const path of ['/packages/phaser/demo/index.html', ...games.map(({ rel: project }) => `/${project}/${LAYOUT.game}/index.html`)]) {
          server.ws.send({ type: 'full-reload', path });
        }
        return [];
      }
      if (!/^(projects|examples|core|templates|tools)\//.test(rel)) return;
      // A project's game (game/, rule 8 of docs/ARCHITECTURE.md) is a page of its own: reload that page, and only that one.
      const game = /^((?:projects|examples)\/[^/]+\/game)\//.exec(rel);
      if (game) server.ws.send({ type: 'full-reload', path: `/${game[1]}/index.html` });
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
  },
});
