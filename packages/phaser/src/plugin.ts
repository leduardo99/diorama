/**
 * The scene plugin, `this.diorama` in every scene of a game made with `withDiorama`: it loads sheets by the contract, puts
 * characters and nine-slices on the scene, gives a character keyboard controls, and plays the effects characters cue
 * (`cues`, then `stepFx` after every character has stepped), each an Image on its sheet's texture sorted by `depthKey`,
 * where the character that cued it is drawn. It numbers the scene's characters and effects in the order they came, the
 * `order` of their depth keys, so things of one kind on one level never tie.
 */

import Phaser from 'phaser';
import {
  DEFAULT_TILT, cues, depthKey, frameOfFx, projectionOf, stepFx, toScreen,
  type Character, type ClipEvent, type Fx, type FxWorld, type Library, type Projection, type SheetPath, type UiSheet, type Vec2,
} from '@diorama/runtime';
import { DioramaCharacter, type CharacterOptions } from './character.js';
import { KeyboardControls } from './controls.js';
import { EVENTS } from './events.js';
import { libraryOf, loadSheets, registryOf, type LoadOptions } from './loader.js';
import { DioramaNineSlice } from './nine-slice.js';
import { frameNameOf } from './sheets.js';

/**
 * Depths under every `depthKey`: the ground (a scene's picture) first, then the effects of `layer: 'ground'`, which keep the
 * order they started in. Everything that stands on the floor (actors, standing items, air effects) is sorted by `depthKey`.
 */
export const DEPTH = { ground: -(2 ** 52), groundEffects: -(2 ** 51) } as const;

/** Orders of one kind on one level that `depthKey` tells apart: 0 to 65535. */
const ORDERS = 2 ** 16;

/** An effect playing, its Image, the character that cued it (where it is drawn), and the order it started in (the `order` of its depth key). */
interface Playing {
  fx: Fx;
  image: Phaser.GameObjects.Image;
  by: DioramaCharacter | null;
  order: number;
}

export class DioramaPlugin extends Phaser.Plugins.ScenePlugin {
  /** Where floor points are drawn (a character's own `projection` aside), its effects' with them; null for each character's own camera, the floor's origin at world (0, 0). */
  projection: Projection | null = null;
  /** Where the floor stops a projectile (a scene's `flightStop`); none lets it fly its whole range. */
  blocked: FxWorld['blocked'] = undefined;
  /** `clip`, `fxstart` and `fx` (`EVENTS`), for every character and effect of the scene. */
  readonly events = new Phaser.Events.EventEmitter();
  /** Game objects made from the loaded sheets, added to the scene. */
  readonly add: {
    /** A character (by its folder, `characters/guard`, or its manifest's name) standing at a floor point (world units). */
    character: (of: string | Character, pos: Vec2, options: CharacterOptions) => DioramaCharacter;
    /** A nine-slice interface piece (by its sheet path, `ui/dialog-panel`) at a screen point, `width` × `height` px. */
    nineSlice: (x: number, y: number, path: SheetPath, width: number, height: number, state?: string) => DioramaNineSlice;
  };

  private readonly host: Phaser.Scene;
  private playing: Playing[] = [];
  /** The order the next effect gets. */
  private started = 0;
  /** The scene's characters, in the order they were added. */
  private actors: DioramaCharacter[] = [];
  /** The order the next character gets. */
  private added = 0;

  constructor(scene: Phaser.Scene, pluginManager: Phaser.Plugins.PluginManager, pluginKey: string) {
    super(scene, pluginManager, pluginKey);
    this.host = scene;
    this.add = {
      character: (of, pos, options) => this.host.add.existing(new DioramaCharacter(this.host, typeof of === 'string' ? this.character(of) : of, pos, options)),
      nineSlice: (x, y, path, width, height, state) => this.host.add.existing(new DioramaNineSlice(this.host, x, y, this.ui(path), width, height, state)),
    };
  }

  override boot() {
    const events = this.host.sys.events;
    events.on(Phaser.Scenes.Events.START, this.sceneStart, this);
    events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  private sceneStart() {
    const events = this.host.sys.events;
    events.on(Phaser.Scenes.Events.POST_UPDATE, this.postUpdate, this);
    events.once(Phaser.Scenes.Events.CREATE, this.unround, this);
    events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.unround();
  }

  /**
   * On canvas, the cameras' `roundPixels` goes off, the scene's cameras' and the ones added later (the camera manager's
   * default): `pixelArt` (which `withDiorama` turns on) forces it on, and on canvas it draws frames half a pixel too large.
   * The binding rounds positions to whole pixels itself.
   */
  private unround() {
    if (this.host.game.renderer.type !== Phaser.CANVAS) return;
    const cameras = this.host.cameras;
    cameras.roundPixels = false;
    for (const camera of cameras.cameras) camera.setRoundPixels(false);
  }

  private shutdown() {
    const events = this.host.sys.events;
    events.off(Phaser.Scenes.Events.POST_UPDATE, this.postUpdate, this);
    events.off(Phaser.Scenes.Events.CREATE, this.unround, this);
    for (const { image } of this.playing) image.destroy();
    this.playing = [];
    this.started = 0;
    this.actors = [];
    this.added = 0;
  }

  override destroy() {
    this.shutdown();
    this.events.removeAllListeners();
    super.destroy();
  }

  /** Queues sheets and every sheet they need by the contract (call it in `preload`); `assets` is where the sheet paths start. */
  load(paths: SheetPath | SheetPath[], options?: LoadOptions): this {
    loadSheets(this.host, paths, options);
    return this;
  }

  /** Everything the game has loaded, as the runtime's library. */
  get library(): Library {
    return libraryOf(this.host.game);
  }

  /** What could not be fetched or read, and the sheets' own warnings. */
  get warnings(): readonly string[] {
    return registryOf(this.host.game).warnings;
  }

  /** A loaded character by its folder (`characters/guard`), its manifest's name or its id. */
  character(of: string): Character {
    const characters = this.library.characters;
    const found = characters.find((c) => c.folder === of) ?? characters.find((c) => c.name === of || c.id === of);
    if (!found) throw new Error(`@diorama/phaser: no character "${of}" is loaded (${characters.map((c) => c.folder).join(', ') || 'none'}): load one of its sheets first`);
    return found;
  }

  /** A loaded interface piece by its sheet path. */
  ui(path: SheetPath): UiSheet {
    const ui = this.library.ui.get(path);
    if (!ui) throw new Error(`@diorama/phaser: no interface piece "${path}" is loaded: load it first`);
    return ui;
  }

  /** Keyboard controls for a character, read at the start of each of its steps (`KeyboardControls`); the ones it had are destroyed. */
  controls(character: DioramaCharacter): KeyboardControls {
    const controls = new KeyboardControls(this.host);
    character.controls = controls;
    return controls;
  }

  /**
   * A character joins the scene (its constructor calls it): it gets the next order. When a scene has added more characters
   * than `depthKey`'s orders hold, the ones still there are numbered again from 0, in the order they came.
   */
  enlist(character: DioramaCharacter) {
    if (this.added >= ORDERS) {
      this.actors.forEach((one, order) => (one.order = order));
      this.added = this.actors.length;
      for (const one of this.actors) one.sync();
    }
    character.order = this.added++;
    this.actors.push(character);
  }

  /** A character was destroyed: the effects that follow it, or loop until its clip changes, end on the next step (an `end` event). */
  dismiss(character: DioramaCharacter) {
    this.actors = this.actors.filter((one) => one !== character);
    for (const { fx } of this.playing) if (fx.follow?.actor === character.actor || fx.until?.actor === character.actor) fx.done = true;
  }

  /** The effects playing now. */
  get effects(): readonly Fx[] {
    return this.playing.map((p) => p.fx);
  }

  /** The Image an effect is drawn with. */
  imageOf(fx: Fx): Phaser.GameObjects.Image | undefined {
    return this.playing.find((p) => p.fx === fx)?.image;
  }

  /** A character's clip event: passed on (`clip`), and the effects it cues start where it is drawn. Characters call it on their steps. */
  clip(event: ClipEvent, character: DioramaCharacter) {
    this.events.emit(EVENTS.CLIP, event, character);
    for (const fx of cues(event, this.library.effects, { aim: character.aim ?? undefined })) this.play(fx, character);
  }

  /**
   * Plays an effect (one of `cues`, or one of your own) from now on, drawn where `by` is drawn (its `drawnWith`): by default
   * the character whose actor it follows or loops with, else the plugin's `projection`, else the camera of its character.
   * It gets the next order; when a scene has started more effects than `depthKey`'s orders hold, the ones playing are
   * numbered again from 0, in the order they started.
   */
  play(fx: Fx, by: DioramaCharacter | null = this.actors.find((one) => one.actor === (fx.follow ?? fx.until)?.actor) ?? null): Phaser.GameObjects.Image {
    if (this.started >= ORDERS) {
      this.playing.forEach((one, order) => (one.order = order));
      this.started = this.playing.length;
      for (const one of this.playing) this.sync(one);
    }
    const playing: Playing = { fx, image: this.host.add.image(0, 0, fx.sheet.asset.path), by, order: this.started++ };
    this.playing.push(playing);
    this.sync(playing);
    this.events.emit(EVENTS.FX_START, fx);
    return playing.image;
  }

  /** After every character stepped: the effects move on (`stepFx`), the ones that ended go, their events are emitted, and impacts start. */
  private postUpdate(_time: number, delta: number) {
    if (!this.playing.length) return;
    const all = new Map(this.playing.map((p) => [p.fx, p]));
    const gone = new Map(all);
    const { fx, events } = stepFx(this.effects as Fx[], delta / 1000, { effects: this.library.effects, blocked: this.blocked });
    const kept: Playing[] = [];
    const impacts: Fx[] = [];
    for (const one of fx) {
      const playing = all.get(one);
      if (!playing) impacts.push(one);
      else {
        gone.delete(one);
        kept.push(playing);
        this.sync(playing);
      }
    }
    for (const { image } of gone.values()) image.destroy();
    this.playing = kept;
    for (const event of events) this.events.emit(EVENTS.FX, event);
    // An impact is drawn where the projectile it follows was.
    for (const impact of impacts) this.play(impact, (impact.from && all.get(impact.from)?.by) ?? null);
  }

  /** Where every floor point of an effect is drawn: where the character that cued it is drawn, else the plugin's projection, else its character's camera. */
  private projectionFor({ fx, by }: Playing): Projection {
    if (by) return by.drawnWith;
    const character: Character | null = fx.character;
    return this.projection ?? projectionOf(null, { tilt: character?.tilt ?? DEFAULT_TILT, scale: character?.scale ?? fx.sheet.scale });
  }

  /** Shows an effect's frame (its row, its age) with its origin on its point, lifted, at whole px, and its depth. */
  private sync(playing: Playing) {
    const { fx, image, order } = playing;
    const rects = fx.sheet.rects(fx.row);
    const name = frameNameOf(fx.sheet.atlas, rects[frameOfFx(fx)] ?? rects[0]);
    if (image.frame.name !== name) image.setFrame(name);
    const projection = this.projectionFor(playing);
    const at = toScreen(projection, fx.pos, fx.lift);
    image.setPosition(Math.round(at.x), Math.round(at.y));
    image.setDepth(fx.sheet.layer === 'ground' ? DEPTH.groundEffects + order : depthKey(toScreen(projection, fx.pos).y, 'fx', order));
  }
}

/** The plugin's entry for a game config's `plugins.scene`: `this.diorama` in every scene. */
export const DIORAMA_PLUGIN: Phaser.Types.Core.PluginObjectItem = { key: 'DioramaPlugin', plugin: DioramaPlugin, mapping: 'diorama' };

/**
 * A game config with the plugin in every scene (`this.diorama`) and `pixelArt` on, so frames are never smoothed. With the
 * canvas renderer the plugin also turns the cameras' `roundPixels` off, which `pixelArt` forces on (see `created`).
 */
export function withDiorama(config: Phaser.Types.Core.GameConfig): Phaser.Types.Core.GameConfig {
  const plugins = config.plugins;
  // An array replaces the default scene plugins (Phaser's own form); an object lists global and scene plugins.
  const own: Phaser.Types.Core.PluginObject = Array.isArray(plugins) ? { default: plugins as unknown as string[] } : (plugins ?? {});
  return { ...config, render: { pixelArt: true, ...config.render }, plugins: { ...own, scene: [...(own.scene ?? []), DIORAMA_PLUGIN] } };
}

declare global {
  namespace Phaser {
    interface Scene {
      /** The Diorama plugin, in a game made with `withDiorama` (or with `DIORAMA_PLUGIN` in its `plugins.scene`). */
      diorama: DioramaPlugin;
    }
  }
}
