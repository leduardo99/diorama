/**
 * The loader: a scene's `load` fetches a sheet's atlas JSON, then the sheets it depends on by the contract (its other clips,
 * the effects it cues and their `follows`, a piece's state and clip sheets) and every picture. Each picture becomes a texture
 * named by its sheet path (`characters/guard/idle`) whose frames keep the atlas names (`S_0`, `frame_3`), a packed sheet's
 * trim and their origin from `meta.pivot`. A picture larger than the renderer's textures is cut into bands of whole cells,
 * the sources of that one texture, so a frame is still `setTexture(path, name)` (`planTexture`).
 *
 * Each load is a scene's own: it fetches every sheet it needs that the game has no texture for yet, even one another
 * scene's load is fetching too, so a scene is created only once its sheets are textures. A load its scene stops leaves
 * nothing half done: what it had not finished is fetched again by the next load that needs it. A file that comes starts the
 * next one at once, so a load never waits on the game loop (a test's clock may sleep).
 */

import Phaser from 'phaser';
import { buildLibrary, dependenciesOf, readSheet, type Library, type Sheet, type SheetPath } from '@diorama/runtime';
import { atlasURL, imageURL, planTexture, type TexturePlan } from './sheets.js';

/** Where a load finds the sheets, and how large a texture may be. */
export interface LoadOptions {
  /** The URL of the assets folder the sheet paths start from, relative to the page or absolute. Default `assets/`. */
  assets?: string;
  /** The longest side of a texture, px. Default the renderer's: WebGL's `MAX_TEXTURE_SIZE`, no limit on canvas. */
  maxTextureSize?: number;
}

/** The sheets one game has loaded, which all its scenes share (textures and caches are the game's too). */
interface Registry {
  /** Atlases read, by sheet path. */
  sheets: Map<SheetPath, Sheet>;
  /** Read sheets whose picture is a texture with its frames. */
  ready: Map<SheetPath, Sheet>;
  /** Sheets whose atlas or picture could not be fetched or read, with the warning that said so: no load asks for them again. */
  failed: Map<SheetPath, string>;
  /** Built on demand from `ready`, and again after a load adds to it. */
  library: Library | null;
  warnings: string[];
}

const registries = new WeakMap<Phaser.Game, Registry>();

/** The loaded sheets of a game. */
export function registryOf(game: Phaser.Game): Registry {
  let registry = registries.get(game);
  if (!registry) registries.set(game, (registry = { sheets: new Map(), ready: new Map(), failed: new Map(), library: null, warnings: [] }));
  return registry;
}

/**
 * Everything a game has loaded so far, as the runtime's library: its characters, effects, interface pieces, icons and
 * sprites. The sheets are taken in the order of their paths, as the viewer lists them, whatever order they came in: a
 * character's clips are always in the same order.
 */
export function libraryOf(game: Phaser.Game): Library {
  const registry = registryOf(game);
  return (registry.library ??= buildLibrary([...registry.ready.values()].sort((a, b) => a.asset.path.localeCompare(b.asset.path))));
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

/** Where one call of `loadSheets` finds its sheets, which the sheets they bring are fetched from too. */
interface Where {
  assets: string;
  maxTextureSize: number;
}

/** A JSON that came but does not parse (an HTML page where the atlas should be). */
const NOT_JSON = Symbol('not JSON');

/** A sheet's atlas JSON: fetched like any JSON, then read by its load; never kept in Phaser's JSON cache, so a later load can fetch it again. */
class SheetAtlasFile extends Phaser.Loader.FileTypes.JSONFile {
  constructor(
    readonly batch: Batch,
    readonly path: SheetPath,
    readonly where: Where,
  ) {
    super(batch.loader, `diorama:${path}`, atlasURL(where.assets, path));
  }

  override hasCacheConflict() {
    return false;
  }

  override onProcess() {
    this.state = Phaser.Loader.FILE_PROCESSING;
    try {
      this.data = JSON.parse(this.xhrLoader?.responseText ?? '');
    } catch {
      this.data = NOT_JSON;
    }
    this.onProcessComplete();
  }

  override addToCache() {
    this.batch.atlasCame(this);
  }
}

/** A sheet's picture: loaded like any image, then added as the sheet's texture (`addSheetTexture`) instead of a plain one. */
class SheetImageFile extends Phaser.Loader.FileTypes.ImageFile {
  constructor(
    readonly batch: Batch,
    readonly sheet: Sheet,
    readonly where: Where,
  ) {
    super(batch.loader, sheet.asset.path, imageURL(where.assets, sheet.asset.path, sheet.atlas));
  }

  get path(): SheetPath {
    return this.sheet.asset.path;
  }

  /** A texture of its name is either this sheet's, made by another load (`pictureCame` keeps it), or not: a warning, not a silent skip. */
  override hasCacheConflict() {
    return false;
  }

  /** It came but does not decode: a warning of the load's, not Phaser's console error. */
  override onProcessError() {
    this.state = Phaser.Loader.FILE_ERRORED;
    this.batch.fail(this.path, `${this.path}: its picture ${this.src} is not an image`);
    this.loader.fileProcessComplete(this);
  }

  override addToCache() {
    this.batch.pictureCame(this, this.data as HTMLImageElement);
  }
}

type SheetFile = SheetAtlasFile | SheetImageFile;

/** The load each scene's loader is running, until it completes or its scene stops it. */
const batches = new WeakMap<Phaser.Loader.LoaderPlugin, Batch>();

/**
 * One load on a scene's loader: the sheets it was asked for and every sheet they need, from the call that starts it until
 * the loader completes, or until the scene stops (shuts down or restarts) before that. Its listeners are its own, put on the
 * loader when it starts and taken off when it ends.
 */
class Batch {
  /** False once it ended: a file of its that still comes (a stopped scene's) is dropped. */
  live = true;
  /** The sheets it has looked at, each once. */
  private readonly seen = new Set<SheetPath>();
  /** The files it is fetching and has not had yet, by sheet path (an atlas, then its picture). */
  private readonly open = new Map<SheetPath, SheetFile>();

  constructor(
    readonly loader: Phaser.Loader.LoaderPlugin,
    private readonly scene: Phaser.Scene,
    private readonly registry: Registry,
  ) {
    loader.on(Phaser.Loader.Events.FILE_LOAD, this.pump, this);
    loader.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.fetchFailed, this);
    loader.once(Phaser.Loader.Events.COMPLETE, this.complete, this);
    scene.sys.events.once(Phaser.Scenes.Events.SHUTDOWN, this.end, this);
  }

  /** Queues these sheets and what they need, and starts what it can now. */
  want(paths: SheetPath[], where: Where) {
    for (const path of paths) this.need(path, where);
    this.pump();
  }

  /** A sheet: its atlas when the game has not read it, its picture when it is not a texture yet, then what it needs. */
  private need(path: SheetPath, where: Where) {
    if (this.seen.has(path) || this.registry.failed.has(path)) return;
    this.seen.add(path);
    const sheet = this.registry.sheets.get(path);
    if (!sheet) return this.fetch(new SheetAtlasFile(this, path, where));
    this.needs(sheet, where);
  }

  private needs(sheet: Sheet, where: Where) {
    if (!this.registry.ready.has(sheet.asset.path)) this.fetch(new SheetImageFile(this, sheet, where));
    for (const next of dependenciesOf(sheet)) this.need(next, where);
  }

  private fetch(file: SheetFile) {
    this.open.set(file.path, file);
    this.loader.addFile(file);
  }

  /** Starts the files that wait while the loader has room: Phaser starts them only on the scene's next update otherwise. */
  private pump() {
    if (this.live && this.loader.isLoading()) this.loader.update();
  }

  warn(message: string) {
    this.registry.warnings.push(message);
    console.warn(`@diorama/phaser: ${message}`);
  }

  /** A sheet that cannot be had: a warning (once per game), and no load asks for it again. */
  fail(path: SheetPath, message: string) {
    if (!this.live) return;
    this.open.delete(path);
    if (this.registry.failed.has(path)) return;
    this.registry.failed.set(path, message);
    this.warn(message);
  }

  atlasCame(file: SheetAtlasFile) {
    if (!this.live || this.open.get(file.path) !== file) return;
    this.open.delete(file.path);
    const { path } = file;
    // Another scene's load may have read it in the meantime: the game keeps one sheet per path.
    let sheet = this.registry.sheets.get(path);
    if (!sheet) {
      if (file.data === NOT_JSON) return this.fail(path, `${path}: ${file.src} is not JSON`);
      try {
        sheet = readSheet(path, file.data);
      } catch (error) {
        return this.fail(path, error instanceof Error ? error.message : String(error));
      }
      this.registry.sheets.set(path, sheet);
      for (const warning of sheet.warnings) this.warn(warning);
    }
    this.needs(sheet, file.where);
    this.pump();
  }

  pictureCame(file: SheetImageFile, image: HTMLImageElement) {
    if (!this.live || this.open.get(file.path) !== file) return;
    this.open.delete(file.path);
    const { path, sheet } = file;
    if (this.registry.ready.has(path)) return;
    try {
      const plan = planTexture(sheet, { width: image.naturalWidth, height: image.naturalHeight }, file.where.maxTextureSize);
      if (!addSheetTexture(this.loader.textureManager, path, image, plan)) return this.fail(path, `${path}: a texture of that name already exists`);
    } catch (error) {
      return this.fail(path, error instanceof Error ? error.message : String(error));
    }
    this.registry.ready.set(path, sheet);
    this.registry.library = null;
  }

  private fetchFailed(file: Phaser.Loader.File) {
    if ((file instanceof SheetAtlasFile || file instanceof SheetImageFile) && file.batch === this && this.open.get(file.path) === file) {
      this.fail(file.path, file instanceof SheetImageFile ? `${file.path}: its picture ${file.src} could not be fetched` : `${file.path}: ${file.src} could not be fetched`);
    }
    this.pump();
  }

  /** The loader completed: every file came or failed. One it never had (a file of the same key was queued already) fails too. */
  private complete() {
    for (const [path, file] of this.open) this.fail(path, `${path}: the load ended without ${file.src || file.url}`);
    this.end();
  }

  /** Done, or stopped with its scene: what it had not finished stays wanted, for the next load that needs it. */
  private end() {
    this.live = false;
    this.open.clear();
    this.loader.off(Phaser.Loader.Events.FILE_LOAD, this.pump, this);
    this.loader.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.fetchFailed, this);
    this.loader.off(Phaser.Loader.Events.COMPLETE, this.complete, this);
    this.scene.sys.events.off(Phaser.Scenes.Events.SHUTDOWN, this.end, this);
    if (batches.get(this.loader) === this) batches.delete(this.loader);
  }
}

/**
 * Queues sheets on a scene's loader, with every sheet they need by the contract: call it in `preload` (elsewhere, start the
 * loader and wait for its `complete` event). Sheets the game already has as textures are not fetched again. What cannot be
 * fetched or read is a warning (`console.warn`, and the plugin's `warnings`), never an error: the rest still loads.
 */
export function loadSheets(scene: Phaser.Scene, paths: SheetPath | SheetPath[], options: LoadOptions = {}) {
  const registry = registryOf(scene.game);
  const loader = scene.load;
  const folder = new URL(options.assets ?? 'assets/', document.baseURI).href;
  const where: Where = { assets: folder.endsWith('/') ? folder : `${folder}/`, maxTextureSize: options.maxTextureSize ?? maxTextureSizeOf(scene.game) };
  let batch = batches.get(loader);
  if (!batch?.live) batches.set(loader, (batch = new Batch(loader, scene, registry)));
  batch.want(Array.isArray(paths) ? paths : [paths], where);
}
