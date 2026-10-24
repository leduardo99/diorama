/**
 * The page tests/phaser/smoke.test.ts drives: the canvas renderer, or WebGL with `?renderer=webgl`, on a transparent
 * canvas, the loop asleep (the test steps it), and the generated fixtures (tests/phaser/fixtures.ts) loaded from
 * /fixtures/ with a small texture limit (`?max=`), so the sheets larger than it are cut into bands. `window.smoke` hands
 * the test what it reads.
 */

import Phaser from 'phaser';
import { EVENTS, manualClock, sleepOnStart, withDiorama, type DioramaCharacter } from '@diorama/phaser';
import type { ClipEvent, Fx, FxEvent } from '@diorama/runtime';

const SIZE = { width: 320, height: 240 };
/** Where the floor's origin is on the canvas. */
const ORIGIN = { x: 120, y: 140 };
const query = new URLSearchParams(location.search);
const webgl = query.get('renderer') === 'webgl';

/** What the test reads: the character, the effects, the events so far and the canvas's pixels. */
export interface Smoke {
  ready: boolean;
  step: (frames?: number) => void;
  state: () => ReturnType<typeof stateOf>;
  pixels: (x: number, y: number, width: number, height: number) => number[];
  add: (id: number, x: number, y: number) => void;
  /** Moves a game object to the back of the display list, so its place there is the wrong one for its depth. */
  toBack: (name: string) => void;
  order: () => string[];
}

declare global {
  interface Window {
    smoke?: Smoke;
  }
}

const log = { clips: [] as string[], fx: [] as string[] };

class SmokeScene extends Phaser.Scene {
  character!: DioramaCharacter;

  constructor() {
    super('smoke');
  }

  preload() {
    this.diorama.load(['characters/dummy/idle', 'ui/panel'], { assets: '/fixtures/', maxTextureSize: Number(query.get('max') ?? Infinity) });
  }

  create() {
    this.cameras.main.setScroll(-ORIGIN.x, -ORIGIN.y);
    this.character = this.diorama.add.character('characters/dummy', { x: 0, y: 0 }, { id: 1 }).setName('dummy-1');
    this.diorama.controls(this.character);
    this.diorama.add.nineSlice(200, 8, 'ui/panel', 40, 30).setScrollFactor(0);
    this.diorama.events.on(EVENTS.CLIP, (event: ClipEvent) => log.clips.push(`${event.clip.key}:${event.name}`));
    this.diorama.events.on(EVENTS.FX_START, (fx: Fx) => log.fx.push(`start:${fx.sheet.id}`));
    this.diorama.events.on(EVENTS.FX, (event: FxEvent) => log.fx.push(`${event.fx.sheet.id}:${event.name}`));
    smoke.ready = true;
  }
}

function stateOf(scene: SmokeScene) {
  const c = scene.character;
  const camera = scene.cameras.main;
  return {
    camera: { x: camera.scrollX, y: camera.scrollY, roundPixels: camera.roundPixels },
    renderer: scene.game.renderer.type === Phaser.CANVAS ? 'canvas' : 'webgl',
    character: {
      x: c.x, y: c.y, texture: c.texture.key, frame: c.frame.name, band: c.frame.sourceIndex, originX: c.displayOriginX, originY: c.displayOriginY, depth: c.depth,
      pos: { ...c.actor.pos }, clip: c.actor.act?.clip.key ?? c.actor.clip.key, row: c.actor.row,
    },
    effects: scene.diorama.effects.map((fx) => {
      const image = scene.diorama.imageOf(fx)!;
      return { id: fx.sheet.id, x: image.x, y: image.y, frame: image.frame.name, row: fx.row, originX: image.displayOriginX, originY: image.displayOriginY, depth: image.depth, pos: { ...fx.pos }, lift: fx.lift };
    }),
    clips: [...log.clips],
    fx: [...log.fx],
    sources: Object.fromEntries(['characters/dummy/idle', 'characters/dummy/walk', 'vfx/spark', 'ui/panel'].map((key) => [key, scene.textures.get(key).source.length])),
    warnings: [...scene.diorama.warnings],
  };
}

const game = new Phaser.Game(withDiorama({
  type: webgl ? Phaser.WEBGL : Phaser.CANVAS,
  parent: 'game',
  width: SIZE.width,
  height: SIZE.height,
  transparent: true,
  banner: false,
  audio: { noAudio: true },
  scale: { mode: Phaser.Scale.NONE, zoom: 1 },
  scene: SmokeScene,
  // WebGL keeps the frame it drew, so the test can read it after the step.
  render: { preserveDrawingBuffer: true },
  callbacks: { postBoot: sleepOnStart },
}));
const scene = () => game.scene.getScene('smoke') as SmokeScene;
const step = manualClock(game);

const smoke: Smoke = {
  ready: false,
  step,
  state: () => stateOf(scene()),
  pixels: (x, y, width, height) => {
    // A 2D canvas is read as it is; WebGL's drawing is copied onto one first.
    let canvas = game.canvas;
    if (webgl) {
      canvas = document.createElement('canvas');
      canvas.width = game.canvas.width;
      canvas.height = game.canvas.height;
      canvas.getContext('2d')!.drawImage(game.canvas, 0, 0);
    }
    return Array.from(canvas.getContext('2d')!.getImageData(x, y, width, height).data);
  },
  add: (id, x, y) => {
    scene().diorama.add.character('characters/dummy', { x, y }, { id }).setName(`dummy-${id}`);
  },
  toBack: (name) => {
    const object = scene().children.getByName(name);
    if (object) scene().children.sendToBack(object);
  },
  order: () => {
    scene().children.depthSort();
    return scene().children.list.map((o) => o.name).filter(Boolean);
  },
};
window.smoke = smoke;
