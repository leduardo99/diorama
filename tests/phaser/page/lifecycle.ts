/**
 * The page tests/phaser/lifecycle.test.ts drives: scenes that restart, stop in the middle of a load, or load the same sheets
 * at once, on the canvas renderer with the loop asleep and a loader that runs two downloads at a time, so every load has to
 * go on without the game loop. Scene `a` loads the fixtures' character (tests/phaser/fixtures.ts) from /fixtures/ and puts
 * it on the floor with keyboard controls; `?scenes=two` boots scene `b`, which loads the same, with it. `window.lifecycle`
 * hands the test what it reads and does.
 */

import Phaser from 'phaser';
import { EVENTS, manualClock, sleepOnStart, withDiorama, type DioramaCharacter } from '@diorama/phaser';
import { projectionOf, type Fx, type FxEvent } from '@diorama/runtime';

const query = new URLSearchParams(location.search);
const log: string[] = [];
const created: Record<string, number> = {};

class Loading extends Phaser.Scene {
  character: DioramaCharacter | null = null;

  constructor(key: string, active: boolean) {
    super({ key, active });
  }

  preload() {
    const extra = (this.registry.get(`${this.sys.settings.key}:extra`) as string[] | undefined) ?? [];
    this.diorama.load(['characters/dummy/idle', ...extra], { assets: '/fixtures/' });
  }

  create() {
    const key = this.sys.settings.key;
    created[key] = (created[key] ?? 0) + 1;
    this.character = null;
    try {
      this.character = this.diorama.add.character('characters/dummy', { x: 0, y: 0 }, { id: 1 });
      this.diorama.controls(this.character);
      log.push(`${key}: a character with ${this.character.character.clips.map((c) => c.key).join(', ')}`);
    } catch (error) {
      log.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const onFx = (event: FxEvent) => log.push(`${event.fx.sheet.id}:${event.name}`);
    this.diorama.events.on(EVENTS.FX, onFx);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.diorama.events.off(EVENTS.FX, onFx));
  }
}

const game = new Phaser.Game(withDiorama({
  type: Phaser.CANVAS,
  parent: 'game',
  width: 200,
  height: 200,
  transparent: true,
  banner: false,
  audio: { noAudio: true },
  loader: { maxParallelDownloads: 2 },
  scene: query.get('scenes') === 'two' ? [new Loading('a', true), new Loading('b', true)] : [new Loading('a', true)],
  callbacks: { postBoot: sleepOnStart },
}));
const step = manualClock(game);
const scene = (key = 'a') => game.scene.getScene(key) as Loading;

/** A hand-made effect of the character's: the spark following its feet, or the looping bolt staying until its clip changes. */
function effectOf(c: DioramaCharacter, id: 'spark' | 'bolt', how: 'follow' | 'until' | 'stay'): Fx {
  const sheet = scene().diorama.library.effects.get(id)!;
  const fx: Fx = { sheet, pos: { ...c.actor.pos }, lift: 0, row: 0, age: 0, motion: how === 'follow' ? 'follow' : 'stay', character: c.character, from: null, fired: -1, done: false };
  if (how === 'follow') fx.follow = { actor: c.actor, socket: 'feet' };
  if (how === 'until') fx.until = { actor: c.actor, act: null, clip: c.actor.clip };
  return fx;
}

const lifecycle = {
  created,
  log,
  step,
  warnings: () => [...scene().diorama.warnings],
  /** The ones of these sheets that are textures in the game. */
  textures: (paths: string[]) => paths.filter((path) => game.textures.exists(path)),
  restart: (extra: string[]) => {
    scene().registry.set('a:extra', extra);
    scene().scene.restart();
  },
  stop: () => game.scene.stop('a'),
  start: () => game.scene.start('a'),
  /** A character drawn by a projection of its own (the floor's origin at screen (50, 30)) slashes: where its spark is drawn. */
  projection: () => {
    const s = scene();
    const c = s.diorama.add.character('characters/dummy', { x: 0, y: 0 }, { id: 6, projection: { ...projectionOf(null, { tilt: 48, scale: 2 }), origin: { x: 50, y: 30 } } });
    const started: Fx[] = [];
    const onStart = (fx: Fx) => started.push(fx);
    s.diorama.events.on(EVENTS.FX_START, onStart);
    c.act('slash');
    for (let i = 0; i < 30 && !started.length; i++) step();
    s.diorama.events.off(EVENTS.FX_START, onStart);
    const image = started.length ? s.diorama.imageOf(started[0]) : undefined;
    const out = { character: [c.x, c.y, c.depth], spark: image ? [image.x, image.y, image.depth] : null, effects: s.diorama.effects.length };
    c.destroy();
    return out;
  },
  /** Keyboard controls given twice, then the character destroyed: the listeners on the digit 1 at each point. */
  controls: () => {
    const s = scene();
    const one = s.input.keyboard!.addKey('ONE', false);
    const before = one.listenerCount(Phaser.Input.Keyboard.Events.DOWN);
    const c = s.diorama.add.character('characters/dummy', { x: 0, y: 0 }, { id: 5 });
    s.diorama.controls(c);
    s.diorama.controls(c);
    const twice = one.listenerCount(Phaser.Input.Keyboard.Events.DOWN) - before;
    c.destroy();
    return { twice, destroyed: one.listenerCount(Phaser.Input.Keyboard.Events.DOWN) - before, captures: s.input.keyboard!.getCaptures() };
  },
  /** A character with an effect following it, one looping with its clip and a one-shot is destroyed: what plays a step later. */
  destroyWithEffects: () => {
    const s = scene();
    const c = s.diorama.add.character('characters/dummy', { x: 30, y: 0 }, { id: 7 });
    const mine = (['follow', 'until', 'stay'] as const).map((how) => effectOf(c, how === 'until' ? 'bolt' : 'spark', how));
    for (const fx of mine) s.diorama.play(fx);
    const playing = () => s.diorama.effects.filter((fx) => mine.includes(fx)).map((fx) => `${fx.sheet.id}:${fx.motion}${fx.until ? ':until' : ''}`);
    step();
    const before = playing();
    const from = log.length;
    c.destroy();
    step();
    return { playing: before, after: playing(), events: log.slice(from) };
  },
  /** A camera added after the scene was created, on canvas. */
  cameraAfterCreate: () => scene().cameras.add(0, 0, 50, 50).roundPixels,
  /**
   * A scene that has added 65535 characters and effects (their counters set by hand) adds two more of each: the orders
   * of the characters still there, and of the effects playing, then.
   */
  outgrown: () => {
    const s = scene();
    const counters = s.diorama as unknown as { added: number; started: number };
    counters.added = 2 ** 16 - 1;
    const one = s.diorama.add.character('characters/dummy', { x: 60, y: 0 }, { id: 8 });
    const two = s.diorama.add.character('characters/dummy', { x: 60, y: 0 }, { id: 9 });
    counters.started = 2 ** 16 - 1;
    const effects = [effectOf(one, 'spark', 'stay'), effectOf(two, 'spark', 'stay')];
    for (const fx of effects) s.diorama.play(fx);
    const actors = s.children.list.filter((o): o is DioramaCharacter => 'actor' in o).map((c) => c.order);
    const fxDepths = effects.map((fx) => s.diorama.imageOf(fx)!.depth);
    const out = { actors, depths: [one.depth, two.depth], fxDepths };
    one.destroy();
    two.destroy();
    return out;
  },
};

declare global {
  interface Window {
    lifecycle?: typeof lifecycle;
  }
}
window.lifecycle = lifecycle;
