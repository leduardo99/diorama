/**
 * What the browser tests of @diorama/phaser share: the generated fixture sheets (tests/phaser/fixtures.ts) in a folder of
 * their own, served at /fixtures/ by Vite with the repository's aliases next to the test pages, and headless Chromium with
 * WebGL (SwiftShader, so it runs without a GPU) as well as the canvas renderer.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { createServer } from 'vite';
import { writeFixtures } from './fixtures';

export interface Served {
  /** The server's origin, `http://127.0.0.1:<port>`. */
  base: string;
  browser: Browser;
  close: () => Promise<void>;
}

/** A page that runs one module: `<body>` holds `#game` (and what `body` adds), then the module. */
const page = (module: string, body: string) =>
  `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body style="margin:0">${body}<div id="game"></div><script type="module" src="${module}"></script></body></html>`;

/** Serves the fixtures and these pages (`/smoke` -> `{ module: '/tests/phaser/page/main.ts' }`), and starts Chromium. */
export async function serve(pages: Record<string, { module: string; body?: string }>): Promise<Served> {
  const root = resolve('.');
  const work = mkdtempSync(join(tmpdir(), 'diorama-phaser-'));
  const fixtures = join(work, 'assets');
  writeFixtures(fixtures);
  const vite = await createServer({
    configFile: false,
    root,
    logLevel: 'error',
    // Its own cache, so a dev server running on the repository keeps its pre-bundled dependencies.
    cacheDir: join(work, 'vite'),
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, fs: { allow: [root, work] } },
    optimizeDeps: { include: ['phaser'], noDiscovery: true },
    resolve: {
      alias: {
        '@diorama/runtime': resolve('packages/runtime/src/index.ts'),
        '@diorama/phaser/sheets': resolve('packages/phaser/src/sheets.ts'),
        '@diorama/phaser': resolve('packages/phaser/src/index.ts'),
      },
    },
    plugins: [{
      name: 'phaser-tests',
      configureServer(server) {
        for (const [path, { module, body = '' }] of Object.entries(pages)) {
          server.middlewares.use(path, (_req, res) => {
            res.setHeader('Content-Type', 'text/html');
            res.end(page(module, body));
          });
        }
        server.middlewares.use('/fixtures', async (req, res) => {
          const file = join(fixtures, decodeURIComponent((req.url ?? '').split('?')[0]));
          try {
            const content = await readFile(file);
            res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'image/png');
            res.end(content);
          } catch {
            res.statusCode = 404;
            res.end('not found');
          }
        });
      },
    }],
  });
  const http = createHttpServer(vite.middlewares);
  let browser: Browser | undefined;
  const close = async () => {
    await browser?.close();
    await new Promise((done) => (http.listening ? http.close(done) : done(undefined)));
    await vite.close();
    rmSync(work, { recursive: true, force: true });
  };
  try {
    await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
    const address = http.address();
    const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    // WebGL in software: headless Chromium has no GPU, and SwiftShader draws what a GPU would.
    browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    return { base, browser, close };
  } catch (error) {
    await close();
    throw error;
  }
}
