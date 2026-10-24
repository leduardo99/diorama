/**
 * A game clock a test (or a replay) steps by hand: the loop sleeps and `step` calls `game.step(time, delta)` with a fixed
 * delta, so every update sees exactly the time it is given and two runs play the same frames.
 */

import type Phaser from 'phaser';

/**
 * Put it in the game config's `callbacks.postBoot`. The loop must sleep before its first frame: a scene's `create` can run
 * before the loop starts (a scene without files to load is created while the game boots), so sleeping there does nothing.
 * postBoot runs right before the loop starts, and the microtask it queues runs after that and before the first frame.
 */
export function sleepOnStart(game: Phaser.Game) {
  queueMicrotask(() => game.loop.sleep());
}

/** Steps a sleeping game by hand: `step(frames, ms)` runs that many frames of `ms` each (default one frame of 1000 / 60). */
export function manualClock(game: Phaser.Game): (frames?: number, ms?: number) => void {
  let time = 0;
  return (frames = 1, ms = 1000 / 60) => {
    for (let i = 0; i < frames; i++) {
      time += ms;
      game.step(time, ms);
    }
  };
}
