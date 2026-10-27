import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { getRequestListener } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { resolve, extname, join, relative, sep } from 'node:path';
import { createApp, isApiPath } from './server/src/app';
import type { ChangeSource } from './server/src/events';
import { LAYOUT, PROJECT_ROOTS, listProjects } from './tools/project';

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

      // The API is a Hono app of its own (server/src/app.ts), mounted here so `npm run view` stays one command and one
      // process; `npm run server` runs it alone. A request reaches it when its path borders a route on "/", "." or the
      // end, the rule the connect mounts above applied: everything else falls through to Vite as before.
      // The server's events follow the files through Vite's own watcher (catalog.changed, example.changed).
      const changes: ChangeSource = (listener) => {
        const events = ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const;
        for (const event of events) server.watcher.on(event, listener);
        return () => { for (const event of events) server.watcher.off(event, listener); };
      };
      const api = getRequestListener(createApp({ root: repo, changes }).fetch, { overrideGlobalObjects: false });
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (!isApiPath(path)) return next();
        api(req, res).catch(next);
      });

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
