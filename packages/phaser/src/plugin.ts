/**
 * The scene plugin, `this.diorama` in every scene of a game made with `withDiorama`: it loads sheets by the contract, puts
 * characters and nine-slices on the scene, gives a character keyboard controls, and plays the effects characters cue
 * (`cues`, then `stepFx` after every character has stepped), each an Image on its sheet's texture sorted by `depthKey`.
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

/** An effect playing, its Image, and the order it started in (the `order` of its depth key). */
interface Playing {
  fx: Fx;
  image: Phaser.GameObjects.Image;
  order: number;
}

export class DioramaPlugin extends Phaser.Plugins.ScenePlugin {
  /** Where every floor point is drawn; null for each character's own camera with the floor's origin at world (0, 0). */
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
  private started = 0;

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
    events.once(Phaser.Scenes.Events.CREATE, this.created, this);
    events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  /**
   * On canvas, the cameras' `roundPixels` goes off: `pixelArt` (which `withDiorama` turns on) forces it on, and on canvas it
   * draws frames half a pixel too large. The binding rounds positions to whole pixels itself.
   */
  private created() {
    if (this.host.game.renderer.type !== Phaser.CANVAS) return;
    for (const camera of this.host.cameras.cameras) camera.setRoundPixels(false);
  }

  private shutdown() {
    const events = this.host.sys.events;
    events.off(Phaser.Scenes.Events.POST_UPDATE, this.postUpdate, this);
    for (const { image } of this.playing) image.destroy();
    this.playing = [];
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

  /** Keyboard controls for a character, read at the start of each of its steps (`KeyboardControls`). */
  controls(character: DioramaCharacter): KeyboardControls {
    return (character.controls = new KeyboardControls(this.host));
  }

  /** The effects playing now. */
  get effects(): readonly Fx[] {
    return this.playing.map((p) => p.fx);
  }

  /** The Image an effect is drawn with. */
  imageOf(fx: Fx): Phaser.GameObjects.Image | undefined {
    return this.playing.find((p) => p.fx === fx)?.image;
  }

  /** A character's clip event: passed on (`clip`), and the effects it cues start. Characters call it on their steps. */
  clip(event: ClipEvent, character: DioramaCharacter) {
    this.events.emit(EVENTS.CLIP, event, character);
    for (const fx of cues(event, this.library.effects, { aim: character.aim ?? undefined })) this.play(fx);
  }

  /** Plays an effect (one of `cues`, or one of your own) from now on. */
  play(fx: Fx): Phaser.GameObjects.Image {
    const playing = { fx, image: this.host.add.image(0, 0, fx.sheet.asset.path), order: this.started++ % 2 ** 16 };
    this.playing.push(playing);
    this.sync(playing);
    this.events.emit(EVENTS.FX_START, fx);
    return playing.image;
  }

  /** After every character stepped: the effects move on (`stepFx`), the ones that ended go, their events are emitted, and impacts start. */
  private postUpdate(_time: number, delta: number) {
    if (!this.playing.length) return;
    const before = new Map(this.playing.map((p) => [p.fx, p]));
    const { fx, events } = stepFx(this.effects as Fx[], delta / 1000, { effects: this.library.effects, blocked: this.blocked });
    const kept: Playing[] = [];
    const impacts: Fx[] = [];
    for (const one of fx) {
      const playing = before.get(one);
      if (!playing) impacts.push(one);
      else {
        before.delete(one);
        kept.push(playing);
        this.sync(playing);
      }
    }
    for (const { image } of before.values()) image.destroy();
    this.playing = kept;
    for (const event of events) this.events.emit(EVENTS.FX, event);
    for (const impact of impacts) this.play(impact);
  }

  /** Where every floor point of a character's effect is drawn. */
  private projectionFor(character: Character | null, scale: number): Projection {
    return this.projection ?? projectionOf(null, { tilt: character?.tilt ?? DEFAULT_TILT, scale: character?.scale ?? scale });
  }

  /** Shows an effect's frame (its row, its age) with its origin on its point, lifted, at whole px, and its depth. */
  private sync({ fx, image, order }: Playing) {
    const rects = fx.sheet.rects(fx.row);
    const name = frameNameOf(fx.sheet.atlas, rects[frameOfFx(fx)] ?? rects[0]);
    if (image.frame.name !== name) image.setFrame(name);
    const projection = this.projectionFor(fx.character, fx.sheet.scale);
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
