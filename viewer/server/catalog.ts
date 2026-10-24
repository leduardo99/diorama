/**
 * Builds the catalog the viewer reads from /__api/assets and /__api/projects:
 * every exported image with its atlas summary, sheet and engine.
 *
 * Projects come from `projects/` and `examples/` (tools/project.ts: a name in `projects/` wins). A project is
 * `src/` (code), `sheets/` (one file per exported sheet), `assets/` (the exports) and `review/` (scratch: the
 * viewer never reads it). An export lands at its sheet's own path, so `assets/a/b.png` comes from `sheets/a/b.ts`.
 */

import { existsSync } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { LAYOUT, isSheetFile, listProjects, walkFiles, type ProjectRoot } from '../../tools/project';

export type { ProjectRoot };

/** Which engine draws a sheet: `@core/volume` (props, scenery, effects) or `@core/rig` (characters, gear, items). */
export type Engine = 'volume' | 'rig';

export interface AtlasInfo {
  mode: string;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  width: number;
  height: number;
  directions: string[];
  eventCount: number;
  /** What the sheet is, from `meta.data.role`: 'character', 'gear', 'prop'... null for plain assets. */
  role: string | null;
  /** A gear sheet: the catalog's id of the part, its label and its group. */
  part: string | null;
  label: string | null;
  group: string | null;
  /** What an effect (projectile, impact...), an item (weapon, potion...) or an interface piece (panel, bar, font...) is, from the atlas; null for other sheets. */
  kind: string | null;
  /** An item icon: its rarity tier (id, label and color, the colors the project gave its tiers). */
  rarity: { id: string; label: string; color: string } | null;
  /** An item icon: how many fit in one inventory slot. */
  stack: number | null;
}

export interface AssetFileMeta {
  project: string;
  /** Where the project lives: `projects` (yours) or `examples` (the samples that ship with Diorama). */
  root: ProjectRoot;
  /** Path relative to the project's `assets/`. */
  subpath: string;
  filename: string;
  format: string;
  size: number;
  mtime: number;
  /** Where the dev server serves the image from: `/<root>/<project>/assets/<subpath>`. */
  url: string;
  /** Image pixel size (PNG header or atlas), null when it cannot be read cheaply. */
  width: number | null;
  height: number | null;
  /** Atlas JSON path relative to assets/, null when the export has none. */
  atlas: string | null;
  /** The sheet that exports it: its path relative to `sheets/` (with `.ts`), null for an export without one. */
  sheet: string | null;
  /** Newest modification time of the sheet and of the local files it imports (`src/`...); null without a sheet. */
  sourceMtime: number | null;
  engine: Engine | null;
  atlasInfo: AtlasInfo | null;
}

export interface ProjectMeta {
  name: string;
  /** Where the project lives: `projects` (yours) or `examples` (the samples that ship with Diorama). */
  root: ProjectRoot;
  /** The project's folder from the repository root, as typed in a terminal: `examples/soulkeeper`. */
  rel: string;
  hasStyle: boolean;
  assetCount: number;
  sheetCount: number;
  /** Sheets (relative to `sheets/`, with `.ts`) that have no exported image yet. */
  pendingSheets: string[];
  /** The kits the customize and scenery tabs read: `src/gear/catalog.ts` and `src/scenery/catalog.ts`. */
  hasGearKit: boolean;
  hasSceneryKit: boolean;
  /** Names of the scenes saved in `src/scenes/<name>.ts` (the files that export `SCENE`). */
  scenes: string[];
  /** The project has a game that plays its exports, `game/index.html` (rule 8), served at `/<root>/<project>/game/`. */
  hasGame: boolean;
  totalSize: number;
}

const IMAGE_RE = /\.(png|jpe?g|webp|svg)$/i;

async function readPngSize(file: string): Promise<{ width: number; height: number } | null> {
  const handle = await open(file, 'r');
  try {
    const buf = Buffer.alloc(24);
    await handle.read(buf, 0, 24, 0);
    // PNG signature, then the IHDR chunk: width and height are big-endian uint32 at bytes 16 and 20.
    if (buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    await handle.close();
  }
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const atlasCache = new Map<string, { key: string; info: AtlasInfo | null }>();

async function readAtlasInfo(file: string, key: string): Promise<AtlasInfo | null> {
  const cached = atlasCache.get(file);
  if (cached?.key === key) return cached.info;
  let info: AtlasInfo | null = null;
  try {
    const { meta } = JSON.parse(await readFile(file, 'utf8')) as { meta?: Record<string, any> };
    if (meta) {
      info = {
        mode: String(meta.mode ?? 'sheet'),
        frameCount: Number(meta.frameCount ?? meta.itemCount ?? 1),
        frameWidth: Number(meta.frameWidth ?? meta.width ?? 0),
        frameHeight: Number(meta.frameHeight ?? meta.height ?? 0),
        fps: Number(meta.fps ?? 0),
        width: Number(meta.width ?? 0),
        height: Number(meta.height ?? 0),
        directions: Array.isArray(meta.directions) ? meta.directions.map(String) : [],
        eventCount: Array.isArray(meta.data?.events) ? meta.data.events.length : 0,
        role: text(meta.data?.role),
        part: text(meta.data?.part),
        label: text(meta.data?.label) ?? text(meta.data?.effect?.label) ?? text(meta.data?.item?.label),
        group: text(meta.data?.group),
        kind: text(meta.data?.effect?.kind) ?? text(meta.data?.item?.kind) ?? (meta.data?.role === 'ui' ? text(meta.data?.kind) : null),
        rarity: meta.data?.item && text(meta.data.item.rarity) ? { id: String(meta.data.item.rarity), label: text(meta.data.item.rarityLabel) ?? String(meta.data.item.rarity), color: text(meta.data.item.rarityColor) ?? '#9ca3af' } : null,
        stack: typeof meta.data?.item?.stack === 'number' ? meta.data.item.stack : null,
      };
    }
  } catch {
    info = null;
  }
  atlasCache.set(file, { key, info });
  return info;
}

// --- what a sheet reaches -------------------------------------------------------------------------------------------
// A sheet is a thin file: the drawing is in `src/`, often several imports deep (sheet -> character -> clips -> shared
// skins -> theme). Both the engine and the freshness of an export follow that whole chain.

interface ParsedFile {
  mtime: number;
  engines: Engine[];
  /** Relative import specifiers, as written. */
  specs: string[];
}

const IMPORT_RE = /(?:from|import)\s*['"]([^'"]+)['"]/g;

/** What a file imports, kept until the file changes (keyed by its modification time). */
const parsedFiles = new Map<string, ParsedFile>();

async function parseFile(file: string): Promise<ParsedFile | null> {
  let mtime: number;
  try {
    mtime = (await stat(file)).mtimeMs;
  } catch {
    return null;
  }
  const cached = parsedFiles.get(file);
  if (cached?.mtime === mtime) return cached;
  let code: string;
  try {
    code = await readFile(file, 'utf8');
  } catch {
    return null;
  }
  const engines = new Set<Engine>();
  const specs: string[] = [];
  for (const [, spec] of code.matchAll(IMPORT_RE)) {
    if (spec.startsWith('@core/rig')) engines.add('rig');
    else if (spec.startsWith('@core/volume')) engines.add('volume');
    else if (spec.startsWith('.')) specs.push(spec);
  }
  const parsed: ParsedFile = { mtime, engines: [...engines], specs };
  parsedFiles.set(file, parsed);
  return parsed;
}

/** The file a relative import points at, or undefined when it is not a local code file. */
function resolveLocal(base: string): string | undefined {
  const candidates = [`${base}.ts`, `${base}.js`, resolve(base, 'index.ts'), resolve(base, 'index.js')];
  // `./x.js` in a TypeScript source means `./x.ts`.
  if (/\.m?js$/.test(base)) candidates.unshift(base.replace(/\.m?js$/, '.ts'));
  return candidates.find((candidate) => existsSync(candidate));
}

interface SourceScan {
  engines: Set<Engine>;
  /** The newest mtime among the file and the local files it imports: any of them changes what gets exported. */
  newest: number;
}

/**
 * A reader of source files for one catalog build: every file is looked at once, however many sheets reach it,
 * and the chain of imports is followed to its end (a file is visited once per sheet, so cycles are harmless).
 */
function createSourceReader(): (entry: string) => Promise<SourceScan> {
  const nodes = new Map<string, Promise<{ parsed: ParsedFile; imports: string[] } | null>>();
  const load = (file: string) => {
    let node = nodes.get(file);
    if (!node) {
      node = parseFile(file).then((parsed) => {
        if (!parsed) return null;
        const imports = parsed.specs.flatMap((spec) => resolveLocal(resolve(dirname(file), spec)) ?? []);
        return { parsed, imports };
      });
      nodes.set(file, node);
    }
    return node;
  };

  return async (entry) => {
    const scan: SourceScan = { engines: new Set(), newest: 0 };
    const seen = new Set<string>();
    const pending = [entry];
    for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
      if (seen.has(file)) continue;
      seen.add(file);
      const node = await load(file);
      if (!node) continue;
      scan.newest = Math.max(scan.newest, node.parsed.mtime);
      node.parsed.engines.forEach((engine) => scan.engines.add(engine));
      pending.push(...node.imports);
    }
    return scan;
  };
}

/** A sheet that reaches both is a rig one: characters and gear are built from volumes. */
function pickEngine(engines: Set<Engine>): Engine | null {
  return engines.has('rig') ? 'rig' : engines.has('volume') ? 'volume' : null;
}

export async function buildAssetCatalog(repo: string): Promise<AssetFileMeta[]> {
  const assets: AssetFileMeta[] = [];
  const reach = createSourceReader();
  for (const { name: project, root, dir } of listProjects(repo)) {
    const assetsDir = join(dir, LAYOUT.assets);
    const sheetsDir = join(dir, LAYOUT.sheets);
    for (const subpath of walkFiles(assetsDir)) {
      if (!IMAGE_RE.test(subpath)) continue;
      const file = resolve(assetsDir, subpath);
      const ext = extname(file).toLowerCase().slice(1);
      const info = await stat(file);
      const base = subpath.replace(IMAGE_RE, '');

      const atlasPath = resolve(assetsDir, `${base}.json`);
      const atlas = existsSync(atlasPath) ? `${base}.json` : null;
      const atlasInfo = atlas ? await readAtlasInfo(atlasPath, `${info.mtimeMs}`) : null;

      const sheet = isSheetFile(`${base}.ts`) && existsSync(resolve(sheetsDir, `${base}.ts`)) ? `${base}.ts` : null;
      const scan = sheet ? await reach(resolve(sheetsDir, sheet)) : null;
      // A sheet that reaches neither engine (an interface piece drawn with core/ui.ts) has none.
      const engine = scan ? pickEngine(scan.engines) : null;

      const png = ext === 'png' ? await readPngSize(file).catch(() => null) : null;

      assets.push({
        project,
        root,
        subpath,
        filename: subpath.split('/').pop() ?? subpath,
        format: ext === 'jpg' ? 'jpeg' : ext,
        size: info.size,
        mtime: info.mtimeMs,
        url: `/${root}/${project}/${LAYOUT.assets}/${subpath}`,
        width: png?.width ?? atlasInfo?.width ?? null,
        height: png?.height ?? atlasInfo?.height ?? null,
        atlas,
        sheet,
        sourceMtime: scan?.newest || null,
        engine,
        atlasInfo,
      });
    }
  }
  return assets.sort((a, b) => a.project.localeCompare(b.project) || a.subpath.localeCompare(b.subpath));
}

const SCENE_EXPORT_RE = /export\s+const\s+SCENE\b/;

/** The scenes saved in a folder: the `.ts` files that export `SCENE`. Other helpers (a `map.ts` of functions) are not scenes. */
async function listScenes(dir: string): Promise<string[]> {
  const files = (await readdir(dir).catch(() => [] as string[])).filter((file) => isSheetFile(file));
  const scenes = await Promise.all(files.map(async (file) => (SCENE_EXPORT_RE.test(await readFile(resolve(dir, file), 'utf8').catch(() => '')) ? file.slice(0, -3) : null)));
  return scenes.filter((name): name is string => name !== null).sort();
}

export async function buildProjectCatalog(repo: string): Promise<ProjectMeta[]> {
  const projects: ProjectMeta[] = [];
  for (const { name, root, rel, dir } of listProjects(repo)) {
    const assetsDir = join(dir, LAYOUT.assets);
    const srcDir = join(dir, LAYOUT.src);
    const images = walkFiles(assetsDir).filter((file) => IMAGE_RE.test(file));
    // Every .ts under sheets/ is a sheet.
    const sheets = walkFiles(join(dir, LAYOUT.sheets)).filter(isSheetFile);
    const sizes = await Promise.all(images.map(async (file) => (await stat(resolve(assetsDir, file))).size));
    // An export lands at its sheet's own path, so a sheet is pending while no image sits at that path.
    const exported = new Set(images.map((file) => file.replace(IMAGE_RE, '')));
    const pendingSheets = sheets.filter((sheet) => !exported.has(sheet.replace(/\.ts$/, '')));
    projects.push({
      name,
      root,
      rel,
      hasStyle: existsSync(resolve(dir, 'STYLE.md')),
      assetCount: images.length,
      sheetCount: sheets.length,
      pendingSheets,
      hasGearKit: existsSync(resolve(srcDir, 'gear', 'catalog.ts')),
      hasSceneryKit: existsSync(resolve(srcDir, 'scenery', 'catalog.ts')),
      scenes: await listScenes(resolve(srcDir, 'scenes')),
      hasGame: existsSync(resolve(dir, LAYOUT.game, 'index.html')),
      totalSize: sizes.reduce((sum, n) => sum + n, 0),
    });
  }
  return projects;
}
