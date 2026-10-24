/**
 * @diorama/phaser in a browser: headless Chromium, Phaser's canvas renderer and then WebGL (in software, SwiftShader), the
 * generated fixture sheets (tests/phaser/fixtures.ts) and the page tests/phaser/page/main.ts, served by Vite with the
 * repository's aliases (tests/phaser/serve.ts). The loop sleeps and the test steps it one 60th of a second at a time,
 * pressing keys as a player would. A character walks and runs at its clips' ground speeds, plays two actions and fires
 * their events and cues. Every frame it draws, one effect's frame and the nine-slice are compared with the fixture's
 * pixels; the sheets larger than a small texture limit (the character's clips) are cut into bands on the way, and the
 * frames checked lie on several of those bands.
 */

import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { nineSlice } from '@diorama/runtime';
import { CELL, DIRS, FX, PANEL, PIVOT, SCALE, expectedCell, expectedFx, panelPixel } from './fixtures';
import { serve, type Served } from './serve';
// The page's `window.smoke`, for the types of what the test reads.
import type {} from './page/main';

console.log('🧪 Checking @diorama/phaser in Chromium (canvas and WebGL, generated sheets): walking, actions, events, cues and pixels...\n');

/** The texture limit the page loads with: the character's clips are larger, so they are cut into bands of whole cells; the effects and the panel fit. */
const MAX = 64;
const STEP = 1 / 60;

let served: Served | undefined;

try {
  served = await serve({ '/smoke': { module: '/tests/phaser/page/main.ts' } });
  for (const renderer of ['canvas', 'webgl'] as const) await play(served, renderer);
  console.log('✔ Canvas and WebGL: loaded in bands, walked and ran at the clips\' speeds, slashed with the spark, cast the bolt into its burst; every frame drawn pixel for pixel.\n');
} finally {
  await served?.close();
}

/** The whole run on one renderer, in a page of its own. */
async function play({ base, browser }: Served, renderer: 'canvas' | 'webgl') {
  console.log(`  ${renderer}`);
  const page: Page = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.stack ?? error.message}`));
  page.on('console', (message) => {
    // SwiftShader's own notes about the GPU are not the page's.
    if ((message.type() === 'error' || message.type() === 'warning') && !/GPU stall|GL Driver Message|SwiftShader/i.test(message.text())) problems.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(`${base}/smoke?max=${MAX}&renderer=${renderer}`);
  await page.waitForFunction(() => window.smoke?.ready === true, null, { timeout: 60_000, polling: 100 }).catch((error: Error) => {
    throw new Error(`${renderer}: the page did not get ready: ${error.message}\n${problems.join('\n')}`);
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

  /** The first pixel where two RGBA arrays of a `width` px wide region differ, as a message; empty when they are the same. */
  const differs = (drawn: number[], expected: number[], width: number) => {
    const wrong = drawn.findIndex((v, i) => v !== expected[i]);
    if (wrong < 0) return '';
    const at = wrong & ~3;
    return `pixel (${(wrong >> 2) % width}, ${Math.floor((wrong >> 2) / width)}) is [${drawn.slice(at, at + 4)}], not [${expected.slice(at, at + 4)}]`;
  };

  /**
   * The character's frame on the canvas against the fixture's cell, pixel for pixel: its whole untrimmed cell, from where
   * the pivot puts it. Returns the frame's index and the band (texture source) it is on.
   */
  async function drawsItsCell(clip: string, row: number, why: string): Promise<{ index: number; band: number }> {
    const now = await state();
    const { x, y, frame: name, band } = now.character;
    const [direction, index] = name.split('_');
    assert.equal(direction, DIRS[row], `${renderer}, ${why}: the facing shown`);
    const drawn = await pixels(x - PIVOT.x - now.camera.x, y - PIVOT.y - now.camera.y, CELL.width, CELL.height);
    const wrong = differs(drawn, expectedCell(clip, row, Number(index)), CELL.width);
    assert.equal(wrong, '', `${renderer}, ${why}: ${clip} ${name} must be drawn as its cell; ${wrong}`);
    return { index: Number(index), band };
  }

  // 1. Loading: the idle sheet brought the other clips, the cued effects and the impact the bolt follows; the limit cut the
  // clips into bands of whole cells, the sources of each one's texture, and left the effects and the panel whole.
  const loaded = await state();
  assert.deepEqual(loaded.warnings, [], 'nothing failed to load');
  assert.equal(loaded.renderer, renderer, `the page runs on ${renderer}`);
  if (renderer === 'canvas') assert.equal(loaded.camera.roundPixels, false, 'on canvas the plugin turns the cameras\' roundPixels off (pixelArt turns it on)');
  assert.deepEqual(loaded.sources, { 'characters/dummy/idle': 2, 'characters/dummy/walk': 4, 'vfx/spark': 1, 'ui/panel': 1 }, 'the walk (96 × 128 px) in four bands, the packed idle in two, the spark and the panel whole');
  assert.deepEqual([loaded.character.texture, loaded.character.frame, loaded.character.x, loaded.character.y], ['characters/dummy/idle', 'S_0', 0, 0], 'idle, facing the camera, feet on the floor\'s origin');
  assert.deepEqual([loaded.character.originX, loaded.character.originY], [PIVOT.x, PIVOT.y], 'the origin is the pivot, in the untrimmed cell');
  await step();
  assert.deepEqual(await drawsItsCell('idle', 0, 'idle (packed: a trimmed frame on the first band)'), { index: 0, band: 0 });
  await step(15);
  assert.deepEqual(await drawsItsCell('idle', 0, 'idle, its second trimmed frame (4 fps: after 15 steps)'), { index: frameAfter(16, 4, 2), band: 0 });
  assert.equal(frameAfter(16, 4, 2), 1, 'the second frame');

  // 2. Walking: D steers east at the walk's ground speed (30 world units a second, × 2 px at the export's scale).
  await page.keyboard.down('d');
  await step(30);
  let now = await state();
  assert.equal(now.character.clip, 'walk');
  assert.ok(Math.abs(now.character.pos.x - 30 * 30 * STEP) < 1e-9 && now.character.pos.y === 0, `half a second of walking is 15 world units east: ${JSON.stringify(now.character.pos)}`);
  assert.equal(now.character.x, Math.round(now.character.pos.x * SCALE), 'drawn at whole px');
  assert.ok(now.clips.includes('walk:step:legL') && now.clips.includes('walk:step:legR'), `the walk's footsteps fire: ${now.clips.join(', ')}`);
  // Frames of the walk as the clock reaches them (8 fps: one frame every 7.5 steps), facing east: the bands of its last two rows.
  const walked = new Set<string>();
  for (let steps = 30; steps < 38; steps++) {
    const { index, band } = await drawsItsCell('walk', 3, `walking east, step ${steps}`);
    assert.equal(index, frameAfter(steps, 8, 4), `the walk's frame after ${steps} steps`);
    walked.add(`${index}@${band}`);
    await step();
  }
  assert.deepEqual([...walked].sort(), ['0@2', '3@3'], 'the walk moved on a frame, from one band to another');

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
  // The packed idle facing east is on its second band: both its frames, a quarter of a second apart.
  const east = await drawsItsCell('idle', 3, 'idle facing east (packed: a trimmed frame on the second band)');
  await step(15);
  const eastNext = await drawsItsCell('idle', 3, 'idle facing east, 15 steps later');
  assert.deepEqual([east.band, eastNext.band, east.index !== eastNext.index], [1, 1, true], `both of idle's east frames are on its second band: ${JSON.stringify([east, eastNext])}`);

  // 4. An action: 1 plays the first action (attack: the slash), whose hit cues the spark at the tip socket.
  log('slash');
  now = await state();
  const clipsBefore = now.clips.length;
  const fxBefore = now.fx.length;
  await page.keyboard.press('1');
  await step();
  now = await state();
  assert.equal(now.character.clip, 'slash', '1 slashes, even when the key was let go before the step');
  assert.equal((await drawsItsCell('slash', 3, 'the first frame of the slash')).index, 0);
  await step(6);
  assert.equal((await drawsItsCell('slash', 3, 'before the hit')).index, 1);
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
  const flying = now.effects[0];
  assert.equal(flying.x - bolt.x, Math.round(120 * 10 * STEP * SCALE), 'it flies at its travel speed (120 world units a second)');
  // Clear of the character by now: its frame on the canvas is the fixture's, pixel for pixel, transparent corners included.
  const [boltRow, boltFrame] = [DIRS.indexOf(flying.frame.split('_')[0]), Number(flying.frame.split('_')[1])];
  assert.deepEqual([flying.originX, flying.originY], [FX.bolt.size / 2, FX.bolt.size / 2], 'an effect\'s origin is its pivot, the middle of its frame');
  const drawnBolt = await pixels(flying.x - flying.originX - now.camera.x, flying.y - flying.originY - now.camera.y, FX.bolt.size, FX.bolt.size);
  const wrongBolt = differs(drawnBolt, expectedFx('bolt', boltRow, boltFrame), FX.bolt.size);
  assert.equal(wrongBolt, '', `${renderer}: the bolt's ${flying.frame} must be drawn as its cell; ${wrongBolt}`);
  await step(40);
  now = await state();
  assert.deepEqual(now.fx.slice(fxCast), ['start:bolt', 'bolt:end', 'start:burst', 'burst:hit', 'burst:end'], `at the end of its range it ends, and the burst plays there with its hit: ${now.fx.slice(fxCast).join(', ')}`);

  // 6. Depth: actors on one level are drawn in the order they were added, whatever their ids (70000 and 80000 are both past
  // the 65536 orders of depthKey) and whatever their places in the display list.
  await page.evaluate(() => {
    window.smoke!.add(80000, 45, 0);
    window.smoke!.add(70000, 45, 0);
    window.smoke!.toBack('dummy-70000');
    window.smoke!.toBack('dummy-80000');
  });
  await step();
  const order = (await page.evaluate(() => window.smoke!.order())).filter((name) => name.startsWith('dummy-'));
  assert.deepEqual(order, ['dummy-1', 'dummy-80000', 'dummy-70000'], `actors on one level are drawn in the order they were added: ${order.join(', ')}`);

  // 7. The nine-slice: nine Images from the runtime's parts draw the panel at 40 × 30, borders kept, edges stretched.
  const drawn = await pixels(200, 8, 40, 30);
  const parts = nineSlice({ x: 0, y: 0, width: PANEL.size, height: PANEL.size }, { left: PANEL.inset, top: PANEL.inset, right: PANEL.inset, bottom: PANEL.inset }, 1, 40, 30);
  assert.equal(parts.length, 9);
  const map = (v: number, size: number) => (v < PANEL.inset ? v : v >= size - PANEL.inset ? PANEL.size - (size - v) : PANEL.inset);
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 40; x++) {
      const at = (y * 40 + x) * 4;
      assert.deepEqual(drawn.slice(at, at + 4), panelPixel(map(x, 40), map(y, 30)), `${renderer}: the panel's pixel (${x}, ${y})`);
    }
  }

  assert.deepEqual(problems, [], 'no page errors or warnings');
  await page.close();
}

/** A heading for the log, so a failure says which part it was in. */
function log(part: string) {
  console.log(`    ${part}`);
}
