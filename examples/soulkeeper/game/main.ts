/**
 * Soulkeeper's game page (`npm run game -- soulkeeper`, or /examples/soulkeeper/game/ under `npm run view`). For now it
 * is a sandbox: `?sandbox=guard` (the default) or `?sandbox=malvek`. `?renderer=canvas` or `webgl` picks a renderer
 * (default: WebGL when the browser has it), and `?clock=manual` stops the loop for a test, which then steps it with
 * `window.sandbox.step(frames)`.
 */

import Phaser from 'phaser';
import { manualClock, sleepOnStart, withDiorama } from '@diorama/phaser';
import { SANDBOXES, SIZE, SandboxScene, type SandboxName } from './sandbox';

const query = new URLSearchParams(location.search);
const which = (query.get('sandbox') ?? 'guard') as SandboxName;
const manual = query.get('clock') === 'manual';
const renderers: Record<string, number> = { canvas: Phaser.CANVAS, webgl: Phaser.WEBGL };

declare global {
  interface Window {
    /** What a test reads and drives: the game, the scene, and with `?clock=manual`, the clock. */
    sandbox?: { game: Phaser.Game; scene: () => SandboxScene; step?: (frames?: number, ms?: number) => void };
  }
}

if (!(which in SANDBOXES)) {
  document.body.textContent = `Unknown sandbox "${which}": ?sandbox=${Object.keys(SANDBOXES).join(' or ?sandbox=')}.`;
} else {
  const game = new Phaser.Game(withDiorama({
    type: renderers[query.get('renderer') ?? ''] ?? Phaser.AUTO,
    parent: 'game',
    width: SIZE.width,
    height: SIZE.height,
    backgroundColor: '#14121a',
    banner: false,
    audio: { noAudio: true },
    // One canvas px per screen px: every frame is drawn as it was exported.
    scale: { mode: Phaser.Scale.NONE, zoom: 1 },
    scene: new SandboxScene(which),
    callbacks: manual ? { postBoot: sleepOnStart } : {},
  }));
  window.sandbox = { game, scene: () => game.scene.getScene('sandbox') as SandboxScene, step: manual ? manualClock(game) : undefined };
}
