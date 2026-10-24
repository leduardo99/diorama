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
 * Machine-readable summary:
 *   npm run export -- my-game --json
 */

import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { resolve, relative, dirname, basename } from 'node:path';
import { readdir, stat, mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import pc from 'picocolors';
import { ALLOWED_CONFIG_KEYS, LAYOUT, REVIEW, availableProjects, findProject, isSheetFile } from './project.js';
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
}

const ALLOWED_FLAGS = [
  'grid', 'compact', 'gap', 'cols', 'sheet-name', 'out-dir', 'both', 'no-json',
  'scale', 'format', 'server', 'mockup', 'json', 'force', 'help',
];
const VALUE_OPTIONS = ['gap', 'cols', 'sheet-name', 'out-dir', 'scale', 'format', 'server'];

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
  --server=<url>       Use existing running dev server (default: auto-detected or 5173)
  --mockup             Review render (context.preview = true) into <project>/review/mockups/ (never touches assets/ or outDir)
  --json               Print a JSON summary on stdout (human logs go to stderr)
  --force              Export even when the project has type errors (skips the type check that runs first; for experiments)
  --help, -h           Show this help message
`);
}

/** Every sheet under `dir`: each `.ts` file is one (no naming convention; helper code lives in src/). */
async function findSheetFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && isSheetFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

async function isServerRunning(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.status === 200 || res.status === 404;
  } catch {
    return false;
  }
}

async function ensureServer(
  preferredUrl?: string
): Promise<{ origin: string; stop: () => Promise<void> }> {
  if (preferredUrl) {
    return { origin: preferredUrl.replace(/\/$/, ''), stop: async () => {} };
  }

  const defaultUrl = 'http://127.0.0.1:5173';
  if (await isServerRunning(defaultUrl)) {
    return { origin: defaultUrl, stop: async () => {} };
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

async function exportSingleAsset(
  browser: Browser,
  serverOrigin: string,
  task: AssetTask,
  assetsDir: string,
  args: CliArgs
): Promise<{
  outRelPath: string;
  outputPath: string;
  resLabel: string;
  size: string;
  elapsed: number;
  jsonRelPath?: string;
  frameList?: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  fps?: number;
}> {
  const taskStart = Date.now();
  const mockupParam = args.mockup ? '&preview=true' : '';
  const runnerUrl = `${serverOrigin}/tools/runner.html?project=${encodeURIComponent(
    task.project
  )}&dir=${encodeURIComponent(task.projectDir)}&file=${encodeURIComponent(task.sourceRelPath)}${mockupParam}`;

  const defaultScale = args.scale || 1;

  let context = await browser.newContext({
    deviceScaleFactor: defaultScale,
    viewport: { width: 800, height: 600 },
  });

  let page = await context.newPage();

  try {
    await page.goto(runnerUrl, { waitUntil: 'networkidle' });

    await page.waitForFunction(
      () => window.__ASSET_READY__ === true || window.__ASSET_ERROR__ !== null,
      null,
      { timeout: 15000 }
    );

    const assetError = await page.evaluate(() => window.__ASSET_ERROR__);
    if (assetError) {
      throw new Error(assetError);
    }

    let meta = await page.evaluate(() => window.__ASSET_METADATA__);
    if (!meta) {
      throw new Error('Failed to retrieve asset metadata from runner');
    }

    const declaredScale = meta.scale || 1;
    const finalScale = args.scale || declaredScale;

    if (finalScale !== defaultScale) {
      await page.close();
      await context.close();

      context = await browser.newContext({
        deviceScaleFactor: finalScale,
        viewport: {
          width: Math.max(100, Math.ceil(meta.width)),
          height: Math.max(100, Math.ceil(meta.height)),
        },
      });
      page = await context.newPage();
      await page.goto(runnerUrl, { waitUntil: 'networkidle' });

      await page.waitForFunction(
        () => window.__ASSET_READY__ === true || window.__ASSET_ERROR__ !== null,
        null,
        { timeout: 15000 }
      );

      meta = await page.evaluate(() => window.__ASSET_METADATA__);
    }

    const width = meta!.width;
    const height = meta!.height;
    const format = args.format || meta!.format || 'png';
    const quality = meta!.quality ?? 90;
    const background = meta!.background;
    const frameCount = meta!.frameCount ?? 1;
    const frameWidth = meta!.frameWidth ?? width;
    const frameHeight = meta!.frameHeight ?? height;
    const fps = meta!.fps ?? 5;
    const directionCount = meta!.directionCount ?? 1;
    const directionNames = meta!.directionNames ?? ['S'];

    // Validate named animations before anything is written, so a bad declaration leaves no output behind.
    for (const [animName, indices] of Object.entries(meta!.animations ?? {})) {
      if (!Array.isArray(indices) || indices.some(i => !Number.isInteger(i) || i < 0 || i >= frameCount)) {
        throw new Error(`animation "${animName}" must list frame indices from 0 to ${frameCount - 1}`);
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
    if (frameCount > 1 || directionCount > 1 || meta?.data) {
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
                  directionFacings: meta!.directionFacings,
                  directionOrder: 'row 0 faces the camera (S); each next row turns clockwise on screen',
                }
              : {}),
            ...(meta!.pivot
              ? { pivot: { x: Math.round(meta!.pivot.x * finalScale), y: Math.round(meta!.pivot.y * finalScale), logical: meta!.pivot } }
              : {}),
            ...(meta!.data ? { data: meta!.data } : {}),
            frameWidth: Math.round(frameWidth * finalScale),
            frameHeight: Math.round(frameHeight * finalScale),
            fps,
            width: width * finalScale,
            height: height * finalScale,
            scale: finalScale,
            format,
            image: `${basename(task.outRelBase)}.${ext}`,
            ...(meta!.animations ? { animations: meta!.animations } : {}),
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
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
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
  const runnerUrl = `${serverOrigin}/tools/sheet-runner.html?project=${encodeURIComponent(
    tasks[0].project
  )}&dir=${encodeURIComponent(tasks[0].projectDir)}&mode=${encodeURIComponent(sheetMode)}&gap=${encodeURIComponent(String(gap))}${colsParam}&files=${encodeURIComponent(
    JSON.stringify(files)
  )}${mockupParam}`;

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
    console.error(pc.red(`\nError: Project "${args.project}" was not found in projects/ or examples/.`));
    console.error(pc.yellow(availableProjects(rootDir)));
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

  const allSources = await findSheetFiles(sourceDir);
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

  const tasks: AssetTask[] = targetSources.map((file) => {
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

  const isSheetExport = Boolean(args.sheet);
  const sheetMode = args.sheet === 'compact' ? 'compact' : 'grid';

  console.log(
    `\n${pc.bold(pc.cyan('Diorama Export'))} [project: ${pc.bold(projectName)} (${ref.rel})] (${tasks.length} asset${tasks.length > 1 ? 's' : ''})` +
    (isSheetExport ? pc.magenta(` [SHEET: ${sheetMode.toUpperCase()}${args.gap ? `, gap: ${args.gap}px` : ''}${args.cols ? `, cols: ${args.cols}` : ''}]`) : '')
  );

  const startTime = Date.now();
  const report: {
    project: string;
    mode: 'official' | 'mockup';
    outputDir: string;
    /** The type check that runs first: `clean`, `failed` (nothing exported) or `skipped` (--force). */
    typeCheck: 'clean' | 'failed' | 'skipped';
    /** The project's type errors, in tsc's format (the check stops the export on them, unless --force). */
    typeErrors: string[];
    outputs: Array<{ asset: string; path: string; absolutePath: string; size: string; resolution: string; frames?: number; atlas?: string }>;
    errors: Array<{ asset: string; message: string }>;
  } = {
    project: projectName,
    mode: args.mockup ? 'mockup' : 'official',
    outputDir: relative(rootDir, assetsDir).replace(/\\/g, '/'),
    typeCheck: 'skipped',
    typeErrors: [],
    outputs: [],
    errors: [],
  };

  // Broken code must not produce sheets: the project's type check (the one of `npm run check`) runs first.
  if (args.force) {
    console.log(pc.yellow('  Type check skipped (--force).'));
  } else {
    const types = typeCheckProject(ref, rootDir);
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

    // 2. Export individual assets (when not sheet export, or when --both flag is passed)
    if (!isSheetExport || args.both) {
      for (const task of tasks) {
        let result;
        try {
          result = await exportSingleAsset(browser, server.origin, task, assetsDir, args);
        } catch (firstErr: any) {
          if (
            String(firstErr.message).includes('destroyed') ||
            String(firstErr.message).includes('navigation')
          ) {
            try {
              await new Promise((r) => setTimeout(r, 400));
              result = await exportSingleAsset(browser, server.origin, task, assetsDir, args);
            } catch (retryErr) {
              failCount++;
              report.errors.push({ asset: task.outRelBase, message: String(retryErr) });
              console.error(
                `  ${pc.red('✖')} ${pc.bold(task.outRelBase)} ` +
                pc.red(`FAILED: ${retryErr}`)
              );
              continue;
            }
          } else {
            failCount++;
            report.errors.push({ asset: task.outRelBase, message: String(firstErr.message || firstErr) });
            console.error(
              `  ${pc.red('✖')} ${pc.bold(task.outRelBase)} ` +
              pc.red(`FAILED: ${firstErr.message || firstErr}`)
            );
            continue;
          }
        }

        console.log(
          `  ${pc.green('✔')} ${pc.bold(result.outRelPath)} ` +
          pc.gray(`(${result.resLabel}, ${result.size}) `) +
          pc.dim(`${result.elapsed}ms`)
        );
        if (result.jsonRelPath) {
          console.log(`     ${pc.dim('↳ Atlas map:')} ${pc.cyan(result.jsonRelPath)}`);
        }
        if (effectiveOutDir && result) {
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
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    await server.stop();
  }

  if (tasks.length > 1 && !isSheetExport) {
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

declare global {
  interface Window {
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
