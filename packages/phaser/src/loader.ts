/**
 * The loader: a scene's `load` fetches a sheet's atlas JSON, then the sheets it depends on by the contract (its other clips,
 * the effects it cues and their `follows`, a piece's state and clip sheets) and every picture. Each picture becomes a texture
 * named by its sheet path (`characters/guard/idle`) whose frames keep the atlas names (`S_0`, `frame_3`), a packed sheet's
 * trim and their origin from `meta.pivot`. A picture larger than the renderer's textures is cut into bands of whole cells,
 * the sources of that one texture, so a frame is still `setTexture(path, name)` (`planTexture`).
 */

import Phaser from 'phaser';
import { buildLibrary, type Library, type Sheet, type SheetPath } from '@diorama/runtime';
import { Closure, atlasURL, imageURL, planTexture, type TexturePlan } from './sheets.js';

/** Where a load finds the sheets, and how large a texture may be. */
export interface LoadOptions {
  /** The URL of the assets folder the sheet paths start from, relative to the page or absolute. Default `assets/`. */
  assets?: string;
  /** The longest side of a texture, px. Default the renderer's: WebGL's `MAX_TEXTURE_SIZE`, no limit on canvas. */
  maxTextureSize?: number;
}

/** The sheets one game has loaded, which all its scenes share (textures and caches are the game's too). */
interface Registry {
  closure: Closure;
  /** Read sheets whose picture is a texture with its frames, in the order they were wanted. */
  ready: Map<SheetPath, Sheet>;
  /** Built on demand from `ready`, and again after a load adds to it. */
  library: Library | null;
  warnings: string[];
}

const registries = new WeakMap<Phaser.Game, Registry>();

/** The loaded sheets of a game. */
export function registryOf(game: Phaser.Game): Registry {
  let registry = registries.get(game);
  if (!registry) registries.set(game, (registry = { closure: new Closure(), ready: new Map(), library: null, warnings: [] }));
  return registry;
}

/** Everything a game has loaded so far, as the runtime's library: its characters, effects, interface pieces, icons and sprites. */
export function libraryOf(game: Phaser.Game): Library {
  const registry = registryOf(game);
  return (registry.library ??= buildLibrary(registry.ready.values()));
}

/** The longest texture side the game's renderer takes, px. */
export function maxTextureSizeOf(game: Phaser.Game): number {
  const renderer = game.renderer as Phaser.Renderer.Canvas.CanvasRenderer | Phaser.Renderer.WebGL.WebGLRenderer;
  return 'getMaxTextureSize' in renderer ? renderer.getMaxTextureSize() : Infinity;
}

/** One band of a picture, copied pixel for pixel into a canvas of its own. */
function bandCanvas(image: HTMLImageElement, band: { x: number; y: number; width: number; height: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = band.width;
  canvas.height = band.height;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, band.x, band.y, band.width, band.height, 0, 0, band.width, band.height);
  return canvas;
}

/** Makes a sheet's texture from its picture and plan: the picture itself, or its bands as the texture's sources, then the frames. */
export function addSheetTexture(textures: Phaser.Textures.TextureManager, key: string, image: HTMLImageElement, plan: TexturePlan): Phaser.Textures.Texture | null {
  const [first] = plan.bands;
  const whole = plan.bands.length === 1 && first.x === 0 && first.y === 0 && first.width === image.naturalWidth && first.height === image.naturalHeight;
  let texture: Phaser.Textures.Texture | null;
  if (whole) {
    texture = textures.addImage(key, image);
  } else {
    texture = textures.create(key, plan.bands.map((band) => bandCanvas(image, band)));
    texture?.add('__BASE', 0, 0, 0, first.width, first.height);
  }
  if (!texture) return null;
  for (const cell of plan.frames) {
    const frame = texture.add(cell.name, cell.band, cell.x, cell.y, cell.width, cell.height);
    if (!frame) continue;
    if (cell.trim) frame.setTrim(cell.trim.cellW, cell.trim.cellH, cell.trim.ox, cell.trim.oy, cell.width, cell.height);
    if (cell.pivot) {
      frame.customPivot = true;
      frame.pivotX = cell.pivot.x;
      frame.pivotY = cell.pivot.y;
    }
  }
  return texture;
}

/** A sheet's picture: loaded like any image, then added as the sheet's texture (`addSheetTexture`) instead of a plain one. */
class SheetImageFile extends Phaser.Loader.FileTypes.ImageFile {
  constructor(
    loader: Phaser.Loader.LoaderPlugin,
    private readonly sheet: Sheet,
    url: string,
    private readonly maxTextureSize: number,
    private readonly onAdded: (error?: string) => void,
  ) {
    super(loader, sheet.asset.path, url);
  }

  override addToCache() {
    const image = this.data as HTMLImageElement;
    try {
      const plan = planTexture(this.sheet, { width: image.naturalWidth, height: image.naturalHeight }, this.maxTextureSize);
      this.onAdded(addSheetTexture(this.loader.textureManager, this.key, image, plan) ? undefined : `${this.key}: a texture of that name already exists`);
    } catch (error) {
      this.onAdded(error instanceof Error ? error.message : String(error));
    }
  }
}

/** The JSON cache key of a sheet's atlas. */
const jsonKey = (path: SheetPath) => `diorama:${path}`;

/** The atlases each scene's loader was asked for (path and URL), until it completes. */
const asked = new WeakMap<Phaser.Loader.LoaderPlugin, Map<SheetPath, string>>();

/**
 * Queues sheets on a scene's loader, with every sheet they need by the contract: call it in `preload` (elsewhere, start the
 * loader and wait for its `complete` event). Sheets the game already loaded are not fetched again. What cannot be fetched or
 * read is a warning (`console.warn`, and the plugin's `warnings`), never an error: the rest still loads.
 */
export function loadSheets(scene: Phaser.Scene, paths: SheetPath | SheetPath[], options: LoadOptions = {}) {
  const registry = registryOf(scene.game);
  const loader = scene.load;
  const folder = new URL(options.assets ?? 'assets/', document.baseURI).href;
  const assets = folder.endsWith('/') ? folder : `${folder}/`;
  const maxTextureSize = options.maxTextureSize ?? maxTextureSizeOf(scene.game);
  const warn = (message: string) => {
    registry.warnings.push(message);
    console.warn(`@diorama/phaser: ${message}`);
  };
  let queued = asked.get(loader);
  if (!queued) {
    asked.set(loader, (queued = new Map()));
    const mine = queued;
    loader.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      if (file instanceof SheetImageFile) return warn(`${file.key}: its picture ${file.src} could not be fetched`);
      if (file.type !== 'json' || !file.key.startsWith('diorama:')) return;
      const path = file.key.slice('diorama:'.length);
      registry.closure.fail(path, `${file.src} could not be fetched`);
      warn(`${path}: ${file.src} could not be fetched`);
    });
    // A JSON that came but did not parse (an HTML page where the atlas should be) ends the load without an event of its own.
    loader.on(Phaser.Loader.Events.COMPLETE, () => {
      for (const [path, url] of mine) {
        if (!registry.closure.pending.has(path)) continue;
        registry.closure.fail(path, `${url} is not JSON`);
        warn(`${path}: ${url} is not JSON`);
      }
      mine.clear();
    });
  }

  const queue = (wanted: SheetPath[]) => {
    for (const path of wanted) {
      const key = jsonKey(path);
      const url = atlasURL(assets, path);
      queued.set(path, url);
      loader.once(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}json-${key}`, (_key: string, _type: string, json: unknown) => read(path, json));
      loader.json(key, url);
    }
  };
  // Files added while loading start on the scene's next update; start them now, so a load never waits on the game loop.
  const startAdded = () => {
    if (loader.isLoading()) loader.update();
  };

  const read = (path: SheetPath, json: unknown) => {
    const next = registry.closure.read(path, json);
    const sheet = registry.closure.sheets.get(path);
    if (!sheet) {
      warn(registry.closure.failed.get(path) ?? `${path} could not be read`);
      return;
    }
    for (const warning of sheet.warnings) warn(warning);
    loader.addFile(
      new SheetImageFile(loader, sheet, imageURL(assets, path, sheet.atlas), maxTextureSize, (error) => {
        if (error) return warn(error);
        registry.ready.set(path, sheet);
        registry.library = null;
      }),
    );
    queue(next);
    startAdded();
  };

  queue(registry.closure.want(Array.isArray(paths) ? paths : [paths]));
  startAdded();
}
