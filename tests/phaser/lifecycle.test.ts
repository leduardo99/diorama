/**
 * @diorama/phaser across a scene's life, in headless Chromium (tests/phaser/page/lifecycle.ts, the generated fixtures of
 * tests/phaser/fixtures.ts): loads that go on with the game loop asleep and two downloads at a time, a scene restarted with a
 * sheet that is missing, a scene stopped in the middle of its load and started again, two scenes loading the same sheets at
 * once; then what a character takes with it when it goes (its keyboard listeners, the effects that follow it), where its
 * effects are drawn when it has a projection of its own, the cameras' roundPixels on canvas and a text field next to the game.
 */

import assert from 'node:assert/strict';
import type { Page, Route } from 'playwright';
import { depthKey } from '@diorama/runtime';
import { PIVOT, SCALE } from './fixtures';
import { serve, type Served } from './serve';
// The page's `window.lifecycle`, for the types of what the test reads.
import type {} from './page/lifecycle';

console.log('🧪 Checking @diorama/phaser across a scene\'s life: restarts, stopped and shared loads, a sleeping loop, what a character takes with it...\n');

/** The character's clips, in the order of their sheets' paths whatever order they came in. */
const ALL_CLIPS = 'a character with cast, idle, run, slash, walk';
/** Every sheet the character's idle brings: its clips, the effects they cue and the impact the bolt follows. */
const SHEETS = ['idle', 'walk', 'run', 'slash', 'cast'].map((clip) => `characters/dummy/${clip}`).concat(['vfx/spark', 'vfx/bolt', 'vfx/burst']);
const textures = (page: Page) => page.evaluate((paths) => window.lifecycle!.textures(paths), SHEETS);
let served: Served | undefined;

/** A page of the test, with the page's errors and warnings collected. */
async function open({ base, browser }: Served, query = '', routes: (page: Page) => Promise<void> = async () => {}) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.stack ?? error.message}`));
  page.on('console', (message) => {
    // The GPU's own notes (SwiftShader's, when the browser reads a canvas back) are not the page's.
    if ((message.type() === 'error' || message.type() === 'warning') && !/GPU stall|GL Driver Message/i.test(message.text())) problems.push(`${message.type()}: ${message.text()}`);
  });
  await routes(page);
  await page.goto(`${base}/lifecycle${query}`);
  await page.waitForFunction(() => !!window.lifecycle, null, { timeout: 60_000 });
  return { page, problems };
}

/** Waits until the page's scenes were created this many times (`{ a: 1 }`), without stepping the game. */
const createdTimes = (page: Page, times: Record<string, number>) =>
  page.waitForFunction((want) => Object.entries(want).every(([key, n]) => window.lifecycle!.created[key] === n), times, { timeout: 15_000, polling: 50 });

try {
  served = await serve({ '/lifecycle': { module: '/tests/phaser/page/lifecycle.ts', body: '<input id="field" />' } });

  // 1. A load never waits on the game loop: with the loop asleep and two downloads at a time, the idle sheet, the clips it
  // brings, their effects and the impact the bolt follows all load, and the scene is created without a single step.
  {
    const { page, problems } = await open(served);
    await createdTimes(page, { a: 1 }).catch((error: Error) => {
      throw new Error(`the load stalled with the loop asleep and maxParallelDownloads 2: ${error.message}`);
    });
    assert.deepEqual(await textures(page), SHEETS, 'every sheet is a texture');
    assert.deepEqual(await page.evaluate(() => window.lifecycle!.log), [`a: ${ALL_CLIPS}`], 'the character has all its clips when the scene is created');

    // 2. A restarted scene loads again, its warnings included: a sheet that is not there is a warning, not a load that
    // never ends (Phaser takes every listener off a scene's loader when the scene shuts down).
    await page.evaluate(() => {
      window.lifecycle!.restart(['characters/nobody/idle']);
      window.lifecycle!.step();
    });
    await createdTimes(page, { a: 2 }).catch((error: Error) => {
      throw new Error(`the restarted scene was not created again: ${error.message}\n${problems.join('\n')}`);
    });
    const warnings = await page.evaluate(() => window.lifecycle!.warnings());
    assert.equal(warnings.length, 1, `one warning: ${warnings.join(' | ')}`);
    assert.match(warnings[0], /^characters\/nobody\/idle: http:\/\/127\.0\.0\.1:\d+\/fixtures\/characters\/nobody\/idle\.json could not be fetched$/);
    assert.ok(problems.some((p) => p.includes('@diorama/phaser: characters/nobody/idle')), 'and on the console');

    // 3. An effect is drawn where the character that cued it is drawn: by the character's own projection, position and depth.
    const drawn = await page.evaluate(() => window.lifecycle!.projection());
    assert.deepEqual(drawn.character.slice(0, 2), [50, 30], 'the character stands on its projection\'s origin');
    // The tip socket is (10, 6) logical px of the cell: (20, 12) exported px, less the pivot (12, 28), from the feet.
    assert.deepEqual(drawn.spark?.slice(0, 2), [50 + 10 * SCALE - PIVOT.x, 30 + 6 * SCALE - PIVOT.y], `its spark is at its tip, on the same projection: ${JSON.stringify(drawn)}`);
    assert.equal(drawn.spark?.[2], depthKey(30, 'fx', 0), 'and sorted on the character\'s level (screen y 30), over it');
    assert.ok(drawn.spark![2] > drawn.character[2], 'drawn over the character');

    // 4. Controls given twice leave one listener, and none once the character is destroyed; the keys are not captured.
    const controls = await page.evaluate(() => window.lifecycle!.controls());
    assert.deepEqual([controls.twice, controls.destroyed], [1, 0], `keyboard listeners on 1: ${JSON.stringify(controls)}`);
    assert.deepEqual(controls.captures, [], 'no key is captured on the window');
    // So a text field on the page types while a character has controls.
    await page.focus('#field');
    await page.keyboard.type('wasd 1 2 W');
    assert.equal(await page.inputValue('#field'), 'wasd 1 2 W', 'typing in a text field next to the game is not stopped');

    // 5. A destroyed character's effects that follow it or loop with its clip end on the next step; a one-shot plays on.
    const gone = await page.evaluate(() => window.lifecycle!.destroyWithEffects());
    assert.deepEqual(gone.playing, ['spark:follow', 'bolt:stay:until', 'spark:stay'], 'three effects play');
    assert.deepEqual(gone.after, ['spark:stay'], 'the following spark and the looping bolt end with the character');
    assert.deepEqual(gone.events, ['spark:end', 'bolt:end'], 'each with its end');

    // 6. Orders stay within depthKey's 65536 when a scene has added more: the characters and the effects still there are
    // numbered again from 0, in the order they came, so the newest is still drawn last on its level.
    const outgrown = await page.evaluate(() => window.lifecycle!.outgrown());
    assert.deepEqual(outgrown.actors, [0, 1, 2], `the scene's character, then the two new ones: ${JSON.stringify(outgrown)}`);
    assert.ok(outgrown.depths[0] < outgrown.depths[1] && outgrown.fxDepths[0] < outgrown.fxDepths[1], `the newer of each pair is drawn over the older: ${JSON.stringify(outgrown)}`);

    // 7. On canvas, a camera added after the scene was created draws without roundPixels too.
    assert.equal(await page.evaluate(() => window.lifecycle!.cameraAfterCreate()), false, 'a camera added later has roundPixels off');
    // The missing sheet's 404, which the browser reports too, aside.
    assert.deepEqual(problems.filter((p) => !p.includes('characters/nobody/idle') && !p.includes('status of 404')), [], 'no other page errors or warnings');
    await page.close();
  }

  // 8. A scene stopped in the middle of its load, then started again, loads everything: what the stopped load had not
  // finished is fetched again, and what it still received after it stopped is dropped.
  {
    // The first request for the walk clip's atlas is held until the scene has stopped.
    let held = false;
    let release = () => {};
    let asked = () => {};
    const released = new Promise<void>((done) => (release = done));
    const walkAsked = new Promise<void>((done) => (asked = done));
    const { page, problems } = await open(served, '', (page) =>
      page.route('**/fixtures/characters/dummy/walk.json', async (route: Route) => {
        if (held) return route.continue();
        held = true;
        asked();
        await released;
        await route.continue();
      }),
    );
    await walkAsked;
    assert.equal(await page.evaluate(() => window.lifecycle!.created.a ?? 0), 0, 'and the scene waits for it');
    await page.evaluate(() => window.lifecycle!.stop());
    const late = page.waitForResponse((response) => response.url().endsWith('/characters/dummy/walk.json'));
    release();
    await late;
    // The stopped load's walk came after it stopped: give the page a moment to hand it over, then start the scene again.
    await page.evaluate(() => new Promise((done) => setTimeout(done, 100)));
    await page.evaluate(() => window.lifecycle!.start());
    await createdTimes(page, { a: 1 }).catch((error: Error) => {
      throw new Error(`the scene started again was not created: ${error.message}\n${problems.join('\n')}`);
    });
    assert.deepEqual(await textures(page), SHEETS, 'every sheet is a texture');
    assert.deepEqual(await page.evaluate(() => window.lifecycle!.log), [`a: ${ALL_CLIPS}`], 'the character has all its clips');
    assert.deepEqual([await page.evaluate(() => window.lifecycle!.warnings()), problems], [[], []], 'no warnings, no page errors');
    await page.close();
  }

  // 9. Two scenes that load the same sheets at once are both created with all of them: the second does not take the
  // first one's load for its own.
  {
    const { page, problems } = await open(served, '?scenes=two');
    await createdTimes(page, { a: 1, b: 1 }).catch((error: Error) => {
      throw new Error(`both scenes were not created: ${error.message}\n${problems.join('\n')}`);
    });
    assert.deepEqual((await page.evaluate(() => window.lifecycle!.log)).sort(), [`a: ${ALL_CLIPS}`, `b: ${ALL_CLIPS}`], 'each has the character with all its clips');
    assert.deepEqual(await textures(page), SHEETS, 'every sheet is a texture, once');
    assert.deepEqual([await page.evaluate(() => window.lifecycle!.warnings()), problems], [[], []], 'no warnings (a texture made twice would be one), no page errors');
    await page.close();
  }

  console.log('✔ Loads went on with the loop asleep, restarted and stopped scenes loaded again, two scenes shared their sheets; a destroyed character took its listeners and effects with it.\n');
} finally {
  await served?.close();
}
