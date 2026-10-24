/**
 * The sandbox: one character of the sample on an empty floor, played by @diorama/phaser from the exports in assets/. W, A,
 * S and D walk at the clip's own ground speed, Shift runs, and 1 to 9 play the character's actions (the guard's 1 slashes
 * with its spark, Malvek's 2 casts the soul bolt). A panel drawn from the dialog-panel nine-slice lists the keys and the
 * last events.
 */

import Phaser from 'phaser';
import { EVENTS, KeyboardControls, type DioramaCharacter } from '@diorama/phaser';
import type { ClipEvent, Floor, FxEvent, Vec2 } from '@diorama/runtime';

/** The characters the sandbox plays, by the `?sandbox=` that picks one. */
export const SANDBOXES = {
  guard: { folder: 'characters/guard', note: '1 slashes with its spark' },
  malvek: { folder: 'characters/malvek', note: '2 casts the soul bolt' },
} as const;
export type SandboxName = keyof typeof SANDBOXES;

export const SIZE = { width: 1280, height: 720 };
/** Where the floor's origin is on the canvas: the camera scrolls by whole px, so frames stay on the pixel grid. */
const ORIGIN = { x: 640, y: 440 };
/** Over everything on the floor (`depthKey` stays far under it on any canvas): the panel, then its text. */
const HUD_DEPTH = 2 ** 40;
/** The part of the floor a character may walk on, world units: it stays in view. */
const ARENA = { left: -260, right: 260, top: -80, bottom: 110 };

/** A floor that stops at the arena's edges. */
const arena: Floor = {
  move: (from: Vec2, delta: Vec2) => ({
    x: Math.min(ARENA.right, Math.max(ARENA.left, from.x + delta.x)),
    y: Math.min(ARENA.bottom, Math.max(ARENA.top, from.y + delta.y)),
  }),
};

export class SandboxScene extends Phaser.Scene {
  character!: DioramaCharacter;
  /** The last events, newest first, for the panel (and for a test). */
  readonly log: string[] = [];
  private readout!: Phaser.GameObjects.Text;

  constructor(private readonly which: SandboxName) {
    super('sandbox');
  }

  preload() {
    // The idle clip brings the character's other clips and the effects they cue (the contract's dependencies). The page is
    // game/index.html, so the project's exports are ../assets/ from it.
    this.diorama.load([`${SANDBOXES[this.which].folder}/idle`, 'ui/dialog-panel'], { assets: '../assets/' });
  }

  create() {
    this.cameras.main.setScroll(-ORIGIN.x, -ORIGIN.y);
    this.character = this.diorama.add.character(SANDBOXES[this.which].folder, { x: 0, y: 0 }, { id: 1, floor: arena });
    this.diorama.controls(this.character);

    // The panel stays on the screen whatever the camera does: its parts and the text scroll with nothing.
    const keys = KeyboardControls.legend(this.character).map(([key, clip]) => `${key} ${clip}`).join('  ');
    this.diorama.add.nineSlice(16, 16, 'ui/dialog-panel', 600, 132).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.add.text(44, 38, [`${this.character.character.name}: ${SANDBOXES[this.which].note}`, 'WASD walk, Shift run', keys].join('\n'), { fontFamily: 'monospace', fontSize: '15px', color: '#f5f3fa', lineSpacing: 4 })
      .setScrollFactor(0).setDepth(HUD_DEPTH + 1);
    this.readout = this.add.text(44, 108, '', { fontFamily: 'monospace', fontSize: '13px', color: '#e6a15c' }).setScrollFactor(0).setDepth(HUD_DEPTH + 1);

    // The plugin's events outlive a restart of the scene: these listeners go when it shuts down, so a restart adds them once.
    const onClip = (event: ClipEvent) => this.note(`${event.clip.key} ${event.name} (frame ${event.frame})`);
    const onFx = (event: FxEvent) => this.note(`${event.fx.sheet.id} ${event.name}`);
    this.diorama.events.on(EVENTS.CLIP, onClip).on(EVENTS.FX, onFx);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.diorama.events.off(EVENTS.CLIP, onClip).off(EVENTS.FX, onFx));
    for (const warning of this.diorama.warnings) this.note(`warning: ${warning}`);
  }

  private note(line: string) {
    // Footsteps would drown everything else out.
    if (line.includes(' step:')) return;
    this.log.unshift(line);
    this.log.length = Math.min(this.log.length, 40);
    this.readout.setText(this.log.slice(0, 1).join(''));
  }
}
