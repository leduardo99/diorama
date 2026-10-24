/**
 * A character as a Phaser Sprite, played by the runtime's clip player rather than by Phaser's animations: each step steers
 * its actor (`steer`, which also moves the clocks, root motion included), shows the frame the runtime says (`shownFrame`,
 * by its atlas name on the sheet's texture) with its feet on the actor's floor point, and sorts it by `depthKey` with the
 * order the plugin added it in, so actors on one level are drawn in that order whatever their ids and the display list.
 * Positions are rounded to whole pixels, so every frame is drawn pixel for pixel.
 */

import Phaser from 'phaser';
import {
  FREE_FLOOR, createActor, depthKey, face, play, projectionOf, reset, shownFrame, stance, steer, toScreen,
  type Actor, type Character, type ClipEvent, type Floor, type Input, type Projection, type Vec2,
} from '@diorama/runtime';
import type { KeyboardControls } from './controls.js';
import { EVENTS } from './events.js';
import type { DioramaPlugin } from './plugin.js';
import { frameNameOf } from './sheets.js';

/** How a character is put on the floor. */
export interface CharacterOptions {
  /** Your id for it, unique among the characters of a scene: the runtime hands it back on events (`event.actor.id`). Any number: equal depths are ordered by `order`, not by it. */
  id: number;
  /** The clip it starts in (a key of its manifest), default its idle. */
  clip?: string;
  /** Its facing: a row of its sheets, or a heading (a world yaw: 0 east, π/2 south, toward the camera). */
  row?: number;
  heading?: number;
  /** World units its body reaches from its feet, for the floor's walls. */
  radius?: number;
  /** What the ground allows of a move (a scene's `moveIn`), default `FREE_FLOOR`. */
  floor?: Floor;
  /** Where its floor points are drawn, default the plugin's `projection`, else its own camera with the floor's origin at world (0, 0). */
  projection?: Projection;
}

export class DioramaCharacter extends Phaser.GameObjects.Sprite {
  /** The runtime's actor: where it stands (`pos`, world units), its clips, its facing. */
  readonly actor: Actor;
  /** What it is steered by on the next step: set by its `controls`, or by the game (any length; none to stand). */
  steering: Input = { dx: 0, dy: 0, run: false };
  /** What the ground allows of a move. */
  floor: Floor;
  /** Its own projection; null for the plugin's, or its camera's. */
  projection: Projection | null;
  /** Where it is drawn among the actors on one level (`depthKey`'s order): the order the plugin added it in, which the plugin sets. */
  order = 0;
  /** Where its `fly` cues head (a floor point); null to fly along the facing the action started with. */
  aim: Vec2 | null = null;
  /** The events its clips fired on its last step. */
  fired: ClipEvent[] = [];

  /** Its character's camera: tilt and export scale, the floor's origin at world (0, 0). */
  private readonly camera: Projection;
  /** The plugin of its scene, which plays the effects its clips cue (kept after it is destroyed, for its effects still playing). */
  private readonly plugin: DioramaPlugin | null;
  private keys: KeyboardControls | null = null;

  constructor(scene: Phaser.Scene, character: Character, pos: Vec2, options: CharacterOptions) {
    const clip = options.clip === undefined ? undefined : character.clips.find((c) => c.key === options.clip);
    if (options.clip !== undefined && !clip) throw new Error(`@diorama/phaser: ${character.folder} has no clip "${options.clip}" (it has ${character.clips.map((c) => c.key).join(', ')})`);
    const actor = createActor(character, pos, { id: options.id, clip, row: options.row, heading: options.heading, radius: options.radius });
    const shown = shownFrame(actor);
    super(scene, 0, 0, shown.frame.sheet, frameNameOf(shown.clip.atlas, shown.rect));
    this.actor = actor;
    this.floor = options.floor ?? FREE_FLOOR;
    this.projection = options.projection ?? null;
    this.camera = projectionOf(null, { tilt: character.tilt, scale: character.scale });
    this.plugin = (scene as { diorama?: DioramaPlugin }).diorama ?? null;
    this.plugin?.enlist(this);
    this.once(Phaser.GameObjects.Events.DESTROY, this.destroyed, this);
    this.sync();
  }

  /** The keyboard, when the plugin's `controls` gave it one: read at the start of each step. Its own: replacing it, or destroying the character, destroys it. */
  get controls(): KeyboardControls | null {
    return this.keys;
  }

  set controls(controls: KeyboardControls | null) {
    if (this.keys && this.keys !== controls) this.keys.destroy();
    this.keys = controls;
  }

  /** Where its floor points are drawn now, and its effects' (`projection`, else the plugin's, else its camera). */
  get drawnWith(): Projection {
    return this.projection ?? this.plugin?.projection ?? this.camera;
  }

  /** The character it plays: its clips, the bindings of its controls (`locomotion`, `actions`), its camera and cues. */
  get character(): Character {
    return this.actor.character!;
  }

  /** Starts an action (a clip key), if priority and `cancel` allow it; false when refused. Its first events come with the next step. */
  act(key: string): boolean {
    return play(this.actor, key);
  }

  /** A looping clip as its base instead of idle (a defend pose, a cast loop); null back to idle. False when it has no such loop. */
  stance(key: string | null): boolean {
    const ok = stance(this.actor, key);
    this.sync();
    return ok;
  }

  /** Turns it to the row nearest a heading (a world yaw). */
  face(heading: number): this {
    face(this.actor, heading);
    return this.sync();
  }

  /** Back to idle: forgets the action, a held last frame and the stance. */
  reset(): this {
    reset(this.actor);
    return this.sync();
  }

  /** One step: the keyboard, then the runtime (`steer`), then the frame, position and depth; then its events, and the effects they cue. */
  protected override preUpdate(_time: number, delta: number) {
    this.controls?.read(this);
    this.fired = steer(this.actor, this.steering, delta / 1000, this.floor);
    this.sync();
    const plugin = this.plugin;
    for (const event of this.fired) {
      this.emit(EVENTS.CLIP, event, this);
      plugin?.clip(event, this);
    }
  }

  /** Shows what the runtime says: the frame by its atlas name, the feet on the floor point (whole px), the depth of an actor. */
  sync(): this {
    const { frame, rect, clip } = shownFrame(this.actor);
    const name = frameNameOf(clip.atlas, rect);
    if (this.texture.key !== frame.sheet || this.frame.name !== name) this.setTexture(frame.sheet, name);
    const feet = toScreen(this.drawnWith, this.actor.pos);
    this.setPosition(Math.round(feet.x), Math.round(feet.y));
    this.setDepth(depthKey(feet.y, 'actor', this.order));
    return this;
  }

  /** Destroyed: its keyboard stops listening, and the plugin ends the effects that follow it or loop with its clip. */
  private destroyed() {
    this.controls = null;
    this.plugin?.dismiss(this);
  }
}
