/**
 * @diorama/phaser in a browser: headless Chromium, Phaser's canvas renderer, the generated fixture sheets
 * (tests/phaser/fixtures.ts) and the page tests/phaser/page/main.ts, served by Vite with the repository's aliases. The
 * loop sleeps and the test steps it one 60th of a second at a time, pressing keys as a player would. A character walks and
 * runs at its clips' ground speeds, plays two actions, fires their events and cues, and every frame it draws is the
 * fixture's cell, pixel for pixel; every sheet is cut into bands by a small texture limit on the way.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { nineSlice } from '@diorama/runtime';
import { CELL, DIRS, PANEL, PIVOT, SCALE, expectedCell, panelPixel, writeFixtures } from './fixtures';
// The page's `window.smoke`, for the types of what the test reads.
import type {} from './page/main';

console.log('🧪 Checking @diorama/phaser in Chromium (canvas renderer, generated sheets): walking, actions, events, cues and pixels...\n');

const ROOT = resolve('.');
const work = mkdtempSync(join(tmpdir(), 'diorama-phaser-'));
const FIXTURES = join(work, 'assets');
writeFixtures(FIXTURES);
/** The texture limit the page loads with: every fixture sheet is larger, so each is cut into bands of whole cells. */
const MAX = 64;
const STEP = 1 / 60;

let vite: ViteDevServer | undefined;
let http: Server | undefined;
let browser: Browser | undefined;

const PAGE = `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body style="margin:0"><div id="game"></div><script type="module" src="/tests/phaser/page/main.ts"></script></body></html>`;

try {
  vite = await createServer({
    configFile: false,
    root: ROOT,
    logLevel: 'error',
    // Its own cache, so a dev server running on the repository keeps its pre-bundled dependencies.
    cacheDir: join(work, 'vite'),
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, fs: { allow: [ROOT, work] } },
    optimizeDeps: { include: ['phaser'], noDiscovery: true },
    resolve: {
      alias: {
        '@diorama/runtime': resolve('packages/runtime/src/index.ts'),
        '@diorama/phaser/sheets': resolve('packages/phaser/src/sheets.ts'),
        '@diorama/phaser': resolve('packages/phaser/src/index.ts'),
      },
    },
    plugins: [{
      name: 'smoke',
      configureServer(server) {
        server.middlewares.use('/smoke', (_req, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end(PAGE);
        });
        server.middlewares.use('/fixtures', async (req, res) => {
          const { readFile } = await import('node:fs/promises');
          const file = join(FIXTURES, decodeURIComponent((req.url ?? '').split('?')[0]));
          try {
            const body = await readFile(file);
            res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'image/png');
            res.end(body);
          } catch {
            res.statusCode = 404;
            res.end('not found');
          }
        });
      },
    }],
  });
  const server = createHttpServer(vite.middlewares);
  http = server;
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  browser = await chromium.launch();
  const page: Page = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.stack ?? error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(`${base}/smoke?max=${MAX}`);
  await page.waitForFunction(() => window.smoke?.ready === true, null, { timeout: 60_000, polling: 100 }).catch((error: Error) => {
    throw new Error(`the page did not get ready: ${error.message}\n${problems.join('\n')}`);
  });

  const step = (frames = 1) => page.evaluate((n) => window.smoke!.step(n), frames);
  const state = () => page.evaluate(() => window.smoke!.state());
  const pixels = (x: number, y: number, width: number, height: number) => page.evaluate(([x, y, w, h]) => window.smoke!.pixels(x, y, w, h), [x, y, width, height]);

  /** The frame the runtime shows for a clip after `seconds` of it, as the runtime counts (a sum of steps, floored). */
  const frameAfter = (steps: number, fps: number, frames: number) => {
    let time = 0;
    for (let i = 0; i < steps; i++) time += STEP;
    return Math.floor(time * fps) % frames;
  };

  /**
   * The character's frame on the canvas against the fixture's cell, pixel for pixel: its whole untrimmed cell, from where
   * the pivot puts it. Returns the frame's index.
   */
  async function drawsItsCell(clip: string, row: number, why: string): Promise<number> {
    const now = await state();
    const { x, y, frame: name } = now.character;
    const [direction, index] = name.split('_');
    assert.equal(direction, DIRS[row], `${why}: the facing shown`);
    const drawn = await pixels(x - PIVOT.x - now.camera.x, y - PIVOT.y - now.camera.y, CELL.width, CELL.height);
    const expected = expectedCell(clip, row, Number(index));
    const wrong = drawn.findIndex((v, i) => v !== expected[i]);
    const at = wrong & ~3;
    assert.equal(wrong, -1, `${why}: ${clip} ${name} must be drawn as its cell; pixel (${(wrong >> 2) % CELL.width}, ${Math.floor((wrong >> 2) / CELL.width)}) is [${drawn.slice(at, at + 4)}], not [${expected.slice(at, at + 4)}]`);
    return Number(index);
  }

  // 1. Loading: the idle sheet brought the other clips, the cued effects and the impact the bolt follows; the limit cut every
  // sheet into bands of whole cells, the sources of its one texture.
  const loaded = await state();
  assert.deepEqual(loaded.warnings, [], 'nothing failed to load');
  assert.equal(loaded.renderer, 'canvas');
  assert.equal(loaded.camera.roundPixels, false, 'on canvas the plugin turns the cameras\' roundPixels off (pixelArt turns it on)');
  assert.deepEqual(loaded.sources, { 'characters/dummy/idle': 2, 'characters/dummy/walk': 4, 'vfx/spark': 1, 'ui/panel': 1 }, 'the walk (96 × 128 px) in four bands, the packed idle in two');
  assert.deepEqual([loaded.character.texture, loaded.character.frame, loaded.character.x, loaded.character.y], ['characters/dummy/idle', 'S_0', 0, 0], 'idle, facing the camera, feet on the floor\'s origin');
  assert.deepEqual([loaded.character.originX, loaded.character.originY], [PIVOT.x, PIVOT.y], 'the origin is the pivot, in the untrimmed cell');
  await step();
  assert.equal(await drawsItsCell('idle', 0, 'idle (packed: a trimmed frame on a band)'), 0);
  await step(10);
  assert.equal(await drawsItsCell('idle', 0, 'idle, a second trimmed frame on another band'), frameAfter(11, 4, 2));

  // 2. Walking: D steers east at the walk's ground speed (30 world units a second, × 2 px at the export's scale).
  await page.keyboard.down('d');
  await step(30);
  let now = await state();
  assert.equal(now.character.clip, 'walk');
  assert.ok(Math.abs(now.character.pos.x - 30 * 30 * STEP) < 1e-9 && now.character.pos.y === 0, `half a second of walking is 15 world units east: ${JSON.stringify(now.character.pos)}`);
  assert.equal(now.character.x, Math.round(now.character.pos.x * SCALE), 'drawn at whole px');
  assert.ok(now.clips.includes('walk:step:legL') && now.clips.includes('walk:step:legR'), `the walk's footsteps fire: ${now.clips.join(', ')}`);
  // Every frame of the walk, on its bands, as the clock reaches it (8 fps: one frame every 7.5 steps).
  const walked = new Set<number>();
  for (let steps = 30; steps < 38; steps++) {
    const index = await drawsItsCell('walk', 3, `walking east, step ${steps}`);
    assert.equal(index, frameAfter(steps, 8, 4), `the walk's frame after ${steps} steps`);
    walked.add(index);
    await step();
  }
  assert.equal(walked.size, 2, 'the walk moved on a frame');

  // 3. Running: Shift takes the last move clip, at its own speed (60 world units a second).
  const before = (await state()).character.pos.x;
  await page.keyboard.down('Shift');
  await step(30);
  now = await state();
  assert.equal(now.character.clip, 'run');
  assert.ok(Math.abs(now.character.pos.x - before - 60 * 30 * STEP) < 1e-9, `half a second of running is 30 world units: ${now.character.pos.x - before}`);
  await page.keyboard.up('Shift');
  await page.keyboard.up('d');
  await step();
  now = await state();
  assert.deepEqual([now.character.clip, now.character.row], ['idle', 3], 'it stops in idle, still facing east');

  // 4. An action: 1 plays the first action (attack: the slash), whose hit cues the spark at the tip socket.
  log('slash');
  const clipsBefore = now.clips.length;
  const fxBefore = now.fx.length;
  await page.keyboard.press('1');
  await step();
  now = await state();
  assert.equal(now.character.clip, 'slash', '1 slashes, even when the key was let go before the step');
  assert.equal(await drawsItsCell('slash', 3, 'the first frame of the slash'), 0);
  await step(6);
  assert.equal(await drawsItsCell('slash', 3, 'before the hit'), 1);
  assert.equal((await state()).effects.length, 0, 'no effect before the hit');
  await step(6);
  now = await state();
  assert.deepEqual(now.clips.slice(clipsBefore), ['slash:start', 'slash:hit'], 'start, then the hit on frame 2');
  assert.deepEqual(now.fx.slice(fxBefore), ['start:spark'], 'the hit cues the spark');
  const spark = now.effects[0];
  // The tip socket is (10, 6) logical px of the cell: (20, 12) exported px, less the pivot (12, 28), from the feet.
  assert.deepEqual([spark.id, spark.x, spark.y], ['spark', now.character.x + 10 * SCALE - PIVOT.x, now.character.y + 6 * SCALE - PIVOT.y], `the spark is drawn at the tip: ${JSON.stringify(spark)}`);
  assert.ok(spark.depth > now.character.depth, 'an air effect on the actor\'s level is drawn over it');
  await step(30);
  now = await state();
  assert.deepEqual(now.clips.slice(clipsBefore), ['slash:start', 'slash:hit', 'slash:cancel', 'slash:end'], 'cancel on frame 3, then the end');
  assert.deepEqual(now.fx.slice(fxBefore), ['start:spark', 'spark:hit', 'spark:end'], 'the spark\'s own hit, then its end');
  assert.deepEqual([now.character.clip, now.effects.length], ['idle', 0], 'back to idle, the spark gone');

  // 5. A projectile: 2 plays the second action (skill: the cast); its release sends the bolt east, which ends in the burst.
  log('cast');
  const fxCast = now.fx.length;
  await page.keyboard.press('2');
  await step(13);
  now = await state();
  assert.deepEqual(now.fx.slice(fxCast), ['start:bolt'], `the release sends the bolt: ${now.fx.slice(fxCast).join(', ')}`);
  const bolt = now.effects[0];
  assert.equal(bolt.frame.split('_')[0], 'E', 'the bolt shows its eastward row');
  await step(10);
  now = await state();
  assert.equal(now.effects[0].x - bolt.x, Math.round(120 * 10 * STEP * SCALE), 'it flies at its travel speed (120 world units a second)');
  await step(40);
  now = await state();
  assert.deepEqual(now.fx.slice(fxCast), ['start:bolt', 'bolt:end', 'start:burst', 'burst:hit', 'burst:end'], `at the end of its range it ends, and the burst plays there with its hit: ${now.fx.slice(fxCast).join(', ')}`);

  // 6. Depth: one key per actor, and equal floor points never tie, whatever order they were added in.
  await page.evaluate(() => {
    window.smoke!.add(3, 45, 0);
    window.smoke!.add(2, 45, 0);
  });
  await step();
  const order = (await page.evaluate(() => window.smoke!.order())).filter((name) => name.startsWith('dummy-'));
  assert.deepEqual(order, ['dummy-1', 'dummy-2', 'dummy-3'], `actors on one level are drawn by id: ${order.join(', ')}`);

  // 7. The nine-slice: nine Images from the runtime's parts draw the panel at 40 × 30 on canvas, borders kept, edges stretched.
  const drawn = await pixels(200, 8, 40, 30);
  const parts = nineSlice({ x: 0, y: 0, width: PANEL.size, height: PANEL.size }, { left: PANEL.inset, top: PANEL.inset, right: PANEL.inset, bottom: PANEL.inset }, 1, 40, 30);
  assert.equal(parts.length, 9);
  const map = (v: number, size: number) => (v < PANEL.inset ? v : v >= size - PANEL.inset ? PANEL.size - (size - v) : PANEL.inset);
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 40; x++) {
      const at = (y * 40 + x) * 4;
      assert.deepEqual(drawn.slice(at, at + 4), panelPixel(map(x, 40), map(y, 30)), `the panel's pixel (${x}, ${y})`);
    }
  }

  assert.deepEqual(problems, [], 'no page errors or warnings');
  console.log('✔ Loaded in bands, walked and ran at the clips\' speeds, slashed with the spark, cast the bolt into its burst; every frame drawn pixel for pixel.\n');
} finally {
  await browser?.close();
  await new Promise((done) => (http ? http.close(done) : done(undefined)));
  await vite?.close();
  rmSync(work, { recursive: true, force: true });
}

/** A heading for the log, so a failure says which part it was in. */
function log(part: string) {
  console.log(`  ${part}`);
}
