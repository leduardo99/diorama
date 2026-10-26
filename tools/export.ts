#!/usr/bin/env node
/**
 * Diorama - asset exporter.
 *
 * Renders the sheets of a project (every `.ts` file under <project>/sheets/: `defineAsset`, and the
 * volume, rig, scenery, effect, item and HUD assets built on it) in headless Chromium through
 * tools/runner.html, and writes each one into <project>/assets/ at the same path, as a PNG (or JPEG)
 * with its atlas JSON: frames across, directions down, pivot and `meta.data`. The project is found by
 * name in projects/, then examples/ (tools/project.ts).
 *
 * Usage:
 *   npm run export -- <project> [subpath...] [options]
 *
 * Single sheet or folder (paths under sheets/):
 *   npm run export -- my-game props/crate
 *   npm run export -- my-game characters/goblin/
 *
 * Group sheet (tools/sheet-runner.html):
 *   npm run export -- my-game icons/ --grid --gap=8
 *   npm run export -- my-game icons/ --compact --gap=12 --sheet-name=icons
 *
 * Review render (<project>/review/mockups/, never assets/; used by scenery-test):
 *   npm run export -- my-game props/crate --mockup
 *
 * Before rendering, the project's src/ and sheets/ are type checked (tools/typecheck.ts, the check of
 * `npm run check`): with a type error nothing is exported, unless --force (for experiments).
 *   npm run export -- my-game props/crate --force
 *
 * Sheets render side by side (--jobs, default defaultJobs()), each lane in pages it keeps open (RunnerLane):
 * a sheet's module is imported into a page that already has the engine loaded, instead of a page per sheet.
 * Only what changed (missing, or older than the sheet or a local file it imports; tools/freshness.ts):
 *   npm run export -- my-game --changed
 *
 * Machine-readable summary:
 *   npm run export -- my-game --json
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { resolve, relative, dirname, basename } from 'node:path';
import { stat, mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import pc from 'picocolors';
import { IMAGE_EXTENSIONS, isOutOfDate } from './freshness.js';
import { ALLOWED_CONFIG_KEYS, LAYOUT, REVIEW, findProject, isSheetFile, missingProject, walkFiles } from './project.js';
import { createSourceReader } from './sources.js';
import { serverOn } from './dev-server.js';
import { typeCheckProject } from './typecheck.js';

interface CliArgs {
  project?: string;
  subpath?: string;
  /** Every path filter given (`export -- <project> a/ b/c`); `subpath` is the first. */
  subpaths?: string[];
  scale?: number;
  format?: 'png' | 'jpeg';
  serverUrl?: string;
  help?: boolean;

  // Output directory mirroring (e.g. Godot project)
  outDir?: string;

  // Sheet / Group Export options:
  sheet?: 'grid' | 'compact';
  grid?: boolean;
  compact?: boolean;
  gap?: number;
  cols?: number;
  sheetName?: string;
  noJson?: boolean;
  both?: boolean;

  // Review render: context.preview = true, written into <project>/review/mockups/ (seam tests,
  // drafts). Never writes to assets/ and never mirrors to outDir.
  mockup?: boolean;

  // Machine-readable summary on stdout; human logs go to stderr.
  json?: boolean;

  // Export even when the project has type errors: skips the type check that runs first.
  force?: boolean;

  // Only the sheets whose image is missing or older than the sheet or a local file it imports (tools/freshness.ts).
  changed?: boolean;

  // How many sheets render at once (pages kept open side by side); default: defaultJobs().
  jobs?: number;
}

const ALLOWED_FLAGS = [
  'grid', 'compact', 'gap', 'cols', 'sheet-name', 'out-dir', 'both', 'no-json',
  'scale', 'format', 'server', 'mockup', 'json', 'force', 'changed', 'jobs', 'help',
];
const VALUE_OPTIONS = ['gap', 'cols', 'sheet-name', 'out-dir', 'scale', 'format', 'server', 'jobs'];

/** The default --jobs never goes past this: each lane is a page, and a large sheet holds a few hundred MB while it renders. */
const MAX_DEFAULT_JOBS = 6;

/**
 * The cores that do the work: the performance cores on Apple silicon (the efficiency ones render a sheet several
 * times slower, and the last sheet to finish sets the time), the physical cores on other Macs, and the logical
 * processors elsewhere.
 */
function performanceCores(): number {
  if (process.platform === 'darwin') {
    for (const key of ['hw.perflevel0.physicalcpu', 'hw.physicalcpu']) {
      try {
        const count = Number(execFileSync('sysctl', ['-n', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
        if (Number.isInteger(count) && count > 0) return count;
      } catch {
        // not this key on this Mac
      }
    }
  }
  return availableParallelism();
}

/** Sheets rendered at once by default: one per performance core, less one for the exporter, Vite and the browser. */
function defaultJobs(): number {
  return Math.max(1, Math.min(MAX_DEFAULT_JOBS, performanceCores() - 1));
}

interface AssetTask {
  /** The project's name (atlas `meta.project`). */
  project: string;
  /** The project folder from the repository root (`examples/soulkeeper`): where the runner imports the sheet from. */
  projectDir: string;
  sourceFullPath: string;
  sourceRelPath: string; // under sheets/, e.g. "icons/shield-badge.ts"
  outRelBase: string;    // e.g. "icons/shield-badge"
}

function parseArguments(): CliArgs {
  const rawArgs = process.argv.slice(2);
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    if (arg.startsWith('--')) {
      const [k, inline] = arg.slice(2).split(/=(.*)/s);
      if (!ALLOWED_FLAGS.includes(k)) {
        console.error(pc.red(`Error: unknown option "--${k}". Run with --help for the list.`));
        process.exit(1);
      }
      if (inline !== undefined) {
        flags[k] = inline;
      } else if (VALUE_OPTIONS.includes(k)) {
        // Accept "--gap 8" as well as "--gap=8".
        const next = rawArgs[i + 1];
        if (next === undefined || next.startsWith('--')) {
          console.error(pc.red(`Error: --${k} needs a value, for example --${k}=<value>.`));
          process.exit(1);
        }
        flags[k] = next;
        i++;
      } else {
        flags[k] = true;
      }
    } else if (arg.startsWith('-')) {
      console.error(pc.red(`Error: unknown option "${arg}". Run with --help for the list.`));
      process.exit(1);
    } else {
      positionals.push(arg);
    }
  }

  const gridFlag = Boolean(flags['grid']);
  const compactFlag = Boolean(flags['compact']);
  if (gridFlag && compactFlag) {
    console.error(pc.red('Error: use either --grid or --compact, not both.'));
    process.exit(1);
  }
  const sheetValue = compactFlag ? 'compact' : gridFlag ? 'grid' : undefined;

  const jobsValue = flags['jobs'] !== undefined ? Number(flags['jobs']) : undefined;
  if (jobsValue !== undefined && (!Number.isInteger(jobsValue) || jobsValue < 1)) {
    console.error(pc.red(`Error: --jobs must be a whole number of 1 or more, got "${flags['jobs']}".`));
    process.exit(1);
  }

  if (flags['changed'] && (gridFlag || compactFlag)) {
    console.error(pc.red('Error: --changed picks single sheets to export; it does not combine with --grid or --compact.'));
    process.exit(1);
  }

  const formatValue = flags['format'] !== undefined ? String(flags['format']) : undefined;
  if (formatValue !== undefined && formatValue !== 'png' && formatValue !== 'jpeg') {
    console.error(pc.red(`Error: --format must be "png" or "jpeg", got "${formatValue}".`));
    process.exit(1);
  }

  return {
    project: positionals[0],
    subpath: positionals[1],
    subpaths: positionals.slice(1),
    scale: flags['scale'] ? Number(flags['scale']) : undefined,
    format: formatValue as 'png' | 'jpeg' | undefined,
    serverUrl: flags['server'] ? String(flags['server']) : undefined,
    outDir: flags['out-dir'] ? String(flags['out-dir']) : undefined,
    sheet: sheetValue,
    grid: gridFlag,
    compact: compactFlag,
    gap: flags['gap'] !== undefined ? Number(flags['gap']) : undefined,
    cols: flags['cols'] !== undefined ? Number(flags['cols']) : undefined,
    sheetName: flags['sheet-name'] ? String(flags['sheet-name']) : undefined,
    noJson: Boolean(flags['no-json']),
    both: Boolean(flags['both']),
    mockup: Boolean(flags['mockup']),
    json: Boolean(flags['json']),
    force: Boolean(flags['force']),
    changed: Boolean(flags['changed']),
    jobs: jobsValue,
  };
}

function printHelp() {
  console.log(`
${pc.bold(pc.cyan('Diorama - Asset Exporter'))}

${pc.bold('Usage:')}
  npm run export -- <project> [subpath...] [options]
  Values can be written as --gap 8 or --gap=8. Use "npm run --silent" with --json.

${pc.bold('Assets:')}
  The project is found by name in projects/, then examples/ (or name one: examples/soulkeeper).
  Every .ts file under <project>/sheets/ is a sheet; each is written to <project>/assets/ at the same path.
  npm run export -- my-game                          # Export every sheet of the project
  npm run export -- my-game props/crate              # Export one sheet (sheets/props/crate.ts)
  npm run export -- my-game characters/goblin/       # Export every sheet in a folder
  npm run export -- my-game scenery/ props/          # Several folders or sheets at once

${pc.bold('Group sheets:')}
  npm run export -- my-game icons/ --grid           # One uniform cell grid of the folder's assets
  npm run export -- my-game icons/ --compact        # Packed tightly without overlap
  npm run export -- my-game icons/ --grid --gap=16  # Gap in pixels between items
  npm run export -- my-game icons/ --compact --sheet-name=icons  # Custom sheet name

${pc.bold('Type check:')}
  The project's src/ and sheets/ are type checked first (as npm run check does, about 2 s for the sample):
  with a type error nothing is exported and the errors are printed. --force skips the check.

${pc.bold('Speed:')}
  Sheets render side by side in pages that stay open: ${defaultJobs()} at a time here (one per performance core, less one);
  --jobs <n> sets it, and the output is the same with any number. The sample's 163 sheets take about 45 s on four
  performance cores.
  npm run export -- my-game --changed               # Only the sheets never exported, or older than their code
  --changed exports a sheet whose image is missing or older than the sheet or a local file it imports, however
  deep (the sheets the viewer marks as stale). The engine (core/) does not count: after changing it, export all.

${pc.bold('Frames and directions:')}
  \`frames\` (with \`fps\` and optional \`animations\`) lay out a strip across; \`directions\` add one row per
  facing (S first, then clockwise on screen). Sheets with more than one cell, or with \`data\`, get an
  atlas JSON next to the PNG: frames named <direction>_<n> (or frame_<n>), pivot, meta.data.
  Create one with: npm run new-asset -- <project> <subpath> --engine volume|rig (sheets/<subpath>.ts)

${pc.bold('Options:')}
  --grid               Export group into an emergent uniform grid (maxW x maxH cells, grows row first)
  --compact            Export group packed compactly without overlap (emergent rectangle bin packing)
  --gap=<px>           Minimum pixel spacing between assets (default: 0)
  --cols=<num>         Manual column count for grid (e.g. --cols=4 for 4-column walk animation strip)
  --sheet-name=<name>  Custom name for sheet file (default: <folder>-grid.png or <folder>-compact.png)
  --out-dir=<dir>      Mirror / copy exported files to external project directory (e.g. Godot res://assets)
  --both               Export both individual assets AND the combined sheet
  --no-json            Disable generating the companion atlas metadata JSON file
  --scale=<num>        Override device scale factor (e.g. 2 for 2x retina)
  --format=<png|jpeg>  Override target output format
  --server=<url>       Use this running dev server (default: this checkout's viewer on 5173 if it runs, else a server of its own)
  --mockup             Review render (context.preview = true) into <project>/review/mockups/ (never touches assets/ or outDir)
  --json               Print a JSON summary on stdout (human logs go to stderr)
  --force              Export even when the project has type errors (skips the type check that runs first; for experiments)
  --changed            Only the sheets never exported, or older than the sheet or a local file it imports
  --jobs=<n>           Sheets rendered at once (default: ${defaultJobs()} here, the performance cores less one; at most ${MAX_DEFAULT_JOBS} by default)
  --help, -h           Show this help message
`);
}

/**
 * Every sheet under `dir`: each `.ts` file is one (no naming convention; helper code lives in src/). Sorted by path,
 * so the summary lists them in one order however the parallel renders finish.
 */
function findSheetFiles(dir: string): string[] {
  return walkFiles(dir).filter(isSheetFile).map((rel) => resolve(dir, rel));
}

/**
 * The sheets `--changed` exports: those with no image at their path in `outputDir`, or with an image older than the
 * sheet or a local file it imports (the viewer's stale rule, tools/freshness.ts, with its second of slack).
 */
async function changedSheets(tasks: AssetTask[], outputDir: string): Promise<{ missing: AssetTask[]; stale: AssetTask[] }> {
  const reach = createSourceReader();
  const missing: AssetTask[] = [];
  const stale: AssetTask[] = [];
  for (const task of tasks) {
    const images = IMAGE_EXTENSIONS.map((ext) => resolve(outputDir, `${task.outRelBase}.${ext}`)).filter((file) => existsSync(file));
    if (images.length === 0) {
      missing.push(task);
      continue;
    }
    const { newest } = await reach(task.sourceFullPath);
    const mtimes = await Promise.all(images.map(async (file) => (await stat(file)).mtimeMs));
    if (mtimes.some((mtime) => isOutOfDate(newest, mtime))) stale.push(task);
  }
  return { missing, stale };
}

async function ensureServer(
  preferredUrl?: string
): Promise<{ origin: string; stop: () => Promise<void> }> {
  if (preferredUrl) {
    return { origin: preferredUrl.replace(/\/$/, ''), stop: async () => {} };
  }

  // Reuse the viewer's dev server only when it is this checkout's: whatever else answers on its port (another program,
  // or the viewer of another clone or an older tool) would render other code.
  const viewer = await serverOn(5173);
  if (viewer.kind === 'ours') return { origin: 'http://localhost:5173', stop: async () => {} };
  if (viewer.kind !== 'none') {
    const who = viewer.kind === 'diorama' ? `the viewer of another checkout (${viewer.root})` : 'another program';
    console.error(pc.dim(`  Port 5173 is ${who}: exporting with a server of its own.`));
  }

  const rootDir = resolve(process.cwd());
  const server: ViteDevServer = await createServer({
    root: rootDir,
    server: {
      port: 5199,
      host: '127.0.0.1',
      strictPort: false,
    },
    logLevel: 'silent',
  });

  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5199;
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    stop: async () => {
      await server.close();
    },
  };
}

async function formatFileSize(bytes: number): Promise<string> {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** A sheet's export, as the summary and the log print it. */
interface SingleResult {
  outRelPath: string;
  outputPath: string;
  resLabel: string;
  size: string;
  elapsed: number;
  jsonRelPath?: string;
  frameList?: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  fps?: number;
}

/**
 * The viewport a sheet renders in at the default scale; at any other scale it renders in a viewport of its own size.
 * Both are what the exporter used when it opened a page per sheet, so its output stays the same byte for byte.
 * The screenshot is taken after the viewport is resized to the sheet.
 */
const DEFAULT_VIEWPORT = { width: 800, height: 600 };
/** Importing a sheet (and, in a new page, the engine and the project's code it reaches). */
const DECLARE_TIMEOUT_MS = 30_000;
/** Rendering a sheet once it is imported. */
const RENDER_TIMEOUT_MS = 45_000;

/** The sheet itself failed: its module, its render or its declaration. Trying it again would fail the same way. */
class SheetError extends Error {}

/** A call into the page that did not come back in time: the page is closed, and the sheet is not tried again. */
class HungPageError extends Error {}

/**
 * The page went away under a call (Playwright's errors): closed, crashed, or reloaded, which Vite does when it
 * re-optimizes its dependencies. The sheet gets one more try in a fresh page.
 */
const isBrokenPage = (err: unknown) =>
  !(err instanceof SheetError) && !(err instanceof HungPageError) &&
  /Target (page, context or browser )?(has been )?closed|Target crashed|Page crashed|Execution context was destroyed|frame was detached|navigation/i.test(String((err as Error)?.message ?? err));

async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  promise.catch(() => {}); // the page is closed after a timeout, which rejects the call that hung
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HungPageError(`${what} timed out after ${ms / 1000} s`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** One open tools/runner.html at one device scale (a property of the browser context, so one context each). */
interface RunnerPage {
  scale: number;
  context: BrowserContext;
  page: Page;
}

/**
 * One export lane: it renders its sheets one after another in pages that stay open, one per device scale it meets,
 * instead of opening a page per sheet. Each lane has browser contexts of its own, so lanes never share a renderer.
 * After a failure the lane closes its pages; the next sheet opens fresh ones.
 */
class RunnerLane {
  private pages = new Map<number, Promise<RunnerPage>>();
  /** The scale of the last sheet: the page its next sheet is imported in first (a folder's sheets share one). */
  lastScale: number;

  constructor(private browser: Browser, private runnerUrl: string, defaultScale: number) {
    this.lastScale = defaultScale;
  }

  page(scale: number): Promise<RunnerPage> {
    let pending = this.pages.get(scale);
    if (!pending) {
      const opening = this.open(scale);
      opening.catch(() => {
        if (this.pages.get(scale) === opening) this.pages.delete(scale);
      });
      this.pages.set(scale, opening);
      pending = opening;
    }
    return pending;
  }

  private async open(scale: number): Promise<RunnerPage> {
    const context = await this.browser.newContext({ deviceScaleFactor: scale, viewport: DEFAULT_VIEWPORT });
    try {
      const page = await context.newPage();
      await page.goto(this.runnerUrl, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__ASSET_RUNNER__ !== undefined, null, { timeout: DECLARE_TIMEOUT_MS });
      return { scale, context, page };
    } catch (err) {
      await context.close().catch(() => {});
      throw err;
    }
  }

  async reset(): Promise<void> {
    const open = [...this.pages.values()];
    this.pages.clear();
    await Promise.all(open.map((pending) => pending.then((runner) => runner.context.close(), () => {}).catch(() => {})));
  }
}

async function exportSingleAsset(
  lane: RunnerLane,
  task: AssetTask,
  assetsDir: string,
  args: CliArgs
): Promise<SingleResult> {
  const taskStart = Date.now();
  const defaultScale = args.scale || 1;
  const sheet = { dir: task.projectDir, file: task.sourceRelPath };

  // 1. What the sheet declares (its scale and size), read in the page of the last sheet's scale.
  let runner = await lane.page(lane.lastScale);
  const declaredResult = await withTimeout(
    runner.page.evaluate((request) => window.__ASSET_RUNNER__!.declare(request), sheet),
    DECLARE_TIMEOUT_MS,
    'importing the sheet'
  );
  if (declaredResult.error !== undefined) throw new SheetError(declaredResult.error);
  const declared = declaredResult.declared!;

  // 2. Render at the device scale it exports at (a page of that scale), in the viewport of DEFAULT_VIEWPORT's rule.
  const finalScale = args.scale || declared.scale;
  if (finalScale !== runner.scale) runner = await lane.page(finalScale);
  lane.lastScale = finalScale;
  const page = runner.page;
  const sheetViewport = {
    width: Math.max(100, Math.ceil(declared.totalWidth)),
    height: Math.max(100, Math.ceil(declared.totalHeight)),
  };
  await page.setViewportSize(finalScale === defaultScale ? DEFAULT_VIEWPORT : sheetViewport);

  const rendered = await withTimeout(
    page.evaluate((request) => window.__ASSET_RUNNER__!.render(request), { project: task.project, ...sheet, preview: Boolean(args.mockup), scale: finalScale }),
    RENDER_TIMEOUT_MS,
    'rendering the sheet'
  );
  if (rendered.error !== undefined) throw new SheetError(rendered.error);
  const meta = rendered.metadata;
  if (!meta) {
    throw new SheetError('Failed to retrieve asset metadata from runner');
  }

  const width = meta.width;
  const height = meta.height;
  const format = args.format || meta.format || 'png';
  const quality = meta.quality ?? 90;
  const background = meta.background;
  const frameCount = meta.frameCount ?? 1;
  const frameWidth = meta.frameWidth ?? width;
  const frameHeight = meta.frameHeight ?? height;
  const fps = meta.fps ?? 5;
  const directionCount = meta.directionCount ?? 1;
  const directionNames = meta.directionNames ?? ['S'];

  // Validate named animations before anything is written, so a bad declaration leaves no output behind.
  for (const [animName, indices] of Object.entries(meta.animations ?? {})) {
    if (!Array.isArray(indices) || indices.some(i => !Number.isInteger(i) || i < 0 || i >= frameCount)) {
      throw new SheetError(`animation "${animName}" must list frame indices from 0 to ${frameCount - 1}`);
    }
  }

  await page.setViewportSize({
    width: Math.max(100, Math.ceil(width)),
    height: Math.max(100, Math.ceil(height)),
  });

  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const outputPath = resolve(assetsDir, `${task.outRelBase}.${ext}`);
  await mkdir(dirname(outputPath), { recursive: true });

  const rootHandle = page.locator('#asset-root');
  await rootHandle.screenshot({
    path: outputPath,
    type: format === 'jpeg' ? 'jpeg' : 'png',
    quality: format === 'jpeg' ? quality : undefined,
    omitBackground: background === 'transparent',
    scale: 'device',
  });

  let jsonRelPath: string | undefined;
  const frameList: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];

  // Multi-frame strips, multi-direction sheets and assets that carry `data` (a scene's layout, a
  // piece's catalog entry) get a companion JSON atlas map.
  // With directions, rows are directions and frames are named "<direction>_<frame>" ("SW_3").
  if (frameCount > 1 || directionCount > 1 || meta.data) {
    const frames: Record<string, any> = {};
    for (let d = 0; d < directionCount; d++)
    for (let f = 0; f < frameCount; f++) {
      const frameName = directionCount > 1 ? `${directionNames[d]}_${f}` : `frame_${f}`;
      const physX = Math.round(f * frameWidth * finalScale);
      const physY = Math.round(d * frameHeight * finalScale);
      const physW = Math.round(frameWidth * finalScale);
      const physH = Math.round(frameHeight * finalScale);

      frames[frameName] = {
        x: physX,
        y: physY,
        width: physW,
        height: physH,
        logical: {
          x: f * frameWidth,
          y: d * frameHeight,
          width: frameWidth,
          height: frameHeight,
        },
        ...(directionCount > 1 ? { direction: directionNames[d], frame: f } : {}),
      };

      frameList.push({
        id: frameName,
        x: physX,
        y: physY,
        width: physW,
        height: physH,
      });
    }

    if (!args.noJson) {
      const jsonOutputPath = resolve(assetsDir, `${task.outRelBase}.json`);
      const atlasPayload = {
        meta: {
          project: task.project,
          mode: directionCount > 1 ? 'directions' : 'strip',
          frameCount,
          ...(directionCount > 1
            ? {
                directions: directionNames,
                directionFacings: meta.directionFacings,
                directionOrder: 'row 0 faces the camera (S); each next row turns clockwise on screen',
              }
            : {}),
          ...(meta.pivot
            ? { pivot: { x: Math.round(meta.pivot.x * finalScale), y: Math.round(meta.pivot.y * finalScale), logical: meta.pivot } }
            : {}),
          ...(meta.data ? { data: meta.data } : {}),
          frameWidth: Math.round(frameWidth * finalScale),
          frameHeight: Math.round(frameHeight * finalScale),
          fps,
          width: width * finalScale,
          height: height * finalScale,
          scale: finalScale,
          format,
          image: `${basename(task.outRelBase)}.${ext}`,
          ...(meta.animations ? { animations: meta.animations } : {}),
        },
        frames,
      };
      await writeFile(jsonOutputPath, JSON.stringify(atlasPayload, null, 2), 'utf-8');
      jsonRelPath = relative(assetsDir, jsonOutputPath).replace(/\\/g, '/');
    }
  }

  const fileStats = await stat(outputPath);
  const formattedSize = await formatFileSize(fileStats.size);
  const elapsed = Date.now() - taskStart;
  const scaleLabel = finalScale !== 1 ? ` @${finalScale}x` : '';
  const sheetParts = [frameCount > 1 ? `${frameCount} frames` : '', directionCount > 1 ? `${directionCount} directions` : ''].filter(Boolean);
  const resLabel = `${width * finalScale}x${height * finalScale}${scaleLabel}${sheetParts.length ? ` (${sheetParts.join(', ')})` : ''}`;

  return {
    outRelPath: `${task.outRelBase}.${ext}`,
    outputPath,
    resLabel,
    size: formattedSize,
    elapsed,
    jsonRelPath,
    frameList: frameList.length > 0 ? frameList : undefined,
    fps,
  };
}

async function exportGroupSheet(
  browser: Browser,
  serverOrigin: string,
  tasks: AssetTask[],
  assetsDir: string,
  args: CliArgs,
  sheetMode: 'grid' | 'compact'
): Promise<{
  outRelPath: string;
  outputPath: string;
  resLabel: string;
  size: string;
  elapsed: number;
  jsonRelPath?: string;
  frameList?: Array<{ id: string; x: number; y: number; width: number; height: number }>;
}> {
  const taskStart = Date.now();
  const gap = args.gap ?? 0;
  const scale = args.scale ?? 1;
  const format = args.format ?? 'png';
  const ext = format === 'jpeg' ? 'jpg' : 'png';

  const files = tasks.map((t) => t.sourceRelPath);

  // Derive output directory and sheet name
  let targetDir = assetsDir;
  let defaultBaseName = 'sheet';

  if (args.subpath) {
    const cleanSub = args.subpath.replace(/\\/g, '/').replace(/^\//, '').replace(/\/+$/, '');
    const parts = cleanSub.split('/');
    targetDir = resolve(assetsDir, cleanSub);
    const folderName = parts[parts.length - 1];
    defaultBaseName = `${folderName}-${sheetMode}`;
  } else {
    defaultBaseName = `sheet-${sheetMode}`;
  }

  const sheetBase = args.sheetName
    ? args.sheetName.replace(/\.(png|jpe?g)$/i, '')
    : defaultBaseName;

  const imageOutputPath = resolve(targetDir, `${sheetBase}.${ext}`);
  const jsonOutputPath = resolve(targetDir, `${sheetBase}.json`);
  await mkdir(targetDir, { recursive: true });

  const mockupParam = args.mockup ? '&preview=true' : '';
  const colsParam = args.cols ? `&cols=${encodeURIComponent(String(args.cols))}` : '';
  const scaleParam = `&scale=${encodeURIComponent(String(scale))}`;
  const runnerUrl = `${serverOrigin}/tools/sheet-runner.html?project=${encodeURIComponent(
    tasks[0].project
  )}&dir=${encodeURIComponent(tasks[0].projectDir)}&mode=${encodeURIComponent(sheetMode)}&gap=${encodeURIComponent(String(gap))}${colsParam}&files=${encodeURIComponent(
    JSON.stringify(files)
  )}${mockupParam}${scaleParam}`;

  const context = await browser.newContext({
    deviceScaleFactor: scale,
    viewport: { width: 1200, height: 1200 },
  });

  const page = await context.newPage();

  try {
    await page.goto(runnerUrl, { waitUntil: 'networkidle' });

    await page.waitForFunction(
      () => window.__SHEET_READY__ === true || window.__SHEET_ERROR__ !== null,
      null,
      { timeout: 25000 }
    );

    const sheetError = await page.evaluate(() => window.__SHEET_ERROR__);
    if (sheetError) {
      throw new Error(sheetError);
    }

    const meta = await page.evaluate(() => window.__SHEET_METADATA__);
    if (!meta) {
      throw new Error('Failed to retrieve sheet metadata from runner');
    }

    const totalW = meta.width;
    const totalH = meta.height;

    await page.setViewportSize({
      width: Math.max(100, Math.ceil(totalW)),
      height: Math.max(100, Math.ceil(totalH)),
    });

    const rootHandle = page.locator('#sheet-root');
    await rootHandle.screenshot({
      path: imageOutputPath,
      type: format === 'jpeg' ? 'jpeg' : 'png',
      omitBackground: format !== 'jpeg',
      scale: 'device',
    });

    let jsonRelPath: string | undefined;

    const frames: Record<string, any> = {};
    const frameList: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];

    for (const [name, f] of Object.entries(meta.frames as Record<string, any>)) {
      const physX = Math.round(f.x * scale);
      const physY = Math.round(f.y * scale);
      const physW = Math.round(f.width * scale);
      const physH = Math.round(f.height * scale);

      frames[name] = {
        x: physX,
        y: physY,
        width: physW,
        height: physH,
        logical: {
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
        },
      };

      frameList.push({
        id: name,
        x: physX,
        y: physY,
        width: physW,
        height: physH,
      });
    }

    // Save companion atlas JSON metadata unless --no-json is requested
    if (!args.noJson) {
      const atlasPayload = {
        meta: {
          project: tasks[0].project,
          mode: sheetMode,
          itemCount: tasks.length,
          gap,
          cols: meta.cols,
          rows: meta.rows,
          width: totalW * scale,
          height: totalH * scale,
          scale,
          format,
          image: `${sheetBase}.${ext}`,
        },
        frames,
      };

      await writeFile(jsonOutputPath, JSON.stringify(atlasPayload, null, 2), 'utf-8');
      jsonRelPath = relative(assetsDir, jsonOutputPath).replace(/\\/g, '/');
    }

    const fileStats = await stat(imageOutputPath);
    const formattedSize = await formatFileSize(fileStats.size);
    const elapsed = Date.now() - taskStart;
    const scaleLabel = scale !== 1 ? ` @${scale}x` : '';
    const resLabel = `${totalW * scale}x${totalH * scale}${scaleLabel}`;
    const outRelPath = relative(assetsDir, imageOutputPath).replace(/\\/g, '/');

    return {
      outRelPath,
      outputPath: imageOutputPath,
      resLabel,
      size: formattedSize,
      elapsed,
      jsonRelPath,
      frameList,
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function main() {
  const args = parseArguments();

  if (args.help || !args.project) {
    printHelp();
    if (!args.project && !args.help) {
      console.error(pc.red('Error: Project name is required. Example: npm run export -- my-project\n'));
      process.exit(1);
    }
    return;
  }

  if (args.json) {
    // Keep stdout clean for the JSON summary: human logs go to stderr.
    console.log = console.error;
  }

  const rootDir = resolve(process.cwd());
  const ref = findProject(args.project, rootDir);
  if (!ref) {
    // `projects/<name>` (what the viewer runs) is answered with projects/ alone: the viewer has no samples to offer.
    const { message, hint } = missingProject(args.project, rootDir);
    console.error(pc.red(`\nError: ${message[0].toUpperCase()}${message.slice(1)}`));
    console.error(pc.yellow(hint));
    process.exit(1);
  }
  const projectName = ref.name;
  const projectDir = ref.dir;
  const sourceDir = resolve(projectDir, LAYOUT.sheets);
  // Review renders never share a folder with official outputs.
  const assetsDir = args.mockup ? resolve(projectDir, LAYOUT.review, REVIEW.mockups) : resolve(projectDir, LAYOUT.assets);

  // Load optional diorama.config.json from projectDir
  const configFile = resolve(projectDir, 'diorama.config.json');
  let projectConfig: Record<string, any> = {};
  if (existsSync(configFile)) {
    try {
      projectConfig = JSON.parse(await readFile(configFile, 'utf-8'));
    } catch (e: any) {
      console.warn(pc.yellow(`Warning: Could not parse ${configFile}: ${e.message}`));
    }
  }

  const unknownKeys = Object.keys(projectConfig).filter((k) => !(ALLOWED_CONFIG_KEYS as readonly string[]).includes(k));
  if (unknownKeys.length > 0) {
    console.error(
      pc.red(`Error: ${configFile} has unknown keys: ${unknownKeys.join(', ')}. Allowed: ${ALLOWED_CONFIG_KEYS.join(', ')}.`)
    );
    process.exit(1);
  }

  // Review renders never mirror to an external folder: they are not game assets.
  const effectiveOutDir = args.mockup ? undefined : (args.outDir || projectConfig.outDir);
  if (!args.scale && projectConfig.scale) {
    args.scale = Number(projectConfig.scale);
  }
  if (!args.format && projectConfig.format) {
    args.format = projectConfig.format;
  }
  if (!args.cols && projectConfig.cols) {
    args.cols = Number(projectConfig.cols);
  }
  if (args.gap === undefined && projectConfig.gap !== undefined) {
    args.gap = Number(projectConfig.gap);
  }

  if (!existsSync(sourceDir)) {
    console.error(pc.red(`\nError: Project "${projectName}" (${ref.rel}) has no "sheets/" directory: every exported sheet is a file there (npm run new-asset -- ${projectName} <subpath>).`));
    process.exit(1);
  }

  const allSources = findSheetFiles(sourceDir);
  if (allSources.length === 0) {
    console.log(pc.yellow(`\nNo sheets found in ${ref.rel}/sheets/`));
    return;
  }

  let targetSources = allSources;
  if (args.subpath) {
    const filters = (args.subpaths?.length ? args.subpaths : [args.subpath]).map((raw) => {
      const rawFilter = raw
        .replace(/\\/g, '/')
        .replace(/^\//, '')
        .replace(/\/+$/, '')
        .replace(/\.(ts|js)$/, '');
      return rawFilter.startsWith('sheets/') ? rawFilter.slice('sheets/'.length) : rawFilter;
    });

    targetSources = allSources.filter((file) => {
      const rel = relative(sourceDir, file).replace(/\\/g, '/').replace(/\.(ts|js)$/, '');
      return filters.some((f) => rel === f || rel.startsWith(f + '/'));
    });

    const unmatched = filters.filter((f) => !allSources.some((file) => {
      const rel = relative(sourceDir, file).replace(/\\/g, '/').replace(/\.(ts|js)$/, '');
      return rel === f || rel.startsWith(f + '/');
    }));
    if (unmatched.length && targetSources.length) {
      console.warn(pc.yellow(`No assets match: ${unmatched.join(', ')}`));
    }

    if (targetSources.length === 0) {
      console.error(
        pc.red(`\nNo sheets matching filter "${filters.join('", "')}" in project "${projectName}" (${ref.rel}/sheets/).`)
      );
      console.log(pc.gray('Available sheets:'));
      for (const f of allSources) {
        console.log(`  - ${relative(sourceDir, f).replace(/\\/g, '/')}`);
      }
      process.exit(1);
    }
  }

  const selected: AssetTask[] = targetSources.map((file) => {
    const rel = relative(sourceDir, file).replace(/\\/g, '/');
    const relBase = rel.replace(/\.(ts|js)$/, '');
    return {
      project: projectName,
      projectDir: ref.rel,
      sourceFullPath: file,
      sourceRelPath: rel,
      outRelBase: relBase,
    };
  });

  // --changed keeps the sheets whose image is missing or out of date; the others are left as they are.
  const changed = args.changed ? await changedSheets(selected, assetsDir) : undefined;
  const pick = changed ? new Set([...changed.missing, ...changed.stale]) : undefined;
  const tasks = pick ? selected.filter((task) => pick.has(task)) : selected;

  const isSheetExport = Boolean(args.sheet);
  const sheetMode = args.sheet === 'compact' ? 'compact' : 'grid';
  const jobs = Math.max(1, Math.min(args.jobs ?? defaultJobs(), tasks.length));

  console.log(
    `\n${pc.bold(pc.cyan('Diorama Export'))} [project: ${pc.bold(projectName)} (${ref.rel})] (${tasks.length} asset${tasks.length === 1 ? '' : 's'})` +
    (isSheetExport ? pc.magenta(` [SHEET: ${sheetMode.toUpperCase()}${args.gap ? `, gap: ${args.gap}px` : ''}${args.cols ? `, cols: ${args.cols}` : ''}]`) : '') +
    (!isSheetExport && tasks.length > 1 ? pc.gray(` [${jobs} at a time]`) : '')
  );
  if (changed) {
    const upToDate = selected.length - tasks.length;
    console.log(pc.gray(`  --changed: ${changed.missing.length} never exported, ${changed.stale.length} older than their code, ${upToDate} up to date (of ${selected.length}).`));
  }

  const startTime = Date.now();
  const report: {
    project: string;
    mode: 'official' | 'mockup';
    outputDir: string;
    /** The type check that runs first: `clean`, `failed` (nothing exported) or `skipped` (--force, or --changed with nothing to export). */
    typeCheck: 'clean' | 'failed' | 'skipped';
    /** The project's type errors, in tsc's format (the check stops the export on them, unless --force). */
    typeErrors: string[];
    /** With --changed: the sheets left out because their image is newer than their code. */
    upToDate?: number;
    outputs: Array<{ asset: string; path: string; absolutePath: string; size: string; resolution: string; frames?: number; atlas?: string }>;
    errors: Array<{ asset: string; message: string }>;
  } = {
    project: projectName,
    mode: args.mockup ? 'mockup' : 'official',
    outputDir: relative(rootDir, assetsDir).replace(/\\/g, '/'),
    typeCheck: 'skipped',
    typeErrors: [],
    ...(changed ? { upToDate: selected.length - tasks.length } : {}),
    outputs: [],
    errors: [],
  };

  // Nothing to export: no type check, no browser.
  if (tasks.length === 0) {
    console.log(pc.green(`  Up to date: every sheet's image is newer than its code. Nothing exported.`));
    if (args.json) process.stdout.write(JSON.stringify({ ...report, successCount: 0, failCount: 0 }, null, 2) + '\n');
    return;
  }

  // Broken code must not produce sheets: the project's type check (the one of `npm run check`) runs first.
  if (args.force) {
    console.log(pc.yellow('  Type check skipped (--force).'));
  } else {
    const types = typeCheckProject(ref, rootDir, { game: false });
    report.typeErrors = types.projectErrors;
    report.typeCheck = types.projectErrors.length ? 'failed' : 'clean';
    if (types.projectErrors.length) {
      console.error(pc.red(`\nError: ${projectName} has ${types.projectErrors.length} type error(s), so nothing was exported:`));
      for (const line of types.projectErrors) console.error(`  ${line}`);
      console.error(pc.yellow(`Fix them (npm run check -- ${projectName} lists them with the layout rules), or pass --force to export anyway.`));
      if (args.json) process.stdout.write(JSON.stringify({ ...report, successCount: 0, failCount: 0 }, null, 2) + '\n');
      process.exit(1);
    }
    const others = types.otherErrors.length ? pc.yellow(`; ${types.otherErrors.length} outside the project, in the engine files it imports`) : '';
    console.log(pc.gray(`  Type check: clean (${(types.ms / 1000).toFixed(1)}s)`) + others);
  }

  const server = await ensureServer(args.serverUrl);

  let browser: Browser | null = null;
  let successCount = 0;
  let failCount = 0;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--enable-webgl', '--font-render-hinting=medium'],
    });

    // 1. Export group sheet if requested
    if (isSheetExport) {
      try {
        const sheetResult = await exportGroupSheet(
          browser,
          server.origin,
          tasks,
          assetsDir,
          args,
          sheetMode
        );

        console.log(
          `  ${pc.green('✔')} ${pc.bold(sheetResult.outRelPath)} ` +
          pc.gray(`(${sheetResult.resLabel}, ${tasks.length} assets, ${sheetResult.size}) `) +
          pc.dim(`${sheetResult.elapsed}ms`)
        );
        if (sheetResult.jsonRelPath) {
          console.log(`     ${pc.dim('↳ Atlas map:')} ${pc.cyan(sheetResult.jsonRelPath)}`);
        }
        if (effectiveOutDir) {
          const mirrorImg = resolve(rootDir, effectiveOutDir, relative(assetsDir, sheetResult.outputPath));
          await mkdir(dirname(mirrorImg), { recursive: true });
          await copyFile(sheetResult.outputPath, mirrorImg);
          if (sheetResult.jsonRelPath) {
            const srcJson = resolve(assetsDir, sheetResult.jsonRelPath);
            const mirrorJson = resolve(rootDir, effectiveOutDir, sheetResult.jsonRelPath);
            await copyFile(srcJson, mirrorJson);
          }
          console.log(`     ${pc.magenta('↳ Mirror synced:')} ${relative(rootDir, mirrorImg).replace(/\\/g, '/')}`);
        }
        console.log(
          `     ${pc.cyan('↳ Open to review:')} "${sheetResult.outputPath.replace(/\\/g, '/')}"`
        );
        report.outputs.push({
          asset: `${sheetResult.outRelPath}`,
          path: relative(rootDir, sheetResult.outputPath).replace(/\\/g, '/'),
          absolutePath: sheetResult.outputPath.replace(/\\/g, '/'),
          size: sheetResult.size,
          resolution: sheetResult.resLabel,
          atlas: sheetResult.jsonRelPath,
        });
        successCount++;
      } catch (err: any) {
        failCount++;
        report.errors.push({ asset: 'sheet', message: String(err.message || err) });
        console.error(
          `  ${pc.red('✖')} Sheet Export Failed: ${err.message || err}`
        );
      }
    }

    // 2. Export individual assets (when not sheet export, or when --both flag is passed): `jobs` lanes take the next
    // sheet off one queue, each in pages it keeps open. Lines print as sheets finish; the summary keeps the sheets' order.
    if (!isSheetExport || args.both) {
      const runnerUrl = `${server.origin}/tools/runner.html`;
      const lanes = Array.from({ length: jobs }, () => new RunnerLane(browser!, runnerUrl, args.scale || 1));
      const outcomes: Array<{ result: SingleResult } | { error: string }> = new Array(tasks.length);
      let next = 0;

      const exportOne = async (lane: RunnerLane, task: AssetTask): Promise<SingleResult> => {
        try {
          return await exportSingleAsset(lane, task, assetsDir, args);
        } catch (firstErr) {
          // Any failure closes the lane's pages, since a failed render may leave the engine's state half-way: the next
          // sheet opens fresh ones. A page that broke under the sheet (closed, crashed, reloaded by Vite) gets it one more try.
          await lane.reset();
          if (!isBrokenPage(firstErr)) throw firstErr;
          console.log(pc.dim(`  ↻ ${task.outRelBase}: the page broke (${String((firstErr as Error)?.message ?? firstErr).split('\n')[0]}); trying again in a fresh one`));
          await new Promise((r) => setTimeout(r, 400));
          try {
            return await exportSingleAsset(lane, task, assetsDir, args);
          } catch (retryErr) {
            await lane.reset();
            throw retryErr;
          }
        }
      };

      const printResult = async (result: SingleResult) => {
        console.log(
          `  ${pc.green('✔')} ${pc.bold(result.outRelPath)} ` +
          pc.gray(`(${result.resLabel}, ${result.size}) `) +
          pc.dim(`${result.elapsed}ms`)
        );
        if (result.jsonRelPath) {
          console.log(`     ${pc.dim('↳ Atlas map:')} ${pc.cyan(result.jsonRelPath)}`);
        }
        if (effectiveOutDir) {
          const mirrorPath = resolve(rootDir, effectiveOutDir, relative(assetsDir, result.outputPath));
          await mkdir(dirname(mirrorPath), { recursive: true });
          await copyFile(result.outputPath, mirrorPath);
          if (result.jsonRelPath) {
            const srcJson = resolve(assetsDir, result.jsonRelPath);
            const mirrorJson = resolve(rootDir, effectiveOutDir, result.jsonRelPath);
            await copyFile(srcJson, mirrorJson);
          }
          console.log(`     ${pc.magenta('↳ Mirror synced:')} ${relative(rootDir, mirrorPath).replace(/\\/g, '/')}`);
        }
        console.log(
          `     ${pc.cyan('↳ Open to review:')} "${result.outputPath.replace(/\\/g, '/')}"`
        );
      };

      await Promise.all(lanes.map(async (lane) => {
        try {
          for (let index = next++; index < tasks.length; index = next++) {
            const task = tasks[index];
            try {
              const result = await exportOne(lane, task);
              await printResult(result);
              outcomes[index] = { result };
            } catch (err: any) {
              const message = String(err?.message || err);
              outcomes[index] = { error: message };
              console.error(
                `  ${pc.red('✖')} ${pc.bold(task.outRelBase)} ` +
                pc.red(`FAILED: ${message}`)
              );
            }
          }
        } finally {
          await lane.reset();
        }
      }));

      tasks.forEach((task, index) => {
        const outcome = outcomes[index];
        if ('error' in outcome) {
          failCount++;
          report.errors.push({ asset: task.outRelBase, message: outcome.error });
          return;
        }
        const { result } = outcome;
        report.outputs.push({
          asset: task.outRelBase,
          path: relative(rootDir, result.outputPath).replace(/\\/g, '/'),
          absolutePath: result.outputPath.replace(/\\/g, '/'),
          size: result.size,
          resolution: result.resLabel,
          frames: result.frameList?.length,
          atlas: result.jsonRelPath,
        });
        successCount++;
      });
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    await server.stop();
  }

  // The tip is for a person at a terminal: a program that reads the output through a pipe (the viewer, whose New dialog
  // has its own Output select) never shows it.
  if (tasks.length > 1 && !isSheetExport && process.stdout.isTTY) {
    console.log(
      pc.dim(`  Tip: Combine into an atlas/sheet using --grid or --compact (e.g. npm run export -- ${args.project}${args.subpath ? ` ${args.subpath}` : ''} --grid --gap=8)`)
    );
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `\n${pc.bold('Summary:')} ${pc.green(`${successCount} output${successCount > 1 ? 's' : ''}`)}, ` +
    (failCount > 0 ? pc.red(`${failCount} failed`) : pc.gray('0 failed')) +
    pc.dim(` in ${totalTime}s\n`)
  );

  if (args.json) {
    process.stdout.write(JSON.stringify({ ...report, successCount, failCount }, null, 2) + '\n');
  }

  if (failCount > 0) {
    process.exit(1);
  }
}

/** What tools/runner.html reads from a sheet before it renders it: the cell, the frames and directions, the scale. */
interface DeclaredSize {
  width: number;
  height: number;
  scale: number;
  frameCount: number;
  directionCount: number;
  totalWidth: number;
  totalHeight: number;
}

declare global {
  interface Window {
    /** The calls of tools/runner.html, made once per sheet in a page that stays open. */
    __ASSET_RUNNER__?: {
      declare(request: { dir: string; file: string }): Promise<{ declared?: DeclaredSize; error?: string }>;
      render(request: { project: string; dir: string; file: string; preview: boolean; scale: number }): Promise<{ metadata?: NonNullable<Window['__ASSET_METADATA__']>; error?: string }>;
    };
    __ASSET_READY__?: boolean;
    __ASSET_ERROR__?: string | null;
    __ASSET_METADATA__?: {
      width: number;
      height: number;
      format: 'png' | 'jpeg';
      quality: number;
      scale: number;
      background: string;
      name?: string;
      frameCount?: number;
      frameWidth?: number;
      frameHeight?: number;
      fps?: number;
      animations?: Record<string, number[]> | null;
      directionCount?: number;
      directionNames?: string[];
      directionFacings?: number[];
      pivot?: { x: number; y: number } | null;
      data?: Record<string, unknown> | null;
    } | null;

    __SHEET_READY__?: boolean;
    __SHEET_ERROR__?: string | null;
    __SHEET_METADATA__?: {
      width: number;
      height: number;
      cols?: number;
      rows?: number;
      gap: number;
      mode: 'grid' | 'compact';
      frames: Record<string, { x: number; y: number; width: number; height: number }>;
    } | null;
  }
}

main().catch((err) => {
  console.error(pc.red(`Fatal export error: ${err.stack || err.message || err}`));
  process.exit(1);
});
