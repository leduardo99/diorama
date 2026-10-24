/**
 * Diorama - what a sheet reaches. A sheet is a thin file: the drawing is in `src/`, often several imports deep
 * (sheet -> character -> clips -> shared skins -> theme). Both the engine of an export and its freshness follow
 * that whole chain. Shared by the viewer's catalog (`viewer/server/catalog.ts`) and `npm run export -- --changed`;
 * the rule for "out of date" is in `tools/freshness.ts`.
 *
 * Only relative imports are followed, so the engine (`@core/...`) and npm packages do not count: after a change to
 * core/, export everything.
 */

import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/** Which engine draws a sheet: `@core/volume` (props, scenery, effects) or `@core/rig` (characters, gear, items). */
export type Engine = 'volume' | 'rig';

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

export interface SourceScan {
  engines: Set<Engine>;
  /** The newest mtime among the file and the local files it imports: any of them changes what gets exported. */
  newest: number;
}

/**
 * A reader of source files for one pass over many sheets (a catalog build, an export): every file is looked at
 * once, however many sheets reach it, and the chain of imports is followed to its end (a file is visited once per
 * sheet, so cycles are harmless).
 */
export function createSourceReader(): (entry: string) => Promise<SourceScan> {
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
