/**
 * Keyboard controls from a character's manifest (`controls`, which the runtime turns into `locomotion` and `actions`): W, A,
 * S and D steer, Shift runs in the last move clip, and 1 to 9 play the actions in the runtime's order (attack, skill, dodge,
 * jump...). The keys are read at the start of the character's step: steering is what is held then, and a digit pressed since
 * the last step plays its action even when it was let go before the step came. The keys are not captured: Phaser's capture
 * would stop every W, A, S, D, Shift and digit on the whole window, and a text field on the page could not be typed in.
 */

import Phaser from 'phaser';
import type { DioramaCharacter } from './character.js';

/** The digit keys, bound to `character.actions` in order. */
const ACTION_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'] as const;

type Moves = Record<'W' | 'A' | 'S' | 'D' | 'SHIFT', Phaser.Input.Keyboard.Key>;

export class KeyboardControls {
  private readonly moves: Moves;
  private readonly actions: Phaser.Input.Keyboard.Key[];
  /** The digits pressed since the last read, in order (a key's `down` comes as the browser sends it, between steps). */
  private readonly pressed: number[] = [];
  private readonly listeners: (() => void)[];
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('@diorama/phaser: keyboard controls need the keyboard plugin (input.keyboard is on by default in the game config)');
    this.moves = keyboard.addKeys('W,A,S,D,SHIFT', false) as Moves;
    this.actions = ACTION_KEYS.map((name) => keyboard.addKey(name, false));
    this.listeners = this.actions.map((key, index) => {
      const listener = () => this.pressed.push(index);
      key.on(Phaser.Input.Keyboard.Events.DOWN, listener);
      return listener;
    });
  }

  /** Sets the character's steering from W, A, S, D and Shift, and plays the actions of the digits pressed since the last read. */
  read(character: DioramaCharacter) {
    if (this.destroyed) return;
    const { W, A, S, D, SHIFT } = this.moves;
    character.steering = { dx: Number(D.isDown) - Number(A.isDown), dy: Number(S.isDown) - Number(W.isDown), run: SHIFT.isDown };
    for (const index of this.pressed.splice(0)) {
      const clip = character.character.actions[index];
      if (clip) character.act(clip.key);
    }
  }

  /** Stops listening to the digits (the character does it when it is destroyed, or given other controls). The keys stay the scene's. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.actions.forEach((key, index) => key.off(Phaser.Input.Keyboard.Events.DOWN, this.listeners[index]));
    this.pressed.length = 0;
  }

  /** The action each digit plays, for a legend: `[['1', 'slash'], ['2', 'cleave'], ...]`. */
  static legend(character: DioramaCharacter): [key: string, clip: string][] {
    return character.character.actions.slice(0, ACTION_KEYS.length).map((clip, index) => [String(index + 1), clip.key]);
  }
}
