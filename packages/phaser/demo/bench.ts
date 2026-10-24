/**
 * The test bench's scene: one character of a project on an empty floor, played by the package from the project's exports.
 * W, A, S and D walk at the clip's own ground speed, Shift runs, and 1 to 9 play the character's actions (with the effects
 * they cue). A panel, drawn from the project's `ui/dialog-panel` nine-slice when it has one, lists the keys and the last
 * event.
 */

import Phaser from 'phaser';
import type { ClipEvent, Floor, FxEvent, Vec2 } from '@diorama/runtime';
import { EVENTS, KeyboardControls, type DioramaCharacter } from '../src/index.js';

export const SIZE = { width: 1280, height: 720 };
/** Where the floor's origin is on the canvas: the camera scrolls by whole px, so frames stay on the pixel grid. */
const ORIGIN = { x: 640, y: 440 };
/** Over everything on the floor (`depthKey` stays far under it on any canvas): the panel, then its text. */
const HUD_DEPTH = 2 ** 40;
/** The part of the floor a character may walk on, world units: it stays in view. */
const ARENA = { left: -260, right: 260, top: -80, bottom: 110 };
/** The panel's nine-slice, when the project exports one. */
const PANEL = 'ui/dialog-panel';

/** A floor that stops at the arena's edges. */
const arena: Floor = {
  move: (from: Vec2, delta: Vec2) => ({
    x: Math.min(ARENA.right, Math.max(ARENA.left, from.x + delta.x)),
    y: Math.min(ARENA.bottom, Math.max(ARENA.top, from.y + delta.y)),
  }),
};

/** A name as a person reads it: `ossuary-guard` is "Ossuary guard". */
export function readable(name: string): string {
  const words = name.split(/[-_\s]+/).filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface BenchOptions {
  /** The character's folder in the exports: `characters/guard`. */
  folder: string;
  /** Where the project's exports are served: `/projects/soulkeeper/assets/`. */
  assets: string;
  /** Called instead of playing when the folder loaded no character with a manifest. */
  onUnknown: () => void;
}

export class BenchScene extends Phaser.Scene {
  character!: DioramaCharacter;
  /** The last events, newest first, for the panel (and for a test). */
  readonly log: string[] = [];
  private readout!: Phaser.GameObjects.Text;

  constructor(private readonly options: BenchOptions) {
    super('bench');
  }

  preload() {
    // The idle clip brings the character's other clips and the effects they cue (the contract's dependencies). What is
    // missing (a project without the panel) is only a warning.
    this.diorama.load([`${this.options.folder}/idle`, PANEL], { assets: this.options.assets });
  }

  create() {
    // A folder whose clips carry no manifest (or that is not there) loads nothing to play.
    const found = this.diorama.library.characters.find((c) => c.folder === this.options.folder && c.manifest !== null);
    if (!found) {
      this.options.onUnknown();
      return;
    }
    this.cameras.main.setScroll(-ORIGIN.x, -ORIGIN.y);
    this.character = this.diorama.add.character(found, { x: 0, y: 0 }, { id: 1, floor: arena });
    this.diorama.controls(this.character);

    // The panel stays on the screen whatever the camera does: its parts and the text scroll with nothing.
    const keys = KeyboardControls.legend(this.character).map(([key, clip]) => `${key} ${clip}`).join('  ');
    if (this.diorama.library.ui.has(PANEL)) this.diorama.add.nineSlice(16, 16, PANEL, 600, 132).setScrollFactor(0).setDepth(HUD_DEPTH);
    else this.add.rectangle(16, 16, 600, 132, 0x1d1a24, 0.92).setOrigin(0).setStrokeStyle(1, 0x3a3546).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.add.text(44, 38, [readable(found.name), 'WASD walk, Shift run', keys].join('\n'), { fontFamily: 'monospace', fontSize: '15px', color: '#f5f3fa', lineSpacing: 4 })
      .setScrollFactor(0).setDepth(HUD_DEPTH + 1);
    this.readout = this.add.text(44, 108, '', { fontFamily: 'monospace', fontSize: '13px', color: '#e6a15c' }).setScrollFactor(0).setDepth(HUD_DEPTH + 1);

    // The plugin's events outlive a restart of the scene: these listeners go when it shuts down, so a restart adds them once.
    const onClip = (event: ClipEvent) => this.note(`${event.clip.key} ${event.name} (frame ${event.frame})`);
    const onFx = (event: FxEvent) => this.note(`${event.fx.sheet.id} ${event.name}`);
    this.diorama.events.on(EVENTS.CLIP, onClip).on(EVENTS.FX, onFx);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.diorama.events.off(EVENTS.CLIP, onClip).off(EVENTS.FX, onFx));
    for (const warning of this.diorama.warnings) if (!warning.includes(PANEL)) this.note(`warning: ${warning}`);
  }

  private note(line: string) {
    // Footsteps would drown everything else out.
    if (line.includes(' step:')) return;
    this.log.unshift(line);
    this.log.length = Math.min(this.log.length, 40);
    this.readout.setText(this.log.slice(0, 1).join(''));
  }
}
